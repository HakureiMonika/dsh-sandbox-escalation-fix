import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { escalationHintMarker, sandboxDenialMarker } from '@deepseek-ai/dsh-sandbox'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { PostToolDecision, ToolDefinition, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { normalizeEscalationArguments } from './argument-normalization.ts'
import { validateTargetTool } from './compatibility.ts'
import { projectEscalationDescription } from './description-projection.ts'
import { escalationPolicyFor } from './policy.ts'
import { cleanSingleTextContent, removeEscalationHint } from './result-filter.ts'
import { projectEscalationParameters } from './schema-projection.ts'
import { protocolOf } from './wrapper-protocol.ts'
import type { WrapperLayer } from './wrapper-protocol.ts'
import { createWrapperBinding, PLUGIN_OWNER } from './wrapper.ts'
import type { WrapperBinding } from './wrapper.ts'

const TARGET_TOOLS = ['bash', 'pwsh', 'write', 'edit'] as const
type TargetToolName = typeof TARGET_TOOLS[number]

interface AgentState {
  readonly agent: Agent
  readonly targets: Map<TargetToolName, TargetState>
  readonly disposers: Array<() => unknown>
  disposed: boolean
}

interface TargetState {
  readonly name: TargetToolName
  binding?: WrapperBinding
  attachment: TargetAttachment
  lastReportedError?: string
}

type TargetAttachment =
  | { readonly kind: 'dormant' }
  | { readonly kind: 'owned'; readonly unregister: () => unknown }
  | { readonly kind: 'cooperative'; readonly release: () => void }
  | { readonly kind: 'incompatible'; readonly reason: string }

declare module '@deepseek-ai/cordis' {
  interface Events {
    'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void
  }
}

function visibleDelegate(ctx: Context, agent: Agent, name: TargetToolName): ToolDefinition | undefined {
  return ctx.tools.get(name, agent)
}

function ownLayer(ctx: Context, agent: Agent): WrapperLayer {
  return {
    owner: PLUGIN_OWNER,
    priority: 100,
    projectDescription(value: string): string {
      const policy = escalationPolicyFor(ctx, agent)
      return projectEscalationDescription(value, policy.viableTargets.length > 0)
    },
    projectParameters(value: Record<string, unknown>): Record<string, unknown> {
      return projectEscalationParameters(value, escalationPolicyFor(ctx, agent).viableTargets)
    },
    execute(args: unknown, exec: Parameters<ToolDefinition['execute']>[1], next: (args: unknown) => Promise<unknown>): Promise<unknown> {
      return next(normalizeEscalationArguments(args, escalationPolicyFor(ctx, exec.agent ?? agent).effectiveMode))
    },
  }
}

function rewriteFsFailure(
  ctx: Context,
  agent: Agent,
  result: ToolExecutionResult,
): ToolExecutionResult {
  if (!result.isError || result.error.info?.code !== 'FS_SANDBOX_DENIED') return result
  const policy = escalationPolicyFor(ctx, agent)
  if (policy.viableTargets.length > 0) return result
  const denial = sandboxDenialMarker(policy.effectiveMode)
  const hint = escalationHintMarker('operation')
  const message = removeEscalationHint(result.error.message, denial, hint)
  if (message === result.error.message) return result
  return {
    ...result,
    error: { ...result.error, message },
    content: [{ type: 'text', text: `Error: ${message}` }],
  }
}

function rewriteSuccessfulDecision(
  ctx: Context,
  agent: Agent,
  name: string,
  result: ToolExecutionResult,
  decision: PostToolDecision,
): PostToolDecision {
  if (decision.kind === 'block' || result.isError) return decision
  const policy = escalationPolicyFor(ctx, agent)
  if (policy.viableTargets.length > 0) return decision
  const denial = sandboxDenialMarker(policy.effectiveMode)
  const hint = escalationHintMarker('command')
  if (name === 'job_output') {
    if (Object.hasOwn(decision, 'value') || decision.content !== undefined) {
      return {
        kind: 'block',
        feedback: [{ type: 'text', text: 'Conflicting plugins both attempted to rewrite job_output. Disable one result-rewriting plugin.' }],
      }
    }
    const value = result.value as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return decision
    const record = value as Record<string, unknown>
    if (typeof record.text !== 'string') return decision
    const text = removeEscalationHint(record.text, denial, hint)
    return text === record.text ? decision : { kind: 'accept', value: { ...record, text } }
  }
  if (name !== 'bash' && name !== 'pwsh') return decision
  if (Object.hasOwn(decision, 'value')) {
    return {
      kind: 'block',
      feedback: [{ type: 'text', text: `Conflicting plugins both attempted to rewrite ${name}. Disable one result-rewriting plugin.` }],
    }
  }
  const content = decision.content ?? result.content
  const cleaned = cleanSingleTextContent(content, denial, hint)
  return cleaned === undefined
    ? decision
    : { kind: 'accept', content: cleaned, ...decision.additionalContexts ? { additionalContexts: decision.additionalContexts } : {} }
}

export class Supervisor {
  private readonly states = new Map<Agent, AgentState>()
  private reconciling = 0
  private expectedToolChanges = 0
  private reconcilePending = false

  constructor(private readonly ctx: Context) {}

  start(): () => Promise<void> {
    const stopCreated = this.ctx.on('agent/created', ({ agent }) => {
      this.install(agent)
    })
    const stopDisposed = this.ctx.on('agent/disposed', ({ agent }) => {
      try {
        this.remove(agent)
      } catch (error) {
        this.ctx.logger.warn(`dsh-sandbox-escalation-fix: agent "${agent.id}" cleanup failed: ${String(error)}`)
      }
    })
    const stopPreset = this.ctx.on('agent-preset/selected', (sessionId) => {
      const agent = this.ctx.agents.get(sessionId)
      if (agent !== undefined) this.reconcileAgent(agent)
    })
    const stopTools = this.ctx.on('tools/change', () => {
      if (this.expectedToolChanges > 0) {
        this.expectedToolChanges -= 1
        return
      }
      if (this.reconciling > 0) {
        this.reconcilePending = true
        return
      }
      this.reconcileAll()
    })
    for (const agent of this.ctx.agents.list()) this.install(agent)
    return () => {
      stopTools()
      stopPreset()
      stopDisposed()
      stopCreated()
      const states = [...this.states.values()]
      this.states.clear()
      for (const state of states) {
        try {
          this.coordinate(() => this.disposeState(state))
        } catch (error) {
          this.ctx.logger.warn(`dsh-sandbox-escalation-fix: agent "${state.agent.id}" cleanup failed: ${String(error)}`)
        }
      }
      return Promise.resolve()
    }
  }

  private install(agent: Agent): void {
    if (this.states.has(agent)) return
    const targets = new Map<TargetToolName, TargetState>(
      TARGET_TOOLS.map(name => [name, {
        name,
        attachment: { kind: 'dormant' },
      }]),
    )
    const disposers: Array<() => unknown> = []
    const state: AgentState = {
      agent,
      targets,
      disposers,
      disposed: false,
    }
    this.states.set(agent, state)
    try {
      this.coordinate(() => this.reconcileState(state, true))
      disposers.push(this.ctx.on('tools/execute', async (exec, next): Promise<ToolExecutionResult> => {
        const result = await next()
        return exec.agent === agent && (exec.name === 'write' || exec.name === 'edit')
          ? rewriteFsFailure(this.ctx, agent, result)
          : result
      }, { prepend: true }))
      disposers.push(this.ctx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
        const decision = await next()
        return exec.agent === agent
          ? rewriteSuccessfulDecision(this.ctx, agent, exec.name, result, decision)
          : decision
      }, { prepend: true }))
    } catch (error) {
      this.states.delete(agent)
      this.coordinate(() => this.disposeState(state))
      throw error
    }
  }

  private remove(agent: Agent): void {
    const state = this.states.get(agent)
    if (state === undefined) return
    this.states.delete(agent)
    this.coordinate(() => this.disposeState(state))
  }

  private reconcileAgent(agent: Agent): void {
    if (this.reconciling > 0) return
    const state = this.states.get(agent)
    if (state === undefined) return
    this.coordinate(() => this.reconcileState(state, false))
  }

  private reconcileAll(): void {
    if (this.reconciling > 0) return
    this.coordinate(() => {
      for (const state of this.states.values()) {
        this.reconcileState(state, false)
      }
    })
  }

  private reconcileState(state: AgentState, strict: boolean): void {
    if (state.disposed) return
    for (const target of state.targets.values()) {
      try {
        this.reconcileTarget(state.agent, target)
      } catch (error) {
        if (strict) throw error
        this.reportFailure(state.agent, target, error)
      }
    }
  }

  private reconcileTarget(agent: Agent, target: TargetState): void {
    this.detachTarget(target)
    const delegate = visibleDelegate(this.ctx, agent, target.name)
    if (delegate === undefined) {
      delete target.lastReportedError
      return
    }
    try {
      validateTargetTool(delegate)
      const protocol = protocolOf(delegate)
      if (protocol !== undefined) {
        target.attachment = {
          kind: 'cooperative',
          release: protocol.contribute(ownLayer(this.ctx, agent)),
        }
      } else {
        const binding = target.binding
          ?? createWrapperBinding(delegate, ownLayer(this.ctx, agent))
        if (target.binding === undefined) {
          target.binding = binding
        } else {
          binding.updateDelegate(delegate)
        }
        const registrationCtx = agent.ctx.extend({ fiber: this.ctx.fiber })
        target.attachment = {
          kind: 'owned',
          unregister: this.mutateTools(
            () => registrationCtx.tools.register(binding.definition),
          ),
        }
      }
      delete target.lastReportedError
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      target.attachment = { kind: 'incompatible', reason }
      throw error
    }
  }

  private detachTarget(target: TargetState): void {
    const attachment = target.attachment
    if (attachment.kind === 'dormant') return
    if (attachment.kind === 'incompatible') {
      target.attachment = { kind: 'dormant' }
      return
    }
    if (attachment.kind === 'owned') {
      this.mutateTools(attachment.unregister)
    } else {
      attachment.release()
    }
    target.attachment = { kind: 'dormant' }
  }

  private disposeState(state: AgentState): void {
    if (state.disposed) return
    state.disposed = true
    const errors: unknown[] = []
    for (const target of [...state.targets.values()].reverse()) {
      try {
        this.detachTarget(target)
      } catch (error) {
        errors.push(error)
      }
    }
    for (const dispose of state.disposers.splice(0).reverse()) {
      try {
        dispose()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `agent "${state.agent.id}" cleanup failed`)
    }
  }

  private reportFailure(agent: Agent, target: TargetState, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    if (target.lastReportedError === message) return
    target.lastReportedError = message
    this.ctx.logger.warn(
      `dsh-sandbox-escalation-fix: agent "${agent.id}" tool "${target.name}" dynamic reconciliation failed: ${message}`,
    )
  }

  private coordinate(action: () => void): void {
    this.reconciling += 1
    try {
      action()
    } finally {
      this.reconciling -= 1
      if (this.reconciling === 0 && this.reconcilePending) {
        this.reconcilePending = false
        this.reconcileAll()
      }
    }
  }

  private mutateTools<T>(action: () => T): T {
    this.expectedToolChanges += 1
    const expected = this.expectedToolChanges
    try {
      return action()
    } finally {
      if (this.expectedToolChanges === expected) {
        this.expectedToolChanges -= 1
      }
    }
  }

}

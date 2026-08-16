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
import { createWrapperBinding, PLUGIN_OWNER } from './wrapper.ts'
import type { WrapperBinding } from './wrapper.ts'

const TARGET_TOOLS = ['bash', 'pwsh', 'write', 'edit'] as const
type TargetToolName = typeof TARGET_TOOLS[number]

interface AgentState {
  readonly agent: Agent
  readonly bindings: ManagedBinding[]
  readonly disposers: Array<() => unknown | Promise<unknown>>
  dispose(): Promise<void>
}

interface ManagedBinding {
  readonly name: TargetToolName
  readonly binding: WrapperBinding
  unregister: () => unknown
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void
  }
}

function rollback(disposers: Array<() => unknown | Promise<unknown>>): void {
  for (const dispose of disposers.splice(0).reverse()) {
    const result = dispose()
    if (result instanceof Promise) {
      void result.catch(() => {})
    }
  }
}

function visibleDelegate(ctx: Context, agent: Agent, name: TargetToolName): ToolDefinition | undefined {
  return ctx.tools.get(name, agent)
}

function ownLayer(ctx: Context, agent: Agent) {
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
  private refreshQueued = false
  private reconciling = 0

  constructor(private readonly ctx: Context) {}

  start(): () => Promise<void> {
    const stopCreated = this.ctx.on('agent/created', ({ agent }) => {
      this.install(agent)
    })
    const stopDisposed = this.ctx.on('agent/disposed', ({ agent }) => { void this.remove(agent) })
    const stopPreset = this.ctx.on('agent-preset/selected', (sessionId) => {
      const agent = this.ctx.agents.get(sessionId)
      if (agent !== undefined) this.refreshAgent(agent)
    })
    const stopTools = this.ctx.on('tools/change', () => { this.queueRefresh() })
    for (const agent of this.ctx.agents.list()) this.install(agent)
    return async () => {
      stopTools()
      stopPreset()
      stopDisposed()
      stopCreated()
      const states = [...this.states.values()]
      this.states.clear()
      await Promise.allSettled(states.map(state => state.dispose()))
    }
  }

  private install(agent: Agent): void {
    if (this.states.has(agent)) return
    const bindings: ManagedBinding[] = []
    const disposers: Array<() => unknown | Promise<unknown>> = []
    const state: AgentState = {
      agent,
      bindings,
      disposers,
      async dispose(): Promise<void> {
        for (const dispose of disposers.splice(0).reverse()) await Promise.resolve(dispose())
      },
    }
    this.reconciling += 1
    try {
      for (const name of TARGET_TOOLS) {
        const delegate = visibleDelegate(this.ctx, agent, name)
        if (delegate === undefined) continue
        validateTargetTool(delegate)
        const existing = delegate
        const protocol = protocolOf(existing)
        if (protocol !== undefined) {
          disposers.push(protocol.contribute(ownLayer(this.ctx, agent)))
          continue
        }
        const binding = createWrapperBinding(agent, delegate, ownLayer(this.ctx, agent))
        const registrationCtx = agent.ctx.extend({ fiber: this.ctx.fiber })
        const managed: ManagedBinding = {
          name,
          binding,
          unregister: registrationCtx.tools.register(binding.definition),
        }
        bindings.push(managed)
      }
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
      this.states.set(agent, state)
    } catch (error) {
      rollback(disposers)
      throw error
    } finally {
      this.reconciling -= 1
    }
  }

  private async remove(agent: Agent): Promise<void> {
    const state = this.states.get(agent)
    if (state === undefined) return
    this.states.delete(agent)
    await state.dispose()
  }

  private refreshAgent(agent: Agent): void {
    const state = this.states.get(agent)
    if (state === undefined) return
    this.reconciling += 1
    try {
      for (const managed of state.bindings) {
        const previousUnregister = managed.unregister
        previousUnregister()
        try {
          const delegate = visibleDelegate(this.ctx, agent, managed.name)
          if (delegate === undefined) {
            managed.binding.markUnhealthy(new Error('the visible parent chain no longer provides this tool'))
          } else {
            try {
              validateTargetTool(delegate)
              managed.binding.updateDelegate(delegate)
            } catch (error) {
              managed.binding.markUnhealthy(error instanceof Error ? error : new Error(String(error)))
            }
          }
          const registrationCtx = agent.ctx.extend({ fiber: this.ctx.fiber })
          managed.unregister = registrationCtx.tools.register(managed.binding.definition)
        } catch (error) {
          managed.unregister = () => undefined
          throw error
        }
      }
    } finally {
      this.reconciling -= 1
    }
  }

  private queueRefresh(): void {
    if (this.reconciling > 0 || this.refreshQueued) return
    this.refreshQueued = true
    queueMicrotask(() => {
      this.refreshQueued = false
      for (const agent of this.states.keys()) this.refreshAgent(agent)
    })
  }

}

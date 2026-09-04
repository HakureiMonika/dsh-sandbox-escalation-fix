import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CodeRuntime } from '@deepseek-ai/dsh-code-runtime'
import type { CodeRunRequest, CodeRunResult } from '@deepseek-ai/dsh-code-runtime'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { escalationHintMarker, sandboxDenialMarker } from '@deepseek-ai/dsh-sandbox'
import SandboxPolicyService, { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { bindScopeParent, createScope } from '@deepseek-ai/dsh-scope'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionService from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import ApprovalService, { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import { describe, expect, it, vi } from 'vitest'
import Plugin from '../src/index.ts'
import { startPlugin } from '../src/index.ts'
import { TOOL_WRAPPER_PROTOCOL } from '../src/wrapper-protocol.ts'
import { createWrapperBinding } from '../src/wrapper.ts'

class FsDeniedError extends HarnessError {
  constructor() {
    super(`${sandboxDenialMarker('danger-full-access')}\n${escalationHintMarker('operation')}`, 'FS_SANDBOX_DENIED')
  }
}

class FakeRuntime extends CodeRuntime {
  readonly language = 'typescript'
  readonly isolation = 'fake'

  run(_request: CodeRunRequest): Promise<CodeRunResult> {
    return Promise.resolve({ logs: [] })
  }
}

function targetTool(name: string, seen: unknown[]): ToolDefinition {
  return {
    name,
    description: 'base. Attempting a command the sandbox may deny is safe and expected: retry guidance',
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'string' },
        sandbox_permissions: {
          type: 'string',
          enum: ['workspace-write', 'danger-full-access'],
        },
        justification: { type: 'string' },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute(args): Promise<unknown> {
      seen.push(args)
      return Promise.resolve('ok')
    },
  }
}

function parameterProperties(definition: ToolDefinition): Record<string, unknown> {
  return definition.parameters.properties as Record<string, unknown>
}

async function scopedAgent(
  ctx: Context,
  presetKey: object,
  id: string,
): Promise<Agent> {
  const session = ctx.sessions.create(SessionId(id))
  const agentKey = { id: session.id } as Agent
  let agentScope!: ReturnType<typeof createScope>
  await ctx.plugin(Object.assign((inner: Context) => {
    agentScope = createScope(inner, agentKey)
    bindScopeParent(agentKey, presetKey)
  }, { inject: ['tools'] }))
  return Object.assign(agentKey, {
    session,
    ctx: agentScope.ctx,
    options: {},
    inbox: {},
    status: 'idle' as const,
  }) as Agent
}

async function harness(): Promise<{
  ctx: Context
  agent: Agent
  seen: unknown[]
  disposePlugin(): Promise<void>
  disposeAgent(): void
  replaceDelegate(name: string, definition: ToolDefinition): void
  removeDelegate(name: string): void
  createAgent(id: string): Promise<Agent>
}> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionService)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access' })
  await ctx.plugin(ApprovalService, { policy: 'never' })
  const pluginFiber = await ctx.plugin(Plugin)

  const seen: unknown[] = []
  const presetKey = { preset: 'test' }
  const targetDisposers = new Map<string, () => void>()
  let presetScope!: ReturnType<typeof createScope>
  await ctx.plugin(Object.assign((inner: Context) => {
    presetScope = createScope(inner, presetKey)
    for (const name of ['bash', 'pwsh', 'write', 'edit']) {
      targetDisposers.set(name, presetScope.ctx.tools.register(targetTool(name, seen)))
    }
  }, { inject: ['tools'] }))

  const agent = await scopedAgent(ctx, presetKey, 'agent')
  const disposeAgent = ctx.agents.register(agent)
  return {
    ctx,
    agent,
    seen,
    disposePlugin: () => pluginFiber.dispose(),
    disposeAgent,
    replaceDelegate(name, definition): void {
      targetDisposers.get(name)?.()
      targetDisposers.set(name, presetScope.ctx.tools.register(definition))
    },
    removeDelegate(name): void {
      targetDisposers.get(name)?.()
      targetDisposers.delete(name)
    },
    createAgent: id => scopedAgent(ctx, presetKey, id),
  }
}

async function registeredHarness(): Promise<{ ctx: Context; agent: Agent }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionService)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access' })
  await ctx.plugin(ApprovalService, { policy: 'never' })
  const session = ctx.sessions.create(SessionId('registered-agent'))
  const agent = {
    id: session.id,
    session,
    options: {},
    inbox: {},
    status: 'idle' as const,
    ctx: new Context(),
  } as Agent
  ctx.agents.register(agent)
  await ctx.plugin(Plugin)
  return { ctx, agent }
}

describe('installed plugin', () => {
  it('starts through structural validation when Desktop hides every manifest', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access' })
    await ctx.plugin(ApprovalService, { policy: 'never' })
    const warning = vi.spyOn(ctx.logger, 'warn')
    await ctx.plugin(Object.assign((inner: Context) => {
      startPlugin(inner, {}, { mode: 'structural', unavailablePackages: [] })
    }, { inject: ['agents', 'tools', 'sandboxPolicy', 'approval'] }))
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('strict runtime tool-contract validation'))
    await ctx.fiber.dispose()
  })

  it('does not require scopeOf(agent.ctx) from the plugin package instance', async () => {
    const { ctx, agent } = await registeredHarness()
    expect(ctx.agents.get(agent.id)).toBe(agent)
    await ctx.fiber.dispose()
  })

  it('projects all-access schemas and accepts redundant same-mode arguments', async () => {
    const { ctx, agent, seen } = await harness()
    const schemas = ctx.tools.schemas(agent)
    for (const name of ['bash', 'pwsh', 'write', 'edit']) {
      const schema = schemas.find(candidate => candidate.name === name)!
      expect((schema.parameters.properties as Record<string, unknown>).sandbox_permissions).toBeUndefined()
      expect(schema.description).toBe('base.')
    }
    const result = await ctx.tools.execute({
      callId: ToolCallId('call'),
      name: 'pwsh',
      arguments: {
        value: 'x',
        sandbox_permissions: 'danger-full-access',
        justification: 'already granted',
      },
      agent,
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)
    expect(seen).toContainEqual({ value: 'x' })

    setSandboxMode(agent.session, 'workspace-write')
    setApprovalPolicy(agent.session, 'ask')
    const narrowed = ctx.tools.schemas(agent).find(candidate => candidate.name === 'pwsh')!
    const properties = narrowed.parameters.properties as Record<string, { enum?: string[] }>
    expect(properties.sandbox_permissions?.enum)
      .toEqual(['danger-full-access'])
    await ctx.fiber.dispose()
  })

  it('runs workspace write/edit without a false full-access escalation', async () => {
    const { ctx, agent, seen } = await harness()
    setSandboxMode(agent.session, 'workspace-write')
    setApprovalPolicy(agent.session, 'ask')

    for (const name of ['write', 'edit']) {
      const result = await ctx.tools.execute({
        callId: ToolCallId(`workspace-${name}`),
        name,
        arguments: {
          value: name,
          file_path: 'permission-test.txt',
          sandbox_permissions: 'danger-full-access',
          justification: 'modify the selected workspace file',
        },
        agent,
        signal: new AbortController().signal,
      })
      expect(result.isError).toBe(false)
    }
    expect(seen).toContainEqual({ value: 'write', file_path: 'permission-test.txt' })
    expect(seen).toContainEqual({ value: 'edit', file_path: 'permission-test.txt' })
    await ctx.fiber.dispose()
  })

  it('projects the same exact-scope schemas into the Code Mode SDK', async () => {
    const { ctx, agent } = await harness()
    await ctx.plugin(FakeRuntime)
    const restore = agent.ctx.tools.presentAs('ptc')
    const sdk = (await ctx.systemPrompt.assemble({ scope: agent }))
      .sections.find(section => section.name === 'tools:sdk')?.text
    restore()
    expect(sdk).toContain('pwsh: {')
    expect(sdk).not.toContain('sandbox_permissions')
    expect(sdk).not.toContain('justification')
    await ctx.fiber.dispose()
  })

  it('re-resolves the parent delegate after a tool replacement', async () => {
    const { ctx, agent, seen, replaceDelegate } = await harness()
    const replacementSeen: unknown[] = []
    replaceDelegate('pwsh', targetTool('pwsh', replacementSeen))
    const result = await ctx.tools.execute({
      callId: ToolCallId('replacement'),
      name: 'pwsh',
      arguments: { value: 'new' },
      agent,
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)
    expect(seen).toEqual([])
    expect(replacementSeen).toEqual([{ value: 'new' }])
    await ctx.fiber.dispose()
  })

  it('mirrors dynamic restrictions and restores projected wrappers', async () => {
    const { ctx, agent, seen } = await harness()
    const lift = agent.ctx.tools.restrict({ allow: ['bash'] })

    expect(ctx.tools.schemas(agent).map(schema => schema.name)).toEqual(['bash'])
    expect(ctx.tools.get('pwsh', agent)).toBeUndefined()

    lift()

    const restored = ctx.tools.schemas(agent).find(schema => schema.name === 'pwsh')!
    expect((restored.parameters.properties as Record<string, unknown>).sandbox_permissions)
      .toBeUndefined()
    const result = await ctx.tools.execute({
      callId: ToolCallId('restriction-restored'),
      name: 'pwsh',
      arguments: { value: 'restored' },
      agent,
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)
    expect(seen).toContainEqual({ value: 'restored' })
    await ctx.fiber.dispose()
  })

  it('removes a stable missing delegate and restores a later replacement', async () => {
    const { ctx, agent, removeDelegate, replaceDelegate } = await harness()
    removeDelegate('pwsh')

    expect(ctx.tools.get('pwsh', agent)).toBeUndefined()

    const replacementSeen: unknown[] = []
    replaceDelegate('pwsh', targetTool('pwsh', replacementSeen))

    const result = await ctx.tools.execute({
      callId: ToolCallId('stable-restored'),
      name: 'pwsh',
      arguments: { value: 'new' },
      agent,
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)
    expect(replacementSeen).toEqual([{ value: 'new' }])
    await ctx.fiber.dispose()
  })

  it('discovers targets that were restricted during initial registration', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access' })
    await ctx.plugin(ApprovalService, { policy: 'never' })
    await ctx.plugin(Plugin)
    const presetKey = { preset: 'initially-restricted' }
    await ctx.plugin(Object.assign((inner: Context) => {
      const presetScope = createScope(inner, presetKey)
      for (const name of ['bash', 'pwsh', 'write', 'edit']) {
        presetScope.ctx.tools.register(targetTool(name, []))
      }
    }, { inject: ['tools'] }))
    const agent = await scopedAgent(ctx, presetKey, 'initially-restricted')
    const lift = agent.ctx.tools.restrict({ allow: ['bash'] })

    ctx.agents.register(agent)
    expect(ctx.tools.get('pwsh', agent)).toBeUndefined()

    lift()
    const restored = ctx.tools.get('pwsh', agent) as ToolDefinition & {
      [TOOL_WRAPPER_PROTOCOL]?: unknown
    }
    expect(restored[TOOL_WRAPPER_PROTOCOL]).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('keeps dynamic restrictions isolated between agents', async () => {
    const { ctx, agent: first, createAgent } = await harness()
    const second = await createAgent('second-agent')
    ctx.agents.register(second)

    const lift = first.ctx.tools.restrict({ allow: ['bash'] })

    expect(ctx.tools.get('pwsh', first)).toBeUndefined()
    expect(ctx.tools.get('pwsh', second)).toBeDefined()

    lift()
    expect(ctx.tools.get('pwsh', first)).toBeDefined()
    expect(ctx.tools.get('pwsh', second)).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('switches between owned and cooperative delegates without leaking its layer', async () => {
    const { ctx, agent, replaceDelegate } = await harness()
    const cooperativeSeen: unknown[] = []
    const cooperative = createWrapperBinding(
      targetTool('pwsh', cooperativeSeen),
      { owner: 'external-wrapper', priority: 50 },
    )

    replaceDelegate('pwsh', cooperative.definition)

    expect(ctx.tools.get('pwsh', agent)).toBe(cooperative.definition)
    expect(parameterProperties(cooperative.definition).sandbox_permissions)
      .toBeUndefined()

    const replacementSeen: unknown[] = []
    replaceDelegate('pwsh', targetTool('pwsh', replacementSeen))

    expect(parameterProperties(cooperative.definition).sandbox_permissions)
      .toBeDefined()
    const restored = ctx.tools.get('pwsh', agent) as ToolDefinition & {
      [TOOL_WRAPPER_PROTOCOL]?: unknown
    }
    expect(restored).not.toBe(cooperative.definition)
    expect(restored[TOOL_WRAPPER_PROTOCOL]).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('isolates a runtime-incompatible delegate and recovers after replacement', async () => {
    const { ctx, agent, replaceDelegate } = await harness()
    const incompatible = {
      ...targetTool('pwsh', []),
      parameters: { type: 'array', items: { type: 'string' } },
    }

    replaceDelegate('pwsh', incompatible)

    expect(ctx.tools.get('pwsh', agent)).toBe(incompatible)
    const write = ctx.tools.get('write', agent) as ToolDefinition & {
      [TOOL_WRAPPER_PROTOCOL]?: unknown
    }
    expect(write[TOOL_WRAPPER_PROTOCOL]).toBeDefined()

    replaceDelegate('pwsh', targetTool('pwsh', []))

    const restored = ctx.tools.get('pwsh', agent) as ToolDefinition & {
      [TOOL_WRAPPER_PROTOCOL]?: unknown
    }
    expect(restored[TOOL_WRAPPER_PROTOCOL]).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('removes exact-scope wrappers when the agent is disposed', async () => {
    const { ctx, agent, disposeAgent } = await harness()

    disposeAgent()

    expect(ctx.agents.get(agent.id)).toBeUndefined()
    const visible = ctx.tools.get('pwsh', agent) as ToolDefinition & {
      [TOOL_WRAPPER_PROTOCOL]?: unknown
    }
    expect(visible[TOOL_WRAPPER_PROTOCOL]).toBeUndefined()
    expect(parameterProperties(visible).sandbox_permissions).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('rejects an incompatible exact-scope tool instead of silently stacking it', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionService)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access' })
    await ctx.plugin(ApprovalService, { policy: 'never' })
    await ctx.plugin(Plugin)
    const presetKey = { preset: 'conflict' }
    let presetScope!: ReturnType<typeof createScope>
    await ctx.plugin(Object.assign((inner: Context) => {
      presetScope = createScope(inner, presetKey)
      presetScope.ctx.tools.register(targetTool('bash', []))
      presetScope.ctx.tools.register(targetTool('pwsh', []))
    }, { inject: ['tools'] }))
    const session = ctx.sessions.create(SessionId('conflict'))
    const agentKey = { id: session.id } as Agent
    let agentScope!: ReturnType<typeof createScope>
    await ctx.plugin(Object.assign((inner: Context) => {
      agentScope = createScope(inner, agentKey)
      bindScopeParent(agentKey, presetKey)
      agentScope.ctx.tools.register(targetTool('pwsh', []))
    }, { inject: ['tools'] }))
    const agent = Object.assign(agentKey, {
      session,
      ctx: agentScope.ctx,
      options: {},
      inbox: {},
      status: 'idle' as const,
    }) as Agent
    expect(() => ctx.agents.register(agent)).toThrow(/tool "pwsh" is already registered in this scope/)
    await ctx.fiber.dispose()
  })

  it('cooperates with the explicit wrapper protocol and removes only its own layer', async () => {
    const { ctx, agent } = await harness()
    const definition = ctx.tools.get('pwsh', agent) as ToolDefinition & {
      [TOOL_WRAPPER_PROTOCOL]?: { contribute(layer: {
        owner: string
        priority: number
        execute(args: unknown, exec: ToolRunContext, next: (args: unknown) => Promise<unknown>): Promise<unknown>
      }): () => void }
    }
    const release = definition[TOOL_WRAPPER_PROTOCOL]!.contribute({
      owner: 'cooperative-test',
      priority: 50,
      execute(args, _exec, next) {
        return next({ ...(args as Record<string, unknown>), cooperative: true })
      },
    })
    const result = await ctx.tools.execute({
      callId: ToolCallId('cooperative'),
      name: 'pwsh',
      arguments: { value: 'x' },
      agent,
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)
    release()
    await ctx.fiber.dispose()
  })

  it('removes unusable foreground shell hints without changing the canonical value', async () => {
    const { ctx, agent, replaceDelegate } = await harness()
    const denial = sandboxDenialMarker('danger-full-access')
    const hint = escalationHintMarker('command')
    replaceDelegate('pwsh', {
      ...targetTool('pwsh', []),
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value as string }],
      },
      execute: () => Promise.resolve(`${denial}\n${hint}\n[exit code: 1]`),
    })
    const result = await ctx.tools.execute({
      callId: ToolCallId('shell-hint'),
      name: 'pwsh',
      arguments: {},
      agent,
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)
    if (!result.isError) {
      expect(result.value).toContain(hint)
      expect(result.content).toEqual([{ type: 'text', text: `${denial}\n[exit code: 1]` }])
    }
    await ctx.fiber.dispose()
  })

  it('removes unusable job_output hints from both canonical value and content', async () => {
    const { ctx, agent } = await harness()
    const denial = sandboxDenialMarker('danger-full-access')
    const hint = escalationHintMarker('command')
    const original = `${denial}\n${hint}`
    agent.ctx.tools.register({
      name: 'job_output',
      description: 'Read background output.',
      parameters: { type: 'object', properties: {} },
      output: {
        schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
        render: (_args, value) => [{
          type: 'text',
          text: (value as { text: string }).text,
        }],
      },
      execute: () => Promise.resolve({ text: original }),
    })
    const result = await ctx.tools.execute({
      callId: ToolCallId('job-hint'),
      name: 'job_output',
      arguments: {},
      agent,
      signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)
    if (!result.isError) {
      expect(result.value).toEqual({ text: denial })
      expect(result.content).toEqual([{ type: 'text', text: denial }])
    }
    await ctx.fiber.dispose()
  })

  it('removes unusable FS escalation hints from native and Code Mode failures', async () => {
    const { ctx, agent, replaceDelegate } = await harness()
    replaceDelegate('write', {
      ...targetTool('write', []),
      execute: () => Promise.reject(new FsDeniedError()),
    })
    const execute = (parent?: symbol) => ctx.tools.execute({
      callId: ToolCallId(parent === undefined ? 'fs-native' : 'fs-code'),
      name: 'write',
      arguments: {},
      agent,
      ...(parent === undefined ? {} : { parent: parent as never }),
      signal: new AbortController().signal,
    })
    const native = await execute()
    const nested = await execute(Symbol('parent'))
    for (const result of [native, nested]) {
      expect(result.isError).toBe(true)
      if (result.isError) {
        expect(result.error.message).toBe(sandboxDenialMarker('danger-full-access'))
        expect(result.content).toEqual([{
          type: 'text',
          text: `Error: ${sandboxDenialMarker('danger-full-access')}`,
        }])
      }
    }
    await ctx.fiber.dispose()
  })

  it('invalidates captured wrapper definitions when the plugin fiber unloads', async () => {
    const { ctx, agent, disposePlugin } = await harness()
    const wrapped = ctx.tools.get('pwsh', agent) as ToolDefinition & {
      [TOOL_WRAPPER_PROTOCOL]?: unknown
    }
    expect(wrapped?.[TOOL_WRAPPER_PROTOCOL]).toBeDefined()
    await disposePlugin()
    expect(() => wrapped.description).toThrow(/inactive context/)
    await ctx.fiber.dispose()
  })
})

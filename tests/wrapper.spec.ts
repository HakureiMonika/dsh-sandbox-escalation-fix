import { describe, expect, it } from 'vitest'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { createWrapperBinding } from '../src/wrapper.ts'

function tool(executions: unknown[]): ToolDefinition {
  return {
    name: 'pwsh',
    description: 'original',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute(args): Promise<unknown> {
      executions.push(args)
      return Promise.resolve('ok')
    },
  }
}

describe('wrapper chain', () => {
  it('projects schemas and executes layers in stable priority order', async () => {
    const executions: unknown[] = []
    const order: string[] = []
    const binding = createWrapperBinding(tool(executions), {
      owner: 'z',
      priority: 20,
      projectDescription: value => `${value}:z`,
      execute: async (args, _exec, next) => {
        order.push('z')
        return next({ ...(args as object), z: true })
      },
    })
    binding.contribute({
      owner: 'a',
      priority: 10,
      projectDescription: value => `${value}:a`,
      execute: async (args, _exec, next) => {
        order.push('a')
        return next({ ...(args as object), a: true })
      },
    })
    expect(binding.definition.description).toBe('original:a:z')
    await binding.definition.execute({}, {} as ToolRunContext)
    expect(order).toEqual(['a', 'z'])
    expect(executions).toEqual([{ a: true, z: true }])
  })

  it('updates its delegate and removes contributed layers idempotently', async () => {
    const first: unknown[] = []
    const second: unknown[] = []
    const binding = createWrapperBinding(tool(first), {
      owner: 'owner',
      priority: 10,
    })
    const releaseOther = binding.contribute({ owner: 'other', priority: 20 })

    await binding.definition.execute({ value: 1 }, {} as ToolRunContext)
    binding.updateDelegate(tool(second))
    await binding.definition.execute({ value: 2 }, {} as ToolRunContext)

    expect(first).toEqual([{ value: 1 }])
    expect(second).toEqual([{ value: 2 }])
    binding.releaseOwnLayer()
    releaseOther()
    releaseOther()
  })

  it('forwards a timeout budget added by a replacement delegate', () => {
    const binding = createWrapperBinding(tool([]), {
      owner: 'owner',
      priority: 10,
    })
    const replacement: ToolDefinition = {
      ...tool([]),
      // 覆盖首次委托未声明预算、替换后的委托新增预算这一回归场景。
      timeoutMs: 30_000,
    }

    binding.updateDelegate(replacement)

    expect(binding.definition.timeoutMs).toBe(30_000)
  })

  it('forwards DSH alpha.1 tool metadata through the current delegate', () => {
    const first = tool([])
    first.timeoutMs = 10_000
    first.isConcurrencySafe = () => false
    first.presentCall = () => ({ card: 'generic', title: 'first' })
    first.presentResult = () => ({ card: 'generic', content: [] })
    first.finalizeContent = () => [{ type: 'text', text: 'first' }]
    const binding = createWrapperBinding(first, {
      owner: 'owner',
      priority: 10,
    })
    const replacement = tool([])
    replacement.timeoutMs = 20_000
    replacement.isConcurrencySafe = () => true
    replacement.presentCall = () => ({ card: 'generic', title: 'replacement' })
    replacement.presentResult = () => ({ card: 'generic', content: [{ type: 'text', text: 'replacement' }] })
    replacement.finalizeContent = () => [{ type: 'text', text: 'replacement' }]

    binding.updateDelegate(replacement)

    expect(binding.definition.timeoutMs).toBe(20_000)
    expect(binding.definition.isConcurrencySafe?.({})).toBe(true)
    expect(binding.definition.presentCall?.({})).toEqual({ card: 'generic', title: 'replacement' })
    expect(binding.definition.presentResult?.({}, { content: [], isError: false }))
      .toEqual({ card: 'generic', content: [{ type: 'text', text: 'replacement' }] })
    expect(binding.definition.finalizeContent?.({} as never, {} as never))
      .toEqual([{ type: 'text', text: 'replacement' }])
  })
})

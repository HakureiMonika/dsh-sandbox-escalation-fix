import { describe, expect, it } from 'vitest'
import { normalizeEscalationArguments } from '../src/argument-normalization.ts'
import { validateDshVersionSet, validateTargetTool } from '../src/compatibility.ts'
import { projectEscalationDescription } from '../src/description-projection.ts'
import { viableEscalationTargets } from '../src/policy.ts'
import { removeEscalationHint } from '../src/result-filter.ts'
import { projectEscalationParameters } from '../src/schema-projection.ts'

const parameters = {
  type: 'object',
  properties: {
    command: { type: 'string' },
    sandbox_permissions: {
      type: 'string',
      enum: ['workspace-write', 'danger-full-access'],
    },
    justification: { type: 'string' },
  },
}

describe('policy matrix', () => {
  it('advertises only strictly wider targets when approval is available', () => {
    expect(viableEscalationTargets('read-only', 'ask')).toEqual(['workspace-write', 'danger-full-access'])
    expect(viableEscalationTargets('workspace-write', 'ask')).toEqual(['danger-full-access'])
    expect(viableEscalationTargets('danger-full-access', 'ask')).toEqual([])
    expect(viableEscalationTargets('read-only', 'never')).toEqual([])
  })
})

describe('schema projection', () => {
  it('removes unusable escalation fields without mutating the source', () => {
    const projected = projectEscalationParameters(parameters, [])
    expect(projected).toEqual({ type: 'object', properties: { command: { type: 'string' } } })
    expect(parameters.properties.sandbox_permissions.enum).toEqual(['workspace-write', 'danger-full-access'])
  })

  it('narrows the target enum for workspace-write', () => {
    const projected = projectEscalationParameters(parameters, ['danger-full-access'])
    const properties = projected.properties as Record<string, { enum?: string[] }>
    expect(properties.sandbox_permissions?.enum)
      .toEqual(['danger-full-access'])
  })
})

describe('execution compatibility', () => {
  it('removes only an exact same-mode request', () => {
    const args = Object.freeze({
      command: 'pwd',
      sandbox_permissions: 'danger-full-access',
      justification: 'already granted',
    })
    expect(normalizeEscalationArguments(args, 'danger-full-access')).toEqual({ command: 'pwd' })
    expect(normalizeEscalationArguments(args, 'workspace-write')).toBe(args)
  })

  it('accepts an already-safe target and rejects a partial escalation schema', () => {
    expect(() => validateTargetTool({
      name: 'pwsh',
      description: 'already fixed',
      parameters: { type: 'object', properties: {} },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value as string }],
      },
      execute: () => Promise.resolve('ok'),
    })).not.toThrow()
    expect(() => validateTargetTool({
      name: 'write',
      description: 'partial schema',
      parameters: {
        type: 'object',
        properties: { sandbox_permissions: { type: 'string', enum: ['danger-full-access'] } },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value as string }],
      },
      execute: () => Promise.resolve('ok'),
    })).toThrow(/must expose sandbox_permissions and justification together or omit both/)
  })

  it('accepts one supported DSH release and rejects mixed or unknown versions', () => {
    expect(() => validateDshVersionSet({ tools: '0.1.0-rc.6', sandbox: '0.1.0-rc.6' }))
      .not.toThrow()
    expect(() => validateDshVersionSet({ tools: '0.1.0-rc.7', sandbox: '0.1.0-rc.7' }))
      .not.toThrow()
    expect(() => validateDshVersionSet({ tools: '0.1.0-rc.8', sandbox: '0.1.0-rc.8' }))
      .not.toThrow()
    expect(() => validateDshVersionSet({ tools: '0.1.1-rc.1', sandbox: '0.1.1-rc.1' }))
      .not.toThrow()
    expect(() => validateDshVersionSet({ tools: '0.1.0-rc.5', sandbox: '0.1.0-rc.6' }))
      .toThrow(/mixed DSH package versions/)
    expect(() => validateDshVersionSet({ tools: '0.1.0-rc.9' }))
      .toThrow(/unsupported DSH version/)
  })
})

describe('model-facing prose', () => {
  it('cuts only the escalation tail', () => {
    const text = 'base guidance. Attempting a command the sandbox may deny is safe and expected: retry guidance'
    expect(projectEscalationDescription(text, false)).toBe('base guidance.')
    expect(projectEscalationDescription(text, true)).toBe(text)
  })

  it('removes a hint only beside its denial marker', () => {
    const denial = '[sandbox: file access denied under danger-full-access mode]'
    const hint = '[sandbox: escalation available]'
    expect(removeEscalationHint(`${denial}\n${hint}\n[exit code: 1]`, denial, hint))
      .toBe(`${denial}\n[exit code: 1]`)
    expect(removeEscalationHint(hint, denial, hint)).toBe(hint)
  })
})

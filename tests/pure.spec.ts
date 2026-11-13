import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeEscalationArguments } from '../src/argument-normalization.ts'
import {
  validateDshRuntime,
  validateSandboxContract,
  validateDshRuntimeFromSources,
  validateDshVersionSet,
  validateTargetTool,
} from '../src/compatibility.ts'
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

  it('removes false full-access only from workspace write/edit paths', () => {
    const args = Object.freeze({
      file_path: 'permission-test.txt',
      content: 'updated',
      sandbox_permissions: 'danger-full-access',
      justification: 'edit the workspace file',
    })
    const context = { toolName: 'write', workspaceRoot: process.cwd() }

    expect(normalizeEscalationArguments(args, 'workspace-write', context)).toEqual({
      file_path: 'permission-test.txt',
      content: 'updated',
    })
    expect(normalizeEscalationArguments(
      { ...args, file_path: '../outside.txt' },
      'workspace-write',
      context,
    )).toEqual({ ...args, file_path: '../outside.txt' })
    expect(normalizeEscalationArguments(
      args,
      'workspace-write',
      { ...context, toolName: 'pwsh' },
    )).toBe(args)
  })

  it('keeps escalation when a workspace path resolves through an external symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-escalation-root-'))
    const outside = mkdtempSync(join(tmpdir(), 'dsh-escalation-outside-'))
    try {
      symlinkSync(outside, join(root, 'external'), process.platform === 'win32' ? 'junction' : 'dir')
      const args = {
        file_path: 'external/out.txt',
        content: 'updated',
        sandbox_permissions: 'danger-full-access',
        justification: 'edit through a link',
      }
      expect(normalizeEscalationArguments(args, 'workspace-write', {
        toolName: 'write',
        workspaceRoot: root,
      })).toBe(args)
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('keeps escalation when the workspace root no longer exists', () => {
    const parent = mkdtempSync(join(tmpdir(), 'dsh-escalation-missing-root-'))
    const root = join(parent, 'removed-workspace')
    const args = {
      file_path: 'out.txt',
      content: 'updated',
      sandbox_permissions: 'danger-full-access',
      justification: 'edit an unconfirmed workspace file',
    }
    try {
      expect(normalizeEscalationArguments(args, 'workspace-write', {
        toolName: 'write',
        workspaceRoot: root,
      })).toBe(args)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('drops only downgrade or unknown escalation targets', () => {
    const args = Object.freeze({
      file_path: 'out.txt',
      content: 'updated',
      sandbox_permissions: 'workspace-write',
      justification: 'stale narrower request',
    })
    // 全权限下任何升权都是空操作（等同当前模式）或降级，属于要丢弃的一类。
    expect(normalizeEscalationArguments(args, 'danger-full-access', { strictlyWiderTargets: [] }))
      .toEqual({ file_path: 'out.txt', content: 'updated' })
    // workspace-write 下比当前更窄的请求同样批不下来。
    expect(normalizeEscalationArguments(args, 'workspace-write', { strictlyWiderTargets: ['danger-full-access'] }))
      .toEqual({ file_path: 'out.txt', content: 'updated' })
    // 严格更宽的目标必须原样保留：审批策略为 `never` 时由官方给出明确的审批不可用错误，
    // 而不是在这里静默降级成一次普通调用。
    expect(normalizeEscalationArguments(
      { ...args, sandbox_permissions: 'danger-full-access' },
      'workspace-write',
      { strictlyWiderTargets: ['danger-full-access'] },
    )).toEqual({
      file_path: 'out.txt',
      content: 'updated',
      sandbox_permissions: 'danger-full-access',
      justification: 'stale narrower request',
    })
  })

  it('rejects a changed sandbox contract instead of silently wrapping', () => {
    const valid = {
      widerModes: {
        'read-only': ['workspace-write', 'danger-full-access'],
        'workspace-write': ['danger-full-access'],
      },
      denialMarker: (mode: string) => `[sandbox: file access denied under ${mode} mode]`,
      escalationHint: (subject: string) => `[sandbox: escalation available — retry this exact ${subject} once]`,
    }
    expect(() => validateSandboxContract(valid)).not.toThrow()

    // 新增模式：插件未审计，必须拒绝。
    expect(() => validateSandboxContract({
      ...valid,
      widerModes: { ...valid.widerModes, 'read-only': ['workspace-write', 'danger-full-access', 'network'] },
    })).toThrow(/sandbox mode vocabulary changed/)

    // 严格变宽关系被改：即使词表不变也必须拒绝。
    expect(() => validateSandboxContract({
      ...valid,
      widerModes: { 'read-only': ['danger-full-access'], 'workspace-write': ['danger-full-access'] },
    })).toThrow(/no longer maps "read-only" to "workspace-write"/)

    // marker 文案前缀变化会让结果清洗静默失效，必须拒绝。
    expect(() => validateSandboxContract({
      ...valid,
      denialMarker: () => 'access denied',
    })).toThrow(/denial marker no longer starts with/)
    expect(() => validateSandboxContract({
      ...valid,
      escalationHint: () => 'retry with sandbox_permissions',
    })).toThrow(/escalation hint marker no longer starts with/)
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

  it('accepts any coherent DSH release set and rejects mixed versions', () => {
    expect(() => validateDshVersionSet({ tools: '0.1.0-rc.6', sandbox: '0.1.0-rc.6' })).not.toThrow()
    // 版本号不再充当门禁：新版桌面/包版本号直接放行，真正的兼容性由工具契约校验在挂载时判定。
    expect(() => validateDshVersionSet({ tools: '0.2.2-rc.1', sandbox: '0.2.2-rc.1' })).not.toThrow()
    expect(() => validateDshVersionSet({ tools: '0.1.0-rc.5', sandbox: '0.1.0-rc.6' }))
      .toThrow(/mixed DSH package versions/)
  })

  it('falls back only when every DSH package manifest is hidden', () => {
    const hidden = Object.assign(new Error('hidden by host'), { code: 'MODULE_NOT_FOUND' })
    expect(validateDshRuntime(() => { throw hidden })).toEqual({
      mode: 'structural',
      unavailablePackages: [
        '@deepseek-ai/dsh-agent',
        '@deepseek-ai/dsh-llm',
        '@deepseek-ai/dsh-sandbox',
        '@deepseek-ai/dsh-sandbox-policy',
        '@deepseek-ai/dsh-scope',
        '@deepseek-ai/dsh-session',
        '@deepseek-ai/dsh-tools',
        '@deepseek-ai/dsh-user-approval',
      ],
    })

    expect(() => validateDshRuntime(name => {
      if (name === '@deepseek-ai/dsh-agent') throw hidden
      return { version: '0.1.1-rc.2' }
    })).toThrow(/only some DSH package manifests are readable/)
  })

  it('does not hide malformed manifests or unrelated loader errors', () => {
    expect(() => validateDshRuntime(() => ({})))
      .toThrow(/package.json has no string version/)
    expect(() => validateDshRuntime(() => {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
    })).toThrow(/cannot read @deepseek-ai\/dsh-agent\/package.json/)
  })

  it('uses one complete fallback root for linked plugin installations', () => {
    const hidden = Object.assign(new Error('not installed beside plugin'), { code: 'MODULE_NOT_FOUND' })
    expect(validateDshRuntimeFromSources([
      {
        label: 'plugin module',
        read: () => { throw hidden },
      },
      {
        label: 'host working directory',
        read: () => ({ version: '0.1.1-rc.2' }),
      },
    ])).toEqual({
      mode: 'versioned',
      unavailablePackages: [],
    })
  })

  it('does not combine partial package sets from different roots', () => {
    const hidden = Object.assign(new Error('not installed at this root'), { code: 'MODULE_NOT_FOUND' })
    expect(() => validateDshRuntimeFromSources([
      {
        label: 'first root',
        read: name => {
          if (name === '@deepseek-ai/dsh-agent') return { version: '0.1.1-rc.2' }
          throw hidden
        },
      },
      {
        label: 'second root',
        read: name => {
          if (name !== '@deepseek-ai/dsh-agent') return { version: '0.1.1-rc.2' }
          throw hidden
        },
      },
    ])).toThrow(/only some DSH package manifests are readable from first root/)
  })

  it('rejects a partial higher-priority root even when a later root is complete', () => {
    const hidden = Object.assign(new Error('not installed at this root'), { code: 'MODULE_NOT_FOUND' })
    expect(() => validateDshRuntimeFromSources([
      {
        label: 'plugin module',
        read: name => {
          if (name === '@deepseek-ai/dsh-agent') return { version: '0.1.1-rc.2' }
          throw hidden
        },
      },
      {
        label: 'host working directory',
        read: () => ({ version: '0.1.1-rc.2' }),
      },
    ])).toThrow(/only some DSH package manifests are readable from plugin module/)
  })

  it('fails immediately when a fallback root reports a non-resolution error', () => {
    const hidden = Object.assign(new Error('not installed beside plugin'), { code: 'MODULE_NOT_FOUND' })
    expect(() => validateDshRuntimeFromSources([
      {
        label: 'plugin module',
        read: () => { throw hidden },
      },
      {
        label: 'host working directory',
        read: () => {
          throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
        },
      },
    ])).toThrow(/cannot read @deepseek-ai\/dsh-agent\/package.json from host working directory/)
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

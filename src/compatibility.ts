import { createRequire } from 'node:module'
import { join } from 'node:path'
import { escalationHintMarker, sandboxDenialMarker, WIDER_MODES } from '@deepseek-ai/dsh-sandbox'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

// DSH 的包版本与桌面版同步发版，逐版本白名单会随每次升级把插件锁死在旧号上，
// 因此版本号不再作为门禁：只要受检包集版本一致，兼容性交由契约断言与 validateTargetTool 判定。
//
// 但"只看结构"不够：validateTargetTool 只校验 description/parameters/output 的形状，
// 校验不出沙箱模式词表、严格变宽关系或 marker 文案的变化。这些一旦漂移，
// 插件会照常加载、照常投影错的 Schema，且结果清洗静默失效。
// 因此激活阶段额外断言 validateSandboxContract()，让"官方升版本号"静默通过、"契约变了"大声失败。

export const EXPECTED_SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'] as const

/** 结果清洗依赖的 marker 文案前缀；官方一旦改文案，清洗会静默失效，所以必须显式断言。 */
const MARKER_PREFIX = '[sandbox: '

export interface SandboxContractSurface {
  /** `WIDER_MODES`：键为当前模式，值为允许升级到的更宽模式。 */
  readonly widerModes: Readonly<Record<string, readonly string[] | undefined>>
  /** 拒绝 marker，入参为当前模式。 */
  readonly denialMarker: (mode: string) => string
  /** 升级提示 marker，入参为 subject（command / operation）。 */
  readonly escalationHint: (subject: string) => string
}

/**
 * 断言插件依赖的沙箱契约未发生破坏性变化。
 *
 * 失败即抛错，让插件在激活阶段明确拒绝，而不是带着错误假设继续包装工具。
 * 官方仅提升版本号时这里不受影响，因此不需要任何人工改门禁。
 */
export function validateSandboxContract(surface: SandboxContractSurface): void {
  const modes = new Set<string>(Object.keys(surface.widerModes))
  for (const wider of Object.values(surface.widerModes)) {
    for (const mode of wider ?? []) modes.add(mode)
  }
  const actual = [...modes].sort()
  const expected = [...EXPECTED_SANDBOX_MODES].sort()
  const sameVocabulary = actual.length === expected.length
    && actual.every((mode, index) => mode === expected[index])
  if (!sameVocabulary) {
    throw new Error(`dsh-sandbox-escalation-fix: sandbox mode vocabulary changed; expected {${expected.join(', ')}} but found {${actual.join(', ')}}. Re-audit the schema projection before running this plugin.`)
  }
  if (!(surface.widerModes['read-only'] ?? []).includes('workspace-write')) {
    throw new Error('dsh-sandbox-escalation-fix: WIDER_MODES no longer maps "read-only" to "workspace-write"; the strictly-wider contract changed')
  }
  if (!(surface.widerModes['workspace-write'] ?? []).includes('danger-full-access')) {
    throw new Error('dsh-sandbox-escalation-fix: WIDER_MODES no longer maps "workspace-write" to "danger-full-access"; the strictly-wider contract changed')
  }
  if (!surface.denialMarker('read-only').startsWith(MARKER_PREFIX)) {
    throw new Error(`dsh-sandbox-escalation-fix: sandbox denial marker no longer starts with "${MARKER_PREFIX}"; result cleanup would silently stop matching`)
  }
  if (!surface.escalationHint('command').startsWith(MARKER_PREFIX)) {
    throw new Error(`dsh-sandbox-escalation-fix: escalation hint marker no longer starts with "${MARKER_PREFIX}"; result cleanup would silently stop matching`)
  }
}

/**
 * 用真实运行时装配契约断言。
 *
 * 只做一次、放在激活阶段：契约一旦变化就拒绝激活，避免插件带着错误假设继续包装工具。
 * 官方仅提升版本号时这里静默通过，因此不需要任何人工维护。
 */
export function assertSandboxContract(): void {
  validateSandboxContract({
    widerModes: WIDER_MODES as unknown as Record<string, readonly string[]>,
    denialMarker: sandboxDenialMarker as (mode: string) => string,
    escalationHint: escalationHintMarker as (subject: string) => string,
  })
}

const DSH_PACKAGES = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-sandbox',
  '@deepseek-ai/dsh-sandbox-policy',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-user-approval',
] as const
const TARGET_NAMES = new Set(['bash', 'pwsh', 'write', 'edit'])
const ESCALATION_FIELDS = ['sandbox_permissions', 'justification'] as const

type ManifestReader = (name: string) => unknown

interface ManifestSource {
  readonly label: string
  readonly read: ManifestReader
}

export interface DshRuntimeCompatibility {
  mode: 'versioned' | 'structural'
  unavailablePackages: readonly string[]
}

function isMissingModuleError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND'
}

/**
 * 按 Node.js 的真实加载优先级建立包清单解析根。
 *
 * 插件自身目录必须优先，因为运行时代码中的静态 import 也会先从插件物理位置向上解析；
 * 只有该目录完全不存在任何受检 DSH 包时，才允许从宿主当前工作目录读取完整包集，
 * 从而兼容 `link:`、工作区软链接和从 DSH 源码根目录启动的开发方式。
 * `DSH_HOME` 是配置与 Profile 数据目录，不是稳定的 Node.js 包根目录，因此不能参与解析。
 */
function defaultManifestSources(): readonly ManifestSource[] {
  const pluginRequire = createRequire(import.meta.url)
  const hostRequire = createRequire(join(process.cwd(), 'package.json'))

  return [
    {
      label: 'plugin module',
      read: name => pluginRequire(`${name}/package.json`),
    },
    {
      label: 'host working directory',
      read: name => hostRequire(`${name}/package.json`),
    },
  ]
}

export function validateDshVersionSet(
  versions: Readonly<Record<string, string>>,
): void {
  const unique = new Set(Object.values(versions))
  if (unique.size !== 1) {
    const detail = Object.entries(versions)
      .map(([name, version]) => `${name}@${version}`)
      .join(', ')
    throw new Error(`dsh-sandbox-escalation-fix: mixed DSH package versions are unsupported: ${detail}`)
  }
}

export function validateDshRuntimeFromSources(
  sources: readonly ManifestSource[],
): DshRuntimeCompatibility {
  for (const source of sources) {
    const versions: Record<string, string> = {}
    const unavailablePackages: string[] = []

    for (const name of DSH_PACKAGES) {
      let manifest: unknown
      try {
        manifest = source.read(name)
      } catch (error) {
        if (isMissingModuleError(error)) {
          unavailablePackages.push(name)
          continue
        }
        throw new Error(`dsh-sandbox-escalation-fix: cannot read ${name}/package.json from ${source.label}`, { cause: error })
      }
      if (typeof manifest !== 'object' || manifest === null
        || !('version' in manifest) || typeof manifest.version !== 'string') {
        throw new Error(`dsh-sandbox-escalation-fix: ${name}/package.json has no string version at ${source.label}`)
      }
      versions[name] = manifest.version
    }

    if (unavailablePackages.length === 0) {
      validateDshVersionSet(versions)
      return { mode: 'versioned', unavailablePackages }
    }

    // 同一解析根只出现部分 DSH 包，说明静态 import 可能已经从该根加载了部分运行时。
    // 此时继续尝试后续根会掩盖双运行时或跨目录混装，因此必须立即拒绝启动。
    if (unavailablePackages.length < DSH_PACKAGES.length) {
      throw new Error(`dsh-sandbox-escalation-fix: only some DSH package manifests are readable from ${source.label}; unavailable packages: ${unavailablePackages.join(', ')}`)
    }
  }

  // 所有候选根都完全看不到清单时，保留 Desktop 2.0.3 所需的严格结构校验回退。
  return { mode: 'structural', unavailablePackages: [...DSH_PACKAGES] }
}

export function validateDshRuntime(
  readManifest?: ManifestReader,
): DshRuntimeCompatibility {
  const sources = readManifest === undefined
    ? defaultManifestSources()
    : [{ label: 'injected manifest reader', read: readManifest }]
  return validateDshRuntimeFromSources(sources)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`dsh-sandbox-escalation-fix: ${label} must be an object`)
  }
  return value as Record<string, unknown>
}

export function validateTargetTool(definition: ToolDefinition): void {
  if (!TARGET_NAMES.has(definition.name)) {
    throw new Error(`dsh-sandbox-escalation-fix: unsupported target tool "${definition.name}"`)
  }
  if (typeof definition.description !== 'string' || typeof definition.execute !== 'function') {
    throw new Error(`dsh-sandbox-escalation-fix: tool "${definition.name}" has an incompatible definition`)
  }
  const parameters = record(definition.parameters, `tool "${definition.name}" parameters`)
  if (parameters.type !== 'object') {
    throw new Error(`dsh-sandbox-escalation-fix: tool "${definition.name}" parameters must have type "object"`)
  }
  record(parameters.properties, `tool "${definition.name}" parameters.properties`)
  const properties = parameters.properties as Record<string, unknown>
  const fields = ESCALATION_FIELDS.filter(field => properties[field] !== undefined)
  if (fields.length === 1) {
    throw new Error(`dsh-sandbox-escalation-fix: tool "${definition.name}" must expose sandbox_permissions and justification together or omit both`)
  }
  const output = record(definition.output, `tool "${definition.name}" output`)
  if (typeof output.render !== 'function' || typeof output.schema !== 'object' || output.schema === null) {
    throw new Error(`dsh-sandbox-escalation-fix: tool "${definition.name}" output contract is incompatible`)
  }
}

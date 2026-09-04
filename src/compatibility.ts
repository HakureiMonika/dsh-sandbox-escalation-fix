import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

// 仅列入已完成真实包测试或标签源码契约审计的 DSH 版本，避免仅凭 semver 范围放行未知契约。
export const SUPPORTED_DSH_VERSIONS = ['0.1.0-rc.5', '0.1.0-rc.6', '0.1.0-rc.7', '0.1.0-rc.8', '0.1.1-rc.1', '0.1.1-rc.2', '0.1.2-alpha.1', '0.1.2-alpha.2', '0.1.2-alpha.3', '0.1.2-alpha.4', '0.1.2-alpha.5', '0.1.2-rc.1'] as const

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
  const version = unique.values().next().value
  if (version === undefined || !SUPPORTED_DSH_VERSIONS.includes(version as typeof SUPPORTED_DSH_VERSIONS[number])) {
    throw new Error(`dsh-sandbox-escalation-fix: unsupported DSH version "${version ?? 'unknown'}"; supported versions: ${SUPPORTED_DSH_VERSIONS.join(', ')}`)
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

import { createRequire } from 'node:module'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

// 仅列入已使用对应真实 DSH 包完成构建和集成测试的版本，避免仅凭 semver 范围放行未知契约。
export const SUPPORTED_DSH_VERSIONS = ['0.1.0-rc.5', '0.1.0-rc.6', '0.1.0-rc.7', '0.1.0-rc.8', '0.1.1-rc.1', '0.1.1-rc.2'] as const

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
const require = createRequire(import.meta.url)

export interface DshRuntimeCompatibility {
  mode: 'versioned' | 'structural'
  unavailablePackages: readonly string[]
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

export function validateDshRuntime(
  readManifest: (name: string) => unknown = name => require(`${name}/package.json`),
): DshRuntimeCompatibility {
  const versions: Record<string, string> = {}
  const unavailablePackages: string[] = []
  for (const name of DSH_PACKAGES) {
    let manifest: unknown
    try {
      manifest = readManifest(name)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code
      if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
        unavailablePackages.push(name)
        continue
      }
      throw new Error(`dsh-sandbox-escalation-fix: cannot read ${name}/package.json`, { cause: error })
    }
    if (typeof manifest !== 'object' || manifest === null
      || !('version' in manifest) || typeof manifest.version !== 'string') {
      throw new Error(`dsh-sandbox-escalation-fix: ${name}/package.json has no string version`)
    }
    versions[name] = manifest.version
  }
  if (unavailablePackages.length === DSH_PACKAGES.length) {
    return { mode: 'structural', unavailablePackages }
  }
  if (unavailablePackages.length > 0) {
    throw new Error(`dsh-sandbox-escalation-fix: only some DSH package manifests are readable; unavailable packages: ${unavailablePackages.join(', ')}`)
  }
  validateDshVersionSet(versions)
  return { mode: 'versioned', unavailablePackages }
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

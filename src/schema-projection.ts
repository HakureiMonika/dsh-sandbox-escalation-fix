import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'

const SANDBOX_PERMISSIONS = 'sandbox_permissions'
const JUSTIFICATION = 'justification'

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`dsh-sandbox-escalation-fix: ${label} must be an object`)
  }
  return value as Record<string, unknown>
}

export function projectEscalationParameters(
  parameters: Record<string, unknown>,
  targets: readonly SandboxMode[],
): Record<string, unknown> {
  const projected = structuredClone(parameters)
  const root = objectRecord(projected, 'tool parameters')
  if (root.type !== 'object') {
    throw new Error('dsh-sandbox-escalation-fix: tool parameters root must have type "object"')
  }
  const properties = objectRecord(root.properties, 'tool parameters.properties')
  const permissions = properties[SANDBOX_PERMISSIONS]
  const justification = properties[JUSTIFICATION]
  if (permissions === undefined && justification === undefined) return projected
  if (permissions === undefined || justification === undefined) {
    throw new Error('dsh-sandbox-escalation-fix: escalation schema must declare sandbox_permissions and justification together')
  }
  const permissionsSchema = objectRecord(permissions, 'sandbox_permissions schema')
  const justificationSchema = objectRecord(justification, 'justification schema')
  if (permissionsSchema.type !== 'string' || !Array.isArray(permissionsSchema.enum)
    || !permissionsSchema.enum.every(value => typeof value === 'string')) {
    throw new Error('dsh-sandbox-escalation-fix: sandbox_permissions must be a string enum')
  }
  if (justificationSchema.type !== 'string') {
    throw new Error('dsh-sandbox-escalation-fix: justification must be a string')
  }
  if (targets.length === 0) {
    delete properties[SANDBOX_PERMISSIONS]
    delete properties[JUSTIFICATION]
    if (Array.isArray(root.required)) {
      const required = root.required.filter(
        value => value !== SANDBOX_PERMISSIONS && value !== JUSTIFICATION,
      )
      if (required.length === 0) delete root.required
      else root.required = required
    }
    return projected
  }
  permissionsSchema.enum = [...targets]
  return projected
}

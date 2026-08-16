import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'

export function normalizeEscalationArguments(
  args: unknown,
  effectiveMode: SandboxMode,
): unknown {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return args
  const record = args as Record<string, unknown>
  if (!Object.hasOwn(record, 'sandbox_permissions') || !Object.hasOwn(record, 'justification')) {
    return args
  }
  if (record.sandbox_permissions !== effectiveMode) return args
  const normalized = { ...record }
  delete normalized.sandbox_permissions
  delete normalized.justification
  return normalized
}

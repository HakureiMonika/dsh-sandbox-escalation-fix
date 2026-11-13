import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export interface EscalationNormalizationContext {
  toolName?: string
  workspaceRoot?: string
  /**
   * 当前有效模式下**严格更宽**的目标集合（即 DSH 的 `WIDER_MODES[effectiveMode]`）。
   *
   * 只用于识别"降级或未知目标"：这类请求会被执行期的变宽阶梯直接抛错并中断整次调用，
   * 既拿不到权限也不该拖垮调用，因此成对丢弃。
   *
   * 注意不要把它换成"策略上可获批的目标"：审批策略为 `never` 时那个集合恒为空，
   * 会把本来合法的升权请求也一并静默吞掉，而官方对这种情况给的是明确的审批不可用错误。
   */
  strictlyWiderTargets?: readonly SandboxMode[]
}

function withoutEscalation(record: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...record }
  delete normalized.sandbox_permissions
  delete normalized.justification
  return normalized
}

function isWithin(root: string, path: string): boolean {
  const relativePath = relative(root, path)
  return relativePath === ''
    || (!isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${sep}`))
}

function nearestExistingPath(path: string): string | undefined {
  let current = path
  while (true) {
    try {
      return realpathSync.native(current)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') return undefined
      const parent = dirname(current)
      if (parent === current) return undefined
      current = parent
    }
  }
}

function isWorkspaceFilePath(filePath: unknown, workspaceRoot: string | undefined): boolean {
  if (typeof filePath !== 'string' || filePath.trim().length === 0 || workspaceRoot === undefined) return false
  const resolvedRoot = resolve(workspaceRoot)
  const target = resolve(resolvedRoot, filePath)
  if (!isWithin(resolvedRoot, target)) return false
  let canonicalRoot: string
  try {
    canonicalRoot = realpathSync.native(resolvedRoot)
  } catch {
    return false
  }
  const canonicalTarget = nearestExistingPath(target)
  return canonicalTarget !== undefined && isWithin(canonicalRoot, canonicalTarget)
}

export function normalizeEscalationArguments(
  args: unknown,
  effectiveMode: SandboxMode,
  context: EscalationNormalizationContext = {},
): unknown {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return args
  const record = args as Record<string, unknown>
  if (!Object.hasOwn(record, 'sandbox_permissions') || !Object.hasOwn(record, 'justification')) {
    return args
  }
  if (record.sandbox_permissions === effectiveMode) return withoutEscalation(record)
  if (
    effectiveMode === 'workspace-write'
    && record.sandbox_permissions === 'danger-full-access'
    && (context.toolName === 'write' || context.toolName === 'edit')
    && isWorkspaceFilePath(record.file_path, context.workspaceRoot)
  ) {
    return withoutEscalation(record)
  }
  // 降级或未知目标会被执行期的变宽阶梯直接抛错并中断整次调用，成对丢弃以保住这次调用。
  // 严格更宽的目标则原样交给官方：审批策略为 `never` 时由官方给出明确的审批不可用错误，
  // 而不是在这里静默降级。
  if (context.strictlyWiderTargets !== undefined
    && !context.strictlyWiderTargets.includes(record.sandbox_permissions as SandboxMode)) {
    return withoutEscalation(record)
  }
  return args
}

import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export interface EscalationNormalizationContext {
  toolName?: string
  workspaceRoot?: string
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
  return args
}

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-user-approval'
import { validateDshRuntime } from './compatibility.ts'
import type { DshRuntimeCompatibility } from './compatibility.ts'
import { Supervisor } from './supervisor.ts'

export interface Config {
  logLevel?: 'silent' | 'info' | 'debug'
}

export const Config: z<Config> = z.object({
  logLevel: z.union(['silent', 'info', 'debug'] as const).default('info'),
})

export const name = 'sandbox-escalation-fix'
export const inject = ['agents', 'tools', 'sandboxPolicy', 'approval']

export function startPlugin(
  ctx: Context,
  config: Config = {},
  compatibility: DshRuntimeCompatibility = validateDshRuntime(),
): void {
  if (compatibility.mode === 'structural') {
    ctx.logger.warn('dsh-sandbox-escalation-fix: DSH package manifests are hidden by the host; using strict runtime tool-contract validation')
  }
  const supervisor = new Supervisor(ctx)
  ctx.effect(() => supervisor.start(), 'sandbox-escalation-fix.lifecycle()')
  if ((config.logLevel ?? 'info') !== 'silent') {
    ctx.logger.info('sandbox-escalation-fix: session-aware tool wrappers enabled')
  }
}

export function apply(ctx: Context, config: Config = {}): void {
  startPlugin(ctx, config)
}

export default { name, inject, Config, apply }

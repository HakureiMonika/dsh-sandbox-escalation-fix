import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { WIDER_MODES } from '@deepseek-ai/dsh-sandbox'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type { ApprovalPolicy } from '@deepseek-ai/dsh-user-approval'

export interface EscalationPolicyView {
  effectiveMode: SandboxMode
  approvalPolicy: ApprovalPolicy
  viableTargets: readonly SandboxMode[]
}

export function viableEscalationTargets(
  effectiveMode: SandboxMode,
  approvalPolicy: ApprovalPolicy,
): readonly SandboxMode[] {
  return approvalPolicy === 'never' ? [] : WIDER_MODES[effectiveMode] ?? []
}

export function escalationPolicyFor(ctx: Context, agent: Agent): EscalationPolicyView {
  const effectiveMode = ctx.sandboxPolicy.resolve({ session: agent.session }).mode
  const approvalPolicy = ctx.approval.overrideOf(agent.session)
    ?? ctx.approval.config.policy
    ?? 'ask'
  return {
    effectiveMode,
    approvalPolicy,
    viableTargets: viableEscalationTargets(effectiveMode, approvalPolicy),
  }
}

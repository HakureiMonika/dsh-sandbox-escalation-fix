const ESCALATION_START = ' Attempting a command the sandbox may deny is safe and expected:'

export function projectEscalationDescription(
  description: string,
  hasEscalationTargets: boolean,
): string {
  if (hasEscalationTargets) return description
  const first = description.indexOf(ESCALATION_START)
  if (first === -1) return description
  if (description.indexOf(ESCALATION_START, first + ESCALATION_START.length) !== -1) {
    throw new Error('dsh-sandbox-escalation-fix: shell description escalation anchor is ambiguous')
  }
  return description.slice(0, first)
}

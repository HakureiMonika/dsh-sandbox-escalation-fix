import type { ContentBlock } from '@deepseek-ai/dsh-llm'

export function removeEscalationHint(
  text: string,
  denialMarker: string,
  hint: string,
): string {
  const lines = text.split('\n')
  if (!lines.includes(denialMarker) || !lines.includes(hint)) return text
  return lines.filter(line => line !== hint).join('\n')
}

export function cleanSingleTextContent(
  content: readonly ContentBlock[],
  denialMarker: string,
  hint: string,
): ContentBlock[] | undefined {
  if (content.length !== 1 || content[0]?.type !== 'text') return undefined
  const text = removeEscalationHint(content[0].text, denialMarker, hint)
  return text === content[0].text ? undefined : [{ type: 'text', text }]
}

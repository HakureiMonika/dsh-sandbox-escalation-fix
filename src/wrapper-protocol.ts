import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'

export const TOOL_WRAPPER_PROTOCOL = Symbol.for('dsh.tool-wrapper.v1')

export interface WrapperContext {
  readonly toolName: string
}

export interface WrapperLayer {
  readonly owner: string
  readonly priority: number
  projectDescription?(value: string, context: WrapperContext): string
  projectParameters?(value: Record<string, unknown>, context: WrapperContext): Record<string, unknown>
  execute?(args: unknown, exec: ToolRunContext, next: (args: unknown) => Promise<unknown>): Promise<unknown>
}

export interface ToolWrapperProtocolV1 {
  readonly version: 1
  readonly owner: string
  readonly name: string
  contribute(layer: WrapperLayer): () => void
}

export type CooperativeToolDefinition = ToolDefinition & {
  readonly [TOOL_WRAPPER_PROTOCOL]?: ToolWrapperProtocolV1
}

export function protocolOf(definition: ToolDefinition): ToolWrapperProtocolV1 | undefined {
  const protocol = (definition as CooperativeToolDefinition)[TOOL_WRAPPER_PROTOCOL]
  if (protocol === undefined) return undefined
  if (protocol.version !== 1 || typeof protocol.owner !== 'string'
    || typeof protocol.name !== 'string' || typeof protocol.contribute !== 'function') {
    throw new Error(`dsh-sandbox-escalation-fix: tool "${definition.name}" exposes an invalid wrapper protocol`)
  }
  return protocol
}

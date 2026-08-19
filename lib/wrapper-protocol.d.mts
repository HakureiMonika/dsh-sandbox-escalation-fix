import { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
//#region src/wrapper-protocol.d.ts
declare const TOOL_WRAPPER_PROTOCOL: unique symbol;
interface WrapperContext {
  readonly toolName: string;
}
interface WrapperLayer {
  readonly owner: string;
  readonly priority: number;
  projectDescription?(value: string, context: WrapperContext): string;
  projectParameters?(value: Record<string, unknown>, context: WrapperContext): Record<string, unknown>;
  execute?(args: unknown, exec: ToolRunContext, next: (args: unknown) => Promise<unknown>): Promise<unknown>;
}
interface ToolWrapperProtocolV1 {
  readonly version: 1;
  readonly owner: string;
  readonly name: string;
  contribute(layer: WrapperLayer): () => void;
}
type CooperativeToolDefinition = ToolDefinition & {
  readonly [TOOL_WRAPPER_PROTOCOL]?: ToolWrapperProtocolV1;
};
declare function protocolOf(definition: ToolDefinition): ToolWrapperProtocolV1 | undefined;
//#endregion
export { CooperativeToolDefinition, TOOL_WRAPPER_PROTOCOL, ToolWrapperProtocolV1, WrapperContext, WrapperLayer, protocolOf };
//# sourceMappingURL=wrapper-protocol.d.mts.map
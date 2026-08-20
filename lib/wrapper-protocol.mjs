//#region src/wrapper-protocol.ts
const TOOL_WRAPPER_PROTOCOL = Symbol.for("dsh.tool-wrapper.v1");
function protocolOf(definition) {
	const protocol = definition[TOOL_WRAPPER_PROTOCOL];
	if (protocol === void 0) return void 0;
	if (protocol.version !== 1 || typeof protocol.owner !== "string" || typeof protocol.name !== "string" || typeof protocol.contribute !== "function") throw new Error(`dsh-sandbox-escalation-fix: tool "${definition.name}" exposes an invalid wrapper protocol`);
	return protocol;
}
//#endregion
export { TOOL_WRAPPER_PROTOCOL, protocolOf };

//# sourceMappingURL=wrapper-protocol.mjs.map
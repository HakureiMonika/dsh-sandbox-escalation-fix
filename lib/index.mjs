import { TOOL_WRAPPER_PROTOCOL, protocolOf } from "./wrapper-protocol.mjs";
import { createRequire } from "node:module";
import z from "@deepseek-ai/schemastery";
import { WIDER_MODES, escalationHintMarker, sandboxDenialMarker } from "@deepseek-ai/dsh-sandbox";
//#region src/compatibility.ts
const SUPPORTED_DSH_VERSIONS = [
	"0.1.0-rc.5",
	"0.1.0-rc.6",
	"0.1.0-rc.7",
	"0.1.0-rc.8"
];
const DSH_PACKAGES = [
	"@deepseek-ai/dsh-agent",
	"@deepseek-ai/dsh-llm",
	"@deepseek-ai/dsh-sandbox",
	"@deepseek-ai/dsh-sandbox-policy",
	"@deepseek-ai/dsh-scope",
	"@deepseek-ai/dsh-session",
	"@deepseek-ai/dsh-tools",
	"@deepseek-ai/dsh-user-approval"
];
const TARGET_NAMES = /* @__PURE__ */ new Set([
	"bash",
	"pwsh",
	"write",
	"edit"
]);
const ESCALATION_FIELDS = ["sandbox_permissions", "justification"];
const require = createRequire(import.meta.url);
function validateDshVersionSet(versions) {
	const unique = new Set(Object.values(versions));
	if (unique.size !== 1) {
		const detail = Object.entries(versions).map(([name, version]) => `${name}@${version}`).join(", ");
		throw new Error(`dsh-sandbox-escalation-fix: mixed DSH package versions are unsupported: ${detail}`);
	}
	const version = unique.values().next().value;
	if (version === void 0 || !SUPPORTED_DSH_VERSIONS.includes(version)) throw new Error(`dsh-sandbox-escalation-fix: unsupported DSH version "${version ?? "unknown"}"; supported versions: ${SUPPORTED_DSH_VERSIONS.join(", ")}`);
}
function validateDshRuntime() {
	const versions = {};
	for (const name of DSH_PACKAGES) {
		let manifest;
		try {
			manifest = require(`${name}/package.json`);
		} catch (error) {
			throw new Error(`dsh-sandbox-escalation-fix: cannot read ${name}/package.json`, { cause: error });
		}
		if (typeof manifest !== "object" || manifest === null || !("version" in manifest) || typeof manifest.version !== "string") throw new Error(`dsh-sandbox-escalation-fix: ${name}/package.json has no string version`);
		versions[name] = manifest.version;
	}
	validateDshVersionSet(versions);
}
function record(value, label) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`dsh-sandbox-escalation-fix: ${label} must be an object`);
	return value;
}
function validateTargetTool(definition) {
	if (!TARGET_NAMES.has(definition.name)) throw new Error(`dsh-sandbox-escalation-fix: unsupported target tool "${definition.name}"`);
	if (typeof definition.description !== "string" || typeof definition.execute !== "function") throw new Error(`dsh-sandbox-escalation-fix: tool "${definition.name}" has an incompatible definition`);
	const parameters = record(definition.parameters, `tool "${definition.name}" parameters`);
	if (parameters.type !== "object") throw new Error(`dsh-sandbox-escalation-fix: tool "${definition.name}" parameters must have type "object"`);
	record(parameters.properties, `tool "${definition.name}" parameters.properties`);
	const properties = parameters.properties;
	if (ESCALATION_FIELDS.filter((field) => properties[field] !== void 0).length === 1) throw new Error(`dsh-sandbox-escalation-fix: tool "${definition.name}" must expose sandbox_permissions and justification together or omit both`);
	const output = record(definition.output, `tool "${definition.name}" output`);
	if (typeof output.render !== "function" || typeof output.schema !== "object" || output.schema === null) throw new Error(`dsh-sandbox-escalation-fix: tool "${definition.name}" output contract is incompatible`);
}
//#endregion
//#region src/argument-normalization.ts
function normalizeEscalationArguments(args, effectiveMode) {
	if (typeof args !== "object" || args === null || Array.isArray(args)) return args;
	const record = args;
	if (!Object.hasOwn(record, "sandbox_permissions") || !Object.hasOwn(record, "justification")) return args;
	if (record.sandbox_permissions !== effectiveMode) return args;
	const normalized = { ...record };
	delete normalized.sandbox_permissions;
	delete normalized.justification;
	return normalized;
}
//#endregion
//#region src/description-projection.ts
const ESCALATION_START = " Attempting a command the sandbox may deny is safe and expected:";
function projectEscalationDescription(description, hasEscalationTargets) {
	if (hasEscalationTargets) return description;
	const first = description.indexOf(ESCALATION_START);
	if (first === -1) return description;
	if (description.indexOf(ESCALATION_START, first + 64) !== -1) throw new Error("dsh-sandbox-escalation-fix: shell description escalation anchor is ambiguous");
	return description.slice(0, first);
}
//#endregion
//#region src/policy.ts
function viableEscalationTargets(effectiveMode, approvalPolicy) {
	return approvalPolicy === "never" ? [] : WIDER_MODES[effectiveMode] ?? [];
}
function escalationPolicyFor(ctx, agent) {
	const effectiveMode = ctx.sandboxPolicy.resolve({ session: agent.session }).mode;
	const approvalPolicy = ctx.approval.overrideOf(agent.session) ?? ctx.approval.config.policy ?? "ask";
	return {
		effectiveMode,
		approvalPolicy,
		viableTargets: viableEscalationTargets(effectiveMode, approvalPolicy)
	};
}
//#endregion
//#region src/result-filter.ts
function removeEscalationHint(text, denialMarker, hint) {
	const lines = text.split("\n");
	if (!lines.includes(denialMarker) || !lines.includes(hint)) return text;
	return lines.filter((line) => line !== hint).join("\n");
}
function cleanSingleTextContent(content, denialMarker, hint) {
	if (content.length !== 1 || content[0]?.type !== "text") return void 0;
	const text = removeEscalationHint(content[0].text, denialMarker, hint);
	return text === content[0].text ? void 0 : [{
		type: "text",
		text
	}];
}
//#endregion
//#region src/schema-projection.ts
const SANDBOX_PERMISSIONS = "sandbox_permissions";
const JUSTIFICATION = "justification";
function objectRecord(value, label) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`dsh-sandbox-escalation-fix: ${label} must be an object`);
	return value;
}
function projectEscalationParameters(parameters, targets) {
	const projected = structuredClone(parameters);
	const root = objectRecord(projected, "tool parameters");
	if (root.type !== "object") throw new Error("dsh-sandbox-escalation-fix: tool parameters root must have type \"object\"");
	const properties = objectRecord(root.properties, "tool parameters.properties");
	const permissions = properties[SANDBOX_PERMISSIONS];
	const justification = properties[JUSTIFICATION];
	if (permissions === void 0 && justification === void 0) return projected;
	if (permissions === void 0 || justification === void 0) throw new Error("dsh-sandbox-escalation-fix: escalation schema must declare sandbox_permissions and justification together");
	const permissionsSchema = objectRecord(permissions, "sandbox_permissions schema");
	const justificationSchema = objectRecord(justification, "justification schema");
	if (permissionsSchema.type !== "string" || !Array.isArray(permissionsSchema.enum) || !permissionsSchema.enum.every((value) => typeof value === "string")) throw new Error("dsh-sandbox-escalation-fix: sandbox_permissions must be a string enum");
	if (justificationSchema.type !== "string") throw new Error("dsh-sandbox-escalation-fix: justification must be a string");
	if (targets.length === 0) {
		delete properties[SANDBOX_PERMISSIONS];
		delete properties[JUSTIFICATION];
		if (Array.isArray(root.required)) {
			const required = root.required.filter((value) => value !== SANDBOX_PERMISSIONS && value !== JUSTIFICATION);
			if (required.length === 0) delete root.required;
			else root.required = required;
		}
		return projected;
	}
	permissionsSchema.enum = [...targets];
	return projected;
}
//#endregion
//#region src/wrapper.ts
const PLUGIN_OWNER = "dsh-sandbox-escalation-fix";
function sortedLayers(layers) {
	return [...layers.values()].sort((left, right) => left.priority - right.priority || left.owner.localeCompare(right.owner));
}
function createWrapperBinding(initialDelegate, ownLayer) {
	let currentDelegate = initialDelegate;
	const layers = /* @__PURE__ */ new Map([[ownLayer.owner, ownLayer]]);
	const context = { toolName: initialDelegate.name };
	const delegate = () => currentDelegate;
	const release = (owner) => {
		layers.delete(owner);
	};
	const definition = {
		name: initialDelegate.name,
		get description() {
			const current = delegate();
			return sortedLayers(layers).reduce((value, layer) => layer.projectDescription?.(value, context) ?? value, current.description);
		},
		get parameters() {
			const current = delegate();
			return sortedLayers(layers).reduce((value, layer) => layer.projectParameters?.(value, context) ?? value, current.parameters);
		},
		get output() {
			return delegate().output;
		},
		execute(args, exec) {
			const currentDelegate = delegate();
			const active = sortedLayers(layers).filter((layer) => layer.execute !== void 0);
			const dispatch = (index, current) => {
				const layer = active[index];
				if (layer === void 0) return Reflect.apply(currentDelegate.execute, currentDelegate, [current, exec]);
				let called = false;
				return layer.execute(current, exec, (nextArgs) => {
					if (called) throw new Error(`dsh-sandbox-escalation-fix: wrapper "${layer.owner}" called next() more than once`);
					called = true;
					return dispatch(index + 1, nextArgs);
				});
			};
			return dispatch(0, args);
		},
		[TOOL_WRAPPER_PROTOCOL]: {
			version: 1,
			owner: PLUGIN_OWNER,
			name: initialDelegate.name,
			contribute(layer) {
				if (layers.has(layer.owner)) throw new Error(`dsh-sandbox-escalation-fix: wrapper owner "${layer.owner}" is already registered for "${initialDelegate.name}"`);
				layers.set(layer.owner, layer);
				let active = true;
				return () => {
					if (!active) return;
					active = false;
					release(layer.owner);
				};
			}
		}
	};
	Object.defineProperty(definition, "timeoutMs", {
		enumerable: true,
		get: () => delegate().timeoutMs
	});
	if (initialDelegate.finalizeContent !== void 0) definition.finalizeContent = (exec, result) => {
		const current = delegate();
		return current.finalizeContent?.call(current, exec, result);
	};
	if (initialDelegate.isConcurrencySafe !== void 0) definition.isConcurrencySafe = (args) => {
		const current = delegate();
		return current.isConcurrencySafe?.call(current, args) === true;
	};
	if (initialDelegate.presentCall !== void 0) definition.presentCall = (args) => {
		const current = delegate();
		return current.presentCall?.call(current, args);
	};
	if (initialDelegate.presentResult !== void 0) definition.presentResult = (args, result) => {
		const current = delegate();
		return current.presentResult?.call(current, args, result);
	};
	return {
		definition,
		updateDelegate(next) {
			if (next.name !== initialDelegate.name) throw new Error(`delegate name changed from "${initialDelegate.name}" to "${next.name}"`);
			currentDelegate = next;
		},
		contribute(layer) {
			return definition[TOOL_WRAPPER_PROTOCOL].contribute(layer);
		},
		releaseOwnLayer() {
			release(ownLayer.owner);
		}
	};
}
//#endregion
//#region src/supervisor.ts
const TARGET_TOOLS = [
	"bash",
	"pwsh",
	"write",
	"edit"
];
function visibleDelegate(ctx, agent, name) {
	return ctx.tools.get(name, agent);
}
function ownLayer(ctx, agent) {
	return {
		owner: PLUGIN_OWNER,
		priority: 100,
		projectDescription(value) {
			return projectEscalationDescription(value, escalationPolicyFor(ctx, agent).viableTargets.length > 0);
		},
		projectParameters(value) {
			return projectEscalationParameters(value, escalationPolicyFor(ctx, agent).viableTargets);
		},
		execute(args, exec, next) {
			return next(normalizeEscalationArguments(args, escalationPolicyFor(ctx, exec.agent ?? agent).effectiveMode));
		}
	};
}
function rewriteFsFailure(ctx, agent, result) {
	if (!result.isError || result.error.info?.code !== "FS_SANDBOX_DENIED") return result;
	const policy = escalationPolicyFor(ctx, agent);
	if (policy.viableTargets.length > 0) return result;
	const denial = sandboxDenialMarker(policy.effectiveMode);
	const hint = escalationHintMarker("operation");
	const message = removeEscalationHint(result.error.message, denial, hint);
	if (message === result.error.message) return result;
	return {
		...result,
		error: {
			...result.error,
			message
		},
		content: [{
			type: "text",
			text: `Error: ${message}`
		}]
	};
}
function rewriteSuccessfulDecision(ctx, agent, name, result, decision) {
	if (decision.kind === "block" || result.isError) return decision;
	const policy = escalationPolicyFor(ctx, agent);
	if (policy.viableTargets.length > 0) return decision;
	const denial = sandboxDenialMarker(policy.effectiveMode);
	const hint = escalationHintMarker("command");
	if (name === "job_output") {
		if (Object.hasOwn(decision, "value") || decision.content !== void 0) return {
			kind: "block",
			feedback: [{
				type: "text",
				text: "Conflicting plugins both attempted to rewrite job_output. Disable one result-rewriting plugin."
			}]
		};
		const value = result.value;
		if (typeof value !== "object" || value === null || Array.isArray(value)) return decision;
		const record = value;
		if (typeof record.text !== "string") return decision;
		const text = removeEscalationHint(record.text, denial, hint);
		return text === record.text ? decision : {
			kind: "accept",
			value: {
				...record,
				text
			}
		};
	}
	if (name !== "bash" && name !== "pwsh") return decision;
	if (Object.hasOwn(decision, "value")) return {
		kind: "block",
		feedback: [{
			type: "text",
			text: `Conflicting plugins both attempted to rewrite ${name}. Disable one result-rewriting plugin.`
		}]
	};
	const cleaned = cleanSingleTextContent(decision.content ?? result.content, denial, hint);
	return cleaned === void 0 ? decision : {
		kind: "accept",
		content: cleaned,
		...decision.additionalContexts ? { additionalContexts: decision.additionalContexts } : {}
	};
}
var Supervisor = class {
	ctx;
	states = /* @__PURE__ */ new Map();
	reconciling = 0;
	expectedToolChanges = 0;
	reconcilePending = false;
	constructor(ctx) {
		this.ctx = ctx;
	}
	start() {
		const stopCreated = this.ctx.on("agent/created", ({ agent }) => {
			this.install(agent);
		});
		const stopDisposed = this.ctx.on("agent/disposed", ({ agent }) => {
			try {
				this.remove(agent);
			} catch (error) {
				this.ctx.logger.warn(`dsh-sandbox-escalation-fix: agent "${agent.id}" cleanup failed: ${String(error)}`);
			}
		});
		const stopPreset = this.ctx.on("agent-preset/selected", (sessionId) => {
			const agent = this.ctx.agents.get(sessionId);
			if (agent !== void 0) this.reconcileAgent(agent);
		});
		const stopTools = this.ctx.on("tools/change", () => {
			if (this.expectedToolChanges > 0) {
				this.expectedToolChanges -= 1;
				return;
			}
			if (this.reconciling > 0) {
				this.reconcilePending = true;
				return;
			}
			this.reconcileAll();
		});
		for (const agent of this.ctx.agents.list()) this.install(agent);
		return () => {
			stopTools();
			stopPreset();
			stopDisposed();
			stopCreated();
			const states = [...this.states.values()];
			this.states.clear();
			for (const state of states) try {
				this.coordinate(() => this.disposeState(state));
			} catch (error) {
				this.ctx.logger.warn(`dsh-sandbox-escalation-fix: agent "${state.agent.id}" cleanup failed: ${String(error)}`);
			}
			return Promise.resolve();
		};
	}
	install(agent) {
		if (this.states.has(agent)) return;
		const targets = new Map(TARGET_TOOLS.map((name) => [name, {
			name,
			attachment: { kind: "dormant" }
		}]));
		const disposers = [];
		const state = {
			agent,
			targets,
			disposers,
			disposed: false
		};
		this.states.set(agent, state);
		try {
			this.coordinate(() => this.reconcileState(state, true));
			disposers.push(this.ctx.on("tools/execute", async (exec, next) => {
				const result = await next();
				return exec.agent === agent && (exec.name === "write" || exec.name === "edit") ? rewriteFsFailure(this.ctx, agent, result) : result;
			}, { prepend: true }));
			disposers.push(this.ctx.on("tools/post-execute", async (exec, result, next) => {
				const decision = await next();
				return exec.agent === agent ? rewriteSuccessfulDecision(this.ctx, agent, exec.name, result, decision) : decision;
			}, { prepend: true }));
		} catch (error) {
			this.states.delete(agent);
			this.coordinate(() => this.disposeState(state));
			throw error;
		}
	}
	remove(agent) {
		const state = this.states.get(agent);
		if (state === void 0) return;
		this.states.delete(agent);
		this.coordinate(() => this.disposeState(state));
	}
	reconcileAgent(agent) {
		if (this.reconciling > 0) return;
		const state = this.states.get(agent);
		if (state === void 0) return;
		this.coordinate(() => this.reconcileState(state, false));
	}
	reconcileAll() {
		if (this.reconciling > 0) return;
		this.coordinate(() => {
			for (const state of this.states.values()) this.reconcileState(state, false);
		});
	}
	reconcileState(state, strict) {
		if (state.disposed) return;
		for (const target of state.targets.values()) try {
			this.reconcileTarget(state.agent, target);
		} catch (error) {
			if (strict) throw error;
			this.reportFailure(state.agent, target, error);
		}
	}
	reconcileTarget(agent, target) {
		this.detachTarget(target);
		const delegate = visibleDelegate(this.ctx, agent, target.name);
		if (delegate === void 0) {
			delete target.lastReportedError;
			return;
		}
		try {
			validateTargetTool(delegate);
			const protocol = protocolOf(delegate);
			if (protocol !== void 0) target.attachment = {
				kind: "cooperative",
				release: protocol.contribute(ownLayer(this.ctx, agent))
			};
			else {
				const binding = target.binding ?? createWrapperBinding(delegate, ownLayer(this.ctx, agent));
				if (target.binding === void 0) target.binding = binding;
				else binding.updateDelegate(delegate);
				const registrationCtx = agent.ctx.extend({ fiber: this.ctx.fiber });
				target.attachment = {
					kind: "owned",
					unregister: this.mutateTools(() => registrationCtx.tools.register(binding.definition))
				};
			}
			delete target.lastReportedError;
		} catch (error) {
			target.attachment = {
				kind: "incompatible",
				reason: error instanceof Error ? error.message : String(error)
			};
			throw error;
		}
	}
	detachTarget(target) {
		const attachment = target.attachment;
		if (attachment.kind === "dormant") return;
		if (attachment.kind === "incompatible") {
			target.attachment = { kind: "dormant" };
			return;
		}
		if (attachment.kind === "owned") this.mutateTools(attachment.unregister);
		else attachment.release();
		target.attachment = { kind: "dormant" };
	}
	disposeState(state) {
		if (state.disposed) return;
		state.disposed = true;
		const errors = [];
		for (const target of [...state.targets.values()].reverse()) try {
			this.detachTarget(target);
		} catch (error) {
			errors.push(error);
		}
		for (const dispose of state.disposers.splice(0).reverse()) try {
			dispose();
		} catch (error) {
			errors.push(error);
		}
		if (errors.length > 0) throw new AggregateError(errors, `agent "${state.agent.id}" cleanup failed`);
	}
	reportFailure(agent, target, error) {
		const message = error instanceof Error ? error.message : String(error);
		if (target.lastReportedError === message) return;
		target.lastReportedError = message;
		this.ctx.logger.warn(`dsh-sandbox-escalation-fix: agent "${agent.id}" tool "${target.name}" dynamic reconciliation failed: ${message}`);
	}
	coordinate(action) {
		this.reconciling += 1;
		try {
			action();
		} finally {
			this.reconciling -= 1;
			if (this.reconciling === 0 && this.reconcilePending) {
				this.reconcilePending = false;
				this.reconcileAll();
			}
		}
	}
	mutateTools(action) {
		this.expectedToolChanges += 1;
		const expected = this.expectedToolChanges;
		try {
			return action();
		} finally {
			if (this.expectedToolChanges === expected) this.expectedToolChanges -= 1;
		}
	}
};
//#endregion
//#region src/index.ts
const Config = z.object({ logLevel: z.union([
	"silent",
	"info",
	"debug"
]).default("info") });
const name = "sandbox-escalation-fix";
const inject = [
	"agents",
	"tools",
	"sandboxPolicy",
	"approval"
];
function apply(ctx, config = {}) {
	validateDshRuntime();
	const supervisor = new Supervisor(ctx);
	ctx.effect(() => supervisor.start(), "sandbox-escalation-fix.lifecycle()");
	if ((config.logLevel ?? "info") !== "silent") ctx.logger.info("sandbox-escalation-fix: session-aware tool wrappers enabled");
}
var src_default = {
	name,
	inject,
	Config,
	apply
};
//#endregion
export { Config, apply, src_default as default, inject, name };

//# sourceMappingURL=index.mjs.map
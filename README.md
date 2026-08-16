# dsh-sandbox-escalation-fix

English | [中文](README.zh.md)

A zero-configuration compatibility plugin for DeepSeek Harness `0.1.0-rc.5` and `0.1.0-rc.6`. It prevents models from receiving or repeating sandbox escalation arguments that the current Sandbox Mode and Approval Policy cannot execute.

The plugin wraps `bash`, `pwsh`, `write`, and `edit` inside each Agent Exact Scope. Native tool schemas and the Code Mode SDK therefore read the same session-aware definitions. It also removes impossible escalation advice from foreground Shell failures, filesystem failures, Code Mode errors, and background `job_output` results.

> [!IMPORTANT]
> This is an independent community plugin. It is not published, maintained, or endorsed by DeepSeek. It does not modify DeepSeek Harness core packages.

## Why This Is More Than an Execution Workaround

Some compatibility fixes normalize arguments only after a model has already received an unusable tool schema. This plugin fixes the model-visible input, preserves DSH's security semantics at execution time, and keeps failure feedback consistent with the active policy.

| Capability | This plugin | Execution-only normalization |
|---|---|---|
| Hide impossible escalation fields from Native tools | yes, per session | no |
| Hide the same fields from the Code Mode SDK | yes, from the same exact-scope definition | no |
| Remove only an exact same-mode redundant request | yes | implementation-dependent |
| Preserve explicit downgrade and invalid requests for DSH validation | yes | not guaranteed |
| Preserve missing or blank `justification` for DSH validation | yes | not guaranteed |
| Remove impossible advice from descriptions and results | Shell, FS, Code Mode, and `job_output` | no |
| React to Agent, Preset, and tool lifecycle changes | yes | implementation-dependent |

The execution fallback is intentionally narrow: `requestedMode === effectiveMode` is treated as an idempotent duplicate. A request such as `danger-full-access → workspace-write` is not discarded and then executed with broader access. Missing or blank approval reasons are not replaced with invented placeholder text.

This plugin does not change `approveEscalation()`, grant permissions, auto-approve requests, or weaken the strictly-wider check. It changes what the model can validly request and removes one redundant same-mode pair before the original DSH tool handles the call.

## Compatibility

- Node.js `^22.19.0` or `>=24.0.0`
- `@deepseek-ai/dsh-*` `0.1.0-rc.5` or `0.1.0-rc.6`
- `@deepseek-ai/cordis` `4.0.1`

The plugin checks the installed DSH package versions at startup. Mixed rc.5/rc.6 installations, unknown DSH versions, partial escalation fields, and incompatible tool output definitions fail explicitly instead of silently changing tool behavior. A target tool that omits both escalation fields is accepted as already safe.

## Install From GitHub

Install into the exact Profile that runs the affected sessions. Pin a reviewed commit SHA because a Git dependency executes this package's `prepare` script during installation:

```sh
dsh plugin --profile <profile> add github:JUSTMONIKA2022/dsh-sandbox-escalation-fix#<commit-sha>
```

pnpm 10 blocks Git dependency build scripts until the Profile explicitly allows them. If the first installation reports a blocked build, add this entry to `$DSH_HOME/profiles/<profile>/pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-sandbox-escalation-fix: true
```

Run the installation command again, then inspect the composed configuration:

```sh
dsh --profile <profile> --dump-config
```

The output should contain a `dsh-sandbox-escalation-fix` bundle layer and the `sandbox-escalation-fix` plugin row. Start DSH normally after verification:

```sh
dsh --profile <profile>
```

## Manual Windows Installation

The detailed Windows walkthrough, including Profile paths, folder layout, nested `node_modules`, and the correct replacement for an empty `[]` patch, is available in [README.zh.md](README.zh.md#手动覆盖安装).

For a compact file-by-file walkthrough, see [Beginner-Friendly Installation Guide.txt](Beginner-Friendly%20Installation%20Guide.txt). The original Chinese layout is preserved in [奶龙也能看懂的食用说明.txt](奶龙也能看懂的食用说明.txt).

The minimum manual layout is:

```text
<profile-directory>\
├── cordis.patch.yml
└── node_modules\
    └── dsh-sandbox-escalation-fix\
        ├── package.json
        ├── cordis.patch.yml
        ├── README.md
        ├── README.zh.md
        └── lib\
            ├── index.mjs
            ├── index.d.mts
            ├── wrapper-protocol.mjs
            └── wrapper-protocol.d.mts
```

Merge this block into the Profile's `cordis.patch.yml`; do not overwrite unrelated Profile patches:

```yaml
- insert:
    - id: sandbox-escalation-fix
      name: dsh-sandbox-escalation-fix
```

Do not copy this repository's `node_modules` into the Profile. Multiple Cordis or DSH module instances can break Scope and Service identity.

## Behavior

| Effective Sandbox Mode | Approval Policy | Escalation targets visible to the model |
|---|---|---|
| `danger-full-access` | any | none |
| any mode | `never` | none |
| `workspace-write` | approval allowed | `danger-full-access` |
| `read-only` | approval allowed | `workspace-write`, `danger-full-access` |

When no escalation target is viable, the model-visible schemas for `bash`, `pwsh`, `write`, and `edit` omit both `sandbox_permissions` and `justification`. If a model still sends a paired request for the current mode, the wrapper removes that redundant pair before delegating to the original tool.

Downgrades, unknown targets, unpaired arguments, and genuine escalation requests remain subject to the original DSH validation and approval behavior. The plugin does not grant permissions, bypass approval, or widen the active sandbox.

## Model-Visible Effects

- Native tools and Code Mode expose the same session-aware schema.
- All Access sessions no longer advertise an impossible second upgrade to `danger-full-access`.
- Sandbox denial results do not retain escalation advice when the active policy cannot approve that escalation.
- The behavior applies to every model using the wrapped tools, not only OAI models.

## Verification Evidence

The test suite uses real DSH `SessionStore`, `ToolRuntime`, `AgentRegistry`, `SandboxPolicyService`, `ApprovalService`, and `SystemPrompt` packages rather than testing only isolated mocks. Its 20 tests cover the policy matrix, exact same-mode normalization, Native schema projection, Code Mode SDK generation, delegate replacement, wrapper cooperation and conflict rejection, Shell/FS/`job_output` feedback filtering, version checks, and plugin unload behavior.

The test suite does not replace model-provider E2E evidence. The manual checklist verifies the assembled Web session lifecycle and the affected OAI All Access workflow.

## Wrapper Conflicts

The plugin owns the `bash`, `pwsh`, `write`, and `edit` names inside each Agent Exact Scope. Another plugin may share those names only through the explicit `Symbol.for('dsh.tool-wrapper.v1')` protocol. Cooperative layers are ordered by `priority` and `owner`.

An unknown same-name wrapper causes Agent registration to fail explicitly. In that case, remove one of the conflicting plugins rather than relying on an undefined load order.

Protocol types are exported from:

```ts
import {
  TOOL_WRAPPER_PROTOCOL,
  type WrapperLayer,
  type ToolWrapperProtocolV1,
} from 'dsh-sandbox-escalation-fix/wrapper-protocol'
```

## Verify the Fix

After installing or updating the plugin, fully restart DSH and create a new session.

1. Select the previously affected OAI model.
2. Set Access Mode to All Access.
3. Ask the model to run `pwsh` and print the current directory.
4. Ask it to create a temporary file with `write`.
5. Ask it to update the file with `edit`, then read it back.
6. Switch workspaces and open existing sessions to confirm normal session restoration.

The calls should complete without `sandbox_permissions` argument errors or impossible escalation advice. Existing sessions should remain visible, workspace switching should work, and new sessions should be created in the selected workspace. The complete manual acceptance checklist is in [README.zh.md](README.zh.md#人工测试清单).

## Troubleshooting

- **The plugin does not load:** Confirm installation and startup use the same `--profile`, then inspect `--dump-config`.
- **A Git install cannot build:** Add the package to the Profile's `allowBuilds` map and retry the installation.
- **Startup rejects DSH versions:** Keep the relevant `@deepseek-ai/dsh-*` packages on one supported release candidate.
- **Agent registration reports a tool conflict:** Remove the incompatible same-name wrapper or update it to implement the wrapper protocol.
- **Escalation fields remain visible:** Test a new session and check whether a later plugin replaces the same tool names.
- **Manual installation breaks Scope behavior:** Remove the plugin's nested `node_modules` and verify that `package.json` is directly under the expected package directory.

## Uninstall

```sh
dsh plugin --profile <profile> remove dsh-sandbox-escalation-fix
```

The plugin lifecycle removes its wrapper hosts, wrapper layers, and result filters. Confirm that `--dump-config` no longer lists the bundle after removal.

## Development

```sh
npm install
npm test
npm run build
npm pack --dry-run
```

Git installation builds from source through the self-contained `prepare` script. Registry or tarball distribution may ship the generated `lib` files instead.

## License

[MIT](LICENSE)

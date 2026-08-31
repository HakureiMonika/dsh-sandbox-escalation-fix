# dsh-sandbox-escalation-fix (DSH 0.1.2-alpha.2 and Desktop 2.0.3 supported)

English | [简体中文](README.zh.md)

> [!IMPORTANT]
> This is an independent community plugin. It is not published, maintained, or endorsed by DeepSeek, and it does not modify DeepSeek Harness core packages.

> [!CAUTION]
> DSH `0.1.0-rc8`, `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.1`, and `0.1.2-alpha.2` partially improve this issue, but still use registry-global escalation schemas and execution-time validation. **Users should first observe the built-in behavior and install this plugin only after reproducing the same-mode escalation, blank justification, or retry-loop failures described below.**

> *If it's useful, please stars let more people can see it~ Thanks♪(･ω･)ﾉ*

**dsh-sandbox-escalation-fix** is a zero-configuration compatibility plugin that directly resolves the issue of third-party models like GPT failing to call tools such as `bash`, `pwsh`, `write`, and `edit` under DSH All Access, resulting in repeated retries due to incorrect sandbox escalation parameter prompts.

If you've encountered the following errors, this plugin is designed for them:

```text
Error: invalid justification: expected a non-empty sentence
Error: sandbox escalation to "danger-full-access" is not strictly wider than this call's current "danger-full-access" mode
Error: sandbox escalation to "workspace-write" is not strictly wider than this call's current "danger-full-access" mode
```

<details>
  <summary>Some minor explanations</summary>

  > DSH `0.1.1-rc.2` focuses on image handling: the DeepSeek adapter prefers Files API uploads, reuses uploaded files, and automatically resizes or converts images for model requirements. The sandbox escalation, Bash, Pwsh, ToolRuntime, and approval implementations used by this plugin are unchanged from `0.1.1-rc.1`, so rc.2 neither fixes the issue described here nor requires a plugin logic change.<br> <br>DSH `0.1.2-alpha.1` improves composition-level advertising: Bash, Pwsh, Write, and Edit omit escalation fields when no confining sandbox backend is mounted. DSH `0.1.2-alpha.2` does not add session-aware schema projection. Its published sandbox package still describes schemas as registry-global and the effective mode as per-call truth, keeps `workspace-write` and `danger-full-access` in the global target vocabulary, and checks strict widening during execution. `ctx.tools.schemas(scope)` still has no Session input, while `approval=never` adds a model instruction without removing escalation fields. Native tool calling and PTC Mode consume the same registered definition, so the issue addressed by this plugin remains possible.<br> <br>Compatibility with `0.1.2-alpha.2` uses the complete set of official public npm packages as the development and runtime integration baseline. The 36-test suite and TypeScript build run against the real alpha.2 Agent, ToolRuntime, Session Projection, Sandbox Policy, Approval, LLM, Scope, Session, and System Prompt contracts.<br> <br>Plugin `0.1.1-desktop.2` includes compatibility with DSH Desktop `2.0.3`. Desktop 2.0.3 deliberately limits its CommonJS package-manifest overlay to direct Profile anchors, so a third-party plugin cannot read host `@deepseek-ai/dsh-*/package.json` files from its own module. When all checked manifests are hidden uniformly, this plugin uses its existing strict runtime tool-contract validation instead. Partially readable manifests, mixed versions, malformed manifests, and incompatible tool definitions still fail closed.<br> <br>Linked and external plugin layouts are also supported. If `link:`, a workspace symlink, or an external plugin directory places the plugin outside the host dependency tree, the compatibility gate may read the complete DSH manifest set from the host working directory. One candidate root must provide the entire checked package set: partial roots, cross-root package mixing, malformed manifests, and non-resolution loader errors still fail closed. `DSH_HOME` is not treated as a dependency root because it stores Harness configuration and Profile data rather than a stable Node.js package tree.
</details>

## Contents

- [What It Does](#what-it-does)
- [The Problem It Solves](#the-problem-it-solves)
- [Before and After](#before-and-after)
- [Why This Plugin](#why-this-plugin)
- [Compatibility](#compatibility)
- [Install and Upgrade](#install-and-upgrade)
- [Uninstall](#uninstall)
- [Manual Windows Installation](#manual-windows-installation)
- [Verification, Behavior, and Plugin Cooperation](#verification-behavior-and-plugin-cooperation)
- [Troubleshooting](#troubleshooting)
- [Contributors](#contributors)
- [Development](#development)
- [License](#license)

## What It Does

This plugin makes DeepSeek Harness show the model **only the sandbox escalation options that the current session can actually use**.

In an All Access session (`danger-full-access` + `never`), the stock DSH tools still advertise `sandbox_permissions` and `justification` on `bash`, `pwsh`, `write`, and `edit`. But in that state:

- the session is already at the highest sandbox mode, so no wider mode exists;
- the approval policy is `never`, so every escalation request is rejected.

When a model fills in those parameters, the call fails before it runs. The model may then retry with different values and get stuck in a loop.

This plugin projects the model-visible tool schema per session, based on the live Sandbox Mode and Approval Policy. It also adds a minimal execution-time fallback for redundant same-mode requests.

## The Problem It Solves

- Models still see and send `sandbox_permissions` / `justification` in All Access sessions, so tools fail before they run.
- In `workspace-write` sessions, models see two escalation targets even though only `danger-full-access` is genuinely wider.
- With `approval=never`, models are still told escalation is possible when every request will be rejected.
- Tool descriptions and denial results keep saying ?escalation available,? which pushes the model to retry.
- Native Tool Call and PTC Mode SDK (formerly Code Mode) can show inconsistent capability surfaces.

### Why It Happens

DSH tools expose static escalation fields when they are registered, while the modes that can actually be requested depend on each session's current Sandbox Mode and Approval Policy. The original model-visible schema is not projected from that live session state before the request is built, so a model can receive escalation parameters that cannot succeed. Tool validation then rejects those requests before execution, which can start a retry loop.

## Before and After

Without the plugin, affected All Access sessions can repeatedly fail before the requested operation runs. The model alternates between an empty `justification`, a same-mode `danger-full-access` request, and even a downgrade request that DSH correctly rejects as not strictly wider.

### Before: Repeated Validation and Escalation Errors

![Before installation: repeated invalid justification and non-widening sandbox escalation errors](assets/before-errors-overview.png)

![Before installation: Edit and Pwsh repeatedly fail before completing the requested work](assets/before-repeated-errors.png)

### After: Tools Complete the Workflow

After installation, the same model can continue through Edit, Read, Pwsh, formatting, tests, lint, and type checking without entering the invalid escalation loop.

![After installation: Edit, Read, and Pwsh complete a multi-step development workflow](assets/after-successful-tools.png)

## Why This Plugin

### It fixes the root cause, not just the error

Some fixes only delete the arguments after the model has already received a broken schema. Calls stop failing, but the model keeps seeing and sending the same unusable parameters.

This plugin projects the model-visible schema from the session's real permission state:

| Current mode | Approval policy | What the model sees |
|---|---|---|
| `read-only` | `ask` | `workspace-write`, `danger-full-access` |
| `workspace-write` | `ask` | `danger-full-access` only |
| `danger-full-access` | `ask` | no escalation fields |
| any mode | `never` | no escalation fields |

When the model cannot see a parameter that cannot succeed, it stops reaching for it.

### It won't fix Native Tool Call but leave PTC Mode broken

Projection happens on the tool definition inside each Agent Exact Scope, so Native tool schemas and the PTC Mode SDK read the same result:

- Native tool schemas omit impossible escalation fields;
- PTC Mode TypeScript/Python SDKs omit them too;
- behavior stays identical across both modes.

### It won't silently swallow a downgrade request

The execution fallback is deliberately narrow: it removes `sandbox_permissions` and `justification` only when `requestedMode === effectiveMode`, treating that pair as an idempotent duplicate.

Downgrade or invalid requests are left untouched and go through normal DSH validation:

- `danger-full-access` + request `danger-full-access` ? ignored, tool runs normally;
- `danger-full-access` + request `workspace-write` ? not executed as Full access;
- `read-only` + a wider request ? enters the normal approval flow.

It will not trade a clear error for silently running a call with broader access than the caller asked for.

### It won't invent an approval reason

For genuine escalation requests, the plugin does not fill in a fake or placeholder justification. Missing, blank, or invalid reasons still go through DSH's own validation, so the approval flow sees honest, auditable input.

### It won't say ?don't escalate? while results say ?escalation available?

When the session has no viable escalation target, the plugin also cleans up the natural-language side:

- the escalation guidance tail is removed from Shell tool descriptions;
- impossible `escalation available` hints are removed from Shell, filesystem, PTC Mode, and `job_output` results.

The model no longer receives contradictory instructions from the parameter schema, the description, and the failure output.

### It won't modify or bypass DSH's security core

`approveEscalation()` keeps its strictly-wider check, approval flow, and one-shot authorization semantics. The plugin only projects the model-visible surface and removes one redundant same-mode pair before delegating:

- no removal of the strictly-wider check;
- no auto-approval when `approval=never`;
- no extra permissions;
- no changes to DSH installation or core packages.

### It won't treat every session the same

Wrapping happens per Agent/Session, never on the global tool registry. In the same process:

```text
Session A = read-only + ask              ? sees two escalation targets
Session B = danger-full-access + never   ? sees no escalation fields
```

Each session is independent. If a session switches permission state mid-flight, the next model request gets a freshly projected schema.

### It won't leave stale wrappers behind

The plugin listens to Agent creation, disposal, Preset changes, restrictions, and tool changes. When a dynamic Preset calls `agent.ctx.tools.restrict()`, the corresponding Exact Scope wrappers disappear synchronously with the restricted parent tools. Lifting the restriction restores the projected wrappers; tools absent during Agent creation are wrapped when they later become visible. Each Agent is coordinated independently, and disposed Agents or unloaded plugins restore the original definitions.

### It won't lock you to a single DSH release

The plugin supports DSH `0.1.0-rc.5`, `0.1.0-rc.6`, `0.1.0-rc.7`, `0.1.0-rc.8`, `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.1`, and `0.1.2-alpha.2`. At startup it verifies that the installed `@deepseek-ai/dsh-*` packages are consistent and supported. Incompatible tool definitions fail explicitly instead of producing silent misbehavior.

### It won't add configuration burden

Zero configuration. Install it into the Profile you actually use and start DSH as before. The test suite contains 36 tests, including runtime integration on the latest publicly available rc.2 packages and alpha.1 source-contract regression coverage for PTC Mode metadata, schema projection, dynamic restrictions, multi-Agent isolation, delegate and wrapper-protocol replacement, internal timeout-budget forwarding, failure-hint cleanup, and unload behavior.

### Compared with execution-only normalization

| Capability | This plugin | Execution-only normalization |
|---|---|---|
| Hide impossible escalation fields from Native tools | yes, per session | no |
| Hide the same fields from the PTC Mode SDK | yes, from the same exact-scope definition | no |
| Remove only an exact same-mode redundant request | yes | implementation-dependent |
| Preserve explicit downgrade and invalid requests for DSH validation | yes | not guaranteed |
| Preserve missing or blank `justification` for DSH validation | yes | not guaranteed |
| Remove impossible advice from descriptions and results | Shell, FS, PTC Mode, and `job_output` | no |
| React to Agent, Preset, and tool lifecycle changes | yes | implementation-dependent |

## Compatibility

- Node.js `^22.19.0` or `>=24.0.0`
- `@deepseek-ai/dsh-*` `0.1.0-rc.5`, `0.1.0-rc.6`, `0.1.0-rc.7`, `0.1.0-rc.8`, `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.1`, or `0.1.2-alpha.2`
- `@deepseek-ai/cordis` `^4.0.1`

The plugin checks the installed DSH package versions at startup. Mixed rc.5/rc.6/rc.7/rc.8/0.1.1-rc.1/0.1.1-rc.2/0.1.2-alpha.1/0.1.2-alpha.2 installations and unknown DSH versions fail explicitly. An initially visible target with partial escalation fields or an incompatible output definition rejects that Agent's registration; a target that omits both escalation fields is accepted as already safe. During runtime, a Preset restriction or stable provider removal makes the wrapper dormant, while an incompatible replacement is isolated to that Agent and target tool and reported without terminating the Host process. A later compatible definition is wrapped automatically.

## Install and Upgrade

The plugin is a zero-configuration fix. The recommended path is to download the Release ZIP and install it into the Profile that runs the affected sessions. Start DSH normally after installation:

```sh
dsh --profile <profile>
```

You do not need to change the model configuration, Sandbox Mode, Approval Policy, or Agent Preset. The plugin projects the model-visible parameters from each Session's current permission state.

### Release ZIP installation

The `0.1.2-alpha2` Release adds DSH `0.1.2-alpha.2` compatibility while retaining Desktop 2.0.3 support, the linked/external plugin resolution enhancement from PR #5, and the Git installation fix from PR #8. Download and extract `dsh-sandbox-escalation-fix-0.1.2-alpha2-release.zip`; it contains the tarball, one-click install and uninstall scripts, and a concise Chinese usage guide. Earlier Releases, including `v0.1.2-alpha1.1`, remain available.

Close DSH before installing or upgrading the plugin. Ensure that `dsh` is available on PATH and that the running DSH version is rc5, rc6, rc7, rc8, `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.1`, or `0.1.2-alpha.2`. Users should install only after reproducing the affected behavior.

#### Install into the default Web Profile

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install-release.ps1"
```

The script runs `dsh plugin --profile web add <tgz-absolute-path>`.

#### Install into another Profile

For example, use `headless` instead of the default `web` Profile:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install-release.ps1" -Profile headless
```

#### Build the Release ZIP

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\build-release.ps1"
```

The script builds `lib`, packages the npm tarball, then creates `dsh-sandbox-escalation-fix-0.1.2-alpha2-release.zip` in `release/`. The generated directory is ignored by Git; upload only this ZIP as the GitHub Release asset.

### Upgrade an existing installation

Close DSH before upgrading. The plugin package name, Bundle ID, and Profile patch row are unchanged, so an existing installation does not need another `cordis.patch.yml` entry.

#### GitHub commit installation

Run the same installation command with the new reviewed commit SHA:

```sh
dsh plugin --profile <profile> add github:<owner>/dsh-sandbox-escalation-fix#<new-commit-sha>
```

This updates the Profile dependency. The repository ships prebuilt `lib` files and the package defines no install-time build scripts, so pnpm never asks for an `allowBuilds` entry. Inspect `--dump-config`, then restart DSH.

#### Manual Web Profile installation

Use the repository or packaged source that contains the new built `lib` directory. Open Windows PowerShell in that plugin directory and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy-web-profile.ps1"
```

The script uses `$DSH_HOME` when set, otherwise `%USERPROFILE%\.dsh`. It replaces only the eight published `lib` artifacts, compares every SHA-256 hash, and prints `Deployment verified.` only when the installed Web Profile exactly matches the new build. It does not modify the Profile patch or copy `node_modules`. Restart DSH after verification.

### Command-line installation

Install into the exact Profile that runs the affected sessions and pin a reviewed commit SHA:

```sh
dsh plugin --profile <profile> add github:<owner>/dsh-sandbox-escalation-fix#<commit-sha>
```

The package has no `prepare` or other install-time build script: pnpm installs the committed, prebuilt `lib` directly and no `allowBuilds` allowlist entry is needed. Versions before the `prepare` removal did run a build on install; if such an old version left a `dsh-sandbox-escalation-fix@https://codeload.github.com/...` entry under `allowBuilds` in `$DSH_HOME/profiles/<profile>/pnpm-workspace.yaml`, that stale entry can be removed after upgrading.

Run the installation command again, then inspect the composed configuration:

```sh
dsh --profile <profile> --dump-config
```

The output should contain a `dsh-sandbox-escalation-fix` bundle layer and the `sandbox-escalation-fix` plugin row. Start DSH normally after verification:

```sh
dsh --profile <profile>
```

## Uninstall

From an extracted Release ZIP, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\uninstall-release.ps1"
```

Use `-Profile headless` or another Profile name when needed. The equivalent CLI command is:

```sh
dsh plugin --profile <profile> remove dsh-sandbox-escalation-fix
```

The plugin lifecycle removes its wrapper hosts, wrapper layers, and result filters. Restart DSH, then confirm that `--dump-config` no longer lists the bundle.

## Manual Windows Installation

A detailed Windows walkthrough ? Profile paths, folder layout, nested `node_modules`, and the correct replacement for an empty `[]` patch ? is available in [README.zh.md](README.zh.md#??????).

For a compact file-by-file walkthrough, see [Tutorials that even Peppa Pig can understand](Tutorials%20that%20even%20Peppa%20Pig%20can%20understand). The original Chinese layout is preserved in [???????????.txt](???????????.txt).

The minimum manual layout is:

```text
<profile-directory>\
??? cordis.patch.yml
??? node_modules\
    ??? dsh-sandbox-escalation-fix\
        ??? package.json
        ??? cordis.patch.yml
        ??? README.md
        ??? README.zh.md
        ??? lib\
            ??? index.mjs
            ??? index.d.mts
            ??? wrapper-protocol.mjs
            ??? wrapper-protocol.d.mts
```

Merge this block into the Profile's `cordis.patch.yml`; do not overwrite unrelated Profile patches:

```yaml
- insert:
    - id: sandbox-escalation-fix
      name: dsh-sandbox-escalation-fix
```

Do not copy this repository's `node_modules` into the Profile. Multiple Cordis or DSH module instances can break Scope and Service identity.

To update an existing installation, follow [Install and Upgrade](#install-and-upgrade); do not repeat the Profile patch step.

## Verification, Behavior, and Plugin Cooperation

### Behavior at a Glance

| Scenario | Plugin behavior |
|---|---|
| `danger-full-access`, or any mode with `never` | Model sees no `sandbox_permissions` / `justification` |
| `workspace-write` with approval allowed | Only `danger-full-access` is advertised |
| `read-only` with approval allowed | `workspace-write` and `danger-full-access` are advertised |
| Model sends the exact current mode as an escalation request | The redundant pair is removed, then the original tool runs |
| Downgrade, unknown target, unpaired arguments, genuine escalation | Left untouched for original DSH validation |
| No viable escalation target | Shell description escalation tail is removed; impossible hints are stripped from denial results |
| A dynamic Preset restricts a target tool | Its Exact Scope wrapper disappears in the same synchronous change |
| The restriction is lifted or the provider returns | The projected wrapper is restored automatically |
| A runtime replacement is incompatible | Only that Agent and target remain unwrapped until a compatible definition appears |

### Verify the Fix

After installing or updating the plugin, fully restart DSH and create a new session.

A successful Web startup proves that the Profile composes and the plugin loads without a process-level failure. For a source checkout, this command starts the Web profile directly:

```powershell
node --import tsx/esm apps/cli/src/bin.ts web
```

Run it with a supported Node.js version available on PATH. Wait for `dsh web: http://127.0.0.1:3080`, then perform the behavior checks below. Startup alone does not prove dynamic restriction behavior.

1. Select the previously affected OAI model.
2. Set Access Mode to All Access.
3. Ask the model to run `pwsh` and print the current directory.
4. Ask it to create a temporary file with `write`.
5. Ask it to update the file with `edit`, then read it back.
6. Switch workspaces and open existing sessions to confirm normal session restoration.
7. If the Preset uses `agent.ctx.tools.restrict()`, enter its restricted state and confirm hidden tools disappear; lift the restriction and confirm they return without recreating the Agent.

The calls should complete without `sandbox_permissions` argument errors or impossible escalation advice. Existing sessions should remain visible, workspace switching should work, and new sessions should be created in the selected workspace.

### Verification Evidence

The 36-test suite uses real DSH `SessionStore`, `ToolRuntime`, `AgentRegistry`, `SandboxPolicyService`, `ApprovalService`, and `SystemPrompt` packages rather than only isolated mocks. It covers the permission matrix, schema projection, PTC Mode SDK generation, dynamic restrictions, multi-Agent isolation, delegate replacement, cooperative wrappers, hint filtering, version checks, and unload behavior.

The complete official `0.1.2-alpha.2` package set is the current runtime integration baseline, including Session Projection, Agent, ToolRuntime, Sandbox Policy, Approval, LLM, Scope, Session, and System Prompt packages. Automated tests do not completely replace E2E validation with a real model provider.

### Wrapper Conflicts

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

## Troubleshooting

| Problem | What to do |
|---|---|
| The plugin does not load | Confirm installation and startup use the same `--profile`, then inspect `--dump-config` |
| A Git install is blocked by `allowBuilds` | The installed commit still carries the removed `prepare` script; pin a newer commit that ships prebuilt `lib` with no build scripts |
| Startup rejects DSH versions | Keep the relevant `@deepseek-ai/dsh-*` packages on one supported release candidate |
| Agent registration reports a tool conflict | Remove the incompatible same-name wrapper or update it to implement the wrapper protocol |
| A dynamic Preset hides tools | This is expected; the plugin mirrors `tools.restrict()` and restores wrappers when the restriction is lifted |
| A runtime reconciliation warning appears | Check the named target's replacement definition; other tools and Agents remain active while the plugin waits for a compatible definition |
| Escalation fields remain visible | Test a new session and check whether a later plugin replaces the same tool names |
| Manual installation breaks Scope behavior | Remove the plugin's nested `node_modules` and verify that `package.json` is directly under the expected package directory |

## Contributors

- [sprainJinyu](https://github.com/sprainJinyu) / 张金雨 — proposed the linked and external plugin package-resolution fallback in PR #5.
- [tappat225](https://github.com/tappat225) / tappat — removed the unnecessary Git dependency `prepare` step in PR #8, allowing installation without an `allowBuilds` entry.

## Development

```sh
npm install
npm test
npm run build
npm pack --dry-run
```

Git, registry and tarball installations all ship the committed, prebuilt `lib` files; no build scripts run during installation, so pnpm never requires an `allowBuilds` entry. Run `npm run build` locally after changing `src` and commit the refreshed `lib`.

## License

[MIT](LICENSE)

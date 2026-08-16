# dsh-sandbox-escalation-fix

[English](README.md) | 中文

> [!IMPORTANT]
> 这是独立开发的社区插件，不是 DeepSeek 官方发布、维护或背书的插件。

DeepSeek Harness `0.1.0-rc.5` / `0.1.0-rc.6` 兼容插件。它按每个 Agent 的实际 Sandbox Mode 和 Approval Policy 动态修正 `bash`、`pwsh`、`write`、`edit` 的升级参数广告，并清理无法执行的前台 Shell、FS 失败及 `job_output` 升级提示。

插件不修改 DSH 核心包。Native Tool Schema 与 Code Mode SDK 都从 Agent Exact Scope 的同一份包装定义读取，因此对所有模型统一生效。

## 不只是执行期止血

有些兼容修复只在模型已经拿到不可用 Schema 之后，于工具执行前删除参数。本插件同时修复模型可见输入、执行期安全语义和失败反馈，使三者与当前 Session 的权限状态一致。

| 能力 | 本插件 | 仅执行期参数正规化 |
|---|---|---|
| 从 Native Tool Schema 隐藏不可执行升级字段 | 支持，按 Session 动态投影 | 不支持 |
| 从 Code Mode SDK 隐藏相同字段 | 支持，与 Native 读取同一 Agent Exact Scope 定义 | 不支持 |
| 只删除精确同模式的冗余请求 | 支持 | 取决于实现 |
| 保留显式降级和非法请求给 DSH 校验 | 支持 | 不保证 |
| 保留缺失或空白 `justification` 给 DSH 校验 | 支持 | 不保证 |
| 清理描述与结果中的无效升级建议 | 覆盖 Shell、FS、Code Mode、`job_output` | 不支持 |
| 响应 Agent、Preset 和工具生命周期变化 | 支持 | 取决于实现 |

执行期兜底只处理 `requestedMode === effectiveMode`：这类请求是对当前权限的幂等重复。`danger-full-access → workspace-write` 等显式降级请求不会被删除后按更宽权限执行；缺失或空白的审批理由也不会被替换为虚构占位文本。

插件不修改 `approveEscalation()`，不授予权限，不自动批准请求，也不削弱严格变宽检查。它只修正模型可以合法请求的参数，并在原 DSH 工具接管调用前删除一对精确同模式的冗余参数。

## 快速使用

插件为零配置修复。安装到实际使用的 Profile 后，继续按原方式启动 DSH 即可：

```sh
dsh --profile <profile>
```

无需修改模型配置、Sandbox Mode、Approval Policy 或 Agent Preset。插件会按每个 Session 的当前权限状态动态决定模型可见参数。

## 手动覆盖安装

这是 Windows 下不使用插件安装命令的推荐方式。它只修改指定 Profile，不修改 DSH 安装目录或核心包。

需要更短的逐文件教程时，可查看 [奶龙也能看懂的食用说明.txt](奶龙也能看懂的食用说明.txt)；其英文对应版为 [Beginner-Friendly Installation Guide.txt](Beginner-Friendly%20Installation%20Guide.txt)。

### 开始前先确认

- 本教程中的“Profile 根目录”不是 `.dsh`，而是当前实际启动的 Profile 目录。
- 使用 Web Profile 时，Profile 根目录就是 `%USERPROFILE%\.dsh\profiles\web`。
- 要修改的是 `profiles\web\cordis.patch.yml`；`.dsh` 根目录下没有该文件并不异常。
- 可以直接复制整个 `dsh-sandbox-escalation-fix` 文件夹，但复制后必须删除插件目录内部的 `node_modules`。
- Profile Patch 使用 YAML 块列表；不要给配置加引号，也不要自行添加 `[` 或 `]`。

### 1. 关闭 DSH

退出正在运行的 Web、桌面端或 Headless 进程，避免旧插件文件仍被 Node.js 占用。

### 2. 打开 Profile 目录

默认 Harness Home 是：

```text
C:\Users\<你的用户名>\.dsh
```

目标 Profile 目录是：

```text
C:\Users\<你的用户名>\.dsh\profiles\<profile>
```

例如 Web Profile 通常是：

```text
C:\Users\<你的用户名>\.dsh\profiles\web
```

可直接在 Windows 资源管理器地址栏输入：

```text
%USERPROFILE%\.dsh\profiles\web
```

如果配置过 `DSH_HOME`，请把上面的 `C:\Users\<你的用户名>\.dsh` 换成实际目录。若 `profiles\web` 尚不存在，先正常启动一次 DSH Web，让它初始化 Profile。

这里所说的 Profile 根目录即：

```text
%USERPROFILE%\.dsh\profiles\web
```

不是：

```text
%USERPROFILE%\.dsh
```

因此，看到 `.dsh` 根目录没有 `cordis.patch.yml` 时，不需要创建；继续进入 `profiles\web` 修改其中已有的文件。

### 3. 覆盖插件目录

在目标 Profile 中创建以下目录：

```text
<Profile目录>\node_modules\dsh-sandbox-escalation-fix
```

当前本地构建的源目录是：

```text
D:\deepseek-harness\plugins\dsh-sandbox-escalation-fix
```

Web Profile 的默认目标目录是：

```text
%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-sandbox-escalation-fix
```

如果该目录已经存在，先将整个目录改名为：

```text
dsh-sandbox-escalation-fix.backup
```

然后从本项目目录复制以下内容到新的 `dsh-sandbox-escalation-fix` 目录：

```text
package.json
cordis.patch.yml
README.md
lib\
```

也可以直接把整个 `dsh-sandbox-escalation-fix` 文件夹复制到 Profile 的 `node_modules`。这种方式可以运行，但复制完成后必须删除：

```text
<Profile目录>\node_modules\dsh-sandbox-escalation-fix\node_modules
```

嵌套的 `node_modules` 可能携带另一套 Cordis 和 DSH 包，导致 Scope、Service 或错误类型来自不同实例。`src`、`tests`、`package-lock.json` 和 TypeScript 配置留在目标目录通常不会影响运行，只是没有必要。

复制完成后的结构应为：

```text
<Profile目录>\
├── cordis.patch.yml
├── package.json
└── node_modules\
    └── dsh-sandbox-escalation-fix\
        ├── package.json
        ├── cordis.patch.yml
        ├── README.md
        └── lib\
            ├── index.mjs
            ├── index.d.mts
            ├── wrapper-protocol.mjs
            └── wrapper-protocol.d.mts
```

不要复制本项目的 `node_modules`。也不需要复制 `src`、`tests`、`tsconfig.json` 或构建工具配置。手动安装包必须已经包含 `lib\index.mjs`；只有源码而没有 `lib` 的 ZIP 不能直接使用此方法。

不要把插件自己的 `cordis.patch.yml` 直接覆盖到 Profile 根目录；Profile 根目录中的同名文件可能包含其他用户配置，必须按下一步手动合并。

还要确认没有多套一层同名目录。正确入口是：

```text
<Profile目录>\node_modules\dsh-sandbox-escalation-fix\package.json
<Profile目录>\node_modules\dsh-sandbox-escalation-fix\lib\index.mjs
```

以下结构是错误的：

```text
<Profile目录>\node_modules\dsh-sandbox-escalation-fix\dsh-sandbox-escalation-fix\package.json
```

### 4. 修改 Profile Patch

用记事本或其他纯文本编辑器打开：

```text
<Profile目录>\cordis.patch.yml
```

如果文件内容只有 `[]`，将其完整替换为：

```yaml
- insert:
    - id: sandbox-escalation-fix
      name: dsh-sandbox-escalation-fix
```

例如，初始文件为：

```yaml
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
[]
```

修改后的完整文件应为：

```yaml
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
- insert:
    - id: sandbox-escalation-fix
      name: dsh-sandbox-escalation-fix
```

顶部注释可以保留，只替换最后一行 `[]`。

以下两种写法都不要使用：

```yaml
[- insert:
    - id: sandbox-escalation-fix
      name: dsh-sandbox-escalation-fix
```

```yaml
- insert:
    - id: sandbox-escalation-fix
      name: dsh-sandbox-escalation-fix]
```

正确写法不带方括号、不带引号，且 `- insert:` 必须顶格。请使用空格缩进，不要使用 Tab。

如果文件已有其他配置，不要覆盖原内容。在文件末尾追加同一个顶层 Patch：

```yaml
- insert:
    - id: sandbox-escalation-fix
      name: dsh-sandbox-escalation-fix
```

同一个文件中只能保留一个 `id: sandbox-escalation-fix`，不要重复追加。此手动方式不要求修改 Profile 的 `package.json`，因为插件由 Profile Patch 直接加载。

### 5. 重启并验证

按原来的方式启动该 Profile，新建 Session，然后在 All Access 下要求模型执行简单 Shell 命令或写入文件。

修复生效时，OAI 系列模型不再因为重复发送 `danger-full-access` 升级参数而导致工具调用失败。若仍看到旧行为，请确认修改的是当前实际启动的 Profile，并彻底退出 DSH 后重新启动。

### 安装后检查表

- `profiles\web\cordis.patch.yml` 中只有一个 `id: sandbox-escalation-fix`。
- Patch 中没有 `[`、`]` 或包住整段配置的引号。
- 插件的 `package.json` 直接位于 `node_modules\dsh-sandbox-escalation-fix` 下。
- 插件目录包含 `lib\index.mjs`。
- 插件目录内部不存在第二个 `node_modules`。
- DSH 已完全退出并重启。
- 测试使用的是重启后新建的 Session。

### 手动更新

关闭 DSH，将新的 `package.json`、`cordis.patch.yml`、`README.md` 和整个 `lib` 目录覆盖到 Profile 的插件目录即可。Profile Patch 已存在时不需要再次修改。

### 手动回退

1. 关闭 DSH。
2. 从 `<Profile目录>\cordis.patch.yml` 删除 `sandbox-escalation-fix` 的整个 `- insert:` 块。
3. 删除 `<Profile目录>\node_modules\dsh-sandbox-escalation-fix`。
4. 如果保留了 `.backup`，将其改回原名；否则直接重启 DSH。

## 命令行安装

建议从可信仓库锁定 Commit SHA 安装到指定 Profile：

```sh
dsh plugin --profile <profile> add github:<owner>/dsh-sandbox-escalation-fix#<commit-sha>
```

在发布到 GitHub 前，也可以从本地目录安装：

```sh
dsh plugin --profile <profile> add D:/deepseek-harness/plugins/dsh-sandbox-escalation-fix
```

Git 安装会运行本包的 `prepare` 构建脚本。pnpm 10 首次可能拒绝执行；按 DSH 输出提示，在该 Profile 的 `pnpm-workspace.yaml` 中加入：

```yaml
allowBuilds:
  dsh-sandbox-escalation-fix: true
```

然后重新执行安装命令，并检查最终组合：

```sh
dsh --profile <profile> --dump-config
```

输出中应包含 `dsh-sandbox-escalation-fix` 层和 `sandbox-escalation-fix` 行。

## 验证修复

1. 使用安装插件的 Profile 启动 DSH。
2. 选择原先在 All Access 下受影响的 OAI 系列模型。
3. 将权限设置为 All Access，对应 `danger-full-access` 与 Approval Policy `never`。
4. 新建 Session，让 Agent Scope 在插件已加载的状态下创建。
5. 要求模型执行一条简单 Shell 命令或写入工作区文件。

修复生效时：

- 模型可见的 `bash`、`pwsh`、`write`、`edit` Schema 不再包含 `sandbox_permissions` 和 `justification`。
- 模型即使发送与当前模式相同的冗余升级参数，工具也会删除这对参数后正常委托。
- Sandbox 拒绝结果不会继续提示一个当前策略无法执行的升级动作。

修改插件安装状态、Profile 或 Preset 后，建议新建 Session 验证，避免把旧 Agent Scope 的行为误认为当前配置。

## 人工测试清单

每项测试建议使用重启后新建的 Session。涉及文件写入的项目使用专门的临时目录，完成后删除测试文件。

### Web 与会话生命周期

- [ ] 刷新 Web 后，已有会话仍显示在原工作区。
- [ ] 依次点击至少三个已有会话；每个会话都能打开，不会从列表临时消失。
- [ ] 在两个工作区之间来回切换；列表和当前工作区标题同步变化。
- [ ] 在工作区 A 新建会话；新会话保留在工作区 A，且可以正常发送第一条消息。
- [ ] 在工作区 B 新建会话；新会话保留在工作区 B，不会跳回工作区 A。
- [ ] 刷新 Web 后，刚创建的会话仍存在并能重新打开。
- [ ] 关闭并重新启动 DSH 后，再次打开旧会话和新会话均正常。

### OAI 模型与 All Access

将模型切换为受影响的 OAI 系列模型，并将 Access Mode 设为 All Access。

- [ ] 发送“使用 pwsh 输出当前目录”；工具成功执行，没有 `sandbox_permissions` 参数错误。
- [ ] 发送“使用 pwsh 输出数字 12345”；结果包含 `12345`，且没有无效升级提示。
- [ ] 发送“读取测试目录中的 sample.txt”；读取工具返回文件内容。
- [ ] 发送“创建 plugin-smoke.txt，内容为 smoke-test”；写入工具成功。
- [ ] 发送“将 plugin-smoke.txt 中的 smoke-test 改为 smoke-test-updated”；编辑工具成功。
- [ ] 再次读取该文件；结果为 `smoke-test-updated`。
- [ ] 删除人工测试产生的文件，确认工作区没有残留。

### 权限矩阵

- [ ] `danger-full-access` + `never`：Shell、write、edit 正常执行，不出现要求再次升级到 `danger-full-access` 的提示。
- [ ] `workspace-write` + `ask`：工作区内写入正常；需要更高权限的操作仍可请求 `danger-full-access`。
- [ ] `read-only` + `ask`：读取正常；写入操作仍按 DSH 原策略请求 `workspace-write` 或更高权限。
- [ ] 任意 Mode + `never`：不会向模型提供无法获批的升级路径。

### Preset 与 Code Mode

- [ ] 在可用的两个 Agent Preset 之间切换后，新建 Session，pwsh 与文件工具仍正常。
- [ ] 如果使用 Code Mode，程序内调用 pwsh、读取和写入工具均正常，错误消息不包含无法执行的升级建议。
- [ ] 切回 Native Tool 模式后，工具行为保持一致。

### 冲突与稳定性

- [ ] 连续新建和关闭多个 Session，Web 不出现会话临时消失或工作区无法切换。
- [ ] 执行工具失败时，失败应显示为当前工具错误，不应使会话从列表消失。
- [ ] 浏览器刷新后，所有会话和工作区状态仍可恢复。
- [ ] DSH 启动日志中没有 `has no scope key`、`installation failed` 或同名工具注册错误。

全部通过后，可认为会话生命周期、OAI All Access、Native/Code Mode 和主要权限路径均已人工验收。

## 验证证据

自动测试直接使用真实 DSH `SessionStore`、`ToolRuntime`、`AgentRegistry`、`SandboxPolicyService`、`ApprovalService` 和 `SystemPrompt` 包，而不只测试隔离 Mock。20 项测试覆盖权限矩阵、精确同模式正规化、Native Schema 投影、Code Mode SDK 生成、Delegate 替换、包装协作与冲突拒绝、Shell/FS/`job_output` 提示过滤、版本检查和插件卸载失效。

自动测试不能替代真实模型 Provider 的 E2E 证据。上方人工清单用于验证完整 Web 会话生命周期和受影响的 OAI All Access 工作流。

## 行为

- `danger-full-access` 或 Approval Policy 为 `never` 时，不向模型广告 `sandbox_permissions` 与 `justification`。
- `workspace-write` 且允许审批时，只广告 `danger-full-access`。
- `read-only` 且允许审批时，广告 `workspace-write` 与 `danger-full-access`。
- 模型发送与当前模式完全相同的冗余升级参数时，包装器删除这一对参数后委托原工具。
- 降级、未知目标、缺少配对参数和真实升级请求仍交给原工具严格验证。
- 无合法升级目标时，删除 Shell 描述尾部的升级说明，并清理与 Sandbox Denial Marker 同时出现的无效提示。

## 冲突

插件占用每个 Agent Exact Scope 中的 `bash`、`pwsh`、`write`、`edit` 名称。

另一个包装插件只有在同名工具暴露 `Symbol.for('dsh.tool-wrapper.v1')` 协议时才能链式协作。包装层按 `priority`、`owner` 稳定排序。未知同名工具会让 Agent 注册严格失败，避免静默改变包装顺序或错误语义；此时必须由用户选择保留其中一个插件。

协议类型可从以下入口导入：

```ts
import {
  TOOL_WRAPPER_PROTOCOL,
  type WrapperLayer,
  type ToolWrapperProtocolV1,
} from 'dsh-sandbox-escalation-fix/wrapper-protocol'
```

## 卸载

```sh
dsh plugin --profile <profile> remove dsh-sandbox-escalation-fix
```

卸载会移除本插件创建的包装 Host、包装层和结果过滤器。显式协作层必须随其自身插件生命周期释放；本插件 Host 卸载时，这些层也会一并失效。

卸载后可再次检查组合：

```sh
dsh --profile <profile> --dump-config
```

输出中不应再出现 `dsh-sandbox-escalation-fix` 层。

## 故障排查

- **安装后没有生效：**确认安装和启动使用同一个 `--profile`，并通过 `--dump-config` 检查插件层。
- **`.dsh` 根目录没有 `cordis.patch.yml`：**这是正常的；Web Profile 应修改 `.dsh\profiles\web\cordis.patch.yml`。
- **不知道 `[]` 怎么改：**保留注释，只把独占一行的 `[]` 替换为不带方括号的 `- insert:` YAML 块。
- **复制了整个开发文件夹：**可以保留，但必须删除目标插件目录内部的 `node_modules`，并确认没有多套一层同名目录。
- **YAML 启动报错：**检查 `- insert:` 是否顶格、是否误加了方括号或引号，以及缩进是否只使用空格。
- **Git 安装构建失败：**确认 Profile 的 `pnpm-workspace.yaml` 已允许构建 `dsh-sandbox-escalation-fix`，然后重新安装。
- **启动时报版本错误：**不要混装 rc.5 与 rc.6 包；让 Profile 中关键 `@deepseek-ai/dsh-*` 包保持同一版本。
- **Agent 注册时报同名工具冲突：**另一个插件已在 Agent Exact Scope 注册 `bash`、`pwsh`、`write` 或 `edit`，且未实现协作协议；只能卸载其中一个。
- **升级字段仍然出现：**确认查看的是安装后新建 Session 的 Schema，并确认没有后加载的插件替换同名工具。

## 支持范围

- Node.js `^22.19.0` 或 `>=24.0.0`
- `@deepseek-ai/dsh-*` `0.1.0-rc.5`、`0.1.0-rc.6`
- `@deepseek-ai/cordis` `4.0.1`

插件针对这些版本的公开 Scope、ToolRuntime、Sandbox Policy 与 Approval Service 契约构建。目标工具定义或同 Scope 包装协议不兼容时会严格失败。

启动时会读取关键 `@deepseek-ai/dsh-*` 包的实际版本；rc.5/rc.6 混装或未知版本会拒绝启动。目标工具同时省略两个升级字段时视为已经安全，只有字段结构残缺或输出契约不兼容时才严格失败。

## 开发验证

```sh
npm install
npm test
npm run build
```

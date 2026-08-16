# dsh-sandbox-escalation-fix

[English](README.md) | 中文

> [!IMPORTANT]
> 这是独立开发的社区插件，不是 DeepSeek 官方发布、维护或背书的插件。它不会修改 DeepSeek Harness 的核心代码。

## 目录

- [这是什么？](#这是什么)
- [它能解决什么问题？](#它能解决什么问题)
- [安装前后对比](#安装前后对比)
- [为什么选择它？](#为什么选择它)
- [与其他“仅执行期止血”方案的区别](#与其他仅执行期止血方案的区别)
- [快速使用](#快速使用)
- [手动覆盖安装（Windows）](#手动覆盖安装windows)
- [命令行安装](#命令行安装)
- [验证修复](#验证修复)
- [人工测试清单](#人工测试清单)
- [验证证据](#验证证据)
- [插件行为一览](#插件行为一览)
- [与其他包装插件协作](#与其他包装插件协作)
- [卸载](#卸载)
- [故障排查](#故障排查)
- [支持范围](#支持范围)
- [开发验证](#开发验证)

## 这是什么？

一句话说明：**这个插件让 DeepSeek Harness 只把“当前会话真正能用”的沙箱升级选项展示给模型。**

在 `danger-full-access + approval=never` 这类 All Access 会话里，DSH 原版仍然会在 `bash`、`pwsh`、`write`、`edit` 工具中向模型展示 `sandbox_permissions` 和 `justification` 两个参数。但此时：

- 当前权限已经是最高级，没有更宽的权限可以升；
- 审批策略又是 `never`，所有审批请求都会被自动拒绝。

于是模型一旦填写这两个参数，调用就会在执行前失败，然后模型可能反复重试，陷入“报错 → 换参数 → 再报错”的循环。

本插件会根据**每个 Session 当前的 Sandbox Mode 和 Approval Policy**，动态调整模型看到的工具参数和说明；同时在执行前做一层最小兜底，把同模式的冗余请求安全地处理掉。

## 它能解决什么问题？

- 模型在 All Access 下仍能看到并填写 `sandbox_permissions` / `justification`，导致工具还没执行就报错。
- 模型在 `workspace-write` 下看到两个升级目标，但其实只有 `danger-full-access` 是真正更宽的选项。
- 模型在 `approval=never` 下仍然被提示“可以升级”，但所有升级都会被拒绝。
- 工具描述和错误结果里继续出现“升级可用”的提示，诱导模型反复重试。
- Native Tool Call 和 Code Mode SDK 展示不一致，一边修好了、另一边还在误导模型。

### 问题成因

DSH 工具注册时会公开静态的升级字段，但真正可以请求的升级目标取决于每个 Session 当前的 Sandbox Mode 和 Approval Policy。原始模型可见 Schema 在构造请求前没有根据实时会话状态重新投影，因此即使当前权限已经最高或审批已被禁止，模型仍可能收到无法成功执行的升级参数。工具随后会在执行前拒绝这些请求，模型便可能进入反复修改参数并重试的循环。

## 安装前后对比

未安装插件时，受影响的 All Access Session 可能在实际操作开始前反复失败。模型会在空白 `justification`、同模式 `danger-full-access` 请求，甚至会被 DSH 正确拒绝的降级请求之间循环。

### 安装前：参数校验与升级错误反复出现

![安装前：invalid justification 与非严格变宽的 Sandbox 升级错误反复出现](assets/before-errors-overview.png)

![安装前：Edit 与 Pwsh 在完成实际工作前反复失败](assets/before-repeated-errors.png)

<br>红彤彤的真喜庆。

### 安装后：工具可以连续完成工作流

安装插件后，同一模型可以连续执行 Edit、Read、Pwsh、格式化、测试、Lint 和 Type Check，不再进入无效升级循环。

![安装后：Edit、Read 与 Pwsh 连续完成多步骤开发工作流](assets/after-successful-tools.png)

<br>效果非常显著。

## 为什么选择它？

### 它解决的是根因，而不是只让报错消失

很多修复方案只在模型已经拿到错误 Schema 之后，于执行前把参数删掉。这样做调用虽然不报错了，但模型仍然会继续看到、继续发送这些无效参数。

本插件会按每个 Session 的实时权限状态，动态投影模型真正可见的工具参数：

| 当前模式 | 审批策略 | 模型看到的结果 |
|---|---|---|
| `read-only` | `ask` | `workspace-write`、`danger-full-access` |
| `workspace-write` | `ask` | 仅 `danger-full-access` |
| `danger-full-access` | `ask` | 不展示升级参数 |
| 任意模式 | `never` | 不展示升级参数 |

模型看不到当前不可能成功的参数，自然就不会去使用它。

### 它不会只修 Native Tool Call，而漏掉 Code Mode

插件的参数投影发生在 Agent 精确作用域的工具定义上。原生工具调用和 Code Mode SDK 读取的是同一份投影结果：

- 原生工具 Schema 里不会出现无效升级字段；
- Code Mode 生成的 TypeScript/Python SDK 里同样不会出现；
- 两种模式的行为始终一致。

不会出现“原生调用已经修好，模型走 `run_code` 仍然看到并误用旧参数”的半成品状态。

### 它不会静默吞掉降级请求

执行兜底只做一件非常克制的事：当且仅当 `requestedMode === effectiveMode` 时，把冗余参数视为幂等请求并移除，然后按普通调用执行。

对于降级请求或非法值，插件会原样保留，交给 DSH 原有的安全逻辑处理：

- `danger-full-access` 下请求 `danger-full-access` → 忽略，正常执行；
- `danger-full-access` 下请求 `workspace-write` → 不会被擅自当成 Full access 执行；
- `read-only` 下请求更宽模式 → 原样进入审批流程。

它不会为了“少报一个错”，就把调用者显式要求的更窄权限静默替换成更宽权限。

### 它不会自动填充一个虚假的审批理由

对于真正需要升级的请求，插件不会自动编造或填充占位 justification。缺失、空白或非法的理由仍然由 DSH 原有校验逻辑处理，保证审批流程看到的信息真实、可审计。

### 它不会一边说“不要升级”，一边又在结果里提示“升级可用”

当会话没有合法升级目标时，插件除了隐藏参数，还会同步处理模型看到的自然语言：

- 工具描述中的升级引导段落会被裁剪；
- Shell、文件工具和 `job_output` 结果中已不成立的 `escalation available` 提示会被清理。

模型看到的参数、描述和执行结果不会再互相矛盾。

### 它不会修改或绕过 DSH 的安全核心

`approveEscalation()` 的严格变宽检查、审批流程、一次性授权语义都保持原样。插件只做模型可见面的投影和调用前的最小兼容处理：

- 不删除严格变宽检查；
- 不在 `approval=never` 时自动批准升级；
- 不授予任何额外权限；
- 不修改 DSH 安装目录或核心包。

### 它不会把同一进程里的不同 Session 一刀切

插件按 Agent/Session 独立包装，不修改全局工具注册表。因此同一个进程中：

```text
Session A = read-only + ask              → 看到两个升级目标
Session B = danger-full-access + never   → 看不到升级字段
```

各自互不影响。Session 中途切换权限后，下一次模型请求的工具 Schema 也会立即按新状态重新计算。

### 它不会在 Agent 销毁或工具替换后留下残留包装

插件完整监听 Agent 创建、销毁、Preset 切换和工具变更事件。新工具出现时自动接入，工具替换后自动重新解析父级定义，Agent 销毁或插件卸载后自动恢复原始定义。

### 它不会只支持单一 DSH 版本

插件同时支持 DSH `0.1.0-rc.5` 和 `0.1.0-rc.6`，并在加载时校验 DSH 各包版本是否一致且受支持。遇到不兼容的工具定义会主动拒绝安装，而不是在运行中产生难以排查的诡异行为。

### 它不会给你增加配置负担

零配置，安装到实际使用的 Profile 后即可生效。测试覆盖 20 项，包含真实 DSH 包的集成验证，覆盖 Schema 投影、Code Mode SDK、工具替换、失败提示清理与插件卸载失效等关键路径。

## 与其他“仅执行期止血”方案的区别

| 能力 | 本插件 | 仅执行期参数正规化 |
|---|---|---|
| 从 Native Tool Schema 隐藏不可执行升级字段 | 支持，按 Session 动态投影 | 不支持 |
| 从 Code Mode SDK 隐藏相同字段 | 支持，与 Native 读取同一 Agent Exact Scope 定义 | 不支持 |
| 只删除精确同模式的冗余请求 | 支持 | 取决于实现 |
| 保留显式降级和非法请求给 DSH 校验 | 支持 | 不保证 |
| 保留缺失或空白 `justification` 给 DSH 校验 | 支持 | 不保证 |
| 清理描述与结果中的无效升级建议 | 覆盖 Shell、FS、Code Mode、`job_output` | 不支持 |
| 响应 Agent、Preset 和工具生命周期变化 | 支持 | 取决于实现 |

## 快速使用

插件为零配置修复。安装到实际使用的 Profile 后，继续按原方式启动 DSH 即可：

```sh
dsh --profile <profile>
```

无需修改模型配置、Sandbox Mode、Approval Policy 或 Agent Preset。插件会按每个 Session 的当前权限状态动态决定模型可见参数。

## 手动覆盖安装（Windows）

这是 Windows 下不使用插件安装命令的推荐方式。它只修改指定 Profile，不修改 DSH 安装目录或核心包。

需要更短的逐文件教程时，可查看 [奶龙也能看懂的食用说明.txt](奶龙也能看懂的食用说明.txt)；其英文对应版为 [Tutorials that even Peppa Pig can understand](Tutorials%20that%20even%20Peppa%20Pig%20can%20understand)。

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

注意：这里说的是 Profile 根目录 `%USERPROFILE%\.dsh\profiles\web`，**不是** `%USERPROFILE%\.dsh`。看到 `.dsh` 根目录没有 `cordis.patch.yml` 是正常的，不需要创建；继续进入 `profiles\web` 修改其中已有的文件即可。

### 3. 覆盖插件目录

在目标 Profile 中创建以下目录：

```text
<Profile目录>\node_modules\dsh-sandbox-escalation-fix
```

Web Profile 的默认目标目录是：

```text
%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-sandbox-escalation-fix
```

如果该目录已经存在，先将整个目录改名为 `dsh-sandbox-escalation-fix.backup`。

然后从本项目目录复制以下内容到新的 `dsh-sandbox-escalation-fix` 目录：

```text
package.json
cordis.patch.yml
README.md
lib\
```

也可以直接把整个 `dsh-sandbox-escalation-fix` 文件夹复制到 Profile 的 `node_modules`，但复制完成后必须删除：

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

注意：

- 不要复制本项目的 `node_modules`。
- 不需要复制 `src`、`tests`、`tsconfig.json` 或构建工具配置。
- 手动安装包必须已经包含 `lib\index.mjs`；只有源码而没有 `lib` 的 ZIP 不能直接使用此方法。
- 不要把插件自己的 `cordis.patch.yml` 直接覆盖到 Profile 根目录；Profile 根目录中的同名文件可能包含其他用户配置，必须按下一步手动合并。
- 确认没有多套一层同名目录。

正确入口是：

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

以下两种写法都**不要**使用：

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

- [ ] `profiles\web\cordis.patch.yml` 中只有一个 `id: sandbox-escalation-fix`。
- [ ] Patch 中没有 `[`、`]` 或包住整段配置的引号。
- [ ] 插件的 `package.json` 直接位于 `node_modules\dsh-sandbox-escalation-fix` 下。
- [ ] 插件目录包含 `lib\index.mjs`。
- [ ] 插件目录内部不存在第二个 `node_modules`。
- [ ] DSH 已完全退出并重启。
- [ ] 测试使用的是重启后新建的 Session。

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

自动测试直接使用真实 DSH `SessionStore`、`ToolRuntime`、`AgentRegistry`、`SandboxPolicyService`、`ApprovalService` 和 `SystemPrompt` 包，而不是只测试隔离 Mock。20 项测试覆盖：

- 权限矩阵；
- 精确同模式正规化；
- Native Schema 投影；
- Code Mode SDK 生成；
- Delegate 替换；
- 包装协作与冲突拒绝；
- Shell / FS / `job_output` 提示过滤；
- 版本检查；
- 插件卸载失效。

自动测试不能替代真实模型 Provider 的 E2E 证据。上方人工清单用于验证完整 Web 会话生命周期和受影响的 OAI All Access 工作流。

## 插件行为一览

| 场景 | 插件行为 |
|---|---|
| `danger-full-access` 或 Approval Policy 为 `never` | 不向模型广告 `sandbox_permissions` 与 `justification` |
| `workspace-write` 且允许审批 | 只广告 `danger-full-access` |
| `read-only` 且允许审批 | 广告 `workspace-write` 与 `danger-full-access` |
| 模型发送与当前模式完全相同的冗余升级参数 | 包装器删除这一对参数后委托原工具 |
| 降级、未知目标、缺少配对参数和真实升级请求 | 仍交给原工具严格验证 |
| 无合法升级目标 | 删除 Shell 描述尾部的升级说明，并清理与 Sandbox Denial Marker 同时出现的无效提示 |

## 与其他包装插件协作

插件会占用每个 Agent Exact Scope 中的 `bash`、`pwsh`、`write`、`edit` 名称。

另一个包装插件只有在同名工具暴露 `Symbol.for('dsh.tool-wrapper.v1')` 协议时才能与本插件链式协作。包装层按 `priority`、`owner` 稳定排序。如果同名工具没有实现协作协议，Agent 注册会明确失败，避免静默改变包装顺序或产生错误语义；此时必须由用户选择保留其中一个插件。

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

| 问题 | 处理方式 |
|---|---|
| 安装后没有生效 | 确认安装和启动使用同一个 `--profile`，并通过 `--dump-config` 检查插件层 |
| `.dsh` 根目录没有 `cordis.patch.yml` | 这是正常的；Web Profile 应修改 `.dsh\profiles\web\cordis.patch.yml` |
| 不知道 `[]` 怎么改 | 保留注释，只把独占一行的 `[]` 替换为不带方括号的 `- insert:` YAML 块 |
| 复制了整个开发文件夹 | 可以保留，但必须删除目标插件目录内部的 `node_modules`，并确认没有多套一层同名目录 |
| YAML 启动报错 | 检查 `- insert:` 是否顶格、是否误加了方括号或引号，以及缩进是否只使用空格 |
| Git 安装构建失败 | 确认 Profile 的 `pnpm-workspace.yaml` 已允许构建 `dsh-sandbox-escalation-fix`，然后重新安装 |
| 启动时报版本错误 | 不要混装 rc.5 与 rc.6 包；让 Profile 中关键 `@deepseek-ai/dsh-*` 包保持同一版本 |
| Agent 注册时报同名工具冲突 | 另一个插件已在 Agent Exact Scope 注册 `bash`、`pwsh`、`write` 或 `edit`，且未实现协作协议；只能卸载其中一个 |
| 升级字段仍然出现 | 确认查看的是安装后新建 Session 的 Schema，并确认没有后加载的插件替换同名工具 |

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

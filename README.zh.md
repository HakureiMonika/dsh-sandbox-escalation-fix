# dsh-sandbox-escalation-fix（已支持 DSH 0.1.2-alpha.1 与 Desktop 2.0.3）

[English](README.md) | 中文

> [!IMPORTANT]
> 这是独立开发的社区插件，不是 DeepSeek 官方发布、维护或背书的插件。它不会修改 DeepSeek Harness 的核心代码。

> [!CAUTION]
> DSH `0.1.0-rc8`、`0.1.1-rc.1`、`0.1.1-rc.2` 和 `0.1.2-alpha.1` 已做部分改善，但仍使用注册表全局升级 Schema 和执行期校验。**建议用户先观察原生行为，仅在实际遇到本文所列的同模式升级、空 justification 或反复重试问题后再安装本插件。**

**dsh-sandbox-escalation-fix** 是一个零配置兼容插件，直接解决 GPT 等第三方模型在 DSH All Access 下调用 `bash`、`pwsh`、`write`、`edit` 等工具时，因为错误的沙箱升级参数提示而调用失败、反复重试的问题。

如果你遇到过下面这些错误，这个插件就是针对它们的：

```text
Error: invalid justification: expected a non-empty sentence
Error: sandbox escalation to "danger-full-access" is not strictly wider than this call's current "danger-full-access" mode
Error: sandbox escalation to "workspace-write" is not strictly wider than this call's current "danger-full-access" mode
```

<details>
  <summary>一些次要的说明</summary>

  > DSH `0.1.1-rc.2` 的官方更新集中在图像处理：DeepSeek 适配器优先使用 Files API 上传图像、复用已上传文件，并根据模型要求自动缩放和转换图像格式。与本插件相关的 Sandbox 升级、Bash、Pwsh、ToolRuntime 和审批实现均与 `0.1.1-rc.1` 相同，因此 rc.2 没有修复本文问题，也不需要调整插件核心逻辑。<br> <br>DSH 从 `0.1.0-rc8` 到 `0.1.2-alpha.1` 改善了部署组合级广告：没有受限沙箱后端时，Bash、Pwsh、Write、Edit 不再公开升级字段。但它没有实现按 Session 投影 Schema。有沙箱后端时，工具仍会全局注册 `workspace-write` 和 `danger-full-access`；当前 Session 模式只在执行期读取，严格变宽仍在执行期校验，`approval=never` 只增加模型提示而不会删除字段。Native Tool Call 和 PTC Mode 又使用同一注册定义，因此本插件针对的问题仍可能出现<br> <br>本次兼容基于官方标签提交 `cd5ef8148158c3a752a658978873241fdf8e2bbc` 的源码契约审计。验证时 alpha.1 核心包尚未发布到公共 npm，因此本 Release 使用标签源码契约核对和 alpha.1 工具形状回归测试，不会把尚无法执行的 npm 包级测试描述为已完成<br> <br>插件 `0.1.1-desktop.2` 包含对 DSH Desktop `2.0.3` 的兼容。Desktop 2.0.3 会把 CommonJS 包清单覆盖解析限制在 Profile 的直接锚点，因此第三方插件自身无法读取宿主的 `@deepseek-ai/dsh-*/package.json`。当所有受检清单都被宿主统一隐藏时，本插件改用现有的严格运行时工具契约校验；部分清单可读、版本混装、清单损坏或工具定义不兼容时仍会拒绝运行<br> <br>插件也支持 `link:`、工作区软链接和外部插件目录等加载方式。当插件物理目录位于宿主依赖树之外时，兼容门禁可以从宿主当前工作目录读取完整的 DSH 包清单集合。每个候选解析根必须独立提供全部受检包；部分包集、跨解析根拼接、清单损坏和非模块缺失类加载错误仍会拒绝运行。`DSH_HOME` 只存放 Harness 配置和 Profile 数据，不是稳定的 Node.js 依赖根，因此不会被用于依赖解析。
</details>

## 目录

- [这是什么？](#这是什么)
- [它能解决什么问题？](#它能解决什么问题)
- [安装前后对比](#安装前后对比)
- [为什么选择它？](#为什么选择它)
- [安装与升级](#安装与升级)
- [卸载](#卸载)
- [手动覆盖安装（Windows）](#手动覆盖安装windows)
- [验证、行为与插件协作](#验证行为与插件协作)
- [故障排查](#故障排查)
- [支持范围](#支持范围)
- [贡献者](#贡献者)
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
- Native Tool Call 和 PTC Mode SDK（旧称 Code Mode）展示不一致，一边修好了、另一边还在误导模型。

### 问题成因

DSH 工具注册时会公开静态的升级字段，但真正可以请求的升级目标取决于每个 Session 当前的 Sandbox Mode 和 Approval Policy。原始模型可见 Schema 在构造请求前没有根据实时会话状态重新投影，因此即使当前权限已经最高或审批已被禁止，模型仍可能收到无法成功执行的升级参数。工具随后会在执行前拒绝这些请求，模型便可能进入反复修改参数并重试的循环。

## 安装前后对比

未安装插件时，受影响的 All Access Session 可能在实际操作开始前反复失败。模型会在空白 `justification`、同模式 `danger-full-access` 请求，甚至会被 DSH 正确拒绝的降级请求之间循环。

### 安装前：参数校验与升级错误反复出现

![安装前：invalid justification 与非严格变宽的 Sandbox 升级错误反复出现](assets/before-errors-overview.png)

![安装前：Edit 与 Pwsh 在完成实际工作前反复失败](assets/before-repeated-errors.png)

### 安装后：工具可以连续完成工作流

安装插件后，同一模型可以连续执行 Edit、Read、Pwsh、格式化、测试、Lint 和 Type Check，不再进入无效升级循环。

![安装后：Edit、Read 与 Pwsh 连续完成多步骤开发工作流](assets/after-successful-tools.png)

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

### 它不会只修 Native Tool Call，而漏掉 PTC Mode

插件的参数投影发生在 Agent 精确作用域的工具定义上。原生工具调用和 PTC Mode SDK 读取的是同一份投影结果：

- 原生工具 Schema 里不会出现无效升级字段；
- PTC Mode 生成的 TypeScript/Python SDK 里同样不会出现；
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

插件完整监听 Agent 创建、销毁、Preset 切换、动态限制和工具变更事件。动态 Preset 调用 `agent.ctx.tools.restrict()` 时，对应的 Agent Exact Scope 包装器会与被限制的父工具同步退出；限制解除后自动恢复投影包装。Agent 创建时不可见的目标工具以后重新出现，也会自动接入。每个 Agent 独立协调，Agent 销毁或插件卸载后恢复原始定义。

### 它不会只支持单一 DSH 版本

插件同时支持 DSH `0.1.0-rc.5`、`0.1.0-rc.6`、`0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.1-rc.1`、`0.1.1-rc.2` 和 `0.1.2-alpha.1`，并在加载时校验 DSH 各包版本是否一致且受支持。遇到不兼容的工具定义会主动拒绝安装，而不是在运行中产生难以排查的诡异行为。

### 它不会给你增加配置负担

零配置，安装到实际使用的 Profile 后即可生效。测试覆盖 36 项，包含当前公共 npm 可获得的 rc.2 真实包运行时集成验证，以及 alpha.1 标签源码契约和 PTC Mode 元数据回归验证，覆盖 Schema 投影、动态限制、多 Agent 隔离、Delegate 与协作包装器替换、内部超时预算透传、失败提示清理和插件卸载等关键路径。

### 与“仅执行期止血”方案的区别

| 能力 | 本插件 | 仅执行期参数正规化 |
|---|---|---|
| 从 Native Tool Schema 隐藏不可执行升级字段 | 支持，按 Session 动态投影 | 不支持 |
| 从 PTC Mode SDK 隐藏相同字段 | 支持，与 Native 读取同一 Agent Exact Scope 定义 | 不支持 |
| 只删除精确同模式的冗余请求 | 支持 | 取决于实现 |
| 保留显式降级和非法请求给 DSH 校验 | 支持 | 不保证 |
| 保留缺失或空白 `justification` 给 DSH 校验 | 支持 | 不保证 |
| 清理描述与结果中的无效升级建议 | 覆盖 Shell、FS、PTC Mode、`job_output` | 不支持 |
| 响应 Agent、Preset 和工具生命周期变化 | 支持 | 取决于实现 |

## 安装与升级

插件为零配置修复。推荐下载 Release ZIP，通过脚本安装到实际使用的 Profile；安装后按原方式启动 DSH：

```sh
dsh --profile <profile>
```

无需修改模型配置、Sandbox Mode、Approval Policy 或 Agent Preset。插件会按每个 Session 的当前权限状态动态决定模型可见参数。

### Release ZIP 一键安装

`0.1.2-alpha1.1` Release 保留 DSH `0.1.2-alpha.1`、Desktop 2.0.3 兼容和 PR #5 的软链接/外部插件目录解析增强，并加入 PR #8 的 Git 安装修复。Git 安装会直接使用仓库内预构建的 `lib`，不再要求配置 `allowBuilds`。包括 `v0.1.2-alpha1` 在内的旧 Release 均保留。新版 Release ZIP 解压后包含以下四个文件：

```text
dsh-sandbox-escalation-fix-0.1.2-alpha1.1.tgz
install-release.ps1
uninstall-release.ps1
RELEASE-USAGE.zh.md
```

安装或升级前先完全关闭 DSH。执行脚本前，请确认系统已将 `dsh` 命令加入 PATH，且当前 DSH 使用的是 rc5、rc6、rc7、rc8、`0.1.1-rc.1`、`0.1.1-rc.2` 或 `0.1.2-alpha.1`。建议先实际复现同类错误，再决定是否安装。

#### 安装到默认 Web Profile

在 Release 目录打开 PowerShell，执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install-release.ps1"
```

脚本会定位同目录中唯一的 `.tgz` 文件，然后执行：

```powershell
dsh plugin --profile web add <tgz-absolute-path>
```

DSH CLI 会将插件安装到 `web` Profile，并在 pnpm 成功后自动把插件的 `cordis.patch.yml` 加入 Profile Bundle 层。安装完成后重启 DSH。

#### 安装到其他 Profile

例如安装到 `headless`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install-release.ps1" -Profile headless
```

#### 发布者构建 Release 目录

在源码根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\build-release.ps1"
```

该脚本会先构建 `lib`，再执行 `npm pack` 生成 `.tgz`，最后在 `release` 目录生成 `dsh-sandbox-escalation-fix-0.1.2-alpha1.1-release.zip`。ZIP 内含 tarball、两个一键脚本和简明中文使用说明；上传 GitHub Release 时只需上传该 ZIP。

### 升级已有安装

升级前必须关闭 DSH。插件包名、Bundle ID 和 Profile Patch 配置行均未改变，已经安装旧版的用户不需要再次修改 `cordis.patch.yml`。

#### 通过 GitHub Commit 安装的用户

将原安装命令中的 Commit SHA 换成新的、已经审核过的 SHA，再执行同一条命令：

```sh
dsh plugin --profile <profile> add github:<owner>/dsh-sandbox-escalation-fix#<new-commit-sha>
```

该命令会更新 Profile 依赖。仓库内已提交预构建的 `lib`，本包不再声明任何安装期构建脚本，pnpm 不会要求 `allowBuilds` 白名单。安装完成后检查 `--dump-config`，然后重新启动 DSH。

#### 手动安装到 Web Profile 的用户

准备包含新版 `lib` 的仓库或发布包，在插件目录中打开 Windows PowerShell，然后执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy-web-profile.ps1"
```

脚本优先使用 `DSH_HOME`；未设置时使用 `%USERPROFILE%\.dsh`。它只覆盖 8 个发布用 `lib` 文件并逐一比较 SHA-256；只有部署目录与新版构建完全一致时，最后一行才会显示：

```text
Deployment verified.
```

脚本不会修改 Profile Patch，也不会复制 `node_modules`。验证成功后重新启动 DSH。

### 通过命令行安装

建议从可信仓库锁定 Commit SHA 安装到指定 Profile：

```sh
dsh plugin --profile <profile> add github:<owner>/dsh-sandbox-escalation-fix#<commit-sha>
```

也可以从本地目录安装：

```sh
dsh plugin --profile <profile> add D:/deepseek-harness/plugins/dsh-sandbox-escalation-fix
```

本包已移除 `prepare` 等安装期构建脚本：Git 安装直接使用仓库内提交的预构建 `lib`，pnpm 不会要求 `allowBuilds` 白名单。旧版本安装时曾需要允许构建；如果 Profile 的 `pnpm-workspace.yaml` 里还残留 `dsh-sandbox-escalation-fix@https://codeload.github.com/...` 条目，升级到新版后可以删除。

重新执行安装命令后检查最终组合：

```sh
dsh --profile <profile> --dump-config
```

输出中应包含 `dsh-sandbox-escalation-fix` 层和 `sandbox-escalation-fix` 行。

## 卸载

使用 Release ZIP 时，可在解压目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\uninstall-release.ps1"
```

其他 Profile 通过 `-Profile` 指定，例如：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\uninstall-release.ps1" -Profile headless
```

等效的 DSH CLI 命令为：

```sh
dsh plugin --profile <profile> remove dsh-sandbox-escalation-fix
```

卸载会移除插件创建的包装 Host、包装层和结果过滤器。完成后重启 DSH，并可通过 `dsh --profile <profile> --dump-config` 确认输出中不再出现插件层。

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

更新已经安装的版本时，请直接按照[安装与升级](#安装与升级)操作，不要重复添加 Profile Patch。

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

## 验证、行为与插件协作

### 验证修复

Web 正常启动只能证明 Profile 组合成功、插件加载时没有导致进程退出；动态限制行为仍需按本节后续步骤验证。使用 DSH 源码仓库时，可在仓库根目录运行：

```powershell
node --import tsx/esm apps/cli/src/bin.ts web
```

请先确保受支持的 Node.js 已加入 PATH。看到以下输出后再继续测试：

```text
dsh web: http://127.0.0.1:3080
```

1. 使用安装插件的 Profile 启动 DSH。
2. 选择原先在 All Access 下受影响的 OAI 系列模型。
3. 将权限设置为 All Access，对应 `danger-full-access` 与 Approval Policy `never`。
4. 新建 Session，让 Agent Scope 在插件已加载的状态下创建。
5. 要求模型执行一条简单 Shell 命令或写入工作区文件。
6. 如果 Preset 使用 `agent.ctx.tools.restrict()`，进入限制状态并确认对应工具消失；解除限制后确认工具无需重建 Agent 即可恢复。

修复生效时：

- 模型可见的 `bash`、`pwsh`、`write`、`edit` Schema 不再包含 `sandbox_permissions` 和 `justification`。
- 模型即使发送与当前模式相同的冗余升级参数，工具也会删除这对参数后正常委托。
- Sandbox 拒绝结果不会继续提示一个当前策略无法执行的升级动作。

修改插件安装状态、Profile 或 Preset 后，建议新建 Session 验证，避免把旧 Agent Scope 的行为误认为当前配置。

### 验证证据

自动测试直接使用真实 DSH `SessionStore`、`ToolRuntime`、`AgentRegistry`、`SandboxPolicyService`、`ApprovalService` 和 `SystemPrompt` 包，而不是只测试隔离 Mock。36 项测试覆盖：

- 权限矩阵；
- 精确同模式正规化；
- Native Schema 投影；
- PTC Mode SDK 生成；
- 动态 Preset 限制、解除和初始受限后自动发现；
- 多 Agent 限制隔离；
- Delegate 替换；
- 普通包装器与协作协议包装器动态切换；
- 运行期不兼容定义的单工具隔离与恢复；
- 包装协作与冲突拒绝；
- Shell / FS / `job_output` 提示过滤；
- 版本检查；
- 插件卸载失效。

其中 alpha.1 核心包尚未发布到公共 npm，alpha.1 兼容部分采用官方标签源码契约审计和工具形状回归测试；当前公共 npm 可获得的 rc.2 包继续用于运行时集成验证。自动测试不能完全替代真实模型 Provider 的 E2E 验证。

### 插件行为一览

| 场景 | 插件行为 |
|---|---|
| `danger-full-access` 或 Approval Policy 为 `never` | 不向模型广告 `sandbox_permissions` 与 `justification` |
| `workspace-write` 且允许审批 | 只广告 `danger-full-access` |
| `read-only` 且允许审批 | 广告 `workspace-write` 与 `danger-full-access` |
| 模型发送与当前模式完全相同的冗余升级参数 | 包装器删除这一对参数后委托原工具 |
| 降级、未知目标、缺少配对参数和真实升级请求 | 仍交给原工具严格验证 |
| 无合法升级目标 | 删除 Shell 描述尾部的升级说明，并清理与 Sandbox Denial Marker 同时出现的无效提示 |
| 动态 Preset 限制目标工具 | 对应 Exact Scope 包装器在同一次同步变更中退出 |
| 限制解除或 Provider 恢复 | 自动重新建立投影包装，无需重建 Agent |
| 运行期替换为不兼容定义 | 只让对应 Agent 的对应工具暂时不包装，记录诊断并等待兼容定义恢复 |

### 与其他包装插件协作

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

## 故障排查

| 问题 | 处理方式 |
|---|---|
| 安装后没有生效 | 确认安装和启动使用同一个 `--profile`，并通过 `--dump-config` 检查插件层 |
| `.dsh` 根目录没有 `cordis.patch.yml` | 这是正常的；Web Profile 应修改 `.dsh\profiles\web\cordis.patch.yml` |
| 不知道 `[]` 怎么改 | 保留注释，只把独占一行的 `[]` 替换为不带方括号的 `- insert:` YAML 块 |
| 复制了整个开发文件夹 | 可以保留，但必须删除目标插件目录内部的 `node_modules`，并确认没有多套一层同名目录 |
| YAML 启动报错 | 检查 `- insert:` 是否顶格、是否误加了方括号或引号，以及缩进是否只使用空格 |
| Git 安装被 `allowBuilds` 拦截 | 说明装到的是仍带 `prepare` 脚本的旧提交；固定到已移除 `prepare`、随仓库提交预构建 `lib` 的新提交 SHA 后重新安装 |
| 启动时报版本错误 | 不要混装 rc.5、rc.6、rc.7、rc.8、0.1.1-rc.1、0.1.1-rc.2 与 0.1.2-alpha.1 包；让 Profile 中关键 `@deepseek-ai/dsh-*` 包保持同一版本 |
| Agent 注册时报同名工具冲突 | 另一个插件已在 Agent Exact Scope 注册 `bash`、`pwsh`、`write` 或 `edit`，且未实现协作协议；只能卸载其中一个 |
| 动态 Preset 隐藏了部分工具 | 这是正常行为；插件会镜像 `tools.restrict()`，限制解除后自动恢复包装 |
| 日志出现动态协调警告 | 检查警告中目标工具的替换定义；其他工具和 Agent 会继续工作，兼容定义出现后自动恢复 |
| 升级字段仍然出现 | 确认查看的是安装后新建 Session 的 Schema，并确认没有后加载的插件替换同名工具 |

## 支持范围

- Node.js `^22.19.0` 或 `>=24.0.0`
- `@deepseek-ai/dsh-*` `0.1.0-rc.5`、`0.1.0-rc.6`、`0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.1-rc.1`、`0.1.1-rc.2`、`0.1.2-alpha.1`
- `@deepseek-ai/cordis` `4.0.1`

插件针对这些版本的公开 Scope、ToolRuntime、Sandbox Policy 与 Approval Service 契约构建。Agent 初次创建时，已可见的目标工具定义或同 Scope 包装协议不兼容会严格拒绝该 Agent 注册。

启动时会读取关键 `@deepseek-ai/dsh-*` 包的实际版本；rc.5/rc.6/rc.7/rc.8/0.1.1-rc.1/0.1.1-rc.2/0.1.2-alpha.1 混装或未知版本会拒绝启动。目标工具同时省略两个升级字段时视为已经安全。运行期的 Preset 限制或 Provider 稳定删除会让包装器进入休眠；运行期替换为字段残缺或输出定义不兼容的工具时，只隔离对应 Agent 的对应工具并记录警告，不会终止 Host 进程，后续兼容定义出现时自动恢复。

## 贡献者

- [sprainJinyu](https://github.com/sprainJinyu) / 张金雨：在 PR #5 中提出了软链接和外部插件目录的包清单解析回退方案。
- [tappat225](https://github.com/tappat225) / tappat：在 PR #8 中移除了 Git 依赖不必要的 `prepare` 步骤，使插件无需配置 `allowBuilds` 即可安装。

## 开发验证

```sh
npm install
npm test
npm run build
```

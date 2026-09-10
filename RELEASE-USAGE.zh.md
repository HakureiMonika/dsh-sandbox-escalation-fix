# dsh-sandbox-escalation-fix 0.1.5-rc1-win-linux 使用说明

## 版本内容

- 支持 DSH `0.1.5-rc.1`。官方 `0.1.5-rc.1` 与 `0.1.5-alpha.2` 的 15 个插件相关发布包逐字节一致（244 个文件、0 处差异）；沙箱升级 Schema 与执行期校验未改动，插件核心逻辑无需修改。
- 本版继续保留 DSH `0.1.5-alpha.1` 兼容：官方该版本引入 Session V3、移除 `ctx.agent` 并调整 Inbox API；本插件不使用 `ctx.agent` 或 Inbox，依赖的 Agent Registry、工具包装、Sandbox Policy 与审批契约保持兼容。
- 官方 `0.1.5-rc.1` 与 `0.1.5-alpha.2` 的全部插件相关发布产物逐字节一致（15 个包、244 个文件、0 处差异）；其 Sandbox、Sandbox Policy、Approval、Bash、Pwsh、Session Projection 与 Scope 源码相对 `0.1.5-alpha.1` 没有变化，仍使用注册表全局静态升级 Schema 与执行期严格变宽校验，因此本插件针对的问题仍可能出现。
- 完整真实 `0.1.5-rc.1` npm 包集下，40 项测试与 TypeScript 构建通过；插件核心 Supervisor、Wrapper、Schema 投影和参数正规化逻辑无需修改。
- 正式支持 Linux：插件本体为纯 JavaScript、无平台限制；已在 Ubuntu 24.04 实机（Landlock 沙箱后端）完成安装、Schema 投影与沙箱/审批行为验证。`.sh` 脚本预期同样适用于 macOS，但尚未在真实 Mac 上测试。
- 支持 DSH Desktop `2.0.3` 隐藏宿主包清单时的严格结构校验回退。
- 支持通过 `link:`、工作区软链接或外部插件目录加载插件。
- 在 `workspace-write` 下，若模型对经真实路径边界确认位于当前工作区内的 `write` / `edit` 错误申请 `danger-full-access`，插件会移除该误提权参数并按现有权限执行；工作区外路径、Shell 调用和其他无法确认的路径仍保留正常审批。
- 新版本继续发布到公共 npm Registry 的 `next` 标签；包名安装与 GitHub Release `.tgz` 使用同一份构建产物。

## 安装前准备

1. 完全退出正在运行的 DSH 或 DSH Desktop。
2. 解压 Release ZIP，确认本说明、四个安装/卸载脚本和 `.tgz` 文件位于同一目录。
3. 执行 `dsh --version`，确认 `dsh` 命令可用。
4. 当前支持的 DSH 版本为 `0.1.0-rc.5`、`0.1.0-rc.6`、`0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.1-rc.1`、`0.1.1-rc.2`、`0.1.2-alpha.1`、`0.1.2-alpha.2`、`0.1.2-alpha.3`、`0.1.2-alpha.4`、`0.1.2-alpha.5`、`0.1.2-rc.1`、`0.1.3-alpha.1`、`0.1.3-alpha.2`、`0.1.5-alpha.1`、`0.1.5-alpha.2` 和 `0.1.5-rc.1`。

> DSH `0.1.5-rc.1` 仍使用注册表全局静态 Schema；Session 当前模式和严格变宽仍在执行期处理，`approval=never` 仍主要依靠提示词。建议只在实际遇到同模式升级、空 justification 或重复重试问题后安装。

## 通过 npm Registry 安装（推荐）

```sh
dsh plugin --profile web add dsh-sandbox-escalation-fix@next
```

其他 Profile 将 `web` 替换为实际名称。也可以锁定具体版本：

```sh
dsh plugin --profile web add dsh-sandbox-escalation-fix@0.1.5-rc1-win-linux
```

## 通过 Release ZIP 安装

Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install-release.ps1"
```

Linux/macOS：

```sh
sh ./install-release.sh
```

安装到其他 Profile 时，Windows 使用 `-Profile headless`，Linux/macOS 将 `headless` 作为第一个参数。

## 卸载

Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\uninstall-release.ps1"
```

Linux/macOS：

```sh
sh ./uninstall-release.sh
```

等效命令：

```sh
dsh plugin --profile web remove dsh-sandbox-escalation-fix
```

## 注意事项

- 安装、升级或卸载后都应完全重启 DSH，并在对应 Profile 中新建 Session 验证。
- 不需要手动编辑插件包内的 `cordis.patch.yml`；DSH CLI 会管理 Profile 依赖和 Bundle 层。
- Linux/macOS 上沙箱实际生效依赖 DSH 宿主可用的沙箱后端；后端不可用时 DSH 会拒绝执行，不会绕过沙箱。

# dsh-sandbox-escalation-fix 0.1.3-alpha1-win-linux 使用说明

## 版本内容

- 正式支持 Linux：Release ZIP 新增 POSIX 安装与卸载脚本（`.sh`），插件本体为纯 JavaScript、无平台限制；已在 Ubuntu 24.04 实机（Landlock 沙箱后端）完成安装、Schema 投影与沙箱/审批行为验证。`.sh` 脚本预期同样适用于 macOS，但尚未在真实 Mac 上测试。
- 支持 DSH Desktop `2.0.3` 隐藏宿主包清单时的严格结构校验回退。
- 支持通过 `link:`、工作区软链接或外部插件目录加载插件。
- 支持 DSH `0.1.3-alpha.1`，本插件会按每个 Session 的实际 Sandbox Mode 与 Approval Policy 投影升级字段。
- 在 `workspace-write` 下，若模型对经真实路径边界确认位于当前工作区内的 `write` / `edit` 错误申请 `danger-full-access`，插件会移除该误提权参数并按现有权限执行；工作区外路径、Shell 调用、工作区根不存在和其他无法确认的路径仍保留正常审批。
- 该处理不会授予额外权限，符号链接等真实路径边界仍由 DSH 文件沙箱最终检查。
- 保持部分包集、跨目录混装、清单损坏和非模块缺失错误时拒绝启动。
- Git Commit 安装直接使用仓库内预构建的 `lib`，不再执行 `prepare`，无需在 Profile 中配置 `allowBuilds`。
- 移除 `cordis.patch.yml` 的 UTF-8 BOM，避免部分 Windows 编码工具重复写回时叠加为多 BOM；旧版本建议及时更换为本版本。

## 安装前准备

1. 完全退出正在运行的 DSH 或 DSH Desktop。
2. 解压 Release ZIP，确认本说明、四个安装/卸载脚本（Windows 的 `.ps1` 与 Linux/macOS 的 `.sh`）和 `.tgz` 文件位于同一目录。
3. 在 PowerShell（Windows）或终端（Linux/macOS）中执行 `dsh --version`，确认 `dsh` 命令可用。
4. 当前支持的 DSH 版本为 `0.1.0-rc.5`、`0.1.0-rc.6`、`0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.1-rc.1`、`0.1.1-rc.2`、`0.1.2-alpha.1`、`0.1.2-alpha.2`、`0.1.2-alpha.3`、`0.1.2-alpha.4`、`0.1.2-alpha.5`、`0.1.2-rc.1` 和 `0.1.3-alpha.1`。
5. 插件本体为纯 JavaScript，无平台限制；Linux/macOS 上沙箱实际生效依赖 DSH 宿主可用的沙箱后端（Linux 为 `bwrap` 或启用了 Landlock 的内核 5.13+），由 DSH 运行时自动探测。

> DSH `0.1.3-alpha.1` 仍使用注册表全局静态 Schema；Session 当前模式和严格变宽仍在执行期处理，`approval=never` 仍主要依靠提示词。官方标签源码确认关键升级契约未改变；因 `0.1.3-alpha.1` 公共 npm 包尚未上线，本次以标签源码审计和最新完整 `0.1.2-rc.1` 包集测试作为验证依据，建议只在实际遇到同模式升级、空 justification 或重复重试问题后安装。

## 安装到默认 Web Profile

Windows 在解压目录打开 PowerShell，然后执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install-release.ps1"
```

Linux/macOS 在解压目录执行（ZIP 解压不保留执行位，因此用 `sh ./` 调用）：

```sh
sh ./install-release.sh
```

脚本会定位同目录中唯一的 `.tgz` 文件，并执行等效命令：

```powershell
dsh plugin --profile web add <tgz绝对路径>
```

安装完成后重新启动 DSH，并新建 Session 验证工具调用。

## 安装到其他 Profile

例如安装到 `headless`。Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install-release.ps1" -Profile headless
```

Linux/macOS 将 Profile 名作为第一个参数传入：

```sh
sh ./install-release.sh headless
```

## 从默认 Web Profile 卸载

完全退出 DSH。Windows 在解压目录打开 PowerShell，然后执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\uninstall-release.ps1"
```

Linux/macOS 在解压目录执行：

```sh
sh ./uninstall-release.sh
```

等效命令为：

```powershell
dsh plugin --profile web remove dsh-sandbox-escalation-fix
```

卸载完成后重新启动 DSH。

## 从其他 Profile 卸载

例如从 `headless` 卸载。Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\uninstall-release.ps1" -Profile headless
```

Linux/macOS：

```sh
sh ./uninstall-release.sh headless
```

## 注意事项

- Release 目录只能保留一个 `dsh-sandbox-escalation-fix-*.tgz`，否则安装脚本会拒绝运行，避免安装错误版本。
- 不需要手动编辑插件包内的 `cordis.patch.yml`；DSH CLI 会管理 Profile 依赖和 Bundle 层。
- 安装、升级或卸载后都应完全重启 DSH，并在对应 Profile 中新建 Session 验证。

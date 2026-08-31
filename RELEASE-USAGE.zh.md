# dsh-sandbox-escalation-fix 0.1.2-alpha2.1 使用说明

## 版本内容

- 支持 DSH Desktop `2.0.3` 隐藏宿主包清单时的严格结构校验回退。
- 支持通过 `link:`、工作区软链接或外部插件目录加载插件。
- 支持 DSH `0.1.2-alpha.2`，本插件会按每个 Session 的实际 Sandbox Mode 与 Approval Policy 投影升级字段。
- 保持部分包集、跨目录混装、清单损坏和非模块缺失错误时拒绝启动。
- Git Commit 安装直接使用仓库内预构建的 `lib`，不再执行 `prepare`，无需在 Profile 中配置 `allowBuilds`。
- 移除 `cordis.patch.yml` 的 UTF-8 BOM，避免部分 Windows 编码工具重复写回时叠加为多 BOM；旧版本建议及时更换为本版本。

## 安装前准备

1. 完全退出正在运行的 DSH 或 DSH Desktop。
2. 解压 Release ZIP，确认本说明、两个 PowerShell 脚本和 `.tgz` 文件位于同一目录。
3. 在 PowerShell 中执行 `dsh --version`，确认 `dsh` 命令可用。
4. 当前支持的 DSH 版本为 `0.1.0-rc.5`、`0.1.0-rc.6`、`0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.1-rc.1`、`0.1.1-rc.2`、`0.1.2-alpha.1` 和 `0.1.2-alpha.2`。

> DSH `0.1.2-alpha.2` 仍使用注册表全局静态 Schema；Session 当前模式和严格变宽仍在执行期处理，`approval=never` 仍主要依靠提示词。官方 alpha.2 npm 包的真实构建与集成测试确认本插件仍有必要，建议只在实际遇到同模式升级、空 justification 或重复重试问题后安装。

## 安装到默认 Web Profile

在解压目录打开 PowerShell，然后执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install-release.ps1"
```

脚本会定位同目录中唯一的 `.tgz` 文件，并执行等效命令：

```powershell
dsh plugin --profile web add <tgz绝对路径>
```

安装完成后重新启动 DSH，并新建 Session 验证工具调用。

## 安装到其他 Profile

例如安装到 `headless`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install-release.ps1" -Profile headless
```

## 从默认 Web Profile 卸载

完全退出 DSH，在解压目录打开 PowerShell，然后执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\uninstall-release.ps1"
```

等效命令为：

```powershell
dsh plugin --profile web remove dsh-sandbox-escalation-fix
```

卸载完成后重新启动 DSH。

## 从其他 Profile 卸载

例如从 `headless` 卸载：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\uninstall-release.ps1" -Profile headless
```

## 注意事项

- Release 目录只能保留一个 `dsh-sandbox-escalation-fix-*.tgz`，否则安装脚本会拒绝运行，避免安装错误版本。
- 不需要手动编辑插件包内的 `cordis.patch.yml`；DSH CLI 会管理 Profile 依赖和 Bundle 层。
- 安装、升级或卸载后都应完全重启 DSH，并在对应 Profile 中新建 Session 验证。

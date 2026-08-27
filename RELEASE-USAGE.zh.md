# dsh-sandbox-escalation-fix 0.1.1-desktop.2 使用说明

## 版本内容

- 支持 DSH Desktop `2.0.3` 隐藏宿主包清单时的严格结构校验回退。
- 支持通过 `link:`、工作区软链接或外部插件目录加载插件。
- 保持部分包集、跨目录混装、清单损坏和非模块缺失错误时拒绝启动。

## 安装前准备

1. 完全退出正在运行的 DSH 或 DSH Desktop。
2. 解压 Release ZIP，确认本说明、两个 PowerShell 脚本和 `.tgz` 文件位于同一目录。
3. 在 PowerShell 中执行 `dsh --version`，确认 `dsh` 命令可用。
4. 当前支持的 DSH 版本为 `0.1.0-rc.5`、`0.1.0-rc.6`、`0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.1-rc.1` 和 `0.1.1-rc.2`。

> DSH rc8、`0.1.1-rc.1` 和 `0.1.1-rc.2` 已有部分原生改善。建议只在实际遇到同模式升级、空 justification 或重复重试问题后安装本插件。

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

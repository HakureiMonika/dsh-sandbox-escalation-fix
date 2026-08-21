# dsh-sandbox-escalation-fix 0.1.1-rc1 使用说明

## 使用前准备

1. 完全关闭正在运行的 DSH。
2. 确认已安装 DSH，并且在 PowerShell 中可执行 `dsh`。
3. 确认 DSH 版本为 `0.1.0-rc.5`、`0.1.0-rc.6`、`0.1.0-rc.7`、`0.1.0-rc.8` 或 `0.1.1-rc.1`。

> DSH rc8 已增加 `approval=never` 的运行时提醒，但 `0.1.1-rc.1` 仍未消除静态升级 Schema 的根因。建议 rc8 与 0.1.1-rc.1 用户仅在实际遇到同模式升级、空 justification 或反复重试问题后安装本插件。

## 默认安装到 Web Profile

在本文件所在目录打开 PowerShell，执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install-release.ps1"
```

脚本会调用：

```powershell
dsh plugin --profile web add <本地tgz路径>
```

安装完成后重启 DSH，再新建 Session 验证效果。

## 安装到其他 Profile

例如安装到 `headless`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\install-release.ps1" -Profile headless
```

## 默认从 Web Profile 卸载

在本文件所在目录打开 PowerShell，执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\uninstall-release.ps1"
```

脚本会调用：

```powershell
dsh plugin --profile web remove dsh-sandbox-escalation-fix
```

卸载完成后重启 DSH。

## 从其他 Profile 卸载

例如从 `headless` 卸载：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\uninstall-release.ps1" -Profile headless
```

## 注意事项

- Release 目录中必须只保留一个 `dsh-sandbox-escalation-fix-*.tgz` 文件；安装脚本检测到多个版本会停止，避免误装。
- 不需要手动编辑 `cordis.patch.yml`，DSH CLI 会在安装和卸载成功后同步插件 Bundle。
- 此插件不修改 DSH 核心源码，只在当前 Profile 中作为插件加载。

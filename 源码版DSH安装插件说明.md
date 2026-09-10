# 源码版 DSH 安装插件说明

源码版 DSH 不要运行 Release 里的 `install-release.ps1`，因为该脚本调用的是全局 `dsh` 命令。源码版需要在 DSH 仓库根目录使用 `pnpm dsh`。

支持的 DSH 版本以 [README.zh.md 的支持范围](README.zh.md#支持范围) 为准（当前包含 `0.1.5-rc.2`）。

## 1. 选择安装方式

- **方式一（推荐）**：直接从公共 npm Registry 安装，无需下载任何文件；
- **方式二**：下载 GitHub Release 里的 `.tgz`，本地安装。

两种方式安装的是同一份构建产物，行为一致。

## 2. 方式一：从 npm Registry 安装（推荐）

在 DSH 源码根目录执行：

```powershell
pnpm dsh plugin --profile web add dsh-sandbox-escalation-fix@next
```

安装到其他 Profile 时，把 `web` 换成实际名称，例如 `headless`：

```powershell
pnpm dsh plugin --profile headless add dsh-sandbox-escalation-fix@next
```

当前版本是预发布版，建议显式带上 `@next`，或固定到具体版本：

```powershell
pnpm dsh plugin --profile web add dsh-sandbox-escalation-fix@0.1.5-rc2-win-linux
```

## 3. 方式二：下载 `.tgz` 本地安装

下载最新 Release：

https://github.com/HakureiMonika/dsh-sandbox-escalation-fix/releases/latest

解压后找到：

```text
dsh-sandbox-escalation-fix-0.1.5-rc2-win-linux.tgz
```

注意：安装命令要使用解压后的 `.tgz` 文件，不要使用外层 `.zip` 文件。

## 4. 进入 DSH 源码根目录

```powershell
cd "你的\deepseek-harness\源码目录"
```

如果源码尚未安装依赖或尚未构建，先执行：

```powershell
corepack enable
pnpm install
pnpm run build
```

## 5. 安装本地 `.tgz`

```powershell
pnpm dsh plugin --profile web add "D:\下载目录\dsh-sandbox-escalation-fix-0.1.5-rc2-win-linux.tgz"
```

## 6. 验证安装

```powershell
pnpm dsh --profile web --dump-config | Select-String "dsh-sandbox-escalation-fix|sandbox-escalation-fix"
```

能看到 `dsh-sandbox-escalation-fix` 或 `sandbox-escalation-fix`，即表示插件已经加入 `web` Profile。

## 7. 启动 DSH

```powershell
pnpm dsh web
```

安装插件后请完全关闭并重新启动 DSH，然后新建 Session 验证。

## 8. 升级插件

```powershell
pnpm dsh plugin --profile web add dsh-sandbox-escalation-fix@next
```

## 9. 卸载插件

```powershell
pnpm dsh plugin --profile web remove dsh-sandbox-escalation-fix
```

卸载后重新启动 DSH。

## 常见问题

### `pnpm dsh` 报 `ERR_MODULE_NOT_FOUND`

```powershell
pnpm install
pnpm run build
```

### 实际使用的不是 `web` Profile

把命令中的 `web` 换成实际使用的 Profile，例如 `headless`。

### 安装时提示找不到插件包

- npm 方式：确认包名为 `dsh-sandbox-escalation-fix`，且带 `@next` 或具体版本号；
- 本地方式：确认路径指向解压后的 `.tgz`，不是外层 `.zip`。

## 命令区别

正式安装版使用 `dsh plugin ...`，源码版使用 `pnpm dsh plugin ...`。

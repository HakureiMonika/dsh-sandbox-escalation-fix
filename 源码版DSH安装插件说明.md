# 源码版 DSH 安装插件说明

源码版 DSH 不要运行 Release 里的 `install-release.ps1`，因为该脚本调用的是全局 `dsh` 命令。源码版需要在 DSH 仓库根目录使用 `pnpm dsh`。

支持的 DSH 版本以 [README.zh.md 的支持范围](README.zh.md#支持范围) 为准（当前包含 `0.1.3-alpha.2`）。

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

说明：当前版本是预发布版，发布在 `next` 标签下（npm 首次发布时也会自动创建 `latest`）。建议显式带上 `@next`，或固定到具体版本，避免将来稳定版发布、`latest` 移动后行为变化。固定版本示例：

```powershell
pnpm dsh plugin --profile web add dsh-sandbox-escalation-fix@0.1.3-alpha2-win-linux.1
```

## 3. 方式二：下载 `.tgz` 本地安装

下载最新 Release：

https://github.com/HakureiMonika/dsh-sandbox-escalation-fix/releases/latest

解压后找到：

```text
dsh-sandbox-escalation-fix-0.1.3-alpha2-win-linux.1.tgz
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

将下面的路径替换为电脑上的实际路径：

```powershell
pnpm dsh plugin --profile web add "D:\下载目录\dsh-sandbox-escalation-fix-0.1.3-alpha2-win-linux.1.tgz"
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

重新执行对应安装命令即可，Profile 依赖会被更新：

```powershell
pnpm dsh plugin --profile web add dsh-sandbox-escalation-fix@next
```

## 9. 卸载插件

在 DSH 源码根目录执行：

```powershell
pnpm dsh plugin --profile web remove dsh-sandbox-escalation-fix
```

卸载后重新启动 DSH。

## 常见问题

### `pnpm dsh` 报 `ERR_MODULE_NOT_FOUND`

请在 DSH 源码根目录重新执行：

```powershell
pnpm install
pnpm run build
```

### 实际使用的不是 `web` Profile

把命令中的 `web` 换成实际使用的 Profile，例如 `headless`。

### 安装时提示找不到插件包

- 使用 npm 方式时，确认命令里的包名是 `dsh-sandbox-escalation-fix`，且带上了 `@next` 或具体版本号；
- 使用本地 `.tgz` 时，确认路径指向解压后的 `.tgz` 文件，而不是外层 `.zip`。

## 命令区别

正式安装版使用：

```powershell
dsh plugin ...
```

源码版使用：

```powershell
pnpm dsh plugin ...
```

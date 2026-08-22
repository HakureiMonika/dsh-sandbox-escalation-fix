# 源码版 DSH 安装插件说明

源码版 DSH 不要运行 Release 里的 `install-release.ps1`，因为该脚本调用的是全局 `dsh` 命令。源码版需要在 DSH 仓库根目录使用 `pnpm dsh`。

## 1. 下载插件

下载最新版：

https://github.com/JUSTMONIKA2022/dsh-sandbox-escalation-fix/releases/tag/v0.1.1-rc2

解压后找到：

```text
dsh-sandbox-escalation-fix-0.1.1-rc2.tgz
```

## 2. 进入 DSH 源码根目录

```powershell
cd "你的\deepseek-harness\源码目录"
```

如果源码尚未安装依赖或尚未构建，先执行：

```powershell
corepack enable
pnpm install
pnpm run build
```

## 3. 安装插件

将下面的 `.tgz` 路径替换为电脑上的实际路径：

```powershell
pnpm dsh plugin --profile web add "D:\下载目录\dsh-sandbox-escalation-fix-0.1.1-rc2.tgz"
```

## 4. 验证安装

```powershell
pnpm dsh --profile web --dump-config | Select-String "dsh-sandbox-escalation-fix|sandbox-escalation-fix"
```

能看到 `dsh-sandbox-escalation-fix` 或 `sandbox-escalation-fix`，即表示插件已经加入 `web` Profile。

## 5. 启动 DSH

```powershell
pnpm dsh web
```

安装插件后请完全关闭并重新启动 DSH，然后新建 Session 验证。

## 6. 卸载插件

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

安装命令应使用解压后的 `.tgz` 文件，不要使用外层 `.zip` 文件。

## 命令区别

正式安装版使用：

```powershell
dsh plugin ...
```

源码版使用：

```powershell
pnpm dsh plugin ...
```

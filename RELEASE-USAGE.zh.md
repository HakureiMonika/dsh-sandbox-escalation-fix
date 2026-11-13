# dsh-sandbox-escalation-fix 0.2.0-win-linux 使用说明

## 版本内容

- 移除逐版本白名单：DSH 的 `@deepseek-ai/dsh-*` 包与桌面版同步发版（当前客户端与随包分发的插件包均为 `0.2.2-rc.1`），精确版本清单会让插件在每次 DSH 升级时加载失败——`0.1.6-alpha.2` 升到 `0.2.2-rc.1` 时即报 `unsupported DSH version "0.2.2-rc.1"`。启动期只校验所有受检 `@deepseek-ai/dsh-*` 包版本一致（混装仍硬失败），实际兼容性由 attach 期的 `validateTargetTool` 结构校验判定（description、`parameters.type`/`parameters.properties`、`output.render`/`output.schema`）。
- 新增执行期安全网：升级请求（`sandbox_permissions` + `justification`）的目标不在当前 Session 可升级目标内（比有效模式更窄，或审批策略为 `never`）时，插件在委托前成对剥离参数，不再让执行期严格变宽校验中断整次调用。
- `@deepseek-ai/dsh-*` 的 `peerDependencies` 收敛为单一范围 `>=0.1.0-rc.5`。
- 已在 DSH `0.2.2-rc.1` 实机验证：`danger-full-access` 下发送陈旧的 `sandbox_permissions: "workspace-write"` 时整次工具调用成功完成；模型仍可能发送升级参数，说明官方 Schema 仍未按 Session 收窄，本插件按 Session 投影模型可见 Schema 的作用仍然存在。
- 已对 `0.1.6-alpha.1` 与 `0.1.6-alpha.2` 的新代际 15 个官方 npm 包执行逐文件 SHA-256 比较，并针对变化包复核 Sandbox 升级、Agent、Tools、Sandbox Policy 与 Pwsh 契约。
- 测试套件扩到 41 项（新增不可获批升权目标的参数剥离用例），由 CI 在打标签发布时执行测试与 TypeScript 构建；真实开发依赖基线仍为 `0.1.6-alpha.2` npm 包集。
- 正式支持 Linux：插件本体为纯 JavaScript、无平台限制；已在 Ubuntu 24.04 实机（Landlock 沙箱后端）完成安装、Schema 投影与沙箱/审批行为验证。`.sh` 脚本预期同样适用于 macOS，但尚未在真实 Mac 上测试。
- 支持 DSH Desktop `2.0.3` 隐藏宿主包清单时的严格结构校验回退。
- 支持通过 `link:`、工作区软链接或外部插件目录加载插件。
- 在 `workspace-write` 下，若模型对经真实路径边界确认位于当前工作区内的 `write` / `edit` 错误申请 `danger-full-access`，插件会移除该误提权参数并按现有权限执行；工作区外路径、Shell 调用和其他无法确认的路径仍保留正常审批。
- npm 的 `latest` 与 `next` 标签均指向当前最新兼容版本；包名安装与 GitHub Release `.tgz` 使用同一份构建产物。

## 安装前准备

1. 完全退出正在运行的 DSH 或 DSH Desktop。
2. 解压 Release ZIP，确认本说明、四个安装/卸载脚本和 `.tgz` 文件位于同一目录。
3. 执行 `dsh --version`，确认 `dsh` 命令可用。
4. 启动只要求所有受检 `@deepseek-ai/dsh-*` 包报告同一个版本；逐版本白名单已移除，未知或更新的版本号会正常加载。

> 官方升级 Schema 仍是注册表全局静态定义，真正的升级仍在执行期处理。建议只在实际遇到空 justification、不可能执行的升级选项或重复重试问题后安装。

## 通过 npm Registry 安装（推荐）

```sh
dsh plugin --profile web add dsh-sandbox-escalation-fix@latest
```

其他 Profile 将 `web` 替换为实际名称。`@next` 当前指向同一版本，也可以锁定具体版本：

```sh
dsh plugin --profile web add dsh-sandbox-escalation-fix@0.2.0-win-linux
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

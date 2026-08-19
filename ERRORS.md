# 开发错题本

## 2026-08-19：定向 Vitest 无法启动

- 操作：执行 `npm test -- tests/wrapper.spec.ts`。
- 现象：Node.js 报错 `MODULE_NOT_FOUND`，无法找到 `node_modules\vitest\vitest.mjs`。
- 成因：当前工作区未安装 `node_modules`，而 `package.json` 的测试脚本依赖本地 Vitest 入口。
- 应对：未将该错误误判为代码或测试断言失败；本次未擅自安装依赖、未修改锁文件，改用 TypeScript 静态诊断与代码复核验证。后续在已执行依赖安装的环境中运行 `npm test -- tests/wrapper.spec.ts`。

## 2026-08-19：合并安装与构建命令异常退出

- 操作：在同一终端命令中顺序执行 `npm ci` 与 `build-release.ps1`。
- 现象：终端层仅返回退出码 `5999`，没有 npm、构建脚本或 PowerShell 的可诊断输出。
- 成因：当前无法从该空输出确定具体失败阶段，属于终端执行层异常，不能据此判断脚本、依赖或构建产物有错误。
- 应对：未宣称 Release 构建成功；改为分别执行依赖安装与构建，以缩小失败范围并保留各阶段输出。

## 2026-08-19：Release 构建脚本读取 JSON 包名失败

- 操作：在已完成 `npm ci` 后执行 `build-release.ps1`。
- 现象：脚本报错 `Unexpected package name:`，包名为空。
- 成因：PowerShell 对 `ConvertFrom-Json` 返回对象的 `.name` 访问与固有成员发生冲突，未读取 JSON 的 `name` 字段。
- 应对：改为经 `PSObject.Properties['name']` 和 `PSObject.Properties['version']` 显式读取 JSON 字段，再重新执行构建。

## 2026-08-19：当前 PowerShell 不支持属性集合索引读取

- 操作：使用 `PSObject.Properties['name']` 和 `PSObject.Properties['version']` 读取 `package.json` 字段。
- 现象：Release 脚本报错 `Cannot index into a null array`。
- 成因：当前 PowerShell 宿主对 `PSObject.Properties` 的索引器行为不兼容，索引访问返回空值。
- 应对：改为遍历属性集合，并用 `Where-Object Name -eq` 精确筛选 `name` 与 `version`，以兼容 Windows PowerShell。

## 2026-08-19：PowerShell 属性枚举仍无法读取 JSON 字段

- 操作：通过枚举 `PSObject.Properties` 筛选 `package.json` 的 `name` 和 `version`。
- 现象：构建脚本仍读取到空包名并终止。
- 成因：当前 PowerShell 宿主的 JSON 对象适配行为异常，无法可靠作为 Release 元数据源。
- 应对：Release 构建本来依赖 Node/npm，改用 `node -p` 原生读取 `package.json` 字段，绕开 PowerShell JSON 对象层。

## 2026-08-19：脚本内 Node 命令替换结果丢失

- 操作：在 Release 脚本内以 `node -p` 读取包名和版本；同一命令在交互终端中可正确输出。
- 现象：脚本内读取结果为空，导致包名校验失败。
- 成因：当前终端执行包装对脚本内命令替换的返回值存在兼容性问题，不能稳定依赖脚本内读取包元数据。
- 应对：移除元数据读取步骤，改为 `npm pack --pack-destination release` 直接按 `package.json` 生成 tarball，并验证 release 目录中唯一的目标包。

## 2026-08-19：首次构建时 release 目录不存在

- 操作：首次执行已简化的 `build-release.ps1`。
- 现象：脚本在枚举旧 tarball 时因 `release` 目录不存在而失败。
- 成因：旧 tarball 清理逻辑假定输出目录已经存在，首次发布不满足该前提。
- 应对：仅在 `release` 目录已存在时枚举并删除旧 tarball；首次构建交由 `npm pack --pack-destination` 生成输出目录和包文件。

## 2026-08-19：终端对 PowerShell 代码块解析不一致

- 操作：运行包含合法 `if { ... }` 块的 Release 构建脚本；磁盘读取显示语法完整。
- 现象：终端将块结尾的 `}` 误报为意外标记，且 AST 校验有时返回空输出或异常码。
- 成因：当前 Trae 终端执行包装与 PowerShell 脚本块解析存在不一致，不能稳定验证带块脚本。
- 应对：将 Release 脚本改为无代码块的线性命令；保留 DSH CLI 安装/卸载与 npm 打包流程，并通过实际构建验证。

## 2026-08-19：交付检查命令的变量插值错误

- 操作：在 PowerShell 检查命令中拼接 `"Syntax error in $file: ..."`。
- 现象：PowerShell 将 `$file:` 解析为无效变量引用，检查命令未执行。
- 成因：变量紧跟冒号时需要使用 `${file}` 分隔，或避免该字符串拼接形式。
- 应对：未将该错误归因于 Release 脚本；拆分为无循环、无该插值模式的独立检查命令。

## 2026-08-19：Release 脚本的失败边界加固

- 发现：初版构建脚本在外部 npm 命令失败后可能继续执行，初版安装脚本在同目录存在多个 tarball 时会选取第一个。
- 风险：构建失败可能留下不完整的 Release 文件；多个版本共存时可能安装非预期版本。
- 应对：构建脚本在 `npm run build` 与 `npm pack` 非零退出时立即返回该退出码；安装脚本要求同目录恰好一个目标 tarball。

## 2026-08-19：ZIP 阶段动态 tarball 路径为空

- 操作：构建 Release ZIP 时，将 `Get-ChildItem` 返回对象的 `.FullName` 传给 `Compress-Archive -LiteralPath`。
- 现象：tarball 已生成，但 `Compress-Archive` 收到空的 `LiteralPath` 参数，导致 ZIP 未创建。
- 成因：当前 PowerShell 宿主对动态对象属性读取存在不稳定行为。
- 应对：使用 `Compress-Archive -Path` 的原生通配符匹配目标 tarball，避免依赖对象属性读取。

## 2026-08-19：Release ZIP 中文说明文件路径编码异常

- 操作：使用中文文件名 `使用说明.md` 作为 `Compress-Archive` 的输入路径。
- 现象：当前终端对中文路径发生重复编码，导致已复制的说明文件无法被压缩命令定位。
- 成因：Windows 终端与 PowerShell 对非 ASCII 路径的编码处理不一致。
- 应对：Release 内说明文件改用 ASCII 名称 `RELEASE-USAGE.zh.md`，正文保持简明中文，避免解压和执行环境的路径歧义。

## 2026-08-19：PowerShell Compress-Archive 未生成 ZIP

- 操作：使用 `Compress-Archive` 将已生成的 tarball、脚本与说明压缩为 Release ZIP。
- 现象：脚本输出完成信息，但目标 ZIP 不存在；tarball 和三个辅助文件均已生成。
- 成因：当前 PowerShell 宿主的 `Compress-Archive` 路径处理不可靠。
- 应对：改用 Windows 自带 `tar.exe -a -c` 输出 ZIP，并在 tar 返回非零退出码时立即停止构建。

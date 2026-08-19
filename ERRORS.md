# 开发错题本

## 2026-08-19：定向 Vitest 无法启动

- 操作：执行 `npm test -- tests/wrapper.spec.ts`。
- 现象：Node.js 报错 `MODULE_NOT_FOUND`，无法找到 `node_modules\vitest\vitest.mjs`。
- 成因：当前工作区未安装 `node_modules`，而 `package.json` 的测试脚本依赖本地 Vitest 入口。
- 应对：未将该错误误判为代码或测试断言失败；本次未擅自安装依赖、未修改锁文件，改用 TypeScript 静态诊断与代码复核验证。后续在已执行依赖安装的环境中运行 `npm test -- tests/wrapper.spec.ts`。

import z from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
interface Config {
  logLevel?: 'silent' | 'info' | 'debug';
}
declare const Config: z<Config>;
declare const name = "sandbox-escalation-fix";
declare const inject: string[];
declare function apply(ctx: Context, config?: Config): void;
declare const _default: {
  name: string;
  inject: string[];
  Config: z<Config>;
  apply: typeof apply;
};
//#endregion
export { Config, apply, _default as default, inject, name };
//# sourceMappingURL=index.d.mts.map
export type TransformFn = (value: string) => string;

export interface EngineOptions {
  globals?: Record<string, string>;
  transforms?: Record<string, TransformFn>;
}

export interface CompileOptions {
  runtimeGlobals?: string[];
}

export interface RunOptions {
  globals?: Record<string, string>;
}

export interface UrlRule {
  params: Record<string, string>;
  template: string;
  inject: string;
}

export interface CompiledRules {
  apply(data: object, runOptions?: RunOptions): object;
}

export interface UrlInjectionEngine {
  compile(rules: UrlRule[], compileOptions?: CompileOptions): CompiledRules;
  apply(rules: UrlRule[], data: object, runOptions?: RunOptions): object;
}

export interface ParsedPath {
  segments: string[];
  depth: number;
}

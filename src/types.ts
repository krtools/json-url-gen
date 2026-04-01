export type TransformFn = (value: string) => string;

export interface EngineOptions {
  globals?: Record<string, string>;
  transforms?: Record<string, TransformFn>;
}

export interface UrlRule {
  params: Record<string, string>;
  template: string;
  inject: string;
}

export interface CompiledRules {
  apply(data: object): object;
}

export interface UrlInjectionEngine {
  compile(rules: UrlRule[]): CompiledRules;
  apply(rules: UrlRule[], data: object): object;
}

export interface ParsedPath {
  segments: string[];
  depth: number;
}

import { UrlRule, EngineOptions } from './types';
import { parsePath, getScopePrefixes } from './parse';
import { parseTemplateVars } from './template';

export function validate(rules: UrlRule[], options?: EngineOptions): void {
  const globals = options?.globals ?? {};
  const transforms = options?.transforms ?? {};

  rules.forEach((rule, ruleIdx) => {
    // V4 — Empty params
    if (Object.keys(rule.params).length === 0) {
      throw new Error(`Rule ${ruleIdx}: params must not be empty — no target node to inject into`);
    }

    // V1 — Cousin-node conflict
    const paramPrefixes: { name: string; prefixes: string[] }[] = [];
    for (const [name, path] of Object.entries(rule.params)) {
      const parsed = parsePath(path);
      const prefixes = getScopePrefixes(parsed.segments);
      paramPrefixes.push({ name, prefixes });
    }

    // Check every pair of params for cousin conflicts
    for (let i = 0; i < paramPrefixes.length; i++) {
      for (let j = i + 1; j < paramPrefixes.length; j++) {
        const a = paramPrefixes[i];
        const b = paramPrefixes[j];
        const minLen = Math.min(a.prefixes.length, b.prefixes.length);
        for (let d = 0; d < minLen; d++) {
          if (a.prefixes[d] !== b.prefixes[d]) {
            throw new Error(
              `Rule ${ruleIdx}: cousin-node conflict between params "${a.name}" and "${b.name}" — paths diverge at depth ${d + 1}`
            );
          }
        }
      }
    }

    // V2 — Undefined template variable
    const templateVars = parseTemplateVars(rule.template);
    for (const tv of templateVars) {
      if (!(tv.name in rule.params) && !(tv.name in globals) && !(tv.name in transforms)) {
        throw new Error(
          `Rule ${ruleIdx}: undefined template variable "${tv.name}"`
        );
      }
    }

    // V3 — Undefined transform modifier
    for (const tv of templateVars) {
      if (tv.modifier && tv.modifier !== 'raw' && !(tv.modifier in transforms)) {
        throw new Error(
          `Rule ${ruleIdx}: undefined transform modifier "${tv.modifier}"`
        );
      }
    }
  });
}

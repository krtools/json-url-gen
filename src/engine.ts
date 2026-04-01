import { UrlRule, EngineOptions, UrlInjectionEngine, CompiledRules } from './types';
import { parsePath } from './parse';
import { compileTemplate, renderCompiled, CompiledTemplatePart } from './template';
import { validate } from './validate';

// ── Compiled instruction types (internal) ──────────────────────────

interface CompiledParam {
  name: string;
  fieldName: string;
  depth: number;
}

interface RuleInstruction {
  paramsByDepth: Map<number, CompiledParam[]>;
  traversalSegments: string[];
  maxDepth: number;
  templateParts: CompiledTemplatePart[];
  inject: string;
}

// ── Compile ────────────────────────────────────────────────────────

function compileRules(
  rules: UrlRule[],
  globals: Record<string, string>,
  transforms: Record<string, (v: string) => string>
): RuleInstruction[] {
  validate(rules, { globals, transforms });

  return rules.map(rule => {
    // Parse every param path once
    const parsed: { name: string; segments: string[]; fieldName: string; depth: number }[] = [];
    let maxDepth = 0;

    for (const [name, path] of Object.entries(rule.params)) {
      const p = parsePath(path);
      const fieldName = p.segments[p.segments.length - 1];
      parsed.push({ name, segments: p.segments, fieldName, depth: p.depth });
      if (p.depth > maxDepth) maxDepth = p.depth;

      if (name in globals) {
        console.warn(
          `Warning: param "${name}" shadows global with the same name — param value will be used`
        );
      }
    }

    // Group params by depth (only name + fieldName + depth needed at runtime)
    const paramsByDepth = new Map<number, CompiledParam[]>();
    for (const p of parsed) {
      const list = paramsByDepth.get(p.depth) || [];
      list.push({ name: p.name, fieldName: p.fieldName, depth: p.depth });
      paramsByDepth.set(p.depth, list);
    }

    // Traversal path = deepest param's segments minus its trailing field name
    const deepest = parsed.find(p => p.depth === maxDepth)!;
    const traversalSegments = deepest.segments.slice(0, -1);

    // Pre-compile template — all modifier/transform resolution happens here
    const templateParts = compileTemplate(rule.template, transforms);

    return { paramsByDepth, traversalSegments, maxDepth, templateParts, inject: rule.inject };
  });
}

// ── Run ────────────────────────────────────────────────────────────

function runInstructions(instructions: RuleInstruction[], globals: Record<string, string>, data: object): object {
  for (const inst of instructions) {
    traverse(data, inst, 0, 0, {}, globals);
  }
  return data;
}

function traverse(
  current: unknown,
  inst: RuleInstruction,
  segIdx: number,
  currentDepth: number,
  scope: Record<string, string>,
  globals: Record<string, string>,
): void {
  if (segIdx >= inst.traversalSegments.length) {
    // Target node reached — collect target-depth params, render, inject
    const node = current as Record<string, unknown>;
    if (!node || typeof node !== 'object') return;

    const targetParams = inst.paramsByDepth.get(inst.maxDepth);
    const localScope = { ...scope };
    if (targetParams) {
      for (const p of targetParams) {
        const val = node[p.fieldName];
        if (val !== undefined && val !== null) {
          localScope[p.name] = String(val);
        }
      }
    }

    const values: Record<string, unknown> = { ...globals, ...localScope };
    const result = renderCompiled(inst.templateParts, values);
    if (result !== null) {
      node[inst.inject] = result;
    }
    return;
  }

  const seg = inst.traversalSegments[segIdx];

  if (seg === '[*]') {
    if (!Array.isArray(current)) return;

    const nextDepth = currentDepth + 1;
    const depthParams = inst.paramsByDepth.get(nextDepth);

    for (const item of current) {
      const newScope = { ...scope };
      if (depthParams && item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        for (const p of depthParams) {
          if (p.depth < inst.maxDepth) {
            const val = obj[p.fieldName];
            if (val !== undefined && val !== null) {
              newScope[p.name] = String(val);
            }
          }
        }
      }
      traverse(item, inst, segIdx + 1, nextDepth, newScope, globals);
    }
  } else {
    const obj = current as Record<string, unknown>;
    if (!obj || typeof obj !== 'object') return;
    const next = obj[seg];
    if (next === undefined || next === null) return;

    if (currentDepth === 0) {
      const zeroParams = inst.paramsByDepth.get(0);
      if (zeroParams) {
        const newScope = { ...scope };
        for (const p of zeroParams) {
          const val = obj[p.fieldName];
          if (val !== undefined && val !== null) {
            newScope[p.name] = String(val);
          }
        }
        traverse(next, inst, segIdx + 1, currentDepth, newScope, globals);
        return;
      }
    }
    traverse(next, inst, segIdx + 1, currentDepth, scope, globals);
  }
}

// ── Public API ─────────────────────────────────────────────────────

export function createEngine(options?: EngineOptions): UrlInjectionEngine {
  const globals = options?.globals ?? {};
  const transforms = options?.transforms ?? {};

  return {
    compile(rules: UrlRule[]): CompiledRules {
      const instructions = compileRules(rules, globals, transforms);
      return {
        apply(data: object): object {
          return runInstructions(instructions, globals, data);
        }
      };
    },

    apply(rules: UrlRule[], data: object): object {
      return this.compile(rules).apply(data);
    }
  };
}

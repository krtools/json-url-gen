import { TransformFn } from './types';

const TEMPLATE_VAR_RE = /\{([^}]+)\}/g;

export interface TemplateVar {
  name: string;
  modifier?: string;
}

/** A compiled template part: either a literal string or a pre-bound variable lookup. */
export type CompiledTemplatePart =
  | string
  | { name: string; apply: (v: string) => string };

const identity = (v: string) => v;

export function parseTemplateVars(template: string): TemplateVar[] {
  const vars: TemplateVar[] = [];
  let match;
  const re = new RegExp(TEMPLATE_VAR_RE.source, 'g');
  while ((match = re.exec(template)) !== null) {
    const inner = match[1];
    const pipeIdx = inner.indexOf('|');
    if (pipeIdx === -1) {
      vars.push({ name: inner });
    } else {
      vars.push({ name: inner.substring(0, pipeIdx), modifier: inner.substring(pipeIdx + 1) });
    }
  }
  return vars;
}

/**
 * Pre-parse a template into an array of literals and pre-bound variable applicators.
 * All modifier resolution happens here — the runner does zero branching on modifier type.
 */
export function compileTemplate(
  template: string,
  transforms: Record<string, TransformFn>
): CompiledTemplatePart[] {
  const parts: CompiledTemplatePart[] = [];
  const re = new RegExp(TEMPLATE_VAR_RE.source, 'g');
  let lastIndex = 0;
  let match;

  while ((match = re.exec(template)) !== null) {
    if (match.index > lastIndex) {
      parts.push(template.substring(lastIndex, match.index));
    }

    const inner = match[1];
    const pipeIdx = inner.indexOf('|');
    const name = pipeIdx === -1 ? inner : inner.substring(0, pipeIdx);
    const modifier = pipeIdx === -1 ? undefined : inner.substring(pipeIdx + 1);

    let apply: (v: string) => string;
    if (modifier === undefined) {
      apply = encodeURIComponent;
    } else if (modifier === 'raw') {
      apply = identity;
    } else {
      const fn = transforms[modifier];
      if (!fn) throw new Error(`Unknown transform modifier: "${modifier}"`);
      apply = fn;
    }

    parts.push({ name, apply });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < template.length) {
    parts.push(template.substring(lastIndex));
  }

  return parts;
}

/** Fast renderer for pre-compiled template parts. No regex, no map lookups. */
export function renderCompiled(
  parts: CompiledTemplatePart[],
  values: Record<string, unknown>
): string | null {
  let result = '';
  for (const part of parts) {
    if (typeof part === 'string') {
      result += part;
    } else {
      const val = values[part.name];
      if (val === undefined || val === null || val === '') return null;
      result += part.apply(String(val));
    }
  }
  return result;
}

/** Standalone renderer (parses template each call). Kept for direct use / testing. */
export function renderTemplate(
  template: string,
  values: Record<string, unknown>,
  transforms: Record<string, TransformFn>
): string | null {
  return renderCompiled(compileTemplate(template, transforms), values);
}

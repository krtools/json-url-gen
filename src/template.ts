import { TransformFn } from './types';

const TEMPLATE_VAR_RE = /\{([^}]+)\}/g;

export interface TemplateVar {
  name: string;
  modifiers: string[];
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
    const segments = match[1].split('|').map(s => s.trim());
    vars.push({ name: segments[0], modifiers: segments.slice(1) });
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

    const segments = match[1].split('|').map(s => s.trim());
    const name = segments[0];
    const modifiers = segments.slice(1);

    // Separate transforms from encoding directives (raw/encode).
    // Transforms are chained in order; for encoding, last directive wins.
    const fns: TransformFn[] = [];
    let encode = true; // default: encodeURIComponent
    for (const mod of modifiers) {
      if (mod === 'raw') {
        encode = false;
      } else if (mod === 'encode') {
        encode = true;
      } else {
        const fn = transforms[mod];
        if (!fn) throw new Error(`Unknown transform modifier: "${mod}"`);
        fns.push(fn);
      }
    }

    let apply: (v: string) => string;
    if (fns.length === 0) {
      apply = encode ? encodeURIComponent : identity;
    } else if (fns.length === 1) {
      const fn = fns[0];
      apply = encode ? (v) => encodeURIComponent(fn(v)) : fn;
    } else {
      apply = encode
        ? (v) => encodeURIComponent(fns.reduce((acc, fn) => fn(acc), v))
        : (v) => fns.reduce((acc, fn) => fn(acc), v);
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

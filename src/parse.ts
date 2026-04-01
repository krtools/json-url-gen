import { ParsedPath } from './types';

export function parsePath(path: string): ParsedPath {
  if (path === '') {
    throw new Error('Path must not be empty');
  }

  const segments: string[] = [];
  let i = 0;

  while (i < path.length) {
    if (path[i] === '.') {
      i++;
      continue;
    }

    if (path[i] === '[') {
      if (path[i + 1] === '*' && path[i + 2] === ']') {
        segments.push('[*]');
        i += 3;
      } else {
        throw new Error(`Invalid path syntax at position ${i}: "${path}"`);
      }
    } else {
      let end = i;
      while (end < path.length && path[end] !== '.' && path[end] !== '[') {
        end++;
      }
      segments.push(path.substring(i, end));
      i = end;
    }
  }

  if (segments.length === 0) {
    throw new Error(`Invalid path: "${path}"`);
  }

  const depth = segments.filter(s => s === '[*]').length;
  return { segments, depth };
}

/**
 * Extract scope prefixes from a parsed path.
 * For "tenants[*].regions[*].services[*].id" this returns:
 *   ["tenants.[*]", "tenants.[*].regions.[*]", "tenants.[*].regions.[*].services.[*]"]
 */
export function getScopePrefixes(segments: string[]): string[] {
  const prefixes: string[] = [];
  let current = '';

  for (const seg of segments) {
    current += (current ? '.' : '') + seg;
    if (seg === '[*]') {
      prefixes.push(current);
    }
  }

  return prefixes;
}

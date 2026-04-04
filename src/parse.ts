import { ParsedPath } from './types';

const PLAIN_ESCAPABLE = new Set(['.', '[', '\\']);
const QUOTED_ESCAPABLE = new Set(['"', '\\']);

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
      if (path[i + 1] === ']') {
        // Array iteration: []
        segments.push('[]');
        i += 2;
      } else if (path[i + 1] === '"') {
        // Quoted segment: ["..."]
        i += 2; // skip ["
        let seg = '';
        while (i < path.length) {
          if (path[i] === '\\') {
            if (i + 1 >= path.length) {
              throw new Error(`Unexpected end of path after backslash at position ${i}: "${path}"`);
            }
            const next = path[i + 1];
            if (!QUOTED_ESCAPABLE.has(next)) {
              throw new Error(`Invalid escape sequence "\\${next}" in quoted segment at position ${i}: "${path}"`);
            }
            seg += next;
            i += 2;
          } else if (path[i] === '"') {
            break;
          } else {
            seg += path[i];
            i++;
          }
        }
        if (i >= path.length || path[i] !== '"') {
          throw new Error(`Unterminated quoted segment at position ${i}: "${path}"`);
        }
        i++; // skip closing "
        if (i >= path.length || path[i] !== ']') {
          throw new Error(`Expected "]" after quoted segment at position ${i}: "${path}"`);
        }
        i++; // skip ]
        if (seg === '') {
          throw new Error(`Empty quoted segment is not allowed: "${path}"`);
        }
        segments.push(seg);
      } else {
        throw new Error(`Invalid path syntax at position ${i}: "${path}"`);
      }
    } else {
      // Plain segment (with backslash escaping)
      let seg = '';
      while (i < path.length && path[i] !== '.' && path[i] !== '[') {
        if (path[i] === '\\') {
          if (i + 1 >= path.length) {
            throw new Error(`Unexpected end of path after backslash at position ${i}: "${path}"`);
          }
          const next = path[i + 1];
          if (!PLAIN_ESCAPABLE.has(next)) {
            throw new Error(`Invalid escape sequence "\\${next}" at position ${i}: "${path}"`);
          }
          seg += next;
          i += 2;
        } else {
          seg += path[i];
          i++;
        }
      }
      if (seg !== '') {
        segments.push(seg);
      }
    }
  }

  if (segments.length === 0) {
    throw new Error(`Invalid path: "${path}"`);
  }

  const depth = segments.filter(s => s === '[]').length;
  return { segments, depth };
}

/**
 * Extract scope prefixes from a parsed path.
 * For "tenants[].regions[].services[].id" this returns:
 *   ["tenants.[]", "tenants.[].regions.[]", "tenants.[].regions.[].services.[]"]
 */
export function getScopePrefixes(segments: string[]): string[] {
  const prefixes: string[] = [];
  let current = '';

  for (const seg of segments) {
    current += (current ? '.' : '') + seg;
    if (seg === '[]') {
      prefixes.push(current);
    }
  }

  return prefixes;
}

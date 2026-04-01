import { describe, it, expect } from 'vitest';
import { parsePath } from '../src/parse';

describe('parsePath', () => {
  it('parses multi-level path with wildcards', () => {
    expect(parsePath('tenants[*].regions[*].id')).toEqual({
      segments: ['tenants', '[*]', 'regions', '[*]', 'id'],
      depth: 2,
    });
  });

  it('parses single-level path with wildcard', () => {
    expect(parsePath('items[*].name')).toEqual({
      segments: ['items', '[*]', 'name'],
      depth: 1,
    });
  });

  it('parses simple property path (no wildcards)', () => {
    expect(parsePath('name')).toEqual({
      segments: ['name'],
      depth: 0,
    });
  });

  it('throws on empty string', () => {
    expect(() => parsePath('')).toThrow();
  });

  it('throws on invalid bracket syntax', () => {
    expect(() => parsePath('bad[syntax')).toThrow();
  });
});

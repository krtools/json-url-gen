import { describe, it, expect } from 'vitest';
import { parsePath } from '../src/parse';

describe('parsePath', () => {
  it('parses multi-level path with wildcards', () => {
    expect(parsePath('tenants[].regions[].id')).toEqual({
      segments: ['tenants', '[]', 'regions', '[]', 'id'],
      depth: 2,
    });
  });

  it('parses single-level path with wildcard', () => {
    expect(parsePath('items[].name')).toEqual({
      segments: ['items', '[]', 'name'],
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

  describe('backslash escaping (plain segments)', () => {
    it('escapes a dot in a key name', () => {
      expect(parsePath('foo\\.bar')).toEqual({
        segments: ['foo.bar'],
        depth: 0,
      });
    });

    it('escapes a bracket in a key name', () => {
      expect(parsePath('data\\[0]')).toEqual({
        segments: ['data[0]'],
        depth: 0,
      });
    });

    it('escapes a backslash', () => {
      expect(parsePath('back\\\\slash')).toEqual({
        segments: ['back\\slash'],
        depth: 0,
      });
    });

    it('combines escaping with wildcards', () => {
      expect(parsePath('items[].foo\\.bar')).toEqual({
        segments: ['items', '[]', 'foo.bar'],
        depth: 1,
      });
    });

    it('throws on invalid escape sequence', () => {
      expect(() => parsePath('foo\\nbar')).toThrow(/Invalid escape sequence/);
    });

    it('throws on trailing backslash', () => {
      expect(() => parsePath('foo\\')).toThrow(/Unexpected end/);
    });
  });

  describe('quoted segments', () => {
    it('parses a quoted segment with dots', () => {
      expect(parsePath('["foo.bar"]')).toEqual({
        segments: ['foo.bar'],
        depth: 0,
      });
    });

    it('parses a quoted segment with wildcard characters', () => {
      expect(parsePath('["ANNOYING[*]_PATH"]')).toEqual({
        segments: ['ANNOYING[*]_PATH'],
        depth: 0,
      });
    });

    it('parses quoted segment combined with wildcards', () => {
      expect(parsePath('data[].["weird.key"].name')).toEqual({
        segments: ['data', '[]', 'weird.key', 'name'],
        depth: 1,
      });
    });

    it('escapes a quote inside a quoted segment', () => {
      expect(parsePath('["has\\"quotes"]')).toEqual({
        segments: ['has"quotes'],
        depth: 0,
      });
    });

    it('escapes a backslash inside a quoted segment', () => {
      expect(parsePath('["back\\\\slash"]')).toEqual({
        segments: ['back\\slash'],
        depth: 0,
      });
    });

    it('throws on invalid escape inside quoted segment', () => {
      expect(() => parsePath('["foo\\nbar"]')).toThrow(/Invalid escape sequence/);
    });

    it('throws on unterminated quoted segment', () => {
      expect(() => parsePath('["unterminated')).toThrow(/Unterminated/);
    });

    it('throws on missing closing bracket', () => {
      expect(() => parsePath('["key"')).toThrow();
    });

    it('throws on empty quoted segment', () => {
      expect(() => parsePath('[""]')).toThrow(/Empty quoted segment/);
    });

    it('multiple quoted segments in a path', () => {
      expect(parsePath('["a.b"][].["c.d"]')).toEqual({
        segments: ['a.b', '[]', 'c.d'],
        depth: 1,
      });
    });
  });
});

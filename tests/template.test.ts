import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../src/template';

describe('renderTemplate', () => {
  it('applies raw modifier (no encoding)', () => {
    expect(
      renderTemplate('{APP_DOMAIN|raw}/path', { APP_DOMAIN: 'api.example.com' }, {})
    ).toBe('api.example.com/path');
  });

  it('applies default encodeURIComponent', () => {
    expect(
      renderTemplate('{name}', { name: 'hello world' }, {})
    ).toBe('hello%20world');
  });

  it('applies raw modifier to skip encoding', () => {
    expect(
      renderTemplate('{name|raw}', { name: 'hello world' }, {})
    ).toBe('hello world');
  });

  it('applies custom transform', () => {
    const slugify = (v: string) => v.toLowerCase().replace(/\s+/g, '-');
    expect(
      renderTemplate('{name|slugify}', { name: 'Hello World' }, { slugify })
    ).toBe('hello-world');
  });

  it('returns null for missing variable', () => {
    expect(renderTemplate('{missing}', {}, {})).toBeNull();
  });

  it('returns null when one variable is null', () => {
    expect(renderTemplate('{a}/{b}', { a: 'x', b: null }, {})).toBeNull();
  });

  it('returns null when one variable is empty string', () => {
    expect(renderTemplate('{a}/{b}', { a: 'x', b: '' }, {})).toBeNull();
  });

  it('throws on unknown modifier', () => {
    expect(() =>
      renderTemplate('{a|unknownMod}', { a: 'x' }, {})
    ).toThrow('unknownMod');
  });
});

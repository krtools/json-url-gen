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

  // ── Chained transforms ────────────────────────────────────────────

  it('chains multiple transforms left to right', () => {
    const trim = (v: string) => v.trim();
    const upper = (v: string) => v.toUpperCase();
    expect(
      renderTemplate('{name|trim|upper}', { name: '  hello  ' }, { trim, upper })
    ).toBe('HELLO');
  });

  it('chains transforms then applies default encoding', () => {
    const upper = (v: string) => v.toUpperCase();
    expect(
      renderTemplate('{q|upper}', { q: 'hello world' }, { upper })
    ).toBe('HELLO%20WORLD');
  });

  it('chains transforms with raw to skip encoding', () => {
    const upper = (v: string) => v.toUpperCase();
    expect(
      renderTemplate('{q|upper|raw}', { q: 'hello world' }, { upper })
    ).toBe('HELLO WORLD');
  });

  it('last encoding directive wins (raw then encode)', () => {
    const upper = (v: string) => v.toUpperCase();
    expect(
      renderTemplate('{q|raw|upper|encode}', { q: 'hello world' }, { upper })
    ).toBe('HELLO%20WORLD');
  });

  it('last encoding directive wins (encode then raw)', () => {
    expect(
      renderTemplate('{q|encode|raw}', { q: 'hello world' }, {})
    ).toBe('hello world');
  });

  it('encoding directives interleaved with transforms', () => {
    const upper = (v: string) => v.toUpperCase();
    const trim = (v: string) => v.trim();
    // raw, then trim, then encode, then upper → last encoding = encode, transforms = [trim, upper]
    expect(
      renderTemplate('{q|raw|trim|encode|upper}', { q: '  hi there  ' }, { upper, trim })
    ).toBe('HI%20THERE');
  });

  it('redundant raw directives are fine', () => {
    expect(
      renderTemplate('{q|raw|raw|raw}', { q: 'a b' }, {})
    ).toBe('a b');
  });

  it('three transforms chained', () => {
    const a = (v: string) => v + '-a';
    const b = (v: string) => v + '-b';
    const c = (v: string) => v + '-c';
    expect(
      renderTemplate('{x|a|b|c|raw}', { x: 'start' }, { a, b, c })
    ).toBe('start-a-b-c');
  });

  it('tolerates whitespace around pipes', () => {
    const upper = (v: string) => v.toUpperCase();
    expect(
      renderTemplate('{ name | upper | raw }', { name: 'hello' }, { upper })
    ).toBe('HELLO');
  });

  it('tolerates whitespace with default encoding', () => {
    expect(
      renderTemplate('{ q }', { q: 'a b' }, {})
    ).toBe('a%20b');
  });
});

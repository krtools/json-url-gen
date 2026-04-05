import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/engine';

const engine = createEngine();
const apply = (rules: Parameters<typeof engine.apply>[0], data: object) =>
  engine.apply(rules, data);

describe('engine.apply (convenience)', () => {
  it('basic single-depth injection', () => {
    const data = { items: [{ id: '1', name: 'foo' }, { id: '2', name: 'bar' }] };
    apply(
      [{ params: { itemId: 'items[].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/items/1');
    expect(data.items[1].url).toBe('https://example.com/items/2');
  });

  it('multi-level param collection', () => {
    const data = {
      tenants: [{
        id: 't1',
        regions: [{
          code: 'us-east',
          services: [{ id: 's1' }, { id: 's2' }],
        }],
      }],
    };
    apply(
      [{
        params: {
          tenantId: 'tenants[].id',
          region: 'tenants[].regions[].code',
          serviceId: 'tenants[].regions[].services[].id',
        },
        template: 'https://example.com/{tenantId}/{region}/{serviceId}',
        inject: 'href',
      }],
      data
    );
    expect((data as any).tenants[0].regions[0].services[0].href).toBe('https://example.com/t1/us-east/s1');
    expect((data as any).tenants[0].regions[0].services[1].href).toBe('https://example.com/t1/us-east/s2');
  });

  it('globals available in template', () => {
    const eng = createEngine({ globals: { DOMAIN: 'api.acme.com' } });
    const data = { items: [{ id: '42' }] };
    eng.apply(
      [{ params: { itemId: 'items[].id' }, template: 'https://{DOMAIN|raw}/items/{itemId}', inject: 'url' }],
      data
    );
    expect((data as any).items[0].url).toBe('https://api.acme.com/items/42');
  });

  it('missing param value → no injection', () => {
    const data: any = { items: [{ id: '1' }, { name: 'no-id' }] };
    apply(
      [{ params: { itemId: 'items[].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/items/1');
    expect(data.items[1].url).toBeUndefined();
  });

  it('default encoding applied', () => {
    const data: any = { items: [{ id: 'hello world' }] };
    apply(
      [{ params: { itemId: 'items[].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/items/hello%20world');
  });

  it('raw modifier skips encoding', () => {
    const data: any = { items: [{ path: 'foo/bar/baz' }] };
    apply(
      [{ params: { p: 'items[].path' }, template: 'https://example.com/{p|raw}', inject: 'url' }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/foo/bar/baz');
  });

  it('custom transform', () => {
    const eng = createEngine({ transforms: { upper: (v) => v.toUpperCase() } });
    const data: any = { items: [{ code: 'abc' }] };
    eng.apply(
      [{ params: { code: 'items[].code' }, template: 'https://example.com/{code|upper}', inject: 'url' }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/ABC');
  });

  it('inject overwrites existing property', () => {
    const data: any = { items: [{ id: '1', url: 'OLD' }] };
    apply(
      [{ params: { itemId: 'items[].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/items/1');
  });

  it('sequential rule application', () => {
    const data: any = { items: [{ id: '1' }] };
    apply(
      [
        { params: { itemId: 'items[].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' },
        { params: { itemId: 'items[].id' }, template: 'https://other.com/ref/{itemId}', inject: 'altUrl' },
      ],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/items/1');
    expect(data.items[0].altUrl).toBe('https://other.com/ref/1');
  });

  it('multiple tenants × regions × services (combinatoric)', () => {
    const data: any = {
      tenants: [
        {
          id: 'tA',
          regions: [
            { code: 'us', services: [{ id: 's1' }, { id: 's2' }] },
            { code: 'eu', services: [{ id: 's3' }] },
          ],
        },
        {
          id: 'tB',
          regions: [
            { code: 'ap', services: [{ id: 's4' }] },
          ],
        },
      ],
    };
    apply(
      [{
        params: {
          tenantId: 'tenants[].id',
          region: 'tenants[].regions[].code',
          serviceId: 'tenants[].regions[].services[].id',
        },
        template: 'https://example.com/{tenantId}/{region}/{serviceId}',
        inject: 'href',
      }],
      data
    );
    expect(data.tenants[0].regions[0].services[0].href).toBe('https://example.com/tA/us/s1');
    expect(data.tenants[0].regions[0].services[1].href).toBe('https://example.com/tA/us/s2');
    expect(data.tenants[0].regions[1].services[0].href).toBe('https://example.com/tA/eu/s3');
    expect(data.tenants[1].regions[0].services[0].href).toBe('https://example.com/tB/ap/s4');
  });

  it('params at same depth as target (sibling fields)', () => {
    const data: any = { items: [{ id: '1', type: 'widget' }] };
    apply(
      [{
        params: { itemId: 'items[].id', itemType: 'items[].type' },
        template: 'https://example.com/{itemType}/{itemId}',
        inject: 'url',
      }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/widget/1');
  });
});

describe('engine.compile + apply', () => {
  it('compiled rules can be applied to multiple data objects', () => {
    const rules = [
      { params: { itemId: 'items[].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' },
    ];
    const compiled = engine.compile(rules);

    const data1: any = { items: [{ id: 'a' }, { id: 'b' }] };
    compiled.apply(data1);
    expect(data1.items[0].url).toBe('https://example.com/items/a');
    expect(data1.items[1].url).toBe('https://example.com/items/b');

    const data2: any = { items: [{ id: 'x' }] };
    compiled.apply(data2);
    expect(data2.items[0].url).toBe('https://example.com/items/x');
  });

  it('compile validates once, not per apply', () => {
    // Invalid rule — should throw at compile time
    expect(() =>
      engine.compile([{
        params: { a: 'users[].id', b: 'orders[].name' },
        template: '{a}/{b}',
        inject: 'url',
      }])
    ).toThrow();
  });

  it('compiled multi-level rules work correctly', () => {
    const eng = createEngine({ globals: { DOMAIN: 'api.test.com' } });
    const compiled = eng.compile([{
      params: {
        tenantId: 'tenants[].id',
        region: 'tenants[].regions[].code',
        serviceId: 'tenants[].regions[].services[].id',
      },
      template: 'https://{DOMAIN|raw}/{tenantId}/{region}/{serviceId}',
      inject: 'href',
    }]);

    const data: any = {
      tenants: [{
        id: 't1',
        regions: [{ code: 'us', services: [{ id: 's1' }] }],
      }],
    };
    compiled.apply(data);
    expect(data.tenants[0].regions[0].services[0].href).toBe('https://api.test.com/t1/us/s1');
  });

  it('compiled transforms are pre-bound', () => {
    const eng = createEngine({
      transforms: { slug: (v) => v.toLowerCase().replace(/\s+/g, '-') },
    });
    const compiled = eng.compile([{
      params: { name: 'items[].name' },
      template: 'https://example.com/{name|slug}',
      inject: 'url',
    }]);

    const data: any = { items: [{ name: 'Hello World' }, { name: 'Foo Bar' }] };
    compiled.apply(data);
    expect(data.items[0].url).toBe('https://example.com/hello-world');
    expect(data.items[1].url).toBe('https://example.com/foo-bar');
  });

  it('compiled sequential rules', () => {
    const compiled = engine.compile([
      { params: { id: 'items[].id' }, template: 'https://a.com/{id}', inject: 'urlA' },
      { params: { id: 'items[].id' }, template: 'https://b.com/{id}', inject: 'urlB' },
    ]);

    const data: any = { items: [{ id: '1' }] };
    compiled.apply(data);
    expect(data.items[0].urlA).toBe('https://a.com/1');
    expect(data.items[0].urlB).toBe('https://b.com/1');
  });
});

describe('runtime globals', () => {
  it('run-time globals are available in the template', () => {
    const compiled = engine.compile(
      [{ params: { id: 'items[].id' }, template: 'https://{HOST|raw}/items/{id}', inject: 'url' }],
      { runtimeGlobals: ['HOST'] },
    );

    const data: any = { items: [{ id: '1' }] };
    compiled.apply(data, { globals: { HOST: 'api.example.com' } });
    expect(data.items[0].url).toBe('https://api.example.com/items/1');
  });

  it('run-time globals override compile-time globals', () => {
    const eng = createEngine({ globals: { ENV: 'staging' } });
    const compiled = eng.compile(
      [{ params: { id: 'items[].id' }, template: 'https://{ENV|raw}.example.com/{id}', inject: 'url' }],
    );

    const data: any = { items: [{ id: '1' }] };
    compiled.apply(data, { globals: { ENV: 'production' } });
    expect(data.items[0].url).toBe('https://production.example.com/1');
  });

  it('params still take precedence over run-time globals', () => {
    const compiled = engine.compile(
      [{ params: { id: 'items[].id' }, template: 'https://example.com/{id}', inject: 'url' }],
    );

    const data: any = { items: [{ id: 'from-data' }] };
    compiled.apply(data, { globals: { id: 'from-runtime' } });
    expect(data.items[0].url).toBe('https://example.com/from-data');
  });

  it('missing run-time global skips injection (no crash)', () => {
    const compiled = engine.compile(
      [{ params: { id: 'items[].id' }, template: 'https://{HOST|raw}/{id}', inject: 'url' }],
      { runtimeGlobals: ['HOST'] },
    );

    const data: any = { items: [{ id: '1' }] };
    compiled.apply(data); // no run-time globals provided
    expect(data.items[0].url).toBeUndefined();
  });

  it('different run-time globals per apply call', () => {
    const compiled = engine.compile(
      [{ params: { id: 'items[].id' }, template: 'https://{ENV|raw}.example.com/{id}', inject: 'url' }],
      { runtimeGlobals: ['ENV'] },
    );

    const d1: any = { items: [{ id: '1' }] };
    compiled.apply(d1, { globals: { ENV: 'staging' } });
    expect(d1.items[0].url).toBe('https://staging.example.com/1');

    const d2: any = { items: [{ id: '1' }] };
    compiled.apply(d2, { globals: { ENV: 'production' } });
    expect(d2.items[0].url).toBe('https://production.example.com/1');
  });

  it('undeclared runtime global still fails V2 at compile time', () => {
    expect(() =>
      engine.compile([{
        params: { id: 'items[].id' },
        template: 'https://{UNDECLARED|raw}/{id}',
        inject: 'url',
      }])
    ).toThrow(/UNDECLARED/);
  });

  it('convenience apply also accepts run-time globals', () => {
    const eng = createEngine({ globals: { BASE: 'https://example.com' } });
    const data: any = { items: [{ id: '1' }] };
    eng.apply(
      [{ params: { id: 'items[].id' }, template: '{BASE|raw}/{TENANT|raw}/{id}', inject: 'url' }],
      data,
      { globals: { TENANT: 'acme' } },
    );
    expect(data.items[0].url).toBe('https://example.com/acme/1');
  });
});

describe('primitive array params', () => {
  it('simple primitive array → injects sibling array of URLs', () => {
    const data: any = { tags: ['foo', 'bar', 'baz'] };
    apply(
      [{ params: { t: 'tags[]' }, template: 'https://example.com/tags/{t}', inject: 'urls' }],
      data
    );
    expect(data.urls).toEqual([
      'https://example.com/tags/foo',
      'https://example.com/tags/bar',
      'https://example.com/tags/baz',
    ]);
  });

  it('nested: per-parent arrays of URLs', () => {
    const data: any = {
      orgs: [
        { id: 'acme', tags: ['a', 'b'] },
        { id: 'globex', tags: ['c'] },
      ],
    };
    apply(
      [{
        params: { orgId: 'orgs[].id', t: 'orgs[].tags[]' },
        template: 'https://example.com/{orgId}/tags/{t}',
        inject: 'tagUrls',
      }],
      data
    );
    expect(data.orgs[0].tagUrls).toEqual([
      'https://example.com/acme/tags/a',
      'https://example.com/acme/tags/b',
    ]);
    expect(data.orgs[1].tagUrls).toEqual([
      'https://example.com/globex/tags/c',
    ]);
  });

  it('depth-0 sibling param accessible in template', () => {
    const data: any = { version: 'v2', tags: ['x'] };
    apply(
      [{
        params: { ver: 'version', t: 'tags[]' },
        template: 'https://example.com/{ver}/{t}',
        inject: 'urls',
      }],
      data
    );
    expect(data.urls).toEqual(['https://example.com/v2/x']);
  });

  it('empty source array → injects empty array', () => {
    const data: any = { tags: [] };
    apply(
      [{ params: { t: 'tags[]' }, template: 'https://example.com/{t}', inject: 'urls' }],
      data
    );
    expect(data.urls).toEqual([]);
  });

  it('null and undefined elements are skipped', () => {
    const data: any = { tags: ['a', null, undefined, 'b'] };
    apply(
      [{ params: { t: 'tags[]' }, template: 'https://example.com/{t}', inject: 'urls' }],
      data
    );
    expect(data.urls).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  it('numeric elements are stringified', () => {
    const data: any = { ids: [1, 2, 3] };
    apply(
      [{ params: { id: 'ids[]' }, template: 'https://example.com/items/{id}', inject: 'urls' }],
      data
    );
    expect(data.urls).toEqual([
      'https://example.com/items/1',
      'https://example.com/items/2',
      'https://example.com/items/3',
    ]);
  });

  it('missing array field → no injection', () => {
    const data: any = { other: 'x' };
    apply(
      [{ params: { t: 'tags[]' }, template: 'https://example.com/{t}', inject: 'urls' }],
      data
    );
    expect(data.urls).toBeUndefined();
  });

  it('compiled rules reusable across data objects', () => {
    const compiled = engine.compile([
      { params: { t: 'tags[]' }, template: 'https://example.com/{t}', inject: 'urls' },
    ]);

    const d1: any = { tags: ['a'] };
    compiled.apply(d1);
    expect(d1.urls).toEqual(['https://example.com/a']);

    const d2: any = { tags: ['x', 'y'] };
    compiled.apply(d2);
    expect(d2.urls).toEqual(['https://example.com/x', 'https://example.com/y']);
  });

  it('custom transforms applied to primitive array elements', () => {
    const eng = createEngine({
      transforms: { slug: (v) => v.toLowerCase().replace(/\s+/g, '-') },
    });
    const data: any = { tags: ['Hello World', 'Foo Bar'] };
    eng.apply(
      [{ params: { t: 'tags[]' }, template: 'https://example.com/{t|slug|raw}', inject: 'urls' }],
      data
    );
    expect(data.urls).toEqual([
      'https://example.com/hello-world',
      'https://example.com/foo-bar',
    ]);
  });

  it('globals accessible in primitive array template', () => {
    const eng = createEngine({ globals: { BASE: 'https://api.example.com' } });
    const data: any = { tags: ['a'] };
    eng.apply(
      [{ params: { t: 'tags[]' }, template: '{BASE|raw}/tags/{t}', inject: 'urls' }],
      data
    );
    expect(data.urls).toEqual(['https://api.example.com/tags/a']);
  });

  it('object elements in array are skipped', () => {
    const data: any = { tags: ['a', { nested: true }, 'b'] };
    apply(
      [{ params: { t: 'tags[]' }, template: 'https://example.com/{t}', inject: 'urls' }],
      data
    );
    expect(data.urls).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  it('encoding applied to primitive array values by default', () => {
    const data: any = { tags: ['hello world', 'a&b'] };
    apply(
      [{ params: { t: 'tags[]' }, template: 'https://example.com/{t}', inject: 'urls' }],
      data
    );
    expect(data.urls).toEqual([
      'https://example.com/hello%20world',
      'https://example.com/a%26b',
    ]);
  });
});

import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/engine';

const engine = createEngine();
const apply = (rules: Parameters<typeof engine.apply>[0], data: object) =>
  engine.apply(rules, data);

describe('engine.apply (convenience)', () => {
  it('basic single-depth injection', () => {
    const data = { items: [{ id: '1', name: 'foo' }, { id: '2', name: 'bar' }] };
    apply(
      [{ params: { itemId: 'items[*].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' }],
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
          tenantId: 'tenants[*].id',
          region: 'tenants[*].regions[*].code',
          serviceId: 'tenants[*].regions[*].services[*].id',
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
      [{ params: { itemId: 'items[*].id' }, template: 'https://{DOMAIN|raw}/items/{itemId}', inject: 'url' }],
      data
    );
    expect((data as any).items[0].url).toBe('https://api.acme.com/items/42');
  });

  it('missing param value → no injection', () => {
    const data: any = { items: [{ id: '1' }, { name: 'no-id' }] };
    apply(
      [{ params: { itemId: 'items[*].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/items/1');
    expect(data.items[1].url).toBeUndefined();
  });

  it('default encoding applied', () => {
    const data: any = { items: [{ id: 'hello world' }] };
    apply(
      [{ params: { itemId: 'items[*].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/items/hello%20world');
  });

  it('raw modifier skips encoding', () => {
    const data: any = { items: [{ path: 'foo/bar/baz' }] };
    apply(
      [{ params: { p: 'items[*].path' }, template: 'https://example.com/{p|raw}', inject: 'url' }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/foo/bar/baz');
  });

  it('custom transform', () => {
    const eng = createEngine({ transforms: { upper: (v) => v.toUpperCase() } });
    const data: any = { items: [{ code: 'abc' }] };
    eng.apply(
      [{ params: { code: 'items[*].code' }, template: 'https://example.com/{code|upper}', inject: 'url' }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/ABC');
  });

  it('inject overwrites existing property', () => {
    const data: any = { items: [{ id: '1', url: 'OLD' }] };
    apply(
      [{ params: { itemId: 'items[*].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' }],
      data
    );
    expect(data.items[0].url).toBe('https://example.com/items/1');
  });

  it('sequential rule application', () => {
    const data: any = { items: [{ id: '1' }] };
    apply(
      [
        { params: { itemId: 'items[*].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' },
        { params: { itemId: 'items[*].id' }, template: 'https://other.com/ref/{itemId}', inject: 'altUrl' },
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
          tenantId: 'tenants[*].id',
          region: 'tenants[*].regions[*].code',
          serviceId: 'tenants[*].regions[*].services[*].id',
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
        params: { itemId: 'items[*].id', itemType: 'items[*].type' },
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
      { params: { itemId: 'items[*].id' }, template: 'https://example.com/items/{itemId}', inject: 'url' },
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
        params: { a: 'users[*].id', b: 'orders[*].name' },
        template: '{a}/{b}',
        inject: 'url',
      }])
    ).toThrow();
  });

  it('compiled multi-level rules work correctly', () => {
    const eng = createEngine({ globals: { DOMAIN: 'api.test.com' } });
    const compiled = eng.compile([{
      params: {
        tenantId: 'tenants[*].id',
        region: 'tenants[*].regions[*].code',
        serviceId: 'tenants[*].regions[*].services[*].id',
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
      params: { name: 'items[*].name' },
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
      { params: { id: 'items[*].id' }, template: 'https://a.com/{id}', inject: 'urlA' },
      { params: { id: 'items[*].id' }, template: 'https://b.com/{id}', inject: 'urlB' },
    ]);

    const data: any = { items: [{ id: '1' }] };
    compiled.apply(data);
    expect(data.items[0].urlA).toBe('https://a.com/1');
    expect(data.items[0].urlB).toBe('https://b.com/1');
  });
});

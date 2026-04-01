import { describe, it, expect } from 'vitest';
import { validate } from '../src/validate';

describe('validate', () => {
  it('V1 — throws on cousin paths at depth 1', () => {
    expect(() =>
      validate([{
        params: { a: 'users[*].id', b: 'orders[*].name' },
        template: '{a}/{b}',
        inject: 'url',
      }])
    ).toThrow(/cousin|diverge/i);
  });

  it('V1 — throws on sibling arrays under same parent', () => {
    expect(() =>
      validate([{
        params: { a: 'org[*].users[*].id', b: 'org[*].teams[*].name' },
        template: '{a}/{b}',
        inject: 'url',
      }])
    ).toThrow();
  });

  it('V1 — allows valid deep nesting', () => {
    expect(() =>
      validate([{
        params: {
          tenantId: 'tenants[*].id',
          region: 'tenants[*].regions[*].code',
          serviceId: 'tenants[*].regions[*].services[*].id',
        },
        template: '{tenantId}/{region}/{serviceId}',
        inject: 'url',
      }])
    ).not.toThrow();
  });

  it('V2 — throws on undefined template variable', () => {
    expect(() =>
      validate(
        [{
          params: { id: 'items[*].id' },
          template: '{id}/{missing}',
          inject: 'url',
        }],
        { globals: {} }
      )
    ).toThrow(/missing/i);
  });

  it('V2 — allows variable satisfied by global', () => {
    expect(() =>
      validate(
        [{
          params: { id: 'items[*].id' },
          template: '{id}/{APP_DOMAIN|raw}',
          inject: 'url',
        }],
        { globals: { APP_DOMAIN: 'x.com' } }
      )
    ).not.toThrow();
  });

  it('V3 — throws on undefined transform modifier', () => {
    expect(() =>
      validate(
        [{
          params: { name: 'items[*].name' },
          template: '{name|nope}',
          inject: 'url',
        }],
        { transforms: {} }
      )
    ).toThrow(/nope/i);
  });

  it('V3 — raw is always valid (built-in)', () => {
    expect(() =>
      validate([{
        params: { name: 'items[*].name' },
        template: '{name|raw}',
        inject: 'url',
      }])
    ).not.toThrow();
  });

  it('V4 — throws on empty params', () => {
    expect(() =>
      validate(
        [{ params: {}, template: '{APP_DOMAIN}', inject: 'url' }],
        { globals: { APP_DOMAIN: 'x' } }
      )
    ).toThrow();
  });
});

# json-url-gen

A declarative engine that traverses deeply-nested JSON objects and injects computed URLs into target nodes. Define rules with path expressions, URL templates, and an injection target — the engine handles the rest.

[Live Demo](https://krtools.github.io/json-url-gen/)

## Install

```bash
npm install json-url-gen
```

## Quick Start

```ts
import { createEngine } from 'json-url-gen';

const engine = createEngine();

const data = {
  tenants: [
    {
      id: 'acme',
      regions: [
        { code: 'us-east', services: [{ id: 'auth' }, { id: 'billing' }] },
        { code: 'eu-west', services: [{ id: 'auth' }] },
      ],
    },
  ],
};

engine.apply(
  [{
    params: {
      tenantId:  'tenants[].id',
      region:    'tenants[].regions[].code',
      serviceId: 'tenants[].regions[].services[].id',
    },
    template: 'https://console.example.com/{tenantId}/{region}/{serviceId}',
    inject: 'url',
  }],
  data
);

// data.tenants[0].regions[0].services[0].url
//   → "https://console.example.com/acme/us-east/auth"
// data.tenants[0].regions[0].services[1].url
//   → "https://console.example.com/acme/us-east/billing"
// data.tenants[0].regions[1].services[0].url
//   → "https://console.example.com/acme/eu-west/auth"
```

## API

### `createEngine(options?): UrlInjectionEngine`

Creates an engine instance.

```ts
interface EngineOptions {
  globals?: Record<string, string>;
  transforms?: Record<string, (value: string) => string>;
}
```

- **`globals`** — key-value pairs available as template variables in every rule. Param names take precedence over globals on collision (a warning is logged).
- **`transforms`** — named functions that can be referenced as template modifiers.

### `engine.compile(rules, compileOptions?): CompiledRules`

Pre-compiles an array of rules into an optimized instruction set. All path parsing, validation, and transform resolution happens once at compile time. The returned object's `apply` method is a lean runner — no regex, no map lookups, no re-validation.

```ts
interface UrlRule {
  params: Record<string, string>;  // varName → path expression
  template: string;                // URL template
  inject: string;                  // property name written on the target node
}

interface CompileOptions {
  runtimeGlobals?: string[];       // global names that will be provided at apply time
}

const compiled = engine.compile(rules);
compiled.apply(data1);
compiled.apply(data2); // reuse across many data objects
```

If your templates reference globals that aren't known at compile time, declare them via `runtimeGlobals` so V2 validation doesn't reject them:

```ts
const compiled = engine.compile(rules, {
  runtimeGlobals: ['REQUEST_ID', 'ENV'],
});
```

### `compiled.apply(data, runOptions?): object`

Runs compiled rules against a data object. Optionally accepts per-run globals.

```ts
interface RunOptions {
  globals?: Record<string, string>;
}
```

Precedence (highest wins): **params** > **run-time globals** > **compile-time globals**.

If a declared runtime global is not provided at apply time, any template referencing it will skip injection for that node (no partial URLs, no crash).

### `engine.apply(rules, data, runOptions?): object`

Convenience method — compiles and runs in one call. Use `compile()` instead when applying the same rules to multiple data objects. Run-time globals passed here are automatically declared during compilation.

Returns the same (mutated) object. Rules run sequentially — each rule sees mutations from previous rules.

### `validate(rules, options?): void`

Standalone static analysis of rules. Throws a descriptive error on:

| Code | Condition |
|------|-----------|
| V1 | Cousin-node conflict — param paths diverge at the same wildcard depth |
| V2 | Undefined template variable — not in `params`, `globals`, or `transforms` |
| V3 | Undefined transform modifier — not `raw`, `encode`, or in `transforms` |
| V4 | Empty `params` — no target node to inject into |
| V5 | Bare `[]` param path — must include array field name (e.g. `tags[]`) |

Also called automatically by `compile()` and `apply()`.

### `parsePath(path): ParsedPath`

Parses a dot-notation path string into segments and a wildcard depth.

```ts
parsePath('tenants[].regions[].id')
// → { segments: ['tenants', '[]', 'regions', '[]', 'id'], depth: 2 }
```

### `renderTemplate(template, values, transforms): string | null`

Renders a template string against a values map. Returns `null` if any referenced value is missing, `null`, or empty — signaling that injection should be skipped.

## Path Syntax

Paths use dot-notation with `[]` to denote array iteration:

```
tenants[].regions[].services[].id
```

All param paths in a rule must form a strict parent-child lineage — no "cousin" paths (paths that diverge at the same array depth).

### Primitive Arrays

When a param path ends with `[]` (no trailing field name), the array elements themselves are the values. The engine iterates the array, renders a URL per element, and injects the result as a **sibling array** on the parent object:

```
tags[]                    → each element of "tags" is the value
orgs[].tags[]             → per-org: each element of "tags" is the value
```

This works with mixed params — ancestor fields are collected normally:

```ts
{ params: { orgId: 'orgs[].id', tag: 'orgs[].tags[]' }, ... }
```

Primitive elements (strings, numbers, booleans) are used as values. Null/undefined/object elements are skipped.

### Escaping Special Characters

Property names containing dots, brackets, or backslashes can be referenced using **backslash escaping** or **quoted segments**.

**Backslash escaping** — escape `.`, `[`, or `\` in plain segments:

```
foo\.bar              → key "foo.bar"
data\[0]              → key "data[0]"
back\\slash           → key "back\slash"
items[].foo\.bar      → iterate items, read key "foo.bar"
```

**Quoted segments** — wrap the key in `["..."]` for keys with any special characters:

```
["ANNOYING[*]_PATH"]                → key "ANNOYING[*]_PATH"
["foo.bar"]                         → key "foo.bar"
data[].["weird.key"].name           → iterate data, read key "weird.key", then "name"
["has\"quotes"]                     → key with literal double quote
```

Inside quoted segments, only `\"` and `\\` are valid escape sequences. In plain segments, only `\.`, `\[`, and `\\` are valid. Unknown escape sequences (e.g. `\n`) throw an error.

## Template Syntax

Variables are written as `{varName}`, `{varName|modifier}`, or chained with multiple pipes `{varName|a|b|c}`:

| Modifier | Behavior |
|----------|----------|
| *(none)* | `encodeURIComponent` applied |
| `raw` | No encoding |
| `encode` | Explicit `encodeURIComponent` (default, useful to override a previous `raw`) |
| *custom* | Calls the named function from `transforms` |

Modifiers are chained left to right. `raw` and `encode` are encoding directives — if multiple appear, **last one wins**. All other modifiers are transform functions applied in order. Whitespace around pipes is ignored.

```
{name|trim|upper|raw}     → trim, then uppercase, no encoding
{q|slugify}               → slugify, then encodeURIComponent (default)
{q|raw|slugify|encode}    → slugify, then encodeURIComponent (last directive wins)
{ name | upper }          → whitespace is fine
```

## Examples

### Compile Once, Apply Many

```ts
const engine = createEngine({
  globals: { DOMAIN: 'api.acme.com' },
  transforms: { slug: (v) => v.toLowerCase().replace(/\s+/g, '-') },
});

// Compile once — all parsing, validation, and transform binding happens here
const compiled = engine.compile([{
  params: {
    tenantId:  'tenants[].id',
    serviceId: 'tenants[].services[].id',
    name:      'tenants[].services[].name',
  },
  template: 'https://{DOMAIN|raw}/{tenantId}/{serviceId}/{name|slug}',
  inject: 'url',
}]);

// Apply to many data objects — pure traversal, no overhead
for (const batch of dataBatches) {
  compiled.apply(batch);
}
```

### Globals

```ts
const engine = createEngine({
  globals: { DOMAIN: 'api.acme.com' },
});

engine.apply(
  [{
    params: { id: 'items[].id' },
    template: 'https://{DOMAIN|raw}/items/{id}',
    inject: 'url',
  }],
  { items: [{ id: '42' }] }
);
// items[0].url → "https://api.acme.com/items/42"
```

### Custom Transforms

```ts
const engine = createEngine({
  transforms: {
    slugify: (v) => v.toLowerCase().replace(/\s+/g, '-'),
    trim: (v) => v.trim(),
  },
});

engine.apply(
  [{
    params: { name: 'items[].name' },
    template: 'https://example.com/{name|slugify}',
    inject: 'slug',
  }],
  { items: [{ name: 'Hello World' }] }
);
// items[0].slug → "https://example.com/hello-world"
```

### Chained Transforms

Pipe multiple transforms together — they apply left to right:

```ts
const engine = createEngine({
  transforms: {
    trim: (v) => v.trim(),
    upper: (v) => v.toUpperCase(),
  },
});

engine.apply(
  [{
    params: { tag: 'items[].tag' },
    template: 'https://example.com/tags/{tag|trim|upper|raw}',
    inject: 'url',
  }],
  { items: [{ tag: '  my tag  ' }] }
);
// items[0].url → "https://example.com/tags/MY TAG"
//   trim → "my tag" → upper → "MY TAG" → raw (no encoding)
```

### Runtime Globals

Compile rules once, provide different globals per `apply` call:

```ts
const engine = createEngine({ globals: { BASE: 'https://api.example.com' } });

const compiled = engine.compile(
  [{
    params: { id: 'items[].id' },
    template: '{BASE|raw}/{ENV|raw}/items/{id}',
    inject: 'url',
  }],
  { runtimeGlobals: ['ENV'] }
);

// Staging
const staging: any = { items: [{ id: '1' }] };
compiled.apply(staging, { globals: { ENV: 'staging' } });
// items[0].url → "https://api.example.com/staging/items/1"

// Production
const prod: any = { items: [{ id: '1' }] };
compiled.apply(prod, { globals: { ENV: 'production' } });
// items[0].url → "https://api.example.com/production/items/1"
```

### Primitive Arrays

Generate an array of URLs from an array of primitive values:

```ts
const data = {
  org: 'acme',
  tags: ['api', 'auth', 'billing'],
};

engine.apply(
  [{
    params: { org: 'org', tag: 'tags[]' },
    template: 'https://example.com/{org}/tags/{tag}',
    inject: 'tagUrls',
  }],
  data
);
// data.tagUrls → [
//   "https://example.com/acme/tags/api",
//   "https://example.com/acme/tags/auth",
//   "https://example.com/acme/tags/billing",
// ]
```

Works at any nesting depth — per-parent arrays are injected as siblings:

```ts
const data = {
  orgs: [
    { id: 'acme', tags: ['api', 'auth'] },
    { id: 'globex', tags: ['billing'] },
  ],
};

engine.apply(
  [{
    params: { orgId: 'orgs[].id', tag: 'orgs[].tags[]' },
    template: 'https://example.com/{orgId}/{tag}',
    inject: 'tagUrls',
  }],
  data
);
// orgs[0].tagUrls → ["https://example.com/acme/api", "https://example.com/acme/auth"]
// orgs[1].tagUrls → ["https://example.com/globex/billing"]
```

### Multiple Rules

Rules are applied sequentially. Each rule can inject a different property:

```ts
engine.apply(
  [
    {
      params: { id: 'items[].id' },
      template: 'https://example.com/items/{id}',
      inject: 'url',
    },
    {
      params: { id: 'items[].id' },
      template: 'https://other.com/ref/{id}',
      inject: 'altUrl',
    },
  ],
  data
);
```

## Behavior Reference

| Scenario | Result |
|---|---|
| Param value missing at runtime | Skip node silently, no injection |
| Param variable not in template | Collected but unused — allowed |
| Template variable not in params or globals | Caught by `validate`, throws |
| `inject` property already exists | Overwritten |
| Cousin param paths | Caught by `validate`, throws |
| Global name collides with param name | Param wins, `console.warn` logged |
| Run-time global overrides compile-time global | Run-time wins |
| Declared runtime global missing at apply time | Skip injection for that node |
| Primitive array path (`tags[]`) | Injects sibling array of URLs on parent |
| Primitive array — empty source | Injects `[]` |
| Primitive array — missing source field | No injection |
| Primitive array — null/object elements | Skipped |
| Bare `[]` param path | Caught by `validate`, throws |
| Rules applied | Sequentially, each sees previous mutations |

## License

[MIT](LICENSE)

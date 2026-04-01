# URL Injection Engine — Specification

## Overview

A declarative engine that traverses complex, deeply-nested JSON objects and injects
computed URLs into target nodes. Rules describe where to find template parameters
(at any level of the hierarchy), a URL template, and a property name to inject the
result into. The engine derives traversal and injection logic automatically.

---

## Core Concepts

### Parameter Path Syntax

Paths use dot-notation with `[*]` to denote array iteration:

```
tenants[*].regions[*].services[*].id
```

All paths in a rule must form a strict parent-child lineage — no "cousin" paths allowed
(see Validation). A param path's depth is determined by its number of `[*]` segments.

### Target Node

The **target node** is the node at the deepest param path (most `[*]` segments) in a
rule. The engine injects the URL as a property on this node.

If multiple params share the deepest depth, they must resolve to the same node path
(i.e. same array, different fields) — this is valid and common.

### Template Syntax

Variables in templates are written `{varName}` or `{varName|modifier}`.

- `varName` may be a param name, a global name, or the name of a transform
- Globals are always available as variables
- If `|modifier` is omitted, the value is **url-encoded** by default
- `|raw` skips encoding entirely (for URL fragments, hostnames, etc.)
- Any other modifier name must reference a function in `transforms`

```
https://{APP_DOMAIN|raw}/{ENV|raw}/{region}/{tenantId}/services/{serviceId}/{name|slugify}
```

### Injection

The resolved URL string is written to the property named by `inject` on the target node.
If the property already exists, it is overwritten. No merging, no errors.

---

## Types

```ts
// A single named transform function
type TransformFn = (value: string) => string;

// Options provided when creating the engine
interface EngineOptions {
  globals?: Record<string, string>;
  transforms?: Record<string, TransformFn>;
}

// A single rule describing how to build and inject a URL
interface UrlRule {
  params: Record<string, string>;  // varName -> "path[*].to[*].field"
  template: string;                // "{var|modifier}" template string
  inject: string;                  // property name written on the target node
}

// The engine instance returned by createEngine
interface UrlInjectionEngine {
  apply(rules: UrlRule[], data: object): object;
}

// Standalone validator
function validate(rules: UrlRule[], options?: EngineOptions): void;

// Factory
function createEngine(options?: EngineOptions): UrlInjectionEngine;
```

---

## Validation (`validate`)

`validate(rules, options)` performs static analysis of rules before any data is
processed. It throws a descriptive `Error` for any of the following conditions.
All errors should indicate the rule index and the offending param/variable name.

### V1 — Cousin-node conflict

For any two params in the same rule, parse out their "scope prefix" — the portion of
the path up to and including each `[*]` segment. Every param's scope prefix chain must
be a strict extension of all shallower params.

**Valid (each deeper path extends the same ancestor prefix):**
```
tenants[*].id
tenants[*].regions[*].code
tenants[*].regions[*].services[*].id
```

**Invalid (two paths diverge at the same wildcard depth — cousins):**
```
tenants[*].id
orders[*].code     ← diverges at depth 1, not a child of tenants[*]
```

**Invalid (sibling arrays at same depth from a shared root):**
```
org[*].users[*].id
org[*].teams[*].name   ← users[*] and teams[*] are cousins
```

### V2 — Undefined template variable

Every `{varName}` in a template must resolve to one of:
- A key in `params`
- A key in `options.globals`
- A key in `options.transforms` (as a zero-arg transform — unlikely, but covered)

If a variable name is not found in any of those, throw.

### V3 — Undefined transform modifier

Every `{var|modifier}` where `modifier` is not `raw` must correspond to a key in
`options.transforms`. If not found, throw.

### V4 — Empty params

A rule with an empty `params` object should throw — there is no target node to inject into.

---

## Engine Behavior (`apply`)

### Step 1 — Parse rules

For each rule, determine:
- The **target depth** (number of `[*]` in the deepest param path)
- The **target path** (the full path of the deepest param, minus its field name — this is the
  array the engine iterates at inject-time)
- A map of which params are collected at which depth during traversal

### Step 2 — Recursive traversal

The engine recursively walks the JSON tree. As it descends, it maintains a **scope stack**:
a key-value map of param names whose paths have been resolved at the current traversal
position. When it reaches the target depth's array, it iterates each node.

### Step 3 — URL rendering

At each target node, the engine:
1. Collects all param values from the scope stack plus the current node's fields
2. Merges in globals (globals do not override params — param names take precedence
   if there is a collision, and a warning should be logged to console if this happens)
3. Resolves the template — for each `{varName|modifier}`:
   - Looks up the value
   - If the value is `undefined`, `null`, or an empty string: **abort, do not inject**
   - Applies the modifier (`raw` = identity, otherwise call `transforms[modifier]`,
     default = `encodeURIComponent`)
4. Writes the result to `inject` on the current node (mutates in place)

### Step 4 — Return

Returns the same (mutated) object.

### Multiple Rules

Rules are applied sequentially. Each rule traverses the full (possibly already-mutated)
data object. Rule N sees URLs injected by Rule N-1.

---

## File Structure

```
src/
  engine.ts          core traversal and injection logic
  validate.ts        static rule validator
  parse.ts           path string parser ("a[*].b[*].c" → structured form)
  template.ts        template renderer (variable lookup, encoding, transforms)
  types.ts           all exported types and interfaces
  index.ts           public exports

tests/
  validate.test.ts
  engine.test.ts
  template.test.ts
  parse.test.ts
```

---

## Unit Tests

All tests should use a standard Node.js-compatible test runner (e.g. Vitest or Jest).

---

### parse.test.ts

```
parsePath("tenants[*].regions[*].id")
  → { segments: ["tenants", "[*]", "regions", "[*]", "id"], depth: 2 }

parsePath("items[*].name")
  → { segments: ["items", "[*]", "name"], depth: 1 }

parsePath("name")
  → { segments: ["name"], depth: 0 }

parsePath("")
  → throws

parsePath("bad[syntax")
  → throws
```

---

### template.test.ts

```
renderTemplate("{APP_DOMAIN|raw}/path", { APP_DOMAIN: "api.example.com" }, {})
  → "api.example.com/path"

renderTemplate("{name}", { name: "hello world" }, {})
  → "hello%20world"  (default encodeURIComponent)

renderTemplate("{name|raw}", { name: "hello world" }, {})
  → "hello world"

renderTemplate("{name|slugify}", { name: "Hello World" }, { slugify: (v) => v.toLowerCase().replace(/\s+/g, "-") })
  → "hello-world"

renderTemplate("{missing}", {}, {})
  → returns null (signals missing param, no injection)

renderTemplate("{a}/{b}", { a: "x", b: null }, {})
  → returns null

renderTemplate("{a}/{b}", { a: "x", b: "" }, {})
  → returns null

renderTemplate("{a|unknownMod}", { a: "x" }, {})
  → throws (unknown modifier — should have been caught by validate, but engine
            is defensive)
```

---

### validate.test.ts

```
// V1 — cousin paths
validate([{
  params: { a: "users[*].id", b: "orders[*].name" },
  template: "{a}/{b}", inject: "url"
}])
  → throws "cousin" or "diverge" error mentioning rule index 0

// V1 — sibling arrays under same parent
validate([{
  params: { a: "org[*].users[*].id", b: "org[*].teams[*].name" },
  template: "{a}/{b}", inject: "url"
}])
  → throws

// V1 — valid deep nesting (should not throw)
validate([{
  params: {
    tenantId:  "tenants[*].id",
    region:    "tenants[*].regions[*].code",
    serviceId: "tenants[*].regions[*].services[*].id",
  },
  template: "{tenantId}/{region}/{serviceId}", inject: "url"
}])
  → does not throw

// V2 — undefined template variable
validate([{
  params: { id: "items[*].id" },
  template: "{id}/{missing}", inject: "url"
}], { globals: {} })
  → throws mentioning "missing"

// V2 — variable satisfied by global
validate([{
  params: { id: "items[*].id" },
  template: "{id}/{APP_DOMAIN|raw}", inject: "url"
}], { globals: { APP_DOMAIN: "x.com" } })
  → does not throw

// V3 — undefined transform
validate([{
  params: { name: "items[*].name" },
  template: "{name|nope}", inject: "url"
}], { transforms: {} })
  → throws mentioning "nope"

// V3 — raw is always valid (built-in, not required in transforms)
validate([{
  params: { name: "items[*].name" },
  template: "{name|raw}", inject: "url"
}])
  → does not throw

// V4 — empty params
validate([{ params: {}, template: "{APP_DOMAIN}", inject: "url" }], { globals: { APP_DOMAIN: "x" }})
  → throws
```

---

### engine.test.ts

```
// Basic single-depth injection
data = { items: [{ id: "1", name: "foo" }, { id: "2", name: "bar" }] }
rules = [{
  params: { itemId: "items[*].id" },
  template: "https://example.com/items/{itemId}",
  inject: "url"
}]
apply(rules, data)
  → data.items[0].url === "https://example.com/items/1"
  → data.items[1].url === "https://example.com/items/2"

// Multi-level param collection
data = {
  tenants: [{
    id: "t1",
    regions: [{
      code: "us-east",
      services: [{ id: "s1" }, { id: "s2" }]
    }]
  }]
}
rules = [{
  params: {
    tenantId:  "tenants[*].id",
    region:    "tenants[*].regions[*].code",
    serviceId: "tenants[*].regions[*].services[*].id",
  },
  template: "https://example.com/{tenantId}/{region}/{serviceId}",
  inject: "href"
}]
apply(rules, data)
  → data.tenants[0].regions[0].services[0].href === "https://example.com/t1/us-east/s1"
  → data.tenants[0].regions[0].services[1].href === "https://example.com/t1/us-east/s2"

// Globals available in template
data = { items: [{ id: "42" }] }
engine = createEngine({ globals: { DOMAIN: "api.acme.com" } })
rules = [{
  params: { itemId: "items[*].id" },
  template: "https://{DOMAIN|raw}/items/{itemId}",
  inject: "url"
}]
engine.apply(rules, data)
  → data.items[0].url === "https://api.acme.com/items/42"

// Missing param value → no injection
data = { items: [{ id: "1" }, { name: "no-id" }] }
rules = [{
  params: { itemId: "items[*].id" },
  template: "https://example.com/items/{itemId}",
  inject: "url"
}]
apply(rules, data)
  → data.items[0].url === "https://example.com/items/1"
  → data.items[1].url === undefined  (missing id, skipped)

// Default encoding applied
data = { items: [{ id: "hello world" }] }
rules = [{
  params: { itemId: "items[*].id" },
  template: "https://example.com/items/{itemId}",
  inject: "url"
}]
apply(rules, data)
  → data.items[0].url === "https://example.com/items/hello%20world"

// raw modifier skips encoding
data = { items: [{ path: "foo/bar/baz" }] }
rules = [{
  params: { p: "items[*].path" },
  template: "https://example.com/{p|raw}",
  inject: "url"
}]
apply(rules, data)
  → data.items[0].url === "https://example.com/foo/bar/baz"

// Custom transform
engine = createEngine({ transforms: { upper: (v) => v.toUpperCase() } })
data = { items: [{ code: "abc" }] }
rules = [{
  params: { code: "items[*].code" },
  template: "https://example.com/{code|upper}",
  inject: "url"
}]
engine.apply(rules, data)
  → data.items[0].url === "https://example.com/ABC"

// Inject overwrites existing property
data = { items: [{ id: "1", url: "OLD" }] }
rules = [{
  params: { itemId: "items[*].id" },
  template: "https://example.com/items/{itemId}",
  inject: "url"
}]
apply(rules, data)
  → data.items[0].url === "https://example.com/items/1"

// Sequential rule application — rule 2 sees rule 1's output
data = { items: [{ id: "1" }] }
rules = [
  {
    params: { itemId: "items[*].id" },
    template: "https://example.com/items/{itemId}",
    inject: "url"
  },
  {
    params: { itemId: "items[*].id" },
    template: "https://other.com/ref/{itemId}",
    inject: "altUrl"
  }
]
apply(rules, data)
  → data.items[0].url    === "https://example.com/items/1"
  → data.items[0].altUrl === "https://other.com/ref/1"

// Multiple tenants × regions × services (combinatoric correctness)
data = {
  tenants: [
    {
      id: "tA",
      regions: [
        { code: "us", services: [{ id: "s1" }, { id: "s2" }] },
        { code: "eu", services: [{ id: "s3" }] },
      ]
    },
    {
      id: "tB",
      regions: [
        { code: "ap", services: [{ id: "s4" }] }
      ]
    }
  ]
}
apply(rules, data)  // same rule as multi-level test above
  → services get href values:
     tA / us / s1 → ".../tA/us/s1"
     tA / us / s2 → ".../tA/us/s2"
     tA / eu / s3 → ".../tA/eu/s3"
     tB / ap / s4 → ".../tB/ap/s4"

// Param at same depth as target (sibling field) — valid
data = { items: [{ id: "1", type: "widget" }] }
rules = [{
  params: { itemId: "items[*].id", itemType: "items[*].type" },
  template: "https://example.com/{itemType}/{itemId}",
  inject: "url"
}]
apply(rules, data)
  → data.items[0].url === "https://example.com/widget/1"
```

---

## Behaviour Summary Table

| Scenario | Result |
|---|---|
| Param value missing at runtime | Skip node silently, no injection |
| Param variable not in template | Collected but unused — allowed |
| Template variable not in params or globals | Caught by `validate`, throws |
| `inject` property already exists | Overwrite |
| Cousin param paths | Caught by `validate`, throws |
| `raw` modifier | No encoding applied |
| Default (no modifier) | `encodeURIComponent` applied |
| Custom transform modifier | Called with string value |
| Global name collides with param name | Param wins, console.warn |
| Rules applied | Sequentially, each sees previous mutations |

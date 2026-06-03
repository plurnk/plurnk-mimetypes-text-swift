# @plurnk/plurnk-mimetypes-text-swift

`text/x-swift` mimetype handler for the [plurnk](https://github.com/plurnk) ecosystem. Tier 2 in the framework's four-tier backend model — uses the [alex-pinkus/tree-sitter-swift](https://github.com/alex-pinkus/tree-sitter-swift) grammar built to WASM and shipped pre-built in this package.

## install

```
npm i @plurnk/plurnk-mimetypes-text-swift
```

No build tools required at install time. The `swift.wasm` artifact is included.

## what it does

Three channels per the framework's #10 contract:

- **symbols** (`extractRaw` / `preview`) — class/struct/enum/protocol/actor/extension as `class`/`enum`/`interface`; functions, init/deinit, methods, properties, type aliases, macros. Discriminates the grammar's umbrella `class_declaration` based on the declarator keyword.
- **deep-json** (`deepJson`) — inherited from `TreeSitterExtractor`: full named-children walk of the Swift parse tree, native tree-sitter-swift node types. jsonpath queries reach every parse-tree node.
- **deep-xml** — framework-projected from `deep-json`.

## coverage

Validated against Swift 6 features with zero parse errors:
- Classic syntax: struct, class, protocol, extension, generics
- Property wrappers (`@propertyWrapper`, `@State`, `@Binding`, `@Environment`)
- async/await, actors, `@MainActor`
- Result builders (`@resultBuilder`, `@ViewBuilder`)
- Macros (`@Observable`, `@freestanding`, `@attached`, custom macros)
- Parameter packs (`each T`, `repeat (each T, each U)`)
- Typed throws (`throws(ParseError)`)
- Noncopyable types (`~Copyable`)
- Ownership modifiers (`borrowing`, `consuming`)

## the grammar pin

`.swift-grammar-pin` records the upstream commit SHA the `swift.wasm` artifact is built from. The publish-time `scripts/build-wasm.mjs` builds it; the verify-time `scripts/verify-wasm.mjs` rebuilds and compares for byte-identical reproducibility.

To update the grammar:
1. Update `.swift-grammar-pin` with the new commit SHA.
2. `npm run build:wasm` — produces a fresh `swift.wasm`.
3. Verify tests still pass.
4. Bump the package version and republish.

## license

MIT.

import { TreeSitterExtractor } from "@plurnk/plurnk-mimetypes";
import type {
    HandlerContent,
    MimeRef,
    MimeSymbol,
    QueryConstructor,
    TreeSitterNode,
    TreeSitterParser,
    TreeSitterTree,
} from "@plurnk/plurnk-mimetypes";
import { extract, refsQuery } from "./swift.ts";

// text/x-swift handler. Tier 2 — tree-sitter-swift grammar built to WASM at
// package publish time and shipped alongside this code. The .wasm file lives
// at the package root (see exports map in package.json); we resolve it via
// import.meta.url so the path is stable across consumers.
//
// Why Tier 2: alex-pinkus/tree-sitter-swift's npm package doesn't ship WASM,
// only native bindings. We build it ourselves (see scripts/build-wasm.mjs +
// scripts/verify-wasm.mjs) so consumers get pure WASM at install time with
// no toolchain on their side.
//
// Coverage: validates clean against Swift 6 features — macros, parameter
// packs, typed throws, noncopyable types, ownership modifiers. Symbol
// extraction maps the grammar's umbrella class_declaration into class/enum
// kinds based on the declarator keyword (struct/class/enum/actor/extension).
export default class TextSwift extends TreeSitterExtractor {
    protected async loadParser(): Promise<TreeSitterParser> {
        const ts = await import("web-tree-sitter" as string) as {
            Parser: {
                init(): Promise<void>;
                new (): { setLanguage(lang: unknown): void; parse(content: string): unknown };
            };
            Language: {
                load(wasmPath: string): Promise<unknown>;
            };
            Query: QueryConstructor;
        };
        await ts.Parser.init();
        const wasmUrl = new URL("../swift.wasm", import.meta.url);
        const lang = await ts.Language.load(wasmUrl.pathname);
        this.setQueryContext(lang, ts.Query);
        const parser = new ts.Parser();
        parser.setLanguage(lang);
        return parser as unknown as TreeSitterParser;
    }

    protected extractFromTree(tree: TreeSitterTree, _content: HandlerContent): MimeSymbol[] {
        return extract(tree.rootNode);
    }

    // References channel (SPEC §16): inherit / call / type edges. The base
    // collectRefs() owns parse/compile/run/cleanup; no wrap needed (every
    // capture is a direct identifier, container resolves by line containment).
    override references(content: HandlerContent): Promise<MimeRef[]> {
        return this.collectRefs(content, refsQuery, (root) => extract(root));
    }
}

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import TextSwift from "./TextSwift.ts";

const metadata = {
    mimetype: "text/x-swift",
    glyph: "🦅",
    extensions: [".swift"] as const,
};

const h = () => new TextSwift(metadata);

describe("TextSwift — class/struct/enum/protocol/actor/extension discrimination", () => {
    it("struct → class", async () => {
        const syms = await h().extractRaw("struct P { let x: Int }\n");
        assert.equal(syms.find((s) => s.name === "P")?.kind, "class");
    });

    it("class → class", async () => {
        const syms = await h().extractRaw("class C { var x: Int = 0 }\n");
        assert.equal(syms.find((s) => s.name === "C")?.kind, "class");
    });

    it("enum → enum + cases as constants", async () => {
        const syms = await h().extractRaw("enum E { case alpha, beta }\n");
        assert.equal(syms.find((s) => s.name === "E")?.kind, "enum");
        assert.equal(syms.find((s) => s.name === "alpha")?.kind, "constant");
        assert.equal(syms.find((s) => s.name === "beta")?.kind, "constant");
    });

    it("protocol → interface", async () => {
        const syms = await h().extractRaw("protocol P { func f() }\n");
        assert.equal(syms.find((s) => s.name === "P")?.kind, "interface");
    });

    it("actor → class", async () => {
        const syms = await h().extractRaw("actor A { var x: Int = 0 }\n");
        assert.equal(syms.find((s) => s.name === "A")?.kind, "class");
    });

    it("extension → class with extended-type name", async () => {
        const syms = await h().extractRaw("extension Int { func double() -> Int { self * 2 } }\n");
        assert.equal(syms.find((s) => s.name === "Int")?.kind, "class");
    });
});

describe("TextSwift — members", () => {
    it("function declaration → function (top-level) / method (in body)", async () => {
        const syms = await h().extractRaw(
            "func topLevel() {}\nclass C {\n  func member() {}\n}\n",
        );
        assert.equal(syms.find((s) => s.name === "topLevel")?.kind, "function");
        assert.equal(syms.find((s) => s.name === "member")?.kind, "method");
    });

    it("init/deinit → method", async () => {
        const syms = await h().extractRaw(
            "class C {\n  init() {}\n  deinit {}\n}\n",
        );
        assert.equal(syms.find((s) => s.name === "init")?.kind, "method");
        assert.equal(syms.find((s) => s.name === "deinit")?.kind, "method");
    });

    it("property in class body → field; top-level let → constant; top-level var → variable", async () => {
        const syms = await h().extractRaw(
            "let pi = 3.14\nvar mutable = 0\nclass C {\n  let immut: Int = 0\n  var mut: Int = 0\n}\n",
        );
        assert.equal(syms.find((s) => s.name === "pi")?.kind, "constant");
        assert.equal(syms.find((s) => s.name === "mutable")?.kind, "variable");
        assert.equal(syms.find((s) => s.name === "immut")?.kind, "field");
        assert.equal(syms.find((s) => s.name === "mut")?.kind, "field");
    });

    it("function params surface", async () => {
        const syms = await h().extractRaw("func add(a: Int, b: Int) -> Int { a + b }\n");
        const add = syms.find((s) => s.name === "add");
        assert.equal(add?.kind, "function");
        assert.deepEqual(add?.params, ["a", "b"]);
    });
});

describe("TextSwift — Swift 5.9+ modern syntax", () => {
    it("async actor with async/throws function", async () => {
        const src = "actor Bank {\n  func withdraw(_ amount: Double) async throws -> Double {\n    return 0\n  }\n}\n";
        const syms = await h().extractRaw(src);
        assert.equal(syms.find((s) => s.name === "Bank")?.kind, "class");
        assert.equal(syms.find((s) => s.name === "withdraw")?.kind, "method");
    });

    it("property wrappers don't disrupt extraction", async () => {
        const src = "struct V {\n  @State private var count: Int = 0\n  @Binding var external: Bool\n}\n";
        const syms = await h().extractRaw(src);
        assert.equal(syms.find((s) => s.name === "V")?.kind, "class");
        assert.equal(syms.find((s) => s.name === "count")?.kind, "field");
        assert.equal(syms.find((s) => s.name === "external")?.kind, "field");
    });

    it("macro_declaration → function (freestanding + attached)", async () => {
        const src = "@freestanding(expression)\nmacro stringify<T>(_ value: T) -> (T, String) = #externalMacro(module: \"M\", type: \"S\")\n";
        const syms = await h().extractRaw(src);
        // macro name may be "stringify"
        const m = syms.find((s) => s.kind === "function");
        assert.ok(m, "macro_declaration should yield a function symbol");
    });

    it("parameter packs (each T, repeat) parse cleanly", async () => {
        const src = "func zip<each T, each U>(_ first: repeat each T, with second: repeat each U) {}\n";
        const syms = await h().extractRaw(src);
        assert.equal(syms.find((s) => s.name === "zip")?.kind, "function");
    });

    it("typed throws (throws(E)) parse cleanly", async () => {
        const src = "func parse(_ s: String) throws(ParseError) -> Int { 0 }\nenum ParseError: Error { case bad }\n";
        const syms = await h().extractRaw(src);
        assert.equal(syms.find((s) => s.name === "parse")?.kind, "function");
        assert.equal(syms.find((s) => s.name === "ParseError")?.kind, "enum");
    });

    it("noncopyable types (~Copyable) and ownership modifiers parse cleanly", async () => {
        const src = "struct FH: ~Copyable { let fd: Int32; consuming func close() {} }\nfunc take(_ h: consuming FH) {}\n";
        const syms = await h().extractRaw(src);
        assert.equal(syms.find((s) => s.name === "FH")?.kind, "class");
        assert.equal(syms.find((s) => s.name === "close")?.kind, "method");
        assert.equal(syms.find((s) => s.name === "take")?.kind, "function");
    });
});

describe("TextSwift — error handling", () => {
    it("returns [] for empty input", async () => {
        assert.deepEqual(await h().extractRaw(""), []);
    });

    it("does not throw on malformed source", async () => {
        await assert.doesNotReject(h().extractRaw("class ((( broken"));
    });

    it("returns [] for binary content", async () => {
        assert.deepEqual(await h().extractRaw(new Uint8Array([1, 2, 3])), []);
    });
});

describe("TextSwift — deep-json channel (inherits TreeSitterExtractor walker)", () => {
    it("deepJson returns the parse tree with native node types", async () => {
        const tree = await h().deepJson("func f() {}\n") as { type: string; children?: unknown[] };
        assert.equal(tree.type, "source_file");
        assert.ok(Array.isArray(tree.children));
    });

    it("deepJson returns null for binary content", async () => {
        assert.equal(await h().deepJson(new Uint8Array([1, 2, 3])), null);
    });
});

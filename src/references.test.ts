import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertHandlerConformance } from "@plurnk/plurnk-mimetypes/conformance";
import TextSwift from "./TextSwift.ts";

const metadata = { mimetype: "text/x-swift", glyph: "🕊", extensions: [".swift"] };
const h = () => new TextSwift(metadata);

const SRC = `import Foundation

protocol Printable {
  func describe() -> String
}

class Helper {
  func process(_ input: Token) -> Token { return input }
}

class Parser: BaseParser, Printable {
  var shape: Shape

  func run(_ input: Token) {
    let helper = Helper()
    helper.process(input)
  }

  func describe() -> String { return "parser" }
}
`;

describe("TextSwift — references", () => {
    it("inheritance/conformance are inherit edges", async () => {
        const refs = await h().references(SRC);
        assert.ok(refs.some((r) => r.name === "BaseParser" && r.kind === "inherit" && r.container === "Parser"));
        assert.ok(refs.some((r) => r.name === "Printable" && r.kind === "inherit" && r.container === "Parser"));
    });

    it("calls (free + initializer + member) are call edges scoped to the method", async () => {
        const refs = await h().references(SRC);
        assert.ok(refs.some((r) => r.name === "Helper" && r.kind === "call" && r.container === "run"));
        assert.ok(refs.some((r) => r.name === "process" && r.kind === "call" && r.container === "run"));
    });

    it("property/parameter types are type edges", async () => {
        const refs = await h().references(SRC);
        assert.ok(refs.some((r) => r.name === "Shape" && r.kind === "type"));
        assert.ok(refs.some((r) => r.name === "Token" && r.kind === "type"));
    });

    it("passes the SPEC §16 conformance invariants", async () => {
        await assertHandlerConformance(h(), {
            source: SRC,
            decoyNames: ["parser", "Foundation"],
            expectJoins: [
                { refName: "Helper", container: "run" },
                { refName: "process", container: "run" },
            ],
            expectRefs: [
                { name: "BaseParser", kind: "inherit" },
                { name: "Helper", kind: "call" },
                { name: "Shape", kind: "type" },
            ],
        });
    });
});

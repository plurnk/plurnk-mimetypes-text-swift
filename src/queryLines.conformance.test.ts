import { describe, it } from "node:test";
import { assertQueryLineConformance } from "@plurnk/plurnk-mimetypes/conformance";
import Handler from "./TextSwift.ts";

const h = new Handler({"mimetype":"text/x-swift","glyph":"🦅","extensions":[".swift"]});

describe("#41 query-line conformance", () => {
    it("every structural match carries a source-line span", async () => {
        await assertQueryLineConformance(h, [{ source: "import Foundation\nfunc add(a: Int, b: Int) -> Int {\n  return a + b\n}\n", dialect: "jsonpath", pattern: "$..*" }]);
    });
});

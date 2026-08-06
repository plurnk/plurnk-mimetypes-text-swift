import { describe, it } from "node:test";
import { assertQueryEvidenceConformance } from "@plurnk/plurnk-mimetypes/conformance";
import Handler from "./TextSwift.ts";

const h = new Handler({"mimetype":"text/x-swift","glyph":"🦅","extensions":[".swift"]});
const src = "func add(a: Int) -> Int {\n  return a\n}\n";

describe("query-evidence conformance", () => {
    it("both structural dialects retain the exact readable root", async () => {
        const region = { startLine: 1, startColumn: 1, endLine: 4, endColumn: 1 };
        await assertQueryEvidenceConformance(h, [
            { source: src, dialect: "jsonpath", pattern: "$", verdict: "exact", expectRegions: [[region]] },
            { source: src, dialect: "xpath", pattern: "/*", verdict: "exact", expectRegions: [[region]] },
        ]);
    });
});

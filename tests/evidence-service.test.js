import test from "node:test";
import assert from "node:assert/strict";
import * as bootstrap from "../components/node-bootstrap.js";

test("EvidenceService slices around a center line (text ref)", async () => {
    const text = ["a", "b", "c", "d", "e"].join("\n");
    const slice = await bootstrap.EvidenceService.getEvidenceSlice({ text, fileName: "demo.log", line: 3 }, 1);

    assert.equal(slice.ok, true);
    assert.equal(slice.fileName, "demo.log");
    assert.equal(slice.centerLine, 3);
    assert.equal(slice.startLine, 2);
    assert.equal(slice.endLine, 4);
    assert.equal(slice.lines.length, 3);

    const center = slice.lines.find(l => l.isCenter);
    assert.ok(center, "expected a center line");
    assert.equal(center.lineNumber, 3);
    assert.equal(center.text, "c");
    assert.ok(String(slice.copyText || "").includes("3:"), "copy text should include line numbers");
});

test("EvidenceService reports missing line numbers", async () => {
    const slice = await bootstrap.EvidenceService.getEvidenceSlice({ text: "x\ny\nz", fileName: "demo.log", line: 0 }, 2);
    assert.equal(slice.ok, false);
});


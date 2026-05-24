import test from "node:test";
import assert from "node:assert/strict";
import "../components/node-bootstrap.js";

test("SelfTestSuite headless runner returns results", async () => {
    const suite = new globalThis.SelfTestSuite();
    const r = await suite.runAllTestsHeadless();
    assert.equal(typeof r.passCount, "number");
    assert.equal(typeof r.total, "number");
    assert.ok(Array.isArray(r.tests));
    assert.equal(r.passCount, r.total);
});

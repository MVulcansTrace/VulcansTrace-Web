import test from "node:test";
import assert from "node:assert/strict";
import * as bootstrap from "../components/node-bootstrap.js";

test("export evidence is UNKNOWN when no datasets loaded", () => {
    const response = bootstrap.AgentKernel.handle({ core: { getDB: () => ({ inputs: [] }) } }, "export evidence");
    assert.equal(response.verdictLabel, "UNKNOWN");
    assert.ok(String(response.bodyHtml || "").toLowerCase().includes("no datasets"), "Expected no data guidance");
});

test("export evidence triggers core.generateEvidence when available", async () => {
    let called = false;
    const core = {
        getDB: () => ({ inputs: [{ name: "demo.log" }] }),
        generateEvidence: async () => { called = true; }
    };

    const response = bootstrap.AgentKernel.handle({ core }, "export evidence");
    assert.equal(response.verdictLabel, "CONFIRMED");

    await new Promise((r) => setTimeout(r, 0));
    assert.equal(called, true);
});


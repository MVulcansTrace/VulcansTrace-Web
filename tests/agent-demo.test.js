import test from "node:test";
import assert from "node:assert/strict";
import * as bootstrap from "../components/node-bootstrap.js";

test("demo boardroom returns a valid response even without UI", () => {
    globalThis.logAnalystApp = null;

    const response = bootstrap.AgentKernel.handle({ stats: null }, "demo boardroom");
    assert.equal(typeof response.title, "string");
    assert.equal(response.title, "Theater Mode");
    assert.equal(response.verdictLabel, "UNKNOWN");

    const html = String(response.bodyHtml || "");
    assert.ok(html.includes("Theater Mode"), "Expected Theater Mode mention");
    assert.ok(html.toLowerCase().includes("not available"), "Expected non-UI environment message");

    const actionLabels = (response.actions || []).map(a => a.label);
    assert.ok(actionLabels.includes("Top threats"));
    assert.ok(actionLabels.includes("Compare last"));
    assert.ok(actionLabels.includes("Export evidence"));
});

test("demo guided returns a valid response even without UI", () => {
    globalThis.logAnalystApp = null;

    const context = {
        core: {
            getDB: () => ({ inputs: [] }),
            getActiveCaseId: () => null
        },
        stats: null
    };

    const response = bootstrap.AgentKernel.handle(context, "demo guided");
    assert.equal(typeof response.title, "string");
    assert.equal(response.title, "Guided Demo");
    assert.equal(response.verdictLabel, "UNKNOWN");

    const html = String(response.bodyHtml || "");
    assert.ok(html.toLowerCase().includes("not available") || html.toLowerCase().includes("requires"), "Expected non-UI environment guidance");
});

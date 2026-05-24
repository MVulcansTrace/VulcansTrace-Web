import test from "node:test";
import assert from "node:assert/strict";
import * as bootstrap from "../components/node-bootstrap.js";

test("help includes required examples", () => {
    const response = bootstrap.AgentKernel.handle({}, "help");
    assert.equal(response.verdictLabel, "CONFIRMED");

    const html = String(response.bodyHtml || "");
    const requiredExamples = [
        "top threats",
        "whats happening",
        "explain 10.0.0.5",
        "show evidence",
        "compare last",
        "remediate 10.0.0.5",
        "export evidence",
        "demo boardroom"
    ];

    for (const example of requiredExamples) {
        assert.ok(html.includes(example), `help should include example: ${example}`);
    }

    assert.ok(
        html.toLowerCase().includes("cannot access the internet"),
        "help should mention offline limitation"
    );
});

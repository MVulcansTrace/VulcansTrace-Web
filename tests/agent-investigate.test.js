import test from "node:test";
import assert from "node:assert/strict";
import * as bootstrap from "../components/node-bootstrap.js";

function flow(overrides) {
    return {
        date: "2025-01-01",
        time: "00:00:00Z",
        action: "ALLOW",
        proto: "TCP",
        src: "10.0.0.5",
        dst: "8.8.8.8",
        sport: "50000",
        dport: "443",
        size: "100",
        ...(overrides || {})
    };
}

test("investigate <ip> returns guided query summaries and actions", () => {
    const flows = [
        flow({ time: "00:00:01Z", dst: "8.8.8.8", action: "ALLOW", dport: "443", size: "200" }),
        flow({ time: "00:00:10Z", dst: "9.9.9.9", action: "DROP", dport: "3389", size: "500" }),
        flow({ time: "00:00:15Z", src: "1.2.3.4", dst: "10.0.0.5", action: "DROP", dport: "22", size: "50" }),
        flow({ time: "00:01:05Z", src: "1.2.3.4", dst: "10.0.0.5", action: "DROP", dport: "22", size: "50" }),
        flow({ time: "00:01:06Z", src: "10.0.0.7", dst: "8.8.8.8", action: "ALLOW", proto: "UDP", dport: "53", size: "900", packets: "5" })
    ];

    const context = { db: { entries: flows }, state: { lastFocus: "10.0.0.5" } };
    const response = bootstrap.AgentKernel.handle(context, "investigate 10.0.0.5");

    assert.equal(response.verdictLabel, "CONFIRMED");
    assert.ok(String(response.bodyHtml || "").includes("Outbound destinations"), "should render outbound destinations section");
    assert.ok(String(response.bodyHtml || "").includes("Dropped ports"), "should render dropped ports section");
    assert.ok(String(response.bodyHtml || "").includes("SQL templates"), "should include SQL templates for reproducibility");

    const labels = (response.actions || []).map((a) => a.label);
    assert.ok(labels.includes("Open SQL Console (Outbound)"), "should include an Open SQL Console action");
    assert.ok(labels.includes("Show proof 10.0.0.5"), "should include proof action");
});

test("investigate uses last focus when ip omitted", () => {
    const context = { db: { entries: [flow()] }, state: { lastFocus: "10.0.0.5" } };
    const response = bootstrap.AgentKernel.handle(context, "investigate");
    assert.equal(response.verdictLabel, "CONFIRMED");
    assert.ok(String(response.title || "").includes("10.0.0.5"));
});

test("investigate console prepares a predefined query bundle", () => {
    const context = { db: { entries: [flow()] }, state: { lastFocus: "10.0.0.5" } };
    const response = bootstrap.AgentKernel.handle(context, "investigate 10.0.0.5 console outbound");

    assert.equal(response.verdictLabel, "CONFIRMED");
    assert.ok(String(response.title || "").toLowerCase().includes("sql console"));
    assert.ok(String(response.bodyHtml || "").includes("FROM flows"), "should include SQL text for the selected query");
});


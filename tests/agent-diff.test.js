import test from "node:test";
import assert from "node:assert/strict";
import * as bootstrap from "../components/node-bootstrap.js";

function snap(id, createdAt, overrides) {
    return {
        id,
        createdAt,
        environmentSignature: "fnv1a32:deadbeef",
        totals: { flows: 1000, allow: 900, drop: 100 },
        peaks: { minuteBucketsTop: [{ minuteUtc: "2025-01-01T00:10Z", count: 50 }], peakMinute: { time: "00:10", count: 50 } },
        noveltySeeds: { srcIps: [], dstIps: [], dstPorts: [] },
        topRiskyEntities: [],
        portUsage: { byRole: [], bySubnet: [] },
        ...(overrides || {})
    };
}

test("compare last renders ranked changes with proof actions", () => {
    const prev = snap("s_prev", "2025-01-01T00:00:00.000Z", {
        noveltySeeds: { srcIps: ["10.0.0.1"], dstIps: ["8.8.8.8"], dstPorts: ["443"] },
        topRiskyEntities: [{ ip: "10.0.0.1", score: 3, level: "Low" }]
    });

    const cur = snap("s_cur", "2025-01-02T00:00:00.000Z", {
        noveltySeeds: { srcIps: ["10.0.0.1", "10.0.0.99"], dstIps: ["9.9.9.9"], dstPorts: ["3389"] },
        portUsage: { byRole: [{ role: "[LAN]", ports: [{ port: "3389", count: 80 }] }], bySubnet: [] },
        totals: { flows: 1200, allow: 600, drop: 600 },
        topRiskyEntities: [{ ip: "10.0.0.99", score: 10, level: "High" }]
    });

    const context = { core: { snapshotCache: [cur, prev] } };
    const response = bootstrap.AgentKernel.handle(context, "compare last");

    assert.equal(response.verdictLabel, "CONFIRMED");
    assert.ok(String(response.bodyHtml || "").includes("Ranked changes"), "diff should render ranked changes section");
    assert.ok(String(response.bodyHtml || "").includes("New risky entity"), "diff should mention new risky entities when present");

    const labels = (response.actions || []).map((a) => a.label);
    assert.ok(labels.includes("Show proof 10.0.0.99"), "diff should include Show proof action for top novel IP");
    assert.ok(labels.includes("Explain 10.0.0.99"), "diff should include Explain action for top novel IP");
});

test("diff (baseline) compares current vs baseline window", () => {
    const b1 = snap("s_b1", "2025-01-01T00:00:00.000Z", { noveltySeeds: { srcIps: ["10.0.0.1"], dstIps: ["8.8.8.8"], dstPorts: ["443"] } });
    const b2 = snap("s_b2", "2025-01-02T00:00:00.000Z", { noveltySeeds: { srcIps: ["10.0.0.2"], dstIps: ["1.1.1.1"], dstPorts: ["53"] } });
    const cur = snap("s_cur", "2025-01-03T00:00:00.000Z", {
        noveltySeeds: { srcIps: ["10.0.0.99"], dstIps: ["9.9.9.9"], dstPorts: ["3389"] },
        topRiskyEntities: [{ ip: "10.0.0.99", score: 7, level: "Medium" }]
    });

    const context = { core: { snapshotCache: [cur, b2, b1] } };
    const response = bootstrap.AgentKernel.handle(context, "diff");

    assert.equal(response.verdictLabel, "CONFIRMED");
    assert.ok(String(response.title || "").toLowerCase().includes("baseline"), "diff command should compare against baseline by default");

    const refs = Array.isArray(response.evidenceRefs) ? response.evidenceRefs : [];
    assert.ok(refs.some((r) => r && r.kind === "baseline"), "diff should include baseline evidence ref");
});


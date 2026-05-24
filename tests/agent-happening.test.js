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
        topOutboundDestinations: [],
        portUsage: { byRole: [], bySubnet: [] },
        ...(overrides || {})
    };
}

function makeStats(ip, overrides = null) {
    const focus = {
        ip,
        role: "[LAN]",
        drops: 90,
        allows: 10,
        portCount: 55,
        outboundDestCount: 12,
        outboundDropCount: 3,
        detectors: ["SCANNER", "EGRESS"],
        badges: [],
        mitre: [],
        ...(overrides && typeof overrides === "object" ? overrides : {})
    };

    return {
        risk: [{ ip, score: 10, level: "High", badges: focus.badges.slice() }],
        focus: { [ip]: focus },
        chains: [{ ip, desc: "blocked \u2192 breached", port: "3389", windowSec: 120 }]
    };
}

test("what's happening returns labeled narratives with supporting evidence + missing checks", () => {
    const ip = "10.0.0.5";
    const stats = makeStats(ip);

    const baseline = snap("s_base", "2025-01-01T00:00:00.000Z", {
        noveltySeeds: { srcIps: ["10.0.0.1"], dstIps: ["8.8.8.8"], dstPorts: ["443"] },
        portUsage: { byRole: [{ role: "[LAN]", ports: [{ port: "443", count: 120 }] }], bySubnet: [] }
    });

    const current = snap("s_cur", "2025-01-02T00:00:00.000Z", {
        totals: { flows: 2000, allow: 100, drop: 900 },
        noveltySeeds: { srcIps: ["10.0.0.5"], dstIps: ["9.9.9.9"], dstPorts: ["3389"] },
        portUsage: { byRole: [{ role: "[LAN]", ports: [{ port: "3389", count: 80 }] }], bySubnet: [] }
    });

    const context = { stats, core: { snapshotCache: [current, baseline] } };
    const response = bootstrap.AgentKernel.handle(context, "what's happening");

    assert.equal(response.verdictLabel, "HYPOTHESIS");

    const html = String(response.bodyHtml || "");
    assert.ok(html.includes("Supporting evidence"), "what's happening should include supporting evidence");
    assert.ok(html.includes("What’s missing") || html.includes("What's missing"), "what's happening should include missing checks");

    const labels = (response.actions || []).map((a) => a.label);
    assert.ok(labels.includes(`Explain ${ip}`), "what's happening should include Explain action for the top IP");
    assert.ok(labels.includes(`Investigate ${ip}`), "what's happening should include Investigate action for the top IP");
});

test("what's happening is CONFIRMED when THREAT_INTEL is present", () => {
    const ip = "10.0.0.66";
    const stats = makeStats(ip, { badges: ["THREAT_INTEL"], detectors: [] });
    const current = snap("s_cur", "2025-01-02T00:00:00.000Z", { noveltySeeds: { srcIps: [ip], dstIps: [], dstPorts: [] } });
    const context = { stats, core: { snapshotCache: [current] } };

    const response = bootstrap.AgentKernel.handle(context, "whats happening");
    assert.equal(response.verdictLabel, "CONFIRMED");
    assert.ok(Array.isArray(response.evidenceRefs) && response.evidenceRefs.length > 0, "CONFIRMED narratives should include evidence refs");
});


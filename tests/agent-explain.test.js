import test from "node:test";
import assert from "node:assert/strict";
import * as bootstrap from "../components/node-bootstrap.js";

function makeStatsWithFocus(ip, overrides = null) {
    const focusBase = {
        ip,
        role: "[LAN]",
        drops: 10,
        allows: 0,
        portCount: 9,
        outboundDestCount: 0,
        outboundDropCount: 0,
        ports: ["22", "23"],
        files: ["a.log"],
        events: [],
        badges: [],
        mitre: [],
        signals: { scanner: true, flooder: false, egress: false, chain: false, lateral: false },
        policy: false
    };

    const focus = { ...focusBase, ...(overrides && typeof overrides === "object" ? overrides : {}) };

    return {
        s: { src: { [ip]: { risk: { ip, score: 3, level: "Medium", badges: focus.badges.slice() } } } },
        risk: [{ ip, score: 3, level: "Medium", badges: focus.badges.slice() }],
        focus: { [ip]: focus },
        chains: []
    };
}

test("explain is HYPOTHESIS without threat intel", () => {
    const ip = "10.0.0.5";
    const stats = makeStatsWithFocus(ip, { badges: [] });

    const response = bootstrap.AgentKernel.handle({ stats }, `explain ${ip}`);
    assert.equal(response.verdictLabel, "HYPOTHESIS");

    const html = String(response.bodyHtml || "");
    assert.ok(html.includes("Next best checks"), "explain should include next checks section");

    const actionLabels = (response.actions || []).map(a => a.label);
    assert.ok(actionLabels.includes(`Show proof ${ip}`), "explain should include Show proof action");
});

test("explain is CONFIRMED when THREAT_INTEL badge exists", () => {
    const ip = "10.0.0.66";
    const stats = makeStatsWithFocus(ip, { badges: ["THREAT_INTEL"], signals: { scanner: false, flooder: false, egress: false, chain: false, lateral: false } });

    const response = bootstrap.AgentKernel.handle({ stats }, `explain ${ip}`);
    assert.equal(response.verdictLabel, "CONFIRMED");
    assert.ok(Array.isArray(response.evidenceRefs) && response.evidenceRefs.length > 0, "CONFIRMED explain should include evidence refs");
});

test("explain supports finding ids (1-based) for the current risk list", () => {
    const ip = "192.0.2.5";
    const stats = makeStatsWithFocus(ip, { badges: [] });
    stats.risk = [{ ip, score: 3, level: "Medium", badges: [] }];

    const response = bootstrap.AgentKernel.handle({ stats }, "explain 1");
    assert.ok(String(response.title || "").includes(ip), "explain 1 should resolve to the first risk row IP");
});


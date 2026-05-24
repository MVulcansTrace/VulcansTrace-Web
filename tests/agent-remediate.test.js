import test from "node:test";
import assert from "node:assert/strict";
import * as bootstrap from "../components/node-bootstrap.js";

function makeStatsWithThreatIntel(ip, hasThreatIntel) {
    const badges = hasThreatIntel ? ["THREAT_INTEL"] : [];
    const focus = {
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
        badges: badges.slice(),
        mitre: [],
        signals: { scanner: true, flooder: false, egress: false, chain: false, lateral: false },
        policy: false
    };

    return {
        s: { src: { [ip]: { risk: { ip, score: hasThreatIntel ? 100 : 3, level: hasThreatIntel ? "Critical" : "Medium", badges: badges.slice() } } } },
        risk: [{ ip, score: hasThreatIntel ? 100 : 3, level: hasThreatIntel ? "Critical" : "Medium", badges: badges.slice() }],
        focus: { [ip]: focus },
        chains: []
    };
}

test("RemediationService generates firewall plans for THREAT_INTEL targets", () => {
    const ip = "10.0.0.66";
    const stats = makeStatsWithThreatIntel(ip, true);

    const plans = bootstrap.RemediationService.generatePlans({ stats }, ip);
    assert.ok(Array.isArray(plans) && plans.length >= 1, "Expected at least one remediation plan");

    for (const plan of plans) {
        assert.equal(typeof plan.title, "string");
        assert.equal(typeof plan.description, "string");
        assert.equal(typeof plan.risk, "string");
        assert.ok(Array.isArray(plan.warnings), "warnings must be an array");
        assert.ok(Array.isArray(plan.commands) && plan.commands.length > 0, "commands must be non-empty");
        assert.ok(Array.isArray(plan.rollbackCommands) && plan.rollbackCommands.length > 0, "rollbackCommands must be non-empty");
    }
});

test("remediate returns CONFIRMED and includes rollback for THREAT_INTEL", () => {
    const ip = "10.0.0.66";
    const stats = makeStatsWithThreatIntel(ip, true);

    const response = bootstrap.AgentKernel.handle({ stats }, `remediate ${ip}`);
    assert.equal(response.verdictLabel, "CONFIRMED");

    const html = String(response.bodyHtml || "");
    assert.ok(html.includes("New-NetFirewallRule") || html.includes("iptables") || html.includes("ufw"), "Expected remediation commands in bodyHtml");
    assert.ok(html.includes("Rollback"), "Expected rollback section in bodyHtml");

    const actionLabels = (response.actions || []).map(a => a.label);
    assert.ok(actionLabels.includes("Export evidence"), "Expected Export evidence action");
});

test("remediate is UNKNOWN when target is not confirmed threat intel", () => {
    const ip = "10.0.0.5";
    const stats = makeStatsWithThreatIntel(ip, false);

    const response = bootstrap.AgentKernel.handle({ stats }, `remediate ${ip}`);
    assert.equal(response.verdictLabel, "UNKNOWN");
    assert.ok(String(response.bodyHtml || "").includes("only generates firewall block plans"), "Expected gating message");
});


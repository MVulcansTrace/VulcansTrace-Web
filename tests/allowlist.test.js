import test from "node:test";
import assert from "node:assert/strict";
import * as bootstrap from "../components/node-bootstrap.js";

function makeScannerEntries(srcIp, dstIp = "8.8.8.8") {
    const ports = ["21", "22", "23", "80", "443", "3389"];
    return ports.map((dport, idx) => ({
        date: "2025-01-01",
        time: `00:00:0${idx}`,
        action: "DROP",
        proto: "TCP",
        src: srcIp,
        dst: dstIp,
        sport: "5555",
        dport,
        size: "60",
        flags: "-",
        path: "SEND",
        line: idx + 1
    }));
}

test("LogProcessor allowlist suppresses scoring and increments ignored count", () => {
    const topo = [
        { name: "CORP", cidr: "10.0.0.0/8" }
    ];

    const srcIp = "10.0.0.5";
    const entries = makeScannerEntries(srcIp);

    const noAllowlist = bootstrap.LogProcessor.analyze(entries, topo, [], []);
    assert.ok(Array.isArray(noAllowlist.risk) && noAllowlist.risk.length > 0, "risk list should include the source when not allowlisted");

    const withAllowlist = bootstrap.LogProcessor.analyze(entries, topo, [], [{ target: srcIp, reason: "printer" }]);
    assert.ok(Array.isArray(withAllowlist.risk) && withAllowlist.risk.length === 0, "risk list should exclude allowlisted sources");
    assert.equal(withAllowlist.s.ignored, entries.length, "ignored should count allowlisted-source events");
});

test("Agent mark_safe adds entries and show allowlist lists them", () => {
    const core = {
        ALLOWLIST: [],
        addAllowlistEntry(target, reason) {
            const t = String(target || "").trim();
            const r = String(reason || "").trim();
            this.ALLOWLIST = [{ target: t, reason: r, createdAt: "2025-01-01T00:00:00.000Z" }].concat(
                this.ALLOWLIST.filter((e) => e && e.target !== t)
            );
            return true;
        },
        getAllowlist() {
            return this.ALLOWLIST.slice();
        }
    };

    const markRes = bootstrap.AgentKernel.handle({ core }, "mark safe 10.0.0.5 because printer");
    assert.equal(markRes.verdictLabel, "CONFIRMED");
    assert.equal(core.ALLOWLIST.length, 1);
    assert.equal(core.ALLOWLIST[0].target, "10.0.0.5");

    const listRes = bootstrap.AgentKernel.handle({ core }, "show allowlist");
    assert.equal(listRes.verdictLabel, "CONFIRMED");
    assert.ok(String(listRes.bodyHtml || "").includes("10.0.0.5"), "allowlist output should include the marked-safe IP");
});


import test from "node:test";
import assert from "node:assert/strict";
import { BaselineEngine } from "../components/node-bootstrap.js";

function snap(overrides) {
    return {
        createdAt: "2025-01-01T00:00:00.000Z",
        environmentSignature: "fnv1a32:deadbeef",
        totals: { flows: 1000, allow: 900, drop: 100 },
        peaks: { minuteBucketsTop: [{ minuteUtc: "2025-01-01T00:10Z", count: 50 }], peakMinute: { time: "00:10", count: 50 } },
        noveltySeeds: { srcIps: [], dstIps: [], dstPorts: [] },
        topRiskyEntities: [],
        portUsage: { byRole: [], bySubnet: [] },
        ...(overrides || {})
    };
}

test("BaselineEngine.buildBaseline aggregates counts and stats", () => {
    const s1 = snap({
        totals: { flows: 1000, allow: 900, drop: 100 },
        noveltySeeds: { srcIps: ["10.0.0.1"], dstIps: ["8.8.8.8"], dstPorts: ["443"] },
        peaks: { minuteBucketsTop: [{ minuteUtc: "2025-01-01T01:10Z", count: 50 }] }
    });
    const s2 = snap({
        totals: { flows: 900, allow: 850, drop: 50 },
        noveltySeeds: { srcIps: ["10.0.0.1", "10.0.0.2"], dstIps: ["1.1.1.1"], dstPorts: ["53"] },
        peaks: { minuteBucketsTop: [{ minuteUtc: "2025-01-02T01:11Z", count: 40 }] }
    });
    const s3 = snap({
        totals: { flows: 1100, allow: 1000, drop: 100 },
        noveltySeeds: { srcIps: ["10.0.0.3"], dstIps: ["8.8.8.8"], dstPorts: ["443", "22"] },
        peaks: { minuteBucketsTop: [{ minuteUtc: "2025-01-03T05:00Z", count: 60 }] }
    });

    const baseline = BaselineEngine.buildBaseline([s1, s2, s3]);
    assert.equal(baseline.snapshotCount, 3);
    assert.equal(baseline.environmentSignature, "fnv1a32:deadbeef");
    assert.equal(baseline.hostCounts["10.0.0.1"], 2);
    assert.equal(baseline.destinationCounts["8.8.8.8"], 2);
    assert.equal(baseline.portCounts["443"], 2);
    assert.ok(baseline.stats.flowMedian >= 900 && baseline.stats.flowMedian <= 1100);
    assert.ok(baseline.stats.dropRateAvg > 0.04 && baseline.stats.dropRateAvg < 0.13);
    assert.equal(baseline.stats.peakHourMode, 1);
});

test("BaselineEngine.diff reports new hosts/destinations and rare ports by role", () => {
    const baseline = BaselineEngine.buildBaseline([
        snap({
            noveltySeeds: { srcIps: ["10.0.0.1"], dstIps: ["8.8.8.8"], dstPorts: ["443"] },
            portUsage: { byRole: [{ role: "[LAN]", ports: [{ port: "443", count: 500 }] }], bySubnet: [] },
            topRiskyEntities: [{ ip: "10.0.0.1", score: 3, level: "Low" }]
        }),
        snap({
            noveltySeeds: { srcIps: ["10.0.0.2"], dstIps: ["1.1.1.1"], dstPorts: ["53"] },
            portUsage: { byRole: [{ role: "[LAN]", ports: [{ port: "53", count: 200 }] }], bySubnet: [] }
        })
    ]);

    const current = snap({
        noveltySeeds: { srcIps: ["10.0.0.2", "10.0.0.99"], dstIps: ["9.9.9.9"], dstPorts: ["3389"] },
        portUsage: { byRole: [{ role: "[LAN]", ports: [{ port: "3389", count: 80 }] }], bySubnet: [] },
        totals: { flows: 1000, allow: 600, drop: 400 },
        topRiskyEntities: [{ ip: "10.0.0.99", score: 10, level: "High" }]
    });

    const d = BaselineEngine.diff(current, baseline);
    assert.deepEqual(d.newHosts, ["10.0.0.99"]);
    assert.deepEqual(d.newDestinations, ["9.9.9.9"]);

    assert.ok(d.rarePorts.length >= 1);
    assert.equal(d.rarePorts[0].kind, "role");
    assert.equal(d.rarePorts[0].key, "[LAN]");
    assert.equal(d.rarePorts[0].port, "3389");
    assert.equal(d.rarePorts[0].baselineCount, 0);
    assert.ok(d.behaviorShifts.some(s => s.type === "drop_rate_spike"));
    assert.ok(d.newRiskyEntities.some(r => r.ip === "10.0.0.99"));
});


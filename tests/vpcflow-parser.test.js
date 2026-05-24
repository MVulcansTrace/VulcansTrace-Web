import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "../components/node-bootstrap.js";

test("VPC Flow Logs sample parses into normalized entries", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const samplePath = path.join(here, "..", "samples", "aws-vpc-flow-small.log");
    const text = fs.readFileSync(samplePath, "utf8");

    const r = globalThis.LogProcessor.processLogText(text);
    assert.equal(r.success, true);
    assert.ok(r.entries.length >= 4, "should parse OK lines and skip NODATA");

    const first = r.entries[0];
    assert.equal(first.action, "ALLOW");
    assert.equal(first.proto, "UDP");
    assert.equal(first.src, "10.0.1.10");
    assert.equal(first.dst, "8.8.8.8");
    assert.equal(first.dport, "53");
    assert.equal(first.size, "74", "bytes field should come from index 9");
    assert.equal(first.date, "2023-11-14", "date should derive from start timestamp at index 10");
    assert.equal(first.time, "22:13:20.000Z", "time should derive from start timestamp at index 10");

    const second = r.entries[1];
    assert.equal(second.size, "1500", "second entry bytes should come from index 9");

    const hasDrop = r.entries.some((e) => e.action === "DROP");
    assert.equal(hasDrop, true);
});

test("VpcFlowParser rejects malformed lines after mode detection", () => {
    // Invalid account ID (non-numeric)
    assert.strictEqual(
        VpcFlowParser.parseLine("2 BADACCOUNT eni-0abc123def4567890 10.0.1.10 8.8.8.8 53124 53 17 1 74 1700000000 1700000060 ACCEPT OK"),
        null
    );
    // Invalid interface ID
    assert.strictEqual(
        VpcFlowParser.parseLine("2 123456789012 bad-iface 10.0.1.10 8.8.8.8 53124 53 17 1 74 1700000000 1700000060 ACCEPT OK"),
        null
    );
    // Invalid action
    assert.strictEqual(
        VpcFlowParser.parseLine("2 123456789012 eni-0abc123def4567890 10.0.1.10 8.8.8.8 53124 53 17 1 74 1700000000 1700000060 INVALID OK"),
        null
    );
    // Too few fields
    assert.strictEqual(
        VpcFlowParser.parseLine("2 123456789012 eni-0abc 10.0.1.10 8.8.8.8 53124 53 17 1 74 ACCEPT"),
        null
    );
    // NODATA log status
    assert.strictEqual(
        VpcFlowParser.parseLine("2 123456789012 eni-0abc123def4567890 10.0.1.10 8.8.8.8 53124 53 17 1 74 1700000000 1700000060 ACCEPT NODATA"),
        null
    );
});


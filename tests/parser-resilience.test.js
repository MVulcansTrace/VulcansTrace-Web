import test from "node:test";
import assert from "node:assert/strict";
import "../components/node-bootstrap.js";

test("autoDetect correctly identifies VPC flow when first line is valid", () => {
    const text = [
        "2 123456789012 eni-0a1b2c3d 10.0.0.1 10.0.0.2 0 0 6 1 10 1609459200 1609459260 ACCEPT OK",
        "2 123456789012 eni-0a1b2c3d 10.0.0.1 10.0.0.2 0 0 6 1 10 1609459200 1609459260 REJECT OK"
    ].join("\n");

    const result = globalThis.LogProcessor.autoDetectAndParse(text);
    assert.equal(result.success, true, "should detect valid entries");
    assert.ok(result.entries.length > 0, "should parse at least one entry");
    assert.equal(result.entries[0].action, "ALLOW");
    assert.equal(result.entries[0].src, "10.0.0.1");
});

test("autoDetect correctly parses pure W3C logs when first line is not VPC", () => {
    const text = [
        "#Fields: date time action proto src dst sport dport",
        "2025-01-01 12:00:00 ALLOW TCP 10.0.0.1 10.0.0.2 5555 80"
    ].join("\n");

    const result = globalThis.LogProcessor.autoDetectAndParse(text);
    assert.equal(result.success, true);
    assert.ok(result.entries.length > 0);
    assert.equal(result.entries[0].action, "ALLOW");
});

import test from "node:test";
import assert from "node:assert/strict";
import "../components/node-bootstrap.js";

test("parseDateTime handles missing time with valid date", () => {
    const ms = globalThis.NetworkUtils.parseDateTime("2025-01-01", "");
    assert.ok(Number.isFinite(ms), "should return a finite number, not NaN");
    assert.equal(ms, new Date("2025-01-01T00:00:00").getTime());
});

test("parseDateTime handles missing date with valid time", () => {
    const ms = globalThis.NetworkUtils.parseDateTime("", "12:34:56");
    assert.ok(Number.isFinite(ms), "should return a finite number, not NaN");
});

test("parseDateTime returns 0 when both inputs are empty", () => {
    assert.equal(globalThis.NetworkUtils.parseDateTime("", ""), 0);
    assert.equal(globalThis.NetworkUtils.parseDateTime(null, null), 0);
});

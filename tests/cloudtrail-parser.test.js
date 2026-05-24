import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "../components/node-bootstrap.js";

test("CloudTrail sample normalizes to flat events", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const samplePath = path.join(here, "..", "samples", "aws-cloudtrail-small.json");
    const text = fs.readFileSync(samplePath, "utf8");

    assert.equal(globalThis.CloudTrailParser.canParse(text), true);

    const r = globalThis.LogProcessor.processAnyText(text);
    assert.equal(r.success, true);
    assert.equal(r.kind, "cloudtrail");
    assert.equal(Array.isArray(r.events), true);
    assert.equal(r.events.length, 2);

    const e0 = r.events[0];
    assert.equal(e0.eventSource, "s3.amazonaws.com");
    assert.equal(e0.eventName, "ListBuckets");
    assert.equal(e0.sourceIPAddress, "198.51.100.23");
    assert.equal(typeof e0.eventTimeEpochMs, "number");
});

test("CloudTrail bare single object is accepted", () => {
    const single = JSON.stringify({
        eventTime: "2024-01-01T00:00:00Z",
        eventName: "TestEvent",
        eventSource: "test.amazonaws.com"
    });
    assert.equal(globalThis.CloudTrailParser.canParse(single), true);
    const parsed = globalThis.CloudTrailParser.parse(single);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].eventName, "TestEvent");

    const viaProcessor = globalThis.LogProcessor.processAnyText(single);
    assert.equal(viaProcessor.kind, "cloudtrail");
    assert.equal(viaProcessor.events.length, 1);
});

test("CloudTrail tryParse avoids double JSON.parse", () => {
    let parseCount = 0;
    const originalParse = JSON.parse;
    JSON.parse = function (...args) {
        parseCount++;
        return originalParse.apply(this, args);
    };

    const payload = JSON.stringify({
        Records: [
            { eventTime: "2024-01-01T00:00:00Z", eventName: "A", eventSource: "a.amazonaws.com" }
        ]
    });

    const result = globalThis.LogProcessor.processAnyText(payload);
    assert.equal(result.kind, "cloudtrail");
    assert.equal(parseCount, 1, "processAnyText should call JSON.parse exactly once for CloudTrail");

    JSON.parse = originalParse;
});


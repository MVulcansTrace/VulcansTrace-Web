import test from "node:test";
import assert from "node:assert/strict";
import * as bootstrap from "../components/node-bootstrap.js";

test("bootstrap loads core components", () => {
    assert.ok(bootstrap.NetworkUtils, "NetworkUtils should be loaded");
    assert.ok(bootstrap.LogProcessor, "LogProcessor should be loaded");
    assert.ok(bootstrap.CaseSnapshot, "CaseSnapshot should be loaded");
    assert.ok(bootstrap.BaselineEngine, "BaselineEngine should be loaded");
    assert.ok(globalThis.NetworkUtils, "NetworkUtils should be on globalThis");
    assert.ok(globalThis.LogProcessor, "LogProcessor should be on globalThis");
    assert.ok(globalThis.CaseSnapshot, "CaseSnapshot should be on globalThis");
    assert.ok(globalThis.BaselineEngine, "BaselineEngine should be on globalThis");
});

import test from "node:test";
import assert from "node:assert/strict";
import * as bootstrap from "../components/node-bootstrap.js";

test('synonym mapping: "show me the top threats" -> top intent', () => {
    const result = bootstrap.AgentChatRouter.parse('show me the top threats', {});
    assert.strictEqual(result.intent, 'top');
});

test('synonym mapping: "what are the threats" -> top intent', () => {
    const result = bootstrap.AgentChatRouter.parse('what are the threats', {});
    assert.strictEqual(result.intent, 'top');
});

test('synonym mapping: exact phrases still work', () => {
    const result = bootstrap.AgentChatRouter.parse('top threats', {});
    assert.strictEqual(result.intent, 'top');
});

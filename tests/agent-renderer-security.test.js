import test from "node:test";
import assert from "node:assert/strict";
import "../components/node-bootstrap.js";

test("sanitizeBodyHtml strips unquoted onerror attribute", () => {
    const dirty = '<img src=x onerror=alert(1)>';
    const clean = globalThis.AgentRenderer.sanitizeBodyHtml(dirty);
    assert.ok(!clean.includes('onerror'), `should strip onerror, got: ${clean}`);
    assert.ok(!clean.includes('<img'), `should strip img tag, got: ${clean}`);
});

test("sanitizeBodyHtml strips meta refresh with javascript URL", () => {
    const dirty = '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">';
    const clean = globalThis.AgentRenderer.sanitizeBodyHtml(dirty);
    assert.ok(!clean.includes('javascript:'), `should strip javascript URL, got: ${clean}`);
});

test("sanitizeBodyHtml strips script tags", () => {
    const dirty = '<script>alert(1)</script><div>safe</div>';
    const clean = globalThis.AgentRenderer.sanitizeBodyHtml(dirty);
    assert.ok(!clean.includes('<script'), `should strip script tag, got: ${clean}`);
    assert.ok(clean.includes('safe'), `should preserve allowed content, got: ${clean}`);
});

test("sanitizeBodyHtml falls back to stripping all tags in headless environments", () => {
    // In Node.js (no DOMParser), the sanitizer strips all tags as a safe fallback.
    const dirty = '<div class="foo"><code>safe</code><a href="https://example.com">link</a></div>';
    const clean = globalThis.AgentRenderer.sanitizeBodyHtml(dirty);
    assert.ok(!clean.includes('<'), `should strip all tags in headless mode, got: ${clean}`);
    assert.ok(clean.includes('safe'), `should preserve text content, got: ${clean}`);
    assert.ok(clean.includes('link'), `should preserve text content, got: ${clean}`);
});

test("sanitizeBodyHtml strips javascript hrefs even in allowed a tags", () => {
    const dirty = '<a href="javascript:alert(1)">click</a>';
    const clean = globalThis.AgentRenderer.sanitizeBodyHtml(dirty);
    assert.ok(!clean.includes('href'), `should remove dangerous href, got: ${clean}`);
    assert.ok(clean.includes('click'), `should preserve text content, got: ${clean}`);
});

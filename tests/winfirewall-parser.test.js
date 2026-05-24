import test from "node:test";
import assert from "node:assert/strict";

import "../components/node-bootstrap.js";

const FP = globalThis.WindowsFirewallParser;

const FULL_LINE = "2025-01-15 08:30:12 ALLOW TCP 192.168.1.5 10.0.0.1 49152 443 40 - - - - - - - SEND";
const FULL_LINE_DROP = "2025-01-15 08:30:13 DROP ICMP 10.0.0.99 192.168.1.5 - - 128 - - - - 8 0 - RECEIVE";

test("parse valid ALLOW TCP line with direction RECEIVE", () => {
    const line = "2025-06-01 12:00:00 ALLOW TCP 192.168.1.10 10.0.0.5 49152 443 40 - - - - - - - RECEIVE";
    const e = FP.parseLine(line, 1);
    assert.ok(e, "should parse");
    assert.equal(e.action, "ALLOW");
    assert.equal(e.proto, "TCP");
    assert.equal(e.src, "192.168.1.10");
    assert.equal(e.dst, "10.0.0.5");
    assert.equal(e.sport, "49152");
    assert.equal(e.dport, "443");
    assert.equal(e.direction, "RECEIVE");
    assert.equal(e.path, "RECEIVE");
});

test("parse valid DROP UDP line with direction SEND", () => {
    const line = "2025-06-01 12:00:01 DROP UDP 10.0.0.99 192.168.1.5 12345 53 128 - - - - - - - SEND";
    const e = FP.parseLine(line, 2);
    assert.ok(e, "should parse");
    assert.equal(e.action, "DROP");
    assert.equal(e.proto, "UDP");
    assert.equal(e.src, "10.0.0.99");
    assert.equal(e.dst, "192.168.1.5");
    assert.equal(e.direction, "SEND");
});

test("reject malformed lines (too few parts)", () => {
    assert.strictEqual(FP.parseLine("2025-01-15 08:30:12 ALLOW TCP 192.168.1.5", 1), null);
    assert.strictEqual(FP.parseLine("", 1), null);
    assert.strictEqual(FP.parseLine(null, 1), null);
});

test("reject invalid timestamp", () => {
    assert.strictEqual(FP.parseLine("not-a-date 08:30:12 ALLOW TCP 192.168.1.5 10.0.0.1 49152 443 - - - - - - - - SEND", 1), null);
    assert.strictEqual(FP.canParseLine("not-a-date 08:30:12 ALLOW TCP 192.168.1.5 10.0.0.1 49152 443"), false);
});

test("reject invalid IP addresses", () => {
    assert.strictEqual(FP.parseLine("2025-01-15 08:30:12 ALLOW TCP not-an-ip 10.0.0.1 49152 443 - - - - - - - - SEND", 1), null);
    assert.strictEqual(FP.parseLine("2025-01-15 08:30:12 ALLOW TCP 192.168.1.5 not-an-ip 49152 443 - - - - - - - - SEND", 1), null);
});

test("reject placeholder IPs (src or dst is '-')", () => {
    assert.strictEqual(FP.parseLine("2025-01-15 08:30:12 ALLOW TCP - 10.0.0.1 49152 443 - - - - - - - - SEND", 1), null);
    assert.strictEqual(FP.parseLine("2025-01-15 08:30:12 ALLOW TCP 192.168.1.5 - 49152 443 - - - - - - - - SEND", 1), null);
});

test("reject invalid ports (non-numeric for TCP/UDP)", () => {
    assert.strictEqual(FP.parseLine("2025-01-15 08:30:12 ALLOW TCP 192.168.1.5 10.0.0.1 abc 443 - - - - - - - - SEND", 1), null);
    assert.strictEqual(FP.parseLine("2025-01-15 08:30:12 ALLOW TCP 192.168.1.5 10.0.0.1 49152 xyz - - - - - - - - SEND", 1), null);
    assert.strictEqual(FP.parseLine("2025-01-15 08:30:12 ALLOW UDP 192.168.1.5 10.0.0.1 -1 443 - - - - - - - - SEND", 1), null);
    assert.strictEqual(FP.parseLine("2025-01-15 08:30:12 ALLOW TCP 192.168.1.5 10.0.0.1 49152 99999 - - - - - - - - SEND", 1), null);
});

test("allow placeholder ports for ICMP", () => {
    const e = FP.parseLine(FULL_LINE_DROP, 1);
    assert.ok(e, "should parse ICMP with '-' ports");
    assert.equal(e.proto, "ICMP");
    assert.equal(e.sport, "-");
    assert.equal(e.dport, "-");
});

test("parse native trailing fields (full 17-column pfirewall line)", () => {
    const e = FP.parseLine(FULL_LINE, 1);
    assert.ok(e);
    assert.equal(e.size, "40");
    assert.equal(e.flags, "-");
    assert.equal(e.path, "SEND");
    assert.equal(e.direction, "SEND");
});

test("skip #Fields: header and #Version: comments", () => {
    assert.strictEqual(FP.parseLine("#Version: 1.5", 1), null);
    assert.strictEqual(FP.parseLine("#Software: Microsoft Windows Firewall", 2), null);
    assert.strictEqual(FP.parseLine("#Time Format: Local", 3), null);
    assert.strictEqual(FP.parseLine("#Fields: date time action protocol src-ip dst-ip src-port dst-port size tcpflags tcpsyn tcpack tcpwin icmptype icmpcode info path", 4), null);
    assert.equal(FP.canParseLine("#Version: 1.5"), false);
});

test("handle extra columns (pid) after direction", () => {
    const line = "2025-01-15 08:30:12 ALLOW TCP 192.168.1.5 10.0.0.1 49152 443 40 - - - - - - - SEND 1234";
    const e = FP.parseLine(line, 1);
    assert.ok(e, "should parse line with extra pid column");
    assert.equal(e.direction, "SEND");
    assert.equal(e.path, "SEND");
});

test("handle lines with no recognized direction token", () => {
    const line = "2025-01-15 08:30:12 ALLOW TCP 192.168.1.5 10.0.0.1 49152 443 40 - - - - - - - -";
    const e = FP.parseLine(line, 1);
    assert.ok(e, "should still parse");
    assert.equal(e.direction, "");
    assert.equal(e.path, "-");
});

test("mixed whitespace (tabs and spaces)", () => {
    const line = "2025-01-15\t08:30:12\tALLOW\tTCP\t192.168.1.5\t10.0.0.1\t49152\t443\t40\t-\t-\t-\t-\t-\t-\t-\tSEND";
    assert.equal(FP.canParseLine(line), true);
    const e = FP.parseLine(line, 1);
    assert.ok(e);
    assert.equal(e.src, "192.168.1.5");
    assert.equal(e.direction, "SEND");
});

test("different line endings (CRLF and LF)", () => {
    const crlf = "2025-01-15 08:30:12 ALLOW TCP 192.168.1.5 10.0.0.1 49152 443 40 - - - - - - - SEND\r\n";
    const lf = "2025-01-15 08:30:12 ALLOW TCP 192.168.1.5 10.0.0.1 49152 443 40 - - - - - - - SEND\n";
    assert.ok(FP.parseLine(crlf, 1));
    assert.ok(FP.parseLine(lf, 1));
});

test("multiple timestamp formats (space-separated, fractional seconds)", () => {
    const space = "2025-01-15 08:30:12 ALLOW TCP 192.168.1.5 10.0.0.1 49152 443 40 - - - - - - - SEND";
    const frac = "2025-01-15 08:30:12.500 ALLOW TCP 192.168.1.5 10.0.0.1 49152 443 40 - - - - - - - SEND";
    assert.ok(FP.parseLine(space, 1));
    assert.ok(FP.parseLine(frac, 1));
});

test("canParseLine rejects VPC flow log lines", () => {
    const vpcLine = "2 123456789012 eni-0a1b2c3d 10.0.0.1 10.0.0.2 0 0 6 1 10 1609459200 1609459260 ACCEPT OK";
    assert.equal(FP.canParseLine(vpcLine), false);
});

test("BLOCK action normalizes to DROP", () => {
    const line = "2025-01-15 08:30:12 BLOCK TCP 192.168.1.5 10.0.0.1 49152 443 40 - - - - - - - SEND";
    const e = FP.parseLine(line, 1);
    assert.ok(e);
    assert.equal(e.action, "DROP");
});

test("lineNum is set correctly", () => {
    const e = FP.parseLine(FULL_LINE, 42);
    assert.equal(e.line, 42);
});

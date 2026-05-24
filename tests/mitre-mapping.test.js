import test from 'node:test';
import assert from 'node:assert/strict';

import { LogProcessor } from '../components/LogProcessor.js';

test('MITRE mappings do not assign techniques to evidence or state labels', () => {
    assert.equal(LogProcessor.MITRE_MAP.THREAT_INTEL, undefined);
    assert.equal(LogProcessor.MITRE_MAP.COMPROMISED, undefined);
});

test('threat intel IOC badge does not add a synthetic MITRE technique', () => {
    const entries = LogProcessor.processLogText([
        '2025-01-01 12:00:00 DROP TCP 203.0.113.45 10.0.0.10 50200 22',
        '2025-01-01 12:00:01 DROP TCP 203.0.113.45 10.0.0.10 50201 23',
        '2025-01-01 12:00:02 DROP TCP 203.0.113.45 10.0.0.10 50202 80',
        '2025-01-01 12:00:03 DROP TCP 203.0.113.45 10.0.0.10 50203 443',
        '2025-01-01 12:00:04 DROP TCP 203.0.113.45 10.0.0.10 50204 3389',
        '2025-01-01 12:00:05 DROP TCP 203.0.113.45 10.0.0.10 50205 445',
        '2025-01-01 12:00:06 DROP TCP 203.0.113.45 10.0.0.10 50206 5985'
    ].join('\n'));

    const stats = LogProcessor.analyze(entries.entries, [], ['203.0.113.45']);
    const risk = stats.risk.find((r) => r.ip === '203.0.113.45');

    assert.ok(risk);
    assert.ok(risk.badges.includes('THREAT_INTEL'));
    assert.ok(risk.badges.includes('SCANNER'));
    assert.deepEqual(
        risk.mitre.map((m) => m.id),
        ['T1595']
    );
});

/**
 * Badge coverage test — verifies all 10 detection badges fire against
 * a crafted multi-attack scenario (scanner + brute force + flooder +
 * egress + chain + lateral + beacon + exfil + compromised + threat intel).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LogProcessor } from '../components/LogProcessor.js';
import { NetworkUtils } from '../components/NetworkUtils.js';

LogProcessor.setProfile('Medium');

const topology = [
    { name: 'LAN', cidr: '192.168.0.0/16' },
    { name: 'CORP', cidr: '10.0.0.0/8' },
    { name: 'DMZ', cidr: '172.16.0.0/12' }
];

function makeEntry(date, time, action, proto, src, dst, sport, dport, size, path, file) {
    return { date, time, action, proto, src, dst, sport, dport, size: String(size || 0), flags: '-', info: '-', path: path || '-', line: 0, _file: file || 'test.log' };
}

function buildDataset() {
    const entries = [];
    const file1 = 'firewall-baseline.log';
    const file2 = 'firewall-delta.log';

    // SCANNER: 203.0.113.45 hits 6+ ports on 10.0.0.10
    for (let i = 0; i < 6; i++) {
        entries.push(makeEntry('2025-01-15', `08:00:${String(i).padStart(2, '0')}`, 'DROP', 'TCP', '203.0.113.45', '10.0.0.10', String(50000 + i), String(22 + i), 0, 'SEND', file1));
    }

    // BRUTE FORCE: 203.0.113.45 rapid-fire SSH on 10.0.0.50
    for (let i = 0; i < 5; i++) {
        entries.push(makeEntry('2025-01-15', `08:01:${String(i * 2).padStart(2, '0')}`, 'DROP', 'TCP', '203.0.113.45', '10.0.0.50', String(60000 + i), '22', 0, 'SEND', file1));
    }

    // FLOODER: 203.0.113.99 hammers port 80 with 21+ DROPs
    for (let i = 0; i < 21; i++) {
        entries.push(makeEntry('2025-01-15', `08:02:${String(i).padStart(2, '0')}`, 'DROP', 'TCP', '203.0.113.99', '10.0.0.10', String(30000 + i), '80', 0, 'SEND', file1));
    }

    // CHAIN setup (file1): DROP on 445
    entries.push(makeEntry('2025-01-15', '08:05:00', 'DROP', 'TCP', '10.0.0.50', '10.0.0.20', '40000', '445', 0, 'SEND', file1));

    // CHAIN (file2): ALLOW on 445 — different file, same port, within chainWindowMs
    entries.push(makeEntry('2025-01-15', '08:06:00', 'ALLOW', 'TCP', '10.0.0.50', '10.0.0.20', '40001', '445', 500, 'SEND', file2));

    // LATERAL: 10.0.0.50 touches 3+ internal targets on admin ports
    entries.push(makeEntry('2025-01-15', '08:06:10', 'DROP', 'TCP', '10.0.0.50', '10.0.0.21', '40002', '445', 0, 'SEND', file2));
    entries.push(makeEntry('2025-01-15', '08:06:20', 'DROP', 'TCP', '10.0.0.50', '10.0.0.22', '40003', '3389', 0, 'SEND', file2));
    entries.push(makeEntry('2025-01-15', '08:06:30', 'ALLOW', 'TCP', '10.0.0.50', '10.0.0.23', '40004', '5985', 300, 'SEND', file2));

    // BEACON + EXFIL: 10.0.0.50 -> 198.51.100.100:443, regular 60s intervals, 1.1MB each
    for (let i = 0; i < 5; i++) {
        entries.push(makeEntry('2025-01-15', `08:${String(10 + i).padStart(2, '0')}:00`, 'ALLOW', 'TCP', '10.0.0.50', '198.51.100.100', String(45000 + i), '443', 1100000, 'SEND', file2));
    }

    // Extra EXFIL push on unusual port to seal the badge
    entries.push(makeEntry('2025-01-15', '08:20:00', 'ALLOW', 'TCP', '10.0.0.50', '198.51.100.100', '45010', '8443', 2097153, 'SEND', file2));

    return entries;
}

describe('Badge coverage — all 10 detection badges', () => {
    it('triggers SCANNER on multi-port sweep', () => {
        const stats = LogProcessor.analyze(buildDataset(), topology, []);
        const scanner = stats.risk.find(r => r.ip === '203.0.113.45');
        assert.ok(scanner, '203.0.113.45 should appear in risk list');
        assert.ok(scanner.badges.includes('SCANNER'), `Expected SCANNER, got [${scanner.badges}]`);
    });

    it('triggers BRUTE_FORCE on rapid SSH attempts', () => {
        const stats = LogProcessor.analyze(buildDataset(), topology, []);
        const brute = stats.risk.find(r => r.ip === '203.0.113.45');
        assert.ok(brute, '203.0.113.45 should appear in risk list');
        assert.ok(brute.badges.includes('BRUTE_FORCE'), `Expected BRUTE_FORCE, got [${brute.badges}]`);
    });

    it('triggers FLOODER on 21+ DROPs to same port', () => {
        const stats = LogProcessor.analyze(buildDataset(), topology, []);
        const flooder = stats.risk.find(r => r.ip === '203.0.113.99');
        assert.ok(flooder, '203.0.113.99 should appear in risk list');
        assert.ok(flooder.badges.includes('FLOODER'), `Expected FLOODER, got [${flooder.badges}]`);
    });

    it('triggers EGRESS on outbound traffic', () => {
        const stats = LogProcessor.analyze(buildDataset(), topology, []);
        const hasEgress = stats.risk.some(r => r.badges.includes('EGRESS'));
        assert.ok(hasEgress, 'At least one IP should have EGRESS badge');
    });

    it('triggers CHAIN on DROP->ALLOW across files', () => {
        const stats = LogProcessor.analyze(buildDataset(), topology, []);
        assert.ok(stats.chains.length > 0, `Expected chains, got ${stats.chains.length}`);
        const chain = stats.chains[0];
        assert.equal(chain.port, '445');
        assert.equal(chain.ip, '10.0.0.50');
    });

    it('triggers LATERAL on admin-port internal probes', () => {
        const stats = LogProcessor.analyze(buildDataset(), topology, []);
        const lateral = stats.risk.find(r => r.ip === '10.0.0.50');
        assert.ok(lateral, '10.0.0.50 should appear in risk list');
        assert.ok(lateral.badges.includes('LATERAL'), `Expected LATERAL, got [${lateral.badges}]`);
    });

    it('triggers BEACON on regular-interval C2 callbacks', () => {
        const stats = LogProcessor.analyze(buildDataset(), topology, []);
        const beacon = stats.risk.find(r => r.ip === '10.0.0.50');
        assert.ok(beacon, '10.0.0.50 should appear in risk list');
        assert.ok(beacon.badges.includes('BEACON'), `Expected BEACON, got [${beacon.badges}]`);
    });

    it('triggers EXFIL on >5MB outbound transfer', () => {
        const stats = LogProcessor.analyze(buildDataset(), topology, []);
        const exfil = stats.risk.find(r => r.ip === '10.0.0.50');
        assert.ok(exfil, '10.0.0.50 should appear in risk list');
        assert.ok(exfil.badges.includes('EXFIL'), `Expected EXFIL, got [${exfil.badges}]`);
    });

    it('triggers COMPROMISED on brute-force victim with outbound activity', () => {
        const stats = LogProcessor.analyze(buildDataset(), topology, []);
        assert.ok(stats.compromised.length > 0, 'Expected at least one compromised host');
        const c = stats.compromised[0];
        assert.equal(c.ip, '10.0.0.50');
        assert.ok(c.compromisedBy.includes('203.0.113.45'));
    });

    it('triggers THREAT_INTEL on IOC-listed source IP', () => {
        const stats = LogProcessor.analyze(buildDataset(), topology, ['203.0.113.45']);
        const intel = stats.risk.find(r => r.badges.includes('THREAT_INTEL'));
        assert.ok(intel, 'Expected at least one IP with THREAT_INTEL badge');
        assert.equal(intel.ip, '203.0.113.45');
        assert.ok(intel.score >= 100, `THREAT_INTEL should add +100 to score, got ${intel.score}`);
    });
});

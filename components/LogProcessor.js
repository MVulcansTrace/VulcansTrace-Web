/* Log parsing and processing utilities */
import { VpcFlowParser } from './parsers/VpcFlowParser.js';
import { CloudTrailParser } from './parsers/CloudTrailParser.js';
import { WindowsFirewallParser } from './parsers/WindowsFirewallParser.js';
import { NetworkUtils } from './NetworkUtils.js';

const W3C_FIELD_KEY_MAP = Object.freeze({
    'date': 'date', 'time': 'time', 'action': 'action', 'protocol': 'proto',
    'src-ip': 'src', 'srcip': 'src', 'source-ip': 'src',
    'dst-ip': 'dst', 'dstip': 'dst', 'dest-ip': 'dst',
    'src-port': 'sport', 'srcport': 'sport', 'dst-port': 'dport', 'dstport': 'dport',
    'tcpflags': 'flags', 'path': 'path'
});

const W3C_DEFAULT_COLS = Object.freeze([
    'date', 'time', 'action', 'proto', 'src', 'dst', 'sport', 'dport', 'size', 'flags',
    'syn', 'ack', 'win', 'icmpt', 'icmpc', 'info', 'path'
]);

export class LogProcessor {
    // --- NEW: MITRE Definition ---
    static get MITRE_MAP() {
        return {
            'SCANNER': { id: 'T1595', name: 'Active Scanning' },
            'FLOODER': { id: 'T1498', name: 'Network Denial of Service' },
            'EGRESS': { id: 'T1048', name: 'Exfiltration Over Alternative Protocol' },
            'CHAIN': { id: 'T1190', name: 'Exploit Public-Facing Application' },
            'LATERAL': { id: 'T1021', name: 'Remote Services' },
            'BEACON': { id: 'T1071.001', name: 'Application Layer Protocol: Web Protocols' },
            'EXFIL': { id: 'T1048', name: 'Exfiltration Over Alternative Protocol' },
            'BRUTE_FORCE': { id: 'T1110.001', name: 'Brute Force: Password Guessing' }
        };
    }

    static computeRiskProfile(ip, srcStats, outboundStats, inChain, lateralCount) {
        const cfg = LogProcessor.RISK_CONSTANTS;

        const portsCount = srcStats.ports ? srcStats.ports.size : 0;
        const outboundDests = outboundStats && outboundStats.dests ? outboundStats.dests.size : 0;
        const outboundDrops = outboundStats && typeof outboundStats.drops === 'number' ? outboundStats.drops : 0;
        const outboundAllows = outboundStats && typeof outboundStats.allows === 'number' ? outboundStats.allows : 0;
        const outboundBytes = outboundStats && typeof outboundStats.bytes === 'number' ? outboundStats.bytes : 0;

        let score = 0;
        const badges = [];

        const isScanner = portsCount > cfg.thresholds.scannerPorts && srcStats.drops > srcStats.allows;
        if (isScanner) {
            score += cfg.weights.scanner;
            badges.push('SCANNER');
        }

        const isFlooder = !isScanner && (srcStats.drops > cfg.thresholds.floodDrops || srcStats.bruteForcePort != null);
        if (isFlooder) {
            score += cfg.weights.flooder;
            badges.push('FLOODER');
        }

        const isEgress = outboundDests > cfg.thresholds.egressDests
            || outboundDrops > cfg.thresholds.egressDrops
            || (outboundAllows > (cfg.thresholds.egressAllows || Infinity) && outboundBytes > (cfg.thresholds.egressBytes || Infinity));
        if (isEgress) {
            score += cfg.weights.egress;
            badges.push('EGRESS');
        }

        if (inChain) {
            score += cfg.weights.chain;
            badges.push('CHAIN');
        }

        const isLateral = lateralCount > 1;
        if (isLateral) {
            score += cfg.weights.lateral;
            badges.push('LATERAL');
        }

        const isBeacon = srcStats.beacons && srcStats.beacons.length > 0;
        if (isBeacon) {
            score += cfg.weights.beacon || 4;
            badges.push('BEACON');
        }

        const isExfil = !!srcStats.exfilFlag;
        if (isExfil) {
            score += cfg.weights.exfil || 4;
            badges.push('EXFIL');
        }

        const isBruteForceBadge = !!srcStats.bruteForceBadge;
        if (isBruteForceBadge) {
            score += cfg.weights.bruteForce || 3;
            badges.push('BRUTE_FORCE');
        }

        const isCompromised = !!srcStats.compromisedFlag;
        if (isCompromised) {
            score += cfg.weights.compromised || 5;
            badges.push('COMPROMISED');
        }

        const level = score >= cfg.levels.high ? 'High' : (score >= cfg.levels.medium ? 'Medium' : 'Low');

        // --- NEW: Map Badges to MITRE Techniques ---
        const mitre = badges.map(b => LogProcessor.MITRE_MAP[b]).filter(Boolean);

        return {
            ip,
            score,
            level,
            badges,
            mitre, // <--- Added this field
            signals: {
                scanner: isScanner,
                flooder: isFlooder,
                egress: isEgress,
                chain: inChain,
                lateral: isLateral,
                bruteForce: srcStats.bruteForcePort != null,
                beacon: isBeacon,
                exfil: isExfil,
                bruteForceBadge: isBruteForceBadge,
                compromised: isCompromised,
                outboundAllows,
                outboundBytes
            },
            drops: srcStats.drops,
            allows: srcStats.allows,
            portCount: portsCount,
            outboundDests,
            outboundDrops,
            outboundAllows,
            outboundBytes,
            lateralFiles: lateralCount,
            bruteForcePort: srcStats.bruteForcePort || null
        };
    }

    static processLogText(text) {
        try {
            return LogProcessor.autoDetectAndParse(text);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    static processAnyText(text) {
        const raw = String(text || '').trim();
        if (!raw) return { success: false, kind: 'unknown' };

        try {
            const ct = CloudTrailParser.tryParse(raw);
            if (ct.ok) {
                const events = ct.records.map(r => CloudTrailParser.normalizeRecord(r));
                return { success: events.length > 0, kind: 'cloudtrail', events };
            }
        } catch {
            // Fall through to flow parsing.
        }

        const flows = LogProcessor.autoDetectAndParse(raw);
        return { ...flows, kind: 'flows' };
    }

    static autoDetectAndParse(text) {
        const parser = LogProcessor.createLineParser();
        const lines = String(text || '').split(/\r?\n/);
        for (const line of lines) {
            parser.consumeLine(line);
        }
        return { success: parser.entries.length > 0, entries: parser.entries };
    }

    static createLineParser() {
        const entries = [];

        let headers = [];
        let useDefault = true;

        let lineNum = 0;
        let detectedMode = null; // null | 'w3c' | 'vpc' | 'winfw'

        function consumeLine(rawLine) {
            lineNum++;
            let line = (rawLine || '').trim();
            if (!line) return null;

            if (!detectedMode) {
                if (!line.startsWith('#')) {
                    // If we already saw a #Fields: directive, this is W3C — skip
                    // mode detection so WinFW/VPC parsers don't hijack the data.
                    if (!useDefault) {
                        detectedMode = 'w3c';
                    } else {
                        try {
                            if (VpcFlowParser.canParseLine(line)) {
                                detectedMode = 'vpc';
                            } else if (WindowsFirewallParser.canParseLine(line)) {
                                detectedMode = 'winfw';
                            } else {
                                detectedMode = 'w3c';
                            }
                        } catch {
                            // leave detectedMode null; try next line
                        }
                    }
                }
            }

            if (detectedMode === 'vpc') {
                const e = VpcFlowParser.parseLine(line, lineNum);
                if (e) entries.push(e);
                return e;
            }

            if (detectedMode === 'winfw') {
                const e = WindowsFirewallParser.parseLine(line, lineNum);
                if (e) entries.push(e);
                return e;
            }

            if (line.startsWith('#Fields:')) {
                headers = line.substring(8).trim().toLowerCase().split(/\s+/).map(c => W3C_FIELD_KEY_MAP[c] || c);
                useDefault = false;
                return null;
            }

            if (line.startsWith('#')) return null;

            const VALID_W3C_ACTIONS = ['ALLOW', 'DROP', 'ACCEPT', 'REJECT', 'BLOCK', 'DENY', 'UNKNOWN'];

            const parts = line.split(/\s+/);
            const cols = useDefault ? W3C_DEFAULT_COLS : headers;

            if (parts.length < 6) return null;

            const e = {};
            for (let i = 0; i < parts.length; i++) {
                if (i < cols.length) {
                    e[cols[i]] = parts[i];
                }
            }

            e.action = (e.action || 'UNKNOWN').toUpperCase();
            e.src = e.src || 'Unknown';
            e.dst = e.dst || 'Unknown';
            e.dport = e.dport || '-';
            e.proto = (e.proto || 'Other').toUpperCase();
            e.path = (e.path || '-').toUpperCase();
            e.line = lineNum;

            if (!VALID_W3C_ACTIONS.includes(e.action)) return null;
            if (NetworkUtils.ipToLong(e.src) === null && NetworkUtils.ipToLong(e.dst) === null) return null;
            if (e.sport && e.sport !== '-' && isNaN(parseInt(e.sport, 10))) return null;
            if (e.dport && e.dport !== '-' && isNaN(parseInt(e.dport, 10))) return null;

            entries.push(e);
            return e;
        }

        return { consumeLine, entries };
    }

    static analyze(data, topology, iocList = [], allowlist = []) {
        const cfg = LogProcessor.RISK_CONSTANTS;
        const chainWindow = cfg.chainWindowMs || 300000;
        const iocSet = new Set(iocList);
        const allowSet = new Set();
        const s = LogProcessor.initializeStatsObject();

        const minTracker = {};
        const sortedData = [...data];
        const policyActors = new Set();
        const policyFlows = [];

        const rawAllowlist = Array.isArray(allowlist) ? allowlist : [];
        for (const entry of rawAllowlist) {
            let target = '';
            if (typeof entry === 'string') target = entry.trim();
            else if (entry && typeof entry === 'object') {
                if (typeof entry.target === 'string') target = entry.target.trim();
                else if (typeof entry.ip === 'string') target = entry.ip.trim();
            }

            if (!target) continue;
            if (NetworkUtils.ipToLong(target) === null) continue;
            allowSet.add(target);
        }

        sortedData.sort((a, b) => NetworkUtils.parseDateTime(a.date, a.time) - NetworkUtils.parseDateTime(b.date, b.time));

        for (const e of sortedData) {
            const ignoreSource = allowSet.has(e.src);
            LogProcessor.processEntry(e, s, topology, minTracker, policyActors, policyFlows, { ignoreSource });
        }

        const lateral = LogProcessor.detectLateralMovement(s);
        LogProcessor.detectAttackChains(s, chainWindow);
        LogProcessor.detectBruteForce(s, cfg);
        LogProcessor.detectBeacons(s, cfg);
        LogProcessor.detectExfiltration(s, cfg);
        LogProcessor.detectBruteForceBadge(s, cfg);
        // Register brute-force targets into targetRegistry so detectCompromisedHosts
        // can cross-reference them. This must happen AFTER detectBruteForce sets
        // bruteForcePort, but BEFORE detectCompromisedHosts runs.
        Object.keys(s.src).forEach(attackerIp => {
            const attacker = s.src[attackerIp];
            if (attacker.bruteForcePort == null) return;
            for (const ev of attacker.events) {
                if (ev.action === 'DROP' && ev.dport === attacker.bruteForcePort && ev.dst && ev.dst !== '-') {
                    if (!s.targetRegistry[ev.dst]) {
                        s.targetRegistry[ev.dst] = { firstSeen: ev.ts, attackers: [], ports: new Set() };
                    }
                    if (!s.targetRegistry[ev.dst].attackers.includes(attackerIp)) {
                        s.targetRegistry[ev.dst].attackers.push(attackerIp);
                    }
                    s.targetRegistry[ev.dst].ports.add(attacker.bruteForcePort);
                }
            }
        });
        const compromised = LogProcessor.detectCompromisedHosts(s, cfg);
        const chainActors = new Set(s.chains.map(c => c.ip));

        const riskProfiles = LogProcessor.calculateRiskProfiles(s, chainActors, iocSet, allowSet);
        const rankedRisk = LogProcessor.rankRiskProfiles(riskProfiles, cfg);

        const scanners = LogProcessor.identifyScanners(s, cfg);
        const flooders = LogProcessor.identifyFlooders(s, cfg, scanners);
        const infections = LogProcessor.identifyInfections(s, cfg);

        const policy = policyFlows;
        const focus = LogProcessor.createFocusDetails(s, policyActors);

        return {
            s,
            scanners,
            flooders,
            infections,
            policy,
            lateral,
            chains: s.chains,
            risk: rankedRisk,
            focus,
            compromised,
            victims: s.targetRegistry
        };
    }

    static initializeStatsObject() {
        return {
            allow: 0,
            drop: 0,
            ignored: 0,
            invalid: 0,
            invalidRows: [],
            timeline: new Array(24).fill(0),
            proto: { TCP: 0, UDP: 0, ICMP: 0, OTHER: 0 },
            src: {},
            outbound: {},
            peakMinute: { time: '', count: 0 },
            lateral: {},
            targetRegistry: {},
            chains: [],
            roleCounts: {},
            meta: { earliest: null, latest: null }
        };
    }

    static processEntry(e, s, topology, minTracker, policyActors, policyFlows, options = null) {
        const rSrc = (e.src !== '-' && e.src !== 'Unknown') ? NetworkUtils.resolveRole(e.src, topology) : null;
        const rDst = (e.dst !== '-' && e.dst !== 'Unknown') ? NetworkUtils.resolveRole(e.dst, topology) : null;

        if (rSrc === '[INVALID]' || rDst === '[INVALID]') {
            s.invalid++;
            if (s.invalidRows.length < 20) {
                s.invalidRows.push({
                    line: e.line || 0,
                    src: e.src,
                    dst: e.dst,
                    file: e._file || 'Unknown'
                });
            }
            return;
        }

        if (e.action === 'ALLOW') s.allow++;
        else if (e.action === 'DROP') s.drop++;

        if (['TCP', 'UDP', 'ICMP'].includes(e.proto)) {
            s.proto[e.proto] = (s.proto[e.proto] || 0) + 1;
        } else {
            s.proto.OTHER++;
        }

        const dt = NetworkUtils.parseDateTime(e.date, e.time);
        if (dt > 0) {
            if (s.meta.earliest === null || dt < s.meta.earliest) s.meta.earliest = dt;
            if (s.meta.latest === null || dt > s.meta.latest) s.meta.latest = dt;

            const dateObj = new Date(dt);
            s.timeline[dateObj.getUTCHours()]++;

            const min = dateObj.toISOString().substring(11, 16);
            minTracker[min] = (minTracker[min] || 0) + 1;

            if (minTracker[min] > s.peakMinute.count) {
                s.peakMinute = { time: min, count: minTracker[min] };
            }
        }

        const ignoreSource = !!(options && options.ignoreSource);
        if (ignoreSource) {
            s.ignored = (Number.isFinite(s.ignored) ? s.ignored : 0) + 1;
            return;
        }

        if (e.src !== '-' && e.src !== 'Unknown') {
            const role = NetworkUtils.resolveRole(e.src, topology);
            const bytes = parseInt(e.size, 10) || 0;

            if (!s.src[e.src]) {
                s.src[e.src] = {
                    drops: 0,
                    allows: 0,
                    ports: new Set(),
                    files: new Set(),
                    events: [],
                    role: role,
                    bytes: 0,
                    lateralTargets: new Set(),
                    bruteForcePort: null
                };
                s.roleCounts[role] = (s.roleCounts[role] || 0) + 1;
            }

            if (e.action === 'DROP') s.src[e.src].drops++;
            else s.src[e.src].allows++;

            if (e.dport !== '-') s.src[e.src].ports.add(e.dport);
            if (e._file) s.src[e.src].files.add(e._file);

            s.src[e.src].bytes += bytes;

            const ADMIN_PORTS = new Set(["22","135","139","445","3389","5985","5986","5900","5800"]);
            const dstRole = NetworkUtils.resolveRole(e.dst, topology);
            if (ADMIN_PORTS.has(e.dport) && dstRole !== "[WAN]" && dstRole !== "[INVALID]") {
                s.src[e.src].lateralTargets.add(e.dst);
            }

            s.src[e.src].events.push({
                ts: dt,
                action: e.action,
                file: e._file,
                dport: e.dport,
                dst: e.dst,
                time: e.time
            });
        }

        const roleSrc = NetworkUtils.resolveRole(e.src, topology);
        const roleDst = NetworkUtils.resolveRole(e.dst, topology);

        if (e.path === 'SEND' || (roleSrc !== '[WAN]' && roleDst === '[WAN]')) {
            if (!s.outbound[e.src]) {
                s.outbound[e.src] = { dests: new Set(), drops: 0, allows: 0, bytes: 0, ports: new Set() };
            }
            s.outbound[e.src].dests.add(e.dst);
            if (e.action === 'DROP') s.outbound[e.src].drops++;
            if (e.action !== 'DROP') s.outbound[e.src].allows++;
            s.outbound[e.src].bytes += parseInt(e.size, 10) || 0;
            s.outbound[e.src].ports.add(e.dport);
        }

        if (e.action === 'DROP' && s.src[e.src] && s.src[e.src].ports.size > 2 && e.dst !== '-' && e.dst !== 'Unknown') {
            if (!s.targetRegistry[e.dst]) {
                s.targetRegistry[e.dst] = { firstSeen: dt, attackers: [], ports: new Set() };
            }
            s.targetRegistry[e.dst].attackers.push(e.src);
            s.targetRegistry[e.dst].ports.add(e.dport);
        }

        if (e.action === 'ALLOW' && ['21', '23', '80'].includes(e.dport)) {
            policyActors.add(e.src);
            if (policyFlows.length < 10) {
                policyFlows.push({
                    port: e.dport,
                    flow: `${e.src}->${e.dst}`
                });
            }
        }
    }

    static detectLateralMovement(s) {
        const minTargets = (LogProcessor.RISK_CONSTANTS.thresholds && LogProcessor.RISK_CONSTANTS.thresholds.lateralTargets) || 3;
        return Object.keys(s.src)
            .filter(ip => {
                const targets = s.src[ip].lateralTargets;
                return targets && targets.size >= minTargets;
            })
            .map(ip => ({
                ip,
                count: s.src[ip].lateralTargets.size,
                role: s.src[ip].role,
                detail: Array.from(s.src[ip].lateralTargets).join(', ')
            }))
            .sort((a, b) => b.count - a.count);
    }

    static detectAttackChains(s, chainWindow) {
        Object.keys(s.src).forEach(ip => {
            const events = s.src[ip].events;
            for (let i = 0; i < events.length; i++) {
                const e1 = events[i];
                if (e1.action === 'DROP') {
                    for (let j = i + 1; j < events.length; j++) {
                        const e2 = events[j];
                        if (e2.ts - e1.ts > chainWindow) break;

                        if (e2.action === 'ALLOW' && e2.file !== e1.file) {
                            if (e1.dport === e2.dport) {
                                s.chains.push({
                                    ip,
                                    from: e1.file,
                                    to: e2.file,
                                    port: e1.dport,
                                    timeDelta: `${Math.round((e2.ts - e1.ts) / 1000)}s`,
                                    desc: `Blocked on ${e1.file} -> Breached ${e2.file}`
                                });
                                i = j;
                                break;
                            }
                        }
                    }
                }
            }
        });
    }

    static detectBruteForce(s, cfg) {
        const windowMs = (cfg && cfg.thresholds && cfg.thresholds.bruteForceWindowMs) || 30000;
        const minCount = (cfg && cfg.thresholds && cfg.thresholds.bruteForceCount) || 5;
        const ADMIN_PORTS = new Set(["22","135","139","445","3389","5985","5986","5900","5800"]);
        Object.keys(s.src).forEach(ip => {
            const events = s.src[ip].events;
            const byPort = {};
            for (const ev of events) {
                if (!byPort[ev.dport]) byPort[ev.dport] = [];
                byPort[ev.dport].push(ev);
            }
            for (const [port, portEvents] of Object.entries(byPort)) {
                if (portEvents.length < minCount) continue;
                // Only flag brute force on admin/service ports to avoid false
                // positives on normal web browsing bursts (port 443, 80, etc.)
                if (!ADMIN_PORTS.has(port)) continue;
                portEvents.sort((a, b) => a.ts - b.ts);
                let start = 0;
                for (let end = 0; end < portEvents.length; end++) {
                    while (portEvents[end].ts - portEvents[start].ts > windowMs) start++;
                    if (end - start + 1 >= minCount) {
                        s.src[ip].bruteForcePort = port;
                        return;
                    }
                }
            }
        });
    }

    static detectBeacons(s, cfg) {
        const minConnections = (cfg && cfg.thresholds && cfg.thresholds.beaconMinConnections) || 4;
        const maxJitter = (cfg && cfg.thresholds && cfg.thresholds.beaconJitterThreshold) || 0.3;
        const minSpanMs = (cfg && cfg.thresholds && cfg.thresholds.beaconMinSpanMs) || 60000; // must span ≥60s
        Object.keys(s.src).forEach(ip => {
            const events = s.src[ip].events;
            if (events.length < minConnections) return;
            const byDestPort = {};
            for (const ev of events) {
                const key = ev.dst + ":" + ev.dport;
                if (!byDestPort[key]) byDestPort[key] = [];
                byDestPort[key].push(ev);
            }
            const beacons = [];
            for (const [key, evts] of Object.entries(byDestPort)) {
                if (evts.length < minConnections) continue;
                const sorted = evts.slice().sort((a, b) => a.ts - b.ts);
                // Reject bursts that don't span enough time (e.g. 5 requests in 5s)
                if ((sorted[sorted.length - 1].ts - sorted[0].ts) < minSpanMs) continue;
                const gaps = [];
                for (let i = 1; i < sorted.length; i++) {
                    gaps.push(sorted[i].ts - sorted[i - 1].ts);
                }
                if (gaps.length === 0) continue;
                const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                if (mean === 0) continue;
                const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
                const stddev = Math.sqrt(variance);
                const jitter = stddev / mean;
                if (jitter < maxJitter) {
                    beacons.push({ dst: sorted[0].dst, port: sorted[0].dport, interval: Math.round(mean / 1000), jitter: Math.round(jitter * 100) / 100 });
                }
            }
            if (beacons.length > 0) {
                s.src[ip].beacons = beacons;
            }
        });
    }

    static detectExfiltration(s, cfg) {
        const NORMAL_PORTS = new Set(["53", "80", "443", "8080", "8443"]);
        const bytesThreshold = (cfg && cfg.thresholds && cfg.thresholds.exfilBytesThreshold) || 5242880;
        Object.keys(s.outbound).forEach(ip => {
            const ob = s.outbound[ip];
            if (!ob || !ob.bytes) return;
            if (ob.bytes < bytesThreshold) return;
            const unusualPorts = Array.from(ob.ports || []).filter(p => !NORMAL_PORTS.has(p));
            if (unusualPorts.length > 0 || (ob.dests && ob.dests.size === 1)) {
                if (!s.src[ip]) return;
                s.src[ip].exfilFlag = true;
            }
        });
    }

    static detectBruteForceBadge(s, cfg) {
        Object.keys(s.src).forEach(ip => {
            if (s.src[ip].bruteForcePort != null) {
                s.src[ip].bruteForceBadge = true;
            }
        });
    }

    static detectCompromisedHosts(s, cfg) {
        const compromised = [];
        if (!s.targetRegistry) return compromised;
        Object.keys(s.targetRegistry).forEach(ip => {
            const targetInfo = s.targetRegistry[ip];
            if (s.src[ip] && s.outbound[ip]) {
                const ob = s.outbound[ip];
                const hasOutboundActivity = (ob.allows || 0) > 0 || (ob.drops || 0) > 0;
                if (hasOutboundActivity) {
                    const entry = {
                        ip,
                        compromisedBy: [...new Set(targetInfo.attackers)],
                        firstTargetedAt: targetInfo.firstSeen,
                        outboundBytes: ob.bytes || 0,
                        outboundDests: ob.dests ? ob.dests.size : 0
                    };
                    compromised.push(entry);
                    s.src[ip].compromisedFlag = true;
                }
            }
        });
        return compromised;
    }

    static calculateRiskProfiles(s, chainActors, iocSet, allowSet) {
        const allow = allowSet && typeof allowSet.has === 'function' ? allowSet : null;
        return Object.keys(s.src).filter(ip => !(allow && allow.has(ip))).map(ip => {
            const srcStats = s.src[ip];
            const outboundStats = s.outbound[ip] || { dests: new Set(), drops: 0 };
            const profile = LogProcessor.computeRiskProfile(ip, srcStats, outboundStats, chainActors.has(ip), (srcStats.lateralTargets ? srcStats.lateralTargets.size : 0));

            if (iocSet.has(ip)) {
                profile.score += 100;
                profile.level = 'Critical';
                profile.badges.push('THREAT_INTEL');
                // THREAT_INTEL is an evidence label (IOC match), not an ATT&CK technique.
            }

            profile.bytes = srcStats.bytes;
            s.src[ip].risk = profile;
            return profile;
        });
    }

    static rankRiskProfiles(riskProfiles, cfg) {
        return riskProfiles
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score || b.drops - a.drops || b.outboundDests - a.outboundDests)
            .slice(0, cfg.maxEntries);
    }

    static identifyScanners(s, cfg) {
        return Object.keys(s.src)
            .filter(ip => s.src[ip].ports.size > cfg.thresholds.scannerPorts && s.src[ip].drops > s.src[ip].allows)
            .map(ip => ({
                ip,
                val: `${s.src[ip].ports.size} ports`,
                count: s.src[ip].drops
            }))
            .sort((a, b) => b.count - a.count);
    }

    static identifyFlooders(s, cfg, scanners) {
        return Object.keys(s.src)
            .filter(ip => !scanners.some(x => x.ip === ip) && s.src[ip].drops > cfg.thresholds.floodDrops)
            .map(ip => ({
                ip,
                val: 'High Vol',
                count: s.src[ip].drops
            }))
            .sort((a, b) => b.count - a.count);
    }

    static identifyInfections(s, cfg) {
        return Object.keys(s.outbound)
            .filter(ip => s.outbound[ip].dests.size > cfg.thresholds.egressDests || s.outbound[ip].drops > cfg.thresholds.egressDrops)
            .map(ip => ({
                ip,
                val: `To ${s.outbound[ip].dests.size} hosts`,
                count: s.outbound[ip].drops
            }))
            .sort((a, b) => b.count - a.count);
    }

    static createFocusDetails(s, policyActors) {
        const focus = {};
        Object.keys(s.src).forEach(ip => {
            const srcStats = s.src[ip];
            const outboundStats = s.outbound[ip] || { dests: new Set(), drops: 0 };
            const risk = srcStats.risk || {};
            focus[ip] = {
                ip,
                role: srcStats.role,
                drops: srcStats.drops,
                allows: srcStats.allows,
                portCount: srcStats.ports.size,
                outboundDestCount: outboundStats.dests.size,
                outboundDropCount: outboundStats.drops,
                outboundAllowCount: outboundStats.allows || 0,
                outboundBytes: outboundStats.bytes || 0,
                outboundPorts: Array.from(outboundStats.ports || []),
                lateralTargets: Array.from(srcStats.lateralTargets || []),
                ports: Array.from(srcStats.ports),
                files: Array.from(srcStats.files),
                events: srcStats.events.slice(-10),
                badges: risk.badges || [],
                mitre: risk.mitre || [], // --- NEW: Pass MITRE to Focus ---
                signals: risk.signals || {},
                policy: policyActors.has(ip)
            };
        });
        return focus;
    }

    static getFocusDetail(stats, ip) {
        if (!stats || !stats.focus || !stats.focus[ip]) return null;

        const f = stats.focus[ip];
        const detectors = [];

        if (f.signals && f.signals.scanner) detectors.push('SCANNER');
        if (f.signals && f.signals.flooder) detectors.push('FLOODER');
        if (f.signals && f.signals.egress) detectors.push('EGRESS');
        if (f.signals && f.signals.chain) detectors.push('CHAIN');
        if (f.signals && f.signals.lateral) detectors.push('LATERAL');
        if (f.signals && f.signals.beacon) detectors.push('BEACON');
        if (f.signals && f.signals.exfil) detectors.push('EXFIL');
        if (f.signals && f.signals.bruteForceBadge) detectors.push('BRUTE_FORCE');
        if (f.signals && f.signals.compromised) detectors.push('COMPROMISED');
        if (f.policy) detectors.push('POLICY');

        return {
            ip: f.ip,
            role: f.role,
            drops: f.drops,
            allows: f.allows,
            portCount: f.portCount,
            outboundDestCount: f.outboundDestCount || 0,
            outboundDropCount: f.outboundDropCount || 0,
            outboundAllowCount: f.outboundAllowCount || 0,
            outboundBytes: f.outboundBytes || 0,
            outboundPorts: f.outboundPorts || [],
            lateralTargets: f.lateralTargets || [],
            ports: f.ports || [],
            files: f.files || [],
            events: (f.events || []).map(e => ({ ...e })),
            badges: f.badges || [],
            mitre: f.mitre || [], // --- NEW: Pass MITRE to Focus View ---
            signals: f.signals || {},
            policy: !!f.policy,
            detectors
        };
    }
}

// Static properties
LogProcessor.PROFILES = {
    Low: {
        thresholds: {
            scannerPorts: 8,
            floodDrops: 35,
            egressDests: 10,
            egressDrops: 12,
            lateralTargets: 5,
            egressAllows: 15,
            egressBytes: 10485760,
            bruteForceCount: 10,
            bruteForceWindowMs: 60000,
            beaconMinConnections: 6,
            beaconJitterThreshold: 0.2,
            exfilBytesThreshold: 20971520
        },
        chainWindowMs: 420000
    },
    Medium: {
        thresholds: {
            scannerPorts: 5,
            floodDrops: 20,
            egressDests: 6,
            egressDrops: 8,
            lateralTargets: 3,
            egressAllows: 10,
            egressBytes: 5242880,
            bruteForceCount: 5,
            bruteForceWindowMs: 30000,
            beaconMinConnections: 4,
            beaconJitterThreshold: 0.3,
            exfilBytesThreshold: 5242880
        },
        chainWindowMs: 300000
    },
    High: {
        thresholds: {
            scannerPorts: 3,
            floodDrops: 10,
            egressDests: 4,
            egressDrops: 4,
            lateralTargets: 2,
            egressAllows: 5,
            egressBytes: 1048576,
            bruteForceCount: 3,
            bruteForceWindowMs: 15000,
            beaconMinConnections: 3,
            beaconJitterThreshold: 0.4,
            exfilBytesThreshold: 1048576
        },
        chainWindowMs: 120000
    }
};

LogProcessor.ACTIVE_PROFILE = 'Medium';

LogProcessor.RISK_CONSTANTS = {
    thresholds: { ...LogProcessor.PROFILES[LogProcessor.ACTIVE_PROFILE].thresholds },
    chainWindowMs: LogProcessor.PROFILES[LogProcessor.ACTIVE_PROFILE].chainWindowMs,
    weights: {
        scanner: 3,
        flooder: 3,
        egress: 2,
        chain: 3,
        lateral: 2,
        beacon: 4,
        exfil: 4,
        bruteForce: 3,
        compromised: 5
    },
    levels: {
        high: 6,
        medium: 3
    },
    maxEntries: 50
};

LogProcessor.setProfile = function (profileName) {
    const profile = LogProcessor.PROFILES[profileName] || LogProcessor.PROFILES[LogProcessor.ACTIVE_PROFILE] || LogProcessor.PROFILES.Medium;
    LogProcessor.ACTIVE_PROFILE = profileName && LogProcessor.PROFILES[profileName] ? profileName : LogProcessor.ACTIVE_PROFILE;
    LogProcessor.RISK_CONSTANTS.thresholds = { ...profile.thresholds };
    LogProcessor.RISK_CONSTANTS.chainWindowMs = profile.chainWindowMs;
    return LogProcessor.ACTIVE_PROFILE;
};

LogProcessor.getActiveProfile = function () {
    return LogProcessor.ACTIVE_PROFILE;
};

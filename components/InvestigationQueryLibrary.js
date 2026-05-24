/* Guided investigation queries (safe, predefined; no freeform SQL generation) */
import { NetworkUtils } from './NetworkUtils.js';
import { UIUtils } from './UIUtils.js';

const QUERY_KEYS = Object.freeze({
    OUTBOUND_DESTS: 'outbound_destinations',
    DROPPED_PORTS: 'dropped_ports',
    PEAK_WINDOW: 'peak_window',
    TOP_TALKERS: 'top_talkers'
});

function safeString(value) {
    return typeof value === 'string' ? value : (value === null || value === undefined ? '' : String(value));
}

function safeInt(value) {
    const n = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
    return Number.isFinite(n) ? n : 0;
}

function safeBigInt(value) {
    const n = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
    return Number.isFinite(n) ? n : 0;
}

function normalizeIp(candidate) {
    const ip = safeString(candidate).trim();
    if (!ip) return null;
    if (NetworkUtils?.ipToLong) {
        return NetworkUtils.ipToLong(ip) === null ? null : ip;
    }
    const parts = ip.split('.').map(x => parseInt(x, 10));
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null;
    return ip;
}

function sqlStringLiteral(value) {
    const s = safeString(value);
    return `'${s.replace(/'/g, "''")}'`;
}

function getEpochMsForEntry(entry) {
    const e = entry && typeof entry === 'object' ? entry : null;
    if (!e) return 0;
    const date = safeString(e.date).trim();
    const time = safeString(e.time).trim();
    if (NetworkUtils?.parseDateTime) {
        return NetworkUtils.parseDateTime(date, time) || 0;
    }
    if (!date || !time) return 0;
    const ms = new Date(`${date}T${time}`).getTime();
    return Number.isFinite(ms) ? ms : 0;
}

function floorToMinuteMs(epochMs) {
    if (!Number.isFinite(epochMs) || epochMs <= 0) return 0;
    return Math.floor(epochMs / 60000) * 60000;
}

function isoMinute(epochMs) {
    if (!Number.isFinite(epochMs) || epochMs <= 0) return '';
    const iso = new Date(epochMs).toISOString();
    return `${iso.slice(0, 16)}:00Z`;
}

function addMinutesMs(epochMs, mins) {
    const n = Number.isFinite(epochMs) ? epochMs : 0;
    const m = Number.isFinite(mins) ? mins : 0;
    return n + (m * 60000);
}

function normalizeAction(entry) {
    return safeString(entry && entry.action).trim().toUpperCase();
}

function normalizeProto(entry) {
    const p = safeString(entry && entry.proto).trim().toUpperCase();
    return p || 'OTHER';
}

function normalizePort(value) {
    const p = safeString(value).trim();
    return p && p !== '-' ? p : '';
}

function getFlowsArray(dbOrFlows) {
    if (Array.isArray(dbOrFlows)) return dbOrFlows;
    const db = dbOrFlows && typeof dbOrFlows === 'object' ? dbOrFlows : null;
    if (db && Array.isArray(db.entries)) return db.entries;
    if (db && Array.isArray(db.flows)) return db.flows;
    return [];
}

function computeOutboundDestinations(flows, ip, limit = 12) {
    const host = normalizeIp(ip);
    if (!host) return { host: null, distinctDestinations: 0, rows: [] };

    const map = new Map();
    for (const entry of flows) {
        if (!entry || typeof entry !== 'object') continue;
        if (safeString(entry.src).trim() !== host) continue;

        const dst = safeString(entry.dst).trim();
        if (!dst || dst.toLowerCase() === 'unknown') continue;

        const action = normalizeAction(entry);
        const bytes = safeBigInt(entry.size);
        const port = normalizePort(entry.dport);

        let row = map.get(dst);
        if (!row) {
            row = { dst, flows: 0, drops: 0, allows: 0, bytes: 0, ports: new Set() };
            map.set(dst, row);
        }
        row.flows += 1;
        if (action === 'DROP') row.drops += 1;
        if (action === 'ALLOW') row.allows += 1;
        row.bytes += bytes;
        if (port) row.ports.add(port);
    }

    const list = Array.from(map.values());
    list.sort((a, b) => (b.bytes - a.bytes) || (b.flows - a.flows) || String(a.dst).localeCompare(String(b.dst)));

    const take = Math.max(0, Math.min(50, safeInt(limit) || 12));
    const rows = list.slice(0, take).map((r) => {
        const portList = Array.from(r.ports).sort((x, y) => safeInt(x) - safeInt(y)).slice(0, 6);
        const portText = portList.length ? portList.join(', ') : '-';
        return [r.dst, r.flows, r.drops, r.allows, r.bytes, portText];
    });

    return { host, distinctDestinations: map.size, rows };
}

function computeDroppedPorts(flows, ip, limit = 12) {
    const host = normalizeIp(ip);
    if (!host) return { host: null, inboundRows: [], outboundRows: [] };

    function accumulate(map, entry, peerField) {
        const action = normalizeAction(entry);
        if (action !== 'DROP') return;

        const port = normalizePort(entry.dport);
        if (!port) return;

        const proto = normalizeProto(entry);
        const peer = safeString(entry && entry[peerField]).trim();

        const key = `${proto}|${port}`;
        let row = map.get(key);
        if (!row) {
            row = { proto, port, drops: 0, peers: new Map() };
            map.set(key, row);
        }
        row.drops += 1;
        if (peer) {
            row.peers.set(peer, (row.peers.get(peer) || 0) + 1);
        }
    }

    const inbound = new Map();
    const outbound = new Map();

    for (const entry of flows) {
        if (!entry || typeof entry !== 'object') continue;
        const src = safeString(entry.src).trim();
        const dst = safeString(entry.dst).trim();
        if (dst === host) accumulate(inbound, entry, 'src');
        if (src === host) accumulate(outbound, entry, 'dst');
    }

    function toRows(map, dirLabel) {
        const list = Array.from(map.values());
        list.sort((a, b) => (b.drops - a.drops) || (safeInt(a.port) - safeInt(b.port)) || a.proto.localeCompare(b.proto));
        const take = Math.max(0, Math.min(50, safeInt(limit) || 12));
        return list.slice(0, take).map((r) => {
            let topPeer = '-';
            if (r.peers && r.peers.size) {
                const peers = Array.from(r.peers.entries()).sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])));
                topPeer = `${peers[0][0]} (${peers[0][1]})`;
            }
            return [dirLabel, r.proto, r.port, r.drops, topPeer];
        });
    }

    return {
        host,
        inboundRows: toRows(inbound, 'Inbound'),
        outboundRows: toRows(outbound, 'Outbound'),
        inboundDistinctPorts: inbound.size,
        outboundDistinctPorts: outbound.size
    };
}

function computePeakMinuteWindow(flows, ip, windowMins = 1, sampleLimit = 10) {
    const host = normalizeIp(ip);
    if (!host) return { host: null, peakMinuteMs: 0, peakMinuteIso: '', windowStartIso: '', windowEndIso: '', rows: [] };

    const buckets = new Map();
    for (const entry of flows) {
        if (!entry || typeof entry !== 'object') continue;
        const src = safeString(entry.src).trim();
        const dst = safeString(entry.dst).trim();
        if (src !== host && dst !== host) continue;

        const ms = floorToMinuteMs(getEpochMsForEntry(entry));
        if (!ms) continue;

        const action = normalizeAction(entry);
        let b = buckets.get(ms);
        if (!b) {
            b = { minuteMs: ms, flows: 0, drops: 0 };
            buckets.set(ms, b);
        }
        b.flows += 1;
        if (action === 'DROP') b.drops += 1;
    }

    const list = Array.from(buckets.values());
    list.sort((a, b) => (b.drops - a.drops) || (b.flows - a.flows) || (b.minuteMs - a.minuteMs));
    const peak = list[0] || null;
    const peakMinuteMs = peak ? peak.minuteMs : 0;

    if (!peakMinuteMs) {
        return { host, peakMinuteMs: 0, peakMinuteIso: '', windowStartIso: '', windowEndIso: '', rows: [] };
    }

    const w = Math.max(0, Math.min(15, safeInt(windowMins)));
    const startMs = addMinutesMs(peakMinuteMs, -w);
    const endMs = addMinutesMs(peakMinuteMs, w + 1);

    const sample = [];
    for (const entry of flows) {
        if (!entry || typeof entry !== 'object') continue;
        const src = safeString(entry.src).trim();
        const dst = safeString(entry.dst).trim();
        if (src !== host && dst !== host) continue;

        const ts = getEpochMsForEntry(entry);
        if (!ts) continue;
        if (ts < startMs || ts >= endMs) continue;

        const dir = src === host ? 'Outbound' : 'Inbound';
        const peer = src === host ? dst : src;
        const bytes = safeBigInt(entry.size);
        sample.push({
            ts,
            time: safeString(entry.time).trim() || new Date(ts).toISOString().slice(11, 19),
            dir,
            peer: peer || '-',
            action: normalizeAction(entry),
            proto: normalizeProto(entry),
            dport: normalizePort(entry.dport) || '-',
            bytes
        });
    }

    sample.sort((a, b) => a.ts - b.ts || a.peer.localeCompare(b.peer));
    const take = Math.max(0, Math.min(200, safeInt(sampleLimit) || 10));
    const rows = sample.slice(0, take).map((r) => [r.time, r.dir, r.peer, r.action, r.proto, r.dport, r.bytes]);

    return {
        host,
        peakMinuteMs,
        peakMinuteIso: isoMinute(peakMinuteMs),
        windowStartIso: new Date(startMs).toISOString(),
        windowEndIso: new Date(addMinutesMs(endMs, 0) - 1).toISOString(),
        rows
    };
}

function computeTopTalkers(flows, limit = 10) {
    const map = new Map();

    for (const entry of flows) {
        if (!entry || typeof entry !== 'object') continue;
        const src = safeString(entry.src).trim();
        if (!src || src.toLowerCase() === 'unknown') continue;

        let row = map.get(src);
        if (!row) {
            row = { src, flows: 0, drops: 0, bytes: 0, packets: 0 };
            map.set(src, row);
        }

        row.flows += 1;
        if (normalizeAction(entry) === 'DROP') row.drops += 1;
        row.bytes += safeBigInt(entry.size);
        row.packets += safeBigInt(entry.packets);
    }

    const list = Array.from(map.values());
    list.sort((a, b) => (b.bytes - a.bytes) || (b.drops - a.drops) || (b.flows - a.flows) || a.src.localeCompare(b.src));

    const take = Math.max(0, Math.min(50, safeInt(limit) || 10));
    const rows = list.slice(0, take).map((r) => [r.src, r.bytes, r.packets, r.drops, r.flows]);
    return { distinctSources: map.size, rows };
}

function buildSqlBundle(key, params = {}) {
    const p = UIUtils.isPlainObject(params) ? params : {};
    const ip = normalizeIp(p.ip);

    if (key === QUERY_KEYS.OUTBOUND_DESTS) {
        if (!ip) return [];
        return [
            {
                key: QUERY_KEYS.OUTBOUND_DESTS,
                title: 'Outbound destinations for host',
                sql: [
                    'SELECT',
                    '  dst,',
                    '  count(*) AS flows,',
                    "  sum(CASE WHEN action = 'DROP' THEN 1 ELSE 0 END) AS drops,",
                    "  sum(CASE WHEN action = 'ALLOW' THEN 1 ELSE 0 END) AS allows,",
                    '  sum(try_cast(size AS BIGINT)) AS bytes',
                    'FROM flows',
                    `WHERE src = ${sqlStringLiteral(ip)}`,
                    'GROUP BY dst',
                    'ORDER BY bytes DESC NULLS LAST, flows DESC',
                    'LIMIT 20;'
                ].join('\n')
            }
        ];
    }

    if (key === QUERY_KEYS.DROPPED_PORTS) {
        if (!ip) return [];
        return [
            {
                key: `${QUERY_KEYS.DROPPED_PORTS}:inbound`,
                title: 'Dropped ports (inbound)',
                sql: [
                    'SELECT',
                    '  proto, dport,',
                    '  count(*) AS drops',
                    'FROM flows',
                    `WHERE dst = ${sqlStringLiteral(ip)} AND action = 'DROP'`,
                    'GROUP BY proto, dport',
                    'ORDER BY drops DESC',
                    'LIMIT 20;'
                ].join('\n')
            },
            {
                key: `${QUERY_KEYS.DROPPED_PORTS}:outbound`,
                title: 'Dropped ports (outbound)',
                sql: [
                    'SELECT',
                    '  proto, dport,',
                    '  count(*) AS drops',
                    'FROM flows',
                    `WHERE src = ${sqlStringLiteral(ip)} AND action = 'DROP'`,
                    'GROUP BY proto, dport',
                    'ORDER BY drops DESC',
                    'LIMIT 20;'
                ].join('\n')
            }
        ];
    }

    if (key === QUERY_KEYS.PEAK_WINDOW) {
        if (!ip) return [];
        const peakMinuteIso = safeString(p.peakMinuteIso).trim();
        const windowStartIso = safeString(p.windowStartIso).trim();
        const windowEndIso = safeString(p.windowEndIso).trim();

        const tsExpr = "try_cast(date || 'T' || time AS TIMESTAMP)";

        const queries = [
            {
                key: `${QUERY_KEYS.PEAK_WINDOW}:peak`,
                title: 'Peak minute for host (by drops)',
                sql: [
                    'WITH t AS (',
                    `  SELECT ${tsExpr} AS ts, action, src, dst, proto, dport, size`,
                    '  FROM flows',
                    `  WHERE (src = ${sqlStringLiteral(ip)} OR dst = ${sqlStringLiteral(ip)})`,
                    `    AND ${tsExpr} IS NOT NULL`,
                    ')',
                    'SELECT',
                    "  date_trunc('minute', ts) AS minute,",
                    '  count(*) AS flows,',
                    "  sum(CASE WHEN action = 'DROP' THEN 1 ELSE 0 END) AS drops",
                    'FROM t',
                    'GROUP BY minute',
                    'ORDER BY drops DESC, flows DESC',
                    'LIMIT 10;'
                ].join('\n')
            }
        ];

        if (windowStartIso && windowEndIso) {
            queries.push({
                key: `${QUERY_KEYS.PEAK_WINDOW}:window`,
                title: `Window around peak minute${peakMinuteIso ? ` (${peakMinuteIso})` : ''}`,
                sql: [
                    'WITH t AS (',
                    `  SELECT ${tsExpr} AS ts, action, src, dst, proto, dport, size`,
                    '  FROM flows',
                    `  WHERE (src = ${sqlStringLiteral(ip)} OR dst = ${sqlStringLiteral(ip)})`,
                    `    AND ${tsExpr} IS NOT NULL`,
                    ')',
                    'SELECT',
                    '  ts, action, src, dst, proto, dport, try_cast(size AS BIGINT) AS bytes',
                    'FROM t',
                    `WHERE ts >= ${sqlStringLiteral(windowStartIso)} AND ts <= ${sqlStringLiteral(windowEndIso)}`,
                    'ORDER BY ts ASC',
                    'LIMIT 200;'
                ].join('\n')
            });
        }

        return queries;
    }

    if (key === QUERY_KEYS.TOP_TALKERS) {
        return [
            {
                key: `${QUERY_KEYS.TOP_TALKERS}:bytes`,
                title: 'Top talkers by bytes',
                sql: [
                    'SELECT',
                    '  src,',
                    '  count(*) AS flows,',
                    '  sum(try_cast(size AS BIGINT)) AS bytes,',
                    "  sum(CASE WHEN action = 'DROP' THEN 1 ELSE 0 END) AS drops,",
                    '  sum(try_cast(packets AS BIGINT)) AS packets',
                    'FROM flows',
                    'GROUP BY src',
                    'ORDER BY bytes DESC NULLS LAST, flows DESC',
                    'LIMIT 20;'
                ].join('\n')
            },
            {
                key: `${QUERY_KEYS.TOP_TALKERS}:drops`,
                title: 'Top talkers by drops',
                sql: [
                    'SELECT',
                    '  src,',
                    '  count(*) AS flows,',
                    "  sum(CASE WHEN action = 'DROP' THEN 1 ELSE 0 END) AS drops,",
                    '  sum(try_cast(size AS BIGINT)) AS bytes,',
                    '  sum(try_cast(packets AS BIGINT)) AS packets',
                    'FROM flows',
                    'GROUP BY src',
                    'ORDER BY drops DESC, flows DESC',
                    'LIMIT 20;'
                ].join('\n')
            }
        ];
    }

    return [];
}

function listQueries() {
    return [
        { key: QUERY_KEYS.OUTBOUND_DESTS, title: 'Outbound destinations for host' },
        { key: QUERY_KEYS.DROPPED_PORTS, title: 'Dropped ports for host' },
        { key: QUERY_KEYS.PEAK_WINDOW, title: 'Time window around peak minute' },
        { key: QUERY_KEYS.TOP_TALKERS, title: 'Top talkers by bytes/packets/drops' }
    ];
}

function computeAll(dbOrFlows, ip) {
    const flows = getFlowsArray(dbOrFlows);
    const host = normalizeIp(ip);
    const outbound = computeOutboundDestinations(flows, host);
    const dropped = computeDroppedPorts(flows, host);
    const peak = computePeakMinuteWindow(flows, host, 1, 10);
    const talkers = computeTopTalkers(flows, 10);

    const sql = {
        outbound: buildSqlBundle(QUERY_KEYS.OUTBOUND_DESTS, { ip: host }),
        dropped: buildSqlBundle(QUERY_KEYS.DROPPED_PORTS, { ip: host }),
        peak: buildSqlBundle(QUERY_KEYS.PEAK_WINDOW, {
            ip: host,
            peakMinuteIso: peak.peakMinuteIso,
            windowStartIso: peak.windowStartIso,
            windowEndIso: peak.windowEndIso
        }),
        talkers: buildSqlBundle(QUERY_KEYS.TOP_TALKERS, {})
    };

    return { host, outbound, dropped, peak, talkers, sql };
}

function getQueryKeys() {
    return { ...QUERY_KEYS };
}

export const InvestigationQueryLibrary = {
    QUERY_KEYS,
    getQueryKeys,
    listQueries,
    computeAll,
    buildSqlBundle
};

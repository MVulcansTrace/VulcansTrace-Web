/* Build compact, durable snapshots from an analysis run (case memory) */

function stableStringify(value) {
    if (value === null || value === undefined) return String(value);
    const t = typeof value;
    if (t === "string") return JSON.stringify(value);
    if (t === "number" || t === "boolean") return String(value);
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    if (t === "object") {
        const keys = Object.keys(value).sort();
        const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
        return `{${parts.join(",")}}`;
    }
    return JSON.stringify(String(value));
}

function fnv1a32(str) {
    const input = String(str || "");
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

function toArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.slice();
    if (typeof value[Symbol.iterator] === "function") return Array.from(value);
    if (typeof value.forEach === "function") {
        const out = [];
        value.forEach((v) => out.push(v));
        return out;
    }
    return [];
}

function uniqSorted(arr, limit) {
    const out = Array.from(new Set((arr || []).map((v) => String(v)))).sort((a, b) => a.localeCompare(b));
    const cap = Number.isFinite(limit) ? Math.max(0, limit) : 0;
    if (!cap || out.length <= cap) return { values: out, truncated: false };
    return { values: out.slice(0, cap), truncated: true };
}

function normalizeMinuteBuckets(buckets, limit) {
    const rows = Array.isArray(buckets) ? buckets : [];
    const normalized = rows
        .map((r) => ({
            minuteUtc: r && r.minuteUtc ? String(r.minuteUtc) : "",
            count: r && Number.isFinite(r.count) ? r.count : 0
        }))
        .filter((r) => r.minuteUtc && r.count > 0);

    normalized.sort((a, b) => b.count - a.count || a.minuteUtc.localeCompare(b.minuteUtc));
    const cap = Number.isFinite(limit) ? Math.max(0, limit) : 20;
    return normalized.slice(0, cap);
}

function normalizePortUsage(portUsage) {
    const pu = portUsage && typeof portUsage === "object" ? portUsage : {};
    const normalizePorts = (ports, limit) => {
        const rows = Array.isArray(ports) ? ports : [];
        const cleaned = rows
            .map((p) => ({
                port: p && p.port != null ? String(p.port) : "",
                count: p && Number.isFinite(p.count) ? p.count : 0
            }))
            .filter((p) => p.port && p.count > 0);
        cleaned.sort((a, b) => b.count - a.count || a.port.localeCompare(b.port));
        const cap = Number.isFinite(limit) ? Math.max(0, limit) : 15;
        return cleaned.slice(0, cap);
    };

    const byRole = (Array.isArray(pu.byRole) ? pu.byRole : [])
        .map((row) => ({
            role: row && row.role != null ? String(row.role) : "",
            ports: normalizePorts(row && row.ports, 15)
        }))
        .filter((r) => r.role && r.ports.length);
    byRole.sort((a, b) => a.role.localeCompare(b.role));

    const bySubnet = (Array.isArray(pu.bySubnet) ? pu.bySubnet : [])
        .map((row) => ({
            subnet: row && row.subnet != null ? String(row.subnet) : "",
            ports: normalizePorts(row && row.ports, 10)
        }))
        .filter((r) => r.subnet && r.ports.length);
    bySubnet.sort((a, b) => a.subnet.localeCompare(b.subnet));

    return { byRole, bySubnet };
}

function buildSnapshot({ caseId, stats, profile, topology, totals, createdAt }) {
    const now = (createdAt || new Date().toISOString());
    const s = stats && stats.s ? stats.s : null;

    const earliestMs = (s && s.meta && Number.isFinite(s.meta.earliest)) ? s.meta.earliest : null;
    const latestMs = (s && s.meta && Number.isFinite(s.meta.latest)) ? s.meta.latest : null;
    const earliestIso = (earliestMs != null) ? new Date(earliestMs).toISOString() : null;
    const latestIso = (latestMs != null) ? new Date(latestMs).toISOString() : null;
    const durationMs = (earliestMs != null && latestMs != null && latestMs >= earliestMs) ? (latestMs - earliestMs) : null;

    const safeProfile = (profile != null) ? String(profile) : null;
    const safeTopology = Array.isArray(topology)
        ? topology
            .map((t) => ({
                name: t && t.name != null ? String(t.name) : "",
                cidr: t && t.cidr != null ? String(t.cidr) : ""
            }))
            .filter((t) => t.name && t.cidr)
            .sort((a, b) => (a.name.localeCompare(b.name) || a.cidr.localeCompare(b.cidr)))
        : [];

    const totalsIn = totals && typeof totals === "object" ? totals : {};
    const flowCount = Number.isFinite(totalsIn.flows) ? totalsIn.flows : null;
    const cloudtrailCount = Number.isFinite(totalsIn.cloudtrail) ? totalsIn.cloudtrail : null;

    const roleCounts = s && s.roleCounts && typeof s.roleCounts === "object" ? s.roleCounts : {};
    const normalizedRoleCounts = Object.keys(roleCounts)
        .sort((a, b) => String(a).localeCompare(String(b)))
        .reduce((acc, k) => {
            acc[String(k)] = Number.isFinite(roleCounts[k]) ? roleCounts[k] : 0;
            return acc;
        }, {});

    const signatureInput = {
        profile: safeProfile,
        topology: safeTopology,
        roleCounts: normalizedRoleCounts
    };
    const environmentSignature = `fnv1a32:${fnv1a32(stableStringify(signatureInput))}`;

    const riskList = Array.isArray(stats && stats.risk) ? stats.risk : [];
    const focus = stats && stats.focus && typeof stats.focus === "object" ? stats.focus : {};

    const topRiskyEntities = riskList.map((r) => {
        const ip = r && r.ip != null ? String(r.ip) : "";
        const f = ip && focus[ip] ? focus[ip] : null;
        return {
            ip,
            score: (r && Number.isFinite(r.score)) ? r.score : 0,
            level: (r && r.level != null) ? String(r.level) : "Unknown",
            role: (f && f.role != null) ? String(f.role) : (r && r.role != null ? String(r.role) : null),
            badges: Array.isArray(r && r.badges) ? r.badges.map((b) => String(b)) : [],
            signals: (r && r.signals && typeof r.signals === "object") ? { ...r.signals } : {},
            drops: (r && Number.isFinite(r.drops)) ? r.drops : 0,
            allows: (r && Number.isFinite(r.allows)) ? r.allows : 0,
            portCount: (r && Number.isFinite(r.portCount)) ? r.portCount : 0,
            outboundDests: (r && Number.isFinite(r.outboundDests)) ? r.outboundDests : 0,
            outboundDrops: (r && Number.isFinite(r.outboundDrops)) ? r.outboundDrops : 0
        };
    });

    const outbound = s && s.outbound && typeof s.outbound === "object" ? s.outbound : {};
    const destCounts = new Map();
    Object.keys(outbound).forEach((srcIp) => {
        const row = outbound[srcIp];
        const dests = toArray(row && row.dests);
        dests.forEach((dst) => {
            const key = String(dst);
            if (!key || key === "-" || key.toLowerCase() === "unknown") return;
            destCounts.set(key, (destCounts.get(key) || 0) + 1);
        });
    });

    const topOutboundDestinations = Array.from(destCounts.entries())
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .slice(0, 10)
        .map(([dst, srcCount]) => ({ dst, srcCount }));

    const peakMinute = (s && s.peakMinute && typeof s.peakMinute === "object") ? {
        time: s.peakMinute.time != null ? String(s.peakMinute.time) : "",
        count: Number.isFinite(s.peakMinute.count) ? s.peakMinute.count : 0
    } : { time: "", count: 0 };

    const minuteBucketsTop = normalizeMinuteBuckets(totalsIn.minuteBuckets, 25);

    const seedsIn = (totalsIn.seeds && typeof totalsIn.seeds === "object") ? totalsIn.seeds : {};
    const srcSeeds = uniqSorted(seedsIn.srcIps, 20000);
    const dstSeeds = uniqSorted(seedsIn.dstIps, 20000);
    const portSeeds = uniqSorted(seedsIn.dstPorts, 20000);
    const portUsage = normalizePortUsage(totalsIn.portUsage);

    return {
        caseId: caseId != null ? String(caseId) : null,
        createdAt: now,
        timeWindow: {
            earliest: earliestIso,
            latest: latestIso,
            durationMs
        },
        totals: {
            flows: flowCount,
            cloudtrail: cloudtrailCount,
            allow: (s && Number.isFinite(s.allow)) ? s.allow : null,
            drop: (s && Number.isFinite(s.drop)) ? s.drop : null,
            invalid: (s && Number.isFinite(s.invalid)) ? s.invalid : null
        },
        topRiskyEntities,
        topOutboundDestinations,
        peaks: {
            peakMinute,
            minuteBucketsTop
        },
        portUsage,
        noveltySeeds: {
            srcIps: srcSeeds.values,
            dstIps: dstSeeds.values,
            dstPorts: portSeeds.values,
            truncated: (srcSeeds.truncated || dstSeeds.truncated || portSeeds.truncated) ? true : false
        },
        environmentSignature
    };
}

export const CaseSnapshot = { buildSnapshot };

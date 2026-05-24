/* Deterministic baseline and diff engine (no ML, offline-first) */

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function increment(map, key, by = 1) {
    const k = String(key);
    if (!k) return;
    map[k] = (map[k] || 0) + (Number.isFinite(by) ? by : 1);
}

function sortedKeys(obj) {
    return Object.keys(obj || {}).sort((a, b) => a.localeCompare(b));
}

function median(nums) {
    const list = (nums || []).filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
    if (!list.length) return null;
    const mid = Math.floor(list.length / 2);
    if (list.length % 2) return list[mid];
    return (list[mid - 1] + list[mid]) / 2;
}

function mode(nums) {
    const counts = {};
    let best = null;
    let bestCount = 0;
    (nums || []).forEach((n) => {
        if (!Number.isFinite(n)) return;
        const k = String(n);
        counts[k] = (counts[k] || 0) + 1;
        if (counts[k] > bestCount) {
            bestCount = counts[k];
            best = n;
        }
    });
    return best;
}

function hourFromSnapshot(snapshot) {
    const s = safeObject(snapshot);
    const peaks = safeObject(s.peaks);
    const buckets = safeArray(peaks.minuteBucketsTop);
    const top = buckets.length ? buckets[0] : null;
    const minuteUtc = top && top.minuteUtc ? String(top.minuteUtc) : "";
    if (minuteUtc.length >= 13) {
        const hh = parseInt(minuteUtc.slice(11, 13), 10);
        if (Number.isFinite(hh) && hh >= 0 && hh <= 23) return hh;
    }

    const peakMinute = safeObject(peaks.peakMinute);
    const time = peakMinute.time ? String(peakMinute.time) : "";
    const hh = parseInt(time.split(":")[0], 10);
    if (Number.isFinite(hh) && hh >= 0 && hh <= 23) return hh;

    return null;
}

function normalizePortUsage(snapshot) {
    const s = safeObject(snapshot);
    const portUsage = safeObject(s.portUsage);
    const byRole = safeArray(portUsage.byRole).map((row) => ({
        key: row && row.role != null ? String(row.role) : "",
        kind: "role",
        ports: safeArray(row && row.ports).map((p) => ({
            port: p && p.port != null ? String(p.port) : "",
            count: p && Number.isFinite(p.count) ? p.count : 0
        }))
    }));
    const bySubnet = safeArray(portUsage.bySubnet).map((row) => ({
        key: row && row.subnet != null ? String(row.subnet) : "",
        kind: "subnet",
        ports: safeArray(row && row.ports).map((p) => ({
            port: p && p.port != null ? String(p.port) : "",
            count: p && Number.isFinite(p.count) ? p.count : 0
        }))
    }));

    const normalized = {
        byRole: byRole.filter((r) => r.key),
        bySubnet: bySubnet.filter((r) => r.key)
    };

    normalized.byRole.sort((a, b) => a.key.localeCompare(b.key));
    normalized.bySubnet.sort((a, b) => a.key.localeCompare(b.key));
    normalized.byRole.forEach((r) => r.ports.sort((a, b) => b.count - a.count || a.port.localeCompare(b.port)));
    normalized.bySubnet.forEach((r) => r.ports.sort((a, b) => b.count - a.count || a.port.localeCompare(b.port)));

    return normalized;
}

function buildBaseline(snapshots) {
    const list = safeArray(snapshots).filter((s) => s && typeof s === "object");
    const signatureCounts = {};

    const hostCounts = {};
    const destinationCounts = {};
    const portCounts = {};

    const portCountsByRole = {};
    const portCountsBySubnet = {};

    const flowTotals = [];
    const dropRates = [];
    const peakHours = [];

    const riskyIpCounts = {};

    list.forEach((snapshot) => {
        const s = safeObject(snapshot);
        const signature = s.environmentSignature != null ? String(s.environmentSignature) : "";
        if (signature) increment(signatureCounts, signature, 1);

        const seeds = safeObject(s.noveltySeeds);
        safeArray(seeds.srcIps).forEach((ip) => increment(hostCounts, ip, 1));
        safeArray(seeds.dstIps).forEach((ip) => increment(destinationCounts, ip, 1));
        safeArray(seeds.dstPorts).forEach((p) => increment(portCounts, p, 1));

        const totals = safeObject(s.totals);
        if (Number.isFinite(totals.flows)) flowTotals.push(totals.flows);
        const allow = Number.isFinite(totals.allow) ? totals.allow : null;
        const drop = Number.isFinite(totals.drop) ? totals.drop : null;
        const denom = (allow != null && drop != null) ? (allow + drop) : null;
        if (denom && denom > 0) dropRates.push(drop / denom);

        const hh = hourFromSnapshot(s);
        if (hh != null) peakHours.push(hh);

        safeArray(s.topRiskyEntities).forEach((r) => {
            const ip = r && r.ip != null ? String(r.ip) : "";
            if (!ip) return;
            increment(riskyIpCounts, ip, 1);
        });

        const usage = normalizePortUsage(s);
        usage.byRole.forEach((row) => {
            const role = row.key;
            if (!portCountsByRole[role]) portCountsByRole[role] = {};
            row.ports.forEach((p) => increment(portCountsByRole[role], p.port, p.count || 0));
        });
        usage.bySubnet.forEach((row) => {
            const subnet = row.key;
            if (!portCountsBySubnet[subnet]) portCountsBySubnet[subnet] = {};
            row.ports.forEach((p) => increment(portCountsBySubnet[subnet], p.port, p.count || 0));
        });
    });

    const topSignature = sortedKeys(signatureCounts)
        .map((k) => ({ k, n: signatureCounts[k] }))
        .sort((a, b) => b.n - a.n || a.k.localeCompare(b.k))[0] || null;

    const flowMedian = median(flowTotals);
    const dropRateAvg = dropRates.length ? (dropRates.reduce((a, b) => a + b, 0) / dropRates.length) : null;
    const peakHourMode = mode(peakHours);

    return {
        builtAt: new Date().toISOString(),
        snapshotCount: list.length,
        environmentSignature: topSignature ? topSignature.k : null,
        signatureCounts: { ...signatureCounts },
        hostCounts: { ...hostCounts },
        destinationCounts: { ...destinationCounts },
        portCounts: { ...portCounts },
        portCountsByRole: { ...portCountsByRole },
        portCountsBySubnet: { ...portCountsBySubnet },
        riskyIpCounts: { ...riskyIpCounts },
        stats: {
            flowMedian,
            dropRateAvg,
            peakHourMode
        }
    };
}

function noveltyScore(entity) {
    const e = safeObject(entity);
    const baselineCount = Math.max(0, Number.isFinite(e.baselineCount) ? e.baselineCount : 0);
    const currentCount = Math.max(0, Number.isFinite(e.currentCount) ? e.currentCount : 1);

    const rarity = 1 / (baselineCount + 1);
    const magnitude = Math.min(1, Math.log2(currentCount + 1) / 8);
    const score = 100 * rarity * (0.75 + 0.25 * magnitude);
    return Math.max(0, Math.min(100, Math.round(score)));
}

function diff(currentSnapshot, baseline) {
    const cur = safeObject(currentSnapshot);
    const base = safeObject(baseline);

    const baseHosts = safeObject(base.hostCounts);
    const baseDests = safeObject(base.destinationCounts);
    const basePorts = safeObject(base.portCounts);
    const baseRolePorts = safeObject(base.portCountsByRole);
    const baseSubnetPorts = safeObject(base.portCountsBySubnet);

    const seeds = safeObject(cur.noveltySeeds);
    const curHosts = safeArray(seeds.srcIps).map((v) => String(v)).filter((v) => v);
    const curDests = safeArray(seeds.dstIps).map((v) => String(v)).filter((v) => v);
    const curPorts = safeArray(seeds.dstPorts).map((v) => String(v)).filter((v) => v);

    const newHosts = curHosts.filter((ip) => !baseHosts[ip]).sort((a, b) => a.localeCompare(b));
    const newDestinations = curDests.filter((ip) => !baseDests[ip]).sort((a, b) => a.localeCompare(b));

    const rarePorts = [];
    const usage = normalizePortUsage(cur);

    const pushRare = (kind, key, port, currentCount) => {
        const portKey = String(port);
        if (!portKey) return;
        let baselineCount = 0;
        if (kind === "role") baselineCount = (baseRolePorts[key] && baseRolePorts[key][portKey]) ? baseRolePorts[key][portKey] : 0;
        else if (kind === "subnet") baselineCount = (baseSubnetPorts[key] && baseSubnetPorts[key][portKey]) ? baseSubnetPorts[key][portKey] : 0;
        else baselineCount = basePorts[portKey] || 0;

        if (baselineCount > 1) return;
        rarePorts.push({
            kind,
            key,
            port: portKey,
            baselineCount,
            currentCount: Math.max(0, Number.isFinite(currentCount) ? currentCount : 0),
            noveltyScore: noveltyScore({ baselineCount, currentCount })
        });
    };

    if (usage.byRole.length || usage.bySubnet.length) {
        usage.byRole.forEach((row) => {
            row.ports.forEach((p) => pushRare("role", row.key, p.port, p.count));
        });
        usage.bySubnet.forEach((row) => {
            row.ports.forEach((p) => pushRare("subnet", row.key, p.port, p.count));
        });
    } else {
        curPorts.forEach((p) => pushRare("global", "global", p, 1));
    }

    rarePorts.sort((a, b) => {
        return (a.baselineCount - b.baselineCount) ||
            (b.currentCount - a.currentCount) ||
            (b.noveltyScore - a.noveltyScore) ||
            a.port.localeCompare(b.port) ||
            String(a.key).localeCompare(String(b.key));
    });

    const behaviorShifts = [];
    const totals = safeObject(cur.totals);
    const allow = Number.isFinite(totals.allow) ? totals.allow : null;
    const drop = Number.isFinite(totals.drop) ? totals.drop : null;
    const denom = (allow != null && drop != null) ? (allow + drop) : null;
    const curDropRate = (denom && denom > 0) ? (drop / denom) : null;
    const baseDropAvg = base.stats && Number.isFinite(base.stats.dropRateAvg) ? base.stats.dropRateAvg : null;
    if (curDropRate != null && baseDropAvg != null) {
        const spike = curDropRate > baseDropAvg * 1.5 && curDropRate > (baseDropAvg + 0.15);
        if (spike) {
            behaviorShifts.push({
                type: "drop_rate_spike",
                baselineDropRate: baseDropAvg,
                currentDropRate: curDropRate
            });
        }
    }

    const curFlows = Number.isFinite(totals.flows) ? totals.flows : null;
    const baseFlowMedian = base.stats && Number.isFinite(base.stats.flowMedian) ? base.stats.flowMedian : null;
    if (curFlows != null && baseFlowMedian != null && baseFlowMedian > 0) {
        if (curFlows > baseFlowMedian * 2) {
            behaviorShifts.push({
                type: "volume_spike",
                baselineFlowMedian: baseFlowMedian,
                currentFlows: curFlows
            });
        }
    }

    const curPeak = hourFromSnapshot(cur);
    const basePeak = base.stats && Number.isFinite(base.stats.peakHourMode) ? base.stats.peakHourMode : null;
    if (curPeak != null && basePeak != null) {
        const delta = Math.abs(curPeak - basePeak);
        const circ = Math.min(delta, 24 - delta);
        if (circ >= 6) {
            behaviorShifts.push({
                type: "peak_shift",
                baselinePeakHourUtc: basePeak,
                currentPeakHourUtc: curPeak
            });
        }
    }

    const baseRisky = safeObject(base.riskyIpCounts);
    const curRisk = safeArray(cur.topRiskyEntities);
    const newRiskyEntities = curRisk
        .filter((r) => r && r.ip != null)
        .map((r) => ({
            ip: String(r.ip),
            score: Number.isFinite(r.score) ? r.score : 0,
            level: r.level != null ? String(r.level) : "Unknown",
            baselineCount: baseRisky[String(r.ip)] || 0
        }))
        .filter((r) => r.ip && r.baselineCount === 0)
        .sort((a, b) => b.score - a.score || a.ip.localeCompare(b.ip))
        .slice(0, 5);

    return {
        environmentSignatureMatch: (cur.environmentSignature && base.environmentSignature)
            ? String(cur.environmentSignature) === String(base.environmentSignature)
            : null,
        newHosts,
        newDestinations,
        rarePorts: rarePorts.slice(0, 10),
        behaviorShifts,
        newRiskyEntities
    };
}

export const BaselineEngine = { buildBaseline, diff, noveltyScore };

/* Template-driven hypothesis engine (offline-first, deterministic) */
import { UIUtils } from './UIUtils.js';

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function escapeHtml(value) {
    if (UIUtils?.escapeHtml) {
        return UIUtils.escapeHtml(value);
    }
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatPct(ratio) {
    const n = Number.isFinite(ratio) ? ratio : null;
    if (n === null) return 'n/a';
    return `${(n * 100).toFixed(1)}%`;
}

function computeDropRatio(allow, drop) {
    const a = Number.isFinite(allow) ? allow : 0;
    const d = Number.isFinite(drop) ? drop : 0;
    const denom = a + d;
    return denom > 0 ? d / denom : null;
}

function summarizeTopEntity(stats) {
    const s = safeObject(stats);
    const risk = safeArray(s.risk).filter((r) => r && typeof r.ip === 'string' && r.ip.trim());
    const top = risk.length ? risk[0] : null;
    const ip = top && typeof top.ip === 'string' ? top.ip.trim() : '';
    const score = top && Number.isFinite(top.score) ? top.score : null;
    const level = top && typeof top.level === 'string' ? top.level : null;
    const badges = safeArray(top && top.badges).map((b) => String(b)).filter(Boolean);

    const focus = safeObject(s.focus);
    const focusRow = ip && focus[ip] ? safeObject(focus[ip]) : null;
    const detectors = safeArray(focusRow && focusRow.detectors).map((d) => String(d)).filter(Boolean);
    const focusBadges = safeArray(focusRow && focusRow.badges).map((b) => String(b)).filter(Boolean);

    const mergedBadges = Array.from(new Set(badges.concat(focusBadges))).slice(0, 40);
    const hasThreatIntel = mergedBadges.includes('THREAT_INTEL');

    const drops = focusRow && Number.isFinite(focusRow.drops) ? focusRow.drops : (top && Number.isFinite(top.drops) ? top.drops : 0);
    const allows = focusRow && Number.isFinite(focusRow.allows) ? focusRow.allows : (top && Number.isFinite(top.allows) ? top.allows : 0);
    const dropRatio = computeDropRatio(allows, drops);

    const portCount = focusRow && Number.isFinite(focusRow.portCount) ? focusRow.portCount : (top && Number.isFinite(top.portCount) ? top.portCount : 0);
    const outboundDests = focusRow && Number.isFinite(focusRow.outboundDestCount) ? focusRow.outboundDestCount : (top && Number.isFinite(top.outboundDests) ? top.outboundDests : 0);
    const outboundDrops = focusRow && Number.isFinite(focusRow.outboundDropCount) ? focusRow.outboundDropCount : (top && Number.isFinite(top.outboundDrops) ? top.outboundDrops : 0);

    return {
        ip,
        score,
        level,
        badges: mergedBadges,
        detectors,
        drops,
        allows,
        dropRatio,
        portCount,
        outboundDests,
        outboundDrops
    };
}

function pick(items, limit) {
    const list = safeArray(items);
    const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
    if (!cap) return list.slice();
    return list.slice(0, cap);
}

function stringifyShift(shift) {
    const s = safeObject(shift);
    const type = String(s.type || '');
    if (type === 'drop_rate_spike') {
        return `Drop rate spike (${formatPct(s.baselineDropRate)} → ${formatPct(s.currentDropRate)}).`;
    }
    if (type === 'volume_spike') {
        const base = Number.isFinite(s.baselineFlowMedian) ? s.baselineFlowMedian : null;
        const cur = Number.isFinite(s.currentFlows) ? s.currentFlows : null;
        return `Volume spike (flows ${cur != null ? cur : 'n/a'} vs baseline median ${base != null ? base : 'n/a'}).`;
    }
    if (type === 'peak_shift') {
        const baseHour = Number.isFinite(s.baselinePeakHourUtc) ? s.baselinePeakHourUtc : null;
        const curHour = Number.isFinite(s.currentPeakHourUtc) ? s.currentPeakHourUtc : null;
        return `Peak hour shift (UTC ${baseHour != null ? baseHour : 'n/a'} → ${curHour != null ? curHour : 'n/a'}).`;
    }
    return type ? `Behavior shift: ${type}.` : 'Behavior shift detected.';
}

function generate(input) {
    const inObj = safeObject(input);
    const stats = safeObject(inObj.stats);
    const diff = safeObject(inObj.diff);
    const currentSnapshot = safeObject(inObj.currentSnapshot);
    const compareLabel = typeof inObj.compareLabel === 'string' && inObj.compareLabel.trim() ? inObj.compareLabel.trim() : 'baseline';

    const top = summarizeTopEntity(stats);
    const hasRisk = !!top.ip;

    const hasThreatIntel = hasRisk && Array.isArray(top.badges) && top.badges.includes('THREAT_INTEL');
    const chainHits = safeArray(stats.chains).filter((c) => c && typeof c.ip === 'string' && c.ip === top.ip);

    const newHosts = safeArray(diff.newHosts).map((v) => String(v)).filter(Boolean);
    const newDests = safeArray(diff.newDestinations).map((v) => String(v)).filter(Boolean);
    const rarePorts = safeArray(diff.rarePorts).filter((p) => p && p.port != null);
    const shifts = safeArray(diff.behaviorShifts).filter((s) => s && s.type);

    const peakMinute = safeObject(safeObject(currentSnapshot.peaks).peakMinute);
    const peakTime = peakMinute.time ? String(peakMinute.time) : '';
    const peakCount = Number.isFinite(peakMinute.count) ? peakMinute.count : null;

    const totals = safeObject(currentSnapshot.totals);
    const runDropRatio = computeDropRatio(totals.allow, totals.drop);

    const candidates = [];
    const add = (candidate) => {
        const c = safeObject(candidate);
        const key = String(c.key || '');
        if (!key) return;
        const priority = Number.isFinite(c.priority) ? c.priority : 0;
        const kind = String(c.kind || key);
        const title = String(c.title || '');
        if (!title) return;
        const summary = String(c.summary || '');
        const supporting = safeArray(c.supportingEvidence).map((x) => String(x)).filter(Boolean);
        const missing = safeArray(c.missing).map((x) => String(x)).filter(Boolean);
        candidates.push({
            key,
            kind,
            priority,
            label: String(c.label || 'HYPOTHESIS'),
            title,
            summary,
            supportingEvidence: supporting,
            missing
        });
    };

    if (hasThreatIntel) {
        add({
            key: `ioc:${top.ip}`,
            kind: 'ioc',
            priority: 1000,
            label: 'CONFIRMED',
            title: `Known IOC match (${top.ip})`,
            summary: `This run includes an explicit indicator match (<code>THREAT_INTEL</code>) on ${escapeHtml(top.ip)}.`,
            supportingEvidence: [
                `Badges include THREAT_INTEL for ${top.ip}.`,
                `Top risk profile: ${top.level || 'Unknown'}${top.score != null ? ` (score ${top.score})` : ''}.`,
                `Drops ${top.drops} vs Allows ${top.allows} (drop ratio ${formatPct(top.dropRatio)}).`
            ],
            missing: [
                `Show proof lines for ${top.ip} and confirm the IOC context (which feed/why).`,
                `Investigate outbound destinations for ${top.ip} to determine intent (C2 vs scan).`,
                'Validate asset ownership/role for the source host.'
            ]
        });
    }

    if (hasRisk) {
        const det = Array.isArray(top.detectors) ? top.detectors : [];
        const scannerLike = det.includes('SCANNER') || top.portCount >= 50 || (top.dropRatio != null && top.dropRatio >= 0.85 && top.portCount >= 20);
        if (scannerLike) {
            add({
                key: `scan:${top.ip}`,
                kind: 'scan',
                priority: det.includes('SCANNER') ? 700 : 520,
                label: 'HYPOTHESIS',
                title: `Recon / scanning behavior (${top.ip})`,
                summary: `${escapeHtml(top.ip)} shows patterns consistent with scanning or broad probing across ports.`,
                supportingEvidence: [
                    `Ports touched: ${top.portCount}.`,
                    `Drops ${top.drops} vs Allows ${top.allows} (drop ratio ${formatPct(top.dropRatio)}).`,
                    det.length ? `Detectors: ${det.join(', ')}.` : ''
                ].filter(Boolean),
                missing: [
                    `Confirm whether ${top.ip} is an approved vulnerability scanner (expected ports + schedule).`,
                    `Use <code>investigate ${escapeHtml(top.ip)}</code> to list dropped ports and outbound destinations.`,
                    `If unexpected, pivot to proof lines with <code>show evidence ${escapeHtml(top.ip)}</code>.`
                ]
            });
        }

        const egressLike = det.includes('EGRESS') || top.outboundDests >= 10 || newDests.length >= 5;
        if (egressLike) {
            add({
                key: `egress:${top.ip}`,
                kind: 'egress',
                priority: det.includes('EGRESS') ? 680 : 500,
                label: 'HYPOTHESIS',
                title: `Outbound egress anomaly (${top.ip})`,
                summary: `Outbound destinations from ${escapeHtml(top.ip)} look elevated or newly observed for this case.`,
                supportingEvidence: [
                    `Outbound destinations (focus): ${top.outboundDests} (outbound drops ${top.outboundDrops}).`,
                    newDests.length ? `New destinations vs ${compareLabel}: ${pick(newDests, 5).join(', ')}${newDests.length > 5 ? '…' : ''}.` : '',
                    `Top outbound destinations (run-wide): ${safeArray(inObj.topOutboundDestinations).length ? 'available' : 'see investigate'}.`
                ].filter(Boolean),
                missing: [
                    `Identify which destinations are expected for ${top.ip} (updates, telemetry, vendor services).`,
                    `Use <code>investigate ${escapeHtml(top.ip)}</code> to enumerate outbound destinations and volumes.`,
                    'If destinations are unknown, correlate with DNS/proxy logs (not present in flow logs).'
                ]
            });
        }
    }

    if (chainHits.length) {
        const sample = safeObject(chainHits[0]);
        const desc = sample.desc ? String(sample.desc) : 'blocked → breached';
        add({
            key: `chain:${top.ip}`,
            kind: 'chain',
            priority: 640 + Math.min(50, chainHits.length) * 2,
            label: 'HYPOTHESIS',
            title: `Blocked → breached sequence (${top.ip})`,
            summary: `A chained pattern was detected for ${escapeHtml(top.ip)} (${escapeHtml(desc)}).`,
            supportingEvidence: [
                `Attack chains observed: ${chainHits.length}.`,
                sample.port ? `Port: ${sample.port}.` : '',
                sample.windowSec ? `Window: ${sample.windowSec}s.` : ''
            ].filter(Boolean),
            missing: [
                `Open proof lines around the chain edges with <code>show evidence ${escapeHtml(top.ip)}</code>.`,
                'Confirm that chain edges are same destination/port (not coincidental multi-flow noise).',
                'Correlate with endpoint logs to validate whether “breach” reflects real access.'
            ]
        });
    }

    if (shifts.length || rarePorts.length || newHosts.length || newDests.length) {
        const rareTop = pick(rarePorts, 3).map((p) => String(p && p.port != null ? p.port : '')).filter(Boolean);
        const shiftTop = pick(shifts, 2).map(stringifyShift).filter(Boolean);
        add({
            key: 'novelty:baseline',
            kind: 'novelty',
            priority: 420 + Math.min(50, newDests.length) + Math.min(50, rarePorts.length) + Math.min(30, shifts.length * 10),
            label: 'HYPOTHESIS',
            title: `Novelty vs ${compareLabel}`,
            summary: `This run contains changes that differ from ${compareLabel}; interpret as “new” until checked.`,
            supportingEvidence: [
                newHosts.length ? `New hosts: ${pick(newHosts, 5).join(', ')}${newHosts.length > 5 ? '…' : ''}.` : '',
                newDests.length ? `New destinations: ${pick(newDests, 5).join(', ')}${newDests.length > 5 ? '…' : ''}.` : '',
                rareTop.length ? `Rare ports: ${rareTop.join(', ')}.` : '',
                shiftTop.length ? `Behavior shifts: ${shiftTop.join(' ')}` : ''
            ].filter(Boolean),
            missing: [
                'Confirm that the baseline window matches the same environment/topology (signature match).',
                'Validate whether rare ports are newly deployed services or scanning noise.',
                'Re-run after suppressing known-good traffic with allowlist (if applicable).'
            ]
        });
    }

    if (peakTime || peakCount != null || runDropRatio != null) {
        add({
            key: 'run:shape',
            kind: 'shape',
            priority: 260 + (runDropRatio != null ? Math.round(runDropRatio * 100) : 0) + (peakCount != null ? Math.min(200, peakCount) : 0),
            label: 'HYPOTHESIS',
            title: 'Run shape and timing',
            summary: 'The overall timing and drop/allow balance can hint at policy enforcement vs anomalous bursts.',
            supportingEvidence: [
                runDropRatio != null ? `Run-wide drop ratio: ${formatPct(runDropRatio)}.` : '',
                (peakTime && peakCount != null) ? `Peak minute (UTC): ${peakTime} (${peakCount} flows).` : ''
            ].filter(Boolean),
            missing: [
                'Confirm whether the peak aligns with maintenance windows or load tests.',
                'Compare against the last run to see if this pattern is recurring.',
                'If peaks are unexpected, pivot to a single host using TOP → Explain.'
            ]
        });
    }

    candidates.sort((a, b) => (b.priority - a.priority) || a.key.localeCompare(b.key));

    const selected = [];
    const usedKinds = new Set();
    for (const c of candidates) {
        if (selected.length >= 3) break;
        if (usedKinds.has(c.kind)) continue;
        selected.push(c);
        usedKinds.add(c.kind);
    }

    if (hasRisk && selected.length < 2) {
        selected.push({
            key: `primary:${top.ip || 'unknown'}`,
            kind: 'primary',
            priority: 10,
            label: 'HYPOTHESIS',
            title: top.ip ? `Primary driver: ${top.ip}` : 'Primary driver',
            summary: top.ip ? `The top-scored entity (${escapeHtml(top.ip)}) likely explains most of the risk in this run.` : 'A primary driver could not be identified from this run.',
            supportingEvidence: top.ip ? [
                `Risk profile: ${top.level || 'Unknown'}${top.score != null ? ` (score ${top.score})` : ''}.`,
                `Drops ${top.drops} vs Allows ${top.allows} (drop ratio ${formatPct(top.dropRatio)}).`,
                `Ports touched: ${top.portCount}. Outbound destinations: ${top.outboundDests}.`
            ] : [],
            missing: top.ip ? [
                `Use <code>explain ${escapeHtml(top.ip)}</code> for a structured breakdown.`,
                `Use <code>show evidence ${escapeHtml(top.ip)}</code> for raw log lines.`,
                `Use <code>investigate ${escapeHtml(top.ip)}</code> for guided queries.`
            ] : ['Run analysis to produce a ranked risk list.']
        });
    }

    const evidenceRefs = [];
    if (hasRisk) {
        evidenceRefs.push({ kind: 'stats', source: 'current_run', field: 'risk' });
        evidenceRefs.push({ kind: 'stats', source: 'current_run', field: 'focus', target: top.ip });
    }
    if (hasThreatIntel) {
        evidenceRefs.push({ kind: 'ioc', source: 'current_run', target: top.ip, label: 'THREAT_INTEL' });
    }
    if (chainHits.length) {
        evidenceRefs.push({ kind: 'attack_chain', source: 'current_run', target: top.ip, count: chainHits.length, sample: chainHits[0] });
    } else if (Array.isArray(stats.chains) && stats.chains.length) {
        evidenceRefs.push({ kind: 'stats', source: 'current_run', field: 'chains' });
    }
    if (currentSnapshot && Object.keys(currentSnapshot).length) {
        evidenceRefs.push({ kind: 'snapshot', source: 'case_memory', id: currentSnapshot.id || null, createdAt: currentSnapshot.createdAt || null });
    }
    if (diff && Object.keys(diff).length) {
        evidenceRefs.push({ kind: 'diff', source: 'baseline_engine', label: compareLabel });
    }

    const verdictLabel = hasThreatIntel ? 'CONFIRMED' : (selected.length ? 'HYPOTHESIS' : 'UNKNOWN');

    const because = [];
    if (hasRisk) {
        because.push(`Narratives are template-driven from current stats + ${compareLabel} diff (no freeform generation).`);
        because.push(`Top entity: ${top.ip}${top.level ? ` (${top.level})` : ''}${top.score != null ? ` score ${top.score}` : ''}.`);
        if (hasThreatIntel) because.push('Explicit IOC match present (THREAT_INTEL).');
    } else {
        because.push('No scored entities are present for this run.');
    }

    return {
        verdictLabel,
        narratives: selected,
        because,
        evidenceRefs
    };
}

export const HypothesisEngine = { generate };

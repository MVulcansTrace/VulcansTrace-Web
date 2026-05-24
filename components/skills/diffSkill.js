/**
 * Diff skill handler  
 * Compares current snapshot against baseline or last run
 */

import { BaselineEngine } from '../BaselineEngine.js';
import { escapeHtml, normalizeResponse, getStatsFromContext, getSnapshotHistory, formatPct } from './shared.js';
import { DIFF_LIMITS, UI_LIMITS } from '../constants.js';

/**
 * Diff highlight for ranked changes display
 * @typedef {Object} DiffHighlight
 * @property {string} kind - Highlight type (e.g., 'new_risky_entity', 'behavior_shift')
 * @property {string} key - Unique key for deduplication
 * @property {number} priority - Sort priority (higher = more important)
 * @property {string} html - Rendered HTML content
 * @property {string} [ip] - Related IP address
 */

/**
 * Diff skill handler - compares current snapshot vs baseline/last
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @param {Object} args - Arguments
 * @param {string} [args.scope] - Scope ('last' or empty for baseline)
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */
export function diffHandler(context, args) {
    const scope = args && typeof args.scope === 'string' ? args.scope.trim().toLowerCase() : '';
    const stats = getStatsFromContext(context);
    const history = getSnapshotHistory(context);

    if (typeof BaselineEngine === 'undefined' || !BaselineEngine || typeof BaselineEngine.buildBaseline !== 'function' || typeof BaselineEngine.diff !== 'function') {
        return normalizeResponse({
            title: 'Diff',
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>Baseline engine is unavailable (BaselineEngine missing).</div>`,
            because: ['Diff requires BaselineEngine (not loaded)'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['help', 'top threats']
        });
    }

    if (!history.length) {
        const hasStats = !!stats;
        return normalizeResponse({
            title: 'Diff',
            verdictLabel: hasStats ? 'HYPOTHESIS' : 'UNKNOWN',
            bodyHtml: hasStats
                ? `<div>No stored snapshots yet for this case.</div><div class="text-xs" style="color:var(--text-muted);margin-top:8px;">Run analysis again to create snapshots, then retry <code>compare last</code>.</div>`
                : `<div>No analysis is loaded yet.</div><div class="text-xs" style="color:var(--text-muted);margin-top:8px;">Drop logs and run analysis to create snapshots, then retry <code>compare last</code>.</div>`,
            because: ['Diff compares stored snapshots from case memory'],
            evidenceRefs: [],
            actions: [{ label: 'Top threats', prompt: 'top threats' }],
            followups: ['top threats', 'help']
        });
    }

    const current = history[0];
    const currentAt = current && current.createdAt ? String(current.createdAt) : '';

    const baselineWindow = 10;
    let baselineSnapshots = [];
    let compareLabel = '';
    let baselineLabel = '';

    if (scope === 'last') {
        const prev = history.length > 1 ? history[1] : null;
        if (!prev) {
            return normalizeResponse({
                title: 'Diff vs Last',
                verdictLabel: 'UNKNOWN',
                bodyHtml: `<div>Only one snapshot is available in this case. Run analysis at least twice, then retry <code>compare last</code>.</div>`,
                because: ['Need at least two snapshots to compare last'],
                evidenceRefs: [{ kind: 'snapshot', source: 'case_memory', id: current.id || null, createdAt: current.createdAt || null }],
                actions: [{ label: 'Top threats', prompt: 'top threats' }],
                followups: ['top threats', 'help']
            });
        }
        baselineSnapshots = [prev];
        compareLabel = 'last run';
        baselineLabel = prev && prev.createdAt ? String(prev.createdAt) : 'previous snapshot';
    } else {
        baselineSnapshots = history.slice(1, 1 + baselineWindow);
        compareLabel = `baseline (last ${baselineSnapshots.length} runs)`;
        baselineLabel = baselineSnapshots.length
            ? `runs 2–${baselineSnapshots.length + 1}`
            : 'no baseline';
        if (!baselineSnapshots.length) {
            return normalizeResponse({
                title: 'Diff vs Baseline',
                verdictLabel: 'UNKNOWN',
                bodyHtml: `<div>No baseline snapshots are available yet.</div><div class="text-xs" style="color:var(--text-muted);margin-top:8px;">Run analysis a few more times to build a baseline, then retry.</div>`,
                because: ['Baseline diff needs at least two snapshots (current + baseline history)'],
                evidenceRefs: [{ kind: 'snapshot', source: 'case_memory', id: current.id || null, createdAt: current.createdAt || null }],
                actions: [{ label: 'Top threats', prompt: 'top threats' }],
                followups: ['top threats', 'compare last']
            });
        }
    }

    const baseline = BaselineEngine.buildBaseline(baselineSnapshots);
    const d = BaselineEngine.diff(current, baseline);

    const highlights = [];

    // New risky entities
    const newRisky = Array.isArray(d && d.newRiskyEntities) ? d.newRiskyEntities : [];
    newRisky.forEach((r) => {
        const ip = r && r.ip != null ? String(r.ip) : '';
        if (!ip) return;
        const score = Number.isFinite(r.score) ? r.score : 0;
        const level = r.level != null ? String(r.level) : 'Unknown';
        const bump = /critical/i.test(level) ? 50 : (/high/i.test(level) ? 40 : (/medium/i.test(level) ? 30 : (/low/i.test(level) ? 20 : 10)));
        highlights.push({
            kind: 'new_risky_entity',
            key: `risky:${ip}`,
            ip,
            priority: 300 + bump + Math.min(200, Math.max(0, score)),
            html: `<strong>New risky entity</strong> <code>${escapeHtml(ip)}</code> (${escapeHtml(level)} score ${escapeHtml(score)}).`
        });
    });

    // Behavior shifts
    const shifts = Array.isArray(d && d.behaviorShifts) ? d.behaviorShifts : [];
    shifts.forEach((s) => {
        const type = s && s.type ? String(s.type) : '';
        if (!type) return;
        if (type === 'drop_rate_spike') {
            const baseRate = Number.isFinite(s.baselineDropRate) ? s.baselineDropRate : null;
            const curRate = Number.isFinite(s.currentDropRate) ? s.currentDropRate : null;
            const delta = (baseRate != null && curRate != null) ? (curRate - baseRate) : 0;
            highlights.push({
                kind: 'behavior_shift',
                key: `shift:${type}`,
                priority: 280 + Math.round(Math.max(0, delta) * 100),
                html: `<strong>Drop rate spike</strong> ${escapeHtml(formatPct(baseRate))} → ${escapeHtml(formatPct(curRate))}.`
            });
        } else if (type === 'volume_spike') {
            const baseMedian = Number.isFinite(s.baselineFlowMedian) ? s.baselineFlowMedian : null;
            const curFlows = Number.isFinite(s.currentFlows) ? s.currentFlows : null;
            const ratio = (baseMedian != null && curFlows != null) ? (curFlows / baseMedian) : null;
            highlights.push({
                kind: 'behavior_shift',
                key: `shift:${type}`,
                priority: 260 + (ratio ? Math.round(Math.min(100, Math.max(0, (ratio - 1) * 20))) : 0),
                html: `<strong>Volume spike</strong> ${escapeHtml(curFlows != null ? curFlows : 'n/a')} flows (baseline median ${escapeHtml(baseMedian != null ? baseMedian : 'n/a')}).`
            });
        } else if (type === 'peak_shift') {
            const baseHour = Number.isFinite(s.baselinePeakHourUtc) ? s.baselinePeakHourUtc : null;
            const curHour = Number.isFinite(s.currentPeakHourUtc) ? s.currentPeakHourUtc : null;
            const delta = (baseHour != null && curHour != null) ? Math.abs(curHour - baseHour) : 0;
            highlights.push({
                kind: 'behavior_shift',
                key: `shift:${type}`,
                priority: 240 + Math.min(24, delta) * 4,
                html: `<strong>Peak shift</strong> hour UTC ${escapeHtml(baseHour != null ? baseHour : 'n/a')} → ${escapeHtml(curHour != null ? curHour : 'n/a')}.`
            });
        } else {
            highlights.push({
                kind: 'behavior_shift',
                key: `shift:${type}`,
                priority: 200,
                html: `<strong>Behavior shift</strong> ${escapeHtml(type)}.`
            });
        }
    });

    // Rare ports
    const rarePorts = Array.isArray(d && d.rarePorts) ? d.rarePorts : [];
    rarePorts.forEach((p) => {
        const port = p && p.port != null ? String(p.port) : '';
        if (!port) return;
        const kind = p && p.kind != null ? String(p.kind) : 'global';
        const key = p && p.key != null ? String(p.key) : 'global';
        const baselineCount = Number.isFinite(p.baselineCount) ? p.baselineCount : 0;
        const currentCount = Number.isFinite(p.currentCount) ? p.currentCount : 0;
        const novelty = Number.isFinite(p.noveltyScore) ? p.noveltyScore : 0;
        const where = (kind === 'role') ? `role <code>${escapeHtml(key)}</code>` : (kind === 'subnet') ? `subnet <code>${escapeHtml(key)}</code>` : 'global';
        highlights.push({
            kind: 'rare_port',
            key: `port:${kind}:${key}:${port}`,
            priority: 180 + novelty,
            html: `<strong>Rare port</strong> <code>${escapeHtml(port)}</code> in ${where} (seen ${escapeHtml(currentCount)}; baseline ${escapeHtml(baselineCount)}; novelty ${escapeHtml(novelty)}).`
        });
    });

    // New hosts
    const newHosts = Array.isArray(d && d.newHosts) ? d.newHosts : [];
    newHosts.slice(0, DIFF_LIMITS.NEW_HOSTS_DISPLAY).forEach((ip) => {
        const val = String(ip || '').trim();
        if (!val) return;
        highlights.push({
            kind: 'new_host',
            key: `newhost:${val}`,
            ip: val,
            priority: 120,
            html: `<strong>New host</strong> <code>${escapeHtml(val)}</code> appeared in src seeds.`
        });
    });

    // New destinations
    const newDests = Array.isArray(d && d.newDestinations) ? d.newDestinations : [];
    newDests.slice(0, DIFF_LIMITS.NEW_DESTINATIONS_DISPLAY).forEach((ip) => {
        const val = String(ip || '').trim();
        if (!val) return;
        highlights.push({
            kind: 'new_destination',
            key: `newdest:${val}`,
            ip: val,
            priority: 130,
            html: `<strong>New destination</strong> <code>${escapeHtml(val)}</code> appeared in dst seeds.`
        });
    });

    const signatureMatch = (d && d.environmentSignatureMatch != null) ? !!d.environmentSignatureMatch : null;
    highlights.sort((a, b) => {
        return (b.priority - a.priority) ||
            String(a.key).localeCompare(String(b.key));
    });

    const topHighlights = highlights.slice(0, DIFF_LIMITS.HIGHLIGHTS_MAX);
    const listHtml = topHighlights.length
        ? `<ol class="mb-2">${topHighlights.map((h) => `<li style="margin:6px 0;">${h.html}</li>`).join('')}</ol>`
        : `<div class="mb-2">No notable changes detected for this comparison window.</div>`;

    const focusIps = [];
    const pushFocus = (ip) => {
        const val = String(ip || '').trim();
        if (!val) return;
        if (focusIps.includes(val)) return;
        focusIps.push(val);
    };

    newRisky.slice(0, DIFF_LIMITS.NEW_RISKY_FOCUS).forEach((r) => pushFocus(r && r.ip));
    newDests.slice(0, DIFF_LIMITS.NEW_DESTS_FOCUS).forEach((ip) => pushFocus(ip));
    newHosts.slice(0, DIFF_LIMITS.NEW_HOSTS_FOCUS).forEach((ip) => pushFocus(ip));

    const actions = [];
    focusIps.slice(0, DIFF_LIMITS.FOCUS_IPS_MAX).forEach((ip) => {
        actions.push({ label: `Show proof ${ip}`, prompt: `show evidence ${ip}` });
        actions.push({ label: `Explain ${ip}`, prompt: `explain ${ip}` });
    });
    actions.push({ label: 'Top threats', prompt: 'top threats' });
    actions.push({ label: 'Export evidence', prompt: 'export evidence' });

    const because = [];
    because.push(`Compared current snapshot (${currentAt || 'unknown time'}) against ${compareLabel}.`);
    because.push(`New risky entities: ${newRisky.length}. Rare ports: ${rarePorts.length}. New destinations: ${newDests.length}. New hosts: ${newHosts.length}.`);
    if (signatureMatch === false) because.push('Environment signature mismatch: baseline may be from a different topology/profile.');
    if (signatureMatch === true) because.push('Environment signature matches baseline.');

    const evidenceRefs = [];
    evidenceRefs.push({ kind: 'snapshot', source: 'case_memory', id: current.id || null, createdAt: current.createdAt || null });
    baselineSnapshots.forEach((s) => {
        evidenceRefs.push({ kind: 'snapshot', source: 'case_memory', id: s.id || null, createdAt: s.createdAt || null });
    });
    evidenceRefs.push({ kind: 'baseline', source: 'case_memory', snapshotCount: baseline.snapshotCount || baselineSnapshots.length, environmentSignature: baseline.environmentSignature || null, label: baselineLabel });

    return normalizeResponse({
        title: scope === 'last' ? 'Diff vs Last Run' : 'Diff vs Baseline',
        verdictLabel: 'CONFIRMED',
        bodyHtml: `
                <div class="mb-2">Diff view (offline, deterministic): current snapshot <code>${escapeHtml(currentAt || 'unknown')}</code> vs <code>${escapeHtml(compareLabel)}</code>.</div>
                ${signatureMatch === false ? `<div class="mb-2"><span class="badge b-orange">Signature mismatch</span> <span class="text-xs" style="color:var(--text-muted)">Baseline may be from a different environment; interpret novelty cautiously.</span></div>` : ''}
                <div class="mb-2"><strong>Ranked changes</strong></div>
                ${listHtml}
                <div class="text-xs" style="color:var(--text-muted)">Use the "Show proof" actions to open exact log lines for the highlighted IPs.</div>
            `,
        because,
        evidenceRefs,
        actions: actions.slice(0, UI_LIMITS.ACTIONS_MAX),
        followups: ['compare last', 'top threats', 'export evidence']
    });
}

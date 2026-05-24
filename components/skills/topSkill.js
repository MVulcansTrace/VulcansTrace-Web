/**
 * Top threats skill handler
 * Displays ranked threats and "what's happening" narratives
 */

import { UIUtils } from '../UIUtils.js';
import { HypothesisEngine } from '../HypothesisEngine.js';
import { BaselineEngine } from '../BaselineEngine.js';
import {
    escapeHtml,
    normalizeResponse,
    getStatsFromContext,
    getProfileFromContext,
    getSnapshotHistory,
    renderBadges,
    verdictBadgeClass
} from './shared.js';
import { UI_LIMITS } from '../constants.js';

/**
 * Narrative object for "what's happening" response
 * @typedef {Object} Narrative
 * @property {string} [label] - CONFIRMED/HYPOTHESIS/UNKNOWN
 * @property {string} [title] - Narrative title
 * @property {string} [summary] - Summary text
 * @property {string[]} [supportingEvidence] - Supporting evidence lines
 * @property {string[]} [missing] - Missing evidence lines
 */

/**
 * Render top threats as HTML table
 * @param {import('./shared.js').RiskProfile[]} riskList - Ranked risk profiles
 * @param {number} [limit=5] - Maximum rows to show
 * @returns {string} HTML table string
 */
export function renderTopThreatsTable(riskList, limit) {
    const list = Array.isArray(riskList) ? riskList : [];
    if (!list.length) return `<div class="text-xs" style="color:var(--text-muted)">No scored threats in this run.</div>`;

    const maxRows = Number.isFinite(limit) ? Math.max(0, Math.min(5, Math.floor(limit))) : 5;

    if (typeof UIUtils === 'undefined' || !UIUtils || typeof UIUtils.renderTable !== 'function' || typeof UIUtils.htmlCell !== 'function') {
        const rows = list.slice(0, maxRows).map((r) => {
            const level = r && r.level ? String(r.level) : 'Unknown';
            const score = r && typeof r.score === 'number' ? r.score : 0;
            const drops = r && typeof r.drops === 'number' ? r.drops : 0;
            return `<tr><td>${escapeHtml(r.ip)}</td><td>${escapeHtml(level)}</td><td>${escapeHtml(score)}</td><td>${escapeHtml(drops)}</td></tr>`;
        }).join('');
        return `<div class="table-wrap"><table class="stat-table"><thead><tr><th>IP</th><th>Level</th><th>Score</th><th>Drops</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    const rows = list.slice(0, maxRows).map((r) => {
        const level = r && r.level ? String(r.level) : 'Unknown';
        const levelClass = level === 'Critical' ? 'b-red' : (level === 'High' ? 'b-orange' : (level === 'Medium' ? 'b-purple' : 'b-blue'));
        const badges = r && Array.isArray(r.badges) ? r.badges : [];
        return [
            r.ip,
            UIUtils.htmlCell(`<span class="badge ${levelClass}">${escapeHtml(level)}</span>`),
            typeof r.score === 'number' ? String(r.score) : '0',
            typeof r.drops === 'number' ? String(r.drops) : '0',
            UIUtils.htmlCell(renderBadges(badges, 'b-cyan'))
        ];
    });

    return UIUtils.renderTable(['IP', 'Level', 'Score', 'Drops', 'Badges'], rows);
}

/**
 * Render narrative cards for "what's happening" response
 * @param {Narrative[]} narratives - Array of narrative objects
 * @returns {string} HTML string
 */
export function renderNarrativeCards(narratives) {
    const list = Array.isArray(narratives) ? narratives : [];
    if (!list.length) return `<div>No narratives could be generated from the current run.</div>`;

    return list.map((n) => {
        const label = n && n.label ? String(n.label).toUpperCase() : 'HYPOTHESIS';
        const title = escapeHtml(n && n.title ? n.title : 'Narrative');
        const summary = String(n && n.summary ? n.summary : '');
        const supporting = Array.isArray(n && n.supportingEvidence) ? n.supportingEvidence : [];
        const missing = Array.isArray(n && n.missing) ? n.missing : [];

        const supportingHtml = supporting.length
            ? `<div style="margin-top:8px;"><div class="text-xs" style="color:var(--text-muted);margin-bottom:4px;">Supporting evidence</div><ul class="text-xs" style="margin:0; padding-left:18px;">${supporting.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`
            : '';
        const missingHtml = missing.length
            ? `<div style="margin-top:8px;"><div class="text-xs" style="color:var(--text-muted);margin-bottom:4px;">What's missing</div><ul class="text-xs" style="margin:0; padding-left:18px;">${missing.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`
            : '';

        return `
                <div style="border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.03); border-radius:10px; padding:12px; margin:10px 0;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                        <div style="font-weight:700;">${title}</div>
                        <span class="badge ${verdictBadgeClass(label)}">${escapeHtml(label)}</span>
                    </div>
                    ${summary ? `<div class="text-xs" style="color:var(--text-main);margin-top:8px;">${summary}</div>` : ''}
                    ${supportingHtml}
                    ${missingHtml}
                </div>
            `;
    }).join('');
}

/**
 * Generate "what's happening" narrative response
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */
export function makeHappeningResponse(context) {
    const stats = getStatsFromContext(context);
    const history = getSnapshotHistory(context);

    if (typeof HypothesisEngine === 'undefined' || !HypothesisEngine || typeof HypothesisEngine.generate !== 'function') {
        return normalizeResponse({
            title: `What's happening`,
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>Hypothesis engine is unavailable (HypothesisEngine missing).</div>`,
            because: ['This skill requires HypothesisEngine (not loaded)'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['help', 'top threats']
        });
    }

    if (!stats && !history.length) {
        return normalizeResponse({
            title: `What's happening`,
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>No analysis is loaded yet. Drop logs or load a dataset, then try <code>what's happening</code> again.</div>`,
            because: ['Narratives require an analysis run (no stats/snapshots available)'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['help', 'top threats']
        });
    }

    const current = history.length ? history[0] : null;
    let compareLabel = 'baseline';
    let diff = null;
    let signatureMatch = null;

    if (current && typeof BaselineEngine !== 'undefined' && BaselineEngine && typeof BaselineEngine.buildBaseline === 'function' && typeof BaselineEngine.diff === 'function') {
        const baselineWindow = 10;
        const baselineSnapshots = history.slice(1, 1 + baselineWindow);
        if (baselineSnapshots.length) {
            compareLabel = `baseline (last ${baselineSnapshots.length} runs)`;
            const baseline = BaselineEngine.buildBaseline(baselineSnapshots);
            diff = BaselineEngine.diff(current, baseline);
            signatureMatch = (diff && diff.environmentSignatureMatch != null) ? !!diff.environmentSignatureMatch : null;
        } else if (history.length > 1) {
            compareLabel = 'last run';
            const baseline = BaselineEngine.buildBaseline([history[1]]);
            diff = BaselineEngine.diff(current, baseline);
            signatureMatch = (diff && diff.environmentSignatureMatch != null) ? !!diff.environmentSignatureMatch : null;
        }
    }

    const engineResult = HypothesisEngine.generate({
        stats,
        diff,
        currentSnapshot: current || {},
        compareLabel,
        topOutboundDestinations: current && current.topOutboundDestinations ? current.topOutboundDestinations : []
    });

    const narratives = Array.isArray(engineResult && engineResult.narratives) ? engineResult.narratives : [];
    const cardsHtml = renderNarrativeCards(narratives);

    const risk = stats && Array.isArray(stats.risk) ? stats.risk : [];
    const top = risk && risk[0] ? risk[0] : null;
    const topIp = top && typeof top.ip === 'string' && top.ip.trim() ? top.ip.trim() : '';

    const actions = [];
    if (topIp) {
        actions.push({ label: `Explain ${topIp}`, prompt: `explain ${topIp}` });
        actions.push({ label: `Show proof ${topIp}`, prompt: `show evidence ${topIp}` });
        actions.push({ label: `Investigate ${topIp}`, prompt: `investigate ${topIp}` });
    }
    actions.push({ label: 'Top threats', prompt: 'top threats' });
    actions.push({ label: 'Compare last', prompt: 'compare last' });
    actions.push({ label: 'Export evidence', prompt: 'export evidence' });

    const extraNote = signatureMatch === false
        ? `<div class="mb-2"><span class="badge b-orange">Signature mismatch</span> <span class="text-xs" style="color:var(--text-muted)">Baseline may be from a different environment; interpret novelty cautiously.</span></div>`
        : '';

    const verdictLabel = engineResult && engineResult.verdictLabel ? String(engineResult.verdictLabel).toUpperCase() : 'HYPOTHESIS';

    return normalizeResponse({
        title: `What's happening`,
        verdictLabel: (verdictLabel === 'CONFIRMED' || verdictLabel === 'UNKNOWN') ? verdictLabel : 'HYPOTHESIS',
        bodyHtml: `
                <div class="mb-2">2–3 plausible narratives from current stats + diffs (offline, deterministic). Any story beyond raw counts is labeled as <code>HYPOTHESIS</code> unless an explicit indicator is present.</div>
                ${extraNote}
                ${cardsHtml}
            `,
        because: Array.isArray(engineResult && engineResult.because) ? engineResult.because : [],
        evidenceRefs: Array.isArray(engineResult && engineResult.evidenceRefs) ? engineResult.evidenceRefs : [],
        actions: actions.slice(0, UI_LIMITS.ACTIONS_MAX),
        followups: topIp ? [`explain ${topIp}`, `show evidence ${topIp}`, `investigate ${topIp}`, 'compare last'] : ['top threats', 'compare last']
    });
}

/**
 * Top skill handler - shows ranked threats or narratives
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @param {Object} [args] - Arguments
 * @param {string} [args.mode] - 'happening' or 'narrative' for narrative mode
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */
export function topHandler(context, args) {
    const mode = args && typeof args.mode === 'string' ? args.mode.trim().toLowerCase() : '';
    if (mode === 'happening' || mode === 'narrative') {
        return makeHappeningResponse(context);
    }

    const stats = getStatsFromContext(context);
    const profile = getProfileFromContext(context);
    const risk = stats && Array.isArray(stats.risk) ? stats.risk : [];

    if (!stats) {
        return normalizeResponse({
            title: 'Top Threats',
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>No analysis is loaded yet. Drop logs or load a dataset, then ask again.</div>`,
            because: ['Threat ranking requires an analysis run (no stats available)'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['help', 'top threats']
        });
    }

    const sliceCount = Math.min(5, risk.length);
    const rowsHtml = renderTopThreatsTable(risk, sliceCount || 5);

    const s = stats && stats.s && typeof stats.s === 'object' ? stats.s : {};
    const drops = Number.isFinite(s.drop) ? s.drop : 0;
    const allows = Number.isFinite(s.allow) ? s.allow : 0;
    const total = drops + allows;
    const dropRate = total > 0 ? (drops / total) : 0;

    const peak = s && s.peakMinute && typeof s.peakMinute === 'object' ? s.peakMinute : null;
    const peakTime = peak && typeof peak.time === 'string' ? peak.time : '';
    const peakCount = peak && Number.isFinite(peak.count) ? peak.count : 0;

    const meta = s && s.meta && typeof s.meta === 'object' ? s.meta : null;
    const earliest = meta && Number.isFinite(meta.earliest) ? meta.earliest : 0;
    const latest = meta && Number.isFinite(meta.latest) ? meta.latest : 0;
    const windowMins = (earliest > 0 && latest > 0 && latest >= earliest) ? Math.round((latest - earliest) / 60000) : null;

    const top = risk && risk[0] ? risk[0] : null;
    const topIp = top && typeof top.ip === 'string' ? top.ip : null;
    const topScore = top && Number.isFinite(top.score) ? top.score : 0;
    const topLevel = top && typeof top.level === 'string' ? top.level : 'Unknown';
    const topBadges = top && Array.isArray(top.badges) ? top.badges : [];
    const topPorts = top && Number.isFinite(top.portCount) ? top.portCount : 0;
    const topOutboundDests = top && Number.isFinite(top.outboundDests) ? top.outboundDests : 0;
    const topDrops = top && Number.isFinite(top.drops) ? top.drops : 0;
    const topAllows = top && Number.isFinite(top.allows) ? top.allows : 0;
    const topDropRatio = (topAllows + topDrops) > 0 ? (topDrops / (topAllows + topDrops)) : 0;

    const hasThreatIntel = risk.slice(0, sliceCount || risk.length).some((r) => Array.isArray(r.badges) && r.badges.includes('THREAT_INTEL'));
    const verdictLabel = hasThreatIntel ? 'CONFIRMED' : 'HYPOTHESIS';

    const because = [
        `Ranked by heuristic risk score from the current run${profile ? ` (Profile ${profile})` : ''}.`,
        `Scored entities: ${risk.length}. Showing top ${sliceCount || 0}.`,
        `Run totals: ${drops} drops / ${allows} allows (drop rate ${(dropRate * 100).toFixed(1)}%).`,
        (earliest > 0 && latest > 0 && windowMins !== null)
            ? `Time window: ${new Date(earliest).toISOString()} → ${new Date(latest).toISOString()} (${windowMins} min).`
            : (peakTime ? `Peak minute (UTC): ${peakTime} (${peakCount} flows).` : 'Peak minute unavailable (no timestamps).'),
    ].filter(Boolean);

    if (topIp) {
        const badgeText = topBadges.length ? ` Badges: ${topBadges.join(', ')}.` : '';
        because.push(`Top: ${topIp} score ${topScore} (${topLevel}) — drops ${topDrops}, allows ${topAllows} (drop ratio ${(topDropRatio * 100).toFixed(1)}%), ports ${topPorts}, outbound dests ${topOutboundDests}.${badgeText}`);
    }

    const noteHtml = `<div class="text-xs" style="color:var(--text-muted);margin-top:8px;">Triage only: use <code>explain</code> / <code>show evidence</code> to inspect proof before taking action.</div>`;

    const actions = [];
    if (topIp) {
        actions.push({ label: `Explain ${topIp}`, prompt: `explain ${topIp}` });
        actions.push({ label: `Show proof ${topIp}`, prompt: `show evidence ${topIp}` });
        actions.push({ label: `Investigate ${topIp}`, prompt: `investigate ${topIp}` });
        actions.push({ label: `Remediate ${topIp}`, prompt: `remediate ${topIp}`, danger: true });
        actions.push({ label: `Mark safe ${topIp}`, prompt: `mark safe ${topIp} because ...` });
    } else {
        actions.push({ label: 'Help', prompt: 'help' });
    }

    const followups = [];
    if (topIp) followups.push(`why ${topIp}`);
    followups.push('compare last', 'export evidence');

    return normalizeResponse({
        title: 'Top Threats',
        verdictLabel,
        bodyHtml: `<div class="mb-2">Top scored entities:</div>${rowsHtml}${noteHtml}`,
        because,
        evidenceRefs: [{ kind: 'stats', source: 'current_run', field: 'risk' }],
        actions,
        followups
    });
}

/**
 * Explain skill handler
 * Provides detailed explanation for a focus IP
 */

import { UIUtils } from '../UIUtils.js';
import { LogProcessor } from '../LogProcessor.js';
import { escapeHtml, normalizeResponse, getStatsFromContext } from './shared.js';
import { makeHelpResponse } from './helpSkill.js';

/**
 * Build evidence references for explain response
 * @param {Object} params - Parameters object
 * @param {import('./shared.js').AnalysisStats} [params.stats] - Analysis stats
 * @param {string} params.ip - IP address
 * @param {import('./shared.js').VerdictLabel} params.verdictLabel - Verdict
 * @param {boolean} params.hasThreatIntel - Has THREAT_INTEL badge
 * @param {import('./shared.js').AttackChain[]} params.chainHits - Chain hits
 * @param {import('./shared.js').RiskProfile} [params.riskProfile] - Risk profile
 * @returns {import('./shared.js').EvidenceRef[]} Evidence references
 */
export function buildExplainEvidenceRefs({ stats, ip, verdictLabel, hasThreatIntel, chainHits, riskProfile }) {
    const refs = [];
    refs.push({ kind: 'focus', source: 'current_run', target: ip });
    refs.push({ kind: 'stats', source: 'current_run', field: 'focus', target: ip });

    if (riskProfile && typeof riskProfile === 'object') {
        const snapshot = {
            kind: 'risk_profile',
            source: 'current_run',
            target: ip
        };
        if (typeof riskProfile.level === 'string') snapshot.level = riskProfile.level;
        if (Number.isFinite(riskProfile.score)) snapshot.score = riskProfile.score;
        if (Array.isArray(riskProfile.badges)) snapshot.badges = riskProfile.badges.slice(0, 20);
        refs.push(snapshot);
    } else {
        refs.push({ kind: 'stats', source: 'current_run', field: 'risk', target: ip });
    }

    if (hasThreatIntel) {
        refs.push({ kind: 'ioc', source: 'current_run', target: ip, label: 'THREAT_INTEL' });
    }

    if (Array.isArray(chainHits) && chainHits.length) {
        refs.push({
            kind: 'attack_chain',
            source: 'current_run',
            target: ip,
            count: chainHits.length,
            sample: chainHits[0]
        });
    } else if (stats && Array.isArray(stats.chains) && stats.chains.length) {
        refs.push({ kind: 'stats', source: 'current_run', field: 'chains' });
    }

    refs.push({ kind: 'verdict', source: 'agent', label: verdictLabel });
    return refs;
}

/**
 * Render explain notes with verdict and next checks
 * @param {Object} params - Parameters object
 * @param {import('./shared.js').VerdictLabel} params.verdictLabel - Verdict
 * @param {string} params.ip - IP address
 * @param {boolean} params.hasThreatIntel - Has THREAT_INTEL
 * @param {string[]} params.detectors - Fired detectors
 * @param {string[]} params.badges - Risk badges
 * @param {import('./shared.js').MitreMapping[]} params.mitre - MITRE mappings
 * @param {import('./shared.js').AttackChain[]} params.chainHits - Chain hits
 * @returns {string} HTML string
 */
export function renderExplainNotes({ verdictLabel, ip, hasThreatIntel, detectors, badges, mitre, chainHits }) {
    const rawIp = String(ip || '').trim();
    const detList = Array.isArray(detectors) ? detectors : [];
    const badgeList = Array.isArray(badges) ? badges : [];
    const mitreList = Array.isArray(mitre) ? mitre : [];
    const chains = Array.isArray(chainHits) ? chainHits : [];

    let verdictText = '';
    if (verdictLabel === 'CONFIRMED') {
        verdictText = `This target matches an explicit indicator (THREAT_INTEL) for this run.`;
    } else if (verdictLabel === 'HYPOTHESIS') {
        verdictText = `This looks suspicious based on current-run signals, but is not confirmed malicious.`;
    } else {
        verdictText = `No strong risk signals are present for this target in the current run.`;
    }

    const highlights = [];
    if (hasThreatIntel) highlights.push('Listed as THREAT_INTEL (IOC match).');
    if (!hasThreatIntel && detList.length) highlights.push(`Signals: ${detList.join(', ')}.`);
    if (chains.length) highlights.push(`Attack chain observed: ${chains[0].desc || 'blocked → breached'}.`);
    if (badgeList.length && !hasThreatIntel) highlights.push(`Badges: ${badgeList.join(', ')}.`);

    const nextChecks = [];
    nextChecks.push(`Show proof for ${rawIp} (raw lines around recent activity).`);
    if (detList.includes('SCANNER')) nextChecks.push('Confirm whether this is an approved vulnerability scanner (expected ports + schedule).');
    if (detList.includes('FLOODER')) nextChecks.push('Check whether the traffic spike aligns with load tests or outages (volume vs peak minute).');
    if (detList.includes('EGRESS')) nextChecks.push('Review outbound destinations and whether they are expected for this host/role.');
    if (detList.includes('CHAIN') || chains.length) nextChecks.push('Inspect the blocked→breached sequence: same port, different files, within chain window.');
    if (detList.includes('LATERAL')) nextChecks.push('Validate lateral context: why the same source appears across multiple files/sensors.');
    if (detList.includes('POLICY')) nextChecks.push('Confirm whether sensitive-port ALLOW flows are legitimate exceptions.');
    nextChecks.push('Compare last run to see if this is new or trending.');

    const highlightsHtml = highlights.length
        ? `<div class="text-xs" style="color:var(--text-muted);margin-top:6px;"><strong>Highlights</strong>: ${escapeHtml(highlights.join(' '))}</div>`
        : '';

    const mitreHtml = mitreList.length
        ? `<div class="text-xs" style="color:var(--text-muted);margin-top:6px;"><strong>MITRE</strong>: ${mitreList.map(m => `${escapeHtml(m.id || '')} ${escapeHtml(m.name || '')}`.trim()).filter(Boolean).join(' · ')}</div>`
        : '';

    const nextChecksHtml = nextChecks.map(line => `<li>${escapeHtml(line)}</li>`).join('');

    return `
            <div style="margin-top:10px;">
                <div class="mb-2"><strong>Verdict</strong>: ${escapeHtml(verdictText)}</div>
                ${highlightsHtml}
                ${mitreHtml}
                <div style="margin-top:10px;" class="mb-1"><strong>Next best checks</strong></div>
                <ul class="text-xs" style="margin:0; padding-left:18px; color:var(--text-main);">${nextChecksHtml}</ul>
            </div>
        `;
}

/**
 * Explain skill handler - provides detailed explanation for a focus IP
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @param {Object} args - Arguments
 * @param {string} args.ip - IP address to explain
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */
export function explainHandler(context, args) {
    const rawTarget = args && typeof args.ip === 'string' ? args.ip.trim() : '';
    if (!rawTarget) return makeHelpResponse(context, 'Explain');

    const stats = getStatsFromContext(context);
    if (!stats) {
        return normalizeResponse({
            title: `Explain ${rawTarget}`,
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>No analysis is loaded yet. Drop logs or load a dataset, then try <code>explain ${escapeHtml(rawTarget)}</code> again.</div>`,
            because: ['Explanation requires an analysis run (no stats available)'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['help', 'top threats']
        });
    }

    const riskList = Array.isArray(stats.risk) ? stats.risk : [];
    const isFindingId = /^[0-9]+$/.test(rawTarget);
    let ip = rawTarget;
    if (isFindingId) {
        const idx = parseInt(rawTarget, 10) - 1;
        const row = Number.isFinite(idx) && idx >= 0 && idx < riskList.length ? riskList[idx] : null;
        const resolved = row && typeof row.ip === 'string' ? row.ip.trim() : '';
        if (!resolved) {
            return normalizeResponse({
                title: `Explain Finding ${rawTarget}`,
                verdictLabel: 'UNKNOWN',
                bodyHtml: `<div>Finding <code>${escapeHtml(rawTarget)}</code> is not available in the current TOP list.</div>`,
                because: [
                    `Only the current TOP list is addressable by finding id (1–${riskList.length || 0}).`,
                    'Try: top threats → then explain 1 (or explain <ip>)'
                ],
                evidenceRefs: [{ kind: 'stats', source: 'current_run', field: 'risk' }],
                actions: [{ label: 'Top threats', prompt: 'top threats' }],
                followups: ['top threats', 'help']
            });
        }
        ip = resolved;
    }

    const focus = (typeof LogProcessor !== 'undefined' && LogProcessor && typeof LogProcessor.getFocusDetail === 'function')
        ? LogProcessor.getFocusDetail(stats, ip)
        : null;

    if (!focus) {
        return normalizeResponse({
            title: `Explain ${ip}`,
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>No hits for <code>${escapeHtml(ip)}</code> in the current run.</div>`,
            because: ['The current analysis has no focus record for that target'],
            evidenceRefs: [{ kind: 'stats', source: 'current_run', field: 'focus', target: ip }],
            actions: [{ label: 'Top threats', prompt: 'top threats' }],
            followups: ['top threats', 'compare last']
        });
    }

    const riskProfileFromStats = stats && stats.s && stats.s.src && stats.s.src[ip] && stats.s.src[ip].risk ? stats.s.src[ip].risk : null;
    const riskProfileFromList = riskList.find(r => r && typeof r.ip === 'string' && r.ip === ip) || null;
    const riskProfile = riskProfileFromStats || riskProfileFromList;

    let panelHtml = '';
    if (typeof UIUtils !== 'undefined' && UIUtils && typeof UIUtils.renderFocusPanel === 'function') {
        panelHtml = UIUtils.renderFocusPanel(focus);
    } else {
        panelHtml = `
                <div>
                    <div><strong>${escapeHtml(focus.ip)}</strong> <span class="badge b-blue">${escapeHtml(focus.role || 'Unknown')}</span></div>
                    <div class="text-xs" style="color:var(--text-muted);margin-top:6px;">Drops ${escapeHtml(focus.drops)} · Allows ${escapeHtml(focus.allows)} · Ports ${escapeHtml(focus.portCount)}</div>
                </div>
            `;
    }

    const detectors = Array.isArray(focus.detectors) ? focus.detectors : [];
    const badges = Array.isArray(focus.badges) ? focus.badges : [];
    const mitre = Array.isArray(focus.mitre) ? focus.mitre : [];
    const hasThreatIntel = badges.includes('THREAT_INTEL');

    const drops = Number.isFinite(focus.drops) ? focus.drops : 0;
    const allows = Number.isFinite(focus.allows) ? focus.allows : 0;
    const total = drops + allows;
    const dropRatio = total > 0 ? (drops / total) : 0;

    const score = riskProfile && Number.isFinite(riskProfile.score) ? riskProfile.score : null;
    const level = riskProfile && typeof riskProfile.level === 'string' ? riskProfile.level : null;

    const chainHits = Array.isArray(stats.chains) ? stats.chains.filter(c => c && c.ip === ip) : [];
    const hasSignals = hasThreatIntel
        || (detectors.length > 0)
        || (score !== null && score > 0)
        || (chainHits.length > 0);

    const verdictLabel = hasThreatIntel ? 'CONFIRMED' : (hasSignals ? 'HYPOTHESIS' : 'UNKNOWN');

    const because = [];
    because.push(`Drops ${drops} vs Allows ${allows} (drop ratio ${(dropRatio * 100).toFixed(1)}%).`);
    because.push(`Ports touched: ${focus.portCount}. Outbound dests: ${focus.outboundDestCount || 0} (outbound drops ${focus.outboundDropCount || 0}).`);
    if (score !== null || level) {
        because.push(`Risk profile: ${level || 'Unknown'}${score !== null ? ` (score ${score})` : ''}.`);
    }
    because.push(detectors.length ? `Detectors: ${detectors.join(', ')}.` : 'No detectors fired for this target.');
    if (badges.length) because.push(`Badges: ${badges.join(', ')}.`);
    if (chainHits.length) because.push(`Attack chains: ${chainHits.length} (blocked → breached).`);

    return normalizeResponse({
        title: `Explain ${ip}`,
        verdictLabel,
        bodyHtml: `${panelHtml}${renderExplainNotes({ verdictLabel, ip, hasThreatIntel, detectors, badges, mitre, chainHits })}`,
        because,
        evidenceRefs: buildExplainEvidenceRefs({ stats, ip, verdictLabel, hasThreatIntel, chainHits, riskProfile }),
        actions: [
            { label: `Show proof ${ip}`, prompt: `show evidence ${ip}` },
            { label: `Investigate ${ip}`, prompt: `investigate ${ip}` },
            { label: 'Compare last', prompt: 'compare last' },
            { label: `Remediate ${ip}`, prompt: `remediate ${ip}`, danger: true }
        ],
        followups: [
            `show evidence ${ip}`,
            `investigate ${ip}`,
            `mark safe ${ip} because ...`,
            'compare last',
            'export evidence'
        ]
    });
}

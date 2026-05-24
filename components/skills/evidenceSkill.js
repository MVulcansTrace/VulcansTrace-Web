/**
 * Evidence skill handler
 * Shows proof lines for a focus IP
 */

import { escapeHtml, normalizeResponse, getStatsFromContext } from './shared.js';
import { makeHelpResponse } from './helpSkill.js';

/**
 * Build log line references for a focus IP
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @param {string} focus - IP address to find evidence for
 * @returns {{refs: import('./shared.js').EvidenceRef[], primary: import('./shared.js').EvidenceRef|null}} Refs and primary
 */
export function buildLogLineRefsForFocus(context, focus) {
    const ip = typeof focus === 'string' ? focus.trim() : '';
    if (!ip) return { refs: [], primary: null };

    const db = context && context.db && typeof context.db === 'object' ? context.db : null;
    const inputs = db && Array.isArray(db.inputs) ? db.inputs : [];
    const entries = db && Array.isArray(db.entries) ? db.entries : [];
    if (!entries.length) return { refs: [], primary: null };

    const matches = entries.filter(e => e && (e.src === ip || e.dst === ip) && Number.isFinite(e.line) && e.line > 0);
    if (!matches.length) return { refs: [], primary: null };

    matches.sort((a, b) => {
        const aDrop = a.action === 'DROP' ? 0 : 1;
        const bDrop = b.action === 'DROP' ? 0 : 1;
        if (aDrop !== bDrop) return aDrop - bDrop;
        const aLine = Number.isFinite(a.line) ? a.line : 0;
        const bLine = Number.isFinite(b.line) ? b.line : 0;
        return aLine - bLine;
    });

    const seen = new Set();
    const refs = [];
    for (const m of matches) {
        const fileName = typeof m._file === 'string' && m._file.trim() ? m._file.trim() : 'Unknown';
        const line = Number.isFinite(m.line) ? Math.floor(m.line) : 0;
        if (!line) continue;
        const key = `${fileName}:${line}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const dataset = inputs.find(d => d && typeof d.name === 'string' && d.name === fileName) || null;
        const datasetId = dataset && typeof dataset.id === 'string' ? dataset.id : undefined;

        refs.push({
            kind: 'log_line',
            source: 'input',
            target: ip,
            fileName,
            datasetId,
            line,
            hint: {
                action: m.action || '',
                src: m.src || '',
                dst: m.dst || '',
                dport: m.dport || ''
            }
        });

        if (refs.length >= 3) break;
    }

    return { refs, primary: refs[0] || null };
}

/**
 * Evidence skill handler - shows proof lines for a focus IP
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @param {Object} args - Arguments
 * @param {string} [args.focus] - IP address to find evidence for
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */
export function evidenceHandler(context, args) {
    const focus = args && typeof args.focus === 'string' ? args.focus.trim() : '';
    const fallbackFocus = context && context.state && typeof context.state.lastFocus === 'string' ? context.state.lastFocus.trim() : '';
    const ip = focus || fallbackFocus;
    if (!ip) return makeHelpResponse(context, 'Evidence');

    const db = context && context.db && typeof context.db === 'object' ? context.db : null;
    const inputs = db && Array.isArray(db.inputs) ? db.inputs : [];
    const stats = getStatsFromContext(context);

    const { refs, primary } = buildLogLineRefsForFocus(context, ip);
    const hasInputs = inputs.length > 0;

    const verdictLabel = primary ? 'CONFIRMED' : (hasInputs || stats ? 'HYPOTHESIS' : 'UNKNOWN');

    const because = [];
    if (!hasInputs) because.push('No input files are loaded in this session.');
    if (hasInputs && !primary) because.push('Inputs are loaded, but no matching flow lines were found for this focus.');
    if (primary) because.push(`Opening evidence slice for ${primary.fileName}:${primary.line}.`);

    const hint = primary && primary.hint && typeof primary.hint === 'object' ? primary.hint : null;
    const hintText = hint
        ? `${escapeHtml(hint.action || '?')} ${escapeHtml(hint.src || '?')} → ${escapeHtml(hint.dst || '?')}:${escapeHtml(hint.dport || '?')}`
        : '';

    const bodyHtml = primary
        ? `
                <div class="mb-2">Showing proof lines for focus <code>${escapeHtml(ip)}</code>.</div>
                <div class="text-xs" style="color:var(--text-muted)">File <code>${escapeHtml(primary.fileName)}</code> line <code>${escapeHtml(primary.line)}</code>${hintText ? ` · ${hintText}` : ''}</div>
                ${refs.length > 1 ? `<div class="text-xs" style="color:var(--text-muted);margin-top:8px;">Other refs: ${refs.slice(1).map(r => `<code>${escapeHtml(r.fileName)}:${escapeHtml(r.line)}</code>`).join(' ')}</div>` : ''}
            `
        : `
                <div class="mb-2">No proof slice available for focus <code>${escapeHtml(ip)}</code>.</div>
                <div class="text-xs" style="color:var(--text-muted)">Tip: run analysis on flow logs first, then use <code>top threats</code> → <code>Show proof</code>.</div>
            `;

    // Open evidence modal if available
    if (primary && typeof EvidenceService !== 'undefined' && EvidenceService && typeof EvidenceService.getEvidenceSlice === 'function') {
        try {
            const app = (typeof window !== 'undefined') ? window.logAnalystApp : null;
            const modal = app && app.evidenceSliceModal ? app.evidenceSliceModal : null;
            if (modal && typeof modal.setLoading === 'function' && typeof modal.showSlice === 'function') {
                const meta = `${primary.fileName}:${primary.line}`;
                modal.setLoading(meta);
                modal.open();
                EvidenceService.getEvidenceSlice(primary, 6, context)
                    .then(slice => modal.showSlice(slice))
                    .catch(err => modal.setError(meta, err));
            }
        } catch (e) {
            console.warn('Evidence modal open failed', e);
        }
    }

    return normalizeResponse({
        title: `Evidence ${ip}`,
        verdictLabel,
        bodyHtml,
        because,
        evidenceRefs: refs,
        actions: [
            { label: `Explain ${ip}`, prompt: `explain ${ip}` },
            { label: `Investigate ${ip}`, prompt: `investigate ${ip}` },
            { label: 'Top threats', prompt: 'top threats' },
            { label: 'Export evidence', prompt: 'export evidence' }
        ],
        followups: ['compare last', 'top threats', `explain ${ip}`]
    });
}

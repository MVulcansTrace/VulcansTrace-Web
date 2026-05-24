/**
 * Export skill handler
 * Generates evidence bundle ZIP
 */

import { escapeHtml, normalizeResponse } from './shared.js';
import { UIUtils } from '../UIUtils.js';

/**
 * Export skill handler - generates evidence bundle ZIP
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */
export function exportHandler(context) {
    const core = context && context.core && typeof context.core === 'object' ? context.core : null;
    const db = core && typeof core.getDB === 'function' ? core.getDB() : (core && core.DB ? core.DB : null);
    const inputs = db && Array.isArray(db.inputs) ? db.inputs : [];

    if (!core || !inputs.length) {
        return normalizeResponse({
            title: 'Export Evidence',
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>No datasets loaded. Drop log files or paste logs first.</div>`,
            because: ['Evidence bundle requires at least one ingested dataset'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['help', 'top threats']
        });
    }

    const canGenerate = typeof core.generateEvidence === 'function';
    if (!canGenerate) {
        return normalizeResponse({
            title: 'Export Evidence',
            verdictLabel: 'UNKNOWN',
            bodyHtml: `
                    <div class="mb-2">Evidence bundling is not available in this environment.</div>
                    <div class="text-xs" style="color:var(--text-muted)">The UI "Bundle" button calls <code>core.generateEvidence(...)</code>.</div>
                `,
            because: ['core.generateEvidence is missing'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['help']
        });
    }

    let started = false;
    try {
        started = true;
        (async () => {
            try {
                await core.generateEvidence('', 'Agent export', 'Generated via export evidence command.');
            } catch (e) {
                try {
                    if (typeof UIUtils !== 'undefined' && UIUtils && typeof UIUtils.addBotHTML === 'function') {
                        UIUtils.addBotHTML(`<div style="color:var(--accent-red)">Evidence export failed: ${escapeHtml(e.message || 'Unknown error')}</div>`);
                    }
                } catch { // UIUtils may not be available - continue silently
                }
            }
        })();
    } catch { // Core export may fail in some environments - mark as not started
        started = false;
    }

    return normalizeResponse({
        title: 'Export Evidence',
        verdictLabel: started ? 'CONFIRMED' : 'UNKNOWN',
        bodyHtml: `
                <div class="mb-2">Generating evidence bundle…</div>
                <div class="text-xs" style="color:var(--text-muted)">A ZIP link will appear in the chat when ready. No auto-download; click the link to save it.</div>
            `,
        because: [
            'Bundle includes triage, diff, transcript artifact, and remediation plan (when available).',
            'Offline-first and deterministic for the current case state.'
        ],
        evidenceRefs: [{ kind: 'evidence_bundle', source: 'evidence_generator' }],
        actions: [
            { label: 'Top threats', prompt: 'top threats' },
            { label: 'Compare last', prompt: 'compare last' },
            { label: 'Demo boardroom', prompt: 'demo boardroom' }
        ],
        followups: ['compare last', 'demo boardroom', 'top threats']
    });
}

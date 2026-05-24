/**
 * Demo skill handler
 * Runs guided demo or opens theater mode
 */

import { escapeHtml, normalizeResponse, getStatsFromContext } from './shared.js';
import { UIUtils } from '../UIUtils.js';

/**
 * Demo skill handler - runs guided demo or opens theater mode
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @param {Object} args - Arguments
 * @param {string} [args.mode] - Demo mode ('guided', 'theater', 'boardroom')
 * @param {boolean} [args.forceReset] - Force reset before guided demo
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */
export function demoHandler(context, args) {
    const mode = args && typeof args.mode === 'string' ? args.mode.trim().toLowerCase() : 'theater';

    if (mode === 'guided') {
        const core = context && context.core && typeof context.core === 'object' ? context.core : null;
        if (!core) {
            return normalizeResponse({
                title: 'Guided Demo',
                verdictLabel: 'UNKNOWN',
                bodyHtml: `<div>Guided demo requires a browser UI with an active analysis core.</div>`,
                because: ['No core object is available in this environment'],
                evidenceRefs: [],
                actions: [{ label: 'Help', prompt: 'help' }],
                followups: ['help']
            });
        }

        const hasUi = (typeof document !== 'undefined') && (typeof window !== 'undefined') && (typeof UIUtils !== 'undefined');
        if (!hasUi) {
            return normalizeResponse({
                title: 'Guided Demo',
                verdictLabel: 'UNKNOWN',
                bodyHtml: `
                        <div class="mb-2">Guided demo UI is not available in this environment.</div>
                        <div class="text-xs" style="color:var(--text-muted)">Open <code>index.html</code> in a browser (offline) and try <code>demo guided</code> again.</div>
                    `,
                because: ['Guided demo requires DOM + Blob support'],
                evidenceRefs: [],
                actions: [{ label: 'Help', prompt: 'help' }],
                followups: ['help', 'demo boardroom']
            });
        }

        const db = typeof core.getDB === 'function' ? core.getDB() : (core.DB || null);
        const hasInputs = db && Array.isArray(db.inputs) && db.inputs.length > 0;
        const forceReset = !!(args && args.forceReset);
        if (hasInputs && !forceReset) {
            return normalizeResponse({
                title: 'Guided Demo',
                verdictLabel: 'UNKNOWN',
                bodyHtml: `
                        <div class="mb-2">A dataset is already loaded.</div>
                        <div class="text-xs" style="color:var(--text-muted)">Guided demo needs a clean run so the story is deterministic.</div>
                    `,
                because: ['Reset is required to avoid mixing the demo with existing data'],
                evidenceRefs: [],
                actions: [
                    { label: 'Reset + run guided demo', prompt: 'demo guided reset', danger: true },
                    { label: 'Cancel', prompt: 'help' }
                ],
                followups: ['demo guided reset', 'help']
            });
        }

        let started = false;
        try {
            if (typeof GuidedDemo !== 'undefined' && GuidedDemo && typeof GuidedDemo.run === 'function') {
                started = true;
                (async () => {
                    try {
                        await GuidedDemo.run(core, { forceReset });
                    } catch (e) {
                        try {
                            if (typeof UIUtils !== 'undefined' && UIUtils && typeof UIUtils.addBotHTML === 'function') {
                                UIUtils.addBotHTML(`<div style="color:var(--accent-red)">Guided demo failed: ${escapeHtml(e.message || 'Unknown error')}</div>`);
                            }
                        } catch { // UIUtils may not be available - continue silently
                        }
                    }
                })();
            }
        } catch { // GuidedDemo module may not be available - mark as not started
            started = false;
        }

        return normalizeResponse({
            title: 'Guided Demo',
            verdictLabel: started ? 'CONFIRMED' : 'UNKNOWN',
            bodyHtml: started ? '' : `
                        <div class="mb-2">Guided demo is not available (module missing).</div>
                        <div class="text-xs" style="color:var(--text-muted)">Check that <code>components/GuidedDemo.js</code> is loaded in <code>index.html</code>.</div>
                    `,
            because: [],
            evidenceRefs: [],
            actions: [],
            followups: [],
            silent: started
        });
    }

    if (mode && mode !== 'theater' && mode !== 'boardroom') {
        return normalizeResponse({
            title: 'Demo',
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>Unknown demo mode: <code>${escapeHtml(mode)}</code>. Try <code>demo boardroom</code> or <code>demo guided</code>.</div>`,
            because: ['Supported demo modes: guided, boardroom (theater mode)'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['demo guided', 'demo boardroom', 'help']
        });
    }

    // Theater mode (boardroom)
    const stats = getStatsFromContext(context);
    const hasStats = !!stats;

    let launched = false;
    try {
        const app = (typeof globalThis !== 'undefined' && globalThis.logAnalystApp) ? globalThis.logAnalystApp : null;
        if (app && app.theaterMode && typeof app.theaterMode.open === 'function') {
            app.theaterMode.open();
            launched = true;
        }
    } catch { // Theater mode may not be available in all environments - mark as not launched
        launched = false;
    }

    const verdictLabel = launched ? (hasStats ? 'CONFIRMED' : 'UNKNOWN') : 'UNKNOWN';
    const bodyHtml = launched
        ? `
                <div class="mb-2">Theater Mode opened. Use <code>←</code>/<code>→</code> to navigate and <code>Esc</code> to exit.</div>
                ${hasStats ? `<div class="text-xs" style="color:var(--text-muted)">Slides are built from the current snapshot, triage, diff, hypothesis, and remediation plans.</div>` : `<div class="text-xs" style="color:var(--text-muted)">No analysis is loaded yet; Theater Mode will show a "drop logs" slide.</div>`}
            `
        : `
                <div class="mb-2">Theater Mode UI is not available in this environment.</div>
                <div class="text-xs" style="color:var(--text-muted)">Open <code>index.html</code> in a browser (offline), run analysis, then try <code>demo boardroom</code> again.</div>
            `;

    const actions = [];
    actions.push({ label: 'Top threats', prompt: 'top threats' });
    actions.push({ label: 'Compare last', prompt: 'compare last' });
    actions.push({ label: 'Export evidence', prompt: 'export evidence' });

    return normalizeResponse({
        title: 'Theater Mode',
        verdictLabel,
        bodyHtml,
        because: [
            'Theater Mode is a deterministic slide deck built from current analysis + case memory.',
            'No network calls; no auto-execution.'
        ],
        evidenceRefs: [{ kind: 'ui', target: 'theater_mode' }],
        actions,
        followups: ['top threats', 'compare last', 'export evidence']
    });
}

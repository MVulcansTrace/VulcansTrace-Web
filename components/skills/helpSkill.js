/**
 * Help skill handler
 * Displays available commands and agent capabilities
 */

import { escapeHtml, normalizeResponse, getStatsFromContext } from './shared.js';

/**
 * Generate the help response with command groups and examples
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @param {string} [titleOverride] - Optional title override
 * @returns {import('./shared.js').AgentResponse} Normalized help response
 */
export function makeHelpResponse(context, titleOverride) {
    const title = titleOverride || 'Agent Help';

    const stats = getStatsFromContext(context);
    const analysisStateHtml = stats
        ? `<span class="badge b-green">Analysis loaded</span>`
        : `<span class="badge b-orange">No analysis loaded</span>`;

    const commandGroups = [
        {
            label: 'Core',
            items: [
                { cmd: 'help', desc: 'Show commands and examples' },
                { cmd: 'top threats', also: ['what matters first'], desc: 'Rank what matters first' },
                { cmd: `what's happening`, also: ['whats happening', 'what is happening'], desc: 'Generate 2–3 plausible narratives' },
                { cmd: 'explain 10.0.0.5', also: ['why 10.0.0.5'], desc: 'Explain a host/IP' },
                { cmd: 'show evidence', also: ['show proof'], desc: 'Show proof for last focus' },
                { cmd: 'compare last', also: ['what changed'], desc: 'Diff current vs last' },
                { cmd: 'compare baseline', also: ['diff'], desc: 'Diff current vs baseline' },
                { cmd: 'investigate 10.0.0.5', desc: 'Run safe, predefined queries' }
            ]
        },
        {
            label: 'Learning',
            items: [
                { cmd: 'mark safe 10.0.0.5 because printer', desc: 'Suppress known-good noise' },
                { cmd: 'show allowlist', desc: 'List marked-safe items' }
            ]
        },
        {
            label: 'Actions',
            items: [
                { cmd: 'fix it', desc: 'Remediate last focus (copy/paste only)' },
                { cmd: 'remediate 10.0.0.5', desc: 'Copy/paste remediation plan' },
                { cmd: 'export evidence', desc: 'Bundle evidence ZIP' },
                { cmd: 'demo guided', desc: 'Guided demo (click-only story)' },
                { cmd: 'demo boardroom', desc: 'Theater Mode demo' }
            ]
        }
    ];

    const commandListHtml = commandGroups.map((group) => {
        const itemsHtml = group.items.map((item) => {
            const also = Array.isArray(item.also) && item.also.length
                ? `<div class="text-xs" style="color:var(--text-muted);margin-top:2px;">Also: ${item.also.map(x => `<code>${escapeHtml(x)}</code>`).join(', ')}</div>`
                : '';
            return `
                    <div style="margin:6px 0;">
                        <div style="display:flex;gap:10px;align-items:baseline;">
                            <code style="color:var(--accent-cyan)">${escapeHtml(item.cmd)}</code>
                            <span class="text-xs" style="color:var(--text-muted)">${escapeHtml(item.desc)}</span>
                        </div>
                        ${also}
                    </div>
                `;
        }).join('');

        return `
                <div style="margin-top:10px;">
                    <div class="text-xs" style="color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(group.label)}</div>
                    ${itemsHtml}
                </div>
            `;
    }).join('');

    const examples = [
        'top threats',
        'whats happening',
        'explain 10.0.0.5',
        'show evidence',
        'compare last',
        'remediate 10.0.0.5',
        'export evidence',
        'demo boardroom'
    ];

    const examplesHtml = examples.map((ex) => {
        return `<div style="margin:4px 0;"><code style="color:var(--accent-cyan)">${escapeHtml(ex)}</code></div>`;
    }).join('');

    const bodyHtml = `
            <div class="mb-2" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                <div>Deterministic skill console (offline-first).</div>
                ${analysisStateHtml}
            </div>
            <div class="mb-2 text-xs" style="color:var(--text-muted);">Tip: commands must match exactly (no guessing). If a command is registered but not implemented yet, you will see "Skill Unavailable".</div>
            <div class="mb-2"><strong>Available commands</strong></div>
            ${commandListHtml}
            <div style="margin-top:14px;" class="mb-2"><strong>Examples</strong></div>
            ${examplesHtml}
            <div style="margin-top:14px;" class="mb-2"><strong>What it can do</strong></div>
            <ul style="margin:6px 0 0 18px;">
                <li>Respond using a fixed, allowlisted set of skills.</li>
                <li>Label every answer as <code>CONFIRMED</code>, <code>HYPOTHESIS</code>, or <code>UNKNOWN</code>.</li>
                <li>Offer actions as buttons/chips that only fill the input (no auto-execution).</li>
            </ul>
            <div style="margin-top:12px;" class="mb-2"><strong>What it cannot do</strong></div>
            <ul style="margin:6px 0 0 18px;">
                <li>Cannot access the internet or call external services.</li>
                <li>Cannot execute remediation—only generates copy/paste text.</li>
                <li>Cannot "confirm" claims without proof references.</li>
            </ul>
        `;

    return normalizeResponse({
        title,
        verdictLabel: 'CONFIRMED',
        bodyHtml,
        because: [
            'Commands map deterministically to an allowlisted intent (no guessing)',
            'Offline-first and deterministic: no network calls',
            'No auto-execution: actions are prompts only'
        ],
        evidenceRefs: [],
        actions: [
            { label: 'Top threats', prompt: 'top threats' },
            { label: 'Compare last', prompt: 'compare last' },
            { label: 'Export evidence', prompt: 'export evidence' },
            { label: 'Run guided demo', prompt: 'demo guided' },
            { label: 'Demo boardroom', prompt: 'demo boardroom' }
        ],
        followups: ['top threats', 'explain 10.0.0.5', 'show evidence', 'compare last']
    });
}

/**
 * Help skill handler - shows available commands
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @returns {import('./shared.js').AgentResponse} Normalized help response
 */
export function helpHandler(context) {
    return makeHelpResponse(context);
}

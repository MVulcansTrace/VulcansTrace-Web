/**
 * Allowlist skill handler
 * Displays the current allowlist (noise binder)
 */

import { escapeHtml, normalizeResponse, normalizeIpTarget, getAllowlistFromContext } from './shared.js';

/**
 * Allowlist skill handler - shows current allowlist entries
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */
export function allowlistHandler(context) {
    const allowlist = getAllowlistFromContext(context);
    const rows = allowlist.map((entry) => {
        const ip = entry && (entry.target || entry.ip) ? String(entry.target || entry.ip) : '';
        const reason = entry && typeof entry.reason === 'string' ? entry.reason : '';
        const createdAt = entry && typeof entry.createdAt === 'string' ? entry.createdAt : '';
        return `<tr><td><code>${escapeHtml(ip)}</code></td><td>${escapeHtml(reason || '')}</td><td class="text-xs" style="color:var(--text-muted)">${escapeHtml(createdAt || '')}</td></tr>`;
    }).join('');

    const tableHtml = allowlist.length
        ? `
                <div class="table-wrap" style="margin-top:8px;">
                    <table class="stat-table">
                        <thead><tr><th>IP</th><th>Reason</th><th>Added</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
              `
        : `<div>No allowlist entries yet.</div><div class="text-xs" style="color:var(--text-muted); margin-top:6px;">Use <code>mark safe &lt;ip&gt; because ...</code> or open <strong>Config → Allowlist</strong>.</div>`;

    const lastFocus = context && context.state && typeof context.state.lastFocus === 'string' ? context.state.lastFocus.trim() : '';
    const focusIp = normalizeIpTarget(lastFocus);

    const actions = [];
    if (focusIp) actions.push({ label: `Mark safe ${focusIp}`, prompt: `mark safe ${focusIp} because ...` });
    actions.push({ label: 'Top threats', prompt: 'top threats' });
    actions.push({ label: 'Help', prompt: 'help' });

    return normalizeResponse({
        title: 'Allowlist',
        verdictLabel: 'CONFIRMED',
        bodyHtml: `
                <div class="mb-2">Marked-safe sources (noise binder): <strong>${allowlist.length}</strong>.</div>
                ${tableHtml}
            `,
        because: [
            'Allowlist suppresses scoring for known-good sources.',
            'Review allowlist periodically to avoid hiding real issues.'
        ],
        evidenceRefs: [{ kind: 'config', source: 'local_storage', field: 'allowlist' }],
        actions,
        followups: focusIp ? [`mark safe ${focusIp} because ...`, 'top threats'] : ['top threats', 'help']
    });
}

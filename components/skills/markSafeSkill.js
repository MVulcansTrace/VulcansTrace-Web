/**
 * Mark Safe skill handler
 * Adds IPs to the allowlist (noise binder)
 */

import { escapeHtml, normalizeResponse, normalizeIpTarget, getAllowlistFromContext } from './shared.js';

/**
 * Mark safe skill handler - adds IP to allowlist
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @param {Object} args - Arguments
 * @param {string} [args.target] - IP address to mark safe
 * @param {string} [args.reason] - Reason for marking safe
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */
export function markSafeHandler(context, args) {
    const core = context && context.core && typeof context.core === 'object' ? context.core : null;
    const rawTarget = args && typeof args.target === 'string' ? args.target : '';
    const target = normalizeIpTarget(rawTarget);
    const reason = args && typeof args.reason === 'string' ? args.reason.trim() : '';

    if (!target) {
        return normalizeResponse({
            title: 'Mark Safe',
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>Provide an IP to mark safe. Example: <code>mark safe 10.0.0.5 because printer</code></div>`,
            because: ['Mark-safe requires a valid IPv4 address'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['show allowlist', 'top threats']
        });
    }

    if (!core || typeof core.addAllowlistEntry !== 'function') {
        return normalizeResponse({
            title: `Mark Safe ${target}`,
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>Allowlist storage is unavailable in this session.</div>`,
            because: ['context.core.addAllowlistEntry is missing'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['help']
        });
    }

    const ok = core.addAllowlistEntry(target, reason, true, true);
    const allowlist = getAllowlistFromContext(context);
    const count = allowlist.length;

    const reasonHtml = reason ? `<div class="text-xs" style="color:var(--text-muted); margin-top:6px;">Reason: ${escapeHtml(reason)}</div>` : '';
    const missingReasonHtml = !reason
        ? `<div class="text-xs" style="color:var(--text-muted); margin-top:6px;">Tip: add a short reason so future reviewers know why this is safe.</div>`
        : '';

    return normalizeResponse({
        title: `Marked Safe: ${target}`,
        verdictLabel: ok ? 'CONFIRMED' : 'UNKNOWN',
        bodyHtml: `
                <div><strong>${escapeHtml(target)}</strong> added to the allowlist (noise binder).</div>
                <div class="text-xs" style="color:var(--text-muted); margin-top:6px;">Effect: events where this IP is the source are still counted in totals but are ignored for scoring (TOP, detectors).</div>
                ${reasonHtml}
                ${missingReasonHtml}
                <div class="text-xs" style="color:var(--text-muted); margin-top:8px;">To undo: open <strong>Config → Allowlist</strong> and remove the row.</div>
            `,
        because: [
            'Allowlist entries are user-approved (controlled learning).',
            `Allowlist size: ${count}.`,
            'Changes apply on the next analysis run (existing TOP results come from the last run).'
        ],
        evidenceRefs: [{ kind: 'config', source: 'local_storage', field: 'allowlist', target }],
        actions: [
            { label: 'Show allowlist', prompt: 'show allowlist' },
            { label: 'Top threats', prompt: 'top threats' }
        ],
        followups: ['show allowlist', 'top threats', `mark safe ${target} because ...`]
    });
}

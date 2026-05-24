/**
 * Remediate skill handler
 * Generates copy/paste remediation plans for blocked IPs
 */

import { escapeHtml, normalizeResponse, normalizeIpTarget } from './shared.js';
import { makeHelpResponse } from './helpSkill.js';

/**
 * Remediation plan object
 * @typedef {Object} RemediationPlan
 * @property {string} title - Plan title
 * @property {string} [description] - Plan description
 * @property {string} [risk] - Risk level badge
 * @property {string[]} [warnings] - Warning messages
 * @property {string[]} [commands] - Commands to execute
 * @property {string[]} [rollbackCommands] - Rollback commands
 */

/**
 * Render remediation plans as HTML
 * @param {RemediationPlan[]} plans - Array of remediation plan objects
 * @returns {string} HTML string
 */
export function renderRemediationPlans(plans) {
    const list = Array.isArray(plans) ? plans : [];
    if (!list.length) return '';

    const blockStyle = 'white-space:pre-wrap;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:10px;border-radius:6px;margin:0;';

    return list.map((plan) => {
        const title = escapeHtml(String(plan && plan.title ? plan.title : 'Plan'));
        const desc = escapeHtml(String(plan && plan.description ? plan.description : ''));
        const risk = escapeHtml(String(plan && plan.risk ? plan.risk : ''));
        const warnings = Array.isArray(plan && plan.warnings) ? plan.warnings : [];
        const commands = Array.isArray(plan && plan.commands) ? plan.commands : [];
        const rollback = Array.isArray(plan && plan.rollbackCommands) ? plan.rollbackCommands : [];

        const warningsHtml = warnings.length
            ? `<ul class="text-xs" style="margin:6px 0 0 18px;">${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
            : '<div class="text-xs" style="color:var(--text-muted)">No warnings provided.</div>';

        const commandsText = commands.filter(Boolean).map(x => String(x)).join('\n');
        const rollbackText = rollback.filter(Boolean).map(x => String(x)).join('\n');

        const cmdHtml = commandsText
            ? `<pre style="${blockStyle}"><code>${escapeHtml(commandsText)}</code></pre>`
            : `<div class="text-xs" style="color:var(--text-muted)">No commands available.</div>`;

        const rollbackHtml = rollbackText
            ? `<pre style="${blockStyle}"><code>${escapeHtml(rollbackText)}</code></pre>`
            : `<div class="text-xs" style="color:var(--text-muted)">No rollback commands available.</div>`;

        return `
                <details style="margin-top:10px;">
                    <summary style="cursor:pointer; user-select:none;">
                        <strong>${title}</strong>
                        ${risk ? ` <span class="badge b-orange">${risk}</span>` : ''}
                    </summary>
                    ${desc ? `<div class="text-xs" style="color:var(--text-muted);margin-top:6px;">${desc}</div>` : ''}
                    <div style="margin-top:10px;"><strong>Warnings</strong></div>
                    ${warningsHtml}
                    <div style="margin-top:10px;"><strong>Commands (copy/paste)</strong></div>
                    ${cmdHtml}
                    <div style="margin-top:10px;"><strong>Rollback</strong></div>
                    ${rollbackHtml}
                </details>
            `;
    }).join('');
}

/**
 * Remediate skill handler - generates copy/paste remediation plans
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @param {Object} args - Arguments
 * @param {string} [args.target] - IP address to remediate
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */
export function remediateHandler(context, args) {
    const rawTarget = args && typeof args.target === 'string' ? args.target.trim() : '';
    const fallbackFocus = context && context.state && typeof context.state.lastFocus === 'string' ? context.state.lastFocus.trim() : '';
    const ip = normalizeIpTarget(rawTarget || fallbackFocus);
    if (!ip) return makeHelpResponse(context, 'Remediate');

    if (typeof RemediationService === 'undefined' || !RemediationService || typeof RemediationService.generatePlans !== 'function') {
        return normalizeResponse({
            title: `Remediate ${ip}`,
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>Remediation service is unavailable in this build.</div>`,
            because: ['RemediationService.generatePlans is missing'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['help', `explain ${ip}`]
        });
    }

    const plans = RemediationService.generatePlans(context, ip);
    if (!Array.isArray(plans) || plans.length === 0) {
        return normalizeResponse({
            title: `Remediate ${ip}`,
            verdictLabel: 'UNKNOWN',
            bodyHtml: `
                    <div class="mb-2">No safe remediation plan is available yet for <code>${escapeHtml(ip)}</code>.</div>
                    <div class="text-xs" style="color:var(--text-muted)">Current build only generates firewall block plans for <code>CONFIRMED</code> threat-intel matches (<code>THREAT_INTEL</code>). Use <code>explain</code> / <code>show evidence</code> to validate, then remediate again.</div>
                `,
            because: [
                'Remediation output is gated to confirmed threat intel to avoid risky suggestions',
                'This agent never executes changes; it only produces copy/paste text'
            ],
            evidenceRefs: [],
            actions: [
                { label: `Explain ${ip}`, prompt: `explain ${ip}` },
                { label: `Show proof ${ip}`, prompt: `show evidence ${ip}` },
                { label: `Investigate ${ip}`, prompt: `investigate ${ip}` },
                { label: 'Top threats', prompt: 'top threats' }
            ],
            followups: [`explain ${ip}`, `show evidence ${ip}`, `investigate ${ip}`]
        });
    }

    const plansHtml = renderRemediationPlans(plans);

    return normalizeResponse({
        title: `Remediate ${ip}`,
        verdictLabel: 'CONFIRMED',
        bodyHtml: `
                <div class="mb-2">Copy/paste remediation plans for <code>${escapeHtml(ip)}</code>. Nothing is executed automatically.</div>
                ${plansHtml}
            `,
        because: [
            'Target matches a threat-intel indicator (THREAT_INTEL) in the current analysis',
            'Plans include rollback commands to support safe change control'
        ],
        evidenceRefs: [{ kind: 'risk_badge', ip, badge: 'THREAT_INTEL' }],
        actions: [
            { label: `Show proof ${ip}`, prompt: `show evidence ${ip}` },
            { label: `Investigate ${ip}`, prompt: `investigate ${ip}` },
            { label: 'Export evidence', prompt: 'export evidence' },
            { label: 'Top threats', prompt: 'top threats' }
        ],
        followups: ['export evidence', 'compare last', `investigate ${ip}`]
    });
}

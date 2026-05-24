/* Agent response renderer (single envelope renderer) */
import { UIUtils } from './UIUtils.js';
import { AgentContracts } from './AgentContracts.js';

function escapeHtml(value) {
    if (UIUtils?.escapeHtml) {
        return UIUtils.escapeHtml(value);
    }
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizeBodyHtml(html) {
    const raw = String(html || '');
    if (!raw) return '';

    // Headless / Node.js fallback: strip all tags
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof DOMParser === 'undefined') {
        return raw.replace(/<[^>]+>/g, '');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="sanitize-root">${raw}</div>`, 'text/html');
    const root = doc.getElementById('sanitize-root');
    if (!root) return '';

    const allowedTags = new Set([
        'div', 'span', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i',
        'ul', 'ol', 'li', 'code', 'pre', 'table', 'thead', 'tbody',
        'tr', 'td', 'th', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'details', 'summary', 'button', 'svg', 'use'
    ]);
    const allowedAttrs = new Set([
        'class', 'style', 'href', 'title',
        'data-agent-cmd', 'data-ip', 'data-copy-target'
    ]);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    const toRemove = [];
    let node;
    while ((node = walker.nextNode())) {
        const tag = node.tagName.toLowerCase();
        if (!allowedTags.has(tag)) {
            toRemove.push(node);
            continue;
        }
        for (const attr of Array.from(node.attributes)) {
            const name = attr.name.toLowerCase();
            if (!allowedAttrs.has(name)) {
                node.removeAttribute(attr.name);
                continue;
            }
            if (name === 'href') {
                const val = (node.getAttribute('href') || '').trim().toLowerCase();
                if (val.startsWith('javascript:') || val.startsWith('data:')) {
                    node.removeAttribute('href');
                }
            }
        }
    }
    toRemove.forEach(n => n.remove());
    return root.innerHTML;
}

function verdictBadgeClass(verdictLabel) {
    const v = String(verdictLabel || '').toUpperCase();
    if (v === 'CONFIRMED') return 'b-green';
    if (v === 'HYPOTHESIS') return 'b-orange';
    return 'b-blue';
}

function buildCommandFromAction(action) {
    if (!action) return '';
    if (typeof action.prompt === 'string' && action.prompt.trim()) return action.prompt.trim();
    if (typeof action.command === 'string' && action.command.trim()) return action.command.trim();

    const intent = typeof action.intent === 'string' ? action.intent.trim() : '';
    if (!intent) return '';

    const args = action.args && typeof action.args === 'object' && !Array.isArray(action.args) ? action.args : null;
    if (!args) return intent;

    const parts = [intent];
    if (typeof args.ip === 'string' && args.ip.trim()) parts.push(args.ip.trim());
    else if (typeof args.target === 'string' && args.target.trim()) parts.push(args.target.trim());
    else if (typeof args.scope === 'string' && args.scope.trim()) parts.push(args.scope.trim());
    else if (typeof args.mode === 'string' && args.mode.trim()) parts.push(args.mode.trim());

    return parts.join(' ').trim();
}

function renderActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return '';

    const btns = actions.map((action) => {
        const label = escapeHtml(action && action.label ? action.label : 'Action');
        const cmd = buildCommandFromAction(action);
        const normalizedCmd = String(cmd || '').replace(/\r?\n/g, ' ').trim();
        const safeAttrCmd = escapeHtml(normalizedCmd);
        const disabled = normalizedCmd ? '' : ' disabled';
        const dangerClass = action && action.danger ? ' btn-danger' : ' btn-primary';

        return `<button class="btn${dangerClass}"${disabled} data-agent-cmd="${safeAttrCmd}">${label}</button>`;
    }).join('');

    return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">${btns}</div>`;
}

function renderBecause(because) {
    if (!Array.isArray(because) || because.length === 0) return '';
    const items = because.map(line => `<li>${escapeHtml(line)}</li>`).join('');
    return `
        <div class="mt-2">
            <div class="text-xs" style="color:var(--text-muted); margin-bottom:6px;">Because</div>
            <ul class="text-xs" style="margin:0; padding-left:18px; color:var(--text-main);">${items}</ul>
        </div>
    `;
}

function renderFollowups(followups) {
    if (!Array.isArray(followups) || followups.length === 0) return '';

    const chips = followups.map((text) => {
        const cmd = String(text || '').trim();
        if (!cmd) return '';
        const normalizedCmd = cmd.replace(/\r?\n/g, ' ').trim();
        const safeAttrCmd = escapeHtml(normalizedCmd);
        return `<button class="choice-chip" data-agent-cmd="${safeAttrCmd}">${escapeHtml(cmd)}</button>`;
    }).filter(Boolean).join('');

    if (!chips) return '';
    return `<div class="chip-container">${chips}</div>`;
}

function renderAgentResponse(agentResponse) {
    const normalized = AgentContracts?.normalizeResponse
        ? AgentContracts.normalizeResponse(agentResponse)
        : (agentResponse || {});

    if (AgentContracts?.assertValid) {
        AgentContracts.assertValid(normalized);
    }

    const title = escapeHtml(normalized.title || 'Agent');
    const verdictLabel = String(normalized.verdictLabel || 'UNKNOWN').toUpperCase();
    const verdictClass = verdictBadgeClass(verdictLabel);

    const bodyHtml = sanitizeBodyHtml(normalized.bodyHtml || '');
    const becauseHtml = renderBecause(normalized.because);
    const actionsHtml = renderActions(normalized.actions);
    const followupsHtml = renderFollowups(normalized.followups);

    return `
        <div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
                <div style="font-weight:700;">${title}</div>
                <span class="badge ${verdictClass}">${escapeHtml(verdictLabel)}</span>
            </div>
            <div>${bodyHtml}</div>
            ${becauseHtml}
            ${actionsHtml}
            ${followupsHtml}
        </div>
    `;
}

export const AgentRenderer = { renderAgentResponse, sanitizeBodyHtml };

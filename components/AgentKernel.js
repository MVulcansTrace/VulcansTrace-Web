/* Agent kernel: parse -> dispatch -> normalize -> validate */
import { UIUtils } from './UIUtils.js';
import { AgentContracts } from './AgentContracts.js';
import { AgentChatRouter } from './AgentChatRouter.js';
import { AgentSkills } from './AgentSkills.js';

let defaultsRegistered = false;

function safeString(value) {
    return typeof value === 'string' ? value : (value === null || value === undefined ? '' : String(value));
}

function escapeHtml(value) {
    if (UIUtils?.escapeHtml) {
        return UIUtils.escapeHtml(value);
    }
    return safeString(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function ensureDefaults() {
    if (defaultsRegistered) return;
    if (AgentSkills?.registerDefaults) {
        AgentSkills.registerDefaults();
    }
    defaultsRegistered = true;
}

function normalizeAndValidate(rawResponse) {
    const normalized = AgentContracts?.normalizeResponse
        ? AgentContracts.normalizeResponse(rawResponse)
        : (rawResponse || {});

    if (AgentContracts?.assertValid) {
        AgentContracts.assertValid(normalized);
    }
    return normalized;
}

function makeKernelErrorResponse(err, meta) {
    const msg = err && err.message ? err.message : safeString(err || 'Unknown error');
    const because = ['AgentKernel caught an error while handling your request.'];
    if (meta && meta.intent) because.push(`Intent: ${meta.intent}`);
    if (meta && meta.phase) because.push(`Phase: ${meta.phase}`);

    return normalizeAndValidate({
        title: 'Agent Error',
        verdictLabel: 'UNKNOWN',
        bodyHtml: `<div style="color:var(--accent-red)">Kernel error: ${escapeHtml(msg)}</div>`,
        because,
        evidenceRefs: [],
        actions: [{ label: 'Help', prompt: 'help' }],
        followups: ['help']
    });
}

function handle(context, userText) {
    ensureDefaults();

    const ctx = UIUtils.isPlainObject(context) ? context : {};
    const text = safeString(userText).trim();

    try {
        const parsed = AgentChatRouter?.parse
            ? AgentChatRouter.parse(text, ctx.state || ctx)
            : { intent: 'help', args: {} };

        const intent = parsed && typeof parsed.intent === 'string' && parsed.intent.trim() ? parsed.intent.trim() : 'help';
        const args = parsed && UIUtils.isPlainObject(parsed.args) ? parsed.args : {};

        const skills = AgentSkills?.registry;
        const handlerFn = skills && typeof skills[intent] === 'function' ? skills[intent] : null;

        if (!handlerFn) {
            return normalizeAndValidate({
                title: 'Agent Unavailable',
                verdictLabel: 'UNKNOWN',
                bodyHtml: `<div>Skill registry is unavailable.</div>`,
                because: ['AgentSkills.registry is missing or not initialized'],
                evidenceRefs: [],
                actions: [{ label: 'Help', prompt: 'help' }],
                followups: ['help']
            });
        }

        let rawResponse;
        try {
            rawResponse = handlerFn(ctx, args, text);
        } catch (skillErr) {
            return makeKernelErrorResponse(skillErr, { phase: 'dispatch', intent });
        }

        return normalizeAndValidate(rawResponse);
    } catch (err) {
        return makeKernelErrorResponse(err, { phase: 'kernel' });
    }
}

export const AgentKernel = { handle };

/* Agent response envelope (contracts) */
import { UIUtils } from './UIUtils.js';

const VERDICT_LABELS = new Set(['CONFIRMED', 'HYPOTHESIS', 'UNKNOWN']);

function normalizeStringArray(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }
    if (!Array.isArray(value)) return [];
    return value
        .filter(v => typeof v === 'string')
        .map(v => v.trim())
        .filter(v => v.length > 0);
}

function normalizeObjectArray(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(UIUtils.isPlainObject);
}

function normalizeActions(value) {
    if (!Array.isArray(value)) return [];
    const normalized = [];
    for (const item of value) {
        if (typeof item === 'string') {
            const label = item.trim();
            if (label) normalized.push({ label });
            continue;
        }
        if (!UIUtils.isPlainObject(item)) continue;

        const action = { ...item };
        if (typeof action.label !== 'string') {
            const coerced = action.label === null || action.label === undefined ? '' : String(action.label);
            action.label = coerced.trim();
        } else {
            action.label = action.label.trim();
        }
        if (!action.label) continue;

        if (action.intent !== undefined && typeof action.intent !== 'string') delete action.intent;
        if (action.kind !== undefined && typeof action.kind !== 'string') delete action.kind;
        if (action.id !== undefined && typeof action.id !== 'string') delete action.id;
        if (action.args !== undefined && !UIUtils.isPlainObject(action.args)) delete action.args;
        if (action.danger !== undefined) action.danger = !!action.danger;

        normalized.push(action);
    }
    return normalized;
}

function normalizeResponse(input) {
    if (typeof input === 'string') {
        input = { bodyHtml: input };
    }

    const raw = UIUtils.isPlainObject(input) ? input : {};
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Agent';

    const verdictCandidate = typeof raw.verdictLabel === 'string' ? raw.verdictLabel.trim().toUpperCase() : '';
    const verdictLabel = VERDICT_LABELS.has(verdictCandidate) ? verdictCandidate : 'UNKNOWN';

    const bodyHtml = typeof raw.bodyHtml === 'string'
        ? raw.bodyHtml
        : (typeof raw.body === 'string' ? raw.body : '');

    const because = normalizeStringArray(raw.because);
    const evidenceRefs = normalizeObjectArray(raw.evidenceRefs);
    const actions = normalizeActions(raw.actions);
    const followups = normalizeStringArray(raw.followups);

    const silent = raw.silent === true;

    return { title, verdictLabel, bodyHtml, because, evidenceRefs, actions, followups, silent };
}

function assertValid(response) {
    if (!UIUtils.isPlainObject(response)) throw new Error('AgentResponse must be a plain object');

    if (typeof response.title !== 'string') throw new Error('AgentResponse.title must be a string');
    if (!VERDICT_LABELS.has(response.verdictLabel)) throw new Error('AgentResponse.verdictLabel must be CONFIRMED, HYPOTHESIS, or UNKNOWN');
    if (typeof response.bodyHtml !== 'string') throw new Error('AgentResponse.bodyHtml must be a string');

    if (!Array.isArray(response.because) || response.because.some(x => typeof x !== 'string')) {
        throw new Error('AgentResponse.because must be an array of strings');
    }
    if (!Array.isArray(response.evidenceRefs) || response.evidenceRefs.some(x => !UIUtils.isPlainObject(x))) {
        throw new Error('AgentResponse.evidenceRefs must be an array of objects');
    }
    if (!Array.isArray(response.actions) || response.actions.some(x => !UIUtils.isPlainObject(x) || typeof x.label !== 'string' || !x.label.trim())) {
        throw new Error('AgentResponse.actions must be an array of action objects (each with a non-empty label)');
    }
    if (!Array.isArray(response.followups) || response.followups.some(x => typeof x !== 'string')) {
        throw new Error('AgentResponse.followups must be an array of strings');
    }

    return true;
}

export const AgentContracts = { normalizeResponse, assertValid };

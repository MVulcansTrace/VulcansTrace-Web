/* Deterministic chat router: text -> { intent, args } */
import { NetworkUtils } from './NetworkUtils.js';

function normalizeText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

const SYNONYMS = {
    'show threats': 'top threats',
    'show me the top threats': 'top threats',
    'what are the threats': 'top threats',
    'list threats': 'top threats',
    'analyze ip': 'investigate',
    'check ip': 'investigate',
    'look at': 'investigate',
};

function applySynonyms(text) {
    return SYNONYMS[text] || text;
}

function getLastFocus(state) {
    const s = state && typeof state === 'object' ? state : null;
    if (!s) return null;
    if (typeof s.lastFocus === 'string' && s.lastFocus.trim()) return s.lastFocus.trim();
    if (typeof s.lastFocusIp === 'string' && s.lastFocusIp.trim()) return s.lastFocusIp.trim();
    if (typeof s.focusIp === 'string' && s.focusIp.trim()) return s.focusIp.trim();
    if (typeof s.focus === 'string' && s.focus.trim()) return s.focus.trim();
    return null;
}

function extractIp(text) {
    const raw = String(text || '');
    const match = raw.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
    if (!match) return null;
    const candidate = match[1];

    if (NetworkUtils?.ipToLong) {
        return NetworkUtils.ipToLong(candidate) === null ? null : candidate;
    }

    const parts = candidate.split('.').map(x => parseInt(x, 10));
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null;
    return candidate;
}

function extractTarget(text) {
    const ip = extractIp(text);
    if (ip) return ip;

    const normalized = normalizeText(text);
    if (!normalized) return null;
    const tokens = normalized.split(' ').filter(Boolean);
    if (tokens.length === 0) return null;
    return tokens[0];
}

function extractExplainToken(text) {
    const normalized = normalizeText(text);
    if (!normalized) return null;

    const ip = extractIp(normalized);
    if (ip) return ip;

    const token = normalized.split(' ').filter(Boolean)[0] || '';
    if (/^[0-9]+$/.test(token)) return token; // findingId (1-based), resolved by the explain skill
    return null;
}

function makeIntent(intent, args) {
    return { intent, args: args || {} };
}

function parse(text, state) {
    const normalized = applySynonyms(normalizeText(text));
    const lastFocus = getLastFocus(state);

    if (!normalized) return makeIntent('help', {});

    if (normalized === 'help') return makeIntent('help', {});

    if (normalized === 'what matters first' || normalized === 'top threats') {
        return makeIntent('top', {});
    }

    if (normalized === "what's happening" || normalized === 'whats happening' || normalized === 'what is happening') {
        return makeIntent('top', { mode: 'happening' });
    }

    if (normalized.startsWith('why ')) {
        const token = extractExplainToken(normalized.slice('why '.length));
        if (!token) return makeIntent('help', {});
        return makeIntent('explain', { ip: token });
    }

    if (normalized.startsWith('explain ')) {
        const token = extractExplainToken(normalized.slice('explain '.length));
        if (!token) return makeIntent('help', {});
        return makeIntent('explain', { ip: token });
    }

    if (normalized === 'show proof' || normalized === 'show evidence') {
        return makeIntent('evidence', { focus: lastFocus });
    }

    if (normalized.startsWith('show proof ') || normalized.startsWith('show evidence ')) {
        const ip = extractIp(normalized);
        return makeIntent('evidence', { focus: ip || lastFocus });
    }

    if (normalized === 'compare last' || normalized === 'what changed') {
        return makeIntent('diff', { scope: 'last' });
    }

    if (normalized === 'compare baseline' || normalized === 'diff baseline' || normalized === 'diff') {
        return makeIntent('diff', { scope: 'baseline' });
    }

    if (normalized === 'open query console' || normalized === 'open sql console') {
        const args = {};
        if (lastFocus) args.ip = lastFocus;
        args.mode = 'console';
        return makeIntent('investigate', args);
    }

    if (normalized === 'investigate') {
        if (!lastFocus) return makeIntent('help', {});
        return makeIntent('investigate', { ip: lastFocus });
    }

    if (normalized.startsWith('investigate ')) {
        const ip = extractIp(normalized);
        if (!ip) return makeIntent('help', {});

        const parts = normalized.split(' ').filter(Boolean);
        const ipIndex = parts.indexOf(ip);
        const afterIp = ipIndex >= 0 ? parts.slice(ipIndex + 1) : [];

        const args = { ip };
        if (!afterIp.length) return makeIntent('investigate', args);

        if (afterIp[0] !== 'console') {
            // Deterministic: extra tokens are not accepted unless using "console".
            return makeIntent('help', {});
        }

        args.mode = 'console';
        const remainder = afterIp.slice(1);
        if (!remainder.length) return makeIntent('investigate', args);

        if (remainder.length !== 1) return makeIntent('help', {});

        const token = remainder[0];
        if (token === 'outbound') args.query = 'outbound';
        else if (token === 'dropped' || token === 'ports') args.query = 'dropped';
        else if (token === 'peak' || token === 'window') args.query = 'peak';
        else if (token === 'talkers' || token === 'top') args.query = 'talkers';
        else return makeIntent('help', {});

        return makeIntent('investigate', args);
    }

    if (normalized.startsWith('mark safe ')) {
        const rest = normalized.slice('mark safe '.length).trim();
        if (!rest) return makeIntent('help', {});

        const becauseIdx = rest.indexOf(' because ');
        const targetPart = becauseIdx >= 0 ? rest.slice(0, becauseIdx).trim() : rest;
        const reasonPart = becauseIdx >= 0 ? rest.slice(becauseIdx + ' because '.length).trim() : '';

        const target = extractTarget(targetPart);
        if (!target) return makeIntent('help', {});

        const args = { target };
        if (reasonPart) args.reason = reasonPart;
        return makeIntent('mark_safe', args);
    }

    if (normalized === 'show allowlist') {
        return makeIntent('allowlist', {});
    }

    if (normalized === 'fix it') {
        return makeIntent('remediate', { target: lastFocus });
    }

    if (normalized.startsWith('remediate ')) {
        const target = extractTarget(normalized.slice('remediate '.length));
        return makeIntent('remediate', { target: target || lastFocus });
    }

    if (normalized === 'export evidence') {
        return makeIntent('export', {});
    }

    if (normalized === 'demo guided' || normalized === 'run guided demo' || normalized === 'guided demo') {
        return makeIntent('demo', { mode: 'guided' });
    }

    if (normalized === 'demo guided reset' || normalized === 'demo guided force') {
        return makeIntent('demo', { mode: 'guided', forceReset: true });
    }

    if (normalized === 'demo boardroom') {
        return makeIntent('demo', { mode: 'theater' });
    }

    return makeIntent('help', {});
}

export const AgentChatRouter = { parse };

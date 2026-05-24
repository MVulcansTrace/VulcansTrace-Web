/**
 * Shared utilities for AgentSkills modules
 * Extracted from AgentSkills.js for modular architecture
 * 
 * @module skills/shared
 */

// ============== TYPE DEFINITIONS ==============

/**
 * Verdict label indicating confidence level
 * @typedef {'CONFIRMED'|'HYPOTHESIS'|'UNKNOWN'} VerdictLabel
 */

/**
 * Action button for agent responses
 * @typedef {Object} AgentAction
 * @property {string} label - Button label text
 * @property {string} [prompt] - Command to execute when clicked
 * @property {string} [intent] - Intent identifier
 * @property {string} [kind] - Action kind
 * @property {string} [id] - Action ID
 * @property {Object} [args] - Additional arguments
 * @property {boolean} [danger] - Render as danger/destructive button
 */

/**
 * Evidence reference for agent responses
 * @typedef {Object} EvidenceRef
 * @property {string} kind - Reference type (e.g., 'stats', 'log_line', 'snapshot', 'focus', 'ioc')
 * @property {string} [source] - Data source (e.g., 'current_run', 'case_memory', 'input')
 * @property {string} [target] - Target IP or entity
 * @property {string} [field] - Specific field reference
 * @property {string} [fileName] - Source file name
 * @property {string} [datasetId] - Dataset identifier
 * @property {number} [line] - Line number in source file
 * @property {Object} [hint] - Additional hint data
 * @property {*} [data] - Additional arbitrary data
 */

/**
 * Normalized agent response envelope
 * @typedef {Object} AgentResponse
 * @property {string} title - Response title
 * @property {VerdictLabel} verdictLabel - Confidence label
 * @property {string} bodyHtml - HTML content for display
 * @property {string[]} because - Reasoning statements (evidence chain)
 * @property {EvidenceRef[]} evidenceRefs - Evidence references
 * @property {AgentAction[]} actions - Action buttons
 * @property {string[]} followups - Suggested follow-up commands
 */

/**
 * Agent context passed to skill handlers
 * @typedef {Object} AgentContext
 * @property {Object} [core] - LogAnalystCore instance
 * @property {AgentDatabase} [db] - Database with entries/inputs
 * @property {AnalysisStats} [stats] - Analysis statistics (STATS object)
 * @property {AgentState} [state] - Agent state
 * @property {Snapshot[]} [snapshots] - Snapshot history from case memory
 * @property {string} [profile] - Active profile name
 */

/**
 * Agent state tracking
 * @typedef {Object} AgentState
 * @property {string} [lastFocus] - Last focused IP address
 * @property {string} [lastIntent] - Last executed intent
 */

/**
 * Database structure from LogAnalystCore
 * @typedef {Object} AgentDatabase
 * @property {Object[]} [entries] - Log entries
 * @property {DatasetInput[]} [inputs] - Input datasets
 */

/**
 * Dataset input metadata
 * @typedef {Object} DatasetInput
 * @property {string} [id] - Dataset ID
 * @property {string} [name] - File name
 * @property {number} [size] - File size in bytes
 */

/**
 * Analysis statistics from LogProcessor
 * @typedef {Object} AnalysisStats
 * @property {RiskProfile[]} [risk] - Ranked risk profiles
 * @property {Object} [s] - Summary stats (drop, allow, meta, etc.)
 * @property {AttackChain[]} [chains] - Detected attack chains
 */

/**
 * Risk profile for an IP address
 * @typedef {Object} RiskProfile
 * @property {string} ip - IP address
 * @property {number} score - Computed risk score
 * @property {string} level - Risk level ('Critical'|'High'|'Medium'|'Low')
 * @property {string[]} badges - Risk badges (e.g., 'THREAT_INTEL', 'SCANNER')
 * @property {number} [drops] - Drop count
 * @property {number} [allows] - Allow count
 * @property {number} [portCount] - Distinct ports touched
 * @property {number} [outboundDests] - Outbound destination count
 */

/**
 * Attack chain detection result
 * @typedef {Object} AttackChain
 * @property {string} ip - Source IP
 * @property {string} [desc] - Chain description
 * @property {number} [port] - Target port
 */

/**
 * Analysis snapshot from case memory
 * @typedef {Object} Snapshot
 * @property {string} [id] - Snapshot ID
 * @property {string} [createdAt] - ISO timestamp
 * @property {Object} [stats] - Stats at snapshot time
 * @property {RiskProfile[]} [topRisk] - Top risks at snapshot
 * @property {string[]} [topOutboundDestinations] - Top outbound destinations
 */

/**
 * Allowlist entry for noise suppression
 * @typedef {Object} AllowlistEntry
 * @property {string} [target] - IP address
 * @property {string} [ip] - IP address (legacy alias)
 * @property {string} [reason] - Reason for marking safe
 * @property {string} [createdAt] - ISO timestamp when added
 */

/**
 * Focus detail for IP explanation
 * @typedef {Object} FocusDetail
 * @property {string} ip - IP address
 * @property {string} [role] - Detected role
 * @property {number} [drops] - Drop count
 * @property {number} [allows] - Allow count
 * @property {number} [portCount] - Ports touched
 * @property {number} [outboundDestCount] - Outbound destinations
 * @property {number} [outboundDropCount] - Outbound drops
 * @property {string[]} [detectors] - Fired detectors
 * @property {string[]} [badges] - Risk badges
 * @property {MitreMapping[]} [mitre] - MITRE ATT&CK mappings
 */

/**
 * MITRE ATT&CK technique mapping
 * @typedef {Object} MitreMapping
 * @property {string} id - Technique ID (e.g., 'T1046')
 * @property {string} name - Technique name
 */

// ============== IMPORTS ==============

import { UIUtils } from '../UIUtils.js';
import { AgentContracts } from '../AgentContracts.js';
import { LogProcessor } from '../LogProcessor.js';

// ============== HTML ESCAPING ==============

/**
 * Safely escape HTML entities in a string
 * @param {*} value - Value to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(value) {
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

// ============== RESPONSE NORMALIZATION ==============

/**
 * Normalize a raw skill response using AgentContracts
 * @param {Partial<AgentResponse>} raw - Raw response fields
 * @returns {AgentResponse} Normalized response envelope
 */
export function normalizeResponse(raw) {
    if (AgentContracts?.normalizeResponse) {
        return AgentContracts.normalizeResponse(raw);
    }
    return raw || {};
}

// ============== CONTEXT EXTRACTORS ==============

/**
 * Extract stats object from context
 * @param {AgentContext} context - Agent context
 * @returns {AnalysisStats|null} Stats object or null
 */
export function getStatsFromContext(context) {
    const ctx = context && typeof context === 'object' ? context : null;
    if (!ctx) return null;
    if (ctx.stats && typeof ctx.stats === 'object') return ctx.stats;
    if (ctx.core && typeof ctx.core === 'object') {
        if (ctx.core.STATS && typeof ctx.core.STATS === 'object') return ctx.core.STATS;
        if (ctx.core.stats && typeof ctx.core.stats === 'object') return ctx.core.stats;
    }
    return null;
}

/**
 * Extract profile name from context
 * @param {AgentContext} context - Agent context
 * @returns {string|null} Profile name or null
 */
export function getProfileFromContext(context) {
    const ctx = context && typeof context === 'object' ? context : null;
    if (!ctx) return null;
    if (typeof ctx.profile === 'string' && ctx.profile.trim()) return ctx.profile.trim();
    if (ctx.core && typeof ctx.core === 'object' && typeof ctx.core.profile === 'string' && ctx.core.profile.trim()) return ctx.core.profile.trim();
    if (typeof LogProcessor !== 'undefined' && LogProcessor && typeof LogProcessor.getActiveProfile === 'function') {
        return LogProcessor.getActiveProfile();
    }
    return null;
}

/**
 * Normalize and validate an IP address target
 * @param {string} target - IP address string
 * @returns {string} Validated IP or empty string
 */
export function normalizeIpTarget(target) {
    const ip = typeof target === 'string' ? target.trim() : '';
    if (!ip) return '';

    if (typeof NetworkUtils !== 'undefined' && NetworkUtils && typeof NetworkUtils.ipToLong === 'function') {
        return NetworkUtils.ipToLong(ip) === null ? '' : ip;
    }

    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return '';
    const parts = ip.split('.');
    if (parts.length !== 4) return '';
    for (const part of parts) {
        const n = parseInt(part, 10);
        if (!Number.isFinite(n) || n < 0 || n > 255) return '';
    }
    return ip;
}

/**
 * Extract allowlist from context
 * @param {AgentContext} context - Agent context
 * @returns {AllowlistEntry[]} Allowlist entries
 */
export function getAllowlistFromContext(context) {
    const ctx = context && typeof context === 'object' ? context : null;
    if (!ctx) return [];
    const core = ctx.core && typeof ctx.core === 'object' ? ctx.core : null;
    if (core && typeof core.getAllowlist === 'function') {
        const list = core.getAllowlist();
        return Array.isArray(list) ? list.filter(Boolean) : [];
    }
    const fallback = core && Array.isArray(core.ALLOWLIST) ? core.ALLOWLIST : [];
    return Array.isArray(fallback) ? fallback.filter(Boolean) : [];
}

/**
 * Extract snapshot history from context
 * @param {AgentContext} context - Agent context
 * @returns {Snapshot[]} Snapshot array
 */
export function getSnapshotHistory(context) {
    const ctx = context && typeof context === 'object' ? context : null;
    if (!ctx) return [];

    const direct = Array.isArray(ctx.snapshots) ? ctx.snapshots : null;
    if (direct) return direct.filter((s) => s && typeof s === 'object');

    const core = ctx.core && typeof ctx.core === 'object' ? ctx.core : null;
    if (!core) return [];

    if (typeof core.getSnapshotCache === 'function') {
        const cached = core.getSnapshotCache();
        if (Array.isArray(cached)) return cached.filter((s) => s && typeof s === 'object');
    }

    const fallback = Array.isArray(core.snapshotCache) ? core.snapshotCache : null;
    return fallback ? fallback.filter((s) => s && typeof s === 'object') : [];
}

// ============== RENDERING HELPERS ==============

/**
 * Render badge elements with optional class
 * @param {Array} badges - Badge labels
 * @param {string} badgeClass - CSS class for badges
 * @returns {string} HTML string
 */
export function renderBadges(badges, badgeClass) {
    const list = Array.isArray(badges) ? badges : [];
    if (!list.length) return '<span class="text-xs" style="color:var(--text-muted)">None</span>';
    const cls = badgeClass || 'b-blue';
    return list.map(b => `<span class="badge ${cls}" style="margin-right:6px;">${escapeHtml(b)}</span>`).join('');
}

/**
 * Format a ratio as percentage string
 * @param {number} ratio - Ratio (0-1)
 * @returns {string} Percentage string
 */
export function formatPct(ratio) {
    const n = Number.isFinite(ratio) ? ratio : null;
    if (n === null) return 'n/a';
    return `${(n * 100).toFixed(1)}%`;
}

/**
 * Get CSS class for verdict badge
 * @param {VerdictLabel} verdictLabel - Verdict label
 * @returns {string} CSS class (e.g., 'b-green', 'b-orange', 'b-blue')
 */
export function verdictBadgeClass(verdictLabel) {
    const v = String(verdictLabel || '').toUpperCase();
    if (v === 'CONFIRMED') return 'b-green';
    if (v === 'HYPOTHESIS') return 'b-orange';
    return 'b-blue';
}

// ============== FALLBACK RESPONSES ==============

/**
 * Create response for unimplemented skills
 * @param {string} intent - Intent name
 * @returns {AgentResponse} Normalized response
 */
export function makeNotImplementedResponse(intent) {
    const safeIntent = escapeHtml(intent || '');
    return normalizeResponse({
        title: 'Skill Unavailable',
        verdictLabel: 'UNKNOWN',
        bodyHtml: `<div>This skill is registered but not implemented yet: <code>${safeIntent}</code>.</div>`,
        because: [
            'This phase only wires the allowlist and response envelope',
            'No guessing: unimplemented skills do not improvise'
        ],
        evidenceRefs: [],
        actions: [{ label: 'Help', prompt: 'help' }],
        followups: ['help', 'top threats']
    });
}

/**
 * Create response for unknown intents
 * @param {string} intent - Unknown intent name
 * @returns {AgentResponse} Normalized response
 */
export function makeUnknownIntentResponse(intent) {
    const shown = intent ? `<code>${escapeHtml(intent)}</code>` : '<code>(empty)</code>';
    return normalizeResponse({
        title: 'Unknown Command',
        verdictLabel: 'UNKNOWN',
        bodyHtml: `<div>Unrecognized command intent: ${shown}.</div><div class="text-xs" style="color:var(--text-muted);margin-top:8px;">Try one of the supported commands below.</div>`,
        because: [
            'Commands map deterministically to an allowlisted intent',
            'If parsing fails, the agent does not guess'
        ],
        evidenceRefs: [],
        actions: [
            { label: 'Help', prompt: 'help' },
            { label: 'Top threats', prompt: 'top threats' }
        ],
        followups: ['help', 'top threats', 'compare last', 'export evidence']
    });
}

// ============== INTENTS ALLOWLIST ==============

/**
 * Frozen list of valid intent names
 */
export const INTENTS = Object.freeze([
    'help',
    'top',
    'explain',
    'evidence',
    'diff',
    'investigate',
    'mark_safe',
    'allowlist',
    'remediate',
    'export',
    'demo'
]);

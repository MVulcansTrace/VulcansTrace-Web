/**
 * Investigate skill handler
 * Provides guided investigation queries for a focus IP
 */

import { UIUtils } from '../UIUtils.js';
import { escapeHtml, normalizeResponse } from './shared.js';
import { makeHelpResponse } from './helpSkill.js';
import { UI_LIMITS } from '../constants.js';

/**
 * SQL bundle for investigation queries
 * @typedef {Object} SqlBundle
 * @property {string} [key] - Query key identifier
 * @property {string} [title] - Query title
 * @property {string} [sql] - SQL query string
 */

/**
 * Normalize and validate an IP candidate
 * @param {string} value - IP string to validate
 * @returns {string|null} Valid IP or null
 */
function normalizeIpCandidate(value) {
    const ip = typeof value === 'string' ? value.trim() : '';
    if (!ip) return null;
    if (typeof NetworkUtils !== 'undefined' && NetworkUtils && typeof NetworkUtils.ipToLong === 'function') {
        return NetworkUtils.ipToLong(ip) === null ? null : ip;
    }
    const parts = ip.split('.').map(x => parseInt(x, 10));
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null;
    return ip;
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
    const n = typeof bytes === 'number' ? bytes : parseInt(String(bytes || ''), 10);
    const v = Number.isFinite(n) ? n : 0;
    if (typeof UIUtils !== 'undefined' && UIUtils && typeof UIUtils.formatBytes === 'function') {
        return UIUtils.formatBytes(v);
    }
    return String(v);
}

/**
 * Render SQL bundles as collapsible details
 * @param {SqlBundle[]} sqlBundles - Array of SQL bundle objects
 * @param {string} label - Label for the details summary
 * @returns {string} HTML string
 */
function renderSqlBundlesDetails(sqlBundles, label) {
    const list = Array.isArray(sqlBundles) ? sqlBundles : [];
    if (!list.length) return '';

    const items = list.map((q) => {
        const title = escapeHtml(String(q.title || q.key || 'Query'));
        const sql = escapeHtml(String(q.sql || ''));
        return `
                <div style="margin-top:10px;">
                    <div class="text-xs" style="color:var(--text-muted);margin-bottom:4px;">${title}</div>
                    <pre style="white-space:pre-wrap;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:10px;border-radius:6px;margin:0;"><code>${sql}</code></pre>
                </div>
            `;
    }).join('');

    return `
            <details style="margin-top:12px;">
                <summary style="cursor:pointer; user-select:none;"><strong>${escapeHtml(label || 'SQL templates')}</strong></summary>
                <div class="text-xs" style="color:var(--text-muted);margin-top:6px;">DuckDB tables: <code>flows</code>, <code>cloudtrail</code>, <code>datasets</code>. DuckDB requires <code>npm run dev</code> (not <code>file://</code>).</div>
                ${items}
            </details>
        `;
}

/**
 * Try to open the SQL console with a query
 * @param {string} sql - SQL query
 * @param {string} name - Query name
 * @returns {boolean} Whether modal was opened
 */
function tryOpenSqlConsole(sql, name) {
    try {
        if (typeof window === 'undefined' || typeof document === 'undefined') return false;
        const app = window.logAnalystApp || null;
        const modal = app && app.queryConsoleModal ? app.queryConsoleModal : null;
        if (!modal || typeof modal.open !== 'function') return false;

        if (typeof sql === 'string' && sql.trim()) {
            modal.lastQuery = sql;
        }
        if (typeof name === 'string') {
            modal.lastQueryName = name;
        }

        modal.open();

        const input = document.getElementById('sqlQueryInput');
        if (input && typeof sql === 'string') input.value = sql;
        const nameInput = document.getElementById('sqlQueryNameInput');
        if (nameInput && typeof name === 'string') nameInput.value = name;

        return true;
    } catch { // SQL console modal may not exist in all environments (non-critical, return false)
        return false;
    }
}

/**
 * Investigate skill handler - provides guided investigation queries for an IP
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @param {Object} args - Arguments
 * @param {string} [args.ip] - IP address to investigate
 * @param {string} [args.mode] - Mode ('console' for SQL console)
 * @param {string} [args.query] - Query type ('outbound', 'dropped', 'peak', 'talkers')
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */
export function investigateHandler(context, args) {
    const rawIp = args && typeof args.ip === 'string' ? args.ip.trim() : '';
    const fallbackFocus = context && context.state && typeof context.state.lastFocus === 'string' ? context.state.lastFocus.trim() : '';
    const ip = normalizeIpCandidate(rawIp || fallbackFocus);
    if (!ip) return makeHelpResponse(context, 'Investigate');

    const mode = args && typeof args.mode === 'string' ? args.mode.trim().toLowerCase() : '';
    const query = args && typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';

    const db = context && context.db && typeof context.db === 'object' ? context.db : null;
    const flows = db && Array.isArray(db.entries) ? db.entries : [];

    if (typeof InvestigationQueryLibrary === 'undefined' || !InvestigationQueryLibrary || typeof InvestigationQueryLibrary.computeAll !== 'function') {
        return normalizeResponse({
            title: `Investigate ${ip}`,
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>Investigation query library is unavailable (InvestigationQueryLibrary missing).</div>`,
            because: ['Investigate requires the guided query library (not loaded)'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['help', 'top threats']
        });
    }

    const computed = InvestigationQueryLibrary.computeAll(db, ip);
    const host = computed && typeof computed.host === 'string' ? computed.host : ip;

    // Console mode
    if (mode === 'console') {
        const keyMap = InvestigationQueryLibrary.getQueryKeys ? InvestigationQueryLibrary.getQueryKeys() : (InvestigationQueryLibrary.QUERY_KEYS || {});
        let sqlBundles = [];
        let friendly = 'SQL Console';

        if (query === 'outbound') {
            friendly = `Outbound destinations (${host})`;
            sqlBundles = InvestigationQueryLibrary.buildSqlBundle(keyMap.OUTBOUND_DESTS, { ip: host });
        } else if (query === 'dropped' || query === 'ports') {
            friendly = `Dropped ports (${host})`;
            sqlBundles = InvestigationQueryLibrary.buildSqlBundle(keyMap.DROPPED_PORTS, { ip: host });
        } else if (query === 'peak' || query === 'window') {
            friendly = `Peak minute window (${host})`;
            sqlBundles = InvestigationQueryLibrary.buildSqlBundle(keyMap.PEAK_WINDOW, {
                ip: host,
                peakMinuteIso: computed && computed.peak ? computed.peak.peakMinuteIso : '',
                windowStartIso: computed && computed.peak ? computed.peak.windowStartIso : '',
                windowEndIso: computed && computed.peak ? computed.peak.windowEndIso : ''
            });
        } else if (query === 'talkers' || query === 'top') {
            friendly = 'Top talkers';
            sqlBundles = InvestigationQueryLibrary.buildSqlBundle(keyMap.TOP_TALKERS, {});
        } else {
            friendly = `Outbound destinations (${host})`;
            sqlBundles = InvestigationQueryLibrary.buildSqlBundle(keyMap.OUTBOUND_DESTS, { ip: host });
        }

        const firstSql = sqlBundles && sqlBundles[0] && typeof sqlBundles[0].sql === 'string' ? sqlBundles[0].sql : '';
        const opened = tryOpenSqlConsole(firstSql, `Investigate - ${friendly}`);

        const details = renderSqlBundlesDetails(sqlBundles, 'SQL templates');
        const bodyHtml = `
                <div class="mb-2">${opened ? 'Opened' : 'Prepared'} SQL Console for <code>${escapeHtml(friendly)}</code>.</div>
                <div class="text-xs" style="color:var(--text-muted);">Tip: save the query for this case from the console after you run it.</div>
                ${details}
            `;

        return normalizeResponse({
            title: `SQL Console`,
            verdictLabel: 'CONFIRMED',
            bodyHtml,
            because: [
                'Console actions only prepare local, predefined queries (no freeform SQL generation).',
                opened ? 'Modal opened in the current session.' : 'Modal could not be opened (non-browser or missing modal).'
            ],
            evidenceRefs: sqlBundles.map(q => ({ kind: 'duckdb_query', source: 'investigate', key: q.key || null, title: q.title || null, sql: q.sql || null })),
            actions: [
                { label: `Investigate ${host}`, prompt: `investigate ${host}` },
                { label: 'Open SQL Console', prompt: 'open query console' },
                { label: `Show proof ${host}`, prompt: `show evidence ${host}` }
            ],
            followups: [`investigate ${host}`, `show evidence ${host}`, 'compare last']
        });
    }

    // No flows loaded
    if (!flows.length) {
        return normalizeResponse({
            title: `Investigate ${host}`,
            verdictLabel: 'UNKNOWN',
            bodyHtml: `<div>No flow data is loaded yet.</div><div class="text-xs" style="color:var(--text-muted);margin-top:8px;">Drop flow logs and run analysis, then retry <code>investigate ${escapeHtml(host)}</code>.</div>`,
            because: ['Guided investigations require a loaded dataset (flows)'],
            evidenceRefs: [],
            actions: [{ label: 'Help', prompt: 'help' }],
            followups: ['help', 'top threats']
        });
    }

    // Compute host stats
    let hostFlows = 0;
    let hostDrops = 0;
    for (const e of flows) {
        if (!e || typeof e !== 'object') continue;
        const src = typeof e.src === 'string' ? e.src.trim() : '';
        const dst = typeof e.dst === 'string' ? e.dst.trim() : '';
        if (src !== host && dst !== host) continue;
        hostFlows += 1;
        const action = typeof e.action === 'string' ? e.action.trim().toUpperCase() : '';
        if (action === 'DROP') hostDrops += 1;
    }

    const outbound = computed && computed.outbound ? computed.outbound : null;
    const dropped = computed && computed.dropped ? computed.dropped : null;
    const peak = computed && computed.peak ? computed.peak : null;
    const talkers = computed && computed.talkers ? computed.talkers : null;

    const outboundRows = outbound && Array.isArray(outbound.rows) ? outbound.rows : [];
    const outboundTableRows = outboundRows.map((r) => {
        const bytes = r && r.length >= 5 ? r[4] : 0;
        const formatted = formatBytes(bytes);
        return [r[0], r[1], r[2], r[3], `${formatted} (${bytes})`, r[5]];
    });

    const inboundRows = dropped && Array.isArray(dropped.inboundRows) ? dropped.inboundRows : [];
    const outboundDropRows = dropped && Array.isArray(dropped.outboundRows) ? dropped.outboundRows : [];
    const droppedTableRows = [
        ...inboundRows.slice(0, 10),
        ...outboundDropRows.slice(0, 10)
    ];

    const peakRows = peak && Array.isArray(peak.rows) ? peak.rows : [];
    const talkerRows = talkers && Array.isArray(talkers.rows) ? talkers.rows : [];

    const talkerHasPackets = talkerRows.some((r) => r && r.length >= 3 && Number.isFinite(parseInt(String(r[2] || ''), 10)) && parseInt(String(r[2] || ''), 10) > 0);
    const talkerHeaders = talkerHasPackets
        ? ['Source', 'Bytes', 'Packets', 'Drops', 'Flows']
        : ['Source', 'Bytes', 'Drops', 'Flows'];
    const talkerTable = talkerRows.slice(0, 10).map((r) => {
        const bytes = r && r.length >= 2 ? r[1] : 0;
        const formatted = formatBytes(bytes);
        if (talkerHasPackets) return [r[0], `${formatted} (${bytes})`, r[2], r[3], r[4]];
        return [r[0], `${formatted} (${bytes})`, r[3], r[4]];
    });

    let bodyHtml = `
            <div class="mb-2">Guided investigation for <code>${escapeHtml(host)}</code> (current run).</div>
            <div class="text-xs" style="color:var(--text-muted);margin-bottom:10px;">These summaries are computed deterministically from the loaded <code>flows</code> dataset. Use the SQL Console to reproduce the same pivots in DuckDB.</div>
        `;

    bodyHtml += `
            <div class="mb-3">
                <div class="font-bold mb-1" style="color:var(--accent-cyan)">Outbound destinations</div>
                <div class="text-xs" style="color:var(--text-muted);margin-bottom:6px;">Distinct destinations: ${escapeHtml(outbound && typeof outbound.distinctDestinations === 'number' ? outbound.distinctDestinations : 0)} (top shown).</div>
                ${typeof UIUtils !== 'undefined' && UIUtils && typeof UIUtils.renderTable === 'function'
            ? UIUtils.renderTable(['Destination', 'Flows', 'Drops', 'Allows', 'Bytes', 'Ports'], outboundTableRows.slice(0, 12))
            : ''}
            </div>
        `;

    bodyHtml += `
            <div class="mb-3">
                <div class="font-bold mb-1" style="color:var(--accent-orange)">Dropped ports</div>
                <div class="text-xs" style="color:var(--text-muted);margin-bottom:6px;">Inbound and outbound drop counts by <code>proto</code>/<code>dport</code> (top shown).</div>
                ${typeof UIUtils !== 'undefined' && UIUtils && typeof UIUtils.renderTable === 'function'
            ? UIUtils.renderTable(['Direction', 'Proto', 'Port', 'Drops', 'Top peer'], droppedTableRows.slice(0, 16))
            : ''}
            </div>
        `;

    if (peak && peak.peakMinuteIso) {
        bodyHtml += `
                <div class="mb-3">
                    <div class="font-bold mb-1" style="color:var(--accent-purple)">Peak-minute window</div>
                    <div class="text-xs" style="color:var(--text-muted);margin-bottom:6px;">Peak minute (UTC): <code>${escapeHtml(peak.peakMinuteIso)}</code> · window: <code>${escapeHtml(peak.windowStartIso)}</code> → <code>${escapeHtml(peak.windowEndIso)}</code>.</div>
                    ${typeof UIUtils !== 'undefined' && UIUtils && typeof UIUtils.renderTable === 'function'
                ? UIUtils.renderTable(['Time', 'Dir', 'Peer', 'Action', 'Proto', 'DPort', 'Bytes'], peakRows.slice(0, 10))
                : ''}
                </div>
            `;
    } else {
        bodyHtml += `
                <div class="mb-3">
                    <div class="font-bold mb-1" style="color:var(--accent-purple)">Peak-minute window</div>
                    <div class="text-xs" style="color:var(--text-muted)">No timestamps available for this host in the current dataset.</div>
                </div>
            `;
    }

    bodyHtml += `
            <div class="mb-3">
                <div class="font-bold mb-1" style="color:var(--accent-cyan)">Top talkers</div>
                <div class="text-xs" style="color:var(--text-muted);margin-bottom:6px;">Top sources by bytes (and drops/flows). Packets appear only if present in the dataset.</div>
                ${typeof UIUtils !== 'undefined' && UIUtils && typeof UIUtils.renderTable === 'function'
            ? UIUtils.renderTable(talkerHeaders, talkerTable)
            : ''}
            </div>
        `;

    const sqlBundles = []
        .concat((computed && computed.sql && Array.isArray(computed.sql.outbound) ? computed.sql.outbound : []))
        .concat((computed && computed.sql && Array.isArray(computed.sql.dropped) ? computed.sql.dropped : []))
        .concat((computed && computed.sql && Array.isArray(computed.sql.peak) ? computed.sql.peak : []))
        .concat((computed && computed.sql && Array.isArray(computed.sql.talkers) ? computed.sql.talkers : []));

    bodyHtml += renderSqlBundlesDetails(sqlBundles, 'SQL templates (DuckDB)');

    const because = [
        `Flows loaded: ${flows.length}.`,
        `Host flows (src or dst = ${host}): ${hostFlows} (drops ${hostDrops}).`,
        outbound && typeof outbound.distinctDestinations === 'number' ? `Outbound distinct destinations: ${outbound.distinctDestinations}.` : null,
        peak && peak.peakMinuteIso ? `Peak minute (UTC): ${peak.peakMinuteIso}.` : 'Peak minute unavailable (no timestamps).'
    ].filter(Boolean);

    const evidenceRefs = [
        { kind: 'flows', source: 'current_run', target: host, totalFlows: flows.length, hostFlows, hostDrops },
        ...sqlBundles.map(q => ({ kind: 'duckdb_query', source: 'investigate', key: q.key || null, title: q.title || null, sql: q.sql || null }))
    ];

    return normalizeResponse({
        title: `Investigate ${host}`,
        verdictLabel: 'CONFIRMED',
        bodyHtml,
        because,
        evidenceRefs,
        actions: [
            { label: `Open SQL Console (Outbound)`, prompt: `investigate ${host} console outbound` },
            { label: `Show proof ${host}`, prompt: `show evidence ${host}` },
            { label: `Explain ${host}`, prompt: `explain ${host}` },
            { label: 'Compare last', prompt: 'compare last' }
        ],
        followups: [
            `investigate ${host} console dropped`,
            `investigate ${host} console peak`,
            `show evidence ${host}`,
            'compare last',
            'export evidence'
        ]
    });
}

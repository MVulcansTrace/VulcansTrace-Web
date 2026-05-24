/**
 * Centralized constants for VulcansTrace
 * Extracted from various components for maintainability
 * 
 * @module constants
 */

// ============== UI DISPLAY LIMITS ==============

/**
 * Limits for UI display elements (row counts, list items)
 */
export const UI_LIMITS = Object.freeze({
    /** Default number of top threats to display */
    TOP_THREATS_DEFAULT: 5,
    /** Default table row count */
    TABLE_ROWS_DEFAULT: 10,
    /** Large table row count */
    TABLE_ROWS_LARGE: 16,
    /** Outbound destinations table rows */
    OUTBOUND_DESTINATIONS: 12,
    /** Maximum badges to display per item */
    BADGES_DISPLAY: 20,
    /** Maximum action buttons per response */
    ACTIONS_MAX: 10,
    /** Maximum followup suggestions */
    FOLLOWUPS_MAX: 10,
    /** Suggested remediation IPs */
    REMEDIATION_SUGGESTIONS: 8,
});

// ============== ANALYSIS LIMITS ==============

/**
 * Limits for analysis processing
 */
export const ANALYSIS_LIMITS = Object.freeze({
    /** Maximum snapshots to keep in cache */
    SNAPSHOT_CACHE_MAX: 200,
    /** Top outbound destinations to track */
    TOP_OUTBOUND_DESTS: 25,
    /** Top sources to track */
    TOP_SOURCES: 25,
    /** Top ports to track */
    TOP_PORTS: 50,
    /** Lines to preview for format detection */
    PREVIEW_LINES: 100,
    /** Yield every N lines during parsing (for UI responsiveness) */
    CHUNK_YIELD_LINES: 5000,
    /** Maximum paste size in bytes (256KB) */
    MAX_PASTE_BYTES: 256 * 1024,
    /** Ports to show in port list */
    PORTS_LIST_DISPLAY: 6,
    /** Maximum merged badges */
    MERGED_BADGES_MAX: 40,
});

// ============== TIMEOUTS (milliseconds) ==============

/**
 * Timeout values for async operations
 */
export const TIMEOUTS = Object.freeze({
    /** Analysis completion timeout */
    ANALYSIS_MS: 25000,
    /** Demo wait for analysis timeout */
    DEMO_WAIT_MS: 20000,
    /** Button feedback display duration */
    BUTTON_FEEDBACK_MS: 1200,
    /** Pulse de-escalation delay */
    PULSE_DE_ESCALATION_MS: 45000,
    /** Demo overlay close animation */
    DEMO_OVERLAY_CLOSE_MS: 400,
    /** Demo start delay */
    DEMO_START_DELAY_MS: 500,
});

// ============== SQL QUERY LIMITS ==============

/**
 * LIMIT values for SQL queries
 */
export const SQL_LIMITS = Object.freeze({
    /** Default query result limit */
    QUERY_RESULTS_DEFAULT: 20,
    /** Small query result limit */
    QUERY_RESULTS_SMALL: 10,
    /** Large query result limit */
    QUERY_RESULTS_LARGE: 50,
    /** Peak window query results */
    PEAK_WINDOW_RESULTS: 200,
    /** Saved queries display limit */
    SAVED_QUERIES_DISPLAY: 50,
});

// ============== DIFF/BASELINE LIMITS ==============

/**
 * Limits for diff and baseline comparisons
 */
export const DIFF_LIMITS = Object.freeze({
    /** New hosts to display */
    NEW_HOSTS_DISPLAY: 10,
    /** New destinations to display */
    NEW_DESTINATIONS_DISPLAY: 10,
    /** Maximum highlights to show */
    HIGHLIGHTS_MAX: 10,
    /** Focus IPs for action buttons */
    FOCUS_IPS_MAX: 4,
    /** Baseline window (number of snapshots) */
    BASELINE_WINDOW: 10,
    /** New risky entities for focus */
    NEW_RISKY_FOCUS: 3,
    /** New destinations for focus */
    NEW_DESTS_FOCUS: 2,
    /** New hosts for focus */
    NEW_HOSTS_FOCUS: 1,
});

// ============== THEATER MODE LIMITS ==============

/**
 * Limits for Theater Mode presentation
 */
export const THEATER_LIMITS = Object.freeze({
    /** Top risk items to show */
    TOP_RISK_DISPLAY: 15,
    /** Remediation IPs to feature */
    REMEDIATION_IPS: 5,
    /** Plans per IP */
    PLANS_PER_IP: 2,
    /** Badges per item */
    BADGES_PER_ITEM: 4,
    /** Default list items */
    LIST_ITEMS_DEFAULT: 6,
    /** Top risk in table */
    TOP_RISK_TABLE: 8,
    /** IPs in list slide */
    IPS_LIST_DISPLAY: 12,
    /** Rare ports display */
    RARE_PORTS_DISPLAY: 6,
    /** Behavior shifts display */
    BEHAVIOR_SHIFTS_DISPLAY: 4,
    /** Risky entities display */
    RISKY_ENTITIES_DISPLAY: 5,
});

// ============== EVIDENCE LIMITS ==============

/**
 * Limits for evidence display
 */
export const EVIDENCE_LIMITS = Object.freeze({
    /** Log line references to show */
    LOG_LINE_REFS: 3,
    /** Evidence slice radius */
    SLICE_RADIUS: 6,
});

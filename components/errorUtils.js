/**
 * Error handling utilities for VulcansTrace
 * Provides standardized patterns for silent cleanup, dev logging, and graceful degradation.
 * 
 * @module errorUtils
 */

/**
 * Development mode flag - true when running on localhost
 * Enables debug logging that is silent in production
 */
const DEV_MODE = typeof window !== 'undefined' &&
    window.location &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

/**
 * Execute a cleanup function, silently swallowing any errors.
 * Use only for operations where failure is expected and acceptable
 * (e.g., releasing locks, terminating workers, clearing timers).
 * 
 * @param {Function} fn - Cleanup function to execute
 * @param {string} [context] - Optional context for dev logging
 * @example
 * silentCleanup(() => reader.releaseLock(), 'stream reader');
 * silentCleanup(() => worker.terminate(), 'analysis worker');
 */
export function silentCleanup(fn, context) {
    try {
        const result = fn();
        // Handle async cleanup (e.g., reader.cancel())
        if (result && typeof result.catch === 'function') {
            result.catch(() => { /* intentional silent catch for async cleanup */ });
        }
    } catch {
        // Intentional: cleanup operations may fail if already cleaned up
        if (DEV_MODE && context) {
            console.debug(`[silentCleanup] ${context} - operation skipped`);
        }
    }
}

/**
 * Log a warning in development mode only.
 * No-op in production to avoid console noise.
 * 
 * @param {string} message - Warning message
 * @param {Error} [error] - Optional error object
 * @example
 * devWarn('Modal could not be opened', err);
 * devWarn('Feature unavailable in this environment');
 */
export function devWarn(message, error) {
    if (!DEV_MODE) return;
    if (error) {
        console.warn(`[VulcansTrace] ${message}`, error);
    } else {
        console.warn(`[VulcansTrace] ${message}`);
    }
}

/**
 * Execute a function with graceful fallback on error.
 * Useful for non-critical operations that should not break the app.
 * 
 * @param {Function} fn - Function to execute
 * @param {*} fallback - Fallback value if fn throws
 * @param {string} [context] - Optional context for dev logging
 * @returns {*} Result of fn or fallback
 * @example
 * const data = safeExecute(() => JSON.parse(text), {}, 'parse config');
 */
export function safeExecute(fn, fallback, context) {
    try {
        return fn();
    } catch (e) {
        if (DEV_MODE && context) {
            console.debug(`[safeExecute] ${context}:`, e);
        }
        return fallback;
    }
}

/**
 * Async version of safeExecute for async operations.
 * 
 * @param {Function} fn - Async function to execute
 * @param {*} fallback - Fallback value if fn throws/rejects
 * @param {string} [context] - Optional context for dev logging
 * @returns {Promise<*>} Result of fn or fallback
 * @example
 * const data = await safeExecuteAsync(() => fetchData(), [], 'fetch data');
 */
export async function safeExecuteAsync(fn, fallback, context) {
    try {
        return await fn();
    } catch (e) {
        if (DEV_MODE && context) {
            console.debug(`[safeExecuteAsync] ${context}:`, e);
        }
        return fallback;
    }
}

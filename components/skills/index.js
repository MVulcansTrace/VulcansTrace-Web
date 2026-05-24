/**
 * Skills index - aggregates all skill handlers and provides registry
 * This is the central point for skill registration
 * 
 * @module skills/index
 */

import { INTENTS, makeUnknownIntentResponse, makeNotImplementedResponse } from './shared.js';

// Import all skill handlers
import { helpHandler, makeHelpResponse } from './helpSkill.js';
import { topHandler } from './topSkill.js';
import { explainHandler } from './explainSkill.js';
import { evidenceHandler } from './evidenceSkill.js';
import { investigateHandler } from './investigateSkill.js';
import { diffHandler } from './diffSkill.js';
import { markSafeHandler } from './markSafeSkill.js';
import { allowlistHandler } from './allowlistSkill.js';
import { remediateHandler } from './remediateSkill.js';
import { exportHandler } from './exportSkill.js';
import { demoHandler } from './demoSkill.js';

/**
 * Skill handler function signature
 * @callback SkillHandler
 * @param {import('./shared.js').AgentContext} context - Agent context
 * @param {Object} [args] - Skill-specific arguments
 * @returns {import('./shared.js').AgentResponse} Normalized response
 */

/**
 * Base registry object mapping intent names to handlers
 * @type {Object.<string, SkillHandler>}
 */
const baseRegistry = Object.create(null);

/**
 * Proxy-wrapped registry providing fallback for unknown intents
 * @type {Object.<string, SkillHandler>}
 */
const registry = new Proxy(baseRegistry, {
    get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === 'string') return (context, args) => makeUnknownIntentResponse(prop);
        return undefined;
    }
});

/**
 * Register all default skill handlers
 * Called once during agent initialization by AgentKernel
 * @returns {Object.<string, SkillHandler>} The registry proxy
 */
function registerAll() {
    // Core skills
    baseRegistry.help = helpHandler;
    baseRegistry.top = topHandler;
    baseRegistry.explain = explainHandler;
    baseRegistry.evidence = evidenceHandler;

    // Investigation skills
    baseRegistry.investigate = investigateHandler;
    baseRegistry.diff = diffHandler;

    // Learning skills
    baseRegistry.mark_safe = markSafeHandler;
    baseRegistry.allowlist = allowlistHandler;

    // Action skills
    baseRegistry.remediate = remediateHandler;
    baseRegistry.export = exportHandler;
    baseRegistry.demo = demoHandler;

    // Register placeholder handlers for any unimplemented intents
    for (const intent of INTENTS) {
        if (!(intent in baseRegistry)) {
            baseRegistry[intent] = (context, args) => makeNotImplementedResponse(intent);
        }
    }

    return registry;
}

// Re-export for backwards compatibility
export {
    registry,
    registerAll,
    makeHelpResponse,
    // Export individual handlers for direct use if needed
    helpHandler,
    topHandler,
    explainHandler,
    evidenceHandler,
    investigateHandler,
    diffHandler,
    markSafeHandler,
    allowlistHandler,
    remediateHandler,
    exportHandler,
    demoHandler
};

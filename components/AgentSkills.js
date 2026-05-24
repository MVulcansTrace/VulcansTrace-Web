/**
 * Agent skills registry (strict allowlist)
 * 
 * This is the public facade for the agent skills system.
 * All skill handlers are now modularly organized in ./skills/
 * 
 * External code should continue importing from this file:
 *   import { AgentSkills } from './AgentSkills.js';
 * 
 * The public API remains unchanged:
 *   - AgentSkills.registry: Proxy providing skill handlers
 *   - AgentSkills.registerDefaults(): Initializes all default handlers
 */

import { registry, registerAll } from './skills/index.js';

/**
 * Register all default skill handlers
 * Called once during agent initialization by AgentKernel
 * @returns {Object} The registry proxy
 */
function registerDefaults() {
    return registerAll();
}

/**
 * AgentSkills - Public API
 * @property {Proxy} registry - Skill handler registry with fallback for unknown intents
 * @property {Function} registerDefaults - Initialize all default skill handlers
 */
export const AgentSkills = { registry, registerDefaults };

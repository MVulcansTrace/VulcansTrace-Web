/* Web Worker: runs VulcansTrace analysis off the main thread (ESM) */

import { NetworkUtils } from './NetworkUtils.js';
import { LogProcessor } from './LogProcessor.js';

function toErrorPayload(err) {
    const message = err && err.message ? String(err.message) : "Unknown error";
    const stack = err && err.stack ? String(err.stack) : "";
    return { message, stack };
}

self.onmessage = (event) => {
    const msg = event && event.data ? event.data : null;
    if (!msg || msg.type !== "analyze") return;

    const jobId = msg.jobId;
    const entries = Array.isArray(msg.entries) ? msg.entries : [];
    const topology = Array.isArray(msg.topology) ? msg.topology : [];
    const iocs = Array.isArray(msg.iocs) ? msg.iocs : [];
    const allowlist = Array.isArray(msg.allowlist) ? msg.allowlist : [];
    const profile = msg.profile ? String(msg.profile) : null;

    try {
        if (profile && LogProcessor && LogProcessor.setProfile) {
            LogProcessor.setProfile(profile);
        }
    } catch (err) {
        // Profile is non-fatal; continue with default constants.
    }

    try {
        const stats = LogProcessor.analyze(entries, topology, iocs, allowlist);
        self.postMessage({ type: "analysisResult", jobId, stats });
    } catch (err) {
        self.postMessage({ type: "analysisError", jobId, error: toErrorPayload(err) });
    }
};

/* Guided demo runner — click-to-advance narrative (8 steps, zero typing) */
import { UIUtils } from './UIUtils.js';
import { LogProcessor } from './LogProcessor.js';

function escapeHtml(value) {
    if (UIUtils && typeof UIUtils.escapeHtml === 'function') {
        return UIUtils.escapeHtml(value);
    }
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function addBotHtml(html) {
    if (UIUtils && typeof UIUtils.addBotHTML === 'function') {
        UIUtils.addBotHTML(html);
        return;
    }
    if (typeof console !== 'undefined' && console && typeof console.log === 'function') {
        console.log('[GuidedDemo]', String(html || ''));
    }
}

function delay(ms) {
    const wait = Number.isFinite(ms) ? ms : 0;
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, wait)));
}

async function waitForAnalysis(core, timeoutMs = 20000) {
    const deadline = Date.now() + Math.max(1000, Number.isFinite(timeoutMs) ? timeoutMs : 20000);
    while (Date.now() < deadline) {
        const inProgress = core && core.analysisJobInProgress ? Number(core.analysisJobInProgress) : 0;
        if (!inProgress) return true;
        await delay(80);
    }
    return false;
}

function getTopIp(stats, fallback) {
    const safeFallback = typeof fallback === 'string' ? fallback.trim() : '';
    const risk = stats && Array.isArray(stats.risk) ? stats.risk : [];
    const top = risk && risk[0] ? risk[0] : null;
    const ip = top && typeof top.ip === 'string' ? top.ip.trim() : '';
    return ip || safeFallback;
}

function buildDemoDatasets() {
    const targetIp = '192.168.1.99';
    const baselineText = [
        '2025-01-01 12:00:00 DROP TCP 192.168.1.99 10.0.0.10 5000 80',
        '2025-01-01 12:00:01 DROP TCP 192.168.1.99 10.0.0.10 5001 81',
        '2025-01-01 12:00:02 DROP TCP 192.168.1.99 10.0.0.10 5002 82',
        '2025-01-01 12:00:03 DROP TCP 192.168.1.99 10.0.0.10 5003 83',
        '2025-01-01 12:00:04 DROP TCP 192.168.1.99 10.0.0.10 5004 84',
        '2025-01-01 12:00:05 DROP TCP 192.168.1.99 10.0.0.10 5005 85',
        '2025-01-01 12:10:00 DROP TCP 192.168.1.99 10.0.0.20 5100 445',
        '2025-01-01 12:14:00 ALLOW TCP 192.168.1.99 10.0.0.21 5101 445',
        '2025-01-01 12:20:00 ALLOW TCP 192.168.1.99 9.9.9.9 5200 443',
        '2025-01-01 12:20:05 DROP TCP 192.168.1.99 9.9.9.10 5201 443'
    ].join('\n');

    const deltaText = [
        '2025-01-01 12:21:00 ALLOW TCP 192.168.1.99 8.8.8.8 5300 443',
        '2025-01-01 12:21:01 ALLOW TCP 192.168.1.99 8.8.4.4 5301 443',
        '2025-01-01 12:21:02 DROP TCP 192.168.1.99 8.8.8.8 5302 53',
        '2025-01-01 12:22:00 DROP TCP 192.168.1.99 10.0.0.30 5400 3389',
        '2025-01-01 12:22:10 DROP TCP 192.168.1.99 10.0.0.31 5401 3389',
        '2025-01-01 12:22:20 DROP TCP 192.168.1.99 10.0.0.32 5402 5985',
        '2025-01-01 12:22:30 ALLOW TCP 192.168.1.99 10.0.0.33 5403 5985'
    ].join('\n');

    return {
        targetIp,
        baselineText,
        deltaText
    };
}

async function addTextDataset(core, name, text, options = null) {
    const opts = options && typeof options === 'object' ? options : {};
    const rawName = typeof name === 'string' ? name.trim() : '';
    const safeName = rawName || `demo_${Date.now()}.log`;
    const rawText = String(text || '');
    if (!rawText.trim()) return { ok: false, reason: 'empty_text' };

    if (!core || !core.DB || !Array.isArray(core.DB.inputs)) return { ok: false, reason: 'core_unavailable' };
    if (typeof Blob === 'undefined' || typeof TextEncoder === 'undefined') return { ok: false, reason: 'blob_unavailable' };

    const enc = new TextEncoder();
    const rawBytes = enc.encode(rawText);
    const blob = new Blob([rawBytes], { type: 'text/plain' });
    const lastModified = Date.now();
    const previewText = rawText.split(/\r?\n/).slice(0, 100).join('\n');

    const lp = LogProcessor;
    if (!lp || typeof lp.processLogText !== 'function') return { ok: false, reason: 'logprocessor_unavailable' };

    const result = typeof lp.processAnyText === 'function'
        ? lp.processAnyText(rawText)
        : lp.processLogText(rawText);

    if (!result || !result.success) return { ok: false, reason: 'parse_failed' };

    const kind = result.kind || 'flows';
    const entries = Array.isArray(result.entries) ? result.entries : [];
    const cloudEvents = Array.isArray(result.events) ? result.events : [];
    const hasData = (kind === 'cloudtrail') ? cloudEvents.length > 0 : entries.length > 0;
    if (!hasData) return { ok: false, reason: 'no_data' };

    const overrideCaseId = typeof opts.caseId === 'string' ? opts.caseId.trim() : '';
    const caseId = overrideCaseId || (typeof core.getActiveCaseId === 'function' ? core.getActiveCaseId() : null);
    let datasetId = `ds_demo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    try {
        if (core.caseStore && caseId && typeof core.caseStore.addDataset === 'function') {
            const dataset = await core.caseStore.addDataset(caseId, {
                name: safeName,
                size: blob.size,
                lastModified,
                previewText,
                kind
            });
            if (dataset && dataset.id) datasetId = dataset.id;
        }
    } catch { // CaseStore may not be available - in-memory dataset still works
    }

    let hash = null;
    try {
        if (typeof core.sha256 === 'function') {
            hash = await core.sha256(rawBytes);
        }
    } catch { // SHA-256 may fail in some environments - hash is optional
        hash = null;
    }

    core.DB.inputs.push({
        id: datasetId,
        caseId,
        name: safeName,
        size: blob.size,
        lastModified,
        previewText,
        blob,
        hash,
        kind,
        entries,
        cloudEvents
    });

    if (kind === 'cloudtrail') {
        if (!Array.isArray(core.DB.cloudEvents)) core.DB.cloudEvents = [];
        core.DB.cloudEvents.push(...cloudEvents);
    }

    return { ok: true, kind, entries: entries.length, cloudEvents: cloudEvents.length };
}

function canUseUi() {
    return (
        typeof document !== 'undefined' &&
        typeof window !== 'undefined' &&
        typeof UIUtils !== 'undefined'
    );
}

/* ── Click-to-advance helpers ───────────────────────────── */

function scrollChat() {
    const chatContainer = document.querySelector('#chatContainer');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

function waitForClick(buttonId) {
    return new Promise((resolve) => {
        const tryAttach = () => {
            const btn = document.getElementById(buttonId);
            if (btn) {
                btn.addEventListener('click', () => {
                    btn.disabled = true;
                    btn.classList.add('demo-advance-btn--done');
                    resolve();
                }, { once: true });
            } else {
                setTimeout(tryAttach, 50);
            }
        };
        tryAttach();
    });
}

function showStepCard(stepNum, totalSteps, narrativeHtml, buttonText, buttonId, bridgeHtml) {
    const bridgeSection = bridgeHtml
        ? `<div class="demo-bridge">${bridgeHtml}</div>`
        : '';
    addBotHtml(`
        <div class="demo-narrative">
            <span class="demo-step-badge">STEP ${stepNum} OF ${totalSteps}</span>
            ${bridgeSection}
            <div class="demo-narrative-text">${narrativeHtml}</div>
            <button id="${buttonId}" class="demo-advance-btn">${buttonText} <span class="demo-advance-arrow">&rarr;</span></button>
        </div>
    `);
    scrollChat();
}

function showFinalCard(html) {
    addBotHtml(`
        <div class="demo-narrative">
            <div class="demo-narrative-text">${html}</div>
        </div>
    `);
    scrollChat();
}

function showErrorCard(message) {
    addBotHtml(`
        <div class="demo-narrative" style="border-color:var(--accent-red,red)">
            <div class="demo-narrative-text" style="color:var(--accent-red,red)"><strong>Demo halted:</strong> ${message}</div>
        </div>
    `);
    scrollChat();
}

/* ── Main entry point ───────────────────────────────────── */

async function run(core, options = null) {
    const opts = options && typeof options === 'object' ? options : {};
    const forceReset = !!opts.forceReset;
    const allowNoCase = !!opts.allowNoCase;
    let completed = false;

    /* --- Guard checks (unchanged) --- */
    if (!canUseUi()) {
        return { ok: false, reason: 'ui_unavailable' };
    }

    if (!core || typeof core !== 'object') {
        addBotHtml('<div style="color:var(--accent-red)">Guided demo: core not available.</div>');
        return { ok: false, reason: 'core_unavailable' };
    }

    const db = typeof core.getDB === 'function' ? core.getDB() : (core.DB || null);
    const hasInputs = db && Array.isArray(db.inputs) && db.inputs.length > 0;
    if (hasInputs && !forceReset) {
        return { ok: false, reason: 'needs_reset' };
    }

    let caseId = typeof core.getActiveCaseId === 'function' ? core.getActiveCaseId() : null;
    if (!caseId && allowNoCase) {
        caseId = `demo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        addBotHtml(`<div class="text-xs" style="color:var(--text-muted)">Guided demo running in ephemeral mode (no active workspace).</div>`);
    }
    if (!caseId) return { ok: false, reason: 'no_active_case' };

    if (core.analysisJobInProgress) {
        addBotHtml('<div>Guided demo: analysis is still running—try again in a moment.</div>');
        return { ok: false, reason: 'analysis_in_progress' };
    }

    /* --- Setup --- */
    const { targetIp, baselineText, deltaText } = buildDemoDatasets();
    const TOTAL = 8;
    let stepCounter = 0;
    const nextBtnId = () => `demo-advance-${++stepCounter}`;

    const originalIocs = Array.isArray(core.IOCS) ? core.IOCS.slice() : [];
    core.IOCS = [];

    try {
        if (forceReset && typeof core.resetCase === 'function') {
            core.resetCase(true);
        }

        if (core.DB && typeof core.DB === 'object') {
            if (!Array.isArray(core.DB.inputs)) core.DB.inputs = [];
            if (!Array.isArray(core.DB.cloudEvents)) core.DB.cloudEvents = [];
        }

        const suppressAutoTop = () => {
            const nextJobId = Number.isFinite(core.analysisJobId) ? (core.analysisJobId + 1) : 0;
            if (nextJobId) core.agentLastAutoTopJobId = nextJobId;
        };

        const invoke = (cmd) => {
            if (!cmd) return;
            if (typeof core.invokeAgentCommand === 'function') {
                core.invokeAgentCommand(cmd, {
                    showUserMessage: false,
                    auto: true,
                    transcriptUserText: `[guided_demo] ${cmd}`
                });
                return;
            }
            if (typeof core.processCommand === 'function') core.processCommand(cmd);
        };

        /* ====================================================
         *  STEP 1 — LOAD DATA
         * ==================================================== */
        const btn1 = nextBtnId();
        showStepCard(1, TOTAL,
            'This dataset contains 17 firewall flows from a single host (192.168.1.99) captured on January 1, 2025. Here\'s what\'s inside:\n\n• 6 flows: Sequential port scan (ports 80–85) targeting 10.0.0.10\n• 2 flows: SMB probe on port 445 — one ALLOWED through\n• 2 flows: Outbound HTTPS to external IPs (possible C2)\n• 3 flows: DNS requests mixing port 53 and 443\n• 2 flows: RDP attempts on port 3389 — blocked\n• 2 flows: WinRM on port 5985 — one ALLOWED through\n\nOne host. One log. A complete intrusion from recon to compromise.',
            'Let\'s investigate', btn1);
        await waitForClick(btn1);

        suppressAutoTop();
        const addedBase = await addTextDataset(core, 'demo_baseline.log', baselineText, { caseId });
        if (!addedBase.ok) {
            showErrorCard(`Failed to load dataset: <code>${escapeHtml(addedBase.reason)}</code>`);
            return { ok: false, reason: 'ingest_failed' };
        }

        core.DB.startTime = new Date().toISOString();
        if (typeof core.syncDuckDbData === 'function') core.syncDuckDbData();

        /* ====================================================
         *  STEP 2 — ANALYZE
         * ==================================================== */
        const btn2 = nextBtnId();
        showStepCard(2, TOTAL,
            'The analysis engine scans every flow for anomalies — port scanning patterns, unusual destinations, dropped connections, and chain activity. Let\'s see what it detects.',
            'Analyze the logs', btn2,
            '<strong>17 flow entries loaded.</strong> Now let\'s see what the engine finds when it analyzes them.');
        await waitForClick(btn2);

        // Baseline pass
        if (typeof core.aggregateAnalysis === 'function') {
            await core.aggregateAnalysis();
        }
        await delay(200);

        // Apply threat intel + delta, then re-analyze
        core.IOCS = [targetIp];
        const addedDelta = await addTextDataset(core, 'demo_delta.log', deltaText, { caseId });
        if (!addedDelta.ok) {
            showErrorCard(`Failed to apply delta dataset: <code>${escapeHtml(addedDelta.reason)}</code>`);
            return { ok: false, reason: 'delta_failed' };
        }

        suppressAutoTop();
        if (typeof core.aggregateAnalysis === 'function') {
            await core.aggregateAnalysis();
        }
        await delay(250);

        const stats = typeof core.getStats === 'function' ? core.getStats() : (core.STATS || null);
        const focusIp = getTopIp(stats, targetIp);

        /* ====================================================
         *  STEP 3 — TOP THREATS
         * ==================================================== */
        const btn3 = nextBtnId();
        showStepCard(3, TOTAL,
            'Here\'s the ranked threat list — every host scored by risk signals. The top entry is our prime suspect.',
            'Who\'s the threat?', btn3,
            'Interesting — the engine flagged one host as <strong>[CRITICAL]</strong> with scanner activity on 8 ports. Let\'s see who it is.');
        await waitForClick(btn3);

        invoke('top threats');
        await delay(700);

        /* ====================================================
         *  STEP 4 — EXPLAIN
         * ==================================================== */
        const btn4 = nextBtnId();
        showStepCard(4, TOTAL,
            'Time for a deep dive on our top suspect. This breaks down every risk signal, maps it to MITRE ATT&CK techniques, and shows the attack pattern.',
            'Why is this IP flagged?', btn4,
            'One IP dominates the threat board. Let\'s dig into exactly what it\'s doing and why it scored <strong>CRITICAL</strong>.');
        await waitForClick(btn4);

        invoke(`explain ${focusIp}`);
        await delay(700);

        /* ====================================================
         *  STEP 5 — SHOW PROOF / EVIDENCE
         * ==================================================== */
        const btn5 = nextBtnId();
        showStepCard(5, TOTAL,
            'Every claim needs evidence. This pulls the forensic triage artifacts — the specific flows, timestamps, and patterns that triggered each detector.',
            'Show me the proof', btn5,
            'We know <strong>WHAT</strong> it\'s doing. Now let\'s see the <strong>PROOF</strong> — the raw evidence behind each finding.');
        await waitForClick(btn5);

        invoke(`show evidence ${focusIp}`);
        await delay(700);

        /* ====================================================
         *  STEP 6 — DIFF
         * ==================================================== */
        const btn6 = nextBtnId();
        showStepCard(6, TOTAL,
            'This is where VulcansTrace really shines — the baseline diff engine. We saved a snapshot before the threat intel was applied. Now we compare current vs. baseline to surface exactly what\'s <strong>NEW</strong>.',
            'What changed?', btn6,
            'We\'ve seen the current state. But how did we get here? Let\'s compare against the baseline to see what <strong>CHANGED</strong>.');
        await waitForClick(btn6);

        invoke('compare last');
        await delay(700);

        /* ====================================================
         *  STEP 7 — REMEDIATE + EXPORT
         * ==================================================== */
        const btn7 = nextBtnId();
        showStepCard(7, TOTAL,
            'Remediation steps tailored to the specific attack pattern. And we\'ll package everything into a forensic evidence ZIP — ready to hand to your incident response team.',
            'How do we fix it?', btn7,
            'We\'ve identified the threat, mapped the attack, gathered the evidence, and seen the changes. Now — how do we <strong>STOP</strong> it?');
        await waitForClick(btn7);

        invoke(`remediate ${focusIp}`);
        await delay(400);
        invoke('export evidence');
        await delay(600);

        /* ====================================================
         *  STEP 8 — THEATER MODE
         * ==================================================== */
        const btn8 = nextBtnId();
        showStepCard(8, TOTAL,
            'Theater Mode generates a structured slide deck from all the evidence — Overview, Snapshot, Triage, Diff, Hypothesis, and Remediation. Use arrow keys to navigate. This is what you\'d present to leadership.',
            'Show me the boardroom deck', btn8,
            'We\'ve investigated, proved, diffed, and remediated. Let\'s wrap it into a boardroom-ready presentation.');
        await waitForClick(btn8);

        invoke('demo boardroom');

        showFinalCard('Guided demo complete. IOC list was applied in-memory only (reload clears it).');

        completed = true;
        return { ok: true, focusIp };
    } finally {
        if (!completed || opts.restoreIocs) {
            core.IOCS = originalIocs;
        }
    }
}

export const GuidedDemo = { run };

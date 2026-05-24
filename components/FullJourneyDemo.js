/* Full Journey Demo - Theatrical presentation of VulcansTrace capabilities */
import { UIUtils } from './UIUtils.js';
import { LogProcessor } from './LogProcessor.js';

// ============== UTILITIES ==============
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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms || 0)));
}

function estimateSpeechDuration(text, minMs = 0) {
    const raw = String(text || '').trim();
    if (!raw) return Math.max(0, Number.isFinite(minMs) ? minMs : 0);
    const words = raw.split(/\s+/).filter(Boolean);
    const baseMs = 1200;
    const perWordMs = 320;
    const computed = baseMs + (words.length * perWordMs);
    const floor = Number.isFinite(minMs) ? minMs : 0;
    return Math.max(floor, computed);
}

function getApp() {
    if (typeof globalThis === 'undefined') return null;
    return globalThis.logAnalystApp || null;
}

async function ensureDemoCase(core) {
    const app = getApp();
    if (!app || !app.caseStore) return null;

    const activeId = core && typeof core.getActiveCaseId === 'function' ? core.getActiveCaseId() : null;
    if (activeId) return activeId;

    if (typeof app.caseStore.createCase !== 'function') return null;

    try {
        const label = `Full Journey Demo ${new Date().toISOString().slice(0, 10)}`;
        const record = await app.caseStore.createCase({ name: label });
        if (core && typeof core.setCaseStore === 'function') {
            core.setCaseStore(app.caseStore);
        }
        if (core && typeof core.refreshSnapshotCache === 'function') {
            try {
                await core.refreshSnapshotCache();
            } catch {
                // ignore
            }
        }
        if (app.sideNav && typeof app.sideNav.refresh === 'function') {
            await app.sideNav.refresh();
        }
        if (app.workspaceModal && typeof app.workspaceModal.forceClose === 'function') {
            app.workspaceModal.forceClose();
        }
        return record && record.id ? record.id : null;
    } catch {
        return null;
    }
}

function setOverlayMode(mode) {
    if (!journeyOverlay) return;
    journeyOverlay.classList.remove('journey-overlay-minimized', 'journey-overlay-presenter');
    if (mode) journeyOverlay.classList.add(mode);
}

function formatBadgeSummary(badges) {
    const list = Array.isArray(badges) ? badges.filter(Boolean).map(String) : [];
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list[0]}, ${list[1]}, and ${list.length - 2} more`;
}

function getFocusRisk(stats, fallbackIp) {
    const risk = stats && Array.isArray(stats.risk) ? stats.risk : [];
    const top = risk && risk[0] ? risk[0] : null;
    const ip = top && typeof top.ip === 'string' ? top.ip.trim() : '';
    return {
        ip: ip || (fallbackIp || ''),
        level: top && top.level != null ? String(top.level) : '',
        score: (top && Number.isFinite(top.score)) ? top.score : null,
        badges: Array.isArray(top && top.badges) ? top.badges.map(String) : []
    };
}

function formatFocusLine(focus) {
    if (!focus || !focus.ip) return '';
    const parts = [];
    if (focus.level) parts.push(focus.level);
    if (Number.isFinite(focus.score)) parts.push(`Score ${focus.score}`);
    return [focus.ip, ...parts].join(' • ');
}

function closeAnyOpenModals() {
    // Close Evidence Slice modal if open
    const app = getApp();
    if (app && app.evidenceSliceModal && typeof app.evidenceSliceModal.close === 'function') {
        app.evidenceSliceModal.close();
    }
    // Close Evidence modal if open
    if (app && app.evidenceModal && typeof app.evidenceModal.close === 'function') {
        app.evidenceModal.close();
    }
    // Close Remediation modal if open
    if (app && app.remediationModal && typeof app.remediationModal.close === 'function') {
        app.remediationModal.close();
    }
    // Close any generic overlay that might be active
    const overlays = document.querySelectorAll('.overlay.active');
    overlays.forEach(el => {
        // Don't close the journey overlay itself
        if (el.id !== 'journey-overlay' && !el.classList.contains('journey-overlay')) {
            el.classList.remove('active');
        }
    });
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

    return { targetIp, baselineText, deltaText };
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
    } catch {
        // ignore, in-memory dataset still works
    }

    let hash = null;
    try {
        if (typeof core.sha256 === 'function') {
            hash = await core.sha256(rawBytes);
        }
    } catch {
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

async function waitForAnalysis(core, timeoutMs = 20000) {
    const deadline = Date.now() + Math.max(1000, Number.isFinite(timeoutMs) ? timeoutMs : 20000);
    while (Date.now() < deadline) {
        const inProgress = core && core.analysisJobInProgress ? Number(core.analysisJobInProgress) : 0;
        if (!inProgress) return true;
        await delay(80);
    }
    return false;
}

function renderLiveDemoStep(step, index, total) {
    const kicker = step && step.kicker ? step.kicker : 'Live walkthrough';
    const title = step && step.title ? step.title : 'Step';
    const highlight = step && step.highlight ? step.highlight : '';
    const meta = step && step.meta ? step.meta : '';
    const status = step && step.status ? step.status : '';
    const stepLabel = `${index + 1} of ${total}`;

    setContent(`
            <div class="journey-live-demo">
                <div class="journey-avatar-small">
                    <img src="${AVATAR_PATH}" alt="VulcansTrace">
                </div>
                <div class="journey-speech">
                    <div class="speech-bubble">
                        <span class="speech-text"></span>
                        <span class="speech-cursor">|</span>
                    </div>
                </div>
                <div class="journey-demo-card animate-slide-up">
                    <div class="journey-demo-kicker">${escapeHtml(kicker)}</div>
                    <div class="journey-demo-title">${escapeHtml(title)}</div>
                    ${highlight ? `<div class="journey-demo-highlight">${escapeHtml(highlight)}</div>` : ''}
                    ${meta ? `<div class="journey-demo-meta">${escapeHtml(meta)}</div>` : ''}
                    <div class="journey-demo-status" data-role="journey-status">${escapeHtml(status)}</div>
                    <div class="journey-demo-step">${escapeHtml(stepLabel)}</div>
                </div>
            </div>
        `);

    return journeyOverlay?.querySelector('[data-role="journey-status"]');
}

function buildTheaterNarration(slide, state, index, total) {
    const key = slide && slide.key ? String(slide.key) : '';
    const focusIp = state && state.focus && state.focus.ip ? state.focus.ip : '';
    const focusLine = focusIp ? `Primary focus: ${focusIp}. ` : '';
    const prefix = `Slide ${index + 1} of ${total}. `;

    if (key === 'snapshot') {
        return `${prefix}Snapshot of the case. ${focusLine}Totals, allow/drop mix, and the current case memory in one view.`;
    }
    if (key === 'triage') {
        return `${prefix}Triage board. Ranked threats, risk scores, and badges so you know what matters first.`;
    }
    if (key === 'diff') {
        return `${prefix}Diff view. New hosts, destinations, and rare ports compared to baseline memory.`;
    }
    if (key === 'hypothesis') {
        return `${prefix}Hypothesis deck. Plausible narratives, evidence, and missing checks, clearly labeled.`;
    }
    if (key === 'remediation') {
        return `${prefix}Remediation plans. Copy/paste only, gated by confirmed threat intel.`;
    }

    const title = slide && slide.title ? String(slide.title) : 'Theater Mode';
    return `${prefix}${title}.`;
}

async function presentTheaterSlides(app, state) {
    if (!app || !app.theaterMode) return false;
    const mode = app.theaterMode;
    if (typeof mode.isOpen !== 'function' || typeof mode.open !== 'function' || typeof mode.next !== 'function') return false;

    if (!mode.isOpen()) {
        mode.open({ startAt: 0 });
    }

    await delay(500);
    const slides = Array.isArray(mode.slides) ? mode.slides : [];
    if (!slides.length) return false;

    for (let i = 0; i < slides.length && !journeyAborted; i++) {
        if (typeof mode.isOpen === 'function' && !mode.isOpen()) break;
        const slide = slides[i] || {};
        const narration = buildTheaterNarration(slide, state, i, slides.length);
        if (narration) {
            await showSpeechBubble(narration, { lingerMs: 2200 });
        }
        await delay(300);
        if (i < slides.length - 1 && (typeof mode.isOpen !== 'function' || mode.isOpen())) {
            mode.next();
            await delay(450);
        }
    }

    if (mode.isOpen() && !journeyAborted) {
        await delay(1200);
        mode.close();
    }

    return true;
}

// ============== JOURNEY STATE ==============
let journeyOverlay = null;
let journeyCore = null;
let journeyPhase = 0;
let journeyAborted = false;

// ============== CONSTANTS ==============
const AVATAR_PATH = 'assets/VulcansTraceAvatar.png';

const FEATURE_TOUR = [
    {
        title: 'Log Ingestion',
        icon: '📥',
        speech: 'Drop any firewall log and I parse it instantly. Windows Firewall, AWS VPC, CloudTrail, no cloud required.',
        highlight: 'Drag & drop multiple files'
    },
    {
        title: 'Format Intelligence',
        icon: '🧩',
        speech: 'I auto-detect formats and normalize fields so every source speaks the same language.',
        highlight: 'Auto-detect + normalize'
    },
    {
        title: 'Threat Detection',
        icon: '🔍',
        speech: 'I flag scanners, flooders, lateral movement, and suspicious egress, all offline and deterministic.',
        highlight: 'SCANNER • FLOODER • EGRESS • LATERAL'
    },
    {
        title: 'Risk Scoring',
        icon: '📊',
        speech: 'Every IP gets a risk score and confidence badges. The most urgent threats rise to the top.',
        highlight: 'Scored, ranked, and prioritized'
    },
    {
        title: 'Attack Chains',
        icon: '⛓️',
        speech: 'I connect blocked-then-allowed sequences to reveal breach attempts. DROP on 445... then ALLOW? That stands out.',
        highlight: 'Blocked → Breached detection'
    },
    {
        title: 'Baseline Memory',
        icon: '🧠',
        speech: 'I store snapshots per case. When something NEW appears, a host, destination, or port, I call it out.',
        highlight: 'Novelty detection across runs'
    },
    {
        title: 'Evidence Bundles',
        icon: '📦',
        speech: 'One click exports a signed evidence ZIP: HTML story, JSON artifacts, timestamps.',
        highlight: 'Evidence, ready to hand off'
    },
    {
        title: 'Remediation Plans',
        icon: '🛡️',
        speech: 'I generate copy/paste firewall commands, but I never auto-execute. You stay in control.',
        highlight: 'Windows, Linux, cloud-ready'
    },
    {
        title: 'Theater Mode',
        icon: '🎬',
        speech: 'I can turn any run into a boardroom-ready story with snapshot, triage, diff, and remediation slides.',
        highlight: 'Snapshot • Triage • Diff • Remediate'
    }
];

// ============== OVERLAY CREATION ==============
function createOverlay() {
    if (journeyOverlay) return journeyOverlay;

    const overlay = document.createElement('div');
    overlay.id = 'journey-overlay';
    overlay.className = 'journey-overlay';
    overlay.innerHTML = `
            <div class="journey-backdrop"></div>
            <div class="journey-container">
                <button class="journey-exit-btn" data-role="journey-exit" aria-label="Exit journey">✕ Exit</button>
                <div class="journey-progress">
                    <div class="journey-progress-bar"></div>
                </div>
                <div class="journey-content">
                    <!-- Dynamic content goes here -->
                </div>
            </div>
        `;

    const exitBtn = overlay.querySelector('[data-role="journey-exit"]');
    if (exitBtn) {
        exitBtn.addEventListener('click', () => close());
    }

    document.body.appendChild(overlay);
    journeyOverlay = overlay;
    return overlay;
}

function destroyOverlay() {
    if (journeyOverlay) {
        journeyOverlay.remove();
        journeyOverlay = null;
    }
}

function updateProgress(percent) {
    const bar = journeyOverlay?.querySelector('.journey-progress-bar');
    if (bar) {
        bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }
}

function setContent(html) {
    const container = journeyOverlay?.querySelector('.journey-content');
    if (container) {
        container.innerHTML = html;
    }
}

// ============== TYPING ANIMATION ==============
async function typeText(element, text, speed = 30) {
    if (!element || journeyAborted) return;

    element.textContent = '';
    for (let i = 0; i < text.length && !journeyAborted; i++) {
        element.textContent += text[i];
        await delay(speed);
    }
}

async function showSpeechBubble(speech, options = null) {
    if (journeyAborted) return;

    const bubble = journeyOverlay?.querySelector('.journey-speech');
    if (!bubble) return;
    const text = String(speech || '').trim();
    if (!text) return;

    const opts = (typeof options === 'number') ? { lingerMs: options } : (options && typeof options === 'object' ? options : {});
    const typeSpeed = Number.isFinite(opts.typeSpeed) ? opts.typeSpeed : 26;
    const minLinger = Number.isFinite(opts.lingerMs) ? opts.lingerMs : 0;
    const lingerMs = estimateSpeechDuration(text, minLinger);

    bubble.classList.add('visible');
    await typeText(bubble.querySelector('.speech-text'), text, typeSpeed);
    await delay(lingerMs);
    bubble.classList.remove('visible');
    await delay(300);
}

// ============== PHASE 1: INTRO ==============
async function runIntro() {
    if (journeyAborted) return;

    setOverlayMode(null);
    updateProgress(5);
    setContent(`
            <div class="journey-intro">
                <div class="journey-avatar-container">
                    <img src="${AVATAR_PATH}" alt="VulcansTrace" class="journey-avatar animate-bounce-in">
                </div>
                <div class="journey-title animate-fade-in">VulcansTrace</div>
                <div class="journey-subtitle animate-fade-in-delay">Firewall Forensics. Simplified.</div>
                <div class="journey-speech">
                    <div class="speech-bubble">
                        <span class="speech-text"></span>
                        <span class="speech-cursor">|</span>
                    </div>
                </div>
            </div>
        `);

    await delay(800);
    await showSpeechBubble("Welcome. I'm VulcansTrace, your offline firewall analyst.", { lingerMs: 2200 });
    await showSpeechBubble("I'll walk you through every feature, one step at a time.", { lingerMs: 2200 });

    updateProgress(10);
}

// ============== PHASE 2: FEATURE TOUR ==============
async function runFeatureTour() {
    if (journeyAborted) return;

    setOverlayMode(null);
    const baseProgress = 10;
    const progressPerFeature = 40 / FEATURE_TOUR.length;

    for (let i = 0; i < FEATURE_TOUR.length && !journeyAborted; i++) {
        const feature = FEATURE_TOUR[i];
        updateProgress(baseProgress + (i * progressPerFeature));

        setContent(`
                <div class="journey-feature">
                    <div class="journey-avatar-small">
                        <img src="${AVATAR_PATH}" alt="VulcansTrace">
                    </div>
                    <div class="journey-speech">
                        <div class="speech-bubble">
                            <span class="speech-text"></span>
                            <span class="speech-cursor">|</span>
                        </div>
                    </div>
                    <div class="feature-card animate-slide-up">
                        <div class="feature-icon">${feature.icon}</div>
                        <div class="feature-title">${escapeHtml(feature.title)}</div>
                        <div class="feature-highlight">${escapeHtml(feature.highlight)}</div>
                    </div>
                    <div class="feature-counter">${i + 1} of ${FEATURE_TOUR.length}</div>
                </div>
            `);

        await delay(450);
        await showSpeechBubble(feature.speech, { lingerMs: 2400 });
        await delay(260);
    }

    updateProgress(50);
}

// ============== PHASE 3: LIVE DEMO ==============
function buildLiveDemoSteps(core, state, datasets) {
    const invoke = (cmd) => {
        if (!cmd) return;
        if (typeof core.invokeAgentCommand === 'function') {
            core.invokeAgentCommand(cmd, {
                showUserMessage: false,
                auto: true,
                transcriptUserText: `[full_journey] ${cmd}`
            });
            return;
        }
        if (typeof core.processCommand === 'function') core.processCommand(cmd);
    };

    const updateStatus = (el, text) => {
        if (el) el.textContent = String(text || '');
    };

    const suppressAutoTop = () => {
        const nextJobId = Number.isFinite(core.analysisJobId) ? (core.analysisJobId + 1) : 0;
        if (nextJobId) core.agentLastAutoTopJobId = nextJobId;
    };

    return [
        {
            id: 'baseline',
            view: () => ({
                kicker: 'Live walkthrough',
                title: 'Baseline ingestion',
                highlight: 'demo_baseline.log',
                meta: 'Establishes case memory for diff + novelty detection.',
                status: 'Loading baseline dataset...',
                beforeSpeech: 'Let me walk you through a real incident, step by step. First, I ingest a baseline log. This becomes my memory of "normal".',
                afterSpeech: 'Baseline captured. Now I can detect what is new, risky, or anomalous.'
            }),
            action: async (state, statusEl) => {
                updateStatus(statusEl, 'Parsing baseline log...');
                const added = await addTextDataset(core, 'demo_baseline.log', datasets.baselineText, { caseId: state.caseId });
                if (!added.ok) throw new Error(`baseline:${added.reason}`);

                core.DB.startTime = new Date().toISOString();
                if (typeof core.syncDuckDbData === 'function') core.syncDuckDbData();

                updateStatus(statusEl, 'Running baseline analysis...');
                suppressAutoTop();
                if (typeof core.aggregateAnalysis === 'function') {
                    await core.aggregateAnalysis();
                }
                const baselineReady = await waitForAnalysis(core, 25000);
                if (!baselineReady) throw new Error('baseline_timeout');

                if (typeof core.refreshSnapshotCache === 'function') {
                    try {
                        await core.refreshSnapshotCache();
                    } catch {
                        // ignore
                    }
                }
                updateStatus(statusEl, 'Baseline snapshot saved.');
                await delay(450);
            }
        },
        {
            id: 'delta',
            view: (state) => ({
                kicker: 'Live walkthrough',
                title: 'New activity + threat intel',
                highlight: 'demo_delta.log',
                meta: 'Adds new hosts, ports, and IOC context.',
                status: 'Applying IOC overlay...',
                beforeSpeech: 'Next, I layer in fresh activity and apply threat intel.',
                afterSpeech: () => {
                    const focus = state.focus || {};
                    const badgeText = formatBadgeSummary(focus.badges);
                    const badgeLine = badgeText ? `Badges: ${badgeText}. ` : '';
                    return focus.ip
                        ? `I ranked every host. Top focus is ${focus.ip}. ${badgeLine}Now we triage and explain why.`
                        : 'I ranked every host by risk score. Now we triage and explain why.';
                }
            }),
            action: async (state, statusEl) => {
                core.IOCS = [state.targetIp];

                updateStatus(statusEl, 'Ingesting new activity...');
                const added = await addTextDataset(core, 'demo_delta.log', datasets.deltaText, { caseId: state.caseId });
                if (!added.ok) throw new Error(`delta:${added.reason}`);

                updateStatus(statusEl, 'Re-running analysis...');
                suppressAutoTop();
                if (typeof core.aggregateAnalysis === 'function') {
                    await core.aggregateAnalysis();
                }
                const deltaReady = await waitForAnalysis(core, 25000);
                if (!deltaReady) throw new Error('delta_timeout');

                state.focus = getFocusRisk(typeof core.getStats === 'function' ? core.getStats() : core.STATS, state.targetIp);
                updateStatus(statusEl, `Top focus: ${state.focus.ip || state.targetIp}`);
                await delay(450);
            }
        },
        {
            id: 'top',
            view: (state) => ({
                kicker: 'Live walkthrough',
                title: 'Triage: top threats',
                highlight: formatFocusLine(state.focus) || 'Ranked risk list',
                meta: 'Scores and badges sort the most urgent first.',
                status: 'Running top threats...',
                beforeSpeech: 'Let me open the triage board and surface the top risks.',
                afterSpeech: 'Everything is ranked by urgency, with badges that explain why each host is risky.'
            }),
            action: async (state, statusEl) => {
                updateStatus(statusEl, 'Running top threats...');
                invoke('top threats');
                await delay(900);
            }
        },
        {
            id: 'explain',
            view: (state) => ({
                kicker: 'Live walkthrough',
                title: 'Explain the focus',
                highlight: state.focus && state.focus.ip ? state.focus.ip : 'Explain top IP',
                meta: 'Plain-language reasoning with context.',
                status: 'Explaining the focus...',
                beforeSpeech: 'Now I explain the focus in plain language so you know what happened and why it matters.',
                afterSpeech: 'Notice the scanner patterns, drops, and suspicious egress that drive the score.'
            }),
            action: async (state, statusEl) => {
                const target = state.focus && state.focus.ip ? state.focus.ip : state.targetIp;
                updateStatus(statusEl, `Explaining ${target}...`);
                invoke(`explain ${target}`);
                await delay(900);
            }
        },
        {
            id: 'evidence',
            view: (state) => ({
                kicker: 'Live walkthrough',
                title: 'Show proof lines',
                highlight: state.focus && state.focus.ip ? state.focus.ip : 'Evidence lines',
                meta: 'Raw log lines back every claim.',
                status: 'Fetching evidence...',
                beforeSpeech: 'Every claim is backed by raw evidence lines, no black box.',
                afterSpeech: 'Those lines are the proof. You can cite them directly in reports.'
            }),
            action: async (state, statusEl) => {
                const target = state.focus && state.focus.ip ? state.focus.ip : state.targetIp;
                updateStatus(statusEl, `Showing evidence for ${target}...`);
                invoke(`show evidence ${target}`);
                await delay(2500); // Give user time to see the evidence modal
                closeAnyOpenModals(); // Close the evidence modal before next step
                await delay(300);
            }
        },
        {
            id: 'diff',
            view: () => ({
                kicker: 'Live walkthrough',
                title: 'Diff against baseline',
                highlight: 'Novelty detection',
                meta: 'New hosts, destinations, and rare ports.',
                status: 'Comparing with baseline...',
                beforeSpeech: 'Let me compare against the baseline to spot what is new.',
                afterSpeech: 'The diff highlights novelty and behavioral shifts, not just raw volume.'
            }),
            action: async (state, statusEl) => {
                updateStatus(statusEl, 'Comparing to baseline...');
                invoke('compare last');
                await delay(900);
            }
        },
        {
            id: 'remediate',
            view: (state) => ({
                kicker: 'Live walkthrough',
                title: 'Remediation guidance',
                highlight: 'Copy/paste commands',
                meta: 'Never auto-executed, always user controlled.',
                status: 'Generating remediation...',
                beforeSpeech: 'Next, I generate remediation commands, copy/paste only.',
                afterSpeech: 'You stay in control. Nothing runs without explicit action.'
            }),
            action: async (state, statusEl) => {
                const target = state.focus && state.focus.ip ? state.focus.ip : state.targetIp;
                updateStatus(statusEl, `Generating remediation for ${target}...`);
                invoke(`remediate ${target}`);
                await delay(2000); // Give user time to see the remediation
                closeAnyOpenModals(); // Close any modal before next step
                await delay(300);
            }
        },
        {
            id: 'export',
            view: () => ({
                kicker: 'Live walkthrough',
                title: 'Evidence bundle',
                highlight: 'Signed ZIP export',
                meta: 'HTML story + JSON artifacts + timestamps.',
                status: 'Exporting evidence...',
                beforeSpeech: 'Now I package the evidence for handoff.',
                afterSpeech: 'You get a signed ZIP with everything needed for incident reporting.'
            }),
            action: async (state, statusEl) => {
                updateStatus(statusEl, 'Exporting evidence...');
                invoke('export evidence');
                await delay(1500);
                closeAnyOpenModals(); // Close any modal before Theater Mode
                await delay(300);
            }
        },
        {
            id: 'theater',
            view: () => ({
                kicker: 'Live walkthrough',
                title: 'Theater Mode',
                highlight: 'Boardroom-ready narrative',
                meta: 'Snapshot, triage, diff, hypothesis, remediation.',
                status: 'Launching Theater Mode...',
                beforeSpeech: 'Finally, I turn the run into a polished Theater Mode story.',
                afterSpeech: 'That is the full journey, end to end, with proof at every step.'
            }),
            action: async (state, statusEl) => {
                updateStatus(statusEl, 'Launching Theater Mode...');
                await presentTheaterSlides(getApp(), state);
            }
        }
    ];
}

async function runLiveDemo() {
    if (journeyAborted) return;

    const core = journeyCore;
    if (!core) return;

    setOverlayMode('journey-overlay-presenter');

    try {
        const createdId = await ensureDemoCase(core);
        const activeId = createdId || (typeof core.getActiveCaseId === 'function' ? core.getActiveCaseId() : null);
        const caseId = activeId || `demo_${Date.now()}_${Math.random().toString(16).slice(2)}`;

        if (core.analysisJobInProgress) {
            await showSpeechBubble('Analysis is already running. I will wait before continuing.', { lingerMs: 2000 });
            const ready = await waitForAnalysis(core, 25000);
            if (!ready) throw new Error('analysis_timeout');
        }

        if (typeof core.resetCase === 'function') {
            core.resetCase(true);
        }

        if (core.DB && typeof core.DB === 'object') {
            if (!Array.isArray(core.DB.inputs)) core.DB.inputs = [];
            if (!Array.isArray(core.DB.cloudEvents)) core.DB.cloudEvents = [];
        }

        const datasets = buildDemoDatasets();
        const state = {
            caseId,
            targetIp: datasets.targetIp,
            focus: { ip: datasets.targetIp }
        };
        const originalIocs = Array.isArray(core.IOCS) ? core.IOCS.slice() : [];

        try {
            const steps = buildLiveDemoSteps(core, state, datasets);
            const baseProgress = 50;
            const progressPerStep = 35 / steps.length;

            for (let i = 0; i < steps.length && !journeyAborted; i++) {
                const step = steps[i];
                const view = typeof step.view === 'function' ? step.view(state) : step;
                const stepStatus = renderLiveDemoStep(view, i, steps.length);
                updateProgress(baseProgress + (i * progressPerStep));

                const beforeSpeech = typeof view.beforeSpeech === 'function' ? view.beforeSpeech(state) : view.beforeSpeech;
                if (beforeSpeech) {
                    await showSpeechBubble(beforeSpeech, { lingerMs: 2200 });
                }

                if (step.action) {
                    if (stepStatus && view.status) stepStatus.textContent = view.status;
                    await step.action(state, stepStatus);
                }

                const afterSpeech = typeof view.afterSpeech === 'function' ? view.afterSpeech(state) : view.afterSpeech;
                if (afterSpeech) {
                    await showSpeechBubble(afterSpeech, { lingerMs: 2200 });
                }

                await delay(320);
            }

            updateProgress(85);
        } finally {
            core.IOCS = originalIocs;
        }
    } catch (e) {
        console.error('[FullJourney] Demo error:', e);
        await showSpeechBubble("Something went wrong with the live walkthrough, but the feature tour still applies.", { lingerMs: 2200 });
    }

    // Restore overlay
    setOverlayMode(null);
    updateProgress(85);
}

// ============== PHASE 4: OUTRO ==============
async function runOutro() {
    if (journeyAborted) return;

    setOverlayMode(null);
    updateProgress(95);

    setContent(`
            <div class="journey-outro">
                <div class="journey-avatar-container">
                    <img src="${AVATAR_PATH}" alt="VulcansTrace" class="journey-avatar animate-wave">
                </div>
                <div class="journey-title">That's VulcansTrace!</div>
                <div class="journey-speech">
                    <div class="speech-bubble">
                        <span class="speech-text"></span>
                        <span class="speech-cursor">|</span>
                    </div>
                </div>
                <div class="journey-finale-text animate-fade-in-delay">
                    Offline-first. Proof-backed. Ready to analyze your logs.
                </div>
                <div class="journey-buttons animate-fade-in-delay-2">
                    <button class="journey-btn journey-btn-restart" onclick="FullJourneyDemo.restart()">
                        🔄 Restart Journey
                    </button>
                    <button class="journey-btn journey-btn-exit" onclick="FullJourneyDemo.close()">
                        ✕ Exit
                    </button>
                </div>
            </div>
        `);

    await delay(600);
    await showSpeechBubble("Thanks for taking the journey. Ready to try it yourself?", { lingerMs: 2400 });

    updateProgress(100);
}

// ============== MAIN RUNNER ==============
async function start(core) {
    journeyCore = core;
    journeyAborted = false;
    journeyPhase = 0;

    createOverlay();
    journeyOverlay.classList.add('visible');

    try {
        // Phase 1: Intro
        journeyPhase = 1;
        await runIntro();
        if (journeyAborted) return;

        // Phase 2: Feature Tour
        journeyPhase = 2;
        await runFeatureTour();
        if (journeyAborted) return;

        // Phase 3: Live Demo
        journeyPhase = 3;
        await runLiveDemo();
        if (journeyAborted) return;

        // Phase 4: Outro
        journeyPhase = 4;
        await runOutro();

    } catch (e) {
        console.error('[FullJourney] Error:', e);
        close();
    }
}

function close() {
    journeyAborted = true;
    if (journeyOverlay) {
        journeyOverlay.classList.remove('journey-overlay-minimized', 'journey-overlay-presenter');
        journeyOverlay.classList.remove('visible');
        setTimeout(() => destroyOverlay(), 400);
    }
}

function restart() {
    close();
    setTimeout(() => start(journeyCore), 500);
}
// ============== EXPORTS ==============
export const FullJourneyDemo = {
    start,
    close,
    restart
};

// Make available on globalThis for backward compatibility
if (typeof globalThis !== 'undefined') {
    globalThis.FullJourneyDemo = FullJourneyDemo;
}

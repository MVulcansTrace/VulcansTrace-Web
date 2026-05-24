/* Defense Story Demo - Cinematic Lockheed Martin Kill Chain walkthrough */
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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms || 0)));
}

function estimateSpeechDuration(text, minMs = 0) {
    const raw = String(text || '').trim();
    if (!raw) return Math.max(0, Number.isFinite(minMs) ? minMs : 0);
    const words = raw.split(/\s+/).filter(Boolean);
    const baseMs = 1000;
    const perWordMs = 280;
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
        const label = `Defense Story Demo ${new Date().toISOString().slice(0, 10)}`;
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

function buildRiskMap(stats) {
    const map = new Map();
    const list = stats && Array.isArray(stats.risk) ? stats.risk : [];
    list.forEach(entry => {
        if (entry && entry.ip) map.set(String(entry.ip), entry);
    });
    return map;
}

function formatRiskLine(risk) {
    if (!risk) return 'Risk: Unscored';
    const level = risk.level ? String(risk.level) : 'Unknown';
    const score = Number.isFinite(risk.score) ? `Score ${risk.score}` : 'Score n/a';
    return `Risk: ${level} | ${score}`;
}

function getBadgeClass(signal) {
    const key = String(signal || '').toLowerCase();
    if (key === 'scanner') return 'defense-badge--scanner';
    if (key === 'chain') return 'defense-badge--chain';
    if (key === 'egress') return 'defense-badge--egress';
    if (key === 'lateral') return 'defense-badge--lateral';
    if (key === 'staging') return 'defense-badge--staging';
    if (key === 'access') return 'defense-badge--access';
    if (key === 'payload') return 'defense-badge--payload';
    if (key === 'persistence') return 'defense-badge--persistence';
    if (key === 'cover') return 'defense-badge--cover';
    return 'defense-badge--neutral';
}

function buildDefenseDatasets() {
    const reconScan = [
        '2025-01-02 12:00:00 DROP TCP 203.0.113.45 10.0.0.10 50200 22',
        '2025-01-02 12:00:01 DROP TCP 203.0.113.45 10.0.0.10 50201 23',
        '2025-01-02 12:00:02 DROP TCP 203.0.113.45 10.0.0.10 50202 80',
        '2025-01-02 12:00:03 DROP TCP 203.0.113.45 10.0.0.10 50203 443',
        '2025-01-02 12:00:04 DROP TCP 203.0.113.45 10.0.0.10 50204 3389',
        '2025-01-02 12:00:05 DROP TCP 203.0.113.45 10.0.0.10 50205 445',
        '2025-01-02 12:00:06 DROP TCP 203.0.113.45 10.0.0.10 50206 5985'
    ].join('\n');

    const edgeDrop = [
        '2025-01-02 12:05:00 DROP TCP 198.51.100.77 172.16.0.10 52000 443'
    ].join('\n');

    const appAllow = [
        '2025-01-02 12:06:30 ALLOW TCP 198.51.100.77 10.0.0.20 52001 443'
    ].join('\n');

    const c2Egress = [
        '2025-01-02 12:12:00 ALLOW TCP 10.0.1.77 8.8.8.8 53000 443',
        '2025-01-02 12:12:05 ALLOW TCP 10.0.1.77 1.1.1.1 53001 443',
        '2025-01-02 12:12:10 ALLOW TCP 10.0.1.77 9.9.9.9 53002 443',
        '2025-01-02 12:12:15 ALLOW TCP 10.0.1.77 52.95.110.1 53003 443',
        '2025-01-02 12:12:20 ALLOW TCP 10.0.1.77 104.16.132.229 53004 443',
        '2025-01-02 12:12:25 ALLOW TCP 10.0.1.77 13.107.246.45 53005 443',
        '2025-01-02 12:12:30 ALLOW TCP 10.0.1.77 142.250.72.206 53006 443',
        '2025-01-02 12:12:35 ALLOW TCP 10.0.1.77 18.67.88.22 53007 443'
    ].join('\n');

    const lateralSpread = [
        '2025-01-02 12:14:00 ALLOW TCP 10.0.1.77 10.0.2.20 54000 445',
        '2025-01-02 12:14:08 ALLOW TCP 10.0.1.77 10.0.2.21 54001 445',
        '2025-01-02 12:14:16 ALLOW TCP 10.0.1.77 10.0.3.15 54002 3389',
        '2025-01-02 12:14:24 ALLOW TCP 10.0.1.77 10.0.4.12 54003 5985'
    ].join('\n');

    const cloudTrailRecords = [
        {
            eventTime: '2025-01-02T12:02:30Z',
            eventSource: 's3.amazonaws.com',
            eventName: 'PutObject',
            awsRegion: 'us-east-1',
            sourceIPAddress: '198.51.100.77',
            userAgent: 'aws-cli/2.13',
            userIdentity: {
                type: 'AssumedRole',
                arn: 'arn:aws:sts::123456789012:assumed-role/BuildBot/defense-demo',
                accountId: '123456789012',
                userName: 'defense-demo'
            },
            resources: [
                { ARN: 'arn:aws:s3:::vulcanstrace-staging/phase2/payload.zip' }
            ]
        },
        {
            eventTime: '2025-01-02T12:03:20Z',
            eventSource: 'sts.amazonaws.com',
            eventName: 'AssumeRole',
            awsRegion: 'us-east-1',
            sourceIPAddress: '203.0.113.45',
            userAgent: 'aws-cli/2.13',
            userIdentity: {
                type: 'IAMUser',
                arn: 'arn:aws:iam::123456789012:user/ops-delivery',
                accountId: '123456789012',
                userName: 'ops-delivery'
            },
            resources: [
                { ARN: 'arn:aws:iam::123456789012:role/EdgeDeployRole' }
            ]
        },
        {
            eventTime: '2025-01-02T12:06:45Z',
            eventSource: 's3.amazonaws.com',
            eventName: 'GetObject',
            awsRegion: 'us-east-1',
            sourceIPAddress: '198.51.100.77',
            userAgent: 'aws-cli/2.13',
            userIdentity: {
                type: 'AssumedRole',
                arn: 'arn:aws:sts::123456789012:assumed-role/EdgeDeployRole/defense-demo',
                accountId: '123456789012',
                userName: 'defense-demo'
            },
            resources: [
                { ARN: 'arn:aws:s3:::vulcanstrace-staging/phase4/payload.zip' }
            ]
        },
        {
            eventTime: '2025-01-02T12:07:30Z',
            eventSource: 'iam.amazonaws.com',
            eventName: 'CreateAccessKey',
            awsRegion: 'us-east-1',
            sourceIPAddress: '198.51.100.77',
            userAgent: 'aws-cli/2.13',
            userIdentity: {
                type: 'IAMUser',
                arn: 'arn:aws:iam::123456789012:user/persist-agent',
                accountId: '123456789012',
                userName: 'persist-agent'
            },
            resources: [
                { ARN: 'arn:aws:iam::123456789012:user/persist-agent' }
            ]
        },
        {
            eventTime: '2025-01-02T12:15:10Z',
            eventSource: 'cloudtrail.amazonaws.com',
            eventName: 'StopLogging',
            awsRegion: 'us-east-1',
            sourceIPAddress: '198.51.100.77',
            userAgent: 'aws-cli/2.13',
            userIdentity: {
                type: 'AssumedRole',
                arn: 'arn:aws:sts::123456789012:assumed-role/EdgeDeployRole/defense-demo',
                accountId: '123456789012',
                userName: 'defense-demo'
            },
            resources: [
                { ARN: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/defense-trail' }
            ]
        }
    ];

    return {
        flows: {
            reconScan,
            edgeDrop,
            appAllow,
            c2Egress,
            lateralSpread
        },
        cloudTrailJson: JSON.stringify({ Records: cloudTrailRecords }, null, 2)
    };
}

function buildEvidenceCard(card, risk, index) {
    const delayMs = Math.min(200, index * 80);
    const badgeClass = getBadgeClass(card.signal);
    const signal = escapeHtml(card.signal || 'Signal');
    const title = escapeHtml(card.title || 'Evidence');
    const subtitle = escapeHtml(card.subtitle || '');
    const timestamp = escapeHtml(card.timestamp || '');
    const query = card.query ? escapeHtml(card.query) : '';
    const queryId = `defense-query-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const details = Array.isArray(card.details) ? card.details : [];

    const detailRows = details.map(item => {
        const label = escapeHtml(item.label || '');
        const value = escapeHtml(item.value || '');
        return `
            <div class="defense-card-row">
                <span class="defense-card-label">${label}</span>
                <span class="defense-card-value">${value}</span>
            </div>
        `;
    }).join('');

    const riskLine = card.type === 'flow' ? formatRiskLine(risk) : `Signal Class: ${signal}`;

    return `
        <div class="defense-card" style="animation-delay:${delayMs}ms">
            <div class="defense-card-top">
                <span class="defense-badge ${badgeClass}">${signal}</span>
                <span class="defense-card-kind">${card.type === 'cloudtrail' ? 'CloudTrail evidence' : 'Flow evidence'}</span>
            </div>
            <div class="defense-card-title">${title}</div>
            ${subtitle ? `<div class="defense-card-subtitle">${subtitle}</div>` : ''}
            ${timestamp ? `<div class="defense-card-meta">${timestamp}</div>` : ''}
            <div class="defense-card-rows">${detailRows}</div>
            <div class="defense-card-risk">${escapeHtml(riskLine)}</div>
            ${query ? `
                <button class="defense-query-toggle" data-target="${queryId}">
                    <svg class="icon"><use href="#i-code"></use></svg>
                    <span>View query</span>
                </button>
                <pre id="${queryId}" class="defense-query"><code>${query}</code></pre>
            ` : ''}
        </div>
    `;
}

const AVATAR_PATH = 'assets/VulcansTraceAvatar.png';

const DEFENSE_PHASES = [
    {
        key: 'recon',
        title: 'Reconnaissance',
        subtitle: 'Scanning for exposed services',
        speech: [
            'Phase 1: Reconnaissance. Attackers map exposed services across the perimeter.',
            'I flag the probe pattern as SCANNER and surface the dropped attempts.'
        ],
        agentCommand: 'explain 203.0.113.45',
        cards: [
            {
                type: 'flow',
                signal: 'SCANNER',
                title: 'Perimeter scan burst',
                subtitle: '203.0.113.45 -> 10.0.0.10',
                timestamp: '2025-01-02 12:00:06',
                ip: '203.0.113.45',
                details: [
                    { label: 'Ports', value: '22, 23, 80, 443, 3389, 445, 5985' },
                    { label: 'Action', value: 'DROP (7 events)' },
                    { label: 'Dataset', value: 'recon-scan.log' }
                ],
                query: "SELECT src, COUNT(DISTINCT dport) AS ports, COUNT(*) AS drops FROM flows WHERE src = '203.0.113.45' AND action = 'DROP' GROUP BY src;"
            }
        ]
    },
    {
        key: 'weaponization',
        title: 'Weaponization',
        subtitle: 'Payload staging before delivery',
        speech: [
            'Phase 2: Weaponization. Payloads get staged before delivery.',
            'CloudTrail shows a PutObject into a staging bucket.'
        ],
        cards: [
            {
                type: 'cloudtrail',
                signal: 'STAGING',
                title: 'PutObject',
                subtitle: 'arn:aws:sts::123456789012:assumed-role/BuildBot/defense-demo',
                timestamp: '2025-01-02T12:02:30Z',
                details: [
                    { label: 'Source IP', value: '198.51.100.77' },
                    { label: 'Region', value: 'us-east-1' },
                    { label: 'Resource', value: 'vulcanstrace-staging/phase2/payload.zip' },
                    { label: 'Dataset', value: 'ct-killchain.json' }
                ],
                query: "SELECT eventTime, eventName, eventSource, userIdentityArn, resourcesArns FROM cloudtrail WHERE eventName = 'PutObject';"
            }
        ]
    },
    {
        key: 'delivery',
        title: 'Delivery',
        subtitle: 'Role handoff and access pivot',
        speech: [
            'Phase 3: Delivery. Access shifts to a new role for the next step.',
            'The AssumeRole event ties delivery to a fresh session.'
        ],
        cards: [
            {
                type: 'cloudtrail',
                signal: 'ACCESS',
                title: 'AssumeRole',
                subtitle: 'arn:aws:iam::123456789012:user/ops-delivery',
                timestamp: '2025-01-02T12:03:20Z',
                details: [
                    { label: 'Source IP', value: '203.0.113.45' },
                    { label: 'Region', value: 'us-east-1' },
                    { label: 'Role', value: 'EdgeDeployRole' },
                    { label: 'Dataset', value: 'ct-killchain.json' }
                ],
                query: "SELECT eventTime, eventName, eventSource, userIdentityArn, sourceIPAddress FROM cloudtrail WHERE eventName = 'AssumeRole';"
            }
        ]
    },
    {
        key: 'exploitation',
        title: 'Exploitation',
        subtitle: 'Drop -> allow chain on the same port',
        speech: [
            'Phase 4: Exploitation. A blocked edge hit flips to an allow on 443.',
            'The blocked-then-allowed chain and a GetObject pull mark exploitation.'
        ],
        agentCommand: 'explain 198.51.100.77',
        cards: [
            {
                type: 'flow',
                signal: 'CHAIN',
                title: 'Blocked -> breached chain',
                subtitle: '198.51.100.77 on port 443',
                timestamp: '2025-01-02 12:06:30',
                ip: '198.51.100.77',
                details: [
                    { label: 'Edge', value: 'DROP on edge-fw.log' },
                    { label: 'App', value: 'ALLOW on app-fw.log' },
                    { label: 'Window', value: '90 seconds' },
                    { label: 'Dataset', value: 'edge-fw.log + app-fw.log' }
                ],
                query: "SELECT src, dport, action, _file, date, time FROM flows WHERE src = '198.51.100.77' AND dport = '443' ORDER BY date, time;"
            },
            {
                type: 'cloudtrail',
                signal: 'PAYLOAD',
                title: 'GetObject',
                subtitle: 'arn:aws:sts::123456789012:assumed-role/EdgeDeployRole/defense-demo',
                timestamp: '2025-01-02T12:06:45Z',
                details: [
                    { label: 'Source IP', value: '198.51.100.77' },
                    { label: 'Region', value: 'us-east-1' },
                    { label: 'Resource', value: 'vulcanstrace-staging/phase4/payload.zip' },
                    { label: 'Dataset', value: 'ct-killchain.json' }
                ],
                query: "SELECT eventTime, eventName, eventSource, userIdentityArn, resourcesArns FROM cloudtrail WHERE eventName = 'GetObject';"
            }
        ]
    },
    {
        key: 'installation',
        title: 'Installation',
        subtitle: 'Credentials added for persistence',
        speech: [
            'Phase 5: Installation. New credentials indicate persistence.',
            'CreateAccessKey is the durable footprint.'
        ],
        cards: [
            {
                type: 'cloudtrail',
                signal: 'PERSISTENCE',
                title: 'CreateAccessKey',
                subtitle: 'arn:aws:iam::123456789012:user/persist-agent',
                timestamp: '2025-01-02T12:07:30Z',
                details: [
                    { label: 'Source IP', value: '198.51.100.77' },
                    { label: 'Region', value: 'us-east-1' },
                    { label: 'User', value: 'persist-agent' },
                    { label: 'Dataset', value: 'ct-killchain.json' }
                ],
                query: "SELECT eventTime, eventName, eventSource, userIdentityArn, sourceIPAddress FROM cloudtrail WHERE eventName = 'CreateAccessKey';"
            }
        ]
    },
    {
        key: 'c2',
        title: 'Command & Control',
        subtitle: 'Outbound spread to external nodes',
        speech: [
            'Phase 6: Command and Control. One host fans out to many externals.',
            'I tag the outbound spread as EGRESS and keep the evidence inline.'
        ],
        agentCommand: 'investigate 10.0.1.77',
        cards: [
            {
                type: 'flow',
                signal: 'EGRESS',
                title: 'Outbound fan-out',
                subtitle: '10.0.1.77 -> multiple external destinations',
                timestamp: '2025-01-02 12:12:35',
                ip: '10.0.1.77',
                details: [
                    { label: 'Unique dests', value: '8 external hosts' },
                    { label: 'Ports', value: '443 (TLS)' },
                    { label: 'Dataset', value: 'c2-egress.log' }
                ],
                query: "SELECT src, COUNT(DISTINCT dst) AS outbound_dests FROM flows WHERE src = '10.0.1.77' AND dst NOT LIKE '10.%' AND dst NOT LIKE '192.168.%' AND dst NOT LIKE '172.16.%' GROUP BY src;"
            }
        ]
    },
    {
        key: 'actions',
        title: 'Actions on Objectives',
        subtitle: 'Lateral movement and cover attempts',
        speech: [
            'Phase 7: Actions. The same host pivots across internal systems.',
            'LATERAL signals pair with StopLogging to show cover attempts.'
        ],
        cards: [
            {
                type: 'flow',
                signal: 'LATERAL',
                title: 'Internal pivot',
                subtitle: '10.0.1.77 -> multiple internal targets',
                timestamp: '2025-01-02 12:14:24',
                ip: '10.0.1.77',
                details: [
                    { label: 'Targets', value: '10.0.2.20, 10.0.2.21, 10.0.3.15, 10.0.4.12' },
                    { label: 'Ports', value: '445, 3389, 5985' },
                    { label: 'Dataset', value: 'lateral-spread.log' }
                ],
                query: "SELECT src, COUNT(DISTINCT _file) AS files, COUNT(DISTINCT dst) AS internal_targets FROM flows WHERE src = '10.0.1.77' AND dst LIKE '10.%' GROUP BY src;"
            },
            {
                type: 'cloudtrail',
                signal: 'COVER',
                title: 'StopLogging',
                subtitle: 'arn:aws:sts::123456789012:assumed-role/EdgeDeployRole/defense-demo',
                timestamp: '2025-01-02T12:15:10Z',
                details: [
                    { label: 'Source IP', value: '198.51.100.77' },
                    { label: 'Region', value: 'us-east-1' },
                    { label: 'Trail', value: 'defense-trail' },
                    { label: 'Dataset', value: 'ct-killchain.json' }
                ],
                query: "SELECT eventTime, eventName, eventSource, userIdentityArn, sourceIPAddress FROM cloudtrail WHERE eventName = 'StopLogging';"
            }
        ]
    }
];

let defenseOverlay = null;
let defenseCore = null;
let defenseAborted = false;

function createOverlay() {
    if (defenseOverlay) return defenseOverlay;

    const overlay = document.createElement('div');
    overlay.id = 'defense-overlay';
    overlay.className = 'defense-overlay';
    overlay.innerHTML = `
        <div class="defense-backdrop"></div>
        <div class="defense-container">
            <button class="defense-exit-btn" data-role="defense-exit">Exit</button>
            <div class="defense-progress">
                <div class="defense-progress-bar"></div>
            </div>
            <div class="defense-content"></div>
        </div>
    `;

    document.body.appendChild(overlay);

    const exitBtn = overlay.querySelector('[data-role="defense-exit"]');
    if (exitBtn) {
        exitBtn.addEventListener('click', () => close());
    }

    defenseOverlay = overlay;
    return overlay;
}

function destroyOverlay() {
    if (defenseOverlay) {
        defenseOverlay.remove();
        defenseOverlay = null;
    }
}

function updateProgress(percent) {
    const bar = defenseOverlay?.querySelector('.defense-progress-bar');
    if (bar) {
        bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }
}

function setContent(html) {
    const container = defenseOverlay?.querySelector('.defense-content');
    if (container) {
        container.innerHTML = html;
    }
}

async function typeText(element, text, speed = 26) {
    if (!element || defenseAborted) return;

    element.textContent = '';
    for (let i = 0; i < text.length && !defenseAborted; i++) {
        element.textContent += text[i];
        await delay(speed);
    }
}

async function showSpeechBubble(speech, options = null) {
    if (defenseAborted) return;

    const bubble = defenseOverlay?.querySelector('.defense-speech');
    if (!bubble) return;
    const text = String(speech || '').trim();
    if (!text) return;

    const opts = (typeof options === 'number') ? { lingerMs: options } : (options && typeof options === 'object' ? options : {});
    const typeSpeed = Number.isFinite(opts.typeSpeed) ? opts.typeSpeed : 24;
    const minLinger = Number.isFinite(opts.lingerMs) ? opts.lingerMs : 0;
    const lingerMs = estimateSpeechDuration(text, minLinger);

    bubble.classList.add('visible');
    await typeText(bubble.querySelector('.defense-speech-text'), text, typeSpeed);
    await delay(lingerMs);
    bubble.classList.remove('visible');
    await delay(260);
}

function renderTimeline(activeIndex) {
    const total = DEFENSE_PHASES.length;
    const steps = DEFENSE_PHASES.map((phase, idx) => {
        const label = phase.title.split(' ')[0];
        const isActive = idx === activeIndex;
        const isComplete = idx < activeIndex;
        const status = isActive ? 'active' : (isComplete ? 'complete' : '');
        return `
            <div class="defense-step ${status}">
                <div class="defense-step-dot">${idx + 1}</div>
                <div class="defense-step-label">${escapeHtml(label)}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="defense-timeline">
            <div class="defense-timeline-track"></div>
            ${steps}
            <div class="defense-timeline-meta">${activeIndex + 1} of ${total}</div>
        </div>
    `;
}

function renderPhaseContent(state, phase, index) {
    const cards = (phase.cards || []).map((card, idx) => {
        const risk = card.ip ? state.riskMap.get(card.ip) : null;
        return buildEvidenceCard(card, risk, idx);
    }).join('');

    return `
        <div class="defense-stage">
            ${renderTimeline(index)}
            <div class="defense-grid">
                <div class="defense-hero">
                    <div class="defense-avatar-shell">
                        <div class="defense-avatar-ring">
                            <div class="defense-radar-sweep"></div>
                            <img src="${AVATAR_PATH}" alt="VulcansTrace" class="defense-avatar">
                        </div>
                    </div>
                    <div class="defense-phase-meta">
                        <div class="defense-phase-kicker">Kill Chain Phase ${index + 1}</div>
                        <div class="defense-phase-title">${escapeHtml(phase.title)}</div>
                        <div class="defense-phase-subtitle">${escapeHtml(phase.subtitle)}</div>
                    </div>
                    <div class="defense-speech">
                        <div class="defense-speech-bubble">
                            <span class="defense-speech-text"></span>
                            <span class="defense-speech-cursor">|</span>
                        </div>
                    </div>
                </div>
                <div class="defense-evidence">
                    ${cards}
                </div>
            </div>
        </div>
    `;
}

function attachQueryToggles() {
    if (!defenseOverlay) return;
    const toggles = defenseOverlay.querySelectorAll('.defense-query-toggle');
    toggles.forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return;
            const block = defenseOverlay.querySelector(`#${targetId}`);
            if (!block) return;
            const isOpen = block.classList.toggle('open');
            const label = btn.querySelector('span');
            if (label) label.textContent = isOpen ? 'Hide query' : 'View query';
        });
    });
}

function invokeAgent(core, cmd) {
    if (!cmd || !core) return;
    if (typeof core.invokeAgentCommand === 'function') {
        core.invokeAgentCommand(cmd, {
            showUserMessage: false,
            auto: true,
            transcriptUserText: `[defense_story] ${cmd}`
        });
        return;
    }
    if (typeof core.processCommand === 'function') core.processCommand(cmd);
}

async function runIntro() {
    if (defenseAborted) return;

    updateProgress(5);
    setContent(`
        <div class="defense-intro">
            <div class="defense-avatar-shell">
                <div class="defense-avatar-ring">
                    <div class="defense-radar-sweep"></div>
                    <img src="${AVATAR_PATH}" alt="VulcansTrace" class="defense-avatar">
                </div>
            </div>
            <div class="defense-intro-title">Defense Story</div>
            <div class="defense-intro-subtitle">Lockheed Martin Cyber Kill Chain, mapped to VulcansTrace evidence.</div>
            <div class="defense-speech">
                <div class="defense-speech-bubble">
                    <span class="defense-speech-text"></span>
                    <span class="defense-speech-cursor">|</span>
                </div>
            </div>
        </div>
    `);

    await delay(600);
    await showSpeechBubble('I will walk the full kill chain using real evidence from this case.', { lingerMs: 2000 });
    await showSpeechBubble('Every phase stays grounded in what VulcansTrace actually detects.', { lingerMs: 2000 });
    updateProgress(10);
}

async function runSetup(state) {
    if (defenseAborted) return;

    updateProgress(15);
    setContent(`
        <div class="defense-loader">
            <div class="defense-avatar-shell">
                <div class="defense-avatar-ring">
                    <div class="defense-radar-sweep"></div>
                    <img src="${AVATAR_PATH}" alt="VulcansTrace" class="defense-avatar">
                </div>
            </div>
            <div class="defense-loader-title">Assembling Defense Evidence</div>
            <div class="defense-loader-status" data-role="defense-status">Preparing datasets...</div>
            <div class="defense-speech">
                <div class="defense-speech-bubble">
                    <span class="defense-speech-text"></span>
                    <span class="defense-speech-cursor">|</span>
                </div>
            </div>
        </div>
    `);

    await showSpeechBubble('Loading staged logs and CloudTrail events for the story.', { lingerMs: 1800 });

    const statusEl = defenseOverlay?.querySelector('[data-role="defense-status"]');
    const updateStatus = (text) => {
        if (statusEl) statusEl.textContent = String(text || '');
    };

    const core = defenseCore;
    if (!core) return;

    const createdId = await ensureDemoCase(core);
    const activeId = createdId || (typeof core.getActiveCaseId === 'function' ? core.getActiveCaseId() : null);
    state.caseId = activeId || `defense_demo_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    if (core.analysisJobInProgress) {
        updateStatus('Waiting for analysis to finish...');
        await waitForAnalysis(core, 25000);
    }

    if (typeof core.resetCase === 'function') {
        core.resetCase(true);
    }

    if (core.DB && typeof core.DB === 'object') {
        if (!Array.isArray(core.DB.inputs)) core.DB.inputs = [];
        if (!Array.isArray(core.DB.cloudEvents)) core.DB.cloudEvents = [];
    }

    const datasets = buildDefenseDatasets();
    try {
        updateStatus('Ingesting recon signals...');
        await addTextDataset(core, 'recon-scan.log', datasets.flows.reconScan, { caseId: state.caseId });
        updateStatus('Ingesting chain evidence...');
        await addTextDataset(core, 'edge-fw.log', datasets.flows.edgeDrop, { caseId: state.caseId });
        await addTextDataset(core, 'app-fw.log', datasets.flows.appAllow, { caseId: state.caseId });
        updateStatus('Ingesting egress and lateral flows...');
        await addTextDataset(core, 'c2-egress.log', datasets.flows.c2Egress, { caseId: state.caseId });
        await addTextDataset(core, 'lateral-spread.log', datasets.flows.lateralSpread, { caseId: state.caseId });
        updateStatus('Ingesting CloudTrail evidence...');
        await addTextDataset(core, 'ct-killchain.json', datasets.cloudTrailJson, { caseId: state.caseId });

        if (core.DB) {
            core.DB.startTime = new Date().toISOString();
        }

        updateStatus('Running analysis...');
        const nextJobId = Number.isFinite(core.analysisJobId) ? (core.analysisJobId + 1) : 0;
        if (nextJobId) core.agentLastAutoTopJobId = nextJobId;
        if (typeof core.aggregateAnalysis === 'function') {
            await core.aggregateAnalysis();
        }

        const ready = await waitForAnalysis(core, 25000);
        if (!ready) throw new Error('analysis_timeout');
        const stats = typeof core.getStats === 'function' ? core.getStats() : core.STATS;
        state.riskMap = buildRiskMap(stats);
        updateStatus('Evidence locked and ready.');
        await delay(600);
    } catch (err) {
        console.error('[DefenseStory] Setup error:', err);
        updateStatus('Evidence load failed.');
        await showSpeechBubble('Setup hit a snag, but I can still narrate the story.', { lingerMs: 1800 });
    }

    updateProgress(20);
}

async function runPhases(state) {
    if (defenseAborted) return;

    const total = DEFENSE_PHASES.length;
    for (let i = 0; i < total && !defenseAborted; i++) {
        const phase = DEFENSE_PHASES[i];
        updateProgress(20 + (i * (70 / total)));
        setContent(renderPhaseContent(state, phase, i));
        attachQueryToggles();

        if (phase.agentCommand) {
            invokeAgent(defenseCore, phase.agentCommand);
        }

        if (Array.isArray(phase.speech)) {
            for (const line of phase.speech) {
                await showSpeechBubble(line, { lingerMs: 1800 });
                if (defenseAborted) break;
            }
        }

        await delay(400);
    }

    updateProgress(90);
}

async function runOutro() {
    if (defenseAborted) return;

    updateProgress(95);
    setContent(`
        <div class="defense-outro">
            <div class="defense-avatar-shell">
                <div class="defense-avatar-ring">
                    <div class="defense-radar-sweep"></div>
                    <img src="${AVATAR_PATH}" alt="VulcansTrace" class="defense-avatar">
                </div>
            </div>
            <div class="defense-outro-title">Defense Story Complete</div>
            <div class="defense-outro-subtitle">Seven phases, matched to VulcansTrace evidence and signals.</div>
            <div class="defense-speech">
                <div class="defense-speech-bubble">
                    <span class="defense-speech-text"></span>
                    <span class="defense-speech-cursor">|</span>
                </div>
            </div>
            <div class="defense-actions">
                <button class="defense-btn defense-btn-primary" onclick="DefenseStoryDemo.restart()">
                    Restart Story
                </button>
                <button class="defense-btn defense-btn-secondary" onclick="DefenseStoryDemo.close()">
                    Exit
                </button>
                <button class="defense-btn defense-btn-ghost" onclick="window.logAnalystApp && window.logAnalystApp.queryConsoleModal && window.logAnalystApp.queryConsoleModal.open && window.logAnalystApp.queryConsoleModal.open()">
                    Open Query Console
                </button>
            </div>
        </div>
    `);

    await delay(600);
    await showSpeechBubble('You can rerun the story or explore the evidence yourself.', { lingerMs: 2000 });
    updateProgress(100);
}

async function start(core) {
    defenseCore = core;
    defenseAborted = false;

    createOverlay();
    defenseOverlay.classList.add('visible');

    const state = { caseId: null, riskMap: new Map() };

    try {
        await runIntro();
        if (defenseAborted) return;
        await runSetup(state);
        if (defenseAborted) return;
        await runPhases(state);
        if (defenseAborted) return;
        await runOutro();
    } catch (e) {
        console.error('[DefenseStory] Error:', e);
        close();
    }
}

function close() {
    defenseAborted = true;
    if (defenseOverlay) {
        defenseOverlay.classList.remove('visible');
        setTimeout(() => destroyOverlay(), 400);
    }
}

function restart() {
    close();
    setTimeout(() => start(defenseCore), 500);
}

export const DefenseStoryDemo = {
    start,
    close,
    restart
};

if (typeof globalThis !== 'undefined') {
    globalThis.DefenseStoryDemo = DefenseStoryDemo;
}

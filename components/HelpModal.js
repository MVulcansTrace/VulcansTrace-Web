/* Help modal component */
export class HelpModal {
    constructor() {
        this.defaultSectionId = 'help-quickstart';
    }

    render() {
        return `
            <div id="helpModal" class="overlay">
                <div class="modal-box" style="max-width: 880px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-head">
                        <span>Help & Guide</span>
                        <span style="cursor:pointer" onclick="window.logAnalystApp.helpModal.close()">
                            <svg class="icon"><use href="#i-close"></use></svg>
                        </span>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        ${this.renderStyles()}
                        ${this.renderHero()}
                        ${this.renderControls()}
                        ${this.renderToc()}
                        <div class="help-grid">
                            ${this.renderQuickStart()}
                            ${this.renderWhatItDoes()}
                            ${this.renderExampleWorkflows()}
                            ${this.renderWorkspacesAndDatasets()}
                            ${this.renderIngesting()}
                            ${this.renderReadingFindings()}
                            ${this.renderSettingsAndThreatIntel()}
                            ${this.renderSignalsAndScoring()}
                            ${this.renderAgentCommands()}
                            ${this.renderTheaterMode()}
                            ${this.renderKeyboardShortcuts()}
                            ${this.renderCloudTrail()}
                            ${this.renderSqlConsole()}
                            ${this.renderUnderTheHood()}
                            ${this.renderEvidence()}
                            ${this.renderPrivacy()}
                            ${this.renderTroubleshooting()}
                            ${this.renderGlossary()}
                        </div>
                    </div>
                    <div class="modal-foot" style="justify-content: space-between;">
                        <div class="text-xs" style="color: var(--text-muted);">
                            Quick Start has the basics—you'll be analyzing in no time.
                        </div>
                        <button class="btn btn-primary" onclick="window.logAnalystApp.helpModal.close()">Got it</button>
                    </div>
                </div>
            </div>
        `;
    }

    renderStyles() {
        return `
            <style>
                .help-hero {
                    padding: 12px 14px;
                    border: 1px solid var(--border);
                    background: rgba(51,65,85,0.22);
                    border-radius: 12px;
                }
                .help-hero h3 { margin: 0 0 6px 0; }
                .help-hero p { margin: 0; color: var(--text-muted); }

                .help-controls { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0 10px; }

                .help-toc {
                    margin: 10px 0 14px;
                    padding: 12px 14px;
                    border: 1px solid var(--border);
                    background: rgba(2,6,23,0.35);
                    border-radius: 12px;
                }
                .help-toc-title { font-weight: 700; margin-bottom: 6px; }
                .help-toc a {
                    color: var(--accent-cyan);
                    text-decoration: none;
                    border-bottom: 1px dotted rgba(6,182,212,0.6);
                    cursor: pointer;
                }
                .help-toc a:hover { color: #67e8f9; border-bottom-style: solid; }

                .help-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
                .help-details {
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    background: rgba(30,41,59,0.22);
                    overflow: hidden;
                }
                .help-details summary {
                    cursor: pointer;
                    padding: 12px 14px;
                    user-select: none;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                }
                .help-details summary::-webkit-details-marker { display: none; }
                .help-details summary .title { font-weight: 700; }
                .help-details summary .tag { font-size: 0.75rem; color: var(--text-muted); }
                .help-details .content { padding: 0 14px 14px 14px; color: var(--text-muted); }
                .help-details .content h4 { color: var(--text-main); margin: 12px 0 8px; }
                .help-details .content p { margin: 0 0 10px 0; }
                .help-details .content ul { margin: 8px 0 10px 18px; line-height: 1.55; }
                .help-details .content li { margin: 4px 0; }

                .help-note {
                    padding: 10px 12px;
                    border: 1px solid rgba(148,163,184,0.25);
                    border-radius: 10px;
                    background: rgba(2,6,23,0.30);
                }
                .help-callout {
                    padding: 10px 12px;
                    border: 1px solid rgba(6,182,212,0.35);
                    border-radius: 10px;
                    background: rgba(6,182,212,0.08);
                    color: var(--text-main);
                }
                .help-code {
                    padding: 10px 12px;
                    border: 1px solid rgba(148,163,184,0.22);
                    border-radius: 10px;
                    background: rgba(2,6,23,0.55);
                    overflow-x: auto;
                }
                .help-code pre { margin: 0; white-space: pre; }
                .help-kbd {
                    display: inline-block;
                    padding: 1px 6px;
                    border: 1px solid rgba(148,163,184,0.35);
                    border-bottom-width: 2px;
                    border-radius: 6px;
                    background: rgba(2,6,23,0.35);
                    font-size: 0.75rem;
                    color: var(--text-main);
                }
            </style>
        `;
    }

    renderHero() {
        return `
            <div class="help-hero">
                <h3 style="color: var(--accent-cyan);">Welcome to VulcansTrace</h3>
                <p>
                    VulcansTrace transforms complex security logs into clear, actionable insights. It stays offline-first (no uploads, no CDNs),
                    highlights suspicious behavior, supports cloud + network data, and lets you ask questions with SQL—then export
                    a defensible evidence bundle.
                </p>
            </div>
        `;
    }

    renderControls() {
        return `
            <div class="help-controls">
                <button class="btn" onclick="window.logAnalystApp.helpModal.expandAll()">
                    <svg class="icon"><use href="#i-plus"></use></svg> Expand all
                </button>
                <button class="btn" onclick="window.logAnalystApp.helpModal.collapseAll()">
                    <svg class="icon"><use href="#i-close"></use></svg> Collapse all
                </button>
                <button class="btn btn-primary" onclick="window.logAnalystApp.helpModal.scrollTo('help-quickstart')">
                    Jump to Quick Start
                </button>
            </div>
        `;
    }

    renderToc() {
        const link = (id, label) => `<a onclick="window.logAnalystApp.helpModal.scrollTo('${id}')">${label}</a>`;
        return `
            <div class="help-toc">
                <div class="help-toc-title">Guide map</div>
                <div class="text-xs" style="color: var(--text-muted); margin-bottom: 8px;">
                    Pick a topic. You can treat this like a mini training manual.
                </div>
                <div style="display:flex; flex-wrap: wrap; gap: 10px; line-height: 1.6;">
                    ${link('help-quickstart', 'Quick Start')}
                    ${link('help-what', 'What it does')}
                    ${link('help-workflows', 'Example workflows')}
                    ${link('help-workspaces', 'Workspaces & Datasets')}
                    ${link('help-ingest', 'Ingesting logs')}
                    ${link('help-findings', 'Reading findings')}
                    ${link('help-settings', 'Settings & Threat Intel')}
                    ${link('help-scoring', 'Signals & scoring')}
                    ${link('help-agent', 'Agent Commands')}
                    ${link('help-theater', 'Theater Mode')}
                    ${link('help-keys', 'Keyboard Shortcuts')}
                    ${link('help-cloud', 'CloudTrail')}
                    ${link('help-sql', 'SQL Console')}
                    ${link('help-underhood', 'Under the hood')}
                    ${link('help-evidence', 'Evidence bundle')}
                    ${link('help-privacy', 'Privacy')}
                    ${link('help-troubleshooting', 'Troubleshooting')}
                    ${link('help-glossary', 'Glossary')}
                </div>
            </div>
        `;
    }

    renderDetails({ id, title, tag, badge, open, bodyHtml }) {
        const safeBadge = badge ? `<div class="tag">${badge}</div>` : `<div class="tag">${tag || ''}</div>`;
        return `
            <details class="help-details" id="${id}" ${open ? 'open' : ''}>
                <summary>
                    <div>
                        <div class="title">${title}</div>
                        <div class="tag">${tag || ''}</div>
                    </div>
                    ${safeBadge}
                </summary>
                <div class="content">${bodyHtml}</div>
            </details>
        `;
    }

    renderQuickStart() {
        return this.renderDetails({
            id: 'help-quickstart',
            title: 'Quick Start (5 minutes)',
            tag: 'Run the app, ingest data, get answers',
            badge: 'Start here',
            open: true,
            bodyHtml: `
                <h4>1) Run VulcansTrace locally</h4>
                <p>
                    VulcansTrace works best from a local server so browser Workers and WebAssembly can run safely (same-origin).
                    In the project folder, run:
                </p>
                <div class="help-code"><pre>npm run dev</pre></div>
                <p class="text-xs">Optional: start the demo “local control plane API” server instead:</p>
                <div class="help-code"><pre>npm run dev:api</pre></div>
                <p>Then open <code>http://localhost:7071/</code> in your browser.</p>

                <div class="help-note text-xs">
                    If port 7071 is already used, stop the other server or choose a different port for <code>dev:api</code>:
                    <div class="help-code" style="margin-top: 8px;"><pre>$env:PORT=7072; npm run dev:api</pre></div>
                </div>

                <h4>2) Pick a Workspace (Case)</h4>
                <p>A workspace is your case file: it stores datasets and saved SQL queries together.</p>
                <ul>
                    <li>Left nav → <strong>Workspaces</strong>.</li>
                    <li>Create a case name (example: “Case-2025-001”) or open an existing one.</li>
                </ul>

                <h4>3) Ingest logs</h4>
                <ul>
                    <li><strong>Drag & drop</strong> one or more files onto the page, or</li>
                    <li><strong>Paste</strong> log text into the bottom box and press <span class="help-kbd">Enter</span>.</li>
                </ul>

                <h4>4) Read findings and pivot</h4>
                <ul>
                    <li>Adjust sensitivity with the <strong>Profile</strong> selector (Low / Medium / High).</li>
                    <li>Focus one host: type <code>show ip &lt;address&gt;</code>.</li>
                    <li>See datasets: Left nav → <strong>Datasets</strong>.</li>
                    <li>Ask questions: Left nav → <strong>Queries</strong>.</li>
                </ul>

                <h4>5) Export evidence</h4>
                <p>Click <strong>Bundle</strong> to generate a ZIP with your inputs, analysis, reports, and verification hashes.</p>
            `
        });
    }

    renderWhatItDoes() {
        return this.renderDetails({
            id: 'help-what',
            title: 'What VulcansTrace does (and why it matters)',
            tag: 'A human-friendly view of security telemetry',
            bodyHtml: `
                <p>
                    VulcansTrace turns raw logs into a story: who talked to whom, how often, and what looks suspicious.
                    It’s designed for triage (what should I look at next?) and for evidence (what did I conclude, and can I prove it?).
                </p>
                <h4>What you get</h4>
                <ul>
                    <li><strong>Behavioral detection</strong>: scanning, flooding, egress anomalies, and “blocked then successful” chains.</li>
                    <li><strong>Context</strong>: topology roles (LAN/DMZ/CORP/etc.) from CIDR ranges to clarify internal vs external.</li>
                    <li><strong>Cloud + network</strong>: CloudTrail events are normalized and queryable alongside network flows.</li>
                    <li><strong>SQL investigations</strong>: DuckDB runs in-browser (WASM) for fast pivots and repeatable queries.</li>
                    <li><strong>Evidence export</strong>: manifests, checksums, and optional HMAC signatures for tamper evidence.</li>
                </ul>
                <div class="help-callout">
                    Break complex threats into testable questions—VulcansTrace empowers you to investigate thoroughly, analyze accurately, and respond confidently.
                </div>
            `
        });
    }

    renderWorkspacesAndDatasets() {
        return this.renderDetails({
            id: 'help-workspaces',
            title: 'Workspaces & Datasets',
            tag: 'How cases, files, and memory are handled',
            bodyHtml: `
                <h4>Workspaces (Cases)</h4>
                <p>
                    A Workspace is a case container stored in your browser (IndexedDB). It keeps your dataset registry and saved queries together.
                    This makes investigations repeatable: you can reopen a case and remember what you looked for.
                </p>
                <ul>
                    <li><strong>Local only</strong>: workspaces are stored in the browser, not uploaded.</li>
                    <li><strong>Per-case saved queries</strong>: build a “playbook” and reuse it.</li>
                </ul>

                <h4>Datasets</h4>
                <p>
                    When you drop a file, VulcansTrace stores metadata in the case registry (name, size, last modified, a short preview).
                    This avoids keeping huge strings in memory.
                </p>
                <ul>
                    <li>Left nav → <strong>Datasets</strong> shows what’s attached to the active workspace.</li>
                    <li><strong>LOADED</strong> means it’s currently in memory and queryable.</li>
                    <li><strong>METADATA</strong> means the case remembers it, but the raw file is not currently loaded.</li>
                </ul>
                <div class="help-note text-xs">
                    Browser safety note: after a refresh, the browser may not allow access to prior local files automatically.
                    The case can remember metadata, but you may need to re-drop the file to re-analyze or export the exact bytes.
                </div>
            `
        });
    }

    renderExampleWorkflows() {
        return this.renderDetails({
            id: 'help-workflows',
            title: 'Example workflows (how this helps in real life)',
            tag: 'Step-by-step investigations you can copy',
            bodyHtml: `
                <h4>Workflow A: “Is this host scanning us?”</h4>
                <ul>
                    <li>Ingest flow logs (drag & drop).</li>
                    <li>Look for a <strong>Scanner</strong> badge in findings.</li>
                    <li>Type <code>show ip &lt;scanner_ip&gt;</code> to view its recent timeline.</li>
                    <li>Use SQL to confirm the pattern and list targeted ports.</li>
                </ul>
                <div class="help-code"><pre>SELECT src, dport, count(*) AS hits
FROM flows
WHERE action='DROP'
GROUP BY src, dport
ORDER BY hits DESC
LIMIT 50;</pre></div>

                <h4>Workflow B: “Did blocked attempts later succeed?”</h4>
                <ul>
                    <li>Use a stricter Profile if you want chain detection to be more sensitive.</li>
                    <li>Look for a <strong>Chain</strong> badge on a host.</li>
                    <li>Focus the host and verify the port/time sequence.</li>
                </ul>

                <h4>Workflow C: “Is an AWS identity doing something unusual?”</h4>
                <ul>
                    <li>Ingest CloudTrail JSON (Records).</li>
                    <li>Open SQL and group by <code>eventName</code>, <code>eventSource</code>, and <code>sourceIPAddress</code>.</li>
                    <li>Look for spikes, error codes, unusual regions, or strange user agents.</li>
                </ul>
                <div class="help-code"><pre>SELECT sourceIPAddress, count(*) AS events
FROM cloudtrail
GROUP BY sourceIPAddress
ORDER BY events DESC
LIMIT 25;</pre></div>
                <div class="help-note text-xs" style="margin-top: 10px;">
                    Real-world mindset: first confirm what is “normal” for your environment, then treat deviations as leads—not verdicts.
                </div>
            `
        });
    }

    renderIngesting() {
        return this.renderDetails({
            id: 'help-ingest',
            title: 'Ingesting logs',
            tag: 'Drop files, paste text, supported formats',
            bodyHtml: `
                <h4>How to ingest</h4>
                <ul>
                    <li><strong>Drag & drop</strong>: best for real investigations (keeps the original bytes for evidence export).</li>
                    <li><strong>Paste</strong>: great for demos, small snippets, and quick “is this weird?” checks.</li>
                </ul>

                <h4>Supported log types</h4>
                <ul>
                    <li><strong>Flow / firewall logs (text)</strong>: entries with date/time/action/protocol/src/dst/ports, including W3C-style logs with <code>#Fields:</code>.</li>
                    <li><strong>AWS VPC Flow Logs (text)</strong>: space-delimited records; VulcansTrace normalizes them into flow entries.</li>
                    <li><strong>AWS CloudTrail (JSON)</strong>: <code>{ "Records": [ ... ] }</code> is normalized into flat event rows.</li>
                </ul>

                <h4>What VulcansTrace does during ingest</h4>
                <ul>
                    <li>Parses and normalizes rows into consistent structures.</li>
                    <li>Preserves provenance by tagging flow rows with <code>_file</code> when multiple files are ingested.</li>
                    <li>Stores CloudTrail events separately from network flows (so you don’t get “invalid IP” noise).</li>
                </ul>
            `
        });
    }

    renderReadingFindings() {
        return this.renderDetails({
            id: 'help-findings',
            title: 'Reading findings (what the report is telling you)',
            tag: 'From summary to “what should I do next?”',
            bodyHtml: `
                <h4>The big picture</h4>
                <p>
                    The report is meant to answer three questions:
                    what happened, what looks risky, and what to investigate next.
                </p>

                <h4>Key report sections</h4>
                <ul>
                    <li><strong>Files analyzed</strong>: how many datasets contributed to the findings.</li>
                    <li><strong>Profile & thresholds</strong>: sensitivity (Low/Medium/High) and the specific thresholds driving alerts.</li>
                    <li><strong>Timeline & Peak</strong>: how activity changes over time (useful for “burst” events).</li>
                    <li><strong>Risk cards</strong>: hosts that crossed thresholds, with badges that explain why.</li>
                </ul>

                <h4>Hands-on pivots</h4>
                <ul>
                    <li><strong>Focus a host</strong>: <code>show ip &lt;address&gt;</code>.</li>
                    <li><strong>Check a port</strong>: <code>show port &lt;port&gt;</code>.</li>
                    <li><strong>Look at raw snippets</strong>: <code>logs &lt;ip&gt;</code> shows recent events for that source.</li>
                </ul>

                <div class="help-note text-xs">
                    Tip: if everything is low, that can be a win. Use the “Why Low” context to confirm coverage, time span, roles (LAN/DMZ/WAN), and threshold comparisons.
                </div>
            `
        });
    }

    renderSettingsAndThreatIntel() {
        return this.renderDetails({
            id: 'help-settings',
            title: 'Settings (Topology + IOCs + Allowlist)',
            tag: 'Teach VulcansTrace what “internal” means and what you already know is bad',
            bodyHtml: `
                <h4>Topology (CIDR roles)</h4>
                <p>
                    Topology is how VulcansTrace learns your environment. You define segments (examples: CORP, LAN, DMZ) and their CIDR ranges.
                    These labels show up throughout the report to explain whether a host looks internal, external, or special (like localhost).
                </p>
                <ul>
                    <li>Open <strong>Config</strong> and add segments like <code>10.0.0.0/8</code> or <code>192.168.0.0/16</code>.</li>
                    <li>Good topology reduces false alarms by adding context.</li>
                </ul>

                <h4>Threat Intelligence (IOCs)</h4>
                <p>
                    If you paste known-bad IPs into the IOC list, any match is treated as critical.
                    This is intentional: an analyst-provided indicator is strong evidence compared to statistical anomalies.
                </p>
                <ul>
                    <li>Paste one IP per line.</li>
                    <li>After saving, analysis reruns so matches are highlighted immediately.</li>
                </ul>
                 <div class="help-note text-xs">
                     Safety tip: keep IOC lists clean and sourced. A single typo can cause “critical” flags on a benign host.
                 </div>

                 <h4>Allowlist (Noise Binder)</h4>
                 <p>
                     Allowlist is controlled learning: you mark known-good <strong>source</strong> IPs as safe so they stop showing up in TOP.
                     This reduces recurring noise (printers, scanners, backup systems) without changing raw ingest.
                 </p>
                 <ul>
                     <li>Open <strong>Config → Allowlist</strong> and add an IP with an optional reason.</li>
                     <li>Ignored events are tracked as <strong>IGNORED</strong> in the summary stats after analysis.</li>
                 </ul>
                 <div class="help-note text-xs">
                     Tip: keep allowlists small and reviewed; over-allowlisting can hide real issues.
                 </div>
            `
        });
    }

    renderSignalsAndScoring() {
        return this.renderDetails({
            id: 'help-scoring',
            title: 'Signals, scoring, and cybersecurity meaning',
            tag: 'Why badges exist, what they might indicate',
            bodyHtml: `
                <h4>Badges (signals)</h4>
                <ul>
                    <li><strong>Scanner</strong>: many destination ports; often reconnaissance (ATT&CK: Active Scanning).</li>
                    <li><strong>Flooder</strong>: unusually high volume; can resemble DoS or brute force pressure.</li>
                    <li><strong>Egress</strong>: unusual outbound fan-out; potential C2, exfiltration, or misconfiguration.</li>
                    <li><strong>Chain</strong>: blocked then later allowed on same port in a time window; “attempt then success”.</li>
                    <li><strong>Lateral</strong>: host appears across multiple datasets; may indicate movement across segments or log sources.</li>
                    <li><strong>Threat Intel</strong>: matches IPs in your IOC list (treated as critical by design).</li>
                </ul>

                <h4>Scoring philosophy</h4>
                <p>
                    Scores are a weighted sum of signals. The goal is not to “predict evil”, but to prioritize review.
                    A “High” score means “this host is showing several behaviors worth looking at”.
                </p>

                <h4>Signal weights (summary)</h4>
                <div class="help-note">
                    <div class="text-xs" style="color: var(--text-muted); margin-bottom: 6px;">
                        These are the core weights used by the current model:
                    </div>
                    <ul style="margin: 0 0 0 18px;">
                        <li>Scanner: +3</li>
                        <li>Flooder: +3</li>
                        <li>Chain: +3</li>
                        <li>Egress: +2</li>
                        <li>Lateral: +2</li>
                        <li>Threat Intel (IOC match): +100 (treated as critical)</li>
                    </ul>
                </div>

                <h4>Profiles</h4>
                <p>
                    Profiles change thresholds. Use <strong>Low</strong> for noisy environments, <strong>High</strong> for tight detection.
                    If you’re unsure, start at Medium and adjust based on false positives/false negatives.
                </p>
            `
        });
    }

    renderCloudTrail() {
        return this.renderDetails({
            id: 'help-cloud',
            title: 'CloudTrail (AWS audit logs)',
            tag: 'Identity + API activity: “who did what, when, from where”',
            bodyHtml: `
                <p>
                    CloudTrail records AWS API activity. It’s the cloud equivalent of an audit log:
                    it can answer “what changed?”, “which identity did it?”, and “from what source IP?”.
                </p>
                <h4>How VulcansTrace handles CloudTrail</h4>
                <ul>
                    <li>CloudTrail JSON (<code>Records</code>) is normalized into flat rows for easy searching.</li>
                    <li>Events are stored in the <code>cloudtrail</code> SQL table.</li>
                    <li>CloudTrail-only ingest is supported (no flow analysis runs if there are no network flows).</li>
                </ul>
                <h4>Example investigation pivots</h4>
                <ul>
                    <li>Spike in <code>ConsoleLogin</code> failures before a success.</li>
                    <li>Role assumptions followed by sensitive actions.</li>
                    <li>Unusual regions, user agents, or source IPs.</li>
                </ul>
                <div class="help-code"><pre>-- Example: recent failures
SELECT eventTime, eventName, errorCode, sourceIPAddress
FROM cloudtrail
WHERE errorCode IS NOT NULL
ORDER BY eventTime DESC
LIMIT 50;</pre></div>
            `
        });
    }

    renderSqlConsole() {
        return this.renderDetails({
            id: 'help-sql',
            title: 'SQL Console (DuckDB in your browser)',
            tag: 'Powerful queries, fully offline, case-saved',
            bodyHtml: `
                <p>
                    The SQL Console runs DuckDB (a fast analytical database) inside your browser using WebAssembly.
                    It demonstrates “cloud-grade” analytics without needing a cloud service: everything runs locally.
                </p>
                <h4>Tables</h4>
                <ul>
                    <li><code>flows</code>: normalized network flow entries (includes <code>src</code>, <code>dst</code>, ports, action, and <code>_file</code>).</li>
                    <li><code>cloudtrail</code>: normalized CloudTrail events (identity, event source/name, time, IP).</li>
                    <li><code>datasets</code>: dataset metadata (what you ingested and when).</li>
                </ul>

                <h4>Starter queries</h4>
                <div class="help-code"><pre>-- Top talkers (by flow count)
SELECT src, count(*) AS flows
FROM flows
GROUP BY src
ORDER BY flows DESC
LIMIT 20;</pre></div>
                <div class="help-code" style="margin-top: 10px;"><pre>-- Most targeted destination ports (often reveals scanning)
SELECT dport, count(*) AS hits
FROM flows
GROUP BY dport
ORDER BY hits DESC
LIMIT 20;</pre></div>
                <div class="help-code" style="margin-top: 10px;"><pre>-- Drop rate per source
SELECT src,
       sum(CASE WHEN action='DROP' THEN 1 ELSE 0 END) AS drops,
       count(*) AS total,
       round(100.0 * sum(CASE WHEN action='DROP' THEN 1 ELSE 0 END) / count(*), 2) AS drop_pct
FROM flows
GROUP BY src
ORDER BY drop_pct DESC, total DESC
LIMIT 20;</pre></div>
                <div class="help-code" style="margin-top: 10px;"><pre>-- CloudTrail: top event names
SELECT eventName, count(*) AS events
FROM cloudtrail
GROUP BY eventName
ORDER BY events DESC
LIMIT 20;</pre></div>

                <h4>Saved queries</h4>
                <p>
                    Give your query a name and click <strong>Save</strong>. Saved queries are per-workspace.
                    This is how you turn one-off questions into a repeatable investigation playbook.
                </p>

                <div class="help-note text-xs">
                    Practical detail: results in the UI are capped to keep the browser responsive. If you need a smaller view, add <code>LIMIT</code>.
                </div>
            `
        });
    }

    renderUnderTheHood() {
        return this.renderDetails({
            id: 'help-underhood',
            title: 'Under the hood (why the app stays responsive)',
            tag: 'Workers, WASM, and offline-first architecture',
            bodyHtml: `
                <h4>Web Worker analysis</h4>
                <p>
                    When you run VulcansTrace from <code>http://localhost</code>, parsing and analysis can run in a Web Worker.
                    This keeps the UI clickable while heavier computation happens off the main thread.
                </p>
                <ul>
                    <li>If the app is opened from <code>file://</code>, Workers are restricted and VulcansTrace falls back to main-thread analysis.</li>
                    <li>Using <code>npm run dev</code> (or <code>npm run dev:api</code>) enables the best experience.</li>
                </ul>

                <h4>DuckDB WebAssembly</h4>
                <p>
                    DuckDB runs locally via WebAssembly and a dedicated Worker. This makes SQL fast and private.
                    The app serves the DuckDB assets locally and uses same-origin isolation headers to support it.
                </p>

                <h4>Optional Local API (Task 16)</h4>
                <p>
                    The local API server is a learning/demo feature: it shows how a UI can talk to a local control plane without the internet.
                    It includes <code>/api/health</code> and a simple <code>/api/cases</code> registry.
                </p>
            `
        });
    }

    renderEvidence() {
        return this.renderDetails({
            id: 'help-evidence',
            title: 'Evidence bundle (ZIP) and chain-of-custody',
            tag: 'What gets exported, checksums, signatures',
            bodyHtml: `
                <p>
                    Evidence export is built for defensibility: you should be able to hand the ZIP to someone else and prove what it contains.
                    VulcansTrace creates a bundle with raw inputs (when available), analysis output, and verification artifacts.
                </p>
                <h4>What the bundle contains</h4>
                <ul>
                    <li><code>input/…</code>: original dropped files (exact bytes, when the browser provides them).</li>
                    <li><code>analysis_*.json</code>: structured analysis output (counts, detectors, timelines).</li>
                    <li><code>report_*.html</code>: a human-readable snapshot report.</li>
                    <li><code>topology.json</code>: topology roles used for analysis.</li>
                    <li><code>case/manifest.json</code>: workspace metadata + dataset registry snapshot.</li>
                    <li><code>queries/last_query_results.json</code>: last SQL run and a result snapshot.</li>
                    <li><code>manifest.json</code> and <code>checksums.txt</code>: SHA-256 hashes for verification.</li>
                </ul>

                <h4>Signing (optional)</h4>
                <p>
                    If you enter a signing secret, VulcansTrace adds HMAC-SHA256 signatures. This provides tamper evidence:
                    if someone changes a file in the bundle, the checksums and signatures won’t match.
                    Keep the signing secret protected.
                </p>
            `
        });
    }

    renderPrivacy() {
        return this.renderDetails({
            id: 'help-privacy',
            title: 'Privacy & offline model',
            tag: 'What stays local, what gets stored, what gets executed',
            bodyHtml: `
                <p>
                    VulcansTrace is designed for sensitive incident data. It avoids network dependencies and runs analysis locally.
                </p>
                <ul>
                    <li><strong>No uploads</strong>: dropped files and pasted text are processed locally in your browser.</li>
                    <li><strong>No CDNs</strong>: core code and DuckDB files are served locally.</li>
                    <li><strong>Same-origin only</strong>: Workers/WASM load from <code>http://localhost</code>.</li>
                    <li><strong>Local storage</strong>: cases, dataset metadata, and saved queries live in your browser database (IndexedDB).</li>
                </ul>
                <div class="help-note text-xs">
                    If you run the optional API server (<code>npm run dev:api</code>), it listens on localhost and stores demo data locally in <code>.vulcanstrace_api/</code>.
                </div>
            `
        });
    }

    renderTroubleshooting() {
        return this.renderDetails({
            id: 'help-troubleshooting',
            title: 'Troubleshooting',
            tag: 'Common issues and fixes',
            bodyHtml: `
                <h4>DuckDB says it needs the dev server</h4>
                <p>
                    DuckDB runs via Worker/WASM and won’t load correctly from <code>file://</code>.
                    Start the server and open <code>http://localhost:7071/</code>.
                </p>
                <div class="help-code"><pre>npm run dev</pre></div>

                <h4>Port 7071 is already in use</h4>
                <p>Stop whatever is on 7071, or run the API server on a different port:</p>
                <div class="help-code"><pre>$env:PORT=7072; npm run dev:api</pre></div>

                <h4>CloudTrail ingests but no flow analysis runs</h4>
                <p>That is expected for CloudTrail-only ingest. Use SQL on <code>cloudtrail</code> and export evidence if needed.</p>

                <h4>Run built-in self tests</h4>
                <p>Left nav → <strong>Test</strong> runs a regression suite to confirm parsing and evidence logic is healthy.</p>
            `
        });
    }

    renderGlossary() {
        return this.renderDetails({
            id: 'help-glossary',
            title: 'Glossary (friendly but precise)',
            tag: 'Terms you’ll see in logs and reports',
            bodyHtml: `
                <ul>
                    <li><strong>Flow log</strong>: a record of network communication (source/destination, ports, action, time).</li>
                    <li><strong>DROP vs ALLOW</strong>: firewall decision; DROP can be blocking/policy, ALLOW can be success.</li>
                    <li><strong>IOC</strong>: indicator of compromise (known bad IP/domain/hash). Here, IP IOCs are supported.</li>
                    <li><strong>Egress</strong>: outbound traffic leaving your network or VPC.</li>
                    <li><strong>Reconnaissance</strong>: probing to learn what services exist (often scanning).</li>
                    <li><strong>Lateral movement</strong>: activity moving between internal systems after initial access.</li>
                    <li><strong>Chain-of-custody</strong>: proof that evidence was not altered.</li>
                    <li><strong>HMAC</strong>: keyed signature used for tamper evidence when the key is protected.</li>
                    <li><strong>WASM</strong>: WebAssembly; lets high-performance tools (DuckDB) run locally in the browser.</li>
                </ul>
            `
        });
    }

    renderAgentCommands() {
        return this.renderDetails({
            id: 'help-agent',
            title: 'Agent Commands',
            tag: 'Chat-based commands for analysis and remediation',
            bodyHtml: `
                <p>
                    Type these commands in the chat input to interact with VulcansTrace's analysis agent.
                    Commands are case-insensitive.
                </p>

                <h4>Help & System</h4>
                <ul>
                    <li><code>help</code> – List all available commands.</li>
                    <li><code>status</code> – Show system status and loaded data summary.</li>
                    <li><code>health check</code> – Verify all subsystems are active.</li>
                </ul>

                <h4>Threat Analysis</h4>
                <ul>
                    <li><code>top threats</code> – Prioritized list of detected threats.</li>
                    <li><code>explain &lt;IP&gt;</code> – Detailed breakdown with MITRE ATT&CK mapping.</li>
                    <li><code>show evidence &lt;IP&gt;</code> – Raw log lines proving the finding.</li>
                    <li><code>investigate &lt;IP&gt;</code> – SQL templates for deep diving on a host.</li>
                </ul>

                <h4>Remediation</h4>
                <ul>
                    <li><code>remediate &lt;IP&gt;</code> – Generate firewall block commands.</li>
                    <li><code>mark safe &lt;IP&gt;</code> – Add IP to allowlist.</li>
                </ul>
                <div class="help-note text-xs">
                    Safety: Remediation is gated to confirmed threat-intel only.
                </div>

                <h4>Export & Demo</h4>
                <ul>
                    <li><code>export evidence</code> – Generate ZIP bundle with findings.</li>
                    <li><code>run guided demo</code> – Launch full Theater Mode presentation.</li>
                    <li><code>run self-test</code> – Execute regression test suite.</li>
                </ul>
            `
        });
    }

    renderTheaterMode() {
        return this.renderDetails({
            id: 'help-theater',
            title: 'Theater Mode (Boardroom Presentation)',
            tag: 'Full-screen slide deck for executive briefings',
            bodyHtml: `
                <p>
                    Theater Mode transforms your analysis into a professional presentation.
                    Perfect for incident reviews, SOC handoffs, or executive updates.
                </p>

                <h4>How to launch</h4>
                <ul>
                    <li><strong>Chat command:</strong> <code>run guided demo</code></li>
                    <li><strong>Console:</strong> <code>window.logAnalystApp.theaterMode.open()</code></li>
                </ul>

                <h4>Slides</h4>
                <ul>
                    <li><strong>1. Case Overview</strong> – Dataset stats and timeline.</li>
                    <li><strong>2. Topology</strong> – Network segment visualization.</li>
                    <li><strong>3. Top Threats</strong> – Prioritized threat list.</li>
                    <li><strong>4. Evidence</strong> – Raw proof for each finding.</li>
                    <li><strong>5. Remediation</strong> – Firewall commands with copy buttons.</li>
                </ul>

                <h4>Navigation</h4>
                <ul>
                    <li><span class="help-kbd">←</span> / <span class="help-kbd">→</span> – Previous / Next slide</li>
                    <li><span class="help-kbd">Escape</span> – Exit Theater Mode</li>
                    <li><strong>Next Button</strong> – Advance to next slide</li>
                    <li><strong>Finish Button</strong> – Close (appears on last slide)</li>
                </ul>
            `
        });
    }

    renderKeyboardShortcuts() {
        return this.renderDetails({
            id: 'help-keys',
            title: 'Keyboard Shortcuts',
            tag: 'Quick reference for power users',
            bodyHtml: `
                <h4>Global</h4>
                <ul>
                    <li><span class="help-kbd">Enter</span> – Submit chat input</li>
                    <li><span class="help-kbd">Escape</span> – Close modals, exit Theater Mode</li>
                </ul>

                <h4>Theater Mode</h4>
                <ul>
                    <li><span class="help-kbd">←</span> – Previous slide</li>
                    <li><span class="help-kbd">→</span> – Next slide</li>
                </ul>

                <div class="help-callout">
                    Tip: Use keyboard navigation in Theater Mode for smooth presentations without visible mouse clicks.
                </div>
            `
        });
    }

    open() {
        document.getElementById('helpModal').classList.add('active');
        this.collapseAll();
        this.scrollTo(this.defaultSectionId);
    }

    close() {
        document.getElementById('helpModal').classList.remove('active');
    }

    scrollTo(id) {
        const el = document.getElementById(id);
        if (el && el.scrollIntoView) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    setAllDetails(open) {
        const modal = document.getElementById('helpModal');
        if (!modal) return;
        const items = modal.querySelectorAll('details.help-details');
        items.forEach(d => { d.open = !!open; });
    }

    expandAll() {
        this.setAllDetails(true);
    }

    collapseAll() {
        this.setAllDetails(false);
        const quick = document.getElementById(this.defaultSectionId);
        if (quick) quick.open = true;
    }
}

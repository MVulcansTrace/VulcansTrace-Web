/* Core application logic and state management */
import { LogProcessor } from './LogProcessor.js';
import { UIUtils } from './UIUtils.js';
import { NetworkUtils } from './NetworkUtils.js';
import { CaseSnapshot } from './CaseSnapshot.js';
import { AgentKernel } from './AgentKernel.js';
import { AgentRenderer } from './AgentRenderer.js';
import { EvidenceGenerator } from './EvidenceGenerator.js';
import { ANALYSIS_LIMITS, TIMEOUTS } from './constants.js';
import { silentCleanup } from './errorUtils.js';

export class LogAnalystCore {
    constructor() {
        this.INITIAL_STATE = {
            inputs: [],
            cloudEvents: [],
            total: 0,
            startTime: null
        };

        this.DEFAULT_TOPOLOGY = [
            { name: "CORP", cidr: "10.0.0.0/8" },
            { name: "LAN", cidr: "192.168.0.0/16" },
            { name: "DMZ", cidr: "172.16.0.0/12" },
            { name: "HOST", cidr: "127.0.0.0/8" }
        ];

        this.STORAGE_KEYS = {
            profile: 'vulcanstrace_profile',
            topology: 'vulcanstrace_topology',
            iocs: 'vulcanstrace_iocs',
            allowlist: 'vulcanstrace_allowlist'
        };

        this.profile = LogProcessor.getActiveProfile ? LogProcessor.getActiveProfile() : 'Medium';
        this.DB = { ...this.INITIAL_STATE };
        this.STATS = null;
        this.TOPOLOGY = [...this.DEFAULT_TOPOLOGY];
        this.IOCS = [];
        this.ALLOWLIST = [];
        this.caseStore = null;
        this._activeCaseName = null;
        this.duckDbService = null;
        this.analysisWorker = null;
        this.analysisJobId = 0;
        this.analysisJobInProgress = 0;
        this.agentLastFocus = null;
        this.agentLastAutoTopJobId = 0;
        this.snapshotCache = [];
        this.snapshotCacheLoadedAt = null;

        this.loadPersistedConfig();
    }

    setCaseStore(caseStore) {
        this.caseStore = caseStore || null;
        this.refreshSnapshotCache().catch(() => { });
        this._cacheActiveCaseName().catch(() => { });
    }

    async _cacheActiveCaseName() {
        const caseId = this.getActiveCaseId();
        if (!caseId || !this.caseStore || typeof this.caseStore.getCase !== 'function') {
            this._activeCaseName = null;
            return;
        }
        try {
            const record = await this.caseStore.getCase(caseId);
            this._activeCaseName = (record && record.name) || null;
        } catch {
            this._activeCaseName = null;
        }
    }

    setActiveCaseName(name) {
        this._activeCaseName = (name || '').toString().trim() || null;
    }

    getActiveCaseName() {
        return this._activeCaseName || 'Untitled Case';
    }

    setDuckDbService(duckDbService) {
        this.duckDbService = duckDbService || null;
        this.syncDuckDbData();
    }

    getSnapshotCache() {
        return Array.isArray(this.snapshotCache) ? this.snapshotCache.slice() : [];
    }

    async refreshSnapshotCache(limit = 25) {
        const store = this.caseStore;
        if (!store || typeof store.getLastSnapshots !== 'function') {
            this.snapshotCache = [];
            this.snapshotCacheLoadedAt = null;
            return this.getSnapshotCache();
        }

        const cap = Math.max(0, Math.min(200, Number.isFinite(limit) ? limit : 25));
        if (!cap) {
            this.snapshotCache = [];
            this.snapshotCacheLoadedAt = new Date().toISOString();
            return this.getSnapshotCache();
        }

        const rows = await store.getLastSnapshots(cap);
        const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
        list.sort((a, b) => {
            const ac = String(a.createdAt || '');
            const bc = String(b.createdAt || '');
            if (bc !== ac) return bc.localeCompare(ac);
            return String(b.id || '').localeCompare(String(a.id || ''));
        });

        this.snapshotCache = list;
        this.snapshotCacheLoadedAt = new Date().toISOString();
        return this.getSnapshotCache();
    }

    _pushSnapshotToCache(snapshot) {
        const s = snapshot && typeof snapshot === 'object' ? snapshot : null;
        if (!s) return;

        const id = s.id != null ? String(s.id) : '';
        const createdAt = s.createdAt != null ? String(s.createdAt) : '';
        if (!id || !createdAt) return;

        const existing = Array.isArray(this.snapshotCache) ? this.snapshotCache : [];
        const next = [];
        const seen = new Set();
        next.push(s);
        seen.add(id);
        for (const row of existing) {
            const rid = row && row.id != null ? String(row.id) : '';
            if (!rid || seen.has(rid)) continue;
            seen.add(rid);
            next.push(row);
        }

        next.sort((a, b) => {
            const ac = String(a.createdAt || '');
            const bc = String(b.createdAt || '');
            if (bc !== ac) return bc.localeCompare(ac);
            return String(b.id || '').localeCompare(String(a.id || ''));
        });

        this.snapshotCache = next.slice(0, ANALYSIS_LIMITS.SNAPSHOT_CACHE_MAX);
        this.snapshotCacheLoadedAt = new Date().toISOString();
    }

    syncDuckDbData() {
        const svc = this.duckDbService;
        if (!svc || typeof svc.setData !== 'function') return;

        const flows = Array.isArray(this.DB.entries) ? this.DB.entries : [];
        const cloudEvents = Array.isArray(this.DB.cloudEvents) ? this.DB.cloudEvents : [];
        const datasets = Array.isArray(this.DB.inputs)
            ? this.DB.inputs.map(d => ({
                id: d.id || null,
                caseId: d.caseId || null,
                name: d.name || '',
                size: d.size || 0,
                lastModified: d.lastModified || null,
                kind: d.kind || 'flows',
                hash: d.hash || null
            }))
            : [];

        svc.setData({ flows, cloudEvents, datasets });
        if (typeof svc.scheduleRefresh === 'function') svc.scheduleRefresh();
    }

    getActiveCaseId() {
        if (!this.caseStore || !this.caseStore.getActiveCaseId) return null;
        return this.caseStore.getActiveCaseId();
    }

    async listTranscript(limit) {
        const caseId = this.getActiveCaseId();
        if (!caseId) return [];
        if (!this.caseStore || typeof this.caseStore.listTranscript !== 'function') return [];
        try {
            return await this.caseStore.listTranscript(caseId, limit);
        } catch { // Fallback: transcript unavailable from store - return empty (non-critical)
            return [];
        }
    }

    getDB() {
        return this.DB;
    }

    getStats() {
        return this.STATS;
    }

    getTopology() {
        return this.TOPOLOGY;
    }

    getProfile() {
        return this.profile;
    }

    getIOCs() {
        return this.IOCS;
    }

    setIOCs(iocList, rerun = true) {
        this.IOCS = iocList;
        this.persistIOCs();
        // Re-run analysis immediately if we have data
        if (rerun && this.DB.inputs.length) {
            this.aggregateAnalysis();
        }
    }

    getAllowlist() {
        return Array.isArray(this.ALLOWLIST) ? this.ALLOWLIST.slice() : [];
    }

    normalizeAllowlistEntries(raw) {
        const list = Array.isArray(raw) ? raw : [];
        const seen = new Set();
        const out = [];

        for (const entry of list) {
            let target = '';
            let reason = '';
            let createdAt = '';

            if (typeof entry === 'string') {
                target = entry.trim();
            } else if (entry && typeof entry === 'object') {
                if (typeof entry.target === 'string') target = entry.target.trim();
                else if (typeof entry.ip === 'string') target = entry.ip.trim();
                if (typeof entry.reason === 'string') reason = entry.reason.trim();
                if (typeof entry.createdAt === 'string') createdAt = entry.createdAt.trim();
            }

            if (!target) continue;
            if (NetworkUtils?.ipToLong) {
                if (NetworkUtils.ipToLong(target) === null) continue;
            }

            if (seen.has(target)) continue;
            seen.add(target);

            out.push({
                target,
                reason,
                createdAt: createdAt || new Date().toISOString()
            });
        }

        return out;
    }

    setAllowlist(entries, silent = false, rerun = true) {
        this.ALLOWLIST = this.normalizeAllowlistEntries(entries);
        this.persistAllowlist();

        if (rerun && this.DB.inputs.length) {
            this.aggregateAnalysis();
        } else if (!silent && document.getElementById('chat')) {
            UIUtils.addBotHTML(`Allowlist updated (${this.ALLOWLIST.length}).`);
        }
    }

    addAllowlistEntry(target, reason = '', silent = false, rerun = true) {
        const ip = typeof target === 'string' ? target.trim() : '';
        if (!ip) return false;
        if (NetworkUtils?.ipToLong) {
            if (NetworkUtils.ipToLong(ip) === null) return false;
        }

        const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
        const existing = Array.isArray(this.ALLOWLIST) ? this.ALLOWLIST : [];
        const next = [];
        next.push({ target: ip, reason: normalizedReason, createdAt: new Date().toISOString() });
        for (const entry of existing) {
            if (!entry || typeof entry !== 'object') continue;
            if (String(entry.target || '').trim() === ip) continue;
            next.push(entry);
        }

        this.ALLOWLIST = this.normalizeAllowlistEntries(next);
        this.persistAllowlist();

        if (rerun && this.DB.inputs.length) {
            this.aggregateAnalysis();
        } else if (!silent && document.getElementById('chat')) {
            UIUtils.addBotHTML(`Marked safe: ${UIUtils.escapeHtml(ip)}.`);
        }

        return true;
    }

    removeAllowlistEntry(target, silent = false, rerun = true) {
        const ip = typeof target === 'string' ? target.trim() : '';
        if (!ip) return false;
        const existing = Array.isArray(this.ALLOWLIST) ? this.ALLOWLIST : [];
        const next = existing.filter(e => e && typeof e === 'object' && String(e.target || '').trim() !== ip);
        const changed = next.length !== existing.length;
        if (!changed) return false;

        this.ALLOWLIST = this.normalizeAllowlistEntries(next);
        this.persistAllowlist();

        if (rerun && this.DB.inputs.length) {
            this.aggregateAnalysis();
        } else if (!silent && document.getElementById('chat')) {
            UIUtils.addBotHTML(`Removed from allowlist: ${UIUtils.escapeHtml(ip)}.`);
        }

        return true;
    }

    promptAllowlistForIp(ip) {
        const target = typeof ip === 'string' ? ip.trim() : '';
        if (!target) return false;
        let reason = '';
        try {
            if (typeof window !== 'undefined' && window && typeof window.prompt === 'function') {
                reason = window.prompt(`Mark ${target} safe. Optional reason:`, '') || '';
            }
        } catch { // window.prompt() may fail in some environments (non-browser, popups blocked)
            reason = '';
        }
        return this.addAllowlistEntry(target, reason, false);
    }

    setTopology(topology) {
        this.TOPOLOGY = topology;
        this.persistTopology();
    }

    setProfile(profileName, silent = false) {
        const applied = LogProcessor.setProfile(profileName);
        this.profile = applied;
        this.persistProfile(applied);

        if (this.DB.inputs.length) {
            this.aggregateAnalysis();
        } else if (!silent && document.getElementById('chat')) {
            UIUtils.addBotHTML(`Profile set to ${applied}.`);
        }
    }

    async sha256(content) {
        const buf = typeof content === 'string' ? new TextEncoder().encode(content) : content;
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async readFilePreviewText(file, maxLines = 100) {
        try {
            const maxBytes = ANALYSIS_LIMITS.MAX_PASTE_BYTES;
            const chunk = file.slice(0, Math.min(file.size || 0, maxBytes));
            const ab = await chunk.arrayBuffer();
            const text = new TextDecoder().decode(ab);
            const lines = text.split(/\r?\n/).slice(0, ANALYSIS_LIMITS.PREVIEW_LINES);
            return lines.join('\n');
        } catch { // File read failed - return empty preview (non-critical)
            return '';
        }
    }

    async parseFileToEntries(file) {
        const parser = LogProcessor.createLineParser ? LogProcessor.createLineParser() : null;
        if (!parser) {
            const ab = await file.arrayBuffer();
            const text = new TextDecoder().decode(ab);
            const result = LogProcessor.processLogText(text);
            return result.success ? result.entries : [];
        }

        if (!file.stream) {
            const ab = await file.arrayBuffer();
            const text = new TextDecoder().decode(ab);
            const result = LogProcessor.processLogText(text);
            return result.success ? result.entries : [];
        }

        const reader = file.stream().getReader();
        const decoder = new TextDecoder();
        let carry = '';
        let consumed = 0;
        const yieldEveryLines = ANALYSIS_LIMITS.CHUNK_YIELD_LINES;

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                carry += decoder.decode(value, { stream: true });

                let idx;
                while ((idx = carry.indexOf('\n')) >= 0) {
                    let line = carry.slice(0, idx);
                    if (line.endsWith('\r')) line = line.slice(0, -1);
                    parser.consumeLine(line);
                    carry = carry.slice(idx + 1);

                    consumed++;
                    if (consumed % yieldEveryLines === 0) {
                        await new Promise(r => setTimeout(r, 0));
                    }
                }
            }
        } finally {
            silentCleanup(() => reader.releaseLock(), 'file stream reader');
        }

        carry += decoder.decode();
        if (carry) {
            if (carry.endsWith('\r')) carry = carry.slice(0, -1);
            parser.consumeLine(carry);
        }

        return parser.entries;
    }

    async processFiles(files) {
        if (this.DB.inputs.length > 0) {
            this.resetCase(true);
        }

        let loadedCount = 0;
        let flowLoadedCount = 0;
        let cloudEventCount = 0;
        let rejected = [];

        UIUtils.addBotHTML(`<div style="color:var(--accent-blue)">Ingesting ${files.length} file(s)...</div>`);

        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            try {
                const name = UIUtils.safeName(f.name);

                const previewText = await this.readFilePreviewText(f, 100);

                const isLikelyJson = name.toLowerCase().endsWith('.json') || previewText.trim().startsWith('{') || previewText.trim().startsWith('[');

                let kind = 'flows';
                let entries = [];
                let cloudEvents = [];

                if (isLikelyJson && LogProcessor.processAnyText) {
                    const text = await f.text();
                    const r = LogProcessor.processAnyText(text);
                    kind = r.kind || 'unknown';
                    if (kind === 'cloudtrail') {
                        cloudEvents = Array.isArray(r.events) ? r.events : [];
                    } else if (kind === 'flows') {
                        entries = Array.isArray(r.entries) ? r.entries : [];
                    }
                } else {
                    entries = await this.parseFileToEntries(f);
                    kind = 'flows';
                }

                const hasData = (kind === 'cloudtrail') ? cloudEvents.length > 0 : entries.length > 0;

                if (hasData) {
                    const caseId = this.getActiveCaseId();
                    let datasetId = `ds_${Date.now()}_${Math.random().toString(16).slice(2)}`;

                    if (this.caseStore && caseId) {
                        const dataset = await this.caseStore.addDataset(caseId, {
                            name,
                            size: f.size,
                            lastModified: f.lastModified,
                            previewText,
                            kind
                        });
                        if (dataset && dataset.id) datasetId = dataset.id;
                    }

                    this.DB.inputs.push({
                        id: datasetId,
                        caseId,
                        name,
                        size: f.size,
                        lastModified: f.lastModified,
                        previewText,
                        file: f,
                        hash: null,
                        kind,
                        entries,
                        cloudEvents
                    });
                    loadedCount++;

                    if (kind === 'cloudtrail') {
                        this.DB.cloudEvents.push(...cloudEvents);
                        cloudEventCount += cloudEvents.length;
                    } else {
                        flowLoadedCount++;
                    }
                } else {
                    rejected.push({ name: f.name, reason: isLikelyJson ? "No CloudTrail events found" : "No valid entries" });
                }
            } catch (err) {
                rejected.push({ name: f.name, reason: err.message });
            }
        }

        // Detailed Ingest Report
        if (rejected.length > 0) {
            let failHtml = `<div class="mb-2" style="color:var(--accent-orange)"><svg class="icon"><use href="#i-alert"></use></svg> Ignored Files:</div><div class="evidence-list">`;
            rejected.forEach(r => {
                failHtml += `<div class="evidence-item"><span style="color:var(--accent-red)">${UIUtils.escapeHtml(r.name)}</span> <span>${UIUtils.escapeHtml(r.reason)}</span></div>`;
            });
            failHtml += `</div>`;
            UIUtils.addBotHTML(failHtml);
        }

        if (cloudEventCount > 0) {
            UIUtils.addBotHTML(`<div style="color:var(--accent-cyan)">Loaded ${cloudEventCount} CloudTrail event(s).</div>`);
        }

        if (flowLoadedCount > 0) {
            this.DB.startTime = new Date().toISOString();
            this.aggregateAnalysis();
        } else if (loadedCount > 0) {
            UIUtils.addBotHTML("No network flow logs to analyze (CloudTrail-only ingest).");
            this.syncDuckDbData();
        } else if (rejected.length === files.length) {
            UIUtils.addBotHTML("All files were rejected.");
        }

        this.syncDuckDbData();
        return { loadedCount, rejected };
    }

    /** Show/update an analysis progress bar in the chat */
    _showProgress(step, total, label) {
        const id = 'analysisProgress';
        let el = document.getElementById(id);
        const pct = Math.round((step / total) * 100);
        if (!el) {
            UIUtils.addBotHTML(`
                <div id="${id}" class="analysis-progress">
                    <div class="analysis-progress-bar">
                        <div class="analysis-progress-fill" style="width:${pct}%"></div>
                    </div>
                    <div class="analysis-progress-label">${label}</div>
                </div>
            `);
        } else {
            el.querySelector('.analysis-progress-fill').style.width = pct + '%';
            el.querySelector('.analysis-progress-label').textContent = label;
        }
    }

    _hideProgress() {
        const el = document.getElementById('analysisProgress');
        if (el) {
            el.style.transition = 'opacity 0.4s';
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 400);
        }
    }

    async processPaste(text) {
        if (this.DB.inputs.length > 0) {
            this.resetCase(true);
        }

        UIUtils.createUserMessage("Pasting Log Data...");

        this._showProgress(1, 4, 'Parsing log entries...');

        const name = `manual_paste_${new Date().getTime()}.txt`;
        const enc = new TextEncoder();
        const rawBytes = enc.encode(text);
        const previewText = text.split(/\r?\n/).slice(0, ANALYSIS_LIMITS.PREVIEW_LINES).join('\n');
        const blob = new Blob([rawBytes], { type: 'text/plain' });
        const lastModified = Date.now();

        const result = LogProcessor.processAnyText ? LogProcessor.processAnyText(text) : { ...LogProcessor.processLogText(text), kind: 'flows' };
        if (result && result.success) {
            this._showProgress(2, 4, 'Registering dataset...');
            const caseId = this.getActiveCaseId();
            let datasetId = `ds_${Date.now()}_${Math.random().toString(16).slice(2)}`;

            if (this.caseStore && caseId) {
                const dataset = await this.caseStore.addDataset(caseId, {
                    name,
                    size: blob.size,
                    lastModified,
                    previewText,
                    kind: result.kind || 'flows'
                });
                if (dataset && dataset.id) datasetId = dataset.id;
            }

            this.DB.inputs.push({
                id: datasetId,
                caseId,
                name,
                size: blob.size,
                lastModified,
                previewText,
                blob,
                hash: await this.sha256(rawBytes),
                kind: result.kind || 'flows',
                entries: Array.isArray(result.entries) ? result.entries : [],
                cloudEvents: Array.isArray(result.events) ? result.events : []
            });
            this.DB.startTime = new Date().toISOString();

            if (result.kind === 'cloudtrail') {
                this.DB.cloudEvents.push(...(Array.isArray(result.events) ? result.events : []));
                this._showProgress(3, 4, 'Syncing CloudTrail data...');
                UIUtils.addBotHTML(`<div style="color:var(--accent-cyan)">Loaded ${Array.isArray(result.events) ? result.events.length : 0} CloudTrail event(s).</div>`);
                UIUtils.addBotHTML("No network flow logs to analyze (CloudTrail-only ingest).");
                this.syncDuckDbData();
                this._hideProgress();
            } else {
                this._showProgress(3, 4, 'Running threat analysis...');
                this.aggregateAnalysis();
            }
        } else {
            UIUtils.addBotHTML(`<span style="color:var(--accent-red)">Paste Rejected: No valid log entries found.</span>`);
        }
    }

    async aggregateAnalysis() {
        const allEntries = this.DB.inputs
            .filter(f => f.kind !== 'cloudtrail')
            .flatMap(f => f.entries.map(e => ({ ...e, _file: f.name })));
        this.DB.entries = allEntries;
        this.DB.total = allEntries.length;
        this._showProgress(3, 4, 'Indexing ' + allEntries.length + ' entries...');
        this.syncDuckDbData();

        const renderReportWithCTA = (stats, total) => {
            this._hideProgress();
            let html = UIUtils.renderReport(stats, total);
            const copyId = `report-${Date.now()}`;
            html = `<div class="report-container" id="${copyId}">${html}</div>`;
            // Add copy + action CTAs
            html += `<div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
                <button class="choice-chip" onclick="window.logAnalystApp.copyReport('${copyId}', this)">
                    <svg class="icon"><use href="#i-copy"></use></svg> Copy Report
                </button>
                <button class="choice-chip" style="background:linear-gradient(135deg,rgba(6,182,212,0.15),rgba(168,85,247,0.15));border-color:rgba(6,182,212,0.4);" onclick="window.logAnalystApp.openModal(window.logAnalystApp.findingsDashboard);window.logAnalystApp.findingsDashboard.refresh()">
                    <svg class="icon"><use href="#i-alert"></use></svg> View Findings Dashboard
                </button>
                <button class="choice-chip" onclick="window.logAnalystApp.openModal(window.logAnalystApp.evidenceModal)">
                    <svg class="icon"><use href="#i-zip"></use></svg> Generate Evidence Bundle
                </button>
                <button class="choice-chip" onclick="window.logAnalystApp.core.processCommand(&quot;what's happening&quot;)">
                    <svg class="icon"><use href="#i-alert"></use></svg> Generate Hypothesis
                </button>
            </div>`;
            return html;
        };

        const canUseWorker = (
            typeof Worker !== 'undefined' &&
            typeof window !== 'undefined' &&
            window.location &&
            window.location.protocol !== 'file:'
        );

        const jobId = ++this.analysisJobId;

        if (!canUseWorker) {
            try {
                this._showProgress(4, 4, 'Analyzing threat patterns...');
                this.STATS = LogProcessor.analyze(allEntries, this.TOPOLOGY, this.IOCS, this.ALLOWLIST);
                UIUtils.addBotHTML(renderReportWithCTA(this.STATS, this.DB.total));
                this._updateBadges();
                this.postProactiveTopAfterAnalysis(jobId);
                await this.persistSnapshotAfterAnalysis();
                return;
            } catch (e) {
                console.error(e);
                const prof = this.getProfile ? this.getProfile() : 'Unknown';
                const msg = `Analysis failed: ${UIUtils.escapeHtml(e.message || 'Unknown error')} (Profile ${UIUtils.escapeHtml(prof)}). State preserved for debugging.`;
                UIUtils.addBotHTML(`<span style="color:var(--accent-red)">${msg}</span>`);
                this.DB = { ...this.INITIAL_STATE, inputs: [] };
                this.STATS = null;
                return;
            }
        }

        this.analysisJobInProgress = jobId;

        if (this.analysisWorker) {
            silentCleanup(() => this.analysisWorker.terminate(), 'previous analysis worker');
            this.analysisWorker = null;
        }

        let worker = null;
        try {
            worker = new Worker('components/AnalysisWorker.js', { type: 'module' });
        } catch (e) {
            console.warn('Worker unavailable, falling back to main thread analysis', e);
            try {
                this._showProgress(4, 4, 'Analyzing threat patterns (main thread)...');
                this.STATS = LogProcessor.analyze(allEntries, this.TOPOLOGY, this.IOCS, this.ALLOWLIST);
                UIUtils.addBotHTML(renderReportWithCTA(this.STATS, this.DB.total));
                this._updateBadges();
                this.postProactiveTopAfterAnalysis(jobId);
                await this.persistSnapshotAfterAnalysis();
            } catch (err) {
                console.error(err);
                const prof = this.getProfile ? this.getProfile() : 'Unknown';
                const msg = `Analysis failed: ${UIUtils.escapeHtml(err.message || 'Unknown error')} (Profile ${UIUtils.escapeHtml(prof)}). State preserved for debugging.`;
                UIUtils.addBotHTML(`<span style="color:var(--accent-red)">${msg}</span>`);
                this.DB = { ...this.INITIAL_STATE, inputs: [] };
                this.STATS = null;
            }
            this.analysisJobInProgress = 0;
            return;
        }

        this.analysisWorker = worker;

        this._showProgress(4, 4, 'Analyzing threat patterns (web worker)...');

        try {
            const timeoutMs = TIMEOUTS.ANALYSIS_MS; // Analysis timeout
            const analysisPromise = new Promise((resolve, reject) => {
                worker.onmessage = (event) => {
                    const msg = event && event.data ? event.data : null;
                    if (!msg || msg.jobId !== jobId) return;

                    if (msg.type === 'analysisResult') return resolve(msg.stats);
                    if (msg.type === 'analysisError') {
                        const emsg = msg.error && msg.error.message ? msg.error.message : 'Worker analysis failed';
                        return reject(new Error(emsg));
                    }

                    return reject(new Error('Worker returned unexpected message'));
                };

                worker.onerror = (event) => {
                    const message = event && event.message ? event.message : 'Worker error';
                    reject(new Error(message));
                };

                worker.onmessageerror = () => {
                    reject(new Error('Worker message error'));
                };

                worker.postMessage({
                    type: 'analyze',
                    jobId,
                    profile: this.profile,
                    entries: allEntries,
                    topology: this.TOPOLOGY,
                    iocs: this.IOCS,
                    allowlist: this.ALLOWLIST
                });
            });

            // Race against timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Analysis timed out after ${timeoutMs}ms`)), timeoutMs);
            });

            const stats = await Promise.race([analysisPromise, timeoutPromise]);

            if (jobId !== this.analysisJobId) return;

            this.STATS = stats;
            UIUtils.addBotHTML(renderReportWithCTA(this.STATS, this.DB.total));
            this._updateBadges();
            this.postProactiveTopAfterAnalysis(jobId);
            await this.persistSnapshotAfterAnalysis();
        } catch (e) {
            if (jobId !== this.analysisJobId) return;

            console.error(e);
            const prof = this.getProfile ? this.getProfile() : 'Unknown';
            const msg = `Analysis failed: ${UIUtils.escapeHtml(e.message || 'Unknown error')} (Profile ${UIUtils.escapeHtml(prof)}). State preserved for debugging.`;
            UIUtils.addBotHTML(`<span style="color:var(--accent-red)">${msg}</span>`);
            this.DB = { ...this.INITIAL_STATE, inputs: [] };
            this.STATS = null;
        } finally {
            if (this.analysisWorker === worker) {
                this.analysisWorker = null;
            }
            if (worker) {
                silentCleanup(() => worker.terminate(), 'analysis worker cleanup');
            }
            if (this.analysisJobInProgress === jobId) {
                this.analysisJobInProgress = 0;
            }
        }
    }

    async persistSnapshotAfterAnalysis() {
        const caseId = this.getActiveCaseId();
        const store = this.caseStore;
        if (!caseId || !store || typeof store.addSnapshot !== 'function') return;
        if (!CaseSnapshot?.buildSnapshot) return;

        const entries = Array.isArray(this.DB.entries) ? this.DB.entries : [];
        const minuteCounts = new Map();
        const srcIps = new Set();
        const dstIps = new Set();
        const dstPorts = new Set();
        const rolePortCounts = new Map();
        const subnetPortCounts = new Map();

        const toSubnet = (ip) => {
            const raw = String(ip || '').trim();
            const parts = raw.split('.');
            if (parts.length !== 4) return '';
            const nums = parts.map(p => parseInt(p, 10));
            if (nums.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return '';
            return `${nums[0]}.${nums[1]}.${nums[2]}.0/24`;
        };

        const incNested = (outerMap, key1, key2, by) => {
            const k1 = String(key1 || '');
            const k2 = String(key2 || '');
            if (!k1 || !k2) return;
            if (!outerMap.has(k1)) outerMap.set(k1, new Map());
            const inner = outerMap.get(k1);
            inner.set(k2, (inner.get(k2) || 0) + (Number.isFinite(by) ? by : 1));
        };

        for (const e of entries) {
            if (!e) continue;

            const src = e.src != null ? String(e.src) : '';
            const dst = e.dst != null ? String(e.dst) : '';
            const dport = e.dport != null ? String(e.dport) : '';
            const action = e.action != null ? String(e.action) : '';

            if (src && src !== '-' && src.toLowerCase() !== 'unknown') srcIps.add(src);
            if (dst && dst !== '-' && dst.toLowerCase() !== 'unknown') dstIps.add(dst);
            if (dport && dport !== '-' && dport.toLowerCase() !== 'unknown') dstPorts.add(dport);

            const weight = (action === 'DROP' || action === 'ALLOW') ? 1 : 1;
            if (src && dport && src !== '-' && dport !== '-') {
                const role = NetworkUtils?.resolveRole
                    ? NetworkUtils.resolveRole(src, this.TOPOLOGY)
                    : '';
                const subnet = toSubnet(src);
                if (role) incNested(rolePortCounts, role, dport, weight);
                if (subnet) incNested(subnetPortCounts, subnet, dport, weight);
            }

            const dt = NetworkUtils?.parseDateTime
                ? NetworkUtils.parseDateTime(e.date, e.time)
                : 0;
            if (dt > 0) {
                const minuteUtc = `${new Date(dt).toISOString().slice(0, 16)}Z`;
                minuteCounts.set(minuteUtc, (minuteCounts.get(minuteUtc) || 0) + 1);
            }
        }

        const minuteBuckets = Array.from(minuteCounts.entries())
            .map(([minuteUtc, count]) => ({ minuteUtc, count }))
            .sort((a, b) => b.count - a.count || a.minuteUtc.localeCompare(b.minuteUtc))
            .slice(0, ANALYSIS_LIMITS.TOP_OUTBOUND_DESTS);

        const takeTopPorts = (innerMap, limit) => {
            const items = Array.from(innerMap.entries()).map(([port, count]) => ({
                port: String(port),
                count: Number.isFinite(count) ? count : 0
            }));
            items.sort((a, b) => b.count - a.count || a.port.localeCompare(b.port));
            return items.slice(0, Math.max(0, Math.min(50, Number.isFinite(limit) ? limit : 15)));
        };

        const portUsageByRole = Array.from(rolePortCounts.entries())
            .map(([role, inner]) => ({
                role: String(role),
                ports: takeTopPorts(inner, 15),
                total: Array.from(inner.values()).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
            }))
            .sort((a, b) => b.total - a.total || a.role.localeCompare(b.role))
            .slice(0, ANALYSIS_LIMITS.TOP_OUTBOUND_DESTS)
            .map(({ role, ports }) => ({ role, ports }));

        const portUsageBySubnet = Array.from(subnetPortCounts.entries())
            .map(([subnet, inner]) => ({
                subnet: String(subnet),
                ports: takeTopPorts(inner, 10),
                total: Array.from(inner.values()).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
            }))
            .sort((a, b) => b.total - a.total || a.subnet.localeCompare(b.subnet))
            .slice(0, ANALYSIS_LIMITS.TOP_PORTS)
            .map(({ subnet, ports }) => ({ subnet, ports }));

        const totals = {
            flows: Number.isFinite(this.DB.total) ? this.DB.total : entries.length,
            cloudtrail: Array.isArray(this.DB.cloudEvents) ? this.DB.cloudEvents.length : 0,
            minuteBuckets,
            seeds: {
                srcIps: Array.from(srcIps).sort((a, b) => a.localeCompare(b)),
                dstIps: Array.from(dstIps).sort((a, b) => a.localeCompare(b)),
                dstPorts: Array.from(dstPorts).sort((a, b) => a.localeCompare(b))
            },
            portUsage: {
                byRole: portUsageByRole,
                bySubnet: portUsageBySubnet
            }
        };

        const createdAt = new Date().toISOString();
        const snapshot = CaseSnapshot.buildSnapshot({
            caseId,
            stats: this.STATS,
            profile: this.profile,
            topology: this.TOPOLOGY,
            totals,
            createdAt
        });

        try {
            const saved = await store.addSnapshot(caseId, snapshot);
            this._pushSnapshotToCache(saved || snapshot);
        } catch (e) {
            console.warn('Snapshot persistence failed', e);
        }
    }

    postProactiveTopAfterAnalysis(jobId) {
        const id = Number.isFinite(jobId) ? jobId : 0;
        if (!id) return;
        if (this.agentLastAutoTopJobId === id) return;
        this.agentLastAutoTopJobId = id;

        if (typeof AgentKernel === 'undefined' || !AgentKernel || typeof AgentKernel.handle !== 'function') return;
        if (typeof AgentRenderer === 'undefined' || !AgentRenderer || typeof AgentRenderer.renderAgentResponse !== 'function') return;

        this.invokeAgentCommand('top threats', { showUserMessage: false, auto: true, transcriptUserText: '[auto] top threats' });
    }

    /** Update sidebar notification badges based on current analysis results */
    _updateBadges() {
        const app = window.logAnalystApp;
        if (!app || !app.sideNav || !this.STATS) return;

        const risk = this.STATS.risk || [];
        const criticalCount = risk.filter(r => r.level === 'Critical' || r.level === 'High').length;
        const totalFindings = risk.length;

        app.sideNav.setBadge('findings', totalFindings);
        app.sideNav.setBadge('dashboard', criticalCount);
    }

    invokeAgentCommand(cmd, options = null) {
        const rawCmd = String(cmd || '');
        const text = rawCmd.trim();
        if (!text) return UIUtils.addBotHTML("No command provided.");

        const opts = options && typeof options === 'object' ? options : {};
        const showUserMessage = opts.showUserMessage !== false;
        const auto = !!opts.auto;
        const transcriptUserText = (typeof opts.transcriptUserText === 'string' && opts.transcriptUserText.trim())
            ? opts.transcriptUserText.trim()
            : text;
        const displayLabel = (typeof opts.displayLabel === 'string' && opts.displayLabel.trim())
            ? opts.displayLabel.trim()
            : null;

        if (showUserMessage) {
            UIUtils.createUserMessage(displayLabel || text);
        }

        if (typeof AgentKernel === 'undefined' || !AgentKernel || typeof AgentKernel.handle !== 'function') {
            return UIUtils.addBotHTML("Agent not available.");
        }
        if (typeof AgentRenderer === 'undefined' || !AgentRenderer || typeof AgentRenderer.renderAgentResponse !== 'function') {
            return UIUtils.addBotHTML("Agent renderer not available.");
        }

        let parsedIntent = { intent: 'help', args: {} };
        if (typeof AgentChatRouter !== 'undefined' && AgentChatRouter && typeof AgentChatRouter.parse === 'function') {
            const nextState = { lastFocus: this.agentLastFocus || null };
            parsedIntent = AgentChatRouter.parse(text, nextState) || parsedIntent;
            if (parsedIntent && parsedIntent.args) {
                if (typeof parsedIntent.args.ip === 'string' && parsedIntent.args.ip.trim()) this.agentLastFocus = parsedIntent.args.ip.trim();
                if (typeof parsedIntent.args.target === 'string' && parsedIntent.args.target.trim()) this.agentLastFocus = parsedIntent.args.target.trim();
                if (typeof parsedIntent.args.focus === 'string' && parsedIntent.args.focus.trim()) this.agentLastFocus = parsedIntent.args.focus.trim();
            }
        }

        if (parsedIntent && parsedIntent.intent === 'top') {
            const risk = (this.STATS && Array.isArray(this.STATS.risk)) ? this.STATS.risk : [];
            const top = risk && risk[0] ? risk[0] : null;
            const topIp = top && typeof top.ip === 'string' ? top.ip.trim() : '';
            if (topIp) this.agentLastFocus = topIp;
        }

        const context = {
            core: this,
            stats: this.STATS || null,
            db: this.DB || null,
            topology: this.TOPOLOGY || null,
            profile: (typeof LogProcessor !== 'undefined' && LogProcessor && typeof LogProcessor.getActiveProfile === 'function')
                ? LogProcessor.getActiveProfile()
                : (this.profile || null),
            state: { lastFocus: this.agentLastFocus || null, auto }
        };

        const res = AgentKernel.handle(context, text);
        if (!res || res.silent) {
            this.persistTranscriptExchange(transcriptUserText, parsedIntent, res);
            return;
        }
        const html = AgentRenderer.renderAgentResponse(res);
        UIUtils.addBotHTML(html);

        this.persistTranscriptExchange(transcriptUserText, parsedIntent, res);
    }

    processCommand(cmd, displayLabel) {
        if (this.analysisJobInProgress) {
            UIUtils.createUserMessage(cmd);
            return UIUtils.addBotHTML("Analysis is still running—try again in a moment.");
        }

        const opts = { showUserMessage: true, auto: false, transcriptUserText: String(cmd || '') };
        if (typeof displayLabel === 'string' && displayLabel.trim()) opts.displayLabel = displayLabel.trim();
        return this.invokeAgentCommand(cmd, opts);
    }

    async persistTranscriptExchange(userText, parsed, response) {
        const store = this.caseStore;
        const caseId = this.getActiveCaseId();
        if (!store || typeof store.appendTranscript !== 'function') return;
        if (!caseId) return;

        const intent = parsed && parsed.intent ? String(parsed.intent) : 'help';
        const args = parsed && parsed.args && typeof parsed.args === 'object' ? { ...parsed.args } : {};
        const verdictLabel = response && response.verdictLabel ? String(response.verdictLabel) : 'UNKNOWN';
        const evidenceRefCount = (response && Array.isArray(response.evidenceRefs)) ? response.evidenceRefs.length : 0;

        const entry = {
            type: 'agent_exchange',
            userText: String(userText || ''),
            parsedIntent: intent,
            parsedArgs: args,
            verdictLabel,
            evidenceRefCount,
            createdAt: new Date().toISOString()
        };

        try {
            await store.appendTranscript(caseId, entry);
        } catch (e) {
            console.warn('Transcript persistence failed', e);
        }
    }

    resetCase(silent = false) {
        // Invalidate any in-flight analysis to prevent stale workers from repopulating state
        this.analysisJobId++;
        this.analysisJobInProgress = 0;
        if (this.analysisWorker) {
            silentCleanup(() => this.analysisWorker.terminate(), 'reset case worker');
            this.analysisWorker = null;
        }

        const chat = document.getElementById('chat');
        if (chat) {
            while (chat.children.length > 1) {
                chat.removeChild(chat.lastChild);
            }
        }

        this.DB = { ...this.INITIAL_STATE, inputs: [] };
        this.STATS = null;
        this.syncDuckDbData();

        if (!silent) {
            UIUtils.addBotHTML("Memory wiped! Ready for new logs. 🗑️");
        }
    }

    async generateEvidence(key, analyst, notes) {
        const caseId = this.getActiveCaseId();
        let caseRecord = null;
        let savedQueries = [];

        try {
            if (this.caseStore && caseId) {
                if (this.caseStore.getCase) caseRecord = await this.caseStore.getCase(caseId);
                if (this.caseStore.listQueries) savedQueries = await this.caseStore.listQueries(caseId);
            }
        } catch (e) {
            console.warn('Failed to load case metadata for evidence', e);
        }

        const lastQueryExecution = this.duckDbService && this.duckDbService.getLastQueryExecution
            ? this.duckDbService.getLastQueryExecution()
            : null;

        const context = {
            core: this,
            caseId,
            case: caseRecord,
            savedQueries,
            lastQueryExecution,
            iocs: Array.isArray(this.IOCS) ? this.IOCS : [],
            allowlist: Array.isArray(this.ALLOWLIST) ? this.ALLOWLIST : [],
            profile: this.profile || null,
            lastFocus: this.agentLastFocus || null,
            totals: {
                flows: Array.isArray(this.DB.entries) ? this.DB.entries.length : (this.DB.total || 0),
                cloudtrail: Array.isArray(this.DB.cloudEvents) ? this.DB.cloudEvents.length : 0
            }
        };

        await EvidenceGenerator.genEvidence(this.DB, this.STATS, this.TOPOLOGY, key, analyst, notes, UIUtils.addBotHTML, null, false, context);
    }

    getStorage() {
        try {
            return window && window.localStorage ? window.localStorage : null;
        } catch (err) {
            return null;
        }
    }

    persistProfile(profileName) {
        const store = this.getStorage();
        if (!store) return;
        try {
            store.setItem(this.STORAGE_KEYS.profile, profileName);
        } catch (err) {
            console.warn('Profile persistence failed', err);
        }
    }

    persistTopology() {
        const store = this.getStorage();
        if (!store) return;
        try {
            store.setItem(this.STORAGE_KEYS.topology, JSON.stringify(this.TOPOLOGY));
        } catch (err) {
            console.warn('Topology persistence failed', err);
        }
    }

    persistIOCs() {
        const store = this.getStorage();
        if (!store) return;
        try {
            store.setItem(this.STORAGE_KEYS.iocs, JSON.stringify(this.IOCS));
        } catch (err) {
            console.warn('IOC save failed', err);
        }
    }

    persistAllowlist() {
        const store = this.getStorage();
        if (!store) return;
        try {
            store.setItem(this.STORAGE_KEYS.allowlist, JSON.stringify(this.ALLOWLIST));
        } catch (err) {
            console.warn('Allowlist save failed', err);
        }
    }

    loadPersistedConfig() {
        const store = this.getStorage();
        if (!store) return;

        try {
            const savedProfile = store.getItem(this.STORAGE_KEYS.profile);
            if (savedProfile) {
                this.setProfile(savedProfile, true);
                this.profile = LogProcessor.getActiveProfile ? LogProcessor.getActiveProfile() : this.profile;
            } else {
                this.setProfile(this.profile, true);
            }
        } catch (err) {
            console.warn('Profile load failed', err);
        }

        try {
            const savedTopo = store.getItem(this.STORAGE_KEYS.topology);
            if (savedTopo) {
                const parsed = JSON.parse(savedTopo);
                if (Array.isArray(parsed)) {
                    this.TOPOLOGY = parsed;
                }
            }
        } catch (err) {
            console.warn('Topology load failed', err);
        }

        try {
            const savedIOCs = store.getItem(this.STORAGE_KEYS.iocs);
            if (savedIOCs) {
                this.IOCS = JSON.parse(savedIOCs);
            }
        } catch (err) {
            console.warn('IOC load failed', err);
        }

        try {
            const savedAllowlist = store.getItem(this.STORAGE_KEYS.allowlist);
            if (savedAllowlist) {
                this.ALLOWLIST = this.normalizeAllowlistEntries(JSON.parse(savedAllowlist));
            }
        } catch (err) {
            console.warn('Allowlist load failed', err);
        }
    }
}

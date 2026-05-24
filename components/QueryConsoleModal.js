/* SQL Console modal component */
import { UIUtils } from './UIUtils.js';
import { QUERY_LIBRARY } from './QueryLibrary.js';

export class QueryConsoleModal {
    constructor(core) {
        this.core = core;
        this.lastQuery = "SELECT 1 AS ok;";
        this.lastQueryName = "";
        this.savedQueries = [];
        this.queryLibraryExpanded = false;
    }

    render() {
        return `
            <div id="queryConsoleModal" class="overlay">
                <div class="modal-box" style="max-width: 980px; width: 95%; max-height: 90vh; overflow: hidden;">
                    <div class="modal-head">
                        <span>SQL Console (DuckDB)</span>
                        <span style="cursor:pointer" onclick="window.logAnalystApp.queryConsoleModal.close()">
                            <svg class="icon"><use href="#i-close"></use></svg>
                        </span>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <div class="form-group">
                            <label class="form-label">Query</label>
                            <textarea id="sqlQueryInput" class="form-input" style="height: 140px; font-size: 0.8rem;" spellcheck="false">${UIUtils.escapeHtml(this.lastQuery)}</textarea>
                            <div class="text-xs" style="color: var(--text-muted); margin-top: 6px;">
                                Tables: <code>flows</code>, <code>cloudtrail</code>, <code>datasets</code>. Requires running from <code>npm run dev</code> (same-origin Worker/WASM).
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label" style="cursor:pointer; user-select:none;" onclick="window.logAnalystApp.queryConsoleModal.toggleQueryLibrary()">
                                Query Library
                                <span id="queryLibraryChevron" style="display:inline-block; transition:transform 0.15s; ${this.queryLibraryExpanded ? 'transform:rotate(90deg)' : ''}">&#9654;</span>
                            </label>
                            <div id="queryLibraryPanel" style="display:${this.queryLibraryExpanded ? 'block' : 'none'}; max-height:260px; overflow-y:auto; border:1px solid var(--border-color, #333); border-radius:4px; padding:8px; margin-top:4px;">
                                ${this.renderQueryLibraryHTML()}
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Save Query</label>
                            <div class="flex gap-2">
                                <input id="sqlQueryNameInput" class="form-input" placeholder="Query name (per case)" value="${UIUtils.escapeHtml(this.lastQueryName)}" />
                                <button class="btn btn-success" onclick="window.logAnalystApp.queryConsoleModal.save()">
                                    <svg class="icon"><use href="#i-check"></use></svg> Save
                                </button>
                                <button class="btn" onclick="window.logAnalystApp.queryConsoleModal.refreshSavedQueries()">
                                    <svg class="icon"><use href="#i-layers"></use></svg> Refresh
                                </button>
                            </div>
                            <div class="text-xs" style="color: var(--text-muted); margin-top: 6px;">
                                Saving uses the active Workspace/Case; same name overwrites.
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Saved Queries</label>
                            <div id="sqlSavedQueries"></div>
                        </div>

                        <div id="sqlQueryStatus" class="text-xs" style="color: var(--text-muted); margin-bottom: 10px;"></div>
                        <div id="sqlQueryResults"></div>
                    </div>
                    <div class="modal-foot" style="justify-content: space-between;">
                        <div class="text-xs" style="color: var(--text-muted); align-self: center;">
                            Tip: Try <code>SELECT count(*) FROM flows</code> after Task 12.
                        </div>
                        <div class="flex gap-2">
                            <button class="btn" onclick="window.logAnalystApp.copySQLResults(this)">
                                <svg class="icon"><use href="#i-copy"></use></svg> Copy
                            </button>
                            <button class="btn" onclick="window.logAnalystApp.queryConsoleModal.clearResults()">Clear</button>
                            <button id="sqlQueryRunBtn" class="btn btn-primary" onclick="window.logAnalystApp.queryConsoleModal.run()">
                                <svg class="icon"><use href="#i-arrow-right"></use></svg> Run
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getCaseStore() {
        const app = window.logAnalystApp || null;
        return app && app.caseStore ? app.caseStore : null;
    }

    getActiveCaseId() {
        if (this.core && typeof this.core.getActiveCaseId === 'function') {
            return this.core.getActiveCaseId();
        }
        const store = this.getCaseStore();
        return store && typeof store.getActiveCaseId === 'function' ? store.getActiveCaseId() : null;
    }

    open() {
        document.getElementById('queryConsoleModal').classList.add('active');
        const input = document.getElementById('sqlQueryInput');
        if (input) {
            input.focus();
            input.selectionStart = input.value.length;
            input.selectionEnd = input.value.length;
        }
        this.setStatus('');
        if (!document.getElementById('sqlQueryResults').innerHTML) {
            const app = window.logAnalystApp || null;
            const svc = app && app.duckDbService ? app.duckDbService : null;
            if (!svc) {
                this.renderMessageTable("DuckDB service unavailable.");
                return;
            }
            if (window.location && window.location.protocol === 'file:') {
                this.renderMessageTable("DuckDB requires running from the dev server (npm run dev), not file://.");
                return;
            }
            this.renderMessageTable("Ready. Ingest logs, then run a query (e.g., SELECT count(*) FROM flows).");
        }

        this.refreshSavedQueries();
    }

    close() {
        document.getElementById('queryConsoleModal').classList.remove('active');
    }

    setStatus(text, isError = false) {
        const el = document.getElementById('sqlQueryStatus');
        if (!el) return;
        el.style.color = isError ? 'var(--accent-red)' : 'var(--text-muted)';
        el.textContent = text || '';
    }

    clearResults() {
        this.setStatus('');
        const el = document.getElementById('sqlQueryResults');
        if (el) el.innerHTML = '';
    }

    setRunEnabled(enabled) {
        const btn = document.getElementById('sqlQueryRunBtn');
        if (!btn) return;
        btn.disabled = !enabled;
        btn.style.opacity = enabled ? '1' : '0.6';
        btn.style.pointerEvents = enabled ? 'auto' : 'none';
    }

    renderMessageTable(message) {
        const rows = [[UIUtils.escapeHtml(message || '')]];
        const html = UIUtils.renderTable(['Status'], rows);
        const el = document.getElementById('sqlQueryResults');
        if (el) el.innerHTML = html;
    }

    renderResults(columns, rows) {
        const safeColumns = Array.isArray(columns) && columns.length ? columns.map(c => UIUtils.escapeHtml(String(c))) : ['Result'];
        const safeRows = Array.isArray(rows) ? rows : [];
        const html = UIUtils.renderTable(safeColumns, safeRows);
        const el = document.getElementById('sqlQueryResults');
        if (el) el.innerHTML = html;
    }

    renderSavedQueries() {
        const el = document.getElementById('sqlSavedQueries');
        if (!el) return;

        if (!this.savedQueries || this.savedQueries.length === 0) {
            el.innerHTML = `<div class="text-xs" style="color:var(--text-muted)">No saved queries for this case yet.</div>`;
            return;
        }

        const rows = this.savedQueries.slice(0, 50).map(q => {
            const name = UIUtils.escapeHtml(String(q.name || ''));
            const updatedAt = UIUtils.escapeHtml(String(q.updatedAt || q.createdAt || ''));
            const id = String(q.id || '');
            const jsId = JSON.stringify(id);
            const btn = `<button class="btn" onclick="window.logAnalystApp.queryConsoleModal.loadSavedQuery(${jsId})">Load</button>`;
            return [name, updatedAt, UIUtils.htmlCell(btn)];
        });

        el.innerHTML = UIUtils.renderTable(['Name', 'Updated', ''], rows);
    }

    async refreshSavedQueries() {
        const store = this.getCaseStore();
        const caseId = this.getActiveCaseId();
        if (!store || !caseId || typeof store.listQueries !== 'function') {
            this.savedQueries = [];
            this.renderSavedQueries();
            return;
        }

        try {
            const rows = await store.listQueries(caseId);
            this.savedQueries = Array.isArray(rows) ? rows : [];
            this.renderSavedQueries();
        } catch (e) {
            console.error(e);
            this.savedQueries = [];
            this.renderSavedQueries();
        }
    }

    loadSavedQuery(queryId) {
        const q = (this.savedQueries || []).find(x => String(x.id || '') === String(queryId || '')) || null;
        if (!q) {
            this.setStatus('Saved query not found.', true);
            return;
        }

        const sql = String(q.sql || q.query || '');
        this.lastQuery = sql || this.lastQuery;
        this.lastQueryName = String(q.name || '').trim();

        const input = document.getElementById('sqlQueryInput');
        if (input) input.value = this.lastQuery;

        const nameInput = document.getElementById('sqlQueryNameInput');
        if (nameInput) nameInput.value = this.lastQueryName;

        this.setStatus(`Loaded "${this.lastQueryName || 'query'}".`);
    }

    async save() {
        const store = this.getCaseStore();
        const caseId = this.getActiveCaseId();
        if (!store || !caseId || typeof store.saveQuery !== 'function') {
            this.setStatus('No active case (Workspace) selected.', true);
            return;
        }

        const sqlInput = document.getElementById('sqlQueryInput');
        const sql = sqlInput ? String(sqlInput.value || '') : '';
        if (!sql.trim()) {
            this.setStatus('Enter a SQL query before saving.', true);
            return;
        }

        const nameInput = document.getElementById('sqlQueryNameInput');
        const name = nameInput ? String(nameInput.value || '') : '';
        const cleanName = name.trim() || 'Untitled Query';
        this.lastQueryName = cleanName;

        try {
            await store.saveQuery(caseId, { name: cleanName, sql });
            this.setStatus(`Saved "${cleanName}".`);
            await this.refreshSavedQueries();
        } catch (e) {
            const msg = e && e.message ? e.message : 'Save failed';
            this.setStatus(msg, true);
        }
    }

    renderQueryLibraryHTML() {
        const categories = [];
        const seen = new Set();
        for (const q of QUERY_LIBRARY) {
            if (!seen.has(q.category)) {
                seen.add(q.category);
                categories.push(q.category);
            }
        }

        let html = '';
        for (const cat of categories) {
            const queries = QUERY_LIBRARY.filter(q => q.category === cat);
            html += `<div style="margin-bottom:8px;">`;
            html += `<div class="form-label" style="margin-bottom:2px; font-size:0.75rem; opacity:0.7;">${UIUtils.escapeHtml(cat)}</div>`;
            for (const q of queries) {
                const safeName = UIUtils.escapeHtml(q.name);
                const safeDesc = UIUtils.escapeHtml(q.description);
                const idx = QUERY_LIBRARY.indexOf(q);
                html += `<button class="btn" style="display:block; width:100%; text-align:left; margin-bottom:3px; font-size:0.78rem; padding:4px 8px;" title="${safeDesc}" onclick="window.logAnalystApp.queryConsoleModal.loadLibraryQuery(${idx})">${safeName}</button>`;
            }
            html += `</div>`;
        }
        return html;
    }

    toggleQueryLibrary() {
        this.queryLibraryExpanded = !this.queryLibraryExpanded;
        const panel = document.getElementById('queryLibraryPanel');
        const chevron = document.getElementById('queryLibraryChevron');
        if (panel) panel.style.display = this.queryLibraryExpanded ? 'block' : 'none';
        if (chevron) chevron.style.transform = this.queryLibraryExpanded ? 'rotate(90deg)' : '';
    }

    loadLibraryQuery(index) {
        const entry = QUERY_LIBRARY[index];
        if (!entry) {
            this.setStatus('Query not found in library.', true);
            return;
        }
        this.lastQuery = entry.sql;
        const input = document.getElementById('sqlQueryInput');
        if (input) input.value = this.lastQuery;
        const nameInput = document.getElementById('sqlQueryNameInput');
        if (nameInput) nameInput.value = entry.name;
        this.lastQueryName = entry.name;
        this.setStatus(`Loaded "${entry.name}" — ${entry.description}`);
    }

    async run() {
        const input = document.getElementById('sqlQueryInput');
        const sql = input ? input.value : '';
        this.lastQuery = sql;

        if (!sql || !sql.trim()) {
            this.setStatus('Enter a SQL query to run.', true);
            return;
        }

        this.setRunEnabled(false);
        this.setStatus('Running query…');

        try {
            const app = window.logAnalystApp || null;
            const svc = app && app.duckDbService ? app.duckDbService : null;

            if (!svc || typeof svc.runQuery !== 'function') {
                this.setStatus('DuckDB service not initialized (Task 12).', true);
                this.renderMessageTable('DuckDB service not initialized yet.');
                return;
            }

            const result = await svc.runQuery(sql);
            const columns = result && Array.isArray(result.columns) ? result.columns : [];
            const rows = result && Array.isArray(result.rows) ? result.rows : [];

            const totalRows = result && typeof result.totalRows === 'number' ? result.totalRows : rows.length;
            const truncated = result && result.truncated;
            this.setStatus(truncated ? `OK (${totalRows} row(s), showing ${rows.length})` : `OK (${rows.length} row(s))`);
            this.renderResults(columns, rows);
        } catch (e) {
            const msg = e && e.message ? e.message : 'Query failed';
            this.setStatus(msg, true);
            this.renderMessageTable(msg);
        } finally {
            this.setRunEnabled(true);
        }
    }
}

/* Datasets modal (metadata + in-memory status) */
import { UIUtils } from './UIUtils.js';

export class DatasetsModal {
    constructor(core) {
        this.core = core;
        this.selectedId = null;
    }

    render() {
        return `
            <div id="datasetsModal" class="overlay">
                <div class="modal-box" style="max-width: 980px; width: 95%; max-height: 90vh; overflow: hidden;">
                    <div class="modal-head">
                        <span>Datasets</span>
                        <span style="cursor:pointer" onclick="window.logAnalystApp.datasetsModal.close()">
                            <svg class="icon"><use href="#i-close"></use></svg>
                        </span>
                    </div>
                    <div class="modal-body" style="padding: 20px; overflow:auto; max-height: calc(90vh - 120px);">
                        <div class="text-xs" style="color: var(--text-muted); margin-bottom: 12px;">
                            Shows datasets registered to the active workspace. Only currently-loaded datasets can be re-analyzed or exported without re-dropping the file.
                        </div>
                        <div id="datasetsList"></div>
                        <div style="margin-top: 14px;">
                            <label class="form-label">Preview</label>
                            <textarea id="datasetPreview" class="form-input" style="height: 160px;" readonly></textarea>
                        </div>
                    </div>
                    <div class="modal-foot" style="justify-content: space-between;">
                        <div class="text-xs" style="color: var(--text-muted); align-self: center;">
                            Tip: Drag/drop additional files to attach more datasets to this case.
                        </div>
                        <div class="flex gap-2">
                            <button class="btn" onclick="window.logAnalystApp.datasetsModal.refresh()">
                                <svg class="icon"><use href="#i-layers"></use></svg> Refresh
                            </button>
                            <button class="btn" onclick="window.logAnalystApp.datasetsModal.close()">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    open() {
        const modal = document.getElementById('datasetsModal');
        if (!modal) return;
        modal.classList.add('active');
        this.refresh();

        this._keyHandler = (e) => {
            if (e.key === 'Escape') this.close();
        };
        this._backdropHandler = (e) => {
            if (e.target === modal) this.close();
        };
        document.addEventListener('keydown', this._keyHandler);
        modal.addEventListener('click', this._backdropHandler);
    }

    close() {
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
        if (this._backdropHandler) {
            const modal = document.getElementById('datasetsModal');
            if (modal) modal.removeEventListener('click', this._backdropHandler);
            this._backdropHandler = null;
        }
        const modal = document.getElementById('datasetsModal');
        if (modal) modal.classList.remove('active');
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

    setPreview(text) {
        const el = document.getElementById('datasetPreview');
        if (el) el.value = text || '';
    }

    async refresh() {
        const listEl = document.getElementById('datasetsList');
        if (!listEl) return;

        const store = this.getCaseStore();
        const caseId = this.getActiveCaseId();
        if (!store || !caseId || typeof store.listDatasets !== 'function') {
            listEl.innerHTML = `<div class="text-xs" style="color:var(--accent-red)">No active workspace selected.</div>`;
            this.setPreview('');
            return;
        }

        const db = this.core && this.core.getDB ? this.core.getDB() : { inputs: [] };
        const loadedInputs = Array.isArray(db.inputs) ? db.inputs : [];
        const loadedById = {};
        loadedInputs.forEach(i => {
            if (i && i.id) loadedById[String(i.id)] = i;
        });

        try {
            const rows = await store.listDatasets(caseId);
            const datasets = Array.isArray(rows) ? rows : [];

            if (!datasets.length) {
                listEl.innerHTML = `<div class="text-xs" style="color:var(--text-muted)">No datasets for this case yet.</div>`;
                this.setPreview('');
                return;
            }

            const tableRows = datasets.map(d => {
                const id = String(d.id || '');
                const name = UIUtils.escapeHtml(String(d.name || ''));
                const kind = UIUtils.escapeHtml(String(d.kind || 'unknown'));
                const size = UIUtils.escapeHtml(String(d.size || 0));
                const updated = UIUtils.escapeHtml(UIUtils.formatTimestamp(d.lastModified || d.createdAt));

                const loaded = !!loadedById[id];
                const status = loaded
                    ? UIUtils.htmlCell(`<span class="badge b-green">LOADED</span>`)
                    : UIUtils.htmlCell(`<span class="badge b-orange">METADATA</span>`);

                const btn = UIUtils.htmlCell(`<button class="btn" onclick="window.logAnalystApp.datasetsModal.select(${JSON.stringify(id)})">View</button>`);

                return [name, kind, size, updated, status, btn];
            });

            listEl.innerHTML = UIUtils.renderTable(['Name', 'Kind', 'Bytes', 'Last Modified', 'Status', ''], tableRows);

            if (!this.selectedId && datasets[0] && datasets[0].id) {
                this.select(String(datasets[0].id));
            } else if (this.selectedId) {
                this.select(this.selectedId);
            }
        } catch (e) {
            console.error(e);
            listEl.innerHTML = `<div class="text-xs" style="color:var(--accent-red)">Failed to load datasets: ${UIUtils.escapeHtml(e.message || 'Unknown error')}</div>`;
        }
    }

    select(datasetId) {
        this.selectedId = String(datasetId || '');

        const store = this.getCaseStore();
        const caseId = this.getActiveCaseId();
        const db = this.core && this.core.getDB ? this.core.getDB() : { inputs: [] };
        const loadedInputs = Array.isArray(db.inputs) ? db.inputs : [];

        const loaded = loadedInputs.find(i => i && String(i.id || '') === this.selectedId) || null;
        if (loaded && typeof loaded.previewText === 'string') {
            this.setPreview(loaded.previewText);
            return;
        }

        if (store && caseId && typeof store.listDatasets === 'function') {
            store.listDatasets(caseId).then(rows => {
                const datasets = Array.isArray(rows) ? rows : [];
                const meta = datasets.find(d => d && String(d.id || '') === this.selectedId) || null;
                this.setPreview(meta && typeof meta.previewText === 'string' ? meta.previewText : '');
            }).catch(() => {
                this.setPreview('');
            });
        } else {
            this.setPreview('');
        }
    }
}

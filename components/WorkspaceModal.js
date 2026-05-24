/* Workspace modal component */
import { UIUtils } from './UIUtils.js';

export class WorkspaceModal {
    constructor(app) {
        this.app = app;
        this.required = false;
    }

    render() {
        return `
            <div id="workspaceModal" class="overlay">
                <div class="modal-box" style="width: 720px;">
                    <div class="modal-head">
                        <span>Workspace</span>
                        <span id="workspaceModalCloseBtn" style="cursor:pointer" onclick="window.logAnalystApp.workspaceModal.close()">
                            <svg class="icon"><use href="#i-close"></use></svg>
                        </span>
                    </div>
                    <div class="modal-body">
                        <div class="text-xs" style="color:var(--text-muted); margin-bottom: 14px;">
                            Create or open a Case. All ingests will attach to the active workspace.
                        </div>

                        <div style="display:flex; gap:10px; align-items:flex-end; margin-bottom: 18px;">
                            <div style="flex:1;">
                                <label class="form-label">Create new case</label>
                                <input id="workspaceNewCaseName" type="text" class="form-input" placeholder="e.g. Case-2025-001">
                            </div>
                            <button class="btn btn-primary" onclick="window.logAnalystApp.workspaceModal.createCaseFromInput()">
                                <svg class="icon"><use href="#i-plus"></use></svg> Create
                            </button>
                        </div>

                        <div class="font-bold mb-1">Open existing</div>
                        <div id="workspaceCaseList" class="evidence-list"></div>
                    </div>
                    <div class="modal-foot">
                        <button class="btn" onclick="window.logAnalystApp.workspaceModal.refreshList()">
                            <svg class="icon"><use href="#i-layers"></use></svg> Refresh
                        </button>
                        <button id="workspaceModalCancelBtn" class="btn btn-danger" onclick="window.logAnalystApp.workspaceModal.close()">Cancel</button>
                    </div>
                </div>
            </div>
        `;
    }

    async open(options = {}) {
        this.required = !!options.required;

        const closeBtn = document.getElementById('workspaceModalCloseBtn');
        const cancelBtn = document.getElementById('workspaceModalCancelBtn');
        if (closeBtn) closeBtn.style.display = this.required ? 'none' : '';
        if (cancelBtn) cancelBtn.style.display = this.required ? 'none' : '';

        const modal = document.getElementById('workspaceModal');
        if (!modal) return;

        modal.classList.add('active');
        await this.refreshList();

        const input = document.getElementById('workspaceNewCaseName');
        if (input) input.focus();
    }

    close() {
        if (this.required) return;
        const modal = document.getElementById('workspaceModal');
        if (modal) modal.classList.remove('active');
    }

    forceClose() {
        this.required = false;
        const modal = document.getElementById('workspaceModal');
        if (modal) modal.classList.remove('active');
    }

    async refreshList() {
        const listEl = document.getElementById('workspaceCaseList');
        if (!listEl) return;

        const store = this.app.caseStore;
        if (!store) {
            listEl.innerHTML = `<div class="text-xs" style="color:var(--accent-red)">CaseStore not available.</div>`;
            return;
        }

        try {
            const cases = await store.listCases();
            const activeId = store.getActiveCaseId ? store.getActiveCaseId() : null;

            if (!cases.length) {
                listEl.innerHTML = `<div class="text-xs" style="color:var(--text-muted)">No cases yet. Create one above.</div>`;
                return;
            }

            listEl.innerHTML = cases.map(c => {
                const name = UIUtils.escapeHtml(c.name || 'Untitled Case');
                const id = UIUtils.escapeHtml(c.id);
                const activeTag = c.id === activeId ? `<span class="badge b-green" style="margin-left:8px;">ACTIVE</span>` : '';
                const updatedAt = UIUtils.escapeHtml(c.updatedAt || c.createdAt || '');
                return `
                    <div class="evidence-item" style="align-items:center;">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-weight:600;">${name}</span>
                                ${activeTag}
                            </div>
                            <div class="text-xs" style="color:var(--text-muted)">id: ${id} · updated: ${updatedAt}</div>
                        </div>
                        <button class="btn btn-success" onclick="window.logAnalystApp.workspaceModal.openCase('${id}')">
                            <svg class="icon"><use href="#i-arrow-right"></use></svg> Open
                        </button>
                    </div>
                `;
            }).join('');
        } catch (e) {
            listEl.innerHTML = `<div class="text-xs" style="color:var(--accent-red)">Failed to load cases: ${UIUtils.escapeHtml(e.message || 'Unknown error')}</div>`;
        }
    }

    async createCaseFromInput() {
        const store = this.app.caseStore;
        if (!store) return;

        const input = document.getElementById('workspaceNewCaseName');
        const name = input ? input.value.trim() : '';

        try {
            const record = await store.createCase({ name });
            if (input) input.value = '';
            if (this.app && this.app.core && typeof this.app.core.setActiveCaseName === 'function') {
                this.app.core.setActiveCaseName(record.name);
            }
            if (UIUtils && UIUtils.addBotHTML) {
                UIUtils.addBotHTML(`<div style="color:var(--accent-green)">Workspace opened: <strong>${UIUtils.escapeHtml(record.name)}</strong></div>`);
            }
            if (this.app && this.app.core && typeof this.app.core.refreshSnapshotCache === 'function') {
                try {
                    await this.app.core.refreshSnapshotCache();
                } catch {
                    // ignore
                }
            }
            if (this.app && this.app.sideNav && this.app.sideNav.refresh) {
                await this.app.sideNav.refresh();
            }
            this.forceClose();
            if (this.app && this.app.showToast) {
                this.app.showToast(`Switched to workspace: <strong>${UIUtils.escapeHtml(record.name)}</strong>`, 'success');
            }
            this.flashSideNav();
        } catch (e) {
            alert(`Failed to create case: ${e.message || 'Unknown error'}`);
        }
    }

    async openCase(caseId) {
        const store = this.app.caseStore;
        if (!store) return;

        try {
            store.setActiveCase(caseId);
            const record = await store.getCase(caseId);
            if (this.app && this.app.core && typeof this.app.core.setActiveCaseName === 'function') {
                this.app.core.setActiveCaseName((record && record.name) || null);
            }
            if (UIUtils && UIUtils.addBotHTML) {
                UIUtils.addBotHTML(`<div style="color:var(--accent-green)">Workspace opened: <strong>${UIUtils.escapeHtml((record && record.name) || caseId)}</strong></div>`);
            }
            if (this.app && this.app.core && typeof this.app.core.refreshSnapshotCache === 'function') {
                try {
                    await this.app.core.refreshSnapshotCache();
                } catch {
                    // ignore
                }
            }
            if (this.app && this.app.sideNav && this.app.sideNav.refresh) {
                await this.app.sideNav.refresh();
            }
            this.forceClose();
            if (this.app && this.app.showToast) {
                const label = (record && record.name) || caseId;
                this.app.showToast(`Switched to workspace: <strong>${UIUtils.escapeHtml(label)}</strong>`, 'success');
            }
            this.flashSideNav();
        } catch (e) {
            alert(`Failed to open case: ${e.message || 'Unknown error'}`);
        }
    }

    flashSideNav() {
        const nav = document.getElementById('sideNav');
        if (!nav) return;
        nav.style.transition = 'box-shadow 0.3s ease';
        nav.style.boxShadow = 'inset 0 0 30px rgba(6, 182, 212, 0.3)';
        setTimeout(() => {
            nav.style.boxShadow = '';
        }, 800);
    }
}

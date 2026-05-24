/* Left navigation — organized into DATA / ANALYSIS / TOOLS sections */
export class SideNav {
    constructor(app) {
        this.app = app;
        this.active = 'findings';
        this._badges = { findings: 0, dashboard: 0 };
    }

    render() {
        return `
            <div class="side-nav" id="sideNav">
                <div class="side-nav-top">
                    <div id="sideNavActiveCase" class="side-nav-subtitle"></div>
                    <div id="sideNavApiStatus" class="side-nav-subtitle">Local Mode — analysis runs in your browser</div>
                </div>

                <div class="side-nav-section">
                    <div class="side-nav-label">DATA</div>
                    ${this.renderNavItem('workspaces', 'Workspaces', 'i-layers', 'Switch or create investigation cases')}
                    ${this.renderNavItem('datasets', 'Datasets', 'i-file', 'Load log files for analysis')}
                </div>

                <div class="side-nav-divider"></div>

                <div class="side-nav-section">
                    <div class="side-nav-label">ANALYSIS</div>
                    ${this.renderNavItem('findings', 'Findings', 'i-alert', 'Severity & risk overview', 'findings')}
                    ${this.renderNavItem('dashboard', 'Dashboard', 'i-shield', 'MITRE map & host cards', 'dashboard')}
                    ${this.renderNavItem('queries', 'SQL Console', 'i-code', 'Run SQL queries with DuckDB')}
                </div>

                <div class="side-nav-divider"></div>

                <div class="side-nav-section">
                    <div class="side-nav-label">TOOLS</div>
                    <button class="side-nav-btn" title="Topology, threat intel, and allowlist settings" onclick="window.logAnalystApp.openModal(window.logAnalystApp.configModal)">
                        <svg class="icon"><use href="#i-settings"></use></svg>
                        <div class="side-nav-btn-text">
                            <span>Config</span>
                            <span class="nav-hint">Topology &amp; threat intel</span>
                        </div>
                    </button>
                    <button class="side-nav-btn" title="5-slide executive presentation of findings" onclick="if(window.logAnalystApp.theaterMode){window.logAnalystApp.closeAllModals();window.logAnalystApp.theaterMode.open();}">
                        <svg class="icon"><use href="#i-layers"></use></svg>
                        <div class="side-nav-btn-text">
                            <span>Presentation</span>
                            <span class="nav-hint">Boardroom-ready slides</span>
                        </div>
                    </button>
                    <button class="side-nav-btn" title="Export a forensic evidence ZIP with HMAC signing" onclick="window.logAnalystApp.openModal(window.logAnalystApp.evidenceModal)">
                        <svg class="icon"><use href="#i-zip"></use></svg>
                        <div class="side-nav-btn-text">
                            <span>Export ZIP</span>
                            <span class="nav-hint">Forensic evidence bundle</span>
                        </div>
                    </button>
                    <button class="side-nav-btn" title="Documentation, keyboard shortcuts, and glossary" onclick="window.logAnalystApp.openModal(window.logAnalystApp.helpModal)">
                        <svg class="icon"><use href="#i-help"></use></svg>
                        <div class="side-nav-btn-text">
                            <span>Help</span>
                            <span class="nav-hint">Docs &amp; shortcuts</span>
                        </div>
                    </button>
                </div>

                <div class="side-nav-bottom">
                    <button class="side-nav-btn side-nav-btn-danger" title="Clear all data and start a fresh session" onclick="if(confirm('Reset this case? All chat and analysis will be cleared.')){window.logAnalystApp.core.resetCase();}">
                        <svg class="icon"><use href="#i-trash"></use></svg>
                        <span>Reset</span>
                    </button>
                </div>
            </div>
        `;
    }

    renderNavItem(id, label, iconId, hint, badgeId) {
        const activeClass = this.active === id ? ' active' : '';
        const badgeHtml = badgeId
            ? `<span class="nav-badge" id="badge-${badgeId}" style="display:none;"></span>`
            : '';
        return `
            <button class="side-nav-item${activeClass}" title="${hint}" onclick="window.logAnalystApp.sideNav.openSection('${id}')">
                <svg class="icon"><use href="#${iconId}"></use></svg>
                <div class="side-nav-btn-text">
                    <span>${label}${badgeHtml}</span>
                    <span class="nav-hint">${hint}</span>
                </div>
            </button>
        `;
    }

    setActive(section) {
        this.active = section || 'findings';

        const root = document.getElementById('sideNav');
        if (!root) return;
        const buttons = root.querySelectorAll('.side-nav-item');
        buttons.forEach(b => b.classList.remove('active'));
        const target = root.querySelector(`.side-nav-item[onclick*="openSection('${this.active}')"]`);
        if (target) target.classList.add('active');
    }

    /** Show a notification badge with count on a sidebar item */
    setBadge(badgeId, count) {
        this._badges[badgeId] = count;
        const el = document.getElementById(`badge-${badgeId}`);
        if (!el) return;
        if (count > 0) {
            el.style.display = 'inline-flex';
            el.textContent = count > 99 ? '99+' : count;
        } else {
            el.style.display = 'none';
        }
    }

    /** Clear badge for a section (called when user opens it) */
    clearBadge(badgeId) {
        this.setBadge(badgeId, 0);
    }

    async refresh() {
        const el = document.getElementById('sideNavActiveCase');
        if (!el) return;

        const store = this.app && this.app.caseStore ? this.app.caseStore : null;
        const activeId = store && store.getActiveCaseId ? store.getActiveCaseId() : null;
        if (!store || !activeId || !store.getCase) {
            el.textContent = 'No active workspace';
            return;
        }

        try {
            const rec = await store.getCase(activeId);
            const name = rec && rec.name ? String(rec.name) : activeId;
            el.textContent = `Active: ${name}`;
        } catch {
            el.textContent = `Active: ${activeId}`;
        }
    }

    setApiStatus(text, ok) {
        const el = document.getElementById('sideNavApiStatus');
        if (!el) return;
        if (ok) {
            el.textContent = 'API Connected — enhanced analysis available';
            el.style.color = 'var(--accent-green)';
        } else {
            el.textContent = 'Local Mode — analysis runs in your browser';
            el.style.color = 'var(--text-muted)';
        }
    }

    async openSection(section) {
        this.setActive(section);

        // Clear badges when user opens these sections
        if (section === 'findings' || section === 'dashboard') {
            this.clearBadge(section);
        }

        if (section === 'workspaces') {
            await window.logAnalystApp.openModal(window.logAnalystApp.workspaceModal, { required: false });
            return;
        }

        if (section === 'datasets') {
            window.logAnalystApp.openModal(window.logAnalystApp.datasetsModal);
            return;
        }

        if (section === 'queries') {
            window.logAnalystApp.openModal(window.logAnalystApp.queryConsoleModal);
            return;
        }

        if (section === 'findings') {
            window.logAnalystApp.openModal(window.logAnalystApp.findingsDashboard);
            window.logAnalystApp.findingsDashboard.refresh();
            return;
        }

        if (section === 'dashboard') {
            window.logAnalystApp.openModal(window.logAnalystApp.findingsDashboard);
            window.logAnalystApp.findingsDashboard.refresh();
        }
    }
}

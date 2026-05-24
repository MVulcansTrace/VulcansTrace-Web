/* Main application component that orchestrates all other components */
import { LogAnalystCore } from './LogAnalystCore.js';
import { DuckDbService } from './DuckDbService.js';
import { SideNav } from './SideNav.js';
import { Header } from './Header.js';
import { ChatContainer } from './ChatContainer.js';
import { InputArea } from './InputArea.js';
import { ConfigModal } from './ConfigModal.js';
import { EvidenceModal } from './EvidenceModal.js';
import { RemediationModal } from './RemediationModal.js';
import { EvidenceSliceModal } from './EvidenceSliceModal.js';
import { HelpModal } from './HelpModal.js';
import { TheaterMode } from './TheaterMode.js';
import { QueryConsoleModal } from './QueryConsoleModal.js';
import { DatasetsModal } from './DatasetsModal.js';
import { DropOverlay } from './DropOverlay.js';
import { WorkspaceModal } from './WorkspaceModal.js';
import { CaseStore } from './CaseStore.js';
import { ThemeSelector } from './ThemeSelector.js';
import { SelfTestSuite } from './SelfTestSuite.js';
import { GuidedDemo } from './GuidedDemo.js';
import { FullJourneyDemo } from './FullJourneyDemo.js';
import { FindingsDashboard } from './FindingsDashboard.js';
import { CommandPalette } from './CommandPalette.js';
import { KeyboardShortcuts } from './KeyboardShortcuts.js';
import { UIUtils } from './UIUtils.js';
import { silentCleanup } from './errorUtils.js';

export class LogAnalystApp {
    constructor() {
        this.core = new LogAnalystCore();
        this.duckDbService = new DuckDbService();
        if (this.core?.setDuckDbService) this.core.setDuckDbService(this.duckDbService);
        this.sideNav = new SideNav(this);
        this.header = new Header(this.core);
        this.chatContainer = new ChatContainer();
        this.inputArea = new InputArea(this.core);
        this.configModal = new ConfigModal(this.core);
        this.evidenceModal = new EvidenceModal(this.core);
        this.remediationModal = new RemediationModal(this.core);
        this.evidenceSliceModal = new EvidenceSliceModal();
        this.helpModal = new HelpModal();
        this.theaterMode = new TheaterMode(this.core);
        this.queryConsoleModal = new QueryConsoleModal(this.core);
        this.datasetsModal = new DatasetsModal(this.core);
        this.dropOverlay = new DropOverlay(this.core);
        this.caseStore = null;
        this.workspaceModal = new WorkspaceModal(this);
        this.findingsDashboard = new FindingsDashboard(this.core);
        this.commandPalette = new CommandPalette();
        this.keyboardShortcuts = new KeyboardShortcuts();
        this.themeSelector = null;
        this.apiConnected = false;

        // All modal instances for mutual exclusion
        this._modals = null; // initialized after render
    }

    async init() {
        // Make app globally accessible
        window.logAnalystApp = this;

        // Render all components
        this.render();

        // Setup global event handlers
        this.setupEventHandlers();

        await this.initializeCaseStore();
        await this.checkApiStatus();

        // Bind Ctrl+K command palette shortcut
        this.commandPalette.bindGlobalShortcut();

        // Bind ? keyboard shortcuts panel
        this.keyboardShortcuts.bindGlobalShortcut();
    }

    render() {
        const body = document.body;
        const html = [
            this.getSvgDefinitions(),
            this.dropOverlay.render(),
            this.header.render(),
            `<div class="app-shell">${this.sideNav.render()}<div class="main-panel">${this.chatContainer.render()}${this.inputArea.render()}</div></div>`,
            this.configModal.render(),
            this.evidenceModal.render(),
            this.remediationModal.render(),
            this.evidenceSliceModal.render(),
            this.helpModal.render(),
            this.theaterMode.render(),
            this.queryConsoleModal.render(),
            this.datasetsModal.render(),
            this.workspaceModal.render(),
            this.findingsDashboard.render(),
            this.commandPalette.render(),
            this.keyboardShortcuts.render()
        ].join('');
        body.innerHTML = html;

        // Initialize modal registry for mutual exclusion
        this._modals = [
            this.configModal, this.evidenceModal, this.remediationModal,
            this.evidenceSliceModal, this.helpModal, this.queryConsoleModal,
            this.datasetsModal, this.workspaceModal, this.findingsDashboard
        ];

        body.setAttribute('ondragover', 'window.logAnalystApp.dropOverlay.handleDragOver(event)');
        body.setAttribute('ondragleave', 'window.logAnalystApp.dropOverlay.handleDragLeave(event)');
        body.setAttribute('ondrop', 'window.logAnalystApp.dropOverlay.handleDrop(event)');

        setTimeout(() => {
            this.initializeThemeSelector();
        }, 0);

        // Bind input area drag-and-drop
        this.inputArea.bindDropZone();
    }

    /** Copy report content to clipboard */
    async copyReport(containerId, buttonEl) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const text = container.innerText || container.textContent || '';
        const trimmed = text.trim();
        if (!trimmed) return;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(trimmed);
            } else {
                const ta = document.createElement('textarea');
                ta.value = trimmed;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            if (buttonEl) {
                const orig = buttonEl.innerHTML;
                buttonEl.innerHTML = '<svg class="icon"><use href="#i-check"></use></svg> Copied!';
                buttonEl.style.borderColor = 'var(--accent-green)';
                setTimeout(() => {
                    buttonEl.innerHTML = orig;
                    buttonEl.style.borderColor = '';
                }, 2000);
            }
            this.showToast('Report copied to clipboard', 'success');
        } catch (err) {
            console.error('Copy failed', err);
            this.showToast('Copy failed', 'error');
        }
    }

    /** Copy SQL results to clipboard */
    async copySQLResults(buttonEl) {
        const results = document.getElementById('sqlQueryResults');
        if (!results) return;
        const text = results.innerText || results.textContent || '';
        const trimmed = text.trim();
        if (!trimmed) return;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(trimmed);
            } else {
                const ta = document.createElement('textarea');
                ta.value = trimmed;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            if (buttonEl) {
                const orig = buttonEl.innerHTML;
                buttonEl.innerHTML = '<svg class="icon"><use href="#i-check"></use></svg> Copied!';
                buttonEl.style.borderColor = 'var(--accent-green)';
                setTimeout(() => {
                    buttonEl.innerHTML = orig;
                    buttonEl.style.borderColor = '';
                }, 2000);
            }
        } catch (err) {
            console.error('Copy failed', err);
        }
    }

    addStyles() {
        // Styles are already included in the HTML
        // In a real application, we might want to separate these into a CSS file
    }

    getSvgDefinitions() {
        return `
            <!-- SVG Definitions -->
            <svg style="display: none;">
                <!-- Custom Friendly Robot Icon -->
                <symbol id="i-robot" viewBox="0 0 24 24"><path d="M12 2c1.1 0 2 .9 2 2h3c1.1 0 2 .9 2 2v2h2v6h-2v2c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2v-2H3v-6h2V6c0-1.1.9-2 2-2h3c0-1.1.9-2 2-2zm0 2c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1zM7 8v8h10V8H7zm2 2h2v2H9v-2zm4 0h2v2h-2v-2z"/></symbol>
                <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></symbol>
                <symbol id="i-file" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></symbol>
                <symbol id="i-lock" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></symbol>
                <symbol id="i-trash" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></symbol>
                <symbol id="i-download" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></symbol>
                <symbol id="i-code" viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></symbol>
                <symbol id="i-zip" viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2h8v2zm0-4H6v-2h8v2z"/></symbol>
                <symbol id="i-check" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></symbol>
                <symbol id="i-layers" viewBox="0 0 24 24"><path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/></symbol>
                <symbol id="i-arrow-right" viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></symbol>
                <symbol id="i-settings" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L3.16 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></symbol>
                <symbol id="i-close" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></symbol>
                <symbol id="i-copy" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></symbol>
                <symbol id="i-plus" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></symbol>
              <symbol id="i-help" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></symbol>
                <symbol id="i-key" viewBox="0 0 24 24"><path d="M7 11h2v2H7zm0 4h2v2H7zm4-4h2v2h-2zm0 4h2v2h-2zm4-4h2v2h-2zm0 4h2v2h-2zM21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H3V6h18v12z"/></symbol>
                <symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></symbol>
            </svg>
        `;
    }

    initializeThemeSelector() {
        this.themeSelector = new ThemeSelector();
        const container = document.getElementById('themeSelectorContainer');
        if (container) {
            container.appendChild(this.themeSelector.createThemeSelector());
        }
    }

    setupEventHandlers() {
        // Additional setup if needed
    }

    async initializeCaseStore() {
        if (this.caseStore) return;

        try {
            if (typeof CaseStore === 'undefined') {
                UIUtils.addBotHTML(`<span style="color:var(--accent-red)">Case storage unavailable (CaseStore missing).</span>`);
                return;
            }

            this.caseStore = new CaseStore();
            await this.caseStore.open();
            if (this.core && this.core.setCaseStore) this.core.setCaseStore(this.caseStore);
            if (this.core && typeof this.core.refreshSnapshotCache === 'function') {
                try {
                    await this.core.refreshSnapshotCache();
                } catch { // Snapshot cache refresh failed - diff falls back to "no snapshots" (non-critical)
                }
            }
            if (this.sideNav && this.sideNav.refresh) await this.sideNav.refresh();

            const activeId = this.caseStore.getActiveCaseId ? this.caseStore.getActiveCaseId() : null;
            if (!activeId) {
                await this.workspaceModal.open({ required: true });
            } else {
                if (this.sideNav && this.sideNav.refresh) await this.sideNav.refresh();
            }
        } catch (e) {
            console.error(e);
            UIUtils.addBotHTML(`<span style="color:var(--accent-red)">Failed to open case storage: ${UIUtils.escapeHtml(e.message || 'Unknown error')}</span>`);
        }
    }

    async checkApiStatus() {
        if (typeof fetch !== 'function') return;

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => {
            silentCleanup(() => { if (controller) controller.abort(); }, 'API health check abort');
        }, 900);

        try {
            const res = await fetch('/api/health', {
                method: 'GET',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });

            const ok = !!(res && res.ok);
            this.apiConnected = ok;
            if (this.sideNav && this.sideNav.setApiStatus) {
                this.sideNav.setApiStatus(ok ? 'API: Connected' : 'API: Offline', ok);
            }
        } catch { // API health check failed - mark as offline (expected in offline-first mode)
            this.apiConnected = false;
            if (this.sideNav && this.sideNav.setApiStatus) {
                this.sideNav.setApiStatus('API: Offline', false);
            }
        } finally {
            silentCleanup(() => clearTimeout(timer), 'API health check timer');
        }
    }

    // Public methods for component interaction
    setCommand(text) {
        UIUtils.setCmd(text);
    }

    /** Show a toast notification at the top of the main panel */
    showToast(message, type = 'info') {
        const colors = {
            info: 'var(--accent-blue)',
            success: 'var(--accent-green)',
            warning: 'var(--accent-orange)',
            error: 'var(--accent-red)'
        };
        const color = colors[type] || colors.info;

        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 9999;
            background: var(--bg-panel); border: 1px solid ${color};
            border-radius: 10px; padding: 14px 20px; max-width: 400px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); color: white;
            font-size: 0.9rem; display: flex; align-items: center; gap: 10px;
            animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        toast.innerHTML = `<span style="color:${color};font-size:1.2rem;">${type === 'success' ? '&#10003;' : type === 'error' ? '&#10007;' : '&#8505;'}</span> ${message}`;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 0.4s, transform 0.4s';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    /** Close every registered modal overlay */
    closeAllModals(except = null) {
        if (!this._modals) return;
        for (const m of this._modals) {
            if (m === except) continue;
            if (typeof m.close === 'function') m.close();
        }
        // Also close theater mode
        if (this.theaterMode && typeof this.theaterMode.close === 'function') {
            this.theaterMode.close();
        }
    }

    /** Open a modal with mutual exclusion — closes all others first */
    openModal(modal, ...args) {
        this.closeAllModals(modal);
        if (modal && typeof modal.open === 'function') {
            modal.open(...args);
        }
    }

    async runSelfTests() {
        return await SelfTestSuite.run();
    }
}

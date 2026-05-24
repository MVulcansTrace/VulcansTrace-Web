/**
 * CommandPalette.js — VS Code / Linear style command palette
 * Opens with Ctrl+K (Cmd+K on Mac). Pure vanilla JS ESM.
 */
export class CommandPalette {
  constructor() {
    this.commands = [
      // ── SIDEBAR ──────────────────────────────────────────
      { label: 'Open Workspaces',       description: 'Switch or create investigation cases',       icon: '#i-layers',  category: 'Sidebar',  action: () => { window.logAnalystApp?.openModal(window.logAnalystApp.workspaceModal); } },
      { label: 'Open Datasets',         description: 'Load log files for analysis',                 icon: '#i-file',    category: 'Sidebar',  action: () => { window.logAnalystApp?.openModal(window.logAnalystApp.datasetsModal); } },
      { label: 'Open Findings',         description: 'Severity & risk overview',                    icon: '#i-alert',   category: 'Sidebar',  action: () => { const a = window.logAnalystApp; if(a){ a.openModal(a.findingsDashboard); a.findingsDashboard?.refresh(); } } },
      { label: 'Open Dashboard',        description: 'MITRE map & host cards',                      icon: '#i-shield',  category: 'Sidebar',  action: () => { const a = window.logAnalystApp; if(a){ a.openModal(a.findingsDashboard); a.findingsDashboard?.refresh(); } } },
      { label: 'Open SQL Console',      description: 'Run SQL queries with DuckDB',                 icon: '#i-code',    category: 'Sidebar',  action: () => { window.logAnalystApp?.openModal(window.logAnalystApp.queryConsoleModal); } },
      { label: 'Open Config',           description: 'Topology, threat intel, allowlist',            icon: '#i-settings', category: 'Sidebar', action: () => { window.logAnalystApp?.openModal(window.logAnalystApp.configModal); } },
      { label: 'Open Presentation',     description: '5-slide executive presentation',              icon: '#i-layers',  category: 'Sidebar',  action: () => { const a = window.logAnalystApp; if(a?.theaterMode){ a.closeAllModals(); a.theaterMode.open(); } } },
      { label: 'Export Evidence ZIP',   description: 'Forensic evidence bundle with HMAC',          icon: '#i-zip',     category: 'Sidebar',  action: () => { window.logAnalystApp?.openModal(window.logAnalystApp.evidenceModal); } },
      { label: 'Open Help',             description: 'Documentation & keyboard shortcuts',           icon: '#i-help',    category: 'Sidebar',  action: () => { window.logAnalystApp?.openModal(window.logAnalystApp.helpModal); } },

      // ── ACTIONS ──────────────────────────────────────────
      { label: 'Run Health Check',      description: 'Verify all 82 internal self-tests pass',      icon: '#i-check',   category: 'Actions',  action: () => { window.logAnalystApp?.runSelfTests(); } },
      { label: 'Run Guided Demo',       description: 'Full walkthrough with sample data',            icon: '#i-layers',  category: 'Actions',  action: () => { window.logAnalystApp?.core?.processCommand('demo guided', 'Load the 17-flow sample dataset'); } },
      { label: 'Run Full Journey',      description: '9-step end-to-end incident story',            icon: '#i-layers',  category: 'Actions',  action: () => { if(window.FullJourneyDemo && window.logAnalystApp) FullJourneyDemo.start(window.logAnalystApp.core); } },
      { label: 'Run Defense Story',     description: 'Kill Chain narrative with evidence',           icon: '#i-shield',  category: 'Actions',  action: () => { if(window.DefenseStoryDemo && window.logAnalystApp) DefenseStoryDemo.start(window.logAnalystApp.core); } },
      { label: 'Generate Hypothesis',   description: 'AI threat narrative from current data',        icon: '#i-alert',   category: 'Actions',  action: () => { window.logAnalystApp?.core?.processCommand("what's happening"); } },
      { label: 'Top Threats',           description: 'Ranked threat summary',                       icon: '#i-alert',   category: 'Actions',  action: () => { window.logAnalystApp?.core?.processCommand('top threats'); } },
      { label: 'Reset Case',            description: 'Clear all data and start fresh',              icon: '#i-trash',   category: 'Actions',  action: () => { if(confirm('Reset this case? All data will be cleared.')) window.logAnalystApp?.core?.resetCase(); } },

      // ── ANALYSIS ─────────────────────────────────────────
      { label: 'Set Profile: Low',      description: 'Fastest analysis, fewer heuristics',          icon: '#i-settings', category: 'Analysis', action: () => { window.logAnalystApp?.core?.setProfile('Low'); } },
      { label: 'Set Profile: Medium',   description: 'Balanced analysis (default)',                 icon: '#i-settings', category: 'Analysis', action: () => { window.logAnalystApp?.core?.setProfile('Medium'); } },
      { label: 'Set Profile: High',     description: 'Deepest analysis, all detectors',             icon: '#i-settings', category: 'Analysis', action: () => { window.logAnalystApp?.core?.setProfile('High'); } },
    ];

    this.selectedIndex = 0;
    this.filtered = [...this.commands];
    this._bound = {};
  }

  /* ── CSS (injected once) ─────────────────────────────── */
  _injectCSS() {
    if (document.getElementById('cmdPaletteCSS')) return;
    const s = document.createElement('style');
    s.id = 'cmdPaletteCSS';
    s.textContent = `
      .cmd-palette-overlay {
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,0.5);
        display: flex; justify-content: center;
        padding-top: 18vh;
        font-family: var(--font-mono, 'Inter', system-ui, sans-serif);
        animation: cmdFadeIn .12s ease;
      }
      @keyframes cmdFadeIn { from { opacity:0; } to { opacity:1; } }

      .cmd-palette {
        width: 520px; max-height: 400px;
        background: var(--bg-panel, #1a1b26);
        border: 1px solid var(--border, #2a2b3d);
        border-radius: 10px;
        box-shadow: 0 24px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.04);
        display: flex; flex-direction: column;
        overflow: hidden;
        color: var(--text-main, #c0caf5);
      }
      .cmd-palette-header {
        display: flex; align-items: center; gap: 8px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--border, #2a2b3d);
      }
      .cmd-palette-header input {
        flex: 1; background: none; border: none; outline: none;
        color: var(--text-main, #c0caf5);
        font-size: 14px; font-family: inherit;
      }
      .cmd-palette-header input::placeholder {
        color: var(--text-muted, #565f89);
      }
      .cmd-palette-header kbd {
        font-size: 11px; padding: 2px 7px; border-radius: 4px;
        background: rgba(255,255,255,.06);
        color: var(--text-muted, #565f89);
        border: 1px solid var(--border, #2a2b3d);
      }
      .cmd-palette-header .icon { width:18px; height:18px; flex-shrink:0; }

      .cmd-palette-list {
        flex: 1; overflow-y: auto; padding: 6px 0;
        max-height: 280px;
      }
      .cmd-palette-list::-webkit-scrollbar { width: 5px; }
      .cmd-palette-list::-webkit-scrollbar-thumb { background: var(--border, #2a2b3d); border-radius: 4px; }

      .cmd-category {
        padding: 6px 14px 4px;
        font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px;
        color: var(--text-muted, #565f89);
        pointer-events: none;
      }

      .cmd-item {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 14px; cursor: pointer;
        transition: background .08s;
      }
      .cmd-item:hover {
        background: rgba(59, 130, 246, 0.12);
      }
      .cmd-item.active {
        background: rgba(59, 130, 246, 0.22);
      }
      .cmd-item .icon { width:18px; height:18px; flex-shrink:0; opacity:.7; }
      .cmd-item-text { display:flex; flex-direction:column; min-width:0; }
      .cmd-item-label { font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .cmd-item-desc { font-size:11px; color: var(--text-muted, #565f89); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

      .cmd-palette-footer {
        display: flex; gap: 16px; justify-content: center;
        padding: 8px; font-size: 11px;
        color: var(--text-muted, #565f89);
        border-top: 1px solid var(--border, #2a2b3d);
      }
    `;
    document.head.appendChild(s);
  }

  /* ── Render ──────────────────────────────────────────── */
  render() {
    this._injectCSS();
    return `
      <div class="cmd-palette-overlay" id="cmdPalette" style="display:none;">
        <div class="cmd-palette">
          <div class="cmd-palette-header">
            <svg class="icon" style="opacity:0.5"><use href="#i-help"></use></svg>
            <input type="text" id="cmdInput" placeholder="Type a command or search..." autocomplete="off" spellcheck="false" />
            <kbd>Esc</kbd>
          </div>
          <div class="cmd-palette-list" id="cmdList"></div>
          <div class="cmd-palette-footer">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </div>
        </div>
      </div>`;
  }

  /* ── Open / Close ────────────────────────────────────── */
  open() {
    const overlay = document.getElementById('cmdPalette');
    if (!overlay) return;
    overlay.style.display = 'flex';
    const input = document.getElementById('cmdInput');
    if (input) { input.value = ''; input.focus(); }
    this.filter('');
    this.selectedIndex = 0;
    this._highlightSelected();
    this._bindEvents();
  }

  close() {
    const overlay = document.getElementById('cmdPalette');
    if (overlay) overlay.style.display = 'none';
    this._unbindEvents();
  }

  /* ── Filtering ───────────────────────────────────────── */
  filter(query) {
    const q = query.toLowerCase().trim();
    this.filtered = q
      ? this.commands.filter(c =>
          c.label.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q))
      : [...this.commands];

    this.selectedIndex = Math.min(this.selectedIndex, this.filtered.length - 1);
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    this._renderList();
  }

  /* ── Execute ─────────────────────────────────────────── */
  execute(command) {
    if (!command) return;
    try { command.action(); } catch (e) { console.error('[CommandPalette]', e); }
    this.close();
  }

  /* ── Internal: render list with categories ───────────── */
  _renderList() {
    const container = document.getElementById('cmdList');
    if (!container) return;

    let html = '';
    let lastCat = '';
    let visualIndex = 0;

    for (const cmd of this.filtered) {
      if (cmd.category !== lastCat) {
        html += `<div class="cmd-category">${cmd.category}</div>`;
        lastCat = cmd.category;
      }
      const active = visualIndex === this.selectedIndex ? ' active' : '';
      html += `
        <div class="cmd-item${active}" data-index="${visualIndex}">
          <svg class="icon"><use href="${cmd.icon}"></use></svg>
          <div class="cmd-item-text">
            <span class="cmd-item-label">${cmd.label}</span>
            <span class="cmd-item-desc">${cmd.description}</span>
          </div>
        </div>`;
      visualIndex++;
    }

    if (this.filtered.length === 0) {
      html = '<div style="padding:24px;text-align:center;color:var(--text-muted,#565f89);font-size:13px;">No matching commands</div>';
    }

    container.innerHTML = html;
  }

  /* ── Highlight ───────────────────────────────────────── */
  _highlightSelected() {
    const items = document.querySelectorAll('#cmdList .cmd-item');
    items.forEach((el, i) => el.classList.toggle('active', i === this.selectedIndex));
    const active = items[this.selectedIndex];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  /* ── Event binding ───────────────────────────────────── */
  _bindEvents() {
    this._unbindEvents();

    this._bound.input = (e) => {
      this.filter(e.target.value);
    };
    this._bound.keydown = (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (this.selectedIndex < this.filtered.length - 1) { this.selectedIndex++; this._highlightSelected(); }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (this.selectedIndex > 0) { this.selectedIndex--; this._highlightSelected(); }
          break;
        case 'Enter':
          e.preventDefault();
          if (this.filtered[this.selectedIndex]) this.execute(this.filtered[this.selectedIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          this.close();
          break;
      }
    };
    this._bound.click = (e) => {
      if (e.target.id === 'cmdPalette') { this.close(); return; }
      const item = e.target.closest('.cmd-item');
      if (item) {
        const idx = parseInt(item.dataset.index, 10);
        if (!isNaN(idx) && this.filtered[idx]) this.execute(this.filtered[idx]);
      }
    };

    const input = document.getElementById('cmdInput');
    if (input) input.addEventListener('input', this._bound.input);

    const overlay = document.getElementById('cmdPalette');
    if (overlay) overlay.addEventListener('keydown', this._bound.keydown);
    if (overlay) overlay.addEventListener('click', this._bound.click);
  }

  _unbindEvents() {
    const input = document.getElementById('cmdInput');
    const overlay = document.getElementById('cmdPalette');
    if (input && this._bound.input)   input.removeEventListener('input', this._bound.input);
    if (overlay && this._bound.keydown) overlay.removeEventListener('keydown', this._bound.keydown);
    if (overlay && this._bound.click)   overlay.removeEventListener('click', this._bound.click);
  }

  /* ── Global Ctrl+K hook ─────────────────────────────── */
  bindGlobalShortcut() {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const overlay = document.getElementById('cmdPalette');
        if (overlay && overlay.style.display !== 'none') {
          this.close();
        } else {
          this.open();
        }
      }
    };
    document.addEventListener('keydown', handler);
  }
}

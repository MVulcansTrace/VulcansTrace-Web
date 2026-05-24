/**
 * KeyboardShortcuts.js — floating overlay showing all keyboard shortcuts
 * Opens with ? key. Pure vanilla JS ESM.
 */
export class KeyboardShortcuts {
    constructor() {
        this._bound = null;
    }

    _css() {
        if (document.getElementById('kbShortcutsCSS')) return;
        const s = document.createElement('style');
        s.id = 'kbShortcutsCSS';
        s.textContent = `
            .kb-overlay {
                position: fixed; inset: 0; z-index: 10000;
                background: rgba(0,0,0,0.5);
                display: flex; align-items: center; justify-content: center;
                animation: cmdFadeIn .12s ease;
            }
            .kb-panel {
                width: 480px; max-height: 70vh;
                background: var(--bg-panel, #1a1b26);
                border: 1px solid var(--border, #2a2b3d);
                border-radius: 10px;
                box-shadow: 0 24px 80px rgba(0,0,0,.55);
                overflow: hidden;
                color: var(--text-main, #c0caf5);
            }
            .kb-head {
                display: flex; justify-content: space-between; align-items: center;
                padding: 14px 18px;
                border-bottom: 1px solid var(--border, #2a2b3d);
                font-weight: 600; font-size: 0.95rem;
            }
            .kb-body {
                padding: 14px 18px;
                overflow-y: auto; max-height: calc(70vh - 52px);
            }
            .kb-body::-webkit-scrollbar { width: 5px; }
            .kb-body::-webkit-scrollbar-thumb { background: var(--border, #2a2b3d); border-radius: 4px; }
            .kb-section {
                font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
                letter-spacing: 0.8px; color: var(--text-muted);
                margin-top: 14px; margin-bottom: 6px;
                padding-bottom: 4px;
                border-bottom: 1px solid rgba(255,255,255,0.04);
            }
            .kb-section:first-child { margin-top: 0; }
            .kb-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 5px 0; font-size: 0.82rem;
            }
            .kb-row span:last-child {
                color: var(--text-muted); font-size: 0.78rem;
            }
            kbd {
                font-size: 0.7rem; padding: 2px 7px; border-radius: 4px;
                background: rgba(255,255,255,.06);
                color: var(--text-muted, #565f89);
                border: 1px solid var(--border, #2a2b3d);
                font-family: inherit;
            }
        `;
        document.head.appendChild(s);
    }

    render() {
        this._css();
        return `
            <div class="kb-overlay" id="kbShortcuts" style="display:none;">
                <div class="kb-panel">
                    <div class="kb-head">
                        <span>Keyboard Shortcuts</span>
                        <kbd>Esc</kbd>
                    </div>
                    <div class="kb-body">
                        <div class="kb-section">Navigation</div>
                        <div class="kb-row"><span><kbd>Ctrl</kbd> + <kbd>K</kbd></span> <span>Command palette</span></div>
                        <div class="kb-row"><span><kbd>?</kbd></span> <span>This shortcuts panel</span></div>
                        <div class="kb-row"><span><kbd>Esc</kbd></span> <span>Close any modal / panel</span></div>

                        <div class="kb-section">Analysis</div>
                        <div class="kb-row"><span><kbd>Enter</kbd></span> <span>Send message / paste logs</span></div>
                        <div class="kb-row"><span><kbd>Shift</kbd> + <kbd>Enter</kbd></span> <span>New line (no send)</span></div>

                        <div class="kb-section">Presentation</div>
                        <div class="kb-row"><span><kbd>&larr;</kbd> <kbd>&rarr;</kbd></span> <span>Navigate slides</span></div>
                        <div class="kb-row"><span><kbd>F</kbd></span> <span>Toggle fullscreen</span></div>

                        <div class="kb-section">Chat Commands</div>
                        <div class="kb-row"><span><code>help</code></span> <span>Show all commands</span></div>
                        <div class="kb-row"><span><code>top threats</code></span> <span>Ranked threat summary</span></div>
                        <div class="kb-row"><span><code>explain &lt;IP&gt;</code></span> <span>Deep-dive on an IP</span></div>
                        <div class="kb-row"><span><code>what's happening</code></span> <span>AI threat hypothesis</span></div>
                        <div class="kb-row"><span><code>demo guided</code></span> <span>Run guided walkthrough</span></div>
                    </div>
                </div>
            </div>
        `;
    }

    open() {
        const el = document.getElementById('kbShortcuts');
        if (el) el.style.display = 'flex';
        this._bind();
    }

    close() {
        const el = document.getElementById('kbShortcuts');
        if (el) el.style.display = 'none';
        this._unbind();
    }

    toggle() {
        const el = document.getElementById('kbShortcuts');
        if (el && el.style.display !== 'none') {
            this.close();
        } else {
            this.open();
        }
    }

    _bind() {
        this._unbind();
        this._bound = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); this.close(); }
        };
        document.addEventListener('keydown', this._bound);

        // Close on click outside panel
        const overlay = document.getElementById('kbShortcuts');
        if (overlay) {
            overlay.onclick = (e) => {
                if (e.target.id === 'kbShortcuts') this.close();
            };
        }
    }

    _unbind() {
        if (this._bound) {
            document.removeEventListener('keydown', this._bound);
            this._bound = null;
        }
    }

    bindGlobalShortcut() {
        document.addEventListener('keydown', (e) => {
            // Only trigger ? if not in an input/textarea and no modifier keys
            if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const tag = document.activeElement?.tagName?.toLowerCase();
                if (tag === 'input' || tag === 'textarea') return;
                e.preventDefault();
                this.toggle();
            }
        });
    }
}

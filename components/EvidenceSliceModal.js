/* Evidence slice modal: shows exact log lines around a proof reference */
import { UIUtils } from './UIUtils.js';

export class EvidenceSliceModal {
    constructor() {
        this.currentCopyId = 'evidence-slice-copy';
    }

    render() {
        return `
            <div id="evidenceSliceModal" class="overlay">
                <div class="modal-box" style="width:820px;max-width:96%;">
                    <div class="modal-head">
                        <span>Evidence Slice</span>
                        <span style="cursor:pointer" onclick="window.logAnalystApp.evidenceSliceModal.close()">
                            <svg class="icon"><use href="#i-close"></use></svg>
                        </span>
                    </div>
                    <div class="modal-body">
                        <div id="evidenceSliceMeta" class="text-xs" style="color:var(--text-muted);margin-bottom:10px;"></div>
                        <div id="evidenceSliceStatus" class="text-xs" style="color:var(--text-muted);margin-bottom:10px;"></div>
                        <div id="evidenceSliceLines" class="evidence-slice"></div>
                        <textarea id="${this.currentCopyId}" class="offscreen" readonly></textarea>
                    </div>
                    <div class="modal-foot">
                        <button class="btn btn-ghost" onclick="window.logAnalystApp.evidenceSliceModal.copy()">Copy</button>
                        <button class="btn btn-primary" onclick="window.logAnalystApp.evidenceSliceModal.close()">Close</button>
                    </div>
                </div>
            </div>
        `;
    }

    open() {
        const el = document.getElementById('evidenceSliceModal');
        if (el) el.classList.add('active');
    }

    close() {
        const el = document.getElementById('evidenceSliceModal');
        if (el) el.classList.remove('active');
    }

    copy() {
        if (typeof UIUtils !== 'undefined' && UIUtils && typeof UIUtils.copyFocusSummary === 'function') {
            UIUtils.copyFocusSummary(this.currentCopyId);
        }
    }

    setLoading(metaText) {
        const metaEl = document.getElementById('evidenceSliceMeta');
        const statusEl = document.getElementById('evidenceSliceStatus');
        const linesEl = document.getElementById('evidenceSliceLines');
        const copyEl = document.getElementById(this.currentCopyId);

        if (metaEl) metaEl.textContent = String(metaText || '');
        if (statusEl) statusEl.textContent = 'Loading proof lines...';
        if (linesEl) linesEl.innerHTML = '<div class="empty-hint">Loading…</div>';
        if (copyEl) copyEl.value = '';
    }

    setError(metaText, err) {
        const metaEl = document.getElementById('evidenceSliceMeta');
        const statusEl = document.getElementById('evidenceSliceStatus');
        const linesEl = document.getElementById('evidenceSliceLines');
        const copyEl = document.getElementById(this.currentCopyId);

        if (metaEl) metaEl.textContent = String(metaText || '');
        if (statusEl) statusEl.textContent = 'Failed to load proof lines.';
        if (linesEl) {
            const msg = err && err.message ? err.message : String(err || 'Unknown error');
            linesEl.innerHTML = `<div style="color:var(--accent-red)">${UIUtils.escapeHtml(msg)}</div>`;
        }
        if (copyEl) copyEl.value = '';
    }

    showSlice(slice) {
        const metaEl = document.getElementById('evidenceSliceMeta');
        const statusEl = document.getElementById('evidenceSliceStatus');
        const linesEl = document.getElementById('evidenceSliceLines');
        const copyEl = document.getElementById(this.currentCopyId);

        const ok = slice && slice.ok !== false;
        const fileName = slice && typeof slice.fileName === 'string' ? slice.fileName : 'Unknown';
        const startLine = slice && Number.isFinite(slice.startLine) ? slice.startLine : 0;
        const endLine = slice && Number.isFinite(slice.endLine) ? slice.endLine : 0;
        const centerLine = slice && Number.isFinite(slice.centerLine) ? slice.centerLine : 0;

        const meta = `${fileName}${startLine && endLine ? ` · Lines ${startLine}-${endLine} (center ${centerLine})` : ''}`;
        if (metaEl) metaEl.textContent = meta;

        if (!ok) {
            if (statusEl) statusEl.textContent = 'No proof available for this reference.';
            if (linesEl) linesEl.innerHTML = '<div class="empty-hint">No lines found.</div>';
            if (copyEl) copyEl.value = '';
            return;
        }

        if (statusEl) statusEl.textContent = '';

        const lines = Array.isArray(slice.lines) ? slice.lines : [];
        const html = lines.length
            ? lines.map((row) => {
                const num = String(row.lineNumber || 0).padStart(6, ' ');
                const lineText = UIUtils.escapeHtml(row.text || '');
                const cls = row.isCenter ? 'evidence-line evidence-line-center' : 'evidence-line';
                return `<div class="${cls}"><span class="evidence-line-no">${num}</span><span class="evidence-line-text">${lineText}</span></div>`;
            }).join('')
            : '<div class="empty-hint">No lines found.</div>';

        if (linesEl) linesEl.innerHTML = html;
        if (copyEl) copyEl.value = typeof slice.copyText === 'string' ? slice.copyText : '';

        this.open();
        requestAnimationFrame(() => {
            try {
                const center = document.querySelector('#evidenceSliceLines .evidence-line-center');
                if (center && typeof center.scrollIntoView === 'function') {
                    center.scrollIntoView({ block: 'center' });
                }
            } catch { /* scrollIntoView may fail in some browsers - non-critical UI polish */ }
        });
    }
}

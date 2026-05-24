/* Evidence modal component */
import { UIUtils } from './UIUtils.js';

export class EvidenceModal {
    constructor(core) {
        this.core = core;
    }

    render() {
        return `
            <div id="evidenceModal" class="overlay">
                <div class="modal-box">
                    <div class="modal-head">
                        <span>Generate Evidence Bundle</span>
                        <span style="cursor:pointer" onclick="window.logAnalystApp.evidenceModal.close()">
                            <svg class="icon"><use href="#i-close"></use></svg>
                        </span>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">Signing Secret (Optional, for HMAC)</label>
                            <input type="password" id="evKey" class="form-input" placeholder="Enter key to sign manifest...">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Analyst Name / Case Ref</label>
                            <input type="text" id="evAnalyst" class="form-input" placeholder="e.g. Case-2025-001">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Case Notes</label>
                            <textarea id="evNotes" class="form-input" style="height:80px" placeholder="Additional context..."></textarea>
                        </div>
                    </div>
                    <div class="modal-foot">
                        <button class="btn btn-primary" onclick="window.logAnalystApp.evidenceModal.submit()">Generate ZIP</button>
                    </div>
                </div>
            </div>
        `;
    }

    open() {
        const db = this.core.getDB();
        if (!db.inputs.length) {
            UIUtils.addBotHTML('<div style="padding:8px 12px;border-left:3px solid var(--accent-amber,#f59e0b);background:rgba(245,158,11,0.08);border-radius:4px;margin:4px 0">No data to export. Paste some logs or run a demo first, then try again.</div>');
            return;
        }
        document.getElementById('evidenceModal').classList.add('active');
    }

    close() {
        document.getElementById('evidenceModal').classList.remove('active');
    }

    async submit() {
        const key = document.getElementById('evKey').value;
        const analyst = document.getElementById('evAnalyst').value;
        const notes = document.getElementById('evNotes').value;

        this.close();
        await this.core.generateEvidence(key, analyst, notes);
    }
}
/* Configuration modal component */
import { UIUtils } from './UIUtils.js';
import { NetworkUtils } from './NetworkUtils.js';

export class ConfigModal {
    constructor(core) {
        this.core = core;
        this.activeTab = 'topology';
    }

    render() {
        return `
            <div id="configModal" class="overlay">
                <div class="modal-box" style="width: 600px;">
                    <div class="modal-head">
                        <span>Settings & Threat Intel</span>
                        <span style="cursor:pointer" onclick="window.logAnalystApp.configModal.close()">
                            <svg class="icon"><use href="#i-close"></use></svg>
                        </span>
                    </div>
                    <div class="modal-body">
                        <div class="cfg-tabs">
                            <button id="cfgTabTopology" class="cfg-tab active" onclick="window.logAnalystApp.configModal.switchTab('topology')">Topology</button>
                            <button id="cfgTabIntel" class="cfg-tab" onclick="window.logAnalystApp.configModal.switchTab('intel')">Threat Intel</button>
                            <button id="cfgTabAllowlist" class="cfg-tab" onclick="window.logAnalystApp.configModal.switchTab('allowlist')">Allowlist</button>
                        </div>

                        <div id="cfgPanelTopology" class="cfg-panel active">
                            <h4 style="color:var(--accent-blue); margin-top:0;">Network Topology</h4>
                            <div id="configList" style="margin-bottom:20px;"></div>
                            <button class="btn" onclick="window.logAnalystApp.configModal.addRow()">
                                <svg class="icon"><use href="#i-plus"></use></svg> Add Segment
                            </button>
                        </div>

                        <div id="cfgPanelIntel" class="cfg-panel">
                            <h4 style="color:var(--accent-red); margin-top:0;">Threat Intelligence (IOCs)</h4>
                            <p class="text-xs" style="color:var(--text-muted)">Paste known bad IPs here (one per line). Matches will be flagged CRITICAL.</p>
                            <textarea id="iocInput" class="form-input" style="height:100px; font-size:0.8rem;" placeholder="192.168.1.100&#10;10.5.5.5"></textarea>
                        </div>

                        <div id="cfgPanelAllowlist" class="cfg-panel">
                            <h4 style="color:var(--accent-cyan); margin-top:0;">Allowlist (Noise Binder)</h4>
                            <p class="text-xs" style="color:var(--text-muted)">Mark known-good source IPs here to suppress scoring and keep TOP focused.</p>
                            <div id="allowlistList" style="margin-bottom:20px;"></div>
                            <button class="btn" onclick="window.logAnalystApp.configModal.addAllowRow()">
                                <svg class="icon"><use href="#i-plus"></use></svg> Add Safe Host
                            </button>
                            <div class="text-xs" style="color:var(--text-muted); margin-top:8px;">Ignored events are tracked in the summary stats after analysis.</div>
                        </div>
                    </div>
                    <div class="modal-foot">
                        <button class="btn btn-primary" onclick="window.logAnalystApp.configModal.save()">Save Configuration</button>
                    </div>
                </div>
            </div>
        `;
    }

    open() {
        const list = document.getElementById('configList');
        list.innerHTML = '';

        this.core.getTopology().forEach(t => {
            list.appendChild(this.createRow(t.name, t.cidr));
        });

        // Fill IOC box
        const iocs = this.core.getIOCs() || [];
        document.getElementById('iocInput').value = iocs.join('\n');

        const allowList = document.getElementById('allowlistList');
        if (allowList) {
            allowList.innerHTML = '';
            (this.core.getAllowlist ? this.core.getAllowlist() : []).forEach(entry => {
                if (!entry) return;
                const ip = entry.target || entry.ip || '';
                const reason = entry.reason || '';
                allowList.appendChild(this.createAllowRow(ip, reason));
            });
        }

        document.getElementById('configModal').classList.add('active');
        this.switchTab(this.activeTab || 'topology');
    }

    close() {
        document.getElementById('configModal').classList.remove('active');
    }

    createRow(nameVal, cidrVal) {
        const div = document.createElement('div');
        div.className = 'cfg-row';
        div.innerHTML = `
            <input type="text" class="cfg-input" placeholder="Name (e.g. DMZ)" value="${UIUtils.escapeHtml(nameVal)}">
            <input type="text" class="cfg-input" placeholder="CIDR (e.g. 10.0.0.0/8)" value="${UIUtils.escapeHtml(cidrVal)}">
            <div class="del-btn" onclick="this.parentElement.remove()">
                <svg class="icon"><use href="#i-trash"></use></svg>
            </div>
        `;
        return div;
    }

    createAllowRow(ipVal, reasonVal) {
        const div = document.createElement('div');
        div.className = 'allow-row cfg-row';
        div.innerHTML = `
            <input type="text" class="cfg-input" placeholder="IP (e.g. 10.0.0.5)" value="${UIUtils.escapeHtml(ipVal)}">
            <input type="text" class="cfg-input" placeholder="Reason (optional)" value="${UIUtils.escapeHtml(reasonVal)}">
            <div class="del-btn" onclick="this.parentElement.remove()">
                <svg class="icon"><use href="#i-trash"></use></svg>
            </div>
        `;
        return div;
    }

    addRow() {
        const list = document.getElementById('configList');
        list.appendChild(this.createRow('', ''));
    }

    addAllowRow() {
        const list = document.getElementById('allowlistList');
        if (!list) return;
        list.appendChild(this.createAllowRow('', ''));
    }

    switchTab(tabName) {
        const allowed = ['topology', 'intel', 'allowlist'];
        const tab = allowed.includes(tabName) ? tabName : 'topology';
        this.activeTab = tab;

        const tabEl = (id) => document.getElementById(id);
        const setActive = (el, active) => {
            if (!el) return;
            if (active) el.classList.add('active');
            else el.classList.remove('active');
        };

        setActive(tabEl('cfgTabTopology'), tab === 'topology');
        setActive(tabEl('cfgTabIntel'), tab === 'intel');
        setActive(tabEl('cfgTabAllowlist'), tab === 'allowlist');

        setActive(tabEl('cfgPanelTopology'), tab === 'topology');
        setActive(tabEl('cfgPanelIntel'), tab === 'intel');
        setActive(tabEl('cfgPanelAllowlist'), tab === 'allowlist');
    }

    save() {
        const rows = document.querySelectorAll('#configList .cfg-row');
        const newTopo = [];
        let error = null;

        rows.forEach((r, idx) => {
            const inputs = r.querySelectorAll('input');
            const name = inputs[0].value.trim();
            const cidr = inputs[1].value.trim();

            if (!name || !cidr) return;
            if (!NetworkUtils.cidrToRange(cidr)) {
                error = `Invalid CIDR at row ${idx + 1}: ${cidr}`;
            }

            newTopo.push({ name, cidr });
        });

        if (error) {
            alert(error);
            return;
        }

        // Save IOCs
        const iocText = document.getElementById('iocInput').value;
        const iocList = iocText.split('\n').map(s => s.trim()).filter(s => s);
        if (this.core && typeof this.core.setIOCs === 'function') {
            this.core.setIOCs(iocList, false);
        }

        // Save allowlist
        const allowRows = document.querySelectorAll('#allowlistList .allow-row');
        const allowlist = [];
        let allowError = null;
        allowRows.forEach((r, idx) => {
            const inputs = r.querySelectorAll('input');
            const ip = inputs[0].value.trim();
            const reason = (inputs[1] ? inputs[1].value.trim() : '');
            if (!ip) return;

            if (typeof NetworkUtils !== 'undefined' && NetworkUtils && typeof NetworkUtils.ipToLong === 'function') {
                if (NetworkUtils.ipToLong(ip) === null) {
                    allowError = `Invalid allowlist IP at row ${idx + 1}: ${ip}`;
                    return;
                }
            }

            allowlist.push({ target: ip, reason });
        });

        if (allowError) {
            alert(allowError);
            return;
        }

        if (this.core && typeof this.core.setAllowlist === 'function') {
            this.core.setAllowlist(allowlist, true, false);
        }

        this.core.setTopology(newTopo);
        this.close();

        if (this.core && this.core.DB && Array.isArray(this.core.DB.inputs) && this.core.DB.inputs.length && typeof this.core.aggregateAnalysis === 'function') {
            UIUtils.addBotHTML("Configuration saved. Refreshing analysis...");
            this.core.aggregateAnalysis();
        } else {
            UIUtils.addBotHTML("Configuration saved.");
        }
    }
}

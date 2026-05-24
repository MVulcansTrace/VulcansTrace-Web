/* Remediation modal component (copy/paste only; no execution) */
import { UIUtils } from './UIUtils.js';
import { NetworkUtils } from './NetworkUtils.js';
import { RemediationService } from './RemediationService.js';

export class RemediationModal {
    constructor(core) {
        this.core = core;
        this.lastTarget = '';
    }

    render() {
        return `
            <div id="remediationModal" class="overlay">
                <div class="modal-box" style="width: 780px; max-width: 95%;">
                    <div class="modal-head">
                        <span>Remediation Plans</span>
                        <span style="cursor:pointer" onclick="window.logAnalystApp.remediationModal.close()">
                            <svg class="icon"><use href="#i-close"></use></svg>
                        </span>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">Target IP</label>
                            <div style="display:flex; gap:10px; align-items:center;">
                                <input type="text" id="remTargetIp" class="form-input" placeholder="e.g. 10.0.0.5" style="flex:1;">
                                <button class="btn btn-primary" onclick="window.logAnalystApp.remediationModal.generate()">Generate</button>
                            </div>
                            <div class="text-xs" style="color:var(--text-muted); margin-top:6px;">
                                Plans are copy/paste only and are gated to <code>THREAT_INTEL</code> confirmed targets.
                            </div>
                        </div>
                        <div id="remediationPlanContainer"></div>
                    </div>
                    <div class="modal-foot">
                        <button class="btn btn-ghost" onclick="window.logAnalystApp.remediationModal.close()">Close</button>
                    </div>
                </div>
            </div>
        `;
    }

    open(targetIp) {
        const ip = (typeof targetIp === 'string') ? targetIp.trim() : '';
        this.lastTarget = ip;

        const el = document.getElementById('remediationModal');
        if (!el) return;
        el.classList.add('active');

        const input = document.getElementById('remTargetIp');
        if (input) input.value = ip;

        this.renderPlans(ip);
    }

    close() {
        const el = document.getElementById('remediationModal');
        if (!el) return;
        el.classList.remove('active');
    }

    generate() {
        const input = document.getElementById('remTargetIp');
        const ip = input && typeof input.value === 'string' ? input.value.trim() : '';
        this.lastTarget = ip;
        this.renderPlans(ip);
    }

    renderPlans(targetIp) {
        const container = document.getElementById('remediationPlanContainer');
        if (!container) return;

        const stats = this.core && typeof this.core.getStats === 'function' ? this.core.getStats() : (this.core ? this.core.STATS : null);
        const profile = this.core && typeof this.core.getProfile === 'function' ? this.core.getProfile() : (this.core ? this.core.profile : null);

        const ip = (typeof targetIp === 'string') ? targetIp.trim() : '';
        if (!ip) {
            container.innerHTML = this.renderNoTargetHtml(stats);
            return;
        }

        if (typeof NetworkUtils !== 'undefined' && NetworkUtils && typeof NetworkUtils.ipToLong === 'function') {
            if (NetworkUtils.ipToLong(ip) === null) {
                container.innerHTML = `<div style="color:var(--accent-orange)">Invalid IP: <code>${UIUtils.escapeHtml(ip)}</code></div>`;
                return;
            }
        }

        if (typeof RemediationService === 'undefined' || !RemediationService || typeof RemediationService.generatePlans !== 'function') {
            container.innerHTML = `<div style="color:var(--accent-red)">RemediationService is unavailable in this build.</div>`;
            return;
        }

        const ctx = {
            core: this.core,
            stats,
            profile,
            state: { lastFocus: ip, auto: false }
        };

        const plans = RemediationService.generatePlans(ctx, ip);
        if (!Array.isArray(plans) || plans.length === 0) {
            container.innerHTML = this.renderGatedHtml(ip, stats);
            return;
        }

        container.innerHTML = this.renderPlansHtml(ip, plans, stats);
    }

    renderNoTargetHtml(stats) {
        const suggested = this.getThreatIntelTargets(stats);
        const chips = suggested.length
            ? suggested.map((ip) => `<button class="choice-chip" onclick="window.logAnalystApp.remediationModal.open('${UIUtils.escapeHtml(ip)}')">${UIUtils.escapeHtml(ip)}</button>`).join('')
            : '';

        return `
            <div class="text-xs" style="color:var(--text-muted); margin-top:6px;">
                Enter an IP to view copy/paste remediation plans.
            </div>
            ${chips ? `<div class="chip-container" style="margin-top:10px;">${chips}</div>` : ''}
        `;
    }

    renderGatedHtml(ip, stats) {
        const suggested = this.getThreatIntelTargets(stats).filter(x => x !== ip);
        const chips = suggested.length
            ? suggested.slice(0, 8).map((s) => `<button class="choice-chip" onclick="window.logAnalystApp.remediationModal.open('${UIUtils.escapeHtml(s)}')">${UIUtils.escapeHtml(s)}</button>`).join('')
            : '';

        return `
            <div class="mb-2" style="color:var(--accent-orange)">
                No safe remediation plan is available yet for <code>${UIUtils.escapeHtml(ip)}</code>.
            </div>
            <div class="text-xs" style="color:var(--text-muted);">
                Current build generates plans only for <code>CONFIRMED</code> threat-intel matches (<code>THREAT_INTEL</code>).
                Use <code>explain ${UIUtils.escapeHtml(ip)}</code> / <code>show evidence ${UIUtils.escapeHtml(ip)}</code> to validate first.
            </div>
            ${chips ? `<div class="chip-container" style="margin-top:12px;">${chips}</div>` : ''}
        `;
    }

    renderPlansHtml(ip, plans, stats) {
        const risk = this.pickHighestRisk(plans);
        const bannerColor = (risk === 'HIGH') ? 'var(--accent-red)' : (risk === 'MEDIUM') ? 'var(--accent-orange)' : 'var(--accent-cyan)';
        const warnings = this.collectWarnings(plans);
        const warningHtml = warnings.length
            ? `<ul class="text-xs" style="margin:8px 0 0; padding-left:18px;">${warnings.map(w => `<li>${UIUtils.escapeHtml(w)}</li>`).join('')}</ul>`
            : '';

        const supportedTargets = this.getThreatIntelTargets(stats);
        const isInSuggested = supportedTargets.includes(ip);
        const proofHint = isInSuggested
            ? `<div class="text-xs" style="color:var(--text-muted); margin-top:6px;">Target is flagged <code>THREAT_INTEL</code> in this run.</div>`
            : '';

        const planBlocks = plans.map((p, idx) => {
            const title = UIUtils.escapeHtml(p && p.title ? p.title : `Plan ${idx + 1}`);
            const desc = UIUtils.escapeHtml(p && p.description ? p.description : '');
            const planRisk = UIUtils.escapeHtml(p && p.risk ? p.risk : '');
            const commands = Array.isArray(p && p.commands) ? p.commands : [];
            const rollback = Array.isArray(p && p.rollbackCommands) ? p.rollbackCommands : [];

            const cmdId = `rem-plan-cmd-${Math.random().toString(36).slice(2)}`;
            const rbId = `rem-plan-rb-${Math.random().toString(36).slice(2)}`;

            const cmdText = UIUtils.escapeHtml(commands.join('\n'));
            const rbText = UIUtils.escapeHtml(rollback.join('\n'));

            return `
                <div style="border:1px solid var(--border); border-radius:12px; padding:12px; margin-top:12px; background: rgba(2,6,23,0.2);">
                    <div style="display:flex; justify-content:space-between; gap:10px; align-items:baseline;">
                        <div style="font-weight:700;">${title}</div>
                        ${planRisk ? `<span class="badge b-blue">${planRisk}</span>` : ''}
                    </div>
                    ${desc ? `<div class="text-xs" style="color:var(--text-muted); margin-top:6px;">${desc}</div>` : ''}
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                        <button class="btn btn-ghost" onclick="UIUtils.copyFromElementId('${cmdId}', this)">Copy commands</button>
                        <button class="btn btn-ghost" onclick="UIUtils.copyFromElementId('${rbId}', this)">Copy rollback</button>
                    </div>
                    <div style="margin-top:10px;">
                        <div class="text-xs" style="color:var(--text-muted); margin-bottom:6px;">Commands</div>
                        <pre class="evidence-slice" id="${cmdId}" style="padding:10px; margin:0;"><code>${cmdText || UIUtils.escapeHtml('# No commands available')}</code></pre>
                    </div>
                    <div style="margin-top:10px;">
                        <div class="text-xs" style="color:var(--text-muted); margin-bottom:6px;">Rollback</div>
                        <pre class="evidence-slice" id="${rbId}" style="padding:10px; margin:0;"><code>${rbText || UIUtils.escapeHtml('# No rollback commands available')}</code></pre>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div style="border:1px solid ${bannerColor}; border-radius:12px; padding:12px; background: rgba(2,6,23,0.35);">
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
                    <div style="font-weight:700;">Risk: <span style="color:${bannerColor}">${UIUtils.escapeHtml(risk)}</span></div>
                    <div class="text-xs" style="color:var(--text-muted);">Copy/paste only · Includes rollback</div>
                </div>
                ${warningHtml}
                ${proofHint}
            </div>
            ${planBlocks}
        `;
    }

    getThreatIntelTargets(stats) {
        const risk = stats && Array.isArray(stats.risk) ? stats.risk : [];
        const out = [];
        for (const row of risk) {
            const ip = row && typeof row.ip === 'string' ? row.ip.trim() : '';
            const badges = row && Array.isArray(row.badges) ? row.badges : [];
            if (!ip) continue;
            if (badges.includes('THREAT_INTEL')) out.push(ip);
        }
        return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b));
    }

    pickHighestRisk(plans) {
        const normalized = (plans || []).map(p => String(p && p.risk ? p.risk : '').toUpperCase());
        if (normalized.includes('HIGH')) return 'HIGH';
        if (normalized.includes('MEDIUM')) return 'MEDIUM';
        if (normalized.includes('LOW')) return 'LOW';
        return 'UNKNOWN';
    }

    collectWarnings(plans) {
        const out = [];
        (plans || []).forEach((p) => {
            (Array.isArray(p && p.warnings) ? p.warnings : []).forEach((w) => {
                const s = String(w || '').trim();
                if (!s) return;
                out.push(s);
            });
        });
        return Array.from(new Set(out));
    }
}

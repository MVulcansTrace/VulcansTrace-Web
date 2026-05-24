/* Findings Dashboard modal — premium security findings view */
import { UIUtils } from './UIUtils.js';

export class FindingsDashboard {
    constructor(core) {
        this.core = core;
    }

    /* ---- public API ---- */

    render() {
        return `
            <div id="findingsDashboardModal" class="overlay">
                <div class="modal-box" style="width:860px;">
                    <div class="modal-head">
                        <span style="display:flex;align-items:center;gap:8px;">
                            <svg class="icon"><use href="#i-shield"></use></svg>
                            Findings Dashboard
                        </span>
                        <span style="cursor:pointer" onclick="window.logAnalystApp.findingsDashboard.close()">
                            <svg class="icon"><use href="#i-close"></use></svg>
                        </span>
                    </div>
                    <div class="modal-body" id="findingsDashboardBody" style="max-height:72vh;">
                        <!-- populated by refresh() -->
                    </div>
                    <div class="modal-foot">
                        <button class="btn" onclick="window.logAnalystApp.findingsDashboard.refresh()">
                            <svg class="icon"><use href="#i-refresh"></use></svg> Refresh
                        </button>
                        <button class="btn btn-primary" onclick="window.logAnalystApp.findingsDashboard.close()">Close</button>
                    </div>
                </div>
            </div>
        `;
    }

    open() {
        const el = document.getElementById('findingsDashboardModal');
        if (el) {
            el.classList.add('active');
            this.refresh();
        }
    }

    close() {
        const el = document.getElementById('findingsDashboardModal');
        if (el) el.classList.remove('active');
    }

    refresh() {
        const body = document.getElementById('findingsDashboardBody');
        if (!body) return;
        body.innerHTML = this._buildContent();
    }

    /* ---- internal rendering ---- */

    _buildContent() {
        const STATS = this.core && this.core.STATS ? this.core.STATS : null;
        const risk = (STATS && STATS.risk) ? STATS.risk : [];
        const timeline = (STATS && STATS.timeline) ? STATS.timeline : [];
        const summary = (STATS && STATS.summary) ? STATS.summary : null;

        let html = '';

        /* 1 ─ Severity distribution stat boxes */
        html += this._renderSeverityDistribution(risk);

        /* 2 ─ Risk host cards grid */
        html += this._renderRiskGrid(risk);

        /* 3 ─ Top MITRE ATT&CK technique badges */
        html += this._renderMitreBadges(risk);

        /* 4 ─ Mini timeline of events */
        html += this._renderMiniTimeline(timeline);

        /* 5 ─ Summary meta row */
        if (summary) {
            html += this._renderSummaryMeta(summary);
        }

        return html;
    }

    /* ── 1. Severity Distribution ── */

    _renderSeverityDistribution(risk) {
        let critical = 0;
        let warning  = 0;
        let info     = 0;

        if (Array.isArray(risk)) {
            risk.forEach(r => {
                const level = (r.level || '').toLowerCase();
                if (level === 'critical' || level === 'high') critical++;
                else if (level === 'medium' || level === 'warning') warning++;
                else info++;
            });
        }

        const total = critical + warning + info;

        return `
            <div style="margin-bottom:18px;">
                <div style="font-weight:700;font-size:0.95rem;color:var(--accent-cyan);margin-bottom:10px;letter-spacing:0.04em;text-transform:uppercase;">
                    Severity Distribution
                </div>
                <div class="stat-grid" style="grid-template-columns:repeat(4,1fr);">
                    <div class="stat-box" style="border-left:3px solid #ef4444;">
                        <div style="color:#ef4444;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;">Critical</div>
                        <div style="font-weight:800;font-size:1.35rem;color:#ef4444;">${critical}</div>
                    </div>
                    <div class="stat-box" style="border-left:3px solid #f59e0b;">
                        <div style="color:#f59e0b;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;">Warning</div>
                        <div style="font-weight:800;font-size:1.35rem;color:#f59e0b;">${warning}</div>
                    </div>
                    <div class="stat-box" style="border-left:3px solid #22c55e;">
                        <div style="color:#22c55e;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;">Info</div>
                        <div style="font-weight:800;font-size:1.35rem;color:#22c55e;">${info}</div>
                    </div>
                    <div class="stat-box" style="border-left:3px solid var(--accent-cyan);">
                        <div style="color:var(--text-muted);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;">Total Hosts</div>
                        <div style="font-weight:800;font-size:1.35rem;">${total}</div>
                    </div>
                </div>
            </div>
        `;
    }

    /* ── 2. Risk Host Cards Grid ── */

    _renderRiskGrid(risk) {
        if (!risk || !risk.length) {
            return `
                <div style="margin-bottom:18px;">
                    <div style="font-weight:700;font-size:0.95rem;color:var(--accent-orange);margin-bottom:10px;letter-spacing:0.04em;text-transform:uppercase;">
                        Risk Hosts
                    </div>
                    <div class="risk-grid">
                        <div class="risk-card" style="text-align:center;padding:32px 16px;">
                            <svg class="icon" style="width:32px;height:32px;fill:var(--text-muted);margin-bottom:8px;"><use href="#i-shield"></use></svg>
                            <div class="risk-ip" style="color:var(--text-muted);">No risk signals detected</div>
                            <div class="risk-meta">All hosts scored Low</div>
                        </div>
                    </div>
                </div>
            `;
        }

        const badgeColor = (b) => {
            const map = {
                THREAT_INTEL: 'b-red', SCANNER: 'b-orange', FLOODER: 'b-red',
                EGRESS: 'b-purple', CHAIN: 'b-cyan', LATERAL: 'b-blue', POLICY: 'b-green'
            };
            return map[b] || 'b-blue';
        };

        const levelColor = (lvl) => {
            const l = (lvl || '').toLowerCase();
            if (l === 'critical' || l === 'high') return 'b-red';
            if (l === 'medium') return 'b-orange';
            return 'b-green';
        };

        const cards = risk.slice(0, 10).map((r, idx) => {
            const badges = (r.badges || []).map(b =>
                `<span class="badge ${badgeColor(b)}">${b}</span>`
            ).join(' ');

            const mitreRow = (r.mitre || []).slice(0, 4).map(m =>
                `<span class="badge b-purple" style="font-size:0.62rem;">${UIUtils.escapeHtml(m.id)}</span>`
            ).join(' ');

            const verdictClass = r.verdict === 'CONFIRMED' ? 'b-red' : 'b-cyan';
            const verdictLabel = r.verdict || 'HYPOTHESIS';

            return `
                <div class="risk-card" style="${r.level === 'Critical' ? 'border-color:rgba(239,68,68,0.4);box-shadow:0 0 12px rgba(239,68,68,0.12);' : ''}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span class="badge ${levelColor(r.level)}">${UIUtils.escapeHtml(r.level || 'Low')} &middot; ${r.score || 0}</span>
                        <span style="color:var(--text-muted);font-size:0.75rem;font-weight:700;">#${idx + 1}</span>
                    </div>
                    <div class="risk-ip">${UIUtils.escapeHtml(r.ip)}</div>
                    <div class="risk-meta">
                        Drops ${r.drops || 0} &middot; Ports ${r.portCount || 0}
                    </div>
                    <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
                        ${badges}
                        <span class="badge ${verdictClass}" style="font-size:0.62rem;">${verdictLabel}</span>
                    </div>
                    ${mitreRow ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:3px;">${mitreRow}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div style="margin-bottom:18px;">
                <div style="font-weight:700;font-size:0.95rem;color:var(--accent-orange);margin-bottom:10px;letter-spacing:0.04em;text-transform:uppercase;">
                    Risk Hosts
                </div>
                <div class="risk-grid">${cards}</div>
            </div>
        `;
    }

    /* ── 3. Top MITRE ATT&CK Technique Badges ── */

    _renderMitreBadges(risk) {
        if (!Array.isArray(risk)) return '';

        /* Aggregate MITRE techniques across all risk hosts */
        const techniqueMap = {};
        risk.forEach(r => {
            (r.mitre || []).forEach(m => {
                const key = m.id || 'Unknown';
                if (!techniqueMap[key]) {
                    techniqueMap[key] = { id: m.id, name: m.name || '', count: 0 };
                }
                techniqueMap[key].count++;
            });
        });

        const techniques = Object.values(techniqueMap).sort((a, b) => b.count - a.count);

        if (!techniques.length) {
            return `
                <div style="margin-bottom:18px;">
                    <div style="font-weight:700;font-size:0.95rem;color:var(--accent-purple);margin-bottom:10px;letter-spacing:0.04em;text-transform:uppercase;">
                        MITRE ATT&CK Techniques
                    </div>
                    <div style="color:var(--text-muted);font-size:0.82rem;padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;text-align:center;">
                        No MITRE ATT&CK techniques mapped
                    </div>
                </div>
            `;
        }

        const badges = techniques.slice(0, 12).map(t => {
            return `<span class="badge b-purple" style="font-size:0.72rem;gap:4px;" title="${UIUtils.escapeHtml(t.name)}">
                ${UIUtils.escapeHtml(t.id)}
                <span style="opacity:0.7;font-size:0.62rem;">${UIUtils.escapeHtml(t.name)}</span>
                <span style="background:rgba(255,255,255,0.12);border-radius:10px;padding:1px 6px;font-size:0.6rem;">${t.count}</span>
            </span>`;
        }).join('');

        return `
            <div style="margin-bottom:18px;">
                <div style="font-weight:700;font-size:0.95rem;color:var(--accent-purple);margin-bottom:10px;letter-spacing:0.04em;text-transform:uppercase;">
                    MITRE ATT&CK Techniques
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                    ${badges}
                </div>
            </div>
        `;
    }

    /* ── 4. Mini Timeline of Events ── */

    _renderMiniTimeline(timeline) {
        if (!timeline || !timeline.length) {
            return `
                <div style="margin-bottom:18px;">
                    <div style="font-weight:700;font-size:0.95rem;color:var(--accent-blue);margin-bottom:10px;letter-spacing:0.04em;text-transform:uppercase;">
                        Event Timeline
                    </div>
                    <div style="color:var(--text-muted);font-size:0.82rem;padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;text-align:center;">
                        No timeline data available
                    </div>
                </div>
            `;
        }

        /* Render bars from the hourly timeline array */
        const maxT = Math.max(...timeline) || 1;
        const bars = timeline.map((v, i) => {
            const pct = Math.max(4, (v / maxT) * 100);
            const color = v > maxT * 0.7 ? 'var(--accent-red)' : 'var(--accent-blue)';
            return `<div style="
                width:100%;
                height:${pct}%;
                min-height:2px;
                background:${color};
                border-radius:2px 2px 0 0;
                transition:height 0.3s;
            " title="${i}:00 — ${v} events"></div>`;
        }).join('');

        /* Hour labels */
        const step = Math.max(1, Math.floor(timeline.length / 12));
        const labels = timeline.map((_, i) => {
            if (i % step === 0 || i === timeline.length - 1) {
                return `<div style="flex:1;text-align:center;font-size:0.55rem;color:var(--text-muted);">${i}</div>`;
            }
            return `<div style="flex:1;"></div>`;
        }).join('');

        return `
            <div style="margin-bottom:18px;">
                <div style="font-weight:700;font-size:0.95rem;color:var(--accent-blue);margin-bottom:10px;letter-spacing:0.04em;text-transform:uppercase;">
                    Event Timeline (24h)
                </div>
                <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:14px;">
                    <div style="display:flex;align-items:flex-end;gap:2px;height:80px;">
                        ${bars}
                    </div>
                    <div style="display:flex;margin-top:4px;">
                        ${labels}
                    </div>
                    <div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;text-align:right;">Peak: ${maxT} events/hr</div>
                </div>
            </div>
        `;
    }

    /* ── 5. Summary Meta ── */

    _renderSummaryMeta(summary) {
        const s = summary;
        const peakMinute = s.peakMinute || {};
        const proto = s.proto || {};

        const total = s.total || 0;
        const dropRate = total > 0 ? ((s.drop || 0) / total * 100).toFixed(1) : '0.0';

        return `
            <div style="margin-bottom:6px;">
                <div style="font-weight:700;font-size:0.95rem;color:var(--accent-cyan);margin-bottom:10px;letter-spacing:0.04em;text-transform:uppercase;">
                    Session Summary
                </div>
                <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));">
                    <div class="stat-box">
                        <div style="color:var(--text-muted);font-size:0.7rem;">TOTAL EVENTS</div>
                        <div style="font-weight:800;">${total.toLocaleString()}</div>
                    </div>
                    <div class="stat-box">
                        <div style="color:var(--text-muted);font-size:0.7rem;">PEAK (UTC)</div>
                        <div style="font-weight:800;">${peakMinute.count || 0}/min</div>
                    </div>
                    <div class="stat-box">
                        <div style="color:var(--text-muted);font-size:0.7rem;">DROP RATE</div>
                        <div style="font-weight:800;color:#ef4444;">${dropRate}%</div>
                    </div>
                    <div class="stat-box">
                        <div style="color:var(--text-muted);font-size:0.7rem;">TCP</div>
                        <div style="font-weight:800;">${(proto.TCP || 0).toLocaleString()}</div>
                    </div>
                    <div class="stat-box">
                        <div style="color:var(--text-muted);font-size:0.7rem;">UDP</div>
                        <div style="font-weight:800;">${(proto.UDP || 0).toLocaleString()}</div>
                    </div>
                    <div class="stat-box">
                        <div style="color:var(--text-muted);font-size:0.7rem;">ICMP</div>
                        <div style="font-weight:800;">${(proto.ICMP || 0).toLocaleString()}</div>
                    </div>
                </div>
            </div>
        `;
    }
}

/* UI rendering and utility functions */
import { LogProcessor } from './LogProcessor.js';
import { UI_LIMITS, TIMEOUTS } from './constants.js';

export class UIUtils {
    static isPlainObject(value) {
        if (!value || typeof value !== 'object') return false;
        if (Array.isArray(value)) return false;
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    static escapeHtml(s) {
        return (s || '').toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    static safeName(n) {
        return n.replace(/[^a-z0-9\._-]/gi, '_');
    }

    static formatTimestamp(ts) {
        if (!ts) return '';
        const num = Number(ts);
        if (!isNaN(num) && num > 1000000000000) {
            return new Date(num).toLocaleString();
        }
        return String(ts);
    }

    static formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static htmlCell(html) {
        return { _safeHtml: html };
    }

    static renderReport(stats, total) {
        if (!total) return "No Data";

        let html = '';
        html += UIUtils.renderHeaderInfo(total);

        if (stats.s.invalid > 0) {
            html += `<div class="mb-2" style="background:rgba(239,68,68,0.1); border:1px solid var(--accent-red); padding:8px; border-radius:4px; font-size:0.8rem; display:flex; align-items:center; gap:8px;">
                <svg class="icon" style="fill:var(--accent-red)"><use href="#i-alert"></use></svg>
                <span style="color:var(--accent-red)">Invalid IPs detected (${stats.s.invalid}). Results may be incomplete.</span>
            </div>`;
        }

        html += UIUtils.renderProfileInfo();
        html += UIUtils.renderTimelineVisualization(stats.s.timeline);
        html += UIUtils.renderProtocolDistribution(stats.s.proto, total);
        html += UIUtils.renderSummaryStats(stats.s, total);

        const profileInfo = UIUtils.getProfileInfo();
        const analysisContext = UIUtils.calculateAnalysisContext(stats);

        html += UIUtils.renderRiskSection(stats.risk, {
            profileInfo,
            rationale: analysisContext.rationale,
            lowRiskRows: analysisContext.lowRiskRows,
            lowWhyRows: analysisContext.lowWhyRows,
            roleRows: analysisContext.roleRows,
            hostTimingRows: analysisContext.hostTimingRows,
            hint: 'Need tighter detection? Switch to Medium/High.'
        });

        // Attack chains
        if (stats.chains.length) {
            html += UIUtils.renderSection(
                'Attack Chains (Blocked → Breached)',
                ['IP', 'Chain', 'Port', 'Time'],
                stats.chains.slice(0, 5).map(x => [
                    x.ip,
                    UIUtils.htmlCell(`<span class="truncate" style="max-width:200px;display:inline-block">${UIUtils.escapeHtml(x.desc)}</span>`),
                    x.port,
                    UIUtils.htmlCell(`<span class="badge b-red">${UIUtils.escapeHtml(x.timeDelta)}</span>`)
                ]),
                'var(--accent-red)'
            );
        }

        // Lateral movement
        if (stats.lateral.length) {
            html += UIUtils.renderSection(
                'Topology & Lateral',
                ['IP', 'Role', 'Files'],
                stats.lateral.slice(0, 5).map(x => [
                    x.ip,
                    UIUtils.htmlCell(`<span class="badge b-blue">${UIUtils.escapeHtml(x.role)}</span>`),
                    UIUtils.htmlCell(`<span class="truncate" style="max-width:150px;display:inline-block">${UIUtils.escapeHtml(x.detail)}</span>`)
                ]),
                'var(--accent-cyan)'
            );
        }

        // Threats
        if (stats.scanners.length) {
            html += UIUtils.renderSectionTable('Scanners', stats.scanners, 'var(--accent-red)', 'b-red');
        }
        if (stats.flooders.length) {
            html += UIUtils.renderSectionTable('Flooders', stats.flooders, 'var(--accent-orange)', 'b-orange');
        }
        if (stats.infections.length) {
            html += UIUtils.renderSectionTable('Outbound', stats.infections, 'var(--accent-purple)', 'b-purple');
        }

        // Top Talkers (High Volume)
        const topTalkers = UIUtils.getTopTalkers(stats.s.src);
        if (topTalkers.length) {
            html += UIUtils.renderSectionTable('Top Talkers (Data Volume)', topTalkers, 'var(--accent-cyan)', 'b-cyan');
        }

        // Policy violations
        if (stats.policy.length) {
            html += `<div class="text-xs" style="color:var(--text-muted); margin-bottom:4px;">Policy = ALLOW events on sensitive ports (21/23/80) surfaced for awareness.</div>`;
            html += UIUtils.renderSection(
                'Policy',
                ['Port', 'Flow'],
                stats.policy.map(p => [p.port, p.flow]),
                'var(--accent-orange)'
            );
        }

        return html;
    }

    static renderHeaderInfo(total) {
        return `
            <div class="hash-box">
                <svg class="icon"><use href="#i-layers"></use></svg>
                Files Analyzed: ${window.logAnalystApp && window.logAnalystApp.core ? window.logAnalystApp.core.getDB().inputs.length : 0}
            </div>
        `;
    }

    static renderProfileInfo() {
        const profileInfo = UIUtils.getProfileInfo();
        return `
            <div class="hash-box" style="margin-top:6px;">
                <svg class="icon"><use href="#i-settings"></use></svg>
                ${profileInfo}
            </div>
        `;
    }

    static getProfileInfo() {
        const activeProfile = LogProcessor?.getActiveProfile?.() ?? 'Unknown';
        const profileCfg = LogProcessor?.PROFILES?.[activeProfile] ?? null;
        return profileCfg
            ? `Profile: ${UIUtils.escapeHtml(activeProfile)} — scannerPorts ${profileCfg.thresholds.scannerPorts}, floodDrops ${profileCfg.thresholds.floodDrops}, egressDests ${profileCfg.thresholds.egressDests}, egressDrops ${profileCfg.thresholds.egressDrops}, chain window ${(profileCfg.chainWindowMs / 60000).toFixed(1)}m`
            : `Profile: ${UIUtils.escapeHtml(activeProfile)}`;
    }

    static getActiveProfileConfig() {
        const activeProfile = LogProcessor?.getActiveProfile?.() ?? 'Unknown';
        return LogProcessor?.PROFILES?.[activeProfile] ?? null;
    }

    static renderTimelineVisualization(timeline) {
        const maxT = Math.max(...timeline) || 1;
        const bars = timeline.map((v, i) =>
            `<div class="t-bar" style="height:${Math.max(5, (v / maxT) * 100)}%;background:${v > maxT * 0.7 ? 'var(--accent-red)' : 'var(--accent-blue)'}" data-label="${i}:00 (${v})"></div>`
        ).join('');

        return `<div class="timeline">${bars}</div>`;
    }

    static renderProtocolDistribution(proto, total) {
        const pTCP = (proto.TCP / total) * 100;
        const pUDP = (proto.UDP / total) * 100;
        const pICMP = (proto.ICMP / total) * 100;
        const pOTH = (proto.OTHER / total) * 100;

        return `
            <div class="mb-4">
                <div class="p-bar-wrap">
                    <div class="p-seg bg-tcp" style="width:${pTCP}%"></div>
                    <div class="p-seg bg-udp" style="width:${pUDP}%"></div>
                    <div class="p-seg bg-icmp" style="width:${pICMP}%"></div>
                    <div class="p-seg bg-other" style="width:${pOTH}%"></div>
                </div>
                <div class="legend">
                    <span><span class="dot bg-tcp"></span>TCP ${Math.round(pTCP)}%</span>
                    <span><span class="dot bg-udp"></span>UDP ${Math.round(pUDP)}%</span>
                </div>
            </div>
        `;
    }

    static renderSummaryStats(s, total) {
        const ignored = s && Number.isFinite(s.ignored) ? s.ignored : 0;
        return `
            <div class="stat-grid">
                <div class="stat-box">
                    <div style="color:#94a3b8;font-size:0.7rem">TOTAL</div>
                    <div class="font-bold">${total}</div>
                </div>
                <div class="stat-box">
                    <div>PEAK (UTC)</div>
                    <div class="font-bold">${s.peakMinute.count}/min</div>
                </div>
                <div class="stat-box">
                    <div>DROP RATE</div>
                    <div class="font-bold" style="color:#ef4444">${((s.drop / total) * 100).toFixed(1)}%</div>
                </div>
                <div class="stat-box">
                    <div>IGNORED</div>
                    <div class="font-bold">${ignored}</div>
                </div>
            </div>
        `;
    }

    static calculateAnalysisContext(stats) {
        const srcList = Object.values(stats.s.src || {});
        const hostsAnalyzed = srcList.length;
        const maxPorts = srcList.length ? Math.max(...srcList.map(s => s.ports.size)) : 0;
        const maxDrops = srcList.length ? Math.max(...srcList.map(s => s.drops)) : 0;
        const outboundList = Object.values(stats.outbound || {});
        const maxOutboundDests = outboundList.length ? Math.max(...outboundList.map(o => o.dests.size)) : 0;
        const chainCount = stats.chains ? stats.chains.length : 0;
        const roleSummary = stats.s.roleCounts ? Object.entries(stats.s.roleCounts).map(([role, count]) => `${role}: ${count}`).join(', ') : 'n/a';
        const earliest = stats.s.meta && stats.s.meta.earliest ? UIUtils.formatEventTime(stats.s.meta.earliest) : 'n/a';
        const latest = stats.s.meta && stats.s.meta.latest ? UIUtils.formatEventTime(stats.s.meta.latest) : 'n/a';
        const roleRows = stats.s.roleCounts ? Object.entries(stats.s.roleCounts).map(([role, count]) => [UIUtils.escapeHtml(role), `${count}`]) : [];
        const hostTimingRows = Object.entries(stats.s.src || {}).slice(0, 5).map(([ip, data]) => {
            const events = data.events || [];
            let firstTs = null;
            let lastTs = null;
            events.forEach(ev => {
                if (typeof ev.ts === 'number' && !isNaN(ev.ts)) {
                    if (firstTs === null || ev.ts < firstTs) firstTs = ev.ts;
                    if (lastTs === null || ev.ts > lastTs) lastTs = ev.ts;
                }
            });
            const first = firstTs ? UIUtils.formatEventTime(firstTs) : '-';
            const last = lastTs ? UIUtils.formatEventTime(lastTs) : '-';
            return [UIUtils.escapeHtml(ip), first, last];
        });

        const lowRiskRows = stats.focus ? Object.values(stats.focus).slice(0, 5).map(f => [
            UIUtils.escapeHtml(f.ip),
            UIUtils.htmlCell(`<span class="badge b-blue">${UIUtils.escapeHtml(f.role)}</span>`),
            `${f.drops}/${f.allows}`,
            `${f.portCount}`,
            `${f.outboundDestCount || 0}`
        ]) : [];

        const lowWhyRows = stats.focus && Object.keys(stats.focus).length ? Object.values(stats.focus).slice(0, 5).map(f => {
            const profileCfg = UIUtils.getActiveProfileConfig();
            if (!profileCfg) return [UIUtils.escapeHtml(f.ip), '-', '-', '-', UIUtils.htmlCell(`<span class="badge b-blue">${UIUtils.escapeHtml(f.role)}</span>`)];

            const dropsVs = `${f.drops}/${profileCfg.thresholds.floodDrops}`;
            const portsVs = `${f.portCount}/${profileCfg.thresholds.scannerPorts}`;
            const outboundVs = `${f.outboundDestCount || 0}/${profileCfg.thresholds.egressDests}`;
            return [
                UIUtils.escapeHtml(f.ip),
                dropsVs,
                portsVs,
                outboundVs,
                UIUtils.htmlCell(`<span class="badge b-blue">${UIUtils.escapeHtml(f.role)}</span>`)
            ];
        }) : [];

        const rationale = `Hosts: ${hostsAnalyzed || 0} · Max ports/source: ${maxPorts} · Max drops/source: ${maxDrops} · Max outbound dests/source: ${maxOutboundDests} · Chains detected: ${chainCount} · Time span (UTC): ${earliest} → ${latest} · Roles: ${roleSummary}`;

        return {
            rationale,
            lowRiskRows,
            lowWhyRows,
            roleRows,
            hostTimingRows
        };
    }

    static getTopTalkers(srcStats) {
        return Object.entries(srcStats || {})
            .sort((a, b) => (b[1].bytes || 0) - (a[1].bytes || 0))
            .slice(0, 5)
            .filter(([_, data]) => data.bytes > 0)
            .map(([ip, data]) => ({
                ip,
                val: UIUtils.formatBytes(data.bytes),
                count: data.allows + data.drops
            }));
    }

    static renderRiskSection(riskList, ctx = {}) {
        const levelClass = (lvl) => {
            if (lvl === 'Critical') return 'b-red';
            if (lvl === 'High') return 'b-red';
            if (lvl === 'Medium') return 'b-orange';
            return 'b-green';
        };

        const badgeClass = (badge) => {
            switch (badge) {
                case 'THREAT_INTEL': return 'b-red';
                case 'SCANNER': return 'b-orange';
                case 'FLOODER': return 'b-red';
                case 'EGRESS': return 'b-purple';
                case 'CHAIN': return 'b-cyan';
                case 'LATERAL': return 'b-blue';
                case 'BEACON': return 'b-yellow';
                case 'EXFIL': return 'b-purple';
                case 'BRUTE_FORCE': return 'b-red';
                case 'COMPROMISED': return 'b-red';
                default: return 'b-blue';
            }
        };

        if (!riskList || !riskList.length) {
            const lowSummary = (ctx.lowRiskRows && ctx.lowRiskRows.length)
                ? UIUtils.renderTable(['IP', 'Role', 'Drops/Allows', 'Ports', 'Outbound Dests'], ctx.lowRiskRows)
                : '<div class="risk-card"><div class="risk-ip">No hosts to summarize</div></div>';
            const lowWhy = (ctx.lowWhyRows && ctx.lowWhyRows.length)
                ? UIUtils.renderTable(['IP', 'Drops/Thr', 'Ports/Thr', 'Outbound/Thr', 'Role'], ctx.lowWhyRows)
                : '';
            const roleTable = (ctx.roleRows && ctx.roleRows.length)
                ? UIUtils.renderSection('Role Distribution', ['Role', 'Count'], ctx.roleRows, 'var(--accent-blue)')
                : '';
            const timingTable = (ctx.hostTimingRows && ctx.hostTimingRows.length)
                ? UIUtils.renderSection('Host Time Spans (UTC)', ['IP', 'First Seen', 'Last Seen'], ctx.hostTimingRows, 'var(--accent-cyan)')
                : '';
            const hint = ctx.hint ? `<div class="text-xs" style="color:var(--text-muted); margin-top:6px;">${UIUtils.escapeHtml(ctx.hint)}</div>` : '';
            const rationale = ctx.rationale ? `<div class="text-xs" style="color:var(--text-muted); margin-top:6px;">Rationale: ${UIUtils.escapeHtml(ctx.rationale)}</div>` : '';
            return `
                <div class="mb-4">
                    <div class="font-bold mb-1" style="color:var(--accent-orange)">Top 5 Risky Hosts</div>
                    <div class="risk-grid">
                        <div class="risk-card">
                            <div class="risk-ip">No risk signals detected</div>
                            <div class="risk-meta">All hosts scored Low</div>
                        </div>
                    </div>
                    ${lowSummary}
                    ${lowWhy}
                    ${roleTable}
                    ${timingTable}
                    ${rationale}
                    ${hint}
                </div>
            `;
        }

        const cards = riskList.slice(0, 5).map((r, idx) => {
            const badges = (r.badges || []).map(b => `<span class="badge ${badgeClass(b)}">${b}</span>`).join(' ');

            // --- NEW: Render MITRE codes as smaller muted badges ---
            const mitreBadges = (r.mitre || []).map(m => `<span class="badge" style="border-color:var(--text-muted); color:var(--text-muted); font-size:0.65rem;" title="${m.name}">[${m.id}]</span>`).join(' ');

            // --- STATUS PULSING: Compute pulse class based on threat badges ---
            const pulseClass = UIUtils.computePulseClass(r.badges || []);
            const cardId = `risk-card-${idx}-${Date.now()}`;

            const dataVol = UIUtils.formatBytes(r.bytes || 0);
            return `
                <div id="${cardId}" class="risk-card ${pulseClass}" title="${pulseClass ? 'Click to silence pulse' : ''}" style="${r.level === 'Critical' ? 'border-color:var(--accent-red);box-shadow:0 0 10px rgba(239,68,68,0.2);' : ''}">
                    <div class="risk-top">
                        <span class="badge ${levelClass(r.level)}">${r.level} · ${r.score}</span>
                        <span class="risk-rank">#${idx + 1}</span>
                    </div>
                    <div class="risk-ip">${UIUtils.escapeHtml(r.ip)}</div>
                    <div class="risk-meta">
                        Drops ${r.drops} · Ports ${r.portCount}<br>
                        <span style="color:var(--accent-cyan)">Data: ${dataVol}</span>
                    </div>
                    <div class="risk-badges">
                        ${badges || '<span style="color:var(--text-muted)">No badges</span>'}
                        ${mitreBadges}
                    </div>
                    <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="btn btn-ghost" data-ip="${UIUtils.escapeHtml(r.ip)}" data-action="allowlist">
                            <svg class="icon"><use href="#i-shield"></use></svg> Mark safe
                        </button>
                        <button class="btn btn-ghost" data-ip="${UIUtils.escapeHtml(r.ip)}" data-action="remediation">
                            <svg class="icon"><use href="#i-lock"></use></svg> View remediation
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="mb-4">
                <div class="font-bold mb-1" style="color:var(--accent-orange)">Top 5 Risky Hosts</div>
                <div class="risk-grid">${cards}</div>
            </div>
        `;
    }

    static formatEventTime(ts, raw) {
        if (ts && !isNaN(ts)) {
            try {
                return new Date(ts).toISOString().substring(11, 19);
            } catch (err) {
                // ignore and fall back
            }
        }
        return raw || '--:--:--';
    }

    static buildFocusSummary(focus) {
        if (!focus) return '';

        const detectors = (focus.detectors && focus.detectors.length) ? focus.detectors.join(', ') : 'None';
        const files = (focus.files && focus.files.length) ? focus.files.join(', ') : 'Single file';
        const events = (focus.events || []).slice(-3).map(ev => {
            const ts = UIUtils.formatEventTime(ev.ts, ev.time);
            const dst = ev.dst || '-';
            const dport = ev.dport || '-';
            const act = ev.action || '';
            return `${ts} ${act} -> ${dst}:${dport}`;
        }).join(' | ');

        // --- NEW: Add MITRE codes to text summary ---
        const mitreText = (focus.mitre || []).map(m => m.id).join(', ');

        return `${focus.ip} ${focus.role} | Detectors: ${detectors} ${mitreText ? `(${mitreText})` : ''} | Drops ${focus.drops} / Allows ${focus.allows} | Ports ${focus.portCount} | Outbound dests ${focus.outboundDestCount || 0} (drops ${focus.outboundDropCount || 0}) | Files: ${files} | Recent: ${events || 'No events'}`;
    }

    static async copyFocusSummary(summaryId) {
        const el = document.getElementById(summaryId);
        if (!el) return;
        const text = el.value || el.textContent || '';
        if (!text) return;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            const btn = document.querySelector(`[data-copy-target=\"${summaryId}\"]`);
            if (btn) {
                const original = btn.textContent;
                btn.textContent = 'Copied';
                setTimeout(() => btn.textContent = original, TIMEOUTS.BUTTON_FEEDBACK_MS);
            }
        } catch (err) {
            console.error('Copy failed', err);
        }
    }

    static async copyFromElementId(elementId, buttonEl) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const text = (typeof el.value === 'string' && el.value.length)
            ? el.value
            : (el.textContent || '');

        const trimmed = String(text || '').trim();
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

            const btn = buttonEl && buttonEl.textContent != null ? buttonEl : null;
            if (btn) {
                const original = btn.textContent;
                btn.textContent = 'Copied';
                setTimeout(() => btn.textContent = original, TIMEOUTS.BUTTON_FEEDBACK_MS);
            }
        } catch (err) {
            console.error('Copy failed', err);
        }
    }

    static renderDetectorBadges(detectors) {
        if (!detectors || !detectors.length) {
            return `<span class="empty-hint">No detectors fired</span>`;
        }

        const badgeClass = {
            THREAT_INTEL: 'b-red',
            SCANNER: 'b-orange',
            FLOODER: 'b-red',
            EGRESS: 'b-purple',
            CHAIN: 'b-cyan',
            LATERAL: 'b-blue',
            BEACON: 'b-yellow',
            EXFIL: 'b-purple',
            BRUTE_FORCE: 'b-red',
            COMPROMISED: 'b-red',
            POLICY: 'b-green'
        };

        return detectors.map(d => `<span class="badge ${badgeClass[d] || 'b-blue'}">${d}</span>`).join(' ');
    }

    static renderFocusPanel(focus) {
        if (!focus) return '<div class=\"empty-hint\">IP not found.</div>';

        const summaryId = `focus-summary-${Math.random().toString(36).slice(2)}`;
        const summaryText = UIUtils.buildFocusSummary(focus);
        const detectors = UIUtils.renderDetectorBadges(focus.detectors);
        const outboundCount = focus.outboundDestCount || 0;
        const fileCount = (focus.files || []).length;

        // --- NEW: Render MITRE Badges in Focus Panel ---
        const mitreBadges = (focus.mitre || []).map(m => `<span class="badge" style="border-color:var(--text-muted); color:var(--text-muted); font-size:0.75rem;" title="${m.name}">[${m.id}] ${m.name}</span>`).join(' ');

        const events = (focus.events || []).slice().reverse().map(ev => {
            const t = UIUtils.formatEventTime(ev.ts, ev.time);
            const actionClass = ev.action === 'DROP' ? 'b-red' : 'b-green';
            const dst = `${UIUtils.escapeHtml(ev.dst || '-')}:${UIUtils.escapeHtml(ev.dport || '-')}`;
            const file = ev.file ? `<span class=\"focus-file\">${UIUtils.escapeHtml(ev.file)}</span>` : '';
            return `
                <div class=\"focus-event\">
                    <span class=\"focus-ts\">${t}</span>
                    <span class=\"badge ${actionClass}\">${ev.action || ''}</span>
                    <span class=\"focus-dst\">→ ${dst}</span>
                    ${file}
                </div>
            `;
        }).join('') || '<div class=\"empty-hint\">No recent events recorded for this host.</div>';

        const files = (focus.files || []).map(f => `<span class=\"file-pill\">${UIUtils.escapeHtml(f)}</span>`).join('') || '<div class=\"empty-hint\">Only seen in one file.</div>';

        const riskBadges = (focus.badges || []).map(b => `<span class=\"badge b-blue\">${b}</span>`).join(' ');

        return `
            <div class=\"focus-panel\">
                <div class=\"focus-header\">
                    <div>
                        <div class=\"focus-label\">Focus IP</div>
                        <div class=\"focus-title\">${UIUtils.escapeHtml(focus.ip)} <span class=\"badge b-blue\">${UIUtils.escapeHtml(focus.role)}</span></div>
                        <div class=\"focus-meta\">Drops ${focus.drops} · Allows ${focus.allows} · Ports ${focus.portCount} · Outbound ${outboundCount}</div>
                        <div class=\"mini-stats\">
                            <div class=\"mini-stat\"><span class=\"label\">Outbound Drops</span>${focus.outboundDropCount || 0}</div>
                            <div class=\"mini-stat\"><span class=\"label\">Files</span>${fileCount}</div>
                            <div class=\"mini-stat\"><span class=\"label\">Risk</span>${riskBadges || 'Low'}</div>
                        </div>
                    </div>
                    <div class=\"focus-actions\">
                        <button class=\"btn btn-ghost\" data-copy-target=\"${summaryId}\" data-action=\"copy-summary\">
                            <svg class=\"icon\"><use href=\"#i-file\"></use></svg> Copy summary
                        </button>
                        <button class=\"btn btn-ghost\" data-ip=\"${UIUtils.escapeHtml(focus.ip)}\" data-action=\"remediation\">
                            <svg class=\"icon\"><use href=\"#i-lock\"></use></svg> View remediation
                        </button>
                    </div>
                </div>
                <div class=\"focus-detectors\" style="display:flex; flex-direction:column; gap:8px;">
                    <div>${detectors}</div>
                    ${mitreBadges ? `<div>${mitreBadges}</div>` : ''}
                </div>
                <div class=\"focus-grid\">
                    <div class=\"focus-card\">
                        <h4>Recent Activity</h4>
                        ${events}
                    </div>
                    <div class=\"focus-card\">
                        <h4>Files & Lateral Context</h4>
                        <div class=\"focus-files\">${files}</div>
                        <div class=\"empty-hint\" style=\"margin-top:6px;\">Timeline capped at 10 most recent events for this host.</div>
                    </div>
                </div>
                <textarea id=\"${summaryId}\" class=\"offscreen\" readonly>${UIUtils.escapeHtml(summaryText)}</textarea>
            </div>
        `;
    }

    static renderSection(title, headers, rows, color) {
        return `
            <div class="mb-4">
                <div class="font-bold mb-1" style="color:${color}">${title}</div>
                ${UIUtils.renderTable(headers, rows)}
            </div>
        `;
    }

    static renderSectionTable(title, data, color, badgeClass) {
        const rows = data.slice(0, 5).map(x => [x.ip, x.val, UIUtils.htmlCell(`<span class="badge ${badgeClass}">${x.count}</span>`)]);
        return UIUtils.renderSection(title, ['IP', 'Info', 'Drops'], rows, color);
    }

    static renderTable(headers, rows) {
        const headerHtml = headers.map(h => `<th>${h}</th>`).join('');
        const rowsHtml = rows.map(row => {
            const cellsHtml = row.map(cell => {
                if (cell && cell._safeHtml) {
                    return `<td>${cell._safeHtml}</td>`;
                }
                return `<td>${UIUtils.escapeHtml(cell)}</td>`;
            }).join('');
            return `<tr>${cellsHtml}</tr>`;
        }).join('');

        return `
            <div class="table-wrap">
                <table class="stat-table">
                    <thead><tr>${headerHtml}</tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;
    }

    static addMessage(html, type) {
        const chat = document.getElementById('chat');
        const div = document.createElement('div');
        div.className = `message ${type}`;

        if (type === 'bot') {
            div.innerHTML = `
                <div class="bot-avatar">
                    <img src="assets/VulcansTraceAvatar.png" alt="VulcansTrace" style="width: 100%; height: 100%; object-fit: contain;">
                </div>
                <div class="bot-card">
                    <div class="bot-header">
                        VulcansTrace
                    </div>
                    <div class="bot-content">${html}</div>
                </div>
            `;
        } else {
            div.textContent = html;
        }

        chat.appendChild(div);

        // Fade out empty-state art once conversation starts
        if (!chat.classList.contains('has-messages')) {
            chat.classList.add('has-messages');
        }
        // Smooth scroll to bottom
        requestAnimationFrame(() => {
            chat.scrollTop = chat.scrollHeight;
        });
    }

    static addBotHTML(html) {
        UIUtils.addMessage(html, 'bot');
    }

    static createUserMessage(text) {
        UIUtils.addMessage(text, 'user');
    }

    static setCmd(text) {
        const input = document.getElementById('input');
        input.value = text;
        input.focus();
    }

    /**
     * Compute pulse CSS class based on threat badges.
     * Priority: Critical (SCANNER/FLOODER/THREAT_INTEL) > Warning (EGRESS/CHAIN) > Info (LATERAL/POLICY)
     * Adds 'stacked' modifier if 2+ threat badges detected.
     * @param {string[]} badges - Array of badge names
     * @returns {string} Space-separated CSS classes
     */
    static computePulseClass(badges) {
        if (!Array.isArray(badges) || badges.length === 0) return '';

        const critical = ['SCANNER', 'FLOODER', 'THREAT_INTEL'];
        const warning = ['EGRESS', 'CHAIN'];
        const info = ['LATERAL', 'POLICY'];

        let pulseClass = '';
        const hasCritical = badges.some(b => critical.includes(b));
        const hasWarning = badges.some(b => warning.includes(b));
        const hasInfo = badges.some(b => info.includes(b));

        // Determine severity tier (highest priority wins)
        if (hasCritical) {
            pulseClass = 'risk-card--pulse-critical';
        } else if (hasWarning) {
            pulseClass = 'risk-card--pulse-warning';
        } else if (hasInfo) {
            pulseClass = 'risk-card--pulse-info';
        }

        // Add stacked modifier if 2+ threat badges
        const threatBadges = badges.filter(b => [...critical, ...warning, ...info].includes(b));
        if (threatBadges.length >= 2 && pulseClass) {
            pulseClass += ' risk-card--pulse-stacked';
        }

        return pulseClass;
    }

    /**
     * Silence pulse animation on a card (click-to-acknowledge)
     * @param {HTMLElement} element - The risk card element
     */
    static silencePulse(element) {
        if (!element) return;
        element.classList.add('risk-card--pulse-silenced');
    }

    /**
     * Schedule pulse de-escalation (transition to steady state after delay)
     * @param {HTMLElement} element - The risk card element
     * @param {number} delayMs - Delay before de-escalation (default: 45s)
     */
    static schedulePulseDeEscalation(element, delayMs = TIMEOUTS.PULSE_DE_ESCALATION_MS) {
        if (!element) return;
        setTimeout(() => {
            // Only de-escalate if not already silenced
            if (!element.classList.contains('risk-card--pulse-silenced')) {
                element.classList.add('risk-card--pulse-steady');
            }
        }, delayMs);
    }
}

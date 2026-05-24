/* Theater Mode (boardroom show) */
import { UIUtils } from './UIUtils.js';
import { CaseSnapshot } from './CaseSnapshot.js';
import { EvidenceGenerator } from './EvidenceGenerator.js';
import { HypothesisEngine } from './HypothesisEngine.js';
import { RemediationService } from './RemediationService.js';

export class TheaterMode {
    constructor(core) {
        this.core = core;
        this.slides = [];
        this.slideIndex = 0;
        this._keyHandler = (e) => this.handleKeyDown(e);
        this._previousOverflow = null;
        this._cachedSlides = null;
        this._cachedSlidesVersion = -1;
    }

    render() {
        return `
            <div id="theaterOverlay" class="overlay theater-overlay">
                <div class="theater-box" role="dialog" aria-modal="true" aria-label="Theater Mode">
                    <div class="theater-head">
                        <div>
                            <div id="theaterTitle" class="theater-title">Theater Mode</div>
                            <div id="theaterSubtitle" class="theater-subtitle">←/→ navigate · Esc exit</div>
                        </div>
                        <div class="theater-head-right">
                            <span id="theaterProgress" class="badge b-blue">0 / 0</span>
                            <button class="btn btn-ghost" onclick="window.logAnalystApp.theaterMode.close()">Esc</button>
                        </div>
                    </div>
                    <div class="theater-body">
                        <div id="theaterSlideContent"></div>
                    </div>
                    <div class="theater-foot">
                        <div class="theater-foot-left text-xs" style="color:var(--text-muted)">
                            Tip: run <code>export evidence</code> after the story to produce a ZIP.
                        </div>
                        <div class="theater-nav">
                            <button class="btn btn-ghost" onclick="window.logAnalystApp.theaterMode.prev()">Prev</button>
                            <button id="theaterNextBtn" class="btn btn-primary" onclick="window.logAnalystApp.theaterMode.next()">Next</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    isOpen() {
        const overlay = document.getElementById('theaterOverlay');
        return !!(overlay && overlay.classList.contains('active'));
    }

    _getSlidesVersion() {
        const stats = this.core && typeof this.core.getStats === 'function' ? this.core.getStats() : null;
        const snapshots = this.core && typeof this.core.getSnapshotCache === 'function' ? this.core.getSnapshotCache() : [];
        return `${(stats && stats.risk) ? stats.risk.length : 0}:${snapshots.length}:${Date.now()}`;
    }

    open(options = null) {
        const overlay = document.getElementById('theaterOverlay');
        if (!overlay) return;

        // Close EvidenceSliceModal if open to prevent modal overlap (Bug #2 fix)
        if (typeof window.logAnalystApp !== 'undefined' &&
            window.logAnalystApp.evidenceSliceModal &&
            typeof window.logAnalystApp.evidenceSliceModal.close === 'function') {
            window.logAnalystApp.evidenceSliceModal.close();
        }

        const opts = options && typeof options === 'object' ? options : {};
        const startAt = Number.isFinite(opts.startAt) ? Math.max(0, Math.floor(opts.startAt)) : 0;

        const version = this._getSlidesVersion();
        if (!this._cachedSlides || this._cachedSlidesVersion !== version) {
            this._cachedSlides = this.buildSlides();
            this._cachedSlidesVersion = version;
        }
        this.slides = this._cachedSlides;
        this.slideIndex = Math.min(startAt, Math.max(0, this.slides.length - 1));

        overlay.classList.add('active');
        this._previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        try {
            document.addEventListener('keydown', this._keyHandler, true);
        } catch {
            // ignore
        }

        this.renderSlide();
    }

    close() {
        const overlay = document.getElementById('theaterOverlay');
        if (!overlay) return;
        overlay.classList.remove('active');

        try {
            document.removeEventListener('keydown', this._keyHandler, true);
        } catch {
            // ignore
        }

        document.body.style.overflow = (this._previousOverflow != null) ? this._previousOverflow : '';
        this._previousOverflow = null;

        this._cachedSlides = null;
        this._cachedSlidesVersion = -1;
    }

    next() {
        if (!this.isOpen()) return;
        if (!Array.isArray(this.slides) || this.slides.length === 0) return;
        // Auto-close on last slide (Bug #3 fix)
        if (this.slideIndex >= this.slides.length - 1) {
            this.close();
            return;
        }
        this.slideIndex = Math.min(this.slideIndex + 1, this.slides.length - 1);
        this.renderSlide();
    }

    prev() {
        if (!this.isOpen()) return;
        if (!Array.isArray(this.slides) || this.slides.length === 0) return;
        this.slideIndex = Math.max(0, this.slideIndex - 1);
        this.renderSlide();
    }

    handleKeyDown(e) {
        if (!this.isOpen()) return;
        const key = e && e.key ? String(e.key) : '';
        if (!key) return;

        if (key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.close();
            return;
        }

        if (key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            this.next();
            return;
        }

        if (key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            this.prev();
        }
    }

    escapeHtml(value) {
        if (typeof UIUtils !== 'undefined' && UIUtils && typeof UIUtils.escapeHtml === 'function') {
            return UIUtils.escapeHtml(value);
        }
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    safeArray(value) {
        return Array.isArray(value) ? value : [];
    }

    safeObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    buildSlides() {
        const stats = this.core && typeof this.core.getStats === 'function' ? this.core.getStats() : null;
        const topology = this.core && typeof this.core.getTopology === 'function' ? this.core.getTopology() : null;
        const profile = this.core && typeof this.core.getProfile === 'function' ? this.core.getProfile() : null;
        const caseId = this.core && typeof this.core.getActiveCaseId === 'function' ? this.core.getActiveCaseId() : null;
        const db = this.core && typeof this.core.getDB === 'function' ? this.core.getDB() : null;
        const iocs = this.core && typeof this.core.getIOCs === 'function' ? this.core.getIOCs() : [];
        const allowlist = this.core && typeof this.core.getAllowlist === 'function' ? this.core.getAllowlist() : [];
        const snapshots = this.core && typeof this.core.getSnapshotCache === 'function' ? this.core.getSnapshotCache() : [];

        const totals = {
            flows: db && Array.isArray(db.entries) ? db.entries.length : (db && Number.isFinite(db.total) ? db.total : 0),
            cloudtrail: db && Array.isArray(db.cloudEvents) ? db.cloudEvents.length : 0,
            minuteBuckets: [],
            seeds: { srcIps: [], dstIps: [], dstPorts: [] },
            portUsage: { byRole: [], bySubnet: [] }
        };

        const snapshot = (snapshots && snapshots[0]) ? snapshots[0] : (
            (typeof CaseSnapshot !== 'undefined' && CaseSnapshot && typeof CaseSnapshot.buildSnapshot === 'function')
                ? CaseSnapshot.buildSnapshot({ caseId, stats, profile, topology, totals, createdAt: new Date().toISOString() })
                : null
        );

        const ctx = {
            core: this.core,
            caseId,
            profile,
            iocs: this.safeArray(iocs),
            allowlist: this.safeArray(allowlist),
            totals: { flows: totals.flows, cloudtrail: totals.cloudtrail }
        };

        const ts = new Date().toISOString();

        const triage = (typeof EvidenceGenerator !== 'undefined'
            && EvidenceGenerator
            && typeof EvidenceGenerator.buildTriageArtifact === 'function')
            ? EvidenceGenerator.buildTriageArtifact(stats, ctx, ts)
            : this.buildFallbackTriage(stats, ctx, ts);

        const diffArtifact = (typeof EvidenceGenerator !== 'undefined'
            && EvidenceGenerator
            && typeof EvidenceGenerator.buildDiffArtifact === 'function')
            ? EvidenceGenerator.buildDiffArtifact(stats, topology, ctx, ts)
            : { compareLast: null, compareBaseline: null };

        const preferred = (diffArtifact && diffArtifact.compareLast && diffArtifact.compareLast.diff)
            ? { label: 'last run', diff: diffArtifact.compareLast.diff }
            : (diffArtifact && diffArtifact.compareBaseline && diffArtifact.compareBaseline.diff)
                ? { label: 'baseline', diff: diffArtifact.compareBaseline.diff }
                : { label: 'baseline', diff: {} };

        const hypothesis = (typeof HypothesisEngine !== 'undefined' && HypothesisEngine && typeof HypothesisEngine.generate === 'function')
            ? HypothesisEngine.generate({
                stats,
                diff: preferred.diff || {},
                currentSnapshot: snapshot || {},
                compareLabel: preferred.label,
                topOutboundDestinations: snapshot && snapshot.topOutboundDestinations ? snapshot.topOutboundDestinations : []
            })
            : { verdictLabel: 'UNKNOWN', narratives: [] };

        const caseLabel = caseId ? (this.core && typeof this.core.getActiveCaseName === 'function' ? this.core.getActiveCaseName() : 'Untitled Case') : 'No case loaded';
        const risk = this.safeArray(stats && stats.risk);
        const highRisk = risk.filter(r => r && r.level === 'Critical').length;
        const medRisk = risk.filter(r => r && r.level === 'High').length;
        const topThreatIp = risk.length && risk[0] && risk[0].ip ? risk[0].ip : null;
        const threatLevel = risk.length && risk[0] && risk[0].level ? risk[0].level : null;

        return [
            { key: 'intro', title: 'Overview', html: this.renderIntroSlide({ caseLabel, caseId, profile, totals, risk: risk.length, highRisk, medRisk, topThreatIp, threatLevel, window: snapshot && snapshot.timeWindow, triage, ts }) },
            { key: 'snapshot', title: 'Snapshot', html: this.renderSnapshotSlide(snapshot, triage) },
            { key: 'triage', title: 'Triage', html: this.renderTriageSlide(triage) },
            { key: 'diff', title: 'Diff', html: this.renderDiffSlide(diffArtifact) },
            { key: 'hypothesis', title: 'Hypothesis', html: this.renderHypothesisSlide(hypothesis, preferred.label) },
            { key: 'remediation', title: 'Remediation', html: this.renderRemediationSlide(stats, triage) }
        ];
    }

    buildFallbackTriage(stats, ctx, ts) {
        const s = this.safeObject(stats);
        const risk = this.safeArray(s.risk);

        const topRisk = risk.slice(0, 15).map((r, idx) => {
            const badges = this.safeArray(r && r.badges).map(x => String(x));
            return {
                rank: idx + 1,
                ip: r && r.ip != null ? String(r.ip) : '',
                level: r && r.level != null ? String(r.level) : 'Unknown',
                score: (r && Number.isFinite(r.score)) ? r.score : 0,
                badges,
                drops: (r && Number.isFinite(r.drops)) ? r.drops : 0,
                allows: (r && Number.isFinite(r.allows)) ? r.allows : 0,
                portCount: (r && Number.isFinite(r.portCount)) ? r.portCount : 0,
                outboundDests: (r && Number.isFinite(r.outboundDests)) ? r.outboundDests : 0,
                outboundDrops: (r && Number.isFinite(r.outboundDrops)) ? r.outboundDrops : 0,
                role: r && r.role != null ? String(r.role) : null
            };
        });

        const confirmedThreatIps = Array.from(new Set(
            risk
                .map(r => (r && typeof r.ip === 'string') ? r.ip.trim() : '')
                .filter(Boolean)
                .filter((ip) => {
                    const row = risk.find(x => x && x.ip === ip);
                    const badges = this.safeArray(row && row.badges).map(x => String(x));
                    return badges.includes('THREAT_INTEL');
                })
        )).sort((a, b) => a.localeCompare(b));

        return {
            tool: 'VulcansTrace V1',
            generated: ts,
            caseId: ctx && ctx.caseId != null ? String(ctx.caseId) : null,
            profile: ctx && ctx.profile != null ? String(ctx.profile) : null,
            lastFocus: null,
            counts: {
                totalRiskyHosts: risk.length,
                iocs: Array.isArray(ctx && ctx.iocs) ? ctx.iocs.length : 0,
                allowlist: Array.isArray(ctx && ctx.allowlist) ? ctx.allowlist.length : 0
            },
            confirmedThreatIps,
            topRisk
        };
    }

    renderIntroSlide({ caseLabel, caseId, profile, totals, risk, highRisk, medRisk, topThreatIp, threatLevel, window: timeWindow, triage, ts }) {
        const hasData = risk > 0 || (totals && totals.flows > 0);
        const flows = totals && Number.isFinite(totals.flows) ? totals.flows : 0;
        const cloudtrail = totals && Number.isFinite(totals.cloudtrail) ? totals.cloudtrail : 0;
        const profileLabel = profile || 'Medium';
        const tw = this.safeObject(timeWindow);
        const windowText = (tw.earliest && tw.latest)
            ? `${this.escapeHtml(String(tw.earliest).slice(0, 19))} → ${this.escapeHtml(String(tw.latest).slice(0, 19))}`
            : null;

        // Build a 5-bullet agenda of what's coming
        const agendaItems = [
            { num: '01', title: 'Snapshot', desc: 'Full state of the investigation case' },
            { num: '02', title: 'Triage', desc: 'Ranked threat table with scores and badges' },
            { num: '03', title: 'Diff', desc: 'What changed vs. the baseline' },
            { num: '04', title: 'Hypothesis', desc: 'Attack-chain narratives from evidence' },
            { num: '05', title: 'Remediation', desc: 'Actionable containment steps' }
        ];
        const agendaHtml = agendaItems.map(a =>
            `<div class="theater-agenda-item">
                <span class="theater-agenda-num">${a.num}</span>
                <span class="theater-agenda-title">${a.title}</span>
                <span class="theater-agenda-desc">${a.desc}</span>
            </div>`
        ).join('');

        if (!hasData) {
            return `
                <div class="theater-slide">
                    <div class="theater-kicker">Incident investigation report</div>
                    <h2>${this.escapeHtml(caseLabel)}</h2>
                    <div class="theater-muted">No analysis data yet. Paste logs or run the Guided Demo first, then open Presentation.</div>
                    <div class="theater-agenda" style="margin-top:24px;">${agendaHtml}</div>
                    <div class="theater-muted" style="margin-top:20px; font-size:0.82rem;">Press <kbd>→</kbd> to advance or <kbd>Esc</kbd> to exit.</div>
                </div>
            `;
        }

        const severity = highRisk > 0 ? 'CRITICAL' : medRisk > 0 ? 'ELEVATED' : 'NORMAL';
        const sevClass = highRisk > 0 ? 'sev-critical' : medRisk > 0 ? 'sev-elevated' : 'sev-normal';

        const threatSummaryHtml = topThreatIp
            ? `<div class="theater-card">
                    <div class="theater-card-title">Top threat</div>
                    <div class="theater-big">
                        <code>${this.escapeHtml(topThreatIp)}</code>
                        <span class="badge ${threatLevel === 'Critical' ? 'b-red' : 'b-orange'}">${this.escapeHtml(threatLevel || 'Unknown')}</span>
                    </div>
                </div>`
            : '';

        return `
            <div class="theater-slide">
                <div class="theater-kicker">Incident investigation report</div>
                <h2>${this.escapeHtml(caseLabel)}</h2>
                <div class="theater-muted">
                    Profile: <strong>${this.escapeHtml(profileLabel)}</strong>
                    ${windowText ? ` · Window: ${windowText}` : ''}
                    ${caseId ? ` · Case ID: <code style="font-size:0.78rem; opacity:0.6;">${this.escapeHtml(String(caseId).slice(0, 8))}</code>` : ''}
                </div>
                <div class="theater-metrics">
                    <div class="theater-metric"><span class="label">Flows analyzed</span><span class="value">${this.escapeHtml(flows)}</span></div>
                    <div class="theater-metric"><span class="label">CloudTrail events</span><span class="value">${this.escapeHtml(cloudtrail)}</span></div>
                    <div class="theater-metric"><span class="label">Risky hosts</span><span class="value">${this.escapeHtml(risk)}</span></div>
                    <div class="theater-metric"><span class="label">Severity</span><span class="value sev-badge ${sevClass}">${severity}</span></div>
                </div>
                <div class="theater-grid">
                    ${threatSummaryHtml}
                    <div class="theater-card">
                        <div class="theater-card-title">Story agenda</div>
                        <div class="theater-agenda">${agendaHtml}</div>
                    </div>
                </div>
                <div class="theater-muted" style="margin-top:14px; font-size:0.82rem;">Press <kbd>→</kbd> to advance through the story.</div>
            </div>
        `;
    }

    renderConfirmedThreatIntel(confirmedThreatIps) {
        const ips = this.safeArray(confirmedThreatIps).map(x => String(x)).filter(Boolean);
        if (!ips.length) {
            return `<div class="theater-muted">None in this run. Remediation suggestions remain gated.</div>`;
        }

        const items = ips.slice(0, 12).map(ip => `<li><code>${this.escapeHtml(ip)}</code></li>`).join('');
        const more = ips.length > 12
            ? `<div class="theater-muted" style="margin-top:8px;">+${this.escapeHtml(ips.length - 12)} more</div>`
            : '';

        return `<ul class="theater-list">${items}</ul>${more}`;
    }

    renderSlide() {
        const titleEl = document.getElementById('theaterTitle');
        const progressEl = document.getElementById('theaterProgress');
        const contentEl = document.getElementById('theaterSlideContent');

        const slides = Array.isArray(this.slides) ? this.slides : [];
        const idx = Math.max(0, Math.min(this.slideIndex, Math.max(0, slides.length - 1)));
        const slide = slides[idx] || { title: 'Theater Mode', html: '' };

        if (titleEl) titleEl.textContent = `Theater Mode · ${slide.title || 'Slide'}`;
        if (progressEl) progressEl.textContent = `${slides.length ? (idx + 1) : 0} / ${slides.length || 0}`;
        if (contentEl) contentEl.innerHTML = slide.html || '';

        // Update Next button label for last slide (Bug #3 fix)
        const nextBtn = document.getElementById('theaterNextBtn');
        if (nextBtn) {
            nextBtn.textContent = (idx >= slides.length - 1) ? 'Finish' : 'Next';
        }
    }

    renderSnapshotSlide(snapshot, triage) {
        const snap = this.safeObject(snapshot);
        const t = this.safeObject(triage);

        const topRisk = this.safeArray(t.topRisk);
        const noData = !snapshot && topRisk.length === 0;
        if (noData) {
            return `
                <div class="theater-slide">
                    <div class="theater-kicker">No analysis loaded</div>
                    <h2>Drop logs to generate a story</h2>
                    <div class="theater-grid">
                        <div class="theater-card">
                            <div class="theater-card-title">What you can do</div>
                            <ul class="theater-list">
                                <li>Drop flow logs, then wait for analysis to complete.</li>
                                <li>Run <code>top threats</code> and <code>explain &lt;ip&gt;</code>.</li>
                                <li>Then run <code>demo boardroom</code> again.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            `;
        }

        const caseId = snap.caseId != null ? String(snap.caseId) : (t.caseId != null ? String(t.caseId) : '');
        const profile = (t.profile != null ? String(t.profile) : '') || '';
        const signature = snap.environmentSignature ? String(snap.environmentSignature) : '';
        const earliest = snap.timeWindow && snap.timeWindow.earliest ? String(snap.timeWindow.earliest) : '';
        const latest = snap.timeWindow && snap.timeWindow.latest ? String(snap.timeWindow.latest) : '';

        const windowText = (earliest && latest)
            ? `${this.escapeHtml(earliest)} → ${this.escapeHtml(latest)}`
            : 'n/a';

        const flows = snap.totals && Number.isFinite(snap.totals.flows) ? snap.totals.flows : null;
        const cloudtrail = snap.totals && Number.isFinite(snap.totals.cloudtrail) ? snap.totals.cloudtrail : null;
        const allow = snap.totals && Number.isFinite(snap.totals.allow) ? snap.totals.allow : null;
        const drop = snap.totals && Number.isFinite(snap.totals.drop) ? snap.totals.drop : null;

        const counts = this.safeObject(t.counts);
        const riskyHosts = Number.isFinite(counts.totalRiskyHosts) ? counts.totalRiskyHosts : 0;
        const iocs = Number.isFinite(counts.iocs) ? counts.iocs : 0;
        const allowlist = Number.isFinite(counts.allowlist) ? counts.allowlist : 0;

        const top = topRisk.length ? topRisk[0] : null;
        const topIp = top && top.ip ? String(top.ip) : '';
        const topLevel = top && top.level ? String(top.level) : '';
        const topScore = top && Number.isFinite(top.score) ? top.score : null;
        const topBadges = this.safeArray(top && top.badges).map(b => String(b));

        const focusBadgesHtml = topBadges.length
            ? topBadges.slice(0, 6).map((b) => {
                const cls = b === 'THREAT_INTEL' ? 'b-red' : 'b-blue';
                return `<span class="badge ${cls}">${this.escapeHtml(b)}</span>`;
            }).join(' ')
            : `<span class="badge b-blue">No badges</span>`;

        const focusHtml = topIp
            ? `
                <div class="theater-card">
                    <div class="theater-card-title">Primary focus</div>
                    <div class="theater-big">
                        <div>
                            <code>${this.escapeHtml(topIp)}</code>
                            <span class="badge ${topBadges.includes('THREAT_INTEL') ? 'b-red' : 'b-orange'}">${this.escapeHtml(topLevel || 'Unknown')}</span>
                        </div>
                        <div class="theater-muted">Score ${this.escapeHtml(topScore != null ? topScore : 'n/a')} · ${focusBadgesHtml}</div>
                    </div>
                    <div class="theater-muted" style="margin-top:10px;">Use <code>show evidence ${this.escapeHtml(topIp)}</code> for proof lines.</div>
                </div>
            `
            : `
                <div class="theater-card">
                    <div class="theater-card-title">Primary focus</div>
                    <div class="theater-muted">No top entity available for this run.</div>
                </div>
            `;

        const metricsHtml = `
            <div class="theater-metrics">
                <div class="theater-metric"><span class="label">Risky hosts</span><span class="value">${this.escapeHtml(riskyHosts)}</span></div>
                <div class="theater-metric"><span class="label">IOCs</span><span class="value">${this.escapeHtml(iocs)}</span></div>
                <div class="theater-metric"><span class="label">Allowlist</span><span class="value">${this.escapeHtml(allowlist)}</span></div>
                <div class="theater-metric"><span class="label">Flows</span><span class="value">${this.escapeHtml(flows != null ? flows : 'n/a')}</span></div>
                <div class="theater-metric"><span class="label">CloudTrail</span><span class="value">${this.escapeHtml(cloudtrail != null ? cloudtrail : 'n/a')}</span></div>
                <div class="theater-metric"><span class="label">Allow / Drop</span><span class="value">${this.escapeHtml(allow != null ? allow : 'n/a')} / ${this.escapeHtml(drop != null ? drop : 'n/a')}</span></div>
            </div>
        `;

        return `
            <div class="theater-slide">
                <div class="theater-kicker">Incident story (offline, deterministic)</div>
                <h2>Case snapshot</h2>
                <div class="theater-muted">
                    ${caseId ? `Case: <strong>${this.escapeHtml(this.core && typeof this.core.getActiveCaseName === 'function' ? this.core.getActiveCaseName() : 'Untitled Case')}</strong> <code style="font-size:0.78rem; opacity:0.5;">${this.escapeHtml(caseId)}</code> · ` : ''}${profile ? `Profile <strong>${this.escapeHtml(profile)}</strong> · ` : ''}Window: ${windowText}
                    ${signature ? ` · Signature <code>${this.escapeHtml(signature)}</code>` : ''}
                </div>
                ${metricsHtml}
                <div class="theater-grid">
                    ${focusHtml}
                    <div class="theater-card">
                        <div class="theater-card-title">Confirmed threat intel</div>
                        ${this.renderConfirmedThreatIntel(t.confirmedThreatIps)}
                    </div>
                </div>
            </div>
        `;
    }

    renderTriageSlide(triage) {
        const t = this.safeObject(triage);
        const rows = this.safeArray(t.topRisk).slice(0, 8);

        const tableRows = rows.map((r) => {
            const badges = this.safeArray(r && r.badges).map(x => String(x)).filter(Boolean);
            const badgeHtml = badges.slice(0, 4)
                .map((b) => `<span class="badge ${b === 'THREAT_INTEL' ? 'b-red' : 'b-blue'}">${this.escapeHtml(b)}</span>`)
                .join(' ');

            return `
                <tr>
                    <td class="text-xs" style="color:var(--text-muted)">${this.escapeHtml(r.rank || '')}</td>
                    <td><code>${this.escapeHtml(r.ip || '')}</code></td>
                    <td>${this.escapeHtml(r.level || '')}</td>
                    <td class="text-xs">${this.escapeHtml(Number.isFinite(r.score) ? r.score : '')}</td>
                    <td>${badgeHtml || `<span class="text-xs" style="color:var(--text-muted)">—</span>`}</td>
                </tr>
            `;
        }).join('');

        const rankedHtml = rows.length
            ? `
                <div class="table-wrap" style="margin-top:10px;">
                    <table class="stat-table">
                        <thead><tr><th>#</th><th>IP</th><th>Level</th><th>Score</th><th>Badges</th></tr></thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            `
            : `<div class="theater-muted">No ranked entities available. Run analysis first.</div>`;

        return `
            <div class="theater-slide">
                <div class="theater-kicker">What matters first</div>
                <h2>Triage</h2>
                <div class="theater-muted">Ranked top findings with proof-backed badges. Use <code>explain &lt;ip&gt;</code> for detail.</div>
                ${rankedHtml}
                <div class="theater-grid" style="margin-top:14px;">
                    <div class="theater-card">
                        <div class="theater-card-title">Confirmed threat intel (gated)</div>
                        ${this.renderConfirmedThreatIntel(t.confirmedThreatIps)}
                    </div>
                    <div class="theater-card">
                        <div class="theater-card-title">Suggested pivots</div>
                        <ul class="theater-list">
                            <li><code>show evidence &lt;ip&gt;</code> to view proof lines.</li>
                            <li><code>compare last</code> to highlight novelty.</li>
                            <li><code>investigate &lt;ip&gt;</code> for guided queries.</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    renderDiffSlide(diffArtifact) {
        const d = this.safeObject(diffArtifact);

        const renderBlock = (label, block) => {
            const b = this.safeObject(block);
            const diff = this.safeObject(b.diff);

            const sig = diff.environmentSignatureMatch;
            const sigBadge = (sig === true)
                ? `<span class="badge b-green">Signature match</span>`
                : (sig === false)
                    ? `<span class="badge b-orange">Signature mismatch</span>`
                    : `<span class="badge b-blue">Signature unknown</span>`;

            const newHosts = this.safeArray(diff.newHosts);
            const newDests = this.safeArray(diff.newDestinations);
            const rarePorts = this.safeArray(diff.rarePorts);
            const shifts = this.safeArray(diff.behaviorShifts);
            const risky = this.safeArray(diff.newRiskyEntities);

            const topRare = rarePorts.slice(0, 6).map((p) => {
                const port = p && p.port != null ? String(p.port) : '';
                const novelty = Number.isFinite(p && p.noveltyScore) ? p.noveltyScore : 0;
                return port
                    ? `<code>${this.escapeHtml(port)}</code> <span class="text-xs" style="color:var(--text-muted)">(${this.escapeHtml(novelty)})</span>`
                    : '';
            }).filter(Boolean).join(', ');

            const shiftLabels = shifts.slice(0, 4).map((s) => {
                const type = s && s.type ? String(s.type) : '';
                if (type === 'drop_rate_spike') return 'Drop rate spike';
                if (type === 'volume_spike') return 'Volume spike';
                if (type === 'peak_shift') return 'Peak shift';
                return type || 'Behavior shift';
            }).filter(Boolean);

            const riskyLines = risky.slice(0, 5).map((r) => {
                const ip = r && r.ip ? String(r.ip) : '';
                const level = r && r.level ? String(r.level) : '';
                return ip
                    ? `<li><code>${this.escapeHtml(ip)}</code> <span class="badge b-orange">${this.escapeHtml(level || 'Unknown')}</span></li>`
                    : '';
            }).filter(Boolean).join('');

            const empty = !newHosts.length && !newDests.length && !rarePorts.length && !shifts.length && !risky.length;

            return `
                <div class="theater-card">
                    <div class="theater-card-title">${this.escapeHtml(label)} ${sigBadge}</div>
                    ${empty ? `<div class="theater-muted">No diff data available (need prior snapshots for this case).</div>` : `
                        <div class="theater-muted">New hosts: <strong>${this.escapeHtml(newHosts.length)}</strong> · New destinations: <strong>${this.escapeHtml(newDests.length)}</strong></div>
                        ${topRare ? `<div style="margin-top:10px;"><strong>Rare ports:</strong> ${topRare}</div>` : ''}
                        ${shiftLabels.length ? `<div style="margin-top:10px;"><strong>Behavior shifts:</strong> ${this.escapeHtml(shiftLabels.join(', '))}</div>` : ''}
                        ${riskyLines ? `<div style="margin-top:10px;"><strong>New risky entities:</strong><ul class="theater-list">${riskyLines}</ul></div>` : ''}
                    `}
                </div>
            `;
        };

        const last = d.compareLast ? renderBlock('Compared to last run', d.compareLast) : '';
        const baseline = d.compareBaseline ? renderBlock('Compared to baseline', d.compareBaseline) : '';

        const content = (last || baseline)
            ? `<div class="theater-grid">${last}${baseline}</div>`
            : `<div class="theater-muted">Diff requires stored snapshots. Run analysis a few times in the same case to build a baseline.</div>`;

        return `
            <div class="theater-slide">
                <div class="theater-kicker">What changed</div>
                <h2>Diff</h2>
                <div class="theater-muted">Highlights novelty vs your case memory. Signature mismatch means “baseline may be from a different environment”.</div>
                ${content}
            </div>
        `;
    }

    renderHypothesisSlide(hypothesis, compareLabel) {
        const h = this.safeObject(hypothesis);
        const narratives = this.safeArray(h.narratives);
        const verdict = String(h.verdictLabel || 'UNKNOWN').toUpperCase();

        const badgeClass = verdict === 'CONFIRMED' ? 'b-green' : verdict === 'HYPOTHESIS' ? 'b-orange' : 'b-blue';

        const cards = narratives.length
            ? narratives.map((n) => {
                const title = n && n.title ? String(n.title) : 'Narrative';
                const summary = n && n.summary ? String(n.summary) : '';
                const support = this.safeArray(n && n.supportingEvidence).map(x => String(x)).filter(Boolean);
                const missing = this.safeArray(n && n.missing).map(x => String(x)).filter(Boolean);

                const supHtml = support.length
                    ? `<ul class="theater-list">${support.slice(0, 6).map(x => `<li>${this.escapeHtml(x)}</li>`).join('')}</ul>`
                    : `<div class="theater-muted">No supporting evidence entries.</div>`;

                const missHtml = missing.length
                    ? `<ul class="theater-list">${missing.slice(0, 6).map(x => `<li>${this.escapeHtml(x)}</li>`).join('')}</ul>`
                    : `<div class="theater-muted">No missing checks listed.</div>`;

                return `
                    <div class="theater-card">
                        <div class="theater-card-title">${this.escapeHtml(title)}</div>
                        <div class="theater-muted" style="margin-top:6px;">${this.escapeHtml(summary)}</div>
                        <div style="margin-top:12px;"><strong>Supporting evidence</strong>${supHtml}</div>
                        <div style="margin-top:12px;"><strong>Missing checks</strong>${missHtml}</div>
                    </div>
                `;
            }).join('')
            : `<div class="theater-muted">No hypothesis cards available yet. Ensure a run has a ranked risk list and (optionally) snapshots for diffs.</div>`;

        return `
            <div class="theater-slide">
                <div class="theater-kicker">Plausible narratives</div>
                <h2>Hypothesis <span class="badge ${badgeClass}">${this.escapeHtml(verdict)}</span></h2>
                <div class="theater-muted">Template-driven narratives from current stats + diff vs <strong>${this.escapeHtml(compareLabel || 'baseline')}</strong>. Any story beyond raw counts stays labeled.</div>
                <div class="theater-grid">${cards}</div>
            </div>
        `;
    }

    renderRemediationSlide(stats, triage) {
        const s = this.safeObject(stats);
        const t = this.safeObject(triage);
        const ips = this.safeArray(t.confirmedThreatIps).map(x => String(x)).filter(Boolean);

        if (typeof RemediationService === 'undefined' || !RemediationService || typeof RemediationService.generatePlans !== 'function') {
            return `
                <div class="theater-slide">
                    <div class="theater-kicker">Copy/paste only</div>
                    <h2>Remediation</h2>
                    <div class="theater-muted">RemediationService is unavailable in this build.</div>
                </div>
            `;
        }

        if (!ips.length) {
            const overrideId = `theater-remediate-override-${Date.now()}`;
            return `
                <div class="theater-slide">
                    <div class="theater-kicker">Copy/paste only</div>
                    <h2>Remediation (gated)</h2>
                    <div class="theater-card theater-warning">
                        <div class="theater-card-title">No confirmed threat intel</div>
                        <div class="theater-muted">This build only offers remediation plans for <code>CONFIRMED</code> threat-intel matches (<code>THREAT_INTEL</code>) to avoid risky suggestions.</div>
                        <ul class="theater-list" style="margin-top:10px;">
                            <li>Use <code>show evidence &lt;ip&gt;</code> to validate.</li>
                            <li>Use <code>investigate &lt;ip&gt;</code> for guided queries.</li>
                            <li>Then rerun <code>remediate &lt;ip&gt;</code> when <code>THREAT_INTEL</code> is present.</li>
                        </ul>
                        <div style="margin-top:14px;">
                            <button id="${overrideId}" class="btn btn-ghost" onclick="window.logAnalystApp.theaterMode._showRemediationOverride()">Show remediation anyway</button>
                        </div>
                    </div>
                </div>
            `;
        }

        const blocks = ips.slice(0, 5).map((ip, idx) => {
            const plans = RemediationService.generatePlans({ stats: s, state: { lastFocus: null, auto: false } }, ip);
            const list = this.safeArray(plans);
            if (!list.length) {
                return `
                    <div class="theater-card">
                        <div class="theater-card-title"><code>${this.escapeHtml(ip)}</code></div>
                        <div class="theater-muted">No plan available.</div>
                    </div>
                `;
            }

            return list.slice(0, 2).map((plan, pIdx) => {
                const title = plan && plan.title ? String(plan.title) : 'Plan';
                const risk = plan && plan.risk ? String(plan.risk) : 'UNKNOWN';
                const warnings = this.safeArray(plan && plan.warnings).map(x => String(x)).filter(Boolean);
                const commands = this.safeArray(plan && plan.commands).map(x => String(x)).filter(Boolean);
                const rollback = this.safeArray(plan && plan.rollbackCommands).map(x => String(x)).filter(Boolean);

                const cmdId = `theater-remediate-${idx}-${pIdx}-cmd`;
                const rbId = `theater-remediate-${idx}-${pIdx}-rb`;

                const cmdText = commands.join('\n');
                const rbText = rollback.join('\n');

                const warningsHtml = warnings.length
                    ? `<div style="margin-top:10px;"><strong>Warnings</strong><ul class="theater-list">${warnings.slice(0, 6).map(w => `<li>${this.escapeHtml(w)}</li>`).join('')}</ul></div>`
                    : '';

                return `
                    <div class="theater-card">
                        <div class="theater-card-title">
                            <code>${this.escapeHtml(ip)}</code> · ${this.escapeHtml(title)}
                            <span class="badge b-orange">${this.escapeHtml(risk)}</span>
                        </div>
                        <div class="theater-muted">Nothing is executed automatically; commands are copy/paste only.</div>
                        ${warningsHtml}
                        <div style="margin-top:12px;display:flex;flex-direction:column;gap:14px;">
                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;">
                                    <strong>Commands</strong>
                                    <button class="btn btn-ghost" onclick="UIUtils.copyFromElementId('${this.escapeHtml(cmdId)}', this)">Copy</button>
                                </div>
                                <pre id="${this.escapeHtml(cmdId)}" class="theater-pre"><code>${this.escapeHtml(cmdText)}</code></pre>
                            </div>
                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;">
                                    <strong>Rollback</strong>
                                    <button class="btn btn-ghost" onclick="UIUtils.copyFromElementId('${this.escapeHtml(rbId)}', this)">Copy</button>
                                </div>
                                <pre id="${this.escapeHtml(rbId)}" class="theater-pre"><code>${this.escapeHtml(rbText)}</code></pre>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }).join('');

        return `
            <div class="theater-slide">
                <div class="theater-kicker">Copy/paste only</div>
                <h2>Remediation</h2>
                <div class="theater-muted">Plans are provided for confirmed <code>THREAT_INTEL</code> targets only. Review and use change control.</div>
                <div style="display:flex;flex-direction:column;gap:16px;margin-top:14px;">${blocks}</div>
            </div>
        `;
    }

    _showRemediationOverride() {
        const stats = this.core && typeof this.core.getStats === 'function' ? this.core.getStats() : null;
        const triage = this.buildFallbackTriage(stats, { caseId: null, profile: null, iocs: [], allowlist: [] }, new Date().toISOString());
        const riskyIps = (triage.topRisk || []).slice(0, 3).map(r => r.ip).filter(Boolean);
        if (!riskyIps.length) {
            const contentEl = document.getElementById('theaterSlideContent');
            if (contentEl) contentEl.innerHTML = '<div class="theater-muted">No risky hosts available for remediation.</div>';
            return;
        }
        const overriddenTriage = { ...triage, confirmedThreatIps: riskyIps };
        const contentEl = document.getElementById('theaterSlideContent');
        if (contentEl) contentEl.innerHTML = this.renderRemediationSlide(stats, overriddenTriage);
    }
}

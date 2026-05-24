/* Evidence bundle generation utilities */
import { ZipWriter } from './ZipWriter.js';
import { CaseSnapshot } from './CaseSnapshot.js';
import { BaselineEngine } from './BaselineEngine.js';
import { RemediationService } from './RemediationService.js';
import { AgentRenderer } from './AgentRenderer.js';

export class EvidenceGenerator {
    static async sha256(content) {
        const buf = typeof content === 'string' ? new TextEncoder().encode(content) : content;
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    static async normalizeInputs(inputs) {
        const normalized = [];
        const snapshot = Array.isArray(inputs) ? inputs.slice() : [];

        for (const input of snapshot) {
            let bytes = input.rawBytes || null;

            if (bytes && !(bytes instanceof Uint8Array)) {
                try { bytes = new Uint8Array(bytes); } catch { bytes = null; }
            }

            if (!bytes) {
                const blob = input.file || input.blob || null;
                if (blob && blob.arrayBuffer) {
                    try {
                        bytes = new Uint8Array(await blob.arrayBuffer());
                    } catch {
                        bytes = null;
                    }
                }
            }

            let hash = input.hash || null;
            if (!hash && bytes) {
                hash = await EvidenceGenerator.sha256(bytes);
            }

            normalized.push({ ...input, _bytes: bytes, hash });
        }

        return normalized;
    }

    static async hmacSha256(key, content) {
        const enc = new TextEncoder();
        const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", k, enc.encode(content));
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    static safeString(value) {
        return typeof value === 'string' ? value : (value === null || value === undefined ? '' : String(value));
    }

    static safeArray(value) {
        return Array.isArray(value) ? value : [];
    }

    static safeObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    static getConfirmedThreatIps(stats) {
        const risk = EvidenceGenerator.safeArray(stats && stats.risk);
        const ips = risk
            .map(r => (r && typeof r.ip === 'string') ? r.ip.trim() : '')
            .filter(Boolean);

        const confirmed = [];
        for (const r of risk) {
            const ip = (r && typeof r.ip === 'string') ? r.ip.trim() : '';
            if (!ip) continue;
            const badges = EvidenceGenerator.safeArray(r && r.badges).map(x => EvidenceGenerator.safeString(x));
            if (badges.includes('THREAT_INTEL')) confirmed.push(ip);
        }

        return Array.from(new Set(confirmed)).sort((a, b) => a.localeCompare(b));
    }

    static buildTriageArtifact(stats, ctx, ts) {
        const risk = EvidenceGenerator.safeArray(stats && stats.risk);
        const focus = EvidenceGenerator.safeObject(stats && stats.focus);
        const caseId = (ctx && ctx.caseId != null) ? String(ctx.caseId) : null;
        const profile = (ctx && ctx.profile != null) ? String(ctx.profile) : null;
        const iocs = EvidenceGenerator.safeArray(ctx && ctx.iocs);
        const allowlist = EvidenceGenerator.safeArray(ctx && ctx.allowlist);

        const topRisk = risk.slice(0, 15).map((r, idx) => {
            const ip = r && r.ip != null ? String(r.ip) : '';
            const f = ip && focus[ip] ? focus[ip] : null;
            return {
                rank: idx + 1,
                ip,
                level: r && r.level != null ? String(r.level) : 'Unknown',
                score: (r && Number.isFinite(r.score)) ? r.score : 0,
                badges: EvidenceGenerator.safeArray(r && r.badges).map(x => EvidenceGenerator.safeString(x)),
                drops: (r && Number.isFinite(r.drops)) ? r.drops : 0,
                allows: (r && Number.isFinite(r.allows)) ? r.allows : 0,
                portCount: (r && Number.isFinite(r.portCount)) ? r.portCount : 0,
                outboundDests: (r && Number.isFinite(r.outboundDests)) ? r.outboundDests : 0,
                outboundDrops: (r && Number.isFinite(r.outboundDrops)) ? r.outboundDrops : 0,
                role: (f && f.role != null) ? String(f.role) : (r && r.role != null ? String(r.role) : null)
            };
        });

        const lastFocus = (ctx && ctx.core && ctx.core.agentLastFocus != null) ? String(ctx.core.agentLastFocus) : (ctx && ctx.lastFocus != null ? String(ctx.lastFocus) : null);

        return {
            tool: 'VulcansTrace V1',
            generated: ts,
            caseId,
            profile,
            lastFocus: lastFocus || null,
            counts: {
                totalRiskyHosts: risk.length,
                iocs: iocs.length,
                allowlist: allowlist.length
            },
            confirmedThreatIps: EvidenceGenerator.getConfirmedThreatIps(stats),
            topRisk
        };
    }

    static snapshotKey(snapshot) {
        const s = EvidenceGenerator.safeObject(snapshot);
        const tw = EvidenceGenerator.safeObject(s.timeWindow);
        const totals = EvidenceGenerator.safeObject(s.totals);
        // Normalize null/undefined to 0 for numeric totals so key matching works
        // regardless of whether the snapshot was built with explicit 0 or missing field
        const numStr = (v) => {
            const n = Number.isFinite(v) ? v : 0;
            return String(n);
        };
        return [
            EvidenceGenerator.safeString(s.environmentSignature),
            EvidenceGenerator.safeString(tw.earliest),
            EvidenceGenerator.safeString(tw.latest),
            numStr(totals.flows),
            numStr(totals.cloudtrail)
        ].join('|');
    }

    static selectLastSnapshot(snapshotCache, currentSnapshot) {
        const list = EvidenceGenerator.safeArray(snapshotCache).filter(s => s && typeof s === 'object');
        if (!list.length) return { currentInCache: false, lastSnapshot: null, baselineCandidates: [] };

        const currentKey = EvidenceGenerator.snapshotKey(currentSnapshot);
        const firstKey = EvidenceGenerator.snapshotKey(list[0]);

        const currentInCache = currentKey && firstKey && currentKey === firstKey;
        const lastSnapshot = currentInCache ? (list[1] || null) : (list[0] || null);
        const baselineCandidates = currentInCache ? list.slice(1) : list.slice(0);
        return { currentInCache, lastSnapshot, baselineCandidates };
    }

    static buildDiffArtifact(stats, topology, ctx, ts) {
        const caseId = (ctx && ctx.caseId != null) ? String(ctx.caseId) : null;
        const profile = (ctx && ctx.profile != null) ? String(ctx.profile) : null;

        const core = ctx && ctx.core ? ctx.core : null;
        const snapshotCache = core && typeof core.getSnapshotCache === 'function'
            ? core.getSnapshotCache()
            : EvidenceGenerator.safeArray(ctx && ctx.snapshots);

        const totals = EvidenceGenerator.safeObject(ctx && ctx.totals);
        const canSnapshot = !!(CaseSnapshot?.buildSnapshot);
        const canDiff = !!(BaselineEngine?.buildBaseline && BaselineEngine?.diff);

        let currentSnapshot = canSnapshot
            ? CaseSnapshot.buildSnapshot({ caseId, stats, profile, topology, totals, createdAt: ts })
            : null;

        // Prefer the cached snapshot over a rebuilt one — cached snapshots include
        // noveltySeeds, portUsage, topRiskyEntities etc. that are lost when totals
        // is a minimal { flows, cloudtrail } object passed from TheaterMode.
        if (currentSnapshot && snapshotCache && Array.isArray(snapshotCache) && snapshotCache.length) {
            const curKey = EvidenceGenerator.snapshotKey(currentSnapshot);
            const cached = snapshotCache[0];
            if (cached && EvidenceGenerator.snapshotKey(cached) === curKey) {
                currentSnapshot = cached;
            }
        }

        if (!currentSnapshot || !canDiff) {
            return {
                tool: 'VulcansTrace V1',
                generated: ts,
                caseId,
                profile,
                snapshotSupport: { canSnapshot, canDiff },
                compareLast: null,
                compareBaseline: null
            };
        }

        const sel = EvidenceGenerator.selectLastSnapshot(snapshotCache, currentSnapshot);
        const lastSnapshot = sel.lastSnapshot;

        let compareLast = null;
        if (lastSnapshot) {
            const baseLast = BaselineEngine.buildBaseline([lastSnapshot]);
            const diffLast = BaselineEngine.diff(baseLast, currentSnapshot);
            compareLast = {
                lastSnapshot: {
                    id: lastSnapshot.id || null,
                    createdAt: lastSnapshot.createdAt || null,
                    environmentSignature: lastSnapshot.environmentSignature || null
                },
                diff: diffLast
            };
        }

        const baselinePool = EvidenceGenerator.safeArray(sel.baselineCandidates).filter(s => s && typeof s === 'object');
        const baselineCount = Math.max(0, Math.min(25, baselinePool.length));
        const baselineList = baselinePool.slice(0, baselineCount);
        const base = baselineList.length ? BaselineEngine.buildBaseline(baselineList) : null;
        const compareBaseline = base
            ? { baselineCount: baselineList.length, diff: BaselineEngine.diff(base, currentSnapshot) }
            : null;

        return {
            tool: 'VulcansTrace V1',
            generated: ts,
            caseId,
            profile,
            snapshotSupport: { canSnapshot, canDiff },
            compareLast,
            compareBaseline
        };
    }

    static async buildAgentLogArtifact(ctx, ts) {
        const caseId = (ctx && ctx.caseId != null) ? String(ctx.caseId) : null;
        const core = ctx && ctx.core ? ctx.core : null;
        const transcriptRows = core && typeof core.listTranscript === 'function'
            ? await core.listTranscript(5000)
            : EvidenceGenerator.safeArray(ctx && ctx.transcript);

        const meta = {
            type: 'meta',
            tool: 'VulcansTrace V1',
            generated: ts,
            caseId
        };

        const lines = [JSON.stringify(meta)];
        for (const row of EvidenceGenerator.safeArray(transcriptRows)) {
            const r = EvidenceGenerator.safeObject(row);
            const entry = {
                type: EvidenceGenerator.safeString(r.type || 'agent_exchange'),
                createdAt: EvidenceGenerator.safeString(r.createdAt),
                userText: EvidenceGenerator.safeString(r.userText),
                parsedIntent: EvidenceGenerator.safeString(r.parsedIntent),
                parsedArgs: EvidenceGenerator.safeObject(r.parsedArgs),
                verdictLabel: EvidenceGenerator.safeString(r.verdictLabel),
                evidenceRefCount: Number.isFinite(r.evidenceRefCount) ? r.evidenceRefCount : 0
            };
            lines.push(JSON.stringify(entry));
        }

        return lines.join('\n') + '\n';
    }

    static buildRemediationPs1(stats, ctx, ts) {
        const caseId = (ctx && ctx.caseId != null) ? String(ctx.caseId) : '';
        const profile = (ctx && ctx.profile != null) ? String(ctx.profile) : '';
        const ips = EvidenceGenerator.getConfirmedThreatIps(stats);

        const header = [
            '# VulcansTrace remediation plans (copy/paste only)',
            '# WARNING: Review carefully before applying any change.',
            '# This file is exported for evidence and change-control planning; it does not auto-execute.',
            `# Generated: ${ts}`,
            caseId ? `# Case: ${caseId}` : '# Case: (none)',
            profile ? `# Profile: ${profile}` : '# Profile: (unknown)',
            ''
        ].join('\n');

        if (!RemediationService?.generatePlans) {
            return header + '# RemediationService unavailable in this build.\n';
        }

        if (!ips.length) {
            return header + '# No THREAT_INTEL confirmed targets found in this run.\n';
        }

        const ctxForPlans = {
            stats,
            profile: ctx && ctx.profile ? ctx.profile : null,
            state: { lastFocus: null, auto: false }
        };

        const blocks = [];
        for (const ip of ips) {
            const plans = RemediationService.generatePlans(ctxForPlans, ip);
            const windowsPlan = EvidenceGenerator.safeArray(plans).find(p => String(p && p.title || '').toLowerCase().includes('windows')) || null;
            const title = windowsPlan && windowsPlan.title ? String(windowsPlan.title) : 'Windows (PowerShell)';
            const risk = windowsPlan && windowsPlan.risk ? String(windowsPlan.risk) : 'UNKNOWN';
            const warnings = EvidenceGenerator.safeArray(windowsPlan && windowsPlan.warnings).map(x => EvidenceGenerator.safeString(x)).filter(Boolean);
            const commands = EvidenceGenerator.safeArray(windowsPlan && windowsPlan.commands).map(x => EvidenceGenerator.safeString(x)).filter(Boolean);
            const rollback = EvidenceGenerator.safeArray(windowsPlan && windowsPlan.rollbackCommands).map(x => EvidenceGenerator.safeString(x)).filter(Boolean);

            const section = [
                `# --- Target: ${ip} ---`,
                `# Plan: ${title}`,
                `# Risk: ${risk}`,
                warnings.length ? `# Warnings:` : '# Warnings: (none)',
                ...warnings.map(w => `# - ${w}`),
                '',
                '# Commands (copy/paste):',
                ...commands.map(c => `# ${c}`),
                '',
                '# Rollback (copy/paste):',
                ...rollback.map(c => `# ${c}`),
                ''
            ].join('\n');
            blocks.push(section);
        }

        return header + blocks.join('\n');
    }

    static async genEvidence(DB, STATS, TOPOLOGY, key, analyst, notes, callback, zipWriter = null, skipDownload = false, context = null) {
        callback(`<div style="color:var(--accent-blue)">Generating Fleet Bundle (ZIP)...</div>`);

        const inputs = await EvidenceGenerator.normalizeInputs(DB.inputs);
        const combinedHash = await EvidenceGenerator.sha256(inputs.map(i => i.hash || '').join(''));
        const prefix = combinedHash.substring(0, 8);
        const ts = new Date().toISOString();
        const zip = zipWriter || new ZipWriter();
        const ctx = context || {};
        const jsonReplacer = (key, value) => {
            if (typeof value === 'bigint') return value.toString();
            if (value instanceof Set) return Array.from(value);
            return value;
        };

        const env = {
            analyst: analyst || "Unknown",
            notes: notes || "",
            userAgent: navigator.userAgent,
            timeZone: "UTC (Enforced)",
            screen: `${window.screen.width}x${window.screen.height}`,
            language: navigator.language
        };

        // Add input files
        const includedInputs = [];
        for (const input of inputs) {
            if (!input._bytes) continue;
            zip.add(`input/${input.name}`, input._bytes);
            includedInputs.push(input);
        }

        // Add topology
        const topStr = JSON.stringify(TOPOLOGY, null, 2);
        zip.add('topology.json', topStr);

        // Add analysis
        const dbExport = {
            inputs: inputs.map(i => ({ name: i.name, hash: i.hash })),
            total: DB.total
        };

        const jsonStr = JSON.stringify({
            meta: {
                tool: "VulcansTrace V1",
                ts,
                startTime: DB.startTime,
                env
            },
            stats: STATS,
            db: dbExport
        }, jsonReplacer, 2);

        zip.add(`analysis_${prefix}.json`, jsonStr);

        // Add HTML report
        const styleTexts = [];
        if (typeof document !== 'undefined' && document.styleSheets) {
            for (const sheet of Array.from(document.styleSheets)) {
                try {
                    const rules = Array.from(sheet.cssRules || []).map(r => r.cssText).join('\n');
                    if (rules) styleTexts.push(rules);
                } catch (e) {
                    // Cross-origin stylesheets may throw; skip them
                }
            }
        }
        const allStyles = styleTexts.join('\n').replace(/<\/style>/gi, '\\3c/style\\3e');
        const chatEl = typeof document !== 'undefined' ? document.getElementById('chat') : null;
        const chatHtml = chatEl ? AgentRenderer.sanitizeBodyHtml(chatEl.innerHTML) : '';
        const reportContent = `<html><head><title>Report ${prefix}</title><style>${allStyles}</style></head><body style="padding:20px;overflow:auto;"><h2>Forensic Report: ${prefix}</h2><div class="hash-box">Case Hash: ${combinedHash}</div><div class="stat-box" style="text-align:left;margin-bottom:10px"><div style="font-weight:bold">Analyst: ${this.escapeHtml(env.analyst)}</div><div style="font-size:0.8rem;color:#aaa">${this.escapeHtml(env.notes)}</div></div>${chatHtml}</body></html>`;
        zip.add(`report_${prefix}.html`, reportContent);

        // Add last query results (if any)
        const lastQueryPayload = ctx && ctx.lastQueryExecution ? ctx.lastQueryExecution : null;
        const lastQueryStr = JSON.stringify({
            tool: "VulcansTrace V1",
            ts,
            caseId: ctx.caseId || null,
            lastQueryExecution: lastQueryPayload || null
        }, jsonReplacer, 2);
        zip.add('queries/last_query_results.json', lastQueryStr);

        // Agent artifacts (Task 20)
        const triageStr = JSON.stringify(EvidenceGenerator.buildTriageArtifact(STATS, ctx, ts), jsonReplacer, 2);
        zip.add('triage.json', triageStr);

        const diffStr = JSON.stringify(EvidenceGenerator.buildDiffArtifact(STATS, TOPOLOGY, ctx, ts), jsonReplacer, 2);
        zip.add('diff.json', diffStr);

        const agentLogStr = await EvidenceGenerator.buildAgentLogArtifact(ctx, ts);
        zip.add('agent.log.jsonl', agentLogStr);

        const remediationPs1 = EvidenceGenerator.buildRemediationPs1(STATS, ctx, ts);
        zip.add('remediation.ps1', remediationPs1);

        // Calculate hashes
        const jHash = await EvidenceGenerator.sha256(jsonStr);
        const hHash = await EvidenceGenerator.sha256(reportContent);
        const tHash = await EvidenceGenerator.sha256(topStr);
        const qHash = await EvidenceGenerator.sha256(lastQueryStr);
        const triageHash = await EvidenceGenerator.sha256(triageStr);
        const diffHash = await EvidenceGenerator.sha256(diffStr);
        const agentLogHash = await EvidenceGenerator.sha256(agentLogStr);
        const remediationHash = await EvidenceGenerator.sha256(remediationPs1);

        // Create manifest
        const manifest = {
            tool: "VulcansTrace V1",
            generated: ts,
            case_start: DB.startTime,
            environment: env,
            inputs: inputs.map(i => ({ name: i.name, sha256: i.hash })),
            artifacts: [
                { name: `analysis_${prefix}.json`, sha256: jHash },
                { name: `report_${prefix}.html`, sha256: hHash },
                { name: 'topology.json', sha256: tHash },
                { name: 'queries/last_query_results.json', sha256: qHash },
                { name: 'triage.json', sha256: triageHash },
                { name: 'diff.json', sha256: diffHash },
                { name: 'agent.log.jsonl', sha256: agentLogHash },
                { name: 'remediation.ps1', sha256: remediationHash }
            ]
        };

        const manStr = JSON.stringify(manifest, jsonReplacer, 2);
        zip.add('manifest.json', manStr);

        // Case manifest (Task 14)
        const caseManifest = {
            tool: "VulcansTrace V1",
            generated: ts,
            caseId: ctx.caseId || null,
            case: ctx.case || null,
            profile: ctx.profile || null,
            iocs: Array.isArray(ctx.iocs) ? ctx.iocs : [],
            totals: ctx.totals || null,
            environment: env,
            datasets: inputs.map(i => ({
                id: i.id || null,
                caseId: i.caseId || null,
                name: i.name,
                size: i.size || 0,
                lastModified: i.lastModified || null,
                kind: i.kind || 'flows',
                sha256: i.hash || null
            })),
            savedQueries: Array.isArray(ctx.savedQueries)
                ? ctx.savedQueries.map(q => ({
                    id: q.id || null,
                    name: q.name || null,
                    createdAt: q.createdAt || null,
                    updatedAt: q.updatedAt || null
                }))
                : []
        };

        const caseManStr = JSON.stringify(caseManifest, jsonReplacer, 2);
        zip.add('case/manifest.json', caseManStr);

        const caseManHash = await EvidenceGenerator.sha256(caseManStr);

        // Add signature if key provided
        let sigStatus = "Unsigned";
        if (key) {
            const sig = await EvidenceGenerator.hmacSha256(key, manStr);
            zip.add('manifest.sig', sig);
            const caseSig = await EvidenceGenerator.hmacSha256(key, caseManStr);
            zip.add('case/manifest.sig', caseSig);
            sigStatus = "HMAC-SHA256 Signed";
        }

        // Add checksums
        const mHash = await EvidenceGenerator.sha256(manStr);
        let checkStr = `${mHash}  manifest.json\n${caseManHash}  case/manifest.json\n${jHash}  analysis_${prefix}.json\n${hHash}  report_${prefix}.html\n${tHash}  topology.json\n${qHash}  queries/last_query_results.json\n${triageHash}  triage.json\n${diffHash}  diff.json\n${agentLogHash}  agent.log.jsonl\n${remediationHash}  remediation.ps1\n`;
        includedInputs.forEach(i => checkStr += `${i.hash}  input/${i.name}\n`);
        zip.add('checksums.txt', checkStr);

        if (!skipDownload) {
            // Generate and download ZIP
            const blob = await zip.generate();
            const url = URL.createObjectURL(blob);
            const name = `evidence_case_${prefix}.zip`;

            callback(`<div class="evidence-list"><div class="evidence-item" style="color:var(--accent-green)"><strong>${sigStatus.toUpperCase()} BUNDLE</strong></div><div class="evidence-item"><span>Evidence ZIP</span><a href="${url}" download="${name}" class="file-link"><svg class="icon"><use href="#i-zip"></use></svg> ${name}</a></div></div>`);
        }
    }

    static escapeHtml(s) {
        return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
}

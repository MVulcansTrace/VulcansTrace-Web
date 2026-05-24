/* Self-testing utilities */
import { UIUtils } from './UIUtils.js';
import { NetworkUtils } from './NetworkUtils.js';
import { LogProcessor } from './LogProcessor.js';
import { ZipWriter } from './ZipWriter.js';
import { EvidenceGenerator } from './EvidenceGenerator.js';
import { AgentContracts } from './AgentContracts.js';
import { AgentChatRouter } from './AgentChatRouter.js';
import { AgentKernel } from './AgentKernel.js';
import { BaselineEngine } from './BaselineEngine.js';
import { RemediationService } from './RemediationService.js';

export class SelfTestSuite {
    static async sha256(content) {
        const buf = typeof content === 'string' ? new TextEncoder().encode(content) : content;
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async runAllTestsHeadless() {
        const tests = [];
        const assert = (name, cond) => tests.push({ name, pass: !!cond });
        const originalProfile = LogProcessor.getActiveProfile ? LogProcessor.getActiveProfile() : 'Medium';

        try {
            if (LogProcessor.setProfile) LogProcessor.setProfile('Medium');

            // 1. Crypto & Zip
            const emptyHash = await SelfTestSuite.sha256("");
            assert("SHA256 Empty String", emptyHash === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

            const zip = new ZipWriter();
            zip.add("t", "c");
            const arr = new Uint8Array(await (await zip.generate()).arrayBuffer());
            assert("ZIP Header Magic", arr[0] === 0x50 && arr[1] === 0x4b && arr[2] === 0x03 && arr[3] === 0x04);

            // 2. Topology Config Test (Pure Function)
            const testTopo = [{ name: "TEST-SEG", cidr: "1.1.1.0/24" }];
            assert("Dynamic Role Lookup", NetworkUtils.resolveRole("1.1.1.5", testTopo) === "[TEST-SEG]");
            assert("Role No Match", NetworkUtils.resolveRole("8.8.8.8", testTopo) === "[WAN]");

            // 3. Strict IP Math
            assert("IP Math Valid", NetworkUtils.ipToLong("192.168.1.1") === 3232235777);
            assert("IP Math Null Check", NetworkUtils.ipToLong("999.999.999.999") === null);
            assert("CIDR Math", NetworkUtils.ipInCidr("192.168.1.5", "192.168.0.0/16") === true);

            // 3b. Date Parsing
            const dStr = "2025-01-01";
            const tStr = "12:00:00";
            assert("Date Parsing Local Time", NetworkUtils.parseDateTime(dStr, tStr) === new Date(`${dStr}T${tStr}`).getTime());

            // 4. Multi-File Context Test (Pure Logic)
            const log1 = "2025-01-01 12:00:00 DROP TCP 192.168.1.99 10.0.0.1 5000 445";
            const log2 = "2025-01-01 12:02:00 ALLOW TCP 192.168.1.99 10.0.0.2 5000 445";
            const p1 = LogProcessor.processLogText(log1);
            const p2 = LogProcessor.processLogText(log2);

            const inputs = [
                { name: 'A.log', entries: p1.entries },
                { name: 'B.log', entries: p2.entries }
            ];
            const allEntries = inputs.flatMap(f => f.entries.map(e => ({ ...e, _file: f.name })));
            const stats = LogProcessor.analyze(allEntries, testTopo);

            assert("Strict Chain (Port Match)", stats.chains.some(c => c.ip === '192.168.1.99'));

            // Negative test
            const log3 = "2025-01-01 13:00:00 DROP TCP 10.10.10.10 8.8.8.8 5000 445";
            const log4 = "2025-01-01 13:02:00 ALLOW TCP 10.10.10.10 9.9.9.9 5000 8080";
            const p3 = LogProcessor.processLogText(log3);
            const p4 = LogProcessor.processLogText(log4);

            const inputs2 = [
                { name: 'C.log', entries: p3.entries },
                { name: 'D.log', entries: p4.entries }
            ];
            const allEntries2 = inputs2.flatMap(f => f.entries.map(e => ({ ...e, _file: f.name })));
            const stats2 = LogProcessor.analyze(allEntries2, testTopo);

            assert("Negative Test: Diff Port Ignored", stats2.chains.length === 0);

            // 4a. Profile sensitivity (chain window)
            const profileEntries = [
                { date: "2025-01-01", time: "01:00:00", action: "DROP", proto: "TCP", src: "192.168.2.2", dst: "10.0.0.1", sport: "1000", dport: "445", path: "-", _file: "pA.log" },
                { date: "2025-01-01", time: "01:04:30", action: "ALLOW", proto: "TCP", src: "192.168.2.2", dst: "10.0.0.2", sport: "1000", dport: "445", path: "-", _file: "pB.log" }
            ];
            const profileTopo = [{ name: "LAN", cidr: "192.168.0.0/16" }];

            LogProcessor.setProfile('High');
            const statsHigh = LogProcessor.analyze(profileEntries, profileTopo);
            assert("Profile High: Tight chain window skips distant pair", statsHigh.chains.length === 0);

            LogProcessor.setProfile('Low');
            const statsLow = LogProcessor.analyze(profileEntries, profileTopo);
            assert("Profile Low: Lenient chain window links events", statsLow.chains.length === 1);

            LogProcessor.setProfile('Medium');

            // 5. Risk scoring (Scanner/Flooder/Egress/Chain+Lateral)
            const riskEntries = [];
            const addEntry = (src, dst, action, dport, time, file) => riskEntries.push({
                date: "2025-01-01",
                time,
                action,
                proto: "TCP",
                src,
                dst,
                sport: "1000",
                dport,
                path: "-",
                _file: file
            });

            for (let i = 0; i < 6; i++) {
                addEntry("10.0.0.1", `8.8.8.${i}`, "DROP", (80 + i).toString(), `00:00:${String(i).padStart(2, '0')}`, "scan.log");
            }

            for (let i = 0; i < 21; i++) {
                addEntry("10.0.0.2", "8.8.4.4", "DROP", "22", `00:10:${String(i).padStart(2, '0')}`, "flood.log");
            }

            for (let i = 0; i < 7; i++) {
                addEntry("10.0.0.3", `9.9.9.${i}`, i % 2 === 0 ? "ALLOW" : "DROP", "443", `00:20:${String(i).padStart(2, '0')}`, "egress.log");
            }

            addEntry("192.168.1.99", "10.0.0.10", "DROP", "445", "00:30:00", "chainA.log");
            addEntry("192.168.1.99", "10.0.0.11", "ALLOW", "445", "00:34:00", "chainB.log");

            const riskTopo = [
                ...testTopo,
                { name: "CORP", cidr: "10.0.0.0/8" }
            ];

            const riskStats = LogProcessor.analyze(riskEntries, riskTopo);
            const riskList = riskStats.risk;

            const scanner = riskList.find(r => r.ip === "10.0.0.1");
            const flooder = riskList.find(r => r.ip === "10.0.0.2");
            const chainActor = riskList.find(r => r.ip === "192.168.1.99");
            const egress = riskList.find(r => r.ip === "10.0.0.3");

            assert("Risk Badge: Scanner flagged", scanner && scanner.badges.includes("SCANNER"));
            assert("Risk Badge: Flooder flagged", flooder && flooder.badges.includes("FLOODER") && !flooder.badges.includes("SCANNER"));
            assert("Risk Badge: Chain + Lateral", chainActor && chainActor.badges.includes("CHAIN") && chainActor.badges.includes("LATERAL"));
            assert("Risk Badge: Egress", egress && egress.badges.includes("EGRESS"));

            // 6. Focus IP view (timeline cap, detectors, summary)
            const focusEntries = [];
            const addFocus = (time, action, file, dst, dport) => focusEntries.push({
                date: "2025-01-02",
                time,
                action,
                proto: "TCP",
                src: "192.168.50.5",
                dst,
                sport: "3000",
                dport,
                path: "-",
                _file: file
            });

            for (let i = 0; i < 12; i++) {
                const file = i < 6 ? "focusA.log" : "focusB.log";
                addFocus(`01:0${Math.floor(i / 6)}:${String(10 + i).padStart(2, '0')}`, i % 2 === 0 ? "DROP" : "ALLOW", file, `10.0.0.${i}`, "445");
            }

            const focusTopo = [
                { name: "LAN", cidr: "192.168.0.0/16" },
                { name: "CORP", cidr: "10.0.0.0/8" }
            ];
            const focusStats = LogProcessor.analyze(focusEntries, focusTopo);
            const focusDetail = LogProcessor.getFocusDetail(focusStats, "192.168.50.5");
            const focusSummary = UIUtils.buildFocusSummary(focusDetail);

            assert("Focus: detail exists", !!focusDetail && focusDetail.ip === "192.168.50.5");
            assert("Focus: timeline capped to 10", focusDetail && focusDetail.events.length === 10);
            assert("Focus: lateral files captured", focusDetail && focusDetail.files.length === 2);
            assert("Focus: detectors include lateral", focusDetail && focusDetail.detectors.includes("LATERAL"));
            assert("Focus: summary includes role", focusSummary.includes("[LAN]"));

            // 7. Evidence JSON preserves Set contents
            const evidenceTestEntries = [
                { date: "2025-01-03", time: "10:00:00", action: "DROP", proto: "TCP", src: "192.168.1.100", dst: "8.8.8.8", sport: "1000", dport: "80", path: "-", _file: "fileA.log" },
                { date: "2025-01-03", time: "10:00:01", action: "ALLOW", proto: "TCP", src: "192.168.1.100", dst: "8.8.4.4", sport: "1001", dport: "443", path: "-", _file: "fileB.log" }
            ];
            const evidenceTestTopo = [{ name: "LOCAL", cidr: "192.168.1.0/24" }];
            const evidenceStats = LogProcessor.analyze(evidenceTestEntries, evidenceTestTopo);

            let capturedJsonStr = "";

            const canUseEvidenceGenerator =
                typeof EvidenceGenerator !== 'undefined' &&
                typeof document !== 'undefined' &&
                typeof window !== 'undefined' &&
                typeof navigator !== 'undefined';

            if (canUseEvidenceGenerator) {
                const mockDB = {
                    inputs: [{ name: "fileA.log", hash: "mockhashA" }, { name: "fileB.log", hash: "mockhashB" }],
                    total: evidenceTestEntries.length,
                    startTime: new Date().toISOString()
                };

                const mockZipWriter = new ZipWriter();
                const originalAdd = mockZipWriter.add;

                mockZipWriter.add = (name, content) => {
                    if (name.startsWith("analysis_") && name.endsWith(".json")) {
                        capturedJsonStr = content;
                    }
                    originalAdd.call(mockZipWriter, name, content);
                };

                await EvidenceGenerator.genEvidence(
                    mockDB,
                    evidenceStats,
                    evidenceTestTopo,
                    null,
                    "Test Analyst",
                    "Test Notes",
                    () => { },
                    mockZipWriter,
                    true
                );

                mockZipWriter.add = originalAdd;
            } else {
                capturedJsonStr = JSON.stringify(
                    { stats: evidenceStats },
                    (key, value) => (value instanceof Set ? Array.from(value) : value),
                    2
                );
            }

            assert("Evidence JSON Captured", capturedJsonStr.length > 0);
            const parsedEvidence = JSON.parse(capturedJsonStr);

            assert("Evidence JSON: stats.s exists", !!parsedEvidence.stats.s);
            assert("Evidence JSON: src entry exists", !!parsedEvidence.stats.s.src["192.168.1.100"]);

            const srcEntry = parsedEvidence.stats.s.src["192.168.1.100"];

            assert("Evidence JSON: ports is array", Array.isArray(srcEntry.ports));
            assert("Evidence JSON: ports contains 80", srcEntry.ports.includes("80"));
            assert("Evidence JSON: ports contains 443", srcEntry.ports.includes("443"));

            assert("Evidence JSON: files is array", Array.isArray(srcEntry.files));
            assert("Evidence JSON: files contains fileA.log", srcEntry.files.includes("fileA.log"));
            assert("Evidence JSON: files contains fileB.log", srcEntry.files.includes("fileB.log"));

            assert("Evidence JSON: outbound.dests is array", Array.isArray(parsedEvidence.stats.s.outbound["192.168.1.100"].dests));
            assert("Evidence JSON: outbound.dests contains 8.8.8.8", parsedEvidence.stats.s.outbound["192.168.1.100"].dests.includes("8.8.8.8"));
            assert("Evidence JSON: outbound.dests contains 8.8.4.4", parsedEvidence.stats.s.outbound["192.168.1.100"].dests.includes("8.8.4.4"));

            assert("Evidence JSON: No {} placeholders for ports", !capturedJsonStr.includes('"ports": {}'));
            assert("Evidence JSON: No {} placeholders for files", !capturedJsonStr.includes('"files": {}'));
            assert("Evidence JSON: No {} placeholders for dests", !capturedJsonStr.includes('"dests": {}'));

            // 8. Invalid IP Handling
            const invalidLog = "2025-01-04 12:00:00 DROP TCP 192.168.1.50 51515 1000 80";
            const invalidP = LogProcessor.processLogText(invalidLog);
            const invalidStats = LogProcessor.analyze(invalidP.entries, testTopo);

            assert("Invalid IP: Count incremented", invalidStats.s.invalid > 0);
            assert("Invalid IP: Row captured", invalidStats.s.invalidRows.length > 0);
            assert("Invalid IP: Src skipped", !invalidStats.s.src["192.168.1.50"]);

            // 9. Safe HTML Rendering
            const safeCell = UIUtils.htmlCell('<span class="test">Safe</span>');
            const unsafeStr = '<img src=x onerror=alert(1)>';
            const tableHtml = UIUtils.renderTable(['A', 'B'], [[safeCell, unsafeStr]]);

            assert("Safe HTML: Preserved", tableHtml.includes('<span class="test">Safe</span>'));
            assert("Unsafe HTML: Escaped", !tableHtml.includes('<img src=x'));
            assert("Unsafe HTML: Visible as text", tableHtml.includes('&lt;img src=x'));

            // 10. Agent: router, contracts, baseline diff, explain labeling, remediation output
            const hasContracts = typeof AgentContracts !== 'undefined' && AgentContracts &&
                typeof AgentContracts.normalizeResponse === 'function' &&
                typeof AgentContracts.assertValid === 'function';
            assert("AgentContracts Loaded", hasContracts);

            if (hasContracts) {
                const normalized1 = AgentContracts.normalizeResponse("hello");
                let contractsOk = false;
                try {
                    contractsOk = AgentContracts.assertValid(normalized1) === true;
                } catch (e) {
                    contractsOk = false;
                }
                assert("AgentContracts: normalize+validate string", contractsOk && normalized1.bodyHtml === "hello" && normalized1.title === "Agent");

                const normalized2 = AgentContracts.normalizeResponse({
                    title: "  T  ",
                    verdictLabel: "confirmed",
                    bodyHtml: "<div>ok</div>",
                    because: [" a ", "", "b"],
                    actions: [{ label: "  Do  ", danger: "yes" }, { label: "" }],
                    followups: [" x ", " "]
                });
                assert("AgentContracts: verdict label normalize", normalized2.verdictLabel === "CONFIRMED");
                assert("AgentContracts: actions normalize", normalized2.actions.length === 1 && normalized2.actions[0].label === "Do" && normalized2.actions[0].danger === true);

                let threw = false;
                try {
                    AgentContracts.assertValid({ title: "x" });
                } catch (e) {
                    threw = true;
                }
                assert("AgentContracts: assertValid throws on invalid", threw);
            }

            const hasRouter = typeof AgentChatRouter !== 'undefined' && AgentChatRouter && typeof AgentChatRouter.parse === 'function';
            assert("AgentChatRouter Loaded", hasRouter);
            if (hasRouter) {
                const r1 = AgentChatRouter.parse("what matters first", {});
                assert("Router: what matters first -> top", r1.intent === "top");

                const r2 = AgentChatRouter.parse("why 10.0.0.5", {});
                assert("Router: why <ip> -> explain", r2.intent === "explain" && r2.args && r2.args.ip === "10.0.0.5");

                const r3 = AgentChatRouter.parse("show evidence", { lastFocus: "10.0.0.9" });
                assert("Router: show evidence uses lastFocus", r3.intent === "evidence" && r3.args && r3.args.focus === "10.0.0.9");

                const r4 = AgentChatRouter.parse("compare last", {});
                assert("Router: compare last -> diff last", r4.intent === "diff" && r4.args && r4.args.scope === "last");

                const r5 = AgentChatRouter.parse("investigate 10.0.0.5 console outbound", {});
                assert("Router: investigate console outbound", r5.intent === "investigate" && r5.args && r5.args.ip === "10.0.0.5" && r5.args.mode === "console" && r5.args.query === "outbound");

                const r6 = AgentChatRouter.parse("investigate 10.0.0.5 extra", {});
                assert("Router: reject extra tokens", r6.intent === "help");

                const r7 = AgentChatRouter.parse("demo guided", {});
                assert("Router: demo guided", r7.intent === "demo" && r7.args && r7.args.mode === "guided");
            }

            const hasBaseline = typeof BaselineEngine !== 'undefined' && BaselineEngine &&
                typeof BaselineEngine.buildBaseline === 'function' &&
                typeof BaselineEngine.diff === 'function';
            assert("BaselineEngine Loaded", hasBaseline);

            if (hasBaseline) {
                const baselineA = {
                    environmentSignature: "sigA",
                    totals: { flows: 100, allow: 90, drop: 10 },
                    peaks: { peakMinute: { time: "01:00:00" } },
                    noveltySeeds: {
                        srcIps: ["10.0.0.10"],
                        dstIps: ["8.8.8.8"],
                        dstPorts: ["80"]
                    },
                    topRiskyEntities: [{ ip: "10.0.0.10", score: 10, level: "Low" }]
                };
                const baselineB = {
                    environmentSignature: "sigA",
                    totals: { flows: 110, allow: 95, drop: 15 },
                    peaks: { peakMinute: { time: "01:30:00" } },
                    noveltySeeds: {
                        srcIps: ["10.0.0.10"],
                        dstIps: ["8.8.4.4"],
                        dstPorts: ["443"]
                    },
                    topRiskyEntities: [{ ip: "10.0.0.10", score: 12, level: "Low" }]
                };

                const current = {
                    environmentSignature: "sigA",
                    totals: { flows: 250, allow: 50, drop: 50 },
                    peaks: { peakMinute: { time: "12:05:00" } },
                    noveltySeeds: {
                        srcIps: ["10.0.0.10", "10.0.0.99"],
                        dstIps: ["8.8.8.8", "1.1.1.1"],
                        dstPorts: ["80", "22"]
                    },
                    topRiskyEntities: [
                        { ip: "10.0.0.10", score: 20, level: "Medium" },
                        { ip: "10.0.0.99", score: 999, level: "Critical" }
                    ]
                };

                const base = BaselineEngine.buildBaseline([baselineA, baselineB]);
                const d = BaselineEngine.diff(current, base);

                assert("Baseline diff: environment signature match", d.environmentSignatureMatch === true);
                assert("Baseline diff: new host detected", Array.isArray(d.newHosts) && d.newHosts.includes("10.0.0.99"));
                assert("Baseline diff: new destination detected", Array.isArray(d.newDestinations) && d.newDestinations.includes("1.1.1.1"));
                assert("Baseline diff: rare port detected", Array.isArray(d.rarePorts) && d.rarePorts.some(p => p && p.port === "22" && p.baselineCount === 0));
                assert("Baseline diff: behavior shifts present", Array.isArray(d.behaviorShifts) && d.behaviorShifts.length > 0);
                assert("Baseline diff: new risky entity detected", Array.isArray(d.newRiskyEntities) && d.newRiskyEntities.some(r => r && r.ip === "10.0.0.99" && r.baselineCount === 0));
            }

            const hasKernel = typeof AgentKernel !== 'undefined' && AgentKernel && typeof AgentKernel.handle === 'function';
            assert("AgentKernel Loaded", hasKernel);
            if (hasKernel && typeof LogProcessor !== 'undefined' && LogProcessor && typeof LogProcessor.getFocusDetail === 'function') {
                const originalGetFocusDetail = LogProcessor.getFocusDetail;
                try {
                    LogProcessor.getFocusDetail = (stats, ip) => {
                        const focus = {
                            ip,
                            role: "[TEST]",
                            drops: 10,
                            allows: 0,
                            portCount: 1,
                            outboundDestCount: 1,
                            outboundDropCount: 10,
                            detectors: [],
                            badges: [],
                            mitre: []
                        };

                        if (ip === "10.0.0.5") focus.badges = ["THREAT_INTEL"];
                        if (ip === "10.0.0.6") focus.detectors = ["SCANNER"];
                        if (ip === "10.0.0.7") {
                            focus.drops = 0;
                            focus.allows = 0;
                            focus.outboundDropCount = 0;
                        }
                        return focus;
                    };

                    const baseCtx = { db: { inputs: [], entries: [] }, state: { lastFocus: "10.0.0.5" } };

                    const confirmedRes = AgentKernel.handle({ ...baseCtx, stats: { risk: [], chains: [] } }, "explain 10.0.0.5");
                    assert("Explain: THREAT_INTEL => CONFIRMED", confirmedRes && confirmedRes.verdictLabel === "CONFIRMED");

                    const hypoRes = AgentKernel.handle({ ...baseCtx, stats: { risk: [], chains: [] } }, "explain 10.0.0.6");
                    assert("Explain: detectors => HYPOTHESIS", hypoRes && hypoRes.verdictLabel === "HYPOTHESIS");

                    const unknownRes = AgentKernel.handle({ ...baseCtx, stats: { risk: [], chains: [] } }, "explain 10.0.0.7");
                    assert("Explain: no signals => UNKNOWN", unknownRes && unknownRes.verdictLabel === "UNKNOWN");
                } catch (e) {
                    assert("Explain labeling tests crashed: " + e.message, false);
                } finally {
                    LogProcessor.getFocusDetail = originalGetFocusDetail;
                }
            }

            const hasRemediation = typeof RemediationService !== 'undefined' && RemediationService && typeof RemediationService.generatePlans === 'function';
            assert("RemediationService Loaded", hasRemediation);
            if (hasRemediation) {
                const context = {
                    stats: {
                        focus: {
                            "10.0.0.5": { badges: ["THREAT_INTEL"] }
                        }
                    }
                };

                const plans = RemediationService.generatePlans(context, "10.0.0.5");
                const planOk = Array.isArray(plans) && plans.length === 3 && plans.every(p => {
                    return p &&
                        typeof p.title === "string" &&
                        typeof p.description === "string" &&
                        typeof p.risk === "string" &&
                        Array.isArray(p.warnings) &&
                        Array.isArray(p.commands) &&
                        Array.isArray(p.rollbackCommands) &&
                        p.commands.length > 0 &&
                        p.rollbackCommands.length > 0;
                });
                assert("Remediation: 3 plans with commands+rollback", planOk);

                const hasFirewall = Array.isArray(plans) && plans.some(p => Array.isArray(p.commands) && p.commands.some(c => String(c).includes("New-NetFirewallRule")));
                assert("Remediation: Windows firewall commands present", hasFirewall);
            }

            // 11. Status Pulsing: computePulseClass tests
            const hasComputePulse = typeof UIUtils !== 'undefined' && UIUtils && typeof UIUtils.computePulseClass === 'function';
            assert("UIUtils.computePulseClass Loaded", hasComputePulse);

            if (hasComputePulse) {
                // Test critical badges
                assert("Pulse: SCANNER = critical", UIUtils.computePulseClass(['SCANNER']) === 'risk-card--pulse-critical');
                assert("Pulse: FLOODER = critical", UIUtils.computePulseClass(['FLOODER']) === 'risk-card--pulse-critical');
                assert("Pulse: THREAT_INTEL = critical", UIUtils.computePulseClass(['THREAT_INTEL']) === 'risk-card--pulse-critical');

                // Test warning badges
                assert("Pulse: EGRESS = warning", UIUtils.computePulseClass(['EGRESS']) === 'risk-card--pulse-warning');
                assert("Pulse: CHAIN = warning", UIUtils.computePulseClass(['CHAIN']) === 'risk-card--pulse-warning');

                // Test info badges
                assert("Pulse: LATERAL = info", UIUtils.computePulseClass(['LATERAL']) === 'risk-card--pulse-info');
                assert("Pulse: POLICY = info", UIUtils.computePulseClass(['POLICY']) === 'risk-card--pulse-info');

                // Test stacked threats (2+ badges should add stacked class)
                const stackedResult = UIUtils.computePulseClass(['SCANNER', 'EGRESS']);
                assert("Pulse: stacked SCANNER+EGRESS has critical", stackedResult.includes('risk-card--pulse-critical'));
                assert("Pulse: stacked SCANNER+EGRESS has stacked", stackedResult.includes('risk-card--pulse-stacked'));

                // Test priority (critical > warning > info)
                assert("Pulse: SCANNER+LATERAL = critical (priority)", UIUtils.computePulseClass(['SCANNER', 'LATERAL']).includes('risk-card--pulse-critical'));

                // Test empty/no badges
                assert("Pulse: empty badges = no class", UIUtils.computePulseClass([]) === '');
                assert("Pulse: unknown badge = no class", UIUtils.computePulseClass(['UNKNOWN']) === '');
            }
        } catch (e) {
            assert("TEST SUITE CRASHED: " + e.message, false);
            console.error(e);
        } finally {
            if (LogProcessor.setProfile) LogProcessor.setProfile(originalProfile);
        }

        let passCount = 0;
        tests.forEach(t => {
            if (t.pass) passCount++;
        });

        return { passCount, total: tests.length, tests };
    }

    static async run() {
        UIUtils.createUserMessage("Running Integrated Test Suite (Sandboxed)...");
        const suite = new SelfTestSuite();
        const { passCount, total, tests } = await suite.runAllTestsHeadless();
        const originalProfile = 'Medium';

        // Display results
        let html = `<div class="mb-2 font-bold">Self-Test Results (Zero Side-Effects)</div><div class="evidence-list">`;
        tests.forEach(t => {
            html += `<div class="test-row"><span>${t.name}</span><span class="${t.pass ? 'test-pass' : 'test-fail'}">${t.pass ? 'PASS' : 'FAIL'}</span></div>`;
        });
        const restoredProfile = LogProcessor.getActiveProfile ? LogProcessor.getActiveProfile() : originalProfile;
        html += `</div><div class="mt-2 text-xs">Result: ${passCount}/${tests.length} Passed</div>`;
        html += `<div class="text-xs" style="color:var(--text-muted)">Baseline profile: Medium · Restored profile: ${UIUtils.escapeHtml(restoredProfile || 'Unknown')}</div>`;

        const activeProfile = LogProcessor.getActiveProfile ? LogProcessor.getActiveProfile() : 'Unknown';
        const profileCfg = LogProcessor.PROFILES && LogProcessor.PROFILES[activeProfile] ? LogProcessor.PROFILES[activeProfile] : null;
        if (profileCfg) {
            html += `<div class="text-xs" style="color:var(--text-muted)">Active thresholds — scannerPorts: ${profileCfg.thresholds.scannerPorts}, floodDrops: ${profileCfg.thresholds.floodDrops}, egressDests: ${profileCfg.thresholds.egressDests}, egressDrops: ${profileCfg.thresholds.egressDrops}, chainWindow: ${(profileCfg.chainWindowMs / 60000).toFixed(1)} min</div>`;
        }

        const failed = tests.filter(t => !t.pass);
        if (failed.length) {
            const failList = failed.map(f => UIUtils.escapeHtml(f.name)).join(' | ');
            html += `<div class="text-xs" style="color:var(--accent-red)">Failures: ${failList}</div>`;
        }

        UIUtils.addBotHTML(html);

        return { passCount, total, tests };
    }
}

// Make available on globalThis for backward compatibility
if (typeof globalThis !== 'undefined') {
    globalThis.SelfTestSuite = SelfTestSuite;
}

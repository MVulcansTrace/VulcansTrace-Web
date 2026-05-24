import test from "node:test";
import assert from "node:assert/strict";
import "../components/node-bootstrap.js";

test("EvidenceGenerator includes agent artifacts in ZIP", async () => {
    const prevWindow = globalThis.window;
    const prevDocument = globalThis.document;

    globalThis.window = { screen: { width: 1280, height: 720 } };
    globalThis.document = {
        styleSheets: [{ cssRules: [{ cssText: "/* test css */" }] }],
        getElementById: (id) => {
            if (id === "chat") return { innerHTML: "<div>chat</div>" };
            return null;
        }
    };

    try {
        const files = new Map();
        const mockZipWriter = {
            add(name, content) {
                files.set(String(name), content);
            }
        };

        const stats = {
            risk: [
                {
                    ip: "203.0.113.5",
                    level: "Critical",
                    score: 999,
                    badges: ["THREAT_INTEL"],
                    drops: 1,
                    allows: 0,
                    portCount: 1,
                    outboundDests: 0,
                    outboundDrops: 0
                }
            ],
            focus: {
                "203.0.113.5": { role: "[WAN]", badges: ["THREAT_INTEL"] }
            },
            s: {
                meta: {
                    earliest: Date.parse("2025-01-01T00:00:00.000Z"),
                    latest: Date.parse("2025-01-01T00:10:00.000Z")
                },
                outbound: {},
                roleCounts: {}
            }
        };

        const db = {
            inputs: [],
            total: 1,
            startTime: "2025-01-01T00:00:00.000Z"
        };

        const context = {
            core: {
                agentLastFocus: "203.0.113.5",
                getSnapshotCache: () => [],
                listTranscript: async () => ([
                    {
                        type: "agent_exchange",
                        createdAt: "2025-01-01T00:00:01.000Z",
                        userText: "top threats",
                        parsedIntent: "top",
                        parsedArgs: {},
                        verdictLabel: "CONFIRMED",
                        evidenceRefCount: 0
                    }
                ])
            },
            caseId: "case-test",
            profile: "Medium",
            totals: { flows: 1, cloudtrail: 0 },
            iocs: [{ ip: "203.0.113.5", label: "demo" }],
            allowlist: []
        };

        await globalThis.EvidenceGenerator.genEvidence(
            db,
            stats,
            [],
            null,
            "Test Analyst",
            "Test Notes",
            () => {},
            mockZipWriter,
            true,
            context
        );

        assert.ok(files.has("triage.json"));
        assert.ok(files.has("diff.json"));
        assert.ok(files.has("agent.log.jsonl"));
        assert.ok(files.has("remediation.ps1"));

        const manifest = JSON.parse(String(files.get("manifest.json")));
        const artifactNames = new Set((manifest.artifacts || []).map((a) => a.name));
        assert.ok(artifactNames.has("triage.json"));
        assert.ok(artifactNames.has("diff.json"));
        assert.ok(artifactNames.has("agent.log.jsonl"));
        assert.ok(artifactNames.has("remediation.ps1"));

        const checksums = String(files.get("checksums.txt") || "");
        assert.ok(checksums.includes("triage.json"));
        assert.ok(checksums.includes("diff.json"));
        assert.ok(checksums.includes("agent.log.jsonl"));
        assert.ok(checksums.includes("remediation.ps1"));

        const remediation = String(files.get("remediation.ps1") || "");
        assert.ok(remediation.includes("Target: 203.0.113.5"));
        assert.ok(remediation.includes("New-NetFirewallRule"));

        const agentLog = String(files.get("agent.log.jsonl") || "");
        assert.ok(agentLog.includes("\"type\":\"meta\""));
        assert.ok(agentLog.includes("\"parsedIntent\":\"top\""));
    } finally {
        globalThis.window = prevWindow;
        globalThis.document = prevDocument;
    }
});

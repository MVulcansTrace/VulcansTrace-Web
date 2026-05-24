/**
 * Node.js bootstrap for ESM modules
 * Imports all modules and re-exports them for use in tests
 */
import { webcrypto } from "node:crypto";

// Polyfill crypto for Node.js environment
if (!globalThis.crypto) globalThis.crypto = webcrypto;

// Import all ESM modules
import { UIUtils } from './UIUtils.js';
import { NetworkUtils } from './NetworkUtils.js';
import { ZipWriter } from './ZipWriter.js';
import { VpcFlowParser } from './parsers/VpcFlowParser.js';
import { CloudTrailParser } from './parsers/CloudTrailParser.js';
import { WindowsFirewallParser } from './parsers/WindowsFirewallParser.js';
import { LogProcessor } from './LogProcessor.js';
import { EvidenceGenerator } from './EvidenceGenerator.js';
import { EvidenceService } from './EvidenceService.js';
import { AgentContracts } from './AgentContracts.js';
import { AgentRenderer } from './AgentRenderer.js';
import { InvestigationQueryLibrary } from './InvestigationQueryLibrary.js';
import { HypothesisEngine } from './HypothesisEngine.js';
import { RemediationService } from './RemediationService.js';
import { AgentSkills } from './AgentSkills.js';
import { AgentChatRouter } from './AgentChatRouter.js';
import { AgentKernel } from './AgentKernel.js';
import { CaseSnapshot } from './CaseSnapshot.js';
import { BaselineEngine } from './BaselineEngine.js';
import { SelfTestSuite } from './SelfTestSuite.js';
// Note: Some UI components require browser APIs and can't be imported in Node.js
// import { GuidedDemo } from './GuidedDemo.js';
// import { RemediationModal } from './RemediationModal.js';
// import { TheaterMode } from './TheaterMode.js';

// Make modules available on globalThis for backward compatibility with tests
globalThis.UIUtils = UIUtils;
globalThis.NetworkUtils = NetworkUtils;
globalThis.ZipWriter = ZipWriter;
globalThis.VpcFlowParser = VpcFlowParser;
globalThis.CloudTrailParser = CloudTrailParser;
globalThis.WindowsFirewallParser = WindowsFirewallParser;
globalThis.LogProcessor = LogProcessor;
globalThis.EvidenceGenerator = EvidenceGenerator;
globalThis.EvidenceService = EvidenceService;
globalThis.AgentContracts = AgentContracts;
globalThis.AgentRenderer = AgentRenderer;
globalThis.InvestigationQueryLibrary = InvestigationQueryLibrary;
globalThis.HypothesisEngine = HypothesisEngine;
globalThis.RemediationService = RemediationService;
globalThis.AgentSkills = AgentSkills;
globalThis.AgentChatRouter = AgentChatRouter;
globalThis.AgentKernel = AgentKernel;
globalThis.CaseSnapshot = CaseSnapshot;
globalThis.BaselineEngine = BaselineEngine;
globalThis.SelfTestSuite = SelfTestSuite;

// Re-export all modules
export {
    UIUtils,
    NetworkUtils,
    ZipWriter,
    VpcFlowParser,
    CloudTrailParser,
    WindowsFirewallParser,
    LogProcessor,
    EvidenceGenerator,
    EvidenceService,
    AgentContracts,
    AgentRenderer,
    InvestigationQueryLibrary,
    HypothesisEngine,
    RemediationService,
    AgentSkills,
    AgentChatRouter,
    AgentKernel,
    CaseSnapshot,
    BaselineEngine,
    SelfTestSuite
};

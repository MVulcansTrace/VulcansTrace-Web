/* Main ESM entry point for VulcansTrace */

// Core utilities (leaf dependencies)
import { NetworkUtils } from './NetworkUtils.js';
import { ZipWriter } from './ZipWriter.js';
import { UIUtils } from './UIUtils.js';

// Parsers
import { VpcFlowParser } from './parsers/VpcFlowParser.js';
import { CloudTrailParser } from './parsers/CloudTrailParser.js';

// Data processing
import { LogProcessor } from './LogProcessor.js';
import { CaseStore } from './CaseStore.js';
import { DuckDbService } from './DuckDbService.js';

// Agent system
import { AgentContracts } from './AgentContracts.js';
import { AgentRenderer } from './AgentRenderer.js';
import { InvestigationQueryLibrary } from './InvestigationQueryLibrary.js';
import { HypothesisEngine } from './HypothesisEngine.js';
import { RemediationService } from './RemediationService.js';
import { AgentSkills } from './AgentSkills.js';
import { AgentChatRouter } from './AgentChatRouter.js';
import { AgentKernel } from './AgentKernel.js';

// Snapshot and baseline
import { CaseSnapshot } from './CaseSnapshot.js';
import { BaselineEngine } from './BaselineEngine.js';

// Evidence
import { EvidenceGenerator } from './EvidenceGenerator.js';
import { EvidenceService } from './EvidenceService.js';

// Demo and test
import { GuidedDemo } from './GuidedDemo.js';
import { FullJourneyDemo } from './FullJourneyDemo.js';
import { DefenseStoryDemo } from './DefenseStoryDemo.js';
import { SelfTestSuite } from './SelfTestSuite.js';

// UI Components
import { ThemeSelector } from './ThemeSelector.js';
import { Header } from './Header.js';
import { ChatContainer } from './ChatContainer.js';
import { InputArea } from './InputArea.js';
import { SideNav } from './SideNav.js';
import { DropOverlay } from './DropOverlay.js';

// Modals
import { ConfigModal } from './ConfigModal.js';
import { EvidenceModal } from './EvidenceModal.js';
import { EvidenceSliceModal } from './EvidenceSliceModal.js';
import { HelpModal } from './HelpModal.js';
import { QueryConsoleModal } from './QueryConsoleModal.js';
import { DatasetsModal } from './DatasetsModal.js';
import { WorkspaceModal } from './WorkspaceModal.js';
import { RemediationModal } from './RemediationModal.js';
import { TheaterMode } from './TheaterMode.js';

// Main application
import { LogAnalystCore } from './LogAnalystCore.js';
import { LogAnalystApp } from './LogAnalystApp.js';

// ============================================================
// VULCANSTRACE NAMESPACE
// ============================================================
// Organize all modules under a single VulcansTrace namespace
// to reduce global pollution and improve discoverability.
// ============================================================

/**
 * VulcansTrace namespace - organized hierarchical access to all modules
 * @namespace VulcansTrace
 */
globalThis.VulcansTrace = Object.freeze({
    /**
     * Core utilities
     * @namespace VulcansTrace.utils
     */
    utils: Object.freeze({
        Network: NetworkUtils,
        UI: UIUtils,
        Zip: ZipWriter,
    }),

    /**
     * Log format parsers
     * @namespace VulcansTrace.parsers
     */
    parsers: Object.freeze({
        VpcFlow: VpcFlowParser,
        CloudTrail: CloudTrailParser,
    }),

    /**
     * Data processing and storage
     * @namespace VulcansTrace.data
     */
    data: Object.freeze({
        LogProcessor,
        CaseStore,
        DuckDbService,
    }),

    /**
     * Agent system components
     * @namespace VulcansTrace.agent
     */
    agent: Object.freeze({
        Kernel: AgentKernel,
        Skills: AgentSkills,
        Router: AgentChatRouter,
        Renderer: AgentRenderer,
        Contracts: AgentContracts,
        QueryLibrary: InvestigationQueryLibrary,
        Hypothesis: HypothesisEngine,
        Remediation: RemediationService,
    }),

    /**
     * Analysis and baseline comparison
     * @namespace VulcansTrace.analysis
     */
    analysis: Object.freeze({
        Snapshot: CaseSnapshot,
        Baseline: BaselineEngine,
    }),

    /**
     * Evidence collection and export
     * @namespace VulcansTrace.evidence
     */
    evidence: Object.freeze({
        Generator: EvidenceGenerator,
        Service: EvidenceService,
    }),

    /**
     * Demo and testing utilities
     * @namespace VulcansTrace.demo
     */
    demo: Object.freeze({
        Guided: GuidedDemo,
        FullJourney: FullJourneyDemo,
        DefenseStory: DefenseStoryDemo,
        SelfTest: SelfTestSuite,
    }),

    /**
     * UI components
     * @namespace VulcansTrace.ui
     */
    ui: Object.freeze({
        ThemeSelector,
        Header,
        ChatContainer,
        InputArea,
        SideNav,
        DropOverlay,
        modals: Object.freeze({
            Config: ConfigModal,
            Evidence: EvidenceModal,
            EvidenceSlice: EvidenceSliceModal,
            Help: HelpModal,
            QueryConsole: QueryConsoleModal,
            Datasets: DatasetsModal,
            Workspace: WorkspaceModal,
            Remediation: RemediationModal,
            Theater: TheaterMode,
        }),
    }),

    /**
     * Core application classes
     * @namespace VulcansTrace.core
     */
    core: Object.freeze({
        App: LogAnalystApp,
        Core: LogAnalystCore,
    }),
});

// ============================================================
// BACKWARD COMPATIBILITY ALIASES (Deprecated)
// ============================================================
// These globals are deprecated but maintained for backward
// compatibility. Use VulcansTrace.xxx instead.
// Will be removed in a future major version.
// ============================================================

// @deprecated Use VulcansTrace.utils.Network
globalThis.NetworkUtils = NetworkUtils;
// @deprecated Use VulcansTrace.utils.UI
globalThis.UIUtils = UIUtils;
// @deprecated Use VulcansTrace.utils.Zip
globalThis.ZipWriter = ZipWriter;

// @deprecated Use VulcansTrace.parsers.VpcFlow
globalThis.VpcFlowParser = VpcFlowParser;
// @deprecated Use VulcansTrace.parsers.CloudTrail
globalThis.CloudTrailParser = CloudTrailParser;

// @deprecated Use VulcansTrace.data.LogProcessor
globalThis.LogProcessor = LogProcessor;
// @deprecated Use VulcansTrace.data.CaseStore
globalThis.CaseStore = CaseStore;
// @deprecated Use VulcansTrace.data.DuckDbService
globalThis.DuckDbService = DuckDbService;

// @deprecated Use VulcansTrace.agent.Contracts
globalThis.AgentContracts = AgentContracts;
// @deprecated Use VulcansTrace.agent.Renderer
globalThis.AgentRenderer = AgentRenderer;
// @deprecated Use VulcansTrace.agent.QueryLibrary
globalThis.InvestigationQueryLibrary = InvestigationQueryLibrary;
// @deprecated Use VulcansTrace.agent.Hypothesis
globalThis.HypothesisEngine = HypothesisEngine;
// @deprecated Use VulcansTrace.agent.Remediation
globalThis.RemediationService = RemediationService;
// @deprecated Use VulcansTrace.agent.Skills
globalThis.AgentSkills = AgentSkills;
// @deprecated Use VulcansTrace.agent.Router
globalThis.AgentChatRouter = AgentChatRouter;
// @deprecated Use VulcansTrace.agent.Kernel
globalThis.AgentKernel = AgentKernel;

// @deprecated Use VulcansTrace.analysis.Snapshot
globalThis.CaseSnapshot = CaseSnapshot;
// @deprecated Use VulcansTrace.analysis.Baseline
globalThis.BaselineEngine = BaselineEngine;

// @deprecated Use VulcansTrace.evidence.Generator
globalThis.EvidenceGenerator = EvidenceGenerator;
// @deprecated Use VulcansTrace.evidence.Service
globalThis.EvidenceService = EvidenceService;

// @deprecated Use VulcansTrace.demo.Guided
globalThis.GuidedDemo = GuidedDemo;
// @deprecated Use VulcansTrace.demo.FullJourney
globalThis.FullJourneyDemo = FullJourneyDemo;
// @deprecated Use VulcansTrace.demo.DefenseStory
globalThis.DefenseStoryDemo = DefenseStoryDemo;
// @deprecated Use VulcansTrace.demo.SelfTest
globalThis.SelfTestSuite = SelfTestSuite;

// @deprecated Use VulcansTrace.ui.ThemeSelector
globalThis.ThemeSelector = ThemeSelector;
// @deprecated Use VulcansTrace.ui.Header
globalThis.Header = Header;
// @deprecated Use VulcansTrace.ui.ChatContainer
globalThis.ChatContainer = ChatContainer;
// @deprecated Use VulcansTrace.ui.InputArea
globalThis.InputArea = InputArea;
// @deprecated Use VulcansTrace.ui.SideNav
globalThis.SideNav = SideNav;
// @deprecated Use VulcansTrace.ui.DropOverlay
globalThis.DropOverlay = DropOverlay;

// @deprecated Use VulcansTrace.ui.modals.Config
globalThis.ConfigModal = ConfigModal;
// @deprecated Use VulcansTrace.ui.modals.Evidence
globalThis.EvidenceModal = EvidenceModal;
// @deprecated Use VulcansTrace.ui.modals.EvidenceSlice
globalThis.EvidenceSliceModal = EvidenceSliceModal;
// @deprecated Use VulcansTrace.ui.modals.Help
globalThis.HelpModal = HelpModal;
// @deprecated Use VulcansTrace.ui.modals.QueryConsole
globalThis.QueryConsoleModal = QueryConsoleModal;
// @deprecated Use VulcansTrace.ui.modals.Datasets
globalThis.DatasetsModal = DatasetsModal;
// @deprecated Use VulcansTrace.ui.modals.Workspace
globalThis.WorkspaceModal = WorkspaceModal;
// @deprecated Use VulcansTrace.ui.modals.Remediation
globalThis.RemediationModal = RemediationModal;
// @deprecated Use VulcansTrace.ui.modals.Theater
globalThis.TheaterMode = TheaterMode;

// @deprecated Use VulcansTrace.core.Core
globalThis.LogAnalystCore = LogAnalystCore;
// @deprecated Use VulcansTrace.core.App
globalThis.LogAnalystApp = LogAnalystApp;

// ============================================================
// APPLICATION INITIALIZATION
// ============================================================

// Initialize the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupDelegatedListeners();
        initApp();
    });
} else {
    setupDelegatedListeners();
    initApp();
}

function setupDelegatedListeners() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-agent-cmd], [data-action], .risk-card');
        if (!btn) return;

        const action = btn.getAttribute('data-action');

        // Agent command buttons and choice chips
        const cmd = btn.getAttribute('data-agent-cmd');
        if (cmd) {
            e.stopPropagation();
            if (window.logAnalystApp?.core?.processCommand) {
                window.logAnalystApp.core.processCommand(cmd);
            } else if (window.logAnalystApp?.setCommand) {
                window.logAnalystApp.setCommand(cmd);
            } else if (window.UIUtils?.setCmd) {
                window.UIUtils.setCmd(cmd);
            }
            return;
        }

        // Copy focus summary
        if (action === 'copy-summary') {
            e.stopPropagation();
            const target = btn.getAttribute('data-copy-target');
            if (target) UIUtils.copyFocusSummary(target);
            return;
        }

        // Allowlist prompt
        if (action === 'allowlist') {
            e.stopPropagation();
            const ip = btn.getAttribute('data-ip');
            if (ip) window.logAnalystApp?.core?.promptAllowlistForIp?.(ip);
            return;
        }

        // Remediation modal
        if (action === 'remediation') {
            e.stopPropagation();
            const ip = btn.getAttribute('data-ip');
            if (ip) window.logAnalystApp?.remediationModal?.open?.(ip);
            return;
        }

        // Silence pulse on risk cards
        if (btn.classList.contains('risk-card')) {
            UIUtils.silencePulse(btn);
        }
    });
}

function initApp() {
    const app = new LogAnalystApp();
    app.init();
}


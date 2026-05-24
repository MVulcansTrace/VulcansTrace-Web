/* Chat container component */
export class ChatContainer {
    render() {
        return `
            <div class="chat-container" id="chat">
                <div class="chat-empty-art" aria-hidden="true">
                    <svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg" class="empty-state-svg">
                        <line x1="60" y1="40" x2="180" y2="100" stroke="rgba(6,182,212,0.12)" stroke-width="1"/>
                        <line x1="180" y1="100" x2="320" y2="60" stroke="rgba(6,182,212,0.12)" stroke-width="1"/>
                        <line x1="180" y1="100" x2="100" y2="170" stroke="rgba(6,182,212,0.12)" stroke-width="1"/>
                        <line x1="180" y1="100" x2="300" y2="160" stroke="rgba(6,182,212,0.12)" stroke-width="1"/>
                        <line x1="60" y1="40" x2="320" y2="60" stroke="rgba(6,182,212,0.06)" stroke-width="1" stroke-dasharray="4 6"/>
                        <line x1="100" y1="170" x2="300" y2="160" stroke="rgba(6,182,212,0.06)" stroke-width="1" stroke-dasharray="4 6"/>
                        <circle cx="60" cy="40" r="4" fill="rgba(6,182,212,0.22)"/>
                        <circle cx="180" cy="100" r="6" fill="rgba(6,182,212,0.3)"/>
                        <circle cx="320" cy="60" r="3" fill="rgba(6,182,212,0.18)"/>
                        <circle cx="100" cy="170" r="3" fill="rgba(6,182,212,0.18)"/>
                        <circle cx="300" cy="160" r="4" fill="rgba(6,182,212,0.22)"/>
                        <circle cx="180" cy="100" r="14" fill="none" stroke="rgba(6,182,212,0.1)" stroke-width="1"/>
                        <circle cx="180" cy="100" r="24" fill="none" stroke="rgba(6,182,212,0.05)" stroke-width="1"/>
                    </svg>
                </div>
                <div class="message bot">
                    <div class="bot-avatar">
                        <img src="assets/VulcansTraceAvatar.png" alt="LogBot" style="width: 100%; height: 100%; object-fit: contain;">
                    </div>
                    <div class="bot-card">
                        <div class="bot-header">
                            VulcansTrace
                        </div>
                        <div class="bot-content">
                            <p class="mb-2"><strong>Hi there! I'm your VulcansTrace.</strong></p>
                            <p class="mb-4" style="color:var(--text-muted)">
                                I analyze firewall logs, trace attacks, and build forensic evidence bundles. Paste logs below or try a quick start to see me in action.
                            </p>
                            <div class="chip-group">
                                <div class="chip-group-label">GET STARTED</div>
                                <div class="chip-container">
                                    <a class="choice-chip" title="Verify all 82 internal self-tests pass" onclick="window.logAnalystApp.runSelfTests()"><svg class="icon"><use href="#i-check"></use></svg> Run Health Check</a>
                                    <a class="choice-chip" title="Load sample data and walk through a full analysis" onclick="window.logAnalystApp && window.logAnalystApp.core && window.logAnalystApp.core.processCommand ? window.logAnalystApp.core.processCommand('demo guided', 'Load the 17-flow sample dataset') : (window.logAnalystApp && window.logAnalystApp.setCommand ? window.logAnalystApp.setCommand('demo guided') : (window.UIUtils && UIUtils.setCmd ? UIUtils.setCmd('demo guided') : null))"><svg class="icon"><use href="#i-layers"></use></svg> Run Guided Demo</a>
                                </div>
                            </div>
                            <div class="chip-group">
                                <div class="chip-group-label">DEEP DIVE</div>
                                <div class="chip-container">
                                    <a class="choice-chip" title="9-step end-to-end incident story with baseline comparison" onclick="if(window.FullJourneyDemo && window.logAnalystApp && window.logAnalystApp.core) { FullJourneyDemo.start(window.logAnalystApp.core); }">&#10024; Full Journey</a>
                                    <a class="choice-chip" title="Lockheed Martin Kill Chain narrative with evidence cards" onclick="if(window.DefenseStoryDemo && window.logAnalystApp && window.logAnalystApp.core) { DefenseStoryDemo.start(window.logAnalystApp.core); }"><svg class="icon"><use href="#i-shield"></use></svg> Defense Story</a>
                                    <a class="choice-chip" title="5-slide executive presentation of current findings" onclick="if(window.logAnalystApp && window.logAnalystApp.theaterMode) { window.logAnalystApp.closeAllModals(); window.logAnalystApp.theaterMode.open(); }"><svg class="icon"><use href="#i-layers"></use></svg> Presentation</a>
                                    <a class="choice-chip" title="Generate a threat hypothesis from current analysis data" onclick="window.logAnalystApp.core.processCommand(&quot;what's happening&quot;)"><svg class="icon"><use href="#i-alert"></use></svg> Generate Hypothesis</a>
                                </div>
                            </div>
                            <p class="mt-3" style="font-size:0.75rem; color:var(--text-muted);">
                                Tip: Type <code class="tip-cmd">help</code> for a full list of commands like <code class="tip-cmd">top threats</code>, <code class="tip-cmd">explain &lt;IP&gt;</code>, and <code class="tip-cmd">export evidence</code>.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

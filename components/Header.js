/* Header component */
export class Header {
    constructor(core) {
        this.core = core;
    }

    render() {
        const profile = this.core.getProfile ? this.core.getProfile() : 'Medium';
        return `
            <div class="header">
                <div class="header-brand">
                    <div style="background:var(--accent-blue); width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:10px;">
                        <svg class="icon icon-lg" style="fill:white"><use href="#i-shield"></use></svg>
                    </div>
                    <div>
                        <div class="font-bold">VulcansTrace</div>
                        <div class="text-xs" style="color:var(--text-muted); display:flex; align-items:center; gap:4px; opacity: 0.7;">
                            <span class="status-dot"></span> Companion Edition
                        </div>
                    </div>
                </div>
                <div class="flex gap-2" style="align-items:center;">
                    <div style="display:flex; align-items:center; gap:6px; padding:4px 8px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input);">
                        <label for="profileSelect" class="text-xs" style="color:var(--text-muted);">Profile</label>
                        <select id="profileSelect" onchange="window.logAnalystApp.core.setProfile(this.value)" style="padding:4px 8px; border:1px solid var(--border); border-radius:6px; background:var(--bg-panel); color:var(--text-main); font-size:0.75rem;">
                            <option value="Low" ${profile === 'Low' ? 'selected' : ''}>Low</option>
                            <option value="Medium" ${profile === 'Medium' ? 'selected' : ''}>Medium</option>
                            <option value="High" ${profile === 'High' ? 'selected' : ''}>High</option>
                        </select>
                    </div>
                    <div id="themeSelectorContainer"></div>
                </div>
            </div>
        `;
    }
}

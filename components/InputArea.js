/* Input area component with drag-and-drop support */
export class InputArea {
    constructor(core) {
        this.core = core;
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleSend = this.handleSend.bind(this);
        this._dragCounter = 0;
    }

    render() {
        return `
            <div class="input-area" id="inputArea">
                <label class="input-label" for="input">
                    <svg class="icon" style="width:14px;height:14px;opacity:0.7;"><use href="#i-file"></use></svg>
                    Paste logs or type a command
                </label>
                <div class="input-wrapper" id="inputWrapper">
                    <textarea id="input" placeholder="Paste firewall logs, VPC flow logs, or CloudTrail JSON here...&#10;&#10;Or type a command like: help, top threats, explain 192.168.1.99&#10;You can also drag and drop .log, .csv, .json, or .txt files" onkeydown="window.logAnalystApp.inputArea.handleKeyDown(event)" oninput="window.logAnalystApp.inputArea.autoResize(this)"></textarea>
                    <button class="send-btn" onclick="window.logAnalystApp.inputArea.handleSend()">
                        <svg class="icon-lg" style="fill: white;"><use href="#i-arrow-right"></use></svg>
                    </button>
                </div>
                <div class="input-drop-zone" id="inputDropZone">
                    <div class="input-drop-zone-content">
                        <svg class="icon-lg" style="width:32px;height:32px;opacity:0.6;"><use href="#i-file"></use></svg>
                        <span>Drop log files here</span>
                        <span class="input-drop-zone-hint">.log .csv .json .txt</span>
                    </div>
                </div>
            </div>
        `;
    }

    /** Call after render to wire drag-and-drop */
    bindDropZone() {
        const area = document.getElementById('inputArea');
        const zone = document.getElementById('inputDropZone');
        if (!area || !zone) return;

        area.addEventListener('dragenter', (e) => {
            e.preventDefault();
            this._dragCounter++;
            zone.classList.add('active');
        });

        area.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this._dragCounter--;
            if (this._dragCounter <= 0) {
                this._dragCounter = 0;
                zone.classList.remove('active');
            }
        });

        area.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        area.addEventListener('drop', (e) => {
            e.preventDefault();
            this._dragCounter = 0;
            zone.classList.remove('active');

            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                const accepted = Array.from(files).filter(f =>
                    /\.(log|csv|json|txt|evt|evtx)$/i.test(f.name)
                );
                if (accepted.length > 0) {
                    this.core.processFiles(accepted);
                } else {
                    if (window.logAnalystApp && window.logAnalystApp.showToast) {
                        window.logAnalystApp.showToast('Unsupported file type. Drop .log, .csv, .json, or .txt files.', 'warning');
                    }
                }
            }
        });
    }

    autoResize(el) {
        el.style.height = '56px';
        el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }

    handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSend();
        }
    }

    async handleSend() {
        const input = document.getElementById('input');
        const val = input.value.trim();
        if (!val) return;

        input.value = '';
        input.style.height = '56px';

        // Remove the glow pulse after first use
        const wrapper = document.getElementById('inputWrapper');
        if (wrapper) wrapper.classList.add('used');

        if (val.toLowerCase() === 'run self-test' || val.toLowerCase() === 'test') {
            window.logAnalystApp.runSelfTests();
            return;
        }

        if (val.includes('#Fields:') || (val.split('\n').length > 3 && /\d{2}:\d{2}:\d{2}/.test(val))) {
            await this.core.processPaste(val);
        } else {
            this.core.processCommand(val);
        }
    }
}

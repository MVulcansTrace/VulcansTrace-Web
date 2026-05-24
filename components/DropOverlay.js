/* Drag and drop overlay component */
export class DropOverlay {
    constructor(core) {
        this.core = core;
        this.handleDragOver = this.handleDragOver.bind(this);
        this.handleDragLeave = this.handleDragLeave.bind(this);
        this.handleDrop = this.handleDrop.bind(this);
    }

    render() {
        return `
            <div id="dropOverlay">
                <svg class="icon" style="width:48px; height:48px; fill:var(--accent-blue); margin-bottom:10px;">
                    <use href="#i-layers"></use>
                </svg>
                <h2 style="color:white; margin:0;">Drop Log Files</h2>
                <div style="color:var(--text-muted); font-size:0.8rem;">Multi-File Ingestion + Topology Analysis</div>
            </div>
        `;
    }

    handleDragOver(event) {
        event.preventDefault();
        document.getElementById('dropOverlay').classList.add('active');
    }

    handleDragLeave(event) {
        event.preventDefault();
        if (!event.relatedTarget) {
            document.getElementById('dropOverlay').classList.remove('active');
        }
    }

    async handleDrop(event) {
        event.preventDefault();
        document.getElementById('dropOverlay').classList.remove('active');

        const files = event.dataTransfer.files;
        if (files.length > 0) {
            await this.core.processFiles(files);
        }
    }
}
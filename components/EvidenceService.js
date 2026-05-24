/* EvidenceService: extract small proof slices from inputs */
import { UIUtils } from './UIUtils.js';
import { silentCleanup } from './errorUtils.js';

function normalizeLineNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}

function normalizeRadius(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 6;
    return Math.max(0, Math.min(200, Math.floor(n)));
}

function resolveInputsFromContext(context) {
    if (!context) return [];
    if (Array.isArray(context)) return context;
    const ctx = UIUtils.isPlainObject(context) ? context : null;
    if (!ctx) return [];
    if (Array.isArray(ctx.inputs)) return ctx.inputs;
    if (ctx.db && Array.isArray(ctx.db.inputs)) return ctx.db.inputs;
    if (ctx.core && ctx.core.DB && Array.isArray(ctx.core.DB.inputs)) return ctx.core.DB.inputs;
    return [];
}

function resolveDataset(ref, inputs) {
    const list = Array.isArray(inputs) ? inputs : [];
    if (!list.length) return null;

    const datasetId = ref && typeof ref.datasetId === 'string' ? ref.datasetId.trim() : '';
    if (datasetId) {
        const hit = list.find(d => d && typeof d.id === 'string' && d.id === datasetId);
        if (hit) return hit;
    }

    const fileName = ref && typeof ref.fileName === 'string' ? ref.fileName.trim() : '';
    if (fileName) {
        const hit = list.find(d => d && typeof d.name === 'string' && d.name === fileName);
        if (hit) return hit;
    }

    return null;
}

function formatCopyLines(lines) {
    const list = Array.isArray(lines) ? lines : [];
    if (!list.length) return '';
    const maxLine = list[list.length - 1].lineNumber || 0;
    const width = Math.max(3, String(maxLine || 0).length);
    return list.map((row) => {
        const num = String(row.lineNumber || 0).padStart(width, ' ');
        return `${num}: ${row.text || ''}`;
    }).join('\n');
}

async function sliceLinesFromText(text, startLine, endLine) {
    const raw = String(text || '');
    const all = raw.split(/\r?\n/);
    const rows = [];
    for (let i = startLine; i <= endLine; i++) {
        const idx = i - 1;
        if (idx < 0 || idx >= all.length) continue;
        rows.push({ lineNumber: i, text: all[idx] });
    }
    return rows;
}

async function sliceLinesFromBlob(blob, startLine, endLine) {
    if (!blob) return [];

    if (typeof blob.stream !== 'function' || typeof TextDecoder === 'undefined') {
        const text = typeof blob.text === 'function' ? await blob.text() : '';
        return sliceLinesFromText(text, startLine, endLine);
    }

    const reader = blob.stream().getReader();
    const decoder = new TextDecoder();
    let carry = '';
    let lineNumber = 0;
    const rows = [];

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            carry += decoder.decode(value, { stream: true });

            let idx;
            while ((idx = carry.indexOf('\n')) >= 0) {
                let line = carry.slice(0, idx);
                if (line.endsWith('\r')) line = line.slice(0, -1);
                carry = carry.slice(idx + 1);

                lineNumber++;
                if (lineNumber >= startLine && lineNumber <= endLine) {
                    rows.push({ lineNumber, text: line });
                }
                if (lineNumber >= endLine) {
                    silentCleanup(() => reader.cancel(), 'slice reader cancel');
                    return rows;
                }
            }
        }
    } finally {
        silentCleanup(() => reader.releaseLock(), 'slice reader');
    }

    carry += decoder.decode();
    if (carry && lineNumber < endLine) {
        lineNumber++;
        if (lineNumber >= startLine && lineNumber <= endLine) {
            rows.push({ lineNumber, text: carry.endsWith('\r') ? carry.slice(0, -1) : carry });
        }
    }

    return rows;
}

async function getEvidenceSlice(ref, radius, context) {
    const r = normalizeRadius(radius);
    const centerLine = normalizeLineNumber(ref && ref.line);
    let fileName = ref && typeof ref.fileName === 'string' && ref.fileName.trim() ? ref.fileName.trim() : 'Unknown';

    if (!centerLine) {
        return {
            ok: false,
            error: 'Evidence ref missing line number.',
            fileName
        };
    }

    const startLine = Math.max(1, centerLine - r);
    const endLine = centerLine + r;

    const hasInlineText = ref && typeof ref.text === 'string';
    const hasInlineBytes = ref && (ref.bytes instanceof Uint8Array || ref.bytes instanceof ArrayBuffer);

    let rows = [];
    if (hasInlineText) {
        rows = await sliceLinesFromText(ref.text, startLine, endLine);
    } else if (hasInlineBytes) {
        const u8 = ref.bytes instanceof Uint8Array ? ref.bytes : new Uint8Array(ref.bytes);
        const text = new TextDecoder().decode(u8);
        rows = await sliceLinesFromText(text, startLine, endLine);
    } else if (ref && (ref.blob || ref.file)) {
        rows = await sliceLinesFromBlob(ref.blob || ref.file, startLine, endLine);
    } else {
        const inputs = resolveInputsFromContext(context);
        const dataset = resolveDataset(ref, inputs);
        if (dataset && fileName === 'Unknown' && typeof dataset.name === 'string' && dataset.name.trim()) fileName = dataset.name.trim();
        rows = dataset ? await sliceLinesFromBlob(dataset.file || dataset.blob, startLine, endLine) : [];
    }

    const lines = rows.map((row) => ({
        lineNumber: row.lineNumber,
        text: row.text,
        isCenter: row.lineNumber === centerLine
    }));

    return {
        ok: true,
        fileName,
        centerLine,
        startLine,
        endLine,
        radius: r,
        lines,
        copyText: formatCopyLines(lines)
    };
}

export const EvidenceService = { getEvidenceSlice };

#!/usr/bin/env node
/**
 * VulcansTrace Demo Recorder
 *
 * Single CDP connection. Drives the demo AND captures frames.
 * No Hermes middleman — one clean pipeline.
 *
 * Usage: node tools/record-demo.mjs [fps]
 *   node tools/record-demo.mjs       # 4 fps (default)
 *   node tools/record-demo.mjs 8     # 8 fps
 *
 * Output:
 *   /tmp/vt-frames/*.png    — raw frames
 *   /tmp/vt-recording.mp4   — assembled video
 *   /tmp/vt-recording.gif   — converted GIF (800px wide)
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import WebSocket from 'ws';

const CDP_PORT = 9222;
const FRAME_DIR = '/tmp/vt-frames';
const OUTPUT_MP4 = '/tmp/vt-recording.mp4';
const OUTPUT_GIF = '/tmp/vt-recording.gif';
const fps = parseInt(process.argv[2]) || 4;

// ── CDP helpers ──────────────────────────────────────────────

let msgId = 0;
const pending = new Map();

function connect(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
}

function send(ws, method, params = {}) {
    const id = ++msgId;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id);
                reject(new Error(`Timeout: ${method}`));
            }
        }, 10000);
    });
}

function handleMsg(data) {
    try {
        const msg = JSON.parse(data.toString());
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
        }
    } catch {}
}

// ── Frame capture ────────────────────────────────────────────

let frameNum = 0;

async function capture(ws, label) {
    const result = await send(ws, 'Page.captureScreenshot', { format: 'png', quality: 90 });
    if (result && result.data) {
        const buf = Buffer.from(result.data, 'base64');
        const filename = `${FRAME_DIR}/frame_${String(frameNum).padStart(5, '0')}.png`;
        writeFileSync(filename, buf);
        frameNum++;
        console.log(`  Frame ${frameNum}: ${label} (${(buf.length / 1024).toFixed(0)}KB)`);
    }
}

async function captureBurst(ws, seconds, label) {
    const interval = 1000 / fps;
    const start = Date.now();
    let n = 0;
    while ((Date.now() - start) < seconds * 1000) {
        await capture(ws, `${label} ${++n}`);
        const elapsed = Date.now() - start;
        const expected = n * interval;
        if (expected > elapsed) await new Promise(r => setTimeout(r, expected - elapsed));
    }
}

// ── Demo sequence ────────────────────────────────────────────

const LOG_DATA = readFileSync('/mnt/z/Test_M2_V_S/VulcansTrace-Web/samples/demo-full-attack.log', 'utf8');

async function runDemo(ws) {
    // Step 1: Reload page to clean state
    console.log('\n[1/5] Loading clean app...');
    await send(ws, 'Page.navigate', { url: 'http://localhost:7071' });
    await new Promise(r => setTimeout(r, 2000));
    await capture(ws, 'welcome-screen');

    // Step 2: Click textarea to focus
    console.log('[2/5] Clicking input...');
    await send(ws, 'Runtime.evaluate', {
        expression: 'document.querySelector("textarea").focus()',
        returnByValue: true
    });
    await new Promise(r => setTimeout(r, 500));
    await capture(ws, 'input-focused');

    // Step 3: Paste logs instantly
    console.log('[3/5] Pasting attack logs...');
    const escaped = LOG_DATA.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    await send(ws, 'Runtime.evaluate', {
        expression: `const ta = document.querySelector('textarea'); ta.value = \`${escaped}\`; ta.dispatchEvent(new Event('input', {bubbles:true}));`,
        returnByValue: true
    });
    await new Promise(r => setTimeout(r, 500));
    await capture(ws, 'logs-pasted');

    // Step 4: Submit
    console.log('[4/5] Submitting analysis...');
    await send(ws, 'Runtime.evaluate', {
        expression: 'document.querySelector("textarea").closest("div").querySelector("button[type=button], button").click()',
        returnByValue: true
    });

    // Capture the analysis running
    console.log('[4/5] Recording analysis...');
    await captureBurst(ws, 4, 'analyzing');

    // Step 5: Capture findings panel for a few seconds
    console.log('[5/5] Recording findings...');
    await captureBurst(ws, 4, 'findings');

    // Scroll down to show more detail
    await send(ws, 'Runtime.evaluate', {
        expression: 'document.querySelector("main") && (document.querySelector("main").scrollTop += 400)',
        returnByValue: true
    });
    await new Promise(r => setTimeout(r, 500));
    await captureBurst(ws, 3, 'scrolled');
}

// ── Assembly ─────────────────────────────────────────────────

function assemble() {
    if (frameNum === 0) { console.error('No frames!'); return; }
    console.log(`\nAssembling ${frameNum} frames at ${fps}fps...`);

    try {
        execSync(
            `ffmpeg -y -framerate ${fps} -i "${FRAME_DIR}/frame_%05d.png" ` +
            `-c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 "${OUTPUT_MP4}"`,
            { stdio: 'pipe' }
        );
        console.log(`MP4: ${OUTPUT_MP4}`);
    } catch (e) {
        console.error('MP4 failed:', e.stderr?.toString().slice(-300));
        return;
    }

    try {
        execSync(
            `ffmpeg -y -i "${OUTPUT_MP4}" ` +
            `-vf "fps=${fps},scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" ` +
            `"${OUTPUT_GIF}"`,
            { stdio: 'pipe' }
        );
        console.log(`GIF: ${OUTPUT_GIF}`);
    } catch (e) {
        console.error('GIF failed:', e.stderr?.toString().slice(-300));
    }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
    console.log('VulcansTrace Demo Recorder');

    // Get tab
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
    const tabs = await res.json();
    const page = tabs.find(t => t.type === 'page');
    if (!page) { console.error('No page tab!'); process.exit(1); }
    console.log(`Tab: ${page.title}`);

    // Connect
    const ws = await connect(page.webSocketDebuggerUrl);
    ws.on('message', handleMsg);
    console.log('CDP connected');

    // Prep
    if (existsSync(FRAME_DIR)) rmSync(FRAME_DIR, { recursive: true });
    mkdirSync(FRAME_DIR, { recursive: true });

    // Run
    await runDemo(ws);
    ws.close();

    // Assemble
    assemble();
    console.log(`\nDone! ${frameNum} frames captured.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

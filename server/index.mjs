import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 7071);
const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT, ".vulcanstrace_api");
const CASES_FILE = path.join(DATA_DIR, "cases.json");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".wasm": "application/wasm",
    ".json": "application/json; charset=utf-8",
    ".log": "text/plain; charset=utf-8"
};

function send(res, code, body, headers = {}) {
    res.writeHead(code, {
        "Cache-Control": "no-store",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self';",
        ...headers
    });
    res.end(body);
}

function sendJson(res, code, obj) {
    const json = JSON.stringify(obj, null, 2);
    send(res, code, json, { "Content-Type": "application/json; charset=utf-8" });
}

function resolveSafePath(relPath) {
    const filePath = path.resolve(ROOT, "." + relPath);
    const relative = path.relative(ROOT, filePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return filePath;
}

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadCases() {
    ensureDataDir();
    try {
        if (!fs.existsSync(CASES_FILE)) return [];
        const raw = fs.readFileSync(CASES_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveCases(cases) {
    ensureDataDir();
    fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2));
}

async function readJsonBody(req, limitBytes = 1_000_000) {
    return await new Promise((resolve, reject) => {
        let body = "";
        let bytes = 0;

        req.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > limitBytes) {
                reject(new Error("Request body too large"));
                req.destroy();
                return;
            }
            body += chunk.toString("utf8");
        });

        req.on("end", () => {
            if (!body.trim()) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch {
                reject(new Error("Invalid JSON"));
            }
        });

        req.on("error", (err) => reject(err));
    });
}

const server = http.createServer(async (req, res) => {
    const baseUrl = `http://${req.headers.host ?? "localhost"}`;
    const requestUrl = new URL(req.url ?? "/", baseUrl);

    if (requestUrl.pathname === "/api/health" && req.method === "GET") {
        return sendJson(res, 200, { ok: true, service: "VulcansTrace Local API", ts: new Date().toISOString() });
    }

    if (requestUrl.pathname === "/api/cases" && req.method === "GET") {
        const cases = loadCases();
        return sendJson(res, 200, { ok: true, cases });
    }

    if (requestUrl.pathname === "/api/cases" && req.method === "POST") {
        try {
            const body = await readJsonBody(req);
            const name = (body && body.name ? String(body.name) : "").trim() || "Untitled Case";
            const now = new Date().toISOString();

            const cases = loadCases();
            const record = { id: randomUUID(), name, createdAt: now, updatedAt: now };
            cases.unshift(record);
            saveCases(cases);
            return sendJson(res, 201, { ok: true, case: record });
        } catch (e) {
            return sendJson(res, 400, { ok: false, error: e && e.message ? e.message : "Bad Request" });
        }
    }

    let relPath;
    try {
        relPath = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
    } catch {
        return send(res, 400, "Bad Request");
    }

    const filePath = resolveSafePath(relPath);
    if (!filePath) return send(res, 403, "Forbidden");

    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch {
        return send(res, 404, "Not Found");
    }

    if (stat.isDirectory()) return send(res, 404, "Not Found");

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";

    try {
        const data = fs.readFileSync(filePath);
        return send(res, 200, data, { "Content-Type": contentType });
    } catch {
        return send(res, 500, "Server Error");
    }
});

server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use.`);
        console.error("Stop the other server using that port, or run with a different port:");
        console.error("  PowerShell: $env:PORT=7072; npm run dev:api");
        process.exit(1);
    }
    console.error(err);
    process.exit(1);
});

server.listen(PORT, () => {
    console.log(`VulcansTrace API server: http://localhost:${PORT}/`);
    console.log(`API endpoints: GET /api/health, GET/POST /api/cases`);
});

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 7071;
const ROOT = path.resolve(process.cwd());

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
        "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self';",

        ...headers
    });
    res.end(body);
}

function resolveSafePath(relPath) {
    const filePath = path.resolve(ROOT, "." + relPath);
    const relative = path.relative(ROOT, filePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return filePath;
}

http.createServer((req, res) => {
    const baseUrl = `http://${req.headers.host ?? "localhost"}`;
    const requestUrl = new URL(req.url ?? "/", baseUrl);

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
}).listen(PORT, () => {
    console.log(`VulcansTrace dev server: http://localhost:${PORT}/`);
});

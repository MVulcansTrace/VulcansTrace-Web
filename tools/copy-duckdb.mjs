import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, "node_modules", "@duckdb", "duckdb-wasm", "dist");
const DEST = path.join(ROOT, "vendor", "duckdb");

function requireFile(p) {
    if (!fs.existsSync(p)) {
        const listing = fs.existsSync(SRC)
            ? fs.readdirSync(SRC).slice(0, 50).join(", ")
            : "missing dist directory";
        throw new Error(`Missing required file: ${p}. dist listing: ${listing}`);
    }
}

if (!fs.existsSync(SRC)) {
    throw new Error(`DuckDB-WASM dist not found at ${SRC}. Did you run "npm i @duckdb/duckdb-wasm"?`);
}

fs.mkdirSync(DEST, { recursive: true });

const copyJobs = [
    // Task doc expects duckdb-esm.js; current package ships duckdb-browser.mjs.
    { from: "duckdb-browser.mjs", to: "duckdb-esm.js" },
    { from: "duckdb-mvp.wasm", to: "duckdb-mvp.wasm" },
    { from: "duckdb-browser-mvp.worker.js", to: "duckdb-browser-mvp.worker.js" }
];

for (const job of copyJobs) {
    const srcPath = path.join(SRC, job.from);
    const destPath = path.join(DEST, job.to);
    requireFile(srcPath);
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${job.from} -> vendor/duckdb/${job.to}`);
}


import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, "node_modules", "@duckdb", "duckdb-wasm", "dist");
const DEST = path.join(ROOT, "vendor", "duckdb");
const VENDOR = path.join(ROOT, "vendor");

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

function copySelectedFiles(srcRoot, destRoot, shouldCopy) {
    fs.rmSync(destRoot, { recursive: true, force: true });

    const visit = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const srcPath = path.join(dir, entry.name);
            const relPath = path.relative(srcRoot, srcPath);

            if (entry.isDirectory()) {
                visit(srcPath);
                continue;
            }

            if (!entry.isFile() || !shouldCopy(relPath)) continue;

            const destPath = path.join(destRoot, relPath);
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            fs.copyFileSync(srcPath, destPath);
        }
    };

    visit(srcRoot);
}

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

const browserDeps = [
    {
        name: "apache-arrow",
        from: path.join(ROOT, "node_modules", "apache-arrow"),
        shouldCopy: relPath => {
            const rel = relPath.replaceAll(path.sep, "/");
            return (!rel.startsWith("bin/") && rel.endsWith(".mjs"))
                || rel === "LICENSE.txt"
                || rel === "NOTICE.txt"
                || rel === "package.json";
        }
    },
    {
        name: "flatbuffers",
        from: path.join(ROOT, "node_modules", "flatbuffers"),
        shouldCopy: relPath => {
            const rel = relPath.replaceAll(path.sep, "/");
            return (rel.startsWith("mjs/") && rel.endsWith(".js"))
                || rel === "LICENSE"
                || rel === "package.json";
        }
    },
    {
        name: "tslib",
        from: path.join(ROOT, "node_modules", "tslib"),
        shouldCopy: relPath => ["tslib.es6.mjs", "LICENSE.txt", "CopyrightNotice.txt", "package.json"].includes(relPath)
    }
];

for (const dep of browserDeps) {
    if (!fs.existsSync(dep.from)) {
        throw new Error(`Browser dependency not found at ${dep.from}. Did you run "npm install"?`);
    }

    const destPath = path.join(VENDOR, dep.name);
    copySelectedFiles(dep.from, destPath, dep.shouldCopy);
    console.log(`Copied ${dep.name} -> vendor/${dep.name}`);
}

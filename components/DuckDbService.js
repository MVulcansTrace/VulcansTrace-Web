/* DuckDB service for offline SQL over ingested datasets */
import { silentCleanup } from './errorUtils.js';
export class DuckDbService {
    constructor(options = {}) {
        this.options = options || {};

        this.duckdb = null;
        this.worker = null;
        this.db = null;
        this.conn = null;

        this.initPromise = null;
        this.initError = null;

        this.data = {
            flows: [],
            cloudEvents: [],
            datasets: []
        };
        this.dataVersion = 0;
        this.loadedVersion = -1;
        this.refreshPromise = null;
        this.refreshTimer = 0;

        this.lastQueryExecution = null;
    }

    getLastQueryExecution() {
        return this.lastQueryExecution;
    }

    getInitError() {
        return this.initError;
    }

    isReady() {
        return !!(this.conn && this.db);
    }

    setData({ flows, cloudEvents, datasets } = {}) {
        if (Array.isArray(flows)) this.data.flows = flows;
        if (Array.isArray(cloudEvents)) this.data.cloudEvents = cloudEvents;
        if (Array.isArray(datasets)) this.data.datasets = datasets;
        this.dataVersion++;
    }

    scheduleRefresh(delayMs = 150) {
        // Don't auto-initialize DuckDB just because data changed; initialize on first query/open.
        if (!this.isReady() && !this.initPromise) return;
        if (this.refreshTimer) return;
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = 0;
            this.ensureTablesFresh().catch(() => { });
        }, delayMs);
    }

    async ensureReady() {
        if (this.initPromise) return await this.initPromise;
        this.initPromise = this.init();
        return await this.initPromise;
    }

    async init() {
        if (this.isReady()) return true;

        if (typeof window === 'undefined' || typeof document === 'undefined') {
            this.initError = new Error('DuckDB requires a browser environment.');
            throw this.initError;
        }

        if (window.location && window.location.protocol === 'file:') {
            this.initError = new Error('DuckDB requires running from the dev server (npm run dev), not file://.');
            throw this.initError;
        }

        const duckdbModuleUrl = this.options.duckdbModuleUrl
            ? String(this.options.duckdbModuleUrl)
            : new URL('vendor/duckdb/duckdb-esm.js', document.baseURI).toString();

        const wasmUrl = this.options.wasmUrl
            ? String(this.options.wasmUrl)
            : new URL('vendor/duckdb/duckdb-mvp.wasm', document.baseURI).toString();

        const workerUrl = this.options.workerUrl
            ? String(this.options.workerUrl)
            : new URL('vendor/duckdb/duckdb-browser-mvp.worker.js', document.baseURI).toString();

        try {
            this.duckdb = await import(duckdbModuleUrl);
        } catch (e) {
            this.initError = new Error(`Failed to load DuckDB module: ${e && e.message ? e.message : 'Unknown error'}`);
            throw this.initError;
        }

        const manualBundles = {
            mvp: {
                mainModule: wasmUrl,
                mainWorker: workerUrl
            }
        };

        try {
            const bundle = this.duckdb.selectBundle
                ? await this.duckdb.selectBundle(manualBundles)
                : manualBundles.mvp;

            this.worker = new Worker(bundle.mainWorker);
            const logger = this.duckdb.ConsoleLogger ? new this.duckdb.ConsoleLogger() : null;
            this.db = new this.duckdb.AsyncDuckDB(logger, this.worker);
            await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
            this.conn = await this.db.connect();

            await this.ensureTablesFresh(true);
            return true;
        } catch (e) {
            this.initError = new Error(`DuckDB initialization failed: ${e && e.message ? e.message : 'Unknown error'}`);
            silentCleanup(() => this.close(), 'DuckDB cleanup after init failure');
            throw this.initError;
        }
    }

    async ensureTablesFresh(force = false) {
        await this.ensureReady();

        if (!force && this.loadedVersion === this.dataVersion) return;
        if (this.refreshPromise) return await this.refreshPromise;

        const versionToLoad = this.dataVersion;
        this.refreshPromise = (async () => {
            const flows = Array.isArray(this.data.flows) ? this.data.flows : [];
            const cloudEvents = Array.isArray(this.data.cloudEvents) ? this.data.cloudEvents : [];
            const datasets = Array.isArray(this.data.datasets) ? this.data.datasets : [];

            await this.db.registerFileText('flows.json', JSON.stringify(flows));
            await this.db.registerFileText('cloudtrail.json', JSON.stringify(cloudEvents));
            await this.db.registerFileText('datasets.json', JSON.stringify(datasets));

            await this.conn.query("CREATE OR REPLACE TABLE flows AS SELECT * FROM read_json_auto('flows.json');");
            await this.conn.query("CREATE OR REPLACE TABLE cloudtrail AS SELECT * FROM read_json_auto('cloudtrail.json');");
            await this.conn.query("CREATE OR REPLACE TABLE datasets AS SELECT * FROM read_json_auto('datasets.json');");

            this.loadedVersion = versionToLoad;
        })();

        try {
            await this.refreshPromise;
        } finally {
            this.refreshPromise = null;
        }
    }

    async refreshTables({ flows, cloudEvents, datasets } = {}) {
        this.setData({ flows, cloudEvents, datasets });
        await this.ensureTablesFresh(true);
    }

    async runQuery(sql, options = {}) {
        const rowLimit = typeof options.rowLimit === 'number' ? options.rowLimit : 5000;

        await this.ensureTablesFresh();

        const queryText = String(sql || '');
        const startedAt = new Date().toISOString();
        const table = await this.conn.query(queryText);
        const columns = table && table.schema && table.schema.fields
            ? table.schema.fields.map(f => f.name)
            : [];

        const rowObjs = table && typeof table.toArray === 'function' ? table.toArray() : [];
        const totalRows = Array.isArray(rowObjs) ? rowObjs.length : 0;
        const truncated = totalRows > rowLimit;

        const take = truncated ? rowLimit : totalRows;
        const rows = [];
        for (let i = 0; i < take; i++) {
            const obj = rowObjs[i];
            const row = columns.map(c => (obj && Object.prototype.hasOwnProperty.call(obj, c)) ? obj[c] : null);
            rows.push(row);
        }

        const result = { columns, rows, totalRows, truncated };
        this.lastQueryExecution = {
            ts: startedAt,
            sql: queryText,
            result
        };
        return result;
    }

    close() {
        if (this.refreshTimer) {
            silentCleanup(() => clearTimeout(this.refreshTimer), 'DuckDB refresh timer');
        }
        silentCleanup(() => { if (this.conn) this.conn.close(); }, 'DuckDB connection');
        silentCleanup(() => { if (this.db) this.db.terminate(); }, 'DuckDB database');
        if (this.worker) {
            silentCleanup(() => this.worker.terminate(), 'DuckDB worker');
        }

        this.conn = null;
        this.db = null;
        this.worker = null;
        this.duckdb = null;
        this.initPromise = null;
        this.initError = null;
        this.loadedVersion = -1;
        this.refreshPromise = null;
        this.refreshTimer = 0;
    }
}

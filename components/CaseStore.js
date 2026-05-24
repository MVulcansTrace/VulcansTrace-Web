export class CaseStore {
    constructor(options = {}) {
        this.dbName = options.dbName || "vulcanstrace";
        const requestedVersion = Number.isFinite(options.dbVersion) ? options.dbVersion : 2;
        this.dbVersion = Math.max(2, requestedVersion);
        this.db = null;
        this.activeCaseId = null;
        this.storageKeyActiveCase = options.storageKeyActiveCase || "vulcanstrace.activeCaseId";
    }

    async open() {
        if (this.db) return this.db;
        if (typeof indexedDB === "undefined") {
            throw new Error("indexedDB is not available in this environment");
        }

        this.db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.dbVersion);

            req.onupgradeneeded = () => {
                const db = req.result;
                const tx = req.transaction;

                const ensureStore = (name, opts) => {
                    if (!db.objectStoreNames.contains(name)) {
                        return db.createObjectStore(name, opts);
                    }
                    if (!tx) return null;
                    try {
                        return tx.objectStore(name);
                    } catch { // Migration scenario - store may already exist in transaction
                        return null;
                    }
                };

                const ensureIndex = (store, indexName, keyPath, options = {}) => {
                    if (!store) return;
                    if (store.indexNames && store.indexNames.contains(indexName)) return;
                    try {
                        store.createIndex(indexName, keyPath, { unique: false, ...(options || {}) });
                    } catch { // Index creation may fail in older browsers or during constraint errors (non-fatal)
                    }
                };

                ensureStore("cases", { keyPath: "id" });

                if (!db.objectStoreNames.contains("datasets")) {
                    const store = db.createObjectStore("datasets", { keyPath: "id" });
                    store.createIndex("caseId", "caseId", { unique: false });
                } else {
                    const store = ensureStore("datasets", { keyPath: "id" });
                    ensureIndex(store, "caseId", "caseId");
                }

                if (!db.objectStoreNames.contains("queries")) {
                    const store = db.createObjectStore("queries", { keyPath: "id" });
                    store.createIndex("caseId", "caseId", { unique: false });
                } else {
                    const store = ensureStore("queries", { keyPath: "id" });
                    ensureIndex(store, "caseId", "caseId");
                }

                if (!db.objectStoreNames.contains("findings")) {
                    const store = db.createObjectStore("findings", { keyPath: "id" });
                    store.createIndex("caseId", "caseId", { unique: false });
                } else {
                    const store = ensureStore("findings", { keyPath: "id" });
                    ensureIndex(store, "caseId", "caseId");
                }

                // Task 7 stores (durable memory)
                if (!db.objectStoreNames.contains("snapshots")) {
                    const store = db.createObjectStore("snapshots", { keyPath: "id" });
                    store.createIndex("caseId", "caseId", { unique: false });
                    store.createIndex("createdAt", "createdAt", { unique: false });
                } else {
                    const store = ensureStore("snapshots", { keyPath: "id" });
                    ensureIndex(store, "caseId", "caseId");
                    ensureIndex(store, "createdAt", "createdAt");
                }

                if (!db.objectStoreNames.contains("transcript")) {
                    const store = db.createObjectStore("transcript", { keyPath: "id" });
                    store.createIndex("caseId", "caseId", { unique: false });
                    store.createIndex("createdAt", "createdAt", { unique: false });
                } else {
                    const store = ensureStore("transcript", { keyPath: "id" });
                    ensureIndex(store, "caseId", "caseId");
                    ensureIndex(store, "createdAt", "createdAt");
                }

                if (!db.objectStoreNames.contains("allowlist")) {
                    const store = db.createObjectStore("allowlist", { keyPath: "id" });
                    store.createIndex("scope", "scope", { unique: false });
                    store.createIndex("caseId", "caseId", { unique: false });
                } else {
                    const store = ensureStore("allowlist", { keyPath: "id" });
                    ensureIndex(store, "scope", "scope");
                    ensureIndex(store, "caseId", "caseId");
                }
            };

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error("Failed to open IndexedDB"));
        });

        try {
            const stored = localStorage.getItem(this.storageKeyActiveCase);
            this.activeCaseId = stored || null;
        } catch { // localStorage may be unavailable (private mode, quota exceeded) - fall back to null
            this.activeCaseId = null;
        }

        return this.db;
    }

    close() {
        if (this.db) this.db.close();
        this.db = null;
    }

    setActiveCase(caseId) {
        this.activeCaseId = caseId || null;
        try {
            if (this.activeCaseId) {
                localStorage.setItem(this.storageKeyActiveCase, this.activeCaseId);
            } else {
                localStorage.removeItem(this.storageKeyActiveCase);
            }
        } catch { // localStorage may be unavailable (private mode, quota exceeded) - continue without persistence
        }
    }

    getActiveCaseId() {
        return this.activeCaseId;
    }

    async createCase({ name }) {
        await this.open();

        const now = new Date().toISOString();
        const id = CaseStore._id();
        const record = {
            id,
            name: (name || "").toString().trim() || "Untitled Case",
            createdAt: now,
            updatedAt: now
        };

        await this._put("cases", record);
        this.setActiveCase(id);
        return record;
    }

    async listCases() {
        await this.open();
        const rows = await this._getAll("cases");
        rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
        return rows;
    }

    async getCase(caseId) {
        await this.open();
        if (!caseId) return null;
        return await this._get("cases", caseId);
    }

    async updateCase(caseId, patch) {
        await this.open();
        if (!caseId) throw new Error("caseId is required");

        const existing = await this._get("cases", caseId);
        if (!existing) return null;

        const updated = {
            ...existing,
            ...(patch || {}),
            id: existing.id,
            updatedAt: new Date().toISOString()
        };

        await this._put("cases", updated);
        return updated;
    }

    async addDataset(caseId, datasetMeta) {
        await this.open();
        if (!caseId) throw new Error("caseId is required");

        const now = new Date().toISOString();
        const record = {
            id: CaseStore._id(),
            caseId,
            createdAt: now,
            ...(datasetMeta || {})
        };

        await this._put("datasets", record);
        await this.updateCase(caseId, {});
        return record;
    }

    async listDatasets(caseId) {
        await this.open();
        if (!caseId) return [];
        return await this._getAllByIndex("datasets", "caseId", caseId);
    }

    async addQuery(caseId, queryMeta) {
        await this.open();
        if (!caseId) throw new Error("caseId is required");

        const now = new Date().toISOString();
        const record = {
            id: CaseStore._id(),
            caseId,
            createdAt: now,
            updatedAt: now,
            ...(queryMeta || {})
        };

        await this._put("queries", record);
        await this.updateCase(caseId, {});
        return record;
    }

    async saveQuery(caseId, queryMeta) {
        await this.open();
        if (!caseId) throw new Error("caseId is required");

        const now = new Date().toISOString();
        const name = ((queryMeta && queryMeta.name) ? String(queryMeta.name) : "").trim() || "Untitled Query";

        const existing = await this.listQueries(caseId);
        const hit = existing.find(q => String(q.name || "").trim().toLowerCase() === name.toLowerCase()) || null;

        if (hit) {
            const updated = {
                ...hit,
                ...(queryMeta || {}),
                id: hit.id,
                caseId: hit.caseId,
                name,
                createdAt: hit.createdAt || now,
                updatedAt: now
            };
            await this._put("queries", updated);
            await this.updateCase(caseId, {});
            return updated;
        }

        const record = {
            id: CaseStore._id(),
            caseId,
            name,
            createdAt: now,
            updatedAt: now,
            ...(queryMeta || {})
        };

        await this._put("queries", record);
        await this.updateCase(caseId, {});
        return record;
    }

    async listQueries(caseId) {
        await this.open();
        if (!caseId) return [];
        const rows = await this._getAllByIndex("queries", "caseId", caseId);
        rows.sort((a, b) => {
            const au = String(a.updatedAt || a.createdAt || "");
            const bu = String(b.updatedAt || b.createdAt || "");
            return bu.localeCompare(au);
        });
        return rows;
    }

    async addFinding(caseId, findingMeta) {
        await this.open();
        if (!caseId) throw new Error("caseId is required");

        const now = new Date().toISOString();
        const record = {
            id: CaseStore._id(),
            caseId,
            createdAt: now,
            ...(findingMeta || {})
        };

        await this._put("findings", record);
        await this.updateCase(caseId, {});
        return record;
    }

    async listFindings(caseId) {
        await this.open();
        if (!caseId) return [];
        return await this._getAllByIndex("findings", "caseId", caseId);
    }

    async addSnapshot(caseId, snapshot) {
        await this.open();
        if (!caseId) throw new Error("caseId is required");

        const now = new Date().toISOString();
        const record = {
            ...(snapshot || {})
        };

        record.id = record.id || CaseStore._id();
        record.caseId = caseId;
        record.createdAt = record.createdAt || now;

        await this._put("snapshots", record);
        await this.updateCase(caseId, {});
        return record;
    }

    async getSnapshotsByCase(caseId) {
        await this.open();
        if (!caseId) return [];
        const rows = await this._getAllByIndex("snapshots", "caseId", caseId);
        rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        return rows;
    }

    async getLastSnapshots(limit) {
        await this.open();
        const cap = Math.max(0, Math.min(500, Number.isFinite(limit) ? limit : 10));
        if (!cap) return [];

        const activeCaseId = this.getActiveCaseId ? this.getActiveCaseId() : null;
        if (!activeCaseId) {
            return await this._getLastByIndex("snapshots", "createdAt", cap);
        }

        return await this._getLastByIndex("snapshots", "createdAt", cap, (row) => row && row.caseId === activeCaseId);
    }

    async appendTranscript(caseId, entry) {
        await this.open();
        if (!caseId) throw new Error("caseId is required");

        const now = new Date().toISOString();
        const record = {
            ...(entry || {})
        };

        record.id = record.id || CaseStore._id();
        record.caseId = caseId;
        record.createdAt = record.createdAt || now;

        await this._put("transcript", record);
        await this.updateCase(caseId, {});
        return record;
    }

    async listTranscript(caseId, limit) {
        await this.open();
        if (!caseId) return [];
        const rows = await this._getAllByIndex("transcript", "caseId", caseId);
        rows.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
        const cap = Number.isFinite(limit) ? Math.max(0, Math.min(5000, limit)) : 0;
        if (!cap || rows.length <= cap) return rows;
        return rows.slice(Math.max(0, rows.length - cap));
    }

    async addAllowRule(rule) {
        await this.open();

        const now = new Date().toISOString();
        const record = {
            ...(rule || {})
        };

        record.id = record.id || CaseStore._id();
        record.scope = (record.scope != null) ? String(record.scope) : "global";
        record.caseId = record.caseId || null;
        record.createdAt = record.createdAt || now;
        record.updatedAt = now;

        await this._put("allowlist", record);
        if (record.caseId) await this.updateCase(record.caseId, {});
        return record;
    }

    async listAllowRules(scope) {
        await this.open();

        const normalized = (scope == null) ? "" : String(scope).trim();
        let rows = [];

        if (!normalized) {
            rows = await this._getAll("allowlist");
        } else {
            const byScope = await this._getAllByIndexSafe("allowlist", "scope", normalized);
            const byCaseId = await this._getAllByIndexSafe("allowlist", "caseId", normalized);
            const seen = new Set();
            rows = [...byScope, ...byCaseId].filter((r) => {
                const id = r && r.id ? String(r.id) : "";
                if (!id) return false;
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });
        }

        rows.sort((a, b) => {
            const au = String(a.updatedAt || a.createdAt || "");
            const bu = String(b.updatedAt || b.createdAt || "");
            return bu.localeCompare(au);
        });
        return rows;
    }

    async deleteAllowRule(id) {
        await this.open();
        if (!id) return false;
        await this._delete("allowlist", id);
        return true;
    }

    async _get(storeName, key) {
        return await this._request(storeName, "readonly", (store) => store.get(key));
    }

    async _getAll(storeName) {
        return await this._request(storeName, "readonly", (store) => store.getAll());
    }

    async _getAllByIndex(storeName, indexName, value) {
        return await this._request(storeName, "readonly", (store) => store.index(indexName).getAll(value));
    }

    async _getAllByIndexSafe(storeName, indexName, value) {
        await this.open();
        return await new Promise((resolve) => {
            try {
                const tx = this.db.transaction(storeName, "readonly");
                const store = tx.objectStore(storeName);
                if (!store.indexNames || !store.indexNames.contains(indexName)) return resolve([]);
                const req = store.index(indexName).getAll(value);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
                tx.onabort = () => resolve([]);
            } catch { // Index query failed - return empty array as fallback (non-fatal)
                resolve([]);
            }
        });
    }

    async _put(storeName, value) {
        return await this._request(storeName, "readwrite", (store) => store.put(value));
    }

    async _delete(storeName, key) {
        return await this._request(storeName, "readwrite", (store) => store.delete(key));
    }

    async _getLastByIndex(storeName, indexName, limit, filterFn) {
        await this.open();
        const cap = Math.max(0, Math.min(500, Number.isFinite(limit) ? limit : 10));
        if (!cap) return [];

        return await new Promise((resolve, reject) => {
            const out = [];
            let finished = false;

            const tx = this.db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const req = index.openCursor(null, "prev");

            const finishOk = () => {
                if (finished) return;
                finished = true;
                resolve(out);
            };

            req.onsuccess = () => {
                if (finished) return;
                const cursor = req.result;
                if (!cursor) return;

                const value = cursor.value;
                if (!filterFn || filterFn(value)) out.push(value);
                if (out.length >= cap) return;
                cursor.continue();
            };

            req.onerror = () => reject(req.error || new Error(`IndexedDB cursor failed: ${storeName}.${indexName}`));
            tx.onabort = () => reject(tx.error || new Error(`IndexedDB transaction aborted: ${storeName}`));
            tx.oncomplete = () => finishOk();
        });
    }

    async _request(storeName, mode, fn) {
        await this.open();
        return await new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const req = fn(store);

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error(`IndexedDB request failed: ${storeName}`));
            tx.onabort = () => reject(tx.error || new Error(`IndexedDB transaction aborted: ${storeName}`));
        });
    }

    static _id() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
        return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
}

/**
 * Release Service
 * Discovers, indexes, and maintains the global JNTUH Examination Catalog specified in architecture.md (Sections 2, 3, 28).
 * Scrapes JNTUH results portal, compares exam_codes, upserts releases into store, and records sync logs.
 */

const axios = require("axios");
const { parseHomeJspCatalog } = require("../parsers/release.parser");
const cacheService = require("./cache.service");
const storeService = require("./store.service");
const impactService = require("./impact.service");

const CATALOG_CACHE_KEY = "jntuh_exam_catalog";
const CATALOG_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * 24-Hour Automated Catalog Sync Worker
 * Ingests B.Tech examination releases into global catalog & logs progress.
 */
async function syncExamCatalog() {
    const startedAt = new Date().toISOString();
    console.log(`[CATALOG WORKER] Starting JNTUH Examination Catalog synchronization at ${startedAt}...`);

    let recordsFound = 0;
    let newRecords = 0;
    let updatedRecords = 0;

    try {
        const response = await axios.get("http://results.jntuh.ac.in/results/jsp/home.jsp", {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            timeout: 12000
        });

        const liveCatalog = parseHomeJspCatalog(response.data);
        recordsFound = liveCatalog.length;

        if (recordsFound > 0) {
            const existingCatalogMap = new Map();
            storeService.getAllCatalogReleases().forEach(r => existingCatalogMap.set(r.id, r));

            for (const release of liveCatalog) {
                const isNew = !existingCatalogMap.has(release.releaseId);
                const savedRelease = storeService.upsertCatalogRelease(release);
                if (isNew) {
                    newRecords++;
                    // Trigger targeted impact analysis for new release
                    impactService.analyzeReleaseImpact(savedRelease);
                } else {
                    updatedRecords++;
                }
            }

            const updatedCatalog = storeService.getAllCatalogReleases();
            cacheService.set(CATALOG_CACHE_KEY, updatedCatalog, CATALOG_CACHE_DURATION);

            const syncLog = {
                id: `sync_${Date.now()}`,
                startedAt,
                completedAt: new Date().toISOString(),
                recordsFound,
                newRecords,
                updatedRecords,
                status: "SUCCESS",
                error: null
            };
            storeService.addSyncLog(syncLog);
            console.log(`[CATALOG WORKER] Sync completed: ${recordsFound} found, ${newRecords} new, ${updatedRecords} updated.`);
            return { success: true, catalog: updatedCatalog, syncLog };
        } else {
            throw new Error("Parsed 0 B.Tech releases from JNTUH portal HTML");
        }
    } catch (error) {
        console.error("[CATALOG WORKER] Sync failed:", error.message);
        const syncLog = {
            id: `sync_${Date.now()}`,
            startedAt,
            completedAt: new Date().toISOString(),
            recordsFound,
            newRecords: 0,
            updatedRecords: 0,
            status: "FAILED",
            error: error.message
        };
        storeService.addSyncLog(syncLog);
        return { success: false, error: error.message, syncLog };
    }
}

/**
 * Returns cached/stored global examination catalog.
 * Triggers catalog sync if stored catalog is empty.
 */
async function getExamCatalog() {
    const cachedCatalog = cacheService.get(CATALOG_CACHE_KEY);
    if (cachedCatalog && cachedCatalog.length > 0) {
        return cachedCatalog;
    }

    const storedCatalog = storeService.getAllCatalogReleases();
    if (storedCatalog && storedCatalog.length > 0) {
        cacheService.set(CATALOG_CACHE_KEY, storedCatalog, CATALOG_CACHE_DURATION);
        return storedCatalog;
    }

    const syncResult = await syncExamCatalog();
    if (syncResult.success) {
        return syncResult.catalog;
    }

    return [];
}

/**
 * Filters candidate releases for a given result group / cohort, ordered:
 * 1. REGULAR (chronological asc)
 * 2. SUPPLY (chronological asc)
 * 3. RCRV (chronological asc)
 */
function getReleasesForGroup(groupInfo, catalog) {
    const semester = groupInfo.semester;
    const regulation = groupInfo.regulation;

    const groupReleases = catalog.filter(rel =>
        rel.semester === semester &&
        rel.regulation === regulation &&
        !rel.isMinor
    );

    const regular = groupReleases.filter(r => r.attemptType === "REGULAR").sort((a, b) => parseInt(a.examCode, 10) - parseInt(b.examCode, 10));
    const supply = groupReleases.filter(r => r.attemptType === "SUPPLY").sort((a, b) => parseInt(a.examCode, 10) - parseInt(b.examCode, 10));
    const rcrv = groupReleases.filter(r => r.attemptType === "RCRV").sort((a, b) => parseInt(a.examCode, 10) - parseInt(b.examCode, 10));

    return [...regular, ...supply, ...rcrv];
}

module.exports = {
    syncExamCatalog,
    getExamCatalog,
    getReleasesForGroup
};


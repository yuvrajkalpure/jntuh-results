/**
 * Release Service
 * Discovers and indexes JNTUH Result Releases under Result Groups.
 */

const axios = require("axios");
const { parseHomeJspCatalog } = require("../parsers/release.parser");
const cacheService = require("./cache.service");

const CATALOG_CACHE_KEY = "jntuh_exam_catalog";
const CATALOG_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

async function getExamCatalog() {
    const cachedCatalog = cacheService.get(CATALOG_CACHE_KEY);
    if (cachedCatalog) {
        return cachedCatalog;
    }

    try {
        console.log("[RELEASE SERVICE] Scraping live JNTUH home.jsp catalog...");
        const response = await axios.get("http://results.jntuh.ac.in/results/jsp/home.jsp", {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 10000
        });

        const catalog = parseHomeJspCatalog(response.data);

        if (catalog.length > 0) {
            cacheService.set(CATALOG_CACHE_KEY, catalog, CATALOG_CACHE_DURATION);
            console.log(`[RELEASE SERVICE] Successfully parsed and cached ${catalog.length} main B.Tech exam releases.`);
            return catalog;
        }
    } catch (error) {
        console.error("[RELEASE SERVICE] Scraping home.jsp failed:", error.message);
    }

    return [];
}

function getReleasesForGroup(groupInfo, catalog) {
    const semester = groupInfo.semester;
    const regulation = groupInfo.regulation;

    // Filter releases belonging to this result group, ordered Regular -> Supply -> RCRV
    const groupReleases = catalog.filter(rel =>
        rel.semester === semester &&
        rel.regulation === regulation &&
        !rel.isMinor
    );

    // Order: Regular first, then Supply chronologically by examCode ascending, then RCRV
    const regular = groupReleases.filter(r => r.attemptType === "REGULAR").sort((a, b) => parseInt(a.examCode, 10) - parseInt(b.examCode, 10));
    const supply = groupReleases.filter(r => r.attemptType === "SUPPLY").sort((a, b) => parseInt(a.examCode, 10) - parseInt(b.examCode, 10));
    const rcrv = groupReleases.filter(r => r.attemptType === "RCRV").sort((a, b) => parseInt(a.examCode, 10) - parseInt(b.examCode, 10));

    return [...regular, ...supply, ...rcrv];
}

module.exports = {
    getExamCatalog,
    getReleasesForGroup
};

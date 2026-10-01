/**
 * Result Controller
 * Delegates incoming API requests to Search Service.
 */

const searchService = require("../services/search.service");
const releaseService = require("../services/release.service");
const storeService = require("../services/store.service");

async function getStudentResult(req, res) {
    try {
        const rawHtno = req.params.htno || req.query.htno;
        const result = await searchService.searchStudent(rawHtno);

        if (!result.success) {
            return res.status(404).json(result);
        }

        return res.json(result);

    } catch (error) {
        if (error.message === "INVALID_HALLTICKET") {
            return res.status(404).json({
                success: false,
                error: {
                    code: "INVALID_HALLTICKET",
                    message: "Invalid Hall Ticket Number."
                }
            });
        }

        console.error("[CONTROLLER] Error processing request:", error);
        return res.status(404).json({
            success: false,
            error: {
                code: "SERVER_ERROR",
                message: "Unable to retrieve student result."
            }
        });
    }
}

async function getCatalogStatus(req, res) {
    try {
        const releases = storeService.getAllCatalogReleases();
        const lastSync = storeService.getLastSyncLog();
        return res.json({
            success: true,
            catalogReleasesCount: releases.length,
            lastSyncLog: lastSync,
            sampleReleases: releases.slice(0, 10)
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

async function triggerCatalogSync(req, res) {
    try {
        const syncResult = await releaseService.syncExamCatalog();
        return res.json(syncResult);
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = {
    getStudentResult,
    getCatalogStatus,
    triggerCatalogSync
};


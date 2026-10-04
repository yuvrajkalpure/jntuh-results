/**
 * JNTUH Results Server Entry Point
 */

const express = require("express");
const cors = require("cors");
const resultRoutes = require("./routes/result.routes");
const releaseService = require("./services/release.service");
const workerService = require("./services/worker.service");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* Root API Status */
const statusHandler = (req, res) => {
    res.json({
        status: "ok",
        message: "JNTUH Results Backend REST API Server",
        architecture: "PERSISTENT_RESULT_STORE -> EXAM_CATALOG -> IMPACT_ANALYZER -> RESULT_CHECK_QUEUE",
        endpoints: [
            "GET /api/results/:htno",
            "GET /api/result/:htno",
            "GET /api/result?htno=:htno",
            "GET /api/catalog/status",
            "POST /api/catalog/sync"
        ]
    });
};

app.get("/", statusHandler);
app.get("/api", statusHandler);

/* Mount API routes */
app.use("/api", resultRoutes);

// Initialize 24-hour JNTUH Examination Catalog Synchronization Worker & Result Check Queue Worker
const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", async () => {
        console.log(`[SERVER] JNTUH Results API running on port ${PORT}`);
        
        // Start background result check queue worker
        workerService.startQueueWorker(30000, 5);

        // Initial catalog sync on startup
        try {
            await releaseService.syncExamCatalog();
        } catch (err) {
            console.warn("[SERVER] Startup catalog sync warning:", err.message);
        }

        // Schedule catalog sync worker every 24 hours
        setInterval(async () => {
            console.log("[SERVER] Scheduled 24-hour catalog sync triggered...");
            try {
                await releaseService.syncExamCatalog();
            } catch (err) {
                console.error("[SERVER] Scheduled catalog sync error:", err.message);
            }
        }, SYNC_INTERVAL);
    });
}

module.exports = app;

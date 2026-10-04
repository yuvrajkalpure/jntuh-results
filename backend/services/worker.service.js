/**
 * Controlled Queue Worker Service
 * Processes background result checks from the Result Check Queue gradually.
 * Prevents hammering JNTUH servers while keeping the Persistent Result Store updated.
 */

const storeService = require("./store.service");
const batchService = require("./batch.service");
const jntuhService = require("./jntuh.service");
const resultParser = require("../parsers/result.parser");

let isWorkerRunning = false;

/**
 * Processes a single pending result check job from the queue.
 */
async function processJob(job) {
    const { id, htno, releaseId } = job;
    const release = storeService.data.jntuh_exam_releases[releaseId];

    if (!release) {
        console.warn(`[QUEUE WORKER] Release ${releaseId} not found in catalog for job ${id}.`);
        storeService.updatePendingJob(id, "FAILED", "RELEASE_NOT_FOUND");
        return;
    }

    const batchInfo = batchService.resolveBatch(htno);
    storeService.updatePendingJob(id, "PROCESSING");

    try {
        const html = await jntuhService.fetchRawResultHtml(htno, release);
        if (html) {
            const parsed = resultParser.parseResultHtml(html, release);
            if (parsed.success) {
                storeService.saveStudentResult(htno, batchInfo, parsed);
                storeService.recordReleaseCheck(htno, releaseId, "FOUND");
                console.log(`[QUEUE WORKER] Successfully fetched and stored result for ${htno} (${release.examCode}).`);
            } else {
                storeService.saveNoResult(htno, batchInfo, release);
                storeService.recordReleaseCheck(htno, releaseId, "NO_RESULT");
            }
        } else {
            storeService.saveNoResult(htno, batchInfo, release);
            storeService.recordReleaseCheck(htno, releaseId, "NO_RESULT");
        }
        storeService.updatePendingJob(id, "COMPLETED");
    } catch (error) {
        console.warn(`[QUEUE WORKER] Error processing job ${id} for ${htno}:`, error.message);
        if ((job.attempts || 0) >= 3) {
            storeService.updatePendingJob(id, "FAILED", error.message);
        } else {
            // Re-mark pending for retry
            storeService.updatePendingJob(id, "PENDING", error.message);
        }
    }
}

/**
 * Executes a single queue worker iteration processing up to batchSize jobs.
 */
async function runWorkerIteration(batchSize = 5) {
    if (isWorkerRunning) return;
    isWorkerRunning = true;

    try {
        const pendingJobs = storeService.getPendingResultChecks(batchSize);
        if (pendingJobs && pendingJobs.length > 0) {
            console.log(`[QUEUE WORKER] Processing batch of ${pendingJobs.length} background result check jobs...`);
            for (const job of pendingJobs) {
                await processJob(job);
                // Respectful rate limiting delay between student requests (e.g. 1.5 seconds)
                await new Promise(res => setTimeout(res, 1500));
            }
        }
    } catch (err) {
        console.error("[QUEUE WORKER] Iteration error:", err.message);
    } finally {
        isWorkerRunning = false;
    }
}

/**
 * Starts the background queue worker timer.
 */
function startQueueWorker(intervalMs = 30000, batchSize = 5) {
    console.log(`[QUEUE WORKER] Starting Result Check Queue Worker (runs every ${intervalMs / 1000}s, batch size ${batchSize})...`);
    setInterval(() => {
        runWorkerIteration(batchSize);
    }, intervalMs);
}

module.exports = {
    processJob,
    runWorkerIteration,
    startQueueWorker
};

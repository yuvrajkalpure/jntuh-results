/**
 * Result Routes
 * Express routes for student results matching architecture.md specifications.
 */

const express = require("express");
const router = express.Router();
const resultController = require("../controllers/result.controller");

router.get("/results/:htno/checks", resultController.getStudentReleaseChecks);
router.get("/results/:htno/store", resultController.getStudentStoreSummary);

router.get("/results/:htno", resultController.getStudentResult);
router.get("/result/:htno", resultController.getStudentResult);
router.get("/result", resultController.getStudentResult);

router.get("/catalog/status", resultController.getCatalogStatus);
router.post("/catalog/sync", resultController.triggerCatalogSync);

router.get("/store/retention", resultController.getRetentionStatus);
router.post("/store/cleanup", resultController.triggerRetentionCleanup);

module.exports = router;

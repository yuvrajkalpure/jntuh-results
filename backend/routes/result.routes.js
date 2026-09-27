/**
 * Result Routes
 * Express routes for student results matching architecture.md specifications.
 */

const express = require("express");
const router = express.Router();
const resultController = require("../controllers/result.controller");

router.get("/results/:htno", resultController.getStudentResult);
router.get("/result/:htno", resultController.getStudentResult);
router.get("/result", resultController.getStudentResult);

module.exports = router;

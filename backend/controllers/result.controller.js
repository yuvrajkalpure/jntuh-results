/**
 * Result Controller
 * Delegates incoming API requests to Search Service.
 */

const searchService = require("../services/search.service");

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

module.exports = {
    getStudentResult
};

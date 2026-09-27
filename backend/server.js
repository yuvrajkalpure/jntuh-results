/**
 * JNTUH Results Server Entry Point
 */

const express = require("express");
const cors = require("cors");
const resultRoutes = require("./routes/result.routes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* Root API Status */
app.get("/", (req, res) => {
    res.json({
        status: "ok",
        message: "JNTUH Results Backend REST API Server",
        architecture: "BATCH -> STUDENT -> STUDENT_RESULT -> RESULT_RELEASE -> RESULT_GROUP",
        endpoints: [
            "GET /api/results/:htno",
            "GET /api/result/:htno",
            "GET /api/result?htno=:htno"
        ]
    });
});

/* Mount API routes */
app.use("/api", resultRoutes);

app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] JNTUH Results API running on port ${PORT}`);
});

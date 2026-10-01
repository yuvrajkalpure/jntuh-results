/**
 * JNTUH Service
 * Constructs and executes HTTP requests to JNTUH resultAction endpoint.
 */

const axios = require("axios");

async function fetchRawResultHtml(htno, candidate) {
    try {
        const isRCRV = candidate.attemptType === "RCRV" || String(candidate.title || "").toLowerCase().includes("rc/rv");
        const defaultType = isRCRV ? "rcrvintgrade" : "intgrade";
        const defaultResult = isRCRV ? "gradercrv" : "null";

        const etype = candidate.request?.etype || "r17";
        const resultParam = candidate.request?.result || defaultResult;
        const typeParam = candidate.request?.type || defaultType;

        const formData = new URLSearchParams();
        formData.append("degree", "btech");
        formData.append("examCode", candidate.examCode);
        formData.append("etype", etype);
        formData.append("result", resultParam);
        formData.append("grad", "null");
        formData.append("type", typeParam);
        formData.append("htno", htno);

        const response = await axios.post(
            "http://results.jntuh.ac.in/results/resultAction",
            formData.toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Referer": `http://results.jntuh.ac.in/results/jsp/SearchResult.jsp?degree=btech&examCode=${candidate.examCode}&etype=${etype}&result=${resultParam}&type=${typeParam}`
                },
                timeout: 15000,
                responseType: "text",
                validateStatus: () => true
            }
        );

        if (response.status !== 200) {
            return null;
        }

        return response.data;
    } catch (error) {
        console.error(`[JNTUH SERVICE] Error fetching examCode ${candidate.examCode} for HTNO ${htno}:`, error.message);
        return null;
    }
}

module.exports = {
    fetchRawResultHtml
};

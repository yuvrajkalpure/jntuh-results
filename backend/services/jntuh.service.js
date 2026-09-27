/**
 * JNTUH Service
 * Constructs and executes HTTP requests to JNTUH resultAction endpoint.
 */

const axios = require("axios");

async function fetchRawResultHtml(htno, candidate) {
    try {
        const formData = new URLSearchParams();
        formData.append("degree", "btech");
        formData.append("examCode", candidate.examCode);
        formData.append("etype", candidate.request?.etype || "r17");
        formData.append("result", candidate.request?.result || "null");
        formData.append("grad", "null");
        formData.append("type", candidate.request?.type || "intgrade");
        formData.append("htno", htno);

        const response = await axios.post(
            "http://results.jntuh.ac.in/results/resultAction",
            formData.toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Referer": `http://results.jntuh.ac.in/results/jsp/SearchResult.jsp?degree=btech&examCode=${candidate.examCode}&etype=${candidate.request?.etype || 'r17'}&type=intgrade`
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

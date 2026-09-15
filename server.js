const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* Static files */
app.use(express.static("public"));

app.get("/", (req, res) => {
    res.sendFile(path.resolve("public/index.html"));
});

/*
|--------------------------------------------------------------------------
| EXAM CODES LIST (Arranged 3-2 to 1-1 descending)
|--------------------------------------------------------------------------
*/
const EXAMS = [
    { code: "1964", semester: "3-2" },
    { code: "1942", semester: "3-1" },
    { code: "1913", semester: "2-2" },
    { code: "1833", semester: "2-1" },
    { code: "1800", semester: "1-2" },
    { code: "1763", semester: "1-1" }
];

/* Result API */
app.get("/api/result", async (req, res) => {
    try {
        const htno = req.query.htno?.trim().toUpperCase();

        if (!htno || !/^[A-Z0-9]+$/.test(htno)) {
            return res.status(404).json({
                success: false,
                message: "Invalid Hall Ticket Number."
            });
        }

        /* Fetch all semesters in parallel */
        const semesterResults = await Promise.all(
            EXAMS.map(exam => fetchSemesterResult(htno, exam.code, exam.semester))
        );

        const successfulSemesters = semesterResults.filter(sem => sem.success);

        if (successfulSemesters.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Invalid Hall Ticket Number or no results found.",
                htno: htno
            });
        }

        // Aggregate student details from first successful semester
        const firstDetails = successfulSemesters.find(s => s.details && (s.details.name || s.details.fatherName))?.details || {};

        const overallSummary = calculateOverallSummary(successfulSemesters);

        res.json({
            success: true,
            htno: htno,
            details: {
                name: firstDetails.name || "",
                htno: firstDetails.htno || htno,
                fatherName: firstDetails.fatherName || ""
            },
            overallSummary: overallSummary,
            semesters: successfulSemesters
        });

    } catch (error) {
        res.status(404).json({
            success: false,
            message: "Invalid Hall Ticket Number."
        });
    }
});

/* Fetch single semester result */
async function fetchSemesterResult(htno, examCode, semesterLabel) {
    try {
        const formData = new URLSearchParams();
        formData.append("degree", "btech");
        formData.append("examCode", examCode);
        formData.append("etype", "r17");
        formData.append("result", "null");
        formData.append("grad", "null");
        formData.append("type", "intgrade");
        formData.append("htno", htno);

        const response = await axios.post(
            "http://results.jntuh.ac.in/results/resultAction",
            formData.toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0",
                    "Referer": "http://results.jntuh.ac.in/results/jsp/SearchResult.jsp?degree=btech&examCode=" + examCode + "&etype=r17&type=intgrade"
                },
                timeout: 15000,
                responseType: "text",
                validateStatus: () => true
            }
        );

        if (response.status !== 200) {
            return { semester: semesterLabel, examCode, success: false };
        }

        const html = response.data;
        const lowerHtml = String(html).toLowerCase();

        if (
            lowerHtml.includes("invalid hallticket") ||
            lowerHtml.includes("invalid hall ticket") ||
            lowerHtml.includes("invalid htno") ||
            lowerHtml.includes("exception") ||
            lowerHtml.includes("internal server error") ||
            lowerHtml.includes("nullpointerexception")
        ) {
            return { semester: semesterLabel, examCode, success: false };
        }

        const $ = cheerio.load(html);
        const resultTable = findStudentResultTable($);

        if (!resultTable) {
            return { semester: semesterLabel, examCode, success: false };
        }

        const studentInfo = extractStudentInfo($);
        const summary = calculateGPA(resultTable);

        return {
            semester: semesterLabel,
            examCode: examCode,
            success: true,
            details: studentInfo.details,
            examTitle: studentInfo.examTitle,
            summary: summary,
            table: resultTable
        };
    } catch {
        return { semester: semesterLabel, examCode, success: false };
    }
}

/* Overall Summary Calculation across all semesters */
function calculateOverallSummary(semesters) {
    let totalWeightedPoints = 0;
    let totalSemesterCredits = 0;
    let totalEarnedCredits = 0;
    let anyFailed = false;

    semesters.forEach(sem => {
        if (!sem.summary) return;
        const semCredits = sem.summary.totalCredits || 20;
        totalSemesterCredits += semCredits;
        totalEarnedCredits += sem.summary.earnedCredits || 0;

        if (sem.summary.isFailed) {
            anyFailed = true;
        } else if (sem.summary.sgpa != null) {
            totalWeightedPoints += sem.summary.sgpa * semCredits;
        }
    });

    if (totalSemesterCredits === 0 || anyFailed) {
        return {
            cgpa: null,
            percentage: null,
            totalEarnedCredits,
            totalCredits: totalSemesterCredits,
            isFailed: anyFailed,
            totalSemesters: semesters.length
        };
    }

    const cgpa = (totalWeightedPoints / totalSemesterCredits).toFixed(2);
    const percentage = Math.max(0, (parseFloat(cgpa) - 0.5) * 10).toFixed(2);

    return {
        cgpa: parseFloat(cgpa),
        percentage: parseFloat(percentage),
        totalEarnedCredits,
        totalCredits: totalSemesterCredits,
        isFailed: false,
        totalSemesters: semesters.length
    };
}

/* Helpers */
function findStudentResultTable($) {
    let bestTable = null;
    let bestScore = -1;

    $("table").each((_, table) => {
        const text = $(table).text().replace(/\s+/g, " ").trim();
        const lowerText = text.toLowerCase();

        const isGradeGuidelinesTable =
            lowerText.includes("% of marks secured in a subject") ||
            lowerText.includes("letter grade (ugc guide lines)") ||
            lowerText.includes("grade points(g)") ||
            lowerText.includes("greater than or equal to 90");

        if (isGradeGuidelinesTable) return;

        const rows = [];
        $(table).find("tr").each((_, row) => {
            const cells = [];
            $(row).find("th, td").each((_, cell) => {
                const value = $(cell).text().replace(/\s+/g, " ").trim();
                if (value) cells.push(value);
            });
            if (cells.length > 0) rows.push(cells);
        });

        if (rows.length < 2) return;

        let score = 0;
        const keywords = ["subject", "code", "grade", "credits", "credit", "marks", "internal", "external", "mid", "semester"];
        keywords.forEach(kw => {
            if (lowerText.includes(kw)) score++;
        });

        if (lowerText.includes("subject")) score += 5;
        if (lowerText.includes("grade")) score += 2;
        if (lowerText.includes("credits")) score += 2;

        if (score > bestScore) {
            bestScore = score;
            bestTable = rows;
        }
    });

    return bestTable;
}

function extractStudentInfo($) {
    const details = {};
    let examTitle = "";

    $("h6, h5, h4, h3, h2, h1, div, p").each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (!examTitle && text.toLowerCase().includes("result of")) {
            examTitle = text;
        }
    });

    $("table").each((_, table) => {
        const tableText = $(table).text().toLowerCase();
        if (
            tableText.includes("htno:") ||
            tableText.includes("father name:") ||
            tableText.includes("college code:") ||
            (tableText.includes("name:") && !tableText.includes("subject"))
        ) {
            $(table).find("tr").each((_, tr) => {
                const cells = $(tr).find("td");
                cells.each((index, td) => {
                    const text = $(td).text().replace(/\s+/g, " ").trim();
                    const upper = text.toUpperCase();

                    if (upper.includes("FATHER NAME:")) {
                        const val = $(cells[index + 1]).text().replace(/\s+/g, " ").trim();
                        if (val) details.fatherName = val;
                    } else if (upper.includes("HTNO:")) {
                        const val = $(cells[index + 1]).text().replace(/\s+/g, " ").trim();
                        if (val) details.htno = val;
                    } else if (upper.includes("NAME:") && !upper.includes("FATHER")) {
                        const val = $(cells[index + 1]).text().replace(/\s+/g, " ").trim();
                        if (val) details.name = val;
                    } else if (upper.includes("COLLEGE CODE:")) {
                        const val = $(cells[index + 1]).text().replace(/\s+/g, " ").trim();
                        if (val) details.collegeCode = val;
                    }
                });
            });
        }
    });

    return { details, examTitle };
}

const GRADE_POINTS = {
    "O": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "C": 5, "F": 0, "AB": 0, "ABSENT": 0
};

function calculateGPA(table) {
    if (!table || table.length < 2) return null;

    const headers = table[0].map(h => String(h).toLowerCase().trim());
    const gradeIdx = headers.findIndex(h => h.includes("grade") && !h.includes("point"));
    const creditIdx = headers.findIndex(h => h.includes("credit") || h === "c");

    if (gradeIdx === -1 || creditIdx === -1) return null;

    let earnedCredits = 0;
    let totalWeightedPoints = 0;
    let totalSubjects = 0;
    let passedSubjects = 0;
    let failedSubjects = 0;
    let sumSubjectCredits = 0;

    for (let i = 1; i < table.length; i++) {
        const row = table[i];
        if (!row || row.length <= Math.max(gradeIdx, creditIdx)) continue;

        const gradeStr = String(row[gradeIdx]).trim().toUpperCase();
        const creditStr = String(row[creditIdx]).trim();
        const credit = parseFloat(creditStr);

        if (isNaN(credit)) continue;

        totalSubjects++;
        sumSubjectCredits += credit;

        const points = GRADE_POINTS[gradeStr] !== undefined ? GRADE_POINTS[gradeStr] : null;

        if (points !== null) {
            totalWeightedPoints += credit * points;
            if (gradeStr !== "F" && gradeStr !== "AB" && gradeStr !== "ABSENT") {
                earnedCredits += credit;
                passedSubjects++;
            } else {
                failedSubjects++;
            }
        }
    }

    const totalCredits = Math.max(20, sumSubjectCredits);

    if (failedSubjects > 0) {
        return {
            sgpa: null,
            percentage: null,
            totalCredits,
            earnedCredits,
            totalSubjects,
            passedSubjects,
            failedSubjects,
            isFailed: true
        };
    }

    const sgpa = (totalWeightedPoints / totalCredits).toFixed(2);
    const percentage = Math.max(0, (parseFloat(sgpa) - 0.5) * 10).toFixed(2);

    return {
        sgpa: parseFloat(sgpa),
        percentage: parseFloat(percentage),
        totalCredits,
        earnedCredits,
        totalSubjects,
        passedSubjects,
        failedSubjects,
        isFailed: false
    };
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});

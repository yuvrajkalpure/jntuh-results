/**
 * Result Parser
 * Parses individual JNTUH student result HTML pages and extracts subject tables, student info, and GPA.
 */

const cheerio = require("cheerio");
const { cleanText } = require("../utils/normalization.utils");

const GRADE_POINTS = {
    "O": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "C": 5, "F": 0, "AB": 0, "ABSENT": 0
};

function parseResultHtml(html, releaseInfo) {
    if (!html) {
        return { success: false, reason: "EMPTY_RESPONSE" };
    }

    const lowerHtml = String(html).toLowerCase();

    if (
        lowerHtml.includes("invalid hallticket") ||
        lowerHtml.includes("invalid hall ticket") ||
        lowerHtml.includes("invalid htno") ||
        lowerHtml.includes("exception") ||
        lowerHtml.includes("internal server error") ||
        lowerHtml.includes("nullpointerexception")
    ) {
        return { success: false, reason: "INVALID_HALLTICKET" };
    }

    const $ = cheerio.load(html);
    const resultTable = findStudentResultTable($);

    if (!resultTable || resultTable.length < 2) {
        return { success: false, reason: "NO_RESULT_TABLE" };
    }

    const studentInfo = extractStudentInfo($);
    const summary = calculateGPA(resultTable);
    const subjects = extractSubjectObjects(resultTable);

    return {
        success: true,
        semester: releaseInfo.semester,
        examCode: releaseInfo.examCode,
        attemptType: releaseInfo.attemptType,
        title: releaseInfo.title,
        details: studentInfo.details,
        examTitle: studentInfo.examTitle || releaseInfo.title,
        summary: summary,
        subjects: subjects,
        table: resultTable
    };
}

function findStudentResultTable($) {
    let bestTable = null;
    let bestScore = -1;

    $("table").each((_, table) => {
        const text = cleanText($(table).text());
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
                const value = cleanText($(cell).text());
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
        const text = cleanText($(el).text());
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
                    const text = cleanText($(td).text());
                    const upper = text.toUpperCase();

                    if (upper.includes("FATHER NAME:")) {
                        const val = cleanText($(cells[index + 1]).text());
                        if (val) details.fatherName = val;
                    } else if (upper.includes("HTNO:")) {
                        const val = cleanText($(cells[index + 1]).text());
                        if (val) details.htno = val;
                    } else if (upper.includes("NAME:") && !upper.includes("FATHER")) {
                        const val = cleanText($(cells[index + 1]).text());
                        if (val) details.name = val;
                    } else if (upper.includes("COLLEGE CODE:")) {
                        const val = cleanText($(cells[index + 1]).text());
                        if (val) details.collegeCode = val;
                    }
                });
            });
        }
    });

    return { details, examTitle };
}

function extractSubjectObjects(table) {
    if (!table || table.length < 2) return [];

    const headers = table[0].map(h => String(h).toLowerCase().trim());
    const codeIdx = headers.findIndex(h => h.includes("code"));
    const nameIdx = headers.findIndex(h => h.includes("subject") && !h.includes("code"));
    const internalIdx = headers.findIndex(h => h.includes("internal") || h.includes("int"));
    const externalIdx = headers.findIndex(h => h.includes("external") || h.includes("ext"));
    const totalIdx = headers.findIndex(h => h.includes("total"));
    const gradeIdx = headers.findIndex(h => h.includes("grade") && !h.includes("point"));
    const creditIdx = headers.findIndex(h => h.includes("credit") || h === "c");

    const subjects = [];
    for (let i = 1; i < table.length; i++) {
        const row = table[i];
        if (!row || row.length <= 1) continue;

        subjects.push({
            subjectCode: codeIdx !== -1 ? row[codeIdx] : "",
            subjectName: nameIdx !== -1 ? row[nameIdx] : "",
            internalMarks: internalIdx !== -1 ? row[internalIdx] : "",
            externalMarks: externalIdx !== -1 ? row[externalIdx] : "",
            totalMarks: totalIdx !== -1 ? row[totalIdx] : "",
            grade: gradeIdx !== -1 ? row[gradeIdx] : "",
            credits: creditIdx !== -1 ? row[creditIdx] : ""
        });
    }

    return subjects;
}

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

module.exports = {
    parseResultHtml,
    findStudentResultTable,
    extractStudentInfo,
    extractSubjectObjects,
    calculateGPA
};

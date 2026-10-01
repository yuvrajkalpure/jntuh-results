/**
 * Aggregation Service
 * Combines semester attempt results, computes per-subject attempt history with marks,
 * generates direct JNTUH official result URLs, and computes overall academic summary.
 */

const { calculateGPA } = require("../parsers/result.parser");
const { getSemestersOrder } = require("../utils/semester.utils");

function buildJntuhUrl(htno, candidate) {
    const etype = candidate.request?.etype || "r17";
    const resultParam = candidate.request?.result || "null";
    const typeParam = candidate.request?.type || "intgrade";
    const examCode = candidate.examCode;

    return `http://results.jntuh.ac.in/results/resultAction?degree=btech&examCode=${examCode}&etype=${etype}&result=${resultParam}&grad=null&type=${typeParam}&htno=${encodeURIComponent(htno)}`;
}

function processSemesterGroup(group, htno) {
    if (!group || group.length === 0) return null;

    // Attach direct JNTUH URL to each attempt in group
    group.forEach(item => {
        item.jntuhUrl = buildJntuhUrl(htno, item);
    });

    const firstNonRCRV = group.find(item => {
        const titleLower = String(item.examTitle || item.title || "").toLowerCase();
        return item.attemptType !== "RCRV" && !titleLower.includes("rc/rv") && !titleLower.includes("revaluation");
    });
    const primary = firstNonRCRV || group[0];

    // Map subject attempts across all attempts in chronological order
    const subjectMap = new Map();

    group.forEach(item => {
        if (!item.subjects || !Array.isArray(item.subjects)) return;

        const titleLower = String(item.examTitle || item.title || "").toLowerCase();
        const isRCRV = item.attemptType === "RCRV" || titleLower.includes("rc/rv") || titleLower.includes("revaluation");

        let resolvedType = "Supplementary";
        if (isRCRV) {
            resolvedType = "RC/RV";
        } else if (item === firstNonRCRV) {
            resolvedType = "Regular";
        } else {
            resolvedType = "Supplementary";
        }

        item.subjects.forEach(sub => {
            const code = String(sub.subjectCode).trim().toUpperCase();
            if (!code) return;

            if (!subjectMap.has(code)) {
                subjectMap.set(code, {
                    subjectCode: code,
                    subjectName: sub.subjectName,
                    credits: sub.credits,
                    attemptsCount: 0,
                    finalGrade: sub.grade,
                    finalMarks: {
                        internal: sub.internalMarks,
                        external: sub.externalMarks,
                        total: sub.totalMarks,
                        grade: sub.grade,
                        credits: sub.credits
                    },
                    attemptsHistory: []
                });
            }

            const record = subjectMap.get(code);

            let isNoChange = false;
            if (isRCRV && record.attemptsHistory.length > 0) {
                const prev = record.attemptsHistory[record.attemptsHistory.length - 1];
                isNoChange = (
                    String(sub.internalMarks || '').trim() === String(prev.internalMarks || '').trim() &&
                    String(sub.externalMarks || '').trim() === String(prev.externalMarks || '').trim() &&
                    String(sub.totalMarks || '').trim() === String(prev.totalMarks || '').trim() &&
                    String(sub.grade || '').trim().toUpperCase() === String(prev.grade || '').trim().toUpperCase()
                );
            }

            // Incremented ONLY for actual exam sittings (non-RC/RV)
            if (!isRCRV) {
                record.attemptsCount += 1;
            }

            const attemptEntry = {
                attemptNumber: record.attemptsCount,
                examType: resolvedType,
                examTitle: item.examTitle || item.title,
                jntuhUrl: item.jntuhUrl,
                internalMarks: sub.internalMarks,
                externalMarks: sub.externalMarks,
                totalMarks: sub.totalMarks,
                grade: sub.grade,
                credits: sub.credits,
                ...(isRCRV ? { isNoChange, remarks: isNoChange ? "No Change" : "Grade/Marks Updated" } : {})
            };

            record.attemptsHistory.push(attemptEntry);

            // Update final marks if this attempt passed or improved grade
            const gradeUpper = String(sub.grade).trim().toUpperCase();
            const isPass = gradeUpper !== "F" && gradeUpper !== "AB" && gradeUpper !== "ABSENT" && gradeUpper !== "COMPLETION_PENDING" && gradeUpper !== "CP" && gradeUpper !== "FAIL" && gradeUpper !== "FAILED" && gradeUpper !== "-";
            if (isPass || !isNoChange) {
                if (isPass || record.finalGrade === "F" || record.finalGrade === "AB") {
                    record.finalGrade = sub.grade;
                    record.finalMarks = {
                        internal: sub.internalMarks,
                        external: sub.externalMarks,
                        total: sub.totalMarks,
                        grade: sub.grade,
                        credits: sub.credits
                    };
                }
            }
        });
    });

    const subjectsList = Array.from(subjectMap.values());

    const attemptsList = group
        .filter(g => {
            const titleLower = String(g.examTitle || g.title || "").toLowerCase();
            return g.attemptType !== "RCRV" && !titleLower.includes("rc/rv") && !titleLower.includes("revaluation");
        })
        .map(g => {
            let resolvedType = (g === firstNonRCRV) ? "Regular" : "Supplementary";
            return {
                examType: resolvedType,
                title: g.title,
                examTitle: g.examTitle || g.title,
                jntuhUrl: g.jntuhUrl
            };
        });

    // Build normalized display table with Attempts column
    const tableHeader = ["Subject Code", "Subject Name", "Internal", "External", "Total", "Grade", "Credits", "Attempts"];
    const tableRows = subjectsList.map(s => [
        s.subjectCode,
        s.subjectName,
        s.finalMarks.internal,
        s.finalMarks.external,
        s.finalMarks.total,
        s.finalMarks.grade,
        s.finalMarks.credits,
        `${s.attemptsCount} Attempt${s.attemptsCount > 1 ? 's' : ''}`
    ]);

    const displayTable = [tableHeader, ...tableRows];
    const summary = calculateGPA(displayTable);

    return {
        semester: primary.semester,
        title: primary.title,
        examTitle: primary.examTitle || primary.title,
        jntuhUrl: primary.jntuhUrl,
        attempts: attemptsList,
        summary: summary,
        subjectsList: subjectsList,
        table: displayTable
    };
}

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

function aggregateStudentResults(successfulFetches, isLateral = false, htno = "") {
    if (!successfulFetches || successfulFetches.length === 0) {
        return null;
    }

    // Group results by semester
    const semesterGroups = {};
    successfulFetches.forEach(item => {
        const semKey = item.semester;
        if (!semesterGroups[semKey]) semesterGroups[semKey] = [];
        semesterGroups[semKey].push(item);
    });

    const semestersOrder = getSemestersOrder(isLateral);
    const combinedSemesters = [];

    semestersOrder.forEach(semKey => {
        const group = semesterGroups[semKey];
        if (!group || group.length === 0) return;

        // Sort group: Regular first, then Supplementary releases ordered by examCode ascending
        const regular = group.find(g => g.attemptType === "REGULAR");
        const supps = group.filter(g => g !== regular).sort((a, b) => parseInt(a.examCode, 10) - parseInt(b.examCode, 10));

        const sortedGroup = regular ? [regular, ...supps] : supps;
        const mergedSemester = processSemesterGroup(sortedGroup, htno);
        if (mergedSemester) combinedSemesters.push(mergedSemester);
    });

    // Extract student info details from first available result
    const firstDetails = successfulFetches.find(s => s.details && (s.details.name || s.details.fatherName))?.details || {};
    const overallSummary = calculateOverallSummary(combinedSemesters);

    return {
        details: firstDetails,
        overallSummary,
        semesters: combinedSemesters
    };
}

module.exports = {
    processSemesterGroup,
    calculateOverallSummary,
    aggregateStudentResults,
    buildJntuhUrl
};

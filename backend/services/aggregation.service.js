/**
 * Aggregation Service
 * Combines semester attempt results, computes per-subject attempt history with marks,
 * generates direct JNTUH official result URLs, and computes overall academic summary.
 */

const { calculateGPA } = require("../parsers/result.parser");
const { getSemestersOrder } = require("../utils/semester.utils");

const PASSING_GRADES = new Set(["O", "A+", "A", "B+", "B", "C", "D", "P", "PASS", "PASSED"]);

function isWithheldOrMalpractice(text) {
    if (!text) return false;
    const upper = String(text).toUpperCase();
    return upper.includes("WITHHELD") || upper.includes("MALPRACTICE") || upper.includes("SPOT CENTER") || upper.includes("EXAM CENTER") || upper.includes("MP") || upper.includes("WH");
}

function isPassingGrade(grade) {
    if (!grade) return false;
    const clean = String(grade).trim().toUpperCase();
    return PASSING_GRADES.has(clean);
}

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

            const isMpOrWh = sub.isMalpractice || isWithheldOrMalpractice(sub.remarks) || isWithheldOrMalpractice(sub.category) || isWithheldOrMalpractice(sub.grade);
            const mpRemarks = sub.remarks || sub.category || (isMpOrWh ? "WITHHELD/MALPRACTICE" : "");

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
                    isFailed: !isPassingGrade(sub.grade) || isMpOrWh,
                    isBacklog: !isPassingGrade(sub.grade) || isMpOrWh,
                    isMalpractice: isMpOrWh,
                    remarks: mpRemarks,
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
                isMalpractice: isMpOrWh,
                ...(isRCRV ? { isNoChange, remarks: isNoChange ? "No Change" : "Grade/Marks Updated" } : {}),
                ...(isMpOrWh ? { isMalpractice: true, remarks: mpRemarks } : {})
            };

            record.attemptsHistory.push(attemptEntry);

            // Update final marks
            const gradeUpper = String(sub.grade).trim().toUpperCase();
            const isPass = isPassingGrade(gradeUpper) && !isMpOrWh;

            if (isPass) {
                record.finalGrade = sub.grade;
                record.finalMarks = {
                    internal: sub.internalMarks,
                    external: sub.externalMarks,
                    total: sub.totalMarks,
                    grade: sub.grade,
                    credits: sub.credits
                };
                record.isFailed = false;
                record.isBacklog = false;
                record.isMalpractice = false;
            } else {
                // If not passed, it remains a backlog
                record.isFailed = true;
                record.isBacklog = true;
                if (!isNoChange) {
                    record.finalGrade = sub.grade || "-";
                    record.finalMarks = {
                        internal: sub.internalMarks,
                        external: sub.externalMarks,
                        total: sub.totalMarks,
                        grade: sub.grade || "-",
                        credits: sub.credits || 0
                    };
                    if (isMpOrWh) {
                        record.remarks = mpRemarks;
                        record.isMalpractice = true;
                    }
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

    // Ensure summary failedSubjects and isFailed reflect any backlogs or malpractice in subjectsList
    const backlogCount = subjectsList.filter(s => s.isFailed || s.isBacklog || s.isMalpractice || !isPassingGrade(s.finalGrade)).length;
    if (summary) {
        summary.failedSubjects = Math.max(summary.failedSubjects || 0, backlogCount);
        if (summary.failedSubjects > 0) {
            summary.isFailed = true;
            summary.sgpa = null;
            summary.percentage = null;
        }
    }

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
    let totalFailedSubjects = 0;

    semesters.forEach(sem => {
        if (!sem.summary) return;
        const semCredits = sem.summary.totalCredits || 20;
        totalSemesterCredits += semCredits;
        totalEarnedCredits += sem.summary.earnedCredits || 0;

        let semFailedCount = sem.summary.failedSubjects || 0;
        if (sem.subjectsList && Array.isArray(sem.subjectsList)) {
            const listFailedCount = sem.subjectsList.filter(s => s.isFailed || s.isBacklog || s.isMalpractice || !isPassingGrade(s.finalGrade)).length;
            semFailedCount = Math.max(semFailedCount, listFailedCount);
        }
        totalFailedSubjects += semFailedCount;

        let semHasBacklogs = sem.summary.isFailed || semFailedCount > 0;
        if (!semHasBacklogs && sem.subjectsList && Array.isArray(sem.subjectsList)) {
            semHasBacklogs = sem.subjectsList.some(s => s.isFailed || s.isBacklog || s.isMalpractice || !isPassingGrade(s.finalGrade));
        }

        if (semHasBacklogs) {
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
            totalFailedSubjects,
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
        totalFailedSubjects: 0,
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

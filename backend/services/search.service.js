/**
 * Core Stateful Adaptive Search Engine
 * Implements the state machine & pruning algorithm specified in architecture.md (Sections 8-18, 22-26).
 */

const htnoService = require("./htno.service");
const batchService = require("./batch.service");
const groupService = require("./group.service");
const releaseService = require("./release.service");
const jntuhService = require("./jntuh.service");
const resultParser = require("../parsers/result.parser");
const aggregationService = require("./aggregation.service");
const storeService = require("./store.service");

async function searchStudent(rawHtno) {
    if (!rawHtno || !htnoService.isValidHTNO(rawHtno)) {
        throw new Error("INVALID_HALLTICKET");
    }

    const htno = rawHtno.trim().toUpperCase();

    // 1. Resolve student batch & group profile
    const batchInfo = batchService.resolveBatch(htno);

    // Helper to determine if a grade is a passing grade
    const isPassGrade = (grade) => {
        if (!grade) return false;
        const g = String(grade).trim().toUpperCase();
        if (g === "F" || g === "AB" || g === "ABSENT" || g === "COMPLETION_PENDING" || g === "CP" || g === "FAIL" || g === "FAILED" || g === "-") {
            return false;
        }
        return true;
    };

    // 2. Check Level 2 Server Cache & Search State
    const cachedResults = storeService.getAllValidResultsForStudent(htno);
    if (cachedResults.length > 0) {
        const aggregated = aggregationService.aggregateStudentResults(cachedResults, batchInfo.isLateral, htno);
        const existingState = storeService.getSearchState(htno);

        // Short-circuit cache HIT only if search was completed AND student passed ALL subjects across all semesters AND no pending releases
        if (aggregated && aggregated.overallSummary && !aggregated.overallSummary.isFailed && existingState && existingState.searchCompleted && !existingState.hasPendingReleases) {
            console.log(`[SEARCH ENGINE] DB HIT (ALL PASSED): Returning stored results for ${htno}.`);
            const studentRecord = storeService.getStudent(htno);

            return {
                success: true,
                student: {
                    htno,
                    batchId: batchInfo.batchId,
                    name: studentRecord?.name || aggregated.details.name || "",
                    fatherName: studentRecord?.fatherName || aggregated.details.fatherName || "",
                    collegeCode: studentRecord?.collegeCode || batchInfo.collegeCode
                },
                details: {
                    name: studentRecord?.name || aggregated.details.name || "",
                    htno,
                    fatherName: studentRecord?.fatherName || aggregated.details.fatherName || "",
                    collegeCode: studentRecord?.collegeCode || batchInfo.collegeCode
                },
                overallSummary: aggregated.overallSummary,
                semesters: aggregated.semesters,
                rawResultsCount: cachedResults.length,
                fromCache: true
            };
        }
    }

    const existingState = storeService.getSearchState(htno);
    if (existingState && existingState.validated === false) {
        // Expire invalid state after 6 hours to allow re-checking JNTUH portal
        const ageHours = existingState.updatedAt ? (Date.now() - new Date(existingState.updatedAt).getTime()) / (1000 * 60 * 60) : 999;
        if (ageHours < 6) {
            console.log(`[SEARCH ENGINE] HTNO ${htno} previously validated as INVALID. Skipping JNTUH requests.`);
            return {
                success: false,
                error: {
                    code: "INVALID_HALLTICKET",
                    message: "Invalid Hall Ticket Number or no 1-1 Regular result found."
                },
                htno
            };
        }
    }

    // 3. Load global examination catalog
    const catalog = await releaseService.getExamCatalog();

    // Determine target semesters in chronological order (1-1 -> 1-2 -> 2-1 -> ...)
    const targetSemesters = [...batchInfo.targetSemesters].reverse(); // reverse from desc to asc
    const entrySemester = batchInfo.isLateral ? "2-1" : "1-1";

    const validStudentResults = [];

    // 4. STEP 1: First Search MUST be Entry Semester Regular / Main exam (1-1 or 2-1 for lateral)
    const entryGroup = { semester: entrySemester, regulation: batchInfo.regulation };
    const entryReleases = releaseService.getReleasesForGroup(entryGroup, catalog);
    const entryCandidateReleases = entryReleases.filter(r => r.attemptType !== "RCRV").sort((a, b) => parseInt(a.examCode, 10) - parseInt(b.examCode, 10));

    let entryResultFound = false;

    for (const release of entryCandidateReleases) {
        const releaseId = `${release.examCode}_${release.attemptType}`;
        let resultRecord = storeService.getStudentResultForRelease(htno, releaseId);

        if (!resultRecord) {
            try {
                const html = await jntuhService.fetchRawResultHtml(htno, release);
                if (html) {
                    const parsed = resultParser.parseResultHtml(html, release);
                    if (parsed.success) {
                        resultRecord = storeService.saveStudentResult(htno, batchInfo, parsed);
                        storeService.recordReleaseCheck(htno, releaseId, "FOUND");
                    } else {
                        storeService.saveNoResult(htno, batchInfo, release);
                        storeService.recordReleaseCheck(htno, releaseId, "NO_RESULT");
                    }
                }
            } catch (err) {
                console.warn(`[SEARCH ENGINE] Entry semester check failed for release ${release.examCode}:`, err.message);
            }
            storeService.removePendingJobForStudentAndRelease(htno, releaseId);
        }

        if (resultRecord && resultRecord.hasResult) {
            entryResultFound = true;
            break;
        }
    }

    if (!entryResultFound && entryCandidateReleases.length > 0) {
        console.log(`[SEARCH ENGINE] HTNO ${htno} failed Entry Semester (${entrySemester}) check. Stopping search.`);
        storeService.saveSearchState(htno, {
            validated: false,
            searchCompleted: true,
            hasPendingReleases: false,
            invalidReason: `NO_${entrySemester}_REGULAR_RESULT`
        });

        return {
            success: false,
            error: {
                code: "INVALID_HALLTICKET",
                message: `Invalid Hall Ticket Number. No ${entrySemester} Regular result found on JNTUH portal.`
            },
            htno
        };
    }

    // 5. STEP 2: Traversal of remaining semesters with unified non-RC/RV sequence & targeted RC/RV pruning
    for (const semester of targetSemesters) {
        const groupInfo = { semester, regulation: batchInfo.regulation };
        const releases = releaseService.getReleasesForGroup(groupInfo, catalog);
        if (releases.length === 0) continue;

        const nonRcrvReleases = releases.filter(r => r.attemptType !== "RCRV").sort((a, b) => parseInt(a.examCode, 10) - parseInt(b.examCode, 10));
        const rcrvReleases = releases.filter(r => r.attemptType === "RCRV").sort((a, b) => parseInt(a.examCode, 10) - parseInt(b.examCode, 10));

        const failedSubjectCodes = new Set();
        let regularFoundForSemester = false;
        const writtenExamCodes = new Set();
        const examCodesWithFails = new Set();

        // A. Search non-RC/RV releases in chronological order (Regular + Supplementary)
        for (const release of nonRcrvReleases) {
            // Pruning rule:
            // If we have already found the student's main/first attempt for this semester AND all subjects are passed,
            // prune remaining releases for this semester.
            if (regularFoundForSemester && failedSubjectCodes.size === 0) {
                console.log(`[SEARCH ENGINE] HTNO ${htno} passed all subjects in ${semester}. Pruning remaining releases.`);
                break;
            }

            const releaseId = `${release.examCode}_${release.attemptType}`;
            let record = storeService.getStudentResultForRelease(htno, releaseId);

            if (!record) {
                try {
                    const html = await jntuhService.fetchRawResultHtml(htno, release);
                    if (html) {
                        const parsed = resultParser.parseResultHtml(html, release);
                        if (parsed.success) {
                            record = storeService.saveStudentResult(htno, batchInfo, parsed);
                            storeService.recordReleaseCheck(htno, releaseId, "FOUND");
                        } else {
                            storeService.saveNoResult(htno, batchInfo, release);
                            storeService.recordReleaseCheck(htno, releaseId, "NO_RESULT");
                        }
                    }
                } catch (err) {
                    console.warn(`[SEARCH ENGINE] Error fetching ${semester} release ${release.examCode}:`, err.message);
                }
                storeService.removePendingJobForStudentAndRelease(htno, releaseId);
            }

            if (record && record.hasResult) {
                regularFoundForSemester = true;
                writtenExamCodes.add(record.examCode);
                if (!validStudentResults.some(r => r.id === record.id)) {
                    validStudentResults.push(record);
                }

                if (record.subjects && Array.isArray(record.subjects)) {
                    record.subjects.forEach(sub => {
                        const code = String(sub.subjectCode).trim().toUpperCase();
                        if (isPassGrade(sub.grade)) {
                            failedSubjectCodes.delete(code);
                        } else {
                            failedSubjectCodes.add(code);
                            examCodesWithFails.add(record.examCode);
                        }
                    });
                }
            }
        }

        // B. Target RC/RV Search ONLY for written examCodes that had failed subjects
        const targetedRcrvReleases = rcrvReleases.filter(r => examCodesWithFails.has(r.examCode));

        if (targetedRcrvReleases.length > 0) {
            console.log(`[SEARCH ENGINE] HTNO ${htno} written examCodes with failed subjects in ${semester}: [${Array.from(examCodesWithFails).join(', ')}]. Querying targeted RC/RV releases...`);
            for (const release of targetedRcrvReleases) {
                const releaseId = `${release.examCode}_${release.attemptType}`;
                let record = storeService.getStudentResultForRelease(htno, releaseId);

                if (!record) {
                    try {
                        const html = await jntuhService.fetchRawResultHtml(htno, release);
                        if (html) {
                            const parsed = resultParser.parseResultHtml(html, release);
                            if (parsed.success) {
                                record = storeService.saveStudentResult(htno, batchInfo, parsed);
                                storeService.recordReleaseCheck(htno, releaseId, "FOUND");
                            } else {
                                storeService.saveNoResult(htno, batchInfo, release);
                                storeService.recordReleaseCheck(htno, releaseId, "NO_RESULT");
                            }
                        }
                    } catch (err) {
                        console.warn(`[SEARCH ENGINE] Error fetching ${semester} RC/RV release ${release.examCode}:`, err.message);
                    }
                    storeService.removePendingJobForStudentAndRelease(htno, releaseId);
                }

                if (record && record.hasResult) {
                    if (!validStudentResults.some(r => r.id === record.id)) {
                        validStudentResults.push(record);
                    }
                }
            }
        }
    }

    if (validStudentResults.length === 0) {
        storeService.saveSearchState(htno, {
            validated: false,
            searchCompleted: true,
            hasPendingReleases: false,
            invalidReason: "NO_VALID_RESULTS"
        });

        return {
            success: false,
            error: {
                code: "NO_RESULTS_FOUND",
                message: "Invalid Hall Ticket Number or no results found on JNTUH portal."
            },
            htno
        };
    }

    // 6. Aggregate student results & update search state
    const aggregated = aggregationService.aggregateStudentResults(validStudentResults, batchInfo.isLateral, htno);
    const studentRecord = storeService.getStudent(htno);

    storeService.saveSearchState(htno, {
        validated: true,
        searchCompleted: true,
        hasPendingReleases: false,
        lastRegularSemester: targetSemesters[targetSemesters.length - 1],
        resultsCount: validStudentResults.length
    });

    return {
        success: true,
        student: {
            htno,
            batchId: batchInfo.batchId,
            name: studentRecord?.name || aggregated.details.name || "",
            fatherName: studentRecord?.fatherName || aggregated.details.fatherName || "",
            collegeCode: studentRecord?.collegeCode || batchInfo.collegeCode
        },
        details: {
            name: studentRecord?.name || aggregated.details.name || "",
            htno,
            fatherName: studentRecord?.fatherName || aggregated.details.fatherName || "",
            collegeCode: studentRecord?.collegeCode || batchInfo.collegeCode
        },
        overallSummary: aggregated.overallSummary,
        semesters: aggregated.semesters,
        rawResultsCount: validStudentResults.length
    };
}

module.exports = {
    searchStudent
};


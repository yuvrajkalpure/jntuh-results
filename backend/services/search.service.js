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
        if (g === "F" || g === "AB" || g === "ABSENT" || g === "COMPLETION_PENDING" || g === "CP" || g === "FAIL" || g === "FAILED" || g === "-" || g === "MP" || g === "WH" || g.includes("MALPRACTICE") || g.includes("WITHHELD")) {
            return false;
        }
        const PASS_SET = new Set(["O", "A+", "A", "B+", "B", "C", "D", "P", "PASS", "PASSED"]);
        return PASS_SET.has(g);
    };

    // 2. Check 6-Month HTNO Retention Expiration
    if (storeService.isStudentExpired(htno)) {
        console.log(`[SEARCH ENGINE] 6-month retention expired for ${htno}. Purging expired records to fetch fresh results...`);
        storeService.deleteStudentData(htno);
    }

    // 3. Check Level 2 Server Cache & Incremental Semester Update
    const cachedResults = storeService.getAllValidResultsForStudent(htno);
    if (cachedResults.length > 0) {
        // Load examination catalog to check if JNTUH has released any new semesters or supplementary exams
        const catalog = await releaseService.getExamCatalog();
        const targetSemesters = [...batchInfo.targetSemesters].reverse(); // asc order: 1-1 -> 1-2 -> ...
        const cachedSemesterSet = new Set(cachedResults.map(r => r.semester));
        const currentAggregated = aggregationService.aggregateStudentResults(cachedResults, batchInfo.isLateral, htno);

        // Identify candidate releases to query for updates:
        // A) Any new semesters reached by the cohort that are not yet in the student's cache
        // B) Any semesters where the student still has backlogs (query new supplementary or RC/RV releases)
        const candidateReleasesToCheck = [];
        const seenReleaseKeys = new Set();

        for (const semester of targetSemesters) {
            const isNewSemester = !cachedSemesterSet.has(semester);
            const semData = currentAggregated?.semesters?.find(s => s.semester === semester);
            const hasBacklogs = semData && (semData.summary?.isFailed || semData.summary?.failedSubjects > 0 || semData.subjectsList?.some(s => s.isFailed || s.isBacklog));

            // Only check this semester if it's completely new or has active backlogs
            if (isNewSemester || hasBacklogs) {
                const groupInfo = { semester, regulation: batchInfo.regulation };
                const releases = releaseService.getReleasesForGroup(groupInfo, catalog);

                for (const release of releases) {
                    const releaseId = `${release.examCode}_${release.attemptType}`;
                    if (seenReleaseKeys.has(releaseId)) continue;
                    seenReleaseKeys.add(releaseId);

                    const existingCheck = storeService.getReleaseCheck(htno, releaseId);
                    const existingResult = storeService.getStudentResultForRelease(htno, releaseId);

                    // If neither checked nor stored, it is an un-queried release from JNTUH
                    if (!existingCheck && !existingResult) {
                        candidateReleasesToCheck.push(release);
                    }
                }
            }
        }

        // If no new releases exist in catalog for new semesters or backlogs -> INSTANT CACHE HIT
        if (candidateReleasesToCheck.length === 0) {
            console.log(`[SEARCH ENGINE] DB HIT: All cached results up to date for ${htno} (valid within backend cache).`);
            const studentRecord = storeService.getStudent(htno);

            return {
                success: true,
                student: {
                    htno,
                    batchId: batchInfo.batchId,
                    name: studentRecord?.name || currentAggregated.details.name || "",
                    fatherName: studentRecord?.fatherName || currentAggregated.details.fatherName || "",
                    collegeCode: studentRecord?.collegeCode || batchInfo.collegeCode
                },
                details: {
                    name: studentRecord?.name || currentAggregated.details.name || "",
                    htno,
                    fatherName: studentRecord?.fatherName || currentAggregated.details.fatherName || "",
                    collegeCode: studentRecord?.collegeCode || batchInfo.collegeCode
                },
                overallSummary: currentAggregated.overallSummary,
                semesters: currentAggregated.semesters,
                rawResultsCount: cachedResults.length,
                fromCache: true
            };
        }

        // Query JNTUH only for the candidate releases (new semesters / new supplementary attempts)
        console.log(`[SEARCH ENGINE] Incremental check for ${htno}: Querying ${candidateReleasesToCheck.length} new/updated releases from JNTUH...`);
        let newFoundCount = 0;

        for (const release of candidateReleasesToCheck) {
            const releaseId = `${release.examCode}_${release.attemptType}`;
            try {
                const html = await jntuhService.fetchRawResultHtml(htno, release);
                if (html) {
                    const parsed = resultParser.parseResultHtml(html, release);
                    if (parsed.success) {
                        storeService.saveStudentResult(htno, batchInfo, parsed);
                        storeService.recordReleaseCheck(htno, releaseId, "FOUND");
                        newFoundCount++;
                    } else {
                        storeService.saveNoResult(htno, batchInfo, release);
                        storeService.recordReleaseCheck(htno, releaseId, "NOT_FOUND");
                    }
                }
            } catch (err) {
                console.warn(`[SEARCH ENGINE] Error checking updated release ${release.examCode}:`, err.message);
                storeService.recordReleaseCheck(htno, releaseId, "RETRY", err.message);
            }
            storeService.removePendingJobForStudentAndRelease(htno, releaseId);
        }

        // Combine cached results with any newly found releases
        const allValidResults = storeService.getAllValidResultsForStudent(htno);
        const finalAggregated = aggregationService.aggregateStudentResults(allValidResults, batchInfo.isLateral, htno);
        const studentRecord = storeService.getStudent(htno);

        storeService.saveSearchState(htno, {
            validated: true,
            searchCompleted: true,
            hasPendingReleases: false,
            lastRegularSemester: targetSemesters[targetSemesters.length - 1],
            resultsCount: allValidResults.length
        });

        console.log(`[SEARCH ENGINE] Incremental search completed for ${htno}: Loaded from cache with ${newFoundCount} updated releases.`);

        return {
            success: true,
            student: {
                htno,
                batchId: batchInfo.batchId,
                name: studentRecord?.name || finalAggregated.details.name || "",
                fatherName: studentRecord?.fatherName || finalAggregated.details.fatherName || "",
                collegeCode: studentRecord?.collegeCode || batchInfo.collegeCode
            },
            details: {
                name: studentRecord?.name || finalAggregated.details.name || "",
                htno,
                fatherName: studentRecord?.fatherName || finalAggregated.details.fatherName || "",
                collegeCode: studentRecord?.collegeCode || batchInfo.collegeCode
            },
            overallSummary: finalAggregated.overallSummary,
            semesters: finalAggregated.semesters,
            rawResultsCount: allValidResults.length,
            fromCache: newFoundCount === 0,
            updatedSemesters: newFoundCount > 0
        };
    }

    const existingState = storeService.getSearchState(htno);
    if (existingState && existingState.validated === false) {
        // Expire invalid state after 6 months to allow re-checking JNTUH portal
        if (!storeService.isStateExpired(existingState)) {
            console.log(`[SEARCH ENGINE] HTNO ${htno} previously validated as INVALID (valid within 6-month cache). Skipping JNTUH requests.`);
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
                        storeService.recordReleaseCheck(htno, releaseId, "NOT_FOUND");
                    }
                }
            } catch (err) {
                console.warn(`[SEARCH ENGINE] Entry semester check failed for release ${release.examCode}:`, err.message);
                storeService.recordReleaseCheck(htno, releaseId, "RETRY", err.message);
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
                const currentIndex = nonRcrvReleases.indexOf(release);
                for (let i = currentIndex; i < nonRcrvReleases.length; i++) {
                    const prunedRel = nonRcrvReleases[i];
                    const prunedId = `${prunedRel.examCode}_${prunedRel.attemptType}`;
                    if (!storeService.getReleaseCheck(htno, prunedId)) {
                        storeService.recordReleaseCheck(htno, prunedId, "NOT_NEEDED", "ALL_SUBJECTS_PASSED");
                    }
                }
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
                            storeService.recordReleaseCheck(htno, releaseId, "NOT_FOUND");
                        }
                    }
                } catch (err) {
                    console.warn(`[SEARCH ENGINE] Error fetching ${semester} release ${release.examCode}:`, err.message);
                    storeService.recordReleaseCheck(htno, releaseId, "RETRY", err.message);
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
        const skippedRcrvReleases = rcrvReleases.filter(r => !examCodesWithFails.has(r.examCode));

        // Mark unneeded RC/RV releases as NOT_NEEDED
        skippedRcrvReleases.forEach(r => {
            const relId = `${r.examCode}_${r.attemptType}`;
            if (!storeService.getReleaseCheck(htno, relId)) {
                storeService.recordReleaseCheck(htno, relId, "NOT_NEEDED", "NO_FAILS_IN_EXAM_CODE");
            }
        });

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
                                storeService.recordReleaseCheck(htno, releaseId, "NOT_FOUND");
                            }
                        }
                    } catch (err) {
                        console.warn(`[SEARCH ENGINE] Error fetching ${semester} RC/RV release ${release.examCode}:`, err.message);
                        storeService.recordReleaseCheck(htno, releaseId, "RETRY", err.message);
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


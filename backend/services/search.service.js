/**
 * Core Search Service
 * Implements the Group-by-Group Database-First Search Pseudocode specified in architecture.md (Section 34).
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

    // 1. Resolve student batch profile
    const batchInfo = batchService.resolveBatch(htno);
    const batch = storeService.findOrCreateBatch(batchInfo);

    // 2. Determine student's valid result groups
    const resultGroups = groupService.getValidResultGroupsForStudent(batchInfo);

    // 3. Load catalog of result releases
    const catalog = await releaseService.getExamCatalog();

    const validStudentResults = [];

    // 4. Group-by-Group Search Algorithm (Section 34 Pseudocode)
    for (const group of resultGroups) {
        const releases = releaseService.getReleasesForGroup(group, catalog);
        if (releases.length === 0) continue;

        for (const release of releases) {
            const releaseId = `${release.examCode}_${release.attemptType}`;
            const existingRecord = storeService.getStudentResultForRelease(htno, releaseId);

            // A. Check Database Store First
            if (existingRecord) {
                if (existingRecord.hasResult) {
                    console.log(`[SEARCH SERVICE] DB HIT (VALID): ${htno} -> ${group.semester} [${release.examCode} ${release.attemptType}]`);
                    validStudentResults.push(existingRecord);
                } else {
                    console.log(`[SEARCH SERVICE] DB HIT (NO RESULT): ${htno} -> ${group.semester} [${release.examCode} ${release.attemptType}]`);
                }
                continue;
            }

            // B. Database Miss -> Request JNTUH Server
            console.log(`[SEARCH SERVICE] DB MISS: Querying JNTUH for ${htno} -> ${group.semester} [${release.examCode} ${release.attemptType}]...`);
            const html = await jntuhService.fetchRawResultHtml(htno, release);

            if (!html) {
                // Network failure or socket hang up - do NOT mark as NO_RESULT!
                console.warn(`[SEARCH SERVICE] Network failure fetching examCode ${release.examCode} for ${htno}`);
                continue;
            }

            const parsed = resultParser.parseResultHtml(html, release);

            if (parsed.success) {
                // Save valid result to DB store
                const saved = storeService.saveStudentResult(htno, batchInfo, parsed);
                if (saved) validStudentResults.push(saved);
            } else {
                // Record NO_RESULT in DB store (JNTUH explicitly returned "invalid hallticket number")
                storeService.saveNoResult(htno, batchInfo, release);
            }
        }
    }

    if (validStudentResults.length === 0) {
        return {
            success: false,
            error: {
                code: "NO_RESULTS_FOUND",
                message: "Invalid Hall Ticket Number or no results found."
            },
            htno
        };
    }

    // 5. Aggregate successful student results semester-wise
    const aggregated = aggregationService.aggregateStudentResults(validStudentResults, batchInfo.isLateral, htno);

    const studentRecord = storeService.getStudent(htno);

    return {
        success: true,
        student: {
            htno,
            batchId: batch.id,
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

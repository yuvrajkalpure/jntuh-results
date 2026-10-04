/**
 * Impact Analyzer Service
 * Calculates the impact of a newly discovered JNTUH exam release.
 * Identifies affected student cohorts/groups, prunes students who passed or don't need the release,
 * and queues candidate students for controlled background updates and lazy refresh.
 */

const storeService = require("./store.service");
const aggregationService = require("./aggregation.service");

/**
 * Evaluates whether a student needs a specific release update based on their historical results.
 */
function analyzeStudentReleaseNeed(htno, release) {
    const validResults = storeService.getAllValidResultsForStudent(htno);
    const semester = release.semester;
    const attemptType = release.attemptType;

    if (!validResults || validResults.length === 0) {
        // If student has no results yet, regular/main release might be needed
        return attemptType === "REGULAR";
    }

    // Filter results for the release's semester
    const semResults = validResults.filter(r => r.semester === semester);
    if (semResults.length === 0) {
        // No results yet for this semester. Supply/RCRV unnecessary if regular was never written.
        return attemptType === "REGULAR";
    }

    // Aggregate semester progress to see if all subjects are currently passed
    const isPassGrade = (grade) => {
        if (!grade) return false;
        const g = String(grade).trim().toUpperCase();
        return !(g === "F" || g === "AB" || g === "ABSENT" || g === "COMPLETION_PENDING" || g === "CP" || g === "FAIL" || g === "FAILED" || g === "-");
    };

    const failedSubjects = new Set();
    semResults.forEach(r => {
        if (r.subjects && Array.isArray(r.subjects)) {
            r.subjects.forEach(sub => {
                const code = String(sub.subjectCode).trim().toUpperCase();
                if (isPassGrade(sub.grade)) {
                    failedSubjects.delete(code);
                } else {
                    failedSubjects.add(code);
                }
            });
        }
    });

    // If student has passed ALL subjects for this semester, SUPPLY / RCRV is NOT_NEEDED!
    if (failedSubjects.size === 0 && (attemptType === "SUPPLY" || attemptType === "RCRV")) {
        return false;
    }

    return true;
}

/**
 * Analyzes the impact of a new release and queues candidate students.
 */
function analyzeReleaseImpact(release) {
    if (!release || !release.id) return { affectedStudentsCount: 0, queuedCount: 0, skippedCount: 0 };

    console.log(`[IMPACT ANALYZER] Analyzing new release: ${release.examCode} (${release.semester} ${release.regulation} ${release.attemptType})...`);

    // 1. Identify matching HTNO groups by regulation
    const allGroups = storeService.data.htno_groups || {};
    const matchingGroupKeys = Object.values(allGroups)
        .filter(g => g.regulation === release.regulation)
        .map(g => g.groupKey);

    // 2. Identify students belonging to matching groups
    const matchingStudents = storeService.getStudentsForGroupKeys(matchingGroupKeys);

    let queuedCount = 0;
    let skippedCount = 0;

    matchingStudents.forEach(student => {
        const htno = student.htno;
        const needsRelease = analyzeStudentReleaseNeed(htno, release);

        if (needsRelease) {
            storeService.addPendingResultCheck(htno, release.id, "NORMAL");
            storeService.saveSearchState(htno, { hasPendingReleases: true });
            queuedCount++;
        } else {
            storeService.recordReleaseCheck(htno, release.id, "NOT_NEEDED");
            skippedCount++;
        }
    });

    storeService.incrementCatalogVersion();

    console.log(`[IMPACT ANALYZER] Impact Analysis Complete for release ${release.examCode}: ` +
        `${matchingStudents.length} candidate students evaluated, ${queuedCount} queued, ${skippedCount} marked NOT_NEEDED.`);

    return {
        affectedStudentsCount: matchingStudents.length,
        queuedCount,
        skippedCount
    };
}

module.exports = {
    analyzeStudentReleaseNeed,
    analyzeReleaseImpact
};

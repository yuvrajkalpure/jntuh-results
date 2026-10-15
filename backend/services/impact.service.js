/**
 * Impact Analyzer Service
 * Calculates the impact of a newly discovered JNTUH exam release.
 * Identifies affected student cohorts/groups, prunes students who passed or don't need the release,
 * and queues candidate students for controlled background updates and lazy refresh.
 * 
 * Selective Check Matrix (per specification):
 * - Passed all subjects in Regular -> Skip Supply (NOT_NEEDED)
 * - Failed subjects in Regular -> Check relevant Supply releases (PENDING)
 * - Passed in first Supply attempt -> Skip further Supply releases for that semester (NOT_NEEDED)
 * - Failed after Supply -> Consider relevant later Supply or RC/RV releases (PENDING)
 * - Not checked yet -> PENDING
 */

const storeService = require("./store.service");
const batchService = require("./batch.service");
const aggregationService = require("./aggregation.service");

function normalizeSemester(sem) {
    if (!sem) return "";
    let s = String(sem).trim().toUpperCase();
    s = s.replace(/IV/g, "4")
         .replace(/III/g, "3")
         .replace(/II/g, "2")
         .replace(/I/g, "1");
    s = s.replace(/[^0-9]/g, "-").replace(/-+/g, "-");
    return s.replace(/^-+|-+$/g, "");
}

function isPassGrade(grade) {
    if (!grade) return false;
    const g = String(grade).trim().toUpperCase();
    if (g === "F" || g === "AB" || g === "ABSENT" || g === "COMPLETION_PENDING" || g === "CP" || g === "FAIL" || g === "FAILED" || g === "-" || g === "MP" || g === "WH" || g.includes("MALPRACTICE") || g.includes("WITHHELD")) {
        return false;
    }
    const PASS_SET = new Set(["O", "A+", "A", "B+", "B", "C", "D", "P", "PASS", "PASSED"]);
    return PASS_SET.has(g);
}

/**
 * Evaluates whether a student needs a specific release update based on their historical results.
 * Returns: { needsCheck: boolean, reason: string }
 */
function analyzeStudentReleaseNeed(htno, release) {
    const normReleaseSem = normalizeSemester(release.semester);
    const attemptType = String(release.attemptType || "").toUpperCase();

    const batchInfo = batchService.resolveBatch(htno);
    if (!batchInfo) {
        return { needsCheck: false, reason: "INVALID_BATCH" };
    }

    // Check regulation match
    if (release.regulation && batchInfo.regulation && release.regulation !== batchInfo.regulation) {
        return { needsCheck: false, reason: "REGULATION_MISMATCH" };
    }

    // Check if target semester is within student cohort scope
    const targetNormSems = (batchInfo.targetSemesters || []).map(normalizeSemester);
    if (targetNormSems.length > 0 && !targetNormSems.includes(normReleaseSem)) {
        return { needsCheck: false, reason: "SEMESTER_OUT_OF_COHORT_SCOPE" };
    }

    const validResults = storeService.getAllValidResultsForStudent(htno);

    if (!validResults || validResults.length === 0) {
        // If student has no results yet, only Regular release for entry semester is relevant
        const entrySemester = normalizeSemester(batchInfo.isLateral ? "2-1" : "1-1");
        if (normReleaseSem === entrySemester && attemptType === "REGULAR") {
            return { needsCheck: true, reason: "ENTRY_SEMESTER_REGULAR" };
        }
        return { needsCheck: false, reason: "NO_PRIOR_RESULTS" };
    }

    // Filter historical results for this release's semester
    const semResults = validResults.filter(r => normalizeSemester(r.semester) === normReleaseSem);
    if (semResults.length === 0) {
        // Student hasn't written this semester yet.
        // If it's REGULAR, and it's within targetSemesters, they may need it.
        // Supply or RCRV is NOT needed if student never attempted Regular for this semester.
        if (attemptType === "REGULAR") {
            return { needsCheck: true, reason: "FIRST_REGULAR_ATTEMPT" };
        }
        return { needsCheck: false, reason: "NO_REGULAR_ATTEMPT_YET" };
    }

    // If it's a REGULAR release and student already has a REGULAR result for this semester: skip
    const hasRegular = semResults.some(r => String(r.attemptType || "").toUpperCase() === "REGULAR");
    if (attemptType === "REGULAR" && hasRegular) {
        return { needsCheck: false, reason: "REGULAR_ALREADY_RECORDED" };
    }

    // Track subject status across all attempts for this semester (Regular + Supply + RCRV)
    // Sort attempts chronologically by examCode
    const sortedAttempts = [...semResults].sort((a, b) => parseInt(a.examCode || 0, 10) - parseInt(b.examCode || 0, 10));
    const failedSubjects = new Set();
    const passedSubjects = new Set();

    sortedAttempts.forEach(r => {
        if (r.subjects && Array.isArray(r.subjects)) {
            r.subjects.forEach(sub => {
                const code = String(sub.subjectCode || "").trim().toUpperCase();
                if (isPassGrade(sub.grade) && !sub.isMalpractice) {
                    passedSubjects.add(code);
                    failedSubjects.delete(code);
                } else {
                    if (!passedSubjects.has(code)) {
                        failedSubjects.add(code);
                    }
                }
            });
        }
    });

    // Rule: "Passed all subjects in III-II Regular -> Skip III-II Supply"
    // Rule: "Passed in the first Supply attempt -> Skip further Supply releases for that semester"
    if (failedSubjects.size === 0) {
        if (attemptType === "SUPPLY" || attemptType === "RCRV") {
            return { needsCheck: false, reason: "ALL_SUBJECTS_PASSED" };
        }
    }

    // Rule: "Failed two subjects in III-II Regular -> Check relevant Supply releases"
    // Rule: "Failed after Supply -> Consider relevant later Supply or RC/RV releases"
    if (failedSubjects.size > 0) {
        if (attemptType === "SUPPLY" || attemptType === "RCRV") {
            return { needsCheck: true, reason: `ACTIVE_BACKLOGS_${failedSubjects.size}` };
        }
    }

    return { needsCheck: false, reason: "DEFAULT_SKIP" };
}

/**
 * Analyzes the impact of a new release and queues candidate students.
 */
function analyzeReleaseImpact(release) {
    if (!release || !release.id) return { affectedStudentsCount: 0, queuedCount: 0, skippedCount: 0, alreadyCheckedCount: 0 };

    console.log(`[IMPACT ANALYZER] Analyzing new release: ${release.examCode} (${release.semester} ${release.regulation} ${release.attemptType})...`);

    // 1. Get all students currently stored in store.json
    const allStudents = storeService.getAllStudents();

    // 2. Filter students matching regulation
    const candidateStudents = allStudents.filter(student => {
        if (student.batchId && student.batchId.includes(release.regulation)) return true;
        const b = batchService.resolveBatch(student.htno);
        return b && b.regulation === release.regulation;
    });

    let queuedCount = 0;
    let skippedCount = 0;
    let alreadyCheckedCount = 0;

    candidateStudents.forEach(student => {
        const htno = student.htno;

        // Skip if student already has a definitive check status recorded
        const existingCheck = storeService.getReleaseCheck(htno, release.id);
        if (existingCheck && (existingCheck.status === "FOUND" || existingCheck.status === "NOT_FOUND" || existingCheck.status === "NOT_NEEDED")) {
            alreadyCheckedCount++;
            return;
        }

        const evaluation = analyzeStudentReleaseNeed(htno, release);

        if (evaluation.needsCheck) {
            storeService.addPendingResultCheck(htno, release.id, "NORMAL");
            storeService.saveSearchState(htno, { hasPendingReleases: true });
            queuedCount++;
        } else {
            storeService.recordReleaseCheck(htno, release.id, "NOT_NEEDED", evaluation.reason);
            skippedCount++;
        }
    });

    storeService.incrementCatalogVersion();

    console.log(`[IMPACT ANALYZER] Impact Analysis Complete for release ${release.examCode}: ` +
        `${candidateStudents.length} candidate students evaluated, ${queuedCount} queued, ${skippedCount} marked NOT_NEEDED, ${alreadyCheckedCount} already checked.`);

    return {
        affectedStudentsCount: candidateStudents.length,
        queuedCount,
        skippedCount,
        alreadyCheckedCount
    };
}

module.exports = {
    normalizeSemester,
    analyzeStudentReleaseNeed,
    analyzeReleaseImpact
};

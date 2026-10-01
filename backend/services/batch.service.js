/**
 * Batch Service
 * Resolves student batch cohorts and cohort group keys (e.g. 23-E3-REGULAR-1-A0-R22) per architecture.md (Section 5, 19).
 */

const htnoService = require("./htno.service");

function resolveBatch(htno) {
    const student = htnoService.parseHTNO(htno);
    const entryType = student.isLateral ? "LATERAL" : "REGULAR";
    const batchId = `${student.effectiveCohortYear}-${entryType}-${student.studentRegulation}`;

    // Group Key format without collegeCode and branchCode per user instruction: "23-REGULAR-1-R22"
    const yy = String(student.admissionYear).slice(-2);
    const groupKey = `${yy}-${entryType}-${student.courseCode}-${student.studentRegulation}`;

    return {
        batchId,
        groupKey,
        admissionYear: student.admissionYear,
        effectiveCohortYear: student.effectiveCohortYear,
        entryType,
        regulation: student.studentRegulation,
        degree: "BTECH",
        isLateral: student.isLateral,
        collegeCode: student.collegeCode,
        courseCode: student.courseCode,
        branchCode: student.branchCode,
        targetSemesters: student.targetSemesters
    };
}

module.exports = {
    resolveBatch
};


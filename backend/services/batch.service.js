/**
 * Batch Service
 * Resolves student batch cohorts (e.g. 2023-REGULAR-R22 vs 2024-LATERAL-R22)
 */

const htnoService = require("./htno.service");

function resolveBatch(htno) {
    const student = htnoService.parseHTNO(htno);
    const entryType = student.isLateral ? "LATERAL" : "REGULAR";
    const batchId = `${student.effectiveCohortYear}-${entryType}-${student.studentRegulation}`;

    return {
        batchId,
        admissionYear: student.admissionYear,
        effectiveCohortYear: student.effectiveCohortYear,
        entryType,
        regulation: student.studentRegulation,
        degree: "BTECH",
        isLateral: student.isLateral,
        collegeCode: student.collegeCode,
        branchCode: student.branchCode,
        targetSemesters: student.targetSemesters
    };
}

module.exports = {
    resolveBatch
};

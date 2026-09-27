/**
 * HTNO Service
 * Validates, parses, and derives student profiles and academic pathways from JNTUH Hall Ticket Numbers.
 */

const { normalizeHTNO } = require("../utils/normalization.utils");

function isValidHTNO(htno) {
    if (!htno) return false;
    const clean = normalizeHTNO(htno);
    return /^[A-Z0-9]{10}$/.test(clean);
}

function parseHTNO(htno) {
    if (!isValidHTNO(htno)) {
        throw new Error("Invalid Hall Ticket Number format");
    }

    const cleanHtno = normalizeHTNO(htno);
    const admissionYY = parseInt(cleanHtno.substring(0, 2), 10);
    const admissionYear = 2000 + admissionYY;
    const collegeCode = cleanHtno.substring(2, 4);
    const courseType = cleanHtno[4]; // '1' = Day-Time / Regular, '5' = Lateral Entry
    const courseCode = cleanHtno[5]; // 'A' = B.Tech
    const branchCode = cleanHtno.substring(6, 8);
    const serialNo = cleanHtno.substring(8, 10);

    const isLateral = (courseType === '5');
    // Lateral entry students enter at Year 2, sharing timeline with previous year's regular batch
    const effectiveCohortYear = isLateral ? admissionYear - 1 : admissionYear;
    const studentRegulation = getStudentRegulation(effectiveCohortYear);

    const targetSemesters = isLateral
        ? ["4-2", "4-1", "3-2", "3-1", "2-2", "2-1"]
        : ["4-2", "4-1", "3-2", "3-1", "2-2", "2-1", "1-2", "1-1"];

    return {
        htno: cleanHtno,
        admissionYear,
        collegeCode,
        courseType,
        courseCode,
        branchCode,
        serialNo,
        isLateral,
        effectiveCohortYear,
        studentRegulation,
        targetSemesters
    };
}

function getStudentRegulation(effectiveCohortYear) {
    if (effectiveCohortYear >= 2025) return "R25";
    if (effectiveCohortYear >= 2022) return "R22";
    if (effectiveCohortYear >= 2018) return "R18";
    if (effectiveCohortYear >= 2016) return "R16";
    if (effectiveCohortYear >= 2015) return "R15";
    if (effectiveCohortYear >= 2013) return "R13";
    return "R09";
}

module.exports = {
    isValidHTNO,
    parseHTNO,
    getStudentRegulation
};

/**
 * HTNO Service
 * Validates, parses, and derives student profiles and academic pathways from JNTUH Hall Ticket Numbers.
 */

const { normalizeHTNO } = require("../utils/normalization.utils");

function isValidHTNO(htno) {
    if (!htno) return false;
    const clean = normalizeHTNO(htno);
    if (!/^[A-Z0-9]{10}$/.test(clean)) return false;

    const admissionYY = parseInt(clean.substring(0, 2), 10);
    const currentYY = new Date().getFullYear() % 100;
    if (isNaN(admissionYY) || admissionYY < 9 || admissionYY > currentYY) {
        return false;
    }

    const courseCode = clean[4];
    if (courseCode !== '1' && courseCode !== '5') {
        return false;
    }

    return true;
}

function parseHTNO(htno) {
    if (!isValidHTNO(htno)) {
        throw new Error("Invalid Hall Ticket Number format");
    }

    const cleanHtno = normalizeHTNO(htno);
    const admissionYY = parseInt(cleanHtno.substring(0, 2), 10);
    const admissionYear = 2000 + admissionYY;
    const collegeCode = cleanHtno.substring(2, 4);
    const courseCode = cleanHtno[4]; // '1' = Regular, '5' = Lateral Entry
    const degreeCode = cleanHtno[5]; // 'A' = B.Tech
    const branchCode = cleanHtno.substring(6, 8);
    const serialNo = cleanHtno.substring(8, 10);

    const isLateral = (courseCode === '5');
    // Lateral entry students enter at Year 2, sharing timeline with previous year's regular batch
    const effectiveCohortYear = isLateral ? admissionYear - 1 : admissionYear;
    const studentRegulation = getStudentRegulation(effectiveCohortYear);

    const targetSemesters = getTargetSemesters(effectiveCohortYear, isLateral);

    return {
        htno: cleanHtno,
        admissionYear,
        collegeCode,
        courseCode,
        degreeCode,
        branchCode,
        serialNo,
        isLateral,
        effectiveCohortYear,
        studentRegulation,
        targetSemesters
    };
}

function getTargetSemesters(effectiveCohortYear, isLateral) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    // Calculate cohort progress
    const cohortYears = currentYear - effectiveCohortYear + (currentMonth >= 6 ? 1 : 0);

    const allRegularSemesters = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];
    const allLateralSemesters = ["2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];

    const baseSemesters = isLateral ? allLateralSemesters : allRegularSemesters;

    let maxSemIndex = baseSemesters.length - 1;
    if (cohortYears <= 1) maxSemIndex = isLateral ? 1 : 1;
    else if (cohortYears === 2) maxSemIndex = isLateral ? 3 : 3;
    else if (cohortYears === 3) maxSemIndex = isLateral ? 5 : 5;

    const validSemesters = baseSemesters.slice(0, maxSemIndex + 1);
    return validSemesters.reverse();
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

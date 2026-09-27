/**
 * Semester Utility functions for JNTUH B.Tech
 */

const SEMESTERS_ORDER_DESC = ["4-2", "4-1", "3-2", "3-1", "2-2", "2-1", "1-2", "1-1"];
const LATERAL_SEMESTERS_ORDER_DESC = ["4-2", "4-1", "3-2", "3-1", "2-2", "2-1"];

const SEMESTER_LABELS = {
    "1-1": "I Year I Semester",
    "1-2": "I Year II Semester",
    "2-1": "II Year I Semester",
    "2-2": "II Year II Semester",
    "3-1": "III Year I Semester",
    "3-2": "III Year II Semester",
    "4-1": "IV Year I Semester",
    "4-2": "IV Year II Semester"
};

function getSemestersOrder(isLateral = false) {
    return isLateral ? LATERAL_SEMESTERS_ORDER_DESC : SEMESTERS_ORDER_DESC;
}

function getSemesterLabel(semKey) {
    return SEMESTER_LABELS[semKey] || semKey;
}

module.exports = {
    SEMESTERS_ORDER_DESC,
    LATERAL_SEMESTERS_ORDER_DESC,
    SEMESTER_LABELS,
    getSemestersOrder,
    getSemesterLabel
};

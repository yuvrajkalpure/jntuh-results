/**
 * Result Group Service
 * Manages logical result groups (Semester + Regulation + Degree e.g. "III-II R22 BTECH")
 */

const { SEMESTER_LABELS } = require("../utils/semester.utils");

function getValidResultGroupsForStudent(batchInfo) {
    const regulation = batchInfo.regulation;
    const degree = batchInfo.degree || "BTECH";

    return batchInfo.targetSemesters.map(semester => ({
        groupId: `${semester}_${regulation}_${degree}`,
        semester,
        regulation,
        degree,
        label: `${SEMESTER_LABELS[semester] || semester} (${regulation})`
    }));
}

module.exports = {
    getValidResultGroupsForStudent
};

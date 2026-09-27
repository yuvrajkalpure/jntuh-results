/**
 * Persistent Database Store Service
 * Implements the normalized relational architecture specified in architecture.md:
 * BATCH -> STUDENT -> STUDENT_RESULT -> RESULT_RELEASE -> RESULT_GROUP
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

class StoreService {
    constructor() {
        this.data = {
            batches: {},
            students: {},
            result_groups: {},
            result_releases: {},
            student_results: {}
        };
        this.initStore();
    }

    initStore() {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }

            if (fs.existsSync(STORE_FILE)) {
                const fileContent = fs.readFileSync(STORE_FILE, "utf-8");
                if (fileContent.trim()) {
                    const parsed = JSON.parse(fileContent);
                    this.data = {
                        batches: parsed.batches || {},
                        students: parsed.students || {},
                        result_groups: parsed.result_groups || {},
                        result_releases: parsed.result_releases || {},
                        student_results: parsed.student_results || {}
                    };
                }
            } else {
                this.saveToDisk();
            }
        } catch (error) {
            console.error("[STORE SERVICE] Error initializing store:", error.message);
        }
    }

    saveToDisk() {
        try {
            fs.writeFileSync(STORE_FILE, JSON.stringify(this.data, null, 2), "utf-8");
        } catch (error) {
            console.error("[STORE SERVICE] Error saving store to disk:", error.message);
        }
    }

    // 1. Batches
    findOrCreateBatch(batchInfo) {
        if (!batchInfo || !batchInfo.batchId) return null;
        if (!this.data.batches) this.data.batches = {};

        if (!this.data.batches[batchInfo.batchId]) {
            this.data.batches[batchInfo.batchId] = {
                id: batchInfo.batchId,
                admissionYear: batchInfo.admissionYear,
                entryType: batchInfo.entryType,
                regulation: batchInfo.regulation,
                degree: batchInfo.degree || "BTECH",
                createdAt: new Date().toISOString()
            };
            this.saveToDisk();
        }
        return this.data.batches[batchInfo.batchId];
    }

    // 2. Students
    findOrCreateStudent(htno, batchInfo, studentDetails = {}) {
        const cleanHtno = String(htno).trim().toUpperCase();
        if (!this.data.students) this.data.students = {};
        this.findOrCreateBatch(batchInfo);

        if (!this.data.students[cleanHtno]) {
            this.data.students[cleanHtno] = {
                id: `student_${cleanHtno}`,
                htno: cleanHtno,
                batchId: batchInfo.batchId,
                name: studentDetails.name || "",
                fatherName: studentDetails.fatherName || "",
                collegeCode: studentDetails.collegeCode || batchInfo.collegeCode || "",
                branchCode: studentDetails.branchCode || batchInfo.branchCode || "",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.saveToDisk();
        } else if (studentDetails.name && !this.data.students[cleanHtno].name) {
            this.data.students[cleanHtno].name = studentDetails.name;
            if (studentDetails.fatherName) this.data.students[cleanHtno].fatherName = studentDetails.fatherName;
            this.data.students[cleanHtno].updatedAt = new Date().toISOString();
            this.saveToDisk();
        }

        return this.data.students[cleanHtno];
    }

    getStudent(htno) {
        if (!htno || !this.data.students) return null;
        const cleanHtno = String(htno).trim().toUpperCase();
        return this.data.students[cleanHtno] || null;
    }

    // 3. Result Groups
    findOrCreateResultGroup(semester, regulation, degree = "BTECH") {
        if (!this.data.result_groups) this.data.result_groups = {};
        const groupId = `${semester}_${regulation}_${degree}`;
        if (!this.data.result_groups[groupId]) {
            this.data.result_groups[groupId] = {
                id: groupId,
                semester,
                regulation,
                degree,
                createdAt: new Date().toISOString()
            };
            this.saveToDisk();
        }
        return this.data.result_groups[groupId];
    }

    // 4. Result Releases (Shared by both Regular and Lateral students!)
    findOrCreateResultRelease(releaseInfo) {
        if (!this.data.result_releases) this.data.result_releases = {};
        const releaseId = `${releaseInfo.examCode}_${releaseInfo.attemptType}`;
        const group = this.findOrCreateResultGroup(releaseInfo.semester, releaseInfo.regulation, releaseInfo.degree);

        if (!this.data.result_releases[releaseId]) {
            this.data.result_releases[releaseId] = {
                id: releaseId,
                groupId: group.id,
                examCode: releaseInfo.examCode,
                attemptType: releaseInfo.attemptType,
                examTitle: releaseInfo.title || "",
                publishedDate: releaseInfo.publishedDate || "",
                request: releaseInfo.request || {},
                createdAt: new Date().toISOString()
            };
            this.saveToDisk();
        }
        return this.data.result_releases[releaseId];
    }

    // 5. Student Results (Valid result)
    saveStudentResult(htno, batchInfo, parsedResult) {
        if (!htno || !parsedResult || !parsedResult.success) return null;
        if (!this.data.student_results) this.data.student_results = {};

        const cleanHtno = String(htno).trim().toUpperCase();
        const student = this.findOrCreateStudent(cleanHtno, batchInfo, parsedResult.details || {});
        const release = this.findOrCreateResultRelease({
            examCode: parsedResult.examCode,
            attemptType: parsedResult.attemptType,
            semester: parsedResult.semester,
            regulation: batchInfo.regulation,
            degree: batchInfo.degree || "BTECH",
            title: parsedResult.title
        });

        const key = `${cleanHtno}_${release.id}`;
        this.data.student_results[key] = {
            id: key,
            studentId: student.id,
            htno: cleanHtno,
            resultReleaseId: release.id,
            groupId: release.groupId,
            examCode: parsedResult.examCode,
            semester: parsedResult.semester,
            attemptType: parsedResult.attemptType,
            examTitle: parsedResult.examTitle || parsedResult.title,
            resultStatus: parsedResult.summary?.isFailed ? "FAILED" : "PASSED",
            hasResult: true,
            fetchedAt: new Date().toISOString(),
            summary: parsedResult.summary,
            subjects: parsedResult.subjects || [],
            table: parsedResult.table || []
        };

        this.saveToDisk();
        return this.data.student_results[key];
    }

    // Record NO_RESULT for a release (only if a valid result does not already exist)
    saveNoResult(htno, batchInfo, releaseInfo) {
        if (!htno || !releaseInfo) return null;
        if (!this.data.student_results) this.data.student_results = {};

        const cleanHtno = String(htno).trim().toUpperCase();
        const releaseId = `${releaseInfo.examCode}_${releaseInfo.attemptType}`;
        const key = `${cleanHtno}_${releaseId}`;

        // Do NOT overwrite an existing valid student result
        if (this.data.student_results[key] && this.data.student_results[key].hasResult) {
            return this.data.student_results[key];
        }

        const student = this.findOrCreateStudent(cleanHtno, batchInfo);
        const release = this.findOrCreateResultRelease({
            examCode: releaseInfo.examCode,
            attemptType: releaseInfo.attemptType,
            semester: releaseInfo.semester,
            regulation: batchInfo.regulation,
            degree: batchInfo.degree || "BTECH",
            title: releaseInfo.title
        });

        this.data.student_results[key] = {
            id: key,
            studentId: student.id,
            htno: cleanHtno,
            resultReleaseId: release.id,
            groupId: release.groupId,
            examCode: releaseInfo.examCode,
            semester: releaseInfo.semester,
            attemptType: releaseInfo.attemptType,
            examTitle: releaseInfo.title,
            resultStatus: "NO_RESULT",
            hasResult: false,
            fetchedAt: new Date().toISOString(),
            summary: null,
            subjects: [],
            table: []
        };

        this.saveToDisk();
        return this.data.student_results[key];
    }

    // Check if a specific student result record exists for HTNO and releaseId
    getStudentResultForRelease(htno, releaseId) {
        if (!htno || !this.data.student_results) return null;
        const cleanHtno = String(htno).trim().toUpperCase();
        const key = `${cleanHtno}_${releaseId}`;
        return this.data.student_results[key] || null;
    }
}

module.exports = new StoreService();

/**
 * Persistent Database Store Service
 * Implements the normalized relational architecture specified in architecture.md:
 * JNTUH_EXAM_RELEASES -> CATALOG_SYNC_LOGS -> HTNO_GROUPS -> CANDIDATE_APPLICABILITY -> STUDENTS -> STUDENT_SEARCH_STATE -> STUDENT_RESULTS
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

class StoreService {
    constructor() {
        this.data = {
            catalog_version: 1,
            batches: {},
            students: {},
            htno_groups: {},
            group_candidates: {},
            student_search_state: {},
            result_groups: {},
            jntuh_exam_releases: {},
            catalog_sync_logs: [],
            student_results: {},
            student_release_checks: {},
            pending_result_checks: []
        };
        this.initStore();
    }

    initStore() {
        this.reloadFromDisk();
    }

    reloadFromDisk() {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }

            if (fs.existsSync(STORE_FILE)) {
                const fileContent = fs.readFileSync(STORE_FILE, "utf-8");
                if (fileContent.trim()) {
                    const parsed = JSON.parse(fileContent);
                    this.data = {
                        catalog_version: parsed.catalog_version || 1,
                        batches: parsed.batches || {},
                        students: parsed.students || {},
                        htno_groups: parsed.htno_groups || {},
                        group_candidates: parsed.group_candidates || {},
                        student_search_state: parsed.student_search_state || {},
                        result_groups: parsed.result_groups || {},
                        jntuh_exam_releases: parsed.jntuh_exam_releases || parsed.result_releases || {},
                        catalog_sync_logs: parsed.catalog_sync_logs || [],
                        student_results: parsed.student_results || {},
                        student_release_checks: parsed.student_release_checks || {},
                        pending_result_checks: parsed.pending_result_checks || []
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

    // 2. HTNO Groups
    findOrCreateGroup(groupInfo) {
        if (!groupInfo || !groupInfo.groupKey) return null;
        if (!this.data.htno_groups) this.data.htno_groups = {};

        if (!this.data.htno_groups[groupInfo.groupKey]) {
            this.data.htno_groups[groupInfo.groupKey] = {
                id: groupInfo.groupKey,
                groupKey: groupInfo.groupKey,
                admissionYear: groupInfo.admissionYear,
                entryType: groupInfo.entryType,
                courseCode: groupInfo.courseCode,
                regulation: groupInfo.regulation,
                degree: groupInfo.degree || "BTECH",
                firstDiscoveredAt: new Date().toISOString(),
                lastUpdatedAt: new Date().toISOString()
            };
            this.saveToDisk();
        }
        return this.data.htno_groups[groupInfo.groupKey];
    }

    // 3. Students
    findOrCreateStudent(htno, batchInfo, studentDetails = {}) {
        const cleanHtno = String(htno).trim().toUpperCase();
        if (!this.data.students) this.data.students = {};

        if (!this.data.students[cleanHtno]) {
            this.data.students[cleanHtno] = {
                id: `student_${cleanHtno}`,
                htno: cleanHtno,
                groupKey: batchInfo.groupKey || "",
                batchId: batchInfo.batchId || "",
                name: studentDetails.name || "",
                fatherName: studentDetails.fatherName || "",
                collegeCode: studentDetails.collegeCode || batchInfo.collegeCode || "",
                branchCode: studentDetails.branchCode || batchInfo.branchCode || "",
                firstVerifiedAt: new Date().toISOString(),
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

    // 4. Student Search State (State Machine)
    getSearchState(htno) {
        if (!htno) return null;
        this.reloadFromDisk();
        if (!this.data.student_search_state) return null;
        const cleanHtno = String(htno).trim().toUpperCase();
        return this.data.student_search_state[cleanHtno] || null;
    }

    saveSearchState(htno, stateData) {
        if (!htno) return null;
        if (!this.data.student_search_state) this.data.student_search_state = {};

        const cleanHtno = String(htno).trim().toUpperCase();
        this.data.student_search_state[cleanHtno] = {
            htno: cleanHtno,
            ...(this.data.student_search_state[cleanHtno] || {}),
            ...stateData,
            updatedAt: new Date().toISOString()
        };
        this.saveToDisk();
        return this.data.student_search_state[cleanHtno];
    }

    // 5. JNTUH Exam Catalog & Sync Logs
    upsertCatalogRelease(releaseInfo) {
        if (!this.data.jntuh_exam_releases) this.data.jntuh_exam_releases = {};
        const releaseId = releaseInfo.releaseId || `${releaseInfo.examCode}_${releaseInfo.attemptType}`;

        const existing = this.data.jntuh_exam_releases[releaseId];
        const now = new Date().toISOString();

        if (existing) {
            existing.lastSeenAt = now;
            existing.publishedDate = releaseInfo.publishedDate || existing.publishedDate;
            existing.title = releaseInfo.title || existing.title;
            existing.semester = releaseInfo.semester || existing.semester;
            existing.regulation = releaseInfo.regulation || existing.regulation;
            existing.degree = releaseInfo.degree || existing.degree;
            existing.attemptType = releaseInfo.attemptType || existing.attemptType;
            if (releaseInfo.request && Object.keys(releaseInfo.request).length > 0) {
                existing.request = releaseInfo.request;
            }
            this.data.jntuh_exam_releases[releaseId] = existing;
        } else {
            this.data.jntuh_exam_releases[releaseId] = {
                id: releaseId,
                examCode: releaseInfo.examCode,
                degree: releaseInfo.degree || "BTECH",
                regulation: releaseInfo.regulation,
                semester: releaseInfo.semester,
                attemptType: releaseInfo.attemptType,
                title: releaseInfo.title || "",
                publishedDate: releaseInfo.publishedDate || "",
                request: releaseInfo.request || {},
                firstSeenAt: now,
                lastSeenAt: now,
                isActive: true
            };
        }
        return this.data.jntuh_exam_releases[releaseId];
    }

    getAllCatalogReleases() {
        return Object.values(this.data.jntuh_exam_releases || {});
    }

    addSyncLog(logEntry) {
        if (!this.data.catalog_sync_logs) this.data.catalog_sync_logs = [];
        this.data.catalog_sync_logs.unshift(logEntry);
        // Keep last 50 sync logs
        this.data.catalog_sync_logs = this.data.catalog_sync_logs.slice(0, 50);
        this.saveToDisk();
    }

    getLastSyncLog() {
        return (this.data.catalog_sync_logs && this.data.catalog_sync_logs.length > 0)
            ? this.data.catalog_sync_logs[0]
            : null;
    }

    // 6. Group Candidate Applicability (Record releases that returned valid results for a group)
    recordGroupCandidate(groupKey, releaseId) {
        if (!groupKey || !releaseId) return;
        if (!this.data.group_candidates) this.data.group_candidates = {};
        if (!this.data.group_candidates[groupKey]) {
            this.data.group_candidates[groupKey] = [];
        }

        if (!this.data.group_candidates[groupKey].includes(releaseId)) {
            this.data.group_candidates[groupKey].push(releaseId);
            this.saveToDisk();
        }
    }

    getGroupCandidates(groupKey) {
        return (this.data.group_candidates && this.data.group_candidates[groupKey]) || [];
    }

    // 7. Student Results
    saveStudentResult(htno, batchInfo, parsedResult) {
        if (!htno || !parsedResult || !parsedResult.success) return null;
        if (!this.data.student_results) this.data.student_results = {};

        if (batchInfo) {
            this.findOrCreateBatch(batchInfo);
            this.findOrCreateGroup(batchInfo);
        }

        const cleanHtno = String(htno).trim().toUpperCase();
        const student = this.findOrCreateStudent(cleanHtno, batchInfo, parsedResult.details || {});
        const release = this.upsertCatalogRelease({
            examCode: parsedResult.examCode,
            attemptType: parsedResult.attemptType,
            semester: parsedResult.semester,
            regulation: batchInfo.regulation,
            degree: batchInfo.degree || "BTECH",
            title: parsedResult.title
        });

        if (batchInfo.groupKey) {
            this.recordGroupCandidate(batchInfo.groupKey, release.id);
        }

        const key = `${cleanHtno}_${release.id}`;
        this.data.student_results[key] = {
            id: key,
            studentId: student.id,
            htno: cleanHtno,
            resultReleaseId: release.id,
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

    // Record NO_RESULT for a release
    saveNoResult(htno, batchInfo, releaseInfo) {
        if (!htno || !releaseInfo) return null;
        if (!this.data.student_results) this.data.student_results = {};

        const cleanHtno = String(htno).trim().toUpperCase();
        const releaseId = `${releaseInfo.examCode}_${releaseInfo.attemptType}`;
        const key = `${cleanHtno}_${releaseId}`;

        if (this.data.student_results[key] && this.data.student_results[key].hasResult) {
            return this.data.student_results[key];
        }

        const student = this.findOrCreateStudent(cleanHtno, batchInfo);
        const release = this.upsertCatalogRelease({
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

    getStudentResultForRelease(htno, releaseId) {
        if (!htno || !this.data.student_results) return null;
        const cleanHtno = String(htno).trim().toUpperCase();
        const key = `${cleanHtno}_${releaseId}`;
        return this.data.student_results[key] || null;
    }

    getAllValidResultsForStudent(htno) {
        if (!htno || !this.data.student_results) return [];
        const cleanHtno = String(htno).trim().toUpperCase();
        return Object.values(this.data.student_results).filter(
            r => r.htno === cleanHtno && r.hasResult
        );
    }

    // 8. Catalog Versioning & Targeted Release Checks
    getCatalogVersion() {
        return this.data.catalog_version || 1;
    }

    incrementCatalogVersion() {
        if (!this.data.catalog_version) this.data.catalog_version = 1;
        this.data.catalog_version += 1;
        this.saveToDisk();
        return this.data.catalog_version;
    }

    recordReleaseCheck(htno, releaseId, status) {
        if (!htno || !releaseId) return null;
        if (!this.data.student_release_checks) this.data.student_release_checks = {};
        const cleanHtno = String(htno).trim().toUpperCase();
        const key = `${cleanHtno}_${releaseId}`;
        this.data.student_release_checks[key] = {
            htno: cleanHtno,
            releaseId,
            status, // 'FOUND', 'NO_RESULT', 'NOT_NEEDED', 'PENDING'
            checkedAt: new Date().toISOString()
        };
        this.saveToDisk();
        return this.data.student_release_checks[key];
    }

    getReleaseCheck(htno, releaseId) {
        if (!htno || !releaseId || !this.data.student_release_checks) return null;
        const cleanHtno = String(htno).trim().toUpperCase();
        const key = `${cleanHtno}_${releaseId}`;
        return this.data.student_release_checks[key] || null;
    }

    getAllReleaseChecksForStudent(htno) {
        if (!htno || !this.data.student_release_checks) return {};
        const cleanHtno = String(htno).trim().toUpperCase();
        const results = {};
        Object.values(this.data.student_release_checks).forEach(check => {
            if (check.htno === cleanHtno) {
                results[check.releaseId] = check;
            }
        });
        return results;
    }

    // 9. Pending Result Check Queue
    addPendingResultCheck(htno, releaseId, priority = "NORMAL") {
        if (!htno || !releaseId) return null;
        if (!this.data.pending_result_checks) this.data.pending_result_checks = [];
        const cleanHtno = String(htno).trim().toUpperCase();
        const jobId = `job_${cleanHtno}_${releaseId}`;

        const existingIdx = this.data.pending_result_checks.findIndex(j => j.id === jobId);
        if (existingIdx !== -1) {
            return this.data.pending_result_checks[existingIdx];
        }

        const job = {
            id: jobId,
            htno: cleanHtno,
            releaseId,
            priority,
            status: "PENDING", // 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
            attempts: 0,
            error: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.data.pending_result_checks.push(job);
        this.recordReleaseCheck(cleanHtno, releaseId, "PENDING");
        this.saveToDisk();
        return job;
    }

    getPendingResultChecks(limit = 10) {
        if (!this.data.pending_result_checks) return [];
        return this.data.pending_result_checks
            .filter(j => j.status === "PENDING")
            .sort((a, b) => (a.priority === "HIGH" ? -1 : 1))
            .slice(0, limit);
    }

    updatePendingJob(jobId, status, error = null) {
        if (!this.data.pending_result_checks) return null;
        const job = this.data.pending_result_checks.find(j => j.id === jobId);
        if (job) {
            job.status = status;
            job.updatedAt = new Date().toISOString();
            if (error) job.error = error;
            if (status === "PROCESSING") job.attempts = (job.attempts || 0) + 1;

            if (status === "COMPLETED") {
                this.data.pending_result_checks = this.data.pending_result_checks.filter(j => j.id !== jobId);
            }
            this.saveToDisk();
        }
        return job;
    }

    removePendingJobForStudentAndRelease(htno, releaseId) {
        if (!htno || !releaseId || !this.data.pending_result_checks) return;
        const cleanHtno = String(htno).trim().toUpperCase();
        const jobId = `job_${cleanHtno}_${releaseId}`;
        this.data.pending_result_checks = this.data.pending_result_checks.filter(j => j.id !== jobId);
        this.saveToDisk();
    }

    // 10. Student Cohort Queries for Impact Analyzer
    getAllStudents() {
        return Object.values(this.data.students || {});
    }

    getStudentsForGroupKeys(groupKeys = []) {
        if (!groupKeys || groupKeys.length === 0 || !this.data.students) return [];
        const set = new Set(groupKeys);
        return Object.values(this.data.students).filter(s => set.has(s.groupKey));
    }
}

module.exports = new StoreService();


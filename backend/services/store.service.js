/**
 * Persistent Database Store Service
 * Implements the normalized relational architecture specified in architecture.md:
 * CATALOG (catalog.json) <-> STUDENTS & RESULTS (store.json)
 * 
 * Partitioned per specifications:
 * - catalog.json: B.Tech examCodes, semester, regulation, attemptType, title, metadata & sync logs.
 * - store.json: Students, verified results, subject details, checked releases, search progress & queue.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");
const RESULTS_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 6 months (180 days)

class StoreService {
    constructor() {
        this.RESULTS_TTL_MS = RESULTS_TTL_MS;
        this.data = {
            results_ttl_days: 180,
            results_cache_duration_ms: RESULTS_TTL_MS,
            batches: {},
            students: {},
            htno_groups: {},
            group_candidates: {},
            student_search_state: {},
            result_groups: {},
            student_results: {},
            student_release_checks: {},
            pending_result_checks: []
        };
        this.catalogData = {
            catalog_version: 1,
            last_sync: null,
            releases: {},
            sync_logs: []
        };
        this.initStore();
    }

    initStore() {
        this.reloadFromDisk();
        this.reloadCatalogFromDisk();
        this.sanitizeStoreData();
    }

    sanitizeStoreData() {
        const PASSING_GRADES = new Set(["O", "A+", "A", "B+", "B", "C", "D", "P", "PASS", "PASSED"]);
        const { calculateGPA } = require("../parsers/result.parser");
        let modified = false;

        const results = this.data.student_results || {};
        for (const res of Object.values(results)) {
            if (!res || !res.hasResult) continue;

            if (Array.isArray(res.subjects)) {
                for (const sub of res.subjects) {
                    const g = String(sub.grade || '').trim().toUpperCase();
                    if (PASSING_GRADES.has(g)) {
                        if (sub.isMalpractice || sub.remarks === "WITHHELD/MALPRACTICE") {
                            sub.isMalpractice = false;
                            sub.remarks = "";
                            modified = true;
                        }
                    }
                }
            }

            if (res.table && Array.isArray(res.table) && res.table.length > 1) {
                const newSummary = calculateGPA(res.table);
                if (newSummary) {
                    if (res.summary?.isFailed !== newSummary.isFailed || res.summary?.earnedCredits !== newSummary.earnedCredits) {
                        res.summary = newSummary;
                        res.resultStatus = newSummary.isFailed ? "FAILED" : "PASSED";
                        modified = true;
                    }
                }
            }
        }

        // Normalize any legacy NO_RESULT to NOT_FOUND
        const checks = this.data.student_release_checks || {};
        for (const check of Object.values(checks)) {
            if (check && check.status === "NO_RESULT") {
                check.status = "NOT_FOUND";
                modified = true;
            }
        }

        // Ensure all stored students have immutable createdAt and lastUpdatedAt timestamps
        const students = this.data.students || {};
        for (const student of Object.values(students)) {
            if (student) {
                if (!student.createdAt) {
                    student.createdAt = student.firstVerifiedAt || new Date().toISOString();
                    modified = true;
                }
                if (!student.lastUpdatedAt) {
                    student.lastUpdatedAt = student.updatedAt || student.createdAt;
                    modified = true;
                }
            }
        }

        if (modified) {
            console.log("[STORE SERVICE] Cleaned false malpractice flags, migrated legacy checks, and initialized 6-month retention timestamps. Saving store...");
            this.saveStoreToDisk();
        }
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
                        results_ttl_days: parsed.results_ttl_days || 180,
                        results_cache_duration_ms: parsed.results_cache_duration_ms || RESULTS_TTL_MS,
                        batches: parsed.batches || {},
                        students: parsed.students || {},
                        htno_groups: parsed.htno_groups || {},
                        group_candidates: parsed.group_candidates || {},
                        student_search_state: parsed.student_search_state || {},
                        result_groups: parsed.result_groups || {},
                        student_results: parsed.student_results || {},
                        student_release_checks: parsed.student_release_checks || {},
                        pending_result_checks: parsed.pending_result_checks || []
                    };
                    // Keep temporary reference to legacy releases for catalog migration if needed
                    if (parsed.jntuh_exam_releases && Object.keys(parsed.jntuh_exam_releases).length > 0) {
                        this._legacy_jntuh_exam_releases = parsed.jntuh_exam_releases;
                        this._legacy_catalog_sync_logs = parsed.catalog_sync_logs || [];
                    }
                }
            } else {
                this.saveStoreToDisk();
            }
        } catch (error) {
            console.error("[STORE SERVICE] Error initializing store.json:", error.message);
        }
    }

    reloadCatalogFromDisk() {
        try {
            if (fs.existsSync(CATALOG_FILE)) {
                const fileContent = fs.readFileSync(CATALOG_FILE, "utf-8");
                if (fileContent.trim()) {
                    const parsed = JSON.parse(fileContent);
                    this.catalogData = {
                        catalog_version: parsed.catalog_version || 1,
                        last_sync: parsed.last_sync || null,
                        releases: parsed.releases || {},
                        sync_logs: parsed.sync_logs || []
                    };
                    return;
                }
            }

            // Automatic Migration: Partition catalog out of store.json into separate catalog.json
            if (this._legacy_jntuh_exam_releases && Object.keys(this._legacy_jntuh_exam_releases).length > 0) {
                console.log("[STORE SERVICE] Migrating catalog releases from store.json into separate catalog.json...");
                this.catalogData = {
                    catalog_version: (this._legacy_catalog_sync_logs && this._legacy_catalog_sync_logs.length) || 1,
                    last_sync: (this._legacy_catalog_sync_logs && this._legacy_catalog_sync_logs.length > 0) ? this._legacy_catalog_sync_logs[0] : null,
                    releases: this._legacy_jntuh_exam_releases,
                    sync_logs: this._legacy_catalog_sync_logs || []
                };
                delete this._legacy_jntuh_exam_releases;
                delete this._legacy_catalog_sync_logs;
                this.saveCatalogToDisk();
                this.saveStoreToDisk();
                console.log(`[STORE SERVICE] Migrated ${Object.keys(this.catalogData.releases).length} catalog releases into separate catalog.json.`);
            } else {
                this.saveCatalogToDisk();
            }
        } catch (error) {
            console.error("[STORE SERVICE] Error initializing catalog.json:", error.message);
        }
    }

    // Safe write to store.json
    saveStoreToDisk() {
        try {
            fs.writeFileSync(STORE_FILE, JSON.stringify(this.data, null, 2), "utf-8");
        } catch (error) {
            console.error("[STORE SERVICE] Error saving store.json to disk:", error.message);
        }
    }

    saveToDisk() {
        this.saveStoreToDisk();
    }

    // Safe write to catalog.json
    saveCatalogToDisk() {
        try {
            fs.writeFileSync(CATALOG_FILE, JSON.stringify(this.catalogData, null, 2), "utf-8");
        } catch (error) {
            console.error("[STORE SERVICE] Error saving catalog.json to disk:", error.message);
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
            this.saveStoreToDisk();
        }
        return this.data.batches[batchInfo.batchId];
    }

    getBatch(batchId) {
        if (!this.data.batches) return null;
        return this.data.batches[batchId] || null;
    }

    getAllBatches() {
        return Object.values(this.data.batches || {});
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
            this.saveStoreToDisk();
        }
        return this.data.htno_groups[groupInfo.groupKey];
    }

    getGroup(groupKey) {
        if (!this.data.htno_groups) return null;
        return this.data.htno_groups[groupKey] || null;
    }

    getAllGroups() {
        return Object.values(this.data.htno_groups || {});
    }

    // 3. Students
    findOrCreateStudent(htno, batchInfo, studentDetails = {}) {
        const cleanHtno = String(htno).trim().toUpperCase();
        if (!this.data.students) this.data.students = {};

        const now = new Date().toISOString();

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
                createdAt: now,
                firstVerifiedAt: now,
                lastUpdatedAt: now,
                updatedAt: now
            };
            this.saveStoreToDisk();
        } else {
            // Existing student record: preserve original createdAt (NEVER reset createdAt on refresh!)
            const student = this.data.students[cleanHtno];
            let modified = false;

            if (!student.createdAt) {
                student.createdAt = student.firstVerifiedAt || now;
                modified = true;
            }
            if (studentDetails.name && !student.name) {
                student.name = studentDetails.name;
                modified = true;
            }
            if (studentDetails.fatherName && !student.fatherName) {
                student.fatherName = studentDetails.fatherName;
                modified = true;
            }

            if (modified) {
                student.lastUpdatedAt = now;
                student.updatedAt = now;
                this.saveStoreToDisk();
            }
        }

        return this.data.students[cleanHtno];
    }

    getStudent(htno) {
        if (!htno || !this.data.students) return null;
        const cleanHtno = String(htno).trim().toUpperCase();
        return this.data.students[cleanHtno] || null;
    }

    getAllStudents() {
        return Object.values(this.data.students || {});
    }

    getStudentsForGroupKeys(groupKeys = []) {
        if (!groupKeys || groupKeys.length === 0 || !this.data.students) return [];
        const set = new Set(groupKeys);
        return Object.values(this.data.students).filter(s => set.has(s.groupKey));
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
        const now = new Date();
        const expiresAt = new Date(now.getTime() + RESULTS_TTL_MS).toISOString();
        this.data.student_search_state[cleanHtno] = {
            htno: cleanHtno,
            ...(this.data.student_search_state[cleanHtno] || {}),
            ...stateData,
            updatedAt: now.toISOString(),
            expiresAt: expiresAt
        };
        this.saveStoreToDisk();
        return this.data.student_search_state[cleanHtno];
    }

    // 6-Month HTNO Retention Methods
    getStudentExpiryDate(htno) {
        if (!htno || !this.data.students) return null;
        const cleanHtno = String(htno).trim().toUpperCase();
        const student = this.data.students[cleanHtno];
        if (!student) return null;
        const createdTimestamp = student.createdAt || student.firstVerifiedAt;
        if (!createdTimestamp) return null;
        const d = new Date(createdTimestamp);
        if (Number.isNaN(d.getTime())) return null;
        const expiry = new Date(d);
        expiry.setUTCMonth(expiry.getUTCMonth() + 6);
        return expiry;
    }

    isStudentExpired(htno, now = new Date()) {
        const expiry = this.getStudentExpiryDate(htno);
        if (!expiry) return false;
        return now.getTime() >= expiry.getTime();
    }

    deleteStudentData(htno) {
        if (!htno) return false;
        const cleanHtno = String(htno).trim().toUpperCase();
        let modified = false;

        if (this.data.students && this.data.students[cleanHtno]) {
            delete this.data.students[cleanHtno];
            modified = true;
        }

        if (this.data.student_results) {
            for (const [key, res] of Object.entries(this.data.student_results)) {
                if (res && res.htno === cleanHtno) {
                    delete this.data.student_results[key];
                    modified = true;
                }
            }
        }

        if (this.data.student_release_checks) {
            for (const [key, check] of Object.entries(this.data.student_release_checks)) {
                if (check && check.htno === cleanHtno) {
                    delete this.data.student_release_checks[key];
                    modified = true;
                }
            }
        }

        if (this.data.student_search_state && this.data.student_search_state[cleanHtno]) {
            delete this.data.student_search_state[cleanHtno];
            modified = true;
        }

        if (Array.isArray(this.data.pending_result_checks)) {
            const originalLength = this.data.pending_result_checks.length;
            this.data.pending_result_checks = this.data.pending_result_checks.filter(
                job => job.htno !== cleanHtno
            );
            if (this.data.pending_result_checks.length !== originalLength) {
                modified = true;
            }
        }

        if (modified) {
            this.saveStoreToDisk();
        }
        return modified;
    }

    cleanupExpiredResults(now = new Date()) {
        this.reloadFromDisk();
        let removed = 0;
        const students = this.data.students || {};
        const expiredHtnos = [];

        for (const [htno, student] of Object.entries(students)) {
            const createdTimestamp = student.createdAt || student.firstVerifiedAt;
            if (!createdTimestamp) {
                // Preserve legacy records until their age is established.
                continue;
            }

            const createdAt = new Date(createdTimestamp);
            if (Number.isNaN(createdAt.getTime())) {
                continue;
            }

            const expiryDate = new Date(createdAt);
            expiryDate.setUTCMonth(expiryDate.getUTCMonth() + 6);

            if (now >= expiryDate) {
                expiredHtnos.push(htno);
            }
        }

        for (const htno of expiredHtnos) {
            this.deleteStudentData(htno);
            removed++;
        }

        if (removed > 0) {
            console.log(`[RETENTION CLEANUP] Expired HTNO records removed: ${removed}`);
        } else {
            console.log(`[RETENTION CLEANUP] Daily check completed: 0 expired HTNO records.`);
        }

        return { removed, expiredHtnos };
    }

    getRetentionStatus(now = new Date()) {
        this.reloadFromDisk();
        const students = Object.values(this.data.students || {});
        let expiredCount = 0;
        let activeCount = 0;
        let oldest = null;
        let newest = null;

        students.forEach(s => {
            const created = s.createdAt || s.firstVerifiedAt;
            if (!created) return;
            const d = new Date(created);
            if (Number.isNaN(d.getTime())) return;

            const expiry = new Date(d);
            expiry.setUTCMonth(expiry.getUTCMonth() + 6);

            const isExpired = now >= expiry;
            if (isExpired) expiredCount++;
            else activeCount++;

            if (!oldest || d < new Date(oldest.createdAt)) {
                oldest = { htno: s.htno, createdAt: s.createdAt, expiryDate: expiry.toISOString() };
            }
            if (!newest || d > new Date(newest.createdAt)) {
                newest = { htno: s.htno, createdAt: s.createdAt, expiryDate: expiry.toISOString() };
            }
        });

        return {
            retentionPolicy: "6 calendar months from createdAt",
            totalStudents: students.length,
            activeStudents: activeCount,
            expiredStudents: expiredCount,
            oldestRecord: oldest,
            newestRecord: newest,
            checkedAt: now.toISOString()
        };
    }

    isResultExpired(result, now = new Date()) {
        if (!result) return true;
        // If the student's 6-month retention window has expired, their results are expired
        if (result.htno && this.isStudentExpired(result.htno, now)) {
            return true;
        }
        if (result.hasResult) {
            return false;
        }
        if (result.expiresAt) {
            return new Date(result.expiresAt).getTime() < now.getTime();
        }
        if (result.fetchedAt) {
            return (now.getTime() - new Date(result.fetchedAt).getTime()) > RESULTS_TTL_MS;
        }
        return false;
    }

    isStateExpired(state, now = new Date()) {
        if (!state) return true;
        if (state.htno && this.isStudentExpired(state.htno, now)) {
            return true;
        }
        if (state.expiresAt) {
            return new Date(state.expiresAt).getTime() < now.getTime();
        }
        if (state.updatedAt) {
            return (now.getTime() - new Date(state.updatedAt).getTime()) > RESULTS_TTL_MS;
        }
        return false;
    }

    // 5. JNTUH Exam Catalog & Sync Logs (Stored in catalog.json)
    upsertCatalogRelease(releaseInfo, autoSave = true) {
        if (!this.catalogData.releases) this.catalogData.releases = {};
        const releaseId = releaseInfo.releaseId || `${releaseInfo.examCode}_${releaseInfo.attemptType}`;

        const existing = this.catalogData.releases[releaseId];
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
            this.catalogData.releases[releaseId] = existing;
        } else {
            this.catalogData.releases[releaseId] = {
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
        if (autoSave) {
            this.saveCatalogToDisk();
        }
        return this.catalogData.releases[releaseId];
    }

    getAllCatalogReleases() {
        return Object.values(this.catalogData.releases || {});
    }

    getCatalogRelease(releaseId) {
        if (!releaseId || !this.catalogData.releases) return null;
        return this.catalogData.releases[releaseId] || null;
    }

    addSyncLog(logEntry) {
        if (!this.catalogData.sync_logs) this.catalogData.sync_logs = [];
        this.catalogData.sync_logs.unshift(logEntry);
        this.catalogData.sync_logs = this.catalogData.sync_logs.slice(0, 50);
        this.catalogData.last_sync = logEntry;
        this.saveCatalogToDisk();
    }

    getLastSyncLog() {
        return this.catalogData.last_sync || (this.catalogData.sync_logs && this.catalogData.sync_logs.length > 0 ? this.catalogData.sync_logs[0] : null);
    }

    getCatalogVersion() {
        return this.catalogData.catalog_version || 1;
    }

    incrementCatalogVersion() {
        this.catalogData.catalog_version = (this.catalogData.catalog_version || 1) + 1;
        this.saveCatalogToDisk();
        return this.catalogData.catalog_version;
    }

    // 6. Group Candidate Applicability
    recordGroupCandidate(groupKey, releaseId) {
        if (!groupKey || !releaseId) return;
        if (!this.data.group_candidates) this.data.group_candidates = {};
        if (!this.data.group_candidates[groupKey]) {
            this.data.group_candidates[groupKey] = [];
        }

        if (!this.data.group_candidates[groupKey].includes(releaseId)) {
            this.data.group_candidates[groupKey].push(releaseId);
            this.saveStoreToDisk();
        }
    }

    getGroupCandidates(groupKey) {
        return (this.data.group_candidates && this.data.group_candidates[groupKey]) || [];
    }

    // 7. Student Results (Historical results are preserved and never deleted or overwritten)
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

        // Keyed by student and release: old attempts (e.g. 1964 Regular) are preserved, new attempts (e.g. 1990 Supply) are appended
        const key = `${cleanHtno}_${release.id}`;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + RESULTS_TTL_MS).toISOString();
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
            fetchedAt: now.toISOString(),
            expiresAt: expiresAt,
            summary: parsedResult.summary,
            subjects: parsedResult.subjects || [],
            table: parsedResult.table || []
        };

        student.lastUpdatedAt = now.toISOString();
        student.updatedAt = student.lastUpdatedAt;

        this.saveStoreToDisk();
        return this.data.student_results[key];
    }

    // Record NOT_FOUND placeholder for an un-found release
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

        const now = new Date();
        const expiresAt = new Date(now.getTime() + RESULTS_TTL_MS).toISOString();
        this.data.student_results[key] = {
            id: key,
            studentId: student.id,
            htno: cleanHtno,
            resultReleaseId: release.id,
            examCode: releaseInfo.examCode,
            semester: releaseInfo.semester,
            attemptType: releaseInfo.attemptType,
            examTitle: releaseInfo.title,
            resultStatus: "NOT_FOUND",
            hasResult: false,
            fetchedAt: now.toISOString(),
            expiresAt: expiresAt,
            summary: null,
            subjects: [],
            table: []
        };

        this.saveStoreToDisk();
        return this.data.student_results[key];
    }

    getStudentResultForRelease(htno, releaseId, includeExpired = false) {
        if (!htno || !this.data.student_results) return null;
        const cleanHtno = String(htno).trim().toUpperCase();
        if (!includeExpired && this.isStudentExpired(cleanHtno)) {
            return null;
        }
        const key = `${cleanHtno}_${releaseId}`;
        const record = this.data.student_results[key] || null;
        if (!record) return null;
        if (record.hasResult) return record;
        if (!includeExpired && this.isResultExpired(record)) {
            return null;
        }
        return record;
    }

    getAllValidResultsForStudent(htno, includeExpired = false) {
        if (!htno || !this.data.student_results) return [];
        const cleanHtno = String(htno).trim().toUpperCase();
        if (!includeExpired && this.isStudentExpired(cleanHtno)) {
            return [];
        }
        return Object.values(this.data.student_results).filter(
            r => r.htno === cleanHtno && r.hasResult
        );
    }

    // 8. Release Check Status Tracking
    // Statuses: 'FOUND', 'NOT_FOUND', 'NOT_NEEDED', 'PENDING', 'RETRY'
    recordReleaseCheck(htno, releaseId, status, details = null) {
        if (!htno || !releaseId) return null;
        if (!this.data.student_release_checks) this.data.student_release_checks = {};
        const cleanHtno = String(htno).trim().toUpperCase();
        const key = `${cleanHtno}_${releaseId}`;
        const examCode = releaseId.split('_')[0];

        let normalizedStatus = status;
        if (status === "NO_RESULT") normalizedStatus = "NOT_FOUND";

        this.data.student_release_checks[key] = {
            htno: cleanHtno,
            releaseId,
            examCode,
            status: normalizedStatus, // 'FOUND', 'NOT_FOUND', 'NOT_NEEDED', 'PENDING', 'RETRY'
            details: details || null,
            checkedAt: new Date().toISOString()
        };
        this.saveStoreToDisk();
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

    getStudentReleaseChecksSummary(htno) {
        if (!htno) return { htno: "", releaseChecks: {} };
        this.reloadFromDisk();
        const cleanHtno = String(htno).trim().toUpperCase();
        const releaseChecks = {};
        if (this.data.student_release_checks) {
            Object.values(this.data.student_release_checks).forEach(check => {
                if (check.htno === cleanHtno) {
                    const examCode = check.examCode || check.releaseId.split('_')[0];
                    let status = check.status;
                    if (status === "NO_RESULT") status = "NOT_FOUND";
                    releaseChecks[examCode] = status;
                }
            });
        }
        return {
            htno: cleanHtno,
            releaseChecks
        };
    }

    getStudentStoreSummary(htno) {
        if (!htno) return {};
        this.reloadFromDisk();
        const cleanHtno = String(htno).trim().toUpperCase();
        const student = this.getStudent(cleanHtno);
        const results = this.getAllValidResultsForStudent(cleanHtno, true); // show results even if viewing raw store summary
        const mappedResults = results.map(r => {
            let failedCount = 0;
            if (r.summary && typeof r.summary.failedSubjects === 'number') {
                failedCount = r.summary.failedSubjects;
            } else if (r.subjects && Array.isArray(r.subjects)) {
                failedCount = r.subjects.filter(s => s.isFailed || s.isBacklog).length;
            }
            return {
                examCode: r.examCode,
                semester: r.semester,
                type: r.attemptType,
                failedSubjects: failedCount
            };
        });

        const createdAt = student?.createdAt || student?.firstVerifiedAt || null;
        const lastUpdatedAt = student?.lastUpdatedAt || student?.updatedAt || createdAt;
        const expiryDate = this.getStudentExpiryDate(cleanHtno);
        const isExpired = this.isStudentExpired(cleanHtno);

        return {
            [cleanHtno]: {
                createdAt: createdAt,
                lastUpdatedAt: lastUpdatedAt,
                expiryDate: expiryDate ? expiryDate.toISOString() : null,
                isExpired: isExpired,
                results: mappedResults
            }
        };
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
        this.saveStoreToDisk();
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
            this.saveStoreToDisk();
        }
        return job;
    }

    removePendingJobForStudentAndRelease(htno, releaseId) {
        if (!htno || !releaseId || !this.data.pending_result_checks) return;
        const cleanHtno = String(htno).trim().toUpperCase();
        const jobId = `job_${cleanHtno}_${releaseId}`;
        this.data.pending_result_checks = this.data.pending_result_checks.filter(j => j.id !== jobId);
        this.saveStoreToDisk();
    }
}

module.exports = new StoreService();

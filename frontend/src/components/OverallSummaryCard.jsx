import React from 'react';

const PASSING_GRADES = new Set(["O", "A+", "A", "B+", "B", "C", "D", "P", "PASS", "PASSED"]);

function isBacklogSubject(sub) {
  if (!sub) return false;
  if (sub.isFailed || sub.isBacklog || sub.isMalpractice) return true;
  const grade = String(sub.finalGrade || sub.finalMarks?.grade || sub.grade || '').trim().toUpperCase();
  const remarks = String(sub.remarks || sub.category || '').toUpperCase();
  if (remarks.includes('MALPRACTICE') || remarks.includes('WITHHELD') || remarks.includes('SPOT CENTER') || remarks.includes('EXAM CENTER') || remarks.includes('MP') || remarks.includes('WH')) {
    return true;
  }
  if (!grade || grade === '-' || grade === 'F' || grade === 'AB' || grade === 'ABSENT' || grade === 'MP' || grade === 'WH') {
    return true;
  }
  return !PASSING_GRADES.has(grade);
}

export default function OverallSummaryCard({ summary, semesters }) {
  if (!summary) return null;

  const { isFailed, cgpa, percentage, totalEarnedCredits, totalCredits, totalSemesters } = summary;

  let totalBacklogs = 0;
  if (semesters && Array.isArray(semesters)) {
    totalBacklogs = semesters.reduce((sum, sem) => {
      let semFailed = sem.summary?.failedSubjects || 0;
      if (sem.subjectsList && Array.isArray(sem.subjectsList)) {
        const count = sem.subjectsList.filter(isBacklogSubject).length;
        semFailed = Math.max(semFailed, count);
      }
      return sum + semFailed;
    }, 0);
  } else if (summary.totalFailedSubjects != null) {
    totalBacklogs = summary.totalFailedSubjects;
  }

  const isFailedOverall = isFailed || totalBacklogs > 0;
  const cgpaDisplay = !isFailedOverall && cgpa != null ? Number(cgpa).toFixed(2) : "N/A";
  const percentageDisplay = !isFailedOverall && percentage != null ? `${Number(percentage).toFixed(1)}%` : "N/A";

  return (
    <div className="result-card overall-summary-card" style={{ marginBottom: "20px" }}>
      <div
        className="exam-banner"
        style={{
          background: "linear-gradient(135deg, #0052cc 0%, #0033aa 100%)",
          color: "white"
        }}
      >
        Overall Cumulative Performance
      </div>
      <div className="stats-grid">
        <div className={`stat-card primary ${isFailedOverall ? 'failed' : ''}`} style={isFailedOverall ? { background: '#64748b', color: 'white' } : {}}>
          <span className="stat-label">Overall CGPA</span>
          <span className="stat-value">{cgpaDisplay}</span>
          <span className="stat-sub">{isFailedOverall ? 'Must pass all sems' : 'Cumulative GPA'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Overall %</span>
          <span className="stat-value">{percentageDisplay}</span>
          <span className="stat-sub">{isFailedOverall ? 'Must pass all sems' : 'Equivalent %'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Credits</span>
          <span className="stat-value">{totalEarnedCredits} / {totalCredits}</span>
          <span className="stat-sub">Earned / Max</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Backlogs</span>
          <span className="stat-value" style={{ color: totalBacklogs > 0 ? '#b91c1c' : '#15803d' }}>
            {totalBacklogs}
          </span>
          <span className="stat-sub">{totalBacklogs > 0 ? `${totalBacklogs} Pending` : 'Passed All Sems'}</span>
        </div>
      </div>
    </div>
  );
}

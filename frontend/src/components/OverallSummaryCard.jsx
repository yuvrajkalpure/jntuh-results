import React from 'react';

export default function OverallSummaryCard({ summary, semesters }) {
  if (!summary) return null;

  const { isFailed, cgpa, percentage, totalEarnedCredits, totalCredits, totalSemesters } = summary;
  const cgpaDisplay = !isFailed && cgpa != null ? Number(cgpa).toFixed(2) : "N/A";
  const percentageDisplay = !isFailed && percentage != null ? `${Number(percentage).toFixed(1)}%` : "N/A";

  let totalBacklogs = 0;
  if (semesters && Array.isArray(semesters)) {
    totalBacklogs = semesters.reduce((sum, sem) => {
      if (sem.summary && sem.summary.failedSubjects != null) {
        return sum + sem.summary.failedSubjects;
      }
      if (sem.subjectsList && Array.isArray(sem.subjectsList)) {
        const count = sem.subjectsList.filter(s => {
          const g = String(s.finalGrade || s.finalMarks?.grade || '').trim().toUpperCase();
          return g === 'F' || g === 'AB' || g === 'ABSENT';
        }).length;
        return sum + count;
      }
      return sum;
    }, 0);
  } else if (summary.totalFailedSubjects != null) {
    totalBacklogs = summary.totalFailedSubjects;
  }

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
        <div className={`stat-card primary ${isFailed ? 'failed' : ''}`} style={isFailed ? { background: '#64748b', color: 'white' } : {}}>
          <span className="stat-label">Overall CGPA</span>
          <span className="stat-value">{cgpaDisplay}</span>
          <span className="stat-sub">{isFailed ? 'Must pass all sems' : 'Cumulative GPA'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Overall %</span>
          <span className="stat-value">{percentageDisplay}</span>
          <span className="stat-sub">{isFailed ? 'Must pass all sems' : 'Equivalent %'}</span>
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

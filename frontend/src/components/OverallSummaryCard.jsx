import React from 'react';

export default function OverallSummaryCard({ summary }) {
  if (!summary) return null;

  const { isFailed, cgpa, percentage, totalEarnedCredits, totalCredits, totalSemesters } = summary;
  const cgpaDisplay = !isFailed && cgpa != null ? Number(cgpa).toFixed(2) : "N/A";
  const percentageDisplay = !isFailed && percentage != null ? `${Number(percentage).toFixed(1)}%` : "N/A";
  const statusText = !isFailed ? "PASSED ALL" : "BACKLOGS EXIST";
  const statusColor = !isFailed ? "#15803d" : "#b91c1c";

  return (
    <div className="result-card" style={{ marginBottom: "20px" }}>
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
          <span className="stat-label">Overall Status</span>
          <span className="stat-value" style={{ color: statusColor }}>{statusText}</span>
          <span className="stat-sub">{totalSemesters} Semesters Found</span>
        </div>
      </div>
    </div>
  );
}

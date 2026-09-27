import React from 'react';
import ResultTable from './ResultTable';

export default function SemesterCard({ semester }) {
  if (!semester) return null;

  const { examTitle, semester: semLabel, summary, table, attempts, subjectsList, jntuhUrl } = semester;
  const title = examTitle || `Semester ${semLabel} Results`;

  let statsHTML = null;
  if (summary) {
    const isFailed = summary.isFailed || summary.failedSubjects > 0;
    const passStatusText = !isFailed ? "PASSED" : `FAILED (${summary.failedSubjects})`;
    const passStatusColor = !isFailed ? "#15803d" : "#b91c1c";

    const sgpaDisplay = !isFailed && summary.sgpa != null ? Number(summary.sgpa).toFixed(2) : "N/A";
    const percentageDisplay = !isFailed && summary.percentage != null ? `${Number(summary.percentage).toFixed(1)}%` : "N/A";

    statsHTML = (
      <div className="stats-grid">
        <div className={`stat-card primary ${isFailed ? 'failed' : ''}`} style={isFailed ? { background: '#64748b', color: 'white' } : {}}>
          <span className="stat-label">SGPA</span>
          <span className="stat-value">{sgpaDisplay}</span>
          <span className="stat-sub">{isFailed ? 'Must pass all' : 'Sem GPA'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Percentage</span>
          <span className="stat-value">{percentageDisplay}</span>
          <span className="stat-sub">{isFailed ? 'Must pass all' : 'Equivalent %'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Credits</span>
          <span className="stat-value">{summary.earnedCredits} / {summary.totalCredits}</span>
          <span className="stat-sub">Earned / Total</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Status</span>
          <span className="stat-value" style={{ color: passStatusColor }}>{passStatusText}</span>
          <span className="stat-sub">{summary.passedSubjects}/{summary.totalSubjects} Passed</span>
        </div>
      </div>
    );
  }

  return (
    <div className="result-card" style={{ background: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
      <div className="exam-banner-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <div className="exam-banner" style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1e293b' }}>{title}</div>
        {jntuhUrl && (
          <a
            href={jntuhUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: '600',
              textDecoration: 'none',
              transition: 'background 0.2s'
            }}
          >
            JNTUH Direct Link ↗
          </a>
        )}
      </div>

      {attempts && attempts.length > 0 && (
        <div className="attempts-badges" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>Result Releases:</span>
          {attempts.map((att, idx) => (
            <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                padding: '3px 10px',
                borderRadius: '12px',
                fontSize: '0.78rem',
                fontWeight: '600',
                background: att.examType === 'Regular' ? '#e0f2fe' : (att.examType === 'RC/RV' ? '#f3e8ff' : '#fef3c7'),
                color: att.examType === 'Regular' ? '#0369a1' : (att.examType === 'RC/RV' ? '#7e22ce' : '#b45309'),
                border: att.examType === 'Regular' ? '1px solid #bae6fd' : (att.examType === 'RC/RV' ? '1px solid #e9d5ff' : '1px solid #fde68a')
              }}>
                {att.examType}
              </span>
              {att.jntuhUrl && (
                <a
                  href={att.jntuhUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.75rem', color: '#2563eb', textDecoration: 'none', fontWeight: '500' }}
                  title={att.examTitle || att.title}
                >
                  [Results Link]
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {statsHTML}
      <ResultTable table={table} subjectsList={subjectsList} />
    </div>
  );
}

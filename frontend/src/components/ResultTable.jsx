import React, { useState } from 'react';

function getGradeClass(grade) {
  const clean = String(grade).trim().toUpperCase();
  if (clean === "O" || clean === "A+") return "grade-o";
  if (clean === "A" || clean === "B+") return "grade-a";
  if (clean === "B" || clean === "C") return "grade-b";
  if (clean === "F" || clean === "AB" || clean === "ABSENT") return "grade-f";
  return "";
}

export default function ResultTable({ table, subjectsList }) {
  const [expandedSubjects, setExpandedSubjects] = useState({});

  const toggleExpand = (code) => {
    setExpandedSubjects(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  // If subjectsList is available, use rich structured rendering with attempt history drawers
  if (subjectsList && Array.isArray(subjectsList) && subjectsList.length > 0) {
    return (
      <div className="table-wrapper">
        <table className="result-table">
          <thead>
            <tr>
              <th><span className="desktop-text">Subject Code</span><span className="mobile-text">Code</span></th>
              <th><span className="desktop-text">Subject Name</span><span className="mobile-text">Subject</span></th>
              <th><span className="desktop-text">Internal</span><span className="mobile-text">Int</span></th>
              <th><span className="desktop-text">External</span><span className="mobile-text">Ext</span></th>
              <th><span className="desktop-text">Total</span><span className="mobile-text">Tot</span></th>
              <th>Grade</th>
              <th><span className="desktop-text">Credits</span><span className="mobile-text">Cr</span></th>
              <th><span className="desktop-text">Attempts</span><span className="mobile-text">A</span></th>
            </tr>
          </thead>
          <tbody>
            {subjectsList.map((sub) => {
              const gradeClass = getGradeClass(sub.finalGrade || sub.finalMarks?.grade);
              const isFailed = gradeClass === "grade-f";
              const isExpanded = !!expandedSubjects[sub.subjectCode];
              const attemptsCount = sub.attemptsCount || 1;
              const hasMultipleAttempts = attemptsCount > 1;

              return (
                <React.Fragment key={sub.subjectCode}>
                  <tr className={isFailed ? 'failed-row' : ''}>
                    <td className="col-code">{sub.subjectCode}</td>
                    <td className="col-name">{sub.subjectName}</td>
                    <td className="col-num">{sub.finalMarks?.internal ?? '-'}</td>
                    <td className="col-num">{sub.finalMarks?.external ?? '-'}</td>
                    <td className="col-num col-total">{sub.finalMarks?.total ?? '-'}</td>
                    <td className="col-grade">
                      {gradeClass ? (
                        <span className={`grade-badge ${gradeClass}`}>
                          {sub.finalMarks?.grade || sub.finalGrade}
                        </span>
                      ) : (
                        sub.finalGrade || '-'
                      )}
                    </td>
                    <td className="col-num">{sub.finalMarks?.credits ?? sub.credits ?? '-'}</td>
                    <td className="col-attempts">
                      <button
                        type="button"
                        onClick={() => toggleExpand(sub.subjectCode)}
                        className={`attempts-pill-btn ${hasMultipleAttempts ? 'multiple' : 'single'}`}
                        title="Click to view detailed marks and JNTUH link per attempt"
                      >
                        <span className="desktop-text">{attemptsCount} Attempt{attemptsCount > 1 ? 's' : ''}</span>
                        <span className="mobile-text">A{attemptsCount}</span>
                        <span style={{ fontSize: '0.65rem' }}>{isExpanded ? '▲' : '▼'}</span>
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="attempts-history-row" style={{ background: '#f8fafc' }}>
                      <td colSpan="8" style={{ padding: '8px 12px' }}>
                        <div style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderLeft: '4px solid #2563eb',
                          borderRadius: '8px',
                          padding: '12px 14px'
                        }}>
                          <div style={{
                            display: 'flex',
                            justify: 'space-between',
                            alignItems: 'center',
                            marginBottom: '10px',
                            paddingBottom: '8px',
                            borderBottom: '1px solid #f1f5f9'
                          }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1e293b' }}>
                              Attempt History — {sub.subjectName} ({sub.subjectCode})
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Total Attempts: <strong>{attemptsCount}</strong>
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {sub.attemptsHistory && sub.attemptsHistory.length > 0 ? (
                              sub.attemptsHistory.map((att, idx) => {
                                const attGradeClass = getGradeClass(att.grade);
                                const attGradeStr = String(att.grade ?? '').trim().toUpperCase();
                                const isNoMarks = att.totalMarks === '-' || att.totalMarks === null || att.totalMarks === undefined || (att.internalMarks === '-' && att.externalMarks === '-');
                                const isAttFailed = attGradeStr === 'F' || attGradeStr === 'AB' || attGradeStr === 'ABSENT' || isNoMarks || !att.grade || att.grade === '-';

                                return (
                                  <div
                                    key={idx}
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'row',
                                      justify: 'space-between',
                                      alignItems: 'center',
                                      gap: '12px',
                                      padding: '8px 12px',
                                      background: isAttFailed ? '#fef2f2' : '#f0fdf4',
                                      border: isAttFailed ? '1px solid #fecaca' : '1px solid #bbf7d0',
                                      borderRadius: '6px'
                                    }}
                                  >
                                    <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{
                                          fontSize: '0.75rem',
                                          fontWeight: '700',
                                          color: isAttFailed ? '#991b1b' : '#166534'
                                        }}>
                                          Attempt {att.attemptNumber || idx + 1}: {att.examType}
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                          ({att.examTitle})
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '0.78rem', color: '#334155', marginTop: '2px' }}>
                                        Int: <strong>{att.internalMarks ?? '-'}</strong> | Ext: <strong>{att.externalMarks ?? '-'}</strong> | Total: <strong>{att.totalMarks ?? '-'}</strong> | Grade: <span className={`grade-badge ${attGradeClass}`}>{att.grade || '-'}</span> | Cr: <strong>{att.credits ?? '-'}</strong>
                                      </div>
                                    </div>

                                    {att.jntuhUrl && (
                                      <a
                                        href={att.jntuhUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          padding: '5px 10px',
                                          borderRadius: '6px',
                                          background: '#2563eb',
                                          color: '#ffffff',
                                          fontSize: '0.72rem',
                                          fontWeight: '600',
                                          textDecoration: 'none',
                                          whiteSpace: 'nowrap',
                                          flexShrink: 0
                                        }}
                                      >
                                        JNTUH Link ↗
                                      </a>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>No detailed attempt history recorded.</div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Fallback to table array rendering if subjectsList is not present
  if (!table || table.length === 0) return null;

  const headers = table[0].map(h => String(h).toLowerCase().trim());
  const gradeIdx = headers.findIndex(h => h.includes("grade") && !h.includes("point"));

  return (
    <div className="table-wrapper">
      <table className="result-table">
        <tbody>
          {table.map((row, rowIndex) => {
            let isRowFailed = false;
            if (rowIndex > 0) {
              if (gradeIdx !== -1 && row[gradeIdx]) {
                const gStr = String(row[gradeIdx]).trim().toUpperCase();
                if (gStr === "F" || gStr === "AB" || gStr === "ABSENT") isRowFailed = true;
              }
              if (!isRowFailed) {
                isRowFailed = row.some(cell => {
                  const cStr = String(cell).trim().toUpperCase();
                  return cStr === "F" || cStr === "AB" || cStr === "ABSENT";
                });
              }
            }

            const rowClass = rowIndex > 0 ? (isRowFailed ? 'failed-row' : '') : '';

            return (
              <tr key={rowIndex} className={rowClass}>
                {row.map((cell, cellIndex) => {
                  const isHeader = rowIndex === 0;
                  let cellContent = String(cell);

                  if (!isHeader && headers[cellIndex]?.includes("grade")) {
                    const gradeClass = getGradeClass(cell);
                    if (gradeClass) {
                      cellContent = (
                        <span className={`grade-badge ${gradeClass}`}>
                          {cell}
                        </span>
                      );
                    }
                  }

                  return isHeader ? (
                    <th key={cellIndex}>{cellContent}</th>
                  ) : (
                    <td key={cellIndex}>{cellContent}</td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

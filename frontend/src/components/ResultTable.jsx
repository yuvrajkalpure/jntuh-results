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
              <th className="col-name">Subject</th>
              <th className="col-num"><span className="desktop-text">Internal</span><span className="mobile-text">Int</span></th>
              <th className="col-num"><span className="desktop-text">External</span><span className="mobile-text">Ext</span></th>
              <th className="col-num"><span className="desktop-text">Total</span><span className="mobile-text">Tot</span></th>
              <th className="col-grade"><span className="desktop-text">Grade</span><span className="mobile-text">Gr</span></th>
              <th className="col-num"><span className="desktop-text">Credits</span><span className="mobile-text">Cr</span></th>
              <th className="col-attempts"><span className="desktop-text">Attempts</span><span className="mobile-text">Att</span></th>
            </tr>
          </thead>
          <tbody>
            {subjectsList.map((sub) => {
              const gradeClass = getGradeClass(sub.finalGrade || sub.finalMarks?.grade);
              const isFailed = gradeClass === "grade-f";
              const attemptsCount = sub.attemptsCount || 1;
              const hasMultipleAttempts = attemptsCount > 1;
              const isExpanded = hasMultipleAttempts && !!expandedSubjects[sub.subjectCode];

              return (
                <React.Fragment key={sub.subjectCode}>
                  <tr
                    onClick={() => {
                      if (hasMultipleAttempts) toggleExpand(sub.subjectCode);
                    }}
                    className={`${hasMultipleAttempts ? 'clickable-row' : ''} ${isFailed ? 'failed-row' : ''}`}
                    style={{ cursor: hasMultipleAttempts ? 'pointer' : 'default' }}
                    title={hasMultipleAttempts ? "Click row to view attempt history and details" : ""}
                  >
                    <td className="col-name">
                      <span>{sub.subjectName}</span>
                      <strong style={{ margin: '0 4px', fontWeight: '800', color: '#64748b' }}>•</strong>
                      <span style={{ fontSize: '0.86em', fontWeight: '600', color: '#475569' }}>{sub.subjectCode}</span>
                    </td>
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
                      {hasMultipleAttempts ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(sub.subjectCode);
                          }}
                          className="attempts-pill-btn multiple"
                          title="Click to view detailed marks per attempt"
                        >
                          <span className="desktop-text">{attemptsCount} Attempts</span>
                          <span className="mobile-text">{attemptsCount}</span>
                          <span style={{ fontSize: '0.65rem' }}>{isExpanded ? '▲' : '▼'}</span>
                        </button>
                      ) : (
                        <span className="attempts-pill-btn single" style={{ cursor: 'default' }}>
                          <span className="desktop-text">1 Attempt</span>
                          <span className="mobile-text">1</span>
                        </span>
                      )}
                    </td>
                  </tr>

                  {isExpanded && hasMultipleAttempts && sub.attemptsHistory && sub.attemptsHistory.map((att, idx) => {
                    const attGradeClass = getGradeClass(att.grade);
                    const attGradeStr = String(att.grade ?? '').trim().toUpperCase();
                    const isNoMarks = att.totalMarks === '-' || att.totalMarks === null || att.totalMarks === undefined || (att.internalMarks === '-' && att.externalMarks === '-');
                    const isAttFailed = attGradeStr === 'F' || attGradeStr === 'AB' || attGradeStr === 'ABSENT' || isNoMarks || !att.grade || att.grade === '-';
                    const attemptLabel = att.examType === 'RC/RV' ? 'RC/RV' : `Att ${att.attemptNumber || idx + 1}`;
                    const examTypeTitle = att.examType === 'RC/RV' ? 'RC/RV Revaluation' : att.examType;

                    return (
                      <tr
                        key={`att-${idx}`}
                        className={`attempt-sub-row ${isAttFailed ? 'failed-row' : ''}`}
                        style={{
                          background: isAttFailed ? '#fff5f5' : '#f0fdf4',
                          borderBottom: '1px dashed #cbd5e1'
                        }}
                      >
                        <td className="col-name" style={{ fontWeight: '500' }}>
                          <span style={{ color: '#94a3b8', marginRight: '4px' }}>↳</span>
                          <strong style={{ fontSize: '0.78rem', color: '#1e293b', marginRight: '4px' }}>{attemptLabel}:</strong>
                          <span style={{ fontSize: '0.78rem' }}>{examTypeTitle}</span>
                          {att.remarks && (
                            <span style={{
                              fontSize: '0.65rem',
                              fontWeight: '600',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: att.isNoChange ? '#e2e8f0' : '#dbeafe',
                              color: att.isNoChange ? '#475569' : '#1e40af',
                              marginLeft: '4px'
                            }}>
                              {att.remarks}
                            </span>
                          )}
                        </td>
                        <td className="col-num">{att.internalMarks ?? '-'}</td>
                        <td className="col-num">{att.externalMarks ?? '-'}</td>
                        <td className="col-num col-total">{att.totalMarks ?? '-'}</td>
                        <td className="col-grade">
                          {attGradeClass ? (
                            <span className={`grade-badge ${attGradeClass}`}>
                              {att.grade}
                            </span>
                          ) : (
                            att.grade || '-'
                          )}
                        </td>
                        <td className="col-num">{att.credits ?? '-'}</td>
                        <td className="col-attempts">
                          {att.jntuhUrl && (
                            <a
                              href={att.jntuhUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: '0.72rem',
                                color: '#2563eb',
                                fontWeight: '600',
                                textDecoration: 'none'
                              }}
                              title="Open JNTUH Result Page"
                            >
                              <span className="desktop-text">Link ↗</span>
                              <span className="mobile-text">↗</span>
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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

import React, { useState } from 'react';

const PASSING_GRADES = new Set(["O", "A+", "A", "B+", "B", "C", "D", "P", "PASS", "PASSED"]);

function isWithheldOrMalpractice(text) {
  if (!text) return false;
  const clean = String(text).trim().toUpperCase();
  if (!clean) return false;
  if (clean === "MP" || clean === "WH" || clean === "MALPRACTICE" || clean === "WITHHELD") {
    return true;
  }
  if (clean.includes("WITHHELD") || clean.includes("MALPRACTICE")) {
    return true;
  }
  if (clean.includes("SPOT CENTER") || clean.includes("EXAM CENTER")) {
    return true;
  }
  return false;
}

function getGradeClass(grade) {
  const clean = String(grade || '').trim().toUpperCase();
  if (clean === "O" || clean === "A+") return "grade-o";
  if (clean === "A" || clean === "B+") return "grade-a";
  if (clean === "B" || clean === "C") return "grade-b";
  if (clean === "D" || clean === "P" || clean === "PASS" || clean === "PASSED") return "grade-c";
  if (clean === "F" || clean === "AB" || clean === "ABSENT" || clean === "-" || isWithheldOrMalpractice(clean)) return "grade-f";
  return "";
}

function isBacklogSubject(sub) {
  if (!sub) return false;
  const grade = String(sub.finalGrade || sub.finalMarks?.grade || sub.grade || '').trim().toUpperCase();
  if (PASSING_GRADES.has(grade)) return false;
  if (sub.isFailed || sub.isBacklog || sub.isMalpractice) return true;
  const remarks = String(sub.remarks || sub.category || '').toUpperCase();
  if (isWithheldOrMalpractice(remarks)) return true;
  if (!grade || grade === '-' || grade === 'F' || grade === 'AB' || grade === 'ABSENT' || isWithheldOrMalpractice(grade)) return true;
  return true;
}

export default function ResultTable({ table, subjectsList }) {
  const [expandedSubjects, setExpandedSubjects] = useState({});

  const toggleExpand = (code) => {
    setExpandedSubjects(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  const colCodeClass = "col-code";

  // If subjectsList is available, use rich structured rendering with attempt history drawers
  if (subjectsList && Array.isArray(subjectsList) && subjectsList.length > 0) {
    return (
      <div className="table-wrapper">
        <table className="result-table">
          <thead>
            <tr>
              <th className={colCodeClass}><span className="desktop-text">Code</span><span className="mobile-text">Code</span></th>
              <th className="col-name"><span className="desktop-text">Subject Name</span><span className="mobile-text">Subject</span></th>
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
              const isFailed = isBacklogSubject(sub) || gradeClass === "grade-f";
              const isMp = isFailed && (sub.isMalpractice || isWithheldOrMalpractice(sub.remarks) || isWithheldOrMalpractice(sub.category));

              const history = sub.attemptsHistory || [];
              const realExamAttempts = history.filter(att => att.examType !== 'RC/RV');
              const attemptsCount = realExamAttempts.length > 0 ? realExamAttempts.length : (sub.attemptsCount || 1);
              const hasMultipleEntries = history.length > 1 || attemptsCount > 1;
              const isExpanded = hasMultipleEntries && !!expandedSubjects[sub.subjectCode];

              let realAttemptCounter = 0;

              return (
                <React.Fragment key={sub.subjectCode}>
                  <tr
                    onClick={() => {
                      if (hasMultipleEntries) toggleExpand(sub.subjectCode);
                    }}
                    className={`${hasMultipleEntries ? 'clickable-row' : ''} ${isFailed ? 'failed-row' : ''}`}
                    style={{ cursor: hasMultipleEntries ? 'pointer' : 'default' }}
                    title={hasMultipleEntries ? "Click row to view attempt history and details" : ""}
                  >
                    <td className={colCodeClass}>{sub.subjectCode}</td>
                    <td className="col-name" style={{ fontWeight: '700' }}>
                      <span style={{ fontWeight: '700' }}>{sub.subjectName}</span>
                      {isMp && (
                        <span style={{
                          display: 'inline-block',
                          marginLeft: '8px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          background: '#fee2e2',
                          color: '#b91c1c',
                          border: '1px solid #fca5a5'
                        }}>
                          WITHHELD / MALPRACTICE
                        </span>
                      )}
                    </td>
                    <td className="col-num">{sub.finalMarks?.internal ?? '-'}</td>
                    <td className="col-num">{sub.finalMarks?.external ?? '-'}</td>
                    <td className="col-num col-total">{sub.finalMarks?.total ?? '-'}</td>
                    <td className="col-grade">
                      {gradeClass || isFailed ? (
                        <span className={`grade-badge ${gradeClass || 'grade-f'}`}>
                          {sub.finalMarks?.grade || sub.finalGrade || '-'}
                        </span>
                      ) : (
                        sub.finalGrade || '-'
                      )}
                    </td>
                    <td className="col-num">{sub.finalMarks?.credits ?? sub.credits ?? '-'}</td>
                    <td className="col-attempts">
                      {hasMultipleEntries ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(sub.subjectCode);
                          }}
                          className="attempts-pill-btn multiple"
                          title="Click to view detailed marks per attempt"
                        >
                          <span className="desktop-text">{attemptsCount} {attemptsCount === 1 ? 'Attempt' : 'Attempts'}</span>
                          <span className="mobile-text">{attemptsCount}</span>
                          <span className="arrow-icon">{isExpanded ? '▲' : '▼'}</span>
                        </button>
                      ) : (
                        <span className="attempts-pill-btn single" style={{ cursor: 'default' }}>
                          <span className="desktop-text">1 Attempt</span>
                          <span className="mobile-text">1</span>
                        </span>
                      )}
                    </td>
                  </tr>

                  {isExpanded && hasMultipleEntries && history.map((att, idx) => {
                    const attGradeClass = getGradeClass(att.grade);
                    const attGradeStr = String(att.grade ?? '').trim().toUpperCase();
                    const isNoMarks = att.totalMarks === '-' || att.totalMarks === null || att.totalMarks === undefined || (att.internalMarks === '-' && att.externalMarks === '-');
                    const isAttMp = att.isMalpractice || isWithheldOrMalpractice(att.remarks) || isWithheldOrMalpractice(att.category);
                    const isAttFailed = attGradeStr === 'F' || attGradeStr === 'AB' || attGradeStr === 'ABSENT' || isNoMarks || !att.grade || att.grade === '-' || isAttMp;
                    
                    let attemptLabel = 'RC/RV';
                    if (att.examType !== 'RC/RV') {
                      realAttemptCounter++;
                      attemptLabel = `Att ${realAttemptCounter}`;
                    }
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
                        <td className={colCodeClass} style={{ paddingLeft: '4px', fontWeight: '600' }}>
                          <span style={{ color: '#94a3b8', marginRight: '2px' }}>↳</span>
                          {attemptLabel}
                        </td>
                        <td className="col-name" style={{ fontWeight: '600' }}>
                          <span style={{ fontSize: '0.78rem' }}>{examTypeTitle}</span>
                          {att.remarks && (
                            <span style={{
                              fontSize: '0.65rem',
                              fontWeight: '600',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: isAttMp ? '#fee2e2' : (att.isNoChange ? '#e2e8f0' : '#dbeafe'),
                              color: isAttMp ? '#b91c1c' : (att.isNoChange ? '#475569' : '#1e40af'),
                              border: isAttMp ? '1px solid #fca5a5' : 'none',
                              marginLeft: '6px'
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
                if (gStr === "F" || gStr === "AB" || gStr === "ABSENT" || gStr === "-" || isWithheldOrMalpractice(gStr)) isRowFailed = true;
              }
              if (!isRowFailed) {
                isRowFailed = row.some(cell => {
                  const cStr = String(cell).trim().toUpperCase();
                  return cStr === "F" || cStr === "AB" || cStr === "ABSENT" || isWithheldOrMalpractice(cStr);
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

                  const isSubjectName = !isHeader && (headers[cellIndex]?.includes("subject") || headers[cellIndex]?.includes("name"));
                  return isHeader ? (
                    <th key={cellIndex}>{cellContent}</th>
                  ) : (
                    <td key={cellIndex} className={isSubjectName ? "col-name" : ""} style={isSubjectName ? { fontWeight: '700' } : {}}>{cellContent}</td>
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

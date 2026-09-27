import React from 'react';

export default function StudentInfoGrid({ details, defaultHtno }) {
  if (!details) return null;
  const name = details.name || '';
  const htno = details.htno || defaultHtno || '';
  const fatherName = details.fatherName || '';

  if (!name && !htno && !fatherName) return null;

  return (
    <div className="student-info-grid">
      {name && (
        <div className="student-info-item">
          <span className="student-info-label">Student Name</span>
          <span className="student-info-value">{name}</span>
        </div>
      )}
      {htno && (
        <div className="student-info-item">
          <span className="student-info-label">Hall Ticket No.</span>
          <span className="student-info-value">{htno}</span>
        </div>
      )}
      {fatherName && (
        <div className="student-info-item">
          <span className="student-info-label">Father's Name</span>
          <span className="student-info-value">{fatherName}</span>
        </div>
      )}
    </div>
  );
}

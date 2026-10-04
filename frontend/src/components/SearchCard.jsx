import React from 'react';

export default function SearchCard({ htno, setHtno, status, onSearch, showSubjectCode, setShowSubjectCode, hasResult }) {
  const handleChange = (e) => {
    const val = e.target.value.toUpperCase();
    setHtno(val);
    if (val.trim().length === 10) {
      onSearch(val);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onSearch(htno);
    }
  };

  return (
    <div className="search-card">
      <div className="search-card-row">
        <label className="label" htmlFor="htno-input">Hall Ticket No:</label>
        <input
          id="htno-input"
          className="input"
          type="text"
          value={htno}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="e.g. 23E31A0586"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={10}
        />
      </div>

      {hasResult && (
        <div className="search-card-options mobile-only" style={{ marginTop: '10px', alignItems: 'center', gap: '8px', paddingLeft: '2px' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={!!showSubjectCode}
              onChange={(e) => setShowSubjectCode && setShowSubjectCode(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer' }}
            />
            Show Subject Code
          </label>
        </div>
      )}

      {status && status.message && (
        <div className={`status ${status.type}`}>
          {status.message}
        </div>
      )}
    </div>
  );
}

import React from 'react';

export default function SearchCard({ htno, setHtno, status, onSearch }) {
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
      {status && status.message && (
        <div className={`status ${status.type}`}>
          {status.message}
        </div>
      )}
    </div>
  );
}

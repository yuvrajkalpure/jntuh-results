import React from 'react';

export default function RecentSearches({ history, onSelect, onClear }) {
  if (!history || history.length === 0) return null;

  return (
    <aside className="sidebar-column">
      <div className="history">
        <div className="history-header">
          <div className="history-title">Recent Searches</div>
          <button className="clear-history" onClick={onClear}>Clear</button>
        </div>
        <div className="history-list">
          {history.map((itemHtno) => (
            <div
              key={itemHtno}
              className="history-item"
              onClick={() => onSelect(itemHtno)}
            >
              <span className="history-htno">{itemHtno}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

import React, { useState, useCallback } from 'react';

export default function LatencyAdjust({ offset, onOffsetChange }) {
  const [open, setOpen] = useState(false);
  const [localOffset, setLocalOffset] = useState(offset || 0);

  const handleChange = useCallback((e) => {
    const v = parseInt(e.target.value, 10);
    setLocalOffset(v);
    if (onOffsetChange) onOffsetChange(v);
  }, [onOffsetChange]);

  return (
    <div style={{ width: '100%' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none', border: 'none', color: '#666', cursor: 'pointer',
          fontSize: 11, fontFamily: 'monospace', padding: '2px 0',
        }}
      >
        {open ? '▼' : '▶'} Latency: {localOffset}ms
      </button>
      {open && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#888', minWidth: 20 }}>-200</span>
          <input
            type="range"
            min="-200"
            max="200"
            step="5"
            value={localOffset}
            onChange={handleChange}
            style={{ flex: 1, accentColor: '#ff9800' }}
          />
          <span style={{ fontSize: 11, color: '#888', minWidth: 20 }}>+200</span>
          <span style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace', minWidth: 40, textAlign: 'right' }}>
            {localOffset > 0 ? '+' : ''}{localOffset}ms
          </span>
        </div>
      )}
    </div>
  );
}

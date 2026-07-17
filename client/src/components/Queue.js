import React, { useState, useCallback } from 'react';

const styles = {
  container: {
    width: '100%',
    maxHeight: 200,
    overflowY: 'auto',
    border: '1px solid #333',
    borderRadius: 8,
    padding: 8,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 6,
    cursor: 'grab',
    fontSize: 13,
    transition: 'background 0.15s',
  },
  addRow: {
    display: 'flex',
    gap: 6,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    padding: '6px 10px',
    fontSize: 13,
    borderRadius: 6,
    border: '1px solid #444',
    background: '#2a2a2a',
    color: '#ddd',
  },
  btn: {
    padding: '6px 12px',
    fontSize: 12,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
  },
};

export default function Queue({ queue, onAdd, onRemove, onPlay, onReorder, isDj }) {
  const [newFile, setNewFile] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [dragIdx, setDragIdx] = useState(null);

  const handleAdd = useCallback(() => {
    if (!newFile.trim()) return;
    onAdd(newFile.trim(), newTitle.trim() || newFile.trim());
    setNewFile('');
    setNewTitle('');
  }, [newFile, newTitle, onAdd]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleAdd();
  }, [handleAdd]);

  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>
        QUEUE {queue.length > 0 && <span style={{ color: '#666', fontWeight: 400 }}>({queue.length})</span>}
      </div>

      {isDj && (
        <div style={styles.addRow}>
          <input
            style={{ ...styles.input, width: 100 }}
            placeholder="file.mp3"
            value={newFile}
            onChange={(e) => setNewFile(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <input
            style={{ ...styles.input, width: 120 }}
            placeholder="Title (optional)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button style={{ ...styles.btn, background: '#4caf50', color: '#fff' }} onClick={handleAdd}>
            Add
          </button>
        </div>
      )}

      <div style={styles.container}>
        {queue.length === 0 && (
          <div style={{ textAlign: 'center', color: '#555', fontSize: 12, padding: 16 }}>
            Queue is empty{isDj ? ' — add a track above' : ''}
          </div>
        )}
        {queue.map((item, idx) => (
          <div
            key={idx}
            style={{
              ...styles.item,
              background: dragIdx === idx ? '#333' : 'transparent',
            }}
            draggable={isDj}
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null && dragIdx !== idx && typeof onReorder === 'function') {
                onReorder(dragIdx, idx);
              }
              setDragIdx(null);
            }}
            onDragEnd={() => setDragIdx(null)}
          >
            <span style={{ color: '#555', fontSize: 11, minWidth: 16 }}>{idx + 1}.</span>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 13 }}>{item.title || item.file}</div>
              {item.artist && <div style={{ fontSize: 11, color: '#888' }}>{item.artist}</div>}
            </div>
            <span style={{ fontSize: 10, color: '#666', marginRight: 4 }}>{item.addedBy}</span>
            {isDj && (
              <>
                <button
                  title="Play now"
                  onClick={() => onPlay && onPlay(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 14, color: '#4caf50' }}
                >
                  ▶
                </button>
                <button
                  title="Remove"
                  onClick={() => onRemove(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 14, color: '#f44336' }}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

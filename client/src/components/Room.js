import React, { useState, useCallback } from 'react';

export default function Room({ onJoin, onCreate, currentRoom, clients, isDj, onTransferDj }) {
  const [code, setCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  const handleJoin = useCallback(() => {
    if (code.trim()) onJoin(code.trim().toUpperCase());
  }, [code, onJoin]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleJoin();
  }, [handleJoin]);

  if (currentRoom) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '8px 12px', background: '#1a1a2e', borderRadius: 8, width: '100%',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#7c4dff', fontFamily: 'monospace' }}>
          Room: {currentRoom}
        </span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 4,
          background: isDj ? '#4caf50' : '#ff9800',
          color: '#fff', fontWeight: 600,
        }}>
          {isDj ? 'DJ' : 'Guest'}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4, fontSize: 12, color: '#888', flexWrap: 'wrap' }}>
          {clients.map((c) => (
            <span key={c.id} style={{
              padding: '2px 6px', borderRadius: 4, background: '#222',
              cursor: isDj && c.role !== 'dj' ? 'pointer' : 'default',
            }} title={isDj && c.role !== 'dj' ? 'Transfer DJ role' : ''}
              onClick={() => isDj && c.role !== 'dj' && onTransferDj && onTransferDj(c.id)}
            >
              {c.name} {c.role === 'dj' && '🎧'}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
      <button
        onClick={onCreate}
        style={{
          padding: '8px 16px', fontSize: 13, border: 'none', borderRadius: 6,
          cursor: 'pointer', background: '#7c4dff', color: '#fff', fontWeight: 600,
        }}
      >
        Create Room
      </button>
      <button
        onClick={() => setShowJoin(!showJoin)}
        style={{
          padding: '8px 16px', fontSize: 13, border: '1px solid #7c4dff', borderRadius: 6,
          cursor: 'pointer', background: 'transparent', color: '#7c4dff', fontWeight: 600,
        }}
      >
        Join Room
      </button>
      {showJoin && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Room code"
            style={{
              padding: '6px 10px', fontSize: 13, borderRadius: 6,
              border: '1px solid #444', background: '#2a2a2a', color: '#ddd',
              width: 120, fontFamily: 'monospace', textTransform: 'uppercase',
            }}
          />
          <button
            onClick={handleJoin}
            style={{
              padding: '6px 12px', fontSize: 13, border: 'none', borderRadius: 6,
              cursor: 'pointer', background: '#7c4dff', color: '#fff', fontWeight: 600,
            }}
          >
            Go
          </button>
        </div>
      )}
    </div>
  );
}

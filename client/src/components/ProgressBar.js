import React, { useRef, useCallback, useEffect, useState } from 'react';

export default function ProgressBar({ audioEngine, duration, onSeek, isPlaying }) {
  const [position, setPosition] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hoverSec, setHoverSec] = useState(null);
  const barRef = useRef(null);
  const frameRef = useRef(null);

  // Update position during playback
  useEffect(() => {
    if (!isPlaying || dragging) {
      if (!isPlaying) frameRef.current && cancelAnimationFrame(frameRef.current);
      return;
    }
    const tick = () => {
      if (audioEngine) setPosition(audioEngine.getPlaybackPosition());
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [isPlaying, audioEngine, dragging]);

  const getSecFromEvent = useCallback((e) => {
    if (!barRef.current || !duration) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(duration, x * duration));
  }, [duration]);

  const handleMouseDown = useCallback((e) => {
    setDragging(true);
    const sec = getSecFromEvent(e);
    setPosition(sec);
  }, [getSecFromEvent]);

  const handleMouseMove = useCallback((e) => {
    const sec = getSecFromEvent(e);
    setHoverSec(sec);
    if (dragging) setPosition(sec);
  }, [getSecFromEvent, dragging]);

  const seekedRef = useRef(false);

  const handleMouseUp = useCallback(() => {
    if (dragging && !seekedRef.current) {
      seekedRef.current = true;
      setDragging(false);
      if (onSeek) onSeek(position);
    }
  }, [dragging, onSeek, position]);

  const handleMouseLeave = useCallback(() => {
    setHoverSec(null);
    if (dragging && !seekedRef.current) {
      seekedRef.current = true;
      setDragging(false);
      if (onSeek) onSeek(position);
    }
  }, [dragging, onSeek, position]);

  // Global mouse up to catch releases outside the element
  useEffect(() => {
    if (!dragging) return;
    seekedRef.current = false;
    const up = () => handleMouseUp();
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [dragging, handleMouseUp]);

  const pct = duration > 0 ? (position / duration) * 100 : 0;
  const hoverPct = duration > 0 && hoverSec !== null ? (hoverSec / duration) * 100 : null;

  const fmt = (s) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', minWidth: 35, textAlign: 'right' }}>
        {fmt(position)}
      </span>
      <div
        ref={barRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{
          flex: 1,
          height: dragging ? 8 : 6,
          background: '#333',
          borderRadius: 4,
          cursor: 'pointer',
          position: 'relative',
          transition: 'height 0.15s',
        }}
      >
        {/* Filled portion */}
        <div style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          height: '100%',
          background: dragging ? '#4caf50' : '#66bb6a',
          borderRadius: 4,
          transition: dragging ? 'none' : 'width 0.3s linear, background 0.2s',
        }} />
        {/* Hover indicator */}
        {hoverPct !== null && (
          <div style={{
            position: 'absolute',
            top: -24,
            left: `calc(${hoverPct}% - 20px)`,
            background: '#333',
            color: '#fff',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 11,
            fontFamily: 'monospace',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            {fmt(hoverSec)}
          </div>
        )}
        {/* Thumb */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: `calc(${pct}% - 6px)`,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: dragging ? '#4caf50' : '#81c784',
          transform: 'translateY(-50%)',
          opacity: dragging ? 1 : 0,
          transition: 'opacity 0.2s',
          pointerEvents: 'none',
        }} />
      </div>
      <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', minWidth: 35 }}>
        {fmt(duration)}
      </span>
    </div>
  );
}

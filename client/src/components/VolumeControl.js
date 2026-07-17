import React, { useState, useCallback } from 'react';

export default function VolumeControl({ audioEngine }) {
  const [volume, setVolume] = useState(audioEngine ? audioEngine.getVolume() : 1);
  const [showSlider, setShowSlider] = useState(false);

  const handleChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioEngine) audioEngine.setVolume(v);
  }, [audioEngine]);

  const icon = volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={() => setShowSlider(!showSlider)}
        title="Volume"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          padding: 4,
          lineHeight: 1,
        }}
      >
        {icon}
      </button>
      {showSlider && (
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={handleChange}
          style={{ width: 80, accentColor: '#4caf50' }}
        />
      )}
    </div>
  );
}

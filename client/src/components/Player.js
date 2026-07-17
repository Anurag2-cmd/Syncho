import React, { useState, useRef, useCallback, useEffect } from 'react';
import { loadFullAudio } from '../audio/chunk-loader';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: 32,
    background: '#1e1e1e',
    borderRadius: 12,
    minWidth: 320,
  },
  status: {
    fontSize: 14,
    color: '#aaa',
    fontFamily: 'monospace',
  },
  button: {
    padding: '12px 32px',
    fontSize: 16,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'background 0.2s',
  },
  buttonPlay: {
    background: '#4caf50',
    color: '#fff',
  },
  buttonPause: {
    background: '#f44336',
    color: '#fff',
  },
  buttonReady: {
    background: '#2196f3',
    color: '#fff',
  },
  buttonDisabled: {
    background: '#555',
    color: '#999',
    cursor: 'not-allowed',
  },
  input: {
    padding: '8px 12px',
    fontSize: 14,
    borderRadius: 6,
    border: '1px solid #444',
    background: '#2a2a2a',
    color: '#ddd',
    width: '100%',
    maxWidth: 300,
  },
  label: {
    fontSize: 13,
    color: '#aaa',
    alignSelf: 'flex-start',
  },
};

export default function Player({ ws, audioEngine, ntpOffset }) {
  const [status, setStatus] = useState('idle');
  const [playing, setPlaying] = useState(false);
  const [audioFile, setAudioFile] = useState('test.mp3');
  const [audioReady, setAudioReady] = useState(false);
  const loadedFile = useRef(null);

  useEffect(() => {
    if (!ws) return;

    const handler = async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'resume') {
        setPlaying(true);
        setStatus('loading');
        try {
          if (loadedFile.current !== audioFile) {
            const arrayBuffer = await loadFullAudio(audioFile);
            await audioEngine.decode(arrayBuffer);
            loadedFile.current = audioFile;
          }
          const localTime = msg.resumeAt - ntpOffset;
          audioEngine.schedulePlayback(localTime, msg.position);
          setStatus('playing');
        } catch (err) {
          console.error('Playback failed:', err);
          setStatus('error');
          setPlaying(false);
        }
      }

      if (msg.type === 'pause') {
        audioEngine.stop();
        setPlaying(false);
        setStatus('paused');
      }

      if (msg.type === 'seek') {
        loadedFile.current = null;
      }
    };

    ws.addEventListener('message', handler);
    return () => ws.removeEventListener('message', handler);
  }, [ws, audioEngine, ntpOffset, audioFile]);

  const handleActivateAudio = useCallback(async () => {
    await audioEngine.init();
    setAudioReady(true);
    setStatus('ready');
  }, [audioEngine]);

  const handlePlay = useCallback(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'play' }));
  }, [ws]);

  const handlePause = useCallback(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'pause' }));
  }, [ws]);

  let btnLabel = 'Play';
  let btnStyle = { ...styles.button, ...styles.buttonPlay };
  let onClick = handlePlay;
  let disabled = !ws || ws.readyState !== WebSocket.OPEN;

  if (!audioReady) {
    btnLabel = 'Activate Audio';
    btnStyle = { ...styles.button, ...styles.buttonReady };
    onClick = handleActivateAudio;
    disabled = false;
  } else if (playing) {
    btnLabel = 'Pause';
    btnStyle = { ...styles.button, ...styles.buttonPause };
    onClick = handlePause;
  }

  return (
    <div style={styles.container}>
      <div style={styles.label}>Audio file</div>
      <input
        style={styles.input}
        value={audioFile}
        onChange={(e) => setAudioFile(e.target.value)}
        placeholder="e.g. test.mp3"
      />
      <button style={btnStyle} onClick={onClick} disabled={disabled}>
        {btnLabel}
      </button>
      <div style={styles.status}>Status: {status}</div>
    </div>
  );
}

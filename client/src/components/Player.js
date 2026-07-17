import React, { useState, useRef, useCallback, useEffect } from 'react';
import { loadFullAudio, loadAudioMetadata } from '../audio/chunk-loader';
import ProgressBar from './ProgressBar';
import VolumeControl from './VolumeControl';
import Queue from './Queue';
import MetadataDisplay from './MetadataDisplay';
import LatencyAdjust from './LatencyAdjust';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: 24,
    background: '#1e1e1e',
    borderRadius: 12,
    minWidth: 360,
    maxWidth: 420,
    width: '100%',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  button: {
    width: 44,
    height: 44,
    fontSize: 18,
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
};

export default function Player({ ws, audioEngine, ntpOffset, latencyOffset: initialLatency, roomCode, clients, isDj, queue,
  onSeek, onQueueAdd, onQueueRemove, onQueuePlay, }) {
  const [status, setStatus] = useState('idle');
  const [playing, setPlaying] = useState(false);
  const [audioFile, setAudioFile] = useState('test.mp3');
  const [audioReady, setAudioReady] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [localLatency, setLocalLatency] = useState(initialLatency || 0);
  const loadedFile = useRef(null);
  const preloadingRef = useRef(false);

  // ── Pre-load audio ────────────────────────────────────────────────────
  useEffect(() => {
    if (!audioReady || !audioEngine.ctx) return;
    if (preloadingRef.current) return;
    preloadingRef.current = true;

    (async () => {
      try {
        setStatus('loading');
        const arrayBuffer = await loadFullAudio(audioFile);
        await audioEngine.decode(arrayBuffer);
        loadedFile.current = audioFile;
        // Parse metadata
        const meta = await loadAudioMetadata(audioFile);
        if (meta) setMetadata(meta);
        setStatus('ready');
      } catch (err) {
        console.error('Pre-load failed:', err);
        setStatus('idle');
        preloadingRef.current = false;
      }
    })();
  }, [audioReady, audioEngine, audioFile]);

  // ── Load a specific track (from queue play) ────────────────────────────
  const loadTrack = useCallback(async (file) => {
    setAudioFile(file);
    loadedFile.current = null;
    preloadingRef.current = false;
    setStatus('loading');
    try {
      const arrayBuffer = await loadFullAudio(file);
      await audioEngine.decode(arrayBuffer);
      loadedFile.current = file;
      const meta = await loadAudioMetadata(file);
      if (meta) setMetadata(meta);
      setStatus('ready');
    } catch (err) {
      console.error('Load track failed:', err);
      setStatus('error');
    }
  }, [audioEngine]);

  // ── WebSocket message handler ─────────────────────────────────────────
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
            const meta = await loadAudioMetadata(audioFile);
            if (meta) setMetadata(meta);
          }
          const baseTime = msg.resumeAt - ntpOffset;
          const localTime = baseTime + localLatency;
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

      if (msg.type === 'track-loaded') {
        if (msg.file !== audioFile) {
          setAudioFile(msg.file);
          if (msg.metadata) setMetadata(msg.metadata);
          loadedFile.current = null;
          preloadingRef.current = false;
        }
      }

      if (msg.type === 'state' && msg.isPlaying) {
        setStatus('playing');
        setPlaying(true);
        if (msg.currentMetadata) setMetadata(msg.currentMetadata);
      }
    };

    ws.addEventListener('message', handler);
    return () => ws.removeEventListener('message', handler);
  }, [ws, audioEngine, ntpOffset, localLatency, audioFile]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleActivateAudio = useCallback(async () => {
    try {
      await audioEngine.init();
      setAudioReady(true);
    } catch (err) {
      console.error('AudioContext init failed:', err);
      setStatus('error');
    }
  }, [audioEngine]);

  const handlePlay = useCallback(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const position = audioEngine.getPlaybackPosition();
    ws.send(JSON.stringify({ type: 'play', currentFile: audioFile, position }));
  }, [ws, audioFile, audioEngine]);

  const handlePause = useCallback(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const position = audioEngine.getPlaybackPosition();
    ws.send(JSON.stringify({ type: 'pause', position }));
  }, [ws, audioEngine]);

  const onLatencyChange = useCallback((v) => {
    setLocalLatency(v);
  }, []);

  const handleSeek = useCallback((position) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'seek', position }));
  }, [ws]);

  const handleQueueAdd = useCallback((file, title) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'queue-add', file, title }));
    if (onQueueAdd) onQueueAdd(file, title);
  }, [ws, onQueueAdd]);

  const handleQueueRemove = useCallback((index) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'queue-remove', index }));
    if (onQueueRemove) onQueueRemove(index);
  }, [ws, onQueueRemove]);

  const handleQueueReorder = useCallback((from, to) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'queue-reorder', from, to }));
  }, [ws]);

  const handleQueuePlay = useCallback(async (index) => {
    if (!isDj) return;
    const item = queue[index];
    if (!item) return;
    setAudioFile(item.file);
    loadedFile.current = null;
    preloadingRef.current = false;
    // Tell server to load the track for all devices (do this BEFORE local load so broadcast is early)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'load-track', file: item.file, metadata: { title: item.title, artist: item.artist } }));
    }
    // Load the new track on this device (await ensures it's ready before we play)
    await loadTrack(item.file);
    // Now tell server to play — all devices will receive resume and load on demand if needed
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'play', currentFile: item.file, position: 0 }));
    }
  }, [ws, isDj, queue, loadTrack]);

  // ── Button state ──────────────────────────────────────────────────────
  let btnIcon = '▶';
  let onClick = handlePlay;
  let disabled = !ws || ws.readyState !== WebSocket.OPEN;
  let btnBg = '#4caf50';

  if (!audioReady) {
    btnIcon = '🎧';
    onClick = handleActivateAudio;
    disabled = false;
    btnBg = '#2196f3';
  } else if (status === 'loading') {
    btnIcon = '⏳';
    disabled = true;
    btnBg = '#555';
  } else if (playing) {
    btnIcon = '⏸';
    onClick = handlePause;
    btnBg = '#f44336';
  }

  const duration = audioEngine.getDuration();

  return (
    <div style={styles.container}>
      {/* Metadata display */}
      <MetadataDisplay metadata={metadata} audioFile={audioFile} />

      {/* Progress bar */}
      <ProgressBar
        audioEngine={audioEngine}
        duration={duration}
        onSeek={handleSeek}
        isPlaying={playing}
      />

      {/* Controls row */}
      <div style={styles.controls}>
        <VolumeControl audioEngine={audioEngine} />
        <button
          style={{ ...styles.button, background: btnBg, color: '#fff', opacity: disabled ? 0.4 : 1 }}
          onClick={onClick}
          disabled={disabled}
        >
          {btnIcon}
        </button>
        <div style={{ width: 44 }} /> {/* Spacer to balance volume on left */}
      </div>

      {/* Status */}
      <div style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>
        {status === 'playing' ? '● Playing' : status === 'paused' ? '◌ Paused' : status}
        {duration > 0 && `  •  ${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`}
      </div>

      {/* Latency adjust */}
      <LatencyAdjust offset={localLatency} onOffsetChange={onLatencyChange} />

      {/* Queue */}
      <Queue
        queue={queue || []}
        onAdd={handleQueueAdd}
        onRemove={handleQueueRemove}
        onPlay={handleQueuePlay}
        onReorder={handleQueueReorder}
        isDj={isDj}
      />
    </div>
  );
}

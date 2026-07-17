import React, { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';
import { AudioEngine } from './audio/audio-engine';
import { performNTPSync } from './sync/ntp-client';
import Player from './components/Player';
import Room from './components/Room';

const WS_PROTO = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
// In development (localhost:3000), connect directly to the server on port 3001.
// In production (Express serves build), use the same host:port as the page.
const IS_DEV_SERVER = window.location.hostname === 'localhost' && window.location.port === '3000';
const WS_URL = IS_DEV_SERVER
  ? `${WS_PROTO}//localhost:3001`
  : `${WS_PROTO}//${window.location.host}`;
const MAX_RECONNECT_DELAY = 30000;
const NTP_RETRY_COUNT = 3;

export default function App() {
  const [ws, setWs] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [ntpOffset, setNtpOffset] = useState(0);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [latencyOffset, setLatencyOffset] = useState(0);

  // Room state
  const [roomCode, setRoomCode] = useState(null);
  const [isDj, setIsDj] = useState(false);
  const [clients, setClients] = useState([]);
  const [queue, setQueue] = useState([]);

  const audioEngine = useRef(new AudioEngine());
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const roomJoinedRef = useRef(false);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;

    socket.onopen = async () => {
      if (!mountedRef.current) { socket.close(); return; }
      setConnectionStatus('syncing');

      let lastError = null;
      for (let attempt = 0; attempt < NTP_RETRY_COUNT; attempt++) {
        try {
          const result = await performNTPSync(socket, 20);
          if (!mountedRef.current) return;
          setNtpOffset(result.offset);
          setConnectionStatus('connected');
          setReconnectAttempt(0);
          setWs(socket);
          return;
        } catch (err) {
          lastError = err;
          console.warn(`NTP sync attempt ${attempt + 1}/${NTP_RETRY_COUNT} failed:`, err);
        }
      }

      console.error('NTP sync failed after all retries:', lastError);
      if (!mountedRef.current) return;
      setConnectionStatus('error');
      socket.close();
    };

    socket.onclose = () => {
      if (!mountedRef.current) return;
      setConnectionStatus('disconnected');
      setWs(null);
      wsRef.current = null;
      roomJoinedRef.current = false;

      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), MAX_RECONNECT_DELAY);
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setConnectionStatus('connecting');
          setReconnectAttempt(prev => prev + 1);
        }
      }, delay);
    };

    socket.onerror = (err) => console.error('WebSocket error:', err);
  }, [reconnectAttempt]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
      wsRef.current = null;
    };
  }, [connect]);

  // ── WebSocket message handler for room/queue/state messages ──────────
  useEffect(() => {
    if (!ws) return;

    const handler = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'room-joined') {
        setRoomCode(msg.code);
        setIsDj(msg.isDj);
        roomJoinedRef.current = true;
        if (msg.clients) setClients(msg.clients);
        if (msg.queue) setQueue(msg.queue);
      }

      if (msg.type === 'room-update') {
        if (msg.clients) setClients(msg.clients);
      }

      if (msg.type === 'queue-update') {
        if (msg.queue) setQueue(msg.queue);
      }

      if (msg.type === 'role-assigned') {
        setIsDj(msg.role === 'dj');
      }

      if (msg.type === 'left-room') {
        setRoomCode(null);
        setIsDj(false);
        setClients([]);
        setQueue([]);
        roomJoinedRef.current = false;
      }

      if (msg.type === 'error') {
        console.error('Server error:', msg.message);
      }
    };

    ws.addEventListener('message', handler);
    return () => ws.removeEventListener('message', handler);
  }, [ws]);

  // ── Room handlers ──────────────────────────────────────────────────────
  const handleCreateRoom = useCallback(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'create-room' }));
    }
  }, [ws]);

  const handleJoinRoom = useCallback((code) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join-room', code }));
    }
  }, [ws]);

  const handleTransferDj = useCallback((targetClientId) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'transfer-dj', targetClientId }));
    }
  }, [ws]);

  const handleManualReconnect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    setReconnectAttempt(0);
    setConnectionStatus('connecting');
    setNtpOffset(0);
    setRoomCode(null);
    setIsDj(false);
    setClients([]);
    setQueue([]);
    roomJoinedRef.current = false;
  }, []);

  // ── UI status ──────────────────────────────────────────────────────────
  const statusColor = connectionStatus === 'connected' ? '#4caf50'
    : connectionStatus === 'syncing' ? '#ff9800'
    : connectionStatus === 'connecting' ? '#ff9800'
    : connectionStatus === 'error' ? '#ff5722' : '#f44336';

  const statusIcon = connectionStatus === 'connected' ? '●'
    : connectionStatus === 'syncing' ? '⏳'
    : connectionStatus === 'connecting' ? '◌'
    : connectionStatus === 'error' ? '⚠' : '○';

  const statusLabel = connectionStatus === 'connected' ? 'Connected'
    : connectionStatus === 'syncing' ? 'Syncing clocks...'
    : connectionStatus === 'connecting' ? 'Connecting...'
    : connectionStatus === 'error' ? 'Sync failed'
    : 'Disconnected';

  return (
    <div className="app-root">
      <div className="app-header">
        <h1 className="app-title">Syncho</h1>
        <span className="app-subtitle">synchronized audio</span>
      </div>

      {/* Connection status */}
      <div className="status-bar">
        <span style={{ color: statusColor }}>{statusIcon}</span>
        <span>{statusLabel}</span>
        {reconnectAttempt > 0 && connectionStatus !== 'connected' && (
          <span className="reconnect-count">attempt #{reconnectAttempt}</span>
        )}
        {connectionStatus === 'error' && (
          <button className="retry-btn" onClick={handleManualReconnect}>Retry</button>
        )}
      </div>

      {ntpOffset !== 0 && (
        <div className="clock-info">Clock offset: {ntpOffset.toFixed(2)} ms</div>
      )}

      {/* Room */}
      <Room
        onCreate={handleCreateRoom}
        onJoin={handleJoinRoom}
        currentRoom={roomCode}
        clients={clients}
        isDj={isDj}
        onTransferDj={handleTransferDj}
      />

      {/* Player */}
      {roomCode && (
        <Player
          ws={ws}
          audioEngine={audioEngine.current}
          ntpOffset={ntpOffset}
          latencyOffset={latencyOffset}
          roomCode={roomCode}
          clients={clients}
          isDj={isDj}
          queue={queue}
        />
      )}

      {!roomCode && connectionStatus === 'connected' && (
        <div className="empty-state">
          <p>Create or join a room to start listening together</p>
        </div>
      )}
    </div>
  );
}

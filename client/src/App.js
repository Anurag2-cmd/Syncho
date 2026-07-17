import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import { AudioEngine } from './audio/audio-engine';
import { performNTPSync } from './sync/ntp-client';
import Player from './components/Player';

const WS_PROTO = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const BACKEND_PORT = window.location.port === '3000' ? ':3001' : '';
const WS_URL = `${WS_PROTO}//${window.location.hostname}${BACKEND_PORT}`;

export default function App() {
  const [ws, setWs] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [ntpOffset, setNtpOffset] = useState(null);
  const audioEngine = useRef(new AudioEngine());
  const wsRef = useRef(null);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;

    socket.onopen = async () => {
      setConnectionStatus('syncing');
      try {
        const result = await performNTPSync(socket, 20);
        setNtpOffset(result.offset);
        setConnectionStatus('connected');
        setWs(socket);
      } catch (err) {
        console.error('NTP sync failed:', err);
        setConnectionStatus('error');
      }
    };

    socket.onclose = () => {
      setConnectionStatus('disconnected');
      setWs(null);
      wsRef.current = null;
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      wsRef.current = null;
    };
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
    }}>
      <h1 style={{ fontSize: 24, fontWeight: 300, letterSpacing: 1 }}>
        Distributed Music Sync
      </h1>
      <div style={{
        fontSize: 13,
        color: connectionStatus === 'connected' ? '#4caf50'
          : connectionStatus === 'syncing' ? '#ff9800'
          : connectionStatus === 'connecting' ? '#ff9800' : '#f44336',
        fontFamily: 'monospace',
      }}>
        {connectionStatus === 'connected' ? '● Connected'
          : connectionStatus === 'syncing' ? '◌ Syncing clocks...'
          : connectionStatus === 'connecting' ? '◌ Connecting...'
          : '○ Disconnected'}
      </div>
      {ntpOffset !== null && (
        <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
          Clock offset: {ntpOffset.toFixed(2)} ms
        </div>
      )}
      <Player
        ws={ws}
        audioEngine={audioEngine.current}
        ntpOffset={ntpOffset}
      />
    </div>
  );
}

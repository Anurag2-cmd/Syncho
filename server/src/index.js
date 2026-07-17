const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { handleNTP } = require('./ntp');
const { getAudioChunk, getAudioInfo } = require('./audio-chunker');

const app = express();
app.use(cors());

const CLIENT_BUILD = path.join(__dirname, '..', '..', 'client', 'build');
if (fs.existsSync(CLIENT_BUILD)) {
  app.use(express.static(CLIENT_BUILD));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const SYNC_BUFFER_MS = 5000;

// ── Room system ────────────────────────────────────────────────────────────
const rooms = new Map();

function generateRoomCode() {
  let code;
  do {
    code = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
  } while (rooms.has(code));
  return code;
}

function getOrCreateRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      code: roomCode,
      clients: new Map(), // ws -> { id, role, name }
      playbackState: {
        isPlaying: false,
        position: 0,
        startedAt: null,
        currentFile: null,
        currentMetadata: null,
      },
      queue: [], // [{ file, title, artist, addedBy }]
      djId: null,
    });
  }
  return rooms.get(roomCode);
}

function broadcastToRoom(room, payload, excludeWs = null) {
  const data = JSON.stringify(payload);
  for (const [clientWs] of room.clients) {
    if (clientWs === excludeWs) continue;
    if (clientWs.readyState === 1) {
      try { clientWs.send(data); } catch (_) {}
    }
  }
}

function sendTo(ws, payload) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(payload)); } catch (_) {}
  }
}

// ── Audio streaming endpoint ─────────────────────────────────────────────
app.get('/api/audio/:filename', (req, res) => {
  // Security: prevent path traversal — only allow alphanumeric, dots, dashes, underscores
  if (!/^[\w.-]+$/i.test(req.params.filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filepath = path.join(__dirname, '..', 'audio', req.params.filename);
  const start = parseInt(req.query.start, 10) || 0;
  const rawEnd = req.query.end;
  const end = rawEnd !== undefined ? parseInt(rawEnd, 10) : undefined;

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const info = getAudioInfo(filepath);

  const safePipe = (stream) => {
    stream.on('error', (err) => {
      console.error('Stream error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Stream error' });
    });
    stream.pipe(res);
  };

  if (end === undefined) {
    const stream = fs.createReadStream(filepath, { start });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', info.size - start);
    safePipe(stream);
    return;
  }

  const stream = getAudioChunk(filepath, start, end);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', end - start + 1);
  safePipe(stream);
});

app.get('*', (req, res) => {
  const index = path.join(CLIENT_BUILD, 'index.html');
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.status(200).json({ status: 'server running' });
  }
});

// ── WebSocket heartbeat ──────────────────────────────────────────────────
const HEARTBEAT_INTERVAL = 30000;

function heartbeat() { this.isAlive = true; }

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (_) { ws.terminate(); }
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => clearInterval(heartbeatTimer));

// ── WebSocket message handling ───────────────────────────────────────────
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  let currentRoom = null;
  let clientId = crypto.randomUUID().slice(0, 8);
  let clientName = 'User-' + clientId.slice(0, 4);

  ws.on('message', (data) => {
    let message;
    try { message = JSON.parse(data.toString()); } catch { return; }

    // ── NTP ──────────────────────────────────────────────────────────────
    if (message.type === 'ntp-ping') { handleNTP(ws, message); return; }

    // ── Set display name ──────────────────────────────────────────────────
    if (message.type === 'set-name') {
      clientName = message.name || clientName;
      if (currentRoom) {
        const client = currentRoom.clients.get(ws);
        if (client) client.name = clientName;
        broadcastToRoom(currentRoom, { type: 'room-update', clients: getRoomClients(currentRoom) });
      }
      return;
    }

    // ── Create Room ───────────────────────────────────────────────────────
    if (message.type === 'create-room') {
      if (currentRoom) {
        const oldRoom = currentRoom;
        oldRoom.clients.delete(ws);
        // Notify old room of departure
        broadcastToRoom(oldRoom, { type: 'room-update', clients: getRoomClients(oldRoom) });
        // Reassign DJ if leaving
        if (oldRoom.djId === clientId && oldRoom.clients.size > 0) {
          const nextWs = oldRoom.clients.keys().next().value;
          const nextClient = oldRoom.clients.get(nextWs);
          if (nextClient) {
            oldRoom.djId = nextClient.id;
            sendTo(nextWs, { type: 'role-assigned', role: 'dj' });
          }
        }
        // Clean up empty old room
        if (oldRoom.clients.size === 0) rooms.delete(oldRoom.code);
      }

      const code = generateRoomCode();
      const room = getOrCreateRoom(code);
      currentRoom = room;
      room.clients.set(ws, { id: clientId, name: clientName, role: 'dj' });
      room.djId = clientId;

      sendTo(ws, {
        type: 'room-joined',
        code: room.code,
        isDj: true,
        playbackState: room.playbackState,
        queue: room.queue,
        clients: getRoomClients(room),
      });
      broadcastToRoom(room, { type: 'room-update', clients: getRoomClients(room) }, ws);
      return;
    }

    // ── Join Room ─────────────────────────────────────────────────────────
    if (message.type === 'join-room') {
      const code = (message.code || '').toUpperCase();
      if (!rooms.has(code)) {
        sendTo(ws, { type: 'error', message: 'Room not found' });
        return;
      }

      if (currentRoom) {
        const oldRoom = currentRoom;
        oldRoom.clients.delete(ws);
        broadcastToRoom(oldRoom, { type: 'room-update', clients: getRoomClients(oldRoom) });
        if (oldRoom.djId === clientId && oldRoom.clients.size > 0) {
          const nextWs = oldRoom.clients.keys().next().value;
          const nextClient = oldRoom.clients.get(nextWs);
          if (nextClient) {
            oldRoom.djId = nextClient.id;
            sendTo(nextWs, { type: 'role-assigned', role: 'dj' });
          }
        }
        if (oldRoom.clients.size === 0) rooms.delete(oldRoom.code);
      }

      const room = rooms.get(code);
      currentRoom = room;
      const isDj = room.clients.size === 0;
      const role = isDj ? 'dj' : 'guest';
      room.clients.set(ws, { id: clientId, name: clientName, role });
      if (isDj) room.djId = clientId;

      sendTo(ws, {
        type: 'room-joined',
        code: room.code,
        isDj,
        playbackState: room.playbackState,
        queue: room.queue,
        clients: getRoomClients(room),
      });
      broadcastToRoom(room, { type: 'room-update', clients: getRoomClients(room) }, ws);
      return;
    }

    // ── Leave Room ────────────────────────────────────────────────────────
    if (message.type === 'leave-room') {
      if (currentRoom) {
        const room = currentRoom;
        room.clients.delete(ws);
        if (room.djId === clientId && room.clients.size > 0) {
          const nextWs = room.clients.keys().next().value;
          const nextClient = room.clients.get(nextWs);
          if (nextClient) {
            room.djId = nextClient.id;
            nextClient.role = 'dj';
            sendTo(nextWs, { type: 'role-assigned', role: 'dj' });
          }
        }
        broadcastToRoom(room, { type: 'room-update', clients: getRoomClients(room) }, ws);
        if (room.clients.size === 0) rooms.delete(room.code);
        currentRoom = null;
      }
      sendTo(ws, { type: 'left-room' });
      return;
    }

    // ── Guard: all remaining commands require a room ──────────────────────
    if (!currentRoom) return;
    const { playbackState, queue } = currentRoom;
    const isDj = currentRoom.djId === clientId;

    // ── Play (DJ only) ────────────────────────────────────────────────────
    if (message.type === 'play') {
      if (!isDj) { sendTo(ws, { type: 'error', message: 'Only the DJ can play/pause' }); return; }
      const position = message.position !== undefined ? message.position : playbackState.position;
      playbackState.isPlaying = true;
      playbackState.position = position;
      playbackState.startedAt = Date.now();
      if (message.currentFile) playbackState.currentFile = message.currentFile;

      broadcastToRoom(currentRoom, {
        type: 'resume',
        position,
        resumeAt: Date.now() + SYNC_BUFFER_MS,
      });
      return;
    }

    // ── Pause (DJ only) ───────────────────────────────────────────────────
    if (message.type === 'pause') {
      if (!isDj) { sendTo(ws, { type: 'error', message: 'Only the DJ can play/pause' }); return; }
      if (message.position !== undefined) playbackState.position = message.position;
      else if (playbackState.startedAt) playbackState.position += (Date.now() - playbackState.startedAt) / 1000;
      playbackState.isPlaying = false;
      playbackState.startedAt = null;
      broadcastToRoom(currentRoom, { type: 'pause' });
      return;
    }

    // ── Seek (DJ only) ────────────────────────────────────────────────────
    if (message.type === 'seek') {
      if (!isDj) { sendTo(ws, { type: 'error', message: 'Only the DJ can seek' }); return; }
      playbackState.position = message.position || 0;
      playbackState.startedAt = null;
      broadcastToRoom(currentRoom, { type: 'seek', position: playbackState.position });
      return;
    }

    // ── Load Track (DJ only) ──────────────────────────────────────────────
    if (message.type === 'load-track') {
      if (!isDj) { sendTo(ws, { type: 'error', message: 'Only the DJ can load tracks' }); return; }
      const file = message.file || 'test.mp3';
      playbackState.currentFile = file;
      playbackState.currentMetadata = message.metadata || null;
      playbackState.position = 0;
      playbackState.isPlaying = false;
      playbackState.startedAt = null;
      broadcastToRoom(currentRoom, {
        type: 'track-loaded',
        file,
        metadata: playbackState.currentMetadata,
      });
      return;
    }

    // ── Queue: Add Track (anyone can add) ─────────────────────────────────
    if (message.type === 'queue-add') {
      queue.push({
        file: message.file,
        title: message.title || message.file,
        artist: message.artist || '',
        addedBy: clientName,
      });
      broadcastToRoom(currentRoom, { type: 'queue-update', queue: [...queue] });
      return;
    }

    // ── Queue: Remove Track (DJ only) ─────────────────────────────────────
    if (message.type === 'queue-remove') {
      if (!isDj) { sendTo(ws, { type: 'error', message: 'Only the DJ can remove tracks' }); return; }
      const idx = message.index;
      if (idx >= 0 && idx < queue.length) {
        queue.splice(idx, 1);
        broadcastToRoom(currentRoom, { type: 'queue-update', queue: [...queue] });
      }
      return;
    }

    // ── Queue: Reorder (DJ only) ──────────────────────────────────────────
    if (message.type === 'queue-reorder') {
      if (!isDj) { sendTo(ws, { type: 'error', message: 'Only the DJ can reorder tracks' }); return; }
      const { from, to } = message;
      if (from >= 0 && from < queue.length && to >= 0 && to < queue.length) {
        const [item] = queue.splice(from, 1);
        queue.splice(to, 0, item);
        broadcastToRoom(currentRoom, { type: 'queue-update', queue: [...queue] });
      }
      return;
    }

    // ── Transfer DJ role ──────────────────────────────────────────────────
    if (message.type === 'transfer-dj') {
      if (!isDj) return;
      const targetId = message.targetClientId;
      for (const [cws, c] of currentRoom.clients) {
        if (c.id === targetId) {
          c.role = 'dj';
          currentRoom.djId = targetId;
          sendTo(cws, { type: 'role-assigned', role: 'dj' });
          sendTo(ws, { type: 'role-assigned', role: 'guest' });
          // Update client's role
          const self = currentRoom.clients.get(ws);
          if (self) self.role = 'guest';
          broadcastToRoom(currentRoom, { type: 'room-update', clients: getRoomClients(currentRoom) });
          break;
        }
      }
      return;
    }

    // ── Request state ─────────────────────────────────────────────────────
    if (message.type === 'state-request') {
      sendTo(ws, {
        type: 'state',
        isPlaying: playbackState.isPlaying,
        position: playbackState.position,
        currentFile: playbackState.currentFile,
        currentMetadata: playbackState.currentMetadata,
      });
      return;
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      currentRoom.clients.delete(ws);
      if (currentRoom.djId === clientId && currentRoom.clients.size > 0) {
        const nextWs = currentRoom.clients.keys().next().value;
        const nextClient = currentRoom.clients.get(nextWs);
        if (nextClient) {
          currentRoom.djId = nextClient.id;
          nextClient.role = 'dj';
          sendTo(nextWs, { type: 'role-assigned', role: 'dj' });
        }
      }
      broadcastToRoom(currentRoom, { type: 'room-update', clients: getRoomClients(currentRoom) });
      if (currentRoom.clients.size === 0) rooms.delete(currentRoom.code);
      currentRoom = null;
    }
  });
});

function getRoomClients(room) {
  return Array.from(room.clients.values()).map(c => ({ id: c.id, name: c.name, role: c.role }));
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Syncho server running on port ${PORT}`);
});

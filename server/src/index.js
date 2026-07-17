const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
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

app.get('/api/audio/:filename', (req, res) => {
  const filepath = path.join(__dirname, '..', 'audio', req.params.filename);
  const start = parseInt(req.query.start, 10) || 0;
  const rawEnd = req.query.end;
  const end = rawEnd !== undefined ? parseInt(rawEnd, 10) : undefined;

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const info = getAudioInfo(filepath);
  if (end === undefined) {
    const stream = fs.createReadStream(filepath, { start });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', info.size - start);
    stream.pipe(res);
    return;
  }

  const stream = getAudioChunk(filepath, start, end);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', end - start + 1);
  stream.pipe(res);
});

app.get('*', (req, res) => {
  const index = path.join(CLIENT_BUILD, 'index.html');
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.status(200).json({ status: 'server running' });
  }
});

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (message.type === 'ntp-ping') {
      handleNTP(ws, message);
      return;
    }

    if (message.type === 'play' || message.type === 'resume') {
      const payload = {
        type: 'resume',
        position: message.position || 0,
        resumeAt: Date.now() + 2000,
      };
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify(payload));
        }
      });
      return;
    }

    if (message.type === 'pause') {
      const payload = { type: 'pause' };
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify(payload));
        }
      });
      return;
    }

    if (message.type === 'seek') {
      const payload = { type: 'seek', position: message.position };
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify(payload));
        }
      });
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

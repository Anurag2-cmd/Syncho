function handleNTP(ws, message) {
  const t2 = Date.now();
  const response = {
    type: 'ntp-pong',
    t1: message.t1,
    t2,
    t3: Date.now()
  };
  ws.send(JSON.stringify(response));
}

module.exports = { handleNTP };

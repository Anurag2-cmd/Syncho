function handleNTP(ws, message) {
  // Validate that t1 is a number before responding
  if (typeof message.t1 !== 'number' || isNaN(message.t1)) {
    return;
  }

  const t2 = Date.now();
  const t3 = Date.now();
  const response = {
    type: 'ntp-pong',
    t1: message.t1,
    t2,
    t3,
  };

  try {
    ws.send(JSON.stringify(response));
  } catch (err) {
    console.error('NTP send error:', err.message);
  }
}

module.exports = { handleNTP };

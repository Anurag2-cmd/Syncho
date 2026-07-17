export function performNTPSync(ws, burstCount = 20, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const offsets = [];
    const rtts = [];
    let received = 0;

    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      if (received > 0) {
        const avgOff = offsets.reduce((a, b) => a + b, 0) / offsets.length;
        const avgRtt = rtts.reduce((a, b) => a + b, 0) / rtts.length;
        return resolve({ offset: avgOff, roundTripTime: avgRtt });
      }
      reject(new Error('NTP sync timeout: no pongs received'));
    }, timeoutMs);

    const handler = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type !== 'ntp-pong') return;

      const t4 = Date.now();
      const offset = (msg.t2 - msg.t1 + msg.t3 - t4) / 2;
      const rtt = t4 - msg.t1;

      offsets.push(offset);
      rtts.push(rtt);
      received++;

      if (received >= burstCount) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        offsets.sort((a, b) => a - b);
        const median = offsets.length % 2 === 0
          ? (offsets[offsets.length / 2 - 1] + offsets[offsets.length / 2]) / 2
          : offsets[Math.floor(offsets.length / 2)];
        const avgRtt = rtts.reduce((a, b) => a + b, 0) / rtts.length;
        resolve({ offset: median, roundTripTime: avgRtt });
      }
    };

    ws.addEventListener('message', handler);

    for (let i = 0; i < burstCount; i++) {
      ws.send(JSON.stringify({ type: 'ntp-ping', t1: Date.now() }));
    }
  });
}

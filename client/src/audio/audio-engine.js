export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sources = new Set();
    this.buffer = null;
  }

  async init() {
    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  async decode(arrayBuffer) {
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
  }

  schedulePlayback(localTargetTime, positionSeconds = 0) {
    if (!this.buffer || !this.ctx) return;

    this.stop();

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;

    const now = this.ctx.currentTime;
    const delay = (localTargetTime - Date.now()) / 1000;
    const when = now + Math.max(delay, 0);

    source.connect(this.ctx.destination);
    source.start(when, positionSeconds);

    this.sources.add(source);
    source.onended = () => this.sources.delete(source);

    return { when, positionSeconds };
  }

  stop() {
    for (const s of this.sources) {
      try { s.stop(); } catch (_) {}
    }
    this.sources.clear();
  }

  getCurrentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}

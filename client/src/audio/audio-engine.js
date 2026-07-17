export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sources = new Set();
    this.buffer = null;
    this.gainNode = null;
    this._startPosition = 0;
    this._startTime = 0;
    this._volume = 1;
    this._duration = 0;
  }

  async init() {
    this.ctx = new AudioContext();
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this._volume;
    this.gainNode.connect(this.ctx.destination);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  async decode(arrayBuffer) {
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
    this._duration = this.buffer.duration;
  }

  schedulePlayback(localTargetTime, positionSeconds = 0) {
    if (!this.buffer || !this.ctx) return null;
    this.stop();

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;

    const now = this.ctx.currentTime;
    const delay = (localTargetTime - Date.now()) / 1000;
    const when = now + Math.max(delay, 0);

    this._startPosition = positionSeconds;
    this._startTime = when;

    source.connect(this.gainNode || this.ctx.destination);
    source.start(when, positionSeconds);

    this.sources.add(source);
    source.onended = () => this.sources.delete(source);

    return { when, positionSeconds };
  }

  getPlaybackPosition() {
    if (!this.ctx || this.sources.size === 0) return this._startPosition;
    const elapsed = this.ctx.currentTime - this._startTime;
    return this._startPosition + Math.max(0, elapsed);
  }

  getDuration() {
    return this._duration;
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.gainNode) this.gainNode.gain.value = this._volume;
  }

  getVolume() {
    return this._volume;
  }

  stop() {
    this._startPosition = this.getPlaybackPosition();
    this._startTime = this.ctx ? this.ctx.currentTime : 0;
    for (const s of this.sources) {
      try { s.stop(); } catch (_) {}
    }
    this.sources.clear();
  }

  getCurrentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}

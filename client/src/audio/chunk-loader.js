import { parseID3Tags } from './id3-parser';

// In development (localhost:3000), connect directly to the server on port 3001.
// In production (Express serves build), use the same host:port as the page.
const IS_DEV_SERVER = window.location.hostname === 'localhost' && window.location.port === '3000';
const AUDIO_API = IS_DEV_SERVER
  ? `http://localhost:3001/api/audio`
  : `${window.location.protocol}//${window.location.host}/api/audio`;

export async function loadFullAudio(audioFile) {
  const res = await fetch(`${AUDIO_API}/${audioFile}`);
  if (!res.ok) throw new Error(`Failed to load audio: ${res.statusText}`);
  return res.arrayBuffer();
}

/**
 * Load just the first 64KB of an audio file to parse ID3 metadata (title, artist, album art).
 */
export async function loadAudioMetadata(audioFile) {
  try {
    const res = await fetch(`${AUDIO_API}/${audioFile}`, {
      headers: { Range: 'bytes=0-65535' },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return parseID3Tags(buf);
  } catch {
    return null;
  }
}

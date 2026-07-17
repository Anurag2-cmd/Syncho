const BACKEND_PORT = window.location.port === '3000' ? ':3001' : '';
const AUDIO_API = `${window.location.protocol}//${window.location.hostname}${BACKEND_PORT}/api/audio`;

export async function loadFullAudio(audioFile) {
  const res = await fetch(`${AUDIO_API}/${audioFile}`);
  if (!res.ok) throw new Error(`Failed to load audio: ${res.statusText}`);
  return res.arrayBuffer();
}

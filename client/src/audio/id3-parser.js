/**
 * Minimal ID3v2 tag parser.
 * Extracts title (TIT2), artist (TPE1), and album art (APIC) from the start of an MP3 file.
 */

export function parseID3Tags(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const result = { title: '', artist: '', albumArt: null };

  // ID3v2 header is at the start of the file: "ID3" + version + flags + size (syncsafe)
  const id3 = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  if (id3 !== 'ID3') return result; // No ID3v2 tags

  const majorVer = bytes[3];
  const minorVer = bytes[4];
  const flags = bytes[5];
  // Size is stored as a "syncsafe integer" (4 bytes, MSB of each byte is 0)
  const size = readSyncsafeInt(bytes, 6);

  // Parse frames starting at offset 10
  let offset = 10;
  const end = Math.min(offset + size, bytes.length);

  while (offset + 10 <= end) {
    const frameId = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
    // Frame IDs start with a capital letter; skip padding (null bytes)
    if (frameId[0] === '\0' || frameId[0] === '\u0000') break;

    let frameSize;
    if (majorVer >= 4) {
      frameSize = readSyncsafeInt(bytes, offset + 4);
    } else {
      frameSize = ((bytes[offset+4] << 24) | (bytes[offset+5] << 16) | (bytes[offset+6] << 8) | bytes[offset+7]);
    }
    // Skip frame header flags (2 bytes in v3+)
    const frameHeaderSize = majorVer >= 3 ? 10 : 6;
    const dataOffset = offset + frameHeaderSize;
    const dataEnd = dataOffset + frameSize;

    if (dataEnd > end) break;

    if (frameId === 'TIT2') {
      result.title = readTextFrame(bytes, dataOffset, dataEnd);
    } else if (frameId === 'TPE1') {
      result.artist = readTextFrame(bytes, dataOffset, dataEnd);
    } else if (frameId === 'APIC') {
      result.albumArt = readAPICFrame(bytes, dataOffset, dataEnd);
    }

    offset = dataEnd;
  }

  return result;
}

function readSyncsafeInt(bytes, offset) {
  return ((bytes[offset] & 0x7f) << 21) |
         ((bytes[offset+1] & 0x7f) << 14) |
         ((bytes[offset+2] & 0x7f) << 7) |
         (bytes[offset+3] & 0x7f);
}

function readTextFrame(bytes, start, end) {
  if (end - start < 1) return '';
  const encoding = bytes[start]; // 0 = ISO-8859-1, 1 = UTF-16, 2 = UTF-16BE, 3 = UTF-8
  const textBytes = bytes.slice(start + 1, end);

  if (encoding === 0 || encoding === 3) {
    // ISO-8859-1 or UTF-8
    return new TextDecoder(encoding === 0 ? 'latin1' : 'utf-8').decode(textBytes).replace(/\0/g, '').trim();
  } else {
    // UTF-16 (with or without BOM)
    return new TextDecoder('utf-16le').decode(textBytes).replace(/\0/g, '').trim();
  }
}

function readAPICFrame(bytes, start, end) {
  if (end - start < 5) return null;
  let pos = start;
  const encoding = bytes[pos++];

  // MIME type (null-terminated)
  let mime = '';
  while (pos < end && bytes[pos] !== 0) mime += String.fromCharCode(bytes[pos++]);
  pos++; // skip null terminator

  // Picture type byte
  const picType = bytes[pos++];

  // Description (null-terminated, encoding-dependent)
  if (encoding === 0 || encoding === 3) {
    while (pos < end && bytes[pos] !== 0) pos++;
    pos++; // skip null
  } else {
    while (pos < end && (bytes[pos] !== 0 || bytes[pos+1] !== 0)) pos += 2;
    pos += 2; // skip null terminator (2 bytes for UTF-16)
  }

  // Rest is image data
  if (pos >= end) return null;
  const imageData = bytes.slice(pos);

  // Create object URL
  const blob = new Blob([imageData], { type: mime || 'image/jpeg' });
  return URL.createObjectURL(blob);
}

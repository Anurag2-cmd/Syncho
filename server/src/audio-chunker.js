const fs = require('fs');
const path = require('path');

function getAudioChunk(filepath, startByte, endByte) {
  return fs.createReadStream(filepath, { start: startByte, end: endByte });
}

function getAudioInfo(filepath) {
  const stats = fs.statSync(filepath);
  return {
    size: stats.size,
    name: path.basename(filepath)
  };
}

module.exports = { getAudioChunk, getAudioInfo };

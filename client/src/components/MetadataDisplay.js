import React from 'react';

export default function MetadataDisplay({ metadata, audioFile }) {
  if (!metadata) {
    return (
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#ccc' }}>{audioFile || 'No track loaded'}</div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Unknown artist</div>
      </div>
    );
  }

  const { title, artist, albumArt } = metadata;
  const hasArt = !!albumArt;
  const displayTitle = title || audioFile || 'Unknown';
  const displayArtist = artist || 'Unknown artist';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      padding: '8px 0',
    }}>
      {hasArt && (
        <img
          src={albumArt}
          alt="Album art"
          style={{
            width: 48,
            height: 48,
            borderRadius: 6,
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      )}
      {!hasArt && (
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 6,
          background: '#2a2a2a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          color: '#555',
          flexShrink: 0,
        }}>
          ♪
        </div>
      )}
      <div style={{ overflow: 'hidden' }}>
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: '#e0e0e0',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {displayTitle}
        </div>
        <div style={{
          fontSize: 12,
          color: '#888',
          marginTop: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {displayArtist}
        </div>
      </div>
    </div>
  );
}

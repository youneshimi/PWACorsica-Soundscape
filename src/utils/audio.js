export function getAudioFileName(blob) {
  const type = blob.type.split(';')[0].toLowerCase();
  const extensions = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/aac': 'aac' };
  return 'recording.' + (extensions[type] || 'bin');
}

export function getAudioSource(sound) {
  if (sound.audioBlob) {
    const url = URL.createObjectURL(sound.audioBlob);
    return { url, release: () => URL.revokeObjectURL(url) };
  }
  if (sound.audioUrl && !sound.audioUrl.startsWith('blob:')) {
    return { url: sound.audioUrl, release: () => {} };
  }
  return null;
}

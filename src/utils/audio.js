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

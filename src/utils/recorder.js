const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

export function microphoneError(error) {
  if (error.name === 'NotAllowedError') return 'Accès au microphone refusé. Autorisez-le dans les paramètres du navigateur pour enregistrer.';
  if (error.name === 'NotFoundError') return 'Aucun microphone détecté sur cet appareil.';
  if (error.name === 'NotReadableError') return 'Le microphone est occupé ou indisponible. Fermez les autres applications et réessayez.';
  return error.message || 'Enregistrement impossible. Réessayez.';
}

export function createAudioRecorder({ onState, onAudio, onDuration, onError }) {
  let state = 'idle';
  let disposed = false;
  let stream;
  let recorder;
  let timer;
  let previewUrl;

  function setState(value) {
    state = value;
    if (!disposed) onState(value);
  }

  function releaseMicrophone() {
    clearInterval(timer);
    timer = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
    if (!disposed) onAudio(null);
  }

  function abort() {
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      recorder.onerror = null;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // Les pistes sont libérées même si le recorder refuse de s'arrêter.
      }
      recorder = undefined;
    }
    releaseMicrophone();
  }

  function fail(error) {
    abort();
    setState('idle');
    if (!disposed) onError(microphoneError(error));
  }

  async function start() {
    if (disposed || state !== 'idle') return;
    onError(null);
    discard();
    onDuration(0);
    setState('requesting');

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Ce navigateur ne permet pas l’enregistrement audio. Utilisez un navigateur compatible sur HTTPS ou localhost.');
      }
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      // La permission peut arriver après la fermeture du formulaire.
      if (disposed) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      const mimeType = AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder = instance;
      const chunks = [];
      instance.ondataavailable = ({ data }) => {
        if (data.size) chunks.push(data);
      };
      instance.onerror = (event) => fail(event.error || new Error('Enregistrement interrompu. Réessayez.'));
      instance.onstop = () => {
        releaseMicrophone();
        recorder = undefined;
        setState('idle');
        if (disposed) return;
        const type = instance.mimeType || chunks.find((chunk) => chunk.type)?.type || '';
        const blob = new Blob(chunks, { type });
        if (!blob.size) {
          onError('Aucun son enregistré. Réessayez.');
        } else if (blob.size > 10 * 1024 * 1024) {
          onError('Le son dépasse 10 Mo. Faites un enregistrement plus court.');
        } else if (!type.startsWith('audio/')) {
          onError('Le navigateur n’a pas produit un format audio utilisable. Essayez un autre navigateur.');
        } else {
          previewUrl = URL.createObjectURL(blob);
          onAudio({ blob, url: previewUrl });
        }
      };
      instance.start();
      setState('recording');
      const startedAt = Date.now();
      timer = setInterval(() => {
        if (!disposed && state === 'recording') onDuration(Math.floor((Date.now() - startedAt) / 1000));
      }, 1000);
    } catch (error) {
      fail(error);
    }
  }

  function stop() {
    if (state !== 'recording') return;
    setState('stopping');
    try {
      recorder.stop();
      releaseMicrophone();
    } catch (error) {
      fail(error);
    }
  }

  function destroy() {
    disposed = true;
    abort();
    discard();
  }

  return { start, stop, discard, destroy };
}

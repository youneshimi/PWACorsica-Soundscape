import { useEffect, useState } from 'react';

export default function Comments({ sound, profile, onNotify }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setComments([]);
    setError('');
    if (sound?.synced) fetch(`/api/sounds/${sound.id}/comments`)
      .then((response) => { if (!response.ok) throw new Error('Commentaires indisponibles.'); return response.json(); })
      .then((rows) => { if (active) setComments(rows); })
      .catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [sound?.id, sound?.synced]);
  if (!sound) return null;
  async function submit(event) {
    event.preventDefault();
    try {
      const response = await fetch(`/api/sounds/${sound.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: profile.id, text }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Publication impossible.');
      const comment = await response.json();
      setComments((previous) => [...previous, comment]);
      setText(''); setError('');
      onNotify?.('Commentaire publié');
    } catch (failure) { setError(failure.message); onNotify?.(failure.message, 'error'); }
  }
  return <section className="comments"><h3>Commentaires</h3>
    {comments.length ? comments.map((comment) => <div className="comment-row" key={comment.id}><span className="comment-avatar" style={{ background: `hsl(${[...String(comment.nickname || 'A')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360} 45% 45%)` }}>{(comment.nickname || 'A')[0].toUpperCase()}</span><p><strong>{comment.nickname || 'Anonyme'}</strong><br />{comment.text}</p></div>) : <p>Aucun commentaire pour le moment.</p>}
    {error && <p role="alert">{error}</p>}
    {sound.synced && profile && <form onSubmit={submit}><input aria-label="Votre commentaire" maxLength={500} required value={text} onChange={(event) => setText(event.target.value)} /><button type="submit">Publier</button></form>}
  </section>;
}

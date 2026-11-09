import { useEffect, useState } from 'react';

export default function Trails({ sounds, profile, onSelectSound, onSelectTrail }) {
  const [trails, setTrails] = useState([]);
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/trails').then((response) => { if (!response.ok) throw new Error('Parcours indisponibles.'); return response.json(); })
      .then(setTrails).catch((failure) => setError(failure.message));
    return () => onSelectTrail(null);
  }, [onSelectTrail]);
  async function openTrail(id) {
    try {
      const response = await fetch(`/api/trails/${id}`);
      if (!response.ok) throw new Error('Parcours indisponible.');
      const trail = await response.json();
      setDetail(trail); onSelectTrail(trail); setError('');
    } catch (failure) { setError(failure.message); }
  }
  async function create(event) {
    event.preventDefault();
    try {
      const response = await fetch('/api/trails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: profile.id, title, description, sounds: selected.map((item) => ({ soundId: item.id, note: item.note })) }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Création impossible.');
      const { id } = await response.json();
      setCreating(false); setTitle(''); setDescription(''); setSelected([]);
      const list = await fetch('/api/trails');
      if (list.ok) setTrails(await list.json());
      await openTrail(id);
    } catch (failure) { setError(failure.message); }
  }
  function toggle(sound) {
    setSelected((previous) => previous.some((item) => item.id === sound.id) ? previous.filter((item) => item.id !== sound.id) : [...previous, { id: sound.id, note: '' }]);
  }
  return <section className="trails">
    <div className="trails-heading"><h3>Parcours sonores</h3><button onClick={() => { setCreating(!creating); setDetail(null); onSelectTrail(null); }}>Créer</button></div>
    {error && <p role="alert">{error}</p>}
    {creating ? <form onSubmit={create}><input aria-label="Titre du parcours" placeholder="Titre" maxLength={80} required value={title} onChange={(event) => setTitle(event.target.value)} />
      <textarea aria-label="Description du parcours" placeholder="Description" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
      <p>Sélectionnez les sons dans l’ordre de la balade :</p>
      {sounds.filter((sound) => sound.synced).map((sound) => <label key={sound.id} className="trail-choice"><input type="checkbox" checked={selected.some((item) => item.id === sound.id)} onChange={() => toggle(sound)} />{sound.title}</label>)}
      {selected.map((item, index) => <label key={item.id}>{index + 1}. {sounds.find((sound) => sound.id === item.id)?.title}<input placeholder="Note facultative" maxLength={300} value={item.note} onChange={(event) => setSelected((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, note: event.target.value } : entry))} /></label>)}
      <button type="submit" disabled={!selected.length}>Publier le parcours</button></form> : detail ? <><button onClick={() => { setDetail(null); onSelectTrail(null); }}>← Tous les parcours</button><h3>{detail.title}</h3><p>{detail.description}</p><p>Par {detail.nickname}</p>
      {detail.steps.map((step) => <button className="trail-step" key={step.position} onClick={() => onSelectSound(step.sound)}><strong>{step.position}. {step.sound.title}</strong>{step.note && <span>{step.note}</span>}</button>)}</> : <>{trails.length ? trails.map((trail) => <button className="trail-step" key={trail.id} onClick={() => openTrail(trail.id)}><strong>{trail.title}</strong><span>{trail.soundsCount} étape(s) · Par {trail.nickname}</span></button>) : <p>Aucun parcours pour le moment.</p>}</>}
  </section>;
}

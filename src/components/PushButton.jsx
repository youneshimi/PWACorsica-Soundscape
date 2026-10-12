import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { disablePush, enablePush, pushActive, testPush } from '../utils/push.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import './PushButton.css';

export default function PushButton() {
  const [settings, setSettings] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const isOnline = useOnlineStatus();
  const pending = useRef(false);
  const supported = !import.meta.env.DEV && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  useEffect(() => {
    if (!supported) return;
    let stopped = false;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/push/config', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
        if (!response.ok) return;
        const config = await response.json();
        if (!config.enabled) return;
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (stopped) return;
        setSettings({ registration, publicKey: config.publicKey });
        setSubscription(existing);
        setActive(Boolean(existing && pushActive()));
      } catch {
        // Ne pas demander de permission au chargement de la page.
      }
    }
    load();
    return () => { stopped = true; controller.abort(); };
  }, [supported, isOnline]);

  async function toggle() {
    if (pending.current || !settings || !isOnline) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (active && subscription) {
        await disablePush(subscription);
        setSubscription(null);
        setActive(false);
        setMessage('Notifications désactivées.');
      } else {
        const created = await enablePush(settings.registration, settings.publicKey, subscription);
        setSubscription(created);
        setActive(true);
        setMessage('Vous recevrez une notification quand un nouveau son sera partagé.');
      }
    } catch (error) {
      setMessage(Notification.permission === 'denied'
        ? 'Notifications refusées. Vous pouvez les autoriser dans les réglages du navigateur.'
        : error.message || 'Les notifications n’ont pas pu être activées.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function testNotification() {
    if (pending.current || !subscription || !isOnline) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      await testPush(subscription);
      setMessage('Le service a accepté l’envoi. Vérifiez les notifications de cet appareil.');
    } catch (error) {
      setMessage(error.message || 'La notification de test n’a pas pu être envoyée.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (!supported || !settings) return null;
  const Icon = active ? BellOff : Bell;
  return (
    <div className="push-settings">
      <button className="push-button" onClick={toggle} disabled={busy || !isOnline} aria-pressed={active}>
        <Icon size={16} aria-hidden="true" />
        {busy ? 'Veuillez patienter…' : active ? 'Désactiver les notifications' : 'Recevoir les nouveaux sons'}
      </button>
      {active && <button className="push-button" onClick={testNotification} disabled={busy || !isOnline}>
        <Send size={16} aria-hidden="true" />
        Tester une notification
      </button>}
      {message && <p className="push-message" role="status">{message}</p>}
    </div>
  );
}

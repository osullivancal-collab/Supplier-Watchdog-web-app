import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { sendMagicLink } from '../lib/backend.js';
import { normalizeEmail } from '../lib/email.js';

/** Email-link sign in: no password to forget on a building site. */
export default function SignIn({ onLookAround }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (e) => {
    e.preventDefault();
    const clean = normalizeEmail(email);
    if (!clean) return setError('That email doesn’t look right.');
    setBusy(true); setError('');
    try { await sendMagicLink(clean); setSent(clean); }
    catch (err) {
      console.error('[signin] link not sent', err);
      setError(/rate|seconds/i.test(err?.message || '') ? 'Hang on a minute before asking for another link.' : 'Couldn’t send the link. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="app">
      <main className="scroll">
        <div className="page" style={{ paddingTop: 48, gap: 22 }}>
          <div className="brand">
            <span className="brand-mark"><Icon name="eye" size={20} stroke={2.2} /></span>
            <span style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 800 }}>Watchdog</span>
          </div>
          <div>
            <h1 className="title" style={{ fontSize: 36, lineHeight: 1.05 }}>Treat your suppliers like a portfolio.</h1>
            <p className="muted" style={{ fontSize: 17, marginTop: 10 }}>Every bill before it hits, who's taking your money, and when to bargain. 14 days free, no card.</p>
          </div>

          {sent ? (
            <div className="card" role="status">
              <div className="h2">Check your email</div>
              <p className="muted" style={{ marginTop: 8, fontSize: 16 }}>We sent a sign-in link to <b style={{ color: 'var(--text)' }}>{sent}</b>. Open it on this phone.</p>
              <button className="link" style={{ marginTop: 12 }} onClick={() => setSent('')}>Use a different email</button>
            </div>
          ) : (
            <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="field">
                <span className="label">Email</span>
                <input className="input" type="email" inputMode="email" autoComplete="email" placeholder="you@business.com.au"
                  value={email} onChange={(e) => { setError(''); setEmail(e.target.value); }} />
              </label>
              {error && <div className="error" role="alert">{error}</div>}
              <button className="btn btn-primary btn-block" disabled={busy} type="submit">{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
            </form>
          )}

          <button className="btn btn-secondary btn-block" onClick={onLookAround}>Just look around (sample data)</button>
          <p className="muted" style={{ fontSize: 13 }}>Looking around keeps everything on this phone. Sign in to keep your bills safe and on every device.</p>
        </div>
      </main>
    </div>
  );
}

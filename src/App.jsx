import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { TEAM, PROJECT_NAME } from './config.js';

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
const fmt = (m) => { m = Math.round(m); return `${Math.floor(m / 60)}h ${pad(m % 60)}m`; };
const dkey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDay = (k) => new Date(`${k}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const hms = (s) => { s = Math.max(0, Math.floor(s)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const member = (id) => TEAM.find((m) => m.id === id);
const idFromEmail = (email) => TEAM.find((m) => m.email.toLowerCase() === (email || '').toLowerCase())?.id || null;

function friendlyError(e) {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Wrong password.';
  if (c.includes('too-many-requests')) return 'Too many tries. Wait a few minutes and try again.';
  if (c.includes('network')) return 'No internet connection. Check your connection and try again.';
  if (c.includes('permission-denied')) return 'Not allowed. Try logging out and in again.';
  return e?.message || 'Something went wrong.';
}

function useRoute() {
  const get = () => window.location.hash.replace(/^#\/?/, '').toLowerCase();
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => setRoute(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return now;
}

function useToast() {
  const [msg, setMsg] = useState('');
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 2600); return () => clearTimeout(t); }, [msg]);
  return [msg, setMsg];
}

function useData() {
  const [entries, setEntries] = useState(null);
  const [timers, setTimers] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'entries'), (s) => {
      setEntries(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => member(e.person)));
    }, (e) => setError(friendlyError(e)));
    const u2 = onSnapshot(collection(db, 'timers'), (s) => {
      const t = {}; s.docs.forEach((d) => { t[d.id] = d.data(); }); setTimers(t);
    }, (e) => setError(friendlyError(e)));
    return () => { u1(); u2(); };
  }, []);
  return { entries, timers, error };
}

/* ---------- app ---------- */
export default function App() {
  const route = useRoute();
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => { document.title = `${PROJECT_NAME} · Hours`; }, []);

  if (route === 'report') return <Dashboard mode="report" />;

  const preset = member(route);
  if (!preset) return <Home />;
  if (user === undefined) return <div className="center">Loading…</div>;

  const me = user ? idFromEmail(user.email) : null;
  if (!user || me !== preset.id) return <Login person={preset} otherSignedIn={user && me !== preset.id ? member(me)?.name : null} />;
  return <Dashboard mode="team" me={me} />;
}

function Home() {
  return (
    <div className="wrap">
      <div className="login panel" style={{ marginTop: '10vh' }}>
        <span className="eyebrow">Team time log</span>
        <h1>{PROJECT_NAME}</h1>
        <div className="links">
          <a href="#/report">Open the time report (teachers and clients)</a>
          {TEAM.map((m) => <a key={m.id} href={`#/${m.id}`}>Log in as {m.name}</a>)}
        </div>
      </div>
    </div>
  );
}

function Login({ person, otherSignedIn }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (otherSignedIn) await signOut(auth);
      await signInWithEmailAndPassword(auth, person.email, pw);
    } catch (e2) { setErr(friendlyError(e2)); }
    setBusy(false);
  }

  return (
    <div className="wrap">
      <form className="login panel" onSubmit={submit}>
        <span className="eyebrow">{PROJECT_NAME}</span>
        <div className="who-fixed">{person.name}</div>
        {otherSignedIn && <p className="note">{otherSignedIn} is signed in on this device. Logging in will sign them out.</p>}
        <label>Password
          <input id="pw" type="password" autoComplete="current-password" required autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <div className="err">{err}</div>
        <button className="btn-main" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </div>
  );
}

/* ---------- dashboard ---------- */
function Dashboard({ mode, me }) {
  const team = mode === 'team';
  const { entries, timers, error } = useData();
  const now = useNow();
  const [toast, setToast] = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [who, setWho] = useState('all');

  const inRange = (e) => { const k = dkey(e.start); return (!from || k >= from) && (!to || k <= to); };
  const list = entries || [];
  const total = list.reduce((a, e) => a + e.minutes, 0);
  const totals = useMemo(() => {
    const t = {}; TEAM.forEach((m) => { t[m.id] = { min: 0, n: 0 }; });
    list.filter(inRange).forEach((e) => { t[e.person].min += e.minutes; t[e.person].n += 1; });
    return t;
  }, [entries, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const rangeLabel = from || to ? `${from ? fmtDay(from) : 'the start'} to ${to ? fmtDay(to) : 'today'}` : 'all time';

  return (
    <div className="wrap">
      <header>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="eyebrow">{team ? 'Team time log' : 'Time report'}</span>
          <h1>{PROJECT_NAME}</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div className="total"><b>{fmt(total)}</b><span>in total · {list.length} {list.length === 1 ? 'entry' : 'entries'}</span></div>
          {team
            ? <div className="row"><span className="note">Signed in as <b>{member(me).name}</b></span><button className="btn-ghost" onClick={() => signOut(auth)}>Log out</button></div>
            : <span className="badge">Read-only view</span>}
        </div>
      </header>

      {error && <div className="panel err">{error}</div>}

      {team
        ? <Clock me={me} timers={timers} now={now} setToast={setToast} />
        : <section className="panel"><h2>Working right now</h2><LiveList timers={timers} now={now} /></section>}

      <div className="grid2">
        <section className="panel">
          <h2>Who did how much</h2>
          <Bars totals={totals} />
          {(from || to) && <span className="note">Showing {rangeLabel}</span>}
        </section>
        <section className="panel">
          <h2>Last 14 days</h2>
          <Chart entries={list} />
          <div className="legend">{TEAM.map((m) => <span key={m.id} className="name" style={{ fontWeight: 400 }}><span className="dot" style={{ background: m.color }} />{m.name}</span>)}</div>
        </section>
      </div>

      {team && <AddForm me={me} setToast={setToast} />}

      <section className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>When we worked</h2>
          <div className="row">
            <label className="note">From <input id="rFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="note">To <input id="rTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <button className="btn-ghost" type="button" onClick={() => { setFrom(''); setTo(''); }}>All time</button>
          </div>
        </div>
        <div className="filters">
          {[{ id: 'all', name: 'Everyone' }, ...TEAM].map((m) => (
            <button key={m.id} type="button" className="pill" aria-pressed={who === m.id} onClick={() => setWho(m.id)}>{m.name}</button>
          ))}
        </div>
        {entries === null
          ? <div className="center">Loading…</div>
          : <Log entries={list.filter((e) => inRange(e) && (who === 'all' || e.person === who))} me={team ? me : null} filtered={who !== 'all' || !!from || !!to} team={team} setToast={setToast} />}
      </section>

      <Summary totals={totals} rangeLabel={rangeLabel} setToast={setToast} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function LiveList({ timers, now }) {
  const ids = Object.keys(timers).filter(member);
  if (!ids.length) return <div className="live-list"><span className="note">Nobody is working right now.</span></div>;
  return (
    <div className="live-list">
      {ids.map((id) => (
        <span key={id} className="chip"><i /><b>{member(id).name}</b>{timers[id].task ? ` ${timers[id].task} ·` : ''} <code>{hms((now - timers[id].start) / 1000)}</code></span>
      ))}
    </div>
  );
}

function Clock({ me, timers, now, setToast }) {
  const t = timers[me];
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (t && !task) setTask(t.task || ''); }, [t?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  async function punch() {
    setBusy(true);
    try {
      if (!t) {
        await setDoc(doc(db, 'timers', me), { start: Date.now(), task: task.trim().slice(0, 200) });
        setToast('Clocked in. The timer keeps running if you close this page.');
      } else {
        const end = Date.now();
        const minutes = Math.round((end - t.start) / 60000);
        const batch = writeBatch(db);
        batch.delete(doc(db, 'timers', me));
        if (minutes >= 1) {
          batch.set(doc(collection(db, 'entries')), {
            person: me, start: t.start, end, minutes: Math.min(minutes, 960),
            task: (task.trim() || t.task || '').slice(0, 200), created: end,
          });
        }
        await batch.commit();
        setTask('');
        setToast(minutes >= 1 ? `Logged ${fmt(minutes)}` : 'Under a minute, so nothing was logged.');
      }
    } catch (e) { setToast(friendlyError(e)); }
    setBusy(false);
  }

  return (
    <section className="panel">
      <div className="clock">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <input id="cTask" type="text" maxLength={200} placeholder="What are you working on?" value={task} onChange={(e) => setTask(e.target.value)} />
          <div className="dial">{hms(t ? (now - t.start) / 1000 : 0)}</div>
        </div>
        <button className={`punch btn-main ${t ? 'stop' : ''}`} onClick={punch} disabled={busy}>{t ? 'Stop' : 'Start'}</button>
      </div>
      <LiveList timers={timers} now={now} />
    </section>
  );
}

function Bars({ totals }) {
  const sum = TEAM.reduce((a, m) => a + totals[m.id].min, 0);
  const max = Math.max(1, ...TEAM.map((m) => totals[m.id].min));
  return (
    <div className="bars">
      {[...TEAM].sort((a, b) => totals[b.id].min - totals[a.id].min).map((m) => (
        <div key={m.id} className="bar-row">
          <span className="name"><span className="dot" style={{ background: m.color }} />{m.name}</span>
          <div className="track"><div className="fill" style={{ width: `${(totals[m.id].min / max) * 100}%`, background: m.color }} /></div>
          <span className="val">{fmt(totals[m.id].min)} <small>{sum ? Math.round((totals[m.id].min / sum) * 100) : 0}%</small></span>
        </div>
      ))}
    </div>
  );
}

function Chart({ entries }) {
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); days.push(dkey(d.getTime())); }
  const per = days.map((k) => { const o = {}; entries.forEach((e) => { if (dkey(e.start) === k) o[e.person] = (o[e.person] || 0) + e.minutes; }); return o; });
  let maxH = Math.max(1, Math.ceil(Math.max(...per.map((o) => Object.values(o).reduce((a, b) => a + b, 0))) / 60));
  const step = maxH <= 4 ? 1 : maxH <= 8 ? 2 : maxH <= 20 ? 5 : 10;
  maxH = Math.ceil(maxH / step) * step;
  const W = 440, H = 200, L = 30, B = 24, T = 8, cw = (W - L - 4) / 14, ph = H - B - T;
  const grid = [];
  for (let h = 0; h <= maxH; h += step) grid.push(h);

  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hours per day, last 14 days">
        {grid.map((h) => { const y = T + ph - (h / maxH) * ph; return (
          <g key={h}>
            <line x1={L} x2={W} y1={y} y2={y} stroke="var(--line)" />
            <text x={L - 6} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--f-mono)">{h}h</text>
          </g>); })}
        {per.map((o, i) => {
          let y = T + ph; const x = L + i * cw + cw * 0.18, w = cw * 0.64;
          const d = new Date(`${days[i]}T12:00`);
          return (
            <g key={days[i]}>
              {TEAM.map((m) => { const v = o[m.id]; if (!v) return null; const hh = (v / 60 / maxH) * ph; y -= hh;
                return <rect key={m.id} x={x} y={y} width={w} height={hh} fill={m.color}><title>{`${m.name}: ${fmt(v)}`}</title></rect>; })}
              {i % 2 === 1 && <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={i === 13 ? 'var(--ink)' : 'var(--muted)'} fontFamily="var(--f-mono)">{i === 13 ? 'today' : `${d.getDate()}/${d.getMonth() + 1}`}</text>}
            </g>);
        })}
      </svg>
    </div>
  );
}

function AddForm({ me, setToast }) {
  const [date, setDate] = useState(dkey(Date.now()));
  const [fromT, setFromT] = useState('14:00');
  const [toT, setToT] = useState('15:00');
  const [task, setTask] = useState('');

  async function submit(e) {
    e.preventDefault();
    const s = new Date(`${date}T${fromT}`).getTime();
    const en = new Date(`${date}T${toT}`).getTime();
    const minutes = Math.round((en - s) / 60000);
    if (!(minutes >= 1)) { setToast('The end time must be after the start time.'); return; }
    if (minutes > 960) { setToast('One entry can be at most 16 hours.'); return; }
    try {
      await setDoc(doc(collection(db, 'entries')), { person: me, start: s, end: en, minutes, task: task.trim().slice(0, 200), created: Date.now() });
      setTask(''); setToast(`Added ${fmt(minutes)}`);
    } catch (e2) { setToast(friendlyError(e2)); }
  }

  return (
    <section className="panel">
      <h2 style={{ marginBottom: 12 }}>Add time you already worked</h2>
      <form className="add-form" onSubmit={submit}>
        <label>Date<input id="fDate" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>From<input id="fFrom" type="time" required value={fromT} onChange={(e) => setFromT(e.target.value)} /></label>
        <label>To<input id="fTo" type="time" required value={toT} onChange={(e) => setToT(e.target.value)} /></label>
        <label className="wide">What did you do?<input id="fTask" type="text" maxLength={200} placeholder="e.g. Wrote the introduction" value={task} onChange={(e) => setTask(e.target.value)} /></label>
        <button className="btn-main" type="submit">Add</button>
      </form>
    </section>
  );
}

function Log({ entries, me, filtered, team, setToast }) {
  const [confirm, setConfirm] = useState(null);
  useEffect(() => { if (!confirm) return; const t = setTimeout(() => setConfirm(null), 3500); return () => clearTimeout(t); }, [confirm]);

  if (!entries.length) {
    return (
      <div className="empty" style={{ marginTop: 12 }}>
        <b>No time logged{filtered ? ' for this filter' : ' yet'}</b>
        {team ? 'Press Start when you begin working, or add time you already spent.' : 'Entries appear here as the team logs their work.'}
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => b.start - a.start);
  const dayTot = {};
  sorted.forEach((e) => { const k = dkey(e.start); dayTot[k] = (dayTot[k] || 0) + e.minutes; });

  async function remove(id) {
    if (confirm !== id) { setConfirm(id); return; }
    setConfirm(null);
    try { await deleteDoc(doc(db, 'entries', id)); setToast('Entry deleted'); } catch (e) { setToast(friendlyError(e)); }
  }

  let cur = '';
  return (
    <div className="log">
      {sorted.map((e) => {
        const k = dkey(e.start); const m = member(e.person);
        const header = k !== cur ? <div className="day"><span>{fmtDay(k)}</span><span>{fmt(dayTot[k])}</span></div> : null;
        cur = k;
        return (
          <React.Fragment key={e.id}>
            {header}
            <div className="entry">
              <span className="name"><span className="dot" style={{ background: m.color }} />{m.name}</span>
              <span className="range">{hm(e.start)}–{hm(e.end)}</span>
              <span className="task">{e.task || '—'}</span>
              <span className="dur">{fmt(e.minutes)}</span>
              {me === e.person
                ? <button type="button" className={`btn-ghost ${confirm === e.id ? 'danger' : ''}`} onClick={() => remove(e.id)} aria-label="Delete entry">{confirm === e.id ? 'Delete?' : '✕'}</button>
                : <span />}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Summary({ totals, rangeLabel, setToast }) {
  const sum = TEAM.reduce((a, m) => a + totals[m.id].min, 0);
  const text = `${PROJECT_NAME}: time per team member (${rangeLabel})\n\n`
    + [...TEAM].sort((a, b) => totals[b.id].min - totals[a.id].min)
      .map((m) => `${m.name}: ${fmt(totals[m.id].min)} (${sum ? Math.round((totals[m.id].min / sum) * 100) : 0}%, ${totals[m.id].n} sessions)`).join('\n')
    + `\n\nTotal: ${fmt(sum)}`;

  function copy() {
    navigator.clipboard?.writeText(text).then(() => setToast('Summary copied'), () => setToast('Couldn’t copy. Select the text and copy it yourself.'));
  }
  return (
    <section className="panel">
      <h2 style={{ marginBottom: 10 }}>Summary</h2>
      <div className="summary">{text}</div>
      <div className="row" style={{ marginTop: 10 }}><button className="btn-main" type="button" onClick={copy}>Copy summary</button></div>
    </section>
  );
}

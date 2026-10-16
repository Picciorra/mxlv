'use strict';

// Fonte dati: il Google Sheet "Mercoledì 2026" pubblicato sul web.
// Tutti i calcoli li fa il foglio: qui si leggono e si mostrano.
const SHEET = 'https://docs.google.com/spreadsheets/d/e/RIMOSSO/pub?single=true&output=csv&gid=';
const GID = {
  leaderboard: '1279013194',
  storicoLeaderboard: '2088317534',
  registro: '970381673'
};
const CACHE_KEY = 'mxlv-data-v2';
const START_HOUR = 20; // le attività iniziano dalle 20:00
const END_HOUR = 1;    // e finiscono entro l'1:00 del giovedì

const $content = document.getElementById('content');
const $refresh = document.getElementById('refresh');
const $tabs = [...document.querySelectorAll('.tabbar a')];

// ---------- CSV ----------

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; }
      } else { cell += c; }
    } else if (c === '"') { quoted = true; }
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') { cell += c; }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Toglie spazi e il selettore di variante delle emoji, cosi' "✈️" e "✈" coincidono.
const norm = (s) => (s || '').replace(/️/g, '').trim();

async function fetchTab(gid) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(SHEET + gid + '&t=' + Date.now(), { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return parseCSV(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Lettura dei tab ----------

// Tab "Leaderboard": riga d'intestazione con PLAYER, ATTENDANCE RATE, ✅ ❌ ✈️ 🟠.
// L'ordine delle righe e' gia' quello giusto (spareggi compresi).
function readLeaderboard(rows) {
  const h = rows.findIndex((r) => r.some((c) => norm(c) === 'PLAYER'));
  if (h < 0) throw new Error('Intestazione PLAYER non trovata nel tab Leaderboard');
  const head = rows[h].map(norm);
  const col = {
    name: head.indexOf('PLAYER'),
    ar: head.findIndex((c) => c.toUpperCase().startsWith('ATTENDANCE'))
  };
  const players = [];
  for (const r of rows.slice(h + 1)) {
    const name = norm(r[col.name]);
    if (!name) continue;
    players.push({ name, pos: players.length + 1, ar: norm(r[col.ar]) });
  }
  return players;
}

// Tab "Storico Leaderboard": una riga per mercoledì, una colonna per persona con "1°", "2°"...
// Servono le ultime due righe compilate per calcolare le frecce.
function readHistory(rows) {
  const head = rows[0].map(norm);
  const filled = rows.slice(1).filter((r) => /^\d{1,2}\/\d{1,2}/.test(norm(r[0])) && head.some((n, i) => i > 0 && /^\d+\s*°?$/.test(norm(r[i]))));
  const toMap = (r) => {
    const m = {};
    head.forEach((n, i) => { if (i > 0 && n) { const p = parseInt(r[i], 10); if (!isNaN(p)) m[n] = p; } });
    return { date: norm(r[0]), pos: m };
  };
  return {
    last: filled.length ? toMap(filled[filled.length - 1]) : null,
    prev: filled.length > 1 ? toMap(filled[filled.length - 2]) : null
  };
}

// Tab "Registro": una riga per mercoledì (Data, Attività, Chiamata, una colonna per persona, Mister X),
// e in fondo le righe di riepilogo, tra cui "Streak Attuale".
const NOT_PLAYERS = new Set(['', 'Data', 'Attività', 'Chiamata', 'Senza Malese', 'Mister X', 'AI']);
const PRESENT = new Set(['✅', '🟠']);

function readRegistro(rows) {
  const head = rows[0].map(norm);
  const col = { date: head.indexOf('Data'), activity: head.indexOf('Attività'), caller: head.indexOf('Chiamata') };
  const players = head.map((n, i) => ({ n, i })).filter(({ n }) => !NOT_PLAYERS.has(n));

  const nights = [];
  for (const r of rows.slice(1)) {
    const m = norm(r[col.date]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) continue;
    const rawCaller = norm(r[col.caller]);
    const marks = players.map(({ i }) => norm(r[i])).filter(Boolean);
    nights.push({
      y: +m[3], mo: +m[2], d: +m[1],
      activity: norm(r[col.activity]),
      caller: cleanName(rawCaller),
      dinner: rawCaller.includes('🍴'),
      present: marks.filter((v) => PRESENT.has(v)).length,
      recorded: marks.length > 0,
      cancelled: marks.length > 0 && marks.every((v) => v === '🚫')
    });
  }

  const streakRow = rows.find((row) => row.some((c) => norm(c) === 'Streak Attuale'));
  const streaks = {};
  if (streakRow) players.forEach(({ n, i }) => { if (/^\d+$/.test(norm(streakRow[i]))) streaks[n] = parseInt(streakRow[i], 10); });

  return { nights, streaks, playerCount: players.length };
}

// "🍴 Davide Molinaro ⬆️" -> "Davide Molinaro"
function cleanName(s) {
  return s.replace(/[^\p{L}\p{M}\s'.-]/gu, '').replace(/\s+/g, ' ').trim();
}

async function loadData() {
  const [lb, hist, reg] = await Promise.all([
    fetchTab(GID.leaderboard),
    fetchTab(GID.storicoLeaderboard),
    fetchTab(GID.registro)
  ]);
  const players = readLeaderboard(lb);
  const history = readHistory(hist);
  const registro = readRegistro(reg);
  for (const p of players) {
    const before = history.prev && history.prev.pos[p.name];
    p.delta = before ? before - p.pos : null;
    p.streak = registro.streaks[p.name] ?? null;
  }
  return {
    players,
    lastDate: history.last && history.last.date,
    prevDate: history.prev && history.prev.date,
    nights: registro.nights,
    playerCount: registro.playerCount,
    fetchedAt: Date.now()
  };
}

// ---------- Utilità ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const firstName = (n) => n.split(' ')[0];
const slug = (n) => firstName(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const initials = (n) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const pad = (n) => String(n).padStart(2, '0');

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MON3 = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];

// Orari della serata, nell'ora locale del telefono.
const startOf = (n) => new Date(n.y, n.mo - 1, n.d, START_HOUR, 0, 0);
const endOf = (n) => new Date(n.y, n.mo - 1, n.d + 1, END_HOUR, 0, 0);

function avatar(name) {
  // Se la foto manca si vedono le iniziali.
  return `<img src="img/foto/${slug(name)}.jpg" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;initials&quot;>${esc(initials(name))}</span>'">`;
}

// "Gags @Bollicine" -> { title: "Gags", place: "Bollicine" }
function splitActivity(s) {
  const at = s.indexOf('@');
  if (at < 0) return { title: s, place: '' };
  const title = s.slice(0, at).replace(/[\s-]+$/, '').trim();
  const place = s.slice(at + 1).trim();
  return title ? { title, place } : { title: place, place: '' };
}

// ---------- Vista: Prossimo mercoledì ----------

let countdownTimer = null;

function renderMercoledi(data) {
  const now = new Date();
  const nights = data.nights;
  const idx = nights.findIndex((n) => now < endOf(n));

  if (idx < 0) {
    $content.innerHTML = `
      <div class="title-block"><h1>Prossimo mercoledì</h1></div>
      <div class="note">La stagione 2026 è finita. Ci vediamo alla prossima!</div>`;
    return;
  }

  const next = nights[idx];
  const start = startOf(next);
  const live = now >= start;
  const { title, place } = splitActivity(next.activity);
  const upcoming = nights.slice(idx + 1, idx + 3);
  const last = [...nights.slice(0, idx)].reverse().find((n) => n.activity || n.recorded);

  const activityBlock = next.activity
    ? `<div class="activity">
        <span class="label">Attività</span>
        <span class="act-title">${esc(title)}</span>
        ${place ? `<span class="act-place">${pinIcon}${esc(place)}</span>` : ''}
      </div>`
    : '';

  const timeBlock = live
    ? `<div class="countdown">
        <div class="live"><span class="live-dot"></span>Si gioca stasera</div>
        ${next.activity ? '' : '<span class="muted small">Attività in arrivo dal chiamante.</span>'}
      </div>`
    : `<div class="countdown">
        <span class="label">Mancano</span>
        <div class="cd-digits" id="cd" aria-live="off"></div>
        <span class="muted small">${next.activity ? 'Alle 20:00 di mercoledì.' : "Alle 20:00 di mercoledì. L'attività arriva entro le 19:00."}</span>
      </div>`;

  $content.innerHTML = `
    <div class="title-block"><h1>Prossimo mercoledì</h1><p class="muted">Mercoledì ${idx + 1} di ${nights.length}</p></div>

    <section class="card hero">
      <div class="hero-top">
        <span class="hero-date">${next.d} ${MONTHS[next.mo - 1].toUpperCase()}</span>
        ${next.dinner ? `<span class="chip dinner">${forkIcon}Cena Stirata</span>` : ''}
      </div>
      ${activityBlock}
      ${timeBlock}
      <div class="divider"></div>
      ${next.caller ? `<div class="caller">
        ${avatar(next.caller)}
        <div class="who"><span class="label">Chiama</span><span class="caller-name">${esc(next.caller)}</span></div>
      </div>` : ''}
    </section>

    ${last ? `<section class="section">
      <h2 class="section-title">Ultima serata</h2>
      <div class="card night">
        <div class="night-date"><span class="nd-day">${last.d}</span><span class="nd-mon">${MON3[last.mo - 1]}</span></div>
        <div class="night-main">
          <span class="night-title">${last.cancelled ? 'Annullata' : esc(last.activity.replace('@', '@ ')) || 'Serata'}</span>
          <span class="muted small">Chiamata da ${esc(last.caller)}${last.recorded && !last.cancelled ? ` · ${last.present} presenti` : ''}</span>
        </div>
      </div>
    </section>` : ''}

    ${upcoming.length ? `<section class="section">
      <h2 class="section-title">Prossimi turni</h2>
      ${upcoming.map((n) => `<div class="card turn">
        <span class="turn-date">${pad(n.d)} ${MON3[n.mo - 1]}</span>
        ${avatar(n.caller)}
        <span class="turn-name">${esc(n.caller)}</span>
        ${n.dinner ? `<span class="turn-fork" aria-label="Cena Stirata">${forkIcon}</span>` : ''}
      </div>`).join('')}
    </section>` : ''}`;

  if (!live) startCountdown(start);
}

function startCountdown(target) {
  const el = document.getElementById('cd');
  const tick = () => {
    const ms = target - new Date();
    if (ms <= 0) { clearInterval(countdownTimer); render(); return; }
    const mins = Math.floor(ms / 60000);
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    const parts = d > 0 ? [[d, 'G'], [pad(h), 'H'], [pad(m), 'M']] : [[pad(h), 'H'], [pad(m), 'M']];
    el.innerHTML = parts.map(([v, u]) => `<span class="cd-num">${v}</span><span class="cd-unit">${u}</span>`).join('');
    el.setAttribute('aria-label', `Mancano ${d} giorni, ${h} ore e ${m} minuti`);
  };
  tick();
  countdownTimer = setInterval(tick, 15000);
}

const forkIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 2c-2 2-3 5-3 8h3v12"/></svg>';
const pinIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>';

// ---------- Vista: Classifica ----------

function delta(p) {
  if (p.delta === null) return '';
  if (p.delta === 0) return '<span class="delta" aria-label="Posizione invariata">=</span>';
  const up = p.delta > 0;
  const n = Math.abs(p.delta);
  const label = (up ? 'Salito di ' : 'Sceso di ') + n + (n === 1 ? ' posizione' : ' posizioni');
  const arrow = up
    ? '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1l4 7H1z" fill="currentColor"/></svg>'
    : '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 9L1 2h8z" fill="currentColor"/></svg>';
  return `<span class="delta ${up ? 'up' : 'down'}" aria-label="${label}">${arrow}${n}</span>`;
}

function podiumItem(p, cls) {
  if (!p) return '<div></div>';
  return `<div class="pod ${cls}">
    ${avatar(p.name)}
    <span class="name">${esc(firstName(p.name))}</span>
    <span class="ar">${esc(p.ar)}</span>
    ${delta(p)}
    <div class="block">${p.pos}</div>
  </div>`;
}

function renderClassifica(data) {
  const ps = data.players;
  const subtitle = data.lastDate
    ? `Aggiornata al ${data.lastDate}` + (data.prevDate ? ` · frecce rispetto al ${data.prevDate}` : '')
    : 'Ordinata per Attendance Rate';

  const rows = ps.slice(3).map((p) => `
    <div class="row">
      <div class="col-pos"><span class="pos">${p.pos}</span>${delta(p)}</div>
      <div class="col-name">${avatar(p.name)}<div class="who"><span class="name">${esc(p.name)}</span>${p.streak !== null ? `<span class="sub">Streak ${p.streak}</span>` : ''}</div></div>
      <span class="col-ar">${esc(p.ar)}</span>
    </div>`).join('');

  $content.innerHTML = `
    <div class="title-block"><h1>Classifica</h1><p class="muted">${esc(subtitle)}</p></div>
    <section class="podium" aria-label="Podio">
      ${podiumItem(ps[1], 'second')}
      ${podiumItem(ps[0], 'first')}
      ${podiumItem(ps[2], 'third')}
    </section>
    <section class="list" aria-label="Resto della classifica">
      <div class="list-head" aria-hidden="true">
        <span class="col-pos">POS</span>
        <span class="col-name">GIOCATORE</span>
        <span class="col-ar">A.R.</span>
      </div>
      ${rows}
    </section>`;
}

// ---------- Navigazione e stato ----------

const VIEWS = { mercoledi: renderMercoledi, classifica: renderClassifica };
let state = { data: null, stale: false, error: null };

function currentView() {
  const v = location.hash.slice(1);
  return VIEWS[v] ? v : 'mercoledi';
}

function render() {
  clearInterval(countdownTimer);
  const view = currentView();
  $tabs.forEach((a) => {
    const on = a.dataset.view === view;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (state.data) {
    VIEWS[view](state.data);
    if (state.stale) {
      $content.insertAdjacentHTML('afterbegin', `<p class="stale">Dati salvati il ${new Date(state.data.fetchedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}, non riesco ad aggiornarli adesso.</p>`);
    }
  } else if (state.error) {
    $content.innerHTML = `<div class="note">
      <span>Non riesco a leggere il foglio in questo momento. Controlla la connessione e riprova.</span>
      <button type="button" id="retry">Riprova</button>
    </div>`;
    document.getElementById('retry').addEventListener('click', refresh);
  }
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}
function writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* spazio pieno o modalita' privata */ }
}

let loading = false;
async function refresh() {
  if (loading) return;
  loading = true;
  $refresh.classList.add('spinning');
  try {
    const data = await loadData();
    writeCache(data);
    state = { data, stale: false, error: null };
  } catch (err) {
    console.error(err);
    const cached = readCache();
    state = cached ? { data: cached, stale: true, error: null } : { data: null, stale: false, error: err };
  } finally {
    loading = false;
    $refresh.classList.remove('spinning');
    render();
  }
}

const cached = readCache();
if (cached) { state.data = cached; render(); }
refresh();

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
$refresh.addEventListener('click', refresh);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

'use strict';

// Fonte dati: il Google Sheet "Mercoledì 2026" pubblicato sul web.
// Tutti i calcoli li fa il foglio: qui si leggono e si mostrano.
const SHEET = 'https://docs.google.com/spreadsheets/d/e/RIMOSSO/pub?single=true&output=csv&gid=';
const GID = {
  leaderboard: '1279013194',
  storicoLeaderboard: '2088317534',
  registro: '970381673'
};
const CACHE_KEY = 'mxlv-classifica-v1';

const $content = document.getElementById('content');
const $subtitle = document.getElementById('subtitle');
const $refresh = document.getElementById('refresh');

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
    ar: head.findIndex((c) => c.toUpperCase().startsWith('ATTENDANCE')),
    present: head.indexOf('✅'),
    absent: head.indexOf('❌'),
    work: head.indexOf(norm('✈️')),
    bonus: head.indexOf('🟠')
  };
  const players = [];
  for (const r of rows.slice(h + 1)) {
    const name = norm(r[col.name]);
    if (!name) continue;
    players.push({
      name,
      pos: players.length + 1,
      ar: norm(r[col.ar]),
      present: norm(r[col.present]),
      absent: norm(r[col.absent]),
      work: norm(r[col.work]),
      bonus: norm(r[col.bonus])
    });
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

// Tab "Registro": in fondo c'e' la riga "Streak Attuale", con le colonne nominate nella prima riga.
function readStreaks(rows) {
  const head = rows[0].map(norm);
  const r = rows.find((row) => row.some((c) => norm(c) === 'Streak Attuale'));
  const m = {};
  if (r) head.forEach((n, i) => { if (n && /^\d+$/.test(norm(r[i]))) m[n] = parseInt(r[i], 10); });
  return m;
}

async function loadData() {
  const [lb, hist, reg] = await Promise.all([
    fetchTab(GID.leaderboard),
    fetchTab(GID.storicoLeaderboard),
    fetchTab(GID.registro)
  ]);
  const players = readLeaderboard(lb);
  const history = readHistory(hist);
  const streaks = readStreaks(reg);
  for (const p of players) {
    const before = history.prev && history.prev.pos[p.name];
    p.delta = before ? before - p.pos : null;
    p.streak = streaks[p.name] ?? null;
  }
  return {
    players,
    lastDate: history.last && history.last.date,
    prevDate: history.prev && history.prev.date,
    fetchedAt: Date.now()
  };
}

// ---------- Rendering ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const firstName = (n) => n.split(' ')[0];
const slug = (n) => firstName(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const initials = (n) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function avatar(p) {
  // Se la foto manca si vedono le iniziali.
  return `<img src="img/foto/${slug(p.name)}.jpg" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;initials&quot;>${esc(initials(p.name))}</span>'">`;
}

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
    ${avatar(p)}
    <span class="name">${esc(firstName(p.name))}</span>
    <span class="ar">${esc(p.ar)}</span>
    ${delta(p)}
    <div class="block">${p.pos}</div>
  </div>`;
}

function render(data, { stale = false } = {}) {
  const ps = data.players;
  $subtitle.textContent = data.lastDate
    ? `Aggiornata al ${data.lastDate}` + (data.prevDate ? ` · frecce rispetto al ${data.prevDate}` : '')
    : 'Ordinata per Attendance Rate';

  const rows = ps.slice(3).map((p) => `
    <div class="row">
      <div class="col-pos"><span class="pos">${p.pos}</span>${delta(p)}</div>
      <div class="col-name">${avatar(p)}<div class="who"><span class="name">${esc(p.name)}</span>${p.streak !== null ? `<span class="sub">Streak ${p.streak}</span>` : ''}</div></div>
      <span class="col-ar">${esc(p.ar)}</span>
    </div>`).join('');

  $content.innerHTML = `
    ${stale ? `<p class="stale">Dati salvati il ${new Date(data.fetchedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}, non riesco ad aggiornarli adesso.</p>` : ''}
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

function renderError(err) {
  $subtitle.textContent = 'Classifica non disponibile';
  $content.innerHTML = `<div class="note">
    <span>Non riesco a leggere il foglio in questo momento. Controlla la connessione e riprova.</span>
    <button type="button" id="retry">Riprova</button>
  </div>`;
  document.getElementById('retry').addEventListener('click', refresh);
  console.error(err);
}

// ---------- Avvio ----------

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
    render(data);
  } catch (err) {
    const cached = readCache();
    if (cached) render(cached, { stale: true });
    else renderError(err);
  } finally {
    loading = false;
    $refresh.classList.remove('spinning');
  }
}

const cached = readCache();
if (cached) render(cached);
refresh();

$refresh.addEventListener('click', refresh);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

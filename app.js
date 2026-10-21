'use strict';

// Fonte dati: il Google Sheet "Mercoledì 2026" pubblicato sul web.
// Tutti i calcoli li fa il foglio: qui si leggono e si mostrano.
// Il riferimento al foglio non sta nel repo: arriva da config.js, che viene
// generato al momento della pubblicazione partendo da un segreto di GitHub.
const CONFIG = window.MXLV_CONFIG || {};
const SHEET_ID = CONFIG.sheetId || '';
const SHEET = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?single=true&output=csv&gid=`;
const GID = {
  leaderboard: CONFIG.gidLeaderboard || '',
  storicoLeaderboard: CONFIG.gidStoricoLeaderboard || '',
  registro: CONFIG.gidRegistro || ''
};
const REGISTRO_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pubhtml?gid=${GID.registro}&single=true`;
const CACHE_KEY = 'mxlv-data-v3';
const START_HOUR = 20; // le attività iniziano dalle 20:00
const END_HOUR = 1;    // e finiscono entro l'1:00 del giovedì

const $content = document.getElementById('content');
const $refresh = document.getElementById('refresh');
const $tabs = [...document.querySelectorAll('.tabbar a')];

// =====================================================================
// CSV
// =====================================================================

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

// =====================================================================
// Lettura dei tab
// =====================================================================

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
function readHistory(rows) {
  const head = rows[0].map(norm);
  return rows.slice(1)
    .filter((r) => /^\d{1,2}\/\d{1,2}/.test(norm(r[0])) && head.some((n, i) => i > 0 && /^\d+\s*°?$/.test(norm(r[i]))))
    .map((r) => {
      const pos = {};
      head.forEach((n, i) => { if (i > 0 && n) { const p = parseInt(r[i], 10); if (!isNaN(p)) pos[n] = p; } });
      return { date: norm(r[0]), pos };
    });
}

// Tab "Registro": una riga per mercoledì (Data, Attività, Chiamata, una colonna per persona, Mister X),
// e in fondo le righe di riepilogo per persona (Presenze, Assenze, Streak Max, Streak Attuale, Bonus...).
const NOT_PLAYERS = new Set(['', 'Data', 'Attività', 'Chiamata', 'Senza Malese', 'Mister X', 'AI']);
const PRESENT = new Set(['✅', '🟠']);

function readRegistro(rows) {
  const head = rows[0].map(norm);
  const col = {
    date: head.indexOf('Data'),
    activity: head.indexOf('Attività'),
    caller: head.indexOf('Chiamata'),
    mrx: head.indexOf('Mister X')
  };
  const roster = head.map((n, i) => ({ n, i })).filter(({ n }) => !NOT_PLAYERS.has(n));

  const nights = [];
  const stats = {};
  roster.forEach(({ n }) => { stats[n] = {}; });

  for (const r of rows.slice(1)) {
    const m = norm(r[col.date]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const rawCaller = norm(r[col.caller]);
      const marks = {};
      roster.forEach(({ n, i }) => { const v = norm(r[i]); if (v) marks[n] = v; });
      const vals = Object.values(marks);
      nights.push({
        key: `${pad(m[1])}-${pad(m[2])}`,
        y: +m[3], mo: +m[2], d: +m[1],
        activity: norm(r[col.activity]),
        caller: cleanName(rawCaller),
        dinner: rawCaller.includes('🍴'),
        mrx: col.mrx >= 0 ? norm(r[col.mrx]) : '',
        marks,
        present: vals.filter((v) => PRESENT.has(v)).length,
        recorded: vals.length > 0,
        cancelled: vals.length > 0 && vals.every((v) => v === '🚫')
      });
      continue;
    }
    // Riga di riepilogo: etichetta in una delle prime colonne, numeri sotto ogni persona.
    const label = norm(r.slice(0, Math.min(4, r.length)).find((c) => norm(c)));
    if (!label || label === 'Progresso:') continue;
    roster.forEach(({ n, i }) => { const v = norm(r[i]); if (v) stats[n][label] = v; });
  }

  return { nights, stats, roster: roster.map(({ n }) => n) };
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
  const prev = history.length > 1 ? history[history.length - 2] : null;
  for (const p of players) {
    const before = prev && prev.pos[p.name];
    p.delta = before ? before - p.pos : null;
  }
  return {
    players,
    history,
    nights: registro.nights,
    stats: registro.stats,
    roster: registro.roster,
    fetchedAt: Date.now()
  };
}

// =====================================================================
// Utilità
// =====================================================================

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const firstName = (n) => n.split(' ')[0];
const slug = (n) => firstName(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const initials = (n) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
function pad(n) { return String(n).padStart(2, '0'); }

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MON3 = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];

// Orari della serata, nell'ora locale del telefono.
const startOf = (n) => new Date(n.y, n.mo - 1, n.d, START_HOUR, 0, 0);
const endOf = (n) => new Date(n.y, n.mo - 1, n.d + 1, END_HOUR, 0, 0);

// Indice del prossimo mercoledì (quello non ancora finito); le serate prima sono passate.
const nextIndex = (nights) => {
  const now = new Date();
  const i = nights.findIndex((n) => now < endOf(n));
  return i < 0 ? nights.length : i;
};

function avatar(name, cls = '') {
  // Se la foto manca si vedono le iniziali.
  return `<img class="${cls}" src="img/foto/${slug(name)}.jpg?v=2" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;initials ${cls}&quot;>${esc(initials(name))}</span>'">`;
}

// "Gags @Bollicine" -> { title: "Gags", place: "Bollicine" }
function splitActivity(s) {
  const at = s.indexOf('@');
  if (at < 0) return { title: s, place: '' };
  const title = s.slice(0, at).replace(/[\s-]+$/, '').trim();
  const place = s.slice(at + 1).trim();
  return title ? { title, place } : { title: place, place: '' };
}

const stat = (data, name, prefix) => {
  const s = data.stats[name] || {};
  const k = Object.keys(s).find((key) => norm(key).toLowerCase().startsWith(prefix.toLowerCase()));
  return k ? s[k] : null;
};
const num = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };

function backLink(fallbackHash, label) {
  return `<a class="back" href="${fallbackHash}" data-back>${icons.chevronLeft}${esc(label)}</a>`;
}

const icons = {
  fork: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 2c-2 2-3 5-3 8h3v12"/></svg>',
  pin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  chevronLeft: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  chevronRight: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
  chevronDown: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  userPlus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/></svg>',
  pencil: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  external: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>'
};

// =====================================================================
// Vista: Prossimo mercoledì
// =====================================================================

let countdownTimer = null;

function nightCard(n) {
  const title = n.cancelled ? 'Annullata' : (n.activity ? n.activity.replace(/\s*@\s*/, ' @ ') : 'Serata');
  return `<a class="card night" href="#serata/${n.key}">
    <div class="night-date"><span class="nd-day">${n.d}</span><span class="nd-mon">${MON3[n.mo - 1]}</span></div>
    <div class="night-main">
      <span class="night-title${n.cancelled ? ' faded' : ''}">${esc(title)}</span>
      <div class="night-meta">
        <span>${esc(n.caller)}</span>
        ${n.dinner ? '<span class="tag dinner">CENA</span>' : ''}
        ${n.mrx ? '<span class="tag mrx">MISTER X</span>' : ''}
      </div>
    </div>
    ${n.recorded && !n.cancelled ? `<span class="night-count${n.present >= 7 ? ' hi' : ''}">${n.present}/${Object.keys(n.marks).length}</span>` : ''}
    <span class="chev">${icons.chevronRight}</span>
  </a>`;
}

function renderMercoledi(data) {
  const now = new Date();
  const nights = data.nights;
  const idx = nextIndex(nights);

  if (idx >= nights.length) {
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
        ${place ? `<span class="act-place">${icons.pin}${esc(place)}</span>` : ''}
      </div>`
    : '';

  const timeBlock = live
    ? `<div class="countdown">
        <div class="live"><span class="live-dot"></span>Si gioca stasera</div>
        <span class="muted small">Che tu vinca o che tu perda, il mercoledì nessuno scherza.</span>
        <a class="live-cta" href="#classifica">Controlla la classifica ${icons.chevronRight}</a>
      </div>`
    : `<div class="countdown">
        <span class="label">Mancano</span>
        <div class="cd-digits" id="cd"></div>
        <span class="muted small">${next.activity ? 'Alle 20:00 di mercoledì.' : "Alle 20:00 di mercoledì. L'attività arriva entro le 19:00."}</span>
      </div>`;

  $content.innerHTML = `
    <div class="title-block"><h1>Prossimo mercoledì</h1><p class="muted">Mercoledì ${idx + 1} di ${nights.length}</p></div>

    <section class="card hero">
      <div class="hero-top">
        <span class="hero-date">${next.d} ${MONTHS[next.mo - 1].toUpperCase()}</span>
        ${next.dinner ? `<span class="chip dinner">${icons.fork}Cena Stirata</span>` : ''}
      </div>
      ${activityBlock}
      ${timeBlock}
      ${next.caller ? `<div class="divider"></div>
      <a class="caller" href="#profilo/${slug(next.caller)}">
        ${avatar(next.caller)}
        <div class="who"><span class="label">Chiama</span><span class="caller-name">${esc(next.caller)}</span></div>
      </a>` : ''}
    </section>

    ${last ? `<section class="section">
      <h2 class="section-title">Ultima serata</h2>
      ${nightCard(last)}
    </section>` : ''}

    ${upcoming.length ? `<section class="section">
      <h2 class="section-title">Prossimi turni</h2>
      ${upcoming.map((n) => `<div class="card turn">
        <span class="turn-date">${pad(n.d)} ${MON3[n.mo - 1]}</span>
        ${avatar(n.caller)}
        <span class="turn-name">${esc(n.caller)}</span>
        ${n.dinner ? `<span class="turn-fork" aria-label="Cena Stirata">${icons.fork}</span>` : ''}
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

// =====================================================================
// Vista: Serata passata
// =====================================================================

const MARK_INFO = {
  '✅': { label: 'presente', cls: 'ok' },
  '🟠': { label: 'bonus', cls: 'bonus' },
  '❌': { label: 'assente', cls: 'ko' },
  [norm('✈️')]: { label: 'lavoro', cls: 'off' },
  '🚑': { label: 'salute', cls: 'off' },
  '💀': { label: 'malus del campione', cls: 'ko' },
  '🚫': { label: 'annullata', cls: 'off' }
};

function renderSerata(data, key) {
  const nights = data.nights;
  const i = nights.findIndex((n) => n.key === key);
  const n = nights[i];
  if (!n || i >= nextIndex(nights)) {
    $content.innerHTML = `${backLink('#storico', 'Storico')}<div class="note">Serata non trovata.</div>`;
    return;
  }
  const { title, place } = splitActivity(n.activity || (n.cancelled ? 'Annullata' : 'Serata'));
  const people = data.roster.map((name) => ({ name, mark: n.marks[name] || '' }));
  const total = people.filter((p) => p.mark).length;

  $content.innerHTML = `
    ${backLink('#storico', 'Indietro')}
    <section class="night-head">
      <span class="hero-date">MERCOLEDÌ ${n.d} ${MONTHS[n.mo - 1].toUpperCase()} · N. ${i + 1}</span>
      <h1 class="night-h1">${esc(title)}</h1>
      ${place ? `<span class="act-place">${icons.pin}${esc(place)}</span>` : ''}
      ${n.dinner ? `<span class="chip dinner">${icons.fork}Cena Stirata</span>` : ''}
    </section>

    <a class="card caller-card" href="#profilo/${slug(n.caller)}">
      ${avatar(n.caller)}
      <div class="who"><span class="label">Ha chiamato</span><span class="caller-name">${esc(n.caller)}</span></div>
      <span class="chev">${icons.chevronRight}</span>
    </a>

    ${n.recorded ? `<section class="card presence">
      <div class="presence-head">
        <span class="label caps">Presenze</span>
        <span class="presence-count"><span class="hi">${n.present}</span> / ${total}</span>
      </div>
      <div class="presence-grid">
        ${people.map((p) => {
          const info = MARK_INFO[p.mark] || { label: 'non registrato', cls: 'off' };
          const here = PRESENT.has(p.mark);
          return `<a class="person${here ? '' : ' away'}" href="#profilo/${slug(p.name)}" aria-label="${esc(p.name)}: ${info.label}">
            <span class="person-pic">${avatar(p.name)}<span class="mark ${info.cls}" aria-hidden="true">${esc(p.mark || '·')}</span></span>
            <span class="person-name">${esc(firstName(p.name))}</span>
          </a>`;
        }).join('')}
      </div>
    </section>` : '<div class="note">Presenze non ancora registrate.</div>'}

    ${n.mrx ? `<section class="card mrx-card">
      <span class="mrx-icon">${icons.userPlus}</span>
      <div class="who"><span class="label caps mrx-label">Mister X</span><span class="mrx-name">${esc(n.mrx)}</span></div>
      <span class="muted small">Svelato</span>
    </section>` : ''}`;
}

// =====================================================================
// Vista: Classifica
// =====================================================================

function delta(p) {
  if (p.delta === null || p.delta === undefined) return '';
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
  return `<a class="pod ${cls}" href="#profilo/${slug(p.name)}">
    ${avatar(p.name)}
    <span class="name">${esc(firstName(p.name))}</span>
    <span class="ar">${esc(p.ar)}</span>
    ${delta(p)}
    <div class="block">${p.pos}</div>
  </a>`;
}

function renderClassifica(data) {
  const ps = data.players;
  const h = data.history;
  const last = h[h.length - 1], prev = h[h.length - 2];
  const subtitle = last
    ? `Aggiornata al ${last.date}` + (prev ? ` · frecce rispetto al ${prev.date}` : '')
    : 'Ordinata per Attendance Rate';

  const rows = ps.slice(3).map((p) => {
    const presenze = num(stat(data, p.name, 'Presenze')) ?? num(p.present);
    return `
    <a class="row" href="#profilo/${slug(p.name)}">
      <div class="col-pos"><span class="pos">${p.pos}</span>${delta(p)}</div>
      <div class="col-name">${avatar(p.name)}<div class="who"><span class="name">${esc(p.name)}</span>${presenze !== null ? `<span class="sub">${presenze} ${presenze === 1 ? 'presenza' : 'presenze'}</span>` : ''}</div></div>
      <span class="col-ar">${esc(p.ar)}</span>
    </a>`;
  }).join('');

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

// =====================================================================
// Grafico posizioni nel tempo
// =====================================================================

function rankChart(history, names, selected, { height = 280, compact = false } = {}) {
  const W = 320, H = height, padY = 10;
  const maxRank = Math.max(names.length, 2);
  const n = history.length;
  const x = (i) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (r) => padY + ((r - 1) / (maxRank - 1)) * (H - 2 * padY);
  const pathFor = (name) => {
    let d = '', pen = false;
    history.forEach((w, i) => {
      const r = w.pos[name];
      if (!r) { pen = false; return; }
      d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(r).toFixed(1) + ' ';
      pen = true;
    });
    return d.trim();
  };
  const others = compact ? [] : names.filter((nm) => nm !== selected);
  const lastPos = n ? history[n - 1].pos[selected] : null;
  const labels = n ? [history[0], history[Math.floor((n - 1) / 2)], history[n - 1]].map((w) => w.date) : [];
  const axis = compact ? [1, Math.ceil(maxRank / 2), maxRank] : Array.from({ length: maxRank }, (_, i) => i + 1);

  return `<div class="chart">
    <div class="chart-body">
      <div class="chart-axis" style="height:${H}px" aria-hidden="true">${axis.map((v) => `<span>${v}</span>`).join('')}</div>
      <div class="chart-plot" style="height:${H}px" role="img" aria-label="Posizione in classifica di ${esc(selected)} mercoledì per mercoledì${lastPos ? `, oggi ${lastPos}°` : ''}">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          ${others.map((nm) => `<path d="${pathFor(nm)}" class="line-other" vector-effect="non-scaling-stroke"/>`).join('')}
          <path d="${pathFor(selected)}" class="line-sel" vector-effect="non-scaling-stroke"/>
        </svg>
        ${lastPos ? `<span class="chart-dot" style="top:${(y(lastPos) / H * 100).toFixed(2)}%"></span>` : ''}
      </div>
    </div>
    <div class="chart-x" aria-hidden="true">${labels.map((l) => `<span>${esc(l)}</span>`).join('')}</div>
  </div>`;
}

function rankSummary(history, name) {
  const ranks = history.map((w) => w.pos[name]).filter(Boolean);
  return {
    now: ranks[ranks.length - 1] ?? null,
    best: ranks.length ? Math.min(...ranks) : null,
    top: ranks.filter((r) => r === 1).length
  };
}

// =====================================================================
// Vista: Storico
// =====================================================================

const storicoState = { view: 'rank', sel: null };

function renderStorico(data) {
  const names = data.players.map((p) => p.name);
  if (!storicoState.sel || !names.includes(storicoState.sel)) storicoState.sel = names[0];
  const sel = storicoState.sel;
  const isRank = storicoState.view === 'rank';
  const past = data.nights.slice(0, nextIndex(data.nights)).filter((n) => n.activity || n.recorded).reverse();
  const s = rankSummary(data.history, sel);

  const rankView = `
    <div class="player-picker" role="group" aria-label="Scegli chi evidenziare">
      ${data.roster.filter((n) => names.includes(n)).map((n) => `
        <button type="button" class="pick${n === sel ? ' on' : ''}" data-pick="${esc(n)}" aria-pressed="${n === sel}">
          ${avatar(n)}<span>${esc(firstName(n))}</span>
        </button>`).join('')}
    </div>
    <section class="card chart-card">${rankChart(data.history, names, sel)}</section>
    <section class="stat-grid three">
      <div class="card stat"><span class="stat-num hi">${s.now ?? '-'}${s.now ? '°' : ''}</span><span class="label">Oggi</span></div>
      <div class="card stat"><span class="stat-num">${s.best ?? '-'}${s.best ? '°' : ''}</span><span class="label">Miglior posizione</span></div>
      <div class="card stat"><span class="stat-num">${s.top}</span><span class="label">Settimane in testa</span></div>
    </section>`;

  const nightsView = past.length
    ? `<div class="night-list">${past.map(nightCard).join('')}</div>`
    : '<div class="note">Nessuna serata ancora.</div>';

  $content.innerHTML = `
    <div class="title-block"><h1>Storico</h1><p class="muted">${past.length} serate giocate</p></div>
    <div class="segmented" role="tablist" aria-label="Vista storico">
      <button type="button" role="tab" data-seg="rank" aria-selected="${isRank}" class="${isRank ? 'on' : ''}">Classifica nel tempo</button>
      <button type="button" role="tab" data-seg="nights" aria-selected="${!isRank}" class="${!isRank ? 'on' : ''}">Serate</button>
    </div>
    ${isRank ? rankView : nightsView}`;

  $content.querySelectorAll('[data-seg]').forEach((b) => b.addEventListener('click', () => {
    storicoState.view = b.dataset.seg; render();
  }));
  $content.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    storicoState.sel = b.dataset.pick; render();
  }));
}

// =====================================================================
// Vista: Profilo (con la figurina)
// =====================================================================

let figurinaCleanup = null;
let motionAsked = false;

function figurinaHTML(p, d, data, s) {
  const [nome, ...cognome] = p.name.split(' ');
  const arNum = parseFloat(String(p.ar || '').replace(',', '.'));
  const deg = isNaN(arNum) ? 0 : Math.max(0, Math.min(100, arNum)) * 3.6;
  const arShort = isNaN(arNum) ? '-' : String(Math.round(arNum * 10) / 10).replace('.', ',');

  // Mini grafico della posizione nel tempo
  const ranks = data.history.map((w) => w.pos[p.name]).filter(Boolean);
  const maxRank = Math.max(data.players.length, 2);
  const W = 220, H = 54;
  let spark = '';
  if (ranks.length > 1) {
    const pts = ranks.map((r, i) => [(i / (ranks.length - 1)) * W, 4 + ((r - 1) / (maxRank - 1)) * (H - 8)]);
    const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
    spark = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${line} L${W} ${H} L0 ${H} Z" class="spark-area"/>
      <path d="${line}" class="spark-line" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  const barCount = d.streakMax ? Math.min(d.streakMax, 20) : 0;
  const bars = Array.from({ length: barCount }, (_, i) => `<span class="${i < (d.streakNow || 0) ? 'on' : ''}"></span>`).join('');
  const dash = (v) => (v === null || v === undefined ? '-' : v);

  return `
  <div class="fig-stage" id="fig-stage">
    <button type="button" class="fig" id="fig" aria-label="Figurina di ${esc(p.name)}. Tocca per girarla." aria-pressed="false">

      <div class="fig-face fig-front">
        <div class="fig-window">
          <span class="fig-stripe s1" aria-hidden="true"></span>
          <span class="fig-stripe s2" aria-hidden="true"></span>
          ${avatar(p.name, 'fig-photo')}
          ${p.pos ? `<div class="fig-badge"><span>${p.pos}°</span><small>POSTO</small></div>` : ''}
          <span class="fig-year">2026</span>
        </div>
        <div class="fig-band">
          <div class="fig-names"><span class="fig-surname">${esc(cognome.join(' ') || nome)}</span><span class="fig-name">${esc(cognome.length ? nome : '')}</span></div>
          <div class="fig-ar"><span>${esc(p.ar || '-')}</span><small>I REMBRANDT</small></div>
        </div>
        <span class="fig-lens" aria-hidden="true"></span>
        <span class="fig-flash" aria-hidden="true"></span>
      </div>

      <div class="fig-face fig-back">
        <span class="fig-back-lines" aria-hidden="true"></span>
        <span class="fig-back-frame" aria-hidden="true"></span>
        <div class="fb-head">
          <div class="fb-id">
            <small>CARTA GIOCATORE</small>
            <span class="fb-surname">${esc(cognome.join(' ') || nome)}</span>
            <span class="fb-name">${esc(cognome.length ? nome : '')}</span>
          </div>
          ${p.pos ? `<span class="fb-num">#${p.pos}</span>` : ''}
        </div>
        <div class="fb-main">
          <div class="fb-gauge" style="--deg:${deg.toFixed(1)}deg"><div><span>${arShort}</span><small>A.R. %</small></div></div>
          <div class="fb-stats">
            <div><span>${dash(d.presenze)}</span><small>PRESENZE</small></div>
            <div><span>${dash(d.assenze)}</span><small>ASSENZE</small></div>
            <div><span>${dash(d.lavoro)}</span><small>LAVORO</small></div>
            <div><span>${dash(d.bonusAcc)} / ${dash(d.bonusRes)}</span><small>BONUS</small></div>
          </div>
        </div>
        ${spark ? `<div class="fb-spark">
          <div class="fb-spark-head"><small>ANDAMENTO 2026</small><span>miglior posizione <b>${s.best}°</b></span></div>
          ${spark}
        </div>` : ''}
        ${barCount ? `<div class="fb-streak">
          <div class="fb-streak-head"><small>STREAK</small><span>${dash(d.streakNow)} / MAX ${d.streakMax}</span></div>
          <div class="fb-bars" style="grid-template-columns: repeat(${barCount}, minmax(0, 1fr))">${bars}</div>
        </div>` : ''}
        <div class="fb-foot">
          <span>${p.pos ? `Figurina n. ${p.pos} di ${data.players.length}` : 'Mercoledì x la Vita'}</span>
          <span class="fb-seal">MXLV ORIGINALE</span>
        </div>
        <span class="fig-lens" aria-hidden="true"></span>
        <span class="fig-flash" aria-hidden="true"></span>
      </div>

    </button>
  </div>
  <p class="muted small center fig-hint" id="fig-hint">Inclina il telefono per muoverla, tocca per girarla</p>`;
}

// Movimento della figurina: giroscopio sul telefono, dito o mouse come ripiego.
function setupFigurina() {
  const stage = document.getElementById('fig-stage');
  const fig = document.getElementById('fig');
  if (!stage || !fig) return null;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IDLE = { rx: 5, ry: -12, gx: 30, gy: 20 };
  let target = { ...IDLE }, cur = { ...IDLE }, raf = 0, base = null, usingMotion = false;

  const apply = () => {
    cur.rx += (target.rx - cur.rx) * 0.18;
    cur.ry += (target.ry - cur.ry) * 0.18;
    cur.gx += (target.gx - cur.gx) * 0.18;
    cur.gy += (target.gy - cur.gy) * 0.18;
    fig.style.setProperty('--rx', cur.rx.toFixed(2) + 'deg');
    fig.style.setProperty('--ry', cur.ry.toFixed(2) + 'deg');
    fig.style.setProperty('--gx', cur.gx.toFixed(1) + '%');
    fig.style.setProperty('--gy', cur.gy.toFixed(1) + '%');
    fig.style.setProperty('--ga', ((cur.gx - 50) * 1.2).toFixed(1) + 'deg');
    fig.style.setProperty('--edge', Math.min(1, (Math.abs(cur.rx) + Math.abs(cur.ry)) / 22).toFixed(3));
    const moving = Math.abs(target.rx - cur.rx) + Math.abs(target.ry - cur.ry) + Math.abs(target.gx - cur.gx) > 0.05;
    raf = moving ? requestAnimationFrame(apply) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(apply); };
  const clamp = (v, a) => Math.max(-a, Math.min(a, v));

  const onPointer = (e) => {
    if (usingMotion) return;
    const r = stage.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    target = { rx: (0.5 - py) * 22, ry: (px - 0.5) * 28, gx: px * 100, gy: py * 100 };
    kick();
  };
  const onLeave = () => { if (!usingMotion) { target = { ...IDLE }; kick(); } };
  const onOrient = (e) => {
    if (e.beta === null || e.gamma === null) return;
    usingMotion = true;
    if (!base) base = { beta: e.beta, gamma: e.gamma };
    const rx = clamp(-(e.beta - base.beta) * 0.7, 20);
    const ry = clamp((e.gamma - base.gamma) * 0.8, 24);
    target = { rx: rx + 4, ry, gx: 50 + ry * 2, gy: 50 - rx * 2 };
    kick();
  };

  const startMotion = () => {
    if (reduce || !('DeviceOrientationEvent' in window)) return;
    window.addEventListener('deviceorientation', onOrient);
  };

  // Giro con effetto lente
  const flip = () => {
    const flipped = !fig.classList.contains('flipped');
    fig.classList.add('flipping');
    fig.classList.toggle('flipped', flipped);
    fig.setAttribute('aria-pressed', String(flipped));
    fig.querySelectorAll('.fig-flash').forEach((el) => {
      el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    });
    clearTimeout(fig._t);
    fig._t = setTimeout(() => fig.classList.remove('flipping'), 650);
  };
  const onClick = () => {
    // Su iPhone il permesso per il giroscopio va chiesto dentro un tocco.
    const DOE = window.DeviceOrientationEvent;
    if (!reduce && !motionAsked && DOE && typeof DOE.requestPermission === 'function') {
      motionAsked = true;
      DOE.requestPermission().then((r) => { if (r === 'granted') startMotion(); }).catch(() => {});
    }
    flip();
  };

  if (!reduce) {
    stage.addEventListener('pointermove', onPointer);
    stage.addEventListener('pointerleave', onLeave);
    const DOE = window.DeviceOrientationEvent;
    if (!(DOE && typeof DOE.requestPermission === 'function')) startMotion();
    else if (motionAsked) startMotion();
  }
  fig.addEventListener('click', onClick);
  apply();

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(fig._t);
    stage.removeEventListener('pointermove', onPointer);
    stage.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('deviceorientation', onOrient);
  };
}

function renderProfilo(data, key) {
  let p = data.players.find((pl) => slug(pl.name) === key);
  if (!p) {
    const name = data.roster.find((n) => slug(n) === key);
    if (name) p = { name, pos: null, ar: stat(data, name, 'Attendance Rate'), delta: null };
  }
  if (!p) {
    $content.innerHTML = `${backLink('#classifica', 'Classifica')}<div class="note">Giocatore non trovato.</div>`;
    return;
  }
  const name = p.name;
  const d = {
    presenze: num(stat(data, name, 'Presenze')) ?? num(p.present),
    assenze: num(stat(data, name, 'Assenze')) ?? num(p.absent),
    lavoro: num(stat(data, name, '✈')) ?? num(p.work),
    sospesi: num(stat(data, name, 'Giorni Sospesi')),
    streakNow: num(stat(data, name, 'Streak Attuale')),
    streakMax: num(stat(data, name, 'Streak Max')),
    bonusAcc: num(stat(data, name, 'Bonus accumulati')),
    bonusRes: num(stat(data, name, 'Bonus residui'))
  };
  const s = rankSummary(data.history, name);
  const dash = (v) => (v === null || v === undefined ? '-' : v);

  $content.innerHTML = `
    ${backLink('#classifica', 'Classifica')}
    <h1 class="sr-only">${esc(name)}</h1>

    ${figurinaHTML(p, d, data, s)}

    <section class="stat-grid four">
      <div class="card stat"><span class="stat-num">${dash(d.presenze)}</span><span class="label">Presenze</span></div>
      <div class="card stat"><span class="stat-num">${dash(d.assenze)}</span><span class="label">Assenze</span></div>
      <div class="card stat"><span class="stat-num">${dash(d.lavoro)}</span><span class="label">Lavoro</span></div>
      <div class="card stat"><span class="stat-num">${dash(d.sospesi)}</span><span class="label">Sospesi</span></div>
    </section>

    <section class="card duo-card">
      <div class="who"><span class="label caps">Streak</span><span class="small">Attuale ${dash(d.streakNow)} · migliore ${dash(d.streakMax)}</span></div>
      <div class="who right"><span class="label caps">Bonus</span><span class="small">${dash(d.bonusAcc)} accumulati · ${dash(d.bonusRes)} residui</span></div>
    </section>

    ${data.history.length > 1 && s.best ? `<section class="card chart-card">
      <div class="ar-top"><span class="label caps">Posizione nel tempo</span><span class="label">Migliore: ${s.best}°</span></div>
      ${rankChart(data.history, data.players.map((pl) => pl.name), name, { height: 140, compact: true })}
    </section>` : ''}`;

  figurinaCleanup = setupFigurina();
}

// =====================================================================
// Vista: Regolamento
// =====================================================================

const RULES = [
  { num: 1, title: 'Periodo di validità', groups: [
    { lines: ['Valido dal 01/01/2026 al 31/12/2026.'] }
  ] },
  { num: 2, title: 'Registrazione presenze', groups: [
    { title: 'Emoji', lines: [
      '✅  Presenza confermata',
      '❌  Assenza non giustificata',
      '🟠  Bonus: assenza giustificata con un bonus accumulato',
      '✈️  Assenza per motivi di lavoro documentabili',
      '🚑  Gravi motivi di salute: ricovero, gravi ustioni, fratture agli arti',
      '💀  Malus del Campione: presenza trasformata in assenza dal vincitore dell’edizione precedente',
      '🚫  Evento annullato per mancato numero minimo'
    ] },
    { title: 'Casi speciali', lines: [
      'Paternità nel giorno dell’evento: presente ✅',
      'Decesso: vincitore simbolico dell’edizione, la serata successiva è dedicata alla sua memoria ✅',
      'Matrimonio proprio: assenza ❌ con riconoscimento negativo simbolico',
      'Viaggi di piacere e malattia ordinaria: assenza ❌'
    ] },
    { title: 'Bonus', lines: [
      'Il primo bonus 🟠 si guadagna con 10 presenze ✅ nell’anno, poi uno ogni 10 presenze successive.',
      'I bonus non usati decadono il 31/12/2026 e non passano all’edizione successiva.',
      'Usare un bonus interrompe lo streak.'
    ] },
    { title: 'Ritardi', lines: [
      'Massimo 20 minuti dall’orario di inizio comunicato dall’organizzatore, poi la presenza diventa ❌.',
      'La regola è sempre attiva e l’organizzatore non può modificarla.'
    ] }
  ] },
  { num: 3, title: 'Effetti sullo streak', groups: [
    { title: 'Interrotto da', lines: ['❌ assenza o ritardo oltre 20 minuti', '🟠 uso di un bonus', '✈️ lavoro'] },
    { title: 'Mantenuto da', lines: ['✅ presenza', '🚑 gravi motivi di salute', '🚫 evento annullato', 'Paternità e decesso'] }
  ] },
  { num: 4, title: 'Organizzazione delle attività', groups: [
    { title: 'Rotazione', lines: ['Il chiamante segue l’ordine alfabetico a partire dal primo mercoledì dell’anno.'] },
    { title: 'Requisiti', lines: ['Massimo 25 km da Piazza Grande, Modena, su strada (non in linea d’aria).', 'Massimo 25€ a persona.', 'Inizio non prima delle 20:00, fine entro l’1:00 del giorno dopo.'] },
    { title: 'Comunicazione', lines: ['Luogo, orario e costo stimato entro le 19:00 del mercoledì stesso.'] },
    { title: 'Cena Stirata', lines: ['Una volta al mese, con budget fino a 30€ a persona.', 'Preferibilmente il terzo mercoledì del mese.', 'Valgono comunque distanza e orari.'] },
    { title: 'Regola della minoranza', lines: ['Servono almeno 3 partecipanti confermati: altrimenti la serata è annullata e tutti ricevono 🚫.'] },
    { title: 'Pagamenti anticipati', lines: ['Se serve un pagamento unico anticipato (es. bowling), anticipa il chiamante per tutti, salvo accordi diversi.'] }
  ] },
  { num: 5, title: 'Canali di comunicazione', link: true, groups: [
    { lines: ['Il gruppo WhatsApp "I rembrandt 🎨" è il canale ufficiale.', 'Le presenze sono registrate nel foglio Google condiviso, con le statistiche aggiornate.'] }
  ] },
  { num: 6, title: 'Classifiche e premiazioni', groups: [
    { title: 'Attendance Rate', lines: ['Presenze effettive (✅ + 🟠) diviso giorni giocabili.', 'Le serate 🚫, ✈️ e 🚑 non contano.'] },
    { title: 'Spareggi', lines: ['1. Più presenze ✅', '2. Meno assenze ❌', '3. Meno assenze per lavoro ✈️', '4. Meno bonus usati 🟠', '5. Ordine alfabetico'] },
    { title: 'Premi', lines: [
      '🥇 Regalo personalizzato (5€ a partecipante), un bonus 🟠 e il Malus del Campione 💀 per l’edizione successiva',
      '🥈 Una cena del mercoledì offerta dagli altri',
      '🥉 Un bonus 🟠 per l’edizione successiva'
    ] },
    { title: 'Penalità', lines: ['Penultimo: la patatina più piccante del mondo, all’ultima serata dell’anno.', 'Ultimo 🦈: lo squalo marcio (Surstromming) in una serata designata.'] }
  ] },
  { num: 7, title: 'Disposizioni finali', groups: [
    { title: 'Modifiche', lines: ['A fine edizione per quella successiva, oppure in corso d’anno con votazione a maggioranza.'] },
    { title: 'Controversie', lines: ['Si risolvono con votazione a maggioranza semplice nel gruppo ufficiale.'] }
  ] }
];

const ruleState = { open: 2 };
const waLink = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);

function renderRegolamento() {
  $content.innerHTML = `
    <div class="title-block"><h1>Regolamento</h1><p class="muted">Edizione 2026</p></div>

    <section class="stat-grid two" aria-label="Regole in breve">
      <div class="card quick"><span class="quick-num">25 km</span><span class="label">da Piazza Grande, su strada</span></div>
      <div class="card quick"><span class="quick-num">25€</span><span class="label">a testa, 30€ Cena Stirata</span></div>
      <div class="card quick"><span class="quick-num">20:00-01:00</span><span class="label">inizio e fine attività</span></div>
      <div class="card quick"><span class="quick-num">20 min</span><span class="label">ritardo massimo, poi ❌</span></div>
    </section>

    <section class="rules">
      ${RULES.map((a) => {
        const open = ruleState.open === a.num;
        return `<div class="card rule">
          <button type="button" class="rule-head" data-rule="${a.num}" aria-expanded="${open}" aria-controls="rule-${a.num}">
            <span class="rule-num">ART.${a.num}</span>
            <span class="rule-title">${esc(a.title)}</span>
            <span class="rule-chev${open ? ' open' : ''}">${icons.chevronDown}</span>
          </button>
          <div class="rule-body" id="rule-${a.num}" ${open ? '' : 'hidden'}>
            ${a.groups.map((g) => `<div class="rule-group">
              ${g.title ? `<span class="rule-gtitle">${esc(g.title)}</span>` : ''}
              ${g.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
            </div>`).join('')}
            ${a.link ? `<a class="btn-ghost accent" href="${REGISTRO_URL}" target="_blank" rel="noopener">Apri il registro ${icons.external}</a>` : ''}
            <a class="btn-ghost" href="${waLink(`Proposta di modifica al regolamento MXLV, Art. ${a.num} (${a.title}): `)}" target="_blank" rel="noopener">${icons.pencil}Proponi modifica</a>
          </div>
        </div>`;
      }).join('')}
    </section>

    <a class="btn-primary" href="${waLink('Proposta di nuova regola MXLV: ')}" target="_blank" rel="noopener">${icons.plus}Proponi una nuova regola</a>
    <p class="muted small center">Si apre WhatsApp con il messaggio pronto da mandare nel gruppo.</p>`;

  $content.querySelectorAll('[data-rule]').forEach((b) => b.addEventListener('click', () => {
    const n = +b.dataset.rule;
    ruleState.open = ruleState.open === n ? null : n;
    render();
  }));
}

// =====================================================================
// Navigazione e stato
// =====================================================================

// Ogni rotta indica la sua scheda nella barra in basso.
const ROUTES = {
  mercoledi: { tab: 'mercoledi', view: renderMercoledi, title: 'Mercoledì' },
  classifica: { tab: 'classifica', view: renderClassifica, title: 'Classifica' },
  storico: { tab: 'storico', view: renderStorico, title: 'Storico' },
  regolamento: { tab: 'regolamento', view: renderRegolamento, title: 'Regolamento', static: true },
  profilo: { tab: 'classifica', view: renderProfilo, title: 'Profilo' },
  serata: { tab: 'storico', view: renderSerata, title: 'Serata' }
};
let state = { data: null, stale: false, error: null };
let inAppNavs = 0;

function currentRoute() {
  const [name, arg] = location.hash.slice(1).split('/');
  return ROUTES[name] ? { name, arg: decodeURIComponent(arg || ''), ...ROUTES[name] } : { name: 'mercoledi', arg: '', ...ROUTES.mercoledi };
}

function render() {
  clearInterval(countdownTimer);
  if (figurinaCleanup) { figurinaCleanup(); figurinaCleanup = null; }
  const route = currentRoute();
  document.title = `MXLV - ${route.title}`;
  $tabs.forEach((a) => {
    const on = a.dataset.view === route.tab;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  if (route.static) { route.view(state.data, route.arg); return; }

  if (state.data) {
    route.view(state.data, route.arg);
    if (state.stale) {
      $content.insertAdjacentHTML('afterbegin', `<p class="stale">Dati salvati il ${new Date(state.data.fetchedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}, non riesco ad aggiornarli adesso.</p>`);
    }
  } else if (state.error) {
    $content.innerHTML = `<div class="title-block"><h1>${esc(route.title)}</h1></div>
    <div class="note">
      <span>Non riesco a leggere il foglio in questo momento. Controlla la connessione e riprova.</span>
      <button type="button" id="retry">Riprova</button>
    </div>`;
    document.getElementById('retry').addEventListener('click', refresh);
  }
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    return c && Array.isArray(c.nights) ? c : null;
  } catch { return null; }
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

// "Indietro" torna alla schermata precedente se si e' arrivati da dentro l'app,
// altrimenti va alla scheda di riferimento.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-back]');
  if (a && inAppNavs > 0) { e.preventDefault(); history.back(); }
});

window.addEventListener('hashchange', () => { inAppNavs++; render(); window.scrollTo(0, 0); });
$refresh.addEventListener('click', refresh);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});

const cached = readCache();
if (cached) state.data = cached;
render();
refresh();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Gran Galà MXLV: Atto 2, La stagione.
// Slide: numeri dell'anno, catalogo delle serate, registro (mosaico), andamento, curiosità,
// confronto con gli anni passati, andamento di ognuno.
// Ogni slide ha render() (stato finale, usato anche per le miniature), onEnter() e onStep()
// per animazioni ed effetti sonori. I dati arrivano da gala/stagione.js.
// Numeri marcati STIMA: provvisori, da aggiornare a fine stagione.
(() => {
  'use strict';

  // =================================================================
  // Effetti sonori, generati nel codice. Volumi bassi, tranne traguardi e sconfitte.
  // =================================================================
  const sfx = (() => {
    let ctx, out;
    const ac = () => {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    };
    const tone = (f, t, dur, vol, type = 'sine', f2, dest) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || out); o.start(t); o.stop(t + dur + 0.05);
      return o;
    };
    const noise = (t, dur, vol, from, to) => {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(out); src.start(t); src.stop(t + dur);
    };
    const brass = (notes, vol) => {
      const t0 = ctx.currentTime + 0.02;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.connect(out);
      notes.forEach(([f, at, dur]) => { tone(f, t0 + at, dur, vol, 'sawtooth', null, lp); tone(f * 1.005, t0 + at, dur, vol * 0.6, 'sawtooth', null, lp); });
    };
    const safe = (fn) => (...a) => { try { ac(); fn(...a); } catch (e) { /* niente audio */ } };
    return {
      tick: safe(() => tone(2400, ctx.currentTime, 0.025, 0.035, 'square')),
      pop: safe(() => tone(420, ctx.currentTime, 0.12, 0.07, 'sine', 880)),
      ding: safe(() => { const t = ctx.currentTime; tone(1318.5, t, 1.1, 0.11); tone(1975.5, t + 0.01, 0.8, 0.04); }),
      whoosh: safe(() => noise(ctx.currentTime, 0.55, 0.09, 350, 3200)),
      up: safe(() => { const t = ctx.currentTime; [659.25, 830.6, 987.8].forEach((f, k) => tone(f, t + k * 0.07, 0.35, 0.07, 'triangle')); }),
      thud: safe(() => tone(120, ctx.currentTime, 0.6, 0.28, 'sine', 42)),
      // Traguardo: piccola fanfara di ottoni
      fanfare: safe(() => brass([[523.25, 0, 0.16], [659.25, 0.15, 0.16], [783.99, 0.3, 0.16], [1046.5, 0.45, 0.9]], 0.09)),
      // Sconfitta: trombone triste
      womp: safe(() => {
        const t0 = ctx.currentTime + 0.02;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(out);
        [[311.1, 0, 0.36], [293.7, 0.38, 0.36], [277.2, 0.76, 0.36]].forEach(([f, at, d]) => tone(f, t0 + at, d, 0.13, 'sawtooth', null, lp));
        const o = tone(261.6, t0 + 1.14, 1.3, 0.13, 'sawtooth', null, lp);
        const lfo = ctx.createOscillator(); const lg = ctx.createGain(); lfo.frequency.value = 6; lg.gain.value = 7;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t0 + 1.3); lfo.stop(t0 + 2.5);
      })
    };
  })();
  window.GALA_SFX = sfx;

  // =================================================================
  // Dati
  // =================================================================
  const SERATE = (window.MXLV_STAGIONE && window.MXLV_STAGIONE.serate) || [];
  const PERSONE = ['Simone Biondo', 'Gianluca Brunello', 'Fabrizio Fontana', 'Filippo Fontanesi', 'Davide Molinaro', 'Mattia Piccinelli', 'Elia Salardi', 'Giacomo Tacconi', 'Lorenzo Vaccari', 'Cesare Zanichelli'];
  const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const CATS = {
    gioco: { e: '🎳', n: 'Giochi e sfide', c: '#8FD3FF' },
    cibo: { e: '🍕', n: 'A tavola', c: '#F5A05E' },
    locali: { e: '🍻', n: 'Locali', c: '#E8C15A' },
    viaggi: { e: '🗺️', n: 'Viaggi', c: '#6FE3D6' },
    partite: { e: '🏟️', n: 'Partite', c: '#7EE0A1' },
    cinema: { e: '🎬', n: 'Cinema', c: '#C79BFF' },
    sport: { e: '🏐', n: 'Sport', c: '#FF8FA3' }
  };
  const PRES = ['✅', '🟠']; const ASS = ['❌', '💀', '👀'];
  const giocate = SERATE.filter((s) => s.k === 'giocata');
  const pct = (s) => { const p = s.s.filter((x) => PRES.includes(x)).length; const a = s.s.filter((x) => ASS.includes(x)).length; return p + a ? (100 * p) / (p + a) : null; };
  const count = (emo) => giocate.reduce((n, s) => n + s.s.filter((x) => x === emo).length, 0);

  // Numeri dell'anno (STIMA a fine stagione: 6 mercoledì ancora da giocare)
  const NUMERI = [
    { v: 48, l: 'mercoledì giocati' },
    { v: 350, l: 'presenze, tutti insieme' },
    { v: 10, l: 'Cene Stirate' },
    { v: 19, l: 'apparizioni di Mister X' },
    { v: 7, l: 'serate al completo' },
    { v: 192, suf: ' ore', l: 'passate insieme', sub: '8 giorni interi, senza dormire', big: true }
  ];

  // Confronto anni (2024 e 2025 dai registri, 2026 con STIMA a fine stagione)
  const ANNI = ['2024', '2025', '2026'];
  const CONFRONTO = [
    { l: 'Serate giocate', v: [43, 49, 48], best: 'max' },
    { l: 'Presenza media', v: [77, 87, 76], suf: '%', best: 'max' },
    { l: 'Serate al completo', v: [5, 8, 7], best: 'max' },
    { l: 'Cene Stirate', v: [null, 12, 10], best: 'max' },
    { l: 'Assenze per lavoro ✈️', v: [7, 21, 18] }
  ];
  const MENSILE = {
    2024: [78, 62, 86, 69, 72, 86, 82, null, 89, 72, 74, 78],
    2025: [72, 97, 89, 75, 94, 90, 88, 73, 92, 90, 92, 95],
    2026: [98, 98, 97, 85, 77, 58, 57, 57, 67, 68, 70, 78] // nov e dic: STIMA
  };

  // Posizioni in classifica per anno (2024 ricalcolata dal registro, 2026 provvisoria)
  const POSIZIONI = {
    'Simone Biondo': [1, 6, 4], 'Gianluca Brunello': [7, 7, 10], 'Fabrizio Fontana': [8, 4, 7], 'Filippo Fontanesi': [6, 10, 8],
    'Davide Molinaro': [3, 3, 2], 'Mattia Piccinelli': [4, 5, 6], 'Elia Salardi': [5, 8, 3], 'Giacomo Tacconi': [null, 2, 1],
    'Lorenzo Vaccari': [2, 1, 5], 'Cesare Zanichelli': [9, 9, 9]
  };
  const SPOTLIGHT = [
    { p: 'Simone Biondo', t: 'Campione 2024, poi 6°. Quest\'anno <b>risale al 4°</b>.', s: 'up' },
    { p: 'Filippo Fontanesi', t: 'Il riscatto: <b>da squalo 2025 a 8°</b>.', s: 'up' },
    { p: 'Lorenzo Vaccari', t: 'La maledizione del campione: <b>da 1° a 5°</b>.', s: 'womp' },
    { p: 'Gianluca Brunello', t: 'Dallo sciopero all\'ultimo posto: <b>da 7° a 10°</b>.', s: 'womp' },
    { p: 'Cesare Zanichelli', t: 'Stessa posizione del 2025, e la seconda serie più lunga dell\'anno: <b>15 di fila</b>.', s: 'ding' },
    { p: 'Davide Molinaro', t: 'Sempre sul podio: <b>3°, 3°, 2°</b>.', s: 'up' },
    { p: 'Elia Salardi', t: 'Il salto dell\'anno: <b>da 8° a 3°</b>.', s: 'fanfare' },
    { p: 'Giacomo Tacconi', t: 'Da 2° a 1°, <b>una sola assenza</b> e 23 mercoledì di fila.', s: 'fanfare' }
  ];

  // =================================================================
  // Utilità
  // =================================================================
  const first = (n) => n.split(' ')[0];
  const live = (el) => el.isConnected;
  const later = (el, ms, fn) => setTimeout(() => { if (live(el)) fn(); }, ms);
  const fmt = (n) => Math.round(n).toLocaleString('it-IT');

  // Contatore che sale fino al valore, con tic e ding finale
  function countUp(node, to, { dur = 1400, end = 'ding' } = {}) {
    const t0 = performance.now(); let lastTick = 0;
    (function frame(now) {
      if (!node.isConnected) return;
      const k = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(to * e);
      if (now - lastTick > 75 && k < 1) { sfx.tick(); lastTick = now; }
      if (k < 1) requestAnimationFrame(frame); else if (end) sfx[end]();
    })(t0);
  }

  const head = (E, id, eyebrow, title) => `<header class="a2-head">${E(id + '.eyebrow', eyebrow, 'div', 'eyebrow accent')}${E(id + '.titolo', title, 'h2')}</header>`;

  return void (window.GALA_ATTO2 = ({ E, esc, avatar }) => {

    // ---------------------------------------------------------------
    // 1. I numeri dell'anno
    // ---------------------------------------------------------------
    const numeri = {
      id: 'numeri', title: 'I numeri dell\'anno', kind: 'a2', steps: NUMERI.length,
      render: () => `<div class="a2 numeri">${head(E, 'numeri', 'La stagione 2026', 'I numeri dell\'anno')}
        <div class="num-grid">${NUMERI.map((n, i) => `<div class="num-tile${n.big ? ' big' : ''}" data-at="${i + 1}">
          <div class="nt-q" aria-hidden="true">?</div>
          <div class="nt-body">
            <div class="nt-val"><span class="nt-n" data-to="${n.v}">${fmt(n.v)}</span>${n.suf ? `<span class="nt-suf">${n.suf}</span>` : ''}</div>
            ${E(`numeri.l${i}`, esc(n.l), 'div', 'nt-lbl')}
            ${n.sub ? E(`numeri.s${i}`, esc(n.sub), 'div', 'nt-sub') : ''}
          </div></div>`).join('')}</div></div>`,
      onEnter: (el, step) => { el.querySelectorAll('.nt-n').forEach((n, i) => { n.textContent = i < step ? fmt(+n.dataset.to) : '0'; }); },
      onStep: (el, step, from) => {
        if (step !== from + 1) { numeri.onEnter(el, step); return; }
        const tile = el.querySelector(`.num-tile[data-at="${step}"]`); const n = tile.querySelector('.nt-n');
        sfx.whoosh();
        later(el, 350, () => countUp(n, +n.dataset.to, { dur: tile.classList.contains('big') ? 2200 : 1300, end: tile.classList.contains('big') ? 'fanfare' : 'ding' }));
      }
    };

    // ---------------------------------------------------------------
    // 2. Catalogo delle serate: calendario, poi per categoria, poi i luoghi
    // ---------------------------------------------------------------
    const CW = 130; const CH = 128;
    const layoutCal = () => {
      const colW = (1720 - 11 * 14) / 12; const per = {};
      return SERATE.map((s) => { const m = s.m - 1; per[m] = (per[m] || 0) + 1; return { x: 100 + m * (colW + 14) + (colW - CW) / 2, y: 300 + (per[m] - 1) * (CH + 12), sc: 1, o: 1 }; });
    };
    const catOrder = Object.keys(CATS).map((k) => ({ k, n: giocate.filter((s) => s.cat === k).length })).sort((a, b) => b.n - a.n);
    const layoutCat = () => {
      const row = {}; catOrder.forEach((c, i) => { row[c.k] = { i, n: 0 }; });
      return SERATE.map((s) => {
        if (s.k !== 'giocata' || !row[s.cat]) return { x: 960 - CW / 2, y: 600, sc: 0.3, o: 0 };
        const r = row[s.cat]; const k = r.n++;
        return { x: 470 + k * 94 - CW * 0.16, y: 262 + r.i * 108 - CH * 0.16, sc: 0.68, o: 1 };
      });
    };
    const LUOGHI = (() => { const m = {}; giocate.forEach((s) => { if (s.p) m[s.p] = (m[s.p] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3); })();
    const layoutPlaces = () => {
      const row = {}; LUOGHI.forEach(([p], i) => { row[p] = { i, n: 0 }; });
      return SERATE.map((s) => {
        if (s.k !== 'giocata' || !s.p || !row[s.p]) return { x: 960 - CW / 2, y: 600, sc: 0.3, o: 0 };
        const r = row[s.p]; const k = r.n++;
        return { x: 900 + k * 168, y: 300 + r.i * 230, sc: 1.15, o: 1 };
      });
    };
    const LAYOUTS = [layoutCal(), layoutCat(), layoutPlaces()];
    const card = (s, i) => {
      const cat = CATS[s.cat]; const pos = LAYOUTS[0][i];
      const st = `--c:${cat ? cat.c : '#7D8590'};transform:translate(${pos.x}px,${pos.y}px)`;
      let inner;
      const top = (e) => `<span class="cc-top"><span class="cc-e">${e}</span><span class="cc-d">${s.d}</span></span>`;
      const cena = s.cena && s.k !== 'neutra';
      if (s.k === 'neutra') inner = `<span class="cc-d">${s.d}</span>`;
      else if (s.k === 'gala') inner = `${top('🎩')}<span class="cc-t">Gran Galà</span>`;
      else if (s.k === 'futura') inner = `${top(cat ? cat.e : '·')}<span class="cc-t">Da giocare</span><span class="cc-c">${esc(first(s.c))}</span>`;
      else inner = `${top(cat.e)}<span class="cc-t">${esc(s.t.replace(/\s+[-@].*$/, '') || s.t)}</span><span class="cc-c">${esc(first(s.c))}</span>`;
      return `<div class="cc k-${s.k}" data-i="${i}" style="${st}">${inner}${cena ? '<span class="cc-cena">🍴</span>' : ''}</div>`;
    };
    const applyLayout = (el, n) => {
      el.querySelectorAll('.cc').forEach((c) => { const p = LAYOUTS[n][+c.dataset.i]; c.style.transform = `translate(${p.x}px,${p.y}px) scale(${p.sc})`; c.style.opacity = p.o; });
      el.querySelector('.cat-stage').dataset.mode = n;
    };
    const catalogo = {
      id: 'catalogo', title: 'Catalogo delle serate', kind: 'a2', steps: 2,
      render: () => `<div class="a2 catalogo">${head(E, 'catalogo', 'La stagione 2026', 'Catalogo delle serate')}
        <div class="cat-stage" data-mode="0">
          <div class="cat-months">${MESI.map((m) => `<span>${m}</span>`).join('')}</div>
          <div class="cat-rows">${catOrder.map((c, i) => `<div class="cat-row" style="top:${262 + i * 108}px"><span class="cr-e">${CATS[c.k].e}</span><span class="cr-n">${CATS[c.k].n}</span><span class="cr-v">${c.n}</span></div>`).join('')}</div>
          <div class="cat-places">${E('catalogo.luoghi', 'I posti del cuore', 'div', 'cp-title')}${LUOGHI.map(([p, n], i) => `<div class="cat-place" style="top:${300 + i * 230}px"><span class="cp-rank">${i + 1}</span><span class="cp-n">${esc(p)}</span><span class="cp-v">${n} volte</span></div>`).join('')}</div>
          ${SERATE.map(card).join('')}
        </div></div>`,
      onEnter: (el, step) => {
        const cards = [...el.querySelectorAll('.cc')];
        if (step > 0) { cards.forEach((c) => c.classList.add('no-anim')); applyLayout(el, step); requestAnimationFrame(() => cards.forEach((c) => c.classList.remove('no-anim'))); return; }
        cards.forEach((c) => c.classList.add('pre'));
        // Le card entrano mese per mese, un pop per mese
        for (let m = 1; m <= 12; m++) {
          later(el, 500 + (m - 1) * 260, () => {
            sfx.pop();
            cards.filter((c) => SERATE[+c.dataset.i].m === m).forEach((c, k) => later(el, k * 55, () => c.classList.remove('pre')));
          });
        }
        later(el, 500 + 12 * 260 + 300, () => sfx.ding());
      },
      onStep: (el, step) => { sfx.whoosh(); applyLayout(el, step); if (step === 2) later(el, 900, () => sfx.up()); }
    };

    // ---------------------------------------------------------------
    // 3. Il registro: il mosaico delle emoji, senza nomi
    // ---------------------------------------------------------------
    const ROW_ORDER = [3, 7, 0, 9, 5, 1, 8, 2, 6, 4]; // righe mescolate: nessuno è riconoscibile
    const cell = (s, r) => {
      if (s.k === 'giocata') { const v = s.s[r]; return `<i class="mc">${v || ''}</i>`; }
      if (s.k === 'gala') return '<i class="mc gala"></i>';
      return `<i class="mc ${s.k}"></i>`;
    };
    const band = (from, to) => {
      const cols = SERATE.slice(from, to);
      return `<div class="mos-band">
        <div class="mos-months">${cols.map((s, k) => `<span>${k === 0 || s.m !== cols[k - 1].m ? MESI[s.m - 1] : ''}</span>`).join('')}</div>
        <div class="mos-grid">${ROW_ORDER.map((r) => cols.map((s, k) => `<span style="--dl:${(from + k) * 55}ms">${cell(s, r)}</span>`).join('')).join('')}</div>
      </div>`;
    };
    const LEGENDA = [['✅', 'Presenze'], ['❌', 'Assenze'], ['✈️', 'Lavoro'], ['🟠', 'Bonus usati']].map(([e, l]) => ({ e, l, v: count(e) }));
    const registro = {
      id: 'registro', title: 'Il registro', kind: 'a2', steps: 0,
      render: () => `<div class="a2 registro">
        <div class="mos">${band(0, 26)}${band(26, 52)}</div>
        <aside class="mos-side">
          ${E('registro.eyebrow', 'La stagione 2026', 'div', 'eyebrow accent')}
          ${E('registro.titolo', 'Il registro', 'h2')}
          ${E('registro.testo', '52 mercoledì, 10 di noi.<br>Niente nomi: conta la forma.', 'p')}
          <ul class="mos-leg">${LEGENDA.map((x) => `<li><span class="ml-e">${x.e}</span><span class="ml-l">${x.l}</span><b class="ml-v" data-to="${x.v}">${x.v}</b></li>`).join('')}</ul>
        </aside></div>`,
      onEnter: (el) => {
        const mos = el.querySelector('.mos'); const vals = [...el.querySelectorAll('.ml-v')];
        mos.classList.add('armed'); vals.forEach((v) => { v.textContent = '0'; });
        later(el, 550, () => {
          mos.classList.add('run');
          let k = 0; const iv = setInterval(() => { if (!live(el) || ++k > 26) { clearInterval(iv); return; } sfx.tick(); }, 110);
        });
        later(el, 550 + 52 * 55 + 500, () => { vals.forEach((v, i) => later(el, i * 250, () => countUp(v, +v.dataset.to, { dur: 1000, end: i === vals.length - 1 ? 'ding' : null }))); });
      }
    };

    // ---------------------------------------------------------------
    // 4. L'andamento: A.R. globale serata per serata, con le tre fasi
    // ---------------------------------------------------------------
    const W = 1720; const H = 560; const PX = 70; const PY = 30;
    const X = (i) => PX + (i / 51) * (W - PX - 20);
    const Y = (v) => PY + (1 - v / 100) * (H - PY - 50);
    const punti = SERATE.map((s, i) => (s.k === 'giocata' ? { i, v: pct(s), s } : null)).filter(Boolean);
    const FASI = [
      { id: 'top', n: 'A.R. Globale Top', a: 0, b: 11, c: '#7EE0A1', s: 'fanfare' },
      { id: 'flop', n: 'A.R. Globale Flop', a: 21, b: 33, c: '#FF6B6B', s: 'womp' },
      { id: 'ris', n: 'Risalita autunnale', a: 34, b: 43, c: '#C6F24E', s: 'up' }
    ].map((f) => { const p = punti.filter((q) => q.i >= f.a && q.i <= f.b); return { ...f, avg: Math.round(p.reduce((n, q) => n + q.v, 0) / p.length) }; });
    const linea = punti.map((p, k) => `${k ? 'L' : 'M'}${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
    const area = `${linea} L${X(punti[punti.length - 1].i).toFixed(1)},${Y(0)} L${X(punti[0].i).toFixed(1)},${Y(0)} Z`;
    const andamento = {
      id: 'andamento', title: 'L\'andamento della stagione', kind: 'a2', steps: FASI.length,
      render: () => `<div class="a2 andamento">${head(E, 'andamento', 'A.R. globale, serata per serata', 'L\'andamento della stagione')}
        <svg class="ar-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
          <defs><linearGradient id="arfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C6F24E" stop-opacity=".28"/><stop offset="1" stop-color="#C6F24E" stop-opacity="0"/></linearGradient></defs>
          ${FASI.map((f, k) => `<g class="fase f-${f.id}" data-at="${k + 1}" style="--fc:${f.c}"><rect x="${X(f.a) - 14}" y="${PY - 10}" width="${X(f.b) - X(f.a) + 28}" height="${H - PY - 40}" rx="18"/></g>`).join('')}
          ${[25, 50, 75, 100].map((v) => `<line class="grid" x1="${PX}" x2="${W - 20}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ylab" x="${PX - 16}" y="${Y(v) + 8}">${v}%</text>`).join('')}
          ${MESI.map((m, k) => { const i = SERATE.findIndex((s) => s.m === k + 1); return `<text class="xlab" x="${X(i)}" y="${H - 8}">${m}</text>`; }).join('')}
          <path class="ar-area" d="${area}" fill="url(#arfill)"/>
          <path class="ar-line" d="${linea}" pathLength="1000"/>
          ${punti.map((p) => `<circle class="ar-dot" cx="${X(p.i)}" cy="${Y(p.v)}" r="7" style="--dl:${(p.i / 51) * 2.2}s"/>`).join('')}
        </svg>
        <div class="fasi-lbl">${FASI.map((f, k) => `<div class="fl f-${f.id}" data-at="${k + 1}" style="--fc:${f.c};left:${X((f.a + f.b) / 2) + 100}px">${E(`andamento.f${k}`, f.n, 'span', 'fl-n')}<b>${f.avg}%</b></div>`).join('')}</div>
      </div>`,
      onEnter: (el, step) => {
        if (step > 0) return;
        const svg = el.querySelector('.ar-chart'); svg.classList.add('armed');
        later(el, 500, () => { svg.classList.add('run'); sfx.whoosh(); });
        later(el, 2900, () => sfx.ding());
      },
      onStep: (el, step, from) => { if (step === from + 1) { const f = FASI[step - 1]; f.id === 'flop' ? sfx.thud() : sfx.whoosh(); later(el, 450, () => sfx[f.s]()); } }
    };

    // ---------------------------------------------------------------
    // 5. Curiosità: card che si girano una alla volta
    // ---------------------------------------------------------------
    const CURIOSITA = [
      { e: '🏆', v: '98%', l: 'Il mese migliore', d: 'Gennaio e febbraio: quasi sempre tutti' },
      { e: '🫠', v: '57%', l: 'Il mese peggiore', d: 'Luglio e agosto: il mercoledì va in vacanza' },
      { e: '🔀', v: '10', l: 'Cambi di turno', d: 'Chiamate passate di mano durante l\'anno' },
      { e: '✈️', v: String(count('✈️')), l: 'Assenze per lavoro', d: 'Il mercoledì perso per colpa del capo' },
      { e: '🟠', v: String(count('🟠')), l: 'Bonus usati', d: 'Giustificazioni spese per salvare la serie' },
      { e: '🎉', v: '9 su 10', l: 'Dopo l\'estate', d: 'Cessare ed Encuentro, le serate più piene dell\'autunno' }
    ];
    const curiosita = {
      id: 'curiosita', title: 'Curiosità', kind: 'a2', steps: CURIOSITA.length,
      render: () => `<div class="a2 curiosita">${head(E, 'curiosita', 'La stagione 2026', 'Curiosità')}
        <div class="cur-grid">${CURIOSITA.map((c, i) => `<div class="cur" data-at="${i + 1}"><div class="cur-in">
          <div class="cur-back" aria-hidden="true">?</div>
          <div class="cur-front"><span class="cur-e">${c.e}</span>${E(`curiosita.v${i}`, esc(c.v), 'b', 'cur-v')}${E(`curiosita.l${i}`, esc(c.l), 'span', 'cur-l')}${E(`curiosita.d${i}`, esc(c.d), 'span', 'cur-d')}</div>
        </div></div>`).join('')}</div></div>`,
      onStep: (el, step, from) => { if (step === from + 1) { sfx.whoosh(); later(el, 380, () => (step === CURIOSITA.length ? sfx.ding() : sfx.pop())); } }
    };

    // ---------------------------------------------------------------
    // 6. Confronto con gli anni passati: tabella di gruppo, poi il grafico mensile
    // ---------------------------------------------------------------
    const CXW = 760; const CXH = 520;
    const cx = (k) => 80 + (k / 11) * (CXW - 110); const cy = (v) => 20 + (1 - (v - 50) / 50) * (CXH - 80);
    const lineaAnno = (a) => { let d = ''; let pen = false; MENSILE[a].forEach((v, k) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${cx(k).toFixed(1)},${cy(v).toFixed(1)} `; pen = true; }); return d; };
    const bestIdx = (r) => { if (!r.best) return -1; const vs = r.v.map((v) => (v == null ? -Infinity : v)); return vs.indexOf(Math.max(...vs)); };
    const confronto = {
      id: 'confronto', title: 'Confronto con gli anni passati', kind: 'a2', steps: CONFRONTO.length + 1,
      render: () => `<div class="a2 confronto">${head(E, 'confronto', 'Tre stagioni di mercoledì', 'Confronto con gli anni passati')}
        <div class="cmp">
          <div class="cmp-table">
            <div class="cmp-row cmp-h"><span></span>${ANNI.map((a) => `<b>${a}</b>`).join('')}</div>
            ${CONFRONTO.map((r, i) => `<div class="cmp-row" data-at="${i + 1}">${E(`confronto.r${i}`, esc(r.l), 'span', 'cmp-l')}${r.v.map((v, k) => `<b class="${k === bestIdx(r) ? 'best' : ''}">${v == null ? '–' : v + (r.suf || '')}</b>`).join('')}</div>`).join('')}
            ${E('confronto.nota', 'Nel 2024 eravamo in 9, Giacomo è arrivato nel 2025.', 'p', 'cmp-note')}
          </div>
          <div class="cmp-chart" data-at="${CONFRONTO.length + 1}">
            ${E('confronto.grafico', 'Presenza media, mese per mese', 'div', 'cmp-ct')}
            <svg viewBox="0 0 ${CXW} ${CXH}" width="${CXW}" height="${CXH}">
              ${[50, 75, 100].map((v) => `<line class="grid" x1="70" x2="${CXW - 20}" y1="${cy(v)}" y2="${cy(v)}"/><text class="ylab" x="60" y="${cy(v) + 7}">${v}%</text>`).join('')}
              ${MESI.map((m, k) => `<text class="xlab" x="${cx(k)}" y="${CXH - 14}">${m}</text>`).join('')}
              ${ANNI.map((a) => `<path class="yl y${a}" d="${lineaAnno(a)}" pathLength="1000"/>`).join('')}
            </svg>
            <div class="cmp-leg">${ANNI.map((a) => `<span class="y${a}"><i></i>${a}</span>`).join('')}</div>
          </div>
        </div></div>`,
      onStep: (el, step, from) => {
        if (step !== from + 1) return;
        if (step <= CONFRONTO.length) { sfx.pop(); if (bestIdx(CONFRONTO[step - 1]) === 2) later(el, 500, () => sfx.up()); }
        else { sfx.whoosh(); later(el, 1800, () => sfx.ding()); }
      }
    };

    // ---------------------------------------------------------------
    // 7. L'andamento di ognuno: figurine con le posizioni nei tre anni
    // ---------------------------------------------------------------
    const py = (p) => 14 + (p - 1) * 8.4;
    const pxs = [36, 130, 224];
    const trend = (p) => (p[1] == null ? 'stabile' : p[2] < p[1] ? 'salita' : p[2] > p[1] ? 'discesa' : 'stabile');
    const TREND_L = { salita: 'In salita', discesa: 'In discesa', stabile: 'Stabile' };
    const figurina = (n, i) => {
      const p = POSIZIONI[n]; const pts = p.map((v, k) => (v == null ? null : [pxs[k], py(v)])).filter(Boolean);
      return `<div class="fig t-${trend(p)}" data-p="${esc(n)}" style="--dl:${i * 90}ms">
        <div class="fig-face">${avatar(n)}</div>
        <div class="fig-name">${esc(first(n))}</div>
        <svg class="fig-chart" viewBox="0 0 260 104" width="260" height="104">
          <line class="fig-base" x1="20" x2="240" y1="${py(1)}" y2="${py(1)}"/><line class="fig-base" x1="20" x2="240" y1="${py(10)}" y2="${py(10)}"/>
          <path class="fig-line" d="${pts.map((q, k) => `${k ? 'L' : 'M'}${q[0]},${q[1]}`).join(' ')}" pathLength="100"/>
          ${pts.map((q) => `<circle cx="${q[0]}" cy="${q[1]}" r="7"/>`).join('')}
        </svg>
        <div class="fig-pos">${p.map((v, k) => `<span${k === 2 ? ' class="now"' : ''}><small>${ANNI[k]}</small>${v == null ? '–' : v + '°'}</span>`).join('')}</div>
        <div class="fig-tag">${TREND_L[trend(p)]}</div>
      </div>`;
    };
    const ognuno = {
      id: 'ognuno', title: 'L\'andamento di ognuno', kind: 'a2', steps: SPOTLIGHT.length,
      render: () => `<div class="a2 ognuno">${head(E, 'ognuno', 'Posizione in classifica, 2024 · 2025 · 2026', 'L\'andamento di ognuno')}
        <div class="fig-grid">${PERSONE.map(figurina).join('')}</div>
        <div class="fig-cap">${SPOTLIGHT.map((s, i) => `<div class="fc" data-k="${i + 1}"><span class="fc-n">${esc(first(s.p))}</span>${E(`ognuno.c${i}`, s.t, 'span', 'fc-t')}</div>`).join('')}</div>
      </div>`,
      onEnter: (el, step) => {
        const grid = el.querySelector('.fig-grid');
        if (step === 0) { grid.classList.add('armed'); later(el, 450, () => grid.classList.add('run')); PERSONE.forEach((_, i) => later(el, 450 + i * 90, () => sfx.pop())); }
        ognuno.onStep(el, step, step);
      },
      onStep: (el, step, from) => {
        const sp = SPOTLIGHT[step - 1];
        el.querySelector('.fig-grid').classList.toggle('spot', !!sp);
        el.querySelectorAll('.fig').forEach((f) => f.classList.toggle('on', !!sp && f.dataset.p === sp.p));
        el.querySelectorAll('.fc').forEach((c) => c.classList.toggle('on', +c.dataset.k === step));
        if (sp && step === from + 1) { sfx.whoosh(); later(el, 400, () => sfx[sp.s]()); }
      }
    };

    return [numeri, catalogo, registro, andamento, curiosita, confronto, ognuno];
  });
})();

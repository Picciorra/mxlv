// Gran Galà MXLV: motore della presentazione.
// Le slide sono definite in SLIDES. Ogni slide ha un titolo (lo vede anche il telecomando),
// un numero di step (click dentro la stessa slide) e una funzione che la disegna.
// Telecomando e votazioni passano da Supabase: serve il PIN regia, inserito all'avvio.
(() => {
  'use strict';

  const SB_URL = 'https://kzxufyulcxsocvtdvget.supabase.co';
  const SB_KEY = 'sb_publishable_f046qLhQ1n5Wqu3DKkwGDA_1kFCdSc_';
  const APP_GALA_URL = 'https://picciorra.github.io/mxlv/#gala';
  const PIN_STORE = 'mxlv-regia-pin';
  const POS_STORE = 'mxlv-gala-pos';
  const SEASON_START = new Date(2026, 0, 7); // primo mercoledì della stagione

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const firstName = (n) => n.split(' ')[0];
  const slug = (n) => firstName(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const initials = (n) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const avatar = (name) => `<img src="img/foto/${slug(name)}.jpg?v=2" alt="" onerror="this.outerHTML='<span class=&quot;initials&quot;>${esc(initials(name))}</span>'">`;
  const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* niente */ } }
  };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // I 10 del registro, per le votazioni con i nomi (es. MVP)
  const REMBRANDTS = ['Simone', 'Gianluca', 'Fabrizio', 'Filippo', 'Davide', 'Mattia', 'Elia', 'Giacomo', 'Lorenzo', 'Cesare'];

  // ===================================================================
  // Slide
  // ===================================================================

  const cover = () => {
    const weeks = Math.min(52, Math.floor((Date.now() - SEASON_START) / (7 * 864e5)) + 1);
    const ticks = Array.from({ length: 52 }, (_, i) => `<div class="tick${i < weeks ? ' played' : ''}" style="--i:${i}"></div>`).join('');
    return `<div class="glow" aria-hidden="true"></div>
    <div class="inner">
      <div class="eyebrow">I Rembrandts presentano</div>
      <div>
        <h1>Gran Galà<span class="l2">MXLV 2026</span></h1>
        <div class="sub"><span>Mercoledì x la Vita</span><span class="dot" aria-hidden="true"></span><span>23 dicembre 2026</span></div>
      </div>
      <div class="season">
        <div class="ticks" aria-hidden="true">${ticks}</div>
        <div class="legend"><span>Gennaio</span><span>52 mercoledì, una stagione</span><span>Dicembre</span></div>
      </div>
    </div>`;
  };

  const divider = (num, title) => () => `<div class="inner"><div class="num">${esc(num)}</div><h2>${esc(title)}</h2><div class="bar"></div></div>`;

  const todo = (act, title, note) => () => `<div class="inner">
    <div class="eyebrow accent">${esc(act)}</div>
    <h2>${esc(title)}</h2>
    <span class="tag">Da preparare</span>
    ${note ? `<p>${esc(note)}</p>` : ''}
  </div>`;

  const video = (src, label) => () => `<video src="${src}" playsinline preload="auto"></video>
    <div class="missing" hidden><b>${esc(label)}</b><span>Manca il file video: va caricato in <code>${esc(src)}</code></span></div>`;

  const SLIDES = [
    // Atto 1 - Apertura
    { title: 'Copertina', kind: 'cover', render: cover },
    { title: 'Inno ufficiale', kind: 'video', black: true, render: video('gala/media/inno.mp4', 'Inno ufficiale') },
    { title: 'Brindisi ai Rembrandts', kind: 'cover', render: cover },

    // Atto 2 - La stagione
    { title: 'Atto 2 - La stagione', kind: 'divider', render: divider('Atto 2', 'La stagione') },
    { title: 'I numeri dell\'anno', kind: 'todo', render: todo('La stagione', 'I numeri dell\'anno', 'Serate giocate, presenze totali, Cene Stirate, Mister X. Niente AR né posizioni.') },
    { title: 'Catalogo delle serate', kind: 'todo', render: todo('La stagione', 'Catalogo delle serate') },
    { title: 'Statistiche', kind: 'todo', render: todo('La stagione', 'Statistiche', 'L\'Età dell\'Oro, il Grande Crollo estivo e le altre curiosità.') },
    { title: 'Confronto con gli anni passati', kind: 'todo', render: todo('La stagione', 'Confronto con gli anni passati', '2024, 2025 e 2026 a livello di gruppo.') },

    // Atto 3 - Oscar
    { title: 'Atto 3 - Oscar del Mercoledì', kind: 'divider', render: divider('Atto 3', 'Oscar del Mercoledì') },
    { title: 'Oscar', kind: 'todo', render: todo('Oscar del Mercoledì', 'Gli Oscar', 'Pifferaio Magico, Frequent Flyer, Club degli Assenti, Serate Intime, Inseparabili, Sconosciuti, Undicesimo Uomo, più un Oscar nuovo al posto del Game Master.') },

    // Atto 4 - L'app
    { title: 'La grande novità', kind: 'keynote', black: true, steps: 4, render: () => `
      <div class="lines">
        <p class="kl small" data-at="1">Prima di andare avanti.</p>
        <p class="kl" data-at="2">Quest'anno c'è stata <em>una grande novità</em>.</p>
        <p class="kl" data-at="3">Ma non vi dico cos'è.</p>
      </div>
      <div class="mystery" data-at="4" aria-hidden="true"><span>?</span></div>
      <div class="mystery-cap" data-at="4">Spegnete le luci</div>` },
    { title: 'Video dell\'app MXLV', kind: 'video', black: true, render: video('gala/media/app-showcase.mp4', 'L\'app MXLV') },
    { title: 'Come si vota', kind: 'howto', render: () => `<div class="inner">
      <div>
        <h2>Tirate fuori il telefono</h2>
        <ol>
          <li><span>Apri l'app MXLV, <b>Utility</b>, <b>Gran Galà</b></span></li>
          <li><span>Scegli il tuo nome, una volta sola</span></li>
          <li><span>Quando compare la domanda, vota</span></li>
        </ol>
      </div>
      <div class="qr-box"><div class="qr" id="qr"></div><span>picciorra.github.io/mxlv</span></div>
    </div>` },
    { title: 'Votazione di prova', kind: 'poll', poll: { q: 'Siete pronti a votare?', options: ['Sì', 'Sì, ma ho già bevuto', 'Non ho capito niente'] } },
    { title: 'Votazioni sul regolamento', kind: 'todo', render: todo('Votazioni', 'Votazioni sul regolamento', 'Le domande le scrive Mattia: regolamento del mercoledì e gioco in generale. Una slide di voto per domanda.') },
    { title: 'Fuori Gianluca? Dentro Peppe?', kind: 'todo', render: todo('Votazioni', 'Fuori Gianluca? Dentro Peppe?') },

    // Atto 5 - Rembrandt Awards
    { title: 'Passaggio a Davide', kind: 'handoff', render: () => `<div class="inner">
      <div class="face">${avatar('Davide Molinaro')}</div>
      <h2>Signore e signori,<br><span>Davide Molinaro</span></h2>
    </div>` },
    { title: 'Atto 5 - Rembrandt Awards', kind: 'divider', render: divider('Atto 5', 'Rembrandt Awards') },
    { title: 'Rembrandt Awards', kind: 'todo', render: todo('Rembrandt Awards', 'Le categorie', 'Vincitori decisi prima, la slide fa solo nomination e rivelazione. Qui vanno anche lo sciopero di Malese e Mykonos.') },
    { title: 'Manu Rap', kind: 'todo', render: todo('Rembrandt Awards', 'Manu Rap', 'Base e temi del rap.') },
    { title: 'MVP della stagione', kind: 'poll', hideLive: true, people: true, poll: { q: 'Chi è l\'MVP della stagione?', options: REMBRANDTS } },

    // Atto 6 - Premiazione
    { title: 'Atto 6 - Premiazione', kind: 'divider', render: divider('Atto 6', 'La classifica') },
    { title: 'Premiazione', kind: 'todo', render: todo('Premiazione', 'Dal decimo al primo', 'Squalo, patatine, battaglia dall\'8° al 4°, podio con FE!N sul drop.') },

    // Atto 7 - Fioretti
    { title: 'Atto 7 - Fioretti', kind: 'divider', render: divider('Atto 7', 'I fioretti') },
    { title: 'Fioretti', kind: 'todo', render: todo('Fioretti', 'Mr. Consistenza, Mr. Tarallo e i fioretti 2027') },

    // Chiusura
    { title: 'Riepilogo delle votazioni', kind: 'recap', render: () => `<div class="inner"><h2>Cosa abbiamo deciso</h2><div class="recap-list" id="recap"></div></div>` },
    { title: 'Chiusura', kind: 'end', render: () => `<div class="inner"><div class="eyebrow accent">Stagione 2026, chiusa</div><h2>Ci vediamo<br><span>mercoledì.</span></h2><p>Buon Natale, Rembrandts.</p></div>` }
  ];
  SLIDES.forEach((s, i) => { s.index = i; s.steps = s.steps || (s.kind === 'poll' ? 1 : 0); });

  // ===================================================================
  // Stato e collegamento
  // ===================================================================

  const stage = document.getElementById('stage');
  const st = { i: 0, step: 0, pin: '', linked: false, active: false, sb: null, voters: [], polls: [], votes: [], lastSeq: null, el: null };
  st.session = Math.random().toString(36).slice(2) + Date.now().toString(36);

  // Nome del dispositivo, per far sapere al telefono dove gira la presentazione
  function deviceLabel() {
    const ua = navigator.userAgent;
    const os = /iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1 ? 'iPad'
      : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android'
      : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows'
      : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'Computer';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
    return `${os}, ${br}`;
  }

  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  addEventListener('resize', fit); fit();

  const sb = () => st.sb || (st.sb = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null);
  const pollRow = (slide) => slide.poll && st.polls.find((p) => p.question === slide.poll.q);

  async function checkPin(pin) {
    const c = sb(); if (!c) return false;
    const { data, error } = await c.rpc('regia_check', { p_key: pin });
    return !error && data === true;
  }

  async function loadData() {
    const c = sb(); if (!c) return;
    const [v, p, vt, r] = await Promise.all([
      c.from('voters').select('name').order('ord'),
      c.from('polls').select('id,question,options,status'),
      c.from('votes').select('poll_id,voter,choice'),
      c.from('gala_remote').select('seq').eq('id', 1).maybeSingle()
    ]);
    if (!v.error) st.voters = v.data.map((x) => x.name);
    if (!p.error) st.polls = p.data;
    if (!vt.error) st.votes = vt.data;
    if (!r.error && r.data && st.lastSeq === null) st.lastSeq = r.data.seq;
  }

  // Le domande vivono nelle slide: quelle che mancano nel database vengono create all'avvio.
  async function syncPolls() {
    if (!st.linked) return;
    const missing = SLIDES.filter((s) => s.poll && !pollRow(s));
    for (const s of missing) {
      await sb().rpc('regia_create', { p_key: st.pin, p_question: s.poll.q, p_options: s.poll.options, p_ord: s.index });
    }
    if (missing.length) await loadData();
  }

  function subscribe() {
    const c = sb(); if (!c) return;
    c.channel('presentazione-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, onPolls)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, onVotes)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gala_remote' }, (e) => onRemote(e.new))
      .subscribe((status) => setLink(status === 'SUBSCRIBED' ? (st.active || !st.linked ? 'on' : '') : (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') ? 'err' : ''));
  }

  async function onPolls() {
    const { data, error } = await sb().from('polls').select('id,question,options,status');
    if (error) return;
    const cur = SLIDES[st.i];
    const before = pollRow(cur);
    st.polls = data;
    const after = pollRow(cur);
    if (cur.kind === 'poll') {
      if (before && after && before.status !== 'closed' && after.status === 'closed') { st.step = 1; reveal(); }
      else if (after && after.status === 'open' && st.step === 1) { st.step = 0; }
      paintPoll();
      reportState();
    }
    if (cur.kind === 'recap') paintRecap();
  }
  async function onVotes() {
    const { data, error } = await sb().from('votes').select('poll_id,voter,choice');
    if (error) return;
    st.votes = data;
    const cur = SLIDES[st.i];
    if (cur.kind === 'poll') paintPoll();
    if (cur.kind === 'recap') paintRecap();
  }
  function onRemote(row) {
    if (!row) return;
    if (st.active && row.session && row.session !== st.session) loseControl(row.device);
    if (!st.active) { st.lastSeq = row.seq; return; }
    if (st.lastSeq === null) { st.lastSeq = row.seq; return; }
    if (row.seq <= st.lastSeq) return;
    st.lastSeq = row.seq;
    const cmd = row.cmd || '';
    if (cmd === 'next') next();
    else if (cmd === 'prev') prev();
    else if (cmd === 'first') go(0);
    else if (cmd.startsWith('goto:')) go(+cmd.slice(5));
  }

  async function claim() {
    if (!st.linked) return;
    const { data, error } = await sb().rpc('regia_claim', { p_key: st.pin, p_session: st.session, p_device: deviceLabel() });
    if (error || data !== true) { setLink('err'); return; }
    st.active = true;
    document.getElementById('taken').hidden = true;
    reportState();
  }

  function loseControl(device) {
    st.active = false;
    document.getElementById('taken-dev').textContent = device || 'un altro dispositivo';
    document.getElementById('taken').hidden = false;
    setLink('');
  }

  function reportState() {
    if (!st.linked || !st.active) return;
    const s = SLIDES[st.i];
    const n = SLIDES[st.i + 1];
    const row = pollRow(s);
    let title = s.title;
    if (s.steps) title += ` (${st.step}/${s.steps})`;
    sb().rpc('regia_state', { p_key: st.pin, p_session: st.session, p_slide: st.i, p_total: SLIDES.length, p_title: title, p_next: n ? n.title : 'Fine', p_poll: row ? row.id : null })
      .then(({ data, error }) => { if (!error && data === false && st.active) loseControl(''); }, () => {});
  }

  function setLink(cls) {
    const el = document.getElementById('hud-link');
    el.className = 'hud-link' + (cls ? ' ' + cls : '');
    el.title = cls === 'on' ? 'Collegata al telecomando' : cls === 'err' ? 'Collegamento perso' : 'Non collegata';
  }

  // ===================================================================
  // Votazioni
  // ===================================================================

  function renderPoll(s) {
    const many = s.poll.options.length > 5;
    return `<div class="inner">
      <div class="vote-head">
        <span class="live"><span class="ldot" aria-hidden="true"></span><span class="live-txt">Votazione aperta</span></span>
        <span class="count"><b class="n">0</b> su <span class="tot">${st.voters.length || 10}</span> hanno votato</span>
      </div>
      <h2 class="question">${esc(s.poll.q)}</h2>
      <div class="opts${many ? ' many' : ''}">
        ${s.poll.options.map((o, i) => `<div class="opt" data-i="${i}"><div class="bar"></div>${s.people ? `<span class="oface">${avatar(o)}</span>` : ''}<span class="lbl">${esc(o)}</span><span class="win-badge">Vince</span><span class="pct">0%</span><span class="num">0</span></div>`).join('')}
      </div>
      <div class="vote-foot">
        <div class="voters">${(st.voters.length ? st.voters : []).map((v) => `<div class="voter" data-v="${esc(v)}" title="${esc(firstName(v))}">${avatar(v)}</div>`).join('')}</div>
        <div class="vote-note"></div>
      </div>
    </div>
    <canvas class="fx" width="1920" height="1080" aria-hidden="true"></canvas>`;
  }

  function tally(row) {
    const counts = row ? row.options.map(() => 0) : [];
    const mine = row ? st.votes.filter((v) => v.poll_id === row.id) : [];
    mine.forEach((v) => { if (counts[v.choice] !== undefined) counts[v.choice]++; });
    return { counts, voters: mine.map((v) => v.voter), n: mine.length };
  }

  function paintPoll() {
    const s = SLIDES[st.i];
    const el = st.el;
    if (!el || s.kind !== 'poll') return;
    const row = pollRow(s);
    const { counts, voters, n } = tally(row);
    const status = row ? row.status : 'none';
    const closed = status === 'closed';
    const max = Math.max(0, ...counts);
    el.classList.toggle('closed', closed);
    el.classList.toggle('waiting', status === 'draft' || status === 'none');
    el.classList.toggle('hidden-live', !!s.hideLive);
    el.querySelector('.live-txt').textContent = closed ? 'Votazione chiusa' : status === 'open' ? 'Votazione aperta' : 'In attesa';
    el.querySelector('.n').textContent = n;
    el.querySelector('.tot').textContent = st.voters.length || 10;
    el.querySelectorAll('.opt').forEach((o, i) => {
      const c = counts[i] || 0;
      o.querySelector('.bar').style.width = (n ? c / n * 100 : 0) + '%';
      o.querySelector('.num').textContent = c;
      o.querySelector('.pct').textContent = (n ? Math.round(c / n * 100) : 0) + '%';
      const win = closed && n > 0 && c === max;
      o.classList.toggle('winner', win);
      o.classList.toggle('loser', closed && !win);
    });
    el.querySelectorAll('.voter').forEach((v) => v.classList.toggle('in', voters.includes(v.dataset.v)));
    const note = el.querySelector('.vote-note');
    note.textContent = !st.linked ? 'Non collegata: inserisci il PIN regia per aprire la votazione.'
      : !st.active ? 'La regia è su un altro dispositivo.'
      : !row ? 'Domanda non ancora nel database.'
      : s.hideLive && !closed ? 'I risultati compaiono alla chiusura.' : '';
  }

  async function enterPoll(s) {
    const row = pollRow(s);
    if (!row) { paintPoll(); return; }
    if (row.status === 'closed') { st.step = 1; paintPoll(); return; }
    if (row.status === 'draft' && st.active && st.step === 0) {
      await sb().rpc('regia_open', { p_key: st.pin, p_poll: row.id });
      row.status = 'open';
    }
    paintPoll();
  }

  async function closePoll(s) {
    const row = pollRow(s);
    if (!row || row.status !== 'open') { paintPoll(); return; }
    row.status = 'closed';
    paintPoll(); reveal();
    if (st.active) await sb().rpc('regia_close', { p_key: st.pin, p_poll: row.id });
  }

  function reveal() {
    const el = st.el; if (!el) return;
    el.classList.remove('reveal'); void el.offsetWidth; el.classList.add('reveal');
    if (reduced()) return;
    const canvas = el.querySelector('canvas.fx'); const win = el.querySelector('.opt.winner');
    if (!canvas || !win) return;
    const ctx = canvas.getContext('2d');
    const sr = stage.getBoundingClientRect(), wr = win.getBoundingClientRect();
    const k = 1080 / sr.height;
    const y = (wr.top + wr.height / 2 - sr.top) * k;
    const x0 = (wr.left - sr.left) * k, x1 = (wr.right - sr.left) * k;
    const cols = ['#C6F24E', '#F3F5F7', '#E8C15A', '#3DDC84'];
    const ps = Array.from({ length: 170 }, () => ({
      x: x0 + Math.random() * (x1 - x0), y, vx: (Math.random() - .5) * 14, vy: -Math.random() * 22 - 6,
      s: 8 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[Math.floor(Math.random() * cols.length)]
    }));
    let t = 0;
    (function frame() {
      ctx.clearRect(0, 0, 1920, 1080);
      ps.forEach((p) => {
        p.vy += .6; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      });
      if (++t < 150) requestAnimationFrame(frame); else ctx.clearRect(0, 0, 1920, 1080);
    })();
  }

  function paintRecap() {
    const box = document.getElementById('recap'); if (!box) return;
    const items = SLIDES.filter((s) => s.poll).map((s) => {
      const row = pollRow(s);
      if (!row || row.status !== 'closed') return null;
      const { counts, n } = tally(row);
      if (!n) return { q: s.poll.q, a: 'Nessun voto', none: true, n: 0 };
      const max = Math.max(...counts);
      const top = row.options.filter((_, i) => counts[i] === max);
      return { q: s.poll.q, a: top.length > 1 ? 'Pareggio tra ' + top.join(' e ') : top[0], n };
    }).filter(Boolean);
    box.innerHTML = items.length
      ? items.map((it) => `<div class="recap-item"><span class="q">${esc(it.q)}</span><span class="a${it.none ? ' none' : ''}">${esc(it.a)}</span>${it.n ? `<span class="n">${it.n} voti</span>` : ''}</div>`).join('')
      : '<p class="recap-empty">Nessuna votazione chiusa, per ora.</p>';
  }

  // ===================================================================
  // Navigazione
  // ===================================================================

  function applySteps() {
    const s = SLIDES[st.i]; const el = st.el; if (!el) return;
    if (s.kind === 'keynote') {
      el.querySelectorAll('[data-at]').forEach((x) => {
        const at = +x.dataset.at;
        const isLine = x.classList.contains('kl');
        x.classList.toggle('show', st.step >= at && !(isLine && st.step >= 4));
        x.classList.toggle('gone', isLine && st.step >= 4);
      });
    }
  }

  function show(i, step = 0, dir = 1) {
    const prevSlide = SLIDES[st.i];
    if (prevSlide && prevSlide.kind === 'video' && st.el) { const v = st.el.querySelector('video'); if (v) v.pause(); }
    // Andando avanti oltre una votazione aperta, la votazione si chiude.
    if (dir > 0 && prevSlide && prevSlide.kind === 'poll' && st.i !== i) {
      const row = pollRow(prevSlide);
      if (row && row.status === 'open' && st.active) { row.status = 'closed'; sb().rpc('regia_close', { p_key: st.pin, p_poll: row.id }); }
    }
    st.i = Math.max(0, Math.min(SLIDES.length - 1, i));
    st.step = step;
    const s = SLIDES[st.i];
    // Prima esce la slide vecchia, poi entra la nuova: mai due slide visibili insieme.
    // Se si va avanti veloce, quelle ancora in uscita spariscono subito.
    stage.querySelectorAll('.slide').forEach((o) => {
      o.querySelectorAll('video, audio').forEach((m) => { try { m.pause(); m.removeAttribute('src'); m.load(); } catch (e) { /* niente */ } });
      if (o.classList.contains('leaving')) { o.remove(); return; }
      o.classList.remove('in');
      o.classList.add('leaving');
      setTimeout(() => o.remove(), 400);
    });
    const el = document.createElement('section');
    el.className = `slide ${s.kind}${s.kind === 'poll' ? ' vote' : ''}${s.black ? ' black' : ''}`;
    el.setAttribute('aria-label', s.title);
    el.innerHTML = s.kind === 'poll' ? renderPoll(s) : s.render();
    stage.appendChild(el);
    st.el = el;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));

    if (s.kind === 'video') {
      const v = el.querySelector('video');
      v.addEventListener('error', () => { v.hidden = true; el.querySelector('.missing').hidden = false; });
      setTimeout(() => { if (st.el === el) v.play().catch(() => {}); }, 350);
    }
    if (s.kind === 'howto' && window.QRCode) {
      // eslint-disable-next-line no-new
      new window.QRCode(el.querySelector('#qr'), { text: APP_GALA_URL, width: 420, height: 420, colorDark: '#0D0F12', colorLight: '#ffffff' });
    }
    if (s.kind === 'poll') enterPoll(s).then(reportState);
    if (s.kind === 'recap') paintRecap();
    applySteps();
    syncJump();
    store.set(POS_STORE, String(st.i));
    if (s.kind !== 'poll') reportState();
  }

  function next() {
    const s = SLIDES[st.i];
    if (st.step < s.steps) {
      st.step++;
      if (s.kind === 'poll' && st.step === 1) closePoll(s);
      applySteps(); reportState();
    } else if (st.i < SLIDES.length - 1) show(st.i + 1, 0, 1);
  }
  function prev() {
    const s = SLIDES[st.i];
    if (st.step > 0 && s.kind !== 'poll') { st.step--; applySteps(); reportState(); }
    else if (st.i > 0) { const p = SLIDES[st.i - 1]; show(st.i - 1, p.kind === 'poll' ? 0 : p.steps, -1); }
  }
  function go(i) { if (i >= 0 && i < SLIDES.length) show(i, 0, i > st.i ? 1 : -1); }

  // ===================================================================
  // Controlli
  // ===================================================================

  const jump = document.getElementById('hud-jump');
  jump.innerHTML = SLIDES.map((s, i) => `<option value="${i}">${i + 1}. ${esc(s.title)}</option>`).join('');
  jump.addEventListener('change', () => { go(+jump.value); jump.blur(); });
  function syncJump() { jump.value = String(st.i); }

  document.getElementById('hud-next').addEventListener('click', next);
  document.getElementById('hud-prev').addEventListener('click', prev);
  function toggleFs() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    } catch (e) { /* niente */ }
  }
  document.getElementById('hud-fs').addEventListener('click', toggleFs);

  addEventListener('keydown', (e) => {
    if (!document.getElementById('start').hidden) return;
    if (e.target.closest && e.target.closest('select, input')) return;
    const k = e.key.toLowerCase();
    if (['arrowright', 'arrowdown', ' ', 'pagedown', 'enter'].includes(k)) { e.preventDefault(); next(); }
    else if (['arrowleft', 'arrowup', 'pageup', 'backspace'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'f') toggleFs();
    else if (k === 'home') go(0);
  });
  stage.addEventListener('click', () => { if (document.getElementById('start').hidden) next(); });

  let idle;
  const wake = () => {
    document.body.classList.add('awake'); stage.classList.remove('cursorless');
    clearTimeout(idle);
    idle = setTimeout(() => { document.body.classList.remove('awake'); stage.classList.add('cursorless'); }, 2500);
  };
  addEventListener('mousemove', wake);
  addEventListener('touchstart', wake, { passive: true });

  // ===================================================================
  // Avvio
  // ===================================================================

  const startEl = document.getElementById('start');
  const pinEl = document.getElementById('pin');
  const msg = document.getElementById('start-msg');
  const goBtn = document.getElementById('start-go');
  pinEl.value = store.get(PIN_STORE);

  async function begin(withPin) {
    goBtn.disabled = true;
    msg.classList.remove('err');
    if (withPin) {
      const pin = pinEl.value.trim();
      msg.textContent = 'Controllo il PIN...';
      let ok = false;
      try { ok = await checkPin(pin); } catch (e) { ok = false; }
      if (!ok) {
        goBtn.disabled = false;
        msg.textContent = 'PIN sbagliato o connessione assente. Riprova, oppure continua senza collegamento.';
        msg.classList.add('err');
        return;
      }
      st.pin = pin; st.linked = true; store.set(PIN_STORE, pin);
    }
    toggleFs();
    startEl.hidden = true;
    try { await loadData(); await syncPolls(); subscribe(); await claim(); } catch (e) { setLink('err'); }
    if (st.linked) {
      setInterval(reportState, 20000);
      addEventListener('pagehide', () => {
        if (!st.active) return;
        try {
          fetch(SB_URL + '/rest/v1/rpc/regia_bye', {
            method: 'POST', keepalive: true,
            headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
            body: JSON.stringify({ p_key: st.pin, p_session: st.session })
          });
        } catch (e) { /* niente */ }
      });
    }
    const saved = parseInt(store.get(POS_STORE), 10);
    show(Number.isFinite(saved) && saved > 0 && saved < SLIDES.length ? saved : 0);
  }
  document.getElementById('taken-go').addEventListener('click', claim);
  goBtn.addEventListener('click', () => begin(true));
  pinEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') begin(true); });
  document.getElementById('start-skip').addEventListener('click', () => begin(false));
})();

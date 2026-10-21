/* TT Chess: the menu, the game, the HUD, input and the main loop.
   Screens: home (PLAY or LEARN; 1 or 2 players, who you are, Foxy's level, undo on or off), play, the promotion
   picker, game over, pause, and LEARN (js/learn.js). In 1 player you're Teddy (blue) or Tommy (orange) against Foxy 🦊,
   the CPU friend, who plays the other colour: 🐣 EASY (the default), 🔥 NORMAL or 🧠 HARD. Your brother isn't the CPU:
   he's the one you call for help (js/buddy.js). In 2 players Teddy and Tommy take turns on one device.
   White moves first, and the boys take turns at being White: you're White in the first game, then it swaps every
   game. Your pieces are always nearest you (F turns the board round). The score keeps running until you change the
   setup. window.game is a test hook: see the README. */
(function () {
  'use strict';
  const CH = window.CH;
  const ST = CH.stage;
  const S = Kit.sound;
  const $ = (id) => document.getElementById(id);
  const { rand } = Kit.gfx;
  const BLUE = 0, ORANGE = 1;
  const { W: WHITE } = CH;

  const KEY = 'chessTT.v1';
  const SCALE = 0.9; // the boys beside the board
  const LEVELS = ['easy', 'normal', 'hard'];
  const THINK = { easy: [0.8, 1.2], normal: [0.6, 1.0], hard: [0.25, 0.45] }; // Foxy's least thinking time (s)
  const SLICE = { easy: 8, normal: 9, hard: 12, hint: 6 };                    // search time per frame (ms)

  const prefs = Object.assign({ players: 1, who: 'teddy', levels: { teddy: 'easy', tommy: 'easy' }, undo: true, done: {} }, load());
  const G = {
    state: 'boot', mode: 'game', players: 1, level: 'easy', sides: null, kidC: BLUE, white: BLUE, g: null,
    wins: [0, 0], draws: 0, setupKey: '', sel: -1, cursor: -1, busy: false, turnId: 0, job: null, cpuT: -1,
    waitT: -1, endT: -1, panelT: -1, held: false, last: 0, auto: false, autoLevel: 'normal', demo: null, result: null,
    wide: true, flip: false, promo: null, hintJob: null, hintTurn: -1, hint: null, pausedFrom: null, thinkMs: 0,
  };
  const actors = [CH.makeActor(), CH.makeActor()]; // by colour
  const badges = [];
  let ui = null, flyers = null, bursts = null, art = null, pieceArt = null;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch (e) { /* private mode */ }
  }
  const levelFor = (who) => (prefs.levels && LEVELS.includes(prefs.levels[who]) && prefs.levels[who]) || 'easy';

  // ---------------------------------------------------------------- who's at the board

  const nameOf = (id) => Kit.roster.get(id).name;
  // sides[colour]: sides[0] plays blue (Teddy's colour), sides[1] orange (Tommy's)
  function makeSides(players, who) {
    if (players === 2) return [{ id: 'teddy', colour: BLUE, human: true }, { id: 'tommy', colour: ORANGE, human: true }];
    const mine = who === 'tommy' ? ORANGE : BLUE;
    const out = [];
    out[mine] = { id: who, colour: mine, human: true };
    out[1 - mine] = { id: 'foxy', colour: 1 - mine, human: false };
    return out;
  }
  // engine side (CH.W / CH.B) ↔ colour
  const colourOf = (side) => (side === WHITE ? G.white : 1 - G.white);
  const sideOfColour = (c) => (c === G.white ? WHITE : CH.B);
  const current = () => (G.g && G.sides ? G.sides[colourOf(G.g.pos.turn)] : null);
  const kid = () => G.sides[G.kidC];
  const listFor = (g) => CH.pieces(g).map((p) => ({ sq: p.sq, colour: colourOf(p.side), type: p.type }));

  function setActors() {
    G.sides.forEach((s, c) => {
      const a = actors[c];
      if (!a.entry || a.entry.id !== s.id) a.set(s.id, SCALE);
      s.actor = a;
      a.visible = true;
      setBadge(c);
    });
    CH.buddy.setFor(kid().id === 'foxy' ? 'teddy' : kid().id);
  }

  // the ♟ that bobs over the head of whoever's turn it is, in his colour
  function badgeTexture(c) {
    const [cv, g] = Kit.gfx.makeCanvas(128, 128);
    g.fillStyle = ST.COL[c];
    g.beginPath();
    g.arc(64, 64, 54, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.lineWidth = 5;
    g.strokeStyle = '#14121f';
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.stroke();
    g.font = `60px ${Kit.gfx.EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('♟️', 64, 68);
    return Kit.gfx.toTexture(cv);
  }
  function setBadge(c) {
    if (badges[c]) return;
    badges[c] = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(c), depthTest: false, transparent: true }));
    badges[c].renderOrder = 23;
    badges[c].scale.setScalar(0.6);
    ST.scene.add(badges[c]);
  }

  // ---------------------------------------------------------------- layout

  function layout() {
    ST.resize();
    CH.fx.overlay.resize();
    const W = ST.W, H = ST.H;
    if (W < 2 || H < 2 || !ui) return;
    const wide = W / H >= 1.15;
    G.wide = wide;
    ST.nearColour = G.kidC;
    const sp = ST.layout(wide, G.kidC);
    const az = G.flip ? Math.PI : 0;
    // the kit's round ? and language buttons sit on the left edge: keep the board and the boys clear of them
    const kitL = 62;
    const m = { l: kitL, r: 12, t: 12, b: 12 };
    if (G.state === 'home') {
      if (wide) m.r = W * 0.54 + 10;
      else {
        m.b = H * 0.6 + 6;
        m.t = 8;
      }
    } else if (G.mode === 'lesson') {
      const bar = ui.lessonBar.getBoundingClientRect();
      m.t = bar.bottom + 8;
      const call = ui.callBtn.getBoundingClientRect();
      if (!wide) m.b = Math.max(12, H - call.top + 4);
      else m.r = Math.max(12, W - call.left + 4);
    } else {
      document.documentElement.style.setProperty('--toolsw', wide ? `${ui.tools.offsetWidth + 10}px` : '0px');
      const top = ui.hudtop.getBoundingClientRect();
      m.t = top.bottom + 6;
      const call = ui.callBtn.getBoundingClientRect();
      if (!wide) m.b = Math.max(12, H - Math.min(call.top, ui.tools.getBoundingClientRect().top) + 4);
      else m.r = Math.max(12, W - call.left + 4);
    }
    // a phone on its side is short: look down more steeply so the squares stay big
    const elev = wide ? (H < 500 ? 1.2 : 1.0) : 1.12;
    ST.fit(ST.framePoints(G.state !== 'home', SCALE), elev, az, m);
    // the boys face the camera, turned a little toward the board
    const cp = ST.cam.position;
    const face = (s) => Math.atan2(-(cp.x * 0.7 - s.x), -(cp.z * 0.7 - s.z));
    sp.kid.face = face(sp.kid);
    sp.opp.face = face(sp.opp);
    sp.buddy.face = face(sp.buddy);
    if (G.sides) {
      const place = (c, s) => {
        const a = G.sides[c].actor;
        a.faceDefault = s.face;
        if (!CH.highFive.on) a.place(s.x, 0, s.z);
      };
      place(G.kidC, sp.kid);
      place(1 - G.kidC, sp.opp);
    }
  }

  // ---------------------------------------------------------------- the game

  function startGame(opts = {}) {
    gesture();
    G.players = opts.players || prefs.players;
    const who = opts.who || prefs.who;
    G.level = opts.level || (G.players === 1 ? levelFor(who) : 'normal');
    Object.assign(prefs, { players: G.players, who });
    if (G.players === 1) prefs.levels = Object.assign({}, prefs.levels, { [who]: G.level });
    if (opts.undo !== undefined) prefs.undo = !!opts.undo;
    save();
    const key = `${G.players}:${who}:${G.level}`;
    if (key !== G.setupKey) {
      G.setupKey = key;
      G.wins = [0, 0];
      G.draws = 0;
      G.lastWhite = null;
      G.swap = false;
    }
    G.mode = 'game';
    G.demo = null;
    CH.learn.close();
    G.sides = makeSides(G.players, who);
    G.kidC = G.players === 1 ? (who === 'tommy' ? ORANGE : BLUE) : BLUE;
    // you're White (you start) in the first game; after that it swaps every game (the demo board doesn't count)
    G.white = G.lastWhite === null || G.lastWhite === undefined ? G.kidC : G.lastWhite;
    G.flip = false;
    setActors();
    showScreen('play');
    G.state = 'play';
    CH.highFive.cancel();
    setupHud();
    S.music('title');
    newGame(opts.fen);
  }

  function newGame(fen) {
    stopJobs();
    if (G.swap) G.white = 1 - G.white;
    G.swap = false;
    G.lastWhite = G.white;
    G.g = CH.newGame(fen);
    Object.assign(G, { sel: -1, busy: false, cpuT: -1, waitT: -1, endT: -1, panelT: -1, result: null, promo: null, cursor: -1 });
    ST.setView(sideOfColour(G.kidC));
    ST.setPieces(listFor(G.g));
    ST.last(-1, -1);
    ST.hint(-1, -1, -1);
    ST.select(-1);
    ST.stars([]);
    CH.buddy.reset();
    CH.fx.overlay.clear();
    flyers.clear();
    bursts.clear();
    clearToasts();
    G.sides.forEach((s) => {
      s.actor.react('idle');
      s.actor.drop();
    });
    G.state = 'play';
    show(ui.gameOver, false);
    show(ui.pause, false);
    show(ui.promo, false);
    layout();
    renderScore();
    markCheck();
    beginTurn();
  }

  function stopJobs() {
    G.job = null;
    G.hintJob = null;
    G.hint = null;
    G.hintTurn = -1;
  }

  function beginTurn() {
    G.turnId++;
    G.hint = null;
    G.hintJob = null;
    const s = current();
    if (!s) return;
    if (!G.g.over && (!s.human || G.auto)) {
      const level = s.human ? G.autoLevel : G.level;
      G.job = CH.think(G.g, level);
      G.thinkMs = 0;
      const [a, b] = THINK[level] || [0.3, 0.5];
      G.cpuT = s.human ? 0.15 : rand(a, b);
      if (!s.human) {
        s.actor.act('think', G.cpuT + 0.3, 0, true);
        CH.sfx.think();
        const p = s.actor.root.position;
        flyers.add('🤔', p.x, 2.5, p.z, 0, 0.3, 0.55, G.cpuT + 0.2, 0, 0);
      }
    } else G.job = null;
    updateTurnText();
  }

  const canAct = () => {
    if (G.mode === 'lesson') return G.state === 'lesson' && !G.busy && CH.learn.canAct();
    const s = current();
    return G.state === 'play' && s && s.human && !G.auto && !G.busy && G.waitT <= 0 && !G.g.over && !G.promo;
  };

  // the rules the tap goes through: the real game, or the lesson
  const gameCtl = {
    movable: (sq) => {
      const p = CH.at(G.g, sq);
      return !!p && CH.sideOf(p) === G.g.pos.turn;
    },
    movesFrom: (sq) => CH.legalFrom(G.g, sq),
    typeAt: (sq) => CH.typeOf(CH.at(G.g, sq)),
  };
  const ctl = () => (G.mode === 'lesson' ? CH.learn : gameCtl);

  // A tap (or Enter) on square sq, for whoever's turn it is.
  function onSquare(sq) {
    if (!canAct()) return false;
    const C = ctl();
    if (sq < 0) {
      if (G.sel >= 0) select(-1);
      return false;
    }
    if (G.sel >= 0 && G.sel !== sq) {
      const mv = C.movesFrom(G.sel).find((m) => m.to === sq);
      if (mv) {
        if (mv.promos && mv.promos.length > 1) return openPromo(G.sel, sq);
        return doMove(G.sel, sq, mv.promos && mv.promos[0], true);
      }
    }
    if (C.movable(sq)) {
      if (G.sel === sq) select(-1);
      else select(sq);
      return true;
    }
    if (G.sel >= 0) {
      CH.sfx.nope();
      const why = whyNot(G.sel, sq);
      if (why) toast(why, 'hint');
      select(-1);
      return false;
    }
    if (G.mode === 'game' && CH.at(G.g, sq)) {
      CH.sfx.nope();
      toast("THAT'S NOT YOURS!", 'hint');
    }
    return false;
  }

  function select(sq) {
    G.sel = sq;
    if (sq < 0) return ST.select(-1);
    const C = ctl();
    const type = C.typeAt(sq);
    ST.select(sq, CH.NAMES[type]);
    const list = C.movesFrom(sq);
    ST.moves(sq, list);
    CH.sfx.pick(type);
    if (!list.length) toast(G.mode === 'game' && G.g.check ? 'SAVE YOUR KING FIRST!' : "THIS ONE CAN'T MOVE!", 'hint');
  }

  // Why the picked-up piece can't go to `to`, in a few words (or '').
  function whyNot(from, to) {
    if (G.mode !== 'game') return '';
    const g = G.g;
    // a move the piece could make on an empty board, but here it would leave your king in danger
    const pos = g.pos;
    const f88 = CH.to88(from), t88 = CH.to88(to);
    const pseudo = pos.gen([]).some((m) => CH.mFrom(m) === f88 && CH.mTo(m) === t88);
    if (pseudo) return g.check ? 'SAVE YOUR KING FIRST!' : 'THAT WOULD PUT YOUR KING IN DANGER!';
    return '';
  }

  // ---------------------------------------------------------------- promotion: pick a piece

  function openPromo(from, to) {
    G.promo = { from, to };
    const c = colourOf(G.g.pos.turn);
    for (const b of ui.pbtns.children) b.querySelector('img').src = pieceArt[c][+b.dataset.t];
    show(ui.promo, true);
    CH.sfx.promote();
    return true;
  }
  function choosePromo(type) {
    if (!G.promo) return false;
    const { from, to } = G.promo;
    G.promo = null;
    show(ui.promo, false);
    if (!type) {
      select(-1);
      return false;
    }
    return doMove(from, to, type, true);
  }

  // ---------------------------------------------------------------- a move

  function doMove(from, to, promo, human) {
    if (G.mode === 'lesson') {
      const ev = CH.learn.play(from, to, promo);
      if (!ev) return false;
      animate(ev, (e) => CH.learn.landed(e));
      if (human) CH.buddy.moved();
      return true;
    }
    const ev = CH.play(G.g, { from, to, promo: promo || CH.QUEEN });
    if (!ev) {
      if (human) CH.sfx.nope();
      return false;
    }
    G.job = null;
    G.cpuT = -1;
    if (human) {
      ST.hint(-1, -1, -1);
      CH.buddy.moved();
    }
    const mover = G.sides[colourOf(ev.side)];
    if (mover.actor.mode !== 'signature') mover.actor.act('give', 0.45, 0, true);
    animate(ev, landed);
    updateTurnText();
    return true;
  }

  // The animation and sounds of a move (the game's and the lessons'): the piece hops, BONK, castling, promotion.
  function animate(ev, done) {
    G.busy = true;
    select(-1);
    ST.last(ev.from, ev.to);
    ST.check(-1);
    if (ev.type === CH.KNIGHT) CH.sfx.leap();
    if (ev.castle) {
      CH.sfx.castle();
      const p = ST.cellPos(ev.to);
      setTimeout(() => bursts.add('CASTLE!', p.x, ST.TOP + 1.6, p.z, 1.7, '#b8f5ff', '#2f7cf0'), 250);
    }
    ST.move(ev, (e) => {
      G.busy = false;
      if (e.captured) {
        CH.sfx.bonk();
        if (CH.typeOf(e.captured) >= CH.ROOK) ST.shake(0.3);
        setTimeout(() => CH.sfx.bench(), 900);
      } else CH.sfx.step(e.type);
      if (e.promo) CH.sfx.promote();
      done(e);
    });
  }

  // The piece landed: the reactions, check, then the next turn (or the end).
  function landed(ev) {
    if (G.mode !== 'game' || !G.sides || !G.g) return;
    const mover = G.sides[colourOf(ev.side)], other = G.sides[1 - colourOf(ev.side)];
    if (ev.captured) {
      setTimeout(() => {
        if (G.state === 'play' || G.state === 'ended') {
          mover.actor.react('cheer');
          other.actor.react('oops');
        }
      }, 120);
    }
    markCheck();
    if (G.g.check && !G.g.over) {
      CH.sfx.check();
      const k = CH.kingSq(G.g, G.g.pos.turn);
      const p = ST.cellPos(k);
      bursts.add('CHECK!', p.x, ST.TOP + 1.9, p.z, 1.8, '#ffe0e0', '#e8372c');
      other.actor.react('oops');
    }
    if (G.g.over) G.endT = 0.45;
    else G.waitT = 0.15;
    updateTurnText();
  }

  function markCheck() {
    const g = G.g;
    ST.check(g && g.check ? CH.kingSq(g, g.pos.turn) : -1);
    if (ui) show(ui.checkPill, !!(g && g.check && !g.over));
  }

  const WHY = { mate: 'CHECKMATE!', stalemate: 'STALEMATE: NO MOVES, BUT NOT IN CHECK!', repetition: 'THE SAME BOARD 3 TIMES!', fifty: '50 MOVES WITH NO BONK AND NO PAWN MOVE!', material: 'NOT ENOUGH PIECES TO CHECKMATE!' };
  function endGame() {
    const g = G.g;
    const w = g.winner >= 0 ? colourOf(g.winner) : -1;
    G.result = w;
    if (w >= 0) G.wins[w]++;
    else G.draws++;
    G.swap = true; // take turns at being White: the next game swaps
    const win = w >= 0 ? G.sides[w] : null, lose = win ? G.sides[1 - w] : null;
    const at = g.moves.length ? g.moves[g.moves.length - 1].to : 27;
    const p = ST.cellPos(at);
    if (win) {
      win.actor.react('signature');
      setTimeout(() => lose.actor.react('shrug'), 250);
      bursts.add('CHECKMATE!', p.x, ST.TOP + 1.9, p.z, 2.4, '#ffd400', '#e8372c');
      for (let i = 0; i < 10; i++) flyers.add(i % 2 ? '⭐' : '🎉', p.x, ST.TOP + 1, p.z, rand(-2.5, 2.5), rand(2, 4), 0.5, 1.2, rand(-3, 3), 5);
      if (win.human) {
        CH.sfx.win();
        const a = ST.toScreen(p);
        CH.fx.overlay.burst(a.x, a.y, 70, ['⭐', '🎉', w === BLUE ? '💙' : '🧡'], 1.2);
        CH.fx.overlay.rain(90);
      } else CH.sfx.lose();
      bumpScore(w === G.kidC ? ui.scoreL : ui.scoreR);
    } else {
      CH.sfx.draw();
      G.sides.forEach((s) => s.actor.react('shrug'));
      bursts.add('DRAW!', p.x, ST.TOP + 1.9, p.z, 2.2, '#e0f4ff', '#2f7cf0');
      for (let i = 0; i < 6; i++) flyers.add('🤝', 0, ST.TOP + 1, 0, rand(-2, 2), rand(2, 3.5), 0.6, 1.2, rand(-2, 2), 4);
    }
    G.state = 'ended';
    G.endT = -1;
    G.panelT = 2.6;
    markCheck();
    renderScore();
    updateTurnText();
  }

  function showOverPanel() {
    const g = G.g, w = G.result;
    const win = w >= 0 ? G.sides[w] : null;
    ui.oFace.innerHTML = win ? `<img alt="" class="${w === ORANGE ? 'o' : ''}" src="${art[win.id]}"><span class="big">🏆</span>` : '<span class="big">🤝</span>';
    ui.oTitle.textContent = win ? `${nameOf(win.id)} WINS!` : 'DRAW!';
    ui.oWhy.textContent = WHY[g.reason] || '';
    renderPanelScore(ui.oScore);
    G.state = 'over';
    show(ui.gameOver, true);
    if (win) {
      win.actor.react('over');
      G.sides[1 - w].actor.react('sulk');
      if (win.human) CH.fx.overlay.rain(120);
    }
    updateUndo();
  }

  function renderPanelScore(el) {
    const a = G.sides[G.kidC], b = G.sides[1 - G.kidC];
    const img = (s) => `<img alt="" class="${s.colour === ORANGE ? 'o' : ''}" src="${art[s.id]}">`;
    el.innerHTML = `${img(a)}<span>${G.wins[a.colour]}</span><span class="dash">–</span><span>${G.wins[b.colour]}</span>${img(b)}`;
  }

  function again() {
    gesture();
    if (G.state === 'over' || G.state === 'ended') newGame();
  }

  function restartGame() {
    if (G.mode === 'lesson') {
      show(ui.pause, false);
      G.state = 'lesson';
      return CH.learn.restart();
    }
    if (!['play', 'paused', 'ended', 'over'].includes(G.state)) return;
    if (G.state === 'paused') G.state = G.pausedFrom;
    show(ui.pause, false);
    if (G.state === 'ended' || G.state === 'over') return newGame(); // the result already counted
    newGame();
    toast('🔄', 'hint');
  }

  // ---------------------------------------------------------------- undo

  function canUndo() {
    if (G.mode !== 'game' || !prefs.undo || !G.g || G.busy || !G.sides || G.promo) return false;
    if (!['play', 'ended', 'over'].includes(G.state)) return false;
    if (G.players === 2) return G.g.moves.length > 0;
    return G.g.moves.some((ev) => colourOf(ev.side) === G.kidC);
  }

  // Take back your last move (and Foxy's answer, in 1 player; one move in 2 players). Works after the game ended
  // too: the result comes off the score again.
  function undo() {
    if (!canUndo()) {
      if (prefs.undo && G.state === 'play' && G.mode === 'game') CH.sfx.nope();
      return false;
    }
    if (G.state === 'ended' || G.state === 'over') {
      if (G.result >= 0) G.wins[G.result]--;
      else if (G.result === -1) G.draws--;
      G.swap = false;
      G.result = null;
      show(ui.gameOver, false);
      CH.fx.overlay.clear();
      G.sides.forEach((s) => s.actor.react('idle'));
    }
    stopJobs();
    CH.undo(G.g);
    if (G.players === 1) while (G.g.moves.length && colourOf(G.g.pos.turn) !== G.kidC) CH.undo(G.g);
    Object.assign(G, { cpuT: -1, waitT: 0.45, endT: -1, panelT: -1, state: 'play' });
    select(-1);
    ST.syncPieces(listFor(G.g));
    const lastEv = G.g.moves[G.g.moves.length - 1];
    ST.last(lastEv ? lastEv.from : -1, lastEv ? lastEv.to : -1);
    ST.hint(-1, -1, -1);
    markCheck();
    CH.buddy.moved();
    CH.sfx.undo();
    toast('↩️', 'hint');
    renderScore();
    updateTurnText();
    return true;
  }

  function flip() {
    if (G.state === 'home') return;
    G.flip = !G.flip;
    layout();
    CH.sfx.kit('swipe');
  }

  // ---------------------------------------------------------------- home

  function showScreen(name) {
    document.body.dataset.screen = name;
    const play = name === 'play', lesson = name === 'lesson';
    show(ui.home, name === 'home');
    show(ui.hud, play);
    show(ui.tools, play);
    show(ui.lessonBar, lesson);
    show(ui.callBtn, play || lesson);
    show(ui.gameOver, false);
    show(ui.pause, false);
    show(ui.promo, false);
    show(ui.learn, name === 'learn');
    show(ui.intro, false);
    show(ui.lessonDone, false);
  }

  function goHome() {
    stopJobs();
    G.state = 'home';
    G.mode = 'game';
    G.flip = false;
    showScreen('home');
    CH.buddy.reset();
    CH.highFive.cancel();
    ST.hint(-1, -1, -1);
    ST.select(-1);
    ST.cursor(-1);
    ST.stars([]);
    ST.check(-1);
    clearToasts();
    CH.fx.overlay.clear();
    homeBoard();
    G.sides.forEach((s) => s.actor.react('hello'));
    refreshHome();
    S.music('title');
  }
  // the boys at the board, playing a slow demo game (behind the home and LEARN screens)
  function homeBoard() {
    G.sides = [{ id: 'teddy', colour: BLUE, human: false }, { id: 'tommy', colour: ORANGE, human: false }];
    G.kidC = BLUE;
    G.g = null;
    G.flip = false;
    ST.hint(-1, -1, -1);
    ST.select(-1);
    ST.stars([]);
    G.sel = -1;
    setActors();
    G.sides.forEach((s) => {
      s.actor.react('idle');
      s.actor.drop();
    });
    demoStart();
    layout();
  }

  // the board plays itself behind the menu: a slow game between the boys
  function demoStart() {
    G.white = Math.random() < 0.5 ? BLUE : ORANGE;
    G.demo = { g: CH.newGame(), t: 1.4, end: -1, busy: false, job: null };
    ST.setView(sideOfColour(G.kidC));
    ST.setPieces(listFor(G.demo.g));
    ST.last(-1, -1);
    ST.check(-1);
  }
  function demoUpdate(dt) {
    const d = G.demo;
    if (!d) return;
    if (d.end >= 0) {
      d.end -= dt;
      if (d.end < 0) demoStart();
      return;
    }
    if (d.busy) return;
    d.t -= dt;
    if (!d.job) d.job = CH.think(d.g, Math.random() < 0.6 ? 'easy' : 'normal');
    d.job.step(6);
    if (d.t > 0 || !d.job.done) return;
    const m = d.job.result.move;
    d.job = null;
    const ev = m && CH.play(d.g, m);
    if (!ev) return demoStart();
    d.busy = true;
    ST.last(ev.from, ev.to);
    G.sides[colourOf(ev.side)].actor.act('give', 0.45, 0, true);
    ST.move(ev, () => {
      if (G.state !== 'home' || G.demo !== d) return;
      d.busy = false;
      d.t = 1.0;
      ST.check(d.g.check ? CH.kingSq(d.g, d.g.pos.turn) : -1);
      if (ev.captured) {
        G.sides[colourOf(ev.side)].actor.react('cheer');
        G.sides[1 - colourOf(ev.side)].actor.react('oops');
      }
      if (d.g.over || d.g.moves.length >= 120) {
        d.end = 3.2;
        if (d.g.winner >= 0) {
          G.sides[colourOf(d.g.winner)].actor.react('signature');
          G.sides[1 - colourOf(d.g.winner)].actor.react('shrug');
        }
      }
    });
  }

  function refreshHome() {
    const seg = (el, v) => {
      for (const b of el.children) {
        const on = b.dataset.v === String(v);
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on);
        b.setAttribute('role', 'radio');
      }
    };
    seg(ui.segPlayers, prefs.players);
    seg(ui.segWho, prefs.who);
    seg(ui.segLevel, levelFor(prefs.who));
    seg(ui.segUndo, prefs.undo ? 'on' : 'off');
    ui.segWho.style.display = ui.segLevel.style.display = prefs.players === 1 ? '' : 'none';
    // you and your partner: Teddy · Tommy in 2 players, you · Foxy in 1
    const one = prefs.players === 1, me = prefs.who === 'tommy' ? 'tommy' : 'teddy';
    ui.duoA.src = art[one ? me : 'teddy'];
    ui.duoB.src = art[one ? 'foxy' : 'tommy'];
    const myC = one && me === 'tommy' ? ORANGE : BLUE;
    ui.duoDotA.style.background = ST.COL[myC];
    ui.duoDotB.style.background = ST.COL[1 - myC];
  }

  function setPref(k, v) {
    gesture();
    if (k === 'level') prefs.levels = Object.assign({}, prefs.levels, { [prefs.who]: v });
    else if (k === 'undo') prefs.undo = v === 'on' || v === true;
    else prefs[k] = v;
    save();
    refreshHome();
    CH.sfx.kit('click');
    if (k === 'who' && G.state === 'home') {
      const s = G.sides && G.sides.find((x) => x.id === v);
      if (s) s.actor.react('hello');
    }
  }

  // ---------------------------------------------------------------- LEARN

  function openLearn() {
    gesture();
    stopJobs();
    G.mode = 'game';
    CH.learn.close();
    CH.buddy.reset();
    CH.highFive.cancel();
    showScreen('learn');
    G.state = 'learn';
    homeBoard();
    renderLearn();
    CH.sfx.kit('click');
  }
  function renderLearn() {
    ui.lgrid.innerHTML = '';
    CH.learn.lessons.forEach((l, i) => {
      const b = document.createElement('button');
      b.className = 'lcard' + (l.challenge ? ' ch' : '');
      b.setAttribute('aria-label', l.title);
      const pic = l.type ? `<img alt="" src="${pieceArt[BLUE][l.type]}">` : `<span class="emo">${l.emoji}</span>`;
      b.innerHTML = `${pic}<b>${l.title}</b>${prefs.done[l.id] ? '<span class="ok">✅</span>' : ''}`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        startLesson(i);
      });
      ui.lgrid.appendChild(b);
    });
  }
  function startLesson(i) {
    gesture();
    stopJobs();
    G.demo = null;
    G.mode = 'lesson';
    G.players = 1;
    const who = prefs.who === 'tommy' ? 'tommy' : 'teddy';
    G.sides = makeSides(1, who);
    G.kidC = who === 'tommy' ? ORANGE : BLUE;
    G.white = G.kidC;
    G.flip = false;
    G.g = null;
    setActors();
    showScreen('lesson');
    G.state = 'lesson';
    CH.buddy.reset();
    CH.learn.open(i);
    layout();
  }
  function lessonDone(lesson, stars) {
    prefs.done = Object.assign({}, prefs.done, { [lesson.id]: Math.max(stars, prefs.done[lesson.id] || 0) });
    save();
    ui.dFace.innerHTML = `<img alt="" class="${G.kidC === ORANGE ? 'o' : ''}" src="${art[kid().id]}"><span class="big">${lesson.type ? '🎓' : '🏆'}</span>`;
    ui.dStars.textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    show(ui.dNext, CH.learn.index < CH.learn.lessons.length - 1);
    show(ui.lessonDone, true);
    G.state = 'lessonDone';
    kid().actor.react('signature');
    CH.sfx.win();
    CH.fx.overlay.rain(90);
  }

  // ---------------------------------------------------------------- HUD

  function setupHud() {
    const a = G.sides[G.kidC], b = G.sides[1 - G.kidC];
    ui.faceL.src = art[a.id];
    ui.faceR.src = art[b.id];
    ui.faceL.className = a.colour === ORANGE ? 'o' : '';
    ui.faceR.className = b.colour === ORANGE ? 'o' : '';
    setupCall();
    ui.undoBtn.classList.toggle('off', !prefs.undo);
  }
  function setupCall() {
    if (G.players === 1) {
      const bud = CH.buddy.entry;
      ui.callBtn.innerHTML = `<img alt="" src="${art[bud.id]}"><kbd>T</kbd>`;
      const nice = bud.name[0] + bud.name.slice(1).toLowerCase();
      ui.callBtn.title = `Call ${nice} (T)`;
      ui.callBtn.setAttribute('aria-label', `Call ${nice}`);
    } else {
      ui.callBtn.innerHTML = '🙌<kbd>T</kbd>';
      ui.callBtn.title = 'High five! (T)';
      ui.callBtn.setAttribute('aria-label', 'High five!');
    }
  }

  function renderScore() {
    ui.scoreL.textContent = G.wins[G.kidC];
    ui.scoreR.textContent = G.wins[1 - G.kidC];
    updateUndo();
  }
  function bumpScore(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  function updateUndo() {
    if (ui) ui.undoBtn.disabled = !canUndo();
  }

  const cache = {};
  function setText(el, key, v) {
    if (cache[key] !== v) {
      cache[key] = v;
      el.textContent = v;
    }
  }

  function updateTurnText() {
    if (!G.g || !ui || G.mode !== 'game') return;
    const s = current(), g = G.g;
    let text = '', mine = false;
    if (G.state === 'ended' || G.state === 'over' || g.over) text = G.result >= 0 || g.winner >= 0 ? `${nameOf(G.sides[colourOf(g.winner)].id)} WINS!` : 'DRAW!';
    else if (!s.human) text = `${nameOf(s.id)} IS THINKING…`;
    else if (G.players === 1) {
      text = 'YOUR TURN!';
      mine = true;
    } else {
      text = `${nameOf(s.id)}'S TURN!`;
      mine = true;
    }
    setText(ui.turn, 'turn', text);
    ui.turn.classList.toggle('mine', mine);
    const turnC = colourOf(g.pos.turn);
    ui.sideL.classList.toggle('now', !g.over && turnC === G.kidC);
    ui.sideR.classList.toggle('now', !g.over && turnC !== G.kidC);
    updateUndo();
  }

  function toast(text, cls) {
    const el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : '');
    el.textContent = text;
    ui.toasts.appendChild(el);
    setTimeout(() => el.remove(), /save/.test(cls || '') ? 3250 : 1950);
    while (ui.toasts.children.length > 3) ui.toasts.firstChild.remove();
  }
  function clearToasts() {
    if (ui) ui.toasts.innerHTML = '';
  }
  function show(el, on) {
    el.classList.toggle('hidden', !on);
  }

  // ---------------------------------------------------------------- your brother and the high five

  function call() {
    gesture();
    if (!G.sides) return 'none';
    if (G.mode === 'lesson') return G.state === 'lesson' ? CH.buddy.call() : 'none';
    if (!['play', 'ended', 'over'].includes(G.state)) return 'none';
    if (G.players === 2) return CH.highFive.start();
    return CH.buddy.call();
  }

  const HINT = {
    mate: (h) => `CHECKMATE! MOVE THE ${CH.NAMES[h.type]}!`,
    check: (h) => `SAVE YOUR KING! MOVE THE ${CH.NAMES[h.type]}!`,
    danger: (h) => `YOUR ${CH.NAMES[h.type]} IS IN DANGER!`,
    bonk: (h) => `BONK THE ${CH.NAMES[h.target]}!`,
    move: (h) => `MOVE THE ${CH.NAMES[h.type]}!`,
  };
  const kidsTurn = () => G.mode === 'game' && G.state === 'play' && G.g && !G.g.over && current() === kid() && !G.busy && G.waitT <= 0;
  // the hint search: started when he's here and it's your turn, a slice a frame
  function updateHint() {
    if (G.mode !== 'game' || !CH.buddy.on || G.players !== 1) return;
    if (!kidsTurn()) return;
    if (G.hintTurn !== G.turnId) {
      G.hintTurn = G.turnId;
      G.hint = null;
      G.hintJob = CH.think(G.g, 'hint');
    }
    if (G.hintJob && !G.hintJob.done) G.hintJob.step(SLICE.hint);
    if (G.hintJob && G.hintJob.done && !G.hint) {
      const h = CH.hintFor(G.g, G.hintJob.result.move);
      if (h) G.hint = Object.assign(h, { text: HINT[h.kind](h), warn: h.kind === 'danger' || h.kind === 'check', turn: G.turnId });
    }
  }

  const buddyApi = {
    toast: (t, c) => toast(t, c),
    player: () => kid().actor,
    spot: () => ST.spots.buddy,
    scale: () => SCALE,
    turnId: () => (G.mode === 'lesson' ? CH.learn.turnId : G.turnId),
    wantHint: () => {},
    canHint: () => (G.mode === 'lesson' ? CH.learn.canAct() && !G.busy : kidsTurn() && !!G.hint && G.hint.turn === G.turnId),
    roundOver: () => (G.mode === 'lesson' ? G.state !== 'lesson' : G.state !== 'play' || (G.g && G.g.over)),
    showHint() {
      const h = G.mode === 'lesson' ? CH.learn.hint() : G.hint;
      if (!h) return null;
      ST.hint(h.from, h.to, h.kind === 'danger' ? h.from : -1);
      return h;
    },
    clearHint: () => ST.hint(-1, -1, -1),
    players: () => [G.sides[G.kidC].actor, G.sides[1 - G.kidC].actor],
    meet: () => ST.spots.meet,
    homes: () => [ST.spots.kid, ST.spots.opp],
    get flyers() { return flyers; },
  };

  // what learn.js needs from the game
  const learnApi = {
    toast: (t, c) => toast(t, c),
    animate: (ev, done) => animate(ev, done),
    select: (sq) => select(sq),
    done: (lesson, stars) => lessonDone(lesson, stars),
    kid: () => kid(),
    foxy: () => G.sides[1 - G.kidC],
    kidColour: () => G.kidC,
    art: () => ({ pieces: pieceArt, faces: art }),
    ui: () => ui,
    show: (el, on) => show(el, on),
    setState: (s) => { G.state = s; },
    get state() { return G.state; },
    layout: () => layout(),
    get flyers() { return flyers; },
    get bursts() { return bursts; },
  };

  // ---------------------------------------------------------------- input

  let audioReady = false;
  function gesture() {
    if (!audioReady) {
      audioReady = true;
      S.init();
      S.music('title');
    } else S.init();
  }

  // the arrow keys move the cursor the way they point on the screen, whichever way the board is turned
  function moveCursor(sx, sy) {
    if (G.state !== 'play' && G.state !== 'lesson') return;
    if (G.cursor < 0) {
      if (G.sel >= 0) G.cursor = G.sel;
      else {
        const near = ST.sqAt(-0.5, 2.5);
        G.cursor = near >= 0 ? near : 12;
      }
    } else {
      const p = ST.cellPos(G.cursor);
      const az = ST.az;
      const cx = Math.round(Math.cos(az)), sz = Math.round(Math.sin(az));
      const wx = Math.max(-3.5, Math.min(3.5, p.x + cx * sx - sz * sy));
      const wz = Math.max(-3.5, Math.min(3.5, p.z - sz * sx - cx * sy));
      const sq = ST.sqAt(wx, wz);
      if (sq >= 0) G.cursor = sq;
    }
    CH.sfx.tick();
  }

  const PROMO_KEYS = { 1: CH.QUEEN, 2: CH.ROOK, 3: CH.BISHOP, 4: CH.KNIGHT, q: CH.QUEEN, r: CH.ROOK, b: CH.BISHOP, n: CH.KNIGHT };
  function bindInput() {
    ui.canvas.addEventListener('pointerdown', (e) => {
      gesture();
      if (G.state !== 'play' && G.state !== 'lesson') return;
      const sq = ST.pick(e.clientX, e.clientY);
      G.cursor = -1;
      onSquare(sq);
    });
    ui.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      let on = false;
      if (canAct()) {
        const sq = ST.pick(e.clientX, e.clientY);
        const C = ctl();
        on = sq >= 0 && (C.movable(sq) || (G.sel >= 0 && C.movesFrom(G.sel).some((m) => m.to === sq)));
      }
      ui.canvas.style.cursor = on ? 'pointer' : '';
    });
    const tap = (el, fn) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      gesture();
      fn();
    });
    tap(ui.goPlay, () => startGame({}));
    tap(ui.goLearn, openLearn);
    for (const b of ui.segPlayers.children) tap(b, () => setPref('players', +b.dataset.v));
    for (const b of ui.segWho.children) tap(b, () => setPref('who', b.dataset.v));
    for (const b of ui.segLevel.children) tap(b, () => setPref('level', b.dataset.v));
    for (const b of ui.segUndo.children) tap(b, () => setPref('undo', b.dataset.v));
    for (const b of ui.pbtns.children) tap(b, () => choosePromo(+b.dataset.t));
    ui.callBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      call();
    });
    tap(ui.pauseBtn, () => pause(true));
    tap(ui.undoBtn, undo);
    tap(ui.flipBtn, flip);
    tap(ui.pResume, () => pause(false));
    tap(ui.pRestart, restartGame);
    tap(ui.pLearn, openLearn);
    tap(ui.pHome, goHome);
    tap(ui.oAgain, again);
    tap(ui.oHome, goHome);
    tap(ui.muteBtn, toggleMute);
    tap(ui.lMute, toggleMute);
    tap(ui.learnHome, goHome);
    tap(ui.lBack, openLearn);
    tap(ui.lAgain, () => CH.learn.restart());
    tap(ui.iGo, () => CH.learn.go());
    tap(ui.dNext, () => startLesson(CH.learn.index + 1));
    tap(ui.dAgain, () => startLesson(CH.learn.index));
    tap(ui.dBack, openLearn);
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      gesture();
      const k = e.key.toLowerCase();
      if (k === 'm') return toggleMute();
      if (G.promo) {
        if (PROMO_KEYS[k]) choosePromo(PROMO_KEYS[k]);
        else if (k === 'escape') choosePromo(0);
        return;
      }
      if (G.state === 'home') {
        if (k === 'enter' || k === ' ') startGame({});
        else if (k === 'l') openLearn();
        else if (k === 'arrowleft' || k === 'arrowright') setPref('who', prefs.who === 'teddy' ? 'tommy' : 'teddy');
        else if (k === 'arrowup' || k === 'arrowdown') setPref('players', prefs.players === 1 ? 2 : 1);
        else if (/^[1-3]$/.test(k)) setPref('level', LEVELS[+k - 1]);
        else if (k === 'u') setPref('undo', prefs.undo ? 'off' : 'on');
        return;
      }
      if (G.state === 'learn') {
        if (k === 'escape') goHome();
        else if (/^[1-9]$/.test(k) || k === '0') startLesson(k === '0' ? 9 : +k - 1);
        return;
      }
      if (G.state === 'intro') {
        if (k === 'enter' || k === ' ') CH.learn.go();
        else if (k === 'escape') openLearn();
        return;
      }
      if (G.state === 'lessonDone') {
        if ((k === 'enter' || k === ' ') && CH.learn.index < CH.learn.lessons.length - 1) startLesson(CH.learn.index + 1);
        else if (k === 'r') startLesson(CH.learn.index);
        else if (k === 'escape') openLearn();
        return;
      }
      if (k === 't') return call();
      if (G.state === 'paused') {
        if (k === 'escape' || k === 'p' || k === 'enter' || k === ' ') pause(false);
        else if (k === 'r' || k === 'n') restartGame();
        return;
      }
      if (G.state === 'lesson') {
        if (k === 'escape' && G.sel >= 0) return select(-1);
        if (k === 'escape') return openLearn();
        if (k === 'p') return pause(true);
        if (k === 'r') return CH.learn.restart();
        if (k === 'f') return flip();
      } else {
        if (k === 'u' || k === 'backspace') {
          e.preventDefault();
          return undo();
        }
        if (k === 'f') return flip();
        if (G.state === 'over' || G.state === 'ended') {
          if ((k === 'enter' || k === ' ') && G.state === 'over') again();
          else if (k === 'escape') goHome();
          else if (k === 'r' || k === 'n') again();
          return;
        }
        if (k === 'p') return pause(true);
        if (k === 'escape') {
          if (G.sel >= 0) return select(-1);
          return pause(true);
        }
        if (k === 'r' || k === 'n') return restartGame();
      }
      if (G.state !== 'play' && G.state !== 'lesson') return;
      if (k === 'arrowleft') moveCursor(-1, 0);
      else if (k === 'arrowright') moveCursor(1, 0);
      else if (k === 'arrowup') moveCursor(0, 1);
      else if (k === 'arrowdown') moveCursor(0, -1);
      else if ((k === 'enter' || k === ' ') && G.cursor >= 0) onSquare(G.cursor);
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
    });
    addEventListener('resize', layout);
    document.addEventListener('visibilitychange', () => (document.hidden ? S.suspend() : S.resume()));
  }

  function pause(on) {
    if (on && ['play', 'ended', 'over', 'lesson'].includes(G.state)) {
      G.pausedFrom = G.state;
      G.state = 'paused';
      show(ui.pause, true);
      S.music('pause');
    } else if (!on && G.state === 'paused') {
      G.state = G.pausedFrom || 'play';
      show(ui.pause, false);
      S.music('title');
    }
  }

  function toggleMute() {
    const muted = S.toggleMute();
    ui.muteBtn.textContent = ui.lMute.textContent = muted ? '🔇' : '🔊';
  }

  // ---------------------------------------------------------------- the loop

  const tmp = new THREE.Vector3();
  function step(dt) {
    dt = Math.min(dt, 0.1);
    // the window can start at 0 x 0 (a hidden tab) and resize without an event reaching us: re-fit when it changes
    if ((innerWidth || 1) !== ST.W || (innerHeight || 1) !== ST.H) layout();
    const running = !['paused', 'boot'].includes(G.state);
    if (running) {
      if (G.state === 'home' || G.state === 'learn') demoUpdate(dt);
      if (G.state === 'play' && G.mode === 'game') {
        if (G.waitT > 0) {
          G.waitT -= dt;
          if (G.waitT <= 0 && !G.g.over && !G.busy) beginTurn();
        } else if (G.job && !G.busy) {
          const s = current();
          const level = s.human ? G.autoLevel : G.level;
          const t0 = performance.now();
          if (!G.job.done) G.job.step(SLICE[level] || 8);
          G.thinkMs += performance.now() - t0;
          G.cpuT -= dt;
          if (G.job.done && G.cpuT <= 0) {
            const r = G.job.result;
            G.lastThink = { level, ms: r.ms, depth: r.depth, nodes: r.nodes };
            G.job = null;
            if (r.move) doMove(CH.to64(CH.mFrom(r.move)), CH.to64(CH.mTo(r.move)), CH.mPromo(r.move), s.human);
          }
        }
        if (G.endT > 0) {
          G.endT -= dt;
          if (G.endT <= 0) endGame();
        }
        updateHint();
      }
      if (G.state === 'lesson') CH.learn.update(dt);
      if (G.state === 'ended' && G.panelT > 0) {
        G.panelT -= dt;
        if (G.panelT <= 0) showOverPanel();
      }
      ST.update(dt);
      flyers.update(dt);
      bursts.update(dt);
      if (G.sides) G.sides.forEach((s) => s.actor.update(dt));
      CH.buddy.update(dt);
      CH.highFive.update(dt);
    }
    // the ♟ over whoever is to move
    const g = G.mode === 'game' ? (G.state === 'home' || G.state === 'learn' ? null : G.g) : null;
    if (G.sides) {
      G.sides.forEach((s, c) => {
        const on = g && !g.over && colourOf(g.pos.turn) === c;
        const bdg = badges[c];
        bdg.visible = !!on;
        if (on) {
          s.actor.root.getWorldPosition(tmp);
          bdg.position.set(tmp.x, 2 * SCALE + 0.45 + Math.abs(Math.sin(performance.now() / 260)) * 0.16, tmp.z);
        }
      });
    }
    ST.cursor(G.state === 'play' || G.state === 'lesson' ? G.cursor : -1);
    CH.fx.overlay.update(dt);
    ui.callBtn.classList.toggle('here', CH.buddy.on || CH.highFive.on);
    ST.render();
  }

  function frame(now) {
    const dt = G.last ? (now - G.last) / 1000 : 0.016;
    G.last = now;
    if (!G.held) step(dt);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- boot

  function boot() {
    ui = {
      canvas: $('game'), home: $('home'), hud: $('hud'), hudtop: document.querySelector('.hudtop'), logo: $('logo'), tools: $('tools'),
      goPlay: $('goPlay'), goLearn: $('goLearn'), segPlayers: $('segPlayers'), segWho: $('segWho'), segLevel: $('segLevel'), segUndo: $('segUndo'),
      duo: $('duo'), duoA: $('duoA'), duoB: $('duoB'), duoDotA: $('duoDotA'), duoDotB: $('duoDotB'), pauseBtn: $('pauseBtn'), muteBtn: $('muteBtn'),
      sideL: $('sideL'), sideR: $('sideR'), faceL: $('faceL'), faceR: $('faceR'), scoreL: $('scoreL'), scoreR: $('scoreR'), turn: $('turn'),
      checkPill: $('checkPill'), undoBtn: $('undoBtn'), flipBtn: $('flipBtn'), callBtn: $('callBtn'), toasts: $('toasts'),
      gameOver: $('gameOver'), oFace: $('oFace'), oTitle: $('oTitle'), oWhy: $('oWhy'), oScore: $('oScore'), oAgain: $('oAgain'),
      oHome: $('oHome'), pause: $('pause'), pResume: $('pResume'), pRestart: $('pRestart'), pLearn: $('pLearn'), pHome: $('pHome'),
      promo: $('promo'), pbtns: $('pbtns'), learn: $('learn'), lgrid: $('lgrid'), learnHome: $('learnHome'),
      lessonBar: $('lessonBar'), lBack: $('lBack'), lAgain: $('lAgain'), lPic: $('lPic'), lTitle: $('lTitle'), lSay: $('lSay'), lStars: $('lStars'), lMute: $('lMute'),
      intro: $('intro'), iTitle: $('iTitle'), iPic: $('iPic'), iSay: $('iSay'), iGo: $('iGo'),
      lessonDone: $('lessonDone'), dFace: $('dFace'), dStars: $('dStars'), dNext: $('dNext'), dAgain: $('dAgain'), dBack: $('dBack'),
    };
    // the logo: the first word small on top, the rest big ("TT" / "Chess"); a one-word name is all big
    const words = window.CH_TITLE.split(' ');
    ui.logo.querySelector('small').textContent = words.length > 1 ? words[0] : '';
    ui.logo.querySelector('big').textContent = words.length > 1 ? words.slice(1).join(' ') : words[0];
    ui.muteBtn.textContent = ui.lMute.textContent = S.isMuted() ? '🔇' : '🔊';
    ST.init(ui.canvas);
    CH.fx.overlay.init($('fx'));
    flyers = CH.fx.flyers(ST.scene, 80);
    bursts = CH.fx.bursts(ST.scene, 6);
    ST.useFx(flyers, bursts);
    actors.forEach((a) => a.attach(ST.scene, flyers));
    art = Kit.portraits(['teddy', 'tommy', 'foxy'].map((id) => Kit.roster.get(id)), { size: 160 });
    pieceArt = ST.pieceArt(160);
    ui.segWho.children[0].querySelector('img').src = art.teddy;
    ui.segWho.children[1].querySelector('img').src = art.tommy;
    $('picPlayA').src = pieceArt[BLUE][CH.KING];
    $('picPlayB').src = pieceArt[ORANGE][CH.QUEEN];
    $('picLearn').src = pieceArt[BLUE][CH.KNIGHT];
    CH.buddy.init(buddyApi);
    CH.learn.init(learnApi);
    if (Kit.lang) Kit.lang.onChange(() => {
      ST.relabel();
      if (G.sel >= 0) select(G.sel);
    });
    bindInput();
    goHome();
    $('loading').classList.add('hidden');
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- test hook

  const sqOf = (s) => (typeof s === 'string' ? CH.sqOf(s) : s);
  window.game = {
    // advance `secs` of game time in 1/60 s steps, rendering once at the end (works while the pane is hidden)
    step(secs = 0.1) {
      const n = Math.max(1, Math.round(secs * 60));
      for (let i = 0; i < n; i++) step(1 / 60);
      return game.info();
    },
    hold(on = true) { G.held = on; },
    // start({ players: 1 | 2, who: 'teddy' | 'tommy', level: 'easy' | 'normal' | 'hard', undo, fen })
    start(opts = {}) {
      startGame(opts);
      return game.info();
    },
    home: () => goHome(),
    tap: (sq) => onSquare(sqOf(sq)),       // tap a square ('e2' or 0..63) for whoever's turn it is
    // play a move like 'e2e4' or 'e7e8n' through two taps (and the picker)
    move(uci) {
      onSquare(CH.sqOf(uci.slice(0, 2)));
      const r = onSquare(CH.sqOf(uci.slice(2, 4)));
      if (G.promo) return choosePromo(' pnbrqk'.indexOf(uci[4] || 'q'));
      return r;
    },
    promo: (t) => choosePromo(t),
    key: (k) => dispatchEvent(new KeyboardEvent('keydown', { key: k })),
    call: () => call(),
    undo: () => undo(),
    flip: () => flip(),
    pause: (on = true) => pause(on),
    again: () => again(),
    restart: () => restartGame(),
    learn: () => openLearn(),
    lesson: (i) => startLesson(i),
    lessonGo: () => CH.learn.go(),
    // let a test bot play the kid's side too ('easy', 'normal', 'hard' or 'random')
    auto(on = true, level = 'normal') {
      G.auto = on;
      G.autoLevel = level;
      if (on && G.state === 'play' && current() && current().human && !G.job && G.waitT <= 0 && !G.busy) beginTurn();
    },
    // a position from a FEN (for screenshots and tests); keeps the players
    setup(fen) {
      newGame(fen);
      return game.info();
    },
    check: (opts = {}) => CH.check(Object.assign({ games: 2, quick: true, noHard: true }, opts)),
    perft: () => CH.perftCheck(),
    info() {
      const g = G.g;
      return {
        state: G.state, mode: G.mode, players: G.players, level: G.level, kidC: G.kidC, white: G.white, wide: G.wide, flip: G.flip,
        sides: G.sides && G.sides.map((s) => ({ id: s.id, colour: s.colour, human: s.human, pose: s.actor && s.actor.pose })),
        fen: g ? CH.toFen(g.pos) : null, turn: g ? colourOf(g.pos.turn) : null, plies: g ? g.moves.length : 0, over: g && g.over, reason: g && g.reason,
        winner: g && g.winner >= 0 ? colourOf(g.winner) : -1, check: g && g.check, wins: G.wins.slice(), draws: G.draws, sel: G.sel,
        shown: ST.shown.length, busy: G.busy, thinking: !!G.job, canUndo: canUndo(), promo: !!G.promo, cursor: G.cursor,
        buddy: CH.buddy.info(), hint: { from: ST.hintFrom, to: ST.hintTo, text: G.hint && G.hint.text }, lastThink: G.lastThink || null,
        panel: !ui.gameOver.classList.contains('hidden') ? 'over' : null, undoOn: prefs.undo, lesson: CH.learn.info(),
        squarePx: ST.squarePixels(), board: ST.boardRect(), benches: [ST.benchCount(0), ST.benchCount(1)],
      };
    },
    get G() { return G; },
    get CH() { return CH; },
  };

  let booted = false;
  const go = () => {
    if (booted) return;
    booted = true;
    boot();
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go);
  setTimeout(go, 1500);
})();

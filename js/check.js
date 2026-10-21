/* TT Chess: the headless checks. The same code runs in the page (game.check()) and under Node (tools/check.js).
   - perft: the number of positions after 1, 2, 3 (and 4) moves from the start and from the standard test positions
     ("Kiwipete" and friends). Any mistake in the moves (castling, en passant, promotion, pins, checks) shows up here.
   - every rule on a little board set up for it: castling (each condition), en passant (now or never, and the pinned
     case), promotion (all four), check, checkmate, stalemate, and the draws (threefold, 50 moves, not enough pieces).
   - the CPU: games between the levels where every move is checked legal and every game must end; NORMAL must beat
     EASY and HARD must beat NORMAL most of the time; EASY always takes a free queen; your brother's hint.
   - sabotage: CH.sabotage[name] = true switches a rule off, and the check must then fail (tools/check.js --sabotage). */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const CH = root.CH;
  const { W, B, QUEEN, ROOK, BISHOP, KNIGHT } = CH;

  function rng32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PERFT = [
    { name: 'start', fen: CH.START, n: [20, 400, 8902, 197281] },
    { name: 'kiwipete', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', n: [48, 2039, 97862] },
    { name: 'position 3 (en passant, pins)', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', n: [14, 191, 2812, 43238] },
    { name: 'position 4 (promotions, castling)', fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', n: [6, 264, 9467] },
    { name: 'position 5', fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', n: [44, 1486, 62379] },
  ];

  function perft(quick) {
    const out = [];
    for (const t of PERFT) {
      const pos = CH.fromFen(t.fen);
      t.n.forEach((want, i) => {
        if (quick && i >= 3) return;
        const t0 = Date.now();
        const got = pos.perft(i + 1);
        out.push({ name: `perft ${t.name} depth ${i + 1}`, ok: got === want, got, want, ms: Date.now() - t0 });
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- the rules, one little board each

  function ucis(g, sq) {
    return CH.legalFrom(g, CH.sqOf(sq)).map((m) => m.uci);
  }
  function allUcis(g) {
    return g.pos.legal().map(CH.uci);
  }
  function playAll(g, list) {
    for (const u of list.split(' ')) {
      const promo = u[4] ? ' pnbrqk'.indexOf(u[4]) : 0;
      const ev = CH.play(g, { from: CH.sqOf(u.slice(0, 2)), to: CH.sqOf(u.slice(2, 4)), promo });
      if (!ev) return false;
    }
    return true;
  }

  function rules() {
    const out = [];
    const ok = (name, cond, extra) => out.push(Object.assign({ name, ok: !!cond }, extra || {}));
    const G = (fen) => CH.newGame(fen);

    // the start
    let g = G();
    ok('start: 20 moves, White to move, all castling rights', allUcis(g).length === 20 && g.pos.turn === W && g.pos.castle === 15);
    ok('start: the pawn may step one or two', ucis(g, 'e2').sort().join() === 'e2e3,e2e4');
    ok('start: the knight jumps over the pawns', ucis(g, 'g1').sort().join() === 'g1f3,g1h3');
    ok('start: the bishop, rook, queen and king are stuck', ['c1', 'a1', 'd1', 'e1'].every((s) => !ucis(g, s).length));
    ok('FEN round trip', CH.toFen(CH.newGame('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1').pos) === 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');

    // castling
    g = G('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    ok('castling: both sides when everything is clear', ucis(g, 'e1').includes('e1g1') && ucis(g, 'e1').includes('e1c1'));
    playAll(g, 'e1g1');
    ok('castling short: king to g1, rook to f1', CH.at(g, CH.sqOf('g1')) === 6 && CH.at(g, CH.sqOf('f1')) === 4 && !CH.at(g, CH.sqOf('h1')));
    playAll(g, 'e8c8');
    ok('castling long: king to c8, rook to d8', CH.at(g, CH.sqOf('c8')) === 14 && CH.at(g, CH.sqOf('d8')) === 12 && !CH.at(g, CH.sqOf('a8')));
    g = G('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    ok('castling: not out of check', !ucis(g, 'e1').some((u) => u === 'e1g1' || u === 'e1c1'));
    g = G('5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    ok('castling: not through an attacked square (f1)', !ucis(g, 'e1').includes('e1g1') && ucis(g, 'e1').includes('e1c1'));
    g = G('3r2k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    ok('castling: not through an attacked square (d1)', !ucis(g, 'e1').includes('e1c1') && ucis(g, 'e1').includes('e1g1'));
    g = G('6rk/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    ok('castling: not into check (g1)', !ucis(g, 'e1').includes('e1g1'));
    g = G('2r3k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    ok('castling: not into check (c1)', !ucis(g, 'e1').includes('e1c1'));
    g = G('1r4k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    ok('castling long: b1 under attack is fine (the king never crosses it)', ucis(g, 'e1').includes('e1c1'));
    g = G('r3k2r/8/8/8/8/8/8/RN2K1NR w KQkq - 0 1');
    ok('castling: not with a piece in the way', !ucis(g, 'e1').includes('e1c1') && !ucis(g, 'e1').includes('e1g1'));
    g = G('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    playAll(g, 'e1e2 e8e7 e2e1 e7e8');
    ok('castling: not after the king has moved (even back home)', !ucis(g, 'e1').some((u) => u === 'e1g1' || u === 'e1c1') && g.pos.castle === 0);
    g = G('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    playAll(g, 'h1h2 a8a7 h2h1 a7a8');
    ok('castling: not with a rook that has moved; the other side still fine', !ucis(g, 'e1').includes('e1g1') && ucis(g, 'e1').includes('e1c1'));
    g = G('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    playAll(g, 'a8a1');
    ok('castling: the right goes when the rook is taken', !(g.pos.castle & 2) && !(g.pos.castle & 8));
    g = G('4k3/8/8/8/8/8/8/R3K2R w - - 0 1');
    ok('castling: not without the right', !ucis(g, 'e1').some((u) => u === 'e1g1' || u === 'e1c1'));

    // en passant
    g = G('4k3/8/8/8/1p6/8/P7/4K3 w - - 0 1');
    playAll(g, 'a2a4');
    ok('en passant: the pawn that stepped two can be taken as if it stepped one', ucis(g, 'b4').includes('b4a3'));
    const ep = CH.play(g, { from: CH.sqOf('b4'), to: CH.sqOf('a3') });
    ok('en passant: the passed pawn leaves the board', ep && ep.ep && ep.capSq === CH.sqOf('a4') && !CH.at(g, CH.sqOf('a4')) && CH.at(g, CH.sqOf('a3')) === 9);
    g = G('4k3/8/8/8/1p6/8/P7/4K3 w - - 0 1');
    playAll(g, 'a2a4 e8d8 e1d1');
    ok('en passant: only straight away, never later', !ucis(g, 'b4').includes('b4a3'));
    g = G('8/8/8/K1pP3r/8/8/8/7k w - c6 0 1');
    ok('en passant: not when it would leave your king open', !ucis(g, 'd5').includes('d5c6') && ucis(g, 'd5').includes('d5d6'));
    g = G('4k3/8/8/8/8/8/1P6/4K3 w - - 0 1');
    playAll(g, 'b2b4');
    ok('en passant: no square to take on when nobody can', CH.toFen(g.pos).split(' ')[3] === 'b3' && !allUcis(g).some((u) => u.endsWith('b3')));

    // promotion
    g = G('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const pm = CH.legalFrom(g, CH.sqOf('a7'));
    ok('promotion: the pawn on the last row picks queen, rook, bishop or knight', pm.length === 1 && pm[0].promos.slice().sort().join() === [KNIGHT, BISHOP, ROOK, QUEEN].sort().join());
    for (const [p, name] of [[QUEEN, 'queen'], [ROOK, 'rook'], [BISHOP, 'bishop'], [KNIGHT, 'knight']]) {
      const gg = G('8/P7/8/8/8/8/8/k6K w - - 0 1');
      CH.play(gg, { from: CH.sqOf('a7'), to: CH.sqOf('a8'), promo: p });
      ok(`promotion: to a ${name}`, CH.at(gg, CH.sqOf('a8')) === p && !CH.at(gg, CH.sqOf('a7')));
    }
    g = G('1n6/P7/8/8/8/8/8/k6K w - - 0 1');
    ok('promotion: by taking too', CH.legalFrom(g, CH.sqOf('a7')).some((m) => m.uci.startsWith('a7b8') && m.captured));
    g = G('8/P7/8/8/8/8/8/k6K w - - 0 1');
    CH.play(g, { from: CH.sqOf('a7'), to: CH.sqOf('a8'), promo: KNIGHT });
    CH.undo(g);
    ok('promotion: undo puts the pawn back', CH.at(g, CH.sqOf('a7')) === 1 && !CH.at(g, CH.sqOf('a8')));

    // check, checkmate, stalemate
    g = G();
    playAll(g, 'f2f3 e7e5 g2g4');
    const mate = CH.play(g, { from: CH.sqOf('d8'), to: CH.sqOf('h4') });
    ok("checkmate: the fool's mate", mate && mate.check && g.over && g.reason === 'mate' && g.winner === B);
    g = G('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    CH.play(g, { from: CH.sqOf('a1'), to: CH.sqOf('a8') });
    ok('checkmate: the back row', g.over && g.reason === 'mate' && g.winner === W);
    g = G('6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1');
    CH.play(g, { from: CH.sqOf('g5'), to: CH.sqOf('f7') });
    ok('checkmate: smothered by a knight', g.over && g.reason === 'mate' && g.winner === W);
    g = G('4k3/8/8/8/8/8/3q4/4K3 w - - 0 1');
    ok('check: you must get out of it (take the queen or step to the one safe square)', g.check && allUcis(g).sort().join() === 'e1d2,e1f1');
    g = G('4k3/8/8/8/8/8/8/r3K3 w - - 0 1');
    ok('check: the king may not step along the attacking line', !ucis(g, 'e1').includes('e1d1') && !ucis(g, 'e1').includes('e1f1'));
    g = G('4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1');
    ok('pins: a pinned piece may not leave the line', !ucis(g, 'e2').length);
    g = G('k7/8/1Q6/8/8/8/8/7K w - - 0 1');
    playAll(g, 'h1g1');
    ok('stalemate: no legal move and not in check is a draw', g.over && g.reason === 'stalemate' && g.winner === -1);
    g = G('7k/8/5KQ1/8/8/8/8/8 b - - 0 1');
    ok('stalemate: from the start of a turn', g.over && g.reason === 'stalemate');
    g = G('7k/8/6K1/8/8/8/8/6Q1 b - - 0 1');
    ok('not stalemate while the king can move', !g.over);

    // threefold repetition
    g = G();
    playAll(g, 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1');
    const before = g.over;
    playAll(g, 'f6g8');
    ok('threefold: the same position three times is a draw (not at two)', !before && g.over && g.reason === 'repetition');
    g = G('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    playAll(g, 'e2e4 e8d8 e1d1 d8e8 d1e1 e8d8 e1d1 d8e8');
    const at2 = g.over;
    playAll(g, 'd1e1');
    ok('threefold: an en passant nobody can take does not make a position new', !at2 && g.over && g.reason === 'repetition');
    g = G('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1');
    playAll(g, 'a1a2 e8d8 a2a1 d8e8 a1a2 e8d8 a2a1 d8e8');
    ok('threefold: lost castling rights make it a new position', !g.over);
    playAll(g, 'a1a2 e8d8 a2a1 d8e8');
    ok('threefold: ...that then repeats', g.over && g.reason === 'repetition');

    // the 50-move rule
    g = G('4k3/8/8/8/8/8/8/R3K3 w - - 98 60');
    playAll(g, 'a1a2');
    const at99 = g.over;
    playAll(g, 'e8d8');
    ok('50 moves: 50 moves each with no capture or pawn move is a draw', !at99 && g.over && g.reason === 'fifty');
    g = G('4k3/8/8/8/8/8/4P3/R3K3 w - - 99 60');
    playAll(g, 'e2e3');
    ok('50 moves: a pawn move starts the count again', !g.over && g.pos.half === 0);
    g = G('7k/5Q2/5K2/8/8/8/8/8 w - - 99 80');
    playAll(g, 'f7g7');
    ok('50 moves: checkmate on the last move still wins', g.over && g.reason === 'mate' && g.winner === W);

    // not enough pieces to checkmate
    const dead = (fen) => G(fen).reason === 'material';
    ok('material: king against king', dead('8/8/8/4k3/8/8/8/4K3 w - - 0 1'));
    ok('material: king and bishop against king', dead('8/8/8/4k3/8/8/8/2B1K3 w - - 0 1'));
    ok('material: king and knight against king', dead('8/8/8/4k3/8/8/8/1N2K3 b - - 0 1'));
    ok('material: bishops all on the same colour', dead('5b2/8/8/4k3/8/8/8/2B1K3 w - - 0 1'));
    ok('material: bishops on both colours can still mate', !dead('2b5/8/8/4k3/8/8/8/2B1K3 w - - 0 1'));
    ok('material: knight against knight can still mate', !dead('1n6/8/8/4k3/8/8/8/1N2K3 w - - 0 1'));
    ok('material: a pawn, a rook or a queen can still mate', ['8/8/8/4k3/8/8/4P3/4K3 w - - 0 1', '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', '8/8/8/4k3/8/8/8/Q3K3 w - - 0 1'].every((f) => !dead(f)));
    g = G('8/8/8/4k3/8/8/3r4/2B1K3 w - - 0 1');
    playAll(g, 'e1d2');
    ok('material: taking the last rook leaves a dead draw', g.over && g.reason === 'material');

    // illegal moves change nothing; undo goes back exactly
    g = G();
    const fen0 = CH.toFen(g.pos);
    ok('an illegal move is refused and changes nothing', !CH.play(g, { from: CH.sqOf('e2'), to: CH.sqOf('e5') }) && CH.toFen(g.pos) === fen0);
    playAll(g, 'e2e4 d7d5 e4d5 g8f6 f1b5 c7c6 d5c6 d8a5 c6b7 a5b5 b7a8q');
    while (g.moves.length) CH.undo(g);
    ok('undo all the way back gives the start again (hash too)', CH.toFen(g.pos) === fen0 && g.pos.key() === CH.newGame().pos.key());

    return out;
  }

  // ---------------------------------------------------------------- the CPU and the hint

  function cpuRules(seed) {
    const out = [];
    const ok = (name, cond, extra) => out.push(Object.assign({ name, ok: !!cond }, extra || {}));
    const rng = rng32(seed);
    // EASY always takes a free queen
    const fens = ['4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', '4k3/8/8/8/2q5/1P6/8/4K3 w - - 0 1'];
    let took = 0, tries = 0;
    for (const f of fens) {
      for (let i = 0; i < 25; i++) {
        const g = CH.newGame(f);
        const m = CH.easyMove(g.pos, rng);
        tries++;
        if ((CH.describe(g.pos, m).captured & 7) === QUEEN) took++;
      }
    }
    ok('EASY always takes a free queen', took === tries, { took, tries });
    // every level takes a mate in one
    const mateFen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    for (const lv of ['normal', 'hard']) {
      const g = CH.newGame(mateFen);
      const m = CH.best(g, lv, { rng, cfg: lv === 'hard' ? { time: 300 } : {} });
      ok(`${lv.toUpperCase()} finds the checkmate`, CH.uci(m) === 'a1a8');
    }
    // NORMAL doesn't leave its queen hanging to a pawn
    let g = CH.newGame('rnb1kbnr/pppp1ppp/8/4p3/3qP3/2P5/PP1P1PPP/RNBQKBNR b KQkq - 0 1');
    let m = CH.best(g, 'normal', { rng });
    ok('NORMAL moves its queen away from a pawn', CH.mFrom(m) === CH.to88(CH.sqOf('d4')), { move: CH.uci(m) });
    // HARD sees the queen fork that NORMAL's horizon misses... at least it plays a sound move in a tactical spot
    g = CH.newGame('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3');
    m = CH.best(g, 'hard', { rng, cfg: { time: 400 } });
    ok("HARD plays the scholar's mate when it's there", CH.uci(m) === 'f3f7', { move: CH.uci(m) });
    // the hint
    g = CH.newGame(mateFen);
    let h = CH.hintFor(g, CH.best(g, 'hint', { rng }));
    ok('hint: checkmate when there is one', h && h.kind === 'mate' && h.uci === 'a1a8', h);
    g = CH.newGame('rnbqkbnr/pp1ppppp/8/2p5/3Q4/4P3/PPP2PPP/RNB1KBNR w KQkq - 0 1');
    playAll(g, 'd4d5 e7e6');
    h = CH.hintFor(g, CH.best(g, 'hint', { rng }));
    ok('hint: your queen is in danger (and he moves it)', h && h.kind === 'danger' && h.type === QUEEN, h);
    g = CH.newGame('4k3/8/8/8/8/8/3q4/4K3 w - - 0 1');
    h = CH.hintFor(g, CH.best(g, 'hint', { rng }));
    ok('hint: get out of check', h && h.kind === 'check', h);
    g = CH.newGame('4k3/8/8/3r4/8/8/8/3RK3 w - - 0 1');
    h = CH.hintFor(g, CH.best(g, 'hint', { rng }));
    ok('hint: bonk a free piece', h && h.kind === 'bonk' && h.target === ROOK, h);
    return out;
  }

  // One CPU game: every move must be legal and the game must end by the rules. Returns who won and why.
  function cpuGame(white, black, rng, opts = {}) {
    const g = CH.newGame(opts.fen);
    const lv = [white, black];
    let legal = true;
    while (!g.over && g.moves.length < (opts.cap || 3000)) {
      const side = g.pos.turn;
      const name = lv[side];
      let m;
      if (name === 'random') {
        const l = g.pos.legal();
        m = l[Math.floor(rng() * l.length)];
      } else m = CH.best(g, name, { rng, cfg: opts.cfg && opts.cfg[name] });
      if (!g.pos.legal().includes(m)) {
        legal = false;
        break;
      }
      CH.play(g, m);
    }
    // the ending must agree with the board
    let sound = g.over;
    if (g.reason === 'mate') sound = g.pos.inCheck() && !g.pos.legal().length;
    if (g.reason === 'stalemate') sound = !g.pos.inCheck() && !g.pos.legal().length;
    if (g.reason === 'fifty') sound = g.pos.half >= 100;
    return { winner: g.winner, reason: g.reason, plies: g.moves.length, legal, ended: g.over, sound };
  }

  // A match: n games, colours swapped every game. score: the first level's wins, the second's, draws.
  function match(a, b, n, rng, opts) {
    const r = { a, b, games: n, wins: 0, losses: 0, draws: 0, reasons: {}, allLegal: true, allEnded: true, longest: 0, ms: 0 };
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const aWhite = i % 2 === 0;
      const res = cpuGame(aWhite ? a : b, aWhite ? b : a, rng, opts);
      r.allLegal = r.allLegal && res.legal;
      r.allEnded = r.allEnded && res.ended && res.sound;
      r.longest = Math.max(r.longest, res.plies);
      r.reasons[res.reason] = (r.reasons[res.reason] || 0) + 1;
      if (res.winner < 0) r.draws++;
      else if ((res.winner === W) === aWhite) r.wins++;
      else r.losses++;
    }
    r.ms = Date.now() - t0;
    return r;
  }

  // Everything. opts: { games (per CPU pairing, default 4), quick (perft without depth 4), sabotage, seed, hardMs }
  function check(opts = {}) {
    const t0 = Date.now();
    const sab = CH.sabotage;
    for (const k of Object.keys(sab)) delete sab[k];
    if (opts.sabotage) sab[opts.sabotage] = true;
    const savedNormal = Object.assign({}, CH.LEVELS.normal);
    if (opts.sabotage === 'blind') CH.level('normal', { depth: 1, margin: 100000 }); // NORMAL plays at random
    CH.clearTT();
    const seed = opts.seed !== undefined ? opts.seed : 20261020;
    const rng = rng32(seed);
    const n = opts.games !== undefined ? opts.games : 4;
    const cfg = { hard: { time: opts.hardMs || 150 } };
    let out;
    try {
      const p = opts.skipPerft ? [] : perft(opts.quick);
      const r = rules();
      const c = n ? cpuRules(seed) : [];
      const cpu = {};
      if (n) {
        cpu.normalVsEasy = match('normal', 'easy', n, rng, { cfg });
        cpu.easyVsEasy = match('easy', 'easy', Math.max(2, n >> 1), rng, { cfg });
        cpu.randomVsRandom = match('random', 'random', Math.max(2, n >> 1), rng, { cfg });
        if (!opts.noHard) cpu.hardVsNormal = match('hard', 'normal', n, rng, { cfg });
      }
      const all = [...p, ...r, ...c];
      const games = Object.values(cpu);
      const most = (m) => !m || m.wins > m.games / 2 && m.wins >= 2 * m.losses;
      const cpuOk = games.every((m) => m.allLegal && m.allEnded) && most(cpu.normalVsEasy) && most(cpu.hardVsNormal);
      out = {
        ok: all.every((x) => x.ok) && cpuOk,
        perft: `${p.filter((x) => x.ok).length}/${p.length}`, rules: `${r.length + c.length - [...r, ...c].filter((x) => !x.ok).length}/${r.length + c.length}`,
        failed: all.filter((x) => !x.ok), cpu, sabotage: opts.sabotage || null, seconds: +((Date.now() - t0) / 1000).toFixed(1),
        perftDetail: p.map((x) => `${x.name}: ${x.got}${x.ok ? '' : ' (want ' + x.want + ')'} ${x.ms} ms`),
      };
    } finally {
      for (const k of Object.keys(sab)) delete sab[k];
      CH.level('normal', savedNormal);
    }
    return out;
  }

  CH.check = check;
  CH.checkRules = () => rules();
  CH.perftCheck = perft;
  CH.match = (a, b, n = 4, seed = 1, opts) => match(a, b, n, rng32(seed), opts);
  CH.rng32 = rng32;
})();

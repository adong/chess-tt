/* TT Chess: LEARN, for Tommy (5). One short lesson per piece, then four mini-challenges. Each starts with a picture
   card (the piece, a little board showing where it can go, a few words), then you play it on the real board:
     the pieces     move your piece onto every ⭐ (the pawn also bonks one, the knight hops over a row of pawns).
                    Stuck (a pawn that walked past a star)? "OOPS! LET'S TRY AGAIN!" and the lesson starts over.
     ROOK TO THE STAR   a little maze: 3 moves is ⭐⭐⭐.
     PAWN RACE      your pawn against Foxy's: get to the end first. Only the big first step wins it.
     CATCH THE KNIGHT   your queen chases Foxy's knight, which hops away (it never bonks back).
     CHECKMATE!     two checkmates in one move (a rook on the back row, then a queen). A stalemate doesn't count.
   Done lessons get a ✅ on the LEARN screen (remembered). Your brother's hint works here too: he points the way.
   The lesson board is a CH.Pos of its own (no kings in most lessons, Foxy only moves in the races and chases). */
(function () {
  'use strict';
  const CH = (window.CH = window.CH || {});
  const { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, W, B } = CH;

  const LESSONS = [
    { id: 'pawn', type: PAWN, title: 'PAWN', say: 'PAWNS WALK FORWARD. THE FIRST STEP CAN BE TWO!', tip: 'PAWNS BONK ON THE SLANT!', fen: '8/8/8/3p4/8/8/4P3/8 w - - 0 1', stars: ['e4', 'd5'] },
    { id: 'rook', type: ROOK, title: 'ROOK', say: 'THE ROOK GOES STRAIGHT. ZOOM!', fen: '8/8/8/8/8/8/8/R7 w - - 0 1', stars: ['a6', 'f6', 'f1'] },
    { id: 'bishop', type: BISHOP, title: 'BISHOP', say: 'THE BISHOP GOES ON THE SLANT.', tip: 'IT STAYS ON ITS OWN COLOUR!', fen: '8/8/8/8/8/8/8/2B5 w - - 0 1', stars: ['e3', 'h6', 'f8'] },
    { id: 'knight', type: KNIGHT, title: 'KNIGHT', say: 'THE KNIGHT HOPS IN AN L. IT CAN JUMP!', fen: '8/8/8/8/8/8/PPPP4/1N6 w - - 0 1', stars: ['c3', 'd5', 'f6'] },
    { id: 'queen', type: QUEEN, title: 'QUEEN', say: 'THE QUEEN GOES ANY WAY. SUPER STRONG!', fen: '8/8/8/8/8/8/8/3Q4 w - - 0 1', stars: ['d4', 'g7', 'b7'] },
    { id: 'king', type: KING, title: 'KING', say: 'THE KING TAKES ONE STEP AT A TIME.', tip: 'KEEP HIM SAFE!', fen: '8/8/8/8/8/8/8/4K3 w - - 0 1', stars: ['e2', 'f3', 'e4'] },
    { id: 'rookstar', challenge: 'star', type: ROOK, emoji: '⭐', title: 'ROOK TO THE STAR', say: 'GET THE ROOK TO THE STAR! 3 MOVES IS 3 STARS.', fen: '8/P7/8/8/8/8/8/R5N1 w - - 0 1', stars: ['h8'], par: 3 },
    { id: 'race', challenge: 'race', type: PAWN, emoji: '🏁', title: 'PAWN RACE', say: 'PAWN RACE! GET TO THE END FIRST!', fen: '8/8/1p6/8/8/8/4P3/8 w - - 0 1', stars: [] },
    { id: 'catch', challenge: 'catch', type: QUEEN, emoji: '🐴', title: 'CATCH THE KNIGHT', say: 'CATCH THE KNIGHT! IT HOPS AWAY.', fen: '8/8/8/4n3/8/8/8/3Q4 w - - 0 1', stars: [], par: 4 },
    {
      id: 'mate', challenge: 'mate', type: KING, emoji: '👑', title: 'CHECKMATE!', say: 'TRAP THE KING IN ONE MOVE!',
      rounds: [{ fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', type: ROOK }, { fen: 'k7/8/1K6/8/8/8/8/2Q5 w - - 0 1', type: QUEEN }], stars: [],
    },
  ];

  let api = null;
  const L = { i: -1, lesson: null, pos: null, stars: [], got: 0, moves: 0, turnId: 0, foxyT: -1, resetT: -1, doneT: -1, doneStars: 0, over: false, round: 0, mistakes: 0, movable: PAWN };

  const sq88 = (sq) => CH.to88(sq);
  const colourOfSide = (side) => (side === W ? api.kidColour() : 1 - api.kidColour());
  function list() {
    const out = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = L.pos.b[sq88(sq)];
      if (p) out.push({ sq, colour: colourOfSide(p >> 3), type: p & 7 });
    }
    return out;
  }

  function init(a) {
    api = a;
  }

  // ---------------------------------------------------------------- open, go, restart

  function open(i) {
    L.i = i;
    L.lesson = LESSONS[i];
    L.round = 0;
    L.mistakes = 0;
    setup();
    // the picture card first
    const ui = api.ui(), art = api.art(), c = api.kidColour(), l = L.lesson;
    ui.iTitle.textContent = l.title;
    ui.iSay.textContent = l.say;
    const pic = `<img alt="" src="${art.pieces[c][l.type]}">`;
    ui.iPic.innerHTML = l.challenge ? `${pic}<span class="emo">${l.emoji}</span>` : pic + diagram(l.type, art.pieces[c][l.type]);
    ui.lTitle.textContent = l.title;
    ui.lSay.textContent = l.say;
    ui.lPic.src = art.pieces[c][l.type];
    api.show(ui.intro, true);
    api.setState('intro');
    bar();
  }
  function go() {
    if (api.state !== 'intro') return;
    api.show(api.ui().intro, false);
    api.setState('lesson');
    CH.sfx.kit('click');
    api.toast(L.lesson.say, 'hint');
  }
  function close() {
    L.i = -1;
    L.lesson = null;
    L.foxyT = L.resetT = L.doneT = -1;
  }

  // the board for this lesson (or this round of it)
  function setup() {
    const l = L.lesson;
    const r = l.rounds ? l.rounds[L.round] : null;
    L.pos = CH.fromFen(r ? r.fen : l.fen);
    L.movable = r ? r.type : l.type;
    L.stars = l.stars.map((s) => CH.sqOf(s));
    L.got = 0;
    L.moves = 0;
    L.over = false;
    L.foxyT = L.resetT = L.doneT = -1;
    L.turnId++;
    CH.stage.setView(W);
    CH.stage.setPieces(list());
    CH.stage.stars(L.stars);
    CH.stage.last(-1, -1);
    CH.stage.check(-1);
    CH.stage.hint(-1, -1, -1);
    api.select(-1);
    bar();
  }
  function restart() {
    if (!L.lesson) return;
    if (api.state === 'intro') return;
    api.setState('lesson');
    setup();
    CH.sfx.undo();
    api.toast('🔄', 'hint');
  }

  function bar() {
    const ui = api.ui(), l = L.lesson;
    if (!l) return;
    let s = '';
    if (!l.challenge) s = `⭐ ${L.got}/${l.stars.length}`;
    else if (l.challenge === 'mate') s = `${L.round + 1}/${l.rounds.length}`;
    else if (l.challenge === 'race') s = '🏁';
    else s = `MOVES: ${L.moves}`;
    ui.lStars.textContent = s;
  }

  // ---------------------------------------------------------------- the rules the game's taps go through

  const canAct = () => !!L.lesson && api.state === 'lesson' && !L.over && L.pos.turn === W && L.foxyT < 0 && L.resetT < 0;
  function movable(sq) {
    if (!canAct()) return false;
    const p = L.pos.b[sq88(sq)];
    return !!p && p >> 3 === W && (p & 7) === L.movable;
  }
  function movesFrom(sq) {
    if (!movable(sq)) return [];
    const s = sq88(sq), out = [];
    for (const m of L.pos.legal()) {
      if (CH.mFrom(m) !== s) continue;
      const d = CH.describe(L.pos, m);
      if (d.promo && d.promo !== QUEEN) continue; // in the lessons a pawn at the end always becomes a queen
      // the knight in the chase never gets bonked by... it's the other way round: Foxy's knight never bonks back
      d.promos = d.promo ? [QUEEN] : [];
      out.push(d);
    }
    return out;
  }
  const typeAt = (sq) => L.pos.b[sq88(sq)] & 7;
  function play(from, to) {
    if (!canAct()) return null;
    const m = L.pos.legal().find((x) => CH.mFrom(x) === sq88(from) && CH.mTo(x) === sq88(to) && (!CH.mPromo(x) || CH.mPromo(x) === QUEEN));
    if (!m) return null;
    const ev = CH.describe(L.pos, m);
    L.pos.make(m);
    L.moves++;
    L.turnId++;
    return ev;
  }

  // ---------------------------------------------------------------- after a move

  function landed(ev) {
    if (!L.lesson || api.state !== 'lesson') return;
    const l = L.lesson;
    const kid = api.kid().actor, foxy = api.foxy().actor;
    if (ev.side === W) {
      // a star?
      const k = L.stars.indexOf(ev.to);
      if (k >= 0) {
        L.stars[k] = -1;
        L.got++;
        CH.sfx.star();
        const p = CH.stage.cellPos(ev.to);
        api.bursts.add('⭐', p.x, CH.stage.TOP + 1.4, p.z, 1.4, '#fff3a0', '#ffb02e');
        for (let i = 0; i < 8; i++) api.flyers.add('⭐', p.x, CH.stage.TOP + 0.8, p.z, Kit.gfx.rand(-2, 2), Kit.gfx.rand(1.5, 3), 0.4, 0.8, Kit.gfx.rand(-4, 4), 5);
        kid.react('cheer');
        foxy.react('hop');
        CH.stage.stars(L.stars);
      }
      bar();
      if (!l.challenge) return afterStar();
      if (l.challenge === 'star') {
        if (L.stars.every((s) => s < 0)) return finish(L.moves <= l.par ? 3 : L.moves <= l.par + 1 ? 2 : 1);
        L.pos.turn = W;
        return;
      }
      if (l.challenge === 'race') {
        if (ev.promo) {
          const p = CH.stage.cellPos(ev.to);
          api.bursts.add('YOU WIN!', p.x, CH.stage.TOP + 1.8, p.z, 2, '#ffd400', '#e8372c');
          return finish(3);
        }
        L.foxyT = 0.55;
        return;
      }
      if (l.challenge === 'catch') {
        if (ev.captured) return finish(L.moves <= l.par ? 3 : L.moves <= l.par + 3 ? 2 : 1);
        L.foxyT = 0.5;
        return;
      }
      if (l.challenge === 'mate') {
        const mate = L.pos.inCheck() && !L.pos.legal().length;
        if (mate) {
          const kp = CH.stage.cellPos(CH.to64(L.pos.king[B]));
          api.bursts.add('CHECKMATE!', kp.x, CH.stage.TOP + 1.8, kp.z, 2.2, '#ffd400', '#e8372c');
          kid.react('cheer');
          if (L.round + 1 < l.rounds.length) {
            L.over = true;
            L.resetT = 1.6;
            L.next = true;
            api.toast('YES! CHECKMATE!', 'save');
            return;
          }
          return finish(Math.max(1, 3 - L.mistakes));
        }
        L.mistakes++;
        api.toast(!L.pos.inCheck() && !L.pos.legal().length ? 'OOPS, STALEMATE! THAT IS A DRAW. TRY AGAIN!' : 'NOT CHECKMATE YET! TRY AGAIN!', 'hint');
        CH.sfx.nope();
        L.over = true;
        L.resetT = 1.6;
      }
    } else {
      // Foxy moved
      if (l.challenge === 'race' && ev.promo) {
        api.toast('FOXY WON THE RACE! TRY THE BIG FIRST STEP!', 'hint');
        CH.sfx.lose();
        foxy.react('signature');
        kid.react('shrug');
        L.over = true;
        L.resetT = 2.2;
      }
    }
  }

  // the piece lessons: all the stars, or a star that can't be reached any more
  function afterStar() {
    const l = L.lesson;
    L.pos.turn = W; // Foxy doesn't move in these: your turn again
    L.pos.ep = -1;
    const left = L.stars.filter((s) => s >= 0);
    if (!left.length) return finish(3);
    if (l.tip && left.length === 1 && !L.tipped) {
      L.tipped = true;
      api.toast(l.tip, 'hint');
    }
    if (!reachable(left)) {
      api.toast("OOPS! LET'S TRY AGAIN!", 'hint');
      CH.sfx.nope();
      L.over = true;
      L.resetT = 1.4;
    }
  }

  // Can the lesson's piece still get to every star? (a walk over the squares it can reach, the rest of the board
  // as it is)
  function pieceSq() {
    for (let sq = 0; sq < 64; sq++) {
      const p = L.pos.b[sq88(sq)];
      if (p && p >> 3 === W && (p & 7) === L.movable) return sq;
    }
    return -1;
  }
  function stepsFrom(sq) {
    const pos = L.pos, s = sq88(sq), home = sq88(pieceSq());
    const piece = pos.b[home];
    const under = pos.b[s];
    pos.b[home] = 0;
    pos.b[s] = piece;
    const saveTurn = pos.turn;
    pos.turn = W;
    const out = pos.gen([]).filter((m) => CH.mFrom(m) === s).map((m) => CH.to64(CH.mTo(m)));
    pos.turn = saveTurn;
    pos.b[s] = under;
    pos.b[home] = piece;
    return out;
  }
  // shortest paths from the piece: { dist: [sq] → moves, first: [sq] → the first step }
  function walk() {
    const from = pieceSq();
    const dist = new Array(64).fill(-1), first = new Array(64).fill(-1);
    if (from < 0) return { dist, first, from };
    dist[from] = 0;
    const q = [from];
    while (q.length) {
      const s = q.shift();
      for (const t of stepsFrom(s)) {
        if (dist[t] >= 0) continue;
        dist[t] = dist[s] + 1;
        first[t] = s === from ? t : first[s];
        if (L.pos.b[sq88(t)] && t !== from) continue; // a capture ends the walk there
        q.push(t);
      }
    }
    return { dist, first, from };
  }
  function reachable(stars) {
    if (L.movable === PAWN) {
      // a pawn only goes forward: the stars must be reachable one after another
      const w = walk();
      return stars.every((s) => w.dist[s] >= 0) && orderedPawn(stars);
    }
    const w = walk();
    return stars.every((s) => w.dist[s] >= 0);
  }
  // for the pawn lesson: from where it is, can it reach every star in some order?
  function orderedPawn(stars) {
    const from = pieceSq();
    const reach = (a, b) => {
      // b ahead of a and either the same file (a step forward) or one file over with a piece to bonk
      const fa = a & 7, fb = b & 7, ra = a >> 3, rb = b >> 3;
      if (rb <= ra) return false;
      if (fa === fb) return true;
      return Math.abs(fa - fb) === 1 && rb === ra + 1;
    };
    const go = (at, left) => !left.length || left.some((s) => reach(at, s) && go(s, left.filter((x) => x !== s)));
    return go(from, stars);
  }

  function finish(stars) {
    L.over = true;
    L.foxyT = L.resetT = -1;
    L.doneT = 0.9;
    L.doneStars = stars;
  }

  // ---------------------------------------------------------------- Foxy's moves in the race and the chase

  function foxyMove() {
    const pos = L.pos, l = L.lesson;
    pos.ep = pos.ep >= 0 ? pos.ep : -1;
    let moves = pos.legal();
    if (l.challenge === 'catch') {
      // the knight hops to a square the queen can't reach, mostly; it never bonks the queen
      moves = moves.filter((m) => !(CH.mFlags(m) & CH.F_CAP));
      const safe = moves.filter((m) => {
        pos.make(m);
        const hit = pos.attacked(CH.mTo(m), W);
        pos.unmake();
        return !hit;
      });
      if (safe.length && Math.random() < 0.7) moves = safe;
    }
    if (!moves.length) {
      pos.turn = W;
      return;
    }
    const m = moves[Math.floor(Math.random() * moves.length)];
    const ev = CH.describe(pos, m);
    pos.make(m);
    L.turnId++;
    api.foxy().actor.act('give', 0.45, 0, true);
    api.animate(ev, (e) => {
      landed(e);
      if (!L.over) L.pos.turn = W;
    });
  }

  function update(dt) {
    if (!L.lesson || api.state !== 'lesson') return;
    if (L.doneT >= 0) {
      L.doneT -= dt;
      if (L.doneT < 0) api.done(L.lesson, L.doneStars);
      return;
    }
    if (L.foxyT >= 0) {
      L.foxyT -= dt;
      if (L.foxyT < 0) foxyMove();
    }
    if (L.resetT >= 0) {
      L.resetT -= dt;
      if (L.resetT < 0) {
        if (L.next) {
          L.next = false;
          L.round++;
        }
        L.tipped = false;
        setup();
      }
    }
  }

  // ---------------------------------------------------------------- your brother's hint

  function hint() {
    if (!canAct()) return null;
    const l = L.lesson, pos = L.pos;
    const from = pieceSq();
    if (from < 0) return null;
    const name = CH.NAMES[L.movable];
    const own = (m) => CH.mFrom(m) === sq88(from) && (!CH.mPromo(m) || CH.mPromo(m) === QUEEN);
    if (l.challenge === 'mate') {
      for (const m of pos.legal().filter(own)) {
        pos.make(m);
        const mate = pos.inCheck() && !pos.legal().length;
        pos.unmake();
        if (mate) return { from, to: CH.to64(CH.mTo(m)), text: `CHECKMATE! MOVE THE ${name}!`, kind: 'mate' };
      }
      return null;
    }
    if (l.challenge === 'race') {
      const m = pos.legal().filter(own).sort((a, b) => Math.abs(CH.mTo(b) - CH.mFrom(b)) - Math.abs(CH.mTo(a) - CH.mFrom(a)))[0];
      if (!m) return null;
      return { from, to: CH.to64(CH.mTo(m)), text: CH.mFlags(m) & CH.F_DOUBLE ? 'USE THE BIG FIRST STEP!' : 'KEEP GOING!', kind: 'move' };
    }
    if (l.challenge === 'catch') {
      const mine = pos.legal().filter(own);
      const take = mine.find((m) => CH.mFlags(m) & CH.F_CAP);
      if (take) return { from, to: CH.to64(CH.mTo(take)), text: 'BONK THE KNIGHT!', kind: 'bonk' };
      // the queen move that leaves the knight the fewest safe squares (and isn't next to it)
      let best = null, bestN = 99;
      for (const m of mine) {
        pos.make(m); // now it's the knight's move: how many safe squares has it?
        const escapes = pos.legal().filter((x) => {
          pos.make(x);
          const hit = pos.attacked(CH.mTo(x), W);
          pos.unmake();
          return !hit;
        }).length;
        pos.unmake();
        if (escapes < bestN) {
          bestN = escapes;
          best = m;
        }
      }
      return best ? { from, to: CH.to64(CH.mTo(best)), text: 'CORNER THE KNIGHT!', kind: 'move' } : null;
    }
    // the stars: the first step of the shortest way to the nearest star
    const w = walk();
    const targets = L.stars.filter((s) => s >= 0 && w.dist[s] > 0).sort((a, b) => w.dist[a] - w.dist[b]);
    if (!targets.length) return null;
    const t = targets[0];
    const bonk = !!L.pos.b[sq88(w.first[t])];
    return { from, to: w.first[t], text: bonk ? 'BONK ON THE SLANT!' : w.first[t] === t ? 'GO TO THE STAR!' : `MOVE THE ${name}!`, kind: 'move' };
  }

  // ---------------------------------------------------------------- the picture: where a piece can go

  // A little 7 × 7 board with the piece in the middle: green dots where it can go, red rings where a pawn bonks.
  function diagram(type, img) {
    const on = new Set(), x = new Set(), two = new Set();
    const at = (c, r) => (c >= 0 && c < 7 && r >= 0 && r < 7 ? r * 7 + c : -1);
    const ray = (dc, dr) => {
      for (let k = 1; k < 7; k++) {
        const i = at(3 + dc * k, 3 + dr * k);
        if (i < 0) break;
        on.add(i);
      }
    };
    if (type === PAWN) {
      on.add(at(3, 2));
      on.add(at(3, 1));
      two.add(at(3, 1));
      x.add(at(2, 2));
      x.add(at(4, 2));
    } else if (type === KNIGHT) [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(([dc, dr]) => on.add(at(3 + dc, 3 + dr)));
    else if (type === KING) for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (dc || dr) on.add(at(3 + dc, 3 + dr));
    else {
      if (type !== ROOK) [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => ray(a, b));
      if (type !== BISHOP) [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => ray(a, b));
    }
    let h = '<div class="diag">';
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const i = r * 7 + c;
        const cls = [(r + c) % 2 ? 'd' : '', on.has(i) ? 'on' : '', x.has(i) ? 'x' : '', two.has(i) ? 'two' : ''].filter(Boolean).join(' ');
        h += `<i class="${cls}">${i === 24 ? `<img alt="" src="${img}">` : ''}</i>`;
      }
    }
    return h + '</div>';
  }

  CH.learn = {
    init, open, go, close, restart, update, hint, canAct, movable, movesFrom, typeAt, play, landed, diagram,
    lessons: LESSONS,
    get index() { return L.i; },
    get turnId() { return L.turnId; },
    get active() { return !!L.lesson; },
    info() {
      if (!L.lesson) return null;
      return { i: L.i, id: L.lesson.id, starsLeft: L.stars.filter((s) => s >= 0).map(CH.sqName), got: L.got, moves: L.moves, over: L.over, round: L.round, fen: CH.toFen(L.pos) };
    },
  };
})();

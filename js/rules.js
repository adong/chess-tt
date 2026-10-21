/* TT Chess: the rules of chess, the CPU levels and your brother's hint. No Three.js and no page in here, so the same
   file runs the game and the headless checks (js/check.js, tools/check.js under Node).
   - The board is 0x88 inside (square = rank * 16 + file, rank 0 is White's back row); outside, squares are 0..63
     (rank * 8 + file). A piece is side * 8 + type: White 1..6, Black 9..14 (pawn, knight, bishop, rook, queen, king).
   - White (W) moves first. Which brother plays White changes from game to game; js/game.js maps W and B to the
     blue (Teddy) and orange (Tommy) pieces.
   - Every rule: all the moves, castling on both sides (the king isn't in check, doesn't pass through or land on an
     attacked square, and neither the king nor that rook has moved), en passant, promotion to a queen, rook, bishop or
     knight, check, checkmate, stalemate, and the draws: threefold repetition, the 50-move rule, not enough pieces left
     to checkmate.
   - The CPU (Foxy 🦊): 🐣 EASY makes gentle mistakes but always takes a free queen; 🔥 NORMAL is alpha-beta 3 moves
     deep with piece-square tables; 🧠 HARD searches deeper for up to about 0.7 s with move ordering (a hash table,
     captures first, killer moves, history), quiescence search and a check extension. A search is a job that the game
     runs a slice at a time (job.step(ms)) so the page never freezes. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const CH = (root.CH = root.CH || {});

  const W = 0, B = 1;
  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  const NAMES = ['', 'PAWN', 'KNIGHT', 'BISHOP', 'ROOK', 'QUEEN', 'KING'];
  const LETTER = ' pnbrqk';
  const VAL = [0, 100, 320, 330, 500, 900, 0];

  // move flags, and a move packed in one int: from | to << 7 | promo << 14 | flags << 17 (squares in 0x88)
  const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8, F_PROMO = 16;
  const mk = (f, t, p, fl) => f | (t << 7) | (p << 14) | (fl << 17);
  const mFrom = (m) => m & 127, mTo = (m) => (m >> 7) & 127, mPromo = (m) => (m >> 14) & 7, mFlags = (m) => m >> 17;

  const KN = [33, 31, 18, 14, -33, -31, -18, -14];
  const KG = [1, -1, 16, -16, 17, 15, -17, -15];
  const DIAG = [17, 15, -17, -15], ORTH = [1, -1, 16, -16];

  const to88 = (sq) => ((sq >> 3) << 4) | (sq & 7);
  const to64 = (s) => ((s >> 4) << 3) | (s & 7);
  const FILES = 'abcdefgh';
  const sqName = (sq) => FILES[sq & 7] + ((sq >> 3) + 1);
  const sqOf = (name) => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);

  // castling rights: 1 White short, 2 White long, 4 Black short, 8 Black long. A king or rook leaving (or a rook
  // being taken on) its first square clears the rights that need it.
  const CASTLE_MASK = new Int8Array(128).fill(15);
  CASTLE_MASK[0x04] = 15 & ~3;
  CASTLE_MASK[0x00] = 15 & ~2;
  CASTLE_MASK[0x07] = 15 & ~1;
  CASTLE_MASK[0x74] = 15 & ~12;
  CASTLE_MASK[0x70] = 15 & ~8;
  CASTLE_MASK[0x77] = 15 & ~4;

  // the sabotages the checks use to prove they can fail (js/check.js). Off in the game.
  const SAB = (CH.sabotage = CH.sabotage || {});

  // ---------------------------------------------------------------- hashing (Zobrist, two 32-bit halves)

  let seed = 0x2545f491;
  const rnd32 = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
  const Z1 = new Int32Array(16 * 128), Z2 = new Int32Array(16 * 128);
  for (let i = 0; i < Z1.length; i++) {
    Z1[i] = rnd32();
    Z2[i] = rnd32();
  }
  const ZC1 = new Int32Array(16), ZC2 = new Int32Array(16), ZE1 = new Int32Array(8), ZE2 = new Int32Array(8);
  for (let i = 0; i < 16; i++) {
    ZC1[i] = rnd32();
    ZC2[i] = rnd32();
  }
  for (let i = 0; i < 8; i++) {
    ZE1[i] = rnd32();
    ZE2[i] = rnd32();
  }
  const ZT1 = rnd32(), ZT2 = rnd32();

  // ---------------------------------------------------------------- a position

  function Pos(cap = 16384) {
    this.b = new Int8Array(128);
    this.turn = W;
    this.castle = 0;
    this.ep = -1;           // the square a pawn just skipped over (0x88), or -1
    this.half = 0;          // moves since the last capture or pawn move (the 50-move rule counts these)
    this.full = 1;
    this.king = [-1, -1];
    this.h1 = 0;
    this.h2 = 0;
    this.ply = 0;           // the undo stack
    this.uMove = new Int32Array(cap);
    this.uCap = new Int8Array(cap);
    this.uCastle = new Int8Array(cap);
    this.uEp = new Int16Array(cap);
    this.uHalf = new Int16Array(cap);
    this.uH1 = new Int32Array(cap);
    this.uH2 = new Int32Array(cap);
    this.hh = new Int32Array(cap + 64); // the hash after every move (and the start), for repetitions
    this.hp = 0;
  }
  const P = Pos.prototype;

  P.rehash = function () {
    let h1 = 0, h2 = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const p = this.b[s];
      if (p) {
        h1 ^= Z1[p * 128 + s];
        h2 ^= Z2[p * 128 + s];
      }
    }
    h1 ^= ZC1[this.castle];
    h2 ^= ZC2[this.castle];
    if (this.ep >= 0) {
      h1 ^= ZE1[this.ep & 7];
      h2 ^= ZE2[this.ep & 7];
    }
    if (this.turn === B) {
      h1 ^= ZT1;
      h2 ^= ZT2;
    }
    this.h1 = h1;
    this.h2 = h2;
  };

  // A copy for a search: the board and the repetition history, with a short undo stack of its own.
  P.clone = function (cap = 256) {
    const q = new Pos(this.hp + cap);
    q.b.set(this.b);
    q.turn = this.turn;
    q.castle = this.castle;
    q.ep = this.ep;
    q.half = this.half;
    q.full = this.full;
    q.king = this.king.slice();
    q.h1 = this.h1;
    q.h2 = this.h2;
    q.hh.set(this.hh.subarray(0, this.hp));
    q.hp = this.hp;
    return q;
  };

  // Is square s (0x88) attacked by side `by`?
  P.attacked = function (s, by) {
    if (s < 0) return false;
    const b = this.b;
    const pp = (by << 3) | PAWN;
    const back = by === W ? -16 : 16;
    let t = s + back - 1;
    if (!(t & 0x88) && b[t] === pp) return true;
    t = s + back + 1;
    if (!(t & 0x88) && b[t] === pp) return true;
    const kn = (by << 3) | KNIGHT, kg = (by << 3) | KING;
    for (let i = 0; i < 8; i++) {
      t = s + KN[i];
      if (!(t & 0x88) && b[t] === kn) return true;
      t = s + KG[i];
      if (!(t & 0x88) && b[t] === kg) return true;
    }
    const bi = (by << 3) | BISHOP, ro = (by << 3) | ROOK, qu = (by << 3) | QUEEN;
    for (let i = 0; i < 4; i++) {
      let d = DIAG[i];
      t = s + d;
      while (!(t & 0x88)) {
        const p = b[t];
        if (p) {
          if (p === bi || p === qu) return true;
          break;
        }
        t += d;
      }
      d = ORTH[i];
      t = s + d;
      while (!(t & 0x88)) {
        const p = b[t];
        if (p) {
          if (p === ro || p === qu) return true;
          break;
        }
        t += d;
      }
    }
    return false;
  };

  P.inCheck = function (side = this.turn) {
    return this.attacked(this.king[side], side ^ 1);
  };

  // Every pseudo-legal move for the side to move, pushed onto `out` (captures and queen promotions only if capsOnly).
  P.gen = function (out, capsOnly = false) {
    const b = this.b, us = this.turn, them = us ^ 1;
    const dir = us === W ? 16 : -16, startRank = us === W ? 1 : 6, lastRank = us === W ? 7 : 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const p = b[s];
      if (!p || p >> 3 !== us) continue;
      const type = p & 7;
      if (type === PAWN) {
        const one = s + dir;
        const promo = one >> 4 === lastRank;
        if (!(one & 0x88) && !b[one]) {
          if (promo) {
            out.push(mk(s, one, QUEEN, F_PROMO));
            if (!capsOnly) {
              out.push(mk(s, one, ROOK, F_PROMO));
              out.push(mk(s, one, BISHOP, F_PROMO));
              out.push(mk(s, one, KNIGHT, F_PROMO));
            }
          } else if (!capsOnly) {
            out.push(mk(s, one, 0, 0));
            const two = one + dir;
            if (s >> 4 === startRank && !b[two] && !SAB.nodouble) out.push(mk(s, two, 0, F_DOUBLE));
          }
        }
        for (const t of [one - 1, one + 1]) {
          if (t & 0x88) continue;
          const q = b[t];
          if (q && q >> 3 === them) {
            if (promo) {
              out.push(mk(s, t, QUEEN, F_PROMO | F_CAP));
              if (!capsOnly) {
                out.push(mk(s, t, ROOK, F_PROMO | F_CAP));
                out.push(mk(s, t, BISHOP, F_PROMO | F_CAP));
                out.push(mk(s, t, KNIGHT, F_PROMO | F_CAP));
              }
            } else out.push(mk(s, t, 0, F_CAP));
          } else if (t === this.ep && !q && !SAB.noep) out.push(mk(s, t, 0, F_EP | F_CAP));
        }
      } else if (type === KNIGHT || type === KING) {
        const steps = type === KNIGHT ? KN : KG;
        for (let i = 0; i < 8; i++) {
          const t = s + steps[i];
          if (t & 0x88) continue;
          const q = b[t];
          if (!q) {
            if (!capsOnly) out.push(mk(s, t, 0, 0));
          } else if (q >> 3 === them) out.push(mk(s, t, 0, F_CAP));
        }
        if (type === KING && !capsOnly) this.genCastles(out, s);
      } else {
        const rays = type === BISHOP ? DIAG : type === ROOK ? ORTH : KG;
        for (let i = 0; i < rays.length; i++) {
          const d = rays[i];
          let t = s + d;
          while (!(t & 0x88)) {
            const q = b[t];
            if (!q) {
              if (!capsOnly) out.push(mk(s, t, 0, 0));
            } else {
              if (q >> 3 === them) out.push(mk(s, t, 0, F_CAP));
              break;
            }
            t += d;
          }
        }
      }
    }
    return out;
  };

  // Castling: the right still there (neither piece has moved), the rook in its corner, the squares between empty,
  // and the king not in check, not passing through an attacked square and not landing on one.
  P.genCastles = function (out, s) {
    const b = this.b, us = this.turn, them = us ^ 1, base = us === W ? 0 : 0x70;
    if (s !== base + 4) return;
    const rook = (us << 3) | ROOK;
    const safe = (sq) => SAB.castlecheck || !this.attacked(sq, them);
    if (this.castle & (us === W ? 1 : 4) && b[base + 7] === rook && !b[base + 5] && !b[base + 6]) {
      if (safe(base + 4) && safe(base + 5) && this.safeLanding(base + 6)) out.push(mk(s, base + 6, 0, F_CASTLE));
    }
    if (this.castle & (us === W ? 2 : 8) && b[base] === rook && !b[base + 1] && !b[base + 2] && !b[base + 3]) {
      if (safe(base + 4) && safe(base + 3) && this.safeLanding(base + 2)) out.push(mk(s, base + 2, 0, F_CASTLE));
    }
  };
  // (landing in check is caught by the legality test after the move anyway; this keeps castles out of the list early)
  P.safeLanding = function (sq) {
    return !this.attacked(sq, this.turn ^ 1);
  };

  P.make = function (m) {
    const b = this.b, from = m & 127, to = (m >> 7) & 127, pr = (m >> 14) & 7, fl = m >> 17;
    const p = b[from], side = p >> 3;
    const u = this.ply++;
    this.uMove[u] = m;
    this.uCastle[u] = this.castle;
    this.uEp[u] = this.ep;
    this.uHalf[u] = this.half;
    this.uH1[u] = this.h1;
    this.uH2[u] = this.h2;
    let h1 = this.h1, h2 = this.h2;
    let cap;
    if (fl & F_EP) {
      const cs = to + (side === W ? -16 : 16);
      cap = b[cs];
      b[cs] = 0;
      h1 ^= Z1[cap * 128 + cs];
      h2 ^= Z2[cap * 128 + cs];
    } else {
      cap = b[to];
      if (cap) {
        h1 ^= Z1[cap * 128 + to];
        h2 ^= Z2[cap * 128 + to];
      }
    }
    this.uCap[u] = cap;
    h1 ^= Z1[p * 128 + from];
    h2 ^= Z2[p * 128 + from];
    b[from] = 0;
    const np = pr ? (side << 3) | pr : p;
    b[to] = np;
    h1 ^= Z1[np * 128 + to];
    h2 ^= Z2[np * 128 + to];
    if ((p & 7) === KING) {
      this.king[side] = to;
      if (fl & F_CASTLE) {
        const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1, r = b[rf];
        b[rf] = 0;
        b[rt] = r;
        h1 ^= Z1[r * 128 + rf] ^ Z1[r * 128 + rt];
        h2 ^= Z2[r * 128 + rf] ^ Z2[r * 128 + rt];
      }
    }
    h1 ^= ZC1[this.castle];
    h2 ^= ZC2[this.castle];
    if (!SAB.castlemoved) this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
    h1 ^= ZC1[this.castle];
    h2 ^= ZC2[this.castle];
    if (this.ep >= 0) {
      h1 ^= ZE1[this.ep & 7];
      h2 ^= ZE2[this.ep & 7];
    }
    this.ep = fl & F_DOUBLE ? (from + to) >> 1 : -1;
    if (this.ep >= 0) {
      h1 ^= ZE1[this.ep & 7];
      h2 ^= ZE2[this.ep & 7];
    }
    this.half = (p & 7) === PAWN || cap ? 0 : this.half + 1;
    if (side === B) this.full++;
    this.turn ^= 1;
    h1 ^= ZT1;
    h2 ^= ZT2;
    this.h1 = h1;
    this.h2 = h2;
    this.hh[this.hp++] = h1;
  };

  P.unmake = function () {
    const u = --this.ply;
    const m = this.uMove[u], b = this.b;
    const from = m & 127, to = (m >> 7) & 127, pr = (m >> 14) & 7, fl = m >> 17;
    this.turn ^= 1;
    const side = this.turn;
    let p = b[to];
    if (pr) p = (side << 3) | PAWN;
    b[from] = p;
    b[to] = 0;
    if (fl & F_EP) b[to + (side === W ? -16 : 16)] = this.uCap[u];
    else b[to] = this.uCap[u];
    if ((p & 7) === KING) {
      this.king[side] = from;
      if (fl & F_CASTLE) {
        const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1;
        b[rf] = b[rt];
        b[rt] = 0;
      }
    }
    this.castle = this.uCastle[u];
    this.ep = this.uEp[u];
    this.half = this.uHalf[u];
    this.h1 = this.uH1[u];
    this.h2 = this.uH2[u];
    if (side === B) this.full--;
    this.hp--;
  };

  // Make m if it doesn't leave your own king in check; true if it was made.
  P.tryMake = function (m) {
    const us = this.turn;
    this.make(m);
    if (!SAB.selfcheck && this.attacked(this.king[us], us ^ 1)) {
      this.unmake();
      return false;
    }
    return true;
  };

  P.legal = function () {
    const out = [];
    for (const m of this.gen([])) {
      if (this.tryMake(m)) {
        this.unmake();
        out.push(m);
      }
    }
    return out;
  };

  P.perft = function (d) {
    if (d === 0) return 1;
    const list = this.gen([]);
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      if (!this.tryMake(list[i])) continue;
      n += d === 1 ? 1 : this.perft(d - 1);
      this.unmake();
    }
    return n;
  };

  // The position seen before (for the threefold rule): the same pieces, side to move, castling rights and en passant.
  // En passant only counts when a pawn could really take that way, so the hash drops it otherwise.
  P.key = function () {
    let h1 = this.h1, h2 = this.h2;
    if (this.ep >= 0 && !this.legal().some((m) => (m >> 17) & F_EP)) {
      h1 ^= ZE1[this.ep & 7];
      h2 ^= ZE2[this.ep & 7];
    }
    return (h1 >>> 0).toString(36) + ':' + (h2 >>> 0).toString(36);
  };

  // Not enough left for anyone to checkmate: king against king, a king and one bishop or knight against a king, or
  // kings and bishops that all stand on the same colour of square.
  P.deadDraw = function () {
    if (SAB.nomaterial) return false;
    let minors = 0, knights = 0, light = 0, dark = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const t = this.b[s] & 7;
      if (!t || t === KING) continue;
      if (t === PAWN || t === ROOK || t === QUEEN) return false;
      minors++;
      if (t === KNIGHT) knights++;
      else if (((s >> 4) + (s & 7)) & 1) light++;
      else dark++;
    }
    if (minors <= 1) return true;
    return knights === 0 && (light === 0 || dark === 0);
  };

  // ---------------------------------------------------------------- FEN

  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  function fromFen(fen = START) {
    const pos = new Pos();
    const [placement, turn, castle, ep, half, full] = fen.trim().split(/\s+/);
    let r = 7, f = 0;
    for (const ch of placement) {
      if (ch === '/') {
        r--;
        f = 0;
      } else if (/\d/.test(ch)) f += +ch;
      else {
        const t = LETTER.indexOf(ch.toLowerCase());
        const side = ch === ch.toLowerCase() ? B : W;
        const s = r * 16 + f;
        pos.b[s] = (side << 3) | t;
        if (t === KING) pos.king[side] = s;
        f++;
      }
    }
    pos.turn = turn === 'b' ? B : W;
    pos.castle = (castle || '-').split('').reduce((a, c) => a | ({ K: 1, Q: 2, k: 4, q: 8 }[c] || 0), 0);
    pos.ep = ep && ep !== '-' ? to88(sqOf(ep)) : -1;
    pos.half = +(half || 0);
    pos.full = +(full || 1);
    pos.rehash();
    pos.hh[pos.hp++] = pos.h1;
    return pos;
  }
  function toFen(pos) {
    let out = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = pos.b[r * 16 + f];
        if (!p) empty++;
        else {
          if (empty) out += empty;
          empty = 0;
          const l = LETTER[p & 7];
          out += p >> 3 === W ? l.toUpperCase() : l;
        }
      }
      if (empty) out += empty;
      if (r) out += '/';
    }
    const c = (pos.castle & 1 ? 'K' : '') + (pos.castle & 2 ? 'Q' : '') + (pos.castle & 4 ? 'k' : '') + (pos.castle & 8 ? 'q' : '') || '-';
    return `${out} ${pos.turn === W ? 'w' : 'b'} ${c} ${pos.ep >= 0 ? sqName(to64(pos.ep)) : '-'} ${pos.half} ${pos.full}`;
  }

  const uci = (m) => sqName(to64(mFrom(m))) + sqName(to64(mTo(m))) + (mPromo(m) ? LETTER[mPromo(m)] : '');

  // ---------------------------------------------------------------- evaluation (centipawns, for the side to move)

  // piece-square tables (Tomasz Michniewski's "simplified evaluation function"), from White's side, rank 8 first
  const PST_SRC = {
    1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    7: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };
  // PST[side][type 1..7 (7 = the king in the endgame)][0x88 square]
  const PST = [[], []];
  for (let t = 1; t <= 7; t++) {
    for (const side of [W, B]) {
      const a = new Int16Array(128);
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) a[r * 16 + f] = PST_SRC[t][(side === W ? 7 - r : r) * 8 + f];
      PST[side][t] = a;
    }
  }
  const centerDist = (s) => Math.max(3 - (s >> 4), (s >> 4) - 4, 0) + Math.max(3 - (s & 7), (s & 7) - 4, 0);

  P.evaluate = function () {
    const b = this.b;
    let mg = 0, kingMg = 0, kingEg = 0, phase = 0;
    const mat = [0, 0], pawns = [0, 0], bishops = [0, 0];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const p = b[s];
      if (!p) continue;
      const side = p >> 3, t = p & 7, sg = side === W ? 1 : -1;
      if (t === KING) {
        kingMg += sg * PST[side][KING][s];
        kingEg += sg * PST[side][7][s];
        continue;
      }
      mg += sg * (VAL[t] + PST[side][t][s]);
      if (t === PAWN) pawns[side]++;
      else {
        mat[side] += VAL[t];
        phase += t === QUEEN ? 4 : t === ROOK ? 2 : 1;
        if (t === BISHOP) bishops[side]++;
      }
    }
    // the king hides in the middlegame and comes out in the endgame
    const ph = Math.min(24, phase) / 24;
    let e = mg + Math.round(kingMg * ph + kingEg * (1 - ph));
    if (bishops[W] >= 2) e += 30;
    if (bishops[B] >= 2) e -= 30;
    // mop-up: way ahead with no pawns left on the other side, drive their king to the edge and bring yours close
    for (const side of [W, B]) {
      const o = side ^ 1;
      if (!pawns[o] && mat[side] + pawns[side] * 100 - mat[o] >= 400) {
        const ks = this.king[side], ko = this.king[o];
        if (ks >= 0 && ko >= 0) {
          const near = 14 - (Math.abs((ks >> 4) - (ko >> 4)) + Math.abs((ks & 7) - (ko & 7)));
          e += (side === W ? 1 : -1) * (10 * centerDist(ko) + 4 * near);
        }
      }
    }
    return this.turn === W ? e : -e;
  };

  // ---------------------------------------------------------------- search

  const MATE = 100000, INF = 1000000;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  // how each level searches (game.js and the checks may pass changes: CH.level('hard', { time: 150 }))
  const LEVELS = {
    easy: { easy: true },
    normal: { depth: 3, qs: false, margin: 18, order: false },
    hard: { depth: 64, minDepth: 3, qs: true, margin: 0, order: true, time: 700, ext: true },
    hint: { depth: 3, qs: false, margin: 0, order: false },
  };
  CH.LEVELS = LEVELS;

  const TT_SIZE = 1 << 18;
  const tt = { k1: new Int32Array(TT_SIZE), k2: new Int32Array(TT_SIZE), move: new Int32Array(TT_SIZE), score: new Int32Array(TT_SIZE), depth: new Int8Array(TT_SIZE), flag: new Int8Array(TT_SIZE) };
  const TT_EXACT = 1, TT_LOWER = 2, TT_UPPER = 3;

  function Searcher(pos, cfg, rng) {
    this.pos = pos;
    this.cfg = cfg;
    this.rng = rng;
    this.nodes = 0;
    this.deadline = Infinity;
    this.abort = false;
    this.killers = new Int32Array(128 * 2);
    this.history = new Int32Array(16 * 128);
    this.lists = [];
  }
  const S = Searcher.prototype;

  S.repeated = function () {
    const pos = this.pos, h = pos.h1;
    const lim = Math.max(0, pos.hp - 1 - pos.half);
    for (let i = pos.hp - 3; i >= lim; i -= 2) if (pos.hh[i] === h) return true;
    return false;
  };

  // Order moves: the hash move, then captures (most valuable victim, least valuable attacker), promotions, the killers
  // and the history of good quiet moves.
  S.order = function (list, ply, ttMove) {
    const b = this.pos.b, keys = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const m = list[i], fl = m >> 17;
      let k = 0;
      if (m === ttMove) k = 1e7;
      else if (fl & F_CAP) {
        const victim = fl & F_EP ? PAWN : b[(m >> 7) & 127] & 7;
        k = 1e6 + VAL[victim] * 10 - (b[m & 127] & 7);
      } else if (fl & F_PROMO) k = 9e5 + ((m >> 14) & 7);
      else if (this.cfg.order && (m === this.killers[ply * 2] || m === this.killers[ply * 2 + 1])) k = 8e5;
      else if (this.cfg.order) k = this.history[(b[m & 127] & 15) * 128 + ((m >> 7) & 127)];
      keys[i] = k;
    }
    // insertion sort, highest first (lists are short)
    for (let i = 1; i < list.length; i++) {
      const m = list[i], k = keys[i];
      let j = i - 1;
      while (j >= 0 && keys[j] < k) {
        list[j + 1] = list[j];
        keys[j + 1] = keys[j];
        j--;
      }
      list[j + 1] = m;
      keys[j + 1] = k;
    }
    return list;
  };

  S.listFor = function (ply) {
    const l = this.lists[ply] || (this.lists[ply] = []);
    l.length = 0;
    return l;
  };

  S.qsearch = function (alpha, beta, ply) {
    this.nodes++;
    const pos = this.pos;
    const stand = pos.evaluate();
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 60) return stand;
    const list = this.order(pos.gen(this.listFor(ply), true), ply, 0);
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      // delta pruning: even winning this piece can't lift the score up to alpha
      const fl = m >> 17;
      const gain = (fl & F_EP ? 100 : VAL[pos.b[(m >> 7) & 127] & 7]) + (fl & F_PROMO ? 800 : 0);
      if (stand + gain + 200 < alpha) continue;
      if (!pos.tryMake(m)) continue;
      const score = -this.qsearch(-beta, -alpha, ply + 1);
      pos.unmake();
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };

  S.search = function (depth, alpha, beta, ply) {
    const pos = this.pos, cfg = this.cfg;
    if (ply > 0 && (pos.half >= 100 || this.repeated())) return 0;
    if ((++this.nodes & 1023) === 0 && now() > this.deadline) this.abort = true;
    if (this.abort) return 0;
    const check = pos.inCheck();
    if (check && cfg.ext && ply < 40) depth++;
    if (depth <= 0) return cfg.qs ? this.qsearch(alpha, beta, ply) : pos.evaluate();
    let ttMove = 0;
    const ix = pos.h1 & (TT_SIZE - 1);
    if (cfg.order && tt.k1[ix] === pos.h1 && tt.k2[ix] === pos.h2) {
      ttMove = tt.move[ix];
      if (tt.depth[ix] >= depth && ply > 0) {
        const sc = tt.score[ix], fl = tt.flag[ix];
        if (fl === TT_EXACT || (fl === TT_LOWER && sc >= beta) || (fl === TT_UPPER && sc <= alpha)) return sc;
      }
    }
    const alpha0 = alpha;
    const list = this.order(pos.gen(this.listFor(ply)), ply, ttMove);
    let best = -INF, bestMove = 0, legal = 0;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!pos.tryMake(m)) continue;
      legal++;
      const score = -this.search(depth - 1, -beta, -alpha, ply + 1);
      pos.unmake();
      if (this.abort) return 0;
      if (score > best) {
        best = score;
        bestMove = m;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            if (cfg.order && !((m >> 17) & F_CAP)) {
              if (this.killers[ply * 2] !== m) {
                this.killers[ply * 2 + 1] = this.killers[ply * 2];
                this.killers[ply * 2] = m;
              }
              this.history[(pos.b[m & 127] & 15) * 128 + ((m >> 7) & 127)] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (!legal) return check ? -MATE + ply : 0;
    if (cfg.order) {
      tt.k1[ix] = pos.h1;
      tt.k2[ix] = pos.h2;
      tt.move[ix] = bestMove;
      tt.score[ix] = best;
      tt.depth[ix] = depth;
      tt.flag[ix] = best <= alpha0 ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
    }
    return best;
  };

  // A search job for the side to move. job.step(ms) works for about that long and returns true when it's done;
  // job.result is then { move, score, depth, nodes }. The game calls step a slice per frame; the checks run it to
  // the end in one go (job.run()).
  function Job(pos, levelName, opts = {}) {
    const cfg = Object.assign({}, LEVELS[levelName] || LEVELS.normal, opts.cfg || {});
    this.cfg = cfg;
    this.rng = opts.rng || Math.random;
    this.pos = pos.clone();
    this.done = false;
    this.result = null;
    this.t0 = -1;
    this.elapsed = 0;
    if (cfg.easy) return this.finish(easyMove(this.pos, this.rng));
    const root = this.pos.legal();
    if (!root.length) return this.finish(0);
    this.s = new Searcher(this.pos, cfg, this.rng);
    this.root = root.map((m) => ({ m, score: -INF }));
    this.s.order(root, 0, 0);
    this.root = root.map((m) => ({ m, score: -INF }));
    this.depth = 1;
    this.i = 0;
    this.best = -INF;
    this.last = null; // the last finished depth's ranking
  }
  Job.prototype.finish = function (m, score = 0, depth = 0) {
    this.done = true;
    this.result = { move: m, score, depth, nodes: this.s ? this.s.nodes : 0, ms: Math.round(this.elapsed) };
    return this;
  };
  Job.prototype.step = function (ms = 8) {
    if (this.done) return true;
    const start = now();
    if (this.t0 < 0) {
      this.t0 = start;
      if (this.cfg.time) this.s.deadline = start + this.cfg.time;
    }
    const cfg = this.cfg, s = this.s, pos = this.pos;
    while (now() - start < ms || ms <= 0) {
      const r = this.root[this.i];
      // the window: exact scores for moves within `margin` of the best so far (to pick among them), bounds otherwise
      const alpha = this.best === -INF ? -INF : this.best - cfg.margin - 1;
      pos.make(r.m);
      const sc = -s.search(this.depth - 1, -INF, -alpha, 1);
      pos.unmake();
      if (s.abort) return this.stop(start);
      r.score = sc;
      if (sc > this.best) this.best = sc;
      this.i++;
      if (this.i < this.root.length) continue;
      // a depth is finished: rank the moves (stable, so earlier ones win ties) and go one deeper
      this.root.sort((a, b) => b.score - a.score);
      this.last = { depth: this.depth, list: this.root.map((x) => ({ m: x.m, score: x.score })) };
      const mateFound = Math.abs(this.root[0].score) > MATE - 200;
      const used = now() - this.t0;
      const deeper = this.depth < cfg.depth && !mateFound && (!cfg.time || this.depth < (cfg.minDepth || 1) || used < cfg.time * 0.4);
      if (!deeper) return this.pick(start);
      this.depth++;
      this.i = 0;
      this.best = -INF;
      if (ms <= 0) continue;
    }
    this.elapsed += now() - start;
    return false;
  };
  // out of time in the middle of a depth: keep the last full depth, or this one's best if it beat that
  Job.prototype.stop = function (start) {
    const prev = this.last ? this.last.list[0] : null;
    const cur = this.root.slice(0, this.i).sort((a, b) => b.score - a.score)[0];
    this.elapsed += now() - start;
    if (prev && (!cur || cur.score <= prev.score || this.i === 0)) return this.finish(prev.m, prev.score, this.last.depth) && true;
    if (cur) return this.finish(cur.m, cur.score, this.depth) && true;
    return this.finish(this.root[0].m, 0, 0) && true;
  };
  // the best move, or one of the moves within `margin` of it (a little variety, so games differ)
  Job.prototype.pick = function (start) {
    this.elapsed += now() - start;
    const list = this.last.list, top = list[0].score;
    const near = list.filter((x) => x.score >= top - this.cfg.margin && Math.abs(top) < MATE - 200);
    const choice = near.length > 1 ? near[Math.floor(this.rng() * near.length)] : list[0];
    this.finish(choice.m, choice.score, this.last.depth);
    this.ranked = list;
    return true;
  };
  Job.prototype.run = function () {
    while (!this.done) this.step(0);
    return this.result;
  };

  // ---------------------------------------------------------------- 🐣 EASY

  // Static exchange on one square, roughly: what you win taking there, if they take back with their cheapest piece.
  function hangs(pos, sq, side) {
    return pos.attacked(sq, side ^ 1);
  }
  const EASY = { mate: 0.6, grab: 0.75, look: 0.45, noise: 140 };
  CH.EASY = EASY;
  function easyMove(pos, rng) {
    const us = pos.turn, them = us ^ 1;
    const moves = pos.legal();
    if (!moves.length) return 0;
    const pick = (list) => list[Math.floor(rng() * list.length)];
    // a free queen: always (an undefended queen, or one taken by a cheaper piece)
    const queens = moves.filter((m) => {
      const fl = m >> 17;
      if (!(fl & F_CAP) || fl & F_EP) return false;
      const victim = pos.b[(m >> 7) & 127] & 7;
      if (victim !== QUEEN) return false;
      const att = pos.b[m & 127] & 7;
      return att !== QUEEN || !pos.attacked((m >> 7) & 127, them);
    });
    if (queens.length && !SAB.easyblind) return pick(queens);
    // checkmate in one, most of the time
    if (rng() < EASY.mate) {
      const mates = moves.filter((m) => {
        pos.make(m);
        const mate = pos.inCheck() && !pos.legal().length;
        pos.unmake();
        return mate;
      });
      if (mates.length) return pick(mates);
    }
    // free pieces: grab an undefended one most of the time
    if (rng() < EASY.grab) {
      const free = moves.filter((m) => (m >> 17) & F_CAP && !((m >> 17) & F_EP) && !pos.attacked((m >> 7) & 127, them));
      if (free.length) return free.sort((a, b) => (pos.b[(b >> 7) & 127] & 7) - (pos.b[(a >> 7) & 127] & 7))[0];
    }
    // otherwise: one move ahead with plenty of noise, and only sometimes a look at whether the piece is safe there
    const look = rng() < EASY.look;
    let best = 0, bestScore = -INF;
    for (const m of moves) {
      pos.make(m);
      let sc = -pos.evaluate();
      if (look && hangs(pos, (m >> 7) & 127, us)) sc -= VAL[pos.b[(m >> 7) & 127] & 7] * 0.8;
      pos.unmake();
      sc += (rng() - 0.5) * 2 * EASY.noise;
      if (sc > bestScore) {
        bestScore = sc;
        best = m;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- the game

  // A game: the position, the keys of every position so far (for the threefold rule) and the moves.
  function newGame(fen) {
    const pos = fromFen(fen || START);
    const g = { pos, keys: [pos.key()], moves: [], over: false, winner: -1, reason: '', check: false };
    status(g);
    return g;
  }

  // Is the game over, and why? Checkmate and stalemate first, then the draws.
  function status(g) {
    const pos = g.pos;
    const moves = pos.legal();
    g.check = pos.inCheck();
    g.over = false;
    g.winner = -1;
    g.reason = '';
    if (!moves.length) {
      g.over = true;
      g.reason = g.check ? 'mate' : 'stalemate';
      if (g.check) g.winner = pos.turn ^ 1;
    } else if (pos.half >= 100 && !SAB.nofifty) {
      g.over = true;
      g.reason = 'fifty';
    } else if (pos.deadDraw()) {
      g.over = true;
      g.reason = 'material';
    } else if (!SAB.norepeat) {
      const k = g.keys[g.keys.length - 1];
      let n = 0;
      for (const x of g.keys) if (x === k) n++;
      if (n >= 3) {
        g.over = true;
        g.reason = 'repetition';
      }
    }
    return g;
  }

  // Moves as objects for the page: { from, to, piece, captured, capSq, promo, castle: { from, to } | null, ep, double }
  function describe(pos, m) {
    const from = mFrom(m), to = mTo(m), fl = mFlags(m), p = pos.b[from];
    const side = p >> 3;
    const capSq = fl & F_EP ? to + (side === W ? -16 : 16) : to;
    const o = {
      m, from: to64(from), to: to64(to), piece: p, side, type: p & 7, promo: mPromo(m), ep: !!(fl & F_EP), double: !!(fl & F_DOUBLE),
      captured: fl & F_CAP ? pos.b[capSq] : 0, capSq: fl & F_CAP ? to64(capSq) : -1, castle: null, uci: uci(m),
    };
    if (fl & F_CASTLE) {
      const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1;
      o.castle = { from: to64(rf), to: to64(rt), side: to > from ? 'short' : 'long' };
    }
    return o;
  }

  // The legal moves of the piece on square sq (0..63): one per target square (a promotion lists its four choices).
  function legalFrom(g, sq) {
    if (g.over) return [];
    const s = to88(sq);
    const out = [];
    for (const m of g.pos.legal()) {
      if (mFrom(m) !== s) continue;
      const d = describe(g.pos, m);
      const same = out.find((x) => x.to === d.to);
      if (same) same.promos.push(d.promo);
      else {
        d.promos = d.promo ? [d.promo] : [];
        out.push(d);
      }
    }
    return out;
  }

  // Play a move (an int, or { from, to, promo } in 0..63). Returns the move as an object (plus check / over), or null.
  function play(g, mv) {
    if (g.over) return null;
    let m = mv;
    if (typeof mv !== 'number') {
      const f = to88(mv.from), t = to88(mv.to);
      m = g.pos.legal().find((x) => mFrom(x) === f && mTo(x) === t && (!mPromo(x) || mPromo(x) === (mv.promo || QUEEN)));
      if (!m) return null;
    } else if (!g.pos.legal().includes(m)) return null;
    const ev = describe(g.pos, m);
    g.pos.make(m);
    g.moves.push(ev);
    g.keys.push(g.pos.key());
    status(g);
    ev.check = g.check;
    ev.over = g.over;
    return ev;
  }

  function undo(g) {
    if (!g.moves.length) return null;
    const ev = g.moves.pop();
    g.keys.pop();
    g.pos.unmake();
    status(g);
    return ev;
  }

  // Pieces for the page: [{ sq, piece, side, type }]
  function pieces(g) {
    const out = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = g.pos.b[to88(sq)];
      if (p) out.push({ sq, piece: p, side: p >> 3, type: p & 7 });
    }
    return out;
  }
  const at = (g, sq) => g.pos.b[to88(sq)];
  const kingSq = (g, side) => (g.pos.king[side] >= 0 ? to64(g.pos.king[side]) : -1);

  // A search job for the game (game.js steps it a slice a frame).
  const think = (g, level, opts) => new Job(g.pos, level, opts);
  // The best move now, in one go (the checks, the demo board).
  const best = (g, level, opts) => new Job(g.pos, level, opts).run().move;

  // ---------------------------------------------------------------- your brother's hint

  // What he says, from the NORMAL search's best move. Kinds: mate (checkmate now), check (get your king safe),
  // danger (the piece he moves can be bonked where it stands), bonk (a capture), move (a good move).
  function hintFor(g, m) {
    if (!m) return null;
    const pos = g.pos, us = pos.turn, d = describe(pos, m);
    pos.make(m);
    const mate = pos.inCheck() && !pos.legal().length;
    pos.unmake();
    let kind = 'move', target = 0;
    const from88 = mFrom(m);
    if (mate) kind = 'mate';
    else if (g.check) kind = 'check';
    else if (d.type !== PAWN && pos.attacked(from88, us ^ 1) && (VAL[d.type] >= 300 || d.type === KING) && !defendedEnough(pos, from88, us)) {
      kind = 'danger';
      target = d.type;
    } else if (d.captured) {
      kind = 'bonk';
      target = d.captured & 7;
    }
    return { kind, from: d.from, to: d.to, type: d.type, target, promo: d.promo, uci: d.uci };
  }
  // A piece "in danger": attacked by something cheaper, or attacked and not defended.
  function defendedEnough(pos, s, us) {
    const val = VAL[pos.b[s] & 7];
    const them = us ^ 1;
    // the cheapest attacker
    let cheapest = INF;
    for (const m of (() => {
      const save = pos.turn;
      pos.turn = them;
      const l = pos.gen([], true);
      pos.turn = save;
      return l;
    })()) {
      if (mTo(m) === s) cheapest = Math.min(cheapest, VAL[pos.b[mFrom(m)] & 7] || 50);
    }
    if (cheapest < val) return false;
    pos.b[s] ^= 8; // pretend it's theirs: is it defended by us?
    const defended = pos.attacked(s, us);
    pos.b[s] ^= 8;
    return defended;
  }

  Object.assign(CH, {
    W, B, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, NAMES, VAL, START, F_CAP, F_EP, F_CASTLE, F_DOUBLE, F_PROMO, MATE,
    Pos, Job, fromFen, toFen, uci, to88, to64, sqName, sqOf, mFrom, mTo, mPromo, mFlags,
    newGame, status, play, undo, legalFrom, describe, pieces, at, kingSq, think, best, hintFor, easyMove,
    sideOf: (p) => p >> 3, typeOf: (p) => p & 7,
    level: (name, cfg) => Object.assign(LEVELS[name], cfg),
    clearTT: () => tt.k1.fill(0),
  });
})();

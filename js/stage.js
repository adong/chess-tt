/* TT Chess: the renderer, the garden and the board.
   The board is a chunky wooden tray on a round stone patio in a garden (lawn, hedges, round trees, flower beds, a
   picket fence, a little pond). Its squares are cream and leaf green, with a–h and 1–8 round the rim. The pieces are
   chunky plastic toys with big friendly eyes: Teddy's side blue, Tommy's side orange (Foxy plays whichever colour is
   free). A piece that gets bonked flies to its side's bench beside the board and sits there with dizzy stars.
     setView(nearSide)      which engine side (CH.W / CH.B) sits at the near end; squares map to the world from it
     setPieces(list)        every piece where the list says, straight away: [{ sq, colour, type }]
     syncPieces(list)       glide every piece to where the list says (undo, a lesson restart); bonked ones come back
     move(ev, colour, done) a move from CH.play: the hop (a knight leaps), castling's rook, en passant, promotion, BONK
     select(sq) / moves(sq, list)   the picked-up piece, and its targets (dots, red rings over captures, ⭐ promotions)
     last(from, to), check(sq), hint(from, to, danger), cursor(sq), stars([sq]), shake(secs)
     layout(wide) / spots   where the boys, the benches and your brother stand (wide screen: beside the board;
                            tall screen: at the ends)
     fit(pts, elev, az, m), pick(x, y), toScreen(v), pieceArt(type, colour) (pictures for the menus) */
(function () {
  'use strict';
  const T = THREE;
  const CH = (window.CH = window.CH || {});
  const { makeCanvas, toTexture, std, rand, pick: pickOne, radialTexture, emojiTexture, FONT, shade } = Kit.gfx;

  const SQ = 1.0;                       // one square
  const RIM = 0.48;
  const HW = 4 * SQ + RIM;              // half the tray
  const TRAY_H = 0.34;
  const TOP = TRAY_H;                   // the squares' height
  const COL = { 0: '#2f7cf0', 1: '#ff8a1f' };   // Teddy blue, Tommy orange
  const LIGHT_SQ = '#fff5d6', DARK_SQ = '#74c45a';
  const BENCH_STEP = 0.46, BENCH_SCALE = 0.62;

  let renderer = null, W = 1, H = 1;
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(34, 1, 0.1, 300);
  const camBase = new T.Vector3();
  const fx = { t: 0, shake: 0, sel: -1, near: 0, az: 0, cursor: -1, hintFrom: -1, hintTo: -1, danger: -1, check: -1, lastFrom: -1, lastTo: -1, hintT: 0, wide: true };
  const pieces = [];      // { id, colour, type, g, body, model, shadow, at (square or -1), bench (slot or -1), anim, lift, land }
  const bySq = new Array(64).fill(null);
  const benches = [[], []]; // per colour: the pieces sitting there, in order
  let flyers = null, bursts = null;
  let boardTex = null, boardCanvas = null;

  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    buildGarden();
    buildBoard();
    buildBenches();
    buildMarks();
    resize();
  }
  function useFx(fl, bu) {
    flyers = fl;
    bursts = bu;
  }
  function resize() {
    W = Math.max(1, innerWidth || 1);
    H = Math.max(1, innerHeight || 1);
    if (renderer) renderer.setSize(W, H, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- shapes

  // A rounded slab, w wide (x) and d deep (z), h tall, centred on the origin.
  function slab(w, d, h, r, bevel = 0.05) {
    const s = new T.Shape();
    const x = -w / 2 + bevel, y = -d / 2 + bevel, ww = w - 2 * bevel, dd = d - 2 * bevel, rr = Math.max(0.01, r - bevel);
    s.moveTo(x + rr, y);
    s.lineTo(x + ww - rr, y);
    s.quadraticCurveTo(x + ww, y, x + ww, y + rr);
    s.lineTo(x + ww, y + dd - rr);
    s.quadraticCurveTo(x + ww, y + dd, x + ww - rr, y + dd);
    s.lineTo(x + rr, y + dd);
    s.quadraticCurveTo(x, y + dd, x, y + dd - rr);
    s.lineTo(x, y + rr);
    s.quadraticCurveTo(x, y, x + rr, y);
    const g = new T.ExtrudeGeometry(s, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 5 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -(h - 2 * bevel) / 2, 0);
    return g;
  }
  const add = (geo, mat, x, y, z, parent) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // ---------------------------------------------------------------- the garden

  function grassTexture() {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#7fd35a';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,210,0.10)' : 'rgba(30,90,20,0.10)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 5);
    }
    return toTexture(c, true);
  }
  function patioTexture() {
    const [c, g] = makeCanvas(512, 512);
    g.fillStyle = '#c9b48f';
    g.fillRect(0, 0, 512, 512);
    // round paving stones in rings
    for (let ring = 0; ring < 7; ring++) {
      const r0 = 40 + ring * 34, n = 8 + ring * 6;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.3;
        g.fillStyle = ['#e2d2b2', '#d8c6a2', '#e9dbbd'][(k + ring) % 3];
        g.beginPath();
        g.ellipse(256 + Math.cos(a) * r0, 256 + Math.sin(a) * r0, 15 + ring * 0.6, 13, a, 0, Math.PI * 2);
        g.fill();
      }
    }
    return toTexture(c);
  }

  function buildGarden() {
    scene.background = new T.Color('#a8e6ff');
    scene.fog = new T.Fog('#a8e6ff', 34, 80);
    scene.add(new T.HemisphereLight('#ffffff', '#5c8a3a', 0.85));
    const sun = new T.DirectionalLight('#fff1d6', 1.0);
    sun.position.set(-6, 14, 9);
    scene.add(sun);
    const fill = new T.DirectionalLight('#dff3ff', 0.25);
    fill.position.set(6, 6, -8);
    scene.add(fill);

    const tex = grassTexture();
    tex.repeat.set(28, 28);
    const ground = new T.Mesh(new T.PlaneGeometry(150, 150), std('#ffffff', { map: tex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const patio = new T.Mesh(new T.CircleGeometry(HW + 3.4, 56), std('#ffffff', { map: patioTexture(), roughness: 1 }));
    patio.rotation.x = -Math.PI / 2;
    patio.position.y = 0.012;
    scene.add(patio);

    const leaf = [std('#3aa346'), std('#4cba50'), std('#2f9440'), std('#62c95c')];
    const clear = (x, z) => Math.hypot(x, z) < HW + 4.6;
    // round trees
    const tree = (x, z, s) => {
      const g = new T.Group();
      add(new T.CylinderGeometry(0.18 * s, 0.26 * s, 1.7 * s, 8), std('#9a6a3a'), 0, 0.85 * s, 0, g);
      const tops = [[0, 2.2, 0, 1.0], [-0.55, 1.85, 0.2, 0.7], [0.55, 1.9, -0.15, 0.72], [0.1, 2.75, 0.1, 0.62]];
      tops.forEach(([tx, ty, tz, r], i) => add(new T.SphereGeometry(r * s, 14, 10), leaf[i % 4], tx * s, ty * s, tz * s, g));
      // a few apples
      for (let k = 0; k < 4; k++) {
        const a = rand(0, Math.PI * 2);
        add(new T.SphereGeometry(0.11 * s, 8, 6), std('#ff4b4b'), Math.cos(a) * 0.85 * s, (2.0 + rand(-0.2, 0.4)) * s, Math.sin(a) * 0.85 * s, g);
      }
      g.position.set(x, 0, z);
      scene.add(g);
    };
    const hedge = (x, z, len, rot) => {
      const h = new T.Mesh(slab(len, 0.9, 0.9, 0.4, 0.2), leaf[(Math.abs(Math.round(x + z))) % 4]);
      h.position.set(x, 0.45, z);
      h.rotation.y = rot;
      scene.add(h);
    };
    const flowers = (x, z, n) => {
      const petals = ['#ff6f91', '#ffd23f', '#ffffff', '#a77bff', '#ff8a1f', '#ff4b4b'];
      const stem = std('#2f8a2a'), centre = std('#ffcc00');
      for (let i = 0; i < n; i++) {
        const fx_ = x + rand(-1.2, 1.2), fz = z + rand(-0.8, 0.8);
        const f = new T.Group();
        add(new T.CylinderGeometry(0.025, 0.025, 0.36, 5), stem, 0, 0.18, 0, f);
        const head = add(new T.SphereGeometry(0.13, 8, 6), std(pickOne(petals)), 0, 0.4, 0, f);
        head.scale.y = 0.6;
        add(new T.SphereGeometry(0.05, 6, 4), centre, 0, 0.45, 0, f);
        f.position.set(fx_, 0, fz);
        scene.add(f);
      }
    };
    const fence = (x, z, rot, n) => {
      const g = new T.Group();
      const white = std('#ffffff', { roughness: 0.8 });
      for (let i = 0; i < n; i++) {
        const p = add(new T.BoxGeometry(0.16, 0.8, 0.07), white, i * 0.32, 0.4, 0, g);
        const tip = add(new T.ConeGeometry(0.115, 0.16, 4), white, i * 0.32, 0.88, 0, g);
        tip.rotation.y = Math.PI / 4;
        p.scale.y = 1;
      }
      add(new T.BoxGeometry(n * 0.32, 0.08, 0.05), white, (n - 1) * 0.16, 0.55, 0.06, g);
      add(new T.BoxGeometry(n * 0.32, 0.08, 0.05), white, (n - 1) * 0.16, 0.25, 0.06, g);
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      scene.add(g);
    };
    // a ring of trees and hedges round the patio, kept clear of the board and the camera's way in
    const ring = [[-10, -9], [10, -9.5], [-13, -1], [13.5, 0], [-11, 8.5], [11, 9], [0, -14], [-6, -13], [6.5, -13.5], [-15, -7], [15, -7], [-15, 6], [15.5, 6.5], [-4, 14.5], [5, 14]];
    ring.forEach(([x, z], k) => tree(x + rand(-0.6, 0.6), z + rand(-0.6, 0.6), rand(1.1, 1.45) * (k % 3 ? 1 : 1.15)));
    for (const [x, z, len, rot] of [[-8.2, -6.5, 3.4, 0.7], [8.4, -6.2, 3.6, -0.7], [-9.4, 4.2, 3.2, -1.2], [9.6, 4.6, 3.4, 1.2], [0, -10.4, 5, 0]]) hedge(x, z, len, rot);
    for (const [x, z] of [[-7.6, 0.5], [7.8, -0.5], [-4.5, -8.6], [4.6, -8.8], [-6.5, 7.6], [6.8, 7.4], [-3.3, 9.6], [3.6, 9.8]]) if (!clear(x, z)) flowers(x, z, 9);
    fence(-12.5, -11.5, 0.5, 10);
    fence(9.5, -12.5, -0.5, 10);
    // a little pond with lily pads
    const pond = new T.Mesh(new T.CircleGeometry(1.7, 30), std('#4fc3f7', { roughness: 0.2, metalness: 0.1 }));
    pond.rotation.x = -Math.PI / 2;
    pond.scale.set(1.3, 1, 1);
    pond.position.set(-11.2, 0.02, 2.5);
    scene.add(pond);
    for (let k = 0; k < 3; k++) {
      const pad = new T.Mesh(new T.CircleGeometry(0.32, 12, 0.3, Math.PI * 1.8), std('#3aa346'));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(-11.2 + rand(-1.2, 1.2), 0.03, 2.5 + rand(-0.8, 0.8));
      scene.add(pad);
    }
  }

  // ---------------------------------------------------------------- the board

  function drawBoard() {
    if (!boardCanvas) [boardCanvas] = makeCanvas(1024, 1024);
    const c = boardCanvas, g = c.getContext('2d');
    const S = 1024, u = S / (2 * HW), rim = RIM * u, sq = SQ * u;
    // the wooden rim with a-h and 1-8 (turned so they read from the near end)
    const wood = g.createLinearGradient(0, 0, S, S);
    wood.addColorStop(0, '#d39a5c');
    wood.addColorStop(1, '#b97a3e');
    g.fillStyle = wood;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(90,50,20,${rand(0.05, 0.12)})`;
      g.lineWidth = rand(1, 3);
      g.beginPath();
      const y = rand(0, S);
      g.moveTo(0, y);
      g.bezierCurveTo(S * 0.3, y + rand(-12, 12), S * 0.7, y + rand(-12, 12), S, y + rand(-8, 8));
      g.stroke();
    }
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const x = rim + f * sq, y = rim + r * sq;
        const light = (r + f) % 2 === 0;
        g.fillStyle = light ? LIGHT_SQ : DARK_SQ;
        g.fillRect(x, y, sq, sq);
        // a soft bevel so the squares look like chunky tiles
        g.fillStyle = light ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)';
        g.fillRect(x + 3, y + 3, sq - 6, 5);
        g.fillStyle = 'rgba(0,0,0,0.07)';
        g.fillRect(x + 3, y + sq - 8, sq - 6, 5);
      }
    }
    g.strokeStyle = '#6e4420';
    g.lineWidth = 6;
    g.strokeRect(rim - 3, rim - 3, sq * 8 + 6, sq * 8 + 6);
    g.font = `${Math.round(rim * 0.62)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff3d6';
    const flip = fx.near === 1;
    for (let i = 0; i < 8; i++) {
      const file = 'abcdefgh'[flip ? 7 - i : i], rank = String(flip ? i + 1 : 8 - i);
      for (const y of [rim / 2, S - rim / 2]) g.fillText(file, rim + (i + 0.5) * sq, y + 2);
      for (const x of [rim / 2, S - rim / 2]) g.fillText(rank, x, rim + (i + 0.5) * sq + 2);
    }
    if (boardTex) boardTex.needsUpdate = true;
  }

  function buildBoard() {
    const tray = new T.Mesh(slab(2 * HW, 2 * HW, TRAY_H, 0.36, 0.06), std('#b97a3e', { roughness: 0.8 }));
    tray.position.y = TRAY_H / 2;
    scene.add(tray);
    drawBoard();
    boardTex = toTexture(boardCanvas);
    boardTex.anisotropy = 4;
    const top = new T.Mesh(new T.PlaneGeometry(2 * HW - 0.1, 2 * HW - 0.1), std('#ffffff', { map: boardTex, roughness: 0.75 }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = TOP + 0.002;
    scene.add(top);
    // little feet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new T.CylinderGeometry(0.22, 0.26, 0.1, 12), std('#8a5a2c'), sx * (HW - 0.4), 0.03, sz * (HW - 0.4), scene);
  }

  // Which engine side sits at the near end (+z): squares map to the world from it.
  function setView(near) {
    if (near === fx.near && pieces.length) return;
    fx.near = near;
    drawBoard();
    for (const p of pieces) if (p.at >= 0 && !p.anim) cellPos(p.at, p.g.position);
  }
  // square (0..63) → the world; the near side's back row is at +z
  const cellPos = (sq, out = new T.Vector3()) => {
    const f = sq & 7, r = sq >> 3;
    return fx.near === 0 ? out.set((f - 3.5) * SQ, TOP, (3.5 - r) * SQ) : out.set((3.5 - f) * SQ, TOP, (r - 3.5) * SQ);
  };
  const sqAt = (x, z) => {
    let f = Math.floor(x / SQ + 4), r = Math.floor(4 - z / SQ);
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    if (fx.near === 1) {
      f = 7 - f;
      r = 7 - r;
    }
    return r * 8 + f;
  };

  // ---------------------------------------------------------------- the benches

  // A two-step garden bench: up to 16 pieces in two rows. Each colour has one beside the board.
  const benchGroups = [null, null];
  function buildBenches() {
    for (const c of [0, 1]) {
      const g = new T.Group();
      const wood = std('#a8672f', { roughness: 0.85 }), legs = std('#6e4420');
      const len = 8 * BENCH_STEP + 0.3;
      add(new T.BoxGeometry(len, 0.08, 0.42), wood, 0, 0.36, 0.22, g);   // the low step (front)
      add(new T.BoxGeometry(len, 0.08, 0.42), wood, 0, 0.62, -0.24, g);  // the high step (back)
      add(new T.BoxGeometry(len, 0.3, 0.06), std(shade(COL[c], -0.05)), 0, 0.2, 0.43, g); // a strip in the side's colour
      for (const x of [-len / 2 + 0.12, len / 2 - 0.12]) {
        add(new T.BoxGeometry(0.1, 0.36, 0.1), legs, x, 0.18, 0.36, g);
        add(new T.BoxGeometry(0.1, 0.62, 0.1), legs, x, 0.31, -0.38, g);
      }
      scene.add(g);
      benchGroups[c] = g;
    }
  }
  // the world position of slot k on colour c's bench
  function benchPos(c, k, out = new T.Vector3()) {
    const g = benchGroups[c];
    const row = k < 8 ? 0 : 1, i = k % 8;
    const local = new T.Vector3((i - 3.5) * BENCH_STEP, row ? 0.66 : 0.4, row ? -0.24 : 0.22);
    g.updateMatrixWorld(true);
    return out.copy(local.applyMatrix4(g.matrixWorld));
  }

  // Where everyone stands. Wide screen: the boys on the left of the board, the benches on the right. Tall screen:
  // the boys at the ends (you at the near end, on the left), the benches at the ends on the other side.
  // `kidC` is the colour at the near end.
  const spots = { kid: null, opp: null, buddy: null, meet: null, benchEnds: [] };
  function layout(wide, kidC) {
    fx.wide = wide;
    const oppC = 1 - kidC;
    const E = HW + 0.9;
    const bk = benchGroups[kidC], bo = benchGroups[oppC];
    if (wide) {
      spots.kid = { x: -(HW + 1.05), z: HW - 1.1 };
      spots.opp = { x: -(HW + 1.05), z: -(HW - 1.1) };
      spots.buddy = { x: -(HW + 2.35), z: HW + 0.15 };
      spots.meet = [{ x: -(HW + 1.05), z: 0.5 }, { x: -(HW + 1.05), z: -0.5 }];
      bk.position.set(E, 0, 2.1);
      bk.rotation.y = Math.PI / 2;
      bo.position.set(E, 0, -2.1);
      bo.rotation.y = Math.PI / 2;
    } else {
      spots.kid = { x: -2.3, z: HW + 1.05 };
      spots.opp = { x: 2.3, z: -(HW + 1.05) };
      spots.buddy = { x: -3.75, z: HW + 1.55 };
      spots.meet = [{ x: -1.75, z: HW + 1.15 }, { x: -2.85, z: HW + 1.15 }];
      bk.position.set(1.95, 0, E);
      bk.rotation.y = 0;
      bo.position.set(-1.95, 0, -E);
      bo.rotation.y = Math.PI;
    }
    bk.updateMatrixWorld(true);
    bo.updateMatrixWorld(true);
    for (const c of [0, 1]) benches[c].forEach((p, k) => {
      if (!p.anim) placeOnBench(p, k);
    });
    return spots;
  }
  // corners of the board, the benches and the boys, for the camera fit
  function framePoints(withBuddy, scale) {
    const V = T.Vector3, pts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push(new V(sx * HW, 0, sz * HW), new V(sx * HW, TOP + 0.9, sz * HW));
    for (const c of [0, 1]) {
      for (const k of [0, 7]) {
        const p = benchPos(c, k);
        pts.push(p.clone(), p.clone().setY(1.2));
      }
    }
    const who = [spots.kid, spots.opp];
    if (withBuddy) who.push(spots.buddy);
    for (const s of who) pts.push(new V(s.x - 0.5, 0, s.z), new V(s.x + 0.5, 0, s.z), new V(s.x, 2 * scale + 0.55, s.z));
    return pts;
  }

  // ---------------------------------------------------------------- the pieces: chunky toys with eyes

  const matCache = {};
  function mats(colour) {
    if (matCache[colour]) return matCache[colour];
    const base = COL[colour];
    return (matCache[colour] = {
      body: std(base, { roughness: 0.32, metalness: 0.05 }),
      dark: std(shade(base, -0.28), { roughness: 0.4 }),
      light: std(shade(base, 0.35), { roughness: 0.35 }),
      white: std('#ffffff', { roughness: 0.3 }),
      gold: std('#ffcf33', { roughness: 0.3, metalness: 0.35 }),
      ink: std('#14121f', { roughness: 0.5 }),
      cheek: std('#ff9fb0', { roughness: 0.6 }),
    });
  }
  const cyl = (rt, rb, h, seg = 28) => new T.CylinderGeometry(rt, rb, h, seg);
  const ball = (r) => new T.SphereGeometry(r, 20, 14);

  // two big eyes looking out (+z) at height y, `spread` apart, on a surface at depth z
  function eyes(g, m, y, z, spread = 0.075, size = 0.062) {
    for (const sx of [-1, 1]) {
      const w = add(ball(size), m.white, sx * spread, y, z, g);
      w.scale.z = 0.6;
      add(ball(size * 0.55), m.ink, sx * spread, y - 0.004, z + size * 0.42, g);
      add(ball(size * 0.18), m.white, sx * spread + size * 0.18, y + size * 0.22, z + size * 0.62, g);
    }
  }
  function smile(g, m, y, z, w = 0.07) {
    const s = add(new T.TorusGeometry(w, 0.012, 6, 12, Math.PI), m.ink, 0, y, z, g);
    s.rotation.z = Math.PI;
  }

  // One piece, facing +z (the camera), standing on y = 0. Roughly one square wide.
  function model(type, colour) {
    const m = mats(colour), g = new T.Group();
    // the chunky base: a dark disc, a white stripe and a body-coloured top
    add(cyl(0.4, 0.43, 0.1), m.dark, 0, 0.05, 0, g);
    add(new T.TorusGeometry(0.385, 0.035, 8, 28), m.white, 0, 0.115, 0, g).rotation.x = Math.PI / 2;
    add(cyl(0.35, 0.39, 0.08), m.body, 0, 0.16, 0, g);
    const P = CH.PAWN || 1;
    if (type === P) {
      add(cyl(0.16, 0.29, 0.32), m.body, 0, 0.36, 0, g);
      add(cyl(0.23, 0.23, 0.06), m.light, 0, 0.54, 0, g);
      add(ball(0.21), m.body, 0, 0.72, 0, g);
      eyes(g, m, 0.75, 0.155, 0.085, 0.07);
      smile(g, m, 0.67, 0.2, 0.05);
    } else if (type === 2) {
      // the knight: a toy horse's head with a yellow mane
      add(cyl(0.22, 0.3, 0.26), m.body, 0, 0.33, 0, g);
      const neck = add(new T.BoxGeometry(0.28, 0.46, 0.3), m.body, 0, 0.62, -0.02, g);
      neck.rotation.x = -0.22;
      const head = add(new T.BoxGeometry(0.28, 0.25, 0.46), m.body, 0, 0.86, 0.1, g);
      head.rotation.x = 0.12;
      add(new T.BoxGeometry(0.24, 0.2, 0.18), m.light, 0, 0.79, 0.34, g);
      for (const sx of [-1, 1]) {
        add(ball(0.025), m.ink, sx * 0.055, 0.8, 0.43, g);
        const ear = add(new T.ConeGeometry(0.055, 0.16, 6), m.body, sx * 0.08, 1.04, -0.04, g);
        ear.rotation.z = -sx * 0.15;
        // eyes on both sides of the head, a little forward
        const ew = add(ball(0.075), m.white, sx * 0.13, 0.93, 0.13, g);
        ew.scale.x = 0.6;
        add(ball(0.042), m.ink, sx * 0.175, 0.93, 0.15, g);
      }
      for (let i = 0; i < 4; i++) add(new T.BoxGeometry(0.09, 0.12, 0.1), m.gold, 0, 0.98 - i * 0.12, -0.12 - i * 0.045, g);
    } else if (type === 3) {
      // the bishop: a tall egg hat with a slit and a gold bead
      add(cyl(0.15, 0.29, 0.38), m.body, 0, 0.38, 0, g);
      add(cyl(0.21, 0.21, 0.06), m.light, 0, 0.6, 0, g);
      const hat = add(ball(0.21), m.body, 0, 0.84, 0, g);
      hat.scale.y = 1.4;
      const slit = add(new T.BoxGeometry(0.035, 0.22, 0.12), m.white, 0.07, 0.96, 0.15, g);
      slit.rotation.z = -0.6;
      add(ball(0.065), m.gold, 0, 1.15, 0, g);
      eyes(g, m, 0.8, 0.165, 0.085, 0.068);
      smile(g, m, 0.71, 0.19, 0.045);
    } else if (type === 4) {
      // the rook: a castle tower with a door, battlements on top
      add(cyl(0.27, 0.32, 0.44), m.body, 0, 0.42, 0, g);
      add(cyl(0.34, 0.3, 0.16), m.body, 0, 0.72, 0, g);
      const door = add(new T.CylinderGeometry(0.075, 0.075, 0.04, 12, 1, false, 0, Math.PI), m.dark, 0, 0.36, 0.3, g);
      door.rotation.x = Math.PI / 2;
      add(new T.BoxGeometry(0.15, 0.14, 0.03), m.dark, 0, 0.29, 0.305, g);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const b = add(new T.BoxGeometry(0.17, 0.15, 0.13), m.body, Math.sin(a) * 0.24, 0.86, Math.cos(a) * 0.24, g);
        b.rotation.y = a;
      }
      eyes(g, m, 0.72, 0.315, 0.095, 0.07);
      smile(g, m, 0.6, 0.29, 0.05);
    } else if (type === 5) {
      // the queen: a round head and a gold crown with beads
      add(cyl(0.16, 0.32, 0.5), m.body, 0, 0.44, 0, g);
      add(cyl(0.23, 0.23, 0.06), m.light, 0, 0.71, 0, g);
      add(ball(0.18), m.body, 0, 0.86, 0, g);
      add(cyl(0.21, 0.15, 0.11, 18), m.gold, 0, 1.02, 0, g);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        add(ball(0.045), m.gold, Math.sin(a) * 0.2, 1.1, Math.cos(a) * 0.2, g);
      }
      add(ball(0.06), m.gold, 0, 1.15, 0, g);
      eyes(g, m, 0.885, 0.135, 0.08, 0.066);
      smile(g, m, 0.8, 0.165, 0.045);
      for (const sx of [-1, 1]) add(ball(0.03), m.cheek, sx * 0.11, 0.82, 0.14, g).scale.z = 0.4;
    } else {
      // the king: the tallest, with a crown and a cross
      add(cyl(0.18, 0.33, 0.56), m.body, 0, 0.47, 0, g);
      add(cyl(0.24, 0.24, 0.06), m.light, 0, 0.77, 0, g);
      add(ball(0.19), m.body, 0, 0.93, 0, g);
      add(cyl(0.22, 0.17, 0.14, 18), m.gold, 0, 1.1, 0, g);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const c = add(new T.ConeGeometry(0.05, 0.1, 6), m.gold, Math.sin(a) * 0.19, 1.21, Math.cos(a) * 0.19, g);
        c.rotation.y = a;
      }
      add(new T.BoxGeometry(0.07, 0.26, 0.07), m.gold, 0, 1.33, 0, g);
      add(new T.BoxGeometry(0.2, 0.07, 0.07), m.gold, 0, 1.36, 0, g);
      eyes(g, m, 0.955, 0.145, 0.082, 0.068);
      smile(g, m, 0.86, 0.18, 0.05);
    }
    return g;
  }

  let shadowTex = null;
  function makePiece(colour, type) {
    if (!shadowTex) shadowTex = radialTexture(128, [[0, 'rgba(20,30,10,0.45)'], [0.6, 'rgba(20,30,10,0.2)'], [1, 'rgba(20,30,10,0)']]);
    const g = new T.Group(), body = new T.Group();
    g.add(body);
    const shadow = new T.Mesh(new T.PlaneGeometry(1.0, 1.0), new T.MeshBasicMaterial({ map: shadowTex, depthWrite: false, transparent: true }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 2;
    g.add(shadow);
    const p = { id: pieces.length, colour, type, g, body, model: null, shadow, at: -1, bench: -1, anim: null, lift: 0, land: -1, dizzy: 0 };
    setModel(p, type);
    scene.add(g);
    pieces.push(p);
    return p;
  }
  function setModel(p, type) {
    if (p.model) {
      p.body.remove(p.model);
      p.model.traverse((o) => o.isMesh && o.geometry.dispose());
    }
    p.type = type;
    p.model = model(type, p.colour);
    p.body.add(p.model);
  }
  function getPiece(colour, type) {
    const free = pieces.find((p) => !p.g.visible && p.colour === colour);
    if (free) {
      if (free.type !== type) setModel(free, type);
      free.g.visible = true;
      return free;
    }
    return makePiece(colour, type);
  }

  // which way a piece faces: at the camera, knights turned toward the other side so you see the horse's head
  function faceOf(p) {
    if (p.type !== 2 || p.at < 0) return fx.az;
    return fx.az + (p.colour === fx.nearColour ? -0.85 : 0.85);
  }

  // ---------------------------------------------------------------- placing pieces

  function placeOnBench(p, k) {
    p.bench = k;
    benchPos(p.colour, k, p.g.position);
    p.g.scale.setScalar(BENCH_SCALE);
  }
  function benchRemove(p) {
    const list = benches[p.colour];
    const i = list.indexOf(p);
    if (i >= 0) list.splice(i, 1);
    p.bench = -1;
    list.forEach((q, k) => {
      if (q.bench !== k) {
        q.bench = k;
        if (!q.anim) q.anim = { kind: 'glide', t: 0, dur: 0.3, from: q.g.position.clone(), to: benchPos(q.colour, k), arc: 0.3, toScale: BENCH_SCALE };
      }
    });
  }

  // Every piece straight to where `list` says: [{ sq, colour, type }]. Benches empty.
  function setPieces(list) {
    for (const p of pieces) {
      p.g.visible = false;
      p.at = -1;
      p.bench = -1;
      p.anim = null;
      p.dizzy = 0;
    }
    benches[0].length = benches[1].length = 0;
    bySq.fill(null);
    for (const it of list) {
      const p = getPiece(it.colour, it.type);
      p.at = it.sq;
      p.g.scale.setScalar(1);
      p.body.position.set(0, 0, 0);
      p.body.rotation.set(0, 0, 0);
      p.body.scale.set(1, 1, 1);
      cellPos(it.sq, p.g.position);
      bySq[it.sq] = p;
    }
    fx.sel = -1;
  }

  // Glide every piece to where `list` says (undo): pieces stay where they match, then the nearest of the same kind
  // moves, then pieces come back off the bench, then a pawn that was promoted turns back into a pawn.
  function syncPieces(list) {
    const want = list.slice();
    const keep = new Set();
    const next = new Array(64).fill(null);
    const left = [];
    for (const it of want) {
      const p = bySq[it.sq];
      if (p && p.colour === it.colour && p.type === it.type && !keep.has(p)) {
        keep.add(p);
        next[it.sq] = p;
      } else left.push(it);
    }
    const onBoard = pieces.filter((p) => p.at >= 0 && p.g.visible && !keep.has(p));
    const take = (fn) => {
      for (let i = left.length - 1; i >= 0; i--) {
        const it = left[i];
        const cands = fn(it);
        if (!cands.length) continue;
        const to = cellPos(it.sq);
        cands.sort((a, b) => a.g.position.distanceTo(to) - b.g.position.distanceTo(to));
        const p = cands[0];
        keep.add(p);
        if (p.bench >= 0) benchRemove(p);
        if (p.type !== it.type) setModel(p, it.type);
        p.at = it.sq;
        next[it.sq] = p;
        p.anim = { kind: 'glide', t: 0, dur: 0.45, from: p.g.position.clone(), to, arc: 0.8, toScale: 1 };
        left.splice(i, 1);
      }
    };
    take((it) => onBoard.filter((p) => !keep.has(p) && p.colour === it.colour && p.type === it.type));
    take((it) => benches[it.colour].filter((p) => !keep.has(p) && p.type === it.type));
    take((it) => onBoard.filter((p) => !keep.has(p) && p.colour === it.colour));
    take((it) => benches[it.colour].filter((p) => !keep.has(p)));
    for (const it of left) {
      const p = getPiece(it.colour, it.type);
      p.at = it.sq;
      p.g.scale.setScalar(1);
      cellPos(it.sq, p.g.position);
      next[it.sq] = p;
      keep.add(p);
    }
    // whatever is left on the board goes to its bench
    for (const p of onBoard) if (!keep.has(p)) toBench(p, 0);
    for (let i = 0; i < 64; i++) bySq[i] = next[i];
    fx.sel = -1;
  }

  function toBench(p, delay = 0.1) {
    p.at = -1;
    const list = benches[p.colour];
    list.push(p);
    const k = list.length - 1;
    p.bench = k;
    p.anim = { kind: 'fly', t: -delay, dur: 0.9, from: p.g.position.clone(), to: benchPos(p.colour, k), arc: 3.0, toScale: BENCH_SCALE, spin: p.colour ? -1 : 1 };
  }

  // Animate a move (from CH.play). `done(ev)` runs when the piece lands.
  function move(ev, done) {
    const p = bySq[ev.from];
    if (!p) {
      if (done) done(ev);
      return;
    }
    let victim = null;
    if (ev.capSq >= 0) {
      victim = bySq[ev.capSq];
      bySq[ev.capSq] = null;
    }
    bySq[ev.from] = null;
    bySq[ev.to] = p;
    p.at = ev.to;
    const knight = ev.type === 2;
    const from = cellPos(ev.from), to = cellPos(ev.to);
    const dist = from.distanceTo(to);
    p.anim = { kind: 'hop', t: 0, dur: knight ? 0.55 : 0.26 + Math.min(0.24, dist * 0.04), from, to, arc: knight ? 1.5 : 0.3 + dist * 0.05, ev, done, victim, toScale: 1 };
    if (ev.castle) {
      const r = bySq[ev.castle.from];
      if (r) {
        bySq[ev.castle.from] = null;
        bySq[ev.castle.to] = r;
        r.at = ev.castle.to;
        r.anim = { kind: 'hop', t: -0.18, dur: 0.5, from: cellPos(ev.castle.from), to: cellPos(ev.castle.to), arc: 1.3, toScale: 1 };
      }
    }
    fx.sel = -1;
  }

  function bonk(victim, at) {
    if (!victim) return;
    toBench(victim, 0.05);
    victim.dizzy = 2.6;
    if (bursts) bursts.add('BONK!', at.x, TOP + 1.6, at.z, 1.9, '#ffd400', '#e8372c');
    if (flyers) {
      flyers.add('💥', at.x, TOP + 0.8, at.z, 0, 0.6, 1.0, 0.45, 0, 0);
      for (let i = 0; i < 6; i++) flyers.add(i % 2 ? '⭐' : '💫', at.x, TOP + 0.8, at.z, rand(-2, 2), rand(1.5, 3), 0.42, 0.8, rand(-4, 4), 5);
    }
  }

  // ---------------------------------------------------------------- the marks

  const marks = {};
  const pool = { dots: [], rings: [], icons: [] };
  function flat(geo, mat, order = 5) {
    const m = new T.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.renderOrder = order;
    scene.add(m);
    return m;
  }
  function square(color, opacity, order = 4) {
    return flat(new T.PlaneGeometry(SQ * 0.98, SQ * 0.98), new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), order);
  }
  function frameTexture(color, ink) {
    const [c, g] = makeCanvas(128, 128);
    g.strokeStyle = ink;
    g.lineWidth = 16;
    Kit.gfx.roundRect(g, 8, 8, 112, 112, 20);
    g.stroke();
    g.strokeStyle = color;
    g.lineWidth = 9;
    Kit.gfx.roundRect(g, 8, 8, 112, 112, 20);
    g.stroke();
    return toTexture(c);
  }
  function sprite(emoji, size, order = 24) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: emojiTexture(emoji), depthTest: false, transparent: true }));
    s.scale.setScalar(size);
    s.visible = false;
    s.renderOrder = order;
    scene.add(s);
    return s;
  }
  function buildMarks() {
    marks.lastA = square('#ffe066', 0.55, 3);
    marks.lastB = square('#ffd400', 0.7, 3);
    marks.check = square('#ff3030', 0.75, 4);
    marks.checkRing = flat(new T.RingGeometry(0.44, 0.6, 36), new T.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, depthWrite: false }), 6);
    marks.hintFrom = square('#5ef2ff', 0.75, 4);
    marks.hintTo = square('#ffd400', 0.85, 4);
    marks.sel = square('#ffffff', 0.55, 4);
    marks.cursor = flat(new T.PlaneGeometry(SQ, SQ), new T.MeshBasicMaterial({ map: frameTexture('#ffffff', '#14121f'), transparent: true, depthWrite: false }), 9);
    marks.selRing = flat(new T.RingGeometry(0.4, 0.5, 32), new T.MeshBasicMaterial({ color: '#ffd400', transparent: true, depthWrite: false }), 6);
    marks.checkIcon = sprite('⚠️', 0.62);
    marks.finger = sprite('👇', 0.7);
    marks.danger = sprite('❗', 0.6);
    // the dots show through a piece standing in front of them, so every square you can go to is seen
    const dotMat = new T.MeshBasicMaterial({ color: '#3bff7a', transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
    const edgeMat = new T.MeshBasicMaterial({ color: '#14121f', transparent: true, opacity: 0.5, depthWrite: false, depthTest: false });
    const ringMat = new T.MeshBasicMaterial({ color: '#ff3d3d', transparent: true, opacity: 0.95, depthWrite: false });
    for (let i = 0; i < 28; i++) {
      pool.dots.push({ d: flat(new T.CircleGeometry(0.17, 24), dotMat, 7), e: flat(new T.CircleGeometry(0.22, 24), edgeMat, 6) });
      pool.rings.push(flat(new T.RingGeometry(0.36, 0.47, 32), ringMat, 7));
    }
    for (let i = 0; i < 16; i++) pool.icons.push(sprite('💥', 0.42, 25));
    marks.stars = [];
    for (let i = 0; i < 8; i++) marks.stars.push(sprite('⭐', 0.75, 22));
    // the picked-up piece's name: drawn before the dots and icons so it never hides a square it can go to
    marks.name = new T.Sprite(new T.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true }));
    marks.name.visible = false;
    marks.name.renderOrder = 5;
    scene.add(marks.name);
  }

  let shown = []; // the selected piece's moves: [{ to, captured, promos, castle, ep }]
  function moves(from, list) {
    shown = list || [];
    fx.movesT = 0;
  }
  function select(sq, label) {
    fx.sel = sq;
    if (sq < 0) moves(-1, []);
    if (label) {
      marks.name.material.map = nameTexture(label);
      marks.name.material.needsUpdate = true;
      fx.nameT = 0;
    }
    marks.name.visible = sq >= 0 && !!label;
  }
  const nameCache = {};
  function nameTexture(text) {
    const word = Kit.lang ? Kit.lang.t(text) : text;
    if (nameCache[word]) return nameCache[word];
    const [c, g] = makeCanvas(256, 80);
    g.font = `40px ${FONT}`;
    const w = Math.min(240, g.measureText(word).width + 36);
    g.fillStyle = '#ffffff';
    Kit.gfx.roundRect(g, (256 - w) / 2, 10, w, 60, 30);
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#14121f';
    g.stroke();
    g.fillStyle = '#14121f';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(word, 128, 43, 220);
    return (nameCache[word] = toTexture(c));
  }
  function relabel() {
    for (const k of Object.keys(nameCache)) delete nameCache[k];
  }
  function last(from, to) {
    fx.lastFrom = from;
    fx.lastTo = to;
  }
  function check(sq) { fx.check = sq; }
  function hint(from, to, danger = -1) {
    fx.hintFrom = from;
    fx.hintTo = to;
    fx.danger = danger;
    fx.hintT = 0;
  }
  function cursor(sq) { fx.cursor = sq; }
  function stars(list) { fx.stars = list || []; }
  function shake(secs) { fx.shake = Math.max(fx.shake, secs); }

  // ---------------------------------------------------------------- every frame

  const tmp = new T.Vector3();
  const ease = (u) => 1 - Math.pow(1 - u, 3);
  function update(dt) {
    fx.t += dt;
    for (const p of pieces) if (p.g.visible) updatePiece(p, dt);
    updateMarks();
    if (fx.shake > 0) {
      fx.shake = Math.max(0, fx.shake - dt);
      const amp = fx.shake * 0.22;
      cam.position.set(camBase.x + (Math.random() - 0.5) * amp, camBase.y + (Math.random() - 0.5) * amp, camBase.z + (Math.random() - 0.5) * amp);
      cam.updateMatrixWorld(true);
    } else if (!cam.position.equals(camBase) && camBase.lengthSq()) {
      cam.position.copy(camBase);
      cam.updateMatrixWorld(true);
    }
  }

  function updatePiece(p, dt) {
    const a = p.anim;
    if (a) {
      a.t += dt;
      const u = Math.max(0, Math.min(1, a.t / a.dur));
      const k = a.kind === 'fly' ? u : ease(u);
      if (a.t >= 0) {
        p.g.position.lerpVectors(a.from, a.to, k);
        p.g.position.y += Math.sin(u * Math.PI) * a.arc;
        const s0 = a.fromScale !== undefined ? a.fromScale : (a.fromScale = p.g.scale.x);
        p.g.scale.setScalar(s0 + (a.toScale - s0) * k);
        if (a.kind === 'fly') p.body.rotation.z = u * Math.PI * 4 * (a.spin || 1);
        if (a.kind === 'hop') {
          const sq = Math.sin(u * Math.PI);
          p.body.scale.set(1 - sq * 0.08, 1 + sq * 0.14, 1 - sq * 0.08);
          // the piece it's about to land on gets bonked just before it touches down
          if (a.victim && u > 0.8) {
            bonk(a.victim, a.to);
            a.victim = null;
          }
        }
      }
      if (u >= 1 && a.t >= 0) {
        p.anim = null;
        p.body.rotation.z = 0;
        p.body.scale.set(1, 1, 1);
        p.g.position.copy(a.to);
        p.g.scale.setScalar(a.toScale);
        if (a.kind === 'hop') {
          p.land = 0;
          if (a.victim) bonk(a.victim, a.to);
          if (a.ev && a.ev.promo) promote(p, a.ev.promo);
          if (a.done) a.done(a.ev);
        }
      }
    }
    if (p.land >= 0) {
      p.land += dt;
      const k = p.land / 0.25;
      const sq = Math.sin(Math.min(1, k) * Math.PI) * 0.22 * (1 - Math.min(1, k));
      p.body.scale.set(1 + sq, 1 - sq * 1.4, 1 + sq);
      if (k >= 1) {
        p.land = -1;
        p.body.scale.set(1, 1, 1);
      }
    }
    // the picked-up piece floats and wiggles; benched pieces are dizzy for a moment, then sway happily
    const lift = p.at >= 0 && p.at === fx.sel && !p.anim ? 0.3 + Math.sin(fx.t * 6) * 0.05 : 0;
    p.lift += (lift - p.lift) * Math.min(1, dt * 14);
    if (!p.anim) {
      p.body.position.y = p.lift;
      p.body.rotation.z = p.at === fx.sel && p.at >= 0 ? Math.sin(fx.t * 9) * 0.07 : p.bench >= 0 ? Math.sin(fx.t * 1.8 + p.id) * 0.05 : 0;
    }
    if (p.dizzy > 0 && !p.anim) {
      p.dizzy -= dt;
      if (flyers && Math.random() < dt * 4) {
        const q = p.g.position;
        flyers.add(Math.random() < 0.5 ? '💫' : '⭐', q.x + rand(-0.2, 0.2), q.y + 0.95, q.z, rand(-0.4, 0.4), 0.6, 0.26, 0.7, rand(-3, 3), 0);
      }
    }
    // face the camera (knights: toward the other side)
    const want = faceOf(p);
    let da = want - p.body.rotation.y;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    p.body.rotation.y += da * Math.min(1, dt * 8);
    p.shadow.material.opacity = 1 / (1 + p.lift * 2 + (p.anim ? Math.max(0, p.g.position.y - TOP) : 0));
    p.shadow.position.y = (p.at >= 0 ? -p.g.position.y + TOP + 0.006 : 0.012) / p.g.scale.x;
  }

  function promote(p, type) {
    setModel(p, type);
    p.body.rotation.y = faceOf(p) + Math.PI * 2;
    const q = p.g.position;
    if (bursts) bursts.add('TA-DA!', q.x, TOP + 1.8, q.z, 1.9, '#fff3a0', '#a77bff');
    if (flyers) for (let i = 0; i < 12; i++) flyers.add(i % 3 ? '✨' : '⭐', q.x, TOP + 0.8, q.z, rand(-2.4, 2.4), rand(1.5, 3.4), 0.42, 0.9, rand(-4, 4), 4);
  }

  const showSq = (m, sq, y = 0.004) => {
    m.visible = sq >= 0;
    if (sq >= 0) {
      cellPos(sq, tmp);
      m.position.set(tmp.x, tmp.y + y, tmp.z);
    }
  };
  // the top of the piece on a square (for icons over it)
  const topOf = (sq) => {
    const p = bySq[sq];
    const h = p ? [0, 0.85, 1.1, 1.25, 0.98, 1.25, 1.45][p.type] : 0.4;
    return cellPos(sq, tmp).y + h;
  };

  function updateMarks() {
    const t = fx.t;
    showSq(marks.lastA, fx.lastFrom, 0.002);
    showSq(marks.lastB, fx.lastTo, 0.003);
    showSq(marks.check, fx.check, 0.005);
    if (fx.check >= 0) marks.check.material.opacity = 0.55 + Math.sin(t * 7) * 0.25;
    showSq(marks.checkRing, fx.check, 0.016);
    if (fx.check >= 0) marks.checkRing.scale.setScalar(1 + Math.sin(t * 7) * 0.08);
    marks.checkIcon.visible = fx.check >= 0;
    if (fx.check >= 0) {
      cellPos(fx.check, tmp);
      marks.checkIcon.position.set(tmp.x, topOf(fx.check) + 0.4 + Math.abs(Math.sin(t * 4)) * 0.12, tmp.z);
    }
    showSq(marks.sel, fx.sel, 0.006);
    showSq(marks.selRing, fx.sel, 0.012);
    if (fx.sel >= 0) marks.selRing.scale.setScalar(1 + Math.sin(t * 6) * 0.05);
    if (marks.name.visible && fx.sel >= 0) {
      cellPos(fx.sel, tmp);
      const w = marks.name.material.map.image.width, h = marks.name.material.map.image.height;
      marks.name.scale.set(1.25, (1.25 * h) / w, 1);
      marks.name.position.set(tmp.x, topOf(fx.sel) + 0.6, tmp.z);
    }
    // the hint: the piece glows blue, the square gold with a bouncing finger
    fx.hintT += 1 / 60;
    showSq(marks.hintFrom, fx.hintFrom, 0.007);
    showSq(marks.hintTo, fx.hintTo, 0.007);
    const pulse = 0.55 + Math.sin(t * 6) * 0.3;
    marks.hintFrom.material.opacity = pulse;
    marks.hintTo.material.opacity = pulse + 0.1;
    marks.finger.visible = fx.hintTo >= 0;
    if (fx.hintTo >= 0) {
      cellPos(fx.hintTo, tmp);
      marks.finger.position.set(tmp.x, topOf(fx.hintTo) + 0.45 + Math.abs(Math.sin(t * 5)) * 0.25, tmp.z);
    }
    marks.danger.visible = fx.danger >= 0;
    if (fx.danger >= 0) {
      cellPos(fx.danger, tmp);
      marks.danger.position.set(tmp.x + 0.25, topOf(fx.danger) + 0.35 + Math.abs(Math.sin(t * 5)) * 0.15, tmp.z);
    }
    showSq(marks.cursor, fx.cursor, 0.01);
    // the moves of the picked-up piece
    let di = 0, ri = 0, ii = 0;
    const grow = Math.min(1, (fx.movesT = (fx.movesT || 0) + 1 / 60) / 0.15);
    for (const mv of shown) {
      cellPos(mv.to, tmp);
      if (mv.captured) {
        const r = pool.rings[ri++];
        r.visible = true;
        r.position.set(tmp.x, tmp.y + 0.013, tmp.z);
        r.scale.setScalar(grow * (1 + Math.sin(t * 6) * 0.06));
        const ic = pool.icons[ii++];
        if (ic) {
          ic.material.map = emojiTexture('💥');
          ic.visible = true;
          ic.position.set(tmp.x, topOf(mv.capSq >= 0 ? mv.capSq : mv.to) + 0.3, tmp.z);
        }
      } else {
        const d = pool.dots[di++];
        d.d.visible = d.e.visible = true;
        d.d.position.set(tmp.x, tmp.y + 0.014, tmp.z);
        d.e.position.set(tmp.x, tmp.y + 0.012, tmp.z);
        d.d.scale.setScalar(grow * (1 + Math.sin(t * 6 + mv.to) * 0.08));
        d.e.scale.setScalar(grow);
      }
      const extra = mv.promos && mv.promos.length ? '👑' : mv.castle ? '🏰' : '';
      if (extra && pool.icons[ii]) {
        const ic = pool.icons[ii++];
        ic.material.map = emojiTexture(extra);
        ic.visible = true;
        ic.position.set(tmp.x, tmp.y + 0.55 + Math.abs(Math.sin(t * 4)) * 0.1, tmp.z);
      }
    }
    for (; di < pool.dots.length; di++) pool.dots[di].d.visible = pool.dots[di].e.visible = false;
    for (; ri < pool.rings.length; ri++) pool.rings[ri].visible = false;
    for (; ii < pool.icons.length; ii++) pool.icons[ii].visible = false;
    // the stars of a lesson
    const st = fx.stars || [];
    marks.stars.forEach((s, i) => {
      s.visible = i < st.length && st[i] >= 0;
      if (s.visible) {
        cellPos(st[i], tmp);
        s.position.set(tmp.x, tmp.y + 0.45 + Math.sin(t * 3 + i) * 0.08, tmp.z);
        s.material.rotation = Math.sin(t * 2 + i) * 0.2;
      }
    });
  }

  // ---------------------------------------------------------------- camera

  // Aim the camera down at `elev` radians from the direction `az` (0: from +z, the near end), so the world points
  // `pts` fill the screen minus margins { l, r, t, b } in pixels.
  const right = new T.Vector3(), up = new T.Vector3();
  function fit(pts, elev, az, m) {
    fx.az = az;
    cam.clearViewOffset();
    const dir = new T.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev));
    const center = new T.Vector3();
    pts.forEach((p) => center.add(p));
    center.multiplyScalar(1 / pts.length);
    const hw = Math.max(0.1, (W - m.l - m.r) / W), hh = Math.max(0.1, (H - m.t - m.b) / H);
    const box = { x0: -hw, x1: hw, y0: -hh, y1: hh };
    const place = (d) => {
      cam.position.copy(center).addScaledVector(dir, d);
      cam.up.set(0, 1, 0);
      cam.lookAt(center);
      cam.updateMatrixWorld(true);
    };
    const bounds = () => {
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const p of pts) {
        tmp.copy(p).project(cam);
        x0 = Math.min(x0, tmp.x);
        x1 = Math.max(x1, tmp.x);
        y0 = Math.min(y0, tmp.y);
        y1 = Math.max(y1, tmp.y);
      }
      return { x0, x1, y0, y1 };
    };
    for (let iter = 0; iter < 4; iter++) {
      let lo = 2, hi = 300;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        place(mid);
        const b = bounds();
        if (b.x0 >= box.x0 && b.x1 <= box.x1 && b.y0 >= box.y0 && b.y1 <= box.y1) hi = mid;
        else lo = mid;
      }
      place(hi);
      const b = bounds();
      const dx = (b.x0 + b.x1) / 2 - (box.x0 + box.x1) / 2;
      const dy = (b.y0 + b.y1) / 2 - (box.y0 + box.y1) / 2;
      const d = cam.position.distanceTo(center);
      const halfH = d * Math.tan((cam.fov * Math.PI) / 360), halfW = halfH * cam.aspect;
      right.setFromMatrixColumn(cam.matrixWorld, 0);
      up.setFromMatrixColumn(cam.matrixWorld, 1);
      center.addScaledVector(right, dx * halfW).addScaledVector(up, dy * halfH);
    }
    const bx = (m.l + W - m.r) / 2, by = (m.t + H - m.b) / 2;
    cam.setViewOffset(W, H, W / 2 - bx, H / 2 - by, W, H);
    cam.updateMatrixWorld(true);
    camBase.copy(cam.position);
    return center;
  }

  // The square under screen point (x, y), or -1. A tap on a piece picks its square.
  const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), -TOP), hit = new T.Vector3();
  function pick(x, y) {
    ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const live = pieces.filter((p) => p.at >= 0 && p.g.visible && !p.anim);
    const hits = ray.intersectObjects(live.map((p) => p.model), true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !live.find((p) => p.model === o)) o = o.parent;
      const p = live.find((q) => q.model === o);
      if (p) return p.at;
    }
    if (!ray.ray.intersectPlane(plane, hit)) return -1;
    if (Math.abs(hit.x) > 4 * SQ || Math.abs(hit.z) > 4 * SQ) return -1;
    return sqAt(hit.x, hit.z);
  }

  function toScreen(v, out = { x: 0, y: 0 }) {
    tmp.copy(v).project(cam);
    out.x = ((tmp.x + 1) / 2) * W;
    out.y = ((1 - tmp.y) / 2) * H;
    return out;
  }

  // The size of one square on screen near the middle of the near half (for the tap-size checks).
  function squarePixels() {
    const a = toScreen(new T.Vector3(-0.5, TOP, 2)), b = toScreen(new T.Vector3(0.5, TOP, 2));
    const c = toScreen(new T.Vector3(-0.5, TOP, -3)), d = toScreen(new T.Vector3(0.5, TOP, -3));
    return { near: Math.round(Math.hypot(b.x - a.x, b.y - a.y)), far: Math.round(Math.hypot(d.x - c.x, d.y - c.y)) };
  }
  // the board's outline on screen
  function boardRect() {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const s = toScreen(new T.Vector3(sx * 4 * SQ, TOP, sz * 4 * SQ));
      x0 = Math.min(x0, s.x);
      x1 = Math.max(x1, s.x);
      y0 = Math.min(y0, s.y);
      y1 = Math.max(y1, s.y);
    }
    return { x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1) };
  }

  function render() {
    if (renderer) renderer.render(scene, cam);
  }

  // ---------------------------------------------------------------- pictures of the pieces for the page

  // PNG data URLs of each piece in each colour (for the promotion picker and the lessons), made once.
  function pieceArt(size = 160) {
    const out = { 0: {}, 1: {} };
    const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(size, size, false);
    r.outputEncoding = T.sRGBEncoding;
    const sc = new T.Scene();
    sc.add(new T.HemisphereLight('#ffffff', '#8a6e58', 0.95));
    const key = new T.DirectionalLight('#fff4e0', 0.9);
    key.position.set(-2, 4, 5);
    sc.add(key);
    const c = new T.PerspectiveCamera(30, 1, 0.1, 30);
    try {
      for (const colour of [0, 1]) {
        for (let type = 1; type <= 6; type++) {
          const g = model(type, colour);
          if (type === 2) g.rotation.y = -0.7;
          sc.add(g);
          c.position.set(0, 1.2, 2.75);
          c.lookAt(0, 0.7, 0);
          r.render(sc, c);
          out[colour][type] = r.domElement.toDataURL('image/png');
          sc.remove(g);
        }
      }
    } finally {
      r.dispose();
      r.forceContextLoss();
    }
    return out;
  }

  CH.stage = {
    init, useFx, resize, render, update, fit, pick, toScreen, cellPos, sqAt, setView, setPieces, syncPieces, move, select, moves,
    last, check, hint, cursor, stars, shake, layout, framePoints, relabel, pieceArt, squarePixels, boardRect,
    scene, cam, HW, TOP, SQ, COL,
    busy: () => pieces.some((p) => p.anim && p.g.visible),
    pieceAt: (sq) => bySq[sq],
    benchCount: (c) => benches[c].length,
    set nearColour(c) { fx.nearColour = c; },
    get spots() { return spots; },
    get W() { return W; },
    get H() { return H; },
    get renderer() { return renderer; },
    get hintTo() { return fx.hintTo; },
    get hintFrom() { return fx.hintFrom; },
    get selected() { return fx.sel; },
    get shown() { return shown; },
    get az() { return fx.az; },
    get near() { return fx.near; },
  };
})();

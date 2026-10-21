/* TT Chess: your brother. In 1 player (and in LEARN) the other brother (Kit.roster.buddyFor: Teddy when Tommy plays,
   Tommy for Teddy) comes when called with T or his face button, any time and as often as you like. A visit:
     pop in beside you (at his roster buddyScale, in a puff of stars) → hello with his signature move (Teddy's boxing
     combo, Tommy's Y with ✌️) → toss you a treat (🍦 💧 🧃 🍪 🍉 🍌) → the hint: the piece to move glows blue, its
     square gold with a bouncing 👇, and a toast says what to do ("TOMMY SAYS: MOVE THE KNIGHT!", "TOMMY SAYS: YOUR
     QUEEN IS IN DANGER!", "BONK THE ROOK!", "CHECKMATE! MOVE THE QUEEN!", "SAVE YOUR KING!") → once you've moved, his
     goodbye move → pop out.
   The hint comes from the 🔥 NORMAL search, which the game starts as he pops in (api.wantHint) and runs a slice per
   frame; he points once it's ready and it's your turn. Calling him again while he's there brings another treat and
   points again. In 2 players both brothers are already at the board, so T is a high five (CH.highFive): they jump
   together, slap hands and jump back. It doesn't change the game. */
(function () {
  'use strict';
  const T = THREE;
  const CH = (window.CH = window.CH || {});
  const { pick, emojiTexture, rand } = Kit.gfx;

  const V = { pop: 0.35, treatAt: 2.1, helpAt: 2.7, byeAfter: 0.7, maxWait: 18 };
  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];

  let api = null, entry = null, flyers = null;
  const actor = CH.makeActor();
  // phase: off | in | here | bye | out
  const b = { phase: 'off', t: 0, given: false, treatAt: V.treatAt, helped: -1, pointing: -1, movedAt: -1, calls: 0, treats: 0, hints: 0, lastTreat: null, popT: 0, lastHint: null };
  const treat = { sprite: null, flyT: -1, emoji: '', from: new T.Vector3(), to: new T.Vector3() };
  const tmp = new T.Vector3();

  function init(a) {
    api = a;
    treat.sprite = new T.Sprite(new T.SpriteMaterial({ depthWrite: false, depthTest: false, transparent: true }));
    treat.sprite.visible = false;
    treat.sprite.renderOrder = 22;
    CH.stage.scene.add(treat.sprite);
    flyers = a.flyers;
    actor.attach(CH.stage.scene, flyers);
    actor.visible = false;
  }

  // The brother for this player (rebuilt only when he changes). Returns his roster entry.
  function setFor(playerId) {
    const id = Kit.roster.buddyFor(playerId);
    if (entry && entry.id === id) return entry;
    dismiss();
    entry = Kit.roster.get(id);
    actor.set(id, 1);
    const tag = Kit.gfx.nameTag(entry.name, entry.tag || '#ffb02e');
    tag.position.y = 2.75;
    actor.person.root.add(tag);
    actor.visible = false;
    return entry;
  }

  const scaleNow = () => (entry.buddyScale || 0.8) * (api.scale ? api.scale() : 1);

  function call() {
    if (!entry) return 'none';
    b.calls++;
    api.wantHint();
    if (b.phase === 'off' || b.phase === 'out') return summon();
    // another hello, another treat, and he points again
    actor.react('hello');
    b.phase = 'here';
    b.t = Math.min(b.t, V.pop + 0.1);
    b.given = false;
    b.treatAt = b.t + 1.5;
    b.helped = -1;
    b.movedAt = -1;
    b.popT = Math.max(b.popT, V.pop);
    api.toast(`${entry.name}'S HERE!`, 'buddy');
    CH.sfx.pop();
    return 'again';
  }

  function summon() {
    const s = api.spot();
    Object.assign(b, { phase: 'in', t: 0, given: false, treatAt: V.treatAt, helped: -1, pointing: -1, movedAt: -1, popT: 0 });
    actor.setScale(0.01);
    actor.place(s.x, 0, s.z);
    actor.face = null;
    actor.faceDefault = s.face;
    actor.visible = true;
    actor.react('idle');
    const p = actor.root.position;
    for (let i = 0; i < 14; i++) flyers.add(i % 3 ? '⭐' : '✨', p.x, 1 + rand(0, 1), p.z, rand(-2.5, 2.5), rand(1, 4), rand(0.3, 0.5), 0.8, rand(-4, 4), 3);
    api.toast(`${entry.name}'S HERE!`, 'buddy');
    CH.sfx.pop();
    return 'summoned';
  }

  function dismiss() {
    b.phase = 'off';
    actor.visible = false;
    treat.flyT = -1;
    if (treat.sprite) treat.sprite.visible = false;
    if (b.pointing >= 0 && api) api.clearHint();
    b.pointing = -1;
  }

  // You played a move: the hint has done its job.
  function moved() {
    if (b.phase === 'here' && b.pointing >= 0) {
      b.pointing = -1;
      b.movedAt = b.t;
    }
  }

  const reset = () => dismiss();

  // ---------------------------------------------------------------- the treat

  function giveTreat() {
    const [emoji, label] = pick(TREATS);
    treat.emoji = emoji;
    b.treats++;
    b.lastTreat = emoji;
    treat.sprite.material.map = emojiTexture(emoji);
    treat.sprite.material.needsUpdate = true;
    actor.root.updateMatrixWorld(true);
    Kit.people.handWorld(actor.person, 1, treat.from);
    treat.sprite.position.copy(treat.from);
    treat.sprite.scale.setScalar(0.7);
    treat.sprite.visible = true;
    treat.flyT = 0;
    api.toast(`${emoji} ${label} FROM ${entry.name}!`, 'treat');
    CH.sfx.kit('coin', 6);
  }

  function updateTreat(dt) {
    if (treat.flyT < 0) return;
    const player = api.player();
    treat.flyT += dt / 0.65;
    player.root.updateMatrixWorld(true);
    Kit.people.handWorld(player.person, -1, treat.to);
    const k = Math.min(1, treat.flyT);
    treat.sprite.position.lerpVectors(treat.from, treat.to, k);
    treat.sprite.position.y += Math.sin(k * Math.PI) * 1.6;
    treat.sprite.material.rotation = k * Math.PI * 2;
    if (k >= 1) {
      treat.flyT = -1;
      treat.sprite.visible = false;
      treat.sprite.material.rotation = 0;
      player.hold(treat.emoji, 8);
      player.react('cheer');
    }
  }

  // ---------------------------------------------------------------- the visit

  function update(dt) {
    updateTreat(dt);
    if (b.phase === 'off') return;
    b.t += dt;
    const s = api.spot();
    const full = scaleNow();
    if (b.phase === 'in' || b.phase === 'here' || b.phase === 'bye') {
      b.popT += dt;
      const u = Math.min(1, b.popT / V.pop);
      const spring = u < 1 ? 1 + Math.sin(u * Math.PI) * 0.25 : 1;
      actor.setScale(full * Math.max(0.01, u) * spring);
      if (!actor.moving && Math.hypot(actor.root.position.x - s.x, actor.root.position.z - s.z) > 0.05) actor.place(s.x, 0, s.z);
    }
    if (b.phase === 'in' && b.t >= V.pop) {
      b.phase = 'here';
      actor.react('hello');
    }
    if (b.phase === 'here') {
      actor.faceDefault = s.face;
      if (!b.given && b.t > b.treatAt - 0.35) actor.act('give', 0.6, 0, true);
      if (!b.given && b.t > b.treatAt) {
        b.given = true;
        giveTreat();
      }
      const ready = b.given && b.t > Math.max(V.helpAt, b.treatAt + 0.5) && b.movedAt < 0;
      if (ready && b.helped !== api.turnId()) {
        // the hint: once the treat's on its way, it's your turn and the search has finished
        const h = api.canHint() ? api.showHint() : null;
        if (h) {
          b.helped = api.turnId();
          b.pointing = h.to;
          b.hints++;
          b.lastHint = h;
          api.toast(`${entry.name} SAYS: ${h.text}`, h.warn ? 'save warn' : 'save');
          if (h.warn) CH.sfx.alert();
          else CH.sfx.nice();
        }
      }
      if (b.pointing >= 0) {
        CH.stage.cellPos(b.pointing, tmp);
        const p = actor.root.position;
        actor.face = Math.atan2(-(tmp.x - p.x), -(tmp.z - p.z));
        if (actor.mode !== 'signature') actor.act('point', 0.3, 0);
      } else actor.face = null;
      const idle = b.given && b.pointing < 0 && treat.flyT < 0;
      if ((b.movedAt >= 0 && b.t > b.movedAt + V.byeAfter) || (idle && b.t > V.maxWait) || (idle && api.roundOver() && b.t > V.helpAt + 1.2)) {
        b.phase = 'bye';
        b.t = 0;
        actor.face = null;
        actor.react('goodbye');
      }
    } else if (b.phase === 'bye') {
      if (b.t > 1.7) {
        b.phase = 'out';
        b.t = 0;
        CH.sfx.pop();
      }
    } else if (b.phase === 'out') {
      const u = Math.min(1, b.t / 0.25);
      actor.setScale(full * Math.max(0.01, 1 - u) * (1 + Math.sin(u * Math.PI) * 0.2));
      if (u >= 1) {
        const p = actor.root.position;
        for (let i = 0; i < 8; i++) flyers.add('✨', p.x, 1, p.z, rand(-2, 2), rand(1, 3), 0.35, 0.6, rand(-4, 4), 3);
        dismiss();
      }
    }
    actor.update(dt);
  }

  // ---------------------------------------------------------------- 2 players: the high five

  // Both boys jump to meet beside the board (a big leap if the board is in the way), slap hands and jump back.
  const hf = { on: false, t: 0, clapped: false, count: 0, legs: null };
  function leap(a, from, to, dur, h) {
    return { a, from: { x: from.x, z: from.z }, to: { x: to.x, z: to.z }, t: 0, dur, h };
  }
  function highFive() {
    if (hf.on) return 'busy';
    const [a, c] = api.players();
    const [pa, pc] = api.meet();
    const ha = a.root.position, hc = c.root.position;
    hf.on = true;
    hf.t = 0;
    hf.clapped = false;
    hf.back = false;
    hf.count++;
    a.react('idle');
    c.react('idle');
    hf.legs = [leap(a, ha, pa, 0.55, 1.2), leap(c, hc, pc, 0.85, 3.6)];
    return 'high5';
  }
  function stepLegs(dt) {
    let busy = false;
    for (const l of hf.legs) {
      if (l.t >= l.dur) continue;
      l.t = Math.min(l.dur, l.t + dt);
      const u = l.t / l.dur;
      const x = l.from.x + (l.to.x - l.from.x) * u, z = l.from.z + (l.to.z - l.from.z) * u;
      l.a.place(x, Math.sin(u * Math.PI) * l.h, z);
      l.a.face = Math.atan2(-(l.to.x - l.from.x), -(l.to.z - l.from.z));
      if (u < 1) busy = true;
      else l.a.place(l.to.x, 0, l.to.z);
    }
    return busy;
  }
  function updateHighFive(dt) {
    if (!hf.on) return;
    hf.t += dt;
    const [a, c] = api.players();
    const busy = stepLegs(dt);
    const pa = a.root.position, pc = c.root.position;
    if (!busy && !hf.clapped) {
      a.face = Math.atan2(-(pc.x - pa.x), -(pc.z - pa.z));
      c.face = Math.atan2(-(pa.x - pc.x), -(pa.z - pc.z));
      if (hf.raise === undefined || hf.raise < 0) hf.raise = hf.t;
      a.act('high5', 0.8, 2.6, true);
      c.act('high5', 0.8, 2.6, true);
      if (hf.t > hf.raise + 0.28) {
        hf.clapped = true;
        hf.clapT = hf.t;
        CH.sfx.clap();
        const x = (pa.x + pc.x) / 2, z = (pa.z + pc.z) / 2;
        flyers.add('💥', x, 2.5, z, 0, 0.5, 1.0, 0.5, 0, 0);
        for (let i = 0; i < 8; i++) flyers.add(i % 2 ? '🙌' : '⭐', x, 2.4, z, rand(-2.5, 2.5), rand(1.5, 3.5), rand(0.4, 0.6), 1, rand(-3, 3), 4);
        api.toast('HIGH FIVE! 🙌', 'buddy');
      }
    }
    if (hf.clapped && hf.t > hf.clapT + 0.9 && !hf.back) {
      hf.back = true;
      const [ha, hc] = api.homes();
      hf.legs = [leap(a, pa, ha, 0.55, 1.2), leap(c, pc, hc, 0.85, 3.6)];
    }
    if (hf.back && !busy) {
      hf.on = false;
      hf.raise = -1;
      a.face = c.face = null;
    }
  }
  function cancelHighFive() {
    if (!hf.on) return;
    hf.on = false;
    hf.raise = -1;
    const [a, c] = api.players();
    const [ha, hc] = api.homes();
    a.face = c.face = null;
    a.place(ha.x, 0, ha.z);
    c.place(hc.x, 0, hc.z);
  }

  CH.buddy = {
    init, setFor, call, summon, dismiss, moved, reset, update, V,
    get entry() { return entry; },
    get actor() { return actor; },
    get on() { return b.phase !== 'off'; },
    get phase() { return b.phase; },
    info() {
      const r = actor.root.position;
      return {
        phase: b.phase, id: entry && entry.id, t: +b.t.toFixed(2), given: b.given, pointing: b.pointing, calls: b.calls,
        treats: b.treats, hints: b.hints, lastTreat: b.lastTreat, lastHint: b.lastHint, pose: actor.pose,
        x: +r.x.toFixed(2), z: +r.z.toFixed(2), scale: +actor.scale.toFixed(2), visible: actor.visible, flying: treat.flyT >= 0,
        highFives: hf.count, highFiving: hf.on,
      };
    },
  };
  CH.highFive = { start: highFive, update: updateHighFive, cancel: cancelHighFive, get on() { return hf.on; } };
})();

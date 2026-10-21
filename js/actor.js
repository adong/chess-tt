/* TT Chess: a boy at his end of the board, from Tommy's Toy Box. CH.makeActor() wraps a Kit.people person:
     - stand somewhere, run to a spot (moveTo), face the camera or a direction (face)
     - reactions: hop, cheer, oops, hello / goodbye / signature (Tommy's Y with ✌️, Teddy's boxing with 💥 and his
       jump shot with a 🏀; everyone else waves), over (keep celebrating), shrug (a silly "oh well" for a loss)
     - act(pose, dur): play a pose for a moment: any Kit pose, or ours: 'think' (hand on chin), 'point' (right arm
       out at what he faces), 'shrug' and 'high5' (both hands up to slap his brother's)
     - hold(emoji): a treat in the left hand
   Standing poses settle the legs (the Kit's peace and wave poses stride like a runner). */
(function () {
  'use strict';
  const T = THREE;
  const CH = (window.CH = window.CH || {});
  const { rand, emojiTexture, radialTexture } = Kit.gfx;

  const DUR = { cheer: 0.7, signature: 1.8, oops: 0.9, hello: 1.8, shrug: 1.6 };
  const SPEED = { idle: 2.2, jump: 3, boxing: 6, peace: 4.2, wave: 5, jumpshot: 3, run: 13, give: 6, guard: 3, jab: 3, straight: 3, grab: 3, fall: 3, shrug: 5, think: 3, point: 3, high5: 3 };
  const STANDING = { peace: 1, wave: 1, idle: 1, give: 1, shrug: 1, think: 1, point: 1, high5: 1 };
  // our own poses, laid over the Kit's standing pose (see ours() below)
  const OURS = { shrug: 1, think: 1, point: 1, high5: 1 };

  let shadowTex = null;

  function makeActor() {
    const holder = new T.Group();
    const shadow = new T.Mesh(new T.PlaneGeometry(1.5, 1.2), new T.MeshBasicMaterial({ depthWrite: false, transparent: true }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.renderOrder = 1;
    const ball = new T.Sprite(new T.SpriteMaterial({ map: emojiTexture('🏀'), depthWrite: false, transparent: true }));
    ball.visible = false;
    ball.renderOrder = 19;
    const held = new T.Sprite(new T.SpriteMaterial({ depthWrite: false, transparent: true }));
    held.visible = false;
    held.renderOrder = 18;
    let p = null, entry = null, flyers = null, scene = null;
    const st = {
      mode: 'idle', pose: 'idle', t: 0, phase: 0, hopY: 0, hopV: 0, wob: 9, wobAmp: 0, sigIx: 0, beat: -1, loop: null,
      ballT: -1, face: null, faceDefault: Math.PI, scale: 1, since: 0, bursts: 0, moving: false, heldT: 0, lean: 0, leanNow: 0,
    };
    const target = new T.Vector3();
    let hasTarget = false, runSpeed = 7;
    const tmp = new T.Vector3(), tmp2 = new T.Vector3(), ballFrom = new T.Vector3(), ballTo = new T.Vector3();

    // Move into a scene, with that scene's flyers for ✌️ 💥 ⭐.
    function attach(sc, fl) {
      scene = sc;
      flyers = fl;
      sc.add(holder);
      sc.add(ball);
      if (!shadowTex) shadowTex = radialTexture(128, [[0, 'rgba(20,30,10,0.5)'], [0.6, 'rgba(20,30,10,0.22)'], [1, 'rgba(20,30,10,0)']]);
      shadow.material.map = shadowTex;
      shadow.material.needsUpdate = true;
      if (!shadow.parent) holder.add(shadow);
    }

    // Build the character for roster entry `id` at world scale `scale`.
    function set(id, scale = 1) {
      entry = Kit.roster.get(id) || Kit.roster.list[0];
      if (p) {
        holder.remove(p.root);
        p.root.traverse((o) => {
          if (o.isMesh) o.geometry.dispose();
        });
      }
      p = Kit.people.build(entry.look);
      p.root.rotation.y = facing();
      holder.add(p.root);
      st.sigIx = 0;
      st.mode = 'idle';
      st.pose = 'idle';
      st.loop = null;
      st.ballT = -1;
      ball.visible = false;
      setScale(scale);
      Kit.people.pose(p, 0, 'idle', 1);
      return entry;
    }

    function setScale(s) {
      st.scale = s;
      holder.scale.setScalar(s);
    }

    const facing = () => (st.face !== null ? st.face : st.faceDefault);

    function place(x, y, z) {
      holder.position.set(x, y, z);
      hasTarget = false;
      st.moving = false;
    }

    // Run to (x, z) at `speed` m/s (world units), facing where he's going; he faces `face` again once there.
    function moveTo(x, z, speed = 7) {
      target.set(x, holder.position.y, z);
      hasTarget = Math.hypot(x - holder.position.x, z - holder.position.z) > 0.03;
      runSpeed = speed;
    }

    function react(kind) {
      if (!p) return null;
      if (st.loop && kind !== 'hello' && kind !== 'idle') return st.pose;
      switch (kind) {
        case 'hop':
          if (st.mode === 'idle' && st.hopY < 0.05) st.hopV = Math.max(st.hopV, 2.2);
          return st.pose;
        case 'cheer':
          if (st.mode === 'signature') return st.pose;
          return begin('cheer', 'jump', DUR.cheer, 3.4);
        case 'signature': {
          if (st.mode === 'signature' && st.t > 0.4) return st.pose;
          const sig = entry.signature || ['wave'];
          const pose = sig[st.sigIx++ % sig.length];
          return begin('signature', pose, DUR.signature, hopFor(pose));
        }
        case 'hello':
          st.loop = null;
          return begin('signature', Kit.roster.signature(entry, 'hello'), DUR.hello, 2.6);
        case 'goodbye': {
          const pose = Kit.roster.signature(entry, 'goodbye');
          return begin('signature', pose, DUR.signature, hopFor(pose));
        }
        case 'oops':
          st.wob = 0;
          st.wobAmp = 0.18;
          if (st.mode === 'signature') return st.pose;
          return begin('oops', 'guard', DUR.oops, 0);
        case 'shrug':
          if (st.mode === 'signature') return st.pose;
          st.wob = 0;
          st.wobAmp = 0.1;
          return begin('act', 'shrug', DUR.shrug, 1.2);
        case 'sulk':
          // the end of a lost match: a shrug every so often until the next one starts
          st.loop = 'shrug';
          st.loopWait = 0.4;
          return begin('act', 'shrug', DUR.shrug, 1.2);
        case 'over': {
          const sig = entry.signature || ['wave'];
          const pose = Kit.roster.signature(entry, 'goodbye');
          st.sigIx = sig.indexOf(pose) + 1;
          st.loop = true;
          st.loopWait = 0.6;
          return begin('signature', pose, DUR.signature, hopFor(pose));
        }
        case 'idle':
          st.loop = null;
          st.mode = 'idle';
          st.pose = 'idle';
          return 'idle';
      }
      return null;
    }

    // Play a Kit pose (or one of ours) for `dur` seconds, unless a celebration is on (force overrides).
    function act(pose, dur, hop = 0, force = false) {
      if (!p || (!force && st.mode === 'signature' && st.t > 0.2)) return st.pose;
      if (st.mode === 'act' && st.pose === pose) {
        st.t = Math.max(st.t, dur);
        return pose;
      }
      return begin('act', pose, dur, hop);
    }

    const hopFor = (pose) => (pose === 'jumpshot' ? 5.4 : pose === 'peace' ? 2.6 : 1.4);

    function begin(mode, pose, dur, hop) {
      st.mode = mode;
      st.pose = pose;
      st.t = dur;
      st.phase = 0;
      st.beat = -1;
      if (hop) st.hopV = hop;
      st.since = 0;
      st.bursts = 0;
      if (pose === 'jumpshot') st.ballT = 0;
      return pose;
    }

    // A treat in his left hand (the camera side when he faces us) for `secs` seconds.
    function hold(emoji, secs = 8) {
      if (!p) return;
      held.material.map = emojiTexture(emoji);
      held.material.needsUpdate = true;
      p.armL.add(held);
      held.position.set(0, -0.86, -0.25);
      held.scale.setScalar(0.62);
      held.visible = true;
      st.heldT = secs;
    }
    function drop() {
      held.visible = false;
      st.heldT = 0;
    }

    function update(dt) {
      if (!p) return;
      st.t -= dt;
      if (st.mode !== 'idle' && st.t <= 0) {
        st.mode = 'idle';
        st.pose = 'idle';
      }
      if (st.loop && st.mode === 'idle') {
        st.loopWait -= dt;
        if (st.loopWait <= 0) {
          st.loopWait = st.loop === 'shrug' ? 1.4 : 0.6;
          if (st.loop === 'shrug') begin('act', 'shrug', DUR.shrug, 1.2);
          else {
            const sig = entry.signature || ['wave'];
            const pose = sig[st.sigIx++ % sig.length];
            begin('signature', pose, DUR.signature, hopFor(pose));
          }
        }
      }
      // running to a spot
      let runFace = null;
      st.moving = false;
      if (hasTarget) {
        tmp.subVectors(target, holder.position);
        tmp.y = 0;
        const d = tmp.length(), step = runSpeed * dt;
        if (d <= step || d < 0.02) {
          holder.position.x = target.x;
          holder.position.z = target.z;
          hasTarget = false;
        } else {
          holder.position.addScaledVector(tmp, step / d);
          runFace = Math.atan2(-tmp.x, -tmp.z); // people face -z: rotation.y = atan2(-dx, -dz) faces (dx, dz)
          st.moving = true;
        }
      }
      const pose = st.moving && st.mode !== 'signature' ? 'run' : st.pose;
      st.phase += dt * (SPEED[pose] || 2.2);
      const want = runFace !== null ? runFace : facing();
      let da = want - p.root.rotation.y;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      p.root.rotation.y += da * (1 - Math.exp(-(st.moving ? 16 : 10) * dt));
      const k = 1 - Math.exp(-16 * dt);
      p.hips.rotation.x += st.leanNow; // take last frame's extra lean off before the Kit eases the pose
      // our poses ease from where the arms were before the Kit's own pass (which eases them toward standing)
      const was = OURS[pose] ? { rx: p.armR.rotation.x, rz: p.armR.rotation.z, lx: p.armL.rotation.x, lz: p.armL.rotation.z, hx: p.head.rotation.x } : null;
      Kit.people.pose(p, st.phase, OURS[pose] ? 'idle' : pose, k);
      let tilt = 0;
      if (OURS[pose]) tilt = ours(pose, k, was);
      p.head.rotation.z += (tilt - p.head.rotation.z) * k;
      if (STANDING[pose]) {
        p.legL.rotation.x *= 0.35;
        p.legR.rotation.x *= 0.35;
      }
      if (pose === 'idle') {
        const breathe = Math.sin(st.phase) * 0.03;
        p.armL.rotation.z = -0.08 - breathe;
        p.armR.rotation.z = 0.08 + breathe;
      }
      // extra lean (the buddy bends toward a low target to jab it)
      st.leanNow += (st.lean - st.leanNow) * k;
      p.hips.rotation.x -= st.leanNow;
      // hop
      st.hopV -= 14 * dt;
      st.hopY = Math.max(0, st.hopY + st.hopV * dt);
      if (st.hopY === 0 && st.hopV < 0) st.hopV = 0;
      p.root.position.y = st.hopY;
      shadow.material.opacity = 1 / (1 + st.hopY * 1.2);
      // wobble after an oops
      st.wob += dt;
      p.root.rotation.z = st.wobAmp * Math.sin(st.wob * 17) * Math.exp(-st.wob * 3.2);
      st.since += dt;
      if (st.heldT > 0) {
        st.heldT -= dt;
        if (st.heldT <= 0) drop();
      }

      holder.updateMatrixWorld(true);
      if (!flyers) return;
      const s = st.scale;
      // boxing: a 💥 at each punch
      if (pose === 'boxing') {
        const beat = Math.floor((((st.phase / (Math.PI * 2)) % 1) + 1) % 1 * 4);
        if (beat !== st.beat) {
          st.beat = beat;
          if (beat === 0 || beat === 2) {
            CH.sfx.kit('punch');
            Kit.people.handWorld(p, beat === 0 ? -1 : 1, tmp);
            fwd(tmp2, 0.35 * s);
            flyers.add('💥', tmp.x + tmp2.x, tmp.y, tmp.z + tmp2.z, rand(-0.4, 0.4), rand(0.4, 1), 0.6 * s, 0.45, 0, 0);
          }
        }
      }
      // the Y: ✌️ and ⭐ float up from both hands, three little bursts
      if (pose === 'peace' && st.bursts < 3 && st.since > 0.15 + st.bursts * 0.55) {
        st.bursts++;
        for (const side of [-1, 1]) {
          Kit.people.handWorld(p, side, tmp);
          flyers.add(Math.random() < 0.7 ? '✌️' : '⭐', tmp.x, tmp.y + 0.1, tmp.z + 0.3, side * rand(0.3, 0.9), rand(1.6, 2.6), rand(0.45, 0.6) * s, 1.1, rand(-1, 1), 0.15);
        }
      }
      updateBall(dt);
    }

    // Our poses on top of the Kit's standing pose. Returns the head's sideways tilt.
    function ours(pose, k, was) {
      const KEY = { rx: [p.armR.rotation, 'x'], rz: [p.armR.rotation, 'z'], lx: [p.armL.rotation, 'x'], lz: [p.armL.rotation, 'z'], hx: [p.head.rotation, 'x'] };
      const to = (key, v) => {
        const [o, prop] = KEY[key];
        o[prop] = was[key] + (v - was[key]) * k;
      };
      const s = Math.sin(st.phase);
      if (pose === 'shrug') {
        // palms up, arms out low, shoulders bobbing: "oh well!"
        const bob = Math.abs(s) * 0.25;
        to('lx', 0.55);
        to('rx', 0.55);
        to('lz', -0.8 - bob);
        to('rz', 0.8 + bob);
        p.hips.position.y = p.hipY + bob * 0.25;
        return 0.28 * Math.sin(st.phase * 0.5);
      }
      if (pose === 'think') {
        // right hand up by the chin, head on one side
        to('rx', 2.45);
        to('rz', -0.55);
        to('lx', 0.3);
        to('lz', -0.3);
        to('hx', -0.12);
        return 0.22 + s * 0.05;
      }
      if (pose === 'point') {
        // right arm straight out at whatever he's facing
        to('rx', 1.55 + s * 0.06);
        to('rz', 0.0);
        return 0;
      }
      if (pose === 'high5') {
        // both hands up and forward, to slap his brother's (a double high five)
        to('rx', 2.6);
        to('lx', 2.6);
        to('rz', 0.12);
        to('lz', -0.12);
        return 0;
      }
      return 0;
    }

    // the way he's facing, as a horizontal unit vector times `len`
    function fwd(out, len) {
      const a = p.root.rotation.y;
      return out.set(-Math.sin(a) * len, 0, -Math.cos(a) * len);
    }

    // Teddy's jump shot: the ball rides up in his hands, leaves them at the top of the jump and arcs away.
    function updateBall(dt) {
      if (st.ballT < 0) return;
      st.ballT += dt;
      const s = st.scale;
      ball.scale.setScalar(0.5 * s);
      if (st.ballT < 0.38) {
        Kit.people.handWorld(p, -1, tmp);
        Kit.people.handWorld(p, 1, tmp2);
        ballFrom.copy(tmp).add(tmp2).multiplyScalar(0.5);
        ballFrom.y += 0.2 * s;
        ball.position.copy(ballFrom);
        ball.visible = true;
        ballTo.copy(ballFrom);
        fwd(tmp, 1.6 * s);
        ballTo.x += tmp.x;
        ballTo.z += tmp.z - 1.2 * s;
        ballTo.y += 1.2 * s;
      } else {
        const u = Math.min(1, (st.ballT - 0.38) / 0.8);
        ball.position.lerpVectors(ballFrom, ballTo, u);
        ball.position.y += Math.sin(u * Math.PI) * 1.4 * s;
        ball.material.rotation -= 8 * dt;
        if (u >= 1) {
          ball.visible = false;
          st.ballT = -1;
          CH.sfx.kit('swish');
          for (let i = 0; i < 6; i++) flyers.add('⭐', ballTo.x, ballTo.y, ballTo.z, rand(-1.5, 1.5), rand(0.5, 2.5), 0.35 * s, 0.7, rand(-3, 3), 4);
        }
      }
    }

    return {
      attach, set, setScale, place, moveTo, react, act, update, hold, drop,
      get entry() { return entry; },
      get person() { return p; },
      get mode() { return st.mode; },
      get pose() { return st.moving && st.mode !== 'signature' ? 'run' : st.pose; },
      get root() { return holder; },
      get scale() { return st.scale; },
      get moving() { return hasTarget; },
      get holding() { return st.heldT > 0; },
      get scene() { return scene; },
      set face(a) { st.face = a; },
      set faceDefault(a) { st.faceDefault = a; },
      set lean(v) { st.lean = v; },
      set visible(v) {
        holder.visible = v;
        if (!v) {
          ball.visible = false;
          st.ballT = -1;
        }
      },
      get visible() { return holder.visible; },
    };
  }

  CH.makeActor = makeActor;
})();

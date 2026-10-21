/* TT Chess: the game's own sounds, built on Kit.sound.tone / hiss (all synthesised, no files).
   CH.sfx.kit(name, ...args) plays a kit effect; the rest are ours. Every call is a silent no-op until Kit.sound.init()
   has run from the first tap. */
(function () {
  'use strict';
  const CH = (window.CH = window.CH || {});
  const S = Kit.sound;
  const tone = (o) => S.tone(o);
  const hiss = (o) => S.hiss(o);

  const sfx = {
    kit(name, ...args) {
      if (S[name]) S[name](...args);
    },
    // a piece is picked up: a little rising pop, deeper for the big ones
    pick(type = 1) {
      const f = 880 - type * 60;
      tone({ type: 'triangle', f, to: f * 1.5, dur: 0.09, vol: 0.12 });
    },
    // a piece lands on its square: a woody tok
    step(type = 1) {
      const f = 520 - type * 25;
      tone({ type: 'triangle', f, to: f * 0.6, dur: 0.1, vol: 0.15 });
      hiss({ filter: 'lowpass', f: 1600, to: 500, dur: 0.07, vol: 0.06 });
    },
    // the knight's leap: a cartoon boing
    leap() {
      tone({ type: 'sine', f: 220, to: 660, dur: 0.26, vol: 0.13 });
      tone({ type: 'triangle', f: 440, to: 1320, dur: 0.26, vol: 0.05 });
    },
    // a capture: BONK! a hollow knock and a springy wobble down
    bonk() {
      tone({ type: 'square', f: 220, to: 110, dur: 0.12, vol: 0.12, lp: 1400 });
      tone({ type: 'sine', f: 660, to: 330, dur: 0.18, vol: 0.18 });
      tone({ type: 'triangle', f: 520, to: 260, dur: 0.35, vol: 0.08, at: 0.08 });
      hiss({ filter: 'lowpass', f: 2500, to: 300, dur: 0.12, vol: 0.12 });
    },
    // the bonked piece lands on the bench: a little "boing-oing"
    bench() {
      tone({ type: 'sine', f: 500, to: 300, dur: 0.12, vol: 0.07 });
      tone({ type: 'sine', f: 420, to: 260, dur: 0.12, vol: 0.05, at: 0.13 });
    },
    // check: two bright warning notes
    check() {
      tone({ type: 'square', f: 988, dur: 0.1, vol: 0.06, lp: 2600 });
      tone({ type: 'square', f: 1319, dur: 0.16, vol: 0.06, lp: 2600, at: 0.12 });
    },
    // castling: a little fanfare for the king and rook swapping round
    castle() {
      [392, 523, 659].forEach((f, i) => tone({ type: 'triangle', f, at: i * 0.08, dur: 0.14, vol: 0.09 }));
    },
    // a pawn becomes a queen (or a rook, bishop or knight): a sparkly run up
    promote() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f, at: i * 0.06, dur: 0.2, vol: 0.09 }));
      hiss({ filter: 'highpass', f: 6000, at: 0.1, dur: 0.4, vol: 0.05 });
    },
    // the cursor moves
    tick() { tone({ type: 'square', f: 1200, dur: 0.025, vol: 0.025, lp: 3000 }); },
    // can't go there
    nope() {
      tone({ f: 220, dur: 0.08, vol: 0.08 });
      tone({ f: 180, dur: 0.1, vol: 0.08, at: 0.09 });
    },
    // Foxy is thinking: a curious hum
    think() { tone({ type: 'triangle', f: 247, to: 330, dur: 0.3, vol: 0.05 }); },
    // undo: a quick rewind
    undo() {
      [880, 740, 587, 440].forEach((f, i) => tone({ type: 'triangle', f, at: i * 0.05, dur: 0.07, vol: 0.08 }));
      hiss({ f: 3000, to: 700, dur: 0.22, vol: 0.04 });
    },
    // a nice move or a star in a lesson: a little rising chime
    nice() { [784, 988, 1319].forEach((f, i) => tone({ type: 'triangle', f, at: i * 0.06, dur: 0.18, vol: 0.1 })); },
    star() {
      [1047, 1319, 1568].forEach((f, i) => tone({ type: 'sine', f, at: i * 0.05, dur: 0.2, vol: 0.1 }));
    },
    // your brother's warning: two quick notes
    alert() {
      tone({ type: 'square', f: 988, dur: 0.08, vol: 0.06, lp: 2500 });
      tone({ type: 'square', f: 784, dur: 0.12, vol: 0.06, lp: 2500, at: 0.11 });
    },
    // checkmate for a kid
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', f, at: i * 0.11, dur: 0.16, vol: 0.05, lp: 3000 }));
      [523, 659, 784].forEach((f) => tone({ type: 'triangle', f: f * 2, at: 0.46, dur: 0.6, vol: 0.08 }));
      hiss({ filter: 'highpass', f: 6000, at: 0.46, dur: 0.5, vol: 0.06 });
      [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', f, at: 0.9 + i * 0.09, dur: 0.3, vol: 0.09 }));
    },
    // Foxy won: a soft wah-wah, never harsh
    lose() {
      [392, 370, 349, 311].forEach((f, i) => tone({ type: 'triangle', f, at: i * 0.22, dur: i === 3 ? 0.5 : 0.22, vol: 0.09 }));
    },
    draw() {
      tone({ type: 'triangle', f: 523, dur: 0.14, vol: 0.09 });
      tone({ type: 'triangle', f: 523, dur: 0.22, vol: 0.09, at: 0.16 });
    },
    // your brother pops in (and out)
    pop() {
      tone({ f: 300, to: 900, dur: 0.12, vol: 0.1 });
      hiss({ f: 2000, to: 6000, dur: 0.15, vol: 0.05 });
    },
    // the high five: a clap
    clap() {
      hiss({ filter: 'bandpass', f: 1500, q: 0.8, dur: 0.09, vol: 0.22 });
      hiss({ filter: 'highpass', f: 3000, dur: 0.05, vol: 0.1, at: 0.01 });
    },
  };

  CH.sfx = sfx;
})();

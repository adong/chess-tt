/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: window.CH_TITLE, // the name lives in js/title.js
  button: { top: 'var(--kh-top)' }, // index.html moves it (and the language button) to the bottom left on tall screens
  keys: [
    ['move round the board · pick up or put down', '← ↑ → ↓ · Enter or Space'],
    ['put the piece back', 'Esc'],
    ['a pawn at the end: queen · rook · bishop · knight', '1 2 3 4 or Q R B N'],
    ['undo your last move', 'U or Backspace'],
    ['call your brother (2 players: high five)', 'T'],
    ['turn the board round', 'F'],
    ['new game', 'R'],
    ['pause · sound', 'P or Esc · M'],
    ['menu: play · learn', 'Enter · L'],
    ['menu: Teddy or Tommy · 1 or 2 players', '← → · ↑ ↓'],
    ['menu: level (easy, normal, hard) · undo on or off', '1 2 3 · U'],
  ],
  note: 'Checkmate the other king to win. LEARN shows how every piece moves.',
  touch: "Tap a piece, then tap a glowing square. Tap your brother's face (bottom right) to call him.",
});
Kit.lang.setup({ button: { top: 'var(--kl-top)' } });
Kit.sound.setup({ button: { top: 'var(--ks-top)' } });

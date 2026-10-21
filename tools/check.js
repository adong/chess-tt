#!/usr/bin/env node
/* Run the headless checks from a terminal, with the same rules and CPU files the page loads (js/rules.js, js/check.js).
     node tools/check.js                       perft, every rule, then CPU games (4 per pairing)
     node tools/check.js 10                    the same with 10 games per pairing
     node tools/check.js --quick 0             perft (without depth 4) and the rules only, no CPU games
     node tools/check.js --sabotage noep       proves the check can fail: en passant switched off
       other sabotages: nodouble (no two-square pawn step), castlecheck (castle out of and through check),
       castlemoved (castling rights never lost), selfcheck (moves may leave your king in check), nomaterial,
       nofifty, norepeat (draw rules off), easyblind (EASY ignores free queens), blind (NORMAL plays at random)
     node tools/check.js match hard normal 6   a match between two levels (colours swap every game)
     --hard 700                                HARD's time per move in ms (150 in the checks; the game uses 700)
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, Math, Number, JSON, Object, Array, Map, Set, Error, Infinity, Int8Array, Uint8Array, Int16Array, Int32Array, Date, performance };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['js/rules.js', 'js/check.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
}
const CH = ctx.CH;
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args[0] === 'match') {
  const [, a, b, n] = args;
  const hard = { time: +(opt('hard') || 700) };
  console.log(JSON.stringify(CH.match(a, b, +(n || 4), +(opt('seed') || 1), { cfg: { hard } }), null, 1));
  process.exit(0);
}
const games = args.find((a, i) => /^\d+$/.test(a) && !/^--/.test(args[i - 1] || ''));
const out = CH.check({
  games: games !== undefined ? +games : 4,
  quick: args.includes('--quick'),
  sabotage: opt('sabotage'),
  seed: opt('seed') ? +opt('seed') : undefined,
  hardMs: opt('hard') ? +opt('hard') : undefined,
});
console.log(JSON.stringify(out, null, 1));
console.log(out.ok ? 'CHECK PASSED' : 'CHECK FAILED');
process.exitCode = out.ok ? 0 : 1;

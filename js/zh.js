/* 中文 for TT Chess (国际象棋): the words on the page, the toasts, the canvas words (the piece names over a picked-up
   piece, the word bursts) and the ? panel (Kit.lang, from kit/lang.js). Simple words: Tommy is 5. The pieces use
   their usual names (王 后 车 象 马 兵), with 将军, 将死, 逼和, 王车易位, 吃过路兵 and 升变. The kids' and Foxy's names and
   the game's own name stay English. */
(function () {
  'use strict';
  const L = Kit.lang;
  L.keep(['TT Chess', 'TT', 'Chess', 'TEDDY', 'TOMMY', 'FOXY', 'Teddy', 'Tommy', 'Foxy', 'Esc', 'Enter', 'Space', 'Backspace']);

  const PIECE = { PAWN: '兵', KNIGHT: '马', BISHOP: '象', ROOK: '车', QUEEN: '后', KING: '王' };
  L.add(PIECE); // the names over a picked-up piece, the promotion picker, the lesson cards
  L.add({ Queen: '后', Rook: '车', Bishop: '象', Knight: '马' });

  // what your brother says (after "TOMMY SAYS:")
  const P = 'PAWN|KNIGHT|BISHOP|ROOK|QUEEN|KING';
  const TIPS = {
    'GO TO THE STAR!': '走到星星那里！', 'BONK ON THE SLANT!': '斜着吃！', 'USE THE BIG FIRST STEP!': '第一步走两格！',
    'KEEP GOING!': '继续走！', 'CORNER THE KNIGHT!': '把马逼到角落！',
  };
  function tip(t) {
    if (TIPS[t]) return TIPS[t];
    let m;
    if ((m = new RegExp(`^CHECKMATE! MOVE THE (${P})!$`).exec(t))) return `将死！快走${PIECE[m[1]]}！`;
    if ((m = new RegExp(`^SAVE YOUR KING! MOVE THE (${P})!$`).exec(t))) return `救王！快走${PIECE[m[1]]}！`;
    if ((m = new RegExp(`^YOUR (${P}) IS IN DANGER!$`).exec(t))) return `你的${PIECE[m[1]]}有危险！`;
    if ((m = new RegExp(`^BONK THE (${P})!$`).exec(t))) return `吃掉${PIECE[m[1]]}！`;
    if ((m = new RegExp(`^MOVE THE (${P})!$`).exec(t))) return `快走${PIECE[m[1]]}！`;
    return null;
  }

  L.add({
    // the menu
    PLAY: '开始玩', 'Play': '开始玩', 'Play (Enter)': '开始玩 (Enter)', LEARN: '学一学', 'Learn': '学一学', 'Learn (L)': '学一学 (L)',
    '1 PLAYER': '1 人玩', '2 PLAYERS': '2 人玩', 'Players': '几个人玩', 'Who are you?': '你是谁？', 'Level': '难度',
    EASY: '简单', NORMAL: '普通', HARD: '困难',
    'UNDO ON': '可以悔棋', 'UNDO OFF': '不能悔棋', 'Undo button': '悔棋按钮',
    // while playing
    'Pause': '暂停', 'Pause (P)': '暂停 (P)', 'Sound (M)': '声音 (M)', 'Sound on or off': '声音 开 / 关',
    'Undo': '悔棋', 'Undo (U)': '悔棋 (U)', 'Turn the board round': '把棋盘转过来', 'Turn the board round (F)': '把棋盘转过来 (F)',
    'Call your brother': '叫兄弟来帮忙', 'High five!': '击掌！', 'High five! (T)': '击掌！(T)', 'HIGH FIVE! 🙌': '击掌！🙌',
    'YOUR TURN!': '轮到你啦！', 'CHECK!': '将军！', 'DRAW!': '平局！',
    "THAT'S NOT YOURS!": '那不是你的棋子！', 'SAVE YOUR KING FIRST!': '先救你的王！', "THIS ONE CAN'T MOVE!": '这个走不了！',
    'THAT WOULD PUT YOUR KING IN DANGER!': '这样走，你的王会有危险！',
    // promotion
    'WHAT WILL IT BE?': '升变：变成什么？',
    // the game is over, pause
    'CHECKMATE!': '将死！', 'STALEMATE: NO MOVES, BUT NOT IN CHECK!': '逼和：没棋可走，但没被将军！',
    'THE SAME BOARD 3 TIMES!': '同样的棋局出现了 3 次！', '50 MOVES WITH NO BONK AND NO PAWN MOVE!': '50 回合没吃子、也没动兵！',
    'NOT ENOUGH PIECES TO CHECKMATE!': '剩下的棋子不够将死对方！',
    'Home': '主页', 'Home (Esc)': '主页 (Esc)', 'Play again': '再玩一次', 'PLAY AGAIN': '再玩一次', 'Keep playing': '继续玩', 'Start a new game': '重新开始',
    // canvas word bursts over the board (js/stage.js, js/game.js and js/learn.js, through Kit.lang.t)
    'BONK!': '咚！', 'CASTLE!': '王车易位！', 'TA-DA!': '升变！', 'YOU WIN!': '你赢啦！',
    // LEARN
    'All the lessons': '全部课程', 'All the lessons (Esc)': '全部课程 (Esc)', 'Start again': '重新开始', 'Start again (R)': '重新开始 (R)',
    'Go!': '开始！', 'Next lesson': '下一课', 'GREAT JOB!': '太棒啦！',
    'ROOK TO THE STAR': '车走到星星', 'PAWN RACE': '兵赛跑', 'CATCH THE KNIGHT': '抓住马',
    'PAWNS WALK FORWARD. THE FIRST STEP CAN BE TWO!': '兵向前走。第一步可以走两格！',
    'PAWNS BONK ON THE SLANT!': '兵斜着吃子！',
    'THE ROOK GOES STRAIGHT. ZOOM!': '车走直线，嗖！',
    'THE BISHOP GOES ON THE SLANT.': '象斜着走。',
    'IT STAYS ON ITS OWN COLOUR!': '它一直走在自己颜色的格子上！',
    'THE KNIGHT HOPS IN AN L. IT CAN JUMP!': '马走“日”字，还能跳过别的棋子！',
    'THE QUEEN GOES ANY WAY. SUPER STRONG!': '后哪个方向都能走，超级厉害！',
    'THE KING TAKES ONE STEP AT A TIME.': '王一次只走一格。',
    'KEEP HIM SAFE!': '要保护好王！',
    'GET THE ROOK TO THE STAR! 3 MOVES IS 3 STARS.': '把车走到星星那里！3 步就得 3 颗星。',
    'PAWN RACE! GET TO THE END FIRST!': '兵赛跑！先走到底的赢！',
    'CATCH THE KNIGHT! IT HOPS AWAY.': '抓住马！它会跳着逃跑。',
    'TRAP THE KING IN ONE MOVE!': '走一步，将死对方的王！',
    "OOPS! LET'S TRY AGAIN!": '哎呀！再试一次！', 'YES! CHECKMATE!': '对啦！将死！',
    'OOPS, STALEMATE! THAT IS A DRAW. TRY AGAIN!': '哎呀，逼和了！这是平局。再试一次！',
    'NOT CHECKMATE YET! TRY AGAIN!': '还没将死！再试一次！',
    'FOXY WON THE RACE! TRY THE BIG FIRST STEP!': 'FOXY 赢了赛跑！第一步试试走两格！',
    // the ? panel (js/keys.js)
    'move round the board · pick up or put down': '在棋盘上移动 · 拿起或放下',
    'put the piece back': '把棋子放回去',
    'a pawn at the end: queen · rook · bishop · knight': '兵走到底（升变）：后 · 车 · 象 · 马',
    'undo your last move': '悔一步棋',
    'call your brother (2 players: high five)': '叫兄弟来帮忙（2 人玩：击掌）',
    'turn the board round': '把棋盘转过来',
    'new game': '新的一局',
    'menu: play · learn': '菜单：开始玩 · 学一学',
    'menu: Teddy or Tommy · 1 or 2 players': '菜单：Teddy 还是 Tommy · 1 人或 2 人',
    'menu: level (easy, normal, hard) · undo on or off': '菜单：难度（简单、普通、困难）· 悔棋 开 / 关',
    'Checkmate the other king to win. LEARN shows how every piece moves.': '将死对方的王就赢啦。“学一学”教你每个棋子怎么走。',
    "Tap a piece, then tap a glowing square. Tap your brother's face (bottom right) to call him.":
      '先点一个棋子，再点发光的格子。点右下角兄弟的头像，叫他来帮忙。',
  });

  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  L.rule(/^Call (\S+) \(T\)$/, '叫 $1 (T)');
  L.rule(/^Call (\S+)$/, '叫 $1');
  L.rule(/^(\S+)'S HERE!$/, '$1 来啦！');
  L.rule(/^(\S+) SAYS: (.+)$/, (m, who, t) => {
    const z = tip(t);
    return z ? `${who} 说：${z}` : m;
  });
  L.rule(/^(\S+) IS THINKING…$/, '$1 在想…');
  L.rule(/^(\S+)'S TURN!$/, '轮到 $1！');
  L.rule(/^(\S+) WINS!$/, '$1 赢啦！');
  L.rule(/^MOVES: (\d+)$/, '步数：$1');
  L.rule(/^(\S+) (ICE CREAM|WATER|JUICE BOX|COOKIE|WATERMELON|BANANA) FROM (\S+)!$/, (m, emoji, item, who) => `${emoji} ${who} 给你${TREAT[item]}！`);
})();

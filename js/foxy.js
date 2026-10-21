/* TT Chess: Foxy 🦊, the CPU friend. The kit has no fox yet, so this game adds one: a roster entry built on the kit's
   bear head (orange fur, a white muzzle), plus pointy ears with dark tips, a white chin and a bushy tail with a white
   tip. Kit.people.build is wrapped so anything with look.fox gets them, the menu portraits too. Move this into the
   kit if a second game wants Foxy. */
(function () {
  'use strict';
  const T = THREE;
  if (!Kit.roster.get('foxy')) {
    Kit.roster.list.push({
      id: 'foxy',
      name: 'FOXY',
      tag: '#ff8a1f',
      look: {
        head: 'bear', fox: true, skin: '#f07a2a', muzzle: '#fff4e6',
        shirt: 'hoodie', top: '#3fbf8a', print: 'star', bottom: '#2b3a63', shorts: true, shoes: '#ffd400',
      },
    });
  }
  const build = Kit.people.build;
  Kit.people.build = function (look) {
    const p = build(look);
    if (!look || !look.fox) return p;
    const std = Kit.gfx.std;
    const fur = std(look.skin, { roughness: 0.7 }), white = std('#fff4e6', { roughness: 0.7 }), dark = std('#2a1a12', { roughness: 0.7 });
    // hide the bear's round ears (the two boxes sitting on top of the head) and give him pointy ones
    p.head.children.forEach((m) => {
      if (m.position.y > 0.25) m.visible = false;
    });
    for (const sx of [-1, 1]) {
      const ear = new T.Mesh(new T.ConeGeometry(0.12, 0.3, 4), fur);
      ear.position.set(sx * 0.18, 0.36, 0.02);
      ear.rotation.set(0, Math.PI / 4, sx * -0.18);
      p.head.add(ear);
      const tip = new T.Mesh(new T.ConeGeometry(0.06, 0.12, 4), dark);
      tip.position.set(sx * 0.2, 0.47, 0.02);
      tip.rotation.set(0, Math.PI / 4, sx * -0.18);
      p.head.add(tip);
    }
    const chin = new T.Mesh(new T.BoxGeometry(0.36, 0.12, 0.06), white);
    chin.position.set(0, -0.2, -0.23);
    p.head.add(chin);
    // the tail: three puffy segments curling up behind, the last one white
    const tail = new T.Group();
    tail.position.set(0, 0.08, 0.22);
    p.hips.add(tail);
    [[0, 0, 0.12, 0.13, fur], [0, 0.12, 0.3, 0.15, fur], [0, 0.3, 0.42, 0.12, white]].forEach(([x, y, z, r, m]) => {
      const s = new T.Mesh(new T.SphereGeometry(r, 10, 8), m);
      s.position.set(x, y, z);
      s.scale.set(1, 1, 1.4);
      tail.add(s);
    });
    tail.rotation.x = -0.3;
    p.tail = tail;
    return p;
  };
})();

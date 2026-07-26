// Map-gimmick tests (M5) — run with:  node tests/gimmicks.test.js
// Exercises the generic tile-effect hook (hazard / switch / treasure), gate
// toggling, walkable props, AI hazard avoidance, and the Dungeon data.
import { Room } from '../../js/room.js';
import { Unit } from '../../js/units.js';
import { Battle } from '../../js/battle.js';
import { runEnemyTurn } from '../../js/ai.js';
import { hasLineOfSight } from '../../js/classes.js';
import { findPath } from '../../js/pathfinder.js';
import { buildDungeon } from '../../js/dungeon.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}
function room(rows, opts = {}) {
  return new Room({ id: 't', name: 't', heightmap: rows, spawn: { x: 0, y: 0 }, ...opts });
}
function unit(r, x, y, team, classId, extra = {}) {
  return new Unit(r, null, x, y, { team, classId, ...extra });
}

// ---- room: walkable props + gates -------------------------------------------
console.log('room props/gates');
{
  const r = room(['000', '000'], {
    props: [
      { id: 'a', x: 0, y: 0 }, // solid furni
      { id: 'b', x: 1, y: 0, walk: true }, // trap/plate art — walkable
      { id: 'g', x: 2, y: 0, gate: true }, // closed gate
    ],
  });
  check('solid prop blocks its tile', r.isBlocked(0, 0));
  check('walk:true prop does NOT block', !r.isBlocked(1, 0));
  check('gate blocks while closed', r.isBlocked(2, 0));
  check('toggleGate opens (returns true) and unblocks', r.toggleGate(2, 0) === true && !r.isBlocked(2, 0));
  check('gate prop is flagged open', r.props.find((p) => p.id === 'g').open === true);
  check('toggleGate closes again', r.toggleGate(2, 0) === false && r.isBlocked(2, 0));
  check('toggleGate on a non-gate tile returns null', r.toggleGate(0, 0) === null);
}
{
  // multi-tile gate: a 1x2 portcullis blocks (and opens) its whole footprint
  const r = room(['00000', '00000'], {
    props: [{ id: 'g', x: 1, y: 0, gate: true, tiles: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }],
  });
  check('footprint blocks both tiles', r.isBlocked(1, 0) && r.isBlocked(2, 0));
  check('toggling via EITHER tile opens the whole gate', r.toggleGate(2, 0) === true && !r.isBlocked(1, 0) && !r.isBlocked(2, 0));
}
{
  // open gate stops blocking line of sight
  const r = room(['00000'], { props: [{ id: 'g', x: 2, y: 0, gate: true }] });
  check('closed gate blocks LoS', !hasLineOfSight(r, 0, 0, 4, 0, 0, 0));
  r.toggleGate(2, 0);
  check('open gate lets shots through', hasLineOfSight(r, 0, 0, 4, 0, 0, 0));
}

// ---- hazards -----------------------------------------------------------------
console.log('hazards');
{
  const r = room(['00000'], { effects: [{ x: 2, y: 0, kind: 'hazard', dmg: 5, status: { rooted: 1 }, label: 'spikes' }] });
  const p = unit(r, 0, 0, 'player', 'fighter');
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  const b = new Battle(r, [p, e], {});
  const hp0 = p.stats.hp;
  p.x = 2; p.y = 0;
  b.unitSettled(p);
  check('hazard damages on settle', p.stats.hp === hp0 - 5);
  check('hazard applies status (rooted)', p.rooted === 1);
  b.unitSettled(p);
  check('persistent hazard re-triggers', p.stats.hp === hp0 - 10);
}
{
  const r = room(['00000'], { effects: [{ x: 2, y: 0, kind: 'hazard', dmg: 7, once: true }] });
  const p = unit(r, 0, 0, 'player', 'fighter');
  const p2 = unit(r, 1, 0, 'player', 'fighter');
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  const b = new Battle(r, [p, p2, e], {});
  p.x = 2; p.y = 0;
  b.unitSettled(p);
  const hp2 = p2.stats.hp;
  p.x = 0; p2.x = 2;
  b.unitSettled(p2);
  check('once-hazard is spent after the first spring', p2.stats.hp === hp2);
}
{
  // a lethal trap ends the battle (universal wipe check runs)
  const r = room(['00000'], { effects: [{ x: 2, y: 0, kind: 'hazard', dmg: 999 }] });
  const p = unit(r, 0, 0, 'player', 'fighter');
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  const b = new Battle(r, [p, e], {});
  p.x = 2; p.y = 0;
  b.unitSettled(p);
  check('lethal hazard downs the unit and loses the battle', !p.alive && b.phase === 'lost');
}
{
  // endTurn hazards bite when the phase closes, not on settle
  const r = room(['00000'], { effects: [{ x: 2, y: 0, kind: 'hazard', dmg: 4, when: 'endTurn', label: 'fire' }] });
  const p = unit(r, 2, 0, 'player', 'fighter');
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  const b = new Battle(r, [p, e], {});
  const hp0 = p.stats.hp;
  b.unitSettled(p);
  check('endTurn hazard does nothing on settle', p.stats.hp === hp0);
  b.endPlayerPhase();
  check('endTurn hazard burns as the player phase closes', p.stats.hp === hp0 - 4);
}
{
  // enemies standing in fire burn when their phase closes
  const r = room(['00000', '00000', '00000']);
  r.effects.set('4,0', { x: 4, y: 0, kind: 'hazard', dmg: 4, when: 'endTurn' });
  const p = unit(r, 0, 2, 'player', 'fighter');
  const e = unit(r, 4, 0, 'enemy', 'ranger');
  e.rooted = 1; // pinned in the fire for this phase
  const b = new Battle(r, [p, e], {});
  const ehp = e.stats.hp;
  b.endPlayerPhase();
  let now = 0;
  for (let i = 0; i < 4000 && b.phase === 'enemy'; i++) {
    now += 50;
    b.units.forEach((u) => u.update(now));
    b.update(now);
  }
  check('enemy endTurn hazard applies at enemy-phase close', e.stats.hp < ehp);
}

// ---- switches ----------------------------------------------------------------
console.log('switches');
{
  const r = room(['00000'], {
    props: [{ id: 'g', x: 3, y: 0, gate: true }],
    effects: [{ x: 1, y: 0, kind: 'switch', toggles: [{ x: 3, y: 0 }], once: true, label: 'the winch' }],
  });
  const p = unit(r, 0, 0, 'player', 'fighter');
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  const b = new Battle(r, [p, e], {});
  check('gate starts closed', r.isBlocked(3, 0));
  p.x = 1; p.y = 0;
  b.unitSettled(p);
  check('player on the plate opens the gate', !r.isBlocked(3, 0));
  check('once-switch is spent', r.effectAt(1, 0).spent === true);
}
{
  // enemies do not trip switches
  const r = room(['00000'], {
    props: [{ id: 'g', x: 3, y: 0, gate: true }],
    effects: [{ x: 1, y: 0, kind: 'switch', toggles: [{ x: 3, y: 0 }] }],
  });
  const p = unit(r, 4, 0, 'player', 'fighter');
  const e = unit(r, 0, 0, 'enemy', 'fighter');
  const b = new Battle(r, [p, e], {});
  e.x = 1; e.y = 0;
  b.unitSettled(e);
  check('enemy on the plate does NOT throw the switch', r.isBlocked(3, 0));
}

// ---- treasure ----------------------------------------------------------------
console.log('treasure');
{
  const r = room(['00000'], { effects: [{ x: 2, y: 0, kind: 'treasure', gold: 20, label: 'a cache' }] });
  const p = unit(r, 0, 0, 'player', 'fighter');
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  let got = null;
  const b = new Battle(r, [p, e], { onPickup: (spec, u) => (got = { spec, u }) });
  p.x = 2; p.y = 0;
  b.unitSettled(p);
  check('treasure fires onPickup with the spec', got && got.spec.gold === 20 && got.u === p);
  check('treasure is spent and recorded', r.effectAt(2, 0).spent === true && b.pickups.length === 1);
  got = null;
  b.unitSettled(p);
  check('spent treasure cannot be collected twice', got === null);
}
{
  const r = room(['00000'], { effects: [{ x: 2, y: 0, kind: 'treasure', gold: 20 }] });
  const p = unit(r, 0, 0, 'player', 'fighter');
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  let got = false;
  const b = new Battle(r, [p, e], { onPickup: () => (got = true) });
  e.x = 2; e.y = 0;
  b.unitSettled(e);
  check('enemies cannot loot treasure', !got && !r.effectAt(2, 0).spent);
}

// ---- AI hazard avoidance ------------------------------------------------------
console.log('AI vs hazards');
{
  // two equally-good attacking stops; one is trapped — AI must take the clean one
  const r = room(['00000', '00000'], { effects: [{ x: 3, y: 0, kind: 'hazard', dmg: 9 }] });
  const target = unit(r, 4, 0, 'player', 'mage');
  const e = unit(r, 0, 0, 'enemy', 'fighter'); // move 4: can stop at (3,0) trapped or (3,1)/(4,1) clean
  const b = new Battle(r, [target, e], {});
  const plan = runEnemyTurn(b, e);
  const dest = plan.path[plan.path.length - 1];
  check('AI attacks from a clean tile instead of the trapped one', plan.target === target && !(dest.x === 3 && dest.y === 0));
}

// ---- enemy settle integration (manual clock) ----------------------------------
console.log('enemy settle');
{
  // the only attacking stop is trapped: the enemy takes it and springs the trap
  const r = room(['xxxxx', '00000', 'xxxxx'], {
    effects: [{ x: 3, y: 1, kind: 'hazard', dmg: 6 }],
  });
  const p = unit(r, 4, 1, 'player', 'fighter');
  const e = unit(r, 0, 1, 'enemy', 'barbarian'); // corridor forces (3,1)
  const b = new Battle(r, [p, e], {});
  const ehp = e.stats.hp;
  b.endPlayerPhase();
  let now = 0;
  for (let i = 0; i < 4000 && b.phase === 'enemy'; i++) {
    now += 50;
    b.units.forEach((u) => u.update(now));
    b.update(now);
  }
  check('enemy that settles on a trap takes the damage', e.stats.hp < ehp);
}

// ---- Dungeon data integration ------------------------------------------------
console.log('dungeon gimmick data');
{
  const d = buildDungeon();
  const rampart = d.nodes[4].makeRoom();
  const spawn = d.nodes[4].spawns[0];
  const goal = d.nodes[4].objective.tile;
  check('rampart gate starts closed (no path to the goal)', findPath(rampart, spawn.x, spawn.y, goal.x, goal.y) === null);
  const sw = [...rampart.effects.values()].find((e) => e.kind === 'switch');
  check('rampart has a switch wired to the gate', !!sw && sw.toggles.length === 1);
  const gate = rampart.props.find((p) => p.gate);
  check('the portcullis spans the whole two-tile bridge', gate.tiles.length === 2 && gate.tiles.every((t) => rampart.isBlocked(t.x, t.y)));
  rampart.toggleGate(sw.toggles[0].x, sw.toggles[0].y);
  check('the switch opens the full footprint', gate.tiles.every((t) => !rampart.isBlocked(t.x, t.y)));
  const path = findPath(rampart, spawn.x, spawn.y, goal.x, goal.y);
  check('open gate unlocks a path to the goal', Array.isArray(path) && path.length > 0);
  check('the path crosses the bridge', path.some((s) => gate.tiles.some((t) => t.x === s.x && t.y === s.y)));
  check('winch plate sits on a flat tile (not an auto-stair)', (() => {
    // a tile renders as stairs when a cardinal neighbour is exactly 1 lower
    const swTile = [...rampart.effects.values()].find((e) => e.kind === 'switch');
    const z = rampart.heightAt(swTile.x, swTile.y);
    return [[1, 0], [0, 1], [-1, 0], [0, -1]].every(([dx, dy]) => {
      const t = rampart.tile(swTile.x + dx, swTile.y + dy);
      return !t || z - t.z !== 1;
    });
  })());

  const ante = d.nodes[0].makeRoom();
  const t = [...ante.effects.values()].find((e) => e.kind === 'treasure');
  check('antechamber has a walkable treasure tile', !!t && !ante.isBlocked(t.x, t.y));

  const nave = d.nodes[2].makeRoom();
  const hazards = [...nave.effects.values()].filter((e) => e.kind === 'hazard');
  check('nave hides spike traps + a bonfire', hazards.length === 3 && hazards.some((h) => h.when === 'endTurn'));
  check('nave trap tiles stay walkable', hazards.every((h) => !nave.isBlocked(h.x, h.y)));

  const throne = d.nodes[5].makeRoom();
  const rocks = [...throne.effects.values()].filter((e) => e.kind === 'hazard' && e.once);
  check('throne flanks the stairs with once-traps', rocks.length === 2);
}

// ---- room kits ----------------------------------------------------------------
console.log('room kits');
{
  const fs = await import('node:fs');
  const d = buildDungeon();
  const rooms = d.nodes.filter((n) => n.type === 'battle').map((n) => n.makeRoom());
  check('every battle room carries a visual kit', rooms.every((r) => r.kit && r.kit.floor && r.kit.palette));
  check('kit floor art exists in the props library', rooms.every((r) =>
    fs.existsSync(new URL(`../../assets/props/${r.kit.floor}/data.json`, import.meta.url))));
  const rampart = rooms.find((r) => r.id === 'rampart');
  check('rampart disables procedural walls (it builds its own from furni)', rampart.kit.walls === false);
  check('the other rooms use procedural boundary walls', rooms.filter((r) => r.id !== 'rampart').every((r) => r.kit.walls && r.kit.walls.height > 0));
}

// ---- portcullis open-state extraction ------------------------------------------
console.log('gate art');
{
  const fs = await import('node:fs');
  const data = JSON.parse(fs.readFileSync(new URL('../../assets/props/hween_c17_portcullis/data.json', import.meta.url), 'utf8'));
  check('portcullis ships closed + open states', Array.isArray(data.states) && data.states.includes(1));
  // 8 sequence steps x frameRepeat 2 = the authentic 16-tick (2s) rise
  check('portcullis ships the 16-tick rise transition', data.transition === 16);
  for (const d of data.dirs) {
    check(`dir ${d}: open pose + all transition frames extracted`,
      !!data.frames[`s1_d${d}`] && Array.from({ length: data.transition }, (_, t) => data.frames[`t${t}_d${d}`]).every(Boolean));
  }
  check('portcullis is a 1x2 multi-tile item', data.xdim * data.ydim === 2);
}

// ---- ambient furni animation (flames) -------------------------------------------
console.log('ambient animation');
{
  const fs = await import('node:fs');
  const read = (id) => JSON.parse(fs.readFileSync(new URL(`../../assets/props/${id}/data.json`, import.meta.url), 'utf8'));
  const torch = read('vikings_torch');
  check('torch ships its burning loop (12 ticks, 6 unique frames)',
    torch.anim && torch.anim.ticks === 12 && new Set(torch.anim.map).size === 6);
  check('torch loop frames all extracted', [...new Set(torch.anim.map)].every((u) => torch.frames[`a${u}_d${torch.dirs[0]}`]));
  const fire = read('hween_c17_bonfire');
  check('bonfire ships its flame loop (12 ticks, frameRepeat 3 deduped to 4 frames)',
    fire.anim && fire.anim.ticks === 12 && new Set(fire.anim.map).size === 4);
  check('bonfire loop frames extracted for both dirs', fire.dirs.every((d) => fire.frames[`a0_d${d}`]));
  check('the portcullis has NO ambient loop (its state 1 is the open pose)', !read('hween_c17_portcullis').anim);
}

console.log(failed ? `\n${failed} test(s) FAILED` : '\nAll M5 gimmick tests passed');
process.exit(failed ? 1 : 0);

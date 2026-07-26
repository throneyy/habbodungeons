// Objective-engine tests (M5) — run with:  node tests/objectives.test.js
// Exercises battle.js win/lose evaluation for every objective type, plus the
// universal party-wipe loss and the turn-limit deadline. Pure engine, no DOM.
import { Room } from '../js/room.js';
import { Unit } from '../js/units.js';
import { Battle, normalizeObjective } from '../js/battle.js';
import { runEnemyTurn } from '../js/ai.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}
function room(rows) {
  return new Room({ id: 't', name: 't', heightmap: rows, spawn: { x: 0, y: 0 } });
}
function unit(r, x, y, team, classId, extra = {}) {
  return new Unit(r, null, x, y, { team, classId, ...extra });
}
function battle(r, units, objective) {
  return new Battle(r, units, { objective });
}
function slay(u) {
  u.takeDamage(u.stats.hp + u.shield + 999); // drop it outright
}

// ---- normalize -------------------------------------------------------------
console.log('normalize');
check('no objective -> eliminate', normalizeObjective(undefined).type === 'eliminate');
check('objective without type -> eliminate', normalizeObjective({ turns: 5 }).type === 'eliminate');
check('defaults filled (turns, who)', (() => {
  const o = normalizeObjective({ type: 'survive' });
  return o.turns === 3 && o.who === 'any';
})());
check('explicit fields preserved', normalizeObjective({ type: 'survive', turns: 5 }).turns === 5);

// ---- eliminate (default) + universal wipe ----------------------------------
console.log('eliminate');
{
  const r = room(['00000', '00000', '00000']);
  const p = unit(r, 0, 0, 'player', 'fighter');
  const e = unit(r, 2, 0, 'enemy', 'fighter');
  const b = battle(r, [p, e]); // no objective -> eliminate
  check('ongoing while a foe lives', b.phase === 'player');
  slay(e);
  b.checkEnd();
  check('eliminate wins when the room is cleared', b.phase === 'won');
}
{
  const r = room(['000']);
  const p = unit(r, 0, 0, 'player', 'fighter');
  const e = unit(r, 2, 0, 'enemy', 'fighter');
  const b = battle(r, [p, e]);
  slay(p);
  b.checkEnd();
  check('party wipe always loses', b.phase === 'lost');
}

// ---- slay ------------------------------------------------------------------
console.log('slay');
{
  const r = room(['00000']);
  const p = unit(r, 0, 0, 'player', 'fighter');
  const boss = unit(r, 2, 0, 'enemy', 'fighter', { tag: 'boss', name: 'Boss' });
  const minion = unit(r, 4, 0, 'enemy', 'rogue');
  const b = battle(r, [p, boss, minion], { type: 'slay', tag: 'boss', label: 'Boss' });
  slay(minion);
  b.checkEnd();
  check('slay is not satisfied when a minion dies', b.phase === 'player');
  slay(boss);
  b.checkEnd();
  check('slay wins when the tagged foe dies', b.phase === 'won');
}

// ---- survive ---------------------------------------------------------------
console.log('survive');
{
  const r = room(['00000', '00000', '00000']);
  const p = unit(r, 0, 0, 'player', 'fighter');
  const e = unit(r, 2, 0, 'enemy', 'fighter');
  const b = battle(r, [p, e], { type: 'survive', turns: 2 });
  check('survive ongoing at turn 1', b.phase === 'player');
  b.turn = 3;
  b.checkEnd();
  check('survive wins once the turns elapse', b.phase === 'won');
}
{
  const r = room(['00000']);
  const p = unit(r, 0, 0, 'player', 'fighter');
  const e = unit(r, 2, 0, 'enemy', 'fighter');
  const b = battle(r, [p, e], { type: 'survive', turns: 5 });
  slay(e);
  b.checkEnd();
  check('survive wins early if the room is cleared', b.phase === 'won');
}
{
  // integration: the turn-boundary hook in startPlayerPhase fires the win
  const r = room(['00000', '00000', '00000']);
  const p = unit(r, 0, 2, 'player', 'fighter');
  const e = unit(r, 4, 0, 'enemy', 'ranger');
  const b = battle(r, [p, e], { type: 'survive', turns: 1 });
  b.endPlayerPhase();
  let now = 0;
  for (let i = 0; i < 4000 && b.phase === 'enemy'; i++) {
    now += 50;
    b.units.forEach((u) => u.update(now));
    b.update(now);
  }
  check('survive resolves at the turn boundary (win entering turn 2)', b.phase === 'won' && b.turn === 2);
}

// ---- reach -----------------------------------------------------------------
console.log('reach');
{
  const r = room(['00000', '00000', '00000']);
  const leader = unit(r, 0, 2, 'player', 'fighter', { useSprites: true });
  const ally = unit(r, 1, 2, 'player', 'rogue');
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  const b = battle(r, [leader, ally, e], { type: 'reach', tile: { x: 0, y: 0 }, who: 'leader' });
  ally.x = 0;
  ally.y = 0; // a non-leader on the goal must NOT win
  b.checkEnd();
  check('reach(leader) ignores a non-leader on the tile', b.phase === 'player');
  ally.x = 1;
  ally.y = 2;
  leader.x = 0;
  leader.y = 0;
  b.checkEnd();
  check('reach(leader) wins when the leader stands on the tile', b.phase === 'won');
}
{
  const r = room(['00000', '00000']);
  const a = unit(r, 0, 1, 'player', 'rogue');
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  const b = battle(r, [a, e], { type: 'reach', tile: { x: 2, y: 0 }, who: 'any' });
  a.x = 2;
  a.y = 0;
  b.checkEnd();
  check('reach(any) wins when any unit stands on the tile', b.phase === 'won');
}
{
  // fallback: who='leader' but no leader present -> treated as any
  const r = room(['000']);
  const a = unit(r, 0, 0, 'player', 'rogue');
  const e = unit(r, 2, 0, 'enemy', 'fighter');
  const b = battle(r, [a, e], { type: 'reach', tile: { x: 1, y: 0 }, who: 'leader' });
  a.x = 1;
  a.y = 0;
  b.checkEnd();
  check('reach(leader) falls back to any when no leader exists', b.phase === 'won');
}
{
  const r = room(['000']);
  const a = unit(r, 0, 0, 'player', 'rogue');
  const e = unit(r, 2, 0, 'enemy', 'fighter');
  const b = battle(r, [a, e], { type: 'reach', tile: { x: 9, y: 9 }, who: 'any', turnLimit: 2 });
  b.turn = 3;
  b.checkEnd();
  check('reach fails when the turn limit is exceeded', b.phase === 'lost');
}

// ---- defend ----------------------------------------------------------------
console.log('defend');
{
  const r = room(['00000', '00000', '00000']);
  const p = unit(r, 0, 2, 'player', 'fighter');
  const e = unit(r, 2, 2, 'enemy', 'fighter');
  const b = battle(r, [p, e], { type: 'defend', tile: { x: 1, y: 0 }, turns: 3 });
  check('defend ongoing before a breach', b.phase === 'player');
  e.x = 1;
  e.y = 0; // enemy steps onto the defended tile
  b.checkEnd();
  check('defend loses when an enemy breaches the tile', b.phase === 'lost');
}
{
  const r = room(['00000']);
  const p = unit(r, 0, 0, 'player', 'fighter');
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  const b = battle(r, [p, e], { type: 'defend', tile: { x: 2, y: 0 }, turns: 2 });
  b.turn = 3;
  b.checkEnd();
  check('defend wins after holding the required turns', b.phase === 'won');
}
{
  const r = room(['00000']);
  const p = unit(r, 0, 0, 'player', 'fighter');
  const vip = unit(r, 1, 0, 'player', 'cleric', { tag: 'vip' });
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  const b = battle(r, [p, vip, e], { type: 'defend', tag: 'vip', turns: 3 });
  slay(vip);
  b.checkEnd();
  check('defend(unit) loses when the ward dies', b.phase === 'lost');
}

// ---- escort ----------------------------------------------------------------
console.log('escort');
{
  const r = room(['00000', '00000']);
  const p = unit(r, 0, 1, 'player', 'fighter');
  const vip = unit(r, 1, 1, 'player', 'cleric', { tag: 'vip' });
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  const b = battle(r, [p, vip, e], { type: 'escort', tag: 'vip', tile: { x: 4, y: 1 }, label: 'the ward' });
  check('escort ongoing before arrival', b.phase === 'player');
  vip.x = 4;
  vip.y = 1;
  b.checkEnd();
  check('escort wins when the ward reaches the tile', b.phase === 'won');
}
{
  const r = room(['00000']);
  const p = unit(r, 0, 0, 'player', 'fighter');
  const vip = unit(r, 1, 0, 'player', 'cleric', { tag: 'vip' });
  const e = unit(r, 4, 0, 'enemy', 'fighter');
  const b = battle(r, [p, vip, e], { type: 'escort', tag: 'vip', tile: { x: 4, y: 0 } });
  slay(vip);
  b.checkEnd();
  check('escort loses when the ward dies', b.phase === 'lost');
}

// ---- objective text --------------------------------------------------------
console.log('objective text');
{
  const r = room(['000']);
  const b = new Battle(r, [unit(r, 0, 0, 'player', 'fighter'), unit(r, 2, 0, 'enemy', 'fighter')], {});
  check('eliminate text', b.objectiveText() === 'Defeat all enemies');
}
{
  const r = room(['000']);
  const b = new Battle(r, [unit(r, 0, 0, 'player', 'fighter'), unit(r, 2, 0, 'enemy', 'fighter')], {
    objective: { type: 'survive', turns: 2 },
  });
  check('survive text shows remaining turns', /Survive 2 more turns/.test(b.objectiveText()));
}

// ---- objective-aware AI ----------------------------------------------------
console.log('objective-aware AI');
{
  // escort: focus the ward even when a softer non-ward foe is equally in range
  const r = room(['00000']);
  const e = unit(r, 2, 0, 'enemy', 'fighter'); // range 1: (1,0) and (3,0) adjacent
  const soft = unit(r, 3, 0, 'player', 'mage'); // low HP, not the ward
  const vip = unit(r, 1, 0, 'player', 'fighter', { tag: 'vip' }); // higher HP, the ward
  const b = battle(r, [e, soft, vip], { type: 'escort', tag: 'vip', tile: { x: 9, y: 0 } });
  check('escort AI strikes the ward over a softer target', runEnemyTurn(b, e).target === vip);
}
{
  // escort: a plain eliminate battle keeps the weakest-target baseline
  const r = room(['00000']);
  const e = unit(r, 2, 0, 'enemy', 'fighter');
  const soft = unit(r, 3, 0, 'player', 'mage'); // lowest HP
  const tough = unit(r, 1, 0, 'player', 'fighter');
  const b = battle(r, [e, soft, tough]); // eliminate
  check('default AI still picks the weakest reachable foe', runEnemyTurn(b, e).target === soft);
}
{
  // defend: rush onto the tile to breach it (target null, path ends on the tile)
  const r = room(['00000', '00000', '00000']);
  const e = unit(r, 2, 0, 'enemy', 'fighter'); // move 4
  const p = unit(r, 0, 2, 'player', 'fighter');
  const b = battle(r, [e, p], { type: 'defend', tile: { x: 2, y: 2 }, turns: 5 });
  const plan = runEnemyTurn(b, e);
  const dest = plan.path && plan.path[plan.path.length - 1];
  check('defend AI rushes onto the tile to breach it', !!dest && dest.x === 2 && dest.y === 2 && plan.target === null);
}
{
  // reach: move to strike the leader (reacher) over an equally-reachable foe
  const r = room(['00000000000']);
  const leader = unit(r, 0, 0, 'player', 'fighter', { useSprites: true });
  const other = unit(r, 10, 0, 'player', 'mage');
  const e = unit(r, 5, 0, 'enemy', 'fighter'); // move 4: can reach to hit either
  const b = battle(r, [leader, other, e], { type: 'reach', tile: { x: 0, y: 0 }, who: 'leader' });
  check('reach AI moves to strike the leader over another foe', runEnemyTurn(b, e).target === leader);
}

console.log(failed ? `\n${failed} test(s) FAILED` : '\nAll M5 objective tests passed');
process.exit(failed ? 1 : 0);

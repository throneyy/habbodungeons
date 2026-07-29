// MP resource-system tests — run with:  node tests/mp.test.js
//
// Skills used to be free and unlimited: the ONLY limit was one action per unit
// per turn, so a Cleric healed every single turn forever. These assert the pool
// that replaced that — what it costs, how it regrows, who is refused, and that
// the refusal happens at the boundary instead of half-way through a cast.
//
// The co-op/duel half matters as much as the solo half: MP is spent inside
// resolveSkill, which only the HOST runs, so a guest that never learns the new
// value would grey out the wrong buttons.
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
})();

import { Room } from '../js/room.js';
import { Battle } from '../js/battle.js';
import { Unit } from '../js/units.js';
import { CLASSES } from '../js/classes.js';
import { ALL_TREE_SKILLS, treeSkillSpecs } from '../js/skills.js';
import { Run, makeMember, memberStats, maxMpOf } from '../js/run.js';
import { buildDungeon, DUNGEON_ID } from '../js/dungeon.js';
import { CoopLeader, CoopMember } from '../js/coopBattle.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

const flat = () => new Room({
  id: 't', name: 't',
  heightmap: ['000000', '000000', '000000', '000000', '000000', '000000'],
  spawn: { x: 0, y: 0 },
});

// ---- the pools and the prices ----------------------------------------------
console.log('pools and prices');
{
  const ids = Object.keys(CLASSES);
  check('all 8 classes carry a pool', ids.length === 8 && ids.every((c) => CLASSES[c].maxMp > 0));
  // Any class can be the run leader and so wield Origins tree skills; a zero
  // pool would silently disable a hard-won skill for whoever picked "wrong".
  check('the smallest pool still affords the cheapest tree skill',
    Math.min(...ids.map((c) => CLASSES[c].maxMp)) >= 4);
  // Thorns bursts around the CASTER, so melee are its natural wielders.
  check('every melee pool affords Thorns',
    ids.filter((c) => CLASSES[c].archetype === 'melee')
      .every((c) => CLASSES[c].maxMp >= ALL_TREE_SKILLS.thorns.cost));
  check('the Cleric has the deepest pool', CLASSES.cleric.maxMp === Math.max(...ids.map((c) => CLASSES[c].maxMp)));
  check('Heal costs 6', CLASSES.cleric.skill.cost === 6);
  check('Inspire is cheaper than Heal', CLASSES.bard.skill.cost < CLASSES.cleric.skill.cost);
  check('all 10 tree skills are priced', Object.values(ALL_TREE_SKILLS).every((s) => s.cost > 0));
  // Cost tracks the unlock threshold, not the power number: grinding Origins
  // buys reach, not free power.
  const water = ['net', 'foam_barrier', 'tidal_wave', 'whirlpool', 'deep_sea_beast'].map((i) => ALL_TREE_SKILLS[i]);
  check('water costs rise with the unlock gate', water.every((s, i) => i === 0 || s.cost >= water[i - 1].cost));
  check('the capstone is the priciest skill',
    ALL_TREE_SKILLS.deep_sea_beast.cost === Math.max(...Object.values(ALL_TREE_SKILLS).map((s) => s.cost)));
}

// ---- canAfford is the single source of truth --------------------------------
console.log('canAfford');
{
  const room = flat();
  const cleric = new Unit(room, null, 2, 2, { team: 'player', classId: 'cleric' });
  const b = new Battle(room, [cleric], {});
  check('a full pool affords its own class skill', b.canAfford(cleric, cleric.skill) === true);
  cleric.stats.mp = 5;
  check('one MP short refuses', b.canAfford(cleric, cleric.skill) === false);
  cleric.stats.mp = 6;
  check('exactly enough affords', b.canAfford(cleric, cleric.skill) === true);
  check('no skill affords nothing', b.canAfford(cleric, null) === false);
  // The unpriced default is load-bearing: legacy and duel-only specs keep
  // working, so only what is explicitly costed is ever limited.
  cleric.stats.mp = 0;
  check('an unpriced skill is free even at 0 MP', b.canAfford(cleric, { name: 'Legacy', kind: 'heal' }) === true);
}

// ---- spending, and the three-cast Cleric ------------------------------------
console.log('casting drains the pool');
{
  const room = flat();
  const cleric = new Unit(room, null, 2, 2, { team: 'player', classId: 'cleric' });
  const hurt = new Unit(room, null, 2, 3, { team: 'player', classId: 'fighter' });
  hurt.stats.hp = 1;
  const b = new Battle(room, [cleric, hurt], {});
  check('the Cleric starts full', cleric.stats.mp === CLASSES.cleric.maxMp);
  b.resolveSkill(cleric, hurt, cleric.skill);
  check('a cast deducts its cost', cleric.stats.mp === CLASSES.cleric.maxMp - 6);

  // Three casts, then dry — the whole point of the pool.
  let casts = 1;
  while (b.canAfford(cleric, cleric.skill)) {
    hurt.stats.hp = 1;
    b.resolveSkill(cleric, hurt, cleric.skill);
    casts++;
  }
  check('a level-1 Cleric gets exactly 3 Heals from a full pool', casts === 3);
  check('and is then unaffordable', b.canAfford(cleric, cleric.skill) === false);
}

// ---- refusal happens at the boundary, not mid-resolution ---------------------
console.log('an unaffordable cast changes nothing');
{
  const room = flat();
  const cleric = new Unit(room, null, 2, 2, { team: 'player', classId: 'cleric' });
  const hurt = new Unit(room, null, 2, 3, { team: 'player', classId: 'fighter' });
  hurt.stats.hp = 1;
  const b = new Battle(room, [cleric, hurt], {});
  cleric.stats.mp = 0;
  const logLines = b.log.length;
  const res = b.resolveSkill(cleric, hurt, cleric.skill);
  check('resolveSkill returns null', res === null);
  check('no HP was restored', hurt.stats.hp === 1);
  check('no MP went negative', cleric.stats.mp === 0);
  check('nothing was written to the log', b.log.length === logLines);
  // Critically: the turn is NOT consumed. A refused cast must leave the unit
  // free to do something else, or a mis-tap would silently end its turn.
  check('the caster has not acted', cleric.acted === false);
}

// ---- regeneration ------------------------------------------------------------
console.log('regeneration');
{
  const room = flat();
  const cleric = new Unit(room, null, 2, 2, { team: 'player', classId: 'cleric' });
  cleric.stats.mp = 0;
  cleric.resetTurn();
  check('+2 MP per phase', cleric.stats.mp === 2);
  cleric.stats.mp = cleric.stats.maxMp - 1;
  cleric.resetTurn();
  check('regen clamps to the max', cleric.stats.mp === cleric.stats.maxMp);
  // +2/turn against a 6-cost Heal = one sustained cast every three turns, and
  // the opening burst drains faster than it regrows. That IS the tension.
  check('regen is slower than a Heal costs', 2 * 3 === CLASSES.cleric.skill.cost);

  // The phase machinery, not just the unit method.
  const foe = new Unit(room, null, 5, 5, { team: 'enemy', classId: 'fighter' });
  const b = new Battle(room, [cleric, foe], {});
  cleric.stats.mp = 0;
  b.startPlayerPhase();
  check('startPlayerPhase regenerates the squad', cleric.stats.mp === 2);
}

// ---- level scaling ------------------------------------------------------------
console.log('level scaling');
{
  const room = flat();
  const l1 = new Unit(room, null, 0, 0, { team: 'player', classId: 'mage' });
  const l5 = new Unit(room, null, 1, 0, { team: 'player', classId: 'mage', level: 5 });
  check('+2 max MP per level', l5.stats.maxMp === l1.stats.maxMp + 8);
  const before = l1.stats.maxMp;
  l1.levelUp();
  check('levelUp raises the ceiling', l1.stats.maxMp === before + 2);
  const geared = new Unit(room, null, 2, 0, { team: 'player', classId: 'mage', bonuses: { maxMp: 5 } });
  check('equipment can add max MP', geared.stats.maxMp === before + 5);
  const carried = new Unit(room, null, 3, 0, { team: 'player', classId: 'mage', mp: 3 });
  check('a saved pool is carried in', carried.stats.mp === 3);
  const overfull = new Unit(room, null, 4, 0, { team: 'player', classId: 'mage', mp: 999 });
  check('a carried pool cannot exceed the max', overfull.stats.mp === overfull.stats.maxMp);
}

// ---- enemies are inert until enemy skills land --------------------------------
console.log('enemies');
{
  const room = flat();
  const goblin = new Unit(room, null, 4, 4, { team: 'enemy', classId: 'fighter' });
  check('an enemy has a pool too (same Unit)', goblin.stats.maxMp > 0);
  check('but no skills to spend it on', goblin.skills.length === 0);
}

// ---- the run layer -------------------------------------------------------------
console.log('run persistence');
{
  const m = makeMember('cleric', 'Nun');
  check('a new member starts with a full pool', m.mp === CLASSES.cleric.maxMp);
  check('memberStats exposes maxMp', memberStats(m).maxMp === CLASSES.cleric.maxMp);
  check('maxMpOf matches memberStats', maxMpOf('cleric', 1) === memberStats(m).maxMp);
  check('maxMpOf scales with level', maxMpOf('cleric', 3) === CLASSES.cleric.maxMp + 4);

  const run = new Run({ squad: [m], dungeon: buildDungeon(), eventPicks: {} });
  // A battle drains it; camp gives it back. HP carrying wounds forward is the
  // roguelike stake — making MP persist too would double the punishment and
  // make the Cleric useless for the back half of a run.
  const room = flat();
  const [unit] = run.instantiateSquad(room, [{ x: 0, y: 0 }]);
  check('the live unit gets the member pool', unit.stats.mp === m.mp);
  unit.stats.mp = 1;
  unit.stats.hp = 4;
  run.writeBack([unit]);
  check('wounds still carry forward', m.hp === 4);
  check('but MP refills at camp', m.mp === CLASSES.cleric.maxMp);

  check('mp is serialized', run.serialize().squad[0].mp === CLASSES.cleric.maxMp);
  check('the save version is unchanged', run.serialize().v === 1);
}

// A save written before MP existed has no `mp` and does NOT go through
// makeMember on the way back in. Undefined would render as "undefined/20 MP"
// and read as 0 to canAfford, locking every skill button.
console.log('legacy saves');
{
  const legacy = {
    v: 1, dungeonId: DUNGEON_ID, nodeIndex: 0, eventPicks: {}, seed: 1,
    gold: 0, inventory: [], stage: 'battle',
    squad: [{ id: 'm1', classId: 'cleric', name: 'Old', level: 1, xp: 0, hp: 20, equipment: {}, leader: true }],
  };
  const run = Run.deserialize(legacy, buildDungeon);
  check('a legacy member resumes with a full pool', run.squad[0].mp === CLASSES.cleric.maxMp);
  check('its wounds are untouched', run.squad[0].hp === 20);
  const room = flat();
  const [unit] = run.instantiateSquad(room, [{ x: 0, y: 0 }]);
  const b = new Battle(room, [unit], {});
  check('and it can still cast', b.canAfford(unit, unit.skill) === true);
}

// An equipment swap that lowers maxMp must not leave the pool above its ceiling.
console.log('equipment clamp');
{
  const m = makeMember('cleric', 'Nun');
  m.mp = 999;
  const run = new Run({ squad: [m], dungeon: buildDungeon(), eventPicks: {} });
  run.clampHp(m);
  check('clampHp clamps the pool too', m.mp === memberStats(m).maxMp);
}

// ---- the Barbarian-leader case §8 called out ----------------------------------
console.log('a melee leader with tree skills');
{
  const room = flat();
  const barb = new Unit(room, null, 2, 2, {
    team: 'player', classId: 'barbarian', skills: treeSkillSpecs(['thorns', 'deep_sea_beast']),
  });
  const foe = new Unit(room, null, 2, 3, { team: 'enemy', classId: 'ranger' });
  const b = new Battle(room, [barb, foe], {});
  check('a melee leader can cast the melee capstone', b.canAfford(barb, ALL_TREE_SKILLS.thorns) === true);
  // Deep Sea Beast (12) is out of reach at level 1 and arrives with levels
  // (+2 each) rather than never — a ramp, not a lockout.
  check('the water capstone is out of reach at level 1',
    b.canAfford(barb, ALL_TREE_SKILLS.deep_sea_beast) === false);
  const l2 = new Unit(room, null, 3, 3, { team: 'player', classId: 'barbarian', level: 2 });
  check('one level later it is affordable', l2.stats.maxMp >= ALL_TREE_SKILLS.deep_sea_beast.cost);
}

// ---- co-op: the guest must not drift from the host ---------------------------
// MP is spent inside resolveSkill, which only the HOST runs. A guest learns
// state through the relay, so if the pool never crossed the wire the guest
// would keep greying out the wrong buttons - and its client is not trusted, so
// the host has to refuse an overspend rather than assume one cannot arrive.
// A real CoopLeader and a real CoopMember over a shared fake wire, as in
// tests/coopRevive.test.js. Only the browser is stubbed.
console.log('co-op stays in sync');
{
  const el = () => {
    const node = {
      children: [], className: '', textContent: '', disabled: false, style: {},
      scrollTop: 0, scrollHeight: 0,
      appendChild(c) { node.children.push(c); return c; },
      removeChild(c) { node.children.splice(node.children.indexOf(c), 1); },
      addEventListener() {},
      get childNodes() { return node.children; },
      get firstChild() { return node.children[0]; },
    };
    let html = '';
    Object.defineProperty(node, 'innerHTML', {
      get: () => html,
      set: (v) => { html = v; node.children.length = 0; },
    });
    return node;
  };
  globalThis.document = { createElement: () => el() };

  const peers = new Map();
  const netFor = (name) => {
    const handlers = new Map();
    const net = {
      name,
      sent: [],
      on(t, fn) {
        if (!handlers.has(t)) handlers.set(t, new Set());
        handlers.get(t).add(fn);
        return () => handlers.get(t).delete(fn);
      },
      emit(t, m) { for (const fn of [...(handlers.get(t) || [])]) fn(m); },
      send(msg) {
        const payload = { ...msg, from: name };
        net.sent.push(payload);
        for (const peer of peers.values()) {
          if (peer.name === name) continue;
          if (payload.to && payload.to !== peer.name) continue;
          peer.emit(payload.t, payload);
        }
      },
    };
    peers.set(name, net);
    return net;
  };
  const stubGame = () => {
    const overlays = { move: new Set(), target: new Set(), skill: new Set(), objective: new Set() };
    return {
      overlays,
      clearOverlays() { for (const k of ['move', 'target', 'skill']) overlays[k].clear(); },
      setController(c) { this.controller = c; },
      setRoom(r) { this.room = r; },
      addUnit() {},
      // the guest renders battle fx for a resolved cast; there is no canvas here
      addFx() {}, addFloat() {}, shake() {},
    };
  };

  const LEADER = 'Alice';
  const ME = 'Bob';
  const squad = [
    makeMember('fighter', LEADER, { leader: true, id: 'm-alice' }),
    makeMember('cleric', ME, { id: 'm-bob' }), // a caster, so there is a pool to drift
  ];
  const dungeon = buildDungeon(DUNGEON_ID, {});
  const run = new Run({ squad, dungeon, seed: 7 });
  run.save = () => {};

  const leaderNet = netFor(LEADER);
  const leader = new CoopLeader(leaderNet, () => LEADER);
  leader.setOwner('m-bob', ME, null);

  const node = dungeon.nodes[0];
  const room = node.makeRoom({ seed: 7 });
  const players = run.instantiateSquad(room, [{ x: 2, y: 2, dir: 2 }, { x: 3, y: 2, dir: 2 }]);
  const enemies = node.makeEnemies(room, { seed: 7, battleNumber: 1, squadSize: 2 });
  const battle = new Battle(room, [...players, ...enemies], { objective: node.objective });
  const bc = { canSelect: () => true, render() {}, refreshOverlays() {} };

  const memberNet = netFor(ME);
  const dom = { banner: el(), actions: el(), roster: el(), log: el() };
  const member = new CoopMember(memberNet, stubGame(), dom, () => ME);
  member.activate(LEADER, {
    classId: 'cleric', figure: null,
    waiting() {}, battleReady() {}, exit() {},
  });
  leader.battleStarted({ battle, bc, players, enemies, node, run });

  const hostUnit = players.find((u) => u.id === 'm-bob');
  const replica = member.byCid.get(leader.cids.get(hostUnit));
  check('the guest has a replica of its own hero', !!replica);
  check('the start frame carries the pool', replica.stats.maxMp === hostUnit.stats.maxMp);
  check('and it starts in step', replica.stats.mp === hostUnit.stats.mp);

  // The host spends; the phase frame is what the guest trusts at a turn boundary.
  hostUnit.stats.mp = 3;
  leader.syncPhase(true);
  check('a phase frame carries the spent pool', replica.stats.mp === 3);

  // An overspend from an untrusted client is REFUSED, not silently no-opped,
  // and the refusal names the real reason.
  leaderNet.sent.length = 0;
  const skillIndex = hostUnit.skills.findIndex((s) => s.id === 'heal');
  const ally = players.find((u) => u.id === 'm-alice');
  ally.stats.hp = 1; // a legal Heal target, so only MP can be the objection
  hostUnit.moved = false;
  hostUnit.acted = false;
  battle.phase = 'player';
  const hpBefore = ally.stats.hp;
  // Sent through the member's OWN command path, so the frame shape is the
  // real one rather than a hand-built guess at it.
  const castCmd = () => member.sendCommand({
    type: 'skill',
    cid: member.cidOf(replica),
    skill: skillIndex,
    target: member.cidOf(member.byCid.get(leader.cids.get(ally))),
  });
  castCmd();
  const rejection = leaderNet.sent.find((m) => m.data && m.data.k === 'rejected');
  check('the host rejects an unaffordable command', !!rejection);
  check('and says why', rejection && rejection.data.reason === 'not enough MP');
  check('no healing happened', ally.stats.hp === hpBefore);
  check('the refused unit may still act', hostUnit.acted === false);

  // Afford it, and the same command goes through - with the caster's new pool
  // echoed on the fx frame, so the guest does not wait for the turn boundary.
  hostUnit.stats.mp = hostUnit.stats.maxMp;
  leader.syncPhase(true);
  castCmd();
  check('an affordable command resolves', ally.stats.hp > hpBefore);
  check('the host charged for it', hostUnit.stats.mp === hostUnit.stats.maxMp - 6);
  check('the guest learned the new pool from the fx frame',
    replica.stats.mp === hostUnit.stats.mp);

  leader.end();
  member.deactivate();
}

console.log(failed ? `\n${failed} test(s) FAILED` : '\nAll MP tests passed');
process.exit(failed ? 1 : 0);

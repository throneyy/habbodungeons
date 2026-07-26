// Consumable effect resolution — the single place a potion's `effect` is
// turned into an actual change. Extracted from js/main.js, which had this
// switch written TWICE (once against live battle Units, once against roster
// members) and had already drifted between the copies.
//
// The two contexts differ only in WHAT a target is and WHERE its hp lives:
//
//   mid-battle   live Unit objects        u.stats.hp / u.stats.maxHp
//   between      roster squad members     m.hp      / memberStats(m).maxHp
//
// so the difference is pushed into a small target adapter and the effect logic
// itself is written once. Consumables mid-battle MUST act on the live units: a
// potion that only touched the roster would be overwritten by Run.writeBack
// when the battle ends.
//
// Adapter contract (see rosterTargets / battleTargets below):
//   leader()      the primary target (heal, xp), or null when there is none
//   living()      every living target, already filtered (healAll)
//   hp(t) maxHp(t) setHp(t, n) addXp(t, n)
//   fallen()      a ROSTER member eligible to be revived, or null
//
// `fallen` is roster-shaped in BOTH contexts, not target-shaped: revive brings
// back someone who is not on the field, so there is no live Unit to act on.
import { CONSUMABLES } from './items.js';
import { memberStats } from './run.js';

// Revive always restores a roster member to half of its equipped max HP.
// Identical in both contexts, so it isn't part of the adapter.
function reviveMember(m) {
  m.hp = Math.ceil(memberStats(m).maxHp / 2);
}

// Targets for use between rooms (camp, the Hand, the backpack overlay).
export function rosterTargets(run) {
  return {
    leader: () => run.squad.find((m) => m.leader) || run.squad[0] || null,
    living: () => run.squad.filter((m) => m.hp > 0),
    hp: (m) => m.hp,
    maxHp: (m) => memberStats(m).maxHp,
    setHp: (m, n) => { m.hp = n; },
    addXp: (m, n) => { m.xp += n; },
    fallen: () => run.squad.find((m) => m.hp <= 0) || null,
  };
}

// Targets for use mid-battle: the live units on the field, plus the roster for
// revive (which reaches OFF the field by definition).
export function battleTargets(run, battle) {
  const players = () => battle.units.filter((u) => u.team === 'player' && u.alive);
  return {
    leader: () => {
      const p = players();
      return p.find((u) => u.useSprites) || p[0] || null;
    },
    living: players,
    hp: (u) => u.stats.hp,
    maxHp: (u) => u.stats.maxHp,
    setHp: (u, n) => { u.stats.hp = n; },
    addXp: (u, n) => { u.xp += n; },
    // only heroes who fell in an EARLIER battle can rejoin (a corpse on
    // this field would just be re-downed by writeBack)
    fallen: () => run.squad.find((m) => m.hp <= 0 && !battle.units.some((u) => u.id === m.id)) || null,
  };
}

// Apply an effect through a target adapter. Pure with respect to the run: it
// touches only the targets, never the inventory or the save file.
//
// Returns whether anything actually happened. False means the effect would
// have been WASTED (already at full HP, nobody fallen, no leader alive) and
// the caller must not consume the item for nothing. An unknown kind also
// returns false, so a mis-typed effect fails visibly rather than eating a
// potion silently.
export function resolveEffect(effect, targets) {
  if (!effect || !targets) return false;
  let did = false;
  switch (effect.kind) {
    case 'heal': {
      const leader = targets.leader();
      // hp > 0: a downed hero needs a revive, not a potion. (In battle every
      // candidate is alive already, so this only bites on the roster path.)
      if (leader && targets.hp(leader) > 0 && targets.hp(leader) < targets.maxHp(leader)) {
        targets.setHp(leader, Math.min(targets.maxHp(leader), targets.hp(leader) + effect.n));
        did = true;
      }
      break;
    }
    case 'healAll':
      for (const t of targets.living()) {
        if (targets.hp(t) > 0 && targets.hp(t) < targets.maxHp(t)) {
          targets.setHp(t, Math.min(targets.maxHp(t), targets.hp(t) + effect.n));
          did = true;
        }
      }
      break;
    case 'revive': {
      const fallen = targets.fallen();
      if (fallen) {
        reviveMember(fallen);
        did = true;
      }
      break;
    }
    case 'xp': {
      const leader = targets.leader();
      if (leader) {
        targets.addXp(leader, effect.n);
        did = true;
      }
      break;
    }
  }
  return did;
}

// Use a consumable out of the run's backpack through the given targets:
// resolve the effect, and only if it landed, spend the item and save.
// Returns false (item untouched) for a non-consumable, an item that isn't in
// the backpack, or an effect that would be wasted.
export function consumeFromRun(run, itemId, targets) {
  const c = run && CONSUMABLES[itemId];
  if (!c) return false;
  const idx = run.inventory.indexOf(itemId);
  if (idx < 0) return false;
  if (!resolveEffect(c.effect, targets)) return false;
  run.inventory.splice(idx, 1);
  run.save();
  return true;
}

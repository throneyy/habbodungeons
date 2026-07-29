// The hd-* kit and dr-* daily-rewards catalog, one module per section.
//
// One specimen per selector listed in docs/ui-inventory.md, in the order that
// document lists them, so the two files can be diffed against each other. The
// five selectors the audit found with NO caller anywhere in the repo are
// marked SPARE; they still render, because a spare part you cannot look at is
// indistinguishable from a deleted one.
//
// Every specimen is built from real catalogue data (CLASSES, ITEMS, RARITY,
// CONSUMABLES, WEDGES) and, where the app has fixed copy, that copy verbatim.
// Nothing here invents a stat, an item or a number. Shared builders live in
// ./kit.js; anything used by a single section stays in that section's module.
import { shell } from './shell.js';
import { cards } from './cards.js';
import { pillsBadges } from './pills.js';
import { buttons } from './buttons.js';
import { logos } from './logos.js';
import { inputs } from './input.js';
import { callings } from './callings.js';
import { layout } from './landing.js';
import { loading } from './loading.js';
import { inventory } from './inventory.js';
import { stats } from './dashboard.js';
import { drModalSection } from './dr-modal.js';
import { drDockSection } from './dr-dock.js';

// Catalog order. Kit primitives first (shell, then the things built out of
// it), then the two dr-* families that consume them.
export function hdSections() {
  return [
    shell,
    cards,
    pillsBadges,
    buttons,
    logos,
    inputs,
    callings,
    layout,
    loading,
    inventory,
    stats,
    drModalSection,
    drDockSection,
  ];
}

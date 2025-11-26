/**
 * Enemy sprite asset map for dynamic loading in battle simulator
 */
import ancientTreant from '@/assets/ancient-treant.png';
import azureDragon from '@/assets/azure-dragon.png';
import bloodDragon from '@/assets/blood-dragon-boss.gif';
import emeraldDrake from '@/assets/emerald-drake.png';
import fireDrake from '@/assets/fire-drake.png';
import flamingPhantom from '@/assets/flaming-phantom.png';
import frostBrute from '@/assets/frost-brute.png';
import frostMutant from '@/assets/frost-mutant.png';
import frostRat from '@/assets/frost-rat.gif';
import frostUndead from '@/assets/frost-undead.gif';
import frostWolf from '@/assets/frost-wolf.png';
import frostWraith from '@/assets/frost-wraith.png';
import frostbiteSpider from '@/assets/frostbite-spider.png';
import glacialImp from '@/assets/glacial-imp.png';
import gnoll from '@/assets/gnoll.png';
import goblinTrio from '@/assets/goblin-trio.png';
import gryphon from '@/assets/gryphon.png';
import iceElemental from '@/assets/ice-elemental.png';
import iceGorgon from '@/assets/ice-gorgon.png';
import iceGuardian from '@/assets/ice-guardian.png';
import iceKnightBoss from '@/assets/ice-knight-boss.png';
import iceTiger from '@/assets/ice-tiger.gif';
import icedStoneDragon from '@/assets/iced-stone-dragon.png';
import infernalHound from '@/assets/infernal-hound.png';
import mysticShaman from '@/assets/mystic-shaman-boss.png';
import phoenix from '@/assets/phoenix.png';
import skeleton from '@/assets/skeleton.png';
import slumberBear from '@/assets/slumber-bear.gif';
import swampLurker from '@/assets/swamp-lurker.png';
import undeadHabbo from '@/assets/undead-habbo.png';
import voidStalker from '@/assets/void-stalker.png';
import werewolf from '@/assets/werewolf.png';
import wolfPup from '@/assets/wolf-pup.png';

export const ENEMY_SPRITE_MAP: Record<string, string> = {
  'ancient-treant.png': ancientTreant,
  'azure-dragon.png': azureDragon,
  'blood-dragon-boss.gif': bloodDragon,
  'emerald-drake.png': emeraldDrake,
  'fire-drake.png': fireDrake,
  'flaming-phantom.png': flamingPhantom,
  'frost-brute.png': frostBrute,
  'frost-mutant.png': frostMutant,
  'frost-rat.gif': frostRat,
  'frost-undead.gif': frostUndead,
  'frost-wolf.png': frostWolf,
  'frost-wraith.png': frostWraith,
  'frostbite-spider.png': frostbiteSpider,
  'glacial-imp.png': glacialImp,
  'gnoll.png': gnoll,
  'goblin-trio.png': goblinTrio,
  'gryphon.png': gryphon,
  'ice-elemental.png': iceElemental,
  'ice-gorgon.png': iceGorgon,
  'ice-guardian.png': iceGuardian,
  'ice-knight-boss.png': iceKnightBoss,
  'ice-tiger.gif': iceTiger,
  'iced-stone-dragon.png': icedStoneDragon,
  'infernal-hound.png': infernalHound,
  'mystic-shaman-boss.png': mysticShaman,
  'phoenix.png': phoenix,
  'skeleton.png': skeleton,
  'slumber-bear.gif': slumberBear,
  'swamp-lurker.png': swampLurker,
  'undead-habbo.png': undeadHabbo,
  'void-stalker.png': voidStalker,
  'werewolf.png': werewolf,
  'wolf-pup.png': wolfPup,
};

export function getEnemySpriteUrl(filename: string): string {
  return ENEMY_SPRITE_MAP[filename] || iceGuardian;
}

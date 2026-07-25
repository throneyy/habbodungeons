// Dialogue state machine — pure data-driven, no DOM (content lives in
// js/dialogueData.js, presentation in js/npc.js). A dialogue spec is a graph:
//   { start: 'nodeId', nodes: { nodeId: { lines: [...], choices?: [
//     { text, next: 'nodeId' }, ... ] } } }
// A node speaks its lines one at a time, then offers its choices (if any) or
// ends. Choosing jumps to the choice's `next` node and the cycle repeats.
export class Dialogue {
  constructor(spec) {
    this.spec = spec;
    this.nodeId = spec.start;
    this.li = 0; // next line index within the current node
    this.ended = false;
  }

  get node() {
    return this.spec.nodes[this.nodeId];
  }

  // Advance one beat. Returns exactly one of:
  //   { line: '...' }        — the NPC speaks (call next() again after)
  //   { choices: [...] }     — waiting on the player (call choose(i))
  //   { end: true }          — conversation over
  next() {
    if (this.ended) return { end: true };
    const n = this.node;
    if (n && this.li < n.lines.length) return { line: n.lines[this.li++] };
    if (n && n.choices && n.choices.length) return { choices: n.choices };
    this.ended = true;
    return { end: true };
  }

  // Pick choice i of the current node; jumps to its branch. Returns the
  // choice taken (so the UI can echo it as the player's own chat line).
  choose(i) {
    const n = this.node;
    const c = n && n.choices && n.choices[i];
    if (!c) return null;
    this.nodeId = c.next;
    this.li = 0;
    if (!this.node) this.ended = true; // branch points nowhere -> end cleanly
    return c;
  }
}

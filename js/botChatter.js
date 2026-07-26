// Room-bot chatter — DATA only, recovered from the same Havana `rooms_bots`
// dump as the roster in js/botsData.js (tools/migrations/update.1.3.sql), from
// its `speech`, `response` and `unrecognised_response` columns.
//
// NOT js/dialogueData.js. That file is a branching node/choice machine for the
// prop NPCs (the Gatekeeper): nodes, choices, `next` edges, a runner walking a
// graph. Bot chatter is a flat shape — a bot picks a random line and says it —
// so it lives here rather than being bent into a graph it isn't.
//
//   speech        idle lines, said unprompted on a timer
//   response      said when someone talks to the bot (the serving bots answer
//                 a drink order with these)
//   unrecognised  said when the bot has nothing matching to answer with
//
// A line is { text } or { text, mode }, where mode is 'shout' or 'whisper' and
// its ABSENCE means a normal say — the overwhelmingly common case, left off so
// the data isn't 90% noise. Read it through modeOf(line), never line.mode.
// The dump stored the mode as a literal `#SHOUT` / `#WHISPER` suffix on the
// line text; the marker is parsed OFF the text here, so nothing can render a
// stray "#SHOUT" in a chat bubble. Lines are split on the source's `|`.
//
// The `|` split is taken literally, so one oddity survives: Reginaldo's
// response column is 'Enjoy the %drink%!,Here you go!' — authored with a comma
// where every other row uses a pipe. It stays a single line rather than being
// re-split on a separator the format doesn't actually use.
//
// The text is otherwise the dump's, verbatim, with three mechanical fixes:
//   • stray CR/LF inside a line collapsed to a space (Amber's row carries one)
//   • empty pieces dropped (Miho's row ends with a trailing `|`)
//   • curly apostrophes/quotes, em dashes and ellipses folded to ASCII, because
//     the Volter bitmap font mis-renders them (see js/dialogueData.js) — this
//     hits Piers, whose row is the one typed with curly quotes
//
// %drink% and %lowercaseDrink% are left INTACT: they are the emulator's
// template tokens, substituted with whatever was ordered at say-time. Anything
// rendering these lines must expand them (or strip them) first.
//
// Bots whose three columns are all empty in the dump are simply ABSENT from
// this map rather than carrying empty arrays — they are legitimately silent,
// and no lines have been invented for them. Callers must handle `undefined`:
// use chatterFor(key), which returns null.

export const CHATTER = {
  harry: {
    speech: [
      { text: 'Please keep it down people are trying to think!', mode: 'shout' },
      { text: 'Only use the Call for help in an emergency!' },
      { text: 'Want to know more about Habbo Hotel? Ask a Habbo Guide!' },
      { text: 'Is it me or is something BIG about to happen?' },
      { text: 'In Trouble? Call for Moderator assistance using the Blue Question Mark!' },
      { text: "There's no such thing as a free lunch or free credits!" },
    ],
    response: [
      { text: "Why Hello there! *Shakes Habbo Hand* My name's Harry." },
      { text: 'Hello, Hello, Hello!' },
      { text: 'Hello and welcome to Habbo Hotel! Enjoy your stay! :)' },
    ],
    unrecognised: [
      { text: "Why Hello there! *Shakes Habbo Hand* My name's Harry." },
      { text: 'Hello, Hello, Hello!' },
      { text: 'Hello and welcome to Habbo Hotel! Enjoy your stay! :)' },
    ],
  },
  marcus: {
    speech: [
      { text: "If you hear a funny noise, it's just Sid the sloth - he loves to sing!" },
      { text: 'No ordinary drink for no ordinary Habbo' },
      { text: "Stressed out? The Ice House cinema's the best place to chill out." },
      { text: "Come on - you don't need Dutch courage" },
      { text: "We've got the coolest DVD playing this week - check it out!" },
      { text: 'Wow! You have a real talent!' },
      { text: "See a hairy elephant? It's just Manny the moody mastodon." },
    ],
    response: [
      { text: 'Here you go!' },
      { text: 'Sure, %lowercaseDrink% it is!' },
    ],
    unrecognised: [
      { text: 'Hello' },
    ],
  },
  piers: {
    speech: [
      { text: 'Would you like to taste my wrath?' },
      { text: 'The silverback grilla is native to this area.' },
      { text: 'Heaters gonna heat.' },
      { text: "That's a recipe for disaster." },
    ],
    response: [
      { text: 'Yes?' },
      { text: "What? I'm busy you know" },
      { text: 'A FINE CHOICE', mode: 'shout' },
      { text: "Soup man, how's it going?" },
    ],
    unrecognised: [],
  },
  ingemar: {
    speech: [
      { text: 'You people are my best customer ever, I like you.' },
      { text: "Somewhere in America, there's a street named after my dad" },
      { text: 'Snowballmachines give you snowballs fast' },
      { text: 'Use the scenery to your advantage' },
    ],
    response: [],
    unrecognised: [
      { text: 'Watcha! Welcome to the coolest club in the whole hotel' },
    ],
  },
  chloe: {
    speech: [
      { text: 'I need to get out of the ice cream booth and into the DJ booth!' },
      { text: 'Ow there goes my eardrum!', mode: 'shout' },
      { text: 'I wish I looked that good in a bikini' },
      { text: 'When will I, will I be a famous Habbo who gets on the VIP list?' },
      { text: "I'm a fiery redhead - come here boys!" },
    ],
    response: [
      { text: 'There you go.' },
    ],
    unrecognised: [
      { text: 'Hello sweetie' },
      { text: 'Hi, how can I help?' },
      { text: 'Well hello there' },
    ],
  },
  jem: {
    speech: [
      { text: "Quiet please, I'm thinking", mode: 'shout' },
      { text: 'Purchase tickets at the machine by the pool.' },
      { text: 'It makes me dizzy to move too quickly!' },
      { text: 'Drink anyone?' },
      { text: 'Gerbils are good :)' },
      { text: 'Calm down' },
      { text: 'Habbo Staff making Habbos smile since 2001' },
    ],
    response: [
      { text: 'There you go.' },
    ],
    unrecognised: [
      { text: "You calling? I'm listening..." },
      { text: "I'm with ya...What's up?" },
      { text: "Jem's the name, drinks are my game" },
      { text: "That's my name, don't wear it out!" },
    ],
  },
  miho: {
    speech: [
      { text: 'Zen Garden is the ultimate in relaxation' },
      { text: 'Listen to the breeze blowing through the leaves' },
      { text: 'Welcome to my garden a place of quiet reflection...' },
      { text: 'Listen to the breeze blowing through the leaves...' },
    ],
    response: [
      { text: 'I hope you make peace with this' },
      { text: 'Relax with this' },
      { text: 'Relaxation can be achieved this this' },
    ],
    unrecognised: [
      { text: 'That is my name.' },
      { text: "Say again - it's a bit noisy in here", mode: 'whisper' },
      { text: 'You bring confusion to my mind, and pain to my ears...', mode: 'whisper' },
    ],
  },
  amber: {
    speech: [
      { text: 'Ask a guide for safety hints and tips. They have an guide badge.' },
      { text: 'P2S is giving your furni away!' },
      { text: 'I got this job by smiling sweetly at Redtiz for 40 minutes.' },
      { text: 'Be safe, not sorry! Learn to protect yourself' },
      { text: 'Quench it!' },
      { text: 'Glad to be of service!' },
      { text: "Oh to be a star! Perhaps one day soon I'll be recognised?" },
    ],
    response: [
      { text: 'This should quench your thirst!' },
      { text: 'Thirst quenching, soul refreshing!' },
    ],
    unrecognised: [
      { text: 'Hello, come for some safety tips? Ask a guide!' },
    ],
  },
  ray: {
    speech: [
      { text: 'Official Fansite are voted by YOU, the Habbo community!' },
      { text: 'Did you know the Official Fansites are changed every 3 months?' },
      { text: "If they aren't listed once you click the billboard then they aren't Official!" },
      { text: 'Once refreshed, visit an Official Fansite!' },
      { text: 'Click the billboard now to visit our Official Fansites!' },
      { text: 'Official Fansites have great events, comps and radio shows!' },
    ],
    response: [
      { text: 'Refreshing!' },
      { text: 'Here you are, with extra coconut milk, only for you ;)' },
      { text: 'Here you go, hope you like the umbrella.' },
      { text: 'You sure are thirsty, huh?' },
      { text: 'You can only have one at a time!' },
      { text: "That's my name! As in the beams of golden sunshine and not the sunglasses." },
      { text: 'Hi my name is what? my name is who? my name is...ray' },
    ],
    unrecognised: [],
  },
  regina: {
    speech: [
      { text: "I've been busy practicing my dance routine for my latest song!" },
      { text: 'You like coffee? I like my job' },
      { text: 'You mocha me very happy.' },
      { text: 'Italians are so good at making coffee because they naturally like to espresso themselves.' },
    ],
    response: [
      { text: 'Enjoy this' },
      { text: 'This will do the trick' },
      { text: 'One %lowercaseDrink% coming right up!' },
    ],
    unrecognised: [
      { text: 'Repeat that please!' },
      { text: 'Say that again' },
      { text: 'What?' },
      { text: 'Hmm...' },
    ],
  },
  brone: {
    speech: [
      { text: 'Enjoy the dance!' },
      { text: "I've never seen what the other side is like..." },
      { text: "My boss doesn't allow me to see the disco :(" },
      { text: 'I serve some mean drinks!' },
    ],
    response: [
      { text: 'You look like you need this' },
      { text: 'Hmm, take this' },
    ],
    unrecognised: [
      { text: 'Not sure what you said' },
      { text: 'Did I hear something?' },
      { text: 'What?' },
    ],
  },
  sadie: {
    speech: [
      { text: 'Adorate tutti Bubu, regina delle banane!' },
    ],
    response: [],
    unrecognised: [],
  },
  reginaldo: {
    speech: [
      { text: "It's pretty cool working here, I must say" },
      { text: 'Maybe some day I will become a club member...' },
      { text: 'Who knew that someone like me would end up working here?' },
    ],
    response: [
      { text: 'Enjoy the %drink%!,Here you go!' },
    ],
    unrecognised: [
      { text: "Sorry? I didn't catch that" },
      { text: 'Hello there!' },
      { text: "That's my name, don't wear it out" },
    ],
  },
  billy: {
    speech: [
      { text: 'I serve drinks here' },
      { text: 'Did you know that coffee comes from plants?' },
      { text: 'Espresso your opinions politely.' },
      { text: 'Hmmm... the lovely smell of coffee beans...' },
    ],
    response: [
      { text: 'Coming right up!' },
      { text: "Be careful, don't hurt yourself!" },
    ],
    unrecognised: [
      { text: 'Cool story, brew.' },
      { text: "Yep, that's me" },
    ],
  },
  phillip: {
    speech: [
      { text: "The way to a man's heart is through his stomach." },
      { text: "One day i'll be famous" },
    ],
    response: [
      { text: 'Grilling the meat as we speak!' },
      { text: "That's the special!" },
    ],
    unrecognised: [],
  },
  ariel: {
    speech: [
      { text: 'Sure is chilly at the Ice Cafe...' },
      { text: 'Here to serve, every, single, day...' },
      { text: 'Did you know that I never get a break?' },
    ],
    response: [
      { text: "%drink% it is me'dear'!:)" },
      { text: 'Et voila!' },
    ],
    unrecognised: [
      { text: 'Sorry - did you want something?' },
    ],
  },
  berith: {
    speech: [
      { text: "It's pretty cool working here, I must say" },
      { text: 'Maybe some day I will become a club member...' },
      { text: 'Who knew that someone like me would end up working here?' },
    ],
    response: [],
    unrecognised: [
      { text: "Sorry? I didn't catch that" },
      { text: 'Hello there!' },
      { text: "That's my name, don't wear it out" },
    ],
  },
  skye: {
    speech: [
      { text: 'Above the clouds, freedom must be limitless...' },
      { text: "I'm sooo tired! *yawn*" },
    ],
    response: [
      { text: 'Sure.' },
      { text: 'Roger that.' },
    ],
    unrecognised: [
      { text: 'Hi, how can I help?' },
      { text: "I can't hear you, the air is too thin up here!", mode: 'whisper' },
    ],
  },
  gino: {
    speech: [
      { text: 'Grab a pizza and enjoy the magnificent view!' },
    ],
    response: [],
    unrecognised: [],
  },
  carlo: {
    speech: [
      { text: 'Food of the gods.' },
      { text: 'Gino, do not forget to wash the dishes!' },
    ],
    response: [
      { text: 'Would you like a drink with that?' },
      { text: 'Not a problem' },
    ],
    unrecognised: [
      { text: "I don't understand you.", mode: 'whisper' },
    ],
  },
  lofar: {
    speech: [
      { text: 'This cafe is out of this world...' },
      { text: 'A space fish is usually called starfish.' },
      { text: 'I would have gone to space, but the cost is astronomical!' },
      { text: 'Two astronauts who were dating, met up for a launch date.' },
      { text: 'Becoming a space pilot is not easy. It requires a good altitude.' },
    ],
    response: [
      { text: 'Here you go!' },
      { text: 'Drink up!' },
      { text: "Here's the %drink%" },
      { text: 'Spacylicious!' },
    ],
    unrecognised: [
      { text: "Sorry, I can't hear you in this space suit" },
      { text: "What's that? Must be the lack of gravity" },
    ],
  },
  laura: {
    speech: [
      { text: 'Has anyone seen my bikini? I need to cool down!', mode: 'shout' },
    ],
    response: [],
    unrecognised: [],
  },
};

// The chatter for a bot key, or null when that bot is one of the 11 silent
// ones (or the key is unknown). Never returns a partially-built object.
export function chatterFor(key) {
  return CHATTER[key] || null;
}

// How a line is said. Lines carry `mode` only when it isn't a plain say, so
// callers ask here instead of reading a field that is usually absent.
export function modeOf(line) {
  return line.mode || 'say';
}

// The bots the dump gives no lines at all. Listed explicitly so the absence
// is visibly deliberate rather than looking like rows that got lost.
export const SILENT_BOTS = Object.freeze([
  'xenia',
  'pamela',
  'james',
  'marion',
  'dave',
  'marcel',
  'dj_von_beathoven',
  'maarit',
  'scubajoe',
  'eric',
  'tao',
]);

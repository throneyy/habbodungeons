// Native Habbo V31 UI, catalogued from the Havana static-web dump.
//
// Everything here is REFERENCE, not ours. The CSS is served read-only from
// tools/reference/havana-v31/web-gallery/v2/styles/ and nothing is copied into
// hub/css. Each specimen renders in its own iframe (see ./frame.js) so the 2009
// cascade and the catalog chrome cannot reach each other.
//
// MARKUP PROVENANCE
//
// The structures below are taken from a real captured habbo.com V31 DOM
// (jaredsohn/userscript scripts/7/75803.user.js, a userscript that embedded a
// verbatim page dump), not invented. That capture gives, verbatim:
//
//   <div class="habblet-container ">
//     <div class="cb clearfix default "><div class="bt"><div></div></div><div
//       class="i1"><div class="i2"><div class="i3">
//         <div class="box-tabs-container clearfix">
//           <h2>Habbos</h2>
//           <ul class="box-tabs">
//             <li id="tab-0-4-1"><a href="#">Search Habbos</a><span class="tab-spacer"></span></li>
//             <li id="tab-0-4-2" class="selected"><a href="#">Invite Friends</a><span class="tab-spacer"></span></li>
//           </ul>
//         </div>
//         …
//     </div></div></div><div class="bb"><div></div></div></div>
//   </div>
//
//   <a href="#" class="new-button"><b>Search</b><i></i></a>
//   <div id="avatar-habblet-list-container" class="habblet-list-container">
//     <ul class="habblet-list"></ul>
//   </div>
//
// Where the capture does not cover a variant (the icon buttons, the tooltips),
// the structure is DERIVED FROM THE SELECTORS THEMSELVES — e.g. tooltips.css
// only ever says `div.bubbletip div.title` and `div.bubbletip div.content`, so
// that is the structure. Those specimens say so in their note rather than
// implying a capture exists.
import { specimen, section, el } from '../kitchensink/registry.js';
import { nativeFrame } from './frame.js';

const STYLE = 'havana-v31/…/v2/styles/style.css';
const BUTTONS = 'havana-v31/…/v2/styles/buttons.css';
const TOOLTIPS = 'havana-v31/…/v2/styles/tooltips.css';
const CAPTURE = 'captured habbo.com V31 DOM';

// Collects live art failures reported by each frame, so the page can print one
// honest summary instead of a promise that everything rendered.
export const artReport = [];

function frameFor(id, markup, opts = {}) {
  return nativeFrame({
    ...opts,
    markup,
    onArt: (r) => {
      if (r.missing.length || r.deadSheets) artReport.push({ id, ...r });
    },
  });
}

// ---- real V31 structures ----------------------------------------------------

// The rounded box. `#content` (supplied by the frame) is what switches the
// corner art on; the theme class rides on .cb beside `clearfix`.
function box(inner, theme = 'default') {
  return `<div class="habblet-container">
  <div class="cb clearfix ${theme}"><div class="bt"><div></div></div><div
    class="i1"><div class="i2"><div class="i3">
${inner}
  </div></div></div><div class="bb"><div></div></div></div>
</div>`;
}

function tabs({ theme = 'default', heading = 'Habbos' } = {}) {
  // li floats right, so the FIRST li in source renders rightmost. The capture
  // has the selected tab second, i.e. on the left. Preserved deliberately.
  return box(
    `<div class="box-tabs-container clearfix">
    <h2>${heading}</h2>
    <ul class="box-tabs">
      <li><a href="#">Search Habbos</a><span class="tab-spacer"></span></li>
      <li class="selected"><a href="#">Invite Friends</a><span class="tab-spacer"></span></li>
    </ul>
  </div>
  <div class="box-content">
    <p class="last">Tab body. The selected cap fuses into the strip.</p>
  </div>`,
    theme,
  );
}

function titledBox(theme = 'default', title = 'Habbo Dungeons') {
  return box(
    `<h2 class="title">${title}</h2>
  <div class="box-content">
    <p class="last">A titled box: the crimson strip is <code>h2.title</code>, the well below it <code>div.box-content</code>.</p>
  </div>`,
    theme,
  );
}

function newButton(mod = '', label = 'Click for the invitation link!', icon = false) {
  return `<a href="#" class="new-button${mod ? ` ${mod}` : ''}">${icon ? '<span></span>' : ''}<b>${label}</b><i></i></a>`;
}

// buttons float right; a clearfix row keeps them on their own line
function buttonRow(...buttons) {
  return `<div class="box-content clearfix">${buttons.join('')}</div>`;
}

// a.new-button is float:right inside a 460px column, so a full-width frame is
// mostly empty. Narrowing the FRAME (not the CSS) keeps the button legible.
const BTN_W = { width: 260 };

// ---- 1. the box family ------------------------------------------------------

const boxes = section({
  id: 'nat/v31/box',
  title: 'The box',
  blurb:
    'Habbo\u2019s panel. Five nested divs build the rounded frame: .bt and .bb carry the corner slices, .i1/.i2 the side borders, .i3 the content. Note the corner art only appears under #content \u2014 style.css assigns it as `#content .bt { background-image: … }`, so the same markup elsewhere renders square.',
  specimens: [
    specimen({
      id: 'nat/v31/box-frame',
      classes: 'cb clearfix default > bt / i1 > i2 > i3 / bb',
      purpose: 'The rounded box shell, corners and borders drawn from one sprite (images/box.png).',
      sources: [STYLE, CAPTURE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: [
        { label: 'titled', classes: 'cb clearfix default', render: () => frameFor('nat/v31/box-frame', titledBox()) },
        {
          label: 'untitled',
          classes: 'cb clearfix default',
          render: () =>
            frameFor('nat/v31/box-frame', box('<div class="box-content"><p class="last">No title strip.</p></div>')),
        },
      ],
    }),
    specimen({
      id: 'nat/v31/box-content',
      classes: 'box-content',
      purpose: 'The padded content well inside the box: 8px 15px, and it clears the tab strip above it.',
      sources: [STYLE, CAPTURE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: [{ label: 'in context', render: () => frameFor('nat/v31/box-content', titledBox()) }],
    }),
    specimen({
      id: 'nat/v31/box-tabs-container',
      classes: 'box-tabs-container clearfix',
      purpose: 'Tab strip wrapper. Its h2 is absolutely positioned into the strip\u2019s left edge.',
      sources: [STYLE, CAPTURE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: [{ label: 'in context', render: () => frameFor('nat/v31/box-tabs-container', tabs()) }],
    }),
    specimen({
      id: 'nat/v31/box-tabs',
      classes: 'box-tabs',
      purpose: 'The tab list itself: 25px tall, orange 1px underline, each cap a slice of images/inner-tabs.png.',
      sources: [STYLE, CAPTURE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note: 'li floats right, so the first tab in source order renders rightmost \u2014 that is how the capture reads too.',
      variants: [{ label: 'selected + idle', render: () => frameFor('nat/v31/box-tabs', tabs()) }],
      pseudo: [
        { name: 'li.selected a', effect: 'Cap sprite moves to row 0, ink goes black and bold.' },
        { name: 'li:hover a', effect: 'Cap sprite moves to the -50px row.' },
        { name: 'li.selected:hover a', effect: 'Stays on row 0 \u2014 the selected tab does not react to hover.' },
      ],
    }),
    specimen({
      id: 'nat/v31/tab-spacer',
      classes: 'tab-spacer',
      purpose: 'A 4px empty span after each tab label, drawing the wedge between one cap and the next.',
      sources: [STYLE, CAPTURE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note: 'Carries no text \u2014 it exists purely to hold a 4px slice of the tab sprite at a different offset.',
      variants: [{ label: 'between caps', render: () => frameFor('nat/v31/tab-spacer', tabs()) }],
    }),
  ],
});

// ---- 2. theme variants ------------------------------------------------------

const THEMES = [
  ['default', 'Default orange. No ancestor class needed.'],
  ['blue', 'Tabs + title only.'],
  ['green', 'Tabs + title only.'],
  ['red', 'Tabs + title only.'],
  ['gray', 'Also swaps corner art and inverts the body ink.'],
];

const themes = section({
  id: 'nat/v31/themes',
  title: 'Theme variants',
  blurb:
    'A colour theme is an ancestor class on .cb, and every child reacts. The tab caps are one sprite sheet re-offset per theme (blue -100px, green -175px, red -325px) rather than five sets of images \u2014 the same trick our own hw-* chrome uses.',
  specimens: [
    specimen({
      id: 'nat/v31/theme-tabs',
      classes: 'cb clearfix {blue|green|red|gray}',
      purpose: 'Ancestor theme class restyling the tab strip, its underline and the h2 ink.',
      sources: [STYLE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: THEMES.map(([t, note]) => ({
        label: t,
        classes: `cb clearfix ${t}`,
        note,
        render: () => frameFor(`nat/v31/theme-tabs/${t}`, tabs({ theme: t })),
      })),
    }),
    specimen({
      id: 'nat/v31/theme-title',
      classes: 'div.{blue|green|red|gray} h2.title',
      purpose: 'The same ancestor class recolouring the title strip.',
      sources: [STYLE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note:
        'Asymmetry worth knowing: only gray also overrides the corner art (box_gray.png) and the .box-content ink. blue, green and red change colour alone, so their boxes keep the default orange-tinted corners.',
      variants: THEMES.map(([t, note]) => ({
        label: t,
        classes: `cb clearfix ${t}`,
        note,
        render: () => frameFor(`nat/v31/theme-title/${t}`, titledBox(t, `${t} theme`)),
      })),
    }),
  ],
});

// ---- 3. habblet -------------------------------------------------------------

const habblets = section({
  id: 'nat/v31/habblet',
  title: 'Habblet',
  blurb:
    'A "habblet" is one self-contained widget on the gallery page \u2014 the era\u2019s word for a portlet. The container is the outermost wrapper; the list, info and button-row are the parts a habblet is assembled from.',
  specimens: [
    specimen({
      id: 'nat/v31/habblet-container',
      classes: 'habblet-container',
      purpose: 'Outermost wrapper for one widget. Takes an extra class to name the widget (e.g. minimail).',
      sources: [STYLE, CAPTURE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note: 'Structural only \u2014 it carries almost no style of its own; it is the hook the theme and the JS use.',
      variants: [{ label: 'wrapping a box', render: () => frameFor('nat/v31/habblet-container', titledBox()) }],
    }),
    specimen({
      id: 'nat/v31/habblet-list',
      classes: 'habblet-list-container > ul.habblet-list',
      purpose: 'The standard list inside a habblet: an index column, a link, and a grey sub-line.',
      sources: [STYLE, CAPTURE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: [
        {
          label: 'single column',
          classes: 'ul.habblet-list',
          render: () =>
            frameFor(
              'nat/v31/habblet-list',
              box(`<h2 class="title">Top Rooms</h2>
  <div id="habblet-list-container" class="habblet-list-container">
    <ul class="habblet-list">
      <li><span class="index">1.</span><div class="link"><a href="#">The Crypt</a><p>42 Habbos inside</p></div></li>
      <li><span class="index">2.</span><div class="link"><a href="#">Frostkeep Hall</a><p>31 Habbos inside</p></div></li>
      <li><span class="index">3.</span><div class="link"><a href="#">The Vault</a><p>18 Habbos inside</p></div></li>
    </ul>
  </div>`),
            ),
        },
        {
          label: 'two columns',
          classes: 'ul.habblet-list.two-cols',
          note: 'li.right gains a 1px divider on its inner .item.',
          render: () =>
            frameFor(
              'nat/v31/habblet-list-two',
              box(`<h2 class="title">Friends</h2>
  <div class="habblet-list-container">
    <ul class="habblet-list two-cols clearfix">
      <li><div class="item"><a href="#">Adventurer</a></div></li>
      <li class="right"><div class="item"><a href="#">Gatekeeper</a></div></li>
      <li><div class="item"><a href="#">Ravenna</a></div></li>
      <li class="right"><div class="item"><a href="#">Bo Bunny</a></div></li>
    </ul>
  </div>`),
            ),
        },
      ],
    }),
    specimen({
      id: 'nat/v31/habblet-content-info',
      classes: 'habblet-content-info',
      purpose: 'Instructional line at the top of a habblet, closed by a dashed rule.',
      sources: [STYLE, CAPTURE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: [
        {
          label: 'in context',
          render: () =>
            frameFor(
              'nat/v31/habblet-content-info',
              box(`<div class="box-tabs-container clearfix">
    <h2>Habbos</h2>
    <ul class="box-tabs"><li class="selected"><a href="#">Search Habbos</a><span class="tab-spacer"></span></li></ul>
  </div>
  <div class="habblet-content-info">
    <a name="habbo-search">Type in the first characters of the name to search for other Habbos.</a>
  </div>
  <div class="box-content"><p class="last">Results appear here.</p></div>`),
            ),
        },
      ],
    }),
    specimen({
      id: 'nat/v31/habblet-button-row',
      classes: 'habblet-button-row',
      purpose: 'Padded row that closes a habblet, holding its action buttons.',
      sources: [STYLE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: [
        {
          label: 'with buttons',
          render: () =>
            frameFor(
              'nat/v31/habblet-button-row',
              box(`<h2 class="title">Invite Friends</h2>
  <div class="box-content"><p class="last">Send a link and earn a badge.</p></div>
  <div class="habblet-button-row clearfix">
    ${newButton('', 'Invite friend(s)')}
    ${newButton('dark-button', 'Cancel')}
  </div>`),
            ),
        },
      ],
    }),
    specimen({
      id: 'nat/v31/habblet-close',
      classes: 'h2.title > span.habblet-close',
      purpose: 'The 15px close cross pinned to the right of a habblet\u2019s title strip.',
      sources: [STYLE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: [
        {
          label: 'closeable habblet',
          render: () =>
            frameFor(
              'nat/v31/habblet-close',
              box(`<h2 class="title">Daily Rewards<span class="habblet-close"></span></h2>
  <div class="box-content"><p class="last">The cross is an empty span carrying close_x.gif.</p></div>`),
            ),
        },
      ],
    }),
  ],
});

// ---- 4. buttons -------------------------------------------------------------

const buttons = section({
  id: 'nat/v31/buttons',
  title: 'new-button',
  blurb:
    'The V31 action button, and a neat piece of pre-border-radius engineering: <b> is the left cap plus the stretchy body, <i> is an absolutely positioned 3px right cap. Both are slices of one 256\u00d7200 sprite, so a colour is just a vertical offset.',
  specimens: [
    specimen({
      id: 'nat/v31/new-button',
      classes: 'a.new-button > b + i',
      purpose: 'Default button. Colour modifiers move the sprite: dark -50px, red -100px, green -150px.',
      sources: [BUTTONS, CAPTURE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: [
        { label: 'default', classes: 'new-button', render: () => frameFor('nat/v31/new-button', buttonRow(newButton('', 'Search')), BTN_W) },
        { label: 'dark', classes: 'new-button dark-button', render: () => frameFor('nat/v31/new-button/dark', buttonRow(newButton('dark-button', 'Cancel')), BTN_W) },
        { label: 'red', classes: 'new-button red-button', render: () => frameFor('nat/v31/new-button/red', buttonRow(newButton('red-button', 'Delete')), BTN_W) },
        { label: 'green', classes: 'new-button green-button', render: () => frameFor('nat/v31/new-button/green', buttonRow(newButton('green-button', 'Save')), BTN_W) },
      ],
      note: 'Frames narrowed to 260px for legibility — the button is float:right, so at the real 460px column width it sits alone against a wide empty well.',
      pseudo: [
        { name: ':hover b', effect: 'Sprite drops 25px to the lit row of the same colour.' },
        { name: '.disabled-button:hover b', effect: 'Pinned back to the unlit row \u2014 disabled buttons do not light up.' },
      ],
    }),
    specimen({
      id: 'nat/v31/new-button-disabled',
      classes: 'a.new-button.disabled-button',
      purpose: 'Disabled state: 50% opacity and a default cursor, with four vendor spellings of opacity for 2009 browsers.',
      sources: [BUTTONS],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: [
        { label: 'enabled', classes: 'new-button green-button', render: () => frameFor('nat/v31/nb-enabled', buttonRow(newButton('green-button', 'Save')), BTN_W) },
        { label: 'disabled', classes: 'new-button green-button disabled-button', render: () => frameFor('nat/v31/nb-disabled', buttonRow(newButton('green-button disabled-button', 'Save')), BTN_W) },
      ],
    }),
    specimen({
      id: 'nat/v31/new-button-icons',
      classes: 'a.new-button.{edit|save|cancel|search|envelope|purse|newtopic}-icon',
      purpose: 'Icon variants: an empty <span> carrying a 16px slice of button_icons2.png, plus reduced padding on <b>.',
      sources: [BUTTONS],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note:
        'Markup DERIVED FROM THE CSS, not from a capture: the rules only say `a.new-button.edit-icon span` and `\u2026 b`, both float:left, so the span precedes the b. The capture only ever shows the icon-less form.',
      variants: [
        {
          label: 'all seven',
          render: () =>
            frameFor(
              'nat/v31/new-button-icons',
              buttonRow(
                newButton('search-icon', 'Search', true),
                newButton('edit-icon', 'Edit', true),
                newButton('save-icon green-button', 'Save', true),
                newButton('cancel-icon red-button', 'Cancel', true),
                newButton('envelope-icon', 'Message', true),
                newButton('purse-icon', 'Credits', true),
                newButton('newtopic-icon dark-button', 'New topic', true),
              ),
            ),
        },
      ],
    }),
  ],
});

// ---- 5. tooltips ------------------------------------------------------------

const tooltips = section({
  id: 'nat/v31/tooltips',
  title: 'Tooltips',
  blurb:
    'Two speech-bubble callouts, each built from exactly two slices: a top cap on the title and a bottom-anchored body on the content, so the bubble grows downward without stretching its tail.',
  specimens: [
    specimen({
      id: 'nat/v31/bubbletip',
      classes: 'div.bubbletip > div.title + div.content',
      purpose: 'The white 308px bubble. div.title carries bubble-top.png, div.content bubble-bottom.png anchored bottom-left.',
      sources: [TOOLTIPS],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note:
        'Structure DERIVED FROM THE SELECTORS (no capture of this widget was found), and div.title is a SPACER, not a text slot: bubble-top.png is the bubble\u2019s rounded top cap, anchored to the BOTTOM of div.title, so any text put there renders above the cap and outside the bubble. redtip states the same thing outright with `height:10px; padding:0`. All copy belongs in div.content.',
      variants: [
        {
          label: 'right tail',
          classes: 'bubbletip',
          render: () =>
            frameFor(
              'nat/v31/bubbletip',
              `<div class="bubbletip">
  <div class="title"></div>
  <div class="content">Your Habbo has been waiting. The tail sits at the bottom of the content slice.</div>
</div>`,
            ),
        },
        {
          label: 'left tail',
          classes: 'bubbletip left',
          note: 'The .left modifier swaps only the bottom slice, and it mirrors the tail\u2019s SLANT, not its position \u2014 the tail stays at the same x, but its vertical edge moves from the left of the notch to the right.',
          render: () =>
            frameFor(
              'nat/v31/bubbletip-left',
              `<div class="bubbletip left">
  <div class="title"></div>
  <div class="content">Same bubble, tail mirrored to the left edge.</div>
</div>`,
            ),
        },
        {
          label: 'text in .title (wrong)',
          classes: 'bubbletip',
          note: 'What the mistake looks like: the heading floats above the cap, outside the bubble.',
          render: () =>
            frameFor(
              'nat/v31/bubbletip-wrong',
              `<div class="bubbletip">
  <div class="title">Welcome back</div>
  <div class="content">The heading above has escaped the bubble.</div>
</div>`,
            ),
        },
      ],
    }),
    specimen({
      id: 'nat/v31/redtip',
      classes: 'div.redtip > div.title + div.content',
      purpose: 'The red error/alert bubble: white ink, and a title slice fixed at 10px with no padding.',
      sources: [TOOLTIPS],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note:
        'Its art is 270px wide but div.redtip is 308px, so the right 38px of the bubble is unpainted. That is in the reference itself, not something the catalog introduced \u2014 red-top.png and red-bottom.png really are 270\u00d710 and 270\u00d7300.',
      variants: [
        {
          label: 'default',
          classes: 'redtip',
          render: () =>
            frameFor(
              'nat/v31/redtip',
              `<div class="redtip">
  <div class="title"></div>
  <div class="content">That name is already taken. Try another.</div>
</div>`,
            ),
        },
        {
          label: 'beside bubbletip',
          classes: 'redtip / bubbletip',
          note: 'Same width declared, different art width.',
          render: () =>
            frameFor(
              'nat/v31/redtip-compare',
              `<div class="bubbletip">
  <div class="title">Bubbletip</div>
  <div class="content">308px art, fills the declared width.</div>
</div>
<div class="redtip">
  <div class="title"></div>
  <div class="content">270px art in a 308px box.</div>
</div>`,
              { width: 360 },
            ),
        },
      ],
    }),
  ],
});

// ---- 6. windows (dialogs & modals) ------------------------------------------

const BOXES = 'havana-v31/…/v2/styles/boxes.css';
const LIGHTWINDOW = 'havana-v31/…/v2/styles/lightwindow.css';

function dialogGrey(inner, hasExit = false) {
  return `<div class="dialog-grey">
  <div class="dialog-grey-top"><div><h3><span>Dialog Title</span>${hasExit ? '<a class="dialog-grey-exit" href="#">×</a>' : ''}</h3></div></div>
  <div class="dialog-grey-content"><div class="dialog-grey-body">
${inner}
  </div></div>
  <div class="dialog-grey-bottom"><div></div></div>
</div>`;
}

function dialogGreytab(inner, hasExit = false) {
  return `<div class="dialog-greytab">
  <div class="dialog-greytab-top"><div><h3><span>Tabbed Dialog</span>${hasExit ? '<a class="dialog-greytab-exit" href="#">×</a>' : ''}</h3></div></div>
  <div class="dialog-greytab-tabs">
    <div class="dialog-greytab-tabs-content">
      <ul>
        <li><a href="#">Search</a></li>
        <li class="selected"><a href="#">Browse</a></li>
      </ul>
    </div>
  </div>
  <div class="dialog-greytab-tabs-bottom"><div></div></div>
  <div class="dialog-greytab-content"><div class="dialog-greytab-body">
${inner}
  </div></div>
  <div class="dialog-greytab-bottom"><div></div></div>
</div>`;
}

const windows = section({
  id: 'nat/v31/windows',
  title: 'Windows',
  blurb:
    'Dialogue boxes and modals: dialog-grey for simple dialogs, dialog-greytab for tabbed variants, and lightwindow for modal overlays. All drawn with sprite corners and side borders from a single sheet.',
  specimens: [
    specimen({
      id: 'nat/v31/dialog-grey',
      classes: 'dialog-grey > top / content / bottom',
      purpose: 'The base dialog window. Nested divs build the rounded frame: .dialog-grey-top/.bottom carry corner slices, .dialog-grey-content the sides, .dialog-grey-body the inner content.',
      sources: [BOXES, CAPTURE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: [
        {
          label: 'untitled',
          classes: 'dialog-grey',
          render: () => frameFor('nat/v31/dialog-grey', dialogGrey('<p class="last">Dialog content. No title.</p>'), { width: 420 }),
        },
        {
          label: 'titled',
          classes: 'dialog-grey',
          render: () => frameFor('nat/v31/dialog-grey-titled', dialogGrey('<p class="last">A titled dialog. The crimson strip is the .dialog-grey-top span.</p>'), { width: 420 }),
        },
        {
          label: 'with exit button',
          classes: 'dialog-grey',
          render: () => frameFor('nat/v31/dialog-grey-exit', dialogGrey('<p class="last">The × in the top-right is an absolutely positioned exit link.</p>', true), { width: 420 }),
        },
      ],
    }),
    specimen({
      id: 'nat/v31/dialog-greytab',
      classes: 'dialog-greytab > top / tabs / content / bottom',
      purpose: 'Tabbed dialog variant. Replaces .dialog-grey-content with a tabbed interface using the same .dialog-greytab-tabs structure as in boxes.',
      sources: [BOXES, CAPTURE],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note: 'The tab strip is drawn from one sprite (greytab-tab-l.gif, greytab-tab-r.gif), re-offset per state. This is identical to the tabs in the box family, just wrapped in a dialog window instead of a habblet.',
      variants: [
        {
          label: 'default',
          classes: 'dialog-greytab',
          render: () => frameFor('nat/v31/dialog-greytab', dialogGreytab('<p class="last">Tab content. The Search tab is idle, Browse is selected.</p>'), { width: 420 }),
        },
        {
          label: 'with exit',
          classes: 'dialog-greytab',
          render: () => frameFor('nat/v31/dialog-greytab-exit', dialogGreytab('<p class="last">Tabbed dialog with a close button pinned to the header.</p>', true), { width: 420 }),
        },
      ],
    }),
    specimen({
      id: 'nat/v31/splashmessage',
      classes: 'div.splashmessage',
      purpose: 'A flash message box: absolutely positioned overlay with a 1px border and 3px padding. Used for system notifications.',
      sources: [BOXES],
      sourcesLabel: 'defined in',
      stage: 'frame',
      variants: [
        {
          label: 'positioned',
          classes: 'splashmessage',
          render: () =>
            frameFor(
              'nat/v31/splashmessage',
              `<div class="splashmessage" style="position: relative; left: 0; top: 0; border: 1px solid #ccc; padding: 3px; background-color: #fff;">
  ✓ Your changes have been saved!
</div>`,
              { width: 300, height: 120 },
            ),
        },
      ],
    }),
    specimen({
      id: 'nat/v31/lightwindow',
      classes: '#lightwindow_overlay / #lightwindow',
      purpose: 'Modal overlay and window container. The overlay is a full-screen semi-transparent backdrop; the window floats above it with a title bar, navigation, and content.',
      sources: [LIGHTWINDOW],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note:
        'The lightwindow system is JavaScript-driven (show/hide via display:none) and uses absolute positioning. A specimen shows the static markup structure when visible. Navigation (prev/next) is meant for galleries but often hidden; the title bar and close button are universal.',
      variants: [
        {
          label: 'basic window',
          classes: '#lightwindow_overlay / #lightwindow_container',
          render: () =>
            frameFor(
              'nat/v31/lightwindow',
              `<div id="lightwindow_overlay" style="display: block; visibility: visible; background: rgba(0, 0, 0, 0.5); width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 500;"></div>
<div id="lightwindow" style="display: block; visibility: visible; position: absolute; z-index: 999; top: 50px; left: 50px;">
  <div id="lightwindow_container" style="display: block; visibility: visible; position: absolute;">
    <div id="lightwindow_title_bar" style="background-color: #000000; height: 25px; overflow: hidden;">
      <div id="lightwindow_title_bar_title" style="color: #ffffbe; font-size: 14px; line-height: 25px; text-align: left; float: left;">Gallery</div>
      <a id="lightwindow_title_bar_close_link" href="#" style="float: right; text-align: right; cursor: pointer; color: #ffffbe; line-height: 25px; padding-right: 5px;">×</a>
    </div>
    <div id="lightwindow_contents" style="border: 10px solid #ffffff; background-color: #ffffff; padding: 10px; width: 300px;">
      <div id="lightwindow_data_slide_inner">
        <p>Content loaded here. The border and white background are required styles.</p>
      </div>
    </div>
  </div>
</div>`,
              { width: 500, height: 300 },
            ),
        },
      ],
    }),
  ],
});

// ---- 7. form inputs ---------------------------------------------------------

const REGISTRATION = 'havana-v31/…/v2/styles/registration.css';
const STYLE_CSS = 'havana-v31/…/v2/styles/style.css';

const formInputs = section({
  id: 'nat/v31/form-inputs',
  title: 'Form inputs',
  blurb:
    'Text fields, checkboxes, radios, and selects. V31 uses minimal styling — borders are 1px solid, backgrounds white or light grey, font is inherited.',
  specimens: [
    specimen({
      id: 'nat/v31/input-text',
      classes: 'input.register-text',
      purpose: 'Standard text input field. 1px white border, 3px padding.',
      sources: [REGISTRATION],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note: 'The register-text class is 230px wide; register-text.wide is 265px.',
      variants: [
        {
          label: 'default',
          classes: 'input',
          render: () =>
            frameFor(
              'nat/v31/input-text',
              `<form style="padding: 10px;">
  <label for="username">Username:</label><br />
  <input type="text" id="username" class="register-text" value="" />
  <br /><br />
  <label for="email">Email:</label><br />
  <input type="text" id="email" class="register-text wide" value="" />
</form>`,
              { width: 400, height: 140 },
            ),
        },
        {
          label: 'with error',
          classes: 'input.error',
          render: () =>
            frameFor(
              'nat/v31/input-text-error',
              `<form style="padding: 10px;">
  <label for="bad">Invalid input:</label><br />
  <input type="text" id="bad" class="register-text error" value="taken" />
  <p style="color: #f18f9b; font-size: 11px; margin: 3px 0;">That username is taken.</p>
</form>`,
              { width: 400, height: 120 },
            ),
        },
      ],
    }),
    specimen({
      id: 'nat/v31/input-checkbox',
      classes: 'input[type="checkbox"]',
      purpose: 'Native checkbox. No custom styling in V31.',
      sources: [REGISTRATION, STYLE_CSS],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note: 'Styled minimally: the browser default checkbox with a label beside it.',
      variants: [
        {
          label: 'default',
          classes: 'input',
          render: () =>
            frameFor(
              'nat/v31/input-checkbox',
              `<form style="padding: 10px;">
  <label>
    <input type="checkbox" name="terms" /> I agree to the Terms of Service
  </label>
  <br /><br />
  <label>
    <input type="checkbox" name="newsletter" checked /> Subscribe to newsletter
  </label>
</form>`,
              { width: 350, height: 120 },
            ),
        },
      ],
    }),
    specimen({
      id: 'nat/v31/input-radio',
      classes: 'input[type="radio"]',
      purpose: 'Native radio button. No custom styling in V31.',
      sources: [REGISTRATION, STYLE_CSS],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note: 'Styled minimally: the browser default radio button with labels.',
      variants: [
        {
          label: 'default',
          classes: 'input',
          render: () =>
            frameFor(
              'nat/v31/input-radio',
              `<form style="padding: 10px;">
  <fieldset style="border: none; padding: 0;">
    <legend>Choose an option:</legend>
    <label>
      <input type="radio" name="choice" value="a" /> Option A
    </label>
    <br />
    <label>
      <input type="radio" name="choice" value="b" checked /> Option B
    </label>
    <br />
    <label>
      <input type="radio" name="choice" value="c" /> Option C
    </label>
  </fieldset>
</form>`,
              { width: 300, height: 140 },
            ),
        },
      ],
    }),
    specimen({
      id: 'nat/v31/input-select',
      classes: 'select',
      purpose: 'Native select dropdown. No custom styling in V31.',
      sources: [REGISTRATION, STYLE_CSS],
      sourcesLabel: 'defined in',
      stage: 'frame',
      note: 'Styled with browser default appearance.',
      variants: [
        {
          label: 'default',
          classes: 'select',
          render: () =>
            frameFor(
              'nat/v31/input-select',
              `<form style="padding: 10px;">
  <label for="country">Country:</label><br />
  <select id="country" name="country" style="border: 1px solid #ccc; padding: 3px; width: 200px;">
    <option value="">-- Select --</option>
    <option value="nl">Netherlands</option>
    <option value="us">United States</option>
    <option value="uk">United Kingdom</option>
    <option value="de">Germany</option>
    <option value="fr">France</option>
  </select>
</form>`,
              { width: 350, height: 120 },
            ),
        },
      ],
    }),
  ],
});

export function v31Sections() {
  return [boxes, themes, habblets, buttons, tooltips, windows, formInputs];
}

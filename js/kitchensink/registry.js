// Kitchen-sink registry — the catalog's only rendering primitive.
//
// Every entry in the component catalog is a SPECIMEN: one selector, rendered in
// the smallest amount of real context it needs to look like itself, framed with
//
//   - its catalog ID       ks/<layer>/<name>, also the element id and #hash
//   - its real class string exactly what you would type into markup
//   - its variants/states   laid out side by side, each captioned with the
//                           class string that produces it
//
// The frame is deliberately NOT built from the kit. Catalog chrome is plain
// sans over dark panels (styles live in kitchen-sink.html under .ks-*); kit
// output is Volter pixel type inside a .ks-stage. If you cannot tell at a
// glance whether you are looking at the catalog or at the component, the frame
// has failed.
//
// Nothing here writes to css/. The catalog observes the kit, it never patches
// it, so a specimen that looks wrong is a real finding about the kit.

// <ns>/<layer>/<name> — lowercase, digits and dashes in the name.
//   ks/…   our own kit          (kitchen-sink.html)
//   nat/…  native Habbo reference (native-sink.html), where <layer> is the era
// Two catalogs, one primitive: the frame that labels a specimen is the same
// whether the CSS being shown is ours or Sulake's.
const ID_RE = /^(?:ks|nat)\/[a-z0-9]+\/[a-z0-9-]+$/;

// ---- tiny DOM helpers -------------------------------------------------------

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

// Accept an HTML string OR a live node from a variant's render().
function toNode(content) {
  if (content == null) return document.createTextNode('');
  if (content instanceof Node) return content;
  const box = document.createElement('div');
  box.style.display = 'contents'; // never a layout box of its own
  box.innerHTML = String(content);
  return box;
}

// ---- stages -----------------------------------------------------------------
//
// A stage is the surface a specimen is shown ON, chosen to match where the
// component actually lives in the game. Getting this wrong is how a catalog
// starts lying: .hd-pill on the navy wallpaper reads fine and is still wrong,
// because in the app it only ever sits on a white card body.

const STAGES = {
  // the navy starfield, which is what <body class="hd-page"> already paints
  page: (inner) => el('div', { class: 'ks-stage ks-stage--page hd-ui' }, inner),

  // Same surface with NO .hd-ui, for the two specimens whose whole point is
  // what .hd-ui and .hd-page themselves do. Staging those inside .hd-ui would
  // show the effect already applied and prove nothing.
  bare: (inner) => el('div', { class: 'ks-stage ks-stage--page' }, inner),

  // the component's real host: a white card body
  card: (inner) =>
    el(
      'div',
      { class: 'ks-stage ks-stage--page hd-ui' },
      el('div', { class: 'hd-card' }, el('div', { class: 'hd-card-body' }, inner)),
    ),

  // For specimens that carry their own document (native-sink.html renders each
  // one in an iframe, so 2009 CSS cannot reach the catalog chrome and vice
  // versa). No .hd-ui and no wallpaper: the frame supplies its own surface.
  frame: (inner) => el('div', { class: 'ks-stage ks-stage--frame' }, inner),

  // For position:fixed components (.dr-backdrop, .dr-dock). A transform on the
  // stage makes it the containing block, so a viewport-fixed child is pinned to
  // the frame instead of escaping over the whole catalog. The component's own
  // CSS is untouched; only what "viewport" means to it changes.
  contain: (inner) => el('div', { class: 'ks-stage ks-stage--contain hd-ui' }, inner),
};

// ---- specimen ---------------------------------------------------------------

/**
 * Render one component as a labelled, addressable catalog frame.
 *
 * @param {object} spec
 * @param {string}   spec.id        catalog ID, `ks/<layer>/<name>` (throws otherwise)
 * @param {string}   spec.classes   the real class string, e.g. `hd-btn hd-btn--green`
 * @param {string}   spec.purpose   one line: what this selector is for
 * @param {'used'|'spare'} [spec.status='used']
 *        `spare` marks a selector the audit found with no caller in the repo
 *        (docs/ui-inventory.md). It is a fact about the tree, not a verdict.
 * @param {string[]} [spec.sources] files that use it (from the audit)
 * @param {string} [spec.sourcesLabel='used by']
 *        What `sources` means. The native catalog shows where a selector is
 *        DEFINED (a reference stylesheet), not who calls it, and mislabelling
 *        that would misrepresent the reference tree.
 * @param {string}   [spec.note]    a caveat about how the catalog had to stage it
 * @param {'page'|'card'|'contain'} [spec.stage='page']
 * @param {string}   [spec.highlight]
 *        CSS selector inside the render; the match gets a dashed catalog ring so
 *        a child selector can be pointed at inside its real parent.
 * @param {Array<{label:string, classes?:string, note?:string, render:Function}>} spec.variants
 *        Rendered side by side. `classes` defaults to spec.classes.
 * @param {Array<{name:string, effect:string}>} [spec.pseudo]
 *        Pointer/keyboard states that cannot be shown statically. Documented
 *        rather than faked: re-declaring `:hover` here would fork the kit.
 * @returns {HTMLElement}
 */
export function specimen(spec) {
  const {
    id,
    classes,
    purpose,
    status = 'used',
    sources = [],
    note = '',
    sourcesLabel = 'used by',
    stage = 'page',
    highlight = '',
    variants = [],
    pseudo = [],
  } = spec;

  if (!ID_RE.test(id || '')) {
    throw new Error(`specimen: id must look like ks/<layer>/<name>, got ${JSON.stringify(id)}`);
  }
  if (!variants.length) throw new Error(`specimen ${id}: needs at least one variant`);
  const makeStage = STAGES[stage];
  if (!makeStage) throw new Error(`specimen ${id}: unknown stage ${JSON.stringify(stage)}`);

  const article = el('article', { class: 'ks-spec', id, 'data-status': status });

  // ---- head: the address, the status, the copy affordance
  const idLink = el('a', { class: 'ks-spec-id', href: `#${id}` }, id);
  const head = el(
    'header',
    { class: 'ks-spec-head' },
    el('h3', { class: 'ks-spec-title' }, idLink),
    status === 'spare'
      ? el('span', { class: 'ks-tag', title: 'No caller found in the repo (docs/ui-inventory.md)' }, 'SPARE')
      : null,
    el(
      'button',
      {
        type: 'button',
        class: 'ks-copy',
        'aria-label': `Copy catalog ID ${id}`,
        onclick: () => copyId(id, idLink),
      },
      'Copy ID',
    ),
  );

  // ---- the real class string, the thing you actually type
  const classLine = el(
    'p',
    { class: 'ks-spec-classline' },
    el('span', { class: 'ks-key' }, 'class'),
    el('code', { class: 'ks-code' }, classes),
  );

  article.append(head, el('p', { class: 'ks-spec-purpose' }, purpose), classLine);

  article.append(
    el(
      'p',
      { class: 'ks-spec-sources' },
      el('span', { class: 'ks-key' }, sourcesLabel),
      sources.length
        ? sources.map((f, i) => [i ? ', ' : '', el('code', { class: 'ks-code ks-code--file' }, f)]).flat()
        : el('span', { class: 'ks-spec-nocaller' }, 'nothing in this repo'),
    ),
  );

  if (note) article.append(el('p', { class: 'ks-spec-note' }, note));

  // ---- variants, side by side
  const rack = el('div', { class: 'ks-variants' });
  for (const v of variants) {
    const inner = toNode(v.render());
    const staged = makeStage(inner);
    if (highlight) {
      const target = staged.querySelector(highlight);
      if (target) target.classList.add('ks-hi');
    }
    rack.append(
      el(
        'figure',
        { class: 'ks-variant' },
        staged,
        el(
          'figcaption',
          { class: 'ks-variant-cap' },
          el('span', { class: 'ks-variant-label' }, v.label),
          el('code', { class: 'ks-code ks-code--sm' }, v.classes || classes),
          v.note ? el('span', { class: 'ks-variant-note' }, v.note) : null,
        ),
      ),
    );
  }
  article.append(rack);

  // ---- pointer/keyboard states we refuse to fake
  if (pseudo.length) {
    const list = el('dl', { class: 'ks-pseudo' });
    for (const p of pseudo) {
      list.append(el('dt', {}, el('code', { class: 'ks-code ks-code--sm' }, p.name)), el('dd', {}, p.effect));
    }
    article.append(
      el('div', { class: 'ks-pseudo-wrap' }, el('p', { class: 'ks-pseudo-head' }, 'Interactive states'), list),
    );
  }

  return article;
}

// ---- section ----------------------------------------------------------------

/**
 * Group specimens under one heading. The id is what the sticky nav links to.
 * @param {{id:string, title:string, blurb?:string, specimens:HTMLElement[]}} spec
 */
export function section({ id, title, blurb = '', specimens = [] }) {
  if (!ID_RE.test(id || '')) {
    throw new Error(`section: id must look like ks/<layer>/<name>, got ${JSON.stringify(id)}`);
  }
  const sec = el(
    'section',
    { class: 'ks-section', id, 'aria-labelledby': `${id}::h` },
    el(
      'div',
      { class: 'ks-section-head' },
      el('h2', { class: 'ks-section-title', id: `${id}::h` }, title),
      el('code', { class: 'ks-code ks-code--sm' }, id),
    ),
    blurb ? el('p', { class: 'ks-section-blurb' }, blurb) : null,
  );
  sec.append(...specimens);
  sec.dataset.title = title;
  sec.dataset.count = String(specimens.length);
  return sec;
}

// ---- copy-to-clipboard ------------------------------------------------------

let statusRegion = null;

function say(message) {
  if (statusRegion) statusRegion.textContent = message;
}

async function copyId(id, fallbackNode) {
  try {
    await navigator.clipboard.writeText(id);
    say(`Copied ${id}`);
  } catch {
    // file:// and non-secure origins refuse the clipboard. Select the text so
    // the keyboard route still works instead of failing silently.
    const range = document.createRange();
    range.selectNodeContents(fallbackNode);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    say(`${id} selected. Press Ctrl+C to copy.`);
  }
}

// ---- catalog shell ----------------------------------------------------------

/**
 * Mount sections into `main` and build the sticky nav in `nav`.
 * Returns { sections } so a caller can assert on what rendered.
 */
export function renderCatalog({ nav, main, status }, sections) {
  statusRegion = status || null;

  const list = el('ul', { class: 'ks-nav-list' });
  for (const sec of sections) {
    main.append(sec);
    list.append(
      el(
        'li',
        { class: 'ks-nav-item' },
        el(
          'a',
          { class: 'ks-nav-link', href: `#${sec.id}`, 'data-for': sec.id },
          el('span', { class: 'ks-nav-text' }, sec.dataset.title),
          el('span', { class: 'ks-nav-count' }, sec.dataset.count),
        ),
      ),
    );
  }
  nav.append(list);

  // Mark the section currently in view. aria-current carries it for assistive
  // tech; the class is only the visual echo.
  const links = new Map([...list.querySelectorAll('.ks-nav-link')].map((a) => [a.dataset.for, a]));
  let current = null;
  const setCurrent = (id) => {
    if (id === current) return;
    if (current && links.get(current)) {
      links.get(current).classList.remove('is-current');
      links.get(current).removeAttribute('aria-current');
    }
    current = id;
    const link = links.get(id);
    if (link) {
      link.classList.add('is-current');
      link.setAttribute('aria-current', 'true');
    }
  };

  if ('IntersectionObserver' in window) {
    const seen = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.intersectionRatio);
        let best = null;
        let bestRatio = 0;
        for (const [id, ratio] of seen) {
          if (ratio > bestRatio) {
            best = id;
            bestRatio = ratio;
          }
        }
        if (best) setCurrent(best);
      },
      { threshold: [0, 0.01, 0.2, 0.5, 1] },
    );
    sections.forEach((s) => io.observe(s));
  }
  setCurrent(sections[0] && sections[0].id);

  return { sections };
}

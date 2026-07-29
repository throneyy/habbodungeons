// The native-sink sandbox: one <iframe> per specimen.
//
// WHY AN IFRAME, AND NOT JUST A <link> ON THE PAGE
//
// The V31 sheets are 2009 code that styles bare elements — `body`, `p`, `h2`,
// `ul`, `li`, `a`, `input` — and `style.css` alone is 75 KB of it. Loading it
// into the catalog document would restyle the catalog's own chrome, and the
// catalog's chrome would in turn leak into the specimens. Either way you would
// no longer be looking at native Habbo UI, which is the one thing this page
// exists to show.
//
// So every specimen gets its own document. Inside it the reference sheets are
// the ONLY stylesheets, loaded in the order a real habbo.com page loaded them,
// and the markup sits in the real page skeleton. What you see is what the
// cascade actually produced in 2009.
//
// READ-ONLY, NEVER COPIED
//
// The <link> hrefs point straight at tools/reference/. Nothing is copied into
// hub/css, and this page never writes to the reference tree. If the tree is
// absent (it is gitignored — Sulake's copyright), the frame says so instead of
// rendering a silently unstyled box.
//
// ART AUDIT
//
// 69 url() references in the core sheets do not resolve, so a specimen can look
// structurally right and still be missing its pixels. After load, each frame
// probes every background-image and <img> it actually uses and reports what
// failed. That is a live check of this specimen's art, not a claim copied from
// a manifest.

const REF = '/tools/reference/havana-v31/web-gallery/v2';

// The three sheets this catalog covers, in the order habbo.com loaded them.
// Order matters: buttons.css and tooltips.css both rely on style.css first.
export const SHEETS = [`${REF}/styles/style.css`, `${REF}/styles/buttons.css`, `${REF}/styles/tooltips.css`];

let seq = 0;
const pending = new Map();

// One listener for every frame; each reports under its own token.
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.type !== 'nat-art') return;
  const entry = pending.get(d.token);
  if (entry) entry(d);
});

/**
 * Build the sandbox document for one specimen.
 *
 * `markup` is dropped inside the real page skeleton:
 *   #container > #content.clearfix > #column1.column
 * This is not decoration. `#content` is REQUIRED — style.css only assigns the
 * rounded-box art under it (`#content .bt { background-image: … }`), so the
 * same markup outside `#content` renders with no corners at all. Reproducing
 * the skeleton is the difference between a correct specimen and a broken one.
 */
function docFor(markup, { token, background }) {
  const links = SHEETS.map((h) => `<link rel="stylesheet" href="${h}">`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">${links}
<style>
  /* Sandbox-local only: never a component rule, never a fix for the reference
     CSS. Just stops the frame from adding scrollbars or page chrome. */
  html { overflow: hidden; }
  body { margin: 0; padding: 10px; text-align: left; ${background ? '' : 'background: #fff; background-image: none;'} }
  #container, #content { padding-top: 0; }
</style></head>
<body class="clearfix">
<div id="container"><div id="content" class="clearfix"><div id="column1" class="column">
${markup}
</div></div></div>
<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};

  // Every background-image and <img> this specimen actually uses, deduped.
  function wanted() {
    var urls = new Set();
    document.querySelectorAll('*').forEach(function (n) {
      var bg = getComputedStyle(n).backgroundImage;
      if (!bg || bg === 'none') return;
      var re = /url\\((['"]?)(.*?)\\1\\)/g, m;
      while ((m = re.exec(bg))) if (!m[2].startsWith('data:')) urls.add(m[2]);
    });
    document.querySelectorAll('img[src]').forEach(function (n) { urls.add(n.src); });
    return [...urls];
  }

  function probe(u) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { res({ u: u, ok: img.naturalWidth > 0 }); };
      img.onerror = function () { res({ u: u, ok: false }); };
      img.src = u;
    });
  }

  function report() {
    var urls = wanted();
    Promise.all(urls.map(probe)).then(function (rs) {
      // A stylesheet that 404s leaves the specimen unstyled; say that plainly
      // rather than blaming the art.
      var css = [...document.styleSheets].filter(function (s) {
        try { return s.href && s.cssRules.length === 0; } catch (e) { return false; }
      }).length;
      parent.postMessage({
        type: 'nat-art',
        token: TOKEN,
        height: document.documentElement.scrollHeight,
        checked: urls.length,
        missing: rs.filter(function (r) { return !r.ok; }).map(function (r) { return r.u; }),
        deadSheets: css
      }, '*');
    });
  }

  if (document.readyState === 'complete') report();
  else window.addEventListener('load', report);
})();
<\/script>
</body></html>`;
}

/**
 * An iframe rendering `markup` against the real V31 cascade.
 *
 * @param {object} opts
 * @param {string} opts.markup      the specimen's HTML, real .tpl structure
 * @param {number} [opts.width]     frame width; 480 fits #column1's real 460px
 * @param {boolean} [opts.background] keep the page's own bg.png wallpaper
 * @param {(r:{missing:string[],checked:number,deadSheets:number})=>void} [opts.onArt]
 * @returns {HTMLIFrameElement}
 */
export function nativeFrame({ markup, width = 480, background = false, onArt } = {}) {
  const token = `nat-${++seq}`;
  const frame = document.createElement('iframe');
  frame.className = 'nat-frame';
  frame.title = 'Native V31 specimen';
  frame.setAttribute('scrolling', 'no');
  frame.style.width = `${width}px`;
  frame.style.height = '80px'; // provisional; the frame reports its real height

  pending.set(token, (d) => {
    // +2 absorbs sub-pixel rounding, which would otherwise clip a 1px border.
    frame.style.height = `${d.height + 2}px`;
    if (onArt) onArt(d);
    pending.delete(token);
  });

  frame.srcdoc = docFor(markup, { token, background });
  return frame;
}

/**
 * Guard: if the reference tree is missing, say so once, loudly, instead of
 * letting every specimen render as unstyled HTML and look like a CSS bug.
 * Resolves true when the sheets are reachable.
 */
export async function referenceAvailable() {
  try {
    const r = await fetch(SHEETS[0], { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

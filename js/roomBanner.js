// Skyrim-style "location discovered" banner: on entering a room, the room
// name fades slowly in, holds, then fades slowly out — centered near the top
// of the stage, rendered in the classic Habbo *ribbon* font.
//
// The ribbon lettering is habbofont.net's `habbo_ribbon` style (the same art
// used for the committed logo GIFs under assets/ui/logos). Room names are
// dynamic, so we point an <img> at the generator per-name and fall back to
// crispified Volter text if the art can't load (offline / blocked).

// habbofont.net/font/habbo_ribbon/{text}.gif — whole phrase, lowercased,
// spaces become '+'.
const ribbonUrl = (name) =>
  `https://habbofont.net/font/habbo_ribbon/${encodeURIComponent(
    name.trim().toLowerCase()
  ).replace(/%20/g, '+')}.gif`;

let host = null; // the single reused banner element

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.id = 'roomDiscovery';
  document.body.appendChild(host);
  return host;
}

// Fade the given room name in and out, Skyrim "location discovered" style.
export function showRoomDiscovery(name) {
  if (!name) return;
  const el = ensureHost();

  // rebuild fresh each time so the CSS animation always re-triggers
  el.innerHTML = '';
  el.classList.remove('rd-play');

  const img = document.createElement('img');
  img.className = 'rd-ribbon';
  img.alt = name;
  img.src = ribbonUrl(name);
  // ribbon art unavailable → swap in crispified Volter text (the outlined logo)
  img.onerror = () => {
    const text = document.createElement('div');
    text.className = 'rd-text hd-logo';
    text.textContent = name;
    img.replaceWith(text);
  };
  el.appendChild(img);

  // restart the animation on the next frame (reflow flushes the class removal)
  void el.offsetWidth;
  el.classList.add('rd-play');

  el.onanimationend = () => {
    el.classList.remove('rd-play');
    el.innerHTML = '';
  };
}

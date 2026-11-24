const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ cache, result, failure, dark = false, savedTheme } = {}) {
  const elements = new Map();
  const make = tag => ({
    tag, childNodes: [], listeners: {}, dataset: {},
    append(node) { this.childNodes.push(node); },
    replaceChildren(...nodes) { this.childNodes = nodes; },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, fn) { this.listeners[name] = fn; },
  });
  let ready;
  let requests = 0;
  const saved = [];
  const preference = { matches: dark, addEventListener(name, fn) { this.changed = fn; } };
  const document = {
    documentElement: make('html'),
    addEventListener(name, fn) { ready = fn; },
    getElementById(id) { if (!elements.has(id)) elements.set(id, make(id)); return elements.get(id); },
    createElement: make,
    createTextNode: text => ({ textContent: text }),
  };
  const context = vm.createContext({
    URL, AbortSignal, Date, document, matchMedia: () => preference,
    console: { error() {} },
    chrome: { storage: { local: {
      async get(key) { return key === 'theme' ? { theme: savedTheme } : { apodBasicCache: cache }; },
      async set(value) { saved.push(value); }, async remove() {},
    } } },
    async fetch() { requests++; if (failure) throw Error('offline'); return { ok: true, json: async () => result }; },
  });
  vm.runInContext(fs.readFileSync('popup.js', 'utf8'), context);
  // Rendering helpers are isolated here; these tests exercise control flow and media selection.
  context.parseHTML = value => ({
    body: { textContent: value || '', childNodes: [] },
    querySelector(selector) { return selector === 'img' && value === 'gif' ? { getAttribute: () => 'https://example.org/animated.gif' } : null; },
    querySelectorAll() { return []; },
  });
  return { context, document, elements, preference, saved, ready: () => ready(), requests: () => requests };
}
const entry = { title: 'A planet', date: '2026-11-22', explanation: 'Details', media_type: 'image', hdurl: 'https://example.org/image.jpg' };

test('YouTube entries show only a watch link without a hosted player', async () => {
  const app = setup({ result: [{ ...entry, media_type: 'video', url: 'https://youtu.be/uCbpHh_rTgc' }] });
  await app.ready();
  const media = app.elements.get('apod-media').childNodes;
  assert.equal(media.length, 1);
  assert.equal(media[0].tag, 'a');
  assert.equal(media[0].href, 'https://www.youtube.com/watch?v=uCbpHh_rTgc');
  assert.equal(media[0].target, '_blank');
});

test('direct videos retain native controls and Vimeo retains its embedded player', async () => {
  for (const [url, tag] of [['https://example.org/movie.mp4', 'video'], ['https://vimeo.com/123456', 'iframe']]) {
    const app = setup({ result: [{ ...entry, hdurl: null, media_type: 'video', url }] });
    await app.ready();
    const player = app.elements.get('apod-media').childNodes[0];
    assert.equal(player.tag, tag);
    if (tag === 'video') assert.equal(player.controls, true);
    else assert.equal(player.src, 'https://player.vimeo.com/video/123456');
  }
});

test('fetches new list API, renders image and saves versioned cache', async () => {
  const app = setup({ result: [entry] });
  await app.ready();
  assert.equal(app.requests(), 1);
  assert.equal(app.elements.get('apod-title').textContent, entry.title);
  assert.equal(app.elements.get('apod-media').childNodes[0].childNodes[0].src, entry.hdurl);
  assert.equal(app.saved[0].apodBasicCache.data.title, entry.title);
});
test('uses fresh cache without requesting NASA', async () => {
  const app = setup({ cache: { data: entry, timestamp: Date.now() } });
  await app.ready();
  assert.equal(app.requests(), 0);
});
test('offline uses stale cache and offers retry', async () => {
  const app = setup({ cache: { data: entry, timestamp: 1 }, failure: true });
  await app.ready();
  assert.match(app.elements.get('status').textContent, /last saved/);
  assert.equal(app.elements.get('retry').hidden, false);
});
test('rejects empty API list with retry', async () => {
  const app = setup({ result: [] });
  await app.ready();
  assert.match(app.elements.get('status').textContent, /Could not load/);
  assert.equal(app.elements.get('retry').hidden, false);
});
test('system theme updates live and manual override persists', async () => {
  const app = setup({ result: [entry], dark: true });
  await app.ready();
  assert.equal(app.document.documentElement.dataset.theme, 'dark');
  app.preference.matches = false;
  app.preference.changed();
  assert.equal(app.document.documentElement.dataset.theme, 'light');
  const toggle = app.elements.get('theme-toggle').listeners.click;
  toggle(); // light override
  app.preference.matches = true;
  app.preference.changed();
  assert.equal(app.document.documentElement.dataset.theme, 'light');
  toggle(); // dark override
  assert.equal(app.document.documentElement.dataset.theme, 'dark');
  toggle(); // system
  assert.equal(app.saved.at(-1).theme, 'system');
});
test('restores saved manual theme', async () => {
  const app = setup({ result: [entry], dark: true, savedTheme: 'light' });
  await app.ready();
  assert.equal(app.document.documentElement.dataset.theme, 'light');
});
test('selects GIF, direct video, supported embeds, and rejects unsafe URLs', () => {
  const { context: c } = setup();
  assert.equal(c.mediaFor({ ...entry, basic_html: 'gif' }).url, 'https://example.org/animated.gif');
  assert.equal(c.mediaFor({ media_type: 'video', video_url: 'https://example.org/movie.mp4' }).type, 'video');
  assert.equal(c.mediaFor({ media_type: 'iframe', url: 'https://youtu.be/abcdefghijk' }).url, 'https://www.youtube-nocookie.com/embed/abcdefghijk');
  assert.equal(c.embedUrl('https://vimeo.com/123456'), 'https://player.vimeo.com/video/123456');
  assert.equal(c.embedUrl('https://youtube.com.evil.org/embed/abcdefghijk'), null);
  assert.equal(c.safeUrl('javascript:alert(1)'), null);
  assert.equal(c.mediaFor({ media_type: 'iframe', url: 'https://unknown.org' }).url, undefined);
});

test('recognizes both live NASA demo iframe URLs without a protocol', () => {
  const { context: c } = setup();
  for (const id of ['uCbpHh_rTgc', 'ExGvwNuKyMc']) {
    const src = `//www.youtube.com/embed/${id}?rel=0`;
    assert.equal(c.embedUrl(src), `https://www.youtube-nocookie.com/embed/${id}`);
    c.parseHTML = () => ({
      querySelector() { return null; },
      querySelectorAll() { return [{ getAttribute: () => src }]; },
    });
    assert.equal(c.mediaFor({ media_type: 'video' }).url, `https://www.youtube-nocookie.com/embed/${id}`);
  }
  assert.equal(c.safeUrl(undefined), null);
  assert.equal(c.safeUrl(''), null);
  assert.equal(c.embedUrl('//youtube.com.evil.org/embed/uCbpHh_rTgc'), null);
});

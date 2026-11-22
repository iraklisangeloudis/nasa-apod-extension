const APOD_URL = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic?per_page=1';
const CACHE_KEY = 'apodBasicCache';
const CACHE_DURATION = 5 * 60 * 1000;

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

function parseHTML(value) {
  return new DOMParser().parseFromString(String(value || ''), 'text/html');
}

// Copy a small formatting allowlist, never insert remote HTML directly.
function appendFormatted(target, value) {
  function copy(node, parent) {
    if (node.nodeType === 3) {
      parent.append(document.createTextNode(node.textContent));
      return;
    }
    if (node.nodeType !== 1 || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG'].includes(node.tagName)) return;
    let element = parent;
    if (['A', 'BR', 'P', 'STRONG', 'B', 'EM', 'I'].includes(node.tagName)) {
      element = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === 'A') {
        const href = safeUrl(node.getAttribute('href'));
        if (href) {
          element.href = href;
          element.target = '_blank';
          element.rel = 'noopener noreferrer';
        }
      }
      parent.append(element);
    }
    node.childNodes.forEach(child => copy(child, element));
  }
  target.replaceChildren();
  parseHTML(value).body.childNodes.forEach(node => copy(node, target));
}

function embedUrl(value) {
  const safe = safeUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
    const id = url.pathname.startsWith('/embed/') ? url.pathname.split('/')[2] : url.searchParams.get('v');
    if (/^[\w-]{11}$/.test(id || '')) return `https://www.youtube-nocookie.com/embed/${id}`;
  }
  if (url.hostname === 'youtu.be' && /^[\w-]{11}$/.test(url.pathname.slice(1))) {
    return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`;
  }
  if (['vimeo.com', 'player.vimeo.com'].includes(url.hostname)) {
    const id = url.pathname.match(/\/(\d+)\/?$/)?.[1];
    if (id) return `https://player.vimeo.com/video/${id}`;
  }
  return null;
}

function mediaFor(data) {
  const html = parseHTML(data.basic_html);
  if (data.media_type === 'image') {
    const inline = safeUrl(html.querySelector('img')?.getAttribute('src'));
    const animated = inline && /\.gif(?:[?#]|$)/i.test(inline);
    return { type: 'image', url: (animated && inline) || safeUrl(data.hdurl) || inline };
  }
  const video = html.querySelector('video[src], video source[src]');
  const candidates = [video?.getAttribute('src'), data.video_url, data.hdurl, data.url];
  const direct = candidates.map(safeUrl).find(url => url && /\.(mp4|webm|ogv)(?:[?#]|$)/i.test(url));
  if (direct) return { type: 'video', url: direct };
  const frames = [...html.querySelectorAll('iframe[src], embed[src]')].map(node => node.getAttribute('src'));
  return { type: 'embed', url: [...frames, ...candidates].map(embedUrl).find(Boolean) };
}

document.addEventListener('DOMContentLoaded', async () => {
  const themeButton = document.getElementById('theme-toggle');
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  let theme = 'system';
  function applyTheme() {
    document.documentElement.dataset.theme = theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme;
    const label = `Theme: ${theme[0].toUpperCase()}${theme.slice(1)}`;
    document.getElementById('theme-label').textContent = label;
    themeButton.dataset.mode = theme;
    themeButton.setAttribute('aria-label', `${label}. Click to cycle system, light, and dark.`);
  }
  applyTheme();
  systemTheme.addEventListener('change', applyTheme);
  themeButton.addEventListener('click', () => {
    theme = { system: 'light', light: 'dark', dark: 'system' }[theme];
    applyTheme();
    chrome.storage.local.set({ theme }).catch(console.error);
  });
  try {
    const saved = await chrome.storage.local.get('theme');
    if (['system', 'light', 'dark'].includes(saved.theme)) theme = saved.theme;
    applyTheme();
  } catch (error) { console.error('Could not load theme:', error); }

  const status = document.getElementById('status');
  const retry = document.getElementById('retry');
  const content = document.getElementById('apod-content');
  function display(data) {
    document.getElementById('apod-title').textContent = parseHTML(data.title).body.textContent;
    document.getElementById('apod-date').textContent = data.date;
    appendFormatted(document.getElementById('apod-description'), data.explanation);
    appendFormatted(document.getElementById('apod-credit'), data.credit || data.copyright || 'See NASA for image credits and usage rights.');
    document.getElementById('apod-source').href = safeUrl(data.permalink) || safeUrl(data.url) || 'https://science.nasa.gov/apod/';
    const container = document.getElementById('apod-media');
    container.replaceChildren();
    const media = mediaFor(data);
    const fallback = () => {
      const message = document.createElement('p');
      message.textContent = 'This media cannot be shown here. Open the NASA page below to view it.';
      container.replaceChildren(message);
    };
    if (!media.url) fallback();
    else if (media.type === 'image') {
      const link = document.createElement('a');
      link.href = media.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = 'Open full-size image';
      const image = document.createElement('img');
      image.src = media.url;
      image.alt = data.alt || parseHTML(data.title).body.textContent;
      image.addEventListener('error', fallback, { once: true });
      link.append(image);
      container.append(link);
    } else {
      const player = document.createElement(media.type === 'video' ? 'video' : 'iframe');
      if (media.type === 'video') {
        player.controls = true;
        player.preload = 'metadata';
      } else {
        player.title = data.title || 'APOD video';
        player.setAttribute('allow', 'fullscreen; picture-in-picture');
        player.setAttribute('allowfullscreen', '');
        player.referrerPolicy = 'strict-origin-when-cross-origin';
      }
      player.src = media.url;
      player.addEventListener('error', fallback, { once: true });
      container.append(player);
    }
    content.hidden = false;
  }

  async function load() {
    retry.hidden = true;
    status.textContent = 'Loading the cosmos…';
    let cached;
    try {
      try { cached = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY]; }
      catch (error) { console.error('Could not read cache:', error); }
      const age = Date.now() - cached?.timestamp;
      if (cached?.data && age >= 0 && age < CACHE_DURATION) {
        display(cached.data);
        status.textContent = '';
        return;
      }
      const response = await fetch(APOD_URL, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`NASA returned HTTP ${response.status}`);
      const result = await response.json();
      const data = Array.isArray(result) ? result[0] : null;
      if (!data || typeof data.title !== 'string' || typeof data.date !== 'string' || typeof data.explanation !== 'string') {
        throw new Error('NASA returned an unexpected response');
      }
      display(data);
      status.textContent = '';
      try {
        await chrome.storage.local.set({ [CACHE_KEY]: { data, timestamp: Date.now() } });
        await chrome.storage.local.remove(['apodData', 'timestamp']);
      } catch (error) { console.error('Could not save cache:', error); }
    } catch (error) {
      console.error('Could not load APOD:', error);
      if (cached?.data) {
        display(cached.data);
        status.textContent = 'Offline or NASA unavailable. Showing the last saved picture.';
      } else status.textContent = 'Could not load APOD. Check your connection and try again.';
      retry.hidden = false;
    }
  }
  retry.addEventListener('click', load);
  await load();
});

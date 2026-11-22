// This page has no extension API access. Only a YouTube ID is accepted, never an arbitrary URL.
const videoId = new URLSearchParams(window.location.search).get('video');
if (!/^[\w-]{11}$/.test(videoId || '')) {
  document.getElementById('message').textContent = 'No valid YouTube video was selected.';
} else {
  const frame = document.createElement('iframe');
  frame.title = 'YouTube video player';
  frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allow = 'fullscreen; picture-in-picture; encrypted-media';
  frame.allowFullscreen = true;
  document.getElementById('player').replaceChildren(frame);
}

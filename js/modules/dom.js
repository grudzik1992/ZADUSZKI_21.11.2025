export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function scrollToSong(targetId, toolbar) {
  if (!targetId) return;
  const anchor = document.getElementById(targetId);
  if (!anchor) return;

  const song = anchor.closest('.song') || anchor;
  const toolbarOffset = (toolbar?.offsetHeight || 0) + 12;
  const top = song.getBoundingClientRect().top + window.scrollY;

  window.scrollTo({
    top: Math.max(top - toolbarOffset, 0),
    behavior: 'smooth',
  });

  song.classList.add('song--jump-target');
  window.setTimeout(() => song.classList.remove('song--jump-target'), 1200);
}

export function normalizeMultiline(value) {
  return (value || '').replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n');
}

export function trimTrailingEmptyLines(lines) {
  const arr = Array.isArray(lines) ? [...lines] : [];
  while (arr.length && arr[arr.length - 1].trim() === '') {
    arr.pop();
  }
  return arr.join('\n');
}

export function getElementIdSet(selector, root = document) {
  return new Set($$(selector, root).map((el) => el.id));
}

import { renumberSongs } from './songs.js';

const DRAG_CLICK_COOLDOWN = 500;

const globalDragState = {
  isDragging: false,
  justFinished: false,
  cooldownTimer: null,
};

function collectOrderIds(tocList) {
  return Array.from(tocList.querySelectorAll('li[data-target]'))
    .map((item) => item.dataset.target)
    .filter(Boolean);
}

function scheduleReset() {
  if (globalDragState.cooldownTimer) {
    clearTimeout(globalDragState.cooldownTimer);
  }
  globalDragState.cooldownTimer = setTimeout(() => {
    globalDragState.justFinished = false;
    globalDragState.cooldownTimer = null;
  }, DRAG_CLICK_COOLDOWN);
}

export function initDragDrop({ tocList, songsHost, onOrderChange, scrollToSong }) {
  if (!tocList || !songsHost) return;

  const handleOrderChange = () => {
    renumberSongs(tocList, songsHost);
    if (typeof onOrderChange === 'function') {
      onOrderChange(collectOrderIds(tocList));
    }
  };

  let dragElement = null;

  tocList.addEventListener('dragstart', (event) => {
    const li = event.target.closest('li[draggable="true"]');
    if (!li) return;

    // prevent drag when global lock is enabled
    if (document.documentElement.dataset.tocLocked === 'true') {
      event.preventDefault();
      return;
    }

    dragElement = li;
    globalDragState.isDragging = true;
    globalDragState.justFinished = false;
    if (globalDragState.cooldownTimer) {
      clearTimeout(globalDragState.cooldownTimer);
      globalDragState.cooldownTimer = null;
    }

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', li.dataset.target || '');
      } catch (error) {
        console.warn('Drag data error:', error);
      }
    }

    li.classList.add('dragging');
    const linkBtn = li.querySelector('.toc-link');
    if (linkBtn) {
      linkBtn.dataset.ignoreClick = '1';
    }
  });

  tocList.addEventListener('dragover', (event) => {
    if (!dragElement) return;
    if (document.documentElement.dataset.tocLocked === 'true') return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    const target = event.target.closest('li[draggable="true"]');
    if (!target || target === dragElement) return;

    const rect = target.getBoundingClientRect();
    const shouldInsertAfter = (event.clientY - rect.top) / rect.height > 0.5;
    tocList.insertBefore(dragElement, shouldInsertAfter ? target.nextSibling : target);
  });

  tocList.addEventListener('dragend', () => {
    if (!dragElement) return;
    dragElement.classList.remove('dragging');
    const linkBtn = dragElement.querySelector('.toc-link');
    if (linkBtn) {
      linkBtn.blur();
      setTimeout(() => delete linkBtn.dataset.ignoreClick, DRAG_CLICK_COOLDOWN);
    }

    dragElement = null;
    globalDragState.isDragging = false;
    globalDragState.justFinished = true;
    scheduleReset();
    if (document.documentElement.dataset.tocLocked !== 'true') {
      handleOrderChange();
    }
  });

  tocList.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  tocList.addEventListener('drop', (event) => event.preventDefault());

  tocList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();

    if (target.classList.contains('toc-link')) {
      if (globalDragState.isDragging || globalDragState.justFinished || target.dataset.ignoreClick === '1') {
        return;
      }

      const songId = target.dataset.target || target.closest('li')?.dataset.target;
      if (songId) {
        scrollToSong(songId);
        try {
          history.replaceState(null, '', `#${songId}`);
        } catch (error) {
          window.location.hash = songId;
        }
      }
    }
  });

  // Initial numbering sync in case order changed externally
  handleOrderChange();
}

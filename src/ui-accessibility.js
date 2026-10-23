const gameKeys = new Set(['w', 'a', 's', 'd', 'c', 'r', 'h', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]';

/** Keep the garage and dialogs usable with keyboards and assistive technology. */
export function attachUIAccessibility(root) {
  const modals = [...root.querySelectorAll('.modal-backdrop')];
  const garage = root.querySelector('#garage');
  const roomCode = root.querySelector('#room-code');
  let activeModal = null;
  let returnFocus = null;
  let lastBackgroundFocus = document.activeElement;
  const inertElements = new Map();
  const currentModal = () => [...modals].reverse().find(modal => !modal.hidden) || null;
  const isVisible = element => element?.isConnected && !element.closest('[hidden], [inert]');

  root.querySelector('[data-group="environment"]')?.setAttribute('role', 'group');
  root.querySelector('[data-group="environment"]')?.setAttribute('aria-label', 'Scenery');
  root.querySelector('[data-group="time"]')?.setAttribute('role', 'group');
  root.querySelector('[data-group="time"]')?.setAttribute('aria-label', 'Time of day');
  root.querySelector('.presets')?.setAttribute('role', 'group');
  root.querySelector('.presets')?.setAttribute('aria-label', 'Livery presets');
  root.querySelector('#session-status')?.setAttribute('role', 'status');
  root.querySelector('#room-summary')?.setAttribute('role', 'status');
  root.querySelector('#toast')?.setAttribute('aria-atomic', 'true');
  root.querySelector('#room-code')?.setAttribute('autocapitalize', 'characters');
  root.querySelector('#room-code')?.setAttribute('spellcheck', 'false');

  if (roomCode) {
    const message = document.createElement('p');
    message.id = 'room-code-error';
    message.className = 'room-sub';
    message.hidden = true;
    message.textContent = 'Enter a room code to join your friends.';
    roomCode.closest('.room-actions').after(message);
    const validateRoomCode = () => {
      const invalid = !roomCode.value.trim();
      roomCode.setAttribute('aria-invalid', String(invalid));
      message.hidden = !invalid;
      if (invalid) roomCode.setAttribute('aria-describedby', message.id);
      else roomCode.removeAttribute('aria-describedby');
    };
    root.querySelector('#join-room')?.addEventListener('click', validateRoomCode, true);
    roomCode.addEventListener('keydown', event => {
      if (event.key === 'Enter') validateRoomCode();
    }, true);
    roomCode.addEventListener('input', () => {
      roomCode.removeAttribute('aria-invalid');
      roomCode.removeAttribute('aria-describedby');
      message.hidden = true;
    });
  }

  const clearInert = () => {
    for (const [element, wasInert] of inertElements) element.inert = wasInert;
    inertElements.clear();
  };
  const syncModal = () => {
    const nextModal = currentModal();
    if (nextModal === activeModal) return;
    const previousModal = activeModal;
    clearInert();
    activeModal = nextModal;
    if (nextModal) {
      returnFocus = lastBackgroundFocus;
      for (const sibling of root.children) {
        if (sibling === nextModal || sibling.id === 'toast') continue;
        inertElements.set(sibling, sibling.inert);
        sibling.inert = true;
      }
      if (!nextModal.contains(document.activeElement)) {
        nextModal.querySelector(focusableSelector)?.focus();
      }
    } else if (previousModal && (!isVisible(document.activeElement) || previousModal.contains(document.activeElement))) {
      if (isVisible(returnFocus)) returnFocus.focus();
      else root.querySelector(garage?.hidden ? '#garage-toggle' : '#driver-name')?.focus();
      returnFocus = null;
    }
  };

  const onFocus = event => {
    const modal = currentModal();
    if (!modal) lastBackgroundFocus = event.target;
    else if (!modal.contains(event.target)) modal.querySelector(focusableSelector)?.focus();
  };
  const onKey = event => {
    if (event.ctrlKey || event.metaKey || event.altKey || !gameKeys.has(event.key.toLowerCase())) return;
    const editing = event.target.closest?.('input, select, textarea, [contenteditable="true"]');
    // Leave native scrolling, typing and Space-to-activate intact; only suppress game shortcuts.
    if (currentModal() || !garage?.hidden || editing || (event.key === ' ' && event.target.closest?.('button, a[href]'))) {
      event.stopPropagation();
    }
  };
  const observer = new MutationObserver(syncModal);
  for (const modal of modals) observer.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('focusin', onFocus);
  document.addEventListener('keydown', onKey);
  syncModal();
  return () => {
    observer.disconnect();
    document.removeEventListener('focusin', onFocus);
    document.removeEventListener('keydown', onKey);
    clearInert();
  };
}

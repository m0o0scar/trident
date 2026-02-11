import { useEffect, useRef } from 'react';

type EscapeHandler = {
  id: number;
  onEscape: () => void;
};

const escapeHandlers: EscapeHandler[] = [];
let nextEscapeHandlerId = 0;
let hasGlobalKeyListener = false;

function handleEscapeKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') {
    return;
  }

  const topHandler = escapeHandlers[escapeHandlers.length - 1];
  if (!topHandler) {
    return;
  }

  event.preventDefault();
  topHandler.onEscape();
}

function attachGlobalListener() {
  if (hasGlobalKeyListener || typeof document === 'undefined') {
    return;
  }

  document.addEventListener('keydown', handleEscapeKey);
  hasGlobalKeyListener = true;
}

function detachGlobalListenerIfUnused() {
  if (!hasGlobalKeyListener || typeof document === 'undefined' || escapeHandlers.length > 0) {
    return;
  }

  document.removeEventListener('keydown', handleEscapeKey);
  hasGlobalKeyListener = false;
}

export function useEscapeDismiss(enabled: boolean, onEscape: () => void) {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const id = ++nextEscapeHandlerId;
    escapeHandlers.push({
      id,
      onEscape: () => onEscapeRef.current(),
    });

    attachGlobalListener();

    return () => {
      const index = escapeHandlers.findIndex((handler) => handler.id === id);
      if (index >= 0) {
        escapeHandlers.splice(index, 1);
      }
      detachGlobalListenerIfUnused();
    };
  }, [enabled]);
}

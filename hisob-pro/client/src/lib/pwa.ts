/**
 * Барнома дар телефон (PWA): насб кардан ба экрани асосӣ.
 * Android/Chrome — тугмаи «Насб кардан» (beforeinstallprompt).
 * iPhone/Safari — дастур: «Мубодила» → «Ба экрани Home».
 */
import { useEffect, useReducer } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function useInstall() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return {
    canPrompt: !!deferred,
    standalone: isStandalone(),
    ios: isIOS(),
    async prompt() {
      if (!deferred) return false;
      const ev = deferred;
      await ev.prompt();
      const choice = await ev.userChoice;
      deferred = null;
      notify();
      return choice.outcome === 'accepted';
    },
  };
}

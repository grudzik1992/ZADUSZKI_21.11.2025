/* eslint-disable no-console */
if (typeof window !== 'undefined') {
  if (window.location.protocol === 'file:') {
    document
      .querySelectorAll('link[rel="manifest"]')
      .forEach((link) => link.remove());

    if (navigator.serviceWorker && !navigator.serviceWorker._guarded) {
      navigator.serviceWorker.register = () =>
        Promise.resolve({ unregister: () => Promise.resolve() });
      navigator.serviceWorker._guarded = true;
    }
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('service-worker.js')
      .then(() => console.log('✅ Service Worker zarejestrowany!'))
      .catch((error) => console.warn('❌ Błąd SW:', error));
  }
}

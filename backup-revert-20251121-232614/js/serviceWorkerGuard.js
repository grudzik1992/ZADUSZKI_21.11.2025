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
    // Do not auto-register the service worker during local development
    // (localhost / 127.x) to avoid cached assets blocking iterative testing.
    const host = window.location.hostname || '';
    if (host === 'localhost' || host === '127.0.0.1' || host === '' ) {
      console.info('Service Worker registration skipped on development host:', host);
    } else {
      navigator.serviceWorker
        .register('service-worker.js')
        .then(() => console.log('✅ Service Worker zarejestrowany!'))
        .catch((error) => console.warn('❌ Błąd SW:', error));
    }
  }
}

export function registerServiceWorker() {
  // The dev server has no built service worker
  if (process.env.NODE_ENV !== 'production') return;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Relative to the deployment root so it works wherever this is hosted
      const swUrl = new URL('service-worker.js', window.location.href).toString();
      navigator.serviceWorker
        .register(swUrl)
        .then((reg) => console.log('service worker registered', reg.scope))
        .catch((err) => console.error('service worker registration failed', err));
    });
  }
}

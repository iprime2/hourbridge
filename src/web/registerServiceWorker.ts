/**
 * Register the offline service worker (production builds only — in development it would cache
 * stale modules and make hot reload confusing). Failure is harmless: the site just needs the
 * network, like any other.
 */
export async function registerServiceWorker(
  options: { enabled?: boolean } = {}
): Promise<ServiceWorkerRegistration | null> {
  const { enabled = import.meta.env.PROD } = options
  if (!enabled || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    // Relative, so the worker's scope is wherever the site is served from.
    return await navigator.serviceWorker.register('./sw.js')
  } catch {
    return null
  }
}

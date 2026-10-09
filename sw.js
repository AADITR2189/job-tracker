/* ════════════════════════════════════════════════════════════════════
   Compatibility shim for v1.
   Version 1 of the app registered "./sw.js". Devices that still have
   that worker check this URL for updates; serving the new worker code
   from here upgrades them automatically (old caches are cleared, job
   data in localStorage is untouched). New pages register
   "service-worker.js" directly.
   ════════════════════════════════════════════════════════════════════ */
self.addEventListener('install', () => self.skipWaiting());
importScripts('./service-worker.js');

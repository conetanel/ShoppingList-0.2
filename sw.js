// sw.js
const SW_VERSION = 'v1.2.1';            // ← תעדכן כדי לאלץ רענון
const APP_SHELL  = 'app-shell-' + SW_VERSION;
const RUNTIME    = 'runtime-'   + SW_VERSION;

// ה-scope המלא של ה-SW (ב-GitHub Pages יסתיים ב-/שם-הרפו/)
const SCOPE = self.registration.scope;
// עוזר למסלולים יחסית ל-scope
const u = (path) => new URL(path, SCOPE).href;

// חשוב להגדיר לפני ה-fetch listener
const STALE_WHILE_REVALIDATE_HOSTS = new Set([
  'unpkg.com',                          // ionicons
  'www.gstatic.com','gstatic.com',      // Firebase
  'www.googleapis.com',
  'fonts.googleapis.com','fonts.gstatic.com'
]);

// אל תשים "/" מוחלט ב-GH Pages. הכל יחסית ל-scope:
const PRECACHE_URLS = [
  u('./index.html'),
  u('./style.css'),
  u('./script.js'),
  u('./manifest.webmanifest'),
  // אייקונים בסיסיים (שקיימים בפועל)
  u('./icons/icon-192.png'),
  u('./icons/logo.svg'),
  u('./icons/Background.svg'),
  // ❌ לא מוסיפים כאן splash images — לא נדרש להצגה, וחוסך 404ים
];

const PRECACHE_SET = new Set(PRECACHE_URLS.map(href => href));

const SHEETS_ENDPOINT_PREFIX = 'https://docs.google.com/spreadsheets/d/';

// -------- install: precache יחידני עם לוג עדין --------
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL);
    const failures = [];
    for (const href of PRECACHE_SET) {
      try {
        await cache.add(new Request(href, { cache: 'reload' }));
      } catch (e) {
        console.warn('⚠️ Precache failed:', href, e?.message || e);
        failures.push(href);
      }
    }
    if (failures.length) {
      console.warn('⚠️ Some precache entries failed:', failures);
    }
  })());
});

// -------- activate: ניקוי קבצים ישנים + claim --------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== APP_SHELL && k !== RUNTIME).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// -------- fetch: אסטרטגיות --------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ניווטים → החזר index.html מתוך ה-App Shell
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(APP_SHELL);
      const cached = await cache.match(new URL('./index.html', SCOPE));
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        await cache.put(new URL('./index.html', SCOPE), fresh.clone());
        return fresh;
      } catch {
        return new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  // קבצים ש-precache מכיר
  if (PRECACHE_SET.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_SHELL);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      const fresh = await fetch(req);
      cache.put(req, fresh.clone());
      return fresh;
    })());
    return;
  }

  // צד-שלישי → SWR
  if (STALE_WHILE_REVALIDATE_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Google Sheets → network-first עם נפילה לקאש
  if (req.url.startsWith(SHEETS_ENDPOINT_PREFIX)) {
    event.respondWith(networkFirstWithFallback(req));
    return;
  }

  // סטטי כללי → SWR
  if (['style','script','image','font'].includes(req.destination)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
});

// ---------- Helpers ----------
async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirstWithFallback(req) {
  const cache = await caches.open(RUNTIME);
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// sw.js
const SW_VERSION = 'v1.1.0';                // עדכן מספר לגרום לרענון
const APP_SHELL  = 'app-shell-' + SW_VERSION;
const RUNTIME    = 'runtime-'   + SW_VERSION;

// בונה URL אבסולוטי יחסית ל-scope של ה-SW (עובד מעולה ב-GitHub Pages)
const SCOPE = self.registration.scope;
const u = (path) => new URL(path, SCOPE_ORIGIN).href;

// חייב להיות ברמה הגלובלית, לפני addEventListener('fetch', …)
const STALE_WHILE_REVALIDATE_HOSTS = new Set([
  'unpkg.com',                          // ionicons
  'www.gstatic.com','gstatic.com',      // Firebase SDK
  'www.googleapis.com',
  'fonts.googleapis.com','fonts.gstatic.com'
]);


// ❗ אל תשים '/' בפרויקט GH Pages – זה ישתמע כשורש הדומיין ויחטיא.
// השתמש במסלולים יחסיים ל-scope:
const PRECACHE_URLS = [
  u('./index.html'),
  u('./style.css'),
  u('./script.js'),
  u('./manifest.webmanifest'),

  // 🎨 אייקונים כלליים
  u('./icons/icon-192.png'),
  u('./icons/logo.svg'),
  u('./icons/Background.svg'),

  // 🖼️ מסכי פתיחה (iOS)
  u('./icons/splash/splash-750.png'),
  u('./icons/splash/splash-828.png'),
  u('./icons/splash/splash-1125.png'),
  u('./icons/splash/splash-1242.png'),
  u('./icons/splash/splash-1536.png'),
  u('./icons/splash/splash-1668.png'),
  u('./icons/splash/splash-2048.png'),

];

const PRECACHE_SET = new Set(PRECACHE_URLS.map(p => new URL(p, SCOPE).href));

const SHEETS_ENDPOINT_PREFIX = 'https://docs.google.com/spreadsheets/d/';



// התקנה: לא משתמשים ב-cache.addAll ישירות, אלא נביא כל משאב,
// נרשום לוג על נפילות, ונשמור רק את מי שהצליח
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL);
    const failures = [];
    for (const href of PRECACHE_SET) {
      try {
        await cache.add(new Request(href, { cache: 'reload' }));
      } catch (e) {
        // לוג עדין במקום להפיל את כל ההתקנה
        console.warn('⚠️ Precache failed:', href, e?.message || e);
        failures.push(href);
      }
    }
    if (failures.length) {
      console.warn('⚠️ Some precache entries failed:', failures);
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== APP_SHELL && k !== RUNTIME)
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ניווטים: החזר index.html מהקאש
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(APP_SHELL);
      const cached =
        await cache.match(new URL('./index.html', SCOPE)) ||
        await cache.match(new URL('./', SCOPE));
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        await cache.put(new URL('./index.html', SCOPE), fresh.clone());
        return fresh;
      } catch {
        return new Response('<h1>Offline</h1>', { headers: {'Content-Type':'text/html'} });
      }
    })());
    return;
  }

  // סטטיקה ש־precache מכיר (בדיקה לפי href מלא)
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

  // צד שלישי – SWR
  if (STALE_WHILE_REVALIDATE_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Google Sheets – network-first
  if (req.url.startsWith(SHEETS_ENDPOINT_PREFIX)) {
    event.respondWith(networkFirstWithFallback(req));
    return;
  }

  // סטטיקה כללית – SWR
  if (['style','script','image','font'].includes(req.destination)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
});

// Helpers
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
    return new Response(JSON.stringify({ error: 'offline' }), { headers: { 'Content-Type': 'application/json'} });
  }
}

/* (אופציונלי) Background Sync – אם תרצה לתמוך בתורים בעתיד
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-shopping-data') {
    event.waitUntil(/* שלח תורים מה-IndexedDB שלך * / Promise.resolve());
  }
});
*/

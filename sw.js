// sw.js
const SW_VERSION = 'v1.0.10';                // עדכן מספר לגרום לרענון
const APP_SHELL  = 'app-shell-' + SW_VERSION;
const RUNTIME    = 'runtime-'   + SW_VERSION;

// בונה URL אבסולוטי יחסית ל-scope של ה-SW (עובד מעולה ב-GitHub Pages)
const SCOPE_ORIGIN = self.registration.scope;
const u = (path) => new URL(path, SCOPE_ORIGIN).href;

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

  // 🤖 מסכי פתיחה + אייקונים לאנדרואיד
  u('./icons/splash/android/splash-750.png'),
  u('./icons/splash/android/splash-828.png'),
  u('./icons/splash/android/splash-1125.png'),
  u('./icons/splash/android/splash-1242.png'),
  u('./icons/splash/android/splash-1536.png'),
  u('./icons/splash/android/splash-1668.png'),
  u('./icons/splash/android/splash-2048.png'),
  u('./icons/splash/android/android-launchericon-48-48.png'),
  u('./icons/splash/android/android-launchericon-72-72.png'),
  u('./icons/splash/android/android-launchericon-96-96.png'),
  u('./icons/splash/android/android-launchericon-144-144.png'),
  u('./icons/splash/android/android-launchericon-192-192.png'),
  u('./icons/splash/android/android-launchericon-512-512.png')
];

// התקנה: לא משתמשים ב-cache.addAll ישירות, אלא נביא כל משאב,
// נרשום לוג על נפילות, ונשמור רק את מי שהצליח
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(APP_SHELL);

    const results = await Promise.allSettled(
      PRECACHE_URLS.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await cache.put(url, res.clone());
          return { url, ok: true };
        } catch (err) {
          console.warn('⚠️ Precache failed:', url, err?.message || err);
          return { url, ok: false, err };
        }
      })
    );

    const failed = results.filter(r => r.value && !r.value.ok);
    if (failed.length) {
      console.warn('⚠️ Some precache entries failed:', failed.map(f => f.value.url));
      // בכוונה לא זורקים שגיאה – שלא יפיל את כל ה-install
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== APP_SHELL && k !== RUNTIME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// שאר ה-fetch handlers שלך יכולים להישאר כמו שהיו


/* אסטרטגיות פניות רשת */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) ניווטים: החזר App Shell מהמטמון (SPA), ואז הרשת תרענן נתונים.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(APP_SHELL);
      const cached = await cache.match('/index.html') || await cache.match('/'); 
      if (cached) return cached;
      // נפילה: אם אין במטמון (בפעם הראשונה), קח מהרשת ושמור
      try {
        const fresh = await fetch(req);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch {
        return new Response('<h1>Offline</h1>', {headers: {'Content-Type':'text/html'}});
      }
    })());
    return;
  }

  // 2) קבצי ה־App Shell עצמם → cache-first
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_SHELL);
      const cached = await cache.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      cache.put(req, fresh.clone());
      return fresh;
    })());
    return;
  }

  // 3) ספריות צד שלישי (CDN/Firebase) → stale-while-revalidate
  if (STALE_WHILE_REVALIDATE_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 4) ה-Google Sheets שלך → network-first עם fallback למטמון האחרון
  if (req.url.startsWith(SHEETS_ENDPOINT_PREFIX)) {
    event.respondWith(networkFirstWithFallback(req));
    return;
  }

  // 5) ברירת מחדל: נסה stale-while-revalidate למשאבים סטטיים אחרים
  if (req.destination === 'style' || req.destination === 'script' || req.destination === 'image' || req.destination === 'font') {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  // לבקשות אחרות שאין להן אסטרטגיה — אל תפריע:
  // (למשל בקשות פנימיות של Firestore SDK; את זה נטפל ב-IndexedDB דרך ה-SDK)
});

/* ---- Helpers ---- */

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
    // אם הבקשה הצליחה ונראית תקינה – שמור ורענן את ה-UI בבקשה
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    // אין אינטרנט ואין מטמון – החזר תשובה ריקה שמתורגמת הודעת שגיאה ב-UI
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

/* sw.js - Offline-first PWA with smart caching + background refresh */
const SW_VERSION = 'v1.0.8';
const APP_SHELL = 'app-shell-' + SW_VERSION;
const RUNTIME = 'runtime-' + SW_VERSION;

/* ✔️ קבצי ליבה (App Shell) לטעינה מיידית גם בלי רשת */
const PRECACHE_URLS = [
  '/',                 // אם האתר ברוט; אם לא - הסר או עדכן לindex.html יחסי
  '/index.html',       // ודא שם קובץ נכון
  '/style.css',
  '/script.js',
  '/manifest.webmanifest',
  '/icons/apple-touch-icon.png'
];

/* ✔️ דומיינים צד-שלישי לשיטת stale-while-revalidate */
const STALE_WHILE_REVALIDATE_HOSTS = new Set([
  'unpkg.com',                                 // ionicons
  'www.gstatic.com', 'gstatic.com',            // Firebase SDK
  'www.googleapis.com',                        // לעתיד
  'fonts.googleapis.com', 'fonts.gstatic.com'  // אם תשתמש בפונטים
]);

/* ✔️ נקודת ה-Google Sheets שלך (Network-first עם נפילה למטמון) */
const SHEETS_ENDPOINT_PREFIX = 'https://docs.google.com/spreadsheets/d/';

/* התקנה: פרה-קאש של ה-App Shell */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

/* הפעלה: ניקוי גרסאות ישנות */
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

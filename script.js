
/* Firebase SDK imports */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  signOut,
  getRedirectResult, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,  
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";




// אובייקט firebaseConfig הייחודי שלך
const firebaseConfig = {
  apiKey: "AIzaSyDqfAJm1kqjTiNc8RTJ8ra-vEOxrkwQqLk",
  authDomain: "shopping-list-2-6b2c1.firebaseapp.com",
  projectId: "shopping-list-2-6b2c1",
  storageBucket: "shopping-list-2-6b2c1.firebasestorage.app",
  messagingSenderId: "71933730738",
  appId: "1:71933730738:web:9984c545ac879692104eab",
  measurementId: "G-5WNKMWP4G8",
};

// אתחול Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
  // מנסה "לסגור" התחברות redirect (חשוב במיוחד ב-PWA על iOS)
  (async () => {
    try {
      const result = await getRedirectResult(auth);
      if (result && result.user) {
        console.log('✅ Google redirect login OK, user:', result.user.email);
        // כאן לא חייב לעשות כלום – onAuthStateChanged כבר יטפל בשאר
        // אבל אם תרצה, אפשר לשמור גם currentUserId וכו' ידנית
      } else {
        console.log('ℹ️ אין redirectResult (זה תקין אם לא חזרנו כרגע מהתחברות)');
      }
    } catch (err) {
      console.error('❌ שגיאה ב-getRedirectResult:', err.code, err.message);
    }
  })();
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Google Sign-In provider
const googleProvider = new GoogleAuthProvider();
// אופציונלי: תמיד להראות בחירה בין חשבונות
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

async function loginWithGoogle() {
  try {
    // קודם כל – מנסה popup *בכל מקום*, כולל PWA
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    console.error('שגיאת popup, שוקל fallback ל-redirect:', err);

    // רק אם זה באמת מקרה של popup חסום – נעבור ל-redirect
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch (redirErr) {
        console.error('שגיאה ב-redirect:', redirErr);
        alert('שגיאה בהתחברות עם Google: ' + (redirErr.code || '') + ' ' + (redirErr.message || ''));
      }
    } else {
      alert('שגיאה בהתחברות עם Google: ' + (err.code || '') + ' ' + (err.message || ''));
    }
  }
}
const authGoogleBtn = document.getElementById('auth-google-btn');
if (authGoogleBtn) {
  authGoogleBtn.addEventListener('click', () => {
    loginWithGoogle();
  });
}



// מניעת גלילה אנכית כאשר מתמקדים בסרגל (מהקוד המקורי שלך)
const categoryFilterContainer = document.querySelector(".category-filter-container");

if (categoryFilterContainer) {
  categoryFilterContainer.addEventListener(
    "wheel",
    (e) => {
      if (e.deltaY !== 0) e.preventDefault();
    },
    { passive: false }
  );
} else {
  console.warn('⚠️ .category-filter-container לא נמצא ב־DOM');
}

// משתנים גלובליים
let shoppingList = {};
let allCategorizedItems = {};
let currentUserId = null;
let currentUserEmail = null;
let currentCategory = 'הכל';
let isLinkedToSharedList = false;
let sharedMainId = null;          // אם המשתמש מחובר כרגע לרשימה משותפת
let pendingInviteISent = null;    // הזמנה שאני בעליה (owner) והיא עדיין ממתינה
let pendingInviteId = null;     // מזהה הזמנה שממתינה (אם יש)
let hasPendingInvite = false;   // האם יש הזמנה פתוחה אליי (לאורח)
let hasPendingInviteISent = false;
let sharedMainUnsub = null; // נעשה בזה שימוש לסנכרון ריל־טיים בהמשך
let pendingInviteForMe = null;   // (כרגע משמש רק לאיפוס state, אפשר להרחיב בהמשך)


// ===== מאזין לשינויים אונליין =====
function startSharedMainListener(sharedId) {
  // מבטלים listener קודם אם קיים
  if (sharedMainUnsub) {
    sharedMainUnsub();
    sharedMainUnsub = null;
  }

  if (!sharedId) return;

  const sharedRef = doc(db, "sharedMains", sharedId);

  sharedMainUnsub = onSnapshot(sharedRef, (snap) => {
    if (!snap.exists()) {
      console.warn("sharedMain נמחק מהשרת");

      // 🧹 איפוס מצב שיתוף בצד ה"ננטש"
      sharedMainId = null;
      isLinkedToSharedList = false;
      setCurrentListLabel(null);
      updateUserMenuState();

      // לא נוגעים ב-shoppingList – כבר הועתק ל-zMainList ע"י disconnectSharedMain בצד השני

      alert("הצד השני ניתק את החיבור. אינך מחובר יותר לרשימה המשותפת.");
      return;
    }

    const data = snap.data();
    shoppingList = data.items || {};

    saveShoppingCache(shoppingList);
    updateUIWithSavedList(shoppingList);
    updateUIFromShoppingList();
  }, (err) => {
    console.error("שגיאה בהאזנה ל-sharedMain:", err);
  });
}



// ===== הגדרה לבדיקת הבר התחתון בדסקטופ =====
const FORCE_BOTTOM_BAR = true; // ← בזמן בדיקות: true, בפרודקשן: false


/* ===== Detect iOS PWA & wire bottom bar ===== */
const bottomBar = document.getElementById('bottom-bar');
const shareIconHeader = document.getElementById('share-icon');

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  const iosStandalone = window.navigator.standalone === true;
  const mqStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || mqStandalone;
}

// לוגיקה להצגת סרגל התחתית ב-PWA
(function initBottomBar() {
  const runAsPWAonIOS = isIOS() && isStandalone();

  // אם הדגל דולק – הבר יופיע בכל מצב, גם בדפדפן בדסקטופ
  const shouldShowBottomBar = FORCE_BOTTOM_BAR || runAsPWAonIOS;

  if (shouldShowBottomBar) {
    bottomBar.classList.remove('hidden');
    if (shareIconHeader) shareIconHeader.style.display = 'none';
  } else {
    bottomBar.classList.add('hidden');
    if (shareIconHeader) shareIconHeader.style.removeProperty('display');
  }
})();

// ===== User Menu Logic =====
const userMenuBackdrop   = document.getElementById('user-menu-backdrop');
const userMenuSheet      = document.getElementById('user-menu');
attachSheetDrag(userMenuSheet, userMenuBackdrop);
const userMenuEmailLabel = document.getElementById('user-menu-email');

const userLogoutBtn      = document.getElementById('user-logout-btn');
const userMergeBtn       = document.getElementById('user-merge-btn');
const userDisconnectBtn  = document.getElementById('user-disconnect-btn');

///=====פונקציות עזר: נרמול אימייל=====/
function normalizeEmail(email) {
  if (!email) return null;
  let e = email.trim().toLowerCase();

  const [local, domain] = e.split("@");
  if (!domain) return e;

  // טיפול מיוחד ב-Gmail
  if (domain === "gmail.com") {
    // מוריד כל מה שאחרי +
    const plusIndex = local.indexOf("+");
    const cleanLocal = (plusIndex >= 0 ? local.slice(0, plusIndex) : local)
      .replace(/\./g, ""); // מסיר נקודות

    return `${cleanLocal}@gmail.com`;
  }

  return e;
}



///=====פונקציות buildUserMeta – לייצר userLabel / ownerEmail / ownerName=====/
function buildUserMeta(user) {
  if (!user) {
    return {
      userLabel: "משתמש ללא אימייל",
      googleLinkLabel: "משתמש ללא אימייל",
      ownerEmail: null,
      ownerName: null,
    };
  }

  const provider = (user.providerData && user.providerData[0]) || {};

  const email = (user.email || provider.email || "").trim();
  const displayName = (user.displayName || provider.displayName || "").trim();

  // בונים userLabel אחיד
  let userLabel;
  if (displayName && email) {
    userLabel = `${displayName} <${email}>`;
  } else if (email) {
    userLabel = email;
  } else if (displayName) {
    userLabel = displayName;
  } else {
    userLabel = "משתמש ללא אימייל";
  }

  // googleLinkLabel — כדי לא לשבור קוד ישן
  const googleLinkLabel = `רשימה מקושרת לחשבון: ${email || ""}`;

  return {
    userLabel,
    googleLinkLabel,   // 👈 נשמר למען תאימות מלאה
    ownerEmail: email || null,
    ownerName: displayName || null,
  };
}


///=====פונקציות ידית ותזוזה לכרטיסייה=====/
function attachSheetDrag(sheetEl, backdropEl) {
  if (!sheetEl || !backdropEl) return;

  // כל הכרטיסיה היא "ידית"
  const handle = sheetEl;

  let pointerDown = false;
  let dragging = false;
  let startY = 0;
  let currentY = 0;
  let dragStartDelta = 0;

  const DRAG_CLOSE_THRESHOLD = 80; // כמה למשוך למטה כדי לסגור
  const DRAG_START_THRESHOLD = 6;  // כמה לזוז עד שמבינים שזה drag

  function applyTransform(delta) {
    if (delta < 0) {
      // משיכה למעלה – גומי
      const abs = Math.abs(delta);
      const damped = -Math.pow(abs, 0.35) * 6;
      sheetEl.style.transform = `translateY(${damped}px)`;
    } else {
      // משיכה למטה – 1:1
      sheetEl.style.transform = `translateY(${delta}px)`;
    }
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // לא מתחילים גרירה מתוך כפתור / אינפוט / לינק
    if (e.target.closest('button, input, textarea, select, a')) return;

    pointerDown = true;
    dragging = false;
    startY = e.clientY;
    currentY = startY;
    dragStartDelta = 0;

    sheetEl.style.transition = 'none';

    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onPointerMove(e) {
    if (!pointerDown) return;

    currentY = e.clientY;
    const rawDelta = currentY - startY;

    if (!dragging) {
      if (Math.abs(rawDelta) < DRAG_START_THRESHOLD) return;
      dragging = true;
      dragStartDelta = rawDelta;
      sheetEl.style.transition = 'none';
    }

    e.preventDefault();

    const effectiveDelta = rawDelta - dragStartDelta;
    applyTransform(effectiveDelta);
  }

  function onPointerUp(e) {
    if (!pointerDown) return;
    pointerDown = false;

    try {
      handle.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (!dragging) {
      // רק טאפ קצר – לא גרירה
      return;
    }

    dragging = false;
    sheetEl.style.transition = 'transform .24s ease-out';

    const rawDelta = currentY - startY;
    const effectiveDelta = rawDelta - dragStartDelta;

    if (effectiveDelta > DRAG_CLOSE_THRESHOLD) {
      closeSheet();
    } else {
      sheetEl.style.transform = '';
    }
  }

  function openSheet() {
    sheetEl.classList.remove('hidden');
    backdropEl.classList.remove('hidden');

    requestAnimationFrame(() => {
      backdropEl.classList.add('show');
      sheetEl.classList.add('show');
      sheetEl.style.transform = '';
    });
  }

  function closeSheet() {
    backdropEl.classList.remove('show');
    sheetEl.classList.remove('show');
    sheetEl.style.transform = '';

    setTimeout(() => {
      sheetEl.classList.add('hidden');
      backdropEl.classList.add('hidden');
    }, 220);
  }

  sheetEl.openSheet = openSheet;
  sheetEl.closeSheet = closeSheet;

  backdropEl.addEventListener('click', closeSheet);

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);
}







function openUserMenu() {
  if (!userMenuSheet || !userMenuBackdrop) return;

  updateUserMenuState();
  checkOwnerInviteStatus();

  if (currentUserEmail) {
    checkPendingInvitesForUser(currentUserEmail);
  }

  if (userMenuEmailLabel) {
    if (currentUserEmail) {
      userMenuEmailLabel.textContent = `מחובר כ־ ${currentUserEmail}`;
    } else if (currentUserId) {
      userMenuEmailLabel.textContent = `מחובר (UID: ${currentUserId})`;
    } else {
      userMenuEmailLabel.textContent = 'לא מחובר';
    }
  }

  userMenuSheet.openSheet();
}



function closeUserMenu() {
  if (!userMenuSheet || !userMenuBackdrop) return;
  userMenuSheet.closeSheet();
}


  if (userMenuBackdrop) {
    userMenuBackdrop.addEventListener('click', closeUserMenu);
  }

  // בינתיים – placeholders ללחצנים שבתפריט:
  if (userMergeBtn) {
      userMergeBtn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user) {
        openAuthSheet();
        return;
      }

      // 1) אם כבר מחוברים לרשימה משותפת – לא אמורים להגיע לכאן (זה תפקיד כפתור שבירת חיבור)
      if (isLinkedToSharedList) {
        alert("כבר יש לך רשימה משותפת פעילה. כדי להתנתק – השתמש בכפתור 'שבירת חיבור'.");
        return;
      }

      // 2) אם יש הזמנה ממתינה אליי כאורח
      if (hasPendingInvite && pendingInviteId) {
        const inviteInfo = window._lastInvite || {};
        const ownerLabel = inviteInfo.ownerName || inviteInfo.ownerEmail || inviteInfo.ownerUid || "משתמש אחר";
        const answer = confirm(
          `קיבלת הזמנה לשיתוף רשימת קניות עם:\n${ownerLabel}\n\n` +
          `לחץ OK כדי לאשר, או Cancel כדי לדחות.`
        );

        try {
          if (answer) {
            await acceptInvite(pendingInviteId);
          } else {
            await rejectInvite(pendingInviteId);
          }
        } catch (err) {
          console.error("שגיאה בטיפול בהזמנה:", err);
        }

        return;
      }

      // 3) אם אני הבעלים ויש לי כבר הזמנה ששלחתי
      if (hasPendingInviteISent && pendingInviteISent) {
        // כאן הפכנו את הכפתור ל"כפתור ביטול הזמנה"
        await cancelInviteISent();
        return;
      }

      // 4) מצב רגיל – אין הזמנה פתוחה, אין שיתוף → שולחים הזמנה חדשה
      const targetEmail = prompt("הכנס כתובת מייל של מי שתרצה לאחד איתו רשימת קניות:");
      if (!targetEmail) return;

      try {
        await sendInvite(targetEmail);
        alert("ההזמנה נשלחה. כעת נמתין לאישור.");
      } catch (err) {
        console.error("שגיאה בשליחת הזמנה:", err);
        alert("אירעה שגיאה בשליחת ההזמנה. נסה שוב.");
      }
    });  
  }



  if (userDisconnectBtn) {
    userDisconnectBtn.addEventListener('click', () => {
      if (!sharedMainId) return;
      disconnectSharedMain();
    });
  }



  if (userLogoutBtn) {
    userLogoutBtn.addEventListener('click', async () => {
      const ok = confirm('להתנתק מהמשתמש המחובר?');
      if (!ok) return;
      try {
        await signOut(auth);
        closeUserMenu();
      } catch (err) {
        console.error('שגיאה בהתנתקות:', err);
        alert('שגיאה בהתנתקות: ' + (err.message || ''));
      }
    });
  }



// --- LOCAL CACHE FOR INSTANT START ---
const CACHE_KEY = 'cachedCategorizedItemsV1';
const SHOPPING_CACHE_KEY = 'cachedShoppingListV1';

// ✅ פונקציה חיונית לגרדיאנטים ב-CSS (שמירת גובה ה-sticky header במשתנה CSS)
function setStickyHeight() {
  const el = document.getElementById('sticky-header-container');
  if (!el) return;
  const h = el.offsetHeight || 140; 
  document.documentElement.style.setProperty('--sticky-h', h + 'px');
}


// ===== Auth Sheet Logic =====
const authBackdrop   = document.getElementById('auth-backdrop');
const authSheet      = document.getElementById('auth-sheet');
attachSheetDrag(authSheet, authBackdrop);
const authForm       = document.getElementById('auth-form');
const authEmailInput = document.getElementById('auth-email');
const authPassInput  = document.getElementById('auth-password');
const authToggleBtn  = document.getElementById('auth-toggle-mode');
const authCancelBtn  = document.getElementById('auth-cancel');
const authStatus     = document.getElementById('auth-status');
const authSubmitBtn  = document.getElementById('auth-submit-btn');

let authMode = 'login'; // 'login' או 'signup'

function openAuthSheet() {
  if (authSheet && typeof authSheet.openSheet === 'function') {
    authSheet.openSheet();
  }
  if (authStatus) {
    authStatus.textContent = '';
    authStatus.className = 'auth-status';
  }
}

function closeAuthSheet() {
  if (authSheet && typeof authSheet.closeSheet === 'function') {
    authSheet.closeSheet();
  }
}


if (authCancelBtn) {
  authCancelBtn.addEventListener('click', closeAuthSheet);
}
// ה־backdrop כבר מקבל click בתוך attachSheetDrag

function setAuthMode(mode) {
  authMode = mode;
  if (authMode === 'login') {
    authSubmitBtn.textContent = 'התחברות';
    authToggleBtn.textContent = 'אין לך משתמש? הרשם';
  } else {
    authSubmitBtn.textContent = 'יצירת משתמש חדש';
    authToggleBtn.textContent = 'יש לך משתמש? התחבר';
  }
}

if (authToggleBtn) {
  authToggleBtn.addEventListener('click', () => {
    setAuthMode(authMode === 'login' ? 'signup' : 'login');
  });
}

// מדידה מחודשת באמצעות אירועים ו-ResizeObserver
window.addEventListener('DOMContentLoaded', setStickyHeight);
window.addEventListener('load', setStickyHeight);
window.addEventListener('resize', setStickyHeight);

const sticky = document.getElementById('sticky-header-container');
if (sticky && 'ResizeObserver' in window) {
  const ro = new ResizeObserver(setStickyHeight);
  ro.observe(sticky);
}


function saveShoppingCache(list){
  try { localStorage.setItem(SHOPPING_CACHE_KEY, JSON.stringify(list)); } catch(_){}
}

function loadShoppingCache(){
  try { return JSON.parse(localStorage.getItem(SHOPPING_CACHE_KEY) || '{}'); }
  catch(_) { return {}; }
}
function saveCategoriesCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch(_){}
}

function loadCategoriesCache() {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    return s ? JSON.parse(s) : null;
  } catch(_) { return null; }
}
function scrollListTop() {
  const el = document.getElementById('shopping-list-container');
  if (!el) return;
  try {
    el.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (_) {
    // fallback לדפדפנים ישנים / לייב-סרבר מוזר
    el.scrollTop = 0;
  }
}


const container = document.getElementById("shopping-list-container"); 
const headerContainer = document.getElementById("sticky-header-container");
const shareIcon = document.getElementById("share-icon");
const categoryFilterWrapper = document.querySelector(".category-filter-wrapper");
const themeMeta = document.querySelector('meta[name="theme-color"]');


function setThemeColor(color){
  try { themeMeta && themeMeta.setAttribute('content', color); } catch(_){}
}

// ... שאר המשתנים והקבועים (isMockMode, SHEET_ID, COLOR_PALETTE, CATEGORY_ICONS) נשארים כפי שהם ...
const isMockMode = false;
const SHEET_ID = "11OxjXpAo3vWnzJFG738M8FjelkK1vBM09dHzYf78Ubs";
const sheetURL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

const COLOR_PALETTE = [
  { background: "#2fa062", text: "#ffffff" }, 
  { background: "#E6C56E", text: "#000000" }, 
  { background: "#E9A466", text: "#000000" }, 
  { background: "#DD694A", text: "#ffffff" }, 
  { background: "#0b597d", text: "#ffffff" }, 
];

const CATEGORY_COLORS = {
  הכל: { background: "#F2F4F7", text: "#000000" },
};

const dangerFromPalette = (COLOR_PALETTE[3] && COLOR_PALETTE[3].background) || '#DD694A';
document.documentElement.style.setProperty('--danger-red', dangerFromPalette);

const CATEGORY_ICONS = {
  הכל: "grid-outline",
  ירקות: "leaf-outline",
  "ירקות עלים ירוקים": "leaf-outline",
  פירות: "nutrition-outline",
  "לחמים ואפייה": "browsers-outline",
  "מוצרי חלב": "beaker-outline",
  ביצים: "egg-outline",
  "בשר ודגים": "fish-outline",
  קפואים: "snow-outline",
  מזווה: "cube-outline",
  "תבלינים ושמנים": "flask-outline",
  "שבת ומתוקים": "ice-cream-outline",
  "ניקיון והיגיינה": "water-outline",
  "חד פעמי ותבניות": "restaurant-outline",
  אחר: "pricetag-outline",
};
// ... סוף משתנים וקבועים ...


// ===== BEGIN: WARM START + CACHE LOADING =====

function lightenColor(color, percent) {
  let r, g, b;
  if (color.startsWith("#")) {
    r = parseInt(color.substr(1, 2), 16);
    g = parseInt(color.substr(3, 2), 16);
    b = parseInt(color.substr(5, 2), 16);
  } else if (color.startsWith("rgb")) {
    const rgbValues = color.match(/\d+/g);
    if (rgbValues && rgbValues.length >= 3) {
      r = parseInt(rgbValues[0]);
      g = parseInt(rgbValues[1]);
      b = parseInt(rgbValues[2]);
    } else {
      return color;
    }
  }
  r = Math.min(255, Math.floor(r + (255 - r) * percent));
  g = Math.min(255, Math.floor(g + (255 - g) * percent));
  b = Math.min(255, Math.floor(b + (255 - b) * percent));
  return `rgb(${r}, ${g}, ${b})`;
}


function warmStartFromCaches() {
  const cachedCats = loadCategoriesCache();
  const cachedList = loadShoppingCache();

  if (!cachedCats || !container) return false;  // ← בול

  allCategorizedItems = cachedCats;
  shoppingList = cachedList || {};

  const lightened = lightenColor('#F2F4F7', 0.5);
  setThemeColor(lightened);

  container.classList.add('hydrating');
  try {
    renderCategoryFilters(allCategorizedItems);
    renderList(allCategorizedItems);      
    filterListByCategory('הכל');
    setStickyHeight();
  } finally {
    requestAnimationFrame(() => container.classList.remove('hydrating'));
  }

  return true;
}

const hadWarmStart = warmStartFromCaches();
fetchAndRenderList();
// ===== END: WARM START + CACHE LOADING =====

// פונקציית עזר: מפרידה אמוג'י ושם
function extractEmojiAndName(category) {
  if (!category || category.trim() === "") {
    return { emoji: null, name: "אחר" };
  }
  const emojiRegex = /^([\p{Emoji}\p{Emoji_Component}\u{200D}\u{FE0F}\u{20E3}]+)\s*(.*)$/u;
  const match = category.match(emojiRegex);
  if (match && match[1]) {
    let name = match[2].replace(/[:]/g, "").trim();
    return { emoji: match[1], name: name || "אחר" };
  }
  let name = category.replace(/[:]/g, "").trim();
  return { emoji: null, name: name || "אחר" };
}


// סינון + עדכון צבעי רקע/הדר/גרדיאנט
function filterListByCategory(categoryName) {
  currentCategory = categoryName || 'הכל';
  const allCategoryWrappers = container.querySelectorAll(".category-wrapper");
  categoryFilterWrapper.querySelectorAll(".category-bubble").forEach((b) => b.classList.remove("active"));

  allCategoryWrappers.forEach((wrapper) => {
    const categoryData = wrapper.dataset.category;
    if (categoryName === "הכל" || categoryData === categoryName) wrapper.classList.remove("hidden");
    else wrapper.classList.add("hidden");
  });

  const activeBubble = categoryFilterWrapper.querySelector(`.category-bubble[data-category='${categoryName}']`);
  if (activeBubble) {
    activeBubble.classList.add("active");


    // סנאפ לבועה
    const containerWidth = categoryFilterWrapper.parentElement.offsetWidth;
    const bubbleWidth = activeBubble.offsetWidth;
    const bubbleOffset = activeBubble.offsetLeft;
    const scrollPosition = bubbleOffset - (containerWidth - bubbleWidth) / 2;
    categoryFilterWrapper.parentElement.scrollTo({ left: scrollPosition, behavior: "smooth" });

    // 🎨 צבעים
    const baseColor = window.getComputedStyle(activeBubble).backgroundColor;
    const lightenedColor = lightenColor(baseColor, 0.5);
    const computedStyle = window.getComputedStyle(activeBubble);
    const rawBg = computedStyle.backgroundColor;
    const rawText = computedStyle.color;

    // 👇 צבעי כפתור מקוריים מהבועה
    document.documentElement.style.setProperty("--primary-btn-bg", rawBg);
    document.documentElement.style.setProperty("--primary-btn-text", rawText);

    // אזור הנוץ' + צבע ההדר
    document.documentElement.style.setProperty("--status-bg", lightenedColor);
    setThemeColor(lightenedColor);

    document.documentElement.style.setProperty("--header-bg", lightenedColor);
    const filterContainer = categoryFilterWrapper.parentElement;
    filterContainer.style.backgroundColor = lightenedColor;
    filterContainer.style.setProperty("--bottom-gradient", `linear-gradient(to bottom, ${lightenedColor}, transparent)`);

    // גרדיאנט גוף: נגמר מתחת ל-sticky
    const stickyHeight = Math.round(headerContainer.offsetHeight);
    const blend = 120;
    const pageGradient = `linear-gradient(
      to bottom,
      ${lightenedColor} 0px,
      ${lightenedColor} ${stickyHeight}px,
      ${baseColor} ${stickyHeight + blend}px,
      ${baseColor} 100%
    )`;
    document.body.style.background = pageGradient;
    document.body.style.backgroundAttachment = "scroll";
  } else {
    // איפוס
    const filterContainer = categoryFilterWrapper.parentElement;
    filterContainer.style.background = "none";
    filterContainer.style.removeProperty("--bottom-gradient");
    document.documentElement.style.setProperty("--header-bg", "#F2F4F7");
    document.body.style.background = "#F2F4F7";
    document.documentElement.style.setProperty("--status-bg", "#F2F4F7");
    setThemeColor("#F2F4F7");
  }

  requestAnimationFrame(() => setStickyHeight());
}

// עדכון ה-UI על בסיס רשימת הקניות השמורה
function updateUIFromShoppingList() {
  const allItems = container.querySelectorAll(".item");
  allItems.forEach((itemDiv) => {
    const itemName = itemDiv.querySelector(".item-name")?.textContent;
    const controlsDiv = itemDiv.querySelector(".item-controls");
    const iconToggle = controlsDiv?.querySelector(".icon-toggle");
    if (!itemName || !controlsDiv || !iconToggle) return;

    const savedItemData = shoppingList[itemName];
    if (savedItemData) {
      iconToggle.classList.add("active");
      iconToggle.setAttribute("aria-pressed", "true");
      controlsDiv.classList.remove("locked");
      controlsDiv.classList.add("show-controls");

      if (savedItemData.quantity) {
        const valueSpan = controlsDiv.querySelector(".stepper-value");
        const quantityMatch = savedItemData.quantity.match(/^(\d+)/);
        if (valueSpan && quantityMatch) valueSpan.textContent = quantityMatch[1];
      } else if (savedItemData.size) {
        const sizeButtons = controlsDiv.querySelectorAll(".size-button");
        sizeButtons.forEach((btn) => {
          btn.classList.remove("active");
          if (btn.textContent === savedItemData.size) btn.classList.add("active");
        });
      }
    } else {
      iconToggle.classList.remove("active");
      controlsDiv.classList.add("locked");
      controlsDiv.classList.remove("show-controls");
    }
  });
}

// טעינת הנתונים מ-Google Sheets או Mock
async function fetchAndRenderList() {
  if (isMockMode) {
    const mockData = {
      ירקות: [{ item: "עגבנייה", type: "כמות" }],
      פירות: [{ item: "תפוח", type: "גודל" }],
    };
    allCategorizedItems = mockData;
    saveCategoriesCache(allCategorizedItems);
    container.classList.add('hydrating');
    try {
      renderCategoryFilters(allCategorizedItems);
      renderList(allCategorizedItems);
      filterListByCategory("הכל");
      setStickyHeight();
    } finally {
      requestAnimationFrame(() => container.classList.remove('hydrating'));
    }
    return;
  }

  try {
    const response = await fetch(sheetURL);
    const text = await response.text();
    const json = JSON.parse(text.substr(47).slice(0, -2));
    const rows = json.table.rows.slice(1);

    const categorizedItems = {};
    rows.forEach((row) => {
      const cells = row.c || [];
      if (cells.length < 3) return;
      const category = cells[0]?.v;
      const item = cells[1]?.v;
      const type = cells[2]?.v;
      if (category && item) {
        (categorizedItems[category] ||= []).push({ item, type });
      }
    });

    allCategorizedItems = categorizedItems;
    saveCategoriesCache(allCategorizedItems);

    container.classList.add('hydrating');
    try {
      renderCategoryFilters(allCategorizedItems);
      renderList(allCategorizedItems);
      filterListByCategory("הכל");
      setStickyHeight();
    } finally {
      requestAnimationFrame(() => container.classList.remove('hydrating'));
    }
  
    


  } catch (err) {
    console.error("שגיאה בטעינה מגיליון:", err);
  
  }
}

window.addEventListener('online', async () => {
  await fetchAndRenderList();
  if (currentUserId) await loadUserShoppingList(currentUserId);
});


function renderList(categorizedItems) {
  container.innerHTML = "";
  for (const category in categorizedItems) {
    const categoryWrapper = document.createElement("div");
    categoryWrapper.className = "category-wrapper";
    categoryWrapper.dataset.category = category;

    const categoryDiv = document.createElement("div");
    categoryDiv.className = "category";

    const { name: cleanName } = extractEmojiAndName(category);
    categoryDiv.textContent = cleanName.trim() === "" ? "אחר" : cleanName;

    const card = document.createElement("div");
    card.className = "item-card";

    categorizedItems[category].forEach((itemObj) => {
      const itemElement = createItemElement(itemObj, category);
      card.appendChild(itemElement);
    });

    categoryWrapper.appendChild(categoryDiv);
    categoryWrapper.appendChild(card);
    container.appendChild(categoryWrapper);
  }
}

function createIconToggle(initialActive = false, onChange) {
  const btn = document.createElement("button");
  btn.className = "icon-toggle";
  btn.type = "button";
  btn.setAttribute("aria-pressed", initialActive ? "true" : "false");

  const addIcon = document.createElement("ion-icon");
  addIcon.setAttribute("name", "add-circle-outline");
  addIcon.className = "icon-add";

  const checkIcon = document.createElement("ion-icon");
  checkIcon.setAttribute("name", "checkmark-circle");
  checkIcon.className = "icon-check";

  btn.appendChild(addIcon);
  btn.appendChild(checkIcon);

  if (initialActive) btn.classList.add("active");

  btn.addEventListener("click", () => {
    const active = !btn.classList.contains("active");
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");

    // אנימציית “פופ” + ריפל
    btn.classList.add("pop", "ripple");
    setTimeout(() => btn.classList.remove("pop"), 240);
    setTimeout(() => btn.classList.remove("ripple"), 320);

    if (typeof onChange === "function") onChange(active);
  });

  return btn;
}

// יצירת אלמנט פריט יחיד
function createItemElement(itemObj, category) {
  const itemDiv = document.createElement("div");
  itemDiv.className = "item";

  const itemNameSpan = document.createElement("span");
  itemNameSpan.textContent = itemObj.item;
  itemNameSpan.className = "item-name";
  itemDiv.appendChild(itemNameSpan);

  const itemControlsDiv = document.createElement("div");
  itemControlsDiv.className = "item-controls locked";

  // ✅ מצב התחלתי מתוך shoppingList (אם קיים)
  const saved = shoppingList[itemObj.item];
  const initiallyActive = !!saved;

  // כפתור האייקון
  const iconToggle = createIconToggle(initiallyActive, (isActive) => {
    if (isActive) {
      itemControlsDiv.classList.remove("locked");
      itemControlsDiv.classList.add("show-controls");

      if (itemObj.type === "כמות") {
        const valueSpan = itemControlsDiv.querySelector(".stepper-value");
        const quantity = valueSpan ? valueSpan.textContent : "1";
        shoppingList[itemObj.item] = { category, quantity: `${quantity} יחידות` };
      } else if (itemObj.type === "גודל") {
        const activeSizeButton = itemControlsDiv.querySelector(".size-button.active");
        const size = activeSizeButton ? activeSizeButton.textContent : "S";
        shoppingList[itemObj.item] = { category, size };
      } else {
        shoppingList[itemObj.item] = { category };
      }
    } else {
      itemControlsDiv.classList.add("locked");
      itemControlsDiv.classList.remove("show-controls");
      delete shoppingList[itemObj.item];
    }

    // 👇 תמיד אחרי שינוי הטוגל
    saveShoppingCache(shoppingList);
    if (currentUserId) saveShoppingList(currentUserId, shoppingList);
  });

  itemControlsDiv.appendChild(iconToggle);

  // יצירת בקרי כמות/מידה
  if (itemObj.type === "כמות") {
    const stepperContainer = document.createElement("div");
    stepperContainer.className = "quantity-stepper-container control";
    const minusButton = document.createElement("button"); minusButton.textContent = "–";
    const valueSpan = document.createElement("span"); valueSpan.className = "stepper-value"; valueSpan.textContent = "1";
    const plusButton = document.createElement("button"); plusButton.textContent = "+";
    stepperContainer.append(minusButton, valueSpan, plusButton);
    itemControlsDiv.appendChild(stepperContainer);

    // ✅ אם נשמרה כמות – להציג אותה כבר ביצירה
    if (saved?.quantity) {
      const m = saved.quantity.match(/\d+/);
      if (m) valueSpan.textContent = m[0];
    }

    plusButton.addEventListener("click", () => {
      let currentValue = parseInt(valueSpan.textContent);
      if (currentValue < 10) {
        valueSpan.textContent = ++currentValue;
        if (iconToggle.classList.contains("active")) {
          shoppingList[itemObj.item] = { category, quantity: `${currentValue} יחידות` };
          saveShoppingCache(shoppingList);
          if (currentUserId) saveShoppingList(currentUserId, shoppingList);
        }

      }
    });

    minusButton.addEventListener("click", () => {
      let currentValue = parseInt(valueSpan.textContent);
      if (currentValue > 1) {
        valueSpan.textContent = --currentValue;
        if (iconToggle.classList.contains("active")) {
          shoppingList[itemObj.item] = { category, quantity: `${currentValue} יחידות` };
          saveShoppingCache(shoppingList);
          if (currentUserId) saveShoppingList(currentUserId, shoppingList);
        }

      }
    });

  } else if (itemObj.type === "גודל") {
    const sizeOptions = ["S", "M", "L"];
    const sizeButtonsContainer = document.createElement("div");
    sizeButtonsContainer.className = "size-buttons-container control";
    sizeOptions.forEach((size) => {
      const button = document.createElement("button");
      button.className = "size-button";
      button.textContent = size;
      sizeButtonsContainer.appendChild(button);

      button.addEventListener("click", () => {
        sizeButtonsContainer.querySelectorAll(".size-button").forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");
        if (iconToggle.classList.contains("active")) {
          shoppingList[itemObj.item] = { category, size: button.textContent };
          saveShoppingCache(shoppingList);
          if (currentUserId) saveShoppingList(currentUserId, shoppingList);
        }
      });
    });
    itemControlsDiv.appendChild(sizeButtonsContainer);

    // ✅ אם נשמרה מידה – להפעיל אותה כבר עכשיו
    if (saved?.size) {
      sizeButtonsContainer.querySelectorAll(".size-button").forEach((btn) => {
        if (btn.textContent === saved.size) btn.classList.add("active");
      });
    } else {
      // ברירת מחדל: S
      sizeButtonsContainer.querySelector(".size-button")?.classList.add("active");
    }
  }

  // ✅ אם נשמר – לחשוף בקרות כבר מההתחלה
  if (initiallyActive) {
    itemControlsDiv.classList.remove("locked");
    itemControlsDiv.classList.add("show-controls");
  }

  itemDiv.appendChild(itemControlsDiv);
  return itemDiv;
}

// רינדור סרגלי הקטגוריות והוספת לוגיקת סינון
function renderCategoryFilters(categorizedItems) {
  categoryFilterWrapper.innerHTML = "";

  const allCategories = ["הכל", ...Object.keys(categorizedItems)];

  allCategories.forEach((category, index) => {
    const { emoji, name: cleanName } = extractEmojiAndName(category);
    const displayCategory = cleanName.trim() === "" ? "אחר" : cleanName;

    const bubble = document.createElement("div");
    bubble.className = "category-bubble status-style";
    bubble.dataset.category = category;

    const colorIndex = index % COLOR_PALETTE.length;
    const color = COLOR_PALETTE[colorIndex];
    bubble.style.backgroundColor = color.background;
    bubble.style.color = color.text;

    let iconElement;
    const iconName = CATEGORY_ICONS[displayCategory] || CATEGORY_ICONS["אחר"];
    if (iconName) {
      iconElement = document.createElement("ion-icon");
      iconElement.setAttribute("name", iconName);
      iconElement.className = "category-icon";
    } else if (emoji) {
      iconElement = document.createElement("span");
      iconElement.textContent = emoji;
      iconElement.className = "category-icon";
    } else {
      iconElement = document.createElement("ion-icon");
      iconElement.setAttribute("name", CATEGORY_ICONS["אחר"]);
      iconElement.className = "category-icon";
    }

    const textSpan = document.createElement("span");
    textSpan.textContent = displayCategory;
    textSpan.className = "category-text";

    bubble.appendChild(iconElement);
    bubble.appendChild(textSpan);

    if (category === "הכל") bubble.classList.add("active");

    categoryFilterWrapper.appendChild(bubble);
  });

  categoryFilterWrapper.addEventListener("click", (event) => {
  const bubble = event.target && event.target.closest
    ? event.target.closest(".category-bubble")
    : null;
  if (!bubble) return;

  const selectedCategory = bubble.dataset.category;
  filterListByCategory(selectedCategory);

  // תן ל־DOM להתעדכן ואז גלול את הקונטיינר של הרשימה לראש.
  requestAnimationFrame(() => {
    requestAnimationFrame(scrollListTop);
  });
});
}

// לוגיקת שיתוף (Share)
shareIcon.addEventListener("click", async () => {
  let message = "📋 רשימת קניות:\n\n";
  const categories = {};

  for (const item in shoppingList) {
    const data = shoppingList[item];
    if (!categories[data.category]) categories[data.category] = [];
    let itemText = `• ${item}`;
    if (data.quantity) itemText += ` (${data.quantity})`;
    else if (data.size) itemText += ` (${data.size})`;
    categories[data.category].push(itemText);
  }

  for (const cat in categories) {
    message += `*${cat}*\n`;
    message += categories[cat].join("\n") + "\n\n";
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: "רשימת קניות", text: message });
      console.log("שיתוף הצליח!");
    } catch (error) {
      console.error("שגיאה בשיתוף:", error);
    }
  } else {
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");
    console.log("Web Share API לא נתמך, נשלח לוואטסאפ.");
  }
});

// עדכון ממשק המשתמש לפי רשימה שנשמרה
function updateUIWithSavedList(savedList) {
  const itemNames = document.querySelectorAll(".item-name");
  itemNames.forEach((itemNameSpan) => {
    const itemText = itemNameSpan.textContent.trim();
    if (savedList[itemText]) {
      const itemElement = itemNameSpan.closest(".item");
      if (!itemElement) return;

      const itemControlsDiv = itemElement.querySelector(".item-controls");
      const iconBtn = itemElement.querySelector(".icon-toggle");
      if (iconBtn) {
        iconBtn.classList.add("active");
        iconBtn.setAttribute("aria-pressed", "true");
      }
      if (itemControlsDiv) itemControlsDiv.classList.remove("locked");

      const savedData = savedList[itemText];
      if (savedData.quantity) {
        const valueSpan = itemElement.querySelector(".stepper-value");
        const quantityMatch = savedData.quantity.match(/\d+/);
        const quantity = quantityMatch ? quantityMatch[0] : "1";
        if (valueSpan) valueSpan.textContent = quantity;
      } else if (savedData.size) {
        const sizeButtons = itemElement.querySelectorAll(".size-button");
        sizeButtons.forEach((btn) => {
          btn.classList.remove("active");
          if (btn.textContent === savedData.size) btn.classList.add("active");
        });
        if (itemControlsDiv) {
         itemControlsDiv.classList.remove("locked");
         itemControlsDiv.classList.add("show-controls"); 
        }
      }
      
    }
  });
}



// פונקציית עזר: בונה properties ממוספרים (לשליטה בסדר בפיירסטור)
function buildNumberedProperties({ 
  userLabel, 
  ownerEmail, 
  sharedMainId, 
  sharedWith = [], 
  mergedWithLabel = null 
}) {
  return {
    "01_userLabel": userLabel || null,
    "02_ownerEmail": ownerEmail || null,
    "03_sharedMainId": sharedMainId || null,
    "04_sharedWith": sharedWith,
    "05_mergedWithLabel": mergedWithLabel,
  };
}

// פונקציית עזר: הופכת properties ממוספרים לאובייקט נוח לקוד
function normalizeProps(rawProps = {}) {
  return {
    userLabel: rawProps["01_userLabel"] || null,
    ownerEmail: rawProps["02_ownerEmail"] || null,
    sharedMainId: rawProps["03_sharedMainId"] || null,
    sharedWith: rawProps["04_sharedWith"] || [],
    mergedWithLabel: rawProps["05_mergedWithLabel"] || null,
  };
}

// שמירת רשימת הקניות ב-Firebase
// ⭐ שמירת רשימת הקניות לפי המודל החדש עם properties ממוספרים
// - אם יש sharedMainId → נשמור ברשימה משותפת (sharedMains)
// - אם אין → נשמור ב-zMainList האישי של המשתמש
// ⭐ שמירת רשימת הקניות לפי המודל החדש עם החלפה מלאה של ה-map בפיירסטור
async function saveShoppingList(userId, list) {
  // שמירה לקאש מקומי כרגיל
  saveShoppingCache(list);

  const user = auth.currentUser;
  if (!user) return;

  const safeList = list || {};

  try {
    if (sharedMainId) {
      // 🟩 מצב של רשימה משותפת – מחליפים את items *כולו*
      const sharedRef = doc(db, "sharedMains", sharedMainId);

      try {
        // מחליף את כל items במפה החדשה (מוחק מפתחות ישנים)
        await updateDoc(sharedRef, { items: safeList });
      } catch (err) {
        // אם המסמך עדיין לא קיים מסיבה כלשהי – נוצר אותו
        if (err.code === "not-found") {
          await setDoc(
            sharedRef,
            {
              items: safeList,
            },
            { merge: true } // כאן merge בסדר – כי זה יצירה ראשונה
          );
        } else {
          throw err;
        }
      }
    } else {
      // 🟦 רשימה פרטית למשתמש
      const userDocRef = doc(db, "users", userId);
      const { userLabel, ownerEmail } = buildUserMeta(user);

      const props = buildNumberedProperties({
        userLabel,
        ownerEmail,
        sharedMainId: null,
        sharedWith: [],
        mergedWithLabel: null,
      });

      try {
        // מחליף את zMainList במפה החדשה (מוחק פריטים שנעלמו)
        await updateDoc(userDocRef, {
          properties: props,
          zMainList: safeList,
        });
      } catch (err) {
        // אם זה משתמש חדש ואין עדיין דוקומנט → setDoc ראשון
        if (err.code === "not-found") {
          await setDoc(userDocRef, {
            properties: props,
            zMainList: safeList,
          });
        } else {
          throw err;
        }
      }
    }

    console.log("💾 רשימת קניות נשמרה (כולל מחיקת פריטים שנמחקו מהאובייקט)");
  } catch (error) {
    console.error("❌ שגיאה בשמירת רשימת הקניות:", error);
  }
}





// טעינת רשימת הקניות מ-Firebase
// ⭐ טעינת רשימת הקניות לפי המודל החדש:
// - אם יש sharedMainId → טוען מ-sharedMains/{sharedMainId}.items
// - אם אין → טוען מ-zMainList (או mainList/shoppingList ישנים לצורך תאימות)
async function loadUserShoppingList(userId) {
  const userDocRef = doc(db, "users", userId);

  try {
    const docSnap = await getDoc(userDocRef);

    if (!docSnap.exists()) {
      console.log("אין רשימה למשתמש זה.");
      shoppingList = {};
      sharedMainId = null;
      isLinkedToSharedList = false;
      saveShoppingCache(shoppingList);
      updateUserMenuState();
      return;
    }

    const data = docSnap.data();

    // 🔧 שלב 1: מנרמלים properties פעם אחת
    const propsNorm = normalizeProps(data.properties || {});
    const { sharedMainId: loadedSharedMainId, mergedWithLabel } = propsNorm;

    // לוגיקה חדשה:
    sharedMainId = loadedSharedMainId || null;
    isLinkedToSharedList = !!sharedMainId;

    if (sharedMainId) {
      // 🟩 רשימה מאוחדת
      const sharedRef = doc(db, "sharedMains", sharedMainId);
      const sharedSnap = await getDoc(sharedRef);

      if (sharedSnap.exists()) {
        shoppingList = sharedSnap.data().items || {};
      } else {
        shoppingList = {};
      }
      startSharedMainListener(sharedMainId);
    } else {
      // 🟦 רשימה אישית
      if (data.zMainList) {
        shoppingList = data.zMainList;
      } else if (data.mainList) {
        shoppingList = data.mainList;
      } else if (data.shoppingList) {
        shoppingList = data.shoppingList;
      } else {
        shoppingList = {};
      }
    }

    saveShoppingCache(shoppingList);
    updateUIWithSavedList(shoppingList);
    updateUIFromShoppingList();

    // 🔧 העברת הטיפול במיתוג ההדר לפה
    if (sharedMainId && mergedWithLabel) {
      setCurrentListLabel(mergedWithLabel);
    } else {
      setCurrentListLabel(null);
    }

    updateUserMenuState();
  } catch (error) {
    console.error("שגיאה בקבלת רשימת הקניות:", error);
  }
}


///=====פונקציית שליחת הזמנות=====/
// ⭐ שליחת הזמנה לאיחוד רשימות
// owner שולח הזמנה לכתובת מייל של אורח
async function sendInvite(targetEmailRaw) {
  const user = auth.currentUser;
  if (!user) {
    alert("כדי לשלוח הזמנה יש להתחבר קודם.");
    openAuthSheet();
    return;
  }

  if (sharedMainId) {
    alert("אתה כבר מחובר לרשימה משותפת. ניתוק יאפשר יצירת הזמנה חדשה.");
    return;
  }

  const targetEmail = (targetEmailRaw || "").trim();
  if (!targetEmail) {
    alert("נא להזין כתובת מייל תקינה.");
    return;
  }

  const { ownerEmail, ownerName } = buildUserMeta(user);
  if (!ownerEmail) {
    alert("לא נמצאה כתובת אימייל לחשבון שלך. אי אפשר לשלוח הזמנה.");
    return;
  }

  const normalizedTarget = normalizeEmail(targetEmail);
  const normalizedMe = normalizeEmail(ownerEmail);

  if (normalizedTarget === normalizedMe) {
    alert("אי אפשר לאחד רשימה עם עצמך 🙂");
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 שעות קדימה
  const invitesRef = collection(db, "invites");

  // 1) בדיקה אם כבר קיימת הזמנה ממתינה ש *אני* בעליה
  const qOwner = query(
    invitesRef,
    where("ownerUid", "==", user.uid),
    where("status", "==", "pending")
  );
  const ownerSnap = await getDocs(qOwner);

  for (const docSnap of ownerSnap.docs) {
    const data = docSnap.data();
    const exp =
      data.expiresAt && data.expiresAt.toDate
        ? data.expiresAt.toDate()
        : null;

    if (exp && exp < now) {
      // פג תוקף – מנקים
      await deleteDoc(docSnap.ref).catch(() => {});
      continue;
    }

    // קיימת הזמנה פעילה שאני שלחתי
    pendingInviteISent = { id: docSnap.id, ...data };
    hasPendingInviteISent = true;
    updateUserMenuState();
    alert("כבר קיימת הזמנה ממתינה. אפשר לבטל אותה, אבל לא ליצור נוספת.");
    return;
  }

  // 2) בדיקה אם כבר יש למשתמש הזמנה *אליו* (כאורח) שמחכה
  const qGuest = query(
    invitesRef,
    where("normalizedTargetEmail", "==", normalizedMe),
    where("status", "==", "pending")
  );
  const guestSnap = await getDocs(qGuest);

  for (const docSnap of guestSnap.docs) {
    const data = docSnap.data();
    const exp =
      data.expiresAt && data.expiresAt.toDate
        ? data.expiresAt.toDate()
        : null;

    if (exp && exp < now) {
      await deleteDoc(docSnap.ref).catch(() => {});
      continue;
    }

    // יש כבר הזמנה ממתינה אליך – אל תיצור אחת חדשה
    pendingInviteId = docSnap.id;
    hasPendingInvite = true;
    window._lastInvite = { id: docSnap.id, ...data };
    updateUserMenuState();
    alert("כבר קיימת הזמנה שממתינה אליך. טפל בה לפני יצירת הזמנה חדשה.");
    return;
  }

  // 3) יצירת הזמנה חדשה
  const inviteDocRef = doc(invitesRef); // id אוטומטי

  const inviteData = {
    ownerUid: user.uid,
    ownerName: ownerName || null,
    ownerEmail: ownerEmail,
    targetEmail,
    normalizedTargetEmail: normalizedTarget,
    createdAt: now,
    expiresAt,
    status: "pending",
  };

  await setDoc(inviteDocRef, inviteData);

  pendingInviteISent = { id: inviteDocRef.id, ...inviteData };
  hasPendingInviteISent = true;
  updateUserMenuState();

  alert("הזמנה לשיתוף הרשימה נשלחה. ההזמנה תקפה ל־24 שעות.");
}


///=====הקריאה לפייר בייס - בכל שינוי=====/
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserId = user.uid;

    const provider      = (user.providerData && user.providerData[0]) || null;
    const providerEmail = provider?.email || null;
    const providerName  = provider?.displayName || null;
    const displayName   = user.displayName || providerName || null;
    const sheet         = document.getElementById('auth-sheet');
    const backdrop      = document.getElementById('auth-backdrop');

    currentUserEmail = user.email || providerEmail || displayName || null;

    console.log("🔵 onAuthStateChanged user:", user);
    console.log("🔵 מחובר, uid:", currentUserId, "email:", currentUserEmail);

    if (sheet && backdrop) {
      sheet.classList.remove('show');
      backdrop.classList.remove('show');
      sheet.classList.add('hidden');
      backdrop.classList.add('hidden');
      sheet.setAttribute('aria-hidden', 'true');
    }

    // 🧹 מאפסים state הזמנות/שיתוף כדי להתחיל נקי לכל התחברות
    isLinkedToSharedList   = false;
    sharedMainId           = null;
    pendingInviteISent     = null;
    hasPendingInviteISent  = false;
    pendingInviteId        = null;
    hasPendingInvite       = false;
    pendingInviteForMe     = null;
    window._lastInvite     = null;

    // טוען רשימה וסטטוס sharedMainId (אם יש)
    await loadUserShoppingList(currentUserId);

    // בודק הזמנות אליי (כאורח)
    if (currentUserEmail) {
      await checkPendingInvitesForUser(currentUserEmail);
    }

    // בודק הזמנות שאני בעלים שלהן
    await checkOwnerInviteStatus();

  } else {
    console.log("🔴 לא מחובר");

    currentUserId          = null;
    currentUserEmail       = null;
    isLinkedToSharedList   = false;
    sharedMainId           = null;

    shoppingList = {};
    saveShoppingCache(shoppingList);

    // 🧹 איפוס מלא של כל ה־flags
    pendingInviteISent     = null;
    hasPendingInviteISent  = false;

    pendingInviteId        = null;
    hasPendingInvite       = false;

    pendingInviteForMe     = null;
    window._lastInvite     = null;

    // סוגרים גם listener לרשימה משותפת אם קיים
    if (sharedMainUnsub) {
      sharedMainUnsub();
      sharedMainUnsub = null;
    }
  }

  updateLoginButtonUI();
  updateUserMenuState();
});


///=====זיהוי הזמנות ממתינות לאורח=====/
async function checkPendingInvitesForUser(email) {
  if (!email) return;

  try {
    const invitesRef = collection(db, "invites");
    const q = query(
      invitesRef,
      where("normalizedTargetEmail", "==", normalizeEmail(email)),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      pendingInviteId = null;
      hasPendingInvite = false;
      updateUserMenuState();
      return;
    }

    const docSnap = snap.docs[0];
    const inviteData = docSnap.data();

    const now = new Date();
    const exp =
      inviteData.expiresAt && inviteData.expiresAt.toDate
        ? inviteData.expiresAt.toDate()
        : null;

    if (exp && exp < now) {
      // פג תוקף – נסמן כ-expired וננקה מצב לוקאלי
      try {
        await updateDoc(docSnap.ref, { status: "expired" });
      } catch (_) {}
      pendingInviteId = null;
      hasPendingInvite = false;
      updateUserMenuState();
      return;
    }

    pendingInviteId = docSnap.id;
    hasPendingInvite = true;

    window._lastInvite = {
      id: docSnap.id,
      ...inviteData,
    };
    //לחיצה על איחוד רשימות
    
    updateUserMenuState();
  } catch (err) {
    console.error("שגיאה בבדיקת הזמנות ממתינות:", err);
  }
}

///=====זיהוי הזמנות שנדחו - צד הבעלים=====/
async function checkOwnerInviteStatus() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const invitesRef = collection(db, "invites");
    const q = query(
      invitesRef,
      where("ownerUid", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const snap = await getDocs(q);
    if (snap.empty) return;

    const docSnap = snap.docs[0];
    const inv = docSnap.data();

    // אם עדיין pending – אין מה לעשות כאן
    if (inv.status === "pending") {
      // נוודא שה־state הלוקאלי מעודכן
      pendingInviteISent = { id: docSnap.id, ...inv };
      hasPendingInviteISent = true;
      updateUserMenuState();
      return;
    }

    // מפה והלאה: ההזמנה כבר נסגרה (rejected / accepted / cancelled / expired)
    // אם כבר ראינו בעבר – לא להציק שוב
    if (inv.ownerSeen) return;
    
    let msg;
    switch (inv.status) {
      case "rejected":
        msg = `ההזמנה לשיתוף הרשימה עם ${inv.targetEmail || "המשתמש השני"} נדחתה.`;
        break;
      case "cancelled":
        msg = `ההזמנה בוטלה.`;
        break;
      case "expired":
        msg = `ההזמנה לשיתוף הרשימה פגה (עברו 24 שעות).`;
        break;
      case "accepted":
        msg = `ההזמנה לשיתוף הרשימה עם ${inv.targetEmail || "המשתמש השני"} אושרה.`;
        break;
      default:
        msg = null;
    }

    await loadUserShoppingList(user.uid);

    if (msg) {
      alert(msg);
    }

    // מסמנים שראינו כדי לא להציג שוב
    await updateDoc(docSnap.ref, { ownerSeen: true });

    // מנקים state לוקאלי (אין יותר הזמנה פתוחה)
    pendingInviteISent = null;
    hasPendingInviteISent = false;
    updateUserMenuState();

    // ועכשיו אפשר למחוק לגמרי (או להשאיר ל-cleanup של השרת)
    await deleteDoc(docSnap.ref).catch(() => {});

  } catch (err) {
    console.error("שגיאה בבדיקת מצב הזמנות של בעלים:", err);
  }
}

///=====אישור הזמנה → יצירת sharedMain=====/
async function acceptInvite(inviteId) {
  if (!inviteId || !currentUserId) return;

  const inviteRef = doc(db, "invites", inviteId);
  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists()) {
    console.warn("הזמנה לא קיימת");
    alert("ההזמנה כבר לא קיימת או נסגרה. אפשר לבקש מהצד השני לשלוח שוב.");
    updateUserMenuState();
    return;
  }

  const inv = inviteSnap.data();

  if (inv.status !== "pending") {
    console.warn("ההזמנה כבר לא במצב pending:", inv.status);
    alert("ההזמנה כבר לא קיימת או נסגרה. אפשר לבקש מהצד השני לשלוח שוב.");
    updateUserMenuState();
    return;
  }

  // בדיקת תוקף
  if (inv.expiresAt && inv.expiresAt.toMillis && inv.expiresAt.toMillis() < Date.now()) {
    console.warn("ההזמנה פגה");
    alert("ההזמנה כבר לא קיימת או נסגרה. אפשר לבקש מהצד השני לשלוח שוב.");
    try {
      await updateDoc(inviteRef, { status: "expired" });
    } catch (_) {}
    pendingInviteId   = null;
    hasPendingInvite  = false;
    updateUserMenuState();
    return;
  }

  const ownerUid   = inv.ownerUid;
  const ownerEmail = inv.ownerEmail || null;
  const ownerName  = inv.ownerName  || null;
  const guestUid   = currentUserId;

  // 1) טוענים את רשימת הבעלים כבסיס
  const ownerDocRef = doc(db, "users", ownerUid);
  const ownerSnap   = await getDoc(ownerDocRef);

  let baseList = {};
  let ownerPropsRaw = {};
  if (ownerSnap.exists()) {
    const ownerData = ownerSnap.data();
    baseList =
      ownerData.zMainList ||
      ownerData.mainList ||
      ownerData.shoppingList ||
      {};
    ownerPropsRaw = ownerData.properties || {};
  }

  // 2) גם את מסמך האורח נטען (לצורך properties קיימים)
  const guestDocRef = doc(db, "users", guestUid);
  const guestSnap   = await getDoc(guestDocRef);
  const guestPropsRaw = guestSnap.exists() ? (guestSnap.data().properties || {}) : {};

  // ממירים properties ממוספרים לאובייקט נוח
  const ownerPropsNormalized = normalizeProps(ownerPropsRaw);
  const guestPropsNormalized = normalizeProps(guestPropsRaw);

  // 3) בונים ID לרשימה המשותפת
  const ownerSuffix      = ownerUid.slice(-6);
  const guestSuffix      = guestUid.slice(-6);
  const newSharedMainId  = `shared_${ownerSuffix}_${guestSuffix}`;

  // 4) יוצרים מסמך sharedMains/{sharedMainId}
  const sharedRef = doc(db, "sharedMains", newSharedMainId);
  await setDoc(
    sharedRef,
    {
      name: `shared: ${ownerName || ownerEmail || ownerUid}`,
      ownerUid,
      ownerEmail,
      ownerName,
      participants: [
        { uid: ownerUid,  email: ownerEmail },
        { uid: guestUid,  email: currentUserEmail || null },
      ],
      items: baseList,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 5) מעדכנים את מסמכי המשתמשים (owner + guest) – עם properties ממוספרים
  const labelForOwner = inv.targetEmail || "משתמש נוסף";
  const labelForGuest = ownerName || ownerEmail || "משתמש נוסף";

  await Promise.all([
    setDoc(
      ownerDocRef,
      {
        properties: buildNumberedProperties({
          ...ownerPropsNormalized,
          sharedMainId: newSharedMainId,
          mergedWithLabel: `משותפת עם ${labelForOwner}`,
        }),
      },
      { merge: true }
    ),
    setDoc(
      guestDocRef,
      {
        properties: buildNumberedProperties({
          ...guestPropsNormalized,
          sharedMainId: newSharedMainId,
          mergedWithLabel: `משותפת עם ${labelForGuest}`,
        }),
      },
      { merge: true }
    ),
  ]);

  // 6) מעדכנים את ההזמנה כ-accepted
  await updateDoc(inviteRef, {
    status: "accepted",
    sharedMainId: newSharedMainId,
  });

  // 7) מעדכנים state לוקאלי
  sharedMainId          = newSharedMainId;
  isLinkedToSharedList  = true;
  pendingInviteId       = null;
  hasPendingInvite      = false;

  // 8) מאזינים מעכשיו לרשימה המשותפת בריל-טיים
  startSharedMainListener(newSharedMainId);

  console.log("✅ ההזמנה אושרה והמעבר לרשימה משותפת הושלם");

  // 9) מעדכנים סאבטייטל בהדר
  setCurrentListLabel(`משותפת עם ${labelForGuest}`);

  // 9) מעדכנים סטייט במניו
  updateUserMenuState();
}


//=====דחיית הזמנה=====/
async function rejectInvite(inviteId) {
  if (!inviteId || !currentUserId) return;

  const ok = confirm("אתה בטוח שברצונך לדחות את ההזמנה?");
  if (!ok) return;

  const inviteRef = doc(db, "invites", inviteId);

  try {
    await updateDoc(inviteRef, { status: "rejected" });
    // אופציונלי: אפשר גם deleteDoc(inviteRef);
  } catch (err) {
    console.error("שגיאה בדחיית הזמנה:", err);
  }

  pendingInviteId = null;
  hasPendingInvite = false;
  updateUserMenuState();

  console.log("🚫 ההזמנה נדחתה");
}


//=====ביטול הזמנה=====/
async function cancelInviteISent() {
  if (!pendingInviteISent?.id) return;

  const ok = confirm("לבטל את ההזמנה ששלחת?");
  if (!ok) return;

  const inviteRef = doc(db, "invites", pendingInviteISent.id);

  try {
    await updateDoc(inviteRef, { status: "cancelled" });
  } catch (err) {
    console.error("שגיאה בביטול הזמנה:", err);
  }

  pendingInviteISent = null;
  hasPendingInviteISent = false;
  updateUserMenuState();

  console.log('❌ ההזמנה שבוטלה ע"י הבעלים');
}


//=====ניתוק מרשימה משותפת (שבירת חיבור)=====/
async function disconnectSharedMain() {
  if (!sharedMainId || !currentUserId) return;

  const ok = confirm("לנתק את הרשימה המשותפת? הרשימה תשמר לכל אחד כרשימה פרטית.");
  if (!ok) return;

  // סוגרים listener חי
  if (sharedMainUnsub) {
    sharedMainUnsub();
    sharedMainUnsub = null;
  }
  const sharedRef = doc(db, "sharedMains", sharedMainId);
  const sharedSnap = await getDoc(sharedRef);

  if (!sharedSnap.exists()) {
    console.warn("sharedMain לא נמצא, מאפס מצב לוקאלי בלבד");
    sharedMainId = null;
    isLinkedToSharedList = false;
    setCurrentListLabel(null);
    updateUserMenuState();
    return;
  }

  const sharedData = sharedSnap.data();
  const items = sharedData.items || {};
  const participants = sharedData.participants || [];

  // 1) לכל משתתף – מעתיקים את הרשימה המשותפת ל-zMainList האישי ומאפסים sharedMainId
  const updatePromises = participants.map(async (p) => {
    if (!p.uid) return;

    const userRef = doc(db, "users", p.uid);
    const userSnap = await getDoc(userRef);
    const rawProps = (userSnap.exists() && userSnap.data().properties) || {};
    const norm = normalizeProps(rawProps);

    norm.sharedMainId    = null;
    norm.mergedWithLabel = null;

    return setDoc(
      userRef,
      {
        zMainList: items,
        properties: buildNumberedProperties(norm),
      },
      { merge: true }
    );
  });


  try {
    await Promise.all(updatePromises);
    // 2) מוחקים את הרשימה המשותפת מהשרת
    await deleteDoc(sharedRef);
  } catch (err) {
    console.error("שגיאה בניתוק רשימה משותפת:", err);
  }

  // 3) בצד הלקוח הנוכחי – חוזרים לרשימה פרטית
  shoppingList = items;
  saveShoppingCache(shoppingList);

  sharedMainId = null;
  isLinkedToSharedList = false;

  updateUIWithSavedList(shoppingList);
  updateUIFromShoppingList();
  updateUserMenuState();
  setCurrentListLabel(null);
  console.log("🔗 נותקת מהרשימה המשותפת, והרשימה נשמרה כפרטית");
}


/*======כפונקציית איפוס======*/
function resetShoppingList() {
  // 1) איפוס האובייקט בזיכרון
  shoppingList = {};

  // 2) שמירה לקאש המקומי
  saveShoppingCache(shoppingList);

  // 3) שמירה ל־Firestore (אם יש משתמש מחובר)
  if (currentUserId) {
    saveShoppingList(currentUserId, shoppingList);
  }

  // 4) עדכון UI — מבטל אייקון ירוק ומחביא בקרי כמות/מידה
  document.querySelectorAll('.icon-toggle.active').forEach(el => {
    el.classList.remove('active');
    el.setAttribute('aria-pressed', 'false');
  });

  document.querySelectorAll('.item-controls').forEach(ctrl => {
    ctrl.classList.add('locked');
    ctrl.classList.remove('show-controls');
  });

  console.log("✅ הרשימה אופסה");
}


//////////פונקציה שמעדכנת את מצב כפתור "שבירת חיבור"//////
function updateUserMenuState() {
  if (!userMergeBtn || !userDisconnectBtn) return;

  // 🔗 אם יש sharedMainId – במצב של רשימה משותפת
  if (isLinkedToSharedList && sharedMainId) {
    userDisconnectBtn.disabled = false;
    userDisconnectBtn.classList.remove("hidden");

    userMergeBtn.disabled = true;
    userMergeBtn.classList.add("hidden");

    loginBtn?.classList.remove("has-badge");
    return;
  }

  // 📨 אם יש הזמנה *אליי* כאורח
  if (hasPendingInvite && pendingInviteId) {
    userDisconnectBtn.disabled = true;
    userDisconnectBtn.classList.add("hidden");

    userMergeBtn.disabled = false;
    userMergeBtn.classList.remove("hidden");
    userMergeBtn.textContent = "אישור הזמנה";

    loginBtn?.classList.add("has-badge");
    return;
  }

  // 📤 אם יש הזמנה שאני שלחתי (כבעלים)
  if (hasPendingInviteISent && pendingInviteISent) {
    userDisconnectBtn.disabled = true;
    userDisconnectBtn.classList.add("hidden");

    userMergeBtn.disabled = false;
    userMergeBtn.classList.remove("hidden");
    userMergeBtn.textContent = "ביטול הזמנה";

    loginBtn?.classList.add("has-badge");
    return;
  }

  // 🔄 מצב רגיל – אין שיתוף, אין הזמנות
  userMergeBtn.disabled = false;
  userMergeBtn.classList.remove("hidden");
  userMergeBtn.textContent = "איחוד רשימות";

  userDisconnectBtn.disabled = true;
  userDisconnectBtn.classList.add("hidden");

  loginBtn?.classList.remove("has-badge");
}


/* ===== ניהול הסאב של ההדר ===== */
const headerSubtitleEl = document.getElementById('header-subtitle');
let currentListLabel = null; // תיאור הרשימה הנוכחית (פרטית / משותפת / "רשימת שבת" וכו')

function setCurrentListLabel(label) {
  currentListLabel = label || null;
  if (!headerSubtitleEl) return;

  if (currentListLabel) {
    headerSubtitleEl.textContent = currentListLabel;
    headerSubtitleEl.classList.add('visible');
  } else {
    headerSubtitleEl.textContent = '';
    headerSubtitleEl.classList.remove('visible');
  }
}


/* ===== Bottom bar actions (skeletons) ===== */
const loginBtn = document.getElementById('btn-login');
const loginIcon = loginBtn?.querySelector('ion-icon');

function updateLoginButtonUI() {
  if (!loginBtn || !loginIcon) return;

  if (currentUserId) {
    // מחובר → אייקון עגול + ירוק
    loginBtn.classList.add('connected');
    loginIcon.setAttribute('name', 'person');
  } else {
    // לא מחובר → אייקון רגיל + אפור
    loginBtn.classList.remove('connected');
    loginIcon.setAttribute('name', 'person-outline');
  }
}

if (loginBtn) {
  loginBtn.addEventListener('click', () => {
    if (currentUserId) {
      openUserMenu();
    } else {
      openAuthSheet();
    }
  });
}




document.getElementById('btn-my-lists')?.addEventListener('click', () => {
  console.log('הרשימות שלי – נגדיר בהמשך');
});

document.addEventListener('DOMContentLoaded', () => {
  const resetBtn = document.getElementById('btn-reset');

  if (!resetBtn) {
    console.warn('⚠️ לא נמצא btn-reset ב-DOM בזמן טעינת הסקריפט');
  } else {
    console.log('✅ נמצא btn-reset וה־listener חובר');
    resetBtn.addEventListener('click', openResetSheet);
  }
});


document.addEventListener('DOMContentLoaded', () => {
  const shareIconHeader = document.getElementById('share-icon');
  const bottomShareBtn = document.getElementById('btn-share');

  if (bottomShareBtn && shareIconHeader) {
    bottomShareBtn.addEventListener('click', (e) => {
      e.preventDefault();
      shareIconHeader.click(); // קורא לפונקציית השיתוף הקיימת בדיוק
    });
  }
});


if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmailInput.value.trim();
    const password = authPassInput.value;

    authStatus.textContent = '';
    authStatus.className = 'auth-status';

    if (!email || !password) {
      authStatus.textContent = 'נא למלא אימייל וסיסמה';
      authStatus.classList.add('error');
      return;
    }

    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        authStatus.textContent = 'מחובר בהצלחה';
        authStatus.classList.add('success');
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        authStatus.textContent = 'משתמש נוצר ומחובר';
        authStatus.classList.add('success');
      }

      // נסגור את ה-sheet קצת אחרי feedback קצר
      setTimeout(closeAuthSheet, 350);
    } catch (err) {
      console.error('Auth error:', err);
      authStatus.textContent =
        err.code === 'auth/wrong-password'
          ? 'סיסמה לא נכונה'
          : err.code === 'auth/user-not-found'
          ? 'לא נמצא משתמש. נסה להירשם'
          : 'שגיאה בהתחברות: ' + (err.message || '');
      authStatus.classList.add('error');
    }
  });
}

///////////////
// ===== Saved Lists Sheet (רשימות שמורות) =====
const listsSheet     = document.getElementById('lists-sheet');
const listsBackdrop  = document.getElementById('lists-sheet-backdrop');
const listsAddBtn    = document.getElementById('lists-add-btn');
const savedListsList = document.getElementById('saved-lists-list');

if (listsSheet && listsBackdrop) {
  attachSheetDrag(listsSheet, listsBackdrop);

  // פתיחה
  function openListsSheet() {
    listsSheet.openSheet();
  }

  // סגירה (אם תרצה להשתמש בהמשך)
  function closeListsSheet() {
    listsSheet.closeSheet();
  }

  // חיבור לכפתור בסרגל התחתון
  const myListsBtn = document.getElementById('btn-my-lists');
  if (myListsBtn) {
    myListsBtn.addEventListener('click', () => {
      openListsSheet();
    });
  }

  // כרגע – כפתור "הוסף רשימה" רק כ־placeholder
  if (listsAddBtn) {
    listsAddBtn.addEventListener('click', () => {
      console.log('TODO: הוספת רשימה חדשה – נממש בשלב הבא');
      // כאן בהמשך:
      // - ניקח שם לרשימה
      // - נשמור ל-Firestore/localStorage
      // - נוסיף <li> חדש ל-saved-lists-list
    });
  }
} else {
  console.warn('⚠️ lists-sheet או lists-sheet-backdrop לא נמצאו ב-DOM');
}


/** ---------- RESET: action sheet + logic (HTML סטטי) ---------- **/

function ensureResetSheet() {
  const sheet    = document.getElementById('reset-sheet');
  const backdrop = document.getElementById('reset-sheet-backdrop');

  if (!sheet || !backdrop) {
    console.warn('⚠️ reset-sheet או reset-sheet-backdrop לא נמצאו ב-DOM');
    return;
  }

  // כדי שלא נחבר אירועים פעמיים
  if (sheet._initialized) return;

  // דרג + openSheet / closeSheet
  attachSheetDrag(sheet, backdrop);

  const btnResetSelected = sheet.querySelector('#btn-reset-selected');
  const btnResetCategory = sheet.querySelector('#btn-reset-category');
  const catNameSpan      = sheet.querySelector('#reset-cat-name');


  // איפוס כל הפריטים המסומנים
  btnResetSelected.addEventListener('click', async () => {
    const ok = confirm('אתה בטוח שתרצה לאפס את כל הפריטים המסומנים?');
    if (!ok) return;
    await resetSelectedItemsWithFX();
    sheet.closeSheet();
  });

  // איפוס פריטים מסומנים בקטגוריה הנוכחית
  btnResetCategory.addEventListener('click', async () => {
    if (!currentCategory || currentCategory === 'הכל') return;

    const ok = confirm(`לאפס פריטים מסומנים בקטגוריה "${currentCategory}"?`);
    if (!ok) return;

    await resetCategorySelectedWithFX(currentCategory);
    sheet.closeSheet();
  });

  // הכנה לפני פתיחה – מעדכן שם קטגוריה + האם הכפתור השני זמין
  sheet.prepareForOpen = () => {
    const normalized = (currentCategory || '').trim();
    catNameSpan.textContent = normalized || '—';

    const canResetCategory = normalized && normalized !== 'הכל';

    btnResetCategory.disabled = !canResetCategory;
    btnResetCategory.classList.toggle('disabled', !canResetCategory);
  };


  sheet._initialized = true;
}



// פותח את הדיאלוג
function openResetSheet() {
  ensureResetSheet();
  const sheet = document.getElementById('reset-sheet');
  if (!sheet) return;

  if (typeof sheet.prepareForOpen === 'function') {
    sheet.prepareForOpen();
  }
  sheet.openSheet();
}




// מחזיר Promise קטן עבור תזמון אנימציה
const wait = (ms) => new Promise(r => setTimeout(r, ms));

//פונקציית עזר לאיפוס שגם מנקה כמויות / גדלים
function resetItemCompletely(itemEl) {
  if (!itemEl) return;

  // 1) מחיקת הערך מה־shoppingList (לפי שם הפריט)
  const name = itemEl.querySelector('.item-name')?.textContent?.trim();
  if (name && shoppingList[name]) {
    delete shoppingList[name];
  }

  // 2) איפוס האייקון
  const icon = itemEl.querySelector('.icon-toggle');
  if (icon) {
    icon.classList.remove('active');
    icon.setAttribute('aria-pressed', 'false');
  }

  // 3) איפוס בקרי השליטה (כמות / גודל וכו')
  const controls = itemEl.querySelector('.item-controls');
  if (controls) {
    controls.classList.add('locked');
    controls.classList.remove('show-controls');

    // inputים כלליים בתוך הפריט (למקרה שיהיו בעתיד)
    controls.querySelectorAll('input').forEach(input => {
      if (input.type === 'number' || input.type === 'text') {
        input.value = '';
      } else if (input.type === 'checkbox' || input.type === 'radio') {
        input.checked = false;
      }
    });

    // selectים אם יהיו
    controls.querySelectorAll('select').forEach(sel => {
      sel.selectedIndex = 0;
    });

    // stepper של כמות – חזרה ל־1
    const stepperValue = controls.querySelector('.stepper-value');
    if (stepperValue) {
      stepperValue.textContent = '1';
    }

    // כפתורי מידות – מנקים ומחזירים S כברירת מחדל
    const sizeButtons = controls.querySelectorAll('.size-button');
    if (sizeButtons.length > 0) {
      sizeButtons.forEach(btn => btn.classList.remove('active'));
      sizeButtons[0].classList.add('active'); // S
    }
  }

  // להסיר אם נשאר fade-out
  itemEl.classList.remove('fade-out');
}


// אנימציית פידבק לכפתור האיפוס בתחתית
function bumpResetButton() {
  const btn = document.getElementById('btn-reset');
  if (!btn) return;
  btn.classList.add('bump');
  setTimeout(()=>btn.classList.remove('bump'), 180);
}

/** איפוס פריטים מסומנים בלבד + פידבק ויזואלי (מתוקן) */
async function resetSelectedItemsWithFX() {
  bumpResetButton();

  const activeIcons = Array.from(document.querySelectorAll('.icon-toggle.active'));
  if (activeIcons.length === 0) {
    console.log('אין פריטים מסומנים לאיפוס.');
    return;
  }

  const items = activeIcons
    .map(icon => icon.closest('.item'))
    .filter(Boolean);

  // אנימציית יציאה
  items.forEach(item => item.classList.add('fade-out'));
  await wait(220);

  // איפוס מלא לכל פריט
  items.forEach(item => resetItemCompletely(item));

  // שמירה
  saveShoppingCache(shoppingList);
  if (currentUserId) saveShoppingList(currentUserId, shoppingList);

  console.log('✅ אופסו רק הפריטים שסומנו (כולל כמויות/גדלים).');
}



////////////////
/*פונקציה חדשה שמאפסת רק פריטים מסומנים באותה קטגוריה*/
async function resetCategorySelectedWithFX(categoryName) {
  bumpResetButton();

  const wrappers = [...document.querySelectorAll(
    `.category-wrapper[data-category="${categoryName}"]`
  )];

  const items = wrappers.flatMap(w =>
    [...w.querySelectorAll('.icon-toggle.active')]
      .map(icon => icon.closest('.item'))
      .filter(Boolean)
  );

  if (items.length === 0) {
    console.log('אין פריטים מסומנים בקטגוריה:', categoryName);
    return;
  }

  items.forEach(item => item.classList.add('fade-out'));
  await wait(220);

  items.forEach(item => resetItemCompletely(item));

  saveShoppingCache(shoppingList);
  if (currentUserId) saveShoppingList(currentUserId, shoppingList);

  console.log(`✅ אופסו הפריטים המסומנים בקטגוריה: ${categoryName}`);
}


//
function hideHtmlSplash() {
  const splash = document.getElementById('html-splash');
  if (!splash) return;

  splash.classList.add('hide');

  // אחרי האנימציה – נוריד לגמרי מה-DOM
  setTimeout(() => {
    if (splash && splash.parentNode) {
      splash.parentNode.removeChild(splash);
    }
  }, 400);
}

// כשכל העמוד נטען (כולל CSS, תמונות וכו’)
window.addEventListener('load', () => {
  // אפשר דיליי קטן כדי לתת לכל ה־JS שלך לסיים לגרדֵר את הרשימה
  setTimeout(hideHtmlSplash, 300);
});

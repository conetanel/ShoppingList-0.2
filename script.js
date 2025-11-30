
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
  getDoc
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
  const standaloneIOS = isIOS() && isStandalone();

  try {
    if (standaloneIOS) {
      // PWA על iOS → redirect
      await signInWithRedirect(auth, googleProvider);
    } else {
      // כרום / דסקטופ / אנדרואיד → popup
      await signInWithPopup(auth, googleProvider);
    }
  } catch (err) {
    console.error('שגיאה בהתחברות Google:', err);
    alert('שגיאה בהתחברות עם Google: ' + (err.code || '') + ' ' + (err.message || ''));
  }
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
const userMenuCancelBtn  = document.getElementById('user-menu-cancel');
const userLogoutBtn      = document.getElementById('user-logout-btn');
const userMergeBtn       = document.getElementById('user-merge-btn');
const userDisconnectBtn  = document.getElementById('user-disconnect-btn');


function attachSheetDrag(sheetEl, backdropEl) {
  if (!sheetEl || !backdropEl) return;

  // כל החלון הוא הידית
  const handle = sheetEl;

  let pointerDown = false;
  let dragging = false;
  let startY = 0;
  let currentY = 0;
  let dragStartDelta = 0; // כאן נשמור את ה"דלתא" הראשונה כדי למנוע קפיצה

  const DRAG_CLOSE_THRESHOLD = 80;   // כמה למשוך למטה כדי לסגור
  const DRAG_START_THRESHOLD = 6;    // כמה לזוז עד שנבין שזה drag ולא tap

  function applyTransform(delta) {
    if (delta < 0) {
      // גומי למעלה – עם דעיכה
      const abs = Math.abs(delta);
      const damped = -Math.pow(abs, 0.35) * 6; // אפשר לשחק עם 0.35 / 6
      sheetEl.style.transform = `translateY(${damped}px)`;
    } else {
      // משיכה למטה 1:1
      sheetEl.style.transform = `translateY(${delta}px)`;
    }
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

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
      // עוד לא נכנסנו למצב גרירה – בודקים סף
      if (Math.abs(rawDelta) < DRAG_START_THRESHOLD) return;
      dragging = true;

      // פה מתרחשת ה"קפיצה" בגרסה הישנה – אנחנו מונעים אותה:
      dragStartDelta = rawDelta;             // זוכרים מאיפה התחלנו
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
      // Tap בלבד – לא זזנו
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

  if (userMenuEmailLabel) {
    userMenuEmailLabel.textContent = currentUserEmail
      ? `מחובר כ־ ${currentUserEmail}`
      : 'לא מחובר';
  }

  userMenuSheet.openSheet();  // משתמש בפונקציה מה-attachSheetDrag
}

function closeUserMenu() {
  if (!userMenuSheet || !userMenuBackdrop) return;
  userMenuSheet.closeSheet();
}

if (userMenuCancelBtn) {
  userMenuCancelBtn.addEventListener('click', closeUserMenu);
}
if (userMenuBackdrop) {
  userMenuBackdrop.addEventListener('click', closeUserMenu);
}

// בינתיים – placeholders ללחצנים שבתפריט:
if (userMergeBtn) {
  userMergeBtn.addEventListener('click', () => {
    console.log('🧑‍🤝‍🧑 איחוד רשימות – נבנה בשלב הבא');
    alert('איחוד רשימות יתווסף בשלב הבא של הפיתוח 🙂');
  });
}

if (userDisconnectBtn) {
  userDisconnectBtn.addEventListener('click', () => {
    // בהמשך: שבירת חיבור מ-groupId
    alert('שבירת חיבור תופעל אחרי שנגדיר מנגנון רשימה משותפת (groupId).');
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
const authForm       = document.getElementById('auth-form');
const authEmailInput = document.getElementById('auth-email');
const authPassInput  = document.getElementById('auth-password');
const authToggleBtn  = document.getElementById('auth-toggle-mode');
const authCancelBtn  = document.getElementById('auth-cancel');
const authStatus     = document.getElementById('auth-status');
const authSubmitBtn  = document.getElementById('auth-submit-btn');

let authMode = 'login'; // 'login' או 'signup'

function openAuthSheet() {
  if (!authSheet || !authBackdrop) return;
  authSheet.classList.remove('hidden');
  authBackdrop.classList.remove('hidden');
  // קצת delay כדי שהאנימציה תעבוד יפה
  requestAnimationFrame(() => {
    authSheet.classList.add('show');
    authBackdrop.classList.add('show');
  });
  authStatus.textContent = '';
  authStatus.className = 'auth-status';
}

function closeAuthSheet() {
  if (!authSheet || !authBackdrop) return;
  authSheet.classList.remove('show');
  authBackdrop.classList.remove('show');
  setTimeout(() => {
    authSheet.classList.add('hidden');
    authBackdrop.classList.add('hidden');
  }, 240);
}

if (authCancelBtn && authBackdrop) {
  authCancelBtn.addEventListener('click', closeAuthSheet);
  authBackdrop.addEventListener('click', closeAuthSheet);
}

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
      if (currentUserId) saveShoppingList(currentUserId, shoppingList);
    } else {
      itemControlsDiv.classList.add("locked");
      itemControlsDiv.classList.remove("show-controls");
      delete shoppingList[itemObj.item];
      if (currentUserId) saveShoppingList(currentUserId, shoppingList);
    }
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

// שמירת רשימת הקניות ב-Firebase
function saveShoppingList(userId, list) {
  saveShoppingCache(list); 
  const userDocRef = doc(db, "users", userId);
  setDoc(userDocRef, { shoppingList: list }, { merge: true })
    .then(() => console.log("רשימת קניות נשמרה בהצלחה!"))
    .catch((error) => console.error("שגיאה בשמירת רשימת הקניות:", error));
}

// טעינת רשימת הקניות מ-Firebase
async function loadUserShoppingList(userId) {
  const userDocRef = doc(db, "users", userId);
  try {
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.shoppingList) {
        shoppingList = data.shoppingList;

        saveShoppingCache(shoppingList);

        updateUIWithSavedList(shoppingList);
        console.log("רשימת קניות נטענה:", shoppingList);

        updateUIFromShoppingList();
      }
      isLinkedToSharedList = !!data.groupId;
    } else {
      console.log("לא נמצאה רשימה שמורה למשתמש זה.");
      isLinkedToSharedList = false;
    }
    updateUserMenuState();
  } catch (error) {
    console.error("שגיאה בקבלת נתונים:", error);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserId = user.uid;
    currentUserEmail = user.email || null;

    console.log("🔵 מחובר עם Google:", currentUserEmail);

    // --- שינוי האייקון למצב מחובר ---
    if (loginBtn) {
      loginBtn.classList.add("connected");
      const icon = loginBtn.querySelector("ion-icon");
      if (icon) icon.setAttribute("name", "person"); // אייקון מלא
    }

    await loadUserShoppingList(currentUserId);

  } else {
    currentUserId = null;
    currentUserEmail = null;
    console.log("⚪ משתמש אורח");
    isLinkedToSharedList = false;
    updateUserMenuState();

    // --- החזרת האייקון למצב רגיל ---
    if (loginBtn) {
      loginBtn.classList.remove("connected");
      const icon = loginBtn.querySelector("ion-icon");
      if (icon) icon.setAttribute("name", "person-outline");
    }
  }
});




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

  if (isLinkedToSharedList) {
    // יש groupId → מציגים "שבירת חיבור", מסתירים "איחוד"
    userDisconnectBtn.disabled = false;
    userDisconnectBtn.classList.remove('hidden');

    userMergeBtn.disabled = true;
    userMergeBtn.classList.add('hidden');
  } else {
    // אין groupId → מציגים "איחוד רשימות", מסתירים "שבירת חיבור"
    userMergeBtn.disabled = false;
    userMergeBtn.classList.remove('hidden');

    userDisconnectBtn.disabled = true;
    userDisconnectBtn.classList.add('hidden');
  }
}


/* ===== Bottom bar actions (skeletons) ===== */
const loginBtn = document.getElementById('btn-login');

if (loginBtn) {
  loginBtn.addEventListener('click', () => {
    // אם יש משתמש מחובר → נפתח תפריט משתמש
    if (currentUserId) {
      openUserMenu();   // פונקציה שכבר קיימת אצלך למעלה
      return;
    }

    // לא מחובר → נתחיל התחברות עם גוגל
    loginWithGoogle();
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
/* לוגיקת דיאלוג אישור איפוס*/

/** ---------- RESET: action sheet + logic ---------- **/

// יוצר את ה-Action Sheet פעם אחת
function ensureResetSheet() {
  if (document.getElementById('reset-sheet')) return;

  const sheet = document.createElement('div');
  sheet.id = 'reset-sheet';
  sheet.className = 'reset-sheet hidden';
  sheet.innerHTML = `
    <div class="sheet-handle" data-sheet-handle></div>
    <div class="reset-sheet-title">איפוס הרשימה</div>
    <div class="reset-actions">
      <button class="reset-btn warning" id="btn-reset-selected">
        איפוס פריטים מסומנים
      </button>
      <button class="reset-btn secondary" id="btn-reset-category" disabled>
        איפוס פריטים מסומנים בקטגוריה <span id="reset-cat-name">—</span>
      </button>
    </div>
  `;

  const backdrop = document.createElement('div');
  backdrop.id = 'reset-sheet-backdrop';
  backdrop.className = 'auth-backdrop hidden'; // או מחלקה דומה לרקע שקוף

  document.body.appendChild(sheet);
  document.body.appendChild(backdrop);

  // מחברים דרג + open/close מהפונקציה למעלה
  attachSheetDrag(sheet, backdrop);

  // כפתורי האיפוס
  const btnResetSelected = sheet.querySelector('#btn-reset-selected');
  const btnResetCategory = sheet.querySelector('#btn-reset-category');
  const catNameSpan      = sheet.querySelector('#reset-cat-name');

  // איפוס מסומנים – עם confirm קטן
  btnResetSelected.addEventListener('click', async () => {
    const ok = confirm('אתה בטוח שתרצה לאפס את כל הפריטים המסומנים?');
    if (!ok) return;
    await resetSelectedItemsWithFX();
    sheet.closeSheet();
  });

  // איפוס לפי קטגוריה נוכחית
  btnResetCategory.addEventListener('click', async () => {
    if (!currentCategory || currentCategory === 'הכל') return;
    const ok = confirm(`לאפס פריטים מסומנים בקטגוריה "${currentCategory}"?`);
    if (!ok) return;
    await resetCategorySelectedWithFX(currentCategory);
    sheet.closeSheet();
  });

  // פונקציה קטנה שתעדכן את שם הקטגוריה ואת enabled/disabled
  sheet.prepareForOpen = () => {
    catNameSpan.textContent = currentCategory || '—';
    const canResetCategory = currentCategory && currentCategory !== 'הכל';
    btnResetCategory.disabled = !canResetCategory;
    btnResetCategory.classList.toggle('disabled', !canResetCategory);
  };

  // נשמור רפרנס גלובלי אם תרצה, אבל לא חובה
}





// פותח את הדיאלוג
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

  // 1) לוכדים את כל הפריטים המסומנים כרגע + שמותיהם (לפני שינויים ב-DOM)
  const activeIcons = Array.from(document.querySelectorAll('.icon-toggle.active'));
  if (activeIcons.length === 0) {
    console.log('אין פריטים מסומנים לאיפוס.');
    return;
  }
  const selectedNames = activeIcons.map(icon => {
    const item = icon.closest('.item');
    return item?.querySelector('.item-name')?.textContent?.trim();
  }).filter(Boolean);

  // 2) אנימציית יציאה קטנה רק על הפריטים המסומנים
  activeIcons.forEach(icon => {
    const item = icon.closest('.item');
    if (item) item.classList.add('fade-out');
  });

  await wait(220); // תן לאנימציה לקרות

  // 3) ניקוי ויזואלי רק על הפריטים המסומנים
  activeIcons.forEach(icon => {
    icon.classList.remove('active');
    icon.setAttribute('aria-pressed','false');
    const itemControls = icon.closest('.item')?.querySelector('.item-controls');
    if (itemControls) {
      itemControls.classList.add('locked');
      itemControls.classList.remove('show-controls');
    }
  });
  document.querySelectorAll('.item.fade-out').forEach(el => el.classList.remove('fade-out'));

  // 4) מחיקה מהמודל — רק של הפריטים שהיו מסומנים
  selectedNames.forEach(name => {
    if (shoppingList[name]) delete shoppingList[name];
  });

  // 5) שמירה
  saveShoppingCache(shoppingList);
  if (currentUserId) saveShoppingList(currentUserId, shoppingList);

  console.log('✅ אופסו רק הפריטים שסומנו.');
}


////////////////
/*פונקציה חדשה שמאפסת רק פריטים מסומנים באותה קטגוריה*/
async function resetCategorySelectedWithFX(categoryName) {
  bumpResetButton();

  // בוחרים רק פריטים מסומנים בתוך ה-wrapper של אותה קטגוריה
  const wrappers = [...document.querySelectorAll(`.category-wrapper[data-category="${categoryName}"]`)];
  const activeIcons = wrappers.flatMap(w =>
    [...w.querySelectorAll('.icon-toggle.active')]
  );

  if (activeIcons.length === 0) {
    console.log('אין פריטים מסומנים בקטגוריה:', categoryName);
    return;
  }

  // אנימציה קצרה
  activeIcons.forEach(icon => {
    const item = icon.closest('.item');
    if (item) item.classList.add('fade-out');
  });
  await wait(220);

  // ניקוי UI + מודל + שמירה
  activeIcons.forEach(icon => {
    const item = icon.closest('.item');
    const name = item?.querySelector('.item-name')?.textContent?.trim();
    icon.classList.remove('active');
    icon.setAttribute('aria-pressed','false');
    const ctrl = item?.querySelector('.item-controls');
    if (ctrl) { ctrl.classList.add('locked'); ctrl.classList.remove('show-controls'); }
    if (name && shoppingList[name]) delete shoppingList[name];
    if (item) item.classList.remove('fade-out');
  });

  saveShoppingCache(shoppingList);
  if (currentUserId) saveShoppingList(currentUserId, shoppingList);

  console.log(`✅ אופסו הפריטים המסומנים בקטגוריה: ${categoryName}`);
}
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

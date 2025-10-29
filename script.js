/* Firebase SDK imports */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

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
const db = getFirestore(app);

// מניעת גלילה אנכית כאשר מתמקדים בסרגל
const categoryFilterContainer = document.querySelector(".category-filter-container");
categoryFilterContainer.addEventListener(
  "wheel",
  (e) => {
    if (e.deltaY !== 0) e.preventDefault();
  },
  { passive: false }
);

// משתנים גלובליים
let shoppingList = {};
let allCategorizedItems = {};
let currentUserId = null;

// המשתנים של ה-DOM
const container = document.getElementById("shopping-list-container"); // רשימת הפריטים
const loadingSpinner = document.getElementById("loading-spinner");
const shareIcon = document.getElementById("share-icon");
const categoryFilterWrapper = document.querySelector(".category-filter-wrapper");
const headerContainer = document.getElementById("sticky-header-container");

function updateStickyHeightVar() {
  const h = headerContainer.offsetHeight; // גובה כל הסטיקי (כותרת+סרגל)
  document.documentElement.style.setProperty("--sticky-h", `${h}px`);
}

const isMockMode = false;
const SHEET_ID = "11OxjXpAo3vWnzJFG738M8FjelkK1vBM09dHzYf78Ubs";
const sheetURL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

// פלטת צבעים חדשה עם הצבעים שבחרת
const COLOR_PALETTE = [
  { background: "#2fa062", text: "#ffffff" }, // 1 - טורקיז
  { background: "#E6C56E", text: "#000000" }, // 2 - צהוב-חול
  { background: "#E9A466", text: "#000000" }, // 3 - כתום-בהיר
  { background: "#DD694A", text: "#ffffff" }, // 4 - כתום-אדמדם
  { background: "#0b597d", text: "#ffffff" }, // 5 - כהה-כחול
];

// מיפוי קטגוריות לצבעים קבועים
const CATEGORY_COLORS = {
  הכל: { background: "#F2F4F7", text: "#000000" },
};

// מיפוי עבור שמות קטגוריות עם אייקונים
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

// פונקציית עזר: מבהירה צבע ע"י הגברת ערכי RGB
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
      console.error("Invalid RGB color format:", color);
      return color;
    }
  }
  r = Math.min(255, Math.floor(r + (255 - r) * percent));
  g = Math.min(255, Math.floor(g + (255 - g) * percent));
  b = Math.min(255, Math.floor(b + (255 - b) * percent));
  return `rgb(${r}, ${g}, ${b})`;
}

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

function applyPageGradientToHeaderStart(baseColor, lightenedColor) {
  const headerEl = document.querySelector(".header");
  if (!headerEl) return;
  const stopPx = Math.round(headerEl.offsetHeight);
  const blend = 120;
  const gradient = `linear-gradient(
    to bottom,
    ${lightenedColor} 0px,
    ${lightenedColor} ${stopPx}px,
    ${baseColor} ${stopPx + blend}px,
    ${baseColor} 100%
  )`;
  document.body.style.background = gradient;
  document.body.style.backgroundAttachment = "scroll";
}

// סינון + עדכון צבעי רקע/הדר/גרדיאנט
function filterListByCategory(categoryName) {
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
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", lightenedColor);

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
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", "#F2F4F7");
  }

  requestAnimationFrame(() => updateStickyHeightVar());
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
    renderCategoryFilters(allCategorizedItems);
    renderList(allCategorizedItems);
    filterListByCategory("הכל");
    updateStickyHeightVar();
    loadingSpinner.style.display = "none";
    return;
  }

  try {
    const response = await fetch(sheetURL);
    const text = await response.text();
    const json = JSON.parse(text.substr(47).slice(0, -2));
    const rows = json.table.rows.slice(1);

    const categorizedItems = {};
    rows.forEach((row) => {
      const cells = row.c;
      if (cells.length < 3) return;
      const category = cells[0]?.v;
      const item = cells[1]?.v;
      const type = cells[2]?.v;
      if (category && item) {
        if (!categorizedItems[category]) categorizedItems[category] = [];
        categorizedItems[category].push({ item, type });
      }
    });

    allCategorizedItems = categorizedItems;
    renderCategoryFilters(allCategorizedItems);
    renderList(allCategorizedItems);

    filterListByCategory("הכל");
    loadingSpinner.style.display = "none";
  } catch (err) {
    loadingSpinner.textContent = "❌ שגיאה בטעינת הנתונים. ודא שהקישור לגיליון תקין.";
    console.error("שגיאה בטעינה מגיליון:", err);
  }
}
window.addEventListener("resize", updateStickyHeightVar, { passive: true });

// רינדור רשימת הקניות
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

  // כפתור האייקון החדש
  const iconToggle = createIconToggle(false, (isActive) => {
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

  if (itemObj.type === "כמות") {
    const stepperContainer = document.createElement("div");
    stepperContainer.className = "quantity-stepper-container control";
    const minusButton = document.createElement("button");
    minusButton.textContent = "–";
    const valueSpan = document.createElement("span");
    valueSpan.className = "stepper-value";
    valueSpan.textContent = "1";
    const plusButton = document.createElement("button");
    plusButton.textContent = "+";

    stepperContainer.appendChild(minusButton);
    stepperContainer.appendChild(valueSpan);
    stepperContainer.appendChild(plusButton);
    itemControlsDiv.appendChild(stepperContainer);

    plusButton.addEventListener("click", () => {
      let currentValue = parseInt(valueSpan.textContent);
      if (currentValue < 10) {
        currentValue++;
        valueSpan.textContent = currentValue;
        if (itemControlsDiv.querySelector(".icon-toggle")?.classList.contains("active")) {
          shoppingList[itemObj.item] = { category, quantity: `${currentValue} יחידות` };
          if (currentUserId) saveShoppingList(currentUserId, shoppingList);
        }
      }
    });
    minusButton.addEventListener("click", () => {
      let currentValue = parseInt(valueSpan.textContent);
      if (currentValue > 1) {
        currentValue--;
        valueSpan.textContent = currentValue;
        if (itemControlsDiv.querySelector(".icon-toggle")?.classList.contains("active")) {
          shoppingList[itemObj.item] = { category, quantity: `${currentValue} יחידות` };
          if (currentUserId) saveShoppingList(currentUserId, shoppingList);
        }
      }
    });
  } else if (itemObj.type === "גודל") {
    const sizeOptions = ["S", "M", "L"];
    const sizeButtonsContainer = document.createElement("div");
    sizeButtonsContainer.className = "size-buttons-container control";
    sizeOptions.forEach((size, index) => {
      const button = document.createElement("button");
      button.className = "size-button";
      button.textContent = size;

      if (index === 0) button.classList.add("active");

      button.addEventListener("click", () => {
        sizeButtonsContainer.querySelectorAll(".size-button").forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");
        if (itemControlsDiv.querySelector(".icon-toggle")?.classList.contains("active")) {
          shoppingList[itemObj.item] = { category, size: button.textContent };
          if (currentUserId) saveShoppingList(currentUserId, shoppingList);
        }
      });
      sizeButtonsContainer.appendChild(button);
    });
    itemControlsDiv.appendChild(sizeButtonsContainer);
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
    const target = event.target;
    const bubbleElement = target.closest(".category-bubble");
    if (bubbleElement) {
      const selectedCategory = bubbleElement.dataset.category;
      filterListByCategory(selectedCategory);
      window.scrollTo({ top: headerContainer.offsetHeight, behavior: "smooth" });
    }
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
      }
    }
  });
}

// שמירת רשימת הקניות ב-Firebase
function saveShoppingList(userId, list) {
  const userDocRef = doc(db, "users", userId);
  setDoc(userDocRef, { shoppingList: list })
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
        updateUIWithSavedList(shoppingList);
        console.log("רשימת קניות נטענה:", shoppingList);
        updateUIFromShoppingList();
      }
    } else {
      console.log("לא נמצאה רשימה שמורה למשתמש זה.");
    }
  } catch (error) {
    console.error("שגיאה בקבלת נתונים:", error);
  }
}

/* ===============================
   🚀 שינוי מרכזי: אתחול טעינה מיידי
   =============================== */

// 1) נטען את הרשימה מיד עם עליית האפליקציה (לא תלוי ב-Auth)
fetchAndRenderList();

// 2) ה-Auth נטען בנפרד: אם יש משתמש נטען רשימה שמורה; אם לא – נתחבר אנונימית.
//    ה-UI ממשיך לעבוד גם אם ההתחברות נכשלה.
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserId = user.uid;
    console.log("משתמש מחובר:", currentUserId);
    loadUserShoppingList(currentUserId);
  } else {
    signInAnonymously(auth).catch((error) => {
      console.error("שגיאה בהתחברות אנונימית:", error);
      // ממשיכים לעבוד ללא משתמש – הנתונים מהגיליון כבר נטענו
    });
  }
});

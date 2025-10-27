// ייבוא פונקציות ה-SDK מ-Firebase
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
    measurementId: "G-5WNKMWP4G8"
};

// אתחול Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// משתנים גלובליים
let shoppingList = {};
let allCategorizedItems = {};
let currentUserId = null;

// המשתנים של ה-DOM
const container = document.getElementById('shopping-list-container');
const loadingSpinner = document.getElementById('loading-spinner');
const shareIcon = document.getElementById('share-icon');
const categoryFilterWrapper = document.querySelector('.category-filter-wrapper');
const headerContainer = document.getElementById('sticky-header-container');

const isMockMode = false;
const SHEET_ID = '11OxjXpAo3vWnzJFG738M8FjelkK1vBM09dHzYf78Ubs';
const sheetURL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

// מערך צבעים סופי ומוגבל
const COLOR_PALETTE = [
    { background: '#F1C40F', text: '#000000' }, // צהוב-זהב
    { background: '#AF99C9', text: '#000000' }, // סגול-לילך
    { background: '#E74C3C', text: '#ffffff' }, // אדום-אש
    { background: '#34495E', text: '#ffffff' }, // כחול כהה
    { background: '#2ECC71', text: '#ffffff' }  // ירוק-דשא
];

// מיפוי אמוג'י לאייקון של Ionicons
const EMOJI_TO_ICON = {
    '🍖': 'restaurant-outline',
    '🍗': 'restaurant-outline',
    '🐟': 'restaurant-outline',
    '🥕': 'leaf-outline',
    '🍎': 'nutrition-outline',
    '🍞': 'baguette-outline',
    '🧊': 'snow-outline',
    '🧂': 'flask-outline',
    '👕': 'shirt-outline',
    '💊': 'fitness-outline',
    '🧺': 'basket-outline',
    '🥂': 'wine-outline',
    '🏠': 'grid-outline',
    '🥛': 'nutrition-outline', // הוספה לדוגמה
    '🍶': 'wine-outline',      // הוספה לדוגמה
    '🥚': 'egg-outline'        // הוספה לדוגמה
};

// מיפוי עבור שמות קטגוריות שאינן מכילות אמוג'י
const CATEGORY_ICONS = {
    'הכל': 'grid-outline',
    'מטבח': 'restaurant-outline',
    'ירקות': 'leaf-outline',
    'פירות': 'nutrition-outline',
    'לחמים': 'baguette-outline',
    'בגדים': 'shirt-outline',
    'בריאות': 'fitness-outline',
    'אחר': 'pricetag-outline',
    'קפואים': 'snow-outline',
    'תבלינים ושמנים': 'flask-outline',
    'ניקיון': 'basket-outline',
    'אלכוהול': 'wine-outline'
};

// פונקציית עזר: מפרידה את האמוג'י מהטקסט
function extractEmojiAndName(category) {
    if (!category || category.trim() === '') {
        return { emoji: null, name: 'אחר' };
    }

    // זיהוי אמוג'י באמצעות RegExp התומך באמוג'י מורכבים
    const emojiRegex = /^([\p{Emoji}\p{Emoji_Component}\u{200D}\u{FE0F}\u{20E3}]+)\s*(.*)$/u;
    const match = category.match(emojiRegex);

    if (match && match[1]) {
        return {
            emoji: match[1], // האמוג'י שנמצא
            name: match[2].replace(/[:]/g, '').trim() || 'אחר' // שם נקי ללא נקודתיים
        };
    }

    // אם אין אמוג'י, השתמש בשם המלא
    return {
        emoji: null,
        name: category.replace(/[:]/g, '').trim() || 'אחר'
    };
}

// פונקציית סינון והסתרה/הצגה
function filterListByCategory(categoryName) {
    const allCategoryWrappers = container.querySelectorAll('.category-wrapper');

    // הסר 'active' מכל הבועות
    categoryFilterWrapper.querySelectorAll('.category-bubble').forEach(b => {
        b.classList.remove('active');
    });

    // בצע סינון: עובר על כל עוטפי הקטגוריות
    allCategoryWrappers.forEach(wrapper => {
        const categoryData = wrapper.dataset.category;

        if (categoryName === 'הכל' || categoryData === categoryName) {
            wrapper.classList.remove('hidden'); // הצג קטגוריה ספציפית או הכל
        } else {
            wrapper.classList.add('hidden'); Chalo// הסתר קטגוריה אחרת
        }
    });

    // סמן את הבועה הפעילה
    const activeBubble = categoryFilterWrapper.querySelector(`.category-bubble[data-category='${categoryName}']`);
    if (activeBubble) {
        activeBubble.classList.add('active');
        // גלילת הבועה לתוך התצוגה
        activeBubble.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
}

// טעינת הנתונים מ-Google Sheets או Mock
async function fetchAndRenderList() {
    if (isMockMode) {
        // ... (Mock logic)
        return;
    }

    try {
        const response = await fetch(sheetURL);
        const text = await response.text();
        // טיפול בפורמט JSONP שחוזר מ-Google Sheets
        const json = JSON.parse(text.substr(47).slice(0, -2));
        const rows = json.table.rows.slice(1);

        const categorizedItems = {};

        rows.forEach(row => {
            const cells = row.c;
            if (cells.length < 3) return;

            const category = cells[0]?.v;
            const item = cells[1]?.v;
            const type = cells[2]?.v;

            if (category && item) {
                if (!categorizedItems[category]) {
                    categorizedItems[category] = [];
                }
                categorizedItems[category].push({ item, type });
            }
        });

        allCategorizedItems = categorizedItems;
        renderCategoryFilters(allCategorizedItems);
        renderList(allCategorizedItems);

        // הפעלת הסינון הראשוני עם 'הכל'
        filterListByCategory('הכל');

        if (currentUserId) {
            loadUserShoppingList(currentUserId);
        }

        loadingSpinner.style.display = 'none';

    } catch (err) {
        loadingSpinner.textContent = '❌ שגיאה בטעינת הנתונים. ודא שהקישור לגיליון תקין.';
        console.error("שגיאה בטעינה מגיליון:", err);
    }
}

// רינדור רשימת הקניות
function renderList(categorizedItems) {
    container.innerHTML = '';
    for (const category in categorizedItems) {
        const categoryWrapper = document.createElement('div');
        categoryWrapper.className = 'category-wrapper';
        categoryWrapper.dataset.category = category;

        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category';

        // הצגת השם הנקי בלבד בכותרת הקטגוריה
        const { name: cleanName } = extractEmojiAndName(category);
        categoryDiv.textContent = cleanName.trim() === '' ? 'אחר' : cleanName;

        const card = document.createElement('div');
        card.className = 'item-card';

        categorizedItems[category].forEach(itemObj => {
            const itemElement = createItemElement(itemObj, category);
            card.appendChild(itemElement);
        });

        categoryWrapper.appendChild(categoryDiv);
        categoryWrapper.appendChild(card);
        container.appendChild(categoryWrapper);
    }
}

// יצירת אלמנט פריט יחיד
function createItemElement(itemObj, category) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'item';

    const itemNameSpan = document.createElement('span');
    itemNameSpan.textContent = itemObj.item;
    itemNameSpan.className = 'item-name';
    itemDiv.appendChild(itemNameSpan);

    const itemControlsDiv = document.createElement('div');
    itemControlsDiv.className = 'item-controls locked';

    // בקרת Toggle (Checkbox)
    const toggleSwitchContainer = document.createElement('label');
    toggleSwitchContainer.className = 'toggle-switch';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = false;
    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'slider round';
    toggleSwitchContainer.appendChild(toggleInput);
    toggleSwitchContainer.appendChild(toggleSlider);
    itemControlsDiv.appendChild(toggleSwitchContainer);

    // בקרת כמות (Stepper)
    if (itemObj.type === 'כמות') {
        const stepperContainer = document.createElement('div');
        stepperContainer.className = 'quantity-stepper-container control';
        const minusButton = document.createElement('button');
        minusButton.textContent = '–';
        const valueSpan = document.createElement('span');
        valueSpan.className = 'stepper-value';
        valueSpan.textContent = '1';
        const plusButton = document.createElement('button');
        plusButton.textContent = '+';

        stepperContainer.appendChild(minusButton);
        stepperContainer.appendChild(valueSpan);
        stepperContainer.appendChild(plusButton);
        itemControlsDiv.appendChild(stepperContainer);

        plusButton.addEventListener('click', () => {
            let currentValue = parseInt(valueSpan.textContent);
            if (currentValue < 10) {
                currentValue++;
                valueSpan.textContent = currentValue;
                if (toggleInput.checked) {
                    shoppingList[itemObj.item] = { category, quantity: `${currentValue} יחידות` };
                    if (currentUserId) saveShoppingList(currentUserId, shoppingList);
                }
            }
        });
        minusButton.addEventListener('click', () => {
            let currentValue = parseInt(valueSpan.textContent);
            if (currentValue > 1) {
                currentValue--;
                valueSpan.textContent = currentValue;
                if (toggleInput.checked) {
                    shoppingList[itemObj.item] = { category, quantity: `${currentValue} יחידות` };
                    if (currentUserId) saveShoppingList(currentUserId, shoppingList);
                }
            }
        });
    }
    // בקרת גודל (Size Selector)
    else if (itemObj.type === 'גודל') {
        const sizeOptions = ['S', 'M', 'L'];
        const sizeButtonsContainer = document.createElement('div');
        sizeButtonsContainer.className = 'size-buttons-container control';
        sizeOptions.forEach((size, index) => {
            const button = document.createElement('button');
            button.className = 'size-button';
            button.textContent = size;

            if (index === 0) {
                button.classList.add('active');
            }

            button.addEventListener('click', () => {
                sizeButtonsContainer.querySelectorAll('.size-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                if (toggleInput.checked) {
                    shoppingList[itemObj.item] = { category, size: button.textContent };
                    if (currentUserId) saveShoppingList(currentUserId, shoppingList);
                }
            });
            sizeButtonsContainer.appendChild(button);
        });
        itemControlsDiv.appendChild(sizeButtonsContainer);
    }

    itemDiv.appendChild(itemControlsDiv);

    // לוגיקת הוספה/הסרה לרשימה בעת שינוי Toggle
    toggleInput.addEventListener('change', (e) => {
        if (e.target.checked) {
            itemControlsDiv.classList.remove('locked');

            if (itemObj.type === 'כמות') {
                const valueSpan = itemControlsDiv.querySelector('.stepper-value');
                const quantity = valueSpan ? valueSpan.textContent : '1';
                shoppingList[itemObj.item] = { category, quantity: `${quantity} יחידות` };
            } else if (itemObj.type === 'גודל') {
                let activeSizeButton = itemControlsDiv.querySelector('.size-button.active');
                let size = 'S';

                if (!activeSizeButton) {
                    const defaultButton = itemControlsDiv.querySelector('.size-button');
                    if (defaultButton) {
                        defaultButton.classList.add('active');
                        activeSizeButton = defaultButton;
                    }
                }

                if (activeSizeButton) {
                    size = activeSizeButton.textContent;
                }

                shoppingList[itemObj.item] = { category, size: size };
            } else {
                shoppingList[itemObj.item] = { category };
            }

            if (currentUserId) saveShoppingList(currentUserId, shoppingList);
        } else {
            itemControlsDiv.classList.add('locked');
            delete shoppingList[itemObj.item];
            if (currentUserId) saveShoppingList(currentUserId, shoppingList);
        }
    });

    return itemDiv;
}

// רינדור סרגלי הקטגוריות והוספת לוגיקת סינון
function renderCategoryFilters(categorizedItems) {
    categoryFilterWrapper.innerHTML = '';

    const allCategories = ['הכל', ...Object.keys(categorizedItems)];

    allCategories.forEach(category => {
        // 1. חילוץ האייקון והשם הנקי
        const { emoji, name: cleanName } = extractEmojiAndName(category);
        const displayCategory = cleanName.trim() === '' ? 'אחר' : cleanName;

        // 2. יצירת הבועה
        const bubble = document.createElement('div');
        bubble.className = 'category-bubble status-style';
        bubble.dataset.category = category;

        // 3. בחירת צבע רנדומלי
        const randomColor = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
        bubble.style.backgroundColor = randomColor.background;
        bubble.style.color = randomColor.text;

        // 4. בחירת האייקון
        const iconName = EMOJI_TO_ICON[emoji] || CATEGORY_ICONS[displayCategory] || CATEGORY_ICONS['אחר'];

        // 5. יצירת האייקון
        const icon = document.createElement('ion-icon');
        icon.setAttribute('name', iconName);
        icon.className = 'category-icon';

        // 6. יצירת הטקסט
        const textSpan = document.createElement('span');
        textSpan.textContent = displayCategory;
        textSpan.className = 'category-text';

        // 7. הוספת האייקון והטקסט לבועה
        bubble.appendChild(icon);
        bubble.appendChild(textSpan);

        // 8. סימון 'הכל' כפעיל בהתחלה
        if (category === 'הכל') {
            bubble.classList.add('active');
        }

        categoryFilterWrapper.appendChild(bubble);
    });

    // לוגיקת לחיצה על בועה
    categoryFilterWrapper.addEventListener('click', (event) => {
        const target = event.target;
        const bubbleElement = target.closest('.category-bubble');

        if (bubbleElement) {
            const selectedCategory = bubbleElement.dataset.category;

            // סינון והצגה/הסתרה
            filterListByCategory(selectedCategory);

            // גלילה למעלה
            window.scrollTo({
                top: headerContainer.offsetHeight,
                behavior: 'smooth'
            });
        }
    });
}

// לוגיקת שיתוף (Share)
shareIcon.addEventListener('click', async () => {
    let message = "📋 רשימת קניות:\n\n";
    const categories = {};

    for (const item in shoppingList) {
        const data = shoppingList[item];
        if (!categories[data.category]) {
            categories[data.category] = [];
        }
        let itemText = `• ${item}`;
        if (data.quantity) {
            itemText += ` (${data.quantity})`;
        } else if (data.size) {
            itemText += ` (${data.size})`;
        }
        categories[data.category].push(itemText);
    }

    for (const cat in categories) {
        message += `*${cat}*\n`;
        message += categories[cat].join('\n') + '\n\n';
    }

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'רשימת קניות',
                text: message
            });
            console.log('שיתוף הצליח!');
        } catch (error) {
            console.error('שגיאה בשיתוף:', error);
        }
    } else {
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
        console.log('Web Share API לא נתמך, נשלח לוואטסאפ.');
    }
});

// עדכון ממשק המשתמש לפי רשימה שנשמרה
function updateUIWithSavedList(savedList) {
    const itemNames = document.querySelectorAll('.item-name');

    itemNames.forEach(itemNameSpan => {
        const itemText = itemNameSpan.textContent.trim();
        if (savedList[itemText]) {
            const itemElement = itemNameSpan.closest('.item');
            if (!itemElement) return;

            const toggleInput = itemElement.querySelector('.toggle-switch input');
            const itemControlsDiv = itemElement.querySelector('.item-controls');

            if (toggleInput) {
                toggleInput.checked = true;
            }
            if (itemControlsDiv) {
                itemControlsDiv.classList.remove('locked');
            }

            const savedData = savedList[itemText];
            if (savedData.quantity) {
                const valueSpan = itemElement.querySelector('.stepper-value');
                const quantityMatch = savedData.quantity.match(/\d+/);
                const quantity = quantityMatch ? quantityMatch[0] : '1';
                if (valueSpan) valueSpan.textContent = quantity;
            } else if (savedData.size) {
                const sizeButtons = itemElement.querySelectorAll('.size-button');
                sizeButtons.forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.textContent === savedData.size) {
                        btn.classList.add('active');
                    }
                });
            }
        }
    });
}

// שמירת רשימת הקניות ב-Firebase
function saveShoppingList(userId, list) {
    const userDocRef = doc(db, "users", userId);
    setDoc(userDocRef, { shoppingList: list })
        .then(() => {
            console.log("רשימת קניות נשמרה בהצלחה!");
        })
        .catch(error => {
            console.error("שגיאה בשמירת רשימת הקניות:", error);
        });
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
            }
        } else {
            console.log("לא נמצאה רשימה שמורה למשתמש זה.");
        }
    } catch (error) {
        console.error("שגיאה בקבלת נתונים:", error);
    }
}

// ניהול אימות משתמש (התחברות אנונימית)
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        console.log("משתמש מחובר עם מזהה:", currentUserId);
        fetchAndRenderList();
    } else {
        signInAnonymously(auth)
            .catch(error => {
                console.error("שגיאה בהתחברות אנונימית:", error);
            });
    }
});

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

// פלטת צבעים חדשה עם הצבעים שבחרת
const COLOR_PALETTE = [
    { background: '#213F4D', text: '#ffffff' }, // 1 - כהה-כחול
    { background: '#2FA098', text: '#ffffff' }, // 2 - טורקיז
    { background: '#E6C56E', text: '#000000' }, // 3 - צהוב-חול
    { background: '#E9A466', text: '#000000' }, // 4 - כתום-בהיר
    { background: '#DD694A', text: '#ffffff' }, // 5 - כתום-אדמדם
];

// מיפוי קטגוריות לצבעים קבועים
const CATEGORY_COLORS = {
    'הכל': { background: '#F2F4F7', text: '#000000' }
};

// מיפוי עבור שמות קטגוריות עם אייקונים
const CATEGORY_ICONS = {
    'הכל': 'grid-outline',
    'ירקות': 'leaf-outline',
    'ירקות עלים ירוקים': 'leaf-outline',
    'פירות': 'nutrition-outline',
    'לחמים ואפייה': 'browsers-outline',
    'מוצרי חלב': 'beaker-outline', // שינוי ל-aiיקון מתאים יותר
    'ביצים': 'egg-outline',
    'בשר ודגים': 'fish-outline', // שינוי ל-aiיקון מתאים יותר (אם קיים, אחרת נשאר fish-outline)
    'קפואים': 'snow-outline',
    'מזווה': 'cube-outline', // שינוי ל-aiיקון מתאים יותר
    'תבלינים ושמנים': 'flask-outline',
    'שבת ומתוקים': 'ice-cream-outline',
    'ניקיון והיגיינה': 'water-outline',
    'חד פעמי ותבניות': 'restaurant-outline', // שינוי ל-aiיקון מתאים יותר
    'אחר': 'pricetag-outline'
};

// פונקציית עזר: מפרידה את האמוג'י מהטקסט ומתאימה לקטגוריות
function extractEmojiAndName(category) {
    if (!category || category.trim() === '') {
        return { emoji: null, name: 'אחר' };
    }

    const emojiRegex = /^([\p{Emoji}\p{Emoji_Component}\u{200D}\u{FE0F}\u{20E3}]+)\s*(.*)$/u;
    const match = category.match(emojiRegex);

    if (match && match[1]) {
        let name = match[2].replace(/[:]/g, '').trim(); // מסיר דו-נקות ורווחים
        console.log('Extracted name:', name); // דיבאגינג
        return {
            emoji: match[1],
            name: name || 'אחר'
        };
    }

    let name = category.replace(/[:]/g, '').trim(); // מסיר דו-נקות ורווחים
    console.log('Extracted name (no emoji):', name); // דיבאגינג
    return {
        emoji: null,
        name: name || 'אחר'
    };
}

// פונקציית סינון והסתרה/הצגה
function filterListByCategory(categoryName) {
    console.log('Filtering by category:', categoryName);

    const allCategoryWrappers = container.querySelectorAll('.category-wrapper');

    categoryFilterWrapper.querySelectorAll('.category-bubble').forEach(b => {
        b.classList.remove('active');
    });

    allCategoryWrappers.forEach(wrapper => {
        const categoryData = wrapper.dataset.category;
        if (categoryName === 'הכל' || categoryData === categoryName) {
            wrapper.classList.remove('hidden');
        } else {
            wrapper.classList.add('hidden');
        }
    });

    const activeBubble = categoryFilterWrapper.querySelector(`.category-bubble[data-category='${categoryName}']`);
    if (activeBubble) {
        activeBubble.classList.add('active');
        const container = categoryFilterWrapper.parentElement;
        const containerWidth = container.offsetWidth;
        const bubbleWidth = activeBubble.offsetWidth;
        const bubbleOffset = activeBubble.offsetLeft;
        const scrollPosition = bubbleOffset - (containerWidth - bubbleWidth) / 2;

        console.log('Snap debug:', { containerWidth, bubbleWidth, bubbleOffset, scrollPosition });

        container.scrollTo({
            left: scrollPosition,
            behavior: 'smooth'
        });
    }
}

// טעינת הנתונים מ-Google Sheets או Mock
async function fetchAndRenderList() {
    if (isMockMode) {
        const mockData = {
            'ירקות': [{ item: 'עגבנייה', type: 'כמות' }],
            'פירות': [{ item: 'תפוח', type: 'גודל' }]
        };
        allCategorizedItems = mockData;
        renderCategoryFilters(allCategorizedItems);
        renderList(allCategorizedItems);
        filterListByCategory('הכל');
        loadingSpinner.style.display = 'none';
        return;
    }

    try {
        const response = await fetch(sheetURL);
        const text = await response.text();
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
    } else if (itemObj.type === 'גודל') {
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

    allCategories.forEach((category, index) => {
        const { emoji, name: cleanName } = extractEmojiAndName(category);
        const displayCategory = cleanName.trim() === '' ? 'אחר' : cleanName;

        const bubble = document.createElement('div');
        bubble.className = 'category-bubble status-style';
        bubble.dataset.category = category;

        // קביעת צבע לפי מיקום קבוע
        const colorIndex = index % COLOR_PALETTE.length;
        const color = COLOR_PALETTE[colorIndex];
        bubble.style.backgroundColor = color.background;
        bubble.style.color = color.text;

        let iconElement;
        // בדיקת אייקון מוגדר, ואם לא - אמוג'י או ברירת מחדל
        const iconName = CATEGORY_ICONS[displayCategory] || CATEGORY_ICONS['אחר'];
        if (iconName) {
            iconElement = document.createElement('ion-icon');
            iconElement.setAttribute('name', iconName);
            iconElement.className = 'category-icon';
            console.log('Using Ionicon for category:', category, 'Icon:', iconName, 'Mapped name:', displayCategory);
        } else if (emoji) {
            iconElement = document.createElement('span');
            iconElement.textContent = emoji;
            iconElement.className = 'category-icon';
            console.log('Using emoji for category:', category, 'Emoji:', emoji);
        } else {
            iconElement = document.createElement('ion-icon');
            iconElement.setAttribute('name', CATEGORY_ICONS['אחר']);
            iconElement.className = 'category-icon';
            console.log('Using default Ionicon for category:', category, 'Icon:', CATEGORY_ICONS['אחר'], 'Mapped name:', displayCategory);
        }

        const textSpan = document.createElement('span');
        textSpan.textContent = displayCategory;
        textSpan.className = 'category-text';

        bubble.appendChild(iconElement);
        bubble.appendChild(textSpan);

        if (category === 'הכל') {
            bubble.classList.add('active');
        }

        categoryFilterWrapper.appendChild(bubble);
    });

    categoryFilterWrapper.addEventListener('click', (event) => {
        const target = event.target;
        const bubbleElement = target.closest('.category-bubble');

        if (bubbleElement) {
            const selectedCategory = bubbleElement.dataset.category;
            filterListByCategory(selectedCategory);

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

// ניהול אימות משתמש
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

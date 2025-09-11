// ייבוא פונקציות ה-SDK מ-Firebase
 import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
 import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
 import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
 
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
 let currentActiveCategory = null;
 let isProgrammaticScroll = false;
 
 // המשתנים של ה-DOM
 const container = document.getElementById('shopping-list-container');
 const loadingSpinner = document.getElementById('loading-spinner');
 const shareIcon = document.getElementById('share-icon');
 const categoryFilterWrapper = document.querySelector('.category-filter-wrapper');
 const headerContainer = document.getElementById('sticky-header-container');
 
 const isMockMode = false;
 const mockData = {
    "מטבח": [
        { item: "קפה", type: "רגיל" },
        { item: "חלב", type: "כמות" },
        { item: "שוקולד", type: "רגיל" },
        { item: "דגנים", type: "רגיל" },
        { item: "שמן זית", type: "רגיל" },
        { item: "קמח", type: "רגיל" },
        { item: "סוכר", type: "רגיל" },
        { item: "מלח", type: "רגיל" }
    ],
    "ירקות": [
        { item: "מלפפונים", type: "כמות" },
        { item: "עגבניות", type: "כמות" },
        { item: "בצל", type: "כמות" },
        { item: "חסה", type: "רגיל" },
        { item: "פלפל אדום", type: "רגיל" },
        { item: "גזר", type: "כמות" },
        { item: "קישואים", type: "כמות" },
        { item: "כרוב", type: "רגיל" }
    ],
    "פירות": [
        { item: "בננות", type: "כמות" },
        { item: "תפוחים", type: "כמות" },
        { item: "אבוקדו", type: "כמות" },
        { item: "תפוזים", type: "כמות" },
        { item: "ענבים", type: "כמות" },
        { item: "אבטיח", type: "רגיל" },
        { item: "מלון", type: "רגיל" }
    ],
    "לחמים": [
        { item: "לחם לבן", type: "רגיל" },
        { item: "לחם מלא", type: "רגיל" },
        { item: "לחמניות", type: "כמות" },
        { item: "פיתות", type: "כמות" },
        { item: "בגט", type: "רגיל" }
    ],
    "בגדים": [
        { item: "חולצה", type: "גודל" },
        { item: "מכנס", type: "גודל" },
        { item: "שמלה", type: "גודל" },
        { item: "גרביים", type: "רגיל" },
        { item: "סוודר", type: "גודל" }
    ]
 };
 
 const SHEET_ID = '11OxjXpAo3vWnzJFG738M8FjelkK1vBM09dHzYf78Ubs';
 const sheetURL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
 
 // יצירת מופע חדש של IntersectionObserver
 const observerOptions = {
    root: null,
    rootMargin: `-${headerContainer.offsetHeight}px 0px 0px 0px`,
    threshold: 0
 };
 const intersectionObserver = new IntersectionObserver(handleIntersection, observerOptions);
 
 function handleIntersection(entries, observer) {
    if (isProgrammaticScroll) {
        return;
    }
 
    entries.forEach(entry => {
        const categoryName = entry.target.dataset.category;
 
        if (entry.isIntersecting && entry.intersectionRatio > 0) {
            // אם האלמנט נכנס לתצוגה או גלוי, הוא מסומן
            setActiveCategory(categoryName);
        } else if (!entry.isIntersecting && entry.boundingClientRect.top > 0) {
            // אם האלמנט עזב את התצוגה לכיוון מטה
            const prevCategoryElement = entry.target.previousElementSibling;
            if (prevCategoryElement) {
                const prevCategoryName = prevCategoryElement.dataset.category;
                setActiveCategory(prevCategoryName);
            }
        }
    });
 }
 
 function setActiveCategory(categoryName) {
    currentActiveCategory = categoryName;
    categoryFilterWrapper.querySelectorAll('.category-bubble').forEach(b => {
        b.classList.remove('active');
    });
 
    const activeBubble = document.querySelector(`.category-bubble[data-category='${categoryName}']`);
    if (activeBubble) {
        activeBubble.classList.add('active');
        activeBubble.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' });
    }
 }
 
 async function fetchAndRenderList() {
    if (isMockMode) {
        allCategorizedItems = mockData;
        renderCategoryFilters(allCategorizedItems);
        renderList(allCategorizedItems);
        if (currentUserId) {
            loadUserShoppingList(currentUserId);
        }
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
 
        // Call the loading function here, after the list is rendered
        if (currentUserId) {
            loadUserShoppingList(currentUserId);
        }
 
        loadingSpinner.style.display = 'none';
 
    } catch (err) {
        loadingSpinner.textContent = '❌ שגיאה בטעינת הנתונים.';
        console.error(err);
    }
 }
 
 function renderList(categorizedItems) {
    container.innerHTML = '';
    for (const category in categorizedItems) {
        const categoryWrapper = document.createElement('div');
        categoryWrapper.className = 'category-wrapper';
        categoryWrapper.dataset.category = category;
        
        // הוסף את הקיזוז לגלילה בצורה מודרנית
        categoryWrapper.style.scrollMarginTop = `${headerContainer.offsetHeight + 10}px`;
        
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category';
        categoryDiv.textContent = category;
        
        const card = document.createElement('div');
        card.className = 'item-card';
 
        categorizedItems[category].forEach(itemObj => {
            const itemElement = createItemElement(itemObj, category);
            card.appendChild(itemElement);
        });
 
        categoryWrapper.appendChild(categoryDiv);
        categoryWrapper.appendChild(card);
        container.appendChild(categoryWrapper);
 
        intersectionObserver.observe(categoryWrapper);
    }
 }
 
 
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
        sizeOptions.forEach(size => {
            const button = document.createElement('button');
            button.className = 'size-button';
            button.textContent = size;
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
                shoppingList[itemObj.item] = { category, quantity: `${valueSpan.textContent} יחידות` };
            } else if (itemObj.type === 'גודל') {
                const activeSizeButton = itemControlsDiv.querySelector('.size-button.active');
                shoppingList[itemObj.item] = { category, size: activeSizeButton ? activeSizeButton.textContent : 'S' };
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
 
 function renderCategoryFilters(categorizedItems) {
    categoryFilterWrapper.innerHTML = '';
    const categories = Object.keys(categorizedItems);
    if (categories.length > 0) {
        if (!currentActiveCategory) {
            setActiveCategory(categories[0]);
        }
    }
 
    for (const category in categorizedItems) {
        const bubble = document.createElement('div');
        bubble.className = 'category-bubble';
        bubble.textContent = category;
        bubble.dataset.category = category;
        categoryFilterWrapper.appendChild(bubble);
    }
    
    // בועה ראשונה כפעילה
    const firstBubble = categoryFilterWrapper.querySelector('.category-bubble');
    if (firstBubble) {
        firstBubble.classList.add('active');
    }
 
    categoryFilterWrapper.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('category-bubble')) {
            const selectedCategory = target.dataset.category;
            
            // עדכון הבועה הפעילה וגלילת סרגל הקטגוריות
            setActiveCategory(selectedCategory);
 
            // גלילת רשימת הקניות אל הקטגוריה שנבחרה
            const categoryElement = document.querySelector(`.category-wrapper[data-category='${selectedCategory}']`);
            if (categoryElement) {
                isProgrammaticScroll = true; // הפעלת הדגל
                categoryElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
 
                // איפוס הדגל לאחר שהגלילה אמורה להסתיים
                setTimeout(() => {
                    isProgrammaticScroll = false;
                }, 500);
            }
        }
    });
 }
 
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
                const quantity = savedData.quantity.match(/\d+/)[0];
                if (valueSpan) valueSpan.textContent = quantity;
            } else if (savedData.size) {
                const sizeButtons = itemElement.querySelectorAll('.size-button');
                sizeButtons.forEach(btn => {
                    if (btn.textContent === savedData.size) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }
        }
    });
 }
 
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

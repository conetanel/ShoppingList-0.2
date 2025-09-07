// עוטף את רוב הקוד בפונקציה שרצה רק לאחר שהדף נטען
document.addEventListener('DOMContentLoaded', () => {

    const SHEET_ID = '11OxjXpAo3vWnzJFG738M8FjelkK1vBM09dHzYf78Ubs'; // החלף ב-ID של הגיליון שלך
    const sheetURL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;`;

    const container = document.getElementById('shopping-list-container');
    const loadingSpinner = document.getElementById('loading-spinner');
    const shareIcon = document.getElementById('share-icon');
    const categoryFilterWrapper = document.querySelector('.category-filter-wrapper');

    let shoppingList = {};
    let allCategorizedItems = {}; // משתנה גלובלי לאחסון הרשימה המלאה

    // --- נתוני דמה מעודכנים לפיתוח מקומי ---
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
    // --- סוף נתוני דמה מעודכנים ---


    async function fetchAndRenderList() {
        if (isMockMode) {
            allCategorizedItems = mockData;
            renderCategoryFilters(allCategorizedItems);
            renderList(allCategorizedItems);
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

            allCategorizedItems = categorizedItems; // שמירת הנתונים המלאים
            renderCategoryFilters(allCategorizedItems);
            renderList(allCategorizedItems);
            loadingSpinner.style.display = 'none';

        } catch (err) {
            loadingSpinner.textContent = '❌ שגיאה בטעינת הנתונים.';
            console.error(err);
        }
    }

    function renderList(categorizedItems) {
        container.innerHTML = '';
        for (const category in categorizedItems) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'category';
            categoryDiv.textContent = category;
            container.appendChild(categoryDiv);

            const card = document.createElement('div');
            card.className = 'item-card';

            categorizedItems[category].forEach(itemObj => {
                const itemElement = createItemElement(itemObj, category);
                card.appendChild(itemElement);
            });
            container.appendChild(card);
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
                        shoppingList[itemObj.item] = { category, size };
                    }
                });
                sizeButtonsContainer.appendChild(button);
            });
            itemControlsDiv.appendChild(sizeButtonsContainer);
            sizeButtonsContainer.querySelector('.size-button:first-child').classList.add('active');
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
            } else {
                itemControlsDiv.classList.add('locked');
                delete shoppingList[itemObj.item];
            }
        });

        return itemDiv;
    }

    // פונקציה חדשה ליצירת ועיצוב בועות הסינון
    function renderCategoryFilters(categorizedItems) {
        // הוסף בועה של "הכל" (All)
        const allBubble = document.createElement('div');
        allBubble.className = 'category-bubble active';
        allBubble.textContent = 'הכל';
        allBubble.dataset.category = 'all';
        categoryFilterWrapper.appendChild(allBubble);

        // צור בועה עבור כל קטגוריה
        for (const category in categorizedItems) {
            const bubble = document.createElement('div');
            bubble.className = 'category-bubble';
            bubble.textContent = category;
            bubble.dataset.category = category; // נשמור את שם הקטגוריה בדאטה
            categoryFilterWrapper.appendChild(bubble);
        }

        // הוסף Event Listener עבור כל הבועות
        categoryFilterWrapper.addEventListener('click', (event) => {
            const target = event.target;
            if (target.classList.contains('category-bubble')) {
                // הסר את הסטטוס 'active' מכל הבועות
                categoryFilterWrapper.querySelectorAll('.category-bubble').forEach(b => {
                    b.classList.remove('active');
                });
                // הוסף סטטוס 'active' לבועה שנלחצה
                target.classList.add('active');
                
                const selectedCategory = target.dataset.category;
                filterList(selectedCategory, allCategorizedItems);
            }
        });
    }

    // יצירת פונקציית סינון
    function filterList(selectedCategory, data) {
        container.innerHTML = '';
        if (selectedCategory === 'all') {
            renderList(data); // הצג הכל
        } else {
            const filteredData = {};
            filteredData[selectedCategory] = data[selectedCategory];
            renderList(filteredData); // הצג רק את הקטגוריה הנבחרת
        }
    }


    // Event Listener עבור כפתור השיתוף
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

    fetchAndRenderList();
});

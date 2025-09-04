const SHEET_ID = '11OxjXpAo3vWnzJFG738M8FjelkK1vBM09dHzYf78Ubs'; // Replace with your Sheet ID
const sheetURL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;`;

const container = document.getElementById('shopping-list-container');
const shareButton = document.getElementById('share-button');
const loadingSpinner = document.getElementById('loading-spinner');

let shoppingList = {};

// --- נתוני דמה לפיתוח מקומי ---
const isMockMode = false; // שנה ל-false כדי לחזור לקריאה מגוגל שיטס

const mockData = {
    "מטבח": [
        { item: "קפה", type: "רגיל" },
        { item: "חלב", type: "כמות" },
        { item: "שוקולד", type: "רגיל" },
        { item: "דגנים", type: "רגיל" }
    ],
    "ירקות": [
        { item: "מלפפונים", type: "כמות" },
        { item: "עגבניות", type: "כמות" },
        { item: "בצל", type: "כמות" },
        { item: "חסה", type: "רגיל" }
    ],
    "פירות": [
        { item: "בננות", type: "כמות" },
        { item: "תפוחים", type: "כמות" },
        { item: "אבוקדו", type: "כמות" }
    ],
    "לחמים": [
        { item: "לחם לבן", type: "רגיל" },
        { item: "לחם מלא", type: "רגיל" }
    ],
    "בגדים": [
        { item: "חולצה", type: "גודל" },
        { item: "מכנס", type: "גודל" }
    ]
};
// --- סוף נתוני דמה ---

async function fetchAndRenderList() {
    if (isMockMode) {
        // מצב הדמיה: השתמש בנתוני הדמה
        renderList(mockData);
        loadingSpinner.style.display = 'none';
        return;
    }

    // מצב רגיל: בצע קריאה מגוגל שיטס
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

        renderList(categorizedItems);
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

        const list = document.createElement('div');
        list.className = 'item-list';
        categorizedItems[category].forEach(itemObj => {
            const itemElement = createItemElement(itemObj, category);
            list.appendChild(itemElement);
        });
        container.appendChild(list);
    }
}

function createItemElement(itemObj, category) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'item';
    
    // Create item name
    const itemNameSpan = document.createElement('span');
    itemNameSpan.textContent = itemObj.item;
    itemNameSpan.className = 'item-name';
    itemDiv.appendChild(itemNameSpan);

    const itemControlsDiv = document.createElement('div');
    itemControlsDiv.className = 'item-controls locked'; // Start locked
    
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
    
    // Create iOS-style toggle switch
    const toggleSwitchContainer = document.createElement('label');
    toggleSwitchContainer.className = 'toggle-switch';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = false;
    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'slider round';
    toggleSwitchContainer.appendChild(toggleInput);
    toggleSwitchContainer.appendChild(toggleSlider);

    itemDiv.appendChild(itemControlsDiv);
    itemDiv.appendChild(toggleSwitchContainer);

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

shareButton.addEventListener('click', async () => {
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
        message += `${cat}\n`;
        message += categories[cat].join('\n') + '\n\n';
    }

    // Check if the Web Share API is supported
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
        // Fallback to WhatsApp for unsupported browsers
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
        console.log('Web Share API לא נתמך, נשלח לוואטסאפ.');
    }
});

// Initial fetch on page load
fetchAndRenderList();

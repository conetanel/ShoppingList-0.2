const SHEET_ID = '11OxjXpAo3vWnzJFG738M8FjelkK1vBM09dHzYf78Ubs'; // ה-ID של הגיליון שלך
const sheetURL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;`;

const container = document.getElementById('shopping-list-container');
const shareButton = document.getElementById('share-button');
const loadingSpinner = document.getElementById('loading-spinner');

let shoppingList = {};

async function fetchAndRenderList() {
    try {
        const response = await fetch(sheetURL);
        const text = await response.text();
        const json = JSON.parse(text.substr(47).slice(0, -2));
        const rows = json.table.rows.slice(1); // Skip the header row

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
        categoryDiv.textContent = category.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\u200D|\uFE0F|[\u2600-\u27FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/g, '').trim();
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
    
    const itemNameSpan = document.createElement('span');
    itemNameSpan.textContent = itemObj.item;
    itemNameSpan.className = 'item-name';

    itemDiv.appendChild(itemNameSpan);

    const itemControlsDiv = document.createElement('div');
    itemControlsDiv.className = 'item-controls locked';



                    let pickerInstance;
                
                if (itemObj.type === 'כמות') {
                    const quantityButton = document.createElement('button');
                    quantityButton.className = 'picker-button';
                    quantityButton.textContent = '1 יחידות';
                    itemControlsDiv.appendChild(quantityButton);
                
                    // השתמש ב-Picker עם עיגון לכפתור
                    const quantityData = Array.from({length: 10}, (_, i) => `${i + 1} יחידות`);
                    pickerInstance = mobiscroll.picker({
                        theme: 'ios',
                        display: 'bottom',
                        anchor: quantityButton,     // <-- העגינה לכפתור
                        buttons: ['cancel', 'set'],
                        wheels: [{
                            label: 'כמות',
                            data: quantityData
                        }],
                        onInit: (event, inst) => {
                            inst.setVal([quantityData[0]], true); // "1 יחידות"
                        },
                        onSet: (event, inst) => {
                            const val = inst.getVal()[0];
                            quantityButton.textContent = val;
                            if (toggleInput.checked) {
                                shoppingList[itemObj.item] = { category, quantity: val };
                            }
                        }
                    });
                }
                else if (itemObj.type === 'גודל') {
                    const sizeOptions = ['S', 'M', 'L'];
                    const sizeButton = document.createElement('button');
                    sizeButton.className = 'picker-button';
                    sizeButton.textContent = 'S';
                    itemControlsDiv.appendChild(sizeButton);
                
                    pickerInstance = mobiscroll.picker({
                        theme: 'ios',
                        display: 'bottom',
                        anchor: sizeButton,         // <-- העגינה לכפתור
                        buttons: ['cancel', 'set'],
                        wheels: [{
                            label: 'גודל',
                            data: sizeOptions
                        }],
                        onInit: (event, inst) => {
                            inst.setVal(['S'], true);
                        },
                        onSet: (event, inst) => {
                            const val = inst.getVal()[0];
                            sizeButton.textContent = val;
                            if (toggleInput.checked) {
                                shoppingList[itemObj.item] = { category, size: val };
                            }
                        }
                    });
                }
                else {
                    itemControlsDiv.style.display = 'none';
                }
    
    const toggleSwitchContainer = document.createElement('label');
    toggleSwitchContainer.className = 'toggle-switch';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
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
                const quantityButton = itemControlsDiv.querySelector('.picker-button');
                shoppingList[itemObj.item] = { category, quantity: quantityButton.textContent };
            } else if (itemObj.type === 'גודל') {
                const sizeButton = itemControlsDiv.querySelector('.picker-button');
                shoppingList[itemObj.item] = { category, size: sizeButton.textContent };
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

shareButton.addEventListener('click', () => {
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

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
});

fetchAndRenderList();

const SHEET_ID = '11OxjXpAo3vWnzJFG738M8FjelkK1vBM09dHzYf78Ubs'; // Replace with your Sheet ID
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
        
        // Group items by category and store their type
        rows.forEach(row => {
            const cells = row.c;
            if (cells.length < 3) return; // Skip incomplete rows
            
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
    itemDiv.appendChild(toggleSwitchContainer);
    
    // Create controls that will be conditionally displayed
    const itemControlsDiv = document.createElement('div');
    itemControlsDiv.className = 'item-controls';

    if (itemObj.type === 'כמות') {
        // Dropdown for quantity
        const quantitySelect = document.createElement('select');
        quantitySelect.className = 'quantity-dropdown';
        for (let i = 1; i <= 10; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i} יחידות`;
            quantitySelect.appendChild(option);
        }
        itemControlsDiv.appendChild(quantitySelect);
        
        quantitySelect.addEventListener('change', (e) => {
            if (toggleInput.checked) {
                shoppingList[itemObj.item] = { category, quantity: `${e.target.value} יחידות` };
            }
        });
    } else if (itemObj.type === 'גודל') {
        const sizeOptions = ['S', 'M', 'L'];
        const sizeButtonsContainer = document.createElement('div');
        sizeButtonsContainer.className = 'size-buttons-container';
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
        // Set default active state
        sizeButtonsContainer.querySelector('.size-button:first-child').classList.add('active');
    }
    
    // Append the controls to the main item div
    itemDiv.appendChild(itemControlsDiv);

    // Event listener for the toggle switch
    toggleInput.addEventListener('change', (e) => {
        if (e.target.checked) {
            itemControlsDiv.classList.add('visible');
            if (itemObj.type === 'כמות') {
                const quantitySelect = itemControlsDiv.querySelector('.quantity-dropdown');
                shoppingList[itemObj.item] = { category, quantity: `${quantitySelect.value} יחידות` };
            } else if (itemObj.type === 'גודל') {
                const activeSizeButton = itemControlsDiv.querySelector('.size-button.active');
                shoppingList[itemObj.item] = { category, size: activeSizeButton ? activeSizeButton.textContent : 'S' };
            } else {
                // Regular item with no controls
                shoppingList[itemObj.item] = { category };
            }
        } else {
            itemControlsDiv.classList.remove('visible');
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

// Initial fetch on page load
fetchAndRenderList();

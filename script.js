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
    itemDiv.innerHTML = `<span>${itemObj.item}</span>`;
    
    // Add checkbox/slider based on item type
    if (itemObj.type === 'כמות') {
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'slider-container';
        sliderContainer.innerHTML = `<span class="slider-value">1</span><input type="range" min="1" max="10" value="1">`;
        itemDiv.appendChild(sliderContainer);
        
        const slider = sliderContainer.querySelector('input');
        const sliderValue = sliderContainer.querySelector('.slider-value');
        
        slider.addEventListener('input', (e) => {
            sliderValue.textContent = e.target.value;
        });

        slider.addEventListener('change', (e) => {
            const quantity = e.target.value;
            shoppingList[itemObj.item] = { category, quantity: `${quantity} יחידות` };
        });
        
    } else if (itemObj.type === 'גודל') {
        const sizeOptions = ['S', 'M', 'L'];
        const select = document.createElement('select');
        sizeOptions.forEach(size => {
            const option = document.createElement('option');
            option.value = size;
            option.textContent = size;
            select.appendChild(option);
        });
        itemDiv.appendChild(select);

        select.addEventListener('change', (e) => {
            const size = e.target.value;
            shoppingList[itemObj.item] = { category, size };
        });
    } else {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        itemDiv.appendChild(checkbox);

        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                shoppingList[itemObj.item] = { category };
            } else {
                delete shoppingList[itemObj.item];
            }
        });
    }
    
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

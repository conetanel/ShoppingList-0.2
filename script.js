function createItemElement(itemObj, category) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'item';
    
    // Create iOS-style toggle switch
    const toggleSwitchContainer = document.createElement('label');
    toggleSwitchContainer.className = 'toggle-switch';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = false; // Initially unchecked
    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'slider round';
    toggleSwitchContainer.appendChild(toggleInput);
    toggleSwitchContainer.appendChild(toggleSlider);
    
    // Create item name
    const itemNameSpan = document.createElement('span');
    itemNameSpan.textContent = itemObj.item;
    itemNameSpan.className = 'item-name';

    itemDiv.appendChild(toggleSwitchContainer);
    itemDiv.appendChild(itemNameSpan);

    const itemControlsDiv = document.createElement('div');
    itemControlsDiv.className = 'item-controls';
    itemControlsDiv.style.display = 'none'; // Initially hidden

    if (itemObj.type === 'כמות') {
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'quantity-slider-container';
        sliderContainer.innerHTML = `<input type="range" min="1" max="10" value="1"><span class="slider-value">1</span>`;
        itemControlsDiv.appendChild(sliderContainer);
        
        const slider = sliderContainer.querySelector('input');
        const sliderValue = sliderContainer.querySelector('.slider-value');
        
        slider.addEventListener('input', (e) => {
            sliderValue.textContent = e.target.value;
            if (toggleInput.checked) { // Only update if item is selected
                shoppingList[itemObj.item] = { category, quantity: `${e.target.value} יחידות` };
            }
        });
        // Initial set if item is somehow pre-selected or to ensure default value
        shoppingList[itemObj.item] = { category, quantity: `${slider.value} יחידות` };


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
                if (toggleInput.checked) { // Only update if item is selected
                    shoppingList[itemObj.item] = { category, size };
                }
            });
            sizeButtonsContainer.appendChild(button);
        });
        itemControlsDiv.appendChild(sizeButtonsContainer);
        // Default to S
        shoppingList[itemObj.item] = { category, size: 'S' }; 
        sizeButtonsContainer.querySelector('.size-button').classList.add('active'); // Select default

    }
    // For regular items, itemControlsDiv remains empty but will be shown/hidden
    itemDiv.appendChild(itemControlsDiv);

    toggleInput.addEventListener('change', (e) => {
        if (e.target.checked) {
            itemControlsDiv.style.display = 'flex'; // Show controls
            if (!shoppingList[itemObj.item]) { // Add to list if not already there with default
                if (itemObj.type === 'כמות') {
                    const slider = itemControlsDiv.querySelector('input[type="range"]');
                    shoppingList[itemObj.item] = { category, quantity: `${slider.value} יחידות` };
                } else if (itemObj.type === 'גודל') {
                    const activeSizeButton = itemControlsDiv.querySelector('.size-button.active');
                    shoppingList[itemObj.item] = { category, size: activeSizeButton ? activeSizeButton.textContent : 'S' };
                } else {
                    shoppingList[itemObj.item] = { category };
                }
            }
        } else {
            itemControlsDiv.style.display = 'none'; // Hide controls
            delete shoppingList[itemObj.item]; // Remove from list
        }
    });

    return itemDiv;
}

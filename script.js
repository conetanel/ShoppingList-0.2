/* Other styles remain the same */

/* Flexbox for correct alignment */
.item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    border-bottom: 0.5px solid #e0e0e0;
    direction: rtl; /* Sets the base direction for the line */
}
.item:last-child {
    border-bottom: none;
}

.item-name {
    flex-grow: 1; /* Item name takes available space */
    font-size: 1.1rem;
    color: #000;
    text-align: right;
    margin-right: 15px; /* Space between name and controls */
}

/* New container for controls and toggle to keep them together */
.controls-container {
    display: flex;
    align-items: center;
    gap: 15px; /* Space between controls and toggle */
    direction: ltr; /* Ensure LTR for the controls section */
}

/* Item Controls - now always visible */
.item-controls {
    display: flex;
    align-items: center;
    gap: 10px;
}

/* Locked state - controls are grayed out */
.item-controls.locked .control {
    pointer-events: none;
    opacity: 0.5;
    transition: opacity 0.2s;
}

/* Quantity Slider (iOS style) */
.quantity-slider-container {
    display: flex;
    align-items: center;
    direction: ltr;
}

.quantity-slider-container input[type="range"] {
    -webkit-appearance: none;
    width: 120px;
    height: 6px;
    background: #e5e5ea;
    border-radius: 3px;
    outline: none;
    margin: 0 10px;
}

.quantity-slider-container input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 28px;
    height: 28px;
    background: white;
    border-radius: 50%;
    cursor: grab;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    border: none;
}

.quantity-slider-container .slider-value {
    font-weight: 500;
    color: #000;
    font-size: 1.1rem;
    min-width: 25px;
    text-align: left;
    direction: rtl; /* For "יחידות" etc. */
}

/* Size Buttons (iOS Segmented Control style) */
.size-buttons-container {
    display: inline-flex;
    border: 1px solid #007aff;
    border-radius: 8px;
    overflow: hidden;
    direction: ltr;
}

.size-button {
    background-color: white;
    color: #007aff;
    border: none;
    padding: 8px 15px;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    border-left: 1px solid #007aff;
}
.size-button:first-child {
    border-left: none;
}

.size-button.active {
    background-color: #007aff;
    color: white;
}

/* Floating Action Button (FAB) for WhatsApp */
#share-button {
    position: fixed; /* Keep button in place */
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%); /* Center the button */
    width: 60px; /* Adjust size */
    height: 60px;
    border-radius: 50%; /* Make it round */
    background-color: #25D366; /* WhatsApp green */
    color: white;
    border: none;
    font-size: 2.5rem; /* Large icon font size */
    box-shadow: 0 4px 6px rgba(0,0,0,0.2);
    cursor: pointer;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
}
#share-button:hover {
    background-color: #128C7E;
}
.fab-icon {
    font-family: 'Font Awesome 5 Brands'; /* Or any other icon font */
    font-weight: 900;
    content: '\f232'; /* WhatsApp icon */
}

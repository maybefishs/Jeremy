import {
  bootstrapApp,
  whenReady,
  getActiveDate,
  getRestaurants,
  getMenus,
  setOrder,
  getOrder,
  getOrders,
  getNames,
  UPDATE_EVENT,
} from './app.js';

const NAME_STORAGE_KEY = 'lunchvote-user-name';
const ORDER_CACHE_PREFIX = 'lunchvote-order-cache-';
const orderSection = document.querySelector('[data-section="order"]');

if (orderSection) {
  bootstrapApp();
  
  // --- DOM Elements ---
  const restaurantSelect = document.getElementById('user-select-order-restaurant'); 
  const menuContainer = document.getElementById('menuContainer');
  const userSelect = document.getElementById('user-select-order');
  // NOTE: Ensure customNameInput exists and is correctly selected in index.html if using 'other' option
  const customNameInput = document.getElementById('customNameInputOrder'); // Example ID, adjust if needed

  // Modal elements
  const itemOptionsModal = document.getElementById('itemOptionsModal');
  const itemOptionsTitle = document.getElementById('itemOptionsTitle');
  const itemOptionsForm = document.getElementById('itemOptionsForm');
  const itemOptionsContainer = document.getElementById('itemOptionsContainer');
  const itemOptionsQty = document.getElementById('itemOptionsQty');
  const itemOptionsPrice = document.getElementById('itemOptionsPrice');
  const cancelOptionsBtn = document.getElementById('cancelOptionsBtn');
  
  // Footer elements (ensure these IDs exist in index.html footer)
  const personalSubtotalEl = document.getElementById('personalSubtotal');
  const classTotalEl = document.getElementById('classTotal'); 
  const unpaidEl = document.getElementById('unpaidCount');
  const missingEl = document.getElementById('missingOrders');

  // --- State ---
  let currentName = localStorage.getItem(NAME_STORAGE_KEY) || '';
  let workingOrder = { restaurantId: '', items: [], note: '', paid: false };
  let currentItemWithOptions = null; 

  // --- Functions ---

  function showToast(message) {
    // ... (keep existing showToast function)
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function resolveName() {
    if (userSelect.value === 'other' && customNameInput) {
      return customNameInput.value.trim();
    }
    return userSelect.value;
  }
  
  function loadWorkingOrder() {
    const name = resolveName();
    if (!name) {
      workingOrder = {
        restaurantId: restaurantSelect ? restaurantSelect.value : '',
        items: [],
        note: '',
        paid: false,
      };
      renderMenu();
      updateBottomBar();
      return;
    }

    const saved = getOrder(getActiveDate(), name);

    if (saved) {
      // Deep clone so local edits don't mutate the shared state until persisted
      workingOrder = JSON.parse(JSON.stringify(saved));

      if (restaurantSelect) {
        const hasSavedRestaurant = Array.from(restaurantSelect.options).some(
          option => option.value === saved.restaurantId,
        );

        if (hasSavedRestaurant) {
          restaurantSelect.value = saved.restaurantId;
        }
      }
    } else {
      // Reset items if no saved order is found
      workingOrder = {
        restaurantId: restaurantSelect ? restaurantSelect.value : '',
        items: [],
        note: '',
        paid: false,
      };
    }

    renderMenu();
    updateBottomBar();
  }

  function renderRestaurants() {
    const restaurants = getRestaurants(true);
    if (!restaurantSelect) return;

    const currentVal = restaurantSelect.value; // Store current value before clearing

    restaurantSelect.innerHTML = '<option value="">請選擇餐廳</option>';
    restaurants.forEach(r => {
      const option = document.createElement('option');
      option.value = r.id;
      option.textContent = r.name;
      restaurantSelect.appendChild(option);
    });

    // Try to restore previous selection or working order's restaurant
    if (restaurants.find(r => r.id === currentVal)) {
        restaurantSelect.value = currentVal;
    } else if (workingOrder.restaurantId && restaurants.find(r => r.id === workingOrder.restaurantId)) {
        restaurantSelect.value = workingOrder.restaurantId;
    } else {
        restaurantSelect.value = ''; // Reset if previous/working is invalid
    }
  }

  // **** MODIFIED renderMenu Function ****
  function renderMenu() {
    const restaurantId = restaurantSelect && restaurantSelect.value
        ? restaurantSelect.value
        : workingOrder.restaurantId;
    menuContainer.innerHTML = ''; // Clear previous content first

    if (!restaurantId) {
      menuContainer.innerHTML = '<p class="empty">請先選擇餐廳</p>';
      return;
    }
    
    const menu = getMenus()[restaurantId];
    if (!menu) {
      menuContainer.innerHTML = '<p class="empty">此餐廳尚未設定菜單資料</p>';
      return;
    }
    
    // --- NEW: Render Menu Images First ---
    if (menu.menuImages && menu.menuImages.length > 0) {
        const imagesDiv = document.createElement('div');
        imagesDiv.className = 'menu-images-display'; // Add a class for potential styling
        menu.menuImages.forEach(url => {
            if (url) { // Only render if URL is not empty
                const img = document.createElement('img');
                img.src = url;
                img.alt = `${menu.name} Menu`;
                img.style.maxWidth = '100%'; // Basic styling
                img.style.marginBottom = '1rem';
                imagesDiv.appendChild(img);
            }
        });
        menuContainer.appendChild(imagesDiv); // Prepend images to the container
    }
    // --- END NEW ---

    if (!menu.items || menu.items.length === 0) {
        // Append message only if no items AND no images were rendered previously
        if (menuContainer.innerHTML === '' || menuContainer.querySelector('.menu-images-display')?.children.length === 0) {
             menuContainer.innerHTML = '<p class="empty">此餐廳尚未設定任何品項</p>';
        } else {
             // If images were shown, add a separator or message below them
             const noItemsMsg = document.createElement('p');
             noItemsMsg.className = 'empty';
             noItemsMsg.textContent = '此餐廳尚未設定任何品項';
             menuContainer.appendChild(noItemsMsg);
        }
        return; 
    }
    
    // Render Categories and Items (Existing Logic)
    (menu.categories || []).forEach(category => {
      const itemsInCategory = menu.items.filter(item => item.categoryId === category.id);
      if (itemsInCategory.length === 0) return; // Skip empty categories

      const categoryEl = document.createElement('div');
      categoryEl.className = 'menu-category';
      categoryEl.innerHTML = `<h3>${category.name}</h3>`;
      const itemsGrid = document.createElement('div');
      itemsGrid.className = 'card-grid';

      itemsInCategory.forEach(item => {
        const card = document.createElement('div');
        // Add cursor pointer only if not disabled
        card.className = `card menu-card ${item.available === false ? 'disabled' : ''}`; 
        if (item.available !== false) {
            card.style.cursor = 'pointer'; 
        }
        card.dataset.itemId = item.id;
        card.innerHTML = `
            ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}" class="card-img" style="max-width: 100%; height: auto; aspect-ratio: 16/9; object-fit: cover; border-radius: var(--radius-md) var(--radius-md) 0 0;">` : ''}
            <div style="padding: ${item.imageUrl ? '0 10px 10px' : '0'};"> 
                <div class="card-title">${item.name}</div>
                <div class="card-meta">$${item.basePrice}${item.unit ? ` / ${item.unit}` : ''}</div>
            </div>
        `;
        itemsGrid.appendChild(card);
      });

      categoryEl.appendChild(itemsGrid);
      menuContainer.appendChild(categoryEl);
    });
  }

  function handleItemClick(event) {
      const card = event.target.closest('.menu-card');
      if (!card || card.classList.contains('disabled')) return;
      
      const itemId = card.dataset.itemId;
      const restaurantId = restaurantSelect.value;
      if (!restaurantId) return; // Should not happen if menu is rendered
      
      const item = getMenus()[restaurantId]?.items.find(i => i.id === itemId);
      if (!item) return;

      if (!item.optionGroups || item.optionGroups.length === 0) {
          addItemToOrder({
              id: item.id,
              name: item.name,
              qty: 1,
              price: item.basePrice, 
              options: '' // Indicate no options
          });
          showToast(`已加入一份 ${item.name}`);
      } else {
          openItemOptionsModal(item);
      }
  }

  function openItemOptionsModal(item) {
      currentItemWithOptions = item;
      itemOptionsTitle.textContent = item.name;
      itemOptionsQty.textContent = '1';
      itemOptionsContainer.innerHTML = '';

      (item.optionGroups || []).forEach(group => {
          if (!group.options || group.options.length === 0) return; // Skip empty groups

          const groupEl = document.createElement('div');
          groupEl.className = 'option-group';
          groupEl.innerHTML = `<label>${group.name}</label>`;
          const optionsWrapper = document.createElement('div');
          optionsWrapper.className = 'options-wrapper';

          group.options.forEach((option, index) => {
              const optionId = `option-${group.id || group.name}-${index}`; // Use name as fallback ID
              const optionEl = document.createElement('div');
              optionEl.className = 'option-item';
              const inputType = group.type === 'multiple' ? 'checkbox' : 'radio';
              const inputName = group.id || group.name; // Use name as fallback name
              // Ensure priceAdjustment is treated as a number
              const priceAdj = Number(option.priceAdjustment) || 0; 
              
              optionEl.innerHTML = `
                  <input type="${inputType}" id="${optionId}" name="${inputName}" value="${index}" data-price-adjustment="${priceAdj}" ${index === 0 && inputType ==='radio' ? 'checked' : ''}>
                  <label for="${optionId}">
                      ${option.name}
                      ${priceAdj > 0 ? ` (+$${priceAdj})` : ''}
                      ${priceAdj < 0 ? ` (-$${Math.abs(priceAdj)})` : ''}
                  </label>
              `;
              optionsWrapper.appendChild(optionEl);
          });
          groupEl.appendChild(optionsWrapper);
          itemOptionsContainer.appendChild(groupEl);
      });
      
      updateModalPrice();
      itemOptionsModal.classList.remove('hidden');
  }

  function updateModalPrice() {
      if (!currentItemWithOptions) return;

      let currentPrice = Number(currentItemWithOptions.basePrice) || 0;
      
      // Select all checked/selected inputs within the form
      const selectedInputs = itemOptionsForm.querySelectorAll('input:checked');

      selectedInputs.forEach(input => {
          currentPrice += Number(input.dataset.priceAdjustment) || 0;
      });

      const qty = parseInt(itemOptionsQty.textContent, 10);
      const totalPrice = currentPrice * qty;
      itemOptionsPrice.textContent = `- $${totalPrice}`;
  }

  function handleOptionsFormSubmit(event) {
      event.preventDefault();
      if (!currentItemWithOptions) return;

      const qty = parseInt(itemOptionsQty.textContent, 10);
      if (qty <= 0) {
          itemOptionsModal.classList.add('hidden');
          return; // Don't add if quantity is zero or less
      }

      let finalPrice = Number(currentItemWithOptions.basePrice) || 0;
      let selectedOptionsDesc = [];
      const selectedInputs = itemOptionsForm.querySelectorAll('input:checked');

      selectedInputs.forEach(input => {
          finalPrice += Number(input.dataset.priceAdjustment) || 0;
          // Find the corresponding label text
          const label = itemOptionsForm.querySelector(`label[for="${input.id}"]`);
          if (label) {
              // Extract only the option name, removing price adjustment text
              selectedOptionsDesc.push(label.textContent.split('(')[0].trim());
          }
      });
      
      addItemToOrder({
          // Create a unique key for items with options to allow multiple instances
          // E.g., combine item ID with selected option indexes or names
          // For now, we'll keep it simple and just push, might merge later
          orderItemId: `${currentItemWithOptions.id}_${Date.now()}`, // Simple unique ID for now
          id: currentItemWithOptions.id,
          name: currentItemWithOptions.name,
          qty,
          price: finalPrice, // Price per unit with options
          options: selectedOptionsDesc.join(', ')
      });

      itemOptionsModal.classList.add('hidden');
      showToast(`已加入 ${qty} 份 ${currentItemWithOptions.name}`);
  }

  function addItemToOrder(newItem) {
      // Basic implementation: Just add to the list.
      // Future enhancement: Check if an identical item (same id + options) exists and increment qty.
      workingOrder.items.push(newItem);
      updateAndPersistOrder();
  }

  function updateAndPersistOrder() {
    updateBottomBar();
    const name = resolveName();
    if (name) {
      // Ensure subtotal is calculated correctly before saving
      workingOrder.subtotal = workingOrder.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
      setOrder(getActiveDate(), name, workingOrder);
    }
  }
  
  // Need a function to calculate totals for the bottom bar
  function computeTotals(date) {
    const orders = getOrders(date) || {};
    let classTotal = 0;
    const unpaid = [];
    const allNames = getNames();

    Object.entries(orders).forEach(([name, order]) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      classTotal += subtotal;
      if (!order.paid) {
        unpaid.push(name);
      }
    });

    const missing = allNames.filter(name => !orders[name]);

    return { classTotal, unpaid, missing };
  }


  function updateBottomBar() {
      const subtotal = workingOrder.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
      personalSubtotalEl.textContent = `$${subtotal}`;
      
      // Calculate and display class totals
      const totals = computeTotals(getActiveDate());
      if(classTotalEl) classTotalEl.textContent = `$${totals.classTotal}`;
      if(unpaidEl) unpaidEl.textContent = `${totals.unpaid.length} 人`;
      if(missingEl) missingEl.textContent = `${totals.missing.length} 人`;
  }
  
  // --- Event Listeners ---
  
  restaurantSelect?.addEventListener('change', () => {
      workingOrder.restaurantId = restaurantSelect.value;
      workingOrder.items = []; // Clear items when changing restaurant
      updateAndPersistOrder(); // Save the change and update UI
      renderMenu(); // Re-render menu for the new restaurant
  });
  
  userSelect?.addEventListener('change', () => {
      currentName = resolveName();
      localStorage.setItem(NAME_STORAGE_KEY, currentName); // Save selected name
      if (userSelect.value === 'other') {
        customNameInput?.classList.remove('hidden');
        customNameInput?.focus();
      } else if (customNameInput) {
        customNameInput.classList.add('hidden');
        customNameInput.value = '';
      }
      loadWorkingOrder();
  });

  customNameInput?.addEventListener('blur', () => {
      currentName = resolveName();
      localStorage.setItem(NAME_STORAGE_KEY, currentName); // Save custom name
      loadWorkingOrder();
  });
  
  menuContainer.addEventListener('click', handleItemClick);
  itemOptionsForm?.addEventListener('submit', handleOptionsFormSubmit);
  itemOptionsForm?.addEventListener('change', updateModalPrice); 
  cancelOptionsBtn?.addEventListener('click', () => itemOptionsModal.classList.add('hidden'));

  itemOptionsModal?.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) {
          let qty = parseInt(itemOptionsQty.textContent, 10);
          if (action === 'increase') qty++;
          if (action === 'decrease') qty = Math.max(1, qty - 1); // Ensure qty is at least 1
          itemOptionsQty.textContent = qty;
          updateModalPrice();
      }
  });


  // --- Initial Load ---
  whenReady().then(() => {
    // Initial setup for name selection
    const names = getNames();
    const savedName = localStorage.getItem(NAME_STORAGE_KEY);
    if (savedName && userSelect) {
        if (names.includes(savedName)) {
            userSelect.value = savedName;
        } else if (customNameInput) {
            userSelect.value = 'other';
            customNameInput.classList.remove('hidden');
            customNameInput.value = savedName;
        }
    }
    currentName = resolveName(); // Set initial currentName

    renderRestaurants(); // Populate restaurant dropdown
    loadWorkingOrder(); // Load order based on initial name and selected restaurant
    
    if (customNameInput && userSelect && userSelect.value !== 'other') {
        customNameInput.classList.add('hidden');
        customNameInput.value = '';
    }

    window.addEventListener(UPDATE_EVENT, () => {
        // More granular updates might be better, but for now, refresh relevant parts
        renderRestaurants();
        // Re-check current user's order state in case of external changes (less likely here)
        loadWorkingOrder();
        updateBottomBar(); // Always update totals based on global state
    });
  });
}

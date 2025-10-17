import {
  bootstrapApp,
  whenReady,
  getActiveDate,
  getRestaurants,
  getMenus,
  setOrder,
  getOrder,
  getOrders,
  getNames
  // computeTotals and other utilities might need to be imported if they are in app.js
} from './app.js';

const NAME_STORAGE_KEY = 'lunchvote-user-name';
const ORDER_CACHE_PREFIX = 'lunchvote-order-cache-';
const orderSection = document.querySelector('[data-section="order"]');

if (orderSection) {
  bootstrapApp();
  
  // --- DOM Elements ---
  const restaurantSelect = document.getElementById('user-select-order-restaurant'); // Assuming a new select for restaurants
  const menuContainer = document.getElementById('menuContainer');
  const userSelect = document.getElementById('user-select-order');
  const customNameInput = document.getElementById('customNameInput'); // Assuming it's shared or there's a new one

  // Modal elements
  const itemOptionsModal = document.getElementById('itemOptionsModal');
  const itemOptionsTitle = document.getElementById('itemOptionsTitle');
  const itemOptionsForm = document.getElementById('itemOptionsForm');
  const itemOptionsContainer = document.getElementById('itemOptionsContainer');
  const itemOptionsQty = document.getElementById('itemOptionsQty');
  const itemOptionsPrice = document.getElementById('itemOptionsPrice');
  const cancelOptionsBtn = document.getElementById('cancelOptionsBtn');
  
  // Footer elements
  const personalSubtotalEl = document.getElementById('personalSubtotal');
  // ... other footer elements

  // --- State ---
  let currentName = localStorage.getItem(NAME_STORAGE_KEY) || '';
  let workingOrder = { restaurantId: '', items: [], note: '', paid: false };
  let currentItemWithOptions = null; // To hold the item being configured in the modal

  // --- Functions ---

  function showToast(message) {
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
    if (userSelect.value === 'other') {
      return customNameInput.value.trim();
    }
    return userSelect.value;
  }
  
  function loadWorkingOrder() {
      const name = resolveName();
      if (!name) {
          workingOrder = { restaurantId: '', items: [], note: '', paid: false };
          renderMenu(); // Render empty state
          updateBottomBar();
          return;
      };

      const saved = getOrder(getActiveDate(), name);
      if (saved) {
          workingOrder = JSON.parse(JSON.stringify(saved));
      } else {
          // Reset if no saved order
          workingOrder = { restaurantId: workingOrder.restaurantId, items: [], note: '', paid: false };
      }
      
      // Keep selected restaurant if any
      if (restaurantSelect) {
        workingOrder.restaurantId = restaurantSelect.value;
      }

      renderMenu();
      updateBottomBar();
  }

  function renderRestaurants() {
    const restaurants = getRestaurants(true);
    // This function now populates a dedicated restaurant selector on the order page
    // Assuming you add <select id="user-select-order-restaurant"></select> in index.html
    const restaurantSelectOrder = document.getElementById('user-select-order-restaurant');
    if (!restaurantSelectOrder) return;

    restaurantSelectOrder.innerHTML = '<option value="">請選擇餐廳</option>';
    restaurants.forEach(r => {
      const option = document.createElement('option');
      option.value = r.id;
      option.textContent = r.name;
      restaurantSelectOrder.appendChild(option);
    });

    if (workingOrder.restaurantId) {
        restaurantSelectOrder.value = workingOrder.restaurantId;
    }
  }

  function renderMenu() {
    const restaurantId = restaurantSelect ? restaurantSelect.value : workingOrder.restaurantId;
    if (!restaurantId) {
      menuContainer.innerHTML = '<p class="empty">請先選擇餐廳</p>';
      return;
    }
    
    const menu = getMenus()[restaurantId];
    if (!menu || !menu.items) {
      menuContainer.innerHTML = '<p class="empty">此餐廳尚未設定菜單</p>';
      return;
    }
    
    menuContainer.innerHTML = '';
    
    menu.categories.forEach(category => {
      const categoryEl = document.createElement('div');
      categoryEl.className = 'menu-category';
      categoryEl.innerHTML = `<h3>${category.name}</h3>`;
      const itemsGrid = document.createElement('div');
      itemsGrid.className = 'card-grid';

      const itemsInCategory = menu.items.filter(item => item.categoryId === category.id);
      itemsInCategory.forEach(item => {
        const card = document.createElement('div');
        card.className = `card menu-card ${item.available === false ? 'disabled' : ''}`;
        card.dataset.itemId = item.id;
        card.innerHTML = `
            ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}" class="card-img">` : ''}
            <div class="card-title">${item.name}</div>
            <div class="card-meta">$${item.basePrice}</div>
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
      const item = getMenus()[restaurantId]?.items.find(i => i.id === itemId);

      if (!item) return;

      if (!item.optionGroups || item.optionGroups.length === 0) {
          // Simple item, add directly
          addItemToOrder({
              ...item,
              qty: 1,
              price: item.basePrice // Final price for simple items
          });
          showToast(`已加入一份 ${item.name}`);
      } else {
          // Complex item, open modal
          openItemOptionsModal(item);
      }
  }

  function openItemOptionsModal(item) {
      currentItemWithOptions = item;
      itemOptionsTitle.textContent = item.name;
      itemOptionsQty.textContent = '1';
      itemOptionsContainer.innerHTML = '';

      item.optionGroups.forEach(group => {
          const groupEl = document.createElement('div');
          groupEl.className = 'option-group';
          groupEl.innerHTML = `<label>${group.name}</label>`;
          const optionsWrapper = document.createElement('div');
          optionsWrapper.className = 'options-wrapper';

          group.options.forEach((option, index) => {
              const optionId = `option-${group.id}-${index}`;
              const optionEl = document.createElement('div');
              optionEl.className = 'option-item';
              const inputType = group.type === 'multiple' ? 'checkbox' : 'radio';
              optionEl.innerHTML = `
                  <input type="${inputType}" id="${optionId}" name="${group.id}" value="${index}" ${index === 0 && inputType ==='radio' ? 'checked' : ''}>
                  <label for="${optionId}">
                      ${option.name}
                      ${option.priceAdjustment > 0 ? `(+$${option.priceAdjustment})` : ''}
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

      let currentPrice = currentItemWithOptions.basePrice;
      const formData = new FormData(itemOptionsForm);

      currentItemWithOptions.optionGroups.forEach(group => {
          const selectedValue = formData.get(group.id);
          if (selectedValue !== null) {
              const selectedOption = group.options[selectedValue];
              if(selectedOption && selectedOption.priceAdjustment) {
                currentPrice += selectedOption.priceAdjustment;
              }
          }
      });

      const qty = parseInt(itemOptionsQty.textContent, 10);
      const totalPrice = currentPrice * qty;
      itemOptionsPrice.textContent = `- $${totalPrice}`;
  }

  function handleOptionsFormSubmit(event) {
      event.preventDefault();
      const qty = parseInt(itemOptionsQty.textContent, 10);
      if (qty === 0) {
          itemOptionsModal.classList.add('hidden');
          return;
      }

      const formData = new FormData(itemOptionsForm);
      let finalPrice = currentItemWithOptions.basePrice;
      let selectedOptionsDesc = [];

      currentItemWithOptions.optionGroups.forEach(group => {
          const value = formData.get(group.id);
          if (value !== null) {
              const option = group.options[value];
              finalPrice += option.priceAdjustment || 0;
              selectedOptionsDesc.push(option.name);
          }
      });
      
      addItemToOrder({
          id: currentItemWithOptions.id,
          name: currentItemWithOptions.name,
          qty,
          price: finalPrice,
          options: selectedOptionsDesc.join(', ')
      });

      itemOptionsModal.classList.add('hidden');
      showToast(`已加入 ${qty} 份 ${currentItemWithOptions.name}`);
  }

  function addItemToOrder(item) {
      // For simplicity, we'll just push new items. A more robust solution would merge items.
      workingOrder.items.push(item);
      updateAndPersistOrder();
  }

  function updateAndPersistOrder() {
    updateBottomBar();
    // Persist to local storage or state
    const name = resolveName();
    if (name) {
      setOrder(getActiveDate(), name, workingOrder);
    }
  }

  function updateBottomBar() {
      const subtotal = workingOrder.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
      personalSubtotalEl.textContent = `$${subtotal}`;
      // ... update other footer elements
  }
  
  // --- Event Listeners ---
  
  // Assuming a single restaurant select for the order page now.
  if (restaurantSelect) {
      restaurantSelect.addEventListener('change', () => {
          workingOrder.restaurantId = restaurantSelect.value;
          workingOrder.items = []; // Clear items when changing restaurant
          updateAndPersistOrder();
          renderMenu();
      });
  }
  
  userSelect.addEventListener('change', loadWorkingOrder);
  if (customNameInput) {
      customNameInput.addEventListener('blur', loadWorkingOrder);
  }
  
  menuContainer.addEventListener('click', handleItemClick);
  itemOptionsForm.addEventListener('submit', handleOptionsFormSubmit);
  itemOptionsForm.addEventListener('change', updateModalPrice); // Update price on any option change
  cancelOptionsBtn.addEventListener('click', () => itemOptionsModal.classList.add('hidden'));

  itemOptionsModal.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) {
          let qty = parseInt(itemOptionsQty.textContent, 10);
          if (action === 'increase') qty++;
          if (action === 'decrease') qty = Math.max(1, qty - 1);
          itemOptionsQty.textContent = qty;
          updateModalPrice();
      }
  });


  // --- Initial Load ---
  whenReady().then(() => {
    renderRestaurants();
    loadWorkingOrder();
    window.addEventListener('lunchvote:update', () => {
        // May need more specific updates later
        renderRestaurants();
        loadWorkingOrder();
    });
  });
}

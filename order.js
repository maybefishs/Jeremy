import { getSettings, getActiveDate, getNames, getRestaurants, getMenus, recordOrder, getOrders, getPhaseAndDeadlines, updateSettings, getRestaurantById } from './app.js';

document.addEventListener("DOMContentLoaded", async () => {
    await window.whenReady(); // 等待 app.js 初始化完成

    const orderSection = document.querySelector('[data-section="order"]');
    const userSelectOrder = document.getElementById("user-select-order");
    const menuCardsContainer = document.getElementById("menuCards");
    const orderForm = document.getElementById("order-form");
    const orderItemsList = document.getElementById("order-items");
    const orderTotalDisplay = document.getElementById("order-total");
    const submitOrderBtn = document.getElementById("submit-order-btn");
    const personalSubtotalDisplay = document.getElementById("personalSubtotal");

    let currentOrder = { restaurantId: '', items: [], subtotal: 0 }; // { restaurantId: '', items: [{id, name, price, qty}], subtotal: 0 }
    let selectedName = '';

    // Load selectedName from localStorage if available
    const storedName = localStorage.getItem('lunchvote-selected-name');
    if (storedName) {
        selectedName = storedName;
    }

    function updatePersonalSubtotal() {
        const orders = getOrders(getActiveDate());
        const myOrder = orders[selectedName];
        personalSubtotalDisplay.textContent = `$${myOrder?.subtotal || 0}`;
    }

    function renderOrderUI() {
        const { phase } = getPhaseAndDeadlines();
        if (phase === 'order') {
            orderSection.classList.remove('hidden');
        } else {
            orderSection.classList.add('hidden');
            return;
        }

        const settings = getSettings();
        const activeDate = getActiveDate();
        const names = getNames();
        const restaurants = getRestaurants();
        const allMenus = getMenus();
        const orders = getOrders(activeDate);

        // Populate name dropdown
        userSelectOrder.innerHTML = '<option value="">請選擇你的名字</option>';
        names.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            userSelectOrder.appendChild(option);
        });
        if (selectedName) {
            userSelectOrder.value = selectedName;
        }

        // Render menu cards for ordering
        menuCardsContainer.innerHTML = '';
        restaurants.forEach(restaurant => {
            const restaurantMenu = allMenus[restaurant.id] || [];
            // Only show restaurants that have menus and are not closed
            if (restaurantMenu.length === 0 || restaurant.status === 'closed') return; 

            const card = document.createElement('div');
            card.className = 'card menu-card';
            card.innerHTML = `
                <h3 class="card-title">${restaurant.name}</h3>
                <ul class="list-group list-group-flush">
                    ${restaurantMenu.map(item => `
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            ${item.name} <span class="badge bg-primary rounded-pill">$${item.price}</span>
                            <div class="input-group input-group-sm" style="width: 120px;">
                                <button class="btn btn-outline-secondary decrease-qty" type="button" data-item-id="${item.id}" data-restaurant-id="${restaurant.id}">-</button>
                                <input type="text" class="form-control text-center item-qty" value="0" data-item-id="${item.id}" data-restaurant-id="${restaurant.id}" readonly>
                                <button class="btn btn-outline-secondary increase-qty" type="button" data-item-id="${item.id}" data-restaurant-id="${restaurant.id}">+</button>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            `;
            menuCardsContainer.appendChild(card);
        });

        // Load existing order for selected name
        if (selectedName && orders[selectedName]) {
            currentOrder = JSON.parse(JSON.stringify(orders[selectedName])); // Deep copy
            updateOrderForm();
            // Update quantity inputs on menu cards
            currentOrder.items.forEach(orderItem => {
                const qtyInput = menuCardsContainer.querySelector(`input.item-qty[data-item-id="${orderItem.id}"][data-restaurant-id="${currentOrder.restaurantId}"]`);
                if (qtyInput) qtyInput.value = orderItem.qty;
            });
        } else {
            currentOrder = { restaurantId: '', items: [], subtotal: 0 };
            updateOrderForm();
        }
        updatePersonalSubtotal();
    }

    function updateOrderForm() {
        orderItemsList.innerHTML = '';
        let total = 0;

        if (currentOrder.items.length === 0) {
            orderForm.classList.add('hidden');
            orderTotalDisplay.textContent = '$0';
            return;
        }

        orderForm.classList.remove('hidden');
        currentOrder.items.forEach(item => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `
                ${item.name} x ${item.qty} <span class="badge bg-secondary rounded-pill">$${item.price * item.qty}</span>
            `;
            orderItemsList.appendChild(li);
            total += item.price * item.qty;
        });
        currentOrder.subtotal = total;
        orderTotalDisplay.textContent = `$${total}`;
    }

    menuCardsContainer.addEventListener('click', (e) => {
        if (!selectedName) {
            alert('請先選擇你的名字！');
            return;
        }

        const target = e.target;
        const itemId = target.dataset.itemId;
        const restaurantId = target.dataset.restaurantId;

        if (!itemId || !restaurantId) return;

        const restaurants = getRestaurants();
        const allMenus = getMenus();
        const restaurant = restaurants.find(r => r.id === restaurantId);
        const menu = allMenus[restaurantId];
        const menuItem = menu.find(item => item.id === itemId);

        if (!menuItem) return;

        // If changing restaurant, clear current order
        if (currentOrder.restaurantId && currentOrder.restaurantId !== restaurantId) {
            if (!confirm('你已經選擇了其他餐廳的餐點，確定要更換餐廳嗎？這將會清空目前的訂單。')) {
                return;
            }
            // Reset quantities on old restaurant's menu items
            currentOrder.items.forEach(oldItem => {
                const oldQtyInput = menuCardsContainer.querySelector(`input.item-qty[data-item-id="${oldItem.id}"][data-restaurant-id="${currentOrder.restaurantId}"]`);
                if (oldQtyInput) oldQtyInput.value = 0;
            });
            currentOrder = { restaurantId: restaurantId, items: [], subtotal: 0 };
        } else if (!currentOrder.restaurantId) {
            currentOrder.restaurantId = restaurantId;
        }

        let currentQtyInput = menuCardsContainer.querySelector(`input.item-qty[data-item-id="${itemId}"][data-restaurant-id="${restaurantId}"]`);
        let currentQty = parseInt(currentQtyInput.value);

        if (target.classList.contains('increase-qty')) {
            currentQty++;
        } else if (target.classList.contains('decrease-qty')) {
            currentQty = Math.max(0, currentQty - 1);
        }
        currentQtyInput.value = currentQty;

        // Update currentOrder.items
        const existingItemIndex = currentOrder.items.findIndex(item => item.id === itemId);
        if (currentQty > 0) {
            if (existingItemIndex > -1) {
                currentOrder.items[existingItemIndex].qty = currentQty;
            } else {
                currentOrder.items.push({ id: menuItem.id, name: menuItem.name, price: menuItem.price, qty: currentQty });
            }
        } else {
            if (existingItemIndex > -1) {
                currentOrder.items.splice(existingItemIndex, 1);
            }
        }
        updateOrderForm();
    });

    userSelectOrder.addEventListener('change', (e) => {
        selectedName = e.target.value;
        localStorage.setItem('lunchvote-selected-name', selectedName); // Save selected name
        renderOrderUI(); // Re-render to load user's existing order
    });

    submitOrderBtn.addEventListener('click', () => {
        if (!selectedName) {
            alert('請先選擇你的名字！');
            return;
        }
        if (currentOrder.items.length === 0) {
            alert('請選擇餐點！');
            return;
        }
        recordOrder(getActiveDate(), selectedName, currentOrder);
        alert('訂單已提交！');
        updatePersonalSubtotal();
    });

    // Listen for updates from app.js and phase changes
    window.addEventListener('lunchvote:update', renderOrderUI);
    window.addEventListener('lunchvote:phase', renderOrderUI);

    // Initial render
    renderOrderUI();
});


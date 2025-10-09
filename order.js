import {
  bootstrapApp,
  whenReady,
  getActiveDate,
  getRestaurants,
  getMenus,
  setOrder,
  getOrder,
  getOrders,
  computeTotals,
  getNames,
  lockOrder,
  generateLineSummary
} from './app.js';

const NAME_STORAGE_KEY = 'lunchvote-user-name';
const ORDER_CACHE_PREFIX = 'lunchvote-order-cache-';
const orderSection = document.querySelector('[data-section="order"]');

if (orderSection) {
  bootstrapApp();
  const restaurantSelect = document.getElementById('restaurantSelect');
  const menuContainer = document.getElementById('menuCards');
  const noteInput = document.getElementById('orderNote');
  const submitOrderBtn = document.getElementById('submitOrder');
  const lockOrderBtn = document.getElementById('lockOrderBtn');
  const copyOrderLineBtn = document.getElementById('copyOrderLine');
  const personalSubtotalEl = document.getElementById('personalSubtotal');
  const classTotalEl = document.getElementById('classTotal');
  const unpaidEl = document.getElementById('unpaidCount');
  const missingEl = document.getElementById('missingOrders');
  const countdown = document.getElementById('countdown');
  const nameSelect = document.getElementById('nameSelect');
  const customNameInput = document.getElementById('customNameInput');

  let currentName = localStorage.getItem(NAME_STORAGE_KEY) || '';
  let workingOrder = { restaurantId: '', items: [], note: '', paid: false };

  function resolveName() {
    if (!currentName) {
      if (nameSelect?.value === 'other') {
        return customNameInput?.value.trim() || '';
      }
      return nameSelect?.value || '';
    }
    return currentName;
  }

  function cacheKey(name) {
    return `${ORDER_CACHE_PREFIX}${getActiveDate()}_${name}`;
  }

  function loadWorkingOrder() {
    const name = resolveName();
    if (!name) return;
    const saved = getOrder(getActiveDate(), name);
    if (saved) {
      workingOrder = deepCloneOrder(saved);
      workingOrder.paid = saved.paid || false;
    } else {
      const local = localStorage.getItem(cacheKey(name));
      if (local) {
        try {
          workingOrder = JSON.parse(local);
        } catch (error) {
          console.warn('Failed to parse cached order', error);
        }
      }
    }
    if (restaurantSelect && workingOrder.restaurantId) {
      restaurantSelect.value = workingOrder.restaurantId;
    }
    renderMenu();
    updateBottomBar();
  }

  function deepCloneOrder(order) {
    return JSON.parse(JSON.stringify(order));
  }

  function renderRestaurants() {
    const restaurants = getRestaurants(true);
    restaurantSelect.innerHTML = '<option value="">選擇餐廳</option>';
    restaurants.forEach((restaurant) => {
      const option = document.createElement('option');
      option.value = restaurant.id;
      option.textContent = `${restaurant.name}${restaurant.status === 'closed' ? '（停售）' : restaurant.status === 'soldout' ? '（售完）' : ''}`;
      option.disabled = restaurant.status === 'closed';
      if (workingOrder.restaurantId === restaurant.id) {
        option.selected = true;
      }
      restaurantSelect.appendChild(option);
    });
  }

  function ensureItem(item) {
    const existing = workingOrder.items.find((entry) => entry.id === item.id);
    if (!existing) {
      workingOrder.items.push({ ...item, qty: 0 });
      return workingOrder.items[workingOrder.items.length - 1];
    }
    return existing;
  }

  function adjustItem(item, delta) {
    const entry = ensureItem(item);
    entry.qty = Math.max(0, (entry.qty || 0) + delta);
    if (entry.qty === 0) {
      workingOrder.items = workingOrder.items.filter((row) => row.id !== item.id);
    }
    updateBottomBar();
    persistLocal();
    renderMenu();
  }

  function renderMenu() {
    const menuData = getMenus();
    const restaurantId = restaurantSelect.value || workingOrder.restaurantId;
    if (!restaurantId) {
      menuContainer.innerHTML = '<p class="empty">請先選擇餐廳</p>';
      return;
    }
    workingOrder.restaurantId = restaurantId;
    const menu = menuData[restaurantId];
    if (!menu) {
      menuContainer.innerHTML = '<p class="empty">尚未設定菜單</p>';
      return;
    }
    menuContainer.innerHTML = '';
    menu.items.forEach((item) => {
      const card = document.createElement('div');
      card.className = `card menu-card ${item.available ? '' : 'disabled'}`;
      card.innerHTML = `
        <div class="card-header">
          <span class="card-title">${item.name}</span>
          <span class="card-meta">$${item.price}</span>
        </div>
        <div class="menu-actions">
          <button type="button" class="qty-btn" data-action="decrease">−</button>
          <span class="qty-value">${getQty(item.id)}</span>
          <button type="button" class="qty-btn" data-action="increase">＋</button>
        </div>
        <div class="badge-row">
          <span class="badge ${item.available ? 'badge-info' : 'badge-danger'}">${item.available ? '可訂購' : '售完'}</span>
        </div>
      `;
      const decrease = card.querySelector('[data-action="decrease"]');
      const increase = card.querySelector('[data-action="increase"]');
      decrease.addEventListener('click', () => adjustItem(item, -1));
      increase.addEventListener('click', () => {
        if (!item.available) {
          showToast('此品項已售完');
          return;
        }
        adjustItem(item, 1);
      });
      menuContainer.appendChild(card);
    });
  }

  function getQty(itemId) {
    const entry = workingOrder.items.find((item) => item.id === itemId);
    return entry?.qty || 0;
  }

  function updateBottomBar() {
    const name = resolveName();
    const subtotal = workingOrder.items.reduce((sum, item) => sum + item.price * item.qty, 0);
    personalSubtotalEl.textContent = `$${subtotal.toFixed(0)}`;
    if (noteInput) {
      noteInput.value = workingOrder.note || '';
    }
    const totals = computeTotals(getActiveDate());
    classTotalEl.textContent = `$${totals.classTotal.toFixed(0)}`;
    unpaidEl.textContent = `${totals.unpaid.length} 人未付款`;
    const orderMap = Object.keys(getOrders(getActiveDate()));
    const missing = getNames().filter((person) => !orderMap.includes(person));
    missingEl.textContent = missing.length ? `未下單：${missing.join('、')}` : '所有人皆已下單';
    submitOrderBtn.disabled = !name || !workingOrder.restaurantId || subtotal <= 0;
  }

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

  function persistLocal() {
    const name = resolveName();
    if (!name) return;
    localStorage.setItem(cacheKey(name), JSON.stringify(workingOrder));
  }

  submitOrderBtn?.addEventListener('click', () => {
    const name = resolveName();
    if (!name) {
      showToast('請先選擇姓名');
      return;
    }
    workingOrder.note = noteInput.value;
    setOrder(getActiveDate(), name, workingOrder);
    persistLocal();
    showToast('已送出訂單');
    updateBottomBar();
  });

  noteInput?.addEventListener('input', () => {
    workingOrder.note = noteInput.value;
    persistLocal();
  });

  nameSelect?.addEventListener('change', () => {
    currentName = resolveName();
    loadWorkingOrder();
  });

  customNameInput?.addEventListener('blur', () => {
    currentName = resolveName();
    loadWorkingOrder();
  });

  restaurantSelect?.addEventListener('change', () => {
    workingOrder.restaurantId = restaurantSelect.value;
    persistLocal();
    renderMenu();
    updateBottomBar();
  });

  lockOrderBtn?.addEventListener('click', () => {
    if (confirm('確定鎖定點餐並進入結果階段？')) {
      lockOrder();
      showToast('點餐已鎖定');
    }
  });

  copyOrderLineBtn?.addEventListener('click', async () => {
    const summary = generateLineSummary(getActiveDate());
    await navigator.clipboard.writeText(summary);
    showToast('已複製到 LINE');
  });

  whenReady().then(() => {
    renderRestaurants();
    loadWorkingOrder();
    window.addEventListener('lunchvote:update', () => {
      renderRestaurants();
      loadWorkingOrder();
    });
    window.addEventListener('lunchvote:phase', (event) => {
      const { phase, deadlines } = event.detail;
      if (phase === 'order') {
        countdown.textContent = `下單截止 ${deadlines.order}`;
        orderSection.classList.remove('locked');
      } else if (phase === 'vote') {
        countdown.textContent = `投票截止 ${deadlines.vote}`;
        orderSection.classList.add('locked');
      } else {
        countdown.textContent = '今日結果';
        orderSection.classList.add('locked');
      }
    });
    window.LunchVote.checkPhaseChange();
  });
}

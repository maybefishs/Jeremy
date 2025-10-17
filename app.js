const STORAGE_KEY = 'lunchvote-plus';
const UPDATE_EVENT = 'lunchvote:update';
const PHASE_EVENT = 'lunchvote:phase';

// ------------------- 預設狀態 (Default State) -------------------

const DEFAULT_STATE = {
  settings: {
    mode: 'vote',
    requiresPreorder: false,
    baseDate: null,
    timezone: 'Asia/Taipei',
    backup: {
      enabled: false,
      url: ''
    }
  },
  restaurants: [],
  menus: {},
  names: [],
  votes: {},
  orders: {},
};

// ------------------- 全域變數 (Global Variables) -------------------

let state = null;
const readyPromise = new Promise((resolve) => {
  window.whenReady = () => readyPromise;
  readyPromise.resolve = resolve; // 讓 bootstrapApp 可以呼叫
});

// ------------------- 狀態管理 (State Management) -------------------

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // Merge with default state to ensure new properties are added
      return {
        ...DEFAULT_STATE,
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
      };
    } catch (error) {
      console.error('解析儲存狀態失敗', error);
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE)); // Return a deep copy of default state
}

function persistState(triggerEvent = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (triggerEvent) {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: JSON.parse(JSON.stringify(state)) }));
  }
}

// ------------------- 資料初始化 (Data Initialization) -------------------

async function fetchJSON(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`無法載入 ${url}`);
        return await response.json();
    } catch (error) {
        console.error(error);
        return null;
    }
}

async function initializeData() {
    // Only load seed data if state is completely empty (no votes, names, or restaurants)
    if (Object.keys(state.votes).length === 0 && state.names.length === 0 && state.restaurants.length === 0) {
        console.log("偵測到需要載入初始資料...");
        const [names, seedData, menus] = await Promise.all([
            fetchJSON('./data/names.json'),
            fetchJSON('./data/seed.json'),
            fetchJSON('./data/menus.json')
        ]);

        if (names) state.names = names;
        if (seedData && seedData.restaurants) state.restaurants = seedData.restaurants;
        if (menus) state.menus = menus;
        
        persistState(false); // Don't trigger update event yet
    }
}

// ------------------- 時間與階段邏輯 (Time & Phase Logic) -------------------

function getActiveDate() {
  return state.settings.baseDate;
}

function getPhaseAndDeadlines() {
  const now = dayjs().tz(state.settings.timezone);
  const baseDate = dayjs(state.settings.baseDate).tz(state.settings.timezone);

  const voteDeadline = baseDate.hour(11).minute(0).second(0); // 11:00 投票截止
  const orderDeadline = baseDate.hour(12).minute(0).second(0); // 12:00 點餐截止

  let phase = 'vote';
  let deadlines = {
    vote: voteDeadline.format('HH:mm'),
    order: orderDeadline.format('HH:mm'),
  };

  if (now.isAfter(orderDeadline)) {
    phase = 'result';
  } else if (now.isAfter(voteDeadline)) {
    phase = 'order';
  }

  return { phase, deadlines };
}

function checkPhaseChange() {
  const { phase, deadlines } = getPhaseAndDeadlines();
  window.dispatchEvent(new CustomEvent(PHASE_EVENT, { detail: { phase, deadlines } }));
}

setInterval(checkPhaseChange, 60 * 1000); // 每分鐘檢查一次階段

// ------------------- UI 渲染 (UI Rendering) -------------------

function renderNameOptions(selectElement) {
  if (!selectElement) return;

  const currentValue = selectElement.value;
  selectElement.innerHTML = '<option value="">請選擇你的名字</option>';
  
  state.names.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    selectElement.appendChild(option);
  });
  
  const otherOption = document.createElement('option');
  otherOption.value = 'other';
  otherOption.textContent = '其他...';
  selectElement.appendChild(otherOption);

  if (currentValue) {
      selectElement.value = currentValue;
  }
}

function renderRestaurantOptions() {
    const container = document.getElementById('voteCards');
    if (!container) return;

    container.innerHTML = '';
    state.restaurants.forEach(restaurant => {
        const card = document.createElement('button');
        card.className = 'card vote-card';
        card.dataset.restaurantId = restaurant.id;
        card.type = 'button';

        card.innerHTML = `
            <h3 class="card-title">${restaurant.name}</h3>
            <p class="card-meta">${restaurant.tags?.join('・') || (restaurant.requiresPreorder ? '需提前預訂' : '可當日訂')}</p>
        `;
        container.appendChild(card);
    });
}

function renderUI() {
  renderNameOptions(document.getElementById('user-select-vote'));
  renderNameOptions(document.getElementById('user-select-order'));
  renderRestaurantOptions();
}


// ------------------- 核心功能導出 (Export Core Functions) -------------------

function getSettings() { return state.settings; }

function updateSettings(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  persistState();
}

function getNames() { return state.names; }

function addNames(newNames) {
  const uniqueNewNames = newNames.filter(name => !state.names.includes(name));
  state.names = [...state.names, ...uniqueNewNames].sort();
  persistState();
}

function removeName(nameToRemove) {
  state.names = state.names.filter(name => name !== nameToRemove);
  persistState();
}

function getRestaurants() { return state.restaurants; }

function upsertRestaurant(newRestaurant) {
  const index = state.restaurants.findIndex(r => r.id === newRestaurant.id);
  if (index > -1) {
    state.restaurants[index] = { ...state.restaurants[index], ...newRestaurant };
  } else {
    state.restaurants.push(newRestaurant);
  }
  persistState();
}

function removeRestaurant(restaurantId) {
  state.restaurants = state.restaurants.filter(r => r.id !== restaurantId);
  persistState();
}

function getRestaurantById(restaurantId) { return state.restaurants.find(r => r.id === restaurantId); }

function getMenus() { return state.menus; }

function setMenu(restaurantId, menu) {
  state.menus[restaurantId] = menu;
  persistState();
}

function recordVote(date, name, restaurantId) {
    if (!state.votes[date]) {
        state.votes[date] = {};
    }
    state.votes[date][name] = restaurantId;
    persistState();
}

function getVotes(date) {
    return state.votes[date] || {};
}

function getVoteSummary(date) {
    const currentVotes = getVotes(date);
    const summary = {};
    state.restaurants.forEach(r => {
        summary[r.id] = { ...r, count: 0 };
    });
    for (const voter in currentVotes) {
        const restaurantId = currentVotes[voter];
        if (summary[restaurantId]) {
            summary[restaurantId].count++;
        }
    }
    return Object.values(summary);
}

// ------------------- PIN 碼管理 (PIN Management) -------------------

const PIN_KEY = 'lunchvote-admin-pin';
const LOCK_KEY = 'lunchvote-admin-lock';
const MAX_ATTEMPTS = 3;
const LOCK_DURATION = 5 * 60 * 1000; // 5 minutes

async function setPin(pin) {
  const hashedPin = await hashPin(pin);
  localStorage.setItem(PIN_KEY, hashedPin);
  localStorage.removeItem(LOCK_KEY);
  persistState();
}

async function verifyPin(inputPin) {
  const storedPin = localStorage.getItem(PIN_KEY);
  if (!storedPin) {
    return { ok: false, reason: 'not_set' };
  }

  const lockInfo = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}');
  if (lockInfo.lockedUntil && Date.now() < lockInfo.lockedUntil) {
    return { ok: false, reason: 'locked', unlockAt: lockInfo.lockedUntil };
  }

  if (await comparePin(inputPin, storedPin)) {
    localStorage.removeItem(LOCK_KEY);
    return { ok: true };
  } else {
    lockInfo.attempts = (lockInfo.attempts || 0) + 1;
    if (lockInfo.attempts >= MAX_ATTEMPTS) {
      lockInfo.lockedUntil = Date.now() + LOCK_DURATION;
      lockInfo.attempts = 0; // Reset attempts after locking
    }
    localStorage.setItem(LOCK_KEY, JSON.stringify(lockInfo));
    return { ok: false, reason: 'incorrect' };
  }
}

// Helper functions for PIN hashing (using Web Crypto API)
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashedPassword;
}

async function comparePin(inputPin, storedHash) {
  const inputHash = await hashPin(inputPin);
  return inputHash === storedHash;
}

// ------------------- 訂單管理 (Order Management) -------------------

function getOrders(date) {
  return state.orders[date] || {};
}

function setPaymentStatus(date, name, paid) {
  if (state.orders[date] && state.orders[date][name]) {
    state.orders[date][name].paid = paid;
    persistState();
  }
}

function generateLineSummary(date) {
  const orders = getOrders(date);
  const names = getNames();
  let summary = `今日訂餐統計 (${date}):\n\n`;
  let total = 0;
  let unpaidCount = 0;

  names.forEach(name => {
    const order = orders[name];
    if (order) {
      const items = order.items.map(item => `${item.name} x${item.qty}`).join('、');
      summary += `${name}: ${items} ($${order.subtotal || 0}) ${order.paid ? '✅' : '❌'}\n`;
      total += order.subtotal || 0;
      if (!order.paid) unpaidCount++;
    } else {
      summary += `${name}: 尚未下單\n`;
    }
  });

  summary += `\n總計: $${total}\n未付款人數: ${unpaidCount} 人`;
  return summary;
}

function generatePhoneSummary(date) {
  const orders = getOrders(date);
  const names = getNames();
  let summary = `餐廳您好，我要訂餐。\n`;
  const restaurantOrders = {};

  names.forEach(name => {
    const order = orders[name];
    if (order && order.items.length > 0) {
      const restaurantName = getRestaurantById(order.restaurantId)?.name || '未知餐廳';
      if (!restaurantOrders[restaurantName]) {
        restaurantOrders[restaurantName] = {};
      }
      order.items.forEach(item => {
        if (!restaurantOrders[restaurantName][item.name]) {
          restaurantOrders[restaurantName][item.name] = 0;
        }
        restaurantOrders[restaurantName][item.name] += item.qty;
      });
    }
  });

  for (const resName in restaurantOrders) {
    summary += `\n${resName}:\n`;
    for (const itemName in restaurantOrders[resName]) {
      summary += `  ${itemName} ${restaurantOrders[resName][itemName]} 份\n`;
    }
  }
  return summary;
}

function exportOrdersCsv(date) {
  const orders = getOrders(date);
  const names = getNames();
  let csvContent = '姓名,餐廳,品項,數量,單價,小計,已付款\n';

  names.forEach(name => {
    const order = orders[name];
    if (order && order.items.length > 0) {
      const restaurantName = getRestaurantById(order.restaurantId)?.name || '未知餐廳';
      order.items.forEach(item => {
        csvContent += `${name},${restaurantName},${item.name},${item.qty},${item.price},${item.qty * item.price},${order.paid ? '是' : '否'}\n`;
      });
    } else {
      csvContent += `${name},,,,,,否\n`; // For people who didn't order
    }
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `LunchVote_Orders_${date}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function lockOrder() {
  // Implement order locking logic here, e.g., prevent further changes
  // For now, it just persists state, but could set a flag in state.settings
  state.settings.orderLocked = true; // Example: Add a setting to lock orders
  persistState();
}

// ------------------- 備份與維護 (Backup & Maintenance) -------------------

async function saveDataToServer() {
  const url = state.settings.backup?.url;
  if (!url) return { ok: false, message: '尚未設定備份 URL' };

  try {
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-cache',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'backup', data: state }),
    });
    if (!response.ok) throw new Error(`伺服器錯誤: ${response.statusText}`);
    return { ok: true, message: '備份成功' };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

async function loadDataFromServer() {
  const url = state.settings.backup?.url;
  if (!url) return { ok: false, message: '尚未設定備份 URL' };

  try {
    const fetchUrl = new URL(url);
    fetchUrl.searchParams.set('action', 'restore');
    const response = await fetch(fetchUrl, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`伺服器錯誤: ${response.statusText}`);
    const backup = await response.json();
    if (backup.data) {
      state = { ...DEFAULT_STATE, ...backup.data };
      persistState();
      return { ok: true, message: '還原成功' };
    }
    return { ok: false, message: '備份資料格式不符' };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function clearOldRecords() {
  const thirtyDaysAgo = dayjs().subtract(30, 'day');
  Object.keys(state.votes).forEach(date => {
    if (dayjs(date).isBefore(thirtyDaysAgo)) {
      delete state.votes[date];
    }
  });
  Object.keys(state.orders).forEach(date => {
    if (dayjs(date).isBefore(thirtyDaysAgo)) {
      delete state.orders[date];
    }
  });
  persistState();
}


export { getSettings, updateSettings, getActiveDate, getNames, addNames, removeName, getRestaurants, upsertRestaurant, removeRestaurant, getMenus, setMenu, recordVote, getVotes, getVoteSummary, getPhaseAndDeadlines, checkPhaseChange, saveDataToServer, loadDataFromServer, clearOldRecords, setPin, verifyPin, getOrders, setPaymentStatus, generateLineSummary, generatePhoneSummary, exportOrdersCsv, lockOrder };
export { whenReady };

// ------------------- 應用程式初始化 (App Initialization) -------------------

async function bootstrapApp() {
  if (state) return;

  dayjs.extend(window.dayjs_plugin_utc);
  dayjs.extend(window.dayjs_plugin_timezone);

  state = loadState();
  
  if (!state.settings.baseDate) {
    state.settings.baseDate = dayjs().tz(state.settings.timezone).format('YYYY-MM-DD');
  }
  
  await initializeData();
  
  renderUI();
  
  // *** 修正點：在所有東西都準備好之後，才呼叫 resolve ***
  readyPromise.resolve(state);

  window.addEventListener(UPDATE_EVENT, renderUI);

  console.log("LunchVote+ 中央電腦 (完全體) 已啟動。");
}

document.addEventListener('DOMContentLoaded', bootstrapApp);


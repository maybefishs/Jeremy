// [生產級穩定版 v6.2 - computeTotals 歸位]

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyoqutfqf-eoxPMB11UB8T7NXxPy1qV9SvQoVkxQ0vI7B0K5AG3r0ehZpO7W4qjwT_OlA/exec';

const UPDATE_EVENT = 'lunchvote:update';
const PHASE_EVENT = 'lunchvote:phase';

const DEFAULT_STATE = {
  settings: {
    mode: 'vote', requiresPreorder: false, baseDate: null, timezone: 'Asia/Taipei',
    pinHash: null, pinLockout: null, pinAttempts: 0,
    backup: { enabled: false, url: '' }
  },
  restaurants: [],
  menus: {},
  names: [],
  votes: {},
  orders: {},
};

let state = null;
let resolveReadyPromise;
const readyPromise = new Promise((resolve) => {
  resolveReadyPromise = resolve;
});
let isSaving = false;

function whenReady() {
  return readyPromise;
}

async function loadState() {
  console.log("Attempting to load state from backend...");
  try {
    const response = await fetch(APPS_SCRIPT_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const loadedState = await response.json();
    console.log("State loaded successfully from backend:", loadedState);
    // Ensure nested objects/arrays exist even if backend returns partial data
     const mergedState = {
        ...DEFAULT_STATE,
        ...loadedState,
        settings: { ...DEFAULT_STATE.settings, ...(loadedState.settings || {}) },
        restaurants: loadedState.restaurants || [],
        menus: loadedState.menus || {},
        names: loadedState.names || [],
        votes: loadedState.votes || {},
        orders: loadedState.orders || {},
    };
    return mergedState;
  } catch (error) {
    console.error('Failed to load state from backend:', error);
    alert('無法從伺服器載入資料，將使用預設值。部分功能可能受限。');
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}


async function persistState(triggerEvent = true) {
  if (isSaving) {
      console.warn("Save already in progress, skipping.");
      return;
  }
  isSaving = true;
  console.log("Attempting to save state to backend...");

  const stateToSave = JSON.parse(JSON.stringify(state || DEFAULT_STATE)); // Ensure state exists

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'application/json',
      },
      redirect: 'follow',
      body: JSON.stringify(stateToSave),
    });

    if (!response.ok) {
        console.error(`Backend save failed! status: ${response.status}`);
        showToast("儲存到雲端失敗，請稍後再試。");
    } else {
        console.log("State saved successfully to backend.");
    }

  } catch (error) {
    console.error('Error saving state to backend:', error);
    showToast("儲存到雲端時發生網路錯誤。");
  } finally {
      isSaving = false;
  }

  // Always trigger UI update immediately (optimistic update)
  if (triggerEvent) {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: stateToSave }));
  }
}

// --- 時間 & PIN 碼邏輯 (Unchanged) ---
function getActiveDate() { return state?.settings?.baseDate; }

async function simpleHash(str) {
  if (!str || typeof str !== 'string') return '';
  const buffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function setPin(pin) {
  if (!state || !state.settings) return;
  state.settings.pinHash = await simpleHash(pin);
  state.settings.pinAttempts = 0;
  state.settings.pinLockout = null;
  await persistState(); // Ensure save completes before proceeding? Or keep async?
}

async function verifyPin(pin) {
  if (!state || !state.settings) return { ok: false, reason: 'state_not_loaded' };
  const { settings } = state;
  if (!settings.pinHash) return { ok: true, reason: 'not_set' };
  if (settings.pinLockout && Date.now() < settings.pinLockout) return { ok: false, reason: 'locked', unlockAt: settings.pinLockout };

  const hash = await simpleHash(pin);
  if (hash === settings.pinHash) {
    settings.pinAttempts = 0;
    // No explicit save needed if attempts reset successfully
    return { ok: true };
  } else {
    settings.pinAttempts = (settings.pinAttempts || 0) + 1;
    if (settings.pinAttempts >= 5) settings.pinLockout = Date.now() + 5 * 60 * 1000;
    await persistState(false); // Save attempts/lockout state
    return { ok: false, reason: 'incorrect' };
  }
}


// --- Core Getters/Setters ---
function getSettings() { return state?.settings || DEFAULT_STATE.settings; }
function updateSettings(newSettings) {
  if (!state || !state.settings) return;
  state.settings = { ...state.settings, ...newSettings };
  persistState();
}
function getNames() { return state?.names || DEFAULT_STATE.names; }
function addNames(newNames) {
  if (!state) return;
  const currentNames = state.names || [];
  const namesSet = new Set([...currentNames, ...newNames.map(n => String(n).trim()).filter(Boolean)]);
  state.names = Array.from(namesSet).sort();
  persistState();
}
function removeName(nameToRemove) {
  if (!state || !state.names) return;
  state.names = state.names.filter(name => name !== nameToRemove);
  persistState();
}
function getRestaurants(activeOnly = false) {
  const restaurants = state?.restaurants || DEFAULT_STATE.restaurants;
  return activeOnly ? restaurants.filter(r => r.status !== 'archived' && r.status !== 'closed') : restaurants; // Adjust filter if needed
}
function getRestaurantById(id) {
    return state?.restaurants?.find(r => r.id === id);
}
function upsertRestaurant(data) {
  if (!state) return;
  if (!state.restaurants) state.restaurants = [];
  const index = state.restaurants.findIndex(r => r.id === data.id);
  if (index > -1) state.restaurants[index] = { ...state.restaurants[index], ...data }; // Merge data
  else state.restaurants.push(data);
  persistState();
}
function removeRestaurant(id) {
  if (!state) return;
  if (state.restaurants) state.restaurants = state.restaurants.filter(r => r.id !== id);
  if (state.menus) delete state.menus[id];
  persistState();
}
function getMenus() { return state?.menus || DEFAULT_STATE.menus; }
function setMenu(id, data) {
  if (!state) return;
  if (!state.menus) state.menus = {};
  state.menus[id] = data;
  persistState();
}
function recordVote(date, name, id) {
  if (!state) return;
  if (!state.votes) state.votes = {};
  if (!state.votes[date]) state.votes[date] = {};
  state.votes[date][name] = id;
  persistState();
}
function getVotes(date) {
    return state?.votes?.[date] || {};
}
function getVoteSummary(date) {
    const votes = getVotes(date);
    const summary = {};
    getRestaurants().forEach(r => { summary[r.id] = { ...r, count: 0 }; });
    Object.values(votes).forEach(id => { if (summary[id]) summary[id].count++; });
    return Object.values(summary).sort((a, b) => b.count - a.count); // Sort summary
}

function getOrder(date, name) {
    return state?.orders?.[date]?.[name];
}
function getOrders(date) {
    return state?.orders?.[date] || {};
}
function setOrder(date, name, orderData) {
    if (!state) return;
    if (!state.orders) state.orders = {};
    if (!state.orders[date]) state.orders[date] = {};
    const existingOrder = state.orders[date][name];
    // Ensure orderData has items, calculate subtotal
     const items = orderData.items || [];
     const subtotal = items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.qty) || 0)), 0);
    state.orders[date][name] = { 
        ...orderData, 
        items: items, // Ensure items array exists
        subtotal: subtotal, // Store calculated subtotal
        paid: existingOrder?.paid || false 
    };
    persistState();
}
function setPaymentStatus(date, name, isPaid) {
    if (!state?.orders?.[date]?.[name]) return;
    state.orders[date][name].paid = isPaid;
    persistState();
}
function clearOldRecords(days) {
    if (!state) return;
    const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
    if(state.votes) Object.keys(state.votes).forEach(date => { if (date < cutoff) delete state.votes[date]; });
    if(state.orders) Object.keys(state.orders).forEach(date => { if (date < cutoff) delete state.orders[date]; });
    persistState();
}

// --- NEW: computeTotals moved here ---
function computeTotals(date) {
    const orders = getOrders(date); // Use getter
    const allNames = getNames(); // Use getter
    let classTotal = 0;
    const unpaid = [];
    const orderedNames = Object.keys(orders);

    allNames.forEach(name => {
        const order = orders[name];
        if (order && order.items) {
            // Use stored subtotal if available, otherwise recalculate
            const subtotal = order.subtotal ?? order.items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.qty) || 0)), 0);
            classTotal += subtotal;
            if (!order.paid) {
                unpaid.push(name);
            }
        }
    });

    const missing = allNames.filter(name => !orderedNames.includes(name));
    return { classTotal, unpaid, missing };
}


async function loadDataFromServer() {
  console.log("Manually triggering state reload from server...");
  state = await loadState();
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: JSON.parse(JSON.stringify(state)) }));
  return true;
}

async function saveDataToServer() { console.warn("saveDataToServer direct call might be redundant now"); persistState(); }

// --- UI Rendering ---
function renderNameOptions(selectElement) {
  if (!selectElement) return;
  const names = getNames();
  const currentValue = selectElement.value;
  selectElement.innerHTML = '<option value="">請選擇你的名字</option>';
  names.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    selectElement.appendChild(option);
  });
  const otherOption = document.createElement('option');
  otherOption.value = 'other';
  otherOption.textContent = '其他...';
  selectElement.appendChild(otherOption);
  if (currentValue && (names.includes(currentValue) || currentValue === 'other')) {
    selectElement.value = currentValue;
  } else {
      selectElement.value = ""; // Ensure reset if value is invalid
  }
}
function renderRestaurantOptions() {
    const container = document.getElementById('voteCards');
    if (!container) return;
    container.innerHTML = '';
    getRestaurants(true).forEach(restaurant => { // Filter active only for voting
        const card = document.createElement('button');
        // Card is already disabled if status is 'closed' by getRestaurants(true) logic, but double check
        card.className = `card vote-card`; 
        card.dataset.restaurantId = restaurant.id;
        card.type = 'button';
        card.innerHTML = `
            <h3 class="card-title">${restaurant.name}</h3>
            <p class="card-meta">${restaurant.requiresPreorder ? '需提前預訂' : '可當日訂'} ${restaurant.status === 'soldout' ? '(售完)' : ''}</p> 
        `; // Simplified status display for voting
        container.appendChild(card);
    });
}
function renderUI() {
  console.log("Rendering UI with current state:", state);
  renderNameOptions(document.getElementById('user-select-vote'));
  renderNameOptions(document.getElementById('user-select-order'));
  renderRestaurantOptions();
}

// --- bootstrapApp (Async) ---
async function bootstrapApp() {
  if (state) return;

  console.log("Bootstrapping app...");
  document.body.classList.add('loading');

  if (window.dayjs_plugin_utc && window.dayjs_plugin_timezone) {
      dayjs.extend(window.dayjs_plugin_utc);
      dayjs.extend(window.dayjs_plugin_timezone);
  } else {
      console.error("DayJS plugins not found!");
  }

  state = await loadState();

  if (state && state.settings && !state.settings.baseDate) {
    state.settings.baseDate = dayjs().tz(state.settings.timezone || 'Asia/Taipei').format('YYYY-MM-DD');
     // No need to persist here, let user interaction trigger saves
  }

  renderUI();

  if (resolveReadyPromise) resolveReadyPromise(state);

  document.body.classList.remove('loading');
  console.log("App bootstrap complete.");

  window.addEventListener(UPDATE_EVENT, (e) => {
      console.log("Internal update event received, re-rendering UI.");
      // Update the global state reference when the event fires
      // This ensures consistency if persistState triggers the event
      state = e.detail; 
      renderUI();
  });
}

// --- Global Initialization ---
document.addEventListener('DOMContentLoaded', bootstrapApp);

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 3500);
    }, 2500);
}

// --- Exports (v6.2) ---
export {
  bootstrapApp, whenReady, getSettings, updateSettings, getActiveDate,
  getNames, addNames, removeName, getRestaurants, getRestaurantById,
  upsertRestaurant, removeRestaurant, getMenus, setMenu, recordVote,
  getVotes, getVoteSummary, setPin, verifyPin, clearOldRecords,
  getOrder, getOrders, setOrder, setPaymentStatus,
  computeTotals, // Added computeTotals
  loadDataFromServer,
  saveDataToServer
};

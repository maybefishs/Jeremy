// [生產級穩定版 v6.0 - 後端整合 Google Apps Script]

// ****** 設定你的 Google Apps Script 部署網址 ******
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyoqutfqf-eoxPMB11UB8T7NXxPy1qV9SvQoVkxQ0vI7B0K5AG3r0ehZpO7W4qjwT_OlA/exec';
// ****** ******

const UPDATE_EVENT = 'lunchvote:update';
const PHASE_EVENT = 'lunchvote:phase'; // Assuming phase logic remains relevant

// --- 預設狀態 (用於載入失敗時的備援) ---
const DEFAULT_STATE = {
  settings: {
    mode: 'vote', requiresPreorder: false, baseDate: null, timezone: 'Asia/Taipei',
    pinHash: null, pinLockout: null, pinAttempts: 0,
    backup: { enabled: false, url: '' } // Backup settings might become redundant
  },
  restaurants: [],
  menus: {},
  names: [],
  votes: {},
  orders: {},
};

// --- 全域變數 & 狀態管理 ---
let state = null;
let resolveReadyPromise;
const readyPromise = new Promise((resolve) => {
  resolveReadyPromise = resolve;
});

// Flag to prevent multiple simultaneous saves
let isSaving = false; 

function whenReady() {
  return readyPromise;
}

// --- NEW: loadState from Google Apps Script ---
async function loadState() {
  console.log("Attempting to load state from backend...");
  try {
    const response = await fetch(APPS_SCRIPT_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const loadedState = await response.json();
    console.log("State loaded successfully from backend:", loadedState);
    // Basic validation/merging with defaults might be good here
    return { ...DEFAULT_STATE, ...loadedState }; 
  } catch (error) {
    console.error('Failed to load state from backend:', error);
    // Return default state on error to allow app to function offline (read-only)
    alert('無法從伺服器載入資料，將使用預設值或上次快取。部分功能可能受限。'); 
    // Optionally load from localStorage as a fallback?
    // const localState = localStorage.getItem('lunchvote-plus-cache');
    // return localState ? JSON.parse(localState) : JSON.parse(JSON.stringify(DEFAULT_STATE));
    return JSON.parse(JSON.stringify(DEFAULT_STATE)); // Return deep copy of default
  }
}

// --- NEW: persistState to Google Apps Script ---
async function persistState(triggerEvent = true) {
  if (isSaving) {
      console.warn("Save already in progress, skipping.");
      return; // Prevent concurrent saves
  }
  isSaving = true;
  console.log("Attempting to save state to backend...");
  
  // Create a deep copy to avoid potential modification issues
  const stateToSave = JSON.parse(JSON.stringify(state)); 

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors', // Important for cross-origin requests
      cache: 'no-cache',
      headers: {
        'Content-Type': 'application/json',
      },
      // Redirect handling might be needed depending on Apps Script setup
      redirect: 'follow', 
      body: JSON.stringify(stateToSave), // Send the current state
    });

    // We typically don't need to wait for the response in simple cases (fire and forget)
    // But basic check can be useful
    if (!response.ok) {
        // Log error but don't block UI
        console.error(`Backend save failed! status: ${response.status}`);
        // Optionally try to parse error message if GAS returns one
        // response.text().then(text => console.error("Error details:", text));
        showToast("儲存到雲端失敗，請稍後再試。"); // Inform user
    } else {
        console.log("State saved successfully to backend.");
        // Optionally save to localStorage as a cache/fallback on successful save?
        // localStorage.setItem('lunchvote-plus-cache', JSON.stringify(stateToSave));
    }
    
  } catch (error) {
    console.error('Error saving state to backend:', error);
    showToast("儲存到雲端時發生網路錯誤。"); // Inform user
  } finally {
      isSaving = false; // Release the lock
  }

  // Trigger UI update regardless of save success (optimistic update)
  if (triggerEvent) {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: stateToSave }));
  }
}

// --- REMOVED: initializeData function ---
// No longer needed as data comes from loadState

// --- 時間 & PIN 碼邏輯 (Unchanged) ---
function getActiveDate() { return state?.settings?.baseDate; } // Added safe navigation

async function simpleHash(str) {
  if (!str || typeof str !== 'string') return '';
  const buffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function setPin(pin) {
  if (!state || !state.settings) return; // Guard clause
  state.settings.pinHash = await simpleHash(pin);
  state.settings.pinAttempts = 0;
  state.settings.pinLockout = null;
  persistState(); // Save change to backend
}

async function verifyPin(pin) {
  if (!state || !state.settings) return { ok: false, reason: 'state_not_loaded' }; // Guard clause
  const { settings } = state;
  if (!settings.pinHash) return { ok: true, reason: 'not_set' };
  if (settings.pinLockout && Date.now() < settings.pinLockout) return { ok: false, reason: 'locked', unlockAt: settings.pinLockout };
  
  const hash = await simpleHash(pin);
  if (hash === settings.pinHash) {
    settings.pinAttempts = 0;
    // No need to persist on successful verification if state doesn't change
    return { ok: true };
  } else {
    settings.pinAttempts = (settings.pinAttempts || 0) + 1;
    if (settings.pinAttempts >= 5) settings.pinLockout = Date.now() + 5 * 60 * 1000;
    persistState(false); // Persist attempt count/lockout, maybe no UI event needed
    return { ok: false, reason: 'incorrect' };
  }
}

// --- Core Getters/Setters (Mostly Unchanged, but call persistState) ---
// Add guard clauses in case state hasn't loaded yet
function getSettings() { return state?.settings || DEFAULT_STATE.settings; }
function updateSettings(newSettings) {
  if (!state || !state.settings) return;
  state.settings = { ...state.settings, ...newSettings };
  persistState(); // Save change
}
function getNames() { return state?.names || DEFAULT_STATE.names; }
function addNames(newNames) {
  if (!state) return;
  const namesSet = new Set([...(state.names || []), ...newNames]);
  state.names = Array.from(namesSet).sort();
  persistState(); // Save change
}
function removeName(nameToRemove) {
  if (!state || !state.names) return;
  state.names = state.names.filter(name => name !== nameToRemove);
  persistState(); // Save change
}
function getRestaurants(activeOnly = false) {
  const restaurants = state?.restaurants || DEFAULT_STATE.restaurants;
  return activeOnly ? restaurants.filter(r => r.status !== 'archived') : restaurants;
}
function getRestaurantById(id) { 
    return state?.restaurants?.find(r => r.id === id); 
}
function upsertRestaurant(data) {
  if (!state) return;
  if (!state.restaurants) state.restaurants = [];
  const index = state.restaurants.findIndex(r => r.id === data.id);
  if (index > -1) state.restaurants[index] = data;
  else state.restaurants.push(data);
  persistState(); // Save change
}
function removeRestaurant(id) {
  if (!state) return;
  if (state.restaurants) state.restaurants = state.restaurants.filter(r => r.id !== id);
  if (state.menus) delete state.menus[id];
  persistState(); // Save change
}
function getMenus() { return state?.menus || DEFAULT_STATE.menus; }
function setMenu(id, data) {
  if (!state) return;
  if (!state.menus) state.menus = {};
  state.menus[id] = data;
  persistState(); // Save change
}
function recordVote(date, name, id) {
  if (!state) return;
  if (!state.votes) state.votes = {};
  if (!state.votes[date]) state.votes[date] = {};
  state.votes[date][name] = id;
  persistState(); // Save change
}
function getVotes(date) { 
    return state?.votes?.[date] || {}; 
}
function getVoteSummary(date) {
    const votes = getVotes(date);
    const summary = {};
    getRestaurants().forEach(r => { summary[r.id] = { ...r, count: 0 }; }); // Use getter
    Object.values(votes).forEach(id => { if (summary[id]) summary[id].count++; });
    return Object.values(summary);
}

// Order related functions (ensure they also call persistState)
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
    // Ensure paid status is preserved if already set
    const existingOrder = state.orders[date][name];
    state.orders[date][name] = { ...orderData, paid: existingOrder?.paid || false }; 
    persistState(); // Save order change
}

// Function to specifically update payment status
function setPaymentStatus(date, name, isPaid) {
    if (!state?.orders?.[date]?.[name]) return; // Order must exist
    state.orders[date][name].paid = isPaid;
    persistState(); // Save payment status change
}


function clearOldRecords(days) {
    if (!state) return;
    // This needs careful implementation with backend - maybe backend handles cleanup?
    // For now, modify local state and persist, hoping backend logic aligns or ignores old data on load.
    const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
    if(state.votes) Object.keys(state.votes).forEach(date => { if (date < cutoff) delete state.votes[date]; });
    if(state.orders) Object.keys(state.orders).forEach(date => { if (date < cutoff) delete state.orders[date]; });
    persistState(); // Save cleaned state
}

// Placeholder for potential future direct server calls if needed beyond load/save all
async function saveDataToServer() { console.warn("saveDataToServer direct call might be redundant now"); persistState(); }
async function loadDataFromServer() { console.warn("loadDataFromServer direct call might be redundant now"); state = await loadState(); window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: state })); }


// --- UI 渲染 (Largely Unchanged, relies on getters) ---
function renderNameOptions(selectElement) {
  if (!selectElement) return;
  const names = getNames(); // Use getter
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
  // Restore value if valid
  if (currentValue && (names.includes(currentValue) || currentValue === 'other')) {
    selectElement.value = currentValue;
  }
}
function renderRestaurantOptions() {
    const container = document.getElementById('voteCards');
    if (!container) return;
    container.innerHTML = '';
    getRestaurants().forEach(restaurant => { // Use getter
        const card = document.createElement('button');
        card.className = `card vote-card ${restaurant.status === 'closed' ? 'disabled' : ''}`; // Handle closed status
        card.dataset.restaurantId = restaurant.id;
        card.type = 'button';
        card.disabled = restaurant.status === 'closed'; // Disable button if closed
        card.innerHTML = `
            <h3 class="card-title">${restaurant.name}</h3>
            <p class="card-meta">${restaurant.requiresPreorder ? '需提前預訂' : '可當日訂'} ${restaurant.status === 'closed' ? '(停售)' : restaurant.status === 'soldout' ? '(售完)' : ''}</p>
        `;
        container.appendChild(card);
    });
}

// General UI update function called after state change
function renderUI() {
  console.log("Rendering UI with current state:", state);
  renderNameOptions(document.getElementById('user-select-vote'));
  renderNameOptions(document.getElementById('user-select-order')); // Ensure this exists if called
  renderRestaurantOptions(); // For vote page
  // Other UI updates needed across different pages might go here or be handled by specific page scripts listening to UPDATE_EVENT
}

// --- NEW: bootstrapApp (Async) ---
async function bootstrapApp() {
  if (state) return; // Already initialized
  
  // Show a loading indicator?
  console.log("Bootstrapping app...");
  document.body.classList.add('loading'); // Add loading class to body?
  
  // Initialize DayJS plugins
  if (window.dayjs_plugin_utc && window.dayjs_plugin_timezone) {
      dayjs.extend(window.dayjs_plugin_utc);
      dayjs.extend(window.dayjs_plugin_timezone);
  } else {
      console.error("DayJS plugins not found!");
  }

  // Load state from backend (await is crucial)
  state = await loadState(); 
  
  // Set default date if needed AFTER loading state
  if (state && state.settings && !state.settings.baseDate) {
    state.settings.baseDate = dayjs().tz(state.settings.timezone || 'Asia/Taipei').format('YYYY-MM-DD');
    // Persist this default date back? Maybe not needed if loadState handles defaults well.
    // persistState(false); // Optionally save immediately
  }

  // Initial UI render with loaded state
  renderUI();
  
  // Signal that the app is ready
  if (resolveReadyPromise) resolveReadyPromise(state);
  
  // Remove loading indicator
  document.body.classList.remove('loading');
  console.log("App bootstrap complete.");

  // Listen for state updates (e.g., from other tabs, though less likely now)
  // window.addEventListener('storage', (e) => { ... }); // localStorage listener is now irrelevant

  // Listen for internal state update events (triggered by persistState)
  window.addEventListener(UPDATE_EVENT, (e) => {
      console.log("Internal update event received, re-rendering UI.");
      state = e.detail; // Update local state variable for consistency
      renderUI(); 
  }); 
}

// --- Global Initialization ---
// Start the app loading process when DOM is ready
document.addEventListener('DOMContentLoaded', bootstrapApp);

// Simple Toast function used by persistState error handling
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3500); // Longer duration for error messages
}


// --- Exports ---
// Export necessary functions for other modules
export {
  bootstrapApp, whenReady, getSettings, updateSettings, getActiveDate,
  getNames, addNames, removeName, getRestaurants, getRestaurantById,
  upsertRestaurant, removeRestaurant, getMenus, setMenu, recordVote,
  getVotes, getVoteSummary, setPin, verifyPin, clearOldRecords,
  getOrder, getOrders, setOrder, setPaymentStatus, 
  // saveDataToServer, loadDataFromServer // Maybe keep for explicit backup/restore?
};

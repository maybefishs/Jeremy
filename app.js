// [最終還原版 v4.0 - 以你的原始碼為基礎重建]

const STORAGE_KEY = 'lunchvote-plus';
const UPDATE_EVENT = 'lunchvote:update';
const PHASE_EVENT = 'lunchvote:phase';

// --- 預設狀態 (Default State) ---
const DEFAULT_STATE = {
  settings: {
    mode: 'vote',
    requiresPreorder: false,
    baseDate: null,
    timezone: 'Asia/Taipei',
    pinHash: null,
    pinLockout: null,
    pinAttempts: 0,
    backup: { enabled: false, url: '' }
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

function whenReady() {
  return readyPromise;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const mergedState = { ...DEFAULT_STATE, ...parsed };
      mergedState.settings = { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) };
      return mergedState;
    } catch (error) { console.error('解析儲存狀態失敗', error); }
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function persistState(triggerEvent = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (triggerEvent) {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: JSON.parse(JSON.stringify(state)) }));
  }
}

// --- 資料初始化 ---
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
  if (state.names.length === 0 || state.restaurants.length === 0) {
    const [names, seedData, menus] = await Promise.all([
      fetchJSON('./data/names.json'), fetchJSON('./data/seed.json'), fetchJSON('./data/menus.json')
    ]);
    if (names) state.names = names;
    if (seedData && seedData.restaurants) state.restaurants = seedData.restaurants;
    if (menus) state.menus = menus;
    persistState(false);
  }
}

// --- 時間 & PIN 碼邏輯 ---
function getActiveDate() { return state.settings.baseDate; }

async function simpleHash(str) {
  if (!str || typeof str !== 'string') return '';
  const buffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function setPin(pin) {
  state.settings.pinHash = await simpleHash(pin);
  state.settings.pinAttempts = 0;
  state.settings.pinLockout = null;
  persistState();
}

async function verifyPin(pin) {
  const { settings } = state;
  if (!settings.pinHash) return { ok: true, reason: 'not_set' };
  if (settings.pinLockout && Date.now() < settings.pinLockout) return { ok: false, reason: 'locked', unlockAt: settings.pinLockout };
  
  const hash = await simpleHash(pin);
  if (hash === settings.pinHash) {
    settings.pinAttempts = 0;
    persistState(false); return { ok: true };
  } else {
    settings.pinAttempts = (settings.pinAttempts || 0) + 1;
    if (settings.pinAttempts >= 5) settings.pinLockout = Date.now() + 5 * 60 * 1000;
    persistState(false); return { ok: false, reason: 'incorrect' };
  }
}

// --- 核心 CRUD & 業務邏輯 ---
function getSettings() { return state.settings; }
function updateSettings(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  persistState();
}
function getNames() { return state.names; }
function addNames(newNames) {
  const namesSet = new Set([...state.names, ...newNames]);
  state.names = Array.from(namesSet).sort();
  persistState();
}
function removeName(nameToRemove) {
  state.names = state.names.filter(name => name !== nameToRemove);
  persistState();
}
function getRestaurants(activeOnly = false) {
  return activeOnly ? state.restaurants.filter(r => r.status !== 'archived') : state.restaurants;
}
function getRestaurantById(id) { return state.restaurants.find(r => r.id === id); }
function upsertRestaurant(data) {
  const index = state.restaurants.findIndex(r => r.id === data.id);
  if (index > -1) state.restaurants[index] = data;
  else state.restaurants.push(data);
  persistState();
}
function removeRestaurant(id) {
  state.restaurants = state.restaurants.filter(r => r.id !== id);
  delete state.menus[id];
  persistState();
}
function getMenus() { return state.menus; }
function setMenu(id, data) {
  state.menus[id] = data;
  persistState();
}
function recordVote(date, name, id) {
  if (!state.votes[date]) state.votes[date] = {};
  state.votes[date][name] = id;
  persistState();
}
function getVotes(date) { return state.votes[date] || {}; }
function getVoteSummary(date) {
    const votes = getVotes(date);
    const summary = {};
    state.restaurants.forEach(r => { summary[r.id] = { ...r, count: 0 }; });
    Object.values(votes).forEach(id => { if (summary[id]) summary[id].count++; });
    return Object.values(summary);
}
function clearOldRecords(days) {
    const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
    Object.keys(state.votes).forEach(date => { if (date < cutoff) delete state.votes[date]; });
    Object.keys(state.orders).forEach(date => { if (date < cutoff) delete state.orders[date]; });
    persistState();
}
async function saveDataToServer() { /* 這裡需要你未來實現備份邏輯 */ console.log("saveDataToServer called"); }
async function loadDataFromServer() { /* 這裡需要你未來實現還原邏輯 */ console.log("loadDataFromServer called"); }

// --- UI 渲染 ---
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
  if (currentValue) selectElement.value = currentValue;
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
            <p class="card-meta">${restaurant.requiresPreorder ? '需提前預訂' : '可當日訂'}</p>
        `;
        container.appendChild(card);
    });
}
function renderUI() {
  renderNameOptions(document.getElementById('user-select-vote'));
  renderNameOptions(document.getElementById('user-select-order'));
  renderRestaurantOptions();
}

// --- 應用程式初始化 ---
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
  
  if (resolveReadyPromise) resolveReadyPromise(state);
  
  window.addEventListener(UPDATE_EVENT, renderUI);
  console.log("LunchVote+ 中央電腦 (v4.0-final) 已啟動。");
}

document.addEventListener('DOMContentLoaded', bootstrapApp);

// --- 導出所有需要的函式 ---
export {
  bootstrapApp, whenReady, getSettings, updateSettings, getActiveDate,
  getNames, addNames, removeName, getRestaurants, getRestaurantById,
  upsertRestaurant, removeRestaurant, getMenus, setMenu, recordVote,
  getVotes, getVoteSummary, setPin, verifyPin, clearOldRecords,
  saveDataToServer, loadDataFromServer
};

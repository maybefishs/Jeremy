// [生產級穩定版 v5.0 - 請完整複製並覆蓋 app.js]

// ===== Google Apps Script 後端 URL =====
// 請將此 URL 替換為您在步驟 2.3 中複製的網頁應用程式網址
const APPS_SCRIPT_URL = 'https://script.google.com/macros/d/YOUR_SCRIPT_ID/usercontent';
const STATE_STORAGE_KEY = 'lunchvote:state-cache';
const UPDATE_EVENT = 'lunchvote:update';
const PHASE_EVENT = 'lunchvote:phase';

// --- 預設狀態 ---
const DEFAULT_STATE = {
  settings: {
    mode: 'vote',
    requiresPreorder: false,
    baseDate: null,
    timezone: 'Asia/Taipei',
    voteCutoff: '',
    orderCutoff: '',
    voteLocked: false,
    orderLocked: false,
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

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeWithDefaults(rawState) {
  if (!rawState || typeof rawState !== 'object') return null;
  const merged = { ...cloneState(DEFAULT_STATE), ...rawState };
  merged.settings = { ...DEFAULT_STATE.settings, ...(rawState.settings || {}) };
  return merged;
}

function looksLikeState(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  return (
    'settings' in candidate ||
    'restaurants' in candidate ||
    'menus' in candidate ||
    'names' in candidate ||
    'orders' in candidate ||
    'votes' in candidate
  );
}

function unwrapStatePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (looksLikeState(payload)) return payload;
  if (payload.state && typeof payload.state === 'object') {
    const unwrapped = unwrapStatePayload(payload.state);
    if (unwrapped) return unwrapped;
  }
  if (payload.data && typeof payload.data === 'object') {
    const unwrapped = unwrapStatePayload(payload.data);
    if (unwrapped) return unwrapped;
  }
  return null;
}

function readCachedState() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return mergeWithDefaults(parsed);
  } catch (error) {
    console.warn('讀取本地快取狀態失敗:', error);
    return null;
  }
}

function writeCachedState(snapshot) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('寫入本地快取狀態失敗:', error);
  }
}

function whenReady() {
  return readyPromise;
}

async function loadState() {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (parseError) {
      throw new Error(`無法解析遠端回應: ${parseError.message}`);
    }

    const extracted = mergeWithDefaults(unwrapStatePayload(data) || data);
    if (!extracted) {
      throw new Error('遠端回應缺少可用的狀態資料');
    }

    writeCachedState(cloneState(extracted));
    return extracted;
  } catch (error) {
    console.error('無法從 Google Sheets 讀取資料，嘗試使用本地快取:', error);
    const cached = readCachedState();
    if (cached) {
      return cached;
    }
    return cloneState(DEFAULT_STATE);
  }
}

async function persistState(triggerEvent = true) {
  if (!state) return;
  const snapshot = cloneState(state);
  writeCachedState(snapshot);
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(snapshot)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    let result = null;
    try {
      result = text ? JSON.parse(text) : null;
    } catch (parseError) {
      result = { ok: true, raw: text };
    }

    if (triggerEvent) {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: snapshot }));
    }

    return result;
  } catch (error) {
    console.error('無法將資料儲存到 Google Sheets:', error);
    if (triggerEvent) {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: snapshot }));
    }
  }
}

// --- 資料初始化 ---
// 此函式保留為佔位以維持向後相容；資料已由 loadState() 從遠端載入。
async function initializeData() {
  // 所有資料已在 loadState() 中從 Google Sheets 讀取
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
  await persistState();
}

async function verifyPin(pin) {
  const { settings } = state;
  if (!settings.pinHash) return { ok: true, reason: 'not_set' };
  if (settings.pinLockout && Date.now() < settings.pinLockout) return { ok: false, reason: 'locked', unlockAt: settings.pinLockout };

  const hash = await simpleHash(pin);
  if (hash === settings.pinHash) {
    settings.pinAttempts = 0;
    await persistState(false);
    return { ok: true };
  } else {
    settings.pinAttempts = (settings.pinAttempts || 0) + 1;
    if (settings.pinAttempts >= 5) settings.pinLockout = Date.now() + 5 * 60 * 1000;
    await persistState(false);
    return { ok: false, reason: 'incorrect' };
  }
}

// --- 核心 CRUD & 業務邏輯 ---
function getSettings() { return state.settings; }
function updateSettings(newSettings) {
  const previousMode = state.settings.mode;
  state.settings = { ...state.settings, ...newSettings };
  persistState();
  const shouldEmit = Boolean(
    newSettings && (
      ('mode' in newSettings && newSettings.mode !== previousMode) ||
      'baseDate' in newSettings ||
      'orderLocked' in newSettings ||
      'voteCutoff' in newSettings ||
      'orderCutoff' in newSettings
    )
  );
  if (shouldEmit) {
    emitPhaseEvent();
  }
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
function getVoteHistory() { return JSON.parse(JSON.stringify(state.votes)); }
function ensureOrderDate(date) {
  if (!state.orders[date]) state.orders[date] = {};
}
function calculateOrderSubtotal(items = []) {
  return items.reduce((sum, item) => {
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    return sum + price * qty;
  }, 0);
}
function resolveOrderSubtotal(order) {
  if (!order) return 0;
  const subtotal = Number(order.subtotal);
  if (!Number.isNaN(subtotal)) return subtotal;
  return calculateOrderSubtotal(order.items || []);
}
function normalizeOrder(order = {}) {
  const items = Array.isArray(order.items) ? order.items.map((item) => ({
    id: item.id,
    orderItemId: item.orderItemId || item.id,
    name: item.name,
    qty: Number(item.qty) || 0,
    price: Number(item.price) || 0,
    options: item.options || ''
  })) : [];
  const subtotal = calculateOrderSubtotal(items);
  return {
    restaurantId: order.restaurantId || '',
    items,
    note: order.note || '',
    paid: !!order.paid,
    subtotal
  };
}
function setOrder(date, name, order) {
  const targetDate = date || getActiveDate();
  if (!targetDate || !name) return;
  ensureOrderDate(targetDate);
  state.orders[targetDate][name] = normalizeOrder(order);
  persistState();
}
function getOrder(date, name) {
  const targetDate = date || getActiveDate();
  if (!targetDate || !name) return null;
  const order = state.orders[targetDate]?.[name];
  return order ? JSON.parse(JSON.stringify(order)) : null;
}
function getOrders(date) {
  const targetDate = date || getActiveDate();
  if (!targetDate) return {};
  return JSON.parse(JSON.stringify(state.orders[targetDate] || {}));
}
function getOrderHistory() {
  return JSON.parse(JSON.stringify(state.orders));
}
function setPaymentStatus(date, name, paid) {
  const targetDate = date || getActiveDate();
  if (!targetDate || !name) return;
  ensureOrderDate(targetDate);
  const current = state.orders[targetDate][name];
  if (!current) return;
  state.orders[targetDate][name] = { ...current, paid: !!paid };
  persistState();
}
function formatOrderItems(order) {
  return order.items
    .map((item) => {
      const optionText = item.options ? ` (${item.options})` : '';
      return `${item.name}${optionText} x${item.qty}`;
    })
    .join('、') || '無品項';
}
function generateLineSummary(date) {
  const targetDate = date || getActiveDate();
  const orders = state.orders[targetDate] || {};
  const restaurantMap = Object.fromEntries(state.restaurants.map((r) => [r.id, r.name]));
  const grouped = {};
  Object.entries(orders).forEach(([name, order]) => {
    const key = order.restaurantId || 'unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ name, order });
  });
  const displayDate = targetDate || '未設定日期';
  const lines = [`📋 ${displayDate} LunchVote+ 點餐摘要`];
  Object.entries(grouped).forEach(([restaurantId, entries]) => {
    const restaurantName = restaurantMap[restaurantId] || '未選擇餐廳';
    lines.push(`\n🍽️ ${restaurantName} (${entries.length} 份)`);
    entries.forEach(({ name, order }) => {
      const subtotal = resolveOrderSubtotal(order).toFixed(0);
      lines.push(`- ${name}: ${formatOrderItems(order)} — $${subtotal}`);
    });
  });
  if (lines.length === 1) lines.push('目前尚無任何訂單。');
  return lines.join('\n');
}
function generatePhoneSummary(date) {
  const targetDate = date || getActiveDate();
  const orders = state.orders[targetDate] || {};
  const restaurantMap = Object.fromEntries(state.restaurants.map((r) => [r.id, r.name]));
  const grouped = {};
  Object.entries(orders).forEach(([name, order]) => {
    const key = order.restaurantId || 'unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ name, order });
  });
  const sections = [];
  Object.entries(grouped).forEach(([restaurantId, entries]) => {
    const restaurantName = restaurantMap[restaurantId] || '未選擇餐廳';
    sections.push(`${restaurantName}:`);
    entries.forEach(({ name, order }) => {
      const subtotal = resolveOrderSubtotal(order).toFixed(0);
      sections.push(`  ${name} - ${formatOrderItems(order)} (共 $${subtotal})`);
    });
  });
  if (!sections.length) sections.push('目前沒有可提供的電話摘要。');
  return sections.join('\n');
}
function exportOrdersCsv(date) {
  const targetDate = date || getActiveDate();
  const orders = state.orders[targetDate] || {};
  const restaurantMap = Object.fromEntries(state.restaurants.map((r) => [r.id, r.name]));
  const rows = [['姓名', '餐廳', '品項', '備註', '小計', '已付款']];
  Object.entries(orders).forEach(([name, order]) => {
    const subtotal = resolveOrderSubtotal(order).toFixed(0);
    rows.push([
      name,
      restaurantMap[order.restaurantId] || '未選擇餐廳',
      formatOrderItems(order),
      order.note || '',
      subtotal,
      order.paid ? '是' : '否'
    ]);
  });
  const csvContent = rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lunchvote_orders_${targetDate || 'orders'}.csv`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
function lockOrder() {
  if (!state) return;
  state.settings.mode = 'result';
  state.settings.orderLocked = true;
  persistState();
  emitPhaseEvent();
}
function computePhaseDeadlines() {
  if (!state || !state.settings) return { vote: '--:--', order: '--:--' };
  const { baseDate, timezone, voteCutoff, orderCutoff } = state.settings;
  if (!baseDate) return { vote: '--:--', order: '--:--' };

  if (typeof dayjs === 'undefined' || !dayjs.tz) {
    return { vote: '--:--', order: '--:--' };
  }

  const tz = timezone || dayjs.tz.guess();
  const base = dayjs.tz(baseDate, 'YYYY-MM-DD', tz);
  if (!base.isValid()) {
    return { vote: '--:--', order: '--:--' };
  }

  const parseCutoff = (timeString) => {
    if (!timeString || typeof timeString !== 'string') return null;
    const match = timeString.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) return null;
    return base.hour(hour).minute(minute).second(0).millisecond(0);
  };

  const voteTime = parseCutoff(voteCutoff);
  const orderTime = parseCutoff(orderCutoff);

  return {
    vote: voteTime ? voteTime.format('HH:mm') : '--:--',
    order: orderTime ? orderTime.format('HH:mm') : '--:--'
  };
}
function emitPhaseEvent() {
  if (!state) return;
  const detail = {
    phase: state.settings.mode || 'vote',
    date: state.settings.baseDate,
    deadlines: computePhaseDeadlines(),
    orderLocked: !!state.settings.orderLocked
  };
  window.dispatchEvent(new CustomEvent(PHASE_EVENT, { detail }));
  updatePhaseUI(detail.phase);
}
function updatePhaseUI(phase = state?.settings?.mode) {
  if (!phase) return;
  const sections = document.querySelectorAll('[data-section]');
  sections.forEach((section) => {
    const target = section.dataset.section;
    if (target === phase) {
      section.classList.remove('hidden');
    } else {
      section.classList.add('hidden');
    }
  });
  const resultSummary = document.getElementById('resultSummary');
  if (phase === 'result' && resultSummary) {
    const summary = generateLineSummary();
    resultSummary.textContent = summary;
  }
}
function clearOldRecords(days) {
    const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
    Object.keys(state.votes).forEach(date => { if (date < cutoff) delete state.votes[date]; });
    Object.keys(state.orders).forEach(date => { if (date < cutoff) delete state.orders[date]; });
    persistState();
}
async function saveDataToServer() {
  const backup = state?.settings?.backup;
  if (!backup?.enabled || !backup.url) {
    throw new Error('未設定備份端點');
  }

  const payload = {
    timestamp: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state))
  };

  const response = await fetch(backup.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || '備份失敗');
  }
}

async function loadDataFromServer() {
  const backup = state?.settings?.backup;
  if (!backup?.enabled || !backup.url) {
    throw new Error('未設定備份端點');
  }

  const response = await fetch(backup.url);
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || '還原失敗');
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error('備份資料不是有效的 JSON');
  }

  const incomingState = mergeWithDefaults(unwrapStatePayload(payload) || payload);
  if (!incomingState) {
    throw new Error('備份資料格式不正確');
  }

  state = incomingState;

  await persistState();
  emitPhaseEvent();
}

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
  updatePhaseUI();
}

// --- 應用程式初始化 ---
async function bootstrapApp() {
  if (state) return;
  dayjs.extend(window.dayjs_plugin_utc);
  dayjs.extend(window.dayjs_plugin_timezone);
  state = await loadState();
  if (!state.settings.baseDate) {
    state.settings.baseDate = dayjs().tz(state.settings.timezone).format('YYYY-MM-DD');
  }
  renderUI();
  emitPhaseEvent();

  if (resolveReadyPromise) resolveReadyPromise(state);

  window.addEventListener(UPDATE_EVENT, renderUI);
  console.log("LunchVote+ 中央電腦 (v5.0-stable) 已啟動。");
}

document.addEventListener('DOMContentLoaded', bootstrapApp);

window.LunchVote = {
  checkPhaseChange: emitPhaseEvent,
  getCurrentPhase: () => state?.settings?.mode || 'vote'
};

// --- 導出所有需要的函式 ---
export {
  UPDATE_EVENT,
  bootstrapApp, whenReady, getSettings, updateSettings, getActiveDate,
  getNames, addNames, removeName, getRestaurants, getRestaurantById,
  upsertRestaurant, removeRestaurant, getMenus, setMenu, recordVote,
  getVotes, getVoteSummary, setPin, verifyPin, clearOldRecords,
  saveDataToServer, loadDataFromServer, setOrder, getOrder,
  getOrders, setPaymentStatus, generateLineSummary,
  generatePhoneSummary, exportOrdersCsv, lockOrder,
  getOrderHistory, getVoteHistory
};

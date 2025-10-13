const STORAGE_KEY = 'lunchvote-plus';
const SECURITY_KEY = 'lunchvote-security';
const UPDATE_EVENT = 'lunchvote:update';
const PHASE_EVENT = 'lunchvote:phase';
const SW_EVENT = 'lunchvote:sw-update';

const DEFAULT_STATE = {
  settings: {
    mode: 'vote',
    requiresPreorder: true,
    baseDate: null, // *** 修正點：初始設為 null，避免在載入時立即呼叫 dayjs
    timezone: 'Asia/Taipei',
    voteLocked: false,
    orderLocked: false,
    backup: {
      enabled: false,
      type: 'sheets',
      url: ''
    }
  },
  restaurants: [
    {
      id: 'TASTY_THAI',
      name: '泰泰好吃',
      requiresPreorder: true,
      status: 'open'
    },
    {
      id: 'MAMA_TACOS',
      name: '媽媽塔可',
      requiresPreorder: false,
      status: 'open'
    },
    {
      id: 'HARVEST_BOWL',
      name: '豐收碗',
      requiresPreorder: false,
      status: 'open'
    }
  ],
  menus: {
    TASTY_THAI: {
      name: '泰泰好吃',
      items: [
        { id: 'basil_chicken', name: '打拋雞飯', price: 110, available: true },
        { id: 'green_curry', name: '綠咖哩雞', price: 120, available: true },
        { id: 'tofu', name: '羅勒豆腐', price: 105, available: true }
      ]
    },
    MAMA_TACOS: {
      name: '媽媽塔可',
      items: [
        { id: 'al_pastor', name: '墨西哥烤肉塔可', price: 95, available: true },
        { id: 'veggie', name: '蔬食塔可', price: 90, available: true },
        { id: 'combo', name: '塔可雙拼', price: 120, available: true }
      ]
    },
    HARVEST_BOWL: {
      name: '豐收碗',
      items: [
        { id: 'chicken_bowl', name: '香料雞胸碗', price: 130, available: true },
        { id: 'vegan_bowl', name: '溫沙拉蔬菜碗', price: 125, available: true },
        { id: 'beef_bowl', name: '照燒牛肉碗', price: 135, available: true }
      ]
    }
  },
  names: ['王小明', '林美珍', '陳大偉', '張心瑜', '吳柏翰'],
  votes: {},
  orders: {},
  payments: {},
  currentPhase: 'vote'
};

const DEFAULT_SECURITY = {
  pinHash: null,
  wrongAttempts: 0,
  lockUntil: 0
};

let state = null;
let security = null;
let readyResolver;
const readyPromise = new Promise((resolve) => {
  readyResolver = resolve;
});
let phaseInterval = null;
let backupInterval = null;

function ensureDayjsPlugins() {
  if (!dayjs.tz) {
    console.error('dayjs timezone plugin missing');
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STATE,
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
        restaurants: parsed.restaurants || DEFAULT_STATE.restaurants,
        menus: parsed.menus || DEFAULT_STATE.menus,
        names: parsed.names || DEFAULT_STATE.names,
        votes: parsed.votes || {},
        orders: parsed.orders || {},
        payments: parsed.payments || {},
        currentPhase: parsed.currentPhase || DEFAULT_STATE.currentPhase
      };
    } catch (error) {
      console.error('Failed to parse stored state', error);
    }
  }
  return deepClone(DEFAULT_STATE);
}

function loadSecurity() {
  const raw = localStorage.getItem(SECURITY_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SECURITY, ...parsed };
    } catch (error)
      console.error('Failed to parse security state', error);
    }
  }
  return deepClone(DEFAULT_SECURITY);
}

function persistState(triggerEvent = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (triggerEvent) {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: deepClone(state) }));
  }
}

function persistSecurity() {
  localStorage.setItem(SECURITY_KEY, JSON.stringify(security));
}

function ensureDateBucket(obj, date) {
  if (!obj[date]) {
    obj[date] = {};
  }
  return obj[date];
}

function getSettings() {
  return state.settings;
}

function getActiveDate() {
  const settings = getSettings();
  return settings.baseDate || dayjs().tz(settings.timezone || 'Asia/Taipei').format('YYYY-MM-DD');
}

function computeDeadlines() {
  const settings = getSettings();
  const timezone = settings.timezone || 'Asia/Taipei';
  const base = dayjs.tz(settings.baseDate || dayjs().tz(timezone).format('YYYY-MM-DD'), timezone);
  const voteDeadline = base.subtract(1, 'day').hour(17).minute(0).second(0);
  const orderDeadlineDefault = base.hour(10).minute(0).second(0);
  const orderDeadlineDirect = settings.requiresPreorder
    ? base.subtract(1, 'day').hour(17).minute(0).second(0)
    : orderDeadlineDefault;

  return {
    voteDeadline,
    orderDeadline: settings.mode === 'direct' ? orderDeadlineDirect : orderDeadlineDefault
  };
}

function getCurrentPhase(now = dayjs()) {
  const settings = getSettings();
  const timezone = settings.timezone || 'Asia/Taipei';
  const zonedNow = now.tz ? now.tz(timezone) : dayjs.tz(now, timezone);
  const { voteDeadline, orderDeadline } = computeDeadlines();

  if (settings.mode === 'direct') {
    if (settings.orderLocked) {
      return 'result';
    }
    return zonedNow.isBefore(orderDeadline) ? 'order' : 'result';
  }

  if (!settings.voteLocked && zonedNow.isBefore(voteDeadline)) {
    return 'vote';
  }
  if (!settings.orderLocked && zonedNow.isBefore(orderDeadline)) {
    return 'order';
  }
  return 'result';
}

function checkPhaseChange() {
  const phase = getCurrentPhase(dayjs());
  if (phase !== state.currentPhase) {
    state.currentPhase = phase;
    persistState(false);
  }
  const deadlines = computeDeadlines();
  window.dispatchEvent(new CustomEvent(PHASE_EVENT, {
    detail: {
      phase,
      deadlines: {
        vote: deadlines.voteDeadline.format('YYYY-MM-DD HH:mm'),
        order: deadlines.orderDeadline.format('YYYY-MM-DD HH:mm')
      }
    }
  }));
  return phase;
}

function startPhaseWatcher() {
  if (phaseInterval) {
    clearInterval(phaseInterval);
  }
  checkPhaseChange();
  phaseInterval = setInterval(checkPhaseChange, 60 * 1000);
}

function scheduleAutomaticBackup() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
  const settings = getSettings();
  if (!settings.backup?.enabled || !settings.backup.url) {
    return;
  }
  const timezone = settings.timezone || 'Asia/Taipei';
  backupInterval = setInterval(() => {
    const now = dayjs().tz(timezone);
    if (now.hour() === 10 && now.minute() === 5) {
      saveDataToServer().catch((err) => console.warn('Backup failed', err));
    }
  }, 60 * 1000);
}

function ensureSecurityWindow() {
  const now = Date.now();
  if (security.lockUntil && now < security.lockUntil) {
    return false;
  }
  if (now >= security.lockUntil && security.lockUntil !== 0) {
    security.lockUntil = 0;
    security.wrongAttempts = 0;
    persistSecurity();
  }
  return true;
}

async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function setPin(pin) {
  security.pinHash = await hashPin(pin);
  security.wrongAttempts = 0;
  security.lockUntil = 0;
  persistSecurity();
}

async function verifyPin(pin) {
  if (!ensureSecurityWindow()) {
    return { ok: false, reason: 'locked', unlockAt: security.lockUntil };
  }
  if (!security.pinHash) {
    return { ok: true, reason: 'not_set' };
  }
  const hash = await hashPin(pin);
  if (hash === security.pinHash) {
    security.wrongAttempts = 0;
    persistSecurity();
    return { ok: true };
  }
  security.wrongAttempts += 1;
  if (security.wrongAttempts >= 3) {
    security.lockUntil = Date.now() + 60 * 1000;
  }
  persistSecurity();
  return { ok: false, reason: 'mismatch', attempts: security.wrongAttempts, unlockAt: security.lockUntil };
}

function ensureDateData(date) {
  ensureDateBucket(state.votes, date);
  ensureDateBucket(state.orders, date);
  ensureDateBucket(state.payments, date);
}

function recordVote(date, name, restaurantId) {
  ensureDateData(date);
  state.votes[date][name] = restaurantId;
  persistState();
}

function getVotes(date) {
  ensureDateData(date);
  return state.votes[date];
}

function getVoteSummary(date) {
  const votes = getVotes(date);
  const tally = {};
  Object.values(votes).forEach((restaurantId) => {
    tally[restaurantId] = (tally[restaurantId] || 0) + 1;
  });
  const restaurants = getRestaurants();
  return restaurants.map((restaurant) => ({
    id: restaurant.id,
    name: restaurant.name,
    count: tally[restaurant.id] || 0
  }));
}

function setOrder(date, name, order) {
  ensureDateData(date);
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const items = order.items.map((item) => ({ ...item }));
  state.orders[date][name] = {
    ...order,
    items,
    subtotal,
    updatedAt: new Date().toISOString()
  };
  persistState();
}

function getOrder(date, name) {
  ensureDateData(date);
  return state.orders[date][name] || null;
}

function getOrders(date) {
  ensureDateData(date);
  return state.orders[date];
}

function setPaymentStatus(date, name, paid) {
  ensureDateData(date);
  if (!state.payments[date][name]) {
    state.payments[date][name] = { paid: false, updatedAt: null };
  }
  state.payments[date][name].paid = paid;
  state.payments[date][name].updatedAt = new Date().toISOString();
  if (state.orders[date][name]) {
    state.orders[date][name].paid = paid;
  }
  persistState();
}

function getPaymentStatus(date, name) {
  ensureDateData(date);
  return state.payments[date][name]?.paid || false;
}

function getNames() {
  return [...state.names];
}

function addNames(newNames) {
  const merged = new Set([...state.names, ...newNames.filter(Boolean)]);
  state.names = Array.from(merged);
  persistState();
}

function removeName(name) {
  state.names = state.names.filter((n) => n !== name);
  Object.keys(state.votes).forEach((date) => delete state.votes[date][name]);
  Object.keys(state.orders).forEach((date) => delete state.orders[date][name]);
  Object.keys(state.payments).forEach((date) => delete state.payments[date][name]);
  persistState();
}

function getRestaurants(includeClosed = false) {
  return state.restaurants.filter((restaurant) => includeClosed || restaurant.status !== 'closed');
}

function upsertRestaurant(restaurant) {
  const index = state.restaurants.findIndex((item) => item.id === restaurant.id);
  if (index >= 0) {
    state.restaurants[index] = { ...state.restaurants[index], ...restaurant };
  } else {
    state.restaurants.push({ ...restaurant });
  }
  persistState();
}

function removeRestaurant(id) {
  state.restaurants = state.restaurants.filter((restaurant) => restaurant.id !== id);
  persistState();
}

function getMenus() {
  return deepClone(state.menus);
}

function setMenu(restaurantId, menu) {
  state.menus[restaurantId] = menu;
  persistState();
}


function getOrderHistory() {
  return deepClone(state.orders);
}

function getVoteHistory() {
  return deepClone(state.votes);
}

function computeTotals(date) {
  const orders = getOrders(date);
  let classTotal = 0;
  const perRestaurant = {};
  const unpaid = [];
  Object.entries(orders).forEach(([name, order]) => {
    const total = order.subtotal ?? 0;
    classTotal += total;
    const restaurant = order.restaurantId || 'unknown';
    perRestaurant[restaurant] = (perRestaurant[restaurant] || 0) + total;
    const paid = getPaymentStatus(date, name) || order.paid;
    if (!paid) {
      unpaid.push(name);
    }
  });
  return {
    classTotal,
    perRestaurant,
    unpaid
  };
}

function generateLineSummary(date = getActiveDate()) {
  ensureDateData(date);
  const phase = getCurrentPhase(dayjs());
  const voteSummary = getVoteSummary(date)
    .sort((a, b) => b.count - a.count)
    .map((item, index) => `${index + 1}. ${item.name}：${item.count} 票`)
    .join('\n');
  const totals = computeTotals(date);
  const perRestaurant = Object.entries(totals.perRestaurant)
    .map(([id, total]) => {
      const restaurant = state.restaurants.find((r) => r.id === id);
      const name = restaurant ? restaurant.name : id;
      return `${name} $${total.toFixed(0)}`;
    })
    .join('\n');
  const unpaidList = totals.unpaid.length ? totals.unpaid.join('、') : '全數完成';
  return [
    '午餐進度更新',
    `日期：${date}`,
    `目前階段：${phase}`,
    voteSummary ? `投票結果：\n${voteSummary}` : '無投票資料',
    perRestaurant ? `點餐金額：\n${perRestaurant}` : '尚未點餐',
    `未付款：${unpaidList}`
  ].join('\n\n');
}

function generatePhoneSummary(date = getActiveDate()) {
  ensureDateData(date);
  const totals = computeTotals(date);
  const restaurantLines = Object.entries(totals.perRestaurant)
    .map(([id, total]) => {
      const restaurant = state.restaurants.find((r) => r.id === id);
      return `${restaurant ? restaurant.name : id}：$${total.toFixed(0)}`;
    })
    .join('，');
  const unpaid = totals.unpaid.join('、');
  return `午餐 ${date} 總額 $${totals.classTotal.toFixed(0)}，${restaurantLines || '尚未下單'}。未付：${unpaid || '無'}`;
}

function exportOrdersCsv(date = getActiveDate()) {
  ensureDateData(date);
  const orders = getOrders(date);
  const rows = [['姓名', '餐廳', '品項', '數量', '單價', '小計', '備註', '付款']];
  Object.entries(orders).forEach(([name, order]) => {
    order.items.forEach((item) => {
      rows.push([
        name,
        (state.restaurants.find((r) => r.id === order.restaurantId)?.name) || order.restaurantId,
        item.name,
        item.qty,
        item.price,
        (item.price * item.qty).toFixed(0),
        order.note || '',
        order.paid ? '已付款' : '未付款'
      ]);
    });
  });
  const content = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const bom = '\ufeff';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `orders_${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function saveDataToServer() {
  const settings = getSettings();
  if (!settings.backup?.enabled || !settings.backup.url) {
    throw new Error('Backup not enabled');
  }
  const response = await fetch(settings.backup.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      timezone: settings.timezone,
      payload: state
    })
  });
  if (!response.ok) {
    throw new Error('Backup request failed');
  }
  return response.json().catch(() => ({}));
}

async function loadDataFromServer() {
  const settings = getSettings();
  if (!settings.backup?.enabled || !settings.backup.url) {
    throw new Error('Backup not enabled');
  }
  const response = await fetch(settings.backup.url, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error('Load request failed');
  }
  const data = await response.json();
  if (data?.payload) {
    state = {
      ...DEFAULT_STATE,
      ...data.payload,
      settings: { ...DEFAULT_STATE.settings, ...data.payload.settings }
    };
    persistState();
    scheduleAutomaticBackup();
    return true;
  }
  return false;
}

function updateSettings(partial) {
  state.settings = { ...state.settings, ...partial };
  persistState();
  scheduleAutomaticBackup();
  checkPhaseChange();
}

function lockVote() {
  updateSettings({ voteLocked: true });
}

function lockOrder() {
  updateSettings({ orderLocked: true });
}

function clearOldRecords(days = 30) {
  const cutoff = dayjs().tz(getSettings().timezone || 'Asia/Taipei').subtract(days, 'day');
  const keepDates = (records) => {
    Object.keys(records).forEach((date) => {
      if (dayjs(date).isBefore(cutoff, 'day')) {
        delete records[date];
      }
    });
  };
  keepDates(state.votes);
  keepDates(state.orders);
  keepDates(state.payments);
  persistState();
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./service-worker.js').then((registration) => {
    if (!navigator.serviceWorker.controller) return;
    if (registration.waiting) {
      notifySwUpdate(registration.waiting);
    }
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          notifySwUpdate(newWorker);
        }
      });
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

function notifySwUpdate(worker) {
  window.dispatchEvent(new CustomEvent(SW_EVENT, {
    detail: {
      update: () => worker.postMessage({ type: 'SKIP_WAITING' })
    }
  }));
}

export async function bootstrapApp() {
  ensureDayjsPlugins();
  if (state) return state;
  state = loadState();
  
  // *** 修正點：如果 baseDate 是 null (代表是第一次載入)，現在才設定它 ***
  if (!state.settings.baseDate) {
      state.settings.baseDate = dayjs().tz(state.settings.timezone || 'Asia/Taipei').format('YYYY-MM-DD');
  }

  security = loadSecurity();
  const params = new URLSearchParams(window.location.search);
  const dateParam = params.get('d');
  if (dateParam) {
    state.settings.baseDate = dateParam;
    persistState(false);
  }

  startPhaseWatcher();
  scheduleAutomaticBackup();
  registerServiceWorker();
  readyResolver(state);
  return state;
}

export function whenReady() {
  return readyPromise;
}

export {
  getSettings,
  updateSettings,
  getCurrentPhase,
  checkPhaseChange,
  lockVote,
  lockOrder,
  getActiveDate,
  getRestaurants,
  upsertRestaurant,
  removeRestaurant,
  getMenus,
  setMenu,
  getNames,
  addNames,
  removeName,
  recordVote,
  getVotes,
  getVoteSummary,
  setOrder,
  getOrder,
  getOrders,
  computeTotals,
  getOrderHistory,
  getVoteHistory,
  setPaymentStatus,
  getPaymentStatus,
  generateLineSummary,
  generatePhoneSummary,
  exportOrdersCsv,
  saveDataToServer,
  loadDataFromServer,
  clearOldRecords,
  setPin,
  verifyPin,
  hashPin,
  scheduleAutomaticBackup
};

window.LunchVote = {
  bootstrapApp,
  whenReady,
  getSettings,
  updateSettings,
  getCurrentPhase,
  checkPhaseChange,
  lockVote,
  lockOrder,
  getActiveDate,
  getRestaurants,
  upsertRestaurant,
  removeRestaurant,
  getMenus,
  setMenu,
  getNames,
  addNames,
  removeName,
  recordVote,
  getVotes,
  getVoteSummary,
  setOrder,
  getOrder,
  getOrders,
  computeTotals,
  getOrderHistory,
  getVoteHistory,
  setPaymentStatus,
  getPaymentStatus,
  generateLineSummary,
  generatePhoneSummary,
  exportOrdersCsv,
  saveDataToServer,
  loadDataFromServer,
  clearOldRecords,
  setPin,
  verifyPin,
  hashPin
};

window.addEventListener('load', () => {
  bootstrapApp();
});


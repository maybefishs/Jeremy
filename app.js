const STORAGE_KEY = 'lunchvote-plus';
const SECURITY_KEY = 'lunchvote-security';
const UPDATE_EVENT = 'lunchvote:update';
const PHASE_EVENT = 'lunchvote:phase';
const SW_EVENT = 'lunchvote:sw-update';

// ------------------- 預設狀態 (Default State) -------------------

const DEFAULT_STATE = {
  settings: {
    mode: 'vote',
    requiresPreorder: false,
    baseDate: null, // 延後初始化，避免 dayjs 錯誤
    timezone: 'Asia/Taipei',
    voteLocked: false,
    orderLocked: false,
    backup: {
      enabled: false,
      type: 'sheets',
      url: ''
    }
  },
  restaurants: [],
  menus: {},
  names: [],
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

// ------------------- 全域變數 (Global Variables) -------------------

let state = null;
let security = null;
let readyResolver;
const readyPromise = new Promise((resolve) => {
  window.whenReady = resolve;
});
let phaseInterval = null;
let backupInterval = null;

// ------------------- 狀態管理 (State Management) -------------------

/**
 * 從 localStorage 載入狀態，若失敗則使用預設值
 */
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // 合併預設值，確保新舊版本都有對應的 key
      return {
        ...DEFAULT_STATE,
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
      };
    } catch (error) {
      console.error('解析儲存狀態失敗', error);
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE)); // 使用深拷貝
}

/**
 * 從 localStorage 載入安全設定
 */
function loadSecurity() {
  const raw = localStorage.getItem(SECURITY_KEY);
  if (raw) {
    try {
      return { ...DEFAULT_SECURITY, ...JSON.parse(raw) };
    } catch (error) {
      console.error('解析安全設定失敗', error);
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_SECURITY));
}

/**
 * 將目前狀態儲存至 localStorage
 * @param {boolean} triggerEvent - 是否觸發全局更新事件
 */
function persistState(triggerEvent = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (triggerEvent) {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: JSON.parse(JSON.stringify(state)) }));
  }
}

/**
 * 將安全設定儲存至 localStorage
 */
function persistSecurity() {
  localStorage.setItem(SECURITY_KEY, JSON.stringify(security));
}

// ------------------- 資料初始化 (Data Initialization) -------------------

/**
 * 從 data/ 資料夾非同步讀取 JSON 檔案
 * @param {string} url - 檔案路徑
 */
async function fetchJSON(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`無法載入 ${url}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        return null;
    }
}

/**
 * 初始化所有必要的外部資料 (名單、餐廳等)
 */
async function initializeData() {
    // 只有在 state 是空的 (第一次執行) 時候才從檔案載入
    if (state.names.length === 0 && state.restaurants.length === 0) {
        console.log("偵測到首次執行，正在從 data/ 檔案載入初始資料...");
        const [names, seedData, menus] = await Promise.all([
            fetchJSON('./data/names.json'),
            fetchJSON('./data/seed.json'),
            fetchJSON('./data/menus.json')
        ]);

        if (names) state.names = names;
        if (seedData && seedData.restaurants) state.restaurants = seedData.restaurants;
        if (menus) state.menus = menus;
        
        persistState(false); // 第一次載入後先不觸發事件
    }
}


// ------------------- 時間與階段邏輯 (Time & Phase Logic) -------------------

/**
 * 取得當前有效的操作日期 (YYYY-MM-DD)
 */
function getActiveDate() {
  return state.settings.baseDate;
}

/**
 * 計算投票與點餐的截止時間
 */
function computeDeadlines() {
  const { timezone, baseDate, requiresPreorder, mode } = state.settings;
  const base = dayjs.tz(baseDate, timezone);
  
  const voteDeadline = base.subtract(1, 'day').hour(17).minute(0).second(0);
  const orderDeadlineDefault = base.hour(10).minute(0).second(0);
  const orderDeadlinePreorder = base.subtract(1, 'day').hour(17).minute(0).second(0);
  
  const orderDeadline = mode === 'direct' 
    ? (requiresPreorder ? orderDeadlinePreorder : orderDeadlineDefault)
    : orderDeadlineDefault;

  return { voteDeadline, orderDeadline };
}

/**
 * 根據當前時間判斷系統應處於哪個階段
 */
function getCurrentPhase() {
  const now = dayjs().tz(state.settings.timezone);
  const { voteDeadline, orderDeadline } = computeDeadlines();
  const { mode, voteLocked, orderLocked } = state.settings;

  if (mode === 'direct') {
    return orderLocked || now.isAfter(orderDeadline) ? 'result' : 'order';
  }

  // 投票模式
  if (!voteLocked && now.isBefore(voteDeadline)) return 'vote';
  if (!orderLocked && now.isBefore(orderDeadline)) return 'order';
  return 'result';
}

/**
 * 檢查並更新當前階段，並觸發事件
 */
function checkPhaseChange() {
  const newPhase = getCurrentPhase();
  if (newPhase !== state.currentPhase) {
    state.currentPhase = newPhase;
    persistState(false); // 只更新狀態，不觸發全局刷新
  }
  
  const deadlines = computeDeadlines();
  window.dispatchEvent(new CustomEvent(PHASE_EVENT, {
    detail: {
      phase: newPhase,
      deadlines: {
        vote: deadlines.voteDeadline.format('YYYY-MM-DD HH:mm'),
        order: deadlines.orderDeadline.format('YYYY-MM-DD HH:mm')
      }
    }
  }));
}

/**
 * 啟動每分鐘檢查一次階段變化的計時器
 */
function startPhaseWatcher() {
  if (phaseInterval) clearInterval(phaseInterval);
  checkPhaseChange(); // 立即執行一次
  phaseInterval = setInterval(checkPhaseChange, 60000); // 每 60 秒檢查一次
}

// ------------------- UI 渲染 (UI Rendering) -------------------

/**
 * 統一更新所有 UI 元素
 */
function renderUI() {
    // 這裡只是一個範例，實際的渲染會分散在各個模組中，由 UPDATE_EVENT 觸發
    console.log("全局 UI 更新事件已觸發，各模組應自行更新。");
}


// ------------------- 核心功能導出 (Export Core Functions) -------------------
// 為了讓其他模組 (vote.js, order.js) 可以使用這些核心功能

export { getSettings, getActiveDate, getNames, getRestaurants, getRestaurantById, recordVote, getVotes, getVoteSummary };
export { whenReady }; // 導出 readyPromise

// ------------------- 應用程式初始化 (App Initialization) -------------------

/**
 * 應用程式的主進入點
 */
async function bootstrapApp() {
  // 防止重複初始化
  if (state) return;

  // 載入 Day.js 函式庫
  dayjs.extend(window.dayjs_plugin_utc);
  dayjs.extend(window.dayjs_plugin_timezone);

  // 載入狀態
  state = loadState();
  security = loadSecurity();
  
  // 如果是第一次載入，設定今天的日期為 baseDate
  if (!state.settings.baseDate) {
    state.settings.baseDate = dayjs().tz(state.settings.timezone).format('YYYY-MM-DD');
  }

  // 處理 URL 參數
  const params = new URLSearchParams(window.location.search);
  const dateParam = params.get('d');
  if (dateParam) {
    state.settings.baseDate = dateParam;
  }
  
  await initializeData(); // 載入外部 JSON 資料
  
  persistState(false); // 初始化完成後儲存一次

  startPhaseWatcher(); // 啟動階段監控
  
  // 讓其他模_組知道 app 已經準備好了
  window.whenReady(state);

  console.log("LunchVote+ 中央電腦 (完全體) 已啟動。");
}

// 當 DOM 載入完成後，啟動應用程式
document.addEventListener('DOMContentLoaded', bootstrapApp);


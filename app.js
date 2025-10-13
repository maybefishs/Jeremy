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
  // *** 修正點：把 resolve 函式本身掛到 window 上 ***
  window.whenReady = () => readyPromise; 
  readyPromise.resolve = resolve; // 讓 bootstrapApp 可以呼叫
});

// ------------------- 狀態管理 (State Management) -------------------

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STATE,
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
      };
    } catch (error) {
      console.error('解析儲存狀態失敗', error);
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
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
    if (state.names.length === 0 || state.restaurants.length === 0) {
        console.log("偵測到需要載入初始資料...");
        const [names, seedData, menus] = await Promise.all([
            fetchJSON('./data/names.json'),
            fetchJSON('./data/seed.json'),
            fetchJSON('./data/menus.json')
        ]);

        if (names) state.names = names;
        if (seedData && seedData.restaurants) state.restaurants = seedData.restaurants;
        if (menus) state.menus = menus;
        
        persistState(false);
    }
}


// ------------------- 時間與階段邏輯 (Time & Phase Logic) -------------------

function getActiveDate() {
  return state.settings.baseDate;
}

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
function getNames() { return state.names; }
function getRestaurants() { return state.restaurants; }
function getRestaurantById(restaurantId) { return state.restaurants.find(r => r.id === restaurantId); }

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

export { getSettings, getActiveDate, getNames, getRestaurants, getRestaurantById, recordVote, getVotes, getVoteSummary };
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


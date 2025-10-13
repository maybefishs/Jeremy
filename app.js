// 全域狀態管理物件
const AppState = {
  names: [],
  restaurants: [],
  menus: {},
  votes: {}, // { "政宇": "r_turkey", ... }
  orders: {}, // { "政宇": { items: [...], note: '...' }, ... }
  today: new Date().toISOString().split('T')[0], // YYYY-MM-DD
  phase: 'loading', // vote, order, result
  currentUser: null,
};

// DOM 元素快取 (加上底部統計列)
const DOMElements = {
  userSelectVote: document.getElementById('user-select-vote'),
  userSelectOrder: document.getElementById('user-select-order'),
  phaseBadge: document.getElementById('phase-badge'),
  voteSection: document.getElementById('vote-section'),
  orderSection: document.getElementById('order-section'),
  resultSection: document.getElementById('result-section'),
  restaurantOptions: document.getElementById('restaurant-options'),
  // ---- 新增底部統計列的元素 ----
  personalSubtotal: document.querySelector('#personalSubtotal strong'),
  classTotal: document.querySelector('#classTotal strong'),
  unpaidCount: document.querySelector('#unpaidCount strong'),
  missingOrders: document.querySelector('#missingOrders strong'),
};

/**
 * 異步載入所有必要的 JSON 資料
 */
async function loadInitialData() {
  try {
    // 加上 ?t= + 時間戳記，強制瀏覽器不使用快取
    const timestamp = new Date().getTime();
    const [namesRes, seedRes, menusRes] = await Promise.all([
      fetch(`data/names.json?t=${timestamp}`),
      fetch(`data/seed.json?t=${timestamp}`),
      fetch(`data/menus.json?t=${timestamp}`)
    ]);

    if (!namesRes.ok || !seedRes.ok || !menusRes.ok) {
      throw new Error('無法載入必要的資料檔案！');
    }

    AppState.names = await namesRes.json();
    const seedData = await seedRes.json();
    AppState.restaurants = seedData.restaurants;
    AppState.menus = await menusRes.json();

    console.log('資料載入成功:', AppState);
    return true;
  } catch (error) {
    console.error('初始化失敗:', error);
    DOMElements.phaseBadge.textContent = '資料載入失敗';
    DOMElements.phaseBadge.classList.add('result');
    return false;
  }
}

/**
 * 將載入的班級名單填充到下拉選單中
 */
function populateUserSelects() {
  const selects = [DOMElements.userSelectVote, DOMElements.userSelectOrder];
  selects.forEach(select => {
    if (!select) return;
    select.innerHTML = '<option value="">-- 請選擇 --</option>';
    AppState.names.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  });
}

/**
 * 根據目前時間決定系統階段 (之後會換成完整版)
 */
function determinePhase() {
  // 暫時寫死為投票階段，方便測試
  return 'vote';
}

/**
 * 將餐廳資料渲染成卡片，並顯示在投票區
 */
function renderRestaurantOptions() {
  if (!DOMElements.restaurantOptions) return;
  DOMElements.restaurantOptions.innerHTML = '';
  AppState.restaurants.forEach(restaurant => {
    const card = document.createElement('div');
    // 我們把它改成 button 讓它可以被點擊
    card.outerHTML = `
      <button class="restaurant-card" data-id="${restaurant.id}">
        <h3>${restaurant.name}</h3>
        <p>${restaurant.tags.join(' / ')}</p>
      </button>
    `;
  });
   // 因為 outerHTML 替換掉了原本的元素，我們要重新選取
  document.querySelectorAll('.restaurant-card').forEach(card => {
    card.addEventListener('click', handleVote);
  });
}


// ---- 新增的核心武器：中央火控系統 ----

/**
 * 計算所有統計數據
 * @returns {object} 包含總金額、未付款人數、未下單名單等的物件
 */
function calculateSummary() {
    const orderedNames = Object.keys(AppState.orders);
    const missingNames = AppState.names.filter(name => !orderedNames.includes(name));
    
    let classTotal = 0;
    // (未來這裡會加上計算總金額跟未付款人數的邏輯)

    return {
        classTotal: classTotal,
        unpaidCount: 0, // 暫時為 0
        missingCount: missingNames.length,
        missingNames: missingNames.join('、') || '無',
    };
}

/**
 * 統一的 UI 渲染總管
 */
function renderUI() {
  const phase = AppState.phase;
  
  // 1. 更新頂部徽章
  DOMElements.phaseBadge.className = 'badge'; // Reset class
  DOMElements.phaseBadge.textContent = '載入中...';
  if(phase === 'vote') {
    DOMElements.phaseBadge.textContent = '投票階段';
    DOMElements.phaseBadge.classList.add('vote');
  } else if (phase === 'order') {
    DOMElements.phaseBadge.textContent = '點餐階段';
    DOMElements.phaseBadge.classList.add('order');
  } else if (phase === 'result') {
    DOMElements.phaseBadge.textContent = '已截止';
    DOMElements.phaseBadge.classList.add('result');
  }

  // 2. 根據階段顯示對應區塊
  [DOMElements.voteSection, DOMElements.orderSection, DOMElements.resultSection].forEach(section => {
    if(section) section.classList.add('hidden');
  });
  const currentSection = document.getElementById(`${phase}-section`);
  if(currentSection) currentSection.classList.remove('hidden');

  // 3. 渲染動態內容 (例如餐廳選項)
  if (phase === 'vote') {
    renderRestaurantOptions();
  }

  // 4. 計算並渲染底部統計列
  const summary = calculateSummary();
  DOMElements.classTotal.textContent = `$${summary.classTotal}`;
  DOMElements.unpaidCount.textContent = `${summary.unpaidCount} 人`;
  DOMElements.missingOrders.textContent = `未下單：${summary.missingNames}`;
}

// ---- 事件處理函式 ----
function handleVote(event) {
    const selectedName = DOMElements.userSelectVote.value;
    if (!selectedName) {
        alert('請先選擇你的名字！');
        return;
    }
    const restaurantId = event.currentTarget.dataset.id;
    AppState.votes[selectedName] = restaurantId;
    console.log('投票紀錄:', AppState.votes);
    
    // 讓被選中的卡片有高亮效果
    document.querySelectorAll('.restaurant-card').forEach(c => c.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    
    // (未來這裡會更新投票統計)
    alert(`感謝 ${selectedName}！已投給 ${event.currentTarget.querySelector('h3').textContent}`);
}


/**
 * 應用程式初始化函數
 */
async function initializeApp() {
  const dataLoaded = await loadInitialData();
  if (dataLoaded) {
    populateUserSelects();
    AppState.phase = determinePhase();
    renderUI(); // 用我們新的渲染總管來更新畫面
  }
}

// 當 DOM 載入完成後，啟動應用程式
document.addEventListener('DOMContentLoaded', initializeApp);


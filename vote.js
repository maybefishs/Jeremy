import {
  whenReady,
  getActiveDate,
  recordVote,
  getVotes,
  getVoteSummary,
  getRestaurantById,
  getNames
} from './app.js';

// --- 全域變數 ---
let currentName = localStorage.getItem('lunchvote-user-name') || '';

// --- DOM 元素 ---
const voteSection = document.querySelector('[data-section="vote"]');
const nameSelect = document.getElementById('user-select-vote');
const customNameInput = document.getElementById('customNameInput');
const voteCardsContainer = document.getElementById('voteCards');
const voteResultList = document.getElementById('voteResult');

/**
 * 顯示一個短暫的提示訊息
 * @param {string} message - 要顯示的訊息
 */
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

/**
 * 解析目前選擇的姓名
 */
function resolveName() {
    if (nameSelect.value === 'other') {
        return customNameInput.value.trim();
    }
    return nameSelect.value;
}

/**
 * 處理投票動作
 * @param {string} restaurantId - 餐廳 ID
 */
function handleVote(restaurantId) {
  const name = resolveName();
  if (!name) {
    showToast('請先選擇或輸入你的名字！');
    return;
  }
  
  localStorage.setItem('lunchvote-user-name', name);
  
  recordVote(getActiveDate(), name, restaurantId);
  const restaurant = getRestaurantById(restaurantId);
  showToast(`${name} 已投給 ${restaurant ? restaurant.name : '未知餐廳'}`);
}

/**
 * 當 app.js 的資料更新時，觸發這裡的 UI 更新
 */
function updateVoteUI() {
    if (!voteSection) return;

    // 更新投票統計
    const summary = getVoteSummary(getActiveDate());
    summary.sort((a, b) => b.count - a.count);
    voteResultList.innerHTML = '';
    summary.forEach((item, index) => {
      const li = document.createElement('li');
      li.textContent = `${index + 1}. ${item.name} — ${item.count} 票`;
      voteResultList.appendChild(li);
    });

    // 更新被選中的卡片樣式
    const name = resolveName();
    const myVote = name ? getVotes(getActiveDate())[name] : null;
    const cards = voteCardsContainer.querySelectorAll('.vote-card');
    cards.forEach(card => {
        card.classList.toggle('selected', card.dataset.restaurantId === myVote);
    });
}


/**
 * 頁面載入完成後執行的初始化函式
 */
async function initializeVotePage() {
    await whenReady; // 確保 app.js 已經把名單跟餐廳都畫好了

    // 初始化名字選擇
    const names = getNames();
    const savedName = localStorage.getItem('lunchvote-user-name');
    if (savedName) {
        if (names.includes(savedName)) {
            nameSelect.value = savedName;
        } else {
            nameSelect.value = 'other';
            customNameInput.classList.remove('hidden');
            customNameInput.value = savedName;
        }
    }
    
    // 監聽下拉選單的變化
    nameSelect.addEventListener('change', () => {
        if (nameSelect.value === 'other') {
            customNameInput.classList.remove('hidden');
            customNameInput.focus();
        } else {
            customNameInput.classList.add('hidden');
            localStorage.setItem('lunchvote-user-name', nameSelect.value);
            updateVoteUI(); // 切換名字時也要更新投票狀態
        }
    });

    customNameInput.addEventListener('blur', () => {
        const name = customNameInput.value.trim();
        if (name) {
            localStorage.setItem('lunchvote-user-name', name);
        }
    });

    // 為所有餐廳卡片加上點擊事件監聽 (事件委派)
    voteCardsContainer.addEventListener('click', (event) => {
        const card = event.target.closest('.vote-card');
        if (card && card.dataset.restaurantId) {
            handleVote(card.dataset.restaurantId);
        }
    });

    // 監聽來自 app.js 的全局更新事件
    window.addEventListener(UPDATE_EVENT, updateVoteUI);
    
    // 第一次載入時，也手動更新一次UI
    updateVoteUI();

    console.log("投票頁面遙控器 (vote.js) 已準備就緒。");
}

if (voteSection) {
  initializeVotePage();
}


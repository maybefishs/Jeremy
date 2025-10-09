import {
  bootstrapApp,
  whenReady,
  getActiveDate,
  getRestaurants,
  getVoteSummary,
  recordVote,
  getSettings,
  lockVote,
  generateLineSummary,
  getNames,
  getVotes
} from './app.js';

const NAME_STORAGE_KEY = 'lunchvote-user-name';
const voteSection = document.querySelector('[data-section="vote"]');
if (voteSection) {
  bootstrapApp();
  let currentName = localStorage.getItem(NAME_STORAGE_KEY) || '';
  const nameSelect = document.getElementById('nameSelect');
  const customNameInput = document.getElementById('customNameInput');
  const voteGrid = document.getElementById('voteCards');
  const voteResultList = document.getElementById('voteResult');
  const lockVoteBtn = document.getElementById('lockVoteBtn');
  const copyLineBtn = document.getElementById('copyVoteLine');
  const phaseBadge = document.getElementById('phaseBadge');
  const countdown = document.getElementById('countdown');
  let currentPhase = 'vote';

  function resolveName() {
    if (nameSelect?.value === 'other') {
      return customNameInput.value.trim();
    }
    return nameSelect?.value || currentName;
  }

  function saveName(name) {
    if (!name) return;
    currentName = name;
    localStorage.setItem(NAME_STORAGE_KEY, name);
  }

  function renderNames() {
    if (!nameSelect) return;
    const names = getNames();
    nameSelect.innerHTML = '<option value="">選擇姓名</option>';
    names.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name === currentName) {
        option.selected = true;
      }
      nameSelect.appendChild(option);
    });
    const other = document.createElement('option');
    other.value = 'other';
    other.textContent = '其他…';
    nameSelect.appendChild(other);
    if (currentName && !names.includes(currentName)) {
      nameSelect.value = 'other';
      customNameInput.classList.remove('hidden');
      customNameInput.value = currentName;
    }
  }

  function renderVoteCards() {
    if (!voteGrid) return;
    voteGrid.innerHTML = '';
    getRestaurants().forEach((restaurant) => {
      if (restaurant.status === 'closed') return;
      const card = document.createElement('button');
      card.className = 'card vote-card';
      card.type = 'button';
      card.dataset.restaurantId = restaurant.id;
      card.innerHTML = `
        <span class="card-title">${restaurant.name}</span>
        <span class="card-meta">${restaurant.requiresPreorder ? '需預訂' : '現場快速'}</span>
      `;
      card.addEventListener('click', () => {
        const name = resolveName();
        if (!name) {
          showToast('請先選擇姓名');
          return;
        }
        saveName(name);
        recordVote(getActiveDate(), name, restaurant.id);
        highlightSelection(restaurant.id);
        updateVoteSummary();
        showToast(`已投給 ${restaurant.name}`);
      });
      voteGrid.appendChild(card);
    });
    highlightSelection(getVotesForMe());
    setVoteInteractivity(currentPhase === 'vote' && !getSettings().voteLocked);
  }

  function getVotesForMe() {
    const name = resolveName();
    if (!name) return null;
    const votes = getVotes(getActiveDate());
    return votes[name] || null;
  }

  function highlightSelection(restaurantId) {
    voteGrid?.querySelectorAll('.vote-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.restaurantId === restaurantId);
    });
  }

  function setVoteInteractivity(enabled) {
    voteGrid?.querySelectorAll('button').forEach((button) => {
      button.disabled = !enabled;
      button.classList.toggle('disabled', !enabled);
    });
  }

  function updateVoteSummary() {
    if (!voteResultList) return;
    const summary = getVoteSummary(getActiveDate());
    summary.sort((a, b) => b.count - a.count);
    voteResultList.innerHTML = '';
    summary.forEach((item, index) => {
      const li = document.createElement('li');
      li.textContent = `${index + 1}. ${item.name} — ${item.count} 票`;
      voteResultList.appendChild(li);
    });
  }

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

  function handlePhaseChange(event) {
    const { phase, deadlines } = event.detail;
    currentPhase = phase;
    phaseBadge.textContent = phase === 'vote' ? '投票中' : phase === 'order' ? '點餐中' : '結果';
    if (phase === 'vote') {
      countdown.textContent = `截單 ${deadlines.vote}`;
      voteSection.classList.remove('locked');
    } else if (phase === 'order') {
      countdown.textContent = `下單截止 ${deadlines.order}`;
      voteSection.classList.add('locked');
    } else {
      countdown.textContent = '今日結果';
      voteSection.classList.add('locked');
    }
    const settings = getSettings();
    if (settings.mode === 'direct') {
      voteSection.classList.add('hidden');
    } else {
      voteSection.classList.remove('hidden');
    }
    lockVoteBtn.classList.toggle('hidden', phase !== 'vote' || settings.mode === 'direct');
    copyLineBtn.classList.toggle('hidden', phase === 'vote' && settings.mode !== 'direct');
    setVoteInteractivity(phase === 'vote' && !settings.voteLocked);
  }

  nameSelect?.addEventListener('change', () => {
    const value = nameSelect.value;
    if (value === 'other') {
      customNameInput.classList.remove('hidden');
      customNameInput.focus();
    } else {
      customNameInput.classList.add('hidden');
      customNameInput.value = '';
      saveName(value);
      highlightSelection(getVotesForMe());
    }
  });

  customNameInput?.addEventListener('blur', () => {
    const value = customNameInput.value.trim();
    if (value) {
      saveName(value);
    }
  });

  lockVoteBtn?.addEventListener('click', () => {
    if (confirm('確定要鎖定投票並進入點餐階段嗎？')) {
      lockVote();
      voteSection.classList.add('locked');
      setVoteInteractivity(false);
      showToast('投票已鎖定');
    }
  });

  copyLineBtn?.addEventListener('click', async () => {
    const summary = generateLineSummary(getActiveDate());
    await navigator.clipboard.writeText(summary);
    showToast('已複製到 LINE');
  });

  whenReady().then(() => {
    renderNames();
    renderVoteCards();
    updateVoteSummary();
    window.addEventListener('lunchvote:update', () => {
      updateVoteSummary();
      renderVoteCards();
      renderNames();
    });
    window.addEventListener('lunchvote:phase', handlePhaseChange);
    window.LunchVote.checkPhaseChange();
  });
}

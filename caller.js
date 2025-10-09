import {
  bootstrapApp,
  whenReady,
  getActiveDate,
  getOrders,
  getNames,
  setPaymentStatus,
  generateLineSummary,
  generatePhoneSummary,
  exportOrdersCsv,
  lockOrder
} from './app.js';

const callerPage = document.querySelector('[data-page="caller"]');
if (callerPage) {
  bootstrapApp();
  const ordersContainer = document.getElementById('callerOrders');
  const outstandingEl = document.getElementById('callerOutstanding');
  const copyLineBtn = document.getElementById('callerCopyLine');
  const copyPhoneBtn = document.getElementById('callerCopyPhone');
  const exportCsvBtn = document.getElementById('callerExportCsv');
  const lockBtn = document.getElementById('callerLockOrder');
  const preorderBanner = document.getElementById('preorderBanner');

  const firedReminders = new Set();

  function renderOrders() {
    const date = getActiveDate();
    const orders = getOrders(date);
    const names = getNames();
    ordersContainer.innerHTML = '';
    const unpaid = [];
    names.forEach((name) => {
      const order = orders[name];
      const paid = order?.paid || false;
      if (!order) {
        const missingRow = document.createElement('div');
        missingRow.className = 'list-row missing';
        missingRow.innerHTML = `
          <div>
            <strong>${name}</strong>
            <p>尚未下單</p>
          </div>
        `;
        ordersContainer.appendChild(missingRow);
        unpaid.push(name);
        return;
      }
      const row = document.createElement('div');
      row.className = `list-row ${paid ? 'paid' : ''}`;
      const items = order.items.map((item) => `${item.name} x${item.qty}`).join('、');
      row.innerHTML = `
        <div>
          <strong>${name}</strong>
          <p>${items || '無品項'} — $${order.subtotal?.toFixed(0) || 0}</p>
        </div>
        <button type="button" class="badge ${paid ? 'badge-success' : 'badge-warning'}" data-name="${name}">
          ${paid ? '已付款' : '未付款'}
        </button>
      `;
      const button = row.querySelector('button');
      button.addEventListener('click', () => togglePaid(name, !paid));
      ordersContainer.appendChild(row);
      if (!paid) {
        unpaid.push(name);
      }
    });
    outstandingEl.textContent = unpaid.length ? `未付款：${unpaid.join('、')}` : '所有人皆已付款';
  }

  function togglePaid(name, paid) {
    const date = getActiveDate();
    if (paid) {
      setPaymentStatus(date, name, true);
      renderOrders();
      showUndoToast(`${name} 標記為已付款`, () => {
        setPaymentStatus(date, name, false);
        renderOrders();
      });
    } else {
      setPaymentStatus(date, name, false);
      renderOrders();
      showToast(`${name} 已恢復為未付款`);
    }
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

  function showUndoToast(message, undo) {
    const toast = document.createElement('div');
    toast.className = 'toast with-action';
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.textContent = '復原';
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(text, undoBtn);
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    const timeout = setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
    undoBtn.addEventListener('click', () => {
      clearTimeout(timeout);
      toast.remove();
      undo();
    });
  }

  function scheduleReminders() {
    const check = () => {
      const now = dayjs();
      const time1630 = dayjs().hour(16).minute(30);
      const time1700 = dayjs().hour(17).minute(0);
      if (!firedReminders.has('toast1630') && now.isAfter(time1630) && now.isBefore(time1700)) {
        showToast('提醒：16:30 請先預訂餐廳');
        firedReminders.add('toast1630');
      }
      if (now.isAfter(time1700)) {
        preorderBanner.classList.add('visible');
      }
    };
    check();
    setInterval(check, 60 * 1000);
  }

  copyLineBtn?.addEventListener('click', async () => {
    const summary = generateLineSummary(getActiveDate());
    await navigator.clipboard.writeText(summary);
    showToast('已複製到 LINE');
  });

  copyPhoneBtn?.addEventListener('click', async () => {
    const summary = generatePhoneSummary(getActiveDate());
    await navigator.clipboard.writeText(summary);
    showToast('已複製電話摘要');
  });

  exportCsvBtn?.addEventListener('click', () => {
    exportOrdersCsv(getActiveDate());
  });

  lockBtn?.addEventListener('click', () => {
    if (confirm('確定鎖定點餐並產生最終結果？')) {
      lockOrder();
      showToast('點餐已鎖定');
    }
  });

  whenReady().then(() => {
    renderOrders();
    window.addEventListener('lunchvote:update', renderOrders);
    window.addEventListener('lunchvote:phase', (event) => {
      const { phase, deadlines } = event.detail;
      const badge = document.getElementById('phaseBadge');
      const countdown = document.getElementById('countdown');
      if (badge) {
        badge.textContent = phase === 'order' ? '點餐中' : phase === 'result' ? '結果' : '投票';
      }
      if (countdown) {
        if (phase === 'order') {
          countdown.textContent = `下單截止 ${deadlines.order}`;
        } else if (phase === 'vote') {
          countdown.textContent = `投票截止 ${deadlines.vote}`;
        } else {
          countdown.textContent = '今日結果';
        }
      }
    });
    scheduleReminders();
    window.LunchVote.checkPhaseChange();
  });
}

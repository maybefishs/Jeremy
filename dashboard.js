import {
  bootstrapApp,
  whenReady,
  getOrderHistory,
  getVoteHistory,
  getRestaurants,
  getActiveDate,
  getOrders,
  getNames
} from './app.js';

const dashboardPage = document.querySelector('[data-page="dashboard"]');

if (dashboardPage) {
  bootstrapApp();
  const restaurantCanvas = document.getElementById('chartRestaurants');
  const dailyCanvas = document.getElementById('chartDaily');
  const paymentCanvas = document.getElementById('chartPayments');

  function renderCharts() {
    const ordersHistory = getOrderHistory();
    const voteHistory = getVoteHistory();
    const restaurants = getRestaurants(true);

    const restaurantCounts = {};
    Object.values(voteHistory).forEach((voteByName) => {
      Object.values(voteByName).forEach((restaurantId) => {
        restaurantCounts[restaurantId] = (restaurantCounts[restaurantId] || 0) + 1;
      });
    });
    const restaurantLabels = restaurants.map((r) => r.name);
    const restaurantData = restaurants.map((r) => restaurantCounts[r.id] || 0);

    const dailyTotals = Object.keys(ordersHistory)
      .sort()
      .map((date) => ({
        date,
        total: Object.values(ordersHistory[date]).reduce((sum, order) => sum + (order.subtotal || 0), 0)
      }));

    const ordersToday = getOrders(getActiveDate());
    const names = getNames();
    const paidCount = names.filter((name) => ordersToday[name]?.paid).length;
    const unpaidCount = names.length - paidCount;

    new Chart(restaurantCanvas, {
      type: 'bar',
      data: {
        labels: restaurantLabels,
        datasets: [
          {
            label: '票數',
            data: restaurantData,
            backgroundColor: '#3a6ff7'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        }
      }
    });

    new Chart(dailyCanvas, {
      type: 'line',
      data: {
        labels: dailyTotals.map((item) => item.date),
        datasets: [
          {
            label: '每日總額',
            data: dailyTotals.map((item) => item.total),
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.3)',
            tension: 0.3,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });

    new Chart(paymentCanvas, {
      type: 'pie',
      data: {
        labels: ['已付款', '未付款'],
        datasets: [
          {
            data: [paidCount, unpaidCount],
            backgroundColor: ['#22c55e', '#ef4444']
          }
        ]
      },
      options: {
        responsive: true
      }
    });
  }

  whenReady().then(() => {
    renderCharts();
  });
}

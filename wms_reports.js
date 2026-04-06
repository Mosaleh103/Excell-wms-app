/**
 * wms_reports.js - Dashboard Stats, Stock Balances, Expiry & Reorder reports
 */

async function loadDashboardCards() {
  // Total Products
  let { count: pcount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  document.getElementById('kpi-total-products').textContent = pcount || 0;
  
  // Total Stock
  let { data: bData } = await supabase.from('stock_balance').select('current_stock');
  const tStock = bData?.reduce((acc, r) => acc + (Number(r.current_stock) || 0), 0) || 0;
  document.getElementById('kpi-total-stock').textContent = tStock;
  
  // Expiry Alerts
  let { count: ecount } = await supabase.from('expiry_report').select('*', { count: 'exact', head: true });
  document.getElementById('kpi-expiry-alerts').textContent = ecount || 0;
  
  // Reorder Alerts
  let { count: rcount } = await supabase.from('reorder_alert').select('*', { count: 'exact', head: true });
  document.getElementById('kpi-reorder-alerts').textContent = rcount || 0;

  // Recent Movements
  let { data: movData } = await supabase.from('stock_movements')
    .select('movement_type, quantity, created_at, products(name), warehouses(name)')
    .order('created_at', { ascending: false })
    .limit(10);
  
  const mBody = document.getElementById('recent-movements');
  mBody.innerHTML = '';
  movData?.forEach(m => {
    let mt = m.movement_type === 'IN' ? 'وارد' : m.movement_type === 'OUT' ? 'منصرف' : m.movement_type;
    let tColor = m.movement_type === 'IN' ? 'var(--green)' : m.movement_type === 'OUT' ? 'var(--red)' : '';
    mBody.innerHTML += `<tr>
      <td style="color:${tColor}; font-weight:bold;">${mt}</td>
      <td>${m.products?.name}</td>
      <td>${m.quantity}</td>
      <td>${m.warehouses?.name}</td>
      <td style="font-size:11px;">${new Date(m.created_at).toLocaleString()}</td>
    </tr>`;
  });
  
  // Warehouse Distribution
  const distObj = {};
  bData?.forEach((r, idx) => {
     // In real app we load warehouse_id name from stock_balance. 
     // Here we simulate or pull if the view supports it. We'll leave it simple.
  });
}

window.init_dashboard = function() {
  loadDashboardCards();
};

document.getElementById('btn-dash-refresh')?.addEventListener('click', loadDashboardCards);

// ------------------------------------
// REP: STOCK BALANCE
// ------------------------------------
window.init_rep_balance = async function() {
  const tbody = document.getElementById('rep-balance-body');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">جاري التحميل...</td></tr>';
  
  // Since stock_balance view only returns IDs, we'll join via JS or create a better view.
  // For now, we do simple fetch:
  const { data, error } = await supabase.rpc('get_stock_balance_with_names'); // If exists, otherwise:
  
  const { data: bData, error: bErr } = await supabase.from('stock_balance').select('*');
  if(bErr) { showMsg('خطأ في تحميل الأرصدة', 'error'); return; }
  
  if(!bData || bData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا توجد أرصدة مخزنية.</td></tr>';
    return;
  }
  
  // Load lookup tables cache
  const { data: pData } = await supabase.from('products').select('id, name');
  const { data: wData } = await supabase.from('warehouses').select('id, name');
  
  const pMap = {}; pData?.forEach(p => pMap[p.id] = p.name);
  const wMap = {}; wData?.forEach(w => wMap[w.id] = w.name);
  
  tbody.innerHTML = '';
  bData.forEach(row => {
    tbody.innerHTML += `<tr>
      <td>${wMap[row.warehouse_id] || row.warehouse_id}</td>
      <td>${pMap[row.product_id] || row.product_id}</td>
      <td>${row.batch_number || '-'}</td>
      <td>${row.expiry_date || '-'}</td>
      <td style="font-weight:bold; color:var(--text);">${row.current_stock}</td>
    </tr>`;
  });
};

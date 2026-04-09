/**
 * wms_reports.js - v2.0 ERP-Grade Reports
 * Fixed: stock balance report, dashboard refresh, expiry alerts
 */

// ════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════
async function loadDashboardCards() {
  try {
    // Total Products
    const { count: pcount } = await supabase.from('products').select('*', { count: 'exact', head: true });
    const elProd = document.getElementById('kpi-total-products');
    if (elProd) elProd.textContent = pcount || 0;

    // Total Stock (Dual Metrics)
    const { data: bData } = await supabase.from('v_product_stock').select('total_units, total_cartons');
    const tUnits = (bData || []).reduce((acc, r) => acc + (Number(r.total_units) || 0), 0);
    const tCartons = (bData || []).reduce((acc, r) => acc + (Number(r.total_cartons) || 0), 0);
    
    const elStock = document.getElementById('kpi-total-stock');
    if (elStock) elStock.textContent = Math.round(tCartons).toLocaleString();
    const elUnits = document.getElementById('kpi-total-units');
    if (elUnits) elUnits.textContent = `${Math.round(tUnits).toLocaleString()} Units`;

    // Expiry Alerts (within 30 days)
    const { count: ecount } = await supabase.from('v_expiry_alerts').select('*', { count: 'exact', head: true });
    const elExp = document.getElementById('kpi-expiry-alerts');
    if (elExp) elExp.textContent = ecount || 0;

    // Reorder Alerts
    const { count: rcount } = await supabase.from('v_reorder_alerts').select('*', { count: 'exact', head: true });
    const elReorder = document.getElementById('kpi-reorder-alerts');
    if (elReorder) elReorder.textContent = rcount || 0;

    // Recent Movements (from unified transactions ledger)
    const { data: movData } = await supabase
      .from('inventory_transactions')
      .select('transaction_type, quantity, created_at, products(name), warehouses(name)')
      .order('created_at', { ascending: false })
      .limit(10);

    const mBody = document.getElementById('recent-movements');
    if (mBody) {
      let movHtml = '';
      (movData || []).forEach(m => {
        const typeMap = { 
          IN: 'وارد', OUT: 'منصرف', OPENING: 'افتتاحي', 
          TRANSFER_IN: 'تحويل (وارد)', TRANSFER_OUT: 'تحويل (صادر)', ADJUST: 'تعديل' 
        };
        const colorMap = { 
          IN: 'var(--green)', OUT: 'var(--red)', OPENING: 'var(--teal)', 
          TRANSFER_IN: 'var(--excell-blue)', TRANSFER_OUT: 'var(--excell-blue)', ADJUST: 'var(--excell-slate)' 
        };
        const mt = typeMap[m.transaction_type] || m.transaction_type;
        const mc = colorMap[m.transaction_type] || '';
        const dt = new Date(m.created_at).toLocaleDateString('ar-SA');
        movHtml += `<tr>
          <td style="color:${mc}; font-weight:bold; font-size:11px;">${mt}</td>
          <td>${m.products?.name || '-'}</td>
          <td style="font-weight:bold;">${(m.quantity || 0).toLocaleString()}</td>
          <td>${m.warehouses?.name || '-'}</td>
          <td style="font-size:11px; color:#94a3b8;">${dt}</td>
        </tr>`;
      });
      mBody.innerHTML = movHtml || '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">لا توجد حركات مسجلة بعد</td></tr>';
    }

    // Warehouse Distribution
    const { data: whDist } = await supabase.from('v_stock_balance').select('warehouse_id, current_cartons');
    const distMap = {};
    (whDist || []).forEach(row => {
      distMap[row.warehouse_id] = (distMap[row.warehouse_id] || 0) + Number(row.current_cartons || 0);
    });

    const { data: warehouses } = await supabase.from('warehouses').select('id, name');
    const whMap = {};
    (warehouses || []).forEach(w => whMap[w.id] = w.name);

    const distBody = document.getElementById('warehouse-dist');
    if (distBody) {
      let distHtml = '';
      Object.keys(distMap).forEach(whId => {
        distHtml += `<tr>
          <td style="font-weight:600;">${whMap[whId] || whId}</td>
          <td style="font-weight:bold; color:var(--excell-blue); text-align:left;">${Math.round(distMap[whId]).toLocaleString()} كرتونة</td>
        </tr>`;
      });
      distBody.innerHTML = distHtml || '<tr><td colspan="2" style="text-align:center; color:#94a3b8;">لا توجد بيانات مستودعات حالياً</td></tr>';
    }

  } catch (err) {
    console.error('[Dashboard] Error:', err);
  }
}

window.init_dashboard = function() {
  loadDashboardCards();
};

// Dashboard refresh via event delegation
document.addEventListener('click', function(e) {
  if (e.target && e.target.id === 'btn-dash-refresh') {
    loadDashboardCards();
  }
});


// ════════════════════════════════════════════════════
//  STOCK BALANCE REPORT
// ════════════════════════════════════════════════════
window.init_rep_balance = async function() {
  const tbody = document.getElementById('rep-balance-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">⏳ جاري تحميل أرصدة المخزون...</td></tr>';

  // Load lookup tables in parallel
  const [balRes, prodRes, whRes] = await Promise.all([
    supabase.from('stock_balance').select('*').gt('current_stock', 0).order('product_id'),
    supabase.from('products').select('id, name, product_code, unit'),
    supabase.from('warehouses').select('id, name')
  ]);

  if (balRes.error) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">❌ خطأ: ${balRes.error.message}</td></tr>`;
    showMsg('❌ خطأ في تحميل الأرصدة: ' + balRes.error.message, 'error');
    return;
  }

  const bData = balRes.data || [];
  if (bData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">📦 لا توجد أرصدة مخزنية. قم بإدخال رصيد أول المدة أولاً.</td></tr>';
    return;
  }

  // Build lookup maps
  const pMap = {};
  (prodRes.data || []).forEach(p => { pMap[p.id] = p; });
  const wMap = {};
  (whRes.data || []).forEach(w => { wMap[w.id] = w.name; });

  // Sort by warehouse then product name
  bData.sort((a, b) => {
    const wa = wMap[a.warehouse_id] || '';
    const wb = wMap[b.warehouse_id] || '';
    if (wa !== wb) return wa.localeCompare(wb, 'ar');
    const pa = pMap[a.product_id]?.name || '';
    const pb = pMap[b.product_id]?.name || '';
    return pa.localeCompare(pb, 'ar');
  });

  let balHtml = '';
  let grandTotal = 0;

  bData.forEach(row => {
    const prod   = pMap[row.product_id];
    const whName = wMap[row.warehouse_id] || '—';
    const stock  = Number(row.current_stock) || 0;
    grandTotal  += stock;

    // Expiry status
    let expiryBadge = '';
    if (row.expiry_date) {
      const daysLeft = Math.ceil((new Date(row.expiry_date) - new Date()) / 86400000);
      if (daysLeft < 0)       expiryBadge = `<span style="background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:4px;font-size:10px;">منتهي</span>`;
      else if (daysLeft <= 30) expiryBadge = `<span style="background:#fef3c7;color:#d97706;padding:1px 6px;border-radius:4px;font-size:10px;">⚠ ${daysLeft}د</span>`;
      else                    expiryBadge = `<span style="background:#dcfce7;color:#16a34a;padding:1px 6px;border-radius:4px;font-size:10px;">✓ صالح</span>`;
    }

    // Stock color
    const stockColor = stock <= 0 ? '#ef4444' : stock <= 10 ? '#f59e0b' : '#1e2d40';

    balHtml += `<tr>
      <td style="font-weight:600;">${whName}</td>
      <td>${prod?.product_code || '—'}</td>
      <td>${prod?.name || row.product_id}</td>
      <td style="text-align:center;">${row.batch_number || '—'}</td>
      <td style="text-align:center;">${row.expiry_date || '—'} ${expiryBadge}</td>
      <td style="font-weight:700; color:${stockColor}; text-align:left;">${stock.toLocaleString()} ${prod?.unit || ''}</td>
    </tr>`;
  });

  // Grand total row
  balHtml += `<tr style="background:#f8fafc; font-weight:700; border-top:2px solid #e2e8f0;">
    <td colspan="5" style="text-align:left; color:#64748b;">📊 إجمالي وحدات المخزون</td>
    <td style="color:var(--teal); font-size:15px;">${grandTotal.toLocaleString()}</td>
  </tr>`;

  tbody.innerHTML = balHtml;
};

/**
 * wms_inventory.js - ERP-Grade Inventory & Ledger Report
 * Reads from inventory_transactions table (new unified system)
 */

// ════════════════════════════════════════════════════
//  STOCK BALANCE REPORT (upgraded)
// ════════════════════════════════════════════════════
window.init_rep_balance = async function() {
  const tbody = document.getElementById('rep-balance-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;">⏳ جاري تحميل أرصدة المخزون...</td></tr>';

  const [balRes, prodRes, whRes] = await Promise.all([
    supabase.from('v_stock_balance').select('*').gt('current_stock', 0).order('product_id'),
    supabase.from('products').select('id, name, product_code, unit'),
    supabase.from('warehouses').select('id, name')
  ]);

  // Fallback to old view name if new view doesn't exist yet
  let bData = balRes.data;
  let bErr  = balRes.error;
  if (bErr) {
    const fallback = await supabase.from('stock_balance').select('*').gt('current_stock', 0);
    bData = fallback.data;
    bErr  = fallback.error;
  }

  if (bErr) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">❌ ${bErr.message}</td></tr>`;
    return;
  }

  if (!bData || bData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#94a3b8;">📦 لا توجد أرصدة. أدخل رصيد أول المدة أولاً.</td></tr>';
    return;
  }

  const pMap = {};
  (prodRes.data || []).forEach(p => { pMap[p.id] = p; });
  const wMap = {};
  (whRes.data  || []).forEach(w => { wMap[w.id] = w.name; });

  bData.sort((a, b) => {
    const wa = wMap[a.warehouse_id] || '';
    const wb = wMap[b.warehouse_id] || '';
    if (wa !== wb) return wa.localeCompare(wb, 'ar');
    return (pMap[a.product_id]?.name || '').localeCompare(pMap[b.product_id]?.name || '', 'ar');
  });

  let html = '', grand = 0;

  bData.forEach(row => {
    const prod  = pMap[row.product_id];
    const wh    = wMap[row.warehouse_id] || '—';
    const stock = Number(row.current_stock) || 0;
    grand += stock;

    const batchCol  = row.batch_no || row.batch_number || '—';
    const expiry    = row.expiry_date;
    let expiryBadge = '';
    if (expiry) {
      const days = Math.ceil((new Date(expiry) - new Date()) / 86400000);
      if      (days < 0)    expiryBadge = `<span class="badge-expired">منتهي ⚠</span>`;
      else if (days <= 30)  expiryBadge = `<span class="badge-near">${days} يوم</span>`;
      else                  expiryBadge = `<span class="badge-ok">✓</span>`;
    }

    const stockColor = stock <= 0 ? '#ef4444' : '#1e2d40';

    html += `<tr>
      <td>${wh}</td>
      <td style="font-family:monospace;font-size:11px;color:var(--excell-blue);">${prod?.product_code||'—'}</td>
      <td style="font-weight:600;">${prod?.name||row.product_id}</td>
      <td style="text-align:center;">${batchCol}</td>
      <td style="text-align:center;">${expiry||'—'} ${expiryBadge}</td>
      <td style="font-weight:700;color:${stockColor};">${stock.toLocaleString()} <small>${prod?.unit||''}</small></td>
    </tr>`;
  });

  html += `<tr style="background:#f0f9ff;font-weight:700;border-top:2px solid #bae6fd;">
    <td colspan="5" style="text-align:left;padding:10px 14px;color:#0369a1;">📊 إجمالي الوحدات في كل المستودعات</td>
    <td style="color:var(--teal);font-size:15px;padding:10px 14px;">${grand.toLocaleString()}</td>
  </tr>`;

  tbody.innerHTML = html;
};


// ════════════════════════════════════════════════════
//  PRODUCT LEDGER REPORT (دفتر أستاذ المنتج)
// ════════════════════════════════════════════════════
window.init_ledger = async function() {
  const wrap = document.getElementById('ledger-product-wrap');
  if (wrap && !wrap.querySelector('.p-search')) {
    wrap.innerHTML = window.buildProductAutocomplete('ledger-product-id', 'اختر المنتج (بحث بالاسم أو الكود)...');
    window.initAllProductAutocompletes(wrap);
  }

  // Set default dates
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const dateFrom = document.getElementById('ledger-date-from');
  const dateTo   = document.getElementById('ledger-date-to');
  if (dateFrom) dateFrom.value = start.toISOString().split('T')[0];
  if (dateTo)   dateTo.value   = now.toISOString().split('T')[0];
};


// Event delegation for ledger search
document.addEventListener('click', async function(e) {
  if (e.target && e.target.id === 'btn-search-ledger') {
    await runLedgerReport();
  }
  if (e.target && e.target.id === 'btn-export-ledger-excel') {
    exportLedgerToExcel();
  }
  if (e.target && e.target.id === 'btn-export-balance-excel') {
    exportBalanceToExcel();
  }
  if (e.target && e.target.id === 'btn-print-balance') {
    window.print();
  }
});

async function runLedgerReport() {
  const productId = document.getElementById('ledger-product-id')?.value;
  const dateFrom  = document.getElementById('ledger-date-from')?.value;
  const dateTo    = document.getElementById('ledger-date-to')?.value;
  const warehId   = document.getElementById('ledger-warehouse')?.value || null;
  const batchNo   = document.getElementById('ledger-batch')?.value?.trim() || null;

  const tbody  = document.getElementById('ledger-body');
  const sumRow = document.getElementById('ledger-summary');

  if (!productId) { showMsg('❌ يرجى اختيار المنتج أولاً', 'error'); return; }
  if (!dateFrom || !dateTo) { showMsg('❌ يرجى تحديد التاريخ', 'error'); return; }

  if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;">⏳ جاري تحميل الحركات...</td></tr>';

  // Try RPC function first, fallback to direct query
  let rows = [];
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_product_ledger', {
    p_product_id:   productId,
    p_date_from:    dateFrom,
    p_date_to:      dateTo,
    p_warehouse_id: warehId,
    p_batch_no:     batchNo
  });

  if (rpcErr) {
    // Fallback: direct query from inventory_transactions
    const q = supabase
      .from('inventory_transactions')
      .select('*, warehouses(name)')
      .eq('product_id', productId)
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo   + 'T23:59:59')
      .order('created_at', { ascending: true });

    if (warehId)  q.eq('warehouse_id', warehId);
    if (batchNo)  q.eq('batch_no', batchNo);

    const { data: txns, error: txnErr } = await q;
    if (txnErr) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="color:red;text-align:center;">❌ ${txnErr.message}</td></tr>`;
      return;
    }
    rows = buildLedgerRows(txns || []);
  } else {
    rows = rpcData || [];
  }

  renderLedgerTable(rows, tbody, sumRow);
}

function buildLedgerRows(txns) {
  let balance = 0;
  return txns.map(t => {
    const isIn  = ['OPENING','IN','TRANSFER_IN','ADJUST'].includes(t.transaction_type);
    const isOut = ['OUT','TRANSFER_OUT'].includes(t.transaction_type);
    const qty   = Number(t.quantity_in_base) || 0;
    balance += isIn ? qty : -qty;
    return {
      txn_id:           t.id,
      txn_date:         t.created_at?.split('T')[0],
      transaction_type: t.transaction_type,
      reference_type:   t.reference_type,
      reference_no:     t.reference_no,
      batch_no:         t.batch_no,
      expiry_date:      t.expiry_date,
      warehouse_name:   t.warehouses?.name || '—',
      qty_in:           isIn  ? qty : 0,
      qty_out:          isOut ? qty : 0,
      running_balance:  balance,
      unit:             t.unit,
      notes:            t.notes
    };
  });
}

const TYPE_LABELS = {
  OPENING:      { ar: 'رصيد افتتاحي', color: '#0369a1' },
  IN:           { ar: 'وارد (شراء)',   color: '#16a34a' },
  OUT:          { ar: 'منصرف (بيع)',   color: '#dc2626' },
  TRANSFER_IN:  { ar: 'تحويل وارد',   color: '#7c3aed' },
  TRANSFER_OUT: { ar: 'تحويل صادر',   color: '#9333ea' },
  ADJUST:       { ar: 'تسوية',        color: '#d97706' },
  OPENING_BAL:  { ar: 'رصيد مرحّل',   color: '#64748b' }
};

function renderLedgerTable(rows, tbody, sumRow) {
  if (!tbody) return;
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:#94a3b8;">لا توجد حركات في هذه الفترة</td></tr>';
    return;
  }

  let totalIn = 0, totalOut = 0, html = '';

  rows.forEach(r => {
    const type    = TYPE_LABELS[r.transaction_type] || { ar: r.transaction_type, color: '#64748b' };
    const rowBg   = r.transaction_type === 'OUT' || r.transaction_type === 'TRANSFER_OUT'
                  ? 'rgba(239,68,68,0.04)' : r.transaction_type === 'OPENING_BAL'
                  ? 'rgba(99,102,241,0.05)' : '';
    const balColor = Number(r.running_balance) < 0 ? '#dc2626' : '#1e2d40';

    totalIn  += Number(r.qty_in)  || 0;
    totalOut += Number(r.qty_out) || 0;

    html += `<tr style="background:${rowBg};">
      <td style="font-size:11px;color:#64748b;">${r.txn_date||'—'}</td>
      <td><span style="background:${type.color}20;color:${type.color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${type.ar}</span></td>
      <td style="font-size:11px;">${r.reference_no||'—'}</td>
      <td style="text-align:center;">${r.batch_no||'—'}</td>
      <td style="text-align:center;font-size:11px;">${r.expiry_date||'—'}</td>
      <td style="text-align:left;font-weight:bold;${r.qty_in>0?'color:#16a34a;':''}">${r.qty_in > 0 ? r.qty_in.toLocaleString() : '—'}</td>
      <td style="text-align:left;font-weight:bold;${r.qty_out>0?'color:#dc2626;':''}">${r.qty_out > 0 ? r.qty_out.toLocaleString() : '—'}</td>
      <td style="font-weight:700;color:${balColor};">${Number(r.running_balance).toLocaleString()}</td>
      <td style="font-size:10px;color:#94a3b8;">${r.warehouse_name||'—'}</td>
    </tr>`;
  });

  tbody.innerHTML = html;

  // Summary row
  if (sumRow) {
    const finalBalance = rows[rows.length - 1]?.running_balance || 0;
    sumRow.innerHTML = `
      <div class="ledger-summary-box">
        <div class="sum-item sum-in">📥 إجمالي الوارد: <strong>${totalIn.toLocaleString()}</strong></div>
        <div class="sum-item sum-out">📤 إجمالي المنصرف: <strong>${totalOut.toLocaleString()}</strong></div>
        <div class="sum-item sum-bal">📊 الرصيد الختامي: <strong>${Number(finalBalance).toLocaleString()}</strong></div>
      </div>`;
  }

  // Store for export
  window._ledgerRows = rows;
}


// ════════════════════════════════════════════════════
//  EXCEL EXPORT (SheetJS)
// ════════════════════════════════════════════════════
function exportLedgerToExcel() {
  const rows = window._ledgerRows;
  if (!rows || rows.length === 0) { showMsg('❌ لا توجد بيانات للتصدير', 'error'); return; }

  if (typeof XLSX === 'undefined') {
    showMsg('⏳ جاري تحميل مكتبة Excel...', 'info');
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => {
      _doExportLedger(rows);
    });
    return;
  }
  _doExportLedger(rows);
}

function _doExportLedger(rows) {
  const data = [
    ['التاريخ', 'النوع', 'المرجع', 'الباتش', 'الصلاحية', 'وارد', 'منصرف', 'الرصيد', 'المستودع']
  ];
  rows.forEach(r => {
    const type = TYPE_LABELS[r.transaction_type]?.ar || r.transaction_type;
    data.push([
      r.txn_date, type, r.reference_no, r.batch_no, r.expiry_date,
      r.qty_in || '', r.qty_out || '', r.running_balance, r.warehouse_name
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [12,16,14,12,12,8,8,10,14].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'دفتر الأستاذ');
  XLSX.writeFile(wb, `stock_ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
  showMsg('✅ تم تصدير التقرير بنجاح!');
}

function exportBalanceToExcel() {
  const tbl = document.getElementById('rep-balance-body');
  if (!tbl) return;
  if (typeof XLSX === 'undefined') {
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => {
      _doExportBalance(tbl);
    });
    return;
  }
  _doExportBalance(tbl);
}

function _doExportBalance(tbody) {
  const ws = XLSX.utils.table_to_sheet(tbody.closest('table'));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'أرصدة المخزون');
  XLSX.writeFile(wb, `stock_balance_${new Date().toISOString().split('T')[0]}.xlsx`);
  showMsg('✅ تم تصدير الأرصدة بنجاح!');
}

function loadScript(src, cb) {
  const s = document.createElement('script');
  s.src = src; s.onload = cb;
  document.head.appendChild(s);
}


// ════════════════════════════════════════════════════
//  DASHBOARD (upgraded with expiry alerts)
// ════════════════════════════════════════════════════
async function loadDashboardCards() {
  try {
    const [pRes, movRes] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('inventory_transactions')
              .select('transaction_type, quantity_in_base, created_at, products(name), warehouses(name)')
              .order('created_at', { ascending: false })
              .limit(10)
    ]);

    const el = id => document.getElementById(id);
    if (el('kpi-total-products')) el('kpi-total-products').textContent = pRes.count || 0;

    // Total stock from v_stock_balance
    const { data: bData } = await supabase.from('v_stock_balance').select('current_stock');
    const tStock = (bData || []).reduce((s, r) => s + Number(r.current_stock||0), 0);
    if (el('kpi-total-stock')) el('kpi-total-stock').textContent = tStock.toLocaleString();

    // Expiry alerts
    const { count: ecount } = await supabase.from('v_expiry_alerts')
      .select('*', { count: 'exact', head: true });
    if (el('kpi-expiry-alerts')) {
      el('kpi-expiry-alerts').textContent = ecount || 0;
      if (ecount > 0) el('kpi-expiry-alerts').style.color = '#dc2626';
    }

    // Reorder alerts
    const { count: rcount } = await supabase.from('v_reorder_alerts')
      .select('*', { count: 'exact', head: true });
    if (el('kpi-reorder-alerts')) el('kpi-reorder-alerts').textContent = rcount || 0;

    // Recent movements
    const mBody = el('recent-movements');
    if (mBody) {
      const TYPE = { OPENING:'افتتاحي', IN:'وارد', OUT:'منصرف', TRANSFER_IN:'تحويل +', TRANSFER_OUT:'تحويل -', ADJUST:'تسوية' };
      const CLR  = { IN:'#16a34a', OUT:'#dc2626', OPENING:'#0369a1', TRANSFER_IN:'#7c3aed', TRANSFER_OUT:'#9333ea', ADJUST:'#d97706' };
      let mHtml = '';
      (movRes.data || []).forEach(m => {
        const mt  = TYPE[m.transaction_type]  || m.transaction_type;
        const mc  = CLR[m.transaction_type]   || '#64748b';
        const dt  = new Date(m.created_at).toLocaleDateString('ar-EG');
        mHtml += `<tr>
          <td><span style="color:${mc};font-weight:700;">${mt}</span></td>
          <td>${m.products?.name||'—'}</td>
          <td style="font-weight:bold;">${(m.quantity_in_base||0).toLocaleString()}</td>
          <td>${m.warehouses?.name||'—'}</td>
          <td style="font-size:11px;color:#94a3b8;">${dt}</td>
        </tr>`;
      });
      mBody.innerHTML = mHtml || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">لا توجد حركات بعد</td></tr>';
    }
  } catch (err) {
    console.error('[Dashboard]', err);
  }
}

window.init_dashboard = function() { loadDashboardCards(); };

document.addEventListener('click', function(e) {
  if (e.target?.id === 'btn-dash-refresh') loadDashboardCards();
});

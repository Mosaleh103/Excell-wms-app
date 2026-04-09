/**
 * wms_operations.js - v3.0 ERP-Grade
 * ✅ Writes to inventory_transactions (new unified system)
 * ✅ Auto document numbering (GR-0001, GI-0001, TR-0001, OB-0001)
 * ✅ Full event delegation (works with Router SPA)
 * ✅ Toast notifications on every action
 * ✅ Print support per document
 */

// ── Populate helpers ──────────────────────────────────────────────────
async function populateWarehouses(selectId) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const { data } = await supabase.from('warehouses').select('id, name').order('name');
  el.innerHTML = '<option value="">-- اختر المستودع --</option>' +
    (data || []).map(wh => `<option value="${wh.id}">${wh.name}</option>`).join('');
}

async function populateSuppliers(selectId) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const { data } = await supabase.from('suppliers').select('id, name').order('name');
  el.innerHTML = '<option value="">-- اختر المورد --</option>' +
    (data || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function populateCustomers(selectId) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const { data } = await supabase.from('customers').select('id, name').order('name');
  el.innerHTML = '<option value="">-- اختر العميل --</option>' +
    (data || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function populateWHSelect(selectId) {
  await populateWarehouses(selectId);
}

// ── Auto document numbering (based on inventory_transactions) ────────────
async function getNextDocNumber(prefix) {
  try {
    // Count existing docs with this prefix from inventory_transactions
    const refPrefix = prefix + '-';
    const { data } = await supabase
      .from('inventory_transactions')
      .select('reference_no')
      .like('reference_no', refPrefix + '%')
      .not('reference_no', 'like', 'REV-%');

    // Find highest number
    let maxNum = 0;
    (data || []).forEach(row => {
      const numStr = (row.reference_no || '').replace(refPrefix, '');
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
  } catch {
    return `${prefix}-${String(Date.now()).slice(-4)}`;
  }
}


// ── Autocomplete: see wms_autocomplete.js (loaded before this file) ──────

function autoPrintDocument(type) {
  // Small delay to allow toast to appear first
  setTimeout(() => {
    if (typeof window.printDocument === 'function') {
      window.printDocument(type);
    } else {
      printDocument(type);
    }
  }, 800);
}

// ════════════════════════════════════════════════════
//  INIT FUNCTIONS
// ════════════════════════════════════════════════════
window.init_op_opening = async function() {
  const dateEl = document.getElementById('opening-date');
  if (dateEl) dateEl.valueAsDate = new Date();
  await Promise.all([
    populateWarehouses('opening-warehouse'),
    window.ensureProductsCache()
  ]);
  // Auto doc number (sequential from inventory_transactions)
  const numEl = document.getElementById('opening-doc-no');
  if (numEl) numEl.value = await getNextDocNumber('OB');
  const tbody = document.getElementById('opening-items-body');
  if (tbody) tbody.innerHTML = '';
};

window.init_op_receipt = async function() {
  const dateEl = document.getElementById('receipt-date');
  if (dateEl) dateEl.valueAsDate = new Date();
  await Promise.all([
    populateWarehouses('receipt-warehouse'),
    populateSuppliers('receipt-supplier'),
    window.ensureProductsCache()
  ]);
  const numEl = document.getElementById('receipt-doc-no');
  if (numEl) numEl.value = await getNextDocNumber('GR');
  const tbody = document.getElementById('receipt-items-body');
  if (tbody) tbody.innerHTML = '';
};

window.init_op_issue = async function() {
  const dateEl = document.getElementById('issue-date');
  if (dateEl) dateEl.valueAsDate = new Date();
  await Promise.all([
    populateWarehouses('issue-warehouse'),
    populateCustomers('issue-customer'),
    window.ensureProductsCache()
  ]);
  const numEl = document.getElementById('issue-doc-no');
  if (numEl) numEl.value = await getNextDocNumber('GI');
  const tbody = document.getElementById('issue-items-body');
  if (tbody) tbody.innerHTML = '';
};

window.init_op_transfer = async function() {
  const dateEl = document.getElementById('transfer-date');
  if (dateEl) dateEl.valueAsDate = new Date();
  await Promise.all([
    populateWarehouses('transfer-from'),
    populateWarehouses('transfer-to'),
    window.ensureProductsCache()
  ]);
  const numEl = document.getElementById('transfer-doc-no');
  if (numEl) numEl.value = await getNextDocNumber('TR');
  const tbody = document.getElementById('transfer-items-body');
  if (tbody) tbody.innerHTML = '';
};

// Stock check for issue
window.checkStock = async function(hiddenInput) {
  const whId   = document.getElementById('issue-warehouse')?.value;
  const prodId = hiddenInput.value;
  const infoTd = hiddenInput.closest('tr')?.querySelector('.stk-info');
  if (!whId || !prodId) { if (infoTd) infoTd.textContent = '0'; return; }
  if (infoTd) infoTd.textContent = '⏳';
  const { data } = await supabase.from('v_stock_balance')
    .select('current_stock')
    .eq('product_id', prodId)
    .eq('warehouse_id', whId);
  const total = (data || []).reduce((s, r) => s + Number(r.current_stock || 0), 0);
  if (infoTd) {
    infoTd.textContent = total;
    infoTd.style.color = total <= 0 ? '#dc2626' : total <= 5 ? '#d97706' : '#16a34a';
    infoTd.style.fontWeight = '700';
  }
};


// ════════════════════════════════════════════════════
//  UNIFIED EVENT DELEGATION
// ════════════════════════════════════════════════════
document.addEventListener('click', async function(e) {
  const id = e.target?.id;

  // ── Add row buttons ──────────────────────────────
  if (id === 'btn-add-opening-item') {
    const tbody = document.getElementById('opening-items-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${window.buildProductAutocomplete()}</td>
      <td><input type="text" class="i-batch" placeholder="رقم الباتش *"></td>
      <td><input type="date" class="i-exp"></td>
      <td><input type="number" class="i-qty" placeholder="0" min="1" value="1" style="width:80px;"></td>
      <td><button class="btn br btn-sm" onclick="this.closest('tr').remove()">🗑</button></td>
    `;
    tbody.appendChild(tr);
    
    // Custom logic to auto-fill batch/expiry
    const wrap = tr.querySelector('.ac-wrap');
    if (wrap && typeof window.initProductAutocomplete === 'function') {
      window.initProductAutocomplete(wrap, {
        onSelect: (item) => {
          const batchInp = tr.querySelector('.i-batch');
          const expInp = tr.querySelector('.i-exp');
          if (batchInp) batchInp.value = item.batch_no || '';
          if (expInp) expInp.value = item.expiry_date || '';
        }
      });
    }
    return;
  }

  if (id === 'btn-add-receipt-item') {
    const tbody = document.getElementById('receipt-items-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${window.buildProductAutocomplete()}</td>
      <td><input type="text" class="p-batch" placeholder="رقم الباتش *"></td>
      <td><input type="date" class="p-opt-date"></td>
      <td><input type="number" class="p-qty" min="1" value="1" style="width:70px;"></td>
      <td><button class="btn br btn-sm" onclick="this.closest('tr').remove()">🗑</button></td>
    `;
    tbody.appendChild(tr);

    const wrap = tr.querySelector('.ac-wrap');
    if (wrap && typeof window.initProductAutocomplete === 'function') {
      window.initProductAutocomplete(wrap, {
        onSelect: (item) => {
          const batchInp = tr.querySelector('.p-batch');
          const expInp = tr.querySelector('.p-opt-date');
          if (batchInp) batchInp.value = item.batch_no || '';
          if (expInp) expInp.value = item.expiry_date || '';
        }
      });
    }
    return;
  }

  if (id === 'btn-add-issue-item') {
    const tbody = document.getElementById('issue-items-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${window.buildProductAutocomplete()}</td>
      <td><input type="number" class="p-qty" min="1" value="1" style="width:80px;"></td>
      <td class="stk-info" style="font-size:12px;text-align:center;">—</td>
      <td><button class="btn br btn-sm" onclick="this.closest('tr').remove()">🗑</button></td>
    `;
    tbody.appendChild(tr);
    if (typeof window.initAllProductAutocompletes === 'function') {
      window.initAllProductAutocompletes(tr);
      // wire checkStock on product select
      const hidden = tr.querySelector('.p-select');
      if (hidden) {
        const origBind = tr.querySelector('.p-search');
        if (origBind) {
          origBind.addEventListener('change', () => window.checkStock && window.checkStock(hidden));
        }
      }
    }
    return;
  }

  if (id === 'btn-add-transfer-item') {
    const tbody = document.getElementById('transfer-items-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${window.buildProductAutocomplete()}</td>
      <td><input type="text" class="p-batch" placeholder="رقم الباتش *"></td>
      <td><input type="date" class="p-exp"></td>
      <td><input type="number" class="p-qty" min="1" value="1" style="width:70px;"></td>
      <td><button class="btn br btn-sm" onclick="this.closest('tr').remove()">🗑</button></td>
    `;
    tbody.appendChild(tr);
    
    const wrap = tr.querySelector('.ac-wrap');
    if (wrap && typeof window.initProductAutocomplete === 'function') {
      window.initProductAutocomplete(wrap, {
        onSelect: (item) => {
          const batchInp = tr.querySelector('.p-batch');
          const expInp = tr.querySelector('.p-exp');
          if (batchInp) batchInp.value = item.batch_no || '';
          if (expInp) expInp.value = item.expiry_date || '';
        }
      });
    }
    return;
  }

  // ── Save buttons ─────────────────────────────────
  if (id === 'btn-save-opening')  { await saveOpeningStock();   return; }
  if (id === 'btn-save-receipt')  { await saveGoodsReceipt();   return; }
  if (id === 'btn-save-issue')    { await saveGoodsIssue();     return; }
  if (id === 'btn-save-transfer') { await saveStockTransfer();  return; }

  // ── Print buttons ─────────────────────────────────
  if (id === 'btn-print-opening')  { printDocument('opening');  return; }
  if (id === 'btn-print-receipt')  { printDocument('receipt');  return; }
  if (id === 'btn-print-issue')    { printDocument('issue');    return; }
  if (id === 'btn-print-transfer') { printDocument('transfer'); return; }
});


// ════════════════════════════════════════════════════
//  SAVE: OPENING BALANCE → inventory_transactions
// ════════════════════════════════════════════════════
async function saveOpeningStock() {
  const date  = document.getElementById('opening-date')?.value;
  const whId  = document.getElementById('opening-warehouse')?.value;
  const docNo = document.getElementById('opening-doc-no')?.value || 'OB';
  const notes = document.getElementById('opening-notes')?.value?.trim() || '';

  if (!date)  return showMsg('❌ يرجى تحديد التاريخ', 'error');
  if (!whId)  return showMsg('❌ يرجى اختيار المستودع', 'error');

  const trs = document.querySelectorAll('#opening-items-body tr');
  if (trs.length === 0) return showMsg('❌ يرجى إضافة صنف واحد على الأقل', 'error');

  const items = [];
  let valid = true;
  for (const tr of trs) {
    const pId  = tr.querySelector('.p-select')?.value;
    const batch = tr.querySelector('.i-batch')?.value?.trim();
    const exp  = tr.querySelector('.i-exp')?.value;
    const qty  = parseFloat(tr.querySelector('.i-qty')?.value || '0');
    
    if (!pId) return showMsg('❌ يرجى اختيار الصنف في كل سطر', 'error');
    if (!batch) return showMsg('❌ رقم الباتش مطلوب لترصيد أول المدة', 'error');
    if (!exp) return showMsg('❌ تاريخ الصلاحية مطلوب لترصيد أول المدة', 'error');
    if (qty <= 0) return showMsg('❌ الكمية يجب أن تكون أكبر من صفر', 'error');
    
    items.push({ pId, batch, exp, qty });
  }

  if (!valid) return showMsg('❌ يرجى اختيار الصنف وإدخال كمية صحيحة لكل سطر', 'error');

  const btn = document.getElementById('btn-save-opening');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }

  try {
    const userId = (await supabase.auth.getUser()).data?.user?.id;

    // Write to inventory_transactions
    const txns = items.map(i => ({
      product_id:       i.pId,
      warehouse_id:     whId,
      batch_no:         i.batch,
      expiry_date:      i.exp,
      transaction_type: 'OPENING',
      quantity:         i.qty,
      unit:             'unit',
      quantity_in_base: i.qty,
      reference_type:   'opening',
      reference_no:     docNo,
      notes:            notes || 'رصيد افتتاحي',
      created_by:       userId
    }));

    const { error } = await supabase.from('inventory_transactions').insert(txns);
    if (error) throw error;

    showMsg(`✅ تم ترحيل ${items.length} صنف كرصيد افتتاحي — ${docNo}`);
    document.getElementById('opening-items-body').innerHTML = '';
    if (document.getElementById('opening-notes')) document.getElementById('opening-notes').value = '';
    // Refresh doc number
    const numEl = document.getElementById('opening-doc-no');
    if (numEl) numEl.value = await getNextDocNumber('OB');
    // Auto print
    autoPrintDocument('opening');
  } catch (err) {
    showMsg('❌ خطأ في الحفظ: ' + (err.message || JSON.stringify(err)), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✔ اعتماد الأرصدة الافتتاحية'; }
  }
}


// ════════════════════════════════════════════════════
//  SAVE: GOODS RECEIPT → inventory_transactions
// ════════════════════════════════════════════════════
async function saveGoodsReceipt() {
  const date  = document.getElementById('receipt-date')?.value;
  const whId  = document.getElementById('receipt-warehouse')?.value;
  const supId = document.getElementById('receipt-supplier')?.value;
  const docNo = document.getElementById('receipt-doc-no')?.value || 'GR';

  if (!date)  return showMsg('❌ يرجى تحديد التاريخ', 'error');
  if (!whId)  return showMsg('❌ يرجى اختيار المستودع', 'error');
  if (!supId) return showMsg('❌ يرجى اختيار المورد', 'error');

  const trs = document.querySelectorAll('#receipt-items-body tr');
  if (trs.length === 0) return showMsg('❌ أضف صنف واحد على الأقل', 'error');

  const items = [];
  for (const tr of trs) {
    const pId  = tr.querySelector('.p-select')?.value;
    const batch = tr.querySelector('.p-batch')?.value?.trim();
    const exp  = tr.querySelector('.p-opt-date')?.value;
    const qty  = parseFloat(tr.querySelector('.p-qty')?.value || '0');
    if (!pId)   return showMsg('❌ يرجى اختيار الصنف في كل سطر', 'error');
    if (!batch) return showMsg('❌ رقم الباتش (Batch) مطلوب لكل سطر في جدول الاستلام', 'error');
    if (!exp)   return showMsg('❌ تاريخ الصلاحية مطلوب لكل سطر في جدول الاستلام', 'error');
    if (qty <= 0) return showMsg('❌ الكمية يجب أن تكون أكبر من صفر', 'error');
    items.push({ pId, batch, exp, qty });
  }

  confirmAction(`تأكيد حفظ إذن الاستلام ${docNo}؟\nسيتم تحديث المخزون فوراً.`, async () => {
    const btn = document.getElementById('btn-save-receipt');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }
    try {
      const userId = (await supabase.auth.getUser()).data?.user?.id;
      const txns = items.map(i => ({
        product_id: i.pId, warehouse_id: whId,
        batch_no: i.batch, expiry_date: i.exp,
        transaction_type: 'IN', quantity: i.qty, unit: 'unit', quantity_in_base: i.qty,
        reference_type: 'purchase', reference_no: docNo, created_by: userId
      }));
      const { error } = await supabase.from('inventory_transactions').insert(txns);
      if (error) throw error;
      showMsg(`✅ تم حفظ إذن الاستلام ${docNo} — ${items.length} أصناف`);
      document.getElementById('receipt-items-body').innerHTML = '';
      const numEl = document.getElementById('receipt-doc-no');
      if (numEl) numEl.value = await getNextDocNumber('GR');
      // Auto print
      autoPrintDocument('receipt');
    } catch (err) {
      showMsg('❌ خطأ: ' + (err.message || err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✔ حفظ واعتماد الاستلام'; }
    }
  });
}


// ════════════════════════════════════════════════════
//  SAVE: GOODS ISSUE → inventory_transactions (FIFO check)
// ════════════════════════════════════════════════════
async function saveGoodsIssue() {
  const date  = document.getElementById('issue-date')?.value;
  const whId  = document.getElementById('issue-warehouse')?.value;
  const cusId = document.getElementById('issue-customer')?.value;
  const docNo = document.getElementById('issue-doc-no')?.value || 'GI';

  if (!date)  return showMsg('❌ يرجى تحديد التاريخ', 'error');
  if (!whId)  return showMsg('❌ يرجى اختيار المستودع', 'error');
  if (!cusId) return showMsg('❌ يرجى اختيار العميل', 'error');

  const trs = document.querySelectorAll('#issue-items-body tr');
  if (trs.length === 0) return showMsg('❌ أضف صنف واحد على الأقل', 'error');

  const items = [];
  for (const tr of trs) {
    const pId = tr.querySelector('.p-select')?.value;
    const qty = parseFloat(tr.querySelector('.p-qty')?.value || '0');
    const stk = parseFloat(tr.querySelector('.stk-info')?.textContent || '0');
    if (!pId) return showMsg('❌ يرجى اختيار الصنف في كل سطر', 'error');
    if (qty <= 0) return showMsg('❌ الكمية يجب أن تكون أكبر من صفر', 'error');
    if (stk < qty) return showMsg(`❌ الكمية المطلوبة (${qty}) أكبر من الرصيد المتاح (${stk})`, 'error');
    items.push({ pId, qty });
  }

  confirmAction(`تأكيد صرف ${docNo}؟\nالصرف باستخدام FIFO (أقدم صلاحية أولاً).`, async () => {
    const btn = document.getElementById('btn-save-issue');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }
    try {
      const userId = (await supabase.auth.getUser()).data?.user?.id;
      const txns = items.map(i => ({
        product_id: i.pId, warehouse_id: whId, batch_no: 'FIFO',
        transaction_type: 'OUT', quantity: i.qty, unit: 'unit', quantity_in_base: i.qty,
        reference_type: 'sale', reference_no: docNo, created_by: userId
      }));
      const { error } = await supabase.from('inventory_transactions').insert(txns);
      if (error) throw error;
      showMsg(`✅ تم حفظ إذن الصرف ${docNo} — ${items.length} أصناف`);
      document.getElementById('issue-items-body').innerHTML = '';
      const numEl = document.getElementById('issue-doc-no');
      if (numEl) numEl.value = await getNextDocNumber('GI');
      // Auto print
      autoPrintDocument('issue');
    } catch (err) {
      showMsg('❌ خطأ: ' + (err.message || err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✔ حفظ واعتماد الصرف'; }
    }
  });
}


// ════════════════════════════════════════════════════
//  SAVE: STOCK TRANSFER → inventory_transactions
// ════════════════════════════════════════════════════
async function saveStockTransfer() {
  const date  = document.getElementById('transfer-date')?.value;
  const fWh   = document.getElementById('transfer-from')?.value;
  const tWh   = document.getElementById('transfer-to')?.value;
  const docNo = document.getElementById('transfer-doc-no')?.value || 'TR';

  if (!date) return showMsg('❌ يرجى تحديد التاريخ', 'error');
  if (!fWh)  return showMsg('❌ يرجى اختيار المستودع المُحوَّل منه', 'error');
  if (!tWh)  return showMsg('❌ يرجى اختيار المستودع المُحوَّل إليه', 'error');
  if (fWh === tWh) return showMsg('❌ المستودعان يجب أن يكونا مختلفَين', 'error');

  const trs = document.querySelectorAll('#transfer-items-body tr');
  if (trs.length === 0) return showMsg('❌ أضف صنف واحد على الأقل', 'error');

  const items = [];
  for (const tr of trs) {
    const pId  = tr.querySelector('.p-select')?.value;
    const batch = tr.querySelector('.p-batch')?.value?.trim();
    const exp  = tr.querySelector('.p-exp')?.value;
    const qty  = parseFloat(tr.querySelector('.p-qty')?.value || '0');
    
    if (!pId)   return showMsg('❌ يرجى اختيار الصنف في كل سطر', 'error');
    if (!batch) return showMsg('❌ رقم الباتش مطلوب لعملية التحويل', 'error');
    if (!exp)   return showMsg('❌ تاريخ الصلاحية مطلوب لعملية التحويل', 'error');
    if (qty <= 0) return showMsg('❌ الكمية يجب أن تكون أكبر من صفر', 'error');
    items.push({ pId, batch, exp, qty });
  }

  confirmAction(`تأكيد أمر التحويل ${docNo}؟`, async () => {
    const btn = document.getElementById('btn-save-transfer');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...'; }
    try {
      const userId   = (await supabase.auth.getUser()).data?.user?.id;
      const transferRef = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

      const txns = [];
      items.forEach(i => {
        // From (OUT)
        txns.push({
          product_id: i.pId, warehouse_id: fWh, from_warehouse: fWh, to_warehouse: tWh,
          batch_no: i.batch, expiry_date: i.exp, transaction_type: 'TRANSFER_OUT',
          quantity: i.qty, unit: 'unit', quantity_in_base: i.qty,
          reference_type: 'transfer', reference_no: docNo,
          transfer_ref: transferRef, created_by: userId
        });
        // To (IN)
        txns.push({
          product_id: i.pId, warehouse_id: tWh, from_warehouse: fWh, to_warehouse: tWh,
          batch_no: i.batch, expiry_date: i.exp, transaction_type: 'TRANSFER_IN',
          quantity: i.qty, unit: 'unit', quantity_in_base: i.qty,
          reference_type: 'transfer', reference_no: docNo,
          transfer_ref: transferRef, created_by: userId
        });
      });

      const { error } = await supabase.from('inventory_transactions').insert(txns);
      if (error) throw error;
      showMsg(`✅ تم تنفيذ التحويل ${docNo} — ${items.length} أصناف`);
      document.getElementById('transfer-items-body').innerHTML = '';
      const numEl = document.getElementById('transfer-doc-no');
      if (numEl) numEl.value = await getNextDocNumber('TR');
      // Auto print
      autoPrintDocument('transfer');
    } catch (err) {
      showMsg('❌ خطأ: ' + (err.message || err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✔ حفظ واعتماد التحويل'; }
    }
  });
}


// ════════════════════════════════════════════════════
//  PRINT DOCUMENT
// ════════════════════════════════════════════════════
function printDocument(type) {
  const configs = {
    opening:  { title: 'إذن الرصيد الافتتاحي',  docNoId: 'opening-doc-no',  dateId: 'opening-date',  tbodyId: 'opening-items-body',  cols: ['الصنف','الباتش','الصلاحية','الكمية'] },
    receipt:  { title: 'إذن استلام بضاعة (GRN)', docNoId: 'receipt-doc-no',  dateId: 'receipt-date',  tbodyId: 'receipt-items-body',  cols: ['الصنف','الباتش','الصلاحية','الكمية'] },
    issue:    { title: 'إذن صرف بضاعة',          docNoId: 'issue-doc-no',    dateId: 'issue-date',    tbodyId: 'issue-items-body',    cols: ['الصنف','الكمية','الرصيد'] },
    transfer: { title: 'أمر التحويل المخزني',     docNoId: 'transfer-doc-no', dateId: 'transfer-date', tbodyId: 'transfer-items-body', cols: ['الصنف','الباتش','تاريخ الصلاحية','الكمية'] },
  };
  const cfg = configs[type];
  if (!cfg) return;

  const docNo = document.getElementById(cfg.docNoId)?.value || '—';
  const date  = document.getElementById(cfg.dateId)?.value  || '—';
  const tbody = document.getElementById(cfg.tbodyId);
  const rows  = tbody ? tbody.innerHTML : '';

  const win = window.open('', '_blank', 'width=850,height=650');
  win.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>${cfg.title}</title>
      <style>
        body { font-family:'Tajawal',Arial,sans-serif; direction:rtl; padding:20px; color:#1e2d40; font-size:13px; }
        .ph { text-align:center; border-bottom:2px solid #1a6ab8; padding-bottom:12px; margin-bottom:18px; }
        .ph h1 { font-size:20px; color:#1a3f6f; margin:6px 0; }
        .ph p  { font-size:12px; color:#64748b; margin:2px 0; }
        .meta  { display:flex; gap:40px; margin-bottom:14px; font-size:13px; }
        .meta span { font-weight:700; }
        table  { width:100%; border-collapse:collapse; font-size:12px; margin-top:10px; }
        th     { background:#1a6ab8; color:white; padding:9px 10px; text-align:center; }
        td     { padding:8px 10px; border-bottom:1px solid #e2e8f0; text-align:center; }
        tr:nth-child(even) td { background:#f8faff; }
        .sig   { display:flex; justify-content:space-between; margin-top:50px; font-size:12px; }
        .sig div { text-align:center; border-top:1px solid #ccc; padding-top:8px; width:160px; }
        @media print { button { display:none; } }
      </style>
    </head>
    <body>
      <div class="ph">
        <h1>🏢 شركة ركلة الامتياز للتجارة</h1>
        <h2 style="color:#1a6ab8;font-size:16px;margin:4px 0;">${cfg.title}</h2>
      </div>
      <div class="meta">
        <div>رقم الإذن: <span>${docNo}</span></div>
        <div>التاريخ: <span>${date}</span></div>
        <div>تاريخ الطباعة: <span>${new Date().toLocaleDateString('ar-SA')}</span></div>
      </div>
      <table>
        <thead><tr>${cfg.cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="sig">
        <div>المُعِدّ<br><br>_____________</div>
        <div>المراجع<br><br>_____________</div>
        <div>المعتمِد<br><br>_____________</div>
      </div>
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `);
  win.document.close();
}

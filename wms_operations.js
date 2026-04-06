/**
 * wms_operations.js - Manage Goods Receipt, Issue, and Transfer
 * It will insert into transaction header & items tables. Database triggers will handle FIFO logic and `stock_movements`.
 */

// Dropdown population helpers
async function populateWarehouses(selectId) {
  const el = document.getElementById(selectId);
  if(!el) return;
  const { data } = await supabase.from('warehouses').select('id, name');
  el.innerHTML = '<option value="">-- اختر المستودع --</option>';
  data?.forEach(wh => {
    el.innerHTML += `<option value="${wh.id}">${wh.name}</option>`;
  });
}

async function populateSuppliers(selectId) {
  const el = document.getElementById(selectId);
  if(!el) return;
  let { data } = await supabase.from('suppliers').select('id, name');
  // For demo if empty, we insert a fake one
  if(!data || data.length === 0) {
    await supabase.from('suppliers').insert([{name: 'المورد الافتراضي'}]);
    const res = await supabase.from('suppliers').select('id, name');
    data = res.data;
  }
  el.innerHTML = '<option value="">-- اختر المورد --</option>';
  data?.forEach(s => el.innerHTML += `<option value="${s.id}">${s.name}</option>`);
}

async function populateCustomers(selectId) {
  const el = document.getElementById(selectId);
  if(!el) return;
  let { data } = await supabase.from('customers').select('id, name');
    // For demo if empty, we insert a fake one
  if(!data || data.length === 0) {
    await supabase.from('customers').insert([{name: 'العميل الافتراضي'}]);
    const res = await supabase.from('customers').select('id, name');
    data = res.data;
  }
  el.innerHTML = '<option value="">-- اختر العميل --</option>';
  data?.forEach(c => el.innerHTML += `<option value="${c.id}">${c.name}</option>`);
}

function getProductOptions() {
  let opts = '<option value="">-- اختر الصنف --</option>';
  productsCache.forEach(p => {
    opts += `<option value="${p.id}">${p.name} (${p.product_code})</option>`;
  });
  return opts;
}

// ------------------------------------
// GOODS RECEIPT (IN)
// ------------------------------------
window.init_op_receipt = function() {
  document.getElementById('receipt-date').valueAsDate = new Date();
  populateWarehouses('receipt-warehouse');
  populateSuppliers('receipt-supplier');
};

document.getElementById('btn-add-receipt-item')?.addEventListener('click', () => {
  const tbody = document.getElementById('receipt-items-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="p-select">${getProductOptions()}</select></td>
    <td><input type="text" class="p-batch" placeholder="Lot / Batch" required></td>
    <td><input type="date" class="p-opt-date" required></td>
    <td><input type="number" class="p-qty" min="1" value="1" style="width:60px;"></td>
    <td><button class="btn bp btn-sm" onclick="this.closest('tr').remove()">X</button></td>
  `;
  tbody.appendChild(tr);
});

document.getElementById('btn-save-receipt')?.addEventListener('click', async () => {
  const docDate = document.getElementById('receipt-date').value;
  const whId = document.getElementById('receipt-warehouse').value;
  const supId = document.getElementById('receipt-supplier').value;
  
  if(!docDate || !whId || !supId) return showMsg('يرجى تعبئة الحقول الأساسية', 'error');
  
  const rows = Array.from(document.getElementById('receipt-items-body').querySelectorAll('tr'));
  if(rows.length === 0) return showMsg('أضف صنف واحد على الأقل', 'error');
  
  const items = [];
  for(let row of rows) {
    const prodId = row.querySelector('.p-select').value;
    const batch = row.querySelector('.p-batch').value;
    const expiry = row.querySelector('.p-opt-date').value;
    const qty = row.querySelector('.p-qty').value;
    
    if(!prodId || !batch || !expiry || !qty) return showMsg('يرجى تعبئة كافة بيانات الأصناف', 'error');
    items.push({ product_id: prodId, batch_number: batch, expiry_date: expiry, quantity: qty });
  }
  
  confirmAction('هل أنت متأكد من حفظ التوريد؟ سيتم تحديث المخزون فوراً.', async () => {
    const userId = (await supabase.auth.getUser()).data.user.id;
    
    // 1. Insert Header
    const { data: headerData, error: headerErr } = await supabase.from('goods_receipts').insert([{
      doc_date: docDate,
      warehouse_id: whId,
      supplier_id: supId,
      created_by: userId
    }]).select();
    
    if(headerErr) return showMsg(headerErr.message, 'error');
    
    const receiptId = headerData[0].id;
    
    // 2. Insert Items (Database triggers will handle stock movements!)
    const itemsToInsert = items.map(it => ({
      receipt_id: receiptId,
      ...it
    }));
    
    const { error: itemsErr } = await supabase.from('receipt_items').insert(itemsToInsert);
    if(itemsErr) {
       showMsg(itemsErr.message, 'error');
       // In a real app we might need a transaction, Supabase rpc is preferred for atomicity.
    } else {
       showMsg('تم التوريد بنجاح! تم تحديث المخزون.');
       document.getElementById('receipt-items-body').innerHTML = '';
    }
  });
});


// ------------------------------------
// GOODS ISSUE (OUT) - FIFO TRIGGERED
// ------------------------------------
window.init_op_issue = function() {
  document.getElementById('issue-date').valueAsDate = new Date();
  populateWarehouses('issue-warehouse');
  populateCustomers('issue-customer');
};

document.getElementById('btn-add-issue-item')?.addEventListener('click', () => {
  const tbody = document.getElementById('issue-items-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="p-select" onchange="checkStock(this)">${getProductOptions()}</select></td>
    <td><input type="number" class="p-qty" min="1" value="1" style="width:100px;"></td>
    <td class="stk-info" style="color:var(--text); font-weight:bold;">0</td>
    <td><button class="btn bp btn-sm" onclick="this.closest('tr').remove()">X</button></td>
  `;
  tbody.appendChild(tr);
});

window.checkStock = async function(selectEl) {
  const whId = document.getElementById('issue-warehouse').value;
  const prodId = selectEl.value;
  const infoTd = selectEl.closest('tr').querySelector('.stk-info');
  if(!whId || !prodId) return infoTd.textContent = '0';
  
  infoTd.textContent = '...';
  const { data, error } = await supabase.from('stock_balance').select('current_stock')
    .eq('product_id', prodId).eq('warehouse_id', whId);
    
  if(error || !data) return infoTd.textContent = '0';
  const total = data.reduce((acc, row) => acc + Number(row.current_stock), 0);
  infoTd.textContent = total;
};

document.getElementById('btn-save-issue')?.addEventListener('click', async () => {
  const docDate = document.getElementById('issue-date').value;
  const whId = document.getElementById('issue-warehouse').value;
  const cusId = document.getElementById('issue-customer').value;
  
  if(!docDate || !whId || !cusId) return showMsg('يرجى تعبئة الحقول الأساسية', 'error');
  
  const rows = Array.from(document.getElementById('issue-items-body').querySelectorAll('tr'));
  if(rows.length === 0) return showMsg('أضف صنف واحد على الأقل', 'error');
  
  const items = [];
  for(let row of rows) {
    const prodId = row.querySelector('.p-select').value;
    const qty = row.querySelector('.p-qty').value;
    
    if(!prodId || !qty) return showMsg('يرجى تعبئة كافة بيانات الأصناف', 'error');
    items.push({ product_id: prodId, quantity: qty });
  }
  
  confirmAction('صرف البضاعة باستخدام أقدم صلاحية (FIFO) تلقائياً؟', async () => {
    const userId = (await supabase.auth.getUser()).data.user.id;
    
    // Insert Header
    const { data: headerData, error: headerErr } = await supabase.from('goods_issues').insert([{
      doc_date: docDate,
      warehouse_id: whId,
      customer_id: cusId,
      created_by: userId
    }]).select();
    
    if(headerErr) return showMsg(headerErr.message, 'error');
    
    const issueId = headerData[0].id;
    
    // Insert Items - Supabase Database TRIGGER 'trg_issue_fifo' will execute FIFO logic
    const itemsToInsert = items.map(it => ({ issue_id: issueId, ...it }));
    
    const { error: itemsErr } = await supabase.from('issue_items').insert(itemsToInsert);
    if(itemsErr) {
       showMsg('خطأ: ' + itemsErr.message, 'error');
       // In case of FIFO error (e.g. not enough stock), the insert will fail and raise exception.
    } else {
       showMsg('تم صرف البضاعة (FIFO) بنجاح!');
       document.getElementById('issue-items-body').innerHTML = '';
    }
  });
});

// ------------------------------------
// TRANSFER
// ------------------------------------
window.init_op_transfer = function() {
  document.getElementById('transfer-date').valueAsDate = new Date();
  populateWarehouses('transfer-from');
  populateWarehouses('transfer-to');
};

document.getElementById('btn-add-transfer-item')?.addEventListener('click', () => {
  const tbody = document.getElementById('transfer-items-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="p-select">${getProductOptions()}</select></td>
    <td><input type="text" class="p-batch" placeholder="Lot / Batch" required></td>
    <td><input type="number" class="p-qty" min="1" value="1" style="width:60px;"></td>
    <td><button class="btn bp btn-sm" onclick="this.closest('tr').remove()">X</button></td>
  `;
  tbody.appendChild(tr);
});

document.getElementById('btn-save-transfer')?.addEventListener('click', async () => {
  const docDate = document.getElementById('transfer-date').value;
  const fWh = document.getElementById('transfer-from').value;
  const tWh = document.getElementById('transfer-to').value;
  
  if(!docDate || !fWh || !tWh || fWh === tWh) return showMsg('المستودعات غير صحيحة', 'error');
  
  const rows = Array.from(document.getElementById('transfer-items-body').querySelectorAll('tr'));
  if(rows.length === 0) return showMsg('أضف صنف واحد على الأقل', 'error');
  
  const items = [];
  for(let row of rows) {
    const prodId = row.querySelector('.p-select').value;
    const batch = row.querySelector('.p-batch').value;
    const qty = row.querySelector('.p-qty').value;
    
    if(!prodId || !qty || !batch) return showMsg('يرجى تعبئة كافة بيانات التحويل', 'error');
    items.push({ product_id: prodId, batch_number: batch, quantity: qty });
  }
  
  confirmAction('هل أنت متأكد من النقل؟', async () => {
    const userId = (await supabase.auth.getUser()).data.user.id;
    
    const { data: headerData, error: headerErr } = await supabase.from('stock_transfers').insert([{
      doc_date: docDate,
      from_warehouse: fWh,
      to_warehouse: tWh,
      created_by: userId
    }]).select();
    
    if(headerErr) return showMsg(headerErr.message, 'error');
    
    const tId = headerData[0].id;
    const itemsToInsert = items.map(it => ({ transfer_id: tId, ...it }));
    
    const { error: itemsErr } = await supabase.from('transfer_items').insert(itemsToInsert);
    if(itemsErr) {
       showMsg(itemsErr.message, 'error');
    } else {
       showMsg('تم التحويل بنجاح!');
       document.getElementById('transfer-items-body').innerHTML = '';
    }
  });
});

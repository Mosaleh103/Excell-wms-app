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
  const { data } = await supabase.from('suppliers').select('id, name');
  el.innerHTML = '<option value="">-- اختر المورد --</option>';
  data?.forEach(s => el.innerHTML += `<option value="${s.id}">${s.name}</option>`);
}

async function populateCustomers(selectId) {
  const el = document.getElementById(selectId);
  if(!el) return;
  const { data } = await supabase.from('customers').select('id, name');
  el.innerHTML = '<option value="">-- اختر العميل --</option>';
  data?.forEach(c => el.innerHTML += `<option value="${c.id}">${c.name}</option>`);
}


// --- AUTOCOMPLETE LOGIC ---
window.buildProductAutocomplete = function() {
  const uniq = Math.random().toString(36).substr(2, 9);
  return `
    <div class="ac-wrap">
      <input type="text" class="p-search" placeholder="ابحث بالاسم أو الكود..." onfocus="showAC(this)" oninput="filterAC(this)" style="width:100%; min-width:180px;">
      <input type="hidden" class="p-select">
      <div class="ac-list" id="ac-${uniq}"></div>
    </div>
  `;
};

window.showAC = function(inp) {
  const wrap = inp.closest('.ac-wrap');
  const list = wrap.querySelector('.ac-list');
  list.style.display = 'block';
  filterAC(inp);
  
  // click anywhere outside to close
  document.addEventListener('click', function closeAC(e) {
    if(!wrap.contains(e.target)) {
      list.style.display = 'none';
      document.removeEventListener('click', closeAC);
    }
  });
};

window.filterAC = function(inp) {
  const list = inp.closest('.ac-wrap').querySelector('.ac-list');
  const hidden = inp.closest('.ac-wrap').querySelector('.p-select');
  const term = inp.value.toLowerCase().trim();
  
  if(!term) hidden.value = ''; // clear hidden if search is cleared
  
  let html = '';
  const filtered = productsCache.filter(p => 
    p.name.toLowerCase().includes(term) || 
    p.product_code.toLowerCase().includes(term)
  );
  
  if(filtered.length === 0) {
    html = \`<div class="ac-item" style="color:var(--text-muted); cursor:default;">لا توجد نتائج مطابقة</div>\`;
  } else {
    filtered.forEach(p => {
      // Escape quotes for safe HTML insertion
      const safeName = p.name.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
      html += \`<div class="ac-item" onclick="selectAC(this, '\${p.id}', '\${safeName}', '\${p.product_code}')">\${safeName} <span style="font-size:10px; color:#aaa;">(\${p.product_code})</span></div>\`;
    });
  }
  list.innerHTML = html;
};

window.selectAC = function(itemEl, id, name, code) {
  const wrap = itemEl.closest('.ac-wrap');
  const inp = wrap.querySelector('.p-search');
  const hidden = wrap.querySelector('.p-select');
  
  // Unescape before putting in value
  inp.value = name.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  hidden.value = id;
  wrap.querySelector('.ac-list').style.display = 'none';
  
  if(window.checkStock) {
    window.checkStock(hidden);
  }
};


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
    <td>${buildProductAutocomplete()}</td>
    <td><input type="text" class="p-batch" placeholder="الباتش" required></td>
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
    
    if(!prodId || !batch || !expiry || !qty) return showMsg('يرجى اختيار الصنف وتعبئة كافة البيانات', 'error');
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
    <td>${buildProductAutocomplete()}</td>
    <td><input type="number" class="p-qty" min="1" value="1" style="width:100px;"></td>
    <td class="stk-info" style="color:var(--text); font-weight:bold;">0</td>
    <td><button class="btn bp btn-sm" onclick="this.closest('tr').remove()">X</button></td>
  `;
  tbody.appendChild(tr);
});

window.checkStock = async function(hiddenInput) {
  const whId = document.getElementById('issue-warehouse').value;
  const prodId = hiddenInput.value;
  const infoTd = hiddenInput.closest('tr').querySelector('.stk-info');
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
    
    if(!prodId || !qty) return showMsg('يرجى اختيار الصنف وتحديد الكمية', 'error');
    items.push({ product_id: prodId, quantity: qty });
  }
  
  confirmAction('صرف البضاعة باستخدام أقدم صلاحية (FIFO) تلقائياً؟', async () => {
    const userId = (await supabase.auth.getUser()).data.user.id;
    
    const { data: headerData, error: headerErr } = await supabase.from('goods_issues').insert([{
      doc_date: docDate,
      warehouse_id: whId,
      customer_id: cusId,
      created_by: userId
    }]).select();
    
    if(headerErr) return showMsg(headerErr.message, 'error');
    
    const issueId = headerData[0].id;
    
    const itemsToInsert = items.map(it => ({ issue_id: issueId, ...it }));
    
    const { error: itemsErr } = await supabase.from('issue_items').insert(itemsToInsert);
    if(itemsErr) {
       showMsg('خطأ: ' + itemsErr.message, 'error');
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
    <td>${buildProductAutocomplete()}</td>
    <td><input type="text" class="p-batch" placeholder="الباتش" required></td>
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
    
    if(!prodId || !qty || !batch) return showMsg('يرجى إكمال بيانات التحويل كاملة', 'error');
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

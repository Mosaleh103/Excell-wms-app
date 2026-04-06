/**
 * wms_definitions.js - Manage Warehouses, Products, Suppliers, Customers
 */

let productsCache = [];
let warehousesCache = [];
let customersCache = [];
let suppliersCache = [];
let categoriesCache = [];

window.init_def_products = function() { 
  loadWarehousesSelect(); 
  loadCategoriesForProducts();
  loadProducts(); 
};
window.init_def_categories = function() { loadCategories(); };
window.init_def_warehouses = function() { loadWarehouses(); };
window.init_def_customers = function() { loadCustomers(); };
window.init_def_suppliers = function() { loadSuppliers(); };


// --- WAREHOUSES ---
async function loadWarehouses() {
  const tbody = document.getElementById('def-warehouses-body');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">جاري التحميل...</td></tr>';
  
  const { data, error } = await supabase.from('warehouses').select('*').order('created_at', { ascending: false });
  if(error) { showMsg('خطأ في تحميل المستودعات', 'error'); return; }
  
  warehousesCache = data;
  tbody.innerHTML = '';
  if(data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا توجد مستودعات.</td></tr>';
    return;
  }
  
  data.forEach(wh => {
    tbody.innerHTML += `<tr>
      <td>${wh.name}</td>
      <td>${wh.location || '-'}</td>
      <td>${new Date(wh.created_at).toLocaleDateString()}</td>
    </tr>`;
  });
}

document.getElementById('btn-save-warehouse')?.addEventListener('click', async () => {
  const name = document.getElementById('wh-name').value.trim();
  const loc = document.getElementById('wh-loc').value.trim();
  
  if(!name) return showMsg('يرجى إدخال اسم المستودع', 'error');
  
  const { error } = await supabase.from('warehouses').insert([{ name, location: loc }]);
  if(error) {
    showMsg('خطأ في الإضافة', 'error');
  } else {
    showMsg('تم إضافة المستودع بنجاح');
    document.getElementById('wh-name').value = '';
    document.getElementById('wh-loc').value = '';
    loadWarehouses();
  }
});

// --- LOAD WAREHOUSES SELECT (For Product Form) ---
async function loadWarehousesSelect() {
  const sel = document.getElementById('prod-def-wh');
  if(!sel) return;
  const { data, error } = await supabase.from('warehouses').select('id, name').order('name');
  if(!error && data) {
    sel.innerHTML = '<option value="">-- بدون مستودع افتراضي --</option>';
    data.forEach(w => {
      sel.innerHTML += `<option value="${w.id}">${w.name}</option>`;
    });
  }
}

// --- CATEGORIES ---
async function loadCategories() {
  const tbody = document.getElementById('def-categories-body');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">جاري التحميل...</td></tr>';
  
  const { data, error } = await supabase.from('categories').select('*, parent:parent_id(name)').order('level').order('name');
  if(error) { showMsg('خطأ في تحميل الفئات', 'error'); return; }
  
  categoriesCache = data;
  tbody.innerHTML = '';
  if(data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا توجد فئات.</td></tr>';
    return;
  }
  
  data.forEach(c => {
    let parentStr = c.parent ? c.parent.name : '-';
    tbody.innerHTML += `<tr>
      <td>${c.name}</td>
      <td>مستوى ${c.level}</td>
      <td>${parentStr}</td>
    </tr>`;
  });
}

document.getElementById('btn-save-category')?.addEventListener('click', async () => {
  const name = document.getElementById('cat-name').value.trim();
  if(!name) return showMsg('يرجى إدخال اسم الفئة', 'error');
  
  const { data, error } = await supabase.from('categories').insert([{ name: name, level: 1 }]).select();
  if(error) return showMsg('خطأ في الإضافة', 'error');
  
  const parentId = data[0].id;
  
  await supabase.from('categories').insert([
    { name: 'محلي (Local)', parent_id: parentId, level: 2 },
    { name: 'مستورد (Imported)', parent_id: parentId, level: 2 }
  ]);
  
  showMsg('تم إضافة الفئة وتفريعاتها بنجاح!');
  document.getElementById('cat-name').value = '';
  loadCategories();
});

async function loadCategoriesForProducts() {
  const sel = document.getElementById('prod-main-cat');
  if(!sel) return;
  
  const { data, error } = await supabase.from('categories').select('*').order('level').order('name');
  if(error || !data) return;
  
  categoriesCache = data;
  sel.innerHTML = '<option value="">-- اختر الفئة الرئيسية --</option>';
  
  const mains = data.filter(c => c.level === 1);
  mains.forEach(m => {
    sel.innerHTML += `<option value="${m.id}">${m.name}</option>`;
  });
}

window.filterOrigins = function() {
  const mainId = document.getElementById('prod-main-cat').value;
  const subSel = document.getElementById('prod-sub-cat');
  subSel.innerHTML = '<option value="">-- اختر الفئة الفرعية / المنشأ --</option>';
  
  if(!mainId) return;
  
  const subs = categoriesCache.filter(c => c.parent_id === mainId);
  subs.forEach(s => {
    subSel.innerHTML += `<option value="${s.id}">${s.name}</option>`;
  });
}

// --- PRODUCTS ---
async function loadProducts() {
  const tbody = document.getElementById('def-products-body');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">جاري التحميل...</td></tr>';
  
  // We can join categories to get its name
  const { data, error } = await supabase.from('products').select('*, warehouses(name), categories(*)').order('created_at', { ascending: false });
  if(error) { showMsg('خطأ في تحميل المنتجات', 'error'); return; }
  
  productsCache = data;
  tbody.innerHTML = '';
  if(data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">لا توجد منتجات.</td></tr>';
    return;
  }
  
  data.forEach(p => {
    let catName = p.categories ? p.categories.name : '-';
    // If it has a parent, try to find the parent name from cache to show "Main -> Sub"
    if(p.categories && p.categories.parent_id) {
       const parentCat = categoriesCache.find(x => x.id === p.categories.parent_id);
       if(parentCat) catName = `${parentCat.name} - ${catName}`;
    }

    tbody.innerHTML += `<tr>
      <td>${catName}</td>
      <td>${p.product_code}</td>
      <td>${p.name}</td>
      <td>${p.unit || '-'}</td>
      <td>${p.warehouses?.name || '-'}</td>
      <td>${p.reorder_level || 0}</td>
    </tr>`;
  });
}

document.getElementById('btn-save-product')?.addEventListener('click', async () => {
  const code = document.getElementById('prod-code').value.trim();
  const name = document.getElementById('prod-name').value.trim();
  const unit = document.getElementById('prod-unit').value.trim();
  const reorder = document.getElementById('prod-reorder').value || 0;
  const defWh = document.getElementById('prod-def-wh').value || null;
  const subCatId = document.getElementById('prod-sub-cat').value;
  
  if(!code || !name || !unit || !subCatId) return showMsg('يرجى اختيار تصنيف وتعبئة كافة الحقول الإجبارية', 'error');
  
  // Check if product code already exists
  if (productsCache.some(p => p.product_code === code)) {
    return showMsg('رقم الصنف (الكود) موجود مسبقاً! يرجى اختيار كود آخر.', 'error');
  }
  
  const payload = {
    product_code: code,
    name: name,
    unit: unit,
    reorder_level: reorder,
    default_warehouse_id: defWh,
    category_id: subCatId
  };
  
  const { error } = await supabase.from('products').insert([payload]);
  if(error) {
    if(error.code === '23505') showMsg('رقم الصنف موجود مسبقاً بقاعدة البيانات!', 'error');
    else showMsg('خطأ في إضافة المنتج: ' + error.message, 'error');
  } else {
    showMsg('تم إضافة المنتج بنجاح');
    document.getElementById('prod-code').value = '';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-unit').value = '';
    document.getElementById('prod-reorder').value = '0';
    document.getElementById('prod-def-wh').value = '';
    document.getElementById('prod-main-cat').value = '';
    document.getElementById('prod-sub-cat').innerHTML = '<option value="">-- اختر الفئة أولاً --</option>';
    loadProducts();
  }
});


// --- CUSTOMERS ---
async function loadCustomers() {
  const tbody = document.getElementById('def-customers-body');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">جاري التحميل...</td></tr>';
  
  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
  if(error) { showMsg('خطأ في تحميل العملاء', 'error'); return; }
  
  customersCache = data;
  tbody.innerHTML = '';
  if(data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا يوجد عملاء.</td></tr>';
    return;
  }
  
  data.forEach(c => {
    tbody.innerHTML += `<tr>
      <td>${c.name}</td>
      <td>${c.contact_info || '-'}</td>
      <td>${new Date(c.created_at).toLocaleDateString()}</td>
    </tr>`;
  });
}

document.getElementById('btn-save-customer')?.addEventListener('click', async () => {
  const name = document.getElementById('cust-name').value.trim();
  const info = document.getElementById('cust-info').value.trim();
  
  if(!name) return showMsg('يرجى إدخال اسم العميل', 'error');
  
  const { error } = await supabase.from('customers').insert([{ name: name, contact_info: info }]);
  if(error) {
    showMsg('خطأ في الإضافة', 'error');
  } else {
    showMsg('تم إضافة العميل بنجاح');
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-info').value = '';
    loadCustomers();
  }
});


// --- SUPPLIERS ---
async function loadSuppliers() {
  const tbody = document.getElementById('def-suppliers-body');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">جاري التحميل...</td></tr>';
  
  const { data, error } = await supabase.from('suppliers').select('*').order('created_at', { ascending: false });
  if(error) { showMsg('خطأ في تحميل الموردين', 'error'); return; }
  
  suppliersCache = data;
  tbody.innerHTML = '';
  if(data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا يوجد موردين.</td></tr>';
    return;
  }
  
  data.forEach(s => {
    tbody.innerHTML += `<tr>
      <td>${s.name}</td>
      <td>${s.contact_info || '-'}</td>
      <td>${new Date(s.created_at).toLocaleDateString()}</td>
    </tr>`;
  });
}

document.getElementById('btn-save-supplier')?.addEventListener('click', async () => {
  const name = document.getElementById('supp-name').value.trim();
  const info = document.getElementById('supp-info').value.trim();
  
  if(!name) return showMsg('يرجى إدخال اسم المورد', 'error');
  
  const { error } = await supabase.from('suppliers').insert([{ name: name, contact_info: info }]);
  if(error) {
    showMsg('خطأ في الإضافة', 'error');
  } else {
    showMsg('تم إضافة المورد بنجاح');
    document.getElementById('supp-name').value = '';
    document.getElementById('supp-info').value = '';
    loadSuppliers();
  }
});

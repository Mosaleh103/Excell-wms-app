/**
 * wms_definitions.js - Manage Warehouses, Products, Suppliers, Customers
 */

let productsCache = [];
let warehousesCache = [];

window.init_def_products = function() {
  loadProducts();
};

window.init_def_warehouses = function() {
  loadWarehouses();
};

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

document.getElementById('btn-new-warehouse')?.addEventListener('click', async () => {
  const name = prompt('اسم المستودع:');
  if(!name) return;
  const loc = prompt('موقع المستودع:');
  
  const { error } = await supabase.from('warehouses').insert([{ name, location: loc }]);
  if(error) {
    showMsg('خطأ في الإضافة', 'error');
  } else {
    showMsg('تم إضافة المستودع بنجاح');
    loadWarehouses();
  }
});


// --- PRODUCTS ---
async function loadProducts() {
  const tbody = document.getElementById('def-products-body');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">جاري التحميل...</td></tr>';
  
  const { data, error } = await supabase.from('products').select('*, warehouses(name)').order('created_at', { ascending: false });
  if(error) { showMsg('خطأ في تحميل المنتجات', 'error'); return; }
  
  productsCache = data;
  tbody.innerHTML = '';
  if(data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا توجد منتجات.</td></tr>';
    return;
  }
  
  data.forEach(p => {
    tbody.innerHTML += `<tr>
      <td>${p.product_code}</td>
      <td>${p.name}</td>
      <td>${p.unit || '-'}</td>
      <td>${p.warehouses?.name || '-'}</td>
      <td>${p.reorder_level || 0}</td>
    </tr>`;
  });
}

document.getElementById('btn-new-product')?.addEventListener('click', async () => {
  const code = prompt('كود المنتج:');
  if(!code) return;
  const name = prompt('اسم المنتج:');
  if(!name) return;
  
  // Quick insert without full form for demo
  const { error } = await supabase.from('products').insert([{ product_code: code, name: name, unit: 'حبة' }]);
  if(error) {
    showMsg('خطأ في الإضافة', 'error');
  } else {
    showMsg('تم إضافة المنتج بنجاح');
    loadProducts();
  }
});

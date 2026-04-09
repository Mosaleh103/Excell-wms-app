/**
 * app.js - Main Application Logic for WMS
 */

// Remove pages array since router handles dynamically

const menuStructure = [
  {
    title: 'لوحة التحكم',
    icon: '📊',
    items: [
      { id: 'menu-dashboard', label: 'لوحة التحكم', page: 'page-dashboard', module: 'dashboard' }
    ]
  },
  {
    title: 'التعريفات',
    icon: '📦',
    items: [
      { id: 'menu-categories', label: 'الفئات والتصنيفات', page: 'page-def-categories', module: 'categories' },
      { id: 'menu-products', label: 'المنتجات', page: 'page-def-products', module: 'products' },
      { id: 'menu-warehouses', label: 'المستودعات', page: 'page-def-warehouses', module: 'warehouses' },
      { id: 'menu-customers', label: 'العملاء', page: 'page-def-customers', module: 'customers' },
      { id: 'menu-suppliers', label: 'الموردين', page: 'page-def-suppliers', module: 'suppliers' }
    ]
  },
  {
    title: 'العمليات',
    icon: '📋',
    items: [
      { id: 'menu-documents', label: 'دليل المستندات (السجل)', page: 'page-documents', module: 'documents' },
      { id: 'menu-op-opening', label: '🎯 رصيد أول المدة', page: 'page-document-form/new-OPENING', module: 'opening' },
      { id: 'menu-op-receipt', label: '📥 استلام بضاعة', page: 'page-document-form/new-RECEIPT', module: 'receipt' },
      { id: 'menu-op-issue', label: '📤 صرف بضاعة', page: 'page-document-form/new-ISSUE', module: 'issue' },
      { id: 'menu-op-transfer', label: '🔄 تحويل مخزني', page: 'page-document-form/new-TRANSFER', module: 'transfer' }
    ]
  },
  {
    title: 'التقارير',
    icon: '📈',
    items: [
      { id: 'menu-balance', label: 'أرصدة المخزون', page: 'page-rep-balance', module: 'report_balance' },
      { id: 'menu-ledger', label: 'دفتر حركات المنتج', page: 'page-ledger', module: 'report_balance' }
    ]
  },
  {
    title: 'الإعدادات',
    icon: '⚙️',
    items: [
      { id: 'menu-users', label: 'إدارة المستخدمين', page: 'page-users', module: 'users' },
      { id: 'menu-perms', label: 'مصفوفة الصلاحيات', page: 'page-permissions', module: 'permissions' }
    ]
  }
];

window.pageModuleMap = {
  'page-dashboard': 'dashboard',
  'page-documents': 'documents',
  'page-document-form': 'documents',
  'page-def-categories': 'categories',
  'page-def-categories-form': 'categories',
  'page-def-products': 'products',
  'page-def-products-form': 'products',
  'page-def-warehouses': 'warehouses',
  'page-def-warehouses-form': 'warehouses',
  'page-def-customers': 'customers',
  'page-def-customers-form': 'customers',
  'page-def-suppliers': 'suppliers',
  'page-def-suppliers-form': 'suppliers',
  'page-op-opening': 'opening',
  'page-op-receipt': 'receipt',
  'page-op-issue': 'issue',
  'page-op-transfer': 'transfer',
  'page-rep-balance': 'report_balance',
  'page-ledger': 'report_balance',
  'page-users': 'users',
  'page-permissions': 'permissions'
};

// Deprecated showPage -> redirects to router
function showPage(pageId) {
  window.navigate(pageId);
}

function buildMenu() {
  const container = document.getElementById('mb-menus');
  if(!container) return;
  container.innerHTML = '';
  
  const userRole = localStorage.getItem('userRole') || 'warehouse_keeper';
  
  menuStructure.forEach(group => {
    // Filter items dynamically by Matrix Permissions Engine
    const items = group.items.filter(it => typeof window.canView === 'function' ? window.canView(it.module) : true);
    
    if(items.length > 0) {
      const gDiv = document.createElement('div');
      gDiv.className = 'mb-menu';
      
      const gTitle = document.createElement('button');
      gTitle.className = 'mb-menu-btn';
      gTitle.innerHTML = `<span style="font-size:16px;">${group.icon}</span> ${group.title} <span class="arrow">▼</span>`;
      gDiv.appendChild(gTitle);
      
      const dd = document.createElement('div');
      dd.className = 'mb-dropdown';
      
      gTitle.onclick = (e) => {
        // close others
        document.querySelectorAll('.mb-dropdown.open').forEach(d => { if(d !== dd) d.classList.remove('open'); });
        document.querySelectorAll('.mb-menu-btn.open').forEach(b => { if(b !== gTitle) b.classList.remove('open'); });
        
        gTitle.classList.toggle('open');
        dd.classList.toggle('open');
        e.stopPropagation();
      };
      
      items.forEach(it => {
        const btn = document.createElement('div');
        btn.className = 'mb-dd-item';
        btn.id = it.id;
        btn.textContent = it.label;
        btn.onclick = () => {
          showPage(it.page);
          dd.classList.remove('open');
          gTitle.classList.remove('open');
        };
        dd.appendChild(btn);
      });
      gDiv.appendChild(dd);
      
      // Close all when clicking outside
      document.addEventListener('click', (e) => {
        if(!gDiv.contains(e.target)) {
          dd.classList.remove('open');
          gTitle.classList.remove('open');
        }
      });
      container.appendChild(gDiv);
    }
  });

  // Built-in welcome apps icons
  const wlcApps = document.getElementById('wlc-apps');
  if(wlcApps) {
    wlcApps.innerHTML = '';
    menuStructure.forEach(group => {
      const items = group.items.filter(it => typeof window.canView === 'function' ? window.canView(it.module) : true);
      items.forEach(it => {
        const box = document.createElement('div');
        box.className = 'wlc-app-box';
        box.innerHTML = `<div class="icon">${group.icon}</div><div class="txt">${it.label}</div>`;
        box.onclick = () => showPage(it.page);
        wlcApps.appendChild(box);
      });
    });
  }
}

// Global confirm function reused from CRM
window.confirmAction = function(msg, onConfirm) {
  const overlay = document.getElementById('confirm-overlay');
  document.getElementById('cm').textContent = msg;
  overlay.style.display = 'flex';
  
  const ybtn = document.getElementById('cy');
  const nbtn = document.getElementById('cn');
  
  ybtn.onclick = () => { overlay.style.display = 'none'; onConfirm(); };
  nbtn.onclick = () => { overlay.style.display = 'none'; };
}

// ════════════════════════════════════
// TOAST NOTIFICATION SYSTEM
// ════════════════════════════════════
window.showMsg = function(msg, type = 'success') {
  // Also update status bar
  const m = document.getElementById('smsg');
  const d = document.getElementById('sdot');
  if (m && d) {
    m.textContent = msg;
    d.style.background = type === 'error' ? 'var(--red)' : 'var(--teal)';
    setTimeout(() => { m.textContent = 'جاهز'; d.style.background = 'var(--teal)'; }, 5000);
  }

  // Create toast container if not exists
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const colors = {
    success: { bg: '#f0fdf4', border: '#16a34a', text: '#15803d', bar: '#16a34a' },
    error:   { bg: '#fff1f2', border: '#dc2626', text: '#b91c1c', bar: '#dc2626' },
    warning: { bg: '#fffbeb', border: '#d97706', text: '#92400e', bar: '#d97706' },
    info:    { bg: '#eff6ff', border: '#2563eb', text: '#1e40af', bar: '#2563eb' }
  };
  const c = colors[type] || colors.info;
  const icon = icons[type] || icons.info;

  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <span style="font-size:18px;flex-shrink:0;">${icon}</span>
      <span style="font-size:13px;font-weight:600;line-height:1.5;">${msg}</span>
      <button onclick="this.closest('.toast-item').remove()" style="background:none;border:none;cursor:pointer;font-size:16px;color:${c.text};margin-right:auto;padding:0;line-height:1;">×</button>
    </div>
    <div class="toast-bar"></div>
  `;
  toast.style.cssText = `
    background:${c.bg}; border:1.5px solid ${c.border}; color:${c.text};
    border-right:4px solid ${c.border};
    border-radius:10px; padding:14px 16px; margin-top:10px;
    box-shadow:0 4px 20px rgba(0,0,0,0.12);
    min-width:280px; max-width:380px; position:relative; overflow:hidden;
    animation:toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards;
    font-family:'Tajawal',sans-serif; direction:rtl;
  `;
  const bar = toast.querySelector('.toast-bar');
  bar.style.cssText = `position:absolute;bottom:0;right:0;height:3px;background:${c.bar};width:100%;border-radius:0 0 0 10px;animation:toastBar 3s linear forwards;`;

  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

// Inject toast CSS once
if (!document.getElementById('toast-styles')) {
  const s = document.createElement('style');
  s.id = 'toast-styles';
  s.textContent = `
    #toast-container {
      position:fixed; bottom:24px; left:24px; z-index:99999;
      display:flex; flex-direction:column-reverse; gap:0;
    }
    @keyframes toastIn  { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
    @keyframes toastOut { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(-20px)} }
    @keyframes toastBar { from{width:100%} to{width:0} }
  `;
  document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded', () => {
  // Try checking login state automatically handled by auth.js
});

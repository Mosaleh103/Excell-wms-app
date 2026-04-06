/**
 * app.js - Main Application Logic for WMS
 */

const pages = [
  'page-welcome',
  'page-dashboard',
  'page-def-categories',
  'page-def-products',
  'page-def-warehouses',
  'page-op-receipt',
  'page-op-issue',
  'page-op-transfer',
  'page-rep-balance',
  'page-users',
  'page-permissions'
];

const menuStructure = [
  {
    title: 'لوحة التحكم',
    icon: '📊',
    items: [
      { id: 'menu-dashboard', label: 'لوحة التحكم', page: 'page-dashboard', role: 'all' }
    ]
  },
  {
    title: 'التعريفات',
    icon: '📦',
    items: [
      { id: 'menu-categories', label: 'الفئات والتصنيفات', page: 'page-def-categories', role: 'admin' },
      { id: 'menu-products', label: 'المنتجات', page: 'page-def-products', role: 'admin,warehouse_keeper' },
      { id: 'menu-warehouses', label: 'المستودعات', page: 'page-def-warehouses', role: 'admin' },
      { id: 'menu-customers', label: 'العملاء', page: 'page-def-customers', role: 'admin,warehouse_keeper' },
      { id: 'menu-suppliers', label: 'الموردين', page: 'page-def-suppliers', role: 'admin,warehouse_keeper' }
    ]
  },
  {
    title: 'العمليات',
    icon: '⚙️',
    items: [
      { id: 'menu-receipt', label: 'استلام بضاعة (IN)', page: 'page-op-receipt', role: 'admin,warehouse_keeper' },
      { id: 'menu-issue', label: 'صرف بضاعة (OUT)', page: 'page-op-issue', role: 'admin,warehouse_keeper' },
      { id: 'menu-transfer', label: 'تحويل مخزني', page: 'page-op-transfer', role: 'admin,warehouse_keeper' }
    ]
  },
  {
    title: 'التقارير',
    icon: '📈',
    items: [
      { id: 'menu-balance', label: 'أرصدة المخزون', page: 'page-rep-balance', role: 'all' }
    ]
  },
  {
    title: 'الإعدادات',
    icon: '⚙️',
    items: [
      { id: 'menu-users', label: 'المستخدمين', page: 'page-users', role: 'admin' },
      { id: 'menu-perms', label: 'الصلاحيات', page: 'page-permissions', role: 'admin' }
    ]
  }
];

function showPage(pageId) {
  pages.forEach(p => {
    const el = document.getElementById(p);
    if(el) el.style.display = 'none';
  });
  const t = document.getElementById(pageId);
  if(t) {
    t.style.display = 'block';
    if(window['init_' + pageId.replace('page-','').replace(/-/g, '_')]) {
       window['init_' + pageId.replace('page-','').replace(/-/g, '_')]();
    }
  }
}

function buildMenu() {
  const container = document.getElementById('mb-menus');
  if(!container) return;
  container.innerHTML = '';
  
  const userRole = localStorage.getItem('userRole') || 'warehouse_keeper';
  
  menuStructure.forEach(group => {
    // Filter items by role
    const items = group.items.filter(it => it.role === 'all' || it.role.includes(userRole) || userRole === 'admin');
    
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
      const items = group.items.filter(it => it.role === 'all' || it.role.includes(userRole) || userRole === 'admin');
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

// Global UI messages
window.showMsg = function(msg, type='info') {
  const m = document.getElementById('smsg');
  const d = document.getElementById('sdot');
  if(m && d) {
    m.textContent = msg;
    d.style.background = type === 'error' ? 'var(--red)' : 'var(--green)';
    setTimeout(() => { m.textContent = 'جاهز'; d.style.background = 'var(--teal)'; }, 4000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Try checking login state automatically handled by auth.js
});

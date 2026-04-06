// ── AUTH ──
async function doLogin(){
  const email=document.getElementById('li-email').value.trim();
  const pass=document.getElementById('li-pass').value;
  const err=document.getElementById('li-err');
  const btn=document.getElementById('btn-login');
  err.style.display='none';
  if(!email||!pass){err.style.display='block';err.textContent='يرجى إدخال البريد وكلمة المرور';return;}
  btn.disabled=true; btn.textContent='جاري تسجيل الدخول...';
  const {data,error}=await sb.auth.signInWithPassword({email,password:pass});
  btn.disabled=false; btn.textContent='تسجيل الدخول';
  if(error){err.style.display='block';err.textContent='البريد أو كلمة المرور غير صحيحة';return;}
  CU=data.user;
  const {data:prof}=await sb.from('profiles').select('*').eq('id',CU.id).single();
  if(!prof){err.style.display='block';err.textContent='لم يتم العثور على بيانات المستخدم';return;}
  CP=prof;
  if(prof.is_first_login){showChpwModal(true);}else{initApp();}
}

async function doLogout(){
  const ok=await confirm('هل تريد تسجيل الخروج؟','👋');
  if(!ok)return;
  await sb.auth.signOut();
  CU=null; CP=null; PERMS={};
  document.getElementById('app').style.display='none';
  document.getElementById('page-welcome').classList.remove('active');
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('li-email').value='';
  document.getElementById('li-pass').value='';
}

function showChpwModal(isFirst=false){
  const ov=document.getElementById('chpw-overlay');
  document.getElementById('chpw-sub').textContent=isFirst?'أول تسجيل دخول — يرجى تغيير كلمة المرور للمتابعة':'تغيير كلمة المرور';
  ov.style.display='flex';
}

async function doChpw(){
  const np=document.getElementById('chpw-new').value;
  const nc=document.getElementById('chpw-confirm').value;
  const err=document.getElementById('chpw-err');
  err.style.display='none';
  if(np.length<8){err.style.display='block';err.textContent='يجب أن تكون 8 أحرف على الأقل';return;}
  if(np!==nc){err.style.display='block';err.textContent='كلمتا المرور غير متطابقتين';return;}
  const {error}=await sb.auth.updateUser({password:np});
  if(error){err.style.display='block';err.textContent='خطأ: '+error.message;return;}
  await sb.from('profiles').update({is_first_login:false}).eq('id',CU.id);
  CP.is_first_login=false;
  document.getElementById('chpw-overlay').style.display='none';
  initApp();
}

// ── WELCOME PAGE ──
const WLC_ICONS={
  dashboard:`<svg viewBox="0 0 44 44" width="48" height="48" fill="none"><rect x="5" y="22" width="10" height="16" rx="3" fill="#6366f1"/><rect x="17" y="14" width="10" height="24" rx="3" fill="#8b5cf6"/><rect x="29" y="6" width="10" height="32" rx="3" fill="#a855f7"/><rect x="4" y="38" width="36" height="2.5" rx="1.2" fill="rgba(255,255,255,0.25)"/></svg>`,
  visit:`<svg viewBox="0 0 44 44" width="48" height="48" fill="none"><path d="M22 4C15.4 4 10 9.4 10 16c0 10 12 24 12 24s12-14 12-24c0-6.6-5.4-12-12-12z" fill="#10b981"/><circle cx="22" cy="16" r="5" fill="white" opacity="0.9"/></svg>`,
  plan:`<svg viewBox="0 0 44 44" width="48" height="48" fill="none"><rect x="5" y="10" width="34" height="29" rx="4" fill="#3b82f6"/><rect x="5" y="10" width="34" height="11" rx="4" fill="#1d4ed8"/><rect x="11" y="6" width="5" height="9" rx="2.5" fill="#93c5fd"/><rect x="28" y="6" width="5" height="9" rx="2.5" fill="#93c5fd"/><rect x="11" y="26" width="6" height="5" rx="1.5" fill="white" opacity="0.75"/><rect x="19" y="26" width="6" height="5" rx="1.5" fill="white" opacity="0.75"/><rect x="27" y="26" width="6" height="5" rx="1.5" fill="white" opacity="0.75"/></svg>`,
  customers:`<svg viewBox="0 0 44 44" width="48" height="48" fill="none"><circle cx="14" cy="14" r="7" fill="#0891b2"/><circle cx="30" cy="14" r="7" fill="#06b6d4"/><path d="M2 38c0-6.6 5.4-12 12-12h16c6.6 0 12 5.4 12 12" fill="#0e7490"/></svg>`,
  products:`<svg viewBox="0 0 44 44" width="48" height="48" fill="none"><path d="M22 5L38 14v16L22 39 6 30V14z" fill="#f97316"/><path d="M22 5L38 14 22 23 6 14z" fill="#fb923c"/><line x1="22" y1="23" x2="22" y2="39" stroke="white" stroke-width="1.5" opacity="0.35"/><line x1="6" y1="14" x2="6" y2="30" stroke="white" stroke-width="1" opacity="0.2"/><line x1="14" y1="9" x2="30" y2="18" stroke="white" stroke-width="1.5" opacity="0.45"/></svg>`,
  reports:`<svg viewBox="0 0 44 44" width="48" height="48" fill="none"><polyline points="7,36 16,24 24,29 36,12" stroke="#ef4444" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="7" cy="36" r="3" fill="#ef4444"/><circle cx="16" cy="24" r="3" fill="#f97316"/><circle cx="24" cy="29" r="3" fill="#f97316"/><circle cx="36" cy="12" r="3" fill="#ef4444"/><rect x="5" y="38.5" width="34" height="2.5" rx="1.2" fill="rgba(255,255,255,0.25)"/></svg>`,
  users:`<svg viewBox="0 0 44 44" width="48" height="48" fill="none"><circle cx="22" cy="14" r="9" fill="#7c3aed"/><path d="M5 40c0-9.4 7.6-17 17-17s17 7.6 17 17" fill="#8b5cf6"/></svg>`,
  setup:`<svg viewBox="0 0 44 44" width="48" height="48" fill="none"><circle cx="22" cy="22" r="11" stroke="#3b82f6" stroke-width="3" fill="none"/><circle cx="22" cy="22" r="5" fill="#3b82f6"/><line x1="22" y1="4" x2="22" y2="10" stroke="#60a5fa" stroke-width="3" stroke-linecap="round"/><line x1="22" y1="34" x2="22" y2="40" stroke="#60a5fa" stroke-width="3" stroke-linecap="round"/><line x1="4" y1="22" x2="10" y2="22" stroke="#60a5fa" stroke-width="3" stroke-linecap="round"/><line x1="34" y1="22" x2="40" y2="22" stroke="#60a5fa" stroke-width="3" stroke-linecap="round"/><line x1="9" y1="9" x2="13.2" y2="13.2" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round"/><line x1="30.8" y1="30.8" x2="35" y2="35" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round"/><line x1="35" y1="9" x2="30.8" y2="13.2" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round"/><line x1="13.2" y1="30.8" x2="9" y2="35" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round"/></svg>`,
};

// ── WELCOME PAGE ──
function showWelcome(){
  document.getElementById('login-screen').style.display='none';
  const wlc=document.getElementById('page-welcome');
  if(!wlc){
    document.getElementById('app').style.display='block';
    // Default page by role
    const defaultPage = canView('dashboard') ? 'dashboard' : canView('visits') ? 'visit' : 'setup';
    showPage(defaultPage);
    return;
  }
  document.getElementById('app').style.display='none';
  wlc.classList.add('active');

  const apps=[
    {icon:WLC_ICONS.dashboard, label:'لوحة التحكم',   page:'dashboard',      show:canView('dashboard')},
    {icon:WLC_ICONS.visit,     label:'تسجيل زيارة',   page:'visit',          show:canView('visits')},
    {icon:WLC_ICONS.plan,      label:'الخطة الشهرية', page:'plan',           show:canView('plan')},
    {icon:WLC_ICONS.customers, label:'العملاء',        page:'customers',      show:canView('customers')},
    {icon:WLC_ICONS.products,  label:'المنتجات',       page:'products',       show:canView('products')},
    {icon:WLC_ICONS.reports,   label:'التقارير',       page:'report-company', show:canView('reports')},
    {icon:WLC_ICONS.users,     label:'المستخدمون',     page:'users',          show:canView('users')},
    {icon:WLC_ICONS.setup,     label:'الإعدادات',      page:'setup',          show:canView('setup')},
  ].filter(a=>a.show);

  const container=document.getElementById('wlc-apps');
  container.innerHTML='';
  apps.forEach(a=>{
    const card=document.createElement('div');
    card.className='wlc-app';
    card.innerHTML=`<div class="wa-icon">${a.icon}</div><div class="wa-label">${a.label}</div>`;
    card.addEventListener('click',()=>enterApp(a.page));
    container.appendChild(card);
  });
}

function enterApp(page){
  document.getElementById('page-welcome').classList.remove('active');
  document.getElementById('app').style.display='block';
  const defaultPage = canView('dashboard') ? 'dashboard' : canView('visits') ? 'visit' : 'setup';
  showPage(page || defaultPage);
}

// ── APP INIT ──
async function initApp(){
  // ① Load permissions FIRST — everything depends on this
  await loadPermissions();
  
  // ② Nav bar
  document.getElementById('nav-name').textContent=CP.fullname;
  const roleEl=document.getElementById('nav-role');
  if(CP.role==='super_admin'||CP.role==='admin'){
    roleEl.style.display='none';
  } else {
    roleEl.textContent = ROLE_LABELS[CP.role] || CP.role;
    roleEl.style.display='';
  }

  // ③ Date defaults
  document.getElementById('v-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('perf-month').value=new Date().toISOString().slice(0,7);
  document.getElementById('dash-month').value=new Date().toISOString().slice(0,7);
  document.getElementById('tp-month').value=new Date().toISOString().slice(0,7);
  document.getElementById('rep-month').value=new Date().toISOString().slice(0,7);
  if(CP.month) document.getElementById('setup-month').value=CP.month;
  else document.getElementById('setup-month').value=new Date().toISOString().slice(0,7);

  // ④ Load data + build menu
  await loadMasterData();
  buildMenubar();

  // ⑤ Welcome page
  showWelcome();
}

// ── MASTER DATA ──
async function loadMasterData(){
  st('جاري تحميل البيانات...','loading');
  const [{data:prods},{data:custs},{data:profs}]=await Promise.all([
    sb.from('products').select('*').eq('is_active',true).order('name'),
    sb.from('customers').select('*,profiles!assigned_agent_id(fullname)').eq('is_active',true).order('name'),
    sb.from('profiles').select('*').order('fullname')
  ]);
  allProducts=prods||[];
  allCustomers=custs||[];
  allProfiles=profs||[];
  st('جاهز');
}

// ── MENUBAR ──
function buildMenubar(){
  const menus=document.getElementById('mb-menus');
  menus.innerHTML='';

  const icons={
    dashboard:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    visit:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    plan:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    weekly:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>`,
    perf:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    customers:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    newcust: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="12" y1="17" x2="12" y2="23"/><line x1="9" y1="20" x2="15" y2="20"/></svg>`,
    class:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    unvisited:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    products:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
    stagnant:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
    topprods:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    report:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
    users:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    setup:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`,
    perms:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  };

  // ── Build menu items filtered by permissions ──
  const menuData=[
    {label:'الرئيسية', pages:[
      {page:'dashboard', label:'لوحة التحكم',    icon:icons.dashboard, show:canView('dashboard')},
    ]},
    {label:'المبيعات', group:'تسجيل ومتابعة', pages:[
      {page:'visit',   label:'تسجيل زيارة / مبيعة', icon:icons.visit,   show:canView('visits')},
      {page:'plan',    label:'الخطة الشهرية',        icon:icons.plan,    show:canView('plan')},
      {page:'weekly',  label:'المتابعة الأسبوعية',   icon:icons.weekly,  show:canView('visits')},
      {page:'perf',    label:'تقييم أدائي',           icon:icons.perf,    show:canView('visits')},
    ]},
    {label:'العملاء', group:'إدارة العملاء', pages:[
      {page:'customers',     label:'قائمة العملاء',        icon:icons.customers, show:canView('customers')},
      {page:'customer-form', label:'إضافة عميل جديد',      icon:icons.newcust,   show:canCreate('customers')},
      {page:'cust-class',    label:'تقرير التصنيف ABC',    icon:icons.class,     show:canView('customers')},
      {page:'unvisited',     label:'العملاء غير المزارين', icon:icons.unvisited, show:canView('customers')},
    ]},
    {label:'المنتجات', group:'مخزون وحركة', pages:[
      {page:'products',     label:'قائمة المنتجات',  icon:icons.products, show:canView('products')},
      {page:'stagnant',     label:'المنتجات الراكدة',icon:icons.stagnant, show:canView('products')},
      {page:'top-products', label:'الأكثر مبيعاً',   icon:icons.topprods, show:canView('products')},
    ]},
    {label:'التقارير', group:'تحليل وأداء', pages:[
      {page:'report-company', label:'تقرير الشركة الشامل', icon:icons.report, show:canView('reports')},
    ]},
    {label:'الإعدادات', group:'النظام', pages:[
      {page:'users',       label:'إدارة المستخدمين', icon:icons.users,  show:canView('users')},
      {page:'permissions', label:'إدارة الصلاحيات',  icon:icons.perms,  show:canView('users')},
      {page:'setup',       label:'إعداد الخطة',       icon:icons.setup,  show:canView('setup')},
    ]},
  ]
  // Filter: remove menus with no visible pages
  .map(m=>({...m, pages:m.pages.filter(p=>p.show)}))
  .filter(m=>m.pages.length>0);

  menuData.forEach(m=>{
    const div=document.createElement('div');
    div.className='mb-menu';

    const btn=document.createElement('button');
    btn.className='mb-menu-btn';
    btn.innerHTML=m.label+' <span class="arrow">▾</span>';

    const dd=document.createElement('div');
    dd.className='mb-dropdown';

    if(m.group){
      const title=document.createElement('div');
      title.className='mb-dd-title';
      title.textContent=m.group;
      dd.appendChild(title);
    }

    m.pages.forEach(p=>{
      const item=document.createElement('div');
      item.className='mb-dd-item';
      item.innerHTML=`<span class="dd-icon">${p.icon}</span><span>${p.label}</span>`;
      item.addEventListener('click',(e)=>{
        e.stopPropagation();
        closeDds();
        showPage(p.page);
        document.querySelectorAll('.mb-menu-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
      });
      dd.appendChild(item);
    });

    // ── HOVER to open dropdown ──
    let hoverTimer;
    div.addEventListener('mouseenter',()=>{
      clearTimeout(hoverTimer);
      closeDds();
      const rect=btn.getBoundingClientRect();
      dd.style.top=(rect.bottom+2)+'px';
      const rightEdge=window.innerWidth-rect.right;
      dd.style.right=rightEdge+'px';
      dd.style.left='auto';
      dd.classList.add('open');
      btn.classList.add('open');
    });
    div.addEventListener('mouseleave',()=>{
      hoverTimer=setTimeout(()=>{
        dd.classList.remove('open');
        btn.classList.remove('open');
      },180);
    });
    dd.addEventListener('mouseenter',()=>clearTimeout(hoverTimer));
    dd.addEventListener('mouseleave',()=>{
      hoverTimer=setTimeout(()=>{
        dd.classList.remove('open');
        btn.classList.remove('open');
      },180);
    });
    btn.addEventListener('click',e=>e.stopPropagation());

    div.appendChild(btn);
    div.appendChild(dd);
    menus.appendChild(div);
  });

  // Logo click → back to welcome
  document.querySelector('.mb-brand').onclick=()=>showWelcome();
  document.addEventListener('click',closeDds);
}

function closeDds(){
  document.querySelectorAll('.mb-dropdown').forEach(d=>d.classList.remove('open'));
  document.querySelectorAll('.mb-menu-btn').forEach(b=>b.classList.remove('open'));
}

// ── SHOW PAGE ──
function showPage(name){
  // Guard: block direct access without permission
  const pageModuleMap={
    'dashboard':'dashboard','visit':'visits','plan':'plan','weekly':'visits',
    'perf':'visits','customers':'customers','customer-form':'customers',
    'cust-class':'customers','unvisited':'customers','products':'products',
    'stagnant':'products','top-products':'products','report-company':'reports',
    'users':'users','permissions':'users','setup':'setup'
  };
  const mod = pageModuleMap[name];
  if(mod && !canView(mod)){
    st('ليس لديك صلاحية لعرض هذه الصفحة','error');
    return;
  }

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('page-'+name);
  if(pg) pg.classList.add('active');

  if(name==='dashboard')loadDashboard();
  else if(name==='visit'){loadVisitSelects();loadTodayVisits();}
  else if(name==='plan')loadPlan();
  else if(name==='weekly')loadWeekly();
  else if(name==='perf')loadPerformance();
  else if(name==='customers')loadCustomers();
  else if(name==='customer-form'){clearCustomerForm();loadAgentSelect();}
  else if(name==='cust-class')loadClassReport();
  else if(name==='unvisited')loadUnvisited();
  else if(name==='products')loadProducts();
  else if(name==='stagnant')loadStagnant();
  else if(name==='top-products')loadTopProducts();
  else if(name==='report-company')loadCompanyReport();
  else if(name==='users'){loadUsers();loadAuditLog();}
  else if(name==='permissions')loadPermissionsUI();
  else if(name==='setup')loadSetup();
}

/* ════════════════════════════════════════════════
   router.js — Central Navigation & Rendering Engine
   ════════════════════════════════════════════════ */

window.Router = {
  routes: {},
  
  init() {
    const container = document.querySelector('.pages-container');
    if (!container) return;
    
    // Safely extract actual child node references instead of outerHTML string parsing
    // This perfectly preserves all inline and dynamic event listeners!
    const pagesList = container.querySelectorAll('.page');
    pagesList.forEach(p => {
      this.routes[p.id] = p;
      p.remove(); // Safely detaches from the DOM while retaining listeners
    });
    
    const pWlc = document.getElementById('page-welcome');
    if (pWlc) {
      this.routes['page-welcome'] = pWlc;
      pWlc.remove();
    }

    // Attach Hash Change listener for Back/Forward buttons support
    window.addEventListener('hashchange', () => this.handleHashChange());
  },
  
  start() {
     if(window.location.hash) {
       this.handleHashChange();
     } else {
       // if no hash default to dashboard
       window.navigate('dashboard');
     }
  },

  handleHashChange() {
    let hash = window.location.hash.substring(1) || 'dashboard';

    // Support parameterized routes: e.g. "document-form/some-uuid"
    const slashIdx = hash.indexOf('/');
    let routeBase = hash;
    let routeParam = null;
    if (slashIdx !== -1) {
      routeBase  = hash.substring(0, slashIdx);
      routeParam = hash.substring(slashIdx + 1);
    }

    const pageId      = 'page-' + routeBase;
    const finalPageId = this.routes[pageId] ? pageId : 'page-dashboard';
    this.render(finalPageId, routeParam);
  },

  render(pageId, routeParam = null) {
    const container = document.querySelector('.pages-container');
    if (!container) return;
    
    // 1. Permission Verification 
    const moduleMap = window.pageModuleMap || {};
    const modName = moduleMap[pageId];
    if (modName && typeof window.canView === 'function') {
        if (!window.canView(modName)) {
           console.warn('Access denied to module:', modName);
           // Show restricted visually
           return;
        }
    }
    
    // 2. Ensure ONE screen visible at a time (Remove current content safely)
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
    
    // Hide active welcome screen if needed
    const wlc = document.getElementById('page-welcome');
    if(wlc && pageId !== 'page-welcome') wlc.style.display = 'none';

    // 3. Render Node
    const pageNode = this.routes[pageId];
    if (pageNode) {
        pageNode.style.display = 'block';
        
        container.appendChild(pageNode);
        
        // Ensure UI permissions are dynamically applied
        if (modName && typeof window.applyPagePerms === 'function') {
           window.applyPagePerms(modName);
        }

        // Call module lifecycle init (pass route param if present)
        const initFnName = 'init_' + pageId.replace('page-','').replace(/-/g, '_');
        if (typeof window[initFnName] === 'function') {
           window[initFnName](routeParam);
        }
    }
  }
};

// Expose navigate globally
window.navigate = function(path) {
    let hash = path.startsWith('page-') ? path.replace('page-', '') : path;
    if (hash.startsWith('#')) hash = hash.substring(1);
    window.location.hash = hash;
};

// Initialize router early to harvest nodes before state mutations
document.addEventListener('DOMContentLoaded', () => {
    window.Router.init();
});

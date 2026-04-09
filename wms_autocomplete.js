/**
 * wms_autocomplete.js — SAP-Style Product & Category Autocomplete
 * ✅ Keyboard navigation (↑ ↓ Enter Escape)
 * ✅ 150ms debounce — no lag
 * ✅ position:fixed dropdown — never clipped by overflow
 * ✅ Works in all forms (opening, receipt, issue, transfer, product def)
 * ✅ Reusable: initProductAutocomplete() / initCategoryAutocomplete()
 */

(function () {
  'use strict';

  // ─── Shared dropdown dom element ──────────────────────────────────────────
  let _dropdown = null;
  let _activeInput = null;
  let _activeItems = [];
  let _highlightIdx = -1;
  let _debounceTimer = null;

  function getDropdown() {
    if (!_dropdown) {
      _dropdown = document.createElement('div');
      _dropdown.id = 'wms-ac-dropdown';
      _dropdown.style.cssText = `
        position: fixed;
        z-index: 99999;
        background: #fff;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        box-shadow: 0 10px 30px -5px rgba(0,0,0,0.18);
        max-height: 280px;
        overflow-y: auto;
        display: none;
        min-width: 300px;
        font-family: 'Tajawal', sans-serif;
        font-size: 13px;
      `;
      document.body.appendChild(_dropdown);

      // Close on outside click
      document.addEventListener('mousedown', function (e) {
        if (_dropdown && !_dropdown.contains(e.target) && e.target !== _activeInput) {
          hideDropdown();
        }
      });

      // Keyboard global handler
      document.addEventListener('keydown', function (e) {
        if (!_dropdown || _dropdown.style.display === 'none') return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveCursor(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveCursor(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (_highlightIdx >= 0 && _highlightIdx < _activeItems.length) {
            selectItem(_highlightIdx);
          }
        } else if (e.key === 'Escape') {
          hideDropdown();
        }
      });
    }
    return _dropdown;
  }

  function moveCursor(delta) {
    const items = _dropdown.querySelectorAll('.wms-ac-item, .wms-cat-item');
    if (items.length === 0) return;
    _highlightIdx = Math.max(0, Math.min(_highlightIdx + delta, items.length - 1));
    items.forEach((el, i) => {
      el.classList.toggle('wms-ac-highlighted', i === _highlightIdx);
      el.classList.toggle('wms-cat-highlighted', i === _highlightIdx);
      if (i === _highlightIdx) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function selectItem(idx) {
    const item = _activeItems[idx];
    if (!item || !_activeInput) return;
    const cb = _activeInput._wmsCallback;
    if (cb) cb(item);
    hideDropdown();
  }

  function hideDropdown() {
    if (_dropdown) _dropdown.style.display = 'none';
    _highlightIdx = -1;
    _activeItems = [];
  }

  function showDropdown(inputEl, items, renderFn, onSelect) {
    const dd = getDropdown();
    _activeInput = inputEl;
    _activeInput._wmsCallback = onSelect;
    _activeItems = items;
    _highlightIdx = -1;

    const rect = inputEl.getBoundingClientRect();
    dd.style.top = (rect.bottom + 4) + 'px';
    dd.style.left = rect.left + 'px';
    dd.style.width = Math.max(rect.width, 300) + 'px';

    if (items.length === 0) {
      dd.innerHTML = `<div style="padding:12px 16px;color:#94a3b8;text-align:center;font-size:12px;">لا توجد نتائج مطابقة</div>`;
    } else {
      dd.innerHTML = items.map((item, idx) => renderFn(item, idx)).join('');
      dd.querySelectorAll('.wms-ac-item').forEach((el, idx) => {
        el.addEventListener('mouseenter', () => {
          dd.querySelectorAll('.wms-ac-item').forEach(x => x.classList.remove('wms-ac-highlighted'));
          el.classList.add('wms-ac-highlighted');
          _highlightIdx = idx;
        });
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectItem(idx);
        });
      });
    }

    dd.style.display = 'block';

    // Reposition on scroll/resize
    const repositionFn = () => {
      if (dd.style.display === 'none') return;
      const r = _activeInput?.getBoundingClientRect();
      if (r) {
        dd.style.top = (r.bottom + 4) + 'px';
        dd.style.left = r.left + 'px';
      }
    };
    window.addEventListener('scroll', repositionFn, { once: true, passive: true });
  }

  // ─── Inject styles ────────────────────────────────────────────────────────
  if (!document.getElementById('wms-ac-styles')) {
    const style = document.createElement('style');
    style.id = 'wms-ac-styles';
    style.textContent = `
      .wms-ac-item {
        padding: 9px 14px;
        cursor: pointer;
        border-bottom: 1px solid #f1f5f9;
        transition: background 0.1s;
        line-height: 1.5;
      }
      .wms-ac-item:last-child { border-bottom: none; }
      .wms-ac-item:hover, .wms-ac-highlighted {
        background: #eff6ff !important;
      }
      .wms-ac-code {
        display: inline-block;
        font-family: monospace;
        font-size: 10px;
        color: white;
        background: #1a6ab8;
        padding: 1px 6px;
        border-radius: 4px;
        margin-left: 6px;
        vertical-align: middle;
      }
      .wms-ac-name {
        font-weight: 700;
        color: #1e293b;
        font-size: 13px;
      }
      .wms-ac-sub {
        font-size: 11px;
        color: #64748b;
        margin-top: 2px;
      }
      .wms-cat-item {
        padding: 9px 14px;
        cursor: pointer;
        border-bottom: 1px solid #f1f5f9;
        transition: background 0.1s;
      }
      .wms-cat-item:hover, .wms-cat-highlighted {
        background: #eff6ff !important;
      }
      .wms-cat-code {
        font-family: monospace;
        font-size:10px;
        background:#0d9488;
        color:white;
        padding:1px 5px;
        border-radius:4px;
        margin-left:6px;
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════
  //  PART 1: PRODUCT AUTOCOMPLETE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Builds the HTML for an autocomplete product field (wrap + hidden + visible input)
   * Call initProductAutocomplete() after appending to DOM
   */
  window.buildProductAutocomplete = function (hiddenId = '', placeholder = '[كود] ابحث باسم أو كود الصنف...') {
    return `<div class="ac-wrap" style="position:relative;">
      <input type="text" class="p-search" placeholder="${placeholder}" autocomplete="off"
        style="width:100%;min-width:220px;">
      <input type="hidden" class="p-select" ${hiddenId ? `id="${hiddenId}"` : ''}>
    </div>`;
  };

  /**
   * Initialize autocomplete on all `.ac-wrap` inputs inside a container
   * @param {HTMLElement} container - defaults to document
   */
  window.initAllProductAutocompletes = function (container) {
    const root = container || document;
    root.querySelectorAll('.ac-wrap:not([data-wms-ac])').forEach(wrap => {
      const inp = wrap.querySelector('.p-search');
      const hidden = wrap.querySelector('.p-select');
      if (inp && hidden) {
        _bindProductAC(inp, hidden);
        wrap.setAttribute('data-wms-ac', '1');
      }
    });
  };

  /**
   * Initialize a single product autocomplete
   */
  window.initProductAutocomplete = function (wrap, opts) {
    if (!wrap) return;
    const inp = wrap.querySelector('.p-search');
    const hidden = wrap.querySelector('.p-select');
    if (inp && hidden) {
      _bindProductAC(inp, hidden, opts);
      wrap.setAttribute('data-wms-ac', '1');
    }
  };

  function _bindProductAC(inp, hidden, opts) {
    inp.addEventListener('focus', () => _triggerProductSearch(inp, hidden, opts));
    inp.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => _triggerProductSearch(inp, hidden, opts), 150);
    });
  }

  async function _triggerProductSearch(inp, hidden, opts) {
    // Ensure cache is loaded first
    if (typeof window.ensureProductsCache === 'function') {
      await window.ensureProductsCache();
    }
    const cache = window.productsCache || [];
    const term = inp.value.toLowerCase().trim();

    const filtered = (term
      ? cache.filter(p =>
          (p.product_code || '').toLowerCase().includes(term) ||
          (p.name || '').toLowerCase().includes(term) ||
          (p.name_en || '').toLowerCase().includes(term) ||
          (p.brand || '').toLowerCase().includes(term)
        )
      : cache
    ).slice(0, 50);

    showDropdown(inp, filtered, _renderProduct, function (item) {
      const nameAr = item.name || '';
      inp.value = `[${item.product_code}] ${nameAr}`;
      hidden.value = item.id;
      if (opts && opts.onSelect) opts.onSelect(item, inp, hidden);
      else if (window.checkStock) window.checkStock(hidden);
    });
  }

  function _renderProduct(item, idx) {
    const code  = item.product_code || '';
    const nameAr = item.name || '';
    const nameEn = item.name_en || '';
    const brand = item.brand || '';
    return `
      <div class="wms-ac-item" data-idx="${idx}">
        <div class="wms-ac-name">
          ${nameAr}
          <span class="wms-ac-code">${code}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
          ${nameEn ? `<div class="wms-ac-sub">${nameEn}</div>` : '<div></div>'}
          ${brand ? `<div style="font-size:10px; color:#1a6ab8; font-weight:700;">🏷️ ${brand}</div>` : ''}
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PART 2: CATEGORY AUTOCOMPLETE (for product form)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Replace a category <select> with a searchable autocomplete
   */
  window.initCategoryAutocomplete = function (selectEl) {
    if (!selectEl || selectEl.getAttribute('data-cat-ac')) return;
    selectEl.setAttribute('data-cat-ac', '1');

    // Build replacement UI
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;';
    wrap.innerHTML = `
      <input type="text" id="cat-ac-input" class="cat-ac-inp"
        placeholder="اكتب للبحث في الفئات..." autocomplete="off"
        style="width:100%;">
      <input type="hidden" id="cat-ac-hidden" value="">
    `;
    selectEl.parentNode.insertBefore(wrap, selectEl);
    selectEl.style.display = 'none';

    const inp = wrap.querySelector('.cat-ac-inp');
    const hidden = wrap.querySelector('[type="hidden"]');

    // Sync with original select (for compatibility)
    function sync(id, name) {
      hidden.value = id;
      selectEl.value = id;
      // Trigger change so existing code still works
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    inp.addEventListener('focus', () => _triggerCategorySearch(inp, sync));
    inp.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => _triggerCategorySearch(inp, sync), 150);
    });

    // Expose reset
    selectEl._resetCatAC = function () {
      inp.value = '';
      hidden.value = '';
    };
    selectEl._setCatAC = function (id) {
      const cat = (window.categoriesCache || []).find(c => c.id === id);
      if (cat) {
        const label = (cat.category_code ? `[${cat.category_code}] ` : '') + (cat.name_ar || cat.name || '');
        inp.value = label;
        hidden.value = id;
      }
    };
  };

  function _triggerCategorySearch(inp, onSelect) {
    const cache = (window.categoriesCache || []).filter(c => {
      // Only leaf categories (no children)
      return !window.categoriesCache.some(x => x.parent_id === c.id);
    });
    const term = inp.value.toLowerCase().trim();
    const filtered = (term
      ? cache.filter(c =>
          (c.category_code || '').toLowerCase().includes(term) ||
          (c.name_ar || c.name || '').toLowerCase().includes(term) ||
          (c.name_en || '').toLowerCase().includes(term)
        )
      : cache
    ).slice(0, 60);

    showDropdown(inp, filtered, _renderCategory, function (item) {
      const label = (item.category_code ? `[${item.category_code}] ` : '') + (item.name_ar || item.name || '');
      inp.value = label;
      onSelect(item.id, label);
    });
  }

  function _renderCategory(item, idx) {
    const code  = item.category_code || '';
    const nameAr = item.name_ar || item.name || '';
    const nameEn = item.name_en || '';
    const indent = ((item.level || 1) - 1) * 12;
    return `
      <div class="wms-ac-item wms-cat-item" data-idx="${idx}" style="padding-right:${indent + 14}px;">
        <span class="wms-ac-name">${nameAr}</span>
        ${code ? `<span class="wms-cat-code">${code}</span>` : ''}
        ${nameEn ? `<div class="wms-ac-sub">${nameEn}</div>` : ''}
      </div>
    `;
  }


})();

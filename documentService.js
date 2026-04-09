/**
 * documentService.js — ERP Document Service Layer v1.0
 * ═══════════════════════════════════════════════════
 * ✅ Single entry point for ALL document operations
 * ✅ No direct writes to inventory_transactions from UI
 * ✅ Draft / Post / Unpost / Delete lifecycle
 * ✅ Full validation before post (handled by DB trigger)
 */

window.DocumentService = (() => {

  // ── Helpers ──────────────────────────────────────────────────────────

  async function currentUserId() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  }

  function handleError(context, error) {
    const msg = error?.message || JSON.stringify(error);
    console.error(`[DocumentService:${context}]`, msg);
    // Extract PostgreSQL RAISE EXCEPTION message (appears after "ERROR:")
    const match = msg.match(/ERROR:\s*(.+)/);
    throw new Error(match ? match[1] : msg);
  }

  // ── CREATE DRAFT ──────────────────────────────────────────────────────
  /**
   * إنشاء مستند جديد بحالة مسودة
   * @param {Object} header - { doc_type, warehouse_id, target_wh_id, supplier_id, customer_id, doc_date, notes }
   * @returns {Object} - المستند المنشأ
   */
  async function createDraft(header) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('inventory_documents')
      .insert([{
        doc_type:     header.doc_type,
        status:       'draft',
        warehouse_id: header.warehouse_id,
        target_wh_id: header.target_wh_id || null,
        supplier_id:  header.supplier_id  || null,
        customer_id:  header.customer_id  || null,
        doc_date:     header.doc_date || new Date().toISOString().split('T')[0],
        notes:        header.notes    || null,
        created_by:   userId
      }])
      .select()
      .single();

    if (error) handleError('createDraft', error);
    return data;
  }

  // ── UPDATE DRAFT HEADER ───────────────────────────────────────────────
  /**
   * تحديث بيانات رأس المستند (فقط في حالة Draft)
   */
  async function updateHeader(docId, updates) {
    const { data: doc } = await supabase
      .from('inventory_documents')
      .select('status')
      .eq('id', docId)
      .single();

    if (doc?.status === 'posted') {
      throw new Error('المستند مرحّل — لا يمكن تعديله قبل إعادته لمسودة');
    }

    const { data, error } = await supabase
      .from('inventory_documents')
      .update({
        warehouse_id: updates.warehouse_id,
        target_wh_id: updates.target_wh_id || null,
        supplier_id:  updates.supplier_id  || null,
        customer_id:  updates.customer_id  || null,
        doc_date:     updates.doc_date     || null,
        notes:        updates.notes        || null,
      })
      .eq('id', docId)
      .select()
      .single();

    if (error) handleError('updateHeader', error);
    return data;
  }

  // ── LINES MANAGEMENT ─────────────────────────────────────────────────

  /** إضافة سطر جديد للمستند */
  async function addLine(docId, line) {
    const { data, error } = await supabase
      .from('inventory_document_lines')
      .insert([{
        document_id: docId,
        product_id:  line.product_id,
        batch_no:    line.batch_no,
        expiry_date: line.expiry_date || null,
        quantity:    line.quantity,
        unit:        line.unit || 'unit',
        notes:       line.notes || null,
      }])
      .select()
      .single();

    if (error) handleError('addLine', error);
    return data;
  }

  /** تحديث سطر موجود */
  async function updateLine(lineId, updates) {
    const { data, error } = await supabase
      .from('inventory_document_lines')
      .update({
        product_id:  updates.product_id,
        batch_no:    updates.batch_no,
        expiry_date: updates.expiry_date || null,
        quantity:    updates.quantity,
        unit:        updates.unit || 'unit',
      })
      .eq('id', lineId)
      .select()
      .single();

    if (error) handleError('updateLine', error);
    return data;
  }

  /** حذف سطر */
  async function deleteLine(lineId) {
    const { error } = await supabase
      .from('inventory_document_lines')
      .delete()
      .eq('id', lineId);

    if (error) handleError('deleteLine', error);
    return true;
  }

  /** جلب كل أسطر مستند */
  async function getLines(docId) {
    const { data, error } = await supabase
      .from('inventory_document_lines')
      .select(`
        id, batch_no, expiry_date, quantity, unit, notes,
        products!product_id (id, product_code, name, unit, carton_quantity, batch_no, expiry_date)
      `)
      .eq('document_id', docId)
      .order('created_at');

    if (error) handleError('getLines', error);
    return data || [];
  }

  // ── SAVE LINES BULK ──────────────────────────────────────────────────
  /**
   * حفظ الأسطر كلها من الـ UI (delete old + insert new)
   * يُستخدم عند الحفظ الكامل للنموذج
   */
  async function saveLines(docId, lines) {
    // حذف الأسطر القديمة أولاً
    const { error: delErr } = await supabase
      .from('inventory_document_lines')
      .delete()
      .eq('document_id', docId);

    if (delErr) handleError('saveLines:delete', delErr);

    if (lines.length === 0) return [];

    // إدراج الأسطر الجديدة
    const { data, error } = await supabase
      .from('inventory_document_lines')
      .insert(lines.map(l => ({
        document_id: docId,
        product_id:  l.product_id,
        batch_no:    l.batch_no,
        expiry_date: l.expiry_date || null,
        quantity:    parseFloat(l.quantity),
        unit:        l.unit || 'unit',
      })))
      .select();

    if (error) handleError('saveLines:insert', error);
    return data || [];
  }

  // ── POST ──────────────────────────────────────────────────────────────
  /**
   * ترحيل المستند — يُطلق الـ Posting Engine في قاعدة البيانات
   */
  async function postDocument(docId) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('inventory_documents')
      .update({ status: 'posted', posted_by: userId })
      .eq('id', docId)
      .eq('status', 'draft')  // ضمان إضافي — لا يرحّل إلا المسودات
      .select()
      .single();

    if (error) handleError('postDocument', error);
    if (!data) throw new Error('المستند غير موجود أو مرحّل بالفعل');
    return data;
  }

  // ── UNPOST (Admin only) ───────────────────────────────────────────────
  /**
   * إعادة المستند لمسودة وحذف حركاته من inventory_transactions
   */
  async function unpostDocument(docId) {
    if (!window.isAdmin) {
      throw new Error('إلغاء الترحيل متاح للمشرفين فقط');
    }

    const { data, error } = await supabase
      .from('inventory_documents')
      .update({ status: 'draft' })
      .eq('id', docId)
      .eq('status', 'posted')
      .select()
      .single();

    if (error) handleError('unpostDocument', error);
    if (!data) throw new Error('المستند غير موجود أو ليس في حالة مرحّل');
    return data;
  }

  // ── DELETE (Admin only, Draft only) ──────────────────────────────────
  async function deleteDocument(docId) {
    if (!window.isAdmin) {
      throw new Error('حذف المستند متاح للمشرفين فقط');
    }

    const { data: doc } = await supabase
      .from('inventory_documents')
      .select('status')
      .eq('id', docId)
      .single();

    if (doc?.status === 'posted') {
      throw new Error('لا يمكن حذف مستند مرحّل. أعده لمسودة أولاً');
    }

    const { error } = await supabase
      .from('inventory_documents')
      .delete()
      .eq('id', docId);

    if (error) handleError('deleteDocument', error);
    return true;
  }

  // ── GET SINGLE DOCUMENT ───────────────────────────────────────────────
  async function getDocument(docId) {
    const { data, error } = await supabase
      .from('inventory_documents')
      .select(`
        id, doc_number, doc_type, status, doc_date, notes,
        created_at, posted_at,
        warehouses!warehouse_id        (id, name),
        target_wh:warehouses!target_wh_id (id, name),
        suppliers!supplier_id          (id, name),
        customers!customer_id          (id, name)
      `)
      .eq('id', docId)
      .single();

    if (error) handleError('getDocument', error);
    return data;
  }

  // ── LIST DOCUMENTS ────────────────────────────────────────────────────
  /**
   * @param {Object} filters - { doc_type, status, doc_number, date_from, date_to }
   * @param {number} page - رقم الصفحة (0-indexed)
   * @param {number} pageSize
   */
  async function listDocuments(filters = {}, page = 0, pageSize = 50) {
    let query = supabase
      .from('inventory_documents')
      .select(`
        id, doc_number, doc_type, status, doc_date, created_at, posted_at,
        warehouses!warehouse_id (name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (filters.doc_type)   query = query.eq('doc_type', filters.doc_type);
    if (filters.status)     query = query.eq('status', filters.status);
    if (filters.doc_number) query = query.ilike('doc_number', `%${filters.doc_number}%`);
    if (filters.date_from)  query = query.gte('doc_date', filters.date_from);
    if (filters.date_to)    query = query.lte('doc_date', filters.date_to);

    const { data, error, count } = await query;
    if (error) handleError('listDocuments', error);
    return { docs: data || [], total: count || 0 };
  }

  // ── NAVIGATION (Next / Previous within same type) ─────────────────────
  async function getAdjacentDocument(currentDocNumber, docType, direction = 'next') {
    const op = direction === 'next' ? 'gt' : 'lt';
    const ord = direction === 'next' ? true : false;

    const { data, error } = await supabase
      .from('inventory_documents')
      .select('id, doc_number')
      .eq('doc_type', docType)
      [op]('doc_number', currentDocNumber)
      .order('doc_number', { ascending: ord })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') handleError('getAdjacentDocument', error);
    return data || null;  // null = لا يوجد مستند تالٍ/سابق
  }

  // ── STOCK CHECK (for UI display before post) ─────────────────────────
  async function getAvailableStock(productId, warehouseId) {
    const { data, error } = await supabase
      .from('v_stock_balance')
      .select('total_stock, current_cartons, batch_no, expiry_date')
      .eq('product_id', productId)
      .eq('warehouse_id', warehouseId)
      .gt('total_stock', 0)
      .order('expiry_date');  // FEFO order

    if (error) handleError('getAvailableStock', error);
    return data || [];
  }

  // ── MULTI-WAREHOUSE INTELLIGENCE ───────────────────────────────────────
  async function getGlobalStock(productId) {
    const { data, error } = await supabase
      .from('v_stock_balance')
      .select('total_stock, batch_no, expiry_date, warehouse_id, warehouses!inner(name)')
      .eq('product_id', productId)
      .gt('total_stock', 0)
      .order('total_stock', { ascending: false });

    if (error) handleError('getGlobalStock', error);
    return data || [];
  }

  // ── DRAFT COLLISIONS (Soft Reservation) ──────────────────────────────
  async function getDraftCollisions(productId, warehouseId, excludeDocId) {
    const { data, error } = await supabase
      .from('inventory_document_lines')
      .select('quantity, document_id, inventory_documents!inner(status, warehouse_id, doc_type)')
      .eq('product_id', productId)
      .eq('inventory_documents.status', 'draft')
      .in('inventory_documents.doc_type', ['ISSUE', 'TRANSFER'])
      .eq('inventory_documents.warehouse_id', warehouseId)
      .neq('document_id', excludeDocId || '00000000-0000-0000-0000-000000000000');
    
    if (error) handleError('getDraftCollisions', error);
    return (data || []).reduce((sum, row) => sum + Number(row.quantity), 0);
  }

  // ── Public API ────────────────────────────────────────────────────────
  return {
    createDraft,
    updateHeader,
    addLine,
    updateLine,
    deleteLine,
    getLines,
    saveLines,
    postDocument,
    unpostDocument,
    deleteDocument,
    getDocument,
    listDocuments,
    getAdjacentDocument,
    getAvailableStock,
    getGlobalStock,
    getDraftCollisions,
  };

})();

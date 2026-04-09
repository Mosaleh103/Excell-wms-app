import pandas as pd
import uuid

df = pd.read_excel('ملفات مساعدة/medical_full items.xlsx', header=1)

sql = ["-- BATCH IMPORT FOR CATEGORIES AND PRODUCTS (Generated Automatically)"]
sql.append("BEGIN;")

categories = {}

for idx, row in df.iterrows():
    code = str(row['كود المنتج']).strip()
    if code == 'nan' or not code: continue
    if ' - ' in code: code = code.split(' - ')[0].strip()
    
    name = str(row['اسم المنتج / الصنف']).strip().replace("'", "''")
    if name == 'nan': continue
    
    unit = str(row['الوحدة']).strip()
    
    if unit == 'nan':
        # Category
        cat_id = str(uuid.uuid4())
        categories[code] = cat_id
        parent_code = code[:-2] if len(code) > 2 else "NULL"
        parent_id = f"'{categories[parent_code]}'" if parent_code in categories else "NULL"
        level = 1 if parent_id == "NULL" else 2
        sql.append(f"INSERT INTO categories (id, cat_code, name_ar, level, parent_id) VALUES ('{cat_id}', '{code}', '{name}', {level}, {parent_id}) ON CONFLICT DO NOTHING;")
    else:
        # Product
        parent_code = code[:-3] if len(code) > 3 else "NULL"
        cat_id = f"'{categories[parent_code]}'" if parent_code in categories else "NULL"
        origin = str(row.get('دولة المنشأ', '')).replace('nan', '').replace("'", "''")
        brand = str(row.get('الماركة', '')).replace('nan', '').replace("'", "''")
        ratio = str(row.get('الكمية (كرتونة)', '1')).replace('nan', '1')
        try: ratio = int(float(ratio))
        except: ratio = 1
        
        sql.append(f"INSERT INTO products (product_code, name_ar, category_id, country_of_origin, brand, sales_unit, storage_unit, unit_ratio) VALUES ('{code}', '{name}', {cat_id}, '{origin}', '{brand}', '{unit}', 'carton', {ratio}) ON CONFLICT DO NOTHING;")

sql.append("COMMIT;")

with open('sql/06_master_import.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql))

print("Created sql/06_master_import.sql")

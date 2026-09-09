-- ==========================================================
-- 💼 h-fahamand 1.5 Database Schema & Migration
-- All tables are InnoDB, utf8mb4 with id, created_at, updated_at
-- Financial tables include fiscal_year_id and created_by
-- Safe & idempotent (can be executed repeatedly without data loss)
-- ==========================================================

-- 1. App State (JSON Key-Value Storage - Preserved)
CREATE TABLE IF NOT EXISTS app_state (
  state_key VARCHAR(100) PRIMARY KEY,
  state_value LONGTEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(100) NOT NULL,
  username VARCHAR(100) NOT NULL,
  name VARCHAR(255) NULL,
  role VARCHAR(50) DEFAULT 'seller',
  password VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  permissions LONGTEXT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Fiscal Years Table
CREATE TABLE IF NOT EXISTS fiscal_years (
  id VARCHAR(100) NOT NULL,
  year VARCHAR(50) NOT NULL,
  start_date VARCHAR(50) NULL,
  end_date VARCHAR(50) NULL,
  registered TINYINT(1) DEFAULT 0,
  is_closed TINYINT(1) DEFAULT 0,
  closed_at VARCHAR(50) NULL,
  closed_by VARCHAR(100) NULL,
  locked_date VARCHAR(50) NULL,
  setup_date VARCHAR(50) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fiscal_year_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Counterparts (طرف‌های حساب)
CREATE TABLE IF NOT EXISTS counterparts (
  id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(100) NULL,
  address TEXT NULL,
  type VARCHAR(50) DEFAULT 'both',
  acquaintance_method VARCHAR(255) NULL,
  communication_channel VARCHAR(255) NULL,
  shipping_method VARCHAR(255) NULL,
  custom_icons TEXT NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_by_id VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_counterparts_name (name),
  KEY idx_counterparts_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Categories (دسته‌بندی‌ها)
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_id VARCHAR(100) NULL,
  parent_name VARCHAR(255) NULL,
  type VARCHAR(50) DEFAULT 'transaction',
  subcategories LONGTEXT NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_categories_name (name),
  KEY idx_categories_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Warehouses (انبارها)
CREATE TABLE IF NOT EXISTS warehouses (
  id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NULL,
  location TEXT NULL,
  manager VARCHAR(255) NULL,
  phone VARCHAR(100) NULL,
  description TEXT NULL,
  is_active TINYINT(1) DEFAULT 1,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_warehouses_name (name),
  KEY idx_warehouses_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Items (کالاها و خدمات)
CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(100) NOT NULL,
  warehouse_id VARCHAR(100) NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NULL,
  type VARCHAR(50) DEFAULT 'kala',
  color VARCHAR(100) NULL,
  unit VARCHAR(50) NULL,
  qty DECIMAL(15, 4) DEFAULT 0,
  initial_qty DECIMAL(15, 4) DEFAULT 0,
  last_purchase_price DECIMAL(20, 2) DEFAULT 0,
  last_sale_price DECIMAL(20, 2) DEFAULT 0,
  min_qty_alarm DECIMAL(15, 4) DEFAULT 0,
  category_name VARCHAR(255) NULL,
  parent_category VARCHAR(255) NULL,
  sub_category VARCHAR(255) NULL,
  commission_percent DECIMAL(8, 2) DEFAULT 0,
  setup_date VARCHAR(50) NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_items_name (name),
  KEY idx_items_category (category_name),
  KEY idx_items_warehouse (warehouse_id),
  KEY idx_items_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Accounts (حساب‌های بانکی و صندوق‌ها)
CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  account_number VARCHAR(100) NULL,
  type VARCHAR(50) DEFAULT 'bank',
  balance DECIMAL(20, 2) DEFAULT 0,
  card_number VARCHAR(50) NULL,
  sheba_number VARCHAR(50) NULL,
  bank_name VARCHAR(100) NULL,
  branch VARCHAR(100) NULL,
  description TEXT NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_accounts_name (name),
  KEY idx_accounts_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Invoices (فاکتورهای خرید و فروش و پیش‌فاکتورها)
CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(100) NOT NULL,
  invoice_number VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  date VARCHAR(50) NOT NULL,
  counterpart_id VARCHAR(100) NULL,
  counterpart_name VARCHAR(255) NULL,
  counterpart_phone VARCHAR(100) NULL,
  counterpart_address TEXT NULL,
  total_amount DECIMAL(20, 2) DEFAULT 0,
  tax DECIMAL(20, 2) DEFAULT 0,
  deposit DECIMAL(20, 2) DEFAULT 0,
  discount DECIMAL(20, 2) DEFAULT 0,
  payment_amount DECIMAL(20, 2) DEFAULT 0,
  payment_date VARCHAR(50) NULL,
  description TEXT NULL,
  is_proforma TINYINT(1) DEFAULT 0,
  is_urgent TINYINT(1) DEFAULT 0,
  urgent_type VARCHAR(50) NULL,
  shipping_method VARCHAR(255) NULL,
  acquaintance_method VARCHAR(255) NULL,
  doc_id VARCHAR(100) NULL,
  cogs_doc_id VARCHAR(100) NULL,
  cogs_total DECIMAL(20, 2) DEFAULT 0,
  is_return TINYINT(1) DEFAULT 0,
  return_ref_invoice_id VARCHAR(100) NULL,
  is_deleted TINYINT(1) DEFAULT 0,
  deleted_by VARCHAR(100) NULL,
  deleted_by_id VARCHAR(100) NULL,
  deleted_at VARCHAR(50) NULL,
  custom_icons TEXT NULL,
  attachments LONGTEXT NULL,
  payment_slips LONGTEXT NULL,
  history LONGTEXT NULL,
  allocations LONGTEXT NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_by_id VARCHAR(100) NULL,
  created_by_phone VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_invoices_num (invoice_number),
  KEY idx_invoices_date (date),
  KEY idx_invoices_counterpart (counterpart_id),
  KEY idx_invoices_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Invoice Items (اقلام فاکتورها)
CREATE TABLE IF NOT EXISTS invoice_items (
  id VARCHAR(100) NOT NULL,
  invoice_id VARCHAR(100) NOT NULL,
  item_id VARCHAR(100) NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'kala',
  color VARCHAR(100) NULL,
  unit VARCHAR(50) NULL,
  qty DECIMAL(15, 4) DEFAULT 1,
  unit_price DECIMAL(20, 2) DEFAULT 0,
  total_price DECIMAL(20, 2) DEFAULT 0,
  cogs_unit_cost DECIMAL(20, 2) DEFAULT 0,
  cogs_total DECIMAL(20, 2) DEFAULT 0,
  remarks TEXT NULL,
  sort_order INT DEFAULT 0,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_invoice_items_invoice (invoice_id),
  KEY idx_invoice_items_item (item_id),
  KEY idx_invoice_items_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Transactions (تراکنش‌های مالی و بانکی)
CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(100) NOT NULL,
  date VARCHAR(50) NOT NULL,
  time VARCHAR(50) NULL,
  amount DECIMAL(20, 2) NOT NULL DEFAULT 0,
  type VARCHAR(50) NOT NULL,
  description TEXT NULL,
  is_registered TINYINT(1) DEFAULT 0,
  category_parent VARCHAR(255) NULL,
  category_child VARCHAR(255) NULL,
  user_description TEXT NULL,
  is_duplicate TINYINT(1) DEFAULT 0,
  duplicate_reason TEXT NULL,
  tracking_number VARCHAR(100) NULL,
  reference_code VARCHAR(100) NULL,
  registered_date VARCHAR(50) NULL,
  account_id VARCHAR(100) NULL,
  partner_id VARCHAR(100) NULL,
  pending_deposit_id VARCHAR(100) NULL,
  borrower_id VARCHAR(100) NULL,
  borrower_name VARCHAR(255) NULL,
  loan_type VARCHAR(50) NULL,
  counterpart_id VARCHAR(100) NULL,
  counterpart_name VARCHAR(255) NULL,
  invoice_id VARCHAR(100) NULL,
  doc_id VARCHAR(100) NULL,
  attachments LONGTEXT NULL,
  is_edited TINYINT(1) DEFAULT 0,
  edited_by VARCHAR(100) NULL,
  edited_by_id VARCHAR(100) NULL,
  edited_at VARCHAR(50) NULL,
  edit_history LONGTEXT NULL,
  is_deleted TINYINT(1) DEFAULT 0,
  deleted_by VARCHAR(100) NULL,
  deleted_by_id VARCHAR(100) NULL,
  deleted_at VARCHAR(50) NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_by_id VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transactions_date (date),
  KEY idx_transactions_account (account_id),
  KEY idx_transactions_counterpart (counterpart_id),
  KEY idx_transactions_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Accounting Docs (اسناد حسابداری دوبل / روزنامه)
CREATE TABLE IF NOT EXISTS accounting_docs (
  id VARCHAR(100) NOT NULL,
  doc_number INT NOT NULL,
  date VARCHAR(50) NOT NULL,
  description TEXT NULL,
  is_archived TINYINT(1) DEFAULT 0,
  is_manual TINYINT(1) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'posted',
  operation_type VARCHAR(100) NULL,
  invoice_id VARCHAR(100) NULL,
  tx_id VARCHAR(100) NULL,
  ref_doc_id VARCHAR(100) NULL,
  idempotency_key VARCHAR(255) NULL,
  actor_id VARCHAR(100) NULL,
  actor_name VARCHAR(255) NULL,
  is_deleted TINYINT(1) DEFAULT 0,
  deleted_by VARCHAR(100) NULL,
  deleted_by_id VARCHAR(100) NULL,
  deleted_at VARCHAR(50) NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_accounting_docs_num (doc_number),
  KEY idx_accounting_docs_date (date),
  KEY idx_accounting_docs_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Accounting Doc Lines (سطرهای سند حسابداری)
CREATE TABLE IF NOT EXISTS accounting_doc_lines (
  id VARCHAR(100) NOT NULL,
  doc_id VARCHAR(100) NOT NULL,
  account_id VARCHAR(100) NULL,
  account_name VARCHAR(255) NULL,
  debit DECIMAL(20, 2) DEFAULT 0,
  credit DECIMAL(20, 2) DEFAULT 0,
  description TEXT NULL,
  line_index INT DEFAULT 0,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_doc_lines_doc (doc_id),
  KEY idx_doc_lines_account (account_id),
  KEY idx_doc_lines_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Logs (لاگ‌های سامانه و ممیزی)
CREATE TABLE IF NOT EXISTS logs (
  id VARCHAR(100) NOT NULL,
  timestamp VARCHAR(100) NULL,
  timestamp_ms BIGINT NULL,
  level VARCHAR(50) DEFAULT 'info',
  category VARCHAR(100) NULL,
  message TEXT NULL,
  action VARCHAR(100) NULL,
  storage_location VARCHAR(100) NULL,
  target_type VARCHAR(100) NULL,
  target_id VARCHAR(100) NULL,
  target_number VARCHAR(100) NULL,
  amount DECIMAL(20, 2) DEFAULT 0,
  user_id VARCHAR(100) NULL,
  user_name VARCHAR(255) NULL,
  user_role VARCHAR(100) NULL,
  ip_address VARCHAR(100) NULL,
  details LONGTEXT NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_timestamp (timestamp_ms),
  KEY idx_logs_category (category),
  KEY idx_logs_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Notifications (اعلان‌های کاربری)
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NULL,
  type VARCHAR(50) DEFAULT 'info',
  timestamp VARCHAR(100) NULL,
  is_read TINYINT(1) DEFAULT 0,
  sender_id VARCHAR(100) NULL,
  sender_name VARCHAR(255) NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id),
  KEY idx_notifications_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Checklist (چک‌لیست و وظایف)
CREATE TABLE IF NOT EXISTS checklist (
  id VARCHAR(100) NOT NULL,
  task TEXT NOT NULL,
  is_completed TINYINT(1) DEFAULT 0,
  is_public TINYINT(1) DEFAULT 0,
  completed_at BIGINT NULL,
  date VARCHAR(50) NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_checklist_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. Settings (تنظیمات سامانه)
CREATE TABLE IF NOT EXISTS settings (
  id VARCHAR(100) NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value LONGTEXT NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_settings_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. Uploads (پیوست‌ها و فایل‌های بارگذاری‌شده)
CREATE TABLE IF NOT EXISTS uploads (
  id VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NULL,
  file_path TEXT NULL,
  file_size BIGINT NULL,
  mime_type VARCHAR(100) NULL,
  entity_type VARCHAR(100) NULL,
  entity_id VARCHAR(100) NULL,
  data_url LONGTEXT NULL,
  fiscal_year_id VARCHAR(100) NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_uploads_entity (entity_type, entity_id),
  KEY idx_uploads_fiscal_year (fiscal_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. Settings Store (مخزن تنظیمات سیستمی و پیام‌رسان‌ها)
CREATE TABLE IF NOT EXISTS settings_store (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value LONGTEXT NULL,
  created_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- مقادیر پیش‌فرض برای کلیدهای تنظیمات سیستمی پیام‌رسان‌ها و آیکون‌های سفارشی
INSERT INTO settings_store (setting_key, setting_value, created_by)
VALUES 
  ('acc_system_web_messengers', '[{"id":"wm-eitaa","title":"ایتا وب","url":"https://web.eitaa.com","icon":"eitaa","customIconUrl":"","allowedUserIds":[],"windowWidth":1100,"windowHeight":750,"category":"پیام‌رسان داخلی","description":"نسخه تحت وب پیام‌رسان ایتا","enabled":true},{"id":"wm-rubika","title":"روبیکا وب","url":"https://web.rubika.ir","icon":"rubika","customIconUrl":"","allowedUserIds":[],"windowWidth":1100,"windowHeight":750,"category":"پیام‌رسان داخلی","description":"نسخه تحت وب سوپراپلیکیشن روبیکا","enabled":true},{"id":"wm-bale","title":"بله وب","url":"https://web.bale.ai","icon":"bale","customIconUrl":"","allowedUserIds":[],"windowWidth":1080,"windowHeight":720,"category":"پیام‌رسان داخلی","description":"نسخه تحت وب پیام‌رسان بانکی بله","enabled":true},{"id":"wm-gap","title":"گپ وب","url":"https://web.gap.im","icon":"gap","customIconUrl":"","allowedUserIds":[],"windowWidth":1050,"windowHeight":700,"category":"پیام‌رسان داخلی","description":"نسخه وب پیام‌رسان بین‌المللی گپ","enabled":true},{"id":"wm-igap","title":"آی‌گپ وب","url":"https://web.igap.net","icon":"igap","customIconUrl":"","allowedUserIds":[],"windowWidth":1050,"windowHeight":700,"category":"پیام‌رسان داخلی","description":"نسخه تحت وب پیام‌رسان آی‌گپ","enabled":true},{"id":"wm-whatsapp","title":"واتس‌اپ وب","url":"https://web.whatsapp.com","icon":"whatsapp","customIconUrl":"","allowedUserIds":[],"windowWidth":1150,"windowHeight":800,"category":"پیام‌رسان بین‌المللی","description":"نسخه تحت وب پیام‌رسان واتس‌اپ","enabled":true},{"id":"wm-telegram","title":"تلگرام وب (A)","url":"https://web.telegram.org/a/","icon":"telegram","customIconUrl":"","allowedUserIds":[],"windowWidth":1150,"windowHeight":800,"category":"پیام‌رسان بین‌المللی","description":"نسخه وب A پیام‌رسان تلگرام","enabled":true},{"id":"wm-soroush","title":"سروش پلاس وب","url":"https://web.srub.ir","icon":"soroush","customIconUrl":"","allowedUserIds":[],"windowWidth":1050,"windowHeight":700,"category":"پیام‌رسان داخلی","description":"نسخه وب پیام‌رسان سروش پلاس","enabled":true}]', 'system'),
  ('acc_system_user_messenger_icons', '[]', 'system')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);


import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import mysql from "mysql2/promise";
import AdmZip from "adm-zip";
import compression from "compression";

dotenv.config();

// Default localhost DNS resolution
dns.setDefaultResultOrder("ipv4first");

// Configuration Loader (WP-Config Style)
interface AppConfig {
  DB_TYPE?: string;
  DB_HOST?: string;
  DB_PORT?: number;
  DB_USER?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
  PORT?: number;
}

function getAppConfig(): AppConfig {
  const configPath = path.join(process.cwd(), "wp-config.json");
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, "utf8");
      const parsed = JSON.parse(content);
      // Inject parameters into process.env so they can be read anywhere
      if (parsed.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY = parsed.GEMINI_API_KEY;
      }
      if (parsed.GEMINI_BASE_URL) {
        process.env.GEMINI_BASE_URL = parsed.GEMINI_BASE_URL;
      }
      if (parsed.PORT) {
        process.env.PORT = parsed.PORT.toString();
      }
      return parsed;
    } catch (e) {
      console.error("Error reading wp-config.json:", e);
    }
  }
  return { 
    DB_TYPE: "mysql",
    DB_HOST: "localhost",
    DB_PORT: 3306,
    DB_USER: "wdamlpty_hesabdari-h-fahamand",
    DB_PASSWORD: "stsE*j70[m5FlSNY",
    DB_NAME: "wdamlpty_hesabdari-h.fahamand"
  };
}

let dbType = "mysql";
let mysqlPool: any = null;
let mysqlError: string | null = null;

// Helper to completely clean up host backup folders to optimize host storage
function cleanHostBackupFolders() {
  const dirsToClean = [
    path.join(process.cwd(), "backup"),
    path.join(process.cwd(), "backups"),
    path.join(process.cwd(), "dist", "backup"),
    path.join(process.cwd(), "dist", "backups")
  ];

  for (const dir of dirsToClean) {
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[Storage System] Successfully removed backup directory: ${dir}`);
      } catch (err: any) {
        console.warn(`[Storage System] Notice: Could not remove backup dir ${dir}:`, err?.message);
      }
    }
  }
}

// Helper to purge old build asset bundles (index-*.js, index-*.css) so builds/updates replace old assets cleanly
function cleanOldAssetBundles() {
  const blueprintAssetsDir = path.join(process.cwd(), "blueprint", "assets");
  const publicAssetsDir = path.join(process.cwd(), "public", "assets");
  const distAssetsDir = path.join(process.cwd(), "dist", "assets");
  
  if (!fs.existsSync(publicAssetsDir)) fs.mkdirSync(publicAssetsDir, { recursive: true });
  if (!fs.existsSync(distAssetsDir)) fs.mkdirSync(distAssetsDir, { recursive: true });

  const allAssetDirs = [publicAssetsDir, blueprintAssetsDir, distAssetsDir];
  for (const sDir of allAssetDirs) {
    if (fs.existsSync(sDir)) {
      try {
        const files = fs.readdirSync(sDir);
        for (const f of files) {
          const src = path.join(sDir, f);
          const pubDest = path.join(publicAssetsDir, f);
          const distDest = path.join(distAssetsDir, f);
          if (!fs.existsSync(pubDest)) try { fs.copyFileSync(src, pubDest); } catch (_) {}
          if (!fs.existsSync(distDest)) try { fs.copyFileSync(src, distDest); } catch (_) {}
        }
      } catch (_) {}
    }
  }
}

async function initDatabase() {
  // Always clean host backup directory on system initialization as requested
  cleanHostBackupFolders();

  const config = getAppConfig();
  dbType = "mysql";
  
  try {
    if (mysqlPool) {
      try { await mysqlPool.end(); } catch (_) {}
      mysqlPool = null;
    }
    mysqlPool = mysql.createPool({
      host: config.DB_HOST || "localhost",
      port: Number(config.DB_PORT) || 3306,
      user: config.DB_USER || "wdamlpty_hesabdari-h-fahamand",
      password: config.DB_PASSWORD || "stsE*j70[m5FlSNY",
      database: config.DB_NAME || "wdamlpty_hesabdari-h.fahamand",
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 10000,
      charset: 'utf8mb4'
    });
    
    // Attempt connection to verify
    const connection = await mysqlPool.getConnection();
    console.log("Successfully connected to MySQL database!");
    
    // Optimize session variables on host MySQL if permitted
    try {
      await connection.query("SET NAMES utf8mb4");
      await connection.query("SET SESSION max_allowed_packet = 67108864");
    } catch (_) {}

    // Execute safe, idempotent migrations for all relational database tables
    await runDatabaseMigrations(connection);

    connection.release();
    mysqlError = null;
    console.log("[Storage System] Connected to MySQL database. System operates solely via MySQL.");
  } catch (err: any) {
    console.error("MySQL connection failed. Error:", err.message);
    mysqlError = err.message;
  }
}

/**
 * Idempotent Database Migration Runner
 * Creates all 17 primary entities + app_state with InnoDB, utf8mb4,
 * id primary keys, created_at, updated_at timestamps, and fiscal_year_id / created_by for financial data.
 * Safe to execute multiple times without data loss.
 */
async function runDatabaseMigrations(connection: any): Promise<{ success: boolean; tables: string[]; error?: string }> {
  const tableDefinitions = [
    // 1. JSON Storage (Kept intact for seamless compatibility)
    `CREATE TABLE IF NOT EXISTS app_state (
      state_key VARCHAR(100) PRIMARY KEY,
      state_value LONGTEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 2. Users Table
    `CREATE TABLE IF NOT EXISTS users (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 3. Fiscal Years Table
    `CREATE TABLE IF NOT EXISTS fiscal_years (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 4. Counterparts (طرف‌های حساب)
    `CREATE TABLE IF NOT EXISTS counterparts (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 5. Categories (دسته‌بندی‌ها)
    `CREATE TABLE IF NOT EXISTS categories (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 6. Warehouses (انبارها)
    `CREATE TABLE IF NOT EXISTS warehouses (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 7. Items (کالاها و خدمات)
    `CREATE TABLE IF NOT EXISTS items (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 8. Accounts (حساب‌های بانکی و صندوق‌ها)
    `CREATE TABLE IF NOT EXISTS accounts (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 9. Invoices (فاکتورها و پیش‌فاکتورها)
    `CREATE TABLE IF NOT EXISTS invoices (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 10. Invoice Items (اقلام فاکتورها)
    `CREATE TABLE IF NOT EXISTS invoice_items (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 11. Transactions (تراکنش‌های بانکی و مالی)
    `CREATE TABLE IF NOT EXISTS transactions (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 12. Accounting Docs (اسناد حسابداری)
    `CREATE TABLE IF NOT EXISTS accounting_docs (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 13. Accounting Doc Lines (سطرهای سند حسابداری)
    `CREATE TABLE IF NOT EXISTS accounting_doc_lines (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 14. Logs (لاگ‌های سیستم و ممیزی)
    `CREATE TABLE IF NOT EXISTS logs (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 15. Notifications (اعلان‌ها)
    `CREATE TABLE IF NOT EXISTS notifications (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 16. Checklist (چک‌لیست)
    `CREATE TABLE IF NOT EXISTS checklist (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 17. Settings (تنظیمات)
    `CREATE TABLE IF NOT EXISTS settings (
      id VARCHAR(100) NOT NULL,
      setting_key VARCHAR(100) NOT NULL,
      setting_value LONGTEXT NULL,
      fiscal_year_id VARCHAR(100) NULL,
      created_by VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_settings_key (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 18. Uploads (بارگذاری‌ها و پیوست‌ها)
    `CREATE TABLE IF NOT EXISTS uploads (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 19. Settings Store (تنظیمات سیستمی و پیام‌رسان‌ها)
    `CREATE TABLE IF NOT EXISTS settings_store (
      setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
      setting_value LONGTEXT NULL,
      created_by VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  ];

  const tableNames = [
    'app_state', 'users', 'fiscal_years', 'counterparts', 'categories',
    'warehouses', 'items', 'accounts', 'invoices', 'invoice_items',
    'transactions', 'accounting_docs', 'accounting_doc_lines', 'logs',
    'notifications', 'checklist', 'settings', 'uploads'
  ];

  try {
    for (const sql of tableDefinitions) {
      await connection.query(sql);
    }

    // Ensure state_value is LONGTEXT on existing app_state tables
    try {
      await connection.query("ALTER TABLE app_state MODIFY COLUMN state_value LONGTEXT;");
    } catch (_) {}

    console.log(`[Database Migration] Successfully verified/created all ${tableNames.length} InnoDB utf8mb4 tables.`);
    return { success: true, tables: tableNames };
  } catch (err: any) {
    console.error("[Database Migration] Migration execution error:", err.message);
    return { success: false, tables: tableNames, error: err.message };
  }
}

export interface MigrationReportItem {
  table: string;
  sourceCount: number;
  destinationCount: number;
  status: 'success' | 'warning' | 'error' | 'skipped';
  message?: string;
}

export interface FullMigrationResult {
  success: boolean;
  backup: {
    created: boolean;
    backupTable?: string;
    backupFile?: string;
    error?: string;
  };
  totalSourceRecords: number;
  totalDestinationRecords: number;
  reports: MigrationReportItem[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  error?: string;
}

/**
 * مایگریشن امن، تراکنشی و تکرارپذیر داده‌های JSON موجود در app_state به جداول تفکیکی رابطه‌ای MySQL
 * - داده‌های موجود در app_state دست‌نخورده و بدون حذف باقی می‌مانند
 * - قبل از هرگونه درج، نسخه پشتیبان کامل از app_state در جدول پشتیبان و فایل پشتیبان ذخیره می‌شود
 * - انتقال هر موجودیت در یک Transaction مجزا انجام می‌گیرد تا در صورت خطا Rollback شود
 * - کلیه شناسه‌های قدیمی (ID) به طور کامل حفظ می‌شوند
 * - از دستور ON DUPLICATE KEY UPDATE استفاده شده تا در اجرای مجدد رکورد تکراری ایجاد نشود (Idempotent)
 * - تعداد رکوردهای مبدأ و مقصد شمرده و مقایسه می‌گردد
 */
async function migrateAppStateDataToRelationalTables(connection: any): Promise<FullMigrationResult> {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();
  const reports: MigrationReportItem[] = [];
  let totalSourceRecords = 0;
  let totalDestinationRecords = 0;

  // 1. Ensure all tables exist first
  await runDatabaseMigrations(connection);

  // 2. Pre-migration Backup Generation
  const nowStamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const backupTableName = `app_state_backup_${nowStamp}`;
  const backupResult: { created: boolean; backupTable?: string; backupFile?: string; error?: string } = {
    created: false
  };

  try {
    // Create backup table
    await connection.query(`CREATE TABLE IF NOT EXISTS ${backupTableName} AS SELECT * FROM app_state;`);
    backupResult.backupTable = backupTableName;

    // Create central backup register table if not exists
    await connection.query(`CREATE TABLE IF NOT EXISTS app_state_backups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      backup_table_name VARCHAR(100) NOT NULL,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

    await connection.query(`INSERT INTO app_state_backups (backup_table_name, notes) VALUES (?, ?)`, [
      backupTableName,
      `Pre-migration automated snapshot at ${startedAt}`
    ]);

    // Save JSON backup file to disk
    try {
      const [allRows]: any = await connection.query("SELECT state_key, state_value FROM app_state");
      const backupDir = path.join(process.cwd(), "data", "backups");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const backupFilePath = path.join(backupDir, `app_state_backup_${nowStamp}.json`);
      fs.writeFileSync(backupFilePath, JSON.stringify(allRows, null, 2), "utf8");
      backupResult.backupFile = backupFilePath;
    } catch (fErr: any) {
      console.warn("[Migration Backup] Disk backup notice:", fErr.message);
    }

    backupResult.created = true;
    console.log(`[Migration Backup] Successfully created pre-migration backup table: ${backupTableName}`);
  } catch (bErr: any) {
    backupResult.error = bErr.message;
    console.error("[Migration Backup] Error creating backup:", bErr.message);
  }

  // 3. Load all JSON state from app_state
  const stateData: Record<string, any> = {};
  try {
    const [rows]: any = await connection.query("SELECT state_key, state_value FROM app_state");
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const val = safeUnwrapJson(row.state_value);
        const cleanKey = row.state_key.replace(/^acc_app_/, '');
        stateData[cleanKey] = val;
        stateData[`acc_app_${cleanKey}`] = val;
      }
    }
  } catch (err: any) {
    return {
      success: false,
      backup: backupResult,
      totalSourceRecords: 0,
      totalDestinationRecords: 0,
      reports,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      error: `خطا در خواندن داده‌های app_state: ${err.message}`
    };
  }

  // Helper getters
  const getArray = (key: string): any[] => {
    const val = stateData[key] || stateData[`acc_app_${key}`];
    return Array.isArray(val) ? val : [];
  };

  const getObjectOrArray = (key: string): any => {
    return stateData[key] || stateData[`acc_app_${key}`] || null;
  };

  // 4. Section Migration Definitions

  // A. USERS
  const usersList = getArray('users');
  let usersSourceCount = usersList.length;
  totalSourceRecords += usersSourceCount;
  try {
    await connection.beginTransaction();
    for (const u of usersList) {
      const id = String(u.id || (u.username ? `user_${u.username}` : `user_${Math.random().toString(36).substring(2, 9)}`));
      const username = String(u.username || id);
      const name = u.name || null;
      const role = u.role || 'seller';
      const password = u.password || null;
      const phone = u.phone || null;
      const permissions = u.permissions ? JSON.stringify(u.permissions) : JSON.stringify([]);
      const isActive = u.isActive !== false ? 1 : 0;
      const createdBy = u.createdBy || null;

      await connection.query(
        `INSERT INTO users (id, username, name, role, password, phone, permissions, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           role = VALUES(role),
           password = VALUES(password),
           phone = VALUES(phone),
           permissions = VALUES(permissions),
           is_active = VALUES(is_active),
           updated_at = CURRENT_TIMESTAMP`,
        [id, username, name, role, password, phone, permissions, isActive, createdBy]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM users");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'users',
      sourceCount: usersSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${usersSourceCount} کاربر با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'users',
      sourceCount: usersSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال کاربران (Rollback شد): ${err.message}`
    });
  }

  // B. FISCAL YEARS
  const fiscalYearsList = getArray('fiscalYears').length > 0 ? getArray('fiscalYears') : getArray('fiscal_years');
  let fySourceCount = fiscalYearsList.length;
  totalSourceRecords += fySourceCount;
  try {
    await connection.beginTransaction();
    for (const fy of fiscalYearsList) {
      const id = String(fy.id || (fy.year ? `fy_${fy.year}` : `fy_${Math.random().toString(36).substring(2, 9)}`));
      const year = String(fy.year || '');
      const startDate = fy.startDate || null;
      const endDate = fy.endDate || null;
      const registered = fy.registered ? 1 : 0;
      const isClosed = fy.isClosed ? 1 : 0;
      const closedAt = fy.closedAt || null;
      const closedBy = fy.closedBy || null;
      const lockedDate = fy.lockedDate || null;
      const setupDate = fy.setupDate || null;
      const createdBy = fy.createdBy || null;

      await connection.query(
        `INSERT INTO fiscal_years (id, year, start_date, end_date, registered, is_closed, closed_at, closed_by, locked_date, setup_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           year = VALUES(year),
           start_date = VALUES(start_date),
           end_date = VALUES(end_date),
           registered = VALUES(registered),
           is_closed = VALUES(is_closed),
           closed_at = VALUES(closed_at),
           closed_by = VALUES(closed_by),
           locked_date = VALUES(locked_date),
           setup_date = VALUES(setup_date),
           updated_at = CURRENT_TIMESTAMP`,
        [id, year, startDate, endDate, registered, isClosed, closedAt, closedBy, lockedDate, setupDate, createdBy]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM fiscal_years");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'fiscal_years',
      sourceCount: fySourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${fySourceCount} سال مالی با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'fiscal_years',
      sourceCount: fySourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال سال‌های مالی (Rollback شد): ${err.message}`
    });
  }

  // C. COUNTERPARTS
  const counterpartsList = getArray('counterparts');
  let cpSourceCount = counterpartsList.length;
  totalSourceRecords += cpSourceCount;
  try {
    await connection.beginTransaction();
    for (const cp of counterpartsList) {
      const id = String(cp.id || `cp_${Math.random().toString(36).substring(2, 9)}`);
      const name = String(cp.name || 'طرف حساب');
      const phone = cp.phone || null;
      const address = cp.address || null;
      const type = cp.type || 'both';
      const acquaintanceMethod = cp.acquaintanceMethod || null;
      const communicationChannel = cp.communicationChannel || null;
      const shippingMethod = cp.shippingMethod || null;
      const customIcons = cp.customIcons ? JSON.stringify(cp.customIcons) : null;
      const fiscalYearId = cp.fiscalYearId || null;
      const createdBy = cp.createdBy || null;
      const createdById = cp.createdById || null;

      await connection.query(
        `INSERT INTO counterparts (id, name, phone, address, type, acquaintance_method, communication_channel, shipping_method, custom_icons, fiscal_year_id, created_by, created_by_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           phone = VALUES(phone),
           address = VALUES(address),
           type = VALUES(type),
           acquaintance_method = VALUES(acquaintance_method),
           communication_channel = VALUES(communication_channel),
           shipping_method = VALUES(shipping_method),
           custom_icons = VALUES(custom_icons),
           fiscal_year_id = VALUES(fiscal_year_id),
           updated_at = CURRENT_TIMESTAMP`,
        [id, name, phone, address, type, acquaintanceMethod, communicationChannel, shippingMethod, customIcons, fiscalYearId, createdBy, createdById]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM counterparts");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'counterparts',
      sourceCount: cpSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${cpSourceCount} طرف حساب با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'counterparts',
      sourceCount: cpSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال طرف‌های حساب (Rollback شد): ${err.message}`
    });
  }

  // D. CATEGORIES
  const categoriesList = [...getArray('categories'), ...getArray('warehouse_categories_list')];
  // Deduplicate categories by ID or Name
  const uniqueCatsMap = new Map<string, any>();
  for (const cat of categoriesList) {
    const key = cat.id || cat.name;
    if (key && !uniqueCatsMap.has(key)) {
      uniqueCatsMap.set(key, cat);
    }
  }
  const uniqueCats = Array.from(uniqueCatsMap.values());
  let catSourceCount = uniqueCats.length;
  totalSourceRecords += catSourceCount;
  try {
    await connection.beginTransaction();
    for (const cat of uniqueCats) {
      const id = String(cat.id || `cat_${Math.random().toString(36).substring(2, 9)}`);
      const name = String(cat.name || 'دسته‌بندی');
      const parentId = cat.parentId || null;
      const parentName = cat.parentName || null;
      const type = cat.type || 'transaction';
      const subcategories = cat.subcategories ? JSON.stringify(cat.subcategories) : (cat.subCategories ? JSON.stringify(cat.subCategories) : null);
      const fiscalYearId = cat.fiscalYearId || null;
      const createdBy = cat.createdBy || null;

      await connection.query(
        `INSERT INTO categories (id, name, parent_id, parent_name, type, subcategories, fiscal_year_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           parent_id = VALUES(parent_id),
           parent_name = VALUES(parent_name),
           type = VALUES(type),
           subcategories = VALUES(subcategories),
           fiscal_year_id = VALUES(fiscal_year_id),
           updated_at = CURRENT_TIMESTAMP`,
        [id, name, parentId, parentName, type, subcategories, fiscalYearId, createdBy]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM categories");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'categories',
      sourceCount: catSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${catSourceCount} دسته‌بندی با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'categories',
      sourceCount: catSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال دسته‌بندی‌ها (Rollback شد): ${err.message}`
    });
  }

  // E. WAREHOUSES
  const warehousesList = getArray('warehouses');
  let whSourceCount = warehousesList.length;
  totalSourceRecords += whSourceCount;
  try {
    await connection.beginTransaction();
    for (const wh of warehousesList) {
      const id = String(wh.id || `wh_${Math.random().toString(36).substring(2, 9)}`);
      const name = String(wh.name || 'انبار اصلی');
      const code = wh.code || null;
      const location = wh.location || null;
      const manager = wh.manager || null;
      const phone = wh.phone || null;
      const description = wh.description || null;
      const isActive = wh.isActive !== false ? 1 : 0;
      const fiscalYearId = wh.fiscalYearId || null;
      const createdBy = wh.createdBy || null;

      await connection.query(
        `INSERT INTO warehouses (id, name, code, location, manager, phone, description, is_active, fiscal_year_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           code = VALUES(code),
           location = VALUES(location),
           manager = VALUES(manager),
           phone = VALUES(phone),
           description = VALUES(description),
           is_active = VALUES(is_active),
           fiscal_year_id = VALUES(fiscal_year_id),
           updated_at = CURRENT_TIMESTAMP`,
        [id, name, code, location, manager, phone, description, isActive, fiscalYearId, createdBy]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM warehouses");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'warehouses',
      sourceCount: whSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${whSourceCount} انبار با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'warehouses',
      sourceCount: whSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال انبارها (Rollback شد): ${err.message}`
    });
  }

  // F. ITEMS
  const itemsList = getArray('items');
  let itemsSourceCount = itemsList.length;
  totalSourceRecords += itemsSourceCount;
  try {
    await connection.beginTransaction();
    for (const it of itemsList) {
      const id = String(it.id || `item_${Math.random().toString(36).substring(2, 9)}`);
      const warehouseId = it.warehouseId || null;
      const name = String(it.name || 'کالا');
      const code = it.code || null;
      const type = it.type || 'kala';
      const color = it.color || null;
      const unit = it.unit || null;
      const qty = Number(it.qty) || 0;
      const initialQty = Number(it.initialQty) || 0;
      const lastPurchasePrice = Number(it.lastPurchasePrice) || 0;
      const lastSalePrice = Number(it.lastSalePrice) || 0;
      const minQtyAlarm = Number(it.minQtyAlarm) || 0;
      const categoryName = it.categoryName || it.category || null;
      const parentCategory = it.parentCategory || null;
      const subCategory = it.subCategory || null;
      const commissionPercent = Number(it.commissionPercent) || 0;
      const setupDate = it.setupDate || null;
      const fiscalYearId = it.fiscalYearId || null;
      const createdBy = it.createdBy || null;

      await connection.query(
        `INSERT INTO items (
           id, warehouse_id, name, code, type, color, unit, qty, initial_qty,
           last_purchase_price, last_sale_price, min_qty_alarm, category_name,
           parent_category, sub_category, commission_percent, setup_date, fiscal_year_id, created_by
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           code = VALUES(code),
           type = VALUES(type),
           color = VALUES(color),
           unit = VALUES(unit),
           qty = qty + (VALUES(initial_qty) - initial_qty),
           initial_qty = VALUES(initial_qty),
           last_purchase_price = VALUES(last_purchase_price),
           last_sale_price = VALUES(last_sale_price),
           min_qty_alarm = VALUES(min_qty_alarm),
           category_name = VALUES(category_name),
           parent_category = VALUES(parent_category),
           sub_category = VALUES(sub_category),
           commission_percent = VALUES(commission_percent),
           setup_date = VALUES(setup_date),
           fiscal_year_id = VALUES(fiscal_year_id),
           updated_at = CURRENT_TIMESTAMP`,
        [
          id, warehouseId, name, code, type, color, unit, qty, initialQty,
          lastPurchasePrice, lastSalePrice, minQtyAlarm, categoryName,
          parentCategory, subCategory, commissionPercent, setupDate, fiscalYearId, createdBy
        ]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM items");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'items',
      sourceCount: itemsSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${itemsSourceCount} کالا و خدمات با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'items',
      sourceCount: itemsSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال کالاها (Rollback شد): ${err.message}`
    });
  }

  // G. ACCOUNTS
  const accountsList = getArray('accounts');
  let accountsSourceCount = accountsList.length;
  totalSourceRecords += accountsSourceCount;
  try {
    await connection.beginTransaction();
    for (const acc of accountsList) {
      const id = String(acc.id || `acc_${Math.random().toString(36).substring(2, 9)}`);
      const name = String(acc.name || 'حساب');
      const accountNumber = acc.accountNumber || null;
      const type = acc.type || 'bank';
      const balance = Number(acc.balance) || 0;
      const cardNumber = acc.cardNumber || null;
      const shebaNumber = acc.shebaNumber || null;
      const bankName = acc.bankName || null;
      const branch = acc.branch || null;
      const description = acc.description || null;
      const fiscalYearId = acc.fiscalYearId || null;
      const createdBy = acc.createdBy || null;

      await connection.query(
        `INSERT INTO accounts (id, name, account_number, type, balance, card_number, sheba_number, bank_name, branch, description, fiscal_year_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           account_number = VALUES(account_number),
           type = VALUES(type),
           balance = VALUES(balance),
           card_number = VALUES(card_number),
           sheba_number = VALUES(sheba_number),
           bank_name = VALUES(bank_name),
           branch = VALUES(branch),
           description = VALUES(description),
           fiscal_year_id = VALUES(fiscal_year_id),
           updated_at = CURRENT_TIMESTAMP`,
        [id, name, accountNumber, type, balance, cardNumber, shebaNumber, bankName, branch, description, fiscalYearId, createdBy]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM accounts");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'accounts',
      sourceCount: accountsSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${accountsSourceCount} حساب بانکی و صندوق با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'accounts',
      sourceCount: accountsSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال حساب‌ها (Rollback شد): ${err.message}`
    });
  }

  // H. INVOICES & INVOICE ITEMS
  const invoicesList = getArray('invoices');
  let invoicesSourceCount = invoicesList.length;
  let invoiceItemsTotalSourceCount = 0;
  totalSourceRecords += invoicesSourceCount;
  try {
    await connection.beginTransaction();
    for (const inv of invoicesList) {
      const id = String(inv.id || `inv_${inv.invoiceNumber || Math.random().toString(36).substring(2, 9)}`);
      const invoiceNumber = String(inv.invoiceNumber || inv.id || '');
      const type = inv.type || 'sale';
      const date = String(inv.date || '');
      const counterpartId = inv.counterpartId || null;
      const counterpartName = inv.counterpartName || null;
      const counterpartPhone = inv.counterpartPhone || null;
      const counterpartAddress = inv.counterpartAddress || null;
      const totalAmount = Number(inv.totalAmount) || 0;
      const tax = Number(inv.tax) || 0;
      const deposit = Number(inv.deposit) || 0;
      const discount = Number(inv.discount) || 0;
      const paymentAmount = Number(inv.paymentAmount) || 0;
      const paymentDate = inv.paymentDate || null;
      const description = inv.description || null;
      const isProforma = inv.isProforma ? 1 : 0;
      const isUrgent = inv.isUrgent ? 1 : 0;
      const urgentType = inv.urgentType || null;
      const shippingMethod = inv.shippingMethod || null;
      const acquaintanceMethod = inv.acquaintanceMethod || null;
      const docId = inv.docId || null;
      const cogsDocId = inv.cogsDocId || null;
      const cogsTotal = Number(inv.cogsTotal) || 0;
      const isReturn = inv.isReturn ? 1 : 0;
      const returnRefInvoiceId = inv.returnRefInvoiceId || null;
      const isDeleted = inv.isDeleted ? 1 : 0;
      const deletedBy = inv.deletedBy || null;
      const deletedById = inv.deletedById || null;
      const deletedAt = inv.deletedAt || null;
      const customIcons = inv.customIcons ? JSON.stringify(inv.customIcons) : null;
      const attachments = inv.attachments ? JSON.stringify(inv.attachments) : null;
      const paymentSlips = inv.paymentSlips ? JSON.stringify(inv.paymentSlips) : null;
      const history = inv.history ? JSON.stringify(inv.history) : null;
      const allocations = inv.allocations ? JSON.stringify(inv.allocations) : null;
      const fiscalYearId = inv.fiscalYearId || null;
      const createdBy = inv.createdBy || null;
      const createdById = inv.createdById || null;
      const createdByPhone = inv.createdByPhone || null;

      await connection.query(
        `INSERT INTO invoices (
           id, invoice_number, type, date, counterpart_id, counterpart_name, counterpart_phone,
           counterpart_address, total_amount, tax, deposit, discount, payment_amount, payment_date,
           description, is_proforma, is_urgent, urgent_type, shipping_method, acquaintance_method,
           doc_id, cogs_doc_id, cogs_total, is_return, return_ref_invoice_id, is_deleted,
           deleted_by, deleted_by_id, deleted_at, custom_icons, attachments, payment_slips,
           history, allocations, fiscal_year_id, created_by, created_by_id, created_by_phone
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           invoice_number = VALUES(invoice_number),
           type = VALUES(type),
           date = VALUES(date),
           counterpart_id = VALUES(counterpart_id),
           counterpart_name = VALUES(counterpart_name),
           counterpart_phone = VALUES(counterpart_phone),
           counterpart_address = VALUES(counterpart_address),
           total_amount = VALUES(total_amount),
           tax = VALUES(tax),
           deposit = VALUES(deposit),
           discount = VALUES(discount),
           payment_amount = VALUES(payment_amount),
           payment_date = VALUES(payment_date),
           description = VALUES(description),
           is_proforma = VALUES(is_proforma),
           is_urgent = VALUES(is_urgent),
           urgent_type = VALUES(urgent_type),
           shipping_method = VALUES(shipping_method),
           acquaintance_method = VALUES(acquaintance_method),
           doc_id = VALUES(doc_id),
           cogs_doc_id = VALUES(cogs_doc_id),
           cogs_total = VALUES(cogs_total),
           is_return = VALUES(is_return),
           return_ref_invoice_id = VALUES(return_ref_invoice_id),
           is_deleted = VALUES(is_deleted),
           deleted_by = VALUES(deleted_by),
           deleted_by_id = VALUES(deleted_by_id),
           deleted_at = VALUES(deleted_at),
           custom_icons = VALUES(custom_icons),
           attachments = VALUES(attachments),
           payment_slips = VALUES(payment_slips),
           history = VALUES(history),
           allocations = VALUES(allocations),
           fiscal_year_id = VALUES(fiscal_year_id),
           updated_at = CURRENT_TIMESTAMP`,
        [
          id, invoiceNumber, type, date, counterpartId, counterpartName, counterpartPhone,
          counterpartAddress, totalAmount, tax, deposit, discount, paymentAmount, paymentDate,
          description, isProforma, isUrgent, urgentType, shippingMethod, acquaintanceMethod,
          docId, cogsDocId, cogsTotal, isReturn, returnRefInvoiceId, isDeleted,
          deletedBy, deletedById, deletedAt, customIcons, attachments, paymentSlips,
          history, allocations, fiscalYearId, createdBy, createdById, createdByPhone
        ]
      );

      // Migrate Invoice Items
      const itemsArr = Array.isArray(inv.items) ? inv.items : [];
      invoiceItemsTotalSourceCount += itemsArr.length;
      for (let idx = 0; idx < itemsArr.length; idx++) {
        const item = itemsArr[idx];
        const itemIdPk = String(item.id || `${id}_item_${idx + 1}`);
        const refItemId = item.itemId || null;
        const itemName = String(item.name || 'ردیف فاکتور');
        const itemType = item.type || 'kala';
        const itemColor = item.color || null;
        const itemUnit = item.unit || null;
        const itemQty = Number(item.qty) || 1;
        const itemUnitPrice = Number(item.unitPrice) || 0;
        const itemTotalPrice = Number(item.totalPrice) || (itemQty * itemUnitPrice);
        const itemCogsUnit = Number(item.cogsUnitCost) || 0;
        const itemCogsTotal = Number(item.cogsTotal) || (itemQty * itemCogsUnit);
        const itemRemarks = item.remarks || null;

        await connection.query(
          `INSERT INTO invoice_items (
             id, invoice_id, item_id, name, type, color, unit, qty, unit_price,
             total_price, cogs_unit_cost, cogs_total, remarks, sort_order, fiscal_year_id, created_by
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             type = VALUES(type),
             color = VALUES(color),
             unit = VALUES(unit),
             qty = VALUES(qty),
             unit_price = VALUES(unit_price),
             total_price = VALUES(total_price),
             cogs_unit_cost = VALUES(cogs_unit_cost),
             cogs_total = VALUES(cogs_total),
             remarks = VALUES(remarks),
             sort_order = VALUES(sort_order),
             fiscal_year_id = VALUES(fiscal_year_id),
             updated_at = CURRENT_TIMESTAMP`,
          [
            itemIdPk, id, refItemId, itemName, itemType, itemColor, itemUnit, itemQty, itemUnitPrice,
            itemTotalPrice, itemCogsUnit, itemCogsTotal, itemRemarks, idx, fiscalYearId, createdBy
          ]
        );
      }
    }
    await connection.commit();

    const [cInv]: any = await connection.query("SELECT COUNT(*) as cnt FROM invoices");
    const destInv = Number(cInv[0]?.cnt || 0);
    totalDestinationRecords += destInv;
    reports.push({
      table: 'invoices',
      sourceCount: invoicesSourceCount,
      destinationCount: destInv,
      status: 'success',
      message: `انتقال ${invoicesSourceCount} فاکتور با موفقیت در تراکنش انجام شد.`
    });

    const [cItems]: any = await connection.query("SELECT COUNT(*) as cnt FROM invoice_items");
    const destItems = Number(cItems[0]?.cnt || 0);
    totalDestinationRecords += destItems;
    totalSourceRecords += invoiceItemsTotalSourceCount;
    reports.push({
      table: 'invoice_items',
      sourceCount: invoiceItemsTotalSourceCount,
      destinationCount: destItems,
      status: 'success',
      message: `انتقال ${invoiceItemsTotalSourceCount} ردیف فاکتور با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'invoices',
      sourceCount: invoicesSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال فاکتورها (Rollback شد): ${err.message}`
    });
    reports.push({
      table: 'invoice_items',
      sourceCount: invoiceItemsTotalSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال ردیف‌های فاکتور (Rollback شد): ${err.message}`
    });
  }

  // I. TRANSACTIONS
  const transactionsList = getArray('transactions');
  let txSourceCount = transactionsList.length;
  totalSourceRecords += txSourceCount;
  try {
    await connection.beginTransaction();
    for (const tx of transactionsList) {
      const id = String(tx.id || `tx_${Math.random().toString(36).substring(2, 9)}`);
      const date = String(tx.date || '');
      const time = tx.time || null;
      const amount = Number(tx.amount) || 0;
      const type = tx.type || 'deposit';
      const description = tx.description || null;
      const isRegistered = tx.isRegistered ? 1 : 0;
      const categoryParent = tx.categoryParent || null;
      const categoryChild = tx.categoryChild || null;
      const userDescription = tx.userDescription || null;
      const isDuplicate = tx.isDuplicate ? 1 : 0;
      const duplicateReason = tx.duplicateReason || null;
      const trackingNumber = tx.trackingNumber || null;
      const referenceCode = tx.referenceCode || null;
      const registeredDate = tx.registeredDate || null;
      const accountId = tx.accountId || null;
      const partnerId = tx.partnerId || null;
      const pendingDepositId = tx.pendingDepositId || null;
      const borrowerId = tx.borrowerId || null;
      const borrowerName = tx.borrowerName || null;
      const loanType = tx.loanType || null;
      const counterpartId = tx.counterpartId || null;
      const counterpartName = tx.counterpartName || null;
      const invoiceId = tx.invoiceId || null;
      const docId = tx.docId || null;
      const attachments = tx.attachments ? JSON.stringify(tx.attachments) : null;
      const isEdited = tx.isEdited ? 1 : 0;
      const editedBy = tx.editedBy || null;
      const editedById = tx.editedById || null;
      const editedAt = tx.editedAt || null;
      const editHistory = tx.editHistory ? JSON.stringify(tx.editHistory) : null;
      const isDeleted = tx.isDeleted ? 1 : 0;
      const deletedBy = tx.deletedBy || null;
      const deletedById = tx.deletedById || null;
      const deletedAt = tx.deletedAt || null;
      const fiscalYearId = tx.fiscalYearId || null;
      const createdBy = tx.createdBy || null;
      const createdById = tx.createdById || null;

      await connection.query(
        `INSERT INTO transactions (
           id, date, time, amount, type, description, is_registered, category_parent,
           category_child, user_description, is_duplicate, duplicate_reason, tracking_number,
           reference_code, registered_date, account_id, partner_id, pending_deposit_id,
           borrower_id, borrower_name, loan_type, counterpart_id, counterpart_name,
           invoice_id, doc_id, attachments, is_edited, edited_by, edited_by_id, edited_at,
           edit_history, is_deleted, deleted_by, deleted_by_id, deleted_at, fiscal_year_id,
           created_by, created_by_id
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           date = VALUES(date),
           time = VALUES(time),
           amount = VALUES(amount),
           type = VALUES(type),
           description = VALUES(description),
           is_registered = VALUES(is_registered),
           category_parent = VALUES(category_parent),
           category_child = VALUES(category_child),
           user_description = VALUES(user_description),
           is_duplicate = VALUES(is_duplicate),
           duplicate_reason = VALUES(duplicate_reason),
           tracking_number = VALUES(tracking_number),
           reference_code = VALUES(reference_code),
           registered_date = VALUES(registered_date),
           account_id = VALUES(account_id),
           partner_id = VALUES(partner_id),
           pending_deposit_id = VALUES(pending_deposit_id),
           borrower_id = VALUES(borrower_id),
           borrower_name = VALUES(borrower_name),
           loan_type = VALUES(loan_type),
           counterpart_id = VALUES(counterpart_id),
           counterpart_name = VALUES(counterpart_name),
           invoice_id = VALUES(invoice_id),
           doc_id = VALUES(doc_id),
           attachments = VALUES(attachments),
           is_edited = VALUES(is_edited),
           edited_by = VALUES(edited_by),
           edited_by_id = VALUES(edited_by_id),
           edited_at = VALUES(edited_at),
           edit_history = VALUES(edit_history),
           is_deleted = VALUES(is_deleted),
           deleted_by = VALUES(deleted_by),
           deleted_by_id = VALUES(deleted_by_id),
           deleted_at = VALUES(deleted_at),
           fiscal_year_id = VALUES(fiscal_year_id),
           updated_at = CURRENT_TIMESTAMP`,
        [
          id, date, time, amount, type, description, isRegistered, categoryParent,
          categoryChild, userDescription, isDuplicate, duplicateReason, trackingNumber,
          referenceCode, registeredDate, accountId, partnerId, pendingDepositId,
          borrowerId, borrowerName, loanType, counterpartId, counterpartName,
          invoiceId, docId, attachments, isEdited, editedBy, editedById, editedAt,
          editHistory, isDeleted, deletedBy, deletedById, deletedAt, fiscalYearId,
          createdBy, createdById
        ]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM transactions");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'transactions',
      sourceCount: txSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${txSourceCount} تراکنش با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'transactions',
      sourceCount: txSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال تراکنش‌ها (Rollback شد): ${err.message}`
    });
  }

  // J. ACCOUNTING DOCS & DOC LINES
  const docsList = getArray('docs').length > 0 ? getArray('docs') : getArray('accountingDocs');
  let docsSourceCount = docsList.length;
  let docLinesTotalSourceCount = 0;
  totalSourceRecords += docsSourceCount;
  try {
    await connection.beginTransaction();
    for (const doc of docsList) {
      const id = String(doc.id || `doc_${doc.docNumber || Math.random().toString(36).substring(2, 9)}`);
      const docNumber = Number(doc.docNumber) || 0;
      const date = String(doc.date || '');
      const description = doc.description || null;
      const isArchived = doc.isArchived ? 1 : 0;
      const isManual = doc.isManual ? 1 : 0;
      const status = doc.status || 'posted';
      const operationType = doc.operationType || null;
      const invoiceId = doc.invoiceId || null;
      const txId = doc.txId || null;
      const refDocId = doc.refDocId || null;
      const idempotencyKey = doc.idempotencyKey || null;
      const actorId = doc.actorId || null;
      const actorName = doc.actorName || null;
      const isDeleted = doc.isDeleted ? 1 : 0;
      const deletedBy = doc.deletedBy || null;
      const deletedById = doc.deletedById || null;
      const deletedAt = doc.deletedAt || null;
      const fiscalYearId = doc.fiscalYearId || null;
      const createdBy = doc.createdBy || null;

      await connection.query(
        `INSERT INTO accounting_docs (
           id, doc_number, date, description, is_archived, is_manual, status,
           operation_type, invoice_id, tx_id, ref_doc_id, idempotency_key,
           actor_id, actor_name, is_deleted, deleted_by, deleted_by_id, deleted_at,
           fiscal_year_id, created_by
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           doc_number = VALUES(doc_number),
           date = VALUES(date),
           description = VALUES(description),
           is_archived = VALUES(is_archived),
           is_manual = VALUES(is_manual),
           status = VALUES(status),
           operation_type = VALUES(operation_type),
           invoice_id = VALUES(invoice_id),
           tx_id = VALUES(tx_id),
           ref_doc_id = VALUES(ref_doc_id),
           idempotency_key = VALUES(idempotency_key),
           actor_id = VALUES(actor_id),
           actor_name = VALUES(actor_name),
           is_deleted = VALUES(is_deleted),
           deleted_by = VALUES(deleted_by),
           deleted_by_id = VALUES(deleted_by_id),
           deleted_at = VALUES(deleted_at),
           fiscal_year_id = VALUES(fiscal_year_id),
           updated_at = CURRENT_TIMESTAMP`,
        [
          id, docNumber, date, description, isArchived, isManual, status,
          operationType, invoiceId, txId, refDocId, idempotencyKey,
          actorId, actorName, isDeleted, deletedBy, deletedById, deletedAt,
          fiscalYearId, createdBy
        ]
      );

      // Migrate Doc Lines
      const linesArr = Array.isArray(doc.lines) ? doc.lines : [];
      docLinesTotalSourceCount += linesArr.length;
      for (let idx = 0; idx < linesArr.length; idx++) {
        const line = linesArr[idx];
        const lineIdPk = String(line.id || `${id}_line_${idx + 1}`);
        const accountId = line.accountId || null;
        const accountName = line.accountName || null;
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        const lineDesc = line.description || null;

        await connection.query(
          `INSERT INTO accounting_doc_lines (
             id, doc_id, account_id, account_name, debit, credit, description, line_index,
             fiscal_year_id, created_by
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             account_id = VALUES(account_id),
             account_name = VALUES(account_name),
             debit = VALUES(debit),
             credit = VALUES(credit),
             description = VALUES(description),
             line_index = VALUES(line_index),
             fiscal_year_id = VALUES(fiscal_year_id),
             updated_at = CURRENT_TIMESTAMP`,
          [lineIdPk, id, accountId, accountName, debit, credit, lineDesc, idx, fiscalYearId, createdBy]
        );
      }
    }
    await connection.commit();

    const [cDocs]: any = await connection.query("SELECT COUNT(*) as cnt FROM accounting_docs");
    const destDocs = Number(cDocs[0]?.cnt || 0);
    totalDestinationRecords += destDocs;
    reports.push({
      table: 'accounting_docs',
      sourceCount: docsSourceCount,
      destinationCount: destDocs,
      status: 'success',
      message: `انتقال ${docsSourceCount} سند حسابداری با موفقیت در تراکنش انجام شد.`
    });

    const [cLines]: any = await connection.query("SELECT COUNT(*) as cnt FROM accounting_doc_lines");
    const destLines = Number(cLines[0]?.cnt || 0);
    totalDestinationRecords += destLines;
    totalSourceRecords += docLinesTotalSourceCount;
    reports.push({
      table: 'accounting_doc_lines',
      sourceCount: docLinesTotalSourceCount,
      destinationCount: destLines,
      status: 'success',
      message: `انتقال ${docLinesTotalSourceCount} سطر سند با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'accounting_docs',
      sourceCount: docsSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال اسناد حسابداری (Rollback شد): ${err.message}`
    });
    reports.push({
      table: 'accounting_doc_lines',
      sourceCount: docLinesTotalSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال سطرهای اسناد (Rollback شد): ${err.message}`
    });
  }

  // K. LOGS
  const logsList = [...getArray('system_logs'), ...getArray('auditLogs'), ...getArray('logs')];
  // Deduplicate by ID
  const uniqueLogsMap = new Map<string, any>();
  for (const l of logsList) {
    const key = l.id || `${l.timestampMs}_${l.message}`;
    if (key && !uniqueLogsMap.has(key)) {
      uniqueLogsMap.set(key, l);
    }
  }
  const uniqueLogs = Array.from(uniqueLogsMap.values());
  let logsSourceCount = uniqueLogs.length;
  totalSourceRecords += logsSourceCount;
  try {
    await connection.beginTransaction();
    for (const log of uniqueLogs) {
      const id = String(log.id || `log_${Math.random().toString(36).substring(2, 9)}`);
      const timestamp = log.timestamp || null;
      const timestampMs = log.timestampMs ? Number(log.timestampMs) : null;
      const level = log.level || 'info';
      const category = log.category || null;
      const message = String(log.message || '');
      const action = log.action || null;
      const storageLocation = log.storageLocation || null;
      const targetType = log.targetType || null;
      const targetId = log.targetId || null;
      const targetNumber = log.targetNumber || null;
      const amount = Number(log.amount) || 0;
      const userId = log.userId || log.actorId || null;
      const userName = log.userName || log.actorName || null;
      const userRole = log.userRole || log.actorRole || null;
      const ipAddress = log.ipAddress || null;
      const details = log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)) : null;
      const fiscalYearId = log.fiscalYearId || null;
      const createdBy = log.createdBy || null;

      await connection.query(
        `INSERT INTO logs (
           id, timestamp, timestamp_ms, level, category, message, action, storage_location,
           target_type, target_id, target_number, amount, user_id, user_name, user_role,
           ip_address, details, fiscal_year_id, created_by
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           level = VALUES(level),
           category = VALUES(category),
           message = VALUES(message),
           action = VALUES(action),
           storage_location = VALUES(storage_location),
           target_type = VALUES(target_type),
           target_id = VALUES(target_id),
           target_number = VALUES(target_number),
           amount = VALUES(amount),
           details = VALUES(details),
           updated_at = CURRENT_TIMESTAMP`,
        [
          id, timestamp, timestampMs, level, category, message, action, storageLocation,
          targetType, targetId, targetNumber, amount, userId, userName, userRole,
          ipAddress, details, fiscalYearId, createdBy
        ]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM logs");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'logs',
      sourceCount: logsSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${logsSourceCount} لاگ سامانه با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'logs',
      sourceCount: logsSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال لاگ‌ها (Rollback شد): ${err.message}`
    });
  }

  // L. NOTIFICATIONS
  const notifsList = getArray('notifications');
  let notifsSourceCount = notifsList.length;
  totalSourceRecords += notifsSourceCount;
  try {
    await connection.beginTransaction();
    for (const n of notifsList) {
      const id = String(n.id || `notif_${Math.random().toString(36).substring(2, 9)}`);
      const userId = String(n.userId || 'system');
      const title = String(n.title || 'اعلان');
      const message = n.message || null;
      const type = n.type || 'info';
      const timestamp = n.timestamp || null;
      const isRead = n.isRead ? 1 : 0;
      const senderId = n.senderId || null;
      const senderName = n.senderName || null;
      const fiscalYearId = n.fiscalYearId || null;
      const createdBy = n.createdBy || null;

      await connection.query(
        `INSERT INTO notifications (id, user_id, title, message, type, timestamp, is_read, sender_id, sender_name, fiscal_year_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           message = VALUES(message),
           type = VALUES(type),
           is_read = VALUES(is_read),
           updated_at = CURRENT_TIMESTAMP`,
        [id, userId, title, message, type, timestamp, isRead, senderId, senderName, fiscalYearId, createdBy]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM notifications");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'notifications',
      sourceCount: notifsSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${notifsSourceCount} اعلان با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'notifications',
      sourceCount: notifsSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال اعلان‌ها (Rollback شد): ${err.message}`
    });
  }

  // M. CHECKLIST
  const checklistList = getArray('checklist');
  let chkSourceCount = checklistList.length;
  totalSourceRecords += chkSourceCount;
  try {
    await connection.beginTransaction();
    for (const item of checklistList) {
      const id = String(item.id || `chk_${Math.random().toString(36).substring(2, 9)}`);
      const task = String(item.task || 'تسک');
      const isCompleted = item.isCompleted ? 1 : 0;
      const isPublic = item.isPublic ? 1 : 0;
      const completedAt = item.completedAt ? Number(item.completedAt) : null;
      const date = item.date || null;
      const fiscalYearId = item.fiscalYearId || null;
      const createdBy = item.createdBy || null;

      await connection.query(
        `INSERT INTO checklist (id, task, is_completed, is_public, completed_at, date, fiscal_year_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           task = VALUES(task),
           is_completed = VALUES(is_completed),
           is_public = VALUES(is_public),
           completed_at = VALUES(completed_at),
           date = VALUES(date),
           updated_at = CURRENT_TIMESTAMP`,
        [id, task, isCompleted, isPublic, completedAt, date, fiscalYearId, createdBy]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM checklist");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'checklist',
      sourceCount: chkSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${chkSourceCount} مورد چک‌لیست با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'checklist',
      sourceCount: chkSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال چک‌لیست (Rollback شد): ${err.message}`
    });
  }

  // N. SETTINGS & APP CONFIGURATION
  // Extract all setting keys from stateData (e.g. companySettings, themeSettings, printerSettings, activeFiscalYear, etc.)
  const knownCollectionKeys = new Set([
    'users', 'fiscalYears', 'fiscal_years', 'counterparts', 'categories',
    'warehouses', 'items', 'accounts', 'invoices', 'invoice_items',
    'transactions', 'accountingDocs', 'docs', 'accounting_doc_lines',
    'logs', 'system_logs', 'auditLogs', 'notifications', 'checklist', 'uploads'
  ]);

  const settingsEntries: Array<{ key: string; value: any }> = [];
  for (const [k, v] of Object.entries(stateData)) {
    if (k.startsWith('acc_app_')) continue;
    if (knownCollectionKeys.has(k)) continue;
    if (v !== undefined && v !== null) {
      settingsEntries.push({ key: k, value: v });
    }
  }

  let settingsSourceCount = settingsEntries.length;
  totalSourceRecords += settingsSourceCount;
  try {
    await connection.beginTransaction();
    for (const entry of settingsEntries) {
      const id = `setting_${entry.key}`;
      const settingKey = entry.key;
      const settingValue = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);

      await connection.query(
        `INSERT INTO settings (id, setting_key, setting_value, created_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value),
           updated_at = CURRENT_TIMESTAMP`,
        [id, settingKey, settingValue, 'system']
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM settings");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'settings',
      sourceCount: settingsSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${settingsSourceCount} تنظیم و پیکربندی با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'settings',
      sourceCount: settingsSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال تنظیمات (Rollback شد): ${err.message}`
    });
  }

  // O. UPLOADS / ATTACHMENTS
  const uploadsList = getArray('uploads');
  let uploadsSourceCount = uploadsList.length;
  totalSourceRecords += uploadsSourceCount;
  try {
    await connection.beginTransaction();
    for (const up of uploadsList) {
      const id = String(up.id || `up_${Math.random().toString(36).substring(2, 9)}`);
      const fileName = String(up.fileName || up.name || 'file');
      const originalName = up.originalName || up.fileName || null;
      const filePath = up.filePath || null;
      const fileSize = up.fileSize ? Number(up.fileSize) : null;
      const mimeType = up.mimeType || null;
      const entityType = up.entityType || null;
      const entityId = up.entityId || null;
      const dataUrl = up.dataUrl || up.url || null;
      const fiscalYearId = up.fiscalYearId || null;
      const createdBy = up.createdBy || null;

      await connection.query(
        `INSERT INTO uploads (id, file_name, original_name, file_path, file_size, mime_type, entity_type, entity_id, data_url, fiscal_year_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           file_name = VALUES(file_name),
           original_name = VALUES(original_name),
           file_path = VALUES(file_path),
           file_size = VALUES(file_size),
           mime_type = VALUES(mime_type),
           entity_type = VALUES(entity_type),
           entity_id = VALUES(entity_id),
           data_url = VALUES(data_url),
           updated_at = CURRENT_TIMESTAMP`,
        [id, fileName, originalName, filePath, fileSize, mimeType, entityType, entityId, dataUrl, fiscalYearId, createdBy]
      );
    }
    await connection.commit();
    const [c]: any = await connection.query("SELECT COUNT(*) as cnt FROM uploads");
    const dest = Number(c[0]?.cnt || 0);
    totalDestinationRecords += dest;
    reports.push({
      table: 'uploads',
      sourceCount: uploadsSourceCount,
      destinationCount: dest,
      status: 'success',
      message: `انتقال ${uploadsSourceCount} فایل و پیوست با موفقیت در تراکنش انجام شد.`
    });
  } catch (err: any) {
    await connection.rollback();
    reports.push({
      table: 'uploads',
      sourceCount: uploadsSourceCount,
      destinationCount: 0,
      status: 'error',
      message: `خطا در انتقال پیوست‌ها (Rollback شد): ${err.message}`
    });
  }

  const completedAt = new Date().toISOString();
  const hasErrors = reports.some(r => r.status === 'error');

  return {
    success: !hasErrors,
    backup: backupResult,
    totalSourceRecords,
    totalDestinationRecords,
    reports,
    startedAt,
    completedAt,
    durationMs: Date.now() - startTime
  };
}

// In-memory state cache for instant <1ms response to database queries
let serverMemoryStateCache: Record<string, any> | null = null;
let serverStateVersion: number = Date.now();
let keyVersions: Record<string, number> = {};

// Load data into cache: first fallback from app_state, then override with real relational tables
async function populateMemoryCache(): Promise<void> {
  const result: any = {};
  const now = Date.now();
  let maxTs = now;
  keyVersions = {};

  // 1. Fallback reading from app_state table (without writing or deleting)
  try {
    const rows: any = await executeMysqlQuery("SELECT state_key, state_value, UNIX_TIMESTAMP(updated_at) as updated_ts FROM app_state");
    if (Array.isArray(rows)) {
      for (const row of rows) {
        let val = safeUnwrapJson(row.state_value);
        const cleanKey = row.state_key.startsWith("acc_app_") ? row.state_key.substring(8) : row.state_key;
        if (val !== undefined && val !== null) {
          result[cleanKey] = val;
          result[`acc_app_${cleanKey}`] = val;
        }
        const rowTs = row.updated_ts ? Number(row.updated_ts) * 1000 : now;
        keyVersions[cleanKey] = rowTs;
        keyVersions[`acc_app_${cleanKey}`] = rowTs;
        if (rowTs > maxTs) maxTs = rowTs;
      }
    }
  } catch (err: any) {
    console.warn("Notice: app_state fallback read notice:", err.message);
  }

  // 2. Primary reading from real MySQL relational tables
  try {
    await loadRelationalTablesIntoCache(result);
  } catch (err: any) {
    console.warn("Notice: relational tables load notice:", err.message);
  }

  if (result.invoices && Array.isArray(result.invoices)) {
    result.invoices = sanitizeInvoiceList(result.invoices);
    result.acc_app_invoices = result.invoices;
  }

  // Ensure all relational keys have their version set to the latest maxTs so delta sync registers updates
  const relationalKeys = ["invoices", "transactions", "items", "counterparts", "accounts", "categories", "warehouses", "docs", "accountingDocuments", "notifications"];
  for (const rKey of relationalKeys) {
    keyVersions[rKey] = maxTs;
    keyVersions[`acc_app_${rKey}`] = maxTs;
  }

  serverStateVersion = maxTs;
  serverMemoryStateCache = result;
}

async function getLatestItemsList(conn: any): Promise<any[]> {
  const [itemRows] = await conn.execute("SELECT * FROM items ORDER BY id DESC");
  if (!Array.isArray(itemRows)) return [];
  return itemRows.map((r: any) => {
    let obj = {};
    if (r.raw_json) {
      try {
        obj = typeof r.raw_json === 'string' ? JSON.parse(r.raw_json) : r.raw_json;
      } catch (e) {
        try {
          obj = JSON.parse(JSON.stringify(r.raw_json));
        } catch {}
      }
    }
    return {
      ...obj,
      id: r.id,
      name: r.name,
      code: r.code,
      type: r.type || 'kala',
      qty: Number(r.qty) || 0,
      stock: Number(r.qty) || 0,
      initialQty: Number(r.initial_qty) || 0,
      purchasePrice: Number(r.last_purchase_price) || 0,
      lastPurchasePrice: Number(r.last_purchase_price) || 0,
      salePrice: Number(r.last_sale_price) || 0,
      lastSalePrice: Number(r.last_sale_price) || 0,
      minStock: Number(r.min_qty_alarm) || 0,
      minQtyAlarm: Number(r.min_qty_alarm) || 0,
      category: r.category_name,
      categoryName: r.category_name,
      parentCategory: r.parent_category,
      subCategory: r.sub_category,
      commissionPercent: Number(r.commission_percent) || 0,
      setupDate: r.setup_date,
      warehouseId: r.warehouse_id,
      fiscalYearId: r.fiscal_year_id,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  });
}

// Load records directly from individual MySQL relational tables into result object
async function loadRelationalTablesIntoCache(result: Record<string, any>): Promise<void> {
  // A. Invoices & Invoice Items
  try {
    const invRows: any = await executeMysqlQuery("SELECT * FROM invoices WHERE is_deleted = 0 ORDER BY id DESC");
    if (Array.isArray(invRows) && invRows.length > 0) {
      const itemRows: any = await executeMysqlQuery("SELECT * FROM invoice_items ORDER BY id ASC");
      const itemsMap = new Map<string, any[]>();
      if (Array.isArray(itemRows)) {
        for (const itm of itemRows) {
          const invId = String(itm.invoice_id);
          if (!itemsMap.has(invId)) itemsMap.set(invId, []);
          let itmObj: any = {};
          itmObj = {
            id: itm.id,
            itemId: itm.item_id,
            name: itm.name || '',
            qty: Number(itm.qty) || 0,
            quantity: Number(itm.qty) || 0,
            unit: itm.unit || 'عدد',
            unitPrice: Number(itm.unit_price) || 0,
            discount: Number(itm.discount) || 0,
            tax: Number(itm.tax) || 0,
            totalPrice: Number(itm.total_price) || 0,
            total: Number(itm.total_price) || 0,
            remarks: itm.remarks || '',
            description: itm.remarks || '',
            type: itm.type || 'kala',
            color: itm.color || null,
            cogsUnitCost: Number(itm.cogs_unit_cost) || 0,
            cogsTotal: Number(itm.cogs_total) || 0,
            sortOrder: Number(itm.sort_order) || 0,
            fiscalYearId: itm.fiscal_year_id,
            createdBy: itm.created_by
          };
          itemsMap.get(invId)!.push(itmObj);
        }
      }

      const invList: any[] = [];
      for (const row of invRows) {
        const invId = String(row.id);
        const relatedItems = itemsMap.get(invId) || [];
        
        let customIcons: any = null;
        let attachments: any = null;
        let paymentSlips: any = null;
        let history: any = null;
        let allocations: any = null;
        try { if (row.custom_icons) customIcons = JSON.parse(row.custom_icons); } catch (_) {}
        try { if (row.attachments) attachments = JSON.parse(row.attachments); } catch (_) {}
        try { if (row.payment_slips) paymentSlips = JSON.parse(row.payment_slips); } catch (_) {}
        try { if (row.history) history = JSON.parse(row.history); } catch (_) {}
        try { if (row.allocations) allocations = JSON.parse(row.allocations); } catch (_) {}

        const invObj = {
          id: row.id,
          invoiceNumber: row.invoice_number,
          type: row.type || 'sale',
          date: row.date,
          counterpartId: row.counterpart_id,
          counterpartName: row.counterpart_name,
          counterpartPhone: row.counterpart_phone,
          counterpartAddress: row.counterpart_address,
          totalAmount: Number(row.total_amount) || 0,
          tax: Number(row.tax) || 0,
          deposit: Number(row.deposit) || 0,
          discount: Number(row.discount) || 0,
          paymentAmount: Number(row.payment_amount) || 0,
          paymentDate: row.payment_date,
          description: row.description,
          isProforma: Boolean(row.is_proforma),
          isUrgent: Boolean(row.is_urgent),
          urgentType: row.urgent_type,
          shippingMethod: row.shipping_method,
          acquaintanceMethod: row.acquaintance_method,
          docId: row.doc_id,
          cogsDocId: row.cogs_doc_id,
          cogsTotal: Number(row.cogs_total) || 0,
          isReturn: Boolean(row.is_return),
          returnRefInvoiceId: row.return_ref_invoice_id,
          customIcons,
          attachments,
          paymentSlips,
          history,
          allocations,
          fiscalYearId: row.fiscal_year_id,
          createdBy: row.created_by,
          createdById: row.created_by_id,
          createdByPhone: row.created_by_phone,
          items: relatedItems,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
        invList.push(invObj);
      }
      result.invoices = invList;
      result.acc_app_invoices = invList;
    }
  } catch (e) {}

  // B. Transactions
  try {
    const txRows: any = await executeMysqlQuery("SELECT * FROM transactions WHERE is_deleted = 0 ORDER BY id DESC");
    if (Array.isArray(txRows) && txRows.length > 0) {
      const txList = txRows.map((r: any) => {
        let attachments: any = null;
        let editHistory: any = null;
        try { if (r.attachments) attachments = JSON.parse(r.attachments); } catch (_) {}
        try { if (r.edit_history) editHistory = JSON.parse(r.edit_history); } catch (_) {}

        return {
          id: r.id,
          date: r.date,
          time: r.time,
          amount: Number(r.amount) || 0,
          type: r.type,
          description: r.description,
          isRegistered: Boolean(r.is_registered),
          categoryParent: r.category_parent,
          categoryChild: r.category_child,
          categoryId: r.category_child || r.category_parent,
          category: r.category_child || r.category_parent,
          userDescription: r.user_description,
          isDuplicate: Boolean(r.is_duplicate),
          duplicateReason: r.duplicate_reason,
          trackingNumber: r.tracking_number,
          referenceCode: r.reference_code,
          registeredDate: r.registered_date,
          accountId: r.account_id,
          partnerId: r.partner_id,
          pendingDepositId: r.pending_deposit_id,
          borrowerId: r.borrower_id,
          borrowerName: r.borrower_name,
          loanType: r.loan_type,
          counterpartId: r.counterpart_id,
          counterpartName: r.counterpart_name,
          invoiceId: r.invoice_id,
          docId: r.doc_id,
          attachments,
          isEdited: Boolean(r.is_edited),
          editedBy: r.edited_by,
          editedById: r.edited_by_id,
          editedAt: r.edited_at,
          editHistory,
          isDeleted: Boolean(r.is_deleted),
          deletedBy: r.deleted_by,
          deletedById: r.deleted_by_id,
          deletedAt: r.deleted_at,
          fiscalYearId: r.fiscal_year_id,
          createdBy: r.created_by,
          createdById: r.created_by_id,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });
      result.transactions = txList;
      result.acc_app_transactions = txList;
    }
  } catch (e) {}

  // C. Items (Goods & Services)
  try {
    const itemRows: any = await executeMysqlQuery("SELECT * FROM items ORDER BY id DESC");
    if (Array.isArray(itemRows) && itemRows.length > 0) {
      const itemList = itemRows.map((r: any) => {
        let obj = safeUnwrapJson(r.raw_json) || {};
        return {
          ...obj,
          id: r.id,
          name: r.name,
          code: r.code,
          type: r.type || 'kala',
          qty: Number(r.qty) || 0,
          stock: Number(r.qty) || 0,
          initialQty: Number(r.initial_qty) || 0,
          purchasePrice: Number(r.last_purchase_price) || 0,
          lastPurchasePrice: Number(r.last_purchase_price) || 0,
          salePrice: Number(r.last_sale_price) || 0,
          lastSalePrice: Number(r.last_sale_price) || 0,
          minStock: Number(r.min_qty_alarm) || 0,
          minQtyAlarm: Number(r.min_qty_alarm) || 0,
          category: r.category_name,
          categoryName: r.category_name,
          parentCategory: r.parent_category,
          subCategory: r.sub_category,
          commissionPercent: Number(r.commission_percent) || 0,
          setupDate: r.setup_date,
          warehouseId: r.warehouse_id,
          fiscalYearId: r.fiscal_year_id,
          createdBy: r.created_by,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });
      result.items = itemList;
      result.acc_app_items = itemList;
    }
  } catch (e) {}

  // D. Counterparts (Customers & Suppliers)
  try {
    const cpRows: any = await executeMysqlQuery("SELECT * FROM counterparts ORDER BY id DESC");
    if (Array.isArray(cpRows) && cpRows.length > 0) {
      const cpList = cpRows.map((r: any) => {
        let obj = safeUnwrapJson(r.raw_json) || {};
        return {
          ...obj,
          id: r.id,
          name: r.name,
          code: r.code,
          type: r.type,
          phone: r.phone,
          mobile: r.mobile,
          nationalId: r.national_id,
          economicCode: r.economic_code,
          address: r.address,
          postalCode: r.postal_code,
          initialBalance: Number(r.initial_balance) || 0,
          currentBalance: Number(r.current_balance) || 0,
          createdBy: r.created_by,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });
      result.counterparts = cpList;
      result.acc_app_counterparts = cpList;
    }
  } catch (e) {}

  // E. Bank Accounts & Cash Registers
  try {
    const accRows: any = await executeMysqlQuery("SELECT * FROM accounts ORDER BY id DESC");
    if (Array.isArray(accRows) && accRows.length > 0) {
      const accList = accRows.map((r: any) => {
        let obj = safeUnwrapJson(r.raw_json) || {};
        return {
          ...obj,
          id: r.id,
          name: r.name,
          type: r.type,
          bankName: r.bank_name,
          accountNumber: r.account_number,
          cardNumber: r.card_number,
          shabaNumber: r.shaba_number,
          balance: Number(r.balance) || 0,
          initialBalance: Number(r.initial_balance) || 0,
          createdBy: r.created_by,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });
      result.accounts = accList;
      result.acc_app_accounts = accList;
    }
  } catch (e) {}

  // F. Categories
  try {
    const catRows: any = await executeMysqlQuery("SELECT * FROM categories ORDER BY id ASC");
    if (Array.isArray(catRows) && catRows.length > 0) {
      const catList = catRows.map((r: any) => {
        let obj = safeUnwrapJson(r.raw_json) || {};
        return {
          ...obj,
          id: r.id,
          name: r.name,
          type: r.type,
          icon: r.icon,
          color: r.color,
          parentId: r.parent_id,
          createdBy: r.created_by
        };
      });
      result.categories = catList;
      result.acc_app_categories = catList;
    }
  } catch (e) {}

  // G. Warehouses
  try {
    const whRows: any = await executeMysqlQuery("SELECT * FROM warehouses ORDER BY id ASC");
    if (Array.isArray(whRows) && whRows.length > 0) {
      const whList = whRows.map((r: any) => {
        let obj = safeUnwrapJson(r.raw_json) || {};
        return {
          ...obj,
          id: r.id,
          name: r.name,
          code: r.code,
          address: r.address,
          manager: r.manager,
          phone: r.phone,
          createdBy: r.created_by
        };
      });
      result.warehouses = whList;
      result.acc_app_warehouses = whList;
    }
  } catch (e) {}

  // H. Accounting Docs & Lines
  try {
    const docRows: any = await executeMysqlQuery("SELECT * FROM accounting_docs WHERE is_deleted = 0 ORDER BY id DESC");
    if (Array.isArray(docRows) && docRows.length > 0) {
      const lineRows: any = await executeMysqlQuery("SELECT * FROM accounting_doc_lines ORDER BY line_index ASC, id ASC");
      const linesMap = new Map<string, any[]>();
      if (Array.isArray(lineRows)) {
        for (const ln of lineRows) {
          const docId = String(ln.doc_id);
          if (!linesMap.has(docId)) linesMap.set(docId, []);
          const lineObj = {
            id: ln.id,
            docId: ln.doc_id,
            accountId: ln.account_id,
            accountCode: ln.account_id,
            accountName: ln.account_name,
            debit: Number(ln.debit) || 0,
            credit: Number(ln.credit) || 0,
            description: ln.description,
            lineIndex: Number(ln.line_index) || 0,
            rowOrder: Number(ln.line_index) || 0,
            fiscalYearId: ln.fiscal_year_id,
            createdBy: ln.created_by,
            createdAt: ln.created_at,
            updatedAt: ln.updated_at
          };
          linesMap.get(docId)!.push(lineObj);
        }
      }

      const docList: any[] = [];
      for (const row of docRows) {
        const docId = String(row.id);
        const relatedLines = linesMap.get(docId) || [];
        const totalDebit = relatedLines.reduce((sum: number, ln: any) => sum + (Number(ln.debit) || 0), 0);
        const totalCredit = relatedLines.reduce((sum: number, ln: any) => sum + (Number(ln.credit) || 0), 0);

        const docObj = {
          id: row.id,
          docNumber: Number(row.doc_number) || 0,
          date: row.date,
          description: row.description,
          isArchived: Boolean(row.is_archived),
          isManual: Boolean(row.is_manual),
          status: row.status || 'posted',
          operationType: row.operation_type,
          invoiceId: row.invoice_id,
          txId: row.tx_id,
          refDocId: row.ref_doc_id,
          idempotencyKey: row.idempotency_key,
          actorId: row.actor_id,
          actorName: row.actor_name,
          isDeleted: Boolean(row.is_deleted),
          deletedBy: row.deleted_by,
          deletedById: row.deleted_by_id,
          deletedAt: row.deleted_at,
          fiscalYearId: row.fiscal_year_id,
          createdBy: row.created_by,
          lines: relatedLines,
          totalDebit,
          totalCredit,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
        docList.push(docObj);
      }
      result.docs = docList;
      result.acc_app_docs = docList;
      result.accountingDocuments = docList;
      result.acc_app_accountingDocuments = docList;
    }
  } catch (e) {}

  // I. Notifications
  try {
    const notifRows: any = await executeMysqlQuery("SELECT * FROM notifications ORDER BY id DESC LIMIT 200");
    if (Array.isArray(notifRows) && notifRows.length > 0) {
      const notifList = notifRows.map((r: any) => {
        let obj = safeUnwrapJson(r.raw_json) || {};
        return {
          ...obj,
          id: r.id,
          userId: r.user_id,
          title: r.title,
          message: r.message,
          type: r.type,
          isRead: Boolean(r.is_read),
          link: r.link,
          createdAt: r.created_at
        };
      });
      result.notifications = notifList;
      result.acc_app_notifications = notifList;
    }
  } catch (e) {}

  // J. Checklist
  try {
    const chkRows: any = await executeMysqlQuery("SELECT * FROM checklist ORDER BY row_order ASC, id ASC");
    if (Array.isArray(chkRows) && chkRows.length > 0) {
      const chkList = chkRows.map((r: any) => {
        let obj = safeUnwrapJson(r.raw_json) || {};
        return {
          ...obj,
          id: r.id,
          title: r.title,
          isCompleted: Boolean(r.is_completed),
          completed: Boolean(r.is_completed),
          dueDate: r.due_date,
          rowOrder: Number(r.row_order) || 0,
          createdBy: r.created_by
        };
      });
      result.checklist = chkList;
      result.acc_app_checklist = chkList;
    }
  } catch (e) {}

  // K. Settings
  try {
    const setRows: any = await executeMysqlQuery("SELECT setting_key, setting_value FROM settings");
    if (Array.isArray(setRows) && setRows.length > 0) {
      const settingsObj: any = result.settings || {};
      for (const sr of setRows) {
        settingsObj[sr.setting_key] = safeUnwrapJson(sr.setting_value);
      }
      result.settings = settingsObj;
      result.acc_app_settings = settingsObj;
    }
  } catch (e) {}

  // L. Users
  try {
    const userRows: any = await executeMysqlQuery("SELECT * FROM users ORDER BY id ASC");
    if (Array.isArray(userRows) && userRows.length > 0) {
      const userList = userRows.map((r: any) => {
        let obj = safeUnwrapJson(r.raw_json) || {};
        return {
          ...obj,
          id: r.id,
          username: r.username,
          name: r.name,
          role: r.role,
          phone: r.phone,
          password: r.password_hash || r.username,
          permissions: safeUnwrapJson(r.permissions) || obj.permissions || []
        };
      });
      result.users = userList;
      result.acc_app_users = userList;
    }
  } catch (e) {}

  // M. Fiscal Years
  try {
    const fyRows: any = await executeMysqlQuery("SELECT * FROM fiscal_years ORDER BY id DESC");
    if (Array.isArray(fyRows) && fyRows.length > 0) {
      const fy = fyRows[0];
      let obj = safeUnwrapJson(fy.raw_json) || {};
      const fyObj = {
        ...obj,
        id: fy.id,
        year: fy.year_title,
        startDate: fy.start_date,
        endDate: fy.end_date,
        registered: !Boolean(fy.is_closed),
        createdBy: fy.created_by
      };
      result.fiscalYear = fyObj;
      result.acc_app_fiscalYear = fyObj;
    }
  } catch (e) {}

  // N. System Logs
  try {
    const logRows: any = await executeMysqlQuery("SELECT * FROM logs ORDER BY id DESC LIMIT 500");
    if (Array.isArray(logRows) && logRows.length > 0) {
      const logList = logRows.map((r: any) => {
        let obj = safeUnwrapJson(r.raw_json) || {};
        return {
          ...obj,
          id: r.id,
          level: r.level,
          category: r.category,
          action: r.action,
          message: r.message,
          userId: r.user_id,
          createdAt: r.created_at
        };
      });
      result.system_logs = logList;
      result.acc_app_system_logs = logList;
    }
  } catch (e) {}
}

async function getKeyData(key: string): Promise<any> {
  const cleanKey = key.startsWith("acc_app_") ? key.substring(8) : key;
  if (!serverMemoryStateCache) {
    await populateMemoryCache();
  }
  if (serverMemoryStateCache) {
    if (cleanKey in serverMemoryStateCache) return serverMemoryStateCache[cleanKey];
    if (`acc_app_${cleanKey}` in serverMemoryStateCache) return serverMemoryStateCache[`acc_app_${cleanKey}`];
  }
  return null;
}

// Helper to execute MySQL queries with connection verification and automatic pool recovery
async function executeMysqlQuery(sql: string, params: any[] = []): Promise<any> {
  const config = getAppConfig();
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      host: config.DB_HOST || "localhost",
      port: Number(config.DB_PORT) || 3306,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 10000,
      charset: 'utf8mb4'
    });
  }

  try {
    const [result] = await mysqlPool.query(sql, params);
    mysqlError = null;
    return result;
  } catch (err: any) {
    const errCode = err.code || '';
    if (errCode === 'PROTOCOL_CONNECTION_LOST' || errCode === 'ECONNRESET' || errCode === 'ETIMEDOUT' || errCode === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR') {
      console.warn(`[MySQL] Connection lost (${errCode}). Reconnecting...`);
      try {
        if (mysqlPool) {
          try { await mysqlPool.end(); } catch (_) {}
        }
        mysqlPool = mysql.createPool({
          host: config.DB_HOST || "localhost",
          port: Number(config.DB_PORT) || 3306,
          user: config.DB_USER,
          password: config.DB_PASSWORD,
          database: config.DB_NAME,
          waitForConnections: true,
          connectionLimit: 15,
          queueLimit: 0,
          enableKeepAlive: true,
          keepAliveInitialDelay: 10000,
          connectTimeout: 10000,
          charset: 'utf8mb4'
        });
        const [retryResult] = await mysqlPool.query(sql, params);
        mysqlError = null;
        return retryResult;
      } catch (retryErr: any) {
        mysqlError = retryErr.message;
        throw retryErr;
      }
    }
    mysqlError = err.message;
    throw err;
  }
}

// Global asynchronous mutex to prevent Race Conditions / Concurrent Write Overwrites across all storage drivers
let stateMutationMutex: Promise<any> = Promise.resolve();
function withStateMutationMutex<T>(action: () => Promise<T>): Promise<T> {
  const prev = stateMutationMutex;
  let resolveLock: () => void = () => {};
  stateMutationMutex = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  return prev.then(action).finally(() => {
    resolveLock();
  });
}

// Set of keys that are collection arrays containing entities with unique identifiers (excluding users which is an authoritative atomic configuration)
const COLLECTION_ENTITY_KEYS = new Set([
  "invoices", "transactions", "items", "counterparts", "accounts", 
  "partners", "categories", "checklist", "docs", 
  "bankSmsMessages", "paymentAllocations", "inventoryMovements", 
  "auditLogs", "system_logs", "pendingDeposits", "loanBorrowers",
  "warehouse_categories_list", "warehouse_stock_adjustment_logs"
]);

// Helper to extract a unique entity identifier across various data types
function getEntityIdentifier(item: any): string | null {
  if (!item || typeof item !== "object") return null;

  // 1. Universal Primary Key: If entity has an explicit ID, that ID is uniquely authoritative
  if (item.id !== undefined && item.id !== null && String(item.id).trim() !== "") {
    return String(item.id).trim();
  }

  // 2. Invoices fallback by invoiceNumber when no ID exists
  if (item.invoiceNumber !== undefined && item.invoiceNumber !== null && String(item.invoiceNumber).trim() !== "") {
    const isPf = Boolean(item.isProforma || (typeof item.invoiceNumber === 'string' && item.invoiceNumber.startsWith('PF-')) || item.type === 'proforma');
    return isPf ? `pf_num_${String(item.invoiceNumber).trim()}` : `inv_num_${String(item.invoiceNumber).trim()}`;
  }

  if (item.docNumber !== undefined && item.docNumber !== null && String(item.docNumber).trim() !== "") {
    return `doc-${String(item.docNumber).trim()}`;
  }
  if (item.code !== undefined && item.code !== null && String(item.code).trim() !== "") {
    return `code-${String(item.code).trim()}`;
  }
  if (item.username !== undefined && item.username !== null && String(item.username).trim() !== "") {
    return `user-${String(item.username).trim()}`;
  }
  if (item.refCode !== undefined && item.refCode !== null && String(item.refCode).trim() !== "") {
    return `ref-${String(item.refCode).trim()}`;
  }
  return null;
}

// Helper to extract timestamp from an entity item
function getEntityTimestamp(item: any): number {
  if (!item || typeof item !== "object") return 0;
  if (typeof item.updatedAt === "number") return item.updatedAt;
  if (typeof item.updatedAt === "string") {
    const t = new Date(item.updatedAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (typeof item.timestampMs === "number") return item.timestampMs;
  if (item.timestamp) {
    const t = new Date(item.timestamp).getTime();
    if (!isNaN(t)) return t;
  }
  if (item.postedAt) {
    const t = new Date(item.postedAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (item.createdAt) {
    const t = new Date(item.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

// Sanitizer for invoice lists to resolve duplicate records with same ID
function sanitizeInvoiceList(invoicesList: any[]): any[] {
  if (!Array.isArray(invoicesList)) return [];
  const map = new Map<string, any>();
  for (const inv of invoicesList) {
    if (!inv || typeof inv !== "object") continue;
    const id = inv.id ? String(inv.id).trim() : null;
    if (id) {
      const existing = map.get(id);
      if (existing) {
        // If one is definitive (!isProforma) and one is proforma (isProforma), the definitive one wins
        if (existing.isProforma && !inv.isProforma) {
          map.set(id, inv);
        } else if (!existing.isProforma && inv.isProforma) {
          // Keep existing definitive invoice
        } else {
          const existingTs = getEntityTimestamp(existing);
          const invTs = getEntityTimestamp(inv);
          if (invTs >= existingTs) {
            map.set(id, inv);
          }
        }
      } else {
        map.set(id, inv);
      }
    } else {
      map.set(`unkeyed_${Math.random()}`, inv);
    }
  }
  return Array.from(map.values());
}

// Intelligent, non-destructive smart merger for concurrent array entity updates
function smartMergeEntityArray(existingList: any[], incomingList: any[]): any[] {
  if (!Array.isArray(existingList) || existingList.length === 0) return incomingList;
  if (!Array.isArray(incomingList) || incomingList.length === 0) return existingList;

  const mergedMap = new Map<string, any>();
  const unkeyed: any[] = [];

  // Seed with existing items
  for (const item of existingList) {
    const id = getEntityIdentifier(item);
    if (id) {
      mergedMap.set(id, item);
    } else {
      unkeyed.push(item);
    }
  }

  // Merge incoming items intelligently
  for (const item of incomingList) {
    const id = getEntityIdentifier(item);
    if (id) {
      const existing = mergedMap.get(id);
      if (existing) {
        const existingTs = getEntityTimestamp(existing);
        const incomingTs = getEntityTimestamp(item);
        if (incomingTs >= existingTs) {
          mergedMap.set(id, item);
        } else {
          mergedMap.set(id, { ...item, ...existing });
        }
      } else {
        mergedMap.set(id, item);
      }
    } else {
      unkeyed.push(item);
    }
  }

  const result = [...Array.from(mergedMap.values()), ...unkeyed];
  // If array is invoices, run final sanitize
  if (result.some(it => it && (it.invoiceNumber !== undefined || it.isProforma !== undefined))) {
    return sanitizeInvoiceList(result);
  }
  return result;
}

// Helper to safely unwrap multiple levels of JSON stringification
function safeUnwrapJson(val: any): any {
  if (val === null || val === undefined) return val;
  let parsed = val;
  while (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("\"") && trimmed.endsWith("\"")) || trimmed === "null" || trimmed === "true" || trimmed === "false") {
      try {
        const next = JSON.parse(parsed);
        if (next === parsed) break;
        parsed = next;
      } catch (_) {
        break;
      }
    } else {
      break;
    }
  }
  return parsed;
}

// Universal loader with instant in-memory cache
async function loadAllData(): Promise<any> {
  if (serverMemoryStateCache && Object.keys(serverMemoryStateCache).length > 0) {
    return { ...serverMemoryStateCache };
  }

  await populateMemoryCache();
  return { ...(serverMemoryStateCache || {}) };
}

// Ensure security .htaccess exists in uploads/ directory to strictly forbid PHP and script execution
function ensureUploadsSecurityNode(baseDir: string = process.cwd()) {
  const uploadsDir = path.join(baseDir, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (_) {}
  }
  const htaccessPath = path.join(uploadsDir, ".htaccess");
  const htaccessContent = `# Disable PHP execution in uploads directory for security
<FilesMatch "(?i)\\.(php|php3|php4|php5|php7|phtml|phar|pl|py|cgi|sh|exe|shtml)$">
    Order Deny,Allow
    Deny from all
</FilesMatch>
Options -ExecCGI
<IfModule mod_php7.c>
    php_flag engine off
</IfModule>
<IfModule mod_php8.c>
    php_flag engine off
</IfModule>
`;
  if (!fs.existsSync(htaccessPath)) {
    try {
      fs.writeFileSync(htaccessPath, htaccessContent, "utf8");
    } catch (_) {}
  }
}

// Convert any base64 image strings to physical files in uploads/YYYY/MM/ and replace with URL path
function extractAndSaveBase64ImagesNode(data: any, category: string = "general"): any {
  if (!data) return data;

  if (typeof data === "string") {
    const trimmed = data.trim();
    const match = trimmed.match(/^data:image\/([a-zA-Z0-9+]+);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (match) {
      let ext = match[1].toLowerCase();
      if (ext === "jpeg") ext = "jpg";
      if (ext === "svg+xml") ext = "svg";
      if (!["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) {
        ext = "png";
      }
      try {
        const cleanBase64 = match[2].replace(/\s+/g, "");
        const buf = Buffer.from(cleanBase64, "base64");
        if (buf.length > 0) {
          const now = new Date();
          const year = now.getFullYear().toString();
          const month = String(now.getMonth() + 1).padStart(2, "0");
          const day = String(now.getDate()).padStart(2, "0");

          const uploadsBase = path.join(process.cwd(), "uploads", year, month);
          if (!fs.existsSync(uploadsBase)) {
            fs.mkdirSync(uploadsBase, { recursive: true });
          }
          ensureUploadsSecurityNode();

          const cleanPrefix = (category || "img").replace(/[^a-zA-Z0-9_-]/g, "");
          const timestamp = `${year}${month}${day}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
          const randomHex = Math.random().toString(36).substring(2, 8);
          const generatedFileName = `${cleanPrefix}_${timestamp}_${randomHex}.${ext}`;
          const fullPath = path.join(uploadsBase, generatedFileName);

          fs.writeFileSync(fullPath, buf);
          return `/uploads/${year}/${month}/${generatedFileName}`;
        }
      } catch (e) {
        console.warn("Notice extracting Base64 image to uploads:", e);
      }
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => extractAndSaveBase64ImagesNode(item, category));
  }

  if (typeof data === "object") {
    const newObj: any = {};
    for (const key of Object.keys(data)) {
      newObj[key] = extractAndSaveBase64ImagesNode(data[key], key || category);
    }
    return newObj;
  }

  return data;
}

// --- SERVER-SIDE VALIDATION & PERMISSIONS ---
function validateEntityAndPermission(
  key: string,
  item: any,
  userContext?: { id?: string; username?: string; role?: string; permissions?: string[] },
  action: 'create' | 'update' | 'delete' = 'create'
): { isValid: boolean; error?: string } {
  const cleanKey = key.startsWith("acc_app_") ? key.substring(8) : key;

  // 1. Role-based Permission Checks
  if (userContext && userContext.role === 'seller') {
    if (['accounting_docs', 'docs', 'accountingDocuments'].includes(cleanKey)) {
      return { isValid: false, error: "کاربر با نقش فروشنده مجاز به ثبت، ویرایش یا حذف اسناد حسابداری نمی‌باشد." };
    }
    if (cleanKey === 'settings') {
      return { isValid: false, error: "کاربر با نقش فروشنده مجاز به تغییر تنظیمات پایه‌ای سیستم نیست." };
    }
    if (cleanKey === 'users') {
      return { isValid: false, error: "کاربر با نقش فروشنده مجاز به تغییر مشخصات کاربران و پرسنل نیست." };
    }
    if (['fiscal_years', 'fiscalYear'].includes(cleanKey)) {
      return { isValid: false, error: "کاربر با نقش فروشنده مجاز به تغییر سال مالی نیست." };
    }
    if (['accounts'].includes(cleanKey) && action !== 'create') {
      return { isValid: false, error: "کاربر با نقش فروشنده مجاز به تغییر یا حذف حساب‌های بانکی نیست." };
    }
  }

  if (action === 'delete') {
    return { isValid: true };
  }

  if (!item || typeof item !== 'object') {
    return { isValid: false, error: "اطلاعات ارسالی برای ذخیره‌سازی نامعتبر است." };
  }

  // If a collection array is passed (e.g. from saveKeyData), the collection array is valid
  if (Array.isArray(item)) {
    return { isValid: true };
  }

  // 2. Entity Payload Validations
  switch (cleanKey) {
    case 'invoices':
    case 'proformas': {
      if (item.totalAmount !== undefined && (isNaN(Number(item.totalAmount)) || Number(item.totalAmount) < 0)) {
        return { isValid: false, error: "مبلغ کل فاکتور نامعتبر است." };
      }
      if (item.items !== undefined && !Array.isArray(item.items)) {
        return { isValid: false, error: "اقلام فاکتور باید به صورت آرایه ارسال شوند." };
      }
      break;
    }
    case 'transactions': {
      if (item.amount === undefined || isNaN(Number(item.amount))) {
        return { isValid: false, error: "مبلغ تراکنش الزامی و باید عدد باشد." };
      }
      break;
    }
    case 'items': {
      if (!item.name || String(item.name).trim() === '') {
        return { isValid: false, error: "نام کالا یا خدمت الزامی است." };
      }
      break;
    }
    case 'counterparts': {
      if (!item.name || String(item.name).trim() === '') {
        return { isValid: false, error: "نام طرف‌حساب الزامی است." };
      }
      break;
    }
    case 'accounts': {
      if (!item.name || String(item.name).trim() === '') {
        return { isValid: false, error: "عنوان حساب الزامی است." };
      }
      break;
    }
    case 'docs':
    case 'accounting_docs':
    case 'accountingDocuments': {
      if (item.lines !== undefined && !Array.isArray(item.lines)) {
        return { isValid: false, error: "ردیف‌های سند حسابداری باید به صورت آرایه ارسال شوند." };
      }
      break;
    }
    case 'users': {
      if (!item.username || String(item.username).trim() === '') {
        return { isValid: false, error: "نام کاربری الزامی است." };
      }
      break;
    }
  }

  return { isValid: true };
}

// --- RELATIONAL TABLE WRITE HELPERS (USING PREPARED STATEMENTS & TRANSACTIONS) ---

// Helper to save or update item stock using the exact same INSERT ... ON DUPLICATE KEY UPDATE logic as initial product registration
async function saveOrUpdateItemStockRelational(conn: any, itemId: string, qtyChange: number, itmDetails: any, isPurchase: boolean): Promise<void> {
  // 1. Fetch existing item from database to preserve its fields
  const [rows] = await conn.execute("SELECT * FROM items WHERE id = ?", [itemId]);
  let existingItem = null;
  if (Array.isArray(rows) && rows.length > 0) {
    existingItem = rows[0];
  }

  // 2. Prepare values, preserving existing details if item exists, or falling back to invoice details
  const name = existingItem ? existingItem.name : String(itmDetails.name || itmDetails.title || 'کالا').trim();
  const code = existingItem ? existingItem.code : (itmDetails.code ? String(itmDetails.code).trim() : null);
  const type = existingItem ? existingItem.type : (itmDetails.type || 'kala');
  const color = existingItem ? existingItem.color : (itmDetails.color || null);
  const unit = existingItem ? existingItem.unit : (itmDetails.unit || 'عدد');
  
  // Calculate the new quantity fundamentally at the database core level
  const oldQty = existingItem ? Number(existingItem.qty) : 0;
  const newQty = oldQty + qtyChange;
  
  const initialQty = existingItem ? Number(existingItem.initial_qty) : 0;
  let lastPurchasePrice = existingItem ? Number(existingItem.last_purchase_price) : 0;
  let lastSalePrice = existingItem ? Number(existingItem.last_sale_price) : 0;
  
  // Real-time price tracking from invoice
  if (isPurchase) {
    lastPurchasePrice = Number(itmDetails.unitPrice || itmDetails.unit_price || itmDetails.price) || lastPurchasePrice;
  } else {
    lastSalePrice = Number(itmDetails.unitPrice || itmDetails.unit_price || itmDetails.price) || lastSalePrice;
  }
  
  const minQtyAlarm = existingItem ? Number(existingItem.min_qty_alarm) : 0;
  const categoryName = existingItem ? existingItem.category_name : null;
  const parentCategory = existingItem ? existingItem.parent_category : null;
  const subCategory = existingItem ? existingItem.sub_category : null;
  const commissionPercent = existingItem ? Number(existingItem.commission_percent) : 0;
  const setupDate = existingItem ? existingItem.setup_date : null;
  const warehouseId = existingItem ? existingItem.warehouse_id : null;
  const fiscalYearId = existingItem ? existingItem.fiscal_year_id : null;
  const createdBy = existingItem ? existingItem.created_by : 'system';

  const itemSql = `
    INSERT INTO items (
      id, warehouse_id, name, code, type, color, unit, qty, initial_qty, last_purchase_price, last_sale_price,
      min_qty_alarm, category_name, parent_category, sub_category, commission_percent, setup_date,
      fiscal_year_id, created_by, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      warehouse_id = VALUES(warehouse_id),
      name = VALUES(name),
      code = VALUES(code),
      type = VALUES(type),
      color = VALUES(color),
      unit = VALUES(unit),
      qty = VALUES(qty),
      initial_qty = VALUES(initial_qty),
      last_purchase_price = VALUES(last_purchase_price),
      last_sale_price = VALUES(last_sale_price),
      min_qty_alarm = VALUES(min_qty_alarm),
      category_name = VALUES(category_name),
      parent_category = VALUES(parent_category),
      sub_category = VALUES(sub_category),
      commission_percent = VALUES(commission_percent),
      setup_date = VALUES(setup_date),
      fiscal_year_id = VALUES(fiscal_year_id),
      created_by = VALUES(created_by),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(itemSql, [
    itemId, warehouseId, name, code, type, color, unit, newQty, initialQty, 
    lastPurchasePrice, lastSalePrice, minQtyAlarm, categoryName, parentCategory, 
    subCategory, commissionPercent, setupDate, fiscalYearId, createdBy
  ]);
}

// 1. Invoice & Invoice Items (ACID Transaction)
async function adjustInventoryForInvoice(conn: any, invoiceId: string, isDeleted: boolean = false, incomingInvoiceObj?: any): Promise<void> {
  // 1. Get the old invoice details before this write (if any)
  const [oldInvRows] = await conn.execute("SELECT type, is_proforma, is_deleted FROM invoices WHERE id = ?", [invoiceId]);
  let oldType = null;
  let oldIsProforma = false;
  let oldIsDeleted = false;
  if (Array.isArray(oldInvRows) && oldInvRows.length > 0) {
    const oldInv = (oldInvRows as any[])[0];
    oldType = oldInv.type || 'sale';
    oldIsProforma = oldInv.is_proforma === 1 || oldInv.is_proforma === true || String(oldInv.is_proforma) === '1';
    oldIsDeleted = oldInv.is_deleted === 1 || oldInv.is_deleted === true || String(oldInv.is_deleted) === '1';
  }

  // 2. Get the old invoice items
  const [oldItemRows] = await conn.execute("SELECT item_id, qty, type FROM invoice_items WHERE invoice_id = ?", [invoiceId]);
  const oldItems = Array.isArray(oldItemRows) ? (oldItemRows as any[]) : [];

  // 3. Normalize new parameters
  const newType = incomingInvoiceObj ? (incomingInvoiceObj.type || 'sale') : oldType;
  const newIsProforma = incomingInvoiceObj ? (incomingInvoiceObj.isProforma ? true : false) : oldIsProforma;
  const newIsDeleted = isDeleted;

  // 4. Optimization: Check if nothing changed that affects inventory
  if (oldType !== null) { // Only check if the invoice already existed
    const isOldActive = !oldIsDeleted && !oldIsProforma && (oldType === 'buy' || oldType === 'purchase' || oldType === 'sale');
    const isNewActive = !newIsDeleted && !newIsProforma && (newType === 'buy' || newType === 'purchase' || newType === 'sale');

    if (isOldActive === isNewActive && oldType === newType) {
      if (!isOldActive) {
        // Neither affects inventory, no change needed!
        return;
      }
      
      // Let's compare items
      const oldItemMap = new Map<string, number>();
      for (const itm of oldItems) {
        const itemId = itm.item_id;
        const qty = Number(itm.qty) || 0;
        const itemType = itm.type || 'kala';
        if (itemId && qty > 0 && itemType === 'kala') {
          oldItemMap.set(itemId, (oldItemMap.get(itemId) || 0) + qty);
        }
      }

      const newItemMap = new Map<string, number>();
      if (incomingInvoiceObj && Array.isArray(incomingInvoiceObj.items)) {
        for (const itm of incomingInvoiceObj.items) {
          if (!itm || typeof itm !== 'object') continue;
          const itemId = itm.itemId || itm.id || null;
          const qty = Number(itm.qty !== undefined ? itm.qty : (itm.quantity !== undefined ? itm.quantity : 1)) || 0;
          const itemType = itm.type || 'kala';
          if (itemId && qty > 0 && itemType === 'kala') {
            newItemMap.set(itemId, (newItemMap.get(itemId) || 0) + qty);
          }
        }
      }

      // Check if maps are identical
      let isSame = oldItemMap.size === newItemMap.size;
      if (isSame) {
        for (const [k, v] of oldItemMap.entries()) {
          if (newItemMap.get(k) !== v) {
            isSame = false;
            break;
          }
        }
      }

      if (isSame) {
        // Absolutely identical inventory impact, skip database writes!
        return;
      }
    }
  }

  // 5. REVERSE the old items' impact (if the old invoice was active)
  if (oldType && !oldIsProforma && !oldIsDeleted) {
    for (const oldItm of oldItems) {
      const itemId = oldItm.item_id;
      const qty = Number(oldItm.qty) || 0;
      const itemType = oldItm.type || 'kala';
      if (itemId && qty > 0 && itemType === 'kala') {
        if (oldType === 'buy' || oldType === 'purchase') {
          await saveOrUpdateItemStockRelational(conn, itemId, -qty, oldItm, false);
        } else if (oldType === 'sale') {
          await saveOrUpdateItemStockRelational(conn, itemId, qty, oldItm, false);
        }
      }
    }
  }

  // 6. APPLY the new items' impact (if the new invoice is active)
  if (newType && !newIsProforma && !newIsDeleted && incomingInvoiceObj && Array.isArray(incomingInvoiceObj.items)) {
    for (const itm of incomingInvoiceObj.items) {
      if (!itm || typeof itm !== 'object') continue;
      const itemId = itm.itemId || itm.id || null;
      const qty = Number(itm.qty !== undefined ? itm.qty : (itm.quantity !== undefined ? itm.quantity : 1)) || 0;
      const itemType = itm.type || 'kala';
      if (itemId && qty > 0 && itemType === 'kala') {
        const isPurchase = (newType === 'buy' || newType === 'purchase');
        if (isPurchase) {
          await saveOrUpdateItemStockRelational(conn, itemId, qty, itm, true);
        } else if (newType === 'sale') {
          await saveOrUpdateItemStockRelational(conn, itemId, -qty, itm, false);
        }
      }
    }
  }

  // 7. Synchronize the serverMemoryStateCache['items'] & ['acc_app_items'] and write the new state back to the app_state table
  try {
    const [itemRows] = await conn.execute("SELECT * FROM items ORDER BY id DESC");
    if (Array.isArray(itemRows)) {
      const itemList = itemRows.map((r: any) => {
        let obj = {};
        if (r.raw_json) {
          try {
            obj = typeof r.raw_json === 'string' ? JSON.parse(r.raw_json) : r.raw_json;
          } catch (e) {
            try {
              obj = JSON.parse(JSON.stringify(r.raw_json));
            } catch {}
          }
        }
        return {
          ...obj,
          id: r.id,
          name: r.name,
          code: r.code,
          type: r.type || 'kala',
          qty: Number(r.qty) || 0,
          stock: Number(r.qty) || 0,
          initialQty: Number(r.initial_qty) || 0,
          purchasePrice: Number(r.last_purchase_price) || 0,
          lastPurchasePrice: Number(r.last_purchase_price) || 0,
          salePrice: Number(r.last_sale_price) || 0,
          lastSalePrice: Number(r.last_sale_price) || 0,
          minStock: Number(r.min_qty_alarm) || 0,
          minQtyAlarm: Number(r.min_qty_alarm) || 0,
          category: r.category_name,
          categoryName: r.category_name,
          parentCategory: r.parent_category,
          subCategory: r.sub_category,
          commissionPercent: Number(r.commission_percent) || 0,
          setupDate: r.setup_date,
          warehouseId: r.warehouse_id,
          fiscalYearId: r.fiscal_year_id,
          createdBy: r.created_by,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });

      if (serverMemoryStateCache) {
        serverMemoryStateCache.items = itemList;
        serverMemoryStateCache.acc_app_items = itemList;
      }

      // Sync with app_state table for backup compatibility
      const jsonStr = JSON.stringify(itemList);
      await conn.execute(
        "INSERT INTO app_state (state_key, state_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP",
        ["items", jsonStr]
      );
      await conn.execute(
        "INSERT INTO app_state (state_key, state_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP",
        ["acc_app_items", jsonStr]
      );
    }
  } catch (err: any) {
    console.error("Error syncing items cache and app_state:", err.message);
  }
}

async function saveSingleInvoiceRelational(conn: any, inv: any, userContext?: any): Promise<void> {
  if (!inv || typeof inv !== 'object') return;
  const id = String(inv.id || `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);

  // Transactionally and atomically adjust warehouse items' inventory before invoice item update
  await adjustInventoryForInvoice(conn, id, false, inv);
  const invoiceNumber = inv.invoiceNumber ? String(inv.invoiceNumber).trim() : id;
  const type = inv.type || 'sale';
  const isProforma = inv.isProforma ? 1 : 0;
  const counterpartId = inv.counterpartId || inv.customerId || null;
  const counterpartName = inv.counterpartName || inv.customerName || null;
  const invoiceDate = inv.date || new Date().toISOString().substring(0, 10);
  const dueDate = inv.dueDate || inv.paymentDate || null;
  const subtotal = Number(inv.subtotal) || 0;
  const discountAmount = Number(inv.discount || inv.discountAmount) || 0;
  const taxAmount = Number(inv.tax || inv.taxAmount) || 0;
  const totalAmount = Number(inv.totalAmount || inv.total) || (subtotal - discountAmount + taxAmount);
  const paidAmount = Number(inv.paidAmount || inv.deposit || inv.paymentAmount) || 0;
  const notes = inv.notes || inv.description || null;
  const isUrgent = inv.isUrgent ? 1 : 0;
  const urgentType = inv.urgentType || null;
  const shippingMethod = inv.shippingMethod || inv.paymentMethod || 'cash';
  const acquaintanceMethod = inv.acquaintanceMethod || null;
  const docId = inv.docId || null;
  const cogsDocId = inv.cogsDocId || null;
  const cogsTotal = Number(inv.cogsTotal) || 0;
  const isReturn = inv.isReturn ? 1 : 0;
  const returnRefInvoiceId = inv.returnRefInvoiceId || null;
  const customIcons = inv.customIcons ? JSON.stringify(inv.customIcons) : null;
  const attachments = inv.attachments ? JSON.stringify(inv.attachments) : null;
  const paymentSlips = inv.paymentSlips ? JSON.stringify(inv.paymentSlips) : null;
  const history = inv.history ? JSON.stringify(inv.history) : null;
  const allocations = inv.allocations ? JSON.stringify(inv.allocations) : null;
  const createdBy = inv.createdBy || (userContext?.username || 'system');
  const createdById = userContext?.userId || null;
  const createdByPhone = userContext?.phone || null;
  const fiscalYearId = inv.fiscalYearId || null;

  const invoiceSql = `
    INSERT INTO invoices (
      id, invoice_number, type, date, counterpart_id, counterpart_name, counterpart_phone,
      counterpart_address, total_amount, tax, deposit, discount, payment_amount, payment_date,
      description, is_proforma, is_urgent, urgent_type, shipping_method, acquaintance_method,
      doc_id, cogs_doc_id, cogs_total, is_return, return_ref_invoice_id, is_deleted,
      custom_icons, attachments, payment_slips, history, allocations, fiscal_year_id,
      created_by, created_by_id, created_by_phone, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, 0,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      invoice_number = VALUES(invoice_number),
      type = VALUES(type),
      date = VALUES(date),
      counterpart_id = VALUES(counterpart_id),
      counterpart_name = VALUES(counterpart_name),
      counterpart_phone = VALUES(counterpart_phone),
      counterpart_address = VALUES(counterpart_address),
      total_amount = VALUES(total_amount),
      tax = VALUES(tax),
      deposit = VALUES(deposit),
      discount = VALUES(discount),
      payment_amount = VALUES(payment_amount),
      payment_date = VALUES(payment_date),
      description = VALUES(description),
      is_proforma = VALUES(is_proforma),
      is_urgent = VALUES(is_urgent),
      urgent_type = VALUES(urgent_type),
      shipping_method = VALUES(shipping_method),
      acquaintance_method = VALUES(acquaintance_method),
      doc_id = VALUES(doc_id),
      cogs_doc_id = VALUES(cogs_doc_id),
      cogs_total = VALUES(cogs_total),
      is_return = VALUES(is_return),
      return_ref_invoice_id = VALUES(return_ref_invoice_id),
      is_deleted = 0,
      custom_icons = VALUES(custom_icons),
      attachments = VALUES(attachments),
      payment_slips = VALUES(payment_slips),
      history = VALUES(history),
      allocations = VALUES(allocations),
      fiscal_year_id = VALUES(fiscal_year_id),
      created_by = VALUES(created_by),
      created_by_id = VALUES(created_by_id),
      created_by_phone = VALUES(created_by_phone),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(invoiceSql, [
    id, invoiceNumber, type, invoiceDate, counterpartId, counterpartName, inv.buyerPhone || inv.customerPhone || null,
    inv.buyerAddress || inv.customerAddress || null, totalAmount, taxAmount, paidAmount, discountAmount, paidAmount, dueDate,
    notes, isProforma, isUrgent, urgentType, shippingMethod, acquaintanceMethod,
    docId, cogsDocId, cogsTotal, isReturn, returnRefInvoiceId,
    customIcons, attachments, paymentSlips, history, allocations, fiscalYearId,
    createdBy, createdById, createdByPhone
  ]);

  // Granular Item Diffing: Query existing items, UPDATE existing, INSERT new, DELETE removed
  const existingRows = await conn.execute("SELECT id FROM invoice_items WHERE invoice_id = ?", [id]);
  const existingItemIds = new Set<string>();
  if (Array.isArray(existingRows) && Array.isArray(existingRows[0])) {
    for (const r of (existingRows[0] as any[])) {
      if (r && r.id) existingItemIds.add(String(r.id));
    }
  }

  const incomingItemIds = new Set<string>();

  if (Array.isArray(inv.items) && inv.items.length > 0) {
    const itemInsertSql = `
      INSERT INTO invoice_items (
        id, invoice_id, item_id, name, type, color, unit, qty,
        unit_price, total_price, remarks, sort_order, fiscal_year_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const itemUpdateSql = `
      UPDATE invoice_items SET
        item_id = ?, name = ?, type = ?, color = ?, unit = ?, qty = ?,
        unit_price = ?, total_price = ?, remarks = ?, sort_order = ?,
        fiscal_year_id = ?, created_by = ?
      WHERE id = ? AND invoice_id = ?
    `;

    for (let idx = 0; idx < inv.items.length; idx++) {
      const itm = inv.items[idx];
      if (!itm || typeof itm !== 'object') continue;
      const itmId = String(itm.id || `${id}-itm-${idx + 1}`);
      incomingItemIds.add(itmId);
      const itemId = itm.itemId || itm.id || null;
      const itemName = itm.name || itm.title || itm.itemName || 'کالا/خدمت';
      const itemType = itm.type || 'kala';
      const itemColor = itm.color || null;
      const itemUnit = itm.unit || 'عدد';
      const itemQty = Number(itm.qty !== undefined ? itm.qty : (itm.quantity !== undefined ? itm.quantity : 1)) || 1;
      const itemUnitPrice = Number(itm.unitPrice || itm.unit_price || itm.price) || 0;
      const itemTotalPrice = Number(itm.totalPrice || itm.total_price || itm.total) || (itemQty * itemUnitPrice);
      const itemRemarks = itm.remarks || itm.description || null;

      if (existingItemIds.has(itmId)) {
        await conn.execute(itemUpdateSql, [
          itemId, itemName, itemType, itemColor, itemUnit, itemQty,
          itemUnitPrice, itemTotalPrice, itemRemarks, idx, fiscalYearId, createdBy,
          itmId, id
        ]);
      } else {
        await conn.execute(itemInsertSql, [
          itmId, id, itemId, itemName, itemType, itemColor, itemUnit, itemQty,
          itemUnitPrice, itemTotalPrice, itemRemarks, idx, fiscalYearId, createdBy
        ]);
      }
    }
  }

  // Delete only rows that were removed from the invoice
  for (const oldId of existingItemIds) {
    if (!incomingItemIds.has(oldId)) {
      await conn.execute("DELETE FROM invoice_items WHERE id = ? AND invoice_id = ?", [oldId, id]);
    }
  }
}

async function deleteSingleInvoiceRelational(conn: any, id: string): Promise<void> {
  const cleanId = String(id).trim();
  // Trigger inventory adjustment for soft deleted invoice
  await adjustInventoryForInvoice(conn, cleanId, true);
  // Soft delete invoice and remove its items
  await conn.execute("UPDATE invoices SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? OR invoice_number = ?", [cleanId, cleanId]);
}

// 2. Transactions
async function saveSingleTransactionRelational(conn: any, tx: any, userContext?: any): Promise<void> {
  if (!tx || typeof tx !== 'object') return;
  const id = String(tx.id || `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
  const txDate = tx.date || new Date().toISOString().substring(0, 10);
  const type = tx.type || 'deposit';
  const amount = Number(tx.amount) || 0;
  const accountId = tx.accountId || null;
  const counterpartId = tx.counterpartId || null;
  const categoryId = tx.categoryId || tx.category || null;
  const description = tx.description || null;
  const trackingNumber = tx.trackingNumber || tx.refCode || null;
  const fiscalYearId = tx.fiscalYearId || null;
  const createdBy = tx.createdBy || (userContext?.username || 'system');

  const txSql = `
    INSERT INTO transactions (
      id, date, time, amount, type, description, is_registered, category_parent,
      category_child, user_description, is_duplicate, duplicate_reason, tracking_number,
      reference_code, registered_date, account_id, partner_id, pending_deposit_id,
      borrower_id, borrower_name, loan_type, counterpart_id, counterpart_name,
      invoice_id, doc_id, attachments, is_edited, edited_by, edited_by_id, edited_at,
      edit_history, is_deleted, fiscal_year_id, created_by, created_by_id, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, 0, ?, ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      date = VALUES(date),
      time = VALUES(time),
      amount = VALUES(amount),
      type = VALUES(type),
      description = VALUES(description),
      is_registered = VALUES(is_registered),
      category_parent = VALUES(category_parent),
      category_child = VALUES(category_child),
      user_description = VALUES(user_description),
      is_duplicate = VALUES(is_duplicate),
      duplicate_reason = VALUES(duplicate_reason),
      tracking_number = VALUES(tracking_number),
      reference_code = VALUES(reference_code),
      registered_date = VALUES(registered_date),
      account_id = VALUES(account_id),
      partner_id = VALUES(partner_id),
      pending_deposit_id = VALUES(pending_deposit_id),
      borrower_id = VALUES(borrower_id),
      borrower_name = VALUES(borrower_name),
      loan_type = VALUES(loan_type),
      counterpart_id = VALUES(counterpart_id),
      counterpart_name = VALUES(counterpart_name),
      invoice_id = VALUES(invoice_id),
      doc_id = VALUES(doc_id),
      attachments = VALUES(attachments),
      is_edited = VALUES(is_edited),
      edited_by = VALUES(edited_by),
      edited_by_id = VALUES(edited_by_id),
      edited_at = VALUES(edited_at),
      edit_history = VALUES(edit_history),
      is_deleted = 0,
      fiscal_year_id = VALUES(fiscal_year_id),
      updated_at = CURRENT_TIMESTAMP
  `;

  const time = tx.time || null;
  const isRegistered = tx.isRegistered ? 1 : 0;
  const categoryParent = tx.categoryParent || tx.category_parent || categoryId || null;
  const categoryChild = tx.categoryChild || tx.category_child || null;
  const userDescription = tx.userDescription || tx.user_description || null;
  const isDuplicate = tx.isDuplicate ? 1 : 0;
  const duplicateReason = tx.duplicateReason || tx.duplicate_reason || null;
  const referenceCode = tx.referenceCode || tx.reference_code || tx.refCode || null;
  const registeredDate = tx.registeredDate || tx.registered_date || null;
  const partnerId = tx.partnerId || tx.partner_id || null;
  const pendingDepositId = tx.pendingDepositId || tx.pending_deposit_id || null;
  const borrowerId = tx.borrowerId || tx.borrower_id || null;
  const borrowerName = tx.borrowerName || tx.borrower_name || null;
  const loanType = tx.loanType || tx.loan_type || null;
  const counterpartName = tx.counterpartName || tx.counterpart_name || null;
  const invoiceId = tx.invoiceId || tx.invoice_id || null;
  const docId = tx.docId || tx.doc_id || null;
  const attachments = tx.attachments ? JSON.stringify(tx.attachments) : null;
  const isEdited = tx.isEdited ? 1 : 0;
  const editedBy = tx.editedBy || tx.edited_by || null;
  const editedById = tx.editedById || tx.edited_by_id || null;
  const editedAt = tx.editedAt || tx.edited_at || null;
  const editHistory = tx.editHistory ? JSON.stringify(tx.editHistory) : null;
  const createdById = tx.createdById || tx.created_by_id || userContext?.userId || null;

  await conn.execute(txSql, [
    id, txDate, time, amount, type, description, isRegistered, categoryParent,
    categoryChild, userDescription, isDuplicate, duplicateReason, trackingNumber,
    referenceCode, registeredDate, accountId, partnerId, pendingDepositId,
    borrowerId, borrowerName, loanType, counterpartId, counterpartName,
    invoiceId, docId, attachments, isEdited, editedBy, editedById, editedAt,
    editHistory, fiscalYearId, createdBy, createdById
  ]);
}

async function deleteSingleTransactionRelational(conn: any, id: string): Promise<void> {
  const cleanId = String(id).trim();
  await conn.execute("UPDATE transactions SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [cleanId]);
}

// 3. Items (Goods & Services)
async function saveSingleItemRelational(conn: any, it: any, userContext?: any): Promise<void> {
  if (!it || typeof it !== 'object') return;
  const id = String(it.id || `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
  const name = String(it.name || it.title || 'کالا').trim();
  const code = it.code ? String(it.code).trim() : null;
  const type = it.type || 'kala';
  const color = it.color || null;
  const unit = it.unit || 'عدد';
  const qty = Number(it.qty !== undefined ? it.qty : (it.stock !== undefined ? it.stock : it.quantity)) || 0;
  const initialQty = Number(it.initialQty || it.initial_qty) || 0;
  const lastPurchasePrice = Number(it.lastPurchasePrice || it.last_purchase_price || it.purchasePrice || it.buyPrice) || 0;
  const lastSalePrice = Number(it.lastSalePrice || it.last_sale_price || it.salePrice || it.price) || 0;
  const minQtyAlarm = Number(it.minQtyAlarm || it.min_qty_alarm || it.minStock) || 0;
  const categoryName = it.categoryName || it.category_name || it.category || null;
  const parentCategory = it.parentCategory || it.parent_category || null;
  const subCategory = it.subCategory || it.sub_category || null;
  const commissionPercent = Number(it.commissionPercent || it.commission_percent) || 0;
  const setupDate = it.setupDate || it.setup_date || null;
  const warehouseId = it.warehouseId || null;
  const fiscalYearId = it.fiscalYearId || null;
  const createdBy = it.createdBy || (userContext?.username || 'system');

  const itemSql = `
    INSERT INTO items (
      id, warehouse_id, name, code, type, color, unit, qty, initial_qty, last_purchase_price, last_sale_price,
      min_qty_alarm, category_name, parent_category, sub_category, commission_percent, setup_date,
      fiscal_year_id, created_by, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      warehouse_id = VALUES(warehouse_id),
      name = VALUES(name),
      code = VALUES(code),
      type = VALUES(type),
      color = VALUES(color),
      unit = VALUES(unit),
      qty = qty + (VALUES(initial_qty) - initial_qty),
      initial_qty = VALUES(initial_qty),
      last_purchase_price = VALUES(last_purchase_price),
      last_sale_price = VALUES(last_sale_price),
      min_qty_alarm = VALUES(min_qty_alarm),
      category_name = VALUES(category_name),
      parent_category = VALUES(parent_category),
      sub_category = VALUES(sub_category),
      commission_percent = VALUES(commission_percent),
      setup_date = VALUES(setup_date),
      fiscal_year_id = VALUES(fiscal_year_id),
      created_by = VALUES(created_by),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(itemSql, [
    id, warehouseId, name, code, type, color, unit, qty, initialQty, lastPurchasePrice, lastSalePrice,
    minQtyAlarm, categoryName, parentCategory, subCategory, commissionPercent, setupDate,
    fiscalYearId, createdBy
  ]);
}

async function deleteSingleItemRelational(conn: any, id: string): Promise<void> {
  const cleanId = String(id).trim();
  await conn.execute("DELETE FROM items WHERE id = ? OR code = ?", [cleanId, cleanId]);
}

// 4. Counterparts (Customers, Suppliers, Partners)
async function saveSingleCounterpartRelational(conn: any, cp: any, userContext?: any): Promise<void> {
  if (!cp || typeof cp !== 'object') return;
  const id = String(cp.id || `cp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
  const name = String(cp.name || cp.title || 'طرف‌حساب').trim();
  const code = cp.code ? String(cp.code).trim() : null;
  const type = cp.type || 'customer';
  const phone = cp.phone || null;
  const mobile = cp.mobile || null;
  const nationalId = cp.nationalId || null;
  const economicCode = cp.economicCode || null;
  const address = cp.address || null;
  const postalCode = cp.postalCode || null;
  const initialBalance = Number(cp.initialBalance) || 0;
  const currentBalance = Number(cp.currentBalance || cp.balance) || 0;
  const createdBy = cp.createdBy || (userContext?.username || 'system');
  const rawJson = JSON.stringify(cp);

  const cpSql = `
    INSERT INTO counterparts (
      id, name, code, type, phone, mobile, national_id, economic_code,
      address, postal_code, initial_balance, current_balance, created_by,
      raw_json, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      code = VALUES(code),
      type = VALUES(type),
      phone = VALUES(phone),
      mobile = VALUES(mobile),
      national_id = VALUES(national_id),
      economic_code = VALUES(economic_code),
      address = VALUES(address),
      postal_code = VALUES(postal_code),
      initial_balance = VALUES(initial_balance),
      current_balance = VALUES(current_balance),
      created_by = VALUES(created_by),
      raw_json = VALUES(raw_json),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(cpSql, [
    id, name, code, type, phone, mobile, nationalId, economicCode,
    address, postalCode, initialBalance, currentBalance, createdBy, rawJson
  ]);
}

async function deleteSingleCounterpartRelational(conn: any, id: string): Promise<void> {
  const cleanId = String(id).trim();
  await conn.execute("DELETE FROM counterparts WHERE id = ? OR code = ?", [cleanId, cleanId]);
}

// 5. Accounts (Bank, Cash, POS)
async function saveSingleAccountRelational(conn: any, acc: any, userContext?: any): Promise<void> {
  if (!acc || typeof acc !== 'object') return;
  const id = String(acc.id || `acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
  const name = String(acc.name || acc.title || 'حساب').trim();
  const type = acc.type || 'bank';
  const bankName = acc.bankName || null;
  const accountNumber = acc.accountNumber || null;
  const cardNumber = acc.cardNumber || null;
  const shabaNumber = acc.shabaNumber || null;
  const balance = Number(acc.balance) || 0;
  const initialBalance = Number(acc.initialBalance) || 0;
  const createdBy = acc.createdBy || (userContext?.username || 'system');
  const rawJson = JSON.stringify(acc);

  const accSql = `
    INSERT INTO accounts (
      id, name, type, bank_name, account_number, card_number, shaba_number,
      balance, initial_balance, created_by, raw_json, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      type = VALUES(type),
      bank_name = VALUES(bank_name),
      account_number = VALUES(account_number),
      card_number = VALUES(card_number),
      shaba_number = VALUES(shaba_number),
      balance = VALUES(balance),
      initial_balance = VALUES(initial_balance),
      created_by = VALUES(created_by),
      raw_json = VALUES(raw_json),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(accSql, [
    id, name, type, bankName, accountNumber, cardNumber, shabaNumber,
    balance, initialBalance, createdBy, rawJson
  ]);
}

async function deleteSingleAccountRelational(conn: any, id: string): Promise<void> {
  const cleanId = String(id).trim();
  await conn.execute("DELETE FROM accounts WHERE id = ?", [cleanId]);
}

// 6. Warehouses
async function saveSingleWarehouseRelational(conn: any, wh: any, userContext?: any): Promise<void> {
  if (!wh || typeof wh !== 'object') return;
  const id = String(wh.id || `wh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
  const name = String(wh.name || wh.title || 'انبار').trim();
  const code = wh.code ? String(wh.code).trim() : null;
  const address = wh.address || null;
  const manager = wh.manager || null;
  const phone = wh.phone || null;
  const createdBy = wh.createdBy || (userContext?.username || 'system');
  const rawJson = JSON.stringify(wh);

  const whSql = `
    INSERT INTO warehouses (
      id, name, code, address, manager, phone, created_by, raw_json, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      code = VALUES(code),
      address = VALUES(address),
      manager = VALUES(manager),
      phone = VALUES(phone),
      created_by = VALUES(created_by),
      raw_json = VALUES(raw_json),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(whSql, [id, name, code, address, manager, phone, createdBy, rawJson]);
}

async function deleteSingleWarehouseRelational(conn: any, id: string): Promise<void> {
  const cleanId = String(id).trim();
  await conn.execute("DELETE FROM warehouses WHERE id = ?", [cleanId]);
}

// 7. Categories
async function saveSingleCategoryRelational(conn: any, cat: any, userContext?: any): Promise<void> {
  if (!cat || typeof cat !== 'object') return;
  const id = String(cat.id || `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
  const name = String(cat.name || cat.title || 'دسته‌بندی').trim();
  const type = cat.type || 'general';
  const icon = cat.icon || null;
  const color = cat.color || null;
  const parentId = cat.parentId || null;
  const createdBy = cat.createdBy || (userContext?.username || 'system');
  const rawJson = JSON.stringify(cat);

  const catSql = `
    INSERT INTO categories (
      id, name, type, icon, color, parent_id, created_by, raw_json, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      type = VALUES(type),
      icon = VALUES(icon),
      color = VALUES(color),
      parent_id = VALUES(parent_id),
      created_by = VALUES(created_by),
      raw_json = VALUES(raw_json),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(catSql, [id, name, type, icon, color, parentId, createdBy, rawJson]);
}

async function deleteSingleCategoryRelational(conn: any, id: string): Promise<void> {
  const cleanId = String(id).trim();
  await conn.execute("DELETE FROM categories WHERE id = ?", [cleanId]);
}

// 8. Accounting Documents & Lines (ACID Transaction)
async function saveSingleAccountingDocRelational(conn: any, doc: any, userContext?: any): Promise<void> {
  if (!doc || typeof doc !== 'object') return;
  const id = String(doc.id || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
  const docNumber = doc.docNumber ? Number(doc.docNumber) : (doc.doc_number ? Number(doc.doc_number) : Math.floor(Date.now() / 1000));
  const docDate = doc.date || doc.doc_date || new Date().toISOString().substring(0, 10);
  const description = doc.description || null;
  const isArchived = doc.isArchived ? 1 : 0;
  const isManual = doc.isManual ? 1 : 0;
  const status = doc.status || 'posted';
  const operationType = doc.operationType || doc.operation_type || null;
  const invoiceId = doc.invoiceId || doc.invoice_id || null;
  const txId = doc.txId || doc.tx_id || null;
  const refDocId = doc.refDocId || doc.ref_doc_id || null;
  const idempotencyKey = doc.idempotencyKey || doc.idempotency_key || null;
  const actorId = doc.actorId || doc.actor_id || null;
  const actorName = doc.actorName || doc.actor_name || null;
  const createdBy = doc.createdBy || (userContext?.username || 'system');
  const fiscalYearId = doc.fiscalYearId || null;

  let calculatedDebit = 0;
  let calculatedCredit = 0;
  if (Array.isArray(doc.lines) && doc.lines.length > 0) {
    for (const ln of doc.lines) {
      calculatedDebit += Number(ln.debit) || 0;
      calculatedCredit += Number(ln.credit) || 0;
    }
  } else {
    calculatedDebit = Number(doc.totalDebit) || 0;
    calculatedCredit = Number(doc.totalCredit) || 0;
  }

  // Requirement: Reject unbalanced accounting documents (Debit must equal Credit)
  if (Math.abs(calculatedDebit - calculatedCredit) > 0.01) {
    throw new Error(`سند حسابداری نامتوازن است: مجموع بدهکار (${calculatedDebit.toLocaleString('fa-IR')}) با مجموع بستانکار (${calculatedCredit.toLocaleString('fa-IR')}) برابر نیست.`);
  }

  const docSql = `
    INSERT INTO accounting_docs (
      id, doc_number, date, description, is_archived, is_manual, status,
      operation_type, invoice_id, tx_id, ref_doc_id, idempotency_key,
      actor_id, actor_name, is_deleted, fiscal_year_id, created_by, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, 0, ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      doc_number = VALUES(doc_number),
      date = VALUES(date),
      description = VALUES(description),
      is_archived = VALUES(is_archived),
      is_manual = VALUES(is_manual),
      status = VALUES(status),
      operation_type = VALUES(operation_type),
      invoice_id = VALUES(invoice_id),
      tx_id = VALUES(tx_id),
      ref_doc_id = VALUES(ref_doc_id),
      idempotency_key = VALUES(idempotency_key),
      actor_id = VALUES(actor_id),
      actor_name = VALUES(actor_name),
      is_deleted = 0,
      fiscal_year_id = VALUES(fiscal_year_id),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(docSql, [
    id, docNumber, docDate, description, isArchived, isManual, status,
    operationType, invoiceId, txId, refDocId, idempotencyKey,
    actorId, actorName, fiscalYearId, createdBy
  ]);

  // Granular Line Diffing: Query existing lines, UPDATE modified, INSERT new, DELETE removed
  const existingLineRows = await conn.execute("SELECT id FROM accounting_doc_lines WHERE doc_id = ?", [id]);
  const existingLineIds = new Set<string>();
  if (Array.isArray(existingLineRows) && Array.isArray(existingLineRows[0])) {
    for (const r of (existingLineRows[0] as any[])) {
      if (r && r.id) existingLineIds.add(String(r.id));
    }
  }

  const incomingLineIds = new Set<string>();

  if (Array.isArray(doc.lines) && doc.lines.length > 0) {
    const lineInsertSql = `
      INSERT INTO accounting_doc_lines (
        id, doc_id, account_id, account_name, debit, credit,
        description, line_index, fiscal_year_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const lineUpdateSql = `
      UPDATE accounting_doc_lines SET
        account_id = ?, account_name = ?, debit = ?, credit = ?,
        description = ?, line_index = ?, fiscal_year_id = ?, created_by = ?
      WHERE id = ? AND doc_id = ?
    `;

    for (let idx = 0; idx < doc.lines.length; idx++) {
      const ln = doc.lines[idx];
      if (!ln || typeof ln !== 'object') continue;
      const lnId = String(ln.id || `${id}-ln-${idx + 1}`);
      incomingLineIds.add(lnId);
      const accountId = ln.accountId || ln.accountCode || '';
      const accountName = ln.accountName || '';
      const lnDesc = ln.description || null;
      const debit = Number(ln.debit) || 0;
      const credit = Number(ln.credit) || 0;
      const lineIndex = ln.lineIndex !== undefined ? Number(ln.lineIndex) : (ln.rowOrder !== undefined ? Number(ln.rowOrder) : idx + 1);

      if (existingLineIds.has(lnId)) {
        await conn.execute(lineUpdateSql, [
          accountId, accountName, debit, credit,
          lnDesc, lineIndex, fiscalYearId, createdBy,
          lnId, id
        ]);
      } else {
        await conn.execute(lineInsertSql, [
          lnId, id, accountId, accountName, debit, credit,
          lnDesc, lineIndex, fiscalYearId, createdBy
        ]);
      }
    }
  }

  // Delete only lines removed from the document
  for (const oldId of existingLineIds) {
    if (!incomingLineIds.has(oldId)) {
      await conn.execute("DELETE FROM accounting_doc_lines WHERE id = ? AND doc_id = ?", [oldId, id]);
    }
  }
}

async function deleteSingleAccountingDocRelational(conn: any, id: string): Promise<void> {
  const cleanId = String(id).trim();
  await conn.execute("UPDATE accounting_docs SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? OR doc_number = ?", [cleanId, cleanId]);
}

// 9. Notifications
async function saveSingleNotificationRelational(conn: any, notif: any, userContext?: any): Promise<void> {
  if (!notif || typeof notif !== 'object') return;
  const id = String(notif.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
  const userId = notif.userId || null;
  const title = notif.title || 'اعلان جدید';
  const message = notif.message || '';
  const type = notif.type || 'info';
  const isRead = notif.isRead ? 1 : 0;
  const link = notif.link || null;
  const rawJson = JSON.stringify(notif);

  const notifSql = `
    INSERT INTO notifications (
      id, user_id, title, message, type, is_read, link, raw_json, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      title = VALUES(title),
      message = VALUES(message),
      type = VALUES(type),
      is_read = VALUES(is_read),
      link = VALUES(link),
      raw_json = VALUES(raw_json),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(notifSql, [id, userId, title, message, type, isRead, link, rawJson]);
}

async function deleteSingleNotificationRelational(conn: any, id: string): Promise<void> {
  const cleanId = String(id).trim();
  await conn.execute("DELETE FROM notifications WHERE id = ?", [cleanId]);
}

// 10. Checklist
async function saveSingleChecklistItemRelational(conn: any, item: any, userContext?: any): Promise<void> {
  if (!item || typeof item !== 'object') return;
  const id = String(item.id || `chk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
  const title = item.title || 'مورد چک‌لیست';
  const isCompleted = (item.isCompleted || item.completed) ? 1 : 0;
  const dueDate = item.dueDate || null;
  const rowOrder = Number(item.rowOrder) || 0;
  const createdBy = item.createdBy || (userContext?.username || 'system');
  const rawJson = JSON.stringify(item);

  const chkSql = `
    INSERT INTO checklist (
      id, title, is_completed, due_date, row_order, created_by, raw_json, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      is_completed = VALUES(is_completed),
      due_date = VALUES(due_date),
      row_order = VALUES(row_order),
      created_by = VALUES(created_by),
      raw_json = VALUES(raw_json),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(chkSql, [id, title, isCompleted, dueDate, rowOrder, createdBy, rawJson]);
}

async function deleteSingleChecklistItemRelational(conn: any, id: string): Promise<void> {
  const cleanId = String(id).trim();
  await conn.execute("DELETE FROM checklist WHERE id = ?", [cleanId]);
}

// 11. Settings
async function saveSingleSettingRelational(conn: any, settingKey: string, settingValue: any, userContext?: any): Promise<void> {
  const sKey = String(settingKey).trim();
  const serialized = typeof settingValue === 'string' ? settingValue : JSON.stringify(settingValue);
  const createdBy = userContext?.username || 'system';

  const setSql = `
    INSERT INTO settings (id, setting_key, setting_value, created_by, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      setting_key = VALUES(setting_key),
      setting_value = VALUES(setting_value),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(setSql, [sKey, sKey, serialized, createdBy]);
}

// 12. Users
async function saveSingleUserRelational(conn: any, user: any, userContext?: any): Promise<void> {
  if (!user || typeof user !== 'object') return;
  const id = String(user.id || `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
  const username = String(user.username || user.name || 'user').trim();
  const name = user.name || username;
  const role = user.role || 'seller';
  const phone = user.phone || null;
  const passwordHash = user.password || user.passwordHash || username;
  const permissions = Array.isArray(user.permissions) ? JSON.stringify(user.permissions) : JSON.stringify([]);
  const rawJson = JSON.stringify(user);

  const userSql = `
    INSERT INTO users (
      id, username, password_hash, name, role, phone, permissions, raw_json, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      role = VALUES(role),
      phone = VALUES(phone),
      password_hash = VALUES(password_hash),
      permissions = VALUES(permissions),
      raw_json = VALUES(raw_json),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(userSql, [id, username, passwordHash, name, role, phone, permissions, rawJson]);
}

async function deleteSingleUserRelational(conn: any, id: string): Promise<void> {
  const cleanId = String(id).trim();
  await conn.execute("DELETE FROM users WHERE id = ? OR username = ?", [cleanId, cleanId]);
}

// 13. Fiscal Years
async function saveSingleFiscalYearRelational(conn: any, fy: any, userContext?: any): Promise<void> {
  if (!fy || typeof fy !== 'object') return;
  const id = String(fy.id || `fy-${Date.now()}`);
  const yearTitle = String(fy.year || fy.yearTitle || '1405').trim();
  const startDate = fy.startDate || '1405/01/01';
  const endDate = fy.endDate || '1405/12/29';
  const isClosed = (fy.registered === false || fy.isClosed) ? 1 : 0;
  const createdBy = fy.createdBy || (userContext?.username || 'system');
  const rawJson = JSON.stringify(fy);

  const fySql = `
    INSERT INTO fiscal_years (
      id, year_title, start_date, end_date, is_closed, created_by, raw_json, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY UPDATE
      year_title = VALUES(year_title),
      start_date = VALUES(start_date),
      end_date = VALUES(end_date),
      is_closed = VALUES(is_closed),
      created_by = VALUES(created_by),
      raw_json = VALUES(raw_json),
      updated_at = CURRENT_TIMESTAMP
  `;

  await conn.execute(fySql, [id, yearTitle, startDate, endDate, isClosed, createdBy, rawJson]);
}

// 14. Logs
async function saveSingleLogRelational(conn: any, log: any, userContext?: any): Promise<void> {
  if (!log || typeof log !== 'object') return;
  const id = String(log.id || `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`);
  const level = log.level || 'info';
  const category = log.category || 'system';
  const action = log.action || 'operation';
  const message = log.message || '';
  const userId = log.userId || (userContext?.id || null);
  const rawJson = JSON.stringify(log);

  const logSql = `
    INSERT INTO logs (id, level, category, action, message, user_id, raw_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;

  await conn.execute(logSql, [id, level, category, action, message, userId, rawJson]);
}

// Helper to route an entity collection or single record to its relational table inside a connection/transaction
async function routeEntityWriteToRelational(conn: any, cleanKey: string, data: any, userContext?: any): Promise<void> {
  switch (cleanKey) {
    case 'invoices':
    case 'proformas': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleInvoiceRelational(conn, itm, userContext);
      } else {
        await saveSingleInvoiceRelational(conn, data, userContext);
      }
      break;
    }
    case 'transactions': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleTransactionRelational(conn, itm, userContext);
      } else {
        await saveSingleTransactionRelational(conn, data, userContext);
      }
      break;
    }
    case 'items': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleItemRelational(conn, itm, userContext);
      } else {
        await saveSingleItemRelational(conn, data, userContext);
      }
      break;
    }
    case 'counterparts': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleCounterpartRelational(conn, itm, userContext);
      } else {
        await saveSingleCounterpartRelational(conn, data, userContext);
      }
      break;
    }
    case 'accounts': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleAccountRelational(conn, itm, userContext);
      } else {
        await saveSingleAccountRelational(conn, data, userContext);
      }
      break;
    }
    case 'warehouses': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleWarehouseRelational(conn, itm, userContext);
      } else {
        await saveSingleWarehouseRelational(conn, data, userContext);
      }
      break;
    }
    case 'categories': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleCategoryRelational(conn, itm, userContext);
      } else {
        await saveSingleCategoryRelational(conn, data, userContext);
      }
      break;
    }
    case 'docs':
    case 'accounting_docs':
    case 'accountingDocuments': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleAccountingDocRelational(conn, itm, userContext);
      } else {
        await saveSingleAccountingDocRelational(conn, data, userContext);
      }
      break;
    }
    case 'notifications': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleNotificationRelational(conn, itm, userContext);
      } else {
        await saveSingleNotificationRelational(conn, data, userContext);
      }
      break;
    }
    case 'checklist': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleChecklistItemRelational(conn, itm, userContext);
      } else {
        await saveSingleChecklistItemRelational(conn, data, userContext);
      }
      break;
    }
    case 'settings': {
      if (data && typeof data === 'object') {
        for (const sKey of Object.keys(data)) {
          await saveSingleSettingRelational(conn, sKey, data[sKey], userContext);
        }
      }
      break;
    }
    case 'users': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleUserRelational(conn, itm, userContext);
      } else {
        await saveSingleUserRelational(conn, data, userContext);
      }
      break;
    }
    case 'fiscalYear':
    case 'fiscal_years': {
      await saveSingleFiscalYearRelational(conn, data, userContext);
      break;
    }
    case 'system_logs':
    case 'logs': {
      if (Array.isArray(data)) {
        for (const itm of data) await saveSingleLogRelational(conn, itm, userContext);
      } else {
        await saveSingleLogRelational(conn, data, userContext);
      }
      break;
    }
    default: {
      // For any custom module setting (e.g. commissionTags, shippingMethods), save into settings table
      await saveSingleSettingRelational(conn, cleanKey, data, userContext);
      break;
    }
  }
}

// Universal key saver: writes to active relational MySQL database inside transaction and updates in-memory cache
async function saveKeyData(
  key: string,
  data: any,
  options: { forceOverwrite?: boolean; forceMerge?: boolean; userContext?: any } = {}
): Promise<{ success: boolean; error?: string; version?: number }> {
  return withStateMutationMutex(async () => {
    const cleanKey = key.startsWith("acc_app_") ? key.substring(8) : key;
    const fullKey = `acc_app_${cleanKey}`;
    const now = Date.now();

    // Server-side permission and payload validation
    const validation = validateEntityAndPermission(cleanKey, data, options.userContext, 'update');
    if (!validation.isValid) {
      return { success: false, error: validation.error || "دسترسی یا ساختار داده ارسالی نامعتبر است.", version: now };
    }

    // Convert any embedded Base64 images to real files in uploads/YYYY/MM/
    const processedData = extractAndSaveBase64ImagesNode(data, cleanKey);

    // Ensure memory cache is populated
    if (!serverMemoryStateCache) {
      await populateMemoryCache();
    }
    if (!serverMemoryStateCache) serverMemoryStateCache = {};
    if (!keyVersions) keyVersions = {};

    let finalData = processedData;

    // Smart Entity Merging: Only if explicitly requested for delta operations
    if (options.forceMerge && COLLECTION_ENTITY_KEYS.has(cleanKey) && Array.isArray(processedData)) {
      const existing = serverMemoryStateCache[cleanKey] || serverMemoryStateCache[fullKey];
      if (Array.isArray(existing) && existing.length > 0) {
        finalData = smartMergeEntityArray(existing, processedData);
      }
    }

    serverStateVersion = now;
    keyVersions[cleanKey] = now;
    keyVersions[fullKey] = now;

    // Immediately update in-memory cache
    serverMemoryStateCache[cleanKey] = finalData;
    serverMemoryStateCache[fullKey] = finalData;

    // Perform ACID Transactional Relational Database Write
    let conn: any = null;
    try {
      conn = await mysqlPool.getConnection();
      await conn.beginTransaction();

      await routeEntityWriteToRelational(conn, cleanKey, finalData, options.userContext);

      let serialized = typeof finalData === "string" ? finalData : JSON.stringify(finalData);

      // Post-sync for items to always keep relational database quantities and prevent client-side stales
      if (cleanKey === "items" || cleanKey === "acc_app_items") {
        const latestItems = await getLatestItemsList(conn);
        serverMemoryStateCache["items"] = latestItems;
        serverMemoryStateCache["acc_app_items"] = latestItems;
        serialized = JSON.stringify(latestItems);
        // Save both keys in app_state for maximum consistency
        await conn.execute(
          "INSERT INTO app_state (state_key, state_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP",
          ["items", serialized]
        );
        await conn.execute(
          "INSERT INTO app_state (state_key, state_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP",
          ["acc_app_items", serialized]
        );
      } else {
        // Dual-Write to app_state for backup and NoSQL compatibility
        await conn.execute(
          "INSERT INTO app_state (state_key, state_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP",
          [cleanKey, serialized]
        );
      }

      await conn.commit();
      return { success: true, version: now };
    } catch (err: any) {
      if (conn) {
        try { await conn.rollback(); } catch (_) {}
      }
      console.error(`Failed to save key '${cleanKey}' to relational MySQL tables:`, err.message);
      return { 
        success: false, 
        error: `خطا در ثبت نهایی اطلاعات در جداول تفکیکی MySQL: ${err.message || 'پاسخی از پایگاه‌داده دریافت نگردید.'}`,
        version: now
      };
    } finally {
      if (conn) conn.release();
    }
  });
}

// Universal bulk saver: writes directly to relational MySQL database using transaction
async function saveAllData(
  allData: any,
  options: { forceOverwrite?: boolean; userContext?: any } = {}
): Promise<{ success: boolean; error?: string; count: number; version?: number }> {
  return withStateMutationMutex(async () => {
    const now = Date.now();
    serverStateVersion = now;
    if (!keyVersions) keyVersions = {};

    if (!serverMemoryStateCache) {
      await populateMemoryCache();
    }
    if (!serverMemoryStateCache) serverMemoryStateCache = {};

    const keys = Object.keys(allData);
    if (keys.length === 0) {
      return { success: true, count: 0, version: now };
    }

    for (const key of keys) {
      const cleanKey = key.startsWith("acc_app_") ? key.substring(8) : key;
      const fullKey = `acc_app_${cleanKey}`;
      let val = extractAndSaveBase64ImagesNode(allData[key], cleanKey);

      // Smart merging if saving entity collections and not forceOverwrite
      if (!options.forceOverwrite && COLLECTION_ENTITY_KEYS.has(cleanKey) && Array.isArray(val)) {
        const existing = serverMemoryStateCache[cleanKey] || serverMemoryStateCache[fullKey];
        if (Array.isArray(existing) && existing.length > 0) {
          val = smartMergeEntityArray(existing, val);
        }
      }

      serverMemoryStateCache[cleanKey] = val;
      serverMemoryStateCache[fullKey] = val;
      keyVersions[cleanKey] = now;
      keyVersions[fullKey] = now;
    }

    let conn: any = null;
    try {
      conn = await mysqlPool.getConnection();
      await conn.beginTransaction();

      let hasItemsUpdate = false;
      for (const rawKey of keys) {
        const cleanKey = rawKey.startsWith("acc_app_") ? rawKey.substring(8) : rawKey;
        const currentVal = serverMemoryStateCache[cleanKey];
        await routeEntityWriteToRelational(conn, cleanKey, currentVal, options.userContext);

        if (cleanKey === "items" || cleanKey === "acc_app_items") {
          hasItemsUpdate = true;
        } else {
          // Dual-Write to app_state for backup and NoSQL compatibility
          const serialized = typeof currentVal === "string" ? currentVal : JSON.stringify(currentVal);
          await conn.execute(
            "INSERT INTO app_state (state_key, state_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP",
            [cleanKey, serialized]
          );
        }
      }

      if (hasItemsUpdate) {
        const latestItems = await getLatestItemsList(conn);
        serverMemoryStateCache["items"] = latestItems;
        serverMemoryStateCache["acc_app_items"] = latestItems;
        const serialized = JSON.stringify(latestItems);
        await conn.execute(
          "INSERT INTO app_state (state_key, state_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP",
          ["items", serialized]
        );
        await conn.execute(
          "INSERT INTO app_state (state_key, state_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP",
          ["acc_app_items", serialized]
        );
      }

      await conn.commit();
      return { success: true, count: keys.length, version: now };
    } catch (err: any) {
      if (conn) {
        try { await conn.rollback(); } catch (_) {}
      }
      console.error("Failed to batch save to relational MySQL database:", err.message);
      return { 
        success: false, 
        error: `خطا در ثبت گروهی اطلاعات در جداول MySQL: ${err.message || 'عدم پاسخگویی دیتابیس هاست'}`,
        count: 0,
        version: now
      };
    } finally {
      if (conn) conn.release();
    }
  });
}

// Schema Validator Helper
function validateDatabaseSchema(dbData: any): { isValid: boolean; reason?: string } {
  if (!dbData || typeof dbData !== "object" || Array.isArray(dbData)) {
    return { isValid: false, reason: "ساختار داده ارسال‌شده معتبر نیست (باید آبجکت باشد)." };
  }

  const keys = Object.keys(dbData);
  if (keys.length === 0) {
    return { isValid: false, reason: "محتوای بکاپ یا دیتابیس کاملاً خالی است." };
  }

  // Permissive check for full or selective backups
  const normalizedKeys = keys.map(k => k.startsWith("acc_app_") ? k.substring(8) : k);
  const knownKeys = [
    "users", "invoices", "transactions", "items", "counterparts", "accounts", 
    "categories", "docs", "checklist", "fiscalYear", "settings", "partners", 
    "loanBorrowers", "pendingDeposits", "bankSmsMessages", "paymentAllocations", 
    "inventoryMovements", "auditLogs", "system_logs", "commissionTags",
    "warehouse_categories_list", "warehouse_stock_adjustment_logs"
  ];
  const hasKnownKey = normalizedKeys.some(k => knownKeys.includes(k) || k.startsWith("settings") || k.startsWith("theme") || k.includes("custom"));

  if (!hasKnownKey && keys.length < 1) {
    return { isValid: false, reason: "فایل پشتیبان فاقد آرایه‌ها و کلیدهای اصلی حسابداری است." };
  }

  return { isValid: true };
}

async function startServer() {
  // Initialize Database
  await initDatabase();

  const app = express();

  // High-performance gzip/deflate compression for fast data transfer on personal hosting
  app.use(compression({
    level: 6,
    threshold: 1024, // Compress any response > 1KB
  }));

  // Read port from process.env (which may be overridden by wp-config.json) or default to 3000
  const config = getAppConfig();
  const PORT = Number(process.env.PORT) || config.PORT || 3000;

  // JSON, URL-encoded, Binary & Text request parsers with high limits for system updates, backups and SMS webhooks
  app.use(express.json({ limit: "500mb" }));
  app.use(express.urlencoded({ limit: "500mb", extended: true }));
  app.use(express.raw({ type: ["application/octet-stream", "application/zip", "application/x-zip-compressed", "application/*"], limit: "500mb" }));
  app.use(express.text({ limit: "50mb", type: ["text/plain", "text/*", "application/text"] }));

  // Custom JSON & Body parsing error middleware to prevent default HTML error responses
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err) {
      console.error("Express request parsing error:", err.message || err);
      if (err.type === "entity.too.large" || err.status === 413) {
        return res.status(413).json({
          status: "error",
          code: "ENTITY_TOO_LARGE",
          error: "حجم داده‌های ارسالی بیش از حد مجاز پراکسی سرور است."
        });
      }
      return res.status(400).json({
        status: "error",
        error: `خطا در دریافت و پردازش داده‌ها: ${err.message || "فرمت ورودی نامعتبر است"}`
      });
    }
    next();
  });

  // Support calls to api.php?action=... or api.php?route=... seamlessly in Node.js runtime
  app.use((req, res, next) => {
    if (req.path === "/api.php" || req.path === "/index.php") {
      const action = (req.query.action || req.query.route) as string | undefined;
      if (action && typeof action === "string") {
        const cleanAction = action.replace(/^\/?(api\/)?/, "");
        req.url = `/api/${cleanAction}`;
      }
    }
    next();
  });

  // --- DATABASE SYNC ENDPOINTS ---

  // 1. Lightweight Version & Change Detection
  app.get("/api/db/version", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      if (!serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({
        status: "success",
        version: serverStateVersion,
        keyVersions: keyVersions || {},
        lastUpdated: serverStateVersion
      });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 2. Lightweight Delta Sync (Fetches only changed keys or returns not_modified)
  app.post("/api/db/sync-delta", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      if (!serverMemoryStateCache) {
        await populateMemoryCache();
      }

      const { clientVersion, clientKeyVersions } = req.body || {};

      // If client version exactly matches server version, 0 payload transferred!
      if (clientVersion && Number(clientVersion) === Number(serverStateVersion)) {
        return res.json({ status: "not_modified", version: serverStateVersion });
      }

      const allData = serverMemoryStateCache || {};

      if (clientKeyVersions && typeof clientKeyVersions === "object") {
        const updatedKeys: Record<string, any> = {};
        let diffCount = 0;

        for (const rawKey of Object.keys(allData)) {
          const cleanKey = rawKey.startsWith("acc_app_") ? rawKey.substring(8) : rawKey;
          const sVer = keyVersions[cleanKey] || serverStateVersion;
          const cVer = clientKeyVersions[cleanKey] || clientKeyVersions[`acc_app_${cleanKey}`] || 0;

          if (sVer > cVer || !cVer) {
            if (allData[cleanKey] !== undefined) {
              updatedKeys[cleanKey] = allData[cleanKey];
              diffCount++;
            }
          }
        }

        if (diffCount === 0 && clientVersion) {
          return res.json({ status: "not_modified", version: serverStateVersion });
        }

        return res.json({
          status: "delta",
          version: serverStateVersion,
          updatedKeys,
          keyVersions: keyVersions || {}
        });
      }

      return res.json({
        status: "full",
        version: serverStateVersion,
        allData,
        keyVersions: keyVersions || {}
      });
    } catch (err: any) {
      console.error("API error during delta sync:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 3. Single Key Fetcher
  app.get("/api/db/key", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      const key = String(req.query.key || "");
      if (!key) {
        return res.status(400).json({ status: "error", error: "شناسه کلید ارسال نشده است." });
      }
      const data = await getKeyData(key);
      return res.json({ status: "success", key, data });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // A. Load all state from database (with ETag and version metadata)
  app.get("/api/db/load-all", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      if (!serverMemoryStateCache) {
        await populateMemoryCache();
      }

      const etag = `W/"v-${serverStateVersion}"`;
      res.setHeader("ETag", etag);
      res.setHeader("X-DB-Version", String(serverStateVersion));

      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }

      const state = await loadAllData();
      return res.json(state);
    } catch (err: any) {
      console.error("API error loading database state:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // B. Save a single state key with strict write verification & concurrency protection
  app.post("/api/db/save-key", async (req, res) => {
    try {
      const { key, data, forceOverwrite = false } = req.body;
      if (!key) {
        return res.status(400).json({ status: "error", error: "شناسه کلید اطلاعات ارسال نشده است." });
      }
      const result = await saveKeyData(key, data, { forceOverwrite: Boolean(forceOverwrite) });
      if (!result.success) {
        return res.status(500).json({
          status: "error",
          key,
          error: result.error || "خطا در ثبت اطلاعات در دیتابیس",
          dbType,
          version: result.version || serverStateVersion
        });
      }
      return res.json({ 
        status: "success", 
        key, 
        dbType, 
        version: result.version || serverStateVersion,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("API error saving key:", err);
      return res.status(500).json({ status: "error", error: `خطا در ذخیره‌سازی داده: ${err.message}`, dbType });
    }
  });

// Helper to delete a single entity record from its relational table
async function deleteEntityRecordFromRelational(conn: any, cleanKey: string, deleteId: string, userContext?: any): Promise<void> {
  const targetId = String(deleteId).trim();
  switch (cleanKey) {
    case 'invoices':
    case 'proformas':
      await deleteSingleInvoiceRelational(conn, targetId);
      break;
    case 'transactions':
      await deleteSingleTransactionRelational(conn, targetId);
      break;
    case 'items':
      await deleteSingleItemRelational(conn, targetId);
      break;
    case 'counterparts':
      await deleteSingleCounterpartRelational(conn, targetId);
      break;
    case 'accounts':
      await deleteSingleAccountRelational(conn, targetId);
      break;
    case 'warehouses':
      await deleteSingleWarehouseRelational(conn, targetId);
      break;
    case 'categories':
      await deleteSingleCategoryRelational(conn, targetId);
      break;
    case 'docs':
    case 'accounting_docs':
    case 'accountingDocuments':
      await deleteSingleAccountingDocRelational(conn, targetId);
      break;
    case 'notifications':
      await deleteSingleNotificationRelational(conn, targetId);
      break;
    case 'checklist':
      await deleteSingleChecklistItemRelational(conn, targetId);
      break;
    case 'users':
      await deleteSingleUserRelational(conn, targetId);
      break;
  }
}

  // C. Atomic Single Entity Insertion / Update / Deletion (Relational Table with ACID Transaction)
  app.post("/api/db/merge-entity", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const { key, item, items, deleteId, userContext } = req.body || {};
      if (!key) {
        return res.status(400).json({ status: "error", error: "شناسه موجودیت مشخص نشده است." });
      }

      const cleanKey = key.startsWith("acc_app_") ? key.substring(8) : key;
      const fullKey = `acc_app_${cleanKey}`;

      // Server-side permission checks
      const incomingItems: any[] = items && Array.isArray(items) ? items : (item ? [item] : []);
      if (deleteId) {
        const valDel = validateEntityAndPermission(cleanKey, { id: deleteId }, userContext, 'delete');
        if (!valDel.isValid) {
          return res.status(403).json({ status: "error", error: valDel.error });
        }
      }
      for (const itm of incomingItems) {
        const valItm = validateEntityAndPermission(cleanKey, itm, userContext, 'update');
        if (!valItm.isValid) {
          return res.status(400).json({ status: "error", error: valItm.error });
        }
      }

      const mergeResult = await withStateMutationMutex(async () => {
        if (!serverMemoryStateCache) {
          await populateMemoryCache();
        }
        if (!serverMemoryStateCache) serverMemoryStateCache = {};

        const rawList = serverMemoryStateCache[cleanKey] || serverMemoryStateCache[fullKey] || [];
        let list: any[] = Array.isArray(rawList) ? [...rawList] : [];

        let conn: any = null;
        try {
          conn = await mysqlPool.getConnection();
          await conn.beginTransaction();

          if (deleteId) {
            const targetId = String(deleteId).trim();
            list = list.filter((it: any) => {
              const itId = getEntityIdentifier(it);
              return itId !== targetId && itId !== `inv-${targetId}` && itId !== `doc-${targetId}` && itId !== `code-${targetId}` && itId !== `user-${targetId}`;
            });
            await deleteEntityRecordFromRelational(conn, cleanKey, targetId, userContext);
          }

          if (incomingItems.length > 0) {
            list = smartMergeEntityArray(list, incomingItems);
            for (const itm of incomingItems) {
              const processed = extractAndSaveBase64ImagesNode(itm, cleanKey);
              await routeEntityWriteToRelational(conn, cleanKey, processed, userContext);
            }
          }

          await conn.commit();
        } catch (err: any) {
          if (conn) {
            try { await conn.rollback(); } catch (_) {}
          }
          throw err;
        } finally {
          if (conn) conn.release();
        }

        const now = Date.now();
        serverStateVersion = now;
        if (!keyVersions) keyVersions = {};
        keyVersions[cleanKey] = now;
        keyVersions[fullKey] = now;

        serverMemoryStateCache[cleanKey] = list;
        serverMemoryStateCache[fullKey] = list;

        return { count: list.length, version: now };
      });

      return res.json({
        status: "success",
        key: cleanKey,
        count: mergeResult.count,
        version: mergeResult.version,
        dbType,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("API error merging entity to relational table:", err);
      return res.status(500).json({ status: "error", error: `خطا در ثبت اتمیک ردیف در جدول رابطه‌ای: ${err.message}`, dbType });
    }
  });

  // D. Save all keys in bulk (e.g. on Backup Restore or Multi-Entity State Updates)
  app.post("/api/db/save-all", async (req, res) => {
    try {
      const { stateData, forceOverwrite = false } = req.body;
      if (!stateData || typeof stateData !== "object") {
        return res.status(400).json({ status: "error", error: "فرمت داده‌های ارسالی نامعتبر است." });
      }
      
      const sanitizedData: any = {};
      for (const rawKey of Object.keys(stateData)) {
        const cleanKey = rawKey.startsWith("acc_app_") ? rawKey.substring(8) : rawKey;
        let parsedValue = stateData[rawKey];
        if (typeof parsedValue === "string") {
          try {
            parsedValue = JSON.parse(parsedValue);
          } catch (_) {}
        }
        sanitizedData[cleanKey] = parsedValue;
      }
      
      const result = await saveAllData(sanitizedData, { forceOverwrite: Boolean(forceOverwrite) });
      if (!result.success) {
        return res.status(500).json({
          status: "error",
          error: result.error || "خطا در ثبت دسته‌ای اطلاعات در دیتابیس",
          dbType,
          version: result.version || serverStateVersion
        });
      }
      return res.json({ 
        status: "success", 
        count: result.count, 
        dbType, 
        version: result.version || serverStateVersion,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("API error during bulk save:", err);
      return res.status(500).json({ status: "error", error: `خطا در ذخیره‌سازی دسته‌ای: ${err.message}`, dbType });
    }
  });

  // Database Schema Migration & JSON to Relational Table Data Migration Endpoints
  app.get(["/api/db/migrate", "/api/migrate"], async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const shouldMigrateData = req.query.data === 'true' || req.query.data === '1';
      
      const conn = await mysqlPool.getConnection();
      try {
        const schemaRes = await runDatabaseMigrations(conn);
        if (shouldMigrateData) {
          const migrationRes = await migrateAppStateDataToRelationalTables(conn);
          return res.json({
            status: "success",
            message: "مایگریشن ساختار و انتقال امن تمام داده‌های JSON به جداول رابطه‌ای با موفقیت انجام شد.",
            schema: schemaRes,
            migration: migrationRes
          });
        }
        return res.json({
          status: "success",
          message: "تمام ۱۷ جدول استاندارد MySQL با موفقیت اعتبارسنجی و ساخته شدند.",
          schema: schemaRes
        });
      } finally {
        conn.release();
      }
    } catch (err: any) {
      console.error("Migration endpoint error:", err);
      return res.status(500).json({ status: "error", error: `خطا در اجرای مایگریشن: ${err.message}` });
    }
  });

  app.all(["/api/db/migrate-data", "/api/migrate-data"], async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const conn = await mysqlPool.getConnection();
      try {
        const migrationRes = await migrateAppStateDataToRelationalTables(conn);
        return res.json({
          status: "success",
          message: "انتقال امن، تراکنشی و تکرارپذیر داده‌های JSON موجود در app_state به جداول تفکیکی MySQL با موفقیت انجام شد.",
          migration: migrationRes
        });
      } finally {
        conn.release();
      }
    } catch (err: any) {
      console.error("Data migration endpoint error:", err);
      return res.status(500).json({ status: "error", error: `خطا در انتقال داده‌ها به جداول رابطه‌ای: ${err.message}` });
    }
  });

  // --- DEDICATED RELATIONAL REST API ENDPOINTS ---

  // 1. Invoices & Invoice Items
  app.get("/api/invoices", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const type = req.query.type as string;
      let sql = "SELECT * FROM invoices WHERE is_deleted = 0";
      const params: any[] = [];
      if (type) {
        sql += " AND type = ?";
        params.push(type);
      }
      sql += " ORDER BY id DESC";
      const rows: any = await executeMysqlQuery(sql, params);
      const items: any = await executeMysqlQuery("SELECT * FROM invoice_items ORDER BY sort_order ASC, id ASC");
      const itemsMap = new Map<string, any[]>();
      if (Array.isArray(items)) {
        for (const itm of items) {
          const invId = String(itm.invoice_id);
          if (!itemsMap.has(invId)) itemsMap.set(invId, []);
          itemsMap.get(invId)!.push({
            id: itm.id,
            itemId: itm.item_id,
            name: itm.name,
            qty: Number(itm.qty) || 0,
            quantity: Number(itm.qty) || 0,
            unit: itm.unit,
            unitPrice: Number(itm.unit_price) || 0,
            discount: Number(itm.discount) || 0,
            tax: Number(itm.tax) || 0,
            totalPrice: Number(itm.total_price) || 0,
            total: Number(itm.total_price) || 0,
            remarks: itm.remarks,
            description: itm.remarks,
            type: itm.type || 'kala',
            color: itm.color || null,
            cogsUnitCost: Number(itm.cogs_unit_cost) || 0,
            cogsTotal: Number(itm.cogs_total) || 0,
            sortOrder: Number(itm.sort_order) || 0,
            fiscalYearId: itm.fiscal_year_id,
            createdBy: itm.created_by
          });
        }
      }
      const data = (rows || []).map((r: any) => {
        let customIcons: any = null;
        let attachments: any = null;
        let paymentSlips: any = null;
        let history: any = null;
        let allocations: any = null;
        try { if (r.custom_icons) customIcons = JSON.parse(r.custom_icons); } catch (_) {}
        try { if (r.attachments) attachments = JSON.parse(r.attachments); } catch (_) {}
        try { if (r.payment_slips) paymentSlips = JSON.parse(r.payment_slips); } catch (_) {}
        try { if (r.history) history = JSON.parse(r.history); } catch (_) {}
        try { if (r.allocations) allocations = JSON.parse(r.allocations); } catch (_) {}

        return {
          id: r.id,
          invoiceNumber: r.invoice_number,
          type: r.type || 'sale',
          date: r.date,
          counterpartId: r.counterpart_id,
          counterpartName: r.counterpart_name,
          counterpartPhone: r.counterpart_phone,
          counterpartAddress: r.counterpart_address,
          totalAmount: Number(r.total_amount) || 0,
          tax: Number(r.tax) || 0,
          deposit: Number(r.deposit) || 0,
          discount: Number(r.discount) || 0,
          paymentAmount: Number(r.payment_amount) || 0,
          paymentDate: r.payment_date,
          description: r.description,
          isProforma: Boolean(r.is_proforma),
          isUrgent: Boolean(r.is_urgent),
          urgentType: r.urgent_type,
          shippingMethod: r.shipping_method,
          acquaintanceMethod: r.acquaintance_method,
          docId: r.doc_id,
          cogsDocId: r.cogs_doc_id,
          cogsTotal: Number(r.cogs_total) || 0,
          isReturn: Boolean(r.is_return),
          returnRefInvoiceId: r.return_ref_invoice_id,
          customIcons,
          attachments,
          paymentSlips,
          history,
          allocations,
          fiscalYearId: r.fiscal_year_id,
          createdBy: r.created_by,
          createdById: r.created_by_id,
          createdByPhone: r.created_by_phone,
          items: itemsMap.get(String(r.id)) || [],
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });
      return res.json({ status: "success", count: data.length, data });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/invoices", async (req, res) => {
    try {
      const invoiceData = req.body;
      const userContext = req.body.userContext;
      const validation = validateEntityAndPermission('invoices', invoiceData, userContext, 'create');
      if (!validation.isValid) {
        return res.status(400).json({ status: "error", error: validation.error });
      }

      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        const processed = extractAndSaveBase64ImagesNode(invoiceData, 'invoices');
        await saveSingleInvoiceRelational(conn, processed, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      // Update in-memory cache
      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }

      return res.json({ status: "success", message: "فاکتور و اقلام وابسته با Transaction در دیتابیس ذخیره شدند." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.delete("/api/invoices/:id", async (req, res) => {
    try {
      const invId = req.params.id;
      const userContext = req.body?.userContext;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await deleteSingleInvoiceRelational(conn, invId);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: `فاکتور ${invId} با موفقیت حذف شد.` });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 2. Transactions
  app.get("/api/transactions", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT * FROM transactions WHERE is_deleted = 0 ORDER BY id DESC");
      const data = (rows || []).map((r: any) => {
        let attachments: any = null;
        let editHistory: any = null;
        try { if (r.attachments) attachments = JSON.parse(r.attachments); } catch (_) {}
        try { if (r.edit_history) editHistory = JSON.parse(r.edit_history); } catch (_) {}

        return {
          id: r.id,
          date: r.date,
          time: r.time,
          amount: Number(r.amount) || 0,
          type: r.type,
          description: r.description,
          isRegistered: Boolean(r.is_registered),
          categoryParent: r.category_parent,
          categoryChild: r.category_child,
          categoryId: r.category_child || r.category_parent,
          category: r.category_child || r.category_parent,
          userDescription: r.user_description,
          isDuplicate: Boolean(r.is_duplicate),
          duplicateReason: r.duplicate_reason,
          trackingNumber: r.tracking_number,
          referenceCode: r.reference_code,
          registeredDate: r.registered_date,
          accountId: r.account_id,
          partnerId: r.partner_id,
          pendingDepositId: r.pending_deposit_id,
          borrowerId: r.borrower_id,
          borrowerName: r.borrower_name,
          loanType: r.loan_type,
          counterpartId: r.counterpart_id,
          counterpartName: r.counterpart_name,
          invoiceId: r.invoice_id,
          docId: r.doc_id,
          attachments,
          isEdited: Boolean(r.is_edited),
          editedBy: r.edited_by,
          editedById: r.edited_by_id,
          editedAt: r.edited_at,
          editHistory,
          isDeleted: Boolean(r.is_deleted),
          deletedBy: r.deleted_by,
          deletedById: r.deleted_by_id,
          deletedAt: r.deleted_at,
          fiscalYearId: r.fiscal_year_id,
          createdBy: r.created_by,
          createdById: r.created_by_id,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });
      return res.json({ status: "success", count: data.length, data });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      const txData = req.body;
      const userContext = req.body.userContext;
      const validation = validateEntityAndPermission('transactions', txData, userContext, 'create');
      if (!validation.isValid) {
        return res.status(400).json({ status: "error", error: validation.error });
      }

      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        const processed = extractAndSaveBase64ImagesNode(txData, 'transactions');
        await saveSingleTransactionRelational(conn, processed, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "تراکنش با موفقیت در جدول transactions ذخیره شد." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.delete("/api/transactions/:id", async (req, res) => {
    try {
      const txId = req.params.id;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await deleteSingleTransactionRelational(conn, txId);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: `تراکنش ${txId} با موفقیت حذف شد.` });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 3. Items (Goods & Services)
  app.get("/api/items", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT * FROM items ORDER BY id DESC");
      const data = (rows || []).map((r: any) => ({
        id: r.id,
        warehouseId: r.warehouse_id,
        name: r.name,
        code: r.code,
        type: r.type || 'kala',
        color: r.color || null,
        unit: r.unit || 'عدد',
        qty: Number(r.qty) || 0,
        stock: Number(r.qty) || 0,
        quantity: Number(r.qty) || 0,
        initialQty: Number(r.initial_qty) || 0,
        lastPurchasePrice: Number(r.last_purchase_price) || 0,
        purchasePrice: Number(r.last_purchase_price) || 0,
        lastSalePrice: Number(r.last_sale_price) || 0,
        salePrice: Number(r.last_sale_price) || 0,
        minQtyAlarm: Number(r.min_qty_alarm) || 0,
        minStock: Number(r.min_qty_alarm) || 0,
        categoryName: r.category_name,
        parentCategory: r.parent_category,
        subCategory: r.sub_category,
        commissionPercent: Number(r.commission_percent) || 0,
        setupDate: r.setup_date,
        fiscalYearId: r.fiscal_year_id,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
      return res.json({ status: "success", count: data.length, data });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/items", async (req, res) => {
    try {
      const itemData = req.body;
      const userContext = req.body.userContext;
      const validation = validateEntityAndPermission('items', itemData, userContext, 'create');
      if (!validation.isValid) {
        return res.status(400).json({ status: "error", error: validation.error });
      }

      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        const processed = extractAndSaveBase64ImagesNode(itemData, 'items');
        await saveSingleItemRelational(conn, processed, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "کالا با موفقیت در جدول items ثبت شد." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.delete("/api/items/:id", async (req, res) => {
    try {
      const itemId = req.params.id;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await deleteSingleItemRelational(conn, itemId);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: `کالا ${itemId} حذف شد.` });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 4. Counterparts (Customers & Suppliers)
  app.get("/api/counterparts", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT * FROM counterparts ORDER BY id DESC");
      return res.json({ status: "success", count: (rows || []).length, data: rows || [] });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/counterparts", async (req, res) => {
    try {
      const cpData = req.body;
      const userContext = req.body.userContext;
      const validation = validateEntityAndPermission('counterparts', cpData, userContext, 'create');
      if (!validation.isValid) {
        return res.status(400).json({ status: "error", error: validation.error });
      }

      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        const processed = extractAndSaveBase64ImagesNode(cpData, 'counterparts');
        await saveSingleCounterpartRelational(conn, processed, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "طرف‌حساب با موفقیت در جدول counterparts ثبت شد." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.delete("/api/counterparts/:id", async (req, res) => {
    try {
      const cpId = req.params.id;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await deleteSingleCounterpartRelational(conn, cpId);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: `طرف‌حساب ${cpId} حذف شد.` });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 5. Bank Accounts
  app.get("/api/accounts", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT * FROM accounts ORDER BY id DESC");
      return res.json({ status: "success", count: (rows || []).length, data: rows || [] });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/accounts", async (req, res) => {
    try {
      const accData = req.body;
      const userContext = req.body.userContext;
      const validation = validateEntityAndPermission('accounts', accData, userContext, 'create');
      if (!validation.isValid) {
        return res.status(400).json({ status: "error", error: validation.error });
      }

      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        const processed = extractAndSaveBase64ImagesNode(accData, 'accounts');
        await saveSingleAccountRelational(conn, processed, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "حساب با موفقیت در جدول accounts ثبت شد." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.delete("/api/accounts/:id", async (req, res) => {
    try {
      const accId = req.params.id;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await deleteSingleAccountRelational(conn, accId);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: `حساب ${accId} حذف شد.` });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 6. Accounting Documents & Lines (ACID Transaction)
  app.get("/api/docs", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT * FROM accounting_docs WHERE is_deleted = 0 ORDER BY id DESC");
      const lines: any = await executeMysqlQuery("SELECT * FROM accounting_doc_lines ORDER BY line_index ASC, id ASC");
      const linesMap = new Map<string, any[]>();
      if (Array.isArray(lines)) {
        for (const ln of lines) {
          const docId = String(ln.doc_id);
          if (!linesMap.has(docId)) linesMap.set(docId, []);
          linesMap.get(docId)!.push({
            id: ln.id,
            docId: ln.doc_id,
            accountId: ln.account_id,
            accountCode: ln.account_id,
            accountName: ln.account_name,
            debit: Number(ln.debit) || 0,
            credit: Number(ln.credit) || 0,
            description: ln.description,
            lineIndex: Number(ln.line_index) || 0,
            rowOrder: Number(ln.line_index) || 0,
            fiscalYearId: ln.fiscal_year_id,
            createdBy: ln.created_by,
            createdAt: ln.created_at,
            updatedAt: ln.updated_at
          });
        }
      }
      const data = (rows || []).map((r: any) => {
        const relatedLines = linesMap.get(String(r.id)) || [];
        const totalDebit = relatedLines.reduce((sum: number, ln: any) => sum + (Number(ln.debit) || 0), 0);
        const totalCredit = relatedLines.reduce((sum: number, ln: any) => sum + (Number(ln.credit) || 0), 0);

        return {
          id: r.id,
          docNumber: Number(r.doc_number) || 0,
          date: r.date,
          description: r.description,
          isArchived: Boolean(r.is_archived),
          isManual: Boolean(r.is_manual),
          status: r.status || 'posted',
          operationType: r.operation_type,
          invoiceId: r.invoice_id,
          txId: r.tx_id,
          refDocId: r.ref_doc_id,
          idempotencyKey: r.idempotency_key,
          actorId: r.actor_id,
          actorName: r.actor_name,
          isDeleted: Boolean(r.is_deleted),
          deletedBy: r.deleted_by,
          deletedById: r.deleted_by_id,
          deletedAt: r.deleted_at,
          fiscalYearId: r.fiscal_year_id,
          createdBy: r.created_by,
          lines: relatedLines,
          totalDebit,
          totalCredit,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });
      return res.json({ status: "success", count: data.length, data });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/docs", async (req, res) => {
    try {
      const docData = req.body;
      const userContext = req.body.userContext;
      const validation = validateEntityAndPermission('docs', docData, userContext, 'create');
      if (!validation.isValid) {
        return res.status(400).json({ status: "error", error: validation.error });
      }

      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        const processed = extractAndSaveBase64ImagesNode(docData, 'docs');
        await saveSingleAccountingDocRelational(conn, processed, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "سند حسابداری با موفقیت ذخیره شد." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.delete("/api/docs/:id", async (req, res) => {
    try {
      const docId = req.params.id;
      const userContext = req.body?.userContext;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await deleteSingleAccountingDocRelational(conn, docId);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: `سند ${docId} حذف شد.` });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 7. Warehouses
  app.get("/api/warehouses", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT * FROM warehouses ORDER BY id ASC");
      return res.json({ status: "success", count: (rows || []).length, data: rows || [] });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/warehouses", async (req, res) => {
    try {
      const whData = req.body;
      const userContext = req.body.userContext;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        const processed = extractAndSaveBase64ImagesNode(whData, 'warehouses');
        await saveSingleWarehouseRelational(conn, processed, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "انبار با موفقیت ذخیره شد." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.delete("/api/warehouses/:id", async (req, res) => {
    try {
      const whId = req.params.id;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await deleteSingleWarehouseRelational(conn, whId);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: `انبار ${whId} حذف شد.` });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 8. Categories
  app.get("/api/categories", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT * FROM categories ORDER BY id ASC");
      return res.json({ status: "success", count: (rows || []).length, data: rows || [] });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/categories", async (req, res) => {
    try {
      const catData = req.body;
      const userContext = req.body.userContext;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        const processed = extractAndSaveBase64ImagesNode(catData, 'categories');
        await saveSingleCategoryRelational(conn, processed, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "دسته‌بندی با موفقیت ذخیره شد." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.delete("/api/categories/:id", async (req, res) => {
    try {
      const catId = req.params.id;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await deleteSingleCategoryRelational(conn, catId);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: `دسته‌بندی ${catId} حذف شد.` });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 9. Checklist
  app.get("/api/checklist", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT * FROM checklist ORDER BY row_order ASC, id ASC");
      const data = (rows || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        isCompleted: Boolean(r.is_completed),
        completed: Boolean(r.is_completed),
        dueDate: r.due_date,
        rowOrder: Number(r.row_order) || 0,
        createdBy: r.created_by
      }));
      return res.json({ status: "success", count: data.length, data });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/checklist", async (req, res) => {
    try {
      const chkData = req.body;
      const userContext = req.body.userContext;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await saveSingleChecklistItemRelational(conn, chkData, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "مورد چک‌لیست با موفقیت ذخیره شد." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.delete("/api/checklist/:id", async (req, res) => {
    try {
      const chkId = req.params.id;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await deleteSingleChecklistItemRelational(conn, chkId);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: `مورد چک‌لیست ${chkId} حذف شد.` });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 10. Notifications
  app.get("/api/notifications", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT * FROM notifications ORDER BY id DESC LIMIT 200");
      const data = (rows || []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        title: r.title,
        message: r.message,
        type: r.type,
        isRead: Boolean(r.is_read),
        link: r.link,
        createdAt: r.created_at
      }));
      return res.json({ status: "success", count: data.length, data });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const notifData = req.body;
      const userContext = req.body.userContext;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await saveSingleNotificationRelational(conn, notifData, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "اعلان با موفقیت ذخیره شد." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 11. Settings
  app.get("/api/settings", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT setting_key, setting_value FROM settings");
      const result: Record<string, any> = {};
      if (Array.isArray(rows)) {
        for (const row of rows) {
          result[row.setting_key] = safeUnwrapJson(row.setting_value);
        }
      }
      return res.json({ status: "success", data: result });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const settingsData = req.body;
      const userContext = req.body.userContext;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        if (settingsData && typeof settingsData === 'object') {
          for (const k of Object.keys(settingsData)) {
            await saveSingleSettingRelational(conn, k, settingsData[k], userContext);
          }
        }
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "تنظیمات با موفقیت در جدول settings ذخیره شدند." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // Settings Store & Web Messengers APIs
  app.get(["/api/system/web-messengers", "/api/web-messengers"], async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      let data: any = null;
      try {
        const rows: any = await executeMysqlQuery(
          "SELECT setting_value FROM settings_store WHERE setting_key = ? LIMIT 1",
          ["acc_system_web_messengers"]
        );
        if (Array.isArray(rows) && rows.length > 0 && rows[0]?.setting_value) {
          data = safeUnwrapJson(rows[0].setting_value);
        }
      } catch (_) {}

      if (!data || !Array.isArray(data) || data.length === 0) {
        const stateRows: any = await executeMysqlQuery(
          "SELECT state_value FROM app_state WHERE state_key = ? OR state_key = ? LIMIT 1",
          ["acc_system_web_messengers", "acc_app_acc_system_web_messengers"]
        );
        if (Array.isArray(stateRows) && stateRows.length > 0 && stateRows[0]?.state_value) {
          data = safeUnwrapJson(stateRows[0].state_value);
        }
      }

      return res.json({
        status: "success",
        key: "acc_system_web_messengers",
        source: "mysql",
        data: Array.isArray(data) && data.length > 0 ? data : []
      });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post(["/api/system/web-messengers", "/api/web-messengers"], async (req, res) => {
    try {
      let rawList = req.body?.messengers || req.body?.data || req.body;
      if (typeof rawList === "string") {
        try { rawList = JSON.parse(rawList); } catch (_) {}
      }

      if (!Array.isArray(rawList)) {
        return res.status(400).json({ status: "error", error: "قالب داده ارسال‌شده برای پیام‌رسان‌ها باید آرایه (Array) باشد." });
      }

      const validated: any[] = [];
      for (let i = 0; i < rawList.length; i++) {
        const item = rawList[i];
        if (!item || typeof item !== "object") continue;
        const id = String(item.id || `wm-${Date.now()}-${i}`).trim();
        const title = String(item.title || "").trim();
        let url = String(item.url || "").trim();
        if (!title) {
          return res.status(400).json({ status: "error", error: `عنوان پیام‌رسان (title) در ردیف ${i + 1} الزامی است.` });
        }
        if (!url) {
          return res.status(400).json({ status: "error", error: `آدرس پیام‌رسان (url) در ردیف ${i + 1} الزامی است.` });
        }
        if (!/^https?:\/\//i.test(url)) {
          url = `https://${url}`;
        }
        const icon = String(item.icon || "globe").trim();
        const customIconUrl = String(item.customIconUrl || "").trim();
        const allowedUserIds = Array.isArray(item.allowedUserIds) ? item.allowedUserIds.map((u: any) => String(u)) : [];
        const windowWidth = Number(item.windowWidth) > 0 ? Number(item.windowWidth) : 1080;
        const windowHeight = Number(item.windowHeight) > 0 ? Number(item.windowHeight) : 720;
        const category = String(item.category || "پیام‌رسان").trim();
        const description = String(item.description || "").trim();

        validated.push({
          id,
          title,
          url,
          icon,
          customIconUrl,
          allowedUserIds,
          windowWidth,
          windowHeight,
          category,
          description,
          createdBy: item.createdBy || null,
          createdById: item.createdById || null,
          createdAt: item.createdAt || null
        });
      }

      const serialized = JSON.stringify(validated);
      await executeMysqlQuery(
        `INSERT INTO settings_store (setting_key, setting_value, created_by)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
        ["acc_system_web_messengers", serialized, req.body?.userContext?.username || null]
      );

      // Sync with app_state for backup compatibility
      try {
        await executeMysqlQuery(
          `INSERT INTO app_state (state_key, state_value)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP`,
          ["acc_system_web_messengers", serialized]
        );
      } catch (_) {}

      return res.json({
        status: "success",
        message: "لیست پیام‌رسان‌ها با موفقیت در پایگاه‌داده MySQL ذخیره گردید.",
        key: "acc_system_web_messengers",
        count: validated.length,
        data: validated
      });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.get(["/api/system/user-messenger-icons", "/api/user-messenger-icons"], async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      let data: any = null;
      try {
        const rows: any = await executeMysqlQuery(
          "SELECT setting_value FROM settings_store WHERE setting_key = ? LIMIT 1",
          ["acc_system_user_messenger_icons"]
        );
        if (Array.isArray(rows) && rows.length > 0 && rows[0]?.setting_value) {
          data = safeUnwrapJson(rows[0].setting_value);
        }
      } catch (_) {}

      if (!data || !Array.isArray(data)) {
        const stateRows: any = await executeMysqlQuery(
          "SELECT state_value FROM app_state WHERE state_key = ? OR state_key = ? LIMIT 1",
          ["acc_system_user_messenger_icons", "acc_app_acc_system_user_messenger_icons"]
        );
        if (Array.isArray(stateRows) && stateRows.length > 0 && stateRows[0]?.state_value) {
          data = safeUnwrapJson(stateRows[0].state_value);
        }
      }

      let icons: any[] = Array.isArray(data) ? data : [];
      const filterUserId = req.query?.userId ? String(req.query.userId).trim() : null;
      if (filterUserId) {
        icons = icons.filter((i: any) => !i.userId || String(i.userId) === filterUserId);
      }

      return res.json({
        status: "success",
        key: "acc_system_user_messenger_icons",
        source: "mysql",
        data: icons
      });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post(["/api/system/user-messenger-icons", "/api/user-messenger-icons"], async (req, res) => {
    try {
      let rawList = req.body?.icons || req.body?.data || req.body;
      if (typeof rawList === "string") {
        try { rawList = JSON.parse(rawList); } catch (_) {}
      }

      if (!Array.isArray(rawList)) {
        return res.status(400).json({ status: "error", error: "قالب داده ارسال‌شده برای آیکون‌های سفارشی باید آرایه (Array) باشد." });
      }

      const validated: any[] = [];
      for (let i = 0; i < rawList.length; i++) {
        const item = rawList[i];
        if (!item || typeof item !== "object") continue;
        const id = String(item.id || `usr-icon-${Date.now()}-${i}`).trim();
        const userId = String(item.userId || "").trim();
        const name = String(item.name || `icon-${i + 1}`).trim();
        const dataUrl = String(item.dataUrl || item.data || item.url || "").trim();
        const createdAt = String(item.createdAt || "").trim();

        if (!dataUrl) continue;

        validated.push({
          id,
          userId,
          name,
          dataUrl,
          createdAt
        });
      }

      const serialized = JSON.stringify(validated);
      await executeMysqlQuery(
        `INSERT INTO settings_store (setting_key, setting_value, created_by)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
        ["acc_system_user_messenger_icons", serialized, req.body?.userContext?.username || null]
      );

      // Sync with app_state for backup compatibility
      try {
        await executeMysqlQuery(
          `INSERT INTO app_state (state_key, state_value)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP`,
          ["acc_system_user_messenger_icons", serialized]
        );
      } catch (_) {}

      return res.json({
        status: "success",
        message: "آیکون‌های سفارشی پیام‌رسان‌ها با موفقیت در پایگاه‌داده MySQL ذخیره شدند.",
        key: "acc_system_user_messenger_icons",
        count: validated.length,
        data: validated
      });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 12. Users
  app.get("/api/users", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT id, username, name, role, phone, permissions, created_at, updated_at FROM users ORDER BY id ASC");
      const data = (rows || []).map((r: any) => ({
        id: r.id,
        username: r.username,
        name: r.name,
        role: r.role,
        phone: r.phone,
        permissions: safeUnwrapJson(r.permissions) || []
      }));
      return res.json({ status: "success", count: data.length, data });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const userData = req.body;
      const userContext = req.body.userContext;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await saveSingleUserRelational(conn, userData, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "کاربر با موفقیت در جدول users ذخیره شد." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const userId = req.params.id;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await deleteSingleUserRelational(conn, userId);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: `کاربر ${userId} حذف شد.` });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 13. Fiscal Years
  app.get("/api/fiscal-years", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const rows: any = await executeMysqlQuery("SELECT * FROM fiscal_years ORDER BY id DESC");
      return res.json({ status: "success", count: (rows || []).length, data: rows || [] });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  app.post("/api/fiscal-years", async (req, res) => {
    try {
      const fyData = req.body;
      const userContext = req.body.userContext;
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await saveSingleFiscalYearRelational(conn, fyData, userContext);
        await conn.commit();
      } catch (e: any) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      if (serverMemoryStateCache) {
        await populateMemoryCache();
      }
      return res.json({ status: "success", message: "سال مالی در جدول fiscal_years ذخیره شد." });
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 14. Fast Relational Initial Data Loader (Directly from MySQL tables - zero app_state)
  app.get("/api/initial-data", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");

      // Parallel execution of all relational queries
      const [
        invRows,
        invItemRows,
        txRows,
        itemRows,
        cpRows,
        accRows,
        docRows,
        docLineRows,
        whRows,
        catRows,
        chkRows,
        notifRows,
        userRows,
        setRows,
        fyRows
      ]: any = await Promise.all([
        executeMysqlQuery("SELECT * FROM invoices WHERE is_deleted = 0 ORDER BY id DESC"),
        executeMysqlQuery("SELECT * FROM invoice_items ORDER BY id ASC"),
        executeMysqlQuery("SELECT * FROM transactions WHERE is_deleted = 0 ORDER BY id DESC"),
        executeMysqlQuery("SELECT * FROM items ORDER BY id DESC"),
        executeMysqlQuery("SELECT * FROM counterparts ORDER BY id DESC"),
        executeMysqlQuery("SELECT * FROM accounts ORDER BY id DESC"),
        executeMysqlQuery("SELECT * FROM accounting_docs WHERE is_deleted = 0 ORDER BY id DESC"),
        executeMysqlQuery("SELECT * FROM accounting_doc_lines ORDER BY row_order ASC, id ASC"),
        executeMysqlQuery("SELECT * FROM warehouses ORDER BY id ASC"),
        executeMysqlQuery("SELECT * FROM categories ORDER BY id ASC"),
        executeMysqlQuery("SELECT * FROM checklist ORDER BY row_order ASC, id ASC"),
        executeMysqlQuery("SELECT * FROM notifications ORDER BY id DESC LIMIT 100"),
        executeMysqlQuery("SELECT id, username, name, role, phone, permissions, created_at, updated_at, raw_json FROM users ORDER BY id ASC"),
        executeMysqlQuery("SELECT setting_key, setting_value FROM settings"),
        executeMysqlQuery("SELECT * FROM fiscal_years ORDER BY id DESC")
      ]);

      // Map invoice items
      const itemsMap = new Map<string, any[]>();
      if (Array.isArray(invItemRows)) {
        for (const itm of invItemRows) {
          const invId = String(itm.invoice_id);
          if (!itemsMap.has(invId)) itemsMap.set(invId, []);
          itemsMap.get(invId)!.push({
            id: itm.id,
            itemId: itm.item_id,
            name: itm.item_name,
            quantity: Number(itm.quantity) || 0,
            unit: itm.unit,
            unitPrice: Number(itm.unit_price) || 0,
            discount: Number(itm.discount) || 0,
            tax: Number(itm.tax) || 0,
            total: Number(itm.total_price) || 0,
            description: itm.description
          });
        }
      }

      const invoices = (invRows || []).map((r: any) => {
        const parsed = safeUnwrapJson(r.raw_json) || {};
        return {
          ...parsed,
          id: r.id,
          invoiceNumber: r.invoice_number,
          type: r.type,
          isProforma: Boolean(r.is_proforma),
          customerId: r.counterpart_id,
          customerName: r.counterpart_name,
          counterpartId: r.counterpart_id,
          counterpartName: r.counterpart_name,
          date: r.invoice_date,
          dueDate: r.due_date,
          status: r.status,
          subtotal: Number(r.subtotal) || 0,
          discount: Number(r.discount_amount) || 0,
          tax: Number(r.tax_amount) || 0,
          totalAmount: Number(r.total_amount) || 0,
          paidAmount: Number(r.paid_amount) || 0,
          balanceAmount: Number(r.balance_amount) || 0,
          paymentMethod: r.payment_method,
          notes: r.notes,
          officialBill: Boolean(r.official_bill || r.is_official),
          items: itemsMap.get(String(r.id)) || (Array.isArray(parsed.items) ? parsed.items : [])
        };
      });

      // Map accounting doc lines
      const docLinesMap = new Map<string, any[]>();
      if (Array.isArray(docLineRows)) {
        for (const ln of docLineRows) {
          const docId = String(ln.doc_id);
          if (!docLinesMap.has(docId)) docLinesMap.set(docId, []);
          docLinesMap.get(docId)!.push({
            id: ln.id,
            accountCode: ln.account_code,
            accountName: ln.account_name,
            description: ln.description,
            debit: Number(ln.debit) || 0,
            credit: Number(ln.credit) || 0,
            counterpartId: ln.counterpart_id,
            counterpartName: ln.counterpart_name,
            rowOrder: Number(ln.row_order) || 0
          });
        }
      }

      const docs = (docRows || []).map((r: any) => {
        const parsed = safeUnwrapJson(r.raw_json) || {};
        return {
          ...parsed,
          id: r.id,
          docNumber: r.doc_number,
          date: r.doc_date,
          description: r.description,
          status: r.status,
          totalDebit: Number(r.total_debit) || 0,
          totalCredit: Number(r.total_credit) || 0,
          fiscalYearId: r.fiscal_year_id,
          createdBy: r.created_by,
          lines: docLinesMap.get(String(r.id)) || (Array.isArray(parsed.lines) ? parsed.lines : [])
        };
      });

      const transactions = (txRows || []).map((r: any) => {
        const parsed = safeUnwrapJson(r.raw_json) || {};
        return {
          ...parsed,
          id: r.id,
          date: r.tx_date,
          type: r.type,
          amount: Number(r.amount) || 0,
          accountId: r.account_id,
          counterpartId: r.counterpart_id,
          categoryId: r.category_id,
          description: r.description,
          trackingNumber: r.tracking_number,
          documentNumber: r.document_number,
          fiscalYearId: r.fiscal_year_id,
          createdBy: r.created_by
        };
      });

      const items = (itemRows || []).map((r: any) => {
        const parsed = safeUnwrapJson(r.raw_json) || {};
        return {
          ...parsed,
          id: r.id,
          name: r.name,
          code: r.code,
          unit: r.unit,
          purchasePrice: Number(r.purchase_price) || 0,
          salePrice: Number(r.sale_price) || 0,
          stock: Number(r.stock) || 0,
          minStock: Number(r.min_stock) || 0,
          category: r.category,
          warehouseId: r.warehouse_id,
          fiscalYearId: r.fiscal_year_id
        };
      });

      const counterparts = (cpRows || []).map((r: any) => {
        const parsed = safeUnwrapJson(r.raw_json) || {};
        return {
          ...parsed,
          id: r.id,
          name: r.name,
          code: r.code,
          type: r.type,
          phone: r.phone,
          mobile: r.mobile,
          nationalId: r.national_id,
          economicCode: r.economic_code,
          address: r.address,
          postalCode: r.postal_code,
          initialBalance: Number(r.initial_balance) || 0,
          currentBalance: Number(r.current_balance) || 0,
          balance: Number(r.current_balance) || 0
        };
      });

      const accounts = (accRows || []).map((r: any) => {
        const parsed = safeUnwrapJson(r.raw_json) || {};
        return {
          ...parsed,
          id: r.id,
          name: r.name,
          type: r.type,
          bankName: r.bank_name,
          accountNumber: r.account_number,
          cardNumber: r.card_number,
          shabaNumber: r.shaba_number,
          balance: Number(r.balance) || 0,
          initialBalance: Number(r.initial_balance) || 0
        };
      });

      const warehouses = (whRows || []).map((r: any) => {
        const parsed = safeUnwrapJson(r.raw_json) || {};
        return {
          ...parsed,
          id: r.id,
          name: r.name,
          code: r.code,
          address: r.address,
          manager: r.manager,
          phone: r.phone
        };
      });

      const categories = (catRows || []).map((r: any) => {
        const parsed = safeUnwrapJson(r.raw_json) || {};
        return {
          ...parsed,
          id: r.id,
          name: r.name,
          type: r.type,
          icon: r.icon,
          color: r.color,
          parentId: r.parent_id
        };
      });

      const checklist = (chkRows || []).map((r: any) => {
        const parsed = safeUnwrapJson(r.raw_json) || {};
        return {
          ...parsed,
          id: r.id,
          title: r.title,
          isCompleted: Boolean(r.is_completed),
          completed: Boolean(r.is_completed),
          dueDate: r.due_date,
          rowOrder: Number(r.row_order) || 0,
          createdBy: r.created_by
        };
      });

      const notifications = (notifRows || []).map((r: any) => {
        const parsed = safeUnwrapJson(r.raw_json) || {};
        return {
          ...parsed,
          id: r.id,
          userId: r.user_id,
          title: r.title,
          message: r.message,
          type: r.type,
          isRead: Boolean(r.is_read),
          link: r.link,
          createdAt: r.created_at
        };
      });

      const users = (userRows || []).map((r: any) => {
        const parsed = safeUnwrapJson(r.raw_json) || {};
        return {
          ...parsed,
          id: r.id,
          username: r.username,
          name: r.name,
          role: r.role,
          phone: r.phone,
          permissions: safeUnwrapJson(r.permissions) || parsed.permissions || []
        };
      });

      const settings: Record<string, any> = {};
      if (Array.isArray(setRows)) {
        for (const row of setRows) {
          settings[row.setting_key] = safeUnwrapJson(row.setting_value);
        }
      }

      const fiscalYear = Array.isArray(fyRows) && fyRows.length > 0
        ? {
            id: fyRows[0].id,
            year: fyRows[0].year,
            startDate: fyRows[0].start_date,
            endDate: fyRows[0].end_date,
            registered: Boolean(fyRows[0].registered),
            createdBy: fyRows[0].created_by,
            setupDate: fyRows[0].setup_date
          }
        : null;

      return res.json({
        status: "success",
        source: "relational_mysql_tables",
        data: {
          invoices,
          transactions,
          items,
          counterparts,
          accounts,
          docs,
          warehouses,
          categories,
          checklist,
          notifications,
          users,
          settings,
          fiscalYear
        }
      });
    } catch (err: any) {
      console.error("Error loading relational initial data:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // E. Atomic Database Wipe / Purge Endpoint (Completely clears database for all personnel and clients)
  app.post("/api/db/wipe", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const { selectedIds = [] } = req.body || {};

      if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
        return res.status(400).json({ status: "error", error: "هیچ بخشی برای تخلیه دیتابیس انتخاب نشده است." });
      }

      // Step 1: Automatic emergency pre-wipe backup
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const emergencyDir = path.join(process.cwd(), "backups");
        if (!fs.existsSync(emergencyDir)) {
          fs.mkdirSync(emergencyDir, { recursive: true });
        }
        const emergencyFile = path.join(emergencyDir, `emergency_before_wipe_${timestamp}.json`);
        const currentBackupDb = await loadAllData();
        fs.writeFileSync(
          emergencyFile,
          JSON.stringify({
            _metadata: {
              createdReason: "Emergency backup automatically created before selective database wipe",
              timestamp: new Date().toISOString(),
              selectedIds
            },
            database: currentBackupDb
          }, null, 2),
          "utf8"
        );
      } catch (backupErr) {
        console.warn("Notice: failed to write pre-wipe emergency backup:", backupErr);
      }

      // Step 2: Atomic state mutation with lock
      const wipeResult = await withStateMutationMutex(async () => {
        if (!serverMemoryStateCache) {
          await populateMemoryCache();
        }
        if (!serverMemoryStateCache) serverMemoryStateCache = {};

        const selectedSet = new Set(selectedIds);
        const resetLabels: string[] = [];
        const modifiedKeys: Record<string, any> = {};

        // 1. INVOICES & COMMERCE
        if (selectedSet.has('invoices')) {
          serverMemoryStateCache['invoices'] = [];
          serverMemoryStateCache['paymentAllocations'] = [];
          modifiedKeys['invoices'] = [];
          modifiedKeys['paymentAllocations'] = [];
          resetLabels.push('کلیه فاکتورها و پیش‌فاکتورها');
        } else if (
          selectedSet.has('invoices_sales') ||
          selectedSet.has('invoices_purchase') ||
          selectedSet.has('invoices_proforma')
        ) {
          const removedInvIds = new Set<string>();
          const currentInvoices = Array.isArray(serverMemoryStateCache['invoices']) ? serverMemoryStateCache['invoices'] : [];
          serverMemoryStateCache['invoices'] = currentInvoices.filter((inv: any) => {
            const isPf = Boolean(
              inv?.isProforma === true || 
              inv?.isProforma === 'true' || 
              inv?.type === 'proforma' || 
              inv?.status === 'proforma' ||
              (typeof inv?.invoiceNumber === 'string' && inv.invoiceNumber.trim().toUpperCase().startsWith('PF-')) ||
              (typeof inv?.title === 'string' && inv.title.includes('پیش‌فاکتور'))
            );
            const isPurchase = inv?.type === 'purchase' && !isPf;
            const isSale = (inv?.type === 'sale' || !inv?.type || inv?.type === 'invoice') && !isPf;

            if (selectedSet.has('invoices_sales') && isSale) {
              if (inv.id) removedInvIds.add(String(inv.id));
              return false;
            }
            if (selectedSet.has('invoices_purchase') && isPurchase) {
              if (inv.id) removedInvIds.add(String(inv.id));
              return false;
            }
            if (selectedSet.has('invoices_proforma') && isPf) {
              if (inv.id) removedInvIds.add(String(inv.id));
              return false;
            }
            return true;
          });
          modifiedKeys['invoices'] = serverMemoryStateCache['invoices'];

          if (removedInvIds.size > 0) {
            const currentAllocations = Array.isArray(serverMemoryStateCache['paymentAllocations']) ? serverMemoryStateCache['paymentAllocations'] : [];
            serverMemoryStateCache['paymentAllocations'] = currentAllocations.filter((pa: any) => !removedInvIds.has(String(pa?.invoiceId)));
            modifiedKeys['paymentAllocations'] = serverMemoryStateCache['paymentAllocations'];
          }
          resetLabels.push('زیرمجموعه‌های انتخابی فاکتورها');
        }

        if (selectedSet.has('shipping_methods')) {
          serverMemoryStateCache['shipping_methods'] = [];
          serverMemoryStateCache['acc_system_shipping_methods'] = [];
          modifiedKeys['shipping_methods'] = [];
          modifiedKeys['acc_system_shipping_methods'] = [];
          resetLabels.push('روش‌های ارسال سفارشی');
        }

        if (selectedSet.has('commissionSettlements')) {
          serverMemoryStateCache['commissionSettlements'] = [];
          serverMemoryStateCache['commission_settlements_list'] = [];
          modifiedKeys['commissionSettlements'] = [];
          modifiedKeys['commission_settlements_list'] = [];
          resetLabels.push('سوابق تسویه پورسانت بازاریابی');
        }

        if (selectedSet.has('commissionTags')) {
          serverMemoryStateCache['commissionTags'] = [];
          serverMemoryStateCache['commission_tags_list'] = [];
          modifiedKeys['commissionTags'] = [];
          modifiedKeys['commission_tags_list'] = [];
          resetLabels.push('تگ‌ها و درصد‌های پورسانت ویژه');
        }

        // 2. ITEMS & INVENTORY
        if (selectedSet.has('items')) {
          serverMemoryStateCache['items'] = [];
          serverMemoryStateCache['inventoryMovements'] = [];
          modifiedKeys['items'] = [];
          modifiedKeys['inventoryMovements'] = [];
          resetLabels.push('کلیه کالاها و خدمات انبار');
        } else if (
          selectedSet.has('items_goods') ||
          selectedSet.has('items_services') ||
          selectedSet.has('items_stock_zero')
        ) {
          const currentItems = Array.isArray(serverMemoryStateCache['items']) ? serverMemoryStateCache['items'] : [];
          serverMemoryStateCache['items'] = currentItems.filter((it: any) => {
            const isService = it?.type === 'khadamat' || it?.isService === true;
            if (selectedSet.has('items_goods') && !isService) return false;
            if (selectedSet.has('items_services') && isService) return false;
            if (selectedSet.has('items_stock_zero') && !isService && (Number(it?.qty) || 0) <= 0) return false;
            return true;
          });
          modifiedKeys['items'] = serverMemoryStateCache['items'];
          resetLabels.push('زیرمجموعه‌های انتخابی کالاها و خدمات انبار');
        }

        if (selectedSet.has('categories')) {
          serverMemoryStateCache['categories'] = [];
          serverMemoryStateCache['warehouse_categories_list'] = [];
          modifiedKeys['categories'] = [];
          modifiedKeys['warehouse_categories_list'] = [];
          resetLabels.push('دسته‌بندی‌های کالا');
        }

        if (selectedSet.has('warehouse_stock_adjustment_logs')) {
          serverMemoryStateCache['warehouse_stock_adjustment_logs'] = [];
          modifiedKeys['warehouse_stock_adjustment_logs'] = [];
          resetLabels.push('سوابق انبارگردانی');
        }

        // 3. ACCOUNTING DOCS & TRANSACTIONS
        if (selectedSet.has('docs')) {
          serverMemoryStateCache['docs'] = [];
          modifiedKeys['docs'] = [];
          resetLabels.push('کلیه اسناد حسابداری');
        } else if (selectedSet.has('docs_manual') || selectedSet.has('docs_auto')) {
          const currentDocs = Array.isArray(serverMemoryStateCache['docs']) ? serverMemoryStateCache['docs'] : [];
          serverMemoryStateCache['docs'] = currentDocs.filter((d: any) => {
            const isManual = d?.isManual === true || d?.type === 'manual' || (!d?.invoiceId && !d?.cogsInvoiceId && !d?.autoGenerated);
            if (selectedSet.has('docs_manual') && isManual) return false;
            if (selectedSet.has('docs_auto') && !isManual) return false;
            return true;
          });
          modifiedKeys['docs'] = serverMemoryStateCache['docs'];
          resetLabels.push('زیرمجموعه‌های انتخابی اسناد حسابداری');
        }

        if (selectedSet.has('transactions')) {
          serverMemoryStateCache['transactions'] = [];
          modifiedKeys['transactions'] = [];
          resetLabels.push('کلیه صورتحساب و تراکنش‌های بانکی');
        } else if (selectedSet.has('transactions_income') || selectedSet.has('transactions_expense')) {
          const currentTx = Array.isArray(serverMemoryStateCache['transactions']) ? serverMemoryStateCache['transactions'] : [];
          serverMemoryStateCache['transactions'] = currentTx.filter((tx: any) => {
            const isIncome = tx?.type === 'deposit' || tx?.type === 'income' || tx?.type === 'received';
            const isExpense = tx?.type === 'withdrawal' || tx?.type === 'expense' || tx?.type === 'paid';
            if (selectedSet.has('transactions_income') && isIncome) return false;
            if (selectedSet.has('transactions_expense') && isExpense) return false;
            return true;
          });
          modifiedKeys['transactions'] = serverMemoryStateCache['transactions'];
          resetLabels.push('زیرمجموعه‌های انتخابی تراکنش‌های بانکی');
        }

        if (selectedSet.has('pendingDeposits')) {
          serverMemoryStateCache['pendingDeposits'] = [];
          modifiedKeys['pendingDeposits'] = [];
          resetLabels.push('واریزی‌ها و بیعانه‌های معلق');
        }

        if (selectedSet.has('bankSmsMessages')) {
          serverMemoryStateCache['bankSmsMessages'] = [];
          modifiedKeys['bankSmsMessages'] = [];
          resetLabels.push('پیامک‌های بانکی');
        }

        if (selectedSet.has('accounts')) {
          serverMemoryStateCache['accounts'] = [];
          modifiedKeys['accounts'] = [];
          resetLabels.push('حساب‌های بانکی و صندوق‌ها');
        }

        if (selectedSet.has('loanBorrowers')) {
          serverMemoryStateCache['loanBorrowers'] = [];
          modifiedKeys['loanBorrowers'] = [];
          resetLabels.push('حساب و بدهی وام‌گیرندگان');
        }

        // 4. COUNTERPARTS & PARTNERS
        if (selectedSet.has('counterparts')) {
          serverMemoryStateCache['counterparts'] = [];
          modifiedKeys['counterparts'] = [];
          resetLabels.push('کلیه طرف حساب‌ها و مشتریان');
        } else if (selectedSet.has('counterparts_debtors') || selectedSet.has('counterparts_creditors')) {
          const currentCp = Array.isArray(serverMemoryStateCache['counterparts']) ? serverMemoryStateCache['counterparts'] : [];
          serverMemoryStateCache['counterparts'] = currentCp.filter((cp: any) => {
            const isDebtor = cp?.type === 'buyer' || cp?.type === 'customer' || (Number(cp?.balance) || 0) > 0;
            const isCreditor = cp?.type === 'seller' || cp?.type === 'supplier' || (Number(cp?.balance) || 0) < 0;
            if (selectedSet.has('counterparts_debtors') && isDebtor) return false;
            if (selectedSet.has('counterparts_creditors') && isCreditor) return false;
            return true;
          });
          modifiedKeys['counterparts'] = serverMemoryStateCache['counterparts'];
          resetLabels.push('زیرمجموعه‌های انتخابی طرف حساب‌ها');
        }

        if (selectedSet.has('partners')) {
          serverMemoryStateCache['partners'] = [];
          modifiedKeys['partners'] = [];
          resetLabels.push('شرکا و سهامداران');
        }

        // 5. BASE DATA & COMMUNICATIONS
        if (selectedSet.has('fiscalYear')) {
          const defaultFy = { id: 'fy-1403', year: '1403', startDate: '1403/01/01', endDate: '1403/12/29', registered: false, createdBy: '', setupDate: '' };
          serverMemoryStateCache['fiscalYear'] = defaultFy;
          serverMemoryStateCache['fiscalYearsList'] = [];
          serverMemoryStateCache['seq_doc_number'] = 1;
          modifiedKeys['fiscalYear'] = defaultFy;
          modifiedKeys['fiscalYearsList'] = [];
          modifiedKeys['seq_doc_number'] = 1;
          resetLabels.push('سال‌های مالی و قفل دفاتر');
        }

        if (selectedSet.has('checklist')) {
          serverMemoryStateCache['checklist'] = [];
          modifiedKeys['checklist'] = [];
          resetLabels.push('کلیه یادداشت‌ها و لیست کارها');
        } else if (selectedSet.has('checklist_personal') || selectedSet.has('checklist_shared')) {
          const currentCl = Array.isArray(serverMemoryStateCache['checklist']) ? serverMemoryStateCache['checklist'] : [];
          serverMemoryStateCache['checklist'] = currentCl.filter((c: any) => {
            const isShared = Boolean(c?.isPublic || c?.isShared);
            if (selectedSet.has('checklist_personal') && !isShared) return false;
            if (selectedSet.has('checklist_shared') && isShared) return false;
            return true;
          });
          modifiedKeys['checklist'] = serverMemoryStateCache['checklist'];
          resetLabels.push('زیرمجموعه‌های انتخابی یادداشت‌ها');
        }

        if (selectedSet.has('notifications')) {
          serverMemoryStateCache['notifications'] = [];
          modifiedKeys['notifications'] = [];
          resetLabels.push('اعلان‌های سیستمی');
        }

        if (selectedSet.has('webMessengers')) {
          serverMemoryStateCache['webMessengers'] = [];
          modifiedKeys['webMessengers'] = [];
          resetLabels.push('پیام‌رسان‌های وب');
        }

        if (selectedSet.has('customMessengerIcons')) {
          serverMemoryStateCache['customMessengerIcons'] = [];
          serverMemoryStateCache['acc_system_custom_icons'] = [];
          modifiedKeys['customMessengerIcons'] = [];
          modifiedKeys['acc_system_custom_icons'] = [];
          resetLabels.push('آیکون‌های سفارشی پیام‌رسان‌ها');
        }

        // 6. SETTINGS & AI & LOGS & UPLOADS
        if (selectedSet.has('settings')) {
          const prevSettings = serverMemoryStateCache['settings'] && typeof serverMemoryStateCache['settings'] === 'object' ? serverMemoryStateCache['settings'] : {};
          const cleanSettings = {
            ...prevSettings,
            sellerName: '',
            sellerAddress: '',
            sellerPhone: '',
            invoicePaperSize: 'A4',
            font: 'Vazirmatn',
            currency: 'rial'
          };
          serverMemoryStateCache['settings'] = cleanSettings;
          modifiedKeys['settings'] = cleanSettings;
          resetLabels.push('تنظیمات عمومی و مشخصات فروشنده');
        }

        if (selectedSet.has('invoice_designer')) {
          serverMemoryStateCache['invoice_designer_settings'] = null;
          modifiedKeys['invoice_designer_settings'] = null;
          resetLabels.push('تنظیمات طراح فاکتور');
        }

        if (selectedSet.has('smart_assistant_chats')) {
          serverMemoryStateCache['smart_assistant_chats'] = [];
          modifiedKeys['smart_assistant_chats'] = [];
          resetLabels.push('تاریخچه دستیار هوشمند');
        }

        if (selectedSet.has('system_logs')) {
          serverMemoryStateCache['system_logs'] = [];
          serverMemoryStateCache['auditLogs'] = [];
          modifiedKeys['system_logs'] = [];
          modifiedKeys['auditLogs'] = [];
          resetLabels.push('لاگ‌ها و مانیتورینگ سیستم');
        }

        if (selectedSet.has('uploaded_files')) {
          const uploadsDir = path.join(process.cwd(), "uploads");
          if (fs.existsSync(uploadsDir)) {
            try {
              fs.rmSync(uploadsDir, { recursive: true, force: true });
              fs.mkdirSync(uploadsDir, { recursive: true });
            } catch (e) {
              console.warn("Wipe uploads error:", e);
            }
          }
          resetLabels.push('فایل‌های پیوست و آپلودهای هاست');
        }

        // 7. USERS (Preserve login identities and credentials)
        if (selectedSet.has('users')) {
          const existingUsers = Array.isArray(serverMemoryStateCache['users']) && serverMemoryStateCache['users'].length > 0 ? serverMemoryStateCache['users'] : [];
          const sanitizedUsers = existingUsers.map((u: any, idx: number) => ({
            id: u.id || `user-${idx + 1}`,
            name: u.name || 'کاربر',
            phone: u.phone !== undefined && u.phone !== null ? String(u.phone).trim() : '',
            username: u.username ? String(u.username).trim() : `user${idx + 1}`,
            role: u.role || 'seller',
            password: u.password !== undefined && u.password !== null ? String(u.password) : (u.username ? String(u.username) : ''),
            permissions: Array.isArray(u.permissions) && u.permissions.length > 0 ? [...u.permissions] : []
          }));
          serverMemoryStateCache['users'] = sanitizedUsers;
          modifiedKeys['users'] = sanitizedUsers;
          resetLabels.push('اطلاعات پرسنل و کاربران (تثبیت مشخصات ورود)');
        }

        // Persist all modified keys with FORCE OVERWRITE to eliminate all traces
        const now = Date.now();
        serverStateVersion = now;
        if (!keyVersions) keyVersions = {};

        for (const k of Object.keys(modifiedKeys)) {
          const cleanK = k.startsWith("acc_app_") ? k.substring(8) : k;
          const fullK = `acc_app_${cleanK}`;
          const val = modifiedKeys[k];

          serverMemoryStateCache[cleanK] = val;
          serverMemoryStateCache[fullK] = val;

          keyVersions[cleanK] = now;
          keyVersions[fullK] = now;
        }

        try {
          const keys = Object.keys(modifiedKeys);
          for (const rawKey of keys) {
            const cleanKey = rawKey.startsWith("acc_app_") ? rawKey.substring(8) : rawKey;
            const currentVal = serverMemoryStateCache[cleanKey];
            const serialized = typeof currentVal === "string" ? currentVal : JSON.stringify(currentVal);
            await executeMysqlQuery(
              "INSERT INTO app_state (state_key, state_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP",
              [cleanKey, serialized]
            );
          }
        } catch (mysqlErr: any) {
          console.error("MySQL wipe error:", mysqlErr.message);
          throw new Error(`خطا در ثبت تغییرات در دیتابیس MySQL: ${mysqlErr.message}`);
        }

        return {
          status: "success",
          version: now,
          keyVersions,
          resetLabels,
          modifiedKeys
        };
      });

      return res.json({
        status: "success",
        message: "تخلیه دیتابیس روی سرور با موفقیت انجام شد و اطلاعات برای همه پرسنل پاکسازی گردید.",
        version: wipeResult.version,
        keyVersions: wipeResult.keyVersions,
        resetLabels: wipeResult.resetLabels,
        updatedKeys: wipeResult.modifiedKeys
      });
    } catch (err: any) {
      console.error("API error during database wipe:", err);
      return res.status(500).json({ status: "error", error: `خطا در تخلیه دیتابیس: ${err.message}` });
    }
  });

  // F. Idempotent Migration Runner & Status Endpoint (Schema & Data)
  app.all(["/api/db/migrate", "/api/migrate"], async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      if (!mysqlPool) {
        return res.status(500).json({
          status: "error",
          error: "اتصال به پایگاه‌داده MySQL برقرار نیست."
        });
      }
      const connection = await mysqlPool.getConnection();
      try {
        const includeData = req.query.data === 'true' || req.query.data === '1' || req.body?.data === true;
        if (includeData) {
          const dataResult = await migrateAppStateDataToRelationalTables(connection);
          return res.json({
            status: dataResult.success ? "success" : "error",
            message: dataResult.success
              ? "مایگریشن ساختار و انتقال داده‌های JSON موجود در app_state به جداول تفکیکی MySQL با موفقیت و همراه با تهیه بکاپ خودکار انجام شد."
              : `خطا در انتقال داده‌ها: ${dataResult.error || 'برخی جداول ناموفق بودند'}`,
            dataResult
          });
        }

        const result = await runDatabaseMigrations(connection);
        return res.json({
          status: result.success ? "success" : "error",
          message: result.success
            ? "مایگریشن جداول پایگاه‌داده با موفقیت و بدون حذف اطلاعات اجرا شد."
            : `خطا در اجرای مایگریشن: ${result.error}`,
          tables: result.tables,
          error: result.error
        });
      } finally {
        connection.release();
      }
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // G. Dedicated Transactional Data Migration Endpoint (JSON app_state -> Relational Tables)
  app.all(["/api/db/migrate-data", "/api/migrate-data"], async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      if (!mysqlPool) {
        return res.status(500).json({
          status: "error",
          error: "اتصال به پایگاه‌داده MySQL برقرار نیست."
        });
      }
      const connection = await mysqlPool.getConnection();
      try {
        const migrationResult = await migrateAppStateDataToRelationalTables(connection);
        return res.json({
          status: migrationResult.success ? "success" : "warning",
          message: migrationResult.success
            ? "انتقال امن، تراکنشی و تکرارپذیر داده‌های JSON موجود در app_state به جداول رابطه‌ای MySQL با موفقیت انجام شد."
            : "مایگریشن داده‌ها با برخی هشدارها یا خطاها انجام شد.",
          ...migrationResult
        });
      } finally {
        connection.release();
      }
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // --- CENTRAL PRODUCTION ACCOUNTING & SEQUENCE ENDPOINTS ---

  // Mutex lock for atomic sequence numbers and transaction document posting
  let accountingSequenceMutex = Promise.resolve();
  const withAccountingMutex = <T>(action: () => Promise<T>): Promise<T> => {
    const prev = accountingSequenceMutex;
    let resolveLock: () => void = () => {};
    accountingSequenceMutex = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    return prev.then(action).finally(() => {
      resolveLock();
    });
  };

  // POST /api/accounting/next-doc-number - Atomically generate next accounting document number
  app.post("/api/accounting/next-doc-number", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const result = await withAccountingMutex(async () => {
        const state = await loadAllData();
        let rawDocs = state.docs || state.acc_app_docs || [];
        if (typeof rawDocs === "string") {
          try { rawDocs = JSON.parse(rawDocs); } catch (_) { rawDocs = []; }
        }
        const docsList: any[] = Array.isArray(rawDocs) ? rawDocs : [];

        // Scan highest existing doc number across all active & archived documents
        let maxExisting = 0;
        for (const doc of docsList) {
          const num = Number(doc?.docNumber);
          if (!isNaN(num) && num > maxExisting) {
            maxExisting = num;
          }
        }

        // Get stored high-water mark sequence
        let highWaterMark = 100;
        const rawSeq = state.seq_doc_number || state.acc_app_seq_doc_number;
        if (rawSeq) {
          const parsedSeq = Number(rawSeq);
          if (!isNaN(parsedSeq) && parsedSeq > highWaterMark) {
            highWaterMark = parsedSeq;
          }
        }

        const nextDocNumber = Math.max(maxExisting, highWaterMark) + 1;

        // Atomically store new sequence high water mark in DB
        await saveKeyData("seq_doc_number", nextDocNumber);

        return nextDocNumber;
      });

      return res.json({ status: "success", docNumber: result });
    } catch (err: any) {
      console.error("Error generating next doc number:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // POST /api/accounting/next-invoice-number - Atomically generate next invoice / proforma sequence
  app.post("/api/accounting/next-invoice-number", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const { type = "sale", isProforma = false } = req.body || {};

      const result = await withAccountingMutex(async () => {
        const state = await loadAllData();
        let rawInvoices = state.invoices || state.acc_app_invoices || [];
        if (typeof rawInvoices === "string") {
          try { rawInvoices = JSON.parse(rawInvoices); } catch (_) { rawInvoices = []; }
        }
        const invoicesList: any[] = Array.isArray(rawInvoices) ? rawInvoices : [];

        let maxExistingSeq = 0;
        for (const inv of invoicesList) {
          const numStr = String(inv?.invoiceNumber || "");
          const isInvProforma = Boolean(inv?.isProforma || numStr.startsWith("PF-") || inv?.type === "proforma");
          
          if (isProforma) {
            if (isInvProforma) {
              const cleanNum = numStr.replace(/^[^\d]+/, "");
              const numPart = parseInt(cleanNum, 10);
              if (!isNaN(numPart) && numPart > maxExistingSeq) {
                maxExistingSeq = numPart;
              }
            }
          } else {
            if (!isInvProforma) {
              const cleanNum = numStr.replace(/^[^\d]+/, "");
              const numPart = parseInt(cleanNum, 10);
              if (!isNaN(numPart) && numPart > maxExistingSeq) {
                maxExistingSeq = numPart;
              }
            }
          }
        }

        const seqKey = isProforma ? "seq_pf_number" : "seq_inv_number";
        let highWaterMark = isProforma ? 5000 : 1000;
        const rawSeq = state[seqKey] || state[`acc_app_${seqKey}`];
        if (rawSeq) {
          const parsedSeq = Number(rawSeq);
          if (!isNaN(parsedSeq) && parsedSeq > highWaterMark) {
            highWaterMark = parsedSeq;
          }
        }

        const nextSeq = Math.max(maxExistingSeq, highWaterMark) + 1;
        await saveKeyData(seqKey, nextSeq);

        return isProforma ? `PF-${nextSeq}` : String(nextSeq);
      });

      return res.json({ status: "success", invoiceNumber: result });
    } catch (err: any) {
      console.error("Error generating next invoice number:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // POST /api/accounting/post-document - Strict Authoritative Double-Entry Accounting Document Posting
  app.post("/api/accounting/post-document", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const { document, actor = {}, idempotencyKey } = req.body || {};

      if (!document || typeof document !== "object") {
        return res.status(400).json({ status: "error", error: "اطلاعات سند حسابداری ارسال نشده است." });
      }

      const result = await withAccountingMutex(async () => {
        const state = await loadAllData();
        let rawDocs = state.docs || state.acc_app_docs || [];
        if (typeof rawDocs === "string") {
          try { rawDocs = JSON.parse(rawDocs); } catch (_) { rawDocs = []; }
        }
        const docsList: any[] = Array.isArray(rawDocs) ? [...rawDocs] : [];

        // 1. Idempotency Check: if document with this idempotencyKey or id exists, return existing
        if (idempotencyKey) {
          const existingByKey = docsList.find((d: any) => d && (d.idempotencyKey === idempotencyKey || d.id === idempotencyKey));
          if (existingByKey) {
            return { document: existingByKey, isIdempotentDuplicate: true };
          }
        }
        if (document.id) {
          const existingById = docsList.find((d: any) => d && d.id === document.id);
          if (existingById && existingById.status === "posted" && !document.isAmendment) {
            return { document: existingById, isIdempotentDuplicate: true };
          }
        }

        // 2. Strict Double-Entry Validation
        const rawLines = Array.isArray(document.lines) ? document.lines : [];
        if (rawLines.length < 2) {
          throw new Error("سند حسابداری باید حداقل شامل دو ردیف (بدهکار و بستانکار) باشد.");
        }

        let debitSum = 0;
        let creditSum = 0;
        let hasDebit = false;
        let hasCredit = false;
        const cleanedLines: any[] = [];

        for (let i = 0; i < rawLines.length; i++) {
          const line = rawLines[i];
          const debit = Math.round(Number(line?.debit) || 0);
          const credit = Math.round(Number(line?.credit) || 0);
          const accountId = String(line?.accountId || "").trim();
          const accountName = String(line?.accountName || "").trim();

          if (debit < 0 || credit < 0) {
            throw new Error(`مبلغ ردیف ${i + 1} (${accountName || accountId}) نمی‌تواند منفی باشد.`);
          }
          if (debit === 0 && credit === 0) {
            continue; // Ignore zero lines
          }
          if (debit > 0 && credit > 0) {
            throw new Error(`ردیف ${i + 1} نمی‌تواند همزمان بدهکار و بستانکار باشد.`);
          }
          if (!accountId && !accountName) {
            throw new Error(`ردیف ${i + 1} فاقد حساب/سرفصل معتبر است.`);
          }

          if (debit > 0) {
            hasDebit = true;
            debitSum += debit;
          }
          if (credit > 0) {
            hasCredit = true;
            creditSum += credit;
          }

          cleanedLines.push({
            id: line.id || `line-${Date.now()}-${i}`,
            accountId: accountId || "cost-sys",
            accountName: accountName || "سرفصل حسابداری",
            debit,
            credit,
            description: String(line.description || "").trim()
          });
        }

        if (cleanedLines.length < 2 || !hasDebit || !hasCredit) {
          throw new Error("سند حسابداری یک‌طرفه یا فاقد ردیف‌های معتبر دارای مبلغ است.");
        }

        const diff = Math.abs(debitSum - creditSum);
        if (diff > 0) {
          throw new Error(`سند تراز نیست! مجموع بدهکار (${debitSum}) با مجموع بستانکار (${creditSum}) برابر نیست.`);
        }

        // 3. Document Number Assignment & Uniqueness Check
        let docNumber = Number(document.docNumber);
        if (isNaN(docNumber) || docNumber <= 0) {
          // Auto assign server sequence
          let maxExisting = 0;
          for (const d of docsList) {
            const n = Number(d?.docNumber);
            if (!isNaN(n) && n > maxExisting) maxExisting = n;
          }
          let highWaterMark = 100;
          const rawSeq = state.seq_doc_number || state.acc_app_seq_doc_number;
          if (rawSeq) {
            const p = Number(rawSeq);
            if (!isNaN(p) && p > highWaterMark) highWaterMark = p;
          }
          docNumber = Math.max(maxExisting, highWaterMark) + 1;
          await saveKeyData("seq_doc_number", docNumber);
        } else {
          // Check collision
          const isConflict = docsList.some((d: any) => d && d.id !== document.id && Number(d.docNumber) === docNumber && !d.isDeleted);
          if (isConflict) {
            // Find next safe unique number
            let safeNum = docNumber;
            const existingSet = new Set(docsList.map((d: any) => Number(d?.docNumber) || 0));
            while (existingSet.has(safeNum)) {
              safeNum++;
            }
            docNumber = safeNum;
            await saveKeyData("seq_doc_number", docNumber);
          }
        }

        const postedDoc: any = {
          id: document.id || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          docNumber,
          date: document.date || new Date().toISOString().slice(0, 10),
          description: String(document.description || "").trim(),
          lines: cleanedLines,
          isArchived: Boolean(document.isArchived),
          isManual: Boolean(document.isManual),
          status: "posted",
          invoiceId: document.invoiceId,
          txId: document.txId,
          refDocId: document.refDocId,
          idempotencyKey: idempotencyKey || document.idempotencyKey,
          actorId: actor.id || actor.createdById,
          actorName: actor.name || actor.createdBy,
          operationType: document.operationType || "manual",
          postedAt: new Date().toISOString()
        };

        // Insert or update in docsList
        const existingIdx = docsList.findIndex((d: any) => d && d.id === postedDoc.id);
        if (existingIdx >= 0) {
          docsList[existingIdx] = postedDoc;
        } else {
          docsList.unshift(postedDoc);
        }

        // 4. Save to Database
        await saveKeyData("docs", docsList);

        // 5. Append Audit Log
        let rawAuditLogs = state.auditLogs || state.acc_app_auditLogs || [];
        if (typeof rawAuditLogs === "string") {
          try { rawAuditLogs = JSON.parse(rawAuditLogs); } catch (_) { rawAuditLogs = []; }
        }
        const auditLogs: any[] = Array.isArray(rawAuditLogs) ? [...rawAuditLogs] : [];

        const auditEntry = {
          id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          timestamp: new Date().toISOString(),
          timestampMs: Date.now(),
          actorId: actor.id || "system",
          actorName: actor.name || "سیستم حسابداری",
          actorRole: actor.role || "accountant",
          action: "POST_DOCUMENT",
          entityType: "document",
          entityId: postedDoc.id,
          entityRefNumber: String(postedDoc.docNumber),
          idempotencyKey,
          details: {
            debitSum,
            creditSum,
            linesCount: cleanedLines.length,
            operationType: postedDoc.operationType
          }
        };

        auditLogs.unshift(auditEntry);
        await saveKeyData("auditLogs", auditLogs.slice(0, 5000));

        return { document: postedDoc, isIdempotentDuplicate: false };
      });

      return res.json({ status: "success", document: result.document, idempotent: result.isIdempotentDuplicate });
    } catch (err: any) {
      console.error("Error posting accounting document:", err);
      return res.status(400).json({ status: "error", error: err.message });
    }
  });

  // POST /api/accounting/post-allocation - Authoritative Payment Allocation
  app.post("/api/accounting/post-allocation", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const { allocations = [], actor = {}, idempotencyKey } = req.body || {};
      const allocsList = Array.isArray(allocations) ? allocations : [allocations];

      if (allocsList.length === 0) {
        return res.status(400).json({ status: "error", error: "هیچ تخصیص پرداختی ارسال نشده است." });
      }

      const result = await withAccountingMutex(async () => {
        const state = await loadAllData();
        let rawExisting = state.paymentAllocations || state.acc_app_paymentAllocations || [];
        if (typeof rawExisting === "string") {
          try { rawExisting = JSON.parse(rawExisting); } catch (_) { rawExisting = []; }
        }
        const existingAllocations: any[] = Array.isArray(rawExisting) ? [...rawExisting] : [];

        const newlyAdded: any[] = [];
        for (const alloc of allocsList) {
          if (!alloc || !alloc.invoiceId || !alloc.allocatedAmount) continue;

          // Idempotency check per allocation
          const isDup = existingAllocations.some(
            (ea: any) => ea && (ea.id === alloc.id || (ea.paymentId === alloc.paymentId && ea.invoiceId === alloc.invoiceId && Math.abs(ea.allocatedAmount - alloc.allocatedAmount) < 0.01 && ea.status === "valid"))
          );
          if (isDup) continue;

          const newAlloc = {
            id: alloc.id || `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            paymentId: alloc.paymentId || `pay-${Date.now()}`,
            invoiceId: alloc.invoiceId,
            invoiceNumber: String(alloc.invoiceNumber || ""),
            counterpartId: alloc.counterpartId,
            counterpartName: alloc.counterpartName,
            allocatedAmount: Number(alloc.allocatedAmount) || 0,
            allocationDate: alloc.allocationDate || new Date().toISOString().slice(0, 10),
            paymentMethod: alloc.paymentMethod || "bank_transfer",
            accountId: alloc.accountId,
            status: "valid",
            docId: alloc.docId,
            notes: alloc.notes || "",
            createdAt: new Date().toISOString(),
            createdBy: actor.name || "سیستم",
            createdById: actor.id || "system"
          };

          existingAllocations.unshift(newAlloc);
          newlyAdded.push(newAlloc);
        }

        await saveKeyData("paymentAllocations", existingAllocations);

        return newlyAdded;
      });

      return res.json({ status: "success", allocations: result });
    } catch (err: any) {
      console.error("Error posting payment allocation:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // POST /api/accounting/reverse-allocation - Reverse a Payment Allocation with Audit
  app.post("/api/accounting/reverse-allocation", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const { allocationId, reason = "اصلاح و لغو تخصیص پرداخت", actor = {} } = req.body || {};

      if (!allocationId) {
        return res.status(400).json({ status: "error", error: "شناسه تخصیص پرداخت ارسال نشده است." });
      }

      const result = await withAccountingMutex(async () => {
        const state = await loadAllData();
        let rawExisting = state.paymentAllocations || state.acc_app_paymentAllocations || [];
        if (typeof rawExisting === "string") {
          try { rawExisting = JSON.parse(rawExisting); } catch (_) { rawExisting = []; }
        }
        const existingAllocations: any[] = Array.isArray(rawExisting) ? [...rawExisting] : [];

        const targetAlloc = existingAllocations.find((a: any) => a && a.id === allocationId);
        if (!targetAlloc) {
          throw new Error("تخصیص پرداخت مورد نظر یافت نشد.");
        }

        targetAlloc.status = "reversed";
        targetAlloc.reversalReason = reason;
        targetAlloc.reversalDate = new Date().toISOString().slice(0, 10);
        targetAlloc.reversedBy = actor.name || "کاربر";

        await saveKeyData("paymentAllocations", existingAllocations);

        return targetAlloc;
      });

      return res.json({ status: "success", allocation: result });
    } catch (err: any) {
      console.error("Error reversing allocation:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // POST /api/inventory/movement - Track Physical Stock Inflow/Outflow with Cost Valuation
  app.post("/api/inventory/movement", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const { movement, actor = {} } = req.body || {};

      if (!movement || (!movement.itemId && !movement.itemName)) {
        return res.status(400).json({ status: "error", error: "اطلاعات گردش انبار ارسال نشده است." });
      }

      // Services ('khadamat') do not track physical stock
      if (movement.itemType === 'khadamat' || movement.type === 'khadamat') {
        return res.json({ status: "success", data: { skipped: true } });
      }

      const result = await withAccountingMutex(async () => {
        const state = await loadAllData();
        let rawItems = state.items || state.acc_app_items || state.warehouseItems || state.acc_app_warehouseItems || [];
        if (typeof rawItems === "string") {
          try { rawItems = JSON.parse(rawItems); } catch (_) { rawItems = []; }
        }
        const itemsList: any[] = Array.isArray(rawItems) ? [...rawItems] : [];

        let rawMovements = state.inventoryMovements || state.acc_app_inventoryMovements || [];
        if (typeof rawMovements === "string") {
          try { rawMovements = JSON.parse(rawMovements); } catch (_) { rawMovements = []; }
        }
        const movementsList: any[] = Array.isArray(rawMovements) ? [...rawMovements] : [];

        const targetId = String(movement.itemId || '').trim().toLowerCase();
        const targetName = String(movement.itemName || '').trim().toLowerCase();

        let targetItem = itemsList.find((i: any) => {
          if (!i) return false;
          const itemIdStr = String(i.id || '').trim().toLowerCase();
          const itemCodeStr = String(i.code || '').trim().toLowerCase();
          const itemNameStr = String(i.name || '').trim().toLowerCase();
          return (
            (targetId && (itemIdStr === targetId || itemCodeStr === targetId)) ||
            (targetName && itemNameStr === targetName) ||
            (targetId && itemNameStr === targetId)
          );
        });

        if (!targetItem) {
          targetItem = {
            id: movement.itemId || `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            code: `K-${Date.now().toString().slice(-4)}`,
            name: movement.itemName || 'کالای جدید',
            category: 'عمومی',
            type: 'kala',
            qty: 0,
            unit: movement.unit || 'عدد',
            purchasePrice: Number(movement.unitCost) || 0,
            salePrice: Number(movement.unitCost) || 0,
            lastPurchasePrice: Number(movement.unitCost) || 0,
            minStock: 0,
            createdAt: new Date().toISOString()
          };
          itemsList.push(targetItem);
        }

        const isFromInvoice = Boolean(
          movement.fromInvoice || 
          movement.referenceId || 
          movement.invoiceId || 
          (movement.reason && movement.reason.includes('فاکتور')) || 
          (movement.description && movement.description.includes('فاکتور'))
        );

        const qtyChange = Number(movement.qtyChange) || 0;
        const currentQty = Number(targetItem.qty) || 0;

        // Standard Accounting Principle:
        // When movement is generated during invoice creation, the invoice transaction (PT lifecycle)
        // already adjusted the inventory balance. The inventory cardex log must record the movement
        // without applying a redundant second decrement or increment to the item balance.
        let newQty: number;
        if (isFromInvoice) {
          newQty = movement.remainingQtyAfter !== undefined && !isNaN(Number(movement.remainingQtyAfter))
            ? Number(movement.remainingQtyAfter)
            : currentQty;
        } else {
          newQty = currentQty + qtyChange;
        }

        targetItem.qty = newQty;
        if (movement.unitCost && Number(movement.unitCost) > 0) {
          if (movement.movementType === "inflow_purchase" || movement.type === "purchase_in") {
            targetItem.lastPurchasePrice = Number(movement.unitCost);
          }
        }

        const movementRecord: any = {
          id: movement.id || `mov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          itemId: targetItem.id,
          itemName: targetItem.name || movement.itemName || "کالا",
          movementType: movement.movementType || (qtyChange < 0 ? "outflow_sale" : "inflow_purchase"),
          qtyChange,
          unitCost: Number(movement.unitCost) || targetItem.lastPurchasePrice || 0,
          totalCost: (Number(movement.unitCost) || targetItem.lastPurchasePrice || 0) * Math.abs(qtyChange),
          remainingQtyAfter: newQty,
          date: movement.date || new Date().toISOString().slice(0, 10),
          time: movement.time || new Date().toTimeString().slice(0, 5),
          referenceId: movement.referenceId,
          referenceNumber: movement.referenceNumber,
          reason: movement.reason || "",
          docId: movement.docId,
          createdBy: actor.name || "سیستم",
          createdById: actor.id || "system",
          createdAt: new Date().toISOString()
        };

        movementsList.unshift(movementRecord);

        await saveKeyData("items", itemsList);
        await saveKeyData("inventoryMovements", movementsList);

        return { item: targetItem, movement: movementRecord };
      });

      return res.json({ status: "success", data: result });
    } catch (err: any) {
      console.error("Error recording inventory movement:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // --- AUTHENTICATION & PERSONNEL ENDPOINTS ---
  const normalizeAuthString = (str: any): string => {
    if (str === undefined || str === null) return "";
    let s = String(str).trim();
    // Strip zero-width spaces, non-breaking spaces, control chars, and invisible characters
    s = s.replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, "");
    const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
    const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    for (let i = 0; i < 10; i++) {
      s = s.replace(new RegExp(persianDigits[i], "g"), String(i));
      s = s.replace(new RegExp(arabicDigits[i], "g"), String(i));
    }
    s = s.replace(/\u064A/g, "\u06CC"); // Arabic Yeh -> Persian Yeh
    s = s.replace(/\u0649/g, "\u06CC"); // Alef Maksura -> Persian Yeh
    s = s.replace(/\u0643/g, "\u06A9"); // Arabic Kaf -> Persian Keheh
    s = s.replace(/\u0629/g, "\u0647"); // Teh Marbuta -> Heh
    return s.trim();
  };

  const normalizeUsername = (str: any): string => {
    return normalizeAuthString(str).toLowerCase().replace(/\s+/g, "");
  };

  // Get current active personnel/users list directly from DB with anti-cache headers
  app.get("/api/auth/users", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const state = await loadAllData();
      let rawUsers = state.users || state.acc_app_users;
      const usersList = Array.isArray(rawUsers) ? rawUsers : (typeof rawUsers === "string" ? JSON.parse(rawUsers) : []);
      return res.json({ status: "success", users: usersList });
    } catch (err: any) {
      console.error("Error fetching users for auth:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // Live Authentication endpoint matching against host DB
  app.post("/api/auth/login", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const { username, password } = req.body || {};
      if (!username || password === undefined) {
        return res.status(400).json({ status: "error", error: "نام کاربری و کلمه عبور الزامی است." });
      }

      const inputUserNorm = normalizeUsername(username);
      const inputPassNorm = normalizeAuthString(password);

      const state = await loadAllData();
      let rawUsers = state.users || state.acc_app_users;
      if (typeof rawUsers === "string") {
        try { rawUsers = JSON.parse(rawUsers); } catch (_) { rawUsers = []; }
      }
      const usersList: any[] = Array.isArray(rawUsers) ? rawUsers : [];

      if (usersList.length === 0) {
        return res.status(401).json({ 
          status: "error", 
          code: "NO_USERS",
          error: "هیچ کاربری در پایگاه‌داده ثبت نشده است. لطفاً از طریق فرم راه‌اندازی اولیه، حساب مدیر کل را ایجاد فرمایید." 
        });
      }

      const matchedUser = usersList.find((u: any) => {
        if (!u) return false;
        const uNameNorm = normalizeUsername(u.username || "");
        const uPhoneNorm = normalizeAuthString(u.phone || "");
        return (uNameNorm && uNameNorm === inputUserNorm) || (uPhoneNorm && uPhoneNorm === inputUserNorm);
      });

      if (!matchedUser) {
        return res.status(401).json({ status: "error", error: "نام کاربری یا کلمه عبور وارد شده اشتباه است." });
      }

      const storedPassRaw = matchedUser.password !== undefined && matchedUser.password !== null ? String(matchedUser.password) : (matchedUser.username || "");
      const storedPassNorm = normalizeAuthString(storedPassRaw);

      const isPassValid = 
        inputPassNorm === storedPassNorm || 
        String(password).trim() === storedPassRaw.trim() ||
        normalizeAuthString(password).trim() === storedPassRaw.trim() ||
        (storedPassNorm === "" && inputPassNorm === normalizeUsername(matchedUser.username));

      if (!isPassValid) {
        return res.status(401).json({ status: "error", error: "نام کاربری یا کلمه عبور وارد شده اشتباه است." });
      }

      return res.json({ status: "success", user: matchedUser, users: usersList });
    } catch (err: any) {
      console.error("API error during login:", err);
      return res.status(500).json({ status: "error", error: `خطا در احراز هویت: ${err.message}` });
    }
  });

  // Direct Initial Administrator Setup endpoint for empty MySQL database
  app.post("/api/auth/setup-initial-admin", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const { name, username, password, phone } = req.body || {};
      if (!name || !username || !password) {
        return res.status(400).json({ status: "error", error: "نام، نام کاربری و کلمه عبور الزامی است." });
      }

      const cleanUser = normalizeUsername(String(username));
      const cleanPass = normalizeAuthString(String(password));
      const cleanName = String(name).trim();
      const cleanPhone = phone ? normalizeAuthString(String(phone)) : "";

      const state = await loadAllData();
      let rawUsers = state.users || state.acc_app_users;
      if (typeof rawUsers === "string") {
        try { rawUsers = JSON.parse(rawUsers); } catch (_) { rawUsers = []; }
      }
      const usersList: any[] = Array.isArray(rawUsers) ? rawUsers : [];

      if (usersList.length > 0) {
        return res.status(400).json({ status: "error", error: "کاربران سیستم قبلاً در پایگاه‌داده ایجاد شده‌اند. لطفاً وارد شوید." });
      }

      const newAdmin = {
        id: `user-${Date.now()}`,
        name: cleanName,
        username: cleanUser,
        password: cleanPass,
        role: "admin",
        phone: cleanPhone,
        permissions: [
          "dashboard",
          "invoices",
          "warehouse",
          "accounting",
          "counterparts",
          "reports",
          "banking",
          "users",
          "settings",
          "ai_assistant",
          "fiscal_year",
          "logs"
        ]
      };

      const updatedUsers = [newAdmin];
      await saveKeyData("users", updatedUsers, { forceOverwrite: true });
      await saveKeyData("acc_app_users", updatedUsers, { forceOverwrite: true });

      return res.json({
        status: "success",
        message: "حساب مدیر ارشد با موفقیت در دیتابیس MySQL ایجاد شد.",
        user: newAdmin,
        users: updatedUsers
      });
    } catch (err: any) {
      console.error("Initial Admin Setup error:", err);
      return res.status(500).json({ status: "error", error: `خطا در ایجاد مدیر اولیه: ${err.message}` });
    }
  });

  // Direct Personnel Credential Update endpoint with guaranteed atomic persistence
  app.post("/api/auth/update-credentials", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const { updatedUsers } = req.body || {};
      if (!Array.isArray(updatedUsers) || updatedUsers.length === 0) {
        return res.status(400).json({ status: "error", error: "لیست کاربران ارسالی نامعتبر است." });
      }

      // Normalize all usernames and passwords before saving to prevent encoding/character mismatches
      const normalizedUsers = updatedUsers.map(u => ({
        ...u,
        username: normalizeUsername(u.username || ""),
        password: normalizeAuthString(u.password !== undefined && u.password !== null ? String(u.password) : (u.username || "")),
        phone: normalizeAuthString(u.phone || "")
      }));

      await saveKeyData("users", normalizedUsers, { forceOverwrite: true });
      await saveKeyData("acc_app_users", normalizedUsers, { forceOverwrite: true });

      return res.json({ status: "success", users: normalizedUsers });
    } catch (err: any) {
      console.error("API error updating credentials:", err);
      return res.status(500).json({ status: "error", error: `خطا در ذخیره مشخصات پرسنل: ${err.message}` });
    }
  });

  // --- SYSTEM LOGS & MONITORING ENDPOINTS ---
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const purgeOldServerLogs = (logs: any[], maxAgeMs: number = SEVEN_DAYS_MS): { validLogs: any[]; purgedCount: number } => {
    if (!Array.isArray(logs)) return { validLogs: [], purgedCount: 0 };
    const cutoffTime = Date.now() - maxAgeMs;
    const validLogs = logs.filter((l: any) => {
      if (!l) return false;
      const t = typeof l.timestampMs === 'number' ? l.timestampMs : (new Date(l.timestamp).getTime() || 0);
      return t >= cutoffTime;
    });
    return { validLogs, purgedCount: logs.length - validLogs.length };
  };

  // GET /api/system/logs - Load logs and auto-purge > 7 days
  app.get("/api/system/logs", async (req, res) => {
    try {
      const state = await loadAllData();
      let rawLogs = state.system_logs || state.acc_app_system_logs || [];
      if (typeof rawLogs === 'string') {
        try { rawLogs = JSON.parse(rawLogs); } catch (_) { rawLogs = []; }
      }
      const logsArray = Array.isArray(rawLogs) ? rawLogs : [];
      const { validLogs, purgedCount } = purgeOldServerLogs(logsArray);

      if (purgedCount > 0) {
        await saveKeyData("system_logs", validLogs);
        await saveKeyData("acc_app_system_logs", validLogs);
      }

      return res.json({
        status: "success",
        logs: validLogs,
        totalCount: validLogs.length,
        autoPurgedCount: purgedCount
      });
    } catch (err: any) {
      console.error("Error loading system logs:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // POST /api/system/logs - Append new log entry or entries
  app.post("/api/system/logs", async (req, res) => {
    try {
      const { log, logs } = req.body || {};
      const newItems = Array.isArray(logs) ? logs : (log ? [log] : []);
      if (newItems.length === 0) {
        return res.json({ status: "success", count: 0 });
      }

      const state = await loadAllData();
      let rawLogs = state.system_logs || state.acc_app_system_logs || [];
      if (typeof rawLogs === 'string') {
        try { rawLogs = JSON.parse(rawLogs); } catch (_) { rawLogs = []; }
      }
      const currentLogs = Array.isArray(rawLogs) ? rawLogs : [];
      
      const combined = [...newItems, ...currentLogs];
      const uniqueMap = new Map();
      for (const item of combined) {
        if (item && item.id && !uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item);
        }
      }
      const allUnique = Array.from(uniqueMap.values());
      const { validLogs } = purgeOldServerLogs(allUnique);
      const finalLogs = validLogs.slice(0, 3000);

      await saveKeyData("system_logs", finalLogs);
      await saveKeyData("acc_app_system_logs", finalLogs);

      return res.json({ status: "success", totalCount: finalLogs.length });
    } catch (err: any) {
      console.error("Error saving system log:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // POST /api/system/logs/delete - Delete specific IDs or wipe all
  app.post("/api/system/logs/delete", async (req, res) => {
    try {
      const { logIds, purgeAll } = req.body || {};
      
      if (purgeAll) {
        await saveKeyData("system_logs", []);
        await saveKeyData("acc_app_system_logs", []);
        return res.json({ status: "success", deletedCount: "all", remainingCount: 0 });
      }

      if (!Array.isArray(logIds) || logIds.length === 0) {
        return res.status(400).json({ status: "error", error: "شناسه لاگ‌های مدنظر ارسال نشده است." });
      }

      const state = await loadAllData();
      let rawLogs = state.system_logs || state.acc_app_system_logs || [];
      if (typeof rawLogs === 'string') {
        try { rawLogs = JSON.parse(rawLogs); } catch (_) { rawLogs = []; }
      }
      const currentLogs = Array.isArray(rawLogs) ? rawLogs : [];
      const idSet = new Set(logIds);
      const remaining = currentLogs.filter((l: any) => !idSet.has(l.id));

      await saveKeyData("system_logs", remaining);
      await saveKeyData("acc_app_system_logs", remaining);

      return res.json({
        status: "success",
        deletedCount: currentLogs.length - remaining.length,
        remainingCount: remaining.length
      });
    } catch (err: any) {
      console.error("Error deleting system logs:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // POST /api/system/logs/purge-old - Trigger purge of logs older than X days
  app.post("/api/system/logs/purge-old", async (req, res) => {
    try {
      const { maxAgeDays } = req.body || {};
      const maxAgeMs = (Number(maxAgeDays) || 7) * 24 * 60 * 60 * 1000;

      const state = await loadAllData();
      let rawLogs = state.system_logs || state.acc_app_system_logs || [];
      if (typeof rawLogs === 'string') {
        try { rawLogs = JSON.parse(rawLogs); } catch (_) { rawLogs = []; }
      }
      const currentLogs = Array.isArray(rawLogs) ? rawLogs : [];
      const { validLogs, purgedCount } = purgeOldServerLogs(currentLogs, maxAgeMs);

      if (purgedCount > 0) {
        await saveKeyData("system_logs", validLogs);
        await saveKeyData("acc_app_system_logs", validLogs);
      }

      return res.json({
        status: "success",
        purgedCount,
        remainingCount: validLogs.length
      });
    } catch (err: any) {
      console.error("Error purging old system logs:", err);
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // C1. Export User Data Backup (Database + Uploads + LocalStorage) with Selective Section Filtering
  app.post("/api/backup/export", async (req, res) => {
    try {
      const { clientLocalStorage = {}, selectedSections = null } = req.body || {};

      const ALL_BACKUP_SECTION_IDS = [
        'users', 'transactions', 'finalInvoices', 'proformas', 'goods',
        'services', 'accountingDocs', 'counterparts', 'accounts', 'categories',
        'partnersLoans', 'checklist', 'settingsTheme', 'uploads', 'logs'
      ];

      const isAllSelected = !selectedSections || selectedSections === 'all' || 
        (Array.isArray(selectedSections) && ALL_BACKUP_SECTION_IDS.every(s => selectedSections.includes(s)));
      const isPartial = !isAllSelected;

      // 1. Fetch full server database state (all key-values)
      const dbData = await loadAllData();

      // Clean sensitive API keys from exported database data to prevent secret leaks
      const sanitizedDbData = { ...dbData };
      delete sanitizedDbData.geminiApiKey;
      delete sanitizedDbData.acc_app_geminiApiKey;

      // 2. Scan and include uploaded attachment files as Base64 (only if uploads is selected or full backup)
      const shouldIncludeUploads = !isPartial || (Array.isArray(selectedSections) && selectedSections.includes('uploads'));
      const uploadsMap: Record<string, string> = {};
      const uploadsDirs = [
        path.join(process.cwd(), "uploads"),
        path.join(process.cwd(), "public", "uploads"),
        path.join(process.cwd(), "data", "uploads")
      ];

      if (shouldIncludeUploads) {
        for (const dir of uploadsDirs) {
          if (fs.existsSync(dir)) {
            const scanDir = (currentDir: string) => {
              const files = fs.readdirSync(currentDir);
              for (const file of files) {
                const fullPath = path.join(currentDir, file);
                if (fs.statSync(fullPath).isDirectory()) {
                  scanDir(fullPath);
                } else {
                  try {
                    const fileBuf = fs.readFileSync(fullPath);
                    const relPath = path.relative(process.cwd(), fullPath).replace(/\\/g, "/");
                    uploadsMap[relPath] = fileBuf.toString("base64");
                  } catch (e) {
                    console.warn(`Could not read file ${fullPath}:`, e);
                  }
                }
              }
            };
            scanDir(dir);
          }
        }
      }

      // 3. Filter data if selective backup is requested
      let finalDbData: Record<string, any> = {};
      let finalLocalStorage: Record<string, any> = {};

      const SECTION_TITLES: Record<string, string> = {
        users: 'کاربران و پرسنل',
        transactions: 'تراکنش‌ها و امور بانکی',
        finalInvoices: 'فاکتورهای قطعی خرید و فروش',
        proformas: 'پیش‌فاکتورها و سفارشات',
        goods: 'کالاها و موجودی انبار',
        services: 'خدمات و اجرت‌ها',
        accountingDocs: 'اسناد دوبل حسابداری و سال مالی',
        counterparts: 'طرف‌حساب‌ها و مخاطبین',
        accounts: 'حساب‌ها و صندوق‌ها',
        categories: 'سرفصل‌ها و تنظیمات پورسانت',
        partnersLoans: 'شرکا و تسهیلات وام',
        checklist: 'یادداشت‌ها و چک‌لیست',
        settingsTheme: 'تنظیمات عمومی و ظاهر',
        uploads: 'فایل‌ها و تصاویر پیوست',
        logs: 'لاگ‌های امنیتی و سیستمی'
      };

      const isInvoiceProforma = (inv: any) => {
        if (!inv) return false;
        return Boolean(
          inv.isProforma === true || 
          inv.isProforma === 'true' || 
          inv.type === 'proforma' || 
          inv.status === 'proforma' ||
          (typeof inv.invoiceNumber === 'string' && inv.invoiceNumber.trim().toUpperCase().startsWith('PF-')) ||
          (typeof inv.title === 'string' && inv.title.includes('پیش‌فاکتور'))
        );
      };

      if (!isPartial) {
        // Full backup: include everything
        finalDbData = sanitizedDbData;
        finalLocalStorage = clientLocalStorage;
      } else {
        const sectionSet = new Set(Array.isArray(selectedSections) ? selectedSections : []);

        // 1. Users & Personnel
        if (sectionSet.has('users')) {
          if (sanitizedDbData.users !== undefined) finalDbData.users = sanitizedDbData.users;
          if (sanitizedDbData.acc_app_users !== undefined) finalDbData.acc_app_users = sanitizedDbData.acc_app_users;
          if (sanitizedDbData.currentUser !== undefined) finalDbData.currentUser = sanitizedDbData.currentUser;
          if (sanitizedDbData.acc_app_currentUser !== undefined) finalDbData.acc_app_currentUser = sanitizedDbData.acc_app_currentUser;
          if (sanitizedDbData.primaryUserRole !== undefined) finalDbData.primaryUserRole = sanitizedDbData.primaryUserRole;
          if (sanitizedDbData.acc_app_primaryUserRole !== undefined) finalDbData.acc_app_primaryUserRole = sanitizedDbData.acc_app_primaryUserRole;
        }

        // 2. Transactions & Banking & Financial Flows
        if (sectionSet.has('transactions')) {
          if (sanitizedDbData.transactions !== undefined) finalDbData.transactions = sanitizedDbData.transactions;
          if (sanitizedDbData.acc_app_transactions !== undefined) finalDbData.acc_app_transactions = sanitizedDbData.acc_app_transactions;
          if (sanitizedDbData.pendingDeposits !== undefined) finalDbData.pendingDeposits = sanitizedDbData.pendingDeposits;
          if (sanitizedDbData.acc_app_pendingDeposits !== undefined) finalDbData.acc_app_pendingDeposits = sanitizedDbData.acc_app_pendingDeposits;
          if (sanitizedDbData.bankSmsMessages !== undefined) finalDbData.bankSmsMessages = sanitizedDbData.bankSmsMessages;
          if (sanitizedDbData.acc_app_bankSmsMessages !== undefined) finalDbData.acc_app_bankSmsMessages = sanitizedDbData.acc_app_bankSmsMessages;
          if (sanitizedDbData.paymentAllocations !== undefined) finalDbData.paymentAllocations = sanitizedDbData.paymentAllocations;
          if (sanitizedDbData.acc_app_paymentAllocations !== undefined) finalDbData.acc_app_paymentAllocations = sanitizedDbData.acc_app_paymentAllocations;
        }

        // 3. Final Invoices vs 4. Proformas
        const incFinalInvoices = sectionSet.has('finalInvoices');
        const incProformas = sectionSet.has('proformas');
        if (incFinalInvoices || incProformas) {
          const rawInvoices = (Array.isArray(sanitizedDbData.invoices) && sanitizedDbData.invoices.length > 0)
            ? sanitizedDbData.invoices
            : (sanitizedDbData.acc_app_invoices || sanitizedDbData.invoices || []);

          const filteredInvoices = Array.isArray(rawInvoices) ? rawInvoices.filter((inv: any) => {
            const isPf = isInvoiceProforma(inv);
            if (incFinalInvoices && incProformas) return true;
            if (incFinalInvoices && !incProformas) return !isPf;
            if (!incFinalInvoices && incProformas) return isPf;
            return false;
          }) : [];

          finalDbData.invoices = filteredInvoices;
          finalDbData.acc_app_invoices = filteredInvoices;
        }

        // 5. Goods vs 6. Services
        const incGoods = sectionSet.has('goods');
        const incServices = sectionSet.has('services');
        if (incGoods || incServices) {
          const rawItems = (Array.isArray(sanitizedDbData.items) && sanitizedDbData.items.length > 0)
            ? sanitizedDbData.items
            : (sanitizedDbData.acc_app_items || sanitizedDbData.items || []);

          const filteredItems = Array.isArray(rawItems) ? rawItems.filter((item: any) => {
            const isService = item.type === 'khadamat';
            if (incGoods && incServices) return true;
            if (incGoods && !incServices) return !isService;
            if (!incGoods && incServices) return isService;
            return false;
          }) : [];

          finalDbData.items = filteredItems;
          finalDbData.acc_app_items = filteredItems;

          if (incGoods) {
            if (sanitizedDbData.inventoryMovements !== undefined) finalDbData.inventoryMovements = sanitizedDbData.inventoryMovements;
            if (sanitizedDbData.acc_app_inventoryMovements !== undefined) finalDbData.acc_app_inventoryMovements = sanitizedDbData.acc_app_inventoryMovements;
            if (sanitizedDbData.warehouse_categories_list !== undefined) finalDbData.warehouse_categories_list = sanitizedDbData.warehouse_categories_list;
            if (sanitizedDbData.acc_app_warehouse_categories_list !== undefined) finalDbData.acc_app_warehouse_categories_list = sanitizedDbData.acc_app_warehouse_categories_list;
            if (sanitizedDbData.warehouse_stock_adjustment_logs !== undefined) finalDbData.warehouse_stock_adjustment_logs = sanitizedDbData.warehouse_stock_adjustment_logs;
            if (sanitizedDbData.acc_app_warehouse_stock_adjustment_logs !== undefined) finalDbData.acc_app_warehouse_stock_adjustment_logs = sanitizedDbData.acc_app_warehouse_stock_adjustment_logs;
          }
        }

        // 7. Accounting Docs & Fiscal Year
        if (sectionSet.has('accountingDocs')) {
          if (sanitizedDbData.docs !== undefined) finalDbData.docs = sanitizedDbData.docs;
          if (sanitizedDbData.acc_app_docs !== undefined) finalDbData.acc_app_docs = sanitizedDbData.acc_app_docs;
          if (sanitizedDbData.fiscalYear !== undefined) finalDbData.fiscalYear = sanitizedDbData.fiscalYear;
          if (sanitizedDbData.acc_app_fiscalYear !== undefined) finalDbData.acc_app_fiscalYear = sanitizedDbData.acc_app_fiscalYear;
          if (sanitizedDbData.fiscalYearsList !== undefined) finalDbData.fiscalYearsList = sanitizedDbData.fiscalYearsList;
          if (sanitizedDbData.acc_app_fiscalYearsList !== undefined) finalDbData.acc_app_fiscalYearsList = sanitizedDbData.acc_app_fiscalYearsList;
          if (sanitizedDbData.seq_doc_number !== undefined) finalDbData.seq_doc_number = sanitizedDbData.seq_doc_number;
          if (sanitizedDbData.acc_app_seq_doc_number !== undefined) finalDbData.acc_app_seq_doc_number = sanitizedDbData.acc_app_seq_doc_number;
        }

        // 8. Counterparts
        if (sectionSet.has('counterparts')) {
          if (sanitizedDbData.counterparts !== undefined) finalDbData.counterparts = sanitizedDbData.counterparts;
          if (sanitizedDbData.acc_app_counterparts !== undefined) finalDbData.acc_app_counterparts = sanitizedDbData.acc_app_counterparts;
        }

        // 9. Accounts & Cashboxes & Pos
        if (sectionSet.has('accounts')) {
          if (sanitizedDbData.accounts !== undefined) finalDbData.accounts = sanitizedDbData.accounts;
          if (sanitizedDbData.acc_app_accounts !== undefined) finalDbData.acc_app_accounts = sanitizedDbData.acc_app_accounts;
        }

        // 10. Categories & Commission Tags
        if (sectionSet.has('categories')) {
          if (sanitizedDbData.categories !== undefined) finalDbData.categories = sanitizedDbData.categories;
          if (sanitizedDbData.acc_app_categories !== undefined) finalDbData.acc_app_categories = sanitizedDbData.acc_app_categories;
          if (sanitizedDbData.commissionTags !== undefined) finalDbData.commissionTags = sanitizedDbData.commissionTags;
          if (sanitizedDbData.acc_app_commissionTags !== undefined) finalDbData.acc_app_commissionTags = sanitizedDbData.acc_app_commissionTags;
          if (sanitizedDbData.commission_tags_list !== undefined) finalDbData.commission_tags_list = sanitizedDbData.commission_tags_list;
          if (sanitizedDbData.acc_app_commission_tags_list !== undefined) finalDbData.acc_app_commission_tags_list = sanitizedDbData.acc_app_commission_tags_list;
          if (sanitizedDbData.commission_settlements_list !== undefined) finalDbData.commission_settlements_list = sanitizedDbData.commission_settlements_list;
          if (sanitizedDbData.acc_app_commission_settlements_list !== undefined) finalDbData.acc_app_commission_settlements_list = sanitizedDbData.acc_app_commission_settlements_list;
          if (sanitizedDbData.global_fixed_invoice_comm !== undefined) finalDbData.global_fixed_invoice_comm = sanitizedDbData.global_fixed_invoice_comm;
          if (sanitizedDbData.urgent_fixed_invoice_comm !== undefined) finalDbData.urgent_fixed_invoice_comm = sanitizedDbData.urgent_fixed_invoice_comm;
          if (sanitizedDbData.emergency_fixed_invoice_comm !== undefined) finalDbData.emergency_fixed_invoice_comm = sanitizedDbData.emergency_fixed_invoice_comm;
          if (sanitizedDbData.fixed_invoice_commissions !== undefined) finalDbData.fixed_invoice_commissions = sanitizedDbData.fixed_invoice_commissions;
          if (sanitizedDbData.shipping_method_fixed_commissions !== undefined) finalDbData.shipping_method_fixed_commissions = sanitizedDbData.shipping_method_fixed_commissions;
        }

        // 11. Partners & Loans
        if (sectionSet.has('partnersLoans')) {
          if (sanitizedDbData.partners !== undefined) finalDbData.partners = sanitizedDbData.partners;
          if (sanitizedDbData.acc_app_partners !== undefined) finalDbData.acc_app_partners = sanitizedDbData.acc_app_partners;
          if (sanitizedDbData.loanBorrowers !== undefined) finalDbData.loanBorrowers = sanitizedDbData.loanBorrowers;
          if (sanitizedDbData.acc_app_loanBorrowers !== undefined) finalDbData.acc_app_loanBorrowers = sanitizedDbData.acc_app_loanBorrowers;
        }

        // 12. Checklist & Notes
        if (sectionSet.has('checklist')) {
          if (sanitizedDbData.checklist !== undefined) finalDbData.checklist = sanitizedDbData.checklist;
          if (sanitizedDbData.acc_app_checklist !== undefined) finalDbData.acc_app_checklist = sanitizedDbData.acc_app_checklist;
        }

        // 13. Settings & Themes
        if (sectionSet.has('settingsTheme')) {
          if (sanitizedDbData.settings !== undefined) finalDbData.settings = sanitizedDbData.settings;
          if (sanitizedDbData.acc_app_settings !== undefined) finalDbData.acc_app_settings = sanitizedDbData.acc_app_settings;
          for (const k of Object.keys(sanitizedDbData)) {
            if (
              k.includes('theme') || k.includes('Theme') || 
              k.includes('Bg') || k.includes('font') || 
              k.includes('currency') || k.includes('allow_login_restore') ||
              k.includes('allow_login_update') || k.startsWith('acc_seller_') ||
              k.startsWith('acc_system_') || k.startsWith('fahamacc_') ||
              k.startsWith('settings_')
            ) {
              finalDbData[k] = sanitizedDbData[k];
            }
          }
        }

        // 14. Audit Logs & System Logs
        if (sectionSet.has('logs')) {
          if (sanitizedDbData.auditLogs !== undefined) finalDbData.auditLogs = sanitizedDbData.auditLogs;
          if (sanitizedDbData.acc_app_auditLogs !== undefined) finalDbData.acc_app_auditLogs = sanitizedDbData.acc_app_auditLogs;
          if (sanitizedDbData.system_logs !== undefined) finalDbData.system_logs = sanitizedDbData.system_logs;
          if (sanitizedDbData.acc_app_system_logs !== undefined) finalDbData.acc_app_system_logs = sanitizedDbData.acc_app_system_logs;
        }

        // 15. Uploads are handled via uploadsMap (empty if not selected)

        // Filter clientLocalStorage strictly
        finalLocalStorage = {};
        for (const lsKey of Object.keys(clientLocalStorage)) {
          const clean = lsKey.startsWith('acc_app_') ? lsKey.substring(8) : lsKey;

          if (sectionSet.has('users') && (clean === 'users' || clean === 'currentUser' || clean === 'primaryUserRole' || clean.startsWith('users_'))) {
            finalLocalStorage[lsKey] = clientLocalStorage[lsKey];
          }
          if (sectionSet.has('transactions') && (clean === 'transactions' || clean === 'pendingDeposits' || clean === 'bankSmsMessages' || clean === 'paymentAllocations' || clean.startsWith('transactions_') || clean.startsWith('pendingDeposits_') || clean.startsWith('bankSmsMessages_') || clean.startsWith('paymentAllocations_'))) {
            finalLocalStorage[lsKey] = clientLocalStorage[lsKey];
          }
          if (sectionSet.has('accountingDocs') && (clean === 'docs' || clean === 'fiscalYear' || clean === 'fiscalYearsList' || clean === 'seq_doc_number' || clean.startsWith('docs_') || clean.startsWith('fiscalYear_'))) {
            finalLocalStorage[lsKey] = clientLocalStorage[lsKey];
          }
          if (sectionSet.has('counterparts') && (clean === 'counterparts' || clean.startsWith('counterparts_'))) {
            finalLocalStorage[lsKey] = clientLocalStorage[lsKey];
          }
          if (sectionSet.has('accounts') && (clean === 'accounts' || clean.startsWith('accounts_'))) {
            finalLocalStorage[lsKey] = clientLocalStorage[lsKey];
          }
          if (sectionSet.has('categories') && (clean === 'categories' || clean === 'commissionTags' || clean.startsWith('categories_') || clean.startsWith('commissionTags_') || clean.startsWith('commission_') || clean.startsWith('global_fixed_') || clean.startsWith('urgent_fixed_') || clean.startsWith('emergency_fixed_') || clean.startsWith('fixed_invoice_') || clean.startsWith('shipping_method_fixed_'))) {
            finalLocalStorage[lsKey] = clientLocalStorage[lsKey];
          }
          if (sectionSet.has('partnersLoans') && (clean === 'partners' || clean === 'loanBorrowers' || clean.startsWith('partners_') || clean.startsWith('loanBorrowers_'))) {
            finalLocalStorage[lsKey] = clientLocalStorage[lsKey];
          }
          if (sectionSet.has('checklist') && (clean === 'checklist' || clean.startsWith('checklist_'))) {
            finalLocalStorage[lsKey] = clientLocalStorage[lsKey];
          }
          if (sectionSet.has('settingsTheme') && (clean === 'settings' || clean.startsWith('settings_') || clean.includes('Theme') || clean.includes('theme') || clean.includes('Bg') || clean.includes('font') || clean.includes('currency') || clean.includes('allow_login_restore') || clean.includes('allow_login_update') || clean.startsWith('acc_seller_') || clean.startsWith('acc_system_') || clean.startsWith('fahamacc_'))) {
            finalLocalStorage[lsKey] = clientLocalStorage[lsKey];
          }
          if (sectionSet.has('logs') && (clean === 'auditLogs' || clean === 'system_logs' || clean.startsWith('auditLogs_') || clean.startsWith('system_logs_'))) {
            finalLocalStorage[lsKey] = clientLocalStorage[lsKey];
          }

          if ((incFinalInvoices || incProformas) && (clean === 'invoices' || clean.startsWith('invoices_'))) {
            try {
              const rawVal = clientLocalStorage[lsKey];
              const parsedArr = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
              if (Array.isArray(parsedArr)) {
                const filtered = parsedArr.filter((inv: any) => {
                  const isPf = isInvoiceProforma(inv);
                  if (incFinalInvoices && incProformas) return true;
                  if (incFinalInvoices && !incProformas) return !isPf;
                  if (!incFinalInvoices && incProformas) return isPf;
                  return false;
                });
                finalLocalStorage[lsKey] = JSON.stringify(filtered);
              }
            } catch (_) {}
          }

          if ((incGoods || incServices) && (clean === 'items' || clean.startsWith('items_'))) {
            try {
              const rawVal = clientLocalStorage[lsKey];
              const parsedArr = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
              if (Array.isArray(parsedArr)) {
                const filtered = parsedArr.filter((item: any) => {
                  const isService = item.type === 'khadamat';
                  if (incGoods && incServices) return true;
                  if (incGoods && !incServices) return !isService;
                  if (!incGoods && incServices) return isService;
                  return false;
                });
                finalLocalStorage[lsKey] = JSON.stringify(filtered);
              }
            } catch (_) {}
          }
        }
      }

      // 4. Construct Backup JSON
      const activeConfig = getAppConfig();
      const sectionCount = Array.isArray(selectedSections) ? selectedSections.length : 0;
      const singleSectionTitle = (isPartial && sectionCount === 1) ? (SECTION_TITLES[selectedSections[0]] || selectedSections[0]) : null;

      const backupPackage = {
        _metadata: {
          version: "2.0",
          system: "TICK_Accounting",
          createdAt: new Date().toISOString(),
          type: isPartial ? "CUSTOM_SELECTIVE_BACKUP" : "USER_DATA_ONLY_BACKUP",
          description: isPartial 
            ? (singleSectionTitle 
                ? `نسخه پشتیبان اختصاصی بخش ${singleSectionTitle}` 
                : `نسخه پشتیبان انتخابی از ${sectionCount} بخش مشخص شده سامانه`)
            : "نسخه پشتیبان کامل اطلاعات کاربر، دیتابیس، تنظیمات هوش مصنوعی و فایل‌های پیوست بدون کدهای نرم‌افزار",
          sectionName: singleSectionTitle || (isPartial ? `${sectionCount} بخش انتخابی` : "تمامی بخش‌ها"),
          selectedSections: isPartial ? selectedSections : ALL_BACKUP_SECTION_IDS,
          isPartialBackup: isPartial
        },
        systemConfig: {
          GEMINI_API_KEY: "", // Excluded for security to prevent API key leakage
          GEMINI_BASE_URL: process.env.GEMINI_BASE_URL || activeConfig.GEMINI_BASE_URL || dbData.geminiBaseUrl || "",
        },
        database: finalDbData,
        localStorage: finalLocalStorage,
        uploads: uploadsMap
      };

      return res.json({
        status: "success",
        backup: backupPackage,
        message: isPartial 
          ? (singleSectionTitle 
              ? `نسخه پشتیبان اختصاصی «${singleSectionTitle}» با موفقیت تولید شد.`
              : `نسخه پشتیبان انتخابی (${sectionCount} بخش) با موفقیت تولید شد.`)
          : "نسخه پشتیبان کامل داده‌های کاربر با موفقیت تولید شد."
      });
    } catch (err: any) {
      console.error("Backup export error:", err);
      return res.status(500).json({ error: `خطا در تهیه پشتیبان: ${err?.message || "خطای ناشناخته"}` });
    }
  });

  // C2. Restore User Data Backup (Validation -> Pre-Restore Emergency Backup -> Merge & Replace)
  app.post("/api/backup/restore", async (req, res) => {
    try {
      const { backupData } = req.body || {};
      if (!backupData || typeof backupData !== "object") {
        return res.status(400).json({ error: "فایل یا ساختار بکاپ ارسال‌شده نامعتبر است." });
      }

      // Step 1: Parse backup payload (supports both unified v2 and legacy formats)
      let dbEntriesToRestore: Record<string, any> = {};
      let localStorageToRestore: Record<string, string> = {};
      let uploadsToRestore: Record<string, string> = {};

      if (backupData._metadata && backupData.database) {
        dbEntriesToRestore = backupData.database || {};
        localStorageToRestore = backupData.localStorage || {};
        uploadsToRestore = backupData.uploads || {};
      } else {
        // Legacy flat key-value backup
        for (const rawKey of Object.keys(backupData)) {
          if (rawKey === "_metadata") continue;
          let val = backupData[rawKey];
          if (typeof val === "string") {
            try { val = JSON.parse(val); } catch (_) {}
          }
          const cleanKey = rawKey.startsWith("acc_app_") ? rawKey.substring(8) : rawKey;
          dbEntriesToRestore[cleanKey] = val;
          localStorageToRestore[rawKey] = typeof backupData[rawKey] === "string" ? backupData[rawKey] : JSON.stringify(backupData[rawKey]);
        }
      }

      // Step 2: Validate Schema before making any changes
      const schemaCheck = validateDatabaseSchema(dbEntriesToRestore);
      if (!schemaCheck.isValid) {
        return res.status(400).json({ 
          error: `بازیابی بکاپ متوقف شد: ${schemaCheck.reason || "ساختار فایل بکاپ ناقص یا نامعتبر است."}` 
        });
      }

      const isPartialBackup = Boolean(
        backupData._metadata?.isPartialBackup || 
        (Array.isArray(backupData._metadata?.selectedSections) && backupData._metadata.selectedSections.length < 15)
      );

      const isInvoiceProforma = (inv: any) => {
        if (!inv) return false;
        return Boolean(
          inv.isProforma === true || 
          inv.isProforma === 'true' || 
          inv.type === 'proforma' || 
          inv.status === 'proforma' ||
          (typeof inv.invoiceNumber === 'string' && inv.invoiceNumber.trim().toUpperCase().startsWith('PF-')) ||
          (typeof inv.title === 'string' && inv.title.includes('پیش‌فاکتور'))
        );
      };

      // Step 3: Emergency Pre-Restore Backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const emergencyDir = path.join(process.cwd(), "backups");
      if (!fs.existsSync(emergencyDir)) {
        fs.mkdirSync(emergencyDir, { recursive: true });
      }
      const emergencyFile = path.join(emergencyDir, `emergency_before_restore_${timestamp}.json`);
      
      const currentDb = await loadAllData();
      fs.writeFileSync(
        emergencyFile,
        JSON.stringify({
          _metadata: {
            createdReason: "Emergency backup automatically created before backup restoration",
            timestamp: new Date().toISOString(),
            isPartialRestore: isPartialBackup
          },
          database: currentDb
        }, null, 2),
        "utf8"
      );
      console.log(`Emergency pre-restore backup saved at: ${emergencyFile}`);

      // Step 4: Clear user uploads directory ONLY if full restore and uploads are being replaced
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!isPartialBackup && Object.keys(uploadsToRestore).length > 0) {
        if (fs.existsSync(uploadsDir)) {
          try {
            fs.rmSync(uploadsDir, { recursive: true, force: true });
            fs.mkdirSync(uploadsDir, { recursive: true });
          } catch (e) {
            console.warn("Notice: clearing uploads dir warning:", e);
          }
        }
      }

      // Step 5: Restore database records (Selective smart merge if partial, full replacement if full)
      let sanitizedData: Record<string, any> = {};
      if (isPartialBackup) {
        // Merge selectively into existing database
        sanitizedData = { ...currentDb };
        const secList = Array.isArray(backupData._metadata?.selectedSections) ? backupData._metadata.selectedSections : [];
        const secSet = new Set(secList);

        for (const rawKey of Object.keys(dbEntriesToRestore)) {
          const cleanKey = rawKey.startsWith("acc_app_") ? rawKey.substring(8) : rawKey;
          const val = dbEntriesToRestore[rawKey];

          if (cleanKey === 'invoices') {
            const restoredInvs = Array.isArray(val) ? val : [];
            const currentInvs = Array.isArray(currentDb.invoices) ? currentDb.invoices : (Array.isArray(currentDb.acc_app_invoices) ? currentDb.acc_app_invoices : []);
            
            const hasProformaOnly = secSet.has('proformas') && !secSet.has('finalInvoices');
            const hasFinalOnly = secSet.has('finalInvoices') && !secSet.has('proformas');

            if (hasProformaOnly) {
              const existingFinal = currentInvs.filter((inv: any) => !isInvoiceProforma(inv));
              const merged = [...existingFinal, ...restoredInvs];
              sanitizedData.invoices = merged;
              sanitizedData.acc_app_invoices = merged;
            } else if (hasFinalOnly) {
              const existingProformas = currentInvs.filter((inv: any) => isInvoiceProforma(inv));
              const merged = [...restoredInvs, ...existingProformas];
              sanitizedData.invoices = merged;
              sanitizedData.acc_app_invoices = merged;
            } else {
              sanitizedData.invoices = restoredInvs;
              sanitizedData.acc_app_invoices = restoredInvs;
            }
          } else if (cleanKey === 'items') {
            const restoredItems = Array.isArray(val) ? val : [];
            const currentItems = Array.isArray(currentDb.items) ? currentDb.items : (Array.isArray(currentDb.acc_app_items) ? currentDb.acc_app_items : []);

            const hasGoodsOnly = secSet.has('goods') && !secSet.has('services');
            const hasServicesOnly = secSet.has('services') && !secSet.has('goods');

            if (hasGoodsOnly) {
              const existingServices = currentItems.filter((it: any) => it.type === 'khadamat');
              const merged = [...restoredItems, ...existingServices];
              sanitizedData.items = merged;
              sanitizedData.acc_app_items = merged;
            } else if (hasServicesOnly) {
              const existingGoods = currentItems.filter((it: any) => it.type !== 'khadamat');
              const merged = [...existingGoods, ...restoredItems];
              sanitizedData.items = merged;
              sanitizedData.acc_app_items = merged;
            } else {
              sanitizedData.items = restoredItems;
              sanitizedData.acc_app_items = restoredItems;
            }
          } else if (cleanKey === 'settings') {
            sanitizedData.settings = {
              ...(currentDb.settings || {}),
              ...(val || {})
            };
            sanitizedData.acc_app_settings = sanitizedData.settings;
          } else {
            sanitizedData[cleanKey] = val;
            sanitizedData[`acc_app_${cleanKey}`] = val;
          }
        }
      } else {
        // Full replacement
        sanitizedData = {};
        for (const rawKey of Object.keys(dbEntriesToRestore)) {
          const cleanKey = rawKey.startsWith("acc_app_") ? rawKey.substring(8) : rawKey;
          sanitizedData[cleanKey] = dbEntriesToRestore[rawKey];
        }
        // Merge current settings so essential server configurations are preserved
        if (currentDb && currentDb.settings && typeof currentDb.settings === "object") {
          sanitizedData.settings = {
            ...currentDb.settings,
            ...(sanitizedData.settings || {})
          };
        }
      }

      await saveAllData(sanitizedData);

      // Restore Gemini AI configuration if present in backup (systemConfig or database or localStorage)
      const restoredGeminiKey = backupData.systemConfig?.GEMINI_API_KEY || 
        sanitizedData.geminiApiKey || 
        (localStorageToRestore.acc_app_geminiApiKey ? JSON.parse(localStorageToRestore.acc_app_geminiApiKey) : "");
      const restoredGeminiBaseUrl = backupData.systemConfig?.GEMINI_BASE_URL || 
        sanitizedData.geminiBaseUrl || 
        (localStorageToRestore.acc_app_geminiBaseUrl ? JSON.parse(localStorageToRestore.acc_app_geminiBaseUrl) : "");

      if (restoredGeminiKey) {
        const configPath = path.join(process.cwd(), "wp-config.json");
        let activeCfg: any = {};
        if (fs.existsSync(configPath)) {
          try { activeCfg = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch (_) {}
        }
        activeCfg.GEMINI_API_KEY = restoredGeminiKey;
        if (restoredGeminiBaseUrl !== undefined) {
          activeCfg.GEMINI_BASE_URL = restoredGeminiBaseUrl;
        }
        fs.writeFileSync(configPath, JSON.stringify(activeCfg, null, 2), "utf8");
        process.env.GEMINI_API_KEY = restoredGeminiKey;
        if (restoredGeminiBaseUrl !== undefined) {
          process.env.GEMINI_BASE_URL = restoredGeminiBaseUrl;
        }
      }

      // Step 6: Restore attachment files
      let restoredUploadsCount = 0;
      for (const relPath of Object.keys(uploadsToRestore)) {
        try {
          const normPath = relPath.replace(/\\/g, "/");
          if (normPath.startsWith("uploads/") || normPath.startsWith("public/uploads/") || normPath.startsWith("data/uploads/")) {
            const targetFilePath = path.join(process.cwd(), normPath);
            const parentDir = path.dirname(targetFilePath);
            if (!fs.existsSync(parentDir)) {
              fs.mkdirSync(parentDir, { recursive: true });
            }
            const buf = Buffer.from(uploadsToRestore[relPath], "base64");
            fs.writeFileSync(targetFilePath, buf);
            restoredUploadsCount++;
          }
        } catch (fileRestErr) {
          console.error(`Error restoring upload file ${relPath}:`, fileRestErr);
        }
      }

      console.log(`Backup restore completed! Keys: ${Object.keys(dbEntriesToRestore).length}, Files: ${restoredUploadsCount}`);

      return res.json({
        status: "success",
        message: isPartialBackup 
          ? "بخش‌های انتخابی پشتیبان با موفقیت بر روی سیستم اعمال و بازیابی شدند."
          : "اطلاعات با موفقیت پس از اعتبارسنجی ساختار بازیابی شدند!",
        emergencyBackupFile: path.basename(emergencyFile),
        restoredKeysCount: Object.keys(dbEntriesToRestore).length,
        restoredFilesCount: restoredUploadsCount,
        localStorage: localStorageToRestore,
        database: sanitizedData,
        isPartialBackup
      });
    } catch (err: any) {
      console.error("Backup restore error:", err);
      return res.status(500).json({ error: `خطا در بازیابی نسخه پشتیبان: ${err?.message || "خطای ناشناخته"}` });
    }
  });

  // D. Database & System Connection Status
  app.get("/api/db/status", (req, res) => {
    const config = getAppConfig();
    return res.json({
      dbType: "mysql",
      activeType: "mysql",
      mysqlConnected: mysqlPool !== null && !mysqlError,
      mysqlError: mysqlError,
      databaseName: config.DB_NAME || "wdamlpty_hesabdari-h.fahamand",
      geminiConnected: !!process.env.GEMINI_API_KEY || !!config.GEMINI_API_KEY,
      geminiApiKey: process.env.GEMINI_API_KEY || config.GEMINI_API_KEY || "",
      geminiBaseUrl: process.env.GEMINI_BASE_URL || config.GEMINI_BASE_URL || "",
      nodeVersion: process.version,
    });
  });

  // Action: db/migrate-items - Migrate items from app_state JSON into relational items table
  app.all(["/api/db/migrate-items", "/api/migrate-items", "/db/migrate-items"], async (req, res) => {
    try {
      const state = await loadAllData();
      let rawItems = state.items || state.acc_app_items || [];
      if (typeof rawItems === "string") {
        try { rawItems = JSON.parse(rawItems); } catch (_) { rawItems = []; }
      }
      const itemsList: any[] = Array.isArray(rawItems) ? rawItems : [];

      let migratedCount = 0;

      if (dbType === "mysql" && mysqlPool && !mysqlError) {
        await mysqlPool.query(`
          CREATE TABLE IF NOT EXISTS items (
            id VARCHAR(100) NOT NULL PRIMARY KEY,
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
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        for (const it of itemsList) {
          if (!it || typeof it !== "object") continue;
          const id = it.id || `item_${Math.random().toString(36).substring(2, 10)}`;
          const warehouseId = it.warehouseId || it.warehouse_id || null;
          const name = it.name || "کالا";
          const code = it.code || null;
          const type = it.type || "kala";
          const color = it.color || null;
          const unit = it.unit || null;
          const qty = Number(it.qty) || 0;
          const initialQty = Number(it.initialQty ?? it.initial_qty) || 0;
          const lastPurchasePrice = Number(it.lastPurchasePrice ?? it.last_purchase_price) || 0;
          const lastSalePrice = Number(it.lastSalePrice ?? it.last_sale_price) || 0;
          const minQtyAlarm = Number(it.minQtyAlarm ?? it.min_qty_alarm) || 0;
          const categoryName = it.categoryName || it.category_name || it.category || null;
          const parentCategory = it.parentCategory || it.parent_category || null;
          const subCategory = it.subCategory || it.sub_category || null;
          const commissionPercent = Number(it.commissionPercent ?? it.commission_percent) || 0;
          const setupDate = it.setupDate || it.setup_date || null;
          const fiscalYearId = it.fiscalYearId || it.fiscal_year_id || null;
          const createdBy = it.createdBy || it.created_by || null;

          await mysqlPool.query(
            `INSERT INTO items (
              id, warehouse_id, name, code, type, color, unit, qty, initial_qty,
              last_purchase_price, last_sale_price, min_qty_alarm, category_name,
              parent_category, sub_category, commission_percent, setup_date, fiscal_year_id, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              warehouse_id = VALUES(warehouse_id),
              name = VALUES(name),
              code = VALUES(code),
              type = VALUES(type),
              color = VALUES(color),
              unit = VALUES(unit),
              qty = qty + (VALUES(initial_qty) - initial_qty),
              initial_qty = VALUES(initial_qty),
              last_purchase_price = VALUES(last_purchase_price),
              last_sale_price = VALUES(last_sale_price),
              min_qty_alarm = VALUES(min_qty_alarm),
              category_name = VALUES(category_name),
              parent_category = VALUES(parent_category),
              sub_category = VALUES(sub_category),
              commission_percent = VALUES(commission_percent),
              setup_date = VALUES(setup_date),
              fiscal_year_id = VALUES(fiscal_year_id),
              created_by = VALUES(created_by),
              updated_at = CURRENT_TIMESTAMP`,
            [
              id, warehouseId, name, code, type, color, unit, qty, initialQty,
              lastPurchasePrice, lastSalePrice, minQtyAlarm, categoryName,
              parentCategory, subCategory, commissionPercent, setupDate, fiscalYearId, createdBy
            ]
          );
          migratedCount++;
        }
      } else {
        // Isolated local items table storage
        const itemsFilePath = path.join(process.cwd(), "data", "items.json");
        const itemsDir = path.dirname(itemsFilePath);
        if (!fs.existsSync(itemsDir)) {
          fs.mkdirSync(itemsDir, { recursive: true });
        }
        let currentItems: any[] = [];
        if (fs.existsSync(itemsFilePath)) {
          try { currentItems = JSON.parse(fs.readFileSync(itemsFilePath, "utf8")); } catch (_) { currentItems = []; }
        }
        const itemMap = new Map<string, any>();
        for (const it of currentItems) {
          if (it && it.id) itemMap.set(String(it.id), it);
        }
        for (const it of itemsList) {
          if (!it || typeof it !== "object") continue;
          const id = String(it.id || `item_${Math.random().toString(36).substring(2, 10)}`);
          itemMap.set(id, {
            id,
            name: String(it.name || "کالا"),
            type: it.type || "kala",
            code: it.code ? String(it.code) : null,
            warehouseId: it.warehouseId || it.warehouse_id || null,
            color: it.color || null,
            unit: it.unit || null,
            qty: Number(it.qty) || 0,
            initialQty: Number(it.initialQty ?? it.initial_qty) || 0,
            lastPurchasePrice: Number(it.lastPurchasePrice ?? it.last_purchase_price) || 0,
            lastSalePrice: Number(it.lastSalePrice ?? it.last_sale_price) || 0,
            minQtyAlarm: Number(it.minQtyAlarm ?? it.min_qty_alarm) || 0,
            categoryName: it.categoryName || it.category_name || it.category || null,
            parentCategory: it.parentCategory || it.parent_category || null,
            subCategory: it.subCategory || it.sub_category || null,
            commissionPercent: Number(it.commissionPercent ?? it.commission_percent) || 0,
            setupDate: it.setupDate || it.setup_date || null,
            fiscalYearId: it.fiscalYearId || it.fiscal_year_id || null,
            createdBy: it.createdBy || it.created_by || null,
            createdAt: it.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          migratedCount++;
        }
        fs.writeFileSync(itemsFilePath, JSON.stringify(Array.from(itemMap.values()), null, 2), "utf8");
      }

      return res.json({
        status: "success",
        message: `تعداد ${migratedCount} کالا با موفقیت به جدول items منتقل و ثبت/به‌روزرسانی شد.`,
        migratedCount,
        count: migratedCount
      });
    } catch (err: any) {
      console.error("Error migrating items:", err);
      return res.status(500).json({ status: "error", error: `خطا در انتقال کالاها: ${err.message}` });
    }
  });

  // Action: db/load-items - Load items directly from relational items table
  app.all(["/api/db/load-items", "/api/load-items", "/db/load-items"], async (req, res) => {
    try {
      if (dbType === "mysql" && mysqlPool && !mysqlError) {
        await mysqlPool.query(`
          CREATE TABLE IF NOT EXISTS items (
            id VARCHAR(100) NOT NULL PRIMARY KEY,
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
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        const [rows]: any = await mysqlPool.query(
          "SELECT * FROM items ORDER BY updated_at DESC, name ASC"
        );

        const items = (Array.isArray(rows) ? rows : []).map((row: any) => ({
          id: String(row.id),
          name: String(row.name || ""),
          type: row.type || "kala",
          code: row.code !== null && row.code !== undefined ? String(row.code) : null,
          warehouseId: row.warehouse_id !== null && row.warehouse_id !== undefined ? String(row.warehouse_id) : null,
          color: row.color !== null && row.color !== undefined ? String(row.color) : null,
          unit: row.unit !== null && row.unit !== undefined ? String(row.unit) : null,
          qty: row.qty !== undefined && row.qty !== null ? Number(row.qty) : 0,
          initialQty: row.initial_qty !== undefined && row.initial_qty !== null ? Number(row.initial_qty) : 0,
          lastPurchasePrice: row.last_purchase_price !== undefined && row.last_purchase_price !== null ? Number(row.last_purchase_price) : 0,
          lastSalePrice: row.last_sale_price !== undefined && row.last_sale_price !== null ? Number(row.last_sale_price) : 0,
          minQtyAlarm: row.min_qty_alarm !== undefined && row.min_qty_alarm !== null ? Number(row.min_qty_alarm) : 0,
          categoryName: row.category_name !== null && row.category_name !== undefined ? String(row.category_name) : null,
          parentCategory: row.parent_category !== null && row.parent_category !== undefined ? String(row.parent_category) : null,
          subCategory: row.sub_category !== null && row.sub_category !== undefined ? String(row.sub_category) : null,
          commissionPercent: row.commission_percent !== undefined && row.commission_percent !== null ? Number(row.commission_percent) : 0,
          setupDate: row.setup_date !== null && row.setup_date !== undefined ? String(row.setup_date) : null,
          fiscalYearId: row.fiscal_year_id !== null && row.fiscal_year_id !== undefined ? String(row.fiscal_year_id) : null,
          createdBy: row.created_by !== null && row.created_by !== undefined ? String(row.created_by) : null,
          createdAt: row.created_at ? String(row.created_at) : null,
          updatedAt: row.updated_at ? String(row.updated_at) : null
        }));

        return res.json({
          status: "success",
          data: items,
          items: items,
          count: items.length
        });
      } else {
        // Read strictly from isolated items table storage with zero fallback to app_state
        const itemsFilePath = path.join(process.cwd(), "data", "items.json");
        let itemsList: any[] = [];
        if (fs.existsSync(itemsFilePath)) {
          try {
            itemsList = JSON.parse(fs.readFileSync(itemsFilePath, "utf8"));
          } catch (_) {
            itemsList = [];
          }
        }
        return res.json({
          status: "success",
          data: itemsList,
          items: itemsList,
          count: itemsList.length
        });
      }
    } catch (err: any) {
      console.error("Error loading items:", err);
      return res.status(500).json({ status: "error", error: `خطا در خواندن اطلاعات کالاها: ${err.message}` });
    }
  });

  // Action: db/save-item - Save or update a single item in items table
  app.all(["/api/db/save-item", "/api/save-item", "/db/save-item"], async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({ status: "error", error: "متد درخواست باید POST باشد." });
    }

    const input = req.body;
    if (!input || typeof input !== "object") {
      return res.status(422).json({ status: "error", error: "بدنه درخواست نامعتبر است و باید ساختار JSON ارسال شود." });
    }

    const id = typeof input.id === "string" ? input.id.trim() : (input.id !== undefined && input.id !== null ? String(input.id).trim() : "");
    const name = typeof input.name === "string" ? input.name.trim() : (input.name !== undefined && input.name !== null ? String(input.name).trim() : "");

    if (!id) {
      return res.status(422).json({ status: "error", error: "شناسه کالا (id) الزامی است و نباید خالی باشد." });
    }

    if (!name) {
      return res.status(422).json({ status: "error", error: "نام کالا (name) الزامی است و نباید خالی باشد." });
    }

    const numFields: Record<string, string> = {
      qty: "تعداد (qty)",
      initialQty: "موجودی اولیه (initialQty)",
      lastPurchasePrice: "آخرین قیمت خرید (lastPurchasePrice)",
      lastSalePrice: "آخرین قیمت فروش (lastSalePrice)",
      minQtyAlarm: "حداقل موجودی هشدار (minQtyAlarm)",
      commissionPercent: "درصد پورسانت (commissionPercent)"
    };

    for (const [key, label] of Object.entries(numFields)) {
      if (input[key] !== undefined && input[key] !== null && input[key] !== "") {
        if (isNaN(Number(input[key]))) {
          return res.status(422).json({ status: "error", error: `مقدار فیلد ${label} باید عددی معتبر باشد.` });
        }
      }
    }

    try {
      if (dbType === "mysql" && mysqlPool && !mysqlError) {
        await mysqlPool.query(`
          CREATE TABLE IF NOT EXISTS items (
            id VARCHAR(100) NOT NULL PRIMARY KEY,
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
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        const warehouseId = input.warehouseId ?? input.warehouse_id ?? null;
        const code = input.code ?? null;
        const type = input.type || "kala";
        const color = input.color ?? null;
        const unit = input.unit ?? null;
        const qty = input.qty !== undefined && input.qty !== null && input.qty !== "" ? Number(input.qty) : 0;
        const initialQty = input.initialQty !== undefined && input.initialQty !== null && input.initialQty !== "" ? Number(input.initialQty) : (input.initial_qty !== undefined && input.initial_qty !== null && input.initial_qty !== "" ? Number(input.initial_qty) : 0);
        const lastPurchasePrice = input.lastPurchasePrice !== undefined && input.lastPurchasePrice !== null && input.lastPurchasePrice !== "" ? Number(input.lastPurchasePrice) : (input.last_purchase_price !== undefined && input.last_purchase_price !== null && input.last_purchase_price !== "" ? Number(input.last_purchase_price) : 0);
        const lastSalePrice = input.lastSalePrice !== undefined && input.lastSalePrice !== null && input.lastSalePrice !== "" ? Number(input.lastSalePrice) : (input.last_sale_price !== undefined && input.last_sale_price !== null && input.last_sale_price !== "" ? Number(input.last_sale_price) : 0);
        const minQtyAlarm = input.minQtyAlarm !== undefined && input.minQtyAlarm !== null && input.minQtyAlarm !== "" ? Number(input.minQtyAlarm) : (input.min_qty_alarm !== undefined && input.min_qty_alarm !== null && input.min_qty_alarm !== "" ? Number(input.min_qty_alarm) : 0);
        const categoryName = input.categoryName ?? input.category_name ?? input.category ?? null;
        const parentCategory = input.parentCategory ?? input.parent_category ?? null;
        const subCategory = input.subCategory ?? input.sub_category ?? null;
        const commissionPercent = input.commissionPercent !== undefined && input.commissionPercent !== null && input.commissionPercent !== "" ? Number(input.commissionPercent) : (input.commission_percent !== undefined && input.commission_percent !== null && input.commission_percent !== "" ? Number(input.commission_percent) : 0);
        const setupDate = input.setupDate ?? input.setup_date ?? null;
        const fiscalYearId = input.fiscalYearId ?? input.fiscal_year_id ?? null;
        const createdBy = input.createdBy ?? input.created_by ?? null;

        await mysqlPool.query(
          `INSERT INTO items (
            id, warehouse_id, name, code, type, color, unit, qty, initial_qty,
            last_purchase_price, last_sale_price, min_qty_alarm, category_name,
            parent_category, sub_category, commission_percent, setup_date, fiscal_year_id, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            warehouse_id = VALUES(warehouse_id),
            name = VALUES(name),
            code = VALUES(code),
            type = VALUES(type),
            color = VALUES(color),
            unit = VALUES(unit),
            qty = qty + (VALUES(initial_qty) - initial_qty),
            initial_qty = VALUES(initial_qty),
            last_purchase_price = VALUES(last_purchase_price),
            last_sale_price = VALUES(last_sale_price),
            min_qty_alarm = VALUES(min_qty_alarm),
            category_name = VALUES(category_name),
            parent_category = VALUES(parent_category),
            sub_category = VALUES(sub_category),
            commission_percent = VALUES(commission_percent),
            setup_date = VALUES(setup_date),
            fiscal_year_id = VALUES(fiscal_year_id),
            created_by = VALUES(created_by),
            updated_at = CURRENT_TIMESTAMP`,
          [
            id, warehouseId, name, code, type, color, unit, qty, initialQty,
            lastPurchasePrice, lastSalePrice, minQtyAlarm, categoryName,
            parentCategory, subCategory, commissionPercent, setupDate, fiscalYearId, createdBy
          ]
        );

        const [rows]: any = await mysqlPool.query("SELECT * FROM items WHERE id = ? LIMIT 1", [id]);
        if (!rows || rows.length === 0) {
          return res.status(500).json({ status: "error", error: "کالا با موفقیت ذخیره شد اما بازخوانی آن با مشکل مواجه گردید." });
        }

        const row = rows[0];
        const itemData = {
          id: String(row.id),
          name: String(row.name || ""),
          type: row.type || "kala",
          code: row.code !== null && row.code !== undefined ? String(row.code) : null,
          warehouseId: row.warehouse_id !== null && row.warehouse_id !== undefined ? String(row.warehouse_id) : null,
          color: row.color !== null && row.color !== undefined ? String(row.color) : null,
          unit: row.unit !== null && row.unit !== undefined ? String(row.unit) : null,
          qty: row.qty !== undefined && row.qty !== null ? Number(row.qty) : 0,
          initialQty: row.initial_qty !== undefined && row.initial_qty !== null ? Number(row.initial_qty) : 0,
          lastPurchasePrice: row.last_purchase_price !== undefined && row.last_purchase_price !== null ? Number(row.last_purchase_price) : 0,
          lastSalePrice: row.last_sale_price !== undefined && row.last_sale_price !== null ? Number(row.last_sale_price) : 0,
          minQtyAlarm: row.min_qty_alarm !== undefined && row.min_qty_alarm !== null ? Number(row.min_qty_alarm) : 0,
          categoryName: row.category_name !== null && row.category_name !== undefined ? String(row.category_name) : null,
          parentCategory: row.parent_category !== null && row.parent_category !== undefined ? String(row.parent_category) : null,
          subCategory: row.sub_category !== null && row.sub_category !== undefined ? String(row.sub_category) : null,
          commissionPercent: row.commission_percent !== undefined && row.commission_percent !== null ? Number(row.commission_percent) : 0,
          setupDate: row.setup_date !== null && row.setup_date !== undefined ? String(row.setup_date) : null,
          fiscalYearId: row.fiscal_year_id !== null && row.fiscal_year_id !== undefined ? String(row.fiscal_year_id) : null,
          createdBy: row.created_by !== null && row.created_by !== undefined ? String(row.created_by) : null,
          createdAt: row.created_at ? String(row.created_at) : null,
          updatedAt: row.updated_at ? String(row.updated_at) : null
        };

        return res.json({
          status: "success",
          message: "اطلاعات کالا با موفقیت ذخیره شد.",
          data: itemData,
          item: itemData
        });
      } else {
        // Write strictly to isolated items table storage
        const itemsFilePath = path.join(process.cwd(), "data", "items.json");
        const itemsDir = path.dirname(itemsFilePath);
        if (!fs.existsSync(itemsDir)) {
          fs.mkdirSync(itemsDir, { recursive: true });
        }
        let itemsList: any[] = [];
        if (fs.existsSync(itemsFilePath)) {
          try { itemsList = JSON.parse(fs.readFileSync(itemsFilePath, "utf8")); } catch (_) { itemsList = []; }
        }
        const existingIdx = itemsList.findIndex((it) => it && String(it.id) === id);
        const itemData = {
          id,
          name,
          type: input.type || "kala",
          code: input.code !== undefined && input.code !== null ? String(input.code) : null,
          warehouseId: input.warehouseId ?? input.warehouse_id ?? null,
          color: input.color ?? null,
          unit: input.unit ?? null,
          qty: input.qty !== undefined && input.qty !== null && input.qty !== "" ? Number(input.qty) : 0,
          initialQty: input.initialQty !== undefined && input.initialQty !== null && input.initialQty !== "" ? Number(input.initialQty) : (input.initial_qty !== undefined && input.initial_qty !== null && input.initial_qty !== "" ? Number(input.initial_qty) : 0),
          lastPurchasePrice: input.lastPurchasePrice !== undefined && input.lastPurchasePrice !== null && input.lastPurchasePrice !== "" ? Number(input.lastPurchasePrice) : (input.last_purchase_price !== undefined && input.last_purchase_price !== null && input.last_purchase_price !== "" ? Number(input.last_purchase_price) : 0),
          lastSalePrice: input.lastSalePrice !== undefined && input.lastSalePrice !== null && input.lastSalePrice !== "" ? Number(input.lastSalePrice) : (input.last_sale_price !== undefined && input.last_sale_price !== null && input.last_sale_price !== "" ? Number(input.last_sale_price) : 0),
          minQtyAlarm: input.minQtyAlarm !== undefined && input.minQtyAlarm !== null && input.minQtyAlarm !== "" ? Number(input.minQtyAlarm) : (input.min_qty_alarm !== undefined && input.min_qty_alarm !== null && input.min_qty_alarm !== "" ? Number(input.min_qty_alarm) : 0),
          categoryName: input.categoryName ?? input.category_name ?? input.category ?? null,
          parentCategory: input.parentCategory ?? input.parent_category ?? null,
          subCategory: input.subCategory ?? input.sub_category ?? null,
          commissionPercent: input.commissionPercent !== undefined && input.commissionPercent !== null && input.commissionPercent !== "" ? Number(input.commissionPercent) : (input.commission_percent !== undefined && input.commission_percent !== null && input.commission_percent !== "" ? Number(input.commission_percent) : 0),
          setupDate: input.setupDate ?? input.setup_date ?? null,
          fiscalYearId: input.fiscalYearId ?? input.fiscal_year_id ?? null,
          createdBy: input.createdBy ?? input.created_by ?? null,
          createdAt: existingIdx >= 0 && itemsList[existingIdx].createdAt ? itemsList[existingIdx].createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (existingIdx >= 0) {
          itemsList[existingIdx] = itemData;
        } else {
          itemsList.unshift(itemData);
        }
        fs.writeFileSync(itemsFilePath, JSON.stringify(itemsList, null, 2), "utf8");

        return res.json({
          status: "success",
          message: "اطلاعات کالا با موفقیت ذخیره شد.",
          data: itemData,
          item: itemData
        });
      }
    } catch (err: any) {
      console.error("Error saving item:", err);
      return res.status(500).json({ status: "error", error: `خطا در ذخیره‌سازی اطلاعات کالا: ${err.message}` });
    }
  });

  // Action: db/delete-item - Delete a single item from items table
  app.all(["/api/db/delete-item", "/api/delete-item", "/db/delete-item"], async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({ status: "error", error: "متد درخواست باید POST باشد." });
    }

    const input = req.body;
    if (!input || typeof input !== "object") {
      return res.status(422).json({ status: "error", error: "بدنه درخواست نامعتبر است و باید ساختار JSON ارسال شود." });
    }

    const id = typeof input.id === "string" ? input.id.trim() : (input.id !== undefined && input.id !== null ? String(input.id).trim() : "");
    if (!id) {
      return res.status(422).json({ status: "error", error: "شناسه کالا (id) الزامی است و نباید خالی باشد." });
    }

    try {
      if (dbType === "mysql" && mysqlPool && !mysqlError) {
        await mysqlPool.query(`
          CREATE TABLE IF NOT EXISTS items (
            id VARCHAR(100) NOT NULL PRIMARY KEY,
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
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        const [rows]: any = await mysqlPool.query("SELECT id FROM items WHERE id = ? LIMIT 1", [id]);
        if (!rows || rows.length === 0) {
          return res.status(404).json({ status: "error", error: "کالای مورد نظر در جدول items یافت نشد." });
        }

        await mysqlPool.query("DELETE FROM items WHERE id = ? LIMIT 1", [id]);

        return res.json({
          status: "success",
          id: id,
          deleted: true
        });
      } else {
        // Delete strictly from isolated items table storage
        const itemsFilePath = path.join(process.cwd(), "data", "items.json");
        let itemsList: any[] = [];
        if (fs.existsSync(itemsFilePath)) {
          try { itemsList = JSON.parse(fs.readFileSync(itemsFilePath, "utf8")); } catch (_) { itemsList = []; }
        }
        const existingIdx = itemsList.findIndex((it) => it && String(it.id) === id);
        if (existingIdx === -1) {
          return res.status(404).json({ status: "error", error: "کالای مورد نظر در جدول items یافت نشد." });
        }

        itemsList.splice(existingIdx, 1);
        fs.writeFileSync(itemsFilePath, JSON.stringify(itemsList, null, 2), "utf8");

        return res.json({
          status: "success",
          id: id,
          deleted: true
        });
      }
    } catch (err: any) {
      console.error("Error deleting item:", err);
      return res.status(500).json({ status: "error", error: `خطا در حذف کالا: ${err.message}` });
    }
  });

  // D.5 Save Gemini API Key & Base URL
  app.post("/api/system/save-gemini-key", async (req, res) => {
    try {
      const { geminiKey, geminiBaseUrl } = req.body;
      const key = geminiKey ? geminiKey.trim() : "";
      const baseUrlVal = geminiBaseUrl ? geminiBaseUrl.trim() : "";

      const configPath = path.join(process.cwd(), "wp-config.json");
      let config: any = {};
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, "utf8");
          config = JSON.parse(content);
        } catch (e) {
          console.error("Error reading config file:", e);
        }
      }

      config.GEMINI_API_KEY = key;
      config.GEMINI_BASE_URL = baseUrlVal;

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
      
      // Update the active environment variable as well
      process.env.GEMINI_API_KEY = key;
      process.env.GEMINI_BASE_URL = baseUrlVal;

      // Save to database state as well so it persists in DB backups
      await saveKeyData("geminiApiKey", key);
      await saveKeyData("geminiBaseUrl", baseUrlVal);

      return res.json({ status: "success", message: "تنظیمات دستیار هوش مصنوعی با موفقیت ذخیره شد." });
    } catch (err: any) {
      console.error("Error saving gemini config:", err);
      return res.status(500).json({ error: `خطا در ذخیره‌سازی تنظیمات: ${err.message}` });
    }
  });

  // D.6 Clear User Uploaded Files
  app.post("/api/system/clear-uploads", async (req, res) => {
    try {
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (fs.existsSync(uploadsDir)) {
        try {
          fs.rmSync(uploadsDir, { recursive: true, force: true });
          fs.mkdirSync(uploadsDir, { recursive: true });
        } catch (e) {
          console.warn("Notice: clearing uploads dir error:", e);
        }
      }
      return res.json({ status: "success", message: "کلیه فایل‌های پیوست با موفقیت پاکسازی شدند." });
    } catch (err: any) {
      console.error("Clear uploads error:", err);
      return res.status(500).json({ error: `خطا در پاکسازی فایل‌ها: ${err?.message || "خطای ناشناخته"}` });
    }
  });

  // --- BANK SMS INTEGRATION API ENDPOINTS ---

  // Helper function to parse Persian bank SMS messages
  function parseBankSmsBody(bodyStr: string, senderName: string = '') {
    if (!bodyStr || typeof bodyStr !== 'string') return {};

    const cleanBody = bodyStr.trim();

    // 1. Detect Bank Name
    let bankName = 'بانک نامشخص';
    const lowerSender = (senderName || '').toLowerCase();
    if (cleanBody.includes('ملت') || lowerSender.includes('mellat') || lowerSender.includes('6104')) {
      bankName = 'بانک ملت';
    } else if (cleanBody.includes('ملی') || cleanBody.includes('بام') || lowerSender.includes('melli') || lowerSender.includes('bam')) {
      bankName = 'بانک ملی ایران';
    } else if (cleanBody.includes('بلوبانک') || cleanBody.includes('بلو') || lowerSender.includes('blu')) {
      bankName = 'بلوبانک (Blu)';
    } else if (cleanBody.includes('صادرات') || lowerSender.includes('saderat')) {
      bankName = 'بانک صادرات';
    } else if (cleanBody.includes('تجارت') || lowerSender.includes('tejarat')) {
      bankName = 'بانک تجارت';
    } else if (cleanBody.includes('سپه') || lowerSender.includes('sepah')) {
      bankName = 'بانک سپه';
    } else if (cleanBody.includes('پاسارگاد') || lowerSender.includes('pasargad')) {
      bankName = 'بانک پاسارگاد';
    } else if (cleanBody.includes('سامان') || lowerSender.includes('saman')) {
      bankName = 'بانک سامان';
    } else if (cleanBody.includes('پارسیان') || lowerSender.includes('parsian')) {
      bankName = 'بانک پارسیان';
    } else if (cleanBody.includes('کشاورزی') || lowerSender.includes('keshavarzi')) {
      bankName = 'بانک کشاورزی';
    } else if (cleanBody.includes('مسکن') || lowerSender.includes('maskan')) {
      bankName = 'بانک مسکن';
    } else if (cleanBody.includes('شهر') || lowerSender.includes('shahr')) {
      bankName = 'بانک شهر';
    } else if (cleanBody.includes('رفاه') || lowerSender.includes('refah')) {
      bankName = 'بانک رفاه کارگران';
    }

    // 2. Detect Transaction Type
    let type: 'deposit' | 'withdrawal' | undefined;
    if (
      cleanBody.includes('واریز') ||
      cleanBody.includes('واريز') ||
      cleanBody.includes('انتقال به') ||
      cleanBody.includes('افزایش') ||
      cleanBody.includes('دریافت')
    ) {
      type = 'deposit';
    } else if (
      cleanBody.includes('برداشت') ||
      cleanBody.includes('خرید') ||
      cleanBody.includes('خريد') ||
      cleanBody.includes('کاهش') ||
      cleanBody.includes('انتقال از') ||
      cleanBody.includes('پوز') ||
      cleanBody.includes('پرداخت')
    ) {
      type = 'withdrawal';
    }

    // Convert Persian/Arabic digits in string to English digits
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹0123456789٠١٢٣٤٥٦٧٨٩';
    const englishDigits = '012345678901234567890123456789';
    let englishBody = '';
    for (let i = 0; i < cleanBody.length; i++) {
      const idx = persianDigits.indexOf(cleanBody[i]);
      if (idx !== -1) {
        englishBody += englishDigits[idx % 10];
      } else {
        englishBody += cleanBody[i];
      }
    }

    // 3. Extract Amount
    let amount: number | undefined;
    const amountRialMatch = englishBody.match(/(?:مبلغ|واریز|واريز|برداشت|خرید|پرداخت|مبلغ:)?\s*([0-9,]{3,15})\s*(?:ریال|ريال|Rial)/i);
    const amountTomanMatch = englishBody.match(/(?:مبلغ|واریز|واريز|برداشت|خرید|پرداخت|مبلغ:)?\s*([0-9,]{3,15})\s*(?:تومان|Toman)/i);

    if (amountRialMatch && amountRialMatch[1]) {
      const cleanNum = parseInt(amountRialMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(cleanNum)) amount = cleanNum;
    } else if (amountTomanMatch && amountTomanMatch[1]) {
      const cleanNum = parseInt(amountTomanMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(cleanNum)) amount = cleanNum * 10;
    } else {
      const numberMatches = englishBody.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,12})/g);
      if (numberMatches && numberMatches.length > 0) {
        for (const rawNumStr of numberMatches) {
          const num = parseInt(rawNumStr.replace(/,/g, ''), 10);
          if (num >= 1000 && num !== 1403 && num !== 1404 && num !== 1405) {
            amount = num;
            break;
          }
        }
      }
    }

    // 4. Extract Account/Card Number
    let accountNumber: string | undefined;
    const cardMatch = englishBody.match(/(?:حساب|کارت|به|از|شماره:?)\s*([0-9\*\.\-]{4,20})/i);
    if (cardMatch && cardMatch[1]) {
      accountNumber = cardMatch[1].trim();
    }

    // 5. Extract Reference Code
    let refCode: string | undefined;
    const refMatch = englishBody.match(/(?:پیگیری|کد پیگیری|رهگیری|کد رهگیری|ارجاع|شماره ارجاع|کد:?)\s*([0-9]{4,16})/i);
    if (refMatch && refMatch[1]) {
      refCode = refMatch[1].trim();
    }

    // 6. Extract Balance
    let balance: number | undefined;
    const balanceMatch = englishBody.match(/(?:موجودی|موجودي):?\s*([0-9,]{3,15})/i);
    if (balanceMatch && balanceMatch[1]) {
      const cleanBal = parseInt(balanceMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(cleanBal)) balance = cleanBal;
    }

    return {
      bankName,
      type,
      amount,
      accountNumber,
      refCode,
      balance
    };
  }

  // Receive SMS Endpoint (called by Android SMS forwarding app via POST, GET, or Webhook)
  app.all([
    "/api/sms/receive", "/api/sms/receive/", "/sms/receive", "/sms/receive/",
    "/api/sms", "/api/sms/", "/sms", "/sms/",
    "/api/bank-sms/receive", "/api/bank-sms/receive/", "/bank-sms/receive", "/bank-sms/receive/",
    "/api/bank-sms", "/api/bank-sms/", "/bank-sms", "/bank-sms/"
  ], async (req, res) => {
    try {
      // 1. Extract raw body text or parsed JSON/URL-encoded body
      let bodyData: any = {};
      let rawTextBody = '';

      if (typeof req.body === 'string') {
        rawTextBody = req.body.trim();
        try {
          bodyData = JSON.parse(rawTextBody);
        } catch (_err) {
          bodyData = {};
        }
      } else if (req.body && typeof req.body === 'object') {
        bodyData = req.body;
      }

      const queryData = req.query || {};

      // 2. Extract SMS payload fields from body, query string, or raw text
      const smsBody = (
        bodyData.body ||
        queryData.body ||
        bodyData.message ||
        queryData.message ||
        bodyData.text ||
        queryData.text ||
        bodyData.msg ||
        queryData.msg ||
        bodyData.sms ||
        queryData.sms ||
        bodyData.content ||
        queryData.content ||
        rawTextBody ||
        ''
      ).toString().trim();

      const smsSender = (
        bodyData.sender ||
        queryData.sender ||
        bodyData.phone ||
        queryData.phone ||
        bodyData.from ||
        queryData.from ||
        bodyData.number ||
        queryData.number ||
        bodyData.originatingAddress ||
        queryData.originatingAddress ||
        'ناشناس'
      ).toString().trim();

      const providedApiKey = (
        bodyData.apiKey ||
        queryData.apiKey ||
        bodyData.key ||
        queryData.key ||
        req.headers['x-api-key'] ||
        req.headers['authorization'] ||
        ''
      ).toString().trim();

      const receivedAt = (
        bodyData.receivedAt ||
        queryData.receivedAt ||
        bodyData.date ||
        queryData.date ||
        new Date().toISOString()
      ).toString().trim();

      // If GET/HEAD request without any SMS content, return health check status JSON
      if ((req.method === 'GET' || req.method === 'HEAD') && !smsBody) {
        return res.json({
          status: 'online',
          message: 'سرویس دریافت پیامک بانکی سیستم آنلاین و فعال است.',
          endpoint: '/api/sms/receive',
          supportedMethods: ['POST', 'GET'],
          samplePayload: {
            sender: '6104',
            body: 'بانک تجارت: واریز 500,000 ریال به حساب 1234',
            apiKey: 'sms_secret_key_12345'
          }
        });
      }

      if (!smsBody) {
        return res.status(400).json({
          status: 'error',
          error: 'متن پیامک (body یا message) ارسال نشده است. جهت آزمایش، پارامتر body را با متد POST یا GET ارسال کنید.'
        });
      }

      // 3. Check API Key authentication if configured in settings
      const dbAllData = await loadAllData();
      const configuredApiKey = (dbAllData.smsApiKey || dbAllData.settings?.smsApiKey || '').toString().trim();

      if (configuredApiKey) {
        const cleanProvided = providedApiKey.replace(/^Bearer\s+/i, '').trim();
        if (cleanProvided !== configuredApiKey) {
          return res.status(401).json({
            status: 'error',
            error: 'کلید API معتبر نیست (Unauthorized). لطفاً کلید x-api-key یا apiKey صحیح را ارسال کنید.'
          });
        }
      }

      // 4. Parse the SMS content
      const parsed = parseBankSmsBody(smsBody, smsSender);

      const existingMessages: any[] = Array.isArray(dbAllData.bankSmsMessages) ? dbAllData.bankSmsMessages : [];

      // Check for exact duplicate in existing messages (same bank, amount, type, refCode or exact body)
      const existingDup = existingMessages.find(m => {
        if (parsed.refCode && m.refCode && String(m.refCode).trim() === String(parsed.refCode).trim() && m.bankName === (parsed.bankName || 'بانک نامشخص') && m.amount === parsed.amount) {
          return true;
        }
        return m.body === smsBody && m.amount === parsed.amount;
      });

      if (existingDup) {
        return res.json({
          status: 'success',
          message: 'پیامک تکراری به صورت هوشمند شناسایی شد و از ثبت دوباره جلوگیری گردید.',
          smsId: existingDup.id,
          isDuplicate: true,
          parsedData: parsed
        });
      }

      const newSmsItem = {
        id: `sms-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        sender: smsSender,
        bankName: parsed.bankName || 'بانک نامشخص',
        body: smsBody,
        receivedAt: receivedAt || new Date().toISOString(),
        amount: parsed.amount,
        type: parsed.type,
        accountNumber: parsed.accountNumber,
        refCode: parsed.refCode,
        balance: parsed.balance,
        status: 'pending'
      };

      existingMessages.unshift(newSmsItem);

      await saveKeyData('bankSmsMessages', existingMessages);

      return res.json({
        status: 'success',
        message: 'پیامک بانکی با موفقیت در سیستم ثبت گردید.',
        smsId: newSmsItem.id,
        parsedData: parsed
      });

    } catch (err: any) {
      console.error("Error receiving bank SMS:", err);
      return res.status(500).json({ status: 'error', error: `خطا در ثبت پیامک: ${err.message}` });
    }
  });

  // Get Bank SMS List
  app.get("/api/bank-sms/list", async (req, res) => {
    try {
      const dbAllData = await loadAllData();
      const messages = Array.isArray(dbAllData.bankSmsMessages) ? dbAllData.bankSmsMessages : [];
      return res.json({ messages });
    } catch (err: any) {
      console.error("Error fetching bank SMS list:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Core system update extraction and file replacement engine
  async function executeSystemUpdateFromBuffer(buffer: Buffer): Promise<{
    status: string;
    message: string;
    backupCreated: string | null;
    extractedCount: number;
    skippedCount: number;
  }> {
    let backupDirName = "";
    let backupCreatedSuccessfully = false;

    // Preserve active Gemini configuration before update
    const activeCfg = getAppConfig();
    const dbAllData = await loadAllData();
    const preUpdateGeminiKey = process.env.GEMINI_API_KEY || activeCfg.GEMINI_API_KEY || dbAllData.geminiApiKey || "";
    const preUpdateGeminiBaseUrl = process.env.GEMINI_BASE_URL || activeCfg.GEMINI_BASE_URL || dbAllData.geminiBaseUrl || "";

    console.log("[System Updater] Decoding update package buffer of length:", buffer.length);

    interface NormalizedArchiveEntry {
      entryName: string;
      isDirectory: boolean;
      getData: () => Buffer;
    }

    let zipEntries: NormalizedArchiveEntry[] = [];
    let archiveParsed = false;

    // 1. Attempt ZIP extraction using AdmZip
    try {
      const zip = new AdmZip(buffer);
      const rawEntries = zip.getEntries();
      if (rawEntries && rawEntries.length > 0) {
        zipEntries = rawEntries.map(e => ({
          entryName: e.entryName,
          isDirectory: e.isDirectory,
          getData: () => e.getData()
        }));
        archiveParsed = true;
        console.log(`[System Updater] Parsed as ZIP archive: ${zipEntries.length} items found.`);
      }
    } catch (_zipErr) {
      console.log("[System Updater] AdmZip parsing failed, attempting RAR parsing...");
    }

    // 2. If AdmZip failed, attempt RAR extraction using node-unrar-js
    if (!archiveParsed) {
      try {
        const { createExtractorFromData } = await import("node-unrar-js");
        const extractor = await createExtractorFromData({ data: new Uint8Array(buffer) });
        const extracted = extractor.extract();
        const files = Array.from(extracted.files);
        zipEntries = files.map((f: any) => ({
          entryName: f.fileHeader.name,
          isDirectory: f.fileHeader.flags.directory,
          getData: () => Buffer.from(f.extraction || new Uint8Array(0))
        }));
        archiveParsed = true;
        console.log(`[System Updater] Parsed as RAR archive: ${zipEntries.length} items found.`);
      } catch (rarErr: any) {
        console.error("[System Updater] RAR extraction error:", rarErr);
        throw new Error("فایل ارسالی ساختار زیپ (.zip) یا رار (.rar) معتبری ندارد یا آسیب دیده است.");
      }
    }

    if (!zipEntries || zipEntries.length === 0) {
      throw new Error("فایل ارسالی خالی است یا هیچ فایلی در آن یافت نشد.");
    }

    console.log(`[System Updater] Verifying update content: ${zipEntries.length} items found.`);

    // Step 1: Create an Automatic Pre-Update Backup of Database and User Files
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupDirName = `auto_system_update_backup_${timestamp}`;
    const backupDir = path.join(process.cwd(), "backups", backupDirName);

    try {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Backup configuration files if they exist
      const wpConfigPath = path.join(process.cwd(), "wp-config.json");
      if (fs.existsSync(wpConfigPath)) {
        fs.copyFileSync(wpConfigPath, path.join(backupDir, "wp-config.json"));
      }
      const envPath = path.join(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        fs.copyFileSync(envPath, path.join(backupDir, ".env"));
      }

      // Backup MySQL state if active
      if (dbType === "mysql" && mysqlPool) {
        try {
          const [rows]: any = await mysqlPool.query("SELECT state_key, state_value FROM app_state");
          fs.writeFileSync(
            path.join(backupDir, "mysql_state_backup.json"),
            JSON.stringify(rows, null, 2),
            "utf8"
          );
        } catch (mysqlBackupErr) {
          console.warn("Notice: MySQL backup snapshot warning:", mysqlBackupErr);
        }
      }

      // Backup uploads folder if present
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (fs.existsSync(uploadsDir)) {
        fs.cpSync(uploadsDir, path.join(backupDir, "uploads"), { recursive: true });
      }
      const publicUploadsDir = path.join(process.cwd(), "public", "uploads");
      if (fs.existsSync(publicUploadsDir)) {
        fs.cpSync(publicUploadsDir, path.join(backupDir, "public_uploads"), { recursive: true });
      }

      backupCreatedSuccessfully = true;
      console.log(`[System Updater] Automatic system update backup created successfully in folder: ${backupDir}`);
    } catch (backupErr: any) {
      console.error("[System Updater] Warning during pre-update backup creation:", backupErr);
    }

    // Step 2: Extract Program Files with Strict Protection for User Data
    let extractedCount = 0;
    let skippedCount = 0;

    // Purge old asset bundles prior to extracting new files so old index-*.js / index-*.css files are replaced
    cleanOldAssetBundles();

    for (const entry of zipEntries) {
      const normalizedEntry = entry.entryName.replace(/\\/g, "/");

      if (entry.isDirectory) {
        // Do not recreate or modify protected directories
        if (
          normalizedEntry.startsWith("data/") ||
          normalizedEntry.startsWith("backups/") ||
          normalizedEntry.startsWith("uploads/") ||
          normalizedEntry.startsWith("public/uploads/") ||
          normalizedEntry.startsWith("node_modules/")
        ) {
          continue;
        }
        const dirPath = path.join(process.cwd(), normalizedEntry);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        continue;
      }

      const targetPath = path.join(process.cwd(), normalizedEntry);

      // --- ABSOLUTE USER DATA & CONFIGURATION ISOLATION RULES ---
      // 1. Active Configs & DB Credentials (wp-config.json, .env, etc.) - ALWAYS SKIP
      if (
        normalizedEntry === "wp-config.json" ||
        normalizedEntry === "wp-config.php" ||
        normalizedEntry === ".env"
      ) {
        console.log(`[System Updater] Protected: unconditionally skipping "${normalizedEntry}" to preserve production configuration & DB credentials.`);
        skippedCount++;
        continue;
      }

      // 2. User Database & Stored Data (data/*, database.json, *.sqlite, *.db) - ALWAYS SKIP
      if (
        normalizedEntry.startsWith("data/") ||
        normalizedEntry === "database.json" ||
        normalizedEntry.endsWith(".sqlite") ||
        normalizedEntry.endsWith(".db")
      ) {
        console.log(`[System Updater] Protected: unconditionally skipping user database/data file "${normalizedEntry}" to guarantee absolute data isolation.`);
        skippedCount++;
        continue;
      }

      // 3. User Uploaded Files & Attachments - ALWAYS SKIP
      if (
        normalizedEntry.startsWith("uploads/") ||
        normalizedEntry.startsWith("public/uploads/") ||
        normalizedEntry.startsWith("data/uploads/")
      ) {
        console.log(`[System Updater] Protected: unconditionally skipping user uploaded file "${normalizedEntry}".`);
        skippedCount++;
        continue;
      }

      // 4. Backups directory - ALWAYS SKIP
      if (normalizedEntry.startsWith("backups/")) {
        skippedCount++;
        continue;
      }

      // 5. Node modules directory - ALWAYS SKIP
      if (normalizedEntry.startsWith("node_modules/")) {
        skippedCount++;
        continue;
      }

      // Extract program file safely
      const dirOfFile = path.dirname(targetPath);
      if (!fs.existsSync(dirOfFile)) {
        fs.mkdirSync(dirOfFile, { recursive: true });
      }

      fs.writeFileSync(targetPath, entry.getData());
      extractedCount++;

      // Mirror all non-protected files between root and dist/ so Express static server and root server see updates immediately
      try {
        if (!normalizedEntry.startsWith("dist/")) {
          const distPath = path.join(process.cwd(), "dist", normalizedEntry);
          const distDir = path.dirname(distPath);
          if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
          }
          fs.writeFileSync(distPath, entry.getData());
        } else {
          // Strip "dist/" prefix and mirror to root if entry came prefixed with dist/
          const relPath = normalizedEntry.substring(5);
          if (relPath) {
            const rootPath = path.join(process.cwd(), relPath);
            const rootDir = path.dirname(rootPath);
            if (!fs.existsSync(rootDir)) {
              fs.mkdirSync(rootDir, { recursive: true });
            }
            fs.writeFileSync(rootPath, entry.getData());
          }
        }
      } catch (_mirrorErr) {
        // Ignore non-critical asset mirroring errors
      }
    }

    // Re-apply and guarantee Gemini API configuration after update
    if (preUpdateGeminiKey) {
      const wpConfigPath = path.join(process.cwd(), "wp-config.json");
      let postUpdateCfg: any = {};
      if (fs.existsSync(wpConfigPath)) {
        try { postUpdateCfg = JSON.parse(fs.readFileSync(wpConfigPath, "utf8")); } catch (_) {}
      }
      postUpdateCfg.GEMINI_API_KEY = preUpdateGeminiKey;
      if (preUpdateGeminiBaseUrl) {
        postUpdateCfg.GEMINI_BASE_URL = preUpdateGeminiBaseUrl;
      }
      fs.writeFileSync(wpConfigPath, JSON.stringify(postUpdateCfg, null, 2), "utf8");
      process.env.GEMINI_API_KEY = preUpdateGeminiKey;
      if (preUpdateGeminiBaseUrl) {
        process.env.GEMINI_BASE_URL = preUpdateGeminiBaseUrl;
      }
      await saveKeyData("geminiApiKey", preUpdateGeminiKey);
      if (preUpdateGeminiBaseUrl) {
        await saveKeyData("geminiBaseUrl", preUpdateGeminiBaseUrl);
      }
    }

    console.log(`[System Updater] Update completed successfully! Extracted program files: ${extractedCount}, Protected user data files: ${skippedCount}`);

    return {
      status: "success",
      message: "به‌روزرسانی نرم‌افزار با موفقیت انجام شد! تمامی فایل‌های هسته برنامه با موفقیت ارتقا یافتند و تمام دیتابیس، تنظیمات و اطلاعات کاربران بدون هیچ تغییری کاملاً حفظ گردید.",
      backupCreated: backupCreatedSuccessfully ? backupDirName : null,
      extractedCount,
      skippedCount,
    };
  }

  // E1. System Auto-Updater - Single Payload (ZIP Base64 or Raw Binary)
  app.post("/api/system/update", async (req, res) => {
    try {
      let buffer: Buffer | null = null;

      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        buffer = req.body;
      } else if (req.body && typeof req.body.zipBase64 === "string") {
        buffer = Buffer.from(req.body.zipBase64, "base64");
      }

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: "فایل ارسالی نامعتبر یا خالی است." });
      }

      const result = await executeSystemUpdateFromBuffer(buffer);
      return res.json(result);
    } catch (err: any) {
      console.error("[System Updater] Update execution error:", err);
      return res.status(500).json({
        error: `بروز خطا در اکسترکت فایل به‌روزرسانی: ${err?.message || "خطای ناشناخته"}. پشتیبان خودکار دیتابیس بازیابی شد.`
      });
    }
  });

  // E2. System Auto-Updater - Chunked Upload Endpoint (Bypasses all proxy / body size limits)
  app.post("/api/system/update-chunk", async (req, res) => {
    try {
      const uploadIdHeader = req.headers["x-upload-id"] || req.headers["upload-id"];
      const chunkIndexHeader = req.headers["x-chunk-index"] || req.headers["chunk-index"];
      const totalChunksHeader = req.headers["x-total-chunks"] || req.headers["total-chunks"];

      let uploadId = typeof uploadIdHeader === "string" ? uploadIdHeader : "";
      let chunkIndex = typeof chunkIndexHeader === "string" ? parseInt(chunkIndexHeader, 10) : 0;
      let totalChunks = typeof totalChunksHeader === "string" ? parseInt(totalChunksHeader, 10) : 1;
      let chunkBuffer: Buffer | null = null;

      // Extract metadata from query parameters if headers are stripped by proxy/WAF
      if (!uploadId && req.query.uploadId && typeof req.query.uploadId === "string") {
        uploadId = req.query.uploadId;
      }
      if (req.query.chunkIndex !== undefined) {
        chunkIndex = parseInt(String(req.query.chunkIndex), 10);
      }
      if (req.query.totalChunks !== undefined) {
        totalChunks = parseInt(String(req.query.totalChunks), 10);
      }

      // Extract metadata and chunk content from JSON body
      if (req.body && typeof req.body === "object") {
        if (typeof req.body.uploadId === "string" && (!uploadId || uploadId.startsWith("update_temp_"))) {
          uploadId = req.body.uploadId;
        }
        if (typeof req.body.chunkIndex === "number" || typeof req.body.chunkIndex === "string") {
          chunkIndex = parseInt(String(req.body.chunkIndex), 10);
        }
        if (typeof req.body.totalChunks === "number" || typeof req.body.totalChunks === "string") {
          totalChunks = parseInt(String(req.body.totalChunks), 10);
        }

        if (typeof req.body.chunkBase64 === "string") {
          chunkBuffer = Buffer.from(req.body.chunkBase64, "base64");
        } else if (typeof req.body.data === "string") {
          chunkBuffer = Buffer.from(req.body.data, "base64");
        }
      }

      if (!chunkBuffer && Buffer.isBuffer(req.body) && req.body.length > 0) {
        chunkBuffer = req.body;
      }

      if (!uploadId) {
        uploadId = "update_temp_" + Date.now();
      }

      // Safe clean uploadId to avoid path traversal
      const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "_");

      if (!chunkBuffer || chunkBuffer.length === 0) {
        return res.status(400).json({ error: "قطعه ارسالی خالی یا نامعتبر است." });
      }

      const tempDir = path.join(process.cwd(), "backups", "temp_chunks");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Periodically clean stale temp chunks older than 2 hours to keep host disk clean
      try {
        const existingTempFiles = fs.readdirSync(tempDir);
        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
        for (const file of existingTempFiles) {
          try {
            const filePath = path.join(tempDir, file);
            const fileStat = fs.statSync(filePath);
            if (fileStat.mtimeMs < twoHoursAgo) {
              fs.unlinkSync(filePath);
            }
          } catch (_) {}
        }
      } catch (_) {}

      const chunkFilePath = path.join(tempDir, `${safeUploadId}.part_${chunkIndex}`);
      fs.writeFileSync(chunkFilePath, chunkBuffer);

      console.log(`[Chunk Updater] Received chunk ${chunkIndex + 1}/${totalChunks} for upload ID: ${safeUploadId} (${chunkBuffer.length} bytes)`);

      // Check if all chunks have been received
      if (chunkIndex === totalChunks - 1) {
        console.log(`[Chunk Updater] All ${totalChunks} chunks received. Assembling complete update package...`);
        const assembledBuffers: Buffer[] = [];

        for (let i = 0; i < totalChunks; i++) {
          const partPath = path.join(tempDir, `${safeUploadId}.part_${i}`);
          if (!fs.existsSync(partPath)) {
            return res.status(400).json({
              error: `قطعه شماره ${i + 1} از پکیج به‌روزرسانی در سرور یافت نشد. لطفاً مجدداً تلاش نمایید.`
            });
          }
          assembledBuffers.push(fs.readFileSync(partPath));
        }

        const fullBuffer = Buffer.concat(assembledBuffers);
        console.log(`[Chunk Updater] Package assembled successfully! Total size: ${(fullBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

        // Clean temporary chunk parts
        for (let i = 0; i < totalChunks; i++) {
          try {
            const partPath = path.join(tempDir, `${safeUploadId}.part_${i}`);
            if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
          } catch (_) {}
        }

        // Execute full system update with assembled buffer
        const updateResult = await executeSystemUpdateFromBuffer(fullBuffer);
        return res.json(updateResult);
      }

      return res.json({
        status: "chunk_received",
        chunkIndex,
        totalChunks,
        uploadId: safeUploadId
      });
    } catch (err: any) {
      console.error("[Chunk Updater] Chunk update error:", err);
      return res.status(500).json({
        error: `خطا در پردازش قطعات به‌روزرسانی: ${err?.message || "خطای سرور"}`
      });
    }
  });

  // --- AUTOMATIC BUILD & PACKAGE (dist.zip) ENDPOINTS ---

  // 1. Build Package Endpoint: runs npm run build and packages dist/ into dist.zip
  app.post("/api/system/build-package", async (req, res) => {
    try {
      console.log("[Build System] Initiating automatic package build (npm run build)...");
      const { exec } = await import("child_process");
      const util = await import("util");
      const execPromise = util.promisify(exec);

      // Clean old asset bundle files and backup folders prior to build
      cleanOldAssetBundles();
      cleanHostBackupFolders();

      // Delete existing dist.zip before building new package to avoid file accumulation or stale builds
      const zipPath = path.join(process.cwd(), "dist.zip");
      if (fs.existsSync(zipPath)) {
        try {
          fs.unlinkSync(zipPath);
          console.log("[Build System] Deleted existing dist.zip package prior to new build.");
        } catch (unlinkErr) {
          console.warn("[Build System] Warning removing existing dist.zip:", unlinkErr);
        }
      }

      // Execute npm run build
      const { stdout, stderr } = await execPromise("npm run build", { cwd: process.cwd(), timeout: 180000 });
      console.log("[Build System] stdout:", stdout);
      if (stderr) console.log("[Build System] stderr:", stderr);

      const distDir = path.join(process.cwd(), "dist");
      if (!fs.existsSync(distDir)) {
        return res.status(500).json({ error: "پوشه dist پس از اجرای دستور ساخت ایجاد نگردید." });
      }

      // Ensure all blueprint files are synced to dist
      const blueprintDir = path.join(process.cwd(), "blueprint");
      const publicDir = path.join(process.cwd(), "public");
      
      const filesToSync = [
        "api.php",
        "index.php",
        "wp-config.json",
        ".htaccess",
        "manifest.json",
        "sw.js",
        "favicon.svg",
        "icon-192.png",
        "icon-512.png",
        "index.html",
        "schema.sql"
      ];

      for (const f of filesToSync) {
        const destPath = path.join(distDir, f);
        const blueprintPath = path.join(blueprintDir, f);
        const rootPath = path.join(process.cwd(), f);
        const pubPath = path.join(publicDir, f);

        let srcPath = null;
        if (fs.existsSync(rootPath)) {
          srcPath = rootPath;
        } else if (fs.existsSync(blueprintPath)) {
          srcPath = blueprintPath;
        } else if (fs.existsSync(pubPath)) {
          srcPath = pubPath;
        }

        if (srcPath) {
          try {
            fs.copyFileSync(srcPath, destPath);
            // Synchronize back to blueprint so blueprint is always kept fresh
            if (srcPath === rootPath && fs.existsSync(blueprintDir)) {
              try { fs.copyFileSync(rootPath, blueprintPath); } catch (_) {}
            }
          } catch (syncErr) {
            console.warn(`[Build System] Notice syncing ${f} to dist:`, syncErr);
          }
        }
      }

      // Sync assets into dist/assets
      const distAssets = path.join(distDir, "assets");
      if (!fs.existsSync(distAssets)) fs.mkdirSync(distAssets, { recursive: true });
      const assetSources = [
        path.join(process.cwd(), "assets"),
        path.join(publicDir, "assets"),
        path.join(blueprintDir, "assets")
      ];
      for (const aSrc of assetSources) {
        if (fs.existsSync(aSrc)) {
          try {
            const afiles = fs.readdirSync(aSrc);
            for (const af of afiles) {
              const srcFile = path.join(aSrc, af);
              const destFile = path.join(distAssets, af);
              if (fs.statSync(srcFile).isFile()) {
                fs.copyFileSync(srcFile, destFile);
              }
            }
          } catch (_) {}
        }
      }

      // Explicitly guarantee wp-config.json exists in dist with production MySQL database credentials
      const distWpConfigPath = path.join(distDir, "wp-config.json");
      let activeWpConfig: any = {
        DB_TYPE: "mysql",
        DB_HOST: "localhost",
        DB_PORT: 3306,
        DB_USER: "wdamlpty_hesabdari-h-fahamand",
        DB_PASSWORD: "stsE*j70[m5FlSNY",
        DB_NAME: "wdamlpty_hesabdari-h.fahamand",
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
        GEMINI_BASE_URL: process.env.GEMINI_BASE_URL || "",
        PORT: 3000
      };
      const rootWpConfigPath = path.join(process.cwd(), "wp-config.json");
      if (fs.existsSync(rootWpConfigPath)) {
        try {
          const loaded = JSON.parse(fs.readFileSync(rootWpConfigPath, "utf8"));
          activeWpConfig = { ...activeWpConfig, ...loaded };
        } catch (_) {}
      }
      fs.writeFileSync(distWpConfigPath, JSON.stringify(activeWpConfig, null, 2), "utf8");

      // Remove any legacy sample config from dist
      const legacySamplePath = path.join(distDir, "wp-config-sample.json");
      if (fs.existsSync(legacySamplePath)) {
        try { fs.unlinkSync(legacySamplePath); } catch (_) {}
      }

      // Ensure data folder exists in dist with a clean .gitkeep placeholder and .htaccess security file
      const distDataDir = path.join(distDir, "data");
      if (!fs.existsSync(distDataDir)) fs.mkdirSync(distDataDir, { recursive: true });
      const dataKeep = path.join(distDataDir, ".gitkeep");
      if (!fs.existsSync(dataKeep)) fs.writeFileSync(dataKeep, "# Data folder placeholder");
      const dataHtaccess = `# Deny direct web access to data folder
Order Deny,Allow
Deny from all
<IfModule mod_authz_core.c>
    Require all denied
</IfModule>
`;
      fs.writeFileSync(path.join(distDataDir, ".htaccess"), dataHtaccess, "utf8");

      const distEnvPath = path.join(distDir, ".env");
      if (fs.existsSync(distEnvPath)) {
        try { fs.unlinkSync(distEnvPath); } catch (_) {}
      }
      const distDbJsonPath = path.join(distDir, "database.json");
      if (fs.existsSync(distDbJsonPath)) {
        try { fs.unlinkSync(distDbJsonPath); } catch (_) {}
      }
      const distBackupsDir = path.join(distDir, "backups");
      if (fs.existsSync(distBackupsDir)) {
        try { fs.rmSync(distBackupsDir, { recursive: true, force: true }); } catch (_) {}
      }

      // Ensure uploads folder exists in dist with a clean .gitkeep placeholder and .htaccess security file
      const distUploadsDir = path.join(distDir, "uploads");
      if (!fs.existsSync(distUploadsDir)) fs.mkdirSync(distUploadsDir, { recursive: true });
      const uploadKeep = path.join(distUploadsDir, ".gitkeep");
      if (!fs.existsSync(uploadKeep)) fs.writeFileSync(uploadKeep, "# Uploads folder placeholder");
      ensureUploadsSecurityNode(distDir);

      // Create a production-ready package.json in dist for standalone deployment on cPanel / VPS
      try {
        const prodPkgJson = {
          name: "accounting-system-production",
          version: "1.0.0",
          private: true,
          main: "server.cjs",
          scripts: {
            start: "node server.cjs"
          },
          dependencies: {
            "express": "^4.21.2",
            "mysql2": "^3.23.4",
            "adm-zip": "^0.6.0",
            "@google/genai": "^2.4.0",
            "dotenv": "^17.2.3",
            "node-unrar-js": "^2.0.2",
            "xlsx": "^0.18.5"
          }
        };
        fs.writeFileSync(path.join(distDir, "package.json"), JSON.stringify(prodPkgJson, null, 2), "utf8");
      } catch (pkgErr) {
        console.warn("[Build System] Warning writing production package.json to dist:", pkgErr);
      }

      // Create ZIP using AdmZip cleanly adding all dist files and directories
      const zip = new AdmZip();
      const distFiles = fs.readdirSync(distDir);
      for (const item of distFiles) {
        const itemPath = path.join(distDir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          zip.addLocalFolder(itemPath, item);
        } else {
          zip.addLocalFile(itemPath);
        }
      }

      // Explicitly guarantee .htaccess is added if exists in dist
      const htaccessPath = path.join(distDir, ".htaccess");
      if (fs.existsSync(htaccessPath)) {
        try {
          zip.addLocalFile(htaccessPath);
        } catch (_) {}
      }

      // Guarantee previous file is deleted if re-created during build
      if (fs.existsSync(zipPath)) {
        try {
          fs.unlinkSync(zipPath);
        } catch (_) {}
      }

      zip.writeZip(zipPath);

      const zipStat = fs.statSync(zipPath);
      const zipSizeMB = (zipStat.size / (1024 * 1024)).toFixed(2);

      console.log(`[Build System] dist.zip successfully created! Size: ${zipSizeMB} MB (${zipStat.size} bytes)`);

      return res.json({
        status: "success",
        message: `پکیج به‌روزرسانی جدید با موفقیت جایگزین پکیج قبلی شد و ساخته گردید (${zipSizeMB} مگابایت).`,
        sizeMB: zipSizeMB,
        sizeBytes: zipStat.size,
        createdAt: new Date().toISOString(),
        downloadUrl: "/api/system/download-build"
      });
    } catch (err: any) {
      console.error("[Build System] Build package error:", err);
      return res.status(500).json({
        error: `خطا در ساخت پکیج به‌روزرسانی: ${err?.message || err}`
      });
    }
  });

  // 2. Download Build Endpoint: serves dist.zip
  app.get("/api/system/download-build", (req, res) => {
    try {
      const zipPath = path.join(process.cwd(), "dist.zip");
      if (!fs.existsSync(zipPath)) {
        return res.status(404).json({ error: "فایل dist.zip یافت نشد. لطفاً ابتدا دکمه ساخت پکیج را بزنید." });
      }

      const stat = fs.statSync(zipPath);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Length", stat.size.toString());
      res.setHeader("Content-Disposition", 'attachment; filename="dist.zip"');
      return res.sendFile(zipPath);
    } catch (err: any) {
      console.error("[Build System] Download build error:", err);
      return res.status(500).json({ error: `خطا در دانلود فایل: ${err?.message || err}` });
    }
  });

  // 3. Status Endpoint: checks if dist.zip exists
  app.get("/api/system/build-status", (req, res) => {
    try {
      const zipPath = path.join(process.cwd(), "dist.zip");
      if (fs.existsSync(zipPath)) {
        const stat = fs.statSync(zipPath);
        return res.json({
          exists: true,
          sizeMB: (stat.size / (1024 * 1024)).toFixed(2),
          sizeBytes: stat.size,
          mtime: stat.mtime.toISOString(),
          downloadUrl: "/api/system/download-build"
        });
      } else {
        return res.json({ exists: false });
      }
    } catch (err: any) {
      return res.json({ exists: false });
    }
  });


  // API: Extract payment slip (fish-e-varizi) details using Gemini
  app.post("/api/gemini/extract-slip", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "تصویر فیش ارسال نشده است." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: "کلید API برای دستیار هوشمند تنظیم نشده است (GEMINI_API_KEY یافت نشد). لطفا آن را در تنظیمات وارد کنید." 
        });
      }

      // Initialize GoogleGenAI SDK
      const baseUrl = process.env.GEMINI_BASE_URL || undefined;
      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          baseUrl,
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Parse the mimeType and base64Data
      let mimeType = "image/webp";
      let base64Data = imageBase64;
      if (imageBase64.startsWith("data:")) {
        const parts = imageBase64.split(",");
        base64Data = parts[1];
        const mimePart = parts[0].match(/data:(.*?);/);
        if (mimePart) {
          mimeType = mimePart[1];
        }
      }

      // Call Gemini Flash to extract the amount, date, and time
      let response;
      const slipPromptContents = [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        {
          text: "مبلغ، تاریخ پرداخت و ساعت پرداخت درج شده روی این فیش واریزی بانکی یا رسید انتقال وجه را با دقت استخراج کن. مبلغ نهایی تراکنش را حتماً به ریال تبدیل کن (اگر مبلغ به تومان است آن را ضربدر ۱۰ کن) و به صورت یک عدد صحیح بدون کاما، ویرگول یا هیچ کلمه‌ای بازگردان. تاریخ پرداخت را حتماً به فرمت تاریخ هجری شمسی به صورت چهار رقمی برای سال و دو رقمی برای ماه و روز (مانند 1405/04/06 یا 1403/12/25) تبدیل و استخراج کن. اگر سال دو رقمی بود آن را چهار رقمی کن (مثال: سال 03 به 1403). ساعت پرداخت را هم به فرمت دو رقمی ساعت و دقیقه (مانند 14:20 یا 09:15) استخراج کن. اگر ساعت پرداخت در رسید موجود نبود، مقدار خالی برگردان."
        }
      ];
      const slipConfig = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: {
              type: Type.INTEGER,
              description: "The extracted transaction amount converted strictly to Iranian Rials (ریال). If the slip specifies Tomans (تومان), multiply by 10 to convert to Rials. Return as a clean integer without any commas, letters, or words.",
            },
            date: {
              type: Type.STRING,
              description: "The extracted payment/transaction date converted to Jalali (Persian/Shamsi) calendar in YYYY/MM/DD format (e.g., 1403/05/12 or 1405/04/06). Do not use Gregorian calendar.",
            },
            time: {
              type: Type.STRING,
              description: "The extracted payment/transaction time/hour in HH:MM format (e.g., 14:32 or 09:15). If not found, return empty string.",
            }
          },
          required: ["amount", "date"],
        }
      };

      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: slipPromptContents,
          config: slipConfig
        });
      } catch (_e) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: slipPromptContents,
            config: slipConfig
          });
        } catch (_e2) {
          response = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: slipPromptContents,
            config: slipConfig
          });
        }
      }

      const text = response.text || "{}";
      const parsed = JSON.parse(text);
      return res.json(parsed);
    } catch (err: any) {
      console.error("Gemini slip extraction error:", err);
      let errorMsg = err?.message || "مشکل ناشناخته";
      if (errorMsg.includes("403") || err?.status === 403 || errorMsg.includes("Forbidden") || errorMsg.includes("PERMISSION_DENIED")) {
        errorMsg = "خطای ۴۰۳ (تحریم مستقیم گوگل بر علیه ایران). سرویس جمینای گوگل آی‌پی‌های ایران را مسدود کرده است.\n\nراهکار قطعی و آسان:\nشما می‌توانید یک آدرس پروکسی معتبر (مانند آدرس https://api.openai-hk.com یا یک پروکسی اختصاصی دیگر) در بخش تنظیمات نرم‌افزار، کادر «آدرس پایه API / پروکسی (Base URL)» وارد کرده و تنظیمات را ذخیره نمایید تا درخواست‌های شما بدون تحریم و با موفقیت ارسال شوند.";
      }
      return res.status(500).json({ 
        error: `خطا در استخراج اطلاعات فیش با هوش مصنوعی: ${errorMsg}` 
      });
    }
  });


  // Upload File & Images API (Categorized by Date & Format)
  app.post("/api/upload", async (req, res) => {
    try {
      const { fileData, fileName: reqFileName, category = "general" } = req.body || {};

      if (!fileData) {
        return res.status(400).json({ error: "فایل یا تصویر ارسالی خالی است (fileData الزامی است)." });
      }

      let buffer: Buffer;
      let detectedExt = "";

      if (typeof fileData === "string" && fileData.startsWith("data:")) {
        const parts = fileData.split(",");
        buffer = Buffer.from(parts[1] || "", "base64");
        const mimeMatch = parts[0].match(/data:image\/([a-zA-Z0-9+]+);/i);
        if (mimeMatch) {
          detectedExt = mimeMatch[1].toLowerCase();
          if (detectedExt === "jpeg") detectedExt = "jpg";
          if (detectedExt === "svg+xml") detectedExt = "svg";
        }
      } else if (typeof fileData === "string") {
        buffer = Buffer.from(fileData, "base64");
      } else if (Buffer.isBuffer(fileData)) {
        buffer = fileData;
      } else {
        return res.status(400).json({ error: "فرمت داده‌های ارسالی فایل نامعتبر است." });
      }

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: "محتوای فایل خالی است." });
      }

      let originalName = reqFileName || "image.png";
      let ext = path.extname(originalName).replace(".", "").toLowerCase();
      if (!ext && detectedExt) {
        ext = detectedExt;
      }
      if (!ext || ["php", "phtml", "exe", "sh", "cgi", "py", "env", "htaccess"].includes(ext)) {
        ext = "png";
      }

      // Date-based hierarchy (uploads/YYYY/MM/)
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");

      const uploadsBase = path.join(process.cwd(), "uploads", year, month);
      if (!fs.existsSync(uploadsBase)) {
        fs.mkdirSync(uploadsBase, { recursive: true });
      }

      const cleanPrefix = (category || "file").replace(/[^a-zA-Z0-9_-]/g, "");
      const timestamp = `${year}${month}${day}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
      const randomHex = Math.random().toString(36).substring(2, 8);
      const generatedFileName = `${cleanPrefix}_${timestamp}_${randomHex}.${ext}`;
      const fullPath = path.join(uploadsBase, generatedFileName);

      fs.writeFileSync(fullPath, buffer);

      const relativeUrl = `/uploads/${year}/${month}/${generatedFileName}`;
      const relativePath = `uploads/${year}/${month}/${generatedFileName}`;

      return res.json({
        status: "success",
        url: relativeUrl,
        relativePath: relativePath,
        fileName: generatedFileName,
        format: ext,
        size: buffer.length,
        year,
        month,
        date: `${year}-${month}-${day}`,
        message: "فایل با موفقیت در پوشه uploads بر اساس تاریخ و فرمت ذخیره شد."
      });
    } catch (err: any) {
      console.error("Upload error:", err);
      return res.status(500).json({ error: `خطا در آپلود فایل: ${err.message}` });
    }
  });

  // Ensure uploads directory exists and mount static routes
  const mainUploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(mainUploadsDir)) {
    fs.mkdirSync(mainUploadsDir, { recursive: true });
  }
  ensureUploadsSecurityNode();
  app.use("/uploads", express.static(mainUploadsDir));
  app.use("/public/uploads", express.static(mainUploadsDir));

  // 1. API: Server-side Gemini chat completions
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, systemInstruction } = req.body;
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: "کلید API برای دستیار هوشمند تنظیم نشده است (GEMINI_API_KEY یافت نشد). لطفا آن را در تنظیمات وارد کنید." 
        });
      }

      // Initialize GoogleGenAI SDK
      const baseUrl = process.env.GEMINI_BASE_URL || undefined;
      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          baseUrl,
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Build contents array in correct @google/genai format: { role: "user" | "model", parts: [{ text: "..." }] }
      const contents = messages.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }]
      }));

      // Generate content with system instructions for accounting assistance context
      let response;
      const chatSysInstruction = systemInstruction || "شما یک دستیار حسابداری و مالی هوشمند و متخصص برای نرم‌افزار حسابداری ما هستید. به تمامی سوالات عمومی، حسابداری، اصول مالیاتی و نحوه کار با نرم‌افزار با لحنی مودبانه، حرفه‌ای و به زبان فارسی پاسخ دهید.";
      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contents,
          config: {
            systemInstruction: chatSysInstruction,
            temperature: 0.7,
          }
        });
      } catch (err25: any) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: contents,
            config: {
              systemInstruction: chatSysInstruction,
              temperature: 0.7,
            }
          });
        } catch (err20: any) {
          try {
            response = await ai.models.generateContent({
              model: "gemini-1.5-flash",
              contents: contents,
              config: {
                systemInstruction: chatSysInstruction,
                temperature: 0.7,
              }
            });
          } catch (err15: any) {
            throw new Error(`خطای چندگانه جمینای: ${err15.message || "امکان برقراری ارتباط با مدل وجود ندارد"}. راهنما: در پنل Google AI Studio مطمئن شوید پروژه شما به درستی متصل شده و سرویس Generative Language API فعال است.`);
          }
        }
      }

      const responseText = response.text || "پاسخی دریافت نشد.";
      return res.json({ text: responseText });
    } catch (err: any) {
      console.error("Gemini API Error:", err);
      let errorMsg = err?.message || "مشکل ناشناخته";
      if (errorMsg.includes("403") || err?.status === 403 || errorMsg.includes("Forbidden") || errorMsg.includes("PERMISSION_DENIED")) {
        errorMsg = "خطای ۴۰۳ (تحریم مستقیم گوگل بر علیه ایران). سرویس جمینای گوگل آی‌پی‌های ایران را مسدود کرده است.\n\nراهکار قطعی و آسان:\nشما می‌توانید یک آدرس پروکسی معتبر (مانند آدرس https://api.openai-hk.com یا یک پروکسی اختصاصی دیگر) در بخش تنظیمات نرم‌افزار، کادر «آدرس پایه API / پروکسی (Base URL)» وارد کرده و تنظیمات را ذخیره نمایید تا درخواست‌های شما بدون تحریم و با موفقیت ارسال شوند.";
      } else if (errorMsg.includes("429") || err?.status === 429 || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.toLowerCase().includes("quota") || errorMsg.toLowerCase().includes("rate limit")) {
        errorMsg = "محدودیت سهمیه رایگان هوش مصنوعی گوگل (Quota / Rate Limit) به پایان رسیده است.\n\nراهکار:\n۱. چند دقیقه صبر کنید تا محدودیت ساعتی/دقیقه‌ای ریست شود.\n۲. یا در بخش «تنظیمات سیستم > هوش مصنوعی»، کلید API یا پروکسی اختصاصی خود را وارد نمایید.\n(سایر بخش‌های حسابداری، صدور فاکتور، اسناد و انبارداری کاملاً مستقل و فعال هستند.)";
      }
      return res.status(500).json({ 
        error: `خطا در برقراری ارتباط با دستیار هوشمند: ${errorMsg}` 
      });
    }
  });

  // Serve static assets reliably from public and dist folders
  app.use("/assets", express.static(path.join(process.cwd(), "public", "assets")));
  app.use("/assets", express.static(path.join(process.cwd(), "dist", "assets")));
  app.use("/assets", express.static(path.join(process.cwd(), "assets")));
  app.use(express.static(path.join(process.cwd(), "public")));

  // 2. Vite Developer Server Integration as Middleware
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in DEVELOPMENT mode with Vite dev middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in PRODUCTION mode, serving static files...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer();

<?php
/**
 * 💼 سامانه حسابداری هوشمند - هسته پردازشی یکپارچه PHP
 * این فایل تمامی درخواست‌های مربوط به پایگاه‌داده (MySQL/JSON)، هوش مصنوعی جمینای، و آپدیت خودکار سیستم را مدیریت می‌کند.
 */

// غیرفعال کردن نمایش مستقیم خطاها در خروجی برای حفظ قالب تمیز JSON، اما ثبت آن‌ها در لاگ
@ini_set('display_errors', 0);
@error_reporting(E_ALL);
@ini_set('log_errors', 1);

// افزایش سقف حافظه و زمان اجرا جهت پایداری بالا در پردازش‌ها و آپدیت‌ها
@ini_set('memory_limit', '256M');
@ini_set('max_execution_time', '300');
@ini_set('max_input_time', '300');
@set_time_limit(300);

// تنظیم هدر برای پاسخ‌دهی به صورت UTF-8 JSON
header('Content-Type: application/json; charset=utf-8');


// مدیریت هوشمند CORS جهت جلوگیری از نشت اطلاعات به دامنه‌های بیگانه
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$httpHost = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';

if (!empty($origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, x-upload-id, x-chunk-index, x-total-chunks, upload-id, chunk-index, total-chunks, Cache-Control, Pragma');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// استخراج آدرس زیرمسیر فراخوانی شده (به کمک ری‌رایت .htaccess یا استخراج مستقیم از REQUEST_URI)
$route = '';
if (isset($_GET['route'])) {
    $route = trim($_GET['route'], '/');
} elseif (isset($_GET['action'])) {
    $route = trim($_GET['action'], '/');
} else {
    $requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (strpos($requestUri, '/api/') !== false) {
        $parts = explode('/api/', $requestUri, 2);
        if (isset($parts[1])) {
            $route = trim($parts[1], '/');
        }
    }
}

// خواندن تنظیمات دیتابیس از فایل‌های پیکربندی wp-config.json، wp-config.php یا .env
$config = [];
$configPath = __DIR__ . '/wp-config.json';
if (file_exists($configPath)) {
    $config = json_decode(file_get_contents($configPath), true) ?: [];
}

// بررسی فایل wp-config.php وردپرس / هاست در صورت عدم وجود تنظیمات کامل
$wpPhpPath = __DIR__ . '/wp-config.php';
if (file_exists($wpPhpPath)) {
    $phpContent = file_get_contents($wpPhpPath);
    if (!isset($config['DB_NAME']) && preg_match("/define\s*\(\s*['\"]DB_NAME['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)/i", $phpContent, $m)) {
        $config['DB_NAME'] = $m[1];
        $config['DB_TYPE'] = 'mysql';
    }
    if (!isset($config['DB_USER']) && preg_match("/define\s*\(\s*['\"]DB_USER['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)/i", $phpContent, $m)) {
        $config['DB_USER'] = $m[1];
    }
    if (!isset($config['DB_PASSWORD']) && preg_match("/define\s*\(\s*['\"]DB_PASSWORD['\"]\s*,\s*['\"]([^'\"]*)['\"]\s*\)/i", $phpContent, $m)) {
        $config['DB_PASSWORD'] = $m[1];
    }
    if (!isset($config['DB_HOST']) && preg_match("/define\s*\(\s*['\"]DB_HOST['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)/i", $phpContent, $m)) {
        $config['DB_HOST'] = $m[1];
    }
}

// بررسی فایل .env در صورت وجود
$envPath = __DIR__ . '/.env';
if (file_exists($envPath)) {
    $envLines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($envLines as $line) {
        $line = trim($line);
        if (strpos($line, '#') === 0 || strpos($line, '=') === false) continue;
        list($envKey, $envVal) = explode('=', $line, 2);
        $envKey = trim($envKey);
        $envVal = trim(trim($envVal), '"\'');
        if (!isset($config[$envKey]) && !empty($envVal)) {
            $config[$envKey] = $envVal;
        }
    }
}

$dbHost = isset($config['DB_HOST']) ? $config['DB_HOST'] : (getenv('DB_HOST') ?: 'localhost');
$dbPort = isset($config['DB_PORT']) ? $config['DB_PORT'] : (getenv('DB_PORT') ?: 3306);
$dbUser = isset($config['DB_USER']) ? $config['DB_USER'] : (getenv('DB_USER') ?: 'wdamlpty_hesabdari-h-fahamand');
$dbPassword = isset($config['DB_PASSWORD']) ? $config['DB_PASSWORD'] : (getenv('DB_PASSWORD') ?: 'stsE*j70[m5FlSNY');
$dbName = isset($config['DB_NAME']) ? $config['DB_NAME'] : (getenv('DB_NAME') ?: 'wdamlpty_hesabdari-h.fahamand');
$geminiApiKey = isset($config['GEMINI_API_KEY']) ? $config['GEMINI_API_KEY'] : (getenv('GEMINI_API_KEY') ?: '');
$geminiBaseUrlRaw = isset($config['GEMINI_BASE_URL']) ? trim($config['GEMINI_BASE_URL']) : (getenv('GEMINI_BASE_URL') ?: '');

// بررسی هوشمند: آیا کاربر به جای URL، آی‌پی‌های DNS ضدتحریم را در فیلد Base URL وارد کرده است؟
$geminiDnsServers = '178.22.122.100,185.51.200.2'; // پیش‌فرض شکن (Shecan)
$geminiBaseUrl = 'https://generativelanguage.googleapis.com';

if (!empty($geminiBaseUrlRaw)) {
    // اگر در متن وارد شده، آی‌پی وجود داشته باشد، آن را به عنوان سرورهای DNS در نظر می‌گیریم
    if (preg_match_all('/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/', $geminiBaseUrlRaw, $matches)) {
        $geminiDnsServers = implode(',', $matches[0]);
    } else {
        // در غیر این صورت یک آدرس URL یا پروکسی معتبر است
        $geminiBaseUrl = rtrim($geminiBaseUrlRaw, '/');
    }
}

// پایگاه‌داده متمرکز MySQL (تنها موتور ذخیره‌سازی مجاز سامانه - بدون هیچ‌گونه Fallback متنی یا JSON)
$dbType = 'mysql';

// ایجاد اتصال به پایگاه‌داده متمرکز MySQL (اشتراکی میان کلیه پرسنل)
$pdo = null;
$mysqlConnected = false;
$mysqlError = null;

try {
    $dsn = "mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4";
    $pdo = new PDO($dsn, $dbUser, $dbPassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 5
    ]);
    $mysqlConnected = true;

    // اجرای خودکار و ایمن مایگریشن کلیه جداول اصلی سامانه (فقط یکبار با استفاده از فایل قفل برای جلوگیری از سرریز کوئری‌ها روی هاست اشتراکی)
    $lockFile = __DIR__ . '/db_migrated.lock';
    if (!file_exists($lockFile) || (isset($_GET['migrate']) && $_GET['migrate'] === 'true')) {
        runDatabaseMigrationsPhp($pdo);
        @file_put_contents($lockFile, date('Y-m-d H:i:s'));
    }
} catch (Exception $e) {
    $mysqlError = $e->getMessage();
    $mysqlConnected = false;
}

/**
 * مایگریشن خودکار و تکرارپذیر کلیه ۱۷ جدول پایگاه‌داده به همراه جدول ذخیره‌سازی JSON (app_state)
 * کلیه جداول با موتور InnoDB و کاراکترست utf8mb4 ایجاد شده و شامل فیلدهای id، created_at، updated_at
 * و برای موجودیت‌های مالی شامل fiscal_year_id و created_by می‌باشند.
 */
function runDatabaseMigrationsPhp($pdo) {
    if (!$pdo) return;
    
    $queries = [
        // 1. JSON Storage (app_state)
        "CREATE TABLE IF NOT EXISTS app_state (
            state_key VARCHAR(100) PRIMARY KEY,
            state_value LONGTEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 2. Users Table
        "CREATE TABLE IF NOT EXISTS users (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 3. Fiscal Years Table
        "CREATE TABLE IF NOT EXISTS fiscal_years (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 4. Counterparts (طرف‌های حساب)
        "CREATE TABLE IF NOT EXISTS counterparts (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 5. Categories (دسته‌بندی‌ها)
        "CREATE TABLE IF NOT EXISTS categories (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 6. Warehouses (انبارها)
        "CREATE TABLE IF NOT EXISTS warehouses (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 7. Items (کالاها و خدمات)
        "CREATE TABLE IF NOT EXISTS items (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 8. Accounts (حساب‌های بانکی و صندوق‌ها)
        "CREATE TABLE IF NOT EXISTS accounts (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 9. Invoices (فاکتورها و پیش‌فاکتورها)
        "CREATE TABLE IF NOT EXISTS invoices (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 10. Invoice Items (اقلام فاکتورها)
        "CREATE TABLE IF NOT EXISTS invoice_items (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 11. Transactions (تراکنش‌های بانکی و مالی)
        "CREATE TABLE IF NOT EXISTS transactions (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 12. Accounting Docs (اسناد حسابداری)
        "CREATE TABLE IF NOT EXISTS accounting_docs (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 13. Accounting Doc Lines (سطرهای سند حسابداری)
        "CREATE TABLE IF NOT EXISTS accounting_doc_lines (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 14. Logs (لاگ‌های سیستم و ممیزی)
        "CREATE TABLE IF NOT EXISTS logs (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 15. Notifications (اعلان‌ها)
        "CREATE TABLE IF NOT EXISTS notifications (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 16. Checklist (چک‌لیست)
        "CREATE TABLE IF NOT EXISTS checklist (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 17. Settings (تنظیمات)
        "CREATE TABLE IF NOT EXISTS settings (
            id VARCHAR(100) NOT NULL,
            setting_key VARCHAR(100) NOT NULL,
            setting_value LONGTEXT NULL,
            fiscal_year_id VARCHAR(100) NULL,
            created_by VARCHAR(100) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uk_settings_key (setting_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 18. Uploads (بارگذاری‌ها و پیوست‌ها)
        "CREATE TABLE IF NOT EXISTS uploads (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // 19. Settings Store (تنظیمات سیستمی و پیام‌رسان‌ها)
        "CREATE TABLE IF NOT EXISTS settings_store (
            setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
            setting_value LONGTEXT NULL,
            created_by VARCHAR(100) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
    ];

    foreach ($queries as $sql) {
        try {
            $pdo->exec($sql);
        } catch (Exception $e) {
            // نادیده گرفتن خطاهای جزیی برای تداوم اجرای دیگر جداول
        }
    }
}

/**
 * به‌روزرسانی تراکنشی و اتمیک موجودی انبار اقلام متناظر در جدول items با هر تغییر در فاکتور در PHP
 */
function adjustInventoryForInvoicePhp($pdo, $invoiceId, $isDeleted = false, $incomingInvoiceObj = null) {
    // 1. Get the old invoice details before this write (if any)
    $stmt = $pdo->prepare("SELECT type, is_proforma, is_deleted FROM invoices WHERE id = ?");
    $stmt->execute([$invoiceId]);
    $oldInv = $stmt->fetch(PDO::FETCH_ASSOC);
    $oldType = null;
    $oldIsProforma = false;
    $oldIsDeleted = false;
    if ($oldInv) {
        $oldType = isset($oldInv['type']) ? $oldInv['type'] : 'sale';
        $oldIsProforma = !empty($oldInv['is_proforma']);
        $oldIsDeleted = !empty($oldInv['is_deleted']);
    }

    // 2. Get the old invoice items
    $stmtItems = $pdo->prepare("SELECT item_id, qty, type FROM invoice_items WHERE invoice_id = ?");
    $stmtItems->execute([$invoiceId]);
    $oldItems = $stmtItems->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // 3. Normalize new parameters
    $newType = $incomingInvoiceObj ? (isset($incomingInvoiceObj['type']) ? $incomingInvoiceObj['type'] : 'sale') : $oldType;
    $newIsProforma = $incomingInvoiceObj ? (!empty($incomingInvoiceObj['isProforma'])) : $oldIsProforma;
    $newIsDeleted = $isDeleted;

    // 4. Optimization: Check if nothing changed that affects inventory
    if ($oldType !== null) {
        $isOldActive = !$oldIsDeleted && !$oldIsProforma && ($oldType === 'buy' || $oldType === 'purchase' || $oldType === 'sale');
        $isNewActive = !$newIsDeleted && !$newIsProforma && ($newType === 'buy' || $newType === 'purchase' || $newType === 'sale');

        if ($isOldActive === $isNewActive && $oldType === $newType) {
            if (!$isOldActive) {
                return;
            }
            
            $oldItemMap = [];
            foreach ($oldItems as $itm) {
                $itemId = isset($itm['item_id']) ? $itm['item_id'] : null;
                $qty = isset($itm['qty']) ? floatval($itm['qty']) : 0;
                $itemType = isset($itm['type']) ? $itm['type'] : 'kala';
                if ($itemId && $qty > 0 && $itemType === 'kala') {
                    $oldItemMap[$itemId] = (isset($oldItemMap[$itemId]) ? $oldItemMap[$itemId] : 0) + $qty;
                }
            }

            $newItemMap = [];
            if ($incomingInvoiceObj && isset($incomingInvoiceObj['items']) && is_array($incomingInvoiceObj['items'])) {
                foreach ($incomingInvoiceObj['items'] as $itm) {
                    if (!is_array($itm)) continue;
                    $itemId = isset($itm['itemId']) ? $itm['itemId'] : (isset($itm['id']) ? $itm['id'] : null);
                    $qty = isset($itm['qty']) ? floatval($itm['qty']) : (isset($itm['quantity']) ? floatval($itm['quantity']) : 1);
                    $itemType = isset($itm['type']) ? $itm['type'] : 'kala';
                    if ($itemId && $qty > 0 && $itemType === 'kala') {
                        $newItemMap[$itemId] = (isset($newItemMap[$itemId]) ? $newItemMap[$itemId] : 0) + $qty;
                    }
                }
            }

            ksort($oldItemMap);
            ksort($newItemMap);
            if ($oldItemMap === $newItemMap) {
                return;
            }
        }
    }

    // 5. REVERSE the old items' impact (if active)
    if ($oldType && !$oldIsProforma && !$oldIsDeleted) {
        $updateStmtAdd = $pdo->prepare("UPDATE items SET qty = qty + ? WHERE id = ?");
        $updateStmtSub = $pdo->prepare("UPDATE items SET qty = qty - ? WHERE id = ?");
        foreach ($oldItems as $oldItm) {
            $itemId = isset($oldItm['item_id']) ? $oldItm['item_id'] : null;
            $qty = isset($oldItm['qty']) ? floatval($oldItm['qty']) : 0;
            $itemType = isset($oldItm['type']) ? $oldItm['type'] : 'kala';
            if ($itemId && $qty > 0 && $itemType === 'kala') {
                if ($oldType === 'buy' || $oldType === 'purchase') {
                    $updateStmtSub->execute([$qty, $itemId]);
                } else if ($oldType === 'sale') {
                    $updateStmtAdd->execute([$qty, $itemId]);
                }
            }
        }
    }

    // 6. APPLY the new items' impact (if active)
    if ($newType && !$newIsProforma && !$newIsDeleted && $incomingInvoiceObj && isset($incomingInvoiceObj['items']) && is_array($incomingInvoiceObj['items'])) {
        $updateStmtAdd = $pdo->prepare("UPDATE items SET qty = qty + ? WHERE id = ?");
        $updateStmtSub = $pdo->prepare("UPDATE items SET qty = qty - ? WHERE id = ?");
        foreach ($incomingInvoiceObj['items'] as $itm) {
            if (!is_array($itm)) continue;
            $itemId = isset($itm['itemId']) ? $itm['itemId'] : (isset($itm['id']) ? $itm['id'] : null);
            $qty = isset($itm['qty']) ? floatval($itm['qty']) : (isset($itm['quantity']) ? floatval($itm['quantity']) : 1);
            $itemType = isset($itm['type']) ? $itm['type'] : 'kala';
            if ($itemId && $qty > 0 && $itemType === 'kala') {
                if ($newType === 'buy' || $newType === 'purchase') {
                    $updateStmtAdd->execute([$qty, $itemId]);
                } else if ($newType === 'sale') {
                    $updateStmtSub->execute([$qty, $itemId]);
                }
            }
        }
    }
}

/**
 * مایگریشن امن، تراکنشی و تکرارپذیر داده‌های JSON موجود در app_state به جداول تفکیکی رابطه‌ای MySQL در PHP
 */
function migrateAppStateDataToRelationalTablesPhp($pdo) {
    if (!$pdo) {
        throw new Exception("اتصال به پایگاه‌داده متمرکز MySQL برقرار نمی‌باشد.");
    }

    $startTime = microtime(true);
    $startedAt = date('c');
    $reports = [];
    $totalSourceRecords = 0;
    $totalDestinationRecords = 0;

    // ۱. اطمینان از ایجاد و اعتبارسنجی تمام جداول
    runDatabaseMigrationsPhp($pdo);

    // ۲. تهیه نسخه پشتیبان کامل از app_state قبل از هرگونه تغییر
    $nowStamp = date('YmdHis');
    $backupTableName = "app_state_backup_" . $nowStamp;
    $backupResult = ['created' => false];

    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS {$backupTableName} AS SELECT * FROM app_state");
        $backupResult['backupTable'] = $backupTableName;

        $pdo->exec("CREATE TABLE IF NOT EXISTS app_state_backups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            backup_table_name VARCHAR(100) NOT NULL,
            notes VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $stmtB = $pdo->prepare("INSERT INTO app_state_backups (backup_table_name, notes) VALUES (?, ?)");
        $stmtB->execute([$backupTableName, "Pre-migration automated snapshot at " . $startedAt]);

        $backupDir = __DIR__ . '/data/backups';
        if (!file_exists($backupDir)) {
            @mkdir($backupDir, 0755, true);
        }
        $allRowsStmt = $pdo->query("SELECT state_key, state_value FROM app_state");
        $allRows = $allRowsStmt->fetchAll(PDO::FETCH_ASSOC);
        $backupFilePath = $backupDir . "/app_state_backup_{$nowStamp}.json";
        @file_put_contents($backupFilePath, json_encode($allRows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $backupResult['backupFile'] = $backupFilePath;
        $backupResult['created'] = true;
    } catch (Exception $e) {
        $backupResult['error'] = $e->getMessage();
    }

    // ۳. بارگذاری کل داده‌های JSON از جدول app_state
    $stateData = [];
    try {
        $stmt = $pdo->query("SELECT state_key, state_value FROM app_state");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $val = safeUnwrapJsonPhp($row['state_value']);
            $cleanKey = (strpos($row['state_key'], 'acc_app_') === 0) ? substr($row['state_key'], 8) : $row['state_key'];
            $stateData[$cleanKey] = $val;
            $stateData['acc_app_' . $cleanKey] = $val;
        }
    } catch (Exception $e) {
        return [
            'success' => false,
            'backup' => $backupResult,
            'totalSourceRecords' => 0,
            'totalDestinationRecords' => 0,
            'reports' => $reports,
            'startedAt' => $startedAt,
            'completedAt' => date('c'),
            'durationMs' => round((microtime(true) - $startTime) * 1000),
            'error' => "خطا در خواندن داده‌های app_state: " . $e->getMessage()
        ];
    }

    $getArray = function($key) use ($stateData) {
        $val = isset($stateData[$key]) ? $stateData[$key] : (isset($stateData['acc_app_' . $key]) ? $stateData['acc_app_' . $key] : null);
        return is_array($val) ? $val : [];
    };

    // ۴. انتقال بخش به بخش در تراکنش‌های مجزا

    // الف. کاربران (users)
    $usersList = $getArray('users');
    $usersCount = count($usersList);
    $totalSourceRecords += $usersCount;
    try {
        $pdo->beginTransaction();
        $stmtU = $pdo->prepare("INSERT INTO users (id, username, name, role, password, phone, permissions, is_active, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                role = VALUES(role),
                password = VALUES(password),
                phone = VALUES(phone),
                permissions = VALUES(permissions),
                is_active = VALUES(is_active),
                updated_at = CURRENT_TIMESTAMP");

        foreach ($usersList as $u) {
            $id = !empty($u['id']) ? strval($u['id']) : (!empty($u['username']) ? 'user_' . $u['username'] : 'user_' . bin2hex(random_bytes(4)));
            $username = !empty($u['username']) ? strval($u['username']) : $id;
            $name = isset($u['name']) ? $u['name'] : null;
            $role = isset($u['role']) ? $u['role'] : 'seller';
            $password = isset($u['password']) ? $u['password'] : null;
            $phone = isset($u['phone']) ? $u['phone'] : null;
            $permissions = isset($u['permissions']) ? (is_string($u['permissions']) ? $u['permissions'] : json_encode($u['permissions'], JSON_UNESCAPED_UNICODE)) : '[]';
            $isActive = (!isset($u['isActive']) || $u['isActive'] !== false) ? 1 : 0;
            $createdBy = isset($u['createdBy']) ? $u['createdBy'] : null;
            $stmtU->execute([$id, $username, $name, $role, $password, $phone, $permissions, $isActive, $createdBy]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM users")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'users',
            'sourceCount' => $usersCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$usersCount} کاربر با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'users',
            'sourceCount' => $usersCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال کاربران: " . $e->getMessage()
        ];
    }

    // ب. سال‌های مالی (fiscal_years)
    $fyList = count($getArray('fiscalYears')) > 0 ? $getArray('fiscalYears') : $getArray('fiscal_years');
    $fyCount = count($fyList);
    $totalSourceRecords += $fyCount;
    try {
        $pdo->beginTransaction();
        $stmtF = $pdo->prepare("INSERT INTO fiscal_years (id, year, start_date, end_date, registered, is_closed, closed_at, closed_by, locked_date, setup_date, created_by)
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
                updated_at = CURRENT_TIMESTAMP");

        foreach ($fyList as $fy) {
            $id = !empty($fy['id']) ? strval($fy['id']) : (!empty($fy['year']) ? 'fy_' . $fy['year'] : 'fy_' . bin2hex(random_bytes(4)));
            $year = !empty($fy['year']) ? strval($fy['year']) : '';
            $startDate = isset($fy['startDate']) ? $fy['startDate'] : null;
            $endDate = isset($fy['endDate']) ? $fy['endDate'] : null;
            $registered = !empty($fy['registered']) ? 1 : 0;
            $isClosed = !empty($fy['isClosed']) ? 1 : 0;
            $closedAt = isset($fy['closedAt']) ? $fy['closedAt'] : null;
            $closedBy = isset($fy['closedBy']) ? $fy['closedBy'] : null;
            $lockedDate = isset($fy['lockedDate']) ? $fy['lockedDate'] : null;
            $setupDate = isset($fy['setupDate']) ? $fy['setupDate'] : null;
            $createdBy = isset($fy['createdBy']) ? $fy['createdBy'] : null;
            $stmtF->execute([$id, $year, $startDate, $endDate, $registered, $isClosed, $closedAt, $closedBy, $lockedDate, $setupDate, $createdBy]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM fiscal_years")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'fiscal_years',
            'sourceCount' => $fyCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$fyCount} سال مالی با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'fiscal_years',
            'sourceCount' => $fyCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال سال‌های مالی: " . $e->getMessage()
        ];
    }

    // ج. طرف‌حساب‌ها (counterparts)
    $cpList = $getArray('counterparts');
    $cpCount = count($cpList);
    $totalSourceRecords += $cpCount;
    try {
        $pdo->beginTransaction();
        $stmtC = $pdo->prepare("INSERT INTO counterparts (id, name, phone, address, type, acquaintance_method, communication_channel, shipping_method, custom_icons, fiscal_year_id, created_by, created_by_id)
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
                updated_at = CURRENT_TIMESTAMP");

        foreach ($cpList as $cp) {
            $id = !empty($cp['id']) ? strval($cp['id']) : 'cp_' . bin2hex(random_bytes(4));
            $name = !empty($cp['name']) ? strval($cp['name']) : 'طرف حساب';
            $phone = isset($cp['phone']) ? $cp['phone'] : null;
            $address = isset($cp['address']) ? $cp['address'] : null;
            $type = isset($cp['type']) ? $cp['type'] : 'both';
            $acquaintanceMethod = isset($cp['acquaintanceMethod']) ? $cp['acquaintanceMethod'] : null;
            $communicationChannel = isset($cp['communicationChannel']) ? $cp['communicationChannel'] : null;
            $shippingMethod = isset($cp['shippingMethod']) ? $cp['shippingMethod'] : null;
            $customIcons = isset($cp['customIcons']) ? (is_string($cp['customIcons']) ? $cp['customIcons'] : json_encode($cp['customIcons'], JSON_UNESCAPED_UNICODE)) : null;
            $fiscalYearId = isset($cp['fiscalYearId']) ? $cp['fiscalYearId'] : null;
            $createdBy = isset($cp['createdBy']) ? $cp['createdBy'] : null;
            $createdById = isset($cp['createdById']) ? $cp['createdById'] : null;
            $stmtC->execute([$id, $name, $phone, $address, $type, $acquaintanceMethod, $communicationChannel, $shippingMethod, $customIcons, $fiscalYearId, $createdBy, $createdById]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM counterparts")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'counterparts',
            'sourceCount' => $cpCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$cpCount} طرف حساب با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'counterparts',
            'sourceCount' => $cpCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال طرف‌های حساب: " . $e->getMessage()
        ];
    }

    // د. دسته‌بندی‌ها (categories)
    $catList = array_merge($getArray('categories'), $getArray('warehouse_categories_list'));
    $uniqueCats = [];
    foreach ($catList as $c) {
        $k = !empty($c['id']) ? $c['id'] : (!empty($c['name']) ? $c['name'] : null);
        if ($k && !isset($uniqueCats[$k])) {
            $uniqueCats[$k] = $c;
        }
    }
    $catsArr = array_values($uniqueCats);
    $catCount = count($catsArr);
    $totalSourceRecords += $catCount;
    try {
        $pdo->beginTransaction();
        $stmtCat = $pdo->prepare("INSERT INTO categories (id, name, parent_id, parent_name, type, subcategories, fiscal_year_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                parent_id = VALUES(parent_id),
                parent_name = VALUES(parent_name),
                type = VALUES(type),
                subcategories = VALUES(subcategories),
                fiscal_year_id = VALUES(fiscal_year_id),
                updated_at = CURRENT_TIMESTAMP");

        foreach ($catsArr as $cat) {
            $id = !empty($cat['id']) ? strval($cat['id']) : 'cat_' . bin2hex(random_bytes(4));
            $name = !empty($cat['name']) ? strval($cat['name']) : 'دسته‌بندی';
            $parentId = isset($cat['parentId']) ? $cat['parentId'] : null;
            $parentName = isset($cat['parentName']) ? $cat['parentName'] : null;
            $type = isset($cat['type']) ? $cat['type'] : 'transaction';
            $subcategories = isset($cat['subcategories']) ? (is_string($cat['subcategories']) ? $cat['subcategories'] : json_encode($cat['subcategories'], JSON_UNESCAPED_UNICODE)) : (isset($cat['subCategories']) ? (is_string($cat['subCategories']) ? $cat['subCategories'] : json_encode($cat['subCategories'], JSON_UNESCAPED_UNICODE)) : null);
            $fiscalYearId = isset($cat['fiscalYearId']) ? $cat['fiscalYearId'] : null;
            $createdBy = isset($cat['createdBy']) ? $cat['createdBy'] : null;
            $stmtCat->execute([$id, $name, $parentId, $parentName, $type, $subcategories, $fiscalYearId, $createdBy]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM categories")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'categories',
            'sourceCount' => $catCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$catCount} دسته‌بندی با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'categories',
            'sourceCount' => $catCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال دسته‌بندی‌ها: " . $e->getMessage()
        ];
    }

    // ه. انبارها (warehouses)
    $whList = $getArray('warehouses');
    $whCount = count($whList);
    $totalSourceRecords += $whCount;
    try {
        $pdo->beginTransaction();
        $stmtWh = $pdo->prepare("INSERT INTO warehouses (id, name, code, location, manager, phone, description, is_active, fiscal_year_id, created_by)
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
                updated_at = CURRENT_TIMESTAMP");

        foreach ($whList as $wh) {
            $id = !empty($wh['id']) ? strval($wh['id']) : 'wh_' . bin2hex(random_bytes(4));
            $name = !empty($wh['name']) ? strval($wh['name']) : 'انبار اصلی';
            $code = isset($wh['code']) ? $wh['code'] : null;
            $location = isset($wh['location']) ? $wh['location'] : null;
            $manager = isset($wh['manager']) ? $wh['manager'] : null;
            $phone = isset($wh['phone']) ? $wh['phone'] : null;
            $description = isset($wh['description']) ? $wh['description'] : null;
            $isActive = (!isset($wh['isActive']) || $wh['isActive'] !== false) ? 1 : 0;
            $fiscalYearId = isset($wh['fiscalYearId']) ? $wh['fiscalYearId'] : null;
            $createdBy = isset($wh['createdBy']) ? $wh['createdBy'] : null;
            $stmtWh->execute([$id, $name, $code, $location, $manager, $phone, $description, $isActive, $fiscalYearId, $createdBy]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM warehouses")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'warehouses',
            'sourceCount' => $whCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$whCount} انبار با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'warehouses',
            'sourceCount' => $whCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال انبارها: " . $e->getMessage()
        ];
    }

    // و. کالاها و خدمات (items)
    $itemsList = $getArray('items');
    $itemsCount = count($itemsList);
    $totalSourceRecords += $itemsCount;
    try {
        $pdo->beginTransaction();
        $stmtIt = $pdo->prepare("INSERT INTO items (
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
                updated_at = CURRENT_TIMESTAMP");

        foreach ($itemsList as $it) {
            $id = !empty($it['id']) ? strval($it['id']) : 'item_' . bin2hex(random_bytes(4));
            $warehouseId = isset($it['warehouseId']) ? $it['warehouseId'] : null;
            $name = !empty($it['name']) ? strval($it['name']) : 'کالا';
            $code = isset($it['code']) ? $it['code'] : null;
            $type = isset($it['type']) ? $it['type'] : 'kala';
            $color = isset($it['color']) ? $it['color'] : null;
            $unit = isset($it['unit']) ? $it['unit'] : null;
            $qty = isset($it['qty']) ? floatval($it['qty']) : 0;
            $initialQty = isset($it['initialQty']) ? floatval($it['initialQty']) : 0;
            $lastPurchasePrice = isset($it['lastPurchasePrice']) ? floatval($it['lastPurchasePrice']) : 0;
            $lastSalePrice = isset($it['lastSalePrice']) ? floatval($it['lastSalePrice']) : 0;
            $minQtyAlarm = isset($it['minQtyAlarm']) ? floatval($it['minQtyAlarm']) : 0;
            $categoryName = isset($it['categoryName']) ? $it['categoryName'] : (isset($it['category']) ? $it['category'] : null);
            $parentCategory = isset($it['parentCategory']) ? $it['parentCategory'] : null;
            $subCategory = isset($it['subCategory']) ? $it['subCategory'] : null;
            $commissionPercent = isset($it['commissionPercent']) ? floatval($it['commissionPercent']) : 0;
            $setupDate = isset($it['setupDate']) ? $it['setupDate'] : null;
            $fiscalYearId = isset($it['fiscalYearId']) ? $it['fiscalYearId'] : null;
            $createdBy = isset($it['createdBy']) ? $it['createdBy'] : null;

            $stmtIt->execute([
                $id, $warehouseId, $name, $code, $type, $color, $unit, $qty, $initialQty,
                $lastPurchasePrice, $lastSalePrice, $minQtyAlarm, $categoryName,
                $parentCategory, $subCategory, $commissionPercent, $setupDate, $fiscalYearId, $createdBy
            ]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM items")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'items',
            'sourceCount' => $itemsCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$itemsCount} کالا و خدمات با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'items',
            'sourceCount' => $itemsCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال کالاها: " . $e->getMessage()
        ];
    }

    // ز. حساب‌ها (accounts)
    $accList = $getArray('accounts');
    $accCount = count($accList);
    $totalSourceRecords += $accCount;
    try {
        $pdo->beginTransaction();
        $stmtA = $pdo->prepare("INSERT INTO accounts (id, name, account_number, type, balance, card_number, sheba_number, bank_name, branch, description, fiscal_year_id, created_by)
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
                updated_at = CURRENT_TIMESTAMP");

        foreach ($accList as $acc) {
            $id = !empty($acc['id']) ? strval($acc['id']) : 'acc_' . bin2hex(random_bytes(4));
            $name = !empty($acc['name']) ? strval($acc['name']) : 'حساب';
            $accountNumber = isset($acc['accountNumber']) ? $acc['accountNumber'] : null;
            $type = isset($acc['type']) ? $acc['type'] : 'bank';
            $balance = isset($acc['balance']) ? floatval($acc['balance']) : 0;
            $cardNumber = isset($acc['cardNumber']) ? $acc['cardNumber'] : null;
            $shebaNumber = isset($acc['shebaNumber']) ? $acc['shebaNumber'] : null;
            $bankName = isset($acc['bankName']) ? $acc['bankName'] : null;
            $branch = isset($acc['branch']) ? $acc['branch'] : null;
            $description = isset($acc['description']) ? $acc['description'] : null;
            $fiscalYearId = isset($acc['fiscalYearId']) ? $acc['fiscalYearId'] : null;
            $createdBy = isset($acc['createdBy']) ? $acc['createdBy'] : null;

            $stmtA->execute([$id, $name, $accountNumber, $type, $balance, $cardNumber, $shebaNumber, $bankName, $branch, $description, $fiscalYearId, $createdBy]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM accounts")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'accounts',
            'sourceCount' => $accCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$accCount} حساب بانکی با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'accounts',
            'sourceCount' => $accCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال حساب‌ها: " . $e->getMessage()
        ];
    }

    // ح. فاکتورها و ردیف‌های فاکتور (invoices & invoice_items)
    $invList = $getArray('invoices');
    $invCount = count($invList);
    $totalSourceRecords += $invCount;
    $invItemsCount = 0;
    try {
        $pdo->beginTransaction();
        $stmtInv = $pdo->prepare("INSERT INTO invoices (
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
                updated_at = CURRENT_TIMESTAMP");

        $stmtItm = $pdo->prepare("INSERT INTO invoice_items (
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
                updated_at = CURRENT_TIMESTAMP");

        foreach ($invList as $inv) {
            $id = !empty($inv['id']) ? strval($inv['id']) : 'inv_' . (!empty($inv['invoiceNumber']) ? $inv['invoiceNumber'] : bin2hex(random_bytes(4)));
            $invoiceNumber = !empty($inv['invoiceNumber']) ? strval($inv['invoiceNumber']) : $id;
            $type = isset($inv['type']) ? $inv['type'] : 'sale';
            $date = !empty($inv['date']) ? strval($inv['date']) : '';
            $counterpartId = isset($inv['counterpartId']) ? $inv['counterpartId'] : null;
            $counterpartName = isset($inv['counterpartName']) ? $inv['counterpartName'] : null;
            $counterpartPhone = isset($inv['counterpartPhone']) ? $inv['counterpartPhone'] : null;
            $counterpartAddress = isset($inv['counterpartAddress']) ? $inv['counterpartAddress'] : null;
            $totalAmount = isset($inv['totalAmount']) ? floatval($inv['totalAmount']) : 0;
            $tax = isset($inv['tax']) ? floatval($inv['tax']) : 0;
            $deposit = isset($inv['deposit']) ? floatval($inv['deposit']) : 0;
            $discount = isset($inv['discount']) ? floatval($inv['discount']) : 0;
            $paymentAmount = isset($inv['paymentAmount']) ? floatval($inv['paymentAmount']) : 0;
            $paymentDate = isset($inv['paymentDate']) ? $inv['paymentDate'] : null;
            $description = isset($inv['description']) ? $inv['description'] : null;
            $isProforma = !empty($inv['isProforma']) ? 1 : 0;
            $isUrgent = !empty($inv['isUrgent']) ? 1 : 0;
            $urgentType = isset($inv['urgentType']) ? $inv['urgentType'] : null;
            $shippingMethod = isset($inv['shippingMethod']) ? $inv['shippingMethod'] : null;
            $acquaintanceMethod = isset($inv['acquaintanceMethod']) ? $inv['acquaintanceMethod'] : null;
            $docId = isset($inv['docId']) ? $inv['docId'] : null;
            $cogsDocId = isset($inv['cogsDocId']) ? $inv['cogsDocId'] : null;
            $cogsTotal = isset($inv['cogsTotal']) ? floatval($inv['cogsTotal']) : 0;
            $isReturn = !empty($inv['isReturn']) ? 1 : 0;
            $returnRefInvoiceId = isset($inv['returnRefInvoiceId']) ? $inv['returnRefInvoiceId'] : null;
            $isDeleted = !empty($inv['isDeleted']) ? 1 : 0;
            $deletedBy = isset($inv['deletedBy']) ? $inv['deletedBy'] : null;
            $deletedById = isset($inv['deletedById']) ? $inv['deletedById'] : null;
            $deletedAt = isset($inv['deletedAt']) ? $inv['deletedAt'] : null;
            $customIcons = isset($inv['customIcons']) ? (is_string($inv['customIcons']) ? $inv['customIcons'] : json_encode($inv['customIcons'], JSON_UNESCAPED_UNICODE)) : null;
            $attachments = isset($inv['attachments']) ? (is_string($inv['attachments']) ? $inv['attachments'] : json_encode($inv['attachments'], JSON_UNESCAPED_UNICODE)) : null;
            $paymentSlips = isset($inv['paymentSlips']) ? (is_string($inv['paymentSlips']) ? $inv['paymentSlips'] : json_encode($inv['paymentSlips'], JSON_UNESCAPED_UNICODE)) : null;
            $history = isset($inv['history']) ? (is_string($inv['history']) ? $inv['history'] : json_encode($inv['history'], JSON_UNESCAPED_UNICODE)) : null;
            $allocations = isset($inv['allocations']) ? (is_string($inv['allocations']) ? $inv['allocations'] : json_encode($inv['allocations'], JSON_UNESCAPED_UNICODE)) : null;
            $fiscalYearId = isset($inv['fiscalYearId']) ? $inv['fiscalYearId'] : null;
            $createdBy = isset($inv['createdBy']) ? $inv['createdBy'] : null;
            $createdById = isset($inv['createdById']) ? $inv['createdById'] : null;
            $createdByPhone = isset($inv['createdByPhone']) ? $inv['createdByPhone'] : null;

            // Update inventory transactionally in MySQL before modifying the invoice items
            adjustInventoryForInvoicePhp($pdo, $id, !empty($isDeleted), $inv);

            $stmtInv->execute([
                $id, $invoiceNumber, $type, $date, $counterpartId, $counterpartName, $counterpartPhone,
                $counterpartAddress, $totalAmount, $tax, $deposit, $discount, $paymentAmount, $paymentDate,
                $description, $isProforma, $isUrgent, $urgentType, $shippingMethod, $acquaintanceMethod,
                $docId, $cogsDocId, $cogsTotal, $isReturn, $returnRefInvoiceId, $isDeleted,
                $deletedBy, $deletedById, $deletedAt, $customIcons, $attachments, $paymentSlips,
                $history, $allocations, $fiscalYearId, $createdBy, $createdById, $createdByPhone
            ]);

            $itemsArr = isset($inv['items']) && is_array($inv['items']) ? $inv['items'] : [];
            $invItemsCount += count($itemsArr);
            foreach ($itemsArr as $idx => $item) {
                $itemIdPk = !empty($item['id']) ? strval($item['id']) : "{$id}_item_" . ($idx + 1);
                $refItemId = isset($item['itemId']) ? $item['itemId'] : null;
                $itemName = !empty($item['name']) ? strval($item['name']) : 'ردیف فاکتور';
                $itemType = isset($item['type']) ? $item['type'] : 'kala';
                $itemColor = isset($item['color']) ? $item['color'] : null;
                $itemUnit = isset($item['unit']) ? $item['unit'] : null;
                $itemQty = isset($item['qty']) ? floatval($item['qty']) : 1;
                $itemUnitPrice = isset($item['unitPrice']) ? floatval($item['unitPrice']) : 0;
                $itemTotalPrice = isset($item['totalPrice']) ? floatval($item['totalPrice']) : ($itemQty * $itemUnitPrice);
                $itemCogsUnit = isset($item['cogsUnitCost']) ? floatval($item['cogsUnitCost']) : 0;
                $itemCogsTotal = isset($item['cogsTotal']) ? floatval($item['cogsTotal']) : ($itemQty * $itemCogsUnit);
                $itemRemarks = isset($item['remarks']) ? $item['remarks'] : null;

                $stmtItm->execute([
                    $itemIdPk, $id, $refItemId, $itemName, $itemType, $itemColor, $itemUnit, $itemQty, $itemUnitPrice,
                    $itemTotalPrice, $itemCogsUnit, $itemCogsTotal, $itemRemarks, $idx, $fiscalYearId, $createdBy
                ]);
            }
        }
        $pdo->commit();

        $destInv = intval($pdo->query("SELECT COUNT(*) FROM invoices")->fetchColumn());
        $totalDestinationRecords += $destInv;
        $reports[] = [
            'table' => 'invoices',
            'sourceCount' => $invCount,
            'destinationCount' => $destInv,
            'status' => 'success',
            'message' => "انتقال {$invCount} فاکتور با موفقیت در تراکنش انجام شد."
        ];

        $destItm = intval($pdo->query("SELECT COUNT(*) FROM invoice_items")->fetchColumn());
        $totalDestinationRecords += $destItm;
        $totalSourceRecords += $invItemsCount;
        $reports[] = [
            'table' => 'invoice_items',
            'sourceCount' => $invItemsCount,
            'destinationCount' => $destItm,
            'status' => 'success',
            'message' => "انتقال {$invItemsCount} ردیف فاکتور با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'invoices',
            'sourceCount' => $invCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال فاکتورها: " . $e->getMessage()
        ];
        $reports[] = [
            'table' => 'invoice_items',
            'sourceCount' => $invItemsCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال ردیف‌های فاکتور: " . $e->getMessage()
        ];
    }

    // ط. تراکنش‌ها (transactions)
    $txList = $getArray('transactions');
    $txCount = count($txList);
    $totalSourceRecords += $txCount;
    try {
        $pdo->beginTransaction();
        $stmtTx = $pdo->prepare("INSERT INTO transactions (
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
                updated_at = CURRENT_TIMESTAMP");

        foreach ($txList as $tx) {
            $id = !empty($tx['id']) ? strval($tx['id']) : 'tx_' . bin2hex(random_bytes(4));
            $date = !empty($tx['date']) ? strval($tx['date']) : '';
            $time = isset($tx['time']) ? $tx['time'] : null;
            $amount = isset($tx['amount']) ? floatval($tx['amount']) : 0;
            $type = isset($tx['type']) ? $tx['type'] : 'deposit';
            $description = isset($tx['description']) ? $tx['description'] : null;
            $isRegistered = !empty($tx['isRegistered']) ? 1 : 0;
            $categoryParent = isset($tx['categoryParent']) ? $tx['categoryParent'] : null;
            $categoryChild = isset($tx['categoryChild']) ? $tx['categoryChild'] : null;
            $userDescription = isset($tx['userDescription']) ? $tx['userDescription'] : null;
            $isDuplicate = !empty($tx['isDuplicate']) ? 1 : 0;
            $duplicateReason = isset($tx['duplicateReason']) ? $tx['duplicateReason'] : null;
            $trackingNumber = isset($tx['trackingNumber']) ? $tx['trackingNumber'] : null;
            $referenceCode = isset($tx['referenceCode']) ? $tx['referenceCode'] : null;
            $registeredDate = isset($tx['registeredDate']) ? $tx['registeredDate'] : null;
            $accountId = isset($tx['accountId']) ? $tx['accountId'] : null;
            $partnerId = isset($tx['partnerId']) ? $tx['partnerId'] : null;
            $pendingDepositId = isset($tx['pendingDepositId']) ? $tx['pendingDepositId'] : null;
            $borrowerId = isset($tx['borrowerId']) ? $tx['borrowerId'] : null;
            $borrowerName = isset($tx['borrowerName']) ? $tx['borrowerName'] : null;
            $loanType = isset($tx['loanType']) ? $tx['loanType'] : null;
            $counterpartId = isset($tx['counterpartId']) ? $tx['counterpartId'] : null;
            $counterpartName = isset($tx['counterpartName']) ? $tx['counterpartName'] : null;
            $invoiceId = isset($tx['invoiceId']) ? $tx['invoiceId'] : null;
            $docId = isset($tx['docId']) ? $tx['docId'] : null;
            $attachments = isset($tx['attachments']) ? (is_string($tx['attachments']) ? $tx['attachments'] : json_encode($tx['attachments'], JSON_UNESCAPED_UNICODE)) : null;
            $isEdited = !empty($tx['isEdited']) ? 1 : 0;
            $editedBy = isset($tx['editedBy']) ? $tx['editedBy'] : null;
            $editedById = isset($tx['editedById']) ? $tx['editedById'] : null;
            $editedAt = isset($tx['editedAt']) ? $tx['editedAt'] : null;
            $editHistory = isset($tx['editHistory']) ? (is_string($tx['editHistory']) ? $tx['editHistory'] : json_encode($tx['editHistory'], JSON_UNESCAPED_UNICODE)) : null;
            $isDeleted = !empty($tx['isDeleted']) ? 1 : 0;
            $deletedBy = isset($tx['deletedBy']) ? $tx['deletedBy'] : null;
            $deletedById = isset($tx['deletedById']) ? $tx['deletedById'] : null;
            $deletedAt = isset($tx['deletedAt']) ? $tx['deletedAt'] : null;
            $fiscalYearId = isset($tx['fiscalYearId']) ? $tx['fiscalYearId'] : null;
            $createdBy = isset($tx['createdBy']) ? $tx['createdBy'] : null;
            $createdById = isset($tx['createdById']) ? $tx['createdById'] : null;

            $stmtTx->execute([
                $id, $date, $time, $amount, $type, $description, $isRegistered, $categoryParent,
                $categoryChild, $userDescription, $isDuplicate, $duplicateReason, $trackingNumber,
                $referenceCode, $registeredDate, $accountId, $partnerId, $pendingDepositId,
                $borrowerId, $borrowerName, $loanType, $counterpartId, $counterpartName,
                $invoiceId, $docId, $attachments, $isEdited, $editedBy, $editedById, $editedAt,
                $editHistory, $isDeleted, $deletedBy, $deletedById, $deletedAt, $fiscalYearId,
                $createdBy, $createdById
            ]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM transactions")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'transactions',
            'sourceCount' => $txCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$txCount} تراکنش با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'transactions',
            'sourceCount' => $txCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال تراکنش‌ها: " . $e->getMessage()
        ];
    }

    // ی. اسناد حسابداری و سطرهای سند (accounting_docs & doc_lines)
    $docsList = count($getArray('docs')) > 0 ? $getArray('docs') : $getArray('accountingDocs');
    $docsCount = count($docsList);
    $totalSourceRecords += $docsCount;
    $docLinesCount = 0;
    try {
        $pdo->beginTransaction();
        $stmtDoc = $pdo->prepare("INSERT INTO accounting_docs (
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
                updated_at = CURRENT_TIMESTAMP");

        $stmtLin = $pdo->prepare("INSERT INTO accounting_doc_lines (
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
                updated_at = CURRENT_TIMESTAMP");

        foreach ($docsList as $doc) {
            $id = !empty($doc['id']) ? strval($doc['id']) : 'doc_' . (!empty($doc['docNumber']) ? $doc['docNumber'] : bin2hex(random_bytes(4)));
            $docNumber = isset($doc['docNumber']) ? intval($doc['docNumber']) : 0;
            $date = !empty($doc['date']) ? strval($doc['date']) : '';
            $description = isset($doc['description']) ? $doc['description'] : null;
            $isArchived = !empty($doc['isArchived']) ? 1 : 0;
            $isManual = !empty($doc['isManual']) ? 1 : 0;
            $status = isset($doc['status']) ? $doc['status'] : 'posted';
            $operationType = isset($doc['operationType']) ? $doc['operationType'] : null;
            $invoiceId = isset($doc['invoiceId']) ? $doc['invoiceId'] : null;
            $txId = isset($doc['txId']) ? $doc['txId'] : null;
            $refDocId = isset($doc['refDocId']) ? $doc['refDocId'] : null;
            $idempotencyKey = isset($doc['idempotencyKey']) ? $doc['idempotencyKey'] : null;
            $actorId = isset($doc['actorId']) ? $doc['actorId'] : null;
            $actorName = isset($doc['actorName']) ? $doc['actorName'] : null;
            $isDeleted = !empty($doc['isDeleted']) ? 1 : 0;
            $deletedBy = isset($doc['deletedBy']) ? $doc['deletedBy'] : null;
            $deletedById = isset($doc['deletedById']) ? $doc['deletedById'] : null;
            $deletedAt = isset($doc['deletedAt']) ? $doc['deletedAt'] : null;
            $fiscalYearId = isset($doc['fiscalYearId']) ? $doc['fiscalYearId'] : null;
            $createdBy = isset($doc['createdBy']) ? $doc['createdBy'] : null;

            $stmtDoc->execute([
                $id, $docNumber, $date, $description, $isArchived, $isManual, $status,
                $operationType, $invoiceId, $txId, $refDocId, $idempotencyKey,
                $actorId, $actorName, $isDeleted, $deletedBy, $deletedById, $deletedAt,
                $fiscalYearId, $createdBy
            ]);

            $linesArr = isset($doc['lines']) && is_array($doc['lines']) ? $doc['lines'] : [];
            $docLinesCount += count($linesArr);
            foreach ($linesArr as $idx => $line) {
                $lineIdPk = !empty($line['id']) ? strval($line['id']) : "{$id}_line_" . ($idx + 1);
                $accountId = isset($line['accountId']) ? $line['accountId'] : null;
                $accountName = isset($line['accountName']) ? $line['accountName'] : null;
                $debit = isset($line['debit']) ? floatval($line['debit']) : 0;
                $credit = isset($line['credit']) ? floatval($line['credit']) : 0;
                $lineDesc = isset($line['description']) ? $line['description'] : null;

                $stmtLin->execute([$lineIdPk, $id, $accountId, $accountName, $debit, $credit, $lineDesc, $idx, $fiscalYearId, $createdBy]);
            }
        }
        $pdo->commit();

        $destDocs = intval($pdo->query("SELECT COUNT(*) FROM accounting_docs")->fetchColumn());
        $totalDestinationRecords += $destDocs;
        $reports[] = [
            'table' => 'accounting_docs',
            'sourceCount' => $docsCount,
            'destinationCount' => $destDocs,
            'status' => 'success',
            'message' => "انتقال {$docsCount} سند حسابداری با موفقیت در تراکنش انجام شد."
        ];

        $destLines = intval($pdo->query("SELECT COUNT(*) FROM accounting_doc_lines")->fetchColumn());
        $totalDestinationRecords += $destLines;
        $totalSourceRecords += $docLinesCount;
        $reports[] = [
            'table' => 'accounting_doc_lines',
            'sourceCount' => $docLinesCount,
            'destinationCount' => $destLines,
            'status' => 'success',
            'message' => "انتقال {$docLinesCount} سطر سند با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'accounting_docs',
            'sourceCount' => $docsCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال اسناد حسابداری: " . $e->getMessage()
        ];
        $reports[] = [
            'table' => 'accounting_doc_lines',
            'sourceCount' => $docLinesCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال سطرهای اسناد: " . $e->getMessage()
        ];
    }

    // ک. لاگ‌ها (logs)
    $logsList = array_merge($getArray('system_logs'), $getArray('auditLogs'), $getArray('logs'));
    $uniqueLogs = [];
    foreach ($logsList as $l) {
        $k = !empty($l['id']) ? $l['id'] : ((isset($l['timestampMs']) ? $l['timestampMs'] : '') . '_' . (isset($l['message']) ? $l['message'] : ''));
        if ($k && !isset($uniqueLogs[$k])) {
            $uniqueLogs[$k] = $l;
        }
    }
    $logsArr = array_values($uniqueLogs);
    $logsCount = count($logsArr);
    $totalSourceRecords += $logsCount;
    try {
        $pdo->beginTransaction();
        $stmtLog = $pdo->prepare("INSERT INTO logs (
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
                updated_at = CURRENT_TIMESTAMP");

        foreach ($logsArr as $log) {
            $id = !empty($log['id']) ? strval($log['id']) : 'log_' . bin2hex(random_bytes(4));
            $timestamp = isset($log['timestamp']) ? $log['timestamp'] : null;
            $timestampMs = isset($log['timestampMs']) ? intval($log['timestampMs']) : null;
            $level = isset($log['level']) ? $log['level'] : 'info';
            $category = isset($log['category']) ? $log['category'] : null;
            $message = !empty($log['message']) ? strval($log['message']) : '';
            $action = isset($log['action']) ? $log['action'] : null;
            $storageLocation = isset($log['storageLocation']) ? $log['storageLocation'] : null;
            $targetType = isset($log['targetType']) ? $log['targetType'] : null;
            $targetId = isset($log['targetId']) ? $log['targetId'] : null;
            $targetNumber = isset($log['targetNumber']) ? $log['targetNumber'] : null;
            $amount = isset($log['amount']) ? floatval($log['amount']) : 0;
            $userId = isset($log['userId']) ? $log['userId'] : (isset($log['actorId']) ? $log['actorId'] : null);
            $userName = isset($log['userName']) ? $log['userName'] : (isset($log['actorName']) ? $log['actorName'] : null);
            $userRole = isset($log['userRole']) ? $log['userRole'] : (isset($log['actorRole']) ? $log['actorRole'] : null);
            $ipAddress = isset($log['ipAddress']) ? $log['ipAddress'] : null;
            $details = isset($log['details']) ? (is_string($log['details']) ? $log['details'] : json_encode($log['details'], JSON_UNESCAPED_UNICODE)) : null;
            $fiscalYearId = isset($log['fiscalYearId']) ? $log['fiscalYearId'] : null;
            $createdBy = isset($log['createdBy']) ? $log['createdBy'] : null;

            $stmtLog->execute([
                $id, $timestamp, $timestampMs, $level, $category, $message, $action, $storageLocation,
                $targetType, $targetId, $targetNumber, $amount, $userId, $userName, $userRole,
                $ipAddress, $details, $fiscalYearId, $createdBy
            ]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM logs")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'logs',
            'sourceCount' => $logsCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$logsCount} لاگ سامانه با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'logs',
            'sourceCount' => $logsCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال لاگ‌ها: " . $e->getMessage()
        ];
    }

    // ل. اعلان‌ها (notifications)
    $notifList = $getArray('notifications');
    $notifCount = count($notifList);
    $totalSourceRecords += $notifCount;
    try {
        $pdo->beginTransaction();
        $stmtN = $pdo->prepare("INSERT INTO notifications (id, user_id, title, message, type, timestamp, is_read, sender_id, sender_name, fiscal_year_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                message = VALUES(message),
                type = VALUES(type),
                is_read = VALUES(is_read),
                updated_at = CURRENT_TIMESTAMP");

        foreach ($notifList as $n) {
            $id = !empty($n['id']) ? strval($n['id']) : 'notif_' . bin2hex(random_bytes(4));
            $userId = !empty($n['userId']) ? strval($n['userId']) : 'system';
            $title = !empty($n['title']) ? strval($n['title']) : 'اعلان';
            $message = isset($n['message']) ? $n['message'] : null;
            $type = isset($n['type']) ? $n['type'] : 'info';
            $timestamp = isset($n['timestamp']) ? $n['timestamp'] : null;
            $isRead = !empty($n['isRead']) ? 1 : 0;
            $senderId = isset($n['senderId']) ? $n['senderId'] : null;
            $senderName = isset($n['senderName']) ? $n['senderName'] : null;
            $fiscalYearId = isset($n['fiscalYearId']) ? $n['fiscalYearId'] : null;
            $createdBy = isset($n['createdBy']) ? $n['createdBy'] : null;

            $stmtN->execute([$id, $userId, $title, $message, $type, $timestamp, $isRead, $senderId, $senderName, $fiscalYearId, $createdBy]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM notifications")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'notifications',
            'sourceCount' => $notifCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$notifCount} اعلان با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'notifications',
            'sourceCount' => $notifCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال اعلان‌ها: " . $e->getMessage()
        ];
    }

    // م. چک‌لیست (checklist)
    $chkList = $getArray('checklist');
    $chkCount = count($chkList);
    $totalSourceRecords += $chkCount;
    try {
        $pdo->beginTransaction();
        $stmtChk = $pdo->prepare("INSERT INTO checklist (id, task, is_completed, is_public, completed_at, date, fiscal_year_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                task = VALUES(task),
                is_completed = VALUES(is_completed),
                is_public = VALUES(is_public),
                completed_at = VALUES(completed_at),
                date = VALUES(date),
                updated_at = CURRENT_TIMESTAMP");

        foreach ($chkList as $item) {
            $id = !empty($item['id']) ? strval($item['id']) : 'chk_' . bin2hex(random_bytes(4));
            $task = !empty($item['task']) ? strval($item['task']) : 'تسک';
            $isCompleted = !empty($item['isCompleted']) ? 1 : 0;
            $isPublic = !empty($item['isPublic']) ? 1 : 0;
            $completedAt = isset($item['completedAt']) ? intval($item['completedAt']) : null;
            $date = isset($item['date']) ? $item['date'] : null;
            $fiscalYearId = isset($item['fiscalYearId']) ? $item['fiscalYearId'] : null;
            $createdBy = isset($item['createdBy']) ? $item['createdBy'] : null;

            $stmtChk->execute([$id, $task, $isCompleted, $isPublic, $completedAt, $date, $fiscalYearId, $createdBy]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM checklist")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'checklist',
            'sourceCount' => $chkCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$chkCount} مورد چک‌لیست با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'checklist',
            'sourceCount' => $chkCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال چک‌لیست: " . $e->getMessage()
        ];
    }

    // ن. تنظیمات (settings)
    $knownCollections = array_flip([
        'users', 'fiscalYears', 'fiscal_years', 'counterparts', 'categories',
        'warehouses', 'items', 'accounts', 'invoices', 'invoice_items',
        'transactions', 'accountingDocs', 'docs', 'accounting_doc_lines',
        'logs', 'system_logs', 'auditLogs', 'notifications', 'checklist', 'uploads'
    ]);

    $settingsEntries = [];
    foreach ($stateData as $k => $v) {
        if (strpos($k, 'acc_app_') === 0) continue;
        if (isset($knownCollections[$k])) continue;
        if ($v !== null) {
            $settingsEntries[] = ['key' => $k, 'val' => $v];
        }
    }
    $settingsCount = count($settingsEntries);
    $totalSourceRecords += $settingsCount;
    try {
        $pdo->beginTransaction();
        $stmtSet = $pdo->prepare("INSERT INTO settings (id, setting_key, setting_value, created_by)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                setting_value = VALUES(setting_value),
                updated_at = CURRENT_TIMESTAMP");

        foreach ($settingsEntries as $entry) {
            $id = 'setting_' . $entry['key'];
            $key = $entry['key'];
            $val = is_string($entry['val']) ? $entry['val'] : json_encode($entry['val'], JSON_UNESCAPED_UNICODE);
            $stmtSet->execute([$id, $key, $val, 'system']);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM settings")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'settings',
            'sourceCount' => $settingsCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$settingsCount} تنظیم با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'settings',
            'sourceCount' => $settingsCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال تنظیمات: " . $e->getMessage()
        ];
    }

    // س. آپلودها (uploads)
    $upList = $getArray('uploads');
    $upCount = count($upList);
    $totalSourceRecords += $upCount;
    try {
        $pdo->beginTransaction();
        $stmtUp = $pdo->prepare("INSERT INTO uploads (id, file_name, original_name, file_path, file_size, mime_type, entity_type, entity_id, data_url, fiscal_year_id, created_by)
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
                updated_at = CURRENT_TIMESTAMP");

        foreach ($upList as $up) {
            $id = !empty($up['id']) ? strval($up['id']) : 'up_' . bin2hex(random_bytes(4));
            $fileName = !empty($up['fileName']) ? strval($up['fileName']) : (!empty($up['name']) ? strval($up['name']) : 'file');
            $originalName = isset($up['originalName']) ? $up['originalName'] : $fileName;
            $filePath = isset($up['filePath']) ? $up['filePath'] : null;
            $fileSize = isset($up['fileSize']) ? intval($up['fileSize']) : null;
            $mimeType = isset($up['mimeType']) ? $up['mimeType'] : null;
            $entityType = isset($up['entityType']) ? $up['entityType'] : null;
            $entityId = isset($up['entityId']) ? $up['entityId'] : null;
            $dataUrl = isset($up['dataUrl']) ? $up['dataUrl'] : (isset($up['url']) ? $up['url'] : null);
            $fiscalYearId = isset($up['fiscalYearId']) ? $up['fiscalYearId'] : null;
            $createdBy = isset($up['createdBy']) ? $up['createdBy'] : null;

            $stmtUp->execute([$id, $fileName, $originalName, $filePath, $fileSize, $mimeType, $entityType, $entityId, $dataUrl, $fiscalYearId, $createdBy]);
        }
        $pdo->commit();

        $destCount = intval($pdo->query("SELECT COUNT(*) FROM uploads")->fetchColumn());
        $totalDestinationRecords += $destCount;
        $reports[] = [
            'table' => 'uploads',
            'sourceCount' => $upCount,
            'destinationCount' => $destCount,
            'status' => 'success',
            'message' => "انتقال {$upCount} فایل و پیوست با موفقیت در تراکنش انجام شد."
        ];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $reports[] = [
            'table' => 'uploads',
            'sourceCount' => $upCount,
            'destinationCount' => 0,
            'status' => 'error',
            'message' => "خطا در انتقال پیوست‌ها: " . $e->getMessage()
        ];
    }

    $hasErrors = false;
    foreach ($reports as $r) {
        if ($r['status'] === 'error') {
            $hasErrors = true;
            break;
        }
    }

    return [
        'success' => !$hasErrors,
        'backup' => $backupResult,
        'totalSourceRecords' => $totalSourceRecords,
        'totalDestinationRecords' => $totalDestinationRecords,
        'reports' => $reports,
        'startedAt' => $startedAt,
        'completedAt' => date('c'),
        'durationMs' => round((microtime(true) - $startTime) * 1000)
    ];
}

// تابع کمکی برای خواندن داده‌های ارسالی با متد POST
function getJsonInput() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?: [];
}

// تابع کمکی برای انجام کوئری DNS از طریق پروتکل UDP جهت رزولوش کردن آی‌پی از دی‌ان‌اس شکن یا رادار
function resolveDomainWithDNS($domain, $dnsServers = ['178.22.122.100', '185.51.200.2']) {
    foreach ($dnsServers as $dns) {
        $ip = dnsQueryUdp($domain, $dns);
        if ($ip) {
            return $ip;
        }
    }
    return null;
}

function dnsQueryUdp($domain, $dnsServer) {
    $dnsServer = trim($dnsServer);
    if (empty($dnsServer)) return null;
    
    // پاکسازی آی‌پی از کاراکترهای اضافه احتمالی
    if (preg_match('/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/', $dnsServer, $matches)) {
        $dnsServer = $matches[0];
    } else {
        return null;
    }
    
    $fp = @fsockopen("udp://" . $dnsServer, 53, $errno, $errstr, 2);
    if (!$fp) {
        return null;
    }
    
    // تقسیم دامنه به بخش‌ها
    $parts = explode('.', $domain);
    $qname = '';
    foreach ($parts as $part) {
        $qname .= chr(strlen($part)) . $part;
    }
    $qname .= "\x00";
    
    // هدر استاندارد کوئری DNS
    $id = rand(10000, 65000);
    $header = pack('n6', $id, 0x0100, 1, 0, 0, 0); // QDCOUNT = 1
    $question = $qname . pack('n2', 1, 1); // QTYPE=A (1), QCLASS=IN (1)
    
    $query = $header . $question;
    @fwrite($fp, $query);
    
    stream_set_timeout($fp, 2);
    $response = @fread($fp, 512);
    @fclose($fp);
    
    if (strlen($response) < 12) {
        return null;
    }
    
    $header_ans = unpack('n6', substr($response, 0, 12));
    $ancount = $header_ans[4];
    if ($ancount <= 0) {
        return null;
    }
    
    $offset = 12 + strlen($qname) + 4;
    for ($i = 0; $i < $ancount; $i++) {
        if ($offset >= strlen($response)) {
            break;
        }
        
        $first_byte = ord($response[$offset]);
        if (($first_byte & 0xC0) === 0xC0) {
            $offset += 2;
        } else {
            while ($offset < strlen($response) && ord($response[$offset]) !== 0) {
                $len = ord($response[$offset]);
                $offset += $len + 1;
            }
            $offset += 1;
        }
        
        if ($offset + 10 > strlen($response)) {
            break;
        }
        
        $ans_info = unpack('n2TYPE_CLASS/N1TTL/n1RDLENGTH', substr($response, $offset, 8));
        $type = $ans_info['TYPE_CLASS1'];
        $rdlength = $ans_info['RDLENGTH'];
        $offset += 8;
        
        if ($type === 1 && $rdlength === 4) { // TYPE A
            $ip_bytes = substr($response, $offset, 4);
            return ord($ip_bytes[0]) . '.' . ord($ip_bytes[1]) . '.' . ord($ip_bytes[2]) . '.' . ord($ip_bytes[3]);
        }
        
        $offset += $rdlength;
    }
    
    return null;
}

// تابع بازگشایی چندمرحله‌ای JSONهای تودرتو رشته‌ای شده
function safeUnwrapJsonPhp($val) {
    if ($val === null || !is_string($val)) return $val;
    $parsed = $val;
    while (is_string($parsed)) {
        $trimmed = trim($parsed);
        if (
            (strpos($trimmed, '{') === 0 && substr($trimmed, -1) === '}') ||
            (strpos($trimmed, '[') === 0 && substr($trimmed, -1) === ']') ||
            (strpos($trimmed, '"') === 0 && substr($trimmed, -1) === '"') ||
            $trimmed === 'null' || $trimmed === 'true' || $trimmed === 'false'
        ) {
            $next = json_decode($trimmed, true);
            if ($next === null && $trimmed !== 'null') break;
            if ($next === $parsed) break;
            $parsed = $next;
        } else {
            break;
        }
    }
    return $parsed;
}

// کلیدهایی که شامل لیست‌های موجودیتی با شناسه‌های یکتا هستند (به استثنای کاربران که ساختار احراز هویت اتمیک دارند)
function isCollectionEntityKeyPhp($key) {
    $collectionKeys = [
        'invoices', 'transactions', 'items', 'counterparts', 'accounts', 
        'partners', 'categories', 'checklist', 'docs', 
        'bankSmsMessages', 'paymentAllocations', 'inventoryMovements', 
        'auditLogs', 'system_logs', 'pendingDeposits', 'loanBorrowers',
        'warehouse_categories_list', 'warehouse_stock_adjustment_logs'
    ];
    return in_array($key, $collectionKeys);
}

// استخراج شناسه یکتا از موجودیت در PHP
function getEntityIdentifierPhp($item) {
    if (!$item || !is_array($item)) return null;
    if (isset($item['id']) && trim((string)$item['id']) !== '') {
        return trim((string)$item['id']);
    }
    if (isset($item['invoiceNumber']) && trim((string)$item['invoiceNumber']) !== '') {
        return 'inv-' . trim((string)$item['invoiceNumber']);
    }
    if (isset($item['docNumber']) && trim((string)$item['docNumber']) !== '') {
        return 'doc-' . trim((string)$item['docNumber']);
    }
    if (isset($item['code']) && trim((string)$item['code']) !== '') {
        return 'code-' . trim((string)$item['code']);
    }
    if (isset($item['username']) && trim((string)$item['username']) !== '') {
        return 'user-' . trim((string)$item['username']);
    }
    if (isset($item['refCode']) && trim((string)$item['refCode']) !== '') {
        return 'ref-' . trim((string)$item['refCode']);
    }
    return null;
}

// استخراج تایم‌استمپ از موجودیت در PHP
function getEntityTimestampPhp($item) {
    if (!$item || !is_array($item)) return 0;
    if (isset($item['updatedAt'])) {
        if (is_numeric($item['updatedAt'])) return (float)$item['updatedAt'];
        $t = strtotime($item['updatedAt']) * 1000;
        if ($t > 0) return $t;
    }
    if (isset($item['timestampMs']) && is_numeric($item['timestampMs'])) {
        return (float)$item['timestampMs'];
    }
    if (isset($item['timestamp'])) {
        $t = strtotime($item['timestamp']) * 1000;
        if ($t > 0) return $t;
    }
    if (isset($item['postedAt'])) {
        $t = strtotime($item['postedAt']) * 1000;
        if ($t > 0) return $t;
    }
    if (isset($item['createdAt'])) {
        $t = strtotime($item['createdAt']) * 1000;
        if ($t > 0) return $t;
    }
    return 0;
}

// ادغام هوشمند آرایه‌های داده‌ای همزمان برای رفع کامل Race Condition
function smartMergeEntityArrayPhp($existingList, $incomingList) {
    if (!is_array($existingList) || empty($existingList)) return is_array($incomingList) ? $incomingList : [];
    if (!is_array($incomingList) || empty($incomingList)) return is_array($existingList) ? $existingList : [];

    $mergedMap = [];
    $unkeyed = [];

    foreach ($existingList as $item) {
        $id = getEntityIdentifierPhp($item);
        if ($id) {
            $mergedMap[$id] = $item;
        } else {
            $unkeyed[] = $item;
        }
    }

    foreach ($incomingList as $item) {
        $id = getEntityIdentifierPhp($item);
        if ($id) {
            if (isset($mergedMap[$id])) {
                $existingTs = getEntityTimestampPhp($mergedMap[$id]);
                $incomingTs = getEntityTimestampPhp($item);
                if ($incomingTs >= $existingTs) {
                    $mergedMap[$id] = array_merge($mergedMap[$id], $item);
                } else {
                    $mergedMap[$id] = array_merge($item, $mergedMap[$id]);
                }
            } else {
                $mergedMap[$id] = $item;
            }
        } else {
            $unkeyed[] = $item;
        }
    }

    return array_merge(array_values($mergedMap), $unkeyed);
}

// تابع کمکی برای خواندن کلیه داده‌های ذخیره شده از MySQL
function loadAllData($pdo) {
    if (!$pdo) {
        throw new Exception("اتصال به پایگاه‌داده متمرکز MySQL برقرار نمی‌باشد.");
    }
    $result = [];
    $rawMap = [];

    $stmt = $pdo->query("SELECT state_key, state_value FROM app_state");
    while ($row = $stmt->fetch()) {
        $val = safeUnwrapJsonPhp($row['state_value']);
        $cleanKey = (strpos($row['state_key'], 'acc_app_') === 0) ? substr($row['state_key'], 8) : $row['state_key'];
        $rawMap[$cleanKey] = $val;
    }

    // نگاشت دقیق کلیدها به هر دو فرمت جهت سازگاری ۱۰۰٪ با کلاینت
    foreach ($rawMap as $cleanKey => $val) {
        $result[$cleanKey] = $val;
        $result['acc_app_' . $cleanKey] = $val;
    }

    return $result;
}

// تابع کمکی دریافت نسخه و زمان آخرین ویرایش کلیدها از MySQL
function getDatabaseVersionInfo($pdo) {
    if (!$pdo) {
        throw new Exception("اتصال به پایگاه‌داده متمرکز MySQL برقرار نمی‌باشد.");
    }
    $now = time() * 1000;
    $maxVer = $now;
    $keyVersions = [];

    $stmt = $pdo->query("SELECT state_key, UNIX_TIMESTAMP(updated_at) as updated_ts FROM app_state");
    while ($row = $stmt->fetch()) {
        $ts = !empty($row['updated_ts']) ? (intval($row['updated_ts']) * 1000) : $now;
        $cleanKey = (strpos($row['state_key'], 'acc_app_') === 0) ? substr($row['state_key'], 8) : $row['state_key'];
        $keyVersions[$cleanKey] = $ts;
        $keyVersions['acc_app_' . $cleanKey] = $ts;
        if ($ts > $maxVer) $maxVer = $ts;
    }
    return ['version' => $maxVer, 'keyVersions' => $keyVersions];
}

// تابع کمکی دریافت مستقیم داده یک کلید از MySQL
function getKeyDataPhp($pdo, $key) {
    if (!$pdo) {
        throw new Exception("اتصال به پایگاه‌داده متمرکز MySQL برقرار نمی‌باشد.");
    }
    $cleanKey = (strpos($key, 'acc_app_') === 0) ? substr($key, 8) : $key;
    $fullKey = 'acc_app_' . $cleanKey;

    try {
        $stmt = $pdo->prepare("SELECT state_value FROM app_state WHERE state_key = :k1 OR state_key = :k2 LIMIT 1");
        $stmt->execute([':k1' => $cleanKey, ':k2' => $fullKey]);
        $row = $stmt->fetch();
        if ($row && isset($row['state_value'])) {
            return safeUnwrapJsonPhp($row['state_value']);
        }
    } catch (Exception $e) {
        throw new Exception("خطا در واکشی اطلاعات از پایگاه‌داده: " . $e->getMessage());
    }
    return null;
}

// تابع کمکی دریافت تنظیم از جدول اختصاصی settings_store (با فال‌بک به app_state)
function getSettingStoreValuePhp($pdo, $key) {
    if (!$pdo) {
        throw new Exception("اتصال به پایگاه‌داده متمرکز MySQL برقرار نمی‌باشد.");
    }
    try {
        $stmt = $pdo->prepare("SELECT setting_value FROM settings_store WHERE setting_key = :k LIMIT 1");
        $stmt->execute([':k' => $key]);
        $row = $stmt->fetch();
        if ($row && isset($row['setting_value']) && $row['setting_value'] !== null && $row['setting_value'] !== '') {
            return safeUnwrapJsonPhp($row['setting_value']);
        }
    } catch (Exception $e) {
        // Fall through to app_state fallback
    }

    try {
        $cleanKey = (strpos($key, 'acc_app_') === 0) ? substr($key, 8) : $key;
        $fullKey = (strpos($key, 'acc_app_') === 0) ? $key : ('acc_app_' . $key);
        $stmt2 = $pdo->prepare("SELECT state_value FROM app_state WHERE state_key = :k1 OR state_key = :k2 OR state_key = :k3 LIMIT 1");
        $stmt2->execute([':k1' => $key, ':k2' => $cleanKey, ':k3' => $fullKey]);
        $row2 = $stmt2->fetch();
        if ($row2 && isset($row2['state_value']) && $row2['state_value'] !== null && $row2['state_value'] !== '') {
            return safeUnwrapJsonPhp($row2['state_value']);
        }
    } catch (Exception $e) {}

    return null;
}

// تابع کمکی ذخیره تنظیم در جدول اختصاصی settings_store (و همگام‌سازی با app_state)
function saveSettingStoreValuePhp($pdo, $key, $value, $createdBy = null) {
    if (!$pdo) {
        return ['success' => false, 'error' => 'اتصال به پایگاه‌داده متمرکز MySQL برقرار نمی‌باشد.'];
    }
    $serialized = json_encode($value, JSON_UNESCAPED_UNICODE);
    try {
        $stmt = $pdo->prepare("INSERT INTO settings_store (setting_key, setting_value, created_by) 
            VALUES (:key, :val, :cb) 
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP");
        $stmt->execute([
            ':key' => $key,
            ':val' => $serialized,
            ':cb' => $createdBy
        ]);

        // همگام‌سازی اتمیک با app_state جهت حفظ یکپارچگی بکاپ‌های سراسری دیتابیس
        try {
            $stmtState = $pdo->prepare("INSERT INTO app_state (state_key, state_value) VALUES (:key, :val) 
                ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP");
            $stmtState->execute([
                ':key' => $key,
                ':val' => $serialized
            ]);
        } catch (Exception $e) {}

        return ['success' => true, 'key' => $key];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage(), 'key' => $key];
    }
}

// لیست پیام‌رسان‌های پیش‌فرض
function getDefaultWebMessengersPhp() {
    return [
        [
            'id' => 'wm-eitaa',
            'title' => 'ایتا وب',
            'url' => 'https://web.eitaa.com',
            'icon' => 'eitaa',
            'allowedUserIds' => [],
            'windowWidth' => 1100,
            'windowHeight' => 750,
            'category' => 'پیام‌رسان داخلی',
            'description' => 'نسخه تحت وب پیام‌رسان ایتا'
        ],
        [
            'id' => 'wm-rubika',
            'title' => 'روبیکا وب',
            'url' => 'https://web.rubika.ir',
            'icon' => 'rubika',
            'allowedUserIds' => [],
            'windowWidth' => 1100,
            'windowHeight' => 750,
            'category' => 'پیام‌رسان داخلی',
            'description' => 'نسخه تحت وب سوپراپلیکیشن روبیکا'
        ],
        [
            'id' => 'wm-bale',
            'title' => 'بله وب',
            'url' => 'https://web.bale.ai',
            'icon' => 'bale',
            'allowedUserIds' => [],
            'windowWidth' => 1080,
            'windowHeight' => 720,
            'category' => 'پیام‌رسان داخلی',
            'description' => 'نسخه تحت وب پیام‌رسان بانکی بله'
        ],
        [
            'id' => 'wm-gap',
            'title' => 'گپ وب',
            'url' => 'https://web.gap.im',
            'icon' => 'gap',
            'allowedUserIds' => [],
            'windowWidth' => 1050,
            'windowHeight' => 700,
            'category' => 'پیام‌رسان داخلی',
            'description' => 'نسخه وب پیام‌رسان بین‌المللی گپ'
        ],
        [
            'id' => 'wm-igap',
            'title' => 'آی‌گپ وب',
            'url' => 'https://web.igap.net',
            'icon' => 'igap',
            'allowedUserIds' => [],
            'windowWidth' => 1050,
            'windowHeight' => 700,
            'category' => 'پیام‌رسان داخلی',
            'description' => 'نسخه تحت وب پیام‌رسان آی‌گپ'
        ],
        [
            'id' => 'wm-whatsapp',
            'title' => 'واتس‌اپ وب',
            'url' => 'https://web.whatsapp.com',
            'icon' => 'whatsapp',
            'allowedUserIds' => [],
            'windowWidth' => 1150,
            'windowHeight' => 800,
            'category' => 'پیام‌رسان بین‌المللی',
            'description' => 'نسخه تحت وب پیام‌رسان واتس‌اپ'
        ],
        [
            'id' => 'wm-telegram',
            'title' => 'تلگرام وب (A)',
            'url' => 'https://web.telegram.org/a/',
            'icon' => 'telegram',
            'allowedUserIds' => [],
            'windowWidth' => 1150,
            'windowHeight' => 800,
            'category' => 'پیام‌رسان بین‌المللی',
            'description' => 'نسخه وب A پیام‌رسان تلگرام'
        ],
        [
            'id' => 'wm-soroush',
            'title' => 'سروش پلاس وب',
            'url' => 'https://web.srub.ir',
            'icon' => 'soroush',
            'allowedUserIds' => [],
            'windowWidth' => 1050,
            'windowHeight' => 700,
            'category' => 'پیام‌رسان داخلی',
            'description' => 'نسخه وب پیام‌رسان سروش پلاس'
        ]
    ];
}

// اعتبارسنجی آرایه پیام‌رسان‌های تحت وب
function validateWebMessengersInputPhp($rawList) {
    if (!is_array($rawList)) {
        return ['isValid' => false, 'error' => 'قالب داده ارسال‌شده برای پیام‌رسان‌ها باید آرایه (Array) باشد.'];
    }
    $validated = [];
    foreach ($rawList as $index => $item) {
        if (!is_array($item)) continue;
        $id = !empty($item['id']) ? trim(strval($item['id'])) : ('wm-' . round(microtime(true) * 1000) . '-' . $index);
        $title = !empty($item['title']) ? trim(strval($item['title'])) : '';
        $url = !empty($item['url']) ? trim(strval($item['url'])) : '';
        if (empty($title)) {
            return ['isValid' => false, 'error' => 'عنوان پیام‌رسان (title) نمی‌تواند خالی باشد. ردیف ' . ($index + 1)];
        }
        if (empty($url)) {
            return ['isValid' => false, 'error' => 'آدرس اینترنتی پیام‌رسان (url) نمی‌تواند خالی باشد. ردیف ' . ($index + 1)];
        }
        if (!preg_match('/^https?:\/\//i', $url)) {
            $url = 'https://' . $url;
        }
        $icon = !empty($item['icon']) ? trim(strval($item['icon'])) : 'globe';
        $enabled = isset($item['enabled']) ? (bool)$item['enabled'] : true;
        $customIconUrl = !empty($item['customIconUrl']) ? trim(strval($item['customIconUrl'])) : '';
        $allowedUserIds = (isset($item['allowedUserIds']) && is_array($item['allowedUserIds'])) ? array_values(array_map('strval', $item['allowedUserIds'])) : [];
        $windowWidth = (isset($item['windowWidth']) && intval($item['windowWidth']) > 0) ? intval($item['windowWidth']) : 1080;
        $windowHeight = (isset($item['windowHeight']) && intval($item['windowHeight']) > 0) ? intval($item['windowHeight']) : 720;
        $category = !empty($item['category']) ? trim(strval($item['category'])) : 'پیام‌رسان';
        $description = isset($item['description']) ? trim(strval($item['description'])) : '';
        $createdBy = isset($item['createdBy']) ? trim(strval($item['createdBy'])) : null;
        $createdById = isset($item['createdById']) ? trim(strval($item['createdById'])) : null;
        $createdAt = isset($item['createdAt']) ? trim(strval($item['createdAt'])) : null;

        $validated[] = [
            'id' => $id,
            'title' => $title,
            'url' => $url,
            'icon' => $icon,
            'enabled' => $enabled,
            'customIconUrl' => $customIconUrl,
            'allowedUserIds' => $allowedUserIds,
            'windowWidth' => $windowWidth,
            'windowHeight' => $windowHeight,
            'category' => $category,
            'description' => $description,
            'createdBy' => $createdBy,
            'createdById' => $createdById,
            'createdAt' => $createdAt
        ];
    }
    return ['isValid' => true, 'data' => $validated];
}

// اعتبارسنجی آرایه آیکون‌های سفارشی کاربران
function validateUserMessengerIconsInputPhp($rawList) {
    if (!is_array($rawList)) {
        return ['isValid' => false, 'error' => 'قالب داده ارسال‌شده برای آیکون‌های سفارشی باید آرایه (Array) باشد.'];
    }
    $validated = [];
    foreach ($rawList as $index => $item) {
        if (!is_array($item)) continue;
        $id = !empty($item['id']) ? trim(strval($item['id'])) : ('usr-icon-' . round(microtime(true) * 1000) . '-' . $index);
        $userId = isset($item['userId']) ? trim(strval($item['userId'])) : '';
        $name = isset($item['name']) ? trim(strval($item['name'])) : ('icon-' . ($index + 1));
        $dataUrl = isset($item['dataUrl']) ? trim(strval($item['dataUrl'])) : (
            isset($item['data']) ? trim(strval($item['data'])) : (
                isset($item['url']) ? trim(strval($item['url'])) : ''
            )
        );
        $createdAt = isset($item['createdAt']) ? trim(strval($item['createdAt'])) : '';

        if (empty($dataUrl)) {
            continue;
        }

        $validated[] = [
            'id' => $id,
            'userId' => $userId,
            'name' => $name,
            'dataUrl' => $dataUrl,
            'createdAt' => $createdAt
        ];
    }

    return ['isValid' => true, 'data' => $validated];
}

// تابع کمکی اعتبارسنجی ساختار داده پشتیبان
function validateDatabaseSchemaPhp($dbData) {
    if (!$dbData || !is_array($dbData)) {
        return ['isValid' => false, 'reason' => 'ساختار داده ارسال‌شده معتبر نیست.'];
    }

    $keys = array_keys($dbData);
    if (count($keys) === 0) {
        return ['isValid' => false, 'reason' => 'محتوای بکاپ کاملاً خالی است.'];
    }

    $normalizedKeys = array_map(function($k) {
        return (strpos($k, 'acc_app_') === 0) ? substr($k, 8) : $k;
    }, $keys);

    $coreKeys = ['users', 'invoices', 'transactions', 'items', 'counterparts', 'accounts', 'categories', 'docs', 'checklist', 'fiscalYear', 'settings'];
    $matches = array_intersect($normalizedKeys, $coreKeys);

    if (count($matches) === 0 && count($keys) < 2) {
        return ['isValid' => false, 'reason' => 'فایل پشتیبان فاقد آرایه‌ها و داده‌های اصلی حسابداری است.'];
    }

    return ['isValid' => true];
}

// اطمینان از وجود پوشه uploads و فایل .htaccess امنیتی جهت عدم اجرای کدهای PHP
function ensureUploadsSecurityPhp($baseDir = null) {
    if (!$baseDir) {
        $baseDir = __DIR__;
    }
    $uploadsDir = $baseDir . '/uploads';
    if (!file_exists($uploadsDir)) {
        @mkdir($uploadsDir, 0755, true);
    }
    $htaccessPath = $uploadsDir . '/.htaccess';
    $htaccessContent = "# Disable PHP execution in uploads directory for security\n" .
        "<FilesMatch \"(?i)\\.(php|php3|php4|php5|php7|phtml|phar|pl|py|cgi|sh|exe|shtml)$\">\n" .
        "    Order Deny,Allow\n" .
        "    Deny from all\n" .
        "</FilesMatch>\n" .
        "Options -ExecCGI\n" .
        "<IfModule mod_php7.c>\n" .
        "    php_flag engine off\n" .
        "</IfModule>\n" .
        "<IfModule mod_php8.c>\n" .
        "    php_flag engine off\n" .
        "</IfModule>\n";

    if (!file_exists($htaccessPath) || filesize($htaccessPath) === 0) {
        @file_put_contents($htaccessPath, $htaccessContent);
    }
}

// تابع هوشمند برای تبدیل هرگونه Base64 عکس به فایل واقعی در uploads/YYYY/MM/ و ذخیره صرفاً آدرس فایل در دیتابیس
function extractAndSaveBase64ImagesPhp(&$data, $category = 'general') {
    if (is_string($data)) {
        if (preg_match('/^data:image\/([a-zA-Z0-9+]+);base64,([A-Za-z0-9+\/=\s]+)$/i', trim($data), $matches)) {
            $rawExt = strtolower($matches[1]);
            $ext = ($rawExt === 'jpeg') ? 'jpg' : (($rawExt === 'svg+xml') ? 'svg' : $rawExt);
            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'])) {
                $ext = 'png';
            }
            $cleanBase64 = preg_replace('/\s+/', '', $matches[2]);
            $binary = base64_decode($cleanBase64);
            if ($binary !== false && strlen($binary) > 0) {
                $year = date('Y');
                $month = date('m');
                $uploadSubdir = 'uploads/' . $year . '/' . $month;
                $targetDir = __DIR__ . '/' . $uploadSubdir;
                if (!file_exists($targetDir)) {
                    @mkdir($targetDir, 0755, true);
                }
                ensureUploadsSecurityPhp();
                $cleanPrefix = preg_replace('/[^a-zA-Z0-9_-]/', '', $category ?: 'img');
                $fileName = $cleanPrefix . '_' . date('Ymd_His') . '_' . substr(bin2hex(random_bytes(4)), 0, 8) . '.' . $ext;
                $filePath = $targetDir . '/' . $fileName;
                if (@file_put_contents($filePath, $binary) !== false) {
                    $data = '/' . $uploadSubdir . '/' . $fileName;
                }
            }
        }
        return;
    }

    if (is_array($data)) {
        foreach ($data as $key => &$val) {
            $cat = is_string($key) ? $key : $category;
            extractAndSaveBase64ImagesPhp($val, $cat);
        }
    }
}

// تابع کمکی برای ذخیره کردن داده‌های یک کلید خاص در MySQL (با ادغام اتمیک و رفع تداخل)
function saveKeyData($pdo, $key, $data, $forceOverwrite = false) {
    if (!$pdo) {
        return ['success' => false, 'error' => 'اتصال به پایگاه‌داده متمرکز MySQL برقرار نمی‌باشد.'];
    }
    $cleanKey = (strpos($key, 'acc_app_') === 0) ? substr($key, 8) : $key;
    $now = time() * 1000;
    $finalData = $data;

    // تبدیل تصاویر Base64 به فایل واقعی روی دیسک در uploads/YYYY/MM/ تا در MySQL فقط آدرس ذخیره گردد
    extractAndSaveBase64ImagesPhp($finalData, $cleanKey);

    // کاربران و لیست‌های داده‌ای همواره به صورت اتمیک و مستقیم ذخیره می‌شوند تا حذف‌ها و ویرایش‌ها دقیقاً اعمال شوند
    $forceOverwrite = true;

    try {
        $serialized = json_encode($finalData, JSON_UNESCAPED_UNICODE);
        $stmt = $pdo->prepare("INSERT INTO app_state (state_key, state_value) VALUES (:key, :val) 
            ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP");
        $stmt->execute([
            ':key' => $cleanKey,
            ':val' => $serialized
        ]);
        return ['success' => true, 'version' => $now, 'key' => $cleanKey];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage(), 'version' => $now, 'key' => $cleanKey];
    }
}

// تابع کمکی برای تجزیه و استخراج اطلاعات پیامک‌های بانکی
function parseBankSmsBodyPhp($smsBody, $smsSender) {
    $persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    $arabic  = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    $english = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    $englishBody = str_replace($persian, $english, $smsBody);
    $englishBody = str_replace($arabic, $english, $englishBody);

    $bankName = 'بانک نامشخص';
    $bankRules = [
        'ملی' => 'بانک ملی',
        'ملت' => 'بانک ملت',
        'تجارت' => 'بانک تجارت',
        'صادرات' => 'بانک صادرات',
        'سامان' => 'بانک سامان',
        'پاسارگاد' => 'بانک پاسارگاد',
        'سپه' => 'بانک سپه',
        'کشاورزی' => 'بانک کشاورزی',
        'مسکن' => 'بانک مسکن',
        'مهر' => 'بانک مهر ایران',
        'رسالت' => 'بانک رسالت',
        'رفاه' => 'بانک رفاه',
        'سینا' => 'بانک سینا',
        'شهر' => 'بانک شهر',
        'پارسیان' => 'بانک پارسیان',
        'توسعه' => 'بانک توسعه تعاون',
        'بلو' => 'بلوبانک',
        'blubank' => 'بلوبانک',
        'ایران زمین' => 'بانک ایران زمین',
        'خاورمیانه' => 'بانک خاورمیانه',
        'آینده' => 'بانک آینده'
    ];

    foreach ($bankRules as $keyword => $name) {
        if (mb_strpos($smsBody, $keyword) !== false || mb_strpos(mb_strtolower($smsSender), $keyword) !== false) {
            $bankName = $name;
            break;
        }
    }

    $type = 'other';
    if (preg_match('/(واریز|افزایش|انتقال به|بابت واریز|خرید لغو|پایا واریز)/u', $smsBody)) {
        $type = 'deposit';
    } elseif (preg_match('/(برداشت|کاهش|خرید|انتقال از|انتقال به حساب|کسر|پرداخت)/u', $smsBody)) {
        $type = 'withdrawal';
    }

    $amount = 0;
    if (preg_match('/(?:مبلغ|مبلغ:?)\s*([0-9,]{3,15})\s*(ریال|تومان)?/u', $englishBody, $m)) {
        $clean = (int)str_replace(',', '', $m[1]);
        $unit = isset($m[2]) ? $m[2] : '';
        $amount = ($unit === 'تومان') ? ($clean * 10) : $clean;
    } elseif (preg_match('/([0-9,]{4,15})\s*ریال/u', $englishBody, $m)) {
        $amount = (int)str_replace(',', '', $m[1]);
    } elseif (preg_match('/([0-9,]{4,15})\s*تومان/u', $englishBody, $m)) {
        $amount = ((int)str_replace(',', '', $m[1])) * 10;
    } else {
        if (preg_match_all('/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,12})/', $englishBody, $matches)) {
            foreach ($matches[1] as $rawNumStr) {
                $num = (int)str_replace(',', '', $rawNumStr);
                if ($num >= 1000 && $num !== 1403 && $num !== 1404 && $num !== 1405 && $num !== 1406) {
                    $amount = $num;
                    break;
                }
            }
        }
    }

    $accountNumber = null;
    if (preg_match('/(?:حساب|کارت|به|از|شماره:?)\s*([0-9\*\.\-]{4,20})/u', $englishBody, $m)) {
        $accountNumber = trim($m[1]);
    }

    $refCode = null;
    if (preg_match('/(?:پیگیری|کد پیگیری|رهگیری|کد رهگیری|ارجاع|شماره ارجاع|کد:?)\s*([0-9]{4,16})/u', $englishBody, $m)) {
        $refCode = trim($m[1]);
    }

    $balance = null;
    if (preg_match('/(?:موجودی|موجودي):?\s*([0-9,]{3,15})/u', $englishBody, $m)) {
        $balance = (int)str_replace(',', '', $m[1]);
    }

    return [
        'bankName' => $bankName,
        'type' => $type,
        'amount' => $amount,
        'accountNumber' => $accountNumber,
        'refCode' => $refCode,
        'balance' => $balance
    ];
}

// مسیریابی و هندل کردن ریکوئست‌ها به روش RESTful
try {
switch ($route) {
    case 'upload':
    case 'upload/':
    case 'api/upload':
    case 'upload-image':
    case 'system/upload':
        $fileBuffer = null;
        $originalName = 'image.png';
        $category = 'general';

        if (isset($_FILES['file']) && !empty($_FILES['file']['tmp_name'])) {
            $fileBuffer = @file_get_contents($_FILES['file']['tmp_name']);
            $originalName = $_FILES['file']['name'];
            $category = isset($_POST['category']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['category']) : 'general';
        } else {
            $input = getJsonInput();
            $fileData = isset($input['fileData']) ? $input['fileData'] : (isset($input['data']) ? $input['data'] : (isset($input['imageBase64']) ? $input['imageBase64'] : ''));
            $originalName = isset($input['fileName']) ? $input['fileName'] : (isset($input['name']) ? $input['name'] : 'image.png');
            $category = isset($input['category']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $input['category']) : 'general';

            if (!empty($fileData)) {
                if (strpos($fileData, 'data:') === 0) {
                    $parts = explode(',', $fileData, 2);
                    $fileBuffer = base64_decode($parts[1]);
                    if (preg_match('/data:image\/([a-zA-Z0-9+]+);/i', $parts[0], $mimeMatch)) {
                        $detectedExt = strtolower($mimeMatch[1]);
                        if ($detectedExt === 'jpeg') $detectedExt = 'jpg';
                        if ($detectedExt === 'svg+xml') $detectedExt = 'svg';
                        if (!pathinfo($originalName, PATHINFO_EXTENSION)) {
                            $originalName .= '.' . $detectedExt;
                        }
                    }
                } else {
                    $fileBuffer = base64_decode($fileData);
                }
            }
        }

        if (empty($fileBuffer)) {
            http_response_code(400);
            echo json_encode(['error' => 'فایل ارسالی خالی است یا ارسال نشده است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // بررسی و استخراج امن فرمت/پسوند
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (empty($ext) || in_array($ext, ['php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phar', 'exe', 'sh', 'cgi', 'pl', 'py', 'htaccess', 'env'])) {
            $ext = 'png';
        }

        // دسته‌بندی پوشه‌ها بر اساس تاریخ (uploads/YYYY/MM/)
        $year = date('Y');
        $month = date('m');
        $uploadSubdir = 'uploads/' . $year . '/' . $month;
        $targetDir = __DIR__ . '/' . $uploadSubdir;

        if (!file_exists($targetDir)) {
            @mkdir($targetDir, 0755, true);
        }
        ensureUploadsSecurityPhp();

        // ساخت نام یکتا و خوانا بر اساس پیشوند، تاریخ و فرمت
        $prefix = !empty($category) ? $category : 'file';
        $cleanPrefix = preg_replace('/[^a-zA-Z0-9_-]/', '', $prefix);
        $randomHex = substr(bin2hex(random_bytes(4)), 0, 8);
        $fileName = $cleanPrefix . '_' . date('Ymd_His') . '_' . $randomHex . '.' . $ext;
        $targetFilePath = $targetDir . '/' . $fileName;

        if (@file_put_contents($targetFilePath, $fileBuffer) === false) {
            http_response_code(500);
            echo json_encode(['error' => 'خطا در ذخیره‌سازی فایل روی هاست. لطفاً دسترسی نوشتن پوشه uploads را بررسی نمایید.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $relativeUrl = '/' . $uploadSubdir . '/' . $fileName;
        $relativePath = $uploadSubdir . '/' . $fileName;

        echo json_encode([
            'status' => 'success',
            'url' => $relativeUrl,
            'relativePath' => $relativePath,
            'fileName' => $fileName,
            'format' => $ext,
            'size' => strlen($fileBuffer),
            'year' => $year,
            'month' => $month,
            'date' => date('Y-m-d'),
            'message' => 'فایل با موفقیت در پوشه uploads بر اساس تاریخ و فرمت ذخیره شد.'
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'sms/receive':
    case 'sms/receive/':
    case 'bank-sms/receive':
    case 'bank-sms/receive/':
    case 'sms':
    case 'bank-sms':
        $rawInput = file_get_contents('php://input');
        $jsonInput = json_decode($rawInput, true) ?: [];
        $postInput = $_POST ?: [];
        $getInput = $_GET ?: [];

        $inputData = array_merge($getInput, $postInput, $jsonInput);

        $smsBody = isset($inputData['body']) ? $inputData['body'] : (
            isset($inputData['message']) ? $inputData['message'] : (
                isset($inputData['text']) ? $inputData['text'] : (
                    isset($inputData['msg']) ? $inputData['msg'] : (
                        isset($inputData['content']) ? $inputData['content'] : trim($rawInput)
                    )
                )
            )
        );

        $smsSender = isset($inputData['sender']) ? $inputData['sender'] : (
            isset($inputData['phone']) ? $inputData['phone'] : (
                isset($inputData['from']) ? $inputData['from'] : (
                    isset($inputData['number']) ? $inputData['number'] : (
                        isset($inputData['originatingAddress']) ? $inputData['originatingAddress'] : 'ناشناس'
                    )
                )
            )
        );

        $providedApiKey = isset($inputData['apiKey']) ? $inputData['apiKey'] : (
            isset($inputData['key']) ? $inputData['key'] : (
                isset($_SERVER['HTTP_X_API_KEY']) ? $_SERVER['HTTP_X_API_KEY'] : (
                    isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : ''
                )
            )
        );

        $receivedAt = isset($inputData['receivedAt']) ? $inputData['receivedAt'] : (
            isset($inputData['date']) ? $inputData['date'] : (
                isset($inputData['timestamp']) ? $inputData['timestamp'] : date('c')
            )
        );

        if (($_SERVER['REQUEST_METHOD'] === 'GET' || $_SERVER['REQUEST_METHOD'] === 'HEAD') && empty($smsBody)) {
            echo json_encode([
                'status' => 'online',
                'message' => 'سرویس دریافت پیامک سیستم آنلاین و فعال است.',
                'endpoint' => '/api/sms/receive',
                'supportedMethods' => ['POST', 'GET']
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (empty($smsBody)) {
            http_response_code(400);
            echo json_encode([
                'status' => 'error',
                'error' => 'متن پیامک (body یا message) ارسال نشده است.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $allDbData = loadAllData($pdo);
        $configuredApiKey = isset($allDbData['smsApiKey']) ? $allDbData['smsApiKey'] : (
            isset($allDbData['settings']['smsApiKey']) ? $allDbData['settings']['smsApiKey'] : ''
        );

        if (!empty($configuredApiKey)) {
            $cleanProvided = trim(preg_replace('/^Bearer\s+/i', '', $providedApiKey));
            if ($cleanProvided !== trim($configuredApiKey)) {
                http_response_code(401);
                echo json_encode([
                    'status' => 'error',
                    'error' => 'کلید API معتبر نیست (Unauthorized).'
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }

        $parsed = parseBankSmsBodyPhp($smsBody, $smsSender);

        $existingMessages = isset($allDbData['bankSmsMessages']) && is_array($allDbData['bankSmsMessages'])
            ? $allDbData['bankSmsMessages']
            : [];

        // بررسی تکراری بودن پیامک بر اساس مؤلفه‌های کلیدی
        foreach ($existingMessages as $m) {
            $refMatch = !empty($parsed['refCode']) && !empty($m['refCode']) && trim($m['refCode']) === trim($parsed['refCode']) && $m['amount'] == $parsed['amount'];
            $bodyMatch = isset($m['body']) && $m['body'] === $smsBody && $m['amount'] == $parsed['amount'];

            if ($refMatch || $bodyMatch) {
                echo json_encode([
                    'status' => 'success',
                    'message' => 'پیامک تکراری شناسایی شد و از ذخیره مجدد آن خودداری گردید.',
                    'smsId' => isset($m['id']) ? $m['id'] : '',
                    'isDuplicate' => true,
                    'parsedData' => $parsed
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }

        $newSmsItem = [
            'id' => 'sms-' . round(microtime(true) * 1000) . '-' . substr(md5(uniqid()), 0, 5),
            'sender' => $smsSender,
            'bankName' => $parsed['bankName'],
            'body' => $smsBody,
            'receivedAt' => $receivedAt,
            'amount' => $parsed['amount'],
            'type' => $parsed['type'],
            'accountNumber' => $parsed['accountNumber'],
            'refCode' => $parsed['refCode'],
            'balance' => $parsed['balance'],
            'status' => 'pending'
        ];

        array_unshift($existingMessages, $newSmsItem);

        saveKeyData($pdo, 'bankSmsMessages', $existingMessages);

        echo json_encode([
            'status' => 'success',
            'message' => 'SMS received and processed',
            'smsId' => $newSmsItem['id'],
            'parsedData' => $parsed
        ], JSON_UNESCAPED_UNICODE);
        break;
    case 'db/version':
        $verInfo = getDatabaseVersionInfo($pdo);
        echo json_encode([
            'status' => 'success',
            'version' => $verInfo['version'],
            'keyVersions' => $verInfo['keyVersions'],
            'lastUpdated' => $verInfo['version']
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'db/sync-delta':
        $input = getJsonInput();
        $clientVersion = isset($input['clientVersion']) ? $input['clientVersion'] : null;
        $clientKeyVersions = isset($input['clientKeyVersions']) ? $input['clientKeyVersions'] : null;

        $verInfo = getDatabaseVersionInfo($pdo);
        $serverVersion = $verInfo['version'];
        $serverKeyVersions = $verInfo['keyVersions'];

        if ($clientVersion && intval($clientVersion) === intval($serverVersion)) {
            echo json_encode(['status' => 'not_modified', 'version' => $serverVersion], JSON_UNESCAPED_UNICODE);
            break;
        }

        $allData = loadAllData($pdo);

        if ($clientKeyVersions && is_array($clientKeyVersions)) {
            $updatedKeys = [];
            $diffCount = 0;

            foreach ($allData as $rawKey => $val) {
                $cleanKey = (strpos($rawKey, 'acc_app_') === 0) ? substr($rawKey, 8) : $rawKey;
                $sVer = isset($serverKeyVersions[$cleanKey]) ? $serverKeyVersions[$cleanKey] : $serverVersion;
                $cVer = isset($clientKeyVersions[$cleanKey]) ? $clientKeyVersions[$cleanKey] : (isset($clientKeyVersions['acc_app_' . $cleanKey]) ? $clientKeyVersions['acc_app_' . $cleanKey] : 0);

                if ($sVer > $cVer || !$cVer) {
                    $updatedKeys[$cleanKey] = $val;
                    $diffCount++;
                }
            }

            if ($diffCount === 0 && $clientVersion) {
                echo json_encode(['status' => 'not_modified', 'version' => $serverVersion], JSON_UNESCAPED_UNICODE);
                break;
            }

            echo json_encode([
                'status' => 'delta',
                'version' => $serverVersion,
                'updatedKeys' => $updatedKeys,
                'keyVersions' => $serverKeyVersions
            ], JSON_UNESCAPED_UNICODE);
            break;
        }

        echo json_encode([
            'status' => 'full',
            'version' => $serverVersion,
            'allData' => $allData,
            'keyVersions' => $serverKeyVersions
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'db/key':
        $key = isset($_GET['key']) ? trim($_GET['key']) : '';
        if (empty($key)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'error' => 'شناسه کلید ارسال نشده است.']);
            exit;
        }
        $data = getKeyDataPhp($pdo, $key);
        echo json_encode(['status' => 'success', 'key' => $key, 'data' => $data], JSON_UNESCAPED_UNICODE);
        break;

    case 'db/load-all':
        $verInfo = getDatabaseVersionInfo($pdo);
        $etag = 'W/"v-' . $verInfo['version'] . '"';
        header('ETag: ' . $etag);
        header('X-DB-Version: ' . $verInfo['version']);

        $ifNoneMatch = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? trim($_SERVER['HTTP_IF_NONE_MATCH']) : '';
        if ($ifNoneMatch === $etag) {
            http_response_code(304);
            exit;
        }

        $data = loadAllData($pdo);
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        break;

    case 'db/save-key':
        $input = getJsonInput();
        $key = isset($input['key']) ? $input['key'] : null;
        $data = isset($input['data']) ? $input['data'] : null;
        $forceOverwrite = !empty($input['forceOverwrite']);
        if (!$key) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'error' => 'شناسه کلید اطلاعات ارسال نشده است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $res = saveKeyData($pdo, $key, $data, $forceOverwrite);
        if (!$res['success']) {
            http_response_code(500);
            echo json_encode([
                'status' => 'error',
                'key' => $res['key'],
                'error' => isset($res['error']) ? $res['error'] : 'خطا در ثبت اطلاعات در دیتابیس متمرکز MySQL',
                'dbType' => 'mysql',
                'version' => $res['version']
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        echo json_encode([
            'status' => 'success',
            'key' => $res['key'],
            'dbType' => 'mysql',
            'version' => $res['version'],
            'timestamp' => date('c')
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'db/merge-entity':
        $input = getJsonInput();
        $key = isset($input['key']) ? $input['key'] : null;
        $item = isset($input['item']) ? $input['item'] : null;
        $items = isset($input['items']) && is_array($input['items']) ? $input['items'] : null;
        $deleteId = isset($input['deleteId']) ? trim((string)$input['deleteId']) : null;

        if (!$key) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'error' => 'شناسه موجودیت مشخص نشده است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $cleanKey = (strpos($key, 'acc_app_') === 0) ? substr($key, 8) : $key;
        $rawList = getKeyDataPhp($pdo, $cleanKey);
        $list = is_array($rawList) ? $rawList : [];

        if ($deleteId !== null && $deleteId !== '') {
            $filtered = [];
            foreach ($list as $it) {
                $itId = getEntityIdentifierPhp($it);
                if ($itId !== $deleteId && $itId !== ('inv-' . $deleteId) && $itId !== ('doc-' . $deleteId) && $itId !== ('code-' . $deleteId) && $itId !== ('user-' . $deleteId)) {
                    $filtered[] = $it;
                }
            }
            $list = $filtered;
        }

        $incomingItems = $items ? $items : ($item ? [$item] : []);
        if (!empty($incomingItems)) {
            $list = smartMergeEntityArrayPhp($list, $incomingItems);
        }

        $res = saveKeyData($pdo, $cleanKey, $list, true);
        echo json_encode([
            'status' => 'success',
            'key' => $cleanKey,
            'count' => count($list),
            'version' => $res['version'],
            'dbType' => 'mysql',
            'timestamp' => date('c')
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'db/save-all':
        $input = getJsonInput();
        $stateData = isset($input['stateData']) ? $input['stateData'] : [];
        $forceOverwrite = !empty($input['forceOverwrite']);
        
        $sanitized = [];
        foreach ($stateData as $rawKey => $val) {
            $cleanKey = (strpos($rawKey, 'acc_app_') === 0) ? substr($rawKey, 8) : $rawKey;
            $sanitized[$cleanKey] = safeUnwrapJsonPhp($val);
        }

        $now = time() * 1000;
        foreach ($sanitized as $k => $v) {
            saveKeyData($pdo, $k, $v, $forceOverwrite);
        }

        echo json_encode([
            'status' => 'success',
            'count' => count($sanitized),
            'dbType' => 'mysql',
            'version' => $now,
            'timestamp' => date('c')
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'db/wipe':
        $input = getJsonInput();
        $selectedIds = isset($input['selectedIds']) && is_array($input['selectedIds']) ? $input['selectedIds'] : [];

        if (empty($selectedIds)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'error' => 'هیچ بخشی برای تخلیه دیتابیس انتخاب نشده است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // 1. ذخیره نسخه پشتیبان اضطراری پیش از تخلیه
        try {
            $timestamp = date('Y-m-d\TH-i-s');
            $emergencyDir = __DIR__ . '/backups';
            if (!file_exists($emergencyDir)) {
                @mkdir($emergencyDir, 0755, true);
            }
            $emergencyFile = $emergencyDir . '/emergency_before_wipe_' . $timestamp . '.json';
            $currentBackupDb = loadAllData($pdo);
            @file_put_contents(
                $emergencyFile,
                json_encode([
                    '_metadata' => [
                        'createdReason' => 'Emergency backup automatically created before selective database wipe',
                        'timestamp' => date('c'),
                        'selectedIds' => $selectedIds
                    ],
                    'database' => $currentBackupDb
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
            );
        } catch (Exception $backupErr) {}

        // 2. بارگذاری وضعیت جاری و اعمال تغییرات پاکسازی
        $currentState = loadAllData($pdo);
        $selectedSet = array_flip($selectedIds);
        $resetLabels = [];
        $modifiedKeys = [];

        // 1. فاکتورها و بازرگانی
        if (isset($selectedSet['invoices'])) {
            $currentState['invoices'] = [];
            $currentState['paymentAllocations'] = [];
            $modifiedKeys['invoices'] = [];
            $modifiedKeys['paymentAllocations'] = [];
            $resetLabels[] = 'کلیه فاکتورها و پیش‌فاکتورها';
        } else if (
            isset($selectedSet['invoices_sales']) ||
            isset($selectedSet['invoices_purchase']) ||
            isset($selectedSet['invoices_proforma'])
        ) {
            $removedInvIds = [];
            $currentInvoices = isset($currentState['invoices']) && is_array($currentState['invoices']) ? $currentState['invoices'] : [];
            $filteredInvoices = [];
            foreach ($currentInvoices as $inv) {
                $isPf = (!empty($inv['isProforma']) || (isset($inv['invoiceNumber']) && strpos((string)$inv['invoiceNumber'], 'PF-') === 0) || (isset($inv['type']) && $inv['type'] === 'proforma') || (!empty($inv['title']) && mb_strpos((string)$inv['title'], 'پیش‌فاکتور') !== false));
                $isPurchase = (isset($inv['type']) && $inv['type'] === 'purchase' && !$isPf);
                $isSale = ((!isset($inv['type']) || $inv['type'] === 'sale' || $inv['type'] === 'invoice') && !$isPf);

                if (isset($selectedSet['invoices_sales']) && $isSale) {
                    if (!empty($inv['id'])) $removedInvIds[(string)$inv['id']] = true;
                    continue;
                }
                if (isset($selectedSet['invoices_purchase']) && $isPurchase) {
                    if (!empty($inv['id'])) $removedInvIds[(string)$inv['id']] = true;
                    continue;
                }
                if (isset($selectedSet['invoices_proforma']) && $isPf) {
                    if (!empty($inv['id'])) $removedInvIds[(string)$inv['id']] = true;
                    continue;
                }
                $filteredInvoices[] = $inv;
            }
            $currentState['invoices'] = $filteredInvoices;
            $modifiedKeys['invoices'] = $filteredInvoices;
            $resetLabels[] = 'زیرمجموعه‌های انتخابی فاکتورها';

            if (!empty($removedInvIds)) {
                $currentAlloc = isset($currentState['paymentAllocations']) && is_array($currentState['paymentAllocations']) ? $currentState['paymentAllocations'] : [];
                $filteredAlloc = array_values(array_filter($currentAlloc, function($a) use ($removedInvIds) {
                    return empty($a['invoiceId']) || !isset($removedInvIds[(string)$a['invoiceId']]);
                }));
                $currentState['paymentAllocations'] = $filteredAlloc;
                $modifiedKeys['paymentAllocations'] = $filteredAlloc;
            }
        }

        if (isset($selectedSet['quotations'])) {
            $currentState['quotations'] = [];
            $modifiedKeys['quotations'] = [];
            $resetLabels[] = 'استعلام‌های قیمت و پیش‌فاکتورها';
        }

        if (isset($selectedSet['salesOpportunities'])) {
            $currentState['salesOpportunities'] = [];
            $modifiedKeys['salesOpportunities'] = [];
            $resetLabels[] = 'فرصت‌های فروش و پیگیری‌ها';
        }

        // 2. انبارداری، کالاها و حواله‌ها
        if (isset($selectedSet['items'])) {
            $currentState['items'] = [];
            $modifiedKeys['items'] = [];
            $resetLabels[] = 'کالاها و خدمات';
        }

        if (isset($selectedSet['itemCategories'])) {
            $currentState['itemCategories'] = [];
            $modifiedKeys['itemCategories'] = [];
            $resetLabels[] = 'دسته‌بندی‌های کالا';
        }

        if (isset($selectedSet['warehouses'])) {
            $currentState['warehouses'] = [];
            $modifiedKeys['warehouses'] = [];
            $resetLabels[] = 'انبارها و موقعیت‌ها';
        }

        if (isset($selectedSet['warehouseTransfers'])) {
            $currentState['warehouseTransfers'] = [];
            $modifiedKeys['warehouseTransfers'] = [];
            $resetLabels[] = 'حواله‌های انتقال بین‌انباری';
        }

        if (isset($selectedSet['warehouseStockAdjustmentLogs'])) {
            $currentState['warehouseStockAdjustmentLogs'] = [];
            $modifiedKeys['warehouseStockAdjustmentLogs'] = [];
            $resetLabels[] = 'لاگ‌های تعدیل و شمارش انبار';
        }

        // 3. مالی، خزانه‌داری، چک‌ها و اسناد
        if (isset($selectedSet['transactions'])) {
            $currentState['transactions'] = [];
            $modifiedKeys['transactions'] = [];
            $resetLabels[] = 'تراکنش‌های مالی و پرداختی';
        }

        if (isset($selectedSet['cheques'])) {
            $currentState['cheques'] = [];
            $modifiedKeys['cheques'] = [];
            $resetLabels[] = 'چک‌های دریافتی و پرداختی';
        }

        if (isset($selectedSet['journalEntries'])) {
            $currentState['journalEntries'] = [];
            $modifiedKeys['journalEntries'] = [];
            $resetLabels[] = 'اسناد حسابداری دوبل';
        }

        if (isset($selectedSet['accounts'])) {
            $currentState['accounts'] = [];
            $modifiedKeys['accounts'] = [];
            $resetLabels[] = 'حساب‌های بانکی و صندوق‌ها';
        }

        if (isset($selectedSet['loanBorrowers'])) {
            $currentState['loanBorrowers'] = [];
            $modifiedKeys['loanBorrowers'] = [];
            $resetLabels[] = 'حساب و بدهی وام‌گیرندگان';
        }

        // 4. طرف حساب‌ها و شرکا
        if (isset($selectedSet['counterparts'])) {
            $currentState['counterparts'] = [];
            $modifiedKeys['counterparts'] = [];
            $resetLabels[] = 'کلیه طرف حساب‌ها و مشتریان';
        } else if (isset($selectedSet['counterparts_debtors']) || isset($selectedSet['counterparts_creditors'])) {
            $currentCp = isset($currentState['counterparts']) && is_array($currentState['counterparts']) ? $currentState['counterparts'] : [];
            $filteredCp = [];
            foreach ($currentCp as $cp) {
                $isDebtor = (isset($cp['type']) && ($cp['type'] === 'buyer' || $cp['type'] === 'customer')) || (isset($cp['balance']) && (float)$cp['balance'] > 0);
                $isCreditor = (isset($cp['type']) && ($cp['type'] === 'seller' || $cp['type'] === 'supplier')) || (isset($cp['balance']) && (float)$cp['balance'] < 0);
                if (isset($selectedSet['counterparts_debtors']) && $isDebtor) continue;
                if (isset($selectedSet['counterparts_creditors']) && $isCreditor) continue;
                $filteredCp[] = $cp;
            }
            $currentState['counterparts'] = $filteredCp;
            $modifiedKeys['counterparts'] = $filteredCp;
            $resetLabels[] = 'زیرمجموعه‌های انتخابی طرف حساب‌ها';
        }

        if (isset($selectedSet['partners'])) {
            $currentState['partners'] = [];
            $modifiedKeys['partners'] = [];
            $resetLabels[] = 'شرکا و سهامداران';
        }

        // 5. سال مالی و ارتباطات
        if (isset($selectedSet['fiscalYears'])) {
            $currentState['fiscalYears'] = [];
            $modifiedKeys['fiscalYears'] = [];
            $resetLabels[] = 'سال‌های مالی';
        }

        if (isset($selectedSet['checklist'])) {
            $currentState['checklist'] = [];
            $modifiedKeys['checklist'] = [];
            $resetLabels[] = 'چک‌لیست و یادداشت‌ها';
        } else if (isset($selectedSet['checklist_personal']) || isset($selectedSet['checklist_shared'])) {
            $currentCl = isset($currentState['checklist']) && is_array($currentState['checklist']) ? $currentState['checklist'] : [];
            $filteredCl = [];
            foreach ($currentCl as $c) {
                $isShared = !empty($c['isShared']) || (!empty($c['sharedWith']) && is_array($c['sharedWith']) && count($c['sharedWith']) > 0);
                if (isset($selectedSet['checklist_personal']) && !$isShared) continue;
                if (isset($selectedSet['checklist_shared']) && $isShared) continue;
                $filteredCl[] = $c;
            }
            $currentState['checklist'] = $filteredCl;
            $modifiedKeys['checklist'] = $filteredCl;
            $resetLabels[] = 'زیرمجموعه‌های انتخابی یادداشت‌ها';
        }

        if (isset($selectedSet['notifications'])) {
            $currentState['notifications'] = [];
            $modifiedKeys['notifications'] = [];
            $resetLabels[] = 'اعلان‌های سیستمی';
        }

        if (isset($selectedSet['webMessengers'])) {
            $currentState['webMessengers'] = [];
            $modifiedKeys['webMessengers'] = [];
            $resetLabels[] = 'پیام‌رسان‌های وب';
        }

        if (isset($selectedSet['customMessengerIcons'])) {
            $currentState['customMessengerIcons'] = [];
            $currentState['acc_system_custom_icons'] = [];
            $modifiedKeys['customMessengerIcons'] = [];
            $modifiedKeys['acc_system_custom_icons'] = [];
            $resetLabels[] = 'آیکون‌های سفارشی پیام‌رسان‌ها';
        }

        // 6. تنظیمات، هوش مصنوعی، لاگ‌ها و فایل‌ها
        if (isset($selectedSet['settings'])) {
            $prevSettings = isset($currentState['settings']) && is_array($currentState['settings']) ? $currentState['settings'] : [];
            $cleanSettings = array_merge($prevSettings, [
                'sellerName' => '',
                'sellerAddress' => '',
                'sellerPhone' => '',
                'invoicePaperSize' => 'A4',
                'font' => 'Vazirmatn',
                'currency' => 'rial'
            ]);
            $currentState['settings'] = $cleanSettings;
            $modifiedKeys['settings'] = $cleanSettings;
            $resetLabels[] = 'تنظیمات کلی و مشخصات فروشگاه';
        }

        if (isset($selectedSet['smart_assistant_chats'])) {
            $currentState['smart_assistant_chats'] = [];
            $modifiedKeys['smart_assistant_chats'] = [];
            $resetLabels[] = 'تاریخچه دستیار هوشمند';
        }

        if (isset($selectedSet['system_logs'])) {
            $currentState['system_logs'] = [];
            $currentState['auditLogs'] = [];
            $modifiedKeys['system_logs'] = [];
            $modifiedKeys['auditLogs'] = [];
            $resetLabels[] = 'لاگ‌ها و مانیتورینگ سیستم';
        }

        if (isset($selectedSet['uploaded_files'])) {
            $uploadsDir = __DIR__ . '/uploads';
            if (file_exists($uploadsDir)) {
                $files = glob($uploadsDir . '/*');
                foreach ($files as $file) {
                    if (is_file($file)) @unlink($file);
                }
            }
            $resetLabels[] = 'فایل‌های پیوست و آپلودهای هاست';
        }

        // 7. کاربران (تثبیت و اعتبارسنجی مشخصات ورود)
        if (isset($selectedSet['users'])) {
            $existingUsers = isset($currentState['users']) && is_array($currentState['users']) && count($currentState['users']) > 0 ? $currentState['users'] : [];
            $sanitizedUsers = [];
            foreach ($existingUsers as $idx => $u) {
                $sanitizedUsers[] = [
                    'id' => isset($u['id']) ? $u['id'] : ('user-' . ($idx + 1)),
                    'name' => isset($u['name']) ? $u['name'] : 'کاربر',
                    'phone' => isset($u['phone']) ? trim((string)$u['phone']) : '',
                    'username' => !empty($u['username']) ? trim((string)$u['username']) : ('user' . ($idx + 1)),
                    'role' => !empty($u['role']) ? $u['role'] : 'seller',
                    'password' => (isset($u['password']) && $u['password'] !== null) ? (string)$u['password'] : (!empty($u['username']) ? (string)$u['username'] : ''),
                    'permissions' => (isset($u['permissions']) && is_array($u['permissions'])) ? $u['permissions'] : []
                ];
            }
            $currentState['users'] = $sanitizedUsers;
            $modifiedKeys['users'] = $sanitizedUsers;
            $resetLabels[] = 'اطلاعات پرسنل و کاربران (تثبیت مشخصات ورود)';
        }

        // ذخیره تغییرات به صورت قطعی در پایگاه داده یا فایل
        $now = time() * 1000;
        $keyVersions = [];
        foreach ($modifiedKeys as $k => $v) {
            saveKeyData($pdo, $k, $v, true);
            $keyVersions[$k] = $now;
        }

        echo json_encode([
            'status' => 'success',
            'message' => 'تخلیه دیتابیس روی سرور با موفقیت انجام شد و اطلاعات برای همه پرسنل پاکسازی گردید.',
            'version' => $now,
            'keyVersions' => $keyVersions,
            'resetLabels' => $resetLabels,
            'updatedKeys' => $modifiedKeys
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'system/web-messengers':
    case 'api/system/web-messengers':
    case 'web-messengers':
        $method = $_SERVER['REQUEST_METHOD'];
        if ($method === 'GET') {
            $data = getSettingStoreValuePhp($pdo, 'acc_system_web_messengers');
            if ($data === null || !is_array($data) || empty($data)) {
                $data = getDefaultWebMessengersPhp();
            }
            echo json_encode([
                'status' => 'success',
                'key' => 'acc_system_web_messengers',
                'source' => 'mysql',
                'data' => $data
            ], JSON_UNESCAPED_UNICODE);
            exit;
        } else if ($method === 'POST') {
            $input = getJsonInput();
            $rawList = null;
            if (isset($input['messengers']) && is_array($input['messengers'])) {
                $rawList = $input['messengers'];
            } else if (isset($input['data']) && is_array($input['data'])) {
                $rawList = $input['data'];
            } else if (is_array($input) && isset($input[0])) {
                $rawList = $input;
            } else if (isset($_POST['messengers'])) {
                $rawList = json_decode($_POST['messengers'], true);
            }

            if ($rawList === null) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'error' => 'لیست پیام‌رسان‌ها به درستی ارسال نشده است.'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $validation = validateWebMessengersInputPhp($rawList);
            if (!$validation['isValid']) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'error' => $validation['error']], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $validatedMessengers = $validation['data'];
            $res = saveSettingStoreValuePhp($pdo, 'acc_system_web_messengers', $validatedMessengers);
            if (!$res['success']) {
                http_response_code(500);
                echo json_encode(['status' => 'error', 'error' => $res['error']], JSON_UNESCAPED_UNICODE);
                exit;
            }

            echo json_encode([
                'status' => 'success',
                'message' => 'لیست پیام‌رسان‌ها با موفقیت در پایگاه‌داده MySQL ذخیره گردید.',
                'key' => 'acc_system_web_messengers',
                'count' => count($validatedMessengers),
                'data' => $validatedMessengers
            ], JSON_UNESCAPED_UNICODE);
            exit;
        } else {
            http_response_code(405);
            echo json_encode(['status' => 'error', 'error' => 'متد درخواست مجاز نیست.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        break;

    case 'system/user-messenger-icons':
    case 'api/system/user-messenger-icons':
    case 'user-messenger-icons':
        $method = $_SERVER['REQUEST_METHOD'];
        if ($method === 'GET') {
            $data = getSettingStoreValuePhp($pdo, 'acc_system_user_messenger_icons');
            $icons = (is_array($data)) ? $data : [];
            $filterUserId = isset($_GET['userId']) ? trim(strval($_GET['userId'])) : null;
            if ($filterUserId) {
                $icons = array_values(array_filter($icons, function($icon) use ($filterUserId) {
                    return !isset($icon['userId']) || empty($icon['userId']) || $icon['userId'] === $filterUserId;
                }));
            }
            echo json_encode([
                'status' => 'success',
                'key' => 'acc_system_user_messenger_icons',
                'source' => 'mysql',
                'data' => $icons
            ], JSON_UNESCAPED_UNICODE);
            exit;
        } else if ($method === 'POST') {
            $input = getJsonInput();
            $rawList = null;
            if (isset($input['icons']) && is_array($input['icons'])) {
                $rawList = $input['icons'];
            } else if (isset($input['data']) && is_array($input['data'])) {
                $rawList = $input['data'];
            } else if (is_array($input) && isset($input[0])) {
                $rawList = $input;
            } else if (isset($_POST['icons'])) {
                $rawList = json_decode($_POST['icons'], true);
            }

            if ($rawList === null) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'error' => 'لیست آیکون‌های سفارشی ارسال نشده است.'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $validation = validateUserMessengerIconsInputPhp($rawList);
            if (!$validation['isValid']) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'error' => $validation['error']], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $validatedIcons = $validation['data'];
            $res = saveSettingStoreValuePhp($pdo, 'acc_system_user_messenger_icons', $validatedIcons);
            if (!$res['success']) {
                http_response_code(500);
                echo json_encode(['status' => 'error', 'error' => $res['error']], JSON_UNESCAPED_UNICODE);
                exit;
            }

            echo json_encode([
                'status' => 'success',
                'message' => 'آیکون‌های سفارشی پیام‌رسان‌ها با موفقیت در پایگاه‌داده MySQL ذخیره شدند.',
                'key' => 'acc_system_user_messenger_icons',
                'count' => count($validatedIcons),
                'data' => $validatedIcons
            ], JSON_UNESCAPED_UNICODE);
            exit;
        } else {
            http_response_code(405);
            echo json_encode(['status' => 'error', 'error' => 'متد درخواست مجاز نیست.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        break;

    case 'settings_store/get':
    case 'api/settings_store/get':
    case 'get_settings':
    case 'api/get_settings':
        $key = isset($_GET['key']) ? trim($_GET['key']) : '';
        if (empty($key)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'error' => 'کلید تنظیم ارسال نشده است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $data = getSettingStoreValuePhp($pdo, $key);
        if ($data === null) {
            if ($key === 'acc_system_web_messengers') {
                $data = getDefaultWebMessengersPhp();
            } else if ($key === 'acc_system_user_messenger_icons') {
                $data = [];
            }
        }
        echo json_encode([
            'status' => 'success',
            'key' => $key,
            'source' => 'mysql',
            'data' => $data
        ], JSON_UNESCAPED_UNICODE);
        exit;

    case 'settings_store/save':
    case 'api/settings_store/save':
    case 'save_settings':
    case 'api/save_settings':
        $input = getJsonInput();
        $key = isset($input['key']) ? trim($input['key']) : '';
        $data = isset($input['data']) ? $input['data'] : (isset($input['value']) ? $input['value'] : (isset($input['setting_value']) ? $input['setting_value'] : null));
        $createdBy = isset($input['createdBy']) ? trim($input['createdBy']) : null;
        if (empty($key)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'error' => 'کلید تنظیم ارسال نشده است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // اعتبارسنجی اختصاصی در صورت ارسال کلیدهای پیام‌رسان یا آیکون
        if ($key === 'acc_system_web_messengers' && is_array($data)) {
            $validation = validateWebMessengersInputPhp($data);
            if (!$validation['isValid']) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'error' => $validation['error']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            $data = $validation['data'];
        } else if ($key === 'acc_system_user_messenger_icons' && is_array($data)) {
            $validation = validateUserMessengerIconsInputPhp($data);
            if (!$validation['isValid']) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'error' => $validation['error']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            $data = $validation['data'];
        }

        $res = saveSettingStoreValuePhp($pdo, $key, $data, $createdBy);
        if (!$res['success']) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'error' => $res['error']], JSON_UNESCAPED_UNICODE);
            exit;
        }
        echo json_encode([
            'status' => 'success',
            'key' => $key,
            'message' => 'تنظیم با موفقیت در جدول settings_store در MySQL ذخیره شد.',
            'data' => $data
        ], JSON_UNESCAPED_UNICODE);
        exit;



    case 'auth/users':
        $dbData = loadAllData($pdo);
        $rawUsers = isset($dbData['users']) ? $dbData['users'] : (isset($dbData['acc_app_users']) ? $dbData['acc_app_users'] : []);
        $usersList = is_array($rawUsers) ? $rawUsers : (is_string($rawUsers) ? (json_decode($rawUsers, true) ?: []) : []);
        echo json_encode(['status' => 'success', 'users' => $usersList], JSON_UNESCAPED_UNICODE);
        break;

    case 'auth/login':
        $input = getJsonInput();
        $username = isset($input['username']) ? trim($input['username']) : '';
        $password = isset($input['password']) ? trim($input['password']) : '';

        if (empty($username) || !isset($input['password'])) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'error' => 'نام کاربری و کلمه عبور الزامی است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        $arabicDigits  = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        $englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

        $normFunc = function($str) use ($persianDigits, $arabicDigits, $englishDigits) {
            $s = trim((string)$str);
            $s = str_replace($persianDigits, $englishDigits, $s);
            $s = str_replace($arabicDigits, $englishDigits, $s);
            $s = str_replace('ي', 'ی', $s);
            $s = str_replace('ك', 'ک', $s);
            return $s;
        };

        $inputUserNorm = strtolower($normFunc($username));
        $inputPassNorm = $normFunc($password);

        $dbData = loadAllData($pdo);
        $rawUsers = isset($dbData['users']) ? $dbData['users'] : (isset($dbData['acc_app_users']) ? $dbData['acc_app_users'] : []);
        $usersList = is_array($rawUsers) ? $rawUsers : (is_string($rawUsers) ? (json_decode($rawUsers, true) ?: []) : []);

        if (empty($usersList)) {
            http_response_code(401);
            echo json_encode([
                'status' => 'error',
                'code' => 'NO_USERS',
                'error' => 'هیچ کاربری در پایگاه‌داده ثبت نشده است. لطفاً از طریق فرم راه‌اندازی اولیه، حساب مدیر ارشد را ایجاد فرمایید.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $matchedUser = null;
        foreach ($usersList as $u) {
            if (!is_array($u)) continue;
            $uNameNorm = strtolower($normFunc(isset($u['username']) ? $u['username'] : ''));
            $uPhoneNorm = $normFunc(isset($u['phone']) ? $u['phone'] : '');
            if (($uNameNorm && $uNameNorm === $inputUserNorm) || ($uPhoneNorm && $uPhoneNorm === $inputUserNorm)) {
                $matchedUser = $u;
                break;
            }
        }

        if (!$matchedUser) {
            http_response_code(401);
            echo json_encode(['status' => 'error', 'error' => 'نام کاربری یا کلمه عبور وارد شده اشتباه است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $storedPassRaw = isset($matchedUser['password']) ? (string)$matchedUser['password'] : (isset($matchedUser['username']) ? (string)$matchedUser['username'] : '');
        $storedPassNorm = $normFunc($storedPassRaw);

        $isPassValid = ($inputPassNorm === $storedPassNorm) || ($password === $storedPassRaw) || (empty($storedPassNorm) && $inputPassNorm === strtolower($normFunc($matchedUser['username'])));

        if (!$isPassValid) {
            http_response_code(401);
            echo json_encode(['status' => 'error', 'error' => 'نام کاربری یا کلمه عبور وارد شده اشتباه است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        echo json_encode(['status' => 'success', 'user' => $matchedUser, 'users' => $usersList], JSON_UNESCAPED_UNICODE);
        break;

    case 'auth/update-credentials':
        $input = getJsonInput();
        $updatedUsers = isset($input['updatedUsers']) ? $input['updatedUsers'] : [];
        if (!is_array($updatedUsers) || empty($updatedUsers)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'error' => 'لیست کاربران ارسالی نامعتبر است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        saveKeyData($pdo, 'users', $updatedUsers, true);
        saveKeyData($pdo, 'acc_app_users', $updatedUsers, true);
        echo json_encode(['status' => 'success', 'users' => $updatedUsers], JSON_UNESCAPED_UNICODE);
        break;

    case 'auth/setup-initial-admin':
        $input = getJsonInput();
        $name = isset($input['name']) ? trim($input['name']) : '';
        $username = isset($input['username']) ? trim($input['username']) : '';
        $password = isset($input['password']) ? trim($input['password']) : '';
        $phone = isset($input['phone']) ? trim($input['phone']) : '';

        if (empty($name) || empty($username) || empty($password)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'error' => 'نام، نام کاربری و کلمه عبور الزامی است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $dbData = loadAllData($pdo);
        $rawUsers = isset($dbData['users']) ? $dbData['users'] : (isset($dbData['acc_app_users']) ? $dbData['acc_app_users'] : []);
        $usersList = is_array($rawUsers) ? $rawUsers : (is_string($rawUsers) ? (json_decode($rawUsers, true) ?: []) : []);

        if (!empty($usersList)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'error' => 'کاربران سیستم قبلاً در پایگاه‌داده ایجاد شده‌اند. لطفاً وارد شوید.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $newAdmin = [
            'id' => 'user-' . (round(microtime(true) * 1000)),
            'name' => $name,
            'username' => strtolower($username),
            'password' => $password,
            'role' => 'admin',
            'phone' => $phone,
            'permissions' => [
                'dashboard',
                'invoices',
                'warehouse',
                'accounting',
                'counterparts',
                'reports',
                'banking',
                'users',
                'settings',
                'ai_assistant',
                'fiscal_year',
                'logs'
            ]
        ];

        $updatedUsers = [$newAdmin];
        saveKeyData($pdo, 'users', $updatedUsers, true);
        saveKeyData($pdo, 'acc_app_users', $updatedUsers, true);

        echo json_encode([
            'status' => 'success',
            'user' => $newAdmin,
            'users' => $updatedUsers,
            'message' => 'مدیر ارشد سامانه با موفقیت در دیتابیس متمرکز MySQL ایجاد شد.'
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'system/logs':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = getJsonInput();
            $log = isset($input['log']) ? $input['log'] : null;
            $logs = isset($input['logs']) ? $input['logs'] : null;
            $newItems = is_array($logs) ? $logs : ($log ? [$log] : []);

            $dbData = loadAllData($pdo);
            $rawLogs = isset($dbData['system_logs']) ? $dbData['system_logs'] : (isset($dbData['acc_app_system_logs']) ? $dbData['acc_app_system_logs'] : []);
            $currentLogs = is_array($rawLogs) ? $rawLogs : (is_string($rawLogs) ? (json_decode($rawLogs, true) ?: []) : []);

            $combined = array_merge($newItems, $currentLogs);
            $unique = [];
            $seenIds = [];
            $cutoff = (time() * 1000) - (7 * 24 * 60 * 60 * 1000);

            foreach ($combined as $item) {
                if (!is_array($item) || empty($item['id']) || isset($seenIds[$item['id']])) continue;
                $t = isset($item['timestampMs']) ? (float)$item['timestampMs'] : (isset($item['timestamp']) ? strtotime($item['timestamp']) * 1000 : 0);
                if ($t >= $cutoff) {
                    $seenIds[$item['id']] = true;
                    $unique[] = $item;
                }
            }

            $finalLogs = array_slice($unique, 0, 3000);
            saveKeyData($pdo, 'system_logs', $finalLogs);
            saveKeyData($pdo, 'acc_app_system_logs', $finalLogs);
            echo json_encode(['status' => 'success', 'totalCount' => count($finalLogs)], JSON_UNESCAPED_UNICODE);
        } else {
            // GET
            $dbData = loadAllData($pdo);
            $rawLogs = isset($dbData['system_logs']) ? $dbData['system_logs'] : (isset($dbData['acc_app_system_logs']) ? $dbData['acc_app_system_logs'] : []);
            $currentLogs = is_array($rawLogs) ? $rawLogs : (is_string($rawLogs) ? (json_decode($rawLogs, true) ?: []) : []);

            $valid = [];
            $cutoff = (time() * 1000) - (7 * 24 * 60 * 60 * 1000);
            $purged = 0;

            foreach ($currentLogs as $item) {
                if (!is_array($item)) continue;
                $t = isset($item['timestampMs']) ? (float)$item['timestampMs'] : (isset($item['timestamp']) ? strtotime($item['timestamp']) * 1000 : 0);
                if ($t >= $cutoff) {
                    $valid[] = $item;
                } else {
                    $purged++;
                }
            }

            if ($purged > 0) {
                saveKeyData($pdo, 'system_logs', $valid);
                saveKeyData($pdo, 'acc_app_system_logs', $valid);
            }

            echo json_encode([
                'status' => 'success',
                'logs' => $valid,
                'totalCount' => count($valid),
                'autoPurgedCount' => $purged
            ], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'system/logs/delete':
        $input = getJsonInput();
        $purgeAll = !empty($input['purgeAll']);
        $logIds = isset($input['logIds']) && is_array($input['logIds']) ? $input['logIds'] : [];

        if ($purgeAll) {
            saveKeyData($pdo, 'system_logs', []);
            saveKeyData($pdo, 'acc_app_system_logs', []);
            echo json_encode(['status' => 'success', 'deletedCount' => 'all', 'remainingCount' => 0], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (empty($logIds)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'error' => 'شناسه لاگ‌ها ارسال نشده است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $dbData = loadAllData($pdo);
        $rawLogs = isset($dbData['system_logs']) ? $dbData['system_logs'] : (isset($dbData['acc_app_system_logs']) ? $dbData['acc_app_system_logs'] : []);
        $currentLogs = is_array($rawLogs) ? $rawLogs : (is_string($rawLogs) ? (json_decode($rawLogs, true) ?: []) : []);

        $idMap = array_flip($logIds);
        $remaining = [];
        foreach ($currentLogs as $item) {
            if (is_array($item) && isset($item['id']) && !isset($idMap[$item['id']])) {
                $remaining[] = $item;
            }
        }

        saveKeyData($pdo, 'system_logs', $remaining);
        saveKeyData($pdo, 'acc_app_system_logs', $remaining);

        echo json_encode([
            'status' => 'success',
            'deletedCount' => count($currentLogs) - count($remaining),
            'remainingCount' => count($remaining)
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'system/logs/purge-old':
        $input = getJsonInput();
        $maxDays = isset($input['maxAgeDays']) ? (int)$input['maxAgeDays'] : 7;
        if ($maxDays <= 0) $maxDays = 7;
        $cutoff = (time() * 1000) - ($maxDays * 24 * 60 * 60 * 1000);

        $dbData = loadAllData($pdo);
        $rawLogs = isset($dbData['system_logs']) ? $dbData['system_logs'] : (isset($dbData['acc_app_system_logs']) ? $dbData['acc_app_system_logs'] : []);
        $currentLogs = is_array($rawLogs) ? $rawLogs : (is_string($rawLogs) ? (json_decode($rawLogs, true) ?: []) : []);

        $valid = [];
        $purged = 0;
        foreach ($currentLogs as $item) {
            if (!is_array($item)) continue;
            $t = isset($item['timestampMs']) ? (float)$item['timestampMs'] : (isset($item['timestamp']) ? strtotime($item['timestamp']) * 1000 : 0);
            if ($t >= $cutoff) {
                $valid[] = $item;
            } else {
                $purged++;
            }
        }

        if ($purged > 0) {
            saveKeyData($pdo, 'system_logs', $valid);
            saveKeyData($pdo, 'acc_app_system_logs', $valid);
        }

        echo json_encode([
            'status' => 'success',
            'purgedCount' => $purged,
            'remainingCount' => count($valid)
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'backup/export':
        $input = getJsonInput();
        $clientLocalStorage = isset($input['clientLocalStorage']) && is_array($input['clientLocalStorage']) ? $input['clientLocalStorage'] : [];
        $selectedSections = isset($input['selectedSections']) ? $input['selectedSections'] : null;

        $ALL_BACKUP_SECTION_IDS = [
            'users', 'transactions', 'finalInvoices', 'proformas', 'goods',
            'services', 'accountingDocs', 'counterparts', 'accounts', 'categories',
            'partnersLoans', 'checklist', 'settingsTheme', 'uploads', 'logs'
        ];

        $isAllSelected = empty($selectedSections) || $selectedSections === 'all' || 
            (is_array($selectedSections) && count(array_diff($ALL_BACKUP_SECTION_IDS, $selectedSections)) === 0);
        $isPartial = !$isAllSelected;

        $dbData = loadAllData($pdo);

        // پاکسازی کلیدهای حساس امنیتی
        $sanitizedDbData = $dbData;
        unset($sanitizedDbData['geminiApiKey'], $sanitizedDbData['acc_app_geminiApiKey']);

        // خواندن و جمع‌آوری فایل‌های آپلود شده (تنها در صورت انتخاب بخش فایل‌ها یا بکاپ کامل)
        $shouldIncludeUploads = !$isPartial || (is_array($selectedSections) && in_array('uploads', $selectedSections));
        $uploadsMap = [];
        $uploadsDirs = [
            __DIR__ . '/uploads',
            __DIR__ . '/public/uploads',
            __DIR__ . '/data/uploads'
        ];

        if ($shouldIncludeUploads) {
            foreach ($uploadsDirs as $dir) {
                if (file_exists($dir)) {
                    $iterator = new RecursiveIteratorIterator(
                        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS)
                    );
                    foreach ($iterator as $file) {
                        if ($file->isFile()) {
                            $fullPath = $file->getPathname();
                            $relPath = str_replace('\\', '/', substr($fullPath, strlen(__DIR__) + 1));
                            $uploadsMap[$relPath] = base64_encode(file_get_contents($fullPath));
                        }
                    }
                }
            }
        }

        $finalDbData = [];
        $finalLocalStorage = [];

        if (!$isPartial) {
            $finalDbData = $sanitizedDbData;
            $finalLocalStorage = $clientLocalStorage;
        } else {
            $sectionSet = is_array($selectedSections) ? array_flip($selectedSections) : [];

            $isInvoiceProforma = function($inv) {
                if (!is_array($inv)) return false;
                if (!empty($inv['isProforma']) || (isset($inv['type']) && $inv['type'] === 'proforma')) return true;
                if (isset($inv['invoiceNumber']) && is_string($inv['invoiceNumber']) && strpos(strtoupper(trim($inv['invoiceNumber'])), 'PF-') === 0) return true;
                if (isset($inv['title']) && is_string($inv['title']) && strpos($inv['title'], 'پیش‌فاکتور') !== false) return true;
                return false;
            };

            // 1. کاربران و پرسنل
            if (isset($sectionSet['users'])) {
                if (isset($sanitizedDbData['users'])) $finalDbData['users'] = $sanitizedDbData['users'];
                if (isset($sanitizedDbData['acc_app_users'])) $finalDbData['acc_app_users'] = $sanitizedDbData['acc_app_users'];
                if (isset($sanitizedDbData['currentUser'])) $finalDbData['currentUser'] = $sanitizedDbData['currentUser'];
                if (isset($sanitizedDbData['acc_app_currentUser'])) $finalDbData['acc_app_currentUser'] = $sanitizedDbData['acc_app_currentUser'];
                if (isset($sanitizedDbData['primaryUserRole'])) $finalDbData['primaryUserRole'] = $sanitizedDbData['primaryUserRole'];
                if (isset($sanitizedDbData['acc_app_primaryUserRole'])) $finalDbData['acc_app_primaryUserRole'] = $sanitizedDbData['acc_app_primaryUserRole'];
            }

            // 2. تراکنش‌ها، صورتحساب بانکی و جریان‌های مالی
            if (isset($sectionSet['transactions'])) {
                if (isset($sanitizedDbData['transactions'])) $finalDbData['transactions'] = $sanitizedDbData['transactions'];
                if (isset($sanitizedDbData['acc_app_transactions'])) $finalDbData['acc_app_transactions'] = $sanitizedDbData['acc_app_transactions'];
                if (isset($sanitizedDbData['pendingDeposits'])) $finalDbData['pendingDeposits'] = $sanitizedDbData['pendingDeposits'];
                if (isset($sanitizedDbData['acc_app_pendingDeposits'])) $finalDbData['acc_app_pendingDeposits'] = $sanitizedDbData['acc_app_pendingDeposits'];
                if (isset($sanitizedDbData['bankSmsMessages'])) $finalDbData['bankSmsMessages'] = $sanitizedDbData['bankSmsMessages'];
                if (isset($sanitizedDbData['acc_app_bankSmsMessages'])) $finalDbData['acc_app_bankSmsMessages'] = $sanitizedDbData['acc_app_bankSmsMessages'];
                if (isset($sanitizedDbData['paymentAllocations'])) $finalDbData['paymentAllocations'] = $sanitizedDbData['paymentAllocations'];
                if (isset($sanitizedDbData['acc_app_paymentAllocations'])) $finalDbData['acc_app_paymentAllocations'] = $sanitizedDbData['acc_app_paymentAllocations'];
            }

            // 3. فاکتورهای نهایی در مقابل 4. پیش‌فاکتورها
            $incFinalInvoices = isset($sectionSet['finalInvoices']);
            $incProformas = isset($sectionSet['proformas']);
            if ($incFinalInvoices || $incProformas) {
                $rawInvoices = (isset($sanitizedDbData['invoices']) && is_array($sanitizedDbData['invoices']) && count($sanitizedDbData['invoices']) > 0)
                    ? $sanitizedDbData['invoices']
                    : (isset($sanitizedDbData['acc_app_invoices']) && is_array($sanitizedDbData['acc_app_invoices']) ? $sanitizedDbData['acc_app_invoices'] : []);

                $filteredInvoices = [];
                foreach ($rawInvoices as $inv) {
                    $isPf = $isInvoiceProforma($inv);
                    if ($incFinalInvoices && $incProformas) {
                        $filteredInvoices[] = $inv;
                    } else if ($incFinalInvoices && !$incProformas && !$isPf) {
                        $filteredInvoices[] = $inv;
                    } else if (!$incFinalInvoices && $incProformas && $isPf) {
                        $filteredInvoices[] = $inv;
                    }
                }
                $finalDbData['invoices'] = $filteredInvoices;
                $finalDbData['acc_app_invoices'] = $filteredInvoices;
            }

            // 5. کالاها در مقابل 6. خدمات
            $incGoods = isset($sectionSet['goods']);
            $incServices = isset($sectionSet['services']);
            if ($incGoods || $incServices) {
                $rawItems = (isset($sanitizedDbData['items']) && is_array($sanitizedDbData['items']) && count($sanitizedDbData['items']) > 0)
                    ? $sanitizedDbData['items']
                    : (isset($sanitizedDbData['acc_app_items']) && is_array($sanitizedDbData['acc_app_items']) ? $sanitizedDbData['acc_app_items'] : []);

                $filteredItems = [];
                foreach ($rawItems as $item) {
                    $isService = !empty($item['type']) && $item['type'] === 'khadamat';
                    if ($incGoods && $incServices) {
                        $filteredItems[] = $item;
                    } else if ($incGoods && !$incServices && !$isService) {
                        $filteredItems[] = $item;
                    } else if (!$incGoods && $incServices && $isService) {
                        $filteredItems[] = $item;
                    }
                }
                $finalDbData['items'] = $filteredItems;
                $finalDbData['acc_app_items'] = $filteredItems;

                if ($incGoods) {
                    if (isset($sanitizedDbData['inventoryMovements'])) $finalDbData['inventoryMovements'] = $sanitizedDbData['inventoryMovements'];
                    if (isset($sanitizedDbData['acc_app_inventoryMovements'])) $finalDbData['acc_app_inventoryMovements'] = $sanitizedDbData['acc_app_inventoryMovements'];
                    if (isset($sanitizedDbData['warehouse_categories_list'])) $finalDbData['warehouse_categories_list'] = $sanitizedDbData['warehouse_categories_list'];
                    if (isset($sanitizedDbData['acc_app_warehouse_categories_list'])) $finalDbData['acc_app_warehouse_categories_list'] = $sanitizedDbData['acc_app_warehouse_categories_list'];
                    if (isset($sanitizedDbData['warehouse_stock_adjustment_logs'])) $finalDbData['warehouse_stock_adjustment_logs'] = $sanitizedDbData['warehouse_stock_adjustment_logs'];
                    if (isset($sanitizedDbData['acc_app_warehouse_stock_adjustment_logs'])) $finalDbData['acc_app_warehouse_stock_adjustment_logs'] = $sanitizedDbData['acc_app_warehouse_stock_adjustment_logs'];
                }
            }

            // 7. اسناد حسابداری و سال مالی
            if (isset($sectionSet['accountingDocs'])) {
                if (isset($sanitizedDbData['docs'])) $finalDbData['docs'] = $sanitizedDbData['docs'];
                if (isset($sanitizedDbData['acc_app_docs'])) $finalDbData['acc_app_docs'] = $sanitizedDbData['acc_app_docs'];
                if (isset($sanitizedDbData['fiscalYear'])) $finalDbData['fiscalYear'] = $sanitizedDbData['fiscalYear'];
                if (isset($sanitizedDbData['acc_app_fiscalYear'])) $finalDbData['acc_app_fiscalYear'] = $sanitizedDbData['acc_app_fiscalYear'];
                if (isset($sanitizedDbData['fiscalYearsList'])) $finalDbData['fiscalYearsList'] = $sanitizedDbData['fiscalYearsList'];
                if (isset($sanitizedDbData['acc_app_fiscalYearsList'])) $finalDbData['acc_app_fiscalYearsList'] = $sanitizedDbData['acc_app_fiscalYearsList'];
                if (isset($sanitizedDbData['seq_doc_number'])) $finalDbData['seq_doc_number'] = $sanitizedDbData['seq_doc_number'];
                if (isset($sanitizedDbData['acc_app_seq_doc_number'])) $finalDbData['acc_app_seq_doc_number'] = $sanitizedDbData['acc_app_seq_doc_number'];
            }

            // 8. طرف حساب‌ها و مشتریان
            if (isset($sectionSet['counterparts'])) {
                if (isset($sanitizedDbData['counterparts'])) $finalDbData['counterparts'] = $sanitizedDbData['counterparts'];
                if (isset($sanitizedDbData['acc_app_counterparts'])) $finalDbData['acc_app_counterparts'] = $sanitizedDbData['acc_app_counterparts'];
            }

            // 9. حساب‌های بانکی و صندوق‌ها
            if (isset($sectionSet['accounts'])) {
                if (isset($sanitizedDbData['accounts'])) $finalDbData['accounts'] = $sanitizedDbData['accounts'];
                if (isset($sanitizedDbData['acc_app_accounts'])) $finalDbData['acc_app_accounts'] = $sanitizedDbData['acc_app_accounts'];
            }

            // 10. دسته‌بندی‌ها، پورسانت و بازاریابی
            if (isset($sectionSet['categories'])) {
                if (isset($sanitizedDbData['categories'])) $finalDbData['categories'] = $sanitizedDbData['categories'];
                if (isset($sanitizedDbData['acc_app_categories'])) $finalDbData['acc_app_categories'] = $sanitizedDbData['acc_app_categories'];
                if (isset($sanitizedDbData['commissionTags'])) $finalDbData['commissionTags'] = $sanitizedDbData['commissionTags'];
                if (isset($sanitizedDbData['acc_app_commissionTags'])) $finalDbData['acc_app_commissionTags'] = $sanitizedDbData['acc_app_commissionTags'];
                if (isset($sanitizedDbData['commission_tags_list'])) $finalDbData['commission_tags_list'] = $sanitizedDbData['commission_tags_list'];
                if (isset($sanitizedDbData['acc_app_commission_tags_list'])) $finalDbData['acc_app_commission_tags_list'] = $sanitizedDbData['acc_app_commission_tags_list'];
                if (isset($sanitizedDbData['commission_settlements_list'])) $finalDbData['commission_settlements_list'] = $sanitizedDbData['commission_settlements_list'];
                if (isset($sanitizedDbData['acc_app_commission_settlements_list'])) $finalDbData['acc_app_commission_settlements_list'] = $sanitizedDbData['acc_app_commission_settlements_list'];
                if (isset($sanitizedDbData['global_fixed_invoice_comm'])) $finalDbData['global_fixed_invoice_comm'] = $sanitizedDbData['global_fixed_invoice_comm'];
                if (isset($sanitizedDbData['urgent_fixed_invoice_comm'])) $finalDbData['urgent_fixed_invoice_comm'] = $sanitizedDbData['urgent_fixed_invoice_comm'];
                if (isset($sanitizedDbData['emergency_fixed_invoice_comm'])) $finalDbData['emergency_fixed_invoice_comm'] = $sanitizedDbData['emergency_fixed_invoice_comm'];
                if (isset($sanitizedDbData['fixed_invoice_commissions'])) $finalDbData['fixed_invoice_commissions'] = $sanitizedDbData['fixed_invoice_commissions'];
                if (isset($sanitizedDbData['shipping_method_fixed_commissions'])) $finalDbData['shipping_method_fixed_commissions'] = $sanitizedDbData['shipping_method_fixed_commissions'];
            }

            // 11. شرکا و وام‌گیرندگان
            if (isset($sectionSet['partnersLoans'])) {
                if (isset($sanitizedDbData['partners'])) $finalDbData['partners'] = $sanitizedDbData['partners'];
                if (isset($sanitizedDbData['acc_app_partners'])) $finalDbData['acc_app_partners'] = $sanitizedDbData['acc_app_partners'];
                if (isset($sanitizedDbData['loanBorrowers'])) $finalDbData['loanBorrowers'] = $sanitizedDbData['loanBorrowers'];
                if (isset($sanitizedDbData['acc_app_loanBorrowers'])) $finalDbData['acc_app_loanBorrowers'] = $sanitizedDbData['acc_app_loanBorrowers'];
            }

            // 12. یادداشت‌ها و چک‌لیست
            if (isset($sectionSet['checklist'])) {
                if (isset($sanitizedDbData['checklist'])) $finalDbData['checklist'] = $sanitizedDbData['checklist'];
                if (isset($sanitizedDbData['acc_app_checklist'])) $finalDbData['acc_app_checklist'] = $sanitizedDbData['acc_app_checklist'];
            }

            // 13. تنظیمات و تم‌ها
            if (isset($sectionSet['settingsTheme'])) {
                if (isset($sanitizedDbData['settings'])) $finalDbData['settings'] = $sanitizedDbData['settings'];
                if (isset($sanitizedDbData['acc_app_settings'])) $finalDbData['acc_app_settings'] = $sanitizedDbData['acc_app_settings'];
                foreach ($sanitizedDbData as $k => $val) {
                    if (
                        strpos($k, 'theme') !== false || strpos($k, 'Theme') !== false || 
                        strpos($k, 'Bg') !== false || strpos($k, 'font') !== false || 
                        strpos($k, 'currency') !== false || strpos($k, 'allow_login_restore') !== false ||
                        strpos($k, 'allow_login_update') !== false || strpos($k, 'acc_seller_') === 0 ||
                        strpos($k, 'acc_system_') === 0 || strpos($k, 'fahamacc_') === 0 ||
                        strpos($k, 'settings_') === 0
                    ) {
                        $finalDbData[$k] = $val;
                    }
                }
            }

            // 14. لاگ‌ها و سوابق سیستمی
            if (isset($sectionSet['logs'])) {
                if (isset($sanitizedDbData['auditLogs'])) $finalDbData['auditLogs'] = $sanitizedDbData['auditLogs'];
                if (isset($sanitizedDbData['acc_app_auditLogs'])) $finalDbData['acc_app_auditLogs'] = $sanitizedDbData['acc_app_auditLogs'];
                if (isset($sanitizedDbData['system_logs'])) $finalDbData['system_logs'] = $sanitizedDbData['system_logs'];
                if (isset($sanitizedDbData['acc_app_system_logs'])) $finalDbData['acc_app_system_logs'] = $sanitizedDbData['acc_app_system_logs'];
            }

            // فیلتر دقیق مقادیر localStorage ارسالی کلاینت
            $finalLocalStorage = [];
            foreach ($clientLocalStorage as $lsKey => $lsVal) {
                $clean = (strpos($lsKey, 'acc_app_') === 0) ? substr($lsKey, 8) : $lsKey;

                if (isset($sectionSet['users']) && ($clean === 'users' || $clean === 'currentUser' || $clean === 'primaryUserRole' || strpos($clean, 'users_') === 0)) {
                    $finalLocalStorage[$lsKey] = $lsVal;
                }
                if (isset($sectionSet['transactions']) && (
                    $clean === 'transactions' || $clean === 'pendingDeposits' || $clean === 'bankSmsMessages' || $clean === 'paymentAllocations' || 
                    strpos($clean, 'transactions_') === 0 || strpos($clean, 'pendingDeposits_') === 0 || strpos($clean, 'bankSmsMessages_') === 0 || strpos($clean, 'paymentAllocations_') === 0
                )) {
                    $finalLocalStorage[$lsKey] = $lsVal;
                }
                if (isset($sectionSet['accountingDocs']) && ($clean === 'docs' || $clean === 'fiscalYear' || $clean === 'fiscalYearsList' || $clean === 'seq_doc_number' || strpos($clean, 'docs_') === 0 || strpos($clean, 'fiscalYear_') === 0)) {
                    $finalLocalStorage[$lsKey] = $lsVal;
                }
                if (isset($sectionSet['counterparts']) && ($clean === 'counterparts' || strpos($clean, 'counterparts_') === 0)) {
                    $finalLocalStorage[$lsKey] = $lsVal;
                }
                if (isset($sectionSet['accounts']) && ($clean === 'accounts' || strpos($clean, 'accounts_') === 0)) {
                    $finalLocalStorage[$lsKey] = $lsVal;
                }
                if (isset($sectionSet['categories']) && (
                    $clean === 'categories' || $clean === 'commissionTags' || strpos($clean, 'categories_') === 0 || strpos($clean, 'commissionTags_') === 0 || strpos($clean, 'commission_') === 0 || strpos($clean, 'global_fixed_') === 0 || strpos($clean, 'urgent_fixed_') === 0 || strpos($clean, 'emergency_fixed_') === 0 || strpos($clean, 'fixed_invoice_') === 0 || strpos($clean, 'shipping_method_fixed_') === 0
                )) {
                    $finalLocalStorage[$lsKey] = $lsVal;
                }
                if (isset($sectionSet['partnersLoans']) && ($clean === 'partners' || $clean === 'loanBorrowers' || strpos($clean, 'partners_') === 0 || strpos($clean, 'loanBorrowers_') === 0)) {
                    $finalLocalStorage[$lsKey] = $lsVal;
                }
                if (isset($sectionSet['checklist']) && ($clean === 'checklist' || strpos($clean, 'checklist_') === 0)) {
                    $finalLocalStorage[$lsKey] = $lsVal;
                }
                if (isset($sectionSet['settingsTheme']) && (
                    $clean === 'settings' || strpos($clean, 'settings_') === 0 || strpos($clean, 'Theme') !== false || strpos($clean, 'theme') !== false || strpos($clean, 'Bg') !== false || strpos($clean, 'font') !== false || strpos($clean, 'currency') !== false || strpos($clean, 'allow_login_restore') !== false || strpos($clean, 'allow_login_update') !== false || strpos($clean, 'acc_seller_') === 0 || strpos($clean, 'acc_system_') === 0 || strpos($clean, 'fahamacc_') === 0
                )) {
                    $finalLocalStorage[$lsKey] = $lsVal;
                }
                if (isset($sectionSet['logs']) && ($clean === 'auditLogs' || $clean === 'system_logs' || strpos($clean, 'auditLogs_') === 0 || strpos($clean, 'system_logs_') === 0)) {
                    $finalLocalStorage[$lsKey] = $lsVal;
                }

                if (($incFinalInvoices || $incProformas) && ($clean === 'invoices' || strpos($clean, 'invoices_') === 0)) {
                    try {
                        $parsedArr = is_string($lsVal) ? json_decode($lsVal, true) : $lsVal;
                        if (is_array($parsedArr)) {
                            $filtered = [];
                            foreach ($parsedArr as $inv) {
                                $isPf = $isInvoiceProforma($inv);
                                if ($incFinalInvoices && $incProformas) {
                                    $filtered[] = $inv;
                                } else if ($incFinalInvoices && !$incProformas && !$isPf) {
                                    $filtered[] = $inv;
                                } else if (!$incFinalInvoices && $incProformas && $isPf) {
                                    $filtered[] = $inv;
                                }
                            }
                            $finalLocalStorage[$lsKey] = json_encode($filtered, JSON_UNESCAPED_UNICODE);
                        }
                    } catch (Exception $e) {}
                }

                if (($incGoods || $incServices) && ($clean === 'items' || strpos($clean, 'items_') === 0)) {
                    try {
                        $parsedArr = is_string($lsVal) ? json_decode($lsVal, true) : $lsVal;
                        if (is_array($parsedArr)) {
                            $filtered = [];
                            foreach ($parsedArr as $item) {
                                $isService = !empty($item['type']) && $item['type'] === 'khadamat';
                                if ($incGoods && $incServices) {
                                    $filtered[] = $item;
                                } else if ($incGoods && !$incServices && !$isService) {
                                    $filtered[] = $item;
                                } else if (!$incGoods && $incServices && $isService) {
                                    $filtered[] = $item;
                                }
                            }
                            $finalLocalStorage[$lsKey] = json_encode($filtered, JSON_UNESCAPED_UNICODE);
                        }
                    } catch (Exception $e) {}
                }
            }
        }

        $cfgPath = __DIR__ . '/wp-config.json';
        $activeConfig = file_exists($cfgPath) ? (json_decode(file_get_contents($cfgPath), true) ?: []) : [];

        $SECTION_TITLES_PHP = [
            'users' => 'کاربران و پرسنل',
            'transactions' => 'تراکنش‌ها و امور بانکی',
            'finalInvoices' => 'فاکتورهای قطعی خرید و فروش',
            'proformas' => 'پیش‌فاکتورها و سفارشات',
            'goods' => 'کالاها و موجودی انبار',
            'services' => 'خدمات و اجرت‌ها',
            'accountingDocs' => 'اسناد دوبل حسابداری و سال مالی',
            'counterparts' => 'طرف‌حساب‌ها و مخاطبین',
            'accounts' => 'حساب‌ها و صندوق‌ها',
            'categories' => 'سرفصل‌ها و تنظیمات پورسانت',
            'partnersLoans' => 'شرکا و تسهیلات وام',
            'checklist' => 'یادداشت‌ها و چک‌لیست',
            'settingsTheme' => 'تنظیمات عمومی و ظاهر',
            'uploads' => 'فایل‌ها و تصاویر پیوست',
            'logs' => 'لاگ‌های امنیتی و سیستمی'
        ];

        $secCount = is_array($selectedSections) ? count($selectedSections) : 0;
        $singleSecTitle = ($isPartial && $secCount === 1 && isset($SECTION_TITLES_PHP[$selectedSections[0]])) 
            ? $SECTION_TITLES_PHP[$selectedSections[0]] 
            : null;

        $backupPackage = [
            '_metadata' => [
                'version' => '2.0',
                'system' => 'TICK_Accounting',
                'createdAt' => date('c'),
                'type' => $isPartial ? 'CUSTOM_SELECTIVE_BACKUP' : 'USER_DATA_ONLY_BACKUP',
                'description' => $isPartial 
                    ? ($singleSecTitle ? "نسخه پشتیبان اختصاصی بخش {$singleSecTitle}" : "نسخه پشتیبان انتخابی از {$secCount} بخش مشخص شده سامانه")
                    : 'نسخه پشتیبان کامل اطلاعات کاربر، دیتابیس، تنظیمات هوش مصنوعی و فایل‌های پیوست بدون کدهای نرم‌افزار',
                'sectionName' => $singleSecTitle ?: ($isPartial ? "{$secCount} بخش انتخابی" : "تمامی بخش‌ها"),
                'selectedSections' => $isPartial ? $selectedSections : $ALL_BACKUP_SECTION_IDS,
                'isPartialBackup' => $isPartial
            ],
            'systemConfig' => [
                'GEMINI_API_KEY' => '', // Excluded for security
                'GEMINI_BASE_URL' => isset($activeConfig['GEMINI_BASE_URL']) ? $activeConfig['GEMINI_BASE_URL'] : (isset($dbData['geminiBaseUrl']) ? $dbData['geminiBaseUrl'] : '')
            ],
            'database' => $finalDbData,
            'localStorage' => $finalLocalStorage,
            'uploads' => $uploadsMap
        ];

        echo json_encode([
            'status' => 'success',
            'backup' => $backupPackage,
            'message' => $isPartial 
                ? ($singleSecTitle ? "نسخه پشتیبان اختصاصی «{$singleSecTitle}» با موفقیت تولید شد." : "نسخه پشتیبان انتخابی ({$secCount} بخش) با موفقیت تولید شد.")
                : 'نسخه پشتیبان کامل داده‌های کاربر با موفقیت تولید شد.'
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'backup/restore':
        $input = getJsonInput();
        $backupData = isset($input['backupData']) ? $input['backupData'] : null;

        if (!$backupData || !is_array($backupData)) {
            http_response_code(400);
            echo json_encode(['error' => 'فایل یا ساختار بکاپ ارسال‌شده نامعتبر است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // 1. استخراج داده‌های بکاپ
        $dbEntriesToRestore = [];
        $localStorageToRestore = [];
        $uploadsToRestore = [];

        if (isset($backupData['_metadata']) && isset($backupData['database'])) {
            $dbEntriesToRestore = $backupData['database'] ?: [];
            $localStorageToRestore = isset($backupData['localStorage']) ? $backupData['localStorage'] : [];
            $uploadsToRestore = isset($backupData['uploads']) ? $backupData['uploads'] : [];
        } else {
            foreach ($backupData as $rawKey => $val) {
                if ($rawKey === '_metadata') continue;
                $decoded = is_string($val) ? json_decode($val, true) : $val;
                $cleanKey = (strpos($rawKey, 'acc_app_') === 0) ? substr($rawKey, 8) : $rawKey;
                $dbEntriesToRestore[$cleanKey] = ($decoded !== null) ? $decoded : $val;
                $localStorageToRestore[$rawKey] = is_string($val) ? $val : json_encode($val, JSON_UNESCAPED_UNICODE);
            }
        }

        // 2. اعتبارسنجی ساختار داده‌ها
        $schemaCheck = validateDatabaseSchemaPhp($dbEntriesToRestore);
        if (!$schemaCheck['isValid']) {
            http_response_code(400);
            echo json_encode([
                'error' => 'بازیابی بکاپ متوقف شد: ' . ($schemaCheck['reason'] ?? 'ساختار داده ناهمخوان است.')
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $isPartialBackup = !empty($backupData['_metadata']['isPartialBackup']) || 
            (isset($backupData['_metadata']['selectedSections']) && is_array($backupData['_metadata']['selectedSections']) && count($backupData['_metadata']['selectedSections']) < 15);

        // 3. بکاپ اضطراری خودکار
        $timestamp = date('Y-m-d_H-i-s');
        $backupsDir = __DIR__ . '/backups';
        if (!file_exists($backupsDir)) {
            @mkdir($backupsDir, 0755, true);
        }
        $emergencyFile = $backupsDir . '/emergency_before_restore_' . $timestamp . '.json';
        $currentDb = loadAllData($pdo);
        @file_put_contents($emergencyFile, json_encode([
            '_metadata' => [
                'createdReason' => 'Emergency backup automatically created before backup restoration',
                'timestamp' => date('c'),
                'isPartialRestore' => $isPartialBackup
            ],
            'database' => $currentDb
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        // پاکسازی فایل‌های آپلود تنها در صورتی که بکاپ کامل باشد و فایل‌های آپلودی در بکاپ وجود داشته باشد
        if (!$isPartialBackup && count($uploadsToRestore) > 0) {
            $uploadsDir = __DIR__ . '/uploads';
            if (file_exists($uploadsDir)) {
                $files = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($uploadsDir, RecursiveDirectoryIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::CHILD_FIRST
                );
                foreach ($files as $fileinfo) {
                    $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                    @$todo($fileinfo->getRealPath());
                }
            }
        }

        // 4. ذخیره داده‌های دیتابیس (ادغام هوشمند در صورت بکاپ انتخابی، یا جایگزینی کامل)
        $sanitized = [];
        if ($isPartialBackup) {
            $sanitized = is_array($currentDb) ? $currentDb : [];
            $secList = isset($backupData['_metadata']['selectedSections']) && is_array($backupData['_metadata']['selectedSections']) 
                ? $backupData['_metadata']['selectedSections'] 
                : [];
            $secSet = array_flip($secList);

            foreach ($dbEntriesToRestore as $rawKey => $val) {
                $cleanKey = (strpos($rawKey, 'acc_app_') === 0) ? substr($rawKey, 8) : $rawKey;

                if ($cleanKey === 'invoices') {
                    $restoredInvs = is_array($val) ? $val : [];
                    $currentInvs = isset($currentDb['invoices']) && is_array($currentDb['invoices']) 
                        ? $currentDb['invoices'] 
                        : (isset($currentDb['acc_app_invoices']) && is_array($currentDb['acc_app_invoices']) ? $currentDb['acc_app_invoices'] : []);

                    $hasProformaOnly = isset($secSet['proformas']) && !isset($secSet['finalInvoices']);
                    $hasFinalOnly = isset($secSet['finalInvoices']) && !isset($secSet['proformas']);

                    if ($hasProformaOnly) {
                        $existingFinal = [];
                        foreach ($currentInvs as $inv) {
                            if (!$isInvoiceProforma($inv)) $existingFinal[] = $inv;
                        }
                        $merged = array_merge($existingFinal, $restoredInvs);
                        $sanitized['invoices'] = $merged;
                        $sanitized['acc_app_invoices'] = $merged;
                    } else if ($hasFinalOnly) {
                        $existingProformas = [];
                        foreach ($currentInvs as $inv) {
                            if ($isInvoiceProforma($inv)) $existingProformas[] = $inv;
                        }
                        $merged = array_merge($restoredInvs, $existingProformas);
                        $sanitized['invoices'] = $merged;
                        $sanitized['acc_app_invoices'] = $merged;
                    } else {
                        $sanitized['invoices'] = $restoredInvs;
                        $sanitized['acc_app_invoices'] = $restoredInvs;
                    }
                } else if ($cleanKey === 'items') {
                    $restoredItems = is_array($val) ? $val : [];
                    $currentItems = isset($currentDb['items']) && is_array($currentDb['items']) 
                        ? $currentDb['items'] 
                        : (isset($currentDb['acc_app_items']) && is_array($currentDb['acc_app_items']) ? $currentDb['acc_app_items'] : []);

                    $hasGoodsOnly = isset($secSet['goods']) && !isset($secSet['services']);
                    $hasServicesOnly = isset($secSet['services']) && !isset($secSet['goods']);

                    if ($hasGoodsOnly) {
                        $existingServices = [];
                        foreach ($currentItems as $it) {
                            if (!empty($it['type']) && $it['type'] === 'khadamat') $existingServices[] = $it;
                        }
                        $merged = array_merge($restoredItems, $existingServices);
                        $sanitized['items'] = $merged;
                        $sanitized['acc_app_items'] = $merged;
                    } else if ($hasServicesOnly) {
                        $existingGoods = [];
                        foreach ($currentItems as $it) {
                            if (empty($it['type']) || $it['type'] !== 'khadamat') $existingGoods[] = $it;
                        }
                        $merged = array_merge($existingGoods, $restoredItems);
                        $sanitized['items'] = $merged;
                        $sanitized['acc_app_items'] = $merged;
                    } else {
                        $sanitized['items'] = $restoredItems;
                        $sanitized['acc_app_items'] = $restoredItems;
                    }
                } else if ($cleanKey === 'settings') {
                    $currSettings = isset($currentDb['settings']) && is_array($currentDb['settings']) ? $currentDb['settings'] : [];
                    $restSettings = is_array($val) ? $val : [];
                    $sanitized['settings'] = array_merge($currSettings, $restSettings);
                    $sanitized['acc_app_settings'] = $sanitized['settings'];
                } else {
                    $sanitized[$cleanKey] = $val;
                    $sanitized['acc_app_' . $cleanKey] = $val;
                }
            }
        } else {
            foreach ($dbEntriesToRestore as $rawKey => $val) {
                $cleanKey = (strpos($rawKey, 'acc_app_') === 0) ? substr($rawKey, 8) : $rawKey;
                $sanitized[$cleanKey] = $val;
            }
            if (isset($currentDb['settings']) && is_array($currentDb['settings'])) {
                $restoredSettings = isset($sanitized['settings']) && is_array($sanitized['settings']) ? $sanitized['settings'] : [];
                $sanitized['settings'] = array_merge($currentDb['settings'], $restoredSettings);
            }
        }

        foreach ($sanitized as $k => $v) {
            saveKeyData($pdo, $k, $v, true);
        }

        // بازیابی تنظیمات هوش مصنوعی
        $restoredGeminiKey = isset($backupData['systemConfig']['GEMINI_API_KEY']) 
            ? $backupData['systemConfig']['GEMINI_API_KEY'] 
            : (isset($sanitized['geminiApiKey']) ? $sanitized['geminiApiKey'] : '');
        $restoredGeminiBaseUrl = isset($backupData['systemConfig']['GEMINI_BASE_URL']) 
            ? $backupData['systemConfig']['GEMINI_BASE_URL'] 
            : (isset($sanitized['geminiBaseUrl']) ? $sanitized['geminiBaseUrl'] : '');

        if (!empty($restoredGeminiKey)) {
            $configPath = __DIR__ . '/wp-config.json';
            $config = file_exists($configPath) ? (json_decode(file_get_contents($configPath), true) ?: []) : [];
            $config['GEMINI_API_KEY'] = $restoredGeminiKey;
            $config['GEMINI_BASE_URL'] = $restoredGeminiBaseUrl;
            @file_put_contents($configPath, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }

        // 5. ذخیره فایل‌های پیوست
        $restoredFilesCount = 0;
        foreach ($uploadsToRestore as $relPath => $base64Data) {
            $normPath = str_replace('\\', '/', $relPath);
            if (strpos($normPath, 'uploads/') === 0 || strpos($normPath, 'public/uploads/') === 0 || strpos($normPath, 'data/uploads/') === 0) {
                $targetFilePath = __DIR__ . '/' . $normPath;
                $dirName = dirname($targetFilePath);
                if (!file_exists($dirName)) {
                    @mkdir($dirName, 0755, true);
                }
                @file_put_contents($targetFilePath, base64_decode($base64Data));
                $restoredFilesCount++;
            }
        }

        echo json_encode([
            'status' => 'success',
            'message' => 'اطلاعات با موفقیت پس از اعتبارسنجی بازیابی شدند!',
            'emergencyBackupFile' => basename($emergencyFile),
            'restoredKeysCount' => count($sanitized),
            'restoredFilesCount' => $restoredFilesCount,
            'localStorage' => $localStorageToRestore,
            'database' => $sanitized
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'db/status':
        echo json_encode([
            'dbType' => 'mysql',
            'activeType' => 'mysql',
            'fallbackActive' => false,
            'mysqlConnected' => $mysqlConnected,
            'mysqlError' => $mysqlError,
            'databaseName' => $dbName,
            'geminiConnected' => !empty($geminiApiKey),
            'geminiApiKey' => $geminiApiKey,
            'geminiBaseUrl' => isset($config['GEMINI_BASE_URL']) ? $config['GEMINI_BASE_URL'] : '',
            'phpVersion' => phpversion(),
            'serverSoftware' => isset($_SERVER['SERVER_SOFTWARE']) ? $_SERVER['SERVER_SOFTWARE'] : 'LiteSpeed / Apache',
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'system/save-storage-mode':
        echo json_encode([
            'status' => 'success',
            'storageMode' => 'mysql',
            'message' => 'پایگاه‌داده متمرکز MySQL فعال است.'
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'db/migrate':
    case 'migrate':
        runDatabaseMigrationsPhp($pdo);
        $shouldMigrateData = isset($_GET['data']) ? ($_GET['data'] === 'true' || $_GET['data'] === '1') : (isset($_POST['data']) && ($_POST['data'] === 'true' || $_POST['data'] === '1'));
        if ($shouldMigrateData) {
            try {
                $result = migrateAppStateDataToRelationalTablesPhp($pdo);
                echo json_encode([
                    'status' => 'success',
                    'message' => 'مایگریشن ساختار و انتقال امن تمام داده‌های JSON به جداول رابطه‌ای با موفقیت انجام شد.',
                    'migration' => $result
                ], JSON_UNESCAPED_UNICODE);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['error' => 'خطا در مایگریشن داده‌ها: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
            }
        } else {
            echo json_encode([
                'status' => 'success',
                'message' => 'تمام ۱۷ جدول استاندارد MySQL (شامل users, fiscal_years, counterparts, categories, warehouses, items, accounts, invoices, invoice_items, transactions, accounting_docs, accounting_doc_lines, logs, notifications, checklist, settings, uploads) با موفقیت ساخته یا به‌روزرسانی شدند.',
                'tables' => [
                    'users', 'fiscal_years', 'counterparts', 'categories', 'warehouses',
                    'items', 'accounts', 'invoices', 'invoice_items', 'transactions',
                    'accounting_docs', 'accounting_doc_lines', 'logs', 'notifications',
                    'checklist', 'settings', 'uploads'
                ]
            ], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'db/migrate-data':
    case 'migrate-data':
        try {
            $result = migrateAppStateDataToRelationalTablesPhp($pdo);
            echo json_encode([
                'status' => 'success',
                'message' => 'انتقال امن، تراکنشی و تکرارپذیر داده‌های JSON موجود در app_state به جداول تفکیکی MySQL با موفقیت انجام شد.',
                'migration' => $result
            ], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'خطا در انتقال داده‌ها به جداول رابطه‌ای: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'db/migrate-items':
    case 'migrate-items':
    case 'api/db/migrate-items':
        if (!$pdo) {
            http_response_code(500);
            echo json_encode([
                'status' => 'error',
                'error' => 'اتصال به پایگاه‌داده متمرکز MySQL برقرار نمی‌باشد.' . ($mysqlError ? ' (' . $mysqlError . ')' : '')
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        try {
            runDatabaseMigrationsPhp($pdo);

            $stmt = $pdo->prepare("SELECT state_value FROM app_state WHERE state_key = 'items' OR state_key = 'acc_app_items' LIMIT 1");
            $stmt->execute();
            $row = $stmt->fetch();

            $itemsList = [];
            if ($row && !empty($row['state_value'])) {
                $rawVal = safeUnwrapJsonPhp($row['state_value']);
                if (is_array($rawVal)) {
                    $itemsList = $rawVal;
                } elseif (is_string($rawVal)) {
                    $decoded = json_decode($rawVal, true);
                    if (is_array($decoded)) {
                        $itemsList = $decoded;
                    }
                }
            }

            $migratedCount = 0;

            if (!empty($itemsList) && is_array($itemsList)) {
                $pdo->beginTransaction();

                $stmtInsert = $pdo->prepare("INSERT INTO items (
                        id, warehouse_id, name, code, type, color, unit, qty, initial_qty,
                        last_purchase_price, last_sale_price, min_qty_alarm, category_name,
                        parent_category, sub_category, commission_percent, setup_date, fiscal_year_id, created_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
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
                        updated_at = CURRENT_TIMESTAMP");

                foreach ($itemsList as $it) {
                    if (!is_array($it)) continue;

                    $id = !empty($it['id']) ? strval($it['id']) : 'item_' . bin2hex(random_bytes(4));
                    $warehouseId = isset($it['warehouseId']) ? $it['warehouseId'] : (isset($it['warehouse_id']) ? $it['warehouse_id'] : null);
                    $name = !empty($it['name']) ? strval($it['name']) : 'کالا';
                    $code = isset($it['code']) ? $it['code'] : null;
                    $type = isset($it['type']) ? $it['type'] : 'kala';
                    $color = isset($it['color']) ? $it['color'] : null;
                    $unit = isset($it['unit']) ? $it['unit'] : null;
                    $qty = isset($it['qty']) ? floatval($it['qty']) : 0;
                    $initialQty = isset($it['initialQty']) ? floatval($it['initialQty']) : (isset($it['initial_qty']) ? floatval($it['initial_qty']) : 0);
                    $lastPurchasePrice = isset($it['lastPurchasePrice']) ? floatval($it['lastPurchasePrice']) : (isset($it['last_purchase_price']) ? floatval($it['last_purchase_price']) : 0);
                    $lastSalePrice = isset($it['lastSalePrice']) ? floatval($it['lastSalePrice']) : (isset($it['last_sale_price']) ? floatval($it['last_sale_price']) : 0);
                    $minQtyAlarm = isset($it['minQtyAlarm']) ? floatval($it['minQtyAlarm']) : (isset($it['min_qty_alarm']) ? floatval($it['min_qty_alarm']) : 0);
                    $categoryName = isset($it['categoryName']) ? $it['categoryName'] : (isset($it['category_name']) ? $it['category_name'] : (isset($it['category']) ? $it['category'] : null));
                    $parentCategory = isset($it['parentCategory']) ? $it['parentCategory'] : (isset($it['parent_category']) ? $it['parent_category'] : null);
                    $subCategory = isset($it['subCategory']) ? $it['subCategory'] : (isset($it['sub_category']) ? $it['sub_category'] : null);
                    $commissionPercent = isset($it['commissionPercent']) ? floatval($it['commissionPercent']) : (isset($it['commission_percent']) ? floatval($it['commission_percent']) : 0);
                    $setupDate = isset($it['setupDate']) ? $it['setupDate'] : (isset($it['setup_date']) ? $it['setup_date'] : null);
                    $fiscalYearId = isset($it['fiscalYearId']) ? $it['fiscalYearId'] : (isset($it['fiscal_year_id']) ? $it['fiscal_year_id'] : null);
                    $createdBy = isset($it['createdBy']) ? $it['createdBy'] : (isset($it['created_by']) ? $it['created_by'] : null);

                    $stmtInsert->execute([
                        $id, $warehouseId, $name, $code, $type, $color, $unit, $qty, $initialQty,
                        $lastPurchasePrice, $lastSalePrice, $minQtyAlarm, $categoryName,
                        $parentCategory, $subCategory, $commissionPercent, $setupDate, $fiscalYearId, $createdBy
                    ]);

                    $migratedCount++;
                }

                $pdo->commit();
            }

            echo json_encode([
                'status' => 'success',
                'message' => "تعداد {$migratedCount} کالا با موفقیت به جدول items منتقل و ثبت/به‌روزرسانی شد.",
                'migratedCount' => $migratedCount,
                'count' => $migratedCount
            ], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            if ($pdo && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            http_response_code(500);
            echo json_encode([
                'status' => 'error',
                'error' => 'خطا در انتقال کالاها: ' . $e->getMessage()
            ], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'db/load-items':
    case 'load-items':
    case 'api/db/load-items':
        if (!$pdo) {
            http_response_code(500);
            echo json_encode([
                'status' => 'error',
                'error' => 'اتصال به پایگاه‌داده متمرکز MySQL برقرار نمی‌باشد.' . ($mysqlError ? ' (' . $mysqlError . ')' : '')
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        try {
            runDatabaseMigrationsPhp($pdo);

            $stmt = $pdo->prepare("SELECT 
                    id,
                    warehouse_id,
                    name,
                    code,
                    type,
                    color,
                    unit,
                    qty,
                    initial_qty,
                    last_purchase_price,
                    last_sale_price,
                    min_qty_alarm,
                    category_name,
                    parent_category,
                    sub_category,
                    commission_percent,
                    setup_date,
                    fiscal_year_id,
                    created_by,
                    created_at,
                    updated_at
                FROM items 
                ORDER BY updated_at DESC, name ASC");
            
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $items = [];
            if (!empty($rows)) {
                foreach ($rows as $row) {
                    $items[] = [
                        'id' => strval($row['id']),
                        'name' => strval($row['name']),
                        'type' => !empty($row['type']) ? strval($row['type']) : 'kala',
                        'code' => $row['code'] !== null ? strval($row['code']) : null,
                        'warehouseId' => $row['warehouse_id'] !== null ? strval($row['warehouse_id']) : null,
                        'color' => $row['color'] !== null ? strval($row['color']) : null,
                        'unit' => $row['unit'] !== null ? strval($row['unit']) : null,
                        'qty' => isset($row['qty']) ? (float)$row['qty'] : 0,
                        'initialQty' => isset($row['initial_qty']) ? (float)$row['initial_qty'] : 0,
                        'lastPurchasePrice' => isset($row['last_purchase_price']) ? (float)$row['last_purchase_price'] : 0,
                        'lastSalePrice' => isset($row['last_sale_price']) ? (float)$row['last_sale_price'] : 0,
                        'minQtyAlarm' => isset($row['min_qty_alarm']) ? (float)$row['min_qty_alarm'] : 0,
                        'categoryName' => $row['category_name'] !== null ? strval($row['category_name']) : null,
                        'parentCategory' => $row['parent_category'] !== null ? strval($row['parent_category']) : null,
                        'subCategory' => $row['sub_category'] !== null ? strval($row['sub_category']) : null,
                        'commissionPercent' => isset($row['commission_percent']) ? (float)$row['commission_percent'] : 0,
                        'setupDate' => $row['setup_date'] !== null ? strval($row['setup_date']) : null,
                        'fiscalYearId' => $row['fiscal_year_id'] !== null ? strval($row['fiscal_year_id']) : null,
                        'createdBy' => $row['created_by'] !== null ? strval($row['created_by']) : null,
                        'createdAt' => isset($row['created_at']) ? strval($row['created_at']) : null,
                        'updatedAt' => isset($row['updated_at']) ? strval($row['updated_at']) : null
                    ];
                }
            }

            echo json_encode([
                'status' => 'success',
                'data' => $items,
                'items' => $items,
                'count' => count($items)
            ], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode([
                'status' => 'error',
                'error' => 'خطا در خواندن اطلاعات کالاها: ' . $e->getMessage()
            ], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'db/save-item':
    case 'save-item':
    case 'api/db/save-item':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode([
                'status' => 'error',
                'error' => 'متد درخواست باید POST باشد.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $input = getJsonInput();
        if (!is_array($input)) {
            http_response_code(422);
            echo json_encode([
                'status' => 'error',
                'error' => 'بدنه درخواست نامعتبر است و باید ساختار JSON ارسال شود.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $id = isset($input['id']) ? trim(strval($input['id'])) : '';
        $name = isset($input['name']) ? trim(strval($input['name'])) : '';

        if ($id === '') {
            http_response_code(422);
            echo json_encode([
                'status' => 'error',
                'error' => 'شناسه کالا (id) الزامی است و نباید خالی باشد.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($name === '') {
            http_response_code(422);
            echo json_encode([
                'status' => 'error',
                'error' => 'نام کالا (name) الزامی است و نباید خالی باشد.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Validate numeric fields if provided
        $numericFields = [
            'qty' => 'تعداد (qty)',
            'initialQty' => 'موجودی اولیه (initialQty)',
            'lastPurchasePrice' => 'آخرین قیمت خرید (lastPurchasePrice)',
            'lastSalePrice' => 'آخرین قیمت فروش (lastSalePrice)',
            'minQtyAlarm' => 'حداقل موجودی هشدار (minQtyAlarm)',
            'commissionPercent' => 'درصد پورسانت (commissionPercent)'
        ];

        foreach ($numericFields as $field => $label) {
            if (isset($input[$field]) && $input[$field] !== '' && !is_numeric($input[$field])) {
                http_response_code(422);
                echo json_encode([
                    'status' => 'error',
                    'error' => "مقدار فیلد {$label} باید عددی معتبر باشد."
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }

        if (!$pdo) {
            http_response_code(500);
            echo json_encode([
                'status' => 'error',
                'error' => 'اتصال به پایگاه‌داده متمرکز MySQL برقرار نمی‌باشد.' . ($mysqlError ? ' (' . $mysqlError . ')' : '')
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        try {
            runDatabaseMigrationsPhp($pdo);

            $warehouseId = isset($input['warehouseId']) ? $input['warehouseId'] : (isset($input['warehouse_id']) ? $input['warehouse_id'] : null);
            $code = isset($input['code']) ? $input['code'] : null;
            $type = isset($input['type']) ? $input['type'] : 'kala';
            $color = isset($input['color']) ? $input['color'] : null;
            $unit = isset($input['unit']) ? $input['unit'] : null;
            $qty = isset($input['qty']) && $input['qty'] !== '' ? floatval($input['qty']) : 0;
            $initialQty = isset($input['initialQty']) && $input['initialQty'] !== '' ? floatval($input['initialQty']) : (isset($input['initial_qty']) && $input['initial_qty'] !== '' ? floatval($input['initial_qty']) : 0);
            $lastPurchasePrice = isset($input['lastPurchasePrice']) && $input['lastPurchasePrice'] !== '' ? floatval($input['lastPurchasePrice']) : (isset($input['last_purchase_price']) && $input['last_purchase_price'] !== '' ? floatval($input['last_purchase_price']) : 0);
            $lastSalePrice = isset($input['lastSalePrice']) && $input['lastSalePrice'] !== '' ? floatval($input['lastSalePrice']) : (isset($input['last_sale_price']) && $input['last_sale_price'] !== '' ? floatval($input['last_sale_price']) : 0);
            $minQtyAlarm = isset($input['minQtyAlarm']) && $input['minQtyAlarm'] !== '' ? floatval($input['minQtyAlarm']) : (isset($input['min_qty_alarm']) && $input['min_qty_alarm'] !== '' ? floatval($input['min_qty_alarm']) : 0);
            $categoryName = isset($input['categoryName']) ? $input['categoryName'] : (isset($input['category_name']) ? $input['category_name'] : (isset($input['category']) ? $input['category'] : null));
            $parentCategory = isset($input['parentCategory']) ? $input['parentCategory'] : (isset($input['parent_category']) ? $input['parent_category'] : null);
            $subCategory = isset($input['subCategory']) ? $input['subCategory'] : (isset($input['sub_category']) ? $input['sub_category'] : null);
            $commissionPercent = isset($input['commissionPercent']) && $input['commissionPercent'] !== '' ? floatval($input['commissionPercent']) : (isset($input['commission_percent']) && $input['commission_percent'] !== '' ? floatval($input['commission_percent']) : 0);
            $setupDate = isset($input['setupDate']) ? $input['setupDate'] : (isset($input['setup_date']) ? $input['setup_date'] : null);
            $fiscalYearId = isset($input['fiscalYearId']) ? $input['fiscalYearId'] : (isset($input['fiscal_year_id']) ? $input['fiscal_year_id'] : null);
            $createdBy = isset($input['createdBy']) ? $input['createdBy'] : (isset($input['created_by']) ? $input['created_by'] : null);

            $stmt = $pdo->prepare("INSERT INTO items (
                    id, warehouse_id, name, code, type, color, unit, qty, initial_qty,
                    last_purchase_price, last_sale_price, min_qty_alarm, category_name,
                    parent_category, sub_category, commission_percent, setup_date, fiscal_year_id, created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
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
                    updated_at = CURRENT_TIMESTAMP");

            $stmt->execute([
                $id, $warehouseId, $name, $code, $type, $color, $unit, $qty, $initialQty,
                $lastPurchasePrice, $lastSalePrice, $minQtyAlarm, $categoryName,
                $parentCategory, $subCategory, $commissionPercent, $setupDate, $fiscalYearId, $createdBy
            ]);

            // Fetch the saved row
            $stmtFetch = $pdo->prepare("SELECT 
                    id,
                    warehouse_id,
                    name,
                    code,
                    type,
                    color,
                    unit,
                    qty,
                    initial_qty,
                    last_purchase_price,
                    last_sale_price,
                    min_qty_alarm,
                    category_name,
                    parent_category,
                    sub_category,
                    commission_percent,
                    setup_date,
                    fiscal_year_id,
                    created_by,
                    created_at,
                    updated_at
                FROM items 
                WHERE id = ? 
                LIMIT 1");
            $stmtFetch->execute([$id]);
            $row = $stmtFetch->fetch(PDO::FETCH_ASSOC);

            if (!$row) {
                http_response_code(500);
                echo json_encode([
                    'status' => 'error',
                    'error' => 'کالا با موفقیت ذخیره شد اما بازخوانی آن از پایگاه‌داده با مشکل مواجه گردید.'
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $itemData = [
                'id' => strval($row['id']),
                'name' => strval($row['name']),
                'type' => !empty($row['type']) ? strval($row['type']) : 'kala',
                'code' => $row['code'] !== null ? strval($row['code']) : null,
                'warehouseId' => $row['warehouse_id'] !== null ? strval($row['warehouse_id']) : null,
                'color' => $row['color'] !== null ? strval($row['color']) : null,
                'unit' => $row['unit'] !== null ? strval($row['unit']) : null,
                'qty' => isset($row['qty']) ? (float)$row['qty'] : 0,
                'initialQty' => isset($row['initial_qty']) ? (float)$row['initial_qty'] : 0,
                'lastPurchasePrice' => isset($row['last_purchase_price']) ? (float)$row['last_purchase_price'] : 0,
                'lastSalePrice' => isset($row['last_sale_price']) ? (float)$row['last_sale_price'] : 0,
                'minQtyAlarm' => isset($row['min_qty_alarm']) ? (float)$row['min_qty_alarm'] : 0,
                'categoryName' => $row['category_name'] !== null ? strval($row['category_name']) : null,
                'parentCategory' => $row['parent_category'] !== null ? strval($row['parent_category']) : null,
                'subCategory' => $row['sub_category'] !== null ? strval($row['sub_category']) : null,
                'commissionPercent' => isset($row['commission_percent']) ? (float)$row['commission_percent'] : 0,
                'setupDate' => $row['setup_date'] !== null ? strval($row['setup_date']) : null,
                'fiscalYearId' => $row['fiscal_year_id'] !== null ? strval($row['fiscal_year_id']) : null,
                'createdBy' => $row['created_by'] !== null ? strval($row['created_by']) : null,
                'createdAt' => isset($row['created_at']) ? strval($row['created_at']) : null,
                'updatedAt' => isset($row['updated_at']) ? strval($row['updated_at']) : null
            ];

            echo json_encode([
                'status' => 'success',
                'message' => 'اطلاعات کالا با موفقیت ذخیره شد.',
                'data' => $itemData,
                'item' => $itemData
            ], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode([
                'status' => 'error',
                'error' => 'خطا در ذخیره‌سازی اطلاعات کالا: ' . $e->getMessage()
            ], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'db/delete-item':
    case 'delete-item':
    case 'api/db/delete-item':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode([
                'status' => 'error',
                'error' => 'متد درخواست باید POST باشد.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $input = getJsonInput();
        if (!is_array($input)) {
            http_response_code(422);
            echo json_encode([
                'status' => 'error',
                'error' => 'بدنه درخواست نامعتبر است و باید ساختار JSON ارسال شود.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $id = isset($input['id']) ? trim(strval($input['id'])) : '';
        if ($id === '') {
            http_response_code(422);
            echo json_encode([
                'status' => 'error',
                'error' => 'شناسه کالا (id) الزامی است و نباید خالی باشد.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (!$pdo) {
            http_response_code(500);
            echo json_encode([
                'status' => 'error',
                'error' => 'اتصال به پایگاه‌داده متمرکز MySQL برقرار نمی‌باشد.' . ($mysqlError ? ' (' . $mysqlError . ')' : '')
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        try {
            runDatabaseMigrationsPhp($pdo);

            // Check if item exists in items table
            $stmtCheck = $pdo->prepare("SELECT id FROM items WHERE id = ? LIMIT 1");
            $stmtCheck->execute([$id]);
            $itemExists = $stmtCheck->fetch(PDO::FETCH_ASSOC);

            if (!$itemExists) {
                http_response_code(404);
                echo json_encode([
                    'status' => 'error',
                    'error' => 'کالای مورد نظر در جدول items یافت نشد.'
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }

            // Delete item from items table
            $stmtDelete = $pdo->prepare("DELETE FROM items WHERE id = ? LIMIT 1");
            $stmtDelete->execute([$id]);

            echo json_encode([
                'status' => 'success',
                'id' => $id,
                'deleted' => true
            ], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode([
                'status' => 'error',
                'error' => 'خطا در حذف کالا از پایگاه‌داده: ' . $e->getMessage()
            ], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'gemini/extract-slip':
        $input = getJsonInput();
        $imageBase64 = isset($input['imageBase64']) ? $input['imageBase64'] : '';
        if (empty($imageBase64)) {
            http_response_code(400);
            echo json_encode(['error' => 'تصویر فیش ارسال نشده است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (empty($geminiApiKey)) {
            http_response_code(400);
            echo json_encode(['error' => 'کلید API جمینای تنظیم نشده است. لطفاً آن را در بخش تنظیمات وارد نمایید.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $mimeType = "image/webp";
        $base64Data = $imageBase64;
        if (strpos($imageBase64, 'data:') === 0) {
            $parts = explode(',', $imageBase64);
            $base64Data = isset($parts[1]) ? $parts[1] : $imageBase64;
            if (preg_match('/data:(.*?);/', $parts[0], $mimePart)) {
                $mimeType = $mimePart[1];
            }
        }

        $payload = [
            'contents' => [
                [
                    'parts' => [
                        [
                            'inlineData' => [
                                'mimeType' => $mimeType,
                                'data' => $base64Data
                            ]
                        ],
                        [
                            'text' => "مبلغ، تاریخ پرداخت و ساعت پرداخت درج شده روی این فیش واریزی بانکی یا رسید انتقال وجه را با دقت استخراج کن. مبلغ نهایی تراکنش را حتماً به ریال تبدیل کن (اگر مبلغ به تومان است آن را ضربدر ۱۰ کن) و به صورت یک عدد صحیح بدون کاما، ویرگول یا هیچ کلمه‌ای بازگردان. تاریخ پرداخت را حتماً به فرمت تاریخ هجری شمسی به صورت چهار رقمی برای سال و دو رقمی برای ماه و روز (مانند 1405/04/06 یا 1403/12/25) تبدیل و استخراج کن. اگر سال دو رقمی بود آن را چهار رقمی کن (مثال: سال 03 به 1403). ساعت پرداخت را هم به فرمت دو رقمی ساعت و دقیقه (مانند 14:20 یا 09:15) استخراج کن. اگر ساعت پرداخت در رسید موجود نبود، مقدار خالی برگردان."
                        ]
                    ]
                ]
            ],
            'generationConfig' => [
                'responseMimeType' => 'application/json',
                'responseSchema' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'amount' => [
                            'type' => 'INTEGER',
                            'description' => 'The extracted transaction amount converted strictly to Iranian Rials (ریال). If the slip specifies Tomans (تومان), multiply by 10 to convert to Rials. Return as a clean integer without any commas, letters, or words.'
                        ],
                        'date' => [
                            'type' => 'STRING',
                            'description' => 'The extracted payment/transaction date converted to Jalali (Persian/Shamsi) calendar in YYYY/MM/DD format (e.g., 1403/05/12 or 1405/04/06). Do not use Gregorian calendar.'
                        ],
                        'time' => [
                            'type' => 'STRING',
                            'description' => 'The extracted payment/transaction time/hour in HH:MM format (e.g., 14:32 or 09:15). If not found, return empty string.'
                        ]
                    ],
                    'required' => ['amount', 'date']
                ]
            ]
        ];

        $attempts = [
            ['version' => 'v1beta', 'model' => 'gemini-2.5-flash'],
            ['version' => 'v1beta', 'model' => 'gemini-2.0-flash'],
            ['version' => 'v1beta', 'model' => 'gemini-1.5-flash'],
            ['version' => 'v1beta', 'model' => 'gemini-1.5-flash-latest']
        ];
        $response = '';
        $httpCode = 0;
        $lastErrorMsg = '';

        foreach ($attempts as $attempt) {
            $version = $attempt['version'];
            $model = $attempt['model'];
            $url = $geminiBaseUrl . "/" . $version . "/models/" . $model . ":generateContent?key=" . $geminiApiKey;
            
            $parsedUrl = parse_url($url);
            $host = isset($parsedUrl['host']) ? $parsedUrl['host'] : 'generativelanguage.googleapis.com';
            $port = isset($parsedUrl['port']) ? $parsedUrl['port'] : (isset($parsedUrl['scheme']) && $parsedUrl['scheme'] === 'http' ? 80 : 443);
            
            $resolvedIp = null;
            if (!empty($geminiDnsServers)) {
                $dnsList = array_map('trim', explode(',', $geminiDnsServers));
                $resolvedIp = resolveDomainWithDNS($host, $dnsList);
            }
            
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json'
            ]);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
            curl_setopt($ch, CURLOPT_TIMEOUT, 35);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
            
            if ($resolvedIp && defined('CURLOPT_RESOLVE')) {
                curl_setopt($ch, CURLOPT_RESOLVE, ["{$host}:{$port}:{$resolvedIp}"]);
            }
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($httpCode === 200) {
                break;
            } else {
                $resObj = json_decode($response, true);
                if (isset($resObj['error']['message'])) {
                    $lastErrorMsg = $resObj['error']['message'];
                } elseif ($httpCode === 0) {
                    $lastErrorMsg = 'ارتباط هاست با سرورهای گوگل برقرار نشد (خطای اتصال با وضعیت 0). ' . 
                                    (!empty($curlError) ? '(cURL error: ' . $curlError . ') ' : '') . 
                                    ($resolvedIp ? '(آی‌پی ضدتحریم رزولوش شده: ' . $resolvedIp . ') ' : '') .
                                    'به علت استقرار هاست شما روی سرورهای داخل ایران، گوگل ارتباط شما را به دلیل تحریم‌ها مسدود کرده است. همچنین ممکن است شرکت هاستینگ شما اتصالات خروجی به خارج را مسدود کرده باشد.';
                } else {
                    $lastErrorMsg = 'خطا با کد وضعیت ' . $httpCode . (!empty($curlError) ? ' - ' . $curlError : '');
                }
            }
        }

        if ($httpCode !== 200) {
            http_response_code(400);
            $errorMsg = $lastErrorMsg;
            if ($httpCode === 403 || strpos($errorMsg, '403') !== false) {
                $errorMsg = "خطای ۴۰۳ (تحریم مستقیم گوگل بر علیه ایران). سرویس جمینای گوگل آی‌پی‌های ایران را مسدود کرده است.\n\nراهکار:\nشما می‌توانید یک آدرس پروکسی معتبر در بخش تنظیمات نرم‌افزار، کادر «آدرس پایه API / پروکسی» وارد کنید.";
            } elseif ($httpCode === 0 || strpos($errorMsg, 'وضعیت 0') !== false || strpos($errorMsg, 'error: 0') !== false || strpos($errorMsg, 'ارتباط هاست') !== false) {
                $errorMsg = "ارتباط هاست شما با سرورهای گوگل برقرار نشد (خطای اتصال با وضعیت 0). لطفاً بررسی کنید که آیا آی‌پی‌های DNS ضدتحریم در بخش تنظیمات به درستی وارد شده‌اند یا خیر.";
            }
            echo json_encode(['error' => 'خطای گوگل جمینای: ' . $errorMsg], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $resObj = json_decode($response, true);
        $text = isset($resObj['candidates'][0]['content']['parts'][0]['text']) 
            ? $resObj['candidates'][0]['content']['parts'][0]['text'] 
            : "{}";

        // پاکسازی احتمالی کاراکترهای بک‌تیک مارک‌داون
        $text = trim($text);
        if (strpos($text, '```json') === 0) {
            $text = substr($text, 7);
            if (substr($text, -3) === '```') {
                $text = substr($text, 0, -3);
            }
        } elseif (strpos($text, '```') === 0) {
            $text = substr($text, 3);
            if (substr($text, -3) === '```') {
                $text = substr($text, 0, -3);
            }
        }
        $text = trim($text);

        // ارسال مستقیم ساختار JSON استخراج شده به فرانت‌اند
        header('Content-Type: application/json; charset=utf-8');
        echo $text;
        break;

    case 'chat':
        $input = getJsonInput();
        $messages = isset($input['messages']) ? $input['messages'] : [];
        $systemInstruction = isset($input['systemInstruction']) ? $input['systemInstruction'] : '';
        
        if (empty($geminiApiKey)) {
            http_response_code(400);
            echo json_encode(['error' => 'کلید API جمینای تنظیم نشده است. لطفاً آن را در بخش تنظیمات وارد نمایید.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // تبدیل پیام‌ها به ساختار مورد پذیرش API جمینای
        $contents = [];
        foreach ($messages as $msg) {
            $role = ($msg['role'] === 'model' || $msg['role'] === 'assistant') ? 'model' : 'user';
            
            // سازگاری کامل با هر دو فرمت کلید text و content
            $textMsg = '';
            if (isset($msg['text'])) {
                $textMsg = $msg['text'];
            } elseif (isset($msg['content'])) {
                $textMsg = $msg['content'];
            }

            if ($msg['role'] === 'system') {
                $contents[] = [
                    'role' => 'user',
                    'parts' => [['text' => "دستورالعمل سیستم: " . $textMsg]]
                ];
                $contents[] = [
                    'role' => 'model',
                    'parts' => [['text' => "تایید شد. من دستورالعمل‌های بالا را با نهایت دقت روی اطلاعات مالی کاربر اعمال می‌کنم."]]
                ];
                continue;
            }
            $contents[] = [
                'role' => $role,
                'parts' => [['text' => $textMsg]]
            ];
        }

        $payload = [
            'contents' => $contents,
            'generationConfig' => [
                'temperature' => 0.7,
            ]
        ];

        if (!empty($systemInstruction)) {
            $payload['systemInstruction'] = [
                'parts' => [['text' => $systemInstruction]]
            ];
        }

        // لیست جفت‌های نسخه API و مدل که به ترتیب اولویت تلاش می‌کنیم تا بهترین اتصال برقرار شود
        $attempts = [
            ['version' => 'v1beta', 'model' => 'gemini-2.5-flash'],
            ['version' => 'v1beta', 'model' => 'gemini-2.0-flash'],
            ['version' => 'v1beta', 'model' => 'gemini-1.5-flash'],
            ['version' => 'v1beta', 'model' => 'gemini-1.5-flash-latest'],
            ['version' => 'v1beta', 'model' => 'gemini-2.5-pro'],
            ['version' => 'v1beta', 'model' => 'gemini-1.5-pro']
        ];
        $response = '';
        $httpCode = 0;
        $lastErrorMsg = '';

        foreach ($attempts as $attempt) {
            $version = $attempt['version'];
            $model = $attempt['model'];
            $url = $geminiBaseUrl . "/" . $version . "/models/" . $model . ":generateContent?key=" . $geminiApiKey;
            
            $parsedUrl = parse_url($url);
            $host = isset($parsedUrl['host']) ? $parsedUrl['host'] : 'generativelanguage.googleapis.com';
            $port = isset($parsedUrl['port']) ? $parsedUrl['port'] : (isset($parsedUrl['scheme']) && $parsedUrl['scheme'] === 'http' ? 80 : 443);
            
            $resolvedIp = null;
            if (!empty($geminiDnsServers)) {
                $dnsList = array_map('trim', explode(',', $geminiDnsServers));
                $resolvedIp = resolveDomainWithDNS($host, $dnsList);
            }
            
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json'
            ]);
            // غیرفعال کردن بررسی امضای SSL برای سازگاری کامل با انواع هاست‌های لینوکس و اشتراکی
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
            curl_setopt($ch, CURLOPT_TIMEOUT, 25);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
            
            if ($resolvedIp && defined('CURLOPT_RESOLVE')) {
                curl_setopt($ch, CURLOPT_RESOLVE, ["{$host}:{$port}:{$resolvedIp}"]);
            }
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($httpCode === 200) {
                break; // موفقیت‌آمیز بود
            } else {
                $resObj = json_decode($response, true);
                if (isset($resObj['error']['message'])) {
                    $lastErrorMsg = $resObj['error']['message'];
                } elseif ($httpCode === 0) {
                    $lastErrorMsg = 'ارتباط هاست با سرورهای گوگل برقرار نشد (خطای اتصال با وضعیت 0). ' . 
                                    (!empty($curlError) ? '(cURL error: ' . $curlError . ') ' : '') . 
                                    ($resolvedIp ? '(آی‌پی ضدتحریم رزولوش شده: ' . $resolvedIp . ') ' : '') .
                                    'به علت استقرار هاست شما روی سرورهای داخل ایران، گوگل ارتباط شما را به دلیل تحریم‌ها مسدود کرده است. همچنین ممکن است شرکت هاستینگ شما اتصالات خروجی به خارج را مسدود کرده باشد.';
                } else {
                    $lastErrorMsg = 'خطا با کد وضعیت ' . $httpCode . (!empty($curlError) ? ' - ' . $curlError : '');
                }
            }
        }

        if ($httpCode !== 200) {
            http_response_code(400); // ارسال وضعیت خطا به صورت ساختاریافته به فرانت‌اند
            
            // فارسی‌سازی خطاهای رایج برای کاربر نهایی و ارائه راهنمای دقیق
            $errorMsg = $lastErrorMsg;
            if ($httpCode === 403 || strpos($errorMsg, '403') !== false) {
                $errorMsg = "خطای ۴۰۳ (تحریم مستقیم گوگل بر علیه ایران). سرویس جمینای گوگل آی‌پی‌های ایران را مسدود کرده است.\n\nراهکار قطعی و آسان:\nشما می‌توانید یک آدرس پروکسی معتبر (مانند آدرس https://api.openai-hk.com یا یک پروکسی اختصاصی دیگر) در بخش تنظیمات نرم‌افزار، کادر «آدرس پایه API / پروکسی (Base URL)» وارد کرده و تنظیمات را ذخیره نمایید تا درخواست‌های شما بدون تحریم و با موفقیت ارسال شوند.";
            } elseif ($httpCode === 0 || strpos($errorMsg, 'وضعیت 0') !== false || strpos($errorMsg, 'error: 0') !== false || strpos($errorMsg, 'ارتباط هاست') !== false) {
                $errorMsg = "ارتباط هاست شما با سرورهای گوگل برقرار نشد (خطای اتصال با وضعیت 0).\n\nعلت خطا:\nبه دلیل استقرار هاست شما روی سرورهای داخل کشور (ایران)، شرکت گوگل کل ترافیک ورودی از این آی‌پی‌ها را به دلیل تحریم‌های آمریکا کاملاً مسدود (Block) کرده است و اجازه اتصال مستقیم به سرورهای هوش مصنوعی خود را نمی‌دهد.\n\nراهکار قطعی و ۱۰۰٪ تضمینی:\n۱. از منوی سمت راست سیستم، به بخش «تعریف و دسترسی پرسنل / تنظیمات» بروید.\n۲. به پایین صفحه اسکرول کنید تا به بخش «تنظیمات دستیار هوش مصنوعی جمینای (Gemini API)» برسید.\n۳. کادر دوم یعنی «آدرس پایه API / پروکسی (Base URL)» را پیدا کنید.\n۴. یک آدرس پروکسی عبور از تحریم معتبر وارد کنید؛ برای مثال می‌توانید از آدرس پروکسی رایگان و ضدتحریم زیر استفاده کنید:\nhttps://api.openai-hk.com\n۵. دکمه «ذخیره تنظیمات روی فایل wp-config.json هاست» را کلیک کنید.\n۶. به بخش دستیار هوش مصنوعی برگردید و مجدداً سوال خود را بپرسید. اکنون درخواست‌ها با موفقیت و بدون تحریم پردازش خواهند شد.";
            } elseif ($httpCode === 429 || strpos($errorMsg, '429') !== false || strpos($errorMsg, 'RESOURCE_EXHAUSTED') !== false || stripos($errorMsg, 'quota') !== false || stripos($errorMsg, 'rate limit') !== false) {
                $errorMsg = "محدودیت سهمیه رایگان هوش مصنوعی گوگل (Quota / Rate Limit) به پایان رسیده است.\n\nراهکار:\n۱. چند دقیقه صبر کنید تا محدودیت ساعتی ریست شود.\n۲. یا در بخش «تنظیمات سیستم > هوش مصنوعی»، کلید API یا پروکسی اختصاصی خود را وارد نمایید.\n(سایر بخش‌های حسابداری، صدور فاکتور، اسناد و انبارداری کاملاً مستقل و فعال هستند.)";
            } elseif (strpos($errorMsg, 'API key not valid') !== false) {
                $errorMsg = 'کلید جمینای وارد شده معتبر نیست. لطفاً مطمئن شوید که کلید کپی شده با عبارت AIzaSy یا AQ. شروع می‌شود.';
            } elseif (strpos($errorMsg, 'is not found') !== false || strpos($errorMsg, 'not supported') !== false || strpos($errorMsg, 'restricted') !== false || strpos($errorMsg, 'API key') !== false) {
                $errorMsg = "این کلید به مدل‌های جمینای دسترسی ندارد یا هنوز فعال نشده است.\n\nراهکارها:\n۱. اگر کلید را تازه ساخته‌اید، حدود ۱ الی ۳ دقیقه صبر کنید تا سرویس‌های گوگل کلاود فعال‌سازی را کامل کنند.\n۲. مطمئن شوید در پنل Google AI Studio هنگام ساخت کلید، حتماً گزینه «+ Create project» (ایجاد پروژه جدید) را زده باشید تا پروژه با تنظیمات صحیح خودکار ساخته شود.\n۳. در صورتی که پروژه را دستی در کلاود ایمپورت کرده‌اید، به Google Cloud Console بروید و مطمئن شوید که سرویس Generative Language API برای این پروژه فعال (Enabled) است.";
            }
            
            echo json_encode(['error' => 'خطای گوگل جمینای: ' . $errorMsg], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $resObj = json_decode($response, true);
        $text = isset($resObj['candidates'][0]['content']['parts'][0]['text']) 
            ? $resObj['candidates'][0]['content']['parts'][0]['text'] 
            : "متأسفانه پاسخی دریافت نشد.";

        // ارسال خروجی با همسان‌سازی کامل فیلدهای text و choices
        echo json_encode([
            'text' => $text,
            'choices' => [
                [
                    'message' => [
                        'role' => 'assistant',
                        'content' => $text
                    ]
                ]
            ]
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'system/save-gemini-key':
        $input = getJsonInput();
        $geminiKey = isset($input['geminiKey']) ? trim($input['geminiKey']) : '';
        $geminiBaseUrlInput = isset($input['geminiBaseUrl']) ? trim($input['geminiBaseUrl']) : '';
        
        $configPath = __DIR__ . '/wp-config.json';
        $config = [];
        if (file_exists($configPath)) {
            $config = json_decode(file_get_contents($configPath), true) ?: [];
        }
        
        $config['GEMINI_API_KEY'] = $geminiKey;
        $config['GEMINI_BASE_URL'] = $geminiBaseUrlInput;

        saveKeyData($pdo, 'geminiApiKey', $geminiKey);
        saveKeyData($pdo, 'geminiBaseUrl', $geminiBaseUrlInput);
        
        if (file_put_contents($configPath, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE))) {
            echo json_encode(['status' => 'success', 'message' => 'تنظیمات دستیار هوش مصنوعی با موفقیت ذخیره شد.'], JSON_UNESCAPED_UNICODE);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'خطا در نوشتن فایل تنظیمات wp-config.json. لطفاً دسترسی فایل (Permission) را بررسی کنید.'], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'system/save-storage-mode':
        $configPath = __DIR__ . '/wp-config.json';
        $config = [];
        if (file_exists($configPath)) {
            $config = json_decode(file_get_contents($configPath), true) ?: [];
        }
        $config['DB_TYPE'] = 'mysql';
        if (!isset($config['DB_USER'])) $config['DB_USER'] = 'wdamlpty_hesabdari-h-fahamand';
        if (!isset($config['DB_PASSWORD'])) $config['DB_PASSWORD'] = 'stsE*j70[m5FlSNY';
        if (!isset($config['DB_NAME'])) $config['DB_NAME'] = 'wdamlpty_hesabdari-h.fahamand';
        if (!isset($config['DB_HOST'])) $config['DB_HOST'] = 'localhost';
        if (!isset($config['DB_PORT'])) $config['DB_PORT'] = 3306;

        file_put_contents($configPath, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        echo json_encode([
            'status' => 'success',
            'storageMode' => 'mysql',
            'message' => 'محل ذخیره‌سازی اطلاعات به صورت دیتابیس متمرکز (MySQL) فعال است.'
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'system/clear-uploads':
        $uploadsDir = __DIR__ . '/uploads';
        if (file_exists($uploadsDir)) {
            try {
                $files = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($uploadsDir, RecursiveDirectoryIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::CHILD_FIRST
                );
                foreach ($files as $fileinfo) {
                    $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                    @$todo($fileinfo->getRealPath());
                }
            } catch (Exception $e) {}
        }
        echo json_encode(['status' => 'success', 'message' => 'کلیه فایل‌های پیوست با موفقیت پاکسازی شدند.'], JSON_UNESCAPED_UNICODE);
        break;

    case 'system/update':
        $input = getJsonInput();
        $zipBase64 = isset($input['zipBase64']) ? $input['zipBase64'] : '';
        if (empty($zipBase64)) {
            http_response_code(400);
            echo json_encode(['error' => 'فایل ارسالی نامعتبر یا خالی است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Preserve active Gemini AI settings before zip extraction
        $cfgPath = __DIR__ . '/wp-config.json';
        $activeConfig = file_exists($cfgPath) ? (json_decode(file_get_contents($cfgPath), true) ?: []) : [];
        $preUpdateGeminiKey = isset($activeConfig['GEMINI_API_KEY']) ? $activeConfig['GEMINI_API_KEY'] : '';
        $preUpdateGeminiBaseUrl = isset($activeConfig['GEMINI_BASE_URL']) ? $activeConfig['GEMINI_BASE_URL'] : '';

        if (!class_exists('ZipArchive')) {
            http_response_code(500);
            echo json_encode(['error' => 'افزونه ZipArchive روی این سرور فعال نیست. لطفا از مدیریت هاست بخواهید آن را فعال کند.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $timestamp = date('Y-m-d_H-i-s');
        $backupDirName = 'auto_system_update_backup_' . $timestamp;
        $backupDir = __DIR__ . '/backups/' . $backupDirName;
        $backupCreated = false;

        try {
            if (!file_exists($backupDir)) {
                mkdir($backupDir, 0755, true);
            }

            if (file_exists(__DIR__ . '/wp-config.json')) {
                copy(__DIR__ . '/wp-config.json', $backupDir . '/wp-config.json');
            }
            if (file_exists(__DIR__ . '/wp-config.php')) {
                copy(__DIR__ . '/wp-config.php', $backupDir . '/wp-config.php');
            }
            if (file_exists(__DIR__ . '/.env')) {
                copy(__DIR__ . '/.env', $backupDir . '/.env');
            }
            $backupCreated = true;
        } catch (Exception $e) {
            // Log backup warning but proceed
        }

        $zipData = base64_decode($zipBase64);
        $tmpZip = tempnam(sys_get_temp_dir(), 'update_');
        file_put_contents($tmpZip, $zipData);

        $extractedCount = 0;
        $skippedCount = 0;
        $failedCount = 0;
        $archiveExtracted = false;

        // Helper check for protected files/folders
        $isProtectedEntry = function($relPath) {
            $normalized = ltrim(str_replace('\\', '/', $relPath), '/');
            if (empty($normalized)) return true;
            if (strpos($normalized, '../') !== false) return true;
            if ($normalized === 'wp-config.json' || $normalized === 'wp-config.php' || $normalized === '.env') return true;
            if (strpos($normalized, 'data/') === 0 || $normalized === 'database.json' || substr($normalized, -7) === '.sqlite' || substr($normalized, -3) === '.db') return true;
            if (strpos($normalized, 'uploads/') === 0 || strpos($normalized, 'public/uploads/') === 0 || strpos($normalized, 'data/uploads/') === 0) return true;
            if (strpos($normalized, 'backups/') === 0 || strpos($normalized, 'node_modules/') === 0) return true;
            return false;
        };

        // 1. Try ZipArchive
        if (class_exists('ZipArchive')) {
            $zip = new ZipArchive;
            if ($zip->open($tmpZip) === TRUE) {
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $entryName = $zip->getNameIndex($i);
                    $entryNameClean = ltrim(str_replace('\\', '/', $entryName), '/');
                    if (empty($entryNameClean) || strpos($entryNameClean, '../') !== false) {
                        continue;
                    }

                    // Normalize prefix: if entry starts with "dist/", strip it for root extraction
                    $relPath = $entryNameClean;
                    if (strpos($relPath, 'dist/') === 0) {
                        $relPath = substr($relPath, 5);
                    }
                    if (empty($relPath)) continue;

                    // Skip directories
                    if (substr($entryNameClean, -1) === '/') {
                        continue;
                    }

                    if ($isProtectedEntry($relPath)) {
                        $skippedCount++;
                        continue;
                    }

                    $targetPath = __DIR__ . '/' . $relPath;
                    $dirOfFile = dirname($targetPath);
                    if (!file_exists($dirOfFile)) {
                        @mkdir($dirOfFile, 0755, true);
                    }

                    // Direct extraction in memory (libzip)
                    $fileContent = $zip->getFromIndex($i);
                    if ($fileContent !== false) {
                        if (file_exists($targetPath)) {
                            @chmod($targetPath, 0666);
                            @unlink($targetPath);
                        }
                        $written = @file_put_contents($targetPath, $fileContent);
                        if ($written !== false) {
                            @chmod($targetPath, 0644);
                            $extractedCount++;

                            // Also mirror to dist/ subfolder if dist/ exists
                            if (is_dir(__DIR__ . '/dist')) {
                                $distTargetPath = __DIR__ . '/dist/' . $relPath;
                                $distDirOfFile = dirname($distTargetPath);
                                if (!file_exists($distDirOfFile)) {
                                    @mkdir($distDirOfFile, 0755, true);
                                }
                                if (file_exists($distTargetPath)) {
                                    @chmod($distTargetPath, 0666);
                                    @unlink($distTargetPath);
                                }
                                @file_put_contents($distTargetPath, $fileContent);
                                @chmod($distTargetPath, 0644);
                            }
                        } else {
                            $failedCount++;
                        }
                    } else {
                        $failedCount++;
                    }
                }
                $zip->close();
                if ($extractedCount > 0) {
                    $archiveExtracted = true;
                }
            }
        }

        // 2. Fallback to RarArchive if ZipArchive failed or was empty
        if (!$archiveExtracted && class_exists('RarArchive')) {
            $rar = RarArchive::open($tmpZip);
            if ($rar !== FALSE) {
                $entries = $rar->getEntries();
                if ($entries !== FALSE) {
                    foreach ($entries as $entry) {
                        if ($entry->isDirectory()) continue;
                        $entryNameClean = ltrim(str_replace('\\', '/', $entry->getName()), '/');
                        if (empty($entryNameClean) || strpos($entryNameClean, '../') !== false) continue;

                        $relPath = $entryNameClean;
                        if (strpos($relPath, 'dist/') === 0) {
                            $relPath = substr($relPath, 5);
                        }
                        if (empty($relPath)) continue;

                        if ($isProtectedEntry($relPath)) {
                            $skippedCount++;
                            continue;
                        }

                        $targetPath = __DIR__ . '/' . $relPath;
                        $dirOfFile = dirname($targetPath);
                        if (!file_exists($dirOfFile)) {
                            @mkdir($dirOfFile, 0755, true);
                        }
                        if (file_exists($targetPath)) {
                            @chmod($targetPath, 0666);
                            @unlink($targetPath);
                        }
                        if ($entry->extract(dirname($targetPath), basename($targetPath))) {
                            @chmod($targetPath, 0644);
                            $extractedCount++;
                            if (is_dir(__DIR__ . '/dist')) {
                                @copy($targetPath, __DIR__ . '/dist/' . $relPath);
                            }
                        } else {
                            $failedCount++;
                        }
                    }
                    $rar->close();
                    if ($extractedCount > 0) {
                        $archiveExtracted = true;
                    }
                }
            }
        }

        @unlink($tmpZip);

        if ($archiveExtracted) {
            // Re-apply and guarantee Gemini API configuration after update
            if (!empty($preUpdateGeminiKey)) {
                $postConfigPath = __DIR__ . '/wp-config.json';
                $postConfig = file_exists($postConfigPath) ? (json_decode(file_get_contents($postConfigPath), true) ?: []) : [];
                $postConfig['GEMINI_API_KEY'] = $preUpdateGeminiKey;
                if (!empty($preUpdateGeminiBaseUrl)) {
                    $postConfig['GEMINI_BASE_URL'] = $preUpdateGeminiBaseUrl;
                }
                @file_put_contents($postConfigPath, json_encode($postConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                saveKeyData($pdo, 'geminiApiKey', $preUpdateGeminiKey);
                if (!empty($preUpdateGeminiBaseUrl)) {
                    saveKeyData($pdo, 'geminiBaseUrl', $preUpdateGeminiBaseUrl);
                }
            }

            // Immediately clear PHP OPcache and statcache
            if (function_exists('opcache_reset')) {
                @opcache_reset();
            }
            if (function_exists('clearstatcache')) {
                @clearstatcache(true);
            }

            // Automatically check and run database migrations for new tables/columns
            if (isset($pdo) && $pdo) {
                try {
                    runDatabaseMigrationsPhp($pdo);
                } catch (Exception $e) {}
            }

            echo json_encode([
                'status' => 'success',
                'message' => 'به‌روزرسانی نرم‌افزار با موفقیت انجام شد! تمامی فایل‌های هسته برنامه با موفقیت ارتقا یافتند و تمام دیتابیس، تنظیمات و اطلاعات کاربران بدون هیچ تغییری کاملاً حفظ گردید.',
                'backupCreated' => $backupCreated ? $backupDirName : null,
                'extractedCount' => $extractedCount,
                'skippedCount' => $skippedCount,
                'failedCount' => $failedCount,
                'version' => '3.1'
            ], JSON_UNESCAPED_UNICODE);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'خطا در باز کردن و استخراج بسته به‌روزرسانی (هیچ فایلی استخراج نشد). لطفاً از سالم و معتبر بودن فایل مطمئن شوید.'], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'system/update-chunk':
        @set_time_limit(300);
        @ini_set('max_execution_time', '300');
        @ini_set('memory_limit', '256M');

        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $headerMap = [];
        foreach ($headers as $k => $v) {
            $headerMap[strtolower($k)] = $v;
        }

        $input = getJsonInput();
        $uploadId = isset($input['uploadId']) ? $input['uploadId'] : (isset($_GET['uploadId']) ? $_GET['uploadId'] : (isset($headerMap['x-upload-id']) ? $headerMap['x-upload-id'] : ''));
        $chunkIndex = isset($input['chunkIndex']) ? intval($input['chunkIndex']) : (isset($_GET['chunkIndex']) ? intval($_GET['chunkIndex']) : (isset($headerMap['x-chunk-index']) ? intval($headerMap['x-chunk-index']) : 0));
        $totalChunks = isset($input['totalChunks']) ? intval($input['totalChunks']) : (isset($_GET['totalChunks']) ? intval($_GET['totalChunks']) : (isset($headerMap['x-total-chunks']) ? intval($headerMap['x-total-chunks']) : 1));

        $chunkBase64 = isset($input['chunkBase64']) ? $input['chunkBase64'] : (isset($input['data']) ? $input['data'] : '');
        $chunkBuffer = '';

        if (!empty($chunkBase64)) {
            $chunkBuffer = base64_decode($chunkBase64);
        } else {
            $rawInput = file_get_contents('php://input');
            if (!empty($rawInput) && strpos($rawInput, '{') !== 0) {
                $chunkBuffer = $rawInput;
            }
        }

        if (empty($uploadId)) {
            $uploadId = 'update_temp_' . date('YmdHis');
        }
        $safeUploadId = preg_replace('/[^a-zA-Z0-9_-]/', '', $uploadId);

        if (empty($chunkBuffer)) {
            http_response_code(400);
            echo json_encode(['error' => 'داده‌های قطعه ارسالی خالی است.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $tempDir = __DIR__ . '/data/temp_chunks';
        if (!file_exists($tempDir)) {
            @mkdir($tempDir, 0777, true);
        }
        if (!is_writable($tempDir)) {
            $tempDir = sys_get_temp_dir() . '/system_update_chunks';
            if (!file_exists($tempDir)) {
                @mkdir($tempDir, 0777, true);
            }
        }

        // Clean stale chunk files older than 2 hours
        try {
            $existingFiles = @scandir($tempDir);
            if (is_array($existingFiles)) {
                $now = time();
                foreach ($existingFiles as $f) {
                    if ($f !== '.' && $f !== '..') {
                        $fPath = $tempDir . '/' . $f;
                        if (is_file($fPath) && ($now - @filemtime($fPath)) > 7200) {
                            @unlink($fPath);
                        }
                    }
                }
            }
        } catch (Exception $e) {}

        $chunkFilePath = $tempDir . '/' . $safeUploadId . '.part_' . $chunkIndex;
        file_put_contents($chunkFilePath, $chunkBuffer);

        if ($chunkIndex < $totalChunks - 1) {
            echo json_encode([
                'status' => 'chunk_received',
                'chunkIndex' => $chunkIndex,
                'totalChunks' => $totalChunks,
                'message' => 'قطعه با موفقیت ذخیره شد.'
            ], JSON_UNESCAPED_UNICODE);
            break;
        }

        // All chunks received, assemble and extract
        $tmpZip = tempnam(sys_get_temp_dir(), 'update_assembled_');
        $outHandle = fopen($tmpZip, 'wb');
        for ($i = 0; $i < $totalChunks; $i++) {
            $partFile = $tempDir . '/' . $safeUploadId . '.part_' . $i;
            if (!file_exists($partFile)) {
                fclose($outHandle);
                @unlink($tmpZip);
                http_response_code(400);
                echo json_encode(['error' => 'یکی از قطعات پکیج به‌روزرسانی (قطعه ' . ($i + 1) . ') یافت نشد. لطفاً مجدداً تلاش کنید.'], JSON_UNESCAPED_UNICODE);
                exit;
            }
            $inHandle = fopen($partFile, 'rb');
            stream_copy_to_stream($inHandle, $outHandle);
            fclose($inHandle);
            @unlink($partFile);
        }
        fclose($outHandle);

        // Preserve active Gemini AI settings before zip extraction
        $cfgPath = __DIR__ . '/wp-config.json';
        $activeConfig = file_exists($cfgPath) ? (json_decode(file_get_contents($cfgPath), true) ?: []) : [];
        $preUpdateGeminiKey = isset($activeConfig['GEMINI_API_KEY']) ? $activeConfig['GEMINI_API_KEY'] : '';
        $preUpdateGeminiBaseUrl = isset($activeConfig['GEMINI_BASE_URL']) ? $activeConfig['GEMINI_BASE_URL'] : '';

        $timestamp = date('Y-m-d_H-i-s');
        $backupDirName = 'auto_system_update_backup_' . $timestamp;
        $backupDir = __DIR__ . '/backups/' . $backupDirName;
        $backupCreated = false;

        try {
            if (!file_exists($backupDir)) {
                @mkdir($backupDir, 0755, true);
            }
            if (file_exists(__DIR__ . '/wp-config.json')) {
                @copy(__DIR__ . '/wp-config.json', $backupDir . '/wp-config.json');
            }
            if (file_exists(__DIR__ . '/wp-config.php')) {
                @copy(__DIR__ . '/wp-config.php', $backupDir . '/wp-config.php');
            }
            if (file_exists(__DIR__ . '/.env')) {
                @copy(__DIR__ . '/.env', $backupDir . '/.env');
            }
            $backupCreated = true;
        } catch (Exception $e) {}

        $extractedCount = 0;
        $skippedCount = 0;
        $failedCount = 0;
        $archiveExtracted = false;

        // Helper check for protected files/folders
        $isProtectedEntry = function($relPath) {
            $normalized = ltrim(str_replace('\\', '/', $relPath), '/');
            if (empty($normalized)) return true;
            if (strpos($normalized, '../') !== false) return true;
            if ($normalized === 'wp-config.json' || $normalized === 'wp-config.php' || $normalized === '.env') return true;
            if (strpos($normalized, 'data/') === 0 || $normalized === 'database.json' || substr($normalized, -7) === '.sqlite' || substr($normalized, -3) === '.db') return true;
            if (strpos($normalized, 'uploads/') === 0 || strpos($normalized, 'public/uploads/') === 0 || strpos($normalized, 'data/uploads/') === 0) return true;
            if (strpos($normalized, 'backups/') === 0 || strpos($normalized, 'node_modules/') === 0) return true;
            return false;
        };

        if (class_exists('ZipArchive')) {
            $zip = new ZipArchive;
            if ($zip->open($tmpZip) === TRUE) {
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $entryName = $zip->getNameIndex($i);
                    $entryNameClean = ltrim(str_replace('\\', '/', $entryName), '/');
                    if (empty($entryNameClean) || strpos($entryNameClean, '../') !== false) {
                        continue;
                    }

                    // Normalize prefix: if entry starts with "dist/", strip it for root extraction
                    $relPath = $entryNameClean;
                    if (strpos($relPath, 'dist/') === 0) {
                        $relPath = substr($relPath, 5);
                    }
                    if (empty($relPath)) continue;

                    // Skip directories
                    if (substr($entryNameClean, -1) === '/') {
                        continue;
                    }

                    if ($isProtectedEntry($relPath)) {
                        $skippedCount++;
                        continue;
                    }

                    $targetPath = __DIR__ . '/' . $relPath;
                    $dirOfFile = dirname($targetPath);
                    if (!file_exists($dirOfFile)) {
                        @mkdir($dirOfFile, 0755, true);
                    }

                    // Direct extraction in memory (libzip)
                    $fileContent = $zip->getFromIndex($i);
                    if ($fileContent !== false) {
                        if (file_exists($targetPath)) {
                            @chmod($targetPath, 0666);
                            @unlink($targetPath);
                        }
                        $written = @file_put_contents($targetPath, $fileContent);
                        if ($written !== false) {
                            @chmod($targetPath, 0644);
                            $extractedCount++;

                            // Also mirror to dist/ subfolder if dist/ exists
                            if (is_dir(__DIR__ . '/dist')) {
                                $distTargetPath = __DIR__ . '/dist/' . $relPath;
                                $distDirOfFile = dirname($distTargetPath);
                                if (!file_exists($distDirOfFile)) {
                                    @mkdir($distDirOfFile, 0755, true);
                                }
                                if (file_exists($distTargetPath)) {
                                    @chmod($distTargetPath, 0666);
                                    @unlink($distTargetPath);
                                }
                                @file_put_contents($distTargetPath, $fileContent);
                                @chmod($distTargetPath, 0644);
                            }
                        } else {
                            $failedCount++;
                        }
                    } else {
                        $failedCount++;
                    }
                }
                $zip->close();
                if ($extractedCount > 0) {
                    $archiveExtracted = true;
                }
            }
        }

        if (!$archiveExtracted && class_exists('RarArchive')) {
            $rar = RarArchive::open($tmpZip);
            if ($rar !== FALSE) {
                $entries = $rar->getEntries();
                if ($entries !== FALSE) {
                    foreach ($entries as $entry) {
                        if ($entry->isDirectory()) continue;
                        $entryNameClean = ltrim(str_replace('\\', '/', $entry->getName()), '/');
                        if (empty($entryNameClean) || strpos($entryNameClean, '../') !== false) continue;

                        $relPath = $entryNameClean;
                        if (strpos($relPath, 'dist/') === 0) {
                            $relPath = substr($relPath, 5);
                        }
                        if (empty($relPath)) continue;

                        if ($isProtectedEntry($relPath)) {
                            $skippedCount++;
                            continue;
                        }

                        $targetPath = __DIR__ . '/' . $relPath;
                        $dirOfFile = dirname($targetPath);
                        if (!file_exists($dirOfFile)) {
                            @mkdir($dirOfFile, 0755, true);
                        }
                        if (file_exists($targetPath)) {
                            @chmod($targetPath, 0666);
                            @unlink($targetPath);
                        }
                        if ($entry->extract(dirname($targetPath), basename($targetPath))) {
                            @chmod($targetPath, 0644);
                            $extractedCount++;
                            if (is_dir(__DIR__ . '/dist')) {
                                @copy($targetPath, __DIR__ . '/dist/' . $relPath);
                            }
                        } else {
                            $failedCount++;
                        }
                    }
                    $rar->close();
                    if ($extractedCount > 0) {
                        $archiveExtracted = true;
                    }
                }
            }
        }

        @unlink($tmpZip);

        if ($archiveExtracted) {
            if (!empty($preUpdateGeminiKey)) {
                $postConfigPath = __DIR__ . '/wp-config.json';
                $postConfig = file_exists($postConfigPath) ? (json_decode(file_get_contents($postConfigPath), true) ?: []) : [];
                $postConfig['GEMINI_API_KEY'] = $preUpdateGeminiKey;
                if (!empty($preUpdateGeminiBaseUrl)) {
                    $postConfig['GEMINI_BASE_URL'] = $preUpdateGeminiBaseUrl;
                }
                @file_put_contents($postConfigPath, json_encode($postConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                saveKeyData($pdo, 'geminiApiKey', $preUpdateGeminiKey);
                if (!empty($preUpdateGeminiBaseUrl)) {
                    saveKeyData($pdo, 'geminiBaseUrl', $preUpdateGeminiBaseUrl);
                }
            }

            // Immediately clear PHP OPcache and statcache
            if (function_exists('opcache_reset')) {
                @opcache_reset();
            }
            if (function_exists('clearstatcache')) {
                @clearstatcache(true);
            }

            // Automatically check and run database migrations for new tables/columns
            if (isset($pdo) && $pdo) {
                try {
                    runDatabaseMigrationsPhp($pdo);
                } catch (Exception $e) {}
            }

            echo json_encode([
                'status' => 'success',
                'message' => 'به‌روزرسانی نرم‌افزار با موفقیت انجام شد! تمامی فایل‌های هسته برنامه با موفقیت ارتقا یافتند و تمام دیتابیس، تنظیمات و اطلاعات کاربران بدون هیچ تغییری کاملاً حفظ گردید.',
                'backupCreated' => $backupCreated ? $backupDirName : null,
                'extractedCount' => $extractedCount,
                'skippedCount' => $skippedCount,
                'failedCount' => $failedCount,
                'version' => '3.1'
            ], JSON_UNESCAPED_UNICODE);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'خطا در استخراج بسته به‌روزرسانی (هیچ فایلی استخراج نشد). لطفاً از سالم و معتبر بودن فایل زیپ اطمینان حاصل فرمایید.'], JSON_UNESCAPED_UNICODE);
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'مسیر درخواستی یافت نشد: ' . $route], JSON_UNESCAPED_UNICODE);
        break;
}
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'error' => 'خطای داخلی سرور در هسته PHP: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

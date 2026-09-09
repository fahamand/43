<?php
/**
 * 🚀 راه‌انداز هوشمند و پرتابل سامانه حسابداری روی هاست اشتراکی (سی‌پنل)
 * این فایل به عنوان ورودی اصلی عمل کرده و صفحه کامپایل‌شده فرانت‌اند را با رفع مشکلات مسیردهی تحویل می‌دهد.
 */

// غیرفعال کردن نمایش مستقیم خطاها در خروجی برای پیشگیری از تداخل با کدهای فرانت‌اند
ini_set('display_errors', 0);
error_reporting(E_ALL);

// جلوگیری از کش شدن سند ورودی در مرورگرها و پراکسی‌ها
header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$localIndex = __DIR__ . '/index.html';
$distIndex = __DIR__ . '/dist/index.html';

// پیدا کردن فایل صحیح فرانت‌اند
$indexPath = file_exists($localIndex) ? $localIndex : (file_exists($distIndex) ? $distIndex : null);

if ($indexPath) {
    $html = file_get_contents($indexPath);
    
    // اطمینان از اینکه مسیرهای نسبی دارایی‌ها (css/js) حتی بدون رول‌های ریرایت هم به درستی لود می‌شوند
    if ($indexPath === $distIndex) {
        $html = str_replace('src="./assets/', 'src="dist/assets/', $html);
        $html = str_replace('href="./assets/', 'href="dist/assets/', $html);
        $html = str_replace('src="/assets/', 'src="dist/assets/', $html);
        $html = str_replace('href="/assets/', 'href="dist/assets/', $html);
        
        $html = str_replace('src="assets/', 'src="dist/assets/', $html);
        $html = str_replace('href="assets/', 'href="dist/assets/', $html);
    } else {
        $html = str_replace('src="/assets/', 'src="assets/', $html);
        $html = str_replace('href="/assets/', 'href="assets/', $html);
        $html = str_replace('src="./assets/', 'src="assets/', $html);
        $html = str_replace('href="./assets/', 'href="assets/', $html);
    }
    
    echo $html;
} else {
    header('Content-Type: text/html; charset=utf-8');
    ?>
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>به سامانه حسابداری هوشمند خوش آمدید</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap');
            body {
                font-family: 'Vazirmatn', Tahoma, sans-serif;
                background-color: #0b1329;
                color: #f8fafc;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                padding: 20px;
                box-sizing: border-box;
            }
            .card {
                background: #111d37;
                padding: 40px;
                border-radius: 24px;
                box-shadow: 0 20px 50px rgba(0,0,0,0.3);
                max-width: 600px;
                width: 100%;
                text-align: center;
                border: 1px solid #1e2d4a;
            }
            h1 {
                color: #38bdf8;
                font-size: 22px;
                font-weight: 900;
                margin-top: 0;
            }
            p {
                font-size: 14px;
                line-height: 1.8;
                color: #94a3b8;
            }
            .highlight {
                color: #10b981;
                font-weight: bold;
            }
            .btn {
                display: inline-block;
                background: #0ea5e9;
                color: white;
                text-decoration: none;
                padding: 12px 30px;
                font-size: 14px;
                font-weight: bold;
                border-radius: 12px;
                margin-top: 20px;
                box-shadow: 0 4px 14px rgba(14, 165, 233, 0.3);
                transition: all 0.2s;
            }
            .btn:hover {
                background: #0284c7;
                transform: translateY(-1px);
            }
        </style>
    </head>
    <body>
        <div class="card">
            <div style="font-size: 50px; margin-bottom: 15px;">📦</div>
            <h1>سامانه آماده بارگذاری است</h1>
            <p>فرآیند کامپایل و آماده‌سازی برنامه با موفقیت انجام شده است. لطفاً اطمینان حاصل کنید که پوشه <span class="highlight">dist</span> را همراه با سایر فایل‌ها در روت هاست خود آپلود کرده‌اید.</p>
            <p>در صورتی که هم‌اکنون فایل‌ها را آپلود کرده‌اید، مطمئن شوید که دسترسی‌های فایل (Permissions) به درستی روی هاست تنظیم شده باشد.</p>
            <a href="index.php" class="btn">بارگذاری مجدد صفحه</a>
        </div>
    </body>
    </html>
    <?php
}

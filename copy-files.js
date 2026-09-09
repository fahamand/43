import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const blueprintDir = path.join(__dirname, 'blueprint');
const publicDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, 'dist');

// Ensure essential target directories exist
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Blueprint mapping table: filename -> { rootTarget, publicTarget }
const blueprintMap = [
  { file: 'api.php', isRoot: true, isPublic: false },
  { file: 'schema.sql', isRoot: true, isPublic: false },
  { file: 'index.php', isRoot: true, isPublic: false },
  { file: 'wp-config.json', isRoot: true, isPublic: false },
  { file: '.htaccess', isRoot: true, isPublic: true },
  { file: 'manifest.json', isRoot: false, isPublic: true },
  { file: 'sw.js', isRoot: false, isPublic: true },
  { file: 'favicon.svg', isRoot: false, isPublic: true },
  { file: 'icon-192.png', isRoot: false, isPublic: true },
  { file: 'icon-512.png', isRoot: false, isPublic: true },
  { file: 'index.html', isRoot: true, isPublic: false }
];

console.log('🔄 [Blueprint Sync] Checking and syncing blueprint files...');

blueprintMap.forEach(({ file, isRoot, isPublic }) => {
  const blueprintPath = path.join(blueprintDir, file);
  const rootPath = path.join(__dirname, file);
  const publicPath = path.join(publicDir, file);
  const distPath = path.join(distDir, file);

  // 1. Self-healing: If file exists in blueprint but missing in root/public, restore it
  if (fs.existsSync(blueprintPath)) {
    if (isRoot && !fs.existsSync(rootPath)) {
      fs.copyFileSync(blueprintPath, rootPath);
      console.log(`🔧 [Blueprint] Restored root file: ${file}`);
    }
    if (isPublic && !fs.existsSync(publicPath)) {
      fs.copyFileSync(blueprintPath, publicPath);
      console.log(`🔧 [Blueprint] Restored public file: ${file}`);
    }
  }

  // 2. Source resolution: Prefer root/ -> blueprint/ -> public/
  let srcToCopy = null;
  if (isRoot && fs.existsSync(rootPath)) {
    srcToCopy = rootPath;
    if (fs.existsSync(blueprintDir)) {
      try {
        fs.copyFileSync(rootPath, blueprintPath);
      } catch (_) {}
    }
  } else if (fs.existsSync(blueprintPath)) {
    srcToCopy = blueprintPath;
  } else if (isPublic && fs.existsSync(publicPath)) {
    srcToCopy = publicPath;
  }

  // 3. Copy to dist/
  if (srcToCopy) {
    try {
      fs.copyFileSync(srcToCopy, distPath);
      console.log(`✅ [Blueprint] Copied to dist/: ${file}`);
    } catch (err) {
      console.error(`❌ [Blueprint] Failed copying ${file} to dist/:`, err);
    }
  } else {
    console.warn(`⚠️ [Blueprint] Warning: ${file} not found in blueprint, root, or public!`);
  }
});

// Sync assets directories across blueprint/assets, public/assets, and dist/assets
const publicAssetsDir = path.join(publicDir, 'assets');
const blueprintAssetsDir = path.join(blueprintDir, 'assets');
const distAssetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(publicAssetsDir)) fs.mkdirSync(publicAssetsDir, { recursive: true });
if (!fs.existsSync(blueprintAssetsDir)) fs.mkdirSync(blueprintAssetsDir, { recursive: true });
if (!fs.existsSync(distAssetsDir)) fs.mkdirSync(distAssetsDir, { recursive: true });

// Backup & Restore mechanism to keep a clean copy of the original bundle
const masterBundle = path.join(blueprintAssetsDir, 'index-CkX4BMne.js');
const masterBundleBak = path.join(blueprintAssetsDir, 'index-CkX4BMne.js.bak');

if (fs.existsSync(masterBundle)) {
  if (!fs.existsSync(masterBundleBak)) {
    fs.copyFileSync(masterBundle, masterBundleBak);
    console.log('📦 [Backup] Created clean backup of index-CkX4BMne.js');
  } else {
    fs.copyFileSync(masterBundleBak, masterBundle);
    console.log('🔄 [Backup] Restored index-CkX4BMne.js to clean state from backup');
  }
}

const allAssetDirs = [blueprintAssetsDir, publicAssetsDir, distAssetsDir, path.join(__dirname, 'assets')];

// Collect all unique asset files from all sources
const allAssetFiles = new Map();
for (const sDir of allAssetDirs) {
  if (fs.existsSync(sDir)) {
    try {
      const files = fs.readdirSync(sDir);
      for (const f of files) {
        // Skip backup files
        if (f.endsWith('.bak')) continue;
        const fullP = path.join(sDir, f);
        const stat = fs.statSync(fullP);
        if (stat.isFile()) {
          if (stat.size === 0) {
            try { fs.unlinkSync(fullP); } catch (_) {}
            continue;
          }
          if (!allAssetFiles.has(f)) {
            allAssetFiles.set(f, fullP);
          }
        }
      }
    } catch (_) {}
  }
}

// Propagate all asset files to public/assets, blueprint/assets, and dist/assets
for (const [filename, sourcePath] of allAssetFiles.entries()) {
  const targets = [
    path.join(publicAssetsDir, filename),
    path.join(blueprintAssetsDir, filename),
    path.join(distAssetsDir, filename)
  ];
  for (const tPath of targets) {
    try {
      // Always overwrite index-CkX4BMne.js with clean master version, or if target doesn't exist
      if (filename === 'index-CkX4BMne.js') {
        const cleanSource = fs.existsSync(masterBundleBak) ? masterBundleBak : masterBundle;
        fs.copyFileSync(cleanSource, tPath);
      } else if (!fs.existsSync(tPath) || tPath.startsWith(distAssetsDir)) {
        fs.copyFileSync(sourcePath, tPath);
      }
    } catch (_) {}
  }
}

// Ensure dist/data exists with only a safe .gitkeep placeholder and .htaccess security file
const distDataDir = path.join(distDir, 'data');
if (!fs.existsSync(distDataDir)) {
  fs.mkdirSync(distDataDir, { recursive: true });
}
const dataGitkeep = path.join(distDataDir, '.gitkeep');
if (!fs.existsSync(dataGitkeep)) {
  fs.writeFileSync(dataGitkeep, '# Data folder placeholder');
}
const dataHtaccess = `# Deny direct web access to data folder
Order Deny,Allow
Deny from all
<IfModule mod_authz_core.c>
    Require all denied
</IfModule>
`;
fs.writeFileSync(path.join(distDataDir, '.htaccess'), dataHtaccess, 'utf8');

// Ensure dist/uploads exists with only a safe .gitkeep placeholder and .htaccess security file
const distUploadsDir = path.join(distDir, 'uploads');
if (!fs.existsSync(distUploadsDir)) {
  fs.mkdirSync(distUploadsDir, { recursive: true });
}
const uploadsGitkeep = path.join(distUploadsDir, '.gitkeep');
if (!fs.existsSync(uploadsGitkeep)) {
  fs.writeFileSync(uploadsGitkeep, '# Preserved directory');
}

// Ensure security .htaccess is placed inside dist/uploads to block PHP/script execution
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
fs.writeFileSync(path.join(distUploadsDir, '.htaccess'), htaccessContent, 'utf8');

const distEnv = path.join(distDir, '.env');
if (fs.existsSync(distEnv)) {
  try {
    fs.unlinkSync(distEnv);
    console.log('🧹 [Blueprint] Removed dist/.env file.');
  } catch (_) {}
}

const distDatabaseJson = path.join(distDir, 'database.json');
if (fs.existsSync(distDatabaseJson)) {
  try {
    fs.unlinkSync(distDatabaseJson);
    console.log('🧹 [Blueprint] Removed dist/database.json file.');
  } catch (_) {}
}

// Clean any logs and backup folders in dist
const distBackups = path.join(distDir, 'backups');
if (fs.existsSync(distBackups)) {
  try { fs.rmSync(distBackups, { recursive: true, force: true }); } catch (_) {}
}
const distBackup = path.join(distDir, 'backup');
if (fs.existsSync(distBackup)) {
  try { fs.rmSync(distBackup, { recursive: true, force: true }); } catch (_) {}
}

// Automatically create fresh dist.zip using AdmZip
try {
  const AdmZipModule = await import('adm-zip');
  const AdmZip = AdmZipModule.default || AdmZipModule;
  const zip = new AdmZip();
  zip.addLocalFolder(distDir);
  const zipDest = path.join(__dirname, 'dist.zip');
  zip.writeZip(zipDest);
  console.log(`📦 [Packaging] Generated fresh ${zipDest} successfully.`);
} catch (zipErr) {
  console.warn('⚠️ [Packaging] Could not create dist.zip via AdmZip:', zipErr);
}

console.log('🎉 [Blueprint Sync] All static, PHP, PWA, and server configurations synced to dist/ successfully for pure MySQL deployment!');


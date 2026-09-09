import React, { useRef, useState, useEffect } from 'react';
import { 
  User, BankTransaction, Invoice, WarehouseItem, AccountingDocument, 
  Counterpart, BankAccount, TransactionCategory, Partner, LoanBorrower, 
  ChecklistItem, FiscalYear 
} from '../types';
import { 
  Database, Download, Upload, ShieldCheck, AlertTriangle, RefreshCw, 
  FileCode, CheckCircle2, FolderOpen, Settings, Folder, X, ChevronDown, 
  ChevronUp, Users, BarChart3, Clock, Check, Sparkles, LogIn, 
  ToggleLeft, ToggleRight, Receipt, FileText, Package, Wrench, 
  BookOpen, UserCheck, CreditCard, Tags, Briefcase, CheckSquare, 
  Sliders, Shield, Layers, Filter, CheckCheck
} from 'lucide-react';
import { saveGenericKeyToDb, clearLocalBusinessStorage } from '../utils/stateManager';
import { getStoredBackupAutoInterval, setStoredBackupAutoInterval } from '../utils/defaultData';

export interface BackupSectionItem {
  id: string;
  title: string;
  categoryLabel: string;
  subtitle: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
}

export const BACKUP_SECTIONS: BackupSectionItem[] = [
  {
    id: 'users',
    title: 'کاربران و پرسنل',
    categoryLabel: 'مدیریت و دسترسی',
    subtitle: 'حساب‌های کاربری، سطوح دسترسی، نقش‌ها و مشخصات پرسنلی',
    unit: 'کاربر',
    icon: Users,
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    iconBg: 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60'
  },
  {
    id: 'transactions',
    title: 'تراکنش‌ها و گردش مالی',
    categoryLabel: 'امور مالی',
    subtitle: 'واریزها، برداشت‌ها، پیامک‌های بانکی و تراکنش‌های صندوق و کارت',
    unit: 'تراکنش',
    icon: BarChart3,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-800/60'
  },
  {
    id: 'finalInvoices',
    title: 'فاکتورهای قطعی',
    categoryLabel: 'خرید و فروش',
    subtitle: 'فاکتورهای رسمی و غیررسمی خرید، فروش و مرجوعی کالاها',
    unit: 'فاکتور قطعی',
    icon: Receipt,
    iconColor: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/60'
  },
  {
    id: 'proformas',
    title: 'پیش‌فاکتورها',
    categoryLabel: 'خرید و فروش',
    subtitle: 'پیش‌فاکتورها، استعلام‌های قیمت و سفارش‌های ثبت‌شده مشتریان',
    unit: 'پیش‌فاکتور',
    icon: FileText,
    iconColor: 'text-cyan-600 dark:text-cyan-400',
    iconBg: 'bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200/60 dark:border-cyan-800/60'
  },
  {
    id: 'goods',
    title: 'کالاها و موجودی انبار',
    categoryLabel: 'انبارداری',
    subtitle: 'موجودی کالاهای انبار، بهای تمام‌شده و کاردکس ورود و خروج',
    unit: 'قلم کالا',
    icon: Package,
    iconColor: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-50 dark:bg-amber-950/60 border border-amber-200/60 dark:border-amber-800/60'
  },
  {
    id: 'services',
    title: 'خدمات و اجرت‌ها',
    categoryLabel: 'انبارداری و خدمات',
    subtitle: 'عناوین خدمات، دستمزدهای فنی و اجرت‌های تعریف‌شده سامانه',
    unit: 'عنوان خدمت',
    icon: Wrench,
    iconColor: 'text-orange-600 dark:text-orange-400',
    iconBg: 'bg-orange-50 dark:bg-orange-950/60 border border-orange-200/60 dark:border-orange-800/60'
  },
  {
    id: 'accountingDocs',
    title: 'اسناد حسابداری',
    categoryLabel: 'حسابداری دوبل',
    subtitle: 'سندهای حسابداری، دفاتر روزنامه/کل، ترازنامه‌ها و سال مالی',
    unit: 'سند دوبل',
    icon: BookOpen,
    iconColor: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-50 dark:bg-purple-950/60 border border-purple-200/60 dark:border-purple-800/60'
  },
  {
    id: 'counterparts',
    title: 'طرف‌حساب‌ها و مخاطبین',
    categoryLabel: 'اشخاص و شرکت‌ها',
    subtitle: 'خریداران، فروشندگان، مشتریان، بدهکاران، بستانکاران و اطلاعات تماس',
    unit: 'طرف‌حساب',
    icon: UserCheck,
    iconColor: 'text-teal-600 dark:text-teal-400',
    iconBg: 'bg-teal-50 dark:bg-teal-950/60 border border-teal-200/60 dark:border-teal-800/60'
  },
  {
    id: 'accounts',
    title: 'حساب‌ها و صندوق‌ها',
    categoryLabel: 'بانک و نقدینگی',
    subtitle: 'حساب‌های بانکی، کارت‌ها، دستگاه‌های پوز و صندوق‌های فروشگاه',
    unit: 'حساب/صندوق',
    icon: CreditCard,
    iconColor: 'text-sky-600 dark:text-sky-400',
    iconBg: 'bg-sky-50 dark:bg-sky-950/60 border border-sky-200/60 dark:border-sky-800/60'
  },
  {
    id: 'categories',
    title: 'سرفصل‌ها و دسته‌بندی‌ها',
    categoryLabel: 'سرفصل‌های مالی',
    subtitle: 'سرفصل‌های هزینه‌ای و درآمدی و برچسب‌های تفکیک پورسانت',
    unit: 'سرفصل',
    icon: Tags,
    iconColor: 'text-pink-600 dark:text-pink-400',
    iconBg: 'bg-pink-50 dark:bg-pink-950/60 border border-pink-200/60 dark:border-pink-800/60'
  },
  {
    id: 'partnersLoans',
    title: 'شرکا و تسهیلات/وام‌ها',
    categoryLabel: 'سرمایه‌گذاری و وام',
    subtitle: 'حساب شرکا، سهام‌داران، وام‌ها و پرونده‌های قرض‌الحسنه',
    unit: 'مورد',
    icon: Briefcase,
    iconColor: 'text-violet-600 dark:text-violet-400',
    iconBg: 'bg-violet-50 dark:bg-violet-950/60 border border-violet-200/60 dark:border-violet-800/60'
  },
  {
    id: 'checklist',
    title: 'یادداشت‌ها و چک‌لیست',
    categoryLabel: 'وظایف و پیگیری',
    subtitle: 'وظایف روزانه، یادداشت‌های کاری و چک‌لیست‌های پرسنلی',
    unit: 'یادداشت',
    icon: CheckSquare,
    iconColor: 'text-lime-600 dark:text-lime-400',
    iconBg: 'bg-lime-50 dark:bg-lime-950/60 border border-lime-200/60 dark:border-lime-800/60'
  },
  {
    id: 'settingsTheme',
    title: 'تنظیمات عمومی و ظاهر',
    categoryLabel: 'پیکربندی سیستم',
    subtitle: 'مشخصات فروشگاه، تنظیمات فاکتور، قالب رنگی، فونت و شخصی‌سازی',
    unit: 'پیکربندی',
    icon: Sliders,
    iconColor: 'text-slate-600 dark:text-slate-400',
    iconBg: 'bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700'
  },
  {
    id: 'uploads',
    title: 'فایل‌ها و تصاویر پیوست',
    categoryLabel: 'اسناد و فایل‌ها',
    subtitle: 'اسکن فاکتورها، تصاویر کالاها، رسیدهای بانکی و مدارک آپلودشده',
    unit: 'فایل و پیوست',
    icon: FolderOpen,
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    iconBg: 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60'
  },
  {
    id: 'logs',
    title: 'لاگ‌ها و رویدادهای سیستم',
    categoryLabel: 'امنیت و حسابرسی',
    subtitle: 'گزارش‌های حسابرسی، ثبت تغییرات و لاگ‌های امنیتی ورود کاربران',
    unit: 'رکورد لاگ',
    icon: Shield,
    iconColor: 'text-rose-600 dark:text-rose-400',
    iconBg: 'bg-rose-50 dark:bg-rose-950/60 border border-rose-200/60 dark:border-rose-800/60'
  }
];

interface BackupRestoreComponentProps {
  currentUser: User;
  users: User[];
  transactions: BankTransaction[];
  invoices: Invoice[];
  items: WarehouseItem[];
  docs: AccountingDocument[];
  counterparts?: Counterpart[];
  accounts?: BankAccount[];
  categories?: TransactionCategory[];
  partners?: Partner[];
  loanBorrowers?: LoanBorrower[];
  checklist?: ChecklistItem[];
  fiscalYear?: FiscalYear;
  backupStoragePath: string;
  setBackupStoragePath: (path: string) => void;
}

interface RestoreProgressState {
  isActive: boolean;
  percent: number;
  stageName: string;
  details: string;
  isComplete: boolean;
}

export default function BackupRestoreComponent({
  currentUser,
  users,
  transactions,
  invoices,
  items,
  docs,
  counterparts = [],
  accounts = [],
  categories = [],
  partners = [],
  loanBorrowers = [],
  checklist = [],
  fiscalYear,
  backupStoragePath,
  setBackupStoragePath
}: BackupRestoreComponentProps) {
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected sections for backup
  const ALL_SECTION_IDS = BACKUP_SECTIONS.map(s => s.id);
  const [selectedSections, setSelectedSections] = useState<string[]>(ALL_SECTION_IDS);

  // Restore Progress state
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgressState>({
    isActive: false,
    percent: 0,
    stageName: '',
    details: '',
    isComplete: false
  });

  // Success Modal state
  const [showRestoreSuccessModal, setShowRestoreSuccessModal] = useState(false);
  const [restoreStats, setRestoreStats] = useState<{
    keysCount: number;
    filesCount: number;
    emergencyFile?: string;
  }>({ keysCount: 0, filesCount: 0 });

  const [isDirPickerOpen, setIsDirPickerOpen] = useState(false);
  const [tempPath, setTempPath] = useState(backupStoragePath);
  const [inputPath, setInputPath] = useState(backupStoragePath);
  const [selectedDisk, setSelectedDisk] = useState<'C' | 'D' | 'Network'>('C');
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['TICK_Accounting']);
  const [isUserReportOpen, setIsUserReportOpen] = useState(false);

  useEffect(() => {
    setInputPath(backupStoragePath);
    setTempPath(backupStoragePath);
  }, [backupStoragePath]);

  const handleCommitInputPath = async () => {
    const clean = inputPath.trim();
    if (clean && clean !== backupStoragePath) {
      await setBackupStoragePath(clean);
      setSuccessMsg(`مسیر ذخیره‌سازی بکاپ با موفقیت در پایگاه داده MySQL ذخیره شد.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  // Setting: Show backup restore section on login screen
  const [allowLoginRestore, setAllowLoginRestore] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('acc_app_allow_login_restore') || localStorage.getItem('allow_login_restore');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  // Setting: Auto Backup Interval (stored in MySQL app_state)
  const [autoBackupInterval, setAutoBackupInterval] = useState<string>(() => getStoredBackupAutoInterval());

  useEffect(() => {
    const handleIntervalUpdate = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setAutoBackupInterval(e.detail);
      } else {
        setAutoBackupInterval(getStoredBackupAutoInterval());
      }
    };
    window.addEventListener('backup-auto-interval-updated', handleIntervalUpdate);
    return () => {
      window.removeEventListener('backup-auto-interval-updated', handleIntervalUpdate);
    };
  }, []);

  const handleAutoBackupIntervalChange = async (newInterval: string) => {
    setStoredBackupAutoInterval(newInterval);
    const ok = await saveGenericKeyToDb('acc_backup_auto_interval', newInterval);
    if (ok) {
      setAutoBackupInterval(newInterval);
      window.dispatchEvent(new CustomEvent('backup-auto-interval-updated', { detail: newInterval }));
      setSuccessMsg('دوره تناوب پشتیبان‌گیری خودکار با موفقیت در پایگاه داده ذخیره شد.');
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const res = await fetch('/api/db/load-all');
        if (res.ok) {
          const data = await res.json();
          const val = data?.acc_app_allow_login_restore ?? data?.allow_login_restore;
          if (val !== undefined && val !== null) {
            const boolVal = val === true || val === 'true';
            setAllowLoginRestore(boolVal);
            localStorage.setItem('acc_app_allow_login_restore', String(boolVal));
            localStorage.setItem('allow_login_restore', String(boolVal));
          }
        }
      } catch (_) {}
    };
    fetchSetting();
  }, []);

  const handleToggleAllowLoginRestore = async (val: boolean) => {
    setAllowLoginRestore(val);
    try {
      localStorage.setItem('acc_app_allow_login_restore', String(val));
      localStorage.setItem('allow_login_restore', String(val));
    } catch (_) {}
    await saveGenericKeyToDb('allow_login_restore', val);
    window.dispatchEvent(new CustomEvent('allow-login-restore-changed', { detail: val }));
  };

  const openDirectoryPicker = async () => {
    try {
      if (typeof (window as any).showDirectoryPicker === 'function') {
        const handle = await (window as any).showDirectoryPicker();
        if (handle && handle.name) {
          const resolvedPath = `C:\\${handle.name}_Backups`;
          await setBackupStoragePath(resolvedPath);
          setInputPath(resolvedPath);
          setTempPath(resolvedPath);
          setSuccessMsg(`مسیر ذخیره فایل‌های پشتیبان با موفقیت به پوشه ${handle.name} تغییر یافت.`);
          setTimeout(() => setSuccessMsg(null), 4000);
          return;
        }
      }
    } catch (e) {
      console.log('FSA API not permitted or available, falling back to custom simulated picker.');
    }
    setTempPath(backupStoragePath);
    setIsDirPickerOpen(true);
  };

  // Section toggle helpers
  const toggleSection = (sectionId: string) => {
    setSelectedSections(prev => {
      if (prev.includes(sectionId)) {
        return prev.filter(id => id !== sectionId);
      } else {
        return [...prev, sectionId];
      }
    });
  };

  const handleSelectAll = () => {
    setSelectedSections(ALL_SECTION_IDS);
  };

  const handleDeselectAll = () => {
    setSelectedSections([]);
  };

  const handleApplyPreset = (presetIds: string[]) => {
    setSelectedSections(presetIds);
  };

  // Calculate live count for each section
  const getSectionCount = (id: string): { count: number; text: string } => {
    switch (id) {
      case 'users': {
        const count = users.length;
        return { count, text: `${count} کاربر فعال` };
      }
      case 'transactions': {
        const count = transactions.filter(t => !t.isDeleted).length;
        return { count, text: `${count} تراکنش` };
      }
      case 'finalInvoices': {
        const count = invoices.filter(i => !i.isDeleted && !i.isProforma).length;
        return { count, text: `${count} فاکتور خرید/فروش` };
      }
      case 'proformas': {
        const count = invoices.filter(i => !i.isDeleted && !!i.isProforma).length;
        return { count, text: `${count} پیش‌فاکتور` };
      }
      case 'goods': {
        const count = items.filter(it => it.type !== 'khadamat').length;
        return { count, text: `${count} قلم کالا` };
      }
      case 'services': {
        const count = items.filter(it => it.type === 'khadamat').length;
        return { count, text: `${count} عنوان خدمت` };
      }
      case 'accountingDocs': {
        const count = docs.filter(d => !d.isDeleted).length;
        return { count, text: `${count} سند دوبل` };
      }
      case 'counterparts': {
        const count = counterparts.length;
        return { count, text: `${count} طرف‌حساب` };
      }
      case 'accounts': {
        const count = accounts.length;
        return { count, text: `${count} حساب/صندوق` };
      }
      case 'categories': {
        const count = categories.length;
        return { count, text: `${count} سرفصل` };
      }
      case 'partnersLoans': {
        const count = partners.length + loanBorrowers.length;
        return { count, text: `${count} شریک و پرونده وام` };
      }
      case 'checklist': {
        const count = checklist.length;
        return { count, text: `${count} یادداشت و وظیفه` };
      }
      case 'settingsTheme': {
        return { count: 1, text: 'پیکربندی کامل' };
      }
      case 'uploads': {
        return { count: 1, text: 'کلیه پیوست‌ها' };
      }
      case 'logs': {
        return { count: 1, text: 'لاگ‌های امنیتی' };
      }
      default:
        return { count: 0, text: '۰ مورد' };
    }
  };

  const handleDownloadBackup = async () => {
    if (selectedSections.length === 0) {
      setErrorMsg('لطفاً حداقل یک بخش از سیستم را جهت تهیه نسخه پشتیبان انتخاب نمایید.');
      return;
    }

    setSuccessMsg(null);
    setErrorMsg(null);
    setIsProcessing(true);

    const clientLocalStorage: { [key: string]: string | null } = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        clientLocalStorage[key] = localStorage.getItem(key);
      }
    }

    try {
      const isAllSelected = selectedSections.length === ALL_SECTION_IDS.length;
      const response = await fetch('/api/backup/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clientLocalStorage,
          selectedSections: isAllSelected ? null : selectedSections
        })
      });

      let backupObjectToDownload: any = null;

      if (response.ok) {
        const resData = await response.json();
        backupObjectToDownload = resData.backup;
      } else {
        // Strict client-side fallback backup constructor
        const secSet = new Set(selectedSections);
        const fallbackDb: Record<string, any> = {};
        const fallbackLs: Record<string, any> = {};

        const isPf = (inv: any) => Boolean(
          inv?.isProforma === true || 
          inv?.type === 'proforma' || 
          (typeof inv?.invoiceNumber === 'string' && inv.invoiceNumber.trim().toUpperCase().startsWith('PF-')) ||
          (typeof inv?.title === 'string' && inv.title.includes('پیش‌فاکتور'))
        );

        if (secSet.has('users')) {
          fallbackDb.users = users;
          fallbackDb.acc_app_users = users;
        }
        if (secSet.has('transactions')) {
          fallbackDb.transactions = transactions;
          fallbackDb.acc_app_transactions = transactions;
        }
        if (secSet.has('finalInvoices') || secSet.has('proformas')) {
          const filteredInvs = (invoices || []).filter(inv => {
            const pf = isPf(inv);
            if (secSet.has('finalInvoices') && secSet.has('proformas')) return true;
            if (secSet.has('finalInvoices') && !secSet.has('proformas')) return !pf;
            if (!secSet.has('finalInvoices') && secSet.has('proformas')) return pf;
            return false;
          });
          fallbackDb.invoices = filteredInvs;
          fallbackDb.acc_app_invoices = filteredInvs;
        }
        if (secSet.has('goods') || secSet.has('services')) {
          const filteredItems = (items || []).filter(item => {
            const isService = item.type === 'khadamat';
            if (secSet.has('goods') && secSet.has('services')) return true;
            if (secSet.has('goods') && !secSet.has('services')) return !isService;
            if (!secSet.has('goods') && secSet.has('services')) return isService;
            return false;
          });
          fallbackDb.items = filteredItems;
          fallbackDb.acc_app_items = filteredItems;
        }
        if (secSet.has('accountingDocs')) {
          fallbackDb.docs = docs;
          fallbackDb.acc_app_docs = docs;
          if (fiscalYear) {
            fallbackDb.fiscalYear = fiscalYear;
            fallbackDb.acc_app_fiscalYear = fiscalYear;
          }
        }
        if (secSet.has('counterparts')) {
          fallbackDb.counterparts = counterparts;
          fallbackDb.acc_app_counterparts = counterparts;
        }
        if (secSet.has('accounts')) {
          fallbackDb.accounts = accounts;
          fallbackDb.acc_app_accounts = accounts;
        }
        if (secSet.has('categories')) {
          fallbackDb.categories = categories;
          fallbackDb.acc_app_categories = categories;
        }
        if (secSet.has('partnersLoans')) {
          fallbackDb.partners = partners;
          fallbackDb.acc_app_partners = partners;
          fallbackDb.loanBorrowers = loanBorrowers;
          fallbackDb.acc_app_loanBorrowers = loanBorrowers;
        }
        if (secSet.has('checklist')) {
          fallbackDb.checklist = checklist;
          fallbackDb.acc_app_checklist = checklist;
        }

        // Filter localStorage keys strictly
        for (const lsKey of Object.keys(clientLocalStorage)) {
          const clean = lsKey.startsWith('acc_app_') ? lsKey.substring(8) : lsKey;
          if (secSet.has('users') && (clean === 'users' || clean.startsWith('users_'))) fallbackLs[lsKey] = clientLocalStorage[lsKey];
          if (secSet.has('transactions') && (clean === 'transactions' || clean.startsWith('transactions_') || clean.startsWith('pendingDeposits') || clean.startsWith('bankSmsMessages') || clean.startsWith('paymentAllocations'))) fallbackLs[lsKey] = clientLocalStorage[lsKey];
          if (secSet.has('accountingDocs') && (clean === 'docs' || clean === 'fiscalYear' || clean.startsWith('docs_') || clean.startsWith('fiscalYear_'))) fallbackLs[lsKey] = clientLocalStorage[lsKey];
          if (secSet.has('counterparts') && (clean === 'counterparts' || clean.startsWith('counterparts_'))) fallbackLs[lsKey] = clientLocalStorage[lsKey];
          if (secSet.has('accounts') && (clean === 'accounts' || clean.startsWith('accounts_'))) fallbackLs[lsKey] = clientLocalStorage[lsKey];
          if (secSet.has('categories') && (clean === 'categories' || clean === 'commissionTags' || clean.startsWith('categories_') || clean.startsWith('commission_'))) fallbackLs[lsKey] = clientLocalStorage[lsKey];
          if (secSet.has('partnersLoans') && (clean === 'partners' || clean === 'loanBorrowers' || clean.startsWith('partners_') || clean.startsWith('loanBorrowers_'))) fallbackLs[lsKey] = clientLocalStorage[lsKey];
          if (secSet.has('checklist') && (clean === 'checklist' || clean.startsWith('checklist_'))) fallbackLs[lsKey] = clientLocalStorage[lsKey];
          if (secSet.has('settingsTheme') && (clean === 'settings' || clean.startsWith('settings_') || clean.includes('Theme') || clean.includes('theme') || clean.includes('currency') || clean.includes('font'))) fallbackLs[lsKey] = clientLocalStorage[lsKey];
          if (secSet.has('logs') && (clean === 'auditLogs' || clean === 'system_logs' || clean.startsWith('auditLogs_') || clean.startsWith('system_logs_'))) fallbackLs[lsKey] = clientLocalStorage[lsKey];
        }

        backupObjectToDownload = {
          _metadata: {
            version: "2.0",
            system: "TICK_Accounting",
            createdAt: new Date().toISOString(),
            type: isAllSelected ? "USER_DATA_ONLY_BACKUP" : "CUSTOM_SELECTIVE_BACKUP",
            description: isAllSelected 
              ? "نسخه پشتیبان کامل اطلاعات کاربر" 
              : `نسخه پشتیبان انتخابی (${selectedSections.length} بخش)`,
            selectedSections: isAllSelected ? ALL_SECTION_IDS : selectedSections,
            isPartialBackup: !isAllSelected
          },
          database: fallbackDb,
          localStorage: fallbackLs,
          uploads: {}
        };
      }

      const now = new Date();
      const pad = (num: number) => String(num).padStart(2, '0');
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const filePrefix = isAllSelected ? 'TICK_Accounting_Full_Backup' : 'TICK_Accounting_Custom_Backup';

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObjectToDownload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${filePrefix}_${timestamp}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      const selectedTitles = BACKUP_SECTIONS
        .filter(s => selectedSections.includes(s.id))
        .map(s => s.title)
        .join('، ');

      if (isAllSelected) {
        setSuccessMsg(`نسخه پشتیبان کامل اطلاعات سامانه (شامل تمامی ۱۵ بخش) با موفقیت تولید و دانلود گردید.`);
      } else {
        setSuccessMsg(`نسخه پشتیبان انتخابی (${selectedSections.length} بخش شامل: ${selectedTitles}) با موفقیت دانلود شد. موارد انتخاب‌نشده به طور کامل از این فایل مستثنی گردیده‌اند.`);
      }
      setTimeout(() => setSuccessMsg(null), 9000);
    } catch (err) {
      console.error("Error generating backup:", err);
      setErrorMsg('خطا در تولید فایل پشتیبان.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSuccessMsg(null);
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsedData = JSON.parse(event.target?.result as string);
        if (typeof parsedData !== 'object' || parsedData === null) {
          setErrorMsg('قالب فایل پشتیبان نامعتبر است (آبجکت JSON نیست).');
          return;
        }

        const isPartial = Boolean(
          parsedData._metadata?.isPartialBackup || 
          (Array.isArray(parsedData._metadata?.selectedSections) && parsedData._metadata.selectedSections.length < ALL_SECTION_IDS.length)
        );

        const partialTitles = isPartial && Array.isArray(parsedData._metadata?.selectedSections)
          ? BACKUP_SECTIONS.filter(s => parsedData._metadata.selectedSections.includes(s.id)).map(s => s.title).join('، ')
          : '';

        const confirmRestore = window.confirm(
          isPartial
            ? `توجه: این فایل یک «نسخه پشتیبان انتخابی» است شامل بخش‌های:\n(${partialTitles || 'بخش‌های تفکیک‌شده مشخص'})\n\n۱. پیش از بازیابی، نسخه پشتیبان اضطراری از وضعیت فعلی سیستم به صورت خودکار تهیه می‌شود.\n۲. فقط اطلاعات و تنظیمات بخش‌های موجود در فایل به‌روزرسانی و جایگزین می‌شوند و سایر بخش‌ها بدون تغییر حفظ خواهند شد.\n\nآیا مایل به بازیابی این بخش‌های انتخابی هستید؟`
            : 'هشدار بسیار مهم:\n\n۱. پیش از بازیابی، یک بکاپ اضطراری خودکار از اطلاعات فعلی در پوشه backups سرور ذخیره می‌شود.\n۲. تمام داده‌های فعلی دیتابیس و فایل‌های پیوست کلاً پاکسازی شده و اطلاعات فایل بکاپ جایگزین خواهند شد.\n۳. سورس‌کد و هسته کدهای برنامه بدون تغییر باقی خواهند ماند.\n\nآیا از انجام عملیات بازیابی اطمینان کامل دارید؟'
        );
        if (!confirmRestore) return;

        setIsProcessing(true);
        setRestoreProgress({
          isActive: true,
          percent: 10,
          stageName: 'اعتبارسنجی ساختار داده‌ها',
          details: isPartial ? 'بررسی ساختار نسخه پشتیبان انتخابی...' : 'در حال بررسی جامع کلیدهای پشتیبان و پایگاه‌داده...',
          isComplete: false
        });

        // Small yield to let browser update progress UI
        await new Promise(res => setTimeout(res, 100));

        setRestoreProgress({
          isActive: true,
          percent: 30,
          stageName: 'ارسال به سرور و پشتیبان اضطراری',
          details: 'ایجاد نسخه پشتیبان اضطراری و آماده‌سازی پایگاه‌داده...',
          isComplete: false
        });

        const response = await fetch('/api/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backupData: parsedData })
        });

        const resResult = await response.json();

        if (response.ok && resResult.status === 'success') {
          setRestoreProgress({
            isActive: true,
            percent: 65,
            stageName: 'تزریق و جای‌گیری داده‌ها',
            details: isPartial ? 'در حال اعمال داده‌های بخش‌های انتخابی...' : 'در حال بازنشانی حافظه موقت و بارگذاری رکوردهای بازیابی شده...',
            isComplete: false
          });

          // Preserve active user session so restore doesn't log the user out
          const preserveLoggedIn = localStorage.getItem('acc_app_isLoggedIn');
          const preserveCurrentUser = localStorage.getItem('acc_app_currentUser');
          const preservePrimaryRole = localStorage.getItem('acc_app_primaryUserRole');

          // If FULL restore, clear current localStorage entirely for a clean slate. If PARTIAL, merge directly.
          if (!isPartial) {
            localStorage.clear();
          }

          // Clean any residual local business storage
          clearLocalBusinessStorage();

          setRestoreStats({
            keysCount: resResult.restoredKeysCount || Object.keys(resResult.database || parsedData.database || {}).length,
            filesCount: resResult.restoredFilesCount || 0,
            emergencyFile: resResult.emergencyBackupFile
          });

          // Complete 100%
          setRestoreProgress({
            isActive: true,
            percent: 100,
            stageName: 'تکمیل نهایی و اعتبارسنجی',
            details: isPartial ? 'بخش‌های انتخابی با موفقیت در سرور پایگاه‌داده بازیابی شدند.' : 'اطلاعات با موفقیت در پایگاه‌داده بازیابی شد و سیستم آماده به کار است.',
            isComplete: true
          });

          setShowRestoreSuccessModal(true);

        } else {
          throw new Error(resResult?.error || "خطا در عملیات بازیابی توسط سرور پایگاه‌داده.");
        }
      } catch (err: any) {
        console.error("Backup restore error:", err);
        setErrorMsg(err.message || 'خطا در خواندن یا بازیابی فایل پشتیبان.');
        setRestoreProgress(prev => ({ ...prev, isActive: false }));
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFinishAndReload = () => {
    window.location.reload();
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 space-y-6 shadow-sm text-right" dir="rtl">
      
      {/* Title & Description Header */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-600" />
          <span>پشتیبان‌گیری و بازیابی اطلاعات</span>
        </h2>
        <p className="text-[10px] sm:text-xs text-slate-500 mt-1 leading-relaxed">
          تهیه پشتیبان دوره‌ای و استخراج ایمن داده‌ها با فرمت JSON
        </p>
      </div>

      {/* Backup storage path configuration section */}
      <div className="bg-slate-50/50 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-800 p-5 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200">مسیر پیش‌فرض ذخیره فایل‌های پشتیبان (بکاپ)</h3>
          </div>
          <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-lg w-max">
            شخصی‌سازی شده برای {currentUser?.name || ''} ({currentUser?.role === 'admin' ? 'مدیر سیستم' : currentUser?.role === 'accountant' ? 'حسابدار' : 'کاربر عادی'})
          </span>
        </div>
        
        <p className="text-[10px] text-slate-500 leading-relaxed font-bold">
          تعیین محل ذخیره‌سازی پیش‌فرض فایل‌های پشتیبان روی رایانه.
        </p>

        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              onBlur={handleCommitInputPath}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCommitInputPath();
                }
              }}
              placeholder="مثال: C:\TICK_Accounting\Backups"
              className="w-full pr-9 pl-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              dir="ltr"
            />
            <FolderOpen className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          </div>
          <button
            onClick={openDirectoryPicker}
            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-950 dark:text-indigo-400 text-xs font-black rounded-xl border border-indigo-200/40 cursor-pointer transition-all shrink-0 flex items-center gap-1.5"
          >
            <FolderOpen className="w-4 h-4" />
            <span>انتخاب پوشه...</span>
          </button>
        </div>
      </div>

      {/* Login Screen Restore Toggle Setting Card */}
      <div className="bg-slate-50/50 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-800 p-5 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <LogIn className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span>نمایش بخش «بازیابی فایل پشتیبان» در صفحه ورود</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                  allowLoginRestore 
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' 
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {allowLoginRestore ? 'فعال' : 'غیرفعال'}
                </span>
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold mt-0.5">
                با فعال‌سازی این گزینه، کادر «بازیابی فایل پشتیبان» در صفحه ورود کاربران نمایش داده می‌شود تا در مواقع اضطراری بتوان بدون نیاز به ورود به حساب کاربری، فایل پشتیبان را بازیابی کرد.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={() => handleToggleAllowLoginRestore(!allowLoginRestore)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                allowLoginRestore ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
              role="switch"
              aria-checked={allowLoginRestore}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  allowLoginRestore ? '-translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {allowLoginRestore ? 'نمایش در صفحه ورود' : 'عدم نمایش'}
            </span>
          </div>
        </div>
      </div>

      {/* Auto Backup Interval Setting Card */}
      <div className="bg-slate-50/50 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-800 p-5 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span>زمان‌بندی پشتیبان‌گیری خودکار</span>
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                  {autoBackupInterval === 'off' ? 'غیرفعال' : autoBackupInterval === '6h' ? 'هر ۶ ساعت' : autoBackupInterval === '12h' ? 'هر ۱۲ ساعت' : autoBackupInterval === 'weekly' ? 'هفتگی' : 'روزانه'}
                </span>
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold mt-0.5">
                تعیین دوره تناوب پشتیبان‌گیری خودکار از اطلاعات سیستم در پایگاه داده MySQL.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <select
              value={autoBackupInterval}
              onChange={(e) => handleAutoBackupIntervalChange(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-sm"
            >
              <option value="6h">هر ۶ ساعت</option>
              <option value="12h">هر ۱۲ ساعت</option>
              <option value="daily">روزانه (پیش‌فرض)</option>
              <option value="weekly">هفتگی</option>
              <option value="off">غیرفعال</option>
            </select>
          </div>
        </div>
      </div>

      {/* Restore Progress Bar Box (Visible while restoring) */}
      {restoreProgress.isActive && (
        <div className="p-6 bg-gradient-to-br from-indigo-50/80 via-white to-blue-50/80 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 border-2 border-indigo-200 dark:border-indigo-800/80 rounded-3xl shadow-lg space-y-4 transition-all duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
                {restoreProgress.isComplete ? (
                  <Check className="w-6 h-6 stroke-[2.5]" />
                ) : (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {restoreProgress.stageName}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                    {restoreProgress.percent}%
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                  {restoreProgress.details}
                </p>
              </div>
            </div>

            <div className="text-left font-mono text-xs font-black text-indigo-600 dark:text-indigo-400 self-end sm:self-center">
              {restoreProgress.percent}%
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200/80 dark:border-slate-700">
            <div 
              className="h-full bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-500 rounded-full transition-all duration-500 ease-out shadow-sm"
              style={{ width: `${restoreProgress.percent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold pt-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>عملیات غیرهمزمان با سرعت حداکثری و امنیت کامل در حال انجام است...</span>
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              {restoreProgress.isComplete ? 'تکمیل شد' : 'لطفاً صبر نمایید'}
            </span>
          </div>
        </div>
      )}

      {/* Success Alert Banner if present */}
      {successMsg && !restoreProgress.isActive && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-450 border border-rose-100 dark:border-rose-900/40 rounded-2xl text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Stats of elements currently backed up */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
          <span className="text-[10px] text-slate-400 font-bold block">کاربران</span>
          <span className="text-md font-black text-slate-700 dark:text-slate-300 mt-1 block">{users.length} کاربر</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
          <span className="text-[10px] text-slate-400 font-bold block">تراکنش‌ها</span>
          <span className="text-md font-black text-slate-700 dark:text-slate-300 mt-1 block">{transactions.filter(t => !t.isDeleted).length} رکورد</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
          <span className="text-[10px] text-slate-400 font-bold block">فاکتورهای قطعی</span>
          <span className="text-md font-black text-slate-700 dark:text-slate-300 mt-1 block">{invoices.filter(i => !i.isProforma && !i.isDeleted).length} فاکتور</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
          <span className="text-[10px] text-slate-400 font-bold block">پیش‌فاکتورها</span>
          <span className="text-md font-black text-indigo-600 dark:text-indigo-400 mt-1 block">{invoices.filter(i => i.isProforma && !i.isDeleted).length} سند</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
          <span className="text-[10px] text-slate-400 font-bold block">کالاها و خدمات</span>
          <span className="text-md font-black text-slate-700 dark:text-slate-300 mt-1 block">{items.length} کالا</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
          <span className="text-[10px] text-slate-400 font-bold block">اسناد حسابداری</span>
          <span className="text-md font-black text-slate-700 dark:text-slate-300 mt-1 block">{docs.filter(d => !d.isDeleted).length} سند</span>
        </div>
      </div>

      {/* Collapsible User Activity Report Panel */}
      <div className="border border-slate-150 dark:border-slate-800 rounded-2xl bg-slate-50/10 dark:bg-slate-950/5 overflow-hidden transition-all">
        <button
          onClick={() => setIsUserReportOpen(!isUserReportOpen)}
          className="w-full px-5 py-4 flex items-center justify-between text-right font-black text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors focus:outline-none cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-500" />
            <span>گزارش فعالیت و آمار ثبتی کاربران سیستم ({users.length} کاربر)</span>
          </div>
          {isUserReportOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {isUserReportOpen && (
          <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/20 space-y-4">
            <div className="text-[10px] text-slate-500 font-bold leading-relaxed pb-2 border-b border-slate-100 dark:border-slate-800">
              لیست کامل کاربران فعال سیستم به همراه جزئیات رکوردهای ثبت‌شده توسط هر یک از آن‌ها به تفکیک فاکتورهای خرید، فروش، پیش‌فاکتورها و تراکنش‌های مالی:
            </div>
            
            <div className="divide-y divide-slate-100 dark:divide-slate-850">
              {users.map((u) => {
                const userTx = transactions.filter(t => !t.isDeleted && (t.createdById === u.id || t.createdBy === u.username || t.createdBy === u.name || t.editedById === u.id || t.editedBy === u.name));
                const userSales = invoices.filter(inv => !inv.isDeleted && inv.type === 'sale' && !inv.isProforma && (inv.createdById === u.id || inv.createdBy === u.username || inv.createdBy === u.name));
                const userPurchases = invoices.filter(inv => !inv.isDeleted && inv.type === 'purchase' && !inv.isProforma && (inv.createdById === u.id || inv.createdBy === u.username || inv.createdBy === u.name));
                const userProformas = invoices.filter(inv => !inv.isDeleted && inv.isProforma && (inv.createdById === u.id || inv.createdBy === u.username || inv.createdBy === u.name));

                return (
                  <div key={u.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs">
                          {u.name ? u.name.charAt(0) : 'U'}
                        </div>
                        <div className="text-right">
                          <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">{u.name}</h4>
                          <p className="text-[9px] text-slate-400 font-bold">نام کاربری: <span className="font-mono">{u.username}</span></p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black w-max ${
                        u.role === 'admin' 
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400' 
                          : u.role === 'accountant'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                      }`}>
                        {u.role === 'admin' ? 'مدیر سیستم' : u.role === 'accountant' ? 'حسابدار' : 'فروشنده'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div className="bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                        <span className="text-[9px] text-slate-400 font-bold block">تراکنش‌های ثبت‌شده</span>
                        <span className="text-xs font-black text-slate-700 dark:text-slate-300 mt-1 block font-mono">{userTx.length}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                        <span className="text-[9px] text-slate-400 font-bold block">فاکتورهای فروش</span>
                        <span className="text-xs font-black text-slate-700 dark:text-slate-300 mt-1 block font-mono">{userSales.length}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                        <span className="text-[9px] text-slate-400 font-bold block">فاکتورهای خرید</span>
                        <span className="text-xs font-black text-slate-700 dark:text-slate-300 mt-1 block font-mono">{userPurchases.length}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                        <span className="text-[9px] text-slate-400 font-bold block">پیش‌فاکتورها</span>
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 mt-1 block font-mono">{userProformas.length}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Section: Backup and Restore Operations */}
      <div className="space-y-6">
        
        {/* Step 1: Export/Download with Granular Section Selection */}
        <div className="border border-slate-200 dark:border-slate-800 p-6 rounded-3xl space-y-6 bg-slate-50/40 dark:bg-slate-900/30 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black text-sm shadow-md shadow-blue-600/20">۱</div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">تهیه نسخه پشتیبان (Backup)</h3>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                    selectedSections.length === ALL_SECTION_IDS.length
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : selectedSections.length > 0
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                  }`}>
                    {selectedSections.length} از {ALL_SECTION_IDS.length} بخش انتخاب شده
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                  بخش‌های مدنظر خود را جهت پشتیبان‌گیری انتخاب نمایید (تمامی اطلاعات یا بخش‌های تفکیک‌شده).
                </p>
              </div>
            </div>

            {/* Quick Action Buttons & Presets */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>انتخاب همه ({ALL_SECTION_IDS.length})</span>
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
              >
                عدم انتخاب
              </button>
            </div>
          </div>

          {/* Quick Presets Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>الگوهای سریع:</span>
            </span>
            <button
              type="button"
              onClick={() => handleApplyPreset(ALL_SECTION_IDS)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                selectedSections.length === ALL_SECTION_IDS.length
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
            >
              پشتیبان کامل سامانه
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset(['finalInvoices', 'proformas', 'accountingDocs', 'transactions'])}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all cursor-pointer"
            >
              فقط اسناد مالی و فاکتورها
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset(['goods', 'services'])}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all cursor-pointer"
            >
              فقط کالاها و انبار
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset(['counterparts', 'users', 'partnersLoans'])}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all cursor-pointer"
            >
              فقط اشخاص و طرف‌حساب‌ها
            </button>
          </div>

          {/* Section Selection Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {BACKUP_SECTIONS.map((sec) => {
              const isSelected = selectedSections.includes(sec.id);
              const info = getSectionCount(sec.id);
              const IconComp = sec.icon;

              return (
                <div
                  key={sec.id}
                  onClick={() => toggleSection(sec.id)}
                  className={`relative p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-3 ${
                    isSelected
                      ? 'bg-white dark:bg-slate-850/90 border-blue-500/80 dark:border-blue-500/80 shadow-xs ring-2 ring-blue-500/10'
                      : 'bg-white/60 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800 opacity-60 hover:opacity-90 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {/* Custom Checkbox */}
                  <div className="pt-0.5 shrink-0">
                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>

                  {/* Icon Box */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${sec.iconBg}`}>
                    <IconComp className={`w-5 h-5 ${sec.iconColor}`} />
                  </div>

                  {/* Details */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <h4 className={`text-xs font-black truncate ${
                        isSelected ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {sec.title}
                      </h4>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                        isSelected 
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300' 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        {info.text}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold line-clamp-2">
                      {sec.subtitle}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Download Action Footer */}
          <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
            <button
              onClick={handleDownloadBackup}
              disabled={isProcessing || selectedSections.length === 0}
              className={`w-full py-3.5 px-6 font-black text-xs rounded-2xl cursor-pointer transition-all flex items-center justify-center gap-2.5 shadow-sm ${
                selectedSections.length === 0
                  ? 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white shadow-blue-600/20 shadow-md'
              }`}
            >
              {isProcessing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>
                {isProcessing
                  ? 'در حال آماده‌سازی و استخراج اطلاعات...'
                  : selectedSections.length === 0
                  ? 'جهت دانلود پشتیبان، حداقل یک بخش را انتخاب نمایید'
                  : selectedSections.length === ALL_SECTION_IDS.length
                  ? 'دانلود نسخه پشتیبان کامل سامانه (شامل تمامی ۱۵ بخش)'
                  : `دانلود نسخه پشتیبان انتخابی (${selectedSections.length} بخش انتخاب‌شده)`}
              </span>
            </button>

            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed text-center font-bold">
              فایل خروجی منحصراً حاوی دیتای ثبتی شما بوده و هیچ‌گونه سورس‌کد یا کدهای نرم‌افزار را شامل نمی‌شود.
            </p>
          </div>
        </div>

        {/* Step 2: Import/Restore */}
        <div className="border border-slate-200 dark:border-slate-800 p-6 rounded-3xl space-y-4 bg-slate-50/40 dark:bg-slate-900/30 shadow-sm">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-black text-sm shadow-md shadow-indigo-600/20">۲</div>
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">بازیابی اطلاعات (Restore)</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                بارگذاری و جایگزینی کامل اطلاعات از روی فایل پشتیبان قبلی
              </p>
            </div>
          </div>
          
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
            در فرایند بازیابی، ابتدا یک نسخه پشتیبان اضطراری از داده‌های کنونی به صورت خودکار تهیه شده، سپس دیتابیس فعلی با محتوای فایل انتخابی جایگزین می‌گردد. هسته نرم‌افزار و کدها دست‌نخورده باقی می‌مانند.
          </p>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".json"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-black text-xs rounded-2xl cursor-pointer transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20"
          >
            {isProcessing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span>{isProcessing ? 'در حال پاکسازی و جایگزینی...' : 'انتخاب و بازیابی فایل پشتیبان'}</span>
          </button>
        </div>

      </div>

      {/* Heavy warning notice */}
      <div className="p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30 rounded-2xl flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-[11px] font-black">سازوکار امنیت و پاکسازی بازیابی (Restore):</h4>
          <p className="text-[10px] leading-relaxed font-bold">
            در فرایند بازیابی، ابتدا یک بکاپ اضطراری اتوماتیک در پوشه backups ذخیره گردیده، سپس دیتابیس فعلی و فایل‌های پیوست کلاً پاکسازی شده و محتوای فایل بکاپ جایگزین می‌گردد. کدهای نرم‌افزار هرگز جایگزین یا دستکاری نخواهند شد.
          </p>
        </div>
      </div>

      {/* Interactive Directory Picker Modal */}
      {isDirPickerOpen && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl popup-box-global">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white">انتخاب پوشه ذخیره‌سازی پیش‌فرض سیستم</h3>
              </div>
              <button
                onClick={() => setIsDirPickerOpen(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-72">
              {/* Drive list pane */}
              <div className="md:col-span-1 border border-slate-150 dark:border-slate-800 rounded-2xl p-3 bg-slate-50 dark:bg-slate-950/30 flex flex-col gap-1.5 overflow-y-auto">
                <span className="text-[10px] text-slate-400 font-bold mb-1 block">این رایانه (This PC)</span>
                
                <button
                  onClick={() => {
                    setSelectedDisk('C');
                    setTempPath('C:\\TICK_Accounting\\Backups');
                  }}
                  className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all text-right cursor-pointer ${
                    selectedDisk === 'C'
                      ? 'bg-indigo-600 text-white shadow-sm font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  <span>درایو محلی (C:)</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedDisk('D');
                    setTempPath('D:\\Accounting_Archive\\Backups');
                  }}
                  className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all text-right cursor-pointer ${
                    selectedDisk === 'D'
                      ? 'bg-indigo-600 text-white shadow-sm font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  <span>درایو محلی (D:)</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedDisk('Network');
                    setTempPath('\\\\Server-NAS\\TICK_Accounting\\DailyBackups');
                  }}
                  className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all text-right cursor-pointer ${
                    selectedDisk === 'Network'
                      ? 'bg-indigo-600 text-white shadow-sm font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>شبکه اشتراکی (NAS)</span>
                </button>
              </div>

              {/* Folder list pane */}
              <div className="md:col-span-2 border border-slate-150 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-slate-900/60 overflow-y-auto space-y-2">
                <span className="text-[10px] text-slate-400 font-bold mb-2 block">ساختار درختی فولدرها</span>

                {selectedDisk === 'C' && (
                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-450 font-medium">
                    <div className="flex items-center gap-1.5 text-slate-450 select-none">
                      <Folder className="w-4 h-4 shrink-0 text-slate-400" />
                      <span>Program Files</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-450 select-none">
                      <Folder className="w-4 h-4 shrink-0 text-slate-400" />
                      <span>Windows</span>
                    </div>
                    <div className="space-y-1.5">
                      <div 
                        onClick={() => setTempPath('C:\\TICK_Accounting')}
                        className={`flex items-center gap-1.5 p-1 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${tempPath === 'C:\\TICK_Accounting' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-black' : ''}`}
                      >
                        <FolderOpen className="w-4 h-4 shrink-0 text-amber-500" />
                        <span>TICK_Accounting</span>
                      </div>
                      <div className="mr-4 space-y-1.5 border-r border-slate-200 dark:border-slate-800 pr-2">
                        <div 
                          onClick={() => setTempPath('C:\\TICK_Accounting\\Backups')}
                          className={`flex items-center gap-1.5 p-1 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${tempPath === 'C:\\TICK_Accounting\\Backups' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-black' : ''}`}
                        >
                          <Folder className="w-4 h-4 shrink-0 text-indigo-500" />
                          <span>Backups (پیشنهادی ✨)</span>
                        </div>
                        <div 
                          onClick={() => setTempPath('C:\\TICK_Accounting\\Archives')}
                          className={`flex items-center gap-1.5 p-1 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${tempPath === 'C:\\TICK_Accounting\\Archives' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-black' : ''}`}
                        >
                          <Folder className="w-4 h-4 shrink-0 text-amber-500" />
                          <span>Archives</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-450 select-none">
                      <Folder className="w-4 h-4 shrink-0 text-slate-400" />
                      <span>Users</span>
                    </div>
                  </div>
                )}

                {selectedDisk === 'D' && (
                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-450 font-medium">
                    <div className="flex items-center gap-1.5 text-slate-450 select-none">
                      <Folder className="w-4 h-4 shrink-0 text-slate-400" />
                      <span>Documents</span>
                    </div>
                    <div className="space-y-1.5">
                      <div 
                        onClick={() => setTempPath('D:\\Accounting_Archive')}
                        className={`flex items-center gap-1.5 p-1 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${tempPath === 'D:\\Accounting_Archive' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-black' : ''}`}
                      >
                        <FolderOpen className="w-4 h-4 shrink-0 text-amber-500" />
                        <span>Accounting_Archive</span>
                      </div>
                      <div className="mr-4 space-y-1.5 border-r border-slate-200 dark:border-slate-800 pr-2">
                        <div 
                          onClick={() => setTempPath('D:\\Accounting_Archive\\Backups')}
                          className={`flex items-center gap-1.5 p-1 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${tempPath === 'D:\\Accounting_Archive\\Backups' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-black' : ''}`}
                        >
                          <Folder className="w-4 h-4 shrink-0 text-indigo-500" />
                          <span>Backups</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedDisk === 'Network' && (
                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-450 font-medium">
                    <div 
                      onClick={() => setTempPath('\\\\Server-NAS\\TICK_Accounting')}
                      className={`flex items-center gap-1.5 p-1 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${tempPath === '\\\\Server-NAS\\TICK_Accounting' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-black' : ''}`}
                    >
                      <FolderOpen className="w-4 h-4 shrink-0 text-emerald-500" />
                      <span>\\\\Server-NAS\\TICK_Accounting</span>
                    </div>
                    <div className="mr-4 space-y-1.5 border-r border-slate-200 dark:border-slate-800 pr-2">
                      <div 
                        onClick={() => setTempPath('\\\\Server-NAS\\TICK_Accounting\\DailyBackups')}
                        className={`flex items-center gap-1.5 p-1 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${tempPath === '\\\\Server-NAS\\TICK_Accounting\\DailyBackups' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-black' : ''}`}
                      >
                        <Folder className="w-4 h-4 shrink-0 text-indigo-500" />
                        <span>DailyBackups</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Custom input path footer inside modal */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="space-y-1 text-right">
                <label className="text-[10px] text-slate-400 font-black block">مسیر نهایی یا دستی خود را وارد یا ویرایش کنید:</label>
                <input
                  type="text"
                  value={tempPath}
                  onChange={(e) => setTempPath(e.target.value)}
                  className="w-full p-2.5 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  dir="ltr"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsDirPickerOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-850 dark:hover:bg-slate-800 dark:text-slate-300 text-xs font-black rounded-xl cursor-pointer transition-all"
                >
                  انصراف
                </button>
                <button
                  onClick={async () => {
                    await setBackupStoragePath(tempPath);
                    setInputPath(tempPath);
                    setIsDirPickerOpen(false);
                    setSuccessMsg(`مسیر ذخیره‌سازی بکاپ با موفقیت به "${tempPath}" تغییر یافت.`);
                    setTimeout(() => setSuccessMsg(null), 5000);
                  }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl cursor-pointer transition-all shadow-md shadow-indigo-500/10"
                >
                  تایید و ذخیره مسیر
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Completion & Verification Success Modal (پاپ‌آپ پایان موفقیت‌آمیز بازیابی) */}
      {showRestoreSuccessModal && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 popup-overlay-global backdrop-blur-sm" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl popup-box-global text-right animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header with Success Icon */}
            <div className="flex flex-col items-center text-center space-y-3 pb-2">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  اطلاعات به درستی بازیابی شد و سیستم آماده به کار است
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed">
                  تمامی داده‌ها، پایگاه داده، فایل‌های پیوست و تنظیمات به صورت ۱۰۰٪ کامل و با سرعت بالا بازنشانی و جای‌گیری شدند.
                </p>
              </div>
            </div>

            {/* Metrics & Info Card */}
            <div className="bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 font-bold">تعداد بخش‌ها و کلیدهای دیتابیس:</span>
                <span className="font-black text-indigo-600 dark:text-indigo-400 font-mono text-sm">{restoreStats.keysCount} جدول / متغیر</span>
              </div>

              {restoreStats.filesCount > 0 && (
                <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/60 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 font-bold">تعداد فایل‌های پیوست بازیابی‌شده:</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 font-mono text-sm">{restoreStats.filesCount} فایل</span>
                </div>
              )}

              {restoreStats.emergencyFile && (
                <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500 dark:text-slate-400">
                  <span className="font-bold">بکاپ اضطراری سرور:</span>
                  <span className="font-mono text-[10px] bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded-md text-slate-700 dark:text-slate-300 truncate max-w-[200px]" dir="ltr">
                    {restoreStats.emergencyFile}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>تمام کش‌های حافظه محلی مرورگر و دیتابیس سرور همگام و پایدار شدند.</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={handleFinishAndReload}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-black rounded-2xl cursor-pointer transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>بارگذاری مجدد و ورود به سامانه (آماده به کار)</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

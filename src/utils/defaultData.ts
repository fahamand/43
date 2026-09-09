import { User, Counterpart, WarehouseItem, BankTransaction, BankAccount, TransactionCategory, ChecklistItem, FiscalYear, Invoice, AccountingDocument, Partner, WebMessenger, UserCustomMessengerIcon, WarehouseCategoryItem, StockAdjustmentLog } from '../types';

export const DEFAULT_USERS: User[] = [];

export const DEFAULT_FISCAL_YEAR: FiscalYear = {
  id: '',
  year: '',
  startDate: '',
  endDate: '',
  registered: false,
  createdBy: '',
  setupDate: ''
};

export const DEFAULT_COUNTERPARTS: Counterpart[] = [];

export const DEFAULT_ITEMS: WarehouseItem[] = [];

export const DEFAULT_ACCOUNTS: BankAccount[] = [];

export const DEFAULT_PARTNERS: Partner[] = [];

export const DEFAULT_CATEGORIES: TransactionCategory[] = [];

export const DEFAULT_CHECKLIST: ChecklistItem[] = [];

export const DEFAULT_BANK_TRANSACTIONS: BankTransaction[] = [];

export const DEFAULT_INVOICES: Invoice[] = [];

export const DEFAULT_ACCOUNTING_DOCS: AccountingDocument[] = [];

export const DEFAULT_WAREHOUSE_CATEGORIES_LIST: WarehouseCategoryItem[] = [];

export const DEFAULT_WAREHOUSE_STOCK_ADJUSTMENT_LOGS: StockAdjustmentLog[] = [];

let memoryWarehouseCategoriesList: WarehouseCategoryItem[] = DEFAULT_WAREHOUSE_CATEGORIES_LIST;

export function getStoredWarehouseCategoriesList(): WarehouseCategoryItem[] {
  return memoryWarehouseCategoriesList || DEFAULT_WAREHOUSE_CATEGORIES_LIST;
}

export function setStoredWarehouseCategoriesList(list: WarehouseCategoryItem[]): void {
  if (Array.isArray(list)) {
    memoryWarehouseCategoriesList = list;
  } else {
    memoryWarehouseCategoriesList = DEFAULT_WAREHOUSE_CATEGORIES_LIST;
  }
}

let memoryWarehouseStockAdjustmentLogs: StockAdjustmentLog[] = DEFAULT_WAREHOUSE_STOCK_ADJUSTMENT_LOGS;

export function getStoredWarehouseStockAdjustmentLogs(): StockAdjustmentLog[] {
  return memoryWarehouseStockAdjustmentLogs || DEFAULT_WAREHOUSE_STOCK_ADJUSTMENT_LOGS;
}

export function setStoredWarehouseStockAdjustmentLogs(logs: StockAdjustmentLog[]): void {
  if (Array.isArray(logs)) {
    memoryWarehouseStockAdjustmentLogs = logs;
  } else {
    memoryWarehouseStockAdjustmentLogs = DEFAULT_WAREHOUSE_STOCK_ADJUSTMENT_LOGS;
  }
}

export const DEFAULT_CUSTOM_ICONS: { id: string; name: string; iconData: string }[] = [
  { id: 'icon-eitaa', name: 'ایتا', iconData: '' },
  { id: 'icon-telegram', name: 'تلگرام', iconData: '' },
  { id: 'icon-whatsapp', name: 'واتساپ', iconData: '' },
  { id: 'icon-bale', name: 'بله', iconData: '' },
  { id: 'icon-instagram', name: 'اینستاگرام', iconData: '' },
  { id: 'icon-phone', name: 'تماس تلفنی / حضوری', iconData: '' }
];

export const DEFAULT_SHIPPING_METHODS: { id: string; name: string; iconData: string; note?: string }[] = [
  { id: 'ship-courier', name: 'پیک موتوری شهری', iconData: '', note: 'تحویل سریع در همان روز درون‌شهری - هزینه پیک به عهده مشتری می‌باشد.' },
  { id: 'ship-post', name: 'پست پیشتاز سراسری', iconData: '', note: 'تحویل ۲ الی ۴ روز کاری در سراسر کشور با کد رهگیری پستی.' },
  { id: 'ship-tipax', name: 'تیپاکس اکسپرس', iconData: '', note: 'ارسال سریع بین‌شهری درب محل با رهگیری پیامکی.' },
  { id: 'ship-freight', name: 'باربری بین‌شهری و باربری ریلی/هوایی', iconData: '', note: 'مناسب مرسولات حجیم و سنگین تجاری - تحویل در انبار مقصد.' },
  { id: 'ship-in-person', name: 'تحویل حضوری در فروشگاه / انبار', iconData: '', note: 'مراجعه حضوری مشتری به محل انبار مرکزی.' },
  { id: 'ship-snapp', name: 'اسنپ باکس / تپسی پیک', iconData: '', note: 'ارسال فوری و لحظه‌ای با ناوگان آنلاین.' }
];

export const DEFAULT_ACQUAINTANCE_METHODS: { id: string; name: string; iconData: string }[] = [
  { id: 'acq-instagram', name: 'اینستاگرام و شبکه‌های اجتماعی', iconData: '' },
  { id: 'acq-referral', name: 'معرفی دوستان و همکاران', iconData: '' },
  { id: 'acq-google', name: 'جستجو در گوگل و وب‌سایت', iconData: '' },
  { id: 'acq-ads', name: 'تبلیغات و پیامک', iconData: '' },
  { id: 'acq-storefront', name: 'تابلو فروشگاه و مراجعه حضوری', iconData: '' },
  { id: 'acq-website', name: 'سایت و فروشگاه آنلاین', iconData: '' }
];

let memoryCustomIcons: { id: string; name: string; iconData: string }[] = DEFAULT_CUSTOM_ICONS;

export function getStoredCustomIcons(): { id: string; name: string; iconData: string }[] {
  return memoryCustomIcons || DEFAULT_CUSTOM_ICONS;
}

export function setStoredCustomIcons(icons: { id: string; name: string; iconData: string }[]): void {
  if (Array.isArray(icons)) {
    memoryCustomIcons = icons;
  } else {
    memoryCustomIcons = DEFAULT_CUSTOM_ICONS;
  }
}

let memoryShippingMethods: { id: string; name: string; iconData: string; note?: string }[] = DEFAULT_SHIPPING_METHODS;

export function getStoredShippingMethods(): { id: string; name: string; iconData: string; note?: string }[] {
  return memoryShippingMethods || DEFAULT_SHIPPING_METHODS;
}

export function setStoredShippingMethods(methods: { id: string; name: string; iconData: string; note?: string }[]): void {
  if (Array.isArray(methods)) {
    memoryShippingMethods = methods;
  } else {
    memoryShippingMethods = DEFAULT_SHIPPING_METHODS;
  }
}

let memoryAcquaintanceMethods: { id: string; name: string; iconData: string }[] = DEFAULT_ACQUAINTANCE_METHODS;

export function getStoredAcquaintanceMethods(): { id: string; name: string; iconData: string }[] {
  return memoryAcquaintanceMethods || DEFAULT_ACQUAINTANCE_METHODS;
}

export function setStoredAcquaintanceMethods(methods: { id: string; name: string; iconData: string }[]): void {
  if (Array.isArray(methods)) {
    memoryAcquaintanceMethods = methods;
  } else {
    memoryAcquaintanceMethods = DEFAULT_ACQUAINTANCE_METHODS;
  }
}

export const DEFAULT_SELLER_NAME = 'فروشگاه قطعات و خدمات مرکزی';
export const DEFAULT_SELLER_REG_NO = '۱۳۴۲۲۹۰';
export const DEFAULT_SELLER_ADDRESS = 'تهران، برج نگین طرشت';
export const DEFAULT_SELLER_PHONE = '09364739988';
export const DEFAULT_INVOICE_PAPER_SIZE = 'A5_landscape';

export interface SystemCustomField {
  id: string;
  name: string;
  fieldType?: 'text' | 'number' | 'date' | 'select' | 'boolean';
  targetEntity?: 'invoice' | 'item' | 'counterpart' | 'transaction' | 'general';
  options?: string[];
  required?: boolean;
  defaultValue?: any;
  order?: number;
  [key: string]: any;
}

export const DEFAULT_SYSTEM_CUSTOM_FIELDS: SystemCustomField[] = [];
export const DEFAULT_BACKUP_AUTO_INTERVAL: string = 'daily';
export const DEFAULT_PROFORMA_TAB_ENABLED: boolean = true;
export const DEFAULT_FLOATING_CALC_VISIBLE: boolean = true;
export const DEFAULT_ZOOM_LEVEL: number = 100;
export const DEFAULT_BACKUP_STORAGE_PATH: string = 'C:\\TICK_Accounting\\Backups';

let memorySellerName: string = DEFAULT_SELLER_NAME;
let memorySellerRegNo: string = DEFAULT_SELLER_REG_NO;
let memorySellerAddress: string = DEFAULT_SELLER_ADDRESS;
let memorySellerPhone: string = DEFAULT_SELLER_PHONE;
let memoryInvoicePaperSize: string = DEFAULT_INVOICE_PAPER_SIZE;
let memorySystemCustomFields: SystemCustomField[] = DEFAULT_SYSTEM_CUSTOM_FIELDS;
let memoryBackupAutoInterval: string = DEFAULT_BACKUP_AUTO_INTERVAL;
let memoryProformaTabEnabled: boolean = DEFAULT_PROFORMA_TAB_ENABLED;
let memoryFloatingCalcVisible: boolean = DEFAULT_FLOATING_CALC_VISIBLE;
let memoryGlobalZoomLevel: number = DEFAULT_ZOOM_LEVEL;
let memoryUserZoomLevels: Record<string, number> = {};
let memoryBackupStoragePath: string = DEFAULT_BACKUP_STORAGE_PATH;
let memoryUserBackupStoragePaths: Record<string, string> = {};

export function getStoredSellerName(): string {
  return memorySellerName || DEFAULT_SELLER_NAME;
}

export function setStoredSellerName(name: string): void {
  if (typeof name === 'string') {
    memorySellerName = name;
  } else {
    memorySellerName = DEFAULT_SELLER_NAME;
  }
}

export function getStoredSellerRegNo(): string {
  return memorySellerRegNo || DEFAULT_SELLER_REG_NO;
}

export function setStoredSellerRegNo(regNo: string): void {
  if (typeof regNo === 'string') {
    memorySellerRegNo = regNo;
  } else {
    memorySellerRegNo = DEFAULT_SELLER_REG_NO;
  }
}

export function getStoredSellerAddress(): string {
  return memorySellerAddress || DEFAULT_SELLER_ADDRESS;
}

export function setStoredSellerAddress(address: string): void {
  if (typeof address === 'string') {
    memorySellerAddress = address;
  } else {
    memorySellerAddress = DEFAULT_SELLER_ADDRESS;
  }
}

export function getStoredSellerPhone(): string {
  return memorySellerPhone || DEFAULT_SELLER_PHONE;
}

export function setStoredSellerPhone(phone: string): void {
  if (typeof phone === 'string') {
    memorySellerPhone = phone;
  } else {
    memorySellerPhone = DEFAULT_SELLER_PHONE;
  }
}

export function getStoredInvoicePaperSize(): string {
  return memoryInvoicePaperSize || DEFAULT_INVOICE_PAPER_SIZE;
}

export function setStoredInvoicePaperSize(size: string): void {
  if (typeof size === 'string' && size.trim().length > 0) {
    memoryInvoicePaperSize = size;
  } else {
    memoryInvoicePaperSize = DEFAULT_INVOICE_PAPER_SIZE;
  }
}

export function getStoredSystemCustomFields(): SystemCustomField[] {
  return memorySystemCustomFields || DEFAULT_SYSTEM_CUSTOM_FIELDS;
}

export function setStoredSystemCustomFields(fields: SystemCustomField[]): void {
  if (Array.isArray(fields)) {
    memorySystemCustomFields = fields;
  } else {
    memorySystemCustomFields = DEFAULT_SYSTEM_CUSTOM_FIELDS;
  }
}

export function getStoredBackupAutoInterval(): string {
  return memoryBackupAutoInterval || DEFAULT_BACKUP_AUTO_INTERVAL;
}

export function setStoredBackupAutoInterval(interval: string): void {
  if (typeof interval === 'string' && interval.trim().length > 0) {
    memoryBackupAutoInterval = interval;
  } else {
    memoryBackupAutoInterval = DEFAULT_BACKUP_AUTO_INTERVAL;
  }
}

export function getStoredProformaTabEnabled(): boolean {
  return typeof memoryProformaTabEnabled === 'boolean' ? memoryProformaTabEnabled : DEFAULT_PROFORMA_TAB_ENABLED;
}

export function setStoredProformaTabEnabled(enabled: boolean): void {
  memoryProformaTabEnabled = Boolean(enabled);
}

export function getStoredFloatingCalcVisible(): boolean {
  return typeof memoryFloatingCalcVisible === 'boolean' ? memoryFloatingCalcVisible : DEFAULT_FLOATING_CALC_VISIBLE;
}

export function setStoredFloatingCalcVisible(visible: boolean): void {
  memoryFloatingCalcVisible = Boolean(visible);
}

export function getStoredGlobalZoomLevel(): number {
  if (typeof memoryGlobalZoomLevel === 'number' && !isNaN(memoryGlobalZoomLevel) && memoryGlobalZoomLevel >= 50 && memoryGlobalZoomLevel <= 200) {
    return memoryGlobalZoomLevel;
  }
  return DEFAULT_ZOOM_LEVEL;
}

export function setStoredGlobalZoomLevel(level: number): void {
  const parsed = typeof level === 'number' ? level : parseInt(String(level), 10);
  if (!isNaN(parsed) && parsed >= 50 && parsed <= 200) {
    memoryGlobalZoomLevel = Math.round(parsed);
  } else {
    memoryGlobalZoomLevel = DEFAULT_ZOOM_LEVEL;
  }
}

export function getStoredUserZoomLevel(userId?: string): number {
  if (userId && memoryUserZoomLevels[userId] !== undefined) {
    const userZoom = memoryUserZoomLevels[userId];
    if (typeof userZoom === 'number' && !isNaN(userZoom) && userZoom >= 50 && userZoom <= 200) {
      return userZoom;
    }
  }
  return getStoredGlobalZoomLevel();
}

export function setStoredUserZoomLevel(userId: string, level: number): void {
  if (!userId) return;
  const parsed = typeof level === 'number' ? level : parseInt(String(level), 10);
  if (!isNaN(parsed) && parsed >= 50 && parsed <= 200) {
    memoryUserZoomLevels[userId] = Math.round(parsed);
  }
}

export function getStoredBackupStoragePath(userId?: string): string {
  if (userId && memoryUserBackupStoragePaths[userId]) {
    const userPath = memoryUserBackupStoragePaths[userId];
    if (typeof userPath === 'string' && userPath.trim() !== '') {
      return userPath.trim();
    }
  }
  if (typeof memoryBackupStoragePath === 'string' && memoryBackupStoragePath.trim() !== '') {
    return memoryBackupStoragePath.trim();
  }
  return DEFAULT_BACKUP_STORAGE_PATH;
}

export function setStoredBackupStoragePath(path: string, userId?: string): void {
  if (typeof path === 'string' && path.trim() !== '') {
    const cleanPath = path.trim();
    memoryBackupStoragePath = cleanPath;
    if (userId) {
      memoryUserBackupStoragePaths[userId] = cleanPath;
    }
  } else {
    memoryBackupStoragePath = DEFAULT_BACKUP_STORAGE_PATH;
    if (userId) {
      delete memoryUserBackupStoragePaths[userId];
    }
  }
}

export const DEFAULT_WEB_MESSENGERS: WebMessenger[] = [
  {
    id: 'wm-eitaa',
    title: 'ایتا وب (پشتیبانی و فروش)',
    url: 'https://web.eitaa.com',
    icon: 'eitaa',
    allowedUserIds: [], // Empty array = all users
    windowWidth: 1080,
    windowHeight: 720,
    category: 'پیام‌رسان داخلی',
    description: 'نسخه وب پیام‌رسان ایتا جهت پاسخگویی به مشتریان'
  },
  {
    id: 'wm-telegram',
    title: 'تلگرام وب (ارتباط با مشتریان)',
    url: 'https://web.telegram.org',
    icon: 'telegram',
    allowedUserIds: [],
    windowWidth: 1080,
    windowHeight: 720,
    category: 'شبکه اجتماعی',
    description: 'نسخه وب تلگرام رسمی برای پشتیبانی و اطلاع‌رسانی'
  },
  {
    id: 'wm-whatsapp',
    title: 'واتساپ وب (پاسخگویی سریع)',
    url: 'https://web.whatsapp.com',
    icon: 'whatsapp',
    allowedUserIds: [],
    windowWidth: 1100,
    windowHeight: 750,
    category: 'پیام‌رسان بین‌المللی',
    description: 'نسخه وب واتساپ تجاری فروشگاه'
  },
  {
    id: 'wm-bale',
    title: 'بله وب (پیام‌رسان و بانکی)',
    url: 'https://web.bale.ai',
    icon: 'bale',
    allowedUserIds: [],
    windowWidth: 1080,
    windowHeight: 720,
    category: 'پیام‌رسان داخلی',
    description: 'نسخه وب پیام‌رسان بله بانک ملی'
  },
  {
    id: 'wm-rubika',
    title: 'روبیکا وب (فروشگاه و کانال)',
    url: 'https://web.rubika.ir',
    icon: 'rubika',
    allowedUserIds: [],
    windowWidth: 1080,
    windowHeight: 720,
    category: 'شبکه اجتماعی',
    description: 'نسخه وب روبیکا برای پیگیری سفارشات'
  },
  {
    id: 'wm-soroush',
    title: 'سروش پلاس وب',
    url: 'https://web.srub.ir',
    icon: 'soroush',
    allowedUserIds: [],
    windowWidth: 1050,
    windowHeight: 700,
    category: 'پیام‌رسان داخلی',
    description: 'نسخه وب پیام‌رسان سروش پلاس'
  }
];

let memoryWebMessengers: WebMessenger[] = DEFAULT_WEB_MESSENGERS;
let memoryUserMessengerIcons: UserCustomMessengerIcon[] = [];

export function getStoredWebMessengers(): WebMessenger[] {
  return memoryWebMessengers || DEFAULT_WEB_MESSENGERS;
}

export function setStoredWebMessengers(messengers: WebMessenger[]): void {
  if (Array.isArray(messengers) && messengers.length > 0) {
    memoryWebMessengers = messengers;
  } else {
    memoryWebMessengers = DEFAULT_WEB_MESSENGERS;
  }
}

export async function saveStoredWebMessengers(messengers: WebMessenger[]): Promise<boolean> {
  let saved = false;
  try {
    const res = await fetch('/api/system/web-messengers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messengers })
    });
    if (res.ok) {
      const json = await res.json();
      if (json && (json.status === 'success' || !json.error)) {
        saved = true;
      }
    }
  } catch (err) {
    console.error('Error saving web messengers to MySQL API:', err);
  }

  // Backup fallback endpoint if primary endpoint failed
  if (!saved) {
    try {
      const res = await fetch('/api/settings_store/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'acc_system_web_messengers', data: messengers })
      });
      if (res.ok) {
        const json = await res.json();
        if (json && (json.status === 'success' || !json.error)) {
          saved = true;
        }
      }
    } catch (_) {}
  }

  // ONLY upon API success, update state and purge legacy localStorage
  if (saved) {
    setStoredWebMessengers(messengers);
    try {
      localStorage.removeItem('acc_system_web_messengers');
      localStorage.removeItem('fahamacc_acc_system_web_messengers');
      localStorage.removeItem('acc_app_acc_system_web_messengers');
      localStorage.removeItem('web_messengers');
      sessionStorage.removeItem('acc_system_web_messengers');
      sessionStorage.removeItem('fahamacc_acc_system_web_messengers');
      sessionStorage.removeItem('acc_app_acc_system_web_messengers');
    } catch (_) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('acc_app_web_messengers_updated', { detail: messengers }));
      window.dispatchEvent(new CustomEvent('web-messengers-updated', { detail: messengers }));
    }
  }

  return saved;
}

export function openWebMessengerPopup(messenger: WebMessenger): void {
  if (!messenger || !messenger.url) return;
  const windowName = `web_messenger_${messenger.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const width = messenger.windowWidth || 1080;
  const height = messenger.windowHeight || 720;
  const left = Math.max(0, Math.round((window.screen.width - width) / 2));
  const top = Math.max(0, Math.round((window.screen.height - height) / 2));
  const features = `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes,toolbar=no,menubar=no,location=yes`;

  if (!window._messengerWindows) {
    window._messengerWindows = {};
  }

  const existing = window._messengerWindows[messenger.id];
  if (existing && !existing.closed) {
    try {
      existing.focus();
      return;
    } catch (e) {
      // Cross-origin or focus catch
    }
  }

  try {
    const win = window.open(messenger.url, windowName, features);
    if (win) {
      window._messengerWindows[messenger.id] = win;
      win.focus();
    } else {
      window.open(messenger.url, '_blank');
    }
  } catch (err) {
    console.error('Failed to open web messenger popup:', err);
    window.open(messenger.url, '_blank');
  }
}

export function getStoredUserCustomMessengerIcons(userId?: string): UserCustomMessengerIcon[] {
  const allIcons = memoryUserMessengerIcons || [];
  if (!userId) return allIcons;
  return allIcons.filter((i: UserCustomMessengerIcon) => !i.userId || i.userId === userId);
}

export function setStoredUserCustomMessengerIcons(icons: UserCustomMessengerIcon[]): void {
  if (Array.isArray(icons)) {
    memoryUserMessengerIcons = icons;
  } else {
    memoryUserMessengerIcons = [];
  }
}

export async function saveStoredUserCustomMessengerIcons(icons: UserCustomMessengerIcon[]): Promise<boolean> {
  let saved = false;
  try {
    const res = await fetch('/api/system/user-messenger-icons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icons })
    });
    if (res.ok) {
      const json = await res.json();
      if (json && (json.status === 'success' || !json.error)) {
        saved = true;
      }
    }
  } catch (err) {
    console.error('Error saving user messenger icons to MySQL API:', err);
  }

  // Backup fallback endpoint if primary endpoint failed
  if (!saved) {
    try {
      const res = await fetch('/api/settings_store/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'acc_system_user_messenger_icons', data: icons })
      });
      if (res.ok) {
        const json = await res.json();
        if (json && (json.status === 'success' || !json.error)) {
          saved = true;
        }
      }
    } catch (_) {}
  }

  // ONLY upon API success, update in-memory state and purge legacy localStorage
  if (saved) {
    setStoredUserCustomMessengerIcons(icons);
    try {
      localStorage.removeItem('acc_system_user_messenger_icons');
      localStorage.removeItem('fahamacc_acc_system_user_messenger_icons');
      localStorage.removeItem('acc_app_acc_system_user_messenger_icons');
      localStorage.removeItem('user_messenger_icons');
      sessionStorage.removeItem('acc_system_user_messenger_icons');
      sessionStorage.removeItem('fahamacc_acc_system_user_messenger_icons');
      sessionStorage.removeItem('acc_app_acc_system_user_messenger_icons');
    } catch (_) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('acc_app_user_messenger_icons_updated', { detail: icons }));
      window.dispatchEvent(new CustomEvent('user-messenger-icons-updated', { detail: icons }));
    }
  }

  return saved;
}

export interface FontOption {
  id: string;
  name: string;
  category?: string;
  previewText?: string;
}

export const FONTS_LIST: FontOption[] = [
  { id: 'Vazirmatn', name: 'وزیرمتن (Vazirmatn)', category: 'استاندارد و اداری', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Shabnam', name: 'شبنم (Shabnam)', category: 'مدرن و نرم', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Sahel', name: 'ساحل (Sahel)', category: 'هندسی و خوانا', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Samim', name: 'صمیم (Samim)', category: 'ساده و روان', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Tanha', name: 'تنها (Tanha)', category: 'فشرده و صمیمی', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Parastoo', name: 'پرستو (Parastoo)', category: 'کلاسیک و رسمی', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Gandom', name: 'گندم (Gandom)', category: 'متوازن و چشم‌نواز', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Vazir', name: 'وزیر کلاسیک (Vazir)', category: 'ساده و سنتی', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Lalezar', name: 'لاله‌زار (Lalezar)', category: 'فانتزی و نمایشی', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'NotoSansArabic', name: 'نوتو سنس عربی (Noto Sans Arabic)', category: 'جهانی و مدرن', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Amiri', name: 'امیری (Amiri)', category: 'نسخ و کتابی', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Rubik', name: 'روبیک (Rubik)', category: 'مدرن و پویا', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'IRANSans', name: 'ایران سنس (IRANSans)', category: 'محبوب سازمانی', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Yekan', name: 'یکان (Yekan / B Yekan)', category: 'کلاسیک ایرانی', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' },
  { id: 'Traffic', name: 'ترافیک (Traffic / B Traffic)', category: 'اداری و تیتر', previewText: 'سامانه حسابداری و مدیریت مالی فهامند ۳.۲' }
];

export function getFontFamilyStack(fontId: string): string {
  switch (fontId) {
    case 'Vazirmatn':
      return "'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Tahoma, Arial, sans-serif";
    case 'Shabnam':
      return "'Shabnam', 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif";
    case 'Sahel':
      return "'Sahel', 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif";
    case 'Samim':
      return "'Samim', 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif";
    case 'Tanha':
      return "'Tanha', 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif";
    case 'Parastoo':
      return "'Parastoo', 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif";
    case 'Gandom':
      return "'Gandom', 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif";
    case 'Vazir':
      return "'Vazir', 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif";
    case 'Lalezar':
      return "'Lalezar', 'Vazirmatn', cursive, sans-serif";
    case 'NotoSansArabic':
      return "'Noto Sans Arabic', 'Vazirmatn', sans-serif";
    case 'Amiri':
      return "'Amiri', 'Vazirmatn', serif, sans-serif";
    case 'Rubik':
      return "'Rubik', 'Vazirmatn', sans-serif";
    case 'IRANSans':
      return "'IRANSans', 'IRANSansWeb', 'IRAN Sans', 'Iran Sans', 'Sahel', 'Vazirmatn', Tahoma, sans-serif";
    case 'Yekan':
      return "'Yekan', 'BYekan', 'B Yekan', 'IRANYekan', 'Samim', 'Vazirmatn', Tahoma, sans-serif";
    case 'Traffic':
      return "'Traffic', 'B Traffic', 'BTraffic', 'Shabnam', 'Vazirmatn', Tahoma, sans-serif";
    default:
      return `'${fontId}', 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Tahoma, Arial, sans-serif`;
  }
}

export function applySystemFont(fontId: string): void {
  if (typeof document === 'undefined') return;
  const stack = getFontFamilyStack(fontId);
  
  // Enforce Persian RTL direction globally
  if (document.documentElement) {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'fa');
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'fa';
  }
  if (document.body) {
    document.body.setAttribute('dir', 'rtl');
    document.body.dir = 'rtl';
  }
  
  // Set CSS Variables on root
  document.documentElement.style.setProperty('--app-font', stack);
  document.documentElement.style.setProperty('--font-sans', stack);
  document.documentElement.style.setProperty('--font-mono', stack);
  document.documentElement.style.setProperty('--font-serif', stack);
  document.documentElement.style.fontFamily = stack;
  
  if (document.body) {
    document.body.style.fontFamily = stack;
  }

  // Inject or update absolute CSS override rule in document.head
  let styleEl = document.getElementById('global-app-font-override') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'global-app-font-override';
    document.head.appendChild(styleEl);
  }

  styleEl.innerHTML = `
    :root {
      --app-font: ${stack} !important;
      --font-sans: ${stack} !important;
      --font-mono: ${stack} !important;
      --font-serif: ${stack} !important;
      font-family: ${stack} !important;
    }
    html, body, #root, #root * {
      font-family: ${stack} !important;
    }
    *, *::before, *::after,
    input, button, select, textarea, optgroup, option,
    table, thead, tbody, tfoot, tr, th, td,
    span, p, h1, h2, h3, h4, h5, h6, a, div, label,
    code, pre, kbd, samp, i, b, strong, em, small, sub, sup,
    svg text, svg tspan,
    .font-mono, .font-sans, .font-serif,
    [class*="font-mono"], [class*="font-sans"], [class*="font-serif"] {
      font-family: ${stack} !important;
    }
  `;
}

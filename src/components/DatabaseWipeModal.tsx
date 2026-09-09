import React, { useState } from 'react';
import { 
  X, AlertTriangle, Trash2, CheckSquare, Square, RefreshCw, ShieldAlert, 
  ShoppingCart, Boxes, FileText, Wallet, Users, Calendar, Settings, Bot,
  CheckCircle2, Layers, Tag, Search, ChevronDown, ChevronUp, SlidersHorizontal,
  Filter
} from 'lucide-react';
import { AppState } from '../types';
import { toPersianDigits } from '../utils/stateManager';
import { getStoredShippingMethods } from '../utils/defaultData';

export interface DatabaseWipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmWipe: (selectedItemIds: string[]) => Promise<void>;
  isProcessing?: boolean;
  appState?: AppState;
}

export interface WipeItem {
  id: string;
  label: string;
  description: string;
  badge?: string;
}

export interface WipeCategory {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  description: string;
  items: WipeItem[];
}

export const WIPE_CATEGORIES: WipeCategory[] = [
  {
    id: 'commerce',
    title: 'فاکتورها، معاملات و بازاریابی',
    icon: ShoppingCart,
    color: 'amber',
    description: 'مدیریت و تفکیک انواع فاکتورها، پیش‌فاکتورها، روش‌های ارسال و پورسانت‌ها',
    items: [
      { id: 'invoices', label: 'کلیه فاکتورها و پیش‌فاکتورها (یکجا)', description: 'پاکسازی کامل تمام فاکتورهای فروش، خرید، پیش‌فاکتورها و اقلام نمونه دمو' },
      { id: 'invoices_sales', label: 'فقط فاکتورهای فروش قطعی', description: 'تفکیک و پاکسازی اختصاصی فاکتورهای صادرشده فروش' },
      { id: 'invoices_purchase', label: 'فقط فاکتورهای خرید ورود کالا', description: 'تفکیک و پاکسازی اختصاصی فاکتورهای خرید کالا' },
      { id: 'invoices_proforma', label: 'فقط پیش‌فاکتورها', description: 'پاکسازی اختصاصی پیش‌فاکتورها و پیشنهادهای قیمت' },
      { id: 'shipping_methods', label: 'روش‌های ارسال سفارشی', description: 'اطلاعات روش‌ها و هزینه‌های تحویل و ارسال بار' },
      { id: 'commissionSettlements', label: 'سوابق تسویه پورسانت بازاریابی', description: 'تاریخچه و مبالغ پورسانت‌های تسویه‌شده و پرداخت‌های فروشندگان' },
      { id: 'commissionTags', label: 'تگ‌ها و درصد‌های پورسانت ویژه', description: 'تعاریف و برچسب‌های درصد پورسانت اختصاصی کالاها' }
    ]
  },
  {
    id: 'inventory',
    title: 'انبار و کالاها (موجودی انبار)',
    icon: Boxes,
    color: 'emerald',
    description: 'تفکیک اجناس فیزیکی، خدمات، کالاهای بدون موجودی، دسته‌ها و سوابق انبارگردانی',
    items: [
      { id: 'items', label: 'کلیه کالاها و خدمات انبار (یکجا)', description: 'پاکسازی کامل تمام کالاها، خدمات و موجودی‌های عددی انبار' },
      { id: 'items_goods', label: 'فقط کالاهای فیزیکی و اجناس انبار', description: 'تفکیک و پاکسازی اجناس دارای موجودی فیزیکی و انبارداری' },
      { id: 'items_services', label: 'فقط خدمات و سرویس‌های خدماتی', description: 'تفکیک و پاکسازی آیتم‌های خدماتی و کارهای غیرفیزیکی' },
      { id: 'items_stock_zero', label: 'فقط کالاهای با موجودی صفر', description: 'تفکیک و پاکسازی کالاهای اتمام‌یافته و بدون موجودی در انبار' },
      { id: 'categories', label: 'دسته‌بندی‌ها و گروه‌های کالا', description: 'گروه‌ها، زیردسته‌ها و دسته‌بندی‌های انبار و کالاها' },
      { id: 'warehouse_stock_adjustment_logs', label: 'سوابق اصلاح و انبارگردانی', description: 'تاریخچه کسر/اضافه‌ها، اصلاحات موجودی و صورتمجلس انبارگردانی' }
    ]
  },
  {
    id: 'finance',
    title: 'اسناد، بانک و تراکنش‌های مالی',
    icon: FileText,
    color: 'indigo',
    description: 'تفکیک اسناد دستی/سیستمی، گردش حساب‌ها، بیعانه‌ها، پیامک‌ها و وام‌ها',
    items: [
      { id: 'docs', label: 'کلیه اسناد حسابداری (یکجا)', description: 'پاکسازی کامل تمامی اسناد رسمی، دستی و سیستمی ثبت‌شده' },
      { id: 'docs_manual', label: 'فقط اسناد حسابداری دستی', description: 'پاکسازی اختصاصی اسناد صادرشده به‌صورت دستی توسط کاربر' },
      { id: 'docs_auto', label: 'فقط اسناد سیستمی / اتوماتیک', description: 'پاکسازی اختصاصی اسناد صادرشده خودکار ناشی از فاکتورها' },
      { id: 'transactions', label: 'کلیه صورتحساب و تراکنش‌های بانکی (یکجا)', description: 'پاکسازی کامل ریز گردش حساب‌ها و واریز/برداشت‌ها' },
      { id: 'transactions_income', label: 'فقط تراکنش‌های واریز / دریافت', description: 'تفکیک و پاکسازی ورودی‌ها و دریافتی‌های بانکی' },
      { id: 'transactions_expense', label: 'فقط تراکنش‌های برداشت / پرداخت', description: 'تفکیک و پاکسازی خروجی‌ها و پرداختی‌های بانکی' },
      { id: 'pendingDeposits', label: 'واریزی‌ها و بیعانه‌های معلق', description: 'پاکسازی کامل بیعانه‌های در انتظار و فیش‌های بانکی بررسی‌نشده' },
      { id: 'bankSmsMessages', label: 'پیامک‌های واریز/برداشت بانکی', description: 'تاریخچه پیامک‌های بانکی دریافتی در سیستم' },
      { id: 'accounts', label: 'حساب‌های بانکی و صندوق‌ها', description: 'تخلیه کامل لیست حساب‌ها، موجودی‌ها و صندوق‌های نقدی' },
      { id: 'loanBorrowers', label: 'حساب و بدهی وام‌گیرندگان', description: 'پاکسازی کامل اشخاص، وام‌ها و مانده بدهی اولیه وام‌گیرندگان' }
    ]
  },
  {
    id: 'counterparts',
    title: 'طرف حساب‌ها و شرکا',
    icon: Users,
    color: 'blue',
    description: 'تفکیک بدهکاران، بستانکاران، خریداران، تامین‌کنندگان و شرکا',
    items: [
      { id: 'counterparts', label: 'کلیه طرف حساب‌ها و مشتریان (یکجا)', description: 'پاکسازی کامل بدهکاران، بستانکاران، خریداران و فروشندگان' },
      { id: 'counterparts_debtors', label: 'فقط خریداران و طرف‌حساب‌های بدهکار', description: 'تفکیک و پاکسازی خریداران و طرف حساب‌های خریدار' },
      { id: 'counterparts_creditors', label: 'فقط تامین‌کنندگان و بستانکاران', description: 'تفکیک و پاکسازی فروشندگان و طرف حساب‌های تامین‌کننده' },
      { id: 'partners', label: 'شرکا و سهامداران', description: 'اطلاعات شرکا، سهم‌ها و درصدهای سود و زیان' }
    ]
  },
  {
    id: 'base_data',
    title: 'اطلاعات پایه، یادداشت‌ها و ارتباطات',
    icon: Calendar,
    color: 'purple',
    description: 'تفکیک سال مالی، یادداشت‌ها، نشست‌ها، اعلان‌ها و ابزارهای وب',
    items: [
      { id: 'fiscalYear', label: 'سال‌های مالی و قفل دفاتر', description: 'بازنشانی سال‌های مالی و بستن حساب‌ها به سال اولیه خام' },
      { id: 'checklist', label: 'کلیه یادداشت‌ها و لیست کارها (یکجا)', description: 'پاکسازی کامل تمام چک‌لیست‌ها و یادداشت‌های روزانه' },
      { id: 'checklist_personal', label: 'فقط یادداشت‌های شخصی', description: 'تفکیک و پاکسازی یادداشت‌های اختصاصی کاربر جاری' },
      { id: 'checklist_shared', label: 'فقط یادداشت‌های عمومی / اشتراکی', description: 'تفکیک و پاکسازی یادداشت‌های عمومی اشتراک‌گذاری‌شده' },
      { id: 'notifications', label: 'اعلان‌های سیستمی و پیام‌ها', description: 'پاکسازی تمام اعلان‌ها و هشدارهای ثبت‌شده در سیستم' },
      { id: 'webMessengers', label: 'پیام‌رسان‌های وب و ابزارهای سفارشی', description: 'پاکسازی پنجره‌ها و لینک‌های پیام‌رسان‌های وب' },
      { id: 'customMessengerIcons', label: 'آیکون‌های سفارشی پیام‌رسان‌ها', description: 'پاکسازی تصاویر و آیکون‌های آپلودشده پیام‌رسان‌ها' }
    ]
  },
  {
    id: 'settings_ai',
    title: 'تنظیمات، هوش مصنوعی و فایل‌ها',
    icon: Settings,
    color: 'slate',
    description: 'تنظیمات مشخصات فروشنده، طراح فاکتور، گفتگوهای AI و فایل‌های پیوست',
    items: [
      { id: 'settings', label: 'تنظیمات عمومی و مشخصات فروشنده', description: 'بازنشانی مشخصات فروشنده، کد اقتصادی، آدرس و لوگوی شرکت' },
      { id: 'invoice_designer', label: 'قالب‌های طراح فاکتور', description: 'پاکسازی تنظیمات سفارشی صادرکننده فاکتور' },
      { id: 'smart_assistant_chats', label: 'تاریخچه دستیار هوشمند AI', description: 'پاکسازی گفتگوها و پیام‌های ذخیره‌شده دستیار هوشمند' },
      { id: 'system_logs', label: 'لاگ‌ها و مانیتورینگ سیستم', description: 'پاکسازی تاریخچه رویدادها، خطایابی و لاگ‌های عملکردی سیستم' },
      { id: 'uploaded_files', label: 'فایل‌های پیوست و رسیدهای آپلودشده روی هاست', description: 'پاکسازی تصاویر فیش‌ها، اسناد و فایل‌های آپلودشده در سرور' }
    ]
  },
  {
    id: 'users',
    title: 'پرسنل و حساب‌های کاربری',
    icon: Users,
    color: 'emerald',
    description: 'تثبیت حساب‌های پرسنل و پاکسازی سایر اطلاعات اضافی و داده‌های دمو',
    items: [
      { 
        id: 'users', 
        label: 'اطلاعات پرسنل و کاربران (تثبیت مشخصات ورود)', 
        description: 'صرفاً نام کامل، شماره همراه، نام کاربری، نقش کاربری و رمز عبور پرسنل حفظ شده و تمامی داده‌های دیگر سیستم تخلیه می‌گردند.' 
      }
    ]
  }
];

export function getItemRecordCount(itemId: string, state?: AppState): number | null {
  if (!state) return null;
  try {
    switch (itemId) {
      case 'invoices': return state.invoices?.length || 0;
      case 'invoices_sales': return state.invoices?.filter(i => i.type === 'sale' && !i.isProforma).length || 0;
      case 'invoices_purchase': return state.invoices?.filter(i => i.type === 'purchase').length || 0;
      case 'invoices_proforma': return state.invoices?.filter(i => i.isProforma === true).length || 0;
      case 'shipping_methods': {
        return getStoredShippingMethods()?.length || 0;
      }
      case 'commissionSettlements': {
        const saved = localStorage.getItem('acc_app_commissionSettlements') || localStorage.getItem('commissionSettlements');
        return saved ? JSON.parse(saved).length : ((state as any).commissionSettlements?.length || 0);
      }
      case 'commissionTags': {
        const saved = localStorage.getItem('acc_app_commissionTags') || localStorage.getItem('commissionTags');
        return saved ? JSON.parse(saved).length : ((state as any).commissionTags?.length || 0);
      }
      case 'items': return state.items?.length || 0;
      case 'items_goods': return state.items?.filter(i => i.type === 'kala' || i.type === 'consumables' || !i.type).length || 0;
      case 'items_services': return state.items?.filter(i => i.type === 'khadamat').length || 0;
      case 'items_stock_zero': return state.items?.filter(i => (i.qty || 0) <= 0).length || 0;
      case 'categories': return state.categories?.length || 0;
      case 'warehouse_stock_adjustment_logs': return 0;
      case 'docs': return state.docs?.length || 0;
      case 'docs_manual': return state.docs?.filter(d => d.isManual === true).length || 0;
      case 'docs_auto': return state.docs?.filter(d => !d.isManual).length || 0;
      case 'transactions': return state.transactions?.length || 0;
      case 'transactions_income': return state.transactions?.filter(t => t.type === 'deposit').length || 0;
      case 'transactions_expense': return state.transactions?.filter(t => t.type === 'withdrawal').length || 0;
      case 'bankSmsMessages': return state.bankSmsMessages?.length || 0;
      case 'pendingDeposits': return state.pendingDeposits?.length || 0;
      case 'accounts': return state.accounts?.length || 0;
      case 'loanBorrowers': return state.loanBorrowers?.length || 0;
      case 'counterparts': return state.counterparts?.length || 0;
      case 'counterparts_debtors': return state.counterparts?.filter(c => c.type === 'buyer').length || 0;
      case 'counterparts_creditors': return state.counterparts?.filter(c => c.type === 'seller').length || 0;
      case 'partners': return state.partners?.length || 0;
      case 'fiscalYear': return 1;
      case 'checklist': return state.checklist?.length || 0;
      case 'checklist_personal': return state.checklist?.filter(c => !c.isPublic).length || 0;
      case 'checklist_shared': return state.checklist?.filter(c => c.isPublic === true).length || 0;
      case 'users': return state.users?.length || 0;
      case 'notifications': return (state as any).notifications?.length || 0;
      case 'webMessengers': return (state as any).webMessengers?.length || 0;
      case 'customMessengerIcons': return 0;
      case 'settings': return 1;
      case 'invoice_designer': return 1;
      case 'smart_assistant_chats': return (state as any).chatsHistory?.length || 0;
      case 'system_logs': return 0;
      case 'uploaded_files': return 1;
      default: return null;
    }
  } catch {
    return 0;
  }
}

export const DatabaseWipeModal: React.FC<DatabaseWipeModalProps> = ({
  isOpen,
  onClose,
  onConfirmWipe,
  isProcessing = false,
  appState
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirmStep, setShowConfirmStep] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Accordion state: by default, all categories are open
  const [openCategoryIds, setOpenCategoryIds] = useState<string[]>(() => 
    WIPE_CATEGORIES.map(c => c.id)
  );

  if (!isOpen) return null;

  // Collect all item IDs
  const allItemIds = WIPE_CATEGORIES.flatMap(cat => cat.items.map(item => item.id));
  const isAllSelected = allItemIds.length > 0 && allItemIds.every(id => selectedIds.includes(id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds([...allItemIds]);
    }
  };

  const handleToggleCategoryAccordion = (catId: string) => {
    setOpenCategoryIds(prev => 
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  };

  const handleExpandAllAccordions = () => {
    setOpenCategoryIds(WIPE_CATEGORIES.map(c => c.id));
  };

  const handleCollapseAllAccordions = () => {
    setOpenCategoryIds([]);
  };

  const handleToggleItem = (itemId: string) => {
    setSelectedIds(prev => 
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const handleToggleCategoryItems = (category: WipeCategory) => {
    const catItemIds = category.items.map(i => i.id);
    const isCatFullySelected = catItemIds.every(id => selectedIds.includes(id));

    if (isCatFullySelected) {
      // Unselect category items
      setSelectedIds(prev => prev.filter(id => !catItemIds.includes(id)));
    } else {
      // Select all category items
      setSelectedIds(prev => Array.from(new Set([...prev, ...catItemIds])));
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) return;
    await onConfirmWipe(selectedIds);
    setShowConfirmStep(false);
  };

  return (
    <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fadeIn popup-overlay-global">
      <div 
        style={{ 
          backgroundColor: "var(--popup-bg)", 
          borderRadius: "var(--popup-radius)", 
          boxShadow: "var(--popup-shadow)", 
          color: "var(--popup-text)", 
          borderColor: "var(--popup-border)" 
        }}
        className="border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden transition-all popup-box-global"
        dir="rtl"
      >
        {/* Modal Header */}
        <div 
          style={{ borderColor: "var(--popup-border)" }}
          className="p-4 sm:p-5 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent border-b flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-500/20 shrink-0 shadow-sm">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black flex items-center gap-2" style={{ color: "var(--popup-text)" }}>
                تخلیه و پاکسازی سفارشی دیتابیس (با قابلیت انتخاب جزئیات و زیرمجموعه‌ها)
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 rounded-full border border-rose-300 dark:border-rose-800">
                  مدیریت ارشد
                </span>
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--popup-text-muted)" }}>
                مجموعه یا زیرمجموعه‌های دقیق مورد نظر برای پاکسازی را تفکیک و انتخاب کنید. موارد انتخاب‌نشده کاملاً دست‌نخورده باقی می‌مانند.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            style={{ color: "var(--popup-text-muted)" }}
            className="p-2 hover:opacity-80 hover:bg-black/5 dark:hover:bg-white/10 rounded-2xl transition-all cursor-pointer"
            title="بستن پنجره"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Search input, Select All, Expand/Collapse Accordions */}
        <div 
          style={{ borderColor: "var(--popup-border)" }}
          className="px-4 py-3 bg-black/[0.02] dark:bg-white/[0.03] border-b flex flex-wrap items-center justify-between gap-3"
        >
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو و خلوت‌سازی سریع در عنوان یا توضیحات زیرمجموعه‌ها..."
              className="w-full pl-3 pr-9 py-1.5 bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="px-3 py-1.5 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              {isAllSelected ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>لغو انتخاب همه</span>
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                  <span>انتخاب کامل همه</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={openCategoryIds.length === WIPE_CATEGORIES.length ? handleCollapseAllAccordions : handleExpandAllAccordions}
              className="px-2.5 py-1.5 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-1 transition-all cursor-pointer"
              title="تغییر وضعیت نمایش گروه‌ها"
            >
              {openCategoryIds.length === WIPE_CATEGORIES.length ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>بستن همه آکاردئون‌ها</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>باز کردن همه آکاردئون‌ها</span>
                </>
              )}
            </button>

            {/* Selected Counter Badge */}
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 bg-white/80 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <span className="text-slate-400">انتخابی:</span>
              <span className={`px-2 py-0.5 rounded-md font-mono text-xs font-black ${
                selectedIds.length > 0 
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-300/80 dark:border-rose-800' 
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
              }`}>
                {toPersianDigits(selectedIds.length)} از {toPersianDigits(allItemIds.length)} زیرمجموعه
              </span>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Content: Categorized Accordion List */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Data Isolation & Security Guarantee Notice */}
          <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded-2xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="text-xs leading-relaxed text-indigo-950 dark:text-indigo-200">
              <strong>تضمین تفکیک و ایمنی داده‌ها:</strong> در این عملیات، <strong>تنها و منحصراً</strong> گزینه‌هایی که تیک زده و انتخاب می‌کنید پاکسازی و استانداردسازی می‌شوند. کلیه بخش‌ها و رکوردهایی که انتخاب نشده‌اند به طور صددرصد دست‌نخورده، امن و بدون هیچ تغییری در دیتابیس باقی خواهند ماند.
            </div>
          </div>

          {WIPE_CATEGORIES.map((cat) => {
            const IconComp = cat.icon;
            const isOpenAccordion = openCategoryIds.includes(cat.id);

            // Filter items by search query if any
            const filteredItems = searchQuery.trim()
              ? cat.items.filter(item => 
                  item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  item.description.toLowerCase().includes(searchQuery.toLowerCase())
                )
              : cat.items;

            if (searchQuery.trim() && filteredItems.length === 0) {
              return null; // hide empty categories during search
            }

            const catItemIds = cat.items.map(i => i.id);
            const selectedCatCount = catItemIds.filter(id => selectedIds.includes(id)).length;
            const isCatFullySelected = catItemIds.length > 0 && selectedCatCount === catItemIds.length;
            const isCatPartiallySelected = selectedCatCount > 0 && !isCatFullySelected;

            return (
              <div 
                key={cat.id} 
                style={{ borderColor: "var(--popup-border)" }}
                className="bg-black/[0.02] dark:bg-white/[0.03] rounded-2xl border overflow-hidden shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-600"
              >
                {/* Category Header Bar */}
                <div 
                  style={{ borderColor: "var(--popup-border)" }}
                  className="px-4 py-3 bg-black/[0.02] dark:bg-white/[0.03] border-b flex items-center justify-between gap-3 select-none"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Category Selection Checkbox */}
                    <button
                      type="button"
                      onClick={() => handleToggleCategoryItems(cat)}
                      className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer shrink-0"
                      title={isCatFullySelected ? 'لغو انتخاب تمامی زیرمجموعه‌های این بخش' : 'انتخاب تمامی زیرمجموعه‌های این بخش'}
                    >
                      {isCatFullySelected ? (
                        <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      ) : isCatPartiallySelected ? (
                        <div className="w-5 h-5 rounded border-2 border-indigo-600 dark:border-indigo-400 flex items-center justify-center bg-indigo-50 dark:bg-indigo-950">
                          <div className="w-2.5 h-2.5 bg-indigo-600 dark:bg-indigo-400 rounded-2xs" />
                        </div>
                      ) : (
                        <Square className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                      )}
                    </button>

                    <div 
                      onClick={() => handleToggleCategoryAccordion(cat.id)}
                      className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1"
                    >
                      <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-600/80 shrink-0">
                        <IconComp className="w-4 h-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-black text-xs sm:text-sm" style={{ color: "var(--popup-text)" }}>
                            {cat.title}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            selectedCatCount > 0
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                              : 'bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300'
                          }`}>
                            {toPersianDigits(selectedCatCount)} از {toPersianDigits(cat.items.length)} انتخاب شده
                          </span>
                        </div>
                        <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--popup-text-muted)" }}>
                          {cat.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Accordion Collapse/Expand Arrow */}
                  <button
                    type="button"
                    onClick={() => handleToggleCategoryAccordion(cat.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all cursor-pointer shrink-0"
                    title={isOpenAccordion ? 'بستن آکاردئون' : 'باز کردن و مشاهده زیرمجموعه‌ها'}
                  >
                    {isOpenAccordion ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Sub-Items Grid (Inside Accordion) */}
                {isOpenAccordion && (
                  <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5 animate-fadeIn bg-black/[0.01] dark:bg-white/[0.01]">
                    {filteredItems.map((item) => {
                      const isChecked = selectedIds.includes(item.id);
                      const recordCount = getItemRecordCount(item.id, appState);

                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleToggleItem(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              handleToggleItem(item.id);
                            }
                          }}
                          className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                            isChecked
                              ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800/90 shadow-2xs'
                              : 'bg-white/70 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80 hover:bg-white/90 dark:hover:bg-slate-800/80'
                          }`}
                        >
                          <div className="mt-0.5 shrink-0 pointer-events-none">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span 
                                className="text-xs font-black block"
                                style={{ color: isChecked ? undefined : "var(--popup-text)" }}
                              >
                                {item.label}
                              </span>

                              {/* Live Record Count Badge */}
                              {recordCount !== null && (
                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full font-sans ${
                                  recordCount > 0
                                    ? isChecked
                                      ? 'bg-rose-600 text-white shadow-2xs'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                }`}>
                                  {toPersianDigits(recordCount)} مورد ثبت‌شده
                                </span>
                              )}
                            </div>

                            <p className="text-[10px] leading-snug" style={{ color: "var(--popup-text-muted)" }}>
                              {item.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Danger Warning Banner before confirmation */}
        {showConfirmStep && (
          <div className="mx-4 my-2 p-3.5 bg-rose-500/10 border border-rose-300 dark:border-rose-800 rounded-2xl flex items-center gap-3 animate-fadeIn">
            <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 animate-bounce" />
            <div className="text-xs leading-relaxed" style={{ color: "var(--popup-text)" }}>
              <strong className="text-rose-600 dark:text-rose-400">هشدار نهایی مدیر:</strong> شما در حال پاکسازی <strong>{toPersianDigits(selectedIds.length)} زیرمجموعه</strong> از داده‌های دیتابیس هستید.
              این عملیات به هیچ عنوان قابل بازگشت نیست. آیا از اجرای این پاکسازی اطمینان کامل دارید؟
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div 
          style={{ borderColor: "var(--popup-border)" }}
          className="p-4 bg-black/[0.02] dark:bg-white/[0.03] border-t flex items-center justify-between gap-3"
        >
          <button
            type="button"
            onClick={() => {
              if (showConfirmStep) {
                setShowConfirmStep(false);
              } else {
                onClose();
              }
            }}
            disabled={isProcessing}
            className="px-4 py-2.5 bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            لغو و انصراف
          </button>

          {!showConfirmStep ? (
            <button
              type="button"
              onClick={() => setShowConfirmStep(true)}
              disabled={selectedIds.length === 0 || isProcessing}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md cursor-pointer ${
                selectedIds.length > 0
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20 active:scale-95'
                  : 'bg-slate-300 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>تخلیه و پاکسازی زیرمجموعه‌های انتخابی ({toPersianDigits(selectedIds.length)})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-lg shadow-rose-700/30 animate-pulse cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>در حال پاکسازی دیتابیس...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>بله، زیرمجموعه‌های انتخابی را حتماً پاک کن</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DatabaseWipeModal;

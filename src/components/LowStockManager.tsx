import React, { useState, useMemo } from 'react';
import { WarehouseItem, User } from '../types';
import { formatCurrency, toPersianDigits } from '../utils/stateManager';
import { saveItem } from '../services/apiService';
import { downloadLowStockExcel, formatItemCode } from '../utils/excelHelper';
import { 
  AlertTriangle, PackageX, FileSpreadsheet, Search, Filter, 
  Edit3, CheckSquare, Settings, Check, Download, Layers, 
  ArrowUpRight, RefreshCw, AlertCircle, Plus, Minus, X, CheckCircle2,
  DollarSign, Tag, ChevronDown, Sparkles
} from 'lucide-react';
import { PaginationControls } from './PaginationControls';

interface LowStockManagerProps {
  items: WarehouseItem[];
  currentUser: User;
  onUpdateItem: (item: WarehouseItem) => void;
  onNavigateToWarehouse?: () => void;
}

export default function LowStockManager({
  items = [],
  currentUser,
  onUpdateItem,
  onNavigateToWarehouse
}: LowStockManagerProps) {
  const currencyLabel = localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال';
  const isAdminOrAccountant = currentUser?.role === 'admin' || currentUser?.role === 'accountant';
  const isAdmin = currentUser?.role === 'admin';

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'kala' | 'consumables'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'zero' | 'negative' | 'low'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [onlyWithAlarm, setOnlyWithAlarm] = useState<boolean>(true);

  // Checkbox Selection state for Batch operations & Export
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Bulk Threshold Edit modal / toolbar state
  const [bulkThresholdInput, setBulkThresholdInput] = useState<string>('');
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Global Default threshold modal state
  const [showGlobalConfigModal, setShowGlobalConfigModal] = useState(false);
  const [globalMinThreshold, setGlobalMinThreshold] = useState<string>('5');

  // Quick Edit Item Modal state
  const [editingItem, setEditingItem] = useState<WarehouseItem | null>(null);
  const [editMinAlarm, setEditMinAlarm] = useState<string>('0');
  const [editLastPurchasePrice, setEditLastPurchasePrice] = useState<string>('0');
  const [editLastSalePrice, setEditLastSalePrice] = useState<string>('0');

  // Quick Stock Adjustment Modal state
  const [adjustingItem, setAdjustingItem] = useState<WarehouseItem | null>(null);
  const [adjustQtyInput, setAdjustQtyInput] = useState<string>('0');
  const [adjustType, setAdjustType] = useState<'increase' | 'decrease'>('increase');
  const [adjustReason, setAdjustReason] = useState<string>('تامین فوری انبار / اصلاح موجودی');

  // Notifications
  const [notification, setNotification] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Physical items list (exclude Services 'khadamat')
  const physicalItems = useMemo(() => {
    return items.filter(it => it.type !== 'khadamat');
  }, [items]);

  // Items in low stock or critical state
  const allCriticalItems = useMemo(() => {
    return physicalItems.filter(it => {
      const hasAlarm = it.minQtyAlarm !== undefined && it.minQtyAlarm !== null && Number(it.minQtyAlarm) > 0;
      const alarmVal = hasAlarm ? Number(it.minQtyAlarm) : 0;

      if (onlyWithAlarm) {
        // Must have an explicit critical alarm threshold defined (>0) AND current qty <= alarm threshold
        return hasAlarm && it.qty <= alarmVal;
      } else {
        // If option is disabled, include items reaching threshold (if defined) OR items with qty <= 0 (even without defined threshold)
        if (hasAlarm) {
          return it.qty <= alarmVal;
        } else {
          return it.qty <= 0;
        }
      }
    });
  }, [physicalItems, onlyWithAlarm]);

  // Extract unique categories for filter
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    physicalItems.forEach(it => {
      if (it.categoryName) set.add(it.categoryName);
      if (it.parentCategory) set.add(it.parentCategory);
    });
    return Array.from(set).sort();
  }, [physicalItems]);

  // Filtered Critical Items based on search & filters
  const filteredItems = useMemo(() => {
    return allCriticalItems.filter(item => {
      // Type Filter
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;

      // Status Filter
      if (statusFilter === 'zero' && item.qty !== 0) return false;
      if (statusFilter === 'negative' && item.qty >= 0) return false;
      if (statusFilter === 'low' && (item.qty <= 0 || item.qty > (item.minQtyAlarm || 0))) return false;

      // Category Filter
      if (categoryFilter !== 'all') {
        const catMatch = item.categoryName === categoryFilter || 
                         item.parentCategory === categoryFilter || 
                         item.subCategory === categoryFilter;
        if (!catMatch) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const code = formatItemCode(item.id, item.type).toLowerCase();
        const name = (item.name || '').toLowerCase();
        const color = (item.color || '').toLowerCase();
        const cat = (item.categoryName || '').toLowerCase();
        return code.includes(q) || name.includes(q) || color.includes(q) || cat.includes(q);
      }

      return true;
    });
  }, [allCriticalItems, typeFilter, statusFilter, categoryFilter, searchQuery]);

  // Summary Metrics calculations
  const totalCriticalCount = allCriticalItems.length;
  const zeroStockCount = useMemo(() => allCriticalItems.filter(i => i.qty === 0).length, [allCriticalItems]);
  const negativeStockCount = useMemo(() => allCriticalItems.filter(i => i.qty < 0).length, [allCriticalItems]);
  const lowStockCount = useMemo(() => allCriticalItems.filter(i => i.qty > 0 && i.qty <= (i.minQtyAlarm || 0)).length, [allCriticalItems]);
  
  // Total cost estimated to replenish all critical stock to minQtyAlarm level
  const totalReplenishCost = useMemo(() => {
    return allCriticalItems.reduce((acc, item) => {
      const alarm = item.minQtyAlarm || 0;
      const deficit = Math.max(0, alarm - item.qty);
      return acc + (deficit * (item.lastPurchasePrice || 0));
    }, 0);
  }, [allCriticalItems]);

  // Toggle selection for individual item
  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Select all / Deselect all visible filtered items
  const handleSelectAllFiltered = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const visibleIds = filteredItems.map(i => i.id);
      setSelectedItemIds(Array.from(new Set([...selectedItemIds, ...visibleIds])));
    } else {
      const visibleIds = new Set(filteredItems.map(i => i.id));
      setSelectedItemIds(selectedItemIds.filter(id => !visibleIds.has(id)));
    }
  };

  const isAllFilteredSelected = filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.includes(i.id));

  // --- Excel Export Handlers ---
  // 1. Export All Critical Items
  const handleExportAll = () => {
    if (allCriticalItems.length === 0) {
      alert('هیچ کالایی در آستانه بحرانی موجود نیست.');
      return;
    }
    downloadLowStockExcel(allCriticalItems, 'گزارش_کلی_کالاهای_رو_به_اتمام');
    showNotification('خروجی اکسل کلی تمام اقلام بحرانی با موفقیت دریافت شد.');
  };

  // 2. Export Selected Items
  const handleExportSelected = () => {
    if (selectedItemIds.length === 0) {
      alert('لطفاً ابتدا حداقل یک کالا را از جدول انتخاب فرمایید.');
      return;
    }
    const selectedItemsList = items.filter(i => selectedItemIds.includes(i.id));
    downloadLowStockExcel(selectedItemsList, 'گزارش_کالاهای_انتخابی_رو_به_اتمام');
    showNotification(`خروجی اکسل تعداد ${toPersianDigits(selectedItemsList.length)} کالای انتخابی با موفقیت دریافت شد.`);
  };

  // 3. Export Filtered Category Items
  const handleExportCategory = () => {
    if (categoryFilter === 'all') {
      alert('لطفاً ابتدا یک دسته‌بندی مشخص را از فیلتر دسته‌بندی بالای جدول انتخاب فرمایید.');
      return;
    }
    const categoryItems = filteredItems;
    if (categoryItems.length === 0) {
      alert('هیچ کالای بحرانی در دسته‌بندی انتخابی یافت نشد.');
      return;
    }
    downloadLowStockExcel(categoryItems, `گزارش_کالاهای_بحرانی_دسته_${categoryFilter}`);
    showNotification(`خروجی اکسل دسته‌بندی «${categoryFilter}» با موفقیت دریافت شد.`);
  };

  // Quick Threshold Increment/Decrement
  const handleQuickAlarmChange = async (item: WarehouseItem, delta: number) => {
    const current = item.minQtyAlarm || 0;
    const nextVal = Math.max(0, current + delta);
    const updated = { ...item, minQtyAlarm: nextVal };
    try {
      await saveItem(updated);
      onUpdateItem(updated);
      showNotification(`آستانه بحرانی کالای «${item.name}» به ${toPersianDigits(nextVal)} تغییر یافت.`);
    } catch (err: any) {
      alert(`خطا در ذخیره آستانه هشدار: ${err?.message || 'خطای سرور'}`);
    }
  };

  // Bulk Threshold Save
  const handleApplyBulkThreshold = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(bulkThresholdInput, 10);
    if (isNaN(val) || val < 0) {
      alert('لطفاً یک عدد معتبر بزرگتر یا مساوی صفر وارد فرمایید.');
      return;
    }
    if (selectedItemIds.length === 0) {
      alert('هیچ کالایی انتخاب نشده است.');
      return;
    }

    let count = 0;
    for (const id of selectedItemIds) {
      const it = items.find(x => x.id === id);
      if (it) {
        const updated = { ...it, minQtyAlarm: val };
        try {
          await saveItem(updated);
          onUpdateItem(updated);
          count++;
        } catch (e) {
          console.error(`Error updating threshold for ${id}:`, e);
        }
      }
    }

    showNotification(`آستانه هشدار برای ${toPersianDigits(count)} کالای انتخابی به ${toPersianDigits(val)} عدد تغییر یافت.`);
    setShowBulkModal(false);
    setBulkThresholdInput('');
  };

  // Apply Global Default Threshold for items missing alarm
  const handleApplyGlobalConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const defaultVal = parseInt(globalMinThreshold, 10);
    if (isNaN(defaultVal) || defaultVal < 0) {
      alert('لطفاً عدد معتبر وارد فرمایید.');
      return;
    }

    let updatedCount = 0;
    for (const it of physicalItems) {
      if (!it.minQtyAlarm || it.minQtyAlarm === 0) {
        const updated = { ...it, minQtyAlarm: defaultVal };
        try {
          await saveItem(updated);
          onUpdateItem(updated);
          updatedCount++;
        } catch (e) {
          console.error(`Error updating alarm for ${it.id}:`, e);
        }
      }
    }

    showNotification(`آستانه پیش‌فرض بحرانی (${toPersianDigits(defaultVal)} عدد) برای ${toPersianDigits(updatedCount)} کالا اعمال گردید.`);
    setShowGlobalConfigModal(false);
  };

  // Open Edit Item Modal
  const handleOpenEditModal = (item: WarehouseItem) => {
    setEditingItem(item);
    setEditMinAlarm(String(item.minQtyAlarm || 0));
    setEditLastPurchasePrice(String(item.lastPurchasePrice || 0));
    setEditLastSalePrice(String(item.lastSalePrice || 0));
  };

  const handleSaveEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const alarmVal = parseInt(editMinAlarm, 10) || 0;
    const purPriceVal = parseFloat(editLastPurchasePrice) || 0;
    const salePriceVal = parseFloat(editLastSalePrice) || 0;

    const updated = {
      ...editingItem,
      minQtyAlarm: alarmVal,
      lastPurchasePrice: purPriceVal,
      lastSalePrice: salePriceVal
    };

    try {
      await saveItem(updated);
      onUpdateItem(updated);
      showNotification(`تنظیمات آستانه و قیمت‌های «${editingItem.name}» با موفقیت بروزرسانی شد.`);
      setEditingItem(null);
    } catch (err: any) {
      alert(`خطا در بروزرسانی کالا: ${err?.message || 'خطای سرور'}`);
    }
  };

  // Open Adjust Stock Modal
  const handleOpenAdjustModal = (item: WarehouseItem) => {
    setAdjustingItem(item);
    setAdjustQtyInput('1');
    setAdjustType('increase');
    setAdjustReason('تامین فوری انبار / خرید مجدد');
  };

  const handleSaveStockAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem) return;

    const qtyVal = parseInt(adjustQtyInput, 10);
    if (isNaN(qtyVal) || qtyVal <= 0) {
      alert('لطفاً یک تعداد معتبر (بزرگتر از صفر) وارد کنید.');
      return;
    }

    const currentQty = adjustingItem.qty || 0;
    const nextQty = adjustType === 'increase' ? currentQty + qtyVal : Math.max(0, currentQty - qtyVal);

    const updated = {
      ...adjustingItem,
      qty: nextQty
    };

    try {
      await saveItem(updated);
      onUpdateItem(updated);
      showNotification(`موجودی کالا «${adjustingItem.name}» از ${toPersianDigits(currentQty)} به ${toPersianDigits(nextQty)} تغییر یافت.`);
      setAdjustingItem(null);
    } catch (err: any) {
      alert(`خطا در ثبت تعدیل موجودی: ${err?.message || 'خطای سرور'}`);
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  return (
    <div className="space-y-6 animate-fade-in pb-12" dir="rtl">
      
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-rose-900 via-slate-900 to-amber-950 border border-rose-900/40 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-2xl">
                <AlertTriangle className="w-6 h-6 animate-pulse text-rose-400" />
              </span>
              <h2 className="text-xl font-black text-white">
                پایش و مدیریت کالاهای رو به اتمام (آستانه بحرانی انبار)
              </h2>
            </div>
            <p className="text-xs text-rose-200/80 font-bold max-w-2xl leading-relaxed">
              کنترل هوشمند اقلام با موجودی صفر یا رو به اتمام، ویرایش آستانه هشدار، اصلاح مستقیم موجودی و دریافت انواع خروجی‌های اکسل (کلی، انتخابی و دسته‌بندی‌شده).
            </p>
          </div>

          {/* Excel Export Quick Menu Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportAll}
              className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>خروجی اکسل کلی ({toPersianDigits(allCriticalItems.length)})</span>
            </button>

            <button
              type="button"
              onClick={handleExportSelected}
              disabled={selectedItemIds.length === 0}
              className={`py-2.5 px-4 font-extrabold text-xs rounded-xl transition-all flex items-center gap-2 text-white ${
                selectedItemIds.length > 0 
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer' 
                  : 'bg-slate-800 text-white cursor-not-allowed opacity-60'
              }`}
            >
              <CheckSquare className="w-4 h-4 text-white" />
              <span className="text-white">خروجی اقلام انتخابی ({toPersianDigits(selectedItemIds.length)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-2xl text-xs font-bold flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{notification}</span>
          </div>
          <button type="button" onClick={() => setNotification(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Key Metric Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* Card 1: Total Critical Items */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">کل اقلام در آستانه بحرانی</span>
            <span className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
              <PackageX className="w-5 h-5" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
              {toPersianDigits(totalCriticalCount)}
            </span>
            <span className="text-xs font-bold text-slate-400">قلم کالا</span>
          </div>
          <p className="text-[10px] text-slate-400 font-bold">
            موجودی فعلی کم‌تر یا برابر آستانه هشدار
          </p>
        </div>

        {/* Card 2: Out of Stock (Zero) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">اقلام با موجودی صفر</span>
            <span className="p-2 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl">
              <AlertCircle className="w-5 h-5" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-red-600 dark:text-red-400">
              {toPersianDigits(zeroStockCount)}
            </span>
            <span className="text-xs font-bold text-slate-400">قلم کالا</span>
          </div>
          <p className="text-[10px] text-red-500 font-bold">
            نیازمند سفارش‌دهی آنی و خرید مجدد
          </p>
        </div>

        {/* Card 3: Negative Stock */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">اقلام با موجودی منفی</span>
            <span className="p-2 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400">
              {toPersianDigits(negativeStockCount)}
            </span>
            <span className="text-xs font-bold text-slate-400">قلم کالا</span>
          </div>
          <p className="text-[10px] text-purple-500 font-bold">
            کسری شدید و فروش بیش از تراز انبار
          </p>
        </div>

        {/* Card 4: Low Stock (Approaching Zero) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">اقلام در آستانه اتمام</span>
            <span className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
              {toPersianDigits(lowStockCount)}
            </span>
            <span className="text-xs font-bold text-slate-400">قلم کالا</span>
          </div>
          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
            موجودی مثبت اما در حد بحرانی
          </p>
        </div>

        {/* Card 5: Estimated Replenish Cost */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">تخمین نقدینگی تامین کسری</span>
            <span className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 overflow-hidden">
            <span className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 truncate">
              {formatCurrency(totalReplenishCost)}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-bold">
            بر اساس قیمت آخرین فاکتور خرید
          </p>
        </div>

      </div>

      {/* Control Toolbar: Search, Filters & Batch Threshold Actions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-3xl shadow-xs space-y-4">
        
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی نام کالا، کد کالا، رنگ یا دسته‌بندی..."
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-3 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* Checkbox: Only items with defined alarm threshold */}
            <label className="flex items-center gap-2 px-3 py-2.5 bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 rounded-xl cursor-pointer select-none transition-all hover:bg-rose-100/80 dark:hover:bg-rose-900/50 shrink-0">
              <input
                type="checkbox"
                checked={onlyWithAlarm}
                onChange={(e) => setOnlyWithAlarm(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500 border-rose-300 dark:border-rose-700 cursor-pointer accent-rose-600"
              />
              <span className="text-xs font-extrabold text-rose-800 dark:text-rose-200 whitespace-nowrap">
                فقط اقلام دارای آستانه هشدار بحرانی
              </span>
            </label>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="all">همه وضعیت‌ها (کلیه اقلام بحرانی)</option>
              <option value="zero">فقط موجودی صفر (اتمام یافته)</option>
              <option value="negative">فقط موجودی‌های منفی (کسری شدید)</option>
              <option value="low">فقط در آستانه اتمام (موجودی بحرانی)</option>
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="all">همه انواع اقلام (کالا و مصرفی)</option>
              <option value="kala">فقط کالاها</option>
              <option value="consumables">فقط قطعات/مصرفی</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500 max-w-[200px]"
            >
              <option value="all">همه دسته‌بندی‌ها</option>
              {categoriesList.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Category Export Button (if category selected) */}
            {categoryFilter !== 'all' && (
              <button
                type="button"
                onClick={handleExportCategory}
                className="px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="دانلود خروجی اکسل اقلام بحرانی این دسته‌بندی"
              >
                <Download className="w-3.5 h-3.5" />
                <span>اکسل دسته {categoryFilter}</span>
              </button>
            )}

            {/* Global Threshold Config Button */}
            {isAdminOrAccountant && (
              <button
                type="button"
                onClick={() => setShowGlobalConfigModal(true)}
                className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                <span>تنظیم آستانه همگانی</span>
              </button>
            )}
          </div>
        </div>

        {/* Batch Selection Banner */}
        {selectedItemIds.length > 0 && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-rose-900 dark:text-rose-300">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-rose-600" />
              <span>تعداد {toPersianDigits(selectedItemIds.length)} کالا انتخاب شده است.</span>
            </div>

            <div className="flex items-center gap-2">
              {isAdminOrAccountant && (
                <button
                  type="button"
                  onClick={() => setShowBulkModal(true)}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>تغییر دسته‌ای آستانه بحرانی</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleExportSelected}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>دانلود اکسل کالاهای انتخابی</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedItemIds([])}
                className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                انصراف
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Main Low Stock Items Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
        
        {/* Table Top Bar */}
        <div className="p-4 bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-extrabold text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-rose-500" />
            <span>فهرست کالاهای در آستانه اتمام ({toPersianDigits(filteredItems.length)} کالا)</span>
          </div>

          {onNavigateToWarehouse && (
            <button
              type="button"
              onClick={onNavigateToWarehouse}
              className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>مشاهده دفتر کل انبار</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Table List */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-sm font-black text-slate-800 dark:text-white">
              هیچ کالایی در وضعیت بحرانی یافت نشد!
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              تمامی کالاهای موجودی فیزیکی دارای ذخیره کافی بالاتر از آستانه هشدار تعریف‌شده می‌باشند.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/60 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                  <th className="p-3.5 text-center w-12">
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={handleSelectAllFiltered}
                      className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-3.5">کد و نام کالا</th>
                  <th className="p-3.5">دسته‌بندی</th>
                  <th className="p-3.5 text-center">موجودی فعلی</th>
                  <th className="p-3.5 text-center">آستانه هشدار (بحرانی)</th>
                  <th className="p-3.5 text-center">میزان کسری</th>
                  <th className="p-3.5">قیمت خرید ({currencyLabel})</th>
                  <th className="p-3.5">تخمین هزینه تامین</th>
                  {isAdmin && <th className="p-3.5 text-center">عملیات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-slate-800 font-bold">
                {paginatedItems.map((item) => {
                  const minAlarm = item.minQtyAlarm || 0;
                  const isZero = item.qty === 0;
                  const deficit = Math.max(0, minAlarm - item.qty);
                  const replenishCost = deficit * (item.lastPurchasePrice || 0);
                  const isSelected = selectedItemIds.includes(item.id);

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50 dark:hover:bg-slate-950/60 transition-colors ${
                        isSelected ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectItem(item.id)}
                          className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                      </td>

                      {/* Code & Item Name */}
                      <td className="p-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-black">
                              {formatItemCode(item.id, item.type)}
                            </span>
                            <span className="font-black text-slate-900 dark:text-white text-xs">
                              {item.name}
                            </span>
                            {item.color && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded font-normal">
                                {item.color}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              item.type === 'kala' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300' : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                            }`}>
                              {item.type === 'kala' ? 'کالا' : 'مصرفی'}
                            </span>
                            {item.unit && (
                              <span className="text-[9px] text-slate-400">
                                واحد: {item.unit}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Categories */}
                      <td className="p-3.5">
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                          <span className="block font-bold">
                            {item.parentCategory || 'عمومی'}
                          </span>
                          {item.subCategory && (
                            <span className="text-[10px] text-slate-400 block">
                              › {item.subCategory}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Current Qty */}
                      <td className="p-3.5 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-black inline-block ${
                          item.qty < 0
                            ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 animate-pulse'
                            : isZero 
                              ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 animate-pulse' 
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                        }`}>
                          {toPersianDigits(item.qty)} {item.unit || 'عدد'}
                        </span>
                      </td>

                      {/* Min Qty Alarm with Quick Adjustment (+/-) */}
                      <td className="p-3.5 text-center">
                        <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
                          {isAdminOrAccountant && (
                            <button
                              type="button"
                              onClick={() => handleQuickAlarmChange(item, -1)}
                              className="w-5 h-5 bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-md flex items-center justify-center cursor-pointer font-bold text-xs"
                              title="کاهش آستانه هشدار"
                            >
                              -
                            </button>
                          )}

                          <span className="px-2 font-mono font-black text-rose-600 dark:text-rose-400">
                            {toPersianDigits(minAlarm)}
                          </span>

                          {isAdminOrAccountant && (
                            <button
                              type="button"
                              onClick={() => handleQuickAlarmChange(item, 1)}
                              className="w-5 h-5 bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-md flex items-center justify-center cursor-pointer font-bold text-xs"
                              title="افزایش آستانه هشدار"
                            >
                              +
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Deficit Amount */}
                      <td className="p-3.5 text-center">
                        <span className="text-xs font-mono font-black text-red-600 dark:text-red-400">
                          {toPersianDigits(deficit)} {item.unit || 'عدد'}
                        </span>
                      </td>

                      {/* Last Purchase Price */}
                      <td className="p-3.5">
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          {formatCurrency(item.lastPurchasePrice || 0)}
                        </span>
                      </td>

                      {/* Replenish Cost */}
                      <td className="p-3.5">
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(replenishCost)}
                        </span>
                      </td>

                      {/* Action Buttons - Only visible to management */}
                      {isAdmin && (
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            
                            {/* Stock Adjust button */}
                            <button
                              type="button"
                              onClick={() => handleOpenAdjustModal(item)}
                              className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-xl transition-all cursor-pointer"
                              title="اصلاح مستقیم موجودی انبار"
                            >
                              <Plus className="w-4 h-4" />
                            </button>

                            {/* Quick Edit button */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(item)}
                              className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-xl transition-all cursor-pointer"
                              title="ویرایش کامل آستانه و قیمت‌ها"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {filteredItems.length > 0 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800">
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredItems.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(num) => {
                setItemsPerPage(num);
                setCurrentPage(1);
              }}
            />
          </div>
        )}

      </div>

      {/* --- MODAL 1: Bulk Threshold Edit --- */}
      {showBulkModal && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 popup-box-global">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-rose-500" />
                <span>تغییر دسته‌ای آستانه بحرانی</span>
              </h3>
              <button onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyBulkThreshold} className="space-y-4">
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                آستانه جدید بحرانی (حداقل موجودی هشدار) برای تعداد <span className="text-rose-600 font-black">{toPersianDigits(selectedItemIds.length)}</span> کالای انتخابی اعمال خواهد شد.
              </p>

              <div className="space-y-1.5 text-right">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">آستانه جدید هشدار (عدد):</label>
                <input
                  type="number"
                  min="0"
                  value={bulkThresholdInput}
                  onChange={(e) => setBulkThresholdInput(e.target.value)}
                  placeholder="مثال: 10"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl cursor-pointer shadow-md shadow-rose-600/20"
                >
                  اعمال تغییر دسته‌ای
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: Global Threshold Setup --- */}
      {showGlobalConfigModal && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 popup-box-global">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-500" />
                <span>تنظیم همگانی آستانه بحرانی پیش‌فرض</span>
              </h3>
              <button onClick={() => setShowGlobalConfigModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyGlobalConfig} className="space-y-4">
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                این عملیات مقدار آستانه هشدار را برای کلیه کالاهایی که آستانه هشدار آن‌ها صفر یا نامشخص است به عدد زیر بروزرسانی می‌کند.
              </p>

              <div className="space-y-1.5 text-right">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">مقدار پیش‌فرض آستانه هشدار (عدد):</label>
                <input
                  type="number"
                  min="1"
                  value={globalMinThreshold}
                  onChange={(e) => setGlobalMinThreshold(e.target.value)}
                  placeholder="مثال: 5"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGlobalConfigModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  اعمال به کالاهای بدون آستانه
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: Edit Item Modal --- */}
      {editingItem && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 popup-box-global">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-500" />
                <span>ویرایش آستانه و اطلاعات کالا: {editingItem.name}</span>
              </h3>
              <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditItem} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Min Alarm */}
                <div className="space-y-1.5 text-right sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">حداقل موجودی هشدار (آستانه بحرانی):</label>
                  <input
                    type="number"
                    min="0"
                    value={editMinAlarm}
                    onChange={(e) => setEditMinAlarm(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold font-mono text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    required
                  />
                </div>

                {/* Purchase Price */}
                <div className="space-y-1.5 text-right">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">قیمت خرید ({currencyLabel}):</label>
                  <input
                    type="number"
                    min="0"
                    value={editLastPurchasePrice}
                    onChange={(e) => setEditLastPurchasePrice(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Sale Price */}
                <div className="space-y-1.5 text-right">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">قیمت فروش ({currencyLabel}):</label>
                  <input
                    type="number"
                    min="0"
                    value={editLastSalePrice}
                    onChange={(e) => setEditLastSalePrice(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  ذخیره تغییرات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: Quick Stock Adjust Modal --- */}
      {adjustingItem && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 popup-box-global">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-500" />
                <span>اصلاح مستقیم موجودی انبار: {adjustingItem.name}</span>
              </h3>
              <button onClick={() => setAdjustingItem(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStockAdjust} className="space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-2xl flex justify-between items-center text-xs font-bold">
                <span className="text-slate-500">موجودی فعلی کالا:</span>
                <span className="font-mono text-sm font-black text-slate-800 dark:text-white">
                  {toPersianDigits(adjustingItem.qty)} {adjustingItem.unit || 'عدد'}
                </span>
              </div>

              <div className="space-y-1.5 text-right">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">نوع تغییر موجودی:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('increase')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl cursor-pointer border ${
                      adjustType === 'increase'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-black'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600'
                    }`}
                  >
                    ➕ افزایش موجودی (خرید/ورود)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('decrease')}
                    className={`py-2 px-3 text-xs font-bold rounded-xl cursor-pointer border ${
                      adjustType === 'decrease'
                        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-700 dark:text-rose-300 font-black'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600'
                    }`}
                  >
                    ➖ کاهش موجودی (ضایعات/کسری)
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-right">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">تعداد تغییر (عدد):</label>
                <input
                  type="number"
                  min="1"
                  value={adjustQtyInput}
                  onChange={(e) => setAdjustQtyInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1.5 text-right">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">بابت / توضیحات انبار:</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="علت تغییر موجودی..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl cursor-pointer shadow-md shadow-emerald-600/20"
                >
                  ثبت تغییر موجودی
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

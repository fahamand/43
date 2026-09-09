import React, { useState, useEffect } from 'react';
import { FiscalYear, WarehouseItem, User, BankAccount, Partner, BankTransaction, WarehouseCategoryItem } from '../types';
import { downloadWarehouseTemplate, parseWarehouseExcel } from '../utils/excelHelper';
import { saveGenericKeyToDb, getStoredWarehouseCategoriesList, saveWarehouseCategoriesListState } from '../utils/stateManager';
import { AlertCircle, CheckCircle, Download, FileSpreadsheet, Lock, Unlock, Upload, Landmark, ShieldCheck, KeyRound, Edit3, Save, RotateCcw } from 'lucide-react';
import { JalaliDatePicker } from './JalaliDatePicker';
import CashAccountsManager from './CashAccountsManager';

interface FiscalYearSetupProps {
  fiscalYear: FiscalYear;
  onChangeFiscalYear: (fy: FiscalYear) => void;
  currentUser: User;
  onImportInventory: (newItems: Omit<WarehouseItem, 'id'>[]) => void;
  accounts: BankAccount[];
  onAddAccount: (acc: BankAccount) => void;
  onDeleteAccount: (id: string) => void;
  onUpdateAccount?: (acc: BankAccount) => void;
  partners: Partner[];
  onAddPartner: (p: Partner) => void;
  onDeletePartner: (id: string) => void;
  onUpdatePartner?: (p: Partner) => void;
  formatCurrency: (amount: number) => string;
  transactions?: BankTransaction[];
  pendingDeposits?: any[];
}

export default function FiscalYearSetup({
  fiscalYear,
  onChangeFiscalYear,
  currentUser,
  onImportInventory,
  accounts,
  onAddAccount,
  onDeleteAccount,
  onUpdateAccount,
  partners,
  onAddPartner,
  onDeletePartner,
  onUpdatePartner,
  formatCurrency,
  transactions = [],
  pendingDeposits = []
}: FiscalYearSetupProps) {
  const [year, setYear] = useState(fiscalYear.year || '1403');
  const [startDate, setStartDate] = useState(fiscalYear.startDate || '1403/01/01');
  const [endDate, setEndDate] = useState(fiscalYear.endDate || '1403/12/29');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(!fiscalYear.registered);

  const isAdmin = currentUser.role === 'admin';

  const [lockedDateInput, setLockedDateInput] = useState(fiscalYear.lockedDate || '');

  // Keep state synchronized with props
  useEffect(() => {
    if (fiscalYear) {
      setYear(fiscalYear.year || '1403');
      setStartDate(fiscalYear.startDate || '1403/01/01');
      setEndDate(fiscalYear.endDate || '1403/12/29');
      setLockedDateInput(fiscalYear.lockedDate || '');
      if (!fiscalYear.registered) {
        setIsEditMode(true);
      }
    }
  }, [fiscalYear.year, fiscalYear.startDate, fiscalYear.endDate, fiscalYear.registered, fiscalYear.lockedDate, fiscalYear.isClosed]);

  // Determine if fields should be locked for input
  const isInputsDisabled = (fiscalYear.registered || fiscalYear.isClosed) && !isEditMode;

  // Handle setting or clearing lockedDate
  const handleApplyLockedDate = () => {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'تنها مدیر سیستم امکان تغییر تاریخ قفل دوره‌ای را دارد.' });
      return;
    }

    const updated: FiscalYear = {
      ...fiscalYear,
      lockedDate: lockedDateInput.trim() || undefined
    };

    onChangeFiscalYear(updated);
    saveGenericKeyToDb('acc_app_fiscalYear', updated);
    if (lockedDateInput.trim()) {
      setMessage({ type: 'success', text: `تمامی اسناد و فاکتورهای مالی تا تاریخ ${lockedDateInput} با موفقیت قفل گردیدند و امکان تغییر نخواهند داشت.` });
    } else {
      setMessage({ type: 'info', text: 'قفل میان‌دوره‌ای اسناد برداشته شد.' });
    }
  };

  // Handle closing / reopening fiscal year
  const handleToggleCloseYear = (shouldClose: boolean) => {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'تنها مدیر سیستم مجاز به بستن یا بازگشایی سال مالی است.' });
      return;
    }

    if (shouldClose) {
      if (!window.confirm(`آیا از بستن رسمی سال مالی ${fiscalYear.year} اطمینان کامل دارید؟ پس از بستن، ثبت هرگونه سند یا فاکتور جدید در این سال مسدود می‌گردد.`)) {
        return;
      }
    }

    const now = new Date();
    const jalaliNow = now.toLocaleDateString('fa-IR');
    const updated: FiscalYear = {
      ...fiscalYear,
      isClosed: shouldClose,
      closedAt: shouldClose ? jalaliNow : undefined,
      closedBy: shouldClose ? (currentUser.name || 'مدیر سیستم') : undefined
    };

    onChangeFiscalYear(updated);
    saveGenericKeyToDb('acc_app_fiscalYear', updated);
    if (shouldClose) {
      setMessage({ type: 'success', text: `سال مالی ${fiscalYear.year} با موفقیت رسماً بسته شد.` });
    } else {
      setMessage({ type: 'info', text: `سال مالی ${fiscalYear.year} مجدداً توسط مدیر سیستم بازگشایی شد.` });
    }
  };

  // Handle locking / unlocking by Admin
  const handleToggleLock = (lockStatus: boolean) => {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'فقط مدیر کل سیستم دسترسی به باز کردن یا قفل دفاتر مالی را دارد.' });
      return;
    }

    const updated: FiscalYear = {
      ...fiscalYear,
      year,
      startDate,
      endDate,
      registered: lockStatus,
      createdBy: currentUser?.name || 'مدیر کل سیستم',
      setupDate: new Date().toLocaleDateString('fa-IR')
    };

    onChangeFiscalYear(updated);
    saveGenericKeyToDb('acc_app_fiscalYear', updated);

    if (lockStatus) {
      setIsEditMode(false);
      setMessage({ type: 'success', text: `سال مالی ${year} با موفقیت قفل و دفاتر مالی نهایی شدند.` });
    } else {
      setIsEditMode(true);
      setMessage({ type: 'info', text: 'قفل سال مالی توسط مدیر باز شد. اکنون می‌توانید مشخصات و بازه سال مالی را ویرایش نمایید.' });
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (fiscalYear.registered && !isAdmin) {
      setMessage({ type: 'error', text: 'سال مالی ثبت شده است؛ فقط مدیر کل سیستم امکان ویرایش دارد.' });
      return;
    }

    const updated: FiscalYear = {
      ...fiscalYear,
      year,
      startDate,
      endDate,
      registered: true,
      createdBy: currentUser?.name || 'مدیر کل سیستم',
      setupDate: new Date().toLocaleDateString('fa-IR')
    };

    onChangeFiscalYear(updated);
    saveGenericKeyToDb('acc_app_fiscalYear', updated);
    setIsEditMode(false);
    setMessage({ type: 'success', text: `سال مالی ${year} با موفقیت ذخیره و قفل شد.` });
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { items: parsedItems, fiscalYear: parsedFiscalYear } = await parseWarehouseExcel(file);
      if (parsedItems.length === 0 && !parsedFiscalYear) {
        setMessage({ type: 'error', text: 'فایل خالی است یا فرمت مناسبی ندارد.' });
        return;
      }

      let fyUpdated = false;
      if (parsedFiscalYear) {
        setYear(parsedFiscalYear.year);
        setStartDate(parsedFiscalYear.startDate);
        setEndDate(parsedFiscalYear.endDate);

        const updatedFy: FiscalYear = {
          ...fiscalYear,
          year: parsedFiscalYear.year,
          startDate: parsedFiscalYear.startDate,
          endDate: parsedFiscalYear.endDate,
          registered: true,
          createdBy: currentUser?.name || 'مدیر سیستم',
          setupDate: new Date().toLocaleDateString('fa-IR')
        };

        onChangeFiscalYear(updatedFy);
        saveGenericKeyToDb('acc_app_fiscalYear', updatedFy);
        fyUpdated = true;
      }

      if (parsedItems.length > 0) {
        // Convert parsed simple format to items
        const newItems: Omit<WarehouseItem, 'id'>[] = parsedItems.map(item => ({
          name: item.name,
          type: item.categoryType || 'kala',
          color: item.color,
          unit: item.unit || 'عدد',
          qty: item.qty,
          initialQty: item.qty,
          lastPurchasePrice: item.lastPurchasePrice || 0,
          lastSalePrice: item.lastSalePrice || 0,
          minQtyAlarm: item.minQtyAlarm,
          setupDate: new Date().toLocaleDateString('fa-IR'),
          categoryName: item.categoryName,
          parentCategory: item.parentCategory,
          subCategory: item.subCategory
        }));

        // Automatically register any categories from Excel if not already in system
        let currentCatsList: WarehouseCategoryItem[] = [...getStoredWarehouseCategoriesList()];

        let catsUpdated = false;
        const initialCatCount = currentCatsList.length;
        currentCatsList = currentCatsList.filter(c => c.parent !== 'سایر کالاها' && c.sub !== 'دسته‌بندی نشده');
        if (currentCatsList.length !== initialCatCount) {
          catsUpdated = true;
        }

        parsedItems.forEach(item => {
          if (item.categoryName && item.categoryName.trim()) {
            const finalVal = item.categoryName.trim();
            const parentVal = item.parentCategory ? item.parentCategory.trim() : finalVal;
            const subVal = item.subCategory ? item.subCategory.trim() : finalVal;

            if (!parentVal || !subVal) return;

            const exists = currentCatsList.some(c => 
              c.final && c.final.trim().toLowerCase() === finalVal.toLowerCase() &&
              c.parent && c.parent.trim().toLowerCase() === parentVal.toLowerCase() &&
              c.sub && c.sub.trim().toLowerCase() === subVal.toLowerCase()
            );
            if (!exists) {
              currentCatsList.push({
                parent: parentVal,
                sub: subVal,
                final: finalVal,
                type: item.categoryType || 'kala'
              });
              catsUpdated = true;
            }
          }
        });

        if (catsUpdated) {
          saveWarehouseCategoriesListState(currentCatsList);
        }

        onImportInventory(newItems);
      }

      if (fyUpdated && parsedItems.length > 0) {
        setMessage({ type: 'success', text: `اطلاعات تنظیمات سال مالی (سال ${parsedFiscalYear?.year}) و ${parsedItems.length} ردیف موجودی اولیه انبار با موفقیت به‌روزرسانی و همگام‌سازی شد.` });
      } else if (fyUpdated) {
        setMessage({ type: 'success', text: `اطلاعات سال مالی (سال ${parsedFiscalYear?.year}) با موفقیت از فایل اکسل به‌روزرسانی شد.` });
      } else {
        setMessage({ type: 'success', text: `${parsedItems.length} ردیف موجودی کالا/خدمات و دسته‌بندی‌های مربوطه با موفقیت از اکسل وارد و به‌روزرسانی شد.` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'خطا در تحلیل فایل اکسل. لطفاً از فایل نمونه استفاده کنید.' });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 sm:pb-5 gap-3 sm:gap-4">
        <div>
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-blue-600 shrink-0" />
            <span>تنظیم سال مالی و قفل دفاتر</span>
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">مدیریت وضعیت قفل دفاتر مالی، بازه زمانی سال مالی و مقداردهی اولیه انبار</p>
        </div>
        
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs sm:text-sm w-fit shrink-0">
          {fiscalYear.registered ? (
            <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
              <Lock className="w-4 h-4 text-emerald-600" /> سال مالی قفل شده (دفاتر نهایی)
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-600 font-bold animate-pulse">
              <Unlock className="w-4 h-4 text-amber-500" /> قفل باز / در حال تنظیم
            </span>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-3.5 sm:p-4 rounded-xl flex items-start gap-3 text-xs sm:text-sm leading-relaxed ${
          message.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
            : message.type === 'info'
              ? 'bg-blue-50 text-blue-800 border border-blue-100'
              : 'bg-rose-50 text-rose-800 border border-rose-100'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          ) : message.type === 'info' ? (
            <ShieldCheck className="w-5 h-5 flex-shrink-0 text-blue-600" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          )}
          <div>{message.text}</div>
        </div>
      )}

      {/* Admin Access Panel (ویژه مدیر کل سیستم) */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200/80 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-xs sm:text-sm text-blue-950">پنل کنترل دسترسی مدیر کل سیستم</h4>
                <span className="bg-blue-200/70 text-blue-900 text-[10px] font-extrabold px-2 py-0.5 rounded-md">مدیریت ارشد</span>
              </div>
              <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                {fiscalYear.registered ? (
                  isEditMode 
                    ? 'قفل سال مالی برای شما باز شده است. پس از اعمال تغییرات، دکمه ذخیره و قفل را بزنید.'
                    : 'سال مالی در وضعیت قفل دفاتر قرار دارد. شما مجاز هستید قفل آن را جهت ویرایش باز کنید.'
                ) : (
                  'سال مالی قفل نشده است و در حالت تنظیم قرار دارد.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
            {fiscalYear.registered ? (
              <>
                {!isEditMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditMode(true);
                      setMessage({ type: 'info', text: 'قفل سال مالی جهت ویرایش برای شما باز شد. مقادیر را تغییر داده و ذخیره نمایید.' });
                    }}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    id="btn-admin-unlock-fiscal-year"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>باز کردن قفل و ویرایش سال مالی</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setYear(fiscalYear.year);
                      setStartDate(fiscalYear.startDate);
                      setEndDate(fiscalYear.endDate);
                      setIsEditMode(false);
                      setMessage(null);
                    }}
                    className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>انصراف از ویرایش</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleToggleLock(false)}
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  title="خروج کامل از حالت ثبت نهایی"
                >
                  <Unlock className="w-3.5 h-3.5 text-amber-600" />
                  <span>خروج از حالت قفل دفاتر</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleToggleLock(true)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>قفل‌گذاری و بستن دفاتر</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Grid for Fiscal Year Definition and Initial Excel Work */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        
        {/* Year Definition Card */}
        <div className="space-y-4">
          <h3 className="text-sm sm:text-base font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              الف) تعریف و ویرایش محدوده سال مالی
            </span>
            {isEditMode && (
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Edit3 className="w-3 h-3" /> حالت ویرایش فعال
              </span>
            )}
          </h3>
          
          <form onSubmit={handleRegister} className="space-y-4 bg-slate-50/60 rounded-2xl p-4 sm:p-5 border border-slate-150">
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium text-slate-600 block">سال مالی (مثال: ۱۴۰۳)</label>
              <input
                type="text"
                value={year}
                disabled={isInputsDisabled}
                onChange={(e) => setYear(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 bg-white shadow-inner text-slate-800 text-center text-lg font-bold disabled:bg-slate-100 disabled:text-slate-500 transition-all"
                placeholder="۱۴۰۳"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-medium text-slate-600 block">تاریخ شروع</label>
                <JalaliDatePicker
                  value={startDate}
                  disabled={isInputsDisabled}
                  onChange={(val) => setStartDate(val)}
                  placeholder="۱۴۰۳/۰۱/۰۱"
                  allowFutureDates={true}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-medium text-slate-600 block">تاریخ پایان</label>
                <JalaliDatePicker
                  value={endDate}
                  disabled={isInputsDisabled}
                  onChange={(val) => setEndDate(val)}
                  placeholder="۱۴۰۳/۱۲/۲۹"
                  allowFutureDates={true}
                />
              </div>
            </div>

            {fiscalYear.registered && (
              <div className="text-[11px] sm:text-xs text-slate-500 flex items-center gap-1.5 pt-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>ثبت توسط {fiscalYear.createdBy} در تاریخ {fiscalYear.setupDate || 'ابتدای سال'}</span>
              </div>
            )}

            {!isInputsDisabled ? (
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 sm:py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm hover:shadow transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 text-xs sm:text-sm"
                  id="btn-save-fiscal-year"
                >
                  <Save className="w-4 h-4" />
                  <span>ذخیره تغییرات و قفل نهایی دفاتر</span>
                </button>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs leading-relaxed border border-amber-100 flex items-center justify-between gap-2 mt-2">
                <span>سال مالی قفل است. فقط مدیر کل سیستم امکان باز کردن قفل را دارد.</span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditMode(true);
                      setMessage({ type: 'info', text: 'قفل سال مالی باز شد. می‌توانید تغییرات مورد نظر را اعمال کنید.' });
                    }}
                    className="px-2.5 py-1 bg-amber-200/80 hover:bg-amber-300 text-amber-950 rounded-lg font-bold text-[11px] cursor-pointer shrink-0 transition-colors"
                  >
                    باز کردن قفل
                  </button>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Excel Inventory Import Card */}
        <div className="space-y-4">
          <h3 className="text-sm sm:text-base font-semibold text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
            <span>ب) بارگذاری موجودی اولیه انبار</span>
          </h3>

          <div className="bg-slate-50/60 rounded-2xl p-4 sm:p-5 border border-slate-150 space-y-5">
            <div className="space-y-2">
              <h4 className="text-xs sm:text-sm font-semibold text-slate-700">۱. دریافت قالب اکسل نمونه</h4>
              <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed">
                جهت تعریف موجودی محصولات به صورت دسته‌جمعی همراه با واحد شمارش، قیمت خرید، قیمت فروش، دسته‌بندی و حداقل موجودی برای هشدار، قالب زیر را دانلود و تکمیل کنید.
              </p>
              <button
                onClick={downloadWarehouseTemplate}
                className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 font-medium py-2 px-3 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors w-fit border border-blue-100 cursor-pointer mt-1"
                id="btn-download-inv-excel"
              >
                <Download className="w-4 h-4" />
                دانلود قالب اکسل
              </button>
            </div>

            <hr className="border-slate-100" />

            <div className="space-y-3">
              <h4 className="text-xs sm:text-sm font-semibold text-slate-700">۲. بارگذاری فایل تکمیل‌شده اکسل</h4>
              <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed">
                فایل تکمیل‌شده اکسل را از بخش زیر انتخاب و بارگذاری کنید. اطلاعات قبلی سیستم حفظ خواهند شد.
              </p>
              
              <div className="relative border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-5 sm:p-6 text-center cursor-pointer bg-white transition-colors group">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleExcelUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  id="input-upload-inv-excel"
                />
                <div className="flex flex-col items-center justify-center gap-2 text-slate-500 group-hover:text-blue-600">
                  <FileSpreadsheet className="w-9 h-9 sm:w-10 sm:h-10 text-slate-300 group-hover:scale-110 transition-transform duration-200" />
                  <span className="text-xs font-semibold">انتخاب و بارگذاری کل موجودی</span>
                  <span className="text-[10px] text-slate-400">فرمت‌های مجاز: Excel / CSV</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* بخش قفل میان‌دوره‌ای و بستن رسمی سال مالی */}
      {isAdmin && (
        <div className="border-t border-slate-100 pt-6 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                <Lock className="w-5 h-5 text-rose-600" />
                <span>ج) مدیریت قفل میان‌دوره‌ای و بستن رسمی سال مالی</span>
              </h3>
              <p className="text-slate-500 text-xs mt-1">
                جلوگیری از ویرایش، حذف یا ثبت اسناد در دوره‌های مالی حسابرسی‌شده یا بسته شده
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {fiscalYear.isClosed ? (
                <span className="px-3 py-1 bg-rose-100 text-rose-800 text-xs font-black rounded-full flex items-center gap-1.5 border border-rose-200">
                  <Lock className="w-3.5 h-3.5 text-rose-600" />
                  سال مالی رسماً بسته شده ({fiscalYear.closedAt || 'پایان دوره'})
                </span>
              ) : fiscalYear.lockedDate ? (
                <span className="px-3 py-1 bg-amber-100 text-amber-900 text-xs font-black rounded-full flex items-center gap-1.5 border border-amber-200">
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                  قفل تا تاریخ: {fiscalYear.lockedDate}
                </span>
              ) : (
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full flex items-center gap-1.5 border border-emerald-200">
                  <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                  بدون قفل میان‌دوره‌ای (گردش آزاد اسناد)
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* کارت قفل میان‌دوره‌ای */}
            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs sm:text-sm font-bold text-amber-950 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-700" />
                  ۱. قفل اسناد تا یک تاریخ معین (میان‌دوره‌ای)
                </h4>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                با تعیین تاریخ قفل، هیچ کاربری امکان ثبت فاکتور، تراکنش یا سند با تاریخی کمتر یا مساوی این تاریخ را نخواهد داشت (مناسب برای پایان هر ماه یا فصل).
              </p>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">تاریخ پایان بازه قفل‌شده:</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <JalaliDatePicker
                      value={lockedDateInput}
                      onChange={(v) => setLockedDateInput(v)}
                      placeholder="مثال: ۱۴۰۳/۰۶/۳۱"
                      allowFutureDates={true}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyLockedDate}
                    className="px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0 flex items-center gap-1"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    اعمال قفل
                  </button>
                  {fiscalYear.lockedDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setLockedDateInput('');
                        const updated = { ...fiscalYear, lockedDate: undefined };
                        onChangeFiscalYear(updated);
                        saveGenericKeyToDb('acc_app_fiscalYear', updated);
                        setMessage({ type: 'info', text: 'قفل میان‌دوره‌ای با موفقیت برداشته شد.' });
                      }}
                      className="px-2.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-all cursor-pointer shrink-0"
                      title="حذف قفل میان‌دوره‌ای"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* کارت بستن رسمی سال مالی */}
            <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs sm:text-sm font-bold text-rose-950 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-700" />
                  ۲. بستن رسمی دفاتر و پایان دوره مالی
                </h4>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                پس از انجام حسابرسی، ارسال اظهارنامه مالیاتی و نهایی شدن سود و زیان، سال مالی را مسدود کنید تا هیچ تراکنش یا فاکتوری در این سال قابل تغییر نباشد.
              </p>

              <div className="pt-2">
                {fiscalYear.isClosed ? (
                  <button
                    type="button"
                    onClick={() => handleToggleCloseYear(false)}
                    className="w-full py-2.5 px-4 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Unlock className="w-4 h-4 text-rose-600" />
                    <span>بازگشایی مجدد سال مالی بسته شده (توسط مدیر)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleToggleCloseYear(true)}
                    className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Lock className="w-4 h-4" />
                    <span>بستن قطعی دفاتر و نهایی‌سازی سال مالی</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* تعریف و مدیریت حساب‌ها و صندوق‌ها */}
      {isAdmin && (
        <div className="border-t border-slate-100 pt-6 sm:pt-8 space-y-5 sm:space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>ج) تعریف و مدیریت حساب‌ها و صندوق‌ها (ویژه مدیریت)</span>
            </h3>
            <p className="text-slate-500 text-xs mt-1">تعریف، مشاهده، و مدیریت حساب‌های بانکی و گاوصندوق‌های نقدی شرکت</p>
          </div>
          <CashAccountsManager
            accounts={accounts}
            currentUser={currentUser}
            onAddAccount={onAddAccount}
            onDeleteAccount={onDeleteAccount}
            onUpdateAccount={onUpdateAccount}
            partners={partners}
            onAddPartner={onAddPartner}
            onDeletePartner={onDeletePartner}
            onUpdatePartner={onUpdatePartner}
            formatCurrency={formatCurrency}
            transactions={transactions}
            pendingDeposits={pendingDeposits}
          />
        </div>
      )}
    </div>
  );
}

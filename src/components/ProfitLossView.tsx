import React, { useState } from 'react';
import { Invoice, BankTransaction, User, WarehouseItem, AccountingDocument } from '../types';
import { formatCurrency, getTodayJalali, getOneMonthAgoJalali } from '../utils/stateManager';
import { TrendingUp, TrendingDown, ShieldAlert, Award, Calendar, SlidersHorizontal, PackageCheck } from 'lucide-react';
import { JalaliDatePicker } from './JalaliDatePicker';
import { calculateProfitLossMetrics } from '../services/accountingEngine';
import { jalaliToDays, daysToJalali, getJalaliDaysInMonth, normalizeJalaliDate } from '../services/dateService';

interface ProfitLossViewProps {
  invoices: Invoice[];
  items?: WarehouseItem[];
  transactions: BankTransaction[];
  docs?: AccountingDocument[];
  currentUser: User;
}

interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

export default function ProfitLossView({
  invoices,
  items = [],
  transactions,
  docs = [],
  currentUser
}: ProfitLossViewProps) {
  const isAdmin = currentUser?.role === 'admin';

  // Date Filter Preset States
  const [filterType, setFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'>('year');
  const [customStartDate, setCustomStartDate] = useState(getOneMonthAgoJalali());
  const [customEndDate, setCustomEndDate] = useState(getTodayJalali());

  // Parsing Jalali date components
  const parseJalaliDate = (dateStr: string): JalaliDate | null => {
    if (!dateStr) return null;
    const normalized = normalizeJalaliDate(dateStr);
    const parts = normalized.split('/');
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    return { year, month, day };
  };

  // Calculate yesterday shamsi date
  const getYesterdayDate = (dateStr: string): string => {
    const jd = parseJalaliDate(dateStr);
    if (!jd) return dateStr;
    const days = jalaliToDays(jd);
    return daysToJalali(days - 1);
  };

  // Calculate Saturday to Friday date limits
  const getWeekRange = (dateStr: string): { start: string; end: string } => {
    const jd = parseJalaliDate(dateStr);
    if (!jd) return { start: dateStr, end: dateStr };
    const totalDays = jalaliToDays(jd);
    const w = (totalDays + 3) % 7; // Saturday = 0, Friday = 6
    const startDays = totalDays - w;
    const endDays = totalDays + (6 - w);
    return {
      start: daysToJalali(startDays),
      end: daysToJalali(endDays)
    };
  };

  // Base date is the actual current date (today)
  const baseDateStr = getTodayJalali();
  const currentJd = parseJalaliDate(baseDateStr) || { year: 1404, month: 1, day: 1 };
  const currentYear = currentJd.year;
  const currentYearEndDay = getJalaliDaysInMonth(currentYear, 12);

  let startDate = `${currentYear}/01/01`;
  let endDate = `${currentYear}/12/${String(currentYearEndDay).padStart(2, '0')}`;

  if (filterType === 'today') {
    startDate = baseDateStr;
    endDate = baseDateStr;
  } else if (filterType === 'yesterday') {
    const yest = getYesterdayDate(baseDateStr);
    startDate = yest;
    endDate = yest;
  } else if (filterType === 'week') {
    const range = getWeekRange(baseDateStr);
    startDate = range.start;
    endDate = range.end;
  } else if (filterType === 'month') {
    const year = currentJd.year;
    const month = String(currentJd.month).padStart(2, '0');
    const lastDay = String(getJalaliDaysInMonth(year, currentJd.month)).padStart(2, '0');
    startDate = `${year}/${month}/01`;
    endDate = `${year}/${month}/${lastDay}`;
  } else if (filterType === 'year') {
    const year = currentJd.year;
    const lastDay = String(getJalaliDaysInMonth(year, 12)).padStart(2, '0');
    startDate = `${year}/01/01`;
    endDate = `${year}/12/${lastDay}`;
  } else if (filterType === 'custom') {
    startDate = customStartDate;
    endDate = customEndDate;
  }

  // Unified Profit & Loss Engine calculation
  const metrics = calculateProfitLossMetrics(
    invoices,
    items,
    transactions,
    docs,
    startDate,
    endDate
  );

  const {
    totalSales,
    totalCostOfGoodsSold,
    grossProfit,
    totalExpenses,
    otherRevenues,
    netProfit,
    totalPurchase
  } = metrics;

  const totalRevenues = totalSales + otherRevenues;
  const totalExpenditures = totalCostOfGoodsSold + totalExpenses;

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl border border-slate-150 p-8 text-center shadow-sm" dir="rtl">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-3 animate-pulse" />
        <h4 className="font-bold text-slate-800 text-sm">عدم دسترسی به تراز سود و زیان!</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
          دسترسی حسابدار و فروشنده به آمارها و ارقام نهایی سود و زیان تجاری دفاتر بر طبق بند ۸ شرایط مسدود می‌باشد. جهت تسلیم موازنه، به مدیر سیستم تغییر وضعیت بدهید.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Filters Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-black text-slate-800 dark:text-slate-200">فیلتر بازه زمانی گزارش سود و زیان:</span>
          </div>
          <div className="text-[10px] bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg text-slate-600 dark:text-slate-300 font-bold font-mono">
            مبنای سنجش امروز سیستم: {baseDateStr}
          </div>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'today', label: 'امروز' },
            { id: 'yesterday', label: 'دیروز' },
            { id: 'week', label: 'هفته جاری' },
            { id: 'month', label: 'ماه جاری' },
            { id: 'year', label: 'امسال (کل دوره)' },
            { id: 'custom', label: 'انتخاب دستی بازه' },
          ].map(preset => (
            <button
              key={preset.id}
              onClick={() => setFilterType(preset.id as any)}
              className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                filterType === preset.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom manual dates calendar pickers */}
        {filterType === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 animate-fade-in">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 block pb-1 pr-1">تاریخ شروع (مثال: ۱۴۰۵/۰۱/۰۱):</label>
              <JalaliDatePicker
                value={customStartDate}
                onChange={setCustomStartDate}
                placeholder="۱۴۰۵/۰۱/۰۱"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 block pb-1 pr-1">تاریخ پایان (مثال: ۱۴۰۵/۱۲/۲۹):</label>
              <JalaliDatePicker
                value={customEndDate}
                onChange={setCustomEndDate}
                placeholder="۱۴۰۵/۱۲/۲۹"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Analysis Output */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white">۷. صورت خلاصه سود و زیان ترازنامه دوره</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">آنالیز یکپارچه درآمدهای فروش، بهای تمام‌شده کالای فروش‌رفته (COGS)، سود ناخالص و سود خالص</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-3 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-800/40 font-mono flex items-center gap-1.5 self-start">
            <Calendar className="w-3.5 h-3.5" />
            <span>بازه فیلتر فعال: از {startDate} تا {endDate}</span>
          </div>
        </div>

        {/* Dashboard Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Revenue card */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white space-y-3 shadow-md relative overflow-hidden">
            <div className="absolute right-[-10px] bottom-[-10px] opacity-10">
              <TrendingUp className="w-24 h-24" />
            </div>
            <span className="text-[10px] font-bold text-emerald-100 tracking-wider block bg-emerald-600/30 px-2 py-0.5 rounded-full w-fit">جمع درآمدهای کل</span>
            <div>
              <span className="text-[10px] text-white/70 block">فروش فاکتور + درآمدهای متفرقه</span>
              <span className="font-bold font-mono text-lg sm:text-xl block mt-1">{formatCurrency(totalRevenues)}</span>
            </div>
            <div className="text-[10px] text-emerald-50 pt-2 border-t border-white/15 flex justify-between font-mono">
              <span>فروش کالا و خدمات: {formatCurrency(totalSales)}</span>
            </div>
          </div>

          {/* Costs card */}
          <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white space-y-3 shadow-md relative overflow-hidden">
            <div className="absolute right-[-10px] bottom-[-10px] opacity-10">
              <TrendingDown className="w-24 h-24" />
            </div>
            <span className="text-[10px] font-bold text-rose-100 tracking-wider block bg-rose-600/30 px-2 py-0.5 rounded-full w-fit">بهای تمام‌شده و هزینه‌ها</span>
            <div>
              <span className="text-[10px] text-white/70 block">بهای کالای فروخته‌شده + هزینه‌های جاری</span>
              <span className="font-bold font-mono text-lg sm:text-xl block mt-1">{formatCurrency(totalExpenditures)}</span>
            </div>
            <div className="text-[10px] text-rose-50 pt-2 border-t border-white/15 flex justify-between font-mono">
              <span>بهای کالای فروش‌رفته: {formatCurrency(totalCostOfGoodsSold)}</span>
            </div>
          </div>

          {/* Net Profit Card */}
          <div className={`rounded-xl p-5 text-white space-y-3 shadow-md relative overflow-hidden ${
            netProfit >= 0 ? 'bg-gradient-to-br from-blue-600 to-indigo-700' : 'bg-gradient-to-br from-amber-600 to-red-700'
          }`}>
            <div className="absolute right-[-10px] bottom-[-10px] opacity-10">
              <Award className="w-24 h-24" />
            </div>
            <span className="text-[10px] font-bold text-blue-100 tracking-wider block bg-white/10 px-2 py-0.5 rounded-full w-fit">سود (زیان) خالص نهایی</span>
            <div>
              <span className="text-[10px] text-white/70 block">سود ناخالص: {formatCurrency(grossProfit)}</span>
              <span className="font-bold font-mono text-lg sm:text-xl block mt-1">{formatCurrency(netProfit)}</span>
            </div>
            <div className="text-[10px] pt-2 border-t border-white/15 flex justify-between font-sans">
              <span>وضعیت عملکرد: {netProfit >= 0 ? 'سوددهی مطلوب بازه' : 'زیان‌ده بازه زمانی'}</span>
            </div>
          </div>

        </div>

        {/* Breakdown tables */}
        <div className="row mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-150 dark:border-slate-700/60 rounded-xl space-y-3">
            <h4 className="font-bold text-slate-700 dark:text-slate-200 text-xs border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center justify-between">
              <span>تحلیل فروش و سود ناخالص (Gross Margin)</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                {totalSales > 0 ? `حاشیه سود: %${Math.round((grossProfit / totalSales) * 100)}` : ''}
              </span>
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded">
                <span className="text-slate-600 dark:text-slate-400">مجموع درآمد حاصل از فروش فاکتورها:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatCurrency(totalSales)}</span>
              </div>
              <div className="flex justify-between p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded">
                <span className="text-slate-600 dark:text-slate-400">بهای تمام‌شده کالای فروش‌رفته (COGS):</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">({formatCurrency(totalCostOfGoodsSold)})</span>
              </div>
              <div className="flex justify-between p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded font-bold">
                <span className="text-emerald-800 dark:text-emerald-300">سود ناخالص عملیاتی (فروش - بهای تمام‌شده):</span>
                <span className="font-mono text-emerald-700 dark:text-emerald-400">{formatCurrency(grossProfit)}</span>
              </div>
              <div className="flex justify-between p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded">
                <span className="text-slate-600 dark:text-slate-400">سایر درآمدهای واریزی و متفرقه:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(otherRevenues)}</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-150 dark:border-slate-700/60 rounded-xl space-y-3">
            <h4 className="font-bold text-slate-700 dark:text-slate-200 text-xs border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center justify-between">
              <span>هزینه‌های عملیاتی و مدیریت انبار</span>
              <PackageCheck className="w-4 h-4 text-indigo-500" />
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded">
                <span className="text-slate-600 dark:text-slate-400">هزینه‌های اداری، عمومی و تشکیلاتی:</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{formatCurrency(totalExpenses)}</span>
              </div>
              <div className="flex justify-between p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded">
                <span className="text-slate-600 dark:text-slate-400">کل فاکتورهای خرید کالا در این دوره:</span>
                <span className="font-mono font-bold text-slate-600 dark:text-slate-400">{formatCurrency(totalPurchase)}</span>
              </div>
              <div className="p-2 bg-blue-50/70 dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                <span className="font-bold text-indigo-700 dark:text-indigo-400 block mb-0.5">💡 اصل حسابداری موجودی کالا:</span>
                خریدهای کالا به ارزش دارایی انبار افزوده می‌شوند و هزینه مستقیم دوره نیستند. فقط بهای کالاهای واقعاً فروخته‌شده ({formatCurrency(totalCostOfGoodsSold)}) به عنوان بهای تمام‌شده کسر شده است.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

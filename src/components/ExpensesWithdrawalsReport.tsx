import React, { useState } from 'react';
import { BankTransaction } from '../types';
import { formatCurrency, toPersianDigits, getTodayJalali, getOneMonthAgoJalali } from '../utils/stateManager';
import { JalaliDatePicker } from './JalaliDatePicker';
import { isPartnerWithdrawalOrEquity, isOperatingExpense } from '../services/accountingEngine';
import { normalizeJalaliDate, isDateInRange } from '../services/dateService';
import { 
  TrendingDown, 
  TrendingUp, 
  Filter, 
  Calendar, 
  Landmark, 
  Receipt, 
  PieChart, 
  Info, 
  CreditCard, 
  ArrowLeftRight, 
  TrendingUp as ProfitIcon, 
  Users, 
  DollarSign,
  ShieldCheck
} from 'lucide-react';

interface ExpensesWithdrawalsReportProps {
  transactions: BankTransaction[];
}

export default function ExpensesWithdrawalsReport({
  transactions
}: ExpensesWithdrawalsReportProps) {
  const currencyLabel = localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال';

  // Find the earliest transaction date dynamically
  const getEarliestDate = () => {
    if (!transactions || transactions.length === 0) return getOneMonthAgoJalali();
    let minDate = '';
    transactions.forEach(t => {
      if (t.isDeleted) return;
      const normTDate = normalizeJalaliDate(t.date);
      if (normTDate && (!minDate || normTDate < minDate)) {
        minDate = normTDate;
      }
    });
    return minDate || getOneMonthAgoJalali();
  };

  // Date Filters
  const [startDate, setStartDate] = useState(getEarliestDate());
  const [endDate, setEndDate] = useState(getTodayJalali());

  // Tabs
  const [activeTab, setActiveTab] = useState<'expenses' | 'withdrawals' | 'deposits'>('expenses');

  // Filter within date range first using central date service
  const inRangeTx = transactions.filter(t => {
    if (t.isDeleted) return false;
    return isDateInRange(t.date, startDate, endDate);
  }).sort((a, b) => normalizeJalaliDate(b.date).localeCompare(normalizeJalaliDate(a.date)) || b.id.localeCompare(a.id));

  // 1. Operating Expenses (هزینه‌های جاری و عملیاتی): strictly excluding partner withdrawals, debt payments, and internal transfers
  const expenseTransactions = inRangeTx.filter(t => isOperatingExpense(t));

  // 2. Partner Drawings & Equity (برداشت‌های شرکا و حقوق صاحبان سرمایه): strictly partner drawings/equity withdrawals
  const withdrawalTransactions = inRangeTx.filter(t => isPartnerWithdrawalOrEquity(t));

  // 3. Deposits (واریزها): type === 'deposit'
  const depositTransactions = inRangeTx.filter(t => t.type === 'deposit');

  // Categories extraction for checkboxes
  const expenseCategories = Array.from(new Set(
    expenseTransactions.map(t => t.categoryChild || t.categoryParent || 'هزینه‌های عمومی')
  ));

  const withdrawalCategories = Array.from(new Set(
    withdrawalTransactions.map(t => t.categoryChild || t.categoryParent || 'برداشت و جاری شرکا')
  ));

  const depositCategories = Array.from(new Set(
    depositTransactions.map(t => t.categoryChild || t.categoryParent || 'واریز طبقه‌بندی نشده')
  ));

  // Category unselected states (persists user uncheck choices across date filtering)
  const [unselectedExpenseCats, setUnselectedExpenseCats] = useState<string[]>([]);
  const [unselectedWithdrawalCats, setUnselectedWithdrawalCats] = useState<string[]>([]);
  const [unselectedDepositCats, setUnselectedDepositCats] = useState<string[]>([]);

  const selectedExpenseCats = expenseCategories.filter(c => !unselectedExpenseCats.includes(c));
  const selectedWithdrawalCats = withdrawalCategories.filter(c => !unselectedWithdrawalCats.includes(c));
  const selectedDepositCats = depositCategories.filter(c => !unselectedDepositCats.includes(c));

  const handleExpenseCatToggle = (cat: string) => {
    setUnselectedExpenseCats(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleWithdrawalCatToggle = (cat: string) => {
    setUnselectedWithdrawalCats(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const handleDepositCatToggle = (cat: string) => {
    setUnselectedDepositCats(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  // Filter lists based on checked categories
  const finalExpenses = expenseTransactions.filter(t => 
    selectedExpenseCats.includes(t.categoryChild || t.categoryParent || 'هزینه‌های عمومی')
  );

  const finalWithdrawals = withdrawalTransactions.filter(t => 
    selectedWithdrawalCats.includes(t.categoryChild || t.categoryParent || 'برداشت و جاری شرکا')
  );

  const finalDeposits = depositTransactions.filter(t => 
    selectedDepositCats.includes(t.categoryChild || t.categoryParent || 'واریز طبقه‌بندی نشده')
  );

  // Sums
  const totalExpensesSum = finalExpenses.reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawalsSum = finalWithdrawals.reduce((sum, t) => sum + t.amount, 0);
  const totalDepositsSum = finalDeposits.reduce((sum, t) => sum + t.amount, 0);

  // Raw overall sums in the date range (unfiltered by checkboxes) for balance sheets
  const rawTotalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
  const rawTotalWithdrawals = withdrawalTransactions.reduce((sum, t) => sum + t.amount, 0);
  const rawTotalDeposits = depositTransactions.reduce((sum, t) => sum + t.amount, 0);
  const netBalance = rawTotalDeposits - rawTotalExpenses - rawTotalWithdrawals;

  // Chart Data preparation
  const COLORS = ['#6366f1', '#f43f5e', '#14b8a6', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981'];

  const expenseChartData = expenseCategories.map((cat) => {
    const value = expenseTransactions
      .filter(t => (t.categoryChild || t.categoryParent || 'هزینه‌های عمومی') === cat)
      .reduce((sum, t) => sum + t.amount, 0);
    return { name: cat, value };
  }).filter(d => d.value > 0);

  const withdrawalChartData = withdrawalCategories.map((cat) => {
    const value = withdrawalTransactions
      .filter(t => (t.categoryChild || t.categoryParent || 'برداشت و جاری شرکا') === cat)
      .reduce((sum, t) => sum + t.amount, 0);
    return { name: cat, value };
  }).filter(d => d.value > 0);

  const depositChartData = depositCategories.map((cat) => {
    const value = depositTransactions
      .filter(t => (t.categoryChild || t.categoryParent || 'واریز طبقه‌بندی نشده') === cat)
      .reduce((sum, t) => sum + t.amount, 0);
    return { name: cat, value };
  }).filter(d => d.value > 0);

  const getActiveData = () => {
    if (activeTab === 'expenses') {
      return { list: finalExpenses, sum: totalExpensesSum, chart: expenseChartData };
    }
    if (activeTab === 'withdrawals') {
      return { list: finalWithdrawals, sum: totalWithdrawalsSum, chart: withdrawalChartData };
    }
    return { list: finalDeposits, sum: totalDepositsSum, chart: depositChartData };
  };

  const activeData = getActiveData();

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Top Title Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Landmark className="w-6 h-6 text-indigo-500" />
              <span>گزارش جامع مالی (هزینه‌های عملیاتی، برداشت شرکا، واریزها)</span>
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
              تفکیک استاندارد حسابداری میان هزینه‌های جاری کسب‌وکار و برداشت‌های حقوق صاحبان سهام و شرکا
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl text-right">
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold block">مجموع کل واریزها</span>
              <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 font-mono">
                {formatCurrency(rawTotalDeposits)}
              </span>
            </div>
            <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl text-right">
              <span className="text-[9px] text-indigo-600 dark:text-indigo-400 font-extrabold block">هزینه‌های جاری عملیاتی</span>
              <span className="text-xs font-black text-indigo-800 dark:text-indigo-300 font-mono">
                {formatCurrency(rawTotalExpenses)}
              </span>
            </div>
            <div className="p-3 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl text-right">
              <span className="text-[9px] text-rose-600 dark:text-rose-400 font-extrabold block">برداشت و جاری شرکا</span>
              <span className="text-xs font-black text-rose-800 dark:text-rose-300 font-mono">
                {formatCurrency(rawTotalWithdrawals)}
              </span>
            </div>
            <div className={`p-3 border rounded-2xl text-right ${
              netBalance >= 0 
                ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30' 
                : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30'
            }`}>
              <span className="text-[9px] font-extrabold block text-slate-500 dark:text-slate-400">تراز نقدینگی نهایی</span>
              <span className={`text-xs font-black font-mono ${netBalance >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-amber-850 dark:text-amber-300'}`}>
                {formatCurrency(netBalance)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Date Range Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-150 dark:border-slate-850">
        <div className="space-y-1">
          <label className="text-[11px] font-black text-slate-600 dark:text-slate-400 flex items-center gap-1.5 pr-1">
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            <span>تاریخ شروع گزارشگیری</span>
          </label>
          <JalaliDatePicker value={startDate} onChange={setStartDate} placeholder="۱۴۰۳/۰۱/۰۱" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-black text-slate-600 dark:text-slate-400 flex items-center gap-1.5 pr-1">
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            <span>تاریخ پایان گزارشگیری</span>
          </label>
          <JalaliDatePicker value={endDate} onChange={setEndDate} placeholder="۱۴۰۵/۱۲/۲۹" />
        </div>
        <div className="p-3 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 rounded-xl text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed flex items-start gap-1.5 h-[38px] items-center">
          <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <span>بروزرسانی داده‌ها بر مبنای تاریخ و چک‌باکس‌ها به صورت آنی و لحظه‌ای انجام می‌شود.</span>
        </div>
      </div>

      {/* Report Structure Navigation Tabs Box */}
      <div className="bg-slate-50/70 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800 p-1.5 rounded-2xl flex gap-1 items-center overflow-x-auto">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-5 py-2.5 text-xs font-black transition-all rounded-xl cursor-pointer shrink-0 ${
            activeTab === 'expenses'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10 font-extrabold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
          }`}
        >
          هزینه‌های جاری و عملیاتی ({toPersianDigits(finalExpenses.length)})
        </button>
        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`px-5 py-2.5 text-xs font-black transition-all rounded-xl cursor-pointer shrink-0 ${
            activeTab === 'withdrawals'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-500/10 font-extrabold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
          }`}
        >
          برداشت و جاری شرکا ({toPersianDigits(finalWithdrawals.length)})
        </button>
        <button
          onClick={() => setActiveTab('deposits')}
          className={`px-5 py-2.5 text-xs font-black transition-all rounded-xl cursor-pointer shrink-0 ${
            activeTab === 'deposits'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/10 font-extrabold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
          }`}
        >
          واریزها و درآمدها ({toPersianDigits(finalDeposits.length)})
        </button>
      </div>

      {activeTab === 'withdrawals' && (
        <div className="p-3.5 bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/30 rounded-2xl text-[11px] text-rose-800 dark:text-rose-300 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
          <span><strong>قانون استاندارد حسابداری:</strong> مبالغ برداشت شرکا مستقیماً از حقوق صاحبان سهام / سرمایه در ترازنامه کسر می‌شوند و به هیچ عنوان جزء هزینه‌های جاری شرکت و صورت سود و زیان محاسبه نمی‌گردند.</span>
        </div>
      )}

      {/* Category Checkbox Filters */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl shadow-sm space-y-3">
            <div className="flex items-center gap-1.5 border-b border-slate-50 dark:border-slate-850 pb-2 mb-3">
              <Filter className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                فیلتر سریع دسته‌بندی‌های موجود در دوره (چک‌باکس)
              </h4>
            </div>

            {activeTab === 'expenses' && (
              expenseCategories.length === 0 ? (
                <span className="text-[10px] text-slate-400">هیچ دسته‌بندی هزینه‌ای در این بازه پیدا نشد.</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {expenseCategories.map(cat => {
                    const isChecked = selectedExpenseCats.includes(cat);
                    return (
                      <label
                        key={cat}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer transition-all select-none ${
                          isChecked
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500/30 text-indigo-700 dark:text-indigo-400'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleExpenseCatToggle(cat)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                        />
                        <span>{cat}</span>
                      </label>
                    );
                  })}
                </div>
              )
            )}

            {activeTab === 'withdrawals' && (
              withdrawalCategories.length === 0 ? (
                <span className="text-[10px] text-slate-400">هیچ دسته‌بندی برداشتی در این بازه پیدا نشد.</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {withdrawalCategories.map(cat => {
                    const isChecked = selectedWithdrawalCats.includes(cat);
                    return (
                      <label
                        key={cat}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer transition-all select-none ${
                          isChecked
                            ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/30 text-rose-700 dark:text-rose-400'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleWithdrawalCatToggle(cat)}
                          className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 h-3.5 w-3.5"
                        />
                        <span>{cat}</span>
                      </label>
                    );
                  })}
                </div>
              )
            )}

            {activeTab === 'deposits' && (
              depositCategories.length === 0 ? (
                <span className="text-[10px] text-slate-400">هیچ دسته‌بندی واریزی در این بازه پیدا نشد.</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {depositCategories.map(cat => {
                    const isChecked = selectedDepositCats.includes(cat);
                    return (
                      <label
                        key={cat}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer transition-all select-none ${
                          isChecked
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleDepositCatToggle(cat)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                        />
                        <span>{cat}</span>
                      </label>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* Visual Analytics & Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart Column */}
            <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <PieChart className="w-4 h-4 text-indigo-500" />
                  <span>تسهیم درصد مخارج این حوزه مالی</span>
                </h4>
                <p className="text-[9px] text-slate-400 mt-1">نمایش سهم هر دسته‌بندی از مبالغ فیلتر شده</p>
              </div>

              <div className="my-6 space-y-4 max-h-[220px] overflow-y-auto pr-1">
                {activeData.chart.length === 0 ? (
                  <div className="text-[10px] text-slate-400 font-semibold text-center py-8">داده‌ای برای ترسیم نمودار وجود ندارد.</div>
                ) : (
                  activeData.chart.map((item, idx) => {
                    const total = activeData.sum || 1;
                    const percentage = Math.round((item.value / total) * 100);
                    const color = COLORS[idx % COLORS.length];

                    return (
                      <div key={idx} className="space-y-1 animate-fade-in">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="truncate max-w-[120px]">{item.name}</span>
                          </span>
                          <span className="font-mono text-slate-500 dark:text-slate-400 font-normal">
                            {toPersianDigits(percentage)}٪ ({formatCurrency(item.value)})
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                          <div className="rounded-full h-2 transition-all duration-500" style={{ backgroundColor: color, width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-2 border-t border-slate-50 dark:border-slate-850 text-center">
                <span className="text-[9px] text-slate-400 font-bold">بازه محاسبات: {toPersianDigits(startDate)} الی {toPersianDigits(endDate)}</span>
              </div>
            </div>

            {/* Data List Table Column */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/75 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400 font-black border-b border-slate-100 dark:border-slate-850 text-[10px]">
                      <th className="p-3.5">سرفصل دسته‌بندی (اصلی / معین)</th>
                      <th className="p-3.5">تاریخ ثبت</th>
                      <th className="p-3.5 text-left">مبلغ تراکنش ({currencyLabel})</th>
                      <th className="p-3.5">شرح و توضیحات بابت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {activeData.list.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-12 text-center text-slate-400 dark:text-slate-500 font-semibold">
                          تراکنشی با فیلترهای بالا یافت نشد.
                        </td>
                      </tr>
                    ) : (
                      activeData.list.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/10 text-xs transition-colors">
                          <td className="p-3.5 space-y-0.5">
                            <div className="font-extrabold text-slate-800 dark:text-slate-100">
                              {activeTab === 'expenses' 
                                ? (t.categoryChild || 'طبقه‌بندی نشده') 
                                : activeTab === 'withdrawals' 
                                  ? (t.categoryChild || 'برداشت نقدی عمومی')
                                  : (t.categoryChild || t.categoryParent || 'واریز طبقه‌بندی نشده')}
                            </div>
                            <div className="text-[9px] text-slate-400 font-bold">
                              {t.categoryParent || 'بدون سرگروه'}
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-500 font-mono text-[10px]">
                            {toPersianDigits(t.date)} <span className="opacity-60 text-[9px] mr-1">{toPersianDigits(t.time)}</span>
                          </td>
                          <td className={`p-3.5 text-left font-mono font-black ${
                            t.type === 'deposit' 
                              ? 'text-emerald-600 dark:text-emerald-400' 
                              : 'text-slate-900 dark:text-slate-200'
                          }`}>
                            {t.type === 'deposit' ? '+' : '-'} {formatCurrency(t.amount)}
                          </td>
                          <td className="p-3.5 text-slate-500 truncate max-w-[200px]" title={t.description}>
                            {t.description || 'ثبت شده بدون شرح مشخص'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="p-3 bg-slate-50/75 dark:bg-slate-950/20 border-t border-slate-100 dark:border-slate-850 flex justify-between items-center text-xs font-extrabold">
                <span className="text-slate-500">جمع کل تراکنش‌های نمایش‌داده شده در این تب با فیلترها:</span>
                <span className="text-slate-900 dark:text-slate-100 font-black font-mono">
                  {formatCurrency(activeData.sum)}
                </span>
              </div>
            </div>
          </div>
    </div>
  );
}

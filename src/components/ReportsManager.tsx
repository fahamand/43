import React, { useState, useEffect } from 'react';
import { Invoice, WarehouseItem } from '../types';
import { formatCurrency, getTodayJalali, getOneMonthAgoJalali } from '../utils/stateManager';
import { isDateInRange, normalizeJalaliDate } from '../services/dateService';
import { ListFilter, Calendar, Copy, Check, Info, FileText, ShoppingBag, Landmark, Users, CalendarDays, TrendingUp, BarChart2, Shield, WifiOff } from 'lucide-react';
import { JalaliDatePicker } from './JalaliDatePicker';

interface ReportsManagerProps {
  invoices: Invoice[];
  items: WarehouseItem[];
}

type ReportTab = 'procurement' | 'financials' | 'staff';

export default function ReportsManager({
  invoices,
  items
}: ReportsManagerProps) {
  const currencyLabel = localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال';
  const [activeTab, setActiveTab] = useState<ReportTab>('procurement');
  const [startDate, setStartDate] = useState(getOneMonthAgoJalali());
  const [endDate, setEndDate] = useState(getTodayJalali());
  const [copied, setCopied] = useState(false);

  // Parse strings "YYYY/MM/DD" for comparisons using central dateService
  const isWithinRange = (dateStr: string) => {
    return isDateInRange(dateStr, startDate, endDate);
  };

  // 1. Procurements report (old sold items) with proportional discount & tax adjustment
  const compileSoldItemsReport = () => {
    const reportMap: { [itemId: string]: { name: string; color?: string; totalQty: number; revenue: number } } = {};

    invoices
      .filter(inv => !inv.isDeleted && inv.type === 'sale' && !inv.isProforma && isWithinRange(inv.date))
      .forEach(inv => {
        const itemsSubtotal = (inv.items || []).reduce((sum, it) => sum + (Number(it.totalPrice) || 0), 0);
        const adjustmentFactor = itemsSubtotal > 0 ? (Number(inv.totalAmount) || 0) / itemsSubtotal : 1;

        (inv.items || []).forEach(item => {
          if (item.type !== 'kala') return; // physical goods only for procurement/warehouse orders

          const rawTotal = Number(item.totalPrice) !== undefined && !isNaN(Number(item.totalPrice))
            ? Number(item.totalPrice)
            : Math.round((Number(item.qty) || 0) * (Number(item.unitPrice) || 0));
          const adjustedRevenue = Math.round(rawTotal * adjustmentFactor);

          const itemIdKey = item.itemId || item.name;

          if (reportMap[itemIdKey]) {
            reportMap[itemIdKey].totalQty += Number(item.qty) || 0;
            reportMap[itemIdKey].revenue += adjustedRevenue;
          } else {
            reportMap[itemIdKey] = {
              name: item.name,
              color: item.color,
              totalQty: Number(item.qty) || 0,
              revenue: adjustedRevenue
            };
          }
        });
      });

    return Object.keys(reportMap).map(id => ({
      itemId: id,
      ...reportMap[id]
    }));
  };

  const reportData = compileSoldItemsReport();
  const totalItemCount = reportData.reduce((sum, item) => sum + item.totalQty, 0);
  const totalItemRev = reportData.reduce((sum, item) => sum + item.revenue, 0);

  // 2. Financials totals report (Sales vs Purchases)
  const finalSales = invoices.filter(inv => !inv.isDeleted && inv.type === 'sale' && !inv.isProforma && isWithinRange(inv.date));
  const finalPurchases = invoices.filter(inv => !inv.isDeleted && inv.type === 'purchase' && !inv.isProforma && isWithinRange(inv.date));
  const proformaSales = invoices.filter(inv => !inv.isDeleted && inv.type === 'sale' && inv.isProforma && isWithinRange(inv.date));

  const totalSalesAmount = finalSales.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPurchasesAmount = finalPurchases.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalProformasAmount = proformaSales.reduce((sum, inv) => sum + inv.totalAmount, 0);

  // 3. Staff Performance Report (Invoices issued by seller users)
  const compileStaffReport = () => {
    const staffMap: { [issuedById: string]: { name: string; invoicesCount: number; salesTotal: number; proformasCount: number } } = {};

    invoices
      .filter(inv => !inv.isDeleted && isWithinRange(inv.date))
      .forEach(inv => {
        const key = inv.createdById || 'system';
        const name = inv.createdBy || 'سیستم کل / نامشخص';
        
        if (!staffMap[key]) {
          staffMap[key] = { name, invoicesCount: 0, salesTotal: 0, proformasCount: 0 };
        }

        if (inv.type === 'sale') {
          if (inv.isProforma) {
            staffMap[key].proformasCount += 1;
          } else {
            staffMap[key].invoicesCount += 1;
            staffMap[key].salesTotal += inv.totalAmount;
          }
        }
      });

    return Object.keys(staffMap).map(id => ({
      userId: id,
      ...staffMap[id]
    }));
  };

  const staffReportData = compileStaffReport();

  const handleCopyTextList = () => {
    let text = `لیست احتیاج خرید جدید (دوره مالی تفصیلی: ${startDate} لغایت ${endDate})\n\n`;
    reportData.forEach((it, idx) => {
      text += `${idx + 1}. محصول " ${it.name} " - رنگ: ${it.color || 'بی‌رنگ'} => تعداد تجمیعی فروش رفته: ${it.totalQty} عدد\n`;
    });
    text += `\nتهیه شده بر اساس فاکتورهای فروش قطعی سیستم حسابداری`;
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8 space-y-6 shadow-sm text-right" dir="rtl font-sans">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-5 gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>گزارشات و تحلیلگر آماری سیستم</span>
          </h2>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-1.5 font-bold leading-relaxed">
            استخراج فوری گزارش اقلام پرفروش، کارنامه عملکرد پرسنل و خلاصه تراکنش‌های اسناد مالی در بازه‌های زمانی دلخواه (خارج از سود و زیان دفاتر).
          </p>
        </div>

        {reportData.length > 0 && activeTab === 'procurement' && (
          <button
            onClick={handleCopyTextList}
            className="flex items-center gap-2 text-xs bg-slate-950 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-755 text-white font-black py-2.5 px-4 rounded-xl cursor-pointer transition-all shrink-0"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>کپی متن سفارش خرید انبار</span>
          </button>
        )}
      </div>

      {/* Date Range Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-150 dark:border-slate-850 items-end">
        <div className="space-y-1">
          <label className="text-[11px] font-black text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            <span>تاریخ شروع بازه گزارشگیری</span>
          </label>
          <JalaliDatePicker
            value={startDate}
            onChange={setStartDate}
            placeholder="۱۴۰۵/۰۱/۰۱"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-black text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            <span>تاریخ پایان بازه گزارشگیری</span>
          </label>
          <JalaliDatePicker
            value={endDate}
            onChange={setEndDate}
            placeholder="۱۴۰۵/۱۲/۲۹"
          />
        </div>

        <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/20 rounded-xl text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-2 h-full md:col-span-2 lg:col-span-1">
          <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          <span>با تغییر دادن تاریخ‌های بالا، محاسبات تمامی تب‌های زیر به شکل لحظه‌ای و کاملا خودکار بروزرسانی خواهند شد.</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-150 dark:border-slate-800 gap-1.5 pb-px">
        <button
          onClick={() => setActiveTab('procurement')}
          className={`px-4 py-2 text-xs font-bold transition-all relative cursor-pointer ${
            activeTab === 'procurement'
              ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5 inline ml-1.5" />
          گزارش کالاها و لیست تأمین مجدد
        </button>

        <button
          onClick={() => setActiveTab('financials')}
          className={`px-4 py-2 text-xs font-bold transition-all relative cursor-pointer ${
            activeTab === 'financials'
              ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Landmark className="w-3.5 h-3.5 inline ml-1.5" />
          گزارش کل تراکنش‌های دوره مالی
        </button>

        <button
          onClick={() => setActiveTab('staff')}
          className={`px-4 py-2 text-xs font-bold transition-all relative cursor-pointer ${
            activeTab === 'staff'
              ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Users className="w-3.5 h-3.5 inline ml-1.5" />
          ارزیابی عملکرد و کارنامه پرسنل
        </button>
      </div>

      {/* Tab Contents */}
      <div className="space-y-4">
        
        {/* Tab 1: Procurement Restock Planning */}
        {activeTab === 'procurement' && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-150 dark:border-slate-850 flex justify-between items-center text-xs font-black text-slate-700 dark:text-slate-300">
              <span>گزارش حجم فروش کالاها از {startDate} الی {endDate}:</span>
              <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/50">تعداد کالاها: {reportData.length} قلم</span>
            </div>

            {reportData.length === 0 ? (
              <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-xs font-bold">
                <ListFilter className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-2" />
                <p>تراکمی از فروش کالاهای فیزیکی در بازه معین شده یافت نشد.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <header className="hidden"></header>
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950/40 text-slate-500 dark:text-slate-450 font-black border-b border-slate-150 dark:border-slate-850">
                      <th className="p-4">عنوان کالا</th>
                      <th className="p-4">رنگبندی</th>
                      <th className="p-4 text-center">تیراژ فروش‌رفته</th>
                      <th className="p-4 text-left">ارزش حاصله فاکتورها</th>
                      <th className="p-4 text-center">هدف تأمین مجدد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
                    {reportData.map(it => (
                      <tr key={it.itemId} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/25">
                        <td className="p-4 font-extrabold text-slate-900 dark:text-white">{it.name}</td>
                        <td className="p-4 font-bold text-slate-500 font-mono text-right">{it.color || 'بی‌رنگ'}</td>
                        <td className="p-4 text-center font-mono font-black text-rose-600 dark:text-rose-400 text-sm">{it.totalQty} عدد</td>
                        <td className="p-4 font-mono text-left font-bold">{formatCurrency(it.revenue)}</td>
                        <td className="p-4 text-center">
                          <span className="inline-block px-3 py-1 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900 rounded-lg text-[10px] font-bold">
                            خرید حداقل {it.totalQty} عدد جدید
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100/50 dark:bg-slate-950 font-black text-slate-900 dark:text-white">
                      <td colSpan={2} className="p-4 text-left">مجموع کل:</td>
                      <td className="p-4 text-center font-mono text-rose-600 dark:text-rose-400 text-sm">{totalItemCount} عدد کالا</td>
                      <td colSpan={2} className="p-4 text-left font-mono font-extrabold text-blue-700 dark:text-blue-400 text-sm">
                        {formatCurrency(totalItemRev)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Financials Totals Volume */}
        {activeTab === 'financials' && (
          <div className="space-y-6">
            
            {/* Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="p-6 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl shadow-sm text-right space-y-2">
                <span className="text-[10px] text-slate-400 font-extrabold block">فروش نهایی قطعی</span>
                <span className="text-xl font-mono font-black text-emerald-600 dark:text-emerald-400 block">
                  {formatCurrency(totalSalesAmount)}
                </span>
                <span className="text-[9px] bg-slate-55 text-slate-600 dark:text-slate-400 font-bold block">
                  تعداد فاکتورهای صادر شده: {finalSales.length} برگ
                </span>
              </div>

              <div className="p-6 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl shadow-sm text-right space-y-2">
                <span className="text-[10px] text-slate-400 font-extrabold block">خرید نهایی انبار</span>
                <span className="text-xl font-mono font-black text-indigo-600 dark:text-indigo-400 block">
                  {formatCurrency(totalPurchasesAmount)}
                </span>
                <span className="text-[9px] bg-slate-55 text-slate-600 dark:text-slate-400 font-bold block">
                  تعداد فاکتورهای خرید ثبت شده: {finalPurchases.length} برگ
                </span>
              </div>

              <div className="p-6 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl shadow-sm text-right space-y-2">
                <span className="text-[10px] text-slate-400 font-extrabold block">پیش‌فاکتورهای معلق صادرشده</span>
                <span className="text-xl font-mono font-black text-amber-600 dark:text-amber-400 block">
                  {formatCurrency(totalProformasAmount)}
                </span>
                <span className="text-[9px] bg-slate-55 text-slate-600 dark:text-slate-400 font-bold block">
                  تعداد پیش‌فاکتورهای صادر شده: {proformaSales.length} برگ
                </span>
              </div>

            </div>

            {/* General Overview List */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 border-b border-rose-50 dark:border-slate-800 pb-2 mb-4">
                تراز گردش اسناد صادرشده در پروسه زمانی ({startDate} لغایت {endDate})
              </h4>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs font-bold p-3 bg-slate-50 dark:bg-slate-950 rounded-xl">
                  <span className="text-slate-600 dark:text-slate-400">میانگین ارزش فاکتورهای فروش صادرشده:</span>
                  <span className="font-mono text-slate-900 dark:text-white">
                    {finalSales.length > 0 
                      ? formatCurrency(Math.floor(totalSalesAmount / finalSales.length)) 
                      : `۰ ${currencyLabel}`}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs font-bold p-3 bg-slate-50 dark:bg-slate-950 rounded-xl">
                  <span className="text-slate-600 dark:text-slate-400">میانگین خرید فاکتوری از تامین‌کنندگان:</span>
                  <span className="font-mono text-slate-900 dark:text-white">
                    {finalPurchases.length > 0 
                      ? formatCurrency(Math.floor(totalPurchasesAmount / finalPurchases.length)) 
                      : `۰ ${currencyLabel}`}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs font-bold p-3 bg-slate-50 dark:bg-slate-950 rounded-xl">
                  <span className="text-slate-600 dark:text-slate-400">برتری خالص مالی (تفاضل فروش از خرید قطعی):</span>
                  <span className={`font-mono text-sm font-black ${totalSalesAmount >= totalPurchasesAmount ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatCurrency(Math.abs(totalSalesAmount - totalPurchasesAmount))}
                    {totalSalesAmount >= totalPurchasesAmount ? ' (مازاد مثبت تجاری)' : ' (تراز منفی)'}
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Tab 3: Staff Performance */}
        {activeTab === 'staff' && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-slate-900">
            <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-150 dark:border-slate-850 text-xs font-black text-slate-705 dark:text-slate-300">
              کارنامه فروش و تعهد عملکرد بازاریابی پرسنل صادرکننده:
            </div>

            {staffReportData.length === 0 ? (
              <div className="p-12 text-center text-slate-400 dark:text-slate-505 text-xs font-bold font-sans">
                تراکمی از کارنامه پرسنل در این بازه تاریخی به دست نیامد.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-100/60 dark:bg-slate-950 text-slate-500 dark:text-slate-450 font-black border-b border-slate-150 dark:border-slate-850">
                      <th className="p-4">پرسنل گرامی / صادرکننده فاکتور</th>
                      <th className="p-4 text-center">تعداد فاکتور فروش قطعی</th>
                      <th className="p-4 text-center">تعداد پیش‌فاکتور (معلق)</th>
                      <th className="p-4 text-left font-black">حجم کل فروش حاصله ({currencyLabel})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
                    {staffReportData.map(st => (
                      <tr key={st.userId} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/25">
                        <td className="p-4 font-black text-slate-850 dark:text-white flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                          <span>{st.name}</span>
                        </td>
                        <td className="p-4 text-center font-mono font-bold text-slate-800 dark:text-slate-200">{st.invoicesCount} عدد</td>
                        <td className="p-4 text-center font-mono font-bold text-slate-500">{st.proformasCount} عدد</td>
                        <td className="p-4 font-mono text-left font-black text-blue-700 dark:text-blue-400 space-y-px">{formatCurrency(st.salesTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}

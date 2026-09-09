import React, { useState } from 'react';
import { Counterpart, Invoice, PaymentAllocation } from '../types';
import { formatCurrency, toPersianDigits, getTodayJalali, getOneMonthAgoJalali } from '../utils/stateManager';
import { Search, Users, UserCheck, UserMinus, Phone, MapPin, TrendingUp, TrendingDown, Eye, FileText, Info, X, Printer, Calendar, RefreshCw } from 'lucide-react';
import { numberToPersianWords } from './InvoiceManager';
import { JalaliDatePicker } from './JalaliDatePicker';
import { PaginationControls } from './PaginationControls';
import { calculateCounterpartBalances, getInvoiceGrossTotal, getInvoiceRemainingBalance, normalizePersianText } from '../services/accountingEngine';

interface DebtorsCreditorsViewProps {
  counterparts: Counterpart[];
  invoices: Invoice[];
  paymentAllocations?: PaymentAllocation[];
}

export default function DebtorsCreditorsView({
  counterparts,
  invoices,
  paymentAllocations
}: DebtorsCreditorsViewProps) {
  const currencyLabel = localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال';
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'debtors' | 'creditors' | 'settled'>('all');
  const [selectedCounterpart, setSelectedCounterpart] = useState<Counterpart | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  const [startDate, setStartDate] = useState<string>(() => getOneMonthAgoJalali());
  const [endDate, setEndDate] = useState<string>(() => getTodayJalali());

  // Calculate balances for all counterparts from the single unified accounting engine
  const counterpartBalances = calculateCounterpartBalances(
    counterparts,
    invoices,
    startDate,
    endDate,
    paymentAllocations
  );

  // Filter counterpart list based on search query and active tab
  const filteredList = counterpartBalances.filter(item => {
    const normQuery = normalizePersianText(searchQuery);
    const normName = normalizePersianText(item.counterpart.name);
    const normAddress = normalizePersianText(item.counterpart.address || '');
    const phone = item.counterpart.phone || '';

    const matchesSearch = 
      !normQuery ||
      normName.includes(normQuery) ||
      phone.includes(searchQuery) ||
      normAddress.includes(normQuery);

    if (!matchesSearch) return false;

    if (activeTab === 'debtors') return item.netBalance > 0.01;
    if (activeTab === 'creditors') return item.netBalance < -0.01;
    if (activeTab === 'settled') return Math.abs(item.netBalance) <= 0.01;

    return true;
  });

  const [dcPage, setDcPage] = useState(1);
  const [dcPageSize, setDcPageSize] = useState(15);

  React.useEffect(() => {
    setDcPage(1);
  }, [searchQuery, activeTab, startDate, endDate]);

  const totalDcPages = Math.ceil(filteredList.length / dcPageSize) || 1;
  const paginatedList = filteredList.slice((dcPage - 1) * dcPageSize, dcPage * dcPageSize);

  // Summary stats
  const totalDebtorsCount = counterpartBalances.filter(item => item.netBalance > 0).length;
  const totalCreditorsCount = counterpartBalances.filter(item => item.netBalance < 0).length;
  const totalDebtorsAmount = counterpartBalances.filter(item => item.netBalance > 0).reduce((sum, item) => sum + item.netBalance, 0);
  const totalCreditorsAmount = counterpartBalances.filter(item => item.netBalance < 0).reduce((sum, item) => sum + Math.abs(item.netBalance), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100">مشاهده وضعیت بدهکاران و بستانکاران</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
              آنالیز برخط وضعیت بدهی، طلب و تراز تجاری تمام اشخاص، مشتریان و تامین‌کنندگان همکار به تفکیک جزئیات فاکتورها
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl text-right">
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold block">مجموع مطالبات (بدهکاران)</span>
              <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 font-mono">
                {formatCurrency(totalDebtorsAmount)}
              </span>
            </div>
            <div className="px-3.5 py-2 bg-rose-50 dark:bg-rose-950/25 border border-rose-100 dark:border-rose-900/40 rounded-2xl text-right">
              <span className="text-[9px] text-rose-600 dark:text-rose-400 font-extrabold block">مجموع بدهی‌ها (بستانکاران)</span>
              <span className="text-xs font-black text-rose-800 dark:text-rose-300 font-mono">
                {formatCurrency(totalCreditorsAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Date Filter Card */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-slate-50 dark:bg-slate-950 p-4 rounded-3xl border border-slate-150 dark:border-slate-850" dir="rtl">
        <div className="md:col-span-4 space-y-1.5">
          <label className="text-[11px] font-black text-slate-600 dark:text-slate-400 flex items-center gap-1.5 pr-1">
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            <span>از تاریخ تراکنش‌ها:</span>
          </label>
          <JalaliDatePicker value={startDate} onChange={setStartDate} placeholder="۱۴۰۳/۰۱/۰۱" />
        </div>
        <div className="md:col-span-4 space-y-1.5">
          <label className="text-[11px] font-black text-slate-600 dark:text-slate-400 flex items-center gap-1.5 pr-1">
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            <span>تا تاریخ تراکنش‌ها:</span>
          </label>
          <JalaliDatePicker value={endDate} onChange={setEndDate} placeholder="۱۴۰۵/۱۲/۲۹" />
        </div>
        <div className="md:col-span-4 flex items-end h-full pt-6 md:pt-0">
          <button
            type="button"
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setSearchQuery('');
              setActiveTab('all');
            }}
            className="w-full h-[38px] bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/20 dark:hover:bg-rose-950/30 dark:text-rose-400 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 border border-rose-100/30 dark:border-rose-950/40"
          >
            <RefreshCw className="w-4 h-4" />
            <span>پاک کردن تاریخچه</span>
          </button>
        </div>
      </div>

      {/* Control Panel: Search & Filter Tabs */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
        {/* Tab Filters */}
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200/50 dark:border-slate-800 w-full lg:w-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 lg:flex-none px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            همه ({toPersianDigits(counterparts.length)})
          </button>
          <button
            onClick={() => setActiveTab('debtors')}
            className={`flex-1 lg:flex-none px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'debtors'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600'
            }`}
          >
            بدهکاران ({toPersianDigits(totalDebtorsCount)})
          </button>
          <button
            onClick={() => setActiveTab('creditors')}
            className={`flex-1 lg:flex-none px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'creditors'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-rose-600'
            }`}
          >
            بستانکاران ({toPersianDigits(totalCreditorsCount)})
          </button>
          <button
            onClick={() => setActiveTab('settled')}
            className={`flex-1 lg:flex-none px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'settled'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
            }`}
          >
            بی‌حساب / تسویه شده
          </button>
        </div>

        {/* Live Search */}
        <div className="relative w-full lg:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی نام شخص، تلفن یا آدرس..."
            className="w-full pr-10 pl-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-2.5" />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50/75 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400 text-[10px] font-black border-b border-slate-100 dark:border-slate-850">
                <th className="px-6 py-4">مشخصات طرف حساب</th>
                <th className="px-6 py-4">نقش تجاری</th>
                <th className="px-6 py-4 text-left">جمع کل خریدها</th>
                <th className="px-6 py-4 text-left">جمع کل فروش‌ها</th>
                <th className="px-6 py-4 text-left">تراز تجاری (موجودی)</th>
                <th className="px-6 py-4 text-center">جزئیات حساب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 text-xs font-semibold">
                    هیچ طرف حسابی با فیلترهای فوق پیدا نشد.
                  </td>
                </tr>
              ) : (
                paginatedList.map(item => {
                  const balance = item.netBalance;
                  let balanceBadge = null;

                  if (balance > 0) {
                    balanceBadge = (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                        <TrendingDown className="w-3.5 h-3.5" />
                        بدهکار (مشتری بدهکار است)
                      </span>
                    );
                  } else if (balance < 0) {
                    balanceBadge = (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-black bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                        <TrendingUp className="w-3.5 h-3.5" />
                        بستانکار (طلبکار از ما)
                      </span>
                    );
                  } else {
                    balanceBadge = (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-black bg-slate-50 text-slate-600 dark:bg-slate-850 dark:text-slate-400">
                        تسویه شده / بی‌حساب
                      </span>
                    );
                  }

                  const roleLabels: { [key: string]: string } = {
                    buyer: 'مشتری (خریدار)',
                    seller: 'تامین‌کننده (فروشنده)',
                    both: 'مشتری و تامین‌کننده'
                  };

                  return (
                    <tr key={item.counterpart.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 text-xs transition-colors">
                      <td className="px-6 py-4 space-y-1">
                        <div className="font-extrabold text-slate-800 dark:text-slate-100">{item.counterpart.name}</div>
                        <div className="flex flex-col gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                          {item.counterpart.phone && (
                            <div className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3" />
                              <span>{toPersianDigits(item.counterpart.phone)}</span>
                            </div>
                          )}
                          {item.counterpart.address && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate max-w-[220px]">{item.counterpart.address}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-blue-50/70 text-blue-700 border border-blue-200/60 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900/50">
                          {roleLabels[item.counterpart.type] || item.counterpart.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-left font-mono font-bold text-slate-600 dark:text-slate-300">
                        {item.totalPurchases > 0 ? formatCurrency(item.totalPurchases) : '—'}
                      </td>
                      <td className="px-6 py-4 text-left font-mono font-bold text-slate-600 dark:text-slate-300">
                        {item.totalSales > 0 ? formatCurrency(item.totalSales) : '—'}
                      </td>
                      <td className="px-6 py-4 text-left font-mono">
                        <div className={`font-black ${balance > 0 ? 'text-emerald-600 dark:text-emerald-400' : balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                          {balance === 0 ? formatCurrency(0) : formatCurrency(Math.abs(balance))}
                        </div>
                        <div className="mt-1">{balanceBadge}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedCounterpart(item.counterpart)}
                          className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 rounded-lg transition-all inline-flex items-center justify-center gap-1 cursor-pointer font-bold text-[10px]"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-500" />
                          <span>سوابق فاکتورها ({toPersianDigits(item.invoicesCount)})</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <PaginationControls
            currentPage={dcPage}
            totalPages={totalDcPages}
            pageSize={dcPageSize}
            totalItems={filteredList.length}
            onPageChange={setDcPage}
            onPageSizeChange={setDcPageSize}
          />
        </div>
      </div>

      {/* History Modal Popup */}
      {selectedCounterpart && (() => {
        const cpBalance = counterpartBalances.find(item => item.counterpart.id === selectedCounterpart.id);
        const history = cpBalance ? cpBalance.history : [];

        return (
          <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center z-50 p-4 animate-fade-in popup-overlay-global" id="history-modal">
            <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-3xl border border-slate-150 dark:border-slate-850 shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col popup-box-global">
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 dark:border-slate-850 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-200">سابقه تراکنش‌ها و فاکتورهای {selectedCounterpart.name}</h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">لیست تمامی فاکتورهای معتبر صادر شده برای این شخص</p>
                </div>
                <button
                  onClick={() => setSelectedCounterpart(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-extrabold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  بستن پنجره
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* Balance Card inside modal */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl">
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 font-black block">مانده ابتدای دوره (از قبل)</span>
                    <span className={`text-sm font-black font-mono block ${cpBalance && cpBalance.openingBalance > 0 ? 'text-emerald-600 dark:text-emerald-400' : cpBalance && cpBalance.openingBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
                      {cpBalance ? (cpBalance.openingBalance === 0 ? '۰' : (cpBalance.openingBalance > 0 ? `+${formatCurrency(cpBalance.openingBalance)} (طلب)` : `-${formatCurrency(Math.abs(cpBalance.openingBalance))} (بدهی)`)) : '۰'}
                    </span>
                  </div>
                  <div className="p-3.5 bg-indigo-50/40 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/40 rounded-2xl">
                    <span className="text-[9px] text-indigo-500 font-black block">جمع خرید دوره از این شخص</span>
                    <span className="text-sm font-black text-slate-800 dark:text-slate-200 font-mono">
                      {cpBalance && cpBalance.totalPurchases > 0 ? formatCurrency(cpBalance.totalPurchases) : formatCurrency(0)}
                    </span>
                  </div>
                  <div className="p-3.5 bg-blue-50/40 dark:bg-blue-950/10 border border-blue-100/50 dark:border-blue-900/40 rounded-2xl">
                    <span className="text-[9px] text-blue-500 font-black block">جمع فروش دوره به این شخص</span>
                    <span className="text-sm font-black text-slate-800 dark:text-slate-200 font-mono">
                      {cpBalance && cpBalance.totalSales > 0 ? formatCurrency(cpBalance.totalSales) : formatCurrency(0)}
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 rounded-2xl">
                    <span className="text-[9px] text-slate-500 font-black block">مانده حساب نهایی (کل)</span>
                    <span className={`text-sm font-black font-mono block ${cpBalance && cpBalance.netBalance > 0 ? 'text-emerald-600 dark:text-emerald-400' : cpBalance && cpBalance.netBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
                      {cpBalance ? (cpBalance.netBalance === 0 ? 'تسویه شده' : (cpBalance.netBalance > 0 ? `+${formatCurrency(cpBalance.netBalance)} (طلبکاریم)` : `-${formatCurrency(Math.abs(cpBalance.netBalance))} (بدهکاریم)`)) : '—'}
                    </span>
                  </div>
                </div>

                {/* History Table */}
                <div className="border border-slate-100 dark:border-slate-850 rounded-2xl overflow-hidden">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/75 dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-850">
                        <th className="p-3">شماره فاکتور</th>
                        <th className="p-3">نوع فاکتور</th>
                        <th className="p-3">تاریخ صدور</th>
                        <th className="p-3 text-left">مبلغ کل فاکتور</th>
                        <th className="p-3 text-left">مبلغ پرداختی (بیعانه)</th>
                        <th className="p-3 text-left">باقیمانده سند</th>
                        <th className="p-3 text-center">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                      {history.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 dark:text-slate-500">
                            هیچ فاکتور ثبت‌شده‌ای برای این شخص یافت نشد.
                          </td>
                        </tr>
                      ) : (
                        history.map(inv => {
                          const netAmt = getInvoiceGrossTotal(inv);
                          const remaining = getInvoiceRemainingBalance(inv, paymentAllocations);

                          return (
                            <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                              <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                                {toPersianDigits(inv.invoiceNumber)}
                              </td>
                              <td className="p-3">
                                {inv.type === 'sale' ? (
                                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">فروش</span>
                                ) : (
                                  <span className="text-blue-700 dark:text-blue-400 font-bold">خرید</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-slate-500">
                                {toPersianDigits(inv.date)}
                              </td>
                              <td className="p-3 text-left font-mono font-bold text-slate-700 dark:text-slate-300">
                                {formatCurrency(netAmt)}
                              </td>
                              <td className="p-3 text-left font-mono text-slate-600 dark:text-slate-400">
                                {inv.deposit ? formatCurrency(inv.deposit) : '۰'}
                              </td>
                              <td className={`p-3 text-left font-mono font-black ${remaining > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                                {remaining > 0 ? formatCurrency(remaining) : 'تسویه کامل'}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setViewingInvoice(inv)}
                                  className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/45 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer font-bold text-[10px]"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>مشاهده فاکتور</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Invoice Detail Viewer Modal */}
      {viewingInvoice && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center z-[60] p-4 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-3xl border border-slate-150 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6 popup-box-global">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                <span className="text-slate-850 dark:text-slate-100 font-extrabold text-sm">
                  جزئیات سند فاکتور رسمی
                </span>
              </div>
              <button
                onClick={() => setViewingInvoice(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* A4 Styled Preview Box */}
            <div className="bg-white text-slate-800 p-6 md:p-8 border border-slate-200 rounded-2xl shadow-inner font-sans flex flex-col space-y-5">
              
              {/* Document Header */}
              <div className="grid grid-cols-3 gap-4 border-b-2 border-slate-800 pb-5 items-center">
                <div className="space-y-1 text-right text-xs">
                  <h4 className="font-extrabold text-slate-900">فروشگاه قطعات و خدمات مرکزی</h4>
                  <p className="text-[10px] text-slate-500">شماره کارت: ۱۳۴۲۲۹۰</p>
                  <p className="text-[10px] text-slate-500">نشانی: تهران، برج نگین طرشت</p>
                </div>
                
                <div className="text-center space-y-1">
                  <h2 className="text-sm sm:text-base font-black tracking-wider text-slate-950 uppercase">
                    {viewingInvoice.type === 'sale' ? 'فاکتور فروش رسمی' : 'فاکتور خرید رسمی'}
                  </h2>
                  <span className="text-[9px] bg-emerald-50 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-100">
                    سند معتبر حسابداری
                  </span>
                </div>

                <div className="text-left font-mono text-[10px] space-y-1 text-slate-600">
                  <div><span>شماره سند:</span> <span className="font-bold">{viewingInvoice.invoiceNumber}</span></div>
                  <div><span>تاریخ صدور:</span> <span>{toPersianDigits(viewingInvoice.date)}</span></div>
                  <div><span>ثبت‌کننده:</span> <span className="font-bold">{viewingInvoice.createdBy}</span></div>
                </div>
              </div>

              {/* Buyer / Seller Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 border border-slate-150 rounded-xl text-xs text-right">
                <div className="space-y-1.5">
                  <span className="text-slate-500 font-bold block border-b border-slate-200 pb-1">مشخصات طرف حساب تجاری:</span>
                  <div><span>نام شخص/حقوقی:</span> <span className="font-extrabold text-slate-900">{viewingInvoice.counterpartName || 'نامشخص'}</span></div>
                  {viewingInvoice.counterpartPhone && (
                    <div><span>شماره تماس:</span> <span className="font-mono">{toPersianDigits(viewingInvoice.counterpartPhone)}</span></div>
                  )}
                </div>
                <div className="space-y-1.5 md:border-r border-slate-200 md:pr-4">
                  <span className="text-slate-500 font-bold block border-b border-slate-200 pb-1">نشانی و محل تحویل:</span>
                  <div className="leading-relaxed text-slate-700">{viewingInvoice.counterpartAddress || 'نشانی ثبت نشده است'}</div>
                </div>
              </div>

              {/* Itemized Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse border border-slate-300 text-xs text-slate-900">
                  <thead className="bg-slate-50 font-bold border-b-2 border-slate-300">
                    <tr>
                      <th className="border border-slate-300 p-2 text-center w-10">ردیف</th>
                      <th className="border border-slate-300 p-2">شرح کامل کالا یا خدمات</th>
                      <th className="border border-slate-300 p-2 text-center w-16">تعداد</th>
                      <th className="border border-slate-300 p-2 text-left w-32">قیمت واحد ({currencyLabel})</th>
                      <th className="border border-slate-300 p-2 text-left w-36">جمع کل ردیف ({currencyLabel})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {viewingInvoice.items && viewingInvoice.items.length > 0 ? (
                      viewingInvoice.items.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="border border-slate-300 p-2 text-center font-mono">{toPersianDigits(idx + 1)}</td>
                          <td className="border border-slate-300 p-2 font-bold text-slate-800">{line.name}</td>
                          <td className="border border-slate-300 p-2 text-center font-mono font-bold">{toPersianDigits(line.qty)}</td>
                          <td className="border border-slate-300 p-2 text-left font-mono">{formatCurrency(line.unitPrice)}</td>
                          <td className="border border-slate-300 p-2 text-left font-mono font-bold">{formatCurrency(line.qty * line.unitPrice)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="border border-slate-300 p-4 text-center text-slate-400">
                          اقلامی برای این فاکتور ثبت نشده است.
                        </td>
                      </tr>
                    )}
                    
                    {/* Calculations breakdown */}
                    <tr className="bg-slate-50 font-medium text-slate-800">
                      <td colSpan={4} className="border border-slate-300 p-2 text-left text-[11px]">جمع ناخالص کالا و خدمات:</td>
                      <td className="border border-slate-300 p-2 text-left font-mono font-bold">{formatCurrency(viewingInvoice.totalAmount)}</td>
                    </tr>

                    {(viewingInvoice.tax || 0) > 0 && (
                      <tr className="bg-slate-50 font-medium text-slate-800">
                        <td colSpan={4} className="border border-slate-300 p-2 text-left text-[11px]">مالیات بر ارزش افزوده (+):</td>
                        <td className="border border-slate-300 p-2 text-left font-mono text-slate-700">{formatCurrency(viewingInvoice.tax || 0)}</td>
                      </tr>
                    )}

                    {(viewingInvoice.discount || 0) > 0 && (
                      <tr className="bg-slate-50 font-medium text-slate-800">
                        <td colSpan={4} className="border border-slate-300 p-2 text-left text-[11px]">تخفیف اعطایی (-):</td>
                        <td className="border border-slate-300 p-2 text-left font-mono text-emerald-700">- {formatCurrency(viewingInvoice.discount || 0)}</td>
                      </tr>
                    )}

                    {(viewingInvoice.deposit || 0) > 0 && (
                      <tr className="bg-slate-50 font-medium text-slate-800">
                        <td colSpan={4} className="border border-slate-300 p-2 text-left text-[11px]">مبلغ پرداختی (بیعانه / دریافت شده) (-):</td>
                        <td className="border border-slate-300 p-2 text-left font-mono text-indigo-750">- {formatCurrency(viewingInvoice.deposit || 0)}</td>
                      </tr>
                    )}

                    {(() => {
                      const netAmt = getInvoiceGrossTotal(viewingInvoice);
                      const finalTotal = getInvoiceRemainingBalance(viewingInvoice, paymentAllocations);
                      return (
                        <tr className="bg-slate-100 font-bold text-slate-900 text-sm">
                          <td colSpan={4} className="border border-slate-300 p-2 text-left">مبلغ باقیمانده نهایی فاکتور:</td>
                          <td className="border border-slate-300 p-2 text-left font-mono text-blue-800">{formatCurrency(finalTotal)}</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Amount in words and details */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3 border-t border-slate-200 text-xs">
                <div className="space-y-1">
                  <div>
                    <span className="text-slate-500 font-bold">مبلغ کل به حروف:</span>{' '}
                    <span className="font-extrabold text-slate-900">
                      {numberToPersianWords(getInvoiceGrossTotal(viewingInvoice))} {currencyLabel}
                    </span>
                  </div>
                  {viewingInvoice.description && viewingInvoice.description.trim() && (
                    <div className="text-slate-600 mt-1.5 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                      <span className="font-bold text-slate-500 block mb-1">توضیحات فاکتور:</span>
                      {viewingInvoice.description}
                    </div>
                  )}
                </div>
              </div>

              {/* Signature fields */}
              <div className="grid grid-cols-2 gap-4 pt-8 text-center text-xs text-slate-500 font-bold">
                <div>مهر و امضای شرکت / صادرکننده</div>
                <div>مهر و امضای خریدار / تحویل‌گیرنده</div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-150 dark:border-slate-850">
              <button
                onClick={() => setViewingInvoice(null)}
                className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold rounded-xl cursor-pointer transition-colors"
              >
                بستن فاکتور
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { BankAccount, User, Partner, BankTransaction } from '../types';
import { Landmark, Briefcase, PlusCircle, CreditCard, ShieldAlert, Award, TrendingUp, Sparkles, Receipt, Wallet, Trash2, Users, Percent, Edit2, X, AlertTriangle } from 'lucide-react';
import { parsePersianAmount, toEnglishDigits } from '../utils/numberUtils';

interface CashAccountsManagerProps {
  accounts: BankAccount[];
  currentUser: User;
  onAddAccount: (acc: BankAccount) => void;
  onDeleteAccount?: (id: string) => void;
  onUpdateAccount?: (acc: BankAccount) => void;
  partners: Partner[];
  onAddPartner: (p: Partner) => void;
  onDeletePartner: (id: string) => void;
  onUpdatePartner?: (p: Partner) => void;
  formatCurrency: (amount: number) => string;
  transactions?: BankTransaction[];
  pendingDeposits?: any[];
}

export default function CashAccountsManager({
  accounts,
  currentUser,
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
}: CashAccountsManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [type, setType] = useState<'bank' | 'treasury' | 'petty_cash_bank'>('bank');

  const isAdmin = currentUser.role === 'admin';

  // Custom dialog / validation states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ type: 'account' | 'partner'; id: string; name: string } | null>(null);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);

  // Controlled states for editing account modal
  const [editAccName, setEditAccName] = useState('');
  const [editAccNum, setEditAccNum] = useState('');
  const [editAccBalance, setEditAccBalance] = useState<number>(0);
  const [editAccType, setEditAccType] = useState<'bank' | 'treasury' | 'petty_cash_bank'>('bank');

  // Controlled states for editing partner modal
  const [editPartnerName, setEditPartnerName] = useState('');
  const [editPartnerShare, setEditPartnerShare] = useState<number | ''>('');

  React.useEffect(() => {
    if (editingAccount) {
      setEditAccName(editingAccount.name || '');
      setEditAccNum(editingAccount.accountNumber || '');
      setEditAccBalance(editingAccount.balance || 0);
      setEditAccType(editingAccount.type || 'bank');
    }
  }, [editingAccount]);

  React.useEffect(() => {
    if (editingPartner) {
      setEditPartnerName(editingPartner.name || '');
      setEditPartnerShare(editingPartner.sharePercent !== undefined && editingPartner.sharePercent !== null ? editingPartner.sharePercent : '');
    }
  }, [editingPartner]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newAcc: BankAccount = {
      id: `acc-${Date.now()}`,
      name: name.trim(),
      accountNumber: (type === 'bank' || type === 'petty_cash_bank') ? (accountNumber.trim() || undefined) : 'صندوق فاقد کارت سنتی',
      balance: Number(initialBalance) || 0,
      type
    };

    onAddAccount(newAcc);

    // Reset Form
    setName('');
    setAccountNumber('');
    setInitialBalance(0);
    setType('bank');
    setShowAddForm(false);
  };

  // Group accounts
  const bankAccounts = accounts.filter(acc => acc.type === 'bank' || acc.type === 'petty_cash_bank' || acc.type === undefined);
  const treasuries = accounts.filter(acc => acc.type === 'treasury');

  // Sum calculations
  const totalBanks = bankAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalTreasuries = treasuries.reduce((sum, acc) => sum + acc.balance, 0);
  const absoluteTotal = totalBanks + totalTreasuries;

  const currencyLabel = localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال';

  return (
    <div className="space-y-6 animate-fade-in text-right" dir="rtl font-sans">
      
      {/* Title Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between shadow-sm gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>مدیریت صندوق و حساب‌های مالی شرکت</span>
          </h2>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-1.5 font-bold leading-relaxed">
            ثبت و ردیابی موجودی حساب‌های بانکی و صندوق‌های نقدی شرکت در زمان واحد.
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span>افزودن حساب یا صندوق جدید</span>
        </button>
      </div>

      {/* Register New Account / Treasury Form */}
      {showAddForm && (
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4 animate-fade-in">
          <div className="border-b border-slate-100 dark:border-slate-855 pb-2">
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200">فرم تعریف حساب بانکی یا گاوصندوق مجزا</h4>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-3 space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">دسته‌بندی ثبت</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-755 dark:text-slate-250 font-black cursor-pointer"
              >
                <option value="bank">حساب بانکی (عابربانک / کارت / شبا)</option>
                <option value="petty_cash_bank">حساب بانکی تنخواه</option>
                <option value="treasury">صندوق نقدی (گاوصندوق تنخواه‌دار فیزیکی)</option>
              </select>
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">عنوان و نام اختصاری</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === 'treasury' ? "مثال: صندوق تنخواه طبقه دوم" : type === 'petty_cash_bank' ? "مثال: حساب بانکی تنخواه شرکت" : "مثال: بانک سامان شعبه ونک"}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-850 dark:text-white"
                required
              />
            </div>

            {(type === 'bank' || type === 'petty_cash_bank') && (
              <div className="md:col-span-3 space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">شماره کارت / حساب بانکی</label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="مثال: ۵۸۵۹-۸۳۷۰-۱۲۳۴-۵۶۷۸"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-800 dark:text-white text-left font-mono"
                />
              </div>
            )}

            <div className={(type === 'bank' || type === 'petty_cash_bank') ? "md:col-span-3 space-y-1" : "md:col-span-6 space-y-1"}>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">موجودی اولیه ({currencyLabel})</label>
              <input
                type="text"
                value={initialBalance ? initialBalance.toLocaleString('en-US') : ''}
                onChange={(e) => {
                  setInitialBalance(parsePersianAmount(e.target.value));
                }}
                placeholder={`موجودی اولیه به ${currencyLabel} وارد شود`}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-800 dark:text-white font-mono text-left"
              />
            </div>

            <div className="md:col-span-12 flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-[11px] font-bold cursor-pointer font-sans"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold cursor-pointer font-sans"
              >
                ذخیره حساب و صندوق جدید
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Aggregate Overview Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Absolute Holdings (Admin) or Restricted Overlay */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-6 rounded-3xl shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div>
            <span className="text-[10px] text-slate-400 font-extrabold block">مجموع کل دارایی فعال نقدی و بانکی</span>
            {isAdmin ? (
              <span className="text-xl font-mono font-black text-slate-900 dark:text-white mt-1 block tracking-tight">
                {formatCurrency(absoluteTotal)}
              </span>
            ) : (
              <div className="flex items-center gap-1.5 mt-2 bg-rose-50/60 dark:bg-rose-950/20 px-3 py-1.5 border border-rose-100 dark:border-rose-900 rounded-xl w-fit">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                <span className="text-[10px] font-black text-rose-700 dark:text-rose-450">غیرقابل مشاهده برای نقش شما</span>
              </div>
            )}
            <p className="text-[9px] text-slate-400 mt-2 leading-relaxed">این کارت مجموع دارایی صندوق‌های تنخواه و حساب‌های کارت عابر بانک را ردیابی می‌کند.</p>
          </div>
          <div className="text-[9px] text-indigo-600 dark:text-indigo-400 font-black mt-4 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>حسابداری یکپارچه چندصندوقه</span>
          </div>
        </div>

        {/* Total Banks */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-extrabold block">مجموع موجودی کارت‌های عابر بانک</span>
            {isAdmin ? (
              <span className="text-xl font-mono font-black text-blue-700 dark:text-blue-400 mt-1 block tracking-tight">
                {formatCurrency(totalBanks)}
              </span>
            ) : (
              <div className="flex items-center gap-1.5 mt-2 bg-rose-50/60 dark:bg-rose-950/20 px-3 py-1.5 border border-rose-100 dark:border-rose-900 rounded-xl w-fit">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                <span className="text-[10px] font-black text-rose-700 dark:text-rose-450">غیرقابل مشاهده برای نقش شما</span>
              </div>
            )}
            <p className="text-[9px] text-slate-400 mt-2">شامل تعداد {bankAccounts.length} حساب بانکی ثبت‌شده فعال معتبر.</p>
          </div>
          <div className="text-[9px] text-slate-450 mt-4 flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-bold">بروزرسانی از سند افتتاحیه الی فاکتورها</span>
          </div>
        </div>

        {/* Total Treasuries */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-extrabold block">مجموع وجوه نقد داخل گاوصندوق‌ها</span>
            {isAdmin ? (
              <span className="text-xl font-mono font-black text-emerald-700 dark:text-emerald-400 mt-1 block tracking-tight">
                {formatCurrency(totalTreasuries)}
              </span>
            ) : (
              <div className="flex items-center gap-1.5 mt-2 bg-rose-50/60 dark:bg-rose-950/20 px-3 py-1.5 border border-rose-100 dark:border-rose-900 rounded-xl w-fit">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                <span className="text-[10px] font-black text-rose-700 dark:text-rose-450">غیرقابل مشاهده برای نقش شما</span>
              </div>
            )}
            <p className="text-[9px] text-slate-400 mt-2">شامل تعداد {treasuries.length} صندوق و گاوصندوق نقدی فیزیکی.</p>
          </div>
          <div className="text-[9px] text-slate-450 mt-4 flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-bold">موجودی‌های تنخواه نقدی روزانه</span>
          </div>
        </div>

      </div>

      {/* Graphical Breakdown: Bank Cards & Cash Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Bank Accounts Section (Graphical Cards Layout) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-2 flex justify-between items-center">
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-500" />
              <span>کارت‌ها و حساب‌های بانکی معین ({bankAccounts.length} مورد)</span>
            </h3>
            <span className="text-[9px] text-slate-400 font-bold">حسابداری کل</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {bankAccounts.map((acc, index) => (
              <div 
                key={acc.id} 
                className={`relative p-5 rounded-2xl border flex flex-col justify-between h-40 text-right overflow-hidden shadow-sm hover:translate-y-[-2px] transition-all group ${
                  index % 2 === 0
                    ? 'bg-gradient-to-br from-indigo-900 to-indigo-950 text-white border-indigo-950'
                    : 'bg-gradient-to-br from-slate-900 to-slate-950 text-white border-slate-950'
                }`}
              >
                {/* Decorative circles */}
                <div className="absolute top-[-20%] left-[-20%] w-32 h-32 rounded-full bg-white/[0.03] group-hover:scale-110 transition-transform"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-24 h-24 rounded-full bg-white/[0.02] group-hover:scale-110 transition-transform"></div>

                <div className="flex justify-between items-start z-5">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-black block tracking-tight truncate max-w-[150px]">{acc.name}</span>
                      {acc.type === 'petty_cash_bank' && (
                        <span className="text-[8px] bg-amber-400/20 text-amber-300 border border-amber-400/35 px-1.5 py-0.5 rounded font-bold shrink-0">
                          تنخواه بانکی
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] text-white/50 block font-mono mt-0.5">شناسه سیستم: {acc.id}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isAdmin && onUpdateAccount && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAccount(acc);
                        }}
                        className="p-1 rounded-lg bg-white/10 hover:bg-indigo-600 hover:text-white transition-all cursor-pointer text-white/80"
                        title="ویرایش حساب"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isAdmin && onDeleteAccount && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const linkedTxs = (transactions || []).filter(tx => tx.accountId === acc.id);
                          const linkedDeposits = (pendingDeposits || []).filter(pd => pd.accountId === acc.id);
                          if (acc.balance !== 0) {
                            setErrorMsg(`امکان حذف حساب یا صندوق «${acc.name}» به دلیل داشتن موجودی (${formatCurrency(acc.balance)}) وجود ندارد.`);
                          } else if (linkedTxs.length > 0 || linkedDeposits.length > 0) {
                            setErrorMsg(`حساب «${acc.name}» دارای ${toEnglishDigits(String(linkedTxs.length + linkedDeposits.length))} تراکنش و گردش مالی در سیستم است و جهت حفظ یکپارچگی دفاتر مالی، حذف آن مجاز نیست.`);
                          } else {
                            setDeleteConfirmItem({ type: 'account', id: acc.id, name: acc.name });
                          }
                        }}
                        className="p-1 rounded-lg bg-white/10 hover:bg-rose-600 hover:text-white transition-all cursor-pointer text-white/80"
                        title="حذف حساب"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Landmark className="w-5 h-5 opacity-45 shrink-0" />
                  </div>
                </div>

                <div className="z-5 space-y-2">
                  {acc.accountNumber && (
                    <div className="text-[10px] font-mono text-white/60 tracking-wider font-semibold text-left" dir="ltr">
                      {acc.accountNumber.replace(/(\d{4})/g, '$1 ')}
                    </div>
                  )}
                  
                  <div className="flex justify-between items-end border-t border-white/10 pt-2">
                    <span className="text-[8px] text-white/40 font-bold">موجودی {currencyLabel === 'تومان' ? 'تومانی' : 'ریالی'}:</span>
                    {isAdmin ? (
                      <span className="text-xs font-mono font-black text-amber-300">
                        {formatCurrency(acc.balance)}
                      </span>
                    ) : (
                      <span className="text-[9px] bg-amber-400/20 text-amber-300 font-black px-1.5 py-0.5 rounded border border-amber-400/35 flex items-center gap-1">
                        <Award className="w-2.5 h-2.5 animate-pulse" />
                        مدیریت فقط
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Corporate Treasury Boxes */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-2 flex justify-between items-center">
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-slate-500" />
              <span>گاوصندوق‌های نقدی و خزاین فیزیکی ({treasuries.length} مورد)</span>
            </h3>
            <span className="text-[9px] text-slate-400 font-bold">وجوه فیزیکی تنخواه</span>
          </div>

          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
            {treasuries.map((acc, index) => (
              <div 
                key={acc.id}
                className="p-4 bg-slate-50/70 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850 rounded-2xl flex justify-between items-center hover:bg-slate-100/50 dark:hover:bg-slate-950/40 cursor-default transition-all font-sans"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold font-sans ${
                    index % 2 === 0 
                      ? 'bg-emerald-50 dark:bg-emerald-950/45 text-emerald-700 dark:text-emerald-400 border border-emerald-150 dark:border-emerald-900/50' 
                      : 'bg-indigo-50 dark:bg-indigo-950/45 text-indigo-700 dark:text-indigo-400 border border-indigo-150 dark:border-indigo-900/50'
                  }`}>
                    👛
                  </div>
                  <div>
                    <h5 className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">{acc.name}</h5>
                    <span className="text-[9px] text-slate-400 block mt-0.5">شناسه: {acc.id} | نوع تنخواه فیزیکی</span>
                  </div>
                </div>

                <div className="text-left font-mono flex items-center gap-3">
                  <div className="text-left">
                    {isAdmin ? (
                      <span className="text-xs font-black text-slate-900 dark:text-white block">
                        {formatCurrency(acc.balance)}
                      </span>
                    ) : (
                      <span className="text-[9px] bg-slate-100 dark:bg-slate-850 text-slate-500 font-bold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                        محرمانه
                      </span>
                    )}
                    <span className="text-[8px] text-slate-400 block mt-1">بروزرسانی شده</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isAdmin && onUpdateAccount && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAccount(acc);
                        }}
                        className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-850 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer border border-slate-150 dark:border-slate-800"
                        title="ویرایش صندوق"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isAdmin && onDeleteAccount && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const linkedTxs = (transactions || []).filter(tx => tx.accountId === acc.id);
                          const linkedDeposits = (pendingDeposits || []).filter(pd => pd.accountId === acc.id);
                          if (acc.balance !== 0) {
                            setErrorMsg(`امکان حذف صندوق «${acc.name}» به دلیل داشتن موجودی (${formatCurrency(acc.balance)}) وجود ندارد.`);
                          } else if (linkedTxs.length > 0 || linkedDeposits.length > 0) {
                            setErrorMsg(`صندوق «${acc.name}» دارای ${toEnglishDigits(String(linkedTxs.length + linkedDeposits.length))} تراکنش و گردش مالی در سیستم است و جهت حفظ یکپارچگی دفاتر مالی، حذف آن مجاز نیست.`);
                          } else {
                            setDeleteConfirmItem({ type: 'account', id: acc.id, name: acc.name });
                          }
                        }}
                        className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-850 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer border border-slate-150 dark:border-slate-800"
                        title="حذف صندوق"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {treasuries.length === 0 && (
              <div className="text-center py-10 text-slate-400 dark:text-slate-505 text-xs font-bold font-sans">
                هیچ گاوصندوق نقدی ثبت نشده است. از منوی بالا جهت ثبت گاوصندوق استفاده کنید.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* افزودن و مدیریت شرکا */}
      {isAdmin && (
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-2 flex justify-between items-center">
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              <span>افزودن و مدیریت شرکای تجاری شرکت ({partners.length} مورد)</span>
            </h3>
            <span className="text-[9px] text-slate-400 font-bold">کنترل سرمایه و آورده</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form to add partner */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const formData = new FormData(form);
                const nameStr = formData.get('partnerName') as string;
                const shareStr = formData.get('partnerShare') as string;
                if (!nameStr || !nameStr.trim()) return;

                const sharePercent = shareStr ? parsePersianAmount(shareStr) : 0;
                const currentSum = partners.reduce((sum, p) => sum + (p.sharePercent || 0), 0);
                if (currentSum + sharePercent > 100) {
                  setErrorMsg('مجموع درصد سهم شرکا نمی‌تواند بیشتر از ۱۰۰٪ باشد.');
                  return;
                }

                const newPartner: Partner = {
                  id: `partner-${Date.now()}`,
                  name: nameStr.trim(),
                  sharePercent: shareStr ? parsePersianAmount(shareStr) : undefined,
                  setupDate: new Date().toLocaleDateString('fa-IR')
                };
                onAddPartner(newPartner);
                form.reset();
              }}
              className="lg:col-span-4 bg-slate-50/50 dark:bg-slate-950/20 p-4 border border-slate-150 dark:border-slate-850 rounded-2xl space-y-3"
            >
              <h4 className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300">تعریف شریک جدید</h4>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">نام و نام‌خانوادگی شریک</label>
                <input
                  type="text"
                  name="partnerName"
                  placeholder="مثال: جناب مهندس رضایی"
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">میزان سهم الشرکه (درصد - اختیاری)</label>
                <input
                  type="number"
                  name="partnerShare"
                  min="0"
                  max="100"
                  placeholder="مثال: ۳۵"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold cursor-pointer transition-colors"
              >
                ذخیره اطلاعات شریک
              </button>
            </form>

            {/* Partner list table */}
            <div className="lg:col-span-8 overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                    <th className="py-2.5 px-2">نام شریک</th>
                    <th className="py-2.5 px-2">درصد سهم</th>
                    <th className="py-2.5 px-2">تاریخ تعریف</th>
                    <th className="py-2.5 px-2 text-center w-16">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {partners.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 text-slate-800 dark:text-slate-200">
                      <td className="py-2.5 px-2 font-bold">{p.name}</td>
                      <td className="py-2.5 px-2 font-mono">
                        {p.sharePercent !== undefined ? `${p.sharePercent}%` : '---'}
                      </td>
                      <td className="py-2.5 px-2 text-slate-500">{p.setupDate || '---'}</td>
                      <td className="py-2.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {onUpdatePartner && (
                            <button
                              type="button"
                              onClick={() => setEditingPartner(p)}
                              className="p-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                              title="ویرایش شریک"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteConfirmItem({ type: 'partner', id: p.id, name: p.name });
                            }}
                            className="p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="حذف شریک"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {partners.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400 font-bold">
                        هیچ شریک تجاری در سیستم ثبت نشده است.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- POPUP MODALS & DIALOGS --- */}

      {/* A. Universal/Validation Error Popup */}
      {errorMsg && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-[100] animate-fade-in animate-duration-150 popup-overlay-global">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl border border-slate-150 dark:border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden p-6 space-y-4 animate-scale-up animate-duration-100 popup-box-global">
            <div className="flex items-center gap-3 text-amber-500">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-800 dark:text-white">خطا در عملیات</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-right">
              {errorMsg}
            </p>
            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-semibold cursor-pointer"
              >
                بستن پیام
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B. Secure Deletion Confirmation Popup */}
      {deleteConfirmItem && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-[100] animate-fade-in animate-duration-150 popup-overlay-global">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl border border-slate-150 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4 animate-scale-up animate-duration-100 popup-box-global">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-800 dark:text-white">تأییدیه حذف قطعی</h3>
            </div>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-right">
              آیا از حذف قطعی {deleteConfirmItem.type === 'account' ? 'صندوق یا حساب مالی' : 'شریک تجاری'} با نام <strong className="text-slate-800 dark:text-white">«{deleteConfirmItem.name}»</strong> اطمینان دارید؟ این عمل غیرقابل بازگشت است.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteConfirmItem.type === 'account') {
                    if (onDeleteAccount) onDeleteAccount(deleteConfirmItem.id);
                  } else {
                    if (onDeletePartner) onDeletePartner(deleteConfirmItem.id);
                  }
                  setDeleteConfirmItem(null);
                }}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-xs font-bold shadow cursor-pointer"
              >
                بله، حذف شود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* C. Edit Account/Fund Modal */}
      {editingAccount && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-[100] animate-fade-in animate-duration-150 popup-overlay-global">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl border border-slate-150 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-scale-up animate-duration-100 popup-box-global">
            <div className="p-5 bg-gradient-to-l from-indigo-600 to-indigo-850 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-sm">ویرایش حساب یا صندوق مالی</h3>
                <p className="text-[10px] text-white/80 mt-0.5">اصلاح مشخصات و مقداردهی مجدد منابع مالی</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editAccName.trim() || !editingAccount) return;

                const updatedAcc: BankAccount = {
                  ...editingAccount,
                  name: editAccName.trim(),
                  accountNumber: (editAccType === 'bank' || editAccType === 'petty_cash_bank') ? (editAccNum.trim() || undefined) : 'صندوق فاقد کارت سنتی',
                  balance: editAccBalance,
                  type: editAccType
                };

                if (onUpdateAccount) onUpdateAccount(updatedAcc);
                setEditingAccount(null);
              }}
              className="p-5 space-y-4"
            >
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">دسته‌بندی ثبت</label>
                <select
                  value={editAccType}
                  onChange={(e) => setEditAccType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white font-medium cursor-pointer"
                >
                  <option value="bank">حساب بانکی (عابربانک / کارت / شبا)</option>
                  <option value="petty_cash_bank">حساب بانکی تنخواه</option>
                  <option value="treasury">صندوق نقدی (گاوصندوق تنخواه‌دار فیزیکی)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">نام حساب یا صندوق</label>
                <input
                  type="text"
                  required
                  value={editAccName}
                  onChange={(e) => setEditAccName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white font-medium"
                />
              </div>

              {(editAccType === 'bank' || editAccType === 'petty_cash_bank') && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">شماره کارت / حساب بانکی</label>
                  <input
                    type="text"
                    value={editAccNum}
                    onChange={(e) => setEditAccNum(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white font-mono"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">موجودی اولیه ({currencyLabel})</label>
                <input
                  type="text"
                  value={editAccBalance ? editAccBalance.toLocaleString('en-US') : (editAccBalance === 0 ? '0' : '')}
                  onChange={(e) => {
                    setEditAccBalance(parsePersianAmount(e.target.value));
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white font-mono text-left"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-semibold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow cursor-pointer"
                >
                  ذخیره تغییرات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* D. Edit Partner Modal */}
      {editingPartner && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-[100] animate-fade-in animate-duration-150 popup-overlay-global">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl border border-slate-150 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-scale-up animate-duration-100 popup-box-global">
            <div className="p-5 bg-gradient-to-l from-indigo-600 to-indigo-850 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-sm">ویرایش اطلاعات شریک تجاری</h3>
                <p className="text-[10px] text-white/80 mt-0.5">اصلاح اطلاعات شناسایی و درصد سهم شریک</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPartner(null)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editPartnerName.trim() || !editingPartner) return;

                const editShare = editPartnerShare !== '' ? parsePersianAmount(editPartnerShare) : undefined;

                // Validation of percentage sum
                const otherSum = partners.filter(p => p.id !== editingPartner.id).reduce((sum, p) => sum + (p.sharePercent || 0), 0);
                if (editShare !== undefined && (otherSum + editShare > 100)) {
                  setErrorMsg('مجموع درصد سهم شرکا نمی‌تواند بیشتر از ۱۰۰٪ باشد.');
                  return;
                }

                const updatedPartner: Partner = {
                  ...editingPartner,
                  name: editPartnerName.trim(),
                  sharePercent: editShare
                };

                if (onUpdatePartner) onUpdatePartner(updatedPartner);
                setEditingPartner(null);
              }}
              className="p-5 space-y-4"
            >
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">نام و نام‌خانوادگی شریک</label>
                <input
                  type="text"
                  required
                  value={editPartnerName}
                  onChange={(e) => setEditPartnerName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">میزان سهم الشرکه (درصد)</label>
                <input
                  type="text"
                  value={editPartnerShare !== '' ? editPartnerShare : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditPartnerShare(val === '' ? '' : parsePersianAmount(val));
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPartner(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-semibold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow cursor-pointer"
                >
                  ذخیره تغییرات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

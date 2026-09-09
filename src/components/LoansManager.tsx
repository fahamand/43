import React, { useState, useMemo } from 'react';
import { LoanBorrower, BankTransaction, BankAccount, User } from '../types';
import { formatCurrency, toPersianDigits, getTodayJalali } from '../utils/stateManager';
import { 
  Landmark, Plus, Search, UserCheck, Wallet, ArrowDownLeft, ArrowUpRight, 
  History, Edit, Trash2, Printer, FileText, CheckCircle2, AlertCircle, X,
  Phone, CreditCard, DollarSign, Calendar, Clock, Sparkles
} from 'lucide-react';
import { JalaliDatePicker } from './JalaliDatePicker';

interface LoansManagerProps {
  loanBorrowers: LoanBorrower[];
  onUpdateLoanBorrowers: (borrowers: LoanBorrower[]) => void;
  transactions: BankTransaction[];
  accounts: BankAccount[];
  currentUser: User;
  onAddTransaction: (tx: BankTransaction, accountId: string) => void;
}

export default function LoansManager({
  loanBorrowers = [],
  onUpdateLoanBorrowers,
  transactions = [],
  accounts = [],
  currentUser,
  onAddTransaction
}: LoansManagerProps) {
  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'debtors' | 'cleared'>('all');

  // Modals
  const [isBorrowerModalOpen, setIsBorrowerModalOpen] = useState(false);
  const [editingBorrower, setEditingBorrower] = useState<LoanBorrower | null>(null);
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerPhone, setBorrowerPhone] = useState('');
  const [borrowerNationalId, setBorrowerNationalId] = useState('');
  const [borrowerInitialDebt, setBorrowerInitialDebt] = useState('');
  const [borrowerNotes, setBorrowerNotes] = useState('');

  // History Modal State
  const [historyBorrower, setHistoryBorrower] = useState<LoanBorrower | null>(null);

  // Quick Loan Transaction Modal State
  const [quickTxBorrower, setQuickTxBorrower] = useState<LoanBorrower | null>(null);
  const [quickTxMode, setQuickTxMode] = useState<'payout' | 'repayment'>('payout');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickAccount, setQuickAccount] = useState(accounts[0]?.id || '');
  const [quickDate, setQuickDate] = useState(getTodayJalali());
  const [quickTime, setQuickTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [quickDesc, setQuickDesc] = useState('');
  const [txSuccessMsg, setTxSuccessMsg] = useState<string | null>(null);

  // Helper to compute stats for a single borrower
  const getBorrowerStats = (b: LoanBorrower) => {
    const initialDebt = b.initialDebt || 0;
    
    // Payout transactions (پرداخت وام به وام‌گیرنده)
    const payoutsTx = transactions.filter(t => 
      !t.isDeleted && 
      (t.borrowerId === b.id || (t.borrowerName && t.borrowerName.trim().toLowerCase() === b.name.trim().toLowerCase())) &&
      (t.loanType === 'payout' || t.categoryParent === 'پرداخت وام' || (t.categoryParent === 'مدیریت وام‌ها' && t.categoryChild === 'پرداخت وام'))
    );
    const totalPayouts = payoutsTx.reduce((sum, t) => sum + (t.amount || 0), 0);

    // Repayment transactions (تسویه/بازپرداخت وام توسط وام‌گیرنده)
    const repaymentsTx = transactions.filter(t => 
      !t.isDeleted && 
      (t.borrowerId === b.id || (t.borrowerName && t.borrowerName.trim().toLowerCase() === b.name.trim().toLowerCase())) &&
      (t.loanType === 'repayment' || t.categoryParent === 'تسویه حساب وام' || (t.categoryParent === 'مدیریت وام‌ها' && t.categoryChild === 'تسویه حساب وام'))
    );
    const totalRepayments = repaymentsTx.reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalLoansGranted = initialDebt + totalPayouts;
    const currentDebtBalance = totalLoansGranted - totalRepayments;

    return {
      initialDebt,
      payoutsTx,
      totalPayouts,
      repaymentsTx,
      totalRepayments,
      totalLoansGranted,
      currentDebtBalance
    };
  };

  // Overall Statistics across all borrowers
  const overallStats = useMemo(() => {
    let totalInitialDebt = 0;
    let totalPayouts = 0;
    let totalRepayments = 0;

    loanBorrowers.forEach(b => {
      const stats = getBorrowerStats(b);
      totalInitialDebt += stats.initialDebt;
      totalPayouts += stats.totalPayouts;
      totalRepayments += stats.totalRepayments;
    });

    const totalDisbursed = totalInitialDebt + totalPayouts;
    const totalOutstandingDebt = totalDisbursed - totalRepayments;

    return {
      borrowersCount: loanBorrowers.length,
      totalDisbursed,
      totalRepayments,
      totalOutstandingDebt
    };
  }, [loanBorrowers, transactions]);

  // Filtered Borrowers List
  const filteredBorrowers = useMemo(() => {
    return loanBorrowers.filter(b => {
      const stats = getBorrowerStats(b);
      const q = searchQuery.trim().toLowerCase();
      
      const matchesSearch = !q || 
        b.name.toLowerCase().includes(q) || 
        (b.phone && b.phone.includes(q)) || 
        (b.nationalId && b.nationalId.includes(q));

      if (!matchesSearch) return false;

      if (filterStatus === 'debtors') {
        return stats.currentDebtBalance > 0;
      }
      if (filterStatus === 'cleared') {
        return stats.currentDebtBalance <= 0;
      }
      return true;
    });
  }, [loanBorrowers, searchQuery, filterStatus, transactions]);

  // Handle Add or Edit Borrower Form Submit
  const handleSaveBorrower = (e: React.FormEvent) => {
    e.preventDefault();
    if (!borrowerName.trim()) {
      alert('لطفاً نام و نام خانوادگی وام‌گیرنده را وارد کنید.');
      return;
    }

    const initDebtNum = parseInt(borrowerInitialDebt.replace(/,/g, ''), 10) || 0;

    if (editingBorrower) {
      // Update
      const updated = loanBorrowers.map(b => b.id === editingBorrower.id ? {
        ...b,
        name: borrowerName.trim(),
        phone: borrowerPhone.trim(),
        nationalId: borrowerNationalId.trim(),
        initialDebt: initDebtNum,
        notes: borrowerNotes.trim()
      } : b);
      onUpdateLoanBorrowers(updated);
    } else {
      // Create New
      const newBorrower: LoanBorrower = {
        id: 'borrower-' + Date.now(),
        name: borrowerName.trim(),
        phone: borrowerPhone.trim(),
        nationalId: borrowerNationalId.trim(),
        initialDebt: initDebtNum,
        notes: borrowerNotes.trim(),
        createdAt: getTodayJalali(),
        createdBy: currentUser.name || 'کاربر',
        createdById: currentUser.id || ''
      };
      onUpdateLoanBorrowers([...loanBorrowers, newBorrower]);
    }

    closeBorrowerModal();
  };

  const openAddBorrowerModal = () => {
    setEditingBorrower(null);
    setBorrowerName('');
    setBorrowerPhone('');
    setBorrowerNationalId('');
    setBorrowerInitialDebt('');
    setBorrowerNotes('');
    setIsBorrowerModalOpen(true);
  };

  const openEditBorrowerModal = (b: LoanBorrower) => {
    setEditingBorrower(b);
    setBorrowerName(b.name || '');
    setBorrowerPhone(b.phone || '');
    setBorrowerNationalId(b.nationalId || '');
    setBorrowerInitialDebt(b.initialDebt ? String(b.initialDebt) : '');
    setBorrowerNotes(b.notes || '');
    setIsBorrowerModalOpen(true);
  };

  const closeBorrowerModal = () => {
    setIsBorrowerModalOpen(false);
    setEditingBorrower(null);
    setBorrowerName('');
    setBorrowerPhone('');
    setBorrowerNationalId('');
    setBorrowerInitialDebt('');
    setBorrowerNotes('');
  };

  const handleDeleteBorrower = (b: LoanBorrower) => {
    const stats = getBorrowerStats(b);
    if (stats.payoutsTx.length > 0 || stats.repaymentsTx.length > 0) {
      if (!window.confirm(`وام‌گیرنده "${b.name}" دارای تراکنش‌های ثبت‌شده در سیستم است. آیا از حذف وی اطمینان کامل دارید؟ (تراکنش‌های بانکی باقی می‌مانند)`)) {
        return;
      }
    } else {
      if (!window.confirm(`آیا از حذف وام‌گیرنده "${b.name}" اطمینان دارید؟`)) {
        return;
      }
    }

    const updated = loanBorrowers.filter(item => item.id !== b.id);
    onUpdateLoanBorrowers(updated);
  };

  // Quick Loan Transaction Submission
  const handleQuickTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTxBorrower) return;

    const numericAmount = parseInt(quickAmount.replace(/,/g, ''), 10);
    if (!numericAmount || numericAmount <= 0) {
      alert('لطفاً مبلغ معتبر به ریال وارد نمایید.');
      return;
    }

    if (!quickAccount) {
      alert('لطفاً حساب بانکی / صندوق پرداخت را انتخاب فرمایید.');
      return;
    }

    const isPayout = quickTxMode === 'payout';
    const accObj = accounts.find(a => a.id === quickAccount);

    const newTx: BankTransaction = {
      id: 'tx-loan-' + Date.now(),
      date: quickDate || getTodayJalali(),
      time: quickTime || '12:00',
      amount: numericAmount,
      type: isPayout ? 'withdrawal' : 'deposit',
      description: quickDesc.trim() || (isPayout ? `پرداخت وام به ${quickTxBorrower.name}` : `تسویه حساب وام توسط ${quickTxBorrower.name}`),
      isRegistered: true,
      categoryParent: 'مدیریت وام‌ها',
      categoryChild: isPayout ? 'پرداخت وام' : 'تسویه حساب وام',
      userDescription: quickDesc.trim() || (isPayout ? `پرداخت وام به ${quickTxBorrower.name}` : `تسویه حساب وام توسط ${quickTxBorrower.name}`),
      accountId: quickAccount,
      borrowerId: quickTxBorrower.id,
      borrowerName: quickTxBorrower.name,
      loanType: isPayout ? 'payout' : 'repayment',
      registeredDate: getTodayJalali()
    };

    onAddTransaction(newTx, quickAccount);

    setTxSuccessMsg(`تراکنش ${isPayout ? 'پرداخت وام' : 'تسویه وام'} به مبلغ ${formatCurrency(numericAmount)} با موفقیت ثبت گردید.`);
    setTimeout(() => {
      setTxSuccessMsg(null);
      setQuickTxBorrower(null);
      setQuickAmount('');
      setQuickDesc('');
    }, 1800);
  };

  // Print Borrower Statement
  const handlePrintBorrowerStatement = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans pb-12">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-sm">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>مدیریت جامع وام‌ها و وام‌گیرندگان</span>
              <span className="text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                حسابداری وام
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              مشاهده وضعیت بدهی، ثبت پرداخت‌ها، دریافت اقساط و بررسی تاریخچه کامل تراکنش‌های وام
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAddBorrowerModal}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-all shadow-sm hover:shadow flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تعریف وام‌گیرنده جدید</span>
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Borrowers */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 block">
              تعداد کل وام‌گیرندگان
            </span>
            <span className="text-2xl font-black font-mono text-slate-800 dark:text-slate-100 mt-1 block">
              {toPersianDigits(overallStats.borrowersCount)} <span className="text-xs font-normal text-slate-400">نفر</span>
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Total Disbursed Loans */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 block">
              مجموع وام‌های پرداختی
            </span>
            <span className="text-xl font-black font-mono text-indigo-700 dark:text-indigo-300 mt-1 block">
              {formatCurrency(overallStats.totalDisbursed)}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        {/* Total Repayments */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 block">
              مجموع کل تسویه‌ها و اقساط
            </span>
            <span className="text-xl font-black font-mono text-emerald-700 dark:text-emerald-300 mt-1 block">
              {formatCurrency(overallStats.totalRepayments)}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        {/* Total Outstanding Debt Balance */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold text-rose-600 dark:text-rose-400 block">
              مانده کل بدهی باقی‌مانده
            </span>
            <span className="text-xl font-black font-mono text-rose-700 dark:text-rose-300 mt-1 block">
              {formatCurrency(overallStats.totalOutstandingDebt)}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-950 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی وام‌گیرنده (نام، تلفن، کد ملی)..."
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-extrabold self-stretch sm:self-auto justify-center">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              filterStatus === 'all'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            همه ({toPersianDigits(loanBorrowers.length)})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('debtors')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              filterStatus === 'debtors'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            دارای بدهی فعال ({toPersianDigits(loanBorrowers.filter(b => getBorrowerStats(b).currentDebtBalance > 0).length)})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('cleared')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              filterStatus === 'cleared'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            تسویه‌شده ({toPersianDigits(loanBorrowers.filter(b => getBorrowerStats(b).currentDebtBalance <= 0).length)})
          </button>
        </div>
      </div>

      {/* Borrowers Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3.5">#</th>
                <th className="p-3.5">مشخصات وام‌گیرنده</th>
                <th className="p-3.5 text-center">شماره تماس / کد ملی</th>
                <th className="p-3.5 text-center">بدهی اولیه</th>
                <th className="p-3.5 text-center">کل پرداخت وام</th>
                <th className="p-3.5 text-center">کل بازپرداخت / تسویه</th>
                <th className="p-3.5 text-center">مانده بدهی فعلی</th>
                <th className="p-3.5 text-center">عملیات و مدیریت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {filteredBorrowers.map((b, idx) => {
                const stats = getBorrowerStats(b);
                const isDebtor = stats.currentDebtBalance > 0;

                return (
                  <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3.5 font-mono text-slate-400 text-center">{toPersianDigits(idx + 1)}</td>
                    <td className="p-3.5">
                      <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs shrink-0">
                          {b.name.charAt(0)}
                        </div>
                        <div>
                          <span>{b.name}</span>
                          {b.notes && (
                            <span className="text-[10px] text-slate-400 block font-normal truncate max-w-xs">
                              {b.notes}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-center font-mono">
                      <div>{b.phone ? toPersianDigits(b.phone) : '—'}</div>
                      {b.nationalId && <div className="text-[10px] text-slate-400 font-mono">کد ملی: {toPersianDigits(b.nationalId)}</div>}
                    </td>
                    <td className="p-3.5 text-center font-mono text-slate-600 dark:text-slate-400">
                      {stats.initialDebt > 0 ? formatCurrency(stats.initialDebt) : '—'}
                    </td>
                    <td className="p-3.5 text-center font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                      {formatCurrency(stats.totalPayouts)}
                    </td>
                    <td className="p-3.5 text-center font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {formatCurrency(stats.totalRepayments)}
                    </td>
                    <td className="p-3.5 text-center font-mono">
                      <span className={`inline-block px-3 py-1 rounded-xl font-black text-xs ${
                        isDebtor 
                          ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      }`}>
                        {formatCurrency(Math.abs(stats.currentDebtBalance))} {stats.currentDebtBalance < 0 ? '(طلبکار)' : ''}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {/* History Button */}
                        <button
                          type="button"
                          onClick={() => setHistoryBorrower(b)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                          title="نمایش تاریخچه کامل تراکنش‌های وام"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>سوابق تراکنش‌ها</span>
                        </button>

                        {/* Quick Loan Payment */}
                        <button
                          type="button"
                          onClick={() => {
                            setQuickTxBorrower(b);
                            setQuickTxMode('payout');
                            setQuickAmount('');
                            setQuickDesc('');
                          }}
                          className="px-2 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/80 hover:bg-purple-100 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                          title="ثبت پرداخت وام جدید"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>پرداخت وام</span>
                        </button>

                        {/* Quick Loan Settlement */}
                        <button
                          type="button"
                          onClick={() => {
                            setQuickTxBorrower(b);
                            setQuickTxMode('repayment');
                            setQuickAmount('');
                            setQuickDesc('');
                          }}
                          className="px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                          title="ثبت تسویه و دریافت قسط"
                        >
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                          <span>تسویه وام</span>
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => openEditBorrowerModal(b)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer"
                          title="ویرایش مشخصات وام‌گیرنده"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDeleteBorrower(b)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                          title="حذف وام‌گیرنده"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredBorrowers.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                    هیچ وام‌گیرنده‌ای مطابق با فیلتر یا جستجوی شما یافت نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Add/Edit Loan Borrower */}
      {isBorrowerModalOpen && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in popup-overlay-global">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-5 popup-box-global">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                <Landmark className="w-4 h-4 text-indigo-600" />
                <span>{editingBorrower ? 'ویرایش مشخصات وام‌گیرنده' : 'تعریف وام‌گیرنده جدید'}</span>
              </h3>
              <button
                type="button"
                onClick={closeBorrowerModal}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBorrower} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                  نام و نام خانوادگی وام‌گیرنده <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  placeholder="مثال: علیرضا محمدی"
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                    شماره همراه / تماس
                  </label>
                  <input
                    type="text"
                    value={borrowerPhone}
                    onChange={(e) => setBorrowerPhone(e.target.value)}
                    placeholder="۰۹۱۲۳ND4567"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-800 dark:text-slate-100 text-center font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                    کد ملی / شناسه
                  </label>
                  <input
                    type="text"
                    value={borrowerNationalId}
                    onChange={(e) => setBorrowerNationalId(e.target.value)}
                    placeholder="۰۰۱۲۳۴۵۶۷۸"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-800 dark:text-slate-100 text-center font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                  بدهی اولیه وام قبل از ثبت سیستم (ریال)
                </label>
                <input
                  type="text"
                  value={borrowerInitialDebt}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/,/g, '');
                    if (!raw || /^\d+$/.test(raw)) {
                      setBorrowerInitialDebt(raw ? Number(raw).toLocaleString('en-US') : '');
                    }
                  }}
                  placeholder="۰"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-black text-rose-600 dark:text-rose-400 text-center font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400 block">
                  اگر این شخص قبلاً از شما وامی دریافت کرده و بدهکار بوده، مانده بدهی قبلی وی را اینجا وارد فرمایید.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                  توضیحات و یادداشت تکمیلی
                </label>
                <textarea
                  rows={2}
                  value={borrowerNotes}
                  onChange={(e) => setBorrowerNotes(e.target.value)}
                  placeholder="یادداشت در خصوص ضامن، اقساط، شماره حساب و..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeBorrowerModal}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-all shadow-sm cursor-pointer"
                >
                  {editingBorrower ? 'ذخیره تغییرات' : 'افزودن وام‌گیرنده'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Borrower History Log Modal */}
      {historyBorrower && (() => {
        const stats = getBorrowerStats(historyBorrower);
        const allHistoryTxs = [...stats.payoutsTx, ...stats.repaymentsTx].sort((a, b) => {
          return b.date.localeCompare(a.date) || b.time.localeCompare(a.time);
        });

        return (
          <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in print:p-0 print:bg-white print:static popup-overlay-global">
            <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-3xl max-w-3xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-5 max-h-[90vh] flex flex-col print:shadow-none print:border-none print:max-h-none print:w-full popup-box-global">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0 print:hidden">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm">
                      تاریخچه کامل تراکنش‌های وام: <span className="text-indigo-600 dark:text-indigo-400">{historyBorrower.name}</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      ریز تمامی پرداخت‌ها و بازپرداخت‌های انجام شده
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrintBorrowerStatement}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>چاپ صورتحساب</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryBorrower(null)}
                    className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Print Header */}
              <div className="hidden print:block text-center border-b pb-4 mb-4">
                <h2 className="text-lg font-black">صورتحساب تراکنش‌های وام</h2>
                <p className="text-xs text-slate-600 mt-1">
                  نام وام‌گیرنده: <strong>{historyBorrower.name}</strong> {historyBorrower.phone && `| تلفن: ${toPersianDigits(historyBorrower.phone)}`}
                </p>
              </div>

              {/* Summary Cards inside history modal */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 shrink-0">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block">بدهی اولیه:</span>
                  <span className="text-xs font-black font-mono text-slate-700 dark:text-slate-300">
                    {formatCurrency(stats.initialDebt)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold block">مجموع وام‌های پرداختی:</span>
                  <span className="text-xs font-black font-mono text-indigo-700 dark:text-indigo-300">
                    {formatCurrency(stats.totalPayouts)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">مجموع کل بازپرداخت‌ها:</span>
                  <span className="text-xs font-black font-mono text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(stats.totalRepayments)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold block">مانده بدهی فعلی:</span>
                  <span className="text-xs font-black font-mono text-rose-700 dark:text-rose-300">
                    {formatCurrency(stats.currentDebtBalance)}
                  </span>
                </div>
              </div>

              {/* History Table */}
              <div className="overflow-y-auto flex-1 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-extrabold z-10">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="p-3">#</th>
                      <th className="p-3 text-center">تاریخ و زمان</th>
                      <th className="p-3 text-center">نوع تراکنش</th>
                      <th className="p-3 text-center">حساب / صندوق</th>
                      <th className="p-3">توضیحات</th>
                      <th className="p-3 text-center">مبلغ (ریال)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                    {allHistoryTxs.map((tx, idx) => {
                      const isPayout = tx.loanType === 'payout' || tx.categoryParent === 'پرداخت وام' || tx.type === 'withdrawal';
                      const acc = accounts.find(a => a.id === tx.accountId);

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="p-3 font-mono text-slate-400 text-center">{toPersianDigits(idx + 1)}</td>
                          <td className="p-3 text-center font-mono">
                            <div>{toPersianDigits(tx.date)}</div>
                            <div className="text-[10px] text-slate-400">{toPersianDigits(tx.time)}</div>
                          </td>
                          <td className="p-3 text-center font-bold">
                            {isPayout ? (
                              <span className="inline-flex items-center gap-1 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2.5 py-0.5 rounded-full text-[10px] border border-purple-200 dark:border-purple-800">
                                <ArrowUpRight className="w-3 h-3" />
                                <span>پرداخت وام</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-200 dark:border-emerald-800">
                                <ArrowDownLeft className="w-3 h-3" />
                                <span>تسویه / دریافت قسط</span>
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-700 dark:text-slate-300">
                            {acc ? acc.name : '—'}
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 text-[11px]">
                            {tx.userDescription || tx.description || '—'}
                          </td>
                          <td className={`p-3 text-center font-mono font-black ${isPayout ? 'text-purple-700 dark:text-purple-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                            {formatCurrency(tx.amount)}
                          </td>
                        </tr>
                      );
                    })}

                    {allHistoryTxs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                          هیچ تراکنش پرداخت یا تسویه‌ای برای این وام‌گیرنده تا کنون ثبت نشده است.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal 3: Quick Loan Transaction Modal */}
      {quickTxBorrower && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in popup-overlay-global">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-5 popup-box-global">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm">
                  ثبت تراکنش وام برای: <span className="text-indigo-600">{quickTxBorrower.name}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickTxBorrower(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {txSuccessMsg ? (
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 p-4 rounded-2xl flex items-center gap-3 text-xs font-bold animate-fade-in">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{txSuccessMsg}</span>
              </div>
            ) : (
              <form onSubmit={handleQuickTxSubmit} className="space-y-4">
                {/* Mode Selector */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setQuickTxMode('payout')}
                    className={`py-2 px-3 rounded-lg text-xs font-black transition-all cursor-pointer text-center ${
                      quickTxMode === 'payout'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    پرداخت وام جدید
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickTxMode('repayment')}
                    className={`py-2 px-3 rounded-lg text-xs font-black transition-all cursor-pointer text-center ${
                      quickTxMode === 'repayment'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    تسویه / دریافت قسط
                  </button>
                </div>

                {/* Amount Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                    {quickTxMode === 'payout' ? 'مبلغ وام پرداختی (ریال)' : 'مبلغ دریافتی بابت تسویه/قسط (ریال)'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={quickAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '');
                      if (!raw || /^\d+$/.test(raw)) {
                        setQuickAmount(raw ? Number(raw).toLocaleString('en-US') : '');
                      }
                    }}
                    placeholder="مبلغ را وارد کنید..."
                    required
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-black text-center font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Account Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                    حساب بانکی / صندوق مربوطه <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={quickAccount}
                    onChange={(e) => setQuickAccount(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatCurrency(a.balance)} ریال)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">تاریخ</label>
                    <JalaliDatePicker
                      value={quickDate}
                      onChange={setQuickDate}
                      placeholder="تاریخ"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">ساعت</label>
                    <input
                      type="text"
                      value={quickTime}
                      onChange={(e) => setQuickTime(e.target.value)}
                      placeholder="12:00"
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-center font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">توضیحات</label>
                  <input
                    type="text"
                    value={quickDesc}
                    onChange={(e) => setQuickDesc(e.target.value)}
                    placeholder="توضیحات اختیاری..."
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickTxBorrower(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className={`px-5 py-2 rounded-xl text-white text-xs font-black transition-all shadow-sm cursor-pointer ${
                      quickTxMode === 'payout' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {quickTxMode === 'payout' ? 'ثبت پرداخت وام' : 'ثبت تسویه وام'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

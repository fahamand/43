import React, { useState, useEffect, useMemo } from 'react';
import { BankSmsMessage, BankAccount, TransactionCategory, AppState, BankTransaction, PendingDeposit } from '../types';
import { 
  formatCurrency, toPersianDigits, getTodayJalali, getYesterdayJalali, 
  getOneMonthAgoJalali, getJalaliDateFromTimestamp, clampToTodayIfFuture 
} from '../utils/stateManager';
import { JalaliDatePicker } from './JalaliDatePicker';
import { 
  Smartphone, MessageSquare, ArrowDownLeft, ArrowUpRight, CheckCircle2, 
  Clock, Plus, Trash2, Key, Copy, Check, Search, Calendar, UserCheck, 
  RotateCcw, Send, AlertCircle, Building2, FileText, X, Filter, CheckSquare,
  CreditCard, Hash, ChevronDown, ChevronUp, Layers, ShieldCheck, ArrowRightLeft, Landmark
} from 'lucide-react';

interface BankSmsManagerProps {
  state: AppState;
  onUpdateState: <K extends keyof AppState>(key: K, data: AppState[K]) => void;
}

export default function BankSmsManager({ state, onUpdateState }: BankSmsManagerProps) {
  const smsList: BankSmsMessage[] = Array.isArray(state.bankSmsMessages) ? state.bankSmsMessages : [];
  const currentUser = state.currentUser;

  // Status Filter: 'all' | 'pending' | 'reviewed'
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'reviewed'>('all');

  // Time Quick Preset: 'all' | 'today' | 'yesterday' | 'custom'
  const [timePreset, setTimePreset] = useState<'all' | 'today' | 'yesterday' | 'custom'>('all');
  
  // Custom Date Range
  const [fromDate, setFromDate] = useState<string>(() => getOneMonthAgoJalali());
  const [toDate, setToDate] = useState<string>(() => getTodayJalali());

  // Text Search
  const [searchTerm, setSearchTerm] = useState('');

  // Expandable raw SMS toggles
  const [expandedRawIds, setExpandedRawIds] = useState<string[]>([]);

  // Modals & UI States
  const [showApiHelpModal, setShowApiHelpModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Review Notes Modal / Selection
  const [reviewingSms, setReviewingSms] = useState<BankSmsMessage | null>(null);
  const [reviewNoteInput, setReviewNoteInput] = useState('');

  // Batch Deletion States
  const [selectedSmsIds, setSelectedSmsIds] = useState<string[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleteMode, setBatchDeleteMode] = useState<'selected' | 'all_filtered'>('selected');

  useEffect(() => {
    setSelectedSmsIds([]);
  }, [filterStatus, timePreset, fromDate, toDate, searchTerm]);

  // Conversion Modal State
  const [convertingSms, setConvertingSms] = useState<BankSmsMessage | null>(null);
  const [convertTargetType, setConvertTargetType] = useState<'transaction' | 'pendingDeposit'>('transaction');
  const [convertAccountId, setConvertAccountId] = useState<string>('');
  const [convertParentCat, setConvertParentCat] = useState<string>('');
  const [convertChildCat, setConvertChildCat] = useState<string>('');
  const [convertCounterpartId, setConvertCounterpartId] = useState<string>('');
  const [convertInvoiceId, setConvertInvoiceId] = useState<string>('');
  const [convertDescription, setConvertDescription] = useState<string>('');

  const openConvertModal = (sms: BankSmsMessage) => {
    setConvertingSms(sms);
    setConvertTargetType(sms.type === 'withdrawal' ? 'transaction' : 'transaction');
    
    // Auto-match bank account
    const accounts = state.accounts || [];
    let matchedAcc = accounts.find(a => sms.bankName && a.name.toLowerCase().includes(sms.bankName.toLowerCase()));
    if (!matchedAcc && sms.accountNumber) {
      matchedAcc = accounts.find(a => a.accountNumber && (a.accountNumber.includes(sms.accountNumber!) || sms.accountNumber!.includes(a.accountNumber)));
    }
    if (!matchedAcc && accounts.length > 0) {
      matchedAcc = accounts[0];
    }
    setConvertAccountId(matchedAcc ? matchedAcc.id : '');
    setConvertParentCat(sms.type === 'withdrawal' ? 'هزینه‌های جاری' : 'دریافت از مشتریان');
    setConvertChildCat('');
    setConvertCounterpartId('');
    setConvertInvoiceId('');
    setConvertDescription(`پیامک ${sms.bankName || 'بانکی'} - رهگیری: ${sms.refCode || 'ثبت‌شده از پیامک'}`);
  };

  const handleExecuteConversion = () => {
    if (!convertingSms) return;
    const sms = convertingSms;
    const timeNow = new Date(sms.receivedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    const jalaliDate = getJalaliDateFromTimestamp(sms.receivedAt);
    const amountVal = sms.amount || 0;
    const reviewerName = currentUser?.name || currentUser?.role || 'کاربر سیستم';

    if (convertTargetType === 'transaction') {
      const newTxId = `tx-sms-${Date.now()}`;
      const newTx: BankTransaction = {
        id: newTxId,
        date: jalaliDate,
        time: timeNow,
        amount: amountVal,
        type: sms.type || 'deposit',
        description: sms.body,
        isRegistered: true,
        categoryParent: convertParentCat,
        categoryChild: convertChildCat,
        userDescription: convertDescription,
        accountId: convertAccountId,
        counterpartId: convertCounterpartId || undefined,
        invoiceId: convertInvoiceId || undefined,
        createdBy: reviewerName,
        registeredDate: new Date().toISOString()
      };

      const updatedTxs = [newTx, ...(state.transactions || [])];
      onUpdateState('transactions', updatedTxs);

      // Update account balance
      if (convertAccountId) {
        const updatedAccounts = (state.accounts || []).map(acc => {
          if (acc.id === convertAccountId) {
            const balanceDelta = newTx.type === 'deposit' ? newTx.amount : -newTx.amount;
            return { ...acc, balance: (acc.balance || 0) + balanceDelta };
          }
          return acc;
        });
        onUpdateState('accounts', updatedAccounts);
      }
    } else {
      // Pending deposit
      const matchedCp = (state.counterparts || []).find(c => c.id === convertCounterpartId);
      const matchedInv = (state.invoices || []).find(i => i.id === convertInvoiceId);
      const newPdId = `pd-sms-${Date.now()}`;
      const newPd: PendingDeposit = {
        id: newPdId,
        invoiceId: convertInvoiceId,
        invoiceNumber: matchedInv ? matchedInv.invoiceNumber : '',
        counterpartId: convertCounterpartId || (matchedInv ? matchedInv.counterpartId : ''),
        counterpartName: matchedCp ? matchedCp.name : (matchedInv ? matchedInv.counterpartName : 'مشتری نامشخص'),
        amount: amountVal,
        date: jalaliDate,
        status: 'pending',
        type: 'sale'
      };

      const updatedPds = [newPd, ...(state.pendingDeposits || [])];
      onUpdateState('pendingDeposits', updatedPds);
    }

    // Update SMS status
    const reviewedAtFormatted = `${getTodayJalali()} - ${new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`;
    const updatedSmsList = smsList.map(item => {
      if (item.id === sms.id) {
        return {
          ...item,
          status: 'converted' as const,
          reviewedBy: reviewerName,
          reviewedAt: reviewedAtFormatted,
          reviewNotes: convertTargetType === 'transaction' ? 'تبدیل به تراکنش بانکی' : 'ثبت به عنوان بیعانه معلق'
        };
      }
      return item;
    });

    onUpdateState('bankSmsMessages', updatedSmsList);
    setConvertingSms(null);
  };

  // Test SMS Modal state
  const [testBank, setTestBank] = useState('بانک ملت');
  const [testType, setTestType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [testAmount, setTestAmount] = useState('5000000');
  const [testRefCode, setTestRefCode] = useState('123456789');
  const [testCard, setTestCard] = useState('6104****1234');

  const todayJalali = getTodayJalali();
  const yesterdayJalali = getYesterdayJalali();

  const toggleRawSms = (id: string) => {
    setExpandedRawIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Helper function to calculate 32-bit FNV-1a hash of string
  const computeStringHash = (str: string): string => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };

  // Robust, content-hash based deduplication fingerprint algorithm for SMS messages
  const getSmsFingerprint = (sms: BankSmsMessage) => {
    if (sms.hash && sms.hash.length >= 8) {
      return sms.hash;
    }

    const bank = (sms.bankName || 'bank').trim().toLowerCase();
    const amt = sms.amount || 0;
    const type = sms.type || 'other';
    const ref = (sms.refCode || '').trim();

    // If a valid reference code (>=3 chars) exists, bank + amount + type + refCode uniquely identifies the transaction
    if (ref.length >= 3) {
      return `ref_${bank}_${amt}_${type}_${ref}`;
    }

    // Otherwise, normalize body text (convert digits to standard 0-9, strip non-alphanumeric chars)
    const normBody = (sms.body || '')
      .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
      .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();

    const acc = (sms.accountNumber || '').trim().toLowerCase();
    const senderStr = (sms.sender || '').trim().toLowerCase();
    const bodyHash = computeStringHash(normBody);

    return `hash_${bank}_${type}_${amt}_${acc}_${senderStr}_${bodyHash}`;
  };

  // Group SMS messages by fingerprint for deduplication
  interface DeduplicatedEntry {
    sms: BankSmsMessage;
    duplicateCount: number;
    duplicateIds: string[];
  }

  const fingerprintMap = new Map<string, DeduplicatedEntry>();

  smsList.forEach(sms => {
    const fp = getSmsFingerprint(sms);
    if (!fingerprintMap.has(fp)) {
      fingerprintMap.set(fp, {
        sms,
        duplicateCount: 1,
        duplicateIds: [sms.id]
      });
    } else {
      const entry = fingerprintMap.get(fp)!;
      entry.duplicateCount += 1;
      entry.duplicateIds.push(sms.id);

      // Prioritize keeping the item that is already reviewed or has review notes
      if (sms.status === 'reviewed' && entry.sms.status !== 'reviewed') {
        entry.sms = sms;
      } else if (sms.reviewNotes && !entry.sms.reviewNotes) {
        entry.sms = sms;
      }
    }
  });

  // Effective SMS list (always strictly deduplicated)
  const effectiveSmsList = Array.from(fingerprintMap.values()).map(e => e.sms);

  // Automatically prune duplicate records from state if present
  useEffect(() => {
    if (smsList.length > effectiveSmsList.length) {
      onUpdateState('bankSmsMessages', effectiveSmsList);
    }
  }, [smsList.length, effectiveSmsList.length]);

  // Filter Logic
  const filteredList = effectiveSmsList.filter(sms => {
    // 1. Status Filter
    if (filterStatus === 'pending' && sms.status !== 'pending') return false;
    if (filterStatus === 'reviewed' && sms.status !== 'reviewed' && sms.status !== 'converted') return false;

    // 2. Time Filter
    const smsJalaliDate = getJalaliDateFromTimestamp(sms.receivedAt);

    if (timePreset === 'today') {
      if (smsJalaliDate !== todayJalali) return false;
    } else if (timePreset === 'yesterday') {
      if (smsJalaliDate !== yesterdayJalali) return false;
    } else if (timePreset === 'custom') {
      if (fromDate && smsJalaliDate < fromDate) return false;
      if (toDate && smsJalaliDate > toDate) return false;
    }

    // 3. Search Term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const bodyMatch = sms.body.toLowerCase().includes(term);
      const bankMatch = (sms.bankName || '').toLowerCase().includes(term);
      const senderMatch = sms.sender.toLowerCase().includes(term);
      const refMatch = (sms.refCode || '').includes(term);
      const cardMatch = (sms.accountNumber || '').includes(term);
      const reviewerMatch = (sms.reviewedBy || '').toLowerCase().includes(term);
      const noteMatch = (sms.reviewNotes || '').toLowerCase().includes(term);

      return bodyMatch || bankMatch || senderMatch || refMatch || cardMatch || reviewerMatch || noteMatch;
    }

    return true;
  });

  const handleToggleSelectOneSms = (id: string) => {
    setSelectedSmsIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllSms = () => {
    if (filteredList.length > 0 && selectedSmsIds.length === filteredList.length) {
      setSelectedSmsIds([]);
    } else {
      setSelectedSmsIds(filteredList.map(s => s.id));
    }
  };

  const targetBatchSmsList = useMemo(() => {
    if (batchDeleteMode === 'all_filtered') {
      return filteredList;
    }
    const idSet = new Set(selectedSmsIds);
    return filteredList.filter(s => idSet.has(s.id));
  }, [batchDeleteMode, selectedSmsIds, filteredList]);

  const targetBatchTotalAmount = useMemo(() => {
    return targetBatchSmsList.reduce((sum, s) => sum + (s.amount || 0), 0);
  }, [targetBatchSmsList]);

  const handleConfirmBatchDeleteSms = () => {
    if (currentUser?.role === 'seller') return;
    if (targetBatchSmsList.length === 0) return;

    const idsToDelete = new Set<string>();
    targetBatchSmsList.forEach(item => {
      idsToDelete.add(item.id);
    });

    fingerprintMap.forEach(entry => {
      if (idsToDelete.has(entry.sms.id)) {
        entry.duplicateIds.forEach(id => idsToDelete.add(id));
      }
    });

    const updated = smsList.filter(s => !idsToDelete.has(s.id));
    onUpdateState('bankSmsMessages', updated);
    setSelectedSmsIds([]);
    setShowBatchDeleteModal(false);
  };

  // Statistics Counts
  const totalCount = effectiveSmsList.length;
  const pendingCount = effectiveSmsList.filter(s => s.status === 'pending').length;
  const reviewedCount = effectiveSmsList.filter(s => s.status === 'reviewed' || s.status === 'converted').length;
  const todayCount = effectiveSmsList.filter(s => getJalaliDateFromTimestamp(s.receivedAt) === todayJalali).length;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
  const apiEndpointUrl = `${currentOrigin}/api/sms/receive`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Mark single SMS as reviewed
  const handleMarkAsReviewed = (sms: BankSmsMessage, notes?: string) => {
    const reviewerName = currentUser?.name || currentUser?.role || 'کاربر سیستم';
    const timeNow = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    const reviewedAtFormatted = `${getTodayJalali()} - ${timeNow}`;

    const updated = smsList.map(item => {
      if (item.id === sms.id) {
        return {
          ...item,
          status: 'reviewed' as const,
          reviewedBy: reviewerName,
          reviewedAt: reviewedAtFormatted,
          reviewNotes: notes !== undefined ? notes : item.reviewNotes
        };
      }
      return item;
    });

    onUpdateState('bankSmsMessages', updated);
    setReviewingSms(null);
    setReviewNoteInput('');
  };

  // Revert SMS back to pending
  const handleRevertToPending = (smsId: string) => {
    const updated = smsList.map(item => {
      if (item.id === smsId) {
        return {
          ...item,
          status: 'pending' as const,
          reviewedBy: undefined,
          reviewedAt: undefined
        };
      }
      return item;
    });
    onUpdateState('bankSmsMessages', updated);
  };

  // Mark all pending SMS as reviewed in bulk
  const handleMarkAllPendingAsReviewed = () => {
    if (pendingCount === 0) return;
    if (confirm(`آیا مطمئن هستید که می‌خواهید تمام ${toPersianDigits(pendingCount)} پیامک در انتظار بررسی را به عنوان بررسی‌شده تایید کنید؟`)) {
      const reviewerName = currentUser?.name || currentUser?.role || 'کاربر سیستم';
      const timeNow = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      const reviewedAtFormatted = `${getTodayJalali()} - ${timeNow}`;

      const updated = smsList.map(item => {
        if (item.status === 'pending') {
          return {
            ...item,
            status: 'reviewed' as const,
            reviewedBy: reviewerName,
            reviewedAt: reviewedAtFormatted
          };
        }
        return item;
      });
      onUpdateState('bankSmsMessages', updated);
    }
  };

  const handleDeleteSms = (smsId: string) => {
    if (currentUser?.role === 'seller') return;
    if (confirm('آیا از حذف این پیامک دریافتی مطمئن هستید؟')) {
      const updated = smsList.filter(s => s.id !== smsId);
      onUpdateState('bankSmsMessages', updated);
    }
  };

  const handleDeleteAllFiltered = () => {
    if (currentUser?.role === 'seller') return;
    if (filteredList.length === 0) return;

    const idsToDelete = new Set<string>();
    filteredList.forEach(item => {
      idsToDelete.add(item.id);
    });

    // Also include any duplicate IDs that were deduplicated under these entries
    fingerprintMap.forEach(entry => {
      if (idsToDelete.has(entry.sms.id)) {
        entry.duplicateIds.forEach(id => idsToDelete.add(id));
      }
    });

    const count = idsToDelete.size;

    let scopeDesc = '';
    if (filterStatus === 'pending') scopeDesc += ' در انتظار بررسی';
    else if (filterStatus === 'reviewed') scopeDesc += ' بررسی‌شده';

    if (timePreset === 'today') scopeDesc += ' (امروز)';
    else if (timePreset === 'yesterday') scopeDesc += ' (دیروز)';
    else if (timePreset === 'custom') scopeDesc += ` (از ${fromDate} تا ${toDate})`;

    if (confirm(`آیا از حذف گروهی ${toPersianDigits(count)} پیامک بانکی${scopeDesc} مطمئن هستید؟ این عملیات غیرقابل بازگشت است.`)) {
      const updated = smsList.filter(s => !idsToDelete.has(s.id));
      onUpdateState('bankSmsMessages', updated);
    }
  };

  const handleSendTestSms = () => {
    const amountVal = parseInt(testAmount, 10) || 1000000;
    const bodyText = testType === 'deposit'
      ? `${testBank}\nواریز: ${amountVal.toLocaleString()} ریال\nبه حساب: ${testCard}\nکد پیگیری: ${testRefCode}`
      : `${testBank}\nبرداشت: ${amountVal.toLocaleString()} ریال\nاز حساب: ${testCard}\nکد پیگیری: ${testRefCode}`;

    const newTestSms: BankSmsMessage = {
      id: `sms-test-${Date.now()}`,
      sender: testBank,
      bankName: testBank,
      body: bodyText,
      receivedAt: new Date().toISOString(),
      amount: amountVal,
      type: testType,
      accountNumber: testCard,
      refCode: testRefCode,
      status: 'pending'
    };

    const updated = [newTestSms, ...smsList];
    onUpdateState('bankSmsMessages', updated);
    setShowTestModal(false);
  };

  return (
    <div id="bank-sms-manager-container" className="space-y-6">
      {/* Header Banner */}
      <div id="bank-sms-header-banner" className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 -mt-8 -ml-8 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-blue-500/20 border border-blue-400/30 rounded-xl backdrop-blur-md">
              <Smartphone className="w-8 h-8 text-blue-300" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                بررسی و پایش پیامک‌های بانکی دریافتی
                <span className="text-xs bg-emerald-500/30 border border-emerald-400/30 text-emerald-300 px-2.5 py-0.5 rounded-full font-normal">
                  اتصال خودکار اندروید
                </span>
              </h2>
              <p className="text-sm text-blue-200/80 mt-1">
                مشاهده، جستجو و بررسی پیامک‌های واریز/برداشت دریافتی از برنامه اندروید به همراه ثبت هوشمند کاربر بازبین
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pendingCount > 0 && (
              <button
                onClick={handleMarkAllPendingAsReviewed}
                className="px-3.5 py-2 bg-emerald-600/90 hover:bg-emerald-600 border border-emerald-500/40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
                title="تایید و بررسی یکجای پیامک‌های جدید"
              >
                <CheckSquare className="w-4 h-4" />
                تایید همگی ({toPersianDigits(pendingCount)})
              </button>
            )}

            <button
              id="btn-show-api-help"
              onClick={() => setShowApiHelpModal(true)}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Key className="w-4 h-4 text-amber-300" />
              راهنمای اتصال اندروید
            </button>
            <button
              id="btn-send-test-sms"
              onClick={() => setShowTestModal(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              افزودن پیامک نمونه
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div id="bank-sms-stats-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">کل پیامک‌های دریافتی</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{toPersianDigits(totalCount)}</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
            <MessageSquare className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">در انتظار بررسی</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{toPersianDigits(pendingCount)}</p>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">بررسی و تایید شده</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{toPersianDigits(reviewedCount)}</p>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">پیامک‌های امروز</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{toPersianDigits(todayCount)}</p>
          </div>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
            <Calendar className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div id="bank-sms-filter-panel" className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        
        {/* Row 1: Status Filters & Time Presets */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-700/60">
          
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
            <span className="text-xs font-bold text-slate-500 px-2 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              وضعیت:
            </span>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              همه ({toPersianDigits(totalCount)})
            </button>

            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'pending'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
              }`}
            >
              در انتظار بررسی ({toPersianDigits(pendingCount)})
            </button>

            <button
              onClick={() => setFilterStatus('reviewed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'reviewed'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              }`}
            >
              بررسی‌شده ({toPersianDigits(reviewedCount)})
            </button>
          </div>

          {/* Time Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 px-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              بازه زمانی:
            </span>
            
            <button
              onClick={() => setTimePreset('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                timePreset === 'all'
                  ? 'bg-indigo-600 text-white font-bold shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              همه زمان‌ها
            </button>

            <button
              onClick={() => setTimePreset('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                timePreset === 'today'
                  ? 'bg-indigo-600 text-white font-bold shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              امروز ({toPersianDigits(todayJalali)})
            </button>

            <button
              onClick={() => setTimePreset('yesterday')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                timePreset === 'yesterday'
                  ? 'bg-indigo-600 text-white font-bold shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              دیروز ({toPersianDigits(yesterdayJalali)})
            </button>

            <button
              onClick={() => setTimePreset('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                timePreset === 'custom'
                  ? 'bg-indigo-600 text-white font-bold shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              بازه دلخواه
            </button>
          </div>
        </div>

        {/* Row 2: Search Input & Custom Date Inputs (if preset === 'custom') */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Search Term */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="جستجو در متن، بانک، پیگیری، کاربر..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-9 pl-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Custom Date Inputs */}
          {timePreset === 'custom' && (
            <div className="flex items-center gap-2 w-full md:w-auto bg-indigo-50/60 dark:bg-indigo-950/30 p-2 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
              <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap">از:</span>
              <div className="w-32">
                <JalaliDatePicker
                  value={fromDate}
                  onChange={(val) => setFromDate(clampToTodayIfFuture(val))}
                  placeholder="1405/01/01"
                />
              </div>

              <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap">تا:</span>
              <div className="w-32">
                <JalaliDatePicker
                  value={toDate}
                  onChange={(val) => setToDate(clampToTodayIfFuture(val))}
                  placeholder="1405/04/03"
                />
              </div>
            </div>
          )}

          {/* Active Results Count & Bulk Actions */}
          <div className="flex flex-wrap items-center gap-3 self-end md:self-center">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              یافت شده: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{toPersianDigits(filteredList.length)}</strong> مورد
            </div>

            {filteredList.length > 0 && currentUser?.role !== 'seller' && (
              <div className="flex flex-wrap items-center gap-2">
                {selectedSmsIds.length > 0 && (
                  <button
                    id="btn-delete-selected-sms"
                    onClick={() => {
                      setBatchDeleteMode('selected');
                      setShowBatchDeleteModal(true);
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    title="حذف پیامک‌های تیک‌خورده"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف موارد انتخابی ({toPersianDigits(selectedSmsIds.length)})</span>
                  </button>
                )}

                <button
                  id="btn-delete-all-filtered-sms"
                  onClick={() => {
                    setBatchDeleteMode('all_filtered');
                    setShowBatchDeleteModal(true);
                  }}
                  className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 hover:text-white text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  title="حذف کلیه پیامک‌های نمایش‌داده‌شده بر اساس زبانه و بازه زمانی انتخابی"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف تمامی نتایج ({toPersianDigits(filteredList.length)})</span>
                </button>

                <button
                  id="btn-toggle-select-all-sms"
                  onClick={handleToggleSelectAllSms}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {selectedSmsIds.length === filteredList.length && filteredList.length > 0
                    ? 'لغو انتخاب همه'
                    : 'انتخاب همه'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SMS List (Ultra-Compact High-Density View) */}
      <div id="bank-sms-list-container" className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {filteredList.length === 0 ? (
          <div className="p-10 border-slate-200 dark:border-slate-700 text-center">
            <Smartphone className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">هیچ پیامک بانکی با مشخصات و فیلترهای انتخابی یافت نشد.</p>
            <p className="text-[11px] text-slate-400 mt-1">شما می‌توانید فیلترها را پاک کنید یا با «افزودن پیامک نمونه» پیامک جدید ثبت کنید.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {filteredList.map((sms) => {
              const isDeposit = sms.type === 'deposit';
              const isWithdrawal = sms.type === 'withdrawal';
              const isPending = sms.status === 'pending';
              const isReviewed = sms.status === 'reviewed' || sms.status === 'converted';
              const smsJalali = getJalaliDateFromTimestamp(sms.receivedAt);
              const showRaw = expandedRawIds.includes(sms.id);
              const isSelected = selectedSmsIds.includes(sms.id);

              return (
                <div
                  key={sms.id}
                  id={`sms-card-${sms.id}`}
                  className={`px-3 py-2 transition-all duration-150 flex flex-wrap lg:flex-nowrap items-center justify-between gap-x-3.5 gap-y-1.5 ${
                    isSelected
                      ? 'bg-rose-50/70 dark:bg-rose-950/30'
                      : isPending
                        ? 'bg-amber-50/30 dark:bg-amber-950/10 hover:bg-amber-50/60'
                        : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750'
                  }`}
                >
                  {/* Left Group: Checkbox + Status Icon + Bank Name */}
                  <div className="flex items-center gap-2 shrink-0">
                    {currentUser?.role !== 'seller' && (
                      <input
                        type="checkbox"
                        aria-label={`انتخاب پیامک ${sms.bankName || 'بانک'}`}
                        checked={isSelected}
                        onChange={() => handleToggleSelectOneSms(sms.id)}
                        className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer accent-rose-600 shrink-0"
                      />
                    )}

                    <div className={`p-1 rounded shrink-0 ${
                      isPending 
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' 
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    }`}>
                      {isPending ? <Clock className="w-4 h-4 animate-pulse" /> : <CheckCircle2 className="w-4 h-4" />}
                    </div>

                    <span className="font-extrabold text-sm text-slate-800 dark:text-white shrink-0">
                      {sms.bankName || 'بانک'}
                    </span>
                  </div>

                  {/* Center Group: Amount + Date */}
                  <div className="flex items-center gap-3 flex-wrap shrink-0">
                    {/* Amount */}
                    <span className={`text-sm font-black font-mono px-2.5 py-0.5 rounded ${
                      isDeposit
                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40'
                        : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40'
                    }`}>
                      {formatCurrency(sms.amount || 0)}
                    </span>

                    {/* Date */}
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1 shrink-0">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 inline" />
                      <span>{toPersianDigits(smsJalali)} - {new Date(sms.receivedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                  </div>

                  {/* Right Group: Reviewer & Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0 mr-auto">
                    {isReviewed && (
                      <span className="text-xs bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded flex items-center gap-1 max-w-[140px] truncate" title={sms.reviewNotes || sms.reviewedBy}>
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">{sms.reviewedBy || 'کاربر'}</span>
                      </span>
                    )}

                    {sms.status === 'converted' ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                        تبدیل‌شده
                      </span>
                    ) : (
                      <button
                        onClick={() => openConvertModal(sms)}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                        title="ثبت این پیامک به عنوان تراکنش بانکی یا بیعانه فاکتور"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        تبدیل به تراکنش
                      </button>
                    )}

                    {isPending ? (
                      <button
                        onClick={() => handleMarkAsReviewed(sms)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold flex items-center gap-1 transition-all"
                        title="علامت‌گذاری به عنوان بررسی‌شده"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        تایید
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRevertToPending(sms.id)}
                        className="px-2 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300 rounded text-xs font-medium flex items-center gap-1 transition-all"
                        title="بازگردانی"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        بازگردانی
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setReviewingSms(sms);
                        setReviewNoteInput(sms.reviewNotes || '');
                      }}
                      className={`p-1.5 rounded text-xs font-medium transition-all ${
                        sms.reviewNotes 
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40' 
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                      title={sms.reviewNotes ? `ویرایش یادداشت: ${sms.reviewNotes}` : 'افزودن یادداشت'}
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => toggleRawSms(sms.id)}
                      className="p-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-500 dark:text-slate-400 rounded transition-all"
                      title={showRaw ? 'مخفی‌سازی متن اصلی' : 'مشاهده متن اصلی پیامک'}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>

                    {currentUser?.role !== 'seller' && (
                      <button
                        onClick={() => handleDeleteSms(sms.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded transition-all"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Collapsed Raw SMS text drawer if toggled */}
                  {showRaw && (
                    <div className="w-full mt-1 p-2 bg-slate-900 text-slate-200 rounded text-[10px] font-mono border border-slate-700 break-words">
                      <span className="text-amber-400 font-bold block mb-0.5">متن خام پیامک:</span>
                      {sms.body}
                    </div>
                  )}

                  {/* Notes line if present */}
                  {sms.reviewNotes && !showRaw && (
                    <div className="w-full text-[10px] text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded border border-amber-200/60 dark:border-amber-800/40 flex items-center gap-1 font-medium">
                      <FileText className="w-3 h-3 text-amber-600 shrink-0" />
                      <span>یادداشت: {sms.reviewNotes}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Optional Note Modal */}
      {reviewingSms && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 popup-overlay-global">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 popup-box-global">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-base text-slate-800 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                ثبت یادداشت بازبینی پیامک
              </h3>
              <button
                onClick={() => setReviewingSms(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl text-xs space-y-1">
              <p className="text-slate-500 font-bold">متن پیامک:</p>
              <p className="text-slate-800 dark:text-slate-200 font-mono">{reviewingSms.body}</p>
            </div>

            <div className="space-y-1 text-xs">
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                یادداشت یا توضیحات کاربر بازبین:
              </label>
              <textarea
                rows={3}
                placeholder="توضیح مربوط به این پیامک (مثلا: چک شد، واریز فاکتور شماره ۱۲۳)..."
                value={reviewNoteInput}
                onChange={(e) => setReviewNoteInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setReviewingSms(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleMarkAsReviewed(reviewingSms, reviewNoteInput)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                تایید و ذخیره بازبینی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Android API Help Modal */}
      {showApiHelpModal && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 popup-overlay-global">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5 max-h-[90vh] overflow-y-auto popup-box-global">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-base text-slate-800 dark:text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-600" />
                راهنمای اتصال برنامه اندروید دریافت پیامک
              </h3>
              <button
                onClick={() => setShowApiHelpModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <p>
                شما می‌توانید از هر اپلیکیشن ارسال/فوروارد پیامک اندروید (مانند SMS Forwarder, Tasker, HTTP Shortcuts) استفاده کنید تا پیامک‌های بانکی دریافتی روی گوشی موبایل فوراً به سیستم ارسال و ثبت شوند.
              </p>

              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-white">آدرس کامل Webhook (Endpoint URL):</span>
                  <button
                    onClick={() => copyToClipboard(apiEndpointUrl)}
                    className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded hover:bg-blue-100 flex items-center gap-1 text-[11px]"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    کپی آدرس
                  </button>
                </div>
                <div className="bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-800 font-mono text-blue-600 dark:text-blue-400 break-all">
                  {apiEndpointUrl}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <p className="font-bold text-slate-800 dark:text-white">روش درخواست HTTP POST:</p>
                <p className="text-slate-500">فرمت محتوای ارسالی (JSON Payload):</p>
                <pre className="bg-slate-900 text-emerald-400 p-3 rounded-lg font-mono text-[11px] overflow-x-auto text-left" dir="ltr">
{`{
  "sender": "6104",
  "body": "بانک ملت\\nواریز: 1,500,000 ریال\\nکد پیگیری: 98765432",
  "receivedAt": "${new Date().toISOString()}"
}`}
                </pre>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/50 flex items-start gap-2.5 text-blue-800 dark:text-blue-200">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <p>
                  سیستم هوشمند به محض دریافت پیامک، بانک، نوع تراکنش، مبلغ، کد پیگیری و شماره حساب را استخراج کرده و آن را در لیست پیامک‌های در انتظار بررسی قرار می‌دهد.
                </p>
              </div>
            </div>

            <div className="pt-3 flex justify-end border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setShowApiHelpModal(false)}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test SMS Modal */}
      {showTestModal && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 popup-overlay-global">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 popup-box-global">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-base text-slate-800 dark:text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-600" />
                شبیه‌سازی دریافت پیامک بانکی
              </h3>
              <button
                onClick={() => setShowTestModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">نام بانک:</label>
                <select
                  value={testBank}
                  onChange={(e) => setTestBank(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white"
                >
                  <option value="بانک ملت">بانک ملت</option>
                  <option value="بانک ملی ایران">بانک ملی ایران</option>
                  <option value="بلوبانک (Blu)">بلوبانک (Blu)</option>
                  <option value="بانک صادرات">بانک صادرات</option>
                  <option value="بانک تجارت">بانک تجارت</option>
                  <option value="بانک سپه">بانک سپه</option>
                  <option value="بانک پاسارگاد">بانک پاسارگاد</option>
                  <option value="بانک سامان">بانک سامان</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">نوع تراکنش:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTestType('deposit')}
                    className={`py-2 rounded-lg font-bold transition-all ${
                      testType === 'deposit' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    واریز (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestType('withdrawal')}
                    className={`py-2 rounded-lg font-bold transition-all ${
                      testType === 'withdrawal' ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    برداشت (-)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">مبلغ (ریال):</label>
                <input
                  type="text"
                  value={testAmount}
                  onChange={(e) => setTestAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">شماره کارت / حساب:</label>
                <input
                  type="text"
                  value={testCard}
                  onChange={(e) => setTestCard(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">کد پیگیری:</label>
                <input
                  type="text"
                  value={testRefCode}
                  onChange={(e) => setTestRefCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white font-mono"
                />
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSendTestSms}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all"
              >
                افزودن پیامک نمونه
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Convert SMS to Transaction / Pending Deposit Modal */}
      {convertingSms && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 popup-overlay-global">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 max-h-[90vh] overflow-y-auto popup-box-global">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-base text-slate-800 dark:text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                تبدیل پیامک به تراکنش / بیعانه مالی
              </h3>
              <button
                onClick={() => setConvertingSms(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Summary Banner */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">بانک / منبع:</span>
                <span className="font-extrabold text-slate-800 dark:text-white">{convertingSms.bankName || 'بانک'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">مبلغ پیامک:</span>
                <span className={`font-mono font-black text-sm ${convertingSms.type === 'deposit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {formatCurrency(convertingSms.amount || 0)}
                </span>
              </div>
              {convertingSms.refCode && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">کد پیگیری:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{convertingSms.refCode}</span>
                </div>
              )}
            </div>

            {/* Conversion Target Type Selection */}
            {convertingSms.type === 'deposit' && (
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold text-xs mb-1.5">نوع ثبت در دفاتر مالی:</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setConvertTargetType('transaction')}
                    className={`py-2 px-3 rounded-xl font-bold transition-all border ${
                      convertTargetType === 'transaction'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    تراکنش مستقیم بانکی
                  </button>
                  <button
                    type="button"
                    onClick={() => setConvertTargetType('pendingDeposit')}
                    className={`py-2 px-3 rounded-xl font-bold transition-all border ${
                      convertTargetType === 'pendingDeposit'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    واریزی / بیعانه معلق فاکتور
                  </button>
                </div>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-3 text-xs">
              {convertTargetType === 'transaction' && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    حساب بانکی یا صندوق مقصد:
                  </label>
                  <select
                    value={convertAccountId}
                    onChange={(e) => setConvertAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white"
                  >
                    <option value="">-- انتخاب حساب بانکی / صندوق --</option>
                    {(state.accounts || []).map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} (موجودی: {formatCurrency(acc.balance)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {convertTargetType === 'transaction' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">دسته‌بندی اصلی:</label>
                    <select
                      value={convertParentCat}
                      onChange={(e) => setConvertParentCat(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white"
                    >
                      <option value="دریافت از مشتریان">دریافت از مشتریان</option>
                      <option value="فروش کالا و خدمات">فروش کالا و خدمات</option>
                      <option value="هزینه‌های جاری">هزینه‌های جاری</option>
                      <option value="حقوق و دستمزد">حقوق و دستمزد</option>
                      <option value="سایر">سایر</option>
                      {(state.categories || []).map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">دسته‌بندی فرعی:</label>
                    <input
                      type="text"
                      placeholder="اختیاری..."
                      value={convertChildCat}
                      onChange={(e) => setConvertChildCat(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Counterpart Selection */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  طرف حساب / مشتری (اختیاری):
                </label>
                <select
                  value={convertCounterpartId}
                  onChange={(e) => setConvertCounterpartId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white"
                >
                  <option value="">-- بدون طرف حساب مستقیم --</option>
                  {(state.counterparts || []).map(cp => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name} ({cp.type === 'buyer' ? 'خریدار' : 'فروشنده'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Invoice Selection */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  اتصال به فاکتور خاص (اختیاری):
                </label>
                <select
                  value={convertInvoiceId}
                  onChange={(e) => setConvertInvoiceId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white"
                >
                  <option value="">-- بدون فاکتور --</option>
                  {(state.invoices || []).slice(0, 50).map(inv => (
                    <option key={inv.id} value={inv.id}>
                      فاکتور شماره {inv.invoiceNumber} - {inv.counterpartName} ({formatCurrency(inv.totalAmount)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">شرح تراکنش:</label>
                <input
                  type="text"
                  value={convertDescription}
                  onChange={(e) => setConvertDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white text-xs"
                />
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setConvertingSms(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleExecuteConversion}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                ثبت و تبدیل نهایی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Deletion Confirmation Modal */}
      {showBatchDeleteModal && targetBatchSmsList.length > 0 && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl shadow-2xl w-full max-w-md p-6 text-right border border-rose-200 dark:border-rose-900/50 space-y-4 popup-box-global">
            <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400 font-extrabold text-base border-b border-slate-150 dark:border-slate-800 pb-3">
              <div className="p-2 bg-rose-100 dark:bg-rose-950/60 rounded-xl text-rose-600 dark:text-rose-400">
                <Trash2 className="w-5 h-5 shrink-0" />
              </div>
              <div>
                <h4 className="text-slate-900 dark:text-white font-black text-sm">تأیید حذف گروهی پیامک‌های بانکی</h4>
                <p className="text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                  {batchDeleteMode === 'all_filtered' ? 'عملیات روی کلیه نتایج فیلترشده' : 'عملیات روی پیامک‌های تیک‌خورده'}
                </p>
              </div>
            </div>

            <div className="bg-rose-50/70 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                <span className="font-medium">تعداد پیامک‌های انتخابی:</span>
                <span className="font-bold text-rose-600 dark:text-rose-400 font-mono text-sm">
                  {toPersianDigits(targetBatchSmsList.length)} مورد
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                <span className="font-medium">مجموع مبالغ پیامک‌ها:</span>
                <span className="font-bold text-slate-900 dark:text-white font-mono">
                  {formatCurrency(targetBatchTotalAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                <span className="font-medium">وضعیت فیلتر:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {filterStatus === 'all' ? 'همه پیامک‌ها' : filterStatus === 'pending' ? 'در انتظار بررسی' : 'بررسی‌شده'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">
              آیا از حذف دائم و قطعی این پیامک‌های بانکی مطمئن هستید؟ این عملیات غیرقابل بازگشت است.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-150 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowBatchDeleteModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDeleteSms}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>تأیید و حذف {toPersianDigits(targetBatchSmsList.length)} پیامک</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

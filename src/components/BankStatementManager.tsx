import React, { useState, useEffect, useMemo } from 'react';
import { BankTransaction, TransactionCategory, BankAccount, User, Invoice, Partner, LoanBorrower, PendingDeposit, FiscalYear } from '../types';
import { downloadBankStatementTemplate, parseBankStatementExcel } from '../utils/excelHelper';
import { formatCurrency, toPersianDigits, saveGenericKeyToDb } from '../utils/stateManager';
import { toEnglishDigits } from '../utils/numberUtils';
import { 
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Check, 
  Download, FileSpreadsheet, Plus, CheckCircle, HelpCircle, X,
  Search, Square, CheckSquare, Info, Trash2, ArrowUpDown, RefreshCw, Ban, Layers,
  Wallet, Landmark, Settings2, Eye, EyeOff, Coins, CreditCard, ShieldCheck, CheckCheck, Tag,
  UserCheck, UserPlus, Users, ArrowRightLeft, HandCoins, Receipt, Building2, User as UserIcon
} from 'lucide-react';
import { validateFiscalDate, matchTransactionDuplicate } from '../services';

const normalizeDateStr = (d: string) => {
  if (!d) return '';
  let clean = toEnglishDigits(d).replace(/[^\d\/]/g, '');
  const parts = clean.split('/');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${y}/${m}/${day}`;
  }
  return clean;
};

const normalizeTimeStr = (t?: string) => {
  if (!t) return '00:00';
  let clean = toEnglishDigits(t).replace(/[^\d:]/g, '');
  const parts = clean.split(':');
  if (parts.length >= 2) {
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    return `${h}:${m}`;
  }
  return clean || '00:00';
};

export interface FeeCategoryConfig {
  parentCategory: string;
  subCategory: string;
  defaultTitle: string;
}

interface BankStatementManagerProps {
  transactions: BankTransaction[];
  categories: TransactionCategory[];
  accounts: BankAccount[];
  currentUser: User;
  fiscalYear?: FiscalYear;
  onAddTransaction: (tx: BankTransaction) => void;
  onRegisterTransaction: (updatedTx: BankTransaction | BankTransaction[]) => void;
  invoices: Invoice[];
  onUpdateInvoices: (updatedInvoices: Invoice[]) => void;
  onUpdateTransactions?: (updatedTxs: BankTransaction[]) => void;
  partners?: Partner[];
  loanBorrowers?: LoanBorrower[];
  onUpdateLoanBorrowers?: (borrowers: LoanBorrower[]) => void;
  onAddTransfer?: (amount: number, fromAccountId: string, toAccountId: string, date: string, time: string, description: string) => void;
  onUpdateAccounts?: (updatedAccs: BankAccount[]) => void;
  pendingDeposits?: PendingDeposit[];
  onUpdatePendingDeposits?: (updated: PendingDeposit[]) => void;
}

export default function BankStatementManager({
  transactions,
  categories,
  accounts,
  currentUser,
  fiscalYear,
  onAddTransaction,
  onRegisterTransaction,
  invoices = [],
  onUpdateInvoices,
  onUpdateTransactions,
  partners = [],
  loanBorrowers = [],
  onUpdateLoanBorrowers,
  onAddTransfer,
  onUpdateAccounts,
  pendingDeposits = [],
  onUpdatePendingDeposits
}: BankStatementManagerProps) {
  const getInvoiceDepositAndRemaining = (inv: Invoice) => {
    const normNum = (s: any) => String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString()).replace(/[٠-٩]/g, d => '٠١٢٣۴٥٦٧٨٩'.indexOf(d).toString()).trim().toLowerCase();
    const invDeposits = (pendingDeposits || []).filter(pd => 
      (pd.invoiceId === inv.id || normNum(pd.invoiceNumber) === normNum(inv.invoiceNumber)) && !pd.isDeleted
    );
    const pdPendingAmount = invDeposits
      .filter(pd => pd.status === 'pending')
      .reduce((sum, pd) => sum + pd.amount, 0);
    const pdClearedAmount = invDeposits
      .filter(pd => pd.status === 'cleared')
      .reduce((sum, pd) => sum + pd.amount, 0);

    const baseDeposit = Number(inv.deposit) || 0;
    const totalPd = pdClearedAmount + pdPendingAmount;
    // Sanitize in case previous double-counting bug inflated the deposit
    const cleanDeposit = (totalPd > 0 && baseDeposit === totalPd * 2 && (inv.paymentSlips || []).length <= 1)
      ? totalPd
      : baseDeposit;

    const clearedDeposit = Math.max(cleanDeposit, pdClearedAmount);
    const deposit = Math.max(cleanDeposit, totalPd);
    // remaining is the unsettled balance on the invoice waiting for bank/cash settlement
    const remaining = Math.max(0, inv.totalAmount - deposit);
    return { deposit, remaining, pendingAmount: pdPendingAmount, clearedDeposit };
  };

  const getAllInvoiceDeposits = (inv: Invoice) => {
    const slips: Array<{ id: string; amount: number; date: string; time?: string; label: string; isPending: boolean; isCleared?: boolean }> = [];
    
    // Find all global pending deposits for this invoice
    const pds = (pendingDeposits || []).filter(pd => 
      (pd.invoiceId === inv.id || String(pd.invoiceNumber) === String(inv.invoiceNumber)) && !pd.isDeleted
    );
    
    if (pds.length > 0) {
      // 1. If we have global pending deposits, they are the source of truth
      pds.forEach(pd => {
        slips.push({
          id: pd.id,
          amount: pd.amount,
          date: pd.date,
          label: pd.status === 'cleared' ? 'بیعانه تسویه شده (قطعی)' : 'بیعانه ثبت‌شده دستی فاکتور',
          isPending: pd.status === 'pending',
          isCleared: pd.status === 'cleared'
        });
      });
    } else {
      // 2. Fallback to invoice's own paymentSlips/deposit (for legacy or direct entries)
      if (inv.paymentSlips && inv.paymentSlips.length > 0) {
        let accumulatedCleared = 0;
        const currentCleared = inv.deposit || 0;
        inv.paymentSlips.forEach((slip, idx) => {
          const isCleared = (accumulatedCleared + slip.amount) <= currentCleared;
          if (isCleared) {
            accumulatedCleared += slip.amount;
          }
          slips.push({
            id: slip.id || `slip-${inv.id}-${idx}`,
            amount: slip.amount,
            date: slip.date,
            time: slip.time,
            label: slip.imageName || `بیعانه ثبت‌شده شماره ${idx + 1}`,
            isPending: !isCleared,
            isCleared: isCleared
          });
        });
      } else if (inv.deposit && inv.deposit > 0) {
        slips.push({
          id: `base-deposit-${inv.id}`,
          amount: inv.deposit,
          date: inv.date || '',
          label: 'بیعانه ثبت‌شده',
          isPending: false,
          isCleared: true
        });
      }
    }
    
    return slips;
  };
  const [uploadedList, setUploadedList] = useState<BankTransaction[]>([]);

  // Load uploaded statements from MySQL on mount and clean up local/session storage
  useEffect(() => {
    try {
      localStorage.removeItem('acc_app_uploaded_bank_statements');
      sessionStorage.removeItem('acc_app_uploaded_bank_statements');
    } catch (_) {}

    const loadStatements = async () => {
      try {
        const res = await fetch('/api/db/load-key?key=acc_app_uploaded_bank_statements');
        if (res.ok) {
          const json = await res.json();
          if (json && json.status === 'success' && Array.isArray(json.data)) {
            setUploadedList(json.data);
          }
        }
      } catch (_) {}
    };
    loadStatements();
  }, []);
  const [activeTab, setActiveTab] = useState<'all' | 'deposits' | 'withdrawals'>('all');
  const [dateSortOrder, setDateSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showModal, setShowModal] = useState(false);
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null);
  const [selectedPendingDepositId, setSelectedPendingDepositId] = useState<string | null>(null);
  const [deleteConfirmTx, setDeleteConfirmTx] = useState<BankTransaction | null>(null);

  // 4 Tabs State for Registration Modal
  const [modalTab, setModalTab] = useState<'cost' | 'withdrawal' | 'fund' | 'loan'>('cost');

  // Tab 2 - Withdrawal states (Partner Withdrawal)
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');

  // Tab 3 - Fund / Transfer states
  const [transferToAccountId, setTransferToAccountId] = useState<string>('');

  // Tab 4 - Loan states
  const [loanSubTab, setLoanSubTab] = useState<'payout' | 'repayment'>('payout');
  const [selectedBorrowerId, setSelectedBorrowerId] = useState<string>('');
  const [isAddBorrowerOpen, setIsAddBorrowerOpen] = useState<boolean>(false);
  const [newBorrowerName, setNewBorrowerName] = useState<string>('');
  const [newBorrowerPhone, setNewBorrowerPhone] = useState<string>('');
  const [newBorrowerNationalId, setNewBorrowerNationalId] = useState<string>('');
  const [newBorrowerInitialDebt, setNewBorrowerInitialDebt] = useState<string>('');

  // Quick Add Borrower Handler
  const handleQuickAddBorrower = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newBorrowerName.trim();
    if (!trimmedName) {
      alert('لطفاً نام وام‌گیرنده را وارد کنید.');
      return;
    }
    const newId = `borrower-${Date.now()}`;
    const newBorrower: LoanBorrower = {
      id: newId,
      name: trimmedName,
      phone: newBorrowerPhone.trim() || undefined,
      nationalId: newBorrowerNationalId.trim() || undefined,
      initialDebt: parseFloat(toEnglishDigits(newBorrowerInitialDebt)) || 0,
      createdAt: new Date().toLocaleDateString('fa-IR'),
      createdBy: currentUser?.name || 'مدیر'
    };
    const updated = [...loanBorrowers, newBorrower];
    if (onUpdateLoanBorrowers) {
      onUpdateLoanBorrowers(updated);
    }
    saveGenericKeyToDb('acc_app_loanBorrowers', updated);
    setSelectedBorrowerId(newId);
    setIsAddBorrowerOpen(false);
    setNewBorrowerName('');
    setNewBorrowerPhone('');
    setNewBorrowerNationalId('');
    setNewBorrowerInitialDebt('');
    setSuccessMsg(`وام‌گیرنده جدید «${trimmedName}» با موفقیت افزوده و انتخاب شد.`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Batch Deletion States
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  // Visible Accounts for bank statements view (in-memory state)
  const [visibleAccountIds, setVisibleAccountIds] = useState<string[]>(() => {
    return accounts.map(a => a.id);
  });

  // Selected Chest / Bank account for uploading
  const [selectedUploadAccountId, setSelectedUploadAccountId] = useState<string>(() => {
    return accounts[0]?.id || '';
  });

  // Highlight warning state when user tries to upload without selecting account
  const [accountSelectError, setAccountSelectError] = useState(false);

  // Manage accounts modal state
  const [showManageAccountsModal, setShowManageAccountsModal] = useState(false);
  const [accountSearchQuery, setAccountSearchQuery] = useState('');

  // Synchronize accounts if visibleAccountIds is empty
  useEffect(() => {
    if (accounts.length > 0 && visibleAccountIds.length === 0) {
      setVisibleAccountIds(accounts.map(a => a.id));
    }
  }, [accounts]);

  // Filtered visible accounts
  const visibleAccounts = useMemo(() => {
    return accounts.filter(acc => visibleAccountIds.includes(acc.id));
  }, [accounts, visibleAccountIds]);

  // Handle toggling visibility of an account from management modal
  const handleToggleAccountVisibility = (accountId: string) => {
    setVisibleAccountIds(prev => {
      if (prev.includes(accountId)) {
        const next = prev.filter(id => id !== accountId);
        if (selectedUploadAccountId === accountId) {
          const remaining = accounts.filter(a => next.includes(a.id));
          setSelectedUploadAccountId(remaining[0]?.id || '');
        }
        return next;
      } else {
        return [...prev, accountId];
      }
    });
  };

  // Quick hide from the visible list (without deleting the actual account)
  const handleHideAccountFromList = (e: React.MouseEvent, accountId: string) => {
    e.stopPropagation();
    const acc = accounts.find(a => a.id === accountId);
    setVisibleAccountIds(prev => {
      const next = prev.filter(id => id !== accountId);
      if (selectedUploadAccountId === accountId) {
        const remaining = accounts.filter(a => next.includes(a.id));
        setSelectedUploadAccountId(remaining[0]?.id || '');
      }
      return next;
    });
    setSuccessMsg(`حساب «${acc?.name || 'مورد نظر'}» از فهرست نمایش مغایرت‌گیری برداشته شد (بدون تغییر در اصل حساب).`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleSelectAccountForUpload = (accountId: string) => {
    setSelectedUploadAccountId(accountId);
    setAccountSelectError(false);
  };

  useEffect(() => {
    saveGenericKeyToDb('acc_app_uploaded_bank_statements', uploadedList);
  }, [uploadedList]);

  // Sync uploadedList if updated externally (e.g. when transaction/doc is deleted in TransactionsManual)
  useEffect(() => {
    const handleStatementsUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setUploadedList(e.detail);
      }
    };
    window.addEventListener('fahamacc-uploaded-statements-updated', handleStatementsUpdate);
    return () => window.removeEventListener('fahamacc-uploaded-statements-updated', handleStatementsUpdate);
  }, []);
  
  // Registration Form State
  const [parentCat, setParentCat] = useState('');
  const [childCat, setChildCat] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [userDesc, setUserDesc] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invoice attachment states
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [allocatedAmounts, setAllocatedAmounts] = useState<Record<string, number>>({});
  const [isMultiSettlement, setIsMultiSettlement] = useState(false);
  const [activeInvoiceIndex, setActiveInvoiceIndex] = useState(-1);
  const [selectedInvoiceForDepositDetails, setSelectedInvoiceForDepositDetails] = useState<Invoice | null>(null);

  // Fee / Expense Category Configuration (Persisted in MySQL via API)
  const [feeConfig, setFeeConfig] = useState<FeeCategoryConfig>({
    parentCategory: 'هزینه‌های مالی و بانکی',
    subCategory: 'کارمزد خدمات بانکی',
    defaultTitle: 'کارمزد و هزینه کسر شده از تراکنش بانکی'
  });

  const [showFeeCategoryModal, setShowFeeCategoryModal] = useState(false);
  const [tempFeeConfig, setTempFeeConfig] = useState<FeeCategoryConfig>(feeConfig);

  // Load feeConfig from MySQL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('acc_app_bank_statement_fee_category');
        localStorage.removeItem('bank_statement_fee_category');
      } catch (_) {}
    }

    const loadFeeConfig = async () => {
      try {
        const res = await fetch('/api/db/load-key?key=bank_statement_fee_category');
        if (res.ok) {
          const json = await res.json();
          if (json && json.status === 'success' && json.data && json.data.subCategory) {
            setFeeConfig(json.data);
            setTempFeeConfig(json.data);
          }
        }
      } catch (_) {}
    };
    loadFeeConfig();
  }, []);

  // Persist feeConfig to MySQL
  useEffect(() => {
    saveGenericKeyToDb('bank_statement_fee_category', feeConfig);
  }, [feeConfig]);

  // Separate Fee / Expense Amount state in Registration Modal
  const [separateFeeAmount, setSeparateFeeAmount] = useState<string>('');

  const numSeparateFee = useMemo(() => {
    if (!separateFeeAmount) return 0;
    const num = parseFloat(toEnglishDigits(separateFeeAmount));
    return isNaN(num) || num < 0 ? 0 : num;
  }, [separateFeeAmount]);

  const netTxAmount = useMemo(() => {
    if (!selectedTx) return 0;
    return Math.max(0, selectedTx.amount - numSeparateFee);
  }, [selectedTx, numSeparateFee]);

  // Reset keyboard index on search query change
  useEffect(() => {
    setActiveInvoiceIndex(-1);
  }, [invoiceSearchQuery]);

  // Reset selected pending deposit ID on transaction selection change
  useEffect(() => {
    setSelectedPendingDepositId(null);
  }, [selectedTx]);

  // Download Sample Excel file
  const handleDownloadSample = () => {
    downloadBankStatementTemplate();
  };

  // Duplicate Transactions Handling Modal State
  const [duplicateModalData, setDuplicateModalData] = useState<{
    newDuplicateItems: BankTransaction[];
    newNonDuplicateItems: BankTransaction[];
    allNewItems: BankTransaction[];
    matchingExistingUploadedIds: string[];
  } | null>(null);

  // Helper to sort transaction lists by date & time
  const sortTransactionList = (list: BankTransaction[], sortOrder: 'desc' | 'asc') => {
    list.sort((a, b) => {
      const normDateA = normalizeDateStr(a.date);
      const normDateB = normalizeDateStr(b.date);
      const dateCompare = sortOrder === 'desc' 
        ? normDateB.localeCompare(normDateA) 
        : normDateA.localeCompare(normDateB);
      if (dateCompare !== 0) return dateCompare;

      const normTimeA = normalizeTimeStr(a.time);
      const normTimeB = normalizeTimeStr(b.time);
      const timeCompare = sortOrder === 'desc' 
        ? normTimeB.localeCompare(normTimeA) 
        : normTimeA.localeCompare(normTimeB);
      if (timeCompare !== 0) return timeCompare;

      return b.id.localeCompare(a.id);
    });
  };

  // Upload bank spreadsheet
  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedUploadAccountId) {
      setAccountSelectError(true);
      alert('⚠️ لطفاً پیش از بارگذاری فایل اکسل، ابتدا یکی از صندوق‌ها یا حساب‌های بانکی را از لیست بالا انتخاب فرمایید.');
      e.target.value = '';
      return;
    }

    try {
      const parsedRows = await parseBankStatementExcel(file);
      if (!parsedRows || parsedRows.length === 0) {
        alert('فایل اکسل تهی است یا ساختار آن معتبر نمی‌باشد.');
        e.target.value = '';
        return;
      }

      const newDuplicateItems: BankTransaction[] = [];
      const newNonDuplicateItems: BankTransaction[] = [];
      const allNewItems: BankTransaction[] = [];
      const matchingExistingUploadedIdsSet = new Set<string>();

      parsedRows.forEach((row, idx) => {
        const normDate = normalizeDateStr(row.date);
        const normTime = normalizeTimeStr(row.time);

        // Advanced Multi-Vector Duplicate Check:
        // 1. Check against existing registered transactions
        const dupCheckRegistered = matchTransactionDuplicate(
          {
            date: normDate,
            time: normTime,
            amount: row.amount,
            type: row.type,
            description: row.description,
            trackingNumber: row.trackingNumber,
            referenceCode: row.referenceCode,
            accountId: selectedUploadAccountId || undefined
          },
          transactions
        );

        // 2. Check against uploadedList (previously imported but unfinalized)
        const dupCheckUploaded = matchTransactionDuplicate(
          {
            date: normDate,
            time: normTime,
            amount: row.amount,
            type: row.type,
            description: row.description,
            trackingNumber: row.trackingNumber,
            referenceCode: row.referenceCode,
            accountId: selectedUploadAccountId || undefined
          },
          uploadedList
        );

        // 3. Internal duplicate check within the currently parsed excel file
        const internalDuplicate = listHasInternalDuplicate(parsedRows, row, idx);

        const isDup = dupCheckRegistered.isDuplicate || dupCheckUploaded.isDuplicate || internalDuplicate.isDuplicate;
        const dupReason = dupCheckRegistered.reason || dupCheckUploaded.reason || internalDuplicate.reason;

        if (dupCheckUploaded.matchedTx) {
          matchingExistingUploadedIdsSet.add(dupCheckUploaded.matchedTx.id);
        }

        const txItem: BankTransaction = {
          id: `tx-uploaded-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          date: normDate,
          time: normTime,
          amount: row.amount,
          type: row.type,
          description: row.description,
          trackingNumber: row.trackingNumber,
          referenceCode: row.referenceCode,
          isRegistered: false,
          isDuplicate: isDup,
          duplicateReason: dupReason,
          accountId: selectedUploadAccountId || undefined
        };

        allNewItems.push(txItem);
        if (isDup) {
          newDuplicateItems.push(txItem);
        } else {
          newNonDuplicateItems.push(txItem);
        }
      });

      // Clear input so file can be chosen again
      e.target.value = '';

      if (newDuplicateItems.length > 0) {
        // Show duplicate handling modal
        setDuplicateModalData({
          newDuplicateItems,
          newNonDuplicateItems,
          allNewItems,
          matchingExistingUploadedIds: Array.from(matchingExistingUploadedIdsSet)
        });
      } else {
        // No duplicates: append all items
        const updatedList = [...uploadedList, ...allNewItems];
        sortTransactionList(updatedList, dateSortOrder);

        setUploadedList(updatedList);
        setSuccessMsg(`تعداد ${toPersianDigits(allNewItems.length)} تراکنش با موفقیت بارگذاری و به لیست اضافه شد.`);
        setTimeout(() => setSuccessMsg(null), 6000);
      }
    } catch (err) {
      alert('خطا در بارگذاری فایل. لطفاً از فایل نمونه اکسل استفاده نمائید.');
      e.target.value = '';
    }
  };

  // Option 1: Replace duplicates
  const handleDuplicateReplace = () => {
    if (!duplicateModalData) return;
    const { allNewItems, matchingExistingUploadedIds, newDuplicateItems } = duplicateModalData;

    const itemsToInsert = allNewItems.map(item => ({ ...item, isDuplicate: false }));
    const filteredUploaded = uploadedList.filter(
      item => !matchingExistingUploadedIds.includes(item.id)
    );

    const updatedList = [...filteredUploaded, ...itemsToInsert];
    sortTransactionList(updatedList, dateSortOrder);

    setUploadedList(updatedList);
    setDuplicateModalData(null);
    setSuccessMsg(`تراکنش‌های تکراری با موفقیت جایگزین شدند و تعداد ${toPersianDigits(allNewItems.length)} تراکنش به لیست ثبت گردید.`);
    setTimeout(() => setSuccessMsg(null), 6000);
  };

  // Option 2: Add duplicates alongside existing
  const handleDuplicateAdd = () => {
    if (!duplicateModalData) return;
    const { allNewItems } = duplicateModalData;

    const updatedList = [...uploadedList, ...allNewItems];
    sortTransactionList(updatedList, dateSortOrder);

    setUploadedList(updatedList);
    setDuplicateModalData(null);
    setSuccessMsg(`تعداد ${toPersianDigits(allNewItems.length)} تراکنش جدید در کنار تراکنش‌های قبلی اضافه شدند.`);
    setTimeout(() => setSuccessMsg(null), 6000);
  };

  // Option 3: Cancel duplicate import
  const handleDuplicateCancel = () => {
    if (!duplicateModalData) return;
    const { newNonDuplicateItems } = duplicateModalData;

    if (newNonDuplicateItems.length > 0) {
      const updatedList = [...uploadedList, ...newNonDuplicateItems];
      sortTransactionList(updatedList, dateSortOrder);

      setUploadedList(updatedList);
      setSuccessMsg(`بارگذاری تراکنش‌های تکراری لغو گردید و ${toPersianDigits(newNonDuplicateItems.length)} تراکنش غیرتکراری به لیست اضافه شد.`);
    } else {
      setSuccessMsg(`بارگذاری تراکنش‌های تکراری لغو گردید.`);
    }

    setDuplicateModalData(null);
    setTimeout(() => setSuccessMsg(null), 6000);
  };

  const listHasInternalDuplicate = (arr: any[], current: any, selfIdx: number): { isDuplicate: boolean; reason?: string } => {
    for (let idx = 0; idx < selfIdx; idx++) {
      const item = arr[idx];
      if (item.amount === current.amount && item.type === current.type) {
        const sameDate = normalizeDateStr(item.date) === normalizeDateStr(current.date);
        const sameTime = normalizeTimeStr(item.time) !== '00:00' && normalizeTimeStr(item.time) === normalizeTimeStr(current.time);
        const hasSameTrack = current.trackingNumber && item.trackingNumber && current.trackingNumber === item.trackingNumber;

        if (hasSameTrack) {
          return {
            isDuplicate: true,
            reason: `تکرار شماره پیگیری (${current.trackingNumber}) در همین فایل اکسل`
          };
        }

        if (sameDate && sameTime) {
          return {
            isDuplicate: true,
            reason: `تکرار ردیف با تاریخ (${current.date})، ساعت (${current.time}) و مبلغ یکسان در خود فایل`
          };
        }
      }
    }
    return { isDuplicate: false };
  };

  // Filter & sort open invoices for the modal
  const filteredModalInvoices = React.useMemo(() => {
    if (!selectedTx) return [];
    
    // Get relevant open invoices (Deposit -> Sales; Withdrawal -> Purchases)
    let list = invoices.filter(inv => {
      if (inv.isDeleted || inv.isProforma) return false;
      const { remaining } = getInvoiceDepositAndRemaining(inv);
      const isRightType = selectedTx.type === 'deposit' ? inv.type === 'sale' : inv.type === 'purchase';
      return (remaining > 0 || (inv.paymentAmount && inv.paymentAmount > 0)) && isRightType;
    });
    
    // Search query filter: counterpartName, counterpartPhone, invoiceNumber
    if (invoiceSearchQuery.trim() !== '') {
      const q = invoiceSearchQuery.toLowerCase();
      list = list.filter(inv => 
         inv.counterpartName.toLowerCase().includes(q) ||
        (inv.counterpartPhone && inv.counterpartPhone.includes(q)) ||
        inv.invoiceNumber.toLowerCase().includes(q)
      );
    }
    
    // Smart Match sort: exact amount match (considering netTxAmount, remaining, or deposit) goes first!
    list = [...list].sort((a, b) => {
      const { remaining: aRemaining, deposit: aDeposit } = getInvoiceDepositAndRemaining(a);
      const { remaining: bRemaining, deposit: bDeposit } = getInvoiceDepositAndRemaining(b);

      const aMatch = (
        aRemaining === netTxAmount || 
        aRemaining === selectedTx.amount || 
        a.paymentAmount === netTxAmount || 
        a.paymentAmount === selectedTx.amount ||
        (aDeposit > 0 && (aDeposit === netTxAmount || aDeposit === selectedTx.amount)) ||
        a.totalAmount === netTxAmount ||
        a.totalAmount === selectedTx.amount
      ) ? 1 : 0;

      const bMatch = (
        bRemaining === netTxAmount || 
        bRemaining === selectedTx.amount || 
        b.paymentAmount === netTxAmount || 
        b.paymentAmount === selectedTx.amount ||
        (bDeposit > 0 && (bDeposit === netTxAmount || bDeposit === selectedTx.amount)) ||
        b.totalAmount === netTxAmount ||
        b.totalAmount === selectedTx.amount
      ) ? 1 : 0;

      return bMatch - aMatch;
    });
    
    return list;
  }, [invoices, selectedTx, invoiceSearchQuery, netTxAmount]);

  // Toggle selection of an invoice
  const handleToggleSelectInvoice = (id: string) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv || !selectedTx) return;

    const { remaining } = getInvoiceDepositAndRemaining(inv);

    if (isMultiSettlement) {
      if (selectedInvoiceIds.includes(id)) {
        // Uncheck
        setSelectedInvoiceIds(prev => prev.filter(x => x !== id));
        setAllocatedAmounts(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } else {
        // Check
        const effectiveTxAmount = netTxAmount > 0 ? netTxAmount : selectedTx.amount;
        const allocatedTotal = (Object.values(allocatedAmounts) as number[]).reduce((sum, val) => sum + val, 0);
        const remainingToAllocate = Math.max(0, effectiveTxAmount - allocatedTotal);
        const allocation = Math.min(remainingToAllocate, remaining > 0 ? remaining : remainingToAllocate);
        
        setSelectedInvoiceIds(prev => [...prev, id]);
        setAllocatedAmounts(prev => ({
          ...prev,
          [id]: allocation
        }));
      }
    } else {
      // Single selection mode
      if (selectedInvoiceIds.includes(id)) {
        setSelectedInvoiceIds([]);
        setAllocatedAmounts({});
        setSelectedPendingDepositId(null);
      } else {
        const effectiveTxAmount = netTxAmount > 0 ? netTxAmount : selectedTx.amount;
        const allocation = Math.min(effectiveTxAmount, remaining > 0 ? remaining : effectiveTxAmount);
        setSelectedInvoiceIds([id]);
        setAllocatedAmounts({ [id]: allocation });
        
        // Auto pre-fill appropriate categories for settlement
        setParentCat(inv.type === 'sale' ? 'وصول مطالبات مشتریان' : 'پرداخت بدهی تامین‌کنندگان');
        setChildCat(inv.type === 'sale' ? 'وصول فاکتور فروش' : 'تسویه فاکتور خرید');

        // If this invoice has pending deposits, auto-select a matching pending deposit
        const slips = getAllInvoiceDeposits(inv);
        const matchingPending = slips.find(s => s.isPending && (s.amount === allocation || s.amount === effectiveTxAmount || s.amount === selectedTx.amount));
        if (matchingPending) {
          setSelectedPendingDepositId(matchingPending.id);
        }
      }
    }
  };

  // Trigger click to map transaction
  const handleOpenRegister = (tx: BankTransaction) => {
    setSelectedTx(tx);
    setModalTab('cost');
    setParentCat(categories[0]?.name || 'هزینه‌های جاری و اداری');
    setChildCat(categories[0]?.subcategories[0] || 'سایر هزینه‌ها');
    setSeparateFeeAmount('');
    
    // Auto-select the bank account/fund: check if tx has accountId, otherwise use selectedUploadAccountId or first available account
    const defaultAccId = tx.accountId || (selectedUploadAccountId && accounts.some(a => a.id === selectedUploadAccountId) ? selectedUploadAccountId : (accounts[0]?.id || ''));
    setSelectedAccount(defaultAccId);

    // Default transfer destination to another account
    const otherAcc = accounts.find(a => a.id !== defaultAccId);
    setTransferToAccountId(otherAcc ? otherAcc.id : (accounts[0]?.id || ''));

    // Default partner withdrawal options
    setSelectedPartnerId(partners[0]?.id || '');

    // Default loan settings
    setLoanSubTab(tx.type === 'withdrawal' ? 'payout' : 'repayment');
    setSelectedBorrowerId(loanBorrowers[0]?.id || '');
    setIsAddBorrowerOpen(false);
    
    setUserDesc(tx.description);
    setShowModal(true);

    // Reset invoice selection states
    setInvoiceSearchQuery('');
    setIsMultiSettlement(false);
    setActiveInvoiceIndex(-1);

    // Auto-match exact amount!
    const relevantInvoices = invoices.filter(inv => {
      if (inv.isDeleted || inv.isProforma) return false;
      const { remaining } = getInvoiceDepositAndRemaining(inv);
      const isRightType = tx.type === 'deposit' ? inv.type === 'sale' : inv.type === 'purchase';
      return (remaining > 0 || (inv.paymentAmount && inv.paymentAmount > 0)) && isRightType;
    });
    // No option is checked by default as requested by the user
    setSelectedInvoiceIds([]);
    setAllocatedAmounts({});
    
    // Auto-set matching category if there's a matching invoice to make it easy to select
    const exactMatch = relevantInvoices.find(inv => {
      const { remaining, deposit } = getInvoiceDepositAndRemaining(inv);
      return remaining === tx.amount || inv.paymentAmount === tx.amount || (deposit > 0 && deposit === tx.amount) || inv.totalAmount === tx.amount;
    });
    if (exactMatch) {
      setParentCat(exactMatch.type === 'sale' ? 'وصول مطالبات مشتریان' : 'پرداخت بدهی تامین‌کنندگان');
      setChildCat(exactMatch.type === 'sale' ? 'وصول فاکتور فروش' : 'تسویه فاکتور خرید');
    }
  };

  const handleConfirmRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTx) return;

    const numFee = Math.max(0, parseFloat(toEnglishDigits(separateFeeAmount)) || 0);
    if (numFee > selectedTx.amount) {
      alert(`مبلغ هزینه/کارمزد جداگانه (${formatCurrency(numFee)}) نمی‌تواند بیشتر از کل مبلغ تراکنش (${formatCurrency(selectedTx.amount)}) باشد.`);
      return;
    }

    const mainAmount = selectedTx.amount - numFee;

    // Handle invoice settlements if any selected
    if (selectedInvoiceIds.length > 0) {
      const totalAllocated = (Object.values(allocatedAmounts) as number[]).reduce((sum, val) => sum + val, 0);
      if (totalAllocated > mainAmount) {
        alert(`مبلغ تخصیص داده شده (${formatCurrency(totalAllocated)}) نمی‌تواند بیشتر از مبلغ خالص تراکنش (${formatCurrency(mainAmount)}) باشد.`);
        return;
      }

      let nextPendingDeposits = pendingDeposits ? [...pendingDeposits] : [];
      let pendingDepositsUpdated = false;

      if (onUpdateInvoices) {
        const updatedInvoices = invoices.map(inv => {
          if (selectedInvoiceIds.includes(inv.id)) {
            const alloc = allocatedAmounts[inv.id] || 0;
            if (alloc > 0) {
              const grossTotal = (inv.items && inv.items.length > 0)
                ? inv.items.reduce((s, it) => s + (it.totalPrice || 0), 0) + (inv.tax || 0) - (inv.discount || 0)
                : inv.totalAmount;
              const prevDeposit = inv.deposit || 0;
              let newDeposit = prevDeposit;
              
              // Find matching pending deposit (selected pending deposit is prioritized first, fallback to exact amount, then first pending)
              let matchingPd = selectedPendingDepositId 
                ? nextPendingDeposits.find(p => p.id === selectedPendingDepositId && (p.invoiceId === inv.id || String(p.invoiceNumber) === String(inv.invoiceNumber)) && p.status === 'pending')
                : undefined;
              
              if (!matchingPd) {
                matchingPd = nextPendingDeposits.find(p => 
                  (p.invoiceId === inv.id || String(p.invoiceNumber) === String(inv.invoiceNumber)) && 
                  p.status === 'pending' && 
                  (p.amount === alloc || p.amount === selectedTx.amount || p.amount === netTxAmount)
                );
              }
              if (!matchingPd) {
                matchingPd = nextPendingDeposits.find(p => 
                  (p.invoiceId === inv.id || String(p.invoiceNumber) === String(inv.invoiceNumber)) && 
                  p.status === 'pending'
                );
              }

              if (matchingPd) {
                nextPendingDeposits = nextPendingDeposits.map(p => 
                  p.id === matchingPd!.id ? { ...p, status: 'cleared' as const, clearedTxId: selectedTx.id, clearedDate: selectedTx.date } : p
                );
                pendingDepositsUpdated = true;
                const coveredPending = Math.min(alloc, matchingPd.amount);
                const additionalPayment = Math.max(0, alloc - coveredPending);
                newDeposit = prevDeposit + additionalPayment;
              } else {
                // Check if there are any open pending deposits for this invoice that were already included in inv.deposit
                const openPds = nextPendingDeposits.filter(p => 
                  (p.invoiceId === inv.id || String(p.invoiceNumber) === String(inv.invoiceNumber)) && 
                  p.status === 'pending'
                );
                const openPdSum = openPds.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                if (openPdSum > 0) {
                  let remainingAlloc = alloc;
                  nextPendingDeposits = nextPendingDeposits.map(p => {
                    if (remainingAlloc > 0 && (p.invoiceId === inv.id || String(p.invoiceNumber) === String(inv.invoiceNumber)) && p.status === 'pending') {
                      remainingAlloc -= p.amount;
                      return { ...p, status: 'cleared' as const, clearedTxId: selectedTx.id, clearedDate: selectedTx.date };
                    }
                    return p;
                  });
                  pendingDepositsUpdated = true;
                  const coveredPending = Math.min(alloc, openPdSum);
                  const additionalPayment = Math.max(0, alloc - coveredPending);
                  newDeposit = prevDeposit + additionalPayment;
                } else {
                  newDeposit = prevDeposit + alloc;
                }
              }

              return {
                ...inv,
                totalAmount: grossTotal,
                deposit: newDeposit,
                description: inv.description + `\n[ثبت تسویه نیمه خودکار از تراکنش صورتحساب بانکی به مبلغ ${formatCurrency(alloc)} در تاریخ ${selectedTx.date}]`
              };
            }
          }
          return inv;
        });
        onUpdateInvoices(updatedInvoices);

        if (pendingDepositsUpdated && onUpdatePendingDeposits) {
          onUpdatePendingDeposits(nextPendingDeposits);
        }
      }
    }

    // Build description including matched invoices
    let matchDesc = '';
    if (selectedInvoiceIds.length > 0) {
      const matchedNums = selectedInvoiceIds.map(id => {
        const inv = invoices.find(i => i.id === id);
        return inv ? `#${inv.invoiceNumber}` : '';
      }).filter(Boolean).join('، ');
      matchDesc = ` (تسویه فاکتورهای ${matchedNums})`;
    }

    // Fee transaction if separate fee amount is entered
    const feeTx: BankTransaction | null = numFee > 0 ? {
      id: `tx-fee-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      date: selectedTx.date,
      time: selectedTx.time,
      amount: numFee,
      type: 'withdrawal',
      description: `کارمزد و هزینه کسر شده از تراکنش بانکی (${selectedTx.description || 'صورتحساب'})`,
      isRegistered: true,
      accountId: selectedAccount,
      categoryParent: feeConfig.parentCategory || 'هزینه‌های مالی و بانکی',
      categoryChild: feeConfig.subCategory || 'کارمزد خدمات بانکی',
      userDescription: feeConfig.defaultTitle || `کارمزد و هزینه تراکنش ${selectedTx.date}`,
      registeredDate: new Date().toLocaleDateString('fa-IR'),
      isDuplicate: false
    } : null;

    const attachedInvoiceId = selectedInvoiceIds.length === 1 
      ? selectedInvoiceIds[0] 
      : (selectedInvoiceIds.length > 1 ? selectedInvoiceIds.join(',') : undefined);
    const attachedPendingDepositId = selectedPendingDepositId || undefined;

    if (modalTab === 'cost' || selectedTx.type === 'deposit') {
      const mappedMainTx: BankTransaction = {
        ...selectedTx,
        amount: mainAmount,
        isRegistered: true,
        accountId: selectedAccount,
        invoiceId: attachedInvoiceId,
        pendingDepositId: attachedPendingDepositId,
        categoryParent: selectedTx.type === 'deposit' ? 'اسناد دریافتنی بانکی' : parentCat,
        categoryChild: selectedTx.type === 'deposit' ? 'وصول یا واریز مستقیم' : childCat,
        userDescription: userDesc ? `${userDesc}${matchDesc}` : `${selectedTx.description || ''}${matchDesc}`,
        registeredDate: new Date().toLocaleDateString('fa-IR'),
        isDuplicate: false
      };

      if (feeTx) {
        onRegisterTransaction([mappedMainTx, feeTx]);
        setSuccessMsg(`تراکنش هزینه به مبلغ خالص ${formatCurrency(mainAmount)} و سند هزینه جداگانه به مبلغ ${formatCurrency(numFee)} (${feeConfig.subCategory}) با موفقیت ثبت شدند.`);
      } else {
        onRegisterTransaction(mappedMainTx);
        setSuccessMsg(`سند هزینه به مبلغ ${formatCurrency(mainAmount)} با موفقیت ثبت گردید.`);
      }
    } else if (modalTab === 'withdrawal') {
      const partner = partners.find(p => p.id === selectedPartnerId) || partners[0];
      const partnerName = partner ? partner.name : 'شریک';
      const finalChild = partner ? `برداشت شریک: ${partner.name}` : 'برداشت شرکا';

      const mappedMainTx: BankTransaction = {
        ...selectedTx,
        amount: mainAmount,
        type: 'withdrawal',
        isRegistered: true,
        accountId: selectedAccount,
        categoryParent: 'برداشت شرکا',
        categoryChild: finalChild,
        partnerId: partner ? partner.id : undefined,
        userDescription: userDesc ? `${userDesc}${matchDesc}` : `برداشت شریک (${partnerName})${matchDesc}`,
        registeredDate: new Date().toLocaleDateString('fa-IR'),
        isDuplicate: false
      };

      if (feeTx) {
        onRegisterTransaction([mappedMainTx, feeTx]);
        setSuccessMsg(`سند برداشت شریک «${partnerName}» به مبلغ خالص ${formatCurrency(mainAmount)} و کارمزد ${formatCurrency(numFee)} با موفقیت ثبت شدند.`);
      } else {
        onRegisterTransaction(mappedMainTx);
        setSuccessMsg(`سند برداشت شریک «${partnerName}» به مبلغ ${formatCurrency(mainAmount)} با موفقیت ثبت شد.`);
      }
    } else if (modalTab === 'fund') {
      if (!transferToAccountId || transferToAccountId === selectedAccount) {
        alert('لطفاً صندوق یا حساب مقصد متفاوتی را انتخاب فرمایید.');
        return;
      }
      const fromAcc = accounts.find(a => a.id === selectedAccount);
      const toAcc = accounts.find(a => a.id === transferToAccountId);
      const fromName = fromAcc?.name || 'صندوق مبدا';
      const toName = toAcc?.name || 'صندوق مقصد';

      const txWithdrawal: BankTransaction = {
        ...selectedTx,
        id: selectedTx.id,
        amount: mainAmount,
        type: 'withdrawal',
        accountId: selectedAccount,
        description: userDesc || `انتقال داخلی وجه از "${fromName}" به "${toName}"`,
        isRegistered: true,
        categoryParent: 'انتقال داخلی بین حساب‌ها',
        categoryChild: `برداشت از ${fromName} جهت انتقال به ${toName}`,
        userDescription: userDesc ? `${userDesc}${matchDesc}` : `انتقال داخلی وجه از "${fromName}" به "${toName}"${matchDesc}`,
        registeredDate: new Date().toLocaleDateString('fa-IR'),
        isDuplicate: false
      };

      const txDeposit: BankTransaction = {
        id: `tx-transfer-deposit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        date: selectedTx.date,
        time: selectedTx.time,
        amount: mainAmount,
        type: 'deposit',
        accountId: transferToAccountId,
        description: userDesc || `واریز انتقالی از "${fromName}" به "${toName}"`,
        isRegistered: true,
        categoryParent: 'انتقال داخلی بین حساب‌ها',
        categoryChild: `واریز به ${toName} از ${fromName}`,
        userDescription: userDesc ? `${userDesc}${matchDesc}` : `دریافت انتقالی از ${fromName}${matchDesc}`,
        registeredDate: new Date().toLocaleDateString('fa-IR'),
        isDuplicate: false
      };

      const txsToRegister = feeTx ? [txWithdrawal, txDeposit, feeTx] : [txWithdrawal, txDeposit];
      onRegisterTransaction(txsToRegister);
      setSuccessMsg(`انتقال داخلی وجه به مبلغ ${formatCurrency(mainAmount)} از «${fromName}» به «${toName}» با موفقیت ثبت شد.`);
    } else if (modalTab === 'loan') {
      if (!selectedBorrowerId) {
        alert('لطفاً وام‌گیرنده را از لیست انتخاب فرمایید یا متقاضی جدید ایجاد کنید.');
        return;
      }
      const borrower = loanBorrowers.find(b => b.id === selectedBorrowerId);
      if (!borrower) {
        alert('وام‌گیرنده انتخاب شده در لیست یافت نشد.');
        return;
      }
      const isPayout = loanSubTab === 'payout';

      const mappedMainTx: BankTransaction = {
        ...selectedTx,
        amount: mainAmount,
        type: isPayout ? 'withdrawal' : 'deposit',
        isRegistered: true,
        accountId: selectedAccount,
        description: userDesc || (isPayout ? `پرداخت وام به ${borrower.name}` : `تسویه حساب وام توسط ${borrower.name}`),
        categoryParent: 'مدیریت وام‌ها',
        categoryChild: isPayout ? 'پرداخت وام' : 'تسویه حساب وام',
        userDescription: userDesc ? `${userDesc}${matchDesc}` : `${isPayout ? 'پرداخت وام به' : 'تسویه وام توسط'} ${borrower.name}${matchDesc}`,
        registeredDate: new Date().toLocaleDateString('fa-IR'),
        borrowerId: borrower.id,
        borrowerName: borrower.name,
        loanType: isPayout ? 'payout' : 'repayment',
        isDuplicate: false
      };

      if (feeTx) {
        onRegisterTransaction([mappedMainTx, feeTx]);
        setSuccessMsg(`سند وام (${isPayout ? 'پرداخت' : 'بازپرداخت'}) به مبلغ ${formatCurrency(mainAmount)} و کارمزد ${formatCurrency(numFee)} ثبت شد.`);
      } else {
        onRegisterTransaction(mappedMainTx);
        setSuccessMsg(`تراکنش وام برای «${borrower.name}» به مبلغ ${formatCurrency(mainAmount)} با موفقیت ثبت شد.`);
      }
    }

    // Remove from temporary uploaded pending list
    setUploadedList(prev => prev.filter(item => item.id !== selectedTx.id));
    
    setShowModal(false);
    setSelectedTx(null);
    setSelectedInvoiceIds([]);
    setAllocatedAmounts({});
    setSeparateFeeAmount('');
    setSelectedPendingDepositId(null);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Filter & sort bank statement automatically by date
  const getFilteredList = (list: BankTransaction[]) => {
    if (activeTab === 'deposits') return list.filter(t => t.type === 'deposit');
    if (activeTab === 'withdrawals') return list.filter(t => t.type === 'withdrawal');
    return list;
  };

  const displayedList = React.useMemo(() => {
    const raw = [...getFilteredList(uploadedList), ...getFilteredList(transactions.filter(t => !t.isRegistered))];
    return raw.sort((a, b) => {
      const normDateA = normalizeDateStr(a.date);
      const normDateB = normalizeDateStr(b.date);
      const dateCompare = dateSortOrder === 'desc' 
        ? normDateB.localeCompare(normDateA) 
        : normDateA.localeCompare(normDateB);
      if (dateCompare !== 0) return dateCompare;

      const normTimeA = normalizeTimeStr(a.time);
      const normTimeB = normalizeTimeStr(b.time);
      const timeCompare = dateSortOrder === 'desc' 
        ? normTimeB.localeCompare(normTimeA) 
        : normTimeA.localeCompare(normTimeB);
      if (timeCompare !== 0) return timeCompare;

      return b.id.localeCompare(a.id);
    });
  }, [uploadedList, transactions, activeTab, dateSortOrder]);

  const registeredHistory = React.useMemo(() => {
    return transactions
      .filter(t => t.isRegistered)
      .sort((a, b) => {
        const normDateA = normalizeDateStr(a.date);
        const normDateB = normalizeDateStr(b.date);
        const dateCompare = normDateB.localeCompare(normDateA);
        if (dateCompare !== 0) return dateCompare;

        const normTimeA = normalizeTimeStr(a.time);
        const normTimeB = normalizeTimeStr(b.time);
        const timeCompare = normTimeB.localeCompare(normTimeA);
        if (timeCompare !== 0) return timeCompare;

        return b.id.localeCompare(a.id);
      });
  }, [transactions]);

  return (
    <div className="space-y-6">
      
      {/* Upload and Template Cards */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 space-y-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-5 gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">بارگذاری و مغایرت‌گیری بانکی</h2>
            <p className="text-slate-500 text-sm mt-1">خوانش هوشمند واریزها و برداشت‌ها و ثبت اتوماتیک اسناد</p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setTempFeeConfig(feeConfig);
                setShowFeeCategoryModal(true);
              }}
              className="flex items-center gap-2 text-xs bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200/90 py-2 px-3.5 rounded-xl cursor-pointer transition-colors font-medium"
              id="btn-manage-fee-category-top"
              title="تنظیم نوع و سرفصل هزینه / کارمزد کسر شده از تراکنش‌های بانکی"
            >
              <Tag className="w-4 h-4 text-amber-600" />
              <span>نوع هزینه/کارمزد ({feeConfig.subCategory || 'کارمزد بانکی'})</span>
            </button>

            <button
              onClick={() => setShowManageAccountsModal(true)}
              className="flex items-center gap-2 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 py-2 px-3.5 rounded-xl cursor-pointer transition-colors font-medium"
              id="btn-manage-visible-accounts"
              title="مدیریت و فیلتر صندوق‌ها و حساب‌های قابل نمایش در این بخش"
            >
              <Settings2 className="w-4 h-4 text-blue-600" />
              <span>مدیریت فهرست صندوق‌ها ({toPersianDigits(visibleAccounts.length)})</span>
            </button>

            <button
              onClick={handleDownloadSample}
              className="flex items-center gap-2 text-xs bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 py-2 px-4 rounded-xl cursor-pointer transition-colors"
              id="btn-download-statement-template"
            >
              <Download className="w-4 h-4" />
              <span>دانلود نمونه اکسل</span>
            </button>
          </div>
        </div>

        {successMsg && (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-sm font-medium animate-fade-in animate-duration-300">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>{successMsg}</div>
          </div>
        )}

        {/* 1. Chests & Bank Accounts Selection Chips (Compact & clean) */}
        <div className={`rounded-xl p-3.5 border transition-all duration-200 ${
          accountSelectError 
            ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-400/30' 
            : 'bg-slate-50/70 border-slate-200'
        }`}>
          <div className="flex items-center justify-between gap-3 mb-2.5 pb-2 border-b border-slate-200/70">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-xs text-slate-800">
                ۱. انتخاب صندوق یا حساب بانکی مقصد
              </span>
              <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded">
                الزامی
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTempFeeConfig(feeConfig);
                  setShowFeeCategoryModal(true);
                }}
                className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 hover:border-amber-300 transition-colors"
                id="btn-manage-fee-category"
                title="تنظیم نوع و سرفصل هزینه/کارمزد کسر شده از تراکنش‌های بانکی"
              >
                <Tag className="w-3.5 h-3.5 text-amber-600" />
                <span>نوع هزینه/کارمزد ({feeConfig.subCategory || 'کارمزد'})</span>
              </button>

              <button
                type="button"
                onClick={() => setShowManageAccountsModal(true)}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>مدیریت صندوق‌ها ({toPersianDigits(visibleAccounts.length)})</span>
              </button>
            </div>
          </div>

          {accountSelectError && (
            <div className="mb-2.5 bg-rose-100 text-rose-900 border border-rose-300 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>لطفاً روی یکی از صندوق‌های زیر کلیک کنید.</span>
            </div>
          )}

          {visibleAccounts.length === 0 ? (
            <div className="bg-white rounded-lg p-3 text-center border border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">هیچ صندوقی در لیست فعال نیست.</span>
              <button
                type="button"
                onClick={() => setVisibleAccountIds(accounts.map(a => a.id))}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
              >
                نمایش همه صندوق‌ها
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {visibleAccounts.map((acc) => {
                const isSelected = selectedUploadAccountId === acc.id;

                return (
                  <div
                    key={acc.id}
                    onClick={() => handleSelectAccountForUpload(acc.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'
                    }`}
                    title={`انتخاب ${acc.name}`}
                  >
                    <span className="truncate max-w-[180px]">{acc.name}</span>

                    {/* Quick hide icon */}
                    <button
                      type="button"
                      onClick={(e) => handleHideAccountFromList(e, acc.id)}
                      className={`p-0.5 rounded transition-colors ${
                        isSelected 
                          ? 'text-blue-200 hover:text-white hover:bg-blue-700' 
                          : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                      }`}
                      title="مخفی کردن از این لیست"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. File Upload Dropzone */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-2 border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer relative group transition-colors flex flex-col items-center justify-center min-h-[170px] ${
            !selectedUploadAccountId 
              ? 'border-slate-300 bg-slate-50/60 hover:border-amber-400 hover:bg-amber-50/20' 
              : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 bg-slate-50/50'
          }`}>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleUploadExcel}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              id="input-upload-statement"
            />
            <FileSpreadsheet className={`w-12 h-12 mb-3 group-hover:scale-110 transition-transform duration-200 ${
              selectedUploadAccountId ? 'text-blue-500' : 'text-slate-400'
            }`} />
            <h4 className="font-semibold text-slate-700 mb-1 text-sm">۲. بارگذاری فایل اکسل صورتحساب بانکی</h4>
            
            {selectedUploadAccountId ? (
              <div className="flex flex-col items-center gap-1 mt-1">
                <span className="text-xs text-slate-500">
                  فایل انتخابی برای صندوق/حساب <strong className="text-blue-700 font-black">«{accounts.find(a => a.id === selectedUploadAccountId)?.name}»</strong> ثبت و تطبیق خواهد شد.
                </span>
                <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full font-bold mt-1">
                  ✓ آماده دریافت فایل اکسل
                </span>
              </div>
            ) : (
              <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1 rounded-full mt-1">
                ⚠️ لطفاً ابتدا یکی از صندوق‌های بالا را انتخاب کنید
              </span>
            )}

            {uploadedList.length > 0 && (
              <span className="mt-3 text-[11px] font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                تعداد {toPersianDigits(uploadedList.length)} تراکنش معلق در لیست موجود است (امکان بارگذاری فایل جدید نیز فراهم است)
              </span>
            )}
          </div>

          <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-150 space-y-3 flex flex-col justify-between">
            <div>
              <h4 className="font-bold text-slate-700 text-sm mb-1.5 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-blue-600" />
                <span>راهنمای مغایرت‌گیری</span>
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                تراکنش‌های تکراری با بررسی تاریخ، ساعت و مبلغ شناسایی و با هشدار مشخص می‌شوند. پس از انتخاب صندوق، مبالغ واریز یا برداشت مستقیماً بر موجودی آن صندوق اعمال و سند روزنامه صادر خواهد شد.
              </p>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-3">
              * پشتیبانی از خروجی استاندارد بانک‌های ملی، صادرات، ملت، تجارت، سامان، پاسارگاد و فایل‌های اکسل/CSV.
            </div>
          </div>
        </div>
      </div>

      {/* Transactions lists */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        
        {/* Navigation Tabs */}
        <div className="bg-slate-50 border-b border-slate-100 p-2.5 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex flex-wrap gap-1.5 sm:gap-2 bg-slate-200/60 rounded-xl p-1 w-full md:w-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 sm:flex-none px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer select-none transition-all duration-150 text-center ${
                activeTab === 'all' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              همه تراکنش‌ها ({displayedList.length})
            </button>
            <button
              onClick={() => setActiveTab('deposits')}
              className={`flex-1 sm:flex-none px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer select-none transition-all duration-150 text-center ${
                activeTab === 'deposits' ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <span className="flex items-center gap-1 sm:gap-1.5 justify-center">
                <ArrowDownLeft className="w-3.5 h-3.5" /> واریزها ({displayedList.filter(t => t.type === 'deposit').length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab('withdrawals')}
              className={`flex-1 sm:flex-none px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer select-none transition-all duration-150 text-center ${
                activeTab === 'withdrawals' ? 'bg-white text-rose-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <span className="flex items-center gap-1 sm:gap-1.5 justify-center">
                <ArrowUpRight className="w-3.5 h-3.5" /> برداشت‌ها ({displayedList.filter(t => t.type === 'withdrawal').length})
              </span>
            </button>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-3 flex-wrap">
            {selectedBatchIds.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBatchDeleteConfirm(true)}
                className="px-2.5 sm:px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف گروهی ({toPersianDigits(selectedBatchIds.length)} مورد)</span>
              </button>
            )}
            <span className="text-[11px] font-medium text-slate-500 shrink-0">
              تراکنش‌های معلق: <span className="font-bold font-mono text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded-full">{toPersianDigits(displayedList.length)} ردیف</span>
            </span>
          </div>
        </div>

        {/* Table representation */}
        {displayedList.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-slate-400">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3">
              <Check className="w-7 h-7 sm:w-8 sm:h-8 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">تراکنشی جهت بارگذاری یا مغایرت‌گیری در این فیلتر موجود نیست.</p>
            <p className="text-xs text-slate-400 mt-1">ابتدا فایل اکسل صورتحساب را از بخش فوق بارگذاری کنید.</p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-right text-[11px] sm:text-xs">
              <thead className="bg-slate-50/50 text-slate-500 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-2 sm:px-3 py-2.5 sm:py-3 text-center w-8 sm:w-10">
                    <input
                      type="checkbox"
                      checked={displayedList.length > 0 && selectedBatchIds.length === displayedList.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBatchIds(displayedList.map(tx => tx.id));
                        } else {
                          setSelectedBatchIds([]);
                        }
                      }}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">وضعیت</th>
                  <th 
                    className="px-2.5 sm:px-4 py-2.5 sm:py-3 cursor-pointer select-none hover:bg-slate-100/80 transition-colors group"
                    onClick={() => setDateSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                    title="برای تغییر جهت مرتب‌سازی تاریخ (جدید/قدیم) کلیک کنید"
                  >
                    <div className="flex items-center gap-1 sm:gap-1.5">
                      <span>تاریخ و ساعت</span>
                      <ArrowUpDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-500 group-hover:text-blue-700" />
                      <span className="text-[9px] sm:text-[10px] text-blue-600 font-normal hidden sm:inline">
                        ({dateSortOrder === 'desc' ? 'جدید به قدیم' : 'قدیم به جدید'})
                      </span>
                    </div>
                  </th>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-left">مبلغ تراکنش</th>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">نوع</th>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">صندوق / حساب مقصد</th>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">توضیحات بانک</th>
                  <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {displayedList.map((tx) => {
                  const txAccount = accounts.find(a => a.id === tx.accountId) || (selectedUploadAccountId ? accounts.find(a => a.id === selectedUploadAccountId) : null);
                  return (
                  <tr 
                    key={tx.id} 
                    className={`hover:bg-slate-50/75 transition-colors ${
                      tx.isDuplicate ? 'bg-amber-50/30' : ''
                    } ${selectedBatchIds.includes(tx.id) ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''}`}
                  >
                    <td className="px-2 sm:px-3 py-2.5 sm:py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedBatchIds.includes(tx.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBatchIds(prev => [...prev, tx.id]);
                          } else {
                            setSelectedBatchIds(prev => prev.filter(id => id !== tx.id));
                          }
                        }}
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-semibold whitespace-nowrap">
                      {tx.isDuplicate ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[9px] sm:text-[10px]">
                          <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          احتمالاً تکراری
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-[9px] sm:text-[10px]">
                          ثبت‌نشده
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 whitespace-nowrap font-mono text-[10px] sm:text-xs">{tx.date} - {tx.time}</td>
                    <td className={`px-2.5 sm:px-4 py-2.5 sm:py-3 font-bold font-mono text-left ${tx.type === 'deposit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {tx.type === 'deposit' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 whitespace-nowrap">
                      {tx.type === 'deposit' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-[10px] sm:text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                          واریز به بانک
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-600 font-semibold text-[10px] sm:text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
                          برداشت / هزینه
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 whitespace-nowrap">
                      {txAccount ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-blue-50 border border-blue-200/70 text-blue-800 text-[10px] sm:text-[11px] font-bold">
                          <Wallet className="w-3 h-3 text-blue-600 shrink-0" />
                          <span className="truncate max-w-[100px] sm:max-w-none">{txAccount.name}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px] sm:text-[11px]">پیش‌فرض سیستم</span>
                      )}
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 max-w-[120px] sm:max-w-xs truncate text-slate-600" title={tx.description}>
                      {tx.description}
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                        <button
                          onClick={() => handleOpenRegister(tx)}
                          className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-[11px] sm:text-xs font-bold transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          سند زدن
                        </button>
                        <button
                          onClick={() => setDeleteConfirmTx(tx)}
                          className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-100 hover:text-rose-700 text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                          title="حذف تراکنش"
                        >
                          <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History of registered transactions */}
      {registeredHistory.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-3.5 sm:p-5 lg:p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 text-xs sm:text-sm mb-3 sm:mb-4">آرشیو آخرین تراکنش‌های ثبت‌شده از اکسل</h3>
          
          <div className="overflow-x-auto w-full">
            <table className="w-full text-right text-[11px] sm:text-xs">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  <th className="p-2 sm:p-3">تاریخ پرداخت</th>
                  <th className="p-2 sm:p-3 text-left">مبلغ مالی</th>
                  <th className="p-2 sm:p-3">نوع</th>
                  <th className="p-2 sm:p-3">دسته معین (مادر / زیرمجموعه)</th>
                  <th className="p-2 sm:p-3">ملاحظات و شرح ثبت سند</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-600">
                {registeredHistory.slice(-5).reverse().map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="p-2 sm:p-3 font-mono text-[10px] sm:text-xs whitespace-nowrap">{t.date}</td>
                    <td className={`p-2 sm:p-3 font-semibold font-mono text-left text-[10px] sm:text-xs whitespace-nowrap ${t.type === 'deposit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(t.amount)}
                    </td>
                    <td className="p-2 sm:p-3 whitespace-nowrap text-[10px] sm:text-xs">
                      {t.type === 'deposit' ? 'واریزی' : 'برداشت'}
                    </td>
                    <td className="p-2 sm:p-3 font-medium text-slate-800 text-[10px] sm:text-xs whitespace-nowrap">
                      {t.categoryParent} / <span className="text-slate-500 font-normal">{t.categoryChild}</span>
                    </td>
                    <td className="p-2 sm:p-3 truncate max-w-[150px] sm:max-w-xs text-[10px] sm:text-xs">{t.userDescription || t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Popup mapping modal */}
      {showModal && selectedTx && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-3 z-50 animate-fade-in animate-duration-200 popup-overlay-global" id="dialog-register-tx">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-up animate-duration-150 popup-box-global">
            
            {/* Header - Compact */}
            <div className={`p-3 px-4 flex items-center justify-between text-white shrink-0 ${
              selectedTx.type === 'deposit' ? 'bg-gradient-to-l from-emerald-600 to-teal-700' : 'bg-gradient-to-l from-rose-600 to-pink-700'
            }`}>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <h3 className="font-bold text-sm">ثبت حسابداری تراکنش بانکی</h3>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
                title="بستن"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Form */}
            <form onSubmit={handleConfirmRegister} className="flex-1 flex flex-col overflow-hidden text-xs">
              <div className="p-3.5 space-y-2.5 overflow-y-auto flex-1">
                
                {selectedTx.isDuplicate && (
                  <div className="bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-2.5 text-[11px] leading-relaxed flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">توجه: احتمال تکراری بودن تراکنش</span>
                      تراکنش مشابه با مبلغ {formatCurrency(selectedTx.amount)} قبلاً ثبت شده است.
                    </div>
                  </div>
                )}

                {/* Bank Record Info - Ultra Compact */}
                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-slate-600 text-[11px]">
                      <span>تاریخ:</span>
                      <span className="font-mono text-slate-800 font-bold">{selectedTx.date} - {selectedTx.time}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-600 text-[11px]">مبلغ تراکنش:</span>
                      <span className={`font-mono text-xs font-black ${selectedTx.type === 'deposit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(selectedTx.amount)}
                      </span>
                    </div>
                  </div>

                  {selectedTx.description && (
                    <div className="text-slate-500 text-[11px] pt-1 border-t border-slate-200/60 flex items-start gap-1">
                      <span className="shrink-0 text-slate-400">شرح بانک:</span>
                      <span className="text-slate-700 font-mono truncate max-w-full" title={selectedTx.description}>
                        {selectedTx.description}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bank Account Selection */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">حساب دریافت/پرداخت بانکی</label>
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    required
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} (موجودی: {formatCurrency(acc.balance)})</option>
                    ))}
                  </select>
                </div>

                {/* Invoices Settlement & Separate Expense Allocation Box */}
                <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/60 space-y-2">
                  {/* Options row: Multi-settlement and Separate Expense Amount */}
                  <div className="flex items-center justify-between gap-2 flex-wrap pb-1.5 border-b border-slate-200/70">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-700 font-bold bg-white px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={isMultiSettlement}
                        onChange={(e) => {
                          setIsMultiSettlement(e.target.checked);
                          setSelectedInvoiceIds([]);
                          setAllocatedAmounts({});
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3 cursor-pointer"
                      />
                      <span>تصفیه چندگانه فاکتورها</span>
                    </label>

                    {/* Separate Expense Input */}
                    {selectedTx.type !== 'deposit' && (
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] font-bold text-slate-700 whitespace-nowrap" title={`این مبلغ به عنوان سند مجزا در سرفصل «${feeConfig.subCategory}» ثبت می‌شود`}>
                          هزینه جداگانه:
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={separateFeeAmount ? toPersianDigits(separateFeeAmount) : ''}
                            onChange={(e) => {
                              const raw = toEnglishDigits(e.target.value).replace(/[^\d.]/g, '');
                              setSeparateFeeAmount(raw);
                            }}
                            placeholder="مبلغ کارمزد/هزینه..."
                            className="w-28 px-2 py-1 rounded-md border border-amber-300 bg-amber-50/50 text-slate-800 text-[11px] font-mono text-center focus:ring-1 focus:ring-amber-500 focus:outline-hidden focus:bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Summary badge if separate fee is entered */}
                  {numSeparateFee > 0 && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2 rounded-md flex items-center justify-between text-[10px] font-medium animate-fade-in">
                      <div className="flex items-center gap-1">
                        <Tag className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>خالص برای تسویه فاکتور: <strong className="font-mono text-slate-800">{formatCurrency(netTxAmount)}</strong></span>
                      </div>
                      <div className="text-amber-800 font-semibold">
                        سند هزینه: <strong className="font-mono">{formatCurrency(numSeparateFee)}</strong> ({feeConfig.subCategory})
                      </div>
                    </div>
                  )}

                  {/* Quick Search Invoices */}
                  <div className="relative">
                    <div className="absolute right-2.5 top-2 text-slate-400">
                      <Search className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={invoiceSearchQuery}
                      onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (filteredModalInvoices.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setActiveInvoiceIndex(prev => (prev + 1) % filteredModalInvoices.length);
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setActiveInvoiceIndex(prev => (prev - 1 + filteredModalInvoices.length) % filteredModalInvoices.length);
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (activeInvoiceIndex >= 0 && activeInvoiceIndex < filteredModalInvoices.length) {
                              const selectedInv = filteredModalInvoices[activeInvoiceIndex];
                              handleToggleSelectInvoice(selectedInv.id);
                            }
                          }
                        }
                      }}
                      placeholder="جستجوی فاکتور (نام، شماره تماس یا شماره فاکتور)..."
                      className="w-full pr-8 pl-2.5 py-1 rounded-md border border-slate-200 text-[11px] bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden font-medium"
                    />
                  </div>

                  {/* Filtered Invoices List - Compact */}
                  <div className="max-h-32 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md bg-white">
                    {filteredModalInvoices.map((inv, idx) => {
                      const { remaining: remainingAmount, deposit: depositAmount } = getInvoiceDepositAndRemaining(inv);
                      const slips = getAllInvoiceDeposits(inv);
                      const matchingSlip = slips.find(s => s.amount === netTxAmount || s.amount === selectedTx.amount);
                      
                      const matchesRemaining = remainingAmount === netTxAmount || remainingAmount === selectedTx.amount;
                      const matchesDeposit = depositAmount > 0 && (depositAmount === netTxAmount || depositAmount === selectedTx.amount || slips.some(s => s.amount === netTxAmount || s.amount === selectedTx.amount));
                      const matchesTotal = inv.totalAmount === netTxAmount || inv.totalAmount === selectedTx.amount;
                      const matchesPayment = inv.paymentAmount === netTxAmount || inv.paymentAmount === selectedTx.amount;

                      const isExactMatch = matchesRemaining || matchesDeposit || matchesPayment || matchesTotal;
                      const isChecked = selectedInvoiceIds.includes(inv.id);
                      const isActive = idx === activeInvoiceIndex;
                      
                      return (
                        <div
                          key={inv.id}
                          onClick={() => handleToggleSelectInvoice(inv.id)}
                          className={`p-2 text-right text-[11px] transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                            isChecked ? 'bg-blue-50/70 font-semibold' : 'hover:bg-slate-50'
                          } ${
                            isExactMatch && !isChecked ? 'bg-emerald-50/50 hover:bg-emerald-100/60' : ''
                          } ${
                            isActive ? 'ring-1 ring-blue-500 ring-inset' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div>
                              {isChecked ? (
                                <CheckSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-800">فاکتور #{inv.invoiceNumber}</span>
                                <span className="text-[9px] text-slate-500 bg-slate-100 px-1 rounded">
                                   {inv.type === 'sale' ? 'فروش' : 'خرید'}
                                </span>
                                {isExactMatch && (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8.5px] font-bold leading-none ${
                                    matchesDeposit 
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                      : matchesRemaining 
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-blue-100 text-blue-800 border border-blue-200'
                                  }`}>
                                    {matchesDeposit 
                                      ? 'تطبیق با بیعانه' 
                                      : matchesRemaining 
                                      ? 'تطبیق با مانده'
                                      : 'تطبیق مبلغ'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                <span>{inv.counterpartName}</span>
                                {inv.counterpartPhone && <span className="font-mono text-[9px] mr-1">({inv.counterpartPhone})</span>}
                              </div>
                            </div>
                          </div>

                          <div className="text-left shrink-0 font-mono flex items-center gap-4 text-slate-700">
                            {/* Original Invoice Total */}
                            <div className="flex flex-col items-end min-w-[65px]">
                              <span className="text-[8px] text-slate-400 font-normal">کل فاکتور</span>
                              <span className="text-slate-600 font-bold text-[10.5px]">{formatCurrency(inv.totalAmount)}</span>
                            </div>
                            
                            {/* Registered Deposit Amount */}
                            <div className="flex flex-col items-end min-w-[105px] border-r border-slate-100 pr-4">
                              <span className="text-[8px] text-amber-500 font-bold">مجموع بیعانه‌ها</span>
                              <span className={`font-black text-[10.5px] ${depositAmount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                {formatCurrency(depositAmount)}
                              </span>
                              
                              {depositAmount > 0 && matchingSlip && (
                                <div className="mt-0.5 px-1 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[8px] font-bold leading-none shrink-0 flex flex-col items-end">
                                  <span className="text-[6px] text-amber-500 font-normal">بیعانه منطبق:</span>
                                  <span className="font-mono">{formatCurrency(matchingSlip.amount)}</span>
                                </div>
                              )}
                              
                              {slips.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPendingDepositId(null);
                                    setSelectedInvoiceForDepositDetails(inv);
                                  }}
                                  className="mt-1 px-1 py-0.5 hover:bg-amber-100 bg-amber-50 text-amber-700 border border-amber-200 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                                  title="مشاهده لیست کامل بیعانه‌ها"
                                >
                                  <Coins className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                  <span className="text-[7.5px] font-black">({toPersianDigits(slips.length)} بیعانه)</span>
                                </button>
                              )}
                            </div>

                            {/* Remaining Balance */}
                            <div className="flex flex-col items-end min-w-[75px] border-r border-slate-100 pr-4">
                              <span className="text-[8px] text-emerald-500 font-bold">مانده فاکتور</span>
                              <span className="text-emerald-600 font-black text-[11px]">{formatCurrency(remainingAmount)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredModalInvoices.length === 0 && (
                      <div className="p-3 text-center text-[11px] text-slate-400">
                        فاکتور باز جهت تسویه یافت نشد.
                      </div>
                    )}
                  </div>

                  {/* Multiple Settlements Split Controller */}
                  {isMultiSettlement && selectedInvoiceIds.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-md p-2 space-y-1.5 animate-fade-in">
                      <span className="text-[10px] font-bold text-slate-700 block">توزیع مبالغ میان فاکتورها:</span>
                      
                      <div className="space-y-1.5 max-h-28 overflow-y-auto">
                        {selectedInvoiceIds.map(id => {
                          const inv = invoices.find(i => i.id === id);
                          if (!inv) return null;
                          const alloc = allocatedAmounts[id] || 0;
                          
                          return (
                            <div key={id} className="flex items-center justify-between gap-2 text-[11px] border-b border-slate-100 pb-1">
                              <span className="font-medium text-slate-700 truncate max-w-[150px]">
                                #{inv.invoiceNumber} ({inv.counterpartName})
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-slate-400">مانده: {formatCurrency(inv.totalAmount - (inv.deposit || 0))}</span>
                                <input
                                  type="number"
                                  value={alloc}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                                    setAllocatedAmounts(prev => ({
                                      ...prev,
                                      [id]: val
                                    }));
                                  }}
                                  className="w-20 px-1.5 py-0.5 rounded border border-slate-200 font-mono text-center text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Allocation Budget Tracker */}
                      <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded border border-slate-100 text-[10px]">
                        <div>
                          <span className="text-slate-500">خالص تراکنش:</span>
                          <span className="font-mono font-bold text-slate-800 mr-1">{formatCurrency(netTxAmount)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">مجموع تخصیص:</span>
                          <span className={`font-mono font-bold mr-1 ${
                            (Object.values(allocatedAmounts) as number[]).reduce((sum, v) => sum + v, 0) > netTxAmount ? 'text-rose-600' : 'text-slate-800'
                          }`}>
                            {formatCurrency((Object.values(allocatedAmounts) as number[]).reduce((sum, v) => sum + v, 0))}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">مانده:</span>
                          <span className="font-mono font-bold text-slate-800 mr-1">
                            {formatCurrency(Math.max(0, netTxAmount - (Object.values(allocatedAmounts) as number[]).reduce((sum, v) => sum + v, 0)))}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4 Tabs for Classification & Transaction Registration */}
                <div className="space-y-2 pt-1 border-t border-slate-200/80">
                  <div className="flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => setModalTab('cost')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
                        modalTab === 'cost'
                          ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60 font-black'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                      }`}
                    >
                      <Receipt className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{selectedTx.type === 'deposit' ? 'وصول و واریز مستقیم' : 'ثبت هزینه'}</span>
                    </button>

                    {selectedTx.type !== 'deposit' && (
                      <button
                        type="button"
                        onClick={() => setModalTab('withdrawal')}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
                          modalTab === 'withdrawal'
                            ? 'bg-white text-rose-700 shadow-xs border border-slate-200/60 font-black'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>برداشت شرکا</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setModalTab('fund')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
                        modalTab === 'fund'
                          ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/60 font-black'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                      }`}
                    >
                      <Wallet className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>مدیریت صندوق</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setModalTab('loan')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
                        modalTab === 'loan'
                          ? 'bg-white text-amber-700 shadow-xs border border-slate-200/60 font-black'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                      }`}
                    >
                      <Landmark className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>مدیریت وام</span>
                    </button>
                  </div>

                  {/* TAB 1: Cost/Deposit Registration */}
                  {modalTab === 'cost' && (
                    <div className="space-y-2 animate-fade-in bg-slate-50/50 p-2 rounded-xl border border-slate-200/70">
                      {selectedTx.type !== 'deposit' ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-0.5">
                            <label className="text-[11px] font-bold text-slate-700 block">سرفصل کل / دسته مادر</label>
                            <select
                              value={parentCat}
                              onChange={(e) => {
                                setParentCat(e.target.value);
                                const cat = categories.find(c => c.name === e.target.value);
                                setChildCat(cat?.subcategories[0] || '');
                              }}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                              required
                            >
                              {categories.map(cat => (
                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                              ))}
                              <option value="درآمدهای فروش">درآمدهای فروش مستقیم کالا</option>
                              <option value="هزینه خرید کالا">هزینه خرید مستقیم اقلام انبار</option>
                            </select>
                          </div>

                          <div className="space-y-0.5">
                            <label className="text-[11px] font-bold text-slate-700 block">سرفصل معین / زیرمجموعه</label>
                            <select
                              value={childCat}
                              onChange={(e) => setChildCat(e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                              required
                            >
                              {categories.find(c => c.name === parentCat)?.subcategories.map((sub, i) => (
                                <option key={i} value={sub}>{sub}</option>
                              )) || (
                                <>
                                  <option value="فروش مستقیم به مشتری">فروش مستقیم به مشتری</option>
                                  <option value="تسویه حساب تامین کننده">تسویه حساب تامین کننده</option>
                                  <option value="سایر موارد">سایر موارد</option>
                                </>
                              )}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-lg text-[11px] text-emerald-800 mb-1 font-medium">
                          این تراکنش به عنوان «وصول یا واریز مستقیم» در سرفصل «اسناد دریافتنی بانکی» ثبت خواهد شد.
                        </div>
                      )}

                      <div className="space-y-0.5">
                        <label className="text-[11px] font-bold text-slate-700 block">
                          {selectedTx.type === 'deposit' ? 'شرح بابت سند واریزی (اختیاری)' : 'شرح بابت سند هزینه (اختیاری)'}
                        </label>
                        <input
                          type="text"
                          value={userDesc}
                          onChange={(e) => setUserDesc(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                          placeholder={selectedTx.type === 'deposit' ? 'شرح سند واریزی...' : 'شرح سند هزینه...'}
                        />
                      </div>
                    </div>
                  )}

                  {/* TAB 2: Partner Withdrawal Registration */}
                  {modalTab === 'withdrawal' && (
                    <div className="space-y-2 animate-fade-in bg-rose-50/40 p-2.5 rounded-xl border border-rose-100">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">انتخاب شریک / ذینفع جهت ثبت برداشت:</label>
                        {partners.length > 0 ? (
                          <div className="space-y-1.5">
                            <select
                              value={selectedPartnerId}
                              onChange={(e) => setSelectedPartnerId(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:ring-1 focus:ring-rose-500 focus:outline-hidden font-bold"
                              required
                            >
                              {partners.map(p => (
                                <option key={p.id} value={p.id}>{p.name} {p.sharePercent ? `(درصد سهم: ${p.sharePercent}٪)` : ''}</option>
                              ))}
                            </select>

                            {/* Selected Partner Summary Card */}
                            {(() => {
                              const p = partners.find(part => part.id === selectedPartnerId) || partners[0];
                              if (!p) return null;
                              return (
                                <div className="bg-white p-2 rounded-lg border border-rose-200/80 flex items-center justify-between text-[11px] text-rose-950">
                                  <div className="flex items-center gap-1.5 font-bold">
                                    <Users className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                    <span>شریک: <strong className="text-rose-700">{p.name}</strong></span>
                                  </div>
                                  {p.sharePercent !== undefined && (
                                    <span className="text-[10px] bg-rose-100/70 text-rose-800 px-2 py-0.5 rounded-md font-bold">
                                      سهم شراکت: {p.sharePercent}٪
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <p className="text-[10px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                            هنوز هیچ شریکی در بخش تنظیمات و سال مالی تعریف نشده است. لطفاً ابتدا در تنظیمات شرکا را ثبت کنید.
                          </p>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        <label className="text-[11px] font-bold text-slate-700 block">شرح بابت سند برداشت شریک (اختیاری)</label>
                        <input
                          type="text"
                          value={userDesc}
                          onChange={(e) => setUserDesc(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:ring-1 focus:ring-rose-500 focus:outline-hidden"
                          placeholder="مثلاً: برداشت علی‌الحساب سود سه‌ماهه یا برداشت جاری شریک..."
                        />
                      </div>
                    </div>
                  )}

                  {/* TAB 3: Cash Account / Fund Transfer */}
                  {modalTab === 'fund' && (
                    <div className="space-y-2 animate-fade-in bg-indigo-50/40 p-2.5 rounded-xl border border-indigo-100">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <label className="text-[11px] font-bold text-slate-700 block">حساب / صندوق مبدأ (پرداخت)</label>
                          <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 text-xs font-bold truncate">
                            {accounts.find(a => a.id === selectedAccount)?.name || 'صندوق انتخاب شده'}
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <label className="text-[11px] font-bold text-indigo-900 block">حساب / صندوق مقصد (دریافت)</label>
                          <select
                            value={transferToAccountId}
                            onChange={(e) => setTransferToAccountId(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-indigo-300 text-xs bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden font-bold"
                            required
                          >
                            {accounts.filter(a => a.id !== selectedAccount).map(acc => (
                              <option key={acc.id} value={acc.id}>{acc.name} (موجودی: {formatCurrency(acc.balance)})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="bg-white p-2 rounded-lg border border-indigo-200/80 flex items-center justify-between text-[11px] text-indigo-900 font-medium">
                        <div className="flex items-center gap-1.5">
                          <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>انتقال به مبلغ: <strong className="font-mono font-bold text-indigo-700">{formatCurrency(netTxAmount)}</strong></span>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          به «{accounts.find(a => a.id === transferToAccountId)?.name || 'صندوق مقصد'}»
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        <label className="text-[11px] font-bold text-slate-700 block">شرح بابت سند انتقال داخلی (اختیاری)</label>
                        <input
                          type="text"
                          value={userDesc}
                          onChange={(e) => setUserDesc(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                          placeholder="شرح انتقال وجه بین حساب‌ها یا شارژ صندوق..."
                        />
                      </div>
                    </div>
                  )}

                  {/* TAB 4: Loan Management */}
                  {modalTab === 'loan' && (
                    <div className="space-y-2 animate-fade-in bg-amber-50/40 p-2.5 rounded-xl border border-amber-100">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-bold text-slate-700 block">نوع تراکنش وام:</label>
                        <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setLoanSubTab('payout')}
                            className={`py-1 px-2 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                              loanSubTab === 'payout'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            پرداخت وام به متقاضی
                          </button>
                          <button
                            type="button"
                            onClick={() => setLoanSubTab('repayment')}
                            className={`py-1 px-2 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                              loanSubTab === 'repayment'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            تسویه / دریافت قسط وام
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-700 block">انتخاب وام‌گیرنده:</label>
                          <button
                            type="button"
                            onClick={() => setIsAddBorrowerOpen(!isAddBorrowerOpen)}
                            className="text-[10px] text-amber-700 hover:text-amber-900 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>{isAddBorrowerOpen ? 'بستن فرم متقاضی' : '+ متقاضی جدید'}</span>
                          </button>
                        </div>

                        {/* Quick Add Borrower Inline Panel */}
                        {isAddBorrowerOpen && (
                          <div className="bg-white p-2.5 rounded-lg border border-amber-300 space-y-2 animate-fade-in">
                            <span className="text-[10px] font-black text-amber-900 block">ثبت سریع متقاضی وام جدید</span>
                            <div className="grid grid-cols-2 gap-1.5">
                              <input
                                type="text"
                                value={newBorrowerName}
                                onChange={(e) => setNewBorrowerName(e.target.value)}
                                placeholder="نام و نام خانوادگی *"
                                className="px-2 py-1 border border-slate-200 rounded text-[11px] focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                                required
                              />
                              <input
                                type="text"
                                value={newBorrowerPhone}
                                onChange={(e) => setNewBorrowerPhone(e.target.value)}
                                placeholder="شماره تماس (اختیاری)"
                                className="px-2 py-1 border border-slate-200 rounded text-[11px] focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                              />
                              <input
                                type="text"
                                value={newBorrowerNationalId}
                                onChange={(e) => setNewBorrowerNationalId(e.target.value)}
                                placeholder="کد ملی (اختیاری)"
                                className="px-2 py-1 border border-slate-200 rounded text-[11px] focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                              />
                              <input
                                type="text"
                                value={newBorrowerInitialDebt}
                                onChange={(e) => setNewBorrowerInitialDebt(e.target.value)}
                                placeholder="مانده بدهی اولیه (تومان)"
                                className="px-2 py-1 border border-slate-200 rounded text-[11px] focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                              />
                            </div>
                            <div className="flex justify-end gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => setIsAddBorrowerOpen(false)}
                                className="px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 rounded cursor-pointer"
                              >
                                انصراف
                              </button>
                              <button
                                type="button"
                                onClick={handleQuickAddBorrower}
                                className="px-3 py-1 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded cursor-pointer"
                              >
                                ثبت و انتخاب وام‌گیرنده
                              </button>
                            </div>
                          </div>
                        )}

                        {loanBorrowers.length > 0 ? (
                          <select
                            value={selectedBorrowerId}
                            onChange={(e) => setSelectedBorrowerId(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                            required
                          >
                            {loanBorrowers.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.name} {b.phone ? `(${b.phone})` : ''} {b.initialDebt ? `- بدهی اولیه: ${formatCurrency(b.initialDebt)}` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-[10px] text-amber-800 bg-amber-100/60 p-2 rounded border border-amber-200">
                            هنوز متقاضی وامی تعریف نشده است. از دکمه «+ متقاضی جدید» بالا استفاده کنید.
                          </p>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        <label className="text-[11px] font-bold text-slate-700 block">شرح بابت سند وام (اختیاری)</label>
                        <input
                          type="text"
                          value={userDesc}
                          onChange={(e) => setUserDesc(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                          placeholder="شرح تراکنش وام..."
                        />
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-2 border-t border-slate-100 p-3 px-4 bg-slate-50 dark:bg-slate-900 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg transition-colors text-xs font-semibold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 text-white rounded-lg transition-all text-xs font-bold shadow hover:shadow-md cursor-pointer flex items-center gap-1.5 ${
                    selectedTx.type === 'deposit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                  id="btn-confirm-register"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>تایید و ثبت سند</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Fee Category Configuration Modal */}
      {showFeeCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in animate-duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-150 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-up">
            
            {/* Header */}
            <div className="p-3.5 px-4 border-b border-amber-100 flex items-center justify-between bg-amber-50/80">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-slate-800 text-sm">تنظیم نوع و سرفصل هزینه جداگانه (کارمزد)</h3>
              </div>
              <button
                onClick={() => setShowFeeCategoryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-white/80 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="p-4 space-y-3.5 overflow-y-auto flex-1 text-xs">
              <p className="text-slate-500 leading-relaxed">
                مبلغی که در فیلد «هزینه جداگانه» هنگام ثبت تراکنش وارد می‌کنید، با سرفصل و عنوان زیر به‌صورت یک سند مجزا در دفاتر ثبت خواهد شد:
              </p>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">سرفصل کل (دسته مادر)</label>
                <select
                  value={tempFeeConfig.parentCategory}
                  onChange={(e) => {
                    const parent = e.target.value;
                    const catObj = categories.find(c => c.name === parent);
                    setTempFeeConfig(prev => ({
                      ...prev,
                      parentCategory: parent,
                      subCategory: catObj?.subcategories[0] || 'کارمزد خدمات بانکی'
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                >
                  <option value="هزینه‌های مالی و بانکی">هزینه‌های مالی و بانکی</option>
                  <option value="هزینه‌های عمومی و اداری">هزینه‌های عمومی و اداری</option>
                  <option value="هزینه‌های توزیع و فروش">هزینه‌های توزیع و فروش</option>
                  {categories
                    .filter(c => !['هزینه‌های مالی و بانکی', 'هزینه‌های عمومی و اداری', 'هزینه‌های توزیع و فروش'].includes(c.name))
                    .map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">سرفصل معین (زیرمجموعه هزینه)</label>
                <input
                  type="text"
                  value={tempFeeConfig.subCategory}
                  onChange={(e) => setTempFeeConfig(prev => ({ ...prev, subCategory: e.target.value }))}
                  placeholder="مثلاً کارمزد خدمات بانکی، پورسانت، هزینه ارسال..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden font-medium"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['کارمزد خدمات بانکی', 'هزینه پایا و ساتنا', 'کارمزد پوز و درگاه', 'هزینه پورسانت و واسطه', 'هزینه پیک و حمل'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTempFeeConfig(prev => ({ ...prev, subCategory: s }))}
                      className="text-[10px] bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">شرح پیش‌فرض سند هزینه</label>
                <input
                  type="text"
                  value={tempFeeConfig.defaultTitle}
                  onChange={(e) => setTempFeeConfig(prev => ({ ...prev, defaultTitle: e.target.value }))}
                  placeholder="کارمزد و هزینه کسر شده از تراکنش بانکی"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
              </div>

              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-2.5 text-[11px] text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>پیش‌نمایش سند خودکار هزینه:</span>
                </div>
                <div className="text-slate-600 font-mono">
                  {tempFeeConfig.parentCategory} &larr; {tempFeeConfig.subCategory || '(بدون عنوان)'} ({tempFeeConfig.defaultTitle})
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 px-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFeeCategoryModal(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs py-1.5 px-4 rounded-lg cursor-pointer transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  setFeeConfig(tempFeeConfig);
                  setShowFeeCategoryModal(false);
                  setSuccessMsg(`نوع و سرفصل هزینه جداگانه به «${tempFeeConfig.subCategory}» بروزرسانی شد.`);
                  setTimeout(() => setSuccessMsg(null), 3500);
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-1.5 px-5 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>ذخیره تنظیمات</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTx && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in animate-duration-200 animate-fade-in animate-duration-150 popup-overlay-global" id="dialog-delete-tx">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl border border-slate-150 shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4 popup-box-global">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-800">حذف تراکنش از انبار موقت</h3>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              آیا از حذف این تراکنش از انبار موقت اطمینان دارید؟ این عمل غیرقابل بازگشت است و تراکنش از لیست معلق خارج می‌شود.
            </p>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-xs font-semibold space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">تاریخ:</span>
                <span className="text-slate-700 font-mono">{deleteConfirmTx.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">مبلغ:</span>
                <span className="text-rose-650 font-mono">{formatCurrency(deleteConfirmTx.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">شرح:</span>
                <span className="text-slate-700 truncate max-w-[200px]">{deleteConfirmTx.description}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmTx(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadedList(prev => prev.filter(item => item.id !== deleteConfirmTx.id));
                  setDeleteConfirmTx(null);
                  setSuccessMsg('تراکنش با موفقیت از انبار موقت حذف شد.');
                  setTimeout(() => setSuccessMsg(null), 4000);
                }}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-xs font-bold shadow cursor-pointer"
              >
                بله، حذف شود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteConfirm && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in animate-duration-150 popup-overlay-global" id="dialog-batch-delete">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl border border-slate-150 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4 popup-box-global">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-800 dark:text-white">تأییدیه حذف گروهی</h3>
            </div>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-right">
              آیا از حذف گروهی تعداد <strong className="text-slate-800 dark:text-white">«{toPersianDigits(selectedBatchIds.length)}»</strong> تراکنش معلق انتخاب شده اطمینان دارید؟ این عملیات غیرقابل بازگشت است.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowBatchDeleteConfirm(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-semibold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  // 1. Update uploadedList (local state + localStorage)
                  const remainingUploaded = uploadedList.filter(item => !selectedBatchIds.includes(item.id));
                  setUploadedList(remainingUploaded);
                  
                  // 2. Update parent transactions
                  if (onUpdateTransactions) {
                    const remainingTransactions = transactions.filter(t => !selectedBatchIds.includes(t.id));
                    onUpdateTransactions(remainingTransactions);
                  }

                  // 3. Clear selection and close confirmation
                  setSelectedBatchIds([]);
                  setShowBatchDeleteConfirm(false);
                  setSuccessMsg('تراکنش‌های انتخاب شده با موفقیت به صورت گروهی حذف شدند.');
                  setTimeout(() => setSuccessMsg(null), 4000);
                }}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-xs font-bold shadow cursor-pointer"
              >
                بله، همه حذف شوند
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Transactions Handling Modal */}
      {duplicateModalData && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in popup-overlay-global" id="dialog-duplicate-handler">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-6 my-8 text-right animate-scale-up popup-box-global">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white text-base md:text-lg">
                    شناسایی تراکنش‌های تکراری
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    فایل بارگذاری شده حاوی تراکنش‌های مشابه با ثبت‌های قبلی می‌باشد.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDuplicateCancel}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="بستن"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Banner */}
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
              <div className="font-black flex items-center gap-2 text-sm">
                <span>⚠️ تعداد {toPersianDigits(duplicateModalData.newDuplicateItems.length)} تراکنش تکراری یافت شد</span>
              </div>
              <p className="leading-relaxed opacity-90">
                از مجموع {toPersianDigits(duplicateModalData.allNewItems.length)} تراکنش موجود در فایل اکسل، تعداد {toPersianDigits(duplicateModalData.newDuplicateItems.length)} مورد دارای تاریخ، ساعت و مبلغ یکسان با تراکنش‌های موجود می‌باشند.
                {duplicateModalData.newNonDuplicateItems.length > 0 && (
                  <span className="block mt-1 font-bold text-emerald-700 dark:text-emerald-400">
                    ✓ تعداد {toPersianDigits(duplicateModalData.newNonDuplicateItems.length)} تراکنش غیرتکراری جدید نیز همراه با فایل آماده ثبت می‌باشد.
                  </span>
                )}
              </p>
            </div>

            {/* Duplicate Transactions Preview */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                لیست تراکنش‌های تکراری شناسایی شده:
              </span>
              <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-950/50 divide-y divide-slate-100 dark:divide-slate-800">
                {duplicateModalData.newDuplicateItems.map((tx, idx) => (
                  <div key={idx} className="p-3 text-xs flex flex-col gap-1.5 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          tx.type === 'deposit' 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}>
                          {tx.type === 'deposit' ? 'واریز' : 'برداشت'}
                        </span>
                        <span className="font-mono text-slate-600 dark:text-slate-400">
                          {toPersianDigits(tx.date)} - {toPersianDigits(tx.time)}
                        </span>
                        {tx.trackingNumber && (
                          <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-mono rounded text-slate-600 dark:text-slate-400">
                            کد پیگیری: {toPersianDigits(tx.trackingNumber)}
                          </span>
                        )}
                      </div>
                      <div className="font-mono font-bold text-slate-800 dark:text-white">
                        {formatCurrency(tx.amount)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 gap-2">
                      <span className="truncate max-w-[280px]" title={tx.description}>
                        {tx.description}
                      </span>
                      {tx.duplicateReason && (
                        <span className="text-amber-700 dark:text-amber-400 text-[10px] font-bold shrink-0 bg-amber-100/70 dark:bg-amber-900/40 px-2 py-0.5 rounded-md">
                          {tx.duplicateReason}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Options */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                لطفاً یکی از گزینه زیر را انتخاب نمایید:
              </span>

              <div className="grid grid-cols-1 gap-3">
                {/* Option 1: Replace */}
                <button
                  type="button"
                  onClick={handleDuplicateReplace}
                  className="w-full text-right p-4 rounded-2xl border-2 border-blue-200 hover:border-blue-500 bg-blue-50/40 hover:bg-blue-50 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 text-blue-900 dark:text-blue-100 transition-all cursor-pointer flex items-center justify-between group shadow-2xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-black text-sm flex items-center gap-2 text-blue-800 dark:text-blue-300">
                      <RefreshCw className="w-4 h-4 text-blue-600 group-hover:rotate-180 transition-transform duration-300" />
                      <span>۱. جایگزینی</span>
                    </div>
                    <p className="text-xs text-blue-600/90 dark:text-blue-300/80">
                      حذف تراکنش‌های تکراری قبلی و ثبت تراکنش‌های جدید فایل
                    </p>
                  </div>
                  <div className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors shadow-2xs">
                    انتخاب جایگزینی
                  </div>
                </button>

                {/* Option 2: Add */}
                <button
                  type="button"
                  onClick={handleDuplicateAdd}
                  className="w-full text-right p-4 rounded-2xl border-2 border-emerald-200 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 transition-all cursor-pointer flex items-center justify-between group shadow-2xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-black text-sm flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                      <Plus className="w-4 h-4 text-emerald-600 group-hover:scale-125 transition-transform duration-200" />
                      <span>۲. افزودن</span>
                    </div>
                    <p className="text-xs text-emerald-600/90 dark:text-emerald-300/80">
                      اضافه شدن تراکنش‌های جدید در کنار تراکنش‌های قبلی (نگهداری هر دو)
                    </p>
                  </div>
                  <div className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors shadow-2xs">
                    انتخاب افزودن
                  </div>
                </button>

                {/* Option 3: Cancel */}
                <button
                  type="button"
                  onClick={handleDuplicateCancel}
                  className="w-full text-right p-4 rounded-2xl border-2 border-slate-200 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="space-y-0.5">
                    <div className="font-black text-sm flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <Ban className="w-4 h-4 text-slate-500" />
                      <span>۳. انصراف</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      لغو بارگذاری تراکنش‌های تکراری {duplicateModalData.newNonDuplicateItems.length > 0 ? '(و فقط ثبت موارد غیرتکراری)' : ''}
                    </p>
                  </div>
                  <div className="px-3.5 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold shrink-0 transition-colors">
                    انصراف و لغو
                  </div>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Account Visibility Management Modal */}
      {showManageAccountsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in animate-duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-150 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm">مدیریت نمایش صندوق‌ها</h3>
              </div>
              <button
                onClick={() => setShowManageAccountsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Filters and Search */}
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={accountSearchQuery}
                    onChange={(e) => setAccountSearchQuery(e.target.value)}
                    placeholder="جستجوی نام صندوق..."
                    className="w-full pl-3 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-blue-500"
                  />
                  {accountSearchQuery && (
                    <button
                      onClick={() => setAccountSearchQuery('')}
                      className="absolute left-2.5 top-1.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setVisibleAccountIds(accounts.map(a => a.id))}
                    className="text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    نمایش همه
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVisibleAccountIds([]);
                      setSelectedUploadAccountId('');
                    }}
                    className="text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    مخفی همه
                  </button>
                </div>
              </div>

              {/* Compact Account List */}
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {accounts
                  .filter(acc => {
                    if (!accountSearchQuery.trim()) return true;
                    return acc.name.toLowerCase().includes(accountSearchQuery.toLowerCase());
                  })
                  .map(acc => {
                    const isVisible = visibleAccountIds.includes(acc.id);

                    return (
                      <div
                        key={acc.id}
                        onClick={() => handleToggleAccountVisibility(acc.id)}
                        className={`p-2.5 px-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors ${
                          isVisible ? 'bg-white' : 'opacity-50 bg-slate-50/50'
                        }`}
                      >
                        <span className="font-semibold text-xs text-slate-800 truncate">
                          {acc.name}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {isVisible ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <Eye className="w-3.5 h-3.5" />
                              <span>نمایان</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>مخفی</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {toPersianDigits(visibleAccounts.length)} از {toPersianDigits(accounts.length)} صندوق نمایان است
              </span>
              <button
                type="button"
                onClick={() => setShowManageAccountsModal(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-1.5 px-4 rounded-lg cursor-pointer transition-colors"
              >
                تأیید
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Detailed Invoice Deposits Modal */}
      {selectedInvoiceForDepositDetails && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-[70] animate-fade-in animate-duration-150 popup-overlay-global" id="dialog-deposit-details">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl border border-slate-150 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden p-5 space-y-4 popup-box-global text-right" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 text-amber-600">
                <Coins className="w-5 h-5 shrink-0" />
                <h3 className="font-bold text-sm text-slate-800 dark:text-white">
                  لیست بیعانه‌های ثبت‌شده فاکتور #{selectedInvoiceForDepositDetails.invoiceNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedInvoiceForDepositDetails(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-2">
                <span>مشتری/همکار: {selectedInvoiceForDepositDetails.counterpartName}</span>
                <span>کل مبلغ فاکتور: <strong className="text-slate-800 dark:text-white font-mono">{formatCurrency(selectedInvoiceForDepositDetails.totalAmount)}</strong></span>
              </div>

              {selectedTx && (
                <div className="bg-amber-50/70 border border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/40 rounded-lg p-2.5 text-amber-800 dark:text-amber-400 mb-3 text-[10.5px] leading-relaxed">
                  تراکنش بانکی انتخابی جاری به مبلغ <strong className="font-mono text-amber-700 dark:text-amber-300">{formatCurrency(netTxAmount)}</strong> است.
                  جهت جفت‌سازی مستقیم با تراکنش بانکی جاری، می‌توانید چک‌باکس بیعانه‌های با مبلغ منطبق را علامت بزنید.
                </div>
              )}

              <div className="max-h-60 overflow-y-auto space-y-2">
                {getAllInvoiceDeposits(selectedInvoiceForDepositDetails).map((slip, slipIdx) => {
                  const canSelectSlip = !!(selectedTx && slip.isPending && (slip.amount === selectedTx.amount || slip.amount === netTxAmount));
                  const isSlipChecked = selectedPendingDepositId === slip.id;

                  return (
                    <div 
                      key={slip.id || slipIdx} 
                      onClick={() => {
                        if (canSelectSlip) {
                          if (isSlipChecked) {
                            setSelectedPendingDepositId(null);
                          } else {
                            setSelectedPendingDepositId(slip.id);
                            if (!selectedInvoiceIds.includes(selectedInvoiceForDepositDetails.id)) {
                              setSelectedInvoiceIds([selectedInvoiceForDepositDetails.id]);
                            }
                            setAllocatedAmounts(prev => ({
                              ...prev,
                              [selectedInvoiceForDepositDetails.id]: slip.amount
                            }));
                            setParentCat(selectedInvoiceForDepositDetails.type === 'sale' ? 'وصول مطالبات مشتریان' : 'پرداخت بدهی تامین‌کنندگان');
                            setChildCat(selectedInvoiceForDepositDetails.type === 'sale' ? 'وصول فاکتور فروش' : 'تسویه فاکتور خرید');
                          }
                        }
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-lg border gap-2 transition-all ${
                        isSlipChecked 
                          ? 'border-emerald-400 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/25 ring-1 ring-emerald-300/40 shadow-xs' 
                          : slip.isCleared
                          ? 'border-emerald-500 dark:border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20 opacity-75 cursor-not-allowed shadow-2xs'
                          : canSelectSlip
                          ? 'border-amber-300 dark:border-amber-800 bg-amber-50/20 dark:bg-amber-950/10 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 cursor-pointer shadow-2xs'
                          : 'border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {canSelectSlip && (
                          <div className="shrink-0 flex items-center justify-center pl-1.5">
                            {isSlipChecked ? (
                              <CheckSquare className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Square className="w-4.5 h-4.5 text-amber-500 dark:text-amber-600" />
                            )}
                          </div>
                        )}
                        <div className="flex flex-col gap-0.5 text-right flex-1">
                          <span className={`font-semibold text-[11px] ${isSlipChecked || slip.isCleared ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}`}>
                            {slip.label}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono">
                            {slip.date} {slip.time ? `ساعت ${slip.time}` : ''}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono font-black text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded border border-amber-100 dark:border-amber-900/30">
                          {formatCurrency(slip.amount)}
                        </span>
                        {slip.isCleared ? (
                          <span className="text-[8.5px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/10 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-850">تسویه و ثبت‌شده</span>
                        ) : slip.isPending ? (
                          <span className="text-[8.5px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/10 px-1.5 py-0.5 rounded border border-amber-200">معلق / آماده تسویه</span>
                        ) : (
                          <span className="text-[8.5px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/10 px-1 py-0.2 rounded">قطعی</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 mt-3 text-slate-700 dark:text-slate-300">
                <span className="font-medium text-[11px]">مجموع بیعانه‌ها:</span>
                <span className="font-mono font-black text-sm text-amber-600">
                  {formatCurrency(getAllInvoiceDeposits(selectedInvoiceForDepositDetails).reduce((sum, s) => sum + s.amount, 0))}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 gap-2">
              <span className="text-[10px] text-slate-400">
                {selectedPendingDepositId ? '✓ یک بیعانه برای تطبیق انتخاب شد' : 'برای انتخاب بیعانه روی آن کلیک کنید'}
              </span>
              <button
                type="button"
                onClick={() => setSelectedInvoiceForDepositDetails(null)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-1.5 px-4 rounded-lg cursor-pointer transition-colors"
              >
                تأیید و بستن
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

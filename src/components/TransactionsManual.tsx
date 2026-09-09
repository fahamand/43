import React, { useState } from 'react';
import { BankTransaction, BankAccount, TransactionCategory, User, Invoice, Partner, PendingDeposit, LoanBorrower, AccountingDocument, FiscalYear } from '../types';
import { formatCurrency, toPersianDigits, getTodayJalali, getOneMonthAgoJalali, saveGenericKeyToDb } from '../utils/stateManager';
import { 
  PlusCircle, ArrowDownLeft, ArrowUpRight, DollarSign, Wallet, 
  CheckCircle, ArrowLeft, TrendingUp, TrendingDown, Eye, FileText, X, CheckSquare,
  Edit, Trash2, History, Paperclip, Link2, RotateCcw, Info, Plus, Check,
  Landmark, HandCoins, UserPlus, Users, RefreshCw, User as UserIcon
} from 'lucide-react';
import { numberToPersianWords } from './InvoiceManager';
import { JalaliDatePicker } from './JalaliDatePicker';
import { PaginationControls } from './PaginationControls';
import { 
  validateFiscalDate,
  allocatePaymentToInvoices,
  postPaymentAllocations,
  postInventoryMovement,
  applyAtomicTransactionEdit,
  applyAtomicTransactionSoftDelete,
  applyAtomicTransactionRestore,
  applyAtomicTransactionPermanentDelete
} from '../services';

interface TransactionsManualProps {
  accounts: BankAccount[];
  categories: TransactionCategory[];
  onUpdateCategories?: (updatedCategories: TransactionCategory[]) => void;
  currentUser: User;
  fiscalYear?: FiscalYear;
  onAddTransaction: (tx: BankTransaction, accountId: string) => void;
  onAddTransfer?: (
    amount: number,
    fromAccountId: string,
    toAccountId: string,
    date: string,
    time: string,
    description: string
  ) => void;
  invoices?: Invoice[];
  onUpdateInvoices?: (updatedInvoices: Invoice[]) => void;
  transactions?: BankTransaction[];
  onUpdateTransactions?: (updatedTxs: BankTransaction[]) => void;
  onUpdateAccounts?: (updatedAccs: BankAccount[]) => void;
  partners?: Partner[];
  pendingDeposits?: PendingDeposit[];
  onUpdatePendingDeposits?: (pds: PendingDeposit[]) => void;
  items?: any[];
  onUpdateItems?: (updatedItems: any[]) => void;
  loanBorrowers?: LoanBorrower[];
  onUpdateLoanBorrowers?: (borrowers: LoanBorrower[]) => void;
  docs?: AccountingDocument[];
  onUpdateDocs?: (updatedDocs: AccountingDocument[]) => void;
}

export default function TransactionsManual({
  accounts,
  categories,
  onUpdateCategories,
  currentUser,
  fiscalYear,
  onAddTransaction,
  onAddTransfer,
  invoices = [],
  onUpdateInvoices,
  transactions = [],
  onUpdateTransactions,
  onUpdateAccounts,
  partners = [],
  pendingDeposits = [],
  onUpdatePendingDeposits,
  items = [],
  onUpdateItems,
  loanBorrowers = [],
  onUpdateLoanBorrowers,
  docs = [],
  onUpdateDocs
}: TransactionsManualProps) {
  const [activeForm, setActiveForm] = useState<'cost' | 'deposit' | 'withdrawal' | 'settlement' | 'receivableSettlement' | 'transfer' | 'loan'>('cost');
  const [users, setUsers] = useState<User[]>([]);
  React.useEffect(() => {
    const loadUsersList = async () => {
      try {
        const savedUsers = localStorage.getItem('acc_app_users');
        if (savedUsers) {
          setUsers(JSON.parse(savedUsers));
          return;
        }
        const res = await fetch('/api/db/load-key?key=acc_app_users');
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data)) {
            setUsers(data);
            localStorage.setItem('acc_app_users', JSON.stringify(data));
          }
        }
      } catch (e) {
        console.error("Error loading users list:", e);
      }
    };
    loadUsersList();
  }, []);
  const [costSubTab, setCostSubTab] = useState<'expense' | 'waste' | 'consumable'>('expense');
  const [loanSubTab, setLoanSubTab] = useState<'payout' | 'repayment'>('payout');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
  const [itemQty, setItemQty] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('1403/03/10');
  const [time, setTime] = useState('12:00');
  const [selectedAccount, setSelectedAccount] = useState(accounts[0]?.id || '');
  const [transferFromAccountId, setTransferFromAccountId] = useState(accounts[0]?.id || '');
  const [transferToAccountId, setTransferToAccountId] = useState(accounts[1]?.id || accounts[0]?.id || '');
  const [parentCat, setParentCat] = useState(categories[0]?.name || 'هزینه‌های دفتر مرکزی');
  const [childCat, setChildCat] = useState(categories[0]?.subcategories[0] || 'اجاره‌بهای دفتر');
  const [desc, setDesc] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedPendingDepositId, setSelectedPendingDepositId] = useState('');

  // Loan borrower states
  const [selectedBorrowerId, setSelectedBorrowerId] = useState('');
  const [isAddBorrowerModalOpen, setIsAddBorrowerModalOpen] = useState(false);
  const [newBorrowerName, setNewBorrowerName] = useState('');
  const [newBorrowerPhone, setNewBorrowerPhone] = useState('');
  const [newBorrowerNationalId, setNewBorrowerNationalId] = useState('');
  const [newBorrowerInitialDebt, setNewBorrowerInitialDebt] = useState('');

  // Category management modal state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryModalMode, setCategoryModalMode] = useState<'create' | 'edit_selected'>('create');
  const [categoryModalTargetId, setCategoryModalTargetId] = useState<string | null>(null);
  const [createdSessionCatIds, setCreatedSessionCatIds] = useState<string[]>([]);
  const [newParentCatName, setNewParentCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [newSubCatNames, setNewSubCatNames] = useState<Record<string, string>>({});
  const [editingSubCat, setEditingSubCat] = useState<{ catId: string; subIdx: number; name: string } | null>(null);

  const saveCategoriesUpdate = (updated: TransactionCategory[]) => {
    if (onUpdateCategories) {
      onUpdateCategories(updated);
    }
    saveGenericKeyToDb('acc_app_categories', updated);
  };

  const handleOpenCreateCategoryModal = () => {
    setCategoryModalMode('create');
    setCreatedSessionCatIds([]);
    setNewParentCatName('');
    setIsCategoryModalOpen(true);
  };

  const getCleanInvoiceDeposit = (inv: Invoice, pds?: PendingDeposit[]) => {
    const currentDep = Number(inv.deposit) || 0;
    if (currentDep <= 0 || !pds || pds.length === 0) return currentDep;
    const normNum = (s: any) => String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString()).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).trim().toLowerCase();
    const matchedPds = pds.filter(p => !p.isDeleted && (p.invoiceId === inv.id || normNum(p.invoiceNumber) === normNum(inv.invoiceNumber)));
    if (matchedPds.length === 0) return currentDep;
    const clearedSum = matchedPds.filter(p => p.status === 'cleared').reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (clearedSum > 0 && currentDep === clearedSum * 2 && (inv.paymentSlips || []).length <= 1) {
      return clearedSum;
    }
    return currentDep;
  };

  const handleOpenEditCategoryModal = () => {
    const currentCategory = categories.find(c => c.name === parentCat);
    if (currentCategory) {
      setCategoryModalTargetId(currentCategory.id);
    } else if (categories.length > 0) {
      setCategoryModalTargetId(categories[0].id);
    }
    setCategoryModalMode('edit_selected');
    setIsCategoryModalOpen(true);
  };

  const handleAddParentCategory = () => {
    const trimmed = newParentCatName.trim();
    if (!trimmed) return;
    if (categories.some(c => c.name === trimmed)) {
      alert('سرفصلی با این نام قبلاً وجود دارد.');
      return;
    }
    const newCatId = 'cat-' + Date.now();
    const newCat: TransactionCategory = {
      id: newCatId,
      name: trimmed,
      subcategories: []
    };
    const updated = [...categories, newCat];
    saveCategoriesUpdate(updated);
    setNewParentCatName('');
    setCreatedSessionCatIds(prev => [...prev, newCatId]);
    setParentCat(trimmed);
    setChildCat('سایر موارد');
  };

  const handleEditParentCategory = (catId: string) => {
    const trimmed = editingCatName.trim();
    if (!trimmed) return;
    const target = categories.find(c => c.id === catId);
    if (!target) return;
    const oldName = target.name;
    const updated = categories.map(c => c.id === catId ? { ...c, name: trimmed } : c);
    saveCategoriesUpdate(updated);
    if (parentCat === oldName) {
      setParentCat(trimmed);
    }
    setEditingCatId(null);
    setEditingCatName('');
  };

  const handleDeleteParentCategory = (catId: string, catName: string) => {
    if (!window.confirm(`آیا از حذف سرفصل "${catName}" و تمام زیرمجموعه‌های آن اطمینان دارید؟`)) return;
    const updated = categories.filter(c => c.id !== catId);
    saveCategoriesUpdate(updated);
    if (parentCat === catName) {
      if (updated.length > 0) {
        setParentCat(updated[0].name);
        setChildCat(updated[0].subcategories[0] || 'سایر موارد');
      } else {
        setParentCat('');
        setChildCat('');
      }
    }
  };

  const handleAddSubcategory = (catId: string) => {
    const subName = (newSubCatNames[catId] || '').trim();
    if (!subName) return;
    const target = categories.find(c => c.id === catId);
    if (!target) return;
    if (target.subcategories.includes(subName)) {
      alert('این زیرمجموعه قبلاً اضافه شده است.');
      return;
    }
    const updated = categories.map(c => {
      if (c.id === catId) {
        return { ...c, subcategories: [...c.subcategories, subName] };
      }
      return c;
    });
    saveCategoriesUpdate(updated);
    setNewSubCatNames(prev => ({ ...prev, [catId]: '' }));
  };

  const handleEditSubcategory = (catId: string, subIdx: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const target = categories.find(c => c.id === catId);
    if (!target) return;
    const oldSubName = target.subcategories[subIdx];
    const updated = categories.map(c => {
      if (c.id === catId) {
        const newSubs = [...c.subcategories];
        newSubs[subIdx] = trimmed;
        return { ...c, subcategories: newSubs };
      }
      return c;
    });
    saveCategoriesUpdate(updated);
    if (parentCat === target.name && childCat === oldSubName) {
      setChildCat(trimmed);
    }
    setEditingSubCat(null);
  };

  const handleDeleteSubcategory = (catId: string, subIdx: number) => {
    const target = categories.find(c => c.id === catId);
    if (!target) return;
    const subName = target.subcategories[subIdx];
    if (!window.confirm(`آیا از حذف زیرمجموعه "${subName}" اطمینان دارید؟`)) return;
    const updated = categories.map(c => {
      if (c.id === catId) {
        const newSubs = c.subcategories.filter((_, idx) => idx !== subIdx);
        return { ...c, subcategories: newSubs };
      }
      return c;
    });
    saveCategoriesUpdate(updated);
    if (parentCat === target.name && childCat === subName) {
      const remainingSubs = target.subcategories.filter((_, idx) => idx !== subIdx);
      setChildCat(remainingSubs[0] || 'سایر موارد');
    }
  };

  // Editing state variables
  const [editingTx, setEditingTx] = useState<BankTransaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAccountId, setEditAccountId] = useState('');
  const [editParentCat, setEditParentCat] = useState('');
  const [editChildCat, setEditChildCat] = useState('');
  const [editInvoiceId, setEditInvoiceId] = useState('');
  const [editAttachments, setEditAttachments] = useState<string[]>([]);
  const [newAttachmentName, setNewAttachmentName] = useState('');

  // Viewing History state
  const [historyTx, setHistoryTx] = useState<BankTransaction | null>(null);

  // Soft Delete Confirmation state
  const [softDeleteConfirmTx, setSoftDeleteConfirmTx] = useState<BankTransaction | null>(null);

  // Permanent Delete Confirmation state
  const [permanentDeleteConfirmTx, setPermanentDeleteConfirmTx] = useState<BankTransaction | null>(null);

  // Batch Deletion state
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState<boolean>(false);
  const [batchDeleteTarget, setBatchDeleteTarget] = useState<'selected' | 'all_filtered'>('selected');
  const [isBatchDeleting, setIsBatchDeleting] = useState<boolean>(false);

  React.useEffect(() => {
    if (activeForm === 'cost' && costSubTab !== 'expense') {
      const selectedItem = items.find(it => it.id === selectedItemId);
      const qtyNum = parseInt(itemQty) || 0;
      if (selectedItem) {
        const calculatedPrice = qtyNum * (selectedItem.lastPurchasePrice || 0);
        setAmount(calculatedPrice > 0 ? String(calculatedPrice) : '');
      } else {
        setAmount('');
      }
    }
  }, [costSubTab, selectedItemId, itemQty, activeForm, items]);

  React.useEffect(() => {
    setSelectedItemId('');
    setItemSearchQuery('');
    setIsItemDropdownOpen(false);
    setItemQty('');
    setAmount('');
  }, [costSubTab]);

  const handleStartEdit = (tx: BankTransaction) => {
    setEditingTx(tx);
    setEditAmount(String(tx.amount));
    setEditDate(tx.date);
    setEditTime(tx.time || '12:00');
    setEditDesc(tx.description || '');
    setEditAccountId(tx.accountId || accounts[0]?.id || '');
    setEditParentCat(tx.categoryParent || categories[0]?.name || '');
    setEditChildCat(tx.categoryChild || categories[0]?.subcategories[0] || '');
    setEditInvoiceId(tx.invoiceId || '');
    setEditAttachments(tx.attachments || []);
    setNewAttachmentName('');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || !onUpdateTransactions) return;

    const numAmount = parseFloat(editAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('لطفاً مبلغ معتبری بزرگتر از صفر وارد کنید.');
      return;
    }

    const dateVal = validateFiscalDate(editDate, fiscalYear, { entityName: 'تراکنش' });
    if (!dateVal.valid) {
      alert(dateVal.error);
      return;
    }

    // Atomic Edit Operation with Balance Synchronization and Audit Trail
    const atomicResult = applyAtomicTransactionEdit(
      editingTx,
      {
        amount: numAmount,
        date: editDate,
        time: editTime,
        description: editDesc,
        accountId: editAccountId,
        categoryParent: editParentCat,
        categoryChild: editChildCat,
        invoiceId: editInvoiceId || undefined,
        attachments: editAttachments
      },
      transactions,
      accounts,
      currentUser
    );

    // Apply atomic transactions update
    onUpdateTransactions(atomicResult.updatedTransactions);

    // Apply atomic accounts balance update
    if (onUpdateAccounts) {
      onUpdateAccounts(atomicResult.updatedAccounts);
    }

    // Update associated accounting document if existing
    if (onUpdateDocs && docs) {
      const updatedDocs = docs.map(d => {
        if (d.txId === editingTx.id) {
          return {
            ...d,
            date: editDate,
            description: `سند بابت تراکنش: ${editDesc || d.description}`,
            lines: d.lines.map(l => {
              if (l.debit > 0) return { ...l, debit: numAmount };
              if (l.credit > 0) return { ...l, credit: numAmount };
              return l;
            })
          };
        }
        return d;
      });
      onUpdateDocs(updatedDocs);
    }

    setEditingTx(null);
    setSuccess('تراکنش با موفقیت ویرایش شد و ردپای حسابرسی (Audit Log) و مانده حساب‌ها همگام گردید.');
    setTimeout(() => setSuccess(null), 5000);
  };

  const handleSoftDelete = (tx: BankTransaction) => {
    if (!onUpdateTransactions) return;

    // Atomic Soft-Delete Operation with Balance Reversal and Audit Log
    const atomicResult = applyAtomicTransactionSoftDelete(
      tx,
      transactions,
      accounts,
      currentUser
    );

    onUpdateTransactions(atomicResult.updatedTransactions);

    if (onUpdateAccounts) {
      onUpdateAccounts(atomicResult.updatedAccounts);
    }

    // Soft-delete associated accounting document
    if (onUpdateDocs && docs) {
      const updatedDocs = docs.map(d => {
        const isRelated = d.txId === tx.id || (d.date === tx.date && d.lines.some(l => l.description === tx.description));
        if (isRelated) {
          return {
            ...d,
            isDeleted: true,
            deletedBy: currentUser?.name || '',
            deletedById: currentUser?.id || '',
            deletedAt: `${getTodayJalali()} - ${new Date().toLocaleTimeString('fa-IR')}`
          };
        }
        return d;
      });
      onUpdateDocs(updatedDocs);
    }

    // Revert associated pending deposits (turn back to unregistered / pending status)
    if (onUpdatePendingDeposits && pendingDeposits) {
      let pdsChanged = false;
      const updatedPendingDeposits = pendingDeposits
        .map(pd => {
          const isDirectMatch = (pd.clearedTxId === tx.id) || (tx.pendingDepositId && pd.id === tx.pendingDepositId);
          const isInvoiceMatch = tx.invoiceId && (
            (pd.invoiceId === tx.invoiceId || String(pd.invoiceNumber) === String(tx.invoiceId)) &&
            pd.status === 'cleared' &&
            (pd.amount === tx.amount || !pd.clearedTxId)
          );

          if (isDirectMatch || isInvoiceMatch) {
            pdsChanged = true;
            // If it was an auto-created placeholder for invoice settlement, remove it
            if (pd.id.startsWith('pd-cleared-')) {
              return null;
            }
            return {
              ...pd,
              status: 'pending' as const,
              clearedTxId: undefined,
              clearedDate: undefined
            };
          }
          return pd;
        })
        .filter((pd): pd is PendingDeposit => pd !== null);

      if (pdsChanged) {
        onUpdatePendingDeposits(updatedPendingDeposits);
      }
    }

    // Revert associated invoice deposit amount
    if (onUpdateInvoices && invoices) {
      const associatedInvIds = new Set<string>();
      if (tx.invoiceId) {
        tx.invoiceId.split(',').forEach(id => {
          if (id.trim()) associatedInvIds.add(id.trim());
        });
      }
      (pendingDeposits || []).forEach(pd => {
        if ((pd.clearedTxId === tx.id || pd.id === tx.pendingDepositId) && pd.invoiceId) {
          associatedInvIds.add(pd.invoiceId);
        }
      });

      if (associatedInvIds.size > 0) {
        const updatedInvoices = invoices.map(inv => {
          if (associatedInvIds.has(inv.id) || associatedInvIds.has(String(inv.invoiceNumber))) {
            const pendingTotal = (pendingDeposits || []).filter(p => (p.invoiceId === inv.id || String(p.invoiceNumber) === String(inv.invoiceNumber)) && !p.isDeleted).reduce((s, p) => s + (p.amount || 0), 0);
            const newDeposit = Math.max(pendingTotal, Math.max(0, (inv.deposit || 0) - tx.amount));
            return {
              ...inv,
              deposit: newDeposit
            };
          }
          return inv;
        });
        onUpdateInvoices(updatedInvoices);
      }
    }

    // Restore bank statement item in MySQL database
    (async () => {
      try {
        localStorage.removeItem('acc_app_uploaded_bank_statements');
        sessionStorage.removeItem('acc_app_uploaded_bank_statements');
        const res = await fetch('/api/db/load-key?key=acc_app_uploaded_bank_statements');
        if (res.ok) {
          const json = await res.json();
          if (json && json.status === 'success' && Array.isArray(json.data)) {
            const list: BankTransaction[] = json.data;
            const idx = list.findIndex(item => item.id === tx.id);
            if (idx >= 0) {
              list[idx] = {
                ...list[idx],
                isRegistered: false,
                isDeleted: false,
                registeredDate: undefined,
                userDescription: undefined
              };
            } else {
              list.push({
                ...tx,
                isRegistered: false,
                isDeleted: false,
                registeredDate: undefined,
                userDescription: undefined
              });
            }
            await saveGenericKeyToDb('acc_app_uploaded_bank_statements', list);
            window.dispatchEvent(new CustomEvent('fahamacc-uploaded-statements-updated', { detail: list }));
          }
        }
      } catch (_) {}
    })();

    setSuccess('تراکنش با موفقیت غیرفعال (Soft Delete) شد و وضعیت بیعانه به حالت قبل (ثبت‌نشده) تغییر یافت.');
    setTimeout(() => setSuccess(null), 5000);
  };

  const handleRestore = (tx: BankTransaction) => {
    if (!onUpdateTransactions) return;
    if (currentUser.role !== 'admin') {
      alert('تنها کاربر مدیر مجاز به بازیابی تراکنش‌های غیرفعال شده است.');
      return;
    }

    // Atomic Restore Operation with Balance Re-application and Audit Log
    const atomicResult = applyAtomicTransactionRestore(
      tx,
      transactions,
      accounts,
      currentUser
    );

    onUpdateTransactions(atomicResult.updatedTransactions);

    if (onUpdateAccounts) {
      onUpdateAccounts(atomicResult.updatedAccounts);
    }

    // Restore associated accounting document
    if (onUpdateDocs && docs) {
      const updatedDocs = docs.map(d => {
        const isRelated = d.txId === tx.id || (d.date === tx.date && d.lines.some(l => l.description === tx.description));
        if (isRelated) {
          return {
            ...d,
            isDeleted: false,
            deletedBy: undefined,
            deletedById: undefined,
            deletedAt: undefined
          };
        }
        return d;
      });
      onUpdateDocs(updatedDocs);
    }

    // Re-clear associated pending deposits
    if (onUpdatePendingDeposits && pendingDeposits) {
      const updatedPendingDeposits = pendingDeposits.map(pd => {
        const isDirectMatch = (pd.clearedTxId === tx.id) || (tx.pendingDepositId && pd.id === tx.pendingDepositId);
        const isInvoiceMatch = tx.invoiceId && (
          (pd.invoiceId === tx.invoiceId || String(pd.invoiceNumber) === String(tx.invoiceId)) &&
          (pd.amount === tx.amount || !pd.clearedTxId)
        );

        if (isDirectMatch || isInvoiceMatch) {
          return {
            ...pd,
            status: 'cleared' as const,
            clearedTxId: tx.id,
            clearedDate: tx.date
          };
        }
        return pd;
      });
      onUpdatePendingDeposits(updatedPendingDeposits);
    }

    // Re-apply invoice deposit
    if (onUpdateInvoices && invoices) {
      const associatedInvIds = new Set<string>();
      if (tx.invoiceId) {
        tx.invoiceId.split(',').forEach(id => {
          if (id.trim()) associatedInvIds.add(id.trim());
        });
      }
      (pendingDeposits || []).forEach(pd => {
        if ((pd.clearedTxId === tx.id || pd.id === tx.pendingDepositId) && pd.invoiceId) {
          associatedInvIds.add(pd.invoiceId);
        }
      });

      if (associatedInvIds.size > 0) {
        const updatedInvoices = invoices.map(inv => {
          if (associatedInvIds.has(inv.id) || associatedInvIds.has(String(inv.invoiceNumber))) {
            return {
              ...inv,
              deposit: (inv.deposit || 0) + tx.amount
            };
          }
          return inv;
        });
        onUpdateInvoices(updatedInvoices);
      }
    }

    // In uploaded bank statements, mark as registered via MySQL
    (async () => {
      try {
        localStorage.removeItem('acc_app_uploaded_bank_statements');
        sessionStorage.removeItem('acc_app_uploaded_bank_statements');
        const res = await fetch('/api/db/load-key?key=acc_app_uploaded_bank_statements');
        if (res.ok) {
          const json = await res.json();
          if (json && json.status === 'success' && Array.isArray(json.data)) {
            const filtered = (json.data as BankTransaction[]).filter(item => item.id !== tx.id);
            await saveGenericKeyToDb('acc_app_uploaded_bank_statements', filtered);
            window.dispatchEvent(new CustomEvent('fahamacc-uploaded-statements-updated', { detail: filtered }));
          }
        }
      } catch (_) {}
    })();

    setSuccess('تراکنش با موفقیت بازیابی و مجدداً در دفاتر کل فعال گردید.');
    setTimeout(() => setSuccess(null), 5000);
  };

  const handlePermanentDelete = (tx: BankTransaction) => {
    if (!onUpdateTransactions) return;
    if (currentUser.role !== 'admin') {
      alert('تنها کاربر مدیر مجاز به حذف کامل تراکنش‌ها است.');
      return;
    }

    // Atomic Permanent Delete Operation with Balance Reversal
    const atomicResult = applyAtomicTransactionPermanentDelete(
      tx,
      transactions,
      accounts
    );

    onUpdateTransactions(atomicResult.updatedTransactions);

    if (onUpdateAccounts) {
      onUpdateAccounts(atomicResult.updatedAccounts);
    }

    // Hard-delete associated accounting document completely
    if (onUpdateDocs && docs) {
      const updatedDocs = docs.filter(d => {
        const isRelated = d.txId === tx.id || (d.date === tx.date && d.lines.some(l => l.description === tx.description));
        return !isRelated;
      });
      onUpdateDocs(updatedDocs);
    }

    // Revert associated pending deposits
    if (onUpdatePendingDeposits && pendingDeposits) {
      let pdsChanged = false;
      const updatedPendingDeposits = pendingDeposits
        .map(pd => {
          const isDirectMatch = (pd.clearedTxId === tx.id) || (tx.pendingDepositId && pd.id === tx.pendingDepositId);
          const isInvoiceMatch = tx.invoiceId && (
            (pd.invoiceId === tx.invoiceId || String(pd.invoiceNumber) === String(tx.invoiceId)) &&
            pd.status === 'cleared' &&
            (pd.amount === tx.amount || !pd.clearedTxId)
          );

          if (isDirectMatch || isInvoiceMatch) {
            pdsChanged = true;
            if (pd.id.startsWith('pd-cleared-')) {
              return null;
            }
            return {
              ...pd,
              status: 'pending' as const,
              clearedTxId: undefined,
              clearedDate: undefined
            };
          }
          return pd;
        })
        .filter((pd): pd is PendingDeposit => pd !== null);

      if (pdsChanged) {
        onUpdatePendingDeposits(updatedPendingDeposits);
      }
    }

    // Revert associated invoice deposit
    if (onUpdateInvoices && invoices && !tx.isDeleted) {
      const associatedInvIds = new Set<string>();
      if (tx.invoiceId) {
        tx.invoiceId.split(',').forEach(id => {
          if (id.trim()) associatedInvIds.add(id.trim());
        });
      }
      (pendingDeposits || []).forEach(pd => {
        if ((pd.clearedTxId === tx.id || pd.id === tx.pendingDepositId) && pd.invoiceId) {
          associatedInvIds.add(pd.invoiceId);
        }
      });

      if (associatedInvIds.size > 0) {
        const updatedInvoices = invoices.map(inv => {
          if (associatedInvIds.has(inv.id) || associatedInvIds.has(String(inv.invoiceNumber))) {
            const pendingTotal = (pendingDeposits || []).filter(p => (p.invoiceId === inv.id || String(p.invoiceNumber) === String(inv.invoiceNumber)) && !p.isDeleted).reduce((s, p) => s + (p.amount || 0), 0);
            const newDeposit = Math.max(pendingTotal, Math.max(0, (inv.deposit || 0) - tx.amount));
            return {
              ...inv,
              deposit: newDeposit
            };
          }
          return inv;
        });
        onUpdateInvoices(updatedInvoices);
      }
    }

    // Restore bank statement item in MySQL database
    (async () => {
      try {
        localStorage.removeItem('acc_app_uploaded_bank_statements');
        sessionStorage.removeItem('acc_app_uploaded_bank_statements');
        const res = await fetch('/api/db/load-key?key=acc_app_uploaded_bank_statements');
        if (res.ok) {
          const json = await res.json();
          if (json && json.status === 'success' && Array.isArray(json.data)) {
            const list: BankTransaction[] = json.data;
            const idx = list.findIndex(item => item.id === tx.id);
            if (idx >= 0) {
              list[idx] = {
                ...list[idx],
                isRegistered: false,
                isDeleted: false,
                registeredDate: undefined,
                userDescription: undefined
              };
            } else {
              list.push({
                ...tx,
                isRegistered: false,
                isDeleted: false,
                registeredDate: undefined,
                userDescription: undefined
              });
            }
            await saveGenericKeyToDb('acc_app_uploaded_bank_statements', list);
            window.dispatchEvent(new CustomEvent('fahamacc-uploaded-statements-updated', { detail: list }));
          }
        }
      } catch (_) {}
    })();

    setSuccess('تراکنش با موفقیت به‌صورت کامل و دائمی از سیستم پاک شد و وضعیت بیعانه به حالت ثبت‌نشده بازگشت.');
    setTimeout(() => setSuccess(null), 5000);
  };

  // Lists Tabs State
  const [listTab, setListTab] = useState<'transactions' | 'expenses' | 'deposits' | 'withdrawals' | 'sales' | 'purchases' | 'transfers' | 'pending_deposits' | 'deleted_transactions'>('transactions');
  const [pendingDepositFilter, setPendingDepositFilter] = useState<'pending' | 'cleared' | 'all'>('pending');
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  const [filterStartDate, setFilterStartDate] = useState(() => getOneMonthAgoJalali());
  const [filterEndDate, setFilterEndDate] = useState(() => getTodayJalali());

  // Local helper for digit conversion to prevent crashes
  const toEnglishDigitsLocal = (str: string): string => {
    if (!str) return '';
    return str.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
  };

  const cleanDateStr = React.useCallback((d: string) => {
    if (!d) return '';
    let res = toEnglishDigitsLocal(String(d)).replace(/[^\d\/\-]/g, '').replace(/-/g, '/');
    const parts = res.split('/');
    if (parts.length === 3) {
      let year = parts[0];
      let month = parts[1].padStart(2, '0');
      let day = parts[2].padStart(2, '0');
      return `${year}/${month}/${day}`;
    }
    return res;
  }, []);

  const filterByDateRange = React.useCallback((itemDate: string) => {
    const normItem = cleanDateStr(itemDate);
    const normStart = cleanDateStr(filterStartDate);
    const normEnd = cleanDateStr(filterEndDate);

    if (normStart && normItem < normStart) return false;
    if (normEnd && normItem > normEnd) return false;
    return true;
  }, [filterStartDate, filterEndDate, cleanDateStr]);

  const filteredTransactions = React.useMemo(() => {
    return (transactions || [])
      .filter(t => filterByDateRange(t.date))
      .sort((a, b) => {
        // 1. Sort by Date descending (newest first)
        const normA = cleanDateStr(a.date);
        const normB = cleanDateStr(b.date);
        const dateCompare = normB.localeCompare(normA);
        if (dateCompare !== 0) return dateCompare;

        // 2. Sort by Time descending
        const timeA = toEnglishDigitsLocal(a.time || '').trim();
        const timeB = toEnglishDigitsLocal(b.time || '').trim();
        if (timeA && timeB && timeA !== timeB) {
          return timeB.localeCompare(timeA);
        }

        // 3. Sort by numeric sequence in ID (e.g., tx-1718293849102)
        const matchA = toEnglishDigitsLocal(String(a.id || '')).match(/\d+/g)?.join('');
        const matchB = toEnglishDigitsLocal(String(b.id || '')).match(/\d+/g)?.join('');
        if (matchA && matchB) {
          const numA = Number(matchA);
          const numB = Number(matchB);
          if (numA !== numB) return numB - numA;
        }

        return String(b.id || '').localeCompare(String(a.id || ''));
      });
  }, [transactions, filterByDateRange, cleanDateStr]);

  const tabInvoices = React.useMemo(() => {
    return invoices
      .filter(inv => !inv.isDeleted && filterByDateRange(inv.date))
      .sort((a, b) => {
        // 1. Sort by Date descending (newest first)
        const normA = cleanDateStr(a.date);
        const normB = cleanDateStr(b.date);
        const dateCompare = normB.localeCompare(normA);
        if (dateCompare !== 0) return dateCompare;

        // 2. Sort by Invoice Number descending
        const rawNumA = toEnglishDigitsLocal(String(a.invoiceNumber || '')).replace(/\D+/g, '');
        const rawNumB = toEnglishDigitsLocal(String(b.invoiceNumber || '')).replace(/\D+/g, '');
        const numA = rawNumA ? Number(rawNumA) : 0;
        const numB = rawNumB ? Number(rawNumB) : 0;
        if (numA !== numB) return numB - numA;

        // 3. Sort by Timestamp in ID descending
        const tsA = toEnglishDigitsLocal(String(a.id || '')).match(/\d+/g)?.join('');
        const tsB = toEnglishDigitsLocal(String(b.id || '')).match(/\d+/g)?.join('');
        const numTsA = tsA ? Number(tsA) : 0;
        const numTsB = tsB ? Number(tsB) : 0;
        if (numTsA !== numTsB) return numTsB - numTsA;

        return String(b.id || '').localeCompare(String(a.id || ''));
      });
  }, [invoices, filterByDateRange, cleanDateStr]);

  const tabPendingDeposits = React.useMemo(() => {
    return (pendingDeposits || [])
      .filter(p => {
        if (p.isDeleted) return false;
        if (!filterByDateRange(p.date)) return false;
        if (pendingDepositFilter === 'pending') return p.status === 'pending';
        if (pendingDepositFilter === 'cleared') return p.status === 'cleared';
        return true;
      })
      .sort((a, b) => {
        // 1. Sort by Date descending (newest first)
        const normA = cleanDateStr(a.date);
        const normB = cleanDateStr(b.date);
        const dateCompare = normB.localeCompare(normA);
        if (dateCompare !== 0) return dateCompare;

        // 2. Sort by Invoice/Record Number descending
        const rawNumA = toEnglishDigitsLocal(String(a.invoiceNumber || '')).replace(/\D+/g, '');
        const rawNumB = toEnglishDigitsLocal(String(b.invoiceNumber || '')).replace(/\D+/g, '');
        const numA = rawNumA ? Number(rawNumA) : 0;
        const numB = rawNumB ? Number(rawNumB) : 0;
        if (numA !== numB) return numB - numA;

        // 3. Sort by Timestamp in ID descending
        const tsA = toEnglishDigitsLocal(String(a.id || '')).match(/\d+/g)?.join('');
        const tsB = toEnglishDigitsLocal(String(b.id || '')).match(/\d+/g)?.join('');
        const numTsA = tsA ? Number(tsA) : 0;
        const numTsB = tsB ? Number(tsB) : 0;
        if (numTsA !== numTsB) return numTsB - numTsA;

        return String(b.id || '').localeCompare(String(a.id || ''));
      });
  }, [pendingDeposits, pendingDepositFilter, filterByDateRange, cleanDateStr]);

  const currentTxList = React.useMemo(() => {
    if (listTab === 'deleted_transactions') {
      return filteredTransactions.filter(t => t.isDeleted === true);
    }
    if (listTab === 'transactions') return filteredTransactions;
    if (listTab === 'expenses') {
      return filteredTransactions.filter(t => t.type === 'withdrawal' && t.categoryParent !== 'برداشت نقدی' && t.categoryParent !== 'انتقال داخلی بین حساب‌ها');
    }
    if (listTab === 'deposits') {
      return filteredTransactions.filter(t => t.type === 'deposit' && t.categoryParent !== 'انتقال داخلی بین حساب‌ها');
    }
    if (listTab === 'withdrawals') {
      return filteredTransactions.filter(t => t.type === 'withdrawal' && (t.categoryParent === 'برداشت نقدی' || !t.categoryParent) && t.categoryParent !== 'انتقال داخلی بین حساب‌ها');
    }
    if (listTab === 'transfers') {
      return filteredTransactions.filter(t => t.categoryParent === 'انتقال داخلی بین حساب‌ها');
    }
    return [];
  }, [listTab, filteredTransactions]);

  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(15);

  React.useEffect(() => {
    setTxPage(1);
  }, [listTab, filterStartDate, filterEndDate]);

  const totalTxPages = Math.ceil(currentTxList.length / txPageSize) || 1;
  const paginatedTxList = React.useMemo(() => {
    return currentTxList.slice((txPage - 1) * txPageSize, txPage * txPageSize);
  }, [currentTxList, txPage, txPageSize]);

  const emptyTxMessage = React.useMemo(() => {
    if (listTab === 'deleted_transactions') return 'هیچ تراکنش غیرفعال شده (حذف موقت) یافت نشد.';
    if (listTab === 'transactions') return 'هیچ تراکنش ثبت شده‌ای یافت نشد.';
    if (listTab === 'expenses') return 'هیچ هزینه ثبت شده‌ای یافت نشد.';
    if (listTab === 'deposits') return 'هیچ واریزی ثبت شده‌ای یافت نشد.';
    if (listTab === 'withdrawals') return 'هیچ برداشت نقدی ثبت شده‌ای یافت نشد.';
    if (listTab === 'transfers') return 'هیچ تراکنش جابجایی بین صندوق‌ها و حساب‌ها یافت نشد.';
    return '';
  }, [listTab]);

  // Reset selected items on filter/tab changes
  React.useEffect(() => {
    setSelectedTxIds([]);
  }, [listTab, filterStartDate, filterEndDate]);

  const currentTabItems = React.useMemo(() => {
    if (listTab === 'sales') {
      return tabInvoices.filter(inv => inv.type === 'sale');
    }
    if (listTab === 'purchases') {
      return tabInvoices.filter(inv => inv.type === 'purchase');
    }
    if (listTab === 'pending_deposits') {
      return tabPendingDeposits;
    }
    return currentTxList;
  }, [listTab, tabInvoices, tabPendingDeposits, currentTxList]);

  const handleToggleSelectOneTx = (id: string) => {
    setSelectedTxIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllTx = () => {
    if (currentTabItems.length > 0 && selectedTxIds.length === currentTabItems.length) {
      setSelectedTxIds([]);
    } else {
      setSelectedTxIds(currentTabItems.map(t => t.id));
    }
  };

  const targetBatchItems = React.useMemo(() => {
    if (batchDeleteTarget === 'all_filtered') {
      return currentTabItems;
    }
    const idSet = new Set(selectedTxIds);
    return currentTabItems.filter(t => idSet.has(t.id));
  }, [batchDeleteTarget, selectedTxIds, currentTabItems]);

  const targetBatchTransactions = React.useMemo(() => {
    if (listTab === 'sales' || listTab === 'purchases' || listTab === 'pending_deposits') {
      return [];
    }
    return targetBatchItems as BankTransaction[];
  }, [listTab, targetBatchItems]);

  const targetBatchTotalAmount = React.useMemo(() => {
    if (listTab === 'sales' || listTab === 'purchases') {
      return (targetBatchItems as Invoice[]).reduce((sum, inv) => {
        const itemsSubtotal = (inv.items || []).reduce((s, it) => s + (it.totalPrice || (it.qty * it.unitPrice) || 0), 0);
        const netAmt = itemsSubtotal > 0 ? Math.max(0, itemsSubtotal + (inv.tax || 0) - (inv.discount || 0)) : (inv.totalAmount || 0);
        return sum + netAmt;
      }, 0);
    }
    if (listTab === 'pending_deposits') {
      return (targetBatchItems as PendingDeposit[]).reduce((sum, pd) => sum + (pd.amount || 0), 0);
    }
    return (targetBatchItems as BankTransaction[]).reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [listTab, targetBatchItems]);

  const handleConfirmBatchDeleteTransactions = () => {
    if (targetBatchItems.length === 0) return;

    const isPermanent = listTab === 'deleted_transactions';
    if (isPermanent && currentUser.role !== 'admin') {
      alert('تنها کاربر مدیر مجاز به حذف کامل تراکنش‌ها است.');
      return;
    }

    if (currentUser.role !== 'admin' && currentUser.role !== 'accountant') {
      alert('شما دسترسی لازم برای عملیات حذف گروهی را ندارید.');
      return;
    }

    setIsBatchDeleting(true);
    try {
      if (listTab === 'sales' || listTab === 'purchases') {
        if (!onUpdateInvoices) return;
        const targetIds = new Set(targetBatchItems.map(i => i.id));
        const targetInvoiceNumbers = new Set(targetBatchItems.map(i => String((i as Invoice).invoiceNumber)));
        const deleteTimestamp = `${getTodayJalali()} - ${new Date().toLocaleTimeString('fa-IR')}`;

        // Soft-delete targeted invoices
        const updatedInvoices = invoices.map(inv => {
          if (targetIds.has(inv.id)) {
            return {
              ...inv,
              isDeleted: true,
              deletedBy: currentUser?.name || 'مدیر',
              deletedById: currentUser?.id || '',
              deletedAt: deleteTimestamp
            };
          }
          return inv;
        });
        onUpdateInvoices(updatedInvoices);

        // Also soft-delete connected transactions
        if (onUpdateTransactions) {
          let updatedTxs = [...transactions];
          let updatedAccounts = [...accounts];
          
          transactions.forEach(t => {
            if (!t.isDeleted && t.invoiceId && (targetIds.has(t.invoiceId) || targetInvoiceNumbers.has(t.invoiceId))) {
              const res = applyAtomicTransactionSoftDelete(t, updatedTxs, updatedAccounts, currentUser);
              updatedTxs = res.updatedTransactions;
              updatedAccounts = res.updatedAccounts;
            }
          });
          onUpdateTransactions(updatedTxs);
          if (onUpdateAccounts) onUpdateAccounts(updatedAccounts);
        }

        setSelectedTxIds([]);
        setBatchDeleteModalOpen(false);
        const tabTitle = listTab === 'sales' ? 'فاکتور فروش' : 'فاکتور خرید';
        setSuccess(`تعداد ${toPersianDigits(targetBatchItems.length)} ${tabTitle} با موفقیت غیرفعال (حذف موقت) شد.`);
        setTimeout(() => setSuccess(null), 5000);
        return;
      }

      if (listTab === 'pending_deposits') {
        if (!onUpdatePendingDeposits) return;
        const targetIds = new Set(targetBatchItems.map(p => p.id));
        const updatedPDs = (pendingDeposits || []).filter(p => !targetIds.has(p.id));
        onUpdatePendingDeposits(updatedPDs);

        // Sync and clear/deduct deposits from associated invoices
        if (onUpdateInvoices && invoices) {
          const deletedPds = (pendingDeposits || []).filter(p => targetIds.has(p.id));
          const updatedInvoices = invoices.map(inv => {
            const relatedDeletedPds = deletedPds.filter(pd => 
              pd.invoiceId === inv.id || String(pd.invoiceNumber) === String(inv.invoiceNumber)
            );
            if (relatedDeletedPds.length > 0) {
              const totalDeleted = relatedDeletedPds.reduce((sum, pd) => sum + (Number(pd.amount) || 0), 0);
              const deletedPdIds = new Set(relatedDeletedPds.map(pd => pd.id));
              const newDeposit = Math.max(0, (inv.deposit || 0) - totalDeleted);
              const remainingSlips = (inv.paymentSlips || []).filter(s => !deletedPdIds.has(s.id));
              return {
                ...inv,
                deposit: newDeposit,
                paymentSlips: remainingSlips.length > 0 ? remainingSlips : undefined
              };
            }
            return inv;
          });
          onUpdateInvoices(updatedInvoices);
        }

        setSelectedTxIds([]);
        setBatchDeleteModalOpen(false);
        setSuccess(`تعداد ${toPersianDigits(targetBatchItems.length)} سند بیعانه معلق با موفقیت حذف گردید.`);
        setTimeout(() => setSuccess(null), 5000);
        return;
      }

      if (!onUpdateTransactions) return;

      let runningTxs = [...transactions];
      let runningAccounts = [...accounts];
      let runningDocs = docs ? [...docs] : [];
      let runningPendingDeposits = pendingDeposits ? [...pendingDeposits] : [];
      let runningInvoices = invoices ? [...invoices] : [];
      let pdsChanged = false;
      let invsChanged = false;

      if (isPermanent) {
        (targetBatchItems as BankTransaction[]).forEach(tx => {
          // Atomic Permanent Delete
          const atomicResult = applyAtomicTransactionPermanentDelete(
            tx,
            runningTxs,
            runningAccounts
          );
          runningTxs = atomicResult.updatedTransactions;
          runningAccounts = atomicResult.updatedAccounts;

          // Hard-delete accounting docs
          runningDocs = runningDocs.filter(d => {
            const isRelated = d.txId === tx.id || (d.date === tx.date && d.lines.some(l => l.description === tx.description));
            return !isRelated;
          });

          // Revert associated pending deposits
          runningPendingDeposits = runningPendingDeposits.map(pd => {
            const isDirectMatch = (pd.clearedTxId === tx.id) || (tx.pendingDepositId && pd.id === tx.pendingDepositId);
            const isInvoiceMatch = tx.invoiceId && (
              (pd.invoiceId === tx.invoiceId || String(pd.invoiceNumber) === String(tx.invoiceId)) &&
              pd.status === 'cleared' &&
              (pd.amount === tx.amount || !pd.clearedTxId)
            );

            if (isDirectMatch || isInvoiceMatch) {
              pdsChanged = true;
              if (pd.id.startsWith('pd-cleared-')) {
                return null;
              }
              return {
                ...pd,
                status: 'pending' as const,
                clearedTxId: undefined,
                clearedDate: undefined
              };
            }
            return pd;
          }).filter((pd): pd is PendingDeposit => pd !== null);

          // Revert invoice deposit if not already deleted
          if (!tx.isDeleted) {
            const associatedInvIds = new Set<string>();
            if (tx.invoiceId) {
              tx.invoiceId.split(',').forEach(id => {
                if (id.trim()) associatedInvIds.add(id.trim());
              });
            }
            (pendingDeposits || []).forEach(pd => {
              if ((pd.clearedTxId === tx.id || pd.id === tx.pendingDepositId) && pd.invoiceId) {
                associatedInvIds.add(pd.invoiceId);
              }
            });

            if (associatedInvIds.size > 0) {
              invsChanged = true;
              runningInvoices = runningInvoices.map(inv => {
                if (associatedInvIds.has(inv.id) || associatedInvIds.has(String(inv.invoiceNumber))) {
                  const pendingTotal = (pendingDeposits || []).filter(p => (p.invoiceId === inv.id || String(p.invoiceNumber) === String(inv.invoiceNumber)) && !p.isDeleted).reduce((s, p) => s + (p.amount || 0), 0);
                  const newDeposit = Math.max(pendingTotal, Math.max(0, (inv.deposit || 0) - tx.amount));
                  return {
                    ...inv,
                    deposit: newDeposit
                  };
                }
                return inv;
              });
            }
          }
        });
      } else {
        // Soft Delete
        (targetBatchItems as BankTransaction[]).forEach(tx => {
          if (tx.isDeleted) return;

          const atomicResult = applyAtomicTransactionSoftDelete(
            tx,
            runningTxs,
            runningAccounts,
            currentUser
          );
          runningTxs = atomicResult.updatedTransactions;
          runningAccounts = atomicResult.updatedAccounts;

          // Soft-delete docs
          runningDocs = runningDocs.map(d => {
            const isRelated = d.txId === tx.id || (d.date === tx.date && d.lines.some(l => l.description === tx.description));
            if (isRelated) {
              return {
                ...d,
                isDeleted: true,
                deletedBy: currentUser?.name || '',
                deletedById: currentUser?.id || '',
                deletedAt: `${getTodayJalali()} - ${new Date().toLocaleTimeString('fa-IR')}`
              };
            }
            return d;
          });

          // Revert pending deposits
          runningPendingDeposits = runningPendingDeposits.map(pd => {
            const isDirectMatch = (pd.clearedTxId === tx.id) || (tx.pendingDepositId && pd.id === tx.pendingDepositId);
            const isInvoiceMatch = tx.invoiceId && (
              (pd.invoiceId === tx.invoiceId || String(pd.invoiceNumber) === String(tx.invoiceId)) &&
              pd.status === 'cleared' &&
              (pd.amount === tx.amount || !pd.clearedTxId)
            );

            if (isDirectMatch || isInvoiceMatch) {
              pdsChanged = true;
              if (pd.id.startsWith('pd-cleared-')) {
                return null;
              }
              return {
                ...pd,
                status: 'pending' as const,
                clearedTxId: undefined,
                clearedDate: undefined
              };
            }
            return pd;
          }).filter((pd): pd is PendingDeposit => pd !== null);

          // Revert invoice deposit
          const associatedInvIds = new Set<string>();
          if (tx.invoiceId) {
            tx.invoiceId.split(',').forEach(id => {
              if (id.trim()) associatedInvIds.add(id.trim());
            });
          }
          (pendingDeposits || []).forEach(pd => {
            if ((pd.clearedTxId === tx.id || pd.id === tx.pendingDepositId) && pd.invoiceId) {
              associatedInvIds.add(pd.invoiceId);
            }
          });

          if (associatedInvIds.size > 0) {
            invsChanged = true;
            runningInvoices = runningInvoices.map(inv => {
              if (associatedInvIds.has(inv.id) || associatedInvIds.has(String(inv.invoiceNumber))) {
                const pendingTotal = (pendingDeposits || []).filter(p => (p.invoiceId === inv.id || String(p.invoiceNumber) === String(inv.invoiceNumber)) && !p.isDeleted).reduce((s, p) => s + (p.amount || 0), 0);
                const newDeposit = Math.max(pendingTotal, Math.max(0, (inv.deposit || 0) - tx.amount));
                return {
                  ...inv,
                  deposit: newDeposit
                };
              }
              return inv;
            });
          }
        });
      }

      onUpdateTransactions(runningTxs);
      if (onUpdateAccounts) onUpdateAccounts(runningAccounts);
      if (onUpdateDocs) onUpdateDocs(runningDocs);
      if (pdsChanged && onUpdatePendingDeposits) onUpdatePendingDeposits(runningPendingDeposits);
      if (invsChanged && onUpdateInvoices) onUpdateInvoices(runningInvoices);

      setSelectedTxIds([]);
      setBatchDeleteModalOpen(false);
      setSuccess(
        isPermanent
          ? `تعداد ${toPersianDigits(targetBatchItems.length)} تراکنش به‌طور قطعی از پایگاه داده حذف گردید.`
          : `تعداد ${toPersianDigits(targetBatchItems.length)} تراکنش غیرفعال (Soft Delete) شد.`
      );
      setTimeout(() => setSuccess(null), 5000);
    } finally {
      setIsBatchDeleting(false);
    }
  };

  // States for settlement
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [showManualDropdown, setShowManualDropdown] = useState(false);
  const [activeManualIndex, setActiveManualIndex] = useState(-1);
  const [amountWarning, setAmountWarning] = useState<string | null>(null);
  const settlementDropdownContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        settlementDropdownContainerRef.current &&
        !settlementDropdownContainerRef.current.contains(event.target as Node)
      ) {
        setShowManualDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const openInvoices = React.useMemo(() => {
    const base = invoices.filter(inv => !inv.isDeleted && !inv.isProforma && (inv.totalAmount > 0 || (inv.paymentAmount && inv.paymentAmount > 0)));
    if (activeForm === 'receivableSettlement') {
      return base.filter(inv => inv.type === 'sale');
    }
    if (activeForm === 'settlement') {
      return base.filter(inv => inv.type === 'purchase');
    }
    return base;
  }, [invoices, activeForm]);

  const handleTabChange = (newTab: 'cost' | 'deposit' | 'withdrawal' | 'settlement' | 'receivableSettlement' | 'transfer' | 'loan') => {
    setActiveForm(newTab);
    setSelectedPendingDepositId('');
    setSelectedInvoiceIds([]);
    setAmount('');
    setDesc('');
    setToday();
  };

  // Handle selected pending deposit auto-filling across ALL forms
  React.useEffect(() => {
    if (selectedPendingDepositId && pendingDeposits) {
      const pd = pendingDeposits.find(p => p.id === selectedPendingDepositId);
      if (pd) {
        setAmount(String(pd.amount));
        if (pd.date) setDate(pd.date);
        
        // Find and link matching invoice
        const matchedInv = invoices.find(
          inv => inv.id === pd.invoiceId || String(inv.invoiceNumber).trim().toLowerCase() === String(pd.invoiceNumber).trim().toLowerCase()
        );
        if (matchedInv && (activeForm === 'settlement' || activeForm === 'receivableSettlement')) {
          setSelectedInvoiceIds([matchedInv.id]);
        }

        if (activeForm === 'settlement' || (activeForm === 'withdrawal' && pd.type === 'purchase')) {
          setDesc(`پرداخت قطعی بیعانه بابت فاکتور خرید شماره ${pd.invoiceNumber} - طرف حساب: ${pd.counterpartName}`);
        } else if (activeForm === 'receivableSettlement' || activeForm === 'deposit') {
          setDesc(`وصول قطعی بیعانه بابت فاکتور شماره ${pd.invoiceNumber} - طرف حساب: ${pd.counterpartName}`);
        }
      }
    }
  }, [selectedPendingDepositId, pendingDeposits, activeForm, invoices]);

  // Auto-update description (desc) only based on selected invoices, without touching the amount
  React.useEffect(() => {
    if (activeForm === 'settlement' || activeForm === 'receivableSettlement') {
      if (selectedInvoiceIds.length > 0) {
        const selectedInvs = openInvoices.filter(inv => selectedInvoiceIds.includes(inv.id));
        if (selectedInvs.length === 1) {
          const inv = selectedInvs[0];
          if (activeForm === 'settlement') {
            setDesc(`بابت تسویه بدهی فاکتور شماره ${inv.invoiceNumber} - طرف حساب: ${inv.counterpartName}`);
          } else {
            setDesc(`بابت تسویه طلب فاکتور شماره ${inv.invoiceNumber} - طرف حساب: ${inv.counterpartName}`);
          }
        } else {
          const numbers = selectedInvs.map(inv => inv.invoiceNumber).join('، ');
          if (activeForm === 'settlement') {
            setDesc(`بابت تسویه چندگانه فاکتورهای شماره [${numbers}]`);
          } else {
            setDesc(`بابت تسویه چندگانه مطالبات فاکتورهای شماره [${numbers}]`);
          }
        }
      } else {
        setDesc('');
      }
    }
  }, [activeForm, selectedInvoiceIds, openInvoices]);

  // Sorted and searched invoices
  const filteredInvoices = React.useMemo(() => {
    let list = openInvoices;
    const numAmount = parseFloat(amount);
    const cleanDate = date ? date.trim() : '';

    // Search filter
    if (manualSearchQuery.trim() !== '') {
      const q = manualSearchQuery.toLowerCase();
      list = list.filter(inv => 
        inv.counterpartName.toLowerCase().includes(q) ||
        (inv.counterpartPhone && inv.counterpartPhone.includes(q)) ||
        inv.invoiceNumber.toLowerCase().includes(q)
      );
    }
    
    // Calculate score for pending deposit matching (amount & date)
    const getMatchScore = (inv: Invoice) => {
      const matchingPendingList = (pendingDeposits || []).filter(
        pd => pd.status === 'pending' && !pd.isDeleted && (pd.invoiceId === inv.id || String(pd.invoiceNumber) === String(inv.invoiceNumber))
      );

      let score = 0;

      for (const matchingPending of matchingPendingList) {
        const amountMatches = !isNaN(numAmount) && numAmount > 0 && matchingPending.amount === numAmount;
        const pdDateClean = matchingPending.date ? matchingPending.date.trim() : '';
        const dateMatches = cleanDate !== '' && pdDateClean !== '' && pdDateClean === cleanDate;

        if (amountMatches && dateMatches) {
          score = Math.max(score, 10000); // Highest priority: Exact Pending Deposit Amount AND Date match
        } else if (amountMatches) {
          score = Math.max(score, 5000);  // Pending Deposit Amount match
        } else if (dateMatches) {
          score = Math.max(score, 2000);  // Pending Deposit Date match
        } else {
          score = Math.max(score, 1000);  // Has active pending deposit
        }
      }

      if (!isNaN(numAmount) && numAmount > 0) {
        const invAmountMatches = inv.totalAmount === numAmount || inv.paymentAmount === numAmount;
        const invDateClean = inv.date ? inv.date.trim() : '';
        const invDateMatches = cleanDate !== '' && invDateClean !== '' && invDateClean === cleanDate;

        if (invAmountMatches && invDateMatches) {
          score += 800;
        } else if (invAmountMatches) {
          score += 400;
        }
      }

      return score;
    };

    return [...list].sort((a, b) => getMatchScore(b) - getMatchScore(a));
  }, [openInvoices, manualSearchQuery, amount, date, pendingDeposits]);

  // Reset dropdown index when query changes
  React.useEffect(() => {
    setActiveManualIndex(-1);
  }, [manualSearchQuery]);

  // Toggle selection of invoice with dynamic warning
  const handleToggleInvoice = (inv: Invoice) => {
    const isSelected = selectedInvoiceIds.includes(inv.id);
    if (isSelected) {
      setSelectedInvoiceIds(prev => prev.filter(id => id !== inv.id));
      setAmountWarning(null);
      setShowManualDropdown(false);
    } else {
      const numAmount = parseFloat(amount) || 0;
      const invRemaining = Math.max(0, inv.totalAmount - (inv.deposit || 0));
      
      // Calculate current total of selected invoices
      const currentSelectedInvs = openInvoices.filter(i => selectedInvoiceIds.includes(i.id));
      const currentSum = currentSelectedInvs.reduce((sum, i) => sum + Math.max(0, i.totalAmount - (i.deposit || 0)), 0);
      
      // If amount is entered (> 0) and the new total would exceed the entered amount (restricted to second or subsequent invoice selection)
      if (selectedInvoiceIds.length >= 1 && numAmount > 0 && numAmount < currentSum + invRemaining) {
        setAmountWarning('امکان انتخاب فاکتور جدید وجود ندارد، مبلغ وارد شده کمتر از مجموع فاکتورها است.');
        // Hide warning automatically after 5 seconds
        setTimeout(() => setAmountWarning(null), 5000);
        return;
      }
      
      setSelectedInvoiceIds(prev => [...prev, inv.id]);
      setAmountWarning(null);
      setShowManualDropdown(false);
    }
  };

  // Synchronize category select
  const handleParentCatChange = (val: string) => {
    setParentCat(val);
    const found = categories.find(c => c.name === val);
    if (found && found.subcategories.length > 0) {
      setChildCat(found.subcategories[0]);
    } else {
      setChildCat('سایر موارد');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('لطفاً مبلغ معتبری بزرگتر از صفر وارد کنید.');
      return;
    }

    const dateVal = validateFiscalDate(date, fiscalYear, { entityName: 'تراکنش' });
    if (!dateVal.valid) {
      alert(dateVal.error);
      return;
    }

    if (activeForm === 'settlement' || activeForm === 'receivableSettlement') {
      if (selectedInvoiceIds.length === 0 && !selectedPendingDepositId) {
        alert('لطفاً حداقل یک فاکتور یا بیعانه معلق جهت تسویه انتخاب فرمایید.');
        return;
      }

      // If user selected a pending deposit directly but no invoice was explicitly selected, resolve the matching invoice
      let targetSelectedInvs = openInvoices.filter(inv => selectedInvoiceIds.includes(inv.id));
      if (targetSelectedInvs.length === 0 && selectedPendingDepositId && pendingDeposits) {
        const pd = pendingDeposits.find(p => p.id === selectedPendingDepositId);
        if (pd) {
          const matchedInv = invoices.find(
            inv => inv.id === pd.invoiceId || String(inv.invoiceNumber).trim().toLowerCase() === String(pd.invoiceNumber).trim().toLowerCase()
          );
          if (matchedInv) {
            targetSelectedInvs = [matchedInv];
            setSelectedInvoiceIds([matchedInv.id]);
          }
        }
      }

      const firstInv = targetSelectedInvs[0];
      const isSale = activeForm === 'receivableSettlement' || (firstInv ? firstInv.type === 'sale' : true);
      const txType: 'deposit' | 'withdrawal' = isSale ? 'deposit' : 'withdrawal';
      const invoiceNumbersStr = targetSelectedInvs.map(inv => inv.invoiceNumber).join('، ');

      const newTx: BankTransaction = {
        id: `tx-manual-settlement-${Date.now()}`,
        date,
        time,
        amount: numAmount,
        type: txType,
        description: desc || (activeForm === 'settlement' 
          ? (invoiceNumbersStr ? `تسویه بدهی فاکتورهای شماره ${invoiceNumbersStr}` : `تسویه بدهی خرید به مبلغ ${formatCurrency(numAmount)}`)
          : (invoiceNumbersStr ? `تسویه مطالبات فاکتورهای شماره ${invoiceNumbersStr}` : `تسویه مطالبات فروش به مبلغ ${formatCurrency(numAmount)}`)),
        isRegistered: true,
        categoryParent: isSale ? 'وصول مطالبات مشتریان' : 'پرداخت بدهی تامین‌کنندگان',
        categoryChild: isSale ? 'وصول فاکتور فروش' : 'تسویه فاکتور خرید',
        userDescription: desc,
        registeredDate: new Date().toLocaleDateString('fa-IR'),
        isDuplicate: false,
        pendingDepositId: selectedPendingDepositId || undefined
      };

      onAddTransaction(newTx, selectedAccount);

      let generatedAllocations: Array<{ invoiceId: string; invoiceNumber: string; amount: number; date: string; method: string; reference?: string }> = [];

      if (onUpdateInvoices && firstInv) {
        const { updatedInvoices, allocations } = allocatePaymentToInvoices(
          invoices,
          firstInv.counterpartId || '',
          isSale ? 'sale' : 'purchase',
          numAmount,
          date,
          'bank_transfer',
          newTx.id,
          pendingDeposits
        );
        generatedAllocations = allocations;

        onUpdateInvoices(updatedInvoices);

        // Sync payment allocations to authoritative server endpoint
        allocations.forEach(alloc => {
          postPaymentAllocations({
            invoiceId: alloc.invoiceId,
            allocations: [{
              id: `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              date: alloc.date,
              amount: alloc.amount,
              method: alloc.method,
              reference: alloc.reference,
              status: 'cleared',
              clearedTxId: newTx.id,
              clearedDate: date
            }]
          }).catch(() => {});
        });
      }

      // Automatically clear ONLY the matching pending deposit(s) associated with settled invoices or selected pending deposit
      if (onUpdatePendingDeposits && pendingDeposits) {
        let pdsChanged = false;
        const targetInvoiceIds = new Set(selectedInvoiceIds.map(String));
        if (firstInv?.id) targetInvoiceIds.add(String(firstInv.id));
        const targetInvoiceNums = new Set(
          targetSelectedInvs.map(inv => String(inv.invoiceNumber).trim().toLowerCase())
        );
        if (firstInv?.invoiceNumber) targetInvoiceNums.add(String(firstInv.invoiceNumber).trim().toLowerCase());

        generatedAllocations.forEach(alloc => {
          if (alloc.invoiceId) targetInvoiceIds.add(String(alloc.invoiceId));
          if (alloc.invoiceNumber) targetInvoiceNums.add(String(alloc.invoiceNumber).trim().toLowerCase());
        });

        // Determine which specific pending deposit IDs to clear
        const pdsToClearIds = new Set<string>();

        if (selectedPendingDepositId) {
          // Explicit pending deposit selected: ONLY clear this exact one!
          pdsToClearIds.add(selectedPendingDepositId);
        } else {
          // Find pending deposits belonging to the target invoice(s)
          const candidatePds = pendingDeposits.filter(pd => {
            if (pd.status !== 'pending' || pd.isDeleted) return false;
            const pdInvIdStr = String(pd.invoiceId || '').trim();
            const pdInvNumStr = String(pd.invoiceNumber || '').trim().toLowerCase();
            const matchesId = pdInvIdStr !== '' && targetInvoiceIds.has(pdInvIdStr);
            const matchesNum = pdInvNumStr !== '' && targetInvoiceNums.has(pdInvNumStr);
            const matchesCounterpart = Boolean(
              firstInv?.counterpartId && 
              (pd.counterpartId === firstInv.counterpartId || (pd.counterpartName && pd.counterpartName.trim() === (firstInv.counterpartName || '').trim()))
            );
            return matchesId || matchesNum || matchesCounterpart;
          });

          // 1. Try exact amount match first (e.g. user entered the exact amount of one pending deposit)
          const exactMatchPd = candidatePds.find(pd => pd.amount === numAmount);
          if (exactMatchPd) {
            pdsToClearIds.add(exactMatchPd.id);
          } else {
            // 2. Otherwise, allocate greedily up to numAmount
            let runningAmount = numAmount;
            for (const pd of candidatePds) {
              if (runningAmount >= pd.amount) {
                pdsToClearIds.add(pd.id);
                runningAmount -= pd.amount;
              }
            }
          }
        }

        if (pdsToClearIds.size > 0) {
          const updatedPendingDeposits = pendingDeposits.map(pd => {
            if (pdsToClearIds.has(pd.id) && pd.status === 'pending') {
              pdsChanged = true;
              return {
                ...pd,
                status: 'cleared' as const,
                clearedTxId: newTx.id,
                clearedDate: date
              };
            }
            return pd;
          });

          if (pdsChanged) {
            onUpdatePendingDeposits(updatedPendingDeposits);
          }
        }
      }

      setSuccess(`تسویه ${activeForm === 'settlement' ? 'بدهی' : 'طلب/مطالبات'} به مبلغ ${formatCurrency(numAmount)} با موفقیت ثبت گردید و بیعانه معلق مربوطه وصول شد.`);
      setAmount('');
      setDesc('');
      setSelectedInvoiceIds([]);
      setSelectedPendingDepositId('');
      setTimeout(() => setSuccess(null), 6000);
      return;
    }

    if (activeForm === 'transfer') {
      if (transferFromAccountId === transferToAccountId) {
        alert('حساب مبدا و مقصد نمی‌توانند یکسان باشند.');
        return;
      }
      if (onAddTransfer) {
        onAddTransfer(numAmount, transferFromAccountId, transferToAccountId, date, time, desc);
        const fromAccName = accounts.find(a => a.id === transferFromAccountId)?.name || 'حساب مبدا';
        const toAccName = accounts.find(a => a.id === transferToAccountId)?.name || 'حساب مقصد';
        setSuccess(`انتقال وجه به مبلغ ${formatCurrency(numAmount)} از "${fromAccName}" به "${toAccName}" با موفقیت ثبت شد.`);
        setAmount('');
        setDesc('');
        setTimeout(() => setSuccess(null), 6000);
      } else {
        alert('تابع ثبت انتقال در دسترس نیست.');
      }
      return;
    }

    if (activeForm === 'loan') {
      if (!selectedBorrowerId) {
        alert('لطفاً وام‌گیرنده را از لیست انتخاب فرمایید.');
        return;
      }
      const borrower = loanBorrowers.find(b => b.id === selectedBorrowerId);
      if (!borrower) {
        alert('وام‌گیرنده انتخاب شده در لیست یافت نشد.');
        return;
      }
      const isPayout = loanSubTab === 'payout';
      const newTx: BankTransaction = {
        id: `tx-loan-${Date.now()}`,
        date,
        time,
        amount: numAmount,
        type: isPayout ? 'withdrawal' : 'deposit',
        accountId: selectedAccount,
        description: desc.trim() || (isPayout ? `پرداخت وام به ${borrower.name}` : `تسویه حساب وام توسط ${borrower.name}`),
        isRegistered: true,
        categoryParent: 'مدیریت وام‌ها',
        categoryChild: isPayout ? 'پرداخت وام' : 'تسویه حساب وام',
        userDescription: desc,
        registeredDate: new Date().toLocaleDateString('fa-IR'),
        borrowerId: borrower.id,
        borrowerName: borrower.name,
        loanType: isPayout ? 'payout' : 'repayment'
      };

      onAddTransaction(newTx, selectedAccount);

      setSuccess(`تراکنش ${isPayout ? 'پرداخت وام به' : 'تسویه حساب وام توسط'} "${borrower.name}" به مبلغ ${formatCurrency(numAmount)} با موفقیت ثبت شد.`);
      setAmount('');
      setDesc('');
      setTimeout(() => setSuccess(null), 6000);
      return;
    }

    const type: 'deposit' | 'withdrawal' = activeForm === 'deposit' ? 'deposit' : 'withdrawal';
    const partner = activeForm === 'withdrawal' && selectedPartnerId ? partners.find(p => p.id === selectedPartnerId) : undefined;

    let isStockUpdated = false;
    let updatedItemsList = [...items];
    let customParentCat = parentCat;
    let customChildCat = childCat;
    let customDesc = desc;

    if (activeForm === 'cost') {
      if (costSubTab === 'waste') {
        if (!selectedItemId) {
          alert('لطفاً کالا را انتخاب کنید.');
          return;
        }
        const selectedItem = items.find(it => it.id === selectedItemId);
        if (!selectedItem) {
          alert('کالای انتخاب شده یافت نشد.');
          return;
        }
        const qtyNum = parseInt(itemQty);
        if (isNaN(qtyNum) || qtyNum <= 0) {
          alert('لطفاً تعداد ضایعات معتبری بزرگتر از صفر وارد کنید.');
          return;
        }
        if (qtyNum > selectedItem.qty) {
          alert(`موجودی کافی نیست. موجودی فعلی این کالا: ${selectedItem.qty}`);
          return;
        }

        updatedItemsList = items.map(it => {
          if (it.id === selectedItemId) {
            return { ...it, qty: it.qty - qtyNum };
          }
          return it;
        });
        isStockUpdated = true;

        customParentCat = 'هزینه‌های دفتر مرکزی';
        customChildCat = 'ملزومات اداری و کاغذ';
        customDesc = desc || `ثبت ضایعات کالا: تعداد ${qtyNum} از ${selectedItem.name}`;
      } else if (costSubTab === 'consumable') {
        if (!selectedItemId) {
          alert('لطفاً قلم مصرفی را انتخاب کنید.');
          return;
        }
        const selectedItem = items.find(it => it.id === selectedItemId);
        if (!selectedItem) {
          alert('قلم مصرفی انتخاب شده یافت نشد.');
          return;
        }
        const qtyNum = parseInt(itemQty);
        if (isNaN(qtyNum) || qtyNum <= 0) {
          alert('لطفاً تعداد مصرفی معتبری بزرگتر از صفر وارد کنید.');
          return;
        }
        if (qtyNum > selectedItem.qty) {
          alert(`موجودی کافی نیست. موجودی فعلی این قلم: ${selectedItem.qty}`);
          return;
        }

        updatedItemsList = items.map(it => {
          if (it.id === selectedItemId) {
            return { ...it, qty: it.qty - qtyNum };
          }
          return it;
        });
        isStockUpdated = true;

        customParentCat = 'تبلیغات و بازاریابی';
        customChildCat = 'طراحی پوستر و کاتالوگ';
        customDesc = desc || `ثبت مواد و اقلام مصرفی: تعداد ${qtyNum} از ${selectedItem.name}`;
      }
    }

    if (isStockUpdated && onUpdateItems) {
      onUpdateItems(updatedItemsList);
    }

    const newTx: BankTransaction = {
      id: `tx-manual-${Date.now()}`,
      date,
      time,
      amount: numAmount,
      type,
      accountId: (activeForm === 'cost' && (costSubTab === 'waste' || costSubTab === 'consumable')) ? 'none' : selectedAccount,
      description: customDesc || `ثبت دستی ${activeForm === 'cost' ? (costSubTab === 'waste' ? 'ضایعات کالا' : costSubTab === 'consumable' ? 'مواد مصرفی' : 'هزینه') : activeForm === 'deposit' ? 'واریزی' : 'برداشت'}`,
      isRegistered: true,
      categoryParent: activeForm === 'cost' ? customParentCat : (activeForm === 'deposit' ? 'منابع دریافتی دستی' : 'برداشت نقدی'),
      categoryChild: activeForm === 'cost' ? customChildCat : (activeForm === 'deposit' ? 'واریز نقدی به حساب' : (partner ? `برداشت شریک: ${partner.name}` : 'برداشت جهت تنخواه‌گردان')),
      userDescription: desc,
      registeredDate: new Date().toLocaleDateString('fa-IR'),
      isDuplicate: false,
      partnerId: partner?.id,
      pendingDepositId: selectedPendingDepositId || undefined
    };

    onAddTransaction(newTx, (activeForm === 'cost' && (costSubTab === 'waste' || costSubTab === 'consumable')) ? 'none' : selectedAccount);

    // If connected to a pending deposit or matching an open pending deposit:
    if ((activeForm === 'deposit' || activeForm === 'withdrawal') && pendingDeposits) {
      let targetPdId = selectedPendingDepositId;
      if (!targetPdId) {
        // Auto-match if there is an exact match on amount and type with status: 'pending'
        const expectedType = activeForm === 'withdrawal' ? 'purchase' : 'sale';
        const candidate = pendingDeposits.find(pd => 
          pd.status === 'pending' && 
          !pd.isDeleted && 
          pd.amount === numAmount && 
          (pd.type === expectedType || (activeForm === 'deposit' && !pd.type))
        );
        if (candidate) {
          targetPdId = candidate.id;
        }
      }

      if (targetPdId) {
        let matchedPendingDeposit: PendingDeposit | null = null;
        const updatedPendingDeposits = pendingDeposits.map(pd => {
          if (pd.id === targetPdId) {
            matchedPendingDeposit = pd;
            return {
              ...pd,
              status: 'cleared' as const,
              clearedTxId: newTx.id,
              clearedDate: date
            };
          }
          return pd;
        });

        if (onUpdatePendingDeposits) {
          onUpdatePendingDeposits(updatedPendingDeposits);
        }

        if (matchedPendingDeposit && onUpdateInvoices && invoices) {
          const pd: PendingDeposit = matchedPendingDeposit;
          const updatedInvoices = invoices.map(inv => {
            const normNum = (s: any) => String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString()).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).trim().toLowerCase();
            if (inv.id === pd.invoiceId || normNum(inv.invoiceNumber) === normNum(pd.invoiceNumber)) {
              const currentDeposit = Number(inv.deposit) || 0;
              const coveredPending = Math.min(numAmount, pd.amount);
              const additionalPayment = Math.max(0, numAmount - coveredPending);
              // Clean in case previous bug doubled it (deposit === 2 * pd.amount)
              const cleanDeposit = (currentDeposit === pd.amount * 2 && (inv.paymentSlips || []).length <= 1)
                ? pd.amount
                : currentDeposit;
              const newDeposit = Math.max(cleanDeposit, pd.amount) + additionalPayment;
              const actionLabel = pd.type === 'purchase' ? 'پرداخت' : 'وصول';
              const logNote = `[${actionLabel} قطعی بیعانه معلق به مبلغ ${formatCurrency(pd.amount)} در تاریخ ${date}.]`;
              const hasLog = (inv.description || '').includes(logNote);
              const settlementDesc = hasLog ? (inv.description || '') : ((inv.description ? inv.description + '\n' : '') + logNote);
              return {
                ...inv,
                deposit: newDeposit,
                description: settlementDesc
              };
            }
            return inv;
          });

          onUpdateInvoices(updatedInvoices);
        }
      }
    }

    setSuccess(`تراکنش ثبت دستی ${activeForm === 'cost' ? (costSubTab === 'waste' ? 'ضایعات کالا' : costSubTab === 'consumable' ? 'مواد مصرفی' : 'هزینه') : activeForm === 'deposit' ? 'واریز' : 'برداشت'} به مبلغ ${formatCurrency(numAmount)} با موفقیت در دفاتر ثبت و بر موجودی بانک اعمال شد.`);
    
    // Clear form state
    setAmount('');
    setDesc('');
    setSelectedPartnerId('');
    setSelectedPendingDepositId('');
    setSelectedItemId('');
    setItemSearchQuery('');
    setIsItemDropdownOpen(false);
    setItemQty('');
    setTimeout(() => setSuccess(null), 6000);
  };

  // Helper date setter
  const setToday = () => {
    setDate(new Date().toLocaleDateString('fa-IR'));
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    setTime(`${hrs}:${mins}`);
  };

  const filteredItemsToSelect = items
    .filter(item => costSubTab === 'waste' ? item.type === 'kala' : item.type === 'consumables')
    .filter(item => {
      if (!itemSearchQuery) return true;
      return item.name.toLowerCase().includes(itemSearchQuery.toLowerCase());
    });

  const getSearchSelectValue = () => {
    if (isItemDropdownOpen) {
      return itemSearchQuery;
    }
    const selectedItemObj = items.find(it => it.id === selectedItemId);
    return selectedItemObj ? selectedItemObj.name : '';
  };

  const renderItemSearchSelect = () => {
    return (
      <div className="relative">
        <input
          type="text"
          value={getSearchSelectValue()}
          onChange={(e) => {
            setItemSearchQuery(e.target.value);
            setIsItemDropdownOpen(true);
            if (selectedItemId) {
              setSelectedItemId('');
            }
          }}
          onFocus={() => {
            setIsItemDropdownOpen(true);
            const sel = items.find(it => it.id === selectedItemId);
            if (sel) {
              setItemSearchQuery(sel.name);
            }
          }}
          onBlur={() => setTimeout(() => setIsItemDropdownOpen(false), 250)}
          placeholder={costSubTab === 'waste' ? "جستجو و انتخاب کالا..." : "جستجو و انتخاب قلم مصرفی..."}
          className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
          required
        />
        {selectedItemId && (
          <button
            type="button"
            onClick={() => {
              setSelectedItemId('');
              setItemSearchQuery('');
              setIsItemDropdownOpen(false);
            }}
            className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        
        {isItemDropdownOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100 dropdown-solid">
            {filteredItemsToSelect.map(item => (
              <div
                key={item.id}
                onMouseDown={() => {
                  setSelectedItemId(item.id);
                  setItemSearchQuery(item.name);
                  setIsItemDropdownOpen(false);
                }}
                className="p-2.5 text-right text-xs transition-colors cursor-pointer hover:bg-slate-50 flex items-center justify-between"
              >
                <span className="font-bold text-slate-800">{item.name}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  (موجودی: {toPersianDigits(item.qty)} {item.unit || 'عدد'} | خرید: {formatCurrency(item.lastPurchasePrice || 0)})
                </span>
              </div>
            ))}
            {filteredItemsToSelect.length === 0 && (
              <div className="p-3 text-center text-xs text-slate-400">
                کالایی یافت نشد.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const currencyLabel = localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 space-y-6 shadow-sm">
      
      {/* Header and fast toggles */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-5 gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">ثبت تراکنش</h2>
          <p className="text-slate-500 text-sm mt-1">ثبت هزینه و واریز</p>
        </div>

        {/* Form Selector buttons */}
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 w-fit self-start md:self-auto gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => handleTabChange('cost')}
            className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
              activeForm === 'cost' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5 inline-block ml-1" />
            <span>ثبت هزینه/ضایعات/مصرفی</span>
          </button>
          
          <button
            type="button"
            onClick={() => handleTabChange('deposit')}
            className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
              activeForm === 'deposit' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 inline-block ml-1" />
            <span>ثبت واریز</span>
          </button>
          
          <button
            type="button"
            onClick={() => handleTabChange('withdrawal')}
            className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
              activeForm === 'withdrawal' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-3.5 h-3.5 inline-block ml-1" />
            <span>ثبت برداشت</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('settlement')}
            className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
              activeForm === 'settlement' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5 inline-block ml-1" />
            <span>تسویه بدهی‌ها</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('receivableSettlement')}
            className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
              activeForm === 'receivableSettlement' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5 inline-block ml-1" />
            <span>تسویه مطالبات</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('transfer')}
            className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
              activeForm === 'transfer' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-3.5 h-3.5 inline-block ml-1" />
            <span>مدیریت صندوق</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('loan')}
            className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
              activeForm === 'loan' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <HandCoins className="w-3.5 h-3.5 inline-block ml-1" />
            <span>مدیریت وام</span>
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-sm font-semibold">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Main input form */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
        
        {/* Three small sub-tabs for Cost / Waste / Consumables */}
        {activeForm === 'cost' && (
          <div className="col-span-1 md:col-span-2 flex border-b border-slate-200/60 pb-3 gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setCostSubTab('expense')}
              className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                costSubTab === 'expense'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-800 hover:bg-slate-200'
              }`}
            >
              ثبت هزینه
            </button>
            <button
              type="button"
              onClick={() => setCostSubTab('waste')}
              className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                costSubTab === 'waste'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-800 hover:bg-slate-200'
              }`}
            >
              ثبت ضایعات کالا
            </button>
            <button
              type="button"
              onClick={() => setCostSubTab('consumable')}
              className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                costSubTab === 'consumable'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-800 hover:bg-slate-200'
              }`}
            >
              ثبت مواد و اقلام مصرفی
            </button>
          </div>
        )}

        {/* Sub-tabs for Loan Management (Payout / Repayment) */}
        {activeForm === 'loan' && (
          <div className="col-span-1 md:col-span-2 flex border-b border-slate-200/60 pb-3 gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setLoanSubTab('payout')}
              className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                loanSubTab === 'payout'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-800 hover:bg-slate-200'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 inline-block ml-1" />
              <span>پرداخت وام</span>
            </button>
            <button
              type="button"
              onClick={() => setLoanSubTab('repayment')}
              className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                loanSubTab === 'repayment'
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-800 hover:bg-slate-200'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 inline-block ml-1" />
              <span>تسویه حساب وام</span>
            </button>
          </div>
        )}

        {activeForm === 'cost' && (costSubTab === 'waste' || costSubTab === 'consumable') ? (
          <div className="col-span-1 md:col-span-2 space-y-4">
            {/* Row 1: Item search, Quantity, Calculated Cost */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              {/* Item Selector */}
              <div className="md:col-span-6 space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block">
                  {costSubTab === 'waste' ? 'انتخاب کالا جهت ثبت ضایعات' : 'انتخاب مواد مصرفی و تبلیغاتی'}
                </label>
                {renderItemSearchSelect()}
              </div>

              {/* Quantity Input */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block">
                  {costSubTab === 'waste' ? 'مقدار / تعداد ضایعات' : 'مقدار / تعداد مصرف شده'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={itemQty}
                  onChange={(e) => setItemQty(e.target.value)}
                  placeholder="مثال: ۵"
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-center focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              {/* Calculated Cost */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block">برآورد هزینه کل ({currencyLabel})</label>
                <div className="relative rounded-lg shadow-sm">
                  <input
                    type="text"
                    value={amount ? toPersianDigits(parseInt(amount.replace(/[^0-9]/g, ''), 10).toLocaleString('en-US')) : ''}
                    readOnly
                    placeholder="هزینه کل"
                    className="w-full pl-12 pr-4 py-2.5 rounded-lg border border-slate-200 bg-slate-100 text-xs font-bold text-right text-slate-700"
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-[10px] font-semibold">
                    {currencyLabel}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Date, Time, Description */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              {/* Date & Time combined */}
              <div className="md:col-span-5 grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">تاریخ انجام</label>
                  <JalaliDatePicker
                    value={date}
                    onChange={(val) => setDate(val)}
                    placeholder="۱۴۰۳/۰۳/۱۵"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">ساعت انجام</label>
                  <input
                    type="text"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs font-mono text-center focus:ring-2 focus:ring-rose-500"
                    placeholder="۱۲:۰۰"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div className="md:col-span-7 space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block">
                  {costSubTab === 'waste' ? 'شرح تفصیلی ضایعات' : 'شرح تفصیلی مصرف اقلام'}
                </label>
                <input
                  type="text"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder={costSubTab === 'waste' ? "مثال: ضایعات کارتن‌های ارسالی یا کسر به علت شکستگی کالا..." : "مثال: مصرف کاغذ ملو مل، بروشورهای نمایشگاه، ملزومات بسته‌بندی..."}
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            {/* Row 3: Action Buttons */}
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={setToday}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs cursor-pointer transition-colors"
              >
                به زمان جاری سیستم
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs shadow hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{costSubTab === 'waste' ? 'ثبت ضایعات کالا' : 'ثبت مصرف اقلام'}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Left column info */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block">مبلغ تراکنش ({currencyLabel})</label>
                <div className="relative rounded-lg shadow-sm">
                  <input
                    type="text"
                    value={amount ? toPersianDigits(parseInt(amount.replace(/[^0-9]/g, ''), 10).toLocaleString('en-US')) : ''}
                    onChange={(e) => {
                      const p2e = (str: string) => {
                        return str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                                  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
                      };
                      const english = p2e(e.target.value);
                      const clean = english.replace(/[^0-9]/g, '');
                      setAmount(clean);
                    }}
                    placeholder="مثال: ۱۵,۰۰۰,۰۰۰"
                    className="w-full pl-12 pr-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 bg-white text-md font-bold text-right"
                    required
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-semibold">
                    {currencyLabel}
                  </div>
                </div>
                {amount && (
                  <span className="text-[11px] font-semibold text-blue-600 block mt-1">
                    معادل: {formatCurrency(parseFloat(amount) || 0)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">تاریخ انجام</label>
                  <JalaliDatePicker
                    value={date}
                    onChange={(val) => setDate(val)}
                    placeholder="۱۴۰۳/۰۳/۱۵"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">ساعت انجام</label>
                  <input
                    type="text"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs font-mono text-center"
                    placeholder="۱۲:۰۰"
                    required
                  />
                </div>
              </div>

              {activeForm !== 'transfer' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">انتخاب حساب معین تجاری</label>
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                    required
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} (موجودی فعلی: {formatCurrency(acc.balance)})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 block">حساب/صندوق مبدأ (برداشت وجه)</label>
                    <select
                      value={transferFromAccountId}
                      onChange={(e) => {
                        const fromId = e.target.value;
                        setTransferFromAccountId(fromId);
                        if (fromId === transferToAccountId) {
                          const other = accounts.find(a => a.id !== fromId);
                          if (other) setTransferToAccountId(other.id);
                        }
                      }}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 font-bold"
                      required
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} (موجودی: {formatCurrency(acc.balance)})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 block">حساب/صندوق مقصد (واریز وجه)</label>
                    <select
                      value={transferToAccountId}
                      onChange={(e) => setTransferToAccountId(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 font-bold"
                      required
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id} disabled={acc.id === transferFromAccountId}>{acc.name} (موجودی: {formatCurrency(acc.balance)})</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Right column context based */}
            <div className="space-y-4 flex flex-col justify-between">
              
              {activeForm === 'cost' ? (
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                     <div className="flex items-center justify-between">
                       <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">سرفصل کلی هزینه</label>
                       <button
                         type="button"
                         onClick={handleOpenCreateCategoryModal}
                         className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors border border-emerald-200/60 dark:border-emerald-800/60"
                         title="تعریف سرفصل و زیرمجموعه‌های جدید"
                       >
                         <Plus className="w-3.5 h-3.5" />
                         <span>تعریف سرفصل</span>
                       </button>
                     </div>
                     <div className="flex items-center gap-1.5">
                       <select
                         value={parentCat}
                         onChange={(e) => handleParentCatChange(e.target.value)}
                         className="flex-1 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100"
                       >
                         {categories.map(c => (
                           <option key={c.id} value={c.name}>{c.name}</option>
                         ))}
                       </select>
                       <button
                         type="button"
                         onClick={handleOpenEditCategoryModal}
                         className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center shrink-0 cursor-pointer shadow-sm"
                         title="ویرایش و مدیریت سرفصل انتخاب‌شده"
                       >
                         <Edit className="w-4 h-4" />
                       </button>
                     </div>
                   </div>

                   <div className="space-y-1.5">
                     <label className="text-xs font-bold text-slate-600 block">ریزمجموعه معین هزینه</label>
                     <select
                       value={childCat}
                       onChange={(e) => setChildCat(e.target.value)}
                       className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                     >
                       {categories.find(c => c.name === parentCat)?.subcategories.map((sub, i) => (
                         <option key={i} value={sub}>{sub}</option>
                       )) || <option value="سایر موارد">سایر موارد هزینه</option>}
                     </select>
                   </div>
                </div>
              ) : (activeForm === 'settlement' || activeForm === 'receivableSettlement') ? (
                <div ref={settlementDropdownContainerRef} className="space-y-3 relative">
                  {/* Quick Pending Deposit Connection */}
                  {pendingDeposits && pendingDeposits.filter(p => p.status === 'pending' && !p.isDeleted && (activeForm === 'settlement' ? p.type === 'purchase' : p.type !== 'purchase')).length > 0 && (
                    <div className={`p-3 rounded-xl border space-y-1.5 ${
                      activeForm === 'settlement' 
                        ? 'bg-violet-50/80 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900/60' 
                        : 'bg-teal-50/80 dark:bg-teal-950/30 border-teal-200 dark:border-teal-900/60'
                    }`}>
                      <div className="flex items-center justify-between">
                        <label className={`text-xs font-bold flex items-center gap-1.5 ${
                          activeForm === 'settlement' ? 'text-violet-800 dark:text-violet-300' : 'text-teal-800 dark:text-teal-300'
                        }`}>
                          <CheckCircle className="w-4 h-4" />
                          {activeForm === 'settlement' 
                            ? 'انتخاب سریع بیعانه معلق خرید جهت تسویه:' 
                            : 'انتخاب سریع بیعانه معلق فروش جهت وصول:'}
                        </label>
                        {selectedPendingDepositId && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPendingDepositId('');
                              setSelectedInvoiceIds([]);
                              setAmount('');
                              setDesc('');
                            }}
                            className="text-[10px] text-rose-600 hover:text-rose-700 font-bold cursor-pointer"
                          >
                            ✕ لغو انتخاب بیعانه
                          </button>
                        )}
                      </div>
                      <select
                        value={selectedPendingDepositId}
                        onChange={(e) => setSelectedPendingDepositId(e.target.value)}
                        className={`w-full p-2.5 rounded-lg border bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 font-semibold ${
                          activeForm === 'settlement' ? 'border-violet-300 focus:ring-violet-500' : 'border-teal-300 focus:ring-teal-500'
                        }`}
                      >
                        <option value="">-- برای تسویه و وصول مستقیم، بیعانه معلق را انتخاب کنید --</option>
                        {(() => {
                          const validPds = pendingDeposits.filter(p => p.status === 'pending' && !p.isDeleted && (activeForm === 'settlement' ? p.type === 'purchase' : p.type !== 'purchase'));
                          const counts: Record<string, number> = {};
                          validPds.forEach(p => {
                            const key = String(p.invoiceNumber || p.invoiceId);
                            counts[key] = (counts[key] || 0) + 1;
                          });
                          const indices: Record<string, number> = {};

                          return validPds.map(p => {
                            const key = String(p.invoiceNumber || p.invoiceId);
                            const hasMultiple = (counts[key] || 0) > 1;
                            indices[key] = (indices[key] || 0) + 1;
                            const idxStr = hasMultiple ? ` (بیعانه ${toPersianDigits(indices[key])})` : '';

                            return (
                              <option key={p.id} value={p.id}>
                                فاکتور #{toPersianDigits(p.invoiceNumber)}{idxStr} - طرف حساب: {p.counterpartName} (مبلغ: {formatCurrency(p.amount)} - تاریخ: {toPersianDigits(p.date)})
                              </option>
                            );
                          });
                        })()}
                      </select>
                    </div>
                  )}

                  <label className="text-xs font-bold text-slate-600 block">
                    {activeForm === 'settlement' 
                      ? 'جستجو و انتخاب فاکتورهای باز (جهت تسویه بدهی چندگانه)' 
                      : 'جستجو و انتخاب فاکتورهای باز (جهت تسویه مطالبات چندگانه)'}
                  </label>
                  {openInvoices.length > 0 ? (
                    <div className="relative">
                      <input
                        type="text"
                        value={manualSearchQuery}
                        onChange={(e) => {
                          setManualSearchQuery(e.target.value);
                          setShowManualDropdown(true);
                        }}
                        onFocus={() => setShowManualDropdown(true)}
                        onKeyDown={(e) => {
                          if (filteredInvoices.length > 0) {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setShowManualDropdown(true);
                              setActiveManualIndex(prev => (prev + 1) % filteredInvoices.length);
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setShowManualDropdown(true);
                              setActiveManualIndex(prev => (prev - 1 + filteredInvoices.length) % filteredInvoices.length);
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              if (activeManualIndex >= 0 && activeManualIndex < filteredInvoices.length) {
                                const inv = filteredInvoices[activeManualIndex];
                                handleToggleInvoice(inv);
                              }
                            } else if (e.key === 'Escape') {
                              setShowManualDropdown(false);
                            }
                          }
                        }}
                        placeholder={activeForm === 'settlement' 
                          ? 'نام طرف حساب، تلفن یا شماره فاکتور خرید را جهت انتخاب جستجو کنید...' 
                          : 'نام مشتری، تلفن یا شماره فاکتور فروش را جهت انتخاب جستجو کنید...'}
                        className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      
                      {showManualDropdown && (
                        <div className="absolute z-30 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 dropdown-solid">
                          {filteredInvoices.map((inv, idx) => {
                            const isSelected = selectedInvoiceIds.includes(inv.id);
                            const matchingPendingDeps = (pendingDeposits || []).filter(
                              pd => pd.status === 'pending' && !pd.isDeleted && (pd.invoiceId === inv.id || String(pd.invoiceNumber) === String(inv.invoiceNumber))
                            );
                            const numAmount = parseFloat(amount);
                            const cleanDate = date ? date.trim() : '';

                            const bestPendingMatch = matchingPendingDeps.find(pd => {
                              const amountMatch = !isNaN(numAmount) && numAmount > 0 && pd.amount === numAmount;
                              const pdDateClean = pd.date ? pd.date.trim() : '';
                              const dateMatch = cleanDate !== '' && pdDateClean !== '' && pdDateClean === cleanDate;
                              return amountMatch && dateMatch;
                            }) || matchingPendingDeps.find(pd => !isNaN(numAmount) && numAmount > 0 && pd.amount === numAmount)
                               || matchingPendingDeps.find(pd => cleanDate !== '' && pd.date && pd.date.trim() === cleanDate)
                               || matchingPendingDeps[0];

                            const bestPdDateClean = bestPendingMatch?.date ? bestPendingMatch.date.trim() : '';
                            const hasPendingAmountMatch = Boolean(bestPendingMatch && !isNaN(numAmount) && numAmount > 0 && bestPendingMatch.amount === numAmount);
                            const hasPendingDateMatch = Boolean(bestPendingMatch && cleanDate !== '' && bestPdDateClean !== '' && bestPdDateClean === cleanDate);
                            const hasExactPendingMatch = hasPendingAmountMatch && hasPendingDateMatch;

                            const isInvoiceAmountMatch = !isNaN(numAmount) && numAmount > 0 && (inv.totalAmount === numAmount || inv.paymentAmount === numAmount);
                            const isActive = idx === activeManualIndex;

                            return (
                              <div
                                key={inv.id}
                                onMouseDown={(e) => {
                                  e.preventDefault(); // Prevents input blur to keep dropdown open for multi-select
                                  handleToggleInvoice(inv);
                                }}
                                className={`p-2.5 text-right text-xs transition-all cursor-pointer flex items-center justify-between ${
                                  isSelected ? 'bg-blue-50/80 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                } ${
                                  hasExactPendingMatch
                                    ? 'bg-amber-100/90 dark:bg-amber-950/60 hover:bg-amber-200/90 font-bold border-r-4 border-amber-500 shadow-sm ring-1 ring-amber-300 dark:ring-amber-700'
                                    : hasPendingAmountMatch
                                    ? 'bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100/80 font-semibold border-r-4 border-amber-400'
                                    : hasPendingDateMatch
                                    ? 'bg-amber-50/40 dark:bg-amber-900/10 hover:bg-amber-100/40 border-r-4 border-amber-300'
                                    : isInvoiceAmountMatch
                                    ? 'bg-emerald-50/60 hover:bg-emerald-100 font-bold border-r-4 border-emerald-500'
                                    : ''
                                } ${
                                  isActive ? 'bg-slate-100 dark:bg-slate-800 ring-2 ring-blue-400 ring-inset' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input 
                                    type="checkbox" 
                                    checked={isSelected} 
                                    readOnly
                                    className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 shrink-0 pointer-events-none" 
                                  />
                                  <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-slate-800 dark:text-slate-200">#{inv.invoiceNumber}</span>
                                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                        ({inv.type === 'sale' ? 'فروش/دریافتنی' : 'خرید/پرداختنی'})
                                      </span>

                                      {/* Distinct Badges */}
                                      {hasExactPendingMatch ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[9px] font-black border border-amber-600 shadow-sm animate-pulse">
                                          <CheckSquare className="w-3 h-3" />
                                          تطبیق کامل بیعانه معلق (مبلغ و تاریخ)
                                        </span>
                                      ) : hasPendingAmountMatch ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 text-[9px] font-extrabold border border-amber-300 dark:border-amber-700">
                                          تطبیق مبلغ بیعانه معلق
                                        </span>
                                      ) : hasPendingDateMatch ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-[9px] font-bold border border-amber-200 dark:border-amber-800">
                                          تطبیق تاریخ بیعانه معلق
                                        </span>
                                      ) : isInvoiceAmountMatch ? (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 text-[9px] font-black border border-emerald-200 dark:border-emerald-800">
                                          تطبیق مبلغ فاکتور
                                        </span>
                                      ) : null}
                                    </div>

                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                                      <span>{inv.counterpartName} {inv.counterpartPhone && `(${inv.counterpartPhone})`}</span>
                                    </div>

                                    {/* Display ALL pending deposits for this invoice */}
                                    {matchingPendingDeps.length > 0 && (
                                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                        <span className="text-[9px] font-bold text-amber-800 dark:text-amber-300">
                                          {matchingPendingDeps.length > 1 ? `بیعانه‌های معلق (${toPersianDigits(matchingPendingDeps.length)} فقره):` : 'بیعانه معلق:'}
                                        </span>
                                        {matchingPendingDeps.map((pd, pIdx) => {
                                          const isThisPdSelected = selectedPendingDepositId === pd.id;
                                          const isPdAmountMatch = !isNaN(numAmount) && numAmount > 0 && pd.amount === numAmount;
                                          return (
                                            <button
                                              key={pd.id}
                                              type="button"
                                              onMouseDown={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setSelectedPendingDepositId(pd.id);
                                                setAmount(String(pd.amount));
                                                if (pd.date) setDate(pd.date);
                                                setSelectedInvoiceIds([inv.id]);
                                                setShowManualDropdown(false);
                                              }}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all inline-flex items-center gap-1 cursor-pointer border ${
                                                isThisPdSelected
                                                  ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                                  : isPdAmountMatch
                                                  ? 'bg-amber-200 text-amber-900 border-amber-400 hover:bg-amber-300'
                                                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                                              }`}
                                              title={`انتخاب مستقیم این بیعانه (مبلغ: ${formatCurrency(pd.amount)})`}
                                            >
                                              <span>
                                                {matchingPendingDeps.length > 1 ? `#${toPersianDigits(pIdx + 1)} ` : ''}
                                                {formatCurrency(pd.amount)} ({toPersianDigits(pd.date)})
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="text-left shrink-0 pl-1">
                                  <span className="font-mono font-bold text-slate-700 dark:text-slate-200 block">
                                    {formatCurrency(Math.max(0, inv.totalAmount - (inv.deposit || 0)))}
                                  </span>
                                  {(inv.deposit || 0) > 0 && (
                                    <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold block">
                                      پرداختی/بیعانه: {formatCurrency(inv.deposit || 0)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {filteredInvoices.length === 0 && (
                            <div className="p-3 text-center text-xs text-slate-400">
                              فاکتوری یافت نشد.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Warning Pop-up message */}
                      {amountWarning && (
                        <div className="absolute z-40 bg-rose-50 text-rose-800 border border-rose-100 rounded-lg p-3 shadow-lg text-xs font-bold top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 max-w-[90%] text-center animate-bounce">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-ping"></span>
                          <span>{amountWarning}</span>
                          <button
                            type="button"
                            onClick={() => setAmountWarning(null)}
                            className="text-rose-400 hover:text-rose-600 focus:outline-none mr-2 p-1 rounded hover:bg-rose-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Badges of selected invoices */}
                      {selectedInvoiceIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {openInvoices.filter(inv => selectedInvoiceIds.includes(inv.id)).map(inv => (
                            <span key={inv.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                              <span>#{inv.invoiceNumber} ({inv.counterpartName})</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedInvoiceIds(prev => prev.filter(id => id !== inv.id));
                                  setAmountWarning(null);
                                }}
                                className="text-blue-500 hover:text-blue-800 focus:outline-none cursor-pointer p-0.5 rounded hover:bg-blue-100"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Selected Invoices Total display */}
                      {selectedInvoiceIds.length > 0 && (
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 mt-2 px-2.5 py-2 bg-slate-50/75 rounded-lg border border-slate-100">
                          <span>مجموع باقیمانده فاکتورهای انتخابی:</span>
                          <span className="font-mono text-slate-700">
                            {formatCurrency(openInvoices.filter(inv => selectedInvoiceIds.includes(inv.id)).reduce((sum, inv) => sum + Math.max(0, inv.totalAmount - (inv.deposit || 0)), 0))}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-100 font-bold text-center">
                      {activeForm === 'settlement' 
                        ? 'هیچ فاکتور خرید باز و تسویه نشده‌ای در سیستم یافت نشد.' 
                        : 'هیچ فاکتور فروش باز و تسویه نشده‌ای در سیستم یافت نشد.'}
                    </div>
                  )}
                </div>
              ) : activeForm === 'transfer' ? (
                <div className="p-4 bg-amber-50/60 rounded-xl space-y-1 text-xs text-amber-950 leading-relaxed border border-amber-200/50">
                  <span className="font-bold text-amber-900 block">انتقال داخلی (مدیریت صندوق):</span>
                  <span>
                    جابجایی وجه بین صندوق‌ها و حساب‌های بانکی شرکت در این بخش ثبت شده و موجودی آنها را اصلاح می‌کند.
                  </span>
                </div>
              ) : activeForm === 'deposit' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed border border-slate-200 dark:border-slate-700">
                    <span className="font-bold text-slate-700 dark:text-slate-300 block">ثبت حسابداری واریز:</span>
                    <span>
                      سود بانکی، وصول فاکتورها، و آورده شرکا در این بخش ثبت شده و منابع دریافتنی را بستانکار می‌کند.
                    </span>
                  </div>

                  {pendingDeposits.filter(p => p.status === 'pending' && !p.isDeleted).length > 0 && (
                    <div className="space-y-2 p-4 bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/50 rounded-xl">
                      <label className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                        اتصال به بیعانه معلق (Pending Deposit)
                      </label>
                      <select
                        value={selectedPendingDepositId}
                        onChange={(e) => setSelectedPendingDepositId(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 font-semibold"
                      >
                        <option value="">-- انتخاب بیعانه معلق جهت تسویه نهایی --</option>
                        {[...pendingDeposits.filter(p => p.status === 'pending' && !p.isDeleted)]
                          .sort((a, b) => {
                            const numAmount = parseFloat(amount);
                            const cleanDate = date ? date.trim() : '';
                            const aAmountMatch = !isNaN(numAmount) && numAmount > 0 && a.amount === numAmount;
                            const aDateMatch = cleanDate !== '' && a.date && a.date.trim() === cleanDate;
                            const aScore = (aAmountMatch && aDateMatch) ? 1000 : (aAmountMatch ? 500 : (aDateMatch ? 200 : 0));

                            const bAmountMatch = !isNaN(numAmount) && numAmount > 0 && b.amount === numAmount;
                            const bDateMatch = cleanDate !== '' && b.date && b.date.trim() === cleanDate;
                            const bScore = (bAmountMatch && bDateMatch) ? 1000 : (bAmountMatch ? 500 : (bDateMatch ? 200 : 0));

                            return bScore - aScore;
                          })
                          .map(p => {
                            const numAmount = parseFloat(amount);
                            const cleanDate = date ? date.trim() : '';
                            const isExact = !isNaN(numAmount) && numAmount > 0 && p.amount === numAmount && cleanDate !== '' && p.date && p.date.trim() === cleanDate;
                            return (
                              <option key={p.id} value={p.id}>
                                {isExact ? '⭐ [تطبیق کامل مبلغ و تاریخ] ' : ''}فاکتور {p.invoiceNumber} - {p.counterpartName} (مبلغ: {formatCurrency(p.amount)} - تاریخ: {toPersianDigits(p.date)})
                              </option>
                            );
                          })}
                      </select>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 leading-normal">
                        با انتخاب بیعانه معلق، تراکنش به فاکتور متصل شده و سند از معلق به قطعی تغییر می‌کند.
                      </p>
                    </div>
                  )}
                </div>
              ) : activeForm === 'loan' ? (
                <div className="space-y-3 p-4 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-slate-800 dark:text-slate-100 block">
                      انتخاب شخص وام‌گیرنده <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddBorrowerModalOpen(true)}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors border border-indigo-200 dark:border-indigo-800"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>+ افزودن وام‌گیرنده</span>
                    </button>
                  </div>

                  <select
                    value={selectedBorrowerId}
                    onChange={(e) => setSelectedBorrowerId(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="">-- لطفاً وام‌گیرنده را انتخاب فرمایید --</option>
                    {loanBorrowers.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.phone ? `(${toPersianDigits(b.phone)})` : ''}
                      </option>
                    ))}
                  </select>

                  {selectedBorrowerId && (() => {
                    const borrower = loanBorrowers.find(b => b.id === selectedBorrowerId);
                    if (!borrower) return null;
                    const initialDebt = borrower.initialDebt || 0;
                    const payoutsSum = transactions
                      .filter(t => !t.isDeleted && (t.borrowerId === borrower.id || t.borrowerName === borrower.name) && (t.loanType === 'payout' || t.categoryParent === 'پرداخت وام'))
                      .reduce((sum, t) => sum + (t.amount || 0), 0);
                    const repaymentsSum = transactions
                      .filter(t => !t.isDeleted && (t.borrowerId === borrower.id || t.borrowerName === borrower.name) && (t.loanType === 'repayment' || t.categoryParent === 'تسویه حساب وام'))
                      .reduce((sum, t) => sum + (t.amount || 0), 0);
                    const currentDebt = initialDebt + payoutsSum - repaymentsSum;

                    return (
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-purple-200 dark:border-purple-800 text-xs space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 font-bold">وضعیت بدهی فعلی:</span>
                          <span className={`font-black font-mono ${currentDebt > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {formatCurrency(currentDebt)}
                          </span>
                        </div>
                        {amount && parseFloat(amount) > 0 && (
                          <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                            <span className="text-slate-500 font-bold">
                              {loanSubTab === 'payout' ? 'بدهی جدید پس از این وام:' : 'بدهی جدید پس از تسویه:'}
                            </span>
                            <span className="font-black font-mono text-purple-700 dark:text-purple-300">
                              {formatCurrency(loanSubTab === 'payout' ? currentDebt + (parseFloat(amount) || 0) : currentDebt - (parseFloat(amount) || 0))}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingDeposits.filter(p => p.status === 'pending' && p.type === 'purchase' && !p.isDeleted).length > 0 && (
                    <div className="space-y-2 p-4 bg-violet-50 dark:bg-violet-950/10 border border-violet-100 dark:border-violet-900/50 rounded-xl">
                      <label className="text-xs font-bold text-violet-800 dark:text-violet-300 flex items-center gap-1.5">
                        <CheckSquare className="w-4 h-4 text-violet-600" />
                        اتصال به بیعانه معلق خرید (Purchase Pending Deposit)
                      </label>
                      <select
                        value={selectedPendingDepositId}
                        onChange={(e) => setSelectedPendingDepositId(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500 font-semibold"
                      >
                        <option value="">-- انتخاب بیعانه معلق خرید جهت پرداخت نهایی --</option>
                        {[...pendingDeposits.filter(p => p.status === 'pending' && p.type === 'purchase' && !p.isDeleted)]
                          .sort((a, b) => {
                            const numAmount = parseFloat(amount);
                            const cleanDate = date ? date.trim() : '';
                            const aAmountMatch = !isNaN(numAmount) && numAmount > 0 && a.amount === numAmount;
                            const aDateMatch = cleanDate !== '' && a.date && a.date.trim() === cleanDate;
                            const aScore = (aAmountMatch && aDateMatch) ? 1000 : (aAmountMatch ? 500 : (aDateMatch ? 200 : 0));

                            const bAmountMatch = !isNaN(numAmount) && numAmount > 0 && b.amount === numAmount;
                            const bDateMatch = cleanDate !== '' && b.date && b.date.trim() === cleanDate;
                            const bScore = (bAmountMatch && bDateMatch) ? 1000 : (bAmountMatch ? 500 : (bDateMatch ? 200 : 0));

                            return bScore - aScore;
                          })
                          .map(p => {
                            const numAmount = parseFloat(amount);
                            const cleanDate = date ? date.trim() : '';
                            const isExact = !isNaN(numAmount) && numAmount > 0 && p.amount === numAmount && cleanDate !== '' && p.date && p.date.trim() === cleanDate;
                            return (
                              <option key={p.id} value={p.id}>
                                {isExact ? '⭐ [تطبیق کامل مبلغ و تاریخ] ' : ''}فاکتور خرید {p.invoiceNumber} - {p.counterpartName} (مبلغ: {formatCurrency(p.amount)} - تاریخ: {toPersianDigits(p.date)})
                              </option>
                            );
                          })}
                      </select>
                      <p className="text-[10px] text-violet-600 dark:text-violet-400 leading-normal">
                        با انتخاب بیعانه معلق خرید، تراکنش به فاکتور خرید متصل شده و سند از معلق به پرداخت‌شده تغییر می‌یابد.
                      </p>
                    </div>
                  )}

                  <div className="space-y-1.5 p-4 bg-indigo-50/30 dark:bg-slate-900/40 border border-indigo-100/50 dark:border-slate-800 rounded-xl space-y-3">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">انتخاب شریک تجاری (برداشت شرکا)</label>
                    <select
                      value={selectedPartnerId}
                      onChange={(e) => setSelectedPartnerId(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- انتخاب شریک (برداشت عمومی/غیرشرکتی) --</option>
                      {partners.map(p => (
                        <option key={p.id} value={p.id}>{p.name} {p.sharePercent ? `(سهم: ${toPersianDigits(p.sharePercent)}٪)` : ''}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                      با انتخاب شریک، برداشت به حساب جاری شریک منظور شده و هزینه عملیاتی محاسبه نمی‌شود.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block">شرح تفصیلی تراکنش</label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="شرح کاملی بابت این تراکنش ثبت کنید..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={setToday}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  به زمان جاری سیستم
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2.5 px-6 text-white font-bold rounded-lg text-xs shadow hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    activeForm === 'cost' ? 'bg-rose-600 hover:bg-rose-700' : (activeForm === 'deposit' ? 'bg-emerald-600 hover:bg-emerald-700' : activeForm === 'withdrawal' ? 'bg-indigo-600 hover:bg-indigo-700' : activeForm === 'settlement' ? 'bg-violet-600 hover:bg-violet-700' : activeForm === 'receivableSettlement' ? 'bg-teal-600 hover:bg-teal-700' : activeForm === 'loan' ? (loanSubTab === 'payout' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-teal-700 hover:bg-teal-800') : 'bg-amber-600 hover:bg-amber-700')
                  }`}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{activeForm === 'transfer' ? 'ثبت انتقال صندوق' : activeForm === 'loan' ? (loanSubTab === 'payout' ? 'ثبت پرداخت وام' : 'ثبت تسویه حساب وام') : 'ثبت حسابداری تراکنش'}</span>
                </button>
              </div>

            </div>
          </>
        )}

      </form>

      {/* 4. Combined List Tabs of Transactions & Invoices */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 space-y-6 shadow-sm mt-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-slate-100 pb-5 gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-800">مستندات مالی</h3>
            <p className="text-slate-500 text-xs mt-1">بررسی تراکنشها</p>
          </div>

          {/* List Tabs */}
          <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-xl border border-slate-200/50 gap-1 w-full xl:w-auto">
            <button
              onClick={() => setListTab('transactions')}
              className={`flex-1 xl:flex-none px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                listTab === 'transactions'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              همه تراکنش‌ها ({toPersianDigits(filteredTransactions.length)})
            </button>
            <button
              onClick={() => setListTab('expenses')}
              className={`flex-1 xl:flex-none px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                listTab === 'expenses'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              هزینه‌ها ({toPersianDigits(filteredTransactions.filter(t => t.type === 'withdrawal' && t.categoryParent !== 'برداشت نقدی').length)})
            </button>
            <button
              onClick={() => setListTab('deposits')}
              className={`flex-1 xl:flex-none px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                listTab === 'deposits'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              واریزی‌ها ({toPersianDigits(filteredTransactions.filter(t => t.type === 'deposit').length)})
            </button>
            <button
              onClick={() => setListTab('withdrawals')}
              className={`flex-1 xl:flex-none px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                listTab === 'withdrawals'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              برداشت‌ها ({toPersianDigits(filteredTransactions.filter(t => t.type === 'withdrawal' && (t.categoryParent === 'برداشت نقدی' || !t.categoryParent) && t.categoryParent !== 'انتقال داخلی بین حساب‌ها').length)})
            </button>
            <button
              onClick={() => setListTab('transfers')}
              className={`flex-1 xl:flex-none px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                listTab === 'transfers'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              صندوق‌ها ({toPersianDigits(filteredTransactions.filter(t => t.categoryParent === 'انتقال داخلی بین حساب‌ها').length)})
            </button>
            <button
              onClick={() => setListTab('sales')}
              className={`flex-1 xl:flex-none px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                listTab === 'sales'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              فاکتورهای فروش ({toPersianDigits(tabInvoices.filter(inv => inv.type === 'sale').length)})
            </button>
            <button
              onClick={() => setListTab('purchases')}
              className={`flex-1 xl:flex-none px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                listTab === 'purchases'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              فاکتورهای خرید ({toPersianDigits(tabInvoices.filter(inv => inv.type === 'purchase').length)})
            </button>
            <button
              onClick={() => setListTab('pending_deposits')}
              className={`flex-1 xl:flex-none px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                listTab === 'pending_deposits'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              بیعانه‌های معلق ({toPersianDigits(pendingDeposits.filter(p => p.status === 'pending' && !p.isDeleted).length)})
            </button>
            <button
              onClick={() => setListTab('deleted_transactions')}
              className={`flex-1 xl:flex-none px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                listTab === 'deleted_transactions'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-rose-600 hover:text-rose-900 hover:bg-rose-50/55'
              }`}
            >
              حذفی‌ها ({toPersianDigits(filteredTransactions.filter(t => t.isDeleted === true).length)})
            </button>
          </div>
        </div>

        {/* Date Range Filter Section */}
        <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-150 text-xs">
          <span className="font-bold text-slate-700">فیلتر بازه زمانی (تاریخ شمسی):</span>
          
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-semibold">از تاریخ:</span>
            <div className="w-36">
              <JalaliDatePicker
                value={filterStartDate}
                onChange={(val) => setFilterStartDate(val)}
                placeholder="مثال: ۱۴۰۳/۰۱/۰۱"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-semibold">تا تاریخ:</span>
            <div className="w-36">
              <JalaliDatePicker
                value={filterEndDate}
                onChange={(val) => setFilterEndDate(val)}
                placeholder="مثال: ۱۴۰۳/۱۲/۲۹"
              />
            </div>
          </div>

          {(filterStartDate || filterEndDate) && (
            <button
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-lg transition-colors cursor-pointer"
            >
              پاک کردن فیلتر تاریخ
            </button>
          )}
        </div>

        {/* Tab Content Panels */}
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          {/* Batch Actions Toolbar for ALL tabs */}
          <div className="p-3 bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSelectAllTx}
                className={`px-3 py-1.5 rounded-lg font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  selectedTxIds.length > 0
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{selectedTxIds.length === currentTabItems.length && currentTabItems.length > 0 ? 'لغو انتخاب همه' : 'انتخاب همه نتایج'}</span>
              </button>

              {selectedTxIds.length > 0 && (
                <span className="px-2.5 py-1 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 font-black rounded-lg border border-rose-200 dark:border-rose-800/60">
                  {toPersianDigits(selectedTxIds.length)} مورد انتخاب شده
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Delete Selected Button */}
              <button
                type="button"
                disabled={selectedTxIds.length === 0 || (listTab === 'deleted_transactions' && currentUser.role !== 'admin')}
                onClick={() => {
                  if (selectedTxIds.length === 0) return;
                  setBatchDeleteTarget('selected');
                  setBatchDeleteModalOpen(true);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                  selectedTxIds.length > 0 && !(listTab === 'deleted_transactions' && currentUser.role !== 'admin')
                    ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-rose-200 dark:shadow-none'
                    : 'bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:text-slate-600 dark:border-slate-700 cursor-not-allowed'
                }`}
                title={listTab === 'deleted_transactions' && currentUser.role !== 'admin' ? 'فقط کاربر مدیر دسترسی حذف کامل دارد' : 'حذف موارد انتخاب شده'}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {listTab === 'deleted_transactions' ? 'حذف کامل موارد انتخابی' : 'حذف موارد انتخابی'}
                  {selectedTxIds.length > 0 ? ` (${toPersianDigits(selectedTxIds.length)})` : ''}
                </span>
              </button>

              {/* Delete All Filtered Button */}
              {currentTabItems.length > 0 && (
                <button
                  type="button"
                  disabled={listTab === 'deleted_transactions' && currentUser.role !== 'admin'}
                  onClick={() => {
                    setBatchDeleteTarget('all_filtered');
                    setBatchDeleteModalOpen(true);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold border transition-all flex items-center gap-1.5 ${
                    !(listTab === 'deleted_transactions' && currentUser.role !== 'admin')
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60 cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                  }`}
                  title={listTab === 'deleted_transactions' && currentUser.role !== 'admin' ? 'فقط کاربر مدیر دسترسی حذف کامل دارد' : 'حذف تمامی موارد این تب'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {listTab === 'deleted_transactions' ? 'حذف کامل تمامی نتایج' : 'حذف تمامی نتایج'} ({toPersianDigits(currentTabItems.length)})
                  </span>
                </button>
              )}
            </div>
          </div>

          {(listTab === 'transactions' || listTab === 'expenses' || listTab === 'deposits' || listTab === 'withdrawals' || listTab === 'transfers' || listTab === 'deleted_transactions') && (
            <>
              <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 text-slate-500 font-bold border-b border-slate-100">
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="انتخاب همه تراکنش‌ها"
                      checked={currentTxList.length > 0 && selectedTxIds.length === currentTxList.length}
                      onChange={handleToggleSelectAllTx}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer accent-rose-600"
                    />
                  </th>
                  <th className="p-3">تاریخ و ساعت</th>
                  <th className="p-3">نوع تراکنش</th>
                  <th className="p-3">مبلغ کل</th>
                  <th className="p-3">حساب معین</th>
                  <th className="p-3">دسته‌بندی تفصیلی</th>
                  <th className="p-3">توضیحات و اسناد</th>
                  <th className="p-3 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTxList.map((tx) => {
                  const isDeleted = tx.isDeleted;
                  const isSelected = selectedTxIds.includes(tx.id);
                  return (
                    <tr 
                      key={tx.id} 
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-rose-50/80 dark:bg-rose-950/40'
                          : isDeleted 
                            ? 'bg-slate-100/90 dark:bg-slate-900/90 text-slate-400 dark:text-slate-500 border-r-4 border-slate-400 opacity-75' 
                            : tx.isEdited 
                              ? 'bg-amber-50/10 hover:bg-amber-50/20'
                              : 'hover:bg-slate-50/55'
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`انتخاب تراکنش ${tx.description || tx.id}`}
                          checked={isSelected}
                          onChange={() => handleToggleSelectOneTx(tx.id)}
                          className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer accent-rose-600"
                        />
                      </td>
                      <td className={`p-3 font-mono text-slate-600 dark:text-slate-400 ${isDeleted ? 'line-through text-slate-400' : ''}`}>
                        {toPersianDigits(tx.date)} {tx.time && <span className="text-[10px] text-slate-400 block sm:inline">({toPersianDigits(tx.time)})</span>}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1 items-start">
                          {tx.categoryParent === 'انتقال داخلی بین حساب‌ها' ? (
                            tx.type === 'deposit' ? (
                              <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-bold border border-amber-200">انتقال ورودی (مقصد)</span>
                            ) : (
                              <span className="text-orange-800 bg-orange-50 px-2 py-0.5 rounded font-bold border border-orange-200">انتقال خروجی (مبدا)</span>
                            )
                          ) : tx.type === 'deposit' ? (
                            <span className={`px-2 py-0.5 rounded font-bold ${isDeleted ? 'bg-slate-200 dark:bg-slate-800 text-slate-500' : 'text-emerald-700 bg-emerald-50'}`}>واریزی (دریافت)</span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded font-bold ${isDeleted ? 'bg-slate-200 dark:bg-slate-800 text-slate-500' : 'text-rose-700 bg-rose-50'}`}>برداشتی (پرداخت)</span>
                          )}

                          {/* Audit Indicators */}
                          {isDeleted && (
                            <span 
                              className="text-[9px] bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400 font-bold px-1.5 py-0.5 rounded flex items-center gap-1 cursor-help mt-1 shadow-sm" 
                              title={`حذف موقت توسط ${tx.deletedBy} در تاریخ ${tx.deletedAt}`}
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              <span>«غیرفعال»</span>
                            </span>
                          )}
                          {!isDeleted && tx.isEdited && (
                            <span 
                              className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded flex items-center gap-1 cursor-help mt-1 shadow-sm"
                              title={`آخرین ویرایش توسط ${tx.editedBy} در تاریخ ${tx.editedAt}`}
                            >
                              <Edit className="w-2.5 h-2.5" />
                              <span>«ویرایش شده»</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`p-3 font-mono font-bold ${tx.type === 'deposit' ? 'text-emerald-600' : 'text-rose-600'} ${isDeleted ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className={`p-3 font-semibold ${isDeleted ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-300'}`}>
                        {tx.accountId ? accounts.find(a => a.id === tx.accountId)?.name : 'حساب پیش‌فرض بانکی'}
                      </td>
                      <td className={`p-3 font-medium ${isDeleted ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-500 dark:text-slate-400'}`}>
                        {tx.categoryParent ? `${tx.categoryParent} ← ${tx.categoryChild}` : 'طبقه‌بندی نشده'}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400 max-w-[240px]">
                        <div className="space-y-1.5">
                          <div className={`truncate ${isDeleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300 font-medium'}`} title={tx.description}>
                            {tx.description}
                          </div>

                          {/* Deleted audit details on the row */}
                          {isDeleted && (
                            <div className="text-[10px] bg-slate-200/60 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-extrabold px-2 py-1 rounded-md flex items-center gap-1.5 mt-1 border border-slate-300/30 w-fit">
                              <Trash2 className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>غیرفعال‌شده توسط: <span className="text-slate-700 dark:text-slate-300">{tx.deletedBy || 'سیستم'}</span> در <span className="text-slate-700 dark:text-slate-300 font-mono">{toPersianDigits(tx.deletedAt || '')}</span></span>
                            </div>
                          )}

                          {/* Related Documents Connection */}
                          {tx.invoiceId && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="text-[10px] bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border border-blue-150 dark:border-blue-900/40 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold">
                                <Link2 className="w-3 h-3" />
                                <span>فاکتور متصل:</span>
                                <span className="font-mono">#{toPersianDigits(invoices.find(i => i.id === tx.invoiceId)?.invoiceNumber || tx.invoiceId)}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const targetInv = invoices.find(i => i.id === tx.invoiceId);
                                  if (targetInv) setViewingInvoice(targetInv);
                                }}
                                className="text-indigo-600 hover:text-indigo-800 hover:underline font-extrabold text-[9px] cursor-pointer"
                              >
                                [نمایش فاکتور]
                              </button>
                            </div>
                          )}

                          {/* Custom Attachments Section */}
                          {tx.attachments && tx.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tx.attachments.map((file, i) => (
                                <span key={i} className="text-[9px] bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded flex items-center gap-1 font-semibold" title={file}>
                                  <Paperclip className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  <span className="truncate max-w-[100px]">{file}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Versions History button */}
                          {tx.editHistory && tx.editHistory.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setHistoryTx(tx)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer"
                              title="مشاهده تاریخچه تغییرات و نسخه‌های قبلی"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isDeleted ? (
                            <>
                              {/* Disabled interactive buttons */}
                              <button
                                type="button"
                                disabled
                                className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 rounded-lg opacity-40 cursor-not-allowed"
                                title="تراکنش غیرفعال شده قابل ویرایش نیست"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled
                                className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 rounded-lg opacity-40 cursor-not-allowed"
                                title="تراکنش قبلاً غیرفعال شده است"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              {currentUser.role === 'admin' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRestore(tx)}
                                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold border border-emerald-200/50"
                                    title="بازیابی مجدد تراکنش"
                                  >
                                    <RotateCcw className="w-3 h-3 text-emerald-600" />
                                    <span>فعالسازی</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPermanentDeleteConfirmTx(tx)}
                                    className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold shadow-sm"
                                    title="حذف کامل تراکنش از دیتابیس (غیرقابل بازگشت)"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>حذف کامل</span>
                                  </button>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartEdit(tx)}
                                className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors cursor-pointer"
                                title="ویرایش اطلاعات تراکنش"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSoftDeleteConfirmTx(tx)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="غیرفعال‌سازی (Soft Delete)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {currentTxList.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 font-semibold">
                      {emptyTxMessage}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <PaginationControls
              currentPage={txPage}
              totalPages={totalTxPages}
              pageSize={txPageSize}
              totalItems={currentTxList.length}
              onPageChange={setTxPage}
              onPageSizeChange={setTxPageSize}
            />
          </>
        )}

          {listTab === 'sales' && (
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 text-slate-500 font-bold border-b border-slate-100">
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="انتخاب همه فاکتورهای فروش"
                      checked={tabInvoices.filter((inv) => inv.type === 'sale').length > 0 && selectedTxIds.length === tabInvoices.filter((inv) => inv.type === 'sale').length}
                      onChange={handleToggleSelectAllTx}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer accent-rose-600"
                    />
                  </th>
                  <th className="p-3">کد فاکتور</th>
                  <th className="p-3">نوع سند</th>
                  <th className="p-3">ثبت‌کننده</th>
                  <th className="p-3">تاریخ صدور</th>
                  <th className="p-3">طرف حساب تجاری</th>
                  <th className="p-3 text-left">مبلغ کل ({localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال'})</th>
                  <th className="p-3 text-left">بیعانه معلق ({localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال'})</th>
                  <th className="p-3 text-left">بدهکار / بستانکار</th>
                  <th className="p-3 text-center">وضعیت سند</th>
                  <th className="p-3 text-center">عملیات سند</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tabInvoices
                  .filter((inv) => inv.type === 'sale')
                  .map((inv) => {
                    const itemsSubtotal = (inv.items || []).reduce((s, it) => s + (it.totalPrice || (it.qty * it.unitPrice) || 0), 0);
                    const netAmt = itemsSubtotal > 0 ? Math.max(0, itemsSubtotal + (inv.tax || 0) - (inv.discount || 0)) : inv.totalAmount;
                    const canDeleteDeposit = currentUser.role === 'admin' || currentUser.role === 'accountant';
                    const isDeleted = inv.isDeleted;
                    const currencyLabel = localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال';

                    const invoicePendingDepositSum = (pendingDeposits || [])
                      .filter(pd => !pd.isDeleted && pd.invoiceId === inv.id && pd.status === 'pending')
                      .reduce((sum, pd) => sum + (Number(pd.amount) || 0), 0);

                    const clearedDeposit = Math.max(0, (Number(inv.deposit) || 0) - invoicePendingDepositSum);
                    const remainingBalance = Math.max(0, netAmt - clearedDeposit);

                    const creatorUser = (users || []).find(u => u.id === inv.createdById || u.username === inv.createdBy || u.name === inv.createdBy);
                    const creatorUsername = creatorUser?.username || inv.createdById || inv.createdBy || 'admin';
                    const creatorDisplayName = creatorUser?.name || (inv.createdBy && inv.createdBy !== creatorUsername ? inv.createdBy : '');

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/50">
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`انتخاب فاکتور فروش شماره ${inv.invoiceNumber}`}
                            checked={selectedTxIds.includes(inv.id)}
                            onChange={() => handleToggleSelectOneTx(inv.id)}
                            className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer accent-rose-600"
                          />
                        </td>
                        {/* کد فاکتور */}
                        <td className="p-3 font-mono font-bold text-slate-800">#{toPersianDigits(inv.invoiceNumber)}</td>
                        
                        {/* نوع سند */}
                        <td className="p-3 whitespace-nowrap">
                          {isDeleted ? (
                            <span className="text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 font-bold text-[10px]">حذفی</span>
                          ) : inv.type === 'sale' ? (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100/50 text-[10px]">فروش</span>
                          ) : (
                            <span className="text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/50 text-[10px]">خرید</span>
                          )}
                        </td>

                        {/* ثبت‌کننده */}
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5 items-start">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200/60 font-bold text-[10px]">
                              <UserIcon className="w-3 h-3 text-sky-600 shrink-0" />
                              <span className="font-mono font-bold" dir="ltr">@{creatorUsername}</span>
                            </span>
                            {creatorDisplayName && (
                              <span className="text-[9px] text-slate-400 font-normal pr-0.5 truncate max-w-[85px]" title={creatorDisplayName}>
                                {creatorDisplayName}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* تاریخ صدور */}
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{toPersianDigits(inv.date)}</td>

                        {/* طرف حساب تجاری */}
                        <td className="p-3 text-slate-800 font-bold max-w-[150px] truncate" title={inv.counterpartName}>{inv.counterpartName}</td>

                        {/* مبلغ کل */}
                        <td className="p-3 text-left font-mono font-bold text-slate-800">{formatCurrency(netAmt)}</td>

                        {/* بیعانه معلق */}
                        <td className="p-3 text-left font-mono font-bold whitespace-nowrap">
                          {invoicePendingDepositSum > 0 ? (
                            <span className="text-amber-600 font-extrabold animate-pulse">
                              {formatCurrency(invoicePendingDepositSum)}
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              ۰ {currencyLabel}
                            </span>
                          )}
                        </td>

                        {/* بدهکار / بستانکار */}
                        <td className="p-3 text-left whitespace-nowrap">
                          <div className="flex flex-col gap-0.5 items-start">
                            {remainingBalance === 0 ? (
                              <>
                                <div className="font-mono font-black text-slate-500">
                                  ۰ {currencyLabel}
                                </div>
                                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-black bg-slate-50 text-slate-600">
                                  تسویه شده
                                </span>
                              </>
                            ) : inv.type === 'sale' ? (
                              <>
                                <div className="font-mono font-black text-emerald-600">
                                  {formatCurrency(remainingBalance)}
                                </div>
                                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-black bg-emerald-50 text-emerald-700">
                                  <TrendingDown className="w-3 h-3 shrink-0" />
                                  مانده بدهی
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="font-mono font-black text-rose-600">
                                  {formatCurrency(remainingBalance)}
                                </div>
                                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-black bg-rose-50 text-rose-700">
                                  <TrendingUp className="w-3 h-3 shrink-0" />
                                  مانده طلب
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* وضعیت سند */}
                        <td className="p-3 whitespace-nowrap text-center">
                          <div className="flex flex-col gap-1 items-center">
                            {isDeleted ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300 text-[9px] font-bold">
                                حذف شده
                              </span>
                            ) : inv.isProforma ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-semibold animate-pulse">
                                <span>پیش‌فاکتور</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-bold">
                                <Check className="w-3 h-3" />
                                <span>فاکتور رسمی</span>
                              </span>
                            )}
                            {inv.history && inv.history.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-[8px] font-bold animate-pulse">
                                <History className="w-2.5 h-2.5 text-blue-600" />
                                <span>ویرایش ({toPersianDigits(inv.history.length)})</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* عملیات */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingInvoice(inv)}
                              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer font-bold text-[10px]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>مشاهده فاکتور</span>
                            </button>
                            {canDeleteDeposit && !!inv.deposit && inv.deposit > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`آیا از حذف بیعانه (${formatCurrency(inv.deposit || 0)}) ثبت‌شده روی فاکتور شماره ${inv.invoiceNumber} اطمینان دارید؟`)) {
                                    if (onUpdateInvoices) {
                                      const updatedInvs = invoices.map(i => i.id === inv.id ? { ...i, deposit: 0, paymentSlips: undefined } : i);
                                      onUpdateInvoices(updatedInvs);
                                    }
                                    if (onUpdatePendingDeposits && pendingDeposits) {
                                      const updatedPDs = pendingDeposits.filter(p => p.invoiceId !== inv.id && String(p.invoiceNumber) !== String(inv.invoiceNumber));
                                      onUpdatePendingDeposits(updatedPDs);
                                    }
                                    setSuccess('مبلغ بیعانه و اسناد معلق مربوطه با موفقیت از روی فاکتور پاک شد.');
                                    setTimeout(() => setSuccess(null), 4000);
                                  }
                                }}
                                className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer font-bold text-[10px] border border-rose-200/60"
                                title="حذف بیعانه این فاکتور"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف بیعانه</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {tabInvoices.filter((inv) => inv.type === 'sale').length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400 font-semibold">
                      هیچ فاکتور فروشی یافت نشد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {listTab === 'purchases' && (
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 text-slate-500 font-bold border-b border-slate-100">
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="انتخاب همه فاکتورهای خرید"
                      checked={tabInvoices.filter((inv) => inv.type === 'purchase').length > 0 && selectedTxIds.length === tabInvoices.filter((inv) => inv.type === 'purchase').length}
                      onChange={handleToggleSelectAllTx}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer accent-rose-600"
                    />
                  </th>
                  <th className="p-3">کد فاکتور</th>
                  <th className="p-3">نوع سند</th>
                  <th className="p-3">ثبت‌کننده</th>
                  <th className="p-3">تاریخ صدور</th>
                  <th className="p-3">طرف حساب تجاری</th>
                  <th className="p-3 text-left">مبلغ کل ({localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال'})</th>
                  <th className="p-3 text-left">بیعانه معلق ({localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال'})</th>
                  <th className="p-3 text-left">بدهکار / بستانکار</th>
                  <th className="p-3 text-center">وضعیت سند</th>
                  <th className="p-3 text-center">عملیات سند</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tabInvoices
                  .filter((inv) => inv.type === 'purchase')
                  .map((inv) => {
                    const itemsSubtotal = (inv.items || []).reduce((s, it) => s + (it.totalPrice || (it.qty * it.unitPrice) || 0), 0);
                    const netAmt = itemsSubtotal > 0 ? Math.max(0, itemsSubtotal + (inv.tax || 0) - (inv.discount || 0)) : inv.totalAmount;
                    const canDeleteDeposit = currentUser.role === 'admin' || currentUser.role === 'accountant';
                    const isDeleted = inv.isDeleted;
                    const currencyLabel = localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال';

                    const invoicePendingDepositSum = (pendingDeposits || [])
                      .filter(pd => !pd.isDeleted && pd.invoiceId === inv.id && pd.status === 'pending')
                      .reduce((sum, pd) => sum + (Number(pd.amount) || 0), 0);

                    const clearedDeposit = Math.max(0, (Number(inv.deposit) || 0) - invoicePendingDepositSum);
                    const remainingBalance = Math.max(0, netAmt - clearedDeposit);

                    const creatorUser = (users || []).find(u => u.id === inv.createdById || u.username === inv.createdBy || u.name === inv.createdBy);
                    const creatorUsername = creatorUser?.username || inv.createdById || inv.createdBy || 'admin';
                    const creatorDisplayName = creatorUser?.name || (inv.createdBy && inv.createdBy !== creatorUsername ? inv.createdBy : '');

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/50">
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`انتخاب فاکتور خرید شماره ${inv.invoiceNumber}`}
                            checked={selectedTxIds.includes(inv.id)}
                            onChange={() => handleToggleSelectOneTx(inv.id)}
                            className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer accent-rose-600"
                          />
                        </td>
                        {/* کد فاکتور */}
                        <td className="p-3 font-mono font-bold text-slate-800">#{toPersianDigits(inv.invoiceNumber)}</td>
                        
                        {/* نوع سند */}
                        <td className="p-3 whitespace-nowrap">
                          {isDeleted ? (
                            <span className="text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 font-bold text-[10px]">حذفی</span>
                          ) : inv.type === 'sale' ? (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100/50 text-[10px]">فروش</span>
                          ) : (
                            <span className="text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/50 text-[10px]">خرید</span>
                          )}
                        </td>

                        {/* ثبت‌کننده */}
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5 items-start">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200/60 font-bold text-[10px]">
                              <UserIcon className="w-3 h-3 text-sky-600 shrink-0" />
                              <span className="font-mono font-bold" dir="ltr">@{creatorUsername}</span>
                            </span>
                            {creatorDisplayName && (
                              <span className="text-[9px] text-slate-400 font-normal pr-0.5 truncate max-w-[85px]" title={creatorDisplayName}>
                                {creatorDisplayName}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* تاریخ صدور */}
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{toPersianDigits(inv.date)}</td>

                        {/* طرف حساب تجاری */}
                        <td className="p-3 text-slate-800 font-bold max-w-[150px] truncate" title={inv.counterpartName}>{inv.counterpartName}</td>

                        {/* مبلغ کل */}
                        <td className="p-3 text-left font-mono font-bold text-slate-800">{formatCurrency(netAmt)}</td>

                        {/* بیعانه معلق */}
                        <td className="p-3 text-left font-mono font-bold whitespace-nowrap">
                          {invoicePendingDepositSum > 0 ? (
                            <span className="text-amber-600 font-extrabold animate-pulse">
                              {formatCurrency(invoicePendingDepositSum)}
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              ۰ {currencyLabel}
                            </span>
                          )}
                        </td>

                        {/* بدهکار / بستانکار */}
                        <td className="p-3 text-left whitespace-nowrap">
                          <div className="flex flex-col gap-0.5 items-start">
                            {remainingBalance === 0 ? (
                              <>
                                <div className="font-mono font-black text-slate-500">
                                  ۰ {currencyLabel}
                                </div>
                                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-black bg-slate-50 text-slate-600">
                                  تسویه شده
                                </span>
                              </>
                            ) : inv.type === 'sale' ? (
                              <>
                                <div className="font-mono font-black text-emerald-600">
                                  {formatCurrency(remainingBalance)}
                                </div>
                                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-black bg-emerald-50 text-emerald-700">
                                  <TrendingDown className="w-3 h-3 shrink-0" />
                                  مانده بدهی
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="font-mono font-black text-rose-600">
                                  {formatCurrency(remainingBalance)}
                                </div>
                                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-black bg-rose-50 text-rose-700">
                                  <TrendingUp className="w-3 h-3 shrink-0" />
                                  مانده طلب
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* وضعیت سند */}
                        <td className="p-3 whitespace-nowrap text-center">
                          <div className="flex flex-col gap-1 items-center">
                            {isDeleted ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300 text-[9px] font-bold">
                                حذف شده
                              </span>
                            ) : inv.isProforma ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-semibold animate-pulse">
                                <span>پیش‌فاکتور</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-bold">
                                <Check className="w-3 h-3" />
                                <span>فاکتور رسمی</span>
                              </span>
                            )}
                            {inv.history && inv.history.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-[8px] font-bold animate-pulse">
                                <History className="w-2.5 h-2.5 text-blue-600" />
                                <span>ویرایش ({toPersianDigits(inv.history.length)})</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* عملیات */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingInvoice(inv)}
                              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer font-bold text-[10px]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>مشاهده فاکتور</span>
                            </button>
                            {canDeleteDeposit && !!inv.deposit && inv.deposit > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`آیا از حذف بیعانه (${formatCurrency(inv.deposit || 0)}) ثبت‌شده روی فاکتور شماره ${inv.invoiceNumber} اطمینان دارید؟`)) {
                                    if (onUpdateInvoices) {
                                      const updatedInvs = invoices.map(i => i.id === inv.id ? { ...i, deposit: 0, paymentSlips: undefined } : i);
                                      onUpdateInvoices(updatedInvs);
                                    }
                                    if (onUpdatePendingDeposits && pendingDeposits) {
                                      const updatedPDs = pendingDeposits.filter(p => p.invoiceId !== inv.id && String(p.invoiceNumber) !== String(inv.invoiceNumber));
                                      onUpdatePendingDeposits(updatedPDs);
                                    }
                                    setSuccess('مبلغ بیعانه و اسناد معلق مربوطه با موفقیت از روی فاکتور پاک شد.');
                                    setTimeout(() => setSuccess(null), 4000);
                                  }
                                }}
                                className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer font-bold text-[10px] border border-rose-200/60"
                                title="حذف بیعانه این فاکتور"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف بیعانه</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {tabInvoices.filter((inv) => inv.type === 'purchase').length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400 font-semibold">
                      هیچ فاکتور خریدی یافت نشد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {listTab === 'pending_deposits' && (
            <div>
              {/* Pending Deposits Sub-filter Header */}
              <div className="p-3 bg-slate-50/90 border-b border-slate-150 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">فیلتر وضعیت بیعانه‌ها:</span>
                  <div className="flex bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 gap-1">
                    <button
                      type="button"
                      onClick={() => setPendingDepositFilter('pending')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        pendingDepositFilter === 'pending'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      در انتظار وصول ({toPersianDigits((pendingDeposits || []).filter(p => p.status === 'pending' && !p.isDeleted).length)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDepositFilter('cleared')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        pendingDepositFilter === 'cleared'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      وصول‌شده‌ها ({toPersianDigits((pendingDeposits || []).filter(p => p.status === 'cleared' && !p.isDeleted).length)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDepositFilter('all')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        pendingDepositFilter === 'all'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      تمام بیعانه‌ها ({toPersianDigits((pendingDeposits || []).filter(p => !p.isDeleted).length)})
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500">
                  {pendingDepositFilter === 'pending'
                    ? 'فقط بیعانه‌هایی که هنوز واریزی/پرداختی آنها در دفاتر ثبت نشده نمایش داده می‌شوند.'
                    : pendingDepositFilter === 'cleared'
                    ? 'بیعانه‌هایی که تراکنش آنها ثبت شده و سند نهایی گردیده است.'
                    : 'کلیه اسناد بیعانه ثبت‌شده در سیستم.'}
                </div>
              </div>

              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/75 text-slate-500 font-bold border-b border-slate-100">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        aria-label="انتخاب همه اسناد بیعانه معلق"
                        checked={tabPendingDeposits.length > 0 && selectedTxIds.length === tabPendingDeposits.length}
                        onChange={handleToggleSelectAllTx}
                        className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer accent-rose-600"
                      />
                    </th>
                    <th className="p-3">شماره فاکتور متصل</th>
                    <th className="p-3">طرف حساب</th>
                    <th className="p-3">تاریخ ثبت</th>
                    <th className="p-3">نوع فاکتور</th>
                    <th className="p-3 text-left">مبلغ بیعانه</th>
                    <th className="p-3 text-center">وضعیت سند</th>
                    <th className="p-3 text-center">شناسه تراکنش وصولی</th>
                    <th className="p-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tabPendingDeposits.map((pd) => {
                    const canDeleteDeposit = currentUser.role === 'admin' || currentUser.role === 'accountant';
                    return (
                      <tr key={pd.id} className="hover:bg-slate-50/50">
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`انتخاب بیعانه فاکتور شماره ${pd.invoiceNumber}`}
                            checked={selectedTxIds.includes(pd.id)}
                            onChange={() => handleToggleSelectOneTx(pd.id)}
                            className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer accent-rose-600"
                          />
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800">#{toPersianDigits(pd.invoiceNumber)}</td>
                        <td className="p-3 text-slate-700 font-bold">{pd.counterpartName}</td>
                        <td className="p-3 font-mono text-slate-500">{toPersianDigits(pd.date)}</td>
                        <td className="p-3">
                          {pd.type === 'purchase' ? (
                            <span className="text-violet-700 bg-violet-50 px-2 py-0.5 rounded font-bold">خرید</span>
                          ) : (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">فروش</span>
                          )}
                        </td>
                        <td className="p-3 text-left font-mono font-bold text-slate-800">{formatCurrency(pd.amount)}</td>
                        <td className="p-3 text-center">
                          {pd.status === 'pending' ? (
                            <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-bold border border-amber-100">در انتظار وصول (معلق)</span>
                          ) : (
                            <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full font-bold border border-emerald-100">وصول شده (قطعی)</span>
                          )}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-500">
                          {pd.clearedTxId ? (
                            <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[10px]" title={pd.clearedTxId}>
                              {toPersianDigits(pd.clearedTxId.substring(0, 15))}...
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {pd.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const isPurchase = pd.type === 'purchase';
                                    setActiveForm(isPurchase ? 'settlement' : 'receivableSettlement');
                                    setSelectedPendingDepositId(pd.id);
                                    setAmount(String(pd.amount));
                                    setDate(pd.date || getTodayJalali());
                                    const matchedInv = invoices.find(
                                      inv => inv.id === pd.invoiceId || String(inv.invoiceNumber).trim().toLowerCase() === String(pd.invoiceNumber).trim().toLowerCase()
                                    );
                                    if (matchedInv) {
                                      setSelectedInvoiceIds([matchedInv.id]);
                                    }
                                    setDesc(isPurchase
                                      ? `پرداخت قطعی بیعانه بابت فاکتور خرید شماره ${pd.invoiceNumber} - طرف حساب: ${pd.counterpartName}`
                                      : `وصول قطعی بیعانه بابت فاکتور شماره ${pd.invoiceNumber} - طرف حساب: ${pd.counterpartName}`);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                    setSuccess(`بیعانه فاکتور ${pd.invoiceNumber} در فرم ${isPurchase ? 'تسویه بدهی' : 'تسویه مطالبات'} بارگذاری شد. لطفاً حساب بانکی را انتخاب و ثبت فرمایید.`);
                                    setTimeout(() => setSuccess(null), 5000);
                                  }}
                                  className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer font-bold text-[10px] border border-teal-200/60"
                                  title="تسویه در فرم مطالبات / بدهی"
                                >
                                  <CheckCircle className="w-3.5 h-3.5 text-teal-600" />
                                  <span>{pd.type === 'purchase' ? 'تسویه بدهی' : 'تسویه مطالبات'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveForm(pd.type === 'purchase' ? 'withdrawal' : 'deposit');
                                    setSelectedPendingDepositId(pd.id);
                                    setAmount(String(pd.amount));
                                    setDate(pd.date || getTodayJalali());
                                    setDesc(pd.type === 'purchase'
                                      ? `پرداخت قطعی بیعانه بابت فاکتور خرید شماره ${pd.invoiceNumber} - طرف حساب: ${pd.counterpartName}`
                                      : `وصول قطعی بیعانه بابت فاکتور شماره ${pd.invoiceNumber} - طرف حساب: ${pd.counterpartName}`);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                    setSuccess(`اطلاعات بیعانه فاکتور ${pd.invoiceNumber} در فرم ثبت ${pd.type === 'purchase' ? 'برداشت' : 'واریز'} قرار گرفت. لطفاً حساب بانکی را انتخاب و ثبت فرمایید.`);
                                    setTimeout(() => setSuccess(null), 5000);
                                  }}
                                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer font-bold text-[10px] border border-emerald-200/60"
                                  title="ثبت مستقیم در فرم واریز / برداشت"
                                >
                                  <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>{pd.type === 'purchase' ? 'ثبت برداشت' : 'ثبت واریز'}</span>
                                </button>
                              </>
                            )}

                            {canDeleteDeposit && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`آیا از حذف سند بیعانه مربوط به فاکتور شماره ${pd.invoiceNumber} به مبلغ ${formatCurrency(pd.amount)} اطمینان دارید؟`)) {
                                    if (onUpdatePendingDeposits) {
                                      const updated = pendingDeposits.filter(p => p.id !== pd.id);
                                      onUpdatePendingDeposits(updated);
                                    }
                                    if (onUpdateInvoices && invoices) {
                                      const updatedInvoices = invoices.map(inv => {
                                        if (inv.id === pd.invoiceId || String(inv.invoiceNumber) === String(pd.invoiceNumber)) {
                                          const newDeposit = Math.max(0, (inv.deposit || 0) - (pd.amount || 0));
                                          let remainingSlips = (inv.paymentSlips || []).filter(s => s.id !== pd.id);
                                          // If ID didn't match directly and length didn't change, filter by matching amount if slip has same value
                                          if (remainingSlips.length === (inv.paymentSlips || []).length && (inv.paymentSlips || []).length > 0) {
                                            const idxToRemove = (inv.paymentSlips || []).findIndex(s => s.amount === pd.amount);
                                            if (idxToRemove !== -1) {
                                              remainingSlips = (inv.paymentSlips || []).filter((_, idx) => idx !== idxToRemove);
                                            }
                                          }
                                          return {
                                            ...inv,
                                            deposit: newDeposit,
                                            paymentSlips: remainingSlips.length > 0 && newDeposit > 0 ? remainingSlips : undefined
                                          };
                                        }
                                        return inv;
                                      });
                                      onUpdateInvoices(updatedInvoices);
                                    }
                                    setSuccess('سند بیعانه با موفقیت حذف و از فاکتور کسر گردید.');
                                    setTimeout(() => setSuccess(null), 4000);
                                  }
                                }}
                                className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer font-bold text-[10px] border border-rose-200/60"
                                title="حذف سند بیعانه"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف سند</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {tabPendingDeposits.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 font-semibold">
                        {pendingDepositFilter === 'pending'
                          ? 'هیچ سند بیعانه معلق (در انتظار وصول) یافت نشد.'
                          : pendingDepositFilter === 'cleared'
                          ? 'هیچ بیعانه وصول‌شده‌ای در این بازه زمانی یافت نشد.'
                          : 'هیچ سند بیعانه‌ای یافت نشد.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Invoice Detail Viewer Modal */}
      {viewingInvoice && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center z-50 p-4 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="popup-box-global rounded-3xl border border-slate-150 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6">
            
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
                    {(() => {
                      const itemsSubtotal = (viewingInvoice.items || []).reduce((s, it) => s + (it.totalPrice || (it.qty * it.unitPrice) || 0), 0);
                      const taxAmt = viewingInvoice.tax || 0;
                      const discAmt = viewingInvoice.discount || 0;
                      const depAmt = viewingInvoice.deposit || 0;
                      const grossTotal = itemsSubtotal > 0 ? itemsSubtotal : (viewingInvoice.totalAmount - taxAmt + discAmt);
                      const payableTotal = Math.max(0, grossTotal + taxAmt - discAmt);
                      const finalRemaining = Math.max(0, payableTotal - depAmt);

                      return (
                        <>
                          <tr className="bg-slate-50 font-medium text-slate-800">
                            <td colSpan={4} className="border border-slate-300 p-2 text-left text-[11px]">جمع ناخالص کالا و خدمات:</td>
                            <td className="border border-slate-300 p-2 text-left font-mono font-bold">{formatCurrency(grossTotal)}</td>
                          </tr>

                          {taxAmt > 0 && (
                            <tr className="bg-slate-50 font-medium text-slate-800">
                              <td colSpan={4} className="border border-slate-300 p-2 text-left text-[11px]">مالیات بر ارزش افزوده (+):</td>
                              <td className="border border-slate-300 p-2 text-left font-mono text-slate-700">{formatCurrency(taxAmt)}</td>
                            </tr>
                          )}

                          {discAmt > 0 && (
                            <tr className="bg-slate-50 font-medium text-slate-800">
                              <td colSpan={4} className="border border-slate-300 p-2 text-left text-[11px]">تخفیف اعطایی (-):</td>
                              <td className="border border-slate-300 p-2 text-left font-mono text-emerald-700">- {formatCurrency(discAmt)}</td>
                            </tr>
                          )}

                          {depAmt > 0 && (
                            <tr className="bg-slate-50 font-medium text-slate-800">
                              <td colSpan={4} className="border border-slate-300 p-2 text-left text-[11px]">مبلغ پرداختی (بیعانه / دریافت شده) (-):</td>
                              <td className="border border-slate-300 p-2 text-left font-mono text-indigo-750">- {formatCurrency(depAmt)}</td>
                            </tr>
                          )}

                          <tr className="bg-slate-100 font-bold text-slate-900 text-sm">
                            <td colSpan={4} className="border border-slate-300 p-2 text-left">مبلغ باقیمانده نهایی فاکتور:</td>
                            <td className="border border-slate-300 p-2 text-left font-mono text-blue-800">{formatCurrency(finalRemaining)}</td>
                          </tr>
                        </>
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
                      {(() => {
                        const itemsSubtotal = (viewingInvoice.items || []).reduce((s, it) => s + (it.totalPrice || (it.qty * it.unitPrice) || 0), 0);
                        const taxAmt = viewingInvoice.tax || 0;
                        const discAmt = viewingInvoice.discount || 0;
                        const depAmt = viewingInvoice.deposit || 0;
                        const grossTotal = itemsSubtotal > 0 ? itemsSubtotal : (viewingInvoice.totalAmount - taxAmt + discAmt);
                        const finalRemaining = Math.max(0, (grossTotal + taxAmt - discAmt) - depAmt);
                        return numberToPersianWords(finalRemaining);
                      })()} {currencyLabel}
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
            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-150 dark:border-slate-850">
              <div>
                {(currentUser.role === 'admin' || currentUser.role === 'accountant') && !!viewingInvoice.deposit && viewingInvoice.deposit > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`آیا از حذف مبلغ بیعانه (${formatCurrency(viewingInvoice.deposit || 0)}) از این سند اطمینان دارید؟`)) {
                        if (onUpdateInvoices) {
                          const updatedInvs = invoices.map(i => i.id === viewingInvoice.id ? { ...i, deposit: 0 } : i);
                          onUpdateInvoices(updatedInvs);
                          setViewingInvoice(prev => prev ? { ...prev, deposit: 0 } : null);
                          setSuccess('مبلغ بیعانه با موفقیت از روی این سند حذف گردید.');
                          setTimeout(() => setSuccess(null), 4000);
                        }
                      }
                    }}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer font-bold text-xs border border-rose-200"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف بیعانه این سند</span>
                  </button>
                )}
              </div>
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

      {/* Edit Transaction Modal */}
      {editingTx && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center z-50 p-4 animate-fade-in font-sans popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="popup-box-global rounded-3xl border border-slate-150 dark:border-slate-800 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-5">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-indigo-600">
                <Edit className="w-5 h-5" />
                <span className="font-extrabold text-slate-850 dark:text-slate-100 text-sm">
                  ویرایش سند تراکنش #{toPersianDigits(editingTx.id.substring(0, 8))}
                </span>
              </div>
              <button
                onClick={() => setEditingTx(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500">مبلغ تراکنش (ریال):</label>
                <input
                  type="number"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full text-left font-mono font-black text-xs p-3 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-1 focus:ring-indigo-500 bg-slate-100 dark:bg-slate-800"
                />
                {editAmount && Number(editAmount) > 0 && (
                  <span className="text-[10px] text-indigo-600 font-extrabold">
                    {numberToPersianWords(Number(editAmount))} ریال
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-500">تاریخ تراکنش (شمسی):</label>
                  <JalaliDatePicker
                    value={editDate}
                    onChange={(val) => setEditDate(val)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-500">ساعت:</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: ۱۲:۰۰"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full text-center font-mono text-xs p-3 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-1 focus:ring-indigo-500 bg-slate-100 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500">حساب معین مقصد/مبدا:</label>
                <select
                  value={editAccountId}
                  onChange={(e) => setEditAccountId(e.target.value)}
                  className="w-full text-right text-xs p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (موجودی: {formatCurrency(acc.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-500">دسته‌بندی اصلی:</label>
                  <select
                    value={editParentCat}
                    onChange={(e) => {
                      setEditParentCat(e.target.value);
                      const parent = categories.find(c => c.name === e.target.value);
                      if (parent && parent.subcategories.length > 0) {
                        setEditChildCat(parent.subcategories[0]);
                      }
                    }}
                    className="w-full text-right text-xs p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-850 dark:text-slate-200"
                  >
                    {categories.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-500">زیر‌دسته‌بندی:</label>
                  <select
                    value={editChildCat}
                    onChange={(e) => setEditChildCat(e.target.value)}
                    className="w-full text-right text-xs p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-850 dark:text-slate-200"
                  >
                    {categories
                      .find(c => c.name === editParentCat)
                      ?.subcategories.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Related Documents Attachment inside Edit */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500">اتصال به فاکتورهای رسمی:</label>
                <select
                  value={editInvoiceId}
                  onChange={(e) => setEditInvoiceId(e.target.value)}
                  className="w-full text-right text-xs p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  <option value="">-- فاقد اتصال فاکتور رسمی --</option>
                  {invoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      فاکتور رسمی #{inv.invoiceNumber} | طرف حساب: {inv.counterpartName} | مبلغ: {formatCurrency(inv.totalAmount)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Attachments Section */}
              <div className="space-y-1.5 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl">
                <label className="block text-xs font-bold text-slate-500">اسناد پیوست و ضمائم:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="نام سند پیوست (مثال: تصویر_فیش_واریزی.png)"
                    value={newAttachmentName}
                    onChange={(e) => setNewAttachmentName(e.target.value)}
                    className="flex-1 text-right text-xs p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-100 dark:bg-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newAttachmentName.trim()) {
                        setEditAttachments([...editAttachments, newAttachmentName.trim()]);
                        setNewAttachmentName('');
                      }
                    }}
                    className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-black cursor-pointer"
                  >
                    افزودن
                  </button>
                </div>

                <div className="flex flex-wrap gap-1 mt-2">
                  {editAttachments.map((file, i) => (
                    <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1.5 font-semibold">
                      <Paperclip className="w-3 h-3 text-slate-400" />
                      <span className="truncate max-w-[120px]">{file}</span>
                      <button
                        type="button"
                        onClick={() => setEditAttachments(editAttachments.filter((_, idx) => idx !== i))}
                        className="text-rose-500 hover:text-rose-700 font-extrabold cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500">توضیحات تراکنش:</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full text-right text-xs p-3 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-1 focus:ring-indigo-500 bg-slate-100 dark:bg-slate-800 h-20"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  ذخیره تغییرات
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* History Version Log Modal */}
      {historyTx && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center z-50 p-4 animate-fade-in font-sans popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="popup-box-global rounded-3xl border border-slate-150 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-5">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-indigo-600">
                <History className="w-5 h-5" />
                <span className="font-extrabold text-slate-850 dark:text-slate-100 text-sm">
                  تاریخچه تغییرات و نسخه‌های قبلی تراکنش #{toPersianDigits(historyTx.id.substring(0, 8))}
                </span>
              </div>
              <button
                onClick={() => setHistoryTx(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current State */}
            <div className="bg-indigo-50 dark:bg-slate-800 border border-indigo-150 dark:border-slate-700 p-4 rounded-2xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-black text-indigo-900 dark:text-indigo-400">وضعیت فعلی تراکنش</span>
                  {historyTx.isDeleted && (
                    <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold rounded-md text-[10px]">
                      غیرفعال‌شده (حذف نرم)
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-indigo-700 dark:text-indigo-300 font-medium">
                  {historyTx.createdBy && (
                    <span className="ml-3">ایجاد اولیه: {historyTx.createdBy} {historyTx.createdAt ? `(${historyTx.createdAt})` : ''}</span>
                  )}
                  {historyTx.editedBy && (
                    <span>آخرین تغییر: {historyTx.editedAt} توسط {historyTx.editedBy}</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-2">
                <div><span className="text-slate-500 font-bold block">مبلغ فعلی:</span> <span className="font-mono font-black text-indigo-700 dark:text-indigo-300">{formatCurrency(historyTx.amount)}</span></div>
                <div><span className="text-slate-500 font-bold block">تاریخ و ساعت:</span> <span className="font-mono font-black text-slate-800 dark:text-slate-200">{toPersianDigits(historyTx.date)} {historyTx.time && <span className="text-[10px]">({toPersianDigits(historyTx.time)})</span>}</span></div>
                <div><span className="text-slate-500 font-bold block">دسته‌بندی:</span> <span className="font-black text-slate-700 dark:text-slate-300">{historyTx.categoryParent} {historyTx.categoryChild ? `← ${historyTx.categoryChild}` : ''}</span></div>
                <div><span className="text-slate-500 font-bold block">حساب معین:</span> <span className="font-black text-slate-700 dark:text-slate-300">{historyTx.accountId ? accounts.find(a => a.id === historyTx.accountId)?.name : 'نامشخص'}</span></div>
              </div>
              {historyTx.description && (
                <div className="text-xs text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-900/40 p-2.5 rounded-xl border border-indigo-100 dark:border-slate-700/60 mt-1">
                  <span className="font-bold text-slate-400 dark:text-slate-500 block text-[10px] mb-0.5">شرح تراکنش:</span>
                  {historyTx.description}
                </div>
              )}
            </div>

            {/* Change Logs Timeline / Audit Log */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span>ردپای حسابرسی و تاریخچه کامل تغییرات (Audit Trail):</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  تعداد رخدادها: {toPersianDigits((historyTx.editHistory || []).length)}
                </span>
              </h4>
              <div className="relative border-r-2 border-indigo-200 dark:border-slate-800 mr-2 pr-4 space-y-4">
                {historyTx.editHistory && historyTx.editHistory.map((hist, idx) => {
                  const actionLabels: Record<string, { label: string; badgeClass: string }> = {
                    create: { label: 'ایجاد تراکنش', badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
                    edit: { label: 'ویرایش تراکنش', badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
                    soft_delete: { label: 'غیرفعال‌سازی (حذف نرم)', badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
                    restore: { label: 'بازیابی مجدد', badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' },
                  };
                  const actionInfo = actionLabels[hist.action || 'edit'] || { label: 'ویرایش', badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' };

                  return (
                    <div key={hist.id || idx} className="relative space-y-2 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-xs">
                      {/* Time Indicator dot */}
                      <span className="absolute -right-[22px] top-4 w-3 h-3 rounded-full bg-indigo-600 border-2 border-white dark:border-slate-900 shadow-sm" />
                      
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-md font-black text-[11px] ${actionInfo.badgeClass}`}>
                            {actionInfo.label}
                          </span>
                          <span className="font-extrabold text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md text-[10px]">
                            ثبت #{toPersianDigits(idx + 1)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1">
                          <span>توسط: <strong className="text-slate-800 dark:text-slate-200">{hist.editedBy || 'کاربر سیستم'}</strong></span>
                          <span className="mx-1">•</span>
                          <span>{hist.editedAt}</span>
                        </span>
                      </div>

                      {/* Detailed Field Diffs if Available */}
                      {hist.changes && hist.changes.length > 0 ? (
                        <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-700 mt-2">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">فیلدهای تغییر یافته در این ویرایش:</span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {hist.changes.map((c, cIdx) => (
                              <div key={cIdx} className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-150 dark:border-slate-800 text-[11px] space-y-1">
                                <div className="font-black text-indigo-600 dark:text-indigo-400 flex items-center justify-between">
                                  <span>{c.fieldLabel || c.field}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="text-rose-600 dark:text-rose-400 line-through truncate max-w-[120px]" title={String(c.oldValue)}>
                                    {c.field === 'amount' ? formatCurrency(Number(c.oldValue) || 0) : String(c.oldValue || '—')}
                                  </span>
                                  <span className="text-slate-400 font-bold">←</span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold truncate max-w-[120px]" title={String(c.newValue)}>
                                    {c.field === 'amount' ? formatCurrency(Number(c.newValue) || 0) : String(c.newValue || '—')}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Legacy Snapshot view fallback */
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] pt-2 border-t border-slate-200 dark:border-slate-700 mt-2">
                          <div><span className="text-slate-500 font-medium block mb-0.5">مبلغ قبلی:</span> <span className="font-mono font-bold text-rose-600">{formatCurrency(hist.amount)}</span></div>
                          <div><span className="text-slate-500 font-medium block mb-0.5">تاریخ قبلی:</span> <span className="font-mono font-medium">{toPersianDigits(hist.date)} {hist.time && <span className="text-[9px]">({toPersianDigits(hist.time)})</span>}</span></div>
                          <div><span className="text-slate-500 font-medium block mb-0.5">حساب معین:</span> <span className="font-semibold text-slate-650">{hist.accountId ? accounts.find(a => a.id === hist.accountId)?.name : 'نامشخص'}</span></div>
                          <div><span className="text-slate-500 font-medium block mb-0.5">دسته‌بندی:</span> <span className="font-semibold text-slate-650">{hist.categoryParent} {hist.categoryChild ? `← ${hist.categoryChild}` : ''}</span></div>
                        </div>
                      )}

                      {hist.reason && (
                        <div className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-2 rounded-lg mt-1">
                          <span className="font-bold block text-[10px]">علت تغییر:</span>
                          {hist.reason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setHistoryTx(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl cursor-pointer transition-colors"
              >
                بستن تاریخچه تغییرات
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Soft Delete Custom Confirmation Modal */}
      {softDeleteConfirmTx && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center z-[60] p-4 animate-fade-in font-sans popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="popup-box-global rounded-3xl border border-slate-150 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 md:p-8 text-center space-y-6 animate-scale-up">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/30 rounded-full flex items-center justify-center mx-auto text-rose-500 animate-bounce">
              <Trash2 className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-black text-slate-850 dark:text-slate-100">تأیید غیرفعال‌سازی تراکنش</h3>
              <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed font-bold">
                آیا از حذف این تراکنش مطمئن هستید؟ این عملیات غیرقابل بازگشت است.
              </p>
            </div>

            {/* Transaction details inside confirmation */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl text-right text-xs space-y-2 border border-slate-100 dark:border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-slate-500 font-bold">مبلغ تراکنش:</span>
                <span className="font-mono font-black text-rose-600">{formatCurrency(softDeleteConfirmTx.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-slate-500 font-bold">توضیحات:</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[200px]" title={softDeleteConfirmTx.description}>
                  {softDeleteConfirmTx.description || 'بدون توضیحات'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-slate-500 font-bold">تاریخ ثبت:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">{toPersianDigits(softDeleteConfirmTx.date)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  handleSoftDelete(softDeleteConfirmTx);
                  setSoftDeleteConfirmTx(null);
                }}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md shadow-rose-200 dark:shadow-none transition-all cursor-pointer"
              >
                تایید
              </button>
              <button
                type="button"
                onClick={() => setSoftDeleteConfirmTx(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal for Admin */}
      {permanentDeleteConfirmTx && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center z-[60] p-4 animate-fade-in font-sans popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="popup-box-global rounded-3xl border border-rose-200 dark:border-rose-900/50 shadow-2xl w-full max-w-md p-6 md:p-8 text-center space-y-6 animate-scale-up">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/50 rounded-full flex items-center justify-center mx-auto text-rose-600 animate-pulse">
              <Trash2 className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-black text-rose-700 dark:text-rose-400">تأیید حذف کامل و دائمی تراکنش</h3>
              <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed font-bold">
                آیا از حذف کامل این تراکنش از دیتابیس مطمئن هستید؟ این عملیات کاملاً <span className="underline font-black">غیرقابل بازگشت</span> است.
              </p>
            </div>

            {/* Transaction details inside confirmation */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl text-right text-xs space-y-2 border border-slate-100 dark:border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-slate-500 font-bold">مبلغ تراکنش:</span>
                <span className="font-mono font-black text-rose-600">{formatCurrency(permanentDeleteConfirmTx.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-slate-500 font-bold">توضیحات:</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[200px]" title={permanentDeleteConfirmTx.description}>
                  {permanentDeleteConfirmTx.description || 'بدون توضیحات'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-slate-500 font-bold">تاریخ ثبت:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">{toPersianDigits(permanentDeleteConfirmTx.date)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  handlePermanentDelete(permanentDeleteConfirmTx);
                  setPermanentDeleteConfirmTx(null);
                }}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer"
              >
                تأیید و حذف کامل
              </button>
              <button
                type="button"
                onClick={() => setPermanentDeleteConfirmTx(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {batchDeleteModalOpen && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center z-[60] p-4 animate-fade-in font-sans popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="popup-box-global rounded-3xl border border-rose-200 dark:border-rose-900/50 shadow-2xl w-full max-w-lg p-6 md:p-8 text-center space-y-6 animate-scale-up">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/50 rounded-full flex items-center justify-center mx-auto text-rose-600 animate-pulse">
              <Trash2 className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-base font-black text-rose-700 dark:text-rose-400">
                {listTab === 'deleted_transactions'
                  ? 'تأیید حذف کامل و دائمی گروهی تراکنش‌ها'
                  : listTab === 'sales'
                  ? 'تأیید غیرفعال‌سازی (حذف موقت) گروهی فاکتورهای فروش'
                  : listTab === 'purchases'
                  ? 'تأیید غیرفعال‌سازی (حذف موقت) گروهی فاکتورهای خرید'
                  : listTab === 'pending_deposits'
                  ? 'تأیید حذف گروهی اسناد بیعانه معلق'
                  : 'تأیید غیرفعال‌سازی (حذف موقت) گروهی تراکنش‌ها'}
              </h3>
              <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed font-bold">
                {listTab === 'deleted_transactions'
                  ? 'آیا از حذف کامل این تراکنش‌ها از پایگاه داده مطمئن هستید؟ این عملیات کاملاً غیرقابل بازگشت است و اسناد حسابداری مرتبط نیز تسویه/حذف خواهند شد.'
                  : listTab === 'sales' || listTab === 'purchases'
                  ? 'آیا از غیرفعال‌سازی فاکتورهای انتخاب‌شده مطمئن هستید؟ تراکنش‌های پرداخت/دریافت متصل به این فاکتورها نیز به صورت ایمن غیرفعال خواهند شد.'
                  : listTab === 'pending_deposits'
                  ? 'آیا از حذف اسناد بیعانه معلق انتخاب‌شده مطمئن هستید؟ این اسناد از لیست انتظارهای وصول خارج خواهند شد.'
                  : 'آیا از غیرفعال‌سازی این تراکنش‌ها مطمئن هستید؟ با این کار مانده حساب‌های متصل اصلاح شده و اسناد متناظر غیرفعال می‌گردند.'}
              </p>
            </div>

            {/* Batch Details Summary */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl text-right text-xs space-y-2.5 border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400 font-bold">
                  {listTab === 'sales' ? 'تعداد فاکتورهای فروش هدف:' : listTab === 'purchases' ? 'تعداد فاکتورهای خرید هدف:' : listTab === 'pending_deposits' ? 'تعداد اسناد بیعانه معلق هدف:' : 'تعداد تراکنش‌های هدف:'}
                </span>
                <span className="font-mono font-black text-slate-800 dark:text-slate-100 text-sm">
                  {toPersianDigits(targetBatchItems.length)} مورد
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400 font-bold">جمع کل مبالغ:</span>
                <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm">
                  {formatCurrency(targetBatchTotalAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400 font-bold">محدوده اعمال عملیات:</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {batchDeleteTarget === 'all_filtered' ? 'تمامی موارد فیلترشده در این تب' : 'موارد انتخاب شده توسط کاربر'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400 font-bold">نوع عملیات:</span>
                <span className={`font-black ${listTab === 'deleted_transactions' || listTab === 'pending_deposits' ? 'text-rose-700' : 'text-amber-700'}`}>
                  {listTab === 'deleted_transactions' ? 'حذف قطعی و دائمی از پایگاه داده' : listTab === 'pending_deposits' ? 'حذف سند معلق' : 'غیرفعال‌سازی موقت (Soft Delete)'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                disabled={isBatchDeleting || targetBatchItems.length === 0}
                onClick={handleConfirmBatchDeleteTransactions}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isBatchDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>در حال پردازش حذف گروهی...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>
                      {listTab === 'deleted_transactions'
                        ? `تأیید حذف کامل (${toPersianDigits(targetBatchItems.length)})`
                        : `تأیید حذف (${toPersianDigits(targetBatchItems.length)})`}
                    </span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isBatchDeleting}
                onClick={() => setBatchDeleteModalOpen(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal - SOLID NON-GLASSY BACKDROP */}
      {isCategoryModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto popup-overlay-global animate-fade-in"
          style={{ backgroundColor: 'var(--popup-overlay-bg)' }}
        >
          <div 
            className="border shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-right dir-rtl relative z-50 popup-box-global"
            style={{ 
              backgroundColor: 'var(--popup-bg)', 
              borderRadius: 'var(--popup-radius)', 
              boxShadow: 'var(--popup-shadow)',
              color: 'var(--popup-text)',
              borderColor: 'var(--popup-border)'
            }}
          >
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200/50 dark:border-slate-800/80 flex items-center justify-between bg-black/5 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                  categoryModalMode === 'create' 
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                    : 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                }`}>
                  {categoryModalMode === 'create' ? <Plus className="w-5 h-5" /> : <Edit className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-black" style={{ color: 'var(--popup-text)' }}>
                    {categoryModalMode === 'create' 
                      ? 'تعریف سرفصل و زیرمجموعه‌های جدید هزینه' 
                      : 'ویرایش و مدیریت سرفصل هزینه'}
                  </h3>
                  <p className="text-[11px] opacity-80 mt-0.5" style={{ color: 'var(--popup-text-muted)' }}>
                    {categoryModalMode === 'create'
                      ? 'ایجاد سرفصل جدید و تعیین زیرمجموعه‌های معین مربوطه'
                      : 'ویرایش، افزودن، حذف و تنظیمات سرفصل انتخاب‌شده'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-2 opacity-70 hover:opacity-100 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                style={{ color: 'var(--popup-text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 overflow-y-auto flex-1">
              
              {/* If mode is 'create', show input to define a new parent category */}
              {categoryModalMode === 'create' && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3">
                  <label className="text-xs font-bold text-emerald-700 dark:text-emerald-300 block">
                    افزودن سرفصل کلی جدید (مادر)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newParentCatName}
                      onChange={(e) => setNewParentCatName(e.target.value)}
                      placeholder="مثلاً: هزینه‌های تبلیغات و بازاریابی..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddParentCategory();
                        }
                      }}
                      className="flex-1 p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddParentCategory}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>افزودن سرفصل</span>
                    </button>
                  </div>
                </div>
              )}

              {/* If mode is 'edit_selected', allow selecting which category to edit */}
              {categoryModalMode === 'edit_selected' && (
                <div className="p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex items-center gap-3">
                  <label className="text-xs font-bold opacity-90 shrink-0" style={{ color: 'var(--popup-text)' }}>
                    انتخاب سرفصل جهت مدیریت:
                  </label>
                  <select
                    value={categoryModalTargetId || ''}
                    onChange={(e) => {
                      setCategoryModalTargetId(e.target.value);
                      const catObj = categories.find(c => c.id === e.target.value);
                      if (catObj) {
                        setParentCat(catObj.name);
                        setChildCat(catObj.subcategories[0] || 'سایر موارد');
                      }
                    }}
                    className="flex-1 p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-xs font-bold text-slate-800 dark:text-slate-100"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Categories list section */}
              <div className="space-y-4">
                {categoryModalMode === 'create' ? (
                  <>
                    <h4 className="text-xs font-bold opacity-90 flex items-center gap-2" style={{ color: 'var(--popup-text)' }}>
                      <span>سرفصل‌های جدید ایجاد شده ({toPersianDigits(createdSessionCatIds.length)})</span>
                    </h4>

                    {createdSessionCatIds.length === 0 ? (
                      <div className="text-center py-8 text-xs opacity-70 bg-black/5 dark:bg-white/5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700" style={{ color: 'var(--popup-text-muted)' }}>
                        هیچ سرفصل جدیدی در این نوبت ایجاد نشده است. ابتدا از کادر بالا سرفصل جدید را وارد کرده و دکمه «افزودن سرفصل» را بزنید تا زیرمجموعه‌های آن را تعریف کنید.
                      </div>
                    ) : (
                      categories
                        .filter(cat => createdSessionCatIds.includes(cat.id))
                        .map((cat) => (
                          <div
                            key={cat.id}
                            className="p-4 border border-slate-200/60 dark:border-slate-800/80 rounded-xl bg-black/5 dark:bg-white/5 space-y-3"
                          >
                            {/* Parent Category Header */}
                            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800">
                              {editingCatId === cat.id ? (
                                <div className="flex-1 flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={editingCatName}
                                    onChange={(e) => setEditingCatName(e.target.value)}
                                    className="flex-1 p-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleEditParentCategory(cat.id)}
                                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                                  >
                                    ذخیره
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCatId(null);
                                      setEditingCatName('');
                                    }}
                                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-300 cursor-pointer"
                                  >
                                    انصراف
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                                      {cat.name}
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                      {toPersianDigits(cat.subcategories.length)} زیرمجموعه
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCatId(cat.id);
                                        setEditingCatName(cat.name);
                                      }}
                                      className="p-1.5 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                      title="ویرایش نام سرفصل"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteParentCategory(cat.id, cat.name)}
                                      className="p-1.5 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                      title="حذف سرفصل"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Subcategories List & Add */}
                            <div className="space-y-2.5 pr-2">
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                                زیرمجموعه‌های معین:
                              </label>

                              {/* List of Subcategories */}
                              <div className="flex flex-wrap gap-2">
                                {cat.subcategories.map((sub, idx) => {
                                  const isEditingThis = editingSubCat?.catId === cat.id && editingSubCat?.subIdx === idx;

                                  if (isEditingThis) {
                                    return (
                                      <div key={idx} className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-indigo-400">
                                        <input
                                          type="text"
                                          value={editingSubCat.name}
                                          onChange={(e) => setEditingSubCat({ ...editingSubCat, name: e.target.value })}
                                          className="p-1 text-xs text-slate-800 dark:text-slate-100 bg-transparent focus:outline-none w-28"
                                          autoFocus
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleEditSubcategory(cat.id, idx, editingSubCat.name)}
                                          className="p-1 text-emerald-600 hover:text-emerald-700 cursor-pointer"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingSubCat(null)}
                                          className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div
                                      key={idx}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm"
                                    >
                                      <span>{sub}</span>
                                      <button
                                        type="button"
                                        onClick={() => setEditingSubCat({ catId: cat.id, subIdx: idx, name: sub })}
                                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                                        title="ویرایش زیرمجموعه"
                                      >
                                        <Edit className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSubcategory(cat.id, idx)}
                                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                                        title="حذف زیرمجموعه"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  );
                                })}

                                {cat.subcategories.length === 0 && (
                                  <span className="text-[11px] text-slate-400 italic">
                                    هیچ زیرمجموعه‌ای تعریف نشده است.
                                  </span>
                                )}
                              </div>

                              {/* Add New Subcategory Input */}
                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  type="text"
                                  value={newSubCatNames[cat.id] || ''}
                                  onChange={(e) => setNewSubCatNames({ ...newSubCatNames, [cat.id]: e.target.value })}
                                  placeholder="نام زیرمجموعه جدید..."
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAddSubcategory(cat.id);
                                    }
                                  }}
                                  className="flex-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddSubcategory(cat.id)}
                                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>افزودن زیرمجموعه</span>
                                </button>
                              </div>

                            </div>
                          </div>
                        ))
                    )}
                  </>
                ) : (
                  <>
                    {categories
                      .filter(cat => cat.id === categoryModalTargetId)
                      .map((cat) => (
                        <div
                          key={cat.id}
                          className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/40 dark:bg-slate-800/30 space-y-3"
                        >
                          {/* Parent Category Header */}
                          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800">
                            {editingCatId === cat.id ? (
                              <div className="flex-1 flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingCatName}
                                  onChange={(e) => setEditingCatName(e.target.value)}
                                  className="flex-1 p-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleEditParentCategory(cat.id)}
                                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                                >
                                  ذخیره
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCatId(null);
                                    setEditingCatName('');
                                  }}
                                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-300 cursor-pointer"
                                >
                                  انصراف
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                                    {cat.name}
                                  </span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                    {toPersianDigits(cat.subcategories.length)} زیرمجموعه
                                  </span>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCatId(cat.id);
                                      setEditingCatName(cat.name);
                                    }}
                                    className="p-1.5 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                    title="ویرایش نام سرفصل"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteParentCategory(cat.id, cat.name)}
                                    className="p-1.5 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                    title="حذف سرفصل"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Subcategories List & Add */}
                          <div className="space-y-2.5 pr-2">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                              زیرمجموعه‌های معین:
                            </label>

                            {/* List of Subcategories */}
                            <div className="flex flex-wrap gap-2">
                              {cat.subcategories.map((sub, idx) => {
                                const isEditingThis = editingSubCat?.catId === cat.id && editingSubCat?.subIdx === idx;

                                if (isEditingThis) {
                                  return (
                                    <div key={idx} className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-indigo-400">
                                      <input
                                        type="text"
                                        value={editingSubCat.name}
                                        onChange={(e) => setEditingSubCat({ ...editingSubCat, name: e.target.value })}
                                        className="p-1 text-xs text-slate-800 dark:text-slate-100 bg-transparent focus:outline-none w-28"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleEditSubcategory(cat.id, idx, editingSubCat.name)}
                                        className="p-1 text-emerald-600 hover:text-emerald-700 cursor-pointer"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingSubCat(null)}
                                        className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={idx}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm"
                                  >
                                    <span>{sub}</span>
                                    <button
                                      type="button"
                                      onClick={() => setEditingSubCat({ catId: cat.id, subIdx: idx, name: sub })}
                                      className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                                      title="ویرایش زیرمجموعه"
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSubcategory(cat.id, idx)}
                                      className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                                      title="حذف زیرمجموعه"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              })}

                              {cat.subcategories.length === 0 && (
                                <span className="text-[11px] text-slate-400 italic">
                                  هیچ زیرمجموعه‌ای تعریف نشده است.
                                </span>
                              )}
                            </div>

                            {/* Add New Subcategory Input */}
                            <div className="flex items-center gap-2 pt-1">
                              <input
                                type="text"
                                value={newSubCatNames[cat.id] || ''}
                                onChange={(e) => setNewSubCatNames({ ...newSubCatNames, [cat.id]: e.target.value })}
                                placeholder="نام زیرمجموعه جدید..."
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddSubcategory(cat.id);
                                  }
                                }}
                                className="flex-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddSubcategory(cat.id)}
                                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>افزودن زیرمجموعه</span>
                              </button>
                            </div>

                          </div>
                        </div>
                      ))}

                    {categories.filter(cat => cat.id === categoryModalTargetId).length === 0 && (
                      <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                        سرفصل انتخابی یافت نشد یا حذف شده است.
                      </div>
                    )}
                  </>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex justify-end">
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                بستن
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Quick Add Loan Borrower Modal */}
      {isAddBorrowerModalOpen && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 popup-overlay-global">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 popup-box-global">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm">افزودن شخص وام‌گیرنده جدید</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddBorrowerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!newBorrowerName.trim()) {
                alert('لطفاً نام وام‌گیرنده را وارد فرمایید.');
                return;
              }
              const initDebtNum = parseInt(newBorrowerInitialDebt.replace(/,/g, ''), 10) || 0;
              const newB: LoanBorrower = {
                id: 'borrower-' + Date.now(),
                name: newBorrowerName.trim(),
                phone: newBorrowerPhone.trim(),
                nationalId: newBorrowerNationalId.trim(),
                initialDebt: initDebtNum,
                createdAt: getTodayJalali(),
                createdBy: currentUser.name || 'کاربر',
                createdById: currentUser.id || ''
              };
              const updatedList = [...loanBorrowers, newB];
              if (onUpdateLoanBorrowers) {
                onUpdateLoanBorrowers(updatedList);
              }
              setSelectedBorrowerId(newB.id);
              setIsAddBorrowerModalOpen(false);
              setNewBorrowerName('');
              setNewBorrowerPhone('');
              setNewBorrowerNationalId('');
              setNewBorrowerInitialDebt('');
            }} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  نام و نام خانوادگی وام‌گیرنده <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newBorrowerName}
                  onChange={(e) => setNewBorrowerName(e.target.value)}
                  placeholder="مثال: علی محمدی"
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">شماره تماس</label>
                  <input
                    type="text"
                    value={newBorrowerPhone}
                    onChange={(e) => setNewBorrowerPhone(e.target.value)}
                    placeholder="۰۹۱۲..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-center font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">کد ملی / شناسه</label>
                  <input
                    type="text"
                    value={newBorrowerNationalId}
                    onChange={(e) => setNewBorrowerNationalId(e.target.value)}
                    placeholder="۰۰..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-center font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">بدهی اولیه (سابق) - اختیاری</label>
                <input
                  type="text"
                  value={newBorrowerInitialDebt ? toPersianDigits(parseInt(newBorrowerInitialDebt.replace(/[^0-9]/g, ''), 10).toLocaleString('en-US')) : ''}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9]/g, '');
                    setNewBorrowerInitialDebt(clean);
                  }}
                  placeholder="۰"
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-bold text-right"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAddBorrowerModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  ثبت و انتخاب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

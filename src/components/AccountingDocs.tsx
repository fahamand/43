import React, { useState } from 'react';
import { AccountingDocument, JournalEntryLine, BankAccount, WarehouseItem, FiscalYear } from '../types';
import { formatCurrency } from '../utils/stateManager';
import { 
  Plus, Trash2, Edit3, Archive, CheckCircle, AlertCircle, FileText, 
  HelpCircle, Eye, ArrowRight, CornerDownLeft, ArchiveRestore, X 
} from 'lucide-react';
import { JalaliDatePicker } from './JalaliDatePicker';
import { validateFiscalDate, getNextDocumentNumber, ensureUniqueDocNumber, validateAccountingDocument } from '../services';

interface AccountingDocsProps {
  documents: AccountingDocument[];
  accounts: BankAccount[];
  items: WarehouseItem[];
  fiscalYear?: FiscalYear;
  onAddDoc: (doc: AccountingDocument) => void;
  onUpdateDoc: (doc: AccountingDocument) => void;
  onDeleteDoc: (id: string) => void;
}

export default function AccountingDocs({
  documents,
  accounts,
  items,
  fiscalYear,
  onAddDoc,
  onUpdateDoc,
  onDeleteDoc
}: AccountingDocsProps) {
  const currencyLabel = localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال';
  const [showForm, setShowForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState<AccountingDocument | null>(null);

  // Deletion state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [docIdToDelete, setDocIdToDelete] = useState<string | null>(null);
  const [docNumToDelete, setDocNumToDelete] = useState<number | null>(null);
  
  // Form State
  const [date, setDate] = useState('1403/03/10');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalEntryLine[]>([
    { id: 'l-1', accountId: 'acc-1', accountName: 'بانک ملی ایران - پس‌انداز تجاری', debit: 0, credit: 0, description: '' },
    { id: 'l-2', accountId: 'item-1', accountName: 'هزینه خرید کالا', debit: 0, credit: 0, description: '' }
  ]);
  const [selectedLogDoc, setSelectedLogDoc] = useState<AccountingDocument | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filterArchived, setFilterArchived] = useState<boolean>(false);

  // Auto-fill account list options: combine cash bank accounts and warehouse asset titles
  const accountOptions = [
    ...accounts.map(a => ({ id: a.id, name: `${a.name} (حساب نقدی)` })),
    ...items.map(i => ({ id: `item-${i.id}`, name: `${i.name} (حساب کالا)` })),
    { id: 'cost-sys', name: 'سرفصل عمومی هزینه‌ها' },
    { id: 'rev-sys', name: 'سرفصل عمومی درآمدهای فروش' }
  ];

  const handleAddLine = () => {
    const newLine: JournalEntryLine = {
      id: `line-${Date.now()}-${lines.length}`,
      accountId: accountOptions[0]?.id || 'cost-sys',
      accountName: accountOptions[0]?.name || 'سرفصل عمومی هزینه‌ها',
      debit: 0,
      credit: 0,
      description: ''
    };
    setLines([...lines, newLine]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lines.length <= 2) {
      alert('یک سند حسابداری باید حداقل شامل دو ردیف (بدهکار و بستانکار) باشد.');
      return;
    }
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: keyof JournalEntryLine, val: any) => {
    const updated = [...lines];
    if (field === 'accountId') {
      const option = accountOptions.find(o => o.id === val);
      updated[idx].accountId = val;
      updated[idx].accountName = option ? option.name : '';
    } else if (field === 'debit' || field === 'credit') {
      const num = parseFloat(val) || 0;
      updated[idx][field] = num;
    } else {
      updated[idx][field] = val;
    }
    setLines(updated);
  };

  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
  const difference = totalDebit - totalCredit;

  const handleOpenCreate = () => {
    setEditingDoc(null);
    setDate(new Date().toLocaleDateString('fa-IR'));
    setDescription('');
    setLines([
      { id: 'l-1', accountId: 'acc-1', accountName: accounts[0]?.name || 'بانک', debit: 0, credit: 0, description: '' },
      { id: 'l-2', accountId: 'cost-sys', accountName: 'سرفصل عمومی هزینه‌ها', debit: 0, credit: 0, description: '' }
    ]);
    setShowForm(true);
  };

  const handleOpenEdit = (doc: AccountingDocument) => {
    setEditingDoc(doc);
    setDate(doc.date);
    setDescription(doc.description);
    setLines(doc.lines);
    setShowForm(true);
  };

  const handleSaveDoc = (e: React.FormEvent) => {
    e.preventDefault();

    const targetDocNumber = editingDoc
      ? ensureUniqueDocNumber(editingDoc.docNumber, documents, editingDoc.id)
      : getNextDocumentNumber(documents, fiscalYear);

    const validation = validateAccountingDocument(
      {
        id: editingDoc?.id,
        docNumber: targetDocNumber,
        date,
        description,
        lines,
        isDeleted: false
      },
      {
        fiscalYear,
        existingDocs: documents,
        excludeDocId: editingDoc?.id
      }
    );

    if (!validation.valid) {
      alert(validation.error || validation.errors.join('\n'));
      return;
    }

    if (editingDoc) {
      const updated: AccountingDocument = {
        ...editingDoc,
        docNumber: targetDocNumber,
        date: validation.normalizedDate,
        description,
        lines: validation.cleanedLines
      };
      onUpdateDoc(updated);
      setSuccessMsg(`سند حسابداری شماره ${targetDocNumber} با موفقیت ویرایش شد.`);
    } else {
      const newDoc: AccountingDocument = {
        id: `doc-${Date.now()}`,
        docNumber: targetDocNumber,
        date: validation.normalizedDate,
        description,
        lines: validation.cleanedLines,
        isArchived: false,
        isManual: true,
        status: 'posted'
      };
      onAddDoc(newDoc);
      setSuccessMsg(`سند حسابداری روزنامه شماره ${targetDocNumber} با موفقیت ثبت شد.`);
    }

    setShowForm(false);
    setSelectedLogDoc(null);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleArchiveToggle = (doc: AccountingDocument) => {
    const updated: AccountingDocument = {
      ...doc,
      isArchived: !doc.isArchived
    };
    onUpdateDoc(updated);
    setSuccessMsg(doc.isArchived ? `سند شماره ${doc.docNumber} از بایگانی خارج شد.` : `سند شماره ${doc.docNumber} بایگانی شد.`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleDelete = (id: string, num: number) => {
    setDocIdToDelete(id);
    setDocNumToDelete(num);
    setDeleteConfirmOpen(true);
  };

  const displayedDocs = documents
    .filter(d => d.isArchived === filterArchived)
    .sort((a, b) => b.docNumber - a.docNumber || b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      
      {/* Title block */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between shadow-sm gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">۳. دفتر روزنامه و مدیریت اسناد حسابداری</h2>
          <p className="text-slate-500 text-sm mt-1">امکان تعریف، ویرایش، حذف تاییدیه تراز دوبل، و طبقه‌بندی و بایگانی تمامی اسناد حسابداری به ترتیب شماره سند</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setFilterArchived(!filterArchived)}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              filterArchived 
              ? 'bg-amber-50 border-amber-200 text-amber-700' 
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {filterArchived ? 'مشاهده اسناد فعال جاری' : 'مشاهده اسناد بایگانی‌شده'}
          </button>
          
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs shadow hover:shadow-md transition-all cursor-pointer"
            id="btn-create-accounting-doc"
          >
            <Plus className="w-4 h-4" />
            <span>صدور سند دوبل دست‌نویس</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-sm font-semibold animate-fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Write state form */}
      {showForm && (
        <div className="bg-white rounded-2xl border-2 border-blue-500 p-6 md:p-8 shadow-xl animate-scale-up animate-duration-150 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <FileText className="text-blue-600" />
              <span>{editingDoc ? `ویرایش سند حسابداری شماره ${editingDoc.docNumber}` : 'ثبت سند حسابداری جدید (دوبل استاندارد)'}</span>
            </h3>
            <button
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveDoc} className="space-y-6">
            
            {/* Top info inputs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">تاریخ ثبت سند</label>
                <JalaliDatePicker
                  value={date}
                  onChange={(val) => setDate(val)}
                  placeholder="۱۴۰۳/۰۱/۰۱"
                />
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-600">شرح کلی عطف سند (بابت...)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="مثال: بابت ثبت سودهای مالی و بستن فاکتورهای اردیبهشت ماه..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800"
                  required
                />
              </div>
            </div>

            {/* Document Lines double-entry */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">اقلام و شرح آرتیکل‌های حسابداری</span>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-800 font-semibold py-1 px-2 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> افزودن ردیف آرتیکل
                </button>
              </div>

              <div className="border border-slate-250 rounded-xl overflow-hidden shadow-inner bg-slate-50/50">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-1/3">حساب معین / سرفصل</th>
                      <th className="p-3 text-left w-1/5">بدهکار ({currencyLabel})</th>
                      <th className="p-3 text-left w-1/5">بستانکار ({currencyLabel})</th>
                      <th className="p-3">شرح جزئی آرتیکل</th>
                      <th className="p-3 text-center w-12">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {lines.map((line, i) => (
                      <tr key={line.id} className="bg-white">
                        <td className="p-2">
                          <select
                            value={line.accountId}
                            onChange={(e) => handleLineChange(i, 'accountId', e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                          >
                            {accountOptions.map(opt => (
                              <option key={opt.id} value={opt.id}>{opt.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={line.debit ? Number(line.debit).toLocaleString('en-US') : ''}
                            onChange={(e) => {
                              const clean = e.target.value.replace(/,/g, '');
                              const parsed = parseFloat(clean) || 0;
                              handleLineChange(i, 'debit', parsed);
                            }}
                            className="w-full p-2 border border-slate-200 rounded-lg text-left font-mono text-xs text-emerald-700 font-bold"
                            placeholder="0"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={line.credit ? Number(line.credit).toLocaleString('en-US') : ''}
                            onChange={(e) => {
                              const clean = e.target.value.replace(/,/g, '');
                              const parsed = parseFloat(clean) || 0;
                              handleLineChange(i, 'credit', parsed);
                            }}
                            className="w-full p-2 border border-slate-200 rounded-lg text-left font-mono text-xs text-rose-700 font-bold"
                            placeholder="0"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => handleLineChange(i, 'description', e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                            placeholder="توضیحات اختیاری ردیف معین..."
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(i)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sum and balancing validations */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-150 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-semibold">
              <div className="flex flex-wrap gap-6 justify-center">
                <div className="flex gap-2">
                  <span className="text-slate-500">جمع کل بدهکار:</span>
                  <span className="font-bold text-emerald-600 font-mono text-xs">{formatCurrency(totalDebit)}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500">جمع کل بستانکار:</span>
                  <span className="font-bold text-rose-600 font-mono text-xs">{formatCurrency(totalCredit)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-500">اختلاف موازنه:</span>
                {difference === 0 ? (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> تراز شده (اختلاف صفر)
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full font-bold flex items-center gap-1.5 animate-pulse">
                    <AlertCircle className="w-3.5 h-3.5" /> نا‌تراز! (مبلغ: {formatCurrency(Math.abs(difference))})
                  </span>
                )}
              </div>
            </div>

            {/* Form actions */}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={difference !== 0}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow hover:shadow-md transition-all cursor-pointer disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
              >
                ثبت سند روزنامه
              </button>
            </div>

          </form>
        </div>
      )}

      {/* Daybook listing */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 text-sm">لیست اسناد دفتر روزنامه اصلی ({displayedDocs.length})</h3>
          <span className="text-[10px] text-slate-400 font-mono">سال مالی جاری: ۱۴۰۳</span>
        </div>

        {displayedDocs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold">هیچ سند حسابداری در این کلاس یافت نشد.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayedDocs.map(doc => {
              const docTotal = doc.lines.reduce((s, l) => s + l.debit, 0);
              const isSelected = selectedLogDoc?.id === doc.id;

              return (
                <div key={doc.id} className="p-5 hover:bg-slate-50/60 transition-colors space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex flex-col items-center justify-center border border-blue-100">
                        <span className="text-[10px] font-medium leading-none text-blue-400">شماره</span>
                        <span className="font-bold font-mono text-sm leading-none mt-1">{doc.docNumber}</span>
                      </div>
                      
                      <div>
                        <h4 className="font-bold text-slate-800 text-xs sm:text-sm">{doc.description}</h4>
                        <div className="flex items-center gap-3 text-slate-400 text-[10px] mt-1 font-mono">
                          <span>تاریخ: {doc.date}</span>
                          <span>•</span>
                          <span>وضعیت: {doc.status === 'posted' ? 'بایگانی قطعی' : 'پیش‌نویس'}</span>
                          <span>•</span>
                          <span>منشا: {doc.isManual ? 'ثبت معین دستی' : 'سیستم فاکتور/بانک'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0">
                      <div className="text-left">
                        <span className="text-[10px] text-slate-400 block">جمع تراز سند</span>
                        <span className="font-bold font-mono text-slate-800 text-xs mt-0.5 block">{formatCurrency(docTotal)}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedLogDoc(isSelected ? null : doc)}
                          className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold flex items-center gap-1 border border-transparent hover:border-blue-100 cursor-pointer"
                          title="نمایش ریز اقلام سند"
                        >
                          <Eye className="w-4 h-4" />
                          <span>{isSelected ? 'جمع‌کردن' : 'مشاهده ردیف‌ها'}</span>
                        </button>

                        <button
                          onClick={() => handleOpenEdit(doc)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="ویرایش سند"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleArchiveToggle(doc)}
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title={doc.isArchived ? "خروج از بایگانی" : "بایگانی سند"}
                        >
                          {doc.isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => handleDelete(doc.id, doc.docNumber)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="حذف دائمی سند"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Lines dropdown table drawer */}
                  {isSelected && (
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 animate-fade-in animate-duration-150 space-y-3">
                      <h5 className="text-[11px] font-bold text-slate-500 border-b border-slate-200 pb-1.5">ریز ردیف‌های معین بابت آرتیکل:</h5>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                          <thead className="text-slate-400 font-semibold border-b border-slate-100">
                            <tr>
                              <th className="pb-2">کد معین حساب مربوطه</th>
                              <th className="pb-2 text-left">بدهکار ({currencyLabel})</th>
                              <th className="pb-2 text-left">بستانکار ({currencyLabel})</th>
                              <th className="pb-2">شرح تفصیلی خط</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                            {doc.lines.map(line => (
                              <tr key={line.id} className="hover:bg-white/40">
                                <td className="py-2.5 font-bold flex items-center gap-1.5 text-slate-800">
                                  <CornerDownLeft className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{line.accountName}</span>
                                </td>
                                <td className="py-2.5 font-mono text-left text-emerald-700 font-bold">
                                  {line.debit > 0 ? formatCurrency(line.debit) : '۰'}
                                </td>
                                <td className="py-2.5 font-mono text-left text-rose-700 font-bold">
                                  {line.credit > 0 ? formatCurrency(line.credit) : '۰'}
                                </td>
                                <td className="py-2.5 text-slate-500 font-sans">{line.description || 'بابت ثبت تجاری'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom Deletion Confirmation Popup */}
      {deleteConfirmOpen && docIdToDelete && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="popup-box-global rounded-2xl shadow-xl w-full max-w-sm p-6 text-right border border-slate-200 dark:border-slate-800 space-y-4">
            <h4 className="font-bold text-slate-800 dark:text-white text-sm">تایید حذف سند حسابداری</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
              آیا مطمئن هستید که میخواهید این مورد را حذف کنید؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDocIdToDelete(null);
                  setDocNumToDelete(null);
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                type="button"
              >
                انصراف
              </button>
              <button
                onClick={() => {
                  if (docIdToDelete) {
                    onDeleteDoc(docIdToDelete);
                    if (docNumToDelete !== null) {
                      setSuccessMsg(`سند حسابداری شماره ${docNumToDelete} حذف شد.`);
                      setTimeout(() => setSuccessMsg(null), 3500);
                    }
                  }
                  setDeleteConfirmOpen(false);
                  setDocIdToDelete(null);
                  setDocNumToDelete(null);
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                type="button"
              >
                تأیید حذف
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

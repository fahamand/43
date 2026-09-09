import React, { useState } from 'react';
import { Counterpart, User } from '../types';
import { Plus, Users, UserPlus, Phone, MapPin, Tag, Shield, Eye, Trash2, Edit3, AlertTriangle, Search, X } from 'lucide-react';
import { getTodayJalali } from '../utils/stateManager';
import { PaginationControls } from './PaginationControls';

interface CounterpartManagerProps {
  counterparts: Counterpart[];
  currentUser: User;
  users?: User[];
  onAddCounterpart: (cp: Counterpart) => void;
  onDeleteCounterpart?: (id: string) => void;
  onUpdateCounterpart?: (cp: Counterpart) => void;
}

export default function CounterpartManager({
  counterparts,
  currentUser,
  users = [],
  onAddCounterpart,
  onDeleteCounterpart,
  onUpdateCounterpart
}: CounterpartManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<'buyer' | 'seller' | 'both'>('buyer');

  // Deletion state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [counterpartToDelete, setCounterpartToDelete] = useState<Counterpart | null>(null);

  // Duplicate Warning state
  const [duplicateWarning, setDuplicateWarning] = useState<{ name: string; createdBy: string; createdAt: string } | null>(null);

  // Editing counterpart states
  const [editingCp, setEditingCp] = useState<Counterpart | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editType, setEditType] = useState<'buyer' | 'seller' | 'both'>('buyer');
  const [editCreatedById, setEditCreatedById] = useState<string>('');

  React.useEffect(() => {
    if (editingCp) {
      setEditName(editingCp.name);
      setEditPhone(editingCp.phone === 'ثبت نشده' ? '' : editingCp.phone);
      setEditAddress(editingCp.address === 'ثبت نشده' ? '' : editingCp.address);
      setEditType(editingCp.type);
      const existingUser = users.find(u => u.id === editingCp.createdById || u.name === editingCp.createdBy);
      setEditCreatedById(existingUser ? existingUser.id : (editingCp.createdById || ''));
    }
  }, [editingCp, users]);

  // Enforce role-based visibility, search filtering, and Persian alphabetical sorting
  const isSeller = currentUser.role === 'seller';
  const cleanSearch = searchTerm.trim().toLowerCase();

  const filteredCounterparts = counterparts
    .filter(cp => {
      if (isSeller && cp.createdById !== currentUser.id) {
        return false;
      }
      if (!cleanSearch) return true;
      const matchesName = (cp.name || '').toLowerCase().includes(cleanSearch);
      const matchesPhone = (cp.phone || '').toLowerCase().includes(cleanSearch);
      return matchesName || matchesPhone;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fa'));

  const [cpPage, setCpPage] = useState(1);
  const [cpPageSize, setCpPageSize] = useState(15);

  const totalCpPages = Math.ceil(filteredCounterparts.length / cpPageSize) || 1;
  const paginatedCounterparts = filteredCounterparts.slice((cpPage - 1) * cpPageSize, cpPage * cpPageSize);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const trimmedName = name.trim();
    const existing = counterparts.find(cp => cp.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      setDuplicateWarning({
        name: existing.name,
        createdBy: existing.createdBy || 'سیستم کل',
        createdAt: existing.createdAt || 'ثبت شده در سیستم'
      });
      return;
    }

    const trimmedPhone = phone.trim();
    if (trimmedPhone && trimmedPhone !== 'ثبت نشده') {
      const phoneExists = counterparts.find(cp => cp.phone && cp.phone.trim() !== 'ثبت نشده' && cp.phone.trim() === trimmedPhone);
      if (phoneExists) {
        alert(`خطا: شماره تماس «${trimmedPhone}» قبلاً برای طرف حساب دیگری به نام «${phoneExists.name}» ثبت شده است. ثبت طرف حساب جدید مسدود گردید.`);
        return;
      }
    }

    const newCp: Counterpart = {
      id: `cp-${Date.now()}`,
      name: trimmedName,
      phone: trimmedPhone || 'ثبت نشده',
      address: address.trim() || 'ثبت نشده',
      type,
      createdBy: currentUser?.name || '',
      createdById: currentUser?.id || '',
      createdAt: getTodayJalali()
    };

    onAddCounterpart(newCp);

    // Reset Form
    setName('');
    setPhone('');
    setAddress('');
    setType('buyer');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6 animate-fade-in text-right" dir="rtl">
      
      {/* Header Info Box */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between shadow-sm gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>مدیریت طرف حسابان سیستم</span>
          </h2>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-1.5 font-bold leading-relaxed">
            {isSeller 
              ? 'شما در این بخش فقط به طرف حساب‌هایی که خودتان ثبت کرده‌اید دسترسی دارید.' 
              : 'کاربر گرامی با سطح دسترسی برتر، شما به تمامی طرف حساب‌های خریداران و تامین‌کنندگان دسترسی کامل دارید.'}
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>ثبت طرف حساب جدید</span>
        </button>
      </div>

      {/* Add Counterpart Form Modal / Box */}
      {showAddForm && (
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4 animate-fade-in transition-all">
          <div className="border-b border-rose-50 dark:border-slate-800 pb-2">
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200">فرم ثبت طرف حساب جدید</h4>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4 space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">نام و نام‌خانوادگی (یا نام شرکت)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  const trimmedName = name.trim();
                  if (trimmedName) {
                    const existing = counterparts.find(cp => cp.name.trim().toLowerCase() === trimmedName.toLowerCase());
                    if (existing) {
                      setDuplicateWarning({
                        name: existing.name,
                        createdBy: existing.createdBy || 'سیستم کل',
                        createdAt: existing.createdAt || 'ثبت شده در سیستم'
                      });
                    }
                  }
                }}
                placeholder="مثال: شرکت پتروپارس یا احمد معتمدی"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-800 dark:text-white focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>

            <div className="md:col-span-4 space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">شماره تماس</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="مثال: 09121234567 یا 02188880000"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-800 dark:text-white text-right font-mono"
              />
            </div>

            <div className="md:col-span-4 space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">نقش در سیستم</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-750 dark:text-slate-250 font-bold"
              >
                <option value="buyer">خریدار فاکتور فروش</option>
                <option value="seller">تامین‌کننده فاکتور خرید</option>
                <option value="both">هر دو (همکار تجاری)</option>
              </select>
            </div>

            <div className="md:col-span-12 space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">نشانی و آدرس محل فعالیت</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="آدرس کامل را وارد کنید"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-800 dark:text-white"
              />
            </div>

            <div className="md:col-span-12 flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-[11px] font-bold cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold cursor-pointer"
              >
                ذخیره طرف حساب
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Counterparts Table & Cards */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-150 dark:border-slate-850 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Shield className="w-4 h-3.5 text-slate-400" />
            <span>آرشیو کدهای شناسایی و مشخصات ({filteredCounterparts.length} نفر)</span>
          </span>

          <div className="flex items-center gap-2">
            {/* Search Input Field */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCpPage(1);
                }}
                placeholder="جستجو بر اساس نام یا شماره تماس..."
                className="w-full pr-9 pl-7 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setCpPage(1);
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                  title="پاک کردن جستجو"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-bold px-2.5 py-1.5 rounded-full border border-indigo-100 dark:border-indigo-900/55 shrink-0 hidden md:inline-block">
              داده‌های معتبر
            </span>
          </div>
        </div>

        {filteredCounterparts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-xs font-bold space-y-2">
            <Users className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto" />
            <p>هیچ طرف حسابی یافت نشد.</p>
            {isSeller && <p className="text-[10px] text-slate-400">شما هنوز هیچ طرف حسابی ثبت نکرده‌اید.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto min-w-full">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-100/60 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 border-b border-slate-150 dark:border-slate-850 text-[10px] sm:text-[11px] font-bold">
                  <th className="p-3.5 text-center">شناسه کاربر</th>
                  <th className="p-3.5">نام طرف حساب / همکار</th>
                  <th className="p-3.5">شماره تماس همراه</th>
                  {!isSeller && <th className="p-3.5 text-center">ثبت‌کننده (پرسنل)</th>}
                  <th className="p-3.5 text-center">نقش معاملاتی</th>
                  <th className="p-3.5 text-center">تاریخ ثبت</th>
                  {!isSeller && <th className="p-3.5 text-center">عملیات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-xs text-slate-800 dark:text-slate-200">
                {paginatedCounterparts.map(cp => (
                  <tr key={cp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/30 transition-colors">
                    <td className="p-3 text-center font-mono text-[10px] text-slate-550 dark:text-slate-500 font-bold">{cp.id}</td>
                    <td className="p-3 font-extrabold text-slate-900 dark:text-white">{cp.name}</td>
                    <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300 text-right">{cp.phone}</td>
                    {!isSeller && (
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-800">
                          <select
                            value={users.find(u => u.id === cp.createdById || u.name === cp.createdBy)?.id || ''}
                            onChange={(e) => {
                              const selectedUser = users.find(u => u.id === e.target.value);
                              if (selectedUser && onUpdateCounterpart) {
                                onUpdateCounterpart({
                                  ...cp,
                                  createdBy: selectedUser.name,
                                  createdById: selectedUser.id
                                });
                              }
                            }}
                            className="bg-transparent border-0 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-0 cursor-pointer"
                            title="تغییر پرسنل ثبت‌کننده"
                          >
                            {!users.some(u => u.id === cp.createdById || u.name === cp.createdBy) && (
                              <option value="">{cp.createdBy || 'سیستم کل'}</option>
                            )}
                            {users.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.role === 'admin' ? 'مدیر' : u.role === 'accountant' ? 'حسابدار' : 'فروشنده'})
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    )}
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                        cp.type === 'buyer' 
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/45 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50' 
                          : cp.type === 'seller' 
                            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/45 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50' 
                            : 'bg-teal-50 text-teal-700 dark:bg-teal-950/45 dark:text-teal-300 border border-teal-100 dark:border-teal-900/50'
                      }`}>
                        {cp.type === 'buyer' ? 'خریدار مشتری' : cp.type === 'seller' ? 'تامین‌کننده خرید' : 'همکار دو طرفه'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 block font-bold">
                        {cp.createdAt || 'ثبت شده در سیستم'}
                      </span>
                    </td>
                    {!isSeller && (
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setEditingCp(cp)}
                            className="p-1 px-2.5 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg border border-amber-150 dark:border-amber-900/50 text-[10px] font-bold cursor-pointer transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5 inline ml-1" />
                            ویرایش
                          </button>
                          {onDeleteCounterpart && (
                            <button
                              onClick={() => {
                                setCounterpartToDelete(cp);
                                setDeleteConfirmOpen(true);
                              }}
                              className="p-1 px-2.5 bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-150 dark:border-rose-900/50 text-[10px] font-bold cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline ml-1" />
                              حذف
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls
              currentPage={cpPage}
              totalPages={totalCpPages}
              pageSize={cpPageSize}
              totalItems={filteredCounterparts.length}
              onPageChange={setCpPage}
              onPageSizeChange={setCpPageSize}
            />
          </div>
        )}
      </div>

      {/* Custom Deletion Confirmation popup */}
      {deleteConfirmOpen && counterpartToDelete && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl shadow-xl w-full max-w-sm p-6 text-right border border-slate-200 dark:border-slate-800 space-y-4 popup-box-global">
            <h4 className="font-bold text-slate-800 dark:text-white text-sm">تایید حذف طرف حساب</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
              آیا مطمئن هستید که میخواهید این مورد را حذف کنید؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setCounterpartToDelete(null);
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                type="button"
              >
                انصراف
              </button>
              <button
                onClick={() => {
                  if (onDeleteCounterpart && counterpartToDelete) {
                    onDeleteCounterpart(counterpartToDelete.id);
                  }
                  setDeleteConfirmOpen(false);
                  setCounterpartToDelete(null);
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

      {/* Duplicate Warning Modal */}
      {duplicateWarning && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-[9999] popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-6 text-right space-y-4 popup-box-global">
            <div className="flex items-center gap-2 text-amber-600 font-bold">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h4 className="text-sm">هشدار: طرف حساب تکراری</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              طرف حساب با نام <strong className="text-slate-800 dark:text-white">«{duplicateWarning.name}»</strong> قبلاً در سیستم ثبت شده است.
            </p>
            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-850 text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
              <div>
                <span>ثبت‌کننده: </span>
                <strong className="text-slate-800 dark:text-slate-200">{duplicateWarning.createdBy}</strong>
              </div>
              <div>
                <span>تاریخ ثبت: </span>
                <strong className="text-slate-800 dark:text-slate-200">{duplicateWarning.createdAt}</strong>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDuplicateWarning(null)}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
            >
              بستن پیام
            </button>
          </div>
        </div>
      )}

      {/* Edit Counterpart Modal */}
      {editingCp && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl shadow-xl w-full max-w-md p-6 text-right border border-slate-200 dark:border-slate-800 space-y-4 popup-box-global">
            <h4 className="font-black text-slate-900 dark:text-white text-sm flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <Edit3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>ویرایش اطلاعات طرف حساب</span>
            </h4>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!editName.trim()) return;

              const trimmedEditName = editName.trim();
              const isDuplicate = counterparts.some(cp => cp.id !== editingCp.id && cp.name.trim().toLowerCase() === trimmedEditName.toLowerCase());
              if (isDuplicate) {
                const existing = counterparts.find(cp => cp.id !== editingCp.id && cp.name.trim().toLowerCase() === trimmedEditName.toLowerCase())!;
                setDuplicateWarning({
                  name: existing.name,
                  createdBy: existing.createdBy || 'سیستم کل',
                  createdAt: existing.createdAt || 'ثبت شده در سیستم'
                });
                return;
              }

              const trimmedEditPhone = editPhone.trim();
              if (trimmedEditPhone && trimmedEditPhone !== 'ثبت نشده') {
                const phoneExists = counterparts.find(cp => cp.id !== editingCp.id && cp.phone && cp.phone.trim() !== 'ثبت نشده' && cp.phone.trim() === trimmedEditPhone);
                if (phoneExists) {
                  alert(`خطا: شماره تماس «${trimmedEditPhone}» قبلاً برای طرف حساب دیگری به نام «${phoneExists.name}» ثبت شده است. ذخیره تغییرات مسدود گردید.`);
                  return;
                }
              }

              const selectedUser = users.find(u => u.id === editCreatedById);
              const updatedCreatedBy = selectedUser ? selectedUser.name : (editingCp.createdBy || '');
              const updatedCreatedById = selectedUser ? selectedUser.id : (editingCp.createdById || '');

              if (onUpdateCounterpart) {
                onUpdateCounterpart({
                  ...editingCp,
                  name: trimmedEditName,
                  phone: trimmedEditPhone || 'ثبت نشده',
                  address: editAddress.trim() || 'ثبت نشده',
                  type: editType,
                  createdBy: updatedCreatedBy,
                  createdById: updatedCreatedById
                });
              }
              setEditingCp(null);
            }} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">نام و نام‌خانوادگی (یا نام شرکت)</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white focus:ring-1 focus:ring-indigo-500 font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">شماره تماس</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">نقش در سیستم</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-750 dark:text-slate-250 font-bold"
                >
                  <option value="buyer">خریدار فاکتور فروش</option>
                  <option value="seller">تامین‌کننده فاکتور خرید</option>
                  <option value="both">هر دو (همکار تجاری)</option>
                </select>
              </div>

              {!isSeller && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">تغییر پرسنل ثبت‌کننده</label>
                  <select
                    value={editCreatedById}
                    onChange={(e) => setEditCreatedById(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white font-bold"
                  >
                    <option value="">انتخاب پرسنل...</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role === 'admin' ? 'مدیر' : u.role === 'accountant' ? 'حسابدار' : 'فروشنده'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">نشانی و آدرس محل فعالیت</label>
                <textarea
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCp(null)}
                  className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer"
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

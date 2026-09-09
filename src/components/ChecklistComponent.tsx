import React, { useState } from 'react';
import { ChecklistItem, User } from '../types';
import { CheckSquare, Square, Trash2, Plus, Calendar, UserCheck, Lock, Users, Shield, BookOpen, Clock, StickyNote, Award, Check } from 'lucide-react';

interface ChecklistComponentProps {
  checklist: ChecklistItem[];
  currentUser: User;
  onToggleChecklist: (id: string) => void;
  onAddChecklistItem: (task: string, isPublic: boolean) => void;
  onDeleteChecklistItem: (id: string) => void;
}

type ChecklistTab = 'personal' | 'public';

export default function ChecklistComponent({
  checklist,
  currentUser,
  onToggleChecklist,
  onAddChecklistItem,
  onDeleteChecklistItem
}: ChecklistComponentProps) {
  const [task, setTask] = useState('');
  const [activeTab, setActiveTab] = useState<ChecklistTab>('personal');
  const [isTaskPublic, setIsTaskPublic] = useState(false);

  // Deletion state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemIdToDelete, setItemIdToDelete] = useState<string | null>(null);

  React.useEffect(() => {
    setIsTaskPublic(activeTab === 'public');
  }, [activeTab]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.trim()) return;
    onAddChecklistItem(task.trim(), isTaskPublic);
    setTask('');
  };

  const personalItems = checklist.filter(
    item => !item.isPublic && item.createdBy === currentUser?.name
  );
  const publicItems = checklist.filter(item => item.isPublic);
  const displayedItems = activeTab === 'personal' ? personalItems : publicItems;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 space-y-6 shadow-sm text-right" dir="rtl" id="checklist-panel">
      
      {/* Title & Description Header - Numbering REMOVED */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>چک‌لیست و پیگیری فرآیندهای مالی</span>
          </h2>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-1 leading-relaxed">
            مدیریت تسک‌های روزانه، رفع موازنه‌های بانکی و هماهنگی دفاتر (پشتیبانی از تفکیک حریم شخصی و کار تیمی مشترک).
          </p>
        </div>

        <span className="self-start md:self-auto px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/60 text-[10px] font-bold rounded-2xl flex items-center gap-1.5 shadow-sm">
          <Shield className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>کاربر فعال: {currentUser?.name || ''}</span>
        </span>
      </div>

      {/* Segmented Workspace Tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200/50 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('personal')}
          className={`py-3 text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'personal'
              ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm font-extrabold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-350 hover:bg-white/40'
          }`}
          type="button"
        >
          <Lock className="w-4 h-4" />
          <span>دفترچه شخصی من ({personalItems.length} کار)</span>
        </button>

        <button
          onClick={() => setActiveTab('public')}
          className={`py-3 text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'public'
              ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm font-extrabold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-350 hover:bg-white/40'
          }`}
          type="button"
        >
          <Users className="w-4 h-4" />
          <span>تخته عمومی گروهی ({publicItems.length} کار تیمی)</span>
        </button>
      </div>

      {/* Insertion Form */}
      <form onSubmit={handleSubmit} className="bg-slate-50/70 dark:bg-slate-955 p-5 border border-slate-150 dark:border-slate-850 rounded-2xl space-y-4 shadow-sm">
        <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">افزودن تسک یا یادداشت پیگیری جدید:</span>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder={
              activeTab === 'personal' 
                ? "مثال: ثبت مغایرت نهایی عابر بانک ملی، پرداخت تنخواه طبقه دوم..."
                : "مثال: مغایرت‌گیری تراز صورتحساب اکسل بانک قبل از اتمام ساعت اداری..."
            }
            className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:ring-1 focus:ring-indigo-500 text-right focus:outline-none transition-all"
            required
          />
          <button
            type="submit"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-500/10"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>ثبت تسک جدید</span>
          </button>
        </div>

        {/* Access Scope Indicator Checkbox */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <input
            type="checkbox"
            id="is-public-task"
            checked={isTaskPublic}
            onChange={(e) => setIsTaskPublic(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded cursor-pointer accent-indigo-600"
          />
          <label htmlFor="is-public-task" className="text-[11px] text-slate-600 dark:text-slate-400 font-bold cursor-pointer select-none">
            {isTaskPublic ? (
              <span className="text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> 
                <span>انتشار تیمی در بورد همگانی (همه کاربران می‌توانند این کار را ببینند و ویرایش کنند)</span>
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-450 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> 
                <span>ذخیره فقط در کارتابل خصوصی من (حفاظت شده و شخصی)</span>
              </span>
            )}
          </label>
        </div>
      </form>

      {/* Info Banner */}
      <div className="p-4 rounded-2xl border bg-slate-50 dark:bg-slate-950 border-slate-150 dark:border-slate-850 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
        {activeTab === 'personal' ? (
          <div className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p>
              <strong>کارتابل اختصاصی شخص شما:</strong> تسک‌ها و متون یادداشتی این بخش کاملا مجزا و امن بوده و به دلیل رعایت مسائل محرمانگی اداری، برای حسابداران دیگر یا فروشندگان غرفه به هیچ وجه قابل رویت یا تغییر نمی‌باشند.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2.5">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-500 shrink-0 mt-0.5" />
            <p>
              <strong>تخته همفکری تیمی مشترک:</strong> تسک‌های این بخش عمومی بوده و همه پرسنل اداری مجاز می‌توانند به صورت همزمان پیشرفت کار را رؤیت و علامت‌گذاری کنند.
            </p>
          </div>
        )}
      </div>

      {/* Task List (Gorgeous Sticky-Note Card Grid Style) */}
      {displayedItems.length === 0 ? (
        <div className="text-center p-12 border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/20 rounded-3xl space-y-2">
          <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
          <p className="text-slate-500 dark:text-slate-450 text-xs font-bold">هیچ تسکی در این بخش یافت نشد.</p>
          <p className="text-slate-400 dark:text-slate-550 text-[10px]">یادداشت‌های مالی خود را در کادر تفصیلی بالا درج فرمایید.</p>
        </div>
      ) : (
        <div className="space-y-3 flex flex-col">
          {displayedItems.map(item => (
            <div 
              key={item.id} 
              className={`relative p-4 rounded-xl border transition-all hover:shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 group ${
                item.isCompleted 
                  ? 'bg-slate-50/55 text-slate-400 dark:bg-slate-950/20 border-slate-150 dark:border-slate-850 shadow-inner' 
                  : activeTab === 'personal'
                    ? 'bg-amber-50/15 hover:bg-amber-50/25 dark:bg-amber-950/5 border-amber-100/50 dark:border-slate-800'
                    : 'bg-blue-50/15 hover:bg-blue-50/25 dark:bg-blue-950/5 border-blue-100/50 dark:border-slate-800'
              }`}
            >
              {/* Note Content / Checkbox & Title */}
              <div className="flex items-start gap-3 text-right flex-1">
                <button
                  type="button"
                  onClick={() => onToggleChecklist(item.id)}
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer mt-0.5 shrink-0 ${
                    item.isCompleted 
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/40' 
                      : 'bg-white dark:bg-slate-850 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-slate-750 hover:text-slate-505 hover:border-slate-400'
                  }`}
                  title={item.isCompleted ? "علامت باز به کار" : "اتمام کار"}
                >
                  {item.isCompleted ? <Check className="w-3.5 h-3.5 font-bold" /> : <Clock className="w-3.5 h-3.5" />}
                </button>

                <div className="space-y-1 flex-1">
                  <p className={`text-xs font-bold leading-relaxed ${item.isCompleted ? 'line-through text-slate-400 dark:text-slate-550 font-normal' : 'text-slate-800 dark:text-slate-200'}`}>
                    {item.task}
                  </p>

                  {/* Metadata inside the row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-slate-400 dark:text-slate-500 font-bold font-mono">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-350" />
                      {item.createdAt}
                    </span>
                    <span className="flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-indigo-450" />
                      <span>ثبت توسط: {item.createdBy}</span>
                    </span>
                    <span className={`px-1.5 py-0.2 text-[8px] font-bold rounded-full ${
                      item.isPublic 
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' 
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                    }`}>
                      {item.isPublic ? 'عمومی' : 'شخصی'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setItemIdToDelete(item.id);
                    setDeleteConfirmOpen(true);
                  }}
                  className="p-1.5 bg-white hover:bg-rose-50 dark:bg-slate-850 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-600 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer transition-colors"
                  title="حذف دائمی"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Custom Deletion Confirmation Popup */}
      {deleteConfirmOpen && itemIdToDelete && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl shadow-xl w-full max-w-sm p-6 text-right border border-slate-200 dark:border-slate-800 space-y-4 popup-box-global">
            <h4 className="font-bold text-slate-800 dark:text-white text-sm">تایید حذف تسک</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
              آیا مطمئن هستید که میخواهید این مورد را حذف کنید؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setItemIdToDelete(null);
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                type="button"
              >
                انصراف
              </button>
              <button
                onClick={() => {
                  if (itemIdToDelete) {
                    onDeleteChecklistItem(itemIdToDelete);
                  }
                  setDeleteConfirmOpen(false);
                  setItemIdToDelete(null);
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

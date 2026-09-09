import React, { useState } from 'react';
import { SystemNotification, User } from '../types';
import { Bell, Trash2, Check, X, Send, AlertCircle, Info, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface NotificationsManagerProps {
  currentUser: User;
  users: User[];
  notifications: SystemNotification[];
  onAddNotification: (title: string, message: string, type: 'info' | 'warning' | 'error' | 'success', targetUserId: string) => void;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (notificationId: string) => void;
  onClearAllNotifications: () => void;
  onClose: () => void;
}

export default function NotificationsManager({
  currentUser,
  users,
  notifications,
  onAddNotification,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onClearAllNotifications,
  onClose
}: NotificationsManagerProps) {
  const [activeTab, setActiveTab] = useState<'my_messages' | 'admin_send'>('my_messages');
  
  // Send form states
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'warning' | 'error' | 'success'>('info');
  const [targetUserId, setTargetUserId] = useState<string>('all');
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  // Filter notifications meant for the current user
  const myNotifications = notifications.filter(n => currentUser?.id ? n.userId === currentUser.id : true);
  const unreadCount = myNotifications.filter(n => !n.isRead).length;

  // Handle form submission to add new notifications
  const handleSendNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    onAddNotification(title.trim(), message.trim(), type, targetUserId);
    
    setTitle('');
    setMessage('');
    setType('info');
    setTargetUserId('all');
    setFormSuccess('پیام و هشدار با موفقیت برای پرسنل هدف ارسال و ثبت شد.');
    setTimeout(() => setFormSuccess(null), 4000);
  };

  return (
    <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 popup-overlay-global" dir="rtl">
      <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-3xl w-full space-y-5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] popup-box-global">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
              <Bell className="w-5 h-5 animate-swing" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">مرکز پیام‌ها، هشدارها و هشدارهای امنیتی</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">
                نمایش پیام‌های اختصاصی پرسنل و گزارش هشدارهای امنیتی
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-50/70 dark:bg-slate-950/30 border border-slate-150 dark:border-slate-800 p-1 rounded-xl flex gap-1 items-center shrink-0">
          <button
            onClick={() => setActiveTab('my_messages')}
            className={`flex-1 py-2 text-xs font-black transition-all rounded-lg cursor-pointer text-center ${
              activeTab === 'my_messages'
                ? 'bg-indigo-600 text-white shadow-sm font-extrabold'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            پیام‌های من ({myNotifications.length})
            {unreadCount > 0 && (
              <span className="mr-1.5 bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-sans animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin_send')}
              className={`flex-1 py-2 text-xs font-black transition-all rounded-lg cursor-pointer text-center ${
                activeTab === 'admin_send'
                  ? 'bg-indigo-600 text-white shadow-sm font-extrabold'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              مدیریت و ارسال پیام به پرسنل ✨
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-4 min-h-0 pr-1">
          {activeTab === 'my_messages' ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
                  صندوق پیام‌های اختصاصی شما
                </span>
                {myNotifications.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={onMarkAllAsRead}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 font-black hover:underline cursor-pointer"
                    >
                      خواندن همه پیام‌ها
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={onClearAllNotifications}
                      className="text-[10px] text-rose-600 dark:text-rose-400 font-black hover:underline cursor-pointer"
                    >
                      حذف تاریخچه صندوق
                    </button>
                  </div>
                )}
              </div>

              {myNotifications.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-950/20">
                  <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">صندوق پیام‌های شما در حال حاضر خالی است.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {myNotifications.map((notification) => {
                    const typeColors = {
                      info: 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/10 text-indigo-700 dark:text-indigo-400',
                      warning: 'border-amber-500 bg-amber-50/30 dark:bg-amber-950/10 text-amber-700 dark:text-amber-400',
                      error: 'border-rose-500 bg-rose-50/30 dark:bg-rose-950/10 text-rose-700 dark:text-rose-400',
                      success: 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400'
                    }[notification.type];

                    const typeIcons = {
                      info: <Info className="w-4 h-4 text-indigo-500" />,
                      warning: <AlertCircle className="w-4 h-4 text-amber-500 animate-pulse" />,
                      error: <ShieldAlert className="w-4 h-4 text-rose-500" />,
                      success: <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    }[notification.type];

                    return (
                      <div
                        key={notification.id}
                        className={`p-4 rounded-2xl border-l-4 border ${typeColors} flex gap-3 transition-all ${
                          !notification.isRead ? 'ring-1 ring-indigo-500/20 font-medium' : 'opacity-80'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">{typeIcons}</div>
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between items-start">
                            <h4 className="text-xs font-black">{notification.title}</h4>
                            <span className="text-[9px] font-mono text-slate-450 shrink-0">
                              {notification.timestamp}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed font-bold break-words">
                            {notification.message}
                          </p>
                          <div className="flex justify-between items-center pt-1">
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold">
                              ارسال‌کننده: {notification.senderName || 'سیستم'}
                            </span>
                            <div className="flex gap-2">
                              {!notification.isRead && (
                                <button
                                  onClick={() => onMarkAsRead(notification.id)}
                                  className="p-1 hover:bg-white dark:hover:bg-slate-850 text-emerald-600 dark:text-emerald-400 rounded-lg cursor-pointer transition-all"
                                  title="علامت‌گذاری به عنوان خوانده شده"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => onDeleteNotification(notification.id)}
                                className="p-1 hover:bg-white dark:hover:bg-slate-850 text-rose-600 dark:text-rose-400 rounded-lg cursor-pointer transition-all"
                                title="حذف پیام"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Admin Send Section */
            <div className="space-y-5">
              <form onSubmit={handleSendNotification} className="bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl space-y-4">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
                  ارسال اخطار، پیام و بیانیه برای پرسنل زیرمجموعه
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Select Target User */}
                  <div className="space-y-1 text-right">
                    <label className="text-[10px] text-slate-500 font-bold">گیرنده پیام (پرسنل هدف):</label>
                    <select
                      value={targetUserId}
                      onChange={(e) => setTargetUserId(e.target.value)}
                      className="w-full p-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-250 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="all">همه پرسنل (همگانی) 👥</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role === 'admin' ? 'مدیر' : u.role === 'accountant' ? 'حسابدار' : 'فروشنده'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Select Alert Level */}
                  <div className="space-y-1 text-right">
                    <label className="text-[10px] text-slate-500 font-bold">نوع و سطح اهمیت پیام:</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                      className="w-full p-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-250 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="info">اطلاعاتی (آبی) ℹ️</option>
                      <option value="success">موفقیت‌آمیز (سبز) ✅</option>
                      <option value="warning">اخطار و هشدار (زرد) ⚠️</option>
                      <option value="error">امنیتی و خطا (قرمز) 🚨</option>
                    </select>
                  </div>
                </div>

                {/* Notification Title */}
                <div className="space-y-1 text-right">
                  <label className="text-[10px] text-slate-500 font-bold">موضوع پیام / عنوان اخطار:</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: لزوم بروزرسانی موجودی انبارگردانی"
                    className="w-full p-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-250 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>

                {/* Notification Message */}
                <div className="space-y-1 text-right">
                  <label className="text-[10px] text-slate-500 font-bold">متن پیام یا دستورالعمل:</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="متن کامل پیام خود را در اینجا تایپ کنید..."
                    rows={3}
                    className="w-full p-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-250 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>

                {formSuccess && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 rounded-xl text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{formSuccess}</span>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-md shadow-indigo-500/10"
                  >
                    <Send className="w-4 h-4 text-white" />
                    <span>ثبت و ارسال پیام رسمی</span>
                  </button>
                </div>
              </form>

              {/* All system notifications log */}
              <div className="space-y-2.5">
                <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 block text-right">
                  تاریخچه کل اخطارها و مکاتبات صادره در سیستم ({notifications.length} پیام)
                </span>
                
                {notifications.length === 0 ? (
                  <div className="text-center py-6 border border-slate-100 dark:border-slate-850 rounded-2xl text-[10px] text-slate-400">
                    هیچ پیام یا اخطاری در تاریخچه سیستم ثبت نشده است.
                  </div>
                ) : (
                  <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.map((n) => {
                      const targetUser = users.find(u => u.id === n.userId);
                      return (
                        <div key={n.id} className="p-3.5 bg-slate-50/40 dark:bg-slate-900/40 flex items-start justify-between gap-4">
                          <div className="space-y-1 text-right">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${
                                n.type === 'error' ? 'bg-rose-500' : n.type === 'warning' ? 'bg-amber-500' : n.type === 'success' ? 'bg-emerald-500' : 'bg-indigo-500'
                              }`} />
                              <h5 className="text-xs font-black text-slate-800 dark:text-slate-200">{n.title}</h5>
                              <span className="text-[9px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded font-sans">
                                گیرنده: {targetUser ? `${targetUser.name} (${targetUser.username})` : 'نامشخص'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold leading-relaxed">{n.message}</p>
                            <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 block">
                              زمان ارسال: {n.timestamp} | وضعیت: {n.isRead ? 'خوانده شده' : 'خوانده نشده 📬'}
                            </span>
                          </div>
                          
                          <button
                            onClick={() => onDeleteNotification(n.id)}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer transition-all"
                            title="حذف پیام از سیستم"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-150 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 text-xs font-black rounded-xl cursor-pointer transition-all"
          >
            بستن مرکز پیام‌ها
          </button>
        </div>

      </div>
    </div>
  );
}

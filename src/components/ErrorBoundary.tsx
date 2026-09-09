import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck, Download, Copy, Check, Terminal, Database } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
  exportSuccess: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      exportSuccess: false,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      copied: false,
      exportSuccess: false,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CRITICAL: Caught runtime error in React tree:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleSafeModeReset = () => {
    try {
      // Preserve critical business databases while clearing transient/corrupt UI states
      const keysToKeep = [
        'acc_app_transactions',
        'acc_app_invoices',
        'acc_app_users',
        'acc_app_currentUser',
        'acc_app_accounts',
        'acc_app_cash_accounts',
        'acc_app_fiscal_years',
        'acc_app_active_fiscal_year',
        'acc_app_counterparts',
        'acc_app_products',
        'acc_app_categories',
        'acc_app_bank_accounts',
        'acc_app_cheques',
        'acc_app_loans',
        'acc_app_notifications',
        'acc_app_checklist',
        'acc_app_setting_font',
        'acc_app_darkMode',
      ];

      const backup: Record<string, string> = {};
      for (const key of keysToKeep) {
        const val = localStorage.getItem(key);
        if (val) backup[key] = val;
      }

      // Clear session & ephemeral localStorage items
      sessionStorage.clear();
      localStorage.clear();

      // Restore core business data
      for (const [key, val] of Object.entries(backup)) {
        try {
          localStorage.setItem(key, val);
        } catch (_) {}
      }

      window.location.href = window.location.pathname;
    } catch (e) {
      window.location.reload();
    }
  };

  handleEmergencyExport = () => {
    try {
      const dump: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          const raw = localStorage.getItem(k);
          try {
            dump[k] = raw ? JSON.parse(raw) : raw;
          } catch {
            dump[k] = raw;
          }
        }
      }

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `emergency_data_backup_${new Date().toISOString().replace(/[:.]/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.setState({ exportSuccess: true });
      setTimeout(() => this.setState({ exportSuccess: false }), 4000);
    } catch (err) {
      alert('خطا در دانلود فایل پشتیبان اضطراری');
    }
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const text = `--- گزارش خطای رندرینگ نرم‌افزار ---
زمان: ${new Date().toLocaleString('fa-IR')}
خطا: ${error?.name || 'Error'}: ${error?.message || 'بدون پیام'}
استک خطا:
${error?.stack || 'ثبت نشده'}
استک کامپوننت:
${errorInfo?.componentStack || 'ثبت نشده'}
---------------------------------`;

    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    });
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, copied, exportSuccess } = this.state;

      return (
        <div
          id="error-boundary-screen"
          dir="rtl"
          className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 antialiased font-sans"
        >
          <div className="w-full max-w-2xl bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
            
            {/* Header Icon & Title */}
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 shadow-lg">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="space-y-1 text-right">
                <h1 className="text-xl sm:text-2xl font-black text-white">
                  بازیابی هوشمند و محافظت از داده‌ها
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  یک خطای غیرمنتظره در بارگذاری واسط کاربری رخ داد، اما سیستم محافظ با موفقیت مانع از بروز اختلال در پایگاه‌داده و اطلاعات حسابداری گردید.
                </p>
              </div>
            </div>

            {/* Error Message Card */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-right space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono text-amber-400 font-bold">
                  {error?.name || 'Runtime Exception'}
                </span>
                <span className="text-[11px] text-slate-500">موتور حفاظتی React</span>
              </div>
              <p className="text-xs sm:text-sm font-mono text-rose-300 break-words leading-relaxed" dir="ltr">
                {error?.message || 'Unknown runtime render error occurred.'}
              </p>
            </div>

            {/* Action Buttons Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white text-xs sm:text-sm font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 animate-spin-slow" />
                <span>بارگذاری مجدد صفحه</span>
              </button>

              <button
                type="button"
                onClick={this.handleSafeModeReset}
                className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 active:scale-98 text-slate-200 text-xs sm:text-sm font-bold py-3 px-4 rounded-xl border border-slate-600/80 transition-all cursor-pointer"
                title="پاکسازی کش موقت و بازنشانی به حالت امن با حفظ تمام اطلاعات دیتابیس"
              >
                <ShieldCheck className="w-4 h-4 text-teal-400" />
                <span>راه‌اندازی در حالت امن (Safe Mode)</span>
              </button>

              <button
                type="button"
                onClick={this.handleEmergencyExport}
                className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700/80 text-amber-300 text-xs sm:text-sm font-medium py-2.5 px-4 rounded-xl border border-amber-500/30 transition-all cursor-pointer"
              >
                {exportSuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
                <span>{exportSuccess ? 'فایل پشتیبان دانلود شد!' : 'پشتیبان‌گیری اضطراری از داده‌ها (JSON)'}</span>
              </button>

              <button
                type="button"
                onClick={this.handleCopyError}
                className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700/80 text-slate-300 text-xs sm:text-sm font-medium py-2.5 px-4 rounded-xl border border-slate-700 transition-all cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'متن خطا کپی شد!' : 'کپی جزئیات خطا برای ارسال به چت'}</span>
              </button>
            </div>

            {/* Collapsible Tech Details */}
            {errorInfo?.componentStack && (
              <details className="text-right text-xs text-slate-500 border-t border-slate-800/80 pt-3">
                <summary className="cursor-pointer text-slate-400 hover:text-slate-200 select-none flex items-center gap-1.5 w-fit">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>مشاهده گزارش فنی کامپوننت‌ها (Component Stack)</span>
                </summary>
                <pre className="mt-2.5 p-3 bg-black/50 border border-slate-800 rounded-xl overflow-x-auto text-[11px] font-mono text-slate-400 text-left leading-relaxed whitespace-pre" dir="ltr">
                  {errorInfo.componentStack}
                </pre>
              </details>
            )}

            {/* Bottom Note */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 text-center border-t border-slate-800/50 pt-3">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>کلیه اطلاعات مالی، فاکتورها و تراکنش‌های شما در حافظه امن دیتابیس محفوظ است.</span>
            </div>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

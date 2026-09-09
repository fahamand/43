import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Invoice, InvoiceItem, WarehouseItem, Counterpart, User, BankTransaction, PendingDeposit, FiscalYear } from '../types';
import { formatCurrency, toPersianDigits, formatNumber, getTodayJalali, getYesterdayJalali, getOneMonthAgoJalali, clampToTodayIfFuture, saveGenericKeyToDb } from '../utils/stateManager';
import { toEnglishDigits, parsePersianAmount } from '../utils/numberUtils';
import { getStoredCustomIcons, getStoredShippingMethods, getStoredAcquaintanceMethods, getStoredSellerName, getStoredSellerRegNo, getStoredSellerAddress, getStoredSellerPhone, getStoredInvoicePaperSize, setStoredInvoicePaperSize, getStoredWarehouseCategoriesList } from '../utils/defaultData';
import { 
  Plus, Trash2, Printer, Share2, CheckSquare, Save, Eye, X, Palette,
  HelpCircle, ShoppingCart, UserCheck, Phone, MapPin, Tag, Check, Award, Edit3, AlertTriangle, AlertCircle, History,
  TrendingUp, TrendingDown, Filter, Calendar, FileText, ClipboardList, CheckCircle2, Download, Image, UploadCloud, ArrowUpDown, Layers, Sparkles, Lock, ChevronDown, Percent, Banknote, RotateCcw,
  Search, Package, User as UserIcon, ArrowDown, ZoomIn, FolderTree, Database, RefreshCw, ArrowLeftRight
} from 'lucide-react';
import { JalaliDatePicker } from './JalaliDatePicker';
import { PaginationControls } from './PaginationControls';
import { motion, AnimatePresence } from 'motion/react';
import { validateFiscalDate, getNextInvoiceNumber, ensureUniqueInvoiceNumber, isFiscalPeriodLocked } from '../services';

interface InvoiceManagerProps {
  invoices: Invoice[];
  items: WarehouseItem[];
  counterparts: Counterpart[];
  currentUser: User;
  users?: User[];
  fiscalYear?: FiscalYear;
  onAddInvoice: (inv: Invoice) => Promise<boolean | void> | boolean | void;
  onDeleteInvoice: (id: string) => Promise<boolean | void> | boolean | void | void;
  onPermanentDeleteInvoice?: (id: string) => Promise<boolean | void> | boolean | void | void;
  onBatchDeleteInvoices?: (ids: string[]) => Promise<boolean | void> | boolean | void | void;
  onBatchPermanentDeleteInvoices?: (ids: string[]) => Promise<boolean | void> | boolean | void | void;
  onAddCounterpart?: (cp: Counterpart) => void;
  onUpdateCounterpart?: (cp: Counterpart) => void;
  onUpdateInvoice?: (oldInv: Invoice, updatedInv: Invoice) => Promise<boolean | void> | boolean | void;
  onAddItem?: (it: WarehouseItem) => void;
  onAddTransaction?: (newTx: BankTransaction, accountId: string) => void;
  initialShowForm?: boolean;
  newInvoiceTrigger?: number;
  pendingDeposits?: PendingDeposit[];
  onUpdatePendingDeposits?: (pds: PendingDeposit[]) => void;
  isProformaTabEnabled?: boolean;
}

// Check if item color is valid (and not "-" or empty)
export function hasValidColor(color?: string | null): boolean {
  if (!color) return false;
  const trimmed = color.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '' || trimmed === 'NONE' || trimmed === 'none' || trimmed === 'ندارد') {
    return false;
  }
  return true;
}

// Automatically append " / [color]" to item name if a valid color exists
export function formatItemNameWithColor(name: string, color?: string | null): string {
  const cleanName = name.trim();
  if (!hasValidColor(color)) {
    return cleanName;
  }
  const cleanColor = color!.trim();
  if (cleanName.toLowerCase().includes(` / ${cleanColor.toLowerCase()}`) || cleanName.toLowerCase().endsWith(`/${cleanColor.toLowerCase()}`)) {
    return cleanName;
  }
  return `${cleanName} / ${cleanColor}`;
}

// Convert numbers to Persian text words
export function numberToPersianWords(num: number): string {
  if (num === 0) return 'صفر';
  if (num < 0) return 'منفی ' + numberToPersianWords(Math.abs(num));
  
  const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const dah_to_biast = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
  const dahgan = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const sadganCorrected = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
  const steps = ['', 'هزار', 'میلیون', 'میلیارد', 'همت'];

  const getThreeDigits = (n: number): string => {
    let result = '';
    const s = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const y = n % 10;

    if (s > 0) {
      result += sadganCorrected[s];
    }

    if (d > 0) {
      if (result !== '') result += '  ';
      if (d === 1) {
        result += dah_to_biast[y];
        return result;
      } else {
        result += dahgan[d];
      }
    }

    if (y > 0) {
      if (result !== '') result += '  ';
      result += yekan[y];
    }

    return result;
  };

  let temp = num;
  let wordResult = '';
  let stepIdx = 0;

  while (temp > 0) {
    const chunk = temp % 1000;
    if (chunk > 0) {
      const chunkStr = getThreeDigits(chunk);
      const stepName = steps[stepIdx];
      const joined = chunkStr + (stepName !== '' ? ' ' + stepName : '');
      if (wordResult !== '') {
        wordResult = joined + '  ' + wordResult;
      } else {
        wordResult = joined;
      }
    }
    temp = Math.floor(temp / 1000);
    stepIdx++;
  }

  return wordResult;
}

// Compare two Jalali dates safely ignoring padding and Persian/English digits
export function compareJalaliDates(dateA: string, dateB: string): boolean {
  if (!dateA || !dateB) return false;
  const toEng = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const partsA = toEng(dateA).split('/').map(p => parseInt(p, 10));
  const partsB = toEng(dateB).split('/').map(p => parseInt(p, 10));
  if (partsA.length !== 3 || partsB.length !== 3) return false;
  return partsA[0] === partsB[0] && partsA[1] === partsB[1] && partsA[2] === partsB[2];
}

export interface InvoiceTheme {
  id: string;
  name: string;
  dotClass: string;
  cardBg: string;
  cardBorder: string;
  headerBtnBg: string;
  badgeBg: string;
  tableHeaderBg: string;
  accentRing: string;
}

export const INVOICE_THEMES: InvoiceTheme[] = [
  {
    id: 'default',
    name: 'تم پیش‌فرض سیستم (رسمی)',
    dotClass: 'bg-white border-2 border-slate-300 dark:border-slate-500 shadow-xs',
    cardBg: 'bg-white dark:bg-slate-900',
    cardBorder: 'border-blue-500 dark:border-blue-600 shadow-blue-500/10',
    headerBtnBg: 'bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/50',
    tableHeaderBg: 'bg-slate-900 dark:bg-slate-950 text-white',
    accentRing: 'ring-2 ring-blue-500/50'
  },
  {
    id: 'blue',
    name: 'تم آبی دریا',
    dotClass: 'bg-blue-500 border border-blue-600',
    cardBg: 'bg-blue-50/90 dark:bg-slate-900',
    cardBorder: 'border-blue-500 dark:border-blue-500 shadow-blue-500/15',
    headerBtnBg: 'bg-gradient-to-tr from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700',
    badgeBg: 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    tableHeaderBg: 'bg-blue-900 dark:bg-slate-950 text-white',
    accentRing: 'ring-2 ring-blue-500'
  },
  {
    id: 'emerald',
    name: 'تم سبز زمرد',
    dotClass: 'bg-emerald-500 border border-emerald-600',
    cardBg: 'bg-emerald-50/90 dark:bg-slate-900',
    cardBorder: 'border-emerald-500 dark:border-emerald-500 shadow-emerald-500/15',
    headerBtnBg: 'bg-gradient-to-tr from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    tableHeaderBg: 'bg-emerald-900 dark:bg-slate-950 text-white',
    accentRing: 'ring-2 ring-emerald-500'
  },
  {
    id: 'purple',
    name: 'تم بنفش رویال',
    dotClass: 'bg-purple-500 border border-purple-600',
    cardBg: 'bg-purple-50/90 dark:bg-slate-900',
    cardBorder: 'border-purple-500 dark:border-purple-500 shadow-purple-500/15',
    headerBtnBg: 'bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700',
    badgeBg: 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800',
    tableHeaderBg: 'bg-purple-900 dark:bg-slate-950 text-white',
    accentRing: 'ring-2 ring-purple-500'
  },
  {
    id: 'amber',
    name: 'تم کهربایی طلایی',
    dotClass: 'bg-amber-500 border border-amber-600',
    cardBg: 'bg-amber-50/90 dark:bg-slate-900',
    cardBorder: 'border-amber-500 dark:border-amber-500 shadow-amber-500/15',
    headerBtnBg: 'bg-gradient-to-tr from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700',
    badgeBg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    tableHeaderBg: 'bg-amber-900 dark:bg-slate-950 text-white',
    accentRing: 'ring-2 ring-amber-500'
  },
  {
    id: 'rose',
    name: 'تم سرخ یاقوتی',
    dotClass: 'bg-rose-500 border border-rose-600',
    cardBg: 'bg-rose-50/90 dark:bg-slate-900',
    cardBorder: 'border-rose-500 dark:border-rose-500 shadow-rose-500/15',
    headerBtnBg: 'bg-gradient-to-tr from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700',
    badgeBg: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
    tableHeaderBg: 'bg-rose-900 dark:bg-slate-950 text-white',
    accentRing: 'ring-2 ring-rose-500'
  },
  {
    id: 'cyan',
    name: 'تم فیروزه‌ای روشن',
    dotClass: 'bg-cyan-500 border border-cyan-600',
    cardBg: 'bg-cyan-50/90 dark:bg-slate-900',
    cardBorder: 'border-cyan-500 dark:border-cyan-500 shadow-cyan-500/15',
    headerBtnBg: 'bg-gradient-to-tr from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700',
    badgeBg: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800',
    tableHeaderBg: 'bg-cyan-900 dark:bg-slate-950 text-white',
    accentRing: 'ring-2 ring-cyan-500'
  },
  {
    id: 'indigo',
    name: 'تم خاکستری کلاسیک',
    dotClass: 'bg-indigo-500 border border-indigo-600',
    cardBg: 'bg-indigo-50/90 dark:bg-slate-900',
    cardBorder: 'border-indigo-500 dark:border-indigo-500 shadow-indigo-500/15',
    headerBtnBg: 'bg-gradient-to-tr from-indigo-600 to-blue-700 hover:from-indigo-700 hover:to-blue-800',
    badgeBg: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
    tableHeaderBg: 'bg-indigo-900 dark:bg-slate-950 text-white',
    accentRing: 'ring-2 ring-indigo-500'
  },
  {
    id: 'pink',
    name: 'تم گرافیت مدرن',
    dotClass: 'bg-pink-500 border border-pink-600',
    cardBg: 'bg-pink-50/90 dark:bg-slate-900',
    cardBorder: 'border-pink-400 dark:border-pink-500 shadow-pink-500/15',
    headerBtnBg: 'bg-gradient-to-tr from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700',
    badgeBg: 'bg-pink-100 dark:bg-pink-950/60 text-pink-800 dark:text-pink-300 border-pink-300 dark:border-pink-800',
    tableHeaderBg: 'bg-pink-900 dark:bg-slate-950 text-white',
    accentRing: 'ring-2 ring-pink-500'
  },
  {
    id: 'slate',
    name: 'تم نیلی مدرن',
    dotClass: 'bg-slate-600 border border-slate-700',
    cardBg: 'bg-slate-100/90 dark:bg-slate-900',
    cardBorder: 'border-slate-500 dark:border-slate-500 shadow-slate-500/15',
    headerBtnBg: 'bg-gradient-to-tr from-slate-700 to-slate-900 hover:from-slate-800 hover:to-slate-950',
    badgeBg: 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
    tableHeaderBg: 'bg-slate-800 dark:bg-slate-950 text-white',
    accentRing: 'ring-2 ring-slate-500'
  },
  {
    id: 'lime',
    name: 'تم سبز سدری',
    dotClass: 'bg-lime-500 border border-lime-600',
    cardBg: 'bg-lime-50/90 dark:bg-slate-900',
    cardBorder: 'border-lime-500 dark:border-lime-500 shadow-lime-500/15',
    headerBtnBg: 'bg-gradient-to-tr from-lime-600 to-emerald-600 hover:from-lime-700 hover:to-emerald-700',
    badgeBg: 'bg-lime-100 dark:bg-lime-950/60 text-lime-900 dark:text-lime-300 border-lime-300 dark:border-lime-800',
    tableHeaderBg: 'bg-lime-900 dark:bg-slate-950 text-white',
    accentRing: 'ring-2 ring-lime-500'
  }
];

export default function InvoiceManager({
  invoices,
  items,
  counterparts,
  currentUser,
  users = [],
  fiscalYear,
  onAddInvoice,
  onDeleteInvoice,
  onPermanentDeleteInvoice,
  onBatchDeleteInvoices,
  onBatchPermanentDeleteInvoices,
  onAddCounterpart,
  onUpdateCounterpart,
  onUpdateInvoice,
  onAddItem,
  onAddTransaction,
  initialShowForm,
  newInvoiceTrigger,
  pendingDeposits = [],
  onUpdatePendingDeposits,
  isProformaTabEnabled = true
}: InvoiceManagerProps) {
  const currencyLabel = localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال';
  const printSellerName = getStoredSellerName();
  const printSellerRegNo = getStoredSellerRegNo();
  const printSellerAddress = getStoredSellerAddress();
  const printSellerPhone = getStoredSellerPhone();

  const [showForm, setShowForm] = useState(initialShowForm || false);

  // New Invoice Form Theme Preference States (Independent of global system theme)
  const [invoiceThemeMode, setInvoiceThemeMode] = useState<string>(() => {
    try {
      return localStorage.getItem('invoice_theme_preference') || '0';
    } catch (_) {
      return '0';
    }
  });

  const [activeInvoiceThemeIndex, setActiveInvoiceThemeIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('invoice_theme_preference') || '0';
      if (saved === 'random') {
        return Math.floor(Math.random() * 11);
      }
      const parsed = parseInt(saved, 10);
      return isNaN(parsed) || parsed < 0 || parsed > 10 ? 0 : parsed;
    } catch (_) {
      return 0;
    }
  });

  const [isPaletteExpanded, setIsPaletteExpanded] = useState<boolean>(false);
  const [tagModalRowIdx, setTagModalRowIdx] = useState<number | null>(null);
  const [selectedModalTagNames, setSelectedModalTagNames] = useState<string[]>([]);

  const selectSpecificTheme = (index: number) => {
    setInvoiceThemeMode(index.toString());
    setActiveInvoiceThemeIndex(index);
    setIsPaletteExpanded(false);
    try {
      localStorage.setItem('invoice_theme_preference', index.toString());
    } catch (_) {}
  };

  const selectRandomThemeMode = () => {
    setInvoiceThemeMode('random');
    const randIdx = Math.floor(Math.random() * 11);
    setActiveInvoiceThemeIndex(randIdx);
    setIsPaletteExpanded(false);
    try {
      localStorage.setItem('invoice_theme_preference', 'random');
    } catch (_) {}
  };

  const currentInvoiceTheme = INVOICE_THEMES[activeInvoiceThemeIndex] || INVOICE_THEMES[0];

  const renderThemeColorPalette = () => {
    if (!isPaletteExpanded) {
      // Collapsed mode: only show the single active theme dot
      const isRandom = invoiceThemeMode === 'random';
      return (
        <div className="flex items-center gap-1 mr-1.5 shrink-0" dir="rtl">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsPaletteExpanded(true);
            }}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100/90 dark:bg-slate-950/80 hover:bg-slate-200/90 dark:hover:bg-slate-900 rounded-full border border-slate-250 dark:border-slate-800 shadow-2xs transition-all cursor-pointer group"
            title="تغییر تم و رنگ فاکتور (تم‌های رسمی و مدرن)"
          >
            {isRandom ? (
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-gradient-to-tr from-rose-500 via-amber-400 via-emerald-400 via-cyan-400 via-indigo-500 to-pink-500 border border-white dark:border-slate-800 shrink-0 group-hover:scale-110 transition-transform" />
            ) : (
              <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 group-hover:scale-110 transition-transform ${currentInvoiceTheme.dotClass}`} />
            )}
            <Palette className="w-3 h-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors" />
          </button>
        </div>
      );
    }

    // Expanded mode: show all 11 color dots + 1 rainbow dot
    return (
      <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 bg-slate-100/95 dark:bg-slate-950/90 rounded-full border border-slate-250 dark:border-slate-800 shadow-xs mr-1.5 shrink-0 animate-scale-up animate-duration-150" dir="rtl" title="انتخاب تم اختصاصی فاکتور هوشمند">
        {INVOICE_THEMES.map((theme, index) => {
          const isSelected = invoiceThemeMode !== 'random' && activeInvoiceThemeIndex === index;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectSpecificTheme(index);
              }}
              className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-all cursor-pointer hover:scale-125 ${theme.dotClass} ${
                isSelected ? 'scale-125 ring-2 ring-offset-1 ring-blue-600 dark:ring-blue-400 z-10 shadow-xs' : 'opacity-80 hover:opacity-100'
              }`}
              title={`${theme.name}${isSelected ? ' (تم فعال)' : ''}`}
            />
          );
        })}

        {/* 12th Circle: Rainbow / Multi-colored for Random mode */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            selectRandomThemeMode();
          }}
          className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-tr from-rose-500 via-amber-400 via-emerald-400 via-cyan-400 via-indigo-500 to-pink-500 transition-all cursor-pointer hover:scale-125 shadow-2xs border border-white dark:border-slate-800 ${
            invoiceThemeMode === 'random'
              ? 'scale-125 ring-2 ring-offset-1 ring-purple-600 dark:ring-purple-400 z-10'
              : 'opacity-80 hover:opacity-100'
          }`}
          title="تنظیمات فونت و اندازه متن فاکتور"
        />

        {/* Close icon to collapse back */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsPaletteExpanded(false);
          }}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mr-0.5 cursor-pointer"
          title="بستن پنجره"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  };

  // Proforma Tabs Management States
  const [openProformaIds, setOpenProformaIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('fahamacc_open_proforma_ids');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    // Pre-populate with all current proformas if no stored list exists
    return invoices.filter(inv => !inv.isDeleted && inv.isProforma).map(inv => inv.id);
  });

  const [proformaDateFilter, setProformaDateFilter] = useState<'today' | 'yesterday' | 'all'>('all');
  const [proformaSearchQuery, setProformaSearchQuery] = useState<string>('');
  const [onlyMyProformas, setOnlyMyProformas] = useState<boolean>(() => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    const saved = localStorage.getItem(`fahamacc_proforma_only_mine_${uId}`);
    return saved === 'true';
  });
  const [selectedProformaId, setSelectedProformaId] = useState<string | null>(null);

  // Sync onlyMyProformas filter preference per user
  useEffect(() => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    localStorage.setItem(`fahamacc_proforma_only_mine_${uId}`, String(onlyMyProformas));
  }, [onlyMyProformas, currentUser?.id, currentUser?.username]);

  // Sync openProformaIds to localStorage
  useEffect(() => {
    localStorage.setItem('fahamacc_open_proforma_ids', JSON.stringify(openProformaIds));
  }, [openProformaIds]);

  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const isSavingInvoiceRef = React.useRef(false);
  const isConvertingProformaRef = React.useRef<Record<string, boolean>>({});

  // Database Save Error Modal with Retry State
  const [dbErrorModal, setDbErrorModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    docNumber?: string;
    docType?: string;
    counterpart?: string;
    totalAmount?: number;
    retryAction?: () => Promise<void>;
  } | null>(null);
  const [isRetryingDbSave, setIsRetryingDbSave] = useState<boolean>(false);

  // Archive Highlight & Success Toast States
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<{ message: string; docNumber?: string; type?: 'sale' | 'purchase' | 'proforma' } | null>(null);

  const handleConvertProformaToDefinitive = async (inv: Invoice) => {
    if (!onUpdateInvoice) return;
    if (isConvertingProformaRef.current[inv.id]) {
      console.warn(`Conversion already in progress for invoice ${inv.id}`);
      return;
    }
    isConvertingProformaRef.current[inv.id] = true;
    
    try {
      // Calculate new invoice number for definitive invoice
      let baseSeq = 1000 + invoices.filter(i => !i.isDeleted && !i.isProforma).length + 1;
      while (invoices.some(i => i.invoiceNumber === String(baseSeq))) {
        baseSeq++;
      }
      const nextInvNum = String(baseSeq);

      const updatedInvoice: Invoice = {
        ...inv,
        isProforma: false,
        invoiceNumber: nextInvNum,
        updatedAt: Date.now(),
        history: undefined // Completely clear the history and do not record the conversion itself
      };

      let saveRes: boolean | void = true;
      try {
        saveRes = await onUpdateInvoice(inv, updatedInvoice);
      } catch (err: any) {
        console.error("Error converting proforma to definitive:", err);
        saveRes = false;
      }

      if (saveRes === false) {
        setDbErrorModal({
          isOpen: true,
          title: 'خطا در ثبت فاکتور رسمی در پایگاه داده',
          message: 'پیش‌فاکتور یا فاکتور رسمی با این شماره در پایگاه داده موجود است. لطفاً شماره دیگری انتخاب است.',
          docNumber: nextInvNum,
          docType: 'پیش‌فاکتور و فاکتور رسمی',
          counterpart: inv.counterpartName,
          totalAmount: inv.totalAmount,
          retryAction: async () => {
            await handleConvertProformaToDefinitive(inv);
          }
        });
        return;
      }
      
      // Remove from open proforma tabs
      setOpenProformaIds(prev => prev.filter(id => id !== inv.id));
      if (selectedProformaId === inv.id) {
        setSelectedProformaId(null);
      }

      // Highlight in Archive and adjust tab
      setHighlightedInvoiceId(updatedInvoice.id);
      setArchiveTab('all');
      setArchivePage(1);
      setSuccessToast({
        message: `پیش‌فاکتور و فاکتور رسمی شماره ${toPersianDigits(nextInvNum)} در پایگاه داده ثبت گردید.`,
        docNumber: nextInvNum,
        type: 'sale'
      });
      setTimeout(() => {
        const el = document.getElementById(`archive-invoice-${updatedInvoice.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 250);
      setTimeout(() => {
        setHighlightedInvoiceId(prev => prev === updatedInvoice.id ? null : prev);
      }, 6000);
      setTimeout(() => {
        setSuccessToast(null);
      }, 4500);
    } finally {
      setTimeout(() => {
        delete isConvertingProformaRef.current[inv.id];
      }, 500);
    }
  };

  const [activeType, setActiveType] = useState<'sale' | 'purchase'>('sale');
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  // Refs for modal containers to calculate drag resizing
  const printModalRef = React.useRef<HTMLDivElement>(null);
  const livePreviewModalRef = React.useRef<HTMLDivElement>(null);

  // Helper to get active user ID for personnel-scoped preview settings
  const getCurrentUserId = () => currentUser?.id || currentUser?.username || 'default';

  // Personnel-Scoped Invoice Preview Content Scale State (inner zoom %)
  const [previewContentScale, setPreviewContentScale] = useState<number>(() => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    const saved = localStorage.getItem(`acc_preview_content_scale_${uId}`);
    return saved ? Math.max(30, Math.min(300, parseInt(saved, 10))) : 100;
  });

  // Personnel-Scoped Preview Modal Resize State
  const [modalDimensions, setModalDimensions] = useState<{ width: number | null; height: number | null }>(() => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    const savedW = localStorage.getItem(`acc_preview_modal_width_${uId}`);
    const savedH = localStorage.getItem(`acc_preview_modal_height_${uId}`);
    return {
      width: savedW ? parseInt(savedW, 10) : null,
      height: savedH ? parseInt(savedH, 10) : null,
    };
  });

  useEffect(() => {
    const uId = getCurrentUserId();
    const savedW = localStorage.getItem(`acc_preview_modal_width_${uId}`);
    const savedH = localStorage.getItem(`acc_preview_modal_height_${uId}`);
    setModalDimensions({
      width: savedW ? parseInt(savedW, 10) : null,
      height: savedH ? parseInt(savedH, 10) : null,
    });
    const savedScale = localStorage.getItem(`acc_preview_content_scale_${uId}`);
    setPreviewContentScale(savedScale ? Math.max(30, Math.min(300, parseInt(savedScale, 10))) : 100);
  }, [currentUser?.id, currentUser?.username]);

  const updatePreviewContentScale = (scale: number) => {
    const clamped = Math.max(30, Math.min(300, Math.round(scale)));
    setPreviewContentScale(clamped);
    const uId = getCurrentUserId();
    localStorage.setItem(`acc_preview_content_scale_${uId}`, clamped.toString());
  };

  const updateModalDimensions = (w: number | null, h: number | null) => {
    setModalDimensions({ width: w, height: h });
    const uId = getCurrentUserId();
    if (w && h) {
      localStorage.setItem(`acc_preview_modal_width_${uId}`, w.toString());
      localStorage.setItem(`acc_preview_modal_height_${uId}`, h.toString());
    } else {
      localStorage.removeItem(`acc_preview_modal_width_${uId}`);
      localStorage.removeItem(`acc_preview_modal_height_${uId}`);
    }
  };

  const startModalResize = (e: React.MouseEvent, modalRef: React.RefObject<HTMLDivElement>) => {
    if (!modalRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = modalRef.current.getBoundingClientRect();
    const startW = rect.width;
    const startH = rect.height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const newW = Math.max(360, Math.min(window.innerWidth - 16, startW + deltaX));
      const newH = Math.max(300, Math.min(window.innerHeight - 16, startH + deltaY));

      updateModalDimensions(Math.round(newW), Math.round(newH));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startModalResizeTouch = (e: React.TouchEvent, modalRef: React.RefObject<HTMLDivElement>) => {
    if (!modalRef.current || e.touches.length === 0) return;
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const rect = modalRef.current.getBoundingClientRect();
    const startW = rect.width;
    const startH = rect.height;

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length === 0) return;
      const t = moveEvent.touches[0];
      const deltaX = t.clientX - startX;
      const deltaY = t.clientY - startY;

      const newW = Math.max(360, Math.min(window.innerWidth - 16, startW + deltaX));
      const newH = Math.max(300, Math.min(window.innerHeight - 16, startH + deltaY));

      updateModalDimensions(Math.round(newW), Math.round(newH));
    };

    const handleTouchEnd = () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
  };

  const handleModalStepResize = (delta: number, modalRef: React.RefObject<HTMLDivElement>) => {
    if (!modalRef.current) return;
    const rect = modalRef.current.getBoundingClientRect();
    const currentW = modalDimensions.width || rect.width;
    const currentH = modalDimensions.height || rect.height;

    const stepW = 80 * delta;
    const stepH = 60 * delta;

    const newW = Math.max(360, Math.min(window.innerWidth - 16, currentW + stepW));
    const newH = Math.max(300, Math.min(window.innerHeight - 16, currentH + stepH));

    updateModalDimensions(Math.round(newW), Math.round(newH));
  };

  // 1. Paper Size & Orientation state
  const [paperSize, setPaperSize] = useState<string>(() => {
    return getStoredInvoicePaperSize();
  });

  const updatePaperSize = async (newSize: string) => {
    try {
      const ok = await saveGenericKeyToDb('acc_invoice_paper_size', newSize);
      if (ok) {
        setStoredInvoicePaperSize(newSize);
        setPaperSize(newSize);
        window.dispatchEvent(new CustomEvent('invoice-paper-size-updated', { detail: newSize }));
        window.dispatchEvent(new CustomEvent('paper-size-changed', { detail: { paperSize: newSize } }));
      }
    } catch (err) {
      console.error('Error saving invoice paper size to DB:', err);
    }
  };

  // 2. Raw Form Background Images state (Personnel-Scoped)
  const getBgImageForUser = (pSize: string) => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    return localStorage.getItem(`acc_invoice_bg_image_${pSize}_${uId}`) || localStorage.getItem(`acc_invoice_bg_image_${pSize}`) || '';
  };

  const [paperBgImages, setPaperBgImages] = useState<Record<string, string>>(() => ({
    A4_portrait: getBgImageForUser('A4_portrait'),
    A4_landscape: getBgImageForUser('A4_landscape'),
    A5_portrait: getBgImageForUser('A5_portrait'),
    A5_landscape: getBgImageForUser('A5_landscape'),
  }));

  const updatePaperBgImage = (pSize: string, b64: string) => {
    const uId = getCurrentUserId();
    setPaperBgImages(prev => ({ ...prev, [pSize]: b64 }));
    if (b64) {
      localStorage.setItem(`acc_invoice_bg_image_${pSize}_${uId}`, b64);
      localStorage.setItem(`acc_invoice_bg_image_${pSize}`, b64);
    } else {
      localStorage.removeItem(`acc_invoice_bg_image_${pSize}_${uId}`);
      localStorage.removeItem(`acc_invoice_bg_image_${pSize}`);
    }
    window.dispatchEvent(new CustomEvent('paper-bg-image-changed', {
      detail: { userId: uId, paperId: pSize, bgUrl: b64 }
    }));
  };

  // 3. Vertical Offset Top in MM (Personnel-Scoped)
  const [topOffsetMm, setTopOffsetMm] = useState<number>(() => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    const saved = localStorage.getItem(`acc_top_offset_mm_${uId}`);
    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed)) return parsed;
    }
    return 5; // Default 5mm
  });

  const updateTopOffset = (val: number) => {
    const rounded = Math.round(val * 10) / 10;
    setTopOffsetMm(rounded);
    const uId = getCurrentUserId();
    localStorage.setItem(`acc_top_offset_mm_${uId}`, String(rounded));
    window.dispatchEvent(new CustomEvent('top-offset-changed', {
      detail: { userId: uId, offset: rounded }
    }));
  };

  // 3b. Vertical Offset Bottom in MM (Personnel-Scoped)
  const [bottomOffsetMm, setBottomOffsetMm] = useState<number>(() => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    const saved = localStorage.getItem(`acc_bottom_offset_mm_${uId}`);
    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed)) return parsed;
    }
    return 5; // Default 5mm
  });

  const updateBottomOffset = (val: number) => {
    const rounded = Math.round(val * 10) / 10;
    setBottomOffsetMm(rounded);
    const uId = getCurrentUserId();
    localStorage.setItem(`acc_bottom_offset_mm_${uId}`, String(rounded));
    window.dispatchEvent(new CustomEvent('bottom-offset-changed', {
      detail: { userId: uId, offset: rounded }
    }));
  };

  // 3c. Print Extra Top Margin in MM (Personnel-Scoped)
  const [printExtraTopMarginMm, setPrintExtraTopMarginMm] = useState<number>(() => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    const saved = localStorage.getItem(`acc_print_extra_top_margin_mm_${uId}`);
    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed)) return Math.max(0, parsed);
    }
    return 0; // Default 0mm extra top margin
  });

  const updatePrintExtraTopMargin = (val: number) => {
    const rounded = Math.max(0, Math.round(val * 10) / 10);
    setPrintExtraTopMarginMm(rounded);
    const uId = getCurrentUserId();
    localStorage.setItem(`acc_print_extra_top_margin_mm_${uId}`, String(rounded));
    window.dispatchEvent(new CustomEvent('print-extra-top-margin-changed', {
      detail: { userId: uId, margin: rounded }
    }));
  };

  // 3d. Print Extra Side (Left/Right) Margin in MM (Personnel-Scoped)
  const [printExtraSideMarginMm, setPrintExtraSideMarginMm] = useState<number>(() => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    const saved = localStorage.getItem(`acc_print_extra_side_margin_mm_${uId}`);
    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed)) return Math.max(0, parsed);
    }
    return 0; // Default 0mm extra side margin
  });

  const updatePrintExtraSideMargin = (val: number) => {
    const rounded = Math.max(0, Math.round(val * 10) / 10);
    setPrintExtraSideMarginMm(rounded);
    const uId = getCurrentUserId();
    localStorage.setItem(`acc_print_extra_side_margin_mm_${uId}`, String(rounded));
    window.dispatchEvent(new CustomEvent('print-extra-side-margin-changed', {
      detail: { userId: uId, margin: rounded }
    }));
  };

  // 4. Even Row Opacity percentage for glass tinting (Personnel-Scoped)
  const [evenRowOpacity, setEvenRowOpacity] = useState<number>(() => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    const saved = localStorage.getItem(`acc_even_row_opacity_${uId}`);
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) return Math.max(0, Math.min(100, parsed));
    }
    return 15; // Default 15% black = 85% glass transparency
  });

  const updateEvenRowOpacity = (val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    setEvenRowOpacity(clamped);
    const uId = getCurrentUserId();
    localStorage.setItem(`acc_even_row_opacity_${uId}`, String(clamped));
    window.dispatchEvent(new CustomEvent('even-row-opacity-changed', {
      detail: { userId: uId, opacity: clamped }
    }));
  };

  // Synchronize all personnel-scoped settings when active user changes
  useEffect(() => {
    const uId = getCurrentUserId();
    setPaperSize(getStoredInvoicePaperSize());
    setPaperBgImages({
      A4_portrait: getBgImageForUser('A4_portrait'),
      A4_landscape: getBgImageForUser('A5_portrait') ? getBgImageForUser('A4_landscape') : getBgImageForUser('A4_landscape'),
      A5_portrait: getBgImageForUser('A5_portrait'),
      A5_landscape: getBgImageForUser('A5_landscape'),
    });
    const savedOffset = localStorage.getItem(`acc_top_offset_mm_${uId}`);
    setTopOffsetMm(savedOffset !== null && !isNaN(parseFloat(savedOffset)) ? parseFloat(savedOffset) : 5);
    const savedBottomOffset = localStorage.getItem(`acc_bottom_offset_mm_${uId}`);
    setBottomOffsetMm(savedBottomOffset !== null && !isNaN(parseFloat(savedBottomOffset)) ? parseFloat(savedBottomOffset) : 5);
    const savedPrintExtraTop = localStorage.getItem(`acc_print_extra_top_margin_mm_${uId}`);
    setPrintExtraTopMarginMm(savedPrintExtraTop !== null && !isNaN(parseFloat(savedPrintExtraTop)) ? Math.max(0, parseFloat(savedPrintExtraTop)) : 0);
    const savedPrintExtraSide = localStorage.getItem(`acc_print_extra_side_margin_mm_${uId}`);
    setPrintExtraSideMarginMm(savedPrintExtraSide !== null && !isNaN(parseFloat(savedPrintExtraSide)) ? Math.max(0, parseFloat(savedPrintExtraSide)) : 0);
    const savedOpacity = localStorage.getItem(`acc_even_row_opacity_${uId}`);
    setEvenRowOpacity(savedOpacity !== null && !isNaN(parseInt(savedOpacity, 10)) ? Math.max(0, Math.min(100, parseInt(savedOpacity, 10))) : 15);
  }, [currentUser?.id, currentUser?.username]);

  // Global event listeners for synchronized preview settings
  useEffect(() => {
    const handlePaperSizeUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail === 'object' && customEvent.detail.paperSize) {
        setPaperSize(customEvent.detail.paperSize);
      } else if (typeof customEvent.detail === 'string') {
        setPaperSize(customEvent.detail);
      } else {
        setPaperSize(getStoredInvoicePaperSize());
      }
    };

    const handleBgImageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const uId = getCurrentUserId();
      if (customEvent.detail && customEvent.detail.paperId) {
        if (!customEvent.detail.userId || customEvent.detail.userId === uId) {
          setPaperBgImages(prev => ({
            ...prev,
            [customEvent.detail.paperId]: customEvent.detail.bgUrl || ''
          }));
        }
      } else {
        setPaperBgImages({
          A4_portrait: getBgImageForUser('A4_portrait'),
          A4_landscape: getBgImageForUser('A4_landscape'),
          A5_portrait: getBgImageForUser('A5_portrait'),
          A5_landscape: getBgImageForUser('A5_landscape'),
        });
      }
    };

    const handleOffsetEvent = (e: Event) => {
      const customEv = e as CustomEvent;
      const uId = getCurrentUserId();
      if (customEv.detail && customEv.detail.userId === uId) {
        setTopOffsetMm(customEv.detail.offset);
      }
    };

    const handleBottomOffsetEvent = (e: Event) => {
      const customEv = e as CustomEvent;
      const uId = getCurrentUserId();
      if (customEv.detail && customEv.detail.userId === uId) {
        setBottomOffsetMm(customEv.detail.offset);
      }
    };

    const handlePrintExtraTopMarginEvent = (e: Event) => {
      const customEv = e as CustomEvent;
      const uId = getCurrentUserId();
      if (customEv.detail && customEv.detail.userId === uId) {
        setPrintExtraTopMarginMm(customEv.detail.margin);
      }
    };

    const handlePrintExtraSideMarginEvent = (e: Event) => {
      const customEv = e as CustomEvent;
      const uId = getCurrentUserId();
      if (customEv.detail && customEv.detail.userId === uId) {
        setPrintExtraSideMarginMm(customEv.detail.margin);
      }
    };

    const handleOpacityEvent = (e: Event) => {
      const customEv = e as CustomEvent;
      const uId = getCurrentUserId();
      if (customEv.detail && customEv.detail.userId === uId) {
        setEvenRowOpacity(customEv.detail.opacity);
      }
    };

    window.addEventListener('paper-size-changed', handlePaperSizeUpdate);
    window.addEventListener('paper-bg-image-changed', handleBgImageUpdate);
    window.addEventListener('top-offset-changed', handleOffsetEvent);
    window.addEventListener('bottom-offset-changed', handleBottomOffsetEvent);
    window.addEventListener('print-extra-top-margin-changed', handlePrintExtraTopMarginEvent);
    window.addEventListener('print-extra-side-margin-changed', handlePrintExtraSideMarginEvent);
    window.addEventListener('even-row-opacity-changed', handleOpacityEvent);
    window.addEventListener('storage', handlePaperSizeUpdate);
    window.addEventListener('storage', handleBgImageUpdate);

    return () => {
      window.removeEventListener('paper-size-changed', handlePaperSizeUpdate);
      window.removeEventListener('paper-bg-image-changed', handleBgImageUpdate);
      window.removeEventListener('top-offset-changed', handleOffsetEvent);
      window.removeEventListener('bottom-offset-changed', handleBottomOffsetEvent);
      window.removeEventListener('print-extra-top-margin-changed', handlePrintExtraTopMarginEvent);
      window.removeEventListener('print-extra-side-margin-changed', handlePrintExtraSideMarginEvent);
      window.removeEventListener('even-row-opacity-changed', handleOpacityEvent);
      window.removeEventListener('storage', handlePaperSizeUpdate);
      window.removeEventListener('storage', handleBgImageUpdate);
    };
  }, [currentUser?.id, currentUser?.username]);

  // History / Audit trail states
  const [selectedInvForHistory, setSelectedInvForHistory] = useState<Invoice | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryVersion, setSelectedHistoryVersion] = useState<any>(null);

  // Deletion states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);

  // Permanent Deletion states for Admin
  const [permanentDeleteConfirmOpen, setPermanentDeleteConfirmOpen] = useState(false);
  const [invoiceToPermanentDelete, setInvoiceToPermanentDelete] = useState<Invoice | null>(null);

  // Helper check for deleting privileges
  const canUserDeleteInvoice = (inv: Invoice): boolean => {
    const role = currentUser.role;
    if (role === 'admin') return true;
    if (inv.isProforma) return true; // Sellers and accountants can delete proforma invoices
    if (role === 'seller') return false; // Sellers cannot delete definitive sale/purchase invoices
    if (role === 'accountant') {
      const now = Date.now();
      const createdAt = inv.id.startsWith('inv-')
        ? Number(inv.id.replace('inv-', ''))
        : now;
      const elapsedHours = (now - createdAt) / (1000 * 60 * 60);
      return elapsedHours <= 72; // Accountants can delete only within 72 hours
    }
    return false;
  };

  // Editing invoice states
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  // Generated image modal preview state
  const [generatedImageModalUrl, setGeneratedImageModalUrl] = useState<string | null>(null);

  // Form states
  const [date, setDate] = useState(() => getTodayJalali());
  const [desc, setDesc] = useState('');
  const [isUrgent, setIsUrgent] = useState<boolean>(false);
  const [urgentType, setUrgentType] = useState<'urgent' | 'emergency' | undefined>(undefined);

  // Helper to check if an invoice was created/registered by current staff user
  const isCreatedByCurrentUser = (inv: Invoice) => {
    if (!currentUser) return false;
    if (inv.createdById && currentUser.id) {
      if (String(inv.createdById) === String(currentUser.id)) return true;
    }
    if (inv.createdBy) {
      const invAuthor = inv.createdBy.trim().toLowerCase();
      if (currentUser.name && invAuthor === currentUser.name.trim().toLowerCase()) return true;
      if (currentUser.username && invAuthor === currentUser.username.trim().toLowerCase()) return true;
    }
    return false;
  };

  const currentUserId = currentUser?.id || currentUser?.username || 'default';

  // Configurable urgent check interval for current user
  const [urgentCheckInterval, setUrgentCheckInterval] = useState<number>(() => {
    const saved = localStorage.getItem(`fahamacc_urgent_proforma_interval_${currentUserId}`) || localStorage.getItem('fahamacc_urgent_proforma_interval');
    return saved ? parseInt(saved, 10) : 10;
  });

  // Keep references updated for ticker interval without triggering unnecessary re-executions
  const invoicesRef = useRef(invoices);
  invoicesRef.current = invoices;

  const urgentCheckIntervalRef = useRef(urgentCheckInterval);
  urgentCheckIntervalRef.current = urgentCheckInterval;

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const lastUrgentAlertTimeRef = useRef<number>(
    parseInt(localStorage.getItem(`fahamacc_urgent_last_shown_${currentUserId}`) || '0', 10) || 0
  );

  const knownUrgentIdsRef = useRef<Set<string>>(new Set());

  // Listen for user interval updates from Settings and storage
  useEffect(() => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    const saved = localStorage.getItem(`fahamacc_urgent_proforma_interval_${uId}`) || localStorage.getItem('fahamacc_urgent_proforma_interval');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0) {
        setUrgentCheckInterval(parsed);
      }
    }

    const handleIntervalUpdate = (e: any) => {
      if (e.detail && (e.detail.userId === uId || !e.detail.userId) && e.detail.interval) {
        setUrgentCheckInterval(e.detail.interval);
      }
    };
    window.addEventListener('urgent-interval-updated', handleIntervalUpdate);
    return () => window.removeEventListener('urgent-interval-updated', handleIntervalUpdate);
  }, [currentUser?.id, currentUser?.username]);

  // Urgent Proformas Popup Modal States
  const [showUrgentModal, setShowUrgentModal] = useState<boolean>(false);
  const [activePhoneInvoiceId, setActivePhoneInvoiceId] = useState<string | null>(null);

  const handleDismissUrgentModal = () => {
    setShowUrgentModal(false);
    const now = Date.now();
    lastUrgentAlertTimeRef.current = now;
    const uId = currentUserRef.current?.id || currentUserRef.current?.username || 'default';
    try {
      localStorage.setItem(`fahamacc_urgent_last_shown_${uId}`, now.toString());
    } catch (_) {}

    const myUrgentList = (invoicesRef.current || []).filter(inv => 
      inv.isProforma && 
      inv.isUrgent && 
      !inv.isDeleted && 
      isCreatedByCurrentUser(inv)
    );
    knownUrgentIdsRef.current = new Set(myUrgentList.map(inv => String(inv.id)));
  };

  // Periodic check for Urgent Proformas ("فوری / اضطراری") strictly governed by real elapsed time
  useEffect(() => {
    const checkUrgentProformas = (isPeriodicTick = true) => {
      const user = currentUserRef.current;
      const uId = user?.id || user?.username || 'default';
      const allInvoices = invoicesRef.current || [];

      const myUrgentList = allInvoices.filter(inv => 
        inv.isProforma && 
        inv.isUrgent && 
        !inv.isDeleted && 
        isCreatedByCurrentUser(inv)
      );

      if (myUrgentList.length === 0) {
        setShowUrgentModal(false);
        return;
      }

      const now = Date.now();
      const intervalMinutes = Math.max(1, urgentCheckIntervalRef.current || 10);
      const intervalMs = intervalMinutes * 60 * 1000;

      let lastShown = lastUrgentAlertTimeRef.current;
      if (!lastShown || lastShown === 0) {
        const stored = localStorage.getItem(`fahamacc_urgent_last_shown_${uId}`);
        if (stored) {
          lastShown = parseInt(stored, 10);
          lastUrgentAlertTimeRef.current = lastShown;
        }
      }

      const currentUrgentIds = myUrgentList.map(inv => String(inv.id));
      const hasNewUrgentProforma = currentUrgentIds.some(id => !knownUrgentIdsRef.current.has(id));

      const isTimeElapsed = (!lastShown || lastShown === 0) || (now - lastShown >= intervalMs);

      // Trigger alert only if brand-new urgent item was detected OR full user-configured interval elapsed
      if (hasNewUrgentProforma || isTimeElapsed) {
        setShowUrgentModal(true);
        lastUrgentAlertTimeRef.current = now;
        try {
          localStorage.setItem(`fahamacc_urgent_last_shown_${uId}`, now.toString());
        } catch (_) {}
        knownUrgentIdsRef.current = new Set(currentUrgentIds);
      }
    };

    // Initial check after mount
    const initTimer = setTimeout(() => {
      checkUrgentProformas(false);
    }, 1500);

    // Steady 5s background ticker to evaluate elapsed time against configured interval (e.g. 5, 10, 15, 20, 25, 30 min)
    const intervalId = setInterval(() => {
      checkUrgentProformas(true);
    }, 5000);

    return () => {
      clearTimeout(initTimer);
      clearInterval(intervalId);
    };
  }, [currentUserId]);

  // Selected custom icons
  const [selectedCustomIcons, setSelectedCustomIcons] = useState<string[]>([]);
  
  // Custom system icons
  const [systemIcons, setSystemIcons] = useState<{ id: string; name: string; iconData: string }[]>(() => getStoredCustomIcons());

  const [shippingMethods, setShippingMethods] = useState<{ id: string; name: string; iconData: string; note?: string }[]>(() => getStoredShippingMethods());
  const [acquaintanceMethods, setAcquaintanceMethods] = useState<{ id: string; name: string; iconData: string }[]>(() => getStoredAcquaintanceMethods());

  const [selectedShippingMethod, setSelectedShippingMethod] = useState<string | null>(null);
  const [selectedAcquaintanceMethod, setSelectedAcquaintanceMethod] = useState<string | null>(null);
  const [isAcquaintanceExpanded, setIsAcquaintanceExpanded] = useState<boolean>(true);
  const [validationErrors, setValidationErrors] = useState<{ communication: boolean; shipping: boolean } | null>(null);

  // Reload system icons, shipping methods, and acquaintance methods from memory/events when form is loaded or when updated globally
  useEffect(() => {
    const handleUpdate = (e?: any) => {
      if (e?.type === 'system-icons-updated' && Array.isArray(e?.detail)) {
        setSystemIcons(e.detail);
      } else {
        setSystemIcons(getStoredCustomIcons());
      }
      if (e?.type === 'shipping-methods-updated' && Array.isArray(e?.detail)) {
        setShippingMethods(e.detail);
      } else {
        setShippingMethods(getStoredShippingMethods());
      }
      if (e?.type === 'acquaintance-methods-updated' && Array.isArray(e?.detail)) {
        setAcquaintanceMethods(e.detail);
      } else {
        setAcquaintanceMethods(getStoredAcquaintanceMethods());
      }
    };

    handleUpdate();

    window.addEventListener('system-icons-updated', handleUpdate);
    window.addEventListener('shipping-methods-updated', handleUpdate);
    window.addEventListener('acquaintance-methods-updated', handleUpdate);
    window.addEventListener('seller-name-updated', handleUpdate);
    window.addEventListener('seller-reg-no-updated', handleUpdate);
    window.addEventListener('seller-address-updated', handleUpdate);
    window.addEventListener('seller-phone-updated', handleUpdate);
    window.addEventListener('seller-info-updated', handleUpdate);
    window.addEventListener('invoice-paper-size-updated', handleUpdate);
    window.addEventListener('paper-size-changed', handleUpdate);
    window.addEventListener('warehouse-categories-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('system-icons-updated', handleUpdate);
      window.removeEventListener('shipping-methods-updated', handleUpdate);
      window.removeEventListener('acquaintance-methods-updated', handleUpdate);
      window.removeEventListener('seller-name-updated', handleUpdate);
      window.removeEventListener('seller-reg-no-updated', handleUpdate);
      window.removeEventListener('seller-address-updated', handleUpdate);
      window.removeEventListener('seller-phone-updated', handleUpdate);
      window.removeEventListener('seller-info-updated', handleUpdate);
      window.removeEventListener('invoice-paper-size-updated', handleUpdate);
      window.removeEventListener('paper-size-changed', handleUpdate);
      window.removeEventListener('warehouse-categories-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [showForm]);
  
  // Counterparty fields
  const [counterpartName, setCounterpartName] = useState('');
  const [counterpartPhone, setCounterpartPhone] = useState('');
  const [counterpartAddress, setCounterpartAddress] = useState('');
  const [showCounterpartSuggestions, setShowCounterpartSuggestions] = useState(false);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const [activePhoneCounterpartIndex, setActivePhoneCounterpartIndex] = useState<number>(-1);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    type?: 'name' | 'phone';
    name: string;
    phone?: string;
    createdBy: string;
    createdAt: string;
    isBlocked?: boolean;
  } | null>(null);

  const getPhoneBlockedCounterpart = () => {
    return null;
  };

  const isPhoneBlocked = false;

  // Auto-select counterpart details and default communication methods
  const handleSelectCounterpart = useCallback((cp: Counterpart) => {
    setCounterpartName(cp.name);
    if (cp.phone && cp.phone !== 'ثبت نشده') {
      setCounterpartPhone(cp.phone);
    }
    if (cp.address && cp.address !== 'ثبت نشده') {
      setCounterpartAddress(cp.address);
    }
    setShowCounterpartSuggestions(false);
    setShowPhoneSuggestions(false);

    // 1. Communication methods (روش‌های ارتباطی)
    let defaultIcons: string[] = [];
    if (cp.customIcons && cp.customIcons.length > 0) {
      defaultIcons = cp.customIcons;
    } else {
      const lastInv = [...invoices].reverse().find(inv => 
        (inv.counterpartName && inv.counterpartName.trim().toLowerCase() === cp.name.trim().toLowerCase()) ||
        (cp.phone && cp.phone !== 'ثبت نشده' && inv.counterpartPhone && inv.counterpartPhone.trim() === cp.phone.trim())
      );
      if (lastInv && lastInv.customIcons && lastInv.customIcons.length > 0) {
        defaultIcons = lastInv.customIcons;
      } else if (cp.communicationChannel) {
        const channelNames = cp.communicationChannel.split(/[,-]/).map(s => s.trim().toLowerCase());
        defaultIcons = systemIcons
          .filter(s => channelNames.includes(s.name.trim().toLowerCase()))
          .map(s => s.id);
      }
    }

    if (defaultIcons.length > 0) {
      setSelectedCustomIcons(defaultIcons);
    }

    // 2. Acquaintance method
    let acqId: string | null = null;
    if (cp.acquaintanceMethod) {
      const found = acquaintanceMethods.find(a => a.name === cp.acquaintanceMethod);
      if (found) acqId = found.id;
    }
    if (!acqId) {
      const lastInv = [...invoices].reverse().find(inv => 
        (inv.counterpartName && inv.counterpartName.trim().toLowerCase() === cp.name.trim().toLowerCase()) ||
        (cp.phone && cp.phone !== 'ثبت نشده' && inv.counterpartPhone && inv.counterpartPhone.trim() === cp.phone.trim())
      );
      if (lastInv && lastInv.acquaintanceMethod) {
        const found = acquaintanceMethods.find(a => a.name === lastInv.acquaintanceMethod);
        if (found) acqId = found.id;
      }
    }
    if (acqId) {
      setSelectedAcquaintanceMethod(acqId);
      setIsAcquaintanceExpanded(false);
    }

    // Shipping method auto-recall is disabled as requested so the user selects it manually.
  }, [invoices, systemIcons, acquaintanceMethods]);

  // Calculations states
  const [tax, setTax] = useState<number>(0);
  const [deposit, setDeposit] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState<number>(0);

  // Refs for tracking auto-generated notes to update description cleanly
  const lastDiscountNoteRef = React.useRef<string>('');
  const lastShippingNoteRef = React.useRef<string>('');

  // AI payment slip extraction states
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedAmount, setExtractedAmount] = useState<number | null>(null);
  const [extractedDate, setExtractedDate] = useState<string>('');
  const [extractedSlips, setExtractedSlips] = useState<Array<{
    id: string;
    amount: number;
    date: string;
    time?: string;
    imageName?: string;
  }>>([]);

  // Synchronize extractedAmount and extractedDate when extractedSlips updates
  useEffect(() => {
    const isDepositLocked = editingInvoice !== null && !editingInvoice.isProforma && currentUser.role === 'seller';
    if (extractedSlips.length > 0) {
      const totalAmount = extractedSlips.reduce((sum, slip) => sum + (Number(slip.amount) || 0), 0);
      setExtractedAmount(totalAmount);
      
      const dates = extractedSlips.map(s => s.date).filter(Boolean);
      if (dates.length > 0) {
        setExtractedDate(dates[dates.length - 1]);
      } else {
        setExtractedDate('');
      }
      
      if (!isDepositLocked) {
        setDeposit(totalAmount);
      }
    } else {
      setExtractedAmount(null);
      setExtractedDate('');
      if (!isDepositLocked) {
        setDeposit(0);
      }
    }
  }, [extractedSlips, editingInvoice, currentUser.role]);

  // Attachments and Drag State
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isFormDragging, setIsFormDragging] = useState(false);

  // Table items grid rows
  const [gridRows, setGridRows] = useState<Array<{
    itemId?: string;
    name: string;
    color?: string;
    qty: number;
    unitPrice: number;
    remarks: string;
  }>>([{ name: '', qty: 1, unitPrice: 0, remarks: '' }]);

  // Row position reorder modal state
  const [moveRowModalIndex, setMoveRowModalIndex] = useState<number | null>(null);
  const [targetRowNumberInput, setTargetRowNumberInput] = useState<string>('');

  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null);

  const [activeCounterpartIndex, setActiveCounterpartIndex] = useState<number>(-1);
  const [activeItemIndex, setActiveItemIndex] = useState<number>(-1);

  // Undefined Item popup states
  const [undefinedItemPopup, setUndefinedItemPopup] = useState<{
    isOpen: boolean;
    rowIdx: number;
    itemName: string;
    showAddForm: boolean;
  }>({
    isOpen: false,
    rowIdx: -1,
    itemName: '',
    showAddForm: false
  });

  // Zero stock warning popup state
  const [zeroStockPopup, setZeroStockPopup] = useState<{
    isOpen: boolean;
    rowIdx: number;
    item: WarehouseItem | null;
  }>({
    isOpen: false,
    rowIdx: -1,
    item: null
  });

  // Validation error popup state
  const [validationModalPopup, setValidationModalPopup] = useState<{
    isOpen: boolean;
    title?: string;
    errors: string[];
    isPfPassed?: boolean;
    andPrint?: boolean;
  }>({
    isOpen: false,
    title: 'قفل و تأیید نهایی اطلاعات فاکتور',
    errors: []
  });

  // Price reduction error modal popup state
  const [priceErrorModal, setPriceErrorModal] = useState<{
    isOpen: boolean;
    rowIdx: number;
    itemName: string;
    enteredPrice: number;
    basePrice: number;
  }>({
    isOpen: false,
    rowIdx: -1,
    itemName: '',
    enteredPrice: 0,
    basePrice: 0
  });

  // Negative stock warning modal popup state
  const [negativeStockPrompt, setNegativeStockPrompt] = useState<{
    isOpen: boolean;
    items: Array<{ name: string; available: number; requested: number; deficit: number }>;
    isPfPassed?: boolean;
    andPrint?: boolean;
  }>({
    isOpen: false,
    items: []
  });

  // Custom deposit popup states
  const [showCustomDepositModal, setShowCustomDepositModal] = useState(false);
  const [customDepositAmount, setCustomDepositAmount] = useState<string>('');
  const [customDepositDate, setCustomDepositDate] = useState<string>('');
  const [customDepositHour, setCustomDepositHour] = useState<number>(12);
  const [customDepositMinute, setCustomDepositMinute] = useState<number>(0);

  const hourWheelRef = React.useRef<HTMLDivElement>(null);
  const minuteWheelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showCustomDepositModal) return;

    // Use a tiny timeout to ensure elements are fully mounted and refs are populated
    const timeoutId = setTimeout(() => {
      const hourEl = hourWheelRef.current;
      const minuteEl = minuteWheelRef.current;

      const handleHourWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) {
          setCustomDepositHour(prev => (prev + 1) % 24);
        } else {
          setCustomDepositHour(prev => (prev - 1 + 24) % 24);
        }
      };

      const handleMinuteWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) {
          setCustomDepositMinute(prev => (prev + 1) % 60);
        } else {
          setCustomDepositMinute(prev => (prev - 1 + 60) % 60);
        }
      };

      if (hourEl) {
        hourEl.addEventListener('wheel', handleHourWheel, { passive: false });
      }
      if (minuteEl) {
        minuteEl.addEventListener('wheel', handleMinuteWheel, { passive: false });
      }

      return () => {
        if (hourEl) {
          hourEl.removeEventListener('wheel', handleHourWheel);
        }
        if (minuteEl) {
          minuteEl.removeEventListener('wheel', handleMinuteWheel);
        }
      };
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [showCustomDepositModal]);

  // Helper to determine base price for a grid row item
  const getItemBasePrice = (row: { itemId?: string; name: string; basePrice?: number }) => {
    if (row.basePrice !== undefined && row.basePrice > 0) {
      return row.basePrice;
    }
    let found = items.find(it => it.id === row.itemId);
    if (!found && row.name) {
      const inputStr = row.name.trim().toLowerCase();
      found = items.find(it => {
        const baseName = it.name.trim().toLowerCase();
        const fullNameWithColor = formatItemNameWithColor(it.name, it.color).trim().toLowerCase();
        return baseName === inputStr || fullNameWithColor === inputStr;
      });
    }
    if (found) {
      return activeType === 'sale' ? (found.lastSalePrice || 0) : (found.lastPurchasePrice || 0);
    }
    return 0;
  };

  const [popupItemType, setPopupItemType] = useState<'kala' | 'khadamat' | 'consumables'>('kala');
  const [popupItemColor, setPopupItemColor] = useState('');
  const [popupItemQty, setPopupItemQty] = useState(0);
  const [popupItemUnit, setPopupItemUnit] = useState<string>('عدد');
  const [popupItemLastPur, setPopupItemLastPur] = useState(0);
  const [popupItemLastSale, setPopupItemLastSale] = useState(0);
  const [popupItemMinQtyAlarm, setPopupItemMinQtyAlarm] = useState<number | undefined>(undefined);
  const [popupItemName, setPopupItemName] = useState('');

  const isRowItemUndefinedInWarehouse = (row: { itemId?: string; name: string }) => {
    const val = row.name.trim();
    if (val === '') return false;
    const existsInItems = items.some(it => {
      if (row.itemId && it.id === row.itemId) return true;
      const baseName = it.name.trim().toLowerCase();
      const fullNameWithColor = formatItemNameWithColor(it.name, it.color).trim().toLowerCase();
      const inputName = val.toLowerCase();
      return baseName === inputName || fullNameWithColor === inputName;
    });
    if (existsInItems) return false;
    const existsInCategories = allWarehouseCategories.some(c => c.final.trim().toLowerCase() === val.toLowerCase());
    return !existsInCategories;
  };

  const handleCheckRowItemName = (idx: number, nameValue: string) => {
    const val = nameValue.trim();
    if (val === '') return false;
    const exists = items.some(it => {
      if (gridRows[idx]?.itemId && it.id === gridRows[idx].itemId) return true;
      const baseName = it.name.trim().toLowerCase();
      const fullNameWithColor = formatItemNameWithColor(it.name, it.color).trim().toLowerCase();
      const inputName = val.toLowerCase();
      return baseName === inputName || fullNameWithColor === inputName;
    });
    if (exists) return false;

    // Check if it matches a known category (such as consumables or advertising category)
    const matchedCat = allWarehouseCategories.find(c => c.final.trim().toLowerCase() === val.toLowerCase());
    if (matchedCat) {
      handleSelectCategorySuggestion(idx, matchedCat);
      return false;
    }

    // Set default type for undefined item popup based on name
    const isConsumable = val.includes('بخش') || val.includes('تامبلغ') || val.includes('چاپ') || val.includes('بهاز') || val.includes('بستن');
    const isService = val.includes('خدمات') || val.includes('شماره') || val.includes('آیابرایاین') || val.includes('پیشاینتلاش');
    setPopupItemType(isConsumable ? 'consumables' : (isService ? 'khadamat' : 'kala'));

    setUndefinedItemPopup({
      isOpen: true,
      rowIdx: idx,
      itemName: val,
      showAddForm: false
    });
    return true;
  };

  const handleSavePopupItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!popupItemName.trim()) {
      alert('لطفاً نام کالا و خدمات را وارد نمایید.');
      return;
    }
    if (!onAddItem) {
      alert('کالایی با این نام قبلاً در سیستم ثبت شده است.');
      return;
    }

    const prefix = popupItemType === 'kala' ? 'KA-' : (popupItemType === 'consumables' ? 'MT-' : 'KHT-');
    let maxNum = 0;
    items.forEach(it => {
      if (it.type === popupItemType) {
        const match = it.id.match(/\d+$/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      }
    });
    const generatedId = `${prefix}${maxNum + 1}`;

    const newItem: WarehouseItem = {
      id: generatedId,
      name: popupItemName.trim(),
      type: popupItemType,
      color: (popupItemType === 'kala' || popupItemType === 'consumables') ? popupItemColor.trim() : '',
      qty: (popupItemType === 'kala' || popupItemType === 'consumables') ? popupItemQty : 0,
      initialQty: (popupItemType === 'kala' || popupItemType === 'consumables') ? popupItemQty : 0,
      unit: (popupItemType === 'kala' || popupItemType === 'consumables') ? popupItemUnit : undefined,
      lastPurchasePrice: popupItemLastPur,
      lastSalePrice: popupItemLastSale,
      setupDate: new Date().toLocaleDateString('fa-IR'),
      minQtyAlarm: (popupItemType === 'kala' || popupItemType === 'consumables') ? popupItemMinQtyAlarm : undefined
    };

    onAddItem(newItem);

    const updatedRows = [...gridRows];
    const idx = undefinedItemPopup.rowIdx;
    if (idx >= 0 && idx < updatedRows.length) {
      const itemPrice = activeType === 'sale' 
        ? (newItem.lastSalePrice || 0) 
        : (newItem.lastPurchasePrice || 0);

      const validColor = hasValidColor(newItem.color) ? newItem.color.trim() : undefined;
      const formattedName = formatItemNameWithColor(newItem.name, validColor);

      updatedRows[idx] = {
        ...updatedRows[idx],
        itemId: newItem.id,
        name: formattedName,
        color: validColor,
        unitPrice: itemPrice,
        basePrice: itemPrice
      };
      setGridRows(updatedRows);
    }

    setUndefinedItemPopup({
      isOpen: false,
      rowIdx: -1,
      itemName: '',
      showAddForm: false
    });

    alert(`ردیف «${newItem.name}» با موفقیت در فاکتور اضافه شد.`);
  };

  // Reset counterpart index on input change
  React.useEffect(() => {
    setActiveCounterpartIndex(-1);
  }, [counterpartName]);

  // Reset item index on active idx change
  React.useEffect(() => {
    setActiveItemIndex(-1);
  }, [activeSearchIdx]);

  // Active Tab for Archives
  const [archiveTab, setArchiveTab] = useState<'all' | 'sale' | 'proforma' | 'purchase' | 'deleted'>('all');
  const [archiveStartDate, setArchiveStartDate] = useState<string>(() => getOneMonthAgoJalali());
  const [archiveEndDate, setArchiveEndDate] = useState<string>(() => getTodayJalali());
  const [activeQuickFilter, setActiveQuickFilter] = useState<'today' | '3days' | 'week' | 'all' | 'custom'>('custom');
  const [archiveCounterpartSearch, setArchiveCounterpartSearch] = useState<string>('');
  const [archiveProductSearch, setArchiveProductSearch] = useState<string>('');

  const parseJalaliDate = (dateStr: string) => {
    if (!dateStr) return null;
    const cleanStr = toEnglishDigits(String(dateStr)).trim().replace(/[^\d\/]/g, '');
    const parts = cleanStr.split('/');
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    return { year, month, day };
  };

  const jalaliToDays = (d: { year: number; month: number; day: number }) => {
    if (isNaN(d.year) || isNaN(d.month) || isNaN(d.day)) return 0;
    let days = (d.year - 1400) * 365 + Math.floor((d.year - 1400) / 4);
    for (let m = 1; m < d.month; m++) {
      if (m <= 6) days += 31;
      else days += 30;
    }
    days += d.day;
    return days;
  };

  const daysToJalali = (totalDays: number): string => {
    let yearEst = 1400 + Math.floor(totalDays / 365.24219);
    let dEst = { year: yearEst, month: 1, day: 1 };
    let baseDays = jalaliToDays(dEst);
    while (baseDays > totalDays && yearEst > 1300) {
      yearEst--;
      dEst.year = yearEst;
      baseDays = jalaliToDays(dEst);
    }
    while (true) {
      const nextYearDays = jalaliToDays({ year: yearEst + 1, month: 1, day: 1 });
      if (nextYearDays <= totalDays) {
        yearEst++;
      } else {
        break;
      }
    }
    let remainingDays = totalDays - jalaliToDays({ year: yearEst, month: 1, day: 1 }) + 1;
    let month = 1;
    while (month <= 12) {
      const mLen = month <= 6 ? 31 : 30;
      if (remainingDays > mLen) {
        remainingDays -= mLen;
        month++;
      } else {
        break;
      }
    }
    const day = remainingDays;
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${yearEst}/${pad(month)}/${pad(day)}`;
  };

  const handleSelectTodayFilter = () => {
    const today = getTodayJalali();
    setArchiveStartDate(today);
    setArchiveEndDate(today);
    setActiveQuickFilter('today');
  };

  const handleSelect3DaysFilter = () => {
    const todayStr = getTodayJalali();
    const todayParsed = parseJalaliDate(todayStr);
    if (todayParsed) {
      const todayDays = jalaliToDays(todayParsed);
      const startDays = todayDays - 3;
      setArchiveStartDate(daysToJalali(startDays));
      setArchiveEndDate(todayStr);
      setActiveQuickFilter('3days');
    }
  };

  const handleSelectWeekFilter = () => {
    const todayStr = getTodayJalali();
    const todayParsed = parseJalaliDate(todayStr);
    if (todayParsed) {
      const todayDays = jalaliToDays(todayParsed);
      const startDays = todayDays - 7;
      setArchiveStartDate(daysToJalali(startDays));
      setArchiveEndDate(todayStr);
      setActiveQuickFilter('week');
    }
  };

  const handleSelectAllFilter = () => {
    setArchiveStartDate('۱۴۰۰/۰۱/۰۱');
    setArchiveEndDate(getTodayJalali());
    setActiveQuickFilter('all');
  };

  const isSeller = currentUser.role === 'seller';

  // Helper check for editing privileges (allowing all roles and personnel unrestricted editing of invoices)
  const canUserEditInvoice = (inv: Invoice): { allowed: boolean; reason?: string } => {
    return { allowed: true };
  };

  const handleLoadEditInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    setActiveType(inv.type);
    setDate(inv.date);
    setDesc(inv.description);
    setIsUrgent(inv.isUrgent || false);
    setUrgentType(inv.urgentType || (inv.isUrgent ? 'urgent' : undefined));
    setCounterpartName(inv.counterpartName);
    setCounterpartPhone(inv.counterpartPhone || '');
    setCounterpartAddress(inv.counterpartAddress || '');
    setTax(Number(inv.tax) || 0);
    const loadedDeposit = Number(inv.deposit) || Number(inv.paymentAmount) || (inv.paymentSlips ? inv.paymentSlips.reduce((s, sl) => s + (Number(sl.amount) || 0), 0) : 0);
    setDeposit(loadedDeposit);
    setDiscount(Number(inv.discount) || 0);
    setDiscountValue(Number(inv.discount) || 0);
    setDiscountType('amount');
    
    // Initialize note tracking refs so repeated edits do not duplicate notes
    const sm = inv.shippingMethod ? shippingMethods.find(m => m.id === inv.shippingMethod) : null;
    lastShippingNoteRef.current = (sm && sm.note && sm.note.trim() !== '') ? sm.note.trim() : '';
    lastDiscountNoteRef.current = (Number(inv.discount) || 0) > 0 ? `تخفیف ویژه ${formatCurrency(Number(inv.discount) || 0)}` : '';

    setAttachments(inv.attachments || []);
    setExtractedAmount(loadedDeposit > 0 ? loadedDeposit : null);
    setExtractedDate(inv.paymentDate || '');
    if (inv.paymentSlips && inv.paymentSlips.length > 0) {
      setExtractedSlips(inv.paymentSlips);
    } else if (loadedDeposit > 0) {
      setExtractedSlips([{
        id: 'existing-' + inv.id,
        amount: loadedDeposit,
        date: inv.paymentDate || inv.date || getTodayJalali(),
        time: '',
        imageName: 'اطلاعات پرداخت ثبت نشده'
      }]);
    } else {
      setExtractedSlips([]);
    }
    setSelectedCustomIcons(inv.customIcons || []);
    setSelectedShippingMethod(inv.shippingMethod || null);
    if (inv.acquaintanceMethod) {
      const foundAcq = acquaintanceMethods.find(a => a.name === inv.acquaintanceMethod);
      setSelectedAcquaintanceMethod(foundAcq ? foundAcq.id : null);
    } else {
      setSelectedAcquaintanceMethod(null);
    }
    
    const mappedRows = (inv.items || []).map(line => {
      let bPrice: number | undefined = undefined;
      const found = items.find(it => it.id === line.itemId || it.name === line.name);
      if (found) {
        bPrice = inv.type === 'sale' ? (found.lastSalePrice || 0) : (found.lastPurchasePrice || 0);
      }
      const lineQty = typeof line.qty === 'number' ? (isNaN(line.qty) ? 1 : line.qty) : (parsePersianAmount(line.qty) || 1);
      const lineUnitPrice = typeof line.unitPrice === 'number' ? (isNaN(line.unitPrice) ? 0 : line.unitPrice) : (parsePersianAmount(line.unitPrice) || 0);
      return {
        itemId: line.itemId,
        name: formatItemNameWithColor(line.name, line.color),
        color: hasValidColor(line.color) ? line.color.trim() : undefined,
        qty: lineQty,
        unitPrice: lineUnitPrice,
        remarks: line.remarks || '',
        basePrice: bPrice !== undefined ? bPrice : lineUnitPrice
      };
    });
    setGridRows(mappedRows.length > 0 ? mappedRows : [{ name: '', qty: 1, unitPrice: 0, remarks: '' }]);
    setShowForm(true);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Advanced WebP Image Upload processing logic
  const processImageFile = (file: File) => {
    // 3MB limit
    if (file.size > 3 * 1024 * 1024) {
      alert(`حجم فایل "${file.name}" بیشتر از ۵ مگابایت است. لطفاً فایل با حجم کمتر انتخاب نمایید.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Resize proportionally if over 1920 to keep string size optimized
        const maxDim = 1920;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // Convert to WebP format with 0.82 quality
          const webpDataUrl = canvas.toDataURL('image/webp', 0.82);
          setAttachments(prev => [...prev, webpDataUrl]);
          handleAutoExtractSlip(webpDataUrl, file.name);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleAutoExtractSlip = async (imageDataUrl: string, fileName?: string) => {
    setIsExtracting(true);
    try {
      const response = await fetch('/api/gemini/extract-slip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageBase64: imageDataUrl }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'خطا در بارگذاری اطلاعات در سرور');
      }
      const data = await response.json();
      
      const newSlip = {
        id: 'slip-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        amount: Number(data.amount) || 0,
        date: data.date || '',
        time: data.time || '',
        imageName: fileName || `این شماره ${extractedSlips.length + 1}`
      };
      
      setExtractedSlips(prev => [...prev, newSlip]);
    } catch (error: any) {
      console.error('Error auto-extracting slip:', error);
      alert(`هشدار: خطا در پردازش اطلاعات پرداخت.
جزئیات: ${error?.message || ''}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach((file: File) => {
        processImageFile(file);
      });
    }
  };

  const handleFormDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsFormDragging(true);
  };

  const handleFormDragLeave = () => {
    setIsFormDragging(false);
  };

  const handleFormDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsFormDragging(false);
    if (e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach((file: File) => {
        if (file.type && file.type.startsWith('image/')) {
          processImageFile(file);
        } else {
          alert('را باهایها تصویر برای شد.');
        }
      });
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.items) {
      const items = Array.from(e.clipboardData.items);
      items.forEach((item: DataTransferItem) => {
        if (item.type && item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            processImageFile(file);
          }
        }
      });
    }
  };

  // Export printable A4 invoice layout
  const handleExportAsImage = async () => {
    const element = document.getElementById('invoice-print-area');
    if (!element) {
      alert('بابا چاپ فاکتور است شده.');
      return;
    }
    const origBorder = element.style.border;
    element.style.border = "none";
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      element.style.border = origBorder;
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `فاکتور_${selectedInv?.invoiceNumber || ''}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error rendering element:', err);
      element.style.border = origBorder;
      alert('خطا در صدور تصویر فاکتور. لطفاً مجدداً تلاش نمایید.');
    }
  };

  // Export digital card layout
  const handleExportDigitalCardAsImage = async () => {
    const element = document.getElementById('invoice-social-card');
    if (!element) return;
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0f172a'
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `یکواردتا_فاکتور_${selectedInv?.invoiceNumber || ''}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error rendering image card:', err);
      alert('خطا از ایجاد تصویر یکواردتا فاکتور.');
    }
  };

  // For seller: default type is strictly 'sale'
  useEffect(() => {
    if (isSeller) {
      setActiveType('sale');
    }
  }, [isSeller]);

  // Bind Ctrl+P / Cmd+P for print shortcut when Live Preview or Print modal is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((showLivePreview || showPrintModal) && (e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showLivePreview, showPrintModal]);

  // Set default form selections on type or opening changes
  useEffect(() => {
    setDate(new Date().toLocaleDateString('fa-IR'));
  }, [activeType, showForm]);

  // Helper to fetch category note for a given warehouse item
  const getCategoryNoteForItem = (item: WarehouseItem): string | null => {
    try {
      const catsList = getStoredWarehouseCategoriesList();
      if (!Array.isArray(catsList) || catsList.length === 0) return null;

      const itemFinal = item.categoryName ? item.categoryName.trim().toLowerCase() : '';
      const itemParent = item.parentCategory ? item.parentCategory.trim().toLowerCase() : '';
      const itemSub = item.subCategory ? item.subCategory.trim().toLowerCase() : '';

      const matchedCat = catsList.find(c => {
        const catFinal = c.final ? c.final.trim().toLowerCase() : '';
        if (itemFinal && catFinal && itemFinal === catFinal) return true;
        if (itemParent && itemSub && c.parent?.trim().toLowerCase() === itemParent && c.sub?.trim().toLowerCase() === itemSub) return true;
        return false;
      });

      if (matchedCat && matchedCat.note && matchedCat.note.trim() !== '') {
        return matchedCat.note.trim();
      }
    } catch (e) {
      console.error('Error reading category note:', e);
    }
    return null;
  };

  // Load all available categories (including consumables & advertising)
  const allWarehouseCategories = useMemo(() => {
    const list: Array<{ parent: string; sub: string; final: string; type?: 'kala' | 'khadamat' | 'consumables'; note?: string }> = [];
    const stored = getStoredWarehouseCategoriesList();
    if (Array.isArray(stored)) {
      list.push(...stored);
    }

    // Include categories from existing warehouse items
    items.forEach(it => {
      if (it.categoryName && it.categoryName.trim()) {
        const finalName = it.categoryName.trim();
        if (!list.some(c => c.final?.trim().toLowerCase() === finalName.toLowerCase())) {
          list.push({
            parent: it.parentCategory || finalName,
            sub: it.subCategory || finalName,
            final: finalName,
            type: it.type || 'kala'
          });
        }
      }
    });

    return list;
  }, [items]);

  // Helper to update or replace auto-generated notes in invoice description using comma separation
  const updateAutoNoteInDesc = (prevDesc: string, oldNote: string, newNote: string): string => {
    let text = prevDesc || '';

    // 1. If oldNote exists in text, replace or remove it
    if (oldNote && oldNote.trim() !== '' && text.includes(oldNote)) {
      if (newNote && newNote.trim() !== '') {
        return text.replace(oldNote, newNote);
      } else {
        text = text.replace(oldNote, '');
        text = text
          .replace(/\s*/g, '')
          .replace(/,\s*,/g, ',')
          .replace(/^\s*[,]\s*/, '')
          .replace(/\s*[,]\s*$/, '')
          .trim();
        return text;
      }
    }

    // 2. If newNote is provided and not already in text
    if (newNote && newNote.trim() !== '' && !text.includes(newNote)) {
      const cleanNewNote = newNote.trim();
      if (!text || text.trim() === '') {
        return cleanNewNote;
      }
      const cleanText = text.trim();
      if (cleanText.endsWith('') || cleanText.endsWith(',')) {
        return `${cleanText} ${cleanNewNote}`;
      }
      return `${cleanText} ${cleanNewNote}`;
    }

    return text;
  };

  // Auto-append shipping method notes to invoice description with comma separation
  useEffect(() => {
    if (!showForm) return;
    const sm = selectedShippingMethod ? shippingMethods.find(m => m.id === selectedShippingMethod) : null;
    const newNote = (sm && sm.note && sm.note.trim() !== '') ? sm.note.trim() : '';

    if (lastShippingNoteRef.current !== newNote) {
      const oldNote = lastShippingNoteRef.current;
      setDesc(prev => updateAutoNoteInDesc(prev, oldNote, newNote));
      lastShippingNoteRef.current = newNote;
    }
  }, [selectedShippingMethod, showForm, shippingMethods]);

  // Precise row total calculation helper
  const calcRowTotal = (qty: any, unitPrice: any): number => {
    const q = typeof qty === 'number' ? (isNaN(qty) ? 0 : qty) : parsePersianAmount(qty);
    const p = typeof unitPrice === 'number' ? (isNaN(unitPrice) ? 0 : unitPrice) : parsePersianAmount(unitPrice);
    return Math.round(q * p);
  };

  // Subtotal calculation for form
  const formSubtotal = gridRows.reduce((sum, r) => sum + calcRowTotal(r.qty, r.unitPrice), 0);

  // Auto-calculate discount amount and sync auto discount note in description
  useEffect(() => {
    if (!showForm) return;

    let calcDiscount = 0;
    let newNote = '';

    if (discountValue > 0) {
      if (discountType === 'percent') {
        calcDiscount = Math.round((formSubtotal * discountValue) / 100);
        newNote = `تخفیف ویژه ${toPersianDigits(discountValue)}٪ (${formatCurrency(calcDiscount)})`;
      } else {
        calcDiscount = discountValue;
        newNote = `تخفیف ویژه ${formatCurrency(calcDiscount)}`;
      }
    } else {
      calcDiscount = 0;
      newNote = '';
    }

    setDiscount(calcDiscount);

    if (lastDiscountNoteRef.current !== newNote) {
      const oldNote = lastDiscountNoteRef.current;
      setDesc(prev => updateAutoNoteInDesc(prev, oldNote, newNote));
      lastDiscountNoteRef.current = newNote;
    }
  }, [discountType, discountValue, formSubtotal, showForm, currencyLabel]);

  // Helper to apply selected item to grid row
  const applySelectedItemToRow = (idx: number, selectedItem: WarehouseItem) => {
    const updated = [...gridRows];
    const itemPrice = activeType === 'sale' 
      ? (selectedItem.lastSalePrice || 0) 
      : (selectedItem.lastPurchasePrice || 0);

    const validColor = hasValidColor(selectedItem.color) ? selectedItem.color.trim() : undefined;
    const formattedName = formatItemNameWithColor(selectedItem.name, validColor);

    // Get category note if configured for this category and assign to remarks column
    const catNote = getCategoryNoteForItem(selectedItem);

    updated[idx] = {
      ...updated[idx],
      itemId: selectedItem.id,
      name: formattedName,
      color: validColor,
      unitPrice: itemPrice,
      basePrice: itemPrice,
      categoryName: selectedItem.categoryName,
      commissionPercent: selectedItem.commissionPercent,
      remarks: catNote || updated[idx].remarks || ''
    };
    setGridRows(updated);
    setActiveSearchIdx(null);

    // Automatically focus on the quantity field
    setTimeout(() => {
      const qtyElem = document.getElementById(`qty-${idx}`);
      if (qtyElem) {
        qtyElem.focus();
      }
    }, 50);
  };

  // Handle autocomplete row selection
  const handleSelectAutocompleteItem = (idx: number, selectedItem: WarehouseItem) => {
    const isGood = selectedItem.type === 'kala' || selectedItem.type === 'consumables' || !selectedItem.type;
    if (activeType === 'sale' && isGood && selectedItem.qty <= 0) {
      setActiveSearchIdx(null);
      setZeroStockPopup({
        isOpen: true,
        rowIdx: idx,
        item: selectedItem
      });
      return;
    }
    applySelectedItemToRow(idx, selectedItem);
  };

  // Handle category suggestion selection from autocomplete dropdown
  const handleSelectCategorySuggestion = (idx: number, cat: { parent: string; sub: string; final: string; type?: 'kala' | 'khadamat' | 'consumables'; note?: string }) => {
    // 1. Look for existing items under this category or with the same name
    const matchedItem = items.find(it => {
      const itName = it.name.trim().toLowerCase();
      const itCat = (it.categoryName || '').trim().toLowerCase();
      const target = cat.final.trim().toLowerCase();
      return itName === target || itCat === target;
    });

    if (matchedItem) {
      handleSelectAutocompleteItem(idx, matchedItem);
      return;
    }

    // 2. Create new item in warehouse and apply to row
    const catType = cat.type || (cat.parent.includes('مصرفی') || cat.final.includes('مصرفی') || cat.final.includes('ملزوماتاست') ? 'consumables' : 'kala');
    const prefix = catType === 'kala' ? 'KA-' : (catType === 'consumables' ? 'MT-' : 'KHT-');
    let maxNum = 0;
    items.forEach(it => {
      if (it.type === catType) {
        const match = it.id.match(/\d+$/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    });
    const generatedId = `${prefix}${maxNum + 1}`;
    const newItem: WarehouseItem = {
      id: generatedId,
      name: cat.final,
      type: catType,
      color: '',
      qty: 0,
      initialQty: 0,
      unit: 'عدد',
      categoryName: cat.final,
      parentCategory: cat.parent,
      subCategory: cat.sub,
      setupDate: new Date().toLocaleDateString('fa-IR'),
      lastPurchasePrice: 0,
      lastSalePrice: 0
    };

    if (onAddItem) {
      onAddItem(newItem);
    }

    applySelectedItemToRow(idx, newItem);
  };

  const handleConfirmZeroStockSale = () => {
    if (zeroStockPopup.item && zeroStockPopup.rowIdx !== -1) {
      applySelectedItemToRow(zeroStockPopup.rowIdx, zeroStockPopup.item);
    }
    setZeroStockPopup({ isOpen: false, rowIdx: -1, item: null });
  };

  const handleCancelZeroStockSale = () => {
    if (zeroStockPopup.rowIdx !== -1) {
      const updated = [...gridRows];
      if (!updated[zeroStockPopup.rowIdx]?.itemId) {
        updated[zeroStockPopup.rowIdx] = {
          ...updated[zeroStockPopup.rowIdx],
          name: '',
          color: undefined,
          unitPrice: 0
        };
        setGridRows(updated);
      }
    }
    setZeroStockPopup({ isOpen: false, rowIdx: -1, item: null });
  };

  // Update specific field in row
  const updateRowField = (idx: number, field: string, value: any) => {
    const updated = [...gridRows];
    updated[idx] = {
      ...updated[idx],
      [field]: value
    };
    if (field === 'name') {
      const inputStr = String(value).trim().toLowerCase();
      const foundItem = items.find(it => {
        const baseName = it.name.trim().toLowerCase();
        const fullNameWithColor = formatItemNameWithColor(it.name, it.color).trim().toLowerCase();
        return baseName === inputStr || fullNameWithColor === inputStr;
      });
      if (foundItem) {
        const isGood = foundItem.type === 'kala' || foundItem.type === 'consumables' || !foundItem.type;
        if (activeType === 'sale' && isGood && foundItem.qty <= 0 && updated[idx].itemId !== foundItem.id) {
          setZeroStockPopup({
            isOpen: true,
            rowIdx: idx,
            item: foundItem
          });
          setGridRows(updated);
          return;
        }
        updated[idx].itemId = foundItem.id;
        const validColor = hasValidColor(foundItem.color) ? foundItem.color.trim() : undefined;
        updated[idx].color = validColor;
        updated[idx].name = formatItemNameWithColor(foundItem.name, validColor);
        const itemPrice = activeType === 'sale' ? (foundItem.lastSalePrice || 0) : (foundItem.lastPurchasePrice || 0);
        updated[idx].basePrice = itemPrice;
        if (!updated[idx].unitPrice) {
          updated[idx].unitPrice = itemPrice;
        }
        const catNote = getCategoryNoteForItem(foundItem);
        if (catNote && !updated[idx].remarks) {
          updated[idx].remarks = catNote;
        }
      } else {
        updated[idx].color = undefined;
      }
    }
    setGridRows(updated);
  };

  // Remove row
  const handleRemoveRow = (idx: number) => {
    if (gridRows.length > 1) {
      setGridRows(gridRows.filter((_, i) => i !== idx));
    }
  };

  // Confirm row move to new position
  const handleConfirmMoveRow = () => {
    if (moveRowModalIndex === null) return;
    const targetNum = parseInt(toEnglishDigits(targetRowNumberInput), 10);
    if (!isNaN(targetNum) && targetNum >= 1 && targetNum <= gridRows.length) {
      const fromIdx = moveRowModalIndex;
      const toIdx = targetNum - 1;
      if (fromIdx !== toIdx) {
        setGridRows(prev => {
          const next = [...prev];
          const [movedRow] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, movedRow);
          return next;
        });
      }
    }
    setMoveRowModalIndex(null);
    setTargetRowNumberInput('');
  };

  // Calculation parameters
  const subtotal = gridRows.reduce((sum, row) => sum + calcRowTotal(row.qty, row.unitPrice), 0);
  const totalGridQty = gridRows.reduce((sum, row) => sum + (typeof row.qty === 'number' ? (isNaN(row.qty) ? 0 : row.qty) : (parsePersianAmount(row.qty) || 0)), 0);
  const totalPayable = Math.max(0, subtotal + tax - discount);
  const finalTotal = Math.max(0, totalPayable - deposit);

  // Safe delete pro-forma invoice
  const handleDeleteProforma = (id: string, number: string) => {
    const hasConfirmed = window.confirm(`آیا از حذف پیش‌فاکتور شماره ${number} اطمینان دارید؟`);
    if (hasConfirmed) {
      onDeleteInvoice(id);
    }
  };

  // Role Access Levels:
  // - Sellers: View proformas and invoices created by themselves.
  // - Accountant & Admin: View all invoices.
  const filteredInvoices = invoices.filter(inv => {
    if (currentUser?.role === 'seller') {
      return (currentUser.id && inv.createdById === currentUser.id) || (currentUser.name && inv.createdBy === currentUser.name);
    }
    return true;
  });

  // Category Tabs filtering and time filtering and sorting
  const displayedInvoices = filteredInvoices.filter(inv => {
    if (archiveTab === 'deleted') {
      return inv.isDeleted === true;
    }
    if (inv.isDeleted) return false;

    if (archiveTab === 'all') return true;
    if (archiveTab === 'sale') return inv.type === 'sale' && !inv.isProforma;
    if (archiveTab === 'proforma') return inv.isProforma === true;
    if (archiveTab === 'purchase') return inv.type === 'purchase' && !inv.isProforma;
    return true;
  }).filter(inv => {
    const invParsed = parseJalaliDate(inv.date);
    if (!invParsed) return true;
    
    const invDays = jalaliToDays(invParsed);
    
    const startParsed = parseJalaliDate(archiveStartDate);
    if (startParsed) {
      const startDays = jalaliToDays(startParsed);
      if (invDays < startDays) return false;
    }
    
    const endParsed = parseJalaliDate(archiveEndDate);
    if (endParsed) {
      const endDays = jalaliToDays(endParsed);
      if (invDays > endDays) return false;
    }
    
    return true;
  }).filter(inv => {
    // 1. Filter by Counterpart (Name or Phone Number)
    if (archiveCounterpartSearch.trim()) {
      const term = archiveCounterpartSearch.trim().toLowerCase();
      const termEng = toEnglishDigits(term);

      const cName = (inv.counterpartName || '').toLowerCase();
      const cPhone = (inv.counterpartPhone || '').toLowerCase();
      const cPhoneEng = toEnglishDigits(cPhone);

      const matchesName = cName.includes(term) || (termEng && cName.includes(termEng));
      const matchesPhone = cPhone.includes(term) || (termEng && cPhoneEng.includes(termEng));

      if (!matchesName && !matchesPhone) {
        return false;
      }
    }

    // 2. Filter by Products and Services (Item Name, Remarks, Color, Unit, Type)
    if (archiveProductSearch.trim()) {
      const pTerm = archiveProductSearch.trim().toLowerCase();
      const pTermEng = toEnglishDigits(pTerm);

      const hasMatchingItem = inv.items && inv.items.some(item => {
        const itemName = (item.name || '').toLowerCase();
        const itemRemarks = (item.remarks || '').toLowerCase();
        const itemColor = (item.color || '').toLowerCase();
        const itemUnit = (item.unit || '').toLowerCase();

        return itemName.includes(pTerm) || 
               itemRemarks.includes(pTerm) || 
               itemColor.includes(pTerm) ||
               itemUnit.includes(pTerm) ||
               (pTermEng && itemName.includes(pTermEng));
      });

      if (!hasMatchingItem) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    // 1. Sort by Jalali date descending (newest date on top)
    const parsedA = parseJalaliDate(a.date);
    const parsedB = parseJalaliDate(b.date);
    const daysA = parsedA ? jalaliToDays(parsedA) : 0;
    const daysB = parsedB ? jalaliToDays(parsedB) : 0;
    if (daysA !== daysB) return daysB - daysA;

    // 2. Sort by Invoice Number descending (extract full numeric sequence)
    const rawNumA = toEnglishDigits(String(a.invoiceNumber || '')).replace(/\D+/g, '');
    const rawNumB = toEnglishDigits(String(b.invoiceNumber || '')).replace(/\D+/g, '');
    const numA = rawNumA ? Number(rawNumA) : 0;
    const numB = rawNumB ? Number(rawNumB) : 0;
    if (numA !== numB) return numB - numA;

    // 3. Sort by Creation Timestamp extracted from ID if available
    const tsA = toEnglishDigits(String(a.id || '')).match(/\d+/g)?.join('');
    const tsB = toEnglishDigits(String(b.id || '')).match(/\d+/g)?.join('');
    const numTsA = tsA ? Number(tsA) : 0;
    const numTsB = tsB ? Number(tsB) : 0;
    if (numTsA !== numTsB) return numTsB - numTsA;

    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  const [archivePage, setArchivePage] = useState(1);
  const [archivePageSize, setArchivePageSize] = useState(15);

  // Batch Deletion States in Archive
  const [selectedArchiveInvIds, setSelectedArchiveInvIds] = useState<string[]>([]);
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);
  const [batchDeleteTarget, setBatchDeleteTarget] = useState<'selected' | 'all_filtered'>('selected');
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  useEffect(() => {
    setArchivePage(1);
    setSelectedArchiveInvIds([]);
  }, [archiveTab, activeQuickFilter, archiveStartDate, archiveEndDate, archiveCounterpartSearch, archiveProductSearch]);

  const handleToggleSelectOneArchive = (id: string) => {
    setSelectedArchiveInvIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllArchive = () => {
    if (displayedInvoices.length > 0 && selectedArchiveInvIds.length === displayedInvoices.length) {
      setSelectedArchiveInvIds([]);
    } else {
      setSelectedArchiveInvIds(displayedInvoices.map(i => i.id));
    }
  };

  const targetBatchInvoices = useMemo(() => {
    if (batchDeleteTarget === 'all_filtered') {
      return displayedInvoices;
    }
    const idSet = new Set(selectedArchiveInvIds);
    return displayedInvoices.filter(i => idSet.has(i.id));
  }, [batchDeleteTarget, selectedArchiveInvIds, displayedInvoices]);

  const targetBatchTotalAmount = useMemo(() => {
    return targetBatchInvoices.reduce((sum, inv) => {
      const itemTotal = (inv.items || []).reduce((itemSum, it) => {
        const lineTot = it.totalPrice !== undefined && !isNaN(Number(it.totalPrice))
          ? Number(it.totalPrice)
          : calcRowTotal(it.qty, it.unitPrice);
        return itemSum + lineTot;
      }, 0);
      return sum + itemTotal + (Number(inv.tax) || 0) - (Number(inv.discount) || 0);
    }, 0);
  }, [targetBatchInvoices]);

  const handleConfirmBatchDeleteInvoices = async () => {
    if (targetBatchInvoices.length === 0) return;
    setIsBatchDeleting(true);
    try {
      const isPermanent = archiveTab === 'deleted' && currentUser.role === 'admin';
      const targetIds = targetBatchInvoices.map(i => i.id);

      if (isPermanent) {
        if (onBatchPermanentDeleteInvoices) {
          await onBatchPermanentDeleteInvoices(targetIds);
        } else {
          for (const id of targetIds) {
            if (onPermanentDeleteInvoice) await onPermanentDeleteInvoice(id);
            else await onDeleteInvoice(id);
          }
        }
      } else {
        if (onBatchDeleteInvoices) {
          await onBatchDeleteInvoices(targetIds);
        } else {
          for (const id of targetIds) {
            await onDeleteInvoice(id);
          }
        }
      }

      setSelectedArchiveInvIds([]);
      setBatchDeleteModalOpen(false);
    } catch (err) {
      console.error('Batch delete error:', err);
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const totalArchivePages = Math.ceil(displayedInvoices.length / archivePageSize) || 1;
  const paginatedInvoices = displayedInvoices.slice((archivePage - 1) * archivePageSize, archivePage * archivePageSize);

  // Normalize cloned DOM tree for html2canvas (fixes Tailwind v4 oklch colors & offscreen layout)
  const processCloneForCapture = (clonedDoc: Document, clonedEl: HTMLElement) => {
    // 1. Reset positioning & styles on cloned element & ancestors inside clonedDoc
    clonedEl.style.position = 'relative';
    clonedEl.style.left = '0';
    clonedEl.style.top = '0';
    clonedEl.style.transform = 'none';
    clonedEl.style.opacity = '1';
    clonedEl.style.visibility = 'visible';
    clonedEl.style.display = 'block';
    clonedEl.style.margin = '0';
    clonedEl.style.boxShadow = 'none';
    clonedEl.style.backgroundColor = '#ffffff';

    let current: HTMLElement | null = clonedEl.parentElement;
    while (current && current !== clonedDoc.body) {
      current.style.position = 'relative';
      current.style.left = '0';
      current.style.top = '0';
      current.style.transform = 'none';
      current.style.opacity = '1';
      current.style.visibility = 'visible';
      current.style.display = 'block';
      current = current.parentElement;
    }

    // 2. Normalize colors (convert oklch/lab/color-mix to standard rgb/hex using Canvas 2D)
    const canvasCtx = document.createElement('canvas').getContext('2d');
    if (canvasCtx) {
      const propsToNormalize = [
        'color',
        'background-color',
        'border-color',
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
        'outline-color',
        'fill',
        'stroke'
      ];

      const convertColor = (val: string) => {
        if (!val || (!val.includes('oklch') && !val.includes('lab') && !val.includes('color(') && !val.includes('color-mix'))) {
          return null;
        }
        try {
          canvasCtx.fillStyle = '#000000';
          canvasCtx.fillStyle = val;
          const res = canvasCtx.fillStyle;
          return res || null;
        } catch {
          return null;
        }
      };

      const allNodes = [clonedEl, ...Array.from(clonedEl.querySelectorAll('*'))];
      for (const node of allNodes) {
        if (node instanceof HTMLElement || node instanceof SVGElement) {
          try {
            const computed = window.getComputedStyle(node);
            for (const prop of propsToNormalize) {
              const val = computed.getPropertyValue(prop);
              const normalized = convertColor(val);
              if (normalized) {
                const camelProp = prop.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                (node.style as any)[camelProp] = normalized;
              }
            }
          } catch (e) {
            // ignore single element style error
          }
        }
      }
    }

    // 3. Ensure .print-doc-status-white elements become completely white (text, border, background) in html2canvas captures
    const docStatusNodes = clonedEl.querySelectorAll('.print-doc-status-white, .print-doc-status-white *');
    docStatusNodes.forEach((node) => {
      if (node instanceof HTMLElement || node instanceof SVGElement) {
        node.style.color = '#ffffff';
        node.style.backgroundColor = '#ffffff';
        node.style.borderColor = '#ffffff';
        node.style.boxShadow = 'none';
      }
    });

    // 4. Ensure crossOrigin & referrerPolicy on images
    const images = clonedEl.querySelectorAll('img');
    images.forEach((img) => {
      img.setAttribute('crossOrigin', 'anonymous');
      img.setAttribute('referrerPolicy', 'no-referrer');
    });
  };

  // Fallback SVG foreignObject canvas renderer
  const renderElementViaSvgFallback = async (targetEl: HTMLElement): Promise<HTMLCanvasElement> => {
    const width = targetEl.offsetWidth || 800;
    const height = targetEl.offsetHeight || 1120;

    const clone = targetEl.cloneNode(true) as HTMLElement;
    clone.style.margin = '0';
    clone.style.backgroundColor = '#ffffff';
    clone.style.position = 'relative';
    clone.style.left = '0';
    clone.style.top = '0';

    const wrapper = document.createElement('div');
    wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrapper.appendChild(clone);

    const htmlContent = new XMLSerializer().serializeToString(wrapper);
    const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; background-color: #ffffff; }
          .print-doc-status-white, .print-doc-status-white * { color: #ffffff !important; background-color: #ffffff !important; border-color: #ffffff !important; box-shadow: none !important; }
        </style>
        ${htmlContent}
      </foreignObject>
    </svg>`;

    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(2, 2);
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve(canvas);
        } else {
          URL.revokeObjectURL(url);
          reject(new Error('Canvas context error'));
        }
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  };

  const handleCopyInvoiceImage = async (elementId: string) => {
    let element = document.getElementById(elementId);
    if (!element) {
      element = document.getElementById('invoice-live-preview-box') || 
                document.getElementById('invoice-offscreen-preview-container') ||
                document.getElementById('invoice-print-area');
    }

    if (!element) {
      alert('خطا: پیش‌فاکتور فاکتور جهت ایجاد تصویر است شده.');
      return;
    }

    try {
      let canvas: HTMLCanvasElement | null = null;
      
      const captureOptions = {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 10000,
        onclone: (clonedDoc: Document, clonedEl: HTMLElement) => {
          processCloneForCapture(clonedDoc, clonedEl);
        }
      };

      try {
        canvas = await html2canvas(element, captureOptions);
      } catch (tier1Err) {
        console.warn('Tier 1 html2canvas failed, retrying with scale 1:', tier1Err);
        try {
          canvas = await html2canvas(element, { ...captureOptions, scale: 1 });
        } catch (tier2Err) {
          console.warn('Tier 2 html2canvas failed, trying SVG fallback:', tier2Err);
          try {
            canvas = await renderElementViaSvgFallback(element);
          } catch (tier3Err) {
            console.error('All image capture methods failed:', tier3Err);
            alert('خطا در تبدیل فاکتور به تصویر. لطفاً از مرورگر استاندارد استفاده کنید.');
            return;
          }
        }
      }

      if (!canvas) {
        alert('خطا در پردازش تصویر فاکتور.');
        return;
      }

      const dataUrl = canvas.toDataURL('image/png');
      let copiedSuccessfully = false;

      // Try direct Clipboard write (Works seamlessly in Chrome over HTTPS/localhost or supported clipboard permissions)
      if (typeof window !== 'undefined' && typeof ClipboardItem !== 'undefined' && navigator?.clipboard?.write) {
        try {
          const blobPromise = new Promise<Blob>((resolve, reject) => {
            canvas!.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('خطا در تبدیل تصویر فاکتور'));
            }, 'image/png');
          });

          const item = new ClipboardItem({ 'image/png': blobPromise });
          await navigator.clipboard.write([item]);
          copiedSuccessfully = true;
          alert('تصویر فاکتور در کلیپ‌بورد کپی شد. می‌توانید در پیام‌رسان‌ها پیست (Paste) نمایید.');
        } catch (clipboardErr) {
          console.warn('Clipboard direct write blocked by browser permission policy:', clipboardErr);
        }
      }

      // If clipboard permission is blocked or unavailable, download file and open modal preview
      if (!copiedSuccessfully) {
        try {
          const link = document.createElement('a');
          link.download = `فاکتور_${Date.now()}.png`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (e) {
          console.error('Download trigger error:', e);
        }

        setGeneratedImageModalUrl(dataUrl);
      }
    } catch (err) {
      console.error('Html2canvas capture process error:', err);
      alert('خطا در تبدیل فاکتور به تصویر.');
    }
  };

  const getDynamicScaleStyles = (size: string, rowCount: number) => {
    const isA5 = size.startsWith('A5');

    // Fixed section font sizes (increased for high readability & strictly independent of rowCount)
    const fixed = isA5 ? {
      metaText: 'text-[9.5px]',
      headerText: 'text-sm',
      badgeText: 'text-[8.5px]',
      buyerBarPadding: 'p-1.5 px-2.5 text-[9.5px]',
      summaryText: 'text-[9.5px]',
      totalText: 'text-[11px]',
      signatureText: 'text-[9.5px]',
      footerText: 'text-[9px]',
    } : {
      metaText: 'text-[10.5px]',
      headerText: 'text-base',
      badgeText: 'text-[9px]',
      buyerBarPadding: 'p-2 px-3 text-[10.5px]',
      summaryText: 'text-[10.5px]',
      totalText: 'text-xs',
      signatureText: 'text-[10.5px]',
      footerText: 'text-[10px]',
    };

    // ONLY table rows text & cell paddings scale dynamically based on rowCount
    let tableText = 'text-xs';
    let cellPadding = 'py-2 px-3';
    let headerPadding = 'py-2 px-3';
    let signatureGap = 'pt-4';
    let footerGap = 'mt-3 pt-2';
    let spacing = 'space-y-2.5';

    if (size === 'A5_landscape') {
      if (rowCount > 13) {
        tableText = 'text-[7.5px]';
        cellPadding = 'py-0.5 px-0.75';
        headerPadding = 'py-0.5 px-0.75';
        signatureGap = 'pt-0.5';
        footerGap = 'mt-0.5 pt-0.5';
        spacing = 'space-y-0.5';
      } else if (rowCount > 10) {
        tableText = 'text-[8px]';
        cellPadding = 'py-0.75 px-1';
        headerPadding = 'py-0.75 px-1';
        signatureGap = 'pt-1';
        footerGap = 'mt-0.5 pt-0.5';
        spacing = 'space-y-0.75';
      } else if (rowCount > 8) {
        tableText = 'text-[8.5px]';
        cellPadding = 'py-0.75 px-1';
        headerPadding = 'py-0.75 px-1';
        signatureGap = 'pt-1.25';
        footerGap = 'mt-1 pt-0.5';
        spacing = 'space-y-1';
      } else if (rowCount > 6) {
        // From Row 7 onwards: Smart shrinking activates automatically
        tableText = 'text-[9.5px]';
        cellPadding = 'py-1 px-1.25';
        headerPadding = 'py-1 px-1.25';
        signatureGap = 'pt-1.5';
        footerGap = 'mt-1 pt-0.5';
        spacing = 'space-y-1.25';
      } else {
        // Rows 1 to 6: Standard default initial font (10.5px) and padding
        tableText = 'text-[10.5px]';
        cellPadding = 'py-2 px-2';
        headerPadding = 'py-1.75 px-2';
        signatureGap = 'pt-3';
        footerGap = 'mt-2 pt-1';
        spacing = 'space-y-2';
      }
    } else if (size === 'A5_portrait') {
      if (rowCount > 13) {
        tableText = 'text-[8px]';
        cellPadding = 'py-0.5 px-1';
        headerPadding = 'py-0.5 px-1';
        signatureGap = 'pt-1';
        footerGap = 'mt-1 pt-0.5';
        spacing = 'space-y-1';
      } else if (rowCount > 10) {
        tableText = 'text-[8.5px]';
        cellPadding = 'py-0.75 px-1';
        headerPadding = 'py-0.75 px-1';
        signatureGap = 'pt-1.5';
        footerGap = 'mt-1 pt-0.5';
        spacing = 'space-y-1.25';
      } else if (rowCount > 7) {
        tableText = 'text-[9.5px]';
        cellPadding = 'py-1.25 px-1.5';
        headerPadding = 'py-1 px-1.5';
        signatureGap = 'pt-2';
        footerGap = 'mt-1.5 pt-1';
        spacing = 'space-y-1.5';
      } else {
        // 1 to 7 rows: Standard size
        tableText = 'text-[10.5px]';
        cellPadding = 'py-2 px-2';
        headerPadding = 'py-1.5 px-2';
        signatureGap = 'pt-3';
        footerGap = 'mt-2 pt-1';
        spacing = 'space-y-2';
      }
    } else if (size === 'A4_landscape') {
      if (rowCount > 12) {
        tableText = 'text-[8px]';
        cellPadding = 'py-0.5 px-1';
        headerPadding = 'py-0.5 px-1';
        signatureGap = 'pt-1';
        footerGap = 'mt-0.5 pt-0.5';
        spacing = 'space-y-0.5';
      } else if (rowCount > 9) {
        tableText = 'text-[9px]';
        cellPadding = 'py-1 px-1.5';
        headerPadding = 'py-0.75 px-1.5';
        signatureGap = 'pt-1.5';
        footerGap = 'mt-1 pt-0.5';
        spacing = 'space-y-1';
      } else if (rowCount > 6) {
        tableText = 'text-[10px]';
        cellPadding = 'py-1.75 px-2';
        headerPadding = 'py-1.5 px-2';
        signatureGap = 'pt-2.5';
        footerGap = 'mt-1.5 pt-1';
        spacing = 'space-y-1.5';
      } else {
        // 1 to 6 rows: Standard initial size
        tableText = 'text-[11px]';
        cellPadding = 'py-2.5 px-2.5';
        headerPadding = 'py-2 px-2.5';
        signatureGap = 'pt-3';
        footerGap = 'mt-2 pt-1';
        spacing = 'space-y-2';
      }
    } else { // A4_portrait
      if (rowCount > 16) {
        tableText = 'text-[8.5px]';
        cellPadding = 'py-0.5 px-1';
        headerPadding = 'py-0.5 px-1';
        signatureGap = 'pt-1.5';
        footerGap = 'mt-1 pt-0.5';
        spacing = 'space-y-1';
      } else if (rowCount > 12) {
        tableText = 'text-[9px]';
        cellPadding = 'py-0.75 px-1.5';
        headerPadding = 'py-0.75 px-1.5';
        signatureGap = 'pt-2';
        footerGap = 'mt-1.5 pt-1';
        spacing = 'space-y-1.25';
      } else if (rowCount > 8) {
        tableText = 'text-[10.5px]';
        cellPadding = 'py-1.5 px-2';
        headerPadding = 'py-1.25 px-2';
        signatureGap = 'pt-3';
        footerGap = 'mt-2.5 pt-1.5';
        spacing = 'space-y-2';
      } else {
        // 1 to 8 rows: Standard initial size
        tableText = 'text-[11.5px]';
        cellPadding = 'py-2.5 px-3';
        headerPadding = 'py-2 px-3';
        signatureGap = 'pt-4';
        footerGap = 'mt-3 pt-2';
        spacing = 'space-y-2.5';
      }
    }

    return {
      fixed,
      tableText,
      cellPadding,
      headerPadding,
      signatureGap,
      footerGap,
      spacing,
    };
  };

  const getPaperContainerClasses = (size: string, rowCount: number = 1, isPrintable: boolean = true) => {
    const isA5 = size.startsWith('A5');
    const isLandscape = size.endsWith('landscape');
    
    let baseWidth = 'w-[210mm] max-w-full';
    let aspectClass = 'aspect-[210/297]';
    
    if (size === 'A4_landscape') {
      baseWidth = 'w-[297mm] max-w-full';
      aspectClass = 'aspect-[297/210]';
    } else if (size === 'A5_portrait') {
      baseWidth = 'w-[148mm] max-w-full';
      aspectClass = 'aspect-[148/210]';
    } else if (size === 'A5_landscape') {
      baseWidth = 'w-[210mm] max-w-full';
      aspectClass = 'aspect-[210/148]';
    }

    let padding = isA5 ? (isLandscape ? 'p-2.5' : 'p-3') : (isLandscape ? 'p-4' : 'p-4.5');
    if (rowCount > 6 && isA5) padding = 'p-2';
    if (rowCount > 10 && !isA5) padding = 'p-3';

    const dyn = getDynamicScaleStyles(size, rowCount);
    const hasBgImage = !!paperBgImages[size];
    const bgClass = hasBgImage ? 'has-bg-template bg-transparent' : 'bg-white';
    const printClass = isPrintable ? 'printable-area' : 'non-printable-preview';

    return `${baseWidth} ${aspectClass} mx-auto ${padding} border border-slate-300 rounded-2xl shadow-inner font-sans flex flex-col ${dyn.spacing} ${printClass} text-right ${bgClass} text-slate-800 transition-all shrink-0 box-border overflow-hidden relative`;
  };

  const getPrintPageStyle = (size: string) => {
    let pageWidth = '210mm';
    let pageHeight = '297mm';
    let printPadding = '2mm';
    let pageSizeCss = 'A4 portrait';

    if (size === 'A4_landscape') {
      pageWidth = '297mm';
      pageHeight = '210mm';
      printPadding = '2mm';
      pageSizeCss = 'A4 landscape';
    } else if (size === 'A5_portrait') {
      pageWidth = '148mm';
      pageHeight = '210mm';
      printPadding = '1.5mm';
      pageSizeCss = 'A5 portrait';
    } else if (size === 'A5_landscape') {
      pageWidth = '210mm';
      pageHeight = '148mm';
      printPadding = '1.5mm';
      pageSizeCss = 'A5 landscape';
    }

    const hasBg = !!paperBgImages[size];
    if (hasBg) {
      printPadding = '0mm';
    }

    return `@media print { 
      @page { 
        size: ${pageSizeCss}; 
        margin: 0mm !important; 
      } 
      
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        backdrop-filter: none !important;
        filter: none !important;
        animation: none !important;
        transition: none !important;
      }

      html, body { 
        background: #ffffff !important; 
        color: #000000 !important; 
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      } 

      /* Hide non-printable elements completely to prevent extra blank pages */
      .no-print,
      header,
      aside,
      nav,
      footer,
      [aria-hidden="true"],
      #invoice-offscreen-preview-container,
      #invoice-offscreen-preview-container *,
      .non-printable-preview,
      .non-printable-preview * {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        width: 0 !important;
        overflow: hidden !important;
      }

      /* Reset modal container constraints for printing */
      #root,
      #dialog-print-invoice,
      #dialog-live-preview-invoice,
      .fixed,
      .backdrop-blur-sm,
      [class*="animate-"] {
        position: static !important;
        display: block !important;
        background: transparent !important;
        backdrop-filter: none !important;
        filter: none !important;
        transform: none !important;
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
        margin: 0 !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
      }

      /* Hide general body contents except printable area */
      body * {
        visibility: hidden !important;
      }

      .printable-area, 
      .printable-area *,
      .dark .printable-area,
      .dark .printable-area * { 
        visibility: visible !important; 
      }

      .printable-area, 
      .dark .printable-area { 
        position: fixed !important; 
        top: 0 !important; 
        left: 0 !important; 
        right: 0 !important;
        bottom: 0 !important;
        margin: auto !important;
        width: ${pageWidth} !important; 
        height: ${pageHeight} !important; 
        max-width: 100% !important; 
        max-height: 100% !important; 
        box-sizing: border-box !important;
        padding: ${printPadding} !important;
        padding-top: calc(${printPadding} + ${printExtraTopMarginMm}mm) !important;
        padding-left: calc(${printPadding} + ${printExtraSideMarginMm}mm) !important;
        padding-right: calc(${printPadding} + ${printExtraSideMarginMm}mm) !important;
        border: none !important; 
        box-shadow: none !important; 
        border-radius: 0 !important; 
        background: #ffffff !important;
        color: #000000 !important;
        overflow: hidden !important;
        page-break-after: avoid !important;
        page-break-before: avoid !important;
        page-break-inside: avoid !important;
        break-after: avoid !important;
        break-before: avoid !important;
        break-inside: avoid !important;
        z-index: 9999999 !important;
      } 

      .printable-area ~ .printable-area,
      .printable-area:not(:first-of-type) {
        display: none !important;
        visibility: hidden !important;
      }

      /* Hide invoice title text ("فاکتور رسمی کالا و خدمات") in print per user request */
      .print-title-hidden,
      .printable-area .print-title-hidden,
      .dark .printable-area .print-title-hidden {
        color: transparent !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }

      /* Make "وضعیت فاکتور" completely white (text, background, border) in print per user request while preserving layout structure */
      .print-doc-status-white,
      .printable-area .print-doc-status-white,
      .printable-area .print-doc-status-white *,
      .dark .printable-area .print-doc-status-white,
      .dark .printable-area .print-doc-status-white * {
        color: #ffffff !important;
        background-color: #ffffff !important;
        background: #ffffff !important;
        border-color: #ffffff !important;
        box-shadow: none !important;
        outline-color: #ffffff !important;
        visibility: visible !important;
        opacity: 1 !important;
      }

      .printable-area .bg-black,
      .dark .printable-area .bg-black {
        background-color: #000000 !important;
        color: #ffffff !important;
      }

      .printable-area .text-white,
      .dark .printable-area .text-white {
        color: #ffffff !important;
      }

      .printable-area table {
        border-collapse: collapse !important;
        width: 100% !important;
        table-layout: auto !important;
      }

      .printable-area th, 
      .printable-area td,
      .dark .printable-area th,
      .dark .printable-area td {
        border-color: #000000 !important;
      }
    }`;
  };

  const renderA4PreviewContent = (containerId: string, customInv?: Invoice | null) => {
    const sellerName = getStoredSellerName();
    const sellerRegNo = getStoredSellerRegNo();
    const sellerAddress = getStoredSellerAddress();

    const creatorUser = customInv 
      ? (users && users.find(u => u.id === customInv.createdById || u.name === customInv.createdBy || u.username === customInv.createdBy)) 
      : currentUser;

    const activeSellerPhone = customInv?.createdByPhone 
      || creatorUser?.phone 
      || currentUser?.phone 
      || getStoredSellerPhone();

    const invNumber = customInv ? customInv.invoiceNumber : 'PF-PREVIEW';
    const invDate = customInv ? customInv.date : date;
    const isProformaDoc = customInv ? customInv.isProforma : (activeType === 'sale');
    const isPurchase = customInv ? (customInv.type === 'purchase') : (activeType === 'purchase');

    const docStatusText = customInv
      ? (customInv.isProforma ? 'پیش‌فاکتور' : 'فاکتور رسمی')
      : 'ثبت نشده';
    const docStatusBadgeClass = customInv
      ? (customInv.isProforma ? 'text-amber-600 bg-amber-50 border-amber-200/40' : 'text-emerald-700 bg-emerald-50 border-emerald-200/40')
      : 'text-amber-600 bg-amber-50 border-amber-200/40';

    const titleText = isPurchase
      ? 'فاکتور خرید'
      : (isProformaDoc ? 'پیش‌فاکتور' : 'فاکتور رسمی کالا و خدمات');

    const badgeText = customInv
      ? (customInv.isProforma ? 'پیش‌فاکتور' : 'فاکتور رسمی')
      : 'صورتحساب - پیش‌فاکتور';

    const cpName = customInv ? customInv.counterpartName : counterpartName;
    const cpPhone = customInv ? customInv.counterpartPhone : counterpartPhone;

    const iconsList = customInv
      ? (customInv.customIcons || (customInv as any).selectedCustomIcons || [])
      : selectedCustomIcons;

    const shippingId = customInv
      ? (customInv.shippingMethod || (customInv as any).selectedShippingMethod)
      : selectedShippingMethod;

    const activeRows = customInv
      ? customInv.items.map(item => ({
          name: item.name,
          qty: typeof item.qty === 'number' ? (isNaN(item.qty) ? 0 : item.qty) : (parsePersianAmount(item.qty) || 0),
          unitPrice: typeof item.unitPrice === 'number' ? (isNaN(item.unitPrice) ? 0 : item.unitPrice) : (parsePersianAmount(item.unitPrice) || 0),
          totalPrice: (item.totalPrice !== undefined && !isNaN(Number(item.totalPrice)))
            ? Number(item.totalPrice)
            : calcRowTotal(item.qty, item.unitPrice),
          remarks: item.remarks || ''
        }))
      : gridRows.filter(row => (row.name && row.name.trim() !== '') || (Number(row.qty) > 0 && Number(row.unitPrice) > 0)).map(row => ({
          name: row.name,
          qty: typeof row.qty === 'number' ? (isNaN(row.qty) ? 0 : row.qty) : (parsePersianAmount(row.qty) || 0),
          unitPrice: typeof row.unitPrice === 'number' ? (isNaN(row.unitPrice) ? 0 : row.unitPrice) : (parsePersianAmount(row.unitPrice) || 0),
          totalPrice: calcRowTotal(row.qty, row.unitPrice),
          remarks: row.remarks || ''
        }));

    const rowCount = activeRows.length;
    const dyn = getDynamicScaleStyles(paperSize, rowCount);

    const calcSubtotal = customInv
      ? activeRows.reduce((s, x) => s + (x.totalPrice || calcRowTotal(x.qty, x.unitPrice)), 0)
      : subtotal;
    const calcTax = customInv ? (Number(customInv.tax) || 0) : tax;
    const calcDiscount = customInv ? (Number(customInv.discount) || 0) : discount;
    const calcDeposit = customInv ? (Number(customInv.deposit) || 0) : deposit;
    const calcFinalTotal = Math.max(0, calcSubtotal + calcTax - calcDiscount - calcDeposit);
    const calcDesc = customInv ? (customInv.description || '') : desc;
    const creatorName = customInv ? (customInv.createdBy || currentUser?.name || '') : (currentUser?.name || '');
    const attachments = customInv ? customInv.attachments : undefined;

    const currentBgImage = paperBgImages[paperSize];

    const isPrintableTarget = showPrintModal
      ? (containerId === 'invoice-print-area')
      : (showLivePreview ? containerId === 'invoice-live-preview-box' : containerId === 'invoice-print-area');

    return (
      <div 
        id={containerId} 
        className={getPaperContainerClasses(paperSize, rowCount, isPrintableTarget)} 
        dir="rtl"
      >
        <style>{getPrintPageStyle(paperSize)}</style>

        {/* Background Raw Paper Image Template Layer (Screen Preview Only - Excluded in Physical Print) */}
        {currentBgImage && (
          <div className="absolute inset-0 z-0 pointer-events-none no-print overflow-hidden flex items-center justify-center">
            <img 
              src={currentBgImage} 
              alt="تصویر فرم خام فاکتور" 
              className="w-full h-full object-fill opacity-100 select-none" 
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        <div className="relative z-10 flex flex-col justify-between h-full w-full">
        {/* Top Invoice Section (Header down to Remarks/Notes) shifted by topOffsetMm per user preference */}
        <div style={{ marginTop: `${topOffsetMm}mm` }} className="space-y-1">
          {/* Document Header */}
          <div className="grid grid-cols-3 gap-2 border-b-2 border-slate-900 pb-1.5 items-center">
            {/* Right Side: Temporary / Official Doc Metadata */}
            <div className={`text-right ${dyn.fixed.metaText} space-y-0.5 text-slate-950 font-bold`}>
              <div><span>{customInv ? 'کد فاکتور:' : 'شماره سند / فاکتور:'}</span> <span className="font-mono text-slate-950 font-black">{toPersianDigits(invNumber)}</span></div>
              <div><span>تاریخ صدور:</span> <span className="font-mono text-slate-950 font-black">{toPersianDigits(invDate)}</span></div>
              <div className="flex items-center gap-1 mt-0.5 print-doc-status-white">
                <span>وضعیت فاکتور:</span>
                <span className={`font-black px-1.5 py-0.5 rounded border ${docStatusBadgeClass} ${dyn.fixed.badgeText}`}>{docStatusText}</span>
              </div>
            </div>
            
            {/* Center Column: Invoice Title (White/Invisible in physical print per user request) */}
            <div className="text-center space-y-1">
              <h2 className={`${dyn.fixed.headerText} font-black tracking-wider text-slate-950 inline-block uppercase print-title-hidden`}>
                {titleText}
              </h2>
            </div>

            {/* Left Column: Empty */}
            <div className="w-full"></div>
          </div>

          {/* Compact Single-line Buyer Details & Shipping Method & Channel Icons */}
          <div className={`flex flex-row items-center justify-between gap-x-3 gap-y-1 bg-transparent ${dyn.fixed.buyerBarPadding} border border-slate-800 rounded-xl text-right`}>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              <span className="text-slate-950 font-black">نام طرف‌حساب / خریدار:</span>
              <div>
                <span className="font-black text-slate-950">{cpName || 'همینبر'}</span>
              </div>
              {cpPhone && (
                <div>
                  <span className="text-slate-900 font-bold">تماس:</span>{' '}
                  <span className="font-mono font-black text-slate-950">{toPersianDigits(cpPhone)}</span>
                </div>
              )}
              {/* Selected Channel/Contact Images (Icons) - No text label, placed right beside phone / buyer details */}
              {iconsList.length > 0 && (
                <div className="flex items-center gap-1 mr-1 bg-transparent px-1.5 py-0.5 rounded-full border border-slate-800 shadow-2xs">
                  {systemIcons.filter(icon => iconsList.includes(icon.id)).map(icon => (
                    <div key={icon.id} title={icon.name} className="w-3.5 h-3.5 rounded-full border border-slate-800 bg-transparent flex items-center justify-center relative overflow-hidden shrink-0">
                      {icon.iconData ? (
                        <img src={icon.iconData} alt={icon.name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-[6.5px] font-black text-slate-950">{icon.name ? icon.name[0] : 'آیا'}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-x-2 border-r border-slate-800 pr-3">
              <span className="text-slate-950 font-black shrink-0">روش ارسال:</span>
              {shippingId ? (
                shippingMethods.filter(sm => sm.id === shippingId).map(method => (
                  <div key={method.id} title={method.name} className="flex items-center gap-1 bg-transparent px-1.5 py-0.5 rounded-full border border-slate-800 shadow-2xs">
                    {method.iconData ? (
                      <img src={method.iconData} alt={method.name} className="w-3.5 h-3.5 object-cover rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-[7px] font-black text-slate-950">{method.name ? method.name[0] : 'از'}</span>
                    )}
                    <span className={`${dyn.fixed.badgeText} font-black text-slate-950`}>{method.name}</span>
                  </div>
                ))
              ) : (
                <span className={`text-slate-700 font-bold ${dyn.fixed.badgeText}`}>مثال: ۵</span>
              )}
            </div>
          </div>

          {/* Itemized Table */}
          <div className="overflow-x-auto print:overflow-visible my-0.5">
            <table className={`w-full text-right border-collapse border border-slate-800 ${dyn.tableText} text-slate-950`}>
              <thead className="bg-black text-white font-black border-b-2 border-slate-900">
                <tr>
                  <th className={`border border-white/90 ${dyn.headerPadding} text-center w-[4.2%] min-w-[28px] bg-black text-white`}>ردیف</th>
                  <th className={`border border-white/90 ${dyn.headerPadding} text-right w-[25.84%] bg-black text-white`}>نام کالا و خدماتا و خدمات</th>
                  <th className={`border border-white/90 ${dyn.headerPadding} text-center w-[4%] min-w-[28px] bg-black text-white`}>تعداد</th>
                  <th className={`border border-white/90 ${dyn.headerPadding} text-left w-[17.16%] bg-black text-white`}>قیمت واحد ({currencyLabel})</th>
                  <th className={`border border-white/90 ${dyn.headerPadding} text-left w-[17.86%] bg-black text-white`}>جمع کل ردیف ({currencyLabel})</th>
                  <th className={`border border-white/90 ${dyn.headerPadding} text-right w-[30.94%] bg-black text-white`}>توضیحات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {activeRows.map((line, idx) => {
                  const isEvenRow = idx % 2 === 1;
                  const opacityVal = (evenRowOpacity ?? 15) / 100;
                  const rowStyle = isEvenRow ? { backgroundColor: `rgba(0, 0, 0, ${opacityVal})` } : { backgroundColor: 'transparent' };
                  return (
                    <tr 
                      key={idx} 
                      style={rowStyle}
                    >
                      <td className={`border border-slate-800 ${dyn.cellPadding} text-center font-mono font-bold align-middle`}>{toPersianDigits(idx + 1)}</td>
                      <td className={`border border-slate-800 ${dyn.cellPadding} font-bold text-slate-950 text-right align-middle`}>{line.name}</td>
                      <td className={`border border-slate-800 ${dyn.cellPadding} text-center font-mono font-bold align-middle`}>{toPersianDigits(line.qty)}</td>
                      <td className={`border border-slate-800 ${dyn.cellPadding} text-left font-mono font-bold align-middle`}>{formatCurrency(line.unitPrice)}</td>
                      <td className={`border border-slate-800 ${dyn.cellPadding} text-left font-mono font-bold align-middle`}>{formatCurrency(line.totalPrice)}</td>
                      <td className={`border border-slate-800 ${dyn.cellPadding} text-slate-900 text-right align-middle`}>{line.remarks || '-'}</td>
                    </tr>
                  );
                })}
                
                {/* Compact Calculations breakdown */}
                <tr className={`bg-transparent font-bold text-slate-950 ${dyn.fixed.summaryText}`}>
                  <td colSpan={6} className="border border-slate-800 p-1.5">
                    <div className="grid grid-cols-4 text-center font-bold">
                      <div className="px-1">
                        <span className="text-slate-900">جمع ناخالص:</span>{' '}
                        <span className="font-mono text-slate-950 font-black">{formatCurrency(calcSubtotal)}</span>
                      </div>
                      <div className="px-1 border-r border-slate-800">
                        <span className="text-slate-900">مالیات (+):</span>{' '}
                        <span className="font-mono text-slate-950 font-black">{formatCurrency(calcTax)}</span>
                      </div>
                      <div className="px-1 border-r border-slate-800">
                        <span className="text-slate-900">تخفیف (-):</span>{' '}
                        <span className="font-mono text-slate-950 font-black">{calcDiscount > 0 ? `${formatCurrency(calcDiscount)}` : formatCurrency(0)}</span>
                      </div>
                      <div className="px-1 border-r border-slate-800">
                        <span className="text-slate-900">بیعانه (-):</span>{' '}
                        <span className="font-mono text-slate-950 font-black">{calcDeposit > 0 ? `${formatCurrency(calcDeposit)}` : formatCurrency(0)}</span>
                      </div>
                    </div>
                  </td>
                </tr>

                <tr className={`bg-transparent font-black text-slate-950 ${dyn.fixed.totalText}`}>
                  <td colSpan={4} className="border border-slate-800 p-1.5">
                    <div className="flex justify-between items-center px-1">
                      <div className={`${dyn.fixed.summaryText} font-normal text-slate-950`}>
                        <span className="font-bold text-slate-900">جمع فاکتور ({currencyLabel}) به حروف:</span>{' '}
                        <span className="font-black text-slate-950">
                          {numberToPersianWords(calcFinalTotal)} {currencyLabel}
                        </span>
                      </div>
                      <div>
                        <span className="font-black">جمع قابل پرداخت:</span>
                      </div>
                    </div>
                  </td>
                  <td className="border border-slate-800 p-1.5 text-left font-mono text-slate-950 font-black">{formatCurrency(calcFinalTotal)}</td>
                  <td className="border border-slate-800 p-1.5"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Invoice Notes / Molahezat section */}
          <div className={`text-slate-950 leading-relaxed bg-transparent p-2 rounded-lg border border-slate-800 ${dyn.fixed.summaryText} text-right mt-1`}>
            <span className="font-black text-slate-950 ml-1">توضیحات:</span>
            <span className="text-slate-950 font-bold">{calcDesc.trim() ? calcDesc : 'ثبت نشده است'}</span>
          </div>

          {/* Attachments Section if present */}
          {attachments && attachments.length > 0 && (
            <div className="mt-1 border border-slate-800 p-2 rounded-lg text-xs bg-slate-50 text-right print:hidden">
              <span className="font-bold text-slate-900 block mb-1">تصویر و رسیدهای پیوست:</span>
              <div className="grid grid-cols-4 gap-2">
                {attachments.map((img, idx) => (
                  <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-800 bg-white aspect-square flex items-center justify-center">
                    <img 
                      src={img} 
                      alt={`attached-slip-${idx}`} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <a 
                        href={img} 
                        download={`fish-${invNumber}-${idx}.webp`} 
                        className="px-2 py-1 bg-white text-slate-800 rounded text-[9px] font-bold shadow hover:bg-slate-100 transition-all cursor-pointer"
                      >
                        تأیید
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Glued Section: Signatures + Seller Info Footer shifted by bottomOffsetMm per user preference */}
        <div style={{ marginBottom: `${bottomOffsetMm}mm` }} className="mt-auto space-y-1 shrink-0">
          {/* Signature fields */}
          <div className={`grid grid-cols-2 gap-4 ${dyn.signatureGap} text-center ${dyn.fixed.signatureText} text-slate-950 font-black`}>
            <div>صادرکننده: {creatorName}</div>
            <div>امضا / مهر خریدار</div>
          </div>

          {/* Dynamic Single-line Seller Info Footer */}
          <div className={`text-center ${dyn.fixed.footerText} font-black text-slate-950 border-t-2 border-slate-800 ${dyn.footerGap} flex flex-wrap justify-center items-center gap-x-3 gap-y-0.5 select-none leading-none pb-0.5`} dir="rtl">
            <div><span>فروشنده:</span> <span className="text-slate-950 font-black">{sellerName}</span></div>
            <span className="text-slate-500">|</span>
            <div><span>آدرس:</span> <span className="text-slate-950 font-black">{sellerAddress}</span></div>
            <span className="text-slate-500">|</span>
            <div><span>تا:</span> <span className="font-mono text-slate-950 font-black text-[9px] md:text-[10px]">{toPersianDigits(activeSellerPhone)}</span></div>
            <span className="text-slate-500">|</span>
            <div><span>شماره یکواردتا:</span> <span className="font-mono text-slate-950 font-black">{toPersianDigits(sellerRegNo)}</span></div>
          </div>
        </div>

        </div>
      </div>
    );
  };

  const handleOpenNewInvoiceForm = () => {
    // Apply theme selection preference (randomize theme if 'random' mode is enabled)
    try {
      const savedPref = localStorage.getItem('invoice_theme_preference') || '0';
      if (savedPref === 'random') {
        const randIdx = Math.floor(Math.random() * 11);
        setActiveInvoiceThemeIndex(randIdx);
      } else {
        const parsed = parseInt(savedPref, 10);
        setActiveInvoiceThemeIndex(isNaN(parsed) || parsed < 0 || parsed > 10 ? 0 : parsed);
      }
    } catch (_) {}

    setEditingInvoice(null);
    setDate(getTodayJalali());
    setIsUrgent(false);
    setUrgentType(undefined);
    setCounterpartName('');
    setCounterpartPhone('');
    setCounterpartAddress('');
    setTax(0);
    setDeposit(0);
    setDiscount(0);
    setDiscountValue(0);
    setDiscountType('amount');
    lastDiscountNoteRef.current = '';
    lastShippingNoteRef.current = '';
    setDesc('');
    setAttachments([]);
    setExtractedAmount(null);
    setExtractedDate('');
    setExtractedSlips([]);
    setSelectedCustomIcons([]);
    setSelectedShippingMethod(null);
    setSelectedAcquaintanceMethod(null);
    setIsAcquaintanceExpanded(true);
    setValidationErrors(null);
    setGridRows([{ name: '', qty: 1, unitPrice: 0, remarks: '' }]);
    setShowForm(true);
  };

  useEffect(() => {
    if (initialShowForm) {
      handleOpenNewInvoiceForm();
    }
  }, [initialShowForm]);

  useEffect(() => {
    if (newInvoiceTrigger && newInvoiceTrigger > 0) {
      handleOpenNewInvoiceForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [newInvoiceTrigger]);

  // Submit invoice
  const handleSaveInvoiceInternal = async (e?: React.FormEvent, isPfPassed?: boolean, andPrint?: boolean, skipStockWarning?: boolean) => {
    if (e) e.preventDefault();

    if (isSavingInvoiceRef.current) {
      console.warn('[Invoice Save Lock] Save invoice is already in progress. Blocking concurrent execution.');
      return;
    }
    isSavingInvoiceRef.current = true;
    setIsSavingInvoice(true);

    try {
      const resolveProforma = typeof isPfPassed === 'boolean' ? isPfPassed : (editingInvoice ? !!editingInvoice.isProforma : false);
      const errorList: string[] = [];

    // 1. Counterpart Name & Phone & New Counterpart Acquaintance Method Check
    if (!counterpartName || counterpartName.trim() === '') {
      errorList.push('طرف‌حساب (خریدار یا فروشنده) وارد شده است. لطفاً  «طرف‌حساب» وارد تکمیل با.');
    }

    if (!counterpartPhone || counterpartPhone.trim() === '') {
      errorList.push('شماره تماس طرف‌حساب وارد شده است. لطفاً  «تا / وارد» وارد تکمیل با.');
    }

    if (counterpartName && counterpartName.trim() !== '' && counterpartPhone && counterpartPhone.trim() !== '') {
      const trimmedCpName = counterpartName.trim();
      const trimmedCpPhone = counterpartPhone.trim();

      const isExistingCp = counterparts.some(cp => {
        const sameName = cp.name.trim().toLowerCase() === trimmedCpName.toLowerCase();
        const samePhone = trimmedCpPhone !== 'ثبت نشده' && cp.phone && cp.phone.trim() !== 'ثبت نشده' && cp.phone.trim() === trimmedCpPhone;
        return sameName || samePhone;
      });

      if (!isExistingCp && !selectedAcquaintanceMethod) {
        errorList.push('انتخاب نحوه آشنایی با طرف‌حساب الزامی است. لطفاً یک گزینه را انتخاب نمایید.');
      }
    }

    // 2. Mandatory Communication Channel & Shipping Method Check for Sales Invoices
    if (activeType === 'sale') {
      if (!selectedCustomIcons || selectedCustomIcons.length === 0) {
        errorList.push('انتخاب روش ارتباطی الزامی است. لطفاً حداقل یک روش ارتباطی را انتخاب نمایید.');
      }
      if (!selectedShippingMethod) {
        errorList.push('انتخاب روش ارسال الزامی است. لطفاً یک روش ارسال را انتخاب نمایید.');
      }
    }

    // 2. Role check for purchase invoice
    if (activeType === 'purchase' && isSeller) {
      errorList.push('کاربر با نقش فروشنده مجاز به ثبت فاکتور خرید نیست.');
    }

    // 3. Fiscal Year and Jalali Date Validation & Period Lock Check
    const dateVal = validateFiscalDate(date, fiscalYear, { entityName: resolveProforma ? 'پیش‌فاکتور' : 'فاکتور' });
    if (!dateVal.valid && dateVal.error) {
      errorList.push(dateVal.error);
    }
    const lockCheck = isFiscalPeriodLocked(date, fiscalYear);
    if (lockCheck.isLocked) {
      errorList.push(lockCheck.reason || 'تاریخ صدور در دوره مالی بسته قرار دارد و امکان ثبت یا ویرایش وجود ندارد.');
    }

    // 4. Valid Invoice Rows & Items check
    const validRows = gridRows.filter(row => row.name.trim() !== '');
    if (validRows.length === 0) {
      errorList.push('هیچ کالا یا خدماتی در فاکتور وارد نشده است. حداقل یک ردیف کالا یا خدمات معتبر اضافه نمایید.');
    } else {
      gridRows.forEach((row, idx) => {
        if (row.name.trim() !== '') {
          if (!row.qty || row.qty <= 0) {
            errorList.push(`تعداد وارد شده در ردیف ${idx + 1} («${row.name}») نامعتبر است (تعداد باید بزرگتر از ۰ باشد).`);
          }
          if (row.unitPrice < 0 || isNaN(row.unitPrice)) {
            errorList.push(`مبلغ واحد در ردیف ${idx + 1} («${row.name}») نامعتبر است.`);
          }
        }
      });
    }

    // 5. Unique & Monotonic Invoice Numbering
    let nextInvNum = '';
    if (editingInvoice) {
      if (editingInvoice.isProforma && !resolveProforma) {
        // Converting proforma to definitive invoice
        nextInvNum = getNextInvoiceNumber(invoices, false, fiscalYear);
      } else {
        nextInvNum = ensureUniqueInvoiceNumber(editingInvoice.invoiceNumber, invoices, resolveProforma, editingInvoice.id);
      }
    } else {
      nextInvNum = getNextInvoiceNumber(invoices, resolveProforma, fiscalYear);
    }

    const isDuplicate = invoices.some(inv => 
      inv.invoiceNumber === nextInvNum && inv.id !== (editingInvoice?.id || '')
    );
    if (isDuplicate) {
      errorList.push(`فاکتور با شماره «${nextInvNum}» قبلاً ثبت شده است. لطفاً شماره دیگری انتخاب نمایید.`);
    }

    // IF ANY ERRORS -> SHOW VALIDATION MODAL POPUP AND RETURN
    if (errorList.length > 0) {
      setValidationModalPopup({
        isOpen: true,
        title: 'قفل و تأیید نهایی اطلاعات فاکتور',
        errors: errorList,
        isPfPassed,
        andPrint
      });
      return;
    }

    // 6. Check for Negative Stock Warning on Sales Invoices
    if (activeType === 'sale' && !resolveProforma && !skipStockWarning) {
      const negativeStockList: Array<{ name: string; available: number; requested: number; deficit: number }> = [];
      validRows.forEach(row => {
        const rowNameTrimmed = row.name.trim();
        let matchedItem = row.itemId ? items.find(it => it.id === row.itemId) : undefined;
        if (!matchedItem) {
          matchedItem = items.find(it => {
            const baseName = it.name.trim().toLowerCase();
            const fullNameWithColor = formatItemNameWithColor(it.name, it.color).trim().toLowerCase();
            const inputName = rowNameTrimmed.toLowerCase();
            return baseName === inputName || fullNameWithColor === inputName;
          });
        }

        if (matchedItem && matchedItem.type !== 'khadamat') {
          const oldQty = (editingInvoice && editingInvoice.type === 'sale' && !editingInvoice.isProforma)
            ? (editingInvoice.items.find(it => it.itemId === matchedItem!.id || it.name.trim().toLowerCase() === matchedItem!.name.trim().toLowerCase())?.quantity || 0)
            : 0;
          const availableStock = (matchedItem.qty || 0) + oldQty;
          if (row.qty > availableStock) {
            negativeStockList.push({
              name: matchedItem.name,
              available: availableStock,
              requested: row.qty,
              deficit: row.qty - availableStock
            });
          }
        }
      });

      if (negativeStockList.length > 0) {
        setNegativeStockPrompt({
          isOpen: true,
          items: negativeStockList,
          isPfPassed,
          andPrint
        });
        return;
      }
    }

    // 7. Check if any row item is undefined in warehouse
    const firstUndefinedRowIdx = gridRows.findIndex(row => isRowItemUndefinedInWarehouse(row));
    if (firstUndefinedRowIdx !== -1) {
      const row = gridRows[firstUndefinedRowIdx];
      const isPopupOpened = handleCheckRowItemName(firstUndefinedRowIdx, row.name);
      if (isPopupOpened) {
        return;
      }
    }

    // 8. If counterpart isn't already in system, automatically save them
    const cName = counterpartName.trim();
    const cPhone = counterpartPhone.trim();
    const cAddress = counterpartAddress.trim();

    const existingCp = counterparts.find(cp => cp.name.trim().toLowerCase() === cName.toLowerCase() || (cPhone && cPhone !== 'ثبت نشده' && cp.phone && cp.phone.trim() === cPhone));
    if (existingCp) {
      if (onUpdateCounterpart) {
        const updatedCp: Counterpart = {
          ...existingCp,
          customIcons: selectedCustomIcons.length > 0 ? selectedCustomIcons : existingCp.customIcons,
          communicationChannel: selectedCustomIcons.length > 0 
            ? selectedCustomIcons.map(id => systemIcons.find(s => s.id === id)?.name).filter(Boolean).join(' ') 
            : existingCp.communicationChannel,
          acquaintanceMethod: selectedAcquaintanceMethod 
            ? (acquaintanceMethods.find(a => a.id === selectedAcquaintanceMethod)?.name || existingCp.acquaintanceMethod) 
            : existingCp.acquaintanceMethod,
          shippingMethod: selectedShippingMethod || existingCp.shippingMethod
        };
        onUpdateCounterpart(updatedCp);
      }
    } else if (onAddCounterpart) {
      const newCp: Counterpart = {
        id: `cp-${Date.now()}`,
        name: cName,
        phone: cPhone || 'ثبت نشده',
        address: cAddress || 'ثبت نشده',
        type: activeType === 'sale' ? 'buyer' : 'seller',
        createdBy: currentUser?.name || '',
        createdById: currentUser?.id || '',
        createdAt: getTodayJalali(),
        acquaintanceMethod: selectedAcquaintanceMethod ? (acquaintanceMethods.find(a => a.id === selectedAcquaintanceMethod)?.name || '') : undefined,
        communicationChannel: selectedCustomIcons.length > 0 ? selectedCustomIcons.map(id => systemIcons.find(s => s.id === id)?.name).filter(Boolean).join(' ') : undefined,
        customIcons: selectedCustomIcons.length > 0 ? selectedCustomIcons : undefined,
        shippingMethod: selectedShippingMethod || undefined
      };
      onAddCounterpart(newCp);
    }

    const parsedInvoiceItems: InvoiceItem[] = validRows.map(row => {
      const rowNameTrimmed = row.name.trim();
      let foundItem = row.itemId ? items.find(it => it.id === row.itemId) : undefined;
      if (!foundItem) {
        foundItem = items.find(it => {
          const baseName = it.name.trim().toLowerCase();
          const fullNameWithColor = formatItemNameWithColor(it.name, it.color).trim().toLowerCase();
          const inputName = rowNameTrimmed.toLowerCase();
          return baseName === inputName || fullNameWithColor === inputName;
        });
      }

      const rawColor = row.color || (foundItem ? foundItem.color : undefined);
      const validColor = hasValidColor(rawColor) ? rawColor.trim() : undefined;

      let finalName = rowNameTrimmed;
      if (foundItem && hasValidColor(foundItem.color)) {
        finalName = formatItemNameWithColor(foundItem.name, foundItem.color);
      } else if (hasValidColor(validColor)) {
        finalName = formatItemNameWithColor(rowNameTrimmed, validColor);
      }

      const rQty = typeof row.qty === 'number' ? row.qty : (parseFloat(toEnglishDigits(String(row.qty || '')).replace(/,/g, '').replace(/[^0-9.]/g, '')) || 0);
      const rPrice = typeof row.unitPrice === 'number' ? row.unitPrice : (parseFloat(toEnglishDigits(String(row.unitPrice || '')).replace(/,/g, '').replace(/[^0-9.]/g, '')) || 0);

      return {
        itemId: foundItem ? foundItem.id : (row.itemId || `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
        name: finalName,
        type: foundItem ? foundItem.type : 'khadamat',
        color: validColor,
        qty: rQty,
        unitPrice: rPrice,
        totalPrice: calcRowTotal(rQty, rPrice),
        remarks: row.remarks
      };
    });

    const calculatedSubtotal = parsedInvoiceItems.reduce((sum, it) => sum + it.totalPrice, 0);
    const invoiceTotalAmount = Math.max(0, calculatedSubtotal + tax - discount);
    
    // Determine accurate deposit value: prioritize active deposit in state, then extracted slips, then pending deposits, then existing deposit
    const slipsSum = extractedSlips.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const clearedPendingSum = editingInvoice && pendingDeposits 
      ? pendingDeposits.filter(pd => pd.invoiceId === editingInvoice.id && pd.status === 'cleared').reduce((sum, pd) => sum + (Number(pd.amount) || 0), 0)
      : 0;
    const finalDepositValue = deposit > 0 
      ? deposit 
      : (slipsSum > 0 ? slipsSum : (clearedPendingSum > 0 ? clearedPendingSum : (editingInvoice?.deposit || 0)));

    let updatedHistory: any[] = [];
    if (editingInvoice) {
      const isConvertingProformaToFinal = editingInvoice.isProforma && !resolveProforma;

      if (isConvertingProformaToFinal) {
        // Clear all previous history and don't record the conversion edit operation itself
        updatedHistory = [];
      } else {
        updatedHistory = editingInvoice.history ? [...editingInvoice.history] : [];
        const snapshot = {
          invoiceNumber: editingInvoice.invoiceNumber,
          type: editingInvoice.type,
          date: editingInvoice.date,
          counterpartName: editingInvoice.counterpartName,
          counterpartPhone: editingInvoice.counterpartPhone,
          counterpartAddress: editingInvoice.counterpartAddress,
          items: editingInvoice.items,
          totalAmount: editingInvoice.totalAmount,
          tax: editingInvoice.tax,
          deposit: editingInvoice.deposit,
          discount: editingInvoice.discount,
          description: editingInvoice.description,
          isProforma: editingInvoice.isProforma,
          isUrgent: editingInvoice.isUrgent,
          urgentType: editingInvoice.urgentType,
          createdBy: editingInvoice.createdBy,
          attachments: editingInvoice.attachments,
          paymentAmount: editingInvoice.paymentAmount,
          paymentDate: editingInvoice.paymentDate,
          paymentSlips: editingInvoice.paymentSlips,
          customIcons: editingInvoice.customIcons,
          shippingMethod: editingInvoice.shippingMethod,
        };

        const now = new Date();
        const datePart = now.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const timePart = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
        const editTimestamp = `${datePart} - ساعت ${timePart}`;

        updatedHistory.push({
          id: `hist-${Date.now()}`,
          snapshot,
          editedBy: currentUser?.name || '',
          editedById: currentUser?.id || '',
          editTimestamp
        });
      }
    }

    const invId = editingInvoice 
      ? editingInvoice.id 
      : (resolveProforma 
          ? `pf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` 
          : `inv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);

    const newInvoice: Invoice = {
      id: invId,
      invoiceNumber: nextInvNum,
      type: activeType,
      date,
      counterpartId: editingInvoice ? editingInvoice.counterpartId : `cp-auto-${Date.now()}`,
      counterpartName: cName,
      counterpartPhone: cPhone,
      counterpartAddress: cAddress,
      items: parsedInvoiceItems,
      totalAmount: invoiceTotalAmount,
      tax: tax,
      deposit: finalDepositValue,
      discount: discount,
      description: desc,
      isProforma: resolveProforma,
      isUrgent: !!urgentType,
      urgentType: urgentType,
      createdBy: editingInvoice ? editingInvoice.createdBy : (currentUser?.name || ''),
      createdById: editingInvoice ? editingInvoice.createdById : (currentUser?.id || ''),
      createdByPhone: editingInvoice ? (editingInvoice.createdByPhone || currentUser?.phone || '') : (currentUser?.phone || ''),
      attachments: attachments,
      paymentAmount: finalDepositValue > 0 ? finalDepositValue : (extractedAmount || undefined),
      paymentDate: extractedDate || undefined,
      paymentSlips: extractedSlips.length > 0 ? extractedSlips : (finalDepositValue > 0 ? [{ id: 'slip-' + Date.now(), amount: finalDepositValue, date: date, time: '', imageName: 'واریز بیعانه' }] : undefined),
      history: editingInvoice ? (updatedHistory.length > 0 ? updatedHistory : undefined) : undefined,
      customIcons: selectedCustomIcons,
      shippingMethod: selectedShippingMethod || undefined,
      acquaintanceMethod: selectedAcquaintanceMethod ? (acquaintanceMethods.find(a => a.id === selectedAcquaintanceMethod)?.name || '') : undefined,
      updatedAt: Date.now(),
      createdAt: editingInvoice ? (editingInvoice.createdAt || Date.now()) : Date.now()
    };

    let saveResult: boolean | void = true;
    try {
      if (editingInvoice) {
        if (onUpdateInvoice) {
          saveResult = await onUpdateInvoice(editingInvoice, newInvoice);
        } else {
          saveResult = await onAddInvoice(newInvoice);
        }
      } else {
        saveResult = await onAddInvoice(newInvoice);
      }
    } catch (saveErr: any) {
      console.error("Save invoice error:", saveErr);
      saveResult = false;
    }

    if (saveResult === false) {
      setDbErrorModal({
        isOpen: true,
        title: 'خطا از چاپ مستقیم فاکتور از پایگاه داده سیستم',
        message: 'خطا در ارتباط با سرور یا پایگاه داده هنگام ثبت فاکتور.',
        docNumber: String(nextInvNum),
        docType: newInvoice.isProforma ? 'پیش‌فاکتور' : (newInvoice.type === 'sale' ? 'فاکتور فروش' : 'فاکتور خرید'),
        counterpart: cName,
        totalAmount: invoiceTotalAmount,
        retryAction: async () => {
          await handleSaveInvoiceInternal(andPrint);
        }
      });
      return;
    }

    if (editingInvoice) {
      setEditingInvoice(null);
    }

    if (newInvoice.isProforma) {
      setOpenProformaIds(prev => {
        if (!prev.includes(newInvoice.id)) {
          return [newInvoice.id, ...prev];
        }
        return prev;
      });
    } else {
      setOpenProformaIds(prev => prev.filter(id => id !== newInvoice.id));
    }

    // Automatically register pending deposit instead of direct transaction
    if (onUpdatePendingDeposits) {
      // Filter out any existing pending deposits for this invoice to prevent duplicates or stale records
      const filteredPending = (pendingDeposits || []).filter(pd => pd.invoiceId !== invId);
      
      if (deposit > 0) {
        const existingPds = (pendingDeposits || []).filter(pd => pd.invoiceId === invId);
        const existingCleared = existingPds.find(pd => pd.status === 'cleared');
        const slips = newInvoice.paymentSlips || [];
        if (slips.length > 0) {
          const newPendings: PendingDeposit[] = slips.map((slip, idx) => {
            const matchedExisting = existingPds.find(epd => epd.id === slip.id || (epd.amount === slip.amount && epd.status === 'cleared'));
            return {
              id: slip.id || `pd-${invId}-${idx}-${Date.now()}`,
              invoiceId: invId,
              invoiceNumber: nextInvNum,
              counterpartId: newInvoice.counterpartId,
              counterpartName: cName,
              amount: slip.amount,
              date: slip.date || date,
              status: matchedExisting ? matchedExisting.status : 'pending',
              clearedTxId: matchedExisting?.clearedTxId,
              clearedDate: matchedExisting?.clearedDate,
              type: activeType
            };
          });
          onUpdatePendingDeposits([...filteredPending, ...newPendings]);
        } else {
          // Fallback to single pending deposit if no individual slips exist
          const newPending: PendingDeposit = {
            id: existingCleared ? existingCleared.id : `pd-${Date.now()}`,
            invoiceId: invId,
            invoiceNumber: nextInvNum,
            counterpartId: newInvoice.counterpartId,
            counterpartName: cName,
            amount: deposit,
            date: date,
            status: (existingCleared && existingCleared.amount === deposit) ? 'cleared' : 'pending',
            clearedTxId: (existingCleared && existingCleared.amount === deposit) ? existingCleared.clearedTxId : undefined,
            clearedDate: (existingCleared && existingCleared.amount === deposit) ? existingCleared.clearedDate : undefined,
            type: activeType
          };
          onUpdatePendingDeposits([...filteredPending, newPending]);
        }
      } else {
        // If deposit is 0 (all slips were deleted), update the state without any pending deposit for this invoice
        onUpdatePendingDeposits(filteredPending);
      }
    }
    
    // Reset Form and open a fresh new blank form automatically
    setDate(getTodayJalali());
    setIsUrgent(false);
    setUrgentType(undefined);
    setCounterpartName('');
    setCounterpartPhone('');
    setCounterpartAddress('');
    setSelectedCustomIcons([]);
    setSelectedShippingMethod(null);
    setSelectedAcquaintanceMethod(null);
    setTax(0);
    setDeposit(0);
    setDiscount(0);
    setDiscountValue(0);
    setDiscountType('amount');
    lastDiscountNoteRef.current = '';
    lastShippingNoteRef.current = '';
    setDesc('');
    setAttachments([]);
    setExtractedAmount(null);
    setExtractedDate('');
    setExtractedSlips([]);
    setGridRows([{ name: '', qty: 1, unitPrice: 0, remarks: '' }]);
    setEditingInvoice(null);
    setShowForm(true);

    // Focus and highlight in Archive
    setHighlightedInvoiceId(newInvoice.id);
    if (archiveTab === 'deleted') {
      setArchiveTab('all');
    }
    setArchivePage(1);
    const docTypeLabel = newInvoice.isProforma ? 'پیش‌فاکتور' : (newInvoice.type === 'sale' ? 'فاکتور فروش' : 'فاکتور خرید');
    setSuccessToast({
      message: `${docTypeLabel} شماره ${toPersianDigits(nextInvNum)} با موفقیت در پایگاه داده ذخیره گردید.`,
      docNumber: nextInvNum,
      type: newInvoice.isProforma ? 'proforma' : (newInvoice.type === 'sale' ? 'sale' : 'purchase')
    });
    setTimeout(() => {
      const el = document.getElementById(`archive-invoice-${newInvoice.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
    setTimeout(() => {
      setHighlightedInvoiceId(prev => prev === newInvoice.id ? null : prev);
    }, 6000);
    setTimeout(() => {
      setSuccessToast(null);
    }, 4500);

    if (andPrint) {
      setSelectedInv(newInvoice);
      setShowPrintModal(true);
      setTimeout(() => {
        window.print();
      }, 400);
    }
    } finally {
      isSavingInvoiceRef.current = false;
      setIsSavingInvoice(false);
    }
  };

  // Suggestions for counterparts match - FILTER BY SELLER CREATOR IF APPLICABLE
  const suggestions = counterparts.filter(cp => {
    if (currentUser.role === 'seller' && cp.createdById !== currentUser.id) {
      return false; // Sellers can only see counterparts they registered
    }
    const cleanInput = counterpartName.toLowerCase().trim();
    const cleanInputEng = toEnglishDigits(counterpartName).toLowerCase().trim();
    const matchesName = cp.name.toLowerCase().includes(cleanInput);
    const cpPhoneEng = cp.phone ? toEnglishDigits(cp.phone).toLowerCase() : '';
    const matchesPhone = Boolean(cpPhoneEng && cleanInputEng && cpPhoneEng.includes(cleanInputEng));
    const matchesType = activeType === 'sale' 
      ? (cp.type === 'buyer' || cp.type === 'both') 
      : (cp.type === 'seller' || cp.type === 'both');
    return (matchesName || matchesPhone) && matchesType;
  });

  const phoneSuggestions = counterparts.filter(cp => {
    if (currentUser.role === 'seller' && cp.createdById !== currentUser.id) {
      return false;
    }
    if (!cp.phone || cp.phone.trim() === '' || cp.phone.trim() === 'ثبت نشده') {
      return false;
    }
    const cleanInputPhone = toEnglishDigits(counterpartPhone.trim()).toLowerCase();
    const rawInputPhone = counterpartPhone.trim().toLowerCase();
    if (!cleanInputPhone && !rawInputPhone) return false;

    const cpPhoneEng = toEnglishDigits(cp.phone.trim()).toLowerCase();
    const matchesPhone = cpPhoneEng.includes(cleanInputPhone) || cp.phone.toLowerCase().includes(rawInputPhone);
    const matchesName = cp.name.toLowerCase().includes(rawInputPhone);
    const matchesType = activeType === 'sale'
      ? (cp.type === 'buyer' || cp.type === 'both')
      : (cp.type === 'seller' || cp.type === 'both');
    return (matchesPhone || matchesName) && matchesType;
  });

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-6">
      
      {/* New Invoice Section */}
      {!showForm && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 p-4 shadow-sm flex items-center justify-between gap-4 flex-wrap" dir="rtl">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleOpenNewInvoiceForm}
              className={`w-9 h-9 rounded-xl active:scale-95 text-white flex items-center justify-center shadow-md transition-all cursor-pointer group ${currentInvoiceTheme.headerBtnBg}`}
              title="ثبت و ایجاد فاکتور جدید"
            >
              <Plus className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <div>
                <h3 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <span>فاکتور جدید</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">ثبت و مدیریت فاکتور فروش، خرید و پیش‌فاکتور</p>
              </div>

              {/* Palette of 11 color circles + 1 rainbow random circle opposite title */}
              {renderThemeColorPalette()}
            </div>
          </div>
          <button
            onClick={handleOpenNewInvoiceForm}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3.5 rounded-xl text-[11px] shadow hover:shadow-md transition-all cursor-pointer"
            id="btn-open-invoice-modal"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>صدور فاکتور</span>
          </button>
        </div>
      )}

      {/* Invoice Creation Form block */}
      {showForm && (
        <div className={`w-full max-w-full min-w-0 overflow-x-hidden rounded-2xl border p-4 md:p-5 shadow-xl animate-scale-up animate-duration-150 space-y-4 transition-all duration-300 ${currentInvoiceTheme.cardBg} ${currentInvoiceTheme.cardBorder}`}>
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3 gap-3" dir="rtl">
            <div className="flex items-center gap-2 flex-wrap">
              {editingInvoice ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className={`w-8 h-8 rounded-xl text-white flex items-center justify-center shadow-sm ${editingInvoice.isProforma ? 'bg-amber-500' : 'bg-blue-600'}`}>
                    <Edit3 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {editingInvoice.isProforma 
                        ? `ویرایش پیش‌فاکتور شماره ${toPersianDigits(editingInvoice.invoiceNumber)}` 
                        : `ویرایش فاکتور شماره ${toPersianDigits(editingInvoice.invoiceNumber)}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenNewInvoiceForm}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 border border-slate-250 dark:border-slate-700"
                    title="انصراف از حالت ویرایش و ایجاد فرم خام جدید"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>انصراف از ویرایش</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenNewInvoiceForm}
                    className={`w-8 h-8 rounded-xl active:scale-95 text-white flex items-center justify-center shadow-sm transition-all cursor-pointer group ${currentInvoiceTheme.headerBtnBg}`}
                    title="ثبت و ایجاد فاکتور جدید"
                  >
                    <Plus className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
                  </button>
                  <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 whitespace-nowrap">فاکتور جدید</span>
                </div>
              )}

              {/* Palette of 11 color circles + 1 rainbow random circle opposite title */}
              {renderThemeColorPalette()}

              {/* Urgent / Emergency Option Controls (فوری / اضطراری) - Checkboxes, max 1 selected, optional */}
              <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-900/90 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs shrink-0">
                {/* Option 1: از (Urgent) */}
                <label
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-black transition-all cursor-pointer select-none ${
                    urgentType === 'urgent'
                      ? 'bg-amber-500 text-white shadow-xs scale-105 ring-2 ring-amber-300 dark:ring-amber-600'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-amber-600'
                  }`}
                  title="علامت‌گذاری فاکتور به عنوان فوری"
                >
                  <input
                    type="checkbox"
                    checked={urgentType === 'urgent'}
                    onChange={() => {
                      if (urgentType === 'urgent') {
                        setUrgentType(undefined);
                        setIsUrgent(false);
                      } else {
                        setUrgentType('urgent');
                        setIsUrgent(true);
                      }
                    }}
                    className="w-3.5 h-3.5 accent-amber-600 rounded cursor-pointer"
                  />
                  <AlertTriangle className={`w-3.5 h-3.5 ${urgentType === 'urgent' ? 'text-white animate-bounce' : 'text-amber-500'}`} />
                  <span>فوری</span>
                </label>

                {/* Option 2: اضطراری (Emergency) */}
                <label
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-black transition-all cursor-pointer select-none ${
                    urgentType === 'emergency'
                      ? 'bg-rose-600 text-white shadow-xs scale-105 ring-2 ring-rose-400'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-rose-600'
                  }`}
                  title="علامت‌گذاری فاکتور به عنوان اورژانسی"
                >
                  <input
                    type="checkbox"
                    checked={urgentType === 'emergency'}
                    onChange={() => {
                      if (urgentType === 'emergency') {
                        setUrgentType(undefined);
                        setIsUrgent(false);
                      } else {
                        setUrgentType('emergency');
                        setIsUrgent(true);
                      }
                    }}
                    className="w-3.5 h-3.5 accent-rose-600 rounded cursor-pointer"
                  />
                  <AlertCircle className={`w-3.5 h-3.5 ${urgentType === 'emergency' ? 'text-white animate-bounce' : 'text-rose-500'}`} />
                  <span>اورژانسی</span>
                </label>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 md:gap-4 flex-1 justify-end">
              {/* Type selector tab */}
              {!isSeller ? (
                <div className="flex gap-2.5 items-center">
                  <button
                    type="button"
                    onClick={() => setActiveType('sale')}
                    className={`px-5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                      activeType === 'sale' 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20 scale-105 active:scale-95' 
                        : 'bg-white dark:bg-slate-900 border-slate-250 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    فروش (مشتری)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveType('purchase')}
                    className={`px-5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                      activeType === 'purchase' 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/20 scale-105 active:scale-95' 
                        : 'bg-white dark:bg-slate-900 border-slate-250 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    خرید (تأمین‌کننده)
                  </button>
                </div>
              ) : (
                <span className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-750 dark:text-blue-400 font-bold px-2 py-1 rounded-lg border border-blue-100 dark:border-blue-900/40">
                  فروش کالا و خدمات (فروشنده)
                </span>
              )}

              {/* Date Input Box */}
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 border border-slate-200 dark:border-slate-800 rounded-xl">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">تاریخ ثبت:</label>
                <div className="w-28 text-center">
                  <JalaliDatePicker
                    value={date}
                    onChange={(val) => setDate(val)}
                    placeholder="۱۴۰۳/۰۱/۰۱"
                    placement="left"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="بستن"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-4">

            {/* Counterparty Fields Row */}
            <div className="flex flex-wrap items-start justify-between gap-4 w-full max-w-full">
              
              {/* مشخصات طرف‌حساب و نحوه ارتباط */}
              <div className={`flex flex-wrap items-start gap-3 ${activeType === 'sale' ? 'flex-1 min-w-[250px] max-w-full' : 'w-full'}`}>
                {/* نام طرف‌حساب */}
                <div className="space-y-1.5 flex-1 min-w-[200px] relative">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    وارد کردن نام طرف حساب <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={counterpartName}
                    onChange={(e) => {
                      setCounterpartName(e.target.value);
                      setShowCounterpartSuggestions(true);
                      setActiveCounterpartIndex(-1);
                    }}
                    onFocus={() => setShowCounterpartSuggestions(true)}
                    onKeyDown={(e) => {
                      if (showCounterpartSuggestions && suggestions.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setActiveCounterpartIndex(prev => (prev + 1) % suggestions.length);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setActiveCounterpartIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
                        } else if (e.key === 'Enter') {
                          if (activeCounterpartIndex >= 0 && activeCounterpartIndex < suggestions.length) {
                            e.preventDefault();
                            const cp = suggestions[activeCounterpartIndex];
                            handleSelectCounterpart(cp);
                          }
                        } else if (e.key === 'Escape') {
                          setShowCounterpartSuggestions(false);
                        }
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowCounterpartSuggestions(false), 200);
                      const trimmedName = counterpartName.trim();
                      if (trimmedName) {
                        const existing = counterparts.find(cp => cp.name.trim().toLowerCase() === trimmedName.toLowerCase());
                        if (existing) {
                          if (selectedCustomIcons.length === 0) {
                            handleSelectCounterpart(existing);
                          }
                          const isOtherUser = (existing.createdById && existing.createdById !== currentUser.id) || 
                                              (!existing.createdById && existing.createdBy && existing.createdBy !== currentUser.name);
                          if (isOtherUser) {
                            setDuplicateWarning({
                              type: 'name',
                              name: existing.name,
                              createdBy: existing.createdBy || 'کالایی یک',
                              createdAt: existing.createdAt || 'ثبت نشده از کالایی',
                              isBlocked: true
                            });
                          }
                        } else {
                          const trimmedPhone = counterpartPhone.trim();
                          if (trimmedPhone && trimmedPhone !== 'ثبت نشده') {
                            const phoneExists = counterparts.find(cp => cp.phone && cp.phone.trim() !== 'ثبت نشده' && cp.phone.trim() === trimmedPhone);
                            if (phoneExists) {
                              if (selectedCustomIcons.length === 0) {
                                handleSelectCounterpart(phoneExists);
                              }
                              const isOtherUser = (phoneExists.createdById && phoneExists.createdById !== currentUser.id) || 
                                                  (!phoneExists.createdById && phoneExists.createdBy && phoneExists.createdBy !== currentUser.name);
                              if (isOtherUser) {
                                setDuplicateWarning({
                                  type: 'phone',
                                  name: phoneExists.name,
                                  phone: trimmedPhone,
                                  createdBy: phoneExists.createdBy || 'کالایی یک',
                                  createdAt: phoneExists.createdAt || 'ثبت نشده از کالایی',
                                  isBlocked: true
                                });
                              }
                            }
                          }
                        }
                      }
                    }}
                    placeholder="مثال: علی احمدی یا شرکت پارس"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                    required
                  />
                  
                  {/* Autocomplete Dropdown */}
                  {showCounterpartSuggestions && counterpartName.trim() !== '' && suggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 dropdown-solid">
                      {suggestions.map((cp, idx) => {
                        const isActive = idx === activeCounterpartIndex;
                        return (
                          <button
                            key={cp.id}
                            type="button"
                            onClick={() => {
                              handleSelectCounterpart(cp);
                            }}
                            className={`w-full text-right px-3 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-750 dark:text-slate-300 flex justify-between items-center cursor-pointer ${
                              isActive ? 'bg-blue-50 dark:bg-slate-800 font-extrabold ring-1 ring-blue-500' : ''
                            }`}
                          >
                            <span className="font-bold">{cp.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{cp.phone}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* تا / وارد */}
                <div className="space-y-1.5 w-[160px] relative">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    تلفن / همراه <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={counterpartPhone}
                    onChange={(e) => {
                      setCounterpartPhone(e.target.value);
                      setShowPhoneSuggestions(true);
                      setActivePhoneCounterpartIndex(-1);
                    }}
                    onFocus={() => setShowPhoneSuggestions(true)}
                    onKeyDown={(e) => {
                      if (showPhoneSuggestions && phoneSuggestions.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setActivePhoneCounterpartIndex(prev => (prev + 1) % phoneSuggestions.length);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setActivePhoneCounterpartIndex(prev => (prev - 1 + phoneSuggestions.length) % phoneSuggestions.length);
                        } else if (e.key === 'Enter') {
                          if (activePhoneCounterpartIndex >= 0 && activePhoneCounterpartIndex < phoneSuggestions.length) {
                            e.preventDefault();
                            const cp = phoneSuggestions[activePhoneCounterpartIndex];
                            handleSelectCounterpart(cp);
                          }
                        } else if (e.key === 'Escape') {
                          setShowPhoneSuggestions(false);
                        }
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowPhoneSuggestions(false), 200);
                      const trimmedPhone = counterpartPhone.trim();
                      if (trimmedPhone && trimmedPhone !== 'ثبت نشده') {
                        const trimmedName = counterpartName.trim();
                        const phoneExists = counterparts.find(cp => {
                          const cpPhoneTrimmed = cp.phone && cp.phone.trim();
                          if (!cpPhoneTrimmed || cpPhoneTrimmed === 'ثبت نشده') return false;
                          if (trimmedName && cp.name.trim().toLowerCase() === trimmedName.toLowerCase()) return false;
                          return cpPhoneTrimmed === trimmedPhone || toEnglishDigits(cpPhoneTrimmed) === toEnglishDigits(trimmedPhone);
                        });
                        if (phoneExists) {
                          if (!trimmedName || selectedCustomIcons.length === 0) {
                            handleSelectCounterpart(phoneExists);
                          }
                          const isOtherUser = (phoneExists.createdById && phoneExists.createdById !== currentUser.id) || 
                                              (!phoneExists.createdById && phoneExists.createdBy && phoneExists.createdBy !== currentUser.name);
                          if (isOtherUser) {
                            setDuplicateWarning({
                              type: 'phone',
                              name: phoneExists.name,
                              phone: trimmedPhone,
                              createdBy: phoneExists.createdBy || 'کالایی یک',
                              createdAt: phoneExists.createdAt || 'ثبت نشده از کالایی',
                              isBlocked: true
                            });
                          }
                        }
                      }
                    }}
                    placeholder="مثال: 09123456789"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 font-mono text-center placeholder:text-slate-400"
                    required
                  />

                  {/* Autocomplete Dropdown for Phone */}
                  {showPhoneSuggestions && counterpartPhone.trim() !== '' && phoneSuggestions.length > 0 && (
                    <div className="absolute z-50 w-64 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 dropdown-solid">
                      {phoneSuggestions.map((cp, idx) => {
                        const isActive = idx === activePhoneCounterpartIndex;
                        return (
                          <button
                            key={cp.id}
                            type="button"
                            onClick={() => {
                              handleSelectCounterpart(cp);
                            }}
                            className={`w-full text-right px-3 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-750 dark:text-slate-300 flex justify-between items-center cursor-pointer ${
                              isActive ? 'bg-blue-50 dark:bg-slate-800 font-extrabold ring-1 ring-blue-500' : ''
                            }`}
                          >
                            <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{cp.name}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono text-left dir-ltr shrink-0 mr-1.5">{cp.phone}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* آدرس و نشانی */}
                <div className="space-y-1.5 flex-1 min-w-[180px]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">آدرس</label>
                    {/* یک/آیایک بابا  آدرس و نشانی به وارد نوعواردتا نحوه آشنایی */}
                    {(() => {
                      const trimmedName = counterpartName.trim();
                      const trimmedPhone = counterpartPhone.trim();
                      const isBothFieldsFilled = trimmedName !== '' && trimmedPhone !== '';
                      if (!isBothFieldsFilled) return null;

                      const isExistingCp = counterparts.some(cp => {
                        const sameName = cp.name.trim().toLowerCase() === trimmedName.toLowerCase();
                        const samePhone = trimmedPhone !== 'ثبت نشده' && cp.phone && cp.phone.trim() !== 'ثبت نشده' && cp.phone.trim() === trimmedPhone;
                        return sameName || samePhone;
                      });

                      const isNewCp = !isExistingCp;
                      if (!isNewCp) return null;

                      if (!isAcquaintanceExpanded) {
                        const selectedMethodObj = selectedAcquaintanceMethod 
                          ? acquaintanceMethods.find(a => a.id === selectedAcquaintanceMethod)
                          : null;
                        const hasSelected = Boolean(selectedMethodObj);

                        return (
                          <button
                            type="button"
                            onClick={() => setIsAcquaintanceExpanded(true)}
                            className={`px-2 py-0.5 rounded-lg flex items-center gap-1.5 transition-all duration-200 hover:scale-105 active:scale-95 animate-fade-in shrink-0 cursor-pointer ${
                              hasSelected
                                ? 'bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/80 dark:hover:bg-emerald-900/90 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
                                : 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 dark:hover:bg-amber-900/90 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
                            }`}
                            title={hasSelected ? `نحوه آشنایی: ${selectedMethodObj?.name} - کلیک جهت تغییر` : "انتخاب نحوه آشنایی"}
                          >
                            {hasSelected ? (
                              <div className="w-4 h-4 bg-emerald-600 text-white rounded-md flex items-center justify-center shrink-0">
                                <Check className="w-3 h-3" />
                              </div>
                            ) : (
                              <div className="w-4 h-4 bg-amber-600 text-white rounded-md flex items-center justify-center shrink-0">
                                <HelpCircle className="w-3 h-3" />
                              </div>
                            )}
                            <span className="text-[10px] font-bold">
                              نحوه آشنایی{hasSelected ? `: ${selectedMethodObj?.name}` : ''}
                            </span>
                          </button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <input
                    type="text"
                    autoComplete="off"
                    value={counterpartAddress}
                    onChange={(e) => setCounterpartAddress(e.target.value)}
                    placeholder="نشانی کامل خریدار یا تامین‌کننده..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 placeholder:text-slate-400"
                  />
                </div>

                {/* نحوه آشنایی (را پیشبی برای ثبت شده از   با  شماره  به به طرف‌حساب) */}
                {(() => {
                  const trimmedName = counterpartName.trim();
                  const trimmedPhone = counterpartPhone.trim();
                  
                  // بررسی ثبت خودکار یا انتساب به طرف‌حساب
                  const isBothFieldsFilled = trimmedName !== '' && trimmedPhone !== '';
                  if (!isBothFieldsFilled) return null;

                  const isExistingCp = counterparts.some(cp => {
                    const sameName = cp.name.trim().toLowerCase() === trimmedName.toLowerCase();
                    const samePhone = trimmedPhone !== 'ثبت نشده' && cp.phone && cp.phone.trim() !== 'ثبت نشده' && cp.phone.trim() === trimmedPhone;
                    return sameName || samePhone;
                  });

                  const isNewCp = !isExistingCp;
                  if (!isNewCp) return null;

                  if (!isAcquaintanceExpanded) return null;

                  // استخراج ردیف‌های کالا و خدمات از فیش پرداختی
                  return (
                    <div className="w-full mt-2 p-3 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-2xl shadow-xs transition-all duration-300 animate-fade-in" dir="rtl">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-amber-200/80 dark:border-amber-900/60">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                          </span>
                          <span className="text-xs font-black text-amber-900 dark:text-amber-200 flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>نحوه آشنایی با مجموعه (الزامی)</span>
                            <span className="text-rose-600 dark:text-rose-400 font-black text-xs">*</span>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsAcquaintanceExpanded(false)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold p-1 rounded-lg hover:bg-amber-100/60 dark:hover:bg-amber-900/60 transition-colors cursor-pointer flex items-center gap-1"
                          title="بستن پنجره"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center justify-start gap-2">
                        {acquaintanceMethods.map((method) => {
                          const isSelected = selectedAcquaintanceMethod === method.id;
                          return (
                            <button
                              key={method.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedAcquaintanceMethod(null);
                                } else {
                                  setSelectedAcquaintanceMethod(method.id);
                                  setIsAcquaintanceExpanded(false); // بستن یکاین پیشبی برای الزامی است
                                }
                              }}
                              className={`px-2.5 py-1.5 rounded-xl border cursor-pointer flex items-center gap-2 text-xs font-bold transition-all duration-200 select-none shadow-2xs ${
                                isSelected
                                  ? 'border-emerald-600 dark:border-emerald-400 bg-emerald-600 text-white shadow-md scale-102 ring-2 ring-emerald-500/30'
                                  : 'border-amber-200 dark:border-amber-800/70 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:border-amber-500 hover:bg-amber-100/50 dark:hover:bg-amber-950/50'
                              }`}
                            >
                              <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                {method.iconData ? (
                                  <img src={method.iconData} alt={method.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className={`text-[10px] font-black ${isSelected ? 'text-white' : 'text-amber-700 dark:text-amber-300'}`}>
                                    {method.name ? method.name[0] : 'آیا'}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-bold whitespace-nowrap">{method.name}</span>
                              {isSelected && <span className="text-[10px] font-black text-emerald-200 mr-0.5"></span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* روش ارتباطی و روش ارسال */}
              {activeType === 'sale' && (
                <div className="flex flex-wrap items-start gap-4 shrink-0 max-w-full">
                  {/* روش ارتباطی */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block">
                      انتخاب راه ارتباطی <span className="text-rose-500 font-black">*</span>
                    </label>
                    <div className="flex flex-wrap items-center justify-start gap-1.5 pt-0.5">
                      {(() => {
                        const activeSystemIcons = systemIcons.filter(icon => !!icon.iconData);
                        if (activeSystemIcons.length === 0) {
                          return (
                            <span className="text-[10.5px] text-slate-400 dark:text-slate-500 italic block pt-1">
                              هیچ روش ارتباطی انتخاب نشده است
                            </span>
                          );
                        }
                        return activeSystemIcons.map((icon) => {
                          const isSelected = selectedCustomIcons.includes(icon.id);
                          return (
                            <button
                              key={icon.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedCustomIcons(prev => prev.filter(id => id !== icon.id));
                                } else {
                                  setSelectedCustomIcons(prev => [...prev, icon.id]);
                                }
                              }}
                              title={icon.name}
                              className={`w-8 h-8 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all relative select-none ${
                                isSelected
                                  ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 scale-105 opacity-100 shadow-sm'
                                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-50 hover:opacity-100'
                              }`}
                            >
                              <img src={icon.iconData} alt={icon.name} className="w-full h-full object-cover rounded-full" />
                              {isSelected && (
                                <span className="absolute -top-1 -right-1 bg-indigo-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[7px] border border-white font-bold">
                                  
                                </span>
                              )}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* الزامی است روش ارسال */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block">
                      نوع ارسال <span className="text-rose-500 font-black">*</span>
                    </label>
                    <div className="flex flex-wrap items-center justify-start gap-1.5 pt-0.5">
                      {shippingMethods.map((method) => {
                        const isSelected = selectedShippingMethod === method.id;
                        return (
                          <button
                            key={method.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedShippingMethod(null);
                              } else {
                                setSelectedShippingMethod(method.id);
                              }
                            }}
                            title={method.name}
                            className={`w-8 h-8 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all relative select-none ${
                              isSelected
                                ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 scale-105 opacity-100 shadow-sm'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-50 hover:opacity-100'
                            }`}
                          >
                            {method.iconData ? (
                              <img src={method.iconData} alt={method.name} className="w-full h-full object-cover rounded-full" />
                            ) : (
                              <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400">{method.name ? method.name[0] : 'از'}</span>
                            )}
                            {isSelected && (
                              <span className="absolute -top-1 -right-1 bg-indigo-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[7px] border border-white font-bold">
                                
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Interactive Grid Table for items / services */}
            <div className="space-y-3 max-w-full">
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm bg-white dark:bg-slate-950 p-4 space-y-3 max-w-full relative z-10 overflow-visible">
                
                {/* Headers (Desktop only layout) */}
                <div className="hidden md:flex items-center gap-2 text-center text-slate-500 font-bold text-[11px] pb-1 border-b border-slate-200 dark:border-slate-800 w-full">
                  <div className="w-[4.2%] min-w-[28px] text-center shrink-0">ردیف</div>
                  <div className="w-[25.84%] text-right shrink-0">نام کالا و خدمات</div>
                  <div className="w-[4%] min-w-[32px] text-center shrink-0">تعداد</div>
                  <div className="w-[17.16%] text-left shrink-0">مبلغ واحد ({currencyLabel})</div>
                  <div className="w-[17.86%] text-left shrink-0">مبلغ کل ({currencyLabel})</div>
                  <div className="flex-1 text-center">توضیحات</div>
                </div>

                <div className="space-y-3">
                  {gridRows.map((row, idx) => {
                    // Filter matching stock/item suggestions and category suggestions
                    const isSearchingThis = activeSearchIdx === idx;
                    const rawQuery = row.name;
                    const query = rawQuery.trim().toLowerCase();

                    const isConsumablesQuery = 
                      query.includes('بخش') || 
                      query.includes('تامبلغ') || 
                      query.includes('با') || 
                      query.includes('برای') || 
                      query.includes('چاپ') || 
                      query.includes('بهاز') || 
                      query.includes('پیشفروشوارد') || 
                      query.includes('یکواردتا') || 
                      query.includes('بستن') || 
                      query.includes('adv') || 
                      query.includes('consumable');

                    const isServicesQuery = query.includes('خدمات') || query.includes('بیازبی') || query.includes('khadamat');
                    const isGoodsQuery = query.includes('کالا') || query.includes('باتلفن') || query.includes('kala');

                    // 1. Matching items in warehouse (including consumables and services)
                    const itemSuggestions = query === ''
                      ? []
                      : items.filter(it => {
                          const formatted = formatItemNameWithColor(it.name, it.color).toLowerCase();
                          const baseName = it.name.toLowerCase();
                          const catName = (it.categoryName || '').toLowerCase();
                          const parentCat = (it.parentCategory || '').toLowerCase();
                          const subCat = (it.subCategory || '').toLowerCase();

                          if (baseName.includes(query) || formatted.includes(query)) return true;
                          if (catName && catName.includes(query)) return true;
                          if (parentCat && parentCat.includes(query)) return true;
                          if (subCat && subCat.includes(query)) return true;

                          if (it.type === 'consumables' && isConsumablesQuery) return true;
                          if (it.type === 'khadamat' && isServicesQuery) return true;
                          if (it.type === 'kala' && isGoodsQuery) return true;

                          return false;
                        }).slice(0, 10);

                    // 2. Matching categories (including consumables, advertising, and physical goods)
                    const categorySuggestions = query === ''
                      ? []
                      : allWarehouseCategories.filter(c => {
                          const f = (c.final || '').toLowerCase();
                          const s = (c.sub || '').toLowerCase();
                          const p = (c.parent || '').toLowerCase();

                          if (f.includes(query) || s.includes(query) || p.includes(query)) return true;
                          if ((c.type === 'consumables' || p.includes('با بخش') || f.includes('با بخش') || f.includes('ملزومات')) && isConsumablesQuery) return true;
                          if (c.type === 'khadamat' && isServicesQuery) return true;
                          if (c.type === 'kala' && isGoodsQuery) return true;

                          return false;
                        }).slice(0, 8);

                    const allSuggestions = [
                      ...categorySuggestions.map(cat => ({ kind: 'category' as const, data: cat })),
                      ...itemSuggestions.map(it => ({ kind: 'item' as const, data: it }))
                    ];

                    return (
                      <div key={idx} className={`flex flex-col md:flex-row items-center gap-2 md:gap-2 border border-slate-200/60 dark:border-slate-850 bg-white dark:bg-slate-900 md:bg-transparent dark:md:bg-transparent p-3 md:p-0 rounded-lg relative w-full ${isSearchingThis ? 'z-40' : 'z-0'}`}>
                        
                        {/* 1. Row number */}
                        <div className="w-full md:w-[4.2%] md:min-w-[28px] font-mono text-center text-xs font-bold text-slate-500 flex items-center md:justify-center justify-between gap-1 shrink-0">
                          <span className="md:hidden text-[10px] text-slate-450">ردیف:</span>
                          <div className="flex items-center gap-1">
                            <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px]">{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setMoveRowModalIndex(idx);
                                setTargetRowNumberInput(String(idx + 1));
                              }}
                              className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-all cursor-pointer"
                              title="مرتب‌سازی ردیف‌ها"
                            >
                              <ArrowUpDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* 2. Description (Autocomplete field) */}
                        <div className="w-full md:w-[25.84%] relative space-y-1 md:space-y-0 shrink-0">
                          <span className="md:hidden text-[10px] font-bold text-slate-500 block">شرح خدمت / کالا</span>
                          <input
                            type="text"
                            id={`desc-${idx}`}
                            name={`invoice_item_desc_${idx}`}
                            autoComplete="off"
                            aria-autocomplete="none"
                            readOnly={!!row.itemId}
                            value={row.name}
                            onChange={(e) => {
                              if (!row.itemId) {
                                updateRowField(idx, 'name', e.target.value);
                                setActiveSearchIdx(idx);
                              }
                            }}
                            onFocus={(e) => {
                              if (!row.itemId) {
                                setActiveSearchIdx(idx);
                              }
                              const target = e.target;
                              setTimeout(() => {
                                target.select();
                              }, 0);
                            }}
                            onBlur={() => {
                              // Delay closing to allow clicking suggestions
                              setTimeout(() => {
                                if (activeSearchIdx === idx) {
                                  setActiveSearchIdx(null);
                                }
                              }, 200);
                            }}
                            onKeyDown={(e) => {
                              if (isSearchingThis && allSuggestions.length > 0) {
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  setActiveItemIndex(prev => (prev + 1) % allSuggestions.length);
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  setActiveItemIndex(prev => (prev - 1 + allSuggestions.length) % allSuggestions.length);
                                } else if (e.key === 'Enter') {
                                  if (activeItemIndex >= 0 && activeItemIndex < allSuggestions.length) {
                                    e.preventDefault();
                                    const selected = allSuggestions[activeItemIndex];
                                    if (selected.kind === 'category') {
                                      handleSelectCategorySuggestion(idx, selected.data);
                                    } else {
                                      handleSelectAutocompleteItem(idx, selected.data);
                                    }
                                  } else {
                                    e.preventDefault();
                                    const isUndef = handleCheckRowItemName(idx, row.name);
                                    if (!isUndef) {
                                      document.getElementById(`qty-${idx}`)?.focus();
                                    }
                                  }
                                } else if (e.key === 'Escape') {
                                  setActiveSearchIdx(null);
                                }
                              } else {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const isUndef = handleCheckRowItemName(idx, row.name);
                                  if (!isUndef) {
                                    document.getElementById(`qty-${idx}`)?.focus();
                                  }
                                }
                              }
                              if (e.key === 'Tab') {
                                const isUndef = handleCheckRowItemName(idx, row.name);
                                if (isUndef) {
                                  e.preventDefault();
                                }
                              }
                            }}
                            placeholder="نام کالا یا دسته‌بندی را جستجو و انتخاب کنید..."
                            className={`w-full px-2.5 py-1.5 border rounded-lg text-xs text-right leading-5 transition-all ${
                              row.itemId 
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold border-emerald-500/80 dark:border-emerald-600 pl-20 cursor-not-allowed' 
                                : 'bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-800 placeholder:text-slate-400'
                            }`}
                          />

                          {/* Lock badge & Clear button for catalog selected items */}
                          {row.itemId && (
                            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
                              <span className="text-[9.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                                <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span className="hidden sm:inline">انتخاب‌شده</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...gridRows];
                                  updated[idx] = {
                                    ...updated[idx],
                                    itemId: undefined,
                                    name: '',
                                    color: undefined,
                                    unitPrice: 0
                                  };
                                  setGridRows(updated);
                                  setTimeout(() => {
                                    document.getElementById(`desc-${idx}`)?.focus();
                                  }, 50);
                                }}
                                className="p-1 rounded-md bg-slate-200 hover:bg-rose-100 hover:text-rose-600 dark:bg-slate-700 dark:hover:bg-rose-950 dark:hover:text-rose-400 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                title="تنظیمات ردیف کالا"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          {/* Autocomplete panel for Categories and Items - Dynamic width that expands for long product names */}
                          {isSearchingThis && row.name.trim() !== '' && (categorySuggestions.length > 0 || itemSuggestions.length > 0) && (
                            <div className="absolute z-50 right-0 top-full mt-1 min-w-full w-max max-w-[min(92vw,720px)] bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl shadow-2xl max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 dropdown-solid ring-1 ring-black/5">
                              {/* 1. Categories Section (e.g. Consumables & Advertising) */}
                              {categorySuggestions.length > 0 && (
                                <div>
                                  <div className="px-3.5 py-2 bg-purple-50/90 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 text-[10.5px] font-black flex items-center justify-between border-b border-purple-200/60 dark:border-purple-900/40 sticky top-0 z-10 backdrop-blur-xs">
                                    <span className="flex items-center gap-1.5">
                                      <FolderTree className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                      مواد مصرفی و تبلیغات ({toPersianDigits(categorySuggestions.length)})
                                    </span>
                                    <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400">کلیک جهت انتخاب و درج</span>
                                  </div>
                                  {categorySuggestions.map((cat, catIdx) => {
                                    const isCatActive = catIdx === activeItemIndex;
                                    const isConsumableCat = cat.type === 'consumables' || cat.parent.includes('مصرفی') || cat.final.includes('مصرفی') || cat.final.includes('ملزوماتاست');
                                    const isServiceCat = cat.type === 'khadamat' || cat.parent.includes('خدمات');

                                    return (
                                      <button
                                        key={`cat-${cat.parent}-${cat.sub}-${cat.final}`}
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          handleSelectCategorySuggestion(idx, cat);
                                        }}
                                        className={`w-full text-right px-3.5 py-2.5 text-xs hover:bg-purple-50/70 dark:hover:bg-purple-950/50 text-slate-700 dark:text-slate-300 flex justify-between items-center gap-4 cursor-pointer transition-colors border-b border-slate-100/70 dark:border-slate-800/60 ${
                                          isCatActive ? 'bg-purple-100/80 dark:bg-purple-900/50 font-extrabold ring-1 ring-purple-500' : ''
                                        }`}
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0 pr-1 flex-1">
                                          <FolderTree className="w-4 h-4 text-purple-500 shrink-0" />
                                          <div className="flex flex-col text-right">
                                            <span className="font-bold text-slate-800 dark:text-slate-100 leading-snug">{cat.final}</span>
                                            <span className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-normal">
                                              {cat.parent} {cat.sub ? `> ${cat.sub}` : ''}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="shrink-0 flex items-center gap-1.5 pl-1">
                                          {isConsumableCat ? (
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 whitespace-nowrap">
                                              کالای مصرفی و ملزومات
                                            </span>
                                          ) : isServiceCat ? (
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                                              خدمات نوع
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 whitespace-nowrap">
                                              کالا براییک
                                            </span>
                                          )}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* 2. Items Section */}
                              {itemSuggestions.length > 0 && (
                                <div>
                                  {categorySuggestions.length > 0 && (
                                    <div className="px-3.5 py-2 bg-slate-100/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-[10.5px] font-black flex items-center justify-between border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 backdrop-blur-xs">
                                      <span className="flex items-center gap-1.5">
                                        <Package className="w-3.5 h-3.5 text-slate-500" />
                                        کالاهای تعریف‌شده در انبار ({toPersianDigits(itemSuggestions.length)})
                                      </span>
                                    </div>
                                  )}
                                  {itemSuggestions.map((it, itemIdx) => {
                                    const globalIdx = categorySuggestions.length + itemIdx;
                                    const isItemActive = globalIdx === activeItemIndex;
                                    const isConsumable = it.type === 'consumables';
                                    const isService = it.type === 'khadamat';

                                    return (
                                      <button
                                        key={it.id}
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          handleSelectAutocompleteItem(idx, it);
                                        }}
                                        className={`w-full text-right px-3.5 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex justify-between items-center gap-4 cursor-pointer transition-colors ${
                                          isItemActive ? 'bg-blue-50 dark:bg-slate-800 font-extrabold ring-1 ring-blue-500' : ''
                                        }`}
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0 pr-1 flex-1">
                                          {isConsumable ? (
                                            <Package className="w-4 h-4 text-purple-500 shrink-0" />
                                          ) : isService ? (
                                            <Tag className="w-4 h-4 text-amber-500 shrink-0" />
                                          ) : (
                                            <Package className="w-4 h-4 text-blue-500 shrink-0" />
                                          )}
                                          <div className="flex flex-col text-right">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-bold text-slate-800 dark:text-slate-100 leading-snug">{formatItemNameWithColor(it.name, it.color)}</span>
                                              {isConsumable ? (
                                                <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 whitespace-nowrap">
                                                  کالای مصرفی و ملزومات
                                                </span>
                                              ) : isService ? (
                                                <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                                                  خدمات
                                                </span>
                                              ) : (
                                                <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 whitespace-nowrap">
                                                  کالا
                                                </span>
                                              )}
                                            </div>
                                            {it.categoryName && (
                                              <span className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-normal">
                                                {it.parentCategory ? `${it.parentCategory} > ` : ''}{it.categoryName}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <span className="text-[10.5px] font-mono text-slate-500 dark:text-slate-400 shrink-0 pl-1 whitespace-nowrap">
                                          {((it.type === 'kala' || it.type === 'consumables') ? `به: ${toPersianDigits(it.qty)} | ` : '') + formatCurrency(activeType === 'sale' ? (it.lastSalePrice || 0) : (it.lastPurchasePrice || 0))}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 3. Qty */}
                        <div className="w-full md:w-[4%] md:min-w-[32px] space-y-1 md:space-y-0 shrink-0 relative">
                          <span className="md:hidden text-[10px] font-bold text-slate-500 block">تعداد</span>
                          {(() => {
                            const rowNameTrimmed = row.name.trim();
                            let matchedItem = row.itemId ? items.find(it => it.id === row.itemId) : undefined;
                            if (!matchedItem && rowNameTrimmed) {
                              matchedItem = items.find(it => {
                                const baseName = it.name.trim().toLowerCase();
                                const fullNameWithColor = formatItemNameWithColor(it.name, it.color).trim().toLowerCase();
                                const inputName = rowNameTrimmed.toLowerCase();
                                return baseName === inputName || fullNameWithColor === inputName;
                              });
                            }

                            const isGoods = matchedItem && matchedItem.type !== 'khadamat';
                            const oldQty = (editingInvoice && editingInvoice.type === 'sale' && !editingInvoice.isProforma && matchedItem)
                              ? (editingInvoice.items.find(it => it.itemId === matchedItem!.id || it.name.trim().toLowerCase() === matchedItem!.name.trim().toLowerCase())?.quantity || 0)
                              : 0;
                            const availableStock = matchedItem ? (matchedItem.qty || 0) + oldQty : 0;
                            const isDeficit = activeType === 'sale' && isGoods && (row.qty > availableStock);

                            return (
                              <>
                                <input
                                  type="text"
                                  id={`qty-${idx}`}
                                  autoComplete="off"
                                  value={row.qty ? toPersianDigits(row.qty) : ''}
                                  onChange={(e) => {
                                    const cleanStr = toEnglishDigits(e.target.value).replace(/[^0-9.]/g, '');
                                    const parsed = cleanStr === '' ? 0 : parseFloat(cleanStr);
                                    updateRowField(idx, 'qty', isNaN(parsed) ? 0 : parsed);
                                  }}
                                  onBlur={() => {
                                    if (!row.qty || row.qty <= 0) {
                                      updateRowField(idx, 'qty', 1);
                                    }
                                  }}
                                  onFocus={(e) => {
                                    const isUndef = handleCheckRowItemName(idx, row.name);
                                    if (isUndef) {
                                      e.target.blur();
                                      return;
                                    }
                                    const target = e.target;
                                    setTimeout(() => {
                                      target.select();
                                    }, 0);
                                  }}
                                  onClick={(e) => {
                                    (e.target as HTMLInputElement).select();
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      document.getElementById(`price-${idx}`)?.focus();
                                    }
                                  }}
                                  className={`w-full p-1.5 border rounded-lg text-xs font-mono text-center transition-all ${
                                    isDeficit 
                                      ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold ring-2 ring-rose-400/40' 
                                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100'
                                  }`}
                                  title={isGoods ? `موجودی انبار: ${toPersianDigits(availableStock)} عدد` : undefined}
                                />
                                {isGoods && activeType === 'sale' && (
                                  <div className="text-[9px] font-mono text-center mt-0.5 whitespace-nowrap leading-tight hidden md:block">
                                    {isDeficit ? (
                                      <span className="text-rose-600 dark:text-rose-400 font-bold" title={`کسری موجودی: ${toPersianDigits(row.qty - availableStock)} عدد`}>
                                        کسری موجودی {toPersianDigits(row.qty - availableStock)}!
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 dark:text-slate-500" title="موجودی انبار">
                                        به: {toPersianDigits(availableStock)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        {/* 4. Unit Price */}
                        <div className="w-full md:w-[17.16%] space-y-1 md:space-y-0 shrink-0">
                          <span className="md:hidden text-[10px] font-bold text-slate-500 block">مبلغ واحد</span>
                          <input
                            type="text"
                            id={`price-${idx}`}
                            autoComplete="off"
                            value={row.unitPrice ? row.unitPrice.toLocaleString('en-US') : ''}
                            onChange={(e) => {
                              const cleanVal = toEnglishDigits(e.target.value).replace(/,/g, '').replace(/[^0-9.]/g, '');
                              const parsed = cleanVal === '' ? 0 : parseFloat(cleanVal);
                              updateRowField(idx, 'unitPrice', isNaN(parsed) ? 0 : parsed);
                            }}
                            onFocus={(e) => {
                              const target = e.target;
                              setTimeout(() => {
                                target.select();
                              }, 0);
                            }}
                            onBlur={() => {
                              const basePrice = getItemBasePrice(row);
                              if (activeType === 'sale' && basePrice > 0 && row.unitPrice < basePrice) {
                                const entered = row.unitPrice;
                                updateRowField(idx, 'unitPrice', basePrice);
                                setPriceErrorModal({
                                  isOpen: true,
                                  rowIdx: idx,
                                  itemName: row.name || 'کالا الزامی است شده',
                                  enteredPrice: entered,
                                  basePrice: basePrice
                                });
                              }
                            }}
                            onClick={(e) => {
                              (e.target as HTMLInputElement).select();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const basePrice = getItemBasePrice(row);
                                if (activeType === 'sale' && basePrice > 0 && row.unitPrice < basePrice) {
                                  const entered = row.unitPrice;
                                  updateRowField(idx, 'unitPrice', basePrice);
                                  setPriceErrorModal({
                                    isOpen: true,
                                    rowIdx: idx,
                                    itemName: row.name || 'کالا الزامی است شده',
                                    enteredPrice: entered,
                                    basePrice: basePrice
                                  });
                                  return;
                                }
                                document.getElementById(`remarks-${idx}`)?.focus();
                              }
                            }}
                            className="w-full p-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono text-left bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                            placeholder="مبلغ..."
                          />
                          <span className="text-[9px] text-blue-600 block text-left font-mono mt-0.5 md:hidden">
                            {formatCurrency(row.unitPrice)}
                          </span>
                        </div>

                        {/* 5. Row Total */}
                        <div className="w-full md:w-[17.86%] space-y-1 md:space-y-0 text-left font-mono shrink-0">
                          <span className="md:hidden text-[10px] font-bold text-slate-500 block">جمع ردیف</span>
                          <div className="w-full p-1.5 bg-slate-100 dark:bg-slate-850 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 text-left">
                            {formatCurrency(calcRowTotal(row.qty, row.unitPrice))}
                          </div>
                        </div>

                        {/* 6. Remarks & Tag Badges */}
                        <div className="w-full md:flex-1 space-y-1 md:space-y-0 flex items-center justify-between gap-1">
                          <div className="flex-1 relative">
                            <span className="md:hidden text-[10px] font-bold text-slate-500 block">ملاحظات و تگ‌ها</span>
                            <div className="min-h-[38px] p-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-amber-500/40">
                              
                              {/* Render attached tag chips */}
                              {(() => {
                                let savedTags: any[] = [];
                                try {
                                  const raw = localStorage.getItem('commission_tags_list');
                                  if (raw) savedTags = JSON.parse(raw);
                                } catch (e) {}
                                if (savedTags.length === 0) {
                                  savedTags = [
                                    { id: '1', name: 'ثبتبیاست  کالا ثبتاین' },
                                    { id: '2', name: 'پیش‌پرداختاین  این' }
                                  ];
                                }

                                const currentRemarks = row.remarks || '';
                                const matchedTags = savedTags.filter(t => t.name && currentRemarks.includes(t.name));

                                return matchedTags.map(t => (
                                  <span
                                    key={t.id || t.name}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0 bg-amber-100/90 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 rounded text-[10px] font-black shrink-0 select-none leading-normal"
                                  >
                                    <span>{t.name}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        let updated = currentRemarks
                                          .replace(`[${t.name}]`, '')
                                          .replace(t.name, '')
                                          .replace(/\s+/g, ' ')
                                          .trim();
                                        updateRowField(idx, 'remarks', updated);
                                      }}
                                      className="p-0 hover:text-rose-600 dark:hover:text-rose-400 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer mr-0.5"
                                      title="حذف تگ"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </span>
                                ));
                              })()}

                              {/* Free-form notes input */}
                              <input
                                type="text"
                                id={`remarks-${idx}`}
                                autoComplete="off"
                                value={(() => {
                                  let savedTags: any[] = [];
                                  try {
                                    const raw = localStorage.getItem('commission_tags_list');
                                    if (raw) savedTags = JSON.parse(raw);
                                  } catch (e) {}
                                  let remText = row.remarks || '';
                                  savedTags.forEach(t => {
                                    if (t.name) {
                                      remText = remText.replace(`[${t.name}]`, '').replace(t.name, '');
                                    }
                                  });
                                  return remText.trimStart();
                                })()}
                                onChange={(e) => {
                                  let savedTags: any[] = [];
                                  try {
                                    const raw = localStorage.getItem('commission_tags_list');
                                    if (raw) savedTags = JSON.parse(raw);
                                  } catch (e) {}
                                  const currentRemarks = row.remarks || '';
                                  const activeTagNames = savedTags.filter(t => t.name && currentRemarks.includes(t.name)).map(t => `[${t.name}]`);
                                  const newFreeText = e.target.value;
                                  const combined = [...activeTagNames, newFreeText].filter(Boolean).join(' ');
                                  updateRowField(idx, 'remarks', combined);
                                }}
                                onFocus={(e) => {
                                  const target = e.target;
                                  setTimeout(() => { target.select(); }, 0);
                                }}
                                onClick={(e) => { (e.target as HTMLInputElement).select(); }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (idx === gridRows.length - 1) {
                                      setGridRows([...gridRows, { name: '', qty: 1, unitPrice: 0, remarks: '' }]);
                                      setTimeout(() => { document.getElementById(`desc-${idx + 1}`)?.focus(); }, 80);
                                    } else {
                                      document.getElementById(`desc-${idx + 1}`)?.focus();
                                    }
                                  }
                                }}
                                placeholder={(() => {
                                  let savedTags: any[] = [];
                                  try {
                                    const raw = localStorage.getItem('commission_tags_list');
                                    if (raw) savedTags = JSON.parse(raw);
                                  } catch (e) {}
                                  const currentRemarks = row.remarks || '';
                                  const hasTags = savedTags.some(t => t.name && currentRemarks.includes(t.name));
                                  return hasTags ? "توضیحات و برچسب‌ها..." : "توضیحات...";
                                })()}
                                className="flex-1 min-w-[70px] bg-transparent border-none outline-none text-xs text-slate-800 dark:text-slate-100 p-0 font-medium"
                              />

                              {/* Button to open tag picker modal */}
                              <button
                                type="button"
                                onClick={() => {
                                  setTagModalRowIdx(idx);
                                  let savedTags: any[] = [];
                                  try {
                                    const raw = localStorage.getItem('commission_tags_list');
                                    if (raw) savedTags = JSON.parse(raw);
                                  } catch (e) {}
                                  if (savedTags.length === 0) {
                                    savedTags = [
                                      { id: '1', name: 'ثبتبیاست  کالا ثبتاین' },
                                      { id: '2', name: 'پیش‌پرداختاین  این' }
                                    ];
                                  }
                                  const currentRemarks = row.remarks || '';
                                  const currentlySelected = savedTags.filter(t => t.name && currentRemarks.includes(t.name)).map(t => t.name);
                                  setSelectedModalTagNames(currentlySelected);
                                }}
                                className="p-1 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 cursor-pointer transition-colors shrink-0 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/70 border border-amber-200 dark:border-amber-900/60 rounded-md"
                                title="افزودن توضیحات یا تگ به ردیف"
                              >
                                <Tag className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Delete row button (only if grid length > 1) */}
                          {gridRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(idx)}
                              className="p-1 px-1.5 bg-rose-50 hover:bg-rose-150 text-rose-600 rounded-lg border border-rose-100 dark:border-rose-950 dark:bg-rose-950 dark:text-rose-450 self-end md:self-auto cursor-pointer"
                              title="حذف ردیف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>

                {/* Precision Column Summary Footer for Items Grid */}
                <div className="hidden md:flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold text-xs pt-2.5 pb-2 border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900/80 px-2 rounded-xl mt-1 shadow-inner">
                  <div className="w-[4.2%] min-w-[28px] text-center shrink-0 font-mono text-[11px] text-slate-500">
                    {toPersianDigits(gridRows.length)}
                  </div>
                  <div className="w-[25.84%] text-right shrink-0 text-slate-700 dark:text-slate-300 font-extrabold text-[11px]">
                    جمع کل ستون اقلام ({toPersianDigits(gridRows.filter(r => (r.name && r.name.trim() !== '') || (Number(r.qty) > 0 && Number(r.unitPrice) > 0)).length)} ردیف معتبر)
                  </div>
                  <div className="w-[4%] min-w-[32px] text-center shrink-0 font-mono text-blue-700 dark:text-blue-400 font-black text-xs" title="جمع تعداد کالاها">
                    {toPersianDigits(totalGridQty)}
                  </div>
                  <div className="w-[17.16%] text-left shrink-0 text-[10px] text-slate-400">
                    مجموع کالاها
                  </div>
                  <div className="w-[17.86%] text-left shrink-0 font-mono text-emerald-700 dark:text-emerald-400 font-extrabold text-xs">
                    {formatCurrency(subtotal)}
                  </div>
                  <div className="flex-1 text-right text-[10px] text-slate-500 font-medium">
                    جمع دقیق و بدون خطای اقلام ({currencyLabel})
                  </div>
                </div>

                {/* Mobile Summary Strip */}
                <div className="md:hidden flex items-center justify-between p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold mt-2">
                  <span className="text-slate-600 dark:text-slate-400">
                    جمع کل اقلام ({toPersianDigits(gridRows.length)} ردیف - {toPersianDigits(totalGridQty)} عدد):
                  </span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-extrabold">
                    {formatCurrency(subtotal)}
                  </span>
                </div>

                {/* Subsidary action to add manually */}
                <button
                  type="button"
                  onClick={() => {
                    setGridRows([...gridRows, { name: '', qty: 1, unitPrice: 0, remarks: '' }]);
                  }}
                  className="mt-2 py-1 px-3 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-250 dark:border-slate-800 text-slate-700 dark:text-slate-350 text-[10px] font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 w-fit"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن ردیف جدید (یا کلید Enter ملاحظات)</span>
                </button>

              </div>
            </div>

            {/* Calculations Section & Descriptions */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              
              {/* Right: Notes text area & Image attachments */}
              <div className="md:col-span-8 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">یادداشت و توضیحات ذیل فاکتور</label>
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="شرایط تسویه حساب نقدی، مهلت برگشت کالا، گارانتی یا نحوه تحویل..."
                    className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-slate-400"
                    rows={2}
                  />
                </div>

                {/* Advanced Drag & Drop / Copy & Paste WebP Image Upload Panel */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">پیوست تصاویر اسناد و فیش‌های واریزی (تبدیل خودکار به WebP)</label>
                  
                  <div
                    onDragOver={handleFormDragOver}
                    onDragLeave={handleFormDragLeave}
                    onDrop={handleFormDrop}
                    onPaste={handlePaste}
                    className={`border border-dashed rounded-xl p-3 text-center transition-all bg-white dark:bg-slate-900 flex flex-col items-center justify-center cursor-pointer ${
                      isFormDragging
                        ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 shadow-md scale-[1.01]'
                        : 'border-slate-250 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500'
                    }`}
                    onClick={() => document.getElementById('new-invoice-attachment-file')?.click()}
                  >
                    <input
                      type="file"
                      id="new-invoice-attachment-file"
                      multiple
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      جهت آپلود فیش یا تصویر، فایل را اینجا بکشید یا کلیک کنید (Ctrl+V جهت الصاق مستقیم)
                    </span>
                    <span className="text-[9px] text-slate-400 mt-1">
                      حداکثر حجم مجاز: ۵ مگابایت
                    </span>
                  </div>

                  {/* Thumbnail List of uploaded attachments */}
                  {attachments.length > 0 && (
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 mt-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-150 dark:border-slate-850">
                      {attachments.map((img, index) => (
                        <div key={index} className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 aspect-square">
                          <img
                            src={img}
                            alt={`upload-preview-${index}`}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAttachments(prev => prev.filter((_, idx) => idx !== index));
                            }}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 cursor-pointer flex items-center justify-center"
                            title="حذف تصویر"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI Extraction Status and Fields */}
                  {isExtracting && (
                    <div className="flex items-center gap-3 p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl mt-3 animate-pulse">
                      <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                      <span className="text-xs font-bold text-blue-700 dark:text-blue-400">هوش مصنوعی در حال استخراج خودکار مبلغ و تاریخ فیش واریزی...</span>
                    </div>
                  )}

                  {/* Empty space - slips moved to sidebar calculations container */}
                </div>
              </div>

              {/* Left Column: Tax, Deposit, Discount - Condense vertically and contiguous --- */}
              <div className="md:col-span-4 bg-slate-50 dark:bg-slate-950 p-4 border border-slate-150 dark:border-slate-850 rounded-2xl space-y-2.5 shadow-inner">
                <span className="text-[10px] text-slate-450 dark:text-slate-400 font-extrabold uppercase tracking-wider block border-b border-slate-200/50 dark:border-slate-800 pb-1">محاسبات مالی فاکتور</span>
                
                {/* 1. Tax */}
                <div className="flex items-center justify-between gap-3">
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">مالیات (۱۰٪)</span>
                    <button
                      type="button"
                      onClick={() => setTax(Math.round(subtotal * 0.10))}
                      className="px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-955 border border-blue-200 dark:border-blue-900 rounded-md text-[8px] font-black text-blue-700 dark:text-blue-400 transition-colors cursor-pointer block mt-1"
                    >
                      محاسبه ۱۰٪ ارزش افزوده
                    </button>
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      autoComplete="off"
                      value={tax ? tax.toLocaleString('en-US') : ''}
                      onChange={(e) => {
                        const clean = toEnglishDigits(e.target.value).replace(/,/g, '').replace(/[^0-9.]/g, '');
                        const parsed = clean === '' ? 0 : (parseFloat(clean) || 0);
                        setTax(parsed);
                      }}
                      onFocus={(e) => {
                        const target = e.target;
                        setTimeout(() => target.select(), 0);
                      }}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="w-full px-2 py-1.5 border border-slate-205 dark:border-slate-800 rounded-lg text-xs font-mono text-left bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-150"
                      placeholder={`${currencyLabel}...`}
                    />
                  </div>
                </div>

                {/* 2. Discount */}
                <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/50 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        تخفیف
                      </span>

                      {/* Two tiny icons/buttons to set/toggle discount type */}
                      <div className="flex items-center p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg border border-slate-300/60 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => {
                            if (discountType === 'percent') return;
                            if (discountValue > 0 && formSubtotal > 0) {
                              const p = Math.min(100, Math.round((discountValue / formSubtotal) * 100 * 10) / 10);
                              setDiscountValue(p);
                            } else {
                              setDiscountValue(0);
                            }
                            setDiscountType('percent');
                          }}
                          title="تخفیف درصدی (%)"
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-black flex items-center gap-0.5 transition-all cursor-pointer ${
                            discountType === 'percent'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          <Percent className="w-3 h-3" />
                          <span>٪</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (discountType === 'amount') return;
                            if (discountValue > 0 && formSubtotal > 0) {
                              const amt = Math.round((formSubtotal * discountValue) / 100);
                              setDiscountValue(amt);
                            } else {
                              setDiscountValue(0);
                            }
                            setDiscountType('amount');
                          }}
                          title={`تخفیف مبلغ (${currencyLabel})`}
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-black flex items-center gap-0.5 transition-all cursor-pointer ${
                            discountType === 'amount'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          <Banknote className="w-3 h-3" />
                          <span>{currencyLabel}</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        autoComplete="off"
                        value={discountValue ? (discountType === 'amount' ? discountValue.toLocaleString('en-US') : discountValue.toString()) : ''}
                        onChange={(e) => {
                          const clean = toEnglishDigits(e.target.value).replace(/,/g, '').replace(/[^0-9.]/g, '');
                          let parsed = clean === '' ? 0 : (parseFloat(clean) || 0);
                          if (discountType === 'percent' && parsed > 100) {
                            parsed = 100;
                          }
                          setDiscountValue(parsed);
                        }}
                        onFocus={(e) => {
                          const target = e.target;
                          setTimeout(() => target.select(), 0);
                        }}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        className="w-full px-2 py-1.5 border border-slate-205 dark:border-slate-800 rounded-lg text-xs font-mono text-left bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-150"
                        placeholder={discountType === 'percent' ? 'ازبر... (مثالبا ۱۰)' : `${currencyLabel}...`}
                      />
                    </div>
                  </div>

                  {discountValue > 0 && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono text-left pt-0.5 flex justify-between items-center bg-white/50 dark:bg-slate-900/50 p-1.5 rounded-md border border-slate-100 dark:border-slate-850">
                      <span className="font-sans text-[10px] font-medium text-slate-600 dark:text-slate-400">مبلغ با تخفیف:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 dir-ltr inline-block">
                        {formatCurrency(discount)}
                        {discountType === 'amount' && formSubtotal > 0 && (
                          <span className="text-slate-400 font-normal mr-1">
                            ({toPersianDigits(Math.round((discount / formSubtotal) * 100 * 10) / 10)}٪)
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. Deposit */}
                <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-slate-200/50 dark:border-slate-800/50">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">بیعانه دریافتی ({currencyLabel})</span>
                  
                  <div className="flex-1 flex items-center gap-1.5 max-w-[200px] justify-end">
                    <div
                      onClick={() => {
                        if (editingInvoice !== null && !editingInvoice.isProforma && currentUser.role === 'seller') return;
                        const now = new Date();
                        if (deposit > 0 && extractedSlips.length === 0) {
                          const existingSlip = {
                            id: `custom-slip-initial-${Date.now()}`,
                            amount: deposit,
                            date: getTodayJalali(),
                            time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
                            imageName: 'واریز بیعانه'
                          };
                          setExtractedSlips([existingSlip]);
                        }
                        setCustomDepositAmount('');
                        setCustomDepositDate(getTodayJalali());
                        setCustomDepositHour(now.getHours());
                        setCustomDepositMinute(now.getMinutes());
                        setShowCustomDepositModal(true);
                      }}
                      className="relative cursor-pointer flex-1 group"
                      title="چاپ مستقیم ویرایش واریز بیعانه"
                    >
                      <input
                        type="text"
                        autoComplete="off"
                        readOnly
                        tabIndex={-1}
                        value={deposit ? deposit.toLocaleString('en-US') : ''}
                        disabled={editingInvoice !== null && !editingInvoice.isProforma && currentUser.role === 'seller'}
                        className={`w-full px-2 py-1.5 border border-slate-205 dark:border-slate-800 rounded-lg text-xs font-mono text-left bg-slate-50 dark:bg-slate-850 text-slate-800 dark:text-slate-150 cursor-pointer select-none ${
                          editingInvoice !== null && !editingInvoice.isProforma && currentUser.role === 'seller'
                            ? 'bg-slate-100 dark:bg-slate-950 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75'
                            : 'group-hover:border-indigo-400 dark:group-hover:border-indigo-600'
                        }`}
                        placeholder="۰"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (editingInvoice !== null && !editingInvoice.isProforma && currentUser.role === 'seller') return;
                        const now = new Date();
                        if (deposit > 0 && extractedSlips.length === 0) {
                          const existingSlip = {
                            id: `custom-slip-initial-${Date.now()}`,
                            amount: deposit,
                            date: getTodayJalali(),
                            time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
                            imageName: 'واریز بیعانه'
                          };
                          setExtractedSlips([existingSlip]);
                        }
                        setCustomDepositAmount('');
                        setCustomDepositDate(getTodayJalali());
                        setCustomDepositHour(now.getHours());
                        setCustomDepositMinute(now.getMinutes());
                        setShowCustomDepositModal(true);
                      }}
                      disabled={editingInvoice !== null && !editingInvoice.isProforma && currentUser.role === 'seller'}
                      className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                      title="ثبت واریز بیعانه"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* جمع کل پرداختی */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-dashed border-slate-200 dark:border-slate-850 pb-2">
                  <span className="text-[11px] font-bold text-slate-500">جمع قابل پرداخت:</span>
                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    {formatCurrency(subtotal + tax - discount)}
                  </span>
                </div>

                {/* AI processed slips list - COMPACT & SIDEBAR DESIGN */}
                {extractedSlips.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 mt-2" dir="rtl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        رسیدها و فیش‌های استخراج شده ({toPersianDigits(extractedSlips.length)})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('آیا از حذف تمامی فیش‌ها و رسیدهای استخراج شده اطمینان دارید؟')) {
                            setExtractedSlips([]);
                            const isDepositLocked = editingInvoice !== null && !editingInvoice.isProforma && currentUser.role === 'seller';
                            if (!isDepositLocked) {
                              setDeposit(0);
                            }
                          }
                        }}
                        className="text-[9px] text-red-500 hover:text-red-700 font-bold cursor-pointer"
                      >
                        حذف همه
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto pr-1">
                      {extractedSlips.map((slip, idx) => (
                        <div key={slip.id} className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1.5 relative group shadow-sm">
                          {/* Slip Header */}
                          <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-800/40">
                            <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1">
                              <span className="bg-emerald-100 dark:bg-emerald-950/65 text-emerald-800 dark:text-emerald-450 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono font-bold">
                                {toPersianDigits(idx + 1)}
                              </span>
                              <span className="truncate max-w-[120px]" title={slip.imageName}>
                                {slip.imageName || `فیش شماره ${idx + 1}`}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setExtractedSlips(prev => {
                                  const updated = prev.filter(s => s.id !== slip.id);
                                  const newSum = updated.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
                                  const isDepositLocked = editingInvoice !== null && !editingInvoice.isProforma && currentUser.role === 'seller';
                                  if (!isDepositLocked) {
                                    setDeposit(newSum);
                                  }
                                  return updated;
                                });
                              }}
                              className="text-red-500 hover:text-red-700 text-[10px] transition-colors flex items-center cursor-pointer"
                              title="حذف این فیش"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Tiny Fields Row */}
                          <div className="grid grid-cols-3 gap-1">
                            {/* Amount field */}
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-bold text-slate-400 block text-center">مبلغ (وارد)</span>
                              <input
                                type="text"
                                autoComplete="off"
                                value={slip.amount ? slip.amount.toLocaleString('en-US') : ''}
                                disabled={editingInvoice !== null && !editingInvoice.isProforma && currentUser.role === 'seller'}
                                readOnly={editingInvoice !== null && !editingInvoice.isProforma && currentUser.role === 'seller'}
                                onChange={(e) => {
                                  if (editingInvoice !== null && !editingInvoice.isProforma && currentUser.role === 'seller') return;
                                  const clean = e.target.value.replace(/,/g, '');
                                  const parsed = parseFloat(clean) || 0;
                                  setExtractedSlips(prev => prev.map(s => s.id === slip.id ? { ...s, amount: parsed } : s));
                                }}
                                className="w-full px-1 py-0.5 border border-slate-200 dark:border-slate-850 rounded text-[9px] font-mono text-center bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold"
                              />
                            </div>

                            {/* Date field */}
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-bold text-slate-400 block text-center">تاریخ</span>
                              <input
                                type="text"
                                autoComplete="off"
                                value={slip.date}
                                onChange={(e) => {
                                  const val = clampToTodayIfFuture(e.target.value);
                                  setExtractedSlips(prev => prev.map(s => s.id === slip.id ? { ...s, date: val } : s));
                                }}
                                className="w-full px-1 py-0.5 border border-slate-200 dark:border-slate-850 rounded text-[9px] text-center bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold"
                              />
                            </div>

                            {/* Time field */}
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-bold text-slate-400 block text-center">ساعت</span>
                              <input
                                type="text"
                                autoComplete="off"
                                value={slip.time || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setExtractedSlips(prev => prev.map(s => s.id === slip.id ? { ...s, time: val } : s));
                                }}
                                className="w-full px-1 py-0.5 border border-slate-200 dark:border-slate-850 rounded text-[9px] text-center bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Total Info */}
                    <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/40 text-[9.5px] text-slate-500 flex justify-between items-center">
                      <span className="font-bold text-slate-600 dark:text-slate-400">جمع فاکتور:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(extractedSlips.reduce((sum, s) => sum + s.amount, 0))}
                      </span>
                    </div>
                  </div>
                )}

              </div>

            </div>

            {/* Bottom block: Amount in Numbers & Amount in Words */}
            <div className="border-t border-slate-150 dark:border-slate-850 pt-4 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 max-w-full">
              {/* Right block: written total text */}
              <div className="flex items-center gap-2 flex-wrap max-w-full min-w-0">
                <span className="text-xs font-bold text-slate-500 shrink-0">جمع فاکتور ({currencyLabel}) به حروف:</span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm leading-relaxed break-words max-w-full">
                  {numberToPersianWords(Math.max(0, finalTotal))} {currencyLabel}
                </span>
              </div>
              
              {/* Left block: numerical subtotal + tax - discount - deposit */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">مبلغ نهایی با کسر بیعانه:</span>
                <div className="px-4 py-2 bg-blue-50 dark:bg-blue-950 border border-blue-250 dark:border-blue-900 rounded-xl text-blue-800 dark:text-blue-300 font-mono font-bold text-lg">
                  {formatCurrency(Math.max(0, finalTotal))}
                </div>
              </div>
            </div>

            {/* Action footer layout */}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4" dir="rtl">
              {/* ۱. انصراف */}
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-350 dark:hover:bg-slate-750 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                id="btn-close-invoice"
              >
                انصراف
              </button>

              {/* ۳. پیش‌فاکتور */}
              <button
                type="button"
                onClick={() => {
                  const validRows = gridRows.filter(row => row.name.trim() !== '');
                  const errs: string[] = [];
                  if (counterpartName.trim() === '') {
                    errs.push('طرف‌حساب (خریدار یا فروشنده) وارد شده است.');
                  }
                  if (validRows.length === 0) {
                    errs.push('حداقل یک ردیف کالا یا خدمات معتبر در فاکتور وارد نمایید.');
                  }
                  if (errs.length > 0) {
                    setValidationModalPopup({
                      isOpen: true,
                      title: 'قفل و تأیید نهایی اطلاعات جهت پیش‌فاکتور فاکتور',
                      errors: errs
                    });
                    return;
                  }
                  setShowLivePreview(true);
                }}
                className="px-6 py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow hover:shadow-md cursor-pointer transition-colors flex items-center gap-1.5"
                id="btn-invoice-preview"
              >
                <Eye className="w-4 h-4" />
                <span>پیش‌نمایش</span>
              </button>

              {/* Conditional Action Buttons based on editingInvoice state */}
              {editingInvoice ? (
                editingInvoice.isProforma ? (
                  /* Editing a Proforma Invoice */
                  <>
                    <button
                      type="button"
                      disabled={isPhoneBlocked || isSavingInvoice}
                      onClick={() => handleSaveInvoiceInternal(undefined, true)}
                      className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors flex items-center gap-1.5 ${
                        isPhoneBlocked || isSavingInvoice
                          ? 'bg-amber-400 opacity-60 cursor-not-allowed hover:bg-amber-400'
                          : 'bg-amber-600 hover:bg-amber-700 hover:shadow-md cursor-pointer'
                      }`}
                      id="btn-save-proforma-edit"
                      title="ذخیره تغییرات از  پیش‌فاکتور با کهمجدد شماره  همینبراست"
                    >
                      <Save className="w-4 h-4" />
                      <span>{isSavingInvoice ? 'در حال ذخیره...' : 'ذخیره تغییرات پیش‌فاکتور'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isPhoneBlocked || isSavingInvoice}
                      onClick={() => handleSaveInvoiceInternal(undefined, false)}
                      className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors flex items-center gap-1.5 ${
                        isPhoneBlocked || isSavingInvoice
                          ? 'bg-emerald-400 opacity-60 cursor-not-allowed hover:bg-emerald-400'
                          : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-md cursor-pointer'
                      }`}
                      id="btn-convert-to-final"
                      title="تبدیل پیش‌فاکتور به فاکتور رسمی فروش"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isSavingInvoice ? 'در حال ثبت...' : 'صدور و ثبت فاکتور'}</span>
                    </button>
                  </>
                ) : (
                  /* Editing a Definitive Invoice */
                  <button
                    type="button"
                    disabled={isPhoneBlocked || isSavingInvoice}
                    onClick={() => handleSaveInvoiceInternal(undefined, false)}
                    className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors flex items-center gap-1.5 ${
                      isPhoneBlocked || isSavingInvoice
                        ? 'bg-emerald-400 opacity-60 cursor-not-allowed hover:bg-emerald-400'
                        : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-md cursor-pointer'
                      }`}
                    id="btn-save-invoice-edit"
                    title="ذخیره تغییرات در فاکتور رسمی"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingInvoice ? 'در حال ذخیره...' : 'ذخیره تغییرات فاکتور'}</span>
                  </button>
                )
              ) : (
                /* Creating New Invoice / Proforma */
                <>
                  {/* ۴. ذخیره پیش‌فاکتور */}
                  <button
                    type="button"
                    disabled={isPhoneBlocked || isSavingInvoice}
                    onClick={() => handleSaveInvoiceInternal(undefined, true)}
                    className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors flex items-center gap-1.5 ${
                      isPhoneBlocked || isSavingInvoice
                        ? 'bg-rose-400 opacity-60 cursor-not-allowed hover:bg-rose-400'
                        : 'bg-rose-600 hover:bg-rose-750 hover:shadow-md cursor-pointer'
                    }`}
                    id="btn-save-as-proforma"
                  >
                    <Tag className="w-4 h-4" />
                    <span>{isSavingInvoice ? 'در حال ثبت...' : 'صدور پیش‌فاکتور'}</span>
                  </button>

                  {/* ۵. ثبت و پرینت */}
                  <button
                    type="button"
                    disabled={isPhoneBlocked || isSavingInvoice}
                    onClick={() => handleSaveInvoiceInternal(undefined, false, true)}
                    className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors flex items-center gap-1.5 ${
                      isPhoneBlocked || isSavingInvoice
                        ? 'bg-blue-400 opacity-60 cursor-not-allowed hover:bg-blue-400'
                        : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md cursor-pointer'
                    }`}
                    id="btn-save-and-print"
                  >
                    <Printer className="w-4 h-4" />
                    <span>{isSavingInvoice ? 'در حال ثبت...' : 'ثبت و پرینت'}</span>
                  </button>

                  {/* ۶. ثبت نهایی */}
                  <button
                    type="button"
                    disabled={isPhoneBlocked || isSavingInvoice}
                    onClick={() => handleSaveInvoiceInternal(undefined, false)}
                    className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors flex items-center gap-1.5 ${
                      isPhoneBlocked || isSavingInvoice
                        ? 'bg-emerald-400 opacity-60 cursor-not-allowed hover:bg-emerald-400'
                        : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-md cursor-pointer'
                    }`}
                    id="btn-confirm-and-issue"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingInvoice ? 'در حال ثبت...' : 'ثبت نهایی'}</span>
                  </button>
                </>
              )}
            </div>

            {/* Offscreen container for copying image directly from form */}
            <div 
              className="no-print"
              style={{ position: 'fixed', left: '-9999px', top: '0px', width: '1200px', zIndex: -9999, opacity: 1, pointerEvents: 'none' }}
              aria-hidden="true"
            >
              {renderA4PreviewContent('invoice-offscreen-preview-container')}
            </div>

          </div>
        </div>
      )}

      {/* Proforma Tab Bar and Quick View Manager */}
      {isProformaTabEnabled && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 p-5 md:p-6 shadow-sm space-y-4 w-full max-w-full overflow-x-hidden">
          
          {/* Header row with search box and mini date filter */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3" dir="rtl">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center border border-amber-200/50 dark:border-amber-900/50">
                <ClipboardList className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">نوار مدیریت پیش‌فاکتورها</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">مدیریت سریع، تبدیل به فاکتور قطعی و دسترسی موقت محلی</p>
              </div>
            </div>

            {/* Filter Controls: My Proformas Toggle + Search Box + Miniature Date Filter Pill Group */}
            <div className="flex flex-wrap items-center gap-2">
              {/* "Only My Proformas" Filter Toggle Button */}
              <button
                type="button"
                onClick={() => setOnlyMyProformas(!onlyMyProformas)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer shadow-sm select-none ${
                  onlyMyProformas
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-amber-500/20'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title={onlyMyProformas ? 'نمایش فقط پیش‌فاکتورهای من' : 'نمایش همه پیش‌فاکتورها'}
              >
                <UserIcon className={`w-3.5 h-3.5 ${onlyMyProformas ? 'text-white' : 'text-slate-400'}`} />
                <span>فقط پیش‌فاکتورهای من</span>
                {onlyMyProformas && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse mr-0.5" />
                )}
              </button>

              {/* Search Box by Name and Phone Number */}
              <div className="relative flex items-center min-w-[190px] sm:min-w-[230px]">
                <input
                  type="text"
                  value={proformaSearchQuery}
                  onChange={(e) => setProformaSearchQuery(e.target.value)}
                  placeholder="جستجوی نام یا شماره تماس..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-7 pr-8 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all font-medium"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
                {proformaSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setProformaSearchQuery('')}
                    className="absolute left-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    title="پاک کردن جستجو"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Miniature filter pill group */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-50 dark:bg-slate-950 p-1 rounded-xl border border-slate-150 dark:border-slate-850">
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 px-2 flex items-center gap-1">
                  <Filter className="w-3 h-3 text-slate-400" />
                  از تاریخ:
                </span>
                
                <button
                  type="button"
                  onClick={() => setProformaDateFilter('today')}
                  className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                    proformaDateFilter === 'today'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-150/40 dark:hover:bg-slate-800'
                  }`}
                  title={`امروز: ${toPersianDigits(getTodayJalali())}`}
                >
                  امروز
                </button>

                <button
                  type="button"
                  onClick={() => setProformaDateFilter('yesterday')}
                  className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                    proformaDateFilter === 'yesterday'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-150/40 dark:hover:bg-slate-800'
                  }`}
                  title={`دیروز: ${toPersianDigits(getYesterdayJalali())}`}
                >
                  دیروز
                </button>

                <button
                  type="button"
                  onClick={() => setProformaDateFilter('all')}
                  className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                    proformaDateFilter === 'all'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-150/40 dark:hover:bg-slate-800'
                  }`}
                  title="نمایش همه پیش‌فاکتورها"
                >
                  همه
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable Tabs row with enhanced 3x thicker scrollbar and mouse-wheel horizontal navigation */}
          <div
            className="flex items-center gap-2 overflow-x-auto py-1.5 pb-3.5 proforma-custom-scrollbar transition-all select-none"
            dir="rtl"
            title="مشاهده و مدیریت پیش‌فاکتورهای ثبت شده"
            onWheel={(e) => {
              if (e.deltaY === 0) return;
              const container = e.currentTarget;
              if (container.scrollWidth > container.clientWidth) {
                // In RTL layout, scrolling down moves to subsequent items (to the left)
                container.scrollLeft -= e.deltaY;
              }
            }}
          >
            {(() => {
              const existingOpenProformaIds = openProformaIds.filter(id => invoices.some(inv => inv.id === id));
              const filteredOpenProformas = invoices.filter(inv => {
                if (inv.isDeleted) return false;
                if (!inv.isProforma) return false;
                if (!existingOpenProformaIds.includes(inv.id)) return false;
                
                if (onlyMyProformas) {
                  if (!isCreatedByCurrentUser(inv)) return false;
                }

                if (proformaDateFilter === 'today') {
                  if (!compareJalaliDates(inv.date, getTodayJalali())) return false;
                }
                if (proformaDateFilter === 'yesterday') {
                  if (!compareJalaliDates(inv.date, getYesterdayJalali())) return false;
                }

                if (proformaSearchQuery.trim()) {
                  const qRaw = proformaSearchQuery.trim().toLowerCase();
                  const qNorm = qRaw.replace(/[]/g, '').replace(/[]/g, 'یک');
                  const qDigits = toEnglishDigits(qRaw);

                  const cp = counterparts?.find(c => (inv.counterpartId && c.id === inv.counterpartId) || (c.name && inv.counterpartName && c.name.trim().toLowerCase() === inv.counterpartName.trim().toLowerCase()));

                  const invName = (inv.counterpartName || cp?.name || '').toLowerCase().replace(/[]/g, '').replace(/[]/g, 'یک');
                  const invPhone = (inv.counterpartPhone || cp?.phone || '').toString();
                  const invPhoneDigits = toEnglishDigits(invPhone);
                  const invNumDigits = toEnglishDigits(inv.invoiceNumber || '');

                  const matchesName = invName.includes(qNorm);
                  const matchesPhone = invPhone.includes(qRaw) || (qDigits !== '' && invPhoneDigits.includes(qDigits));
                  const matchesNumber = invNumDigits.includes(qDigits) || (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(qRaw));

                  if (!matchesName && !matchesPhone && !matchesNumber) {
                    return false;
                  }
                }

                return true;
              }).sort((a, b) => {
                const parsedA = parseJalaliDate(a.date);
                const parsedB = parseJalaliDate(b.date);
                const daysA = parsedA ? jalaliToDays(parsedA) : 0;
                const daysB = parsedB ? jalaliToDays(parsedB) : 0;
                if (daysA !== daysB) return daysB - daysA;
                const rawNumA = toEnglishDigits(String(a.invoiceNumber || '')).replace(/\D+/g, '');
                const rawNumB = toEnglishDigits(String(b.invoiceNumber || '')).replace(/\D+/g, '');
                const numA = rawNumA ? Number(rawNumA) : 0;
                const numB = rawNumB ? Number(rawNumB) : 0;
                if (numA !== numB) return numB - numA;
                return String(b.id || '').localeCompare(String(a.id || ''));
              });

              return (
                <>
                  {filteredOpenProformas.map(inv => {
                    const isActive = selectedProformaId === inv.id;
                    return (
                      <div
                        key={inv.id}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all shrink-0 cursor-pointer text-xs font-bold ${
                          isActive
                            ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-850 text-amber-900 dark:text-amber-400 shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-150 dark:border-slate-850 text-slate-600 dark:text-slate-400 hover:bg-slate-100/50'
                        }`}
                        onClick={() => setSelectedProformaId(isActive ? null : inv.id)}
                      >
                        <span className="text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{inv.counterpartName}</span>
                        {inv.createdBy && !onlyMyProformas && (
                          <span className="text-[9px] font-normal text-slate-400 dark:text-slate-500 bg-slate-150/60 dark:bg-slate-800/80 px-1.5 py-0.5 rounded truncate max-w-[80px]">
                            {inv.createdBy}
                          </span>
                        )}
                        
                        {/* Close Tab Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenProformaIds(prev => prev.filter(id => id !== inv.id));
                            if (selectedProformaId === inv.id) {
                              setSelectedProformaId(null);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
                          title="بستن تب (بدون حذف اطلاعات)"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  {filteredOpenProformas.length === 0 && (
                    <div className="w-full text-center py-4 text-xs text-slate-400 font-semibold">
                      {onlyMyProformas
                        ? `هیچ پیش‌فاکتوری برای کاربر (${currentUser?.name || currentUser?.username || 'کاربر جاری'}) یافت نشد.`
                        : proformaSearchQuery.trim()
                        ? `پیش‌فاکتوری با عنوان «${proformaSearchQuery}» یافت نشد.`
                        : 'هیچ پیش‌فاکتوری ثبت نشده است. می‌توانید در فرم بالا پیش‌فاکتور جدید ایجاد کنید.'}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Quick Management Detail Panel */}
          {(() => {
            if (!selectedProformaId) return null;
            const activeProforma = invoices.find(inv => inv.id === selectedProformaId);
            if (!activeProforma) return null;

            const totalItemsQty = (activeProforma.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
            const itemTotal = (activeProforma.items || []).reduce((sum, item) => {
              const lineTot = item.totalPrice !== undefined && !isNaN(Number(item.totalPrice))
                ? Number(item.totalPrice)
                : calcRowTotal(item.qty, item.unitPrice);
              return sum + lineTot;
            }, 0);
            const invoiceTotal = itemTotal + (Number(activeProforma.tax) || 0) - (Number(activeProforma.discount) || 0);

            return (
              <div className="bg-slate-50/55 dark:bg-slate-950/25 rounded-2xl border border-slate-150 dark:border-slate-850/85 p-4 md:p-5 space-y-4 animate-scale-up animate-duration-150" dir="rtl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-150 dark:border-slate-850 pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-200/30">
                        پیش‌فاکتور {activeProforma.type === 'sale' ? 'فروش' : 'خرید'}
                      </span>
                      <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-200">
                        شماره: #{toPersianDigits(activeProforma.invoiceNumber)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({toPersianDigits(activeProforma.date)})
                      </span>
                      {activeProforma.createdBy && (
                        <span className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-150/70 dark:bg-slate-800 px-2 py-0.5 rounded-md font-bold">
                          ثبت شده توسط: {activeProforma.createdBy}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>طرف‌حساب: {activeProforma.counterpartName}</span>
                      {activeProforma.counterpartPhone && (
                        <span className="text-[10px] font-mono text-slate-500">({toPersianDigits(activeProforma.counterpartPhone)})</span>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar inside quick panel */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setSelectedInv(activeProforma); setShowPrintModal(true); }}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-250 dark:border-slate-700 rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      <span>چاپ فاکتور</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLoadEditInvoice(activeProforma)}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100/85 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-250 dark:border-amber-900/50 rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>ویرایش پیش‌فاکتور</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleConvertProformaToDefinitive(activeProforma)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow hover:shadow-md"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>تبدیل به فاکتور رسمی</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProformaId(null);
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-[11px] font-bold cursor-pointer transition-all"
                    >
                      بستن پنجره
                    </button>
                  </div>
                </div>

                {/* Items preview table inside quick panel */}
                <div className="overflow-x-auto rounded-xl border border-slate-150 dark:border-slate-850 bg-white dark:bg-slate-900 proforma-custom-scrollbar">
                  <table className="w-full text-right text-[11px]">
                    <thead className="bg-slate-50/75 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-150 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2 text-right">#</th>
                        <th className="px-4 py-2 text-right">نام کالا / خدمات</th>
                        <th className="px-4 py-2 text-center">تعداد / واحد</th>
                        <th className="px-4 py-2 text-left">قیمت واحد</th>
                        <th className="px-4 py-2 text-left">جمع کل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                      {activeProforma.items.map((it, idx) => (
                        <tr key={it.itemId || idx} className="hover:bg-slate-50/30 dark:hover:bg-slate-950/10">
                          <td className="px-4 py-2 text-slate-400 font-mono">{toPersianDigits(idx + 1)}</td>
                          <td className="px-4 py-2 font-bold text-slate-800 dark:text-slate-200">
                            <div>{it.name}</div>
                            {it.remarks && it.remarks.trim() !== '' && (
                              <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                                <span className="font-semibold text-slate-600 dark:text-slate-300">توضیحات:</span> {it.remarks}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center font-mono font-bold text-slate-700 dark:text-slate-300">{toPersianDigits(it.qty)}</td>
                          <td className="px-4 py-2 text-left font-mono text-slate-600 dark:text-slate-400">{formatCurrency(it.unitPrice)}</td>
                          <td className="px-4 py-2 text-left font-mono font-bold text-slate-900 dark:text-slate-100">{formatCurrency(it.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Summary */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-150 dark:border-slate-850 text-[11px]">
                  <div className="flex items-center gap-4 text-slate-500">
                    <div>مجموع کالاها: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{toPersianDigits(totalItemsQty)}</span></div>
                    <div>جمع کل اقلام: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatCurrency(itemTotal)}</span></div>
                    {activeProforma.discount > 0 && (
                      <div className="text-rose-600 dark:text-rose-400 font-bold">تخفیف: <span className="font-mono font-bold">{formatCurrency(activeProforma.discount)}</span></div>
                    )}
                    {activeProforma.tax > 0 && (
                      <div className="text-indigo-600 dark:text-indigo-400 font-bold">مالیات: <span className="font-mono font-bold">{formatCurrency(activeProforma.tax)}</span></div>
                    )}
                  </div>
                  <div className="text-xs font-black text-slate-900 dark:text-white">
                    مبلغ کل پیش‌فاکتور: <span className="font-mono text-emerald-600 dark:text-emerald-400 font-black text-sm">{formatCurrency(invoiceTotal)}</span>
                  </div>
                </div>

                {activeProforma.description && (
                  <p className="text-[10px] text-slate-500 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-150 dark:border-slate-850 leading-relaxed">
                    <strong>توضیحات:</strong> {activeProforma.description}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden w-full max-w-full min-w-0">
        
        {/* Header containing name, tabs, and filters */}
        <div className="p-3 sm:p-4 lg:p-5 border-b border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3 sm:space-y-4 max-w-full min-w-0 overflow-x-hidden" dir="rtl">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4">
            
            {/* Title & In-header Search Fields */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
              <div className="space-y-0.5 shrink-0">
                <h3 className="font-bold text-slate-800 dark:text-slate-150 text-xs sm:text-sm whitespace-nowrap">آرشیو اسناد فاکتورهای صادرشده</h3>
                <span className="text-[10px] text-slate-400 font-mono block">کاربر فعال: {currentUser?.name || ''} ({currentUser?.role === 'admin' ? 'مدیر ارشد' : currentUser?.role === 'accountant' ? 'حسابدار رسمی' : 'فروشنده پیشخوان'})</span>
              </div>

              {/* Compact Search Inputs in front of title */}
              <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:max-w-xl">
                {/* Search by Counterpart (Name or Phone) */}
                <div className="relative flex-1 w-full">
                  <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={archiveCounterpartSearch}
                    onChange={(e) => setArchiveCounterpartSearch(e.target.value)}
                    placeholder="جستجوی طرف حساب..."
                    className="w-full pr-8 pl-7 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-xs"
                  />
                  {archiveCounterpartSearch && (
                    <button
                      type="button"
                      onClick={() => setArchiveCounterpartSearch('')}
                      className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title="پاک کردن فیلتر"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Search by Product / Service */}
                <div className="relative flex-1 w-full">
                  <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={archiveProductSearch}
                    onChange={(e) => setArchiveProductSearch(e.target.value)}
                    placeholder="جستجوی محصول / خدمت..."
                    className="w-full pr-8 pl-7 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-xs"
                  />
                  {archiveProductSearch && (
                    <button
                      type="button"
                      onClick={() => setArchiveProductSearch('')}
                      className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title="پاک کردن فیلتر"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {(archiveCounterpartSearch || archiveProductSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setArchiveCounterpartSearch('');
                      setArchiveProductSearch('');
                    }}
                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-955/20 dark:hover:bg-rose-955/30 dark:text-rose-450 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
                    title="پاک کردن جستجو"
                  >
                    پاک کردن فیلتر
                  </button>
                )}
              </div>
            </div>

            {/* Core Tabs Picker - All, Sales, Pro-forma, Purchases, Deleted */}
            <div className="flex bg-slate-150 dark:bg-slate-800 p-1 rounded-xl border border-slate-205 dark:border-slate-700 shadow-inner w-full sm:w-fit flex-wrap gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setArchiveTab('all')}
                className={`flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center whitespace-nowrap ${
                  archiveTab === 'all' ? 'bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 shadow' : 'text-slate-500 hover:text-slate-755 dark:text-slate-400'
                }`}
              >
                همه ({filteredInvoices.filter(i => !i.isDeleted).length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveTab('sale')}
                className={`flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center whitespace-nowrap ${
                  archiveTab === 'sale' ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-450 shadow' : 'text-slate-500 hover:text-slate-755 dark:text-slate-400'
                }`}
              >
                فروش ({filteredInvoices.filter(i => i.type === 'sale' && !i.isProforma && !i.isDeleted).length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveTab('proforma')}
                className={`flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center whitespace-nowrap ${
                  archiveTab === 'proforma' ? 'bg-white dark:bg-slate-900 text-amber-650 dark:text-amber-400 shadow' : 'text-slate-500 hover:text-slate-755 dark:text-slate-400'
                }`}
              >
                پیش‌فاکتور ({filteredInvoices.filter(i => i.isProforma && !i.isDeleted).length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveTab('purchase')}
                className={`flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center whitespace-nowrap ${
                  archiveTab === 'purchase' ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow' : 'text-slate-500 hover:text-slate-755 dark:text-slate-400'
                }`}
              >
                خرید ({filteredInvoices.filter(i => i.type === 'purchase' && !i.isProforma && !i.isDeleted).length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveTab('deleted')}
                className={`flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center whitespace-nowrap ${
                  archiveTab === 'deleted' ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow' : 'text-slate-500 hover:text-rose-600 dark:text-rose-450'
                }`}
              >
                حذف‌ها ({filteredInvoices.filter(i => i.isDeleted).length})
              </button>
            </div>
          </div>

          {/* Unified Date Filters Section */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2.5 sm:pt-3 border-t border-slate-150/60 dark:border-slate-800/60">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Quick Time Filters */}
              <div className="flex bg-slate-150 dark:bg-slate-800 p-1 rounded-xl border border-slate-205 dark:border-slate-700 shadow-inner flex-wrap gap-1 max-w-full">
                <button
                  type="button"
                  onClick={handleSelectTodayFilter}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeQuickFilter === 'today' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow' : 'text-slate-500 hover:text-slate-750 dark:text-slate-400'
                  }`}
                >
                  امروز
                </button>
                <button
                  type="button"
                  onClick={handleSelect3DaysFilter}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeQuickFilter === '3days' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow' : 'text-slate-500 hover:text-slate-750 dark:text-slate-400'
                  }`}
                >
                  ۳ روز اخیر
                </button>
                <button
                  type="button"
                  onClick={handleSelectWeekFilter}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeQuickFilter === 'week' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow' : 'text-slate-500 hover:text-slate-750 dark:text-slate-400'
                  }`}
                >
                  هفته گذشته
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllFilter}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeQuickFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow' : 'text-slate-500 hover:text-slate-750 dark:text-slate-400'
                  }`}
                >
                  همه
                </button>
              </div>

              {/* Custom Date Range Inputs */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 shadow-sm">
                  <span className="text-[10px] text-slate-450 font-bold whitespace-nowrap">از تاریخ:</span>
                  <div className="w-24 sm:w-28">
                    <JalaliDatePicker
                      value={archiveStartDate}
                      onChange={(val) => {
                        setArchiveStartDate(val);
                        setActiveQuickFilter('custom');
                      }}
                      placeholder="۱۴۰۳/۰۱/۰۱"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 shadow-sm">
                  <span className="text-[10px] text-slate-450 font-bold whitespace-nowrap">تا تاریخ:</span>
                  <div className="w-24 sm:w-28">
                    <JalaliDatePicker
                      value={archiveEndDate}
                      onChange={(val) => {
                        setArchiveEndDate(val);
                        setActiveQuickFilter('custom');
                      }}
                      placeholder="۱۴۰۵/۱۲/۲۹"
                    />
                  </div>
                </div>
                {(archiveStartDate || archiveEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setArchiveStartDate('');
                      setArchiveEndDate('');
                      setActiveQuickFilter('custom');
                    }}
                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-955/20 dark:hover:bg-rose-955/30 dark:text-rose-450 rounded-xl text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap"
                  >
                    پاک کردن فیلتر تاریخ
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="text-[11px] text-slate-450 dark:text-slate-400 font-bold leading-relaxed shrink-0">
                تعداد فاکتورهای فیلتر شده: <strong className="text-blue-600 dark:text-blue-400 font-mono text-sm bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-lg border border-blue-200/60 dark:border-blue-900/60">{toPersianDigits(displayedInvoices.length)}</strong> عدد
              </div>

              {displayedInvoices.length > 0 && (currentUser.role === 'admin' || currentUser.role === 'accountant' || archiveTab === 'proforma') && (
                <div className="flex flex-wrap items-center gap-2">
                  {selectedArchiveInvIds.length > 0 && (
                    <button
                      id="btn-delete-selected-archive-invoices"
                      type="button"
                      onClick={() => {
                        setBatchDeleteTarget('selected');
                        setBatchDeleteModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف موارد انتخابی ({toPersianDigits(selectedArchiveInvIds.length)})</span>
                    </button>
                  )}

                  <button
                    id="btn-delete-all-filtered-archive-invoices"
                    type="button"
                    onClick={() => {
                      setBatchDeleteTarget('all_filtered');
                      setBatchDeleteModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف تمام فاکتورهای فیلترشده ({toPersianDigits(displayedInvoices.length)})</span>
                  </button>

                  <button
                    id="btn-toggle-select-all-archive"
                    type="button"
                    onClick={handleToggleSelectAllArchive}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    {selectedArchiveInvIds.length === displayedInvoices.length && displayedInvoices.length > 0
                      ? 'لغو انتخاب همه'
                      : 'انتخاب همه'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {displayedInvoices.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-slate-400 dark:text-slate-600">
            <ShoppingCart className="w-10 h-10 sm:w-12 sm:h-12 text-slate-350 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-xs sm:text-sm font-semibold"> هیچ فاکتوری در این دسته‌بندی یا بازه زمانی یافت نشد.</p>
          </div>
        ) : (
          <div className="overflow-x-auto animate-fade-in animate-duration-150 w-full max-w-full min-w-0">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-850">
                <tr>
                  <th className="w-10 px-2 py-3 sm:px-3 sm:py-3.5 text-center whitespace-nowrap">
                    <input
                      type="checkbox"
                      aria-label="انتخاب تمام فاکتورها"
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer accent-rose-600"
                      checked={displayedInvoices.length > 0 && selectedArchiveInvIds.length === displayedInvoices.length}
                      onChange={handleToggleSelectAllArchive}
                      title={selectedArchiveInvIds.length === displayedInvoices.length ? "لغو انتخاب همه" : "انتخاب همه موارد"}
                    />
                  </th>
                  <th className="px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-right whitespace-nowrap">کد فاکتور</th>
                  <th className="px-2 py-3 sm:px-2.5 sm:py-3.5 lg:px-3 text-right whitespace-nowrap">نوع سند</th>
                  <th className="px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-right whitespace-nowrap">ثبت‌کننده</th>
                  <th className="px-2 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-right whitespace-nowrap">تاریخ صدور</th>
                  <th className="px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-right">طرف حساب تجاری</th>
                  <th className="px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-left whitespace-nowrap">مبلغ کل ({currencyLabel})</th>
                  <th className="px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-left whitespace-nowrap">بیعانه معلق ({currencyLabel})</th>
                  <th className="px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-right whitespace-nowrap">بدهکار / بستانکار</th>
                  <th className="px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-right whitespace-nowrap">وضعیت سند</th>
                  <th className="py-3 pr-2.5 pl-2 sm:py-3.5 sm:pr-3 sm:pl-3 lg:pr-4 lg:pl-4 text-left whitespace-nowrap">عملیات سند</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-750 dark:text-slate-300">
                {paginatedInvoices.map(inv => {
                  const itemTotal = (inv.items || []).reduce((sum, item) => {
                    const lineTot = item.totalPrice !== undefined && !isNaN(Number(item.totalPrice))
                      ? Number(item.totalPrice)
                      : calcRowTotal(item.qty, item.unitPrice);
                    return sum + lineTot;
                  }, 0);
                  const invoiceTotal = itemTotal + (Number(inv.tax) || 0) - (Number(inv.discount) || 0);
                  const invoicePendingDepositSum = (pendingDeposits || [])
                    .filter(pd => !pd.isDeleted && pd.invoiceId === inv.id && pd.status === 'pending')
                    .reduce((sum, pd) => sum + (Number(pd.amount) || 0), 0);
                  const clearedDeposit = Math.max(0, (Number(inv.deposit) || 0) - invoicePendingDepositSum);
                  const remainingBalance = Math.max(0, invoiceTotal - clearedDeposit);
                  const isDeleted = inv.isDeleted;
                  const isHighlighted = highlightedInvoiceId === inv.id;
                  const isSelected = selectedArchiveInvIds.includes(inv.id);

                  return (
                    <tr 
                      key={inv.id} 
                      id={`archive-invoice-${inv.id}`}
                      className={`transition-all duration-300 ${
                        isSelected
                          ? 'bg-rose-50/70 dark:bg-rose-950/30'
                          : isHighlighted
                            ? 'bg-emerald-50/90 dark:bg-emerald-950/60 ring-2 ring-emerald-500 shadow-md animate-pulse'
                            : isDeleted 
                              ? 'bg-slate-100/90 dark:bg-slate-900/95 text-slate-400 dark:text-slate-500 border-r-4 border-slate-400 opacity-75' 
                              : 'hover:bg-slate-50/40 dark:hover:bg-slate-950/25'
                      }`}
                    >
                      <td className="w-10 px-2 py-2.5 sm:px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`انتخاب فاکتور ${inv.invoiceNumber}`}
                          className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer accent-rose-600"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOneArchive(inv.id)}
                        />
                      </td>
                      <td className={`px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 font-bold font-mono text-[11px] sm:text-xs whitespace-nowrap ${isDeleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>
                        <div className="flex items-center gap-1.5">
                          {isHighlighted && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                          )}
                          <span>{toPersianDigits(inv.invoiceNumber)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 sm:px-2.5 sm:py-3 lg:px-3 lg:py-3.5 whitespace-nowrap">
                        {isDeleted ? (
                          <span className="text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-1.5 sm:px-2 py-0.5 rounded border border-slate-300 dark:border-slate-750 font-bold text-[10px] sm:text-xs">حذفی</span>
                        ) : inv.type === 'sale' ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/50 px-1.5 sm:px-2 py-0.5 rounded border border-emerald-100/50 dark:border-emerald-900 text-[10px] sm:text-xs">فروش</span>
                        ) : (
                          <span className="text-indigo-700 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/50 px-1.5 sm:px-2 py-0.5 rounded border border-indigo-100/50 dark:border-indigo-900 text-[10px] sm:text-xs">خرید</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 whitespace-nowrap text-right">
                        {(() => {
                          const creatorUser = (users || []).find(u => u.id === inv.createdById || u.username === inv.createdBy || u.name === inv.createdBy);
                          const creatorUsername = creatorUser?.username || inv.createdById || inv.createdBy || 'admin';
                          const creatorDisplayName = creatorUser?.name || (inv.createdBy && inv.createdBy !== creatorUsername ? inv.createdBy : '');
                          
                          return (
                            <div className="flex flex-col gap-0.5 items-start">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-200/60 dark:border-sky-850 font-bold text-[10px] sm:text-[11px]">
                                <UserIcon className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
                                <span className="font-mono font-bold" dir="ltr">@{creatorUsername}</span>
                              </span>
                              {creatorDisplayName && (
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-normal pr-0.5 truncate max-w-[85px]" title={creatorDisplayName}>
                                  {creatorDisplayName}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className={`px-2 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 font-mono text-[11px] sm:text-xs whitespace-nowrap ${isDeleted ? 'line-through' : ''}`}>{toPersianDigits(inv.date)}</td>
                      <td className={`px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 font-bold text-[11px] sm:text-xs max-w-[110px] sm:max-w-[160px] lg:max-w-xs truncate ${isDeleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`} title={inv.counterpartName}>{inv.counterpartName}</td>
                      <td className={`px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 font-bold font-mono text-left text-[11px] sm:text-xs whitespace-nowrap ${isDeleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>{formatCurrency(invoiceTotal)}</td>
                      <td className={`px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 font-bold font-mono text-left text-[11px] sm:text-xs whitespace-nowrap ${isDeleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>
                        {invoicePendingDepositSum > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400 font-extrabold animate-pulse">
                            {formatCurrency(invoicePendingDepositSum)}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">
                            ۰ {currencyLabel}
                          </span>
                        )}
                      </td>
                      <td className={`px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 whitespace-nowrap text-right ${isDeleted ? 'opacity-65' : ''}`}>
                        <div className="flex flex-col gap-0.5 items-start">
                          {remainingBalance === 0 ? (
                            <>
                              <div className={`font-mono font-black text-[11px] sm:text-xs ${isDeleted ? 'text-slate-400' : 'text-slate-500'}`}>
                                ۰ {currencyLabel}
                              </div>
                              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-black bg-slate-50 text-slate-600 dark:bg-slate-850 dark:text-slate-400">
                                تسویه شده
                              </span>
                            </>
                          ) : inv.type === 'sale' ? (
                            <>
                              <div className={`font-mono font-black text-[11px] sm:text-xs ${isDeleted ? 'text-slate-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {formatCurrency(remainingBalance)}
                              </div>
                              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                <TrendingDown className="w-3 h-3 shrink-0" />
                                مانده بدهی
                              </span>
                            </>
                          ) : (
                            <>
                              <div className={`font-mono font-black text-[11px] sm:text-xs ${isDeleted ? 'text-slate-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {formatCurrency(remainingBalance)}
                              </div>
                              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-black bg-rose-50 text-rose-700 dark:bg-rose-955/45 dark:text-rose-400">
                                <TrendingUp className="w-3 h-3 shrink-0" />
                                مانده طلب
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          {isHighlighted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] sm:text-[10px] font-black shadow-xs">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>ثبت نهایی</span>
                            </span>
                          )}
                          {isDeleted ? (
                            <>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 text-[9px] sm:text-[10px] font-bold">
                                حذف شده
                              </span>
                              <div className="text-[9px] text-slate-500 dark:text-slate-450 space-y-0.5 text-right leading-tight">
                                <div>حذف شده توسط: <span className="font-bold text-slate-700 dark:text-slate-300">{inv.deletedBy || 'کاربر سیستمی'}</span></div>
                                <div>تاریخ: <span className="font-bold font-mono text-slate-700 dark:text-slate-300">{toPersianDigits(inv.deletedAt || '')}</span></div>
                              </div>
                            </>
                          ) : inv.isProforma ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900 text-[9px] sm:text-[10px] font-semibold animate-pulse">
                              <span>پیش‌فاکتور</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-955 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 text-[9px] sm:text-[10px] font-bold">
                              <Check className="w-3 h-3" />
                              <span>فاکتور رسمی</span>
                            </span>
                          )}
                          {inv.history && inv.history.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900 text-[8px] sm:text-[9px] font-bold animate-pulse">
                              <History className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />
                              <span>ویرایش ({toPersianDigits(inv.history.length)})</span>
                            </span>
                          )}
                        </div>
                      </td>
                    <td className="py-2.5 pr-2.5 pl-2 sm:py-3 sm:pr-3 sm:pl-3 lg:py-3.5 lg:pr-4 lg:pl-4 text-left whitespace-nowrap">
                      <div className="flex items-center justify-start gap-1" dir="ltr">
                        <button
                          onClick={() => { setSelectedInv(inv); setShowPrintModal(true); }}
                          className="p-1.5 sm:px-2 sm:py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-250 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all"
                          type="button"
                          title="چاپ"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        
                        <button
                          onClick={() => { setSelectedInvForHistory(inv); setShowHistoryModal(true); }}
                          className="p-1.5 sm:px-2 sm:py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all"
                          type="button"
                          title="تاریخچه تغییرات"
                        >
                          <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span className="hidden sm:inline">تاریخچه</span>
                        </button>

                        {!isDeleted && (() => {
                          const check = canUserEditInvoice(inv);
                          if (!check.allowed) return null;
                          return (
                            <button
                              onClick={() => handleLoadEditInvoice(inv)}
                              className="p-1.5 sm:px-2 sm:py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/40 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-300 border border-amber-250 dark:border-amber-900 shadow-sm rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                              type="button"
                              title="ویرایش"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">ویرایش</span>
                            </button>
                          );
                        })()}

                        {!isDeleted && canUserDeleteInvoice(inv) && (
                          <button
                            onClick={() => {
                              setInvoiceToDelete(inv);
                              setDeleteConfirmOpen(true);
                            }}
                            className="p-1.5 sm:px-2 sm:py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-955 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all"
                            type="button"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">حذف</span>
                          </button>
                        )}

                        {isDeleted && currentUser.role === 'admin' && (
                          <button
                            onClick={() => {
                              setInvoiceToPermanentDelete(inv);
                              setPermanentDeleteConfirmOpen(true);
                            }}
                            className="p-1.5 sm:px-2 sm:py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow-sm"
                            type="button"
                            title="حذف دائمی فاکتور از پایگاه داده"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">حذف دائم</span>
                          </button>
                        )}

                        {inv.isProforma && !isDeleted && !openProformaIds.includes(inv.id) && (
                          <button
                            onClick={() => {
                              setOpenProformaIds(prev => {
                                  if (prev.includes(inv.id)) return prev;
                                  return [...prev, inv.id];
                              });
                            }}
                            className="p-1.5 sm:px-2 sm:py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-955 dark:hover:bg-amber-900 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 rounded-lg cursor-pointer transition-all flex items-center justify-center"
                            type="button"
                            title="افزودن به کارتابل و لیست پیش‌فاکتورها"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
            <PaginationControls
              currentPage={archivePage}
              totalPages={totalArchivePages}
              pageSize={archivePageSize}
              totalItems={displayedInvoices.length}
              onPageChange={setArchivePage}
              onPageSizeChange={setArchivePageSize}
            />
          </div>
        )}
      </div>

      {/* Print-friendly A4 modal */}
      {showPrintModal && selectedInv && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-2 sm:p-3 md:p-4 z-50 animate-fade-in popup-overlay-global" id="dialog-print-invoice">
          <div 
            ref={printModalRef}
            style={{
              width: modalDimensions.width ? `${modalDimensions.width}px` : undefined,
              height: modalDimensions.height ? `${modalDimensions.height}px` : undefined,
              maxWidth: modalDimensions.width ? '98vw' : undefined,
              maxHeight: modalDimensions.height ? '98vh' : undefined,
            }}
            className={`bg-white rounded-2xl shadow-2xl w-full p-3 md:p-4 border border-slate-200 flex flex-col ${
              modalDimensions.height ? '' : 'h-[96vh] max-h-[98vh]'
            } overflow-hidden relative ${
              modalDimensions.width ? '' : paperSize === 'A4_landscape' ? 'max-w-6xl' : paperSize === 'A5_landscape' ? 'max-w-4xl' : paperSize === 'A5_portrait' ? 'max-w-xl' : 'max-w-3xl'
            }`}
          >
            
            {/* Compact Sleek Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 shrink-0 no-print" dir="rtl">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 font-black text-slate-800 text-sm pl-1">
                  <Eye className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>پیش‌نمایش و چاپ فاکتور</span>
                </div>

                {/* Paper Size Selector Badge */}
                <div className="flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-lg px-2 py-0.5 text-purple-900 text-xs font-bold" title="سایز کاغذ">
                  <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <select
                    value={paperSize}
                    onChange={(e) => updatePaperSize(e.target.value)}
                    className="bg-transparent text-[11px] font-black text-purple-700 focus:outline-none cursor-pointer pr-0.5"
                  >
                    <option value="A4_portrait" className="bg-white text-slate-800">A4 عمودی</option>
                    <option value="A4_landscape" className="bg-white text-slate-800">A4 افقی</option>
                    <option value="A5_portrait" className="bg-white text-slate-800">A5 عمودی</option>
                    <option value="A5_landscape" className="bg-white text-slate-800">A5 افقی</option>
                  </select>
                </div>

                {/* Raw Paper Image Template Quick Uploader */}
                <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5 text-amber-900 text-xs font-bold no-print" title="تصویر پس‌زمینه سربرگ">
                  <Image className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-[11px]">پس‌زمینه:</span>
                  {paperBgImages[paperSize] ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-emerald-700 font-extrabold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> فعال
                      </span>
                      <label className="text-[10px] text-purple-700 hover:underline font-extrabold cursor-pointer">
                        تغییر تصویر
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              const file = e.target.files[0];
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const b64 = ev.target?.result as string;
                                if (b64) {
                                  updatePaperBgImage(paperSize, b64);
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => updatePaperBgImage(paperSize, '')}
                        className="text-[10px] text-rose-600 hover:underline font-extrabold cursor-pointer"
                        title="حذف تصویر پس‌زمینه"
                      >
                        حذف
                      </button>
                    </div>
                  ) : (
                    <label className="text-[10px] text-amber-700 hover:underline font-extrabold cursor-pointer">
                      انتخاب تصویر
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const file = e.target.files[0];
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const b64 = ev.target?.result as string;
                              if (b64) {
                                updatePaperBgImage(paperSize, b64);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* Vertical Shift Control (Top & Bottom Sections) */}
                <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2 py-0.5 text-blue-900 text-xs font-bold no-print" title="تنظیم موقعیت عمودی فاکتور">
                  <ArrowUpDown className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  
                  {/* Top Section */}
                  <div className="flex items-center gap-0.5" title="فاصله از بالا (میلی‌متر)">
                    <span className="text-[10px] text-blue-700 font-extrabold">بالا:</span>
                    <button
                      type="button"
                      onClick={() => updateTopOffset(topOffsetMm - 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-blue-300 rounded text-blue-700 font-bold hover:bg-blue-100 transition-all cursor-pointer text-[10px] select-none"
                      title="کاهش فاصله از بالا"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      value={topOffsetMm}
                      onChange={(e) => updateTopOffset(parseFloat(e.target.value) || 0)}
                      className="w-8 text-center bg-white border border-blue-300 rounded py-0 text-[11px] font-mono font-bold text-blue-950 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateTopOffset(topOffsetMm + 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-blue-300 rounded text-blue-700 font-bold hover:bg-blue-100 transition-all cursor-pointer text-[10px] select-none"
                      title="افزایش فاصله از بالا"
                    >
                      +
                    </button>
                  </div>

                  <span className="text-blue-300 font-normal">|</span>

                  {/* Bottom Section */}
                  <div className="flex items-center gap-0.5" title="فاصله از پایین (میلی‌متر)">
                    <span className="text-[10px] text-blue-700 font-extrabold">پایین:</span>
                    <button
                      type="button"
                      onClick={() => updateBottomOffset(bottomOffsetMm - 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-blue-300 rounded text-blue-700 font-bold hover:bg-blue-100 transition-all cursor-pointer text-[10px] select-none"
                      title="کاهش فاصله از پایین"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      value={bottomOffsetMm}
                      onChange={(e) => updateBottomOffset(parseFloat(e.target.value) || 0)}
                      className="w-8 text-center bg-white border border-blue-300 rounded py-0 text-[11px] font-mono font-bold text-blue-950 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateBottomOffset(bottomOffsetMm + 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-blue-300 rounded text-blue-700 font-bold hover:bg-blue-100 transition-all cursor-pointer text-[10px] select-none"
                      title="افزایش فاصله از پایین"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-500 font-normal mr-0.5">mm</span>
                  </div>
                </div>

                {/* Even Row Glass Opacity Control */}
                <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 text-slate-800 text-xs font-bold no-print" title="تنظیم شفافیت سطرهای متناوب">
                  <Layers className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => updateEvenRowOpacity(evenRowOpacity - 5)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-slate-300 rounded text-slate-700 font-bold hover:bg-slate-200 transition-all cursor-pointer text-[10px] select-none"
                      title="کاهش ۵٪"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={evenRowOpacity}
                      onChange={(e) => updateEvenRowOpacity(parseInt(e.target.value) || 0)}
                      className="w-9 text-center bg-white border border-slate-300 rounded py-0 text-[11px] font-mono font-bold text-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateEvenRowOpacity(evenRowOpacity + 5)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-slate-300 rounded text-slate-700 font-bold hover:bg-slate-200 transition-all cursor-pointer text-[10px] select-none"
                      title="افزایش ۵٪"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-500 font-normal mr-0.5">%</span>
                  </div>
                </div>

                {/* Inner Invoice Content Scale Control */}
                <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-0.5 text-indigo-900 text-xs font-bold no-print" title="بزرگنمایی محتوای فاکتور">
                  <ZoomIn className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="text-[11px] font-bold">بزرگنمایی:</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => updatePreviewContentScale(previewContentScale - 5)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-indigo-300 rounded text-indigo-700 font-bold hover:bg-indigo-100 transition-all cursor-pointer text-[10px] select-none active:scale-95"
                      title="افزایش ۵٪ بزرگنمایی"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="30"
                      max="300"
                      step="5"
                      value={previewContentScale}
                      onChange={(e) => updatePreviewContentScale(parseInt(e.target.value) || 100)}
                      className="w-10 text-center bg-white border border-indigo-300 rounded py-0 text-[11px] font-mono font-bold text-indigo-950 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updatePreviewContentScale(previewContentScale + 5)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-indigo-300 rounded text-indigo-700 font-bold hover:bg-indigo-100 transition-all cursor-pointer text-[10px] select-none active:scale-95"
                      title="کاهش ۵٪ بزرگنمایی"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-500 font-normal mr-0.5">%</span>
                    {previewContentScale !== 100 && (
                      <button
                        type="button"
                        onClick={() => updatePreviewContentScale(100)}
                        className="text-[10px] text-indigo-600 hover:underline mr-0.5 font-extrabold cursor-pointer"
                        title="تنظیم بزرگنمایی ۱۰۰٪"
                      >
                        ۱۰۰٪
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer shadow-xs transition-all"
                  title="چاپ فاکتور (پیش‌فرض A4)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>چاپ</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPrintModal(false); setSelectedInv(null); }}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="بستن"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Paper Styled Preview Box - Smart Auto-Fit without vertical scroll */}
            <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-auto py-1 relative">
              <div 
                className="max-h-full max-w-full flex items-center justify-center transition-all duration-150 ease-out origin-center"
                style={{
                  zoom: previewContentScale / 100,
                }}
              >
                {renderA4PreviewContent('invoice-print-area', selectedInv)}
              </div>
            </div>

            {/* Bottom Actions Footer Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 pr-36 shrink-0 no-print" dir="rtl">
              <div className="flex flex-wrap items-center gap-2">
                {/* Extra Print Top Margin Control (Personnel-Scoped) */}
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 text-emerald-900 text-xs font-bold" title="تنظیم حاشیه بالای صفحه در چاپ">
                  <ArrowDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-[11px] font-bold">فاصله بالای چاپ:</span>
                  <div className="flex items-center gap-0.5" title="تنظیم حاشیه و فاصله چاپ (mm)">
                    <button
                      type="button"
                      onClick={() => updatePrintExtraTopMargin(printExtraTopMarginMm - 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-emerald-300 rounded text-emerald-700 font-bold hover:bg-emerald-100 transition-all cursor-pointer text-[10px] select-none"
                      title="کاهش ۱ میلی‌متر"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={printExtraTopMarginMm}
                      onChange={(e) => updatePrintExtraTopMargin(parseFloat(e.target.value) || 0)}
                      className="w-8 text-center bg-white border border-emerald-300 rounded py-0 text-[11px] font-mono font-bold text-emerald-950 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updatePrintExtraTopMargin(printExtraTopMarginMm + 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-emerald-300 rounded text-emerald-700 font-bold hover:bg-emerald-100 transition-all cursor-pointer text-[10px] select-none"
                      title="افزایش ۱ میلی‌متر"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-500 font-normal mr-0.5">mm</span>
                  </div>
                </div>

                {/* Extra Print Side Margin Control (Personnel-Scoped) */}
                <div className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 rounded-lg px-2 py-0.5 text-sky-900 text-xs font-bold" title="تنظیم حاشیه چپ و راست صفحه در چاپ">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className="text-[11px] font-bold">فاصله چپ و راست چاپ:</span>
                  <div className="flex items-center gap-0.5" title="تنظیم حاشیه چپ و راست در چاپ (mm)">
                    <button
                      type="button"
                      onClick={() => updatePrintExtraSideMargin(printExtraSideMarginMm - 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-sky-300 rounded text-sky-700 font-bold hover:bg-sky-100 transition-all cursor-pointer text-[10px] select-none"
                      title="کاهش ۱ میلی‌متر"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={printExtraSideMarginMm}
                      onChange={(e) => updatePrintExtraSideMargin(parseFloat(e.target.value) || 0)}
                      className="w-8 text-center bg-white border border-sky-300 rounded py-0 text-[11px] font-mono font-bold text-sky-950 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updatePrintExtraSideMargin(printExtraSideMarginMm + 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white border border-sky-300 rounded text-sky-700 font-bold hover:bg-sky-100 transition-all cursor-pointer text-[10px] select-none"
                      title="افزایش ۱ میلی‌متر"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-500 font-normal mr-0.5">mm</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setShowPrintModal(false); setSelectedInv(null); }}
                  className="px-4 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  بستن
                </button>
              </div>
            </div>

            {/* Interactive Window Resize Handle & +/- Buttons (Bottom-Right Corner) */}
            <div className="absolute bottom-1 right-1 z-30 flex items-center gap-1 bg-white/95 border border-slate-300 shadow-md rounded-tl-xl rounded-br-lg px-2 py-1 no-print select-none">
              <span className="text-[10px] font-bold text-slate-700">
                تغییر سایز کادر:
              </span>
              <button
                type="button"
                onClick={() => handleModalStepResize(1, printModalRef)}
                className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 font-black text-xs transition-colors cursor-pointer border border-slate-300 active:scale-95"
                title="بزرگ‌تر کردن کادر (+)"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => handleModalStepResize(-1, printModalRef)}
                className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 font-black text-xs transition-colors cursor-pointer border border-slate-300 active:scale-95"
                title="کوچک‌تر کردن کادر (-)"
              >
                -
              </button>
              <div
                onMouseDown={(e) => startModalResize(e, printModalRef)}
                onTouchStart={(e) => startModalResizeTouch(e, printModalRef)}
                className="mr-1 cursor-se-resize text-slate-400 hover:text-indigo-600 transition-colors flex items-center"
                title="تغییر اندازه پنجره با کشیدن"
              >
                <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v6h-6M21 9v12H9" />
                </svg>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Deposit validation error popup dialog modal */}
      {depositError && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-[100] animate-fade-in popup-overlay-global" id="dialog-deposit-error">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl shadow-2xl w-full max-w-md p-6 overflow-hidden animate-scale-up border border-rose-100 dark:border-rose-950 text-right space-y-4 popup-box-global">
            <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400 font-bold border-b border-slate-100 dark:border-slate-800 pb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-md font-extrabold">خطای بیعانه دریافتی</h4>
            </div>
            
            <p className="text-slate-600 dark:text-slate-300 text-xs font-semibold leading-relaxed">
              {depositError}
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDepositError(null)}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm"
                id="btn-close-deposit-error"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shareable graphic card modal (social media optimized layout) */}
      {showShareModal && selectedInv && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in popup-overlay-global" id="dialog-share-invoice">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl shadow-2xl w-full max-w-md p-6 overflow-hidden animate-scale-up animate-duration-150 space-y-4 popup-box-global">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="font-bold text-sm text-slate-850 dark:text-slate-150">کارت فاکتور (مناسب اشتراک‌گذاری در پیام‌رسان‌ها)</h4>
              <button 
                onClick={() => { setShowShareModal(false); setSelectedInv(null); }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Simulated Mobile Card Display */}
            <div className="bg-slate-900 rounded-2xl p-5 text-white space-y-5 border border-slate-800 relative font-sans shadow-lg shadow-blue-900/20" id="invoice-social-card">
              
              {/* Decorative lights */}
              <div className="absolute top-0 right-1/4 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>
              
              <div className="flex justify-between items-start border-b border-white/10 pb-4 text-right">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-blue-400 tracking-wider block bg-blue-950 px-2.5 py-0.5 rounded-full w-fit">ازفاکتور این</span>
                  <h3 className="font-bold text-md mt-1.5 font-sans">فروشگاه و شرکت بازرگانی</h3>
                </div>
                <div className="text-left font-mono">
                  <span className="text-[10px] text-white/55 block">کد فاکتور</span>
                  <span className="text-xs font-bold font-mono">{selectedInv.invoiceNumber}</span>
                </div>
              </div>

              {/* Customer Details */}
              <div className="space-y-1.5 text-xs text-white/80 bg-white/5 rounded-xl p-3 border border-white/5 text-right">
                <div className="flex items-center gap-2 justify-end"><span className="order-2">مشتری: <strong>{selectedInv.counterpartName}</strong></span><UserCheck className="w-3.5 h-3.5 text-blue-400 order-1" /></div>
                <div className="flex items-center gap-2 justify-end"><span className="font-mono order-2">تماس: {selectedInv.counterpartPhone || '-'}</span><Phone className="w-3.5 h-3.5 text-blue-400 order-1" /></div>
                <div className="flex items-center gap-2 justify-end text-white/60"><span className="order-2">تاریخ: {selectedInv.date}</span><Tag className="w-3.5 h-3.5 text-blue-400 order-1" /></div>
              </div>

              {/* Items listing list */}
              <div className="space-y-2 text-right">
                <span className="text-[10px] text-white/50 block font-bold">نام و مشخصات کالا:</span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {selectedInv.items.map((it, i) => (
                    <div key={i} className="flex justify-between items-center text-xs border-b border-white/5 pb-1.5 text-white/90">
                      <div className="text-right">
                        <span className="font-bold">{it.name}</span>
                        {it.remarks && it.remarks.trim() !== '' && (
                          <div className="text-[10px] text-white/60 font-normal mt-0.5">
                            توضیحات: {it.remarks}
                          </div>
                        )}
                      </div>
                      <div className="text-left font-mono text-xs">
                        <span className="text-slate-400 text-[10px] block font-semibold">{it.qty} عدد  {formatCurrency(it.unitPrice)}</span>
                        <span className="font-bold text-blue-400 block">{formatCurrency(it.totalPrice)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grand Total badge */}
              <div className="bg-gradient-to-l from-blue-600 to-indigo-700 rounded-xl p-3.5 border border-blue-500 flex justify-between items-center text-xs">
                <span className="font-bold">مبلغ با به پرداخت:</span>
                <span className="font-bold font-mono text-sm tracking-wider text-white select-all">{formatCurrency(selectedInv.totalAmount)}</span>
              </div>

              {/* Bottom stamp */}
              <div className="flex justify-between items-center text-[9px] text-white/40 pt-2 border-t border-white/10">
                <span className="font-mono">اطلاعات کالا و پیش‌پرداخت تکمیل است</span>
                <span className="flex items-center gap-1 text-emerald-400"><Award className="w-3 h-3" /> پرداخت معتبر</span>
              </div>

            </div>

            {/* Simulated Share feedback */}
            <p className="text-[11px] text-slate-500 leading-relaxed text-center">
              کارت تصویری فاکتور آماده ارسال و اشتراک‌گذاری در شبکه‌های اجتماعییچاپ تلفنبه است.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`مشتری مگابایتوارد ${selectedInv.counterpartName} فاکتور خرید شماره ${selectedInv.invoiceNumber} به مبلغ ${formatCurrency(selectedInv.totalAmount)} از تاریخ ${selectedInv.date} ثبت نشده.`);
                  alert('تا فاکتور جهت ارسال یکپیش شده.');
                }}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer text-center"
              >
                یکپیش تا پیش‌پرداخت فاکتور
              </button>
              <button
                onClick={handleExportDigitalCardAsImage}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer text-center"
              >
                اشتراک تصویر کارت فاکتور
              </button>
              <button
                onClick={() => { setShowShareModal(false); setSelectedInv(null); }}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
              >
                بستن
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Live Preview Modal */}
      {showLivePreview && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-2 sm:p-3 md:p-4 z-50 animate-fade-in popup-overlay-global" dir="rtl">
          <div 
            ref={livePreviewModalRef}
            style={{
              width: modalDimensions.width ? `${modalDimensions.width}px` : undefined,
              height: modalDimensions.height ? `${modalDimensions.height}px` : undefined,
              maxWidth: modalDimensions.width ? '98vw' : undefined,
              maxHeight: modalDimensions.height ? '98vh' : undefined,
            }}
            className={`bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full p-3 md:p-4 border border-slate-100 dark:border-slate-800 flex flex-col ${
              modalDimensions.height ? '' : 'h-[96vh] max-h-[98vh]'
            } overflow-hidden relative ${
              modalDimensions.width ? '' : paperSize === 'A4_landscape' ? 'max-w-6xl' : paperSize === 'A5_landscape' ? 'max-w-4xl' : paperSize === 'A5_portrait' ? 'max-w-xl' : 'max-w-3xl'
            }`}
          >
            
            {/* Compact Sleek Toolbar Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0 no-print" dir="rtl">
              <div className="flex flex-wrap items-center gap-2">
                {/* Shortened Title */}
                <div className="flex items-center gap-1.5 font-black text-slate-800 dark:text-slate-100 text-sm pl-1">
                  <Eye className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>پیش‌نمایش</span>
                </div>

                {/* Quick Paper Size Selector Badge */}
                <div className="flex items-center gap-1 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-lg px-2 py-0.5 text-purple-900 dark:text-purple-200 text-xs font-bold" title="سایز کاغذ">
                  <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                  <select
                    value={paperSize}
                    onChange={(e) => updatePaperSize(e.target.value)}
                    className="bg-transparent text-[11px] font-black text-purple-700 dark:text-purple-300 focus:outline-none cursor-pointer pr-0.5"
                  >
                    <option value="A4_portrait" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">A4 عمودی</option>
                    <option value="A4_landscape" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">A4 افقی</option>
                    <option value="A5_portrait" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">A5 عمودی</option>
                    <option value="A5_landscape" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">A5 افقی</option>
                  </select>
                </div>

                {/* Raw Paper Image Template Quick Uploader */}
                <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg px-2 py-0.5 text-amber-900 dark:text-amber-200 text-xs font-bold no-print" title="تصویر پس‌زمینه سربرگ">
                  <Image className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-[11px]">پس‌زمینه:</span>
                  {paperBgImages[paperSize] ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> فعال
                      </span>
                      <label className="text-[10px] text-purple-700 dark:text-purple-300 hover:underline font-extrabold cursor-pointer">
                        تغییر تصویر
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              const file = e.target.files[0];
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const b64 = ev.target?.result as string;
                                if (b64) {
                                  updatePaperBgImage(paperSize, b64);
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => updatePaperBgImage(paperSize, '')}
                        className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline font-extrabold cursor-pointer"
                        title="حذف تصویر پس‌زمینه"
                      >
                        حذف
                      </button>
                    </div>
                  ) : (
                    <label className="text-[10px] text-amber-700 dark:text-amber-300 hover:underline font-extrabold cursor-pointer">
                      انتخاب تصویر
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const file = e.target.files[0];
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const b64 = ev.target?.result as string;
                              if (b64) {
                                updatePaperBgImage(paperSize, b64);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* Vertical Shift Control (Top & Bottom Sections) */}
                <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-lg px-2 py-0.5 text-blue-900 dark:text-blue-200 text-xs font-bold no-print" title="تنظیم موقعیت عمودی فاکتور">
                  <ArrowUpDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  
                  {/* Top Section */}
                  <div className="flex items-center gap-0.5" title="فاصله از بالا (میلی‌متر)">
                    <span className="text-[10px] text-blue-700 dark:text-blue-300 font-extrabold">بالا:</span>
                    <button
                      type="button"
                      onClick={() => updateTopOffset(topOffsetMm - 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded text-blue-700 dark:text-blue-300 font-bold hover:bg-blue-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none"
                      title="کاهش فاصله از بالا"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      value={topOffsetMm}
                      onChange={(e) => updateTopOffset(parseFloat(e.target.value) || 0)}
                      className="w-8 text-center bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded py-0 text-[11px] font-mono font-bold text-blue-950 dark:text-blue-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateTopOffset(topOffsetMm + 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded text-blue-700 dark:text-blue-300 font-bold hover:bg-blue-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none"
                      title="افزایش فاصله از بالا"
                    >
                      +
                    </button>
                  </div>

                  <span className="text-blue-300 dark:text-blue-700 font-normal">|</span>

                  {/* Bottom Section */}
                  <div className="flex items-center gap-0.5" title="فاصله از پایین (میلی‌متر)">
                    <span className="text-[10px] text-blue-700 dark:text-blue-300 font-extrabold">پایین:</span>
                    <button
                      type="button"
                      onClick={() => updateBottomOffset(bottomOffsetMm - 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded text-blue-700 dark:text-blue-300 font-bold hover:bg-blue-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none"
                      title="کاهش فاصله از پایین"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      value={bottomOffsetMm}
                      onChange={(e) => updateBottomOffset(parseFloat(e.target.value) || 0)}
                      className="w-8 text-center bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded py-0 text-[11px] font-mono font-bold text-blue-950 dark:text-blue-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateBottomOffset(bottomOffsetMm + 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded text-blue-700 dark:text-blue-300 font-bold hover:bg-blue-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none"
                      title="افزایش فاصله از پایین"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mr-0.5">mm</span>
                  </div>
                </div>

                {/* Even Row Glass Opacity Control */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-lg px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold no-print" title="تنظیم شفافیت سطرهای متناوب">
                  <Layers className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 shrink-0" />
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => updateEvenRowOpacity(evenRowOpacity - 5)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-800 transition-all cursor-pointer text-[10px] select-none"
                      title="کاهش ۵٪"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={evenRowOpacity}
                      onChange={(e) => updateEvenRowOpacity(parseInt(e.target.value) || 0)}
                      className="w-9 text-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded py-0 text-[11px] font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateEvenRowOpacity(evenRowOpacity + 5)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-800 transition-all cursor-pointer text-[10px] select-none"
                      title="افزایش ۵٪"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mr-0.5">%</span>
                  </div>
                </div>

                {/* Inner Invoice Content Scale Control */}
                <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-lg px-2 py-0.5 text-indigo-900 dark:text-indigo-200 text-xs font-bold no-print" title="بزرگنمایی محتوای فاکتور">
                  <ZoomIn className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="text-[11px] font-bold">بزرگنمایی:</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => updatePreviewContentScale(previewContentScale - 5)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded text-indigo-700 dark:text-indigo-300 font-bold hover:bg-indigo-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none active:scale-95"
                      title="افزایش ۵٪ بزرگنمایی"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="30"
                      max="300"
                      step="5"
                      value={previewContentScale}
                      onChange={(e) => updatePreviewContentScale(parseInt(e.target.value) || 100)}
                      className="w-10 text-center bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded py-0 text-[11px] font-mono font-bold text-indigo-950 dark:text-indigo-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updatePreviewContentScale(previewContentScale + 5)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded text-indigo-700 dark:text-indigo-300 font-bold hover:bg-indigo-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none active:scale-95"
                      title="کاهش ۵٪ بزرگنمایی"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mr-0.5">%</span>
                    {previewContentScale !== 100 && (
                      <button
                        type="button"
                        onClick={() => updatePreviewContentScale(100)}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline mr-0.5 font-extrabold cursor-pointer"
                        title="تنظیم بزرگنمایی ۱۰۰٪"
                      >
                        ۱۰۰٪
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer transition-all"
                  title="چاپ فاکتور (Ctrl+P)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>چاپ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowLivePreview(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="بستن"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Paper Styled Preview Box - Smart Auto-Fit without vertical scroll */}
            <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-auto py-1 relative">
              <div 
                className="max-h-full max-w-full flex items-center justify-center transition-all duration-150 ease-out origin-center"
                style={{
                  zoom: previewContentScale / 100,
                }}
              >
                {renderA4PreviewContent('invoice-live-preview-box')}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 pr-36 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                {/* Extra Print Top Margin Control (Personnel-Scoped) */}
                <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-lg px-2 py-0.5 text-emerald-900 dark:text-emerald-200 text-xs font-bold no-print" title="تنظیم حاشیه بالای صفحه در چاپ">
                  <ArrowDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-[11px] font-bold">فاصله بالای چاپ:</span>
                  <div className="flex items-center gap-0.5" title="تنظیم حاشیه و فاصله چاپ (mm)">
                    <button
                      type="button"
                      onClick={() => updatePrintExtraTopMargin(printExtraTopMarginMm - 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded text-emerald-700 dark:text-emerald-300 font-bold hover:bg-emerald-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none"
                      title="کاهش ۱ میلی‌متر"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={printExtraTopMarginMm}
                      onChange={(e) => updatePrintExtraTopMargin(parseFloat(e.target.value) || 0)}
                      className="w-8 text-center bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded py-0 text-[11px] font-mono font-bold text-emerald-950 dark:text-emerald-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updatePrintExtraTopMargin(printExtraTopMarginMm + 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded text-emerald-700 dark:text-emerald-300 font-bold hover:bg-emerald-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none"
                      title="افزایش ۱ میلی‌متر"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mr-0.5">mm</span>
                  </div>
                </div>

                {/* Extra Print Side Margin Control (Personnel-Scoped) */}
                <div className="flex items-center gap-1.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-lg px-2 py-0.5 text-sky-900 dark:text-sky-200 text-xs font-bold no-print" title="تنظیم حاشیه چپ و راست صفحه در چاپ">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span className="text-[11px] font-bold">فاصله چپ و راست چاپ:</span>
                  <div className="flex items-center gap-0.5" title="تنظیم حاشیه چپ و راست در چاپ (mm)">
                    <button
                      type="button"
                      onClick={() => updatePrintExtraSideMargin(printExtraSideMarginMm - 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-sky-300 dark:border-sky-700 rounded text-sky-700 dark:text-sky-300 font-bold hover:bg-sky-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none"
                      title="کاهش ۱ میلی‌متر"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={printExtraSideMarginMm}
                      onChange={(e) => updatePrintExtraSideMargin(parseFloat(e.target.value) || 0)}
                      className="w-8 text-center bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 rounded py-0 text-[11px] font-mono font-bold text-sky-950 dark:text-sky-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => updatePrintExtraSideMargin(printExtraSideMarginMm + 1)}
                      className="w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-sky-300 dark:border-sky-700 rounded text-sky-700 dark:text-sky-300 font-bold hover:bg-sky-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none"
                      title="افزایش ۱ میلی‌متر"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mr-0.5">mm</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowLivePreview(false)}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-350 dark:hover:bg-slate-750 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  بستن
                </button>
              
              {editingInvoice ? (
                editingInvoice.isProforma ? (
                  <>
                    <button
                      disabled={isPhoneBlocked || isSavingInvoice}
                      onClick={() => {
                        setShowLivePreview(false);
                        handleSaveInvoiceInternal(undefined, true);
                      }}
                      className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors flex items-center gap-1.5 ${
                        isPhoneBlocked || isSavingInvoice
                          ? 'bg-amber-400 opacity-60 cursor-not-allowed hover:bg-amber-400'
                          : 'bg-amber-600 hover:bg-amber-700 hover:shadow-md cursor-pointer'
                      }`}
                    >
                      <Save className="w-4 h-4" />
                      <span>{isSavingInvoice ? 'در حال ذخیره...' : 'ذخیره تغییرات پیش‌فاکتور'}</span>
                    </button>

                    <button
                      disabled={isPhoneBlocked || isSavingInvoice}
                      onClick={() => {
                        setShowLivePreview(false);
                        handleSaveInvoiceInternal(undefined, false);
                      }}
                      className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors flex items-center gap-1.5 ${
                        isPhoneBlocked || isSavingInvoice
                          ? 'bg-emerald-400 opacity-60 cursor-not-allowed hover:bg-emerald-400'
                          : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-md cursor-pointer'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>{isSavingInvoice ? 'در حال ثبت...' : 'صدور و ثبت فاکتور'}</span>
                    </button>
                  </>
                ) : (
                  <button
                    disabled={isPhoneBlocked || isSavingInvoice}
                    onClick={() => {
                      setShowLivePreview(false);
                      handleSaveInvoiceInternal(undefined, false);
                    }}
                    className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors flex items-center gap-1.5 ${
                      isPhoneBlocked || isSavingInvoice
                        ? 'bg-emerald-400 opacity-60 cursor-not-allowed hover:bg-emerald-400'
                        : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingInvoice ? 'در حال ذخیره...' : 'ذخیره تغییرات فاکتور'}</span>
                  </button>
                )
              ) : (
                <>
                  <button
                    disabled={isPhoneBlocked || isSavingInvoice}
                    onClick={() => {
                      setShowLivePreview(false);
                      handleSaveInvoiceInternal(undefined, true);
                    }}
                    className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors ${
                      isPhoneBlocked || isSavingInvoice
                        ? 'bg-rose-400 opacity-60 cursor-not-allowed hover:bg-rose-400'
                        : 'bg-rose-600 hover:bg-rose-750 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    {isSavingInvoice ? 'در حال ثبت...' : 'ذخیره پیش‌فاکتور'}
                  </button>

                  <button
                    disabled={isPhoneBlocked || isSavingInvoice}
                    onClick={() => {
                      setShowLivePreview(false);
                      handleSaveInvoiceInternal(undefined, false, true);
                    }}
                    className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors flex items-center gap-1.5 ${
                      isPhoneBlocked || isSavingInvoice
                        ? 'bg-blue-400 opacity-60 cursor-not-allowed hover:bg-blue-400'
                        : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    <Printer className="w-4 h-4" />
                    <span>{isSavingInvoice ? 'در حال ثبت...' : 'ثبت نهایی'}</span>
                  </button>

                  <button
                    disabled={isPhoneBlocked || isSavingInvoice}
                    onClick={() => {
                      setShowLivePreview(false);
                      handleSaveInvoiceInternal(undefined, false);
                    }}
                    className={`px-6 py-2.5 text-white font-bold rounded-xl text-xs shadow transition-colors ${
                      isPhoneBlocked || isSavingInvoice
                        ? 'bg-emerald-400 opacity-60 cursor-not-allowed hover:bg-emerald-400'
                        : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    {isSavingInvoice ? 'در حال ثبت...' : 'چاپ مستقیم'}
                  </button>
                </>
              )}
              </div>
            </div>

            {/* Interactive Window Resize Handle & +/- Buttons (Bottom-Right Corner) */}
            <div className="absolute bottom-1 right-1 z-30 flex items-center gap-1 bg-white/95 dark:bg-slate-800/95 border border-slate-300 dark:border-slate-700 shadow-md rounded-tl-xl rounded-br-lg px-2 py-1 no-print select-none">
              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                تغییر سایز کادر:
              </span>
              <button
                type="button"
                onClick={() => handleModalStepResize(1, livePreviewModalRef)}
                className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 dark:bg-slate-700 dark:hover:bg-indigo-900/50 dark:text-slate-200 dark:hover:text-indigo-300 font-black text-xs transition-colors cursor-pointer border border-slate-300 dark:border-slate-600 active:scale-95"
                title="بزرگ‌تر کردن کادر (+)"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => handleModalStepResize(-1, livePreviewModalRef)}
                className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 dark:bg-slate-700 dark:hover:bg-indigo-900/50 dark:text-slate-200 dark:hover:text-indigo-300 font-black text-xs transition-colors cursor-pointer border border-slate-300 dark:border-slate-600 active:scale-95"
                title="کوچک‌تر کردن کادر (-)"
              >
                -
              </button>
              <div
                onMouseDown={(e) => startModalResize(e, livePreviewModalRef)}
                onTouchStart={(e) => startModalResizeTouch(e, livePreviewModalRef)}
                className="mr-1 cursor-se-resize text-slate-400 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 transition-colors flex items-center"
                title="تغییر اندازه پنجره با کشیدن"
              >
                <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v6h-6M21 9v12H9" />
                </svg>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Custom Deletion Confirmation Popup */}
      {deleteConfirmOpen && invoiceToDelete && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl shadow-xl w-full max-w-sm p-6 text-right border border-slate-200 dark:border-slate-800 space-y-4 popup-box-global">
            <h4 className="font-bold text-slate-800 dark:text-white text-sm">
              {invoiceToDelete.isProforma ? 'حذف پیش‌فاکتور' : 'حذف فاکتور'}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-bold">
              آیا از حذف {invoiceToDelete.isProforma ? 'پیش‌فاکتور' : 'فاکتور'} شماره <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">{toPersianDigits(invoiceToDelete.invoiceNumber)}</span> اطمینان دارید؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setInvoiceToDelete(null);
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                type="button"
              >
                انصراف
              </button>
              <button
                onClick={() => {
                  onDeleteInvoice(invoiceToDelete.id);
                  setDeleteConfirmOpen(false);
                  setInvoiceToDelete(null);
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

      {/* Permanent Deletion Confirmation Popup for Admin */}
      {permanentDeleteConfirmOpen && invoiceToPermanentDelete && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl shadow-xl w-full max-w-sm p-6 text-right border border-rose-200 dark:border-rose-900/50 space-y-4 popup-box-global">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-extrabold text-sm border-b border-slate-100 dark:border-slate-800 pb-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4>حذف دائمی فاکتور از سیستم</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-bold">
              آیا از حذف کامل فاکتور شماره <span className="font-mono text-rose-600 dark:text-rose-400">{toPersianDigits(invoiceToPermanentDelete.invoiceNumber)}</span> اطمینان دارید؟ این فاکتور <span className="text-rose-600 dark:text-rose-400 underline font-black">به طور کامل و دائمی از سیستم</span> پاک خواهد شد. این عملیات سند غیرقابل بازگشت است.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setPermanentDeleteConfirmOpen(false);
                  setInvoiceToPermanentDelete(null);
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                type="button"
              >
                انصراف
              </button>
              <button
                onClick={() => {
                  if (onPermanentDeleteInvoice) {
                    onPermanentDeleteInvoice(invoiceToPermanentDelete.id);
                  } else {
                    onDeleteInvoice(invoiceToPermanentDelete.id);
                  }
                  setPermanentDeleteConfirmOpen(false);
                  setInvoiceToPermanentDelete(null);
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm"
                type="button"
              >
                تأیید حذف دائمی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Deletion Confirmation Popup for Invoices */}
      {batchDeleteModalOpen && targetBatchInvoices.length > 0 && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-55 animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl shadow-2xl w-full max-w-md p-6 text-right border border-rose-200 dark:border-rose-900/50 space-y-4 popup-box-global">
            <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400 font-extrabold text-base border-b border-slate-150 dark:border-slate-800 pb-3">
              <div className="p-2 bg-rose-100 dark:bg-rose-950/60 rounded-xl text-rose-600 dark:text-rose-400">
                <Trash2 className="w-5 h-5 shrink-0" />
              </div>
              <div>
                <h4>
                  {archiveTab === 'deleted' && currentUser.role === 'admin'
                    ? 'حذف کامل فاکتور رسمی از سیستم'
                    : 'انتقال فاکتور به سطل زباله'}
                </h4>
                <p className="text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                  {batchDeleteTarget === 'all_filtered' ? 'تمام فاکتورهای فیلتر شده' : 'فاکتورهای انتخاب شده'}
                </p>
              </div>
            </div>

            <div className="bg-rose-50/70 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                <span className="font-medium">تعداد فاکتورها:</span>
                <span className="font-bold text-rose-600 dark:text-rose-400 font-mono text-sm">
                  {toPersianDigits(targetBatchInvoices.length)} عدد
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                <span className="font-medium">جمع کل مبالغ:</span>
                <span className="font-bold text-slate-900 dark:text-white font-mono">
                  {formatCurrency(targetBatchTotalAmount)} {currencyLabel}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                <span className="font-medium">دسته‌بندی:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {archiveTab === 'all' ? ' فاکتورها' :
                   archiveTab === 'sale' ? 'فاکتورهای فروش' :
                   archiveTab === 'proforma' ? 'پیش‌فاکتورها' :
                   archiveTab === 'purchase' ? 'فاکتورهای خرید' : 'فاکتورهای حذف شده'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">
              {archiveTab === 'deleted' && currentUser.role === 'admin'
                ? 'هشدار: با حذف دائمی، تمام اطلاعات فاکتورهای انتخابی به طور کامل از پایگاه داده پاک خواهند شد.'
                : 'با حذف فاکتور، اقلام به سطل زباله منتقل شده و موجودی کالاها در انبار متناسب با آن تعدیل می‌گردد.'}
            </p>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-150 dark:border-slate-800">
              <button
                disabled={isBatchDeleting}
                onClick={() => {
                  setBatchDeleteModalOpen(false);
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                type="button"
              >
                انصراف
              </button>
              <button
                disabled={isBatchDeleting}
                onClick={handleConfirmBatchDeleteInvoices}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm flex items-center justify-center gap-1.5"
                type="button"
              >
                {isBatchDeleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>
                  {isBatchDeleting ? 'در حال حذف...' : `تأیید حذف ${toPersianDigits(targetBatchInvoices.length)} فاکتور`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warning popup for undefined goods or services */}
      {undefinedItemPopup.isOpen && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-55 flex items-center justify-center p-4 animate-fade-in animate-duration-150 popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-up animate-duration-150 popup-box-global">
            
            {/* Header / Title */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 dark:text-white">کالای تعریف‌نشده در انبار!</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">
                    این کالا یا خدمات در لیست انبار موجود نیست
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUndefinedItemPopup({ isOpen: false, rowIdx: -1, itemName: '', showAddForm: false })}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* If we are NOT showing the add form yet, show the warning and the "Add to warehouse" option */}
            {!undefinedItemPopup.showAddForm || activeType === 'sale' ? (
              <div className="space-y-4">
                <div className="bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/40 p-4 rounded-xl text-xs font-bold text-amber-800 dark:text-amber-400 space-y-2">
                  <p className="leading-relaxed">
                    کالا یا خدمات با نام <span className="underline font-black">«{undefinedItemPopup.itemName}»</span> در انبار یافت نشد.
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {activeType === 'sale'
                      ? 'جهت صدور فاکتور فروش، می‌توانید این کالا را به عنوان کالای جدید به انبار اضافه نمایید.'
                      : 'جهت ثبت فاکتور خرید، این کالا را به عنوان کالای جدید در انبار ثبت نمایید.'}
                  </p>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  {activeType !== 'sale' && (
                    <button
                      type="button"
                      onClick={() => {
                        // Reset and prepare adding form
                        setPopupItemName(undefinedItemPopup.itemName);
                        setPopupItemType('kala');
                        setPopupItemColor('');
                        setPopupItemQty(1);
                        setPopupItemUnit('عدد');
                        setPopupItemLastPur(0);
                        setPopupItemLastSale(0);
                        setPopupItemMinQtyAlarm(undefined);
                        setUndefinedItemPopup(prev => ({ ...prev, showAddForm: true }));
                      }}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/10"
                    >
                      <Plus className="w-4 h-4" />
                      <span>افزودن کالا به انبار</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setUndefinedItemPopup({ isOpen: false, rowIdx: -1, itemName: '', showAddForm: false })}
                    className="px-5 py-2.5 bg-slate-150 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 text-[11px] font-black rounded-xl cursor-pointer transition-all"
                  >
                    {activeType === 'sale' ? 'ثبت بدون افزودن به انبار' : 'انصراف'}
                  </button>
                </div>
              </div>
            ) : (
              /* Show the complete "Add Item" form, looking exactly like the one in WarehouseManager */
              <form onSubmit={handleSavePopupItem} className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs font-semibold">
                
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-600 dark:text-slate-400 block">نام کالا و خدمات</label>
                    <input
                      type="text"
                      autoComplete="off"
                      value={popupItemName}
                      onChange={(e) => setPopupItemName(e.target.value)}
                      placeholder="مثال: لپ‌تاپ لنوو مدل ThinkPad"
                      className="w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-250 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 leading-5"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-slate-600 dark:text-slate-400 block">دسته‌بندی</label>
                      <select
                        value={popupItemType}
                        onChange={(e) => setPopupItemType(e.target.value as any)}
                        className="w-full p-2.5 bg-white dark:bg-slate-950 border border-slate-250 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-slate-100 bg-white"
                      >
                        <option value="kala">کالای تجاری (انبارداری)</option>
                        <option value="consumables">کالای مصرفی و ملزومات</option>
                        <option value="khadamat">خدمات (بدون انبارداری)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-600 dark:text-slate-400 block">رنگ یا مشخصه کالا</label>
                      <input
                        type="text"
                        autoComplete="off"
                        value={popupItemColor}
                        disabled={popupItemType === 'khadamat'}
                        onChange={(e) => setPopupItemColor(e.target.value)}
                        placeholder="مثال: مشکی / آبی"
                        className="w-full p-2.5 bg-white dark:bg-slate-950 border border-slate-250 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-slate-100 disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {(popupItemType === 'kala' || popupItemType === 'consumables') && (
                    <div className="space-y-3 bg-blue-50/40 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/40 p-4 rounded-xl">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5 col-span-1">
                            <label className="text-slate-600 dark:text-slate-400 block font-bold text-[10px]">واحد سنجش</label>
                            <select
                              value={popupItemUnit}
                              onChange={(e) => setPopupItemUnit(e.target.value)}
                              className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-800 dark:text-white"
                            >
                              <option value="عدد">عدد</option>
                              <option value="بسته">بسته</option>
                              <option value="واحد">واحد</option>
                              <option value="دستگاه">دستگاه</option>
                            </select>
                          </div>
                          <div className="space-y-1.5 col-span-1">
                            <label className="text-slate-600 dark:text-slate-400 block font-bold text-[10px]">موجودی اولیه در انبار</label>
                            <input
                              type="number"
                              autoComplete="off"
                              value={popupItemQty}
                              onChange={(e) => setPopupItemQty(parseInt(e.target.value) || 0)}
                              className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-lg text-md font-bold font-mono text-center text-slate-800 dark:text-slate-150 focus:outline-none focus:border-blue-600"
                              min="0"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-orange-950 dark:text-orange-300 block font-bold text-[10px]">حداقل موجودی هشدار</label>
                          <input
                            type="number"
                            autoComplete="off"
                            value={popupItemMinQtyAlarm === undefined ? '' : popupItemMinQtyAlarm}
                            onChange={(e) => setPopupItemMinQtyAlarm(e.target.value === '' ? undefined : parseInt(e.target.value) || 0)}
                            className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-lg text-md font-bold font-mono text-center text-orange-700 focus:outline-none focus:border-orange-500"
                            min="0"
                            placeholder="مثال: ۵"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium">پس از ثبت، کالا در انبار ذخیره شده و در ردیف فاکتور لحاظ خواهد شد.</p>
                    </div>
                  )}

                  <div className="space-y-4 bg-slate-50 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                    <h4 className="font-bold text-slate-700 dark:text-slate-300 text-xs border-b border-slate-200 dark:border-slate-800 pb-1.5 mb-2.5">قیمت‌های پیش‌فرض در فاکتورها</h4>
                    
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-slate-600 dark:text-slate-400 block">آخرین قیمت خرید ({currencyLabel})</label>
                        <input
                          type="number"
                          autoComplete="off"
                          value={popupItemLastPur || ''}
                          onChange={(e) => setPopupItemLastPur(parseFloat(e.target.value) || 0)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-left text-xs font-bold text-indigo-700 dark:text-indigo-400"
                          placeholder="0"
                        />
                        <span className="text-[10px] text-slate-400 block">{formatCurrency(popupItemLastPur)}</span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-slate-600 dark:text-slate-400 block">آخرین قیمت فروش ({currencyLabel})</label>
                        <input
                          type="number"
                          autoComplete="off"
                          value={popupItemLastSale || ''}
                          onChange={(e) => setPopupItemLastSale(parseFloat(e.target.value) || 0)}
                          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-left text-xs font-bold text-emerald-700 dark:text-emerald-400"
                          placeholder="0"
                        />
                        <span className="text-[10px] text-slate-400 block">{formatCurrency(popupItemLastSale)}</span>
                      </div>
                    </div>
                  </div>

                </div>

                <div className="flex gap-2 justify-end border-t border-slate-100 dark:border-slate-800 pt-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => setUndefinedItemPopup({ isOpen: false, rowIdx: -1, itemName: '', showAddForm: false })}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750 rounded-xl"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold"
                  >
                    ذخیره در انبار و ادامه
                  </button>
                </div>

              </form>
            )}

          </div>
        </div>
      )}

      {/* Warning popup for zero stock item */}
      {zeroStockPopup.isOpen && zeroStockPopup.item && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-55 flex items-center justify-center p-4 animate-fade-in animate-duration-150 popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-amber-300/80 dark:border-amber-900/60 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-scale-up animate-duration-150 popup-box-global">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-11 h-11 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">خروج کالا از انبار</h3>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold mt-0.5">موجودی این کالا در انبار کافی نیست</p>
              </div>
            </div>

            <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-4 rounded-2xl text-xs space-y-3">
              <p className="leading-relaxed font-bold text-slate-800 dark:text-slate-200">
                موجودی کالا <span className="text-amber-700 dark:text-amber-400 font-black underline">«{formatItemNameWithColor(zeroStockPopup.item.name, zeroStockPopup.item.color)}»</span> در انبار برابر با <span className="font-mono font-black text-rose-600">{toPersianDigits(zeroStockPopup.item.qty)} {zeroStockPopup.item.unit || 'عدد'}</span> است.
              </p>
              <p className="text-xs font-black text-amber-800 dark:text-amber-300">
                آیا مایل به ثبت فاکتور با وجود کسری موجودی هستید؟
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed pt-2 border-t border-amber-200/50 dark:border-amber-900/30">
                نکته: در صورت صدور فاکتور، تراکنش انبار و مالی به صورت خودکار ثبت خواهد شد.
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={handleConfirmZeroStockSale}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تأیید و ادامه ثبت</span>
              </button>
              <button
                type="button"
                onClick={handleCancelZeroStockSale}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Error Pop-up Modal */}
      {validationModalPopup.isOpen && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-55 flex items-center justify-center p-4 animate-fade-in animate-duration-150 popup-overlay-global" dir="rtl" id="dialog-invoice-validation-errors">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-rose-200 dark:border-rose-900/60 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl animate-scale-up animate-duration-150 overflow-hidden flex flex-col max-h-[90vh] popup-box-global">
            
            {/* Header / Title */}
            <div className="flex items-center justify-between pb-3 border-b border-rose-100 dark:border-rose-950 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {validationModalPopup.title || 'تکمیل اطلاعات الزامی فاکتور'}
                  </h3>
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold mt-0.5">
                    لطفاً فیلدهای الزامی زیر را تکمیل نمایید
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setValidationModalPopup({ isOpen: false, errors: [] })}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            {(() => {
              const displayErrors = validationModalPopup.errors.filter(err => {
                if (err.includes('وارد واردتلاشرا') && selectedCustomIcons.length > 0) return false;
                if (err.includes('روش ارسال') && selectedShippingMethod) return false;
                return true;
              });

              return (
                <>
                  {/* Error List Body */}
                  <div className="space-y-3 overflow-y-auto max-h-[30vh] pr-1">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {displayErrors.length > 0 
                        ? 'لطفاً موارد زیر را قبل از صدور فاکتور تکمیل نمایید:'
                        : 'اطلاعات با موفقیت تکمیل شد! اکنون می‌توانید فاکتور را ثبت نمایید.'}
                    </p>
                    
                    <div className="space-y-2">
                      {displayErrors.map((err, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-start gap-2.5 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/50 p-3 rounded-2xl text-xs font-bold text-rose-900 dark:text-rose-300 leading-relaxed"
                        >
                          <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                          <span className="flex-1">{err}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Inline Selectors inside the same modal if they are required/missing for Sales */}
                  {activeType === 'sale' && (validationModalPopup.errors.some(e => e.includes('وارد واردتلاشرا') || e.includes('روش ارسال')) || selectedCustomIcons.length === 0 || !selectedShippingMethod) && (
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-850 space-y-4 shrink-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* 1. Selector for Communication Channel */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                            انتخاب راه ارتباطی <span className="text-rose-500 font-black">*</span>
                          </label>
                          <div className="flex flex-wrap items-center justify-start gap-1.5 pt-0.5">
                            {(() => {
                              const activeSystemIcons = systemIcons.filter(icon => !!icon.iconData);
                              if (activeSystemIcons.length === 0) {
                                return (
                                  <span className="text-[10.5px] text-slate-400 dark:text-slate-500 italic block pt-1">
                                    هیچ روش ارتباطی انتخاب نشده است
                                  </span>
                                );
                              }
                              return activeSystemIcons.map((icon) => {
                                const isSelected = selectedCustomIcons.includes(icon.id);
                                return (
                                  <button
                                    key={icon.id}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedCustomIcons(prev => prev.filter(id => id !== icon.id));
                                      } else {
                                        setSelectedCustomIcons(prev => [...prev, icon.id]);
                                      }
                                    }}
                                    title={icon.name}
                                    className={`w-8 h-8 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all relative select-none ${
                                      isSelected
                                        ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 scale-105 opacity-100 shadow-sm'
                                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-55 hover:opacity-100'
                                    }`}
                                  >
                                    <img src={icon.iconData} alt={icon.name} className="w-full h-full object-cover rounded-full" />
                                    {isSelected && (
                                      <span className="absolute -top-1 -right-1 bg-indigo-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[7px] border border-white font-bold">
                                        
                                      </span>
                                    )}
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        </div>

                        {/* 2. Selector for Shipping Method */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                            نوع ارسال <span className="text-rose-500 font-black">*</span>
                          </label>
                          <div className="flex flex-wrap items-center justify-start gap-1.5 pt-0.5">
                            {shippingMethods.map((method) => {
                              const isSelected = selectedShippingMethod === method.id;
                              return (
                                <button
                                  key={method.id}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedShippingMethod(null);
                                    } else {
                                      setSelectedShippingMethod(method.id);
                                    }
                                  }}
                                  title={method.name}
                                  className={`w-8 h-8 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all relative select-none ${
                                    isSelected
                                      ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 scale-105 opacity-100 shadow-sm'
                                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-55 hover:opacity-100'
                                  }`}
                                >
                                  {method.iconData ? (
                                    <img src={method.iconData} alt={method.name} className="w-full h-full object-cover rounded-full" />
                                  ) : (
                                    <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400">{method.name ? method.name[0] : 'از'}</span>
                                  )}
                                  {isSelected && (
                                    <span className="absolute -top-1 -right-1 bg-indigo-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[7px] border border-white font-bold">
                                      
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Footer / Action */}
                  <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => setValidationModalPopup({ isOpen: false, errors: [] })}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl cursor-pointer transition-all"
                    >
                      بستن پنجره
                    </button>

                    {displayErrors.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setValidationModalPopup({ isOpen: false, errors: [] });
                          // Execute final save
                          setTimeout(() => {
                            handleSaveInvoiceInternal(undefined, validationModalPopup.isPfPassed, validationModalPopup.andPrint);
                          }, 100);
                        }}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl cursor-pointer transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1"
                      >
                        ثبت و صدور فاکتور
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setValidationModalPopup({ isOpen: false, errors: [] });
                          setTimeout(() => {
                            handleSaveInvoiceInternal(undefined, validationModalPopup.isPfPassed, validationModalPopup.andPrint);
                          }, 100);
                        }}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl cursor-pointer transition-all shadow-md shadow-indigo-600/20"
                      >
                        تکمیل و ثبت فاکتور
                      </button>
                    )}
                  </div>
                </>
              );
            })()}

          </div>
        </div>
      )}

      {/* Negative Stock Warning Modal Popup */}
      {negativeStockPrompt.isOpen && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-55 flex items-center justify-center p-4 animate-fade-in animate-duration-150 popup-overlay-global" dir="rtl" id="dialog-negative-stock-warning">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-rose-300 dark:border-rose-800/80 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl animate-scale-up animate-duration-150 popup-box-global">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-11 h-11 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">هشدار کسری موجودی در انبار</h3>
                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold mt-0.5">تعداد درخواستی در فاکتور بیشتر از موجودی انبار است</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                اقلام زیر در انبار با کسری موجودی مواجه هستند:
              </p>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold sticky top-0">
                    <tr>
                      <th className="p-2.5">نام کالا</th>
                      <th className="p-2.5 text-center">موجودی</th>
                      <th className="p-2.5 text-center">تعداد فاکتور</th>
                      <th className="p-2.5 text-center text-rose-600 dark:text-rose-400">کسری موجودی</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {negativeStockPrompt.items.map((item, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                        <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">{item.name}</td>
                        <td className="p-2.5 text-center font-mono">{toPersianDigits(item.available)}</td>
                        <td className="p-2.5 text-center font-mono font-bold">{toPersianDigits(item.requested)}</td>
                        <td className="p-2.5 text-center font-mono font-black text-rose-600 dark:text-rose-400">
                          {toPersianDigits(item.deficit)} -
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setNegativeStockPrompt({ isOpen: false, items: [] })}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                انصرافبا فاکتور
              </button>
              <button
                type="button"
                onClick={() => {
                  const { isPfPassed, andPrint } = negativeStockPrompt;
                  setNegativeStockPrompt({ isOpen: false, items: [] });
                  setTimeout(() => {
                    handleSaveInvoiceInternal(undefined, isPfPassed, andPrint, true);
                  }, 100);
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl cursor-pointer transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5"
                id="btn-confirm-negative-stock-save"
              >
                <span>تأیید و ثبت نهایی فاکتور </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price Reduction Error Modal Popup */}
      {priceErrorModal.isOpen && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-55 flex items-center justify-center p-4 animate-fade-in animate-duration-150 popup-overlay-global" dir="rtl" id="dialog-price-reduction-error">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-amber-300 dark:border-amber-800/80 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-scale-up animate-duration-150 popup-box-global">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-11 h-11 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">خطا در قیمت واحد کالا</h3>
                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold mt-0.5">قیمت وارد شده کمتر از حداقل قیمت مجاز است</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-xs space-y-2.5">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 font-bold">نام کالا / خدمات:</span>
                <span className="font-black text-slate-800 dark:text-slate-100">{priceErrorModal.itemName}</span>
              </div>
              <div className="flex justify-between items-center text-rose-600 dark:text-rose-400 font-bold">
                <span>مبلغ وارد شده:</span>
                <span className="font-mono font-black">{formatCurrency(priceErrorModal.enteredPrice)}</span>
              </div>
              <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-bold pt-1">
                <span>حداقل قیمت پایه:</span>
                <span className="font-mono font-black">{formatCurrency(priceErrorModal.basePrice)}</span>
              </div>
            </div>

            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200 dark:border-amber-900/40">
              قیمت واحد وارد شده کمتر از حداقل قیمت تعیین شده است. حداقل قیمت مجاز (<strong>{formatCurrency(priceErrorModal.basePrice)}</strong>) می‌باشد.
            </p>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setPriceErrorModal({ isOpen: false, rowIdx: -1, itemName: '', enteredPrice: 0, basePrice: 0 })}
                className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl cursor-pointer transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2"
                id="btn-close-price-error-modal"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>متوجه شدم</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Deposit Modal with Date & Time Wheel Scroll */}
      {showCustomDepositModal && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-55 flex items-center justify-center p-4 animate-fade-in animate-duration-150 popup-overlay-global" dir="rtl" id="dialog-custom-deposit-modal">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-indigo-300 dark:border-indigo-800/80 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-scale-up animate-duration-150 popup-box-global">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white">ثبت واریز بیعانه</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomDepositModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Amount Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">مبلغ بیعانه ({currencyLabel})</label>
                  {formSubtotal > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const fullPayable = Math.max(0, subtotal + tax - discount);
                        setCustomDepositAmount(fullPayable.toString());
                      }}
                      className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      جمع فاکتور ({currencyLabel}) قابل پرداخت ({formatCurrency(Math.max(0, subtotal + tax - discount))})
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  autoComplete="off"
                  autoFocus
                  value={customDepositAmount ? parseFloat(customDepositAmount.replace(/,/g, '')).toLocaleString('en-US') : ''}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/,/g, '');
                    setCustomDepositAmount(clean);
                  }}
                  className="w-full px-3 py-2 border border-slate-205 dark:border-slate-800 rounded-xl text-sm font-mono text-left bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-150 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  placeholder="مبلغ بیعانه..."
                />
              </div>

              {/* Date Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">تاریخ بیعانه</label>
                <div className="border border-slate-205 dark:border-slate-800 rounded-xl px-3 py-2 bg-white dark:bg-slate-900">
                  <JalaliDatePicker
                    value={customDepositDate}
                    onChange={(val) => setCustomDepositDate(val)}
                    placeholder="۱۴۰۳/۰۱/۰۱"
                    placement="bottom"
                  />
                </div>
              </div>

              {/* Time Field with Wheel Scroll and Motion Animation */}
              <div className="flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/80">
                <span className="text-xs text-slate-500 font-bold mb-3">تنظیم ساعت و دقیقه (اسکرول با ماوس)</span>
                <div className="flex items-center gap-3" dir="ltr">
                  {/* Hour Block */}
                  <div 
                    ref={hourWheelRef}
                    className="relative w-16 h-20 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center cursor-ns-resize group overflow-hidden select-none"
                    title="تنظیم مجدد ساعت"
                  >
                    {/* Up Arrow */}
                    <button 
                      type="button"
                      onClick={() => setCustomDepositHour(prev => (prev + 1) % 24)}
                      className="absolute top-1 inset-x-0 mx-auto text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex justify-center opacity-0 group-hover:opacity-100"
                    >
                      <span className="text-[10px] select-none"></span>
                    </button>
                    
                    {/* Large Number with Animation */}
                    <div className="text-3xl font-black font-mono text-indigo-600 dark:text-indigo-400 h-9 flex items-center justify-center overflow-hidden">
                      <AnimatePresence mode="popLayout">
                        <motion.span
                          key={customDepositHour}
                          initial={{ y: -15, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: 15, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 300, damping: 20 }}
                          className="inline-block"
                        >
                          {String(customDepositHour).padStart(2, '0')}
                        </motion.span>
                      </AnimatePresence>
                    </div>

                    {/* Down Arrow */}
                    <button 
                      type="button"
                      onClick={() => setCustomDepositHour(prev => (prev - 1 + 24) % 24)}
                      className="absolute bottom-1 inset-x-0 mx-auto text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex justify-center opacity-0 group-hover:opacity-100"
                    >
                      <span className="text-[10px] select-none"></span>
                    </button>
                  </div>

                  {/* Divider */}
                  <span className="text-2xl font-black text-slate-400 animate-pulse">:</span>

                  {/* Minute Block */}
                  <div 
                    ref={minuteWheelRef}
                    className="relative w-16 h-20 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center cursor-ns-resize group overflow-hidden select-none"
                    title="تنظیم مجدد "
                  >
                    {/* Up Arrow */}
                    <button 
                      type="button"
                      onClick={() => setCustomDepositMinute(prev => (prev + 1) % 60)}
                      className="absolute top-1 inset-x-0 mx-auto text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex justify-center opacity-0 group-hover:opacity-100"
                    >
                      <span className="text-[10px] select-none"></span>
                    </button>
                    
                    {/* Large Number with Animation */}
                    <div className="text-3xl font-black font-mono text-indigo-600 dark:text-indigo-400 h-9 flex items-center justify-center overflow-hidden">
                      <AnimatePresence mode="popLayout">
                        <motion.span
                          key={customDepositMinute}
                          initial={{ y: -15, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: 15, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 300, damping: 20 }}
                          className="inline-block"
                        >
                          {String(customDepositMinute).padStart(2, '0')}
                        </motion.span>
                      </AnimatePresence>
                    </div>

                    {/* Down Arrow */}
                    <button 
                      type="button"
                      onClick={() => setCustomDepositMinute(prev => (prev - 1 + 60) % 60)}
                      className="absolute bottom-1 inset-x-0 mx-auto text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex justify-center opacity-0 group-hover:opacity-100"
                    >
                      <span className="text-[10px] select-none"></span>
                    </button>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 font-bold mt-2">با اسکرول ماوس روی اعداد، ساعت و دقیقه را تنظیم کنید</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  const cleanStr = toEnglishDigits(customDepositAmount).replace(/,/g, '').replace(/[^0-9.]/g, '');
                  const amountVal = cleanStr === '' ? 0 : (parseFloat(cleanStr) || 0);
                  
                  if (amountVal > 0) {
                    const formattedTime = `${String(customDepositHour).padStart(2, '0')}:${String(customDepositMinute).padStart(2, '0')}`;
                    const newSlip = {
                      id: `custom-slip-${Date.now()}`,
                      amount: amountVal,
                      date: customDepositDate,
                      time: formattedTime,
                      imageName: `واریز بیعانه (${customDepositDate})`
                    };
                    setExtractedSlips(prev => [...prev, newSlip]);
                    setDeposit(prev => prev + amountVal);
                  }
                  
                  setShowCustomDepositModal(false);
                }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl cursor-pointer transition-all shadow-md shadow-indigo-500/20 text-center"
              >
                ثبت واریز بیعانه
              </button>
              <button
                type="button"
                onClick={() => setShowCustomDepositModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice History Pop-up Modal */}
      {showHistoryModal && selectedInvForHistory && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in text-right popup-overlay-global" id="dialog-invoice-history">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl shadow-2xl w-full max-w-5xl p-6 md:p-8 overflow-hidden flex flex-col max-h-[90vh] popup-box-global">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">
                  تاریخچه تغییرات فاکتور شماره {toPersianDigits(selectedInvForHistory.invoiceNumber)}
                </h3>
              </div>
              <button
                onClick={() => { setShowHistoryModal(false); setSelectedInvForHistory(null); setSelectedHistoryVersion(null); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - Split layout */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0 text-right">
              
              {/* Left Column (or full on mobile) - List of versions */}
              <div className="md:col-span-4 border-l border-slate-150 dark:border-slate-800 pl-4 space-y-4 overflow-y-auto pr-1">
                <h4 className="font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 text-right">لیست ویرایش‌ها</h4>
                
                {!selectedInvForHistory.history || selectedInvForHistory.history.length === 0 ? (
                  <div className="text-center py-8 px-4 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <Check className="w-8 h-8 text-emerald-500 mx-auto" />
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">نسخه اولیه فاکتور</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">این فاکتور تاکنون ویرایش نشده است.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {/* Primary/original state info as version 0 */}
                    <div 
                      onClick={() => setSelectedHistoryVersion({
                        id: 'original',
                        editTimestamp: 'نسخه اولیه',
                        editedBy: selectedInvForHistory.createdBy,
                        snapshot: {
                          invoiceNumber: selectedInvForHistory.invoiceNumber,
                          type: selectedInvForHistory.type,
                          date: selectedInvForHistory.date,
                          counterpartName: selectedInvForHistory.counterpartName,
                          counterpartPhone: selectedInvForHistory.counterpartPhone,
                          counterpartAddress: selectedInvForHistory.counterpartAddress,
                          items: selectedInvForHistory.items,
                          totalAmount: selectedInvForHistory.totalAmount,
                          tax: selectedInvForHistory.tax,
                          deposit: selectedInvForHistory.deposit,
                          discount: selectedInvForHistory.discount,
                          description: selectedInvForHistory.description,
                          isProforma: selectedInvForHistory.isProforma,
                          createdBy: selectedInvForHistory.createdBy,
                          attachments: selectedInvForHistory.attachments,
                          paymentAmount: selectedInvForHistory.paymentAmount,
                          paymentDate: selectedInvForHistory.paymentDate,
                        }
                      })}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all text-right ${
                        selectedHistoryVersion?.id === 'original'
                          ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-500 text-blue-900 dark:text-blue-300'
                          : 'bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-xs">نسخه اولیه فاکتور</span>
                        <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-bold">نسخه اصلی</span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 space-y-1">
                        <div>ثبت‌کننده: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedInvForHistory.createdBy}</span></div>
                        <div>تاریخ صدور: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{toPersianDigits(selectedInvForHistory.date)}</span></div>
                      </div>
                    </div>

                    {/* Historical versions */}
                    {selectedInvForHistory.history.map((version, index) => (
                      <div
                        key={version.id}
                        onClick={() => setSelectedHistoryVersion(version)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all text-right ${
                          selectedHistoryVersion?.id === version.id
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 text-indigo-900 dark:text-indigo-300'
                            : 'bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-xs">ویرایش شماره {toPersianDigits(index + 1)}</span>
                          <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded font-bold">ویرایش</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 space-y-1">
                          <div>ویرایش توسط: <span className="font-semibold text-slate-700 dark:text-slate-300">{version.editedBy}</span></div>
                          <div>زمان ویرایش: <span className="font-semibold text-slate-700 dark:text-slate-300">{toPersianDigits(version.editTimestamp)}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column (or lower on mobile) - Snapshot viewer */}
              <div className="md:col-span-8 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl text-right">
                {selectedHistoryVersion ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
                      <div>
                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                          {selectedHistoryVersion.id === 'original' ? 'نسخه اولیه ثبت شده' : `ویرایش ثبت شده توسط ${selectedHistoryVersion.editedBy}`}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {selectedHistoryVersion.id === 'original' ? 'اطلاعات اولیه فاکتور در زمان صدور.' : `زمان ویرایش: ${toPersianDigits(selectedHistoryVersion.editTimestamp)}`}
                        </p>
                      </div>
                      <span className="text-[11px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-lg font-bold">
                        وضعیت: فاکتور رسمی
                      </span>
                    </div>

                    {/* Snapshot Metadata Box */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-xl">
                      <div>
                        <span className="text-slate-400 block mb-1">طرف حساب تجاری:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{selectedHistoryVersion.snapshot.counterpartName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">کد فاکتور:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{toPersianDigits(selectedHistoryVersion.snapshot.invoiceNumber)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">تاریخ صدور:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{toPersianDigits(selectedHistoryVersion.snapshot.date)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">نوع سند:</span>
                        <span className="font-bold">
                          {selectedHistoryVersion.snapshot.type === 'sale' ? (
                            <span className="text-emerald-600 dark:text-emerald-400">فروش</span>
                          ) : (
                            <span className="text-indigo-600 dark:text-indigo-400">خرید</span>
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">نوع سند:</span>
                        <span className="font-bold">
                          {selectedHistoryVersion.snapshot.isProforma ? (
                            <span className="text-amber-600">پیش‌فاکتور</span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">فاکتور رسمی</span>
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">کاربر ثبت‌کننده:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{selectedHistoryVersion.snapshot.createdBy}</span>
                      </div>
                    </div>

                    {/* Item list in the snapshot */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                      <table className="w-full text-xs text-right">
                        <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                          <tr>
                            <th className="p-3 text-right">ردیف</th>
                            <th className="p-3 text-right">نام کالا و خدمات</th>
                            <th className="p-3 text-center">تعداد / واحد</th>
                            <th className="p-3 text-left">مبلغ واحد ({currencyLabel})</th>
                            <th className="p-3 text-left">جمع فاکتور ({currencyLabel})</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
                          {selectedHistoryVersion.snapshot.items.map((item: any, idx: number) => (
                            <tr key={idx}>
                              <td className="p-3 font-mono">{toPersianDigits(idx + 1)}</td>
                              <td className="p-3 font-semibold">{item.name}</td>
                              <td className="p-3 text-center font-bold font-mono">{toPersianDigits(item.qty)}</td>
                              <td className="p-3 text-left font-mono">{formatCurrency(item.unitPrice)}</td>
                              <td className="p-3 text-left font-bold font-mono text-slate-900 dark:text-slate-100">{formatCurrency(item.totalPrice)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Snapshot totals and payment details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-2 text-slate-600 dark:text-slate-400">
                        <div className="flex justify-between">
                          <span>جمع کل اقلام:</span>
                          <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{formatCurrency(selectedHistoryVersion.snapshot.totalAmount - (selectedHistoryVersion.snapshot.tax || 0) + (selectedHistoryVersion.snapshot.discount || 0))}</span>
                        </div>
                        {selectedHistoryVersion.snapshot.discount ? (
                          <div className="flex justify-between text-rose-600">
                            <span>تخفیف ویژه:</span>
                            <span className="font-mono font-bold">({formatCurrency(selectedHistoryVersion.snapshot.discount)})</span>
                          </div>
                        ) : null}
                        {selectedHistoryVersion.snapshot.tax ? (
                          <div className="flex justify-between text-blue-600">
                            <span>مالیات بر ارزش افزوده:</span>
                            <span className="font-mono font-bold">+{formatCurrency(selectedHistoryVersion.snapshot.tax)}</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                          <span>مبلغ کل ({currencyLabel}):</span>
                          <span className="font-mono">{formatCurrency(selectedHistoryVersion.snapshot.totalAmount)}</span>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-2 text-slate-600 dark:text-slate-400">
                        {selectedHistoryVersion.snapshot.deposit ? (
                          <div className="flex justify-between text-emerald-600 font-semibold">
                            <span>مبلغ بیعانه / پیش‌پرداخت:</span>
                            <span className="font-mono">{formatCurrency(selectedHistoryVersion.snapshot.deposit)}</span>
                          </div>
                        ) : null}
                        {selectedHistoryVersion.snapshot.paymentAmount ? (
                          <div className="flex justify-between text-emerald-600 font-semibold">
                            <span>مبلغ تسویه شده:</span>
                            <span className="font-mono">{formatCurrency(selectedHistoryVersion.snapshot.paymentAmount)}</span>
                          </div>
                        ) : null}
                        {selectedHistoryVersion.snapshot.paymentDate ? (
                          <div className="flex justify-between">
                            <span>تاریخ پرداخت:</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{toPersianDigits(selectedHistoryVersion.snapshot.paymentDate)}</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
                          <span>توضیحات فاکتور:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{selectedHistoryVersion.snapshot.description || 'بدون توضیحات'}</span>
                        </div>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-3">
                    <History className="w-12 h-12 text-slate-300 dark:text-slate-700 animate-pulse" />
                    <div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">یک نسخه را جهت مشاهده جزئیات انتخاب کنید</p>
                      <p className="text-xs leading-relaxed max-w-sm mt-1 mx-auto">با انتخاب هر نسخه از ستون راست، جزئیات کامل اقلام و مبالغ در آن زمان نمایش داده می‌شود.</p>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 border-t border-slate-150 dark:border-slate-800 pt-4 mt-4 shrink-0">
              <button
                type="button"
                onClick={() => { setShowHistoryModal(false); setSelectedInvForHistory(null); setSelectedHistoryVersion(null); }}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                بستن
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Duplicate Warning Modal */}
      {duplicateWarning && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-[9999] popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-6 text-right space-y-4 popup-box-global">
            {duplicateWarning.isBlocked ? (
              <>
                <div className="flex items-center gap-2 text-rose-600 font-extrabold">
                  <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" />
                  <h4 className="text-sm">خطا در اعتبارسنجی فاکتور</h4>
                </div>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-bold leading-relaxed bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-100 dark:border-rose-900/30">
                  امکان ثبت فاکتور وجود ندارد. شماره تماس وارد شده قبلاً در سیستم ثبت شده است.
                </p>
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-850 text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between items-center">
                    <span>طرف‌حساب:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{duplicateWarning.name}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>کاربر ثبت‌کننده:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{duplicateWarning.createdBy}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>تاریخ ثبت:</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-mono">{duplicateWarning.createdAt}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-md hover:shadow-lg"
                >
                  بستن و ویرایش اطلاعات
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-amber-600 font-bold">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <h4 className="text-sm">
                    {duplicateWarning.type === 'phone' ? 'هشدار: شماره تماس تکراری است' : 'هشدار: نام طرف‌حساب تکراری است'}
                  </h4>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {duplicateWarning.type === 'phone' ? (
                    <>
                      شماره تماس <strong className="text-slate-800 dark:text-white">«{duplicateWarning.phone}»</strong> قبلاً برای طرف‌حساب <strong className="text-slate-800 dark:text-white">«{duplicateWarning.name}»</strong> ثبت شده است.
                    </>
                  ) : (
                    <>
                      طرف‌حسابی با نام <strong className="text-slate-800 dark:text-white">«{duplicateWarning.name}»</strong> قبلاً در سیستم ثبت شده است.
                    </>
                  )}
                </p>
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-850 text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between items-center">
                    <span>ثبت شده توسط:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{duplicateWarning.createdBy}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>تاریخ ثبت:</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-mono">{duplicateWarning.createdAt}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  متوجه شدم
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Consolidated Validation Error Popup */}
      {validationErrors && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-[9999] animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-6 max-w-sm w-full text-center space-y-4 shadow-xl popup-box-global">
            <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center mx-auto text-rose-500">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100">خطا در اطلاعات فاکتور</h4>
            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold leading-relaxed">
              {validationErrors.communication && validationErrors.shipping
                ? 'لطفاً روش ارتباطی و روش ارسال را انتخاب نمایید.'
                : validationErrors.communication
                ? 'لطفاً روش ارتباطی را انتخاب نمایید.'
                : 'لطفاً روش ارسال را انتخاب نمایید.'}
            </p>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              جهت صدور فاکتور، تکمیل تمامی فیلدهای ستاره‌دار الزامی است.
            </p>
            <button
              type="button"
              onClick={() => setValidationErrors(null)}
              className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-sm"
            >
              بستن و تکمیل فیلدها
            </button>
          </div>
        </div>
      )}

      {/* Generated Image Modal (Fallback preview when clipboard permission is blocked or for easy manual copy) */}
      {generatedImageModalUrl && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-[9999] animate-fade-in popup-overlay-global" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="rounded-3xl shadow-2xl max-w-2xl w-full p-5 space-y-4 border border-slate-100 dark:border-slate-800 text-right popup-box-global">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center border border-emerald-200 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">تصویر فاکتور ایجاد شد و کپی گردید</h3>
                  <p className="text-[11px] text-slate-500">تصویر فاکتور در کلیپ‌بورد کپی شد و همچنین می‌توانید آن را ذخیره یا مشاهده کنید.</p>
                </div>
              </div>
              <button
                onClick={() => setGeneratedImageModalUrl(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 max-h-[55vh] overflow-auto flex justify-center shadow-inner">
              <img 
                src={generatedImageModalUrl} 
                alt="تصویر فاکتور" 
                className="max-w-full h-auto rounded-xl object-contain shadow-md"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setGeneratedImageModalUrl(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

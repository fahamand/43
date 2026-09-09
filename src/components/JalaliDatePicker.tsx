import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { toPersianDigits, getTodayJalali, isFutureJalaliDate, clampToTodayIfFuture } from '../utils/stateManager';

interface JalaliDatePickerProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  placement?: 'left' | 'right';
  allowFutureDates?: boolean;
}

const MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد',
  'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر',
  'دی', 'بهمن', 'اسفند'
];

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

// Helper to check if a Jalali year is leap
function isJalaliLeap(year: number): boolean {
  const r = year % 33;
  return r === 1 || r === 5 || r === 9 || r === 13 || r === 17 || r === 22 || r === 26 || r === 30;
}

function getJalaliMonthDays(year: number, month: number): number {
  if (month >= 1 && month <= 6) return 31;
  if (month >= 7 && month <= 11) return 30;
  if (month === 12) {
    return isJalaliLeap(year) ? 30 : 29;
  }
  return 30;
}

// Convert Jalali to Gregorian to get correct Day of Week
function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  let jy2 = jy - 979;
  let j_day_no = 365 * jy2 + Math.floor(jy2 / 33) * 8 + Math.floor(((jy2 % 33) + 3) / 4);
  const j_days_in_month = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  for (let i = 0; i < jm - 1; ++i) {
    j_day_no += j_days_in_month[i];
  }
  j_day_no += jd - 1;
  
  let g_day_no = j_day_no + 79;
  let gy = 1600 + 400 * Math.floor(g_day_no / 146097);
  g_day_no %= 146097;
  
  let leap = true;
  if (g_day_no >= 36525) {
    g_day_no--;
    gy += 100 * Math.floor(g_day_no / 36524);
    g_day_no %= 36524;
    if (g_day_no >= 365) {
      g_day_no++;
    } else {
      leap = false;
    }
  }
  
  gy += 4 * Math.floor(g_day_no / 1461);
  g_day_no %= 1461;
  
  if (g_day_no >= 366) {
    leap = false;
    g_day_no--;
    gy += Math.floor(g_day_no / 365);
    g_day_no %= 365;
  }
  
  let gd = g_day_no + 1;
  const g_days_in_month = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (let i = 0; i < 12; i++) {
    if (gd <= g_days_in_month[i]) {
      gm = i + 1;
      break;
    }
    gd -= g_days_in_month[i];
  }
  return new Date(gy, gm - 1, gd);
}

export const JalaliDatePicker: React.FC<JalaliDatePickerProps> = ({
  value,
  onChange,
  className = '',
  placeholder = '۱۴۰۵/۰۱/۰۱',
  disabled = false,
  placement = 'right',
  allowFutureDates = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine current Jalali today date dynamically
  const todayStr = getTodayJalali();
  const todayParts = todayStr.split('/');
  const todayYear = parseInt(todayParts[0], 10) || 1405;
  const todayMonth = parseInt(todayParts[1], 10) || 1;
  const todayDay = parseInt(todayParts[2], 10) || 1;

  // Current viewed month & year in datepicker popover
  const [viewYear, setViewYear] = useState<number>(todayYear);
  const [viewMonth, setViewMonth] = useState<number>(todayMonth); // 1-indexed

  // Ensure value is clamped if it's in the future and allowFutureDates is not set
  useEffect(() => {
    if (!allowFutureDates && value && isFutureJalaliDate(value)) {
      onChange(todayStr);
    }
  }, [value, todayStr, allowFutureDates]);

  // Sync viewed month/year when value changes or popover opens
  useEffect(() => {
    const valToParse = value || todayStr;
    const parts = valToParse.split('/');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(y) && !isNaN(m)) {
        if (allowFutureDates) {
          setViewYear(y);
          setViewMonth(m);
        } else {
          setViewYear(Math.min(y, todayYear));
          setViewMonth(y === todayYear ? Math.min(m, todayMonth) : m);
        }
      }
    }
  }, [value, isOpen, todayStr, todayYear, todayMonth, allowFutureDates]);

  // Handle click outside to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenPicker = () => {
    if (disabled) return;
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    
    // Auto-select today's date if value is missing or future (when allowFutureDates is false)
    if (nextOpen) {
      if (!value || value.trim() === '' || (!allowFutureDates && isFutureJalaliDate(value))) {
        onChange(todayStr);
      }
      const valToParse = value || todayStr;
      const parts = valToParse.split('/');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(y) && !isNaN(m)) {
          if (allowFutureDates) {
            setViewYear(y);
            setViewMonth(m);
          } else {
            setViewYear(Math.min(y, todayYear));
            setViewMonth(y === todayYear ? Math.min(m, todayMonth) : m);
          }
        }
      }
    }
  };

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const isNextMonthDisabled = !allowFutureDates && (viewYear > todayYear || (viewYear === todayYear && viewMonth >= todayMonth));

  const handleNextMonth = () => {
    if (isNextMonthDisabled) return;
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  const isNextYearDisabled = !allowFutureDates && (viewYear >= todayYear);

  const handleSelectDay = (day: number) => {
    const isFutureDay = !allowFutureDates && (
      viewYear > todayYear ||
      (viewYear === todayYear && viewMonth > todayMonth) ||
      (viewYear === todayYear && viewMonth === todayMonth && day > todayDay)
    );

    if (isFutureDay) return;

    const pad = (num: number) => String(num).padStart(2, '0');
    const selectedDate = `${viewYear}/${pad(viewMonth)}/${pad(day)}`;
    onChange(allowFutureDates ? selectedDate : clampToTodayIfFuture(selectedDate));
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value;
    if (!allowFutureDates && isFutureJalaliDate(inputVal)) {
      onChange(todayStr);
    } else {
      onChange(inputVal);
    }
  };

  const handleInputBlur = () => {
    if (!allowFutureDates && value && isFutureJalaliDate(value)) {
      onChange(todayStr);
    }
  };

  // Generate calendar days
  const totalDays = getJalaliMonthDays(viewYear, viewMonth);
  // Get weekday of 1st day of the month
  const firstDayGregorian = jalaliToGregorian(viewYear, viewMonth, 1);
  const gDay = firstDayGregorian.getDay(); // 0: Sunday, 1: Monday, ... 6: Saturday
  const startOffset = (gDay + 1) % 7; // Saturday becomes 0, Sunday 1, etc.

  const daysGrid: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) {
    daysGrid.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    daysGrid.push(d);
  }

  // Parse current value for highlighting
  let currentDaySelected: number | null = null;
  let currentMonthSelected: number | null = null;
  let currentYearSelected: number | null = null;
  if (value) {
    const parts = value.split('/');
    if (parts.length === 3) {
      currentYearSelected = parseInt(parts[0], 10);
      currentMonthSelected = parseInt(parts[1], 10);
      currentDaySelected = parseInt(parts[2], 10);
    }
  }

  return (
    <div className={`relative inline-block w-full ${className}`} ref={containerRef}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onClick={handleOpenPicker}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold font-mono text-center text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:bg-slate-100 dark:disabled:bg-slate-950/60 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:border-slate-200 dark:disabled:border-slate-800 disabled:cursor-not-allowed cursor-pointer"
        />
        <button
          type="button"
          onClick={handleOpenPicker}
          disabled={disabled}
          className="absolute left-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CalendarIcon className="w-4 h-4" />
        </button>
      </div>

      {isOpen && !disabled && (
        <div className={`absolute z-50 mt-1 ${placement === 'left' ? 'left-0' : 'right-0'} w-64 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-3 animate-fade-in dropdown-solid`}>
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-850">
            <button
              type="button"
              onClick={handleNextMonth}
              disabled={isNextMonthDisabled}
              title={isNextMonthDisabled ? 'ماه بعدی مربوط به آینده است' : 'ماه بعدی'}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-opacity"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex gap-1">
              <span>{MONTH_NAMES[viewMonth - 1]}</span>
              <span>{toPersianDigits(viewYear)}</span>
            </div>
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Buttons: Year & Today */}
          <div className="flex items-center justify-between gap-1 pt-2 pb-1.5 border-b border-slate-100 dark:border-slate-850/50">
            <button
              type="button"
              onClick={() => setViewYear(prev => prev - 1)}
              className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer font-bold"
            >
              سال قبل
            </button>
            <button
              type="button"
              onClick={() => {
                setViewYear(todayYear);
                setViewMonth(todayMonth);
                onChange(todayStr);
              }}
              className="text-[9px] px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 cursor-pointer font-black flex items-center gap-1 shadow-xs"
              title="انتخاب تاریخ امروز"
            >
              <span>امروز:</span>
              <span className="font-mono">{toPersianDigits(todayStr)}</span>
            </button>
            <button
              type="button"
              onClick={() => !isNextYearDisabled && setViewYear(prev => prev + 1)}
              disabled={isNextYearDisabled}
              title={isNextYearDisabled ? 'سال‌های آینده قابل انتخاب نیستند' : 'سال بعد'}
              className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer font-bold transition-opacity"
            >
              سال بعد
            </button>
          </div>

          {/* Weekdays names */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 py-1.5">
            {WEEKDAYS.map((w, idx) => (
              <div key={idx}>{w}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {daysGrid.map((day, idx) => {
              if (day === null) {
                return <div key={idx} className="h-7" />;
              }

              const isSelected =
                currentDaySelected === day &&
                currentMonthSelected === viewMonth &&
                currentYearSelected === viewYear;

              const isToday =
                todayDay === day &&
                todayMonth === viewMonth &&
                todayYear === viewYear;

              const isFutureDay = !allowFutureDates && (
                viewYear > todayYear ||
                (viewYear === todayYear && viewMonth > todayMonth) ||
                (viewYear === todayYear && viewMonth === todayMonth && day > todayDay)
              );

              let btnStyle = 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900';

              if (isFutureDay) {
                btnStyle = 'text-slate-300 dark:text-slate-700 opacity-30 cursor-not-allowed bg-slate-50/50 dark:bg-slate-900/30';
              } else if (isSelected && isToday) {
                btnStyle = 'bg-indigo-600 text-white font-black ring-2 ring-emerald-500 border-2 border-emerald-400 shadow-md';
              } else if (isSelected) {
                btnStyle = 'bg-indigo-600 text-white font-extrabold shadow-sm';
              } else if (isToday) {
                btnStyle = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-black border-2 border-emerald-500 ring-2 ring-emerald-400/40 shadow-xs';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isFutureDay}
                  onClick={() => handleSelectDay(day)}
                  title={isFutureDay ? 'امکان انتخاب تاریخ‌های آینده وجود ندارد' : isToday ? 'تاریخ امروز' : undefined}
                  className={`h-7 w-7 text-[10px] font-mono rounded-lg transition-all flex items-center justify-center cursor-pointer relative ${btnStyle}`}
                >
                  {toPersianDigits(day)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

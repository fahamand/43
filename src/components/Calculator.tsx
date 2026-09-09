import React, { useState, useEffect, useRef } from 'react';
import { Calculator, X, History, Trash2, Delete, ArrowLeftRight, Check, Copy } from 'lucide-react';
import { toPersianDigits } from '../services/currencyService';

interface CalculationHistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: string;
}

// Simple expression evaluation engine with support for basic arithmetic operations (+, -, *, /, %) and parenthesis.
// Handles precedence and floating numbers safely.
export function safeEval(expr: string): number {
  // Sanitize input: replace custom operator symbols, remove spaces and non-math characters
  const sanitized = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '')
    .replace(/\s+/g, '');
  
  if (!sanitized) return 0;

  let index = 0;

  function parseNumber(): number {
    let start = index;
    // Support negative numbers
    if (sanitized[index] === '-') {
      index++;
    }
    while (index < sanitized.length && /[0-9.]/.test(sanitized[index])) {
      index++;
    }
    const numStr = sanitized.slice(start, index);
    const val = parseFloat(numStr);
    return isNaN(val) ? 0 : val;
  }

  function parseFactor(): number {
    if (index >= sanitized.length) return 0;
    if (sanitized[index] === '(') {
      index++; // consume '('
      const val = parseExpression();
      if (sanitized[index] === ')') {
        index++; // consume ')'
      }
      return val;
    }
    return parseNumber();
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (index < sanitized.length) {
      const op = sanitized[index];
      if (op === '*' || op === '/' || op === '%') {
        index++;
        const right = parseFactor();
        if (op === '*') {
          left *= right;
        } else if (op === '/') {
          left = right !== 0 ? left / right : 0;
        } else {
          left = left % right;
        }
      } else {
        break;
      }
    }
    return left;
  }

  function parseExpression(): number {
    let left = parseTerm();
    while (index < sanitized.length) {
      const op = sanitized[index];
      if (op === '+' || op === '-') {
        index++;
        const right = parseTerm();
        if (op === '+') {
          left += right;
        } else {
          left -= right;
        }
      } else {
        break;
      }
    }
    return left;
  }

  try {
    const result = parseExpression();
    return isFinite(result) ? result : 0;
  } catch (err) {
    console.error('Calculation error:', err);
    return 0;
  }
}

// Format number with thousand separator
function formatNumberWithCommas(numStr: string): string {
  if (!numStr) return '';
  const parts = numStr.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
}

export function CalculatorModal({ isOpen, onClose, currentUser }: CalculatorModalProps) {
  const [expression, setExpression] = useState('');
  const [displayValue, setDisplayValue] = useState('0');
  const [isNewCalculation, setIsNewCalculation] = useState(true);
  const [history, setHistory] = useState<CalculationHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'calc' | 'history'>('calc');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Custom states for new requested features
  const [isCopiedCurrent, setIsCopiedCurrent] = useState<boolean>(false);
  const [m1, setM1] = useState<string | null>(() => localStorage.getItem('fahamacc_calc_m1') || null);
  const [m2, setM2] = useState<string | null>(() => localStorage.getItem('fahamacc_calc_m2') || null);

  const userId = currentUser?.id || 'anonymous';
  const historyStorageKey = `fahamacc_calculator_history_${userId}`;

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem(historyStorageKey);
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse calculator history', e);
      }
    }
  }, [userId]);

  // Handle outside click & escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle Keyboard buttons for calculation
  useEffect(() => {
    if (!isOpen || activeTab !== 'calc') return;

    const handleKeyPress = (e: KeyboardEvent) => {
      const key = e.key;

      if (/[0-9]/.test(key)) {
        handleDigit(key);
      } else if (key === '.') {
        handleDecimal();
      } else if (['+', '-', '*', '/'].includes(key)) {
        const opMap: Record<string, string> = { '*': '×', '/': '÷' };
        handleOperator(opMap[key] || key);
      } else if (key === '%') {
        handlePercentage();
      } else if (key === '(' || key === ')') {
        handleOperator(key);
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        handleEvaluate();
      } else if (key === 'Backspace') {
        handleBackspace();
      } else if (key === 'Escape' || key.toLowerCase() === 'c') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, activeTab, expression, displayValue, isNewCalculation, history]);

  if (!isOpen) return null;

  const saveHistory = (newHistory: CalculationHistoryItem[]) => {
    setHistory(newHistory);
    localStorage.setItem(historyStorageKey, JSON.stringify(newHistory));
  };

  // Click digit
  const handleDigit = (digit: string) => {
    if (isNewCalculation) {
      setDisplayValue(digit);
      setIsNewCalculation(false);
    } else {
      setDisplayValue(prev => (prev === '0' ? digit : prev + digit));
    }
  };

  // Click decimal point
  const handleDecimal = () => {
    if (isNewCalculation) {
      setDisplayValue('0.');
      setIsNewCalculation(false);
      return;
    }
    if (!displayValue.includes('.')) {
      setDisplayValue(prev => prev + '.');
    }
  };

  // Click Operator
  const handleOperator = (op: string) => {
    setIsNewCalculation(false);
    if (op === '(' || op === ')') {
      setExpression(prev => prev + ' ' + op + ' ');
      return;
    }

    // If expression is empty and we have a display value, start expression with the display value
    if (!expression) {
      setExpression(displayValue + ' ' + op + ' ');
      setIsNewCalculation(true);
    } else {
      // Append display value and then the operator
      setExpression(prev => prev + displayValue + ' ' + op + ' ');
      setIsNewCalculation(true);
    }
  };

  // Handle Clear
  const handleClear = () => {
    setExpression('');
    setDisplayValue('0');
    setIsNewCalculation(true);
  };

  // Handle Backspace
  const handleBackspace = () => {
    if (isNewCalculation) return;
    if (displayValue.length <= 1) {
      setDisplayValue('0');
      setIsNewCalculation(true);
    } else {
      setDisplayValue(prev => prev.slice(0, -1));
    }
  };

  // Handle percentage (divided by 100)
  const handlePercentage = () => {
    const num = parseFloat(displayValue);
    if (!isNaN(num)) {
      setDisplayValue(String(parseFloat((num / 100).toFixed(10))));
      setIsNewCalculation(true);
    }
  };

  // Handle triple zero (000)
  const handleTripleZero = () => {
    if (isNewCalculation) {
      setDisplayValue('0');
      setIsNewCalculation(false);
    } else {
      setDisplayValue(prev => (prev === '0' ? '0' : prev + '000'));
    }
  };

  // Memory management handlers
  const handleSaveM1 = () => {
    setM1(displayValue);
    localStorage.setItem('fahamacc_calc_m1', displayValue);
  };

  const handleSaveM2 = () => {
    setM2(displayValue);
    localStorage.setItem('fahamacc_calc_m2', displayValue);
  };

  const handleAddMemory = (memVal: string) => {
    const current = parseFloat(displayValue) || 0;
    const mem = parseFloat(memVal) || 0;
    setDisplayValue(String(parseFloat((current + mem).toFixed(10))));
    setIsNewCalculation(true);
  };

  const handleSubtractMemory = (memVal: string) => {
    const current = parseFloat(displayValue) || 0;
    const mem = parseFloat(memVal) || 0;
    setDisplayValue(String(parseFloat((current - mem).toFixed(10))));
    setIsNewCalculation(true);
  };

  const handleCopyCurrentValue = () => {
    navigator.clipboard.writeText(displayValue);
    setIsCopiedCurrent(true);
    setTimeout(() => setIsCopiedCurrent(false), 2000);
  };

  // Handle Calculation Evaluation
  const handleEvaluate = () => {
    const fullExpr = expression + displayValue;
    if (!fullExpr.trim() || fullExpr === '0') return;

    const resultNum = safeEval(fullExpr);
    // Format result up to 6 decimal places to prevent float issues
    const resultStr = String(parseFloat(resultNum.toFixed(6)));

    setDisplayValue(resultStr);
    setExpression('');
    setIsNewCalculation(true);

    // Save to history list
    const newItem: CalculationHistoryItem = {
      id: `calc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      expression: fullExpr,
      result: resultStr,
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('fa-IR')
    };

    const updatedHistory = [newItem, ...history].slice(0, 100);
    saveHistory(updatedHistory);
  };

  // Clear all history list
  const handleClearHistory = () => {
    const confirmClear = window.confirm('آیا مطمئن هستید که می‌خواهید کل تاریخچه محاسبات را پاک کنید؟');
    if (confirmClear) {
      saveHistory([]);
    }
  };

  // Click on history item to paste it back
  const handleUseHistoryItem = (item: CalculationHistoryItem) => {
    setDisplayValue(item.result);
    setIsNewCalculation(true);
    setActiveTab('calc');
  };

  // Copy history value
  const handleCopyHistory = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print animate-fade-in popup-overlay-global">
      <div 
        className="w-full max-w-sm rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden text-right font-sans popup-box-global"
        id="calculator-popup"
      >
        {/* Title Bar */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-850 flex items-center justify-between">
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="بستن ماشین حساب"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-500" />
            <span className="font-black text-xs text-slate-800 dark:text-slate-100">ماشین حساب حسابداری</span>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-950 p-1 border-b border-slate-200 dark:border-slate-850">
          <button
            onClick={() => setActiveTab('calc')}
            className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'calc'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>ماشین حساب</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>تاریخچه محاسبات ({toPersianDigits(history.length)})</span>
          </button>
        </div>

        {activeTab === 'calc' ? (
          /* Calculator Interface */
          <div className="p-4 flex flex-col flex-1 bg-slate-50 dark:bg-slate-900">
            {/* Display Screen */}
            <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-2xl p-4 mb-3 text-right flex flex-col justify-end min-h-[100px] shadow-inner select-text relative">
              {/* Copy Action button on the display screen */}
              <button
                type="button"
                onClick={handleCopyCurrentValue}
                className="absolute top-2 left-2 p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors border border-slate-150 dark:border-slate-800 cursor-pointer flex items-center justify-center"
                title="کپی رقم فعلی"
              >
                {isCopiedCurrent ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {/* Formula expression */}
              <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 font-mono tracking-wide break-all h-5 overflow-y-auto mb-1 scrollbar-thin pl-8">
                {toPersianDigits(expression)}
              </div>
              {/* Large Current Input */}
              <div className="text-xl font-black text-slate-800 dark:text-slate-100 font-mono tracking-tight break-all pl-8">
                {toPersianDigits(formatNumberWithCommas(displayValue))}
              </div>
            </div>

            {/* Memory Sections M1 & M2 */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {/* Memory 1 */}
              <div className="flex items-center justify-between p-1.5 rounded-xl bg-indigo-50/40 dark:bg-slate-950/40 border border-indigo-100/30 dark:border-slate-850">
                <span className="text-[10px] font-black text-slate-400 mr-1 shrink-0">M1</span>
                {m1 ? (
                  <div className="flex items-center gap-1 overflow-hidden w-full justify-end">
                    <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[45px] select-all" title={m1}>
                      {toPersianDigits(formatNumberWithCommas(m1))}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddMemory(m1)}
                      className="w-4.5 h-4.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 flex items-center justify-center font-bold text-xs cursor-pointer border border-emerald-100/30"
                      title="افزودن به مقدار فعلی"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSubtractMemory(m1)}
                      className="w-4.5 h-4.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 flex items-center justify-center font-bold text-xs cursor-pointer border border-rose-100/30"
                      title="کاهش از مقدار فعلی"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveM1}
                      className="px-1 py-0.5 rounded text-[8px] bg-indigo-100/50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 transition-colors cursor-pointer font-bold shrink-0"
                      title="جایگزینی با مقدار فعلی"
                    >
                      ذخیره
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveM1}
                    className="w-full py-0.5 rounded-lg text-[9px] font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-100/30 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer text-center"
                  >
                    ذخیره مبلغ
                  </button>
                )}
              </div>

              {/* Memory 2 */}
              <div className="flex items-center justify-between p-1.5 rounded-xl bg-indigo-50/40 dark:bg-slate-950/40 border border-indigo-100/30 dark:border-slate-850">
                <span className="text-[10px] font-black text-slate-400 mr-1 shrink-0">M2</span>
                {m2 ? (
                  <div className="flex items-center gap-1 overflow-hidden w-full justify-end">
                    <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[45px] select-all" title={m2}>
                      {toPersianDigits(formatNumberWithCommas(m2))}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddMemory(m2)}
                      className="w-4.5 h-4.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 flex items-center justify-center font-bold text-xs cursor-pointer border border-emerald-100/30"
                      title="افزودن به مقدار فعلی"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSubtractMemory(m2)}
                      className="w-4.5 h-4.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 flex items-center justify-center font-bold text-xs cursor-pointer border border-rose-100/30"
                      title="کاهش از مقدار فعلی"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveM2}
                      className="px-1 py-0.5 rounded text-[8px] bg-indigo-100/50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 transition-colors cursor-pointer font-bold shrink-0"
                      title="جایگزینی با مقدار فعلی"
                    >
                      ذخیره
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveM2}
                    className="w-full py-0.5 rounded-lg text-[9px] font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-100/30 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer text-center"
                  >
                    ذخیره مبلغ
                  </button>
                )}
              </div>
            </div>

            {/* Keypad Layout */}
            <div className="grid grid-cols-4 gap-1.5">
              {/* Row 1 */}
              <button
                type="button"
                onClick={handleClear}
                className="p-3 text-xs font-black rounded-xl text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 hover:bg-rose-100/60 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
              >
                C
              </button>
              <button
                type="button"
                onClick={() => handleOperator('(')}
                className="p-3 text-xs font-bold rounded-xl text-slate-600 dark:text-slate-300 bg-slate-200/55 dark:bg-slate-800/60 border border-slate-300/30 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700/60 cursor-pointer transition-colors font-mono"
              >
                (
              </button>
              <button
                type="button"
                onClick={() => handleOperator(')')}
                className="p-3 text-xs font-bold rounded-xl text-slate-600 dark:text-slate-300 bg-slate-200/55 dark:bg-slate-800/60 border border-slate-300/30 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700/60 cursor-pointer transition-colors font-mono"
              >
                )
              </button>
              <button
                type="button"
                onClick={handlePercentage}
                className="p-3 text-xs font-bold rounded-xl text-slate-600 dark:text-slate-300 bg-slate-200/55 dark:bg-slate-800/60 border border-slate-300/30 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700/60 cursor-pointer transition-colors font-mono"
              >
                %
              </button>

              {/* Row 2 */}
              <button
                type="button"
                onClick={() => handleDigit('7')}
                className="p-3 text-sm font-extrabold rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
              >
                7
              </button>
              <button
                type="button"
                onClick={() => handleDigit('8')}
                className="p-3 text-sm font-extrabold rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
              >
                8
              </button>
              <button
                type="button"
                onClick={() => handleDigit('9')}
                className="p-3 text-sm font-extrabold rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
              >
                9
              </button>
              <button
                type="button"
                onClick={() => handleOperator('÷')}
                className="p-3 text-xs font-black rounded-xl text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100/40 dark:border-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 cursor-pointer transition-all font-mono"
              >
                ÷
              </button>

              {/* Row 3 */}
              <button
                type="button"
                onClick={() => handleDigit('4')}
                className="p-3 text-sm font-extrabold rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
              >
                4
              </button>
              <button
                type="button"
                onClick={() => handleDigit('5')}
                className="p-3 text-sm font-extrabold rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
              >
                5
              </button>
              <button
                type="button"
                onClick={() => handleDigit('6')}
                className="p-3 text-sm font-extrabold rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
              >
                6
              </button>
              <button
                type="button"
                onClick={() => handleOperator('×')}
                className="p-3 text-xs font-black rounded-xl text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100/40 dark:border-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 cursor-pointer transition-all font-mono"
              >
                ×
              </button>

              {/* Row 4 */}
              <button
                type="button"
                onClick={() => handleDigit('1')}
                className="p-3 text-sm font-extrabold rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
              >
                1
              </button>
              <button
                type="button"
                onClick={() => handleDigit('2')}
                className="p-3 text-sm font-extrabold rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
              >
                2
              </button>
              <button
                type="button"
                onClick={() => handleDigit('3')}
                className="p-3 text-sm font-extrabold rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
              >
                3
              </button>
              <button
                type="button"
                onClick={() => handleOperator('-')}
                className="p-3 text-xs font-black rounded-xl text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100/40 dark:border-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 cursor-pointer transition-all font-mono"
              >
                -
              </button>

              {/* Row 5 */}
              <button
                type="button"
                onClick={() => handleDigit('0')}
                className="p-3 text-sm font-extrabold rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleTripleZero}
                className="p-3 text-xs font-black rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
                title="ورود سه صفر"
              >
                000
              </button>
              <button
                type="button"
                onClick={handleDecimal}
                className="p-3 text-sm font-extrabold rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors font-mono"
              >
                .
              </button>
              <button
                type="button"
                onClick={() => handleOperator('+')}
                className="p-3 text-xs font-black rounded-xl text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100/40 dark:border-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 cursor-pointer transition-all font-mono"
              >
                +
              </button>

              {/* Row 6 */}
              <button
                type="button"
                onClick={handleBackspace}
                className="col-span-2 p-3 text-xs font-bold rounded-xl text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 hover:bg-amber-100/60 dark:hover:bg-amber-950/40 cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                title="پاک کردن کاراکتر آخر"
              >
                <Delete className="w-4 h-4 scale-x-[-1]" />
                <span>حذف کاراکتر</span>
              </button>
              <button
                type="button"
                onClick={handleEvaluate}
                className="col-span-2 p-3 text-sm font-black rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/10 cursor-pointer transition-all font-mono"
              >
                =
              </button>
            </div>

            {/* Keyboard Help Guideline */}
            <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center mt-3 leading-relaxed font-semibold">
              شما می‌توانید از دکمه‌های ماشین حساب صفحه کلید خود نیز جهت محاسبات سریع استفاده فرمایید.
            </p>
          </div>
        ) : (
          /* Calculator History Panel */
          <div className="p-4 flex flex-col flex-1 bg-slate-50 dark:bg-slate-900 min-h-[300px] max-h-[370px]">
            <div className="flex items-center justify-between mb-3">
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="px-2.5 py-1 text-[10px] font-bold rounded-lg text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100/60 dark:hover:bg-rose-950/40 transition-colors flex items-center gap-1 cursor-pointer border border-rose-100 dark:border-rose-900/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>پاک کردن کل تاریخچه</span>
                </button>
              )}
              <span className="text-[10px] text-slate-400 font-bold">نمایش محاسبات اخیر (حداکثر ۱۰۰ مورد)</span>
            </div>

            {history.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500">
                <History className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2 stroke-[1.5]" />
                <p className="text-[11px] font-bold">تاریخچه محاسباتی وجود ندارد</p>
                <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">محاسبات انجام شده به صورت محلی در مرورگر شما نگهداری خواهند شد.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 select-text scrollbar-thin">
                {history.map(item => (
                  <div 
                    key={item.id}
                    className="p-2.5 bg-white dark:bg-slate-950 rounded-xl border border-slate-150 dark:border-slate-850 hover:bg-slate-100/50 dark:hover:bg-slate-850/40 transition-all flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Copy & Paste operations */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleCopyHistory(item.result, item.id)}
                          className="p-1 rounded bg-slate-50 dark:bg-slate-900 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer border border-slate-100 dark:border-slate-800"
                          title="کپی نتیجه محاسبه"
                        >
                          {copiedId === item.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => handleUseHistoryItem(item)}
                          className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-[8px] font-black hover:bg-indigo-100 transition-colors cursor-pointer border border-indigo-100/30"
                          title="استفاده از نتیجه در ماشین حساب"
                        >
                          درج در ماشین حساب
                        </button>
                      </div>

                      <span className="text-[8px] text-slate-400 dark:text-slate-500 font-mono font-bold shrink-0">{item.timestamp}</span>
                    </div>

                    <div className="text-right font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400 break-all leading-relaxed">
                      {toPersianDigits(item.expression)}
                    </div>
                    <div className="text-right font-mono text-xs font-black text-slate-800 dark:text-slate-100 break-all flex items-center justify-end gap-1">
                      <span className="text-[10px] text-indigo-500 font-bold">=</span>
                      <span>{toPersianDigits(formatNumberWithCommas(item.result))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface FloatingCalculatorButtonProps {
  onOpen: () => void;
  isVisible: boolean;
  onCloseFloating: () => void;
}

export function FloatingCalculatorButton({ onOpen, isVisible, onCloseFloating }: FloatingCalculatorButtonProps) {
  const [position, setPosition] = useState({ x: 20, y: window.innerHeight - 150 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const elementStart = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);

  // Position setup and sync with localStorage
  useEffect(() => {
    if (!isVisible) return;
    const savedPos = localStorage.getItem('fahamacc_floating_calc_position');
    if (savedPos) {
      try {
        const parsed = JSON.parse(savedPos);
        // Ensure coordinates are within reasonable viewport boundaries
        const x = Math.max(10, Math.min(window.innerWidth - 70, parsed.x));
        const y = Math.max(10, Math.min(window.innerHeight - 70, parsed.y));
        setPosition({ x, y });
      } catch (e) {
        console.error('Failed to parse floating calculator position', e);
      }
    } else {
      // Default: bottom-left relative
      setPosition({ x: 20, y: window.innerHeight - 150 });
    }
  }, [isVisible]);

  // Handle window resizing to keep the floating button in viewport
  useEffect(() => {
    if (!isVisible) return;
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.max(10, Math.min(window.innerWidth - 70, prev.x)),
        y: Math.max(10, Math.min(window.innerHeight - 70, prev.y))
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isVisible]);

  if (!isVisible) return null;

  // Custom Mouse Drag & Drop Implementation
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.action-btn')) return; // ignore clicks on close action
    setIsDragging(true);
    hasDragged.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    elementStart.current = { x: position.x, y: position.y };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragStart.current.x;
      const deltaY = moveEvent.clientY - dragStart.current.y;
      
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        hasDragged.current = true;
      }

      const newX = Math.max(10, Math.min(window.innerWidth - 70, elementStart.current.x + deltaX));
      const newY = Math.max(10, Math.min(window.innerHeight - 70, elementStart.current.y + deltaY));
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      localStorage.setItem('fahamacc_floating_calc_position', JSON.stringify({ x: position.x, y: position.y }));
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Custom Touch Drag & Drop Implementation for mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.action-btn')) return; // ignore clicks on close action
    setIsDragging(true);
    hasDragged.current = false;
    const touch = e.touches[0];
    dragStart.current = { x: touch.clientX, y: touch.clientY };
    elementStart.current = { x: position.x, y: position.y };

    const handleTouchMove = (moveEvent: TouchEvent) => {
      const touchMove = moveEvent.touches[0];
      const deltaX = touchMove.clientX - dragStart.current.x;
      const deltaY = touchMove.clientY - dragStart.current.y;
      
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        hasDragged.current = true;
      }

      const newX = Math.max(10, Math.min(window.innerWidth - 70, elementStart.current.x + deltaX));
      const newY = Math.max(10, Math.min(window.innerHeight - 70, elementStart.current.y + deltaY));
      
      setPosition({ x: newX, y: newY });
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      localStorage.setItem('fahamacc_floating_calc_position', JSON.stringify({ x: position.x, y: position.y }));
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    if (!hasDragged.current) {
      onOpen();
    }
  };

  return (
    <div 
      className="fixed z-40 select-none no-print"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: 'none'
      }}
    >
      <div className="relative group">
        {/* Floating circular calculator button */}
        <button
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onClick={handleButtonClick}
          className={`w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/30 cursor-grab active:cursor-grabbing transition-transform hover:scale-105 ${
            isDragging ? 'scale-105 shadow-xl ring-2 ring-indigo-400' : ''
          }`}
          title="ماشین حساب شناور (برای جابجایی بکشید)"
          type="button"
          id="btn-floating-calculator"
        >
          <Calculator className="w-6 h-6 text-white" />
        </button>

        {/* Small Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCloseFloating();
          }}
          className="action-btn absolute -top-1 -right-1 w-5 h-5 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center shadow border border-white dark:border-slate-900 cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          title="پنهان کردن آیکون شناور"
          type="button"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

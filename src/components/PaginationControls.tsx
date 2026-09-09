import React from 'react';
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from 'lucide-react';
import { toPersianDigits } from '../utils/stateManager';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 15, 20, 30, 50, 70, 100]
}) => {
  if (totalItems === 0) return null;

  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

  const startItem = (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  return (
    <div 
      className="flex flex-wrap items-center justify-between gap-3 pt-3 pb-2 px-3 bg-slate-50/80 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 rounded-b-2xl dir-rtl text-xs text-slate-600 dark:text-slate-400 select-none"
      dir="rtl"
    >
      {/* Right Side: Page Size Selector & Total count */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-[11px] text-slate-500 dark:text-slate-400">تعداد در هر صفحه:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold font-mono text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {toPersianDigits(opt)} مورد
              </option>
            ))}
          </select>
        </div>

        <div className="hidden sm:inline-block text-[11px] font-medium text-slate-500 dark:text-slate-400">
          نمایش <span className="font-bold font-mono text-slate-700 dark:text-slate-200">{toPersianDigits(startItem)}</span> تا <span className="font-bold font-mono text-slate-700 dark:text-slate-200">{toPersianDigits(endItem)}</span> از کل <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">{toPersianDigits(totalItems)}</span> رکورد
        </div>
      </div>

      {/* Left Side: Navigation Buttons */}
      <div className="flex items-center gap-1 font-mono">
        {/* First Page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safeCurrentPage === 1}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="صفحه اول"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage === 1}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="صفحه قبلی"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Current Page Display */}
        <span className="px-3 py-1 font-extrabold text-xs bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          صفحه {toPersianDigits(safeCurrentPage)} از {toPersianDigits(safeTotalPages)}
        </span>

        {/* Next Page */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= safeTotalPages}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="صفحه بعدی"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => onPageChange(safeTotalPages)}
          disabled={safeCurrentPage >= safeTotalPages}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="صفحه آخر"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

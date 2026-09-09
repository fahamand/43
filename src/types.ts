export type UserRole = 'admin' | 'accountant' | 'seller';

export interface User {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  password?: string;
  phone?: string;
  permissions: string[]; // List of tab IDs this user is authorized to access
}

export interface FiscalYear {
  id: string;
  year: string; // e.g. "1403"
  startDate: string; // e.g. "1403/01/01"
  endDate: string; // e.g. "1403/12/29"
  registered: boolean; // Definition finalized
  createdBy: string;
  setupDate: string;
  isClosed?: boolean; // Whether the entire fiscal year is officially closed
  closedAt?: string; // Jalali timestamp of closing
  closedBy?: string; // User who closed the fiscal year
  lockedDate?: string; // All transactions/docs up to this date are strictly locked for editing
}

export interface Counterpart {
  id: string;
  name: string;
  phone: string;
  address: string;
  type: 'buyer' | 'seller' | 'both';
  createdBy?: string; // Creator's name
  createdById?: string; // Creator's id
  createdAt?: string; // Date of registration
  acquaintanceMethod?: string;
  communicationChannel?: string;
  customIcons?: string[];
  shippingMethod?: string;
}

export interface LoanBorrower {
  id: string;
  name: string;
  phone?: string;
  nationalId?: string;
  initialDebt?: number; // بدهی اولیه وام
  notes?: string;
  createdAt?: string;
  createdBy?: string;
  createdById?: string;
}

export interface WarehouseItem {
  id: string;
  name: string;
  type: 'kala' | 'khadamat' | 'consumables';
  color?: string; // Appicable to 'kala'
  qty: number; // Current physical quantity
  initialQty: number; // Initial Excel / Manual Quantity
  lastPurchasePrice?: number;
  lastSalePrice?: number;
  setupDate?: string;
  minQtyAlarm?: number; // Minimum quantity to trigger warning/alarm
  categoryName?: string; // نام دسته‌بندی نهایی
  parentCategory?: string; // دسته‌بندی مادر
  subCategory?: string; // دسته‌بندی فرعی
  unit?: string; // واحد شمارش
  commissionPercent?: number; // درصد پورسانت اختصاصی کالا/دسته‌بندی
}

export interface CommissionTag {
  id: string;
  name: string; // عنوان تگ مانند "پورسانت ویژه کالا"
  type: 'percent' | 'fixed'; // درصدی یا مبلغ ثابت
  value: number; // مقدار عددی (مثلا 5 برای 5 درصد یا 50000 تومان/ریال)
  description?: string;
  createdAt?: string;
  createdBy?: string;
}

export interface CommissionSettlement {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  sellerName: string;
  paidAmount: number; // مبلغ تسویه‌شده یا بیعانه پورسانت
  status: 'unpaid' | 'partial' | 'paid'; // وضعیت پرداخت
  notes?: string;
  settledAt: string;
  settledBy: string;
}

export interface InvoiceItem {
  itemId: string;
  name: string;
  type: 'kala' | 'khadamat' | 'consumables';
  color?: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  unit?: string;
  remarks?: string;
  cogsUnitCost?: number; // Frozen Cost of Goods Sold per unit at the time of sale
  cogsTotal?: number; // Frozen total COGS (qty * cogsUnitCost)
}

export interface PaymentAllocation {
  id: string;
  paymentId: string; // ID of BankTransaction or Payment record
  invoiceId: string;
  invoiceNumber: string;
  counterpartId?: string;
  counterpartName?: string;
  allocatedAmount: number; // Allocated amount in Toman/Rial
  allocationDate: string; // Jalali date e.g. "1403/04/12"
  paymentMethod?: 'bank_transfer' | 'pos' | 'cash' | 'check' | 'credit';
  accountId?: string; // Bank account or cash fund ID
  status: 'valid' | 'reversed';
  reversalReason?: string;
  reversalDate?: string;
  reversalDocId?: string;
  docId?: string; // Connected GL journal entry document ID
  notes?: string;
  createdAt: string;
  createdBy: string;
  createdById?: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  movementType: 'inflow_purchase' | 'outflow_sale' | 'return_sale' | 'return_purchase' | 'adjustment_loss' | 'adjustment_gain' | 'transfer' | 'initial';
  qtyChange: number; // positive for addition, negative for deduction
  unitCost: number; // Valuation cost at the time of movement (e.g. weighted average or purchase price)
  totalCost: number;
  remainingQtyAfter: number;
  date: string; // Jalali date
  time?: string;
  referenceId?: string; // invoiceId, txId, docId, or adjustmentId
  referenceNumber?: string;
  invoiceId?: string;
  description?: string;
  reason?: string;
  docId?: string; // Linked accounting doc ID
  createdBy: string;
  createdById?: string;
  createdAt: string;
}

export interface AccountingAuditLog {
  id: string;
  timestamp: string; // Persian date & time
  timestampMs: number;
  actorId: string;
  actorName: string;
  actorRole?: string;
  ipAddress?: string;
  action: string;
  entityType: 'document' | 'invoice' | 'payment' | 'allocation' | 'inventory' | 'fiscal_year';
  entityId: string;
  entityRefNumber?: string;
  reason?: string;
  idempotencyKey?: string;
  details?: any;
}

export interface InvoiceHistoryEntry {
  id: string; // unique ID
  snapshot: {
    invoiceNumber: string;
    type: 'purchase' | 'sale';
    date: string;
    counterpartName: string;
    counterpartPhone?: string;
    counterpartAddress?: string;
    items: InvoiceItem[];
    totalAmount: number;
    tax?: number;
    deposit?: number;
    discount?: number;
    description: string;
    isProforma: boolean;
    isUrgent?: boolean;
    urgentType?: 'urgent' | 'emergency';
    createdBy: string;
    attachments?: string[];
    paymentAmount?: number;
    paymentDate?: string;
    paymentSlips?: Array<{ id: string; amount: number; date: string; time?: string; imageName?: string }>;
    customIcons?: string[];
    cogsTotal?: number;
  };
  editedBy: string; // Name of user who edited
  editedById: string; // ID of user who edited
  editTimestamp: string; // Jalali or standard formatted timestamp
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: 'purchase' | 'sale';
  date: string; // e.g. 1403/04/12
  counterpartId: string;
  counterpartName: string;
  counterpartPhone?: string;
  counterpartAddress?: string;
  items: InvoiceItem[];
  totalAmount: number;
  tax?: number;
  deposit?: number; // Legacy field for backwards compatibility
  discount?: number;
  description: string;
  isProforma: boolean; // Applicable to sellers
  isUrgent?: boolean; // فوری و اورژانسی
  urgentType?: 'urgent' | 'emergency'; // نوع سفارش فوری یا اورژانسی
  createdBy: string; // Username of creator
  createdById: string;
  createdByPhone?: string;
  attachments?: string[];
  paymentAmount?: number;
  paymentDate?: string;
  paymentSlips?: Array<{ id: string; amount: number; date: string; time?: string; imageName?: string }>;
  history?: InvoiceHistoryEntry[];
  customIcons?: string[];
  shippingMethod?: string;
  acquaintanceMethod?: string;
  isDeleted?: boolean;
  deletedBy?: string;
  deletedById?: string;
  deletedAt?: string;

  // Accounting and Inventory connections
  docId?: string; // Linked Sales/Purchase GL Document ID
  cogsDocId?: string; // Linked COGS journal entry document ID
  cogsTotal?: number; // Total Cost of Goods Sold for this invoice
  isReturn?: boolean; // Indicates if this invoice is a sales/purchase return
  returnRefInvoiceId?: string; // ID of original invoice being returned
  allocations?: PaymentAllocation[]; // Associated payment allocations
  updatedAt?: number | string;
  createdAt?: number | string;
}

export interface JournalEntryLine {
  id: string;
  accountId: string; // references Account (e.g. Bank / Cost etc)
  accountName: string;
  debit: number; // بدهکار (for expenses, deposit inc)
  credit: number; // بستانکار (for revenue, withdrawal inc)
  description: string;
}

export interface AccountingDocument {
  id: string;
  docNumber: number;
  date: string;
  description: string;
  lines: JournalEntryLine[];
  isArchived: boolean;
  isManual: boolean;
  status: 'draft' | 'posted';
  isDeleted?: boolean;
  deletedBy?: string;
  deletedById?: string;
  deletedAt?: string;
  invoiceId?: string;
  txId?: string;
  refDocId?: string; // Reference to original doc (for reversals/amendments)
  idempotencyKey?: string; // Unique idempotency key to prevent double postings
  actorId?: string;
  actorName?: string;
  operationType?: 'sale' | 'purchase' | 'customer_receipt' | 'supplier_payment' | 'expense' | 'partner_draw' | 'fund_transfer' | 'loan_payout' | 'loan_repayment' | 'sales_return' | 'purchase_return' | 'inventory_adjustment' | 'manual';
}

export interface BankTransactionHistory {
  id: string;
  action?: 'create' | 'edit' | 'delete' | 'restore';
  amount: number;
  date: string;
  time: string;
  description: string;
  categoryParent?: string;
  categoryChild?: string;
  accountId?: string;
  counterpartId?: string;
  counterpartName?: string;
  editedBy: string;
  editedById: string;
  editedAt: string;
  changes?: Array<{
    field: string;
    label: string;
    oldValue: any;
    newValue: any;
  }>;
  reason?: string;
}

export interface BankTransaction {
  id: string;
  date: string; // YYYY/MM/DD or standard format
  time: string; // HH:mm
  amount: number;
  type: 'deposit' | 'withdrawal'; // واریز / برداشت
  description: string; // Original bank description
  isRegistered: boolean; // Has it been mapped to account categories?
  categoryParent?: string; // e.g. هزینه‌های دفتر
  categoryChild?: string; // e.g. اجاره دفتر
  userDescription?: string; // Additional user description
  isDuplicate?: boolean; // True if it matches previous transactions
  duplicateReason?: string; // Reason or matching vector for duplicate detection
  trackingNumber?: string; // شماره پیگیری
  referenceCode?: string; // شماره ارجاع / فیش
  registeredDate?: string;
  accountId?: string;
  partnerId?: string;
  pendingDepositId?: string;
  borrowerId?: string;
  borrowerName?: string;
  loanType?: 'payout' | 'repayment';
  counterpartId?: string;
  counterpartName?: string;
  
  // Custom Edit & Soft Delete Tracking Fields
  createdBy?: string;
  createdById?: string;
  isEdited?: boolean;
  editedBy?: string;
  editedById?: string;
  editedAt?: string;
  editHistory?: BankTransactionHistory[];
  
  isDeleted?: boolean;
  deletedBy?: string;
  deletedById?: string;
  deletedAt?: string;

  // Connected records
  invoiceId?: string;
  docId?: string;
  attachments?: string[];
}

export interface BankAccount {
  id: string;
  name: string; // e.g. بانک ملی، صندوق شرکت
  accountNumber?: string;
  balance: number;
  type?: 'bank' | 'treasury' | 'petty_cash_bank'; // Separation of Bank accounts vs treasuries vs Petty Cash Bank Accounts
}

export interface Partner {
  id: string;
  name: string;
  sharePercent?: number; // e.g. 25
  setupDate?: string; // e.g. "1403/01/01"
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  title: string;
  timestamp: string;
  messages: ChatMessage[];
}

export interface ChecklistItem {
  id: string;
  task: string;
  isCompleted: boolean;
  createdAt: string;
  createdBy: string;
  isPublic?: boolean; // True if it's general/shared, false or undefined if personal
  completedAt?: number; // Timestamp in ms when the task was marked completed
}

export interface TransactionCategory {
  id: string;
  name: string; // Parent name
  subcategories: string[]; // Child names
}

export interface SystemNotification {
  id: string;
  userId: string; // Target user id
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
  isRead: boolean;
  senderId?: string;
  senderName?: string;
}

export interface PendingDeposit {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  counterpartId: string;
  counterpartName: string;
  amount: number;
  date: string;
  status: 'pending' | 'cleared';
  type: 'purchase' | 'sale';
  clearedTxId?: string;
  clearedDate?: string;
  isDeleted?: boolean;
  deletedBy?: string;
  deletedById?: string;
  deletedAt?: string;
}

export interface BankSmsMessage {
  id: string;
  hash?: string;
  sender: string;
  bankName?: string;
  body: string;
  receivedAt: string;
  amount?: number;
  type?: 'deposit' | 'withdrawal';
  accountNumber?: string;
  refCode?: string;
  balance?: number;
  status: 'pending' | 'reviewed' | 'converted' | 'ignored';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  convertedTxId?: string;
}

export interface UserCustomMessengerIcon {
  id: string;
  userId: string;
  name: string;
  dataUrl: string;
  createdAt: string;
}

export interface WebMessenger {
  id: string;
  title: string;
  url: string;
  icon: string;
  customIconUrl?: string; // Custom uploaded image Base64 or URL
  allowedUserIds: string[]; // Empty array means visible/accessible to all users
  windowWidth: number;
  windowHeight: number;
  createdBy?: string;
  createdById?: string;
  createdAt?: string;
  category?: string;
  description?: string;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug';
export type LogCategory = 
  | 'auth' 
  | 'database' 
  | 'invoice' 
  | 'accounting' 
  | 'transaction' 
  | 'warehouse' 
  | 'counterpart' 
  | 'report' 
  | 'backup' 
  | 'system' 
  | 'ai' 
  | 'security' 
  | 'api' 
  | 'user_action';

export interface SystemLog {
  id: string;
  timestamp: string; // Persian date & time, e.g. "1405/04/03 14:20:15"
  timestampMs: number; // Unix timestamp in ms for filtering & auto-purge
  level: LogLevel;
  category: LogCategory;
  message: string;
  action?: 'create' | 'update' | 'delete' | 'view' | 'report' | 'save' | 'login' | 'logout' | 'sync' | 'backup' | 'restore' | 'error' | 'other';
  storageLocation?: 'mysql' | 'file' | 'database' | 'localhost' | 'memory' | 'client_cache';
  targetType?: string; // e.g. 'فاکتور فروش', 'سند حسابداری', 'کالا', 'طرف حساب', 'گزارش سود و زیان'
  targetId?: string; // e.g. 'inv-1002'
  targetNumber?: string; // e.g. '1002'
  amount?: number; // Total amount involved in document or transaction
  details?: any; // Additional payload, stack trace, affected IDs or params
  userId?: string;
  userName?: string;
  userRole?: string;
  ipAddress?: string;
}

declare global {
  interface Window {
    _messengerWindows?: Record<string, Window | null>;
  }
}

export interface WarehouseCategoryItem {
  parent: string;
  sub: string;
  final: string;
  type?: 'kala' | 'khadamat' | 'consumables';
  note?: string;
  commissionPercent?: number;
}

export interface StockAdjustmentLog {
  id: string;
  itemId: string;
  itemName: string;
  prevQty: number;
  newQty: number;
  change: number;
  reason: string;
  date: string;
  operator: string;
}

export type { AppState } from './utils/stateManager';




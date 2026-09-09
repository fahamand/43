import { Invoice, PaymentAllocation, BankTransaction, PendingDeposit } from '../types';
import { saveGenericKeyToDb } from '../utils/stateManager';

export interface InvoiceBalanceResult {
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  overpaidAmount: number;
  status: 'settled' | 'partial' | 'unpaid' | 'overpaid';
  allocations: PaymentAllocation[];
}

/**
 * Allocates a bulk or single payment across outstanding invoices of a counterpart (FIFO / date order).
 */
export function allocatePaymentToInvoices(
  invoices: Invoice[],
  counterpartId: string,
  type: 'sale' | 'purchase',
  paymentAmount: number,
  date: string,
  method: string = 'bank_transfer',
  reference?: string,
  pendingDeposits?: PendingDeposit[],
  targetSelectedInvoiceIds?: string[],
  selectedPendingDepositId?: string
): {
  updatedInvoices: Invoice[];
  allocations: Array<{
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    date: string;
    method: string;
    reference?: string;
  }>;
} {
  let remainingPayment = Number(paymentAmount) || 0;
  const allocations: Array<{
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    date: string;
    method: string;
    reference?: string;
  }> = [];

  const normNum = (s: any) => String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString()).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).trim().toLowerCase();

  // Filter matching invoices of this counterpart and type, sorted chronologically (oldest first)
  let targetInvoices = (invoices || [])
    .filter(inv => (!counterpartId || inv.counterpartId === counterpartId) && inv.type === type)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (targetSelectedInvoiceIds && targetSelectedInvoiceIds.length > 0) {
    const selectedSet = new Set(targetSelectedInvoiceIds);
    const selected = targetInvoices.filter(inv => selectedSet.has(inv.id));
    const unselected = targetInvoices.filter(inv => !selectedSet.has(inv.id));
    targetInvoices = [...selected, ...unselected];
  } else if (selectedPendingDepositId && pendingDeposits) {
    const pd = pendingDeposits.find(p => p.id === selectedPendingDepositId);
    if (pd) {
      const pdInv = targetInvoices.find(inv => inv.id === pd.invoiceId || normNum(inv.invoiceNumber) === normNum(pd.invoiceNumber));
      if (pdInv) {
        targetInvoices = [pdInv, ...targetInvoices.filter(inv => inv.id !== pdInv.id)];
      }
    }
  }

  const updatedMap = new Map<string, Invoice>();

  for (const inv of targetInvoices) {
    if (remainingPayment <= 0) break;

    const total = Number(inv.totalAmount) || 0;
    const currentDeposit = Number(inv.deposit) || 0;

    // Check for matching pending deposits (both open and cleared)
    const matchingPds = (pendingDeposits || []).filter(pd => 
      !pd.isDeleted && 
      (pd.invoiceId === inv.id || normNum(pd.invoiceNumber) === normNum(inv.invoiceNumber))
    );
    const openPds = matchingPds.filter(pd => pd.status === 'pending');
    const clearedPds = matchingPds.filter(pd => pd.status === 'cleared');
    const openPdSum = openPds.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const clearedPdSum = clearedPds.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // Sanitize in case previous double-counting bug inflated the deposit
    const cleanDeposit = (clearedPdSum > 0 && currentDeposit === clearedPdSum * 2 && (inv.paymentSlips || []).length <= 1)
      ? clearedPdSum
      : currentDeposit;

    const remainingInvoiceDue = Math.max(0, total - cleanDeposit);

    if (remainingInvoiceDue > 0 || openPdSum > 0) {
      const maxAllocatable = remainingInvoiceDue > 0 ? remainingInvoiceDue : openPdSum;
      const allocated = Math.min(remainingPayment, maxAllocatable);
      remainingPayment -= allocated;

      // In standard accounting, payment towards a pending deposit clears the deposit already declared on the invoice
      // rather than adding an extra deposit on top.
      const coveredPending = Math.min(allocated, openPdSum);
      const additionalPayment = Math.max(0, allocated - coveredPending);
      const newDeposit = Math.max(cleanDeposit, coveredPending) + additionalPayment;

      allocations.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: allocated,
        date,
        method,
        reference
      });

      updatedMap.set(inv.id, {
        ...inv,
        deposit: newDeposit
      });
    }
  }

  // If there's still overpayment, apply to the newest invoice
  if (remainingPayment > 0 && targetInvoices.length > 0) {
    const newest = targetInvoices[targetInvoices.length - 1];
    const existing = updatedMap.get(newest.id) || newest;
    const newDeposit = (existing.deposit || 0) + remainingPayment;
    allocations.push({
      invoiceId: newest.id,
      invoiceNumber: newest.invoiceNumber,
      amount: remainingPayment,
      date,
      method,
      reference
    });
    updatedMap.set(newest.id, {
      ...existing,
      deposit: newDeposit
    });
  }

  const updatedInvoices = (invoices || []).map(inv => updatedMap.get(inv.id) || inv);

  return { updatedInvoices, allocations };
}

/**
 * Calculates the exact settlement balance and payment history for an invoice.
 * Supports multi-payment-per-invoice and seamless legacy fallback.
 */
export function calculateInvoiceBalances(
  invoice: Invoice,
  allAllocations: PaymentAllocation[] = [],
  _transactions: BankTransaction[] = []
): InvoiceBalanceResult {
  const totalAmount = Math.round(Number(invoice.totalAmount) || 0);
  const invoiceId = invoice.id;
  const invoiceNum = invoice.invoiceNumber;
  const depositAmount = Math.round(Number(invoice.deposit) || 0);

  // Filter valid allocations matching this invoice
  const matchingAllocations = (allAllocations || []).filter(
    (a) => a && (a.invoiceId === invoiceId || String(a.invoiceNumber).trim().toLowerCase() === String(invoiceNum).trim().toLowerCase()) && a.status === 'valid'
  );

  const allocationSum = matchingAllocations.reduce((sum, a) => sum + (Number(a.allocatedAmount) || 0), 0);
  const roundedAllocationSum = Math.round(allocationSum);

  // Prevent double-counting of deposit and bank allocations for the same payment
  // by taking the maximum of deposit and recorded allocations
  const paidAmount = Math.max(depositAmount, roundedAllocationSum);

  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const overpaidAmount = Math.max(0, paidAmount - totalAmount);

  let status: 'settled' | 'partial' | 'unpaid' | 'overpaid' = 'unpaid';
  if (paidAmount >= totalAmount && totalAmount > 0) {
    status = paidAmount > totalAmount ? 'overpaid' : 'settled';
  } else if (paidAmount > 0) {
    status = 'partial';
  }

  return {
    totalAmount,
    paidAmount,
    remainingAmount,
    overpaidAmount,
    status,
    allocations: matchingAllocations
  };
}

/**
 * Posts payment allocations atomically to server and local state.
 */
export async function postPaymentAllocations(
  allocations: PaymentAllocation[] | PaymentAllocation | any,
  actor?: { id: string; name: string; role?: string },
  existingStateAllocations: PaymentAllocation[] = [],
  idempotencyKey?: string
): Promise<{ success: boolean; allocations: PaymentAllocation[]; error?: string }> {
  const safeActor = actor || { id: 'system', name: 'سیستم' };
  let allocList: PaymentAllocation[] = [];
  if (Array.isArray(allocations)) {
    allocList = allocations;
  } else if (allocations && Array.isArray(allocations.allocations)) {
    allocList = allocations.allocations.map((a: any) => ({
      ...a,
      invoiceId: a.invoiceId || allocations.invoiceId,
      status: a.status || 'valid'
    }));
  } else if (allocations) {
    allocList = [allocations];
  }

  if (allocList.length === 0) {
    return { success: true, allocations: [] };
  }

  try {
    const res = await fetch('/api/accounting/post-allocation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocations: allocList, actor: safeActor, idempotencyKey })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success') {
        return { success: true, allocations: data.allocations || allocList };
      }
    }
  } catch (err) {
    console.warn('Server allocation posting fallback to direct state save:', err);
  }

  // Client-side state fallback
  const merged = [...existingStateAllocations];
  for (const a of allocList) {
    const isDup = merged.some(ea => ea.id === a.id || (ea.paymentId === a.paymentId && ea.invoiceId === a.invoiceId && ea.status === 'valid'));
    if (!isDup) {
      merged.unshift({
        ...a,
        id: a.id || `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        status: 'valid',
        createdAt: a.createdAt || new Date().toISOString(),
        createdBy: safeActor.name || 'سیستم',
        createdById: safeActor.id || 'system'
      });
    }
  }

  await saveGenericKeyToDb('paymentAllocations', merged);
  return { success: true, allocations: merged };
}

/**
 * Reverses a payment allocation with reason and audit log.
 */
export async function reversePaymentAllocation(
  allocationId: string,
  reason: string,
  actor: { id: string; name: string; role?: string },
  existingStateAllocations: PaymentAllocation[] = []
): Promise<{ success: boolean; allocation?: PaymentAllocation; error?: string }> {
  try {
    const res = await fetch('/api/accounting/reverse-allocation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocationId, reason, actor })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success') {
        return { success: true, allocation: data.allocation };
      }
    }
  } catch (err) {
    console.warn('Server allocation reversal fallback:', err);
  }

  // Fallback
  const updated = existingStateAllocations.map(a => {
    if (a.id === allocationId) {
      return {
        ...a,
        status: 'reversed' as const,
        reversalReason: reason,
        reversalDate: new Date().toISOString().slice(0, 10),
        reversedBy: actor.name || 'کاربر'
      };
    }
    return a;
  });

  await saveGenericKeyToDb('paymentAllocations', updated);
  const target = updated.find(a => a.id === allocationId);
  return { success: true, allocation: target };
}

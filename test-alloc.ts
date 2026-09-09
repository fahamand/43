import { allocatePaymentToInvoices } from './src/services/paymentAllocationService';

const invoices: any[] = [
  {
    id: 'inv-1',
    invoiceNumber: '1001',
    type: 'sale',
    date: '1402/01/01',
    totalAmount: 100000,
    deposit: 30000,
    counterpartId: 'cp-1'
  }
];

const pendingDeposits: any[] = [
  {
    id: 'pd-1',
    invoiceId: 'inv-1',
    invoiceNumber: '1001',
    amount: 30000,
    status: 'pending',
    type: 'sale',
    isDeleted: false
  }
];

const result = allocatePaymentToInvoices(
  invoices,
  'cp-1',
  'sale',
  30000,
  '1402/01/02',
  'bank_transfer',
  'tx-1',
  pendingDeposits
);

console.log(JSON.stringify(result, null, 2));

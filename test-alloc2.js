function allocatePaymentToInvoices(invoices, counterpartId, type, paymentAmount, date, method, reference, pendingDeposits) {
  let remainingPayment = Number(paymentAmount) || 0;
  const allocations = [];
  const targetInvoices = (invoices || [])
    .filter(inv => (!counterpartId || inv.counterpartId === counterpartId) && inv.type === type)
    .sort((a, b) => a.date.localeCompare(b.date));

  const updatedMap = new Map();

  for (const inv of targetInvoices) {
    if (remainingPayment <= 0) break;

    const total = Number(inv.totalAmount) || 0;
    const currentDeposit = Number(inv.deposit) || 0;
    const remainingInvoiceDue = Math.max(0, total - currentDeposit);

    const openPds = (pendingDeposits || []).filter(pd => 
      pd.status === 'pending' && 
      !pd.isDeleted && 
      (pd.invoiceId === inv.id || String(pd.invoiceNumber) === String(inv.invoiceNumber))
    );
    const openPdSum = openPds.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    if (remainingInvoiceDue > 0 || openPdSum > 0) {
      const maxAllocatable = remainingInvoiceDue > 0 ? remainingInvoiceDue : openPdSum;
      const allocated = Math.min(remainingPayment, maxAllocatable);
      remainingPayment -= allocated;

      const coveredPending = Math.min(allocated, openPdSum);
      const additionalPayment = Math.max(0, allocated - coveredPending);
      const newDeposit = currentDeposit + additionalPayment;

      allocations.push({ invoiceId: inv.id, amount: allocated });
      updatedMap.set(inv.id, { ...inv, deposit: newDeposit });
    }
  }
  return { updatedInvoices: invoices.map(inv => updatedMap.get(inv.id) || inv), allocations };
}

const res = allocatePaymentToInvoices(
  [{ id: 'inv-1', invoiceNumber: '1001', type: 'sale', date: '1', totalAmount: 100000, deposit: 30000, counterpartId: 'cp-1' }],
  'cp-1', 'sale', 30000, '1', 'method', 'ref',
  [{ id: 'pd-1', invoiceId: 'inv-1', invoiceNumber: '1001', amount: 30000, status: 'pending', type: 'sale', isDeleted: false }]
);
console.log(JSON.stringify(res, null, 2));

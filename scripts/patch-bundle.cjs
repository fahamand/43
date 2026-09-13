const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const targets = [
  path.join(__dirname, '../public/assets/index-CkX4BMne.js'),
  path.join(__dirname, '../blueprint/assets/index-CkX4BMne.js'),
  path.join(__dirname, '../dist/assets/index-CkX4BMne.js')
];

for (const filePath of targets) {
  if (!fs.existsSync(filePath)) {
    console.log('Skipping non-existent path:', filePath);
    continue;
  }

  console.log('Patching:', filePath);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Inject getClnDep helper into TransactionsManual (v0e)
  const v0eAnchor = "function v0e({accounts:e,categories:a,onUpdateCategories:s,currentUser:r,fiscalYear:l,onAddTransaction:i,onAddTransfer:m,invoices:p=[],onUpdateInvoices:d,transactions:f=[],onUpdateTransactions:A,onUpdateAccounts:b,partners:N=[],pendingDeposits:g=[],onUpdatePendingDeposits:y,items:w=[],onUpdateItems:C,loanBorrowers:V=[],onUpdateLoanBorrowers:M,docs:S=[],onUpdateDocs:R}){";
  const v0eReplacement = "function v0e({accounts:e,categories:a,onUpdateCategories:s,currentUser:r,fiscalYear:l,onAddTransaction:i,onAddTransfer:m,invoices:p=[],onUpdateInvoices:d,transactions:f=[],onUpdateTransactions:A,onUpdateAccounts:b,partners:N=[],pendingDeposits:g=[],onUpdatePendingDeposits:y,items:w=[],onUpdateItems:C,loanBorrowers:V=[],onUpdateLoanBorrowers:M,docs:S=[],onUpdateDocs:R}){const getClnDep=(inv)=>{const dep=Number(inv.deposit)||0;if(dep<=0||!g)return dep;const m=g.filter(pd=>!pd.isDeleted&&(pd.invoiceId===inv.id||String(pd.invoiceNumber)===String(inv.invoiceNumber)));if(!m.length)return dep;const clr=m.filter(pd=>pd.status===\"cleared\").reduce((s,pd)=>s+(Number(pd.amount)||0),0),tot=m.reduce((s,pd)=>s+(Number(pd.amount)||0),0);const ref=clr>0?clr:tot;if(ref>0&&dep===ref*2&&(!inv.paymentSlips||inv.paymentSlips.length<=1))return ref;return dep;};";
  if (!content.includes("getClnDep") && content.includes(v0eAnchor)) {
    content = content.replace(v0eAnchor, v0eReplacement);
    console.log('  [1/7] Injected getClnDep into v0e');
  } else {
    console.log('  [1/7] (already patched or anchor not found)');
  }

  // 2. Fix manual transaction submission deposit calculation (prevent double-adding pending deposit to invoice deposit)
  const submitTarget = "Kl=(Jr.deposit||0)+Ns.amount,Ti=(Jr.description||\"\")+`\\n[وصول خودکار بیعانه معلق به مبلغ ${Te(Ns.amount)} در تاریخ ${X}.]`;return{...Jr,totalAmount:dn,deposit:Kl,remainingAmount:Math.max(0,dn-Kl-(Jr.paidAmount||0)),description:Ti}}";
  const submitReplacement = "clnDep=((Jr.deposit||0)===Ns.amount*2&&(!Jr.paymentSlips||Jr.paymentSlips.length<=1))?Ns.amount:(Jr.deposit||0),covPd=Math.min(oe,Ns.amount),addPay=Math.max(0,oe-covPd),Kl=Math.max(clnDep,Ns.amount)+addPay,Ti=(Jr.description||\"\")+`\\n[وصول خودکار بیعانه معلق به مبلغ ${Te(Ns.amount)} در تاریخ ${X}.]`;return{...Jr,totalAmount:dn,deposit:Kl,remainingAmount:Math.max(0,dn-Kl-(Jr.paidAmount||0)),description:Ti}}";
  if (content.includes(submitTarget)) {
    content = content.replace(submitTarget, submitReplacement);
    console.log('  [2/7] Fixed manual submission deposit calculation');
  } else {
    console.log('  [2/7] (already patched or anchor not found)');
  }

  // 3. Fix BankStatementManager semi-auto settlement matching deposit calculation
  const bsmMatchTarget = "ba)ga=ga.map(ea=>ea.id===ba.id?{...ea,status:\"cleared\",clearedTxId:q.id,clearedDate:q.date}:ea),Ya=!0,ra=Hr+os;else{";
  const bsmMatchReplacement = "ba){ga=ga.map(ea=>ea.id===ba.id?{...ea,status:\"cleared\",clearedTxId:q.id,clearedDate:q.date}:ea),Ya=!0;const cov=Math.min(os,ba.amount),ext=Math.max(0,os-cov),cln=(Hr===ba.amount*2&&(!oa.paymentSlips||oa.paymentSlips.length<=1))?ba.amount:Hr;ra=Math.max(cln,ba.amount)+ext;}else{";
  if (content.includes(bsmMatchTarget)) {
    content = content.replace(bsmMatchTarget, bsmMatchReplacement);
    console.log('  [3/7] Fixed BankStatementManager settlement deposit calculation');
  } else {
    console.log('  [3/7] (already patched or anchor not found)');
  }

  // 4. Fix BankStatementManager getInvoiceDepositAndRemaining
  const bsmDepTarget = "Tt=Je.filter(na=>na.status===\"cleared\").reduce((na,ga)=>na+ga.amount,0),Wt=Math.max(pe.deposit||0,Tt),Yt=Wt+$e,ua=Math.max(0,pe.totalAmount-(pe.deposit||0));return{deposit:Yt,remaining:ua,pendingAmount:$e,clearedDeposit:Wt}}";
  const bsmDepReplacement = "Tt=Je.filter(na=>na.status===\"cleared\").reduce((na,ga)=>na+ga.amount,0);const bDep=Number(pe.deposit)||0,totPd=Tt+$e,cDep=(totPd>0&&bDep===totPd*2&&(!pe.paymentSlips||pe.paymentSlips.length<=1))?totPd:bDep;const Wt=Math.max(cDep,Tt),Yt=Math.max(cDep,totPd),ua=Math.max(0,pe.totalAmount-Yt);return{deposit:Yt,remaining:ua,pendingAmount:$e,clearedDeposit:Wt}}";
  if (content.includes(bsmDepTarget)) {
    content = content.replace(bsmDepTarget, bsmDepReplacement);
    console.log('  [4/7] Fixed BankStatementManager getInvoiceDepositAndRemaining');
  } else {
    console.log('  [4/7] (already patched or anchor not found)');
  }

  // 5. Sales table deposit calculation and display
  const saleRowTarget = "we=Math.max(0,Ae-(E.deposit||0)),je=r.role===\"admin\"||r.role===\"accountant\";";
  const saleRowReplacement = "actDep=getClnDep(E),we=Math.max(0,Ae-actDep),je=r.role===\"admin\"||r.role===\"accountant\";";
  if (content.includes(saleRowTarget)) {
    content = content.replace(saleRowTarget, saleRowReplacement);
    console.log('  [5/7] Fixed Sales table deposit calculation');
  }

  // 6. Purchase table deposit calculation and display
  const purchRowTarget = "we=Math.max(0,Ae-(E.deposit||0)),je=r.role===\"admin\"||r.role===\"accountant\";";
  const purchRowReplacement = "actDep=getClnDep(E),we=Math.max(0,Ae-actDep),je=r.role===\"admin\"||r.role===\"accountant\";";
  if (content.includes(purchRowTarget)) {
    content = content.replace(purchRowTarget, purchRowReplacement);
    console.log('  [6/7] Fixed Purchase table deposit calculation');
  }

  // 7. Deposit cell displays for sales & purchases
  content = content.replace(
    "children:E.deposit?Te(E.deposit):\"۰\"},void 0,!1,{fileName:\"/app/applet/src/components/TransactionsManual.tsx\",lineNumber:3141",
    "children:actDep?Te(actDep):\"۰\"},void 0,!1,{fileName:\"/app/applet/src/components/TransactionsManual.tsx\",lineNumber:3141"
  );
  content = content.replace(
    "children:E.deposit?Te(E.deposit):\"۰\"},void 0,!1,{fileName:\"/app/applet/src/components/TransactionsManual.tsx\",lineNumber:3237",
    "children:actDep?Te(actDep):\"۰\"},void 0,!1,{fileName:\"/app/applet/src/components/TransactionsManual.tsx\",lineNumber:3237"
  );
  console.log('  [7/7] Replaced table cells');

  // 8. Prevent double stock deduction/addition in Ise inventory movement function
  const iseOldLogic = 'const f=Number(e.qtyChange)||0,A=(Number(d.qty)||0)+f;d.qty=A,e.unitCost&&Number(e.unitCost)>0&&(e.movementType==="inflow_purchase"||e.type==="purchase_in")&&(d.lastPurchasePrice=Number(e.unitCost));const b={id:e.id||`mov-${Date.now()}-${Math.random().toString(36).substring(2,7)}`,itemId:d.id,itemName:d.name||e.itemName||"",movementType:e.movementType||(f<0?"outflow_sale":"inflow_purchase"),qtyChange:f,unitCost:Number(e.unitCost)||d.lastPurchasePrice||0,totalCost:(Number(e.unitCost)||d.lastPurchasePrice||0)*Math.abs(f),remainingQtyAfter:A,referenceId:e.referenceId,invoiceId:e.invoiceId,date:e.date||new Date().toISOString().slice(0,10),createdBy:l.name||"سیستم",createdById:l.id||"system",createdAt:new Date().toISOString(),description:e.description},N=[b,...r];return await Ma("items",i),await Ma("inventoryMovements",N),{success:!0,item:d,movement:b}}';
  const iseNewLogic = 'const isInv=!!(e.fromInvoice||e.referenceId||e.invoiceId);const f=Number(e.qtyChange)||0,A=isInv?(e.remainingQtyAfter!==void 0?Number(e.remainingQtyAfter):Number(d.qty)||0):((Number(d.qty)||0)+f);d.qty=A,e.unitCost&&Number(e.unitCost)>0&&(e.movementType==="inflow_purchase"||e.type==="purchase_in")&&(d.lastPurchasePrice=Number(e.unitCost));const b={id:e.id||`mov-${Date.now()}-${Math.random().toString(36).substring(2,7)}`,itemId:d.id,itemName:d.name||e.itemName||"",movementType:e.movementType||(f<0?"outflow_sale":"inflow_purchase"),qtyChange:f,unitCost:Number(e.unitCost)||d.lastPurchasePrice||0,totalCost:(Number(e.unitCost)||d.lastPurchasePrice||0)*Math.abs(f),remainingQtyAfter:A,referenceId:e.referenceId,invoiceId:e.invoiceId,date:e.date||new Date().toISOString().slice(0,10),createdBy:l.name||"سیستم",createdById:l.id||"system",createdAt:new Date().toISOString(),description:e.description},N=[b,...r];if(!isInv){await Ma("items",i)}await Ma("inventoryMovements",N);return{success:!0,item:d,movement:b}}';
  if (content.includes(iseOldLogic)) {
    content = content.replace(iseOldLogic, iseNewLogic);
    console.log('  [8/9] Fixed Ise to prevent double stock modification for invoices');
  } else {
    console.log('  [8/9] (Ise already patched or target not found)');
  }

  // 9. Fix invoice item movement call in Mn to pass fromInvoice: true and remainingQtyAfter
  const mnOldCall = 'Array.isArray(_.items)&&_.items.forEach(U=>{U&&U.type!=="khadamat"&&(U.itemId||U.name)&&Ise({itemId:U.itemId||`item-${Date.now()}`,itemName:U.name,itemType:U.type,date:_.date,type:_.type==="sale"?"sale_out":"purchase_in",qtyChange:_.type==="sale"?-U.qty:U.qty,unitCost:U.unitPrice,totalCost:U.totalPrice,referenceId:_.id,description:`فاکتور ${_.type==="sale"?"فروش":"خرید"} شماره ${_.invoiceNumber}`},void 0,It).catch(()=>{})})}}';
  const mnNewCall = 'Array.isArray(_.items)&&_.items.forEach(U=>{if(U&&U.type!=="khadamat"&&(U.itemId||U.name)){const curItm=(It||[]).find(it=>it&&(it.id===U.itemId||it.name===U.name));const afterQty=curItm?Number(curItm.qty)||0:0;Ise({itemId:U.itemId||`item-${Date.now()}`,itemName:U.name,itemType:U.type,date:_.date,type:_.type==="sale"?"sale_out":"purchase_in",qtyChange:_.type==="sale"?-U.qty:U.qty,unitCost:U.unitPrice,totalCost:U.totalPrice,referenceId:_.id,fromInvoice:!0,remainingQtyAfter:afterQty,description:`فاکتور ${_.type==="sale"?"فروش":"خرید"} شماره ${_.invoiceNumber}`},void 0,It).catch(()=>{})}})}}';
  if (content.includes(mnOldCall)) {
    content = content.replace(mnOldCall, mnNewCall);
    console.log('  [9/9] Enhanced Mn to mark movements as fromInvoice with remainingQtyAfter');
  } else {
    console.log('  [9/9] (Mn already patched or target not found)');
  }

  // 10. Add "بیعانه معلق" column header to Invoice archive thead
  const headTarget = 't.jsxDEV("th",{className:"px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-left whitespace-nowrap",children:["مبلغ کل (",Q,")"]},void 0,!0,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:6727,columnNumber:19},this),t.jsxDEV("th",{className:"px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-right whitespace-nowrap",children:"بدهکار / بستانکار"}';
  const headReplacement = 't.jsxDEV("th",{className:"px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-left whitespace-nowrap",children:["مبلغ کل (",Q,")"]},void 0,!0,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:6727,columnNumber:19},this),t.jsxDEV("th",{className:"px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-left whitespace-nowrap",children:["بیعانه معلق (",Q,")"]},void 0,!0,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:6727,columnNumber:19},this),t.jsxDEV("th",{className:"px-2.5 py-3 sm:px-3 sm:py-3.5 lg:px-4 text-right whitespace-nowrap",children:"بدهکار / بستانکار"}';
  if (content.includes(headTarget)) {
    content = content.replace(headTarget, headReplacement);
    console.log('  [10] Added Pending Deposit column to archive thead');
  } else {
    console.log('  [10] (already patched or anchor not found)');
  }

  // 11. Update archive row calculations for remaining balance to exclude pending deposits
  const calcTarget = 'tu.map(D=>{const ce=(D.items||[]).reduce((pt,Bt)=>{const ya=Bt.totalPrice!==void 0&&!isNaN(Number(Bt.totalPrice))?Number(Bt.totalPrice):Dl(Bt.qty,Bt.unitPrice);return pt+ya},0)+(Number(D.tax)||0)-(Number(D.discount)||0),Se=Math.max(0,ce-(Number(D.deposit)||0)),Ee=D.isDeleted,Le=it===D.id,bt=Ui.includes(D.id);';
  const calcReplacement = 'tu.map(D=>{const ce=(D.items||[]).reduce((pt,Bt)=>{const ya=Bt.totalPrice!==void 0&&!isNaN(Number(Bt.totalPrice))?Number(Bt.totalPrice):Dl(Bt.qty,Bt.unitPrice);return pt+ya},0)+(Number(D.tax)||0)-(Number(D.discount)||0),pdSum=(M||[]).filter(x=>!x.isDeleted&&x.invoiceId===D.id&&x.status==="pending").reduce((s,x)=>s+(Number(x.amount)||0),0),clrDep=Math.max(0,(Number(D.deposit)||0)-pdSum),Se=Math.max(0,ce-clrDep),Ee=D.isDeleted,Le=it===D.id,bt=Ui.includes(D.id);';
  if (content.includes(calcTarget)) {
    content = content.replace(calcTarget, calcReplacement);
    console.log('  [11] Updated archive row calculations for cleared/pending deposits');
  } else {
    const badCalcReplacement = 'tu.map(D=>{const ce=(D.items||[]).reduce((pt,Bt)=>{const ya=Bt.totalPrice!==void 0&&!isNaN(Number(Bt.totalPrice))?Number(Bt.totalPrice):Dl(Bt.qty,Bt.unitPrice);return pt+ya},0)+(Number(D.tax)||0)-(Number(D.discount)||0),pdSum=(g||[]).filter(x=>!x.isDeleted&&x.invoiceId===D.id&&x.status==="pending").reduce((s,x)=>s+(Number(x.amount)||0),0),clrDep=Math.max(0,(Number(D.deposit)||0)-pdSum),Se=Math.max(0,ce-clrDep),Ee=D.isDeleted,Le=it===D.id,bt=Ui.includes(D.id);';
    if (content.includes(badCalcReplacement)) {
      content = content.replace(badCalcReplacement, calcReplacement);
      console.log('  [11] Corrected bad calc patch (g -> M) in bundle');
    } else {
      console.log('  [11] (already patched or anchor not found)');
    }
  }

  // 12. Add Pending Deposit cell in the archive table row
  const tdTarget = 't.jsxDEV("td",{className:`px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 font-bold font-mono text-left text-[11px] sm:text-xs whitespace-nowrap ${Ee?"line-through text-slate-400 dark:text-slate-500":"text-slate-900 dark:text-slate-100"}`,children:Te(ce)},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:6810,columnNumber:23},this),t.jsxDEV("td",{className:`px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 whitespace-nowrap text-right ${Ee?"opacity-65":""}`';
  const tdReplacement = 't.jsxDEV("td",{className:`px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 font-bold font-mono text-left text-[11px] sm:text-xs whitespace-nowrap ${Ee?"line-through text-slate-400 dark:text-slate-500":"text-slate-900 dark:text-slate-100"}`,children:Te(ce)},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:6810,columnNumber:23},this),t.jsxDEV("td",{className:`px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 font-bold font-mono text-left text-[11px] sm:text-xs whitespace-nowrap ${Ee?"line-through text-slate-400 dark:text-slate-500":"text-slate-900 dark:text-slate-100"}`,children:pdSum>0?t.jsxDEV("span",{className:"text-amber-600 dark:text-amber-400 font-extrabold animate-pulse",children:Te(pdSum)},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:6810},this):t.jsxDEV("span",{className:"text-slate-400 dark:text-slate-600",children:["۰ ",Q]},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:6810},this)},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:6810,columnNumber:23},this),t.jsxDEV("td",{className:`px-2.5 py-2.5 sm:px-3 sm:py-3 lg:px-4 lg:py-3.5 whitespace-nowrap text-right ${Ee?"opacity-65":""}`';
  if (content.includes(tdTarget)) {
    content = content.replace(tdTarget, tdReplacement);
    console.log('  [12] Added Pending Deposit column cell to archive row');
  } else {
    console.log('  [12] (already patched or anchor not found)');
  }

  // 13. Add extended variable definitions in TransactionsManual map loops
  const salesRowVarTarget = 'const oe=(E.items||[]).reduce((_e,Ht)=>_e+(Ht.totalPrice||Ht.qty*Ht.unitPrice||0),0),Ae=oe>0?Math.max(0,oe+(E.tax||0)-(E.discount||0)):E.totalAmount,actDep=getClnDep(E),we=Math.max(0,Ae-actDep),je=r.role==="admin"||r.role==="accountant";';
  const salesRowVarReplacement = 'const oe=(E.items||[]).reduce((_e,Ht)=>_e+(Ht.totalPrice||Ht.qty*Ht.unitPrice||0),0),Ae=oe>0?Math.max(0,oe+(E.tax||0)-(E.discount||0)):E.totalAmount,actDep=getClnDep(E),we=Math.max(0,Ae-actDep),je=r.role==="admin"||r.role==="accountant",pdSum=(g||[]).filter(x=>!x.isDeleted&&x.invoiceId===E.id&&x.status==="pending").reduce((s,x)=>s+(Number(x.amount)||0),0),clrDep=Math.max(0,(Number(E.deposit)||0)-pdSum),remBal=Math.max(0,Ae-clrDep),isDel=E.isDeleted,currLbl=localStorage.getItem("acc_app_setting_currency")==="toman"?"تومان":"ریال",cUser=E.createdBy||"admin";';
  if (content.includes(salesRowVarTarget)) {
    content = content.replaceAll(salesRowVarTarget, salesRowVarReplacement);
    console.log('  [13] Added extended variables for TransactionsManual tables');
  } else {
    console.log('  [13] (already patched or target not found)');
  }

  // 14. Replace Sales table headers in TransactionsManual
  const salesHeadersTarget = 't.jsxDEV("th",{className:"p-3",children:"شماره فاکتور"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3108,columnNumber:19},this),t.jsxDEV("th",{className:"p-3",children:"مشتری (خریدار)"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3109,columnNumber:19},this),t.jsxDEV("th",{className:"p-3",children:"تاریخ صدور"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3110,columnNumber:19},this),t.jsxDEV("th",{className:"p-3 text-left",children:"مبلغ نهایی"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3111,columnNumber:19},this),t.jsxDEV("th",{className:"p-3 text-left",children:"دریافتی (بیعانه)"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3112,columnNumber:19},this),t.jsxDEV("th",{className:"p-3 text-left",children:"باقیمانده"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3113,columnNumber:19},this),t.jsxDEV("th",{className:"p-3 text-center",children:"عملیات"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3114,columnNumber:19},this)';
  const salesHeadersReplacement = 't.jsxDEV("th",{className:"p-3",children:"کد فاکتور"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3",children:"نوع سند"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3",children:"ثبت‌کننده"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3",children:"تاریخ صدور"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3",children:"طرف حساب تجاری"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3 text-left",children:["مبلغ کل (",localStorage.getItem("acc_app_setting_currency") === "toman" ? "تومان" : "ریال",")"]},void 0,!0,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3 text-left",children:["بیعانه معلق (",localStorage.getItem("acc_app_setting_currency") === "toman" ? "تومان" : "ریال",")"]}, void 0,!0,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3 text-left",children:"بدهکار / بستانکار"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3 text-center",children:"وضعیت سند"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3 text-center",children:"عملیات سند"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this)';
  if (content.includes(salesHeadersTarget)) {
    content = content.replace(salesHeadersTarget, salesHeadersReplacement);
    console.log('  [14] Patched Sales table headers in TransactionsManual');
  } else {
    console.log('  [14] (already patched or target not found)');
  }

  // 15. Replace Purchase table headers in TransactionsManual
  const purchHeadersTarget = 't.jsxDEV("th",{className:"p-3",children:"شماره فاکتور"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3204,columnNumber:19},this),t.jsxDEV("th",{className:"p-3",children:"تامین‌کننده (فروشنده)"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3205,columnNumber:19},this),t.jsxDEV("th",{className:"p-3",children:"تاریخ صدور"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3206,columnNumber:19},this),t.jsxDEV("th",{className:"p-3 text-left",children:"مبلغ نهایی"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3207,columnNumber:19},this),t.jsxDEV("th",{className:"p-3 text-left",children:"پرداختی (بیعانه)"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3208,columnNumber:19},this),t.jsxDEV("th",{className:"p-3 text-left",children:"باقیمانده"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3209,columnNumber:19},this),t.jsxDEV("th",{className:"p-3 text-center",children:"عملیات"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3210,columnNumber:19},this)';
  const purchHeadersReplacement = 't.jsxDEV("th",{className:"p-3",children:"کد فاکتور"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3",children:"نوع سند"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3",children:"ثبت‌کننده"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3",children:"تاریخ صدور"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3",children:"طرف حساب تجاری"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3 text-left",children:["مبلغ کل (",localStorage.getItem("acc_app_setting_currency") === "toman" ? "تومان" : "ریال",")"]},void 0,!0,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3 text-left",children:["بیعانه معلق (",localStorage.getItem("acc_app_setting_currency") === "toman" ? "تومان" : "ریال",")"]}, void 0,!0,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3 text-left",children:"بدهکار / بستانکار"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3 text-center",children:"وضعیت سند"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("th",{className:"p-3 text-center",children:"عملیات سند"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this)';
  if (content.includes(purchHeadersTarget)) {
    content = content.replace(purchHeadersTarget, purchHeadersReplacement);
    console.log('  [15] Patched Purchase table headers in TransactionsManual');
  } else {
    console.log('  [15] (already patched or target not found)');
  }

  // 16. Replace Sales table row cells in TransactionsManual
  const salesRowTarget = 't.jsxDEV("td",{className:"p-3 font-mono font-bold text-slate-800",children:["#",Ne(E.invoiceNumber)]},void 0,!0,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3137,columnNumber:25},this),t.jsxDEV("td",{className:"p-3 text-slate-700 font-bold",children:E.counterpartName},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3138,columnNumber:25},this),t.jsxDEV("td",{className:"p-3 font-mono text-slate-500",children:Ne(E.date)},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3139,columnNumber:25},this),t.jsxDEV("td",{className:"p-3 text-left font-mono font-bold text-slate-800",children:Te(Ae)},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3140,columnNumber:25},this),t.jsxDEV("td",{className:"p-3 text-left font-mono text-slate-600",children:actDep?Te(actDep):"۰"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3141,columnNumber:25},this),t.jsxDEV("td",{className:`p-3 text-left font-mono font-black \${we>0?"text-amber-600":"text-slate-500"}`,children:we>0?Te(we):"تسویه کامل"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3142,columnNumber:25},this)';
  const salesRowReplacement = 't.jsxDEV("td",{className:"p-3 font-mono font-bold text-slate-800",children:["#",Ne(E.invoiceNumber)]},void 0,!0,{fileName:"/app/applet/src/components/TransactionsManual.tsx"},this),t.jsxDEV("td",{className:"p-3 whitespace-nowrap",children:isDel?t.jsxDEV("span",{className:"text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 font-bold text-[10px]",children:"حذفی"},void 0,!1,{},this):E.type==="sale"?t.jsxDEV("span",{className:"text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100/50 text-[10px]",children:"فروش"}, void 0,!1,{},this):t.jsxDEV("span",{className:"text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/50 text-[10px]",children:"خرید"},void 0,!1,{},this)},void 0,!1,{},this),t.jsxDEV("td",{className:"p-3 whitespace-nowrap",children:t.jsxDEV("div",{className:"flex flex-col gap-0.5 items-start",children:t.jsxDEV("span",{className:"inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200/60 font-bold text-[10px]",children:[t.jsxDEV("svg",{className:"w-3 h-3 text-sky-600 shrink-0",fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",strokeWidth:"2.5",children:t.jsxDEV("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"},void 0,!1,{},this)},void 0,!1,{},this),t.jsxDEV("span",{className:"font-mono font-bold",dir:"ltr",children:"@"+cUser},void 0,!1,{},this)]},void 0,!0,{},this)},void 0,!1,{},this)},void 0,!1,{},this),t.jsxDEV("td",{className:"p-3 font-mono text-slate-500 whitespace-nowrap",children:Ne(E.date)},void 0,!1,{},this),t.jsxDEV("td",{className:"p-3 text-slate-800 font-bold max-w-[150px] truncate",title:E.counterpartName,children:E.counterpartName},void 0,!1,{},this),t.jsxDEV("td",{className:"p-3 text-left font-mono font-bold text-slate-800",children:Te(Ae)},void 0,!1,{},this),t.jsxDEV("td",{className:"p-3 text-left font-mono font-bold whitespace-nowrap",children:pdSum>0?t.jsxDEV("span",{className:"text-amber-600 font-extrabold animate-pulse",children:Te(pdSum)},void 0,!1,{},this):t.jsxDEV("span",{className:"text-slate-400",children:"۰ "+currLbl},void 0,!1,{},this)},void 0,!1,{},this),t.jsxDEV("td",{className:"p-3 text-left whitespace-nowrap",children:t.jsxDEV("div",{className:"flex flex-col gap-0.5 items-start",children:remBal===0?t.jsxDEV(t.Fragment,{children:[t.jsxDEV("div",{className:"font-mono font-black text-slate-500",children:"۰ "+currLbl},void 0,!1,{},this),t.jsxDEV("span",{className:"inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-black bg-slate-50 text-slate-600",children:"تسویه شده"},void 0,!1,{},this)]},void 0,!0,{},this):E.type==="sale"?t.jsxDEV(t.Fragment,{children:[t.jsxDEV("div",{className:"font-mono font-black text-emerald-600",children:Te(remBal)},void 0,!1,{},this),t.jsxDEV("span",{className:"inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-black bg-emerald-50 text-emerald-700",children:[t.jsxDEV("svg",{className:"w-3 h-3 shrink-0",fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",strokeWidth:"3",children:t.jsxDEV("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M2.25 6 9 12.75l4.286-4.286L21.75 16.5m0-4.5H21.75M21.75 16.5v-4.5M21.75 16.5H17.25"},void 0,!1,{},this)},void 0,!1,{},this),"مانده بدهی"]},void 0,!0,{},this)]},void 0,!0,{},this):t.jsxDEV(t.Fragment,{children:[t.jsxDEV("div",{className:"font-mono font-black text-rose-600",children:Te(remBal)},void 0,!1,{},this),t.jsxDEV("span",{className:"inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-black bg-rose-50 text-rose-700",children:[t.jsxDEV("svg",{className:"w-3 h-3 shrink-0",fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",strokeWidth:"3",children:t.jsxDEV("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M2.25 18 9 11.25l4.306 4.307L21.75 7.5M21.75 7.5H17.25M21.75 7.5v4.5"},void 0,!1,{},this)},void 0,!1,{},this),"مانده طلب"]},void 0,!0,{},this)]},void 0,!0,{},this)},void 0,!1,{},this)},void 0,!1,{},this),t.jsxDEV("td",{className:"p-3 whitespace-nowrap text-center",children:t.jsxDEV("div",{className:"flex flex-col gap-1 items-center",children:isDel?t.jsxDEV("span",{className:"inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 border border-slate-300 text-[9px] font-bold",children:"حذف شده"},void 0,!1,{},this):E.isProforma?t.jsxDEV("span",{className:"inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-semibold animate-pulse",children:t.jsxDEV("span", {children:"پیش‌فاکتور"},void 0,!1,{},this)},void 0,!1,{},this):t.jsxDEV("span",{className:"inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-bold",children:[t.jsxDEV("svg",{className:"w-3 h-3",fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",strokeWidth:"3",children:t.jsxDEV("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"m4.5 12.75 6 6 9-13.5"},void 0,!1,{},this)},void 0,!1,{},this),t.jsxDEV("span", {children:"فاکتور رسمی"},void 0,!1,{},this)]},void 0,!0,{},this)},void 0,!1,{},this)},void 0,!1,{},this)';
  if (content.includes(salesRowTarget)) {
    content = content.replace(salesRowTarget, salesRowReplacement);
    console.log('  [16] Patched Sales table row cells in TransactionsManual');
  } else {
    console.log('  [16] (already patched or target not found)');
  }

  // 17. Replace Purchase table row cells in TransactionsManual
  const simplePurchRowTarget = 't.jsxDEV("td",{className:"p-3 font-mono font-bold text-slate-800",children:["#",Ne(E.invoiceNumber)]},void 0,!0,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3233,columnNumber:25},this),t.jsxDEV("td",{className:"p-3 text-slate-700 font-bold",children:E.counterpartName},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3234,columnNumber:25},this),t.jsxDEV("td",{className:"p-3 font-mono text-slate-500",children:Ne(E.date)},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3235,columnNumber:25},this),t.jsxDEV("td",{className:"p-3 text-left font-mono font-bold text-slate-800",children:Te(Ae)},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3236,columnNumber:25},this),t.jsxDEV("td",{className:"p-3 text-left font-mono text-slate-600",children:actDep?Te(actDep):"۰"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3237,columnNumber:25},this),t.jsxDEV("td",{className:`p-3 text-left font-mono font-black ${we>0?"text-amber-600":"text-slate-500"}`,children:we>0?Te(we):"تسویه کامل"},void 0,!1,{fileName:"/app/applet/src/components/TransactionsManual.tsx",lineNumber:3238,columnNumber:25},this)';
  if (content.includes(simplePurchRowTarget)) {
    content = content.replace(simplePurchRowTarget, salesRowReplacement);
    console.log('  [17] Patched Purchase table row cells in TransactionsManual');
  } else {
    console.log('  [17] (already patched or target not found)');
  }

  // 18. Replace colSpan:8 with colSpan:11 for TransactionsManual empty states
  const emptySaleTarget = 'Dr.filter(E=>E.type==="sale").length===0&&t.jsxDEV("tr",{children:t.jsxDEV("td",{colSpan:8,className:"p-8 text-center text-slate-400 font-semibold",children:"هیچ فاکتور فروشی یافت نشد."}';
  const emptySaleReplacement = 'Dr.filter(E=>E.type==="sale").length===0&&t.jsxDEV("tr",{children:t.jsxDEV("td",{colSpan:11,className:"p-8 text-center text-slate-400 font-semibold",children:"هیچ فاکتور فروشی یافت نشد."}';
  if (content.includes(emptySaleTarget)) {
    content = content.replace(emptySaleTarget, emptySaleReplacement);
    console.log('  [18.1] Patched Sales empty state colSpan');
  }

  const emptyPurchTarget = 'Dr.filter(E=>E.type==="purchase").length===0&&t.jsxDEV("tr",{children:t.jsxDEV("td",{colSpan:8,className:"p-8 text-center text-slate-400 font-semibold",children:"هیچ فاکتور خریدی یافت نشد."}';
  const emptyPurchReplacement = 'Dr.filter(E=>E.type==="purchase").length===0&&t.jsxDEV("tr",{children:t.jsxDEV("td",{colSpan:11,className:"p-8 text-center text-slate-400 font-semibold",children:"هیچ فاکتور خریدی یافت نشد."}';
  if (content.includes(emptyPurchTarget)) {
    content = content.replace(emptyPurchTarget, emptyPurchReplacement);
    console.log('  [18.2] Patched Purchase empty state colSpan');
  }

  // 19. Define extraSideMargin state and updater
  const stateTarget = 'Xe=D=>{const T=Math.max(0,Math.round(D*10)/10);nt(T);const ce=he();localStorage.setItem(`acc_print_extra_top_margin_mm_${ce}`,String(T)),window.dispatchEvent(new CustomEvent("print-extra-top-margin-changed",{detail:{userId:ce,margin:T}}))}';
  const stateReplacement = 'Xe=D=>{const T=Math.max(0,Math.round(D*10)/10);nt(T);const ce=he();localStorage.setItem(`acc_print_extra_top_margin_mm_${ce}`,String(T)),window.dispatchEvent(new CustomEvent("print-extra-top-margin-changed",{detail:{userId:ce,margin:T}}))},[extraSideMargin,setExtraSideMargin]=v.useState(()=>{const D=(r==null?void 0:r.id)||(r==null?void 0:r.username)||"default",T=localStorage.getItem(`acc_print_extra_side_margin_mm_${D}`);if(T!==null){const ce=parseFloat(T);if(!isNaN(ce))return Math.max(0,ce)}return 0}),updatePrintExtraSideMargin=D=>{const T=Math.max(0,Math.round(D*10)/10);setExtraSideMargin(T);const ce=he();localStorage.setItem(`acc_print_extra_side_margin_mm_${ce}`,String(T)),window.dispatchEvent(new CustomEvent("print-extra-side-margin-changed",{detail:{userId:ce,margin:T}}))}';
  if (content.includes(stateTarget) && !content.includes('extraSideMargin')) {
    content = content.replace(stateTarget, stateReplacement);
    console.log('  [19] Patched extraSideMargin state and updater');
  }

  // 20. Load extraSideMargin in useEffect
  const loadTarget = 'const Se=localStorage.getItem(`acc_print_extra_top_margin_mm_${D}`);nt(Se!==null&&!isNaN(parseFloat(Se))?Math.max(0,parseFloat(Se)):0);';
  const loadReplacement = 'const Se=localStorage.getItem(`acc_print_extra_top_margin_mm_${D}`);nt(Se!==null&&!isNaN(parseFloat(Se))?Math.max(0,parseFloat(Se)):0);const Se_side=localStorage.getItem(`acc_print_extra_side_margin_mm_${D}`);setExtraSideMargin(Se_side!==null&&!isNaN(parseFloat(Se_side))?Math.max(0,parseFloat(Se_side)):0);';
  if (content.includes(loadTarget) && !content.includes('Se_side')) {
    content = content.replace(loadTarget, loadReplacement);
    console.log('  [20] Patched extraSideMargin loader in useEffect');
  }

  // 21. Add extraSideMargin to CSS print styles
  const cssTarget = 'padding-top: calc(${Se} + ${et}mm) !important;';
  const cssReplacement = 'padding-top: calc(${Se} + ${et}mm) !important;        padding-left: calc(${Se} + ${extraSideMargin}mm) !important;        padding-right: calc(${Se} + ${extraSideMargin}mm) !important;';
  if (content.includes(cssTarget) && !content.includes('extraSideMargin}mm')) {
    content = content.replace(cssTarget, cssReplacement);
    console.log('  [21] Patched CSS side padding inside printable-area');
  }

  // 22. Add extraSideMargin UI Controls to normal print modal
  const ui1TargetPrefix = 't.jsxDEV("div",{className:"flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 text-emerald-900 text-xs font-bold",title:"تنظیم حاشیه بالای صفحه در چاپ"';
  const ui1Idx = content.indexOf(ui1TargetPrefix);
  if (ui1Idx !== -1 && !content.includes('فاصله چپ/راست چاپ')) {
    const ui1EndSuffix = 'lineNumber:7264,columnNumber:15},this)';
    const ui1EndIdx = content.indexOf(ui1EndSuffix, ui1Idx);
    if (ui1EndIdx !== -1) {
      const ui1Target = content.substring(ui1Idx, ui1EndIdx + ui1EndSuffix.length);
      const ui1Replacement = ui1Target + ',t.jsxDEV("div",{className:"flex items-center gap-1.5 bg-sky-50 border border-sky-200 rounded-lg px-2 py-0.5 text-sky-900 text-xs font-bold",title:"تنظیم حاشیه چپ و راست صفحه در چاپ",children:[' +
        't.jsxDEV(Yk,{className:"w-3.5 h-3.5 text-sky-600 shrink-0 rotate-90"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7373,columnNumber:17},this),' +
        't.jsxDEV("span",{className:"text-[11px] font-bold",children:"فاصله چپ/راست چاپ:"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7374,columnNumber:17},this),' +
        't.jsxDEV("div",{className:"flex items-center gap-0.5",title:"تنظیم حاشیه چپ و راست (mm)",children:[' +
        't.jsxDEV("button",{type:"button",onClick:()=>updatePrintExtraSideMargin(extraSideMargin-1),className:"w-4 h-4 flex items-center justify-center bg-white border border-sky-300 rounded text-sky-700 font-bold hover:bg-sky-100 transition-all cursor-pointer text-[10px] select-none",title:"کاهش ۱ میلی‌متر",children:"-"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7378,columnNumber:19},this),' +
        't.jsxDEV("input",{type:"number",step:"0.5",min:"0",value:extraSideMargin,onChange:D=>updatePrintExtraSideMargin(parseFloat(D.target.value)||0),className:"w-8 text-center bg-white border border-sky-300 rounded py-0 text-[11px] font-mono font-bold text-sky-950 focus:outline-none"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7388,columnNumber:19},this),' +
        't.jsxDEV("button",{type:"button",onClick:()=>updatePrintExtraSideMargin(extraSideMargin+1),className:"w-4 h-4 flex items-center justify-center bg-white border border-sky-300 rounded text-sky-700 font-bold hover:bg-sky-100 transition-all cursor-pointer text-[10px] select-none",title:"افزایش ۱ میلی‌متر",children:"+"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7394,columnNumber:19},this),' +
        't.jsxDEV("span",{className:"text-[10px] text-slate-500 font-normal mr-0.5",children:"mm"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7400,columnNumber:19},this)' +
        ']},void 0,!0,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7375,columnNumber:17},this)' +
        ']},void 0,!0,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7372,columnNumber:15},this)';
      content = content.replace(ui1Target, ui1Replacement);
      console.log('  [22] Patched extraSideMargin UI controls for normal modal');
    }
  }

  // 23. Add extraSideMargin UI Controls to live preview / dark modal
  const ui2TargetPrefix = 't.jsxDEV("div",{className:"flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-lg px-2 py-0.5 text-emerald-900 dark:text-emerald-200 text-xs font-bold no-print",title:"تنظیم حاشیه بالای صفحه در چاپ"';
  const ui2Idx = content.indexOf(ui2TargetPrefix);
  if (ui2Idx !== -1 && !content.includes('rotate-90"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7912')) {
    const ui2EndSuffix = 'lineNumber:7765,columnNumber:15},this)';
    const ui2EndIdx = content.indexOf(ui2EndSuffix, ui2Idx);
    if (ui2EndIdx !== -1) {
      const ui2Target = content.substring(ui2Idx, ui2EndIdx + ui2EndSuffix.length);
      const ui2Replacement = ui2Target + ',t.jsxDEV("div",{className:"flex items-center gap-1.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-lg px-2 py-0.5 text-sky-900 dark:text-sky-200 text-xs font-bold no-print",title:"تنظیم حاشیه چپ و راست صفحه در چاپ",children:[' +
        't.jsxDEV(Yk,{className:"w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0 rotate-90"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7912,columnNumber:17},this),' +
        't.jsxDEV("span",{className:"text-[11px] font-bold",children:"فاصله چپ/راست چاپ:"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7913,columnNumber:17},this),' +
        't.jsxDEV("div",{className:"flex items-center gap-0.5",title:"تنظیم حاشیه چپ و راست (mm)",children:[' +
        't.jsxDEV("button",{type:"button",onClick:()=>updatePrintExtraSideMargin(extraSideMargin-1),className:"w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-sky-300 dark:border-sky-700 rounded text-sky-700 dark:text-sky-300 font-bold hover:bg-emerald-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none",title:"کاهش ۱ میلی‌متر",children:"-"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7917,columnNumber:19},this),' +
        't.jsxDEV("input",{type:"number",step:"0.5",min:"0",value:extraSideMargin,onChange:D=>updatePrintExtraSideMargin(parseFloat(D.target.value)||0),className:"w-8 text-center bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 rounded py-0 text-[11px] font-mono font-bold text-sky-950 dark:text-sky-100 focus:outline-none"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7927,columnNumber:19},this),' +
        't.jsxDEV("button",{type:"button",onClick:()=>updatePrintExtraSideMargin(extraSideMargin+1),className:"w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 border border-sky-300 dark:border-sky-700 rounded text-sky-700 dark:text-sky-300 font-bold hover:bg-emerald-100 dark:hover:bg-slate-700 transition-all cursor-pointer text-[10px] select-none",title:"افزایش ۱ میلی‌متر",children:"+"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7933,columnNumber:19},this),' +
        't.jsxDEV("span",{className:"text-[10px] text-slate-500 dark:text-slate-400 font-normal mr-0.5",children:"mm"},void 0,!1,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7939,columnNumber:19},this)' +
        ']},void 0,!0,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7914,columnNumber:17},this)' +
        ']},void 0,!0,{fileName:"/app/applet/src/components/InvoiceManager.tsx",lineNumber:7911,columnNumber:15},this)';
      content = content.replace(ui2Target, ui2Replacement);
      console.log('  [23] Patched extraSideMargin UI controls for dark preview modal');
    }
  }

  // 24. Remove items restriction in saveAllState ($c)
  const saveAllItemsTarget = 'if(g==="items"||g==="acc_app_items"||N==="items"||N==="acc_app_items")continue;';
  const saveAllItemsReplacement = 'if(g==="disabled_items_bypass")continue;';
  if (content.includes(saveAllItemsTarget)) {
    content = content.replace(saveAllItemsTarget, saveAllItemsReplacement);
    console.log('  [24] Removed items restriction in saveAllState');
  } else {
    console.log('  [24] (saveAllState items restriction already removed or target not found)');
  }

  // 25. Remove items restriction in saveGenericKeyToDb (Ma)
  const saveGenericItemsTarget = 'if(l==="currentUser"||l==="primaryUserRole"||l==="isLoggedIn"||l==="currentSessionId"||l==="items"||l==="acc_app_items"||r==="items"||r==="acc_app_items")return!0;';
  const saveGenericItemsReplacement = 'if(l==="currentUser"||l==="primaryUserRole"||l==="isLoggedIn"||l==="currentSessionId")return!0;';
  if (content.includes(saveGenericItemsTarget)) {
    content = content.replace(saveGenericItemsTarget, saveGenericItemsReplacement);
    console.log('  [25] Removed items restriction in saveGenericKeyToDb');
  } else {
    console.log('  [25] (saveGenericKeyToDb items restriction already removed or target not found)');
  }

  // 26. Remove items restriction in saveKeyData (u6)
  const saveKeyItemsTarget = 'if(l==="items"||l==="acc_app_items"||r==="items"||r==="acc_app_items")return!0;';
  const saveKeyItemsReplacement = 'if(l==="disabled_items_bypass")return!0;';
  if (content.includes(saveKeyItemsTarget)) {
    content = content.replace(saveKeyItemsTarget, saveKeyItemsReplacement);
    console.log('  [26] Removed items restriction in saveKeyData');
  } else {
    console.log('  [26] (saveKeyData items restriction already removed or target not found)');
  }

  // 27. Fix manual transaction submission in settlement / receivableSettlement (prevent double counting and align payment allocation fields)
  const bsmSettleTarget = 'const dn=ls.type==="sale",{updatedInvoices:Kl,allocations:Ti}=Fse(p,ls.counterpartId||"",dn?"sale":"purchase",oe,X,"bank_transfer",Jr.id);d(Kl),Ti.forEach(El=>{Lse({invoiceId:El.invoiceId,allocations:[{id:`alloc-${Date.now()}-${Math.random().toString(36).substring(2,6)}`,date:El.date,amount:El.amount,method:El.method,reference:El.reference,status:"cleared",clearedTxId:Jr.id,clearedDate:X}]}).catch(()=>{})})';
  const bsmSettleReplacement = 'const dn=ls.type==="sale",{updatedInvoices:Kl,allocations:Ti}=Fse(p,ls.counterpartId||"",dn?"sale":"purchase",oe,X,"bank_transfer",Jr.id,g,Tr,la||void 0);d(Kl),Ti.forEach(El=>{Lse({invoiceId:El.invoiceId,allocations:[{id:`alloc-${Date.now()}-${Math.random().toString(36).substring(2,6)}`,paymentId:Jr.id,invoiceId:El.invoiceId,invoiceNumber:El.invoiceNumber,counterpartId:ls.counterpartId||"",counterpartName:ls.counterpartName||"",allocatedAmount:Number(El.amount)||0,allocationDate:El.date||X,paymentMethod:El.method||"bank_transfer",reference:El.reference,status:"valid",clearedTxId:Jr.id,clearedDate:X}]}).catch(()=>{})})';
  if (content.includes(bsmSettleTarget)) {
    content = content.replace(bsmSettleTarget, bsmSettleReplacement);
    console.log('  [27] Patched manual settlement payment allocation parameters and fields successfully.');
  } else {
    console.log('  [27] (already patched or target not found)');
  }

  // 28. Fix allocatePaymentToInvoices function (Fse) to handle pending deposits properly and prevent double subtraction
  const fseTarget = 'function Fse(e,a,s,r,l,i="bank_transfer",m){let p=Number(r)||0;const d=[],f=(e||[]).filter(N=>(!a||N.counterpartId===a)&&N.type===s).sort((N,g)=>N.date.localeCompare(g.date)),A=new Map;for(const N of f){if(p<=0)break;const g=Number(N.totalAmount)||0,y=Number(N.deposit)||0,w=Math.max(0,g-y);if(w>0){const C=Math.min(p,w);p-=C;const V=y+C;d.push({invoiceId:N.id,invoiceNumber:N.invoiceNumber,amount:C,date:l,method:i,reference:m}),A.set(N.id,{...N,deposit:V})}}if(p>0&&f.length>0){const N=f[f.length-1],g=A.get(N.id)||N,y=(g.deposit||0)+p;d.push({invoiceId:N.id,invoiceNumber:N.invoiceNumber,amount:p,date:l,method:i,reference:m}),A.set(N.id,{...g,deposit:y})}return{updatedInvoices:(e||[]).map(N=>A.get(N.id)||N),allocations:d}}';
  const fseReplacement = 'function Fse(e,a,s,r,l,i="bank_transfer",m,h,u,k){let p=Number(r)||0;const d=[];const normNum=st=>String(st||"").replace(/[۰-۹]/g,dx=>"۰۱۲۳۴۵۶۷۸۹".indexOf(dx).toString()).replace(/[٠-٩]/g,dx=>"٠١٢٣٤٥٦٧٨٩".indexOf(dx).toString()).trim().toLowerCase();let f=(e||[]).filter(N=>(!a||N.counterpartId===a)&&N.type===s).sort((N,g)=>N.date.localeCompare(g.date));if(u&&u.length>0){const sSet=new Set(u.map(String));const sel=f.filter(N=>sSet.has(String(N.id)));const unsel=f.filter(N=>!sSet.has(String(N.id)));f=[...sel,...unsel]}else if(k&&h){const pd=h.find(N=>N.id===k);if(pd){const pdInv=f.find(N=>N.id===pd.invoiceId||normNum(N.invoiceNumber)===normNum(pd.invoiceNumber));if(pdInv){f=[pdInv,...f.filter(N=>N.id!==pdInv.id)]}}}const A=new Map;for(const N of f){if(p<=0)break;const g=Number(N.totalAmount)||0,y=Number(N.deposit)||0;const matchingPds=(h||[]).filter(pd=>!pd.isDeleted&&(pd.invoiceId===N.id||normNum(pd.invoiceNumber)===normNum(pd.invoiceNumber)));const openPds=matchingPds.filter(pd=>pd.status==="pending");const clearedPds=matchingPds.filter(pd=>pd.status==="cleared");const openPdSum=openPds.reduce((sum,pd)=>sum+(Number(pd.amount)||0),0);const clearedPdSum=clearedPds.reduce((sum,pd)=>sum+(Number(pd.amount)||0),0);const cleanDeposit=(clearedPdSum>0&&y===clearedPdSum*2&&(!N.paymentSlips||N.paymentSlips.length<=1))?clearedPdSum:y;const w=Math.max(0,g-cleanDeposit);if(w>0||openPdSum>0){const maxAlloc=w>0?w:openPdSum;const C=Math.min(p,maxAlloc);p-=C;const covPd=Math.min(C,openPdSum);const addPay=Math.max(0,C-covPd);const V=Math.max(cleanDeposit,covPd)+addPay;d.push({invoiceId:N.id,invoiceNumber:N.invoiceNumber,amount:C,date:l,method:i,reference:m}),A.set(N.id,{...N,deposit:V})}}if(p>0&&f.length>0){const N=f[f.length-1],g=A.get(N.id)||N,y=(g.deposit||0)+p;d.push({invoiceId:N.id,invoiceNumber:N.invoiceNumber,amount:p,date:l,method:i,reference:m}),A.set(N.id,{...g,deposit:y})}return{updatedInvoices:(e||[]).map(N=>A.get(N.id)||N),allocations:d}}';
  if (content.includes(fseTarget)) {
    content = content.replace(fseTarget, fseReplacement);
    console.log('  [28] Patched allocatePaymentToInvoices (Fse) logic successfully.');
  } else {
    console.log('  [28] (already patched or target not found)');
  }

  // 29. Fix LT function (getInvoicePaidAmount) to exclude pending deposits from invoice.deposit
  const ltTarget = 'function LT(e,a){let s=Math.max(0,Number(e.deposit)||0);if(a&&a.length>0){const r=a.filter(l=>l.invoiceId===e.id&&l.status!=="reversed").reduce((l,i)=>l+(Number(i.allocatedAmount)||0),0);r>s&&(s=r)}return s}';
  const ltReplacement = 'function LT(e,a){let s=Math.max(0,Number(e.deposit)||0);const pds=window.__pendingDeposits||[];const pendingSum=pds.filter(pd=>!pd.isDeleted&&pd.invoiceId===e.id&&pd.status==="pending").reduce((sum,pd)=>sum+(Number(pd.amount)||0),0);s=Math.max(0,s-pendingSum);if(a&&a.length>0){const r=a.filter(l=>l.invoiceId===e.id&&l.status!=="reversed").reduce((l,i)=>l+(Number(i.allocatedAmount)||0),0);r>s&&(s=r)}return s}';
  if (content.includes(ltTarget)) {
    content = content.replace(ltTarget, ltReplacement);
    console.log('  [29] Patched paidAmount calculator (LT) to correctly subtract pending deposits.');
  } else {
    console.log('  [29] (LT already patched or target not found)');
  }

  // 30. Fix commission settings aggressive local storage purge (prevent deleting active commission keys)
  const purgeOld = 'if(typeof window<"u")try{localStorage.removeItem("category_quantity_commission_rules"),localStorage.removeItem("commission_tags_list"),localStorage.removeItem("commission_settlements_list"),localStorage.removeItem("global_fixed_invoice_comm"),localStorage.removeItem("urgent_fixed_invoice_comm"),localStorage.removeItem("emergency_fixed_invoice_comm"),localStorage.removeItem("fixed_invoice_commissions"),localStorage.removeItem("shipping_method_fixed_commissions"),localStorage.removeItem("acc_app_invoices"),localStorage.removeItem("acc_app_users"),localStorage.removeItem("acc_app_items"),ji()}catch{}';
  const purgeNew = 'if(typeof window<"u")try{localStorage.removeItem("acc_app_invoices"),localStorage.removeItem("acc_app_users"),localStorage.removeItem("acc_app_items"),ji()}catch{}';
  if (content.includes(purgeOld)) {
    content = content.replace(purgeOld, purgeNew);
    console.log('  [30] Removed aggressive commission local storage purges successfully.');
  } else {
    console.log('  [30] (Purge old string not found or already patched)');
  }

  // 31. Guard commission database saves with window.__commissionsLoaded initialization flag
  const asyncOld = '(async()=>{try{const at=["category_quantity_commission_rules","commission_tags_list","commission_settlements_list","global_fixed_invoice_comm","urgent_fixed_invoice_comm","emergency_fixed_invoice_comm","fixed_invoice_commissions","shipping_method_fixed_commissions","warehouse_categories_list"];for(const Et of at){const ma=await fetch(`/api/db/load-key?key=${encodeURIComponent(Et)}`);if(ma.ok){const Aa=await ma.json();if(Aa&&Aa.status==="success"&&Aa.data!==void 0&&Aa.data!==null){const ta=Aa.data;Et==="category_quantity_commission_rules"&&Array.isArray(ta)?b(ta):Et==="commission_tags_list"&&Array.isArray(ta)?g(ta):Et==="commission_settlements_list"&&Array.isArray(ta)?w(ta):Et==="global_fixed_invoice_comm"?V(String(ta)):Et==="urgent_fixed_invoice_comm"?S(String(ta)):Et==="emergency_fixed_invoice_comm"?Q(String(ta)):Et==="fixed_invoice_commissions"&&typeof ta=="object"?F(ta):Et==="shipping_method_fixed_commissions"&&typeof ta=="object"?q(ta):Et==="warehouse_categories_list"&&Array.isArray(ta)&&d(ta)}}}}catch(at){console.warn("Failed to load commission settings from MySQL:",at)}})()';
  const asyncNew = '(()=>{window.__commissionsLoaded=!1;(async()=>{try{const at=["category_quantity_commission_rules","commission_tags_list","commission_settlements_list","global_fixed_invoice_comm","urgent_fixed_invoice_comm","emergency_fixed_invoice_comm","fixed_invoice_commissions","shipping_method_fixed_commissions","warehouse_categories_list"];for(const Et of at){const ma=await fetch(`/api/db/load-key?key=${encodeURIComponent(Et)}`);if(ma.ok){const Aa=await ma.json();if(Aa&&Aa.status==="success"&&Aa.data!==void 0&&Aa.data!==null){const ta=Aa.data;Et==="category_quantity_commission_rules"&&Array.isArray(ta)?b(ta):Et==="commission_tags_list"&&Array.isArray(ta)?g(ta):Et==="commission_settlements_list"&&Array.isArray(ta)?w(ta):Et==="global_fixed_invoice_comm"?V(String(ta)):Et==="urgent_fixed_invoice_comm"?S(String(ta)):Et==="emergency_fixed_invoice_comm"?Q(String(ta)):Et==="fixed_invoice_commissions"&&typeof ta=="object"?F(ta):Et==="shipping_method_fixed_commissions"&&typeof ta=="object"?q(ta):Et==="warehouse_categories_list"&&Array.isArray(ta)&&d(ta)}}}}catch(at){console.warn("Failed to load commission settings from MySQL:",at)}finally{window.__commissionsLoaded=!0}})()})()';
  if (content.includes(asyncOld)) {
    content = content.replace(asyncOld, asyncNew);
    console.log('  [31.1] Wrapped loadCommissionKeys with __commissionsLoaded tracker.');
  } else {
    console.log('  [31.1] (loadCommissionKeys wrapper already patched or target not found)');
  }

  const saveHooksOld = 'v.useEffect(()=>{Ma("commission_tags_list",N)},[N]),v.useEffect(()=>{Ma("commission_settlements_list",y)},[y]),v.useEffect(()=>{Ma("global_fixed_invoice_comm",C)},[C]),v.useEffect(()=>{Ma("urgent_fixed_invoice_comm",M)},[M]),v.useEffect(()=>{Ma("emergency_fixed_invoice_comm",R)},[R]),v.useEffect(()=>{Ma("fixed_invoice_commissions",I)},[I])';
  const saveHooksNew = 'v.useEffect(()=>{window.__commissionsLoaded&&Ma("commission_tags_list",N)},[N]),v.useEffect(()=>{window.__commissionsLoaded&&Ma("commission_settlements_list",y)},[y]),v.useEffect(()=>{window.__commissionsLoaded&&Ma("global_fixed_invoice_comm",C)},[C]),v.useEffect(()=>{window.__commissionsLoaded&&Ma("urgent_fixed_invoice_comm",M)},[M]),v.useEffect(()=>{window.__commissionsLoaded&&Ma("emergency_fixed_invoice_comm",R)},[R]),v.useEffect(()=>{window.__commissionsLoaded&&Ma("fixed_invoice_commissions",I)},[I])';
  if (content.includes(saveHooksOld)) {
    content = content.replace(saveHooksOld, saveHooksNew);
    console.log('  [31.2] Guarded save hooks with __commissionsLoaded successfully.');
  } else {
    console.log('  [31.2] (Save hooks already guarded or target not found)');
  }

  const shipSaveOld = 'v.useEffect(()=>{Ma("shipping_method_fixed_commissions",W)},[W])';
  const shipSaveNew = 'v.useEffect(()=>{window.__commissionsLoaded&&Ma("shipping_method_fixed_commissions",W)},[W])';
  if (content.includes(shipSaveOld)) {
    content = content.replace(shipSaveOld, shipSaveNew);
    console.log('  [31.3] Guarded shipping method commission save with __commissionsLoaded successfully.');
  } else {
    console.log('  [31.3] (Shipping save already guarded or target not found)');
  }

  // 33. Fetch and sync commission_tags_list inside InvoiceManager's loading phase to ensure tags are always up-to-date on Invoice tab load
  const loadRulesOld = 'const Ae=await fetch("/api/db/load-key?key=category_quantity_commission_rules");if(Ae.ok){const we=await Ae.json();we&&we.status==="success"&&Array.isArray(we.data)&&Oe(we.data)}';
  const loadRulesNew = 'const Ae=await fetch("/api/db/load-key?key=category_quantity_commission_rules");if(Ae.ok){const we=await Ae.json();we&&we.status==="success"&&Array.isArray(we.data)&&Oe(we.data)}try{const ct=await fetch("/api/db/load-key?key=commission_tags_list");if(ct.ok){const we=await ct.json();we&&we.status==="success"&&Array.isArray(we.data)&&localStorage.setItem("commission_tags_list",JSON.stringify(we.data))}}catch(e){}';
  if (content.includes(loadRulesOld)) {
    content = content.replace(loadRulesOld, loadRulesNew);
    console.log('  [33] Added commission_tags_list fetch to InvoiceManager loading flow successfully.');
  } else {
    console.log('  [33] (commission_tags_list fetch already added or target not found)');
  }

  // 32. Render tag picker selection popup modal conditionally when be !== null
  const tagModalJsx = `be !== null && t.jsxDEV("div", {
    style: { backgroundColor: "var(--popup-overlay-bg)" },
    className: "fixed inset-0 flex items-center justify-center p-4 z-[100] animate-fade-in popup-overlay-global",
    id: "dialog-tag-picker",
    dir: "rtl",
    children: t.jsxDEV("div", {
      style: {
        backgroundColor: "var(--popup-bg)",
        borderRadius: "var(--popup-radius)",
        boxShadow: "var(--popup-shadow)",
        color: "var(--popup-text)",
        borderColor: "var(--popup-border)"
      },
      className: "rounded-2xl shadow-2xl w-full max-w-md p-6 overflow-hidden animate-scale-up border border-slate-100 dark:border-slate-800 text-right space-y-4 popup-box-global",
      children: [
        t.jsxDEV("div", {
          className: "flex items-center justify-between gap-2.5 font-bold border-b border-slate-100 dark:border-slate-800 pb-3",
          children: [
            t.jsxDEV("div", {
              className: "flex items-center gap-2 text-amber-600 dark:text-amber-400",
              children: [
                t.jsxDEV("span", { className: "text-lg shrink-0", children: "🏷️" }),
                t.jsxDEV("h4", { className: "text-md font-extrabold", children: "انتخاب برچسب‌های پورسانت" })
              ]
            }),
            t.jsxDEV("button", {
              type: "button",
              onClick: () => ke(null),
              className: "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold text-lg cursor-pointer",
              children: "✕"
            })
          ]
        }),
        t.jsxDEV("div", {
          className: "space-y-2.5 max-h-[220px] overflow-y-auto pr-1",
          children: (() => {
            let savedTags = [];
            try {
              const raw = localStorage.getItem('commission_tags_list');
              if (raw) savedTags = JSON.parse(raw);
            } catch (e) {}
            if (savedTags.length === 0) {
              return t.jsxDEV("div", { className: "text-xs text-slate-400 text-center py-4", children: "هیچ تگ پورسانتی تعریف نشده است" });
            }
            return savedTags.map((tag) => {
              const isChecked = xe.includes(tag.name);
              return t.jsxDEV("label", {
                className: "flex items-start gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer transition-colors",
                children: [
                  t.jsxDEV("input", {
                    type: "checkbox",
                    checked: isChecked,
                    onChange: () => {
                      if (isChecked) {
                        Ve(xe.filter(n => n !== tag.name));
                      } else {
                        Ve([...xe, tag.name]);
                      }
                    },
                    className: "mt-1 w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  }),
                  t.jsxDEV("div", {
                    className: "flex-1 text-xs",
                    children: [
                      t.jsxDEV("div", {
                        className: "flex items-center justify-between gap-1.5 font-bold text-slate-800 dark:text-slate-100",
                        children: [
                          t.jsxDEV("span", { children: tag.name }),
                          t.jsxDEV("span", {
                            className: "text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-md font-mono font-extrabold border border-amber-100 dark:border-amber-900/40",
                            children: tag.type === 'percent' ? tag.value + "٪" : tag.value.toLocaleString() + " تومان"
                          })
                        ]
                      }),
                      tag.description && t.jsxDEV("div", {
                        className: "text-[10px] text-slate-500 dark:text-slate-400 mt-1",
                        children: tag.description
                      })
                    ]
                  })
                ]
              }, tag.id);
            });
          })()
        }),
        t.jsxDEV("div", {
          className: "space-y-1.5",
          children: [
            t.jsxDEV("label", { className: "text-xs font-bold text-slate-700 dark:text-slate-300", children: "توضیحات تکمیلی ردیف:" }),
            t.jsxDEV("textarea", {
              value: (() => {
                const currentRow = Ae[be];
                if (!currentRow) return '';
                let savedTags = [];
                try {
                  const raw = localStorage.getItem('commission_tags_list');
                  if (raw) savedTags = JSON.parse(raw);
                } catch (e) {}
                let remText = currentRow.remarks || '';
                savedTags.forEach(t => {
                  if (t.name) {
                    remText = remText.replace("[" + t.name + "]", '').replace(t.name, '');
                  }
                });
                return remText.trimStart();
              })(),
              onChange: (e) => {
                const currentRow = Ae[be];
                if (!currentRow) return;
                const newFreeText = e.target.value;
                const activeTagNames = xe.map(name => "[" + name + "]");
                const combined = [...activeTagNames, newFreeText].filter(Boolean).join(' ');
                Sc(be, 'remarks', combined);
              },
              rows: 2,
              placeholder: "توضیحات و یادداشت‌های این ردیف کالا...",
              className: "w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            })
          ]
        }),
        t.jsxDEV("div", {
          className: "flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800",
          children: [
            t.jsxDEV("button", {
              type: "button",
              onClick: () => ke(null),
              className: "px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors",
              children: "انصراف"
            }),
            t.jsxDEV("button", {
              type: "button",
              onClick: () => {
                const currentRow = Ae[be];
                if (currentRow) {
                  let savedTags = [];
                  try {
                    const raw = localStorage.getItem('commission_tags_list');
                    if (raw) savedTags = JSON.parse(raw);
                  } catch (e) {}
                  let remText = currentRow.remarks || '';
                  savedTags.forEach(t => {
                    if (t.name) {
                      remText = remText.replace("[" + t.name + "]", '').replace(t.name, '');
                    }
                  });
                  const freeText = remText.trim();
                  const formattedTags = xe.map(name => "[" + name + "]").join(' ');
                  const combinedRemarks = [formattedTags, freeText].filter(Boolean).join(' ');
                  Sc(be, 'remarks', combinedRemarks);
                }
                ke(null);
              },
              className: "px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm",
              children: "اعمال برچسب‌ها"
            })
          ]
        })
      ]
    })
  })`;

  const modalAnchor = 'lineNumber:7346,columnNumber:9},this),ms&&Oa&&t.jsxDEV("div"';
  const modalReplacement = 'lineNumber:7346,columnNumber:9},this),' + tagModalJsx + ',ms&&Oa&&t.jsxDEV("div"';
  if (content.includes(modalAnchor)) {
    content = content.replace(modalAnchor, modalReplacement);
    console.log('  [32] Patched tag selection modal popup successfully.');
  } else {
    console.log('  [32] (Tag selection modal anchor already replaced or not found)');
  }

  // Validate syntax
  try {
    new (require('vm').Script)(content);
    console.log('  JavaScript syntax validation (vm.Script) passed!');
  } catch (err) {
    console.error('  ❌ JavaScript syntax validation failed! Error:', err.message);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('  Successfully saved:', filePath);
}

console.log('\nAll bundle files patched and validated successfully.');

// Automatically create fresh dist.zip using AdmZip AFTER patching is complete
try {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(__dirname, '../dist'));
  const zipDest = path.join(__dirname, '../dist.zip');
  zip.writeZip(zipDest);
  console.log(`📦 [Packaging] Generated patched fresh ${zipDest} successfully.`);
} catch (zipErr) {
  console.warn('⚠️ [Packaging] Could not create dist.zip via AdmZip:', zipErr);
}


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
  if (content.includes(stateTarget)) {
    content = content.replace(stateTarget, stateReplacement);
    console.log('  [19] Patched extraSideMargin state and updater');
  }

  // 20. Load extraSideMargin in useEffect
  const loadTarget = 'const Se=localStorage.getItem(`acc_print_extra_top_margin_mm_${D}`);nt(Se!==null&&!isNaN(parseFloat(Se))?Math.max(0,parseFloat(Se)):0);';
  const loadReplacement = 'const Se=localStorage.getItem(`acc_print_extra_top_margin_mm_${D}`);nt(Se!==null&&!isNaN(parseFloat(Se))?Math.max(0,parseFloat(Se)):0);const Se_side=localStorage.getItem(`acc_print_extra_side_margin_mm_${D}`);setExtraSideMargin(Se_side!==null&&!isNaN(parseFloat(Se_side))?Math.max(0,parseFloat(Se_side)):0);';
  if (content.includes(loadTarget)) {
    content = content.replace(loadTarget, loadReplacement);
    console.log('  [20] Patched extraSideMargin loader in useEffect');
  }

  // 21. Add extraSideMargin to CSS print styles
  const cssTarget = 'padding-top: calc(${Se} + ${et}mm) !important;';
  const cssReplacement = 'padding-top: calc(${Se} + ${et}mm) !important;        padding-left: calc(${Se} + ${extraSideMargin}mm) !important;        padding-right: calc(${Se} + ${extraSideMargin}mm) !important;';
  if (content.includes(cssTarget)) {
    content = content.replace(cssTarget, cssReplacement);
    console.log('  [21] Patched CSS side padding inside printable-area');
  }

  // 22. Add extraSideMargin UI Controls to normal print modal
  const ui1TargetPrefix = 't.jsxDEV("div",{className:"flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 text-emerald-900 text-xs font-bold",title:"تنظیم حاشیه بالای صفحه در چاپ"';
  const ui1Idx = content.indexOf(ui1TargetPrefix);
  if (ui1Idx !== -1) {
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
  if (ui2Idx !== -1) {
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

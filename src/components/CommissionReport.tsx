import React, { useState, useEffect, useMemo } from 'react';
import { Invoice, User, CommissionTag, CommissionSettlement, WarehouseItem } from '../types';
import { formatCurrency, toPersianDigits, getTodayJalali, getOneMonthAgoJalali, saveGenericKeyToDb, purgeWarehouseCategoriesAndLogsStorage } from '../utils/stateManager';
import { getStoredShippingMethods, getStoredWarehouseCategoriesList } from '../utils/defaultData';
import { JalaliDatePicker } from './JalaliDatePicker';
import { normalizeJalaliDate, isDateInRange } from '../services/dateService';
import {
  Tag,
  Plus,
  Trash2,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Percent,
  DollarSign,
  Search,
  UserCheck,
  Receipt,
  Building2,
  Calendar,
  X,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Wallet,
  Calculator,
  Sliders,
  Check,
  RotateCcw,
  Pencil,
  GripVertical,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Truck,
  Lock
} from 'lucide-react';

interface CommissionReportProps {
  invoices?: Invoice[];
  users?: User[];
  currentUser?: User;
  items?: WarehouseItem[];
}

function toEnglishDigits(str: string): string {
  if (!str) return '';
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const englishDigits = '0123456789';
  let cleanStr = str;
  for (let i = 0; i < 10; i++) {
    cleanStr = cleanStr.replace(new RegExp(persianDigits[i], 'g'), englishDigits[i]);
  }
  return cleanStr;
}

function normalizeDate(dateStr: string): string {
  return normalizeJalaliDate(dateStr);
}

export default function CommissionReport({
  invoices: propsInvoices,
  users: propsUsers,
  currentUser,
  items: propsItems
}: CommissionReportProps) {
  const currencyLabel = localStorage.getItem('acc_app_setting_currency') === 'toman' ? 'تومان' : 'ریال';

  // Load Invoices (from props only, never localStorage)
  const invoices = useMemo<Invoice[]>(() => {
    return propsInvoices || [];
  }, [propsInvoices]);

  // Load Users / Sellers (from props only)
  const users = useMemo<User[]>(() => {
    return propsUsers || [];
  }, [propsUsers]);

  // Categories list for default category commission percents
  const [categoriesList, setCategoriesList] = useState<any[]>([]);

  // Load Warehouse Items to match categories and item specific commission percents (from props only)
  const warehouseItems = useMemo(() => {
    return propsItems || [];
  }, [propsItems]);

  // Category Quantity Commission Rules
  const [categoryQuantityRules, setCategoryQuantityRules] = useState<any[]>([]);

  // Commission Tags State
  const [tags, setTags] = useState<CommissionTag[]>([
    { id: '1', name: 'پورسانت ویژه کالای پرفروش', type: 'percent', value: 3, description: 'افزودن ۳٪ پورسانت تشویقی' },
    { id: '2', name: 'پاداش نقدی فروش', type: 'fixed', value: 50000, description: '۵۰,۰۰۰ تومان پاداش روی هر عدد' }
  ]);

  // Commission Settlements State
  const [settlements, setSettlements] = useState<CommissionSettlement[]>([]);

  // Global Base Fixed Commission Per Invoice State
  const [globalFixedInvoiceComm, setGlobalFixedInvoiceComm] = useState<string>('0');

  // Urgent Fixed Commission State
  const [urgentFixedInvoiceComm, setUrgentFixedInvoiceComm] = useState<string>('0');

  // Emergency Fixed Commission State
  const [emergencyFixedInvoiceComm, setEmergencyFixedInvoiceComm] = useState<string>('0');

  // Fixed Invoice Commission State (Overrides for specific invoices)
  const [fixedInvoiceCommissions, setFixedInvoiceCommissions] = useState<{ [invoiceId: string]: number }>({});

  // Shipping Methods fetched from System Settings
  const [shippingMethods, setShippingMethods] = useState<{ id: string; name: string; iconData: string; note?: string }[]>(() => getStoredShippingMethods());

  // Shipping Method Fixed Commission Amounts map (shippingMethodId or name -> fixed amount)
  const [shippingMethodCommissions, setShippingMethodCommissions] = useState<Record<string, string>>({});

  // Fetch initial commission configuration from central MySQL database on mount
  useEffect(() => {
    // Purge legacy financial keys from localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('category_quantity_commission_rules');
        localStorage.removeItem('commission_tags_list');
        localStorage.removeItem('commission_settlements_list');
        localStorage.removeItem('global_fixed_invoice_comm');
        localStorage.removeItem('urgent_fixed_invoice_comm');
        localStorage.removeItem('emergency_fixed_invoice_comm');
        localStorage.removeItem('fixed_invoice_commissions');
        localStorage.removeItem('shipping_method_fixed_commissions');
        localStorage.removeItem('acc_app_invoices');
        localStorage.removeItem('acc_app_users');
        localStorage.removeItem('acc_app_items');
        purgeWarehouseCategoriesAndLogsStorage();
      } catch (_) {}
    }

    const loadCommissionKeys = async () => {
      try {
        const keys = [
          'category_quantity_commission_rules',
          'commission_tags_list',
          'commission_settlements_list',
          'global_fixed_invoice_comm',
          'urgent_fixed_invoice_comm',
          'emergency_fixed_invoice_comm',
          'fixed_invoice_commissions',
          'shipping_method_fixed_commissions',
          'warehouse_categories_list'
        ];
        
        for (const k of keys) {
          const res = await fetch(`/api/db/load-key?key=${encodeURIComponent(k)}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.status === 'success' && data.data !== undefined && data.data !== null) {
              const val = data.data;
              if (k === 'category_quantity_commission_rules' && Array.isArray(val)) setCategoryQuantityRules(val);
              else if (k === 'commission_tags_list' && Array.isArray(val) && val.length > 0) setTags(val);
              else if (k === 'commission_settlements_list' && Array.isArray(val)) setSettlements(val);
              else if (k === 'global_fixed_invoice_comm') setGlobalFixedInvoiceComm(String(val));
              else if (k === 'urgent_fixed_invoice_comm') setUrgentFixedInvoiceComm(String(val));
              else if (k === 'emergency_fixed_invoice_comm') setEmergencyFixedInvoiceComm(String(val));
              else if (k === 'fixed_invoice_commissions' && typeof val === 'object') setFixedInvoiceCommissions(val);
              else if (k === 'shipping_method_fixed_commissions' && typeof val === 'object') setShippingMethodCommissions(val);
              else if (k === 'warehouse_categories_list' && Array.isArray(val)) setCategoriesList(val);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load commission settings from MySQL:', err);
      }
    };

    loadCommissionKeys();
  }, []);

  // Save tags to MySQL
  useEffect(() => {
    saveGenericKeyToDb('commission_tags_list', tags);
  }, [tags]);

  // Save settlements to MySQL
  useEffect(() => {
    saveGenericKeyToDb('commission_settlements_list', settlements);
  }, [settlements]);

  // Save global fixed invoice commission to MySQL
  useEffect(() => {
    saveGenericKeyToDb('global_fixed_invoice_comm', globalFixedInvoiceComm);
  }, [globalFixedInvoiceComm]);

  // Save urgent fixed commission to MySQL
  useEffect(() => {
    saveGenericKeyToDb('urgent_fixed_invoice_comm', urgentFixedInvoiceComm);
  }, [urgentFixedInvoiceComm]);

  // Save emergency fixed commission to MySQL
  useEffect(() => {
    saveGenericKeyToDb('emergency_fixed_invoice_comm', emergencyFixedInvoiceComm);
  }, [emergencyFixedInvoiceComm]);

  // Save fixed invoice commissions map to MySQL
  useEffect(() => {
    saveGenericKeyToDb('fixed_invoice_commissions', fixedInvoiceCommissions);
  }, [fixedInvoiceCommissions]);

  // Keep shipping methods and warehouse categories list updated
  useEffect(() => {
    const refreshSM = (e?: any) => {
      if (e?.detail && Array.isArray(e?.detail)) {
        setShippingMethods(e.detail);
      } else {
        setShippingMethods(getStoredShippingMethods());
      }
    };
    const refreshCats = (e?: any) => {
      if (e?.detail && Array.isArray(e?.detail)) {
        setCategoriesList(e.detail);
      } else {
        setCategoriesList(getStoredWarehouseCategoriesList());
      }
    };
    window.addEventListener('focus', refreshSM);
    window.addEventListener('shipping-methods-updated', refreshSM);
    window.addEventListener('warehouse-categories-updated', refreshCats);
    return () => {
      window.removeEventListener('focus', refreshSM);
      window.removeEventListener('shipping-methods-updated', refreshSM);
      window.removeEventListener('warehouse-categories-updated', refreshCats);
    };
  }, []);

  // Save shipping method commissions to MySQL
  useEffect(() => {
    saveGenericKeyToDb('shipping_method_fixed_commissions', shippingMethodCommissions);
  }, [shippingMethodCommissions]);

  // Drawer state for Shipping Methods Commission (پنجره کشویی روش‌های ارسال)
  const [isShippingMethodsDrawerOpen, setIsShippingMethodsDrawerOpen] = useState<boolean>(false);

  // Drawer state for Fixed Invoice Commission (منوی کشویی پورسانت ثابت هر فاکتور)
  const [isFixedCommDrawerOpen, setIsFixedCommDrawerOpen] = useState<boolean>(false);

  // Drawer state for New Tag Definition (defaults to closed / کشویی متصل به پایین)
  const [isTagDrawerOpen, setIsTagDrawerOpen] = useState<boolean>(false);

  // New Tag Form state
  const [newTagName, setNewTagName] = useState<string>('');
  const [newTagType, setNewTagType] = useState<'percent' | 'fixed'>('percent');
  const [newTagValue, setNewTagValue] = useState<string>('0');
  const [newTagDesc, setNewTagDesc] = useState<string>('');

  // Tag Delete Confirmation Modal state
  const [tagToDelete, setTagToDelete] = useState<CommissionTag | null>(null);

  // Tag Edit Modal state
  const [editingTag, setEditingTag] = useState<CommissionTag | null>(null);
  const [editTagName, setEditTagName] = useState<string>('');
  const [editTagType, setEditTagType] = useState<'percent' | 'fixed'>('percent');
  const [editTagValue, setEditTagValue] = useState<string>('0');
  const [editTagDesc, setEditTagDesc] = useState<string>('');

  // Drag & Drop reordering state
  const [draggedTagIndex, setDraggedTagIndex] = useState<number | null>(null);

  // Filters State
  const [selectedSeller, setSelectedSeller] = useState<string>('all');
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [startDate, setStartDate] = useState<string>(() => getOneMonthAgoJalali());
  const [endDate, setEndDate] = useState<string>(getTodayJalali());
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal Settlement State
  const [settleModalInvoice, setSettleModalInvoice] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    sellerName: string;
    totalCommission: number;
    currentPaid: number;
  } | null>(null);

  const [settleAmount, setSettleAmount] = useState<string>('');
  const [settleNote, setSettleNote] = useState<string>('');

  // Commission calculation breakdown modal state
  const [selectedDetailInvoice, setSelectedDetailInvoice] = useState<any | null>(null);

  const detailInvoiceCalculation = useMemo(() => {
    if (!selectedDetailInvoice) return null;
    const inv = selectedDetailInvoice;

    const itemsDetails: Array<{
      itemName: string;
      qty: number;
      unitPrice: number;
      totalPrice: number;
      catPercent: number;
      catCommission: number;
      appliedTags: Array<{ tagName: string; type: 'percent' | 'fixed'; value: number; commAmount: number }>;
      itemTotalCommission: number;
    }> = [];

    let itemsCommissionTotal = 0;

    if (inv.items && Array.isArray(inv.items)) {
      inv.items.forEach((item: any) => {
        const qty = Number(item.quantity || item.qty) || 1;
        const unitPrice = Number(item.unitPrice) || 0;
        const totalPrice = qty * unitPrice;

        // Category percentage
        let catPercent = Number(item.commissionPercent) || 0;
        let matchedWarehouseItem: any = null;
        if (warehouseItems.length > 0) {
          if (item.itemId) {
            matchedWarehouseItem = warehouseItems.find((w: any) => w.id === item.itemId);
          }
          if (!matchedWarehouseItem && item.name) {
            const cleanItemName = String(item.name).trim().toLowerCase();
            matchedWarehouseItem = warehouseItems.find((w: any) => w.name && String(w.name).trim().toLowerCase() === cleanItemName);
          }
        }

        if (!catPercent && matchedWarehouseItem && matchedWarehouseItem.commissionPercent) {
          catPercent = Number(matchedWarehouseItem.commissionPercent) || 0;
        }

        if (!catPercent && categoriesList.length > 0) {
          const itemCatName = (item.categoryName || matchedWarehouseItem?.categoryName || matchedWarehouseItem?.finalCategory || '').trim().toLowerCase();
          const itemParent = (matchedWarehouseItem?.parentCategory || '').trim().toLowerCase();
          const itemSub = (matchedWarehouseItem?.subCategory || '').trim().toLowerCase();
          const itemName = (item.name || matchedWarehouseItem?.name || '').trim().toLowerCase();

          const matchCat = categoriesList.find((c: any) => {
            const cFinal = (c.final || '').trim().toLowerCase();
            const cSub = (c.sub || '').trim().toLowerCase();
            const cParent = (c.parent || '').trim().toLowerCase();

            if (cFinal && itemCatName && cFinal === itemCatName) return true;
            if (cParent && itemParent && cSub && itemSub && cParent === itemParent && cSub === itemSub) return true;
            if (cFinal && itemName && itemName.includes(cFinal)) return true;
            if (cSub && itemName && itemName.includes(cSub)) return true;
            if (cParent && itemName && itemName.includes(cParent)) return true;
            return false;
          });

          if (matchCat && matchCat.commissionPercent) {
            catPercent = Number(matchCat.commissionPercent) || 0;
          }
        }

        const catCommission = catPercent > 0 ? (totalPrice * catPercent) / 100 : 0;

        // Tags
        const appliedTags: Array<{ tagName: string; type: 'percent' | 'fixed'; value: number; commAmount: number }> = [];
        let tagCommission = 0;

        if (item.remarks) {
          const remarks = String(item.remarks);
          // Deduplicate active tags by lowercase name so each tag is processed exactly once
          const uniqueTagsMap = new Map<string, CommissionTag>();
          tags.forEach(t => {
            if (t && t.name && t.name.trim()) {
              uniqueTagsMap.set(t.name.trim().toLowerCase(), t);
            }
          });

          uniqueTagsMap.forEach(t => {
            if (remarks.includes(`[${t.name}]`) || remarks.includes(t.name)) {
              let commAmt = 0;
              if (t.type === 'percent') {
                commAmt = (totalPrice * t.value) / 100;
              } else {
                commAmt = qty * t.value;
              }
              appliedTags.push({
                tagName: t.name,
                type: t.type,
                value: t.value,
                commAmount: commAmt
              });
              tagCommission += commAmt;
            }
          });
        }

        const itemTotalCommission = catCommission + tagCommission;
        itemsCommissionTotal += itemTotalCommission;

        itemsDetails.push({
          itemName: item.name || 'کالای بدون نام',
          qty,
          unitPrice,
          totalPrice,
          catPercent,
          catCommission,
          appliedTags,
          itemTotalCommission
        });
      });
    }

    // Category Quantity Rules
    const categoryRulesDetails: Array<{
      ruleTitle: string;
      categories: string[];
      totalQty: number;
      thresholdQty: number;
      excessQty: number;
      commissionPerItem: number;
      excessCommissionTotal: number;
    }> = [];
    let categoryRulesTotal = 0;

    if (categoryQuantityRules && categoryQuantityRules.length > 0 && inv.items && Array.isArray(inv.items)) {
      categoryQuantityRules.forEach((rule: any) => {
        if (!rule.selectedCategories || !Array.isArray(rule.selectedCategories) || rule.selectedCategories.length === 0) return;
        const threshold = Number(rule.thresholdQuantity) || 0;
        const excessCommPerItem = Number(rule.excessCommissionPerItem) || 0;
        if (excessCommPerItem <= 0) return;

        let totalQtyInCategories = 0;

        inv.items.forEach((it: any) => {
          let matchedWItem: any = null;
          if (it.itemId) {
            matchedWItem = warehouseItems.find((w: any) => w.id === it.itemId);
          }
          if (!matchedWItem && it.name) {
            const cleanName = String(it.name).trim().toLowerCase();
            matchedWItem = warehouseItems.find((w: any) => w.name && String(w.name).trim().toLowerCase() === cleanName);
          }

          const itemFinalCat = (it.categoryName || matchedWItem?.categoryName || matchedWItem?.finalCategory || '').trim().toLowerCase();
          const itemParentCat = (matchedWItem?.parentCategory || '').trim().toLowerCase();
          const itemSubCat = (matchedWItem?.subCategory || '').trim().toLowerCase();
          const itemName = (it.name || matchedWItem?.name || '').trim().toLowerCase();

          const isMatch = rule.selectedCategories.some((sc: string) => {
            const c = (sc || '').trim().toLowerCase();
            if (!c) return false;
            if (itemFinalCat && itemFinalCat === c) return true;
            if (itemParentCat && itemParentCat === c) return true;
            if (itemSubCat && itemSubCat === c) return true;
            if (itemName && itemName.includes(c)) return true;
            return false;
          });

          if (isMatch) {
            totalQtyInCategories += (Number(it.qty || it.quantity) || 1);
          }
        });

        if (totalQtyInCategories > threshold) {
          const excessQty = totalQtyInCategories - threshold;
          const excessCommissionTotal = excessQty * excessCommPerItem;
          categoryRulesTotal += excessCommissionTotal;

          categoryRulesDetails.push({
            ruleTitle: rule.title || 'قانون پورسانت تعدادی دسته‌بندی',
            categories: rule.selectedCategories,
            totalQty: totalQtyInCategories,
            thresholdQty: threshold,
            excessQty,
            commissionPerItem: excessCommPerItem,
            excessCommissionTotal
          });
        }
      });
    }

    // Fixed Invoice Commission (Base)
    const globalAmt = parseFloat(globalFixedInvoiceComm) || 0;
    const customOverride = fixedInvoiceCommissions[inv.id];
    const fixedInvoiceCommission = customOverride !== undefined ? Number(customOverride) : globalAmt;

    // Urgent / Emergency Fixed Extra Commission
    const urgentAmt = parseFloat(urgentFixedInvoiceComm) || 0;
    const emergencyAmt = parseFloat(emergencyFixedInvoiceComm) || 0;
    let urgentExtraComm = 0;
    let urgentTypeLabel = '';

    if (inv.urgentType === 'emergency') {
      urgentExtraComm = emergencyAmt;
      urgentTypeLabel = 'اورژانسی';
    } else if (inv.urgentType === 'urgent' || (inv.isUrgent && !inv.urgentType)) {
      urgentExtraComm = urgentAmt;
      urgentTypeLabel = 'فوری';
    }

    // Shipping Method Fixed Commission
    let shippingMethodExtraComm = 0;
    let shippingMethodName = '';
    if (inv.shippingMethod) {
      const matchedSM = shippingMethods.find(sm => sm.id === inv.shippingMethod || sm.name === inv.shippingMethod);
      if (matchedSM) {
        shippingMethodName = matchedSM.name;
        const commVal = shippingMethodCommissions[matchedSM.id] || shippingMethodCommissions[matchedSM.name];
        shippingMethodExtraComm = parseFloat(commVal || '0') || 0;
      } else {
        const commVal = shippingMethodCommissions[inv.shippingMethod];
        shippingMethodExtraComm = parseFloat(commVal || '0') || 0;
        shippingMethodName = inv.shippingMethod;
      }
    }

    const totalCommission = itemsCommissionTotal + categoryRulesTotal + fixedInvoiceCommission + urgentExtraComm + shippingMethodExtraComm;

    return {
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      sellerName: inv.sellerName || inv.createdBy || 'نامشخص',
      customerName: inv.customerName || 'خریدار عادی',
      totalAmount: inv.totalAmount || 0,
      itemsDetails,
      itemsCommissionTotal,
      categoryRulesDetails,
      categoryRulesTotal,
      fixedInvoiceCommission,
      urgentExtraComm,
      urgentTypeLabel,
      shippingMethodExtraComm,
      shippingMethodName,
      totalCommission
    };
  }, [selectedDetailInvoice, warehouseItems, categoriesList, categoryQuantityRules, tags, globalFixedInvoiceComm, fixedInvoiceCommissions, urgentFixedInvoiceComm, emergencyFixedInvoiceComm, shippingMethods, shippingMethodCommissions]);

  // Helper to handle creation of a new tag
  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    const val = parseFloat(newTagValue) || 0;
    const cleanName = newTagName.trim();

    setTags(prev => {
      const existingIdx = prev.findIndex(t => t.name.trim().toLowerCase() === cleanName.toLowerCase());
      if (existingIdx !== -1) {
        // Update existing tag instead of creating a duplicate tag entry
        return prev.map((t, idx) => {
          if (idx === existingIdx) {
            return {
              ...t,
              name: cleanName,
              type: newTagType,
              value: val,
              description: newTagDesc.trim() || t.description
            };
          }
          return t;
        });
      }
      const tag: CommissionTag = {
        id: Date.now().toString(),
        name: cleanName,
        type: newTagType,
        value: val,
        description: newTagDesc.trim(),
        createdAt: getTodayJalali(),
        createdBy: currentUser?.name || 'مدیر سیستم'
      };
      return [...prev, tag];
    });

    setNewTagName('');
    setNewTagValue('0');
    setNewTagDesc('');
  };

  // Helper to open edit tag modal
  const handleOpenEditTag = (t: CommissionTag) => {
    setEditingTag(t);
    setEditTagName(t.name);
    setEditTagType(t.type);
    setEditTagValue(t.value.toString());
    setEditTagDesc(t.description || '');
  };

  // Helper to save edited tag
  const handleSaveEditTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTag || !editTagName.trim()) return;
    const val = parseFloat(editTagValue) || 0;
    const oldName = editingTag.name.trim();
    const newName = editTagName.trim();

    setTags(prev => {
      const updated = prev.map(t => {
        if (t.id === editingTag.id) {
          return {
            ...t,
            name: newName,
            type: editTagType,
            value: val,
            description: editTagDesc.trim()
          };
        }
        return t;
      });

      // Deduplicate tags array by lowercase name
      const seen = new Set<string>();
      const result: CommissionTag[] = [];
      updated.forEach(t => {
        const key = t.name.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          result.push(t);
        }
      });
      return result;
    });

    // If tag name changed, update references in invoices
    if (oldName && newName && oldName !== newName) {
      (async () => {
        try {
          let currentInvs = propsInvoices;
          if (!currentInvs || currentInvs.length === 0) {
            const res = await fetch('/api/db/load-key?key=invoices');
            if (res.ok) {
              const json = await res.json();
              if (json && json.status === 'success' && Array.isArray(json.data)) {
                currentInvs = json.data;
              }
            }
          }
          if (Array.isArray(currentInvs) && currentInvs.length > 0) {
            let modified = false;
            const updatedInvs = currentInvs.map((inv: any) => {
              if (!inv.items || !Array.isArray(inv.items)) return inv;
              let invMod = false;
              const updatedItems = inv.items.map((it: any) => {
                if (it.remarks && String(it.remarks).includes(oldName)) {
                  invMod = true;
                  return {
                    ...it,
                    remarks: String(it.remarks).replace(`[${oldName}]`, `[${newName}]`).replace(oldName, newName)
                  };
                }
                return it;
              });
              if (invMod) {
                modified = true;
                return { ...inv, items: updatedItems };
              }
              return inv;
            });
            if (modified) {
              await saveGenericKeyToDb('invoices', updatedInvs);
            }
          }
        } catch (err) {
          console.error('Error updating tag name in invoices:', err);
        }
      })();
    }

    setEditingTag(null);
  };

  // Helper to confirm tag deletion
  const handleConfirmDeleteTag = () => {
    if (!tagToDelete) return;
    setTags(prev => prev.filter(t => t.id !== tagToDelete.id && t.name.trim().toLowerCase() !== tagToDelete.name.trim().toLowerCase()));
    setTagToDelete(null);
  };

  // Helper to reorder tags
  const moveTag = (fromIndex: number | null, toIndex: number) => {
    if (fromIndex === null || fromIndex === toIndex) return;
    if (toIndex < 0 || toIndex >= tags.length) return;
    setTags(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  // Helper to calculate invoice item commission
  const calculateInvoiceItemCommission = (item: any) => {
    let itemComm = 0;
    const qty = Number(item.quantity || item.qty) || 1;
    const itemTotal = qty * (item.unitPrice || 0);

    // 1. Check category commission percent from item, warehouse items, or category list
    let catPercent = Number(item.commissionPercent) || 0;

    // Find matching warehouse item if needed
    let matchedWarehouseItem: any = null;
    if (warehouseItems.length > 0) {
      if (item.itemId) {
        matchedWarehouseItem = warehouseItems.find((w: any) => w.id === item.itemId);
      }
      if (!matchedWarehouseItem && item.name) {
        const cleanItemName = String(item.name).trim().toLowerCase();
        matchedWarehouseItem = warehouseItems.find((w: any) => w.name && String(w.name).trim().toLowerCase() === cleanItemName);
      }
    }

    if (!catPercent && matchedWarehouseItem && matchedWarehouseItem.commissionPercent) {
      catPercent = Number(matchedWarehouseItem.commissionPercent) || 0;
    }

    // If catPercent still 0, search categoriesList
    if (!catPercent && categoriesList.length > 0) {
      const itemCatName = (item.categoryName || matchedWarehouseItem?.categoryName || matchedWarehouseItem?.finalCategory || '').trim().toLowerCase();
      const itemParent = (matchedWarehouseItem?.parentCategory || '').trim().toLowerCase();
      const itemSub = (matchedWarehouseItem?.subCategory || '').trim().toLowerCase();
      const itemName = (item.name || matchedWarehouseItem?.name || '').trim().toLowerCase();

      const matchCat = categoriesList.find((c: any) => {
        const cFinal = (c.final || '').trim().toLowerCase();
        const cSub = (c.sub || '').trim().toLowerCase();
        const cParent = (c.parent || '').trim().toLowerCase();

        if (cFinal && itemCatName && cFinal === itemCatName) return true;
        if (cParent && itemParent && cSub && itemSub && cParent === itemParent && cSub === itemSub) return true;
        if (cFinal && itemName && itemName.includes(cFinal)) return true;
        if (cSub && itemName && itemName.includes(cSub)) return true;
        if (cParent && itemName && itemName.includes(cParent)) return true;
        return false;
      });

      if (matchCat && matchCat.commissionPercent) {
        catPercent = Number(matchCat.commissionPercent) || 0;
      }
    }

    if (catPercent > 0) {
      itemComm += (itemTotal * catPercent) / 100;
    }

    // 2. Check remarks for custom tags added
    if (item.remarks) {
      const remarks = String(item.remarks);
      // Deduplicate tags by lowercase name so each tag is evaluated exactly once
      const uniqueTagsMap = new Map<string, CommissionTag>();
      tags.forEach(t => {
        if (t && t.name && t.name.trim()) {
          uniqueTagsMap.set(t.name.trim().toLowerCase(), t);
        }
      });

      uniqueTagsMap.forEach(t => {
        if (remarks.includes(`[${t.name}]`) || remarks.includes(t.name)) {
          if (t.type === 'percent') {
            itemComm += (itemTotal * t.value) / 100;
          } else {
            itemComm += qty * t.value;
          }
        }
      });
    }

    return itemComm;
  };

  // Process sales invoices
  const processedInvoices = useMemo(() => {
    // Filter sale type invoices
    const saleInvoices = invoices.filter(inv => !inv.isDeleted && (inv.type === 'sale' || inv.type === 'billing_sale'));

    return saleInvoices.map(inv => {
      const sellerName = inv.sellerName || inv.createdBy || 'پرسنل تعریف نشده';
      const invDateNormalized = normalizeDate(inv.date || '');

      // Calculate total commission for invoice
      let invoiceComm = 0;
      if (inv.items && Array.isArray(inv.items)) {
        inv.items.forEach(it => {
          invoiceComm += calculateInvoiceItemCommission(it);
        });
      }

      // Calculate excess commission from Category Quantity Commission Rules
      if (categoryQuantityRules && categoryQuantityRules.length > 0 && inv.items && Array.isArray(inv.items)) {
        categoryQuantityRules.forEach((rule: any) => {
          if (!rule.selectedCategories || !Array.isArray(rule.selectedCategories) || rule.selectedCategories.length === 0) return;
          const threshold = Number(rule.thresholdQuantity) || 0;
          const excessCommPerItem = Number(rule.excessCommissionPerItem) || 0;
          if (excessCommPerItem <= 0) return;

          let totalQtyInCategories = 0;

          inv.items.forEach((it: any) => {
            let matchedWItem: any = null;
            if (it.itemId) {
              matchedWItem = warehouseItems.find((w: any) => w.id === it.itemId);
            }
            if (!matchedWItem && it.name) {
              const cleanName = String(it.name).trim().toLowerCase();
              matchedWItem = warehouseItems.find((w: any) => w.name && String(w.name).trim().toLowerCase() === cleanName);
            }

            const itemFinalCat = (it.categoryName || matchedWItem?.categoryName || matchedWItem?.finalCategory || '').trim().toLowerCase();
            const itemParentCat = (matchedWItem?.parentCategory || '').trim().toLowerCase();
            const itemSubCat = (matchedWItem?.subCategory || '').trim().toLowerCase();
            const itemName = (it.name || matchedWItem?.name || '').trim().toLowerCase();

            const isMatch = rule.selectedCategories.some((sc: string) => {
              const c = (sc || '').trim().toLowerCase();
              if (!c) return false;
              if (itemFinalCat && itemFinalCat === c) return true;
              if (itemParentCat && itemParentCat === c) return true;
              if (itemSubCat && itemSubCat === c) return true;
              if (itemName && itemName.includes(c)) return true;
              return false;
            });

            if (isMatch) {
              totalQtyInCategories += (Number(it.qty) || 1);
            }
          });

          if (totalQtyInCategories > threshold) {
            const excessQty = totalQtyInCategories - threshold;
            invoiceComm += excessQty * excessCommPerItem;
          }
        });
      }

      // Add fixed invoice commission (uses custom override if explicitly set for invoice, otherwise default globalFixedInvoiceComm)
      const globalAmt = parseFloat(globalFixedInvoiceComm) || 0;
      const customOverride = fixedInvoiceCommissions[inv.id];
      const fixedInvoiceComm = customOverride !== undefined ? Number(customOverride) : globalAmt;
      invoiceComm += fixedInvoiceComm;

      // Add extra fixed commission for urgent / emergency invoices
      const urgentAmt = parseFloat(urgentFixedInvoiceComm) || 0;
      const emergencyAmt = parseFloat(emergencyFixedInvoiceComm) || 0;
      let urgentExtraComm = 0;
      if (inv.urgentType === 'emergency') {
        urgentExtraComm = emergencyAmt;
      } else if (inv.urgentType === 'urgent' || (inv.isUrgent && !inv.urgentType)) {
        urgentExtraComm = urgentAmt;
      }
      invoiceComm += urgentExtraComm;

      // Add extra fixed commission for selected Shipping Method
      let shippingMethodExtraComm = 0;
      if (inv.shippingMethod) {
        const matchedSM = shippingMethods.find(sm => sm.id === inv.shippingMethod || sm.name === inv.shippingMethod);
        if (matchedSM) {
          const commVal = shippingMethodCommissions[matchedSM.id] || shippingMethodCommissions[matchedSM.name];
          shippingMethodExtraComm = parseFloat(commVal || '0') || 0;
        } else {
          const commVal = shippingMethodCommissions[inv.shippingMethod];
          shippingMethodExtraComm = parseFloat(commVal || '0') || 0;
        }
      }
      invoiceComm += shippingMethodExtraComm;

      // Check settlement history
      const invSettlements = settlements.filter(s => s.invoiceId === inv.id);
      const totalPaid = invSettlements.reduce((sum, s) => sum + (s.paidAmount || 0), 0);

      let status: 'unpaid' | 'partial' | 'paid' = 'unpaid';
      if (totalPaid >= invoiceComm && invoiceComm > 0) {
        status = 'paid';
      } else if (totalPaid > 0) {
        status = 'partial';
      }

      return {
        ...inv,
        sellerName,
        invDateNormalized,
        fixedInvoiceComm,
        totalCommission: Math.round(invoiceComm),
        paidCommission: Math.round(totalPaid),
        remainingCommission: Math.max(0, Math.round(invoiceComm - totalPaid)),
        settlementStatus: status,
        settlementHistory: invSettlements
      };
    });
  }, [invoices, categoriesList, warehouseItems, categoryQuantityRules, tags, settlements, fixedInvoiceCommissions, globalFixedInvoiceComm, urgentFixedInvoiceComm, emergencyFixedInvoiceComm, shippingMethods, shippingMethodCommissions]);

  // Apply search and filters
  const filteredInvoices = useMemo(() => {
    return processedInvoices.filter(inv => {
      // Filter by Seller
      if (selectedSeller !== 'all' && inv.sellerName !== selectedSeller) {
        return false;
      }

      // Filter by Settlement Status
      if (settlementFilter !== 'all' && inv.settlementStatus !== settlementFilter) {
        return false;
      }

      // Filter by Date Range
      if (startDate && inv.invDateNormalized && inv.invDateNormalized < normalizeDate(startDate)) {
        return false;
      }
      if (endDate && inv.invDateNormalized && inv.invDateNormalized > normalizeDate(endDate)) {
        return false;
      }

      // Filter by Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchNo = (inv.invoiceNumber || '').toLowerCase().includes(q);
        const matchCustomer = (inv.customerName || '').toLowerCase().includes(q);
        const matchSeller = (inv.sellerName || '').toLowerCase().includes(q);
        if (!matchNo && !matchCustomer && !matchSeller) return false;
      }

      return true;
    });
  }, [processedInvoices, selectedSeller, settlementFilter, startDate, endDate, searchQuery]);

  // Unique Sellers list for dropdown filter
  const sellerOptions = useMemo(() => {
    const list = new Set<string>();
    processedInvoices.forEach(inv => {
      if (inv.sellerName) list.add(inv.sellerName);
    });
    users.forEach(u => {
      if (u.name) list.add(u.name);
    });
    return Array.from(list);
  }, [processedInvoices, users]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalComm = 0;
    let totalPaid = 0;
    let totalUnpaid = 0;
    let countPaid = 0;
    let countPartial = 0;
    let countUnpaid = 0;

    filteredInvoices.forEach(inv => {
      totalComm += inv.totalCommission;
      totalPaid += inv.paidCommission;
      if (inv.settlementStatus === 'paid') countPaid++;
      else if (inv.settlementStatus === 'partial') countPartial++;
      else countUnpaid++;
    });

    totalUnpaid = Math.max(0, totalComm - totalPaid);

    return {
      totalComm,
      totalPaid,
      totalUnpaid,
      countPaid,
      countPartial,
      countUnpaid,
      totalCount: filteredInvoices.length
    };
  }, [filteredInvoices]);

  // Handle Save Settlement
  const handleSaveSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleModalInvoice) return;
    const amt = parseFloat(settleAmount) || 0;
    if (amt <= 0) {
      alert('لطفاً مبلغ پرداختی پورسانت را وارد نمایید.');
      return;
    }

    const newPaidTotal = settleModalInvoice.currentPaid + amt;
    let newStatus: 'unpaid' | 'partial' | 'paid' = 'partial';
    if (newPaidTotal >= settleModalInvoice.totalCommission) {
      newStatus = 'paid';
    }

    const record: CommissionSettlement = {
      id: Date.now().toString(),
      invoiceId: settleModalInvoice.invoiceId,
      invoiceNumber: settleModalInvoice.invoiceNumber,
      sellerName: settleModalInvoice.sellerName,
      paidAmount: amt,
      status: newStatus,
      notes: settleNote.trim(),
      settledAt: getTodayJalali(),
      settledBy: currentUser?.name || 'حسابدار'
    };

    setSettlements(prev => [...prev, record]);
    setSettleModalInvoice(null);
    setSettleAmount('');
    setSettleNote('');
  };

  return (
    <div className="space-y-6 pb-24 text-slate-800 dark:text-slate-100 dir-rtl">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white p-6 rounded-2xl shadow-lg gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3.5 bg-white/10 rounded-2xl backdrop-blur-md">
            <Wallet className="w-8 h-8 text-amber-200" />
          </div>
          <div>
            <h1 className="text-2xl font-black">گزارش و محاسبه پورسانت پرسنل</h1>
            <p className="text-xs text-amber-100 font-medium mt-1">
              محاسبه هوشمند پورسانت بر اساس درصد دسته‌بندی کالا، تگ‌های اختصاصی، وضعیت تسویه و بیعانه پرسنل
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsTagDrawerOpen(!isTagDrawerOpen)}
          className="flex items-center gap-2 px-5 py-2.5 bg-white/15 hover:bg-white/25 rounded-xl text-xs font-black transition-all border border-white/20 shadow-sm cursor-pointer shrink-0"
        >
          <Tag className="w-4 h-4 text-amber-200" />
          <span>{isTagDrawerOpen ? 'بستن کشوی تعریف تگ پورسانت' : 'تعریف و مدیریت تگ پورسانت جدید'}</span>
          {isTagDrawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Overview Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Commission */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold">کل پورسانت محاسبه‌شده</span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/50 rounded-xl text-amber-600 dark:text-amber-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400">
            {formatCurrency(metrics.totalComm)}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            تعداد کل فاکتورها: {toPersianDigits(metrics.totalCount)} عدد
          </div>
        </div>

        {/* Total Settled */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold">پورسانت‌های تسویه‌شده</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
            {formatCurrency(metrics.totalPaid)}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            فاکتورهای تسویه کامل: {toPersianDigits(metrics.countPaid)} عدد
          </div>
        </div>

        {/* Total Unpaid Balance */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold">مانده پورسانت پرداختی</span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/50 rounded-xl text-rose-600 dark:text-rose-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">
            {formatCurrency(metrics.totalUnpaid)}
          </div>
          <div className="text-[11px] text-rose-500 dark:text-rose-400 font-medium">
            بدون پرداخت / دارای ماندگار: {toPersianDigits(metrics.countUnpaid + metrics.countPartial)} فاکتور
          </div>
        </div>

        {/* Partial Payments Summary */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold">پرداخت بیعانه / علی‌الحساب</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-xl text-blue-600 dark:text-blue-400">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-400">
            {toPersianDigits(metrics.countPartial)} <span className="text-xs font-normal text-slate-500">فاکتور بیعانه‌دار</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium">
            پرداخت‌های مرحله‌ای و اقساطی پورسانت
          </div>
        </div>
      </div>

      {/* Filters and Controls Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-extrabold text-sm border-b border-slate-100 dark:border-slate-800 pb-3">
          <Filter className="w-4 h-4 text-amber-500" />
          <span>فیلترها و ابزارهای جستجوی پورسانت</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs font-semibold">
          {/* Seller Filter */}
          <div className="space-y-1">
            <label className="text-slate-600 dark:text-slate-400 block">انتخاب پرسنل / فروشنده</label>
            <select
              value={selectedSeller}
              onChange={(e) => setSelectedSeller(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">همه پرسنل و فروشندگان</option>
              {sellerOptions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Settlement Status Filter */}
          <div className="space-y-1">
            <label className="text-slate-600 dark:text-slate-400 block">وضعیت تسویه پورسانت</label>
            <select
              value={settlementFilter}
              onChange={(e) => setSettlementFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="unpaid">تسویه نشده (پرداخت نشده)</option>
              <option value="partial">پرداخت بیعانه / مرحله‌ای</option>
              <option value="paid">تسویه شده کامل</option>
            </select>
          </div>

          {/* Start Date */}
          <div className="space-y-1">
            <label className="text-slate-600 dark:text-slate-400 block">از تاریخ فاکتور</label>
            <JalaliDatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="از تاریخ..."
            />
          </div>

          {/* End Date */}
          <div className="space-y-1">
            <label className="text-slate-600 dark:text-slate-400 block">تا تاریخ فاکتور</label>
            <JalaliDatePicker
              value={endDate}
              onChange={setEndDate}
              placeholder="تا تاریخ..."
            />
          </div>

          {/* Search Input */}
          <div className="space-y-1">
            <label className="text-slate-600 dark:text-slate-400 block">جستجوی سریع</label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="شماره فاکتور، خریدار..."
                className="w-full pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Table: Invoices & Commissions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-amber-600" />
            <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
              جدول صورتحساب پورسانت پرسنل ({toPersianDigits(filteredInvoices.length)} فاکتور)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">شماره فاکتور</th>
                <th className="p-3.5">تاریخ</th>
                <th className="p-3.5">پرسنل / فروشنده</th>
                <th className="p-3.5">خریدار</th>
                <th className="p-3.5 text-left">مبلغ کل فاکتور</th>
                <th className="p-3.5 text-left">پورسانت محاسبه‌شده</th>
                <th className="p-3.5 text-left">پرداختی / بیعانه</th>
                <th className="p-3.5 text-left">مانده</th>
                <th className="p-3.5 text-center">وضعیت تسویه</th>
                <th className="p-3.5 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400 font-bold">
                    هیچ فاکتور فروش یا پورسانتی با مشخصات فیلترشده یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-950/40 transition-colors">
                    <td className="p-3.5 font-black text-amber-700 dark:text-amber-400">
                      {toPersianDigits(inv.invoiceNumber)}
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">
                      {toPersianDigits(inv.date)}
                    </td>
                    <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                        <span>{inv.sellerName}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">
                      {inv.customerName || 'خریدار عادی'}
                    </td>
                    <td className="p-3.5 text-left font-bold text-slate-700 dark:text-slate-300">
                      {formatCurrency(inv.totalAmount)}
                    </td>
                    <td className="p-3.5 text-left font-black text-amber-600 dark:text-amber-400">
                      <div className="flex items-center justify-start gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedDetailInvoice(inv)}
                          className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/70 hover:bg-amber-100 dark:hover:bg-amber-900/80 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800 transition-all cursor-pointer shadow-2xs shrink-0"
                          title="مشاهده جزئیات دقیق محاسبات پورسانت"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                        </button>
                        <span>{formatCurrency(inv.totalCommission)}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-left font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(inv.paidCommission)}
                    </td>
                    <td className="p-3.5 text-left font-bold text-rose-600 dark:text-rose-400">
                      {formatCurrency(inv.remainingCommission)}
                    </td>
                    <td className="p-3.5 text-center">
                      {inv.settlementStatus === 'paid' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[11px] font-black">
                          <CheckCircle2 className="w-3 h-3" />
                          تسویه کامل
                        </span>
                      ) : inv.settlementStatus === 'partial' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-[11px] font-black">
                          <Receipt className="w-3 h-3" />
                          پرداخت بیعانه
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-[11px] font-black">
                          <Clock className="w-3 h-3" />
                          تسویه نشده
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSettleModalInvoice({
                            invoiceId: inv.id,
                            invoiceNumber: inv.invoiceNumber,
                            sellerName: inv.sellerName,
                            totalCommission: inv.totalCommission,
                            currentPaid: inv.paidCommission
                          });
                          setSettleAmount(String(inv.remainingCommission));
                        }}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-[11px] cursor-pointer shadow-sm transition-all inline-flex items-center gap-1"
                      >
                        <Wallet className="w-3 h-3" />
                        <span>ثبت تسویه / بیعانه</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Independent Sliding Drawer for Tag Definitions (پنجره کشویی تعریف تگ پورسانت جدید) */}
      <div className="bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/60 rounded-2xl shadow-md overflow-hidden transition-all duration-300">
        <div
          onClick={() => setIsTagDrawerOpen(!isTagDrawerOpen)}
          className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent flex items-center justify-between cursor-pointer select-none border-b border-amber-100 dark:border-amber-900/40"
        >
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-amber-600" />
            <span className="font-black text-sm text-slate-800 dark:text-slate-100">
              پنجره تعریف و مدیریت تگ‌های پورسانت (کشویی مجزا)
            </span>
            <span className="text-xs text-amber-700 dark:text-amber-400 font-bold bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
              {toPersianDigits(tags.length)} تگ فعال
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400">
            <span>{isTagDrawerOpen ? 'بستن کشو' : 'باز کردن کشو'}</span>
            {isTagDrawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {isTagDrawerOpen && (
          <div className="p-6 space-y-6">
            {/* Form for new Tag */}
            <form onSubmit={handleAddTag} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-extrabold text-amber-700 dark:text-amber-400 border-b border-slate-200 dark:border-slate-800 pb-2">
                <Plus className="w-4 h-4" />
                <span>تعریف تگ پورسانت جدید (ثابت یا درصدی)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-semibold">
                {/* Tag Name */}
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 block">عنوان تگ پورسانت</label>
                  <input
                    type="text"
                    required
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="مثال: پورسانت ویژه فروش"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Tag Type */}
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 block">نوع محاسبه</label>
                  <select
                    value={newTagType}
                    onChange={(e) => setNewTagType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="percent">درصدی (%)</option>
                    <option value="fixed">مبلغ ثابت ({currencyLabel})</option>
                  </select>
                </div>

                {/* Value */}
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 block">
                    {newTagType === 'percent' ? 'درصد پورسانت (%)' : `مبلغ پورسانت (${currencyLabel})`}
                  </label>
                  <input
                    type="number"
                    step={newTagType === 'percent' ? '0.5' : '1000'}
                    min="0"
                    required
                    value={newTagValue}
                    onChange={(e) => setNewTagValue(e.target.value)}
                    placeholder={newTagType === 'percent' ? 'مثال: 5' : 'مثال: 50000'}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 block">توضیحات و ملاحظات</label>
                  <input
                    type="text"
                    value={newTagDesc}
                    onChange={(e) => setNewTagDesc(e.target.value)}
                    placeholder="توضیح اختیاری..."
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-sm cursor-pointer transition-all inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>ثبت تگ پورسانت جدید</span>
                </button>
              </div>
            </form>

            {/* List of Defined Tags */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="font-extrabold text-xs text-slate-700 dark:text-slate-200 block">
                  لیست تگ‌های پورسانت فعال سیستم:
                </span>
                <span className="text-[11px] text-amber-700 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-900/40 inline-flex items-center gap-1 w-fit">
                  <GripVertical className="w-3 h-3 text-amber-500" />
                  <span>قابلیت جابه‌جایی و تعیین اولویت با کشیدن و رها کردن (Drag & Drop)</span>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {tags.map((t, idx) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => setDraggedTagIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      moveTag(draggedTagIndex, idx);
                      setDraggedTagIndex(null);
                    }}
                    className={`bg-slate-50 dark:bg-slate-950 border ${
                      draggedTagIndex === idx ? 'border-amber-500 ring-2 ring-amber-500/40' : 'border-slate-200 dark:border-slate-800'
                    } rounded-xl p-3 flex items-start justify-between gap-2 shadow-xs hover:border-amber-300 dark:hover:border-amber-800 transition-all select-none`}
                  >
                    {/* Left/Start side: Drag grip + Details */}
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <div
                        className="pt-0.5 text-slate-400 cursor-grab active:cursor-grabbing hover:text-amber-600 dark:hover:text-amber-400 transition-colors shrink-0"
                        title="جهت جابه‌جایی و تغییر اولویت تگ، این آیکون را بکشید"
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Tag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="font-black text-xs text-slate-800 dark:text-slate-100 truncate">{t.name}</span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                            t.type === 'percent'
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                          }`}>
                            {t.type === 'percent' ? `%${toPersianDigits(t.value)}` : formatCurrency(t.value)}
                          </span>
                        </div>
                        {t.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">{t.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Action Controls: Up/Down, Edit, Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveTag(idx, idx - 1)}
                          className="p-0.5 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer transition-colors"
                          title="انتقال به بالا"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === tags.length - 1}
                          onClick={() => moveTag(idx, idx + 1)}
                          className="p-0.5 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer transition-colors"
                          title="انتقال به پایین"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenEditTag(t)}
                        className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-100/60 dark:text-slate-300 dark:hover:text-amber-400 dark:hover:bg-amber-950/60 rounded-lg cursor-pointer transition-colors"
                        title="ویرایش تگ"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setTagToDelete(t)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer transition-colors"
                        title="حذف تگ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Streamlined Menu: Fixed Base & Urgent/Emergency Commission Per Invoice */}
      <div className="bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/60 rounded-2xl shadow-md overflow-hidden transition-all duration-300">
        <div
          onClick={() => setIsFixedCommDrawerOpen(!isFixedCommDrawerOpen)}
          className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent flex items-center justify-between cursor-pointer select-none border-b border-amber-100 dark:border-amber-900/40"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Calculator className="w-5 h-5 text-amber-600" />
            <span className="font-black text-sm text-slate-800 dark:text-slate-100">
              تعیین مبلغ پورسانت ثابت عمومی (پایه / فوری / اورژانسی)
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-amber-800 dark:text-amber-300 font-bold bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                پایه: {formatCurrency(parseFloat(globalFixedInvoiceComm) || 0)}
              </span>
              <span className="text-[11px] text-amber-800 dark:text-amber-300 font-bold bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                فوری: +{formatCurrency(parseFloat(urgentFixedInvoiceComm) || 0)}
              </span>
              <span className="text-[11px] text-rose-800 dark:text-rose-300 font-bold bg-rose-100 dark:bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                اورژانسی: +{formatCurrency(parseFloat(emergencyFixedInvoiceComm) || 0)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400">
            <span>{isFixedCommDrawerOpen ? 'بستن منو' : 'باز کردن منو'}</span>
            {isFixedCommDrawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {isFixedCommDrawerOpen && (
          <div className="p-6">
            {/* Primary Setting Card */}
            <div className="bg-gradient-to-br from-amber-50/80 to-orange-50/40 dark:from-amber-950/40 dark:to-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="border-b border-amber-200/60 dark:border-amber-900/40 pb-3 space-y-1">
                <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 block">
                  تعیین مبالغ پورسانت ثابت عمومی برای فاکتورها، فوری و اورژانسی
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                  با تعیین مبالغ زیر، مبالغ ثابت به صورت خودکار به محاسبه پورسانت نهایی پرسنل اضافه می‌گردند. انتخاب گزینه‌های «فوری» یا «اورژانسی» در فاکتور جدید، مبلغ ثابت مربوطه را به پورسانت نهایی آن فاکتور خواهد افزود.
                </p>
              </div>

              {/* Input Controls Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                {/* General Base Fixed Commission */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block flex items-center gap-1">
                    <Calculator className="w-3.5 h-3.5 text-amber-600" />
                    <span>پورسانت ثابت عمومی هر فاکتور ({currencyLabel})</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={globalFixedInvoiceComm}
                      onChange={(e) => setGlobalFixedInvoiceComm(e.target.value)}
                      placeholder="0"
                      className="w-full pl-16 pr-3 py-2.5 bg-white dark:bg-slate-900 border-2 border-amber-400 dark:border-amber-700 rounded-xl text-sm font-black text-amber-800 dark:text-amber-300 focus:ring-2 focus:ring-amber-500 shadow-inner dir-ltr text-right"
                    />
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 select-none">
                      {currencyLabel}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">ثابت عمومی بابت تمامی فاکتورها</span>
                </div>

                {/* Urgent Fixed Commission */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-500 dark:text-slate-400 block flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 opacity-60" />
                      <span>مبلغ ثابت فاکتور فوری ({currencyLabel})</span>
                    </div>
                    <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-black px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                      <Lock className="w-2.5 h-2.5" />
                      <span>قفل شده</span>
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={urgentFixedInvoiceComm}
                      onChange={(e) => setUrgentFixedInvoiceComm(e.target.value)}
                      placeholder="0"
                      disabled
                      className="w-full pl-16 pr-3 py-2.5 bg-slate-100/70 dark:bg-slate-900/40 border-2 border-slate-300 dark:border-slate-800 rounded-xl text-sm font-black text-slate-400 dark:text-slate-500 shadow-inner dir-ltr text-right cursor-not-allowed"
                    />
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 select-none">
                      {currencyLabel}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block">غیرفعال موقت در سیستم</span>
                </div>

                {/* Emergency Fixed Commission */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-500 dark:text-slate-400 block flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 opacity-60" />
                      <span>مبلغ ثابت فاکتور اورژانسی ({currencyLabel})</span>
                    </div>
                    <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-black px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                      <Lock className="w-2.5 h-2.5" />
                      <span>قفل شده</span>
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={emergencyFixedInvoiceComm}
                      onChange={(e) => setEmergencyFixedInvoiceComm(e.target.value)}
                      placeholder="0"
                      disabled
                      className="w-full pl-16 pr-3 py-2.5 bg-slate-100/70 dark:bg-slate-900/40 border-2 border-slate-300 dark:border-slate-800 rounded-xl text-sm font-black text-slate-400 dark:text-slate-500 shadow-inner dir-ltr text-right cursor-not-allowed"
                    />
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 select-none">
                      {currencyLabel}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block">غیرفعال موقت در سیستم</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Streamlined Collapsible Drawer: Shipping Methods & Fixed Commission */}
      <div className="bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/60 rounded-2xl shadow-md overflow-hidden transition-all duration-300">
        <div
          onClick={() => setIsShippingMethodsDrawerOpen(!isShippingMethodsDrawerOpen)}
          className="p-4 bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent flex items-center justify-between cursor-pointer select-none border-b border-blue-100 dark:border-blue-900/40"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Truck className="w-5 h-5 text-blue-600" />
            <span className="font-black text-sm text-slate-800 dark:text-slate-100">
              پورسانت ثابت روش‌های ارسال (فراخوانی‌شده از تنظیمات سیستم)
            </span>
            <span className="text-[11px] text-blue-800 dark:text-blue-300 font-bold bg-blue-100 dark:bg-blue-950/60 px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 flex items-center gap-1">
              {toPersianDigits(shippingMethods.length)} روش ارسال فعال
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400">
            <span>{isShippingMethodsDrawerOpen ? 'بستن کشو' : 'باز کردن کشو'}</span>
            {isShippingMethodsDrawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {isShippingMethodsDrawerOpen && (
          <div className="p-6 space-y-4">
            {/* Helper Banner */}
            <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-2xl p-4 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
              <div className="flex items-center gap-2 font-black text-blue-900 dark:text-blue-200">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>راهنمای مشاهده روش‌های ارسال و تعیین پورسانت ثابت:</span>
              </div>
              <p className="leading-relaxed text-slate-600 dark:text-slate-400 font-medium">
                اطلاعات «نام» و «تصویر/آیکون» روش‌های ارسال در زیر صرفاً جهت مشاهده از بخش تنظیمات سیستم فراخوانی شده‌اند (غیرقابل ویرایش مستقیم از این بخش). شما می‌توانید برای هر روش ارسال، یک مبلغ پورسانت ثابت تعیین نمایید. با انتخاب آن روش در فاکتور جدید، این مبلغ به پورسانت محاسبه‌شده اضافه می‌گردد.
              </p>
            </div>

            {/* Shipping Methods Grid */}
            {shippingMethods.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 font-bold bg-slate-50 dark:bg-slate-950 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                هیچ روش ارسالی در تنظیمات سیستم یافت نشد.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {shippingMethods.map((method) => {
                  const currentCommVal = shippingMethodCommissions[method.id] !== undefined 
                    ? shippingMethodCommissions[method.id] 
                    : (shippingMethodCommissions[method.name] || '0');
                  const numericCommVal = parseFloat(currentCommVal) || 0;

                  return (
                    <div
                      key={method.id}
                      className="bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-2xs hover:border-blue-300 dark:hover:border-blue-800 transition-all"
                    >
                      {/* Read-Only Header: Name + Image */}
                      <div className="flex items-center gap-3">
                        {method.iconData ? (
                          <img
                            src={method.iconData}
                            alt={method.name}
                            className="w-11 h-11 object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shrink-0 shadow-2xs"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 font-bold">
                            <Truck className="w-5 h-5" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate">
                              {method.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium px-1.5 py-0.5 bg-slate-200/60 dark:bg-slate-800 rounded select-none shrink-0">
                              صرفاً جهت مشاهده
                            </span>
                          </div>
                          {method.note && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {method.note}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Editable Field: Fixed Commission Amount */}
                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block flex items-center justify-between">
                          <span>مبلغ پورسانت ثابت این روش:</span>
                          {numericCommVal > 0 && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold">
                              +{formatCurrency(numericCommVal)}
                            </span>
                          )}
                        </label>

                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={currentCommVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setShippingMethodCommissions((prev) => ({
                                ...prev,
                                [method.id]: val,
                                [method.name]: val,
                              }));
                            }}
                            placeholder="0"
                            className="w-full pl-16 pr-3 py-2 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500 rounded-xl text-xs font-black text-blue-900 dark:text-blue-200 focus:ring-2 focus:ring-blue-500/20 shadow-inner dir-ltr text-right transition-all"
                          />
                          <span className="absolute left-3 top-2 text-[11px] font-bold text-slate-400 select-none">
                            {currencyLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Record Settlement / Advance Payment */}
      {settleModalInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 dir-rtl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-amber-600" />
                <span className="font-black text-sm text-slate-800 dark:text-slate-100">
                  ثبت تسویه / بیعانه پورسانت
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSettleModalInvoice(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3.5 text-slate-700 dark:text-slate-300">
              <div className="flex justify-between">
                <span>شماره فاکتور:</span>
                <span className="font-extrabold text-amber-700 dark:text-amber-400">{toPersianDigits(settleModalInvoice.invoiceNumber)}</span>
              </div>
              <div className="flex justify-between">
                <span>پرسنل / فروشنده:</span>
                <span className="font-extrabold text-slate-900 dark:text-white">{settleModalInvoice.sellerName}</span>
              </div>
              <div className="flex justify-between">
                <span>کل پورسانت فاکتور:</span>
                <span className="font-extrabold">{formatCurrency(settleModalInvoice.totalCommission)}</span>
              </div>
              <div className="flex justify-between">
                <span>مبلغ پرداختی قبلی:</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{formatCurrency(settleModalInvoice.currentPaid)}</span>
              </div>
            </div>

            <form onSubmit={handleSaveSettlement} className="space-y-4">
              <div className="space-y-1.5 text-xs font-semibold">
                <label className="text-slate-700 dark:text-slate-300 block">مبلغ پرداختی جدید / بیعانه ({currencyLabel})</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  placeholder="مبلغ پرداختی..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-amber-600 dark:text-amber-400 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-1.5 text-xs font-semibold">
                <label className="text-slate-700 dark:text-slate-300 block">توضیحات و بابت پرداخت</label>
                <input
                  type="text"
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                  placeholder="مثال: تسویه کامل / بیعانه مرحله اول..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettleModalInvoice(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-sm transition-all"
                >
                  تأیید و ثبت پرداخت
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Tag Confirmation Modal (پاپ‌آپ تأیید حذف تگ) */}
      {tagToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/80 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 text-rose-600 dark:text-rose-400">
              <div className="p-2 bg-rose-100 dark:bg-rose-950/80 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white block">تأیید حذف تگ پورسانتی</span>
                <span className="text-[11px] text-slate-500 block">اقدام به حذف تگ از سیستم</span>
              </div>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
              آیا از حذف تگ پورسانتی <strong className="text-rose-600 dark:text-rose-400">«{tagToDelete.name}»</strong> اطمینان کامل دارید؟ این عمل غیرقابل بازگشت است.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setTagToDelete(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTag}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold cursor-pointer shadow-sm hover:shadow transition-all"
              >
                تأیید و حذف تگ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tag Modal (پاپ‌آپ ویرایش تگ) */}
      {editingTag && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 rounded-lg">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 block">ویرایش تگ پورسانت</span>
                  <span className="text-[10px] text-slate-500 block">اصلاح اطلاعات و نحوه محاسبه تگ پورسانتی</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTag(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditTag} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-semibold">
                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 block">عنوان تگ پورسانت</label>
                  <input
                    type="text"
                    required
                    value={editTagName}
                    onChange={(e) => setEditTagName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 block">نوع محاسبه</label>
                  <select
                    value={editTagType}
                    onChange={(e) => setEditTagType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="percent">درصدی (%)</option>
                    <option value="fixed">مبلغ ثابت ({currencyLabel})</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 block">
                    {editTagType === 'percent' ? 'درصد پورسانت (%)' : `مبلغ پورسانت (${currencyLabel})`}
                  </label>
                  <input
                    type="number"
                    step={editTagType === 'percent' ? '0.5' : '1000'}
                    min="0"
                    required
                    value={editTagValue}
                    onChange={(e) => setEditTagValue(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-600 dark:text-slate-400 block">توضیحات و ملاحظات</label>
                  <input
                    type="text"
                    value={editTagDesc}
                    onChange={(e) => setEditTagDesc(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-extrabold cursor-pointer shadow-sm transition-all inline-flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>ذخیره تغییرات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Commission Calculation Details Modal (پاپ‌آپ جزئیات دقیق محاسبات پورسانت فاکتور) */}
      {selectedDetailInvoice && detailInvoiceCalculation && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in popup-overlay-global overflow-y-auto" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-5 text-right popup-box-global my-8 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 rounded-xl border border-amber-200 dark:border-amber-800">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-800 dark:text-white flex items-center gap-2">
                    <span>جزئیات دقیق محاسبات پورسانت فاکتور</span>
                    <span className="text-amber-600 dark:text-amber-400">#{toPersianDigits(detailInvoiceCalculation.invoiceNumber)}</span>
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                    <span>فروشنده: <strong className="text-slate-700 dark:text-slate-200">{detailInvoiceCalculation.sellerName}</strong></span>
                    <span>|</span>
                    <span>خریدار: <strong className="text-slate-700 dark:text-slate-200">{detailInvoiceCalculation.customerName}</strong></span>
                    <span>|</span>
                    <span>تاریخ: <strong className="text-slate-700 dark:text-slate-200">{toPersianDigits(detailInvoiceCalculation.date)}</strong></span>
                    <span>|</span>
                    <span>مبلغ کل فاکتور: <strong className="text-slate-700 dark:text-slate-200">{formatCurrency(detailInvoiceCalculation.totalAmount)}</strong></span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailInvoice(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section 1: Item-level Commissions */}
            <div className="space-y-2">
              <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200 block">
                ۱. محاسبات پورسانت کالاها و خدمات فاکتور:
              </span>

              {detailInvoiceCalculation.itemsDetails.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl">
                  هیچ کالا یا خدمتی در این فاکتور ثبت نشده است.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3">نام کالا / خدمت</th>
                        <th className="p-3 text-center">تعداد</th>
                        <th className="p-3 text-left">قیمت واحد</th>
                        <th className="p-3 text-left">جمع کل ردیف</th>
                        <th className="p-3">درصد / تگ پورسانت</th>
                        <th className="p-3 text-left">پورسانت ردیف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {detailInvoiceCalculation.itemsDetails.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20">
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-100">
                            {item.itemName}
                          </td>
                          <td className="p-3 text-center font-bold">
                            {toPersianDigits(item.qty)}
                          </td>
                          <td className="p-3 text-left text-slate-600 dark:text-slate-300">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="p-3 text-left font-bold text-slate-700 dark:text-slate-200">
                            {formatCurrency(item.totalPrice)}
                          </td>
                          <td className="p-3">
                            <div className="space-y-1">
                              {item.catPercent > 0 && (
                                <div className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
                                  <span>درصد دسته‌بندی: %{toPersianDigits(item.catPercent)}</span>
                                  <span>({formatCurrency(item.catCommission)})</span>
                                </div>
                              )}
                              {item.appliedTags.map((tag, tIdx) => (
                                <div key={tIdx} className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded flex items-center gap-1">
                                  <span>تگ {tag.tagName}: {tag.type === 'percent' ? `%${toPersianDigits(tag.value)}` : formatCurrency(tag.value)}</span>
                                  <span>({formatCurrency(tag.commAmount)})</span>
                                </div>
                              ))}
                              {item.catPercent === 0 && item.appliedTags.length === 0 && (
                                <span className="text-[11px] text-slate-400 font-normal">بدون درصد/تگ</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-left font-black text-amber-600 dark:text-amber-400">
                            {formatCurrency(item.itemTotalCommission)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section 2: Category Quantity Excess Commission Rules */}
            {detailInvoiceCalculation.categoryRulesDetails.length > 0 && (
              <div className="space-y-2">
                <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200 block">
                  ۲. پورسانت مازاد تعدادی دسته‌بندی‌ها:
                </span>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3">عنوان قانون</th>
                        <th className="p-3 text-center">تعداد فروش رفته / حد نصاب</th>
                        <th className="p-3 text-center">تعداد مازاد</th>
                        <th className="p-3 text-center">مبلغ پورسانت هر آیتم مازاد</th>
                        <th className="p-3 text-left">جمع پورسانت مازاد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {detailInvoiceCalculation.categoryRulesDetails.map((rule, idx) => (
                        <tr key={idx} className="hover:bg-amber-50/30 dark:hover:bg-amber-950/20">
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-100">
                            {rule.ruleTitle}
                          </td>
                          <td className="p-3 text-center font-bold text-indigo-600 dark:text-indigo-400">
                            {toPersianDigits(rule.totalQty)} از حد {toPersianDigits(rule.thresholdQty)}
                          </td>
                          <td className="p-3 text-center font-black text-rose-600 dark:text-rose-400">
                            {toPersianDigits(rule.excessQty)} عدد مازاد
                          </td>
                          <td className="p-3 text-center font-bold text-slate-700 dark:text-slate-300">
                            {formatCurrency(rule.commissionPerItem)}
                          </td>
                          <td className="p-3 text-left font-black text-amber-600 dark:text-amber-400">
                            {formatCurrency(rule.excessCommissionTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section 3: Fixed Invoice Base Commission */}
            {detailInvoiceCalculation.fixedInvoiceCommission > 0 && (
              <div className="space-y-1 bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-3.5 rounded-xl text-xs flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  ۳. مبلغ پورسانت ثابت پایه فاکتور:
                </span>
                <span className="font-black text-amber-700 dark:text-amber-400 text-sm">
                  {formatCurrency(detailInvoiceCalculation.fixedInvoiceCommission)}
                </span>
              </div>
            )}

            {/* Section 4: Urgent / Emergency Fixed Extra Commission */}
            {detailInvoiceCalculation.urgentExtraComm > 0 && (
              <div className="space-y-1 bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 p-3.5 rounded-xl text-xs flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>۴. پورسانت ثابت فاکتور {detailInvoiceCalculation.urgentTypeLabel}:</span>
                </span>
                <span className="font-black text-rose-700 dark:text-rose-400 text-sm">
                  +{formatCurrency(detailInvoiceCalculation.urgentExtraComm)}
                </span>
              </div>
            )}

            {/* Section 5: Shipping Method Fixed Extra Commission */}
            {detailInvoiceCalculation.shippingMethodExtraComm > 0 && (
              <div className="space-y-1 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 p-3.5 rounded-xl text-xs flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-blue-600" />
                  <span>پورسانت ثابت روش ارسال ({detailInvoiceCalculation.shippingMethodName || 'روش ارسال انتخاب شده'}):</span>
                </span>
                <span className="font-black text-blue-700 dark:text-blue-400 text-sm">
                  +{formatCurrency(detailInvoiceCalculation.shippingMethodExtraComm)}
                </span>
              </div>
            )}

            {/* Modal Footer: Total Summary & Close Button */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-300/80 dark:border-amber-800/80 p-3.5 rounded-xl flex items-center gap-3 w-full sm:w-auto">
                <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                  مجموع کل پورسانت محاسبه‌شده این فاکتور:
                </span>
                <span className="text-base md:text-lg font-black text-amber-700 dark:text-amber-400">
                  {formatCurrency(detailInvoiceCalculation.totalCommission)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDetailInvoice(null)}
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-extrabold rounded-xl text-xs cursor-pointer shadow transition-all flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                <span>بستن</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

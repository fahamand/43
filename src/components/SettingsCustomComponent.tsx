import React, { useState, useEffect } from 'react';
import { User, WebMessenger } from '../types';
import { SlidersHorizontal, Key, Check, Info, ShieldAlert, Palette, Type, HelpCircle, Landmark, Database, Server, Radio, RefreshCw, UploadCloud, CheckCircle2, AlertTriangle, Cpu, Calculator, ClipboardList, Truck, FileText, Printer, RotateCcw, Sparkles, Eye, Layers, X, ChevronDown, ChevronLeft, ChevronUp, LogOut, Image, Trash2, UserCheck, Download, Package, Globe, ExternalLink, Plus, Waves, Leaf, Crown, Sun, Terminal, Gem, Coffee, Compass, Flame, Moon, Shield } from 'lucide-react';
import { getStoredCustomIcons, setStoredCustomIcons, getStoredShippingMethods, setStoredShippingMethods, getStoredAcquaintanceMethods, setStoredAcquaintanceMethods, getStoredSellerName, setStoredSellerName, getStoredSellerRegNo, setStoredSellerRegNo, getStoredSellerAddress, setStoredSellerAddress, getStoredSellerPhone, setStoredSellerPhone, getStoredInvoicePaperSize, setStoredInvoicePaperSize, getStoredSystemCustomFields, setStoredSystemCustomFields, getStoredBackupAutoInterval, setStoredBackupAutoInterval, DEFAULT_CUSTOM_ICONS, DEFAULT_SHIPPING_METHODS, DEFAULT_ACQUAINTANCE_METHODS, DEFAULT_SELLER_NAME, DEFAULT_SELLER_REG_NO, DEFAULT_SELLER_ADDRESS, DEFAULT_SELLER_PHONE, DEFAULT_INVOICE_PAPER_SIZE, DEFAULT_SYSTEM_CUSTOM_FIELDS, DEFAULT_BACKUP_AUTO_INTERVAL, SystemCustomField, getStoredWebMessengers, openWebMessengerPopup, FONTS_LIST, getFontFamilyStack, applySystemFont } from '../utils/defaultData';
import { saveGenericKeyToDb, toPersianDigits } from '../utils/stateManager';
import { uploadSystemUpdateFile } from '../utils/updateHelper';
import { uploadImageFile } from '../utils/uploadHelper';
import { WebMessengerIcon } from './WebMessengerIcon';
import { WebMessengerManagerModal } from './WebMessengerManagerModal';

interface SettingsCustomComponentProps {
  currentUser: User;
  users: User[];
  onUpdateUsersList: (updatedUsers: User[]) => void;
  appFont: string;
  setAppFont: (font: string) => void;
  currencySetting: string;
  setCurrencySetting: (currency: string) => void;
  
  lightDashboardBg: string;
  setLightDashboardBg: (color: string) => void;
  darkDashboardBg: string;
  setDarkDashboardBg: (color: string) => void;
  
  lightPanelBg: string;
  setLightPanelBg: (color: string) => void;
  darkPanelBg: string;
  setDarkPanelBg: (color: string) => void;
  
  lightSidebarBg: string;
  setLightSidebarBg: (color: string) => void;
  darkSidebarBg: string;
  setDarkSidebarBg: (color: string) => void;

  lightPopupBg?: string;
  setLightPopupBg?: (color: string) => void;
  darkPopupBg?: string;
  setDarkPopupBg?: (color: string) => void;
  popupBgOpacity?: string;
  setPopupBgOpacity?: (opacity: string) => void;

  lightPopupOverlay?: string;
  setLightPopupOverlay?: (color: string) => void;
  darkPopupOverlay?: string;
  setDarkPopupOverlay?: (color: string) => void;

  popupOverlayOpacity?: string;
  setPopupOverlayOpacity?: (opacity: string) => void;
  popupBorderRadius?: string;
  setPopupBorderRadius?: (radius: string) => void;
  popupShadow?: string;
  setPopupShadow?: (shadow: string) => void;
  onResetPopupDefaults?: () => void;

  isFloatingCalcVisible: boolean;
  onToggleFloatingCalc: (visible: boolean) => void;
  isProformaTabEnabled?: boolean;
  onToggleProformaTab?: (enabled: boolean) => void;
  onLogout?: () => void;
}

export default function SettingsCustomComponent({
  currentUser,
  users,
  onUpdateUsersList,
  appFont,
  setAppFont,
  currencySetting,
  setCurrencySetting,
  
  lightDashboardBg,
  setLightDashboardBg,
  darkDashboardBg,
  setDarkDashboardBg,
  
  lightPanelBg,
  setLightPanelBg,
  darkPanelBg,
  setDarkPanelBg,
  
  lightSidebarBg,
  setLightSidebarBg,
  darkSidebarBg,
  setDarkSidebarBg,

  lightPopupBg = '#ffffff',
  setLightPopupBg = () => {},
  darkPopupBg = '#1e293b',
  setDarkPopupBg = () => {},
  popupBgOpacity = '100',
  setPopupBgOpacity = () => {},

  lightPopupOverlay = '#0f172a',
  setLightPopupOverlay = () => {},
  darkPopupOverlay = '#0f172a',
  setDarkPopupOverlay = () => {},

  popupOverlayOpacity = '60',
  setPopupOverlayOpacity = () => {},
  popupBorderRadius = '24px',
  setPopupBorderRadius = () => {},
  popupShadow = 'lg',
  setPopupShadow = () => {},
  onResetPopupDefaults = () => {},

  isFloatingCalcVisible,
  onToggleFloatingCalc,
  isProformaTabEnabled = true,
  onToggleProformaTab,
  onLogout
}: SettingsCustomComponentProps) {
  // Helper to check permissions for individual system settings options
  const canAccessSetting = (settingKey: string) => {
    if (currentUser?.role === 'admin') return true;
    const perms = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
    return perms.includes('settings') || perms.includes('settings_all') || perms.includes(settingKey);
  };

  // Collapsible sections state - all sections closed by default
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const expandAllSections = () => {
    setOpenSections({
      font: true,
      currency: true,
      calculator: true,
      proforma: true,
      storage: true,
      dbStatus: true,
      update: true,
      password: true,
      theme: true,
      seller: true,
      paper: true,
      customIcons: true,
      shipping: true,
      acquaintance: true,
    });
  };

  const collapseAllSections = () => {
    setOpenSections({});
  };

  const [showDemoModal, setShowDemoModal] = useState(false);
  const [sellerName, setSellerName] = useState(() => getStoredSellerName());
  const [sellerRegNo, setSellerRegNo] = useState(() => getStoredSellerRegNo());
  const [sellerAddress, setSellerAddress] = useState(() => getStoredSellerAddress());
  const [sellerPhone, setSellerPhone] = useState(() => getStoredSellerPhone());
  const [currentUserPhone, setCurrentUserPhone] = useState(() => currentUser?.phone || '');

  const currentUserId = currentUser?.id || currentUser?.username || 'default';
  const [urgentCheckInterval, setUrgentCheckInterval] = useState<number>(() => {
    const saved = localStorage.getItem(`fahamacc_urgent_proforma_interval_${currentUserId}`) || localStorage.getItem('fahamacc_urgent_proforma_interval');
    return saved ? parseInt(saved, 10) : 10;
  });

  useEffect(() => {
    const uId = currentUser?.id || currentUser?.username || 'default';
    const saved = localStorage.getItem(`fahamacc_urgent_proforma_interval_${uId}`) || localStorage.getItem('fahamacc_urgent_proforma_interval');
    setUrgentCheckInterval(saved ? parseInt(saved, 10) : 10);
  }, [currentUser?.id, currentUser?.username]);

  const handleUrgentIntervalChange = (newMins: number) => {
    setUrgentCheckInterval(newMins);
    const uId = currentUser?.id || currentUser?.username || 'default';
    localStorage.setItem(`fahamacc_urgent_proforma_interval_${uId}`, newMins.toString());
    localStorage.setItem('fahamacc_urgent_proforma_interval', newMins.toString());
    saveGenericKeyToDb(`fahamacc_urgent_proforma_interval_${uId}`, newMins);
    saveGenericKeyToDb('fahamacc_urgent_proforma_interval', newMins);
    window.dispatchEvent(new CustomEvent('urgent-interval-updated', {
      detail: { userId: uId, interval: newMins }
    }));
  };

  React.useEffect(() => {
    setCurrentUserPhone(currentUser?.phone || '');
  }, [currentUser?.phone]);
  const [invoicePaperSize, setInvoicePaperSize] = useState(() => getStoredInvoicePaperSize());
  const [paperBgImages, setPaperBgImages] = useState<Record<string, string>>(() => ({
    A4_portrait: localStorage.getItem('acc_invoice_bg_image_A4_portrait') || '',
    A4_landscape: localStorage.getItem('acc_invoice_bg_image_A4_landscape') || '',
    A5_portrait: localStorage.getItem('acc_invoice_bg_image_A5_portrait') || '',
    A5_landscape: localStorage.getItem('acc_invoice_bg_image_A5_landscape') || '',
  }));

  const handlePaperSizeChange = async (newSize: string) => {
    try {
      const ok = await saveGenericKeyToDb('acc_invoice_paper_size', newSize);
      if (ok) {
        setStoredInvoicePaperSize(newSize);
        setInvoicePaperSize(newSize);
        window.dispatchEvent(new CustomEvent('invoice-paper-size-updated', { detail: newSize }));
        window.dispatchEvent(new CustomEvent('paper-size-changed', { detail: { paperSize: newSize } }));
      }
    } catch (err) {
      console.error('Error saving invoice paper size to DB:', err);
    }
  };

  const handlePaperBgImageUpload = async (paperId: string, file: File) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert('حجم تصویر بیشتر از ۱۵ مگابایت است. لطفاً تصویر کم‌حجم‌تری انتخاب بفرمایید.');
      return;
    }
    try {
      const res = await uploadImageFile(file, `invoice_bg_${paperId}`);
      const bgUrl = res.url || res.relativePath;
      if (bgUrl) {
        localStorage.setItem(`acc_invoice_bg_image_${paperId}`, bgUrl);
        setPaperBgImages(prev => ({ ...prev, [paperId]: bgUrl }));
        window.dispatchEvent(new CustomEvent('paper-bg-image-changed', {
          detail: { paperId, bgUrl }
        }));
      }
    } catch (err: any) {
      console.error('Error uploading paper background image:', err);
      // Fallback to local data url if offline/network error
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        if (base64) {
          localStorage.setItem(`acc_invoice_bg_image_${paperId}`, base64);
          setPaperBgImages(prev => ({ ...prev, [paperId]: base64 }));
          window.dispatchEvent(new CustomEvent('paper-bg-image-changed', {
            detail: { paperId, bgUrl: base64 }
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePaperBgImage = (paperId: string) => {
    localStorage.removeItem(`acc_invoice_bg_image_${paperId}`);
    setPaperBgImages(prev => ({ ...prev, [paperId]: '' }));
    window.dispatchEvent(new CustomEvent('paper-bg-image-changed', {
      detail: { paperId, bgUrl: '' }
    }));
  };

  const [themeSavedToast, setThemeSavedToast] = useState(false);
  const [isUnifiedThemesOpen, setIsUnifiedThemesOpen] = useState(true);

  const saveThemeVal = (key: string, val: string) => {
    try {
      localStorage.setItem(`acc_app_${key}`, val);
      if (currentUser?.id) {
        localStorage.setItem(`acc_app_${currentUser.id}_${key}`, val);
      }
      saveGenericKeyToDb(`acc_app_${key}`, val);
      if (currentUser?.id) {
        saveGenericKeyToDb(`acc_app_${currentUser.id}_${key}`, val);
      }
      window.dispatchEvent(new CustomEvent('app-theme-changed', {
        detail: { key, val }
      }));
      setThemeSavedToast(true);
      setTimeout(() => setThemeSavedToast(false), 3000);
    } catch (e) {
      console.error('Error saving theme val:', e);
    }
  };

  // Custom System Icons state
  const [customIcons, setCustomIcons] = useState<{ id: string; name: string; iconData: string }[]>(() => getStoredCustomIcons());

  // Custom Shipping Methods state
  const [shippingMethods, setShippingMethods] = useState<{ id: string; name: string; iconData: string; note?: string }[]>(() => getStoredShippingMethods());

  // Custom Acquaintance Methods state
  const [acquaintanceMethods, setAcquaintanceMethods] = useState<{ id: string; name: string; iconData: string }[]>(() => getStoredAcquaintanceMethods());

  // Web Messengers state & Modal state
  const [messengersList, setMessengersList] = useState<WebMessenger[]>(() => getStoredWebMessengers());
  const [isMessengerModalOpen, setIsMessengerModalOpen] = useState(false);

  // Custom System Fields state
  const [customFields, setCustomFields] = useState<SystemCustomField[]>(() => getStoredSystemCustomFields());

  // Backup Auto Interval state
  const [backupAutoInterval, setBackupAutoInterval] = useState<string>(() => getStoredBackupAutoInterval());

  // Ensure items are synced if empty or cleared and listen for global updates
  useEffect(() => {
    if (!customIcons || customIcons.length === 0) {
      setCustomIcons(getStoredCustomIcons());
    }
    if (!shippingMethods || shippingMethods.length === 0) {
      setShippingMethods(getStoredShippingMethods());
    }
    if (!acquaintanceMethods || acquaintanceMethods.length === 0) {
      setAcquaintanceMethods(getStoredAcquaintanceMethods());
    }
    if (!messengersList || messengersList.length === 0) {
      setMessengersList(getStoredWebMessengers());
    }
    if (!customFields || customFields.length === 0) {
      setCustomFields(getStoredSystemCustomFields());
    }
    if (!backupAutoInterval) {
      setBackupAutoInterval(getStoredBackupAutoInterval());
    }

    const handleCustomFieldsUpdate = (e?: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setCustomFields(e.detail);
      } else {
        setCustomFields(getStoredSystemCustomFields());
      }
    };
    const handleBackupIntervalUpdate = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setBackupAutoInterval(e.detail);
      } else {
        setBackupAutoInterval(getStoredBackupAutoInterval());
      }
    };

    const handleIconsUpdate = (e?: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setCustomIcons(e.detail);
      } else {
        setCustomIcons(getStoredCustomIcons());
      }
    };
    const handleShippingUpdate = (e?: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setShippingMethods(e.detail);
      } else {
        setShippingMethods(getStoredShippingMethods());
      }
    };
    const handleAcquaintanceUpdate = (e?: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setAcquaintanceMethods(e.detail);
      } else {
        setAcquaintanceMethods(getStoredAcquaintanceMethods());
      }
    };
    const handleMessengersUpdate = (e?: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setMessengersList(e.detail);
      } else {
        setMessengersList(getStoredWebMessengers());
      }
    };
    const handleSellerNameUpdate = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setSellerName(e.detail);
      } else {
        setSellerName(getStoredSellerName());
      }
    };
    const handleSellerRegNoUpdate = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setSellerRegNo(e.detail);
      } else {
        setSellerRegNo(getStoredSellerRegNo());
      }
    };
    const handleSellerAddressUpdate = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setSellerAddress(e.detail);
      } else {
        setSellerAddress(getStoredSellerAddress());
      }
    };
    const handleSellerPhoneUpdate = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setSellerPhone(e.detail);
      } else {
        setSellerPhone(getStoredSellerPhone());
      }
    };
    const handleInvoicePaperSizeUpdate = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setInvoicePaperSize(e.detail);
      } else if (e?.detail && typeof e.detail === 'object' && e.detail.paperSize) {
        setInvoicePaperSize(e.detail.paperSize);
      } else {
        setInvoicePaperSize(getStoredInvoicePaperSize());
      }
    };

    window.addEventListener('system-icons-updated', handleIconsUpdate);
    window.addEventListener('shipping-methods-updated', handleShippingUpdate);
    window.addEventListener('acquaintance-methods-updated', handleAcquaintanceUpdate);
    window.addEventListener('acc_app_web_messengers_updated', handleMessengersUpdate);
    window.addEventListener('seller-name-updated', handleSellerNameUpdate);
    window.addEventListener('seller-reg-no-updated', handleSellerRegNoUpdate);
    window.addEventListener('seller-address-updated', handleSellerAddressUpdate);
    window.addEventListener('seller-phone-updated', handleSellerPhoneUpdate);
    window.addEventListener('seller-info-updated', handleSellerNameUpdate);
    window.addEventListener('seller-info-updated', handleSellerRegNoUpdate);
    window.addEventListener('seller-info-updated', handleSellerAddressUpdate);
    window.addEventListener('seller-info-updated', handleSellerPhoneUpdate);
    window.addEventListener('invoice-paper-size-updated', handleInvoicePaperSizeUpdate);
    window.addEventListener('paper-size-changed', handleInvoicePaperSizeUpdate);
    window.addEventListener('system-custom-fields-updated', handleCustomFieldsUpdate);
    window.addEventListener('backup-auto-interval-updated', handleBackupIntervalUpdate);
    window.addEventListener('storage', handleMessengersUpdate);

    return () => {
      window.removeEventListener('system-icons-updated', handleIconsUpdate);
      window.removeEventListener('shipping-methods-updated', handleShippingUpdate);
      window.removeEventListener('acquaintance-methods-updated', handleAcquaintanceUpdate);
      window.removeEventListener('acc_app_web_messengers_updated', handleMessengersUpdate);
      window.removeEventListener('seller-name-updated', handleSellerNameUpdate);
      window.removeEventListener('seller-reg-no-updated', handleSellerRegNoUpdate);
      window.removeEventListener('seller-address-updated', handleSellerAddressUpdate);
      window.removeEventListener('seller-phone-updated', handleSellerPhoneUpdate);
      window.removeEventListener('seller-info-updated', handleSellerNameUpdate);
      window.removeEventListener('seller-info-updated', handleSellerRegNoUpdate);
      window.removeEventListener('seller-info-updated', handleSellerAddressUpdate);
      window.removeEventListener('seller-info-updated', handleSellerPhoneUpdate);
      window.removeEventListener('invoice-paper-size-updated', handleInvoicePaperSizeUpdate);
      window.removeEventListener('paper-size-changed', handleInvoicePaperSizeUpdate);
      window.removeEventListener('system-custom-fields-updated', handleCustomFieldsUpdate);
      window.removeEventListener('backup-auto-interval-updated', handleBackupIntervalUpdate);
      window.removeEventListener('storage', handleMessengersUpdate);
    };
  }, []);

  const handleSaveCustomFields = async (newFields: SystemCustomField[]) => {
    try {
      const ok = await saveGenericKeyToDb('acc_system_custom_fields', newFields);
      if (ok) {
        setStoredSystemCustomFields(newFields);
        setCustomFields(newFields);
        window.dispatchEvent(new CustomEvent('system-custom-fields-updated', { detail: newFields }));
      }
    } catch (err) {
      console.error('Error saving system custom fields to DB:', err);
    }
  };

  const handleBackupAutoIntervalChange = async (newInterval: string) => {
    try {
      const ok = await saveGenericKeyToDb('acc_backup_auto_interval', newInterval);
      if (ok) {
        setStoredBackupAutoInterval(newInterval);
        setBackupAutoInterval(newInterval);
        window.dispatchEvent(new CustomEvent('backup-auto-interval-updated', { detail: newInterval }));
      }
    } catch (err) {
      console.error('Error saving backup auto interval to DB:', err);
    }
  };

  const saveSellerName = async (newName: string) => {
    try {
      const ok = await saveGenericKeyToDb('acc_seller_name', newName);
      if (ok) {
        setStoredSellerName(newName);
        setSellerName(newName);
        window.dispatchEvent(new CustomEvent('seller-name-updated', { detail: newName }));
      }
    } catch (err) {
      console.error('Error saving seller name to DB:', err);
    }
  };

  const saveSellerRegNo = async (newRegNo: string) => {
    try {
      const ok = await saveGenericKeyToDb('acc_seller_reg_no', newRegNo);
      if (ok) {
        setStoredSellerRegNo(newRegNo);
        setSellerRegNo(newRegNo);
        window.dispatchEvent(new CustomEvent('seller-reg-no-updated', { detail: newRegNo }));
      }
    } catch (err) {
      console.error('Error saving seller reg no to DB:', err);
    }
  };

  const saveSellerAddress = async (newAddress: string) => {
    try {
      const ok = await saveGenericKeyToDb('acc_seller_address', newAddress);
      if (ok) {
        setStoredSellerAddress(newAddress);
        setSellerAddress(newAddress);
        window.dispatchEvent(new CustomEvent('seller-address-updated', { detail: newAddress }));
      }
    } catch (err) {
      console.error('Error saving seller address to DB:', err);
    }
  };

  const saveSellerPhone = async (newPhone: string) => {
    try {
      const ok = await saveGenericKeyToDb('acc_seller_phone', newPhone);
      if (ok) {
        setStoredSellerPhone(newPhone);
        setSellerPhone(newPhone);
        window.dispatchEvent(new CustomEvent('seller-phone-updated', { detail: newPhone }));
      }
    } catch (err) {
      console.error('Error saving seller phone to DB:', err);
    }
  };

  const saveCustomIcons = async (updated: { id: string; name: string; iconData: string }[]) => {
    try {
      const ok = await saveGenericKeyToDb('acc_system_custom_icons', updated);
      if (ok) {
        setStoredCustomIcons(updated);
        setCustomIcons(updated);
        window.dispatchEvent(new CustomEvent('system-icons-updated', { detail: updated }));
      }
    } catch (err) {
      console.error('Error saving custom icons to DB:', err);
    }
  };

  const saveShippingMethods = async (updated: { id: string; name: string; iconData: string; note?: string }[]) => {
    try {
      const ok = await saveGenericKeyToDb('acc_system_shipping_methods', updated);
      if (ok) {
        setStoredShippingMethods(updated);
        setShippingMethods(updated);
        window.dispatchEvent(new CustomEvent('shipping-methods-updated', { detail: updated }));
      }
    } catch (err) {
      console.error('Error saving shipping methods to DB:', err);
    }
  };

  const saveAcquaintanceMethods = async (updated: { id: string; name: string; iconData: string }[]) => {
    try {
      const ok = await saveGenericKeyToDb('acc_system_acquaintance_methods', updated);
      if (ok) {
        setStoredAcquaintanceMethods(updated);
        setAcquaintanceMethods(updated);
        window.dispatchEvent(new CustomEvent('acquaintance-methods-updated', { detail: updated }));
      }
    } catch (err) {
      console.error('Error saving acquaintance methods to DB:', err);
    }
  };

  const handleResetIconsToDefaults = async () => {
    await saveCustomIcons(DEFAULT_CUSTOM_ICONS);
  };

  const handleAddCustomIcon = async () => {
    const newIcon = {
      id: `icon-${Date.now()}`,
      name: `آیکون ${customIcons.length + 1}`,
      iconData: ''
    };
    await saveCustomIcons([...customIcons, newIcon]);
  };

  const handleDeleteCustomIcon = async (id: string) => {
    const itemToDelete = customIcons.find(icon => icon.id === id);
    const itemName = itemToDelete?.name || 'این آیکون';
    if (window.confirm(`آیا از حذف «${itemName}» اطمینان دارید؟`)) {
      const updated = customIcons.filter(icon => icon.id !== id);
      await saveCustomIcons(updated);
    }
  };

  const handleResetShippingToDefaults = async () => {
    await saveShippingMethods(DEFAULT_SHIPPING_METHODS);
  };

  const handleAddShippingMethod = async () => {
    const newMethod = {
      id: `ship-${Date.now()}`,
      name: `روش ارسال ${shippingMethods.length + 1}`,
      iconData: '',
      note: ''
    };
    await saveShippingMethods([...shippingMethods, newMethod]);
  };

  const handleDeleteShippingMethod = async (id: string) => {
    const itemToDelete = shippingMethods.find(sm => sm.id === id);
    const itemName = itemToDelete?.name || 'این روش ارسال';
    if (window.confirm(`آیا از حذف «${itemName}» اطمینان دارید؟`)) {
      const updated = shippingMethods.filter(sm => sm.id !== id);
      await saveShippingMethods(updated);
    }
  };

  const handleResetAcquaintanceToDefaults = async () => {
    await saveAcquaintanceMethods(DEFAULT_ACQUAINTANCE_METHODS);
  };

  const handleAddAcquaintanceMethod = async () => {
    const newMethod = {
      id: `acq-${Date.now()}`,
      name: `روش آشنایی ${acquaintanceMethods.length + 1}`,
      iconData: ''
    };
    await saveAcquaintanceMethods([...acquaintanceMethods, newMethod]);
  };

  const handleDeleteAcquaintanceMethod = async (id: string) => {
    const itemToDelete = acquaintanceMethods.find(am => am.id === id);
    const itemName = itemToDelete?.name || 'این روش آشنایی';
    if (window.confirm(`آیا از حذف «${itemName}» اطمینان دارید؟`)) {
      const updated = acquaintanceMethods.filter(am => am.id !== id);
      await saveAcquaintanceMethods(updated);
    }
  };

  const handleUpdateShippingName = async (id: string, newName: string) => {
    const updated = shippingMethods.map(sm => sm.id === id ? { ...sm, name: newName } : sm);
    await saveShippingMethods(updated);
  };

  const handleUpdateShippingNote = async (id: string, newNote: string) => {
    const updated = shippingMethods.map(sm => sm.id === id ? { ...sm, note: newNote } : sm);
    await saveShippingMethods(updated);
  };

  const handleUploadShippingImage = async (id: string, file: File) => {
    try {
      const res = await uploadImageFile(file, 'shipping_icon');
      const url = res.url || res.relativePath;
      if (url) {
        const updated = shippingMethods.map(sm => sm.id === id ? { ...sm, iconData: url } : sm);
        await saveShippingMethods(updated);
        return;
      }
    } catch (_) {}
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        const updated = shippingMethods.map(sm => sm.id === id ? { ...sm, iconData: base64 } : sm);
        await saveShippingMethods(updated);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearShippingImage = async (id: string) => {
    const updated = shippingMethods.map(sm => sm.id === id ? { ...sm, iconData: '' } : sm);
    await saveShippingMethods(updated);
  };

  const handleUpdateAcquaintanceName = async (id: string, newName: string) => {
    const updated = acquaintanceMethods.map(am => am.id === id ? { ...am, name: newName } : am);
    await saveAcquaintanceMethods(updated);
  };

  const handleUploadAcquaintanceImage = async (id: string, file: File) => {
    try {
      const res = await uploadImageFile(file, 'acquaintance_icon');
      const url = res.url || res.relativePath;
      if (url) {
        const updated = acquaintanceMethods.map(am => am.id === id ? { ...am, iconData: url } : am);
        await saveAcquaintanceMethods(updated);
        return;
      }
    } catch (_) {}
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        const updated = acquaintanceMethods.map(am => am.id === id ? { ...am, iconData: base64 } : am);
        await saveAcquaintanceMethods(updated);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearAcquaintanceImage = async (id: string) => {
    const updated = acquaintanceMethods.map(am => am.id === id ? { ...am, iconData: '' } : am);
    await saveAcquaintanceMethods(updated);
  };

  const handleUpdateIconName = async (id: string, newName: string) => {
    const updated = customIcons.map(icon => icon.id === id ? { ...icon, name: newName } : icon);
    await saveCustomIcons(updated);
  };

  const handleUploadIconImage = async (id: string, file: File) => {
    try {
      const res = await uploadImageFile(file, 'custom_icon');
      const url = res.url || res.relativePath;
      if (url) {
        const updated = customIcons.map(icon => icon.id === id ? { ...icon, iconData: url } : icon);
        await saveCustomIcons(updated);
        return;
      }
    } catch (_) {}
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        const updated = customIcons.map(icon => icon.id === id ? { ...icon, iconData: base64 } : icon);
        await saveCustomIcons(updated);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearIconImage = async (id: string) => {
    const updated = customIcons.map(icon => icon.id === id ? { ...icon, iconData: '' } : icon);
    await saveCustomIcons(updated);
  };

  const handleAddCustomField = async () => {
    const newField: SystemCustomField = {
      id: `field_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `فیلد سفارشی ${customFields.length + 1}`,
      key: `custom_field_${customFields.length + 1}`,
      type: 'text',
      fieldType: 'text',
      entity: 'invoice',
      targetEntity: 'invoice',
      required: false,
      options: []
    };
    await handleSaveCustomFields([...customFields, newField]);
  };

  const handleDeleteCustomField = async (id: string) => {
    const updated = customFields.filter(f => f.id !== id);
    await handleSaveCustomFields(updated);
  };

  const handleUpdateCustomField = async (id: string, updates: Partial<SystemCustomField>) => {
    const updated = customFields.map(f => f.id === id ? { ...f, ...updates } : f);
    await handleSaveCustomFields(updated);
  };

  const handleResetCustomFieldsToDefaults = async () => {
    if (window.confirm('آیا از بازنشانی فیلدهای اختصاصی سیستم به مقادیر پیش‌فرض اطمینان دارید؟')) {
      await handleSaveCustomFields(DEFAULT_SYSTEM_CUSTOM_FIELDS);
    }
  };

  const [editUsername, setEditUsername] = useState(() => currentUser?.username || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);

  React.useEffect(() => {
    if (currentUser?.username) {
      setEditUsername(currentUser.username);
    }
  }, [currentUser?.username]);

  // Database Connection Status monitoring
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [loadingDbStatus, setLoadingDbStatus] = useState(false);

  // Gemini API Key management states
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [geminiBaseUrlInput, setGeminiBaseUrlInput] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiSaveStatus, setGeminiSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);

  // Android SMS Integration API Key states
  const [smsApiKeyInput, setSmsApiKeyInput] = useState(() => localStorage.getItem('acc_app_smsApiKey') || 'sms_secret_key_12345');
  const [savingSmsKey, setSavingSmsKey] = useState(false);
  const [smsKeyStatus, setSmsKeyStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const handleSaveSmsApiKey = async () => {
    setSavingSmsKey(true);
    setSmsKeyStatus(null);
    try {
      localStorage.setItem('acc_app_smsApiKey', smsApiKeyInput.trim());
      await saveGenericKeyToDb('smsApiKey', smsApiKeyInput.trim());
      setSmsKeyStatus({ type: 'success', message: 'کلید API اتصال اپلیکیشن اندروید با موفقیت ذخیره گردید.' });
    } catch (err: any) {
      setSmsKeyStatus({ type: 'error', message: `خطا در ذخیره‌سازی: ${err.message}` });
    } finally {
      setSavingSmsKey(false);
    }
  };


  // System Update state
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updating, setUpdating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showUpdateGuide, setShowUpdateGuide] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Toggle to show system update upload on login page
  const [allowLoginUpdate, setAllowLoginUpdate] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('acc_app_allow_login_update') || localStorage.getItem('allow_login_update');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleAllowLoginUpdate = async (val: boolean) => {
    setAllowLoginUpdate(val);
    try {
      localStorage.setItem('acc_app_allow_login_update', String(val));
      localStorage.setItem('allow_login_update', String(val));
    } catch (_) {}
    await saveGenericKeyToDb('allow_login_update', val);
    window.dispatchEvent(new CustomEvent('allow-login-update-changed', { detail: val }));
  };

  // Automatic Build & Download dist.zip Package state
  const [buildingPackage, setBuildingPackage] = useState(false);
  const [downloadingPackage, setDownloadingPackage] = useState(false);
  const [buildSuccess, setBuildSuccess] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<{ exists: boolean; sizeMB?: string; mtime?: string; downloadUrl?: string } | null>(null);

  const fetchBuildStatus = async () => {
    try {
      const res = await fetch('/api/system/build-status');
      if (res.ok) {
        const data = await res.json();
        setBuildStatus(data);
      }
    } catch (err) {
      console.error("Error fetching build status:", err);
    }
  };

  useEffect(() => {
    fetchBuildStatus();
  }, []);

  const handleBuildPackage = async () => {
    setBuildingPackage(true);
    setBuildSuccess(null);
    setBuildError(null);

    try {
      const response = await fetch('/api/system/build-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();
      if (response.ok && result.status === 'success') {
        setBuildSuccess(result.message);
        fetchBuildStatus();
      } else {
        setBuildError(result.error || "خطایی در ساخت پکیج به‌روزرسانی رخ داد.");
      }
    } catch (err: any) {
      setBuildError(`خطا در ارتباط با سرور: ${err.message}`);
    } finally {
      setBuildingPackage(false);
    }
  };

  const handleDownloadPackage = async () => {
    setDownloadingPackage(true);
    setBuildError(null);

    try {
      const res = await fetch('/api/system/download-build');
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `خطای دانلود (${res.status})`);
      }

      const blob = await res.blob();
      if (blob.size < 1000) {
        // Double check if blob is actually an error json
        const text = await blob.text();
        if (text.includes('"error":') || text.includes('<!doctype html>')) {
          throw new Error("فایل دانلود شده نامعتبر است. لطفاً مجدداً دکمه «ساخت پکیج» را بزنید.");
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dist.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setBuildError(`خطا هنگام دانلود پکیج: ${err.message}`);
    } finally {
      setDownloadingPackage(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith('.zip') && !lowerName.endsWith('.rar')) {
        setUpdateError("فرمت فایل نامعتبر است. لطفاً فقط فایل .zip یا .rar انتخاب کنید.");
        setUpdateFile(null);
        return;
      }
      setUpdateFile(file);
      setUpdateSuccess(null);
      setUpdateError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith('.zip') && !lowerName.endsWith('.rar')) {
        setUpdateError("فرمت فایل نامعتبر است. لطفاً فقط فایل .zip یا .rar انتخاب کنید.");
        setUpdateFile(null);
        return;
      }
      if (file.size > 80 * 1024 * 1024) {
        setUpdateError("حجم فایل انتخابی بیش از حد مجاز (۸۰ مگابایت) است. لطفاً پوشه node_modules را از زیپ حذف کرده و تنها پوشه dist یا سورس پروژه را آپلود نمایید.");
        setUpdateFile(null);
        return;
      }
      setUpdateFile(file);
      setUpdateSuccess(null);
      setUpdateError(null);
    }
  };

  const handleSystemUpdate = async () => {
    if (!updateFile) {
      setUpdateError("لطفاً ابتدا فایل زیپ یا رار به‌روزرسانی را انتخاب کنید.");
      return;
    }

    if (updateFile.size > 80 * 1024 * 1024) {
      setUpdateError("حجم فایل انتخابی بیشتر از ۸۰ مگابایت است. لطفاً پوشه node_modules را از زیپ حذف کرده و مجدداً امتحان کنید.");
      return;
    }

    setUpdating(true);
    setUploadProgress(0);
    setUploadStatusText("در حال آماده‌سازی و ارسال قطعه‌بندی‌شده...");
    setUpdateSuccess(null);
    setUpdateError(null);

    try {
      const result = await uploadSystemUpdateFile(updateFile, (pct, status) => {
        setUploadProgress(pct);
        setUploadStatusText(status);
      });

      if (result && result.status === 'success') {
        setUpdateSuccess(result.message);
        setUpdateFile(null);
        setTimeout(() => {
          window.location.href = window.location.pathname + '?updated=' + Date.now();
        }, 3000);
      } else {
        setUpdateError(result?.error || "خطایی در فرآیند به‌روزرسانی رخ داد.");
      }
    } catch (err: any) {
      console.error("System update error:", err);
      setUpdateError(err.message || "خطا در برقراری ارتباط با سرور هنگام به‌روزرسانی.");
    } finally {
      setUpdating(false);
    }
  };

  const fetchDbStatus = async () => {
    setLoadingDbStatus(true);
    try {
      const res = await fetch('/api/db/status');
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data);
        if (data.geminiApiKey) {
          setGeminiKeyInput(data.geminiApiKey);
        }
        if (data.geminiBaseUrl) {
          setGeminiBaseUrlInput(data.geminiBaseUrl);
        }
      }
    } catch (err) {
      console.error("Failed to fetch database status:", err);
    } finally {
      setLoadingDbStatus(false);
    }
  };



  const handleSaveGeminiKey = async () => {
    setSavingGeminiKey(true);
    setGeminiSaveStatus(null);
    try {
      const res = await fetch('/api/system/save-gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          geminiKey: geminiKeyInput,
          geminiBaseUrl: geminiBaseUrlInput
        })
      });
      const result = await res.json();
      if (res.ok && result.status === 'success') {
        setGeminiSaveStatus({ type: 'success', message: 'تنظیمات با موفقیت در فایل تنظیمات هاست (wp-config.json) ذخیره شد.' });
        fetchDbStatus();
      } else {
        setGeminiSaveStatus({ type: 'error', message: result.error || 'خطا در ذخیره‌سازی تنظیمات.' });
      }
    } catch (err: any) {
      setGeminiSaveStatus({ type: 'error', message: `خطا در ارتباط با سرور: ${err.message}` });
    } finally {
      setSavingGeminiKey(false);
    }
  };

  useEffect(() => {
    fetchDbStatus();
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassSuccess(null);
    setPassError(null);

    const cleanUser = editUsername.trim().toLowerCase();
    const cleanPass = password.trim();
    const cleanConfirm = confirmPassword.trim();

    if (!cleanUser) {
      setPassError('نام کاربری نمی‌تواند خالی باشد.');
      return;
    }

    // Check duplicate username with other users
    const duplicate = users.find(u => 
      u.id !== currentUser.id && 
      u.username && 
      u.username.trim().toLowerCase() === cleanUser
    );
    if (duplicate) {
      setPassError(`نام کاربری "${cleanUser}" قبلاً توسط کاربر دیگری (${duplicate.name}) ثبت شده است.`);
      return;
    }

    if (cleanPass || cleanConfirm) {
      if (!cleanPass) {
        setPassError('رمز عبور جدید نمی‌تواند خالی باشد.');
        return;
      }
      if (cleanPass !== cleanConfirm) {
        setPassError('تکرار رمز عبور با رمز عبور وارد شده همخوانی ندارد.');
        return;
      }
    }

    const currentCleanUsername = (currentUser.username || '').trim().toLowerCase();
    const isUsernameChanged = cleanUser !== currentCleanUsername;
    const isPasswordChanged = Boolean(cleanPass && cleanPass !== currentUser.password);

    if (!isUsernameChanged && !isPasswordChanged) {
      setPassSuccess('هیچ تغییری در نام کاربری یا کلمه عبور ایجاد نشده است.');
      return;
    }

    const updatedUsers = users.map(u => {
      if (u.id === currentUser.id) {
        return {
          ...u,
          username: cleanUser,
          ...(cleanPass ? { password: cleanPass } : {})
        };
      }
      return u;
    });

    onUpdateUsersList(updatedUsers);

    // Direct asynchronous persistence to host database
    fetch('/api/auth/update-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedUsers })
    }).catch(() => {});

    alert('✅ نام کاربری یا کلمه عبور با موفقیت به‌روزرسانی شد.\n\nکلیه نشست‌های فعال قبلی این حساب کاربری در تمامی دستگاه‌ها لغو گردیدند.\nلطفاً اکنون با مشخصات جدید خود مجدداً وارد شوید.');

    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('acc_app_isLoggedIn');
      localStorage.removeItem('acc_app_currentUser');
      localStorage.removeItem('currentUser');
      window.location.reload();
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 space-y-8 shadow-sm text-right" dir="rtl">
      
      {/* Title & Description Header */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-blue-600" />
            <span>تنظیمات پیشرفته سیستم</span>
          </h2>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-1 leading-relaxed">
            شخصی‌سازی تم، فونت، واحد پول و امنیت حساب کاربری
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAllSections}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
            <span>باز کردن همه</span>
          </button>
          <button
            type="button"
            onClick={collapseAllSections}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ChevronUp className="w-3.5 h-3.5 text-amber-500" />
            <span>بستن همه</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Side: Appearance Styles */}
        <div className="space-y-6">
          
          {/* Font Selection */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
            <button
              type="button"
              onClick={() => toggleSection('font')}
              className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                  openSections.font ? 'rotate-90 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50' : 'text-slate-500'
                }`}>
                  <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                </div>
                <Type className="w-4 h-4 text-violet-500 shrink-0" />
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">فونت سیستم</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {openSections.font ? 'بستن' : 'باز کردن'}
              </span>
            </button>

            {openSections.font && (
              <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-4 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                    تغییر قلم نمایش متون، ارقام فارسی، جداول مالی، فاکتورها و پنل‌های کل سامانه:
                  </p>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 text-[10px] font-black border border-violet-200 dark:border-violet-900/60 self-start sm:self-auto shrink-0">
                    <span>فونت فعال:</span>
                    <span>{FONTS_LIST.find(f => f.id === appFont)?.name || appFont}</span>
                  </div>
                </div>

                {/* Live Font Interactive Preview Box */}
                <div 
                  className="p-4 rounded-2xl border border-violet-200 dark:border-violet-900/50 bg-gradient-to-br from-violet-50/70 via-white to-indigo-50/40 dark:from-violet-950/30 dark:via-slate-900/40 dark:to-slate-950/40 space-y-2.5 shadow-xs"
                  style={{ fontFamily: getFontFamilyStack(appFont) }}
                >
                  <div className="flex items-center justify-between border-b border-violet-150/70 dark:border-violet-900/40 pb-2">
                    <span className="text-xs font-black text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5" />
                      پیش‌نمایش زنده تایپوگرافی با فونت «{FONTS_LIST.find(f => f.id === appFont)?.name.split('(')[0].trim() || appFont}»
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">نمونه متن و ارقام</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <p className="font-extrabold text-slate-900 dark:text-slate-100">
                        سامانه جامع مدیریت مالی و صدور فاکتور فهامند
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                        اسناد حسابداری روزنامه، ثبت انبارداری، کنترل صورتحساب بانکی و وصول مطالبات
                      </p>
                    </div>
                    <div className="space-y-1 bg-white/80 dark:bg-slate-950/50 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500 font-medium">مبلغ کل فاکتور:</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400">۲۵۰,۴۵۰,۰۰۰ ریال</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500 font-medium">شناسه پیگیری بانکی:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">۹۸۴۳۲۱۰-۷۶</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400">
                        <span>ارقام لاتین و فارسی:</span>
                        <span>1234567890 / ۰۱۲۳۴۵۶۷۸۹</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {FONTS_LIST.map(font => (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => {
                        setAppFont(font.id);
                        applySystemFont(font.id);
                        localStorage.setItem('acc_app_setting_font', font.id);
                        if (currentUser?.id) {
                          localStorage.setItem(`acc_app_${currentUser.id}_font`, font.id);
                          saveGenericKeyToDb(`acc_app_${currentUser.id}_font`, font.id);
                        }
                        window.dispatchEvent(new CustomEvent('app-font-changed', { detail: font.id }));
                      }}
                      className={`w-full p-3.5 text-xs rounded-2xl border text-right cursor-pointer transition-all flex flex-col justify-between gap-2.5 ${
                        appFont === font.id
                          ? 'bg-violet-50/80 dark:bg-violet-950/50 border-violet-400 dark:border-violet-600 text-violet-950 dark:text-violet-100 font-extrabold shadow-sm ring-2 ring-violet-500/25'
                          : 'bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 hover:border-slate-300'
                      }`}
                      style={{ fontFamily: getFontFamilyStack(font.id) }}
                    >
                      <div className="flex items-start justify-between gap-2 w-full">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${appFont === font.id ? 'bg-violet-600 dark:bg-violet-400 ring-2 ring-violet-300 dark:ring-violet-800' : 'bg-slate-300 dark:bg-slate-700'}`} />
                          <span className="text-xs font-black block">{font.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {font.category && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              {font.category}
                            </span>
                          )}
                          {appFont === font.id && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/60 px-2 py-0.5 rounded-md">
                              <Check className="w-3 h-3" />
                              <span>فعال</span>
                            </span>
                          )}
                        </div>
                      </div>
                      {font.previewText && (
                        <div className="pt-1 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed" style={{ fontFamily: getFontFamilyStack(font.id) }}>
                          {font.previewText} — ۱۲۳۴۵۶۷۸۹۰
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Currency Configuration */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
            <button
              type="button"
              onClick={() => toggleSection('currency')}
              className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                  openSections.currency ? 'rotate-90 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50' : 'text-slate-500'
                }`}>
                  <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                </div>
                <Landmark className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">واحد پول</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {openSections.currency ? 'بستن' : 'باز کردن'}
              </span>
            </button>

            {openSections.currency && (
              <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-4 animate-fade-in">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  تعیین واحد رسمی نمایش مبالغ در کل سامانه (ریال یا تومان):
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setCurrencySetting('rial');
                      localStorage.setItem('acc_app_setting_currency', 'rial');
                    }}
                    className={`p-4 rounded-2xl border text-center cursor-pointer transition-all flex flex-col items-center gap-2 ${
                      currencySetting === 'rial'
                        ? 'bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-850 text-emerald-900 dark:text-emerald-400 font-extrabold'
                        : 'bg-white dark:bg-slate-950/20 border-slate-150 dark:border-slate-850 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-black">ریال ایران</span>
                    <span className="text-[9px] text-slate-400">بدون تغییر در مبالغ دفاتر مالی</span>
                  </button>

                  <button
                    onClick={() => {
                      setCurrencySetting('toman');
                      localStorage.setItem('acc_app_setting_currency', 'toman');
                    }}
                    className={`p-4 rounded-2xl border text-center cursor-pointer transition-all flex flex-col items-center gap-2 ${
                      currencySetting === 'toman'
                        ? 'bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-850 text-emerald-900 dark:text-emerald-400 font-extrabold'
                        : 'bg-white dark:bg-slate-950/20 border-slate-150 dark:border-slate-850 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-black">تومان ایران</span>
                    <span className="text-[9px] text-slate-400">تقسیم خودکار مبالغ بر ۱۰</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Calculator Configuration */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
            <button
              type="button"
              onClick={() => toggleSection('calculator')}
              className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                  openSections.calculator ? 'rotate-90 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50' : 'text-slate-500'
                }`}>
                  <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                </div>
                <Calculator className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">ابزارهای حسابداری</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {openSections.calculator ? 'بستن' : 'باز کردن'}
              </span>
            </button>

            {openSections.calculator && (
              <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-4 animate-fade-in">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  فعال‌سازی یا پنهان‌سازی ابزار کمکی ماشین حساب شناور بر روی صفحات سیستم:
                </p>

                <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 rounded-2xl">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">نمایش آیکون شناور ماشین حساب</span>
                  <button
                    type="button"
                    onClick={() => onToggleFloatingCalc(!isFloatingCalcVisible)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer transition-colors focus:outline-none ${
                      isFloatingCalcVisible ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isFloatingCalcVisible ? '-translate-x-6' : '-translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Proforma Management Tab Bar Settings */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
            <button
              type="button"
              onClick={() => toggleSection('proforma')}
              className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                  openSections.proforma ? 'rotate-90 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50' : 'text-slate-500'
                }`}>
                  <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                </div>
                <ClipboardList className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">مدیریت پیش‌فاکتورها</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {openSections.proforma ? 'بستن' : 'باز کردن'}
              </span>
            </button>

            {openSections.proforma && (
              <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-4 animate-fade-in">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  فعال‌سازی یا پنهان‌سازی نوار تب‌های مدیریت پیش‌فاکتورها در بخش صدور فاکتور:
                </p>

                <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 rounded-2xl">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">نوار مدیریت پیش‌فاکتورها (Tab Bar)</span>
                  <button
                    type="button"
                    onClick={() => onToggleProformaTab && onToggleProformaTab(!isProformaTabEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer transition-colors focus:outline-none ${
                      isProformaTabEnabled ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isProformaTabEnabled ? '-translate-x-6' : '-translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Urgent Proforma Alert Interval Setting */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>بازه زمانی بررسی و هشدار پیش‌فاکتورهای فوری و اورژانسی</span>
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed block mt-0.5">
                        تعیین زمان‌بندی بررسی خودکار سیستم جهت شناسایی و نمایش پاپ‌آپ پیش‌فاکتورهای فوری اختصاصی پرسنل جاری ({currentUser?.name || 'پرسنل'})
                      </span>
                    </div>
                    <span className="text-[11px] font-black text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-3 py-1 rounded-xl border border-rose-200 dark:border-rose-800 shrink-0 self-start sm:self-auto font-mono">
                      هر {toPersianDigits(urgentCheckInterval)} دقیقه یک‌بار
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                    {[5, 10, 15, 20, 25, 30].map((mins) => {
                      const isSelected = urgentCheckInterval === mins;
                      return (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => handleUrgentIntervalChange(mins)}
                          className={`py-2 px-2 rounded-xl text-xs font-black transition-all cursor-pointer text-center border ${
                            isSelected
                              ? 'bg-rose-600 text-white border-rose-600 shadow-sm scale-[1.02]'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-rose-300 hover:bg-rose-50/50 dark:hover:bg-rose-950/30'
                          }`}
                        >
                          {toPersianDigits(mins)} دقیقه
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* cPanel Database & Node.js System Status */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
            <div
              onClick={() => toggleSection('dbStatus')}
              className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                  openSections.dbStatus ? 'rotate-90 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50' : 'text-slate-500'
                }`}>
                  <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                </div>
                <Database className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">وضعیت اتصال دیتابیس</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchDbStatus();
                  }} 
                  type="button"
                  disabled={loadingDbStatus}
                  title="بروزرسانی وضعیت اتصال"
                  className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDbStatus ? 'animate-spin' : ''}`} />
                </button>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  {openSections.dbStatus ? 'بستن' : 'باز کردن'}
                </span>
              </div>
            </div>

            {openSections.dbStatus && (
              <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-4 animate-fade-in">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  بررسی وضعیت اتصال برنامه به دیتابیس MySQL در فایل <span className="font-mono text-blue-500 font-bold">wp-config.json</span> روی سی‌پنل:
                </p>

                {dbStatus ? (
                  <div className="space-y-2 text-xs">
                    {/* 1. Database Engine */}
                    <div className="flex justify-between items-center p-2.5 bg-white dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850 rounded-xl">
                      <span className="text-[11px] text-slate-500">نوع دیتابیس فعال:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                        MySQL (پایگاه‌داده متمرکز)
                      </span>
                    </div>

                    {/* 2. Connection Status */}
                    <div className="flex justify-between items-center p-2.5 bg-white dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850 rounded-xl">
                      <span className="text-[11px] text-slate-500">وضعیت اتصال:</span>
                      {dbStatus.mysqlConnected ? (
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          متصل به پایگاه‌داده متمرکز MySQL
                        </span>
                      ) : (
                        <span className="flex flex-col items-end gap-1">
                          <span className="flex items-center gap-1.5 text-rose-500 font-bold text-[11px]">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                            خطای اتصال به پایگاه‌داده MySQL
                          </span>
                          {dbStatus.mysqlError && (
                            <span className="text-[8px] text-rose-500 max-w-[200px] text-left overflow-x-auto font-mono">
                              {dbStatus.mysqlError}
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* 3. Database Name */}
                    <div className="flex justify-between items-center p-2.5 bg-white dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850 rounded-xl">
                      <span className="text-[11px] text-slate-500">نام پایگاه‌داده:</span>
                      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 font-bold">
                        {dbStatus.databaseName || "wdamlpty_hesabdari-h.fahamand"}
                      </span>
                    </div>

                    {/* 4. Gemini and Node */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="p-2 bg-slate-100/50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-xl flex flex-col justify-center items-center text-center">
                        <span className="text-[9px] text-slate-400">دستیار هوش مصنوعی</span>
                        <span className={`text-[10px] font-bold mt-1 ${dbStatus.geminiConnected ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {dbStatus.geminiConnected ? 'فعال (کلید ست شده)' : 'غیرفعال'}
                        </span>
                      </div>
                      <div className="p-2 bg-slate-100/50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-xl flex flex-col justify-center items-center text-center">
                        <span className="text-[9px] text-slate-400">نسخه نود جی‌اس</span>
                        <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 mt-1">
                          {dbStatus.nodeVersion}
                        </span>
                      </div>
                    </div>

                    {/* 5. Gemini Key Configuration */}
                    <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-800/60 space-y-3">
                      <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 block">تنظیمات دستیار هوش مصنوعی جمینای (Gemini API)</span>
                      
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-500 block">کلید اختصاصی جمینای (Gemini API Key)</label>
                        <div className="flex gap-2">
                           <input 
                            type={showGeminiKey ? "text" : "password"}
                            value={geminiKeyInput}
                            onChange={(e) => setGeminiKeyInput(e.target.value)}
                            placeholder="کلید API جمینای خود را وارد کنید..."
                            className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] font-mono text-left"
                            dir="ltr"
                          />
                          <button
                            type="button"
                            onClick={() => setShowGeminiKey(!showGeminiKey)}
                            className="px-2.5 py-1 text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 rounded-xl cursor-pointer"
                          >
                            {showGeminiKey ? 'مخفی' : 'نمایش'}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-500 block">آدرس پایه API / پروکسی یا سرورهای DNS ضدتحریم (Base URL / DNS)</label>
                        <input 
                          type="text"
                          value={geminiBaseUrlInput}
                          onChange={(e) => setGeminiBaseUrlInput(e.target.value)}
                          placeholder="178.22.122.100, 185.51.200.2 یا آدرس پروکسی"
                          className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] font-mono text-left"
                          dir="ltr"
                        />
                        <div className="text-[9px] text-slate-400 leading-relaxed mt-1">
                          💡 <strong>عبور هوشمند از تحریم:</strong> اگر هاست شما در ایران است، می‌توانید در این کادر یا آدرس یک پروکسی سازگار (مثل <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-bold">https://api.openai-hk.com</code>) و یا آی‌پی‌های دی‌ان‌اس ضدتحریم شکن را به صورت <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-bold">178.22.122.100, 185.51.200.2</code> وارد کنید. سیستم به صورت کاملاً خودکار نوع ورودی را تشخیص داده و با استفاده از روش اختصاصی و امن، تحریم‌های گوگل را دور می‌زند. در غیر این صورت خالی بگذارید تا از دی‌ان‌اس‌های پیش‌فرض ضدتحریم شکن استفاده شود.
                        </div>
                      </div>

                      {geminiKeyInput && !geminiKeyInput.trim().startsWith('AIzaSy') && !geminiKeyInput.trim().startsWith('AQ.') && (
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30 rounded-xl text-[9px] leading-relaxed">
                          ⚠️ <strong>هشدار فرمت کلید:</strong> کلید وارد شده با فرمت استاندارد گوگل جمینای سازگار نیست. کلیدهای معتبر معمولاً با <code className="font-mono bg-amber-100/50 px-1 rounded font-bold">AIzaSy</code> یا <code className="font-mono bg-amber-100/50 px-1 rounded font-bold">AQ.</code> شروع می‌شوند. لطفاً مطمئن شوید که کلید صحیح را کپی کرده‌اید.
                        </div>
                      )}
                      {geminiSaveStatus && (
                        <div className={`p-2 rounded-xl text-[9px] font-bold mt-2 ${
                          geminiSaveStatus.type === 'success' 
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-100 dark:border-emerald-900/30' 
                            : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 border border-rose-100 dark:border-rose-900/30'
                        }`}>
                          {geminiSaveStatus.message}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveGeminiKey}
                        disabled={savingGeminiKey}
                        className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-[10px] rounded-xl transition-colors cursor-pointer mt-2"
                      >
                        {savingGeminiKey ? 'در حال ذخیره‌سازی...' : 'ذخیره تنظیمات روی فایل wp-config.json هاست'}
                      </button>
                    </div>

                    {/* Android SMS API Key Configuration */}
                    <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-800/60 space-y-3">
                      <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 block">ساخت و مدیریت API جهت اتصال اپلیکیشن اندروید (پیامک‌های بانکی)</span>
                      
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-500 block">کلید معتبرسازی API (API Key)</label>
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            value={smsApiKeyInput}
                            onChange={(e) => setSmsApiKeyInput(e.target.value)}
                            placeholder="یک کلید امن دلخواه وارد کنید..."
                            className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] font-mono text-left"
                            dir="ltr"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newKey = `sms_key_${Math.random().toString(36).substring(2, 12)}_${Date.now().toString().slice(-4)}`;
                              setSmsApiKeyInput(newKey);
                            }}
                            className="px-2.5 py-1 text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 rounded-xl cursor-pointer"
                          >
                            تولید اتفاقی
                          </button>
                        </div>
                        <div className="text-[9px] text-slate-400 leading-relaxed mt-1">
                          💡 <strong>نحوه استفاده در اندروید:</strong> این کلید را در تنظیمات اپلیکیشن فورواردر پیامک اندروید به عنوان هدر <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-bold font-mono">x-api-key</code> یا پارامتر <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-bold font-mono">apiKey</code> ارسال کنید.
                        </div>
                      </div>

                      {smsKeyStatus && (
                        <div className={`p-2 rounded-xl text-[9px] font-bold mt-2 ${
                          smsKeyStatus.type === 'success' 
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-100 dark:border-emerald-900/30' 
                            : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 border border-rose-100 dark:border-rose-900/30'
                        }`}>
                          {smsKeyStatus.message}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveSmsApiKey}
                        disabled={savingSmsKey}
                        className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-[10px] rounded-xl transition-colors cursor-pointer mt-2"
                      >
                        {savingSmsKey ? 'در حال ذخیره‌سازی...' : 'ذخیره کلید API پیامک اندروید'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-slate-400">در حال دریافت وضعیت سیستم...</div>
                )}
              </div>
            )}
          </div>

          {/* Automatic System Update Panel */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
            <button
              type="button"
              onClick={() => toggleSection('update')}
              className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                  openSections.update ? 'rotate-90 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50' : 'text-slate-500'
                }`}>
                  <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                </div>
                <Cpu className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">به‌روزرسانی سیستم</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {openSections.update ? 'بستن' : 'باز کردن'}
              </span>
            </button>

            {openSections.update && (
              <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-4 animate-fade-in">

                {/* 1. Step-by-step Zip build guide button and collapsible guide box */}
                <div className="flex items-center justify-between">
                  <button 
                    type="button" 
                    onClick={() => setShowUpdateGuide(!showUpdateGuide)}
                    className="text-[10px] text-blue-600 hover:text-blue-700 font-black cursor-pointer flex items-center gap-1"
                  >
                    <Info className="w-3.5 h-3.5" />
                    {showUpdateGuide ? 'پنهان کردن راهنمای به‌روزرسانی' : 'مشاهده راهنمای گام‌به‌گام ساخت فایل ZIP'}
                  </button>
                </div>

                {/* Option to show upload & update in Login Page */}
                <div className="flex items-center justify-between p-3.5 bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
                  <div className="space-y-1 pl-3">
                    <div className="flex items-center gap-2">
                      <UploadCloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        نمایش بخش آپلود فایل و به‌روزرسانی در صفحه ورود (لاگین)
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed pr-6">
                      با فعال‌سازی این گزینه، کادر آپلود فایل زیپ و امکان به‌روزرسانی سیستم در صفحه ورود (پیش از لاگین) نمایش داده می‌شود تا ارتقای سیستم بدون نیاز به ورود به حساب کاربری میسر گردد.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleAllowLoginUpdate(!allowLoginUpdate)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full cursor-pointer transition-colors focus:outline-none ${
                      allowLoginUpdate ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        allowLoginUpdate ? '-translate-x-6' : '-translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {showUpdateGuide && (
                  <div className="p-4 border border-slate-100 dark:border-slate-800 space-y-4 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/10 text-right rounded-2xl whitespace-pre-line" dir="rtl">
                    <p className="font-black text-slate-800 dark:text-slate-200">پیش‌نیاز مهم قبل از شروع:</p>
                    <p>
                      مطمئن شوید نرم‌افزار Node.js روی سیستم شما نصب است. در غیر این صورت، ابتدا آن را از لینک زیر دانلود و نصب کنید:
                      {"\n"}
                      <a href="https://nodejs.org/en/download" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 underline font-mono font-bold">https://nodejs.org/en/download</a>
                    </p>

                    <p className="font-black text-slate-800 dark:text-slate-200">روش اول (سریع و خودکار)</p>
                    <p>
                      ۱. فایل به‌روزرسانی را از Google Studio دانلود کرده و از حالت فشرده خارج کنید.
                      {"\n"}
                      ۲. روی فایل build.bat دو بار کلیک کنید تا فایل dist.zip به‌صورت خودکار ساخته شود.
                      {"\n"}
                      ۳. فایل dist.zip ایجاد شده را در بخش به‌روزرسانی نرم‌افزار آپلود کنید.
                    </p>

                    <p className="font-black text-slate-800 dark:text-slate-200">روش دوم (دستی)</p>
                    <p>
                      ۱. آماده‌سازی: فایل به‌روزرسانی را از Google Studio دانلود کرده و از حالت فشرده خارج کنید.
                      {"\n"}
                      ۲. اجرای دستورات: وارد پوشه استخراج‌شده شوید. کلید Shift را نگه دارید، راست‌کلیک کنید و گزینه Open PowerShell window here را انتخاب کنید. در پنجره باز شده، دستورات زیر را به ترتیب تایپ کرده و پس از هر کدام کلید Enter را بزنید:
                      {"\n\n"}
                      <code className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block text-center font-bold text-indigo-600 dark:text-indigo-400 my-1">npm install</code>
                      <code className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block text-center font-bold text-indigo-600 dark:text-indigo-400 my-1">npm run build</code>
                      {"\n"}
                      یا می‌توانید هر دو دستور را به‌صورت یکجا با دستور زیر اجرا کنید:
                      {"\n"}
                      <code className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block text-center font-bold text-indigo-600 dark:text-indigo-400 my-1">npm install; npm run build</code>
                      {"\n"}
                      ۳. نهایی‌سازی: پس از پایان دستورات، پوشه‌ای به نام dist ایجاد می‌شود. محتویات داخل این پوشه را فشرده (Zip) کرده و در بخش به‌روزرسانی نرم‌افزار آپلود کنید
                    </p>
                  </div>
                )}

                {/* 2. File Drag & Drop Upload Zone & Actions */}
                <p className="text-[10px] text-slate-400 leading-relaxed pt-1">
                  آپلود بسته به‌روزرسانی نرم‌افزار (فایل <span className="font-mono text-emerald-500 font-bold">.zip / .rar</span>) جهت ارتقای خودکار سیستم.
                </p>

                <div
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`p-6 border-2 border-dashed rounded-2xl text-center transition-all flex flex-col items-center justify-center space-y-3 ${
                    isDragging
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 scale-[1.01]'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm">
                    <UploadCloud className="w-6 h-6" />
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      فایل به‌روزرسانی (<span className="font-mono text-emerald-500 font-bold">.zip یا .rar</span>) را اینجا رها کنید
                    </p>
                    <p className="text-[10px] text-slate-400">یا برای انتخاب فایل از روی کامپیوتر کلیک کنید</p>
                  </div>

                  <label className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer inline-flex items-center gap-2">
                    <UploadCloud className="w-4 h-4" />
                    <span>انتخاب فایل .zip / .rar</span>
                    <input
                      type="file"
                      accept=".zip,.rar,application/zip,application/x-zip-compressed,application/x-rar-compressed,application/vnd.rar,application/x-rar"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Selected File Card & Actions */}
                {updateFile && (
                  <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="truncate text-right">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate" dir="ltr">
                            {updateFile.name}
                          </span>
                          <span className="text-[9px] text-slate-400 block font-mono">
                            {(updateFile.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!updating && (
                          <button
                            type="button"
                            onClick={() => setUpdateFile(null)}
                            className="px-2.5 py-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                          >
                            انصراف
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleSystemUpdate}
                          disabled={updating}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          {updating ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>{uploadProgress}%</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>شروع به‌روزرسانی</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Live Progress Bar when updating */}
                    {updating && (
                      <div className="pt-1 space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-emerald-800 dark:text-emerald-300 font-bold">
                          <span>{uploadStatusText || "در حال ارسال قطعه‌بندی‌شده..."}</span>
                          <span className="font-mono">{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-emerald-200 dark:bg-emerald-900/40 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-emerald-600 h-2 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Error and Success alerts */}
                {updateError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 rounded-xl text-xs flex items-center gap-2 font-bold animate-fade-in">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{updateError}</span>
                  </div>
                )}

                {updateSuccess && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs flex items-center gap-2 font-bold animate-fade-in">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span>{updateSuccess}</span>
                  </div>
                )}

                {/* 3. Explanations regarding safe non-destructive database update */}
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-xl space-y-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5 font-black text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span>به‌روزرسانی امن و بدون تغییر در اطلاعات دیتابیس (Non-Destructive Update)</span>
                  </div>
                  <p className="leading-relaxed text-slate-600 dark:text-slate-300">
                    هنگام به روزرسانی فقط فایل‌های کدهای کلاینت و سرور نرم‌افزار جایگزین می‌شوند. 
                    <strong className="text-slate-800 dark:text-slate-200 mr-1">
                      موارد زیر ۱۰۰٪ دست‌نخورده و محفوظ می‌مانند:
                    </strong>
                  </p>
                  <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] font-bold text-slate-500 dark:text-slate-400 list-disc list-inside pt-1">
                    <li>اطلاعات کاربران و دسترسی‌ها</li>
                    <li>فاکتورها و پیش‌فاکتورها</li>
                    <li>طرف‌های حساب و مشتریان</li>
                    <li>کالاها و خدمات</li>
                    <li>سرفصل‌ها و کدینگ حسابداری</li>
                    <li>صندوق‌ها و حساب‌های بانکی</li>
                    <li>تراکنش‌ها و اسناد مالی</li>
                    <li>چک‌های درافتی و پرداختی</li>
                    <li>تنظیمات ثبت‌شده توسط کاربر</li>
                    <li>فایل‌ها و پیوست‌های آپلود شده</li>
                  </ul>
                  <div className="pt-1 text-[9px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>پیش از هر به‌روزرسانی، یک نسخه پشتیبان (Backup) خودکار از دیتابیس در پوشه backups ایجاد می‌شود.</span>
                  </div>

                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 rounded-xl text-[10px] text-blue-700 dark:text-blue-300 font-bold space-y-1 text-right">
                    <div className="flex items-center gap-1.5 font-black text-blue-800 dark:text-blue-200">
                      <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>راهنمای ساخت فایل به‌روزرسانی (مهم):</span>
                    </div>
                    <p className="leading-relaxed">
                      هنگام ساخت فایل زیپ با دستور <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded font-mono">npm run build</code>، می‌توانید فقط محتویات پوشه <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded font-mono">dist</code> را زیپ کرده و آپلود کنید. حتماً پوشه <code className="bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-1 py-0.5 rounded font-mono">node_modules</code> را از زیپ استثنا نمایید تا حجم فایل کم بماند (زیر ۵۰ مگابایت) و خطای سرور رخ ندهد.
                    </p>
                  </div>
                </div>

                {/* 4. Automatic BUILD & DOWNLOAD PACKAGE PANEL */}
                <div className="p-4 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/50 dark:from-slate-900 dark:via-slate-900/90 dark:to-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/50 rounded-2xl space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-indigo-500 text-white shadow-sm">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800 dark:text-slate-100">
                          ساخت و دانلود خودکار پکیج dist.zip
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          کامپایل خودکار کدهای برنامه و ساخت پکیج نهایی قابل آپلود بدون نیاز به اجرای دستی دستورات ترمینال
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Build & Download buttons */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {/* Build Button ("ساخت پکیج") */}
                    <button
                      type="button"
                      onClick={handleBuildPackage}
                      disabled={buildingPackage}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
                    >
                      {buildingPackage ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          <span>در حال ساخت پکیج...</span>
                        </>
                      ) : (
                        <>
                          <Cpu className="w-4 h-4" />
                          <span>ساخت پکیج</span>
                        </>
                      )}
                    </button>

                    {/* Download Button ("دانلود پکیج") */}
                    <button
                      type="button"
                      onClick={handleDownloadPackage}
                      disabled={!buildStatus?.exists || downloadingPackage}
                      className={`px-5 py-2.5 font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 ${
                        buildStatus?.exists && !downloadingPackage
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
                      }`}
                    >
                      {downloadingPackage ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          <span>در حال دریافت...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>دانلود پکیج</span>
                          {buildStatus?.exists && buildStatus?.sizeMB && (
                            <span className="text-[9px] bg-emerald-700/60 text-white px-2 py-0.5 rounded-md font-mono dir-ltr">
                              ({buildStatus.sizeMB} MB)
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  </div>

                  {/* Status & Build output message */}
                  {buildingPackage && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-xl text-blue-700 dark:text-blue-300 text-xs flex items-center gap-2 font-bold animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-blue-500" />
                      <span>دستورات npm install و npm run build در حال اجرا بر روی سرور هستند. لطفاً تا اتمام ساخت شکیبا باشید...</span>
                    </div>
                  )}

                  {buildError && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 rounded-xl text-xs flex items-center gap-2 font-bold">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{buildError}</span>
                    </div>
                  )}

                  {buildSuccess && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs flex items-center gap-2 font-bold">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                      <span>{buildSuccess}</span>
                    </div>
                  )}

                  {/* Package contents specs */}
                  <div className="pt-2 border-t border-indigo-100 dark:border-indigo-900/40 text-[10px] space-y-1.5 text-slate-600 dark:text-slate-400">
                    <p className="font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-indigo-500" />
                      <span>ساختار و محتویات پکیج خروجی (dist.zip):</span>
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-white/80 dark:bg-slate-950/40 p-3 rounded-xl border border-indigo-100/60 dark:border-slate-800">
                      <div>
                        <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">📁 پوشه‌ها:</span>
                        <ul className="list-disc list-inside space-y-0.5 font-mono text-[9px] text-slate-500 dark:text-slate-400 dir-ltr text-right">
                          <li>assets/</li>
                          <li>data/</li>
                          <li>uploads/</li>
                        </ul>
                      </div>

                      <div>
                        <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">📄 فایل‌ها:</span>
                        <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[9px] text-slate-500 dark:text-slate-400 dir-ltr text-right">
                          <li>.htaccess</li>
                          <li>api.php</li>
                          <li>favicon.svg</li>
                          <li>icon-192.png</li>
                          <li>icon-512.png</li>
                          <li>index.html</li>
                          <li>index.php</li>
                          <li>manifest.json</li>
                          <li>server.cjs</li>
                          <li>server.cjs.map</li>
                          <li>sw.js</li>
                          <li>wp-config.json</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>

        {/* Right Side: Security & Theme Accent Customizer */}
        <div className="space-y-6">
          {/* Security / Password Change */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
            <button
              type="button"
              onClick={() => toggleSection('security')}
              className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                  openSections.security ? 'rotate-90 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50' : 'text-slate-500'
                }`}>
                  <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                </div>
                <Key className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">تغییر نام کاربری و رمز عبور (خاتمه نشست‌های قبلی)</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {openSections.security ? 'بستن' : 'باز کردن'}
              </span>
            </button>

            {openSections.security && (
              <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-6 animate-fade-in">
                {/* 1. Change Password Form */}
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-500" />
                    <span>تغییر نام کاربری و رمز عبور کاربر ({currentUser?.name || ''})</span>
                  </h4>

                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed bg-amber-50/60 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
                    <span className="font-extrabold text-amber-800 dark:text-amber-300">توجه امنیتی:</span> با ثبت و تغییر نام کاربری یا رمز عبور، کلیه نشست‌های فعال قبلی این حساب در تمامی دستگاه‌ها خاتمه یافته و ادامه کار منوط به ورود مجدد با اطلاعات جدید خواهد بود.
                  </p>

                  {passSuccess && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 rounded-xl text-[10px] font-bold">
                      {passSuccess}
                    </div>
                  )}
                  {passError && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40 rounded-xl text-[10px] font-bold">
                      {passError}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">نام کاربری سیستمی جدید</label>
                      <input
                        type="text"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        placeholder="نام کاربری جدید"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-left"
                        dir="ltr"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">رمز عبور جدید (در صورت عدم تغییر، خالی بگذارید)</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="رمز عبور جدید خود را وارد کنید"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-left"
                        dir="ltr"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">تکرار رمز عبور جدید</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="مجددا تکرار نمایید"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-left"
                        dir="ltr"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-sm"
                    >
                      ذخیره اطلاعات و جایگزینی رمز عبور
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Color Schemes / Themes background customizer */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
            <button
              type="button"
              onClick={() => toggleSection('theme')}
              className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                  openSections.theme ? 'rotate-90 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50' : 'text-slate-500'
                }`}>
                  <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                </div>
                <Palette className="w-4 h-4 text-violet-500 shrink-0" />
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">پالت رنگ‌بندی و تم</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {openSections.theme ? 'بستن' : 'باز کردن'}
              </span>
            </button>

            {openSections.theme && (
              <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-5 animate-fade-in">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  تغییر رنگ پس‌زمینه اصلی، پنجره‌ها و منوی کناری نرم‌افزار به صورت دلخواه:
                </p>

                {/* Master Preset Palettes (Collapsible Accordion Window) */}
                <div className="border-2 border-amber-300/80 dark:border-amber-900/80 rounded-2xl bg-amber-50/50 dark:bg-amber-950/25 shadow-xs overflow-hidden transition-all duration-300">
                  <button
                    type="button"
                    onClick={() => setIsUnifiedThemesOpen(!isUnifiedThemesOpen)}
                    className="w-full p-4 flex items-center justify-between gap-3 text-amber-950 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 transition-all cursor-pointer text-right select-none"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 dark:bg-amber-400/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[12px] font-black flex items-center gap-2">
                          <span>پالت‌های تم کامل و یکپارچه سیستم</span>
                          <span className="text-[9px] font-bold bg-amber-200/80 dark:bg-amber-900/70 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded-full">
                            ۱۵ تم اختصاصی
                          </span>
                        </div>
                        <p className="text-[10px] text-amber-800/70 dark:text-amber-300/60 font-medium">
                          تغییر همزمان و هماهنگ داشبورد، کارت‌ها، منوی کناری و پنجره‌های پاپ‌آپ
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-2.5 py-1 rounded-lg">
                        {isUnifiedThemesOpen ? 'بستن کشو' : 'باز کردن کشو'}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-amber-600 dark:text-amber-400 transition-transform duration-300 ${
                          isUnifiedThemesOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {isUnifiedThemesOpen && (
                    <div className="p-4 pt-1 border-t border-amber-200/60 dark:border-amber-900/50 space-y-3 animate-fade-in">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pt-1">
                        {[
                          {
                            id: 'classic_navy',
                            name: 'سورمه‌ای کلاسیک',
                            tag: 'استاندارد',
                            Icon: Landmark,
                            iconColor: 'text-blue-600 dark:text-blue-400',
                            iconBg: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800/60',
                            dots: ['#f1f5f9', '#ffffff', '#1e293b', '#3b82f6'],
                            lightDash: '#f1f5f9', darkDash: '#090d16',
                            lightPanel: '#ffffff', darkPanel: '#111827',
                            lightSide: '#1e293b', darkSide: '#090d16',
                            lightPopup: '#ffffff', darkPopup: '#111827',
                            popupRadius: '24px', popupShadow: 'xl', popupBgOpacity: '100',
                            lightPopupOverlay: '#090d16', darkPopupOverlay: '#090d16', popupOverlayOpacity: '70'
                          },
                          {
                            id: 'ocean_deep',
                            name: 'اقیانوسی مدرن',
                            tag: 'آرامش‌بخش',
                            Icon: Waves,
                            iconColor: 'text-sky-600 dark:text-sky-400',
                            iconBg: 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800/60',
                            dots: ['#e0f2fe', '#f0f9ff', '#0c4a6e', '#0284c7'],
                            lightDash: '#e0f2fe', darkDash: '#030712',
                            lightPanel: '#f0f9ff', darkPanel: '#0c2840',
                            lightSide: '#0c4a6e', darkSide: '#082f49',
                            lightPopup: '#e0f2fe', darkPopup: '#083344',
                            popupRadius: '20px', popupShadow: '2xl', popupBgOpacity: '98',
                            lightPopupOverlay: '#082f49', darkPopupOverlay: '#030712', popupOverlayOpacity: '65'
                          },
                          {
                            id: 'emerald_forest',
                            name: 'سبز زمردی / زیتونی',
                            tag: 'طبیعت و ثروت',
                            Icon: Leaf,
                            iconColor: 'text-emerald-600 dark:text-emerald-400',
                            iconBg: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60',
                            dots: ['#dcfce7', '#f0fdf4', '#064e3b', '#10b981'],
                            lightDash: '#dcfce7', darkDash: '#022c22',
                            lightPanel: '#f0fdf4', darkPanel: '#064e3b',
                            lightSide: '#064e3b', darkSide: '#022c22',
                            lightPopup: '#dcfce7', darkPopup: '#044333',
                            popupRadius: '24px', popupShadow: 'xl', popupBgOpacity: '100',
                            lightPopupOverlay: '#022c22', darkPopupOverlay: '#022c22', popupOverlayOpacity: '60'
                          },
                          {
                            id: 'royal_purple',
                            name: 'بنفش سلطنتی',
                            tag: 'لوکس و فاخر',
                            Icon: Crown,
                            iconColor: 'text-violet-600 dark:text-violet-400',
                            iconBg: 'bg-violet-50 dark:bg-violet-950/60 border-violet-200 dark:border-violet-800/60',
                            dots: ['#f3e8ff', '#faf5ff', '#3b0764', '#8b5cf6'],
                            lightDash: '#f3e8ff', darkDash: '#1e1b4b',
                            lightPanel: '#faf5ff', darkPanel: '#312e81',
                            lightSide: '#3b0764', darkSide: '#1e1b4b',
                            lightPopup: '#f3e8ff', darkPopup: '#3b0764',
                            popupRadius: '28px', popupShadow: '2xl', popupBgOpacity: '98',
                            lightPopupOverlay: '#1e1b4b', darkPopupOverlay: '#1e1b4b', popupOverlayOpacity: '65'
                          },
                          {
                            id: 'minimal_light',
                            name: 'روشن و مینیمال',
                            tag: 'ساده و شفاف',
                            Icon: Sun,
                            iconColor: 'text-amber-500 dark:text-amber-400',
                            iconBg: 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/60',
                            dots: ['#e2e8f0', '#f8fafc', '#f1f5f9', '#64748b'],
                            lightDash: '#e2e8f0', darkDash: '#090d16',
                            lightPanel: '#f8fafc', darkPanel: '#111827',
                            lightSide: '#f1f5f9', darkSide: '#090d16',
                            lightPopup: '#f1f5f9', darkPopup: '#111827',
                            popupRadius: '16px', popupShadow: 'md', popupBgOpacity: '100',
                            lightPopupOverlay: '#090d16', darkPopupOverlay: '#090d16', popupOverlayOpacity: '70'
                          },
                          {
                            id: 'amber_gold',
                            name: 'طلایی و کهربایی',
                            tag: 'درخشان و گرم',
                            Icon: Sparkles,
                            iconColor: 'text-amber-600 dark:text-amber-400',
                            iconBg: 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/60',
                            dots: ['#fef3c7', '#fffbeb', '#78350f', '#d97706'],
                            lightDash: '#fef3c7', darkDash: '#1c1917',
                            lightPanel: '#fffbeb', darkPanel: '#292524',
                            lightSide: '#78350f', darkSide: '#1c1917',
                            lightPopup: '#fef3c7', darkPopup: '#451a03',
                            popupRadius: '24px', popupShadow: '2xl', popupBgOpacity: '100',
                            lightPopupOverlay: '#1c1917', darkPopupOverlay: '#1c1917', popupOverlayOpacity: '70'
                          },
                          {
                            id: 'cyber_midnight',
                            name: 'تاریکی نئونی / سایبر',
                            tag: 'تکنولوژی',
                            Icon: Terminal,
                            iconColor: 'text-cyan-500 dark:text-cyan-400',
                            iconBg: 'bg-slate-900 border-cyan-500/40 text-cyan-400',
                            dots: ['#e0f2fe', '#f0fdfa', '#0f172a', '#06b6d4'],
                            lightDash: '#e0f2fe', darkDash: '#020617',
                            lightPanel: '#f0fdfa', darkPanel: '#090d16',
                            lightSide: '#0f172a', darkSide: '#020617',
                            lightPopup: '#cffafe', darkPopup: '#0b1329',
                            popupRadius: '12px', popupShadow: '2xl', popupBgOpacity: '95',
                            lightPopupOverlay: '#020617', darkPopupOverlay: '#020617', popupOverlayOpacity: '80'
                          },
                          {
                            id: 'ruby_rose',
                            name: 'رزگلد و یاقوتی',
                            tag: 'ظریف و خاص',
                            Icon: Gem,
                            iconColor: 'text-rose-600 dark:text-rose-400',
                            iconBg: 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/60',
                            dots: ['#ffe4e6', '#fff1f2', '#881337', '#e11d48'],
                            lightDash: '#ffe4e6', darkDash: '#2b0a16',
                            lightPanel: '#fff1f2', darkPanel: '#4c0519',
                            lightSide: '#881337', darkSide: '#2b0a16',
                            lightPopup: '#ffe4e6', darkPopup: '#4c0519',
                            popupRadius: '24px', popupShadow: 'xl', popupBgOpacity: '98',
                            lightPopupOverlay: '#2b0a16', darkPopupOverlay: '#2b0a16', popupOverlayOpacity: '65'
                          },
                          {
                            id: 'warm_espresso',
                            name: 'قهوه و چوب گرم',
                            tag: 'آرامش و وقار',
                            Icon: Coffee,
                            iconColor: 'text-amber-800 dark:text-amber-500',
                            iconBg: 'bg-amber-100/50 dark:bg-amber-950/70 border-amber-300 dark:border-amber-800/70',
                            dots: ['#fef3c7', '#fefce8', '#451a03', '#92400e'],
                            lightDash: '#fef3c7', darkDash: '#1c120c',
                            lightPanel: '#fefce8', darkPanel: '#2e1b12',
                            lightSide: '#451a03', darkSide: '#1c120c',
                            lightPopup: '#fef3c7', darkPopup: '#2b1810',
                            popupRadius: '20px', popupShadow: 'xl', popupBgOpacity: '100',
                            lightPopupOverlay: '#1c120c', darkPopupOverlay: '#1c120c', popupOverlayOpacity: '65'
                          },
                          {
                            id: 'nordic_aurora',
                            name: 'شفق قطبی / یخی',
                            tag: 'خنک و دلنشین',
                            Icon: Compass,
                            iconColor: 'text-teal-600 dark:text-teal-400',
                            iconBg: 'bg-teal-50 dark:bg-teal-950/60 border-teal-200 dark:border-teal-800/60',
                            dots: ['#ccfbf1', '#f0fdfa', '#115e59', '#14b8a6'],
                            lightDash: '#ccfbf1', darkDash: '#042f2e',
                            lightPanel: '#f0fdfa', darkPanel: '#134e4a',
                            lightSide: '#115e59', darkSide: '#042f2e',
                            lightPopup: '#ccfbf1', darkPopup: '#115e59',
                            popupRadius: '24px', popupShadow: 'xl', popupBgOpacity: '98',
                            lightPopupOverlay: '#042f2e', darkPopupOverlay: '#042f2e', popupOverlayOpacity: '60'
                          },
                          {
                            id: 'autumn_sunset',
                            name: 'غروب پاییزی',
                            tag: 'گرم و پویا',
                            Icon: Flame,
                            iconColor: 'text-orange-600 dark:text-orange-400',
                            iconBg: 'bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800/60',
                            dots: ['#ffedd5', '#fff7ed', '#7c2d12', '#ea580c'],
                            lightDash: '#ffedd5', darkDash: '#2a1205',
                            lightPanel: '#fff7ed', darkPanel: '#431407',
                            lightSide: '#7c2d12', darkSide: '#2a1205',
                            lightPopup: '#ffedd5', darkPopup: '#431407',
                            popupRadius: '24px', popupShadow: 'xl', popupBgOpacity: '100',
                            lightPopupOverlay: '#2a1205', darkPopupOverlay: '#2a1205', popupOverlayOpacity: '65'
                          },
                          {
                            id: 'titanium_graphite',
                            name: 'تیتانیوم گرافیت',
                            tag: 'صنعتی و خنثی',
                            Icon: Cpu,
                            iconColor: 'text-slate-600 dark:text-slate-300',
                            iconBg: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700',
                            dots: ['#e2e8f0', '#f1f5f9', '#27272a', '#475569'],
                            lightDash: '#e2e8f0', darkDash: '#09090b',
                            lightPanel: '#f1f5f9', darkPanel: '#18181b',
                            lightSide: '#27272a', darkSide: '#09090b',
                            lightPopup: '#e2e8f0', darkPopup: '#18181b',
                            popupRadius: '16px', popupShadow: 'xl', popupBgOpacity: '100',
                            lightPopupOverlay: '#09090b', darkPopupOverlay: '#09090b', popupOverlayOpacity: '70'
                          },
                          {
                            id: 'sky_azure',
                            name: 'لاجوردی آسمانی',
                            tag: 'پرانرژی',
                            Icon: Globe,
                            iconColor: 'text-blue-500 dark:text-blue-400',
                            iconBg: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800/60',
                            dots: ['#dbeafe', '#eff6ff', '#0369a1', '#2563eb'],
                            lightDash: '#dbeafe', darkDash: '#082f49',
                            lightPanel: '#eff6ff', darkPanel: '#075985',
                            lightSide: '#0369a1', darkSide: '#082f49',
                            lightPopup: '#dbeafe', darkPopup: '#0c4a6e',
                            popupRadius: '22px', popupShadow: 'xl', popupBgOpacity: '98',
                            lightPopupOverlay: '#082f49', darkPopupOverlay: '#082f49', popupOverlayOpacity: '60'
                          },
                          {
                            id: 'velvet_obsidian',
                            name: 'تاریکی مخملی',
                            tag: 'دارک خالص',
                            Icon: Moon,
                            iconColor: 'text-indigo-400 dark:text-indigo-300',
                            iconBg: 'bg-slate-950 border-indigo-500/30 text-indigo-300',
                            dots: ['#e0e7ff', '#eef2ff', '#121124', '#4f46e5'],
                            lightDash: '#e0e7ff', darkDash: '#050508',
                            lightPanel: '#eef2ff', darkPanel: '#101018',
                            lightSide: '#121124', darkSide: '#050508',
                            lightPopup: '#e0e7ff', darkPopup: '#121124',
                            popupRadius: '24px', popupShadow: '2xl', popupBgOpacity: '95',
                            lightPopupOverlay: '#050508', darkPopupOverlay: '#050508', popupOverlayOpacity: '80'
                          },
                          {
                            id: 'modern_pastel',
                            name: 'پاستلی مدرن',
                            tag: 'هارمونیک و ملایم',
                            Icon: Palette,
                            iconColor: 'text-fuchsia-600 dark:text-fuchsia-400',
                            iconBg: 'bg-fuchsia-50 dark:bg-fuchsia-950/60 border-fuchsia-200 dark:border-fuchsia-800/60',
                            dots: ['#fae8ff', '#faf5ff', '#4a4063', '#d946ef'],
                            lightDash: '#fae8ff', darkDash: '#181824',
                            lightPanel: '#faf5ff', darkPanel: '#27273a',
                            lightSide: '#4a4063', darkSide: '#181824',
                            lightPopup: '#fae8ff', darkPopup: '#381e4b',
                            popupRadius: '28px', popupShadow: 'lg', popupBgOpacity: '100',
                            lightPopupOverlay: '#181824', darkPopupOverlay: '#181824', popupOverlayOpacity: '50'
                          },
                        ].map((palette) => {
                          const IconComp = palette.Icon;
                          const isSelected = lightDashboardBg === palette.lightDash && darkDashboardBg === palette.darkDash && lightPanelBg === palette.lightPanel && darkPanelBg === palette.darkPanel;

                          return (
                            <button
                              key={palette.id}
                              type="button"
                              title={`${palette.name} (${palette.tag}) - کلیک برای تغییر سراسری تم، پنجره‌ها، کارت‌ها و منو`}
                              onClick={() => {
                                // 1. Dashboard
                                setLightDashboardBg(palette.lightDash);
                                setDarkDashboardBg(palette.darkDash);
                                saveThemeVal('lightDashboardBg', palette.lightDash);
                                saveThemeVal('darkDashboardBg', palette.darkDash);

                                // 2. Panels / Cards / Tables
                                setLightPanelBg(palette.lightPanel);
                                setDarkPanelBg(palette.darkPanel);
                                saveThemeVal('lightPanelBg', palette.lightPanel);
                                saveThemeVal('darkPanelBg', palette.darkPanel);

                                // 3. Sidebar
                                setLightSidebarBg(palette.lightSide);
                                setDarkSidebarBg(palette.darkSide);
                                saveThemeVal('lightSidebarBg', palette.lightSide);
                                saveThemeVal('darkSidebarBg', palette.darkSide);

                                // 4. Popups & Modal Windows
                                setLightPopupBg(palette.lightPopup);
                                setDarkPopupBg(palette.darkPopup);
                                saveThemeVal('lightPopupBg', palette.lightPopup);
                                saveThemeVal('darkPopupBg', palette.darkPopup);

                                setPopupBgOpacity(palette.popupBgOpacity);
                                saveThemeVal('popupBgOpacity', palette.popupBgOpacity);

                                setLightPopupOverlay(palette.lightPopupOverlay);
                                setDarkPopupOverlay(palette.darkPopupOverlay);
                                saveThemeVal('lightPopupOverlay', palette.lightPopupOverlay);
                                saveThemeVal('darkPopupOverlay', palette.darkPopupOverlay);

                                setPopupOverlayOpacity(palette.popupOverlayOpacity);
                                saveThemeVal('popupOverlayOpacity', palette.popupOverlayOpacity);

                                setPopupBorderRadius(palette.popupRadius);
                                saveThemeVal('popupBorderRadius', palette.popupRadius);

                                setPopupShadow(palette.popupShadow);
                                saveThemeVal('popupShadow', palette.popupShadow);
                              }}
                              className={`p-3 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col items-center justify-between text-center relative group select-none shadow-2xs hover:shadow-md hover:scale-103 ${
                                isSelected
                                  ? 'bg-amber-100/90 dark:bg-amber-900/60 border-amber-500 dark:border-amber-400 ring-2 ring-amber-500/30'
                                  : 'bg-white hover:bg-amber-50/80 dark:bg-slate-900/80 dark:hover:bg-slate-800 border-amber-200/80 dark:border-slate-800'
                              }`}
                            >
                              {isSelected && (
                                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </div>
                              )}

                              {/* Icon Badge */}
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-2xs transition-transform group-hover:scale-110 mb-2 ${palette.iconBg}`}>
                                <IconComp className={`w-5 h-5 ${palette.iconColor}`} />
                              </div>

                              {/* Name & Tag */}
                              <div className="space-y-0.5 w-full">
                                <span className="text-[10px] font-black text-slate-800 dark:text-slate-100 block truncate leading-tight">
                                  {palette.name}
                                </span>
                                <span className="text-[8px] font-bold text-slate-400 dark:text-slate-400 block truncate">
                                  {palette.tag}
                                </span>
                              </div>

                              {/* 4-Color Swatch Preview (Dash, Panel, Side, Popup) */}
                              <div className="flex items-center justify-center gap-1 mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 w-full">
                                {palette.dots.map((dotColor, dotIdx) => (
                                  <span
                                    key={dotIdx}
                                    style={{ backgroundColor: dotColor }}
                                    className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-600 shadow-2xs inline-block shrink-0"
                                    title={dotIdx === 0 ? 'داشبورد' : dotIdx === 1 ? 'کارت‌ها' : dotIdx === 2 ? 'منوی کناری' : 'پنجره‌ها'}
                                  />
                                ))}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 1. Dashboard Background Customizer */}
                <div className="p-4 border border-slate-200/60 dark:border-slate-800/60 rounded-xl space-y-4 bg-white/50 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">۱. رنگ اصلی داشبورد</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                        <span className="text-[9px] font-bold text-slate-500">حالت روشن:</span>
                        <input 
                          type="color" 
                          value={lightDashboardBg} 
                          onChange={(e) => {
                            setLightDashboardBg(e.target.value);
                            saveThemeVal('lightDashboardBg', e.target.value);
                          }}
                          className="w-5 h-5 rounded cursor-pointer border-0"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                        <span className="text-[9px] font-bold text-slate-500">حالت تاریک:</span>
                        <input 
                          type="color" 
                          value={darkDashboardBg} 
                          onChange={(e) => {
                            setDarkDashboardBg(e.target.value);
                            saveThemeVal('darkDashboardBg', e.target.value);
                          }}
                          className="w-5 h-5 rounded cursor-pointer border-0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-slate-400 block">پالت‌های پیشنهادی پس‌زمینه:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { name: 'روشن استاندارد', light: '#f8fafc', dark: '#0f172a' },
                        { name: 'آرامش نعنایی', light: '#f0fdf4', dark: '#022c22' },
                        { name: 'گرم کویری', light: '#fffbeb', dark: '#1c1917' },
                        { name: 'خاکستری سرد', light: '#f1f5f9', dark: '#09090b' },
                      ].map((preset, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setLightDashboardBg(preset.light);
                            setDarkDashboardBg(preset.dark);
                            saveThemeVal('lightDashboardBg', preset.light);
                            saveThemeVal('darkDashboardBg', preset.dark);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[9px] font-bold rounded text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 2. Windows and Cards Background Customizer */}
                <div className="p-4 border border-slate-200/60 dark:border-slate-800/60 rounded-xl space-y-4 bg-white/50 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">۲. رنگ کارت‌ها و جداول</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                        <span className="text-[9px] font-bold text-slate-500">حالت روشن:</span>
                        <input 
                          type="color" 
                          value={lightPanelBg} 
                          onChange={(e) => {
                            setLightPanelBg(e.target.value);
                            saveThemeVal('lightPanelBg', e.target.value);
                          }}
                          className="w-5 h-5 rounded cursor-pointer border-0"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                        <span className="text-[9px] font-bold text-slate-500">حالت تاریک:</span>
                        <input 
                          type="color" 
                          value={darkPanelBg} 
                          onChange={(e) => {
                            setDarkPanelBg(e.target.value);
                            saveThemeVal('darkPanelBg', e.target.value);
                          }}
                          className="w-5 h-5 rounded cursor-pointer border-0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-slate-400 block">پالت‌های پیشنهادی کارت‌ها و جداول:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { name: 'سفید کلاسیک', light: '#ffffff', dark: '#1e293b' },
                        { name: 'اقیانوسی ملایم', light: '#f0f9ff', dark: '#0c2840' },
                        { name: 'سبز زمردی ملایم', light: '#f0fdf4', dark: '#064e3b' },
                        { name: 'بنفش لوکس ملایم', light: '#faf5ff', dark: '#312e81' },
                        { name: 'طلایی کهربایی', light: '#fffbeb', dark: '#292524' },
                        { name: 'رزگلد یاقوتی', light: '#fff1f2', dark: '#4c0519' },
                        { name: 'شفق یخی قطبی', light: '#f0fdfa', dark: '#134e4a' },
                        { name: 'غروب پاییزی ملایم', light: '#fff7ed', dark: '#431407' },
                        { name: 'کرم قهوه گرم', light: '#fefce8', dark: '#2e1b12' },
                        { name: 'خاکستری گرافیت', light: '#f1f5f9', dark: '#18181b' },
                      ].map((preset, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setLightPanelBg(preset.light);
                            setDarkPanelBg(preset.dark);
                            saveThemeVal('lightPanelBg', preset.light);
                            saveThemeVal('darkPanelBg', preset.dark);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[9px] font-bold rounded text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3. Sidebar Menu Background Customizer */}
                <div className="p-4 border border-slate-200/60 dark:border-slate-800/60 rounded-xl space-y-4 bg-white/50 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">۳. رنگ منوی کناری</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                        <span className="text-[9px] font-bold text-slate-500">حالت روشن:</span>
                        <input 
                          type="color" 
                          value={lightSidebarBg} 
                          onChange={(e) => {
                            setLightSidebarBg(e.target.value);
                            saveThemeVal('lightSidebarBg', e.target.value);
                          }}
                          className="w-5 h-5 rounded cursor-pointer border-0"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                        <span className="text-[9px] font-bold text-slate-500">حالت تاریک:</span>
                        <input 
                          type="color" 
                          value={darkSidebarBg} 
                          onChange={(e) => {
                            setDarkSidebarBg(e.target.value);
                            saveThemeVal('darkSidebarBg', e.target.value);
                          }}
                          className="w-5 h-5 rounded cursor-pointer border-0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-slate-400 block">پالت‌های پیشنهادی منو:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { name: 'سورمه‌ای تیره', light: '#1e293b', dark: '#0f172a' },
                        { name: 'مشکی خالص', light: '#0f172a', dark: '#09090b' },
                        { name: 'مدرن و روشن', light: '#f8fafc', dark: '#1e293b' },
                        { name: 'سلطنتی بنفش', light: '#3b0764', dark: '#1e1b4b' },
                      ].map((preset, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setLightSidebarBg(preset.light);
                            setDarkSidebarBg(preset.dark);
                            saveThemeVal('lightSidebarBg', preset.light);
                            saveThemeVal('darkSidebarBg', preset.dark);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[9px] font-bold rounded text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. Global Popup / Modal Appearance Customizer */}
                <div className="p-4 border-2 border-indigo-200 dark:border-indigo-900/60 rounded-xl space-y-5 bg-indigo-50/30 dark:bg-slate-900/60 shadow-sm relative overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-indigo-100 dark:border-indigo-900/40">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-sm">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                          ۴. تنظیمات Popup ها (پنجره‌های شناور / Modals)
                          <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[9px] font-black rounded-full">
                            Global
                          </span>
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          اعمال یکپارچه بر تمام پنجره‌ها، مودال‌ها و دیالوگ‌های سراسری سیستم
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDemoModal(true)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black rounded-xl transition-all shadow-md hover:shadow-indigo-500/20 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>تست و پیش‌نمایش زنده Popup</span>
                      </button>

                      <button
                        type="button"
                        onClick={onResetPopupDefaults}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                        title="بازگردانی تمام تنظیمات پنجره‌ها به حالت اولیه"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                        <span>بازگردانی به تنظیمات پیش‌فرض</span>
                      </button>
                    </div>
                  </div>

                  {/* Popup Settings Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* a. Popup Background Color */}
                    <div className="p-3.5 bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">
                          رنگ پس‌زمینه Popup
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                            <span className="text-[9px] font-bold text-slate-500">روشن:</span>
                            <input
                              type="color"
                              value={lightPopupBg}
                              onChange={(e) => {
                                setLightPopupBg(e.target.value);
                                saveThemeVal('lightPopupBg', e.target.value);
                              }}
                              className="w-5 h-5 rounded cursor-pointer border-0"
                            />
                          </div>
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                            <span className="text-[9px] font-bold text-slate-500">تاریک:</span>
                            <input
                              type="color"
                              value={darkPopupBg}
                              onChange={(e) => {
                                setDarkPopupBg(e.target.value);
                                saveThemeVal('darkPopupBg', e.target.value);
                              }}
                              className="w-5 h-5 rounded cursor-pointer border-0"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-slate-400 block">میان‌بر رنگ پس‌زمینه:</span>
                        <div className="flex flex-wrap gap-1">
                          {[
                            { name: 'سفید خالص', light: '#ffffff', dark: '#1e293b' },
                            { name: 'تیره عمیق', light: '#f8fafc', dark: '#0f172a' },
                            { name: 'مشکی زغالی', light: '#f1f5f9', dark: '#18181b' },
                            { name: 'آبی شب', light: '#eef2ff', dark: '#1e1b4b' },
                          ].map((preset, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setLightPopupBg(preset.light);
                                setDarkPopupBg(preset.dark);
                                saveThemeVal('lightPopupBg', preset.light);
                                saveThemeVal('darkPopupBg', preset.dark);
                              }}
                              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[9px] font-bold rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* a2. Popup Background Opacity Slider (0 to 100%) */}
                    <div className="p-3.5 bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">
                          درصد شفافیت (Opacity) پس‌زمینه Popup
                        </span>
                        <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-black rounded-lg">
                          {popupBgOpacity}%
                        </span>
                      </div>

                      <div className="space-y-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={popupBgOpacity}
                          onChange={(e) => {
                            setPopupBgOpacity(e.target.value);
                            saveThemeVal('popupBgOpacity', e.target.value);
                          }}
                          className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
                        />

                        <div className="flex justify-between items-center text-[9px] font-bold text-slate-400">
                          <span>۰٪ (کاملاً شفاف/شیشه‌ای)</span>
                          <span>۷۵٪ (نیمه‌شفاف)</span>
                          <span>۱۰۰٪ (پوشش کامل/مات)</span>
                        </div>

                        <div className="flex gap-1 pt-1">
                          {['30', '50', '70', '85', '100'].map((op) => (
                            <button
                              key={op}
                              type="button"
                              onClick={() => {
                                setPopupBgOpacity(op);
                                saveThemeVal('popupBgOpacity', op);
                              }}
                              className={`px-2 py-0.5 text-[9px] font-bold rounded cursor-pointer transition-all ${
                                popupBgOpacity === op
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {op}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* b. Overlay Color Behind Popup */}
                    <div className="p-3.5 bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">
                          رنگ Overlay پشت Popup
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                            <span className="text-[9px] font-bold text-slate-500">روشن:</span>
                            <input
                              type="color"
                              value={lightPopupOverlay}
                              onChange={(e) => {
                                setLightPopupOverlay(e.target.value);
                                saveThemeVal('lightPopupOverlay', e.target.value);
                              }}
                              className="w-5 h-5 rounded cursor-pointer border-0"
                            />
                          </div>
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                            <span className="text-[9px] font-bold text-slate-500">تاریک:</span>
                            <input
                              type="color"
                              value={darkPopupOverlay}
                              onChange={(e) => {
                                setDarkPopupOverlay(e.target.value);
                                saveThemeVal('darkPopupOverlay', e.target.value);
                              }}
                              className="w-5 h-5 rounded cursor-pointer border-0"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[9px] font-bold text-slate-400 block">میان‌بر رنگ Overlay:</span>
                        <div className="flex flex-wrap gap-1">
                          {[
                            { name: 'سورمه‌ای', light: '#0f172a', dark: '#0f172a' },
                            { name: 'مشکی خالص', light: '#000000', dark: '#000000' },
                            { name: 'دودی تیره', light: '#18181b', dark: '#09090b' },
                            { name: 'بنفش شب', light: '#1e1b4b', dark: '#0f0d2e' },
                          ].map((preset, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setLightPopupOverlay(preset.light);
                                setDarkPopupOverlay(preset.dark);
                                saveThemeVal('lightPopupOverlay', preset.light);
                                saveThemeVal('darkPopupOverlay', preset.dark);
                              }}
                              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[9px] font-bold rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* c. Overlay Opacity Slider (0 to 100%) */}
                    <div className="p-3.5 bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">
                          درصد شفافیت (Opacity) Overlay
                        </span>
                        <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-black rounded-lg">
                          {popupOverlayOpacity}%
                        </span>
                      </div>

                      <div className="space-y-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={popupOverlayOpacity}
                          onChange={(e) => {
                            setPopupOverlayOpacity(e.target.value);
                            saveThemeVal('popupOverlayOpacity', e.target.value);
                          }}
                          className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
                        />

                        <div className="flex justify-between items-center text-[9px] font-bold text-slate-400">
                          <span>۰٪ (کاملاً شفاف)</span>
                          <span>۶۰٪ (پیش‌فرض)</span>
                          <span>۱۰۰٪ (کاملاً کدر)</span>
                        </div>

                        <div className="flex gap-1 pt-1">
                          {['20', '40', '60', '80', '95'].map((op) => (
                            <button
                              key={op}
                              type="button"
                              onClick={() => {
                                setPopupOverlayOpacity(op);
                                saveThemeVal('popupOverlayOpacity', op);
                              }}
                              className={`px-2 py-0.5 text-[9px] font-bold rounded cursor-pointer transition-all ${
                                popupOverlayOpacity === op
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {op}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* d. Border Radius Settings */}
                    <div className="p-3.5 bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">
                          شعاع انحنای زوایا (Border Radius)
                        </span>
                        <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-black rounded-lg">
                          {popupBorderRadius}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { label: '۰px (تیز)', value: '0px' },
                          { label: '۸px (کم)', value: '8px' },
                          { label: '۱۲px (متوسط)', value: '12px' },
                          { label: '۱۶px (استاندارد)', value: '16px' },
                          { label: '۲۴px (گرد)', value: '24px' },
                          { label: '۳۲px (کامل)', value: '32px' },
                        ].map((rad) => (
                          <button
                            key={rad.value}
                            type="button"
                            onClick={() => {
                              setPopupBorderRadius(rad.value);
                              saveThemeVal('popupBorderRadius', rad.value);
                            }}
                            className={`py-1.5 px-2 text-[9px] font-bold rounded-lg cursor-pointer transition-all ${
                              popupBorderRadius === rad.value
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {rad.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* e. Shadow Setting */}
                    <div className="p-3.5 bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-3 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">
                          میزان سایه و برجستگی (Shadow)
                        </span>
                        <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-black rounded-lg uppercase">
                          {popupShadow}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5">
                        {[
                          { id: 'none', label: 'بدون سایه' },
                          { id: 'sm', label: 'سایه ملایم' },
                          { id: 'md', label: 'سایه متوسط' },
                          { id: 'lg', label: 'سایه عمیق (پیش‌فرض)' },
                          { id: 'xl', label: 'سایه برجسته' },
                          { id: 'glow', label: 'سایه درخشان' },
                        ].map((sh) => (
                          <button
                            key={sh.id}
                            type="button"
                            onClick={() => {
                              setPopupShadow(sh.id);
                              saveThemeVal('popupShadow', sh.id);
                            }}
                            className={`py-2 px-2 text-[9px] font-black rounded-lg cursor-pointer transition-all text-center ${
                              popupShadow === sh.id
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {sh.label}
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>

                </div>

                {/* Theme Save Confirmation & Reset Controls */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {themeSavedToast ? (
                      <span className="flex items-center gap-1.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 animate-fade-in">
                        <Check className="w-4 h-4 text-emerald-500" />
                        <span>تغییرات رنگ‌بندی و تم با موفقیت اعمال و در پایگاه‌داده ذخیره شد.</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                        <span>رنگ‌ها و تم به صورت خودکار و دائمی در دیتابیس ثبت می‌شوند.</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        // Reset all theme colors to default
                        setLightDashboardBg('#f8fafc');
                        setDarkDashboardBg('#0f172a');
                        saveThemeVal('lightDashboardBg', '#f8fafc');
                        saveThemeVal('darkDashboardBg', '#0f172a');

                        setLightPanelBg('#ffffff');
                        setDarkPanelBg('#1e293b');
                        saveThemeVal('lightPanelBg', '#ffffff');
                        saveThemeVal('darkPanelBg', '#1e293b');

                        setLightSidebarBg('#1e293b');
                        setDarkSidebarBg('#0f172a');
                        saveThemeVal('lightSidebarBg', '#1e293b');
                        saveThemeVal('darkSidebarBg', '#0f172a');

                        onResetPopupDefaults();
                      }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                      <span>بازگردانی تم به پیش‌فرض</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        saveThemeVal('lightDashboardBg', lightDashboardBg);
                        saveThemeVal('darkDashboardBg', darkDashboardBg);
                        saveThemeVal('lightPanelBg', lightPanelBg);
                        saveThemeVal('darkPanelBg', darkPanelBg);
                        saveThemeVal('lightSidebarBg', lightSidebarBg);
                        saveThemeVal('darkSidebarBg', darkSidebarBg);
                        saveThemeVal('lightPopupBg', lightPopupBg);
                        saveThemeVal('darkPopupBg', darkPopupBg);
                        saveThemeVal('popupBgOpacity', popupBgOpacity);
                        saveThemeVal('lightPopupOverlay', lightPopupOverlay);
                        saveThemeVal('darkPopupOverlay', darkPopupOverlay);
                        saveThemeVal('popupOverlayOpacity', popupOverlayOpacity);
                        saveThemeVal('popupBorderRadius', popupBorderRadius);
                        saveThemeVal('popupShadow', popupShadow);
                      }}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-black rounded-xl transition-all shadow-md hover:shadow-violet-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>ثبت و ذخیره نهایی تم</span>
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Seller Information Settings */}
          {currentUser?.role !== 'seller' && (
            <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
              <button
                type="button"
                onClick={() => toggleSection('sellerInfo')}
                className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                    openSections.sellerInfo ? 'rotate-90 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50' : 'text-slate-500'
                  }`}>
                    <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                  </div>
                  <Landmark className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200">تنظیمات اطلاعات فروشگاه / فروشنده</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  {openSections.sellerInfo ? 'بستن' : 'باز کردن'}
                </span>
              </button>

              {openSections.sellerInfo && (
                <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-4 animate-fade-in">
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    تنظیم اطلاعات پایه فروشنده جهت درج در بخش پایینی پیش‌نمایش زنده و چاپ فاکتورها:
                  </p>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">نام فروشگاه / نام فروشنده (عنوان سربرگ فاکتور)</label>
                      <input
                        type="text"
                        value={sellerName}
                        onChange={async (e) => {
                          const val = e.target.value;
                          await saveSellerName(val);
                        }}
                        placeholder="مثال: فروشگاه قطعات و خدمات مرکزی"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">شماره کارت</label>
                      <input
                        type="text"
                        value={sellerRegNo}
                        onChange={async (e) => {
                          const val = e.target.value;
                          await saveSellerRegNo(val);
                        }}
                        placeholder="مثال: ۶۰۳۷۹۹۷۵۱۲۳۴۵۶۷۸"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-mono text-left"
                        dir="ltr"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">شماره تماس عمومی فروشگاه (تلفن پیش‌فرض)</label>
                      <input
                        type="text"
                        value={sellerPhone}
                        onChange={async (e) => {
                          const val = e.target.value;
                          await saveSellerPhone(val);
                        }}
                        placeholder="مثال: 02188888888"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-mono text-left"
                        dir="ltr"
                      />
                    </div>

                    <div className="space-y-1.5 p-3.5 bg-blue-50/70 dark:bg-slate-800/60 border border-blue-200/80 dark:border-slate-700/80 rounded-xl">
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                        <label className="text-[10px] font-bold text-blue-900 dark:text-blue-300">
                          شماره تماس اختصاصی شما ({currentUser?.name || 'فروشنده فعلی'})
                        </label>
                        <span className="text-[9px] text-blue-600 dark:text-blue-400 font-medium">درج مستقیم در فاکتورهای صادر شده توسط شما</span>
                      </div>
                      <input
                        type="text"
                        value={currentUserPhone}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCurrentUserPhone(val);
                          if (onUpdateUsersList && Array.isArray(users)) {
                            const updated = users.map(u => u.id === currentUser.id ? { ...u, phone: val } : u);
                            onUpdateUsersList(updated);
                          }
                        }}
                        placeholder="مثال: 09123456789"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-blue-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-mono text-left focus:ring-2 focus:ring-blue-500/30"
                        dir="ltr"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">نشانی دفتر مرکزی / فروشگاه</label>
                      <textarea
                        value={sellerAddress}
                        onChange={async (e) => {
                          const val = e.target.value;
                          await saveSellerAddress(val);
                        }}
                        placeholder="مثال: تهران، برج نگین طرشت"
                        rows={2}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 resize-none leading-relaxed"
                      />
                    </div>
                    
                    <div className="text-[9px] text-emerald-600 font-bold flex items-center gap-1 mt-1 justify-end">
                      <Check className="w-3 h-3" />
                      <span>تغییرات به طور خودکار ذخیره شدند.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Paper Size & Orientation Settings for Invoice Preview & Print */}
          {currentUser?.role !== 'seller' && (
            <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
              <button
                type="button"
                onClick={() => toggleSection('paper')}
                className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                    openSections.paper ? 'rotate-90 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50' : 'text-slate-500'
                  }`}>
                    <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                  </div>
                  <FileText className="w-4 h-4 text-purple-500 shrink-0" />
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200">تنظیمات ابعاد کاغذ و جهت چاپ فاکتور</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  {openSections.paper ? 'بستن' : 'باز کردن'}
                </span>
              </button>

              {openSections.paper && (
                <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-4 animate-fade-in">
                  <p className="text-[10px] text-slate-500 leading-relaxed text-right" dir="rtl">
                    سایز کاغذ و جهت چیدمان (عمودی یا افقی) را برای پیش‌نمایش زنده و خروجی چاپی فاکتورها انتخاب کنید:
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" dir="rtl">
                    {[
                      { id: 'A4_portrait', title: 'A4 عمودی', size: '۲۱۰ × ۲۹۷ mm', shape: 'w-6 h-8' },
                      { id: 'A4_landscape', title: 'A4 افقی', size: '۲۹۷ × ۲۱۰ mm', shape: 'w-8 h-6' },
                      { id: 'A5_portrait', title: 'A5 عمودی', size: '۱۴۸ × ۲۱۰ mm', shape: 'w-5 h-7' },
                      { id: 'A5_landscape', title: 'A5 افقی', size: '۲۱۰ × ۱۴۸ mm', shape: 'w-7 h-5' },
                    ].map((paper) => {
                      const isSelected = invoicePaperSize === paper.id;
                      return (
                        <button
                          key={paper.id}
                          type="button"
                          onClick={() => handlePaperSizeChange(paper.id)}
                          className={`p-3 rounded-xl border flex flex-col items-center justify-between space-y-2 text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-900 dark:text-purple-200 shadow-sm ring-2 ring-purple-500/20'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                          }`}
                        >
                          <div className={`border-2 rounded flex items-center justify-center transition-all ${
                            isSelected ? 'border-purple-600 bg-purple-100 dark:bg-purple-900/60' : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                          } ${paper.shape}`}>
                            <span className="text-[7px] font-black text-slate-500 dark:text-slate-400">
                              {paper.id.startsWith('A4') ? 'A4' : 'A5'}
                            </span>
                          </div>
                          
                          <div className="space-y-0.5">
                            <span className="text-xs font-black block">{paper.title}</span>
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-mono">{paper.size}</span>
                          </div>

                          {isSelected && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded-full">
                              <Check className="w-2.5 h-2.5" /> انتخاب شده
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  
                  <div className="text-[9px] text-emerald-600 font-bold flex items-center gap-1 justify-end">
                    <Check className="w-3 h-3" />
                    <span>سایز کاغذ انتخاب‌شده در پیش‌نمایش زنده و چاپ فاکتور اعمال می‌گردد.</span>
                  </div>

                  {/* Raw Invoice Form Paper Image Upload Section per Paper Mode */}
                  <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4" dir="rtl">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300">
                        <Image className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800 dark:text-slate-100">
                          تصویر فرم خام فاکتور (پیش‌چاپ) برای پیش‌نمایش دیجیتال
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          تصویر فرم یا کاغذ خام فاکتور خود را به ازای هر سایز آپلود کنید تا در پیش‌نمایش مشتری دقیقاً مشابه فاکتور واقعی دیده شود.
                        </p>
                      </div>
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-[10px] text-amber-800 dark:text-amber-300 leading-relaxed space-y-1">
                      <div className="font-extrabold flex items-center gap-1 text-amber-900 dark:text-amber-200">
                        <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>نکات مهم در مورد تصویر کاغذ خام:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-[9.5px]">
                        <li>تصویر آپلود شده <strong>تنها در پیش‌نمایش دیجیتال فاکتور</strong> (جهت مشاهده روی صفحه یا ارسال به مشتری) نمایش داده می‌شود.</li>
                        <li><strong>در چاپ نهایی (پرینت)، این تصویر به‌هیچ‌وجه چاپ نمی‌شود</strong> تا بر روی کاغذ پیش‌چاپ‌شده شما به صورت مجدد چاپ نیفتد.</li>
                        <li>در پیش‌نمایش دیجیتال، تمامی بخش‌های سفید فاکتور به‌صورت شفاف (بی‌رنگ) در می‌آیند تا فرم خام شما با وضوح ۱۰۰٪ دیده شود.</li>
                      </ul>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {[
                        { id: 'A4_portrait', title: 'A4 عمودی', size: '۲۱۰ × ۲۹۷ mm' },
                        { id: 'A4_landscape', title: 'A4 افقی', size: '۲۹۷ × ۲۱۰ mm' },
                        { id: 'A5_portrait', title: 'A5 عمودی', size: '۱۴۸ × ۲۱۰ mm' },
                        { id: 'A5_landscape', title: 'A5 افقی', size: '۲۱۰ × ۱۴۸ mm' },
                      ].map((paper) => {
                        const bgImg = paperBgImages[paper.id];
                        const isCurrentSelected = invoicePaperSize === paper.id;
                        return (
                          <div 
                            key={paper.id}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                              isCurrentSelected 
                                ? 'bg-purple-50/60 dark:bg-purple-950/20 border-purple-300 dark:border-purple-800/80 shadow-xs' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800 dark:text-slate-100">{paper.title}</span>
                                <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">{paper.size}</span>
                              </div>
                              {isCurrentSelected && (
                                <span className="text-[9px] font-black text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/60 px-2 py-0.5 rounded-full">
                                  سایز فعال
                                </span>
                              )}
                            </div>

                            {bgImg ? (
                              <div className="relative group rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 h-28 flex items-center justify-center">
                                <img 
                                  src={bgImg} 
                                  alt={`فرم خام ${paper.title}`} 
                                  className="w-full h-full object-contain"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-2xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                                  <label className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow-sm">
                                    <UploadCloud className="w-3.5 h-3.5" />
                                    <span>تغییر</span>
                                    <input 
                                      type="file" 
                                      accept="image/*" 
                                      className="hidden" 
                                      onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                          handlePaperBgImageUpload(paper.id, e.target.files[0]);
                                        }
                                      }} 
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePaperBgImage(paper.id)}
                                    className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>حذف</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-400 bg-slate-50/50 dark:bg-slate-800/40 rounded-xl p-3 flex flex-col items-center justify-center space-y-1.5 text-center cursor-pointer transition-all group h-28">
                                <div className="p-2 rounded-full bg-slate-200/80 dark:bg-slate-700 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/50 text-slate-500 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors">
                                  <UploadCloud className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-extrabold text-slate-600 dark:text-slate-300 group-hover:text-purple-600 dark:group-hover:text-purple-400">
                                  آپلود تصویر فرم خام ({paper.title})
                                </span>
                                <span className="text-[8px] text-slate-400">فرمت‌های PNG، JPG، WEBP</span>
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      handlePaperBgImageUpload(paper.id, e.target.files[0]);
                                    }
                                  }} 
                                />
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Web Messengers & Accounts Section */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
            <button
              type="button"
              onClick={() => toggleSection('messengers')}
              className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                  openSections.messengers ? 'rotate-90 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50' : 'text-slate-500'
                }`}>
                  <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                </div>
                <Globe className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">مدیریت پیام‌رسان‌ها و حساب‌های کاری وب</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {openSections.messengers ? 'بستن' : 'باز کردن'}
              </span>
            </button>

            {openSections.messengers && (
              <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-4 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" dir="rtl">
                  <p className="text-[10px] text-slate-500 leading-relaxed text-right" dir="rtl">
                    تعریف عنوان، آدرس URL، آیکون، اندازه پنجره و تعیین دسترسی پرسنل برای هر پیام‌رسان وب (ایتا، تلگرام، واتساپ، بله و غیره). آیکون پیام‌رسان‌های مجاز در منوی اصلی نرم‌افزار قرار گرفته و با کلیک در پنجره Popup باز می‌شود:
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsMessengerModalOpen(true)}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 cursor-pointer transition-all shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>مدیریت و افزودن پیام‌رسان</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" dir="rtl">
                  {messengersList.map((m) => (
                    <div key={m.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/60 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <WebMessengerIcon iconKey={m.icon} customIconUrl={m.customIconUrl} size={18} showBackground={true} />
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{m.title}</p>
                          <p className="text-[10px] font-mono text-slate-400 dir-ltr text-left truncate">{m.url}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openWebMessengerPopup(m)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="تست باز کردن پنجره"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Web Messenger Manager Modal */}
          <WebMessengerManagerModal
            isOpen={isMessengerModalOpen}
            onClose={() => setIsMessengerModalOpen(false)}
            currentUser={currentUser}
            allUsers={users}
            onOpenMessenger={openWebMessengerPopup}
          />

          {/* Custom System Icons Manager */}
          {currentUser?.role !== 'seller' && (
            <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
              <button
                type="button"
                onClick={() => toggleSection('customIcons')}
                className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                    openSections.customIcons ? 'rotate-90 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50' : 'text-slate-500'
                  }`}>
                    <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                  </div>
                  <ClipboardList className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200">تعریف آیکون‌های اختصاصی سیستم</span>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900/50">
                    {toPersianDigits(customIcons.length)} آیکون
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  {openSections.customIcons ? 'بستن' : 'باز کردن'}
                </span>
              </button>

              {openSections.customIcons && (
                <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-5 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" dir="rtl">
                    <p className="text-[11px] text-slate-500 leading-relaxed text-right font-medium" dir="rtl">
                      تعریف نام، بارگذاری آیکون و مدیریت راه‌های ارتباطی/آیکون‌های اختصاصی جهت نمایش و انتخاب در فاکتورها:
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleAddCustomIcon}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                        title="افزودن آیکون اختصاصی جدید به سیستم"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>افزودن آیکون جدید</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetIconsToDefaults}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-xl border border-amber-200/50 dark:border-amber-900/50 flex items-center gap-1 cursor-pointer transition-colors"
                        title="بازنشانی آیکون‌ها به ۶ حالت پیش‌فرض"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>بازنشانی پیش‌فرض</span>
                      </button>
                    </div>
                  </div>

                  {customIcons.length === 0 ? (
                    <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
                      <p className="text-xs text-slate-500 font-bold">هیچ آیکون اختصاصی در سیستم تعریف نشده است.</p>
                      <button
                        type="button"
                        onClick={handleAddCustomIcon}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>افزودن اولین آیکون اختصاصی</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5" dir="rtl">
                      {customIcons.map((icon, idx) => (
                        <div key={icon.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/70 flex flex-col items-center text-center space-y-2.5 shadow-2xs hover:border-emerald-200 dark:hover:border-emerald-900 transition-all relative group/card">
                          <div className="w-full flex items-center justify-between">
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                              آیکون {toPersianDigits(idx + 1)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomIcon(icon.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                              title="حذف این آیکون"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          {/* Icon Circle Preview */}
                          <div className="w-12 h-12 rounded-full border-2 border-indigo-100 dark:border-indigo-900 flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/40 relative overflow-hidden group shadow-sm">
                            {icon.iconData ? (
                              <img src={icon.iconData} alt={icon.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{icon.name ? icon.name[0] : 'آ'}</span>
                            )}
                            
                            {icon.iconData && (
                              <button
                                type="button"
                                onClick={() => handleClearIconImage(icon.id)}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold cursor-pointer"
                                title="حذف تصویر"
                              >
                                حذف
                              </button>
                            )}
                          </div>

                          {/* Icon Name Field */}
                          <div className="w-full space-y-1 text-right">
                            <label className="text-[9px] font-bold text-slate-500 block">عنوان آیکون:</label>
                            <input
                              type="text"
                              value={icon.name}
                              onChange={(e) => handleUpdateIconName(icon.id, e.target.value)}
                              placeholder="عنوان..."
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          {/* Icon Upload Button */}
                          <div className="w-full">
                            <label className="w-full py-1 px-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold rounded-lg border border-indigo-150 dark:border-indigo-900/60 cursor-pointer block transition-colors text-center">
                              <span>آپلود تصویر</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadIconImage(icon.id, file);
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Custom Shipping Methods Manager */}
          {currentUser?.role !== 'seller' && (
            <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
              <button
                type="button"
                onClick={() => toggleSection('shipping')}
                className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                    openSections.shipping ? 'rotate-90 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50' : 'text-slate-500'
                  }`}>
                    <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                  </div>
                  <Truck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200">تعریف روش‌های ارسال سیستم</span>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900/50">
                    {toPersianDigits(shippingMethods.length)} روش
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  {openSections.shipping ? 'بستن' : 'باز کردن'}
                </span>
              </button>

              {openSections.shipping && (
                <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-5 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" dir="rtl">
                    <p className="text-[11px] text-slate-500 leading-relaxed text-right font-medium" dir="rtl">
                      تعریف نام، آیکون و توضیحات اختصاصی روش‌های ارسال بار و تحویل کالا جهت انتخاب در فاکتورها و گزارش پورسانت:
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleAddShippingMethod}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                        title="افزودن روش ارسال جدید به سیستم"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>افزودن روش ارسال جدید</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetShippingToDefaults}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-xl border border-amber-200/50 dark:border-amber-900/50 flex items-center gap-1 cursor-pointer transition-colors"
                        title="بازنشانی روش‌های ارسال به ۶ حالت پیش‌فرض"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>بازنشانی پیش‌فرض</span>
                      </button>
                    </div>
                  </div>

                  {shippingMethods.length === 0 ? (
                    <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
                      <p className="text-xs text-slate-500 font-bold">هیچ روش ارسالی در سیستم تعریف نشده است.</p>
                      <button
                        type="button"
                        onClick={handleAddShippingMethod}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>افزودن اولین روش ارسال</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5" dir="rtl">
                      {shippingMethods.map((method, idx) => (
                        <div key={method.id} className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/70 flex flex-col justify-between space-y-3 shadow-2xs hover:border-emerald-200 dark:hover:border-emerald-900 transition-all">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-md">
                              روش {toPersianDigits(idx + 1)}
                            </span>

                            <div className="flex items-center gap-2">
                              {/* Circle Preview */}
                              <div className="w-9 h-9 rounded-full border-2 border-indigo-100 dark:border-indigo-900 flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/40 relative overflow-hidden group shadow-2xs">
                                {method.iconData ? (
                                  <img src={method.iconData} alt={method.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{method.name ? method.name[0] : 'ر'}</span>
                                )}
                                
                                {method.iconData && (
                                  <button
                                    type="button"
                                    onClick={() => handleClearShippingImage(method.id)}
                                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[8px] font-bold cursor-pointer"
                                    title="حذف تصویر"
                                  >
                                    حذف
                                  </button>
                                )}
                              </div>

                              {/* Method Upload Button */}
                              <label className="py-1 px-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded-lg border border-indigo-150 dark:border-indigo-900/60 cursor-pointer transition-colors text-center">
                                <span>تصویر</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUploadShippingImage(method.id, file);
                                  }}
                                />
                              </label>

                              {/* Delete Method Button */}
                              <button
                                type="button"
                                onClick={() => handleDeleteShippingMethod(method.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                title="حذف این روش ارسال"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Method Name Field */}
                          <div className="w-full space-y-1 text-right">
                            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 block">عنوان روش ارسال:</label>
                            <input
                              type="text"
                              value={method.name}
                              onChange={(e) => handleUpdateShippingName(method.id, e.target.value)}
                              placeholder="مثال: پیک موتوری..."
                              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          {/* Method Note Field */}
                          <div className="w-full space-y-1 text-right">
                            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 block">
                              توضیحات و نکات (درج در ذیل فاکتور):
                            </label>
                            <textarea
                              rows={2}
                              value={method.note || ''}
                              onChange={(e) => handleUpdateShippingNote(method.id, e.target.value)}
                              placeholder="مثال: هزینه ارسال پیک به عهده مشتری می‌باشد و..."
                              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 text-right leading-5 resize-none placeholder:text-slate-400"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Custom Acquaintance Methods Manager */}
          {currentUser?.role !== 'seller' && (
            <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/20 overflow-hidden transition-all shadow-sm">
              <button
                type="button"
                onClick={() => toggleSection('acquaintance')}
                className="w-full p-4 flex items-center justify-between text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                    openSections.acquaintance ? 'rotate-90 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50' : 'text-slate-500'
                  }`}>
                    <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                  </div>
                  <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200">تعریف روش‌های آشنایی سیستم</span>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900/50">
                    {toPersianDigits(acquaintanceMethods.length)} روش
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  {openSections.acquaintance ? 'بستن' : 'باز کردن'}
                </span>
              </button>

              {openSections.acquaintance && (
                <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-5 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" dir="rtl">
                    <p className="text-[11px] text-slate-500 leading-relaxed text-right font-medium" dir="rtl">
                      تعریف نام و بارگذاری روش‌های آشنایی اختصاصی جهت انتخاب در فاکتورها و فرم ثبت طرف حساب جدید:
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleAddAcquaintanceMethod}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                        title="افزودن روش آشنایی جدید به سیستم"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>افزودن روش آشنایی جدید</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetAcquaintanceToDefaults}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-xl border border-amber-200/50 dark:border-amber-900/50 flex items-center gap-1 cursor-pointer transition-colors"
                        title="بازنشانی روش‌های آشنایی به ۶ حالت پیش‌فرض"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>بازنشانی پیش‌فرض</span>
                      </button>
                    </div>
                  </div>

                  {acquaintanceMethods.length === 0 ? (
                    <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
                      <p className="text-xs text-slate-500 font-bold">هیچ روش آشنایی در سیستم تعریف نشده است.</p>
                      <button
                        type="button"
                        onClick={handleAddAcquaintanceMethod}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>افزودن اولین روش آشنایی</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5" dir="rtl">
                      {acquaintanceMethods.map((method, idx) => (
                        <div key={method.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/70 flex flex-col items-center text-center space-y-2.5 shadow-2xs hover:border-emerald-200 dark:hover:border-emerald-900 transition-all relative group/card">
                          <div className="w-full flex items-center justify-between">
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                              روش {toPersianDigits(idx + 1)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteAcquaintanceMethod(method.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                              title="حذف این روش آشنایی"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          {/* Method Circle Preview */}
                          <div className="w-12 h-12 rounded-full border-2 border-indigo-100 dark:border-indigo-900 flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/40 relative overflow-hidden group shadow-sm">
                            {method.iconData ? (
                              <img src={method.iconData} alt={method.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{method.name ? method.name[0] : 'آ'}</span>
                            )}
                            
                            {method.iconData && (
                              <button
                                type="button"
                                onClick={() => handleClearAcquaintanceImage(method.id)}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold cursor-pointer"
                                title="حذف تصویر"
                              >
                                حذف
                              </button>
                            )}
                          </div>

                          {/* Method Name Field */}
                          <div className="w-full space-y-1 text-right">
                            <label className="text-[9px] font-bold text-slate-500 block">عنوان روش آشنایی:</label>
                            <input
                              type="text"
                              value={method.name}
                              onChange={(e) => handleUpdateAcquaintanceName(method.id, e.target.value)}
                              placeholder="عنوان..."
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-300 text-center focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          {/* Method Upload Button */}
                          <div className="w-full">
                            <label className="w-full py-1 px-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold rounded-lg border border-indigo-150 dark:border-indigo-900/60 cursor-pointer block transition-colors text-center">
                              <span>آپلود تصویر</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadAcquaintanceImage(method.id, file);
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* System Custom Fields Section */}
          {currentUser.role === 'admin' && (
            <div className="bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden transition-all shadow-2xs">
              <button
                type="button"
                onClick={() => toggleSection('customFields')}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors text-right cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-all ${
                    openSections.customFields ? 'rotate-90 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50' : 'text-slate-500'
                  }`}>
                    <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                  </div>
                  <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200">فیلدهای اختصاصی سیستم (Custom Fields)</span>
                  <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-900/50">
                    {toPersianDigits(customFields.length)} فیلد
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  {openSections.customFields ? 'بستن' : 'باز کردن'}
                </span>
              </button>

              {openSections.customFields && (
                <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-5 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" dir="rtl">
                    <p className="text-[11px] text-slate-500 leading-relaxed text-right font-medium" dir="rtl">
                      تعریف فیلدهای متغیر و اختصاصی برای افزودن به ساختار اسناد، فاکتورها، مشتریان و کالاها (ذخیره مستقیم در پایگاه داده MySQL):
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleAddCustomField}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                        title="افزودن فیلد اختصاصی جدید به سیستم"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>افزودن فیلد جدید</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetCustomFieldsToDefaults}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-xl border border-amber-200/50 dark:border-amber-900/50 flex items-center gap-1 cursor-pointer transition-colors"
                        title="بازنشانی فیلدهای اختصاصی به حالت پیش‌فرض"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>بازنشانی پیش‌فرض</span>
                      </button>
                    </div>
                  </div>

                  {customFields.length === 0 ? (
                    <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
                      <p className="text-xs text-slate-500 font-bold">هیچ فیلد اختصاصی در سیستم تعریف نشده است.</p>
                      <button
                        type="button"
                        onClick={handleAddCustomField}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>افزودن اولین فیلد اختصاصی</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5" dir="rtl">
                      {customFields.map((field, idx) => (
                        <div key={field.id} className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/70 flex flex-col justify-between space-y-3 shadow-2xs hover:border-indigo-200 dark:hover:border-indigo-900 transition-all">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-md">
                              فیلد {toPersianDigits(idx + 1)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomField(field.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                              title="حذف این فیلد"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Field Name */}
                          <div className="space-y-1 text-right">
                            <label className="text-[9px] font-bold text-slate-500 block">عنوان فیلد:</label>
                            <input
                              type="text"
                              value={field.name}
                              onChange={(e) => handleUpdateCustomField(field.id, { name: e.target.value })}
                              placeholder="عنوان فیلد..."
                              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-[11px] font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          {/* Entity Type & Data Type */}
                          <div className="grid grid-cols-2 gap-2 text-right">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-500 block">بخش مربوطه:</label>
                              <select
                                value={field.entity}
                                onChange={(e) => handleUpdateCustomField(field.id, { entity: e.target.value as any })}
                                className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-[10px] font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                <option value="invoice">فاکتور</option>
                                <option value="item">کالا / انبار</option>
                                <option value="counterpart">طرف‌حساب</option>
                                <option value="document">سند حسابداری</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-500 block">نوع داده:</label>
                              <select
                                value={field.type}
                                onChange={(e) => handleUpdateCustomField(field.id, { type: e.target.value as any })}
                                className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-[10px] font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                <option value="text">متن ساده</option>
                                <option value="number">عدد</option>
                                <option value="date">تاریخ</option>
                                <option value="select">انتخابی (Dropdown)</option>
                              </select>
                            </div>
                          </div>

                          {/* Options if select */}
                          {field.type === 'select' && (
                            <div className="space-y-1 text-right">
                              <label className="text-[9px] font-bold text-slate-500 block">گزینه‌ها (با ویرگول جدا کنید):</label>
                              <input
                                type="text"
                                value={Array.isArray(field.options) ? field.options.join(', ') : (field.options || '')}
                                onChange={(e) => handleUpdateCustomField(field.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                placeholder="گزینه ۱, گزینه ۲, گزینه ۳..."
                                className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          )}

                          {/* Mandatory switch */}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/60">
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">تکمیل فیلد اجباری باشد؟</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateCustomField(field.id, { required: !field.required })}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                field.required ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                              }`}
                              role="switch"
                              aria-checked={field.required}
                            >
                              <span
                                aria-hidden="true"
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  field.required ? '-translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* Live Demo Sample Modal */}
      {showDemoModal && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in popup-overlay-global" dir="rtl" id="dialog-sample-demo-popup">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="p-6 md:p-8 max-w-lg w-full space-y-6 relative overflow-hidden text-right popup-box-global">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/60 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">پیش‌نمایش زنده Popup تم مرکزی</h3>
                  <span className="text-[10px] text-slate-500 font-bold">این یک پنجره نمونه با استایل‌های Global است</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDemoModal(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-bold">
              <p>
                تمامی تنظیمات منتخب شما شامل <span className="text-indigo-600 dark:text-indigo-400 font-black">رنگ و درصد شفافیت پس‌زمینه ({popupBgOpacity}٪)</span>، <span className="text-indigo-600 dark:text-indigo-400 font-black">رنگ و درصد شفافیت Overlay ({popupOverlayOpacity}٪)</span>، <span className="text-indigo-600 dark:text-indigo-400 font-black">شعاع انحنا ({popupBorderRadius})</span> و <span className="text-indigo-600 dark:text-indigo-400 font-black">سایه ({popupShadow})</span> به صورت کاملاً زنده روی این Popup و تمام دیالوگ‌های نرم‌افزار اعمال شده است.
              </p>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl space-y-2">
                <span className="text-[10px] text-slate-400 font-black block">مشخصات تنظیمات فعال:</span>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>شفافیت پس‌زمینه: <strong className="text-slate-900 dark:text-white">{popupBgOpacity}%</strong></div>
                  <div>شفافیت کاور: <strong className="text-slate-900 dark:text-white">{popupOverlayOpacity}%</strong></div>
                  <div>انحنای زوایا: <strong className="text-slate-900 dark:text-white">{popupBorderRadius}</strong></div>
                  <div>نوع سایه: <strong className="text-slate-900 dark:text-white uppercase">{popupShadow}</strong></div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDemoModal(false)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-500/20"
              >
                عالی است، بستن پیش‌نمایش
              </button>
            </div>

          </div>
        </div>
      )}



    </div>
  );
}

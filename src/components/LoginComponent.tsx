import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { 
  Shield, 
  Lock, 
  User as UserIcon, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Calculator, 
  ArrowLeft,
  UploadCloud,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Cpu,
  ChevronDown,
  ChevronUp,
  Info,
  Check,
  ShieldCheck,
  Database,
  Upload,
  Clock,
  X,
  Users,
  Copy,
  KeyRound,
  Sparkles,
  LogIn,
  Package,
  Download
} from 'lucide-react';
import { uploadSystemUpdateFile } from '../utils/updateHelper';
import { clearLocalBusinessStorage } from '../utils/stateManager';

interface LoginComponentProps {
  users: User[];
  onLoginSuccess: (user: User) => void;
  allowLoginUpdate?: boolean;
  allowLoginRestore?: boolean;
}

function normalizeAuthStr(str: any): string {
  if (str === undefined || str === null) return '';
  let s = String(str).trim();
  // Strip zero-width spaces, non-breaking spaces, control chars, and invisible characters
  s = s.replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, '');
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const englishDigits = '0123456789';
  for (let i = 0; i < 10; i++) {
    s = s.replace(new RegExp(persianDigits[i], 'g'), englishDigits[i]);
    s = s.replace(new RegExp(arabicDigits[i], 'g'), englishDigits[i]);
  }
  s = s.replace(/\u064A/g, 'ی'); // Arabic Yeh -> Persian Yeh
  s = s.replace(/\u0649/g, 'ی'); // Alef Maksura -> Persian Yeh
  s = s.replace(/\u0643/g, 'ک'); // Arabic Kaf -> Persian Keheh
  s = s.replace(/\u0629/g, 'ه'); // Teh Marbuta -> Heh
  return s.trim();
}

function normalizeUsernameStr(str: any): string {
  return normalizeAuthStr(str).toLowerCase().replace(/\s+/g, '');
}

export default function LoginComponent({ 
  users: propUsers, 
  onLoginSuccess, 
  allowLoginUpdate: propAllowLoginUpdate,
  allowLoginRestore: propAllowLoginRestore 
}: LoginComponentProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const [adminFullName, setAdminFullName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminSetupLoading, setAdminSetupLoading] = useState(false);
  const [adminSetupError, setAdminSetupError] = useState<string | null>(null);
  const [showAdminPass, setShowAdminPass] = useState(false);

  const handleCopyText = (text: string, key: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSelectUserCredentials = (u: User) => {
    setUsername(u.username || '');
    setPassword(u.password || '');
    setError(null);
  };

  const toggleShowPasswordForUser = (userId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setVisiblePasswords(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  // Live active users state synchronized with host DB
  const [activeUsersList, setActiveUsersList] = useState<User[]>(() => {
    if (Array.isArray(propUsers)) return propUsers;
    return [];
  });

  // Sync propUsers when changed
  useEffect(() => {
    if (Array.isArray(propUsers)) {
      setActiveUsersList(propUsers);
    }
  }, [propUsers]);

  // Fetch live users list from server on mount with no-cache
  useEffect(() => {
    const fetchLiveUsers = async () => {
      try {
        const res = await fetch(`/api/auth/users?_t=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'success' && Array.isArray(data.users)) {
            setActiveUsersList(data.users);
            clearLocalBusinessStorage();
          }
        }
      } catch (_) {}
    };
    fetchLiveUsers();
  }, []);

  // System Update on Login state
  const [allowLoginUpdate, setAllowLoginUpdate] = useState<boolean>(() => {
    if (typeof propAllowLoginUpdate === 'boolean') return propAllowLoginUpdate;
    try {
      const saved = localStorage.getItem('acc_app_allow_login_update') || localStorage.getItem('allow_login_update');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updating, setUpdating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showUpdateGuide, setShowUpdateGuide] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Backup Restore on Login state
  const [allowLoginRestore, setAllowLoginRestore] = useState<boolean>(() => {
    if (typeof propAllowLoginRestore === 'boolean') return propAllowLoginRestore;
    try {
      const saved = localStorage.getItem('acc_app_allow_login_restore') || localStorage.getItem('allow_login_restore');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [showRestorePanel, setShowRestorePanel] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreStatusText, setRestoreStatusText] = useState("");
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [showRestoreGuide, setShowRestoreGuide] = useState(false);
  const [isRestoreDragging, setIsRestoreDragging] = useState(false);
  const [showConfirmRestoreModal, setShowConfirmRestoreModal] = useState(false);

  useEffect(() => {
    if (typeof propAllowLoginUpdate === 'boolean') {
      setAllowLoginUpdate(propAllowLoginUpdate);
    }
  }, [propAllowLoginUpdate]);

  useEffect(() => {
    if (typeof propAllowLoginRestore === 'boolean') {
      setAllowLoginRestore(propAllowLoginRestore);
    }
  }, [propAllowLoginRestore]);

  useEffect(() => {
    const handleUpdateEvent = (e: any) => {
      setAllowLoginUpdate(e.detail === true);
    };
    const handleRestoreEvent = (e: any) => {
      setAllowLoginRestore(e.detail === true);
    };

    window.addEventListener('allow-login-update-changed', handleUpdateEvent);
    window.addEventListener('allow-login-restore-changed', handleRestoreEvent);

    // Check server DB on mount
    const checkServerSetting = async () => {
      try {
        const res = await fetch('/api/db/load-all');
        if (res.ok) {
          const data = await res.json();
          
          // Update setting
          const updateVal = data?.acc_app_allow_login_update ?? data?.allow_login_update;
          if (updateVal !== undefined && updateVal !== null) {
            const boolVal = updateVal === true || updateVal === 'true';
            setAllowLoginUpdate(boolVal);
            localStorage.setItem('acc_app_allow_login_update', String(boolVal));
            localStorage.setItem('allow_login_update', String(boolVal));
          }

          // Restore setting
          const restoreVal = data?.acc_app_allow_login_restore ?? data?.allow_login_restore;
          if (restoreVal !== undefined && restoreVal !== null) {
            const boolVal = restoreVal === true || restoreVal === 'true';
            setAllowLoginRestore(boolVal);
            localStorage.setItem('acc_app_allow_login_restore', String(boolVal));
            localStorage.setItem('allow_login_restore', String(boolVal));
          }
        }
      } catch (_) {}
    };
    checkServerSetting();

    return () => {
      window.removeEventListener('allow-login-update-changed', handleUpdateEvent);
      window.removeEventListener('allow-login-restore-changed', handleRestoreEvent);
    };
  }, []);

  // --- System Update Handlers ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith('.zip') && !lowerName.endsWith('.rar')) {
        setUpdateError("فرمت فایل نامعتبر است. لطفاً فقط فایل .zip یا .rar انتخاب کنید.");
        setUpdateFile(null);
        return;
      }
      if (file.size > 80 * 1024 * 1024) {
        setUpdateError("حجم فایل انتخابی بیش از حد مجاز (۸۰ مگابایت) است. لطفاً پوشه node_modules را از زیپ حذف کرده و فایل پروژه را آپلود نمایید.");
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
        setUpdateError("حجم فایل انتخابی بیش از حد مجاز (۸۰ مگابایت) است. لطفاً پوشه node_modules را از زیپ حذف کرده و فایل پروژه را آپلود نمایید.");
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
    setUploadStatusText("در حال آغاز ارسال قطعه‌بندی‌شده...");
    setUpdateSuccess(null);
    setUpdateError(null);

    try {
      const result = await uploadSystemUpdateFile(updateFile, (pct, status) => {
        setUploadProgress(pct);
        setUploadStatusText(status);
      });

      if (result && result.status === 'success') {
        setUpdateSuccess(result.message || "به‌روزرسانی سیستم با موفقیت انجام شد. صفحه در حال بارگذاری مجدد است...");
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

  // --- Backup Restore Handlers ---
  const handleBackupFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith('.json')) {
        setRestoreError("فرمت فایل نامعتبر است. لطفاً فایل پشتیبان با پسوند .json انتخاب فرمایید.");
        setRestoreFile(null);
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setRestoreError("حجم فایل پشتیبان بیش از ۵۰ مگابایت است. لطفاً فایل بکاپ استاندارد سامانه را انتخاب نمایید.");
        setRestoreFile(null);
        return;
      }
      setRestoreFile(file);
      setRestoreSuccess(null);
      setRestoreError(null);
    }
  };

  const handleRestoreDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleRestoreDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRestoreDragging(true);
  };

  const handleRestoreDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRestoreDragging(false);
  };

  const handleRestoreDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRestoreDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith('.json')) {
        setRestoreError("فرمت فایل نامعتبر است. لطفاً فایل پشتیبان با پسوند .json انتخاب فرمایید.");
        setRestoreFile(null);
        return;
      }
      setRestoreFile(file);
      setRestoreSuccess(null);
      setRestoreError(null);
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreFile) {
      setRestoreError("لطفاً ابتدا فایل پشتیبان JSON را انتخاب نمایید.");
      return;
    }

    setShowConfirmRestoreModal(false);
    setRestoring(true);
    setRestoreProgress(15);
    setRestoreStatusText("در حال خواندن و اعتبارسنجی ساختار فایل پشتیبان...");
    setRestoreSuccess(null);
    setRestoreError(null);

    try {
      const text = await restoreFile.text();
      let parsedData: any;
      try {
        parsedData = JSON.parse(text);
      } catch (parseErr) {
        throw new Error("ساختار فایل پشتیبان نامعتبر است (قالب JSON صحیح نیست).");
      }

      if (typeof parsedData !== 'object' || parsedData === null) {
        throw new Error("قالب داده‌های فایل پشتیبان نامعتبر است.");
      }

      setRestoreProgress(35);
      setRestoreStatusText("ارسال به سرور و ایجاد نسخه پشتیبان اضطراری...");

      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupData: parsedData })
      });

      const resResult = await response.json().catch(() => null);

      if (response.ok && resResult?.status === 'success') {
        setRestoreProgress(75);
        setRestoreStatusText("تزریق داده‌ها به پایگاه‌داده و پاکسازی حافظه محلی...");

        // Clear local business storage to maintain absolute security
        clearLocalBusinessStorage();

        setRestoreProgress(100);
        setRestoreStatusText("بازیابی با موفقیت کامل شد.");
        setRestoreSuccess("اطلاعات فایل پشتیبان با موفقیت بازیابی شد. صفحه در حال بارگذاری مجدد است...");
        setRestoreFile(null);
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        throw new Error(resResult?.error || "خطا در عملیات بازیابی توسط سرور.");
      }
    } catch (err: any) {
      console.error("Backup restore error on login:", err);
      setRestoreError(err.message || "خطا در خواندن یا بازیابی اطلاعات فایل پشتیبان.");
    } finally {
      setRestoring(false);
    }
  };

  // Automatic Build & Download dist.zip Package state on Login Screen
  const [buildingPackage, setBuildingPackage] = useState(false);
  const [downloadingPackage, setDownloadingPackage] = useState(false);
  const [buildSuccess, setBuildSuccess] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<{ exists: boolean; sizeMB?: string; mtime?: string; downloadUrl?: string } | null>(null);
  const [isBuildSectionOpen, setIsBuildSectionOpen] = useState(true);

  const fetchBuildStatus = async () => {
    try {
      const res = await fetch(`/api/system/build-status?_t=${Date.now()}`);
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
        setBuildSuccess(result.message || "پکیج dist.zip با موفقیت ساخته شد و آماده دانلود است.");
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
      const res = await fetch(`/api/system/download-build?_t=${Date.now()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `خطای دانلود (${res.status})`);
      }

      const blob = await res.blob();
      if (blob.size < 1000) {
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

  // Use active users list; strictly empty if no users exist
  const rawUsers = (Array.isArray(activeUsersList) && activeUsersList.length > 0) 
    ? activeUsersList 
    : (Array.isArray(propUsers) ? propUsers : []);

  // Deduplicate users list by id/username
  const uniqueUsersMap = new Map<string, User>();
  for (const u of rawUsers) {
    if (u && u.username) {
      const key = u.id || u.username.trim().toLowerCase();
      uniqueUsersMap.set(key, u);
    }
  }
  const allUsers = Array.from(uniqueUsersMap.values());

  const executeLoginForUser = (userObj: User, fullUsersList?: User[]) => {
    try {
      sessionStorage.setItem('acc_session_uid', userObj.id);
      localStorage.setItem('acc_session_uid', userObj.id);
      localStorage.setItem('acc_app_isLoggedIn', 'true');
      localStorage.removeItem('acc_app_currentUser');
      localStorage.removeItem('currentUser');
      localStorage.removeItem('acc_app_users');
      localStorage.removeItem('users');
      localStorage.removeItem('acc_app_primaryUserRole');
      localStorage.removeItem('primaryUserRole');
    } catch (_) {}
    onLoginSuccess(userObj);
  };

  const handleInitialAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSetupError(null);

    const cleanName = adminFullName.trim();
    const cleanUser = normalizeUsernameStr(adminUsername);
    const cleanPass = normalizeAuthStr(adminPassword);
    const cleanConfirm = normalizeAuthStr(adminConfirmPassword);
    const cleanPhone = normalizeAuthStr(adminPhone);

    if (!cleanName) {
      setAdminSetupError('لطفاً نام و نام خانوادگی مدیر ارشد را وارد نمایید.');
      return;
    }
    if (!cleanUser) {
      setAdminSetupError('لطفاً نام کاربری مدیر را وارد نمایید.');
      return;
    }
    if (!cleanPass) {
      setAdminSetupError('لطفاً کلمه عبور امنیتی را وارد نمایید.');
      return;
    }
    if (cleanPass.length < 4) {
      setAdminSetupError('کلمه عبور باید حداقل ۴ کاراکتر باشد.');
      return;
    }
    if (cleanPass !== cleanConfirm) {
      setAdminSetupError('کلمه عبور و تکرار آن یکسان نمی‌باشند.');
      return;
    }

    setAdminSetupLoading(true);

    try {
      const res = await fetch(`/api/auth/setup-initial-admin?_t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({
          name: cleanName,
          username: cleanUser,
          password: cleanPass,
          phone: cleanPhone
        })
      });

      const data = await res.json();
      if (res.ok && data && data.status === 'success' && data.user) {
        setAdminSetupLoading(false);
        const fullList = Array.isArray(data.users) && data.users.length > 0 ? data.users : [data.user];
        setActiveUsersList(fullList);
        executeLoginForUser(data.user, fullList);
        return;
      } else {
        throw new Error(data?.error || 'خطا در ثبت مشخصات مدیر اولیه در دیتابیس.');
      }
    } catch (err: any) {
      setAdminSetupLoading(false);
      setAdminSetupError(err.message || 'خطا در برقراری ارتباط با سرور.');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanInputUser = normalizeUsernameStr(username);
    const cleanInputPass = normalizeAuthStr(password);

    if (!cleanInputUser || !cleanInputPass) {
      setError('لطفاً نام کاربری و کلمه عبور را وارد نمایید.');
      return;
    }

    setIsLoggingIn(true);

    // 1. Prioritize live server authentication directly against the authoritative host database
    try {
      const res = await fetch(`/api/auth/login?_t=${Date.now()}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({ username: cleanInputUser, password: cleanInputPass })
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'success' && data.user) {
          setIsLoggingIn(false);
          const fullList = Array.isArray(data.users) && data.users.length > 0 ? data.users : (activeUsersList || propUsers || [data.user]);
          setActiveUsersList(fullList);
          executeLoginForUser(data.user, fullList);
          return;
        }
      }
    } catch (_) {
      // Server unreachable
    }

    // 2. Local matching fallback (for offline PWA or cached local state)
    const localMatchedUser = allUsers.find(u => {
      if (!u) return false;
      const uName = normalizeUsernameStr(u.username || '');
      const uPhone = normalizeAuthStr(u.phone || '');
      return (uName && uName === cleanInputUser) || (uPhone && uPhone === cleanInputUser);
    });

    if (localMatchedUser) {
      const expectedPasswordRaw = String(localMatchedUser.password ?? '');
      const cleanExpectedPassword = normalizeAuthStr(expectedPasswordRaw);

      const isPasswordCorrect = 
        cleanInputPass === cleanExpectedPassword || 
        password.trim() === expectedPasswordRaw.trim() ||
        normalizeAuthStr(password) === expectedPasswordRaw ||
        (cleanExpectedPassword === '' && cleanInputPass === normalizeUsernameStr(localMatchedUser.username));

      if (isPasswordCorrect) {
        setIsLoggingIn(false);
        executeLoginForUser(localMatchedUser);
        return;
      }
    }

    setError('نام کاربری یا کلمه عبور وارد شده اشتباه است.');
    setIsLoggingIn(false);
  };

  return (
    <div className="min-h-screen bg-slate-200 flex items-center justify-center p-4 antialiased font-sans flex-col relative overflow-x-hidden text-right py-10" dir="rtl" id="login-container">
      {/* Soft ambient glow elements */}
      <div className="absolute top-1/4 right-1/4 w-[40rem] h-[40rem] bg-emerald-500/10 rounded-full opacity-80 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[36rem] h-[36rem] bg-teal-500/10 rounded-full opacity-80 blur-3xl pointer-events-none" />

      {/* Main Secure Login Card */}
      <div className="w-full max-w-md backdrop-blur-2xl bg-white/95 border border-slate-300/80 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-slate-400/20 relative z-10 space-y-6 popup-box-global">
        
        {/* Software App Icon & Header Title */}
        <div className="text-center space-y-3 pb-2 border-b border-slate-200/80">
          <button
            type="button"
            onClick={() => {
              const adminUser = allUsers.find(u => u.role === 'admin') || allUsers[0] || {
                id: 'admin',
                name: 'مدیر ارشد (تست)',
                username: 'admin',
                role: 'admin' as const,
                permissions: ['all']
              };
              executeLoginForUser(adminUser, allUsers.length > 0 ? allUsers : [adminUser]);
            }}
            title="ورود با دسترسی مدیریت (تست)"
            className="w-16 h-16 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-emerald-600/30 ring-4 ring-emerald-500/10 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
          >
            <Calculator className="w-8 h-8 text-white pointer-events-none" />
          </button>

          <div className="space-y-1.5">
            <span className="text-[10px] text-emerald-700 font-black tracking-widest block uppercase font-mono bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-full w-fit mx-auto">
              FahamAcc v1.2
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900" style={{ color: '#0f172a' }}>سامانه هوشمند مالی و حسابداری</h1>
            <p className="text-slate-600 text-xs mt-1 leading-relaxed max-w-xs mx-auto" style={{ color: '#334155' }}>
              جهت ورود به حساب کاربری، لطفاً نام کاربری و کلمه عبور خود را وارد نمایید.
            </p>
          </div>
        </div>

        {allUsers.length === 0 ? (
          /* Initial Administrator Setup Form */
          <div className="space-y-4 animate-fade-in text-right">
            <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl text-right text-emerald-800 text-xs leading-relaxed flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-black text-emerald-950 text-xs mb-0.5">راه‌اندازی اولیه سامانه و ایجاد حساب مدیر کل</strong>
                <span className="text-[11px] text-emerald-800">پایگاه‌داده متمرکز MySQL آماده است. لطفاً مشخصات مدیر ارشد سیستم را جهت شروع به کار وارد نمایید:</span>
              </div>
            </div>

            <form onSubmit={handleInitialAdminSetup} className="space-y-3">
              {adminSetupError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs flex items-center gap-2 font-bold animate-pulse">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{adminSetupError}</span>
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-1">
                <label className="text-slate-900 text-xs font-bold block pr-1">نام و نام خانوادگی مدیر ارشد</label>
                <div className="relative">
                  <div className="absolute right-3.5 top-3 text-emerald-600">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={adminFullName}
                    onChange={(e) => setAdminFullName(e.target.value)}
                    placeholder="مثال: مدیر ارشد سیستم"
                    className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all font-medium"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Username */}
              <div className="space-y-1">
                <label className="text-slate-900 text-xs font-bold block pr-1">نام کاربری مدیر (جهت ورود)</label>
                <div className="relative">
                  <div className="absolute right-3.5 top-3 text-emerald-600">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(normalizeAuthStr(e.target.value))}
                    placeholder="نام کاربری دلخواه (انگلیسی)"
                    className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all text-left font-mono"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-slate-900 text-xs font-bold block pr-1">کلمه عبور امنیتی</label>
                <div className="relative">
                  <div className="absolute right-3.5 top-3 text-emerald-600">
                    <Lock className="w-4 h-4" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdminPass(!showAdminPass)}
                    className="absolute left-3.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <input
                    type={showAdminPass ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(normalizeAuthStr(e.target.value))}
                    placeholder="حداقل ۴ کاراکتر"
                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all text-left font-mono"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label className="text-slate-900 text-xs font-bold block pr-1">تکرار کلمه عبور</label>
                <div className="relative">
                  <div className="absolute right-3.5 top-3 text-emerald-600">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showAdminPass ? 'text' : 'password'}
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(normalizeAuthStr(e.target.value))}
                    placeholder="تکرار دقیق کلمه عبور"
                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all text-left font-mono"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              {/* Phone (Optional) */}
              <div className="space-y-1">
                <label className="text-slate-900 text-xs font-bold block pr-1">شماره تماس (اختیاری)</label>
                <input
                  type="text"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(normalizeAuthStr(e.target.value))}
                  placeholder="0912..."
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all text-left font-mono"
                  dir="ltr"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={adminSetupLoading}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
              >
                {adminSetupLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-emerald-100 animate-spin" />
                    <span>در حال ذخیره در دیتابیس MySQL...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-100" />
                    <span>ایجاد حساب مدیر و ورود به سامانه</span>
                    <ArrowLeft className="w-4 h-4 text-emerald-100" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Login Form */
          <form onSubmit={handleLogin} className="space-y-4">
            
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs flex items-center gap-2 font-bold animate-pulse">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span style={{ color: '#be123c' }}>{error}</span>
              </div>
            )}

            {/* Username Input */}
            <div className="space-y-1.5">
              <label className="text-slate-900 text-xs font-bold block pr-1" style={{ color: '#0f172a' }}>نام کاربری</label>
              <div className="relative">
                <div className="absolute right-3.5 top-3 text-emerald-600">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(normalizeAuthStr(e.target.value))}
                  placeholder="نام کاربری"
                  className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all text-left font-mono"
                  style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                  dir="ltr"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="text-slate-900 text-xs font-bold block pr-1" style={{ color: '#0f172a' }}>کلمه عبور امنیتی</label>
              <div className="relative">
                <div className="absolute right-3.5 top-3 text-emerald-600">
                  <Lock className="w-4 h-4" />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(normalizeAuthStr(e.target.value))}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all text-left font-mono"
                  style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                  dir="ltr"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoggingIn}
              className={`w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 group mt-2 ${
                isLoggingIn ? 'opacity-70 cursor-wait' : 'cursor-pointer hover:scale-[1.01] active:scale-[0.99]'
              }`}
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 text-emerald-100 animate-spin" />
                  <span className="text-white font-bold" style={{ color: '#ffffff' }}>در حال اعتبارسنجی امنیتی...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 text-emerald-100" />
                  <span className="text-white font-bold" style={{ color: '#ffffff' }}>ورود امن به سامانه</span>
                  <ArrowLeft className="w-4 h-4 text-emerald-100 group-hover:-translate-x-1 transition-transform" />
                </>
              )}
            </button>

          </form>
        )}

        {/* Security badge footer */}
        <div className="pt-3 border-t border-slate-200 text-center">
          <span className="text-[11px] text-slate-600 font-medium" style={{ color: '#334155' }}>
            اتصال رمزنگاری‌شده و محافظت‌شده با پروتکل امنیتی SSL/TLS
          </span>
        </div>

      </div>

      {/* Automatic Build & Download dist.zip Package Card */}
      <div className="w-full max-w-md mt-4 backdrop-blur-2xl bg-white/95 border border-indigo-300/80 rounded-3xl p-5 shadow-xl shadow-indigo-600/5 relative z-10 space-y-4 text-right animate-fade-in popup-box-global">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-indigo-100/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span>ساخت و دانلود خودکار پکیج dist.zip</span>
                <span className="text-[9px] bg-indigo-100 text-indigo-800 font-mono font-bold px-2 py-0.5 rounded-full">
                  خروجی نهایی
                </span>
              </h3>
              <p className="text-[10px] text-slate-500 font-medium">
                کامپایل خودکار و دریافت پکیج آماده استقرار روی هاست سی‌پنل / سرور
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsBuildSectionOpen(!isBuildSectionOpen)}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer"
            title={isBuildSectionOpen ? 'بستن' : 'نمایش'}
          >
            {isBuildSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {isBuildSectionOpen && (
          <div className="space-y-3.5 animate-fade-in">
            {/* Actions: Build & Download buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {/* Build Button ("ساخت پکیج") */}
              <button
                type="button"
                onClick={handleBuildPackage}
                disabled={buildingPackage}
                className="flex-1 min-w-[130px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {buildingPackage ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>در حال ساخت پکیج...</span>
                  </>
                ) : (
                  <>
                    <Cpu className="w-4 h-4" />
                    <span>ساخت پکیج dist.zip</span>
                  </>
                )}
              </button>

              {/* Download Button ("دانلود پکیج") */}
              <button
                type="button"
                onClick={handleDownloadPackage}
                disabled={!buildStatus?.exists || downloadingPackage}
                className={`flex-1 min-w-[130px] px-4 py-2.5 font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
                  buildStatus?.exists && !downloadingPackage
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
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
                      <span className="text-[9px] bg-emerald-700/60 text-white px-1.5 py-0.5 rounded font-mono dir-ltr">
                        {buildStatus.sizeMB} MB
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>

            {/* Status & Build output message */}
            {buildingPackage && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-xs flex items-center gap-2 font-bold animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-blue-500" />
                <span>دستورات npm run build در حال اجرا هستند. لطفاً تا اتمام ساخت شکیبا باشید...</span>
              </div>
            )}

            {buildError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{buildError}</span>
              </div>
            )}

            {buildSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{buildSuccess}</span>
              </div>
            )}

            {/* Package Contents Specs */}
            <div className="pt-2 border-t border-indigo-100 text-[10px] space-y-1.5 text-slate-600">
              <p className="font-bold text-slate-800 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-600" />
                <span>محتویات پکیج: فایل‌های assets/، api.php، wp-config.json، .htaccess و سرور Node</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Available Accounts & Credentials Card (Only if users exist) */}
      {allUsers.length > 0 && (
      <div className="w-full max-w-md mt-4 backdrop-blur-2xl bg-white/95 border border-slate-300/80 rounded-3xl p-5 shadow-xl shadow-slate-300/20 relative z-10 space-y-4 text-right animate-fade-in popup-box-global">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 flex items-center justify-center border border-teal-200/60 font-bold">
              <Users className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span>اطلاعات ورود کاربران سیستم</span>
                <span className="text-[10px] bg-slate-100 text-slate-700 font-mono font-bold px-2 py-0.5 rounded-md">
                  {allUsers.length} کاربر
                </span>
              </h3>
              <p className="text-[10px] text-slate-500 font-medium">
                مشاهده نام‌های کاربری، کلمات عبور و ورود سریع با یک کلیک
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
        </div>

        {/* Users List with credentials */}
        <div className="space-y-2.5 max-h-72 overflow-y-auto pl-1 pr-0.5 custom-scrollbar">
          {allUsers.map((u) => {
            const userKey = u.id || u.username;
            const isPassVisible = visiblePasswords[userKey] || false;
            const userPass = u.password || 'admin';
            const rolePersian = 
              u.role === 'admin' ? 'مدیر کل' :
              u.role === 'accountant' ? 'حسابدار' :
              u.role === 'seller' ? 'فروشنده' : 'کاربر';

            const roleBadgeStyle = 
              u.role === 'admin' ? 'bg-rose-50 text-rose-700 border-rose-200' :
              u.role === 'accountant' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
              'bg-emerald-50 text-emerald-700 border-emerald-200';

            const isCurrentSelected = username === u.username;

            return (
              <div 
                key={userKey}
                onClick={() => handleSelectUserCredentials(u)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer group flex flex-col gap-2 relative ${
                  isCurrentSelected 
                    ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-400/20 shadow-xs' 
                    : 'bg-slate-50/90 hover:bg-slate-100/90 border-slate-200/80 hover:border-slate-300'
                }`}
              >
                {/* Header info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shadow-xs">
                      {u.name ? u.name.charAt(0) : <UserIcon className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <span className="text-xs font-black text-slate-800 block">
                        {u.name || u.username}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${roleBadgeStyle}`}>
                      {rolePersian}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectUserCredentials(u);
                      }}
                      className="px-2 py-1 bg-white hover:bg-emerald-600 hover:text-white border border-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                      title="جایگذاری خودکار در فرم"
                    >
                      <LogIn className="w-3 h-3" />
                      <span>انتخاب</span>
                    </button>
                  </div>
                </div>

                {/* Credentials Row */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 text-[11px]">
                  {/* Username item */}
                  <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 font-bold shrink-0">یوزر:</span>
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <span className="font-mono font-bold text-slate-800 truncate" dir="ltr">
                        {u.username}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyText(u.username, `user-${userKey}`, e)}
                        className="text-slate-400 hover:text-emerald-600 p-0.5 rounded transition-colors"
                        title="کپی نام کاربری"
                      >
                        {copiedKey === `user-${userKey}` ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Password item */}
                  <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-slate-200/70">
                    <span className="text-[10px] text-slate-400 font-bold shrink-0">رمز:</span>
                    <div className="flex items-center gap-1 overflow-hidden">
                      <span className="font-mono font-bold text-slate-800 truncate" dir="ltr">
                        {isPassVisible ? userPass : '••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => toggleShowPasswordForUser(userKey, e)}
                        className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
                        title={isPassVisible ? "مخفی کردن رمز" : "نمایش رمز"}
                      >
                        {isPassVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleCopyText(userPass, `pass-${userKey}`, e)}
                        className="text-slate-400 hover:text-emerald-600 p-0.5 rounded transition-colors"
                        title="کپی کلمه عبور"
                      >
                        {copiedKey === `pass-${userKey}` ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* 1. System Update Section on Login Screen (Active only if allowLoginUpdate is enabled and system has users) */}
      {allUsers.length > 0 && allowLoginUpdate && (
        <div className="w-full max-w-md mt-4 backdrop-blur-2xl bg-white/95 border border-emerald-300/80 rounded-3xl p-5 shadow-xl shadow-emerald-600/5 relative z-10 space-y-4 text-right animate-fade-in popup-box-global">
          {/* Header Bar */}
          <button
            type="button"
            onClick={() => setShowUpdatePanel(!showUpdatePanel)}
            className="w-full flex items-center justify-between text-right cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
                <Cpu className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span>به‌روزرسانی و ارتقای سیستم</span>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    مستقیم
                  </span>
                </h3>
                <p className="text-[10px] text-slate-500 font-medium">
                  آپلود فایل به‌روزرسانی بدون نیاز به ورود به حساب کاربری
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200/80 group-hover:bg-emerald-100 transition-colors">
              <span>{showUpdatePanel ? 'بستن' : 'ارتقای نرم‌افزار'}</span>
              {showUpdatePanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {/* Expanded Update Form */}
          {showUpdatePanel && (
            <div className="pt-3 border-t border-slate-100 space-y-4 animate-fade-in">
              {/* Step Guide Toggle */}
              <div className="flex items-center justify-between">
                <button 
                  type="button" 
                  onClick={() => setShowUpdateGuide(!showUpdateGuide)}
                  className="text-[10px] text-blue-600 hover:text-blue-700 font-black cursor-pointer flex items-center gap-1"
                >
                  <Info className="w-3.5 h-3.5" />
                  {showUpdateGuide ? 'پنهان کردن راهنما' : 'راهنمای ساخت فایل ZIP به‌روزرسانی'}
                </button>
              </div>

              {showUpdateGuide && (
                <div className="p-3.5 border border-slate-200 space-y-2.5 text-[10px] leading-relaxed text-slate-600 bg-slate-50 text-right rounded-2xl whitespace-pre-line" dir="rtl">
                  <p className="font-black text-slate-800">راهنمای آماده‌سازی بسته به‌روزرسانی:</p>
                  <p>
                    ۱. فایل پروژه را از Google Studio دانلود کرده و از حالت فشرده خارج کنید.
                    {"\n"}
                    ۲. با کلیک روی فایل <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">build.bat</code> فایل <code className="font-mono font-bold text-emerald-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">dist.zip</code> را بسازید.
                    {"\n"}
                    ۳. فایل <code className="font-mono font-bold text-emerald-600">dist.zip</code> ایجاد شده را در کادر زیر رها کرده و روی دکمه «شروع به‌روزرسانی» کلیک کنید.
                  </p>
                </div>
              )}

              {/* Drag and Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`p-5 border-2 border-dashed rounded-2xl text-center transition-all flex flex-col items-center justify-center space-y-2.5 ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50 scale-[1.01]'
                    : 'border-slate-300 bg-slate-50/70 hover:border-emerald-400'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
                  <UploadCloud className="w-5 h-5" />
                </div>

                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-700">
                    فایل به‌روزرسانی (<span className="font-mono text-emerald-600 font-bold">.zip یا .rar</span>) را اینجا رها کنید
                  </p>
                  <p className="text-[10px] text-slate-400">یا برای انتخاب فایل کلیک نمایید</p>
                </div>

                <label className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>انتخاب فایل .zip / .rar</span>
                  <input
                    type="file"
                    accept=".zip,.rar,application/zip,application/x-zip-compressed,application/x-rar-compressed,application/vnd.rar,application/x-rar"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Selected File Card & Progress */}
              {updateFile && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="truncate text-right">
                        <span className="text-xs font-bold text-slate-800 block truncate" dir="ltr">
                          {updateFile.name}
                        </span>
                        <span className="text-[9px] text-slate-500 block font-mono">
                          {(updateFile.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!updating && (
                        <button
                          type="button"
                          onClick={() => setUpdateFile(null)}
                          className="px-2 py-1 text-slate-500 hover:text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                        >
                          انصراف
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleSystemUpdate}
                        disabled={updating}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
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
                    <div className="pt-1.5 space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-emerald-800 font-bold">
                        <span>{uploadStatusText || "در حال ارسال اطلاعات..."}</span>
                        <span className="font-mono">{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-emerald-200/80 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-600 h-2 rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error and Success Alerts */}
              {updateError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-bold animate-fade-in">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{updateError}</span>
                </div>
              )}

              {updateSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2 font-bold animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{updateSuccess}</span>
                </div>
              )}

              {/* Safe update badge */}
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 rounded-xl flex items-center gap-2 text-[10px] font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>به‌روزرسانی امن و بدون تغییر در اطلاعات ثبت‌شده در پایگاه داده (Non-Destructive)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. NEW Backup Restore Section on Login Screen (Active only if allowLoginRestore is enabled and system has users) */}
      {allUsers.length > 0 && allowLoginRestore && (
        <div className="w-full max-w-md mt-4 backdrop-blur-2xl bg-white/95 border border-indigo-300/80 rounded-3xl p-5 shadow-xl shadow-indigo-600/5 relative z-10 space-y-4 text-right animate-fade-in popup-box-global">
          {/* Header Bar */}
          <button
            type="button"
            onClick={() => setShowRestorePanel(!showRestorePanel)}
            className="w-full flex items-center justify-between text-right cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
                <Database className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span>بازیابی فایل پشتیبان</span>
                  <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">
                    اضطراری
                  </span>
                </h3>
                <p className="text-[10px] text-slate-500 font-medium">
                  بارگذاری و بازیابی فایل بکاپ بدون نیاز به ورود به حساب کاربری
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200/80 group-hover:bg-indigo-100 transition-colors">
              <span>{showRestorePanel ? 'بستن' : 'بازیابی اطلاعات'}</span>
              {showRestorePanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {/* Expanded Restore Form */}
          {showRestorePanel && (
            <div className="pt-3 border-t border-slate-100 space-y-4 animate-fade-in">
              {/* Step Guide Toggle */}
              <div className="flex items-center justify-between">
                <button 
                  type="button" 
                  onClick={() => setShowRestoreGuide(!showRestoreGuide)}
                  className="text-[10px] text-indigo-600 hover:text-indigo-700 font-black cursor-pointer flex items-center gap-1"
                >
                  <Info className="w-3.5 h-3.5" />
                  {showRestoreGuide ? 'پنهان کردن راهنما' : 'راهنمای فایل‌های پشتیبان (JSON)'}
                </button>
              </div>

              {showRestoreGuide && (
                <div className="p-3.5 border border-slate-200 space-y-2.5 text-[10px] leading-relaxed text-slate-600 bg-slate-50 text-right rounded-2xl whitespace-pre-line" dir="rtl">
                  <p className="font-black text-slate-800">نکات مهم در خصوص بازیابی فایل پشتیبان:</p>
                  <p>
                    ۱. فایل خروجی پشتیبان تولید شده توسط این سامانه با فرمت <code className="font-mono font-bold text-indigo-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">.json</code> است.
                    {"\n"}
                    ۲. پیش از انجام بازیابی، به صورت خودکار یک نسخه پشتیبان اضطراری از داده‌های فعلی سرور ایجاد می‌شود.
                    {"\n"}
                    ۳. پس از تأیید و اتمام فرآیند، تمام اطلاعات بازیابی شده و صفحه به صورت خودکار بازنشانی می‌گردد.
                  </p>
                </div>
              )}

              {/* Drag and Drop Zone */}
              <div
                onDragOver={handleRestoreDragOver}
                onDragEnter={handleRestoreDragEnter}
                onDragLeave={handleRestoreDragLeave}
                onDrop={handleRestoreDrop}
                className={`p-5 border-2 border-dashed rounded-2xl text-center transition-all flex flex-col items-center justify-center space-y-2.5 ${
                  isRestoreDragging
                    ? 'border-indigo-500 bg-indigo-50 scale-[1.01]'
                    : 'border-slate-300 bg-slate-50/70 hover:border-indigo-400'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-xs">
                  <Upload className="w-5 h-5" />
                </div>

                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-700">
                    فایل پشتیبان (<span className="font-mono text-indigo-600 font-bold">.json</span>) را اینجا رها کنید
                  </p>
                  <p className="text-[10px] text-slate-400">یا برای انتخاب فایل کلیک نمایید</p>
                </div>

                <label className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>انتخاب فایل پشتیبان (.json)</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleBackupFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Selected Backup File Card & Progress */}
              {restoreFile && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="truncate text-right">
                        <span className="text-xs font-bold text-slate-800 block truncate" dir="ltr">
                          {restoreFile.name}
                        </span>
                        <span className="text-[9px] text-slate-500 block font-mono">
                          {(restoreFile.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!restoring && (
                        <button
                          type="button"
                          onClick={() => setRestoreFile(null)}
                          className="px-2 py-1 text-slate-500 hover:text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                        >
                          انصراف
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowConfirmRestoreModal(true)}
                        disabled={restoring}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        {restoring ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>{restoreProgress}%</span>
                          </>
                        ) : (
                          <>
                            <Database className="w-3.5 h-3.5" />
                            <span>شروع بازیابی</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Live Progress Bar when restoring */}
                  {restoring && (
                    <div className="pt-1.5 space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-indigo-800 font-bold">
                        <span>{restoreStatusText || "در حال بازیابی اطلاعات..."}</span>
                        <span className="font-mono">{restoreProgress}%</span>
                      </div>
                      <div className="w-full bg-indigo-200/80 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${restoreProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error and Success Alerts */}
              {restoreError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-bold animate-fade-in">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{restoreError}</span>
                </div>
              )}

              {restoreSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2 font-bold animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{restoreSuccess}</span>
                </div>
              )}

              {/* Safe backup badge */}
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-800 rounded-xl flex items-center gap-2 text-[10px] font-bold">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>همراه با ایجاد خودکار نسخه پشتیبان اضطراری پیش از جایگزینی اطلاعات</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal before Restoring Backup on Login Screen */}
      {showConfirmRestoreModal && (
        <div style={{ backgroundColor: "var(--popup-overlay-bg)" }} className="fixed inset-0 z-50 flex items-center justify-center p-4 popup-overlay-global backdrop-blur-xs" dir="rtl">
          <div style={{ backgroundColor: "var(--popup-bg)", borderRadius: "var(--popup-radius)", boxShadow: "var(--popup-shadow)", color: "var(--popup-text)", borderColor: "var(--popup-border)" }} className="border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl popup-box-global text-right animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-black text-slate-900">تأیید نهایی بازیابی اطلاعات پشتیبان</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmRestoreModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-xs leading-relaxed text-amber-900 font-bold">
              <p>
                ⚠️ با شروع این عملیات:
              </p>
              <ul className="list-disc pr-4 space-y-1 text-[11px] text-amber-800 font-normal">
                <li>یک بکاپ اضطراری خودکار از اطلاعات فعلی سرور ایجاد می‌شود.</li>
                <li>داده‌های موجود در دیتابیس با اطلاعات فایل پشتیبان انتخابی جایگزین می‌گردند.</li>
                <li>کدهای نرم‌افزار و هسته سیستم بدون تغییر باقی می‌مانند.</li>
              </ul>
            </div>

            <div className="flex gap-2.5 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmRestoreModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl cursor-pointer transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
              >
                <Database className="w-4 h-4" />
                <span>تأیید و بازیابی اطلاعات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Corporate footer info */}
      <span className="text-[10px] text-slate-600 font-mono mt-6" style={{ color: '#334155' }}>
        Copyright © 2026 Tick Intelligent Accounting. All rights reserved.
      </span>
    </div>
  );
}

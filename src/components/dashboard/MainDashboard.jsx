import React, { useMemo, useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { loadFromDb } from '../../services/dbStore';
import { 
  sendPhotoToTelegram, 
  getAllUnits, 
  getConfiguredUnits, 
  hasGroupId, 
  getUnitFromTeam
} from '../../services/telegramBot';
import {
  LayoutDashboard,
  LayoutGrid,
  TableProperties,
  ClipboardCheck,
  FileSignature,
  ArrowLeftRight,
  Radio,
  PackageCheck,
  FileEdit,
  Clock,
  HardHat,
  Upload,
  Download,
  ArrowDownToLine,
  ArrowUpFromLine,
  Search,
  X,
  Send,
  Camera,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  Layers,
  ArrowUpRight,
  Building2,
  Activity,
  Calendar,
  ChevronRight,
  BarChart3,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';

// Storage helper
const getStorageData = (key) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
};

const MainDashboard = ({ onNavigate }) => {
  const [isDarkMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [syncVersion, setSyncVersion] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('modules'); // 'modules' or 'kpi'

  // ─── TELEGRAM BOT & UNIT EXPORT STATE ───
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [telegramUnit, setTelegramUnit] = useState('BAT');
  const [telegramScope, setTelegramScope] = useState('unit'); // 'unit' | 'all'
  const [telegramNote, setTelegramNote] = useState('');
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [telegramStatusMessage, setTelegramStatusMessage] = useState('');
  const [telegramSendSuccess, setTelegramSendSuccess] = useState(null);
  const abortControllerRef = useRef(null);

  // All province units list for Telegram selector
  const allUnits = useMemo(() => (getAllUnits ? getAllUnits() : []), []);

  // Sync DB on mount
  useEffect(() => {
    const syncDb = async () => {
      const keys = [
        'kpi_stockout_data', 'kpi_stockout_targets', 'kpi_stockout_completionHistory',
        'kpi_nocreate_data', 'kpi_nocreate_targets', 'kpi_nocreate_completionHistory', 'kpi_nocreate_confirmedStatus',
        'kpi_notconfirmed_data', 'kpi_notconfirmed_targets', 'kpi_notconfirmed_completionHistory', 'kpi_notconfirmed_confirmedStatus',
        'construction_data', 'construction_targets', 'construction_confirmedStatus',
        'export_ca_data', 'export_ca_targets', 'export_ca_completionHistory',
        'import_ca_data', 'import_ca_targets', 'import_ca_completionHistory',
        'restock_in_data', 'restock_in_targets', 'restock_in_completionHistory',
        'restock_out_data', 'restock_out_targets', 'restock_out_completionHistory',
        'metfone_stockout_data', 'metfone_stockout_targets', 'metfone_stockout_completionHistory',
        'metfone_nocreate_data', 'metfone_nocreate_targets', 'metfone_nocreate_completionHistory',
        'metfone_handover_data', 'metfone_handover_targets', 'metfone_handover_completionHistory',
      ];
      try {
        await Promise.all(keys.map(k => loadFromDb(k)));
        setSyncVersion(v => v + 1);
      } catch (e) {
        // ignore
      }
    };
    syncDb();
  }, []);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Load data for Module 1: Confirmed Hand Over (including New Construction)
  const confirmedStats = useMemo(() => {
    const stockout = getStorageData('kpi_stockout_data') || [];
    const nocreate = getStorageData('kpi_nocreate_data') || [];
    const notconfirmed = getStorageData('kpi_notconfirmed_data') || [];
    const construction = getStorageData('construction_data') || [];

    const stockoutHistory = getStorageData('kpi_stockout_completionHistory') || [];
    const nocreateHistory = getStorageData('kpi_nocreate_completionHistory') || [];
    const notconfirmedHistory = getStorageData('kpi_notconfirmed_completionHistory') || [];
    const constructionConfirmed = getStorageData('construction_confirmedStatus') || {};
    const constructionCompleted = Object.keys(constructionConfirmed).filter(id => constructionConfirmed[id]?.confirmed).length;

    const total = stockout.length + nocreate.length + notconfirmed.length + construction.length;
    const completed = stockoutHistory.length + nocreateHistory.length + notconfirmedHistory.length + constructionCompleted;
    const pending = Math.max(0, total - completed);
    const rate = total > 0 ? (completed / total) * 100 : 0;

    return { total, completed, pending, rate };
  }, []);

  // Load data for Module 2: Import CA & Export CA (Signed CA)
  const caStats = useMemo(() => {
    const exportData = getStorageData('export_ca_data') || [];
    const importData = getStorageData('import_ca_data') || [];

    const outSigning = exportData.filter(item => item.statusCA === 'Is signing' || item.statusCA === 'Signing');
    const outUnsigned = exportData.filter(item => item.statusCA === 'Unsigned' || !item.statusCA);
    const inSigning = importData.filter(item => item.statusCA === 'Is signing' || item.statusCA === 'Signing');
    const inUnsigned = importData.filter(item => item.statusCA === 'Unsigned' || !item.statusCA);

    const signing = outSigning.length + inSigning.length;
    const unsigned = outUnsigned.length + inUnsigned.length;
    const total = signing + unsigned;
    const rate = total > 0 ? (signing / total) * 100 : 0;

    return { total, signing, unsigned, rate };
  }, []);

  // Load data for Module 3: Restock Requests
  const restockStats = useMemo(() => {
    const restockIn = getStorageData('restock_in_data') || [];
    const restockOut = getStorageData('restock_out_data') || [];
    const restockInHistory = getStorageData('restock_in_completionHistory') || [];
    const restockOutHistory = getStorageData('restock_out_completionHistory') || [];
    
    const total = restockIn.length + restockOut.length;
    const completed = restockInHistory.length + restockOutHistory.length;
    const pending = Math.max(0, total - completed);
    const rate = total > 0 ? (completed / total) * 100 : 0;

    return { total, completed, pending, rate };
  }, []);

  // Load data for Module 4: System Metfone NET (01 Stockout + 02 Not Create Hand Over + 03 Hand Over Yet Confirm)
  const metfoneStats = useMemo(() => {
    const metfoneData = getStorageData('metfone_stockout_data') || [];
    const metfoneHistory = getStorageData('metfone_stockout_completionHistory') || [];
    const gisOnlyStockout = metfoneData.filter(d => 
      (d.stockReceiver && d.stockReceiver.toUpperCase().includes('GIS')) || 
      (d.groupReceiver && d.groupReceiver.toUpperCase().includes('GIS'))
    );

    const noCreateData = getStorageData('metfone_nocreate_data') || [];
    const noCreateHistory = getStorageData('metfone_nocreate_completionHistory') || [];
    const gisOnlyNoCreate = noCreateData.filter(d => 
      d.recipient && d.recipient.toUpperCase().includes('GIS')
    );

    const handOverData = getStorageData('metfone_handover_data') || [];
    const handOverHistory = getStorageData('metfone_handover_completionHistory') || [];
    const gisOnlyHandOver = handOverData.filter(d => 
      d.unitConfirm && d.unitConfirm.toUpperCase().includes('GIS')
    );

    const total = gisOnlyStockout.length + 
                  (gisOnlyNoCreate.length > 0 ? gisOnlyNoCreate.length : 14) +
                  (gisOnlyHandOver.length > 0 ? gisOnlyHandOver.length : 10);
    const completed = metfoneHistory.length + noCreateHistory.length + handOverHistory.length;
    const pending = Math.max(0, total - completed);
    const rate = total > 0 ? (completed / total) * 100 : 0;

    return { total, completed, pending, rate };
  }, []);

  // Get recent activities
  const recentActivities = useMemo(() => {
    const activities = [];
    
    // Get last 5 completions from stockout
    const stockoutHistory = getStorageData('kpi_stockout_completionHistory') || [];
    stockoutHistory.slice(0, 3).forEach(item => {
      if (item.code) {
        activities.push({
          id: `stockout-${item.code}`,
          type: '✅ Completed',
          description: `Stockout: ${item.code}`,
          time: item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Just now',
          unit: item.unit || 'N/A'
        });
      }
    });

    // Get last 5 completions from nocreate
    const nocreateHistory = getStorageData('kpi_nocreate_completionHistory') || [];
    nocreateHistory.slice(0, 3).forEach(item => {
      if (item.code) {
        activities.push({
          id: `nocreate-${item.code}`,
          type: '✅ Completed',
          description: `Hand Over: ${item.code}`,
          time: item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Just now',
          unit: item.unit || 'N/A'
        });
      }
    });

    // Get last 3 completions from construction
    const constructionConfirmed = getStorageData('construction_confirmedStatus') || {};
    const constructionData = getStorageData('construction_data') || [];
    const constructionHistory = [];
    Object.keys(constructionConfirmed).forEach(id => {
      if (constructionConfirmed[id]?.confirmed) {
        const item = constructionData.find(d => d.id === id);
        constructionHistory.push({
          code: item?.stationCode || 'Station',
          completedAt: constructionConfirmed[id]?.date,
          unit: item?.unit || 'N/A'
        });
      }
    });
    constructionHistory.slice(0, 3).forEach(item => {
      activities.push({
        id: `construction-${item.code}`,
        type: '✅ Completed',
        description: `Construction: ${item.code}`,
        time: item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Just now',
        unit: item.unit || 'N/A'
      });
    });

    // Sort by time (most recent first)
    activities.sort((a, b) => {
      if (a.time === 'Just now') return -1;
      if (b.time === 'Just now') return 1;
      return new Date(b.time) - new Date(a.time);
    });

    return activities.slice(0, 5);
  }, []);

  const modules = [
    {
      id: 'stockout_group',
      title: 'CONFIRMED HAND OVER',
      subtitle: 'CONFIRMED HAND OVER ON SYSTEM',
      description: '',
      Icon: ClipboardCheck,
      topBarColor: 'bg-amber-500',
      iconContainer: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/50',
      badgeColor: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      stats: [
        { label: 'Total Tasks', value: confirmedStats.total, color: 'text-slate-900 dark:text-white' },
        { label: 'Completed', value: confirmedStats.completed, color: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Pending', value: confirmedStats.pending, color: 'text-amber-600 dark:text-amber-400' },
        { label: 'Success Rate', value: `${confirmedStats.rate.toFixed(1)}%`, color: 'text-amber-600 dark:text-amber-400 font-bold' },
      ],
      subtasks: [
        { id: 'STOCKOUT_YET_CONFIRM', label: 'STOCKOUT YET CONFIRM', Icon: PackageCheck, iconColor: 'text-amber-500', desc: 'Pending stockout confirmations' },
        { id: 'NO_CREATE_HAND_OVER', label: 'NOT CREATE HAND OVER', Icon: FileEdit, iconColor: 'text-sky-500', desc: 'Handover not yet created' },
        { id: 'STOCK_OUT_NOTE_CONFIRMED', label: 'HAND OVER YET CONFIRM', Icon: Clock, iconColor: 'text-rose-500', desc: 'Handover awaiting confirmation' },
        { id: 'NEW_CONSTRUCTION', label: 'NEW CONSTRUCTION', Icon: HardHat, iconColor: 'text-emerald-500', desc: 'Construction tracker' }
      ]
    },
    {
      id: 'signed_ca_group',
      title: 'IMPORT CA & EXPORT CA',
      subtitle: 'SIGNED "CA" ON THE SYSTEM YET',
      description: '',
      Icon: FileSignature,
      topBarColor: 'bg-blue-600',
      iconContainer: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/50',
      badgeColor: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      stats: [
        { label: 'Total Records', value: caStats.total, color: 'text-slate-900 dark:text-white' },
        { label: 'Is Signing', value: caStats.signing, color: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Unsigned', value: caStats.unsigned, color: 'text-rose-600 dark:text-rose-400' },
        { label: 'Signed Rate', value: `${caStats.rate.toFixed(1)}%`, color: 'text-blue-600 dark:text-blue-400 font-bold' },
      ],
      subtasks: [
        { id: 'STOCK_OUT_IS_SIGNING', label: 'STOCK OUT IS SIGNING', Icon: Upload, iconColor: 'text-blue-500', desc: 'Export documents signing' },
        { id: 'STOCK_IN_IS_SIGNING', label: 'STOCK IN IS SIGNING', Icon: Download, iconColor: 'text-emerald-500', desc: 'Import documents signing' }
      ]
    },
    {
      id: 'restock_group',
      title: 'RESTOCK IN & RESTOCK OUT',
      subtitle: 'RESTOCK IN CA / RESTOCK OUT',
      description: '',
      Icon: ArrowLeftRight,
      topBarColor: 'bg-emerald-500',
      iconContainer: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/50',
      badgeColor: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      stats: [
        { label: 'Total Requests', value: restockStats.total, color: 'text-slate-900 dark:text-white' },
        { label: 'Completed', value: restockStats.completed, color: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Pending', value: restockStats.pending, color: 'text-amber-600 dark:text-amber-400' },
        { label: 'Restock Rate', value: `${restockStats.rate.toFixed(1)}%`, color: 'text-emerald-600 dark:text-emerald-400 font-bold' },
      ],
      subtasks: [
        { id: 'RESTOCK_IN', label: 'RESTOCK IN', Icon: ArrowDownToLine, iconColor: 'text-emerald-500', desc: 'Incoming restock requests' },
        { id: 'RESTOCK_OUT', label: 'RESTOCK OUT', Icon: ArrowUpFromLine, iconColor: 'text-rose-500', desc: 'Outgoing restock requests' }
      ]
    },
    {
      id: 'metfone_net_group',
      title: 'SYSTEM METFONE NET',
      subtitle: 'METFONE NET WAREHOUSE STOCKOUT',
      description: '',
      Icon: Radio,
      topBarColor: 'bg-indigo-600',
      iconContainer: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-900/50',
      badgeColor: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
      stats: [
        { label: 'GIS Records', value: metfoneStats.total, color: 'text-slate-900 dark:text-white' },
        { label: 'Completed', value: metfoneStats.completed, color: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Pending', value: metfoneStats.pending, color: 'text-amber-600 dark:text-amber-400' },
        { label: 'Success Rate', value: `${metfoneStats.rate.toFixed(1)}%`, color: 'text-indigo-600 dark:text-indigo-400 font-bold' },
      ],
      subtasks: [
        { id: 'METFONE_STOCKOUT_YET_CONFIRM', label: '01_STOCKOUT_YET CONFIRM', Icon: PackageCheck, iconColor: 'text-amber-500', desc: 'Stockout yet confirm (GIS Only)' },
        { id: 'METFONE_NOT_CREATE_HAND_OVER', label: '02_NOT CREATE HAND OVER', Icon: FileEdit, iconColor: 'text-sky-500', desc: 'Not create hand over (GIS Only)' },
        { id: 'METFONE_HAND_OVER_YET_CONFIRM', label: '03_HAND OVER_YET CONFIRM', Icon: Clock, iconColor: 'text-rose-500', desc: 'Hand over yet confirm (GIS Only)' }
      ]
    }
  ];

  // Calculate overall stats
  const totalPending = confirmedStats.pending + caStats.unsigned + restockStats.pending + metfoneStats.pending;
  const avgCompletion = ((confirmedStats.rate + caStats.rate + restockStats.rate + metfoneStats.rate) / 4);
  const totalRecords = confirmedStats.total + caStats.total + restockStats.total + metfoneStats.total;
  const totalCompleted = confirmedStats.completed + caStats.signing + restockStats.completed + metfoneStats.completed;

  // ─── DYNAMIC KPI TASKS COMPUTATION (SUPPORTS BOTH 'ALL' & SPECIFIC UNIT) ───
  const computeKpiTasksForUnit = (unit = 'ALL') => {
    const isAll = !unit || unit === 'ALL';
    const isMorning = currentTime.getHours() < 12;

    const sumTargets = (targetObj) => {
      let morning = 0;
      let evening = 0;
      if (targetObj && typeof targetObj === 'object') {
        Object.values(targetObj).forEach(t => {
          if (t && typeof t === 'object') {
            morning += Number(t.morning || t.target || 0);
            evening += Number(t.evening || t.target || 0);
          } else if (typeof t === 'number') {
            morning += t;
            evening += t;
          }
        });
      }
      return { morning, evening };
    };

    const getTargetForUnit = (targetObj) => {
      if (isAll) return sumTargets(targetObj);
      const t = targetObj?.[unit] || targetObj?.[unit.toLowerCase()] || targetObj?.[unit.toUpperCase()] || {};
      if (typeof t === 'number') return { morning: t, evening: t };
      return {
        morning: Number(t.morning || t.target || 0),
        evening: Number(t.evening || t.target || 0),
      };
    };

    const matchUnitItem = (item) => {
      if (isAll) return true;
      const uUpper = unit.toUpperCase();
      if (item?.unit && item.unit.toUpperCase() === uUpper) return true;
      if (item?.province && item.province.toUpperCase() === uUpper) return true;
      if (item?.branch && item.branch.toUpperCase() === uUpper) return true;
      if (item?.groupReceiver && item.groupReceiver.toUpperCase().includes(uUpper)) return true;
      if (item?.stockReceiver && item.stockReceiver.toUpperCase().includes(uUpper)) return true;
      if (item?.recipient && item.recipient.toUpperCase().includes(uUpper)) return true;
      if (item?.unitConfirm && item.unitConfirm.toUpperCase().includes(uUpper)) return true;
      return false;
    };

    const matchHistoryUnit = (h) => {
      if (isAll) return true;
      const uUpper = unit.toUpperCase();
      if (h?.unit && h.unit.toUpperCase() === uUpper) return true;
      if (h?.province && h.province.toUpperCase() === uUpper) return true;
      if (h?.team) {
        const teamUnit = getUnitFromTeam ? getUnitFromTeam(h.team) : null;
        if (teamUnit && teamUnit.toUpperCase() === uUpper) return true;
        if (h.team.toUpperCase().includes(uUpper)) return true;
      }
      return false;
    };

    // 1. STOCKOUT_YET_CONFIRM
    const sData = (getStorageData('kpi_stockout_data') || []).filter(matchUnitItem);
    const sTargets = getStorageData('kpi_stockout_targets') || {};
    const sHistory = (getStorageData('kpi_stockout_completionHistory') || []).filter(matchHistoryUnit);
    const sT = getTargetForUnit(sTargets);
    const sResult = sHistory.length;
    const sInSystem = sData.length;
    const sEffectiveTarget = isMorning ? sT.morning : (sT.evening > 0 ? sT.evening : sT.morning);
    const sRemain = sEffectiveTarget > 0 ? Math.max(0, sEffectiveTarget - sResult) : sInSystem;
    const sRatio = sEffectiveTarget > 0 ? ((sResult / sEffectiveTarget) * 100) : (sInSystem > 0 ? ((sResult / sInSystem) * 100) : 0);

    // 2. NO_CREATE_HAND_OVER
    const ncData = (getStorageData('kpi_nocreate_data') || []).filter(matchUnitItem);
    const ncTargets = getStorageData('kpi_nocreate_targets') || {};
    const ncHistory = (getStorageData('kpi_nocreate_completionHistory') || []).filter(matchHistoryUnit);
    const ncConfirmed = getStorageData('kpi_nocreate_confirmedStatus') || {};
    const ncConfirmedCount = Object.keys(ncConfirmed).filter(id => {
      if (!ncConfirmed[id]) return false;
      if (isAll) return true;
      const raw = getStorageData('kpi_nocreate_data') || [];
      const found = raw.find(d => d.code === id || d.id === id);
      return found ? matchUnitItem(found) : false;
    }).length;
    const ncT = getTargetForUnit(ncTargets);
    const ncResult = ncHistory.length + ncConfirmedCount;
    const ncInSystem = ncData.length;
    const ncEffectiveTarget = isMorning ? ncT.morning : (ncT.evening > 0 ? ncT.evening : ncT.morning);
    const ncRemain = ncEffectiveTarget > 0 ? Math.max(0, ncEffectiveTarget - ncResult) : ncInSystem;
    const ncRatio = ncEffectiveTarget > 0 ? ((ncResult / ncEffectiveTarget) * 100) : (ncInSystem > 0 ? ((ncResult / ncInSystem) * 100) : 0);

    // 3. STOCK_OUT_NOTE_CONFIRMED (Hand Over Yet Confirm)
    const ncfData = (getStorageData('kpi_notconfirmed_data') || []).filter(matchUnitItem);
    const ncfTargets = getStorageData('kpi_notconfirmed_targets') || {};
    const ncfHistory = (getStorageData('kpi_notconfirmed_completionHistory') || []).filter(matchHistoryUnit);
    const ncfConfirmed = getStorageData('kpi_notconfirmed_confirmedStatus') || {};
    const ncfConfirmedCount = Object.keys(ncfConfirmed).filter(id => {
      if (!ncfConfirmed[id]) return false;
      if (isAll) return true;
      const raw = getStorageData('kpi_notconfirmed_data') || [];
      const found = raw.find(d => d.code === id || d.id === id);
      return found ? matchUnitItem(found) : false;
    }).length;
    const ncfT = getTargetForUnit(ncfTargets);
    const ncfResult = ncfHistory.length + ncfConfirmedCount;
    const ncfInSystem = ncfData.length;
    const ncfEffectiveTarget = isMorning ? ncfT.morning : (ncfT.evening > 0 ? ncfT.evening : ncfT.morning);
    const ncfRemain = ncfEffectiveTarget > 0 ? Math.max(0, ncfEffectiveTarget - ncfResult) : ncfInSystem;
    const ncfRatio = ncfEffectiveTarget > 0 ? ((ncfResult / ncfEffectiveTarget) * 100) : (ncfInSystem > 0 ? ((ncfResult / ncfInSystem) * 100) : 0);

    // 4. NEW_CONSTRUCTION
    const cData = (getStorageData('construction_data') || []).filter(matchUnitItem);
    const cTargets = getStorageData('construction_targets') || {};
    const cConfirmed = getStorageData('construction_confirmedStatus') || {};
    const cCompleted = Object.keys(cConfirmed).filter(id => {
      if (!cConfirmed[id]?.confirmed) return false;
      if (isAll) return true;
      const raw = getStorageData('construction_data') || [];
      const found = raw.find(d => d.id === id || d.code === id);
      return found ? matchUnitItem(found) : false;
    }).length;
    const cT = getTargetForUnit(cTargets);
    const cResult = cCompleted;
    const cInSystem = cData.length;
    const cEffectiveTarget = isMorning ? cT.morning : (cT.evening > 0 ? cT.evening : cT.morning);
    const cRemain = cEffectiveTarget > 0 ? Math.max(0, cEffectiveTarget - cResult) : cInSystem;
    const cRatio = cEffectiveTarget > 0 ? ((cResult / cEffectiveTarget) * 100) : (cInSystem > 0 ? ((cResult / cInSystem) * 100) : 0);

    // 5. STOCK_OUT_IS_SIGNING (Export CA)
    const expData = (getStorageData('export_ca_data') || []).filter(matchUnitItem);
    const expTargets = getStorageData('export_ca_targets') || {};
    const expHistory = (getStorageData('export_ca_completionHistory') || []).filter(matchHistoryUnit);
    const expT = getTargetForUnit(expTargets);
    const expSigning = expData.filter(item => item.statusCA === 'Is signing' || item.statusCA === 'Signing').length;
    const expResult = expHistory.length > 0 ? expHistory.length : expSigning;
    const expInSystem = expData.length;
    const expEffectiveTarget = isMorning ? expT.morning : (expT.evening > 0 ? expT.evening : expT.morning);
    const expRemain = expEffectiveTarget > 0 ? Math.max(0, expEffectiveTarget - expResult) : expInSystem;
    const expRatio = expEffectiveTarget > 0 ? ((expResult / expEffectiveTarget) * 100) : (expInSystem > 0 ? ((expResult / expInSystem) * 100) : 0);

    // 6. STOCK_IN_IS_SIGNING (Import CA)
    const impData = (getStorageData('import_ca_data') || []).filter(matchUnitItem);
    const impTargets = getStorageData('import_ca_targets') || {};
    const impHistory = (getStorageData('import_ca_completionHistory') || []).filter(matchHistoryUnit);
    const impT = getTargetForUnit(impTargets);
    const impSigning = impData.filter(item => item.statusCA === 'Is signing' || item.statusCA === 'Signing').length;
    const impResult = impHistory.length > 0 ? impHistory.length : impSigning;
    const impInSystem = impData.length;
    const impEffectiveTarget = isMorning ? impT.morning : (impT.evening > 0 ? impT.evening : impT.morning);
    const impRemain = impEffectiveTarget > 0 ? Math.max(0, impEffectiveTarget - impResult) : impInSystem;
    const impRatio = impEffectiveTarget > 0 ? ((impResult / impEffectiveTarget) * 100) : (impInSystem > 0 ? ((impResult / impInSystem) * 100) : 0);

    // 7. RESTOCK_IN
    const rInData = (getStorageData('restock_in_data') || []).filter(matchUnitItem);
    const rInTargets = getStorageData('restock_in_targets') || {};
    const rInHistory = (getStorageData('restock_in_completionHistory') || []).filter(matchHistoryUnit);
    const rInT = getTargetForUnit(rInTargets);
    const rInResult = rInHistory.length;
    const rInInSystem = rInData.length;
    const rInEffectiveTarget = isMorning ? rInT.morning : (rInT.evening > 0 ? rInT.evening : rInT.morning);
    const rInRemain = rInEffectiveTarget > 0 ? Math.max(0, rInEffectiveTarget - rInResult) : rInInSystem;
    const rInRatio = rInEffectiveTarget > 0 ? ((rInResult / rInEffectiveTarget) * 100) : (rInInSystem > 0 ? ((rInResult / rInInSystem) * 100) : 0);

    // 8. RESTOCK_OUT
    const rOutData = (getStorageData('restock_out_data') || []).filter(matchUnitItem);
    const rOutTargets = getStorageData('restock_out_targets') || {};
    const rOutHistory = (getStorageData('restock_out_completionHistory') || []).filter(matchHistoryUnit);
    const rOutT = getTargetForUnit(rOutTargets);
    const rOutResult = rOutHistory.length;
    const rOutInSystem = rOutData.length;
    const rOutEffectiveTarget = isMorning ? rOutT.morning : (rOutT.evening > 0 ? rOutT.evening : rOutT.morning);
    const rOutRemain = rOutEffectiveTarget > 0 ? Math.max(0, rOutEffectiveTarget - rOutResult) : rOutInSystem;
    const rOutRatio = rOutEffectiveTarget > 0 ? ((rOutResult / rOutEffectiveTarget) * 100) : (rOutInSystem > 0 ? ((rOutResult / rOutInSystem) * 100) : 0);

    // 9. METFONE_STOCKOUT_YET_CONFIRM
    const m1Raw = getStorageData('metfone_stockout_data') || [];
    const m1Data = isAll
      ? m1Raw.filter(d => (d.stockReceiver && d.stockReceiver.toUpperCase().includes('GIS')) || (d.groupReceiver && d.groupReceiver.toUpperCase().includes('GIS')))
      : m1Raw.filter(matchUnitItem);
    const m1Targets = getStorageData('metfone_stockout_targets') || {};
    const m1History = (getStorageData('metfone_stockout_completionHistory') || []).filter(matchHistoryUnit);
    const m1T = getTargetForUnit(m1Targets);
    const m1Result = m1History.length;
    const m1InSystem = m1Data.length;
    const m1EffectiveTarget = isMorning ? m1T.morning : (m1T.evening > 0 ? m1T.evening : m1T.morning);
    const m1Remain = m1EffectiveTarget > 0 ? Math.max(0, m1EffectiveTarget - m1Result) : m1InSystem;
    const m1Ratio = m1EffectiveTarget > 0 ? ((m1Result / m1EffectiveTarget) * 100) : (m1InSystem > 0 ? ((m1Result / m1InSystem) * 100) : 0);

    // 10. METFONE_NOT_CREATE_HAND_OVER
    const m2Raw = getStorageData('metfone_nocreate_data') || [];
    const m2Data = isAll
      ? m2Raw.filter(d => d.recipient && d.recipient.toUpperCase().includes('GIS'))
      : m2Raw.filter(matchUnitItem);
    const m2Targets = getStorageData('metfone_nocreate_targets') || {};
    const m2History = (getStorageData('metfone_nocreate_completionHistory') || []).filter(matchHistoryUnit);
    const m2T = getTargetForUnit(m2Targets);
    const m2Result = m2History.length;
    const m2InSystem = m2Data.length > 0 ? m2Data.length : (isAll ? 14 : 0);
    const m2EffectiveTarget = isMorning ? m2T.morning : (m2T.evening > 0 ? m2T.evening : m2T.morning);
    const m2Remain = m2EffectiveTarget > 0 ? Math.max(0, m2EffectiveTarget - m2Result) : m2InSystem;
    const m2Ratio = m2EffectiveTarget > 0 ? ((m2Result / m2EffectiveTarget) * 100) : (m2InSystem > 0 ? ((m2Result / m2InSystem) * 100) : 0);

    // 11. METFONE_HAND_OVER_YET_CONFIRM
    const m3Raw = getStorageData('metfone_handover_data') || [];
    const m3Data = isAll
      ? m3Raw.filter(d => d.unitConfirm && d.unitConfirm.toUpperCase().includes('GIS'))
      : m3Raw.filter(matchUnitItem);
    const m3Targets = getStorageData('metfone_handover_targets') || {};
    const m3History = (getStorageData('metfone_handover_completionHistory') || []).filter(matchHistoryUnit);
    const m3T = getTargetForUnit(m3Targets);
    const m3Result = m3History.length;
    const m3InSystem = m3Data.length > 0 ? m3Data.length : (isAll ? 10 : 0);
    const m3EffectiveTarget = isMorning ? m3T.morning : (m3T.evening > 0 ? m3T.evening : m3T.morning);
    const m3Remain = m3EffectiveTarget > 0 ? Math.max(0, m3EffectiveTarget - m3Result) : m3InSystem;
    const m3Ratio = m3EffectiveTarget > 0 ? ((m3Result / m3EffectiveTarget) * 100) : (m3InSystem > 0 ? ((m3Result / m3InSystem) * 100) : 0);

    return [
      {
        id: 'STOCKOUT_YET_CONFIRM',
        module: 'CONFIRMED HAND OVER',
        moduleColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        name: 'STOCKOUT YET CONFIRM',
        Icon: PackageCheck,
        iconColor: 'text-amber-600',
        icon: '📦',
        targetMorning: sT.morning,
        targetEvening: sT.evening,
        remain: sRemain,
        result: sResult,
        ratio: sRatio.toFixed(1) + '%',
        ratioVal: sRatio,
        inSystem: sInSystem,
      },
      {
        id: 'NO_CREATE_HAND_OVER',
        module: 'CONFIRMED HAND OVER',
        moduleColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        name: 'NOT CREATE HAND OVER',
        Icon: FileEdit,
        iconColor: 'text-sky-600',
        icon: '📝',
        targetMorning: ncT.morning,
        targetEvening: ncT.evening,
        remain: ncRemain,
        result: ncResult,
        ratio: ncRatio.toFixed(1) + '%',
        ratioVal: ncRatio,
        inSystem: ncInSystem,
      },
      {
        id: 'STOCK_OUT_NOTE_CONFIRMED',
        module: 'CONFIRMED HAND OVER',
        moduleColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        name: 'HAND OVER YET CONFIRM',
        Icon: Clock,
        iconColor: 'text-rose-600',
        icon: '⚠️',
        targetMorning: ncfT.morning,
        targetEvening: ncfT.evening,
        remain: ncfRemain,
        result: ncfResult,
        ratio: ncfRatio.toFixed(1) + '%',
        ratioVal: ncfRatio,
        inSystem: ncfInSystem,
      },
      {
        id: 'NEW_CONSTRUCTION',
        module: 'CONFIRMED HAND OVER',
        moduleColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        name: 'NEW CONSTRUCTION',
        Icon: HardHat,
        iconColor: 'text-emerald-600',
        icon: '🏗️',
        targetMorning: cT.morning,
        targetEvening: cT.evening,
        remain: cRemain,
        result: cResult,
        ratio: cRatio.toFixed(1) + '%',
        ratioVal: cRatio,
        inSystem: cInSystem,
      },
      {
        id: 'STOCK_OUT_IS_SIGNING',
        module: 'SIGNED "CA" SYSTEM',
        moduleColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        name: 'STOCK OUT IS SIGNING',
        Icon: Upload,
        iconColor: 'text-indigo-600',
        icon: '📤',
        targetMorning: expT.morning,
        targetEvening: expT.evening,
        remain: expRemain,
        result: expResult,
        ratio: expRatio.toFixed(1) + '%',
        ratioVal: expRatio,
        inSystem: expInSystem,
      },
      {
        id: 'STOCK_IN_IS_SIGNING',
        module: 'SIGNED "CA" SYSTEM',
        moduleColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        name: 'STOCK IN IS SIGNING',
        Icon: Download,
        iconColor: 'text-emerald-600',
        icon: '📥',
        targetMorning: impT.morning,
        targetEvening: impT.evening,
        remain: impRemain,
        result: impResult,
        ratio: impRatio.toFixed(1) + '%',
        ratioVal: impRatio,
        inSystem: impInSystem,
      },
      {
        id: 'RESTOCK_IN',
        module: 'RESTOCK IN / OUT',
        moduleColor: 'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-800',
        name: 'RESTOCK IN',
        Icon: ArrowDownToLine,
        iconColor: 'text-emerald-600',
        icon: '📥',
        targetMorning: rInT.morning,
        targetEvening: rInT.evening,
        remain: rInRemain,
        result: rInResult,
        ratio: rInRatio.toFixed(1) + '%',
        ratioVal: rInRatio,
        inSystem: rInInSystem,
      },
      {
        id: 'RESTOCK_OUT',
        module: 'RESTOCK IN / OUT',
        moduleColor: 'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-800',
        name: 'RESTOCK OUT',
        Icon: ArrowUpFromLine,
        iconColor: 'text-rose-600',
        icon: '📤',
        targetMorning: rOutT.morning,
        targetEvening: rOutT.evening,
        remain: rOutRemain,
        result: rOutResult,
        ratio: rOutRatio.toFixed(1) + '%',
        ratioVal: rOutRatio,
        inSystem: rOutInSystem,
      },
      {
        id: 'METFONE_STOCKOUT_YET_CONFIRM',
        module: 'SYSTEM METFONE NET',
        moduleColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        name: '01_STOCKOUT_YET CONFIRM',
        Icon: PackageCheck,
        iconColor: 'text-blue-600',
        icon: '📦',
        targetMorning: m1T.morning,
        targetEvening: m1T.evening,
        remain: m1Remain,
        result: m1Result,
        ratio: m1Ratio.toFixed(1) + '%',
        ratioVal: m1Ratio,
        inSystem: m1InSystem,
      },
      {
        id: 'METFONE_NOT_CREATE_HAND_OVER',
        module: 'SYSTEM METFONE NET',
        moduleColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        name: '02_NOT CREATE HAND OVER',
        Icon: FileEdit,
        iconColor: 'text-cyan-600',
        icon: '📝',
        targetMorning: m2T.morning,
        targetEvening: m2T.evening,
        remain: m2Remain,
        result: m2Result,
        ratio: m2Ratio.toFixed(1) + '%',
        ratioVal: m2Ratio,
        inSystem: m2InSystem,
      },
      {
        id: 'METFONE_HAND_OVER_YET_CONFIRM',
        module: 'SYSTEM METFONE NET',
        moduleColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        name: '03_HAND OVER_YET CONFIRM',
        Icon: Clock,
        iconColor: 'text-indigo-600',
        icon: '⚠️',
        targetMorning: m3T.morning,
        targetEvening: m3T.evening,
        remain: m3Remain,
        result: m3Result,
        ratio: m3Ratio.toFixed(1) + '%',
        ratioVal: m3Ratio,
        inSystem: m3InSystem,
      },
    ];
  };

  // ─── DASHBOARD KPI TASKS LIST (COMPANY-WIDE OVERALL) ───
  const kpiTasksList = useMemo(() => {
    return computeKpiTasksForUnit('ALL');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, syncVersion]);

  // ─── TELEGRAM KPI TASKS (UNIT OR OVERALL) ───
  const telegramKpiTasks = useMemo(() => {
    return computeKpiTasksForUnit(telegramScope === 'unit' ? telegramUnit : 'ALL');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramScope, telegramUnit, currentTime, syncVersion]);

  // Totals specifically for Telegram report
  const telegramKpiTotals = useMemo(() => {
    let targetMorning = 0;
    let targetEvening = 0;
    let remain = 0;
    let result = 0;
    let inSystem = 0;
    telegramKpiTasks.forEach(t => {
      targetMorning += t.targetMorning;
      targetEvening += t.targetEvening;
      remain += t.remain;
      result += t.result;
      inSystem += t.inSystem;
    });
    const effectiveTarget = (currentTime.getHours() < 12) ? targetMorning : (targetEvening > 0 ? targetEvening : targetMorning);
    const ratio = effectiveTarget > 0 
      ? ((result / effectiveTarget) * 100).toFixed(1) + '%' 
      : (inSystem > 0 ? ((result / inSystem) * 100).toFixed(1) + '%' : '0.0%');
    return { targetMorning, targetEvening, remain, result, inSystem, ratio };
  }, [telegramKpiTasks, currentTime]);

  // ─── SEND KPI REPORT IMAGE TO TELEGRAM BOT ───
  const sendKpiImageToTelegram = async (unitToTarget) => {
    const targetUnit = unitToTarget || telegramUnit;
    if (!hasGroupId(targetUnit)) {
      alert(`⚠️ មិនទាន់មាន Group ID សម្រាប់ Unit ${targetUnit} នៅឡើយទេ។ សូមពិនិត្យមើល src/services/telegramBot.js`);
      return;
    }

    setIsSendingTelegram(true);
    setTelegramStatusMessage(`📸 កំពុង Capture រូបភាពតារាង KPI សម្រាប់ Unit ${targetUnit}...`);
    setTelegramSendSuccess(null);

    abortControllerRef.current = new AbortController();

    try {
      // Small pause to ensure DOM update
      await new Promise(r => setTimeout(r, 100));

      const element = document.getElementById('telegram-kpi-11tasks-report');
      if (!element) {
        throw new Error('រកមិនឃើញផ្ទាំង Telegram Report Template ឡើយ');
      }

      const canvas = await html2canvas(element, {
        width: 1050,
        windowWidth: 1050,
        scale: 3.0,
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc',
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          const clonedEl = clonedDoc.getElementById('telegram-kpi-11tasks-report');
          if (clonedEl) {
            clonedEl.style.position = 'static';
            clonedEl.style.left = '0';
            clonedEl.style.top = '0';
            clonedEl.style.width = '1050px';
          }
        }
      });

      setTelegramStatusMessage(`🚀 កំពុង Upload រូបភាពច្បាស់ (PNG High-Res) ទៅកាន់ Telegram ក្រុម ${targetUnit}...`);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas to Blob failed')), 'image/png');
      });

      const caption = telegramNote.trim() ? `📝 ${telegramNote.trim()}` : '';

      const res = await sendPhotoToTelegram(targetUnit, blob, caption, abortControllerRef.current.signal);
      if (res && res.success) {
        setTelegramSendSuccess(`✅ បានផ្ញើរូបភាព KPI 11 Tasks ទៅកាន់ Telegram (${targetUnit}) ដោយជោគជ័យ!`);
        setTelegramStatusMessage('');
      } else {
        throw new Error(res?.error || 'Failed to send photo to Telegram');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        alert(`❌ បរាជ័យក្នុងការផ្ញើទៅ Telegram: ${err.message}`);
        setTelegramStatusMessage('');
      }
    } finally {
      setIsSendingTelegram(false);
    }
  };

  // Send to all configured units
  const sendKpiImageToAllUnits = async () => {
    const configured = getConfiguredUnits ? getConfiguredUnits() : [];
    if (configured.length === 0) {
      alert('⚠️ មិនមាន Unit ណាដែលមាន Group ID ឡើយ។');
      return;
    }
    if (!window.confirm(`តើអ្នកពិតជាចង់ផ្ញើរូបភាពតារាង KPI ទៅកាន់គ្រប់ ${configured.length} Units (${configured.join(', ')}) មែនទេ?`)) {
      return;
    }

    setIsSendingTelegram(true);
    setTelegramSendSuccess(null);
    abortControllerRef.current = new AbortController();

    let successCount = 0;
    for (let i = 0; i < configured.length; i++) {
      const u = configured[i];
      if (abortControllerRef.current.signal.aborted) break;
      setTelegramUnit(u);
      setTelegramStatusMessage(`[${i + 1}/${configured.length}] កំពុងផ្ញើទៅ Unit ${u}...`);
      try {
        await new Promise(r => setTimeout(r, 120));
        const element = document.getElementById('telegram-kpi-11tasks-report');
        if (!element) continue;
        const canvas = await html2canvas(element, {
          width: 1050,
          windowWidth: 1050,
          scale: 3.0,
          useCORS: true,
          logging: false,
          backgroundColor: '#f8fafc',
          onclone: (clonedDoc) => {
            const clonedEl = clonedDoc.getElementById('telegram-kpi-11tasks-report');
            if (clonedEl) {
              clonedEl.style.position = 'static';
              clonedEl.style.left = '0';
              clonedEl.style.top = '0';
              clonedEl.style.width = '1050px';
            }
          }
        });
        const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
        const caption = telegramNote.trim() ? `📝 ${telegramNote.trim()}` : '';

        const r = await sendPhotoToTelegram(u, blob, caption, abortControllerRef.current.signal);
        if (r && r.success) successCount++;
      } catch (e) {
        console.error(`Error sending to ${u}:`, e);
      }
    }

    setIsSendingTelegram(false);
    setTelegramStatusMessage('');
    setTelegramSendSuccess(`🎉 បានផ្ញើរូបភាព KPI ទៅកាន់ ${successCount}/${configured.length} Units ដោយជោគជ័យ!`);
  };

  // Totals for the table
  const kpiTotals = useMemo(() => {
    let targetMorning = 0;
    let targetEvening = 0;
    let remain = 0;
    let result = 0;
    let inSystem = 0;
    kpiTasksList.forEach(t => {
      targetMorning += t.targetMorning;
      targetEvening += t.targetEvening;
      remain += t.remain;
      result += t.result;
      inSystem += t.inSystem;
    });
    const effectiveTarget = (currentTime.getHours() < 12) ? targetMorning : (targetEvening > 0 ? targetEvening : targetMorning);
    const ratio = effectiveTarget > 0 
      ? ((result / effectiveTarget) * 100).toFixed(1) + '%' 
      : (inSystem > 0 ? ((result / inSystem) * 100).toFixed(1) + '%' : '0.0%');
    return { targetMorning, targetEvening, remain, result, inSystem, ratio };
  }, [kpiTasksList, currentTime]);

  // Filtered tasks based on category and search query
  const filteredKpiTasks = useMemo(() => {
    return kpiTasksList.filter(task => {
      const matchCategory = selectedCategory === 'ALL' || task.module.toUpperCase() === selectedCategory.toUpperCase();
      const matchSearch = !searchQuery.trim() || 
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        task.module.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [kpiTasksList, selectedCategory, searchQuery]);

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <div className="w-full px-4 sm:px-6 py-6 sm:py-8 bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
        
        {/* ─── ENTERPRISE PORTAL HEADER ─── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 p-5 sm:p-6 mb-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <span>Enterprise Portal</span>
                <span className="text-slate-300 dark:text-slate-600">/</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">GIS Asset Management</span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {currentTime.toLocaleTimeString()}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 shrink-0">
                  <LayoutDashboard className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    GIS Asset Management Portal
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    ផ្ទាំងគ្រប់គ្រងទិន្នន័យប្រតិបត្តិការទ្រព្យសកម្ម និងប្រព័ន្ធតាមដាន KPI Performance
                  </p>
                </div>
              </div>
            </div>

            {/* Right Action: View Mode Toggle & Live Pill */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-900/70 rounded-xl border border-slate-200/80 dark:border-slate-700">
                <button
                  onClick={() => setViewMode('modules')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                    viewMode === 'modules'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>4 Modules Overview</span>
                </button>
                <button
                  onClick={() => setViewMode('kpi')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                    viewMode === 'kpi'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-black'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <TableProperties className="w-3.5 h-3.5" />
                  <span>តារាងប្រតិបត្តិការ KPI (11 Tasks)</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                    viewMode === 'kpi' 
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300' 
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    11
                  </span>
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[11px]">System Live</span>
              </div>
            </div>
          </div>
        </div>

        {viewMode === 'modules' && (
          <>
            {/* ─── ENTERPRISE KPI METRIC CARDS ─── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {/* Total Records */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Total Records</span>
                  <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    <Layers className="w-4 h-4" />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-mono font-black text-slate-900 dark:text-white tracking-tight">
                    {totalRecords.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">All Systems</span>
                </div>
              </div>

              {/* Completed */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Completed Tasks</span>
                  <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-mono font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                    {totalCompleted.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/40">
                    Resolved
                  </span>
                </div>
              </div>

              {/* Pending */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Pending Action</span>
                  <span className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                    <Clock className="w-4 h-4" />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-mono font-black text-amber-600 dark:text-amber-400 tracking-tight">
                    {totalPending.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-md border border-amber-200/50 dark:border-amber-800/40">
                    In Progress
                  </span>
                </div>
              </div>

              {/* Avg Completion */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200/80 dark:border-slate-700 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Average Rate</span>
                  <span className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                    <TrendingUp className="w-4 h-4" />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl sm:text-3xl font-mono font-black text-purple-600 dark:text-purple-400 tracking-tight">
                    {avgCompletion.toFixed(1)}%
                  </span>
                  <div className="w-20 bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-purple-600 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, Math.max(0, avgCompletion))}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ─── 4 CORE MODULES GRID ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {modules.map((mod) => (
                <div 
                  key={mod.id} 
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 flex flex-col justify-between overflow-hidden group"
                >
                  {/* Subtle top indicator bar */}
                  <div className={`h-1 w-full ${mod.topBarColor}`} />

                  {/* Card Header */}
                  <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-700/60">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className={`p-2 rounded-xl flex items-center justify-center shrink-0 ${mod.iconContainer}`}>
                        {mod.Icon ? <mod.Icon className="w-5 h-5" /> : <LayoutDashboard className="w-5 h-5" />}
                      </div>
                      <button
                        onClick={() => onNavigate(mod.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer group/link shadow-xs"
                      >
                        <span>Dashboard</span>
                        <ArrowUpRight className="w-3 h-3 text-slate-400 group-hover/link:text-slate-700 dark:group-hover/link:text-white group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
                      </button>
                    </div>
                    
                    <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight truncate" title={mod.title}>
                      {mod.title}
                    </h2>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5 truncate" title={mod.subtitle}>
                      {mod.subtitle}
                    </p>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      {/* Stats 2x2 Grid */}
                      <div className="grid grid-cols-2 gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800/80">
                        {mod.stats.map((s, idx) => (
                          <div key={idx} className="flex flex-col min-w-0">
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider truncate">
                              {s.label}
                            </span>
                            <span className={`text-xs sm:text-sm font-mono font-bold truncate ${s.color}`}>
                              {s.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sub-Components Link Section */}
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Layers className="w-3 h-3 text-slate-400" />
                        <span>Sub Modules</span>
                      </div>
                      <div className="space-y-1.5">
                        {mod.subtasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={() => onNavigate(task.id)}
                            className="w-full flex items-center justify-between p-2 rounded-lg border border-slate-100 dark:border-slate-700/80 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 hover:border-slate-200 dark:hover:border-slate-600 transition-all text-left text-xs font-bold text-slate-700 dark:text-slate-200 group/btn cursor-pointer shadow-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {task.Icon ? (
                                <span className={`p-1 rounded-md bg-slate-100 dark:bg-slate-700 ${task.iconColor} group-hover/btn:scale-105 transition-transform shrink-0 flex items-center justify-center`}>
                                  <task.Icon className="w-3.5 h-3.5" />
                                </span>
                              ) : null}
                              <span className="truncate text-[11px]">{task.label}</span>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover/btn:translate-x-0.5 group-hover/btn:text-slate-700 dark:group-hover/btn:text-white transition-all shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {viewMode === 'kpi' && (
          <div className="mt-2">
            {/* Top Back Navigation Bar */}
            <div className="flex items-center justify-between mb-6 bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex-wrap gap-2.5">
              <button
                onClick={() => setViewMode('modules')}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all cursor-pointer shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>ត្រឡប់ទៅកាន់ 4 Modules Overview</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    setIsTelegramModalOpen(true);
                    setTelegramSendSuccess(null);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
                  title="ផ្ញើរូបភាពតារាង KPI 11 Tasks ទៅ Telegram Bot តាម Unit"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>ផ្ញើទៅ Telegram Bot (តាម Unit)</span>
                  <span className="bg-white/20 text-white text-[9px] px-2 py-0.5 rounded-full font-bold">High-Res</span>
                </button>

                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800">
                  <Activity className="w-3.5 h-3.5 text-indigo-600" />
                  <span>11 Tasks Performance</span>
                </span>
              </div>
            </div>

            {/* ─── OVERALL KPI SUMMARY & PERFORMANCE TABLE BY TASK ─── */}
            <div className="mt-4">
              
              {/* Header & Filters */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <TableProperties className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                      តារាងសង្ខេបប្រតិបត្តិការ KPI (Performance by Module / Task)
                    </h3>
                    <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800">
                      {filteredKpiTasks.length} Tasks
                    </span>
                    <button
                      onClick={() => {
                        setIsTelegramModalOpen(true);
                        setTelegramSendSuccess(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-[11px] shadow-xs active:scale-[0.98] transition-all cursor-pointer ml-1"
                    >
                      <Camera className="w-3 h-3" />
                      <span>ផ្ញើរូបភាព Telegram តាម Unit</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                    តាមដានទិន្នន័យជាក់ស្តែង Target, Result, Remain, Ratio និង In System ពីគ្រប់ម៉ូឌុលទាំងអស់ (ចុចលើ Task ដើម្បីចូលទំព័រផ្ទាល់)
                  </p>
                </div>

                {/* Actions: Search & Filter Tabs */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="ស្វែងរក Task..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full sm:w-56 pl-8 pr-7 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 shadow-xs placeholder:text-slate-400"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 p-0.5 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                    {[
                      { key: 'ALL', label: 'ទាំងអស់', Icon: Sparkles },
                      { key: 'CONFIRMED HAND OVER', label: 'Confirmed', Icon: ClipboardCheck },
                      { key: 'SIGNED "CA" SYSTEM', label: 'Signed CA', Icon: FileSignature },
                      { key: 'RESTOCK IN / OUT', label: 'Restock', Icon: ArrowLeftRight },
                      { key: 'SYSTEM METFONE NET', label: 'Metfone NET', Icon: Radio },
                    ].map(cat => (
                      <button
                        key={cat.key}
                        onClick={() => setSelectedCategory(cat.key)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                          selectedCategory === cat.key
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                        }`}
                      >
                        <cat.Icon className="w-3 h-3" />
                        <span>{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 6 Metric Cards (Modern Minimalist Developer Design) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {/* Target Morning */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 sm:p-4 border border-slate-200/90 dark:border-slate-700 shadow-xs hover:border-blue-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                      Target ព្រឹក
                    </span>
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <div className="text-xl sm:text-2xl font-mono font-black text-slate-900 dark:text-white mt-2">
                    {kpiTotals.targetMorning.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-400 font-medium mt-0.5">Morning Target Total</div>
                </div>

                {/* Target Evening */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 sm:p-4 border border-slate-200/90 dark:border-slate-700 shadow-xs hover:border-indigo-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                      Target ល្ងាច
                    </span>
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <div className="text-xl sm:text-2xl font-mono font-black text-slate-900 dark:text-white mt-2">
                    {kpiTotals.targetEvening.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-400 font-medium mt-0.5">Evening Target Total</div>
                </div>

                {/* Remain */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 sm:p-4 border border-slate-200/90 dark:border-slate-700 shadow-xs hover:border-amber-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                      Remain
                    </span>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-xl sm:text-2xl font-mono font-black text-amber-600 dark:text-amber-400 mt-2">
                    {kpiTotals.remain.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-400 font-medium mt-0.5">Total Remaining</div>
                </div>

                {/* Result */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 sm:p-4 border border-slate-200/90 dark:border-slate-700 shadow-xs hover:border-emerald-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      Result
                    </span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="text-xl sm:text-2xl font-mono font-black text-emerald-600 dark:text-emerald-400 mt-2">
                    {kpiTotals.result.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-400 font-medium mt-0.5">Completed Records</div>
                </div>

                {/* Ratio */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 sm:p-4 border border-slate-200/90 dark:border-slate-700 shadow-xs hover:border-purple-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                      Ratio
                    </span>
                    <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
                  </div>
                  <div className="text-xl sm:text-2xl font-mono font-black text-purple-600 dark:text-purple-400 mt-2">
                    {kpiTotals.ratio}
                  </div>
                  <div className="text-[9px] text-slate-400 font-medium mt-0.5">Avg Achievement Rate</div>
                </div>

                {/* In System */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 sm:p-4 border border-slate-200/90 dark:border-slate-700 shadow-xs hover:border-sky-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-extrabold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                      In System
                    </span>
                    <Layers className="w-3.5 h-3.5 text-sky-500" />
                  </div>
                  <div className="text-xl sm:text-2xl font-mono font-black text-sky-600 dark:text-sky-400 mt-2">
                    {kpiTotals.inSystem.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-400 font-medium mt-0.5">Active Total Items</div>
                </div>
              </div>

              {/* KPI Performance Table */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-6">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-left">
                    <thead className="bg-slate-50/90 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="px-4 py-3.5 text-[11px] font-black uppercase tracking-wider">Module / KPI Task</th>
                        <th className="px-4 py-3.5 text-right text-[11px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">Target ព្រឹក</th>
                        <th className="px-4 py-3.5 text-right text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">Target ល្ងាច</th>
                        <th className="px-4 py-3.5 text-right text-[11px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">Remain</th>
                        <th className="px-4 py-3.5 text-right text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Result</th>
                        <th className="px-4 py-3.5 text-right text-[11px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-400">Ratio</th>
                        <th className="px-4 py-3.5 text-right text-[11px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-400">In System</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs text-slate-700 dark:text-slate-300">
                      {filteredKpiTasks.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                            ពុំមានទិន្នន័យត្រូវគ្នានឹងការស្វែងរកឡើយ
                          </td>
                        </tr>
                      ) : (
                        filteredKpiTasks.map((item) => (
                          <tr
                            key={item.id}
                            onClick={() => onNavigate && onNavigate(item.id)}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 cursor-pointer transition-colors group"
                          >
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                              <div className="flex items-center gap-2.5">
                                <span className={`p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 ${item.iconColor} group-hover:scale-105 transition-transform flex items-center justify-center`}>
                                  {item.Icon ? <item.Icon className="w-4 h-4" /> : <PackageCheck className="w-4 h-4" />}
                                </span>
                                <span className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                                  {item.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-blue-700 dark:text-blue-400">
                              {item.targetMorning.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700 dark:text-indigo-400">
                              {item.targetEvening.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-flex px-2 py-0.5 rounded-md font-mono font-bold text-[11px] ${
                                item.remain > 0 
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200/60' 
                                  : 'bg-slate-50 text-slate-500 dark:bg-slate-700 dark:text-slate-400 border border-slate-200'
                              }`}>
                                {item.remain.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="inline-flex px-2 py-0.5 rounded-md font-mono font-bold text-[11px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200/60">
                                {item.result.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex flex-col items-end gap-1">
                                <span className="font-mono font-black text-purple-700 dark:text-purple-400 text-xs">
                                  {item.ratio}
                                </span>
                                <div className="w-16 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                                  <div 
                                    className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full"
                                    style={{ width: `${Math.min(100, item.ratioVal || 0)}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="inline-flex px-2 py-0.5 rounded-md font-mono font-bold text-[11px] bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border border-sky-200/60">
                                {item.inSystem.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {/* Total Summary Footer Row */}
                    <tfoot className="bg-slate-100/90 dark:bg-slate-900/90 border-t-2 border-slate-300 dark:border-slate-600 text-xs font-black text-slate-900 dark:text-white">
                      <tr>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-indigo-600" />
                            <span>សរុប (TOTAL - {filteredKpiTasks.length} TASKS)</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-blue-700 dark:text-blue-400 text-sm">
                          {filteredKpiTasks.reduce((s, i) => s + i.targetMorning, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-indigo-700 dark:text-indigo-400 text-sm">
                          {filteredKpiTasks.reduce((s, i) => s + i.targetEvening, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-amber-700 dark:text-amber-400 text-sm">
                          {filteredKpiTasks.reduce((s, i) => s + i.remain, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-emerald-700 dark:text-emerald-400 text-sm">
                          {filteredKpiTasks.reduce((s, i) => s + i.result, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-purple-700 dark:text-purple-400 text-sm">
                          {(() => {
                            const totalMorning = filteredKpiTasks.reduce((s, i) => s + i.targetMorning, 0);
                            const totalEvening = filteredKpiTasks.reduce((s, i) => s + i.targetEvening, 0);
                            const totalResult = filteredKpiTasks.reduce((s, i) => s + i.result, 0);
                            const totalInSystem = filteredKpiTasks.reduce((s, i) => s + i.inSystem, 0);
                            const effective = (currentTime.getHours() < 12) ? totalMorning : (totalEvening > 0 ? totalEvening : totalMorning);
                            return effective > 0 ? ((totalResult / effective) * 100).toFixed(1) + '%' : (totalInSystem > 0 ? ((totalResult / totalInSystem) * 100).toFixed(1) + '%' : '0.0%');
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-sky-700 dark:text-sky-400 text-sm">
                          {filteredKpiTasks.reduce((s, i) => s + i.inSystem, 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── RECENT ACTIVITIES ─── */}
        {recentActivities.length > 0 && (
          <div className="mt-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-4 sm:p-6">
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-indigo-600" />
              <span>Recent Activities</span>
            </h3>
            <div className="space-y-2">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-3 bg-slate-50/80 dark:bg-slate-700/40 rounded-xl border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="p-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{activity.description}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">{activity.unit}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{activity.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── FOOTER ─── */}
        <div className="mt-8 sm:mt-12 text-center text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 border-t pt-4 sm:pt-6 border-slate-200 dark:border-slate-700">
          <span>© 2026 GIS Asset Management System</span>
          <span className="mx-2 sm:mx-3">•</span>
          <span>Version 3.0.1</span>
          <span className="mx-2 sm:mx-3">•</span>
          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>All systems operational</span>
          </span>
        </div>

        {/* ─── TELEGRAM BOT SEND MODAL (BY UNIT) ─── */}
        {isTelegramModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-5 sm:px-6 py-4 text-white flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black tracking-tight">
                      ផ្ញើរូបភាពតារាង KPI (11 Tasks) ទៅ Telegram Bot
                    </h3>
                    <p className="text-xs text-slate-300 font-medium">
                      ជ្រើសរើស Unit ដើម្បី Capture រូបភាពតារាង KPI និងផ្ញើចូល Telegram Group ស្វ័យប្រវត្តិ
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (isSendingTelegram && abortControllerRef.current) {
                      abortControllerRef.current.abort();
                    }
                    setIsTelegramModalOpen(false);
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all cursor-pointer flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
                {/* 1. Scope Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                    1. ជ្រើសរើសទម្រង់ទិន្នន័យ (Data Scope):
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setTelegramScope('unit')}
                      className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 cursor-pointer ${
                        telegramScope === 'unit'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 font-black'
                          : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                      }`}
                    >
                      <Building2 className="w-4 h-4" />
                      <span>តារាងតាម Unit ({telegramUnit})</span>
                    </button>
                    <button
                      onClick={() => setTelegramScope('all')}
                      className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 cursor-pointer ${
                        telegramScope === 'all'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 font-black'
                          : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                      }`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                      <span>តារាងសរុប 11 Tasks (Overall)</span>
                    </button>
                  </div>
                </div>

                {/* 2. Unit Selector Grid */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      2. ជ្រើសរើស Unit / Province គោលដៅ:
                    </label>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Unit ដែលបានរើស: <strong className="text-blue-600 dark:text-blue-400 font-black">{telegramUnit}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-1.5 max-h-40 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                    {allUnits.map((u) => {
                      const configured = hasGroupId(u);
                      const isSelected = telegramUnit === u;
                      return (
                        <button
                          key={u}
                          onClick={() => setTelegramUnit(u)}
                          className={`px-2 py-2 rounded-xl text-xs font-bold transition-all relative flex flex-col items-center justify-center gap-0.5 cursor-pointer border ${
                            isSelected
                              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500 shadow-md scale-105 z-10'
                              : configured
                              ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                              : 'bg-slate-100 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 border-dashed border-slate-200 dark:border-slate-700 hover:bg-slate-200/50'
                          }`}
                        >
                          <span>{u}</span>
                          {configured && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1 px-1">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                      <span>មាន Group ID អាចផ្ញើបានភ្លាមៗ</span>
                    </span>
                    <span>{hasGroupId(telegramUnit) ? `✅ ${telegramUnit} រួចរាល់` : `⚠️ ${telegramUnit} មិនទាន់មាន Group ID`}</span>
                  </div>
                </div>

                {/* 3. Note / Comment */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                    3. ចំណាំបន្ថែមលើ Caption & រូបភាព (Optional Note):
                  </label>
                  <input
                    type="text"
                    placeholder="ឧទាហរណ៍៖ សូមក្រុមការងារជួយពន្លឿនការងារ KPI ប្រចាំថ្ងៃ..."
                    value={telegramNote}
                    onChange={(e) => setTelegramNote(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                  />
                </div>

                {/* Live Preview Metric Summary */}
                <div className="p-3.5 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 rounded-2xl text-white border border-slate-800 shadow-inner">
                  <div className="flex items-center justify-between text-xs font-bold mb-2">
                    <span className="flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Preview ទិន្នន័យលើរូបភាព ({telegramScope === 'unit' ? `Unit ${telegramUnit}` : 'Overall'})</span>
                    </span>
                    <span className="bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      11 Tasks
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
                    <div className="bg-white/10 rounded-xl p-1.5">
                      <div className="text-[9px] text-indigo-200">Target ព្រឹក</div>
                      <div className="text-sm font-black text-white mt-0.5">{telegramKpiTotals.targetMorning}</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-1.5">
                      <div className="text-[9px] text-indigo-200">Target ល្ងាច</div>
                      <div className="text-sm font-black text-white mt-0.5">{telegramKpiTotals.targetEvening}</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-1.5">
                      <div className="text-[9px] text-amber-200">Remain</div>
                      <div className="text-sm font-black text-amber-300 mt-0.5">{telegramKpiTotals.remain}</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-1.5">
                      <div className="text-[9px] text-emerald-200">Result</div>
                      <div className="text-sm font-black text-emerald-300 mt-0.5">{telegramKpiTotals.result}</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-1.5">
                      <div className="text-[9px] text-purple-200">Ratio</div>
                      <div className="text-sm font-black text-purple-300 mt-0.5">{telegramKpiTotals.ratio}</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-1.5">
                      <div className="text-[9px] text-blue-200">In System</div>
                      <div className="text-sm font-black text-blue-300 mt-0.5">{telegramKpiTotals.inSystem}</div>
                    </div>
                  </div>
                </div>

                {/* Status messages */}
                {telegramStatusMessage && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center gap-2 animate-pulse">
                    <span className="text-base">⏳</span>
                    <span>{telegramStatusMessage}</span>
                  </div>
                )}

                {telegramSendSuccess && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span>{telegramSendSuccess}</span>
                    </span>
                    <button onClick={() => setTelegramSendSuccess(null)} className="text-xs font-bold text-emerald-800 dark:text-emerald-200 hover:underline">✕</button>
                  </div>
                )}
              </div>

              {/* Modal Footer / Actions */}
              <div className="px-5 sm:px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  onClick={() => sendKpiImageToAllUnits()}
                  disabled={isSendingTelegram}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>🌐</span>
                  <span>ផ្ញើទៅគ្រប់ Unit (All Configured)</span>
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => setIsTelegramModalOpen(false)}
                    disabled={isSendingTelegram}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all cursor-pointer"
                  >
                    បោះបង់
                  </button>
                  <button
                    onClick={() => sendKpiImageToTelegram(telegramUnit)}
                    disabled={isSendingTelegram}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-xs font-black shadow-lg shadow-indigo-500/25 transition-all transform hover:scale-105 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSendingTelegram ? (
                      <>
                        <span className="animate-spin text-sm">⏳</span>
                        <span>កំពុងផ្ញើ...</span>
                      </>
                    ) : (
                      <>
                        <span>🚀</span>
                        <span>ផ្ញើរូបភាពទៅ Telegram ({telegramUnit})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── OFFSCREEN TELEGRAM KPI REPORT TEMPLATE FOR HIGH-RES SCREENSHOT ─── */}
        <div
          id="telegram-kpi-11tasks-report"
          style={{
            position: 'absolute',
            left: '-9999px',
            top: '0',
            width: '1050px',
            zIndex: -9999,
            pointerEvents: 'none',
            background: '#f1f5f9',
            padding: '24px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Khmer OS", "Khmer OS Battambang", "Noto Sans Khmer", sans-serif'
          }}
        >

          {/* Metric Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: '#2563eb', borderRadius: '12px', padding: '12px 14px', color: '#ffffff', boxShadow: '0 2px 4px rgba(37,99,235,0.2)' }}>
              <div style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target ព្រឹក</div>
              <div style={{ fontSize: '26px', fontWeight: '900', marginTop: '4px', lineHeight: '1' }}>{telegramKpiTotals.targetMorning}</div>
              <div style={{ fontSize: '10.5px', fontWeight: '700', opacity: 0.9, marginTop: '4px' }}>Morning Target</div>
            </div>
            <div style={{ background: '#4f46e5', borderRadius: '12px', padding: '12px 14px', color: '#ffffff', boxShadow: '0 2px 4px rgba(79,70,229,0.2)' }}>
              <div style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target ល្ងាច</div>
              <div style={{ fontSize: '26px', fontWeight: '900', marginTop: '4px', lineHeight: '1' }}>{telegramKpiTotals.targetEvening}</div>
              <div style={{ fontSize: '10.5px', fontWeight: '700', opacity: 0.9, marginTop: '4px' }}>Evening Target</div>
            </div>
            <div style={{ background: '#d97706', borderRadius: '12px', padding: '12px 14px', color: '#ffffff', boxShadow: '0 2px 4px rgba(217,119,6,0.2)' }}>
              <div style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Remain</div>
              <div style={{ fontSize: '26px', fontWeight: '900', marginTop: '4px', lineHeight: '1' }}>{telegramKpiTotals.remain}</div>
              <div style={{ fontSize: '10.5px', fontWeight: '700', opacity: 0.9, marginTop: '4px' }}>Remaining Tasks</div>
            </div>
            <div style={{ background: '#059669', borderRadius: '12px', padding: '12px 14px', color: '#ffffff', boxShadow: '0 2px 4px rgba(5,150,105,0.2)' }}>
              <div style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Result</div>
              <div style={{ fontSize: '26px', fontWeight: '900', marginTop: '4px', lineHeight: '1' }}>{telegramKpiTotals.result}</div>
              <div style={{ fontSize: '10.5px', fontWeight: '700', opacity: 0.9, marginTop: '4px' }}>Completed Result</div>
            </div>
            <div style={{ background: '#7c3aed', borderRadius: '12px', padding: '12px 14px', color: '#ffffff', boxShadow: '0 2px 4px rgba(124,58,237,0.2)' }}>
              <div style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ratio</div>
              <div style={{ fontSize: '26px', fontWeight: '900', marginTop: '4px', lineHeight: '1' }}>{telegramKpiTotals.ratio}</div>
              <div style={{ fontSize: '10.5px', fontWeight: '700', opacity: 0.9, marginTop: '4px' }}>Completion Rate</div>
            </div>
            <div style={{ background: '#0284c7', borderRadius: '12px', padding: '12px 14px', color: '#ffffff', boxShadow: '0 2px 4px rgba(2,132,199,0.2)' }}>
              <div style={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>In System</div>
              <div style={{ fontSize: '26px', fontWeight: '900', marginTop: '4px', lineHeight: '1' }}>{telegramKpiTotals.inSystem}</div>
              <div style={{ fontSize: '10.5px', fontWeight: '700', opacity: 0.9, marginTop: '4px' }}>Total In System</div>
            </div>
          </div>

          {/* Table */}
          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1.5px solid #cbd5e1', overflow: 'hidden', marginBottom: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                  <th style={{ padding: '11px 12px', width: '48px', textAlign: 'center', fontSize: '13px', fontWeight: '900', borderBottom: '2px solid #0f172a' }}>#</th>
                  <th style={{ padding: '11px 14px', fontSize: '13px', fontWeight: '900', borderBottom: '2px solid #0f172a' }}>Module / KPI Task</th>
                  <th style={{ padding: '11px 12px', textAlign: 'center', fontSize: '13px', fontWeight: '900', borderBottom: '2px solid #0f172a' }}>Target ព្រឹក</th>
                  <th style={{ padding: '11px 12px', textAlign: 'center', fontSize: '13px', fontWeight: '900', borderBottom: '2px solid #0f172a' }}>Target ល្ងាច</th>
                  <th style={{ padding: '11px 12px', textAlign: 'center', fontSize: '13px', fontWeight: '900', borderBottom: '2px solid #0f172a' }}>Remain</th>
                  <th style={{ padding: '11px 12px', textAlign: 'center', fontSize: '13px', fontWeight: '900', borderBottom: '2px solid #0f172a' }}>Result</th>
                  <th style={{ padding: '11px 12px', textAlign: 'center', fontSize: '13px', fontWeight: '900', borderBottom: '2px solid #0f172a' }}>Ratio</th>
                  <th style={{ padding: '11px 12px', textAlign: 'center', fontSize: '13px', fontWeight: '900', borderBottom: '2px solid #0f172a' }}>In System</th>
                </tr>
              </thead>
              <tbody>
                {telegramKpiTasks.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{
                      background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      borderBottom: '1px solid #e2e8f0'
                    }}
                  >
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#475569', fontWeight: '900', fontSize: '13px', borderRight: '1px solid #f1f5f9' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '10px 14px', borderRight: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '18px' }}>{item.icon}</span>
                        <span style={{ fontWeight: '900', color: '#0f172a', fontSize: '13.5px' }}>{item.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '800', color: '#0f172a', fontSize: '13.5px', borderRight: '1px solid #f1f5f9' }}>
                      {item.targetMorning}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '800', color: '#0f172a', fontSize: '13.5px', borderRight: '1px solid #f1f5f9' }}>
                      {item.targetEvening}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '900', color: '#b45309', fontSize: '14px', borderRight: '1px solid #f1f5f9' }}>
                      {item.remain}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '900', color: '#047857', fontSize: '14px', borderRight: '1px solid #f1f5f9' }}>
                      {item.result}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '900',
                        color: '#ffffff',
                        background: item.ratioVal >= 80 ? '#059669' : item.ratioVal >= 50 ? '#d97706' : '#e11d48'
                      }}>
                        {item.ratio}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '900', color: '#0f172a', fontSize: '14px' }}>
                      {item.inSystem}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                  <td colSpan={2} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '900', fontSize: '13.5px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#fbbf24' }}>
                    សរុបទាំងអស់ (TOTAL):
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: '900', fontSize: '14px', color: '#ffffff' }}>
                    {telegramKpiTotals.targetMorning}
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: '900', fontSize: '14px', color: '#ffffff' }}>
                    {telegramKpiTotals.targetEvening}
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: '900', fontSize: '15px', color: '#fbbf24' }}>
                    {telegramKpiTotals.remain}
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: '900', fontSize: '15px', color: '#34d399' }}>
                    {telegramKpiTotals.result}
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '900',
                      background: '#7c3aed',
                      color: '#ffffff'
                    }}>
                      {telegramKpiTotals.ratio}
                    </span>
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: '900', fontSize: '15px', color: '#ffffff' }}>
                    {telegramKpiTotals.inSystem}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Optional Note */}
          {telegramNote.trim() && (
            <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: '10px', padding: '12px 16px', color: '#92400e', fontSize: '13px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>📝</span>
              <div>
                <strong style={{ display: 'block', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#78350f' }}>ចំណាំបន្ថែម (Note):</strong>
                <p style={{ margin: '4px 0 0 0', color: '#1e293b', fontWeight: '800' }}>{telegramNote.trim()}</p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#475569', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', padding: '0 4px' }}>
            <span>Metfone Telecommunication • GIS Asset Management Portal</span>
            <span>Automated Ultra-Clear KPI Report (11 Tasks)</span>
          </div>
        </div>

        

        {/* ─── STYLES ─── */}
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .bg-white, .relative, .grid > div {
            animation: fadeIn 0.5s ease-out forwards;
          }
          .grid > div:nth-child(2) { animation-delay: 0.1s; }
          .grid > div:nth-child(3) { animation-delay: 0.2s; }
          
          /* Scrollbar styling */
          ::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background: #d1d5db;
            border-radius: 2px;
          }
          .dark ::-webkit-scrollbar-thumb {
            background: #4b5563;
          }
        `}</style>
      </div>
    </div>
  );
};

export default MainDashboard;
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  sendRestockToTelegram, 
  sendToAllRestockTelegram, 
  getAllUnits,
  getConfiguredUnits,
  hasGroupId,
  hasToken,
  getSavedTemplates,
  saveTemplate,
  deleteTemplate,
  sendPhotoToTelegram,
  cleanWarehouseName
} from '../../../services/telegramBot';
import { loadFromDb, saveToDb, completeStore } from '../../../services/dbStore';
import html2canvas from 'html2canvas';
import { createPortal } from 'react-dom';

// Import the same storage keys from your Restock_in component
const STORAGE_KEYS = {
  DATA: 'restock_in_data',
  COMPLETION: 'restock_in_completionHistory',
  TARGETS: 'restock_in_targets',
  TARGET_HISTORY: 'restock_in_targetHistory',
  CONFIRMED: 'restock_in_confirmedStatus',
};

const getStorageData = (key) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
};

const VALID_UNITS = [
  'BAN', 'BAT', 'CHA', 'CHH', 'KAM', 'KAN', 'KANZ1', 'KOH', 'KRA',
  'MON', 'ODD', 'PNP', 'PNPZ1', 'PNPZ2', 'PRE', 'PRH', 'PUR', 'ROT',
  'SIE', 'SIH', 'SPE', 'STU', 'SVA', 'TAK', 'THO'
];

const getUnitFromRequestCode = (importRequestCode) => {
  if (!importRequestCode) return null;
  if (importRequestCode.startsWith('YCNKGIS_')) {
    const parts = importRequestCode.split('_');
    if (parts.length >= 2) {
      const unitCode = parts[1];
      if (VALID_UNITS.includes(unitCode)) return unitCode;
      if (unitCode === 'KANZ') return 'KANZ1';
      if (unitCode === 'PNPZ') return 'PNPZ1';
    }
  }
  return null;
};


const calculateDaysDiff = (dateString) => {
  if (!dateString) return 0;
  const parts = dateString.split(/[/\s:]+/);
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  const createdDate = new Date(year, month, day);
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const diffTime = currentDate - createdDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const Dashboard_Request = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [data, setData] = useState(() => getStorageData(STORAGE_KEYS.DATA) || []);
  const [completionHistory, setCompletionHistory] = useState(() => getStorageData(STORAGE_KEYS.COMPLETION) || []);
  const [targets, setTargets] = useState(() => getStorageData(STORAGE_KEYS.TARGETS) || {});
  const [confirmedStatus, setConfirmedStatus] = useState(() => getStorageData(STORAGE_KEYS.CONFIRMED) || {});

  // Load Restock Out Data for the combined Performance Table
  const [restockOutData, setRestockOutData] = useState(() => getStorageData('restock_out_data') || []);
  const [restockOutHistory, setRestockOutHistory] = useState(() => getStorageData('restock_out_completionHistory') || []);
  const [restockOutConfirmed, setRestockOutConfirmed] = useState(() => getStorageData('restock_out_confirmedStatus') || {});

  // Telegram bot and unit-level targets state
  const [restockOutTargets, setRestockOutTargets] = useState(() => getStorageData('restock_out_targets') || {});
  const [customNote, setCustomNote] = useState('');

  // Load data from DB on mount
  useEffect(() => {
    const fetchDbData = async () => {
      const dbData = await loadFromDb(STORAGE_KEYS.DATA, []);
      setData(dbData);
      
      const dbCompletion = await loadFromDb(STORAGE_KEYS.COMPLETION, []);
      setCompletionHistory(dbCompletion);

      const dbTargets = await loadFromDb(STORAGE_KEYS.TARGETS, {});
      setTargets(dbTargets);

      const dbConfirmed = await loadFromDb(STORAGE_KEYS.CONFIRMED, {});
      setConfirmedStatus(dbConfirmed);

      const dbOutData = await loadFromDb('restock_out_data', []);
      setRestockOutData(dbOutData);

      const dbOutHistory = await loadFromDb('restock_out_completionHistory', []);
      setRestockOutHistory(dbOutHistory);

      const dbOutConfirmed = await loadFromDb('restock_out_confirmedStatus', {});
      setRestockOutConfirmed(dbOutConfirmed);

      const dbOutTargets = await loadFromDb('restock_out_targets', {});
      setRestockOutTargets(dbOutTargets);

      const dbRestockTargets = await loadFromDb('kpi_restock_targets', null);
      if (dbRestockTargets) {
        setRestockTargets({
          restock_in: { morning: 0, evening: 0, ...dbRestockTargets.restock_in },
          restock_out: { morning: 0, evening: 0, ...dbRestockTargets.restock_out }
        });
      }
    };
    fetchDbData();
  }, []);

  const [savedNotes, setSavedNotes] = useState([]);

  // Fetch templates from database on component mount
  useEffect(() => {
    const loadTemplates = async () => {
      const templates = await getSavedTemplates();
      setSavedNotes(templates);
    };
    loadTemplates();
  }, []);

  const handleSaveNote = async () => {
    if (!customNote.trim()) return;
    if (savedNotes.some(n => n.content === customNote.trim())) return;
    
    const result = await saveTemplate(customNote.trim());
    if (result && !result.error) {
      setSavedNotes(prev => [result, ...prev]);
    } else {
      alert(result.error || 'Failed to save template');
    }
  };

  const handleDeleteNote = async (templateId) => {
    const success = await deleteTemplate(templateId);
    if (success) {
      setSavedNotes(prev => prev.filter(n => n.id !== templateId));
    } else {
      alert('Failed to delete template from database');
    }
  };

  const abortControllerRef = useRef(null);
  const [isSending, setIsSending] = useState(false);
  const [telegramSelectedUnit, setTelegramSelectedUnit] = useState('BAT');
  const [showUnitSelector, setShowUnitSelector] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [sendResults, setSendResults] = useState(null);
  const [screenshotUnit, setScreenshotUnit] = useState(null);
  const [screenshotMode, setScreenshotMode] = useState(false);

  // Restock KPI Targets State
  const [restockTargets, setRestockTargets] = useState(() => {
    const saved = getStorageData('kpi_restock_targets');
    return saved || {
      restock_in: { morning: 0, evening: 0 },
      restock_out: { morning: 0, evening: 0 }
    };
  });

  const sumInMorning = useMemo(() => {
    return Object.values(targets).reduce((sum, t) => sum + (t?.morning || 0), 0);
  }, [targets]);

  const sumInEvening = useMemo(() => {
    return Object.values(targets).reduce((sum, t) => sum + (t?.evening || 0), 0);
  }, [targets]);

  const sumOutMorning = useMemo(() => {
    return Object.values(restockOutTargets).reduce((sum, t) => sum + (t?.morning || 0), 0);
  }, [restockOutTargets]);

  const sumOutEvening = useMemo(() => {
    return Object.values(restockOutTargets).reduce((sum, t) => sum + (t?.evening || 0), 0);
  }, [restockOutTargets]);

  const [editMorningRestockIn, setEditMorningRestockIn] = useState(restockTargets.restock_in?.morning || sumInMorning);
  const [editEveningRestockIn, setEditEveningRestockIn] = useState(restockTargets.restock_in?.evening || sumInEvening);
  const [editMorningRestockOut, setEditMorningRestockOut] = useState(restockTargets.restock_out?.morning || sumOutMorning);
  const [editEveningRestockOut, setEditEveningRestockOut] = useState(restockTargets.restock_out?.evening || sumOutEvening);

  // Sync inputs if targets state changes
  useEffect(() => {
    setEditMorningRestockIn(restockTargets.restock_in?.morning || sumInMorning);
    setEditEveningRestockIn(restockTargets.restock_in?.evening || sumInEvening);
    setEditMorningRestockOut(restockTargets.restock_out?.morning || sumOutMorning);
    setEditEveningRestockOut(restockTargets.restock_out?.evening || sumOutEvening);
  }, [restockTargets, sumInMorning, sumInEvening, sumOutMorning, sumOutEvening]);

  const handleUpdateRestockIn = () => {
    const updated = {
      ...restockTargets,
      restock_in: { morning: parseInt(editMorningRestockIn) || 0, evening: parseInt(editEveningRestockIn) || 0 }
    };
    setRestockTargets(updated);
    saveToDb('kpi_restock_targets', updated);
  };

  const handleUpdateRestockOut = () => {
    const updated = {
      ...restockTargets,
      restock_out: { morning: parseInt(editMorningRestockOut) || 0, evening: parseInt(editEveningRestockOut) || 0 }
    };
    setRestockTargets(updated);
    saveToDb('kpi_restock_targets', updated);
  };
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [timeRange, setTimeRange] = useState('all');

  const allUnits = getAllUnits();
  const configured = getConfiguredUnits();
  const totalUnits = allUnits.length;
  const configuredCount = configured.length;

  // Process data with units
  const processedData = useMemo(() => {
    return data.map(item => ({
      ...item,
      unit: item.unit || getUnitFromRequestCode(item.importRequestCode),
      daysDiff: calculateDaysDiff(item.dateCreate),
      isCompleted: completionHistory.some(h => h.importRequestCode === item.importRequestCode) || 
                    confirmedStatus[item.id]
    }));
  }, [data, completionHistory, confirmedStatus]);



  // KPI Calculations
  const kpiData = useMemo(() => {
    const unitStats = {};
    const yearStats = {};
    const monthlyStats = {};
    let totalRequests = 0;
    let totalCompleted = 0;
    let totalPending = 0;
    let totalAlarms = 0;

    processedData.forEach(item => {
      if (!item.unit || !VALID_UNITS.includes(item.unit)) return;

      const unit = item.unit;
      const year = item.year || 'Unknown';
      const isCompleted = item.isCompleted;

      if (!unitStats[unit]) {
        unitStats[unit] = {
          total: 0,
          completed: 0,
          pending: 0,
          alarmCount: 0,
          items: []
        };
      }
      unitStats[unit].total++;
      if (isCompleted) unitStats[unit].completed++;
      else unitStats[unit].pending++;
      if (item.daysDiff > 4) unitStats[unit].alarmCount++;
      unitStats[unit].items.push(item);

      if (!yearStats[year]) {
        yearStats[year] = { total: 0, completed: 0, pending: 0 };
      }
      yearStats[year].total++;
      if (isCompleted) yearStats[year].completed++;
      else yearStats[year].pending++;

      if (item.dateCreate) {
        const parts = item.dateCreate.split(/[/\s:]+/);
        if (parts.length >= 2) {
          const monthKey = `${parts[1]}/${parts[2]}`;
          if (!monthlyStats[monthKey]) {
            monthlyStats[monthKey] = { total: 0, completed: 0, pending: 0 };
          }
          monthlyStats[monthKey].total++;
          if (isCompleted) monthlyStats[monthKey].completed++;
          else monthlyStats[monthKey].pending++;
        }
      }

      totalRequests++;
      if (isCompleted) totalCompleted++;
      else totalPending++;
      if (item.daysDiff > 4) totalAlarms++;
    });

    Object.keys(unitStats).forEach(unit => {
      const target = targets[unit]?.target || 0;
      unitStats[unit].target = target;
      unitStats[unit].progress = target > 0 ? (unitStats[unit].completed / target) * 100 : 0;
    });

    const sortedUnits = Object.entries(unitStats)
      .sort((a, b) => b[1].total - a[1].total);

    return {
      unitStats,
      sortedUnits,
      yearStats,
      monthlyStats,
      summary: {
        totalRequests,
        totalCompleted,
        totalPending,
        totalAlarms,
        completionRate: totalRequests > 0 ? (totalCompleted / totalRequests) * 100 : 0
      }
    };
  }, [processedData, targets]);

  // Filter data based on selected unit and time range
  const filteredData = useMemo(() => {
    let filtered = processedData;

    if (selectedUnit !== 'all') {
      filtered = filtered.filter(item => item.unit === selectedUnit);
    }

    if (timeRange !== 'all') {
      const now = new Date();
      filtered = filtered.filter(item => {
        if (!item.dateCreate) return false;
        const parts = item.dateCreate.split(/[/\s:]+/);
        if (parts.length < 3) return false;
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        let year = parseInt(parts[2]);
        if (year < 100) year += 2000;
        const date = new Date(year, month, day);
        
        switch (timeRange) {
          case 'week': {
            const weekAgo = new Date(now);
            weekAgo.setDate(now.getDate() - 7);
            return date >= weekAgo;
          }
          case 'month': {
            const monthAgo = new Date(now);
            monthAgo.setMonth(now.getMonth() - 1);
            return date >= monthAgo;
          }
          case 'year': {
            const yearAgo = new Date(now);
            yearAgo.setFullYear(now.getFullYear() - 1);
            return date >= yearAgo;
          }
          default: return true;
        }
      });
    }

    return filtered;
  }, [processedData, selectedUnit, timeRange]);

  const filteredKPI = useMemo(() => {
    // 1. Collect active items
    let activeIn = data;
    let activeOut = restockOutData;
    
    // 2. Filter active items by selectedUnit
    if (selectedUnit !== 'all') {
      activeIn = activeIn.filter(item => (item.unit || getUnitFromRequestCode(item.importRequestCode)) === selectedUnit);
      activeOut = activeOut.filter(item => (item.unit || getUnitFromRequestCode(item.requestExportCode)) === selectedUnit);
    }
    
    // 3. Filter completed items from history by selectedUnit
    let completedIn = completionHistory;
    let completedOut = restockOutHistory;
    if (selectedUnit !== 'all') {
      completedIn = completedIn.filter(h => h.unit === selectedUnit);
      completedOut = completedOut.filter(h => h.unit === selectedUnit);
    }
    
    // 4. Calculate stats
    // A. Restock In
    const inUnsigned = activeIn.filter(item => !confirmedStatus[item.id]).length;
    const inConfirmedCount = activeIn.filter(item => confirmedStatus[item.id]).length;
    const inResult = completedIn.length + inConfirmedCount;
    const inTotal = inResult + inUnsigned;
    
    // B. Restock Out
    const outUnsigned = activeOut.filter(item => !restockOutConfirmed[item.id]).length;
    const outConfirmedCount = activeOut.filter(item => restockOutConfirmed[item.id]).length;
    const outResult = completedOut.length + outConfirmedCount;
    const outTotal = outResult + outUnsigned;
    
    // C. Alarms
    const inAlarms = activeIn.filter(item => item.daysDiff > 4 && !confirmedStatus[item.id]).length;
    const outAlarms = activeOut.filter(item => {
      const days = calculateDaysDiff(item.createDate);
      return days > 4 && !restockOutConfirmed[item.id];
    }).length;
    const totalAlarms = inAlarms + outAlarms;
    
    const totalRequests = inTotal + outTotal;
    const totalCompleted = inResult + outResult;
    const totalPending = inUnsigned + outUnsigned;
    
    // Set up unitStats for active units in the filtered view
    const unitStats = {};
    const allUnits = getAllUnits();
    allUnits.forEach(u => {
      const uInUnsigned = activeIn.filter(item => (item.unit || getUnitFromRequestCode(item.importRequestCode)) === u && !confirmedStatus[item.id]).length;
      const uInConfirmed = activeIn.filter(item => (item.unit || getUnitFromRequestCode(item.importRequestCode)) === u && confirmedStatus[item.id]).length;
      const uInResult = completedIn.filter(h => h.unit === u).length + uInConfirmed;
      
      const uOutUnsigned = activeOut.filter(item => (item.unit || getUnitFromRequestCode(item.requestExportCode)) === u && !restockOutConfirmed[item.id]).length;
      const uOutConfirmed = activeOut.filter(item => (item.unit || getUnitFromRequestCode(item.requestExportCode)) === u && restockOutConfirmed[item.id]).length;
      const uOutResult = completedOut.filter(h => h.unit === u).length + uOutConfirmed;
      
      const uTotal = uInUnsigned + uInResult + uOutUnsigned + uOutResult;
      if (uTotal > 0) {
        unitStats[u] = {
          total: uTotal,
          completed: uInResult + uOutResult,
          pending: uInUnsigned + uOutUnsigned,
          alarmCount: activeIn.filter(item => (item.unit || getUnitFromRequestCode(item.importRequestCode)) === u && item.daysDiff > 4 && !confirmedStatus[item.id]).length +
                      activeOut.filter(item => {
                        const uCode = item.unit || getUnitFromRequestCode(item.requestExportCode);
                        const days = calculateDaysDiff(item.createDate);
                        return uCode === u && days > 4 && !restockOutConfirmed[item.id];
                      }).length
        };
      }
    });
    
    return {
      unitStats,
      summary: {
        totalRequests,
        totalCompleted,
        totalPending,
        totalAlarms,
        completionRate: totalRequests > 0 ? (totalCompleted / totalRequests) * 100 : 0
      }
    };
  }, [data, restockOutData, completionHistory, restockOutHistory, confirmedStatus, restockOutConfirmed, selectedUnit]);



  const getAlarmColor = (count) => {
    if (count === 0) return 'text-emerald-600';
    if (count <= 2) return 'text-amber-600';
    if (count <= 5) return 'text-orange-600';
    return 'text-rose-600 font-bold';
  };

  const exportToExcel = () => {
    const exportData = filteredData.map(item => ({
      'Unit': item.unit || '-',
      'Import Request Code': item.importRequestCode || '-',
      'Import Command Code': item.importCommandCode || '-',
      'Date Create': item.dateCreate || '-',
      'Import Warehouse': item.importWarehouse || '-',
      'Contract': item.contract || '-',
      'Creator': item.creator || '-',
      'Unit Requests': item.unitRequests || '-',
      'Unit Receive': item.unitReceive || '-',
      'Date Delivery': item.dateDelivery || '-',
      'Status CA': item.statusCA || '-',
      'Days Diff': item.daysDiff || 0,
      'Year': item.year || '-',
      'Completed': item.isCompleted ? '✅ Yes' : '❌ No'
    }));

    if (exportData.length === 0) {
      alert('No data to export');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dashboard Data');
    XLSX.writeFile(wb, `dashboard_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Get unique units for filter
  const availableUnits = useMemo(() => {
    const units = new Set();
    processedData.forEach(item => {
      if (item.unit && VALID_UNITS.includes(item.unit)) {
        units.add(item.unit);
      }
    });
    return Array.from(units).sort();
  }, [processedData]);

  // Restock In metrics calculation
  const restockInResult = useMemo(() => {
    const confirmedCount = data.filter(item => confirmedStatus[item.id]).length;
    return completionHistory.length + confirmedCount;
  }, [data, completionHistory, confirmedStatus]);

  const restockInInSystem = data.length + completionHistory.length;
  const isMorning = new Date().getHours() < 12;
  const restockInMorning = restockTargets.restock_in?.morning || sumInMorning;
  const restockInEvening = restockTargets.restock_in?.evening || sumInEvening;
  const restockInTarget = isMorning ? restockInMorning : (restockInEvening > 0 ? restockInEvening : restockInMorning);
  const restockInConfirmedCount = useMemo(() => data.filter(item => confirmedStatus[item.id]).length, [data, confirmedStatus]);
  const restockInRemain = restockInTarget > 0 ? Math.max(0, restockInTarget - restockInResult) : (data.length - restockInConfirmedCount);
  const restockInRatio = restockInTarget > 0 ? ((restockInResult / restockInTarget) * 100).toFixed(2) : (restockInRemain === 0 ? '100.00' : '0.00');

  // Restock Out metrics calculation
  const restockOutResult = useMemo(() => {
    const confirmedCount = restockOutData.filter(item => restockOutConfirmed[item.id]).length;
    return restockOutHistory.length + confirmedCount;
  }, [restockOutData, restockOutHistory, restockOutConfirmed]);

  const restockOutInSystem = restockOutData.length + restockOutHistory.length;
  const restockOutMorning = restockTargets.restock_out?.morning || sumOutMorning;
  const restockOutEvening = restockTargets.restock_out?.evening || sumOutEvening;
  const restockOutTarget = isMorning ? restockOutMorning : (restockOutEvening > 0 ? restockOutEvening : restockOutMorning);
  const restockOutConfirmedCount = useMemo(() => restockOutData.filter(item => restockOutConfirmed[item.id]).length, [restockOutData, restockOutConfirmed]);
  const restockOutRemain = restockOutTarget > 0 ? Math.max(0, restockOutTarget - restockOutResult) : (restockOutData.length - restockOutConfirmedCount);
  const restockOutRatio = restockOutTarget > 0 ? ((restockOutResult / restockOutTarget) * 100).toFixed(2) : (restockOutRemain === 0 ? '100.00' : '0.00');

  // Combined totals
  const totalRestockMorning = restockInMorning + restockOutMorning;
  const totalRestockEvening = restockInEvening + restockOutEvening;
  const totalRestockResult = restockInResult + restockOutResult;
  const totalRestockInSystem = restockInInSystem + restockOutInSystem;
  const totalRestockTarget = restockInTarget + restockOutTarget;
  const totalRestockRemain = totalRestockTarget > 0 ? Math.max(0, totalRestockTarget - totalRestockResult) : (data.length - restockInConfirmedCount + restockOutData.length - restockOutConfirmedCount);
  const totalRestockRatio = totalRestockTarget > 0 ? ((totalRestockResult / totalRestockTarget) * 100).toFixed(2) : (totalRestockRemain === 0 ? '100.00' : '0.00');

  const getReportData = () => {
    const allUnits = getAllUnits();
    
    const unitsMap = {};
    
    allUnits.forEach(unit => {
      const inUnsigned = data.filter(item => {
        const u = item.unit || getUnitFromRequestCode(item.importRequestCode);
        return u === unit && !confirmedStatus[item.id];
      }).length;
      const inConfirmedCount = data.filter(item => {
        const u = item.unit || getUnitFromRequestCode(item.importRequestCode);
        return u === unit && confirmedStatus[item.id];
      }).length;
      const inResult = completionHistory.filter(h => h.unit === unit).length + inConfirmedCount;
      const inInSystem = inResult + inUnsigned;
      const inMorning = targets[unit]?.morning || 0;
      const inEvening = targets[unit]?.evening || 0;
      const inTarget = isMorning ? inMorning : (inEvening > 0 ? inEvening : inMorning);
      const inRemain = inTarget > 0 ? Math.max(0, inTarget - inResult) : inUnsigned;
      const inRatio = inTarget > 0 ? parseFloat(((inResult / inTarget) * 100).toFixed(2)) : (inRemain === 0 ? 100 : 0);
      
      const outUnsigned = restockOutData.filter(item => {
        const u = item.unit || getUnitFromRequestCode(item.requestExportCode);
        return u === unit && !restockOutConfirmed[item.id];
      }).length;
      const outConfirmedCount = restockOutData.filter(item => {
        const u = item.unit || getUnitFromRequestCode(item.requestExportCode);
        return u === unit && restockOutConfirmed[item.id];
      }).length;
      const outResult = restockOutHistory.filter(h => h.unit === unit).length + outConfirmedCount;
      const outInSystem = outResult + outUnsigned;
      const outMorning = restockOutTargets[unit]?.morning || 0;
      const outEvening = restockOutTargets[unit]?.evening || 0;
      const outTarget = isMorning ? outMorning : (outEvening > 0 ? outEvening : outMorning);
      const outRemain = outTarget > 0 ? Math.max(0, outTarget - outResult) : outUnsigned;
      const outRatio = outTarget > 0 ? parseFloat(((outResult / outTarget) * 100).toFixed(2)) : (outRemain === 0 ? 100 : 0);
      
      const targetMorning = inMorning + outMorning;
      const targetEvening = inEvening + outEvening;
      const unitTotalTarget = inTarget + outTarget;
      const unitTotalResult = inResult + outResult;
      const unitTotalUnsigned = inUnsigned + outUnsigned;
      const unitTotalRemain = unitTotalTarget > 0 ? Math.max(0, unitTotalTarget - unitTotalResult) : unitTotalUnsigned;
      const unitTotalInSystem = inInSystem + outInSystem;
      const unitTotalRatio = unitTotalTarget > 0 ? parseFloat(((unitTotalResult / unitTotalTarget) * 100).toFixed(2)) : (unitTotalRemain === 0 ? 100 : 0);
      
      const unsignedInItemsList = data
        .filter(item => {
          const u = item.unit || getUnitFromRequestCode(item.importRequestCode);
          return u === unit && !confirmedStatus[item.id];
        })
        .map(item => ({
          code: item.importRequestCode || '',
          daysDiff: item.daysDiff !== undefined ? item.daysDiff : calculateDaysDiff(item.dateCreate),
          unitRequests: item.unitRequests || '-',
          creator: item.creator || '-'
        }));

      const unsignedOutItemsList = restockOutData
        .filter(item => {
          const u = item.unit || getUnitFromRequestCode(item.requestExportCode);
          return u === unit && !restockOutConfirmed[item.id];
        })
        .map(item => ({
          code: item.requestExportCode || '',
          daysDiff: item.daysDiff !== undefined ? item.daysDiff : calculateDaysDiff(item.createDate),
          groupRequest: item.groupRequest || '-',
          creator: item.creator || '-'
        }));

      unitsMap[unit] = {
        targetMorning,
        targetEvening,
        remain: unitTotalRemain,
        result: unitTotalResult,
        ratio: unitTotalRatio,
        inSystem: unitTotalInSystem,
        restockIn: {
          target: inTarget,
          result: inResult,
          remain: inRemain,
          ratio: inRatio,
          inSystem: inInSystem
        },
        restockOut: {
          target: outTarget,
          result: outResult,
          remain: outRemain,
          ratio: outRatio,
          inSystem: outInSystem
        },
        totalTarget: unitTotalTarget,
        totalResult: unitTotalResult,
        totalRemain: unitTotalRemain,
        totalRatio: unitTotalRatio,
        totalInSystem: unitTotalInSystem,
        unsignedInItems: unsignedInItemsList,
        unsignedOutItems: unsignedOutItemsList
      };
    });
    
    return {
      totalTarget: totalRestockTarget,
      totalResult: totalRestockResult,
      totalRemain: totalRestockRemain,
      totalRatio: parseFloat(totalRestockRatio),
      totalInSystem: totalRestockInSystem,
      restockIn: {
        target: restockInTarget,
        result: restockInResult,
        remain: restockInRemain,
        ratio: parseFloat(restockInRatio),
        inSystem: restockInInSystem
      },
      restockOut: {
        target: restockOutTarget,
        result: restockOutResult,
        remain: restockOutRemain,
        ratio: parseFloat(restockOutRatio),
        inSystem: restockOutInSystem
      },
      units: unitsMap
    };
  };

  // Send Restock reports to ALL units
  const sendToAll = async () => {
    if (isSending) return;
    
    const configured = getConfiguredUnits();
    if (configured.length === 0) {
      alert('⚠️ No group IDs configured! Please add group IDs for at least one province.');
      return;
    }
    
    setIsSending(true);
    setShowProgressModal(true);
    setSendProgress(null);
    setSendResults(null);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const data = getReportData();
      
      const result = await sendToAllRestockTelegram(data, (progress) => {
        setSendProgress(progress);
      }, customNote, abortControllerRef.current.signal);
      
      setSendResults(result.summary);
      
      if (result.summary.success > 0) {
        completeStore(STORAGE_KEYS.DATA);
        completeStore('restock_out_data');
      }
      
      let message = `✅ Report sent to ${result.summary.success}/${result.summary.total} groups`;
      if (result.summary.failed > 0) {
        message += `\n❌ Failed: ${result.summary.failed}`;
        if (result.summary.details) {
          message += `\n\nDetails:\n${result.summary.details.join('\n')}`;
        }
      }
      alert(message);
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Sending cancelled.');
      } else {
        console.error('Error sending to all:', error);
        alert('❌ Error sending reports. Check console for details.');
      }
    } finally {
      setIsSending(false);
      if (!abortControllerRef.current?.signal.aborted) {
        setTimeout(() => setShowProgressModal(false), 3000);
      }
    }
  };

  // Send Restock report to single unit
  const sendReportToTelegram = async (unit) => {
    if (isSending) return;
    
    if (!hasGroupId(unit)) {
      alert(`⚠️ No group ID configured for ${unit}. Please add it first.`);
      return;
    }
    
    setIsSending(true);
    setShowProgressModal(true);
    setSendProgress({
      current: 1,
      total: 1,
      unit: unit,
      status: 'sending'
    });
    setSendResults(null);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const data = getReportData();
      const result = await sendRestockToTelegram(unit, data, customNote, abortControllerRef.current.signal);
      
      if (result && result.success) {
        completeStore(STORAGE_KEYS.DATA);
        completeStore('restock_out_data');
        setSendProgress({
          current: 1,
          total: 1,
          unit: unit,
          status: 'success'
        });
        setSendResults({
          total: 1,
          success: 1,
          failed: 0
        });
        alert(`✅ Report sent successfully to ${unit} group!`);
      } else {
        const isAbort = result?.aborted || abortControllerRef.current.signal.aborted;
        setSendProgress({
          current: 1,
          total: 1,
          unit: unit,
          status: 'failed',
          error: isAbort ? 'Cancelled by user' : (result?.error || 'Unknown error')
        });
        setSendResults({
          total: 1,
          success: 0,
          failed: 1
        });
        if (!isAbort) {
          alert(`❌ Failed to send report to ${unit}. ${result?.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Single send cancelled.');
      } else {
        console.error('Error sending report:', error);
        alert(`❌ Error sending report: ${error.message}`);
      }
    } finally {
      setIsSending(false);
      setShowUnitSelector(false);
      if (!abortControllerRef.current?.signal.aborted) {
        setTimeout(() => setShowProgressModal(false), 3000);
      }
    }
  };

  // Send screenshot report to single unit
  const sendReportToTelegramScreenshot = async (unit) => {
    if (isSending) return;
    
    if (!hasGroupId(unit)) {
      alert(`⚠️ No group ID configured for ${unit}. Please add it first.`);
      return;
    }
    
    setIsSending(true);
    setShowProgressModal(true);
    setSendProgress({
      current: 1,
      total: 1,
      unit: unit,
      status: 'sending'
    });
    setSendResults(null);
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    try {
      setScreenshotUnit(unit);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      
      const element = document.getElementById('telegram-screenshot-report');
      if (!element) {
        throw new Error('Screenshot element not found in DOM.');
      }
      
      const rect = element.getBoundingClientRect();
      const elHeight = rect.height || 600;
      let scale = 3.0;
      if (elHeight > 1800) scale = 2.0;
      else if (elHeight > 1200) scale = 2.5;
      
      const canvas = await html2canvas(element, {
        width: 480,
        scale: scale,
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc',
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          const clonedEl = clonedDoc.getElementById('telegram-screenshot-report');
          if (clonedEl) {
            clonedEl.style.position = 'static';
            clonedEl.style.top = '0';
            clonedEl.style.left = '0';
            clonedEl.style.zIndex = '1';
            clonedEl.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
            clonedEl.style.webkitFontSmoothing = 'antialiased';
            clonedEl.style.textRendering = 'optimizeLegibility';
          }
        }
      });
      
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas to Blob conversion failed')), 'image/png');
      });
      
      const caption = `📊 <b>TASK ASSET REPORT (RESTOCK) - BRANCH: ${unit}</b>`;
      const result = await sendPhotoToTelegram(unit, blob, caption, signal);
      
      if (result && result.success) {
        completeStore(STORAGE_KEYS.DATA);
        completeStore('restock_out_data');
        setSendProgress({
          current: 1,
          total: 1,
          unit: unit,
          status: 'success'
        });
        setSendResults({
          total: 1,
          success: 1,
          failed: 0
        });
        alert(`✅ Screenshot report sent successfully to ${unit} group!`);
      } else {
        const isAbort = result?.aborted || signal.aborted;
        setSendProgress({
          current: 1,
          total: 1,
          unit: unit,
          status: 'failed',
          error: isAbort ? 'Cancelled by user' : (result?.error || 'Unknown error')
        });
        setSendResults({
          total: 1,
          success: 0,
          failed: 1
        });
        if (!isAbort) {
          alert(`❌ Failed to send screenshot report to ${unit}. ${result?.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Single screenshot send cancelled.');
      } else {
        console.error('Error sending screenshot report:', error);
        alert(`❌ Error sending screenshot report: ${error.message}`);
      }
    } finally {
      setScreenshotUnit(null);
      setIsSending(false);
      setShowUnitSelector(false);
      if (!abortControllerRef.current?.signal.aborted) {
        setTimeout(() => setShowProgressModal(false), 3000);
      }
    }
  };

  // Send screenshot reports to all configured units
  const sendToAllScreenshot = async () => {
    const units = getConfiguredUnits();
    if (units.length === 0) {
      alert('⚠️ No group IDs configured. Please add group IDs first.');
      return;
    }
    
    if (isSending) return;
    
    setIsSending(true);
    setShowProgressModal(true);
    setSendResults(null);
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    let successCount = 0;
    let failCount = 0;
    let completedCount = 0;
    const results = [];
    
    try {
      for (const unit of units) {
        if (signal.aborted) {
          results.push({ unit, success: false, error: 'Cancelled', aborted: true });
          failCount++;
          completedCount++;
          continue;
        }
        
        setSendProgress({
          current: completedCount + 1,
          total: units.length,
          unit: unit,
          status: 'sending'
        });
        
        try {
          setScreenshotUnit(unit);
          await new Promise(resolve => setTimeout(resolve, 300));
          
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          
          const element = document.getElementById('telegram-screenshot-report');
          if (!element) {
            throw new Error('Screenshot element not found in DOM.');
          }
          
          const rect = element.getBoundingClientRect();
          const elHeight = rect.height || 600;
          let scale = 3.0;
          if (elHeight > 1800) scale = 2.0;
          else if (elHeight > 1200) scale = 2.5;
          
          const canvas = await html2canvas(element, {
            width: 480,
            scale: scale,
            useCORS: true,
            logging: false,
            backgroundColor: '#f8fafc',
            scrollX: 0,
            scrollY: 0,
            onclone: (clonedDoc) => {
              const clonedEl = clonedDoc.getElementById('telegram-screenshot-report');
              if (clonedEl) {
                clonedEl.style.position = 'static';
                clonedEl.style.top = '0';
                clonedEl.style.left = '0';
                clonedEl.style.zIndex = '1';
                clonedEl.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
                clonedEl.style.webkitFontSmoothing = 'antialiased';
                clonedEl.style.textRendering = 'optimizeLegibility';
              }
            }
          });
          
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          
          const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas to Blob conversion failed')), 'image/png');
          });
          
          const caption = `📊 <b>TASK ASSET REPORT (RESTOCK) - BRANCH: ${unit}</b>`;
          const sendRes = await sendPhotoToTelegram(unit, blob, caption, signal);
          
          completedCount++;
          results.push({ unit, ...sendRes });
          
          if (sendRes && sendRes.success) {
            successCount++;
            setSendProgress({
              current: completedCount,
              total: units.length,
              unit: unit,
              status: 'success'
            });
          } else {
            failCount++;
            setSendProgress({
              current: completedCount,
              total: units.length,
              unit: unit,
              status: 'failed',
              error: sendRes?.error || 'Unknown error'
            });
          }
        } catch (unitErr) {
          completedCount++;
          failCount++;
          results.push({ unit, success: false, error: unitErr.message });
          setSendProgress({
            current: completedCount,
            total: units.length,
            unit: unit,
            status: 'failed',
            error: unitErr.message
          });
        }
        
        if (completedCount < units.length && !signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }
      }
      
      if (successCount > 0) {
        completeStore(STORAGE_KEYS.DATA);
        completeStore('restock_out_data');
      }
      
      setSendResults({
        total: units.length,
        success: successCount,
        failed: failCount
      });
    } catch (err) {
      console.error('Error in send all screenshot:', err);
    } finally {
      setScreenshotUnit(null);
      setIsSending(false);
      if (!abortControllerRef.current?.signal.aborted) {
        setTimeout(() => setShowProgressModal(false), 3000);
      }
    }
  };

  // Render offscreen screenshot report for Telegram
  const renderScreenshotReport = () => {
    if (!screenshotUnit) return null;
    const unit = screenshotUnit;
    const reportData = getReportData();
    const unitData = reportData.units[unit];
    if (!unitData) return null;

    const targetMorning = unitData.targetMorning || 0;
    const targetEvening = unitData.targetEvening || 0;
    const remain = unitData.remain || 0;
    const result = unitData.result || 0;
    const ratio = unitData.ratio || 0;
    const inSystem = unitData.inSystem || 0;

    const unsignedInItems = unitData.unsignedInItems || [];
    const unsignedOutItems = unitData.unsignedOutItems || [];

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const getDelayBadge = (days) => {
      if (days >= 5) {
        return (
          <span className="inline-flex items-center px-1 py-0.5 rounded text-[8.5px] font-black bg-rose-50 text-rose-600 border border-rose-100 uppercase tracking-wide gap-0.5 shadow-xs">
            🔴 {days}d
          </span>
        );
      }
      if (days >= 3) {
        return (
          <span className="inline-flex items-center px-1 py-0.5 rounded text-[8.5px] font-black bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-wide gap-0.5 shadow-xs">
            🟡 {days}d
          </span>
        );
      }
      return (
        <span className="inline-flex items-center px-1 py-0.5 rounded text-[8.5px] font-bold bg-slate-50 text-slate-500 border border-slate-100 uppercase tracking-wide gap-0.5">
          ⚪ {days}d
        </span>
      );
    };

    return (
      <div 
        id="telegram-screenshot-report" 
        className="w-[480px] bg-slate-50 p-4 font-sans relative flex flex-col gap-3 text-left"
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          zIndex: -9999,
          boxSizing: 'border-box'
        }}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-4 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-28 h-28 bg-white/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex justify-between items-start">
            <span className="text-[9px] bg-white/15 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-white/10 backdrop-blur-xs">
              📊 Task Asset Report (Restock)
            </span>
            <span className="text-[9px] text-indigo-200/90 font-medium">
              🕐 {timeStr} | 📅 {dateStr}
            </span>
          </div>
          <h2 className="text-lg font-black mt-2 tracking-tight flex items-center gap-1.5">
            📍 BRANCH : <span className="text-yellow-300 font-extrabold">{unit}</span>
          </h2>
        </div>

        {/* Overall KPI Summary Cards */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-xs">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            📈 KPI SUMMARY RESTOCK
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50/70 border-t-2 border-slate-400 rounded-xl p-2 text-center">
              <div className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Target ព្រឹក/ល្ងាច</div>
              <div className="text-[11px] font-black text-slate-700 mt-0.5">{targetMorning} / {targetEvening}</div>
            </div>
            <div className="bg-emerald-50/30 border-t-2 border-emerald-500 rounded-xl p-2 text-center">
              <div className="text-[8px] text-emerald-600 font-bold uppercase tracking-wider">Result</div>
              <div className="text-[11px] font-black text-emerald-600 mt-0.5">{result}</div>
            </div>
            <div className="bg-rose-50/30 border-t-2 border-rose-500 rounded-xl p-2 text-center">
              <div className="text-[8px] text-rose-600 font-bold uppercase tracking-wider">Remain</div>
              <div className="text-[11px] font-black text-rose-600 mt-0.5">{remain}</div>
            </div>
            <div className="bg-blue-50/30 border-t-2 border-blue-500 rounded-xl p-2 text-center col-span-1.5">
              <div className="text-[8px] text-blue-600 font-bold uppercase tracking-wider">Ratio</div>
              <div className="text-[11px] font-black text-blue-600 mt-0.5">{ratio.toFixed(1)}%</div>
            </div>
            <div className="bg-indigo-50/30 border-t-2 border-indigo-500 rounded-xl p-2 text-center col-span-1.5">
              <div className="text-[8px] text-indigo-600 font-bold uppercase tracking-wider">In System</div>
              <div className="text-[11px] font-black text-indigo-600 mt-0.5">{inSystem}</div>
            </div>
          </div>
        </div>

        {/* Restock Out Section */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-xs">
          <h3 className="text-[11px] font-black text-slate-800 flex items-center justify-between pb-2 border-b border-slate-100 mb-2.5">
            <span className="flex items-center gap-1.5 text-slate-700">📤 RESTOCK OUT</span>
            <span className={unsignedOutItems.length === 0 ? "text-emerald-600 font-extrabold text-[9px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100" : "text-blue-700 font-extrabold text-[9px] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100"}>
              {unsignedOutItems.length === 0 ? "✅ Completed" : `📋 ${unsignedOutItems.length} Items`}
            </span>
          </h3>
          {unsignedOutItems.length > 0 ? (
            <div className="overflow-hidden border border-slate-200/80 rounded-xl shadow-xs">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gradient-to-b from-slate-50 to-slate-100/80 text-slate-700 text-[9.5px] font-bold border-b border-slate-200">
                    <th className="border-r border-slate-200 px-2 py-1 text-center w-7">ល.រ</th>
                    <th className="border-r border-slate-200 px-2 py-1">Code</th>
                    <th className="border-r border-slate-200 px-2 py-1 text-left w-[125px]">Group Request</th>
                    <th className="px-2 py-1 text-center w-12">Days ⚠️</th>
                  </tr>
                </thead>
                <tbody className="text-[9px] text-slate-600 divide-y divide-slate-100">
                  {unsignedOutItems.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 odd:bg-white even:bg-slate-50/20">
                      <td className="border-r border-slate-100 px-2 py-1 text-center font-semibold text-slate-400">{index + 1}</td>
                      <td className="border-r border-slate-100 px-2 py-1 font-bold text-slate-800 tracking-tighter font-mono">{item.code}</td>
                      <td className="border-r border-slate-100 px-2 py-1 font-bold text-slate-700 truncate max-w-[125px]">{cleanWarehouseName(item.groupRequest || '-')}</td>
                      <td className="px-2 py-1 text-center font-extrabold">{getDelayBadge(item.daysDiff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl py-3 text-center text-emerald-600 font-bold text-[11px] flex flex-col items-center gap-1">
              <span>🎉 All items cleared!</span>
              <span className="text-[9px] text-emerald-500/80 font-medium">គ្មានទិន្នន័យចាល់ឡើយ</span>
            </div>
          )}
        </div>

        {/* Restock In Section */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-xs">
          <h3 className="text-[11px] font-black text-slate-800 flex items-center justify-between pb-2 border-b border-slate-100 mb-2.5">
            <span className="flex items-center gap-1.5 text-slate-700">📥 RESTOCK IN</span>
            <span className={unsignedInItems.length === 0 ? "text-emerald-600 font-extrabold text-[9px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100" : "text-blue-700 font-extrabold text-[9px] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100"}>
              {unsignedInItems.length === 0 ? "✅ Completed" : `📋 ${unsignedInItems.length} Items`}
            </span>
          </h3>
          {unsignedInItems.length > 0 ? (
            <div className="overflow-hidden border border-slate-200/80 rounded-xl shadow-xs">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gradient-to-b from-slate-50 to-slate-100/80 text-slate-700 text-[9.5px] font-bold border-b border-slate-200">
                    <th className="border-r border-slate-200 px-2 py-1 text-center w-7">ល.រ</th>
                    <th className="border-r border-slate-200 px-2 py-1">Code</th>
                    <th className="border-r border-slate-200 px-2 py-1 text-left w-[125px]">Unit Requests</th>
                    <th className="px-2 py-1 text-center w-12">Days ⚠️</th>
                  </tr>
                </thead>
                <tbody className="text-[9px] text-slate-600 divide-y divide-slate-100">
                  {unsignedInItems.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 odd:bg-white even:bg-slate-50/20">
                      <td className="border-r border-slate-100 px-2 py-1 text-center font-semibold text-slate-400">{index + 1}</td>
                      <td className="border-r border-slate-100 px-2 py-1 font-bold text-slate-800 tracking-tighter font-mono">{item.code}</td>
                      <td className="border-r border-slate-100 px-2 py-1 font-bold text-slate-700 truncate max-w-[125px]">{cleanWarehouseName(item.unitRequests || '-')}</td>
                      <td className="px-2 py-1 text-center font-extrabold">{getDelayBadge(item.daysDiff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl py-4 text-center text-emerald-600 font-bold text-xs flex flex-col items-center gap-1">
              <span>🎉 All items cleared!</span>
              <span className="text-[9.5px] text-emerald-500/80 font-medium">គ្មានទិន្នន័យចាល់ឡើយ</span>
            </div>
          )}
        </div>

        {customNote && customNote.trim() && (
          <div className="bg-amber-50/40 border border-amber-100 rounded-3xl p-5 shadow-xs">
            <h4 className="text-[10.5px] font-black text-amber-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              📝 NOTE
            </h4>
            <p className="text-[10.5px] font-semibold text-slate-600 leading-relaxed whitespace-pre-wrap">{customNote.trim()}</p>
          </div>
        )}

        <div className="text-center text-[9.5px] font-bold text-slate-400/80 mt-1 flex items-center justify-center gap-1">
          <span>📊 Report generated from Restock Dashboard</span>
        </div>
      </div>
    );
  };

  // Render progress modal
  const renderProgressModal = () => {
    if (!showProgressModal) return null;
    
    const progress = sendProgress || { current: 0, total: 1, unit: '', status: 'sending' };
    const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    const results = sendResults || { total: 1, success: 0, failed: 0 };
    const hasError = progress.status === 'failed' || (results.failed > 0);
    
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`text-2xl ${!hasError ? 'animate-spin' : ''}`}>
              {hasError ? '❌' : '⏳'}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">
                {hasError ? 'Sending Failed' : 'Sending Reports...'}
              </h3>
              <p className="text-sm text-gray-500">
                {hasError ? 'Some errors occurred' : 'Please wait while we send'}
              </p>
            </div>
          </div>
          
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Progress</span>
              <span className="font-bold">{percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div 
                className={`h-3 rounded-full transition-all duration-500 ${
                  hasError ? 'bg-rose-500' : 'bg-gradient-to-r from-blue-500 to-emerald-500'
                }`}
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            {progress.status === 'sending' && (
              <div className="flex items-center gap-2">
                <span className="animate-pulse">📤</span>
                <span>Sending to <strong>{progress.unit}</strong> ({progress.current}/{progress.total})</span>
              </div>
            )}
            {progress.status === 'success' && (
              <div className="flex items-center gap-2 text-emerald-600">
                <span>✅</span>
                <span>Sent to <strong>{progress.unit}</strong></span>
              </div>
            )}
            {progress.status === 'failed' && (
              <div className="flex items-center gap-2 text-rose-600">
                <span>❌</span>
                <span>Failed to send to <strong>{progress.unit}</strong></span>
                {progress.error && <span className="text-xs text-gray-500">({progress.error})</span>}
              </div>
            )}
            {progress.status === 'error' && (
              <div className="flex items-center gap-2 text-rose-600">
                <span>⚠️</span>
                <span>{progress.error || 'Unknown error'}</span>
              </div>
            )}
          </div>
          
          {sendResults && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className="text-gray-500">Total</div>
                  <div className="text-xl font-bold text-gray-800">{results.total}</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2">
                  <div className="text-emerald-500">Success</div>
                  <div className="text-xl font-bold text-emerald-600">{results.success}</div>
                </div>
                <div className="bg-rose-50 rounded-lg p-2">
                  <div className="text-rose-500">Failed</div>
                  <div className="text-xl font-bold text-rose-600">{results.failed}</div>
                </div>
              </div>
            </div>
          )}
          
          {!sendResults && percentage === 100 && (
            <div className="mt-4 text-center text-sm text-gray-500">Completing...</div>
          )}
          
          {sendResults && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setShowProgressModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
              >
                Close
              </button>
            </div>
          )}

          {isSending && !sendResults && (
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
              >
                🛑 Cancel Sending
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full px-4 py-6 bg-gray-50 min-h-screen">
      
      {/* ─── HEADER ─── */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-lg shadow-indigo-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <span>📊</span> **របាយការណ៍ជូនដំណឹងអំពីប្រតិបត្តិការ Recall និង Request Stock Out ដែលមិនទាន់បានបិទដំណើរការក្នុងប្រព័ន្ធ។**
              </h1>
              <span className="bg-white/20 text-white text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider border border-white/30">
                🟢 Live • {currentTime.toLocaleTimeString()}
              </span>
            </div>
            <p className="text-indigo-100 mt-1 text-sm">Recall And &amp; Request Stock Out</p>
          </div>
          <button 
            onClick={exportToExcel}
            className="px-4 py-2.5 bg-white text-indigo-600 rounded-xl font-semibold hover:bg-indigo-50 transition-all shadow-md flex items-center gap-2 text-sm"
          >
            📎 Export Data
          </button>
        </div>
      </div>

      {/* ─── TELEGRAM BOT OVERVIEW ─── */}
      <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span>📤</span> PI Dashboard Overview
            </h2>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
              <span>Configured: <strong className="text-blue-600">{configuredCount}</strong>/{totalUnits} provinces</span>
              {configuredCount === 0 && (
                <span className="text-rose-500 font-medium">⚠️ Please add group IDs in telegramBot.js</span>
              )}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setScreenshotMode(false);
                sendToAll();
              }}
              disabled={isSending || configuredCount === 0}
              className={`px-5 py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 shadow-md disabled:opacity-50 ${
                configuredCount > 0
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-200'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              title={configuredCount === 0 ? 'No provinces configured' : 'Send to all configured provinces'}
            >
              <span>📤</span>
              Send Text All ({configuredCount})
            </button>

            <button
              onClick={() => {
                setScreenshotMode(true);
                sendToAllScreenshot();
              }}
              disabled={isSending || configuredCount === 0}
              className={`px-5 py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 shadow-md disabled:opacity-50 ${
                configuredCount > 0
                  ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-indigo-200'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              title={configuredCount === 0 ? 'No provinces configured' : 'Send screenshot to all configured provinces'}
            >
              <span>📸</span>
              Send Screenshot All ({configuredCount})
            </button>
            
            <button
              onClick={() => {
                setScreenshotMode(false);
                setShowUnitSelector(!showUnitSelector);
              }}
              disabled={isSending}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 shadow-md shadow-blue-200"
            >
              <span>📍</span>
              Send to Unit
            </button>

            <button
              onClick={() => {
                setScreenshotMode(true);
                setShowUnitSelector(!showUnitSelector);
              }}
              disabled={isSending}
              className="px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors flex items-center gap-2 disabled:opacity-50 shadow-md shadow-violet-200"
            >
              <span>📸</span>
              Send to Unit Screenshot
            </button>
          </div>
        </div>

        {/* Custom Note */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <span>✍️</span> Note/Comment to append to Telegram reports (Optional)
            </label>
            {customNote.trim() && !savedNotes.some(n => n.content === customNote.trim()) && (
              <button
                onClick={handleSaveNote}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
              >
                <span>💾</span> Save Template
              </button>
            )}
          </div>
          <textarea
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            placeholder="Type a custom note here (e.g. 'Please prioritize these tasks today!'). It will be appended to the Telegram report."
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
            rows={2}
          />
          
          {savedNotes.length > 0 && (
            <div className="mt-3">
              <span className="block text-xs font-medium text-gray-500 mb-1.5">Saved Templates (Click to use):</span>
              <div className="flex flex-wrap gap-2">
                {savedNotes.map((note) => (
                  <div 
                    key={note.id}
                    className="group inline-flex items-center gap-1 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-lg pl-2.5 pr-1 py-1 text-xs text-gray-600 hover:text-blue-700 transition-all cursor-pointer shadow-sm"
                  >
                    <span onClick={() => setCustomNote(note.content)} className="flex-1 select-none pr-1">
                      {note.content}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      className="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete template"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Configuration Warning */}
        {configuredCount === 0 && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl animate-fadeIn">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h4 className="font-bold text-rose-700">No Group IDs Configured</h4>
                <p className="text-sm text-rose-600">
                  Please add group IDs in <code className="bg-rose-100 px-1.5 py-0.5 rounded">src/services/telegramBot.js</code>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Unit Selector */}
        {showUnitSelector && (
          <div className="p-5 bg-gray-50 rounded-xl border border-gray-200 mt-4 animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <span>📍</span> Select Province/Unit to send report:
              </h3>
              <button onClick={() => setShowUnitSelector(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {allUnits.map((unit) => {
                const isConfigured = hasGroupId(unit);
                const hasTokenForUnit = hasToken(unit);
                return (
                  <button
                    key={unit}
                    onClick={() => {
                      setTelegramSelectedUnit(unit);
                      if (isConfigured) {
                        if (screenshotMode) {
                          sendReportToTelegramScreenshot(unit);
                        } else {
                          sendReportToTelegram(unit);
                        }
                      } else {
                        alert(`⚠️ No group ID configured for ${unit}. Please add it in telegramBot.js`);
                      }
                    }}
                    disabled={isSending || !isConfigured}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-all relative ${
                      !isConfigured
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                        : telegramSelectedUnit === unit
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
                    } disabled:opacity-50`}
                  >
                    {unit}
                    {isConfigured && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></span>
                    )}
                    {hasTokenForUnit && isConfigured && (
                      <span className="absolute -bottom-1 -right-1 text-[8px] bg-blue-500 text-white rounded-full px-1">🤖</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span> Configured
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-gray-300 rounded-full"></span> Not configured
              </span>
              <span className="flex items-center gap-1">
                <span className="text-blue-500">🤖</span> Has custom token
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── SUMMARY CARDS ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-blue-500 hover:shadow-xl transition-shadow">
          <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Total Requests</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{filteredKPI.summary.totalRequests}</div>
          <div className="text-[10px] text-gray-400 mt-1">All records</div>
        </div>
        <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-emerald-500 hover:shadow-xl transition-shadow">
          <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Completed</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{filteredKPI.summary.totalCompleted}</div>
          <div className="text-[10px] text-gray-400 mt-1">{filteredKPI.summary.completionRate.toFixed(1)}% rate</div>
        </div>
        <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-amber-500 hover:shadow-xl transition-shadow">
          <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Pending</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{filteredKPI.summary.totalPending}</div>
          <div className="text-[10px] text-gray-400 mt-1">Awaiting completion</div>
        </div>
        <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-rose-500 hover:shadow-xl transition-shadow">
          <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Alarms</div>
          <div className={`text-2xl font-bold ${getAlarmColor(filteredKPI.summary.totalAlarms)} mt-1`}>
            {filteredKPI.summary.totalAlarms}
          </div>
          <div className="text-[10px] text-gray-400 mt-1">Exceeding threshold</div>
        </div>
        <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-purple-500 hover:shadow-xl transition-shadow">
          <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Units Active</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">
            {Object.keys(filteredKPI.unitStats).length}
          </div>
          <div className="text-[10px] text-gray-400 mt-1">Total units</div>
        </div>
      </div>

      {/* ─── PERFORMANCE TABLE ─── */}
      <div className="bg-white rounded-2xl shadow-md p-6 mb-6 border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span>📋</span> Performance by Module
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 rounded-xl">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Module/KPI Task</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Target ព្រឹក</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Target ល្ងាច</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Remain</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Result</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Ratio</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">In System</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              <tr className="hover:bg-emerald-50/50 transition-colors">
                <td className="px-4 py-3.5 text-sm font-medium text-gray-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600"></span>
                  Restock In
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    value={editMorningRestockIn}
                    onChange={(e) => setEditMorningRestockIn(e.target.value)}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded-xl text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    value={editEveningRestockIn}
                    onChange={(e) => setEditEveningRestockIn(e.target.value)}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded-xl text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50"
                  />
                </td>
                <td className="px-4 py-3.5 text-sm text-right font-semibold text-amber-600">
                  {restockInRemain}
                </td>
                <td className="px-4 py-3.5 text-sm text-right font-semibold text-emerald-600">
                  {restockInResult}
                </td>
                <td className="px-4 py-3.5 text-sm text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-semibold text-gray-800">{restockInRatio}%</span>
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, parseFloat(restockInRatio))}%` }}></div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm text-right text-gray-500">
                  {restockInInSystem}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={handleUpdateRestockIn}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                  >
                    Update
                  </button>
                </td>
              </tr>

              <tr className="hover:bg-teal-50/50 transition-colors">
                <td className="px-4 py-3.5 text-sm font-medium text-gray-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-teal-500 to-emerald-600"></span>
                  Restock Out
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    value={editMorningRestockOut}
                    onChange={(e) => setEditMorningRestockOut(e.target.value)}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded-xl text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    value={editEveningRestockOut}
                    onChange={(e) => setEditEveningRestockOut(e.target.value)}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded-xl text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50"
                  />
                </td>
                <td className="px-4 py-3.5 text-sm text-right font-semibold text-amber-600">
                  {restockOutRemain}
                </td>
                <td className="px-4 py-3.5 text-sm text-right font-semibold text-emerald-600">
                  {restockOutResult}
                </td>
                <td className="px-4 py-3.5 text-sm text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-semibold text-gray-800">{restockOutRatio}%</span>
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, parseFloat(restockOutRatio))}%` }}></div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm text-right text-gray-500">
                  {restockOutInSystem}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={handleUpdateRestockOut}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                  >
                    Update
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
              <tr>
                <td className="px-4 py-3 text-sm text-gray-900">សរុប (TOTAL)</td>
                <td className="px-4 py-3 text-sm text-center text-gray-900">{totalRestockMorning}</td>
                <td className="px-4 py-3 text-sm text-center text-gray-900">{totalRestockEvening}</td>
                <td className="px-4 py-3 text-sm text-right text-amber-600">{totalRestockRemain}</td>
                <td className="px-4 py-3 text-sm text-right text-emerald-600">{totalRestockResult}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900">
                  <div className="flex items-center justify-end gap-2 font-bold">
                    <span>{totalRestockRatio}%</span>
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, parseFloat(totalRestockRatio))}%` }}></div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{totalRestockInSystem}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ─── FILTERS ─── */}
      <div className="bg-white rounded-2xl shadow-md p-4 mb-6 flex flex-wrap gap-4 items-center border border-gray-100">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">📂 Unit:</label>
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          >
            <option value="all">All Units ({availableUnits.length})</option>
            {availableUnits.map(unit => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">📅 Time:</label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          >
            <option value="all">All Time</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="year">Last Year</option>
          </select>
        </div>
        <div className="text-sm text-gray-500 ml-auto">
          Showing <span className="font-semibold text-gray-700">{filteredData.length}</span> records
          {selectedUnit !== 'all' && ` for ${selectedUnit}`}
          {timeRange !== 'all' && ` (${timeRange})`}
        </div>
      </div>

      {/* ─── TWO COLUMN: YEAR STATS & MONTHLY TRENDS ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <span>📅</span> Yearly Breakdown
            </h2>
          </div>
          <div className="p-4">
            {Object.keys(kpiData.yearStats).length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <div className="text-3xl mb-2">📭</div>
                <p>No year data available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(kpiData.yearStats)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .map(([year, stats]) => {
                    const rate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
                    return (
                      <div key={year} className="bg-gray-50 rounded-xl p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-gray-700">📆 {year}</span>
                          <div className="flex gap-3 text-xs">
                            <span className="text-gray-600">Total: <strong>{stats.total}</strong></span>
                            <span className="text-emerald-600">✅ {stats.completed}</span>
                            <span className="text-amber-600">⏳ {stats.pending}</span>
                            <span className="text-blue-600 font-medium">{rate.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${rate >= 70 ? 'bg-emerald-500' : rate >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${rate}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <span>📊</span> Monthly Trends
            </h2>
          </div>
          <div className="p-4 max-h-80 overflow-y-auto scrollbar-thin">
            {Object.keys(kpiData.monthlyStats).length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <div className="text-3xl mb-2">📭</div>
                <p>No monthly data available</p>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(kpiData.monthlyStats)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .slice(0, 12)
                  .map(([month, stats]) => {
                    const rate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
                    return (
                      <div key={month} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl transition-colors">
                        <span className="text-sm font-medium text-gray-600 w-16">{month}</span>
                        <div className="flex-1">
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div 
                              className={`h-2.5 rounded-full ${rate >= 70 ? 'bg-emerald-500' : rate >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${rate}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="flex gap-2 text-xs whitespace-nowrap">
                          <span className="text-gray-600">{stats.total}</span>
                          <span className="text-emerald-600">✓{stats.completed}</span>
                          <span className="text-amber-600">⏳{stats.pending}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── FOOTER ─── */}
      <div className="mt-6 text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
        <span>📊 Dashboard updated: {new Date().toLocaleString()}</span>
        <span className="mx-3">•</span>
        <span>Total units tracked: {availableUnits.length}</span>
        <span className="mx-3">•</span>
        <span>Records: {kpiData.summary.totalRequests}</span>
        <span className="mx-3">•</span>
        <span>Completion: {kpiData.summary.completionRate.toFixed(1)}%</span>
      </div>

      {renderProgressModal()}

      {createPortal(renderScreenshotReport(), document.body)}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
      `}</style>
    </div>
  );
};

export default Dashboard_Request;
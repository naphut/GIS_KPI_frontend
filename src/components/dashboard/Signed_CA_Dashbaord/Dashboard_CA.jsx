import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  sendCAToTelegram, 
  sendToAllCATelegram, 
  getAllUnits,
  getConfiguredUnits,
  hasGroupId,
  hasToken,
  getSavedTemplates,
  saveTemplate,
  deleteTemplate
} from '../../../services/telegramBot';
import { loadFromDb, saveToDb } from '../../../services/dbStore';

// Storage Keys
const STORAGE_KEYS = {
  EXPORT_CA_DATA: 'export_ca_data',
  IMPORT_CA_DATA: 'import_ca_data',
  KPI_TARGETS: 'kpi_signedca_targets',
  TELEGRAM_SETTINGS: 'kpi_signedca_telegram',
};

// Helper functions
const VALID_UNITS = [
  'BAN', 'BAT', 'CHA', 'CHH', 'KAM', 'KAN', 'KANZ1', 'KOH', 'KRA',
  'MON', 'ODD', 'PNP', 'PNPZ1', 'PNPZ2', 'PRE', 'PRH', 'PUR', 'ROT',
  'SIE', 'SIH', 'SPE', 'STU', 'SVA', 'TAK', 'THO'
];

const getUnitFromWarehouse = (warehouseName) => {
  if (!warehouseName) return 'UNKNOWN';
  const parts = warehouseName.split('_');
  if (parts.length >= 2) {
    const unit = parts[1];
    return VALID_UNITS.includes(unit) ? unit : 'OTHER';
  }
  return 'OTHER';
};

const getItemUnit = (item, isStockOut = true) => {
  if (item.unit) return item.unit;
  const wh = isStockOut ? item.exportWarehouse : item.warehouse;
  return getUnitFromWarehouse(wh);
};

const getStorageData = (key) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
};

const Dashboard_CA = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Load or initialize Stock Out data (export_ca_data)
  const [stockOutData, setStockOutData] = useState(() => {
    const data = getStorageData(STORAGE_KEYS.EXPORT_CA_DATA);
    if (!data || data.length === 0) {
      const sample = [
        { id: 1, exportNoteCode: 'SO-2026-001', exportWarehouse: 'GIS_KAM_STOCK', dateCreate: '23/06/2026', statusCA: 'Is signing' },
        { id: 2, exportNoteCode: 'SO-2026-002', exportWarehouse: 'GIS_SPE_STOCK', dateCreate: '22/06/2026', statusCA: 'Is signing' },
        { id: 3, exportNoteCode: 'SO-2026-003', exportWarehouse: 'GIS_BAN_STOCK', dateCreate: '21/06/2026', statusCA: 'Is signing' },
        { id: 4, exportNoteCode: 'SO-2026-004', exportWarehouse: 'GIS_MON_STOCK', dateCreate: '20/06/2026', statusCA: 'Unsigned' },
        { id: 5, exportNoteCode: 'SO-2026-005', exportWarehouse: 'GIS_SIE_STOCK', dateCreate: '19/06/2026', statusCA: 'Unsigned' },
      ];
      return sample;
    }
    return data;
  });

  // Load or initialize Stock In data (import_ca_data)
  const [stockInData, setStockInData] = useState(() => {
    const data = getStorageData(STORAGE_KEYS.IMPORT_CA_DATA);
    if (!data || data.length === 0) {
      const sample = [
        { id: 1, codeReceipt: 'SI-2026-001', warehouse: 'GIS_ODD_STOCK', date: '23/06/2026', statusCA: 'Is signing' },
        { id: 2, codeReceipt: 'SI-2026-002', warehouse: 'GIS_PRH_STOCK', date: '22/06/2026', statusCA: 'Is signing' },
        { id: 3, codeReceipt: 'SI-2026-003', warehouse: 'GIS_KRA_STOCK', date: '21/06/2026', statusCA: 'Is signing' },
        { id: 4, codeReceipt: 'SI-2026-004', warehouse: 'GIS_STU_STOCK', date: '20/06/2026', statusCA: 'Is signing' },
        { id: 5, codeReceipt: 'SI-2026-005', warehouse: 'GIS_TAK_STOCK', date: '19/06/2026', statusCA: 'Unsigned' },
        { id: 6, codeReceipt: 'SI-2026-006', warehouse: 'GIS_CHA_STOCK', date: '18/06/2026', statusCA: 'Unsigned' },
      ];
      return sample;
    }
    return data;
  });

  // KPI Targets State
  const [targets, setTargets] = useState(() => {
    const saved = getStorageData(STORAGE_KEYS.KPI_TARGETS);
    return saved || {
      stock_out: { morning: 0, evening: 0 },
      stock_in: { morning: 0, evening: 0 }
    };
  });

  // Load data from DB on mount
  useEffect(() => {
    const fetchDbData = async () => {
      const defaultStockOut = [
        { id: 1, exportNoteCode: 'SO-2026-001', exportWarehouse: 'GIS_KAM_STOCK', dateCreate: '23/06/2026', statusCA: 'Is signing' },
        { id: 2, exportNoteCode: 'SO-2026-002', exportWarehouse: 'GIS_SPE_STOCK', dateCreate: '22/06/2026', statusCA: 'Is signing' },
        { id: 3, exportNoteCode: 'SO-2026-003', exportWarehouse: 'GIS_BAN_STOCK', dateCreate: '21/06/2026', statusCA: 'Is signing' },
        { id: 4, exportNoteCode: 'SO-2026-004', exportWarehouse: 'GIS_MON_STOCK', dateCreate: '20/06/2026', statusCA: 'Unsigned' },
        { id: 5, exportNoteCode: 'SO-2026-005', exportWarehouse: 'GIS_SIE_STOCK', dateCreate: '19/06/2026', statusCA: 'Unsigned' },
      ];
      const dbStockOut = await loadFromDb(STORAGE_KEYS.EXPORT_CA_DATA, defaultStockOut);
      setStockOutData(dbStockOut);

      const defaultStockIn = [
        { id: 1, codeReceipt: 'SI-2026-001', warehouse: 'GIS_ODD_STOCK', date: '23/06/2026', statusCA: 'Is signing' },
        { id: 2, codeReceipt: 'SI-2026-002', warehouse: 'GIS_PRH_STOCK', date: '22/06/2026', statusCA: 'Is signing' },
        { id: 3, codeReceipt: 'SI-2026-003', warehouse: 'GIS_KRA_STOCK', date: '21/06/2026', statusCA: 'Is signing' },
        { id: 4, codeReceipt: 'SI-2026-004', warehouse: 'GIS_STU_STOCK', date: '20/06/2026', statusCA: 'Is signing' },
        { id: 5, codeReceipt: 'SI-2026-005', warehouse: 'GIS_TAK_STOCK', date: '19/06/2026', statusCA: 'Unsigned' },
        { id: 6, codeReceipt: 'SI-2026-006', warehouse: 'GIS_CHA_STOCK', date: '18/06/2026', statusCA: 'Unsigned' },
      ];
      const dbStockIn = await loadFromDb(STORAGE_KEYS.IMPORT_CA_DATA, defaultStockIn);
      setStockInData(dbStockIn);

      const dbTargets = await loadFromDb(STORAGE_KEYS.KPI_TARGETS, {
        stock_out: { morning: 0, evening: 0 },
        stock_in: { morning: 0, evening: 0 }
      });
      setTargets(dbTargets);
    };
    fetchDbData();
  }, []);

  const [editMorningStockOut, setEditMorningStockOut] = useState(targets.stock_out.morning);
  const [editEveningStockOut, setEditEveningStockOut] = useState(targets.stock_out.evening);
  const [editMorningStockIn, setEditMorningStockIn] = useState(targets.stock_in.morning);
  const [editEveningStockIn, setEditEveningStockIn] = useState(targets.stock_in.evening);

  // Sync inputs if targets state changes
  useEffect(() => {
    setEditMorningStockOut(targets.stock_out.morning);
    setEditEveningStockOut(targets.stock_out.evening);
    setEditMorningStockIn(targets.stock_in.morning);
    setEditEveningStockIn(targets.stock_in.evening);
  }, [targets]);

  const handleUpdateStockOut = () => {
    const updated = {
      ...targets,
      stock_out: { morning: parseInt(editMorningStockOut) || 0, evening: parseInt(editEveningStockOut) || 0 }
    };
    setTargets(updated);
    saveToDb(STORAGE_KEYS.KPI_TARGETS, updated);
  };

  const handleUpdateStockIn = () => {
    const updated = {
      ...targets,
      stock_in: { morning: parseInt(editMorningStockIn) || 0, evening: parseInt(editEveningStockIn) || 0 }
    };
    setTargets(updated);
    saveToDb(STORAGE_KEYS.KPI_TARGETS, updated);
  };

  // Telegram integration states
  const [customNote, setCustomNote] = useState('');
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

  const allUnits = getAllUnits();
  const configured = getConfiguredUnits();
  const totalUnits = allUnits.length;
  const configuredCount = configured.length;

  // Derive signing groups from data source
  const stockOutSigning = useMemo(() => {
    return stockOutData.filter(item => item.statusCA === 'Is signing' || item.statusCA === 'Signing');
  }, [stockOutData]);

  const stockOutUnsigned = useMemo(() => {
    return stockOutData.filter(item => item.statusCA === 'Unsigned' || !item.statusCA);
  }, [stockOutData]);

  const stockInSigning = useMemo(() => {
    return stockInData.filter(item => item.statusCA === 'Is signing' || item.statusCA === 'Signing');
  }, [stockInData]);

  const stockInUnsigned = useMemo(() => {
    return stockInData.filter(item => item.statusCA === 'Unsigned' || !item.statusCA);
  }, [stockInData]);

  // Calculate statistics
  const stats = useMemo(() => {
    const stockOutSigningTotal = stockOutSigning.length;
    const stockOutUnsignedTotal = stockOutUnsigned.length;
    const stockInSigningTotal = stockInSigning.length;
    const stockInUnsignedTotal = stockInUnsigned.length;

    const totalStockOut = stockOutSigningTotal + stockOutUnsignedTotal;
    const totalStockIn = stockInSigningTotal + stockInUnsignedTotal;
    const totalRecords = totalStockOut + totalStockIn;
    const totalSigning = stockOutSigningTotal + stockInSigningTotal;
    const totalUnsigned = stockOutUnsignedTotal + stockInUnsignedTotal;

    const stockOutRate = totalStockOut > 0 ? (stockOutSigningTotal / totalStockOut) * 100 : 0;
    const stockInRate = totalStockIn > 0 ? (stockInSigningTotal / totalStockIn) * 100 : 0;
    const totalRate = totalRecords > 0 ? (totalSigning / totalRecords) * 100 : 0;

    return {
      stockOutSigning: { total: stockOutSigningTotal },
      stockOutUnsigned: { total: stockOutUnsignedTotal },
      stockInSigning: { total: stockInSigningTotal },
      stockInUnsigned: { total: stockInUnsignedTotal },
      totalStockOut: { total: totalStockOut, signing: stockOutSigningTotal, unsigned: stockOutUnsignedTotal, rate: stockOutRate },
      totalStockIn: { total: totalStockIn, signing: stockInSigningTotal, unsigned: stockInUnsignedTotal, rate: stockInRate },
      overall: { total: totalRecords, signing: totalSigning, unsigned: totalUnsigned, rate: totalRate }
    };
  }, [stockOutSigning, stockOutUnsigned, stockInSigning, stockInUnsigned]);

  // Format number with leading zero
  const formatNumber = (num) => {
    return num.toString().padStart(2, '0');
  };

  // Get color based on rate
  const getRateColor = (rate) => {
    if (rate >= 80) return 'text-emerald-600';
    if (rate >= 50) return 'text-amber-600';
    return 'text-rose-600';
  };

  const getProgressColor = (rate) => {
    if (rate >= 80) return 'bg-emerald-500';
    if (rate >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  // Calculations for Performance Table
  const stockOutResult = stockOutSigning.length;
  const stockOutInSystem = stockOutSigning.length + stockOutUnsigned.length;
  const stockOutTarget = targets.stock_out.evening > 0 ? targets.stock_out.evening : targets.stock_out.morning;
  const stockOutRemain = stockOutTarget > 0 ? Math.max(0, stockOutTarget - stockOutResult) : stockOutUnsigned.length;
  const stockOutRatio = stockOutTarget > 0 ? ((stockOutResult / stockOutTarget) * 100).toFixed(2) : '0.00';

  const stockInResult = stockInSigning.length;
  const stockInInSystem = stockInSigning.length + stockInUnsigned.length;
  const stockInTarget = targets.stock_in.evening > 0 ? targets.stock_in.evening : targets.stock_in.morning;
  const stockInRemain = stockInTarget > 0 ? Math.max(0, stockInTarget - stockInResult) : stockInUnsigned.length;
  const stockInRatio = stockInTarget > 0 ? ((stockInResult / stockInTarget) * 100).toFixed(2) : '0.00';

  const totalMorning = targets.stock_out.morning + targets.stock_in.morning;
  const totalEvening = targets.stock_out.evening + targets.stock_in.evening;
  const totalResult = stockOutResult + stockInResult;
  const totalInSystem = stockOutInSystem + stockInInSystem;
  const totalTarget = (targets.stock_out.evening > 0 ? targets.stock_out.evening : targets.stock_out.morning) + (targets.stock_in.evening > 0 ? targets.stock_in.evening : targets.stock_in.morning);
  const totalRemain = totalTarget > 0 ? Math.max(0, totalTarget - totalResult) : (stockOutUnsigned.length + stockInUnsigned.length);
  const totalRatio = totalTarget > 0 ? ((totalResult / totalTarget) * 100).toFixed(2) : '0.00';

  const getReportData = () => {
    const allUnitsList = getAllUnits();
    const unitsMap = {};
    
    const exportTargets = getStorageData('export_ca_targets') || {};
    const importTargets = getStorageData('import_ca_targets') || {};

    const calculateDaysDiff = (dateString) => {
      if (!dateString) return 0;
      const parts = dateString.split(/[/\s:-]+/);
      if (parts.length < 3) return 0;
      let day, month, year;
      if (parts[0].length === 4) {
        year = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        day = parseInt(parts[2]);
      } else {
        day = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        year = parseInt(parts[2]);
        if (year < 100) year += 2000;
      }
      const createdDate = new Date(year, month, day);
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      const diffTime = currentDate - createdDate;
      return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    };

    allUnitsList.forEach(unit => {
      const exportTarget = exportTargets[unit]?.target || 0;
      const importTarget = importTargets[unit]?.target || 0;
      
      const targetMorning = importTarget;
      const targetEvening = exportTarget;
      const totalUnitTarget = targetMorning + targetEvening;

      const outItems = stockOutData.filter(item => getItemUnit(item, true) === unit);
      const outTotal = outItems.length;
      const outResult = outItems.filter(item => item.statusCA === 'Is signing' || item.statusCA === 'Signing').length;
      const outUnsigned = outItems.filter(item => item.statusCA === 'Unsigned' || !item.statusCA).length;
      const outRatio = outTotal > 0 ? parseFloat(((outResult / outTotal) * 100).toFixed(2)) : 100;
      
      const inItems = stockInData.filter(item => getItemUnit(item, false) === unit);
      const inTotal = inItems.length;
      const inResult = inItems.filter(item => item.statusCA === 'Is signing' || item.statusCA === 'Signing').length;
      const inUnsigned = inItems.filter(item => item.statusCA === 'Unsigned' || !item.statusCA).length;
      const inRatio = inTotal > 0 ? parseFloat(((inResult / inTotal) * 100).toFixed(2)) : 100;
      
      const overallTotal = outTotal + inTotal;
      const overallResult = outResult + inResult;
      const overallUnsigned = outUnsigned + inUnsigned;
      
      const remain = totalUnitTarget > 0 
        ? Math.max(0, totalUnitTarget - overallResult) 
        : overallUnsigned;
      
      const ratio = totalUnitTarget > 0 
        ? parseFloat(((overallResult / totalUnitTarget) * 100).toFixed(2)) 
        : (overallUnsigned === 0 && overallResult === 0 ? 100 : 0);
      
      const unsignedOutItemsList = outItems
        .filter(item => item.statusCA === 'Unsigned' || !item.statusCA)
        .map(item => ({
          code: item.exportNoteCode || item.code || '',
          daysDiff: item.daysDiff !== undefined ? item.daysDiff : calculateDaysDiff(item.dateCreate),
          warehouse: item.exportWarehouse || '-',
          statusCA: item.statusCA || 'Unsigned',
          creator: item.createRequester || '-'
        }));

      const unsignedInItemsList = inItems
        .filter(item => item.statusCA === 'Unsigned' || !item.statusCA)
        .map(item => ({
          code: item.codeReceipt || item.code || '',
          daysDiff: item.daysDiff !== undefined ? item.daysDiff : calculateDaysDiff(item.date),
          warehouse: item.warehouse || '-',
          statusCA: item.statusCA || 'Unsigned',
          creator: item.creator || '-'
        }));

      unitsMap[unit] = {
        targetMorning,
        targetEvening,
        remain,
        result: overallResult,
        ratio,
        inSystem: overallTotal,
        stockOut: {
          total: outTotal,
          result: outResult,
          unsigned: outUnsigned,
          ratio: outRatio
        },
        stockIn: {
          total: inTotal,
          result: inResult,
          unsigned: inUnsigned,
          ratio: inRatio
        },
        overall: {
          total: overallTotal,
          result: overallResult,
          unsigned: overallUnsigned,
          ratio: ratio
        },
        unsignedOutItems: unsignedOutItemsList,
        unsignedInItems: unsignedInItemsList
      };
    });
    
    return {
      totalTarget: totalTarget,
      totalResult: totalResult,
      totalRemain: totalRemain,
      totalRatio: parseFloat(totalRatio),
      totalInSystem: totalInSystem,
      stockOut: {
        total: stockOutInSystem,
        result: stockOutResult,
        unsigned: stockOutRemain,
        ratio: parseFloat(stockOutRatio)
      },
      stockIn: {
        total: stockInInSystem,
        result: stockInResult,
        unsigned: stockInRemain,
        ratio: parseFloat(stockInRatio)
      },
      overall: {
        total: totalInSystem,
        result: totalResult,
        unsigned: totalRemain,
        ratio: parseFloat(totalRatio)
      },
      units: unitsMap
    };
  };

  // Send CA reports to ALL units
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
      
      const result = await sendToAllCATelegram(data, (progress) => {
        setSendProgress(progress);
      }, customNote, abortControllerRef.current.signal);
      
      setSendResults(result.summary);
      
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

  // Send CA report to single unit
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
      const result = await sendCAToTelegram(unit, data, customNote, abortControllerRef.current.signal);
      
      if (result && result.success) {
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
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl px-6 py-6 mb-6 shadow-lg shadow-blue-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <span>📊</span> DASHBOARD CA
              </h1>
              <span className="bg-white/20 text-white text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider border border-white/30">
                🟢 Live • {currentTime.toLocaleTimeString()}
              </span>
            </div>
            <p className="text-blue-100 mt-1 text-sm">Stock Out &amp; Stock In Signing Status Overview</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="bg-white/20 text-white px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-sm">
              📅 {currentTime.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
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
              onClick={sendToAll}
              disabled={isSending || configuredCount === 0}
              className={`px-5 py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 shadow-md disabled:opacity-50 ${
                configuredCount > 0
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-200'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              title={configuredCount === 0 ? 'No provinces configured' : 'Send to all configured provinces'}
            >
              <span>📤</span>
              Send All ({configuredCount})
              {isSending && <span className="ml-1 animate-spin">⏳</span>}
            </button>
            
            <button
              onClick={() => setShowUnitSelector(!showUnitSelector)}
              disabled={isSending}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 shadow-md shadow-blue-200"
            >
              <span>📍</span>
              Send to Unit
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
                        sendReportToTelegram(unit);
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
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-blue-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Total Records</div>
              <div className="text-3xl font-bold text-gray-800 mt-1">{formatNumber(stats.overall.total)}</div>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-2xl">📊</div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <span className="text-emerald-600">✅ {stats.overall.signing} Signing</span>
            <span className="w-px h-4 bg-gray-300"></span>
            <span className="text-rose-600">❌ {stats.overall.unsigned} Unsigned</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-emerald-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Total Signing</div>
              <div className="text-3xl font-bold text-emerald-600 mt-1">{formatNumber(stats.overall.signing)}</div>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-2xl">✅</div>
          </div>
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className={`h-2.5 rounded-full ${getProgressColor(stats.overall.rate)} transition-all duration-500`} style={{ width: `${stats.overall.rate}%` }}></div>
            </div>
            <div className={`text-xs font-medium mt-1 ${getRateColor(stats.overall.rate)}`}>
              {stats.overall.rate.toFixed(1)}% Complete
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-purple-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Stock Out</div>
              <div className="text-3xl font-bold text-purple-600 mt-1">{formatNumber(stats.totalStockOut.total)}</div>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-2xl">📤</div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <span className="text-emerald-600">✅ {stats.totalStockOut.signing}</span>
            <span className="w-px h-4 bg-gray-300"></span>
            <span className="text-rose-600">❌ {stats.totalStockOut.unsigned}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-5 border-l-4 border-amber-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Stock In</div>
              <div className="text-3xl font-bold text-amber-600 mt-1">{formatNumber(stats.totalStockIn.total)}</div>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-2xl">📥</div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <span className="text-emerald-600">✅ {stats.totalStockIn.signing}</span>
            <span className="w-px h-4 bg-gray-300"></span>
            <span className="text-rose-600">❌ {stats.totalStockIn.unsigned}</span>
          </div>
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
              {/* Row 1: Stock Out Signing */}
              <tr className="hover:bg-blue-50/50 transition-colors">
                <td className="px-4 py-3.5 text-sm font-medium text-gray-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600"></span>
                  01 STOCK OUT IS SIGNING
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    value={editMorningStockOut}
                    onChange={(e) => setEditMorningStockOut(e.target.value)}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded-xl text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-gray-50"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    value={editEveningStockOut}
                    onChange={(e) => setEditEveningStockOut(e.target.value)}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded-xl text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-gray-50"
                  />
                </td>
                <td className="px-4 py-3.5 text-sm text-right font-semibold text-amber-600">
                  {stockOutRemain}
                </td>
                <td className="px-4 py-3.5 text-sm text-right font-semibold text-emerald-600">
                  {stockOutResult}
                </td>
                <td className="px-4 py-3.5 text-sm text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-semibold text-gray-800">{stockOutRatio}%</span>
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, parseFloat(stockOutRatio))}%` }}></div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm text-right text-gray-500">
                  {stockOutInSystem}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={handleUpdateStockOut}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                  >
                    Update
                  </button>
                </td>
              </tr>

              {/* Row 2: Stock In Signing */}
              <tr className="hover:bg-emerald-50/50 transition-colors">
                <td className="px-4 py-3.5 text-sm font-medium text-gray-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600"></span>
                  02 STOCK IN IS SIGNING
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    value={editMorningStockIn}
                    onChange={(e) => setEditMorningStockIn(e.target.value)}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded-xl text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-gray-50"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    value={editEveningStockIn}
                    onChange={(e) => setEditEveningStockIn(e.target.value)}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded-xl text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-gray-50"
                  />
                </td>
                <td className="px-4 py-3.5 text-sm text-right font-semibold text-amber-600">
                  {stockInRemain}
                </td>
                <td className="px-4 py-3.5 text-sm text-right font-semibold text-emerald-600">
                  {stockInResult}
                </td>
                <td className="px-4 py-3.5 text-sm text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-semibold text-gray-800">{stockInRatio}%</span>
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, parseFloat(stockInRatio))}%` }}></div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm text-right text-gray-500">
                  {stockInInSystem}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={handleUpdateStockIn}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                  >
                    Update
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
              <tr>
                <td className="px-4 py-3 text-sm text-gray-900">សរុប (TOTAL)</td>
                <td className="px-4 py-3 text-sm text-center text-gray-900">{totalMorning}</td>
                <td className="px-4 py-3 text-sm text-center text-gray-900">{totalEvening}</td>
                <td className="px-4 py-3 text-sm text-right text-amber-600">{totalRemain}</td>
                <td className="px-4 py-3 text-sm text-right text-emerald-600">{totalResult}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900">
                  <div className="flex items-center justify-end gap-2 font-bold">
                    <span>{totalRatio}%</span>
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, parseFloat(totalRatio))}%` }}></div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{totalInSystem}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ─── FOUR SECTION CARDS ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Stock Out Signing */}
        <div className="bg-white rounded-2xl shadow-md p-6 border-t-4 border-emerald-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl">✅</div>
              <div>
                <h3 className="font-bold text-gray-800">Stock Out Signing</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">01 STOCK OUT IS SIGNING</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-emerald-600">{formatNumber(stats.stockOutSigning.total)}</div>
              <div className="text-[10px] text-gray-400">Records</div>
            </div>
          </div>
          <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
            {stockOutSigning.slice(0, 5).map((item, index) => (
              <div key={index} className="flex items-center justify-between p-2.5 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors">
                <span className="text-xs font-medium text-gray-700 font-mono">{item.exportNoteCode || item.code}</span>
                <span className="text-xs text-gray-500">{item.exportWarehouse || item.warehouse}</span>
              </div>
            ))}
            {stockOutSigning.length === 0 && (
              <div className="text-center text-gray-400 py-4 text-sm">📭 No records</div>
            )}
          </div>
          <div className="mt-3 text-xs text-gray-400">Total: <strong className="text-gray-600">{stockOutSigning.length}</strong> records</div>
        </div>

        {/* Stock Out Unsigned */}
        <div className="bg-white rounded-2xl shadow-md p-6 border-t-4 border-rose-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-xl">❌</div>
              <div>
                <h3 className="font-bold text-gray-800">Stock Out Unsigned</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">STOCK OUT UNSIGNED</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-rose-600">{formatNumber(stats.stockOutUnsigned.total)}</div>
              <div className="text-[10px] text-gray-400">Records</div>
            </div>
          </div>
          <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
            {stockOutUnsigned.slice(0, 5).map((item, index) => (
              <div key={index} className="flex items-center justify-between p-2.5 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors">
                <span className="text-xs font-medium text-gray-700 font-mono">{item.exportNoteCode || item.code}</span>
                <span className="text-xs text-gray-500">{item.exportWarehouse || item.warehouse}</span>
              </div>
            ))}
            {stockOutUnsigned.length === 0 && (
              <div className="text-center text-gray-400 py-4 text-sm">📭 No records</div>
            )}
          </div>
          <div className="mt-3 text-xs text-gray-400">Total: <strong className="text-gray-600">{stockOutUnsigned.length}</strong> records</div>
        </div>

        {/* Stock In Signing */}
        <div className="bg-white rounded-2xl shadow-md p-6 border-t-4 border-emerald-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl">✅</div>
              <div>
                <h3 className="font-bold text-gray-800">Stock In Signing</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">02 STOCK IN IS SIGNING</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-emerald-600">{formatNumber(stats.stockInSigning.total)}</div>
              <div className="text-[10px] text-gray-400">Records</div>
            </div>
          </div>
          <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
            {stockInSigning.slice(0, 5).map((item, index) => (
              <div key={index} className="flex items-center justify-between p-2.5 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors">
                <span className="text-xs font-medium text-gray-700 font-mono">{item.codeReceipt || item.code}</span>
                <span className="text-xs text-gray-500">{item.warehouse}</span>
              </div>
            ))}
            {stockInSigning.length === 0 && (
              <div className="text-center text-gray-400 py-4 text-sm">📭 No records</div>
            )}
          </div>
          <div className="mt-3 text-xs text-gray-400">Total: <strong className="text-gray-600">{stockInSigning.length}</strong> records</div>
        </div>

        {/* Stock In Unsigned */}
        <div className="bg-white rounded-2xl shadow-md p-6 border-t-4 border-rose-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-xl">❌</div>
              <div>
                <h3 className="font-bold text-gray-800">Stock In Unsigned</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">STOCK IN UNSIGNED</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-rose-600">{formatNumber(stats.stockInUnsigned.total)}</div>
              <div className="text-[10px] text-gray-400">Records</div>
            </div>
          </div>
          <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
            {stockInUnsigned.slice(0, 5).map((item, index) => (
              <div key={index} className="flex items-center justify-between p-2.5 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors">
                <span className="text-xs font-medium text-gray-700 font-mono">{item.codeReceipt || item.code}</span>
                <span className="text-xs text-gray-500">{item.warehouse}</span>
              </div>
            ))}
            {stockInUnsigned.length === 0 && (
              <div className="text-center text-gray-400 py-4 text-sm">📭 No records</div>
            )}
          </div>
          <div className="mt-3 text-xs text-gray-400">Total: <strong className="text-gray-600">{stockInUnsigned.length}</strong> records</div>
        </div>
      </div>

      {/* ─── PROGRESS BARS ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span>📤</span> Stock Out Progress
          </h3>
          <div className="flex items-center gap-4 mb-2">
            <div className="flex-1">
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div className={`h-4 rounded-full ${getProgressColor(stats.totalStockOut.rate)} transition-all duration-500`} 
                     style={{ width: `${stats.totalStockOut.rate}%` }}></div>
              </div>
            </div>
            <span className={`font-bold ${getRateColor(stats.totalStockOut.rate)}`}>
              {stats.totalStockOut.rate.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>✅ <strong className="text-emerald-600">{stats.totalStockOut.signing}</strong> Signing</span>
            <span>❌ <strong className="text-rose-600">{stats.totalStockOut.unsigned}</strong> Unsigned</span>
            <span>📊 <strong className="text-gray-700">{stats.totalStockOut.total}</strong> Total</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span>📥</span> Stock In Progress
          </h3>
          <div className="flex items-center gap-4 mb-2">
            <div className="flex-1">
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div className={`h-4 rounded-full ${getProgressColor(stats.totalStockIn.rate)} transition-all duration-500`} 
                     style={{ width: `${stats.totalStockIn.rate}%` }}></div>
              </div>
            </div>
            <span className={`font-bold ${getRateColor(stats.totalStockIn.rate)}`}>
              {stats.totalStockIn.rate.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>✅ <strong className="text-emerald-600">{stats.totalStockIn.signing}</strong> Signing</span>
            <span>❌ <strong className="text-rose-600">{stats.totalStockIn.unsigned}</strong> Unsigned</span>
            <span>📊 <strong className="text-gray-700">{stats.totalStockIn.total}</strong> Total</span>
          </div>
        </div>
      </div>

      {/* ─── FOOTER STATS ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center border border-gray-100 hover:shadow-md transition-shadow">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Stock Out Signing</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {formatNumber(stats.stockOutSigning.total)}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center border border-gray-100 hover:shadow-md transition-shadow">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Stock Out Unsigned</div>
          <div className="text-2xl font-bold text-rose-600 mt-1">
            {formatNumber(stats.stockOutUnsigned.total)}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center border border-gray-100 hover:shadow-md transition-shadow">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Stock In Signing</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {formatNumber(stats.stockInSigning.total)}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center border border-gray-100 hover:shadow-md transition-shadow">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Stock In Unsigned</div>
          <div className="text-2xl font-bold text-rose-600 mt-1">
            {formatNumber(stats.stockInUnsigned.total)}
          </div>
        </div>
      </div>

      {renderProgressModal()}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
        .max-h-48 {
          max-height: 12rem;
        }
        .max-h-48::-webkit-scrollbar {
          width: 4px;
        }
        .max-h-48::-webkit-scrollbar-track {
          background: transparent;
        }
        .max-h-48::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
};

export default Dashboard_CA;
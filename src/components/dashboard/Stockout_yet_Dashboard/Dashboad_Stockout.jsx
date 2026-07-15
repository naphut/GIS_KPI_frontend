import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import Navbar from '../../common/Navbar';
import Sidebar from '../../common/Sidebar';
import { 
  sendToTelegram, 
  sendToAllTelegram, 
  sendPhotoToTelegram,
  getAllUnits,
  getConfiguredUnits,
  hasGroupId,
  hasToken,
  getSavedTemplates,
  saveTemplate,
  deleteTemplate,
  cleanWarehouseName
} from '../../../services/telegramBot';
import NO_CREATE_HAND_OVER from '../../../Page/Stockout_yet/NO_CREATE_HAND_OVER';
import { loadFromDb } from '../../../services/dbStore';
import STOCKOUT_YET_CONFIRM from '../../../Page/Stockout_yet/STOCKOUT_YET_CONFIRM';
import STOCK_OUT_NOTE_CONFIRMED from '../../../Page/Stockout_yet/stock_out_note_confirmed';

const Dashboad_Stockout = ({ isEmbedded = false, onNavigate }) => {
  const [selectedComponent, setSelectedComponent] = useState('dashboard');
  const [syncVersion, setSyncVersion] = useState(0);

  // Sync all dashboard data from database on mount
  useEffect(() => {
    const syncAllData = async () => {
      const keys = [
        'kpi_stockout_data', 'kpi_stockout_completionHistory', 'kpi_stockout_targets',
        'kpi_nocreate_data', 'kpi_nocreate_completionHistory', 'kpi_nocreate_targets', 'kpi_nocreate_confirmedStatus',
        'kpi_notconfirmed_data', 'kpi_notconfirmed_completionHistory', 'kpi_notconfirmed_targets', 'kpi_notconfirmed_confirmedStatus'
      ];
      await Promise.all(keys.map(key => loadFromDb(key)));
      setSyncVersion(prev => prev + 1);
    };
    syncAllData();
  }, []);

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
  const [selectedUnit, setSelectedUnit] = useState('BAT');
  const [showUnitSelector, setShowUnitSelector] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [sendResults, setSendResults] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [screenshotUnit, setScreenshotUnit] = useState(null);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [activeM1Items, setActiveM1Items] = useState([]);
  const [activeM2Items, setActiveM2Items] = useState([]);
  const [activeM3Items, setActiveM3Items] = useState([]);
  const [screenshotPartText, setScreenshotPartText] = useState("");
  const [screenshotTitle, setScreenshotTitle] = useState("CONFIRMED HAND OVER REPORT");
  const [summaryImageMode, setSummaryImageMode] = useState(false);
  const [isSelectingForSummary, setIsSelectingForSummary] = useState(false);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getKpis = () => {
    const allUnitsList = [
      'BAN', 'BAT', 'CHA', 'CHH', 'KAM', 'KAN', 'KANZ1', 'KOH', 'KRA',
      'MON', 'ODD', 'PNP', 'PNPZ1', 'PNPZ2', 'PRE', 'PRH', 'PUR', 'ROT',
      'SIE', 'SIH', 'SPE', 'STU', 'SVA', 'TAK', 'THO'
    ];

    // Function to get data from localStorage
    const getStorageData = (key) => {
      try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : null;
      } catch (e) {
        return null;
      }
    };

    // Module 1: STOCKOUT_YET_CONFIRM
    let m1Target = 0, m1Result = 0, m1Remain = 0;
    let m1TargetMorning = 0, m1TargetEvening = 0, m1InSystem = 0;
    try {
      const data = getStorageData('kpi_stockout_data') || [];
      const targets = getStorageData('kpi_stockout_targets') || {};
      const completionHistory = getStorageData('kpi_stockout_completionHistory') || [];
      
      const unitGroups = {};
      data.forEach(item => {
        const unit = item.unit;
        if (unit !== 'OTHER') {
          unitGroups[unit] = (unitGroups[unit] || 0) + 1;
        }
      });
      m1InSystem = data.filter(item => item.unit !== 'OTHER').length;
      
      const completedByUnit = {};
      completionHistory.forEach(c => {
        if (c.unit !== 'UNKNOWN') {
          completedByUnit[c.unit] = (completedByUnit[c.unit] || 0) + 1;
        }
      });

      allUnitsList.forEach(unit => {
        const morning = targets[unit]?.morning || 0;
        const evening = targets[unit]?.evening || 0;
        const target = evening > 0 ? evening : morning;
        const currentCount = unitGroups[unit] || 0;
        const result = completedByUnit[unit] || 0;
        const remain = target > 0 ? Math.max(0, target - result) : currentCount;
        
        m1Target += target;
        m1Result += result;
        m1Remain += remain;
        m1TargetMorning += morning;
        m1TargetEvening += evening;
      });
    } catch (e) {
      console.error('Error getting stockout data:', e);
    }

    // Module 2: NO_CREATE_HAND_OVER
    let m2Target = 0, m2Result = 0, m2Remain = 0;
    let m2TargetMorning = 0, m2TargetEvening = 0, m2InSystem = 0;
    try {
      const data = getStorageData('kpi_nocreate_data') || [];
      const targets = getStorageData('kpi_nocreate_targets') || {};
      const completionHistory = getStorageData('kpi_nocreate_completionHistory') || [];
      const confirmedStatus = getStorageData('kpi_nocreate_confirmedStatus') || {};

      const unitGroups = {};
      data.forEach(item => {
        const unit = item.unit;
        if (unit !== 'OTHER') {
          unitGroups[unit] = (unitGroups[unit] || 0) + 1;
        }
      });
      m2InSystem = data.filter(item => item.unit !== 'OTHER').length;
      
      const completedByUnit = {};
      completionHistory.forEach(c => {
        if (c.unit !== 'UNKNOWN') {
          completedByUnit[c.unit] = (completedByUnit[c.unit] || 0) + 1;
        }
      });
      Object.entries(confirmedStatus).forEach(([id, isConfirmed]) => {
        if (isConfirmed) {
          const item = data.find(d => d.id === parseInt(id));
          if (item && item.unit !== 'OTHER') {
            completedByUnit[item.unit] = (completedByUnit[item.unit] || 0) + 1;
          }
        }
      });

      allUnitsList.forEach(unit => {
        const target = targets[unit]?.target || 0;
        const currentCount = unitGroups[unit] || 0;
        const result = completedByUnit[unit] || 0;
        const remain = target > 0 ? Math.max(0, target - result) : currentCount;
        
        m2Target += target;
        m2Result += result;
        m2Remain += remain;
        m2TargetMorning += target;
        m2TargetEvening += target;
      });
    } catch (e) {
      console.error('Error getting nocreate data:', e);
    }

    // Module 3: STOCK_OUT_NOTE_CONFIRMED
    let m3Target = 0, m3Result = 0, m3Remain = 0;
    let m3TargetMorning = 0, m3TargetEvening = 0, m3InSystem = 0;
    try {
      const data = getStorageData('kpi_notconfirmed_data') || [];
      const targets = getStorageData('kpi_notconfirmed_targets') || {};
      const completionHistory = getStorageData('kpi_notconfirmed_completionHistory') || [];
      const confirmedStatus = getStorageData('kpi_notconfirmed_confirmedStatus') || {};

      const unitGroups = {};
      data.forEach(item => {
        const unit = item.unit;
        if (unit !== 'OTHER') {
          unitGroups[unit] = (unitGroups[unit] || 0) + 1;
        }
      });
      m3InSystem = data.filter(item => item.unit !== 'OTHER').length;
      
      const completedByUnit = {};
      completionHistory.forEach(c => {
        if (c.unit !== 'UNKNOWN') {
          completedByUnit[c.unit] = (completedByUnit[c.unit] || 0) + 1;
        }
      });
      Object.entries(confirmedStatus).forEach(([id, isConfirmed]) => {
        if (isConfirmed) {
          const item = data.find(d => d.id === parseInt(id));
          if (item && item.unit !== 'OTHER') {
            completedByUnit[item.unit] = (completedByUnit[item.unit] || 0) + 1;
          }
        }
      });

      allUnitsList.forEach(unit => {
        const target = targets[unit]?.target || 0;
        const currentCount = unitGroups[unit] || 0;
        const result = completedByUnit[unit] || 0;
        const remain = target > 0 ? Math.max(0, target - result) : currentCount;
        
        m3Target += target;
        m3Result += result;
        m3Remain += remain;
        m3TargetMorning += target;
        m3TargetEvening += target;
      });
    } catch (e) {
      console.error('Error getting notconfirmed data:', e);
    }

    return [
      {
        id: 1,
        task: 'STOCKOUT YET CONFIRM',
        target: m1Target,
        targetMorning: m1TargetMorning,
        targetEvening: m1TargetEvening,
        remain: m1Remain,
        result: m1Result,
        ratio: m1Target > 0 ? ((m1Result / m1Target) * 100).toFixed(2) + '%' : (m1Remain === 0 && m1Result === 0 ? '100.00%' : '0.00%'),
        inSystem: m1InSystem,
        component: 'STOCKOUT_YET_CONFIRM',
        color: 'from-blue-500 to-blue-600',
        icon: '📦',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200'
      },
      {
        id: 2,
        task: 'NO CREATE HAND OVER',
        target: m2Target,
        targetMorning: m2TargetMorning,
        targetEvening: m2TargetEvening,
        remain: m2Remain,
        result: m2Result,
        ratio: m2Target > 0 ? ((m2Result / m2Target) * 100).toFixed(2) + '%' : (m2Remain === 0 && m2Result === 0 ? '100.00%' : '0.00%'),
        inSystem: m2InSystem,
        component: 'NO_CREATE_HAND_OVER',
        color: 'from-emerald-500 to-emerald-600',
        icon: '📝',
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-200'
      },
      {
        id: 3,
        task: 'STOCK OUT NOTE - NOT CONFIRMED',
        target: m3Target,
        targetMorning: m3TargetMorning,
        targetEvening: m3TargetEvening,
        remain: m3Remain,
        result: m3Result,
        ratio: m3Target > 0 ? ((m3Result / m3Target) * 100).toFixed(2) + '%' : (m3Remain === 0 && m3Result === 0 ? '100.00%' : '0.00%'),
        inSystem: m3InSystem,
        component: 'STOCK_OUT_NOTE_CONFIRMED',
        color: 'from-purple-500 to-purple-600',
        icon: '⚠️',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200'
      }
    ];
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kpiData = useMemo(() => getKpis(), [selectedComponent, syncVersion]);

  // Load configured units on mount
  useEffect(() => {
    const units = getConfiguredUnits();
    console.log('Configured units with group IDs:', units);
  }, []);

  const allUnits = getAllUnits();

  // Calculate totals
  const totals = useMemo(() => {
    const target = kpiData.reduce((sum, item) => sum + item.target, 0);
    const targetMorning = kpiData.reduce((sum, item) => sum + item.targetMorning, 0);
    const targetEvening = kpiData.reduce((sum, item) => sum + item.targetEvening, 0);
    const result = kpiData.reduce((sum, item) => sum + item.result, 0);
    const remain = kpiData.reduce((sum, item) => sum + item.remain, 0);
    const inSystem = kpiData.reduce((sum, item) => sum + item.inSystem, 0);
    const ratio = target > 0 ? ((result / target) * 100).toFixed(2) : '0.00';
    return { target, targetMorning, targetEvening, remain, result, inSystem, ratio };
  }, [kpiData]);

  // Get data from all components
  const getReportData = () => {
    const getStockoutItems = (unitFilter = null) => {
      const data = JSON.parse(localStorage.getItem('kpi_stockout_data') || '[]');
      const completionHistory = JSON.parse(localStorage.getItem('kpi_stockout_completionHistory') || '[]');
      const remaining = data.filter(item => !completionHistory.some(c => c.exportNo === item.exportNo || c.code === item.exportNo));
      return unitFilter ? remaining.filter(item => item.unit === unitFilter) : remaining;
    };

    const getNoCreateItems = (unitFilter = null) => {
      const data = JSON.parse(localStorage.getItem('kpi_nocreate_data') || '[]');
      const completionHistory = JSON.parse(localStorage.getItem('kpi_nocreate_completionHistory') || '[]');
      const confirmedStatus = JSON.parse(localStorage.getItem('kpi_nocreate_confirmedStatus') || '{}');
      const remaining = data.filter(item => !completionHistory.some(c => c.code === item.code) && !confirmedStatus[item.code]);
      return unitFilter ? remaining.filter(item => item.unit === unitFilter) : remaining;
    };

    const getNotConfirmedItems = (unitFilter = null) => {
      const data = JSON.parse(localStorage.getItem('kpi_notconfirmed_data') || '[]');
      const completionHistory = JSON.parse(localStorage.getItem('kpi_notconfirmed_completionHistory') || '[]');
      const confirmedStatus = JSON.parse(localStorage.getItem('kpi_notconfirmed_confirmedStatus') || '{}');
      const remaining = data.filter(item => !completionHistory.some(c => c.code === item.code) && !confirmedStatus[item.code]);
      return unitFilter ? remaining.filter(item => item.unit === unitFilter) : remaining;
    };

    // Calculate unit-specific details
    const unitsMap = {};
    
    const stockoutTargets = JSON.parse(localStorage.getItem('kpi_stockout_targets') || '{}');
    const nocreateTargets = JSON.parse(localStorage.getItem('kpi_nocreate_targets') || '{}');
    const notconfirmedTargets = JSON.parse(localStorage.getItem('kpi_notconfirmed_targets') || '{}');

    const stockoutData = JSON.parse(localStorage.getItem('kpi_stockout_data') || '[]');
    const nocreateData = JSON.parse(localStorage.getItem('kpi_nocreate_data') || '[]');
    const notconfirmedData = JSON.parse(localStorage.getItem('kpi_notconfirmed_data') || '[]');

    const stockoutHistory = JSON.parse(localStorage.getItem('kpi_stockout_completionHistory') || '[]');
    const nocreateHistory = JSON.parse(localStorage.getItem('kpi_nocreate_completionHistory') || '[]');
    const notconfirmedHistory = JSON.parse(localStorage.getItem('kpi_notconfirmed_completionHistory') || '[]');

    const nocreateConfirmed = JSON.parse(localStorage.getItem('kpi_nocreate_confirmedStatus') || '{}');
    const notconfirmedConfirmed = JSON.parse(localStorage.getItem('kpi_notconfirmed_confirmedStatus') || '{}');

    const isMorning = new Date().getHours() < 12;

    allUnits.forEach(unit => {
      // Stockout stats
      const m1Morning = stockoutTargets[unit]?.morning || 0;
      const m1Evening = stockoutTargets[unit]?.evening || 0;
      const m1Target = isMorning ? m1Morning : (m1Evening > 0 ? m1Evening : m1Morning);
      const m1Count = stockoutData.filter(i => i.unit === unit).length;
      const m1Result = stockoutHistory.filter(c => c.unit === unit).length;
      const m1Remain = m1Target > 0 ? Math.max(0, m1Target - m1Result) : m1Count;

      // Nocreate stats
      const m2Morning = nocreateTargets[unit]?.morning || 0;
      const m2Evening = nocreateTargets[unit]?.evening || 0;
      const m2Target = isMorning ? m2Morning : (m2Evening > 0 ? m2Evening : m2Morning);
      const m2Count = nocreateData.filter(i => i.unit === unit).length;
      const m2Result = nocreateHistory.filter(c => c.unit === unit).length + 
                       Object.entries(nocreateConfirmed).filter(([code, confirmed]) => {
                         if (!confirmed) return false;
                         const item = nocreateData.find(d => d.code === code);
                         return item && item.unit === unit;
                       }).length;
      const m2Remain = m2Target > 0 ? Math.max(0, m2Target - m2Result) : m2Count;

      // Notconfirmed stats
      const m3Morning = notconfirmedTargets[unit]?.morning || 0;
      const m3Evening = notconfirmedTargets[unit]?.evening || 0;
      const m3Target = isMorning ? m3Morning : (m3Evening > 0 ? m3Evening : m3Morning);
      const m3Count = notconfirmedData.filter(i => i.unit === unit).length;
      const m3Result = notconfirmedHistory.filter(c => c.unit === unit).length + 
                       Object.entries(notconfirmedConfirmed).filter(([code, confirmed]) => {
                         if (!confirmed) return false;
                         const item = notconfirmedData.find(d => d.code === code);
                         return item && item.unit === unit;
                       }).length;
      const m3Remain = m3Target > 0 ? Math.max(0, m3Target - m3Result) : m3Count;

      const unitTarget = m1Target + m2Target + m3Target;
      const unitRemain = m1Remain + m2Remain + m3Remain;
      const unitResult = m1Result + m2Result + m3Result;
      const unitRatio = unitTarget > 0 ? parseFloat(((unitResult / unitTarget) * 100).toFixed(2)) : (unitRemain === 0 && unitResult === 0 ? 100 : 0);

      unitsMap[unit] = {
        target: unitTarget,
        remain: unitRemain,
        result: unitResult,
        ratio: unitRatio,
        targetMorning: m1Morning,
        targetEvening: m1Evening,
        inSystem: m1Count + m2Count + m3Count,
        stockoutYetConfirm: getStockoutItems(unit),
        noCreateHandOver: getNoCreateItems(unit),
        stockOutNoteNotConfirmed: getNotConfirmedItems(unit),
        
        // Also map to standard telegram bot keys:
        m1Target: m1Target,
        m1Morning: m1Morning,
        m1Evening: m1Evening,
        m1Result: m1Result,
        m1Remain: m1Remain,
        m1Ratio: m1Target > 0 ? parseFloat(((m1Result / m1Target) * 100).toFixed(2)) : (m1Remain === 0 && m1Result === 0 ? 100 : 0),
        m1Items: getStockoutItems(unit),
        
        m2Target: m2Target,
        m2Result: m2Result,
        m2Remain: m2Remain,
        m2Ratio: m2Target > 0 ? parseFloat(((m2Result / m2Target) * 100).toFixed(2)) : (m2Remain === 0 && m2Result === 0 ? 100 : 0),
        m2Items: getNoCreateItems(unit),
        
        m3Target: m3Target,
        m3Result: m3Result,
        m3Remain: m3Remain,
        m3Ratio: m3Target > 0 ? parseFloat(((m3Result / m3Target) * 100).toFixed(2)) : (m3Remain === 0 && m3Result === 0 ? 100 : 0),
        m3Items: getNotConfirmedItems(unit).map(item => ({
          code: item.code || '-',
          warehouse: item.handoverUnit || item.unitConfirm || '-',
          unitConfirm: item.unitConfirm || '-',
          daysDiff: item.daysDiff || 0,
          creator: item.creator || '-'
        })),
        
        totalResult: unitResult,
        totalRemain: unitRemain,
        totalRatio: unitRatio,
        totalInSystem: m1Count + m2Count + m3Count
      };
    });

    return {
      totalTarget: totals.target,
      totalRemain: totals.remain,
      totalResult: totals.result,
      totalRatio: parseFloat(totals.ratio),
      stockoutYetConfirm: getStockoutItems(),
      noCreateHandOver: getNoCreateItems(),
      stockOutNoteNotConfirmed: getNotConfirmedItems(),
      units: unitsMap
    };
  };

  // Send to ALL units
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
      
      const result = await sendToAllTelegram(data, (progress) => {
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


  const getUnitTotals = (unit) => {
    const data = getReportData();
    return data.units[unit] || {
      targetMorning: 0,
      targetEvening: 0,
      result: 0,
      remain: 0,
      ratio: '0.00',
      inSystem: 0
    };
  };

  const getUnitM1Items = (unit) => {
    const data = getReportData();
    return data.units[unit]?.m1Items || [];
  };

  const getUnitM2Items = (unit) => {
    const data = getReportData();
    return data.units[unit]?.m2Items || [];
  };

  const getUnitM3Items = (unit) => {
    const data = getReportData();
    return data.units[unit]?.m3Items || [];
  };

  const renderScreenshotReport = () => {
    if (!screenshotUnit) return null;
    
    const m1Items = activeM1Items;
    const m2Items = activeM2Items;
    const m3Items = activeM3Items;
    
    const sortedM1 = m1Items;
    const sortedM2 = m2Items;
    const sortedM3 = m3Items;
    
    // Color-coded delay badges
    const getDelayBadge = (days) => {
      const num = parseInt(days) || 0;
      if (num >= 5) {
        return <span className="bg-rose-50 text-rose-700 border border-rose-100 font-extrabold px-2 py-0.5 rounded text-[10px] inline-block text-center min-w-[30px]">+{num}d</span>;
      } else if (num >= 3) {
        return <span className="bg-amber-50 text-amber-700 border border-amber-100 font-bold px-2 py-0.5 rounded text-[10px] inline-block text-center min-w-[30px]">+{num}d</span>;
      } else {
        return <span className="bg-slate-50 text-slate-600 border border-slate-100 px-2 py-0.5 rounded text-[10px] inline-block text-center min-w-[30px]">+{num}d</span>;
      }
    };

    return (
      <div 
        id="telegram-screenshot-report" 
        style={{ 
          position: 'absolute', 
          left: '0', 
          top: '0', 
          zIndex: -9999,
          pointerEvents: 'none',
          width: '850px', 
          minHeight: '500px',
          background: '#f8fafc', 
          padding: '28px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}
      >
        {/* Main Banner */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 rounded-3xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-8">
            <svg width="180" height="180" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <div className="flex justify-between items-center relative z-10">
            <div>
              <h1 className="text-[22px] font-black tracking-tight uppercase">{screenshotTitle}</h1>
              <p className="text-xs opacity-90 mt-1 flex items-center gap-1.5">
                <span>📍 Branch/Unit:</span>
                <span className="bg-white/20 px-2.5 py-0.5 rounded-full font-bold text-sm">{screenshotUnit} {screenshotPartText}</span>
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] opacity-75 uppercase font-bold tracking-wider">Report Generated</div>
              <div className="text-sm font-bold mt-0.5">{new Date().toLocaleDateString('en-GB')}</div>
              <div className="text-xs opacity-90 font-medium">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        </div>

        {/* Dashboard Metrics Grid */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          <div className="bg-white border border-blue-100 rounded-2xl p-3 shadow-xs text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500"></div>
            <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide">🌅 Target ព្រឹក</div>
            <div className="text-lg font-black text-blue-600 mt-1">{getUnitTotals(screenshotUnit).targetMorning}</div>
          </div>
          <div className="bg-white border border-indigo-100 rounded-2xl p-3 shadow-xs text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500"></div>
            <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide">🌙 Target ល្ងាច</div>
            <div className="text-lg font-black text-indigo-600 mt-1">{getUnitTotals(screenshotUnit).targetEvening}</div>
          </div>
          <div className="bg-white border border-emerald-100 rounded-2xl p-3 shadow-xs text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500"></div>
            <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide">✅ Result</div>
            <div className="text-lg font-black text-emerald-600 mt-1">{getUnitTotals(screenshotUnit).result}</div>
          </div>
          <div className="bg-white border border-amber-100 rounded-2xl p-3 shadow-xs text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500"></div>
            <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide">📋 Remain</div>
            <div className="text-lg font-black text-amber-600 mt-1">{getUnitTotals(screenshotUnit).remain}</div>
          </div>
          <div className="bg-white border border-purple-100 rounded-2xl p-3 shadow-xs text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500"></div>
            <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide">📊 Ratio</div>
            <div className="text-lg font-black text-purple-600 mt-1">{getUnitTotals(screenshotUnit).ratio}%</div>
          </div>
          <div className="bg-white border border-cyan-100 rounded-2xl p-3 shadow-xs text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-cyan-500"></div>
            <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide">📦 In System</div>
            <div className="text-lg font-black text-cyan-600 mt-1">{getUnitTotals(screenshotUnit).inSystem}</div>
          </div>
        </div>

        {/* Module 1 Table */}
        {m1Items.length > 0 && (
          <div className="bg-white border border-gray-200/60 rounded-3xl p-5 shadow-sm mb-5">
            <h3 className="text-sm font-black text-gray-800 flex items-center justify-between pb-3 border-b border-gray-100 mb-3.5">
              <span className="flex items-center gap-2 text-slate-700">📦 1. STOCKOUT YET CONFIRM</span>
              <span className="text-amber-700 font-extrabold text-xs bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                📋 {m1Items.length} Items
              </span>
            </h3>
            <div className="overflow-hidden border border-slate-200/80 rounded-xl shadow-xs">
              <table className="min-w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-gradient-to-b from-slate-50 to-slate-100/80 text-slate-800 text-[10px] font-black border-b border-slate-200">
                    <th className="border-r border-slate-200 px-2 py-1.5 text-center w-[30px] font-extrabold uppercase">#</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[110px] font-black uppercase">Warehouse Stock out</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[115px] font-black uppercase">Export No</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[75px] text-center font-black uppercase">Date</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[90px] font-black uppercase">Stock Receiver</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[90px] font-black uppercase">Group Receiver</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[150px] font-black uppercase">Construction</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[45px] text-center font-black uppercase">Unit</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[50px] text-center font-black uppercase">Days</th>
                    <th className="px-2 py-1.5 text-center w-[40px] font-black uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="text-[9.5px] text-slate-800 font-medium divide-y divide-slate-100">
                  {sortedM1.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 odd:bg-white even:bg-slate-50/20">
                      <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold text-slate-500">{index + 1}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-800 font-mono truncate max-w-[110px]" title={item.exportCode}>{item.exportCode || '-'}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-black text-slate-900 tracking-tight font-mono">{item.exportNo}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-700 font-mono text-center">{item.realExport || '-'}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold truncate max-w-[90px] text-slate-800" title={item.stockReceiver}>{cleanWarehouseName(item.stockReceiver || '-')}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold truncate max-w-[90px] text-slate-800" title={item.groupReceiver}>{cleanWarehouseName(item.groupReceiver || '-')}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 text-slate-700 font-bold truncate max-w-[150px] font-mono text-[9px]" title={item.constructionReceiver}>{item.constructionReceiver || '-'}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold">
                        <span className="bg-indigo-50 text-indigo-800 px-1 rounded border border-indigo-100 text-[8.5px] inline-block font-black">{item.unit || '-'}</span>
                      </td>
                      <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold">{getDelayBadge(item.daysDiff)}</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="text-emerald-600 font-black text-xs">✅</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Module 2 Table */}
        {m2Items.length > 0 && (
          <div className="bg-white border border-gray-200/60 rounded-3xl p-5 shadow-sm mb-5">
            <h3 className="text-sm font-black text-gray-800 flex items-center justify-between pb-3 border-b border-gray-100 mb-3.5">
              <span className="flex items-center gap-2 text-slate-700">📝 2. NO CREATE HAND OVER</span>
              <span className="text-blue-700 font-extrabold text-xs bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                📋 {m2Items.length} Items
              </span>
            </h3>
            <div className="overflow-hidden border border-slate-200/80 rounded-xl shadow-xs">
              <table className="min-w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-gradient-to-b from-slate-50 to-slate-100/80 text-slate-800 text-[10px] font-black border-b border-slate-200">
                    <th className="border-r border-slate-200 px-2 py-1.5 text-center w-[30px] font-extrabold uppercase">#</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[120px] font-black uppercase">Code of stock-out note</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[110px] font-black uppercase">Warehouse</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[110px] font-black uppercase">Recipient</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[90px] font-black uppercase">Creator</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[75px] text-center font-black uppercase">Creating date</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[45px] text-center font-black uppercase">Unit</th>
                    <th className="px-2 py-1.5 text-center w-[50px] font-black uppercase">Days</th>
                  </tr>
                </thead>
                <tbody className="text-[9.5px] text-slate-800 font-medium divide-y divide-slate-100">
                  {sortedM2.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 odd:bg-white even:bg-slate-50/20">
                      <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold text-slate-500">{index + 1}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-black text-slate-900 tracking-tight font-mono">{item.code}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold truncate max-w-[110px] text-slate-800" title={item.warehouse}>{cleanWarehouseName(item.warehouse || '-')}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold truncate max-w-[110px] text-slate-800" title={item.recipient}>{cleanWarehouseName(item.recipient || '-')}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-700 truncate max-w-[90px]">{item.creator || '-'}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-700 font-mono text-center">{item.date || '-'}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold">
                        <span className="bg-indigo-50 text-indigo-800 px-1 rounded border border-indigo-100 text-[8.5px] inline-block font-black">{item.unit || '-'}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center font-extrabold">{getDelayBadge(item.daysDiff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Module 3 Table */}
        {m3Items.length > 0 && (
          <div className="bg-white border border-gray-200/60 rounded-3xl p-5 shadow-sm">
            <h3 className="text-sm font-black text-gray-800 flex items-center justify-between pb-3 border-b border-gray-100 mb-3.5">
              <span className="flex items-center gap-2 text-slate-700">⚠️ 3. STOCK OUT NOTE - NOT CONFIRMED</span>
              <span className="text-rose-700 font-extrabold text-xs bg-rose-50 px-3 py-1 rounded-full border border-rose-100">
                📋 {m3Items.length} Items
              </span>
            </h3>
            <div className="overflow-hidden border border-slate-200/80 rounded-xl shadow-xs">
              <table className="min-w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-gradient-to-b from-slate-50 to-slate-100/80 text-slate-800 text-[10px] font-black border-b border-slate-200">
                    <th className="border-r border-slate-200 px-2 py-1.5 text-center w-[30px] font-extrabold uppercase">#</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[120px] font-black uppercase">Code of handover minutes</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[100px] font-black uppercase">Type of handover</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[110px] font-black uppercase">Handover unit</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[110px] font-black uppercase">Unit confirm handover</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[75px] text-center font-black uppercase">Handover date</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[65px] text-center font-black uppercase">Status</th>
                    <th className="border-r border-slate-200 px-2 py-1.5 w-[45px] text-center font-black uppercase">Days</th>
                    <th className="px-2 py-1.5 text-center w-[45px] font-black uppercase">UNIT</th>
                  </tr>
                </thead>
                <tbody className="text-[9.5px] text-slate-800 font-medium divide-y divide-slate-100">
                  {sortedM3.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 odd:bg-white even:bg-slate-50/20">
                      <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold text-slate-500">{index + 1}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-black text-slate-900 tracking-tight font-mono">{item.code}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold truncate max-w-[100px] text-slate-800">{item.type || '-'}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold truncate max-w-[110px] text-slate-800" title={item.handoverUnit}>{cleanWarehouseName(item.handoverUnit || '-')}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold truncate max-w-[110px] text-slate-800" title={item.unitConfirm}>{cleanWarehouseName(item.unitConfirm || '-')}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-700 font-mono text-center">{item.date || '-'}</td>
                      <td className="border-r border-slate-100 px-2 py-1.5 text-center">
                        <span className={`px-1 py-0.5 rounded text-[8.5px] font-extrabold ${item.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>{item.status || '-'}</span>
                      </td>
                      <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold">{getDelayBadge(item.daysDiff)}</td>
                      <td className="px-2 py-1.5 text-center font-extrabold">
                        <span className="bg-indigo-50 text-indigo-800 px-1 rounded border border-indigo-100 text-[8.5px] inline-block font-black">{item.unit || '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State / All Cleared */}
        {m1Items.length === 0 && m2Items.length === 0 && m3Items.length === 0 && (
          <div className="bg-emerald-50/40 border border-emerald-100 rounded-3xl p-6 text-center text-emerald-600 font-bold text-sm flex flex-col items-center gap-2">
            <span>🎉 ALL MODULES COMPLETED</span>
            <span className="text-xs text-emerald-500 font-medium">គ្មានទិន្នន័យចាល់ឡើយ (All Items Cleared)</span>
          </div>
        )}
      </div>
    );
  };

  const generateScreenshotTasks = (unit) => {
    const m1Items = getUnitM1Items(unit);
    const m2Items = getUnitM2Items(unit);
    const m3Items = getUnitM3Items(unit);
    
    // Sort items for readability
    const sortedM1 = [...m1Items].sort((a, b) => (a.groupReceiver || '').localeCompare(b.groupReceiver || ''));
    const sortedM2 = [...m2Items].sort((a, b) => (a.recipient || '').localeCompare(b.recipient || ''));
    const sortedM3 = [...m3Items].sort((a, b) => (a.unitConfirm || '').localeCompare(b.unitConfirm || ''));

    const tasks = [];
    const chunkSize = 50;

    // Helper to chunk array
    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    if (sortedM1.length > 0) {
      const chunks = chunkArray(sortedM1, chunkSize);
      chunks.forEach((chunk, idx) => {
        tasks.push({
          m1: chunk,
          m2: [],
          m3: [],
          label: `Part ${idx + 1}/${chunks.length}`,
          title: "TEAM STEP 1"
        });
      });
    }

    if (sortedM2.length > 0) {
      const chunks = chunkArray(sortedM2, chunkSize);
      chunks.forEach((chunk, idx) => {
        tasks.push({
          m1: [],
          m2: chunk,
          m3: [],
          label: `Part ${idx + 1}/${chunks.length}`,
          title: "ASSET STEP :2"
        });
      });
    }

    if (sortedM3.length > 0) {
      const chunks = chunkArray(sortedM3, chunkSize);
      chunks.forEach((chunk, idx) => {
        tasks.push({
          m1: [],
          m2: [],
          m3: chunk,
          label: `Part ${idx + 1}/${chunks.length}`,
          title: "TEAM STEP 3"
        });
      });
    }

    if (tasks.length === 0) {
      tasks.push({
        m1: [],
        m2: [],
        m3: [],
        label: "Cleared",
        title: "CONFIRMED HAND OVER REPORT"
      });
    }

    return tasks;
  };

  const getSummaryRows = () => {
    const rows = [];
    const unitsToProcess = screenshotUnit ? [screenshotUnit] : allUnits;
    
    unitsToProcess.forEach(unit => {
      const m1Items = getUnitM1Items(unit);
      const m2Items = getUnitM2Items(unit);
      const m3Items = getUnitM3Items(unit);
      
      const teamsSet = new Set();
      m1Items.forEach(item => { if (item.groupReceiver) teamsSet.add(item.groupReceiver.trim()); });
      m2Items.forEach(item => { if (item.recipient) teamsSet.add(item.recipient.trim()); });
      m3Items.forEach(item => { if (item.unitConfirm) teamsSet.add(item.unitConfirm.trim()); });
      
      const teams = Array.from(teamsSet).sort((a, b) => a.localeCompare(b));
      
      teams.forEach(team => {
        const s1Under = m1Items.filter(item => item.groupReceiver?.trim() === team && (parseInt(item.daysDiff) || 0) <= 4).length;
        const s1Over = m1Items.filter(item => item.groupReceiver?.trim() === team && (parseInt(item.daysDiff) || 0) > 4).length;
        
        const s2Under = m2Items.filter(item => item.recipient?.trim() === team && (parseInt(item.daysDiff) || 0) <= 3).length;
        const s2Over = m2Items.filter(item => item.recipient?.trim() === team && (parseInt(item.daysDiff) || 0) > 3).length;
        
        const s3Under = m3Items.filter(item => item.unitConfirm?.trim() === team && (parseInt(item.daysDiff) || 0) <= 3).length;
        const s3Over = m3Items.filter(item => item.unitConfirm?.trim() === team && (parseInt(item.daysDiff) || 0) > 3).length;
        
        const underKpi = s1Under + s2Under + s3Under;
        const overKpi = s1Over + s2Over + s3Over;
        const total = underKpi + overKpi;
        
        rows.push({
          unit,
          team,
          s1Under,
          s1Over,
          s1Total: s1Under + s1Over,
          s2Under,
          s2Over,
          s2Total: s2Under + s2Over,
          s3Under,
          s3Over,
          s3Total: s3Under + s3Over,
          underKpi,
          overKpi,
          total
        });
      });
    });
    return rows;
  };

  const renderSummaryReport = () => {
    if (!summaryImageMode || !screenshotUnit) return null;
    
    const rows = getSummaryRows();
    const totalS1Under = rows.reduce((sum, r) => sum + r.s1Under, 0);
    const totalS1Over = rows.reduce((sum, r) => sum + r.s1Over, 0);
    const totalS1Total = totalS1Under + totalS1Over;
    
    const totalS2Under = rows.reduce((sum, r) => sum + r.s2Under, 0);
    const totalS2Over = rows.reduce((sum, r) => sum + r.s2Over, 0);
    const totalS2Total = totalS2Under + totalS2Over;
    
    const totalS3Under = rows.reduce((sum, r) => sum + r.s3Under, 0);
    const totalS3Over = rows.reduce((sum, r) => sum + r.s3Over, 0);
    const totalS3Total = totalS3Under + totalS3Over;
    
    const totalUnder = totalS1Under + totalS2Under + totalS3Under;
    const totalOver = totalS1Over + totalS2Over + totalS3Over;
    const totalAll = totalUnder + totalOver;
    
    const formatVal = (val) => val === 0 ? '-' : val;
    
    return (
      <div
        id="telegram-summary-report"
        style={{
          position: 'absolute',
          left: '0',
          top: '0',
          zIndex: -9999,
          pointerEvents: 'none',
          width: '1200px',
          background: '#f8fafc',
          padding: '32px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}
      >
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm mb-6 flex justify-between items-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500"></div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📊</span>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
                Stockout KPI Summary Report
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-semibold">
              Performance & delay summary of all active remaining items for branch: <span className="text-red-600 font-bold">{screenshotUnit}</span>
            </p>
          </div>
          <div className="text-right text-xs font-semibold text-slate-600 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100">
            <div>Date: <strong className="text-slate-900">{new Date().toLocaleDateString('en-GB')}</strong></div>
            <div className="mt-0.5">Time: <strong className="text-slate-900">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</strong></div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5 mb-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Active Teams</span>
              <span className="text-3xl font-black text-slate-800 mt-1 block">{rows.length}</span>
            </div>
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-xl text-blue-600 font-bold">
              👥
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider block">Under KPI (On-Time)</span>
              <span className="text-3xl font-black text-emerald-600 mt-1 block">{totalUnder}</span>
            </div>
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-xl text-emerald-600 font-bold">
              ✅
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-red-500 uppercase tracking-wider block">Over KPI (Delayed)</span>
              <span className="text-3xl font-black text-red-600 mt-1 block">{totalOver}</span>
            </div>
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-xl text-red-600 font-bold">
              🚨
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
          <table className="min-w-full text-center border-collapse table-fixed text-[11px] font-bold text-slate-700">
            <thead>
              <tr className="bg-gradient-to-r from-red-600 to-rose-700 text-white text-[11px] border-b border-red-700">
                <th rowSpan="2" className="border-r border-red-700/30 w-[40px] py-3.5 font-bold uppercase tracking-wider">No</th>
                <th rowSpan="2" className="border-r border-red-700/30 w-[70px] py-3.5 font-bold uppercase tracking-wider">Code</th>
                <th rowSpan="2" className="border-r border-red-700/30 w-[200px] py-3.5 text-left px-4 font-bold uppercase tracking-wider">Units name</th>
                <th colSpan="3" className="border-r border-red-700/30 py-2 font-bold uppercase tracking-wider">Sheet 01<br/><span className="text-[9px] font-normal text-white/80">Stock out not Confirm goods</span></th>
                <th colSpan="3" className="border-r border-red-700/30 py-2 font-bold uppercase tracking-wider">Sheet 02<br/><span className="text-[9px] font-normal text-white/80">Stock out not create hand over</span></th>
                <th colSpan="3" className="border-r border-red-700/30 py-2 font-bold uppercase tracking-wider">Sheet 03<br/><span className="text-[9px] font-normal text-white/80">Hand over not Confirmed</span></th>
                <th colSpan="3" className="py-2 font-bold uppercase tracking-wider">Total Summary</th>
              </tr>
              <tr className="bg-gradient-to-r from-red-600 to-rose-700 text-white text-[10px] border-b border-red-800/50">
                <th colSpan="3" className="border-r border-red-700/30 py-1.5 font-black text-amber-300">KPI = 4 DAYS</th>
                <th colSpan="3" className="border-r border-red-700/30 py-1.5 font-black text-amber-300">KPI = 3 DAYS</th>
                <th colSpan="3" className="border-r border-red-700/30 py-1.5 font-black text-amber-300">KPI = 3 DAYS</th>
                <th colSpan="3" className="py-1.5 font-black text-amber-200">KPI TARGETS</th>
              </tr>
              <tr className="bg-slate-100 text-slate-600 text-[9px] border-b border-slate-200 font-bold">
                <th className="border-r border-slate-200 py-1.5" style={{display: 'none'}}></th>
                <th className="border-r border-slate-200 py-1.5" style={{display: 'none'}}></th>
                <th className="border-r border-slate-200 py-1.5" style={{display: 'none'}}></th>
                
                <th className="border-r border-slate-200 py-2 text-emerald-600 font-bold">Day &lt;= 4</th>
                <th className="border-r border-slate-200 py-2 text-red-600 font-bold">Day &gt; 4</th>
                <th className="border-r border-slate-200 py-2 bg-slate-200/40 text-slate-800 font-bold">Total</th>
                
                <th className="border-r border-slate-200 py-2 text-emerald-600 font-bold">Day &lt;= 3</th>
                <th className="border-r border-slate-200 py-2 text-red-600 font-bold">Day &gt; 3</th>
                <th className="border-r border-slate-200 py-2 bg-slate-200/40 text-slate-800 font-bold">Total</th>
                
                <th className="border-r border-slate-200 py-2 text-emerald-600 font-bold">Day &lt;= 3</th>
                <th className="border-r border-slate-200 py-2 text-red-600 font-bold">Day &gt; 3</th>
                <th className="border-r border-slate-200 py-2 bg-slate-200/40 text-slate-800 font-bold">Total</th>
                
                <th className="border-r border-slate-200 py-2 text-emerald-600 font-bold">Under KPI</th>
                <th className="border-r border-slate-200 py-2 text-red-600 font-bold">Over KPI</th>
                <th className="py-2 bg-slate-200/80 text-slate-900 font-black">Overall Total</th>
              </tr>
              
              <tr className="bg-slate-50 text-slate-800 font-black text-[11px] border-b border-slate-300 shadow-inner">
                <td colSpan="3" className="border-r border-slate-300 text-center py-2.5 uppercase tracking-wider text-slate-950">Grand Total</td>
                <td className="border-r border-slate-200 py-2.5 text-emerald-700 font-bold">{formatVal(totalS1Under)}</td>
                <td className="border-r border-slate-200 py-2.5 text-red-700 font-bold">
                  {totalS1Over > 0 ? (
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                      {totalS1Over}
                    </span>
                  ) : '-'}
                </td>
                <td className="border-r border-slate-200 py-2.5 bg-slate-100 text-slate-900">{formatVal(totalS1Total)}</td>
                
                <td className="border-r border-slate-200 py-2.5 text-emerald-700 font-bold">{formatVal(totalS2Under)}</td>
                <td className="border-r border-slate-200 py-2.5 text-red-700 font-bold">
                  {totalS2Over > 0 ? (
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                      {totalS2Over}
                    </span>
                  ) : '-'}
                </td>
                <td className="border-r border-slate-200 py-2.5 bg-slate-100 text-slate-900">{formatVal(totalS2Total)}</td>
                
                <td className="border-r border-slate-200 py-2.5 text-emerald-700 font-bold">{formatVal(totalS3Under)}</td>
                <td className="border-r border-slate-200 py-2.5 text-red-700 font-bold">
                  {totalS3Over > 0 ? (
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                      {totalS3Over}
                    </span>
                  ) : '-'}
                </td>
                <td className="border-r border-slate-200 py-2.5 bg-slate-100 text-slate-900">{formatVal(totalS3Total)}</td>
                
                <td className="border-r border-slate-200 py-2.5 bg-slate-100/50 text-emerald-700 font-bold">{formatVal(totalUnder)}</td>
                <td className="border-r border-slate-200 py-2.5 bg-slate-100/50 text-red-700">
                  {totalOver > 0 ? (
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-red-600 text-white shadow-sm font-black">
                      {totalOver}
                    </span>
                  ) : '-'}
                </td>
                <td className="py-2.5 bg-slate-200 text-slate-950 font-black text-xs">{formatVal(totalAll)}</td>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 bg-white">
              {rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors odd:bg-white even:bg-slate-50/20 text-slate-700">
                  <td className="border-r border-slate-200 py-2 font-bold text-slate-400">{idx + 1}</td>
                  <td className="border-r border-slate-200 py-2 font-bold text-slate-800">{row.unit}</td>
                  <td className="border-r border-slate-200 py-2 text-left px-4 font-semibold text-slate-900 break-all">{row.team}</td>
                  
                  <td className="border-r border-slate-150 py-2 text-slate-600 font-medium">{formatVal(row.s1Under)}</td>
                  <td className="border-r border-slate-150 py-2">
                    {row.s1Over > 0 ? (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 font-bold border border-red-100">
                        {row.s1Over
                        }
                      </span>
                    ) : '-'}
                  </td>
                  <td className="border-r border-slate-150 py-2 bg-slate-50/50 text-slate-800 font-bold">{formatVal(row.s1Total)}</td>
                  
                  <td className="border-r border-slate-150 py-2 text-slate-600 font-medium">{formatVal(row.s2Under)}</td>
                  <td className="border-r border-slate-150 py-2">
                    {row.s2Over > 0 ? (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 font-bold border border-red-100">
                        {row.s2Over}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="border-r border-slate-150 py-2 bg-slate-50/50 text-slate-800 font-bold">{formatVal(row.s2Total)}</td>
                  
                  <td className="border-r border-slate-150 py-2 text-slate-600 font-medium">{formatVal(row.s3Under)}</td>
                  <td className="border-r border-slate-150 py-2">
                    {row.s3Over > 0 ? (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 font-bold border border-red-100">
                        {row.s3Over}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="border-r border-slate-150 py-2 bg-slate-50/50 text-slate-800 font-bold">{formatVal(row.s3Total)}</td>
                  
                  <td className="border-r border-slate-200 py-2 bg-slate-50/20 text-slate-600 font-medium">{formatVal(row.underKpi)}</td>
                  <td className="border-r border-slate-200 py-2 bg-slate-50/20">
                    {row.overKpi > 0 ? (
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold border border-red-200">
                        {row.overKpi}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="py-2 bg-slate-100 text-slate-900 font-black">{formatVal(row.total)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan="15" className="py-12 text-center text-slate-400 font-medium bg-slate-50/50 text-xs">
                    🎉 Outstanding completion! No pending stockout items found under this branch.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const sendSummaryImageScreenshot = async (unit) => {
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
      setScreenshotUnit(unit);
      setSummaryImageMode(true);

      await new Promise(resolve => setTimeout(resolve, 400));

      const element = document.getElementById('telegram-summary-report');
      if (!element) {
        throw new Error('Summary report element not found in DOM');
      }

      const offsetHeight = element.offsetHeight || 600;
      
      const canvas = await html2canvas(element, {
        useCORS: true,
        scale: 3.0,
        backgroundColor: '#ffffff',
        width: 1200,
        height: offsetHeight,
        scrollX: 0,
        scrollY: 0,
        windowWidth: document.documentElement.offsetWidth,
        windowHeight: document.documentElement.offsetHeight,
        logging: false,
        onclone: (clonedDoc) => {
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            #telegram-summary-report * {
              -webkit-font-smoothing: antialiased !important;
              -moz-osx-font-smoothing: grayscale !important;
              text-rendering: optimizeLegibility !important;
            }
          `;
          clonedDoc.head.appendChild(style);
        }
      });

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob || blob.size < 1000) {
        throw new Error('Failed to generate summary image');
      }

      const caption = `📊 <b>STOCKOUT OVERALL SUMMARY REPORT - TARGET GROUP: ${unit}</b>\n<i>Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</i>`;

      const result = await sendPhotoToTelegram(
        unit,
        blob,
        caption,
        abortControllerRef.current.signal
      );

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
        alert(`✅ Summary image sent successfully to ${unit} group!`);
      } else {
        throw new Error(result?.error || 'Failed to send summary photo to Telegram');
      }
    } catch (error) {
      console.error('Error sending summary image:', error);
      const isAbort = abortControllerRef.current.signal.aborted;
      if (!isAbort) {
        setSendProgress({
          current: 0,
          total: 1,
          unit: unit,
          status: 'failed',
          error: error.message
        });
        setSendResults({
          total: 1,
          success: 0,
          failed: 1
        });
        alert(`❌ Error sending summary image: ${error.message}`);
      }
    } finally {
      setIsSending(false);
      setScreenshotUnit(null);
      setSummaryImageMode(false);
      if (!abortControllerRef.current?.signal.aborted) {
        setTimeout(() => setShowProgressModal(false), 3000);
      }
    }
  };

  // Send single unit screenshot
  const sendReportToTelegramScreenshot = async (unit) => {
    if (isSending) return;
    
    if (!hasGroupId(unit)) {
      alert(`⚠️ No group ID configured for ${unit}. Please add it first.`);
      return;
    }
    
    setIsSending(true);
    setShowProgressModal(true);
    setSendProgress({
      current: 0,
      total: 1,
      unit: unit,
      status: 'sending'
    });
    setSendResults(null);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const tasks = generateScreenshotTasks(unit);
      setSendProgress({
        current: 1,
        total: tasks.length,
        unit: unit,
        status: 'sending'
      });

      setScreenshotUnit(unit);

      for (let i = 0; i < tasks.length; i++) {
        if (abortControllerRef.current.signal.aborted) break;

        const task = tasks[i];
        setActiveM1Items(task.m1);
        setActiveM2Items(task.m2);
        setActiveM3Items(task.m3);
        setScreenshotPartText(tasks.length > 1 ? `(${task.label})` : "");
        setScreenshotTitle(task.title);

        setSendProgress({
          current: i + 1,
          total: tasks.length,
          unit: unit,
          status: 'sending'
        });

        // Wait for rendering
        await new Promise(resolve => setTimeout(resolve, 350));

        const element = document.getElementById('telegram-screenshot-report');
        if (!element) {
          throw new Error('Screenshot element not found in DOM');
        }

        const offsetHeight = element.offsetHeight || 500;
        let scale = 3.0;
        if (offsetHeight > 1800) scale = 2.0;
        else if (offsetHeight > 1200) scale = 2.5;

        const canvas = await html2canvas(element, {
          useCORS: true,
          scale: scale,
          backgroundColor: '#f8fafc',
          width: 850,
          height: offsetHeight,
          scrollX: 0,
          scrollY: 0,
          windowWidth: document.documentElement.offsetWidth,
          windowHeight: document.documentElement.offsetHeight,
          logging: false,
          onclone: (clonedDoc) => {
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              #telegram-screenshot-report * {
                -webkit-font-smoothing: antialiased !important;
                -moz-osx-font-smoothing: grayscale !important;
                text-rendering: optimizeLegibility !important;
              }
            `;
            clonedDoc.head.appendChild(style);
          }
        });

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob || blob.size < 1000 || canvas.width < 100 || canvas.height < 100) {
          throw new Error(`Invalid screenshot generated: Canvas=${canvas.width}x${canvas.height}`);
        }

        const caption = `📊 <b>${task.title} - ${unit}</b> ${tasks.length > 1 ? `(${task.label})` : ''}\n<i>Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</i>`;

        const result = await sendPhotoToTelegram(
          unit,
          blob,
          caption,
          abortControllerRef.current.signal
        );

        if (!result || !result.success) {
          throw new Error(result?.error || 'Failed to send photo to Telegram');
        }
      }

      setSendProgress({
        current: tasks.length,
        total: tasks.length,
        unit: unit,
        status: 'success'
      });
      setSendResults({
        total: 1,
        success: 1,
        failed: 0
      });
      alert(`✅ Screenshot report sent successfully to ${unit} group!`);
    } catch (error) {
      console.error('Error generating/sending screenshot:', error);
      const isAbort = abortControllerRef.current.signal.aborted;
      if (!isAbort) {
        setSendProgress({
          current: 0,
          total: 1,
          unit: unit,
          status: 'failed',
          error: error.message
        });
        setSendResults({
          total: 1,
          success: 0,
          failed: 1
        });
        alert(`❌ Error generating/sending screenshot: ${error.message}`);
      }
    } finally {
      setIsSending(false);
      setScreenshotUnit(null);
      setActiveM1Items([]);
      setActiveM2Items([]);
      setActiveM3Items([]);
      setScreenshotPartText("");
      setScreenshotTitle("CONFIRMED HAND OVER REPORT");
      if (!abortControllerRef.current?.signal.aborted) {
        setTimeout(() => setShowProgressModal(false), 3000);
      }
    }
  };

  // Send all screenshots
  const sendToAllScreenshot = async () => {
    if (isSending) return;
    
    const configured = getConfiguredUnits();
    if (configured.length === 0) {
      alert('⚠️ No group IDs configured! Please add group IDs for at least one province.');
      return;
    }
    
    setIsSending(true);
    setShowProgressModal(true);
    setSendProgress({
      current: 0,
      total: configured.length,
      unit: 'Starting...',
      status: 'sending'
    });
    setSendResults(null);
    
    abortControllerRef.current = new AbortController();
    let successCount = 0;
    let failCount = 0;
    let completedCount = 0;
    
    try {
      setScreenshotUnit(null);

      for (const unit of configured) {
        if (abortControllerRef.current.signal.aborted) {
          break;
        }
        
        setSendProgress({
          current: completedCount + 1,
          total: configured.length,
          unit: unit,
          status: 'sending'
        });
        
        try {
          const tasks = generateScreenshotTasks(unit);
          setScreenshotUnit(unit);

          let unitSuccess = true;

          for (let i = 0; i < tasks.length; i++) {
            if (abortControllerRef.current.signal.aborted) break;

            const task = tasks[i];
            setActiveM1Items(task.m1);
            setActiveM2Items(task.m2);
            setActiveM3Items(task.m3);
            setScreenshotPartText(tasks.length > 1 ? `(${task.label})` : "");
            setScreenshotTitle(task.title);

            // Wait for rendering
            await new Promise(resolve => setTimeout(resolve, 350));
            
            const element = document.getElementById('telegram-screenshot-report');
            if (!element) {
              throw new Error('Screenshot element not found');
            }
            
            const offsetHeight = element.offsetHeight || 500;
            let scale = 3.0;
            if (offsetHeight > 1800) scale = 2.0;
            else if (offsetHeight > 1200) scale = 2.5;

            const canvas = await html2canvas(element, {
              useCORS: true,
              scale: scale,
              backgroundColor: '#f8fafc',
              width: 850,
              height: offsetHeight,
              scrollX: 0,
              scrollY: 0,
              windowWidth: document.documentElement.offsetWidth,
              windowHeight: document.documentElement.offsetHeight,
              logging: false,
              onclone: (clonedDoc) => {
                const style = clonedDoc.createElement('style');
                style.innerHTML = `
                  #telegram-screenshot-report * {
                    -webkit-font-smoothing: antialiased !important;
                    -moz-osx-font-smoothing: grayscale !important;
                    text-rendering: optimizeLegibility !important;
                  }
                `;
                clonedDoc.head.appendChild(style);
              }
            });
            
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob || blob.size < 1000 || canvas.width < 100 || canvas.height < 100) {
              throw new Error(`Invalid screenshot generated for ${unit}: Canvas=${canvas.width}x${canvas.height}`);
            }
            
            const caption = `📊 <b>${task.title} - ${unit}</b> ${tasks.length > 1 ? `(${task.label})` : ''}\n<i>Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</i>`;

            const result = await sendPhotoToTelegram(
              unit,
              blob,
              caption,
              abortControllerRef.current.signal
            );
            
            if (!result || !result.success) {
              unitSuccess = false;
            }

            await new Promise(resolve => setTimeout(resolve, 350));
          }

          if (unitSuccess) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (unitError) {
          console.error(`Error sending screenshot for ${unit}:`, unitError);
          failCount++;
        }
        
        completedCount++;
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      setSendResults({
        total: configured.length,
        success: successCount,
        failed: failCount
      });
      
      setSendProgress({
        current: configured.length,
        total: configured.length,
        unit: 'All completed!',
        status: failCount === 0 ? 'success' : 'failed'
      });
      
    } catch (error) {
      console.error('Error during send all screenshots:', error);
    } finally {
      setIsSending(false);
      setScreenshotUnit(null);
      setActiveM1Items([]);
      setActiveM2Items([]);
      setActiveM3Items([]);
      setScreenshotPartText("");
      setScreenshotTitle("CONFIRMED HAND OVER REPORT");
      if (!abortControllerRef.current?.signal.aborted) {
        setTimeout(() => setShowProgressModal(false), 4000);
      }
    }
  };

  // Send to single unit
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
      const result = await sendToTelegram(unit, data, customNote, abortControllerRef.current.signal);
      
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
                  hasError ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-green-500'
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
              <div className="flex items-center gap-2 text-green-600">
                <span>✅</span>
                <span>Sent to <strong>{progress.unit}</strong></span>
              </div>
            )}
            {progress.status === 'failed' && (
              <div className="flex items-center gap-2 text-red-600">
                <span>❌</span>
                <span>Failed to send to <strong>{progress.unit}</strong></span>
                {progress.error && <span className="text-xs text-gray-500">({progress.error})</span>}
              </div>
            )}
            {progress.status === 'error' && (
              <div className="flex items-center gap-2 text-red-600">
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
                <div className="bg-green-50 rounded-lg p-2">
                  <div className="text-green-500">Success</div>
                  <div className="text-xl font-bold text-green-600">{results.success}</div>
                </div>
                <div className="bg-red-50 rounded-lg p-2">
                  <div className="text-red-500">Failed</div>
                  <div className="text-xl font-bold text-red-600">{results.failed}</div>
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
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
              >
                🛑 Cancel Sending
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render component
  const renderComponent = () => {
    switch(selectedComponent) {
      case 'NO_CREATE_HAND_OVER':
        return <NO_CREATE_HAND_OVER />;
      case 'STOCKOUT_YET_CONFIRM':
        return <STOCKOUT_YET_CONFIRM />;
      case 'STOCK_OUT_NOTE_CONFIRMED':
        return <STOCK_OUT_NOTE_CONFIRMED />;
      default:
        const configured = getConfiguredUnits();
        const totalUnits = allUnits.length;
        const configuredCount = configured.length;
        
        return (
          <div className="w-full px-4 py-6 bg-gray-50 min-h-screen">
            {/* ─── HEADER ─── */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl px-6 py-6 mb-6 shadow-lg shadow-blue-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                      <span>📊</span> **របាយការណ៍ជូនដំណឹងអំពីការទទួលសម្ភារៈ ដែលមិនទាន់បានបញ្ជាក់ (Confirm) ការប្រគល់ក្នុងប្រព័ន្ធនៅឡើយ។**
                    </h1>
                    <span className="bg-white/20 text-white text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider border border-white/30">
                      🟢 Live • {currentTime.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-blue-100 mt-1 text-sm">REPORT OF WARMING RECIEPTS WHICH HAVEN'T &amp; CONFIRMED HAND OVER ON THE SYSTEM YET </p>
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
                    <span>📤</span> KPI Dashboard Overview
                  </h2>
                  <p className="text-sm text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span>Configured: <strong className="text-blue-600">{configuredCount}</strong>/{totalUnits} provinces</span>
                    {configuredCount === 0 && (
                      <span className="text-rose-500 font-medium">⚠️ Please add group IDs in telegramBot.js</span>
                    )}
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Send All Text */}
                  <button
                    onClick={sendToAll}
                    disabled={isSending || configuredCount === 0}
                    className={`px-5 py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 shadow-md disabled:opacity-50 font-semibold text-sm ${
                      configuredCount > 0
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-200'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    title={configuredCount === 0 ? 'No provinces configured' : 'Send text report to all configured provinces'}
                  >
                    <span>📤</span>
                    Send All ({configuredCount})
                  </button>

                  {/* Send All Screenshot */}
                  <button
                    onClick={sendToAllScreenshot}
                    disabled={isSending || configuredCount === 0}
                    className={`px-5 py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 shadow-md disabled:opacity-50 font-semibold text-sm ${
                      configuredCount > 0
                        ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 shadow-amber-200'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    title={configuredCount === 0 ? 'No provinces configured' : 'Send screenshot report to all configured provinces'}
                  >
                    <span>📸</span>
                    Send All ({configuredCount}) Screenshot
                  </button>
                  
                  {/* Send to Unit Text */}
                  <button
                    onClick={() => {
                      setScreenshotMode(false);
                      setIsSelectingForSummary(false);
                      setShowUnitSelector(!showUnitSelector);
                    }}
                    disabled={isSending}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 shadow-md shadow-blue-200 font-semibold text-sm"
                  >
                    <span>📍</span>
                    Send to Unit
                  </button>

                  {/* Send to Unit Screenshot */}
                  <button
                    onClick={() => {
                      setScreenshotMode(true);
                      setIsSelectingForSummary(false);
                      setShowUnitSelector(!showUnitSelector);
                    }}
                    disabled={isSending}
                    className="px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors flex items-center gap-2 disabled:opacity-50 shadow-md shadow-purple-200 font-semibold text-sm"
                  >
                    <span>📸</span>
                    Send to Unit Screenshot
                  </button>

                  {/* Summary Image */}
                  <button
                    onClick={() => {
                      setScreenshotMode(false);
                      setIsSelectingForSummary(true);
                      setShowUnitSelector(!showUnitSelector);
                    }}
                    disabled={isSending}
                    className="px-4 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 shadow-md shadow-rose-200 font-semibold text-sm"
                  >
                    <span>🖼</span>
                    Summary Image
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
                            setSelectedUnit(unit);
                            if (isConfigured) {
                              if (isSelectingForSummary) {
                                sendSummaryImageScreenshot(unit);
                              } else if (screenshotMode) {
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
                              : selectedUnit === unit
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-200">
                <div className="text-[10px] opacity-80 uppercase tracking-wider">Target ព្រឹក</div>
                <div className="text-2xl font-bold mt-1">{totals.targetMorning}</div>
              </div>
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-4 text-white shadow-lg shadow-indigo-200">
                <div className="text-[10px] opacity-80 uppercase tracking-wider">Target ល្ងាច</div>
                <div className="text-2xl font-bold mt-1">{totals.targetEvening}</div>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white shadow-lg shadow-amber-200">
                <div className="text-[10px] opacity-80 uppercase tracking-wider">Remain</div>
                <div className="text-2xl font-bold mt-1">{totals.remain}</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white shadow-lg shadow-emerald-200">
                <div className="text-[10px] opacity-80 uppercase tracking-wider">Result</div>
                <div className="text-2xl font-bold mt-1">{totals.result}</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg shadow-purple-200">
                <div className="text-[10px] opacity-80 uppercase tracking-wider">Ratio</div>
                <div className="text-2xl font-bold mt-1">{totals.ratio}%</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-2xl p-4 text-white shadow-lg shadow-cyan-200">
                <div className="text-[10px] opacity-80 uppercase tracking-wider">In System</div>
                <div className="text-2xl font-bold mt-1">{totals.inSystem}</div>
              </div>
            </div>

            {/* ─── PROGRESS BAR ─── */}
            <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                <span className="text-sm font-bold text-gray-800">{totals.ratio}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-emerald-400 to-blue-500 h-3 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, parseFloat(totals.ratio))}%` }}
                ></div>
              </div>
            </div>

            {/* ─── KPI PERFORMANCE TABLE ─── */}
            <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 mb-6 overflow-hidden">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span>📋</span> Performance by Module
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Module/KPI Task</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Target ព្រឹក</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Target ល្ងាច</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Remain</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Result</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Ratio</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">In System</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {kpiData.map((item) => (
                      <tr 
                        key={item.id} 
                        className="hover:bg-gray-50 cursor-pointer transition-colors" 
                        onClick={() => onNavigate ? onNavigate(item.component) : setSelectedComponent(item.component)}
                      >
                        <td className="px-4 py-3.5 text-sm font-medium text-gray-900 flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${item.color}`}></span>
                          <span className="flex items-center gap-1.5">
                            <span>{item.icon}</span>
                            {item.task}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-right text-gray-600 font-medium">{item.targetMorning}</td>
                        <td className="px-4 py-3.5 text-sm text-right text-gray-600 font-medium">{item.targetEvening}</td>
                        <td className="px-4 py-3.5 text-sm text-right font-semibold text-amber-600">{item.remain}</td>
                        <td className="px-4 py-3.5 text-sm text-right font-semibold text-emerald-600">{item.result}</td>
                        <td className="px-4 py-3.5 text-sm text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-semibold text-gray-800">{item.ratio}</span>
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div 
                                className="h-2 rounded-full bg-blue-500" 
                                style={{ width: `${Math.min(100, parseFloat(item.ratio))}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-right text-gray-500">{item.inSystem}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                    <tr>
                      <td className="px-4 py-3 text-sm text-gray-900">សរុប (TOTAL)</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{totals.targetMorning}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{totals.targetEvening}</td>
                      <td className="px-4 py-3 text-sm text-right text-amber-600">{totals.remain}</td>
                      <td className="px-4 py-3 text-sm text-right text-emerald-600">{totals.result}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{totals.ratio}%</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500">{totals.inSystem}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ─── KPI CARDS GRID ─── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {kpiData.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onNavigate ? onNavigate(item.component) : setSelectedComponent(item.component)}
                  className={`group ${item.bgColor} border ${item.borderColor} rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer hover:-translate-y-1`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-r ${item.color} flex items-center justify-center text-2xl text-white shadow-lg`}>
                      {item.icon}
                    </div>
                    <span className="text-3xl font-bold text-gray-800 group-hover:scale-110 transition-transform">
                      {item.ratio}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-1">{item.task}</h4>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div>
                      <span className="text-gray-500">Target</span>
                      <span className="block font-bold text-gray-800">{item.target}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Result</span>
                      <span className="block font-bold text-emerald-600">{item.result}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Remain</span>
                      <span className="block font-bold text-amber-600">{item.remain}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">In System</span>
                      <span className="block font-bold text-blue-600">{item.inSystem}</span>
                    </div>
                  </div>
                  <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5">
                    <div 
                      className={`h-1.5 rounded-full bg-gradient-to-r ${item.color}`}
                      style={{ width: `${Math.min(100, parseFloat(item.ratio))}%` }}
                    ></div>
                  </div>
                  <div className="mt-3 text-xs text-blue-600 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                    <span>View Details</span>
                    <span>➔</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
    }
  };

  if (isEmbedded) {
    return (
      <div key={selectedComponent} className="w-full bg-gray-50 min-h-screen animate-fadeIn">
        {renderComponent()}
        {renderProgressModal()}
        {createPortal(renderScreenshotReport(), document.body)}
        {createPortal(renderSummaryReport(), document.body)}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar onSelect={setSelectedComponent} selected={selectedComponent} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main key={selectedComponent} className="flex-1 overflow-y-auto bg-gray-50 animate-fadeIn">
          {renderComponent()}
          {renderProgressModal()}
        </main>
      </div>
      {createPortal(renderScreenshotReport(), document.body)}
      {createPortal(renderSummaryReport(), document.body)}
    </div>
  );
};

export default Dashboad_Stockout;
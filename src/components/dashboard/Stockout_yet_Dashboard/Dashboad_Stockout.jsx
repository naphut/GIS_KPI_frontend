import React, { useState, useEffect, useMemo, useRef } from 'react';
import Navbar from '../../common/Navbar';
import Sidebar from '../../common/Sidebar';
import { 
  sendToTelegram, 
  sendToAllTelegram, 
  getAllUnits,
  getConfiguredUnits,
  hasGroupId,
  hasToken,
  getSavedTemplates,
  saveTemplate,
  deleteTemplate
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
      const remaining = data.filter(item => !completionHistory.some(c => c.code === item.code) && !confirmedStatus[item.id]);
      return unitFilter ? remaining.filter(item => item.unit === unitFilter) : remaining;
    };

    const getNotConfirmedItems = (unitFilter = null) => {
      const data = JSON.parse(localStorage.getItem('kpi_notconfirmed_data') || '[]');
      const completionHistory = JSON.parse(localStorage.getItem('kpi_notconfirmed_completionHistory') || '[]');
      const confirmedStatus = JSON.parse(localStorage.getItem('kpi_notconfirmed_confirmedStatus') || '{}');
      const remaining = data.filter(item => !completionHistory.some(c => c.code === item.code) && !confirmedStatus[item.id]);
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

    allUnits.forEach(unit => {
      // Stockout stats
      const m1Morning = stockoutTargets[unit]?.morning || 0;
      const m1Evening = stockoutTargets[unit]?.evening || 0;
      const m1Target = m1Evening > 0 ? m1Evening : m1Morning;
      const m1Count = stockoutData.filter(i => i.unit === unit).length;
      const m1Result = stockoutHistory.filter(c => c.unit === unit).length;
      const m1Remain = m1Target > 0 ? Math.max(0, m1Target - m1Result) : m1Count;

      // Nocreate stats
      const m2Target = nocreateTargets[unit]?.target || 0;
      const m2Count = nocreateData.filter(i => i.unit === unit).length;
      const m2Result = nocreateHistory.filter(c => c.unit === unit).length + 
                       Object.entries(nocreateConfirmed).filter(([id, confirmed]) => {
                         if (!confirmed) return false;
                         const item = nocreateData.find(d => d.id === parseInt(id));
                         return item && item.unit === unit;
                       }).length;
      const m2Remain = m2Target > 0 ? Math.max(0, m2Target - m2Result) : m2Count;

      // Notconfirmed stats
      const m3Target = notconfirmedTargets[unit]?.target || 0;
      const m3Count = notconfirmedData.filter(i => i.unit === unit).length;
      const m3Result = notconfirmedHistory.filter(c => c.unit === unit).length + 
                       Object.entries(notconfirmedConfirmed).filter(([id, confirmed]) => {
                         if (!confirmed) return false;
                         const item = notconfirmedData.find(d => d.id === parseInt(id));
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
                  <button
                    onClick={sendToAll}
                    disabled={isSending || configuredCount === 0}
                    className={`px-5 py-2.5 rounded-xl transition-all duration-200 flex items-center gap-2 shadow-md disabled:opacity-50 font-semibold text-sm ${
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
                            setSelectedUnit(unit);
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
    </div>
  );
};

export default Dashboad_Stockout;
import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { loadFromDb, saveToDb, clearStore, isStoreDraft } from '../../services/dbStore';

// Storage Keys
const STORAGE_KEYS = {
  DATA: 'restock_out_data',
  COMPLETION: 'restock_out_completionHistory',
  TARGETS: 'restock_out_targets',
  TARGET_HISTORY: 'restock_out_targetHistory',
  CONFIRMED: 'restock_out_confirmedStatus',
};

// Helper functions
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
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const extractYearFromDate = (dateString) => {
  if (!dateString) return '';
  const parts = dateString.split(/[/\s:]+/);
  if (parts.length >= 3) {
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    return year.toString();
  }
  return '';
};

// ============================================================
// 🎯 UNIT EXTRACTION LOGIC (FIXED - Working)
// ============================================================

// 1. ចាប់យក Unit ពី Request Export Code (អាទិភាពទី១)
const getUnitFromRequestExportCode = (requestExportCode) => {
  if (!requestExportCode) return null;
  
  const upper = requestExportCode.toUpperCase().replace(/FB_TEAMC/g, 'FBC').replace(/FB_TEAM/g, 'FBC').replace(/FBC012/g, 'FBC12');
  
  let unitPart = '';
  
  if (upper.startsWith('YCX')) {
    let afterPrefix = upper;
    if (upper.startsWith('YCXKGIS_')) afterPrefix = upper.substring(8);
    else if (upper.startsWith('YCXGIS_')) afterPrefix = upper.substring(7);
    else if (upper.startsWith('YCXK')) afterPrefix = upper.substring(4);
    else if (upper.startsWith('YCX_')) afterPrefix = upper.substring(4);
    else if (upper.startsWith('YCX')) afterPrefix = upper.substring(3);
    
    const parts = afterPrefix.split(/[_/]/);
    if (parts.length > 0) unitPart = parts[0];
  } else {
    const parts = upper.split('_');
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].includes('GIS')) {
        if (i + 1 < parts.length) {
          const nextPart = parts[i + 1];
          const subParts = nextPart.split('/');
          unitPart = subParts[0];
          break;
        }
      }
    }
  }
  
  if (!unitPart) return null;
  
  // FBC → KANZ1, PNPZ1, PNPZ2
  if (unitPart.includes('FBC')) {
    if (unitPart.startsWith('KAN_')) return 'KANZ1';
    if (unitPart.startsWith('PNP_')) {
      const fbcNum = unitPart.match(/FBC(\d+)/);
      if (fbcNum) {
        const num = parseInt(fbcNum[1]);
        if ([1, 3, 5, 6, 7, 10, 11, 13, 14].includes(num)) return 'PNPZ1';
        if ([2, 4, 8, 9, 12].includes(num)) return 'PNPZ2';
      }
      return 'PNPZ1';
    }
  }
  
  // SOS → KAN, PNP
  if (unitPart.includes('SOS')) {
    if (unitPart.startsWith('KAN_')) return 'KAN';
    if (unitPart.startsWith('PNP_')) return 'PNP';
  }
  
  // PLA → KAN, PNP
  if (unitPart.includes('PLA')) {
    if (unitPart.startsWith('KAN_')) return 'KAN';
    if (unitPart.startsWith('PNP_')) return 'PNP';
  }
  
  // TEC → KAN, PNP
  if (unitPart.includes('TEC')) {
    if (unitPart.startsWith('KAN_')) return 'KAN';
    if (unitPart.startsWith('PNP_')) return 'PNP';
  }
  
  const unitMatch = unitPart.match(/^([A-Z]+)/);
  if (unitMatch && unitMatch[1]) {
    const unit = unitMatch[1];
    if (VALID_UNITS.includes(unit)) return unit;
    if (unit === 'KANZ') return 'KANZ1';
    if (unit === 'PNPZ') return 'PNPZ1';
  }
  
  return null;
};

// 2. ចាប់យក Unit ពី Command Export Code (អាទិភាពទី២)
const getUnitFromCommandExportCode = (commandExportCode) => {
  if (!commandExportCode) return null;
  
  const upper = commandExportCode.toUpperCase().replace(/FB_TEAMC/g, 'FBC').replace(/FB_TEAM/g, 'FBC').replace(/FBC012/g, 'FBC12');
  if (!upper.includes('GIS')) return null;
  
  let unitPart = '';
  
  if (upper.startsWith('LXK') || upper.startsWith('PXK')) {
    const afterPrefix = upper.substring(3);
    const parts = afterPrefix.split('/');
    if (parts.length > 0) {
      const codePart = parts[0];
      if (codePart.includes('_')) {
        const subParts = codePart.split('_');
        for (let i = 0; i < subParts.length; i++) {
          if (subParts[i].includes('GIS')) {
            if (i + 1 < subParts.length) {
              unitPart = subParts[i + 1];
              break;
            }
          }
        }
      }
    }
  }
  
  if (!unitPart) return null;
  
  // FBC → KANZ1, PNPZ1, PNPZ2
  if (unitPart.includes('FBC')) {
    if (unitPart.startsWith('KAN_')) return 'KANZ1';
    if (unitPart.startsWith('PNP_')) {
      const fbcNum = unitPart.match(/FBC(\d+)/);
      if (fbcNum) {
        const num = parseInt(fbcNum[1]);
        if ([1, 3, 5, 6, 7, 10, 11, 13, 14].includes(num)) return 'PNPZ1';
        if ([2, 4, 8, 9, 12].includes(num)) return 'PNPZ2';
      }
      return 'PNPZ1';
    }
  }
  
  // SOS → KAN, PNP
  if (unitPart.includes('SOS')) {
    if (unitPart.startsWith('KAN_')) return 'KAN';
    if (unitPart.startsWith('PNP_')) return 'PNP';
  }
  
  const unitMatch = unitPart.match(/^([A-Z]+)/);
  if (unitMatch && unitMatch[1]) {
    const unit = unitMatch[1];
    if (VALID_UNITS.includes(unit)) return unit;
    if (unit === 'KANZ') return 'KANZ1';
    if (unit === 'PNPZ') return 'PNPZ1';
  }
  
  return null;
};

// 3. ចាប់យក Unit ពី Note Export Code (អាទិភាពទី៣)
const getUnitFromNoteExportCode = (noteExportCode) => {
  if (!noteExportCode) return null;
  
  const upper = noteExportCode.toUpperCase().replace(/FB_TEAMC/g, 'FBC').replace(/FB_TEAM/g, 'FBC').replace(/FBC012/g, 'FBC12');
  
  // GIS_XXX_
  const match = upper.match(/^GIS_([A-Z0-9]+)_/);
  if (match && match[1]) {
    const unit = match[1];
    if (VALID_UNITS.includes(unit)) return unit;
    if (unit === 'KANZ') return 'KANZ1';
    if (unit === 'PNPZ') return 'PNPZ1';
  }
  
  // FBC → KANZ1, PNPZ1
  if (upper.includes('FBC')) {
    if (upper.includes('KAN')) return 'KANZ1';
    if (upper.includes('PNP')) {
      const fbcMatch = upper.match(/FBC(\d+)/);
      if (fbcMatch) {
        const num = parseInt(fbcMatch[1]);
        if ([2, 4, 8, 9, 12].includes(num)) return 'PNPZ2';
        if ([1, 3, 5, 6, 7, 10, 11, 13, 14].includes(num)) return 'PNPZ1';
      }
      return 'PNPZ1';
    }
  }
  
  // SOS → KAN, PNP
  if (upper.includes('SOS')) {
    if (upper.includes('KAN')) return 'KAN';
    if (upper.includes('PNP')) return 'PNP';
  }
  
  // PLA → KAN, PNP
  if (upper.includes('PLA')) {
    if (upper.includes('KAN')) return 'KAN';
    if (upper.includes('PNP')) return 'PNP';
  }
  
  for (const unit of VALID_UNITS) {
    if (upper.includes(`_${unit}_`) || upper.includes(`GIS_${unit}_`)) {
      return unit;
    }
  }
  
  return null;
};

// 4. ចាប់យក Unit ពី Group Request (អាទិភាពទី៤)
const getUnitFromGroupRequest = (groupRequest) => {
  if (!groupRequest) return null;
  
  const upper = groupRequest.toUpperCase().replace(/FB_TEAMC/g, 'FBC').replace(/FB_TEAM/g, 'FBC').replace(/FBC012/g, 'FBC12');
  
  const match = upper.match(/^GIS_([A-Z0-9]+)_/);
  if (match && match[1]) {
    const unit = match[1];
    if (VALID_UNITS.includes(unit)) return unit;
    if (unit === 'KANZ') return 'KANZ1';
    if (unit === 'PNPZ') return 'PNPZ1';
  }
  
  if (upper.includes('FBC')) {
    if (upper.includes('KAN')) return 'KANZ1';
    if (upper.includes('PNP')) {
      const fbcMatch = upper.match(/FBC(\d+)/);
      if (fbcMatch) {
        const num = parseInt(fbcMatch[1]);
        if ([2, 4, 8, 9, 12].includes(num)) return 'PNPZ2';
        if ([1, 3, 5, 6, 7, 10, 11, 13, 14].includes(num)) return 'PNPZ1';
      }
      return 'PNPZ1';
    }
  }
  
  if (upper.includes('SOS')) {
    if (upper.includes('KAN')) return 'KAN';
    if (upper.includes('PNP')) return 'PNP';
  }
  
  return null;
};

// 5. ចាប់យក Unit ពី Stock Out (អាទិភាពទី៥)
const getUnitFromStockOut = (stockOut) => {
  if (!stockOut) return null;
  
  const upper = stockOut.toUpperCase();
  
  const match = upper.match(/^([A-Z]+)_STOCK_/);
  if (match && match[1]) {
    const unit = match[1];
    if (VALID_UNITS.includes(unit)) return unit;
  }
  
  for (const unit of VALID_UNITS) {
    if (upper.includes(`_${unit}_`) || upper.startsWith(unit)) {
      return unit;
    }
  }
  
  return null;
};

// 6. មុខងារចាប់យក Unit សំខាន់ (Main) - ពិនិត្យ 5 ប្រភពតាមលំដាប់
const getUnit = (requestExportCode, commandExportCode, noteExportCode, groupRequest, stockOut) => {
  console.log('🔍 Checking 5 sources for unit:', {
    requestExportCode,
    commandExportCode,
    noteExportCode,
    groupRequest,
    stockOut
  });
  
  // អាទិភាពទី 1: Request Export Code
  const unitFromRequest = getUnitFromRequestExportCode(requestExportCode);
  if (unitFromRequest && VALID_UNITS.includes(unitFromRequest)) {
    console.log(`✅ Unit from Request Export Code: ${unitFromRequest}`);
    return unitFromRequest;
  }
  
  // អាទិភាពទី 2: Command Export Code
  const unitFromCommand = getUnitFromCommandExportCode(commandExportCode);
  if (unitFromCommand && VALID_UNITS.includes(unitFromCommand)) {
    console.log(`✅ Unit from Command Export Code: ${unitFromCommand}`);
    return unitFromCommand;
  }
  
  // អាទិភាពទី 3: Note Export Code
  const unitFromNote = getUnitFromNoteExportCode(noteExportCode);
  if (unitFromNote && VALID_UNITS.includes(unitFromNote)) {
    console.log(`✅ Unit from Note Export Code: ${unitFromNote}`);
    return unitFromNote;
  }
  
  // អាទិភាពទី 4: Group Request
  const unitFromGroup = getUnitFromGroupRequest(groupRequest);
  if (unitFromGroup && VALID_UNITS.includes(unitFromGroup)) {
    console.log(`✅ Unit from Group Request: ${unitFromGroup}`);
    return unitFromGroup;
  }
  
  // អាទិភាពទី 5: Stock Out
  const unitFromStock = getUnitFromStockOut(stockOut);
  if (unitFromStock && VALID_UNITS.includes(unitFromStock)) {
    console.log(`✅ Unit from Stock Out: ${unitFromStock}`);
    return unitFromStock;
  }
  
  console.log('❌ No unit found from any source');
  return null;
};

export const Restock_out = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const isLoaded = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [data, setData] = useState(() => getStorageData(STORAGE_KEYS.DATA) || []);
  const [completionHistory, setCompletionHistory] = useState(() => getStorageData(STORAGE_KEYS.COMPLETION) || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAlarmModal, setShowAlarmModal] = useState(false);
  const [alarmThreshold, setAlarmThreshold] = useState(7);
  const [dismissedItems, setDismissedItems] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteData, setPasteData] = useState('');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showKPIModal, setShowKPIModal] = useState(false);
  const [showTargetHistoryModal, setShowTargetHistoryModal] = useState(false);
  const [targets, setTargets] = useState(() => getStorageData(STORAGE_KEYS.TARGETS) || {});
  const [targetHistory, setTargetHistory] = useState(() => getStorageData(STORAGE_KEYS.TARGET_HISTORY) || []);
  const [editingTarget, setEditingTarget] = useState(null);
  const [kpiViewMode, setKpiViewMode] = useState('all');
  const [kpiSortBy, setKpiSortBy] = useState('unit');
  const [kpiSortOrder, setKpiSortOrder] = useState('asc');
  const [confirmedStatus, setConfirmedStatus] = useState(() => getStorageData(STORAGE_KEYS.CONFIRMED) || {});

  // Pagination & Days Filter State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [daysFilter, setDaysFilter] = useState('ALL');
  const [daysSortOrder, setDaysSortOrder] = useState('none');

  // Load data from DB on mount
  useEffect(() => {
    const fetchDbData = async () => {
      const dbData = await loadFromDb(STORAGE_KEYS.DATA, []);
      setData(dbData);
      
      const dbCompletion = await loadFromDb(STORAGE_KEYS.COMPLETION, []);
      setCompletionHistory(dbCompletion);

      const dbTargets = await loadFromDb(STORAGE_KEYS.TARGETS, {});
      setTargets(dbTargets);

      const dbTargetHistory = await loadFromDb(STORAGE_KEYS.TARGET_HISTORY, []);
      setTargetHistory(dbTargetHistory);

      const dbConfirmed = await loadFromDb(STORAGE_KEYS.CONFIRMED, {});
      setConfirmedStatus(dbConfirmed);
      
      isLoaded.current = true;
    };
    fetchDbData();
  }, []);

  // Sync to database
  useEffect(() => {
    if (isLoaded.current) {
      saveToDb(STORAGE_KEYS.DATA, data);
    }
  }, [data]);

  useEffect(() => {
    if (isLoaded.current) {
      saveToDb(STORAGE_KEYS.COMPLETION, completionHistory);
    }
  }, [completionHistory]);

  useEffect(() => {
    if (isLoaded.current) {
      saveToDb(STORAGE_KEYS.TARGETS, targets);
    }
  }, [targets]);

  useEffect(() => {
    if (isLoaded.current) {
      saveToDb(STORAGE_KEYS.TARGET_HISTORY, targetHistory);
    }
  }, [targetHistory]);

  useEffect(() => {
    if (isLoaded.current) {
      saveToDb(STORAGE_KEYS.CONFIRMED, confirmedStatus);
    }
  }, [confirmedStatus]);

  // Columns for Restock_out
  const columns = [
    { key: 'no', label: 'Nº', width: 'w-10' },
    { key: 'requestExportCode', label: 'Request export code', width: 'whitespace-nowrap min-w-[170px]' },
    { key: 'commandExportCode', label: 'Command export code', width: 'whitespace-nowrap min-w-[170px]' },
    { key: 'noteExportCode', label: 'Note export code', width: 'whitespace-nowrap min-w-[170px]' },
    { key: 'groupRequest', label: 'Group request', width: 'whitespace-nowrap' },
    { key: 'createDate', label: 'Create date', width: 'w-24' },
    { key: 'stockOut', label: 'Stock out', width: 'whitespace-nowrap min-w-[150px]' },
    { key: 'stockReceive', label: 'Stock receive', width: 'whitespace-nowrap' },
    { key: 'receivingUnit', label: 'Receiving Unit', width: 'whitespace-nowrap' },
    { key: 'creator', label: 'Creator', width: 'whitespace-nowrap' },
    { key: 'status', label: 'Status', width: 'whitespace-nowrap' },
    { key: 'statusCA', label: 'Status CA', width: 'whitespace-nowrap' },
    { key: 'unit', label: 'Unit', width: 'w-20' },
    { key: 'daysDiff', label: 'Days', width: 'w-16' },
    { key: 'year', label: 'Year', width: 'w-16' },
  ];

  // Helper functions
  const getStatusCABadge = (statusCA) => {
    const s = (statusCA || '').toUpperCase();
    if (s.includes('UNSIGNED') || s.includes('CHƯា') || s.includes('CHUA') || s.includes('CHƯA')) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-[10px] font-bold bg-rose-600 text-white animate-pulse border border-rose-700 shadow-sm">
          🚨 {statusCA}
        </span>
      );
    }
    if (s.includes('IS SIGNING') || s.includes('ISSIGNING') || s.includes('ĐANG') || s.includes('DANG')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          ✍️ {statusCA}
        </span>
      );
    }
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">❓ {statusCA}</span>;
  };

  const getStatusBadge = (status) => {
    const isCompleted = status?.includes('Actual Export all') || status?.includes('Thực xuất hết');
    if (isCompleted) {
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">✅ {status}</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800">⏳ {status}</span>;
  };

  const getWarehouseBadge = (warehouse) => {
    if (warehouse && warehouse.toUpperCase().includes('GIS')) {
      return <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-800">{warehouse}</span>;
    }
    return <span className="text-gray-600">{warehouse}</span>;
  };

  const playAlarmSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.3;
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        audioContext.close();
      }, 500);
    } catch (e) {
      console.log('Audio not supported');
    }
  };

  const showNotification = (message, type = 'alarm') => {
    const colors = {
      alarm: 'bg-rose-600',
      success: 'bg-emerald-600',
      info: 'bg-blue-600',
      warning: 'bg-amber-500'
    };
    const icons = {
      alarm: '🚨',
      success: '✅',
      info: '📊',
      warning: '⚠️'
    };
    const titles = {
      alarm: 'ALARM DETECTED!',
      success: 'Success!',
      info: 'Info',
      warning: 'Warning'
    };

    const notification = document.createElement('div');
    notification.className = `fixed top-20 right-4 z-50 p-4 rounded-2xl shadow-2xl transform transition-all duration-500 animate-slideIn ${colors[type] || 'bg-gray-600'} text-white max-w-sm`;
    notification.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="text-2xl animate-bounce">${icons[type] || '📌'}</div>
        <div class="flex-1">
          <div class="font-bold text-sm">${titles[type] || 'Notification'}</div>
          <div class="text-xs opacity-90 whitespace-pre-line">${message}</div>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="text-white/70 hover:text-white text-lg leading-none">✕</button>
      </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 4000);
  };

  const autoCreateTargetForUnit = (unit, dataCount) => {
    const newTarget = Math.max(dataCount, 1);
    const currentHour = new Date().getHours();
    const isMorning = currentHour < 12;
    const period = isMorning ? 'morning' : 'evening';

    setTargets(prev => ({
      ...prev,
      [unit]: {
        ...prev[unit],
        [period]: newTarget,
        lastUpdated: new Date().toISOString()
      }
    }));

    setTargetHistory(prev => [{
      id: Date.now(),
      unit: unit,
      period: period,
      oldTarget: null,
      newTarget: newTarget,
      changedAt: new Date().toISOString(),
      changedBy: 'System (Auto)',
      reason: `Auto-created target based on ${dataCount} record(s)`
    }, ...prev]);
    return newTarget;
  };

  const updateTargetWithHistory = (unit, period, newTargetValue) => {
    const oldTarget = targets[unit]?.[period] || 0;
    const newTarget = parseInt(newTargetValue) || 0;
    if (oldTarget === newTarget) return;
    setTargets(prev => ({
      ...prev,
      [unit]: {
        ...prev[unit],
        [period]: newTarget,
        lastUpdated: new Date().toISOString()
      }
    }));
    setTargetHistory(prev => [{
      id: Date.now(),
      unit: unit,
      period: period,
      oldTarget: oldTarget,
      newTarget: newTarget,
      changedAt: new Date().toISOString(),
      changedBy: 'User',
      reason: `Manual target adjustment for ${period === 'morning' ? 'ព្រឹក' : 'ល្ងាច'}`
    }, ...prev]);
    showNotification(`📊 Target (${period === 'morning' ? 'ព្រឹក' : 'ល្ងាច'}) for ${unit} changed from ${oldTarget} to ${newTarget}`, 'info');
  };

  const processImport = async (newRawData) => {
    const isDraft = await isStoreDraft(STORAGE_KEYS.DATA);
    if (isDraft) {
      showNotification('⚠️ Current draft is not completed. New import is ignored.', 'warning');
      return;
    }
    
    console.log('📥 Processing import with data:', newRawData);
    
    const filteredData = newRawData.filter(item => {
      const isGISRequest = item.requestExportCode && item.requestExportCode.toUpperCase().includes('GIS');
      const isGISCreator = item.creator && item.creator.toUpperCase().includes('GIS');
      const isGIS = isGISRequest || isGISCreator;
      
      const isStatusOK = item.status && item.status === 'Command not created';
      const unit = getUnit(
        item.requestExportCode,
        item.commandExportCode,
        item.noteExportCode,
        item.groupRequest,
        item.stockOut
      );
      const isValidUnit = unit !== null && VALID_UNITS.includes(unit);
      
      console.log('🔍 Filtering item:', {
        requestExportCode: item.requestExportCode,
        unit,
        isValidUnit,
        isGIS,
        isStatusOK
      });
      
      return isGIS && isStatusOK && isValidUnit;
    });

    console.log('✅ Filtered data:', filteredData);

    if (filteredData.length === 0) {
      showNotification('⚠️ No valid records found! (GIS + Command not created + Valid Unit)', 'warning');
      return;
    }

    const currentCodes = new Set(data.map(item => item.requestExportCode));
    const newCodesSet = new Set(filteredData.map(item => item.requestExportCode));
    
    const processedNewData = filteredData.map((item, index) => {
      const unit = getUnit(
        item.requestExportCode,
        item.commandExportCode,
        item.noteExportCode,
        item.groupRequest,
        item.stockOut
      );
      const daysDiff = calculateDaysDiff(item.createDate);
      const year = extractYearFromDate(item.createDate);
      
      return {
        id: Math.max(...data.map(d => d.id), 0, index) + index + 1,
        no: index + 1,
        requestExportCode: item.requestExportCode || '',
        commandExportCode: item.commandExportCode || '',
        noteExportCode: item.noteExportCode || '',
        groupRequest: item.groupRequest || '',
        createDate: item.createDate || '',
        stockOut: item.stockOut || '',
        stockReceive: item.stockReceive || '',
        receivingUnit: item.receivingUnit || '',
        creator: item.creator || '',
        status: item.status || '',
        statusCA: item.statusCA || '',
        unit: unit,
        daysDiff: daysDiff,
        year: year,
        isCompleted: true
      };
    });
    
    const unitsInNewData = {};
    processedNewData.forEach(item => {
      if (item.unit && VALID_UNITS.includes(item.unit)) {
        unitsInNewData[item.unit] = (unitsInNewData[item.unit] || 0) + 1;
      }
    });
    
    const existingUnits = new Set(Object.keys(targets));
    const newUnitsFound = [];
    Object.keys(unitsInNewData).forEach(unit => {
      if (!existingUnits.has(unit)) {
        newUnitsFound.push(unit);
        autoCreateTargetForUnit(unit, unitsInNewData[unit]);
        showNotification(`🎯 Auto-created target for ${unit}: ${unitsInNewData[unit]}`, 'info');
      }
    });
    
    const completedCodesArray = [...currentCodes].filter(code => !newCodesSet.has(code));
    if (completedCodesArray.length > 0) {
      const newCompletions = completedCodesArray.map(code => {
        const foundItem = data.find(item => item.requestExportCode === code);
        return { 
          requestExportCode: code, 
          completedAt: new Date().toISOString(), 
          unit: foundItem?.unit || 'UNKNOWN' 
        };
      });
      setCompletionHistory(prev => [...newCompletions, ...prev]);
      completedCodesArray.forEach(code => {
        showNotification(`✅ COMPLETED: ${code} has been cleared! +1 Result`, 'success');
      });
      playAlarmSound();
    }
    
    setData(processedNewData);
    showNotification(`📊 Import Summary:\n✅ Completed: ${completedCodesArray.length}\n🆕 New Added: ${filteredData.length}\n🎯 New Units: ${newUnitsFound.length > 0 ? newUnitsFound.join(', ') : 'None'}`, 'info');
    return { completedCount: completedCodesArray.length, newCount: filteredData.length, newUnits: newUnitsFound };
  };

  const calculateKPIData = useMemo(() => {
    const unitGroups = {};
    data.forEach(item => {
      const unit = item.unit;
      if (unit && VALID_UNITS.includes(unit)) {
        if (!unitGroups[unit]) {
          unitGroups[unit] = { codes: new Set(), unit: unit, count: 0, completed: 0 };
        }
        unitGroups[unit].codes.add(item.requestExportCode);
        unitGroups[unit].count++;
        if (item.isCompleted) {
          unitGroups[unit].completed++;
        }
      }
    });
    
    const completedByUnit = {};
    completionHistory.forEach(completion => {
      if (completion.unit && VALID_UNITS.includes(completion.unit)) {
        completedByUnit[completion.unit] = (completedByUnit[completion.unit] || 0) + 1;
      }
    });
    
    Object.entries(confirmedStatus).forEach(([id, isConfirmed]) => {
      if (isConfirmed) {
        const item = data.find(d => d.id === parseInt(id));
        if (item && item.unit && VALID_UNITS.includes(item.unit)) {
          completedByUnit[item.unit] = (completedByUnit[item.unit] || 0) + 1;
        }
      }
    });
    
    const kpiData = [];
    let grandTargetMorning = 0;
    let grandTargetEvening = 0;
    let grandRemain = 0;
    let grandResult = 0;
    let grandTotalRecords = 0;
    
    VALID_UNITS.forEach(unit => {
      const morningTarget = targets[unit]?.morning || 0;
      const eveningTarget = targets[unit]?.evening || 0;
      const target = eveningTarget > 0 ? eveningTarget : morningTarget;
      const currentCount = unitGroups[unit]?.count || 0;
      const completedCount = completedByUnit[unit] || 0;
      const result = completedCount;
      const remain = target > 0 ? Math.max(0, target - result) : currentCount;
      let ratio = 0;
      if (target > 0) ratio = (result / target) * 100;
      else if (currentCount === 0 && result === 0) ratio = 100;
      
      let status = 'No Data';
      if (currentCount > 0 || result > 0 || target > 0) {
        if (remain === 0 && target > 0) status = 'Completed';
        else if (ratio >= 80) status = 'Good';
        else if (ratio >= 50) status = 'Warning';
        else if (target > 0 && ratio < 50 && ratio > 0) status = 'Critical';
        else if (target === 0 && currentCount > 0) status = 'No Target';
      }
      
      kpiData.push({
        unit, morningTarget, eveningTarget, target, remain, result, ratio: Math.min(100, ratio), total: currentCount,
        status, hasData: currentCount > 0 || result > 0, isNew: !targets[unit] && currentCount > 0,
        hasChange: morningTarget !== eveningTarget && eveningTarget > 0
      });
      
      grandTargetMorning += morningTarget;
      grandTargetEvening += eveningTarget;
      grandRemain += remain;
      grandResult += result;
      grandTotalRecords += currentCount;
    });
    
    let filteredData = kpiData;
    if (kpiViewMode === 'active') filteredData = kpiData.filter(item => item.hasData && item.remain > 0);
    else if (kpiViewMode === 'completed') filteredData = kpiData.filter(item => item.hasData && item.remain === 0 && item.target > 0);
    
    filteredData.sort((a, b) => {
      let aVal, bVal;
      switch (kpiSortBy) {
        case 'ratio': aVal = a.ratio; bVal = b.ratio; break;
        case 'remain': aVal = a.remain; bVal = b.remain; break;
        case 'result': aVal = a.result; bVal = b.result; break;
        case 'morning': aVal = a.morningTarget; bVal = b.morningTarget; break;
        case 'evening': aVal = a.eveningTarget; bVal = b.eveningTarget; break;
        case 'total': aVal = a.total; bVal = b.total; break;
        default: aVal = a.unit; bVal = b.unit;
      }
      return kpiSortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    
    return {
      data: filteredData,
      allData: kpiData,
      summary: {
        targetMorning: grandTargetMorning,
        targetEvening: grandTargetEvening,
        remain: grandRemain,
        result: grandResult,
        ratio: grandTargetEvening > 0 ? (grandResult / grandTargetEvening) * 100 : 0,
        totalRecords: grandTotalRecords,
        activeUnits: kpiData.filter(item => item.hasData).length,
        completedUnits: kpiData.filter(item => item.hasData && item.remain === 0 && item.target > 0).length
      }
    };
  }, [data, targets, completionHistory, confirmedStatus, kpiViewMode, kpiSortBy, kpiSortOrder]);

  const parsePastedData = (text) => {
    const rows = text.split(/\r?\n/);
    const parsedRows = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].trim();
      if (!row) continue;
      const cells = row.split(/\t| {2,}/);
      if (cells.length >= 8) {
        const firstCell = cells[0].trim().replace(/\.$/, '');
        const isSequence = /^\d+$/.test(firstCell);
        const offset = isSequence ? 1 : 0;
        
        if (cells.length - offset >= 8) {
          parsedRows.push({
            requestExportCode: cells[offset + 0] || '',
            commandExportCode: cells[offset + 1] || '',
            noteExportCode: cells[offset + 2] || '',
            groupRequest: cells[offset + 3] || '',
            createDate: cells[offset + 4] || '',
            stockOut: cells[offset + 5] || '',
            stockReceive: cells[offset + 6] || '',
            receivingUnit: cells[offset + 7] || '',
            creator: cells[offset + 8] || '',
            status: cells[offset + 9] || '',
            statusCA: cells[offset + 10] || ''
          });
        }
      }
    }
    return parsedRows;
  };

  const handleSmartImport = () => {
    const parsedData = parsePastedData(pasteData);
    if (parsedData.length === 0) {
      showNotification('No valid data found to import!', 'warning');
      return;
    }
    processImport(parsedData);
    setShowPasteModal(false);
    setPasteData('');
  };

  const updateCell = (id, field, value) => {
    const updatedData = data.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'createDate') {
          updated.daysDiff = calculateDaysDiff(value);
          updated.year = extractYearFromDate(value);
        }
        if (field === 'requestExportCode' || field === 'commandExportCode' || 
            field === 'noteExportCode' || field === 'groupRequest' || field === 'stockOut') {
          const unit = getUnit(
            field === 'requestExportCode' ? value : item.requestExportCode,
            field === 'commandExportCode' ? value : item.commandExportCode,
            field === 'noteExportCode' ? value : item.noteExportCode,
            field === 'groupRequest' ? value : item.groupRequest,
            field === 'stockOut' ? value : item.stockOut
          );
          updated.unit = unit && VALID_UNITS.includes(unit) ? unit : null;
        }
        if (field === 'status') {
          updated.isCompleted = value === 'Command not created';
        }
        return updated;
      }
      return item;
    });
    setData(updatedData);
  };

  const clearAllData = async () => {
    if (window.confirm('⚠️ Are you sure you want to delete ALL data?')) {
      setData([]);
      setCompletionHistory([]);
      setTargets({});
      setConfirmedStatus({});
      
      // Clear localStorage immediately
      localStorage.removeItem(STORAGE_KEYS.DATA);
      localStorage.removeItem(STORAGE_KEYS.COMPLETION);
      localStorage.removeItem(STORAGE_KEYS.TARGETS);
      localStorage.removeItem(STORAGE_KEYS.CONFIRMED);
      
      // Show notification instantly
      showNotification('All data cleared!', 'warning');
      
      // Clear DB stores in background
      Promise.all([
        clearStore(STORAGE_KEYS.DATA),
        clearStore(STORAGE_KEYS.COMPLETION),
        clearStore(STORAGE_KEYS.TARGETS),
        clearStore(STORAGE_KEYS.CONFIRMED)
      ]).catch(err => {
        console.error("Error clearing DB store:", err);
      });
    }
  };

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) return;
    if (window.confirm(`⚠️ Delete ${selectedRows.size} row(s)?`)) {
      const deletedCodes = data.filter(item => selectedRows.has(item.id)).map(item => item.requestExportCode);
      const newCompletions = deletedCodes.map(code => ({
        requestExportCode: code, completedAt: new Date().toISOString(),
        unit: data.find(item => item.requestExportCode === code)?.unit || 'UNKNOWN'
      }));
      setCompletionHistory(prev => [...newCompletions, ...prev]);
      const newData = data.filter(item => !selectedRows.has(item.id));
      setData(newData.map((item, index) => ({ ...item, no: index + 1, id: index + 1 })));
      setSelectedRows(new Set());
      showNotification(`${deletedCodes.length} item(s) marked as Completed!`, 'success');
      playAlarmSound();
    }
  };

  const updateTarget = (unit, period, newTarget) => {
    updateTargetWithHistory(unit, period, newTarget);
    setEditingTarget(null);
  };

  const handleSort = (sortBy) => {
    if (kpiSortBy === sortBy) setKpiSortOrder(kpiSortOrder === 'asc' ? 'desc' : 'asc');
    else { setKpiSortBy(sortBy); setKpiSortOrder('asc'); }
  };

  const startEdit = (id, field, value) => setEditingCell({ id, field, value });
  const saveEdit = (id, field, newValue) => { updateCell(id, field, newValue); setEditingCell(null); };
  const handleKeyPress = (e, id, field) => {
    if (e.key === 'Enter') saveEdit(id, field, e.target.value);
    else if (e.key === 'Escape') setEditingCell(null);
  };

  const toggleRowSelection = (id) => setSelectedRows(prev => {
    const newSet = new Set(prev);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    return newSet;
  });
  const toggleSelectAll = () => {
    if (selectedRows.size === filteredData.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(filteredData.map(item => item.id)));
  };

  const exportToExcel = () => {
    const exportData = filteredData.map(item => ({
      'Nº': item.no,
      'Request export code': item.requestExportCode,
      'Command export code': item.commandExportCode,
      'Note export code': item.noteExportCode,
      'Group request': item.groupRequest,
      'Create date': item.createDate,
      'Stock out': item.stockOut,
      'Stock receive': item.stockReceive,
      'Receiving Unit': item.receivingUnit,
      'Creator': item.creator,
      'Status': item.status,
      'Status CA': item.statusCA,
      'Unit': item.unit || '-',
      "Q'ty of day": item.daysDiff,
      'Year': item.year
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    const colWidths = Object.keys(exportData[0] || {}).map(key => {
      const maxLength = Math.max(
        key.toString().length,
        ...exportData.map(row => (row[key] !== undefined && row[key] !== null ? row[key].toString().length : 0))
      );
      return { wch: Math.min(Math.max(maxLength + 3, 10), 50) };
    });
    ws['!cols'] = colWidths;
    
    for (let cell in ws) {
      if (cell[0] === '!') continue;
      if (ws[cell] && typeof ws[cell] === 'object') {
        if (!ws[cell].s) ws[cell].s = {};
        ws[cell].s.alignment = { wrapText: true, vertical: 'top' };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Restock Out Data');
    XLSX.writeFile(wb, `restock_out_data_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('📎 Export completed!', 'success');
  };

  const exportKPItoExcel = () => {
    const exportData = calculateKPIData.allData.map(item => ({
      'Unit': item.unit, 
      'Target ព្រឹក': item.morningTarget, 
      'Target ល្ងាច': item.eveningTarget, 
      'Remain': item.remain,
      'Result': item.result, 
      'Ratio (%)': item.ratio.toFixed(1),
      'In System': item.total, 
      'Status': item.status
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    const colWidths = Object.keys(exportData[0] || {}).map(key => {
      const maxLength = Math.max(
        key.toString().length,
        ...exportData.map(row => (row[key] !== undefined && row[key] !== null ? row[key].toString().length : 0))
      );
      return { wch: Math.min(Math.max(maxLength + 3, 10), 50) };
    });
    ws['!cols'] = colWidths;
    
    for (let cell in ws) {
      if (cell[0] === '!') continue;
      if (ws[cell] && typeof ws[cell] === 'object') {
        if (!ws[cell].s) ws[cell].s = {};
        ws[cell].s.alignment = { wrapText: true, vertical: 'top' };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Restock Out KPI');
    XLSX.writeFile(wb, `restock_out_kpi_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('📎 KPI Export completed!', 'success');
  };

  // 🎯 FILTER: Only show records with valid units
  const filteredData = useMemo(() => {
    let filtered = data;
    filtered = filtered.filter(item => 
      item.unit && VALID_UNITS.includes(item.unit)
    );

    // 🗓️ Days Filter
    if (daysFilter !== 'ALL') {
      if (daysFilter === '0') {
        filtered = filtered.filter(item => (item.daysDiff || 0) === 0);
      } else if (daysFilter === '1-3') {
        filtered = filtered.filter(item => (item.daysDiff || 0) >= 1 && (item.daysDiff || 0) <= 3);
      } else if (daysFilter === '4-6') {
        filtered = filtered.filter(item => (item.daysDiff || 0) >= 4 && (item.daysDiff || 0) <= 6);
      } else if (daysFilter === '>=4') {
        filtered = filtered.filter(item => (item.daysDiff || 0) >= 4);
      } else if (daysFilter === '>=7') {
        filtered = filtered.filter(item => (item.daysDiff || 0) >= 7);
      }
    }

    if (searchTerm) {
      const term = searchTerm.trim().toLowerCase();
      const isTermUnit = VALID_UNITS.some(u => u.toLowerCase() === term) || term === 'other';

      filtered = filtered.filter(item => {
        if (isTermUnit) {
          return (item.unit || '').toLowerCase() === term;
        }
        return (
          item.requestExportCode?.toLowerCase().includes(term) ||
          item.commandExportCode?.toLowerCase().includes(term) ||
          item.noteExportCode?.toLowerCase().includes(term) ||
          item.groupRequest?.toLowerCase().includes(term) ||
          item.createDate?.toLowerCase().includes(term) ||
          item.stockOut?.toLowerCase().includes(term) ||
          item.stockReceive?.toLowerCase().includes(term) ||
          item.receivingUnit?.toLowerCase().includes(term) ||
          item.creator?.toLowerCase().includes(term) ||
          item.status?.toLowerCase().includes(term) ||
          item.statusCA?.toLowerCase().includes(term) ||
          item.unit?.toLowerCase().includes(term) ||
          item.team?.toLowerCase().includes(term)
        );
      });
    }

    // ↕️ Days Sorting
    if (daysSortOrder !== 'none') {
      filtered = [...filtered].sort((a, b) => {
        const aDays = a.daysDiff || 0;
        const bDays = b.daysDiff || 0;
        return daysSortOrder === 'desc' ? bDays - aDays : aDays - bDays;
      });
    }

    return filtered;
  }, [data, searchTerm, daysFilter, daysSortOrder]);

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [filteredData.length, totalPages, currentPage]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const alarmItems = useMemo(() => {
    return filteredData.filter(item => item.daysDiff >= alarmThreshold && !dismissedItems.has(item.id));
  }, [filteredData, alarmThreshold, dismissedItems]);

  const [alarmSearchTerm, setAlarmSearchTerm] = useState('');
  const [selectedAlarmUnit, setSelectedAlarmUnit] = useState('');

  const alarmUnits = useMemo(() => {
    const units = alarmItems.map(item => item.unit).filter(Boolean);
    return [...new Set(units)].sort();
  }, [alarmItems]);

  const filteredAlarmItems = useMemo(() => {
    let filtered = alarmItems;
    if (selectedAlarmUnit) {
      filtered = filtered.filter(item => item.unit === selectedAlarmUnit);
    }
    if (alarmSearchTerm.trim()) {
      const term = alarmSearchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item.unit?.toLowerCase().includes(term) ||
        item.requestExportCode?.toLowerCase().includes(term) ||
        item.stockOut?.toLowerCase().includes(term) ||
        item.creator?.toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [alarmItems, alarmSearchTerm, selectedAlarmUnit]);

  const copyAlarmsToClipboard = () => {
    if (filteredAlarmItems.length === 0) return;
    const text = filteredAlarmItems.map(item => 
      `${item.unit}\n| Request Code: ${item.requestExportCode || '-'}\n📅 Date: ${item.createDate || '-'} | Year: ${item.year || '-'}\nReceiving Unit: ${item.receivingUnit || '-'}\nCreator: ${item.creator || '-'}\nQ'ty of day: +${item.daysDiff || 0}`
    ).join('\n\n');
    navigator.clipboard.writeText(text);
    showNotification('📋 Alarm list copied to clipboard!', 'success');
  };

  useEffect(() => {
    setData(prevData => {
      let changed = false;
      const updated = prevData.map(item => {
        const currentDaysDiff = calculateDaysDiff(item.createDate);
        const currentYear = extractYearFromDate(item.createDate);
        const currentUnit = getUnit(
          item.requestExportCode,
          item.commandExportCode,
          item.noteExportCode,
          item.groupRequest,
          item.stockOut
        );
        const validUnit = currentUnit && VALID_UNITS.includes(currentUnit) ? currentUnit : null;
        if (item.daysDiff !== currentDaysDiff || item.year !== currentYear || item.unit !== validUnit) {
          changed = true;
          return { ...item, daysDiff: currentDaysDiff, year: currentYear, unit: validUnit };
        }
        return item;
      });
      return changed ? updated : prevData;
    });
  }, []);

  useEffect(() => {
    if (alarmItems.length > 0) {
      let shownIds = new Set();
      try {
        const stored = sessionStorage.getItem('shown_restock_out_alarms');
        if (stored) shownIds = new Set(JSON.parse(stored));
      } catch (e) {}

      const newAlarms = alarmItems.filter(item => !shownIds.has(item.id));
      if (newAlarms.length > 0) {
        setShowAlarmModal(true);
        playAlarmSound();
        alarmItems.forEach(item => shownIds.add(item.id));
        try {
          sessionStorage.setItem('shown_restock_out_alarms', JSON.stringify([...shownIds]));
        } catch (e) {}
      }
    }
  }, [alarmItems]);

  const getStatusBadgeKPI = (status) => {
    const config = {
      'Completed': { icon: '✅', bg: 'bg-emerald-100', text: 'text-emerald-800' },
      'Good': { icon: '📈', bg: 'bg-blue-100', text: 'text-blue-800' },
      'Warning': { icon: '⚠️', bg: 'bg-amber-100', text: 'text-amber-800' },
      'Critical': { icon: '🚨', bg: 'bg-rose-100', text: 'text-rose-800' },
      'No Target': { icon: '❓', bg: 'bg-orange-100', text: 'text-orange-800' },
      'No Data': { icon: '📭', bg: 'bg-gray-100', text: 'text-gray-500' }
    };
    const c = config[status] || config['No Data'];
    return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>{c.icon} {status}</span>;
  };

  const alarmCount = alarmItems.length;

  // ─── MODALS ───
  const renderTargetHistoryModal = () => {
    if (!showTargetHistoryModal) return null;
    return (
      <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col border border-gray-100 animate-scaleIn">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
            <div className="flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📜</span>
                <h2 className="text-xl font-bold">Target Change History</h2>
              </div>
              <button onClick={() => setShowTargetHistoryModal(false)} className="text-white/80 hover:text-white text-2xl transition-colors">✕</button>
            </div>
          </div>
          <div className="p-6 overflow-y-auto flex-1 bg-white">
            {targetHistory.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-5xl mb-3">📭</div>
                <p className="text-base font-medium">No target changes recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {targetHistory.map(history => (
                  <div key={history.id} className="bg-gray-50 rounded-xl p-4 border-l-4 border-blue-500 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-lg text-gray-800">{history.unit}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {history.oldTarget !== null ? (
                            <>Changed from <span className="line-through text-rose-500 font-medium">{history.oldTarget}</span> → <span className="text-emerald-600 font-bold">{history.newTarget}</span></>
                          ) : (<>Auto-created target: <span className="text-emerald-600 font-bold">{history.newTarget}</span></>)}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{history.reason} | By: {history.changedBy}</div>
                      </div>
                      <div className="text-xs text-gray-400 font-medium">{new Date(history.changedAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
            <button onClick={() => setShowTargetHistoryModal(false)} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all shadow-sm">Close</button>
          </div>
        </div>
      </div>
    );
  };

  const renderKPIModal = () => {
    if (!showKPIModal) return null;
    return (
      <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col border border-gray-100 animate-scaleIn">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
            <div className="flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <h2 className="text-xl font-bold text-white">KPI Dashboard - Restock Out Performance</h2>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowTargetHistoryModal(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-xl text-sm transition-colors">📜 History</button>
                <button onClick={() => setShowKPIModal(false)} className="text-white/80 hover:text-white text-2xl transition-colors">✕</button>
              </div>
            </div>
          </div>
          <div className="p-6 overflow-y-auto flex-1 bg-white">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">Target ព្រឹក</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.targetMorning}</div>
              </div>
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">Target ល្ងាច</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.targetEvening}</div>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">Remaining</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.remain}</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">Result</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.result}</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">Ratio</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.ratio.toFixed(1)}%</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-2xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">In System</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.totalRecords}</div>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-1.5 font-medium">
                <span>Overall Progress (based on Evening Target)</span>
                <span className="font-bold text-gray-800">{calculateKPIData.summary.ratio.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden shadow-inner">
                <div className="bg-gradient-to-r from-emerald-500 to-blue-500 h-4 rounded-full transition-all duration-500" style={{ width: `${calculateKPIData.summary.ratio}%` }}></div>
              </div>
            </div>

            <div className="flex gap-2 mb-4 border-b border-gray-100 pb-2">
              <button onClick={() => setKpiViewMode('all')} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${kpiViewMode === 'all' ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>📋 All ({calculateKPIData.allData.length})</button>
              <button onClick={() => setKpiViewMode('active')} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${kpiViewMode === 'active' ? 'bg-amber-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>🔄 Active</button>
              <button onClick={() => setKpiViewMode('completed')} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${kpiViewMode === 'completed' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>✅ Completed</button>
            </div>

            <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700" onClick={() => handleSort('unit')}>
                        Unit {kpiSortBy === 'unit' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700" onClick={() => handleSort('morning')}>
                        ព្រឹក {kpiSortBy === 'morning' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700" onClick={() => handleSort('evening')}>
                        ល្ងាច {kpiSortBy === 'evening' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700" onClick={() => handleSort('remain')}>
                        Remain {kpiSortBy === 'remain' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700" onClick={() => handleSort('result')}>
                        Result {kpiSortBy === 'result' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700" onClick={() => handleSort('ratio')}>
                        Ratio {kpiSortBy === 'ratio' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('total')}>
                        In System {kpiSortBy === 'total' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {calculateKPIData.data.map((item) => (
                      <tr key={item.unit} className={`hover:bg-gray-50/80 transition-colors ${item.hasChange ? 'bg-amber-50/50' : ''}`}>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                          {item.unit}
                          {item.hasChange && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">📊 Changed</span>}
                          {item.isNew && <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">🆕 New</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {editingTarget === `${item.unit}-morning` ? (
                            <input type="number" defaultValue={item.morningTarget} autoFocus onBlur={(e) => { updateTarget(item.unit, 'morning', e.target.value); setEditingTarget(null); }} className="w-20 px-2 py-1 text-right border border-gray-300 rounded-lg text-sm font-semibold bg-white text-gray-800 focus:ring-2 focus:ring-purple-500 focus:outline-none" />
                          ) : (
                            <span className="cursor-pointer hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors text-gray-700 font-semibold" onClick={() => setEditingTarget(`${item.unit}-morning`)}>{item.morningTarget || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {editingTarget === `${item.unit}-evening` ? (
                            <input type="number" defaultValue={item.eveningTarget} autoFocus onBlur={(e) => { updateTarget(item.unit, 'evening', e.target.value); setEditingTarget(null); }} className="w-20 px-2 py-1 text-right border border-gray-300 rounded-lg text-sm font-semibold bg-white text-gray-800 focus:ring-2 focus:ring-purple-500 focus:outline-none" />
                          ) : (
                            <span className={`cursor-pointer hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors text-gray-700 font-semibold ${item.hasChange ? 'font-bold text-purple-600' : ''}`} onClick={() => setEditingTarget(`${item.unit}-evening`)}>{item.eveningTarget || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right"><span className={`font-semibold ${item.remain > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{item.remain}</span></td>
                        <td className="px-4 py-3 text-sm text-right text-emerald-600 font-bold">{item.result}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-bold text-gray-700">{item.ratio.toFixed(1)}%</span>
                            <div className="w-16 bg-gray-100 rounded-full h-2">
                              <div className={`h-2 rounded-full transition-all duration-300 ${item.ratio >= 80 ? 'bg-emerald-500' : item.ratio >= 50 ? 'bg-amber-500' : item.ratio > 0 ? 'bg-rose-500' : 'bg-gray-300'}`} style={{ width: `${item.ratio}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-500 font-medium">{item.total}</td>
                        <td className="px-4 py-3 text-center">{getStatusBadgeKPI(item.status)}</td>
                        <td className="px-4 py-3 text-center font-bold">
                          -
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold border-t-2 border-gray-200">
                    <tr>
                      <td className="px-4 py-3 text-sm text-gray-800">TOTAL</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-800">{calculateKPIData.summary.targetMorning}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-800">{calculateKPIData.summary.targetEvening}</td>
                      <td className="px-4 py-3 text-sm text-right text-amber-600">{calculateKPIData.summary.remain}</td>
                      <td className="px-4 py-3 text-sm text-right text-emerald-600">{calculateKPIData.summary.result}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-800">{calculateKPIData.summary.ratio.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500">{calculateKPIData.summary.totalRecords}</td>
                      <td className="px-4 py-3 text-center">-</td>
                      <td className="px-4 py-3 text-center">-</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>


          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
            <button onClick={() => setShowKPIModal(false)} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all shadow-sm">Close</button>
            <button onClick={exportKPItoExcel} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-sm">📎 Export KPI</button>
            <button onClick={exportToExcel} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-all shadow-sm">📎 Export Data</button>
          </div>
        </div>
      </div>
    );
  };

  const renderPasteModal = () => {
    if (!showPasteModal) return null;
    return (
      <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full mx-4 border border-gray-100 animate-scaleIn">
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-4 rounded-t-2xl">
            <div className="flex justify-between items-center text-white">
              <div>
                <h2 className="text-xl font-bold">🔄 Smart Import</h2>
                <p className="text-blue-100 text-sm">Auto-filters GIS + Command not created</p>
              </div>
              <button onClick={() => setShowPasteModal(false)} className="text-white/80 hover:text-white text-2xl transition-colors">✕</button>
            </div>
          </div>
          <div className="p-6 bg-white">
            <textarea 
              value={pasteData} 
              onChange={(e) => setPasteData(e.target.value)} 
              placeholder="Paste your system data here...&#10;&#10;Format: Request export code, Command export code, Note export code, Group request, Create date, Stock out, Stock receive, Receiving Unit, Creator, Status, Status CA&#10;&#10;Note: Only records with GIS in Request export code and Status = 'Command not created' will be imported.&#10;&#10;Example:&#10;YCXGIS_CHH_SOS01/26/000253	LXKCHH_TEC/26/000275	PXKCHH_ASU/26/000644	GIS_CHH_SOS_TEAM01	25/06/2026	CHH_STOCK_ROTATIONAL_TESTED		GIS_CHH_SOS_TEAM01	Mean Nimich	Command not created	Unsigned" 
              className="w-full h-64 px-4 py-3 border border-gray-200 rounded-xl font-mono text-sm bg-white text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-inner focus:outline-none"
            />

            {data.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                ⚠️ Current data has {data.length} record(s). Import will replace existing data.
              </div>
            )}
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
            <button onClick={() => { setShowPasteModal(false); setPasteData(''); }} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all shadow-sm">Cancel</button>
            <button onClick={handleSmartImport} disabled={!pasteData.trim()} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed">🔄 Smart Import</button>
          </div>
        </div>
      </div>
    );
  };

  const renderAlarmModal = () => {
    if (!showAlarmModal) return null;
    return (
      <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full mx-4 overflow-hidden flex flex-col max-h-[85vh] border border-gray-100 animate-scaleIn">
          <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-4">
            <div className="flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <span className="animate-bounce text-2xl">🚨</span>
                <div>
                  <h2 className="text-xl font-bold">ALARM DETECTED!</h2>
                  <p className="text-rose-100 text-xs">{alarmItems.length} record(s) exceed {alarmThreshold}-day threshold</p>
                </div>
              </div>
              <button onClick={() => { setShowAlarmModal(false); setAlarmSearchTerm(''); setSelectedAlarmUnit(''); }} className="text-white/80 hover:text-white text-2xl transition-colors">✕</button>
            </div>
          </div>
          
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex gap-2 justify-between items-center">
            <select
              value={selectedAlarmUnit}
              onChange={(e) => setSelectedAlarmUnit(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white w-40 text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="">All Units</option>
              {alarmUnits.map(unit => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
            <input 
              type="text" 
              placeholder="Search alarm list..." 
              value={alarmSearchTerm} 
              onChange={(e) => setAlarmSearchTerm(e.target.value)} 
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <button onClick={copyAlarmsToClipboard} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-all">
              📋 Copy ({filteredAlarmItems.length})
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 bg-white">
            {filteredAlarmItems.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">🔍</div>
                <p className="text-base font-semibold">No alarm items match your search.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-rose-100 rounded-2xl shadow-sm animate-fadeIn">
                <table className="min-w-full divide-y divide-rose-100 text-left text-xs bg-white">
                  <thead className="bg-rose-50/50 text-rose-900 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-center">#</th>
                      <th className="px-4 py-3">Request export code</th>
                      <th className="px-4 py-3">Receiving Unit</th>
                      <th className="px-4 py-3">Creator</th>
                      <th className="px-4 py-3 text-center">Q'ty of day</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {filteredAlarmItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-rose-50/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-500 text-center">{idx + 1}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-gray-800">{item.requestExportCode || '-'}</td>
                        <td className="px-4 py-3 text-gray-700">{item.receivingUnit || '-'}</td>
                        <td className="px-4 py-3 text-gray-700">{item.creator || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                            +{item.daysDiff}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => setDismissedItems(prev => new Set([...prev, item.id]))} className="px-3 py-1 text-xs bg-white border border-rose-200 rounded-xl hover:bg-rose-50 text-rose-700 font-semibold shadow-sm transition-colors animate-fadeIn">Dismiss</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
            <button onClick={() => { setShowAlarmModal(false); setAlarmSearchTerm(''); setSelectedAlarmUnit(''); }} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all shadow-sm text-xs">Close</button>
            <button onClick={() => { setDismissedItems(prev => new Set([...prev, ...alarmItems.map(i => i.id)])); setShowAlarmModal(false); setAlarmSearchTerm(''); setSelectedAlarmUnit(''); }} className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition-all shadow-md">Dismiss All</button>
          </div>
        </div>
      </div>
    );
  };

  const renderFloatingButtons = () => (
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
      {alarmCount > 0 && !showAlarmModal && (
        <button onClick={() => setShowAlarmModal(true)} className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 animate-bounce flex items-center gap-2 transform hover:scale-105">
          <span className="text-xl">🚨</span>
          <span className="font-bold">{alarmCount}</span>
        </button>
      )}
      <button onClick={() => setShowKPIModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 transform hover:scale-105">
        <span className="text-xl">📊</span>
        <span className="font-bold">KPI</span>
      </button>
    </div>
  );

  return (
    <div className="w-full h-screen max-h-screen p-1 sm:p-1.5 bg-slate-100 flex flex-col overflow-hidden font-sans">
      
      {/* ─── MODALS ─── */}
      {renderTargetHistoryModal()}
      {renderKPIModal()}
      {renderPasteModal()}
      {renderAlarmModal()}
      {renderFloatingButtons()}

      {/* ─── MAIN CONTENT CONTAINER (FULL SCREEN FLEX) ─── */}
      <div className="bg-white rounded-lg shadow-xl border border-slate-300 flex-1 flex flex-col h-full overflow-hidden">
        
        {/* ─── COMPACT EXCEL HEADER RIBBON ─── */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 px-3 py-1 border-b border-slate-900 text-white flex-shrink-0 shadow-sm">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1">
                  <span>📤</span> RESTOCK OUT
                </h1>
                <span className="bg-blue-500/30 text-blue-200 text-[9px] font-mono px-1.5 py-0.25 rounded-full uppercase tracking-wider border border-blue-400/30 font-bold">
                  🟢 LIVE • {currentTime.toLocaleTimeString()}
                </span>
              </div>
            </div>
            <div className="flex gap-1.5 items-center">
              <span className="text-slate-300 text-[10px] hidden lg:inline mr-2">
                <strong>RESTOCK OUT:</strong> ដំណើរការស្នើសុំសម្ភារៈសម្រាប់ប្រើប្រាស់
              </span>
              <button onClick={clearAllData} className="bg-rose-600/80 hover:bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold transition-all border border-rose-500/50 shadow-xs cursor-pointer">🗑️ Clear All</button>
              <button onClick={() => setShowKPIModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-0.5 rounded text-[10px] font-bold transition-all shadow-xs cursor-pointer">📊 KPI Matrix</button>
            </div>
          </div>
        </div>

        {/* ─── TOOLBAR & ACTION BAR ─── */}
        <div className="px-3 py-1 bg-slate-100 border-b border-slate-300 flex-shrink-0">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <div className="flex flex-wrap gap-1.5 items-center">
              <button onClick={() => setShowPasteModal(true)} className="px-2.5 py-0.5 bg-emerald-700 text-white rounded hover:bg-emerald-800 transition-all text-[11px] font-extrabold flex items-center gap-1 shadow-xs cursor-pointer">🔄 Smart Import</button>
              <button onClick={exportToExcel} className="px-2.5 py-0.5 bg-slate-800 text-white rounded hover:bg-slate-900 transition-all text-[11px] font-extrabold flex items-center gap-1 shadow-xs cursor-pointer">📎 Export Excel</button>
              {selectedRows.size > 0 && (
                <button onClick={deleteSelectedRows} className="px-2.5 py-0.5 bg-rose-600 text-white rounded hover:bg-rose-700 transition-all text-[11px] font-extrabold flex items-center gap-1 shadow-xs cursor-pointer">🗑️ Complete ({selectedRows.size})</button>
              )}

              {/* 🗓️ DAYS QUICK FILTER CHIPS */}
              <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-300 flex-wrap">
                <span className="text-[10px] font-extrabold text-slate-600">🗓️ Days:</span>
                {[
                  { id: 'ALL', label: 'All' },
                  { id: '0', label: '0d' },
                  { id: '1-3', label: '1-3d' },
                  { id: '4-6', label: '4-6d' },
                  { id: '>=4', label: '>=4d 🚨' },
                  { id: '>=7', label: '>=7d 🔴' },
                ].map(pill => (
                  <button
                    key={pill.id}
                    onClick={() => { setDaysFilter(pill.id); setCurrentPage(1); }}
                    className={`px-1.5 py-0.25 rounded text-[9.5px] font-black transition-all cursor-pointer ${
                      daysFilter === pill.id 
                        ? 'bg-blue-700 text-white shadow-2xs' 
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded shadow-xs text-[10px]">
                <span className="font-bold text-amber-900">⚠️ Threshold &ge;</span>
                <input type="number" value={alarmThreshold} onChange={(e) => setAlarmThreshold(parseInt(e.target.value) || 4)} className="w-10 px-1 py-0 text-[10px] font-bold border border-amber-300 rounded text-center bg-white" min="1"/>
                <span className="font-bold text-amber-900">d</span>
              </div>
              <input type="text" placeholder="Search request, command, unit..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="w-44 sm:w-56 px-2 py-0.5 text-[11px] font-medium border border-slate-300 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none transition-all shadow-xs" />
            </div>
          </div>
        </div>

        {/* ─── STATS SUMMARY BAR (COMPACT INLINE) ─── */}
        <div className="px-3 py-0.5 bg-slate-200/70 border-b border-slate-300 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 flex-shrink-0 text-[9.5px]">
          <div className="bg-white rounded px-2 py-0.5 border border-slate-300 shadow-xs flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-slate-500">Total Records</span>
            <span className="text-xs font-black text-blue-700">{data.length}</span>
          </div>
          <div className="bg-white rounded px-2 py-0.5 border border-slate-300 shadow-xs flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-emerald-700">Valid Active</span>
            <span className="text-xs font-black text-emerald-700">{filteredData.length}</span>
          </div>
          <div className="bg-white rounded px-2 py-0.5 border border-slate-300 shadow-xs flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-indigo-700">Selected</span>
            <span className="text-xs font-black text-indigo-700">{selectedRows.size}</span>
          </div>
          <div className="bg-white rounded px-2 py-0.5 border border-slate-300 shadow-xs flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-amber-700">Threshold</span>
            <span className="text-xs font-black text-amber-700">&ge;{alarmThreshold}d</span>
          </div>
          <div className={`bg-white rounded px-2 py-0.5 border shadow-xs cursor-pointer flex items-center justify-between hover:bg-rose-50 transition-all ${alarmCount > 0 ? 'border-rose-500 bg-rose-50/50' : 'border-slate-300'}`} onClick={() => { if (alarmCount > 0) setShowAlarmModal(true); }}>
            <span className="font-black uppercase tracking-wider text-rose-700">Delay Alarms</span>
            <span className={`text-xs font-black ${alarmCount > 0 ? 'text-rose-600 animate-pulse' : 'text-emerald-600'}`}>{alarmCount}</span>
          </div>
          <div className="bg-white rounded px-2 py-0.5 border border-slate-300 shadow-xs flex items-center justify-between cursor-pointer hover:bg-purple-50 transition-all" onClick={() => setShowKPIModal(true)}>
            <span className="font-black uppercase tracking-wider text-purple-700">Total Confirmed</span>
            <span className="text-xs font-black text-purple-700">{calculateKPIData.summary.result}</span>
          </div>
        </div>

        {/* ─── EXCEL MATRIX TABLE (DYNAMIC FILL SCREEN) ─── */}
        <div className="flex-1 min-h-0 overflow-auto bg-white border-t border-b border-slate-300">
          <table className="min-w-full border-collapse border border-slate-300 text-[9.5px] leading-tight table-auto bg-white">
            <thead>
              <tr className="bg-slate-800 text-white font-black uppercase tracking-wider text-[9px]">
                <th className="border border-slate-700 px-1 py-0.5 w-6 text-center sticky top-0 z-20 bg-slate-800">
                  <input type="checkbox" checked={selectedRows.size === filteredData.length && filteredData.length > 0} onChange={toggleSelectAll} className="rounded" />
                </th>
                {columns.map(col => (
                  <th 
                    key={col.key} 
                    onClick={col.key === 'daysDiff' ? () => setDaysSortOrder(prev => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none') : undefined}
                    className={`border border-slate-700 px-1.5 py-0.5 font-extrabold whitespace-nowrap sticky top-0 z-20 bg-slate-800 ${col.width} ${col.align || 'text-left'} ${col.key === 'daysDiff' ? 'cursor-pointer hover:bg-slate-700 select-none text-amber-300' : ''}`}
                    title={col.key === 'daysDiff' ? 'Click to sort by Days' : undefined}
                  >
                    {col.key === 'daysDiff' ? `Days ${daysSortOrder === 'desc' ? '⬇️' : daysSortOrder === 'asc' ? '⬆️' : '↕️'}` : col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-normal text-slate-800 bg-white">
              {paginatedData.map((item) => {
                const isAlarm = item.daysDiff >= alarmThreshold && !dismissedItems.has(item.id);
                return (
                  <tr key={item.id} className={`transition-colors ${isAlarm ? 'bg-rose-50/90 font-semibold' : selectedRows.has(item.id) ? 'bg-blue-50/90' : 'even:bg-slate-50/70 odd:bg-white hover:bg-blue-50/70'}`}>
                    <td className="border border-slate-300 px-1 py-0.25 text-center bg-white/50"><input type="checkbox" checked={selectedRows.has(item.id)} onChange={() => toggleRowSelection(item.id)} className="rounded" /></td>
                    <td className="border border-slate-300 px-1 py-0.25 text-slate-500 font-bold text-center bg-slate-100/70">{item.no}</td>
                    <td className="border border-slate-300 px-1.5 py-0.25 font-mono font-bold text-slate-900 whitespace-nowrap min-w-[170px]">
                      {editingCell?.id === item.id && editingCell?.field === 'requestExportCode' ? (
                        <input type="text" defaultValue={item.requestExportCode} autoFocus onBlur={(e) => saveEdit(item.id, 'requestExportCode', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'requestExportCode')} className="w-full px-1 py-0 border border-blue-500 rounded font-mono text-[9.5px] bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'requestExportCode', item.requestExportCode)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded font-mono">{item.requestExportCode || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 font-mono font-bold text-slate-900 whitespace-nowrap min-w-[170px]">
                      {editingCell?.id === item.id && editingCell?.field === 'commandExportCode' ? (
                        <input type="text" defaultValue={item.commandExportCode} autoFocus onBlur={(e) => saveEdit(item.id, 'commandExportCode', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'commandExportCode')} className="w-full px-1 py-0 border border-blue-500 rounded font-mono text-[9.5px] bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'commandExportCode', item.commandExportCode)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded font-mono">{item.commandExportCode || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 font-mono font-bold text-slate-900 whitespace-nowrap min-w-[170px]">
                      {editingCell?.id === item.id && editingCell?.field === 'noteExportCode' ? (
                        <input type="text" defaultValue={item.noteExportCode} autoFocus onBlur={(e) => saveEdit(item.id, 'noteExportCode', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'noteExportCode')} className="w-full px-1 py-0 border border-blue-500 rounded font-mono text-[9.5px] bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'noteExportCode', item.noteExportCode)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded font-mono">{item.noteExportCode || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 text-slate-800 whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'groupRequest' ? (
                        <input type="text" defaultValue={item.groupRequest} autoFocus onBlur={(e) => saveEdit(item.id, 'groupRequest', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'groupRequest')} className="w-full px-1 py-0 border border-blue-500 rounded bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'groupRequest', item.groupRequest)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded">{item.groupRequest || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 font-mono text-center text-slate-700 whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'createDate' ? (
                        <input type="text" defaultValue={item.createDate} autoFocus onBlur={(e) => saveEdit(item.id, 'createDate', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'createDate')} className="w-full px-1 py-0 border border-blue-500 rounded font-mono text-[9.5px] text-center bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'createDate', item.createDate)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded font-mono">{item.createDate || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 text-slate-800 font-bold whitespace-nowrap min-w-[150px]">
                      {editingCell?.id === item.id && editingCell?.field === 'stockOut' ? (
                        <input type="text" defaultValue={item.stockOut} autoFocus onBlur={(e) => saveEdit(item.id, 'stockOut', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'stockOut')} className="w-full px-1 py-0 border border-blue-500 rounded bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'stockOut', item.stockOut)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded">{getWarehouseBadge(item.stockOut)}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 text-slate-800 whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'stockReceive' ? (
                        <input type="text" defaultValue={item.stockReceive} autoFocus onBlur={(e) => saveEdit(item.id, 'stockReceive', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'stockReceive')} className="w-full px-1 py-0 border border-blue-500 rounded bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'stockReceive', item.stockReceive)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded">{item.stockReceive || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 text-slate-800 whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'receivingUnit' ? (
                        <input type="text" defaultValue={item.receivingUnit} autoFocus onBlur={(e) => saveEdit(item.id, 'receivingUnit', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'receivingUnit')} className="w-full px-1 py-0 border border-blue-500 rounded bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'receivingUnit', item.receivingUnit)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded">{item.receivingUnit || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 text-slate-800 whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'creator' ? (
                        <input type="text" defaultValue={item.creator} autoFocus onBlur={(e) => saveEdit(item.id, 'creator', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'creator')} className="w-full px-1 py-0 border border-blue-500 rounded bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'creator', item.creator)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded">{item.creator || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 text-slate-800 whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'status' ? (
                        <input type="text" defaultValue={item.status} autoFocus onBlur={(e) => saveEdit(item.id, 'status', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'status')} className="w-full px-1 py-0 border border-blue-500 rounded text-[9.5px] bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'status', item.status)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded">{getStatusBadge(item.status)}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 text-center whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'statusCA' ? (
                        <select defaultValue={item.statusCA} autoFocus onBlur={(e) => saveEdit(item.id, 'statusCA', e.target.value)} className="w-full px-1 py-0 border border-blue-500 rounded text-[9.5px] bg-white">
                          <option value="Unsigned">📝 Unsigned</option>
                          <option value="Is signing">✍️ Is signing</option>
                        </select>
                      ) : (
                        <div onClick={() => startEdit(item.id, 'statusCA', item.statusCA)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded">{getStatusCABadge(item.statusCA)}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1 py-0.25 text-center whitespace-nowrap"><span className="inline-flex px-1.5 py-0 rounded-full text-[9px] font-extrabold bg-indigo-100 text-indigo-800">{item.unit}</span></td>
                    <td className="border border-slate-300 px-1 py-0.25 text-center whitespace-nowrap">
                      <span className={`inline-flex px-1 py-0 rounded font-mono text-[9px] font-black ${
                        item.daysDiff >= alarmThreshold ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse' :
                        item.daysDiff > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {item.daysDiff > 0 ? `+${item.daysDiff}` : item.daysDiff} d
                      </span>
                    </td>
                    <td className="border border-slate-300 px-1 py-0.25 text-center font-mono font-bold text-blue-700 whitespace-nowrap">{item.year || '-'}</td>
                  </tr>
                );
              })}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="border border-slate-300 px-6 py-12 text-center text-slate-400 font-bold text-sm bg-white">
                    <div className="flex flex-col items-center gap-3">
                      <div className="text-4xl">📭</div>
                      <p className="text-lg font-bold text-slate-700">No valid records found</p>
                      <p className="text-xs text-slate-500">Filters: GIS + Command not created</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ─── PAGINATION BAR ─── */}
        <div className="bg-slate-100 px-3 py-1 border-t border-slate-300 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-slate-700 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">Show</span>
            <select 
              value={pageSize} 
              onChange={(e) => { 
                const val = e.target.value;
                setPageSize(val === 'ALL' ? 'ALL' : parseInt(val)); 
                setCurrentPage(1); 
              }} 
              className="border border-slate-300 rounded px-1.5 py-0.5 bg-white font-bold text-slate-800 shadow-xs text-[11px]"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value="ALL">All</option>
            </select>
            <span className="font-semibold text-slate-600">entries</span>
            <span className="text-slate-400">|</span>
            <span className="font-bold text-slate-800">
              Showing {totalItems > 0 ? (pageSize === 'ALL' ? 1 : (currentPage - 1) * pageSize + 1) : 0} to {pageSize === 'ALL' ? totalItems : Math.min(currentPage * pageSize, totalItems)} of {totalItems} entries
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
              disabled={currentPage === 1}
              className={`px-2 py-0.5 rounded border font-bold text-[11px] cursor-pointer transition-colors ${currentPage === 1 ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50 shadow-xs'}`}
            >
              Prev
            </button>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum = currentPage;
              if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              if (pageNum < 1 || pageNum > totalPages) return null;
              return (
                <button 
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-2 py-0.5 rounded border text-[11px] font-black cursor-pointer transition-colors ${currentPage === pageNum ? 'bg-slate-900 text-white border-slate-900 shadow-xs' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'}`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
              disabled={currentPage === totalPages}
              className={`px-2 py-0.5 rounded border font-bold text-[11px] cursor-pointer transition-colors ${currentPage === totalPages ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50 shadow-xs'}`}
            >
              Next
            </button>
          </div>
        </div>

        {/* ─── FOOTER ─── */}
        <div className="bg-slate-100 px-4 py-1.5 border-t border-slate-300 text-[10px] font-semibold text-slate-600 flex justify-between flex-wrap gap-2 flex-shrink-0">
          <span>📋 Total Valid Records: <strong>{filteredData.length}</strong> rows | Alarms: <strong>{alarmCount}</strong></span>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
        .animate-bounce { animation: bounce 1s infinite; }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .animate-pulse { animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
};

export default Restock_out;
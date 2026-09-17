import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { loadFromDb, saveToDb, clearStore } from '../../services/dbStore';
import {
  FileSpreadsheet,
  Upload,
  Download,
  Trash2,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Layers,
  AlertCircle,
  AlertTriangle,
  History,
  Copy,
  Search,
  CheckCircle2,
  Clock,
  HelpCircle,
  XCircle,
  PenTool,
  TrendingUp,
  Inbox,
  FileSignature,
  FileText,
  BarChart3,
  RefreshCw
} from 'lucide-react';

// Storage Keys
const STORAGE_KEYS = {
  DATA: 'import_ca_data',
  COMPLETION: 'import_ca_completionHistory',
  TARGETS: 'import_ca_targets',
  CONFIRMED: 'import_ca_confirmedStatus',
};

// Helper functions
const getStorageData = (key) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

const Import_CA = () => {
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
  const [targets, setTargets] = useState(() => getStorageData(STORAGE_KEYS.TARGETS) || {});
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
      const filtered = dbData.filter(item => {
        const sCA = (item.statusCA || '').toUpperCase().trim();
        return sCA.includes('UNSIGNED') || 
               sCA.includes('IS SIGNING') || 
               sCA.includes('TRÌNH KÝ') || 
               sCA.includes('TRINH KY') ||
               sCA.includes('CANCEL') ||
               sCA.includes('HỦY') ||
               sCA.includes('HUY');
      });
      setData(filtered);
      
      const dbCompletion = await loadFromDb(STORAGE_KEYS.COMPLETION, []);
      setCompletionHistory(dbCompletion);

      const dbTargets = await loadFromDb(STORAGE_KEYS.TARGETS, {});
      setTargets(dbTargets);

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
      saveToDb(STORAGE_KEYS.CONFIRMED, confirmedStatus);
    }
  }, [confirmedStatus]);

  // Complete list of all possible Units
  const allUnits = useMemo(() => [
    'BAN', 'BAT', 'CHA', 'CHH', 'KAM', 'KAN', 'KANZ1', 'KOH', 'KRA',
    'MON', 'ODD', 'PNP', 'PNPZ1', 'PNPZ2', 'PRE', 'PRH', 'PUR', 'ROT',
    'SIE', 'SIH', 'SPE', 'STU', 'SVA', 'TAK', 'THO'
  ], []);

  // Columns
  const columns = [
    { key: 'no', label: '#', width: 'w-10' },
    { key: 'codeReceipt', label: 'Receipt Code', width: 'whitespace-nowrap min-w-[170px]' },
    { key: 'codeCommand', label: 'Command Code', width: 'whitespace-nowrap min-w-[170px]' },
    { key: 'date', label: 'Date', width: 'w-20' },
    { key: 'warehouse', label: 'Warehouse', width: 'whitespace-nowrap min-w-[150px]' },
    { key: 'creator', label: 'Creator', width: 'whitespace-nowrap' },
    { key: 'status', label: 'Status', width: 'whitespace-nowrap' },
    { key: 'statusCA', label: 'Status CA', width: 'whitespace-nowrap' },
    { key: 'unit', label: 'Unit', width: 'w-20' },
    { key: 'daysDiff', label: 'Days', width: 'w-16' },
    { key: 'team', label: 'TEAM', width: 'min-w-[150px]' },
    { key: 'year', label: 'Year', width: 'w-16' },
  ];

  // Helper functions
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
  // 🎯 UNIT EXTRACTION LOGIC
  // ============================================================

  // 0. ចាប់យក Unit សម្រាប់ PNP / KAN (PNPZ1, PNPZ2, PNP, KANZ1, KAN)
  const getUnitFromText = (text) => {
    if (!text) return null;
    const upper = String(text).toUpperCase();
    const isPNP = upper.includes('PNP');
    const isKAN = upper.includes('KAN');

    if (isPNP) {
      if (upper.includes('FBC') || upper.includes('FB_TEAM')) {
        const match = upper.match(/FBC[^\d]*(\d+)/i) || upper.match(/FB_?TEAM_?(\d+)/i);
        if (match) {
          const num = String(parseInt(match[1], 10)).padStart(2, '0');
          if (['02', '04', '08', '09', '12'].includes(num)) return 'PNPZ2';
          if (['01', '03', '05', '06', '07', '10', '11', '13', '14'].includes(num)) return 'PNPZ1';
        }
        return 'PNPZ1';
      }
      return 'PNP';
    }

    if (isKAN) {
      if (upper.includes('FBC') || upper.includes('FB_TEAM')) {
        return 'KANZ1';
      }
      return 'KAN';
    }

    return null;
  };

  // 1. ចាប់យក Unit ពី Code of receipt note
  const getUnitFromReceiptCode = (codeReceipt) => {
    if (!codeReceipt) return null;
    const textUnit = getUnitFromText(codeReceipt);
    if (textUnit) return textUnit;
    
    const upper = codeReceipt.toUpperCase().replace(/FB_TEAMC/g, 'FBC').replace(/FB_TEAM/g, 'FBC');
    const match = upper.match(/(?:PNK|LNK|PXK|LXK)GIS_([A-Z0-9_]+)/) || upper.match(/(?:PNK|LNK|PXK|LXK)([A-Z0-9_]+)/);
    if (match && match[1]) {
      const codePart = match[1];
      const unitMatch = codePart.match(/^([A-Z]+)/);
      if (unitMatch && unitMatch[1]) {
        const unit = unitMatch[1];
        if (allUnits.includes(unit)) return unit;
        if (unit === 'PNPZ') return 'PNPZ1';
        if (unit === 'KANZ') return 'KANZ1';
      }
    }
    return null;
  };

  // 2. ចាប់យក Unit ពី Code of command
  const getUnitFromCommandCode = (codeCommand) => {
    if (!codeCommand) return null;
    const textUnit = getUnitFromText(codeCommand);
    if (textUnit) return textUnit;
    
    const upper = codeCommand.toUpperCase().replace(/FB_TEAMC/g, 'FBC').replace(/FB_TEAM/g, 'FBC');
    const match = upper.match(/(?:PNK|LNK|PXK|LXK)(?:GIS_)?([A-Z0-9_]+)/);
    if (match && match[1]) {
      const codePart = match[1];
      const unitMatch = codePart.match(/^([A-Z]+)/);
      if (unitMatch && unitMatch[1]) {
        const unit = unitMatch[1];
        if (allUnits.includes(unit)) return unit;
        if (unit === 'PNPZ') return 'PNPZ1';
        if (unit === 'KANZ') return 'KANZ1';
      }
    }
    return null;
  };

  // 3. ចាប់យក Unit ពី Warehouse
  const getUnitFromWarehouse = (warehouse) => {
    if (!warehouse) return null;
    const textUnit = getUnitFromText(warehouse);
    if (textUnit) return textUnit;
    
    const upper = warehouse.toUpperCase().replace(/FB_TEAMC/g, 'FBC').replace(/FB_TEAM/g, 'FBC');
    const match = upper.match(/^GIS_([A-Z0-9]+)_/) || upper.match(/^([A-Z0-9]+)_/);
    if (match && match[1]) {
      const unit = match[1];
      if (allUnits.includes(unit)) return unit;
      if (unit === 'PNPZ') return 'PNPZ1';
      if (unit === 'KANZ') return 'KANZ1';
    }
    for (const unit of allUnits) {
      if (upper.includes(`_${unit}_`) || upper.includes(`GIS_${unit}_`)) return unit;
    }
    return null;
  };

  // 4. មុខងារចាប់យក Unit សំខាន់ (Main)
  const getUnit = (codeReceipt, codeCommand, warehouse) => {
    const textUnit = getUnitFromText(codeReceipt) || getUnitFromText(codeCommand) || getUnitFromText(warehouse);
    if (textUnit) return textUnit;

    const unitFromReceipt = getUnitFromReceiptCode(codeReceipt);
    if (unitFromReceipt && allUnits.includes(unitFromReceipt)) return unitFromReceipt;
    
    const unitFromCommand = getUnitFromCommandCode(codeCommand);
    if (unitFromCommand && allUnits.includes(unitFromCommand)) return unitFromCommand;
    
    const unitFromWarehouse = getUnitFromWarehouse(warehouse);
    if (unitFromWarehouse && allUnits.includes(unitFromWarehouse)) return unitFromWarehouse;
    
    return 'OTHER';
  };

  // 5. មុខងារចាប់យក TEAM ពី Warehouse
  const getTeamFromWarehouse = (warehouse) => {
    if (!warehouse || warehouse === '-') return '-';
    const upper = String(warehouse).trim().toUpperCase();

    let province = '';
    const gisMatch = upper.match(/^GIS_([A-Z0-9]+)_/);
    if (gisMatch) {
      province = gisMatch[1];
    } else {
      const directMatch = upper.match(/^([A-Z0-9]+)_/);
      if (directMatch) province = directMatch[1];
    }
    if (!province) province = 'UNK';

    if (upper.includes('PLANNING') || upper.includes('_PLA')) {
      return `GIS_${province}_PLA_PLANNING DEPT`;
    }

    const fbcMatch = upper.match(/FBC[^\d]*(\d+)/i);
    if (fbcMatch) {
      const num = String(parseInt(fbcMatch[1], 10)).padStart(2, '0');
      if (upper.includes('FBCTEAM') || upper.includes('FB_TEAM')) {
        return `GIS_${province}_FBCTEAM${num}`;
      }
      return `GIS_${province}_FBC_TEAM${num}`;
    }

    const sosMatch = upper.match(/SOS[^\d]*(\d+)/i);
    if (sosMatch) {
      const num = String(parseInt(sosMatch[1], 10)).padStart(2, '0');
      if (upper.includes('SOSTEAM') || upper.includes('SOS_TEAM')) {
        return `GIS_${province}_SOS_TEAM${num}`;
      }
      return `GIS_${province}_SOS_TEAM${num}`;
    }

    return upper;
  };

  const getStatusCABadge = (statusCA) => {
    const s = (statusCA || '').toUpperCase();
    if (s.includes('UNSIGNED') || s.includes('CHƯA') || s.includes('CHUA')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white animate-pulse border border-rose-700 shadow-xs">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span>{statusCA}</span>
        </span>
      );
    }
    if (s.includes('IS SIGNING') || s.includes('ISSIGNING') || s.includes('ĐANG') || s.includes('DANG')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <PenTool className="w-3 h-3 flex-shrink-0" />
          <span>{statusCA}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
        <HelpCircle className="w-3 h-3 flex-shrink-0 text-slate-400" />
        <span>{statusCA || '-'}</span>
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const isCompleted = status?.includes('Actual Import finished') || status?.includes('Đã thực nhập hết');
    if (isCompleted) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 flex-shrink-0 text-emerald-600" />
          <span>{status}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
        <Clock className="w-3 h-3 flex-shrink-0 text-rose-600" />
        <span>{status}</span>
      </span>
    );
  };

  const getWarehouseBadge = (warehouse) => {
    if (warehouse && warehouse.toUpperCase().includes('GIS')) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">{warehouse}</span>;
    }
    return <span className="text-slate-600">{warehouse}</span>;
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
      alarm: 'bg-rose-600 border-rose-500',
      success: 'bg-emerald-600 border-emerald-500',
      info: 'bg-blue-600 border-blue-500',
      warning: 'bg-amber-500 border-amber-400'
    };
    const icons = {
      alarm: '<svg class="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
      success: '<svg class="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      info: '<svg class="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      warning: '<svg class="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>'
    };
    const titles = {
      alarm: 'ALARM DETECTED',
      success: 'Success',
      info: 'Notification',
      warning: 'Warning'
    };

    const notification = document.createElement('div');
    notification.className = `fixed top-16 right-4 z-50 p-3.5 rounded-xl shadow-xl border ${colors[type] || 'bg-slate-800 border-slate-700'} text-white max-w-sm animate-slideIn`;
    notification.innerHTML = `
      <div class="flex items-start gap-2.5">
        <div class="mt-0.5">${icons[type] || icons.info}</div>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-xs uppercase tracking-wider text-white/90">${titles[type] || 'Notification'}</div>
          <div class="text-xs text-white/95 mt-0.5 leading-relaxed whitespace-pre-line">${message}</div>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="text-white/60 hover:text-white text-base leading-none ml-1 cursor-pointer">✕</button>
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
    showNotification(`Target (${period === 'morning' ? 'ព្រឹក' : 'ល្ងាច'}) for ${unit} changed from ${oldTarget} to ${newTarget}`, 'info');
  };

  const processImport = async (newRawData) => {
    const gisData = newRawData.filter(item => {
      const isGIS = item.warehouse && item.warehouse.toUpperCase().includes('GIS');
      const sCA = (item.statusCA || '').toUpperCase().trim();
      const isValidStatus = sCA.includes('UNSIGNED') || 
                            sCA.includes('IS SIGNING') || 
                            sCA.includes('TRÌNH KÝ') || 
                            sCA.includes('TRINH KY') ||
                            sCA.includes('CANCEL') ||
                            sCA.includes('HỦY') ||
                            sCA.includes('HUY');
      return isGIS && isValidStatus;
    });

    if (gisData.length === 0) {
      showNotification('No GIS warehouses with Unsigned/Is signing found!', 'warning');
      return;
    }

    const currentCodes = new Set(data.map(item => item.codeReceipt));
    const newCodesSet = new Set(gisData.map(item => item.codeReceipt));
    
    const processedNewData = gisData.map((item, index) => {
      // 🎯 ប្រើមុខងារ getUnit ថ្មី
      const unit = getUnit(item.codeReceipt, item.codeCommand, item.warehouse);
      const team = getTeamFromWarehouse(item.warehouse);
      const daysDiff = calculateDaysDiff(item.date);
      const year = extractYearFromDate(item.date);
      const isCompleted = item.status?.includes('Actual Import finished') || item.status?.includes('Đã thực nhập hết');
      
      return {
        id: Math.max(...data.map(d => d.id), 0, index) + index + 1,
        no: index + 1,
        codeReceipt: item.codeReceipt || '',
        codeCommand: item.codeCommand || '',
        date: item.date || '',
        year: year,
        warehouse: item.warehouse || '',
        creator: item.creator || '',
        status: item.status || '',
        statusCA: item.statusCA || '',
        unit: unit,
        team: team,
        daysDiff: daysDiff,
        isCompleted: isCompleted
      };
    });
    
    const unitsInNewData = {};
    processedNewData.forEach(item => {
      if (item.unit !== 'OTHER') {
        unitsInNewData[item.unit] = (unitsInNewData[item.unit] || 0) + 1;
      }
    });
    
    const existingUnits = new Set(Object.keys(targets));
    const newUnitsFound = [];
    Object.keys(unitsInNewData).forEach(unit => {
      if (!existingUnits.has(unit)) {
        newUnitsFound.push(unit);
        autoCreateTargetForUnit(unit, unitsInNewData[unit]);
        showNotification(`Auto-created target for ${unit}: ${unitsInNewData[unit]}`, 'info');
      }
    });
    
    const completedCodesArray = [...currentCodes].filter(code => !newCodesSet.has(code));
    if (completedCodesArray.length > 0) {
      const newCompletions = completedCodesArray.map(code => {
        const foundItem = data.find(item => item.codeReceipt === code);
        return { 
          codeReceipt: code, 
          completedAt: new Date().toISOString(), 
          unit: foundItem?.unit || 'UNKNOWN' 
        };
      });
      setCompletionHistory(prev => [...newCompletions, ...prev]);
      completedCodesArray.forEach(code => {
        showNotification(`COMPLETED: ${code} has been cleared! +1 Result`, 'success');
      });
      playAlarmSound();
    }
    
    setData(processedNewData);
    saveToDb(STORAGE_KEYS.DATA, processedNewData);
    showNotification(`Import Summary:\nCompleted: ${completedCodesArray.length}\nNew Added: ${gisData.length}\nNew Units: ${newUnitsFound.length > 0 ? newUnitsFound.join(', ') : 'None'}\nFiltered out Signed records`, 'info');
    return { completedCount: completedCodesArray.length, newCount: gisData.length, newUnits: newUnitsFound };
  };

  const calculateKPIData = useMemo(() => {
    const unitGroups = {};
    data.forEach(item => {
      const unit = item.unit;
      if (unit !== 'OTHER') {
        if (!unitGroups[unit]) {
          unitGroups[unit] = { codes: new Set(), unit: unit, count: 0, completed: 0 };
        }
        unitGroups[unit].codes.add(item.codeReceipt);
        unitGroups[unit].count++;
        if (item.isCompleted || item.status?.includes('Actual Import finished')) {
          unitGroups[unit].completed++;
        }
      }
    });
    
    const completedByUnit = {};
    completionHistory.forEach(completion => {
      if (completion.unit !== 'UNKNOWN') {
        completedByUnit[completion.unit] = (completedByUnit[completion.unit] || 0) + 1;
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
    
    const kpiData = [];
    let grandTargetMorning = 0;
    let grandTargetEvening = 0;
    let grandRemain = 0;
    let grandResult = 0;
    let grandTotalRecords = 0;
    const isMorning = new Date().getHours() < 12;
    
    allUnits.forEach(unit => {
      const morningTarget = targets[unit]?.morning || 0;
      const eveningTarget = targets[unit]?.evening || 0;
      const target = isMorning ? morningTarget : (eveningTarget > 0 ? eveningTarget : morningTarget);
      const currentCount = unitGroups[unit]?.count || 0;
      const completedCount = completedByUnit[unit] || 0;
      const result = completedCount;
      const remain = target > 0 ? Math.max(0, target - result) : currentCount;
      let ratio = 0;
      if (target > 0) ratio = (result / target) * 100;
      else if (remain === 0 && result === 0) ratio = 100;
      
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
  }, [data, targets, completionHistory, confirmedStatus, allUnits, kpiViewMode, kpiSortBy, kpiSortOrder]);

  const parsePastedData = (text) => {
    const rows = text.split(/\r?\n/);
    const parsedRows = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].trim();
      if (!row) continue;
      const cells = row.includes('\t') ? row.split('\t') : row.split(/ {2,}/);
      if (cells.length >= 7) {
        const firstCell = cells[0].trim().replace(/\.$/, '');
        const isSequence = /^\d+$/.test(firstCell);
        const offset = isSequence ? 1 : 0;
        
        if (cells.length - offset >= 7) {
          parsedRows.push({
            codeReceipt: cells[offset + 0] || '',
            codeCommand: cells[offset + 1] || '',
            date: cells[offset + 2] || '',
            warehouse: cells[offset + 3] || '',
            creator: cells[offset + 4] || '',
            status: cells[offset + 5] || '',
            statusCA: cells[offset + 6] || ''
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
        if (field === 'date') {
          updated.daysDiff = calculateDaysDiff(value);
          updated.year = extractYearFromDate(value);
        }
        if (field === 'codeReceipt' || field === 'codeCommand' || field === 'warehouse') {
          // 🎯 ប្រើមុខងារ getUnit ថ្មី
          updated.unit = getUnit(
            field === 'codeReceipt' ? value : item.codeReceipt,
            field === 'codeCommand' ? value : item.codeCommand,
            field === 'warehouse' ? value : item.warehouse
          );
        }
        if (field === 'status') {
          updated.isCompleted = value?.includes('Actual Import finished') || value?.includes('Đã thực nhập hết');
        }
        return updated;
      }
      return item;
    });
    setData(updatedData);
  };

  const clearAllData = async () => {
    if (window.confirm('Are you sure you want to delete ALL data? This cannot be undone!')) {
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
    if (window.confirm(`Delete ${selectedRows.size} row(s)?`)) {
      const deletedCodes = data.filter(item => selectedRows.has(item.id)).map(item => item.codeReceipt);
      const newCompletions = deletedCodes.map(code => ({
        codeReceipt: code, completedAt: new Date().toISOString(),
        unit: data.find(item => item.codeReceipt === code)?.unit || 'UNKNOWN'
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
      'No': item.no,
      'Receipt Code': item.codeReceipt,
      'Command Code': item.codeCommand,
      'Date': item.date,
      'Year': item.year,
      'Warehouse': item.warehouse,
      'Creator': item.creator,
      'Status': item.status,
      'Status CA': item.statusCA,
      'Unit': item.unit,
      'Days': item.daysDiff,
      'TEAM': item.team || getTeamFromWarehouse(item.warehouse)
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
    XLSX.utils.book_append_sheet(wb, ws, 'Import CA Data');
    XLSX.writeFile(wb, `import_ca_data_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('Export completed!', 'success');
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
    XLSX.utils.book_append_sheet(wb, ws, 'Import CA KPI');
    XLSX.writeFile(wb, `import_ca_kpi_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('KPI Export completed!', 'success');
  };

  // 🎯 FILTER: Only show GIS warehouses
  const filteredData = useMemo(() => {
    let filtered = data;
    filtered = filtered.filter(item => 
      item.warehouse && item.warehouse.toUpperCase().includes('GIS')
    );

    // Days Filter
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
      const isTermUnit = allUnits.some(u => u.toLowerCase() === term) || term === 'other';

      filtered = filtered.filter(item => {
        if (isTermUnit) {
          return (item.unit || '').toLowerCase() === term;
        }
        return (
          item.codeReceipt?.toLowerCase().includes(term) ||
          item.codeCommand?.toLowerCase().includes(term) ||
          item.warehouse?.toLowerCase().includes(term) ||
          item.creator?.toLowerCase().includes(term) ||
          item.date?.toLowerCase().includes(term) ||
          String(item.year || '').toLowerCase().includes(term) ||
          item.unit?.toLowerCase().includes(term) ||
          item.team?.toLowerCase().includes(term) ||
          item.status?.toLowerCase().includes(term) ||
          item.statusCA?.toLowerCase().includes(term)
        );
      });
    }

    // Days Sorting
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
    return filteredData.filter(item => (item.daysDiff >= alarmThreshold || (item.statusCA && (item.statusCA.toUpperCase().includes('UNSIGNED') || item.statusCA.toUpperCase().includes('CHƯA') || item.statusCA.toUpperCase().includes('CHUA')))) && !dismissedItems.has(item.id));
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
        item.codeReceipt?.toLowerCase().includes(term) ||
        item.warehouse?.toLowerCase().includes(term) ||
        item.creator?.toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [alarmItems, alarmSearchTerm, selectedAlarmUnit]);

  const copyAlarmsToClipboard = () => {
    if (filteredAlarmItems.length === 0) return;
    const text = filteredAlarmItems.map(item => 
      `${item.unit}\n| Receipt: ${item.codeReceipt}\nDate: ${item.date} | Year: ${item.year} | Delay: +${item.daysDiff} days\nWarehouse: ${item.warehouse || '-'}\nTEAM: ${item.team || '-'}\nStatus: ${item.status || '-'}\nStatus CA: ${item.statusCA || '-'}`
    ).join('\n\n');
    navigator.clipboard.writeText(text);
    showNotification('Alarm list copied to clipboard!', 'success');
  };

  useEffect(() => {
    setData(prevData => {
      let changed = false;
      const updated = prevData.map(item => {
        const currentDaysDiff = calculateDaysDiff(item.date);
        const currentYear = extractYearFromDate(item.date);
        if (item.daysDiff !== currentDaysDiff || item.year !== currentYear) {
          changed = true;
          return { ...item, daysDiff: currentDaysDiff, year: currentYear };
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
        const stored = sessionStorage.getItem('shown_import_ca_alarms');
        if (stored) shownIds = new Set(JSON.parse(stored));
      } catch (e) {}

      const newAlarms = alarmItems.filter(item => !shownIds.has(item.id));
      if (newAlarms.length > 0) {
        setShowAlarmModal(true);
        playAlarmSound();
        alarmItems.forEach(item => shownIds.add(item.id));
        try {
          sessionStorage.setItem('shown_import_ca_alarms', JSON.stringify([...shownIds]));
        } catch (e) {}
      }
    }
  }, [alarmItems]);

  const getStatusBadgeKPI = (status) => {
    const config = {
      'Completed': { icon: <CheckCircle2 className="w-3 h-3 text-emerald-700" />, bg: 'bg-emerald-100', text: 'text-emerald-800' },
      'Good': { icon: <TrendingUp className="w-3 h-3 text-blue-700" />, bg: 'bg-blue-100', text: 'text-blue-800' },
      'Warning': { icon: <AlertTriangle className="w-3 h-3 text-amber-700" />, bg: 'bg-amber-100', text: 'text-amber-800' },
      'Critical': { icon: <AlertCircle className="w-3 h-3 text-rose-700" />, bg: 'bg-rose-100', text: 'text-rose-800' },
      'No Target': { icon: <HelpCircle className="w-3 h-3 text-orange-700" />, bg: 'bg-orange-100', text: 'text-orange-800' },
      'No Data': { icon: <Inbox className="w-3 h-3 text-slate-400" />, bg: 'bg-slate-100', text: 'text-slate-500' }
    };
    const c = config[status] || config['No Data'];
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.text} border border-black/5`}>
        {c.icon}
        <span>{status}</span>
      </span>
    );
  };

  const alarmCount = alarmItems.length;

  // ─── MODALS ───
  const renderKPIModal = () => {
    if (!showKPIModal) return null;
    return (
      <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col border border-gray-100 animate-scaleIn">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3 text-white">
                <BarChart3 className="w-6 h-6 text-white" />
                <div>
                  <h2 className="text-xl font-bold text-white">KPI Dashboard - Import CA Performance</h2>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={() => setShowKPIModal(false)} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
              </div>
            </div>
          </div>
          <div className="p-6 overflow-y-auto flex-1 bg-white">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">Target ព្រឹក</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.targetMorning}</div>
              </div>
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">Target ល្ងាច</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.targetEvening}</div>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">Remaining</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.remain}</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">Result</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.result}</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">Ratio</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.ratio.toFixed(1)}%</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-4 text-white shadow-md">
                <div className="text-xs opacity-90 font-medium">In System</div>
                <div className="text-2xl font-black mt-1">{calculateKPIData.summary.totalRecords}</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm text-gray-600 mb-1.5 font-semibold">
                <span>Overall Progress (based on Evening Target)</span>
                <span className="font-bold text-slate-800">{calculateKPIData.summary.ratio.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500 to-blue-500 h-3.5 rounded-full transition-all duration-500" style={{ width: `${calculateKPIData.summary.ratio}%` }}></div>
              </div>
            </div>

            {/* View Mode Tabs */}
            <div className="flex gap-2 mb-4 border-b border-slate-100 pb-2">
              <button onClick={() => setKpiViewMode('all')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${kpiViewMode === 'all' ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                <Layers className="w-3.5 h-3.5" />
                <span>All ({calculateKPIData.allData.length})</span>
              </button>
              <button onClick={() => setKpiViewMode('active')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${kpiViewMode === 'active' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                <Clock className="w-3.5 h-3.5" />
                <span>Active</span>
              </button>
              <button onClick={() => setKpiViewMode('completed')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${kpiViewMode === 'completed' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Completed</span>
              </button>
            </div>

            {/* KPI Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:text-slate-900" onClick={() => handleSort('unit')}>
                        Unit {kpiSortBy === 'unit' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:text-slate-900" onClick={() => handleSort('morning')}>
                        ព្រឹក {kpiSortBy === 'morning' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:text-slate-900" onClick={() => handleSort('evening')}>
                        ល្ងាច {kpiSortBy === 'evening' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:text-slate-900" onClick={() => handleSort('remain')}>
                        Remain {kpiSortBy === 'remain' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:text-slate-900" onClick={() => handleSort('result')}>
                        Result {kpiSortBy === 'result' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:text-slate-900" onClick={() => handleSort('ratio')}>
                        Ratio {kpiSortBy === 'ratio' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:text-slate-900 select-none" onClick={() => handleSort('total')}>
                        In System {kpiSortBy === 'total' && (kpiSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {calculateKPIData.data.map((item) => (
                      <tr key={item.unit} className={`hover:bg-slate-50/80 transition-colors ${item.hasChange ? 'bg-amber-50/50' : ''}`}>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                          {item.unit}
                          {item.hasChange && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <TrendingUp className="w-3 h-3" /> Changed
                            </span>
                          )}
                          {item.isNew && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              New
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-mono">
                          {editingTarget === `${item.unit}-morning` ? (
                            <input type="number" defaultValue={item.morningTarget} autoFocus onBlur={(e) => { updateTarget(item.unit, 'morning', e.target.value); setEditingTarget(null); }} className="w-20 px-2 py-1 text-right border border-slate-300 rounded-lg text-sm font-semibold bg-white text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none" />
                          ) : (
                            <span className="cursor-pointer hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors text-slate-700 font-semibold" onClick={() => setEditingTarget(`${item.unit}-morning`)}>{item.morningTarget || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-mono">
                          {editingTarget === `${item.unit}-evening` ? (
                            <input type="number" defaultValue={item.eveningTarget} autoFocus onBlur={(e) => { updateTarget(item.unit, 'evening', e.target.value); setEditingTarget(null); }} className="w-20 px-2 py-1 text-right border border-slate-300 rounded-lg text-sm font-semibold bg-white text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none" />
                          ) : (
                            <span className={`cursor-pointer hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors text-slate-700 font-semibold ${item.hasChange ? 'font-bold text-purple-600' : ''}`} onClick={() => setEditingTarget(`${item.unit}-evening`)}>{item.eveningTarget || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-mono"><span className={`font-semibold ${item.remain > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{item.remain}</span></td>
                        <td className="px-4 py-3 text-sm text-right text-emerald-600 font-bold font-mono">{item.result}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <div className="flex items-center justify-end gap-2 font-mono">
                            <span className="font-bold text-slate-700">{item.ratio.toFixed(1)}%</span>
                            <div className="w-16 bg-slate-100 rounded-full h-2">
                              <div className={`h-2 rounded-full transition-all duration-300 ${item.ratio >= 80 ? 'bg-emerald-500' : item.ratio >= 50 ? 'bg-amber-500' : item.ratio > 0 ? 'bg-rose-500' : 'bg-slate-300'}`} style={{ width: `${item.ratio}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-slate-500 font-mono">{item.total}</td>
                        <td className="px-4 py-3 text-center">{getStatusBadgeKPI(item.status)}</td>
                        <td className="px-4 py-3 text-center">
                          {item.hasData && (
                            <button onClick={() => { setSearchTerm(item.unit); setShowKPIModal(false); }} className="text-blue-600 hover:text-blue-800 text-xs font-bold hover:underline transition-all cursor-pointer">View</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
                    <tr>
                      <td className="px-4 py-3 text-sm text-slate-800">TOTAL</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-800 font-mono">{calculateKPIData.summary.targetMorning}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-800 font-mono">{calculateKPIData.summary.targetEvening}</td>
                      <td className="px-4 py-3 text-sm text-right text-amber-600 font-mono">{calculateKPIData.summary.remain}</td>
                      <td className="px-4 py-3 text-sm text-right text-emerald-600 font-mono">{calculateKPIData.summary.result}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-800 font-mono">{calculateKPIData.summary.ratio.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-500 font-mono">{calculateKPIData.summary.totalRecords}</td>
                      <td className="px-4 py-3 text-center">-</td>
                      <td className="px-4 py-3 text-center">-</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button onClick={() => setShowKPIModal(false)} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all shadow-xs text-xs cursor-pointer">Close</button>
            <button onClick={exportKPItoExcel} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-xs text-xs flex items-center gap-1.5 cursor-pointer">
              <Download className="w-3.5 h-3.5" />
              <span>Export KPI</span>
            </button>
            <button onClick={exportToExcel} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-all shadow-xs text-xs flex items-center gap-1.5 cursor-pointer">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Data</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPasteModal = () => {
    if (!showPasteModal) return null;
    return (
      <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-4">
            <div className="flex justify-between items-center text-white">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-5 h-5 text-white" />
                <div>
                  <h2 className="text-xl font-bold">Smart Import</h2>
                  <p className="text-blue-100 text-xs mt-0.5">Auto-filters GIS warehouses & only Unsigned/Is signing</p>
                </div>
              </div>
              <button onClick={() => setShowPasteModal(false)} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
            </div>
          </div>
          <div className="p-6 bg-white">
            <textarea 
              value={pasteData} 
              onChange={(e) => setPasteData(e.target.value)} 
              placeholder="Paste your system data here...&#10;&#10;Format: Receipt Code, Command Code, Date, Warehouse, Creator, Status, Status CA&#10;&#10;Note: Only Unsigned and Is signing will be imported. Signed records will be filtered out.&#10;&#10;Example:&#10;PNKMON_ASU/26/000571	LNKMON_PLA/26/000546	23/06/2026	MON_STOCK_ROTATIONAL_TESTED	mon_aus_tepvasnan	Đã thực nhập hết / Actual Import finished	Unsigned" 
              className="w-full h-64 px-4 py-3 border border-slate-300 rounded-xl font-mono text-xs bg-slate-50 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
            />

            {data.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                <span>Current data has <strong>{data.length}</strong> record(s). Import will replace existing data.</span>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button onClick={() => { setShowPasteModal(false); setPasteData(''); }} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all shadow-xs text-xs cursor-pointer">Cancel</button>
            <button onClick={handleSmartImport} disabled={!pasteData.trim()} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-xs cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Smart Import</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAlarmModal = () => {
    if (!showAlarmModal) return null;
    return (
      <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full mx-4 overflow-hidden flex flex-col max-h-[85vh] border border-rose-100">
          <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-4">
            <div className="flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-7 h-7 text-white animate-bounce" />
                <div>
                  <h2 className="text-xl font-bold">ALARM DETECTED!</h2>
                  <p className="text-rose-100 text-xs">{alarmItems.length} record(s) exceed {alarmThreshold}-day threshold</p>
                </div>
              </div>
              <button onClick={() => { setShowAlarmModal(false); setAlarmSearchTerm(''); setSelectedAlarmUnit(''); }} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
            </div>
          </div>
          
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex gap-2 justify-between items-center">
            <select
              value={selectedAlarmUnit}
              onChange={(e) => setSelectedAlarmUnit(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white w-40 text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="">All Units</option>
              {alarmUnits.map(unit => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
            <div className="flex-1 relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search alarm list..." 
                value={alarmSearchTerm} 
                onChange={(e) => setAlarmSearchTerm(e.target.value)} 
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <button onClick={copyAlarmsToClipboard} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer">
              <Copy className="w-3.5 h-3.5" />
              <span>Copy ({filteredAlarmItems.length})</span>
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 bg-white">
            {filteredAlarmItems.length === 0 ? (
              <div className="text-center text-slate-400 py-12 flex flex-col items-center">
                <Search className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-xs font-semibold">No alarm items match your search.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-rose-100 rounded-2xl shadow-sm animate-fadeIn">
                <table className="min-w-full divide-y divide-rose-100 text-left text-xs bg-white">
                  <thead className="bg-rose-50/50 text-rose-900 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-center">#</th>
                      <th className="px-4 py-3">Receipt Code</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Status CA</th>
                      <th className="px-4 py-3 text-center">Days</th>
                      <th className="px-4 py-3 text-center">TEAM</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {filteredAlarmItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-rose-50/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-500 text-center">{idx + 1}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-800">{item.codeReceipt || '-'}</td>
                        <td className="px-4 py-3 text-center">{getStatusBadge(item.status)}</td>
                        <td className="px-4 py-3 text-center">{getStatusCABadge(item.statusCA)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 font-mono">
                            +{item.daysDiff}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-xl font-bold bg-purple-50 text-purple-700 border border-purple-100 font-mono">
                            {item.team || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => setDismissedItems(prev => new Set([...prev, item.id]))} className="px-3 py-1 text-xs bg-white border border-rose-200 rounded-xl hover:bg-rose-50 text-rose-700 font-semibold shadow-xs transition-colors cursor-pointer">Dismiss</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button onClick={() => { setShowAlarmModal(false); setAlarmSearchTerm(''); setSelectedAlarmUnit(''); }} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all shadow-xs text-xs cursor-pointer">Close</button>
            <button onClick={() => { setDismissedItems(prev => new Set([...prev, ...alarmItems.map(i => i.id)])); setShowAlarmModal(false); setAlarmSearchTerm(''); setSelectedAlarmUnit(''); }} className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer">Dismiss All</button>
          </div>
        </div>
      </div>
    );
  };

  // ─── FLOATING BUTTONS (KPI is accessible via top ribbon and stats summary bar) ───
  const renderFloatingButtons = () => {
    if (alarmCount === 0 || showAlarmModal) return null;
    return (
      <div className="fixed bottom-20 right-6 flex flex-col gap-3 z-40">
        <button onClick={() => setShowAlarmModal(true)} className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-full shadow-lg animate-bounce flex items-center gap-2 border-2 border-white transition-colors cursor-pointer">
          <AlertTriangle className="w-5 h-5 text-white" />
          <span className="font-bold text-sm">{alarmCount}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="w-full h-screen max-h-screen p-1 sm:p-1.5 bg-slate-100 flex flex-col overflow-hidden font-sans">
      
      {/* ─── MODALS ─── */}
      {renderKPIModal()}
      {renderPasteModal()}
      {renderAlarmModal()}
      {renderFloatingButtons()}

      {/* ─── MAIN CONTENT ─── */}
      <div className="bg-white rounded-lg shadow-xl border border-slate-300 flex-1 flex flex-col h-full overflow-hidden">
        
        {/* ─── HEADER RIBBON ─── */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 px-3 py-1.5 border-b border-slate-900 text-white flex-shrink-0 shadow-sm">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-blue-400" />
                  <span>IMPORT CA</span>
                </h1>
                <span className="bg-blue-500/30 text-blue-200 text-[9px] font-mono px-1.5 py-0.5 rounded-full uppercase tracking-wider border border-blue-400/30 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                  LIVE • {currentTime.toLocaleTimeString()}
                </span>
              </div>
            </div>
            <div className="flex gap-1.5 items-center">
              <span className="text-slate-300 text-[10px] hidden lg:inline mr-2">
                <strong>IMPORT CA:</strong> បញ្ជីបង្កាន់ដៃ Stock In មិនទាន់បានចុះ CA
              </span>
              <button onClick={clearAllData} className="bg-rose-600/80 hover:bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold transition-all border border-rose-500/50 shadow-xs cursor-pointer flex items-center gap-1">
                <Trash2 className="w-3 h-3" />
                <span>Clear All</span>
              </button>
              <button onClick={() => setShowKPIModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-0.5 rounded text-[10px] font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1">
                <BarChart3 className="w-3 h-3" />
                <span>KPI Matrix</span>
              </button>
            </div>
          </div>
        </div>

        {/* ─── TOOLBAR & ACTION BAR ─── */}
        <div className="px-3 py-1 bg-slate-100 border-b border-slate-300 flex-shrink-0">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <div className="flex flex-wrap gap-1.5 items-center">
              <button onClick={() => setShowPasteModal(true)} className="px-2.5 py-1 bg-emerald-700 text-white rounded hover:bg-emerald-800 transition-all text-[11px] font-extrabold flex items-center gap-1 shadow-xs cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Smart Import</span>
              </button>
              <button onClick={exportToExcel} className="px-2.5 py-1 bg-slate-800 text-white rounded hover:bg-slate-900 transition-all text-[11px] font-extrabold flex items-center gap-1 shadow-xs cursor-pointer">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>
              {selectedRows.size > 0 && (
                <button onClick={deleteSelectedRows} className="px-2.5 py-1 bg-rose-600 text-white rounded hover:bg-rose-700 transition-all text-[11px] font-extrabold flex items-center gap-1 shadow-xs cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Complete ({selectedRows.size})</span>
                </button>
              )}

              {/* DAYS QUICK FILTER CHIPS */}
              <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-300 flex-wrap">
                <span className="text-[10px] font-extrabold text-slate-600 flex items-center gap-0.5">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  <span>Days:</span>
                </span>
                {[
                  { id: 'ALL', label: 'All', icon: null },
                  { id: '0', label: '0d', icon: null },
                  { id: '1-3', label: '1-3d', icon: null },
                  { id: '4-6', label: '4-6d', icon: null },
                  { id: '>=4', label: '>=4d (Alarm)', icon: <AlertTriangle className="w-2.5 h-2.5 text-amber-500" /> },
                  { id: '>=7', label: '>=7d (Critical)', icon: <AlertCircle className="w-2.5 h-2.5 text-rose-500" /> },
                ].map(pill => (
                  <button
                    key={pill.id}
                    onClick={() => { setDaysFilter(pill.id); setCurrentPage(1); }}
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-black transition-all cursor-pointer flex items-center gap-1 ${
                      daysFilter === pill.id 
                        ? 'bg-blue-700 text-white shadow-2xs' 
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    {pill.icon}
                    <span>{pill.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded shadow-xs text-[10px]">
                <AlertTriangle className="w-3 h-3 text-amber-700" />
                <span className="font-bold text-amber-900">Threshold &ge;</span>
                <input type="number" value={alarmThreshold} onChange={(e) => setAlarmThreshold(parseInt(e.target.value) || 4)} className="w-10 px-1 py-0 text-[10px] font-bold border border-amber-300 rounded text-center bg-white" min="1"/>
                <span className="font-bold text-amber-900">d</span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search receipt, command, unit..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="w-44 sm:w-56 pl-7 pr-2 py-0.5 text-[11px] font-medium border border-slate-300 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none transition-all shadow-xs" />
              </div>
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
            <span className="font-black uppercase tracking-wider text-emerald-700">GIS Active</span>
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
                    {col.key === 'daysDiff' ? (
                      <div className="inline-flex items-center gap-1">
                        <span>Days</span>
                        {daysSortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-amber-300" /> : daysSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-300" /> : <ArrowUpDown className="w-3 h-3 text-slate-400" />}
                      </div>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-normal text-slate-800 bg-white">
              {paginatedData.map((item) => {
                const isAlarm = (item.daysDiff >= alarmThreshold || (item.statusCA && (item.statusCA.toUpperCase().includes('UNSIGNED') || item.statusCA.toUpperCase().includes('CHƯA') || item.statusCA.toUpperCase().includes('CHUA')))) && !dismissedItems.has(item.id);
                return (
                  <tr key={item.id} className={`transition-colors ${isAlarm ? 'bg-rose-50/90 font-semibold' : selectedRows.has(item.id) ? 'bg-blue-50/90' : 'even:bg-slate-50/70 odd:bg-white hover:bg-blue-50/70'}`}>
                    <td className="border border-slate-300 px-1 py-0.25 text-center bg-white/50"><input type="checkbox" checked={selectedRows.has(item.id)} onChange={() => toggleRowSelection(item.id)} className="rounded" /></td>
                    <td className="border border-slate-300 px-1 py-0.25 text-slate-500 font-bold text-center bg-slate-100/70">{item.no}</td>
                    <td className="border border-slate-300 px-1.5 py-0.25 font-mono font-bold text-slate-900 whitespace-nowrap min-w-[170px]">
                      {editingCell?.id === item.id && editingCell?.field === 'codeReceipt' ? (
                        <input type="text" defaultValue={item.codeReceipt} autoFocus onBlur={(e) => saveEdit(item.id, 'codeReceipt', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'codeReceipt')} className="w-full px-1 py-0 border border-blue-500 rounded font-mono text-[9.5px] bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'codeReceipt', item.codeReceipt)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded font-mono">{item.codeReceipt || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 font-mono font-bold text-slate-900 whitespace-nowrap min-w-[170px]">
                      {editingCell?.id === item.id && editingCell?.field === 'codeCommand' ? (
                        <input type="text" defaultValue={item.codeCommand} autoFocus onBlur={(e) => saveEdit(item.id, 'codeCommand', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'codeCommand')} className="w-full px-1 py-0 border border-blue-500 rounded font-mono text-[9.5px] bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'codeCommand', item.codeCommand)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded font-mono">{item.codeCommand || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 font-mono text-center text-slate-700 whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'date' ? (
                        <input type="text" defaultValue={item.date} autoFocus onBlur={(e) => saveEdit(item.id, 'date', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'date')} className="w-full px-1 py-0 border border-blue-500 rounded font-mono text-[9.5px] text-center bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'date', item.date)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded font-mono">{item.date || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 text-slate-800 font-bold whitespace-nowrap min-w-[150px]">
                      {editingCell?.id === item.id && editingCell?.field === 'warehouse' ? (
                        <input type="text" defaultValue={item.warehouse} autoFocus onBlur={(e) => saveEdit(item.id, 'warehouse', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'warehouse')} className="w-full px-1 py-0 border border-blue-500 rounded bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'warehouse', item.warehouse)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded">{getWarehouseBadge(item.warehouse)}</div>
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
                        <input type="text" defaultValue={item.status} autoFocus onBlur={(e) => saveEdit(item.id, 'status', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'status')} className="w-full px-1 py-0 border border-blue-500 rounded bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'status', item.status)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0 rounded">{getStatusBadge(item.status)}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-0.25 text-center whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'statusCA' ? (
                        <select defaultValue={item.statusCA} autoFocus onBlur={(e) => saveEdit(item.id, 'statusCA', e.target.value)} className="w-full px-1 py-0 border border-blue-500 rounded text-[9.5px] bg-white">
                          <option value="Unsigned">Unsigned</option>
                          <option value="Is signing">Is signing</option>
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
                    <td className="border border-slate-300 px-1.5 py-0.25 text-center whitespace-nowrap"><span className="inline-flex px-1.5 py-0 rounded font-mono font-bold text-purple-700 bg-purple-50 border border-purple-200">{item.team || getTeamFromWarehouse(item.warehouse)}</span></td>
                    <td className="border border-slate-300 px-1 py-0.25 text-center font-mono font-bold text-blue-700 whitespace-nowrap">{item.year || '-'}</td>
                  </tr>
                );
              })}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="border border-slate-300 px-6 py-12 text-center text-slate-400 font-bold text-sm bg-white">
                    <div className="flex flex-col items-center gap-2">
                      <Inbox className="w-10 h-10 text-slate-300" />
                      <p className="text-base font-bold text-slate-700">No GIS records found with Unsigned/Is signing</p>
                      <p className="text-xs text-slate-500 font-normal">Please click "Smart Import" to enter data.</p>
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
          <span className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Total GIS (Unsigned/Is signing): <strong>{filteredData.length}</strong> rows | Alarms: <strong>{alarmCount}</strong></span>
          </span>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
        .animate-bounce { animation: bounce 1s infinite; }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .animate-pulse { animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
      `}</style>
    </div>
  );
};

export default Import_CA;
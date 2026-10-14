import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { loadFromDb, saveToDb, clearStore } from '../../services/dbStore';
import { archiveClearedRecords, checkAndRevokeBackupConflicts } from '../../services/backupStore';
import {
  PackageCheck,
  Trash2,
  BarChart3,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Copy,
  X,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  AlertCircle,
  Maximize2,
  Minimize2,
  Columns,
  ChevronDown,
  ChevronUp,
  Inbox
} from 'lucide-react';

// All standard 25 Units
const allUnits = [
  'BAN', 'BAT', 'CHA', 'CHH', 'KAM', 'KAN', 'KANZ1', 'KOH', 'KRA',
  'MON', 'ODD', 'PNP', 'PNPZ1', 'PNPZ2', 'PRE', 'PRH', 'PUR', 'ROT',
  'SIE', 'SIH', 'SPE', 'STU', 'SVA', 'TAK', 'THO'
];

// Storage Keys for Metfone Net Module
const STORAGE_KEYS = {
  DATA: 'metfone_stockout_data',
  COMPLETION: 'metfone_stockout_completionHistory',
  TARGETS: 'metfone_stockout_targets'
};
export const INITIAL_METFONE_DATA = [];

// Helper to extract Unit from Metfone strings
const getUnitFromMetfoneReceiver = (groupReceiver, stockReceiver, exportCode, exportNo) => {
  const cleanGrp = (groupReceiver && groupReceiver.trim() !== '-') ? groupReceiver.trim() : '';
  const cleanStk = (stockReceiver && stockReceiver.trim() !== '-') ? stockReceiver.trim() : '';
  const str = (cleanGrp || cleanStk || '').toUpperCase().replace(/\s+/g, '');
  
  if (/_PNPZ1_/.test(str) || /^PNPZ1\b/.test(str)) return 'PNPZ1';
  if (/_PNPZ2_/.test(str) || /^PNPZ2\b/.test(str)) return 'PNPZ2';
  if (/_KANZ1_/.test(str) || /^KANZ1\b/.test(str)) return 'KANZ1';

  const provinceMatch = str.match(/(?:MFNET_)?(?:GIS_)?([A-Z]{3,5})_/);
  const province = provinceMatch ? provinceMatch[1] : null;

  const fbcMatch = str.match(/FBC[^\d]*(\d+)/);
  const sosMatch = str.match(/SOS[^\d]*(\d+)/);

  if (fbcMatch && province) {
    const num = String(parseInt(fbcMatch[1], 10)).padStart(2, '0');
    if (province === 'PNP') {
      const PNPZ1 = ['01','03','05','06','07','10','11','13','14'];
      const PNPZ2 = ['02','04','08','09','12'];
      if (PNPZ1.includes(num)) return 'PNPZ1';
      if (PNPZ2.includes(num)) return 'PNPZ2';
      return 'PNP';
    }
    if (province === 'KAN') {
      const KANZ1 = ['01','02','03','04','05','06','07'];
      if (KANZ1.includes(num)) return 'KANZ1';
      return 'KAN';
    }
    if (allUnits.includes(province)) return province;
  }

  if (sosMatch && province && allUnits.includes(province)) {
    return province;
  }

  if (province && allUnits.includes(province)) {
    return province;
  }

  const code = (exportNo || exportCode || '').toUpperCase();
  for (const u of ['PNPZ1', 'PNPZ2', 'KANZ1', ...allUnits]) {
    if (code.includes(`_${u}/`) || code.includes(`_${u}_`) || code.includes(`/${u}/`)) {
      return u;
    }
  }

  for (const u of allUnits) {
    if (str.includes(u)) return u;
  }

  return 'OTHER';
};

// Helper to extract Team name
const getTeamFromReceiver = (stockReceiver, groupReceiver) => {
  const grp = (groupReceiver || '').trim();
  const rawTeam = (grp && grp !== '-') ? grp : (stockReceiver || '').trim();
  if (!rawTeam || rawTeam === '-') return '-';

  let upper = rawTeam.toUpperCase();
  upper = upper.replace(/FB_TEAMC/g, 'FBC').replace(/FB_TEAM/g, 'FBC').replace(/FBC012/g, 'FBC12');

  let teamNum = '';
  let teamType = '';

  const fbcMatch = upper.match(/FBC[^\d]*(\d+)/);
  if (fbcMatch) {
    teamType = 'FBC';
    teamNum = String(parseInt(fbcMatch[1], 10)).padStart(2, '0');
  } else {
    const sosMatch = upper.match(/SOS[^\d]*(\d+)/);
    if (sosMatch) {
      teamType = 'SOS';
      teamNum = String(parseInt(sosMatch[1], 10)).padStart(2, '0');
    }
  }

  if (teamType && teamNum) {
    let province = '';
    const gisProvince = upper.match(/(?:^|_)GIS_([A-Z]+)_/);
    if (gisProvince) {
      province = gisProvince[1];
    } else {
      const units = [
        'BAN','BAT','CHA','CHH','KAM','KOH','KRA','MON','ODD',
        'PNP','PRE','PRH','PUR','ROT','SIE','SIH','SPE','STU',
        'SVA','TAK','THO','KAN'
      ].sort((a, b) => b.length - a.length);
      for (const u of units) {
        if (new RegExp(`(^|_)${u}($|_)`).test(upper)) {
          province = u;
          break;
        }
      }
    }

    if (!province && stockReceiver) {
      const stockUpper = stockReceiver.toUpperCase();
      const stockGisMatch = stockUpper.match(/(?:^|_)GIS_([A-Z]+)_/);
      if (stockGisMatch) {
        province = stockGisMatch[1];
      } else {
        const units = [
          'BAN','BAT','CHA','CHH','KAM','KOH','KRA','MON','ODD',
          'PNP','PRE','PRH','PUR','ROT','SIE','SIH','SPE','STU',
          'SVA','TAK','THO','KAN'
        ].sort((a, b) => b.length - a.length);
        for (const u of units) {
          if (new RegExp(`(^|_)${u}($|_)`).test(stockUpper)) {
            province = u;
            break;
          }
        }
      }
    }

    if (province) {
      return `GIS_${province}_${teamType}${teamNum}`;
    }
    return `${teamType}${teamNum}`;
  }

  upper = upper.replace(/_TEAM(\d+)/i, '$1');
  upper = upper.replace(/TEAM(\d+)/i, '$1');
  return upper;
};

// Calculate Days Diff from date string (DD/MM/YYYY or YYYY-MM-DD)
const calculateDaysDiff = (dateString) => {
  if (!dateString) return 0;
  const parts = dateString.split(/[/\s:-]+/);
  if (parts.length < 3) return 0;
  let day, month, year;
  if (parts[0].length === 4) {
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  } else {
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
  }
  const exportDate = new Date(year, month, day);
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const diffTime = currentDate - exportDate;
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
};

export default function StockoutYetConfirmMetfone() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const isLoaded = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [data, setData] = useState([]);
  const [completionHistory, setCompletionHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Requirement: "Stock reciever / Group reciever: កន្លែង ចាប់ យកតែGIS" (Always on in background)
  const filterGIS = true;
  const [showAlarmModal, setShowAlarmModal] = useState(false);
  const [alarmThreshold, setAlarmThreshold] = useState(4);
  const [dismissedItems, setDismissedItems] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteData, setPasteData] = useState('');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showKPIModal, setShowKPIModal] = useState(false);
  const [targets, setTargets] = useState({});
  const [editingTarget, setEditingTarget] = useState(null);
  const [notification, setNotification] = useState(null);

  // Pagination & Days Filter State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [daysFilter, setDaysFilter] = useState('ALL');
  const [daysSortOrder, setDaysSortOrder] = useState('none');
  const [isFitScreen, setIsFitScreen] = useState(true);
  const [tableDensity, setTableDensity] = useState('ultra'); // 'ultra', 'compact', 'normal'
  const [showStatsBar, setShowStatsBar] = useState(true);

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
    } catch (e) {}
  };

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // 🚫 FILTER FUNCTION: Check if item should be excluded (Matching Stockout_yet)
  const shouldExcludeItem = (item) => {
    const stockRec = (item.stockReceiver || '').toUpperCase();
    const groupRec = (item.groupReceiver || '').toUpperCase();
    const constRec = (item.constructionReceiver || '').toUpperCase();
    const unit = item.unit || getUnitFromMetfoneReceiver(groupRec, stockRec, item.exportCode, item.exportNo);

    // 1. Exclude GPON for SPE, TAK, KAM, CHH (Matching Stockout_yet)
    if (constRec.includes('GPON') && ['SPE', 'TAK', 'KAM', 'CHH'].includes(unit)) {
      return true;
    }

    // 2. Exclude GIS_MOD (Matching Stockout_yet)
    if (groupRec.includes('GIS_MOD')) {
      return true;
    }

    // 3. Exclude non-GIS (neither stockReceiver nor groupReceiver has GIS)
    const isStockGis = stockRec.includes('GIS');
    const isGroupGis = groupRec.includes('GIS');
    if (!isStockGis && !isGroupGis) {
      return true;
    }

    return false;
  };

  // Enrich item with computed fields
  const enrichItem = (item, index) => {
    const stockRec = (item.stockReceiver || '').trim();
    let groupRec = (item.groupReceiver || '').trim();

    if (!groupRec || groupRec === '-') {
      const sosMatch = stockRec.match(/SOS(?:TEAM)?\s*(\d+)/i);
      const fbcMatch = stockRec.match(/FBC(?:TEAM)?\s*(\d+)/i);
      if (sosMatch) {
        const num = String(parseInt(sosMatch[1], 10)).padStart(2, '0');
        groupRec = `SOS${num}`;
      } else if (fbcMatch) {
        const num = String(parseInt(fbcMatch[1], 10)).padStart(2, '0');
        groupRec = `FBC${num}`;
      } else {
        groupRec = '-';
      }
    }

    const unit = getUnitFromMetfoneReceiver(groupRec, stockRec, item.exportCode, item.exportNo);
    const isGis = !shouldExcludeItem({ ...item, unit });
    return {
      ...item,
      groupReceiver: groupRec,
      id: item.id || `mf-${Date.now()}-${index}`,
      no: index + 1,
      unit,
      team: getTeamFromReceiver(stockRec, groupRec),
      daysDiff: calculateDaysDiff(item.realExport),
      isGis
    };
  };

  // Columns definition (matching exact Excel format)
  const columns = [
    { key: 'no', label: 'No', width: 'w-8', align: 'text-center' },
    { key: 'exportCode', label: 'Warehouse Stock out', width: 'whitespace-nowrap min-w-[190px]', align: 'text-left' },
    { key: 'exportNo', label: 'Export code', width: 'whitespace-nowrap min-w-[170px]', align: 'text-left' },
    { key: 'realExport', label: 'Date real export', width: 'w-24', align: 'text-center' },
    { key: 'stockReceiver', label: 'Stock reciever', width: 'w-36', align: 'text-left' },
    { key: 'groupReceiver', label: 'Group reciever', width: 'w-44', align: 'text-left' },
    { key: 'constructionReceiver', label: 'Construction reciever', width: 'w-56', align: 'text-left' },
    { key: 'unit', label: 'Unit', width: 'w-14', align: 'text-center' },
    { key: 'daysDiff', label: 'Days', width: 'w-14', align: 'text-center' },
    { key: 'team', label: 'TEAM', width: 'min-w-[150px]', align: 'text-center' }
  ];

  // Load from DB on mount
  useEffect(() => {
    const fetchDbData = async () => {
      const dbData = await loadFromDb(STORAGE_KEYS.DATA, null);
      const dbCompletion = await loadFromDb(STORAGE_KEYS.COMPLETION, []);
      setCompletionHistory(dbCompletion || []);
      const dbTargets = await loadFromDb(STORAGE_KEYS.TARGETS, {});
      setTargets(dbTargets || {});

      if (dbData && Array.isArray(dbData) && dbData.length > 0) {
        const enriched = dbData
          .map((item, idx) => enrichItem(item, idx))
          .filter(item => item.isGis)
          .map((item, idx) => ({ ...item, no: idx + 1 }));
        setData(enriched);
      } else {
        setData([]);
      }
      isLoaded.current = true;
    };
    fetchDbData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Recalculate days on mount
  useEffect(() => {
    setData(prevData => {
      let changed = false;
      const updated = prevData.map(item => {
        const currentDaysDiff = calculateDaysDiff(item.realExport);
        if (item.daysDiff !== currentDaysDiff) {
          changed = true;
          return { ...item, daysDiff: currentDaysDiff };
        }
        return item;
      });
      return changed ? updated : prevData;
    });
  }, []);

  // Filtered Data Computation (Single-pass)
  const filteredData = useMemo(() => {
    const term = searchTerm.trim() ? searchTerm.toLowerCase().trim() : '';
    const isTermUnit = term ? (allUnits.some(u => u.toLowerCase() === term) || term === 'other') : false;

    let filtered = data.filter(item => {
      // 1. GIS filter
      if (filterGIS && !item.isGis) return false;

      // 2. Days filter
      if (daysFilter !== 'ALL') {
        const d = item.daysDiff || 0;
        if (daysFilter === '0' && d !== 0) return false;
        if (daysFilter === '1-3' && (d < 1 || d > 3)) return false;
        if (daysFilter === '4-6' && (d < 4 || d > 6)) return false;
        if (daysFilter === '>=4' && d < alarmThreshold) return false;
        if (daysFilter === '>=7' && d < 7) return false;
      }

      // 3. Search filter
      if (term) {
        if (isTermUnit) {
          return item.unit?.toLowerCase() === term;
        }
        return (
          (item.exportCode && item.exportCode.toLowerCase().includes(term)) ||
          (item.exportNo && item.exportNo.toLowerCase().includes(term)) ||
          (item.realExport && item.realExport.toLowerCase().includes(term)) ||
          (item.stockReceiver && item.stockReceiver.toLowerCase().includes(term)) ||
          (item.groupReceiver && item.groupReceiver.toLowerCase().includes(term)) ||
          (item.constructionReceiver && item.constructionReceiver.toLowerCase().includes(term)) ||
          (item.unit && item.unit.toLowerCase().includes(term)) ||
          (item.team && item.team.toLowerCase().includes(term))
        );
      }

      return true;
    });

    // Days Sorting
    if (daysSortOrder !== 'none') {
      filtered = [...filtered].sort((a, b) => {
        const aDays = a.daysDiff || 0;
        const bDays = b.daysDiff || 0;
        return daysSortOrder === 'desc' ? bDays - aDays : aDays - bDays;
      });
    }

    return filtered;
  }, [data, filterGIS, daysFilter, searchTerm, daysSortOrder, alarmThreshold]);

  const totalItems = filteredData.length;
  const effectivePageSize = pageSize === 'ALL' ? (totalItems || 1) : pageSize;
  const totalPages = Math.ceil(totalItems / effectivePageSize) || 1;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [filteredData.length, totalPages, currentPage]);

  const paginatedData = useMemo(() => {
    if (pageSize === 'ALL') return filteredData;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  // Alarms
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
        item.exportCode?.toLowerCase().includes(term) ||
        item.exportNo?.toLowerCase().includes(term) ||
        item.stockReceiver?.toLowerCase().includes(term) ||
        item.groupReceiver?.toLowerCase().includes(term) ||
        item.constructionReceiver?.toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [alarmItems, alarmSearchTerm, selectedAlarmUnit]);

  const copyAlarmsToClipboard = () => {
    if (filteredAlarmItems.length === 0) return;
    const text = filteredAlarmItems.map(item => 
      `${item.unit}\n| Code: ${item.exportCode} | No: ${item.exportNo}\n📅 Date: ${item.realExport} | ⏰ Delay: +${item.daysDiff} days\nStock Rec: ${item.stockReceiver || '-'} | Group: ${item.groupReceiver || '-'}\nConstruction: ${item.constructionReceiver || '-'}\nTEAM: ${item.team || '-'}`
    ).join('\n\n');
    navigator.clipboard.writeText(text);
    showNotification('📋 Alarm list copied to clipboard!', 'success');
  };

  // Check alarm modal on new alarms
  useEffect(() => {
    if (alarmItems.length > 0) {
      let shownIds = new Set();
      try {
        const stored = sessionStorage.getItem('shown_metfone_alarms');
        if (stored) shownIds = new Set(JSON.parse(stored));
      } catch (e) {}

      const newAlarms = alarmItems.filter(item => !shownIds.has(item.id));
      if (newAlarms.length > 0) {
        setShowAlarmModal(true);
        playAlarmSound();
        alarmItems.forEach(item => shownIds.add(item.id));
        try {
          sessionStorage.setItem('shown_metfone_alarms', JSON.stringify([...shownIds]));
        } catch (e) {}
      }
    }
  }, [alarmItems]);

  const alarmCount = alarmItems.length;

  // Row selection
  const toggleRowSelection = (id) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === filteredData.length && filteredData.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredData.map(item => item.id)));
    }
  };

  const deleteSelectedRows = async () => {
    if (selectedRows.size === 0) return;
    const confirmMsg = `✅ Are you sure you want to complete/clear ${selectedRows.size} selected items?`;
    if (window.confirm(confirmMsg)) {
      const recordsToArchive = data.filter(item => selectedRows.has(item.id));
      const completedItems = recordsToArchive.map(item => ({
        exportNo: item.exportNo,
        completedAt: new Date().toISOString(),
        unit: item.unit || 'UNKNOWN'
      }));
      setCompletionHistory(prev => {
        const next = [...completedItems, ...prev];
        saveToDb(STORAGE_KEYS.COMPLETION, next);
        return next;
      });
      setData(prev => prev.filter(item => !selectedRows.has(item.id)));
      setSelectedRows(new Set());
      try {
        await archiveClearedRecords('METFONE_NET', 'METFONE_STOCKOUT_YET_CONFIRM', recordsToArchive, 'MANUAL_COMPLETE');
      } catch (e) {
        console.error('Error archiving manual completed items:', e);
      }
      showNotification(`✅ Completed ${completedItems.length} records! Moved to Backup`, 'success');
    }
  };

  // Inline Cell Editing
  const startEdit = (id, field, value) => {
    setEditingCell({ id, field, value });
  };

  const saveEdit = (id, field, value) => {
    setData(prev => {
      const updatedList = prev.map(item => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          return enrichItem(updated, updated.no - 1);
        }
        return item;
      });
      const gisOnly = updatedList.filter(item => item.isGis).map((item, idx) => ({ ...item, no: idx + 1 }));
      if (gisOnly.length < updatedList.length) {
        showNotification('🗑️ ទិន្នន័យត្រូវបានលុបចោលដោយសារមិនមាន GIS (ទាំង Stock Receiver និង Group Receiver)!', 'warning');
      }
      return gisOnly;
    });
    setEditingCell(null);
  };

  const handleKeyPress = (e, id, field) => {
    if (e.key === 'Enter') {
      saveEdit(id, field, e.target.value);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // Smart Import Parsing
  const parsePastedData = (text) => {
    if (!text || !text.trim()) return [];
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return [];

    let exportCodeIdx = -1;
    let exportNoIdx = -1;
    let realExportIdx = -1;
    let stockReceiverIdx = -1;
    let groupReceiverIdx = -1;
    let constructionReceiverIdx = -1;
    let startRow = 0;
    
    const firstLine = lines[0].trim();
    if (firstLine) {
      const headerCells = firstLine.split(/\t| {2,}/).map(c => c.trim().toLowerCase());
      headerCells.forEach((cell, idx) => {
        const clean = cell.replace(/[^a-z0-9]/g, ' ').trim();
        if (clean === 'no' || clean === 'seq' || clean === 'stt' || clean === 'id' || clean === '') return;
        
        if (
          (clean.includes('export') && (clean.includes('code') || clean.includes('no') || clean.includes('num') || clean.includes('id'))) ||
          clean === 'export no' || clean === 'export code' || clean === 'export'
        ) {
          exportNoIdx = idx;
        } else if (
          clean.includes('warehouse') || 
          (clean.includes('stock') && clean.includes('out') && !clean.includes('date')) ||
          clean.startsWith('wh')
        ) {
          exportCodeIdx = idx;
        } else if (clean.includes('date') || clean.includes('time') || clean.includes('real')) {
          realExportIdx = idx;
        } else if (clean.includes('stock') && (clean.includes('rec') || clean.includes('nhan'))) {
          stockReceiverIdx = idx;
        } else if (clean.includes('group') && (clean.includes('rec') || clean.includes('nhan') || clean.includes('team'))) {
          groupReceiverIdx = idx;
        } else if (clean.includes('construct') || clean.includes('project') || clean.includes('tuyen')) {
          constructionReceiverIdx = idx;
        }
      });

      if (exportNoIdx !== -1 || exportCodeIdx !== -1 || realExportIdx !== -1 || stockReceiverIdx !== -1 || groupReceiverIdx !== -1) {
        startRow = 1;
      } else {
        exportCodeIdx = -1;
        exportNoIdx = -1;
        realExportIdx = -1;
        stockReceiverIdx = -1;
        groupReceiverIdx = -1;
        constructionReceiverIdx = -1;
        startRow = 0;
      }
    }

    const rows = [];
    for (let i = startRow; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(/\t| {2,}/);
      if (cols.length === 0) continue;

      if (exportCodeIdx === -1 && exportNoIdx === -1 && realExportIdx === -1) {
        let offset = 0;
        if (/^\d+$/.test(cols[0].trim().replace(/\.$/, '')) && cols.length > 2) {
          offset = 1;
        }

        const available = cols.length - offset;
        let exportCode = '';
        let exportNo = '';
        let realExport = '';
        let stockReceiver = '';
        let groupReceiver = '';
        let constructionReceiver = '';

        if (available === 1) {
          exportNo = cols[offset].trim();
        } else if (available === 2) {
          exportCode = cols[offset + 0].trim();
          exportNo = cols[offset + 1].trim();
        } else {
          exportCode = cols[offset + 0] ? cols[offset + 0].trim() : '';
          exportNo = cols[offset + 1] ? cols[offset + 1].trim() : '';
          realExport = cols[offset + 2] ? cols[offset + 2].trim() : '';
          stockReceiver = cols[offset + 3] ? cols[offset + 3].trim() : '';
          groupReceiver = cols[offset + 4] ? cols[offset + 4].trim() : '';
          constructionReceiver = cols[offset + 5] ? cols[offset + 5].trim() : '';
        }

        if (exportCode || exportNo) {
          rows.push({
            exportCode,
            exportNo: exportNo || exportCode,
            realExport,
            stockReceiver,
            groupReceiver,
            constructionReceiver
          });
        }
      } else {
        rows.push({
          exportCode: exportCodeIdx !== -1 ? (cols[exportCodeIdx] || '').trim() : '',
          exportNo: exportNoIdx !== -1 ? (cols[exportNoIdx] || '').trim() : '',
          realExport: realExportIdx !== -1 ? (cols[realExportIdx] || '').trim() : '',
          stockReceiver: stockReceiverIdx !== -1 ? (cols[stockReceiverIdx] || '').trim() : '',
          groupReceiver: groupReceiverIdx !== -1 ? (cols[groupReceiverIdx] || '').trim() : '',
          constructionReceiver: constructionReceiverIdx !== -1 ? (cols[constructionReceiverIdx] || '').trim() : ''
        });
      }
    }
    return rows;
  };

  const handleSmartImport = async () => {
    const rawList = parsePastedData(pasteData);
    if (rawList.length === 0) {
      showNotification('❌ មិនមានទិន្នន័យត្រឹមត្រូវសម្រាប់ Import ទេ!', 'warning');
      return;
    }

    // Active current records (from state or localStorage cache fallback)
    let localPending = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DATA);
      if (raw) localPending = JSON.parse(raw);
    } catch (e) {}
    const activeCurrentData = (data && data.length > 0) ? data : localPending;

    // 1. Pre-build HashMaps for O(1) Instant Lookups
    const currentDataMap = new Map();
    activeCurrentData.forEach(d => {
      const expNo = (d.exportNo || '').trim().toUpperCase();
      if (expNo) currentDataMap.set(expNo, d);
    });

    let backupRecords = [];
    try {
      const rawBackup = localStorage.getItem('BACKUP_ARCHIVE_METFONE_NET_METFONE_STOCKOUT_YET_CONFIRM');
      if (rawBackup) backupRecords = JSON.parse(rawBackup);
    } catch (e) {}

    const backupDataMap = new Map();
    backupRecords.forEach(d => {
      const expNo = (d.exportNo || '').trim().toUpperCase();
      if (expNo) backupDataMap.set(expNo, d);
    });

    const allEnriched = rawList.map((item, idx) => {
      const expNo = (item.exportNo || '').trim();
      const expCode = (item.exportCode || '').trim();
      const keyNo = expNo.toUpperCase();
      const existing = (keyNo && currentDataMap.get(keyNo)) || 
                       (keyNo && backupDataMap.get(keyNo));

      const stockRec = item.stockReceiver || existing?.stockReceiver || '-';
      let groupRec = item.groupReceiver || existing?.groupReceiver || '';
      if (!groupRec || groupRec === '-') {
        const sosMatch = stockRec.match(/SOS(?:TEAM)?\s*(\d+)/i);
        const fbcMatch = stockRec.match(/FBC(?:TEAM)?\s*(\d+)/i);
        if (sosMatch) {
          const num = String(parseInt(sosMatch[1], 10)).padStart(2, '0');
          groupRec = `SOS${num}`;
        } else if (fbcMatch) {
          const num = String(parseInt(fbcMatch[1], 10)).padStart(2, '0');
          groupRec = `FBC${num}`;
        } else {
          groupRec = '-';
        }
      }

      const merged = {
        exportCode: expCode || existing?.exportCode || existing?.warehouseStockOut || expNo,
        exportNo: expNo || expCode || existing?.exportNo,
        realExport: item.realExport || existing?.realExport || existing?.date || new Date().toISOString().split('T')[0],
        stockReceiver: stockRec,
        groupReceiver: groupRec,
        constructionReceiver: item.constructionReceiver || existing?.constructionReceiver || existing?.construction || '-',
      };
      return enrichItem(merged, idx);
    });

    const gisOnly = allEnriched.filter(item => item.isGis);
    const nonGisCount = allEnriched.length - gisOnly.length;

    if (gisOnly.length === 0) {
      showNotification('⚠️ មិនមានទិន្នន័យ GIS ទេ (ទិន្នន័យទាំងអស់ជា Non-GIS ឬត្រូវបាន Exclude)!', 'warning');
      return;
    }

    const currentExportNos = new Set(activeCurrentData.map(item => (item.exportNo || '').trim().toUpperCase()).filter(Boolean));
    const newExportNosSet = new Set(gisOnly.map(item => (item.exportNo || '').trim().toUpperCase()).filter(Boolean));

    // 1. Reback Conflict Check & Auto-revoke from Backup
    try {
      const rebackedExportNos = await checkAndRevokeBackupConflicts(
        'METFONE_NET',
        'METFONE_STOCKOUT_YET_CONFIRM',
        Array.from(newExportNosSet)
      );
      if (rebackedExportNos && rebackedExportNos.length > 0) {
        const rebackedSet = new Set(rebackedExportNos.map(s => s.toUpperCase()));
        setCompletionHistory(prev => {
          const next = prev.filter(c => !rebackedSet.has((c.exportNo || '').toUpperCase()));
          saveToDb(STORAGE_KEYS.COMPLETION, next);
          return next;
        });
        showNotification(`⚠️ Reback detected: ${rebackedExportNos.length} record(s) restored from backup!`, 'warning');
      }
    } catch (e) {
      console.warn('Reback check notice:', e);
    }

    // 2. Identify missing records (Completed items that moved out of pending)
    const completedExportNosArray = [...currentExportNos].filter(no => !newExportNosSet.has(no));
    if (completedExportNosArray.length > 0) {
      const fullClearedRows = completedExportNosArray
        .map(no => currentDataMap.get(no))
        .filter(Boolean);

      const newCompletions = completedExportNosArray.map(no => {
        const foundItem = currentDataMap.get(no);
        return {
          exportNo: foundItem?.exportNo || no,
          completedAt: new Date().toISOString(),
          unit: foundItem?.unit || 'UNKNOWN'
        };
      });

      setCompletionHistory(prev => {
        const next = [...newCompletions, ...prev];
        saveToDb(STORAGE_KEYS.COMPLETION, next);
        return next;
      });

      // Archive in background asynchronously
      archiveClearedRecords('METFONE_NET', 'METFONE_STOCKOUT_YET_CONFIRM', fullClearedRows, 'SYSTEM_A_AUTO')
        .catch(err => console.error('Error archiving cleared records:', err));

      showNotification(`✅ Completed ${completedExportNosArray.length} records! Moved to Backup`, 'success');
    }

    // Re-index row numbers for GIS-only dataset
    const finalData = gisOnly.map((item, idx) => ({
      ...item,
      no: idx + 1
    }));

    setData(finalData);
    saveToDb(STORAGE_KEYS.DATA, finalData);
    setShowPasteModal(false);
    setPasteData('');
    showNotification(`📊 Import ជោគជ័យ: ${finalData.length} ជួរ GIS (បានច្រោះចេញ non-GIS: ${nonGisCount})`, 'success');
  };

  const clearAllData = async () => {
    if (window.confirm('⚠️ Are you sure you want to delete ALL Metfone Net data?')) {
      if (data && data.length > 0) {
        try {
          await archiveClearedRecords('METFONE_NET', 'METFONE_STOCKOUT_YET_CONFIRM', data, 'MANUAL_CLEAR_ALL');
        } catch (e) {}
      }

      // 1. Immediately reset state in UI
      setData([]);
      setCompletionHistory([]);
      setTargets({});

      // 2. Immediately wipe localStorage cache
      localStorage.removeItem(STORAGE_KEYS.DATA);
      localStorage.removeItem(STORAGE_KEYS.COMPLETION);
      localStorage.removeItem(STORAGE_KEYS.TARGETS);

      showNotification('🧹 Cleared all data!', 'info');

      // 3. Clear database asynchronously in parallel
      Promise.all([
        clearStore(STORAGE_KEYS.DATA),
        clearStore(STORAGE_KEYS.COMPLETION),
        clearStore(STORAGE_KEYS.TARGETS)
      ]).catch(err => {
        console.error("Error clearing DB store:", err);
      });
    }
  };

  const exportToExcel = () => {
    if (filteredData.length === 0) {
      showNotification('⚠️ No data to export!', 'warning');
      return;
    }
    const exportRows = filteredData.map((item, idx) => ({
      'No': idx + 1,
      'Warehouse Stock out': item.exportCode,
      'Export code': item.exportNo,
      'Date real export': item.realExport,
      'Stock reciever': item.stockReceiver || '',
      'Group reciever': item.groupReceiver || '',
      'Construction reciever': item.constructionReceiver || '',
      'Unit': item.unit,
      'Days': item.daysDiff,
      'TEAM': item.team
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '01_STOCKOUT_YET_CONFIRM');
    XLSX.writeFile(wb, `MetfoneNet_Stockout_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('📎 Exported to Excel successfully!', 'success');
  };

  // KPI Calculations
  const calculateKPIData = useMemo(() => {
    const unitGroups = {};
    const gisData = filterGIS ? data.filter(d => d.isGis) : data;

    gisData.forEach(item => {
      const unit = item.unit;
      if (unit && unit !== 'OTHER') {
        if (!unitGroups[unit]) {
          unitGroups[unit] = { count: 0 };
        }
        unitGroups[unit].count++;
      }
    });

    const completedByUnit = {};
    completionHistory.forEach(comp => {
      if (comp.unit && comp.unit !== 'UNKNOWN') {
        completedByUnit[comp.unit] = (completedByUnit[comp.unit] || 0) + 1;
      }
    });

    const kpiRows = [];
    let grandTargetMorning = 0;
    let grandTargetEvening = 0;
    let grandRemain = 0;
    let grandResult = 0;
    let grandTotalRecords = 0;

    allUnits.forEach(unit => {
      const morningTarget = targets[unit]?.morning || 0;
      const eveningTarget = targets[unit]?.evening || 0;
      const target = eveningTarget > 0 ? eveningTarget : morningTarget;
      const currentCount = unitGroups[unit]?.count || 0;
      const completedCount = completedByUnit[unit] || 0;

      const result = completedCount;
      const remain = target > 0 ? Math.max(0, target - result) : currentCount;
      let ratio = 0;
      if (target > 0) {
        ratio = Math.min(100, Math.round((result / target) * 100));
      }

      grandTargetMorning += morningTarget;
      grandTargetEvening += eveningTarget;
      grandRemain += remain;
      grandResult += result;
      grandTotalRecords += currentCount;

      let status = 'No Data';
      if (currentCount > 0 || target > 0 || result > 0) {
        if (target === 0) status = 'No Target';
        else if (ratio >= 100) status = 'Completed';
        else if (ratio >= 70) status = 'Good';
        else if (ratio >= 40) status = 'Warning';
        else status = 'Critical';
      }

      kpiRows.push({
        unit,
        morningTarget,
        eveningTarget,
        remain,
        result,
        ratio,
        total: currentCount,
        status,
        hasData: currentCount > 0
      });
    });

    const grandRatio = grandTargetEvening > 0 ? (grandResult / grandTargetEvening) * 100 : 0;

    return {
      data: kpiRows,
      allData: kpiRows,
      summary: {
        targetMorning: grandTargetMorning,
        targetEvening: grandTargetEvening,
        remain: grandRemain,
        result: grandResult,
        ratio: grandRatio,
        totalRecords: grandTotalRecords
      }
    };
  }, [data, completionHistory, targets, filterGIS]);

  const updateTarget = (unit, period, value) => {
    const val = parseInt(value) || 0;
    setTargets(prev => ({
      ...prev,
      [unit]: {
        ...prev[unit],
        [period]: val
      }
    }));
    showNotification(`🎯 Updated target for ${unit} (${period}): ${val}`, 'info');
  };

  const getStatusBadge = (status) => {
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

  // ─── MODALS ───
  // KPI Modal
  const renderKPIModal = () => {
    if (!showKPIModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-6 h-6 text-white" />
                <div>
                  <h2 className="text-xl font-bold text-white">KPI Dashboard - Metfone Net Performance</h2>
                  <p className="text-purple-100 text-xs">Tracking GIS targets and confirmations</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowKPIModal(false)} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-6 overflow-y-auto flex-1">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-lg">
                <div className="text-xs opacity-90">Target ព្រឹក</div>
                <div className="text-2xl font-bold">{calculateKPIData.summary.targetMorning}</div>
              </div>
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white shadow-lg">
                <div className="text-xs opacity-90">Target ល្ងាច</div>
                <div className="text-2xl font-bold">{calculateKPIData.summary.targetEvening}</div>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white shadow-lg">
                <div className="text-xs opacity-90">Remain</div>
                <div className="text-2xl font-bold">{calculateKPIData.summary.remain}</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white shadow-lg">
                <div className="text-xs opacity-90">Result</div>
                <div className="text-2xl font-bold">{calculateKPIData.summary.result}</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white shadow-lg">
                <div className="text-xs opacity-90">Ratio</div>
                <div className="text-2xl font-bold">{calculateKPIData.summary.ratio.toFixed(1)}%</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-4 text-white shadow-lg">
                <div className="text-xs opacity-90">In System</div>
                <div className="text-2xl font-bold">{calculateKPIData.summary.totalRecords}</div>
              </div>
            </div>

            {/* KPI Table */}
            <div className="border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50 font-bold uppercase tracking-wider text-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left">Unit</th>
                      <th className="px-4 py-3 text-right">ព្រឹក</th>
                      <th className="px-4 py-3 text-right">ល្ងាច</th>
                      <th className="px-4 py-3 text-right">Remain</th>
                      <th className="px-4 py-3 text-right">Result</th>
                      <th className="px-4 py-3 text-right">Ratio</th>
                      <th className="px-4 py-3 text-right">In System</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {calculateKPIData.data.map((item) => (
                      <tr key={item.unit} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-bold text-slate-900">{item.unit}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {editingTarget === `${item.unit}-morning` ? (
                            <input type="number" defaultValue={item.morningTarget} autoFocus onBlur={(e) => { updateTarget(item.unit, 'morning', e.target.value); setEditingTarget(null); }} className="w-16 px-1 py-0.5 text-right border rounded bg-white" />
                          ) : (
                            <span className="cursor-pointer hover:bg-gray-100 px-2 py-0.5 rounded" onClick={() => setEditingTarget(`${item.unit}-morning`)}>{item.morningTarget || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {editingTarget === `${item.unit}-evening` ? (
                            <input type="number" defaultValue={item.eveningTarget} autoFocus onBlur={(e) => { updateTarget(item.unit, 'evening', e.target.value); setEditingTarget(null); }} className="w-16 px-1 py-0.5 text-right border rounded bg-white" />
                          ) : (
                            <span className="cursor-pointer hover:bg-gray-100 px-2 py-0.5 rounded font-bold text-purple-700" onClick={() => setEditingTarget(`${item.unit}-evening`)}>{item.eveningTarget || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-600">{item.remain}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">{item.result}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600">{item.ratio}%</td>
                        <td className="px-4 py-3 text-right text-slate-600">{item.total}</td>
                        <td className="px-4 py-3 text-center">{getStatusBadge(item.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold">
                    <tr>
                      <td className="px-4 py-3">សរុប</td>
                      <td className="px-4 py-3 text-right">{calculateKPIData.summary.targetMorning}</td>
                      <td className="px-4 py-3 text-right">{calculateKPIData.summary.targetEvening}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{calculateKPIData.summary.remain}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{calculateKPIData.summary.result}</td>
                      <td className="px-4 py-3 text-right">{calculateKPIData.summary.ratio.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right">{calculateKPIData.summary.totalRecords}</td>
                      <td className="px-4 py-3 text-center">-</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
            <button onClick={() => setShowKPIModal(false)} className="px-4 py-2 bg-gray-200 rounded-xl hover:bg-gray-300 transition-colors text-xs font-bold">Close</button>
          </div>
        </div>
      </div>
    );
  };

  // Smart Import Modal
  const renderPasteModal = () => {
    if (!showPasteModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white/15">
                  <Upload className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Smart Import Metfone NET</h2>
                  <p className="text-blue-100 text-xs mt-0.5">
                    Paste rows from Excel (Tab-separated) • Stock reciever / Group reciever កន្លែង ចាប់ យកតែGIS
                  </p>
                </div>
              </div>
              <button onClick={() => setShowPasteModal(false)} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-6">
            <textarea 
              value={pasteData} 
              onChange={(e) => setPasteData(e.target.value)} 
              placeholder="Paste Excel rows here...&#10;&#10;Format: No, Warehouse Stock out, Export code, Date real export, Stock reciever, Group reciever, Construction reciever&#10;&#10;💡 ប្រព័ន្ធនឹងស្រង់យកតែជួរណាដែលមាន GIS ក្នុង Stock receiver ឬ Group receiver តាមតម្រូវការ" 
              className="w-full h-64 px-4 py-3 border border-slate-300 rounded-xl font-mono text-xs bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />

            {data.length > 0 && (
              <div className="mt-3 p-2.5 bg-amber-50 rounded-xl text-xs text-amber-800 border border-amber-200">
                ⚠️ Current data has {data.length} record(s). Import will replace existing data.
              </div>
            )}
          </div>
          <div className="p-4 border-t bg-gray-50 rounded-b-2xl flex justify-end gap-3">
            <button onClick={() => { setShowPasteModal(false); setPasteData(''); }} className="px-4 py-2 bg-gray-200 rounded-xl hover:bg-gray-300 transition-colors text-xs font-bold">Cancel</button>
            <button onClick={handleSmartImport} disabled={!pasteData.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-black flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Smart Import
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Alarm Modal
  const renderAlarmModal = () => {
    if (!showAlarmModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full mx-4 overflow-hidden flex flex-col max-h-[85vh]">
          <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white/15 animate-bounce">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">METFONE NET ALARM DETECTED!</h2>
                  <p className="text-rose-100 text-xs">{alarmItems.length} record(s) exceed {alarmThreshold}-day threshold</p>
                </div>
              </div>
              <button onClick={() => { setShowAlarmModal(false); setAlarmSearchTerm(''); setSelectedAlarmUnit(''); }} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="px-6 py-3 bg-gray-50 border-b flex gap-2 justify-between items-center">
            <select
              value={selectedAlarmUnit}
              onChange={(e) => setSelectedAlarmUnit(e.target.value)}
              className="px-3 py-1.5 border rounded-xl text-xs bg-white w-40 font-bold"
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
              className="flex-1 px-3 py-1.5 border rounded-xl text-xs bg-white font-medium"
            />
            <button onClick={copyAlarmsToClipboard} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer">
              <Copy className="w-3.5 h-3.5" /> Copy ({filteredAlarmItems.length})
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            {filteredAlarmItems.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <div className="text-3xl mb-2">🔍</div>
                <p>No alarm items match your search.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-rose-100 rounded-2xl shadow-xs">
                <table className="min-w-full divide-y divide-rose-100 text-left text-xs bg-white">
                  <thead className="bg-rose-50/50 text-rose-900 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-3 py-2 text-center">#</th>
                      <th className="px-3 py-2">Warehouse Stock out</th>
                      <th className="px-3 py-2">Export Code</th>
                      <th className="px-3 py-2">Stock Rec</th>
                      <th className="px-3 py-2">Group Rec</th>
                      <th className="px-3 py-2">Construction</th>
                      <th className="px-3 py-2 text-center">Days</th>
                      <th className="px-3 py-2 text-center">TEAM</th>
                      <th className="px-3 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {filteredAlarmItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-rose-50/30 transition-colors">
                        <td className="px-3 py-2 font-bold text-gray-400 text-center">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-gray-700">{item.exportCode || '-'}</td>
                        <td className="px-3 py-2 font-mono font-bold text-indigo-700">{item.exportNo || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{item.stockReceiver || '-'}</td>
                        <td className="px-3 py-2 text-gray-700 font-semibold">{item.groupReceiver || '-'}</td>
                        <td className="px-3 py-2 text-gray-600 font-mono text-[10px] truncate max-w-xs">{item.constructionReceiver || '-'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
                            +{item.daysDiff}d
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-xl font-bold bg-purple-50 text-purple-700 border border-purple-100 font-mono text-[10px]">
                            {item.team || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => setDismissedItems(prev => new Set([...prev, item.id]))} className="px-2 py-1 text-[11px] font-semibold text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors shadow-2xs cursor-pointer">Dismiss</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
            <button onClick={() => { setShowAlarmModal(false); setAlarmSearchTerm(''); setSelectedAlarmUnit(''); }} className="px-4 py-2 bg-gray-200 rounded-xl hover:bg-gray-300 transition-colors text-xs font-bold">Close</button>
            <button onClick={() => { setDismissedItems(prev => new Set([...prev, ...alarmItems.map(i => i.id)])); setShowAlarmModal(false); setAlarmSearchTerm(''); setSelectedAlarmUnit(''); }} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-colors shadow-md">Dismiss All</button>
          </div>
        </div>
      </div>
    );
  };

  // Floating Buttons (KPI is accessible via top ribbon and stats summary bar)
  const renderFloatingButtons = () => {
    if (alarmCount === 0 || showAlarmModal) return null;
    return (
      <div className="fixed bottom-20 right-6 flex flex-col gap-3 z-40">
        <button onClick={() => setShowAlarmModal(true)} className="bg-rose-600 text-white px-4 py-2.5 rounded-full shadow-xl animate-bounce flex items-center gap-2 hover:bg-rose-700 transition-colors cursor-pointer border-2 border-white">
          <AlertTriangle className="w-5 h-5 text-white" />
          <span className="font-black text-sm">{alarmCount}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="w-full h-screen max-h-screen p-0 sm:p-0.5 bg-slate-100 flex flex-col overflow-hidden">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-[75px] right-4 sm:right-6 z-[9999998] max-w-[340px] w-full rounded-xl shadow-2xl backdrop-blur-md border border-slate-700/70 bg-slate-900/95 text-slate-100 overflow-hidden select-none pointer-events-auto transition-all duration-200 animate-toast-in ${
          notification.type === 'success' ? 'border-l-4 border-l-emerald-500 shadow-emerald-950/30' :
          notification.type === 'warning' ? 'border-l-4 border-l-amber-500 shadow-amber-950/30' :
          notification.type === 'error' ? 'border-l-4 border-l-rose-500 shadow-rose-950/30' :
          'border-l-4 border-l-blue-500 shadow-blue-950/30'
        }`}>
          <div className="p-2.5 sm:p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> :
                 notification.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" /> :
                 <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                <span className={`text-[10.5px] font-bold tracking-wide uppercase ${
                  notification.type === 'success' ? 'text-emerald-400' :
                  notification.type === 'warning' ? 'text-amber-400' :
                  notification.type === 'error' ? 'text-rose-400' : 'text-blue-400'
                }`}>
                  {notification.type === 'success' ? 'Success' : notification.type === 'error' ? 'Error' : 'Notification'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer leading-none text-xs">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-[11.5px] font-medium text-slate-200 mt-1 pl-5.5 leading-snug">{notification.message}</p>
          </div>
          <div className="h-0.5 bg-slate-800 w-full overflow-hidden">
            <div className={`h-full ${
              notification.type === 'success' ? 'bg-emerald-500' :
              notification.type === 'warning' ? 'bg-amber-500' :
              notification.type === 'error' ? 'bg-rose-500' : 'bg-blue-500'
            } animate-toast-bar`}></div>
          </div>
        </div>
      )}

      {/* ─── MODALS ─── */}
      {renderKPIModal()}
      {renderPasteModal()}
      {renderAlarmModal()}
      {renderFloatingButtons()}

      {/* ─── MAIN CONTENT CONTAINER (FULL SCREEN FLEX) ─── */}
      <div className="bg-white rounded-none sm:rounded-lg shadow-xs border-0 sm:border border-slate-200 flex-1 flex flex-col h-full overflow-hidden">
        
        {/* ─── ENTERPRISE COMPACT HEADER RIBBON ─── */}
        <div className="bg-slate-900 border-b border-slate-800 px-3.5 py-1.5 text-white flex-shrink-0">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="p-1 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-400/30">
                <PackageCheck className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xs sm:text-sm font-black tracking-tight text-white uppercase">
                  01_STOCKOUT_YET CONFIRM
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 font-mono text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>LIVE • {currentTime.toLocaleTimeString()}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px] hidden xl:inline mr-1">
                <strong className="text-slate-200">STEP 1:</strong> តាមដាន Warehouse Stock out Metfone NET
              </span>
              <button 
                onClick={clearAllData} 
                className="inline-flex items-center gap-1.5 bg-slate-800/90 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800 text-slate-300 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border border-slate-700 shadow-2xs cursor-pointer"
                title="សម្អាតទិន្នន័យទាំងអស់"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear All</span>
              </button>
              <button 
                onClick={() => setShowKPIModal(true)} 
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg text-[11px] font-bold transition-all shadow-xs cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>KPI Matrix</span>
              </button>
            </div>
          </div>
        </div>

        {/* ─── ACTION TOOLBAR ─── */}
        <div className="px-3.5 py-1.5 bg-slate-50 border-b border-slate-200 flex-shrink-0">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            {/* Left Actions & Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <button 
                onClick={() => setShowPasteModal(true)} 
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all text-xs font-bold shadow-xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Smart Import</span>
              </button>
              <button 
                onClick={exportToExcel} 
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-all text-xs font-bold shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>

              {selectedRows.size > 0 && (
                <button 
                  onClick={deleteSelectedRows} 
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-all text-xs font-bold shadow-xs cursor-pointer animate-fadeIn"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Complete ({selectedRows.size})</span>
                </button>
              )}

              {/* Days Quick Filter Pills */}
              <div className="flex items-center gap-1 ml-1 pl-2.5 border-l border-slate-200 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 mr-0.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>Days:</span>
                </span>
                {[
                  { id: 'ALL', label: 'All' },
                  { id: '0', label: '0d' },
                  { id: '1-3', label: '1-3d' },
                  { id: '4-6', label: '4-6d' },
                  { id: '>=4', label: '≥4d Alarms' },
                  { id: '>=7', label: '≥7d Critical' },
                ].map(pill => (
                  <button
                    key={pill.id}
                    onClick={() => { setDaysFilter(pill.id); setCurrentPage(1); }}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                      daysFilter === pill.id 
                        ? 'bg-blue-600 text-white shadow-xs font-black' 
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs'
                    }`}
                  >
                    <span>{pill.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Threshold, Search, Density, Fit, Stats Toggle */}
            <div className="flex gap-2 items-center flex-wrap">
              <div className="flex items-center gap-1.5 bg-amber-50/80 border border-amber-200/80 px-2 py-0.5 rounded-lg shadow-2xs text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span className="font-bold text-amber-900 text-[10.5px]">Threshold ≥</span>
                <input 
                  type="number" 
                  value={alarmThreshold} 
                  onChange={(e) => setAlarmThreshold(parseInt(e.target.value) || 4)} 
                  className="w-9 px-1 py-0 text-xs font-mono font-bold border border-amber-300 rounded text-center bg-white" 
                  min="1"
                />
                <span className="font-bold text-amber-900 text-[10.5px]">days</span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input 
                  type="text" 
                  placeholder="Search export code, receiver, team..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  className="w-44 sm:w-56 pl-8 pr-7 py-1 text-xs font-medium border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs" 
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')} 
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Density Toggle (Ultra 70 rows / Compact / Standard) */}
              <button
                onClick={() => setTableDensity(prev => prev === 'ultra' ? 'compact' : prev === 'compact' ? 'normal' : 'ultra')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
                  tableDensity === 'ultra'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                    : tableDensity === 'compact'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title="ចុចដើម្បីប្តូរទំហំជួរដេក (Ultra 70 rows → Compact → Standard)"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>
                  {tableDensity === 'ultra' ? 'Ultra View (70 rows)' : tableDensity === 'compact' ? 'Compact (45 rows)' : 'Standard'}
                </span>
              </button>

              {/* Fit Screen / Scroll Mode Toggle */}
              <button
                onClick={() => setIsFitScreen(prev => !prev)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
                  isFitScreen 
                    ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' 
                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                }`}
                title={isFitScreen ? 'Switch to Expanded (Horizontal Scroll)' : 'Switch to Fit Screen (100% Responsive)'}
              >
                {isFitScreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Fit Screen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
                    <span>Expanded</span>
                  </>
                )}
              </button>

              {/* Stats Ribbon Toggle */}
              <button
                onClick={() => setShowStatsBar(prev => !prev)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
                title={showStatsBar ? 'លាក់របារស្ថិតិ (Hide Stats bar) ដើម្បីពង្រីកតារាងឱ្យវែងបំផុត' : 'បង្ហាញរបារស្ថិតិ (Show Stats bar)'}
              >
                {showStatsBar ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* ─── STATS SUMMARY BAR (HIGH-DENSITY METRICS RIBBON) ─── */}
        {showStatsBar && (
        <div className="px-3.5 py-1 bg-slate-100/80 border-b border-slate-200 grid grid-cols-3 sm:grid-cols-6 gap-1.5 flex-shrink-0 text-xs">
          <div className="bg-white rounded-lg px-2.5 py-1 border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500 flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" />
              <span>In System</span>
            </span>
            <span className="text-xs font-mono font-black text-slate-900">{data.length}</span>
          </div>

          <div className="bg-white rounded-lg px-2.5 py-1 border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>GIS Records</span>
            </span>
            <span className="text-xs font-mono font-black text-emerald-700">{filteredData.length}</span>
          </div>

          <div className="bg-white rounded-lg px-2.5 py-1 border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[10px] text-blue-600">Selected</span>
            <span className="text-xs font-mono font-black text-blue-700">{selectedRows.size}</span>
          </div>

          <div className="bg-white rounded-lg px-2.5 py-1 border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[10px] text-amber-600">Threshold</span>
            <span className="text-xs font-mono font-black text-amber-700">≥{alarmThreshold}d</span>
          </div>

          <div 
            className={`bg-white rounded-lg px-2.5 py-1 border shadow-2xs cursor-pointer flex items-center justify-between hover:bg-rose-50/50 transition-all ${
              alarmCount > 0 ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200/80'
            }`} 
            onClick={() => { if (alarmCount > 0) setShowAlarmModal(true); }}
            title={alarmCount > 0 ? 'Click to view Alarms' : ''}
          >
            <span className="font-bold uppercase tracking-wider text-[10px] text-rose-700 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-rose-500" />
              <span>Alarms</span>
            </span>
            <span className={`text-xs font-mono font-black ${alarmCount > 0 ? 'text-rose-600 animate-pulse' : 'text-slate-400'}`}>
              {alarmCount}
            </span>
          </div>

          <div 
            className="bg-white rounded-lg px-2.5 py-1 border border-slate-200/80 shadow-2xs flex items-center justify-between cursor-pointer hover:bg-indigo-50/50 transition-all" 
            onClick={() => setShowKPIModal(true)}
            title="Click to view KPI Matrix"
          >
            <span className="font-bold uppercase tracking-wider text-[10px] text-indigo-600 flex items-center gap-1">
              <BarChart3 className="w-3 h-3 text-indigo-500" />
              <span>Cleared Result</span>
            </span>
            <span className="text-xs font-mono font-black text-indigo-700">{completionHistory.length}</span>
          </div>
        </div>
        )}

        {/* ─── DATA GRID TABLE (ENTERPRISE SPREADSHEET MATRIX) ─── */}
        <div className="flex-1 min-h-0 overflow-auto bg-white">
          <table className="min-w-full border-collapse border border-slate-200 leading-tight table-auto">
            <thead>
              <tr className="bg-slate-900 text-slate-200 font-bold uppercase tracking-wider text-[10px]">
                <th className={`border border-slate-800 text-center sticky top-0 z-20 bg-slate-900 w-8 ${
                  tableDensity === 'ultra' ? 'px-1 py-0.5' : tableDensity === 'compact' ? 'px-1.5 py-1' : 'px-2 py-1.5'
                }`}>
                  <input 
                    type="checkbox" 
                    checked={selectedRows.size === filteredData.length && filteredData.length > 0} 
                    onChange={toggleSelectAll} 
                    className="rounded border-slate-600 cursor-pointer" 
                  />
                </th>
                {columns.map(col => (
                  <th 
                    key={col.key} 
                    onClick={() => {
                      if (col.key === 'daysDiff') {
                        setDaysSortOrder(prev => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none');
                      }
                    }}
                    className={`border border-slate-800 font-black whitespace-nowrap sticky top-0 z-20 bg-slate-900 ${col.width} ${col.align || 'text-left'} ${
                      tableDensity === 'ultra' ? 'px-1.5 py-0.5 text-[9px]' : tableDensity === 'compact' ? 'px-2 py-1 text-[9.5px]' : 'px-2.5 py-1.5 text-[10px]'
                    } ${
                      col.key === 'daysDiff' ? 'cursor-pointer hover:bg-slate-800 select-none text-amber-400' : ''
                    }`}
                    title={col.key === 'daysDiff' ? 'Click to sort by Days (Descending / Ascending)' : ''}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>{col.label}</span>
                      {col.key === 'daysDiff' && (
                        <span>
                          {daysSortOrder === 'desc' ? (
                            <ArrowDown className="w-3 h-3 text-amber-400 inline" />
                          ) : daysSortOrder === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-amber-400 inline" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 inline" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-normal text-slate-800 bg-white">
              {paginatedData.map((item) => {
                const isAlarm = item.daysDiff >= alarmThreshold && !dismissedItems.has(item.id);
                const cellPy = tableDensity === 'ultra' ? 'py-0.25' : tableDensity === 'compact' ? 'py-0.5' : 'py-1';
                return (
                  <tr key={item.id} className={`transition-colors ${isAlarm ? 'bg-rose-50/90 font-semibold' : selectedRows.has(item.id) ? 'bg-blue-50/90' : 'even:bg-slate-50/60 hover:bg-blue-50/50'}`}>
                    <td className={`border border-slate-200 px-1 ${cellPy} text-center bg-white/50`}>
                      <input type="checkbox" checked={selectedRows.has(item.id)} onChange={() => toggleRowSelection(item.id)} className="rounded cursor-pointer" />
                    </td>
                    <td className={`border border-slate-200 px-1 ${cellPy} text-slate-500 font-bold text-center bg-slate-100/70 text-[10px]`}>{item.no}</td>
                    
                    {/* Warehouse Stock out */}
                    <td className={`border border-slate-200 px-1.5 ${cellPy} font-mono font-bold text-slate-900 whitespace-nowrap text-[10px]`}>
                      {editingCell?.id === item.id && editingCell?.field === 'exportCode' ? (
                        <input type="text" defaultValue={item.exportCode} autoFocus onBlur={(e) => saveEdit(item.id, 'exportCode', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'exportCode')} className="w-full px-0.5 py-0 border border-blue-500 rounded text-[9.5px] bg-white font-mono" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'exportCode', item.exportCode)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded transition-colors font-mono whitespace-nowrap">{item.exportCode || '-'}</div>
                      )}
                    </td>

                    {/* Export code */}
                    <td className={`border border-slate-200 px-1.5 ${cellPy} font-mono font-bold text-slate-900 whitespace-nowrap min-w-[170px] text-[10px]`}>
                      {editingCell?.id === item.id && editingCell?.field === 'exportNo' ? (
                        <input type="text" defaultValue={item.exportNo} autoFocus onBlur={(e) => saveEdit(item.id, 'exportNo', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'exportNo')} className="w-full px-0.5 py-0 border border-blue-500 rounded text-[9.5px] bg-white font-mono" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'exportNo', item.exportNo)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded transition-colors font-mono whitespace-nowrap text-indigo-700">{item.exportNo || '-'}</div>
                      )}
                    </td>

                    {/* Date real export */}
                    <td className={`border border-slate-200 px-1.5 ${cellPy} text-center font-mono text-slate-700 whitespace-nowrap text-[10px]`}>
                      {editingCell?.id === item.id && editingCell?.field === 'realExport' ? (
                        <input type="text" defaultValue={item.realExport} placeholder="DD/MM/YYYY" autoFocus onBlur={(e) => saveEdit(item.id, 'realExport', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'realExport')} className="w-full px-0.5 py-0 border border-blue-500 rounded text-[9.5px] text-center bg-white font-mono" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'realExport', item.realExport)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded text-center transition-colors font-mono">{item.realExport || '-'}</div>
                      )}
                    </td>

                    {/* Stock reciever */}
                    <td className={`border border-slate-200 px-1.5 ${cellPy} whitespace-normal break-words text-slate-800 text-[10px]`}>
                      <div onClick={() => startEdit(item.id, 'stockReceiver', item.stockReceiver)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded transition-colors">
                        {item.stockReceiver?.toUpperCase().includes('GIS') ? (
                          <span className="text-emerald-700 font-bold">{item.stockReceiver}</span>
                        ) : item.stockReceiver || '-'}
                      </div>
                    </td>

                    {/* Group reciever */}
                    <td className={`border border-slate-200 px-1.5 ${cellPy} whitespace-normal break-words text-slate-800 text-[10px]`}>
                      <div onClick={() => startEdit(item.id, 'groupReceiver', item.groupReceiver)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded transition-colors">
                        {item.groupReceiver?.toUpperCase().includes('GIS') ? (
                          <span className="text-emerald-700 font-bold">{item.groupReceiver}</span>
                        ) : item.groupReceiver || '-'}
                      </div>
                    </td>

                    {/* Construction reciever */}
                    <td className={`border border-slate-200 px-1.5 ${cellPy} whitespace-normal break-words text-slate-800 text-[10px]`}>
                      <div onClick={() => startEdit(item.id, 'constructionReceiver', item.constructionReceiver)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded transition-colors">
                        {item.constructionReceiver || '-'}
                      </div>
                    </td>

                    {/* Unit */}
                    <td className={`border border-slate-200 px-1 ${cellPy} text-center whitespace-nowrap`}>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-extrabold ${isAlarm ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-100 text-slate-800 border border-slate-200'}`}>{item.unit}</span>
                    </td>

                    {/* Days */}
                    <td className={`border border-slate-200 px-1 ${cellPy} text-center font-bold whitespace-nowrap`}>
                      <span className={`inline-flex px-1.5 py-0.5 rounded font-mono text-[9px] font-black ${
                        item.daysDiff >= alarmThreshold ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse' :
                        item.daysDiff > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {item.daysDiff > 0 ? `+${item.daysDiff}` : item.daysDiff} d
                      </span>
                    </td>

                    {/* TEAM */}
                    <td className={`border border-slate-200 px-1 ${cellPy} text-center whitespace-nowrap font-mono font-bold text-purple-700 bg-purple-50/70 text-[10px]`}>
                      {item.team || '-'}
                    </td>
                  </tr>
                );
              })}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="border border-slate-200 px-6 py-12 text-center text-slate-400 font-bold text-sm bg-white">
                    <div className="flex flex-col items-center gap-2">
                      <Inbox className="w-10 h-10 text-slate-300" />
                      <p className="text-base font-bold text-slate-700">No data in system</p>
                      <p className="text-xs text-slate-400">Click "Smart Import" to import data</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ─── PAGINATION BAR ─── */}
        <div className="bg-slate-50 px-3.5 py-1.5 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-700 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-500">Show</span>
            <select 
              value={pageSize} 
              onChange={(e) => { 
                const val = e.target.value;
                setPageSize(val === 'ALL' ? 'ALL' : parseInt(val)); 
                setCurrentPage(1); 
              }} 
              className="border border-slate-200 rounded-md px-2 py-0.5 bg-white font-bold text-slate-800 shadow-2xs text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={70}>70</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value="ALL">All</option>
            </select>
            <span className="font-semibold text-slate-500">entries</span>
            <span className="text-slate-300">|</span>
            <span className="font-bold text-slate-800">
              Showing {totalItems > 0 ? (pageSize === 'ALL' ? 1 : (currentPage - 1) * pageSize + 1) : 0} to {pageSize === 'ALL' ? totalItems : Math.min(currentPage * pageSize, totalItems)} of {totalItems} entries
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
              disabled={currentPage === 1}
              className={`px-2.5 py-1 rounded-md border font-bold text-xs cursor-pointer transition-colors ${
                currentPage === 1 
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' 
                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50 shadow-2xs'
              }`}
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
                  className={`px-2.5 py-1 rounded-md border text-xs font-black cursor-pointer transition-colors ${
                    currentPage === pageNum 
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs' 
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
              disabled={currentPage === totalPages}
              className={`px-2.5 py-1 rounded-md border font-bold text-xs cursor-pointer transition-colors ${
                currentPage === totalPages 
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' 
                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50 shadow-2xs'
              }`}
            >
              Next
            </button>
          </div>
        </div>

        {/* ─── FOOTER STATUS STRIP ─── */}
        <div className="bg-slate-100/90 px-4 py-1 border-t border-slate-200 text-[11px] font-semibold text-slate-600 flex justify-between items-center flex-wrap gap-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-slate-400" />
              <span>In System: <strong>{data.length}</strong> rows</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>GIS: <strong>{filteredData.length}</strong> rows</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5 text-rose-700">
              <AlertCircle className="w-3 h-3 text-rose-500" />
              <span>Alarms: <strong>{alarmCount}</strong></span>
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.25s ease-out; }
        .animate-bounce { animation: bounce 1s infinite; }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .animate-pulse { animation: pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
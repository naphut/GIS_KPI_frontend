import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { loadFromDb, saveToDb } from '../../services/dbStore';

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
  TARGETS: 'metfone_stockout_targets',
  TARGET_HISTORY: 'metfone_stockout_targetHistory'
};
export const INITIAL_METFONE_DATA = [];

// Helper to extract Unit from Metfone strings
const getUnitFromMetfoneReceiver = (groupReceiver, stockReceiver, exportCode, exportNo) => {
  const str = (groupReceiver || stockReceiver || '').toUpperCase().replace(/\s+/g, '');
  
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
  if (grp && grp !== '-') return grp;
  const stk = (stockReceiver || '').trim();
  if (stk && stk !== '-') return stk;
  return '-';
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
  const [showTargetHistoryModal, setShowTargetHistoryModal] = useState(false);
  const [targets, setTargets] = useState({});
  const [targetHistory, setTargetHistory] = useState([]);
  const [editingTarget, setEditingTarget] = useState(null);
  const [notification, setNotification] = useState(null);

  // Pagination & Days Filter State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [daysFilter, setDaysFilter] = useState('ALL');
  const [daysSortOrder, setDaysSortOrder] = useState('none');

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

  // Enrich item with computed fields
  const enrichItem = (item, index) => {
    const stockRec = item.stockReceiver || '';
    const groupRec = item.groupReceiver || '';
    const isGis = (stockRec.toUpperCase().includes('GIS') || groupRec.toUpperCase().includes('GIS'));
    return {
      ...item,
      id: item.id || `mf-${Date.now()}-${index}`,
      no: index + 1,
      unit: getUnitFromMetfoneReceiver(groupRec, stockRec, item.exportCode, item.exportNo),
      team: getTeamFromReceiver(stockRec, groupRec),
      daysDiff: calculateDaysDiff(item.realExport),
      isGis
    };
  };

  // Columns definition (matching exact Excel format)
  const columns = [
    { key: 'no', label: '#', width: 'w-8', align: 'text-center' },
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
      const dbTargetHistory = await loadFromDb(STORAGE_KEYS.TARGET_HISTORY, []);
      setTargetHistory(dbTargetHistory || []);

      if (dbData && Array.isArray(dbData) && dbData.length > 0) {
        const enriched = dbData.map((item, idx) => enrichItem(item, idx));
        setData(enriched);
      } else {
        setData([]);
      }
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

  // Filtered Data Computation
  const filteredData = useMemo(() => {
    let filtered = data;

    // Fulfill user requirement: Stock receiver / Group receiver: កន្លែង ចាប់ យកតែGIS
    if (filterGIS) {
      filtered = filtered.filter(item => item.isGis);
    }

    // Days Filter
    if (daysFilter !== 'ALL') {
      if (daysFilter === '0') {
        filtered = filtered.filter(item => (item.daysDiff || 0) === 0);
      } else if (daysFilter === '1-3') {
        filtered = filtered.filter(item => (item.daysDiff || 0) >= 1 && (item.daysDiff || 0) <= 3);
      } else if (daysFilter === '4-6') {
        filtered = filtered.filter(item => (item.daysDiff || 0) >= 4 && (item.daysDiff || 0) <= 6);
      } else if (daysFilter === '>=4') {
        filtered = filtered.filter(item => (item.daysDiff || 0) >= alarmThreshold);
      } else if (daysFilter === '>=7') {
        filtered = filtered.filter(item => (item.daysDiff || 0) >= 7);
      }
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const isTermUnit = allUnits.some(u => u.toLowerCase() === term) || term === 'other';
      filtered = filtered.filter(item => {
        if (isTermUnit) {
          return item.unit?.toLowerCase() === term;
        }
        return (
          item.exportCode?.toLowerCase().includes(term) ||
          item.exportNo?.toLowerCase().includes(term) ||
          item.realExport?.toLowerCase().includes(term) ||
          item.stockReceiver?.toLowerCase().includes(term) ||
          item.groupReceiver?.toLowerCase().includes(term) ||
          item.constructionReceiver?.toLowerCase().includes(term) ||
          item.unit?.toLowerCase().includes(term) ||
          item.team?.toLowerCase().includes(term)
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

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) return;
    const confirmMsg = `✅ Are you sure you want to complete/clear ${selectedRows.size} selected items?`;
    if (window.confirm(confirmMsg)) {
      const completedItems = data.filter(item => selectedRows.has(item.id)).map(item => ({
        exportNo: item.exportNo,
        completedAt: new Date().toISOString(),
        unit: item.unit || 'UNKNOWN'
      }));
      setCompletionHistory(prev => [...completedItems, ...prev]);
      setData(prev => prev.filter(item => !selectedRows.has(item.id)));
      setSelectedRows(new Set());
      showNotification(`✅ Completed ${completedItems.length} records!`, 'success');
    }
  };

  // Inline Cell Editing
  const startEdit = (id, field, value) => {
    setEditingCell({ id, field, value });
  };

  const saveEdit = (id, field, value) => {
    setData(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        return enrichItem(updated, updated.no - 1);
      }
      return item;
    }));
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
    const lines = text.trim().split('\n');
    let startRow = 0;
    
    const firstLine = lines[0].toLowerCase();
    if (
      firstLine.includes('warehouse') || 
      firstLine.includes('export') || 
      firstLine.includes('receiver') || 
      firstLine.includes('date') || 
      firstLine.includes('stock') ||
      firstLine.includes('construction')
    ) {
      startRow = 1;
    }

    const rows = [];
    for (let i = startRow; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split('\t');
      if (cols.length === 1 && line.includes('  ')) {
        const spaceCols = line.split(/\s{2,}/);
        if (spaceCols.length >= 3) {
          cols.splice(0, cols.length, ...spaceCols);
        }
      }

      let offset = 0;
      if (/^\d+$/.test(cols[0].trim())) {
        offset = 1;
      }

      const exportCode = cols[offset + 0] ? cols[offset + 0].trim() : '';
      const exportNo = cols[offset + 1] ? cols[offset + 1].trim() : '';
      const realExport = cols[offset + 2] ? cols[offset + 2].trim() : '';
      const stockReceiver = cols[offset + 3] ? cols[offset + 3].trim() : '';
      const groupReceiver = cols[offset + 4] ? cols[offset + 4].trim() : '';
      const constructionReceiver = cols[offset + 5] ? cols[offset + 5].trim() : '';

      if (exportCode || exportNo) {
        rows.push({
          exportCode,
          exportNo,
          realExport,
          stockReceiver,
          groupReceiver,
          constructionReceiver
        });
      }
    }
    return rows;
  };

  const handleSmartImport = () => {
    const rawList = parsePastedData(pasteData);
    if (rawList.length === 0) {
      showNotification('❌ មិនមានទិន្នន័យត្រឹមត្រូវសម្រាប់ Import ទេ!', 'warning');
      return;
    }

    const enriched = rawList.map((item, idx) => enrichItem(item, idx));
    const gisCount = enriched.filter(item => item.isGis).length;
    const nonGisCount = enriched.length - gisCount;

    setData(enriched);
    saveToDb(STORAGE_KEYS.DATA, enriched);
    setShowPasteModal(false);
    setPasteData('');
    showNotification(`📊 Import ជោគជ័យ: ${enriched.length} ជួរ (GIS: ${gisCount}, Excluded non-GIS: ${nonGisCount})`, 'success');
  };

  const clearAllData = async () => {
    if (window.confirm('⚠️ Are you sure you want to delete ALL Metfone Net data?')) {
      setData([]);
      setCompletionHistory([]);
      setTargets({});
      setTargetHistory([]);
      saveToDb(STORAGE_KEYS.DATA, []);
      saveToDb(STORAGE_KEYS.COMPLETION, []);
      saveToDb(STORAGE_KEYS.TARGETS, {});
      saveToDb(STORAGE_KEYS.TARGET_HISTORY, []);
      showNotification('🧹 Cleared all data!', 'info');
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
  // Target History Modal
  const renderTargetHistoryModal = () => {
    if (!showTargetHistoryModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📜</span>
                <h2 className="text-xl font-bold text-white">Target Change History</h2>
              </div>
              <button onClick={() => setShowTargetHistoryModal(false)} className="text-white/80 hover:text-white text-2xl cursor-pointer">✕</button>
            </div>
          </div>
          <div className="p-6 overflow-y-auto flex-1">
            {targetHistory.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <div className="text-4xl mb-2">📭</div>
                <p>No target changes recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {targetHistory.map(history => (
                  <div key={history.id} className="bg-gray-50 rounded-xl p-4 border-l-4 border-blue-500">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-lg text-gray-800">{history.unit}</div>
                        <div className="text-sm text-gray-600">
                          {history.oldTarget !== null ? (
                            <>Changed from <span className="line-through text-rose-500">{history.oldTarget}</span> → <span className="text-emerald-600 font-bold">{history.newTarget}</span></>
                          ) : (
                            <>Target: <span className="text-emerald-600 font-bold">{history.newTarget}</span></>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{history.reason}</div>
                      </div>
                      <div className="text-xs text-gray-400">{new Date(history.changedAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-4 border-t bg-gray-50 flex justify-end">
            <button onClick={() => setShowTargetHistoryModal(false)} className="px-4 py-2 bg-gray-200 rounded-xl hover:bg-gray-300 transition-colors text-xs font-bold cursor-pointer">Close</button>
          </div>
        </div>
      </div>
    );
  };

  // KPI Modal
  const renderKPIModal = () => {
    if (!showKPIModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <h2 className="text-xl font-bold text-white">KPI Dashboard - Metfone Net Performance</h2>
                  <p className="text-purple-100 text-xs">Tracking GIS targets and confirmations</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowTargetHistoryModal(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-sm transition-colors">📜 History</button>
                <button onClick={() => setShowKPIModal(false)} className="text-white/80 hover:text-white text-2xl">✕</button>
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
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🔄</span> Smart Import Metfone NET
                </h2>
                <p className="text-blue-100 text-xs mt-0.5">
                  Paste rows from Excel (Tab-separated) • Stock reciever / Group reciever កន្លែង ចាប់ យកតែGIS
                </p>
              </div>
              <button onClick={() => setShowPasteModal(false)} className="text-white/80 hover:text-white text-2xl">✕</button>
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
            <button onClick={handleSmartImport} disabled={!pasteData.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-black">🔄 Smart Import</button>
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
                <span className="animate-bounce text-2xl">🚨</span>
                <div>
                  <h2 className="text-xl font-bold text-white">METFONE NET ALARM DETECTED!</h2>
                  <p className="text-rose-100 text-xs">{alarmItems.length} record(s) exceed {alarmThreshold}-day threshold</p>
                </div>
              </div>
              <button onClick={() => { setShowAlarmModal(false); setAlarmSearchTerm(''); setSelectedAlarmUnit(''); }} className="text-white/80 hover:text-white text-2xl">✕</button>
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
              📋 Copy ({filteredAlarmItems.length})
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
          <span className="text-lg">🚨</span>
          <span className="font-black text-sm">{alarmCount}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="w-full h-screen max-h-screen p-1 sm:p-1.5 bg-slate-100 flex flex-col overflow-hidden">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-xl shadow-xl text-white text-xs font-bold flex items-center gap-2 animate-bounce ${
          notification.type === 'success' ? 'bg-emerald-600' :
          notification.type === 'warning' ? 'bg-amber-600' :
          notification.type === 'error' ? 'bg-rose-600' : 'bg-blue-600'
        }`}>
          <span>{notification.message}</span>
        </div>
      )}

      {/* ─── MODALS ─── */}
      {renderTargetHistoryModal()}
      {renderKPIModal()}
      {renderPasteModal()}
      {renderAlarmModal()}
      {renderFloatingButtons()}

      {/* ─── MAIN CONTENT CONTAINER (FULL SCREEN FLEX EXACT STYLE) ─── */}
      <div className="bg-white rounded-lg shadow-xl border border-slate-300 flex-1 flex flex-col h-full overflow-hidden">
        
        {/* ─── COMPACT EXCEL HEADER RIBBON ─── */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 px-3 py-1 border-b border-slate-900 text-white flex-shrink-0">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                  <span>📦</span> 01_STOCKOUT_YET CONFIRM
                </h1>
                <span className="bg-blue-500/30 text-blue-200 text-[9px] font-mono px-1.5 py-0.25 rounded-full uppercase tracking-wider border border-blue-400/30 font-bold">
                  🟢 SYSTEM METFONE NET • LIVE • {currentTime.toLocaleTimeString()}
                </span>
              </div>
            </div>
            <div className="flex gap-1.5 items-center">
              <span className="text-slate-300 text-[10px] hidden lg:inline mr-2">
                <strong>STEP 1:</strong> តាមដាន Warehouse Stock out Metfone NET
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
              <button onClick={() => setShowPasteModal(true)} className="px-2.5 py-0.5 bg-emerald-700 text-white rounded hover:bg-emerald-800 transition-all text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer">🔄 Smart Import</button>
              <button onClick={exportToExcel} className="px-2.5 py-0.5 bg-slate-800 text-white rounded hover:bg-slate-900 transition-all text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer">📎 Export Excel</button>
              {selectedRows.size > 0 && (
                <button onClick={deleteSelectedRows} className="px-2.5 py-0.5 bg-rose-600 text-white rounded hover:bg-rose-700 transition-all text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer">🗑️ Complete ({selectedRows.size})</button>
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
                        ? 'bg-blue-600 text-white shadow-2xs' 
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
                <span className="font-bold text-amber-900">days</span>
              </div>
              <div className="relative">
                <input type="text" placeholder="Search export code, receiver, team..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-44 sm:w-56 px-2 py-0.5 text-[11px] font-medium border border-slate-300 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all shadow-xs" />
              </div>
            </div>
          </div>
        </div>

        {/* ─── STATS SUMMARY BAR (ULTRA COMPACT INLINE) ─── */}
        <div className="px-3 py-0.5 bg-slate-200/70 border-b border-slate-300 grid grid-cols-3 sm:grid-cols-6 gap-1.5 flex-shrink-0 text-[9.5px]">
          <div className="bg-white rounded px-2 py-0.5 border border-slate-300 shadow-xs flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-slate-500">In System</span>
            <span className="text-xs font-black text-slate-900">{data.length}</span>
          </div>
          <div className="bg-white rounded px-2 py-0.5 border border-slate-300 shadow-xs flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-emerald-600">GIS Records</span>
            <span className="text-xs font-black text-emerald-700">{filteredData.length}</span>
          </div>
          <div className="bg-white rounded px-2 py-0.5 border border-slate-300 shadow-xs flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-indigo-600">Selected</span>
            <span className="text-xs font-black text-indigo-700">{selectedRows.size}</span>
          </div>
          <div className="bg-white rounded px-2 py-0.5 border border-slate-300 shadow-xs flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-amber-600">Threshold</span>
            <span className="text-xs font-black text-amber-700">&ge;{alarmThreshold}d</span>
          </div>
          <div className={`bg-white rounded px-2 py-0.5 border shadow-xs cursor-pointer flex items-center justify-between hover:bg-rose-50 transition-all ${alarmCount > 0 ? 'border-rose-500 bg-rose-50/50' : 'border-slate-300'}`} onClick={() => { if (alarmCount > 0) setShowAlarmModal(true); }}>
            <span className="font-black uppercase tracking-wider text-rose-700">Alarms</span>
            <span className={`text-xs font-black ${alarmCount > 0 ? 'text-rose-600 animate-pulse' : 'text-emerald-600'}`}>{alarmCount}</span>
          </div>
          <div className="bg-white rounded px-2 py-0.5 border border-slate-300 shadow-xs flex items-center justify-between cursor-pointer hover:bg-purple-50 transition-all" onClick={() => setShowKPIModal(true)}>
            <span className="font-black uppercase tracking-wider text-purple-600">Cleared Result</span>
            <span className="text-xs font-black text-purple-700">{completionHistory.length}</span>
          </div>
        </div>

        {/* ─── EXCEL MATRIX TABLE (DYNAMIC FILL SCREEN) ─── */}
        <div className="flex-1 min-h-0 overflow-auto bg-white">
          <table className="min-w-full border-collapse border border-slate-300 text-[9.5px] leading-tight table-auto">
            <thead>
              <tr className="bg-slate-800 text-white font-black uppercase tracking-wider text-[9px]">
                <th className="border border-slate-700 px-1 py-0.5 w-6 text-center sticky top-0 z-20 bg-slate-800">
                  <input type="checkbox" checked={selectedRows.size === filteredData.length && filteredData.length > 0} onChange={toggleSelectAll} className="rounded cursor-pointer" />
                </th>
                {columns.map(col => (
                  <th 
                    key={col.key} 
                    onClick={() => {
                      if (col.key === 'daysDiff') {
                        setDaysSortOrder(prev => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none');
                      }
                    }}
                    className={`border border-slate-700 px-1.5 py-0.5 font-extrabold whitespace-nowrap sticky top-0 z-20 bg-slate-800 ${col.width} ${col.align || 'text-left'} ${col.key === 'daysDiff' ? 'cursor-pointer hover:bg-slate-700 select-none text-amber-300' : ''}`}
                    title={col.key === 'daysDiff' ? 'Click to sort by Days' : ''}
                  >
                    {col.label}
                    {col.key === 'daysDiff' && (
                      <span className="ml-1 text-[9px]">
                        {daysSortOrder === 'desc' ? '⬇️' : daysSortOrder === 'asc' ? '⬆️' : '↕️'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-normal text-slate-800 bg-white">
              {paginatedData.map((item) => {
                const isAlarm = item.daysDiff >= alarmThreshold && !dismissedItems.has(item.id);
                return (
                  <tr key={item.id} className={`transition-colors ${isAlarm ? 'bg-rose-50/90 font-semibold' : selectedRows.has(item.id) ? 'bg-blue-50/90' : 'even:bg-slate-50/70 odd:bg-white hover:bg-amber-50/80'}`}>
                    <td className="border border-slate-300 px-1 py-0.25 text-center bg-white/50">
                      <input type="checkbox" checked={selectedRows.has(item.id)} onChange={() => toggleRowSelection(item.id)} className="rounded cursor-pointer" />
                    </td>
                    <td className="border border-slate-300 px-1 py-0.25 text-slate-500 font-bold text-center bg-slate-100/70">{item.no}</td>
                    
                    {/* Warehouse Stock out */}
                    <td className="border border-slate-300 px-1.5 py-0.25 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'exportCode' ? (
                        <input type="text" defaultValue={item.exportCode} autoFocus onBlur={(e) => saveEdit(item.id, 'exportCode', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'exportCode')} className="w-full px-0.5 py-0 border border-blue-500 rounded text-[9.5px] bg-white font-mono" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'exportCode', item.exportCode)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded transition-colors font-mono whitespace-nowrap">{item.exportCode || '-'}</div>
                      )}
                    </td>

                    {/* Export code */}
                    <td className="border border-slate-300 px-1.5 py-0.25 font-mono font-bold text-slate-900 whitespace-nowrap min-w-[170px]">
                      {editingCell?.id === item.id && editingCell?.field === 'exportNo' ? (
                        <input type="text" defaultValue={item.exportNo} autoFocus onBlur={(e) => saveEdit(item.id, 'exportNo', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'exportNo')} className="w-full px-0.5 py-0 border border-blue-500 rounded text-[9.5px] bg-white font-mono" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'exportNo', item.exportNo)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded transition-colors font-mono whitespace-nowrap text-indigo-700">{item.exportNo || '-'}</div>
                      )}
                    </td>

                    {/* Date real export */}
                    <td className="border border-slate-300 px-1.5 py-0.25 text-center font-mono text-slate-700 whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'realExport' ? (
                        <input type="text" defaultValue={item.realExport} placeholder="DD/MM/YYYY" autoFocus onBlur={(e) => saveEdit(item.id, 'realExport', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'realExport')} className="w-full px-0.5 py-0 border border-blue-500 rounded text-[9.5px] text-center bg-white font-mono" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'realExport', item.realExport)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded text-center transition-colors font-mono">{item.realExport || '-'}</div>
                      )}
                    </td>

                    {/* Stock reciever */}
                    <td className="border border-slate-300 px-1.5 py-0.25 whitespace-normal break-words text-slate-800">
                      <div onClick={() => startEdit(item.id, 'stockReceiver', item.stockReceiver)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded transition-colors">
                        {item.stockReceiver?.toUpperCase().includes('GIS') ? (
                          <span className="text-emerald-700 font-bold">{item.stockReceiver}</span>
                        ) : item.stockReceiver || '-'}
                      </div>
                    </td>

                    {/* Group reciever */}
                    <td className="border border-slate-300 px-1.5 py-0.25 whitespace-normal break-words text-slate-800">
                      <div onClick={() => startEdit(item.id, 'groupReceiver', item.groupReceiver)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded transition-colors">
                        {item.groupReceiver?.toUpperCase().includes('GIS') ? (
                          <span className="text-emerald-700 font-bold">{item.groupReceiver}</span>
                        ) : item.groupReceiver || '-'}
                      </div>
                    </td>

                    {/* Construction reciever */}
                    <td className="border border-slate-300 px-1.5 py-0.25 whitespace-normal break-words text-slate-800">
                      <div onClick={() => startEdit(item.id, 'constructionReceiver', item.constructionReceiver)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded transition-colors">
                        {item.constructionReceiver || '-'}
                      </div>
                    </td>

                    {/* Unit */}
                    <td className="border border-slate-300 px-1 py-0.25 text-center whitespace-nowrap">
                      <span className={`inline-flex px-1 py-0 rounded text-[8.5px] font-extrabold ${isAlarm ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-200 text-slate-800 border border-slate-300'}`}>{item.unit}</span>
                    </td>

                    {/* Days */}
                    <td className="border border-slate-300 px-1 py-0.25 text-center font-bold whitespace-nowrap">
                      <span className={`inline-flex px-1 py-0 rounded font-mono text-[9px] font-black ${
                        item.daysDiff >= alarmThreshold ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse' :
                        item.daysDiff > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {item.daysDiff > 0 ? `+${item.daysDiff}` : item.daysDiff} d
                      </span>
                    </td>

                    {/* TEAM */}
                    <td className="border border-slate-300 px-1 py-0.25 text-center whitespace-nowrap font-mono font-bold text-purple-700 bg-purple-50/70">
                      {item.team || '-'}
                    </td>
                  </tr>
                );
              })}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="border border-slate-300 px-6 py-12 text-center text-slate-400 font-bold text-sm bg-white">
                    <div className="flex flex-col items-center gap-3">
                      <div className="text-4xl">📭</div>
                      <p className="text-lg font-bold text-slate-700">No data in system</p>
                      <p className="text-xs text-slate-500">Click "Smart Import" to import data</p>
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
        <div className="bg-slate-100 px-4 py-1.5 border-t border-slate-300 text-[11px] font-semibold text-slate-600 flex justify-between flex-wrap gap-2 flex-shrink-0">
          <span>📋 In System: <strong>{data.length}</strong> rows | GIS: <strong>{filteredData.length}</strong> rows | Alarms: <strong>{alarmCount}</strong></span>
          <span>⚡ Metfone Net Warehouse Stockout Confirmation Tracker</span>
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
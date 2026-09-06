import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { loadFromDb, saveToDb, clearStore } from '../../services/dbStore';

// All standard 25 Units
const allUnits = [
  'BAN', 'BAT', 'CHA', 'CHH', 'KAM', 'KAN', 'KANZ1', 'KOH', 'KRA',
  'MON', 'ODD', 'PNP', 'PNPZ1', 'PNPZ2', 'PRE', 'PRH', 'PUR', 'ROT',
  'SIE', 'SIH', 'SPE', 'STU', 'SVA', 'TAK', 'THO'
];

// Storage Keys for Metfone Net Module 02
const STORAGE_KEYS = {
  DATA: 'metfone_nocreate_data',
  COMPLETION: 'metfone_nocreate_completionHistory',
  TARGETS: 'metfone_nocreate_targets',
  TARGET_HISTORY: 'metfone_nocreate_targetHistory',
  CONFIRMED: 'metfone_nocreate_confirmedStatus'
};

// Initial User Data (Empty by default)
export const INITIAL_M2_DATA = [];

// Helper functions
const getStorageData = (key) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
};

const getYearFromDate = (dateString) => {
  if (!dateString) return 0;
  const parts = dateString.split(/[/\s:-]+/);
  if (parts.length < 3) return 0;
  let yearStr = parts[2];
  if (parts[0].length === 4) {
    yearStr = parts[0];
  }
  let year = parseInt(yearStr, 10);
  if (isNaN(year)) return 0;
  if (year < 100) year += 2000;
  return year;
};

// Unit parsing from Recipient
const getUnitFromRecipient = (recipient, code) => {
  if (!recipient && !code) return 'OTHER';
  const str = (recipient || '').toUpperCase().replace(/\s+/g, '');

  if (/_PNPZ1_/.test(str) || /^PNPZ1\b/.test(str)) return 'PNPZ1';
  if (/_PNPZ2_/.test(str) || /^PNPZ2\b/.test(str)) return 'PNPZ2';
  if (/_KANZ1_/.test(str) || /^KANZ1\b/.test(str)) return 'KANZ1';

  // Province match from MFNet_GIS_CHA_FBC02 or GIS_CHA_...
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

  const codeStr = (code || '').toUpperCase();
  for (const u of ['PNPZ1', 'PNPZ2', 'KANZ1', ...allUnits]) {
    if (codeStr.includes(`_${u}/`) || codeStr.includes(`_${u}_`) || codeStr.includes(`/${u}/`)) {
      return u;
    }
  }

  for (const u of allUnits) {
    if (str.includes(u)) return u;
  }

  return 'OTHER';
};

// Team parsing from Recipient
const getTeamFromRecipient = (recipient) => {
  if (!recipient || recipient === '-') return '-';
  let upper = recipient.toUpperCase().trim();
  upper = upper.replace(/FB_TEAMC/g, 'FBC').replace(/FB_TEAM/g, 'FBC').replace(/FBC012/g, 'FBC12');

  const fbcMatch = upper.match(/FBC[^\d]*(\d+)/);
  const sosMatch = upper.match(/SOS[^\d]*(\d+)/);

  let teamType = '';
  let teamNum = '';

  if (fbcMatch) {
    teamType = 'FBC';
    teamNum = String(parseInt(fbcMatch[1], 10)).padStart(2, '0');
  } else if (sosMatch) {
    teamType = 'SOS';
    teamNum = String(parseInt(sosMatch[1], 10)).padStart(2, '0');
  }

  if (teamType && teamNum) {
    let province = '';
    const gisProvince = upper.match(/(?:MFNET_)?GIS_([A-Z]+)_/);
    if (gisProvince) {
      province = gisProvince[1];
    } else {
      for (const u of allUnits) {
        if (new RegExp(`(^|_)${u}($|_)`).test(upper)) {
          province = u;
          break;
        }
      }
    }
    if (province) {
      return `GIS_${province}_${teamType}${teamNum}`;
    }
  }

  return upper;
};

// Calculate days elapsed from date string
const calculateDaysDiff = (dateString) => {
  if (!dateString) return 0;
  const parts = dateString.split(/[/\s:]+/);
  if (parts.length < 3) return 0;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  const createdDate = new Date(year, month, day);
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const diffTime = currentDate - createdDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const NotCreateHandOverMetfone = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const isLoaded = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [data, setData] = useState(() => {
    const localData = getStorageData(STORAGE_KEYS.DATA);
    if (localData && localData.length > 0) {
      return localData.filter(item => getYearFromDate(item.date) >= 2025);
    }
    return [];
  });

  const [completionHistory, setCompletionHistory] = useState(() => getStorageData(STORAGE_KEYS.COMPLETION) || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAlarmModal, setShowAlarmModal] = useState(false);
  const [alarmThreshold, setAlarmThreshold] = useState(4);
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
  const [notification, setNotification] = useState(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [daysFilter, setDaysFilter] = useState('ALL');
  const [daysSortOrder, setDaysSortOrder] = useState('none');

  // Load data from DB on mount
  useEffect(() => {
    const fetchDbData = async () => {
      const dbData = await loadFromDb(STORAGE_KEYS.DATA, null);
      if (dbData && dbData.length > 0) {
        // Silent GIS-only filtering requirement: Recipient contains GIS
        const filtered = dbData.filter(item => 
          getYearFromDate(item.date) >= 2025 &&
          item.recipient && item.recipient.toUpperCase().includes('GIS')
        );
        const enriched = filtered.map(item => ({
          ...item,
          daysDiff: calculateDaysDiff(item.date),
          unit: getUnitFromRecipient(item.recipient, item.code),
          team: getTeamFromRecipient(item.recipient)
        }));
        setData(enriched);
      } else {
        setData([]);
      }

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

  // Save to DB on updates
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

  // Recalculate daysDiff on mount
  useEffect(() => {
    setData(prev => {
      let changed = false;
      const updated = prev.map(item => {
        const diff = calculateDaysDiff(item.date);
        if (item.daysDiff !== diff) {
          changed = true;
          return { ...item, daysDiff: diff };
        }
        return item;
      });
      return changed ? updated : prev;
    });
  }, []);

  // Table Columns
  const columns = [
    { key: 'no', label: 'No', width: 'w-10', align: 'text-center' },
    { key: 'code', label: 'Code of stock-out note', width: 'whitespace-nowrap min-w-[170px]', align: 'text-left' },
    { key: 'warehouse', label: 'Warehouse', width: 'w-36', align: 'text-left' },
    { key: 'recipient', label: 'Recipient', width: 'w-40', align: 'text-left' },
    { key: 'creator', label: 'Creator', width: 'w-32', align: 'text-left' },
    { key: 'date', label: 'Creating date', width: 'w-28', align: 'text-center' },
    { key: 'unit', label: 'Unit', width: 'w-16', align: 'text-center' },
    { key: 'daysDiff', label: 'Days', width: 'w-14', align: 'text-center' },
    { key: 'team', label: 'TEAM', width: 'min-w-[140px]', align: 'text-center' },
    { key: 'status', label: 'Status', width: 'w-20', align: 'text-center' }
  ];

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
      // Audio not supported
    }
  };

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
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
      unit,
      period,
      oldTarget: null,
      newTarget,
      changedAt: new Date().toISOString(),
      changedBy: 'System (Auto)',
      reason: `Auto-created target based on ${dataCount} record(s)`
    }, ...prev]);
    return newTarget;
  };

  const updateTargetWithHistory = (unit, period, newTargetValue) => {
    const oldTarget = targets[unit]?.[period] || 0;
    const newTarget = parseInt(newTargetValue, 10) || 0;
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
      unit,
      period,
      oldTarget,
      newTarget,
      changedAt: new Date().toISOString(),
      changedBy: 'User',
      reason: `Manual target adjustment for ${period === 'morning' ? 'ព្រឹក' : 'ល្ងាច'}`
    }, ...prev]);

    showNotification(`📊 Target (${period === 'morning' ? 'ព្រឹក' : 'ល្ងាច'}) for ${unit} updated from ${oldTarget} to ${newTarget}`, 'info');
  };

  // Requirement: Recipient ចាប់យកតែ GIS (GIS ONLY)
  const processImport = (newRawData) => {
    const gisData = newRawData.filter(item => 
      item.recipient && item.recipient.toUpperCase().includes('GIS') &&
      getYearFromDate(item.date) >= 2025
    );

    if (gisData.length === 0) {
      showNotification('⚠️ No valid GIS recipient records found!', 'warning');
      return;
    }

    const currentCodes = new Set(data.map(item => item.code));
    const newCodesSet = new Set(gisData.map(item => item.code));

    const processedNewData = gisData.map((item, index) => {
      const unit = getUnitFromRecipient(item.recipient, item.code);
      const team = getTeamFromRecipient(item.recipient);
      return {
        id: Math.max(...data.map(d => d.id), 0, index) + index + 1,
        no: index + 1,
        code: item.code,
        warehouse: item.warehouse,
        recipient: item.recipient,
        creator: item.creator,
        date: item.date,
        daysDiff: calculateDaysDiff(item.date),
        unit,
        team,
        status: 'Not confirmed'
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
      }
    });

    const completedCodesArray = [...currentCodes].filter(code => !newCodesSet.has(code));
    if (completedCodesArray.length > 0) {
      const newCompletions = completedCodesArray.map(code => {
        const foundItem = data.find(item => item.code === code);
        return { code, completedAt: new Date().toISOString(), unit: foundItem?.unit || 'UNKNOWN' };
      });
      setCompletionHistory(prev => [...newCompletions, ...prev]);
      setConfirmedStatus(prev => {
        const newStatus = { ...prev };
        completedCodesArray.forEach(code => delete newStatus[code]);
        return newStatus;
      });
      playAlarmSound();
    }

    setData(processedNewData);
    showNotification(`📊 Imported ${gisData.length} GIS records (${completedCodesArray.length} completed)`, 'success');
  };

  // KPI Calculations
  const calculateKPIData = useMemo(() => {
    const unitGroups = {};
    data.forEach(item => {
      const unit = item.unit;
      if (unit !== 'OTHER') {
        if (!unitGroups[unit]) {
          unitGroups[unit] = { codes: new Set(), unit, count: 0 };
        }
        unitGroups[unit].codes.add(item.code);
        unitGroups[unit].count++;
      }
    });

    const completedByUnit = {};
    completionHistory.forEach(completion => {
      if (completion.unit !== 'UNKNOWN') {
        completedByUnit[completion.unit] = (completedByUnit[completion.unit] || 0) + 1;
      }
    });

    Object.entries(confirmedStatus).forEach(([code, isConfirmed]) => {
      if (isConfirmed) {
        const item = data.find(d => d.code === code);
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

    allUnits.forEach(unit => {
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
        unit,
        morningTarget,
        eveningTarget,
        target,
        remain,
        result,
        ratio: Math.min(100, ratio),
        total: currentCount,
        status,
        hasData: currentCount > 0 || result > 0,
        isNew: !targets[unit] && currentCount > 0,
        hasChange: morningTarget !== eveningTarget && eveningTarget > 0
      });

      grandTargetMorning += morningTarget;
      grandTargetEvening += eveningTarget;
      grandRemain += remain;
      grandResult += result;
      grandTotalRecords += currentCount;
    });

    let filtered = kpiData;
    if (kpiViewMode === 'active') filtered = kpiData.filter(item => item.hasData && item.remain > 0);
    else if (kpiViewMode === 'completed') filtered = kpiData.filter(item => item.hasData && item.remain === 0 && item.target > 0);

    filtered.sort((a, b) => {
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
      data: filtered,
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

  // Smart Paste parser (handles TSV from Excel / Sheets)
  const parsePastedData = (text) => {
    const rows = text.split(/\r?\n/);
    const parsedRows = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].trim();
      if (!row) continue;
      const cells = row.split(/\t| {2,}/);
      if (cells.length >= 5) {
        const firstCell = cells[0].trim().replace(/\.$/, '');
        const isSequence = /^\d+$/.test(firstCell);
        const offset = isSequence ? 1 : 0;

        if (cells.length - offset >= 5) {
          parsedRows.push({
            code: cells[offset + 0] || '',
            warehouse: cells[offset + 1] || '',
            recipient: cells[offset + 2] || '',
            creator: cells[offset + 3] || '',
            date: cells[offset + 4] || ''
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
        if (field === 'date') updated.daysDiff = calculateDaysDiff(value);
        if (field === 'recipient') {
          updated.unit = getUnitFromRecipient(value, item.code);
          updated.team = getTeamFromRecipient(value);
        }
        return updated;
      }
      return item;
    });
    setData(updatedData.filter(item => getYearFromDate(item.date) >= 2025));
  };

  const clearAllData = async () => {
    if (window.confirm('⚠️ Are you sure you want to clear ALL Metfone Not Create Hand Over data?')) {
      setData([]);
      setCompletionHistory([]);
      setTargets({});
      setConfirmedStatus({});

      localStorage.removeItem(STORAGE_KEYS.DATA);
      localStorage.removeItem(STORAGE_KEYS.COMPLETION);
      localStorage.removeItem(STORAGE_KEYS.TARGETS);
      localStorage.removeItem(STORAGE_KEYS.TARGET_HISTORY);
      localStorage.removeItem(STORAGE_KEYS.CONFIRMED);

      showNotification('All data cleared!', 'warning');

      Promise.all([
        clearStore(STORAGE_KEYS.DATA),
        clearStore(STORAGE_KEYS.COMPLETION),
        clearStore(STORAGE_KEYS.TARGETS),
        clearStore(STORAGE_KEYS.TARGET_HISTORY),
        clearStore(STORAGE_KEYS.CONFIRMED)
      ]).catch(err => {
        console.error('Error clearing DB store:', err);
      });
    }
  };

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) return;
    if (window.confirm(`⚠️ Mark ${selectedRows.size} row(s) as completed?`)) {
      const selectedItems = data.filter(item => selectedRows.has(item.id));
      const newCompletions = selectedItems.map(item => ({
        code: item.code,
        completedAt: new Date().toISOString(),
        unit: item.unit
      }));
      setCompletionHistory(prev => [...newCompletions, ...prev]);

      const newData = data.filter(item => !selectedRows.has(item.id));
      setData(newData.map((item, index) => ({ ...item, no: index + 1, id: index + 1 })));
      setSelectedRows(new Set());
      showNotification(`✅ Completed ${selectedRows.size} row(s)!`, 'success');
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
      'Code of stock-out note': item.code,
      'Warehouse': item.warehouse,
      'Recipient': item.recipient,
      'Creator': item.creator,
      'Creating date': item.date,
      'Unit': item.unit,
      'Days': item.daysDiff,
      'TEAM': item.team || '-',
      'Status': item.status
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Not Create Hand Over');
    XLSX.writeFile(wb, `METFONE_NOT_CREATE_HAND_OVER_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Main Filtered Data (Recipient MUST contain GIS silently)
  const filteredData = useMemo(() => {
    let filtered = data.filter(item => {
      const recipient = (item.recipient || '').toUpperCase();
      return recipient.includes('GIS');
    });

    if (daysFilter !== 'ALL') {
      if (daysFilter === '0') {
        filtered = filtered.filter(item => item.daysDiff === 0);
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

    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim();
      const isTermUnit = allUnits.some(u => u.toLowerCase() === term) || term === 'other';
      filtered = filtered.filter(item => {
        if (isTermUnit) {
          return item.unit?.toLowerCase() === term;
        }
        return (
          item.code?.toLowerCase().includes(term) ||
          item.warehouse?.toLowerCase().includes(term) ||
          item.recipient?.toLowerCase().includes(term) ||
          item.creator?.toLowerCase().includes(term) ||
          item.date?.toLowerCase().includes(term) ||
          item.unit?.toLowerCase().includes(term) ||
          item.team?.toLowerCase().includes(term)
        );
      });
    }

    // Days sorting
    if (daysSortOrder !== 'none') {
      filtered = [...filtered].sort((a, b) => {
        const aDays = a.daysDiff || 0;
        const bDays = b.daysDiff || 0;
        return daysSortOrder === 'desc' ? bDays - aDays : aDays - bDays;
      });
    }

    return filtered;
  }, [data, searchTerm, daysFilter, daysSortOrder, alarmThreshold]);

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

  const alarmItems = useMemo(() => {
    return filteredData.filter(item => item.daysDiff >= alarmThreshold && !dismissedItems.has(item.id));
  }, [filteredData, alarmThreshold, dismissedItems]);

  const alarmCount = alarmItems.length;

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
        item.code?.toLowerCase().includes(term) ||
        item.warehouse?.toLowerCase().includes(term) ||
        item.recipient?.toLowerCase().includes(term) ||
        item.creator?.toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [alarmItems, alarmSearchTerm, selectedAlarmUnit]);

  const copyAlarmsToClipboard = () => {
    if (filteredAlarmItems.length === 0) return;
    const text = filteredAlarmItems.map(item => 
      `${item.unit}\n| Code: ${item.code}\n📅 Date: ${item.date} | ⏰ Delay: +${item.daysDiff} days\nReceiver: ${item.recipient || '-'} (${item.warehouse || '-'})\nTEAM: ${item.team || '-'}\nStatus: ${item.status || '-'}`
    ).join('\n\n');
    navigator.clipboard.writeText(text);
    showNotification('📋 Alarm list copied to clipboard!', 'success');
  };

  const getRecipientBadge = (recipient) => {
    if (recipient && recipient.toUpperCase().includes('GIS')) {
      return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">{recipient}</span>;
    }
    return <span className="text-slate-600">{recipient}</span>;
  };

  // ─── MODALS ───
  const renderTargetHistoryModal = () => {
    if (!showTargetHistoryModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📜</span>
                <h2 className="text-xl font-bold text-white">Target Change History</h2>
              </div>
              <button onClick={() => setShowTargetHistoryModal(false)} className="text-white/80 hover:text-white text-2xl font-bold">✕</button>
            </div>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            {targetHistory.length === 0 ? (
              <p className="text-center py-8 text-gray-500 text-sm">No target change history found.</p>
            ) : (
              <div className="divide-y divide-gray-200">
                {targetHistory.map((item) => (
                  <div key={item.id} className="py-3 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-indigo-600 mr-2">{item.unit}</span>
                      <span className="text-gray-500 mr-2">({item.period === 'morning' ? 'ព្រឹក' : 'ល្ងាច'})</span>
                      <span className="text-gray-700">{item.reason}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-gray-500 mr-2">{item.oldTarget !== null ? `${item.oldTarget} → ` : ''}{item.newTarget}</span>
                      <span className="text-gray-400">{new Date(item.changedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderKPIModal = () => {
    if (!showKPIModal) return null;
    const { data: kpiList, summary } = calculateKPIData;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 animate-fadeIn p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-950 px-5 py-3 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📊</span>
              <div>
                <h2 className="text-base font-black">SYSTEM METFONE NET — NOT CREATE HAND OVER KPI</h2>
                <p className="text-[10px] text-indigo-200">Target vs Realized Results by Province Unit</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowTargetHistoryModal(true)} className="bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded text-xs font-bold transition-all">📜 History</button>
              <button onClick={() => setShowKPIModal(false)} className="text-white/80 hover:text-white text-2xl font-bold ml-2">✕</button>
            </div>
          </div>

          {/* Quick Summary Cards */}
          <div className="p-3 bg-slate-100 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Total Records</div>
              <div className="text-lg font-black text-slate-800">{summary.totalRecords}</div>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Target (Total)</div>
              <div className="text-lg font-black text-blue-600">{summary.targetEvening || summary.targetMorning}</div>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Completed</div>
              <div className="text-lg font-black text-emerald-600">{summary.result}</div>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Remaining</div>
              <div className="text-lg font-black text-amber-600">{summary.remain}</div>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Progress</div>
              <div className="text-lg font-black text-indigo-600">{summary.ratio.toFixed(1)}%</div>
            </div>
          </div>

          {/* View Filter Tabs */}
          <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center text-xs flex-wrap gap-2">
            <div className="flex gap-1">
              {['all', 'active', 'completed'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setKpiViewMode(tab)}
                  className={`px-3 py-1 rounded font-bold capitalize transition-all ${kpiViewMode === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-slate-500">
              Click unit target to edit manually
            </div>
          </div>

          {/* KPI Matrix Table */}
          <div className="flex-1 overflow-y-auto p-4">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white text-[11px]">
                  <th className="p-2 border border-slate-700 cursor-pointer" onClick={() => handleSort('unit')}>Unit</th>
                  <th className="p-2 border border-slate-700 text-center cursor-pointer" onClick={() => handleSort('morning')}>Morning Target</th>
                  <th className="p-2 border border-slate-700 text-center cursor-pointer" onClick={() => handleSort('evening')}>Evening Target</th>
                  <th className="p-2 border border-slate-700 text-center cursor-pointer" onClick={() => handleSort('result')}>Completed</th>
                  <th className="p-2 border border-slate-700 text-center cursor-pointer" onClick={() => handleSort('remain')}>Remain</th>
                  <th className="p-2 border border-slate-700 text-center cursor-pointer" onClick={() => handleSort('ratio')}>Ratio</th>
                  <th className="p-2 border border-slate-700 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {kpiList.map((row) => (
                  <tr key={row.unit} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="p-2 font-bold font-mono text-indigo-700">{row.unit}</td>
                    <td className="p-2 text-center font-mono">
                      {editingTarget?.unit === row.unit && editingTarget?.period === 'morning' ? (
                        <input
                          type="number"
                          defaultValue={row.morningTarget}
                          autoFocus
                          onBlur={(e) => updateTarget(row.unit, 'morning', e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && updateTarget(row.unit, 'morning', e.target.value)}
                          className="w-16 px-1 border border-indigo-500 text-center rounded text-xs"
                        />
                      ) : (
                        <span onClick={() => setEditingTarget({ unit: row.unit, period: 'morning' })} className="cursor-pointer hover:bg-indigo-50 px-2 py-0.5 rounded font-bold">
                          {row.morningTarget || '-'}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center font-mono">
                      {editingTarget?.unit === row.unit && editingTarget?.period === 'evening' ? (
                        <input
                          type="number"
                          defaultValue={row.eveningTarget}
                          autoFocus
                          onBlur={(e) => updateTarget(row.unit, 'evening', e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && updateTarget(row.unit, 'evening', e.target.value)}
                          className="w-16 px-1 border border-indigo-500 text-center rounded text-xs"
                        />
                      ) : (
                        <span onClick={() => setEditingTarget({ unit: row.unit, period: 'evening' })} className="cursor-pointer hover:bg-indigo-50 px-2 py-0.5 rounded font-bold">
                          {row.eveningTarget || '-'}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center font-mono font-bold text-emerald-600">{row.result}</td>
                    <td className="p-2 text-center font-mono font-bold text-amber-600">{row.remain}</td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div className={`h-full ${row.ratio >= 80 ? 'bg-emerald-500' : row.ratio >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${row.ratio}%` }} />
                        </div>
                        <span className="font-mono text-[10px] font-bold">{row.ratio.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : row.status === 'Good' ? 'bg-blue-100 text-blue-800' : row.status === 'Warning' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderPasteModal = () => {
    if (!showPasteModal) return null;
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 animate-fadeIn p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-800 to-teal-800 px-5 py-3 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-xl">📋</span>
              <div>
                <h3 className="text-sm font-black">Smart Import: Not Create Hand Over</h3>
                <p className="text-[10px] text-emerald-200">Copy table rows from Excel or web and paste here</p>
              </div>
            </div>
            <button onClick={() => setShowPasteModal(false)} className="text-white/80 hover:text-white text-xl font-bold">✕</button>
          </div>
          <div className="p-4 flex-1 flex flex-col gap-3">
            <p className="text-xs text-slate-600">
              Columns format expected: <strong>No | Code of stock-out note | Warehouse | Recipient | Creator | Creating date</strong>
            </p>
            <textarea
              value={pasteData}
              onChange={(e) => setPasteData(e.target.value)}
              placeholder="Paste Excel tab-separated rows here..."
              rows={12}
              className="w-full p-2.5 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button onClick={() => setShowPasteModal(false)} className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-xs font-bold transition-all">Cancel</button>
              <button onClick={handleSmartImport} className="px-5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-md">Import Data</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAlarmModal = () => {
    if (!showAlarmModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 animate-fadeIn p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-rose-700 to-red-800 px-5 py-3 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-2xl animate-bounce">🚨</span>
              <div>
                <h3 className="text-base font-black">Delay Alarms (&ge; {alarmThreshold} days)</h3>
                <p className="text-[10px] text-rose-200">Items pending hand over creation longer than threshold</p>
              </div>
            </div>
            <button onClick={() => { setShowAlarmModal(false); setAlarmSearchTerm(''); setSelectedAlarmUnit(''); }} className="text-white/80 hover:text-white text-2xl font-bold">✕</button>
          </div>

          {/* Alarm Filters */}
          <div className="p-3 bg-rose-50/50 border-b border-rose-100 flex flex-wrap gap-2 justify-between items-center text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-700">Filter Unit:</span>
              <select
                value={selectedAlarmUnit}
                onChange={(e) => setSelectedAlarmUnit(e.target.value)}
                className="border border-slate-300 rounded px-2 py-0.5 bg-white font-bold text-xs"
              >
                <option value="">All Units ({alarmUnits.length})</option>
                {alarmUnits.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Search alarms..."
                value={alarmSearchTerm}
                onChange={(e) => setAlarmSearchTerm(e.target.value)}
                className="border border-slate-300 rounded px-2 py-0.5 bg-white text-xs w-40"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={copyAlarmsToClipboard} className="px-3 py-1 bg-slate-800 text-white rounded text-xs font-bold hover:bg-slate-900 transition-all">📋 Copy Telegram Text</button>
            </div>
          </div>

          {/* Alarms List */}
          <div className="flex-1 overflow-y-auto p-3">
            {filteredAlarmItems.length === 0 ? (
              <p className="text-center py-8 text-slate-400 font-bold text-sm">No delay alarms found matching criteria.</p>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredAlarmItems.map(item => (
                  <div key={item.id} className="py-2.5 flex justify-between items-center text-xs hover:bg-rose-50/40 px-2 rounded">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="px-1.5 py-0.25 bg-rose-600 text-white rounded text-[10px] font-black">{item.unit}</span>
                        <span className="font-mono font-black text-slate-900">{item.code}</span>
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.25 rounded">+{item.daysDiff} days</span>
                      </div>
                      <div className="text-[11px] text-slate-600 flex gap-3">
                        <span>Recipient: <strong>{item.recipient}</strong></span>
                        <span>Warehouse: {item.warehouse}</span>
                        <span>TEAM: <strong className="text-purple-700">{item.team}</strong></span>
                      </div>
                    </div>
                    <button
                      onClick={() => setDismissedItems(prev => new Set([...prev, item.id]))}
                      className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[11px] font-bold"
                    >
                      Dismiss
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 flex justify-between items-center">
            <span className="text-xs text-slate-600 font-bold">Total Alarms: {filteredAlarmItems.length}</span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setDismissedItems(prev => new Set([...prev, ...alarmItems.map(i => i.id)]));
                  setShowAlarmModal(false);
                }}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold"
              >
                Dismiss All
              </button>
              <button
                onClick={() => setShowAlarmModal(false)}
                className="px-3 py-1 bg-slate-300 hover:bg-slate-400 text-slate-800 rounded text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Floating Alarm Button (positioned bottom-20 right-6 to prevent pagination overlap)
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

      {/* Modals & Floating Buttons */}
      {renderTargetHistoryModal()}
      {renderKPIModal()}
      {renderPasteModal()}
      {renderAlarmModal()}
      {renderFloatingButtons()}

      {/* Main Content Container */}
      <div className="bg-white rounded-lg shadow-xl border border-slate-300 flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Compact Ribbon Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 px-3 py-1 border-b border-slate-900 text-white flex-shrink-0">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1">
                  <span>📝</span> 02 NOT CREATE HAND OVER
                </h1>
                <span className="bg-indigo-500/30 text-indigo-200 text-[9px] font-mono px-1.5 py-0.25 rounded-full uppercase tracking-wider border border-indigo-400/30 font-bold">
                  SYSTEM METFONE NET • LIVE • {currentTime.toLocaleTimeString()}
                </span>
              </div>
            </div>
            <div className="flex gap-1.5 items-center">
              <span className="text-slate-300 text-[10px] hidden lg:inline mr-2">
                <strong>METFONE NET:</strong> តាមដានមិនទាន់ Create Hand Over
              </span>
              <button onClick={clearAllData} className="bg-rose-600/80 hover:bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold transition-all border border-rose-500/50 shadow-xs cursor-pointer">🗑️ Clear All</button>
              <button onClick={() => setShowKPIModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-0.5 rounded text-[10px] font-bold transition-all shadow-xs cursor-pointer">📊 KPI Matrix</button>
            </div>
          </div>
        </div>

        {/* Toolbar & Action Bar */}
        <div className="px-3 py-1 bg-slate-100 border-b border-slate-300 flex-shrink-0">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <div className="flex flex-wrap gap-1.5 items-center">
              <button onClick={() => setShowPasteModal(true)} className="px-2.5 py-0.5 bg-emerald-700 text-white rounded hover:bg-emerald-800 transition-all text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer">🔄 Smart Import</button>
              <button onClick={exportToExcel} className="px-2.5 py-0.5 bg-slate-800 text-white rounded hover:bg-slate-900 transition-all text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer">📎 Export Excel</button>
              {selectedRows.size > 0 && (
                <button onClick={deleteSelectedRows} className="px-2.5 py-0.5 bg-rose-600 text-white rounded hover:bg-rose-700 transition-all text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer">🗑️ Complete ({selectedRows.size})</button>
              )}

              {/* Days Quick Filter */}
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
                        ? 'bg-indigo-600 text-white shadow-2xs' 
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
                <input type="number" value={alarmThreshold} onChange={(e) => setAlarmThreshold(parseInt(e.target.value, 10) || 4)} className="w-10 px-1 py-0 text-[10px] font-bold border border-amber-300 rounded text-center bg-white" min="1"/>
                <span className="font-bold text-amber-900">days</span>
              </div>
              <div className="relative">
                <input type="text" placeholder="Search code, warehouse, recipient..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-44 sm:w-56 px-2 py-0.5 text-[11px] font-medium border border-slate-300 rounded bg-white focus:ring-1 focus:ring-indigo-500 focus:border-transparent transition-all shadow-xs" />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Summary Bar */}
        <div className="px-3 py-0.5 bg-slate-200/70 border-b border-slate-300 grid grid-cols-3 sm:grid-cols-6 gap-1.5 flex-shrink-0 text-[9.5px]">
          <div className="bg-white rounded px-2 py-0.5 border border-slate-300 shadow-xs flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-slate-500">Total</span>
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
            <span className="font-black uppercase tracking-wider text-purple-600">Total Completed</span>
            <span className="text-xs font-black text-purple-700">{completionHistory.length}</span>
          </div>
        </div>

        {/* Excel Matrix Table */}
        <div className="flex-1 overflow-auto bg-slate-50 relative min-h-0">
          <table className="w-full border-collapse text-[11px] leading-tight select-text">
            <thead className="sticky top-0 z-30 shadow-xs">
              <tr className="bg-slate-800 text-white font-black text-[10.5px] uppercase tracking-wider">
                <th className="border border-slate-700 px-1 py-1 w-8 text-center bg-slate-900 sticky top-0 z-20">
                  <input type="checkbox" checked={filteredData.length > 0 && selectedRows.size === filteredData.length} onChange={toggleSelectAll} className="rounded" />
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
                    title={col.key === 'daysDiff' ? 'Click to sort by Days (Descending / Ascending)' : ''}
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
                  <tr key={item.id} className={`transition-colors ${isAlarm ? 'bg-rose-50/90 font-semibold' : selectedRows.has(item.id) ? 'bg-indigo-50/90' : 'even:bg-slate-50/70 odd:bg-white hover:bg-amber-50/80'}`}>
                    <td className="border border-slate-300 px-1.5 py-1 text-center bg-white/50">
                      <input type="checkbox" checked={selectedRows.has(item.id)} onChange={() => toggleRowSelection(item.id)} className="rounded" />
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 text-slate-500 font-bold text-center bg-slate-100/70">{item.no}</td>
                    <td className="border border-slate-300 px-1.5 py-0.25 font-mono font-bold text-slate-900 whitespace-nowrap min-w-[170px]">
                      {editingCell?.id === item.id && editingCell?.field === 'code' ? (
                        <input type="text" defaultValue={item.code} autoFocus onBlur={(e) => saveEdit(item.id, 'code', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'code')} className="w-full px-0.5 py-0 border border-blue-500 rounded text-[9.5px] bg-white font-mono" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'code', item.code)} className="cursor-pointer hover:bg-slate-200/60 px-0.5 py-0 rounded transition-colors font-mono whitespace-nowrap">{item.code || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 break-words text-slate-800">
                      {editingCell?.id === item.id && editingCell?.field === 'warehouse' ? (
                        <input type="text" defaultValue={item.warehouse} autoFocus onBlur={(e) => saveEdit(item.id, 'warehouse', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'warehouse')} className="w-full px-1 py-0.5 border border-blue-500 rounded text-[10.5px] bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'warehouse', item.warehouse)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0.5 rounded transition-colors">{item.warehouse || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 break-words text-slate-800">
                      {editingCell?.id === item.id && editingCell?.field === 'recipient' ? (
                        <input type="text" defaultValue={item.recipient} autoFocus onBlur={(e) => saveEdit(item.id, 'recipient', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'recipient')} className="w-full px-1 py-0.5 border border-blue-500 rounded text-[10.5px] bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'recipient', item.recipient)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0.5 rounded transition-colors">{getRecipientBadge(item.recipient)}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 break-words text-slate-800">
                      {editingCell?.id === item.id && editingCell?.field === 'creator' ? (
                        <input type="text" defaultValue={item.creator} autoFocus onBlur={(e) => saveEdit(item.id, 'creator', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'creator')} className="w-full px-1 py-0.5 border border-blue-500 rounded text-[10.5px] bg-white" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'creator', item.creator)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0.5 rounded transition-colors">{item.creator || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-mono text-slate-700 whitespace-nowrap">
                      {editingCell?.id === item.id && editingCell?.field === 'date' ? (
                        <input type="text" defaultValue={item.date} autoFocus onBlur={(e) => saveEdit(item.id, 'date', e.target.value)} onKeyDown={(e) => handleKeyPress(e, item.id, 'date')} className="w-full px-1 py-0.5 border border-blue-500 rounded text-[10.5px] text-center bg-white font-mono" />
                      ) : (
                        <div onClick={() => startEdit(item.id, 'date', item.date)} className="cursor-pointer hover:bg-slate-200/60 px-1 py-0.5 rounded font-mono text-center transition-colors">{item.date || '-'}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center whitespace-nowrap">
                      <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9.5px] font-extrabold bg-slate-200 text-slate-800 border border-slate-300">{item.unit}</span>
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-bold whitespace-nowrap">
                      <span className={`inline-flex px-1.5 py-0.5 rounded font-mono text-[10px] font-black ${
                        item.daysDiff >= alarmThreshold ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse' :
                        item.daysDiff > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {item.daysDiff > 0 ? `+${item.daysDiff}` : item.daysDiff} d
                      </span>
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-bold text-purple-700 whitespace-nowrap bg-purple-50/70 font-mono">
                      {item.team || '-'}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-bold text-slate-700 whitespace-nowrap">
                      {item.status || '-'}
                    </td>
                  </tr>
                );
              })}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="border border-slate-300 px-6 py-12 text-center text-slate-400 font-bold text-sm bg-white">
                    <div className="flex flex-col items-center gap-3">
                      <div className="text-4xl">📭</div>
                      <p className="text-lg font-bold text-slate-700">No GIS records found</p>
                      <p className="text-xs text-slate-500">Please click "Smart Import" to enter data.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="bg-slate-100 px-3 py-1 border-t border-slate-300 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-slate-700 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600">Show</span>
            <select 
              value={pageSize} 
              onChange={(e) => { 
                const val = e.target.value;
                setPageSize(val === 'ALL' ? 'ALL' : parseInt(val, 10)); 
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
          
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
              disabled={currentPage === 1}
              className={`px-2.5 py-0.5 rounded border font-bold text-xs cursor-pointer transition-colors ${currentPage === 1 ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50 shadow-xs'}`}
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
                  className={`px-2 py-0.5 rounded border text-xs font-black cursor-pointer transition-colors ${currentPage === pageNum ? 'bg-slate-900 text-white border-slate-900 shadow-xs' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'}`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
              disabled={currentPage === totalPages}
              className={`px-2.5 py-0.5 rounded border font-bold text-xs cursor-pointer transition-colors ${currentPage === totalPages ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50 shadow-xs'}`}
            >
              Next
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-4 py-1.5 border-t border-slate-300 text-[11px] font-semibold text-slate-600 flex justify-between flex-wrap gap-2 flex-shrink-0">
          <span>📋 Total GIS: <strong>{filteredData.length}</strong> rows | Alarms: <strong>{alarmCount}</strong></span>
        </div>
      </div>
    </div>
  );
};

export default NotCreateHandOverMetfone;

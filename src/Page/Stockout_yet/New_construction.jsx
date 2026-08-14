import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { loadFromDb, saveToDb, clearStore } from '../../services/dbStore';

// Storage Keys
const STORAGE_KEYS = {
  DATA: 'construction_data',
  CONFIRMED: 'construction_confirmedStatus',
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
  if (parts.length < 3) return 0;
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
const extractUnitFromCode = (codeUnits) => {
  if (!codeUnits) return null;
  const str = codeUnits.toUpperCase().trim();
  
  // Extract trailing part after GIS_ or CNN_
  const match = str.match(/^(?:GIS|CNN)_([A-Z0-9_]+)$/);
  const part = match ? match[1] : str;
  
  if (part.includes('FBC')) {
    if (part.startsWith('KAN')) {
      return 'KANZ1';
    }
    if (part.startsWith('PNP')) {
      const fbcNumMatch = part.match(/FBC(\d+)/);
      if (fbcNumMatch) {
        const num = parseInt(fbcNumMatch[1]);
        if ([1, 3, 5, 6, 7, 10, 11, 13, 14].includes(num)) {
          return 'PNPZ1';
        }
        if ([2, 4, 8, 9, 12].includes(num)) {
          return 'PNPZ2';
        }
      }
      return 'PNPZ1';
    }
  }
  
  for (const u of VALID_UNITS) {
    if (part.startsWith(u)) return u;
  }
  
  return null;
};

export const New_construction = () => {
  const [data, setData] = useState(() => getStorageData(STORAGE_KEYS.DATA) || []);
  const [confirmedStatus, setConfirmedStatus] = useState(() => getStorageData(STORAGE_KEYS.CONFIRMED) || {});
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState('ALL');
  const [daysFilter, setDaysFilter] = useState('ALL');
  const [daysSortOrder, setDaysSortOrder] = useState('none');
  
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteData, setPasteData] = useState('');
  const [notification, setNotification] = useState(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedRows, setSelectedRows] = useState(new Set());
  
  const isLoaded = useRef(false);

  // Sync to database store
  useEffect(() => {
    const initDb = async () => {
      const dbData = await loadFromDb(STORAGE_KEYS.DATA);
      const dbConfirmed = await loadFromDb(STORAGE_KEYS.CONFIRMED);
      
      if (Array.isArray(dbData)) setData(dbData);
      if (dbConfirmed && typeof dbConfirmed === 'object') setConfirmedStatus(dbConfirmed);
      isLoaded.current = true;
    };
    initDb();
  }, []);

  useEffect(() => {
    if (isLoaded.current) {
      saveToDb(STORAGE_KEYS.DATA, data);
    }
  }, [data]);

  useEffect(() => {
    if (isLoaded.current) {
      saveToDb(STORAGE_KEYS.CONFIRMED, confirmedStatus);
    }
  }, [confirmedStatus]);

  // Show notification
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Parse pasted Excel text
  const parsePastedData = (text) => {
    const rows = text.split(/\r?\n/);
    const parsedRows = [];
    const seenStations = new Set();
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].trim();
      if (!row) continue;
      
      const cells = row.split(/\t/);
      
      // Skip header row
      if (i === 0) {
        const isHeader = cells.some(cell => 
          cell && (cell.includes('No') || cell.includes('Code Units') || cell.includes('Station Code'))
        );
        if (isHeader) continue;
      }
      
      let offset = 0;
      if (cells.length > 0 && /^\d+$/.test(cells[0].trim())) {
        offset = 1;
      }
      
      if (cells.length - offset >= 26) {
        const businessProcessClosed = cells[offset + 24] || ''; // Business process finally closed (index 25)
        const stationCode = cells[offset + 2] || ''; // Station Code / line (index 3)
        
        // 1. Only capture rows containing PXK
        if (!businessProcessClosed.toUpperCase().includes('PXK')) {
          continue;
        }
        
        // 2. Remove duplicate Station Code / line
        const cleanStation = stationCode.trim();
        if (seenStations.has(cleanStation)) {
          continue;
        }
        seenStations.add(cleanStation);
        
        const codeUnits = cells[offset + 0] || '';
        const extractedUnit = extractUnitFromCode(codeUnits);
        const closedDate = cells[offset + 25] || ''; // The time involved in the process has finally closed (index 26)
        
        parsedRows.push({
          id: `${cleanStation}_${Date.now()}_${Math.random()}`,
          unit: extractedUnit,
          codeUnits: codeUnits,
          teamName: cells[offset + 1] || '',
          stationCode: cleanStation,
          buildingCode: cells[offset + 3] || '',
          constructionType: cells[offset + 4] || '',
          codeList: cells[offset + 5] || '',
          nameLists: cells[offset + 6] || '',
          serialNumber: cells[offset + 7] || '',
          status: cells[offset + 8] || '',
          propertyType: cells[offset + 9] || '',
          count: cells[offset + 10] || '',
          formerPrice: cells[offset + 11] || '',
          originalPrice: cells[offset + 12] || '',
          amountCost: cells[offset + 13] || '',
          handoverMoney: cells[offset + 14] || '',
          processInvolved: cells[offset + 15] || '',
          stationManagement: cells[offset + 16] || '',
          repManagementCDC: cells[offset + 17] || '',
          repManagementTSML: cells[offset + 18] || '',
          timeAtWork: cells[offset + 19] || '',
          currentBusinessProcess: cells[offset + 20] || '',
          codeUnitCurrentProcess: cells[offset + 21] || '',
          nextStep: cells[offset + 22] || '',
          timeJoinBusiness: cells[offset + 23] || '',
          businessProcessClosed: businessProcessClosed,
          timeClosed: closedDate,
          explain: cells[offset + 26] || '', // Explain (index 27)
          note: cells[offset + 27] || '', // Note (index 28)
          checkUnit: cells[offset + 28] || '',
          qtyOfDay: cells[offset + 29] || '',
          team: cells[offset + 30] || '',
          daysDiff: calculateDaysDiff(closedDate),
          year: extractYearFromDate(closedDate)
        });
      }
    }
    return parsedRows;
  };

  const handleImport = () => {
    if (!pasteData.trim()) {
      showNotification('Please paste Excel data first!', 'warning');
      return;
    }
    
    const parsed = parsePastedData(pasteData);
    if (parsed.length === 0) {
      showNotification('No valid records containing PXK found!', 'warning');
      return;
    }
    
    // Identify completed items (existed in old data but not in new parsed data)
    const newStationCodes = new Set(parsed.map(item => item.stationCode));
    const newlyCompleted = data.filter(item => !newStationCodes.has(item.stationCode));
    
    const newConfirmed = { ...confirmedStatus };
    const nowStr = new Date().toISOString();
    
    newlyCompleted.forEach(item => {
      newConfirmed[item.id] = { confirmed: true, date: nowStr };
    });
    
    setConfirmedStatus(newConfirmed);
    setData(parsed);
    
    if (newlyCompleted.length > 0) {
      showNotification(`Import complete: loaded ${parsed.length} records. Marked ${newlyCompleted.length} missing items as Completed!`, 'success');
    } else {
      showNotification(`Import complete: loaded ${parsed.length} unique PXK records!`, 'success');
    }
    
    setShowPasteModal(false);
    setPasteData('');
  };

  const clearAllData = () => {
    if (window.confirm('⚠️ Are you sure you want to clear all construction records?')) {
      setData([]);
      setConfirmedStatus({});
      setSelectedRows(new Set());
      clearStore(STORAGE_KEYS.DATA);
      clearStore(STORAGE_KEYS.CONFIRMED);
      showNotification('All data cleared successfully!', 'info');
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === filteredData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredData.map(item => item.id)));
    }
  };

  const deleteSelectedRows = () => {
    if (window.confirm(`Are you sure you want to mark ${selectedRows.size} records as completed/signed?`)) {
      const newConfirmed = { ...confirmedStatus };
      const nowStr = new Date().toISOString();
      
      selectedRows.forEach(id => {
        newConfirmed[id] = { confirmed: true, date: nowStr };
      });
      
      setConfirmedStatus(newConfirmed);
      setSelectedRows(new Set());
      showNotification('Records marked as completed!', 'success');
    }
  };

  // Filtered and searched data
  const filteredData = useMemo(() => {
    let result = data.filter(item => !confirmedStatus[item.id]?.confirmed);
    
    if (selectedUnitFilter !== 'ALL') {
      result = result.filter(item => item.unit === selectedUnitFilter);
    }

    // 🗓️ Days Filter
    if (daysFilter !== 'ALL') {
      if (daysFilter === '0') {
        result = result.filter(item => (item.daysDiff || 0) === 0);
      } else if (daysFilter === '1-3') {
        result = result.filter(item => (item.daysDiff || 0) >= 1 && (item.daysDiff || 0) <= 3);
      } else if (daysFilter === '4-6') {
        result = result.filter(item => (item.daysDiff || 0) >= 4 && (item.daysDiff || 0) <= 6);
      } else if (daysFilter === '>=4') {
        result = result.filter(item => (item.daysDiff || 0) >= 4);
      } else if (daysFilter === '>=7') {
        result = result.filter(item => (item.daysDiff || 0) >= 7);
      }
    }
    
    if (searchTerm) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter(item => 
        item.stationCode?.toLowerCase().includes(term) ||
        item.buildingCode?.toLowerCase().includes(term) ||
        item.teamName?.toLowerCase().includes(term) ||
        item.nameLists?.toLowerCase().includes(term) ||
        item.businessProcessClosed?.toLowerCase().includes(term) ||
        item.timeClosed?.toLowerCase().includes(term)
      );
    }

    // ↕️ Days Sorting
    if (daysSortOrder !== 'none') {
      result = [...result].sort((a, b) => {
        const aDays = a.daysDiff || 0;
        const bDays = b.daysDiff || 0;
        return daysSortOrder === 'desc' ? bDays - aDays : aDays - bDays;
      });
    }
    
    return result;
  }, [data, confirmedStatus, selectedUnitFilter, searchTerm, daysFilter, daysSortOrder]);

  // Paginated Data
  const totalItems = filteredData.length;
  const effectivePageSize = pageSize === 'ALL' ? (totalItems || 1) : pageSize;
  const totalPages = Math.ceil(totalItems / effectivePageSize) || 1;

  const paginatedData = useMemo(() => {
    if (pageSize === 'ALL') return filteredData;
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  // Active units listing for tabs
  const activeUnits = useMemo(() => {
    const units = data.filter(item => !confirmedStatus[item.id]?.confirmed).map(item => item.unit).filter(Boolean);
    return ['ALL', ...new Set(units)].sort();
  }, [data, confirmedStatus]);

  // Export back to Excel
  const exportToExcel = () => {
    if (filteredData.length === 0) {
      showNotification('No data to export!', 'warning');
      return;
    }
    
    const exportRows = filteredData.map((item, idx) => ({
      "No": idx + 1,
      "Unit": item.unit || '-',
      "Code Units / Agency": item.codeUnits,
      "Name of Team": item.teamName,
      "Station Code": item.stationCode,
      "Building Code": item.buildingCode,
      "Type of Construction": item.constructionType,
      "Item Code": item.codeList,
      "Item Name": item.nameLists,
      "Process Involved": item.processInvolved,
      "Business Process Closed (PXK)": item.businessProcessClosed,
      "Time Closed": item.timeClosed,
      "Days Difference": item.daysDiff,
      "Explain": item.explain
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Construction Data');
    XLSX.writeFile(wb, `Construction_PXK_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('Excel report generated successfully!', 'success');
  };

  return (
    <div className="w-full h-screen max-h-screen p-2 sm:p-3 bg-slate-100 flex flex-col overflow-hidden">
      
      {/* ─── Smart Import Modal ─── */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-fadeIn">
            <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
              <h2 className="text-lg font-black flex items-center gap-2">
                <span>📋</span> Smart Import Construction PXK Data
              </h2>
              <button onClick={() => setShowPasteModal(false)} className="text-slate-400 hover:text-white text-xl cursor-pointer">✕</button>
            </div>
            <div className="p-6">
              <p className="text-xs text-slate-500 mb-3 font-medium">
                Copy all columns from Excel starting from <strong>No</strong> or <strong>Code Units</strong>, paste below. 
                The system automatically filters rows containing <strong>PXK</strong> and removes duplicate <strong>Station Codes</strong>.
              </p>
              <textarea 
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                placeholder="Paste tab-separated spreadsheet columns here..."
                className="w-full h-80 p-4 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-mono bg-slate-50 border-slate-200 resize-none shadow-inner"
              />
              <div className="flex justify-end gap-2.5 mt-5">
                <button onClick={() => setShowPasteModal(false)} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-sm transition-colors cursor-pointer border-0">Cancel</button>
                <button onClick={handleImport} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-lg text-sm shadow-md transition-colors cursor-pointer border-0">Import Records</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Notification Toast ─── */}
      {notification && (
        <div className="fixed top-6 right-6 z-50 animate-slideIn">
          <div className={`px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-2 text-sm font-bold border ${
            notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100 shadow-emerald-100/50' :
            notification.type === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-100 shadow-amber-100/50' :
            notification.type === 'info' ? 'bg-indigo-50 text-indigo-800 border-indigo-100 shadow-indigo-100/50' :
            'bg-rose-50 text-rose-800 border-rose-100 shadow-rose-100/50'
          }`}>
            <span>{
              notification.type === 'success' ? '✅' :
              notification.type === 'warning' ? '⚠️' :
              notification.type === 'info' ? 'ℹ️' : '🚨'
            }</span>
            {notification.message}
          </div>
        </div>
      )}

      {/* ─── MAIN CONTAINER (FULL SCREEN FLEX) ─── */}
      <div className="bg-white rounded-lg shadow-xl border border-slate-300 flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-950 px-3 py-1 text-white flex-shrink-0 border-b border-emerald-900 shadow-sm">
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-black tracking-tight flex items-center gap-1 text-white">
                  <span>🏗️</span> 04 NEW CONSTRUCTION TRACKER
                </h1>
                <span className="bg-emerald-500/30 text-emerald-200 text-[9px] font-mono px-1.5 py-0.25 rounded-full uppercase tracking-wider border border-emerald-400/30 font-bold">
                  PXK FILTERED • KPI = 3 DAYS
                </span>
              </div>
            </div>
            <div className="flex gap-1.5 items-center">
              <span className="text-slate-300 text-[10px] hidden lg:inline mr-2">
                <strong>BTS Handover:</strong> តាមដានការសាងសង់ BTS Handover &amp; PXK
              </span>
              <button onClick={clearAllData} className="bg-rose-600/80 hover:bg-rose-600 text-white font-bold px-2 py-0.5 rounded text-[10px] transition-all border border-rose-500/50 shadow-xs cursor-pointer">🗑️ Clear All</button>
              <button onClick={exportToExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-0.5 rounded text-[10px] transition-all shadow-xs cursor-pointer border-0">📎 Export Excel</button>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-3 py-1 bg-slate-100 border-b border-slate-300 flex-shrink-0">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <div className="flex flex-wrap gap-1.5 items-center">
              <button onClick={() => setShowPasteModal(true)} className="px-2.5 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-extrabold shadow-xs transition-all cursor-pointer border-0 flex items-center gap-1">🔄 Smart Import</button>
              <button onClick={exportToExcel} className="px-2.5 py-0.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-[11px] font-extrabold shadow-xs transition-all cursor-pointer border-0 flex items-center gap-1">📎 Export Excel</button>
              {selectedRows.size > 0 && (
                <button onClick={deleteSelectedRows} className="px-2.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-extrabold shadow-xs transition-all cursor-pointer border-0 flex items-center gap-1">🗑️ Complete ({selectedRows.size})</button>
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
                        ? 'bg-emerald-700 text-white shadow-2xs' 
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
            <input 
              type="text" 
              placeholder="Search station, building, PXK..." 
              value={searchTerm} 
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-44 sm:w-56 px-2 py-0.5 text-[11px] font-medium border border-slate-300 rounded bg-white focus:ring-1 focus:ring-emerald-500 focus:border-transparent outline-none transition-all shadow-xs" 
            />
          </div>
        </div>

        {/* stats bar (COMPACT INLINE) */}
        <div className="px-3 py-0.5 bg-slate-200/70 border-b border-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-1.5 flex-shrink-0 text-[9.5px]">
          <div className="bg-white rounded px-2 py-0.5 shadow-xs border border-slate-300 flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-slate-500">Total PXK</span>
            <span className="text-xs font-black text-emerald-700">{data.length}</span>
          </div>
          <div className="bg-white rounded px-2 py-0.5 shadow-xs border border-slate-300 flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-amber-700">Active Pending</span>
            <span className="text-xs font-black text-amber-700">{filteredData.length}</span>
          </div>
          <div className="bg-white rounded px-2 py-0.5 shadow-xs border border-slate-300 flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-indigo-700">Selected</span>
            <span className="text-xs font-black text-indigo-700">{selectedRows.size}</span>
          </div>
          <div className="bg-white rounded px-2 py-0.5 shadow-xs border border-slate-300 flex items-center justify-between">
            <span className="font-black uppercase tracking-wider text-purple-700">Completed</span>
            <span className="text-xs font-black text-purple-700">
              {Object.keys(confirmedStatus).filter(id => confirmedStatus[id]?.confirmed).length}
            </span>
          </div>
        </div>

        {/* Unit Tabs */}
        {activeUnits.length > 2 && (
          <div className="px-3 pt-1 bg-slate-100 border-b border-slate-300 flex items-center gap-1 overflow-x-auto flex-shrink-0">
            {activeUnits.map(unit => (
              <button
                key={unit}
                onClick={() => { setSelectedUnitFilter(unit); setCurrentPage(1); }}
                className={`px-2 py-0.5 rounded-t font-black text-[9.5px] tracking-wide uppercase transition-all whitespace-nowrap cursor-pointer border border-b-0 ${
                  selectedUnitFilter === unit 
                    ? 'bg-slate-800 text-white border-slate-800 font-extrabold shadow-xs' 
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-200/70'
                }`}
              >
                {unit}
              </button>
            ))}
          </div>
        )}

        {/* Table View */}
        <div className="flex-1 min-h-0 overflow-auto border-t border-b border-slate-300 bg-white">
          <table className="min-w-full border-collapse border border-slate-300 text-[9.5px] leading-tight table-auto bg-white">
            <thead>
              <tr className="bg-slate-800 text-white font-black uppercase tracking-wider text-[9px]">
                <th className="border border-slate-700 px-1 py-0.5 w-6 text-center sticky top-0 z-20 bg-slate-800">
                  <input type="checkbox" checked={selectedRows.size === filteredData.length && filteredData.length > 0} onChange={toggleSelectAll} className="rounded" />
                </th>
                <th className="border border-slate-700 px-1 py-0.5 w-8 text-center sticky top-0 z-20 bg-slate-800">No</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Code Units / Agency Management</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Name of the unit / agency management</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap min-w-[150px]">Station Code / line</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Building code</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Type of construction</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Code list</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Name lists</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Serial Number</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Status</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Property Type</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-center sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Count</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-right sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Former financial price (VND)</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-right sticky top-0 z-20 bg-slate-800 whitespace-nowrap">The original price of consoles (VND)</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-right sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Amount at cost financing (VND)</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-right sticky top-0 z-20 bg-slate-800 whitespace-nowrap">To hand over money at cost (VND)</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Process is involved</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">The station management / line</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Representing management TS TBVP, CDC</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Representing management TSML</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-center sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Time at work (Day)</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Current business processes</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Code generated unit current business processes</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">The next professional step</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-center sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Time join existing business</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap text-blue-300 min-w-[170px]">Business process finally closed</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-center sticky top-0 z-20 bg-slate-800 whitespace-nowrap">The time involved in the process has finally closed</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Explain</th>
                <th className="border border-slate-700 px-1.5 py-0.5 text-left sticky top-0 z-20 bg-slate-800 whitespace-nowrap">Note</th>
                <th 
                  onClick={() => setDaysSortOrder(prev => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none')}
                  className="border border-slate-700 px-1.5 py-0.5 text-center sticky top-0 z-20 bg-slate-800 whitespace-nowrap cursor-pointer hover:bg-slate-700 select-none text-amber-300"
                  title="Click to sort by Days"
                >
                  Days {daysSortOrder === 'desc' ? '⬇️' : daysSortOrder === 'asc' ? '⬆️' : '↕️'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-normal text-slate-800 bg-white">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={32} className="border border-slate-300 px-6 py-12 text-center text-slate-400 font-bold text-sm bg-white">
                    No construction records found. Use "Smart Import" to load Excel rows.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                  const isSelected = selectedRows.has(item.id);
                  const isOver = item.daysDiff >= 4;
                  
                  return (
                    <tr key={item.id} className={`transition-colors ${isSelected ? 'bg-blue-50' : 'even:bg-slate-50/70 odd:bg-white hover:bg-emerald-50/70'}`}>
                      <td className="border border-slate-300 px-1 py-0.25 text-center bg-white">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelectRow(item.id)} className="rounded" />
                      </td>
                      <td className="border border-slate-300 px-1 py-0.25 text-center font-bold text-slate-500 bg-slate-100/70">{globalIdx}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 font-semibold text-slate-700 whitespace-nowrap">{item.codeUnits}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 font-bold text-slate-900 whitespace-nowrap">{item.teamName}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 font-mono font-bold text-slate-900 whitespace-nowrap min-w-[150px]">{item.stationCode}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 font-mono text-slate-600 whitespace-nowrap">{item.buildingCode}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap">{item.constructionType}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 font-mono text-slate-600 whitespace-nowrap">{item.codeList}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap max-w-md truncate" title={item.nameLists}>{item.nameLists}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 font-mono text-slate-600 whitespace-nowrap">{item.serialNumber}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap">{item.status}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap">{item.propertyType}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-center text-slate-700">{item.count}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-right font-mono text-slate-600">{item.formerPrice}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-right font-mono text-slate-600">{item.originalPrice}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-right font-mono text-slate-600">{item.amountCost}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-right font-mono text-slate-600">{item.handoverMoney}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap">{item.processInvolved}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap">{item.stationManagement}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap">{item.repManagementCDC}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap">{item.repManagementTSML}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-center text-slate-700">{item.timeAtWork}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap">{item.currentBusinessProcess}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap">{item.codeUnitCurrentProcess}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap">{item.nextStep}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-center font-mono text-slate-600">{item.timeJoinBusiness}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 font-mono font-bold text-blue-800 bg-blue-50/60 whitespace-nowrap min-w-[170px]">{item.businessProcessClosed}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-center font-mono text-slate-600">{item.timeClosed}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap max-w-xs truncate" title={item.explain}>{item.explain}</td>
                      <td className="border border-slate-300 px-1.5 py-0.25 text-slate-700 whitespace-nowrap max-w-xs truncate" title={item.note}>{item.note}</td>
                      <td className="border border-slate-300 px-1 py-0.25 text-center font-extrabold whitespace-nowrap">
                        <span className={`px-1 py-0 rounded font-mono text-[9px] font-black ${
                          isOver ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          {item.daysDiff}d
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredData.length > 0 && (
          <div className="px-3 py-1 bg-slate-100 border-t border-slate-300 flex justify-between items-center flex-wrap gap-2 flex-shrink-0 text-[11px] text-slate-700">
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
                Showing {pageSize === 'ALL' ? 1 : (currentPage - 1) * pageSize + 1} to {pageSize === 'ALL' ? filteredData.length : Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} records
              </span>
            </div>
            <div className="flex gap-1">
              <button 
                onClick={() => setCurrentPage(1)} 
                disabled={currentPage === 1}
                className="px-2 py-0.5 bg-white border border-slate-300 text-slate-800 rounded font-bold hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer shadow-xs"
              >
                First
              </button>
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                disabled={currentPage === 1}
                className="px-2 py-0.5 bg-white border border-slate-300 text-slate-800 rounded font-bold hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer shadow-xs"
              >
                Prev
              </button>
              <span className="px-2 py-0.5 bg-slate-800 text-white rounded font-black shadow-xs">
                Page {currentPage} of {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                disabled={currentPage === totalPages}
                className="px-2 py-0.5 bg-white border border-slate-300 text-slate-800 rounded font-bold hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer shadow-xs"
              >
                Next
              </button>
              <button 
                onClick={() => setCurrentPage(totalPages)} 
                disabled={currentPage === totalPages}
                className="px-2 py-0.5 bg-white border border-slate-300 text-slate-800 rounded font-bold hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer shadow-xs"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default New_construction;

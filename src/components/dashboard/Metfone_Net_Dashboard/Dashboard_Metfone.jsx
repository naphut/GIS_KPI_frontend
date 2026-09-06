import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  sendMetfoneToTelegram, 
  sendToAllMetfoneTelegram, 
  getConfiguredUnits,
  hasGroupId,
  hasToken,
  getSavedTemplates,
  saveTemplate,
  deleteTemplate,
  sendPhotoToTelegram,
  sendDocumentToTelegram,
  generateMetfoneExcelBlob,
  cleanWarehouseName
} from '../../../services/telegramBot';
import { loadFromDb, saveToDb, loadStoreMeta } from '../../../services/dbStore';
import html2canvas from 'html2canvas';

// All standard 25 Units
const allUnits = [
  'BAN', 'BAT', 'CHA', 'CHH', 'KAM', 'KAN', 'KANZ1', 'KOH', 'KRA',
  'MON', 'ODD', 'PNP', 'PNPZ1', 'PNPZ2', 'PRE', 'PRH', 'PUR', 'ROT',
  'SIE', 'SIH', 'SPE', 'STU', 'SVA', 'TAK', 'THO'
];

// Helper to safely parse local storage
const getStorageData = (key) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
};

// Unit extraction helper for Metfone strings
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

export default function DashboardMetfone({ onNavigate, screenshotUnit, summaryImageMode: extSummaryImageMode }) {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Dropdown States
  const [openBatchDropdown, setOpenBatchDropdown] = useState(false);
  const [openSingleDropdown, setOpenSingleDropdown] = useState(false);
  const [showUnitSelector, setShowUnitSelector] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(screenshotUnit || 'ALL');
  const [localScreenshotUnit, setScreenshotUnit] = useState(screenshotUnit || null);
  const activeScreenshotUnit = localScreenshotUnit || screenshotUnit || selectedUnit;
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [internalSummaryImageMode, setInternalSummaryImageMode] = useState(false);
  const summaryImageMode = extSummaryImageMode !== undefined ? extSummaryImageMode : internalSummaryImageMode;
  const [isSelectingForSummary, setIsSelectingForSummary] = useState(false);

  // Active items for detailed screenshot chunks (matches Stockout_yet_Dashboard)
  const [activeM1Items, setActiveM1Items] = useState([]);
  const [activeM2Items, setActiveM2Items] = useState([]);
  const [activeM3Items, setActiveM3Items] = useState([]);
  const [screenshotPartText, setScreenshotPartText] = useState("");
  const [screenshotTitle, setScreenshotTitle] = useState("");

  const getDelayBadge = (days, maxKpiDays = 3) => {
    const num = parseInt(days) || 0;
    if (num > maxKpiDays) {
      return (
        <span className="bg-red-600 text-white border border-red-700 font-black px-2.5 py-0.5 rounded-md text-[9.5px] inline-flex items-center gap-1 shadow-xs uppercase tracking-wider">
          🚨 +{num}d
        </span>
      );
    }
    return (
      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded-md text-[9px] inline-flex items-center gap-0.5">
        ✅ {num}d
      </span>
    );
  };

  // Note & Templates
  const [customNote, setCustomNote] = useState('');
  const [savedNotes, setSavedNotes] = useState([]);

  // Sending States
  const [isSending, setIsSending] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0, unit: '', status: '' });
  const [sendResults, setSendResults] = useState(null);
  const abortControllerRef = useRef(null);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Sync saved templates
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const templates = await getSavedTemplates();
        setSavedNotes(Array.isArray(templates) ? templates : []);
      } catch (err) {
        setSavedNotes([]);
      }
    };
    loadTemplates();
  }, []);

  const handleSaveNote = async () => {
    if (!customNote.trim()) return;
    if (Array.isArray(savedNotes) && savedNotes.some(n => n.content === customNote.trim())) return;
    try {
      const result = await saveTemplate(customNote.trim());
      if (result && !result.error) {
        setSavedNotes(prev => [result, ...(Array.isArray(prev) ? prev : [])]);
      }
    } catch (err) {
      console.error('Failed to save template', err);
    }
  };

  const handleDeleteNote = async (id) => {
    try {
      const success = await deleteTemplate(id);
      if (success) {
        setSavedNotes(prev => (Array.isArray(prev) ? prev.filter(n => n.id !== id) : []));
      }
    } catch (err) {
      console.error('Failed to delete template', err);
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.relative')) {
        setOpenBatchDropdown(false);
        setOpenSingleDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Data states (clean without example data)
  const [m1Data, setM1Data] = useState(() => getStorageData('metfone_stockout_data') || []);
  const [m2Data, setM2Data] = useState(() => getStorageData('metfone_nocreate_data') || []);
  const [m3Data, setM3Data] = useState(() => getStorageData('metfone_handover_data') || []);

  const [m1Targets, setM1Targets] = useState(() => getStorageData('metfone_stockout_targets') || {});
  const [m2Targets, setM2Targets] = useState(() => getStorageData('metfone_nocreate_targets') || {});
  const [m3Targets, setM3Targets] = useState(() => getStorageData('metfone_handover_targets') || {});

  const [m1History, setM1History] = useState(() => getStorageData('metfone_stockout_completionHistory') || []);
  const [m2History, setM2History] = useState(() => getStorageData('metfone_nocreate_completionHistory') || []);
  const [m3History, setM3History] = useState(() => getStorageData('metfone_handover_completionHistory') || []);

  const [m1Confirmed, setM1Confirmed] = useState(() => getStorageData('metfone_stockout_confirmedStatus') || {});
  const [m2Confirmed, setM2Confirmed] = useState(() => getStorageData('metfone_nocreate_confirmedStatus') || {});
  const [m3Confirmed, setM3Confirmed] = useState(() => getStorageData('metfone_handover_confirmedStatus') || {});

  // Backend Sync & Insertion Time State
  const [backendSyncTime, setBackendSyncTime] = useState(() => {
    try {
      const meta = JSON.parse(localStorage.getItem('metfone_stockout_data_meta'));
      return meta?.created_at || meta?.updated_at || null;
    } catch (e) {
      return null;
    }
  });
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTargetModule, setImportTargetModule] = useState('m1');
  const [pasteData, setPasteData] = useState('');
  const [importStatus, setImportStatus] = useState(null);
  const [isSavingToBackend, setIsSavingToBackend] = useState(false);

  const formatBackendTime = (isoString) => {
    if (!isoString) return 'ទើបបញ្ចូល (Just now)';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } catch (e) {
      return isoString;
    }
  };

  // Parser for pasted Excel / TSV data
  const parseMetfonePastedData = (text, moduleType) => {
    const rows = text.split(/\r?\n/);
    const parsedRows = [];

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i].trim();
      if (!line) continue;
      // skip header row if detected
      if (i === 0 && (
        line.toLowerCase().includes('warehouse') ||
        line.toLowerCase().includes('export') ||
        line.toLowerCase().includes('receiver') ||
        line.toLowerCase().includes('code')
      )) {
        continue;
      }

      const cols = line.split('\t');
      if (cols.length === 1 && line.includes('  ')) {
        const spaceCols = line.split(/\s{2,}/);
        if (spaceCols.length >= 3) cols.splice(0, cols.length, ...spaceCols);
      }

      if (moduleType === 'm1') {
        let offset = /^\d+$/.test(cols[0].trim()) ? 1 : 0;
        const exportCode = cols[offset + 0] ? cols[offset + 0].trim() : '';
        const exportNo = cols[offset + 1] ? cols[offset + 1].trim() : '';
        const realExport = cols[offset + 2] ? cols[offset + 2].trim() : '';
        const stockReceiver = cols[offset + 3] ? cols[offset + 3].trim() : '';
        const groupReceiver = cols[offset + 4] ? cols[offset + 4].trim() : '';
        const constructionReceiver = cols[offset + 5] ? cols[offset + 5].trim() : '';
        if (exportCode || exportNo) {
          parsedRows.push({
            no: parsedRows.length + 1,
            exportCode,
            exportNo,
            realExport,
            stockReceiver,
            groupReceiver,
            constructionReceiver
          });
        }
      } else if (moduleType === 'm2') {
        let offset = /^\d+$/.test(cols[0].trim().replace(/\.$/, '')) ? 1 : 0;
        if (cols.length - offset >= 4) {
          parsedRows.push({
            no: parsedRows.length + 1,
            codeStockOut: cols[offset + 0] ? cols[offset + 0].trim() : '',
            warehouse: cols[offset + 1] ? cols[offset + 1].trim() : '',
            recipient: cols[offset + 2] ? cols[offset + 2].trim() : '',
            creator: cols[offset + 3] ? cols[offset + 3].trim() : '',
            creatingDate: cols[offset + 4] ? cols[offset + 4].trim() : ''
          });
        }
      } else if (moduleType === 'm3') {
        let offset = /^\d+$/.test(cols[0].trim().replace(/\.$/, '')) ? 1 : 0;
        if (cols.length - offset >= 4) {
          parsedRows.push({
            no: parsedRows.length + 1,
            codeHandover: cols[offset + 0] ? cols[offset + 0].trim() : '',
            type: cols[offset + 1] ? cols[offset + 1].trim() : '',
            handoverUnit: cols[offset + 2] ? cols[offset + 2].trim() : '',
            unitConfirm: cols[offset + 3] ? cols[offset + 3].trim() : '',
            handoverDate: cols[offset + 4] ? cols[offset + 4].trim() : '',
            status: cols[offset + 5] ? cols[offset + 5].trim() : 'Not confirmed'
          });
        }
      }
    }
    return parsedRows;
  };

  const handleImportToBackend = async () => {
    if (!pasteData.trim()) return;
    setIsSavingToBackend(true);
    setImportStatus(null);
    try {
      const parsed = parseMetfonePastedData(pasteData, importTargetModule);
      if (parsed.length === 0) {
        alert('⚠️ រកមិនឃើញទិន្នន័យត្រឹមត្រូវឡើយ! សូមពិនិត្យការ Copy ពី Excel។');
        setIsSavingToBackend(false);
        return;
      }

      let storageKey = 'metfone_stockout_data';
      if (importTargetModule === 'm2') storageKey = 'metfone_nocreate_data';
      if (importTargetModule === 'm3') storageKey = 'metfone_handover_data';

      const res = await saveToDb(storageKey, parsed);
      const nowIso = res?.created_at || res?.updated_at || new Date().toISOString();
      setBackendSyncTime(nowIso);

      if (importTargetModule === 'm1') setM1Data(parsed);
      else if (importTargetModule === 'm2') setM2Data(parsed);
      else if (importTargetModule === 'm3') setM3Data(parsed);

      setImportStatus(`✅ បានបញ្ចូលទិន្នន័យ ${parsed.length} ជួរ ទៅក្នុង Backend ដោយជោគជ័យ!`);
      setPasteData('');
      setTimeout(() => {
        setShowImportModal(false);
        setImportStatus(null);
      }, 1500);
    } catch (err) {
      alert(`❌ បរាជ័យក្នុងការបញ្ចូលទៅ Backend: ${err.message}`);
    } finally {
      setIsSavingToBackend(false);
    }
  };

  // Load from Database on Mount & Auto Seed if empty
  useEffect(() => {
    const fetchDb = async () => {
      try {
        const meta1 = await loadStoreMeta('metfone_stockout_data');
        const meta2 = await loadStoreMeta('metfone_nocreate_data');
        const meta3 = await loadStoreMeta('metfone_handover_data');

        const db1 = await loadFromDb('metfone_stockout_data', []);
        setM1Data(Array.isArray(db1) ? db1 : []);

        const db2 = await loadFromDb('metfone_nocreate_data', []);
        setM2Data(Array.isArray(db2) ? db2 : []);

        const db3 = await loadFromDb('metfone_handover_data', []);
        setM3Data(Array.isArray(db3) ? db3 : []);

        const t1 = await loadFromDb('metfone_stockout_targets', null);
        if (t1) setM1Targets(t1);
        const t2 = await loadFromDb('metfone_nocreate_targets', null);
        if (t2) setM2Targets(t2);
        const t3 = await loadFromDb('metfone_handover_targets', null);
        if (t3) setM3Targets(t3);

        const h1 = await loadFromDb('metfone_stockout_completionHistory', null);
        if (h1) setM1History(h1);
        const h2 = await loadFromDb('metfone_nocreate_completionHistory', null);
        if (h2) setM2History(h2);
        const h3 = await loadFromDb('metfone_handover_completionHistory', null);
        if (h3) setM3History(h3);

        const c1 = await loadFromDb('metfone_stockout_confirmedStatus', null);
        if (c1) setM1Confirmed(c1);
        const c2 = await loadFromDb('metfone_nocreate_confirmedStatus', null);
        if (c2) setM2Confirmed(c2);
        const c3 = await loadFromDb('metfone_handover_confirmedStatus', null);
        if (c3) setM3Confirmed(c3);

        const latestTime = [meta1?.created_at, meta1?.updated_at, meta2?.created_at, meta2?.updated_at, meta3?.created_at, meta3?.updated_at]
          .filter(Boolean)
          .sort((a, b) => new Date(b) - new Date(a))[0];
        if (latestTime) {
          setBackendSyncTime(latestTime);
        } else {
          setBackendSyncTime(new Date().toISOString());
        }
      } catch (err) {
        console.error("fetchDb error:", err);
      }
    };
    fetchDb();
  }, []);

  // Filter GIS ONLY and attach unit + daysDiff
  const gisM1 = useMemo(() => {
    const raw = Array.isArray(m1Data) ? m1Data : [];
    return raw
      .filter(item => item && (
        (item.groupReceiver && item.groupReceiver.toUpperCase().includes('GIS')) ||
        (item.stockReceiver && item.stockReceiver.toUpperCase().includes('GIS'))
      ))
      .map(item => ({
        ...item,
        unit: item.unit || getUnitFromMetfoneReceiver(item.groupReceiver, item.stockReceiver, item.exportCode, item.exportNo || item.code),
        daysDiff: item.daysDiff !== undefined ? item.daysDiff : calculateDaysDiff(item.realExport || item.date),
        isConfirmed: !!m1Confirmed[item.no || item.id]?.confirmed
      }));
  }, [m1Data, m1Confirmed]);

  const gisM2 = useMemo(() => {
    const raw = Array.isArray(m2Data) ? m2Data : [];
    return raw
      .filter(item => item && item.recipient && item.recipient.toUpperCase().includes('GIS'))
      .map(item => ({
        ...item,
        unit: item.unit || getUnitFromMetfoneReceiver(item.recipient, '', item.warehouse, item.codeStockOut || item.code),
        daysDiff: item.daysDiff !== undefined ? item.daysDiff : calculateDaysDiff(item.creatingDate || item.date),
        isConfirmed: !!m2Confirmed[item.no || item.id]?.confirmed
      }));
  }, [m2Data, m2Confirmed]);

  const gisM3 = useMemo(() => {
    const raw = Array.isArray(m3Data) ? m3Data : [];
    return raw
      .filter(item => item && item.unitConfirm && item.unitConfirm.toUpperCase().includes('GIS'))
      .map(item => ({
        ...item,
        unit: item.unit || getUnitFromMetfoneReceiver(item.unitConfirm, item.handoverUnit, '', item.codeHandover || item.code),
        daysDiff: item.daysDiff !== undefined ? item.daysDiff : calculateDaysDiff(item.handoverDate || item.date),
        isConfirmed: !!m3Confirmed[item.no || item.id]?.confirmed
      }));
  }, [m3Data, m3Confirmed]);

  // Compute Module stats
  const m1Stats = useMemo(() => {
    const total = gisM1.length;
    const completed = m1History.length;
    const pending = gisM1.filter(i => !i.isConfirmed).length;
    let mTarget = 0;
    let eTarget = 0;
    Object.values(m1Targets).forEach(t => {
      mTarget += Number(t?.morning || 0);
      eTarget += Number(t?.evening || 0);
    });
    const target = (currentTime.getHours() < 12) ? mTarget : (eTarget > 0 ? eTarget : mTarget);
    const ratio = target > 0 ? ((completed / target) * 100).toFixed(1) : (total > 0 ? ((completed / total) * 100).toFixed(1) : 0);
    const alarm = gisM1.filter(i => !i.isConfirmed && i.daysDiff >= 5).length;
    return { name: '01_STOCKOUT_YET CONFIRM', key: 'METFONE_STOCKOUT_YET_CONFIRM', total, completed, pending, mTarget, eTarget, target, ratio, alarm };
  }, [gisM1, m1History, m1Targets, currentTime]);

  const m2Stats = useMemo(() => {
    const total = gisM2.length;
    const completed = m2History.length;
    const pending = gisM2.filter(i => !i.isConfirmed).length;
    let mTarget = 0;
    let eTarget = 0;
    Object.values(m2Targets).forEach(t => {
      mTarget += Number(t?.morning || 0);
      eTarget += Number(t?.evening || 0);
    });
    const target = (currentTime.getHours() < 12) ? mTarget : (eTarget > 0 ? eTarget : mTarget);
    const ratio = target > 0 ? ((completed / target) * 100).toFixed(1) : (total > 0 ? ((completed / total) * 100).toFixed(1) : 0);
    const alarm = gisM2.filter(i => !i.isConfirmed && i.daysDiff >= 5).length;
    return { name: '02_NOT CREATE HAND OVER', key: 'METFONE_NOT_CREATE_HAND_OVER', total, completed, pending, mTarget, eTarget, target, ratio, alarm };
  }, [gisM2, m2History, m2Targets, currentTime]);

  const m3Stats = useMemo(() => {
    const total = gisM3.length;
    const completed = m3History.length;
    const pending = gisM3.filter(i => !i.isConfirmed).length;
    let mTarget = 0;
    let eTarget = 0;
    Object.values(m3Targets).forEach(t => {
      mTarget += Number(t?.morning || 0);
      eTarget += Number(t?.evening || 0);
    });
    const target = (currentTime.getHours() < 12) ? mTarget : (eTarget > 0 ? eTarget : mTarget);
    const ratio = target > 0 ? ((completed / target) * 100).toFixed(1) : (total > 0 ? ((completed / total) * 100).toFixed(1) : 0);
    const alarm = gisM3.filter(i => !i.isConfirmed && i.daysDiff >= 5).length;
    return { name: '03_HAND OVER_YET CONFIRM', key: 'METFONE_HAND_OVER_YET_CONFIRM', total, completed, pending, mTarget, eTarget, target, ratio, alarm };
  }, [gisM3, m3History, m3Targets, currentTime]);

  // Totals aggregated across all 3 modules
  const totals = useMemo(() => {
    const targetMorning = m1Stats.mTarget + m2Stats.mTarget + m3Stats.mTarget;
    const targetEvening = m1Stats.eTarget + m2Stats.eTarget + m3Stats.eTarget;
    const remain = m1Stats.pending + m2Stats.pending + m3Stats.pending;
    const result = m1Stats.completed + m2Stats.completed + m3Stats.completed;
    const inSystem = m1Stats.total + m2Stats.total + m3Stats.total;
    const totalTarget = (currentTime.getHours() < 12) ? targetMorning : (targetEvening > 0 ? targetEvening : targetMorning);
    const ratio = totalTarget > 0 
      ? ((result / totalTarget) * 100).toFixed(1)
      : (inSystem > 0 ? ((result / inSystem) * 100).toFixed(1) : '0.0');
    return { targetMorning, targetEvening, remain, result, inSystem, ratio };
  }, [m1Stats, m2Stats, m3Stats, currentTime]);

  // Prepares data map per unit for Telegram Bot
  const getReportData = () => {
    const unitsMap = {};
    allUnits.forEach(u => {
      const pendingM1 = gisM1.filter(i => i.unit === u && !i.isConfirmed);
      const pendingM2 = gisM2.filter(i => i.unit === u && !i.isConfirmed);
      const pendingM3 = gisM3.filter(i => i.unit === u && !i.isConfirmed);
      unitsMap[u] = {
        unit: u,
        m1Items: pendingM1,
        m2Items: pendingM2,
        m3Items: pendingM3,
        totalPending: pendingM1.length + pendingM2.length + pendingM3.length
      };
    });
    return {
      totals,
      units: unitsMap
    };
  };

  // Matrix calculation per team for Screenshot / Summary Image (matches Stockout_yet_Dashboard)
  const getSummaryRows = () => {
    const rows = [];
    const targetUnit = screenshotUnit && screenshotUnit !== 'ALL' ? screenshotUnit : selectedUnit;
    const unitsToProcess = targetUnit && targetUnit !== 'ALL' ? [targetUnit] : allUnits;

    unitsToProcess.forEach(unit => {
      const m1Items = gisM1.filter(i => i.unit === unit && !i.isConfirmed);
      const m2Items = gisM2.filter(i => i.unit === unit && !i.isConfirmed);
      const m3Items = gisM3.filter(i => i.unit === unit && !i.isConfirmed);

      const teamsSet = new Set();
      m1Items.forEach(item => {
        const teamName = item.team && item.team !== '-' ? item.team : (item.groupReceiver || item.stockReceiver || '-');
        if (teamName && teamName !== '-') teamsSet.add(teamName);
      });
      m2Items.forEach(item => {
        const teamName = item.team && item.team !== '-' ? item.team : (item.recipient || '-');
        if (teamName && teamName !== '-') teamsSet.add(teamName);
      });
      m3Items.forEach(item => {
        const teamName = item.team && item.team !== '-' ? item.team : (item.unitConfirm || item.handoverUnit || '-');
        if (teamName && teamName !== '-') teamsSet.add(teamName);
      });

      const teams = Array.from(teamsSet).sort((a, b) => a.localeCompare(b));

      teams.forEach(team => {
        const matchesM1 = (item) => (item.team && item.team !== '-' ? item.team : (item.groupReceiver || item.stockReceiver || '-')) === team;
        const matchesM2 = (item) => (item.team && item.team !== '-' ? item.team : (item.recipient || '-')) === team;
        const matchesM3 = (item) => (item.team && item.team !== '-' ? item.team : (item.unitConfirm || item.handoverUnit || '-')) === team;

        const s1Under = m1Items.filter(item => matchesM1(item) && (parseInt(item.daysDiff) || 0) <= 4).length;
        const s1Over = m1Items.filter(item => matchesM1(item) && (parseInt(item.daysDiff) || 0) > 4).length;

        const s2Under = m2Items.filter(item => matchesM2(item) && (parseInt(item.daysDiff) || 0) <= 3).length;
        const s2Over = m2Items.filter(item => matchesM2(item) && (parseInt(item.daysDiff) || 0) > 3).length;

        const s3Under = m3Items.filter(item => matchesM3(item) && (parseInt(item.daysDiff) || 0) <= 3).length;
        const s3Over = m3Items.filter(item => matchesM3(item) && (parseInt(item.daysDiff) || 0) > 3).length;

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

  // Generate chunks of 25 items for detailed screenshot report (matches Stockout_yet_Dashboard)
  const generateScreenshotTasks = (unit) => {
    const isSingleUnit = unit && unit !== 'ALL';
    const m1Items = isSingleUnit ? gisM1.filter(i => i.unit === unit && !i.isConfirmed) : gisM1.filter(i => !i.isConfirmed);
    const m2Items = isSingleUnit ? gisM2.filter(i => i.unit === unit && !i.isConfirmed) : gisM2.filter(i => !i.isConfirmed);
    const m3Items = isSingleUnit ? gisM3.filter(i => i.unit === unit && !i.isConfirmed) : gisM3.filter(i => !i.isConfirmed);

    const sortedM1 = [...m1Items].sort((a, b) => (a.groupReceiver || a.stockReceiver || '').localeCompare(b.groupReceiver || b.stockReceiver || ''));
    const sortedM2 = [...m2Items].sort((a, b) => (a.recipient || '').localeCompare(b.recipient || ''));
    const sortedM3 = [...m3Items].sort((a, b) => (a.unitConfirm || '').localeCompare(b.unitConfirm || ''));

    const tasks = [];
    const chunkSize = 25;

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
        title: "METFONE NET REPORT"
      });
    }

    return tasks;
  };

  // Telegram Sending Actions
  const handleCancelSend = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsSending(false);
      setShowProgressModal(false);
    }
  };

  // 1. Send Text to Single Unit
  const sendReportToTelegram = async (unit) => {
    if (isSending) return;
    if (!hasGroupId(unit)) {
      alert(`⚠️ No group ID configured for ${unit}. Please add it in telegramBot.js`);
      return;
    }

    setIsSending(true);
    setShowProgressModal(true);
    setSendProgress({ current: 1, total: 1, unit, status: 'sending' });
    setSendResults(null);

    abortControllerRef.current = new AbortController();

    try {
      const data = getReportData();
      const result = await sendMetfoneToTelegram(unit, data, customNote, abortControllerRef.current.signal);
      if (result && result.skipped) {
        setSendProgress({ current: 1, total: 1, unit, status: 'skipped' });
        setSendResults({ total: 1, success: 0, failed: 0 });
        alert(`ℹ️ No pending Metfone items for ${unit}. (គ្មានទិន្នន័យត្រូវផ្ញើទេ)`);
      } else if (result && result.success) {
        setSendProgress({ current: 1, total: 1, unit, status: 'success' });
        setSendResults({ total: 1, success: 1, failed: 0 });
        alert(`✅ Metfone report sent successfully to ${unit} group!`);
      } else {
        const isAbort = result?.aborted || abortControllerRef.current.signal.aborted;
        setSendProgress({ current: 1, total: 1, unit, status: 'failed', error: isAbort ? 'Cancelled' : result?.error });
        setSendResults({ total: 1, success: 0, failed: 1 });
        if (!isAbort) alert(`❌ Failed to send Metfone report: ${result?.error || 'Unknown error'}`);
      }
    } catch (err) {
      if (err.name !== 'AbortError') alert(`❌ Error sending report: ${err.message}`);
    } finally {
      setIsSending(false);
      setShowUnitSelector(false);
    }
  };

  // 2. Send Text to All Units
  const sendToAll = async () => {
    if (isSending) return;
    const configured = getConfiguredUnits();
    if (configured.length === 0) {
      alert('⚠️ No group IDs configured. Please add group IDs in telegramBot.js');
      return;
    }

    setIsSending(true);
    setShowProgressModal(true);
    setSendProgress({ current: 0, total: configured.length, unit: '', status: 'starting' });
    setSendResults(null);

    abortControllerRef.current = new AbortController();

    try {
      const data = getReportData();
      const res = await sendToAllMetfoneTelegram(
        data,
        (progress) => setSendProgress(progress),
        customNote,
        abortControllerRef.current.signal
      );
      setSendResults(res.summary);
    } catch (err) {
      if (err.name !== 'AbortError') alert(`❌ Batch send failed: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // 3. Send Detail Screenshot + Excel to Single Unit (matches Stockout_yet_Dashboard)
  const sendReportToTelegramScreenshot = async (unit) => {
    if (isSending) return;
    if (!hasGroupId(unit)) {
      alert(`⚠️ No group ID configured for ${unit}.`);
      return;
    }

    setIsSending(true);
    setShowProgressModal(true);
    abortControllerRef.current = new AbortController();

    try {
      const tasks = generateScreenshotTasks(unit);
      setScreenshotUnit(unit);
      setSendProgress({ current: 1, total: tasks.length, unit, status: 'sending' });
      setSendResults(null);

      for (let i = 0; i < tasks.length; i++) {
        if (abortControllerRef.current.signal.aborted) break;

        const task = tasks[i];
        setActiveM1Items(task.m1 || []);
        setActiveM2Items(task.m2 || []);
        setActiveM3Items(task.m3 || []);
        setScreenshotPartText(tasks.length > 1 ? `(${task.label})` : "");
        setScreenshotTitle(task.title);

        setSendProgress({ current: i + 1, total: tasks.length, unit, status: 'sending' });
        await new Promise(r => setTimeout(r, 400));

        const element = document.getElementById('telegram-screenshot-report');
        if (!element) throw new Error('Screenshot report element not found');

        const offsetWidth = Math.max(element.scrollWidth || 0, element.offsetWidth || 0, 1150);
        const offsetHeight = element.offsetHeight || 500;
        let scale = 3.0;
        if (offsetHeight > 1800) scale = 2.0;
        else if (offsetHeight > 1200) scale = 2.5;

        const canvas = await html2canvas(element, {
          useCORS: true,
          scale: scale,
          backgroundColor: '#f8fafc',
          width: offsetWidth,
          height: offsetHeight,
          scrollX: 0,
          scrollY: 0,
          windowWidth: Math.max(document.documentElement.offsetWidth, offsetWidth + 100),
          windowHeight: document.documentElement.offsetHeight,
          logging: false,
          onclone: (clonedDoc) => {
            const clonedEl = clonedDoc.getElementById('telegram-screenshot-report');
            if (clonedEl) {
              clonedEl.style.position = 'static';
              clonedEl.style.width = 'max-content';
              clonedEl.style.overflow = 'visible';
            }
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

        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        if (!blob || blob.size < 1000) throw new Error('Invalid screenshot generated');

        await sendPhotoToTelegram(unit, blob, '', abortControllerRef.current.signal);
        await new Promise(r => setTimeout(r, 350));
      }

      // Send Metfone 3-sheet Excel
      const isSingleUnit = unit && unit !== 'ALL';
      const m1Items = isSingleUnit ? gisM1.filter(i => i.unit === unit && !i.isConfirmed) : gisM1.filter(i => !i.isConfirmed);
      const m2Items = isSingleUnit ? gisM2.filter(i => i.unit === unit && !i.isConfirmed) : gisM2.filter(i => !i.isConfirmed);
      const m3Items = isSingleUnit ? gisM3.filter(i => i.unit === unit && !i.isConfirmed) : gisM3.filter(i => !i.isConfirmed);
      const excelBlob = generateMetfoneExcelBlob(m1Items, m2Items, m3Items, unit);
      const filename = `METFONE_NET_${unit}_${new Date().toISOString().slice(0, 10)}.xls`;
      await sendDocumentToTelegram(unit, excelBlob, filename, '', abortControllerRef.current.signal);

      setSendProgress({ current: tasks.length, total: tasks.length, unit, status: 'success' });
      setSendResults({ total: 1, success: 1, failed: 0 });
      alert(`✅ Detail screenshot & Excel sent to ${unit}!`);
    } catch (err) {
      if (err.name !== 'AbortError') alert(`❌ Screenshot send error: ${err.message}`);
    } finally {
      setIsSending(false);
      setShowUnitSelector(false);
    }
  };

  // 4. Send Detail Screenshot + Excel to All (matches Stockout_yet_Dashboard)
  const sendToAllScreenshot = async () => {
    if (isSending) return;
    const configured = getConfiguredUnits();
    if (configured.length === 0) {
      alert('⚠️ No group IDs configured.');
      return;
    }

    setIsSending(true);
    setShowProgressModal(true);
    abortControllerRef.current = new AbortController();

    let success = 0;
    let failed = 0;

    for (let i = 0; i < configured.length; i++) {
      const u = configured[i];
      if (abortControllerRef.current.signal.aborted) break;

      setSendProgress({ current: i + 1, total: configured.length, unit: u, status: 'sending' });
      try {
        const tasks = generateScreenshotTasks(u);
        setScreenshotUnit(u);

        for (let j = 0; j < tasks.length; j++) {
          if (abortControllerRef.current.signal.aborted) break;

          const task = tasks[j];
          setActiveM1Items(task.m1 || []);
          setActiveM2Items(task.m2 || []);
          setActiveM3Items(task.m3 || []);
          setScreenshotPartText(tasks.length > 1 ? `(${task.label})` : "");
          setScreenshotTitle(task.title);

          await new Promise(r => setTimeout(r, 400));
          const element = document.getElementById('telegram-screenshot-report');
          if (element) {
            const offsetWidth = Math.max(element.scrollWidth || 0, element.offsetWidth || 0, 1150);
            const offsetHeight = element.offsetHeight || 500;
            let scale = 3.0;
            if (offsetHeight > 1800) scale = 2.0;
            else if (offsetHeight > 1200) scale = 2.5;

            const canvas = await html2canvas(element, {
              useCORS: true,
              scale: scale,
              backgroundColor: '#f8fafc',
              width: offsetWidth,
              height: offsetHeight,
              scrollX: 0,
              scrollY: 0,
              windowWidth: Math.max(document.documentElement.offsetWidth, offsetWidth + 100),
              windowHeight: document.documentElement.offsetHeight,
              logging: false,
              onclone: (clonedDoc) => {
                const clonedEl = clonedDoc.getElementById('telegram-screenshot-report');
                if (clonedEl) {
                  clonedEl.style.position = 'static';
                  clonedEl.style.width = 'max-content';
                  clonedEl.style.overflow = 'visible';
                }
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

            const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
            if (blob) {
              await sendPhotoToTelegram(u, blob, '', abortControllerRef.current.signal);
            }
          }
          await new Promise(r => setTimeout(r, 350));
        }

        // Send Excel file
        const m1Items = gisM1.filter(item => item.unit === u && !item.isConfirmed);
        const m2Items = gisM2.filter(item => item.unit === u && !item.isConfirmed);
        const m3Items = gisM3.filter(item => item.unit === u && !item.isConfirmed);
        const excelBlob = generateMetfoneExcelBlob(m1Items, m2Items, m3Items, u);
        const filename = `METFONE_NET_${u}_${new Date().toISOString().slice(0, 10)}.xls`;
        await sendDocumentToTelegram(u, excelBlob, filename, '', abortControllerRef.current.signal);

        success++;
      } catch (e) {
        console.error(`Error sending detail to ${u}:`, e);
        failed++;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    setIsSending(false);
    setSendResults({ total: configured.length, success, failed });
  };

  // 5. Send Summary Image to Single Unit
  const sendSummaryImageScreenshot = async (unit) => {
    if (isSending) return;
    if (!hasGroupId(unit)) {
      alert(`⚠️ No group ID configured for ${unit}.`);
      return;
    }

    setIsSending(true);
    setShowProgressModal(true);
    setSendProgress({ current: 1, total: 1, unit, status: 'sending' });
    setSendResults(null);

    abortControllerRef.current = new AbortController();

    try {
      setSelectedUnit(unit);
      setInternalSummaryImageMode(true);
      await new Promise(r => setTimeout(r, 400));

      const el = document.getElementById('telegram-summary-report');
      if (!el) throw new Error('Report element not found');

      const canvas = await html2canvas(el, { 
        scale: 3.0, 
        useCORS: true, 
        backgroundColor: '#f8fafc',
        onclone: (clonedDoc) => {
          const clonedEl = clonedDoc.getElementById('telegram-summary-report');
          if (clonedEl) {
            clonedEl.style.position = 'static';
            clonedEl.style.width = '1450px';
          }
        }
      });
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Failed to generate report screenshot');

      const photoRes = await sendPhotoToTelegram(unit, blob, `📊 របាយការណ៍ METFONE NET (${unit})`, abortControllerRef.current.signal);
      if (photoRes && photoRes.success) {
        setSendProgress({ current: 1, total: 1, unit, status: 'success' });
        setSendResults({ total: 1, success: 1, failed: 0 });
        alert(`✅ Summary image sent to ${unit}!`);
      } else {
        throw new Error(photoRes?.error || 'Failed sending photo');
      }
    } catch (err) {
      if (err.name !== 'AbortError') alert(`❌ Screenshot send error: ${err.message}`);
    } finally {
      setIsSending(false);
      setShowUnitSelector(false);
      setInternalSummaryImageMode(false);
    }
  };

  // 6. Send Summary Image to All Units
  const sendSummaryImageScreenshotAll = async () => {
    if (isSending) return;
    const configured = getConfiguredUnits();
    if (configured.length === 0) {
      alert('⚠️ No group IDs configured.');
      return;
    }

    setIsSending(true);
    setShowProgressModal(true);
    abortControllerRef.current = new AbortController();

    let success = 0;
    let failed = 0;

    for (let i = 0; i < configured.length; i++) {
      const u = configured[i];
      if (abortControllerRef.current.signal.aborted) break;

      setSendProgress({ current: i + 1, total: configured.length, unit: u, status: 'sending' });
      try {
        setSelectedUnit(u);
        setInternalSummaryImageMode(true);
        await new Promise(r => setTimeout(r, 400));
        const el = document.getElementById('telegram-summary-report');
        if (el) {
          const canvas = await html2canvas(el, { 
            scale: 2.5, 
            useCORS: true, 
            backgroundColor: '#f8fafc',
            onclone: (clonedDoc) => {
              const clonedEl = clonedDoc.getElementById('telegram-summary-report');
              if (clonedEl) {
                clonedEl.style.position = 'static';
                clonedEl.style.width = '1450px';
              }
            }
          });
          const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
          if (blob) {
            await sendPhotoToTelegram(u, blob, `📊 របាយការណ៍ METFONE NET (${u})`, abortControllerRef.current.signal);
          }
        }
        success++;
      } catch (e) {
        failed++;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    setIsSending(false);
    setInternalSummaryImageMode(false);
    setSendResults({ total: configured.length, success, failed });
  };

  const configuredUnitsList = getConfiguredUnits();
  const configuredCount = configuredUnitsList.length;
  const totalUnits = allUnits.length;

  return (
    <div className="w-full px-4 py-6 bg-gray-50 min-h-screen">
      {/* ─── HEADER ─── */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-800 to-sky-900 rounded-2xl px-6 py-6 mb-6 shadow-lg shadow-indigo-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <span>🌐</span> របាយការណ៍សង្ខេបអំពីប្រតិបត្តិការ METFONE NET (Overview KPI)
              </h1>
              <span className="bg-white/20 text-white text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider border border-white/30 backdrop-blur-sm">
                🟢 Live • {currentTime.toLocaleTimeString()}
              </span>
            </div>
            <p className="text-blue-100 mt-1 text-sm font-medium">
              04 SYSTEM METFONE NET - SUMMARY &amp; PERFORMANCE MONITORING (GIS ONLY)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="bg-emerald-500/25 border border-emerald-400/40 text-white px-3.5 py-2 rounded-xl text-xs backdrop-blur-sm shadow-xs flex items-center gap-2.5">
              <span className="text-base">🕒</span>
              <div>
                <span className="text-[10px] text-emerald-200 font-bold uppercase tracking-wider block leading-tight">
                  ពេលបញ្ចូលទិន្នន័យ (Backend):
                </span>
                <span className="font-black text-white text-xs">
                  {formatBackendTime(backendSyncTime)}
                </span>
              </div>
            </div>
            <span className="bg-white/20 text-white px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-sm border border-white/20">
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
            {/* 0. Button: Import to Backend */}
            <button
              type="button"
              onClick={() => {
                setShowImportModal(true);
                setPasteData('');
                setImportStatus(null);
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-extrabold rounded-xl shadow-md transition-all duration-200 flex items-center gap-2 cursor-pointer text-sm"
            >
              <span className="text-base">📥</span>
              <span>បញ្ចូលទិន្នន័យ (Import to Backend)</span>
            </button>

            {/* 1. Batch Actions Dropdown (Send All) */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => {
                  setOpenBatchDropdown(!openBatchDropdown);
                  setOpenSingleDropdown(false);
                }}
                disabled={isSending || configuredCount === 0}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 text-white font-extrabold rounded-xl shadow-md transition-all duration-200 flex items-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
              >
                <span>🚀</span>
                <span>Send All ({configuredCount})</span>
                <span className={`transition-transform duration-200 text-[10px] ml-1 ${openBatchDropdown ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {openBatchDropdown && (
                <div className="origin-top-right absolute right-0 mt-2 w-72 rounded-2xl shadow-2xl bg-white ring-1 ring-black/5 divide-y divide-slate-100 z-50 animate-fadeIn p-2 border border-slate-100">
                  <div className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    🌐 Batch Operations ({configuredCount} Provinces)
                  </div>
                  <div className="py-1 space-y-1">
                    <button
                      onClick={() => {
                        setOpenBatchDropdown(false);
                        setScreenshotMode(false);
                        setIsSelectingForSummary(false);
                        sendToAll();
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-start gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="text-base mt-0.5">📤</span>
                      <div>
                        <div className="font-black text-slate-800">Send Text Receipts All ({configuredCount})</div>
                        <div className="text-[10px] text-slate-400 font-medium">Send text receipts to all 25 units</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setOpenBatchDropdown(false);
                        setScreenshotMode(true);
                        setIsSelectingForSummary(false);
                        sendToAllScreenshot();
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-start gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="text-base mt-0.5">📸</span>
                      <div>
                        <div className="font-black text-slate-800">Send Detail ({configuredCount})</div>
                        <div className="text-[10px] text-slate-400 font-medium">Send Detail Screenshot + Excel file</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setOpenBatchDropdown(false);
                        setIsSelectingForSummary(true);
                        sendSummaryImageScreenshotAll();
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700 flex items-start gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="text-base mt-0.5">🖼️</span>
                      <div>
                        <div className="font-black text-slate-800">Summary Image all Unit ({configuredCount})</div>
                        <div className="text-[10px] text-slate-400 font-medium">Send Excel Matrix Table Screenshot</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Single Unit Actions Dropdown (Send 1) */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => {
                  setOpenSingleDropdown(!openSingleDropdown);
                  setOpenBatchDropdown(false);
                }}
                disabled={isSending}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-extrabold rounded-xl shadow-md transition-all duration-200 flex items-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
              >
                <span>🎯</span>
                <span>Send Single Branch (1)</span>
                <span className={`transition-transform duration-200 text-[10px] ml-1 ${openSingleDropdown ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {openSingleDropdown && (
                <div className="origin-top-right absolute right-0 mt-2 w-72 rounded-2xl shadow-2xl bg-white ring-1 ring-black/5 divide-y divide-slate-100 z-50 animate-fadeIn p-2 border border-slate-100">
                  <div className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    📍 Single Unit Operations (1 Province)
                  </div>
                  <div className="py-1 space-y-1">
                    <button
                      onClick={() => {
                        setOpenSingleDropdown(false);
                        setScreenshotMode(false);
                        setIsSelectingForSummary(false);
                        setShowUnitSelector(true);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-start gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="text-base mt-0.5">📤</span>
                      <div>
                        <div className="font-black text-slate-800">Send Text Receipts (1)</div>
                        <div className="text-[10px] text-slate-400 font-medium">Select 1 province to send text</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setOpenSingleDropdown(false);
                        setScreenshotMode(true);
                        setIsSelectingForSummary(false);
                        setShowUnitSelector(true);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-start gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="text-base mt-0.5">📸</span>
                      <div>
                        <div className="font-black text-slate-800">Send Detail (1)</div>
                        <div className="text-[10px] text-slate-400 font-medium">Select 1 province to send Detail + Excel</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setOpenSingleDropdown(false);
                        setIsSelectingForSummary(true);
                        setScreenshotMode(false);
                        setShowUnitSelector(true);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700 flex items-start gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="text-base mt-0.5">🖼️</span>
                      <div>
                        <div className="font-black text-slate-800">Summary Image (1)</div>
                        <div className="text-[10px] text-slate-400 font-medium">Select 1 province to send Summary Image</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Custom Note Input */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <span>✍️</span> Note/Comment to append to Telegram reports (Optional)
            </label>
            {customNote.trim() && Array.isArray(savedNotes) && !savedNotes.some(n => n.content === customNote.trim()) && (
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
            placeholder="Type a custom note here (e.g. 'Please confirm all Metfone Net items before 5:00 PM!'). It will be appended to the Telegram report."
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
            rows={2}
          />
          
          {Array.isArray(savedNotes) && savedNotes.length > 0 && (
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

        {/* Unit Selector Grid */}
        {showUnitSelector && (
          <div className="p-5 bg-gray-50 rounded-xl border border-gray-200 mt-4 animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <span>📍</span> Select Province/Unit to send report:
              </h3>
              <button onClick={() => setShowUnitSelector(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
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
          <div className="text-[10px] opacity-80 uppercase tracking-wider font-semibold">Target ព្រឹក</div>
          <div className="text-2xl font-bold mt-1">{totals.targetMorning}</div>
        </div>
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-4 text-white shadow-lg shadow-indigo-200">
          <div className="text-[10px] opacity-80 uppercase tracking-wider font-semibold">Target ល្ងាច</div>
          <div className="text-2xl font-bold mt-1">{totals.targetEvening}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white shadow-lg shadow-amber-200">
          <div className="text-[10px] opacity-80 uppercase tracking-wider font-semibold">Remain</div>
          <div className="text-2xl font-bold mt-1">{totals.remain}</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white shadow-lg shadow-emerald-200">
          <div className="text-[10px] opacity-80 uppercase tracking-wider font-semibold">Result</div>
          <div className="text-2xl font-bold mt-1">{totals.result}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg shadow-purple-200">
          <div className="text-[10px] opacity-80 uppercase tracking-wider font-semibold">Ratio</div>
          <div className="text-2xl font-bold mt-1">{totals.ratio}%</div>
        </div>
        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-2xl p-4 text-white shadow-lg shadow-cyan-200">
          <div className="text-[10px] opacity-80 uppercase tracking-wider font-semibold">In System</div>
          <div className="text-2xl font-bold mt-1">{totals.inSystem}</div>
        </div>
      </div>

      {/* ─── PROGRESS BAR ─── */}
      <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-gray-700">Overall Progress (Metfone Net)</span>
          <span className="text-sm font-bold text-indigo-600">{totals.ratio}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3.5 overflow-hidden p-0.5">
          <div 
            className="bg-gradient-to-r from-teal-400 via-indigo-500 to-blue-600 h-2.5 rounded-full transition-all duration-1000"
            style={{ width: `${Math.min(100, parseFloat(totals.ratio))}%` }}
          ></div>
        </div>
      </div>

      {/* ─── KPI PERFORMANCE TABLE ─── */}
      <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 mb-6 overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span>📋</span> Performance by Module
          </h3>
          <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-semibold border border-indigo-200">
            3 Sub-modules
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-xs uppercase tracking-wider">
                <th className="py-3 px-4 text-left font-bold">Module Name</th>
                <th className="py-3 px-4 text-center font-bold">Target ព្រឹក</th>
                <th className="py-3 px-4 text-center font-bold">Target ល្ងាច</th>
                <th className="py-3 px-4 text-center font-bold">Remain</th>
                <th className="py-3 px-4 text-center font-bold">Result</th>
                <th className="py-3 px-4 text-center font-bold">Ratio %</th>
                <th className="py-3 px-4 text-center font-bold">In System</th>
                <th className="py-3 px-4 text-center font-bold">Alarms (≥5d)</th>
                <th className="py-3 px-4 text-center font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[m1Stats, m2Stats, m3Stats].map((mod, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    {mod.name}
                  </td>
                  <td className="py-3.5 px-4 text-center text-slate-600 font-semibold">{mod.mTarget}</td>
                  <td className="py-3.5 px-4 text-center text-slate-600 font-semibold">{mod.eTarget}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${mod.pending > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {mod.pending}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-600">{mod.completed}</td>
                  <td className="py-3.5 px-4 text-center font-bold text-indigo-600">{mod.ratio}%</td>
                  <td className="py-3.5 px-4 text-center font-bold text-slate-700">{mod.total}</td>
                  <td className="py-3.5 px-4 text-center">
                    {mod.alarm > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-700 border border-rose-200 animate-pulse">
                        ⚠️ {mod.alarm}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => onNavigate && onNavigate(mod.key)}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                    >
                      Open Module ➜
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── QUICK ACCESS CARDS ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <div 
          onClick={() => onNavigate && onNavigate('METFONE_STOCKOUT_YET_CONFIRM')}
          className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-indigo-400 hover:shadow-xl transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start mb-3">
            <span className="text-3xl p-2.5 bg-blue-50 rounded-xl group-hover:scale-110 transition-transform">📦</span>
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 font-black rounded-lg text-xs border border-amber-200">
              {m1Stats.pending} Pending
            </span>
          </div>
          <h4 className="font-extrabold text-slate-800 text-base mb-1 group-hover:text-indigo-600 transition-colors">
            01_STOCKOUT_YET CONFIRM
          </h4>
          <p className="text-xs text-slate-500 mb-4">
            Stockout notes from Metfone Net awaiting GIS confirmation.
          </p>
          <div className="flex justify-between items-center pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-400">Total: <strong className="text-slate-700">{m1Stats.total}</strong></span>
            <span className="font-bold text-indigo-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
              Go to Module ➜
            </span>
          </div>
        </div>

        <div 
          onClick={() => onNavigate && onNavigate('METFONE_NOT_CREATE_HAND_OVER')}
          className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-indigo-400 hover:shadow-xl transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start mb-3">
            <span className="text-3xl p-2.5 bg-indigo-50 rounded-xl group-hover:scale-110 transition-transform">📋</span>
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 font-black rounded-lg text-xs border border-amber-200">
              {m2Stats.pending} Pending
            </span>
          </div>
          <h4 className="font-extrabold text-slate-800 text-base mb-1 group-hover:text-indigo-600 transition-colors">
            02_NOT CREATE HAND OVER
          </h4>
          <p className="text-xs text-slate-500 mb-4">
            Stock-out notes awaiting handover creation by GIS recipient teams.
          </p>
          <div className="flex justify-between items-center pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-400">Total: <strong className="text-slate-700">{m2Stats.total}</strong></span>
            <span className="font-bold text-indigo-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
              Go to Module ➜
            </span>
          </div>
        </div>

        <div 
          onClick={() => onNavigate && onNavigate('METFONE_HAND_OVER_YET_CONFIRM')}
          className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-indigo-400 hover:shadow-xl transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start mb-3">
            <span className="text-3xl p-2.5 bg-purple-50 rounded-xl group-hover:scale-110 transition-transform">🤝</span>
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 font-black rounded-lg text-xs border border-amber-200">
              {m3Stats.pending} Pending
            </span>
          </div>
          <h4 className="font-extrabold text-slate-800 text-base mb-1 group-hover:text-indigo-600 transition-colors">
            03_HAND OVER_YET CONFIRM
          </h4>
          <p className="text-xs text-slate-500 mb-4">
            Handover minutes waiting for GIS unit confirmation.
          </p>
          <div className="flex justify-between items-center pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-400">Total: <strong className="text-slate-700">{m3Stats.total}</strong></span>
            <span className="font-bold text-indigo-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
              Go to Module ➜
            </span>
          </div>
        </div>
      </div>

      {/* ─── PROGRESS MODAL ─── */}
      {showProgressModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-scaleUp">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
              <span>🚀</span> Sending Metfone Reports
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Sending Telegram report for {sendProgress.unit || 'provinces'}...
            </p>

            <div className="w-full bg-slate-100 rounded-full h-3 mb-4 overflow-hidden">
              <div 
                className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
                style={{ width: `${(sendProgress.current / Math.max(1, sendProgress.total)) * 100}%` }}
              ></div>
            </div>

            <div className="flex justify-between text-xs text-slate-500 mb-6">
              <span>Unit: <strong>{sendProgress.unit || '-'}</strong></span>
              <span>{sendProgress.current} / {sendProgress.total}</span>
            </div>

            {sendResults && (
              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 mb-4 space-y-1">
                <div>✅ Successful: <strong>{sendResults.success}</strong></div>
                <div>❌ Failed: <strong>{sendResults.failed}</strong></div>
                <div>📊 Total: <strong>{sendResults.total}</strong></div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {isSending ? (
                <button
                  onClick={handleCancelSend}
                  className="px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel Send
                </button>
              ) : (
                <button
                  onClick={() => setShowProgressModal(false)}
                  className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── HIDDEN TELEGRAM SUMMARY REPORT (For html2canvas capture) ─── */}
      {(() => {
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

        const totalUnder = rows.reduce((sum, r) => sum + r.underKpi, 0);
        const totalOver = rows.reduce((sum, r) => sum + r.overKpi, 0);
        const totalAll = totalUnder + totalOver;
        
        const formatVal = (val) => val === 0 ? '-' : val;
        const currentBranch = screenshotUnit && screenshotUnit !== 'ALL' ? screenshotUnit : selectedUnit;

        return (
          <div 
            id="telegram-summary-report" 
            data-summary-mode={summaryImageMode ? "true" : "false"}
            style={{
              position: 'fixed',
              left: '-9999px',
              top: '-9999px',
              zIndex: -9999,
              pointerEvents: 'none',
              width: '1450px',
              background: '#f8fafc',
              padding: '24px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
            }}
          >
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm mb-4 flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600"></div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">📊</span>
                  <h1 className="text-base font-black text-slate-800 tracking-tight uppercase">
                    METFONE NET KPI Summary Report
                  </h1>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600 font-bold uppercase">
                  <span>Branch:</span>
                  <span className="bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-md border border-blue-100 font-black tracking-wider text-[10px]">
                    {currentBranch}
                  </span>
                </div>
              </div>
              <div className="text-right text-[10px] font-semibold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                <div>Date: <strong className="text-slate-900">{new Date().toLocaleDateString('en-GB')}</strong></div>
                <div className="mt-0.5">Time: <strong className="text-slate-900">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</strong></div>
                <div className="mt-0.5 text-blue-700 font-extrabold">Backend: <strong>{formatBackendTime(backendSyncTime)}</strong></div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 flex items-center gap-3">
                <span className="text-base">👥</span>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block leading-none">Active Teams</span>
                  <span className="text-sm font-black text-slate-800 mt-1 block leading-none">{rows.length}</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 flex items-center gap-3">
                <span className="text-base">✅</span>
                <div>
                  <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider block leading-none">Under KPI (On-Time)</span>
                  <span className="text-sm font-black text-emerald-600 mt-1 block leading-none">{totalUnder}</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 flex items-center gap-3">
                <span className="text-base">🚨</span>
                <div>
                  <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider block leading-none">Over KPI (Delayed)</span>
                  <span className="text-sm font-black text-red-600 mt-1 block leading-none">{totalOver}</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
              <table className="min-w-full text-center border-collapse table-fixed text-[10px] font-bold text-slate-700">
                <thead>
                  <tr className="text-white text-[10px] border-b border-slate-200">
                    <th rowSpan="3" className="bg-slate-700 border-r border-slate-600 w-[45px] py-2 font-bold uppercase tracking-wider">No</th>
                    <th rowSpan="3" className="bg-slate-700 border-r border-slate-600 w-[75px] py-2 font-bold uppercase tracking-wider">Code</th>
                    <th rowSpan="3" className="bg-slate-700 border-r border-slate-600 w-[240px] py-2 text-left px-4 font-bold uppercase tracking-wider">Units name</th>
                    
                    <th colSpan="3" className="bg-blue-600 border-r border-blue-700 py-2 font-bold uppercase tracking-wider">
                      TEAM STEP 1<br/>
                      <span className="text-[9px] font-normal text-white/80">Stock out not Confirm goods</span>
                    </th>
                    <th colSpan="3" className="bg-amber-600 border-r border-amber-700 py-2 font-bold uppercase tracking-wider">
                      ASSET STEP :2<br/>
                      <span className="text-[9px] font-normal text-white/80">Stock out not create hand over</span>
                    </th>
                    <th colSpan="3" className="bg-purple-600 border-r border-purple-700 py-2 font-bold uppercase tracking-wider">
                      TEAM STEP 3<br/>
                      <span className="text-[9px] font-normal text-white/80">Hand over not Confirmed</span>
                    </th>
                    <th colSpan="3" className="bg-indigo-900 py-2 font-bold uppercase tracking-wider">
                      Total Summary
                    </th>
                  </tr>
                  <tr className="text-white text-[10px] border-b border-slate-200">
                    <th colSpan="3" className="bg-blue-700 border-r border-blue-800 py-1.5 font-black text-blue-200">KPI = 4 DAYS</th>
                    <th colSpan="3" className="bg-amber-700 border-r border-amber-800 py-1.5 font-black text-amber-200">KPI = 3 DAYS</th>
                    <th colSpan="3" className="bg-purple-700 border-r border-purple-800 py-1.5 font-black text-purple-200">KPI = 3 DAYS</th>
                    <th colSpan="3" className="bg-indigo-950 py-1.5 font-black text-indigo-200">KPI TARGETS</th>
                  </tr>
                  <tr className="bg-slate-100 text-slate-600 text-[9px] border-b border-slate-200 font-bold">
                    <th className="border-r border-blue-100 py-2 text-blue-700 bg-blue-50/30">Day &lt;= 4</th>
                    <th className="border-r border-blue-100 py-2 text-red-600 bg-blue-50/30">Day &gt; 4</th>
                    <th className="border-r border-blue-200 py-2 bg-blue-100/50 text-blue-900">Total</th>

                    <th className="border-r border-amber-100 py-2 text-amber-700 bg-amber-50/30">Day &lt;= 3</th>
                    <th className="border-r border-amber-100 py-2 text-red-600 bg-amber-50/30">Day &gt; 3</th>
                    <th className="border-r border-amber-200 py-2 bg-amber-100/50 text-amber-900">Total</th>

                    <th className="border-r border-purple-100 py-2 text-purple-700 bg-purple-50/30">Day &lt;= 3</th>
                    <th className="border-r border-purple-100 py-2 text-red-600 bg-purple-50/30">Day &gt; 3</th>
                    <th className="border-r border-purple-200 py-2 bg-purple-100/50 text-purple-900">Total</th>

                    <th className="border-r border-indigo-100 py-2 text-indigo-700 bg-indigo-50/30">Under KPI</th>
                    <th className="border-r border-indigo-100 py-2 text-red-600 bg-indigo-50/30">Over KPI</th>
                    <th className="py-2 bg-indigo-100/50 text-indigo-950 font-black">Overall Total</th>
                  </tr>
                  
                  <tr className="bg-slate-50 text-slate-800 font-black text-[11px] border-b border-slate-300 shadow-inner">
                    <td colSpan="3" className="border-r border-slate-300 text-center py-2.5 uppercase tracking-wider text-slate-950">TEAM</td>
                    <td className="border-r border-blue-100 py-2.5 text-blue-800 bg-blue-50/20">{formatVal(totalS1Under)}</td>
                    <td className={`border-r border-blue-200 py-2.5 bg-blue-50/20 ${totalS1Over > 0 ? 'bg-red-100 text-red-700 font-black' : ''}`}>{formatVal(totalS1Over)}</td>
                    <td className="border-r border-slate-200 py-2.5 bg-blue-100/30 text-blue-900 font-black">{formatVal(totalS1Total)}</td>
                    
                    <td className="border-r border-amber-100 py-2.5 text-amber-800 bg-amber-50/20">{formatVal(totalS2Under)}</td>
                    <td className={`border-r border-amber-200 py-2.5 bg-amber-50/20 ${totalS2Over > 0 ? 'bg-red-100 text-red-700 font-black' : ''}`}>{formatVal(totalS2Over)}</td>
                    <td className="border-r border-slate-200 py-2.5 bg-amber-100/30 text-amber-900 font-black">{formatVal(totalS2Total)}</td>
                    
                    <td className="border-r border-purple-100 py-2.5 text-purple-800 bg-purple-50/20">{formatVal(totalS3Under)}</td>
                    <td className={`border-r border-purple-200 py-2.5 bg-purple-50/20 ${totalS3Over > 0 ? 'bg-red-100 text-red-700 font-black' : ''}`}>{formatVal(totalS3Over)}</td>
                    <td className="border-r border-slate-200 py-2.5 bg-purple-100/30 text-purple-900 font-black">{formatVal(totalS3Total)}</td>

                    <td className="border-r border-indigo-100 py-2.5 bg-indigo-50/20 text-indigo-800 font-bold">{formatVal(totalUnder)}</td>
                    <td className={`border-r border-indigo-200 py-2.5 bg-indigo-50/20 ${totalOver > 0 ? 'bg-red-100 text-red-700 font-black' : ''}`}>{formatVal(totalOver)}</td>
                    <td className="py-2.5 bg-indigo-200 text-indigo-950 font-black text-xs">{formatVal(totalAll)}</td>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 bg-white">
                  {rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors odd:bg-white even:bg-slate-50/20 text-slate-700">
                      <td className="border-r border-slate-200 py-2 font-bold text-slate-400">{idx + 1}</td>
                      <td className="border-r border-slate-200 py-2 font-bold text-slate-800">{row.unit}</td>
                      <td className="border-r border-slate-200 py-2 text-left px-4 font-semibold text-slate-900 break-all">{row.team}</td>
                      
                      {/* Sheet 01 */}
                      <td className="border-r border-slate-150 py-2 text-slate-600 bg-blue-50/5 font-medium">{formatVal(row.s1Under)}</td>
                      <td className={`border-r border-slate-150 py-2 bg-blue-50/5 ${row.s1Over > 0 ? 'bg-red-100 text-red-700 font-black' : ''}`}>
                        {formatVal(row.s1Over)}
                      </td>
                      <td className="border-r border-slate-150 py-2 bg-blue-100/10 text-blue-900 font-bold">{formatVal(row.s1Total)}</td>
                      
                      {/* Sheet 02 */}
                      <td className="border-r border-slate-150 py-2 text-slate-600 bg-amber-50/5 font-medium">{formatVal(row.s2Under)}</td>
                      <td className={`border-r border-slate-150 py-2 bg-amber-50/5 ${row.s2Over > 0 ? 'bg-red-100 text-red-700 font-black' : ''}`}>
                        {formatVal(row.s2Over)}
                      </td>
                      <td className="border-r border-slate-150 py-2 bg-amber-100/10 text-amber-900 font-bold">{formatVal(row.s2Total)}</td>
                      
                      {/* Sheet 03 */}
                      <td className="border-r border-slate-150 py-2 text-slate-600 bg-purple-50/5 font-medium">{formatVal(row.s3Under)}</td>
                      <td className={`border-r border-slate-150 py-2 bg-purple-50/5 ${row.s3Over > 0 ? 'bg-red-100 text-red-700 font-black' : ''}`}>
                        {formatVal(row.s3Over)}
                      </td>
                      <td className="border-r border-slate-150 py-2 bg-purple-100/10 text-purple-900 font-bold">{formatVal(row.s3Total)}</td>

                      {/* Total summary */}
                      <td className="border-r border-slate-200 py-2 bg-indigo-50/5 text-slate-600 font-medium">{formatVal(row.underKpi)}</td>
                      <td className={`border-r border-slate-200 py-2 bg-indigo-50/5 ${row.overKpi > 0 ? 'bg-red-100 text-red-700 font-black' : ''}`}>
                        {formatVal(row.overKpi)}
                      </td>
                      <td className="py-2 bg-indigo-100/10 text-indigo-950 font-black">{formatVal(row.total)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan="15" className="py-12 text-center text-slate-400 font-medium bg-slate-50/50 text-xs">
                        🎉 Outstanding completion! No pending items found under this branch.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-amber-100 text-slate-900 font-black border-t-2 border-slate-300">
                    <td colSpan="3" className="py-2.5 px-4 text-center border-r border-amber-200 uppercase tracking-wider text-[11px]">
                      TOTAL
                    </td>
                    <td className="py-2.5 border-r border-amber-200 text-slate-800">{formatVal(totalS1Under)}</td>
                    <td className={`py-2.5 border-r border-amber-200 ${totalS1Over > 0 ? 'text-red-600' : 'text-slate-600'}`}>{formatVal(totalS1Over)}</td>
                    <td className="py-2.5 border-r border-amber-300 bg-amber-200/60 text-blue-950 font-black">{formatVal(totalS1Total)}</td>

                    <td className="py-2.5 border-r border-amber-200 text-slate-800">{formatVal(totalS2Under)}</td>
                    <td className={`py-2.5 border-r border-amber-200 ${totalS2Over > 0 ? 'text-red-600' : 'text-slate-600'}`}>{formatVal(totalS2Over)}</td>
                    <td className="py-2.5 border-r border-amber-300 bg-amber-200/60 text-amber-950 font-black">{formatVal(totalS2Total)}</td>

                    <td className="py-2.5 border-r border-amber-200 text-slate-800">{formatVal(totalS3Under)}</td>
                    <td className={`py-2.5 border-r border-amber-200 ${totalS3Over > 0 ? 'text-red-600' : 'text-slate-600'}`}>{formatVal(totalS3Over)}</td>
                    <td className="py-2.5 border-r border-amber-300 bg-amber-200/60 text-purple-950 font-black">{formatVal(totalS3Total)}</td>

                    <td className="py-2.5 border-r border-amber-200 text-emerald-800 font-black">{formatVal(totalUnder)}</td>
                    <td className={`py-2.5 border-r border-amber-200 font-black ${totalOver > 0 ? 'text-red-600' : 'text-slate-600'}`}>{formatVal(totalOver)}</td>
                    <td className="py-2.5 bg-amber-300 text-indigo-950 font-black text-xs">{formatVal(totalAll)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {customNote && customNote.trim() && (
              <div className="mt-4 p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 shadow-sm">
                <span className="font-bold text-indigo-600">📝 Note: </span>
                {customNote}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── HIDDEN TELEGRAM DETAIL SCREENSHOT REPORT (For html2canvas capture) ─── */}
      <div 
        id="telegram-screenshot-report" 
        style={{ 
          position: 'fixed', 
          left: '-9999px', 
          top: '-9999px', 
          zIndex: -9999,
          pointerEvents: 'none',
          width: 'max-content',
          minWidth: '1150px', 
          minHeight: '500px',
          background: '#f8fafc', 
          padding: '24px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}
      >
        {/* Banner Header */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm mb-5 flex justify-between items-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600"></div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📡</span>
              <h1 className="text-base font-black text-slate-800 tracking-tight uppercase">
                METFONE NET REPORT {screenshotTitle ? `- ${screenshotTitle}` : ''} {screenshotPartText}
              </h1>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-600 font-bold uppercase">
              <span>Branch:</span>
              <span className="bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-md border border-blue-100 font-black tracking-wider text-[10px]">
                {activeScreenshotUnit}
              </span>
            </div>
          </div>
          <div className="text-right text-[10px] font-semibold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            <div>Date: <strong className="text-slate-900">{new Date().toLocaleDateString('en-GB')}</strong></div>
            <div className="mt-0.5">Time: <strong className="text-slate-900">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</strong></div>
            <div className="mt-0.5 text-blue-700 font-extrabold">Backend: <strong>{formatBackendTime(backendSyncTime)}</strong></div>
          </div>
        </div>

        {/* Module 1 Table */}
        {activeM1Items.length > 0 && (
          <div className="bg-white border border-gray-200/60 rounded-3xl p-5 shadow-sm mb-5">
            <h3 className="text-sm font-black text-gray-800 flex items-center justify-between pb-3 border-b border-gray-100 mb-3.5">
              <span className="flex items-center gap-2 text-indigo-900 uppercase font-black tracking-tight text-base">
                📦 TEAM STEP 1 <span className="text-xs text-slate-500 font-bold capitalize">(Stock out not Confirm goods)</span>
              </span>
              <span className="text-blue-800 font-extrabold text-xs bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                📋 {activeM1Items.length} Items
              </span>
            </h3>
            <div className="border border-slate-200/80 rounded-xl shadow-xs bg-white">
              <table className="min-w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 text-white text-[10px] font-black border-b-2 border-indigo-900">
                    <th className="border-r border-indigo-600/50 px-2.5 py-2 text-center font-extrabold uppercase">#</th>
                    <th className="border-r border-indigo-600/50 px-2.5 py-2 font-black uppercase">Warehouse Stock out</th>
                    <th className="border-r border-indigo-600/50 px-2.5 py-2 font-black uppercase">Export No</th>
                    <th className="border-r border-indigo-600/50 px-2.5 py-2 text-center font-black uppercase">Date</th>
                    <th className="border-r border-indigo-600/50 px-2.5 py-2 font-black uppercase">Stock Receiver</th>
                    <th className="border-r border-indigo-600/50 px-2.5 py-2 font-black uppercase">Group Receiver</th>
                    <th className="border-r border-indigo-600/50 px-2.5 py-2 font-black uppercase">Construction</th>
                    <th className="border-r border-indigo-600/50 px-2.5 py-2 text-center font-black uppercase">Unit</th>
                    <th className="border-r border-indigo-600/50 px-2.5 py-2 text-center font-black uppercase">Days</th>
                    <th className="px-2.5 py-2 font-black uppercase">TEAM</th>
                  </tr>
                </thead>
                <tbody className="text-[9.5px] font-medium divide-y divide-slate-100">
                  {activeM1Items.map((item, index) => {
                    const isOverdue = (parseInt(item.daysDiff) || 0) > 4;
                    const teamName = item.team && item.team !== '-' ? item.team : (item.groupReceiver || item.stockReceiver || '-');
                    return (
                      <tr key={index} className={`transition-colors whitespace-nowrap ${isOverdue ? 'bg-red-50/90 text-red-950 font-semibold border-l-4 border-l-red-600' : 'hover:bg-slate-50/80 odd:bg-white even:bg-slate-50/40 text-slate-800'}`}>
                        <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold text-slate-500">{index + 1}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-800 font-mono whitespace-nowrap">{item.exportCode || '-'}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-black text-slate-900 tracking-tight font-mono whitespace-nowrap">{item.exportNo || item.code}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-700 font-mono text-center whitespace-nowrap">{item.realExport || item.date || '-'}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-800 whitespace-nowrap">{cleanWarehouseName(item.stockReceiver || '-')}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-800 whitespace-nowrap">{cleanWarehouseName(item.groupReceiver || '-')}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 text-slate-700 font-bold font-mono text-[9px] whitespace-nowrap">{item.constructionReceiver || '-'}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold">
                          <span className="bg-indigo-50 text-indigo-800 px-1 rounded border border-indigo-100 text-[8.5px] inline-block font-black">{item.unit || '-'}</span>
                        </td>
                        <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold">{getDelayBadge(item.daysDiff, 4)}</td>
                        <td className="px-2 py-1.5 font-black text-indigo-950 font-mono text-[9.5px] whitespace-nowrap">{teamName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Module 2 Table */}
        {activeM2Items.length > 0 && (
          <div className="bg-white border border-gray-200/60 rounded-3xl p-5 shadow-sm mb-5">
            <h3 className="text-sm font-black text-gray-800 flex items-center justify-between pb-3 border-b border-gray-100 mb-3.5">
              <span className="flex items-center gap-2 text-amber-900 uppercase font-black tracking-tight text-base">
                📝 ASSET STEP :2 <span className="text-xs text-slate-500 font-bold capitalize">(Stock out not create hand over)</span>
              </span>
              <span className="text-amber-800 font-extrabold text-xs bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                📋 {activeM2Items.length} Items
              </span>
            </h3>
            <div className="border border-slate-200/80 rounded-xl shadow-xs bg-white">
              <table className="min-w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-gradient-to-r from-amber-700 via-orange-700 to-slate-800 text-white text-[10px] font-black border-b-2 border-amber-900">
                    <th className="border-r border-amber-600/50 px-2.5 py-2 text-center font-extrabold uppercase">#</th>
                    <th className="border-r border-amber-600/50 px-2.5 py-2 font-black uppercase">Code of stock-out note</th>
                    <th className="border-r border-amber-600/50 px-2.5 py-2 font-black uppercase">Warehouse</th>
                    <th className="border-r border-amber-600/50 px-2.5 py-2 font-black uppercase">Recipient</th>
                    <th className="border-r border-amber-600/50 px-2.5 py-2 font-black uppercase">Creator</th>
                    <th className="border-r border-amber-600/50 px-2.5 py-2 text-center font-black uppercase">Creating date</th>
                    <th className="border-r border-amber-600/50 px-2.5 py-2 font-black uppercase">TEAM</th>
                    <th className="border-r border-amber-600/50 px-2.5 py-2 text-center font-black uppercase">Unit</th>
                    <th className="border-r border-amber-600/50 px-2.5 py-2 text-center font-black uppercase">Days</th>
                    <th className="px-2.5 py-2 text-center font-black uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="text-[9.5px] font-medium divide-y divide-slate-100">
                  {activeM2Items.map((item, index) => {
                    const isOverdue = (parseInt(item.daysDiff) || 0) > 3;
                    const teamName = item.team && item.team !== '-' ? item.team : (item.recipient || '-');
                    return (
                      <tr key={index} className={`transition-colors whitespace-nowrap ${isOverdue ? 'bg-red-50/90 text-red-950 font-semibold border-l-4 border-l-red-600' : 'hover:bg-slate-50/80 odd:bg-white even:bg-slate-50/40 text-slate-800'}`}>
                        <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold text-slate-500">{index + 1}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-black text-slate-900 tracking-tight font-mono whitespace-nowrap">{item.codeStockOut || item.code}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-800 whitespace-nowrap">{cleanWarehouseName(item.warehouse || '-')}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-800 whitespace-nowrap">{cleanWarehouseName(item.recipient || '-')}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-700 whitespace-nowrap">{item.creator || '-'}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-700 font-mono text-center whitespace-nowrap">{item.creatingDate || item.date || '-'}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-black text-indigo-950 font-mono text-[9.5px] whitespace-nowrap">{teamName}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold">
                          <span className="bg-indigo-50 text-indigo-800 px-1 rounded border border-indigo-100 text-[8.5px] inline-block font-black">{item.unit || '-'}</span>
                        </td>
                        <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold">{getDelayBadge(item.daysDiff, 3)}</td>
                        <td className="px-2 py-1.5 text-center whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-extrabold ${item.isConfirmed ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>{item.status || 'Pending'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Module 3 Table */}
        {activeM3Items.length > 0 && (
          <div className="bg-white border border-gray-200/60 rounded-3xl p-5 shadow-sm">
            <h3 className="text-sm font-black text-gray-800 flex items-center justify-between pb-3 border-b border-gray-100 mb-3.5">
              <span className="flex items-center gap-2 text-purple-900 uppercase font-black tracking-tight text-base">
                ⚠️ TEAM STEP 3 <span className="text-xs text-slate-500 font-bold capitalize">(Hand over not Confirmed)</span>
              </span>
              <span className="text-purple-800 font-extrabold text-xs bg-purple-50 px-3 py-1 rounded-full border border-purple-100">
                📋 {activeM3Items.length} Items
              </span>
            </h3>
            <div className="border border-slate-200/80 rounded-xl shadow-xs bg-white">
              <table className="min-w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-gradient-to-r from-purple-800 via-rose-800 to-slate-900 text-white text-[10px] font-black border-b-2 border-purple-950">
                    <th className="border-r border-purple-600/50 px-2.5 py-2 text-center font-extrabold uppercase">#</th>
                    <th className="border-r border-purple-600/50 px-2.5 py-2 font-black uppercase">Code of handover minutes</th>
                    <th className="border-r border-purple-600/50 px-2.5 py-2 font-black uppercase">Type of handover</th>
                    <th className="border-r border-purple-600/50 px-2.5 py-2 font-black uppercase">Handover unit</th>
                    <th className="border-r border-purple-600/50 px-2.5 py-2 font-black uppercase">Unit confirm handover</th>
                    <th className="border-r border-purple-600/50 px-2.5 py-2 text-center font-black uppercase">Handover date</th>
                    <th className="border-r border-purple-600/50 px-2.5 py-2 text-center font-black uppercase">Status</th>
                    <th className="border-r border-purple-600/50 px-2.5 py-2 font-black uppercase">TEAM</th>
                    <th className="border-r border-purple-600/50 px-2.5 py-2 text-center font-black uppercase">Days</th>
                    <th className="px-2.5 py-2 text-center font-black uppercase">UNIT</th>
                  </tr>
                </thead>
                <tbody className="text-[9.5px] font-medium divide-y divide-slate-100">
                  {activeM3Items.map((item, index) => {
                    const isOverdue = (parseInt(item.daysDiff) || 0) > 3;
                    const teamName = item.team && item.team !== '-' ? item.team : (item.unitConfirm || item.handoverUnit || '-');
                    return (
                      <tr key={index} className={`transition-colors whitespace-nowrap ${isOverdue ? 'bg-red-50/90 text-red-950 font-semibold border-l-4 border-l-red-600' : 'hover:bg-slate-50/80 odd:bg-white even:bg-slate-50/40 text-slate-800'}`}>
                        <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold text-slate-500">{index + 1}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-black text-slate-900 tracking-tight font-mono whitespace-nowrap">{item.codeHandover || item.code}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-800 whitespace-nowrap">{item.type || '-'}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-800 whitespace-nowrap">{cleanWarehouseName(item.handoverUnit || '-')}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-800 whitespace-nowrap">{cleanWarehouseName(item.unitConfirm || '-')}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-bold text-slate-700 font-mono text-center whitespace-nowrap">{item.handoverDate || item.date || '-'}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 text-center whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-extrabold ${item.isConfirmed ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>{item.status || 'Pending'}</span>
                        </td>
                        <td className="border-r border-slate-100 px-2 py-1.5 font-black text-indigo-950 font-mono text-[9.5px] whitespace-nowrap">{teamName}</td>
                        <td className="border-r border-slate-100 px-2 py-1.5 text-center font-extrabold">{getDelayBadge(item.daysDiff, 3)}</td>
                        <td className="px-2 py-1.5 text-center font-extrabold whitespace-nowrap">
                          <span className="bg-indigo-50 text-indigo-800 px-1 rounded border border-indigo-100 text-[8.5px] inline-block font-black">{item.unit || '-'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {activeM1Items.length === 0 && activeM2Items.length === 0 && activeM3Items.length === 0 && (
          <div className="bg-emerald-50/40 border border-emerald-100 rounded-3xl p-6 text-center text-emerald-600 font-bold text-sm flex flex-col items-center gap-2">
            <span>🎉 ALL MODULES COMPLETED</span>
            <span className="text-xs text-emerald-500 font-medium">គ្មានទិន្នន័យចាល់ឡើយ (All Items Cleared)</span>
          </div>
        )}
      </div>

      {/* ─── MODAL: SMART IMPORT TO BACKEND ─── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📥</span>
                <div>
                  <h3 className="text-lg font-black text-slate-800">
                    បញ្ចូលទិន្នន័យទៅកាន់ Backend (Metfone Net)
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    ទិន្នន័យនឹងត្រូវរក្សាទុកក្នុង Database Backend ភ្លាមៗ ជាមួយម៉ោងកាលបរិច្ឆេទជាក់ស្តែង
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setPasteData('');
                  setImportStatus(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Select Target Module */}
            <div className="mb-4">
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                ជ្រើសរើសផ្នែកដែលត្រូវបញ្ចូល (Target Module):
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setImportTargetModule('m1')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all text-left flex flex-col gap-0.5 cursor-pointer ${
                    importTargetModule === 'm1'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>📦 01_STOCKOUT</span>
                  <span className="text-[9px] opacity-80 font-normal">Stock out not Confirm</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportTargetModule('m2')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all text-left flex flex-col gap-0.5 cursor-pointer ${
                    importTargetModule === 'm2'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>📝 02_NOT CREATE</span>
                  <span className="text-[9px] opacity-80 font-normal">Not create hand over</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportTargetModule('m3')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all text-left flex flex-col gap-0.5 cursor-pointer ${
                    importTargetModule === 'm3'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>⏳ 03_HAND OVER</span>
                  <span className="text-[9px] opacity-80 font-normal">Hand over yet confirm</span>
                </button>
              </div>
            </div>

            {/* Paste Textarea */}
            <div className="mb-4">
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 flex justify-between">
                <span>បិទភ្ជាប់ទិន្នន័យ (Paste from Excel / Google Sheet):</span>
                <span className="text-slate-400 font-normal text-[11px] normal-case">គាំទ្រទម្រង់ Tab-separated</span>
              </label>
              <textarea
                rows={7}
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                placeholder="Copy ក្រឡាពី Excel ឬ Google Sheet រួច Paste ចូលទីនេះ..."
                className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50"
              />
            </div>

            {importStatus && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                {importStatus}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setPasteData('');
                  setImportStatus(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                បោះបង់ (Cancel)
              </button>
              <button
                type="button"
                onClick={handleImportToBackend}
                disabled={!pasteData.trim() || isSavingToBackend}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <span>{isSavingToBackend ? '⏳ កំពុងបញ្ចូល...' : '🚀 បញ្ចូលទៅកាន់ Backend'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

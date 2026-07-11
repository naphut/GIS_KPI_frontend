// telegramBot.js - Full Working Version with ALL Exports (Optimized)
import { loadFromDb } from './dbStore';

// ============================================================
// 📌 CONFIGURATION
// ============================================================

// Bot tokens for each province (add custom tokens if needed)
const BOT_TOKENS = {
  // Example: 'BAT': 'YOUR_BOT_TOKEN_HERE',
};

const DEFAULT_TOKEN = '8571996109:AAHiDszOTGk4uEnb0iPKcnNXlGoTSE7K740';

// Group IDs for each province
const GROUP_IDS = {
  BAN: "-1003815749201",
  BAT: "-1004928617538",
  CHA: "-1002154876394",
  CHH: "-1006739281540",
  KAM: "-1005481736291",
  KAN: "-1001847263950",
  KANZ1: "-1009154376284",
  KOH: "-1003278516492",
  KRA: "-1007845219360",
  MON: "-1004692185731",
  ODD: "-1008516372945",
  PNP: "-5359041682",
  PNPZ1: "-1006924158730",
  PNPZ2: "-1004137892651",
  PRE: "-1001578263948",
  PRH: "-1007264915382",
  PUR: "-1003849157260",
  ROT: "-1005972384619",
  SIE: "-1008437612954",
  SIH: "-1002169547381",
  SPE: "-1007358194620",
  STU: "-1009514826375",
  SVA: "-1004726391580",
  TAK: "-1006841952734",
  THO: "-1003297486159",
};

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

// ============================================================
// 📌 HELPER FUNCTIONS
// ============================================================

// Get bot token for specific unit
const getBotToken = (unit) => {
  return BOT_TOKENS[unit] || DEFAULT_TOKEN;
};

// Get API URL for specific unit
const getApiUrl = (unit) => {
  const token = getBotToken(unit);
  return `${TELEGRAM_API_BASE}${token}`;
};

// Escape HTML for Telegram
const escapeHtml = (unsafe) => {
  if (unsafe === undefined || unsafe === null) return '-';
  if (typeof unsafe !== 'string') unsafe = String(unsafe);
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, ' ');
};

// Calculate days difference
const calculateDaysDiff = (dateString) => {
  if (!dateString) return 0;
  try {
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
  } catch (e) {
    return 0;
  }
};

// ============================================================
// 📌 GET UNIT DATA FROM DATABASE - STOCKOUT MODULES
// ============================================================

export const getUnitData = async (unit) => {
  try {
    // ─── MODULE 1: STOCKOUT YET CONFIRM ───
    const stockoutData = await loadFromDb('kpi_stockout_data', []);
    const stockoutTargets = await loadFromDb('kpi_stockout_targets', {});
    const stockoutHistory = await loadFromDb('kpi_stockout_completionHistory', []);

    // ─── MODULE 2: NO CREATE HAND OVER ───
    const nocreateData = await loadFromDb('kpi_nocreate_data', []);
    const nocreateTargets = await loadFromDb('kpi_nocreate_targets', {});
    const nocreateHistory = await loadFromDb('kpi_nocreate_completionHistory', []);
    const nocreateConfirmed = await loadFromDb('kpi_nocreate_confirmedStatus', {});

    // ─── MODULE 3: STOCK OUT NOTE - NOT CONFIRMED ───
    const notconfirmedData = await loadFromDb('kpi_notconfirmed_data', []);
    const notconfirmedTargets = await loadFromDb('kpi_notconfirmed_targets', {});
    const notconfirmedHistory = await loadFromDb('kpi_notconfirmed_completionHistory', []);
    const notconfirmedConfirmed = await loadFromDb('kpi_notconfirmed_confirmedStatus', {});

    // ─── FILTER BY UNIT ───
    const unitStockout = stockoutData.filter(item => item.unit === unit);
    const unitNocreate = nocreateData.filter(item => item.unit === unit);
    const unitNotconfirmed = notconfirmedData.filter(item => item.unit === unit);

    const isMorning = new Date().getHours() < 12;

    // ─── CALCULATE MODULE 1: STOCKOUT YET CONFIRM ───
    const m1MorningConfig = stockoutTargets[unit]?.morning || 0;
    const m1EveningConfig = stockoutTargets[unit]?.evening || 0;
    const m1Morning = m1MorningConfig > 0 ? m1MorningConfig : unitStockout.length;
    const m1Evening = m1EveningConfig > 0 ? m1EveningConfig : (m1Morning * 2);
    const m1Target = isMorning ? m1Morning : (m1Evening > 0 ? m1Evening : m1Morning);
    const m1Total = unitStockout.length;
    const m1Completed = stockoutHistory.filter(c => c.unit === unit).length;
    const m1Remain = m1Target > 0 ? Math.max(0, m1Target - m1Completed) : m1Total;
    const m1Ratio = m1Target > 0 ? parseFloat(((m1Completed / m1Target) * 100).toFixed(2)) : (m1Remain === 0 && m1Completed === 0 ? 100 : 0);

    const m1RemainingItems = unitStockout
      .filter(item => !stockoutHistory.some(c => c.exportNo === item.exportNo || c.code === item.exportNo))
      .map(item => ({
        exportCode: item.exportCode || item.code || '-',
        exportNo: item.exportNo || '-',
        groupReceiver: item.groupReceiver || '-',
        daysDiff: item.daysDiff || calculateDaysDiff(item.realExport || item.date),
        warehouse: item.stockReceiver || item.warehouse || '-',
        creator: item.creator || '-'
      }));

    // ─── CALCULATE MODULE 2: NO CREATE HAND OVER ───
    const m2MorningConfig = nocreateTargets[unit]?.morning || 0;
    const m2EveningConfig = nocreateTargets[unit]?.evening || 0;
    const m2Morning = m2MorningConfig > 0 ? m2MorningConfig : unitNocreate.length;
    const m2Evening = m2EveningConfig > 0 ? m2EveningConfig : (m2Morning * 2);
    const m2Target = isMorning ? m2Morning : (m2Evening > 0 ? m2Evening : m2Morning);
    const m2Total = unitNocreate.length;
    let m2Completed = nocreateHistory.filter(c => c.unit === unit).length;
    Object.entries(nocreateConfirmed).forEach(([code, confirmed]) => {
      if (confirmed) {
        const item = nocreateData.find(d => d.code === code);
        if (item && item.unit === unit) m2Completed++;
      }
    });
    const m2Remain = m2Target > 0 ? Math.max(0, m2Target - m2Completed) : m2Total;
    const m2Ratio = m2Target > 0 ? parseFloat(((m2Completed / m2Target) * 100).toFixed(2)) : (m2Remain === 0 && m2Completed === 0 ? 100 : 0);

    const m2RemainingItems = unitNocreate
      .filter(item => !nocreateHistory.some(c => c.code === item.code) && !nocreateConfirmed[item.code])
      .map(item => ({
        code: item.code || '-',
        recipient: item.recipient || '-',
        creator: item.creator || '-',
        daysDiff: item.daysDiff || calculateDaysDiff(item.date),
        warehouse: item.warehouse || '-'
      }));

    // ─── CALCULATE MODULE 3: STOCK OUT NOTE - NOT CONFIRMED ───
    const m3MorningConfig = notconfirmedTargets[unit]?.morning || 0;
    const m3EveningConfig = notconfirmedTargets[unit]?.evening || 0;
    const m3Morning = m3MorningConfig > 0 ? m3MorningConfig : unitNotconfirmed.length;
    const m3Evening = m3EveningConfig > 0 ? m3EveningConfig : (m3Morning * 2);
    const m3Target = isMorning ? m3Morning : (m3Evening > 0 ? m3Evening : m3Morning);
    const m3Total = unitNotconfirmed.length;
    let m3Completed = notconfirmedHistory.filter(c => c.unit === unit).length;
    Object.entries(notconfirmedConfirmed).forEach(([code, confirmed]) => {
      if (confirmed) {
        const item = notconfirmedData.find(d => d.code === code);
        if (item && item.unit === unit) m3Completed++;
      }
    });
    const m3Remain = m3Target > 0 ? Math.max(0, m3Target - m3Completed) : m3Total;
    const m3Ratio = m3Target > 0 ? parseFloat(((m3Completed / m3Target) * 100).toFixed(2)) : (m3Remain === 0 && m3Completed === 0 ? 100 : 0);

    const m3RemainingItems = unitNotconfirmed
      .filter(item => !notconfirmedHistory.some(c => c.code === item.code) && !notconfirmedConfirmed[item.code])
      .map(item => ({
        code: item.code || '-',
        unitConfirm: item.unitConfirm || '-',
        daysDiff: item.daysDiff || calculateDaysDiff(item.date),
        warehouse: item.handoverUnit || item.unitConfirm || '-',
        creator: item.creator || '-'
      }));

    // ─── TOTALS ───
    const totalTarget = m1Target + m2Target + m3Target;
    const totalRemain = m1Remain + m2Remain + m3Remain;
    const totalResult = m1Completed + m2Completed + m3Completed;
    const totalInSystem = m1Total + m2Total + m3Total;
    const totalRatio = totalTarget > 0 
      ? parseFloat(((totalResult / totalTarget) * 100).toFixed(2)) 
      : (totalRemain === 0 && totalResult === 0 ? 100 : 0);

    return {
      m1Target,
      m1Morning,
      m1Evening,
      m1Result: m1Completed,
      m1Remain,
      m1InSystem: m1Total,
      m1Ratio,
      m1Items: m1RemainingItems,
      m2Target,
      m2Morning,
      m2Evening,
      m2Result: m2Completed,
      m2Remain,
      m2InSystem: m2Total,
      m2Ratio,
      m2Items: m2RemainingItems,
      m3Target,
      m3Morning,
      m3Evening,
      m3Result: m3Completed,
      m3Remain,
      m3InSystem: m3Total,
      m3Ratio,
      m3Items: m3RemainingItems,
      totalTarget,
      totalRemain,
      totalResult,
      totalInSystem,
      totalRatio,
      targetMorning: m1Morning + m2Morning + m3Morning,
      targetEvening: m1Evening + m2Evening + m3Evening,
      remain: totalRemain,
      result: totalResult,
      ratio: totalRatio,
      inSystem: totalInSystem,
      stockoutYetConfirm: m1RemainingItems,
      noCreateHandOver: m2RemainingItems,
      stockOutNoteNotConfirmed: m3RemainingItems
    };
  } catch (error) {
    console.error('Error getting unit data:', error);
    return {
      m1Target: 0,
      m1Morning: 0,
      m1Evening: 0,
      m1Result: 0,
      m1Remain: 0,
      m1InSystem: 0,
      m1Ratio: 0,
      m1Items: [],
      m2Target: 0,
      m2Result: 0,
      m2Remain: 0,
      m2InSystem: 0,
      m2Ratio: 0,
      m2Items: [],
      m3Target: 0,
      m3Result: 0,
      m3Remain: 0,
      m3InSystem: 0,
      m3Ratio: 0,
      m3Items: [],
      totalTarget: 0,
      totalRemain: 0,
      totalResult: 0,
      totalInSystem: 0,
      totalRatio: 0,
      targetMorning: 0,
      targetEvening: 0,
      remain: 0,
      result: 0,
      ratio: 0,
      inSystem: 0,
      stockoutYetConfirm: [],
      noCreateHandOver: [],
      stockOutNoteNotConfirmed: []
    };
  }
};

// ============================================================
// 📌 GET BACKEND BASE URL
// ============================================================

const getBackendBaseUrl = () => {
  const host = window.location.hostname || 'localhost';
  const isLocal = host === 'localhost' || 
                  host === '127.0.0.1' || 
                  host.startsWith('192.168.') || 
                  host.startsWith('10.') || 
                  host.startsWith('172.') || 
                  host.endsWith('.local');
  if (isLocal) {
    return `http://${host}:8000/api`;
  }
  return 'https://gis-kpi-backend.onrender.com/api';
};

// ============================================================
// 📌 FORMAT STOCKOUT MESSAGE
// ============================================================

const formatStockoutMessage = (unit, data, customNote = '') => {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Get data from parameter or from database
  let unitData = data;
  if (data && data.units && data.units[unit]) {
    unitData = data.units[unit];
  } else if (!data || data.totalTarget === undefined) {
    // If data not provided, return error message
    return `⚠️ No data available for ${unit}. Please sync data first.`;
  }

  const m1Items = unitData.m1Items || [];
  const m2Items = unitData.m2Items || [];
  const m3Items = unitData.m3Items || [];

  const totalResult = unitData.totalResult || 0;
  const totalRemain = unitData.totalRemain || 0;
  const totalRatio = unitData.totalRatio || 0;
  const totalInSystem = unitData.totalInSystem || 0;
  const targetMorning = unitData.targetMorning || 0;
  const targetEvening = unitData.targetEvening || 0;

  let message = `📊 <b>📋 CONFIRMED HAND OVER REPORT</b>\n`;
  message += `📍 <b>BRANCH</b> : ${unit}\n`;
  message += `🕐 <b>TIME</b>   : ${time}\n`;
  message += `📅 <b>DATE</b>   : ${date}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;

  message += `📈 <b>📊 OVERALL KPI SUMMARY</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🌅 Target ព្រឹក  : ${targetMorning}\n`;
  message += `│ 🌙 Target ល្ងាច : ${targetEvening}\n`;
  message += `│ ✅ Result       : ${totalResult}\n`;
  message += `│ 📋 Remain      : ${totalRemain}\n`;
  message += `│ 📊 Ratio       : ${typeof totalRatio === 'number' ? totalRatio.toFixed(1) : totalRatio}%\n`;
  message += `│ 📦 In System   : ${totalInSystem}\n`;
  message += `└─────────────────────────┘\n`;

  // Module 1
  message += `<b>📦 1. STOCKOUT YET CONFIRM│ ${m1Items.length === 0 ? '✅' : '📋'}</b>\n`;
  if (m1Items.length > 0) {
    // Group by Group Receiver (Team) only
    const m1Groups = {};
    m1Items.forEach(item => {
      const groupRec = item.groupReceiver || '-';
      if (!m1Groups[groupRec]) {
        m1Groups[groupRec] = {
          groupReceiver: groupRec,
          items: []
        };
      }
      m1Groups[groupRec].items.push(item);
    });

    Object.values(m1Groups).forEach(group => {
      // Get unique stock receivers for this group (cleaning any leading hyphen)
      const uniqueStockRecs = [...new Set(group.items.map(item => {
        let val = item.stockReceiver || item.warehouse || '-';
        if (val.startsWith('-')) {
          val = val.substring(1);
        }
        return val;
      }).filter(val => val && val !== '-'))];
      
      const stockReceiverStr = uniqueStockRecs.length > 0 ? uniqueStockRecs.join(', ') : '-';
      const displayStockReceiver = stockReceiverStr === '-' ? '-' : `-${stockReceiverStr}`;

      message += `📋 Group Receiver: ${escapeHtml(group.groupReceiver)}\n`;
      message += `│    Stock Receiver: ${escapeHtml(displayStockReceiver)}\n`;
      message += `┌─────────────────────────┐\n`;
      group.items.forEach(item => {
        const exportNo = item.exportNo || '-';
        const days = item.daysDiff || 0;
        message += `│    Export No: ${escapeHtml(exportNo)}\n`;
        message += `│   └─  Days: ${days} days\n`;
      });
      message += `└─────────────────────────┘\n`;
    });
  }
  message += `\n`;

  // Module 2
  message += `<b>📝 2. NO CREATE HAND OVER│ ${m2Items.length === 0 ? '✅' : '📋'}</b>\n`;
  if (m2Items.length > 0) {
    // Group by Recipient
    const m2Groups = {};
    m2Items.forEach(item => {
      const key = item.recipient || '-';
      if (!m2Groups[key]) {
        m2Groups[key] = [];
      }
      m2Groups[key].push(item);
    });

    Object.entries(m2Groups).forEach(([recipient, items]) => {
      message += `Recipient: ${escapeHtml(recipient)}\n`;
      message += `┌─────────────────────────┐\n`;
      items.forEach((item, index) => {
        message += `│ ${index + 1}. ${escapeHtml(item.code || '-')}\n`;
        message += `│ └─ Q'ty of Day: ${item.daysDiff || 0}\n`;
      });
      message += `└─────────────────────────┘\n`;
    });
  }
  message += `\n`;

  // Module 3
  message += `<b>⚠️ 3. STOCK OUT NOTE - NOT CONFIRMED│ ${m3Items.length === 0 ? '✅' : '📋'}</b>\n`;
  if (m3Items.length > 0) {
    // Group by Unit confirm handover
    const m3Groups = {};
    m3Items.forEach(item => {
      const key = item.unitConfirm || item.warehouse || '-';
      if (!m3Groups[key]) {
        m3Groups[key] = [];
      }
      m3Groups[key].push(item);
    });

    Object.entries(m3Groups).forEach(([unitConfirm, items]) => {
      message += `Unit confirm handover: ${escapeHtml(unitConfirm)}\n`;
      message += `┌─────────────────────────┐\n`;
      items.forEach((item, index) => {
        message += `│ ${index + 1}. Code: ${escapeHtml(item.code || '-')}\n`;
        message += `│    └─ Days: ${item.daysDiff || 0} days\n`;
      });
      message += `└─────────────────────────┘\n`;
    });
  }
  message += `\n`;

  message += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (customNote && customNote.trim()) {
    message += `📝 <b>NOTE:</b>\n${escapeHtml(customNote.trim())}\n\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }
  message += `<i>📊 Report generated from Confirmed Hand Over Dashboard</i>`;

  return message;
};

// ============================================================
// 📌 FORMAT RESTOCK MESSAGE (Restock In + Restock Out)
// ============================================================

const formatRestockMessage = (unit, data, customNote = '') => {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  let unitData = data;
  if (data && data.units && data.units[unit]) {
    unitData = data.units[unit];
  } else if (!data || data.totalTarget === undefined) {
    return `⚠️ No data available for ${unit}. Please sync data first.`;
  }

  const targetMorning = unitData.targetMorning || 0;
  const targetEvening = unitData.targetEvening || 0;
  const remain = unitData.remain || 0;
  const result = unitData.result || 0;
  const ratio = unitData.ratio || 0;
  const inSystem = unitData.inSystem || 0;

  const unsignedInItems = unitData.unsignedInItems || [];
  const unsignedOutItems = unitData.unsignedOutItems || [];

  let message = `📊 <b>TASK ASSET REPORT</b>\n`;
  message += `📍 <b>BRANCH</b> : ${unit}\n`;
  message += `🕐 <b>TIME</b>   : ${time}\n`;
  message += `📅 <b>DATE</b>   : ${date}\n`;
  message += `\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  message += `📈 <b>KPI SUMMARY RESTOCK</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🌅 Target ព្រឹក: ${targetMorning}\n`;
  message += `│ 🌙 Target ល្ងាច: ${targetEvening}\n`;
  message += `│ 📋 Remain    : ${remain}\n`;
  message += `│ ✅ Result    : ${result}\n`;
  message += `│ 📊 Ratio     : ${typeof ratio === 'number' ? ratio.toFixed(1) : ratio}%\n`;
  message += `│ 📦 In System  : ${inSystem}\n`;
  message += `└─────────────────────────┘\n\n`;

  // Restock Out (EXPORT CA)
  const restockOut = unitData.restockOut || { target: 0, result: 0, remain: 0, ratio: 0 };
  const rOutRatio = typeof restockOut.ratio === 'number' ? restockOut.ratio : parseFloat(restockOut.ratio || 0);
  message += `<b>RESTOCK OUT</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🎯 Target    : ${restockOut.target}\n`;
  message += `│ ✅ Result    : ${restockOut.result}\n`;
  message += `│ 📋 Remain    : ${restockOut.remain}\n`;
  message += `│ 📊 Ratio     : ${rOutRatio.toFixed(1)}%\n`;
  message += `└─────────────────────────┘\n`;
  if (unsignedOutItems.length > 0) {
    message += `\n<b>📋 REMAINING ITEMS:</b>\n`;
    unsignedOutItems.forEach((item, index) => {
      message += `┌─────────────────────────┐\n`;
      message += `│ ${index + 1}. ${escapeHtml(item.code || '-')}\n`;
      message += `│    Group request: ${escapeHtml(item.groupRequest || '-')}\n`;
      message += `│    Creator: ${escapeHtml(item.creator || '-')}\n`;
      message += `│    Q'ty of day: ${item.daysDiff || 0} days\n`;
      message += `└─────────────────────────┘\n`;
    });
  } else {
    message += `┌─────────────────────────┐\n│ 📋 No unsigned documents\n└─────────────────────────┘\n`;
  }
  message += `\n`;

  // Restock In (IMPORT CA)
  const restockIn = unitData.restockIn || { target: 0, result: 0, remain: 0, ratio: 0 };
  const rInRatio = typeof restockIn.ratio === 'number' ? restockIn.ratio : parseFloat(restockIn.ratio || 0);
  message += `<b>RESTOCK IN</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🎯 Target    : ${restockIn.target}\n`;
  message += `│ ✅ Result    : ${restockIn.result}\n`;
  message += `│ 📋 Remain    : ${restockIn.remain}\n`;
  message += `│ 📊 Ratio     : ${rInRatio.toFixed(1)}%\n`;
  message += `└─────────────────────────┘\n`;
  if (unsignedInItems.length > 0) {
    message += `\n<b>📋 REMAINING ITEMS:</b>\n`;
    unsignedInItems.forEach((item, index) => {
      message += `┌─────────────────────────┐\n`;
      message += `│ ${index + 1}. ${escapeHtml(item.code || '-')}\n`;
      message += `│    Unit Requests: ${escapeHtml(item.unitRequests || '-')}\n`;
      message += `│    Creator: ${escapeHtml(item.creator || '-')}\n`;
      message += `│    Q'ty of day: ${item.daysDiff || 0} days\n`;
      message += `└─────────────────────────┘\n`;
    });
  } else {
    message += `┌─────────────────────────┐\n│ 📋 No unsigned documents\n└─────────────────────────┘\n`;
  }
  message += `\n`;

  message += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (customNote && customNote.trim()) {
    message += `📝 <b>NOTE:</b>\n${escapeHtml(customNote.trim())}\n\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }
  message += `<i>Report generated from Restock Dashboard</i>`;

  return message;
};

// ============================================================
// 📌 FORMAT CA MESSAGE (Export CA + Import CA)
// ============================================================

const formatCAMessage = (unit, data, customNote = '') => {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  let unitData = data;
  if (data && data.units && data.units[unit]) {
    unitData = data.units[unit];
  } else if (!data || data.totalTarget === undefined) {
    return `⚠️ No data available for ${unit}. Please sync data first.`;
  }

  const targetMorning = unitData.targetMorning || 0;
  const targetEvening = unitData.targetEvening || 0;
  const remain = unitData.remain || 0;
  const result = unitData.result || 0;
  const ratio = unitData.ratio || 0;
  const inSystem = unitData.inSystem || 0;

  const unsignedOutItems = unitData.unsignedOutItems || [];
  const unsignedInItems = unitData.unsignedInItems || [];

  let message = `📊 <b>TASK ASSET REPORT</b>\n`;
  message += `📍 <b>BRANCH</b> : ${unit}\n`;
  message += `🕐 <b>TIME</b>   : ${time}\n`;
  message += `📅 <b>DATE</b>   : ${date}\n`;
  message += `\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  message += `📈 <b>KPI SUMMARY CA</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🌅 Target ព្រឹក: ${targetMorning}\n`;
  message += `│ 🌙 Target ល្ងាច: ${targetEvening}\n`;
  message += `│ 📋 Remain    : ${remain}\n`;
  message += `│ ✅ Result    : ${result}\n`;
  message += `│ 📊 Ratio     : ${typeof ratio === 'number' ? ratio.toFixed(1) : ratio}%\n`;
  message += `│ 📦 In System  : ${inSystem}\n`;
  message += `└─────────────────────────┘\n\n`;

  // Export CA
  const stockOut = unitData.stockOut || { target: 0, result: 0, remain: 0, ratio: 0 };
  const sOutRatio = typeof stockOut.ratio === 'number' ? stockOut.ratio : parseFloat(stockOut.ratio || 0);
  const sOutTarget = stockOut.target || 0;
  const sOutRemain = stockOut.remain || 0;
  message += `<b>EXPORT CA✅</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🎯 Target    : ${sOutTarget}\n`;
  message += `│ ✅ Result    : ${stockOut.result}\n`;
  message += `│ 📋 Remain    : ${sOutRemain}\n`;
  message += `│ 📊 Ratio     : ${sOutRatio.toFixed(1)}%\n`;
  message += `└─────────────────────────┘\n`;
  if (unsignedOutItems.length > 0) {
    message += `\n<b>📋 REMAINING ITEMS:</b>\n`;
    unsignedOutItems.forEach((item, index) => {
      message += `┌─────────────────────────┐\n`;
      message += `│ ${index + 1}. Export Note Code: ${escapeHtml(item.code || item.exportNoteCode || '-')} \n`;
      message += `│    Unit Entering: ${escapeHtml(item.unitEntering || '-')}\n`;
      message += `│    Status CA: ${escapeHtml(item.statusCA || 'Unsigned')}\n`;
      message += `│    Days: ${item.daysDiff || 0} days\n`;
      message += `└─────────────────────────┘\n`;
    });
  } else {
    message += `┌─────────────────────────┐\n│ 📋 No unsigned documents\n└─────────────────────────┘\n`;
  }
  message += `\n`;

  // Import CA
  const stockIn = unitData.stockIn || { target: 0, result: 0, remain: 0, ratio: 0 };
  const sInRatio = typeof stockIn.ratio === 'number' ? stockIn.ratio : parseFloat(stockIn.ratio || 0);
  const sInTarget = stockIn.target || 0;
  const sInRemain = stockIn.remain || 0;
  message += `<b>IMPORT CA✅</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🎯 Target    : ${sInTarget}\n`;
  message += `│ ✅ Result    : ${stockIn.result}\n`;
  message += `│ 📋 Remain    : ${sInRemain}\n`;
  message += `│ 📊 Ratio     : ${sInRatio.toFixed(1)}%\n`;
  message += `└─────────────────────────┘\n`;
  if (unsignedInItems.length > 0) {
    message += `\n<b>📋 REMAINING ITEMS:</b>\n`;
    unsignedInItems.forEach((item, index) => {
      message += `┌─────────────────────────┐\n`;
      message += `│ ${index + 1}. Receipt Code: ${escapeHtml(item.code || item.codeReceipt || '-')}\n`;
      message += `│    Warehouse: ${escapeHtml(item.warehouse || '-')}\n`;
      message += `│    Status CA: ${escapeHtml(item.statusCA || 'Unsigned')}\n`;
      message += `│    Days: ${item.daysDiff || 0} days\n`;
      message += `└─────────────────────────┘\n`;
    });
  } else {
    message += `┌─────────────────────────┐\n│ 📋 No unsigned documents\n└─────────────────────────┘\n`;
  }
  message += `\n`;

  message += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (customNote && customNote.trim()) {
    message += `📝 <b>NOTE:</b>\n${escapeHtml(customNote.trim())}\n\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }
  message += `<i>Report generated from Dashboard CA</i>`;

  return message;
};

// ============================================================
// 📌 SEND MESSAGE TO TELEGRAM - DIRECT (NO PENDING)
// ============================================================

const sendSingleMessageToTelegram = async (unit, message, signal = null) => {
  const startTime = Date.now();
  
  try {
    const groupId = GROUP_IDS[unit];
    if (!groupId || groupId === '') {
      return { 
        success: false, 
        error: `No group ID configured for ${unit}`,
        duration: Date.now() - startTime
      };
    }

    const token = getBotToken(unit);
    const backendUrl = `${getBackendBaseUrl()}/telegram/send`;
    
    console.log(`📤 Sending to ${unit} via backend...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    let response;
    let result;
    
    try {
      response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          chat_id: groupId,
          token: token
        }),
        signal: signal || controller.signal
      });
      
      if (response.ok) {
        result = await response.json();
      }
    } catch (backendError) {
      console.warn(`⚠️ Backend sending failed, falling back to direct sending:`, backendError);
    }
    
    // Fallback to direct sending if backend is not available or returned an error
    if (!result || !result.success) {
      console.log(`📤 Falling back to direct sending to Telegram API for ${unit}...`);
      const directUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      const directResponse = await fetch(directUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: groupId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }),
        signal: signal || controller.signal
      });
      
      const directResult = await directResponse.json();
      const duration = Date.now() - startTime;
      clearTimeout(timeoutId);
      
      if (directResult.ok) {
        console.log(`✅ Sent directly to ${unit} (${duration}ms)`);
        return { success: true, result: directResult, duration };
      } else {
        console.error(`❌ Failed to send directly to ${unit}: ${directResult.description}`);
        return { success: false, error: directResult.description, duration };
      }
    }
    
    const duration = Date.now() - startTime;
    clearTimeout(timeoutId);
    
    console.log(`✅ Sent via backend to ${unit} (${duration}ms)`);
    return { success: true, result, duration };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    if (error.name === 'AbortError') {
      return { success: false, error: 'Timeout (15s)', aborted: true, duration };
    }
    console.error(`❌ Error sending to ${unit}:`, error);
    return { success: false, error: error.message, duration };
  }
};

const sendMessageToTelegram = async (unit, message, signal = null) => {
  // Telegram character limit is 4096. We split at 3900 to leave safety margin.
  if (message.length <= 3900) {
    return await sendSingleMessageToTelegram(unit, message, signal);
  }

  console.log(`✂️ Message is too long (${message.length} chars). Splitting into parts...`);
  
  // Split by the item card delimiter
  const separator = '┌─────────────────────────┐';
  const parts = message.split(separator);
  const messagesToSend = [];
  
  // parts[0] contains the header/summary info
  let currentMessage = parts[0];

  for (let i = 1; i < parts.length; i++) {
    const itemCard = separator + parts[i];
    // If adding this item exceeds the target chunk size, commit the current chunk
    if (currentMessage.length + itemCard.length > 3900) {
      if (currentMessage.trim()) {
        messagesToSend.push(currentMessage);
      }
      currentMessage = `📍 <b>BRANCH ${unit} (Continued)</b>\n\n` + itemCard;
    } else {
      currentMessage += itemCard;
    }
  }

  if (currentMessage.trim()) {
    messagesToSend.push(currentMessage);
  }

  let lastResult = { success: false, error: 'No parts to send' };
  const startTime = Date.now();

  for (let i = 0; i < messagesToSend.length; i++) {
    let partMsg = messagesToSend[i];
    if (messagesToSend.length > 1) {
      partMsg += `\n\n📄 <b>Part ${i + 1}/${messagesToSend.length}</b>`;
    }

    lastResult = await sendSingleMessageToTelegram(unit, partMsg, signal);
    if (!lastResult.success) {
      return lastResult; // Fail early if any part fails
    }

    // Rate-limiting safety delay between parts
    if (i < messagesToSend.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return {
    success: true,
    result: lastResult.result,
    duration: Date.now() - startTime
  };
};

// ============================================================
// 📌 EXPORT: STOCKOUT FUNCTIONS - SEQUENTIAL (NO PENDING)
// ============================================================

export const sendToTelegram = async (unit, data, customNote = '', signal = null) => {
  const message = formatStockoutMessage(unit, data, customNote);
  return await sendMessageToTelegram(unit, message, signal);
};

export const sendToAllTelegram = async (data, onProgress, customNote = '', signal = null) => {
  const units = getConfiguredUnits();
  
  if (units.length === 0) {
    if (onProgress) {
      onProgress({
        current: 0,
        total: 0,
        unit: 'NONE',
        status: 'error',
        error: 'No group IDs configured. Please add group IDs first.'
      });
    }
    return {
      results: [],
      summary: { total: 0, success: 0, failed: 0, message: 'No group IDs configured.' }
    };
  }

  const results = [];
  let successCount = 0;
  let failCount = 0;
  let completedCount = 0;

  // 📌 SEND ONE BY ONE - SEQUENTIAL
  for (const unit of units) {
    // Check cancelled
    if (signal && signal.aborted) {
      results.push({ unit, success: false, error: 'Cancelled', aborted: true });
      failCount++;
      completedCount++;
      continue;
    }

    try {
      // Update progress - SENDING
      if (onProgress) {
        onProgress({
          current: completedCount + 1,
          total: units.length,
          unit: unit,
          status: 'sending'
        });
      }

      // Send to Telegram - pass data directly
      const result = await sendToTelegram(unit, data, customNote, signal);

      completedCount++;
      results.push({ unit, ...result });

      if (result.success) {
        successCount++;
        if (onProgress) {
          onProgress({
            current: completedCount,
            total: units.length,
            unit: unit,
            status: 'success',
            duration: result.duration
          });
        }
      } else {
        failCount++;
        if (onProgress) {
          onProgress({
            current: completedCount,
            total: units.length,
            unit: unit,
            status: result.aborted ? 'error' : 'failed',
            error: result.error
          });
        }
      }
    } catch (error) {
      completedCount++;
      failCount++;
      results.push({ unit, success: false, error: error.message });
      if (onProgress) {
        onProgress({
          current: completedCount,
          total: units.length,
          unit: unit,
          status: 'failed',
          error: error.message
        });
      }
    }

    // 📌 Small delay to avoid rate limiting
    if (completedCount < units.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return {
    results,
    summary: {
      total: units.length,
      success: successCount,
      failed: failCount,
      duration: results.reduce((sum, r) => sum + (r.duration || 0), 0),
      details: results.map(r => `${r.unit}: ${r.success ? '✅' : '❌'} ${r.error || ''}`)
    }
  };
};

// ============================================================
// 📌 EXPORT: RESTOCK FUNCTIONS - SEQUENTIAL
// ============================================================

export const sendRestockToTelegram = async (unit, data, customNote = '', signal = null) => {
  const message = formatRestockMessage(unit, data, customNote);
  return await sendMessageToTelegram(unit, message, signal);
};

export const sendToAllRestockTelegram = async (data, onProgress, customNote = '', signal = null) => {
  const units = getConfiguredUnits();
  
  if (units.length === 0) {
    if (onProgress) {
      onProgress({
        current: 0,
        total: 0,
        unit: 'NONE',
        status: 'error',
        error: 'No group IDs configured. Please add group IDs first.'
      });
    }
    return {
      results: [],
      summary: { total: 0, success: 0, failed: 0, message: 'No group IDs configured.' }
    };
  }

  const results = [];
  let successCount = 0;
  let failCount = 0;
  let completedCount = 0;

  for (const unit of units) {
    if (signal && signal.aborted) {
      results.push({ unit, success: false, error: 'Cancelled', aborted: true });
      failCount++;
      completedCount++;
      continue;
    }

    try {
      if (onProgress) {
        onProgress({
          current: completedCount + 1,
          total: units.length,
          unit: unit,
          status: 'sending'
        });
      }

      const result = await sendRestockToTelegram(unit, data, customNote, signal);

      completedCount++;
      results.push({ unit, ...result });

      if (result.success) {
        successCount++;
        if (onProgress) {
          onProgress({
            current: completedCount,
            total: units.length,
            unit: unit,
            status: 'success',
            duration: result.duration
          });
        }
      } else {
        failCount++;
        if (onProgress) {
          onProgress({
            current: completedCount,
            total: units.length,
            unit: unit,
            status: result.aborted ? 'error' : 'failed',
            error: result.error
          });
        }
      }
    } catch (error) {
      completedCount++;
      failCount++;
      results.push({ unit, success: false, error: error.message });
      if (onProgress) {
        onProgress({
          current: completedCount,
          total: units.length,
          unit: unit,
          status: 'failed',
          error: error.message
        });
      }
    }

    if (completedCount < units.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return {
    results,
    summary: {
      total: units.length,
      success: successCount,
      failed: failCount,
      duration: results.reduce((sum, r) => sum + (r.duration || 0), 0),
      details: results.map(r => `${r.unit}: ${r.success ? '✅' : '❌'} ${r.error || ''}`)
    }
  };
};

// ============================================================
// 📌 EXPORT: CA FUNCTIONS - SEQUENTIAL
// ============================================================

export const sendCAToTelegram = async (unit, data, customNote = '', signal = null) => {
  const message = formatCAMessage(unit, data, customNote);
  return await sendMessageToTelegram(unit, message, signal);
};

export const sendToAllCATelegram = async (data, onProgress, customNote = '', signal = null) => {
  const units = getConfiguredUnits();
  
  if (units.length === 0) {
    if (onProgress) {
      onProgress({
        current: 0,
        total: 0,
        unit: 'NONE',
        status: 'error',
        error: 'No group IDs configured. Please add group IDs first.'
      });
    }
    return {
      results: [],
      summary: { total: 0, success: 0, failed: 0, message: 'No group IDs configured.' }
    };
  }

  const results = [];
  let successCount = 0;
  let failCount = 0;
  let completedCount = 0;

  for (const unit of units) {
    if (signal && signal.aborted) {
      results.push({ unit, success: false, error: 'Cancelled', aborted: true });
      failCount++;
      completedCount++;
      continue;
    }

    try {
      if (onProgress) {
        onProgress({
          current: completedCount + 1,
          total: units.length,
          unit: unit,
          status: 'sending'
        });
      }

      const result = await sendCAToTelegram(unit, data, customNote, signal);

      completedCount++;
      results.push({ unit, ...result });

      if (result.success) {
        successCount++;
        if (onProgress) {
          onProgress({
            current: completedCount,
            total: units.length,
            unit: unit,
            status: 'success',
            duration: result.duration
          });
        }
      } else {
        failCount++;
        if (onProgress) {
          onProgress({
            current: completedCount,
            total: units.length,
            unit: unit,
            status: result.aborted ? 'error' : 'failed',
            error: result.error
          });
        }
      }
    } catch (error) {
      completedCount++;
      failCount++;
      results.push({ unit, success: false, error: error.message });
      if (onProgress) {
        onProgress({
          current: completedCount,
          total: units.length,
          unit: unit,
          status: 'failed',
          error: error.message
        });
      }
    }

    if (completedCount < units.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return {
    results,
    summary: {
      total: units.length,
      success: successCount,
      failed: failCount,
      duration: results.reduce((sum, r) => sum + (r.duration || 0), 0),
      details: results.map(r => `${r.unit}: ${r.success ? '✅' : '❌'} ${r.error || ''}`)
    }
  };
};

// ============================================================
// 📌 EXPORT: UTILITY FUNCTIONS
// ============================================================

export const getAllUnits = () => {
  return Object.keys(GROUP_IDS);
};

export const getConfiguredUnits = () => {
  return Object.keys(GROUP_IDS).filter(unit => GROUP_IDS[unit] && GROUP_IDS[unit] !== '');
};

export const hasGroupId = (unit) => {
  return GROUP_IDS[unit] && GROUP_IDS[unit] !== '';
};

export const getBotTokenForUnit = (unit) => {
  return getBotToken(unit);
};

export const hasToken = (unit) => {
  return !!BOT_TOKENS[unit];
};

export const getBotInfo = async (unit) => {
  try {
    const apiUrl = getApiUrl(unit);
    const response = await fetch(`${apiUrl}/getMe`);
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error getting bot info:', error);
    return null;
  }
};

// ============================================================
// 📌 EXPORT: TEST FUNCTIONS
// ============================================================

export const sendTestMessage = async (unit) => {
  const testData = await getUnitData(unit);
  return await sendToTelegram(unit, testData);
};

export const sendTestToAll = async (onProgress) => {
  return await sendToAllTelegram(null, onProgress);
};

// ============================================================
// 📌 EXPORT: NOTE TEMPLATES DATABASE API
// ============================================================

export const getSavedTemplates = async () => {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/templates`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error('Error fetching templates from database:', error);
    return [];
  }
};

export const saveTemplate = async (content) => {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (response.ok) {
      return await response.json();
    }
    const err = await response.json();
    return { error: err.detail || 'Failed to save template' };
  } catch (error) {
    console.error('Error saving template to database:', error);
    return { error: 'Network error saving template' };
  }
};

export const deleteTemplate = async (templateId) => {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/templates/${templateId}`, {
      method: 'DELETE'
    });
    return response.ok;
  } catch (error) {
    console.error('Error deleting template from database:', error);
    return false;
  }
};
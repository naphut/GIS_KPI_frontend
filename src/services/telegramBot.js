// telegramBot.js - Full Working Version with ALL Exports (Optimized)

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
  'BAN': '-1004439477073',
  'BAT': '-1004433153728',
  'CHA': '-1003333333333',
  'CHH': '-1004433153728',
  'KAM': '-1005346518831',
  'KAN': '-1006666666666',
  'KOH': '-1007777777777',
  'KRA': '-1008888888888',
  'MON': '-1009999999999',
  'ODD': '-1001010101010',
  'PNP': '-1004361704022',
  'PRE': '-1001313131313',
  'PRH': '-1001414141414',
  'PUR': '-1001515151515',
  'ROT': '-1001616161616',
  'SIE': '-1001717171717',
  'SIH': '-1001818181818',
  'SPE': '-1001919191919',
  'STU': '-1002020202020',
  'SVA': '-1004477126515',
  'TAK': '-1002222222223',
  'THO': '-1002323232323',
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

// Get data from localStorage
const getStorageData = (key) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
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
// 📌 GET UNIT DATA FROM LOCALSTORAGE - STOCKOUT MODULES
// ============================================================

export const getUnitData = (unit) => {
  // ─── MODULE 1: STOCKOUT YET CONFIRM ───
  const stockoutData = getStorageData('kpi_stockout_data') || [];
  const stockoutTargets = getStorageData('kpi_stockout_targets') || {};
  const stockoutHistory = getStorageData('kpi_stockout_completionHistory') || [];

  // ─── MODULE 2: NO CREATE HAND OVER ───
  const nocreateData = getStorageData('kpi_nocreate_data') || [];
  const nocreateTargets = getStorageData('kpi_nocreate_targets') || {};
  const nocreateHistory = getStorageData('kpi_nocreate_completionHistory') || [];
  const nocreateConfirmed = getStorageData('kpi_nocreate_confirmedStatus') || {};

  // ─── MODULE 3: STOCK OUT NOTE - NOT CONFIRMED ───
  const notconfirmedData = getStorageData('kpi_notconfirmed_data') || [];
  const notconfirmedTargets = getStorageData('kpi_notconfirmed_targets') || {};
  const notconfirmedHistory = getStorageData('kpi_notconfirmed_completionHistory') || [];
  const notconfirmedConfirmed = getStorageData('kpi_notconfirmed_confirmedStatus') || {};

  // ─── FILTER BY UNIT ───
  const unitStockout = stockoutData.filter(item => item.unit === unit);
  const unitNocreate = nocreateData.filter(item => item.unit === unit);
  const unitNotconfirmed = notconfirmedData.filter(item => item.unit === unit);

  // ─── CALCULATE MODULE 1: STOCKOUT YET CONFIRM ───
  // Calculate Morning & Evening Targets
  const m1MorningConfig = stockoutTargets[unit]?.morning || 0;
  const m1EveningConfig = stockoutTargets[unit]?.evening || 0;
  
  // If no target configured, use total count as morning target
  const m1Morning = m1MorningConfig > 0 ? m1MorningConfig : unitStockout.length;
  // Evening target = morning target × 2 (if not configured)
  const m1Evening = m1EveningConfig > 0 ? m1EveningConfig : (m1Morning * 2);
  // Main target = evening target (or morning if evening is 0)
  const m1Target = m1Evening > 0 ? m1Evening : m1Morning;
  
  const m1Total = unitStockout.length;
  const m1Completed = stockoutHistory.filter(c => c.unit === unit).length;
  const m1Remain = m1Target > 0 ? Math.max(0, m1Target - m1Completed) : m1Total;
  const m1Ratio = m1Target > 0 ? parseFloat(((m1Completed / m1Target) * 100).toFixed(2)) : (m1Remain === 0 && m1Completed === 0 ? 100 : 0);

  // Get remaining items with days diff
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
  const m2Target = nocreateTargets[unit]?.target || 0;
  const m2Total = unitNocreate.length;
  
  let m2Completed = nocreateHistory.filter(c => c.unit === unit).length;
  Object.entries(nocreateConfirmed).forEach(([id, confirmed]) => {
    if (confirmed) {
      const item = nocreateData.find(d => d.id === parseInt(id));
      if (item && item.unit === unit) m2Completed++;
    }
  });
  const m2Remain = m2Target > 0 ? Math.max(0, m2Target - m2Completed) : m2Total;
  const m2Ratio = m2Target > 0 ? parseFloat(((m2Completed / m2Target) * 100).toFixed(2)) : (m2Remain === 0 && m2Completed === 0 ? 100 : 0);

  const m2RemainingItems = unitNocreate
    .filter(item => !nocreateHistory.some(c => c.code === item.code) && !nocreateConfirmed[item.id])
    .map(item => ({
      code: item.code || '-',
      recipient: item.recipient || '-',
      creator: item.creator || '-',
      daysDiff: item.daysDiff || calculateDaysDiff(item.date),
      warehouse: item.warehouse || '-'
    }));

  // ─── CALCULATE MODULE 3: STOCK OUT NOTE - NOT CONFIRMED ───
  const m3Target = notconfirmedTargets[unit]?.target || 0;
  const m3Total = unitNotconfirmed.length;
  
  let m3Completed = notconfirmedHistory.filter(c => c.unit === unit).length;
  Object.entries(notconfirmedConfirmed).forEach(([id, confirmed]) => {
    if (confirmed) {
      const item = notconfirmedData.find(d => d.id === parseInt(id));
      if (item && item.unit === unit) m3Completed++;
    }
  });
  const m3Remain = m3Target > 0 ? Math.max(0, m3Target - m3Completed) : m3Total;
  const m3Ratio = m3Target > 0 ? parseFloat(((m3Completed / m3Target) * 100).toFixed(2)) : (m3Remain === 0 && m3Completed === 0 ? 100 : 0);

  const m3RemainingItems = unitNotconfirmed
    .filter(item => !notconfirmedHistory.some(c => c.code === item.code) && !notconfirmedConfirmed[item.id])
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
    // Module 1: Stockout Yet Confirm
    m1Target,
    m1Morning,
    m1Evening,
    m1Result: m1Completed,
    m1Remain,
    m1InSystem: m1Total,
    m1Ratio,
    m1Items: m1RemainingItems,

    // Module 2: No Create Hand Over
    m2Target,
    m2Result: m2Completed,
    m2Remain,
    m2InSystem: m2Total,
    m2Ratio,
    m2Items: m2RemainingItems,

    // Module 3: Stock Out Note - Not Confirmed
    m3Target,
    m3Result: m3Completed,
    m3Remain,
    m3InSystem: m3Total,
    m3Ratio,
    m3Items: m3RemainingItems,

    // Totals
    totalTarget,
    totalRemain,
    totalResult,
    totalInSystem,
    totalRatio,
    targetMorning: m1Morning,
    targetEvening: m1Evening,
    remain: totalRemain,
    result: totalResult,
    ratio: totalRatio,
    inSystem: totalInSystem,

    // All remaining items (for detailed list)
    stockoutYetConfirm: m1RemainingItems,
    noCreateHandOver: m2RemainingItems,
    stockOutNoteNotConfirmed: m3RemainingItems
  };
};

// ============================================================
// 📌 FORMAT STOCKOUT MESSAGE
// ============================================================

const formatStockoutMessage = (unit, data, customNote = '') => {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  let unitData = data;
  if (data && data.units && data.units[unit]) {
    unitData = data.units[unit];
  } else if (!data || data.totalTarget === undefined) {
    const localData = getUnitData(unit);
    if (localData) unitData = localData;
  }

  const m1Target = unitData.m1Target || 0;
  const m1Morning = unitData.m1Morning || 0;
  const m1Evening = unitData.m1Evening || 0;
  const m1Result = unitData.m1Result || 0;
  const m1Remain = unitData.m1Remain || 0;
  const m1Ratio = unitData.m1Ratio || 0;
  const m1Items = unitData.m1Items || [];

  const m2Target = unitData.m2Target || 0;
  const m2Result = unitData.m2Result || 0;
  const m2Remain = unitData.m2Remain || 0;
  const m2Ratio = unitData.m2Ratio || 0;
  const m2Items = unitData.m2Items || [];

  const m3Target = unitData.m3Target || 0;
  const m3Result = unitData.m3Result || 0;
  const m3Remain = unitData.m3Remain || 0;
  const m3Ratio = unitData.m3Ratio || 0;
  const m3Items = unitData.m3Items || [];

  const totalResult = unitData.totalResult || 0;
  const totalRemain = unitData.totalRemain || 0;
  const totalRatio = unitData.totalRatio || 0;
  const totalInSystem = unitData.totalInSystem || 0;

  let message = `📊 <b>📋 CONFIRMED HAND OVER REPORT</b>\n`;
  message += `📍 <b>BRANCH</b> : ${unit}\n`;
  message += `🕐 <b>TIME</b>   : ${time}\n`;
  message += `📅 <b>DATE</b>   : ${date}\n`;
  message += `\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  message += `📈 <b>📊 OVERALL KPI SUMMARY</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🌅 Target ព្រឹក  : ${m1Morning}\n`;
  message += `│ 🌙 Target ល្ងាច : ${m1Evening}\n`;
  message += `│ ✅ Result       : ${totalResult}\n`;
  message += `│ 📋 Remain      : ${totalRemain}\n`;
  message += `│ 📊 Ratio       : ${typeof totalRatio === 'number' ? totalRatio.toFixed(1) : totalRatio}%\n`;
  message += `│ 📦 In System   : ${totalInSystem}\n`;
  message += `└─────────────────────────┘\n\n`;

  // Module 1
  message += `<b>📦 1. STOCKOUT YET CONFIRM</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🎯 Target    : ${m1Target}\n`;
  message += `│ ✅ Result    : ${m1Result}\n`;
  message += `│ 📋 Remain    : ${m1Remain}\n`;
  message += `│ 📊 Ratio     : ${typeof m1Ratio === 'number' ? m1Ratio.toFixed(1) : m1Ratio}%\n`;
  message += `└─────────────────────────┘\n`;
  if (m1Items.length > 0) {
    message += `\n<b>📋 REMAINING ITEMS:</b>\n`;
    m1Items.slice(0, 10).forEach((item, index) => {
      const fullExportNo = (item.exportCode && item.exportCode !== '-' ? item.exportCode : '') + (item.exportNo && item.exportNo !== '-' ? item.exportNo : '') || '-';
      message += `┌─────────────────────────┐\n`;
      message += `│ ${index + 1}. ${escapeHtml(fullExportNo)}\n`;
      message += `│ └─Group Receiver: ${escapeHtml(item.groupReceiver)}\n`;
      message += `│ └─ Q'ty Day: ${item.daysDiff || 0}\n`;
      message += `└─────────────────────────┘\n`;
    });
    if (m1Items.length > 10) {
      message += `┌─────────────────────────┐\n`;
      message += `│ ... and ${m1Items.length - 10} more\n`;
      message += `└─────────────────────────┘\n`;
    }
  } else {
    message += `\n┌─────────────────────────┐\n│ ✅ All completed!\n└─────────────────────────┘\n`;
  }
  message += `\n`;

  // Module 2
  message += `<b>📝 2. NO CREATE HAND OVER</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🎯 Target    : ${m2Target}\n`;
  message += `│ ✅ Result    : ${m2Result}\n`;
  message += `│ 📋 Remain    : ${m2Remain}\n`;
  message += `│ 📊 Ratio     : ${typeof m2Ratio === 'number' ? m2Ratio.toFixed(1) : m2Ratio}%\n`;
  message += `└─────────────────────────┘\n`;
  if (m2Items.length > 0) {
    message += `\n<b>📋 REMAINING ITEMS:</b>\n`;
    m2Items.slice(0, 10).forEach((item, index) => {
      message += `┌─────────────────────────┐\n`;
      message += `│ ${index + 1}. ${escapeHtml(item.code)}\n`;
      message += `│ └─Recipient: ${escapeHtml(item.recipient)}\n`;
      message += `│ └─ Creator: ${escapeHtml(item.creator)}\n`;
      message += `│ └─ Q'ty of Day: ${item.daysDiff || 0}\n`;
      message += `└─────────────────────────┘\n`;
    });
    if (m2Items.length > 10) {
      message += `┌─────────────────────────┐\n`;
      message += `│ ... and ${m2Items.length - 10} more\n`;
      message += `└─────────────────────────┘\n`;
    }
  } else {
    message += `\n┌─────────────────────────┐\n│ ✅ All completed!\n└─────────────────────────┘\n`;
  }
  message += `\n`;

  // Module 3
  message += `<b>⚠️ 3. STOCK OUT NOTE - NOT CONFIRMED</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🎯 Target    : ${m3Target}\n`;
  message += `│ ✅ Result    : ${m3Result}\n`;
  message += `│ 📋 Remain    : ${m3Remain}\n`;
  message += `│ 📊 Ratio     : ${typeof m3Ratio === 'number' ? m3Ratio.toFixed(1) : m3Ratio}%\n`;
  message += `└─────────────────────────┘\n`;
  if (m3Items.length > 0) {
    message += `\n<b>📋 REMAINING ITEMS:</b>\n`;
    m3Items.slice(0, 10).forEach((item, index) => {
      message += `┌─────────────────────────┐\n`;
      message += `│ ${index + 1}. ${escapeHtml(item.code)}\n`;
      message += `│ └─ Unit confirm handover: ${escapeHtml(item.unitConfirm)}\n`;
      message += `│ └─ Q'ty of Day: ${item.daysDiff || 0}\n`;
      message += `└─────────────────────────┘\n`;
    });
    if (m3Items.length > 10) {
      message += `┌─────────────────────────┐\n`;
      message += `│ ... and ${m3Items.length - 10} more\n`;
      message += `└─────────────────────────┘\n`;
    }
  } else {
    message += `\n┌─────────────────────────┐\n│ ✅ All completed!\n└─────────────────────────┘\n`;
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

  message += `📈 <b>KPI SUMMARY</b>\n`;
  message += `┌─────────────────────────┐\n`;
  message += `│ 🌅 Target ព្រឹក: ${targetMorning}\n`;
  message += `│ 🌙 Target ល្ងាច: ${targetEvening}\n`;
  message += `│ 📋 Remain    : ${remain}\n`;
  message += `│ ✅ Result    : ${result}\n`;
  message += `│ 📊 Ratio     : ${typeof ratio === 'number' ? ratio.toFixed(1) : ratio}%\n`;
  message += `│ 📦 In System  : ${inSystem}\n`;
  message += `└─────────────────────────┘\n\n`;

  // Restock In
  message += `<b>RESTOCK IN✅</b>\n`;
  if (unsignedInItems.length > 0) {
    unsignedInItems.slice(0, 10).forEach((item, index) => {
      message += `┌─────────────────────────┐\n`;
      message += `│ ${index + 1}. ${escapeHtml(item.code || item.importRequestCode || '-')}\n`;
      message += `│ └─ Q'ty Day: ${item.daysDiff || 0} days\n`;
      message += `│    🏠 ${escapeHtml(item.warehouse || item.unitRequests || '-')}\n`;
      message += `│    📌 ${escapeHtml(item.statusCA || 'Unsigned')}\n`;
      message += `│    👤 ${escapeHtml(item.creator || '-')}\n`;
      message += `└─────────────────────────┘\n`;
    });
    if (unsignedInItems.length > 10) {
      message += `┌─────────────────────────┐\n│ ... and ${unsignedInItems.length - 10} more\n└─────────────────────────┘\n`;
    }
  } else {
    message += `┌─────────────────────────┐\n│ 📋 No unsigned documents\n└─────────────────────────┘\n`;
  }
  message += `\n`;

  // Restock Out
  message += `<b>RESTOCK OUT✅</b>\n`;
  if (unsignedOutItems.length > 0) {
    unsignedOutItems.slice(0, 10).forEach((item, index) => {
      message += `┌─────────────────────────┐\n`;
      message += `│ ${index + 1}. ${escapeHtml(item.code || item.exportNoteCode || '-')}\n`;
      message += `│ └─ Q'ty Day: ${item.daysDiff || 0} days\n`;
      message += `│    🏠 ${escapeHtml(item.warehouse || item.exportWarehouse || '-')}\n`;
      message += `│    📌 ${escapeHtml(item.statusCA || 'Unsigned')}\n`;
      message += `│    👤 ${escapeHtml(item.creator || item.createRequester || '-')}\n`;
      message += `└─────────────────────────┘\n`;
    });
    if (unsignedOutItems.length > 10) {
      message += `┌─────────────────────────┐\n│ ... and ${unsignedOutItems.length - 10} more\n└─────────────────────────┘\n`;
    }
  } else {
    message += `┌─────────────────────────┐\n│ 📋 No unsigned documents\n└─────────────────────────┘\n`;
  }
  message += `\n`;

  message += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (customNote && customNote.trim()) {
    message += `📝 <b>NOTE:</b>\n${escapeHtml(customNote.trim())}\n\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }
  message += `<i>Report generated from Restock In & Restock Out Dashboard</i>`;

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
  message += `<b>EXPORT CA✅</b>\n`;
  if (unsignedOutItems.length > 0) {
    unsignedOutItems.slice(0, 10).forEach((item, index) => {
      message += `┌─────────────────────────┐\n`;
      message += `│ ${index + 1}. ${escapeHtml(item.code || item.exportNoteCode || '-')}\n`;
      message += `│ └─ Q'ty Day: ${item.daysDiff || 0} days\n`;
      message += `│    🏠 ${escapeHtml(item.warehouse || item.exportWarehouse || '-')}\n`;
      message += `│    📌 ${escapeHtml(item.statusCA || 'Unsigned')}\n`;
      message += `│    👤 ${escapeHtml(item.creator || item.createRequester || '-')}\n`;
      message += `└─────────────────────────┘\n`;
    });
    if (unsignedOutItems.length > 10) {
      message += `┌─────────────────────────┐\n│ ... and ${unsignedOutItems.length - 10} more\n└─────────────────────────┘\n`;
    }
  } else {
    message += `┌─────────────────────────┐\n│ 📋 No unsigned documents\n└─────────────────────────┘\n`;
  }
  message += `\n`;

  // Import CA
  message += `<b>IMPORT CA✅</b>\n`;
  if (unsignedInItems.length > 0) {
    unsignedInItems.slice(0, 10).forEach((item, index) => {
      message += `┌─────────────────────────┐\n`;
      message += `│ ${index + 1}. ${escapeHtml(item.code || item.codeReceipt || '-')}\n`;
      message += `│ └─ Q'ty Day: ${item.daysDiff || 0} days\n`;
      message += `│    🏠 ${escapeHtml(item.warehouse || '-')}\n`;
      message += `│    📌 ${escapeHtml(item.statusCA || 'Unsigned')}\n`;
      message += `│    👤 ${escapeHtml(item.creator || '-')}\n`;
      message += `└─────────────────────────┘\n`;
    });
    if (unsignedInItems.length > 10) {
      message += `┌─────────────────────────┐\n│ ... and ${unsignedInItems.length - 10} more\n└─────────────────────────┘\n`;
    }
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

const sendMessageToTelegram = async (unit, message, signal = null) => {
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
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    console.log(`📤 Sending to ${unit}...`);
    
    // Timeout 15 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
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
    
    clearTimeout(timeoutId);
    const result = await response.json();
    const duration = Date.now() - startTime;
    
    if (result.ok) {
      console.log(`✅ Sent to ${unit} (${duration}ms)`);
      return { success: true, result, duration };
    } else {
      console.error(`❌ Failed to send to ${unit}: ${result.description}`);
      return { success: false, error: result.description, duration };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    if (error.name === 'AbortError') {
      return { success: false, error: 'Timeout (15s)', aborted: true, duration };
    }
    console.error(`❌ Error sending to ${unit}:`, error);
    return { success: false, error: error.message, duration };
  }
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

      // Get data for this unit
      const unitData = getUnitData(unit);
      
      // Send to Telegram
      const result = await sendToTelegram(unit, unitData, customNote, signal);

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
  const testData = getUnitData(unit);
  return await sendToTelegram(unit, testData);
};

export const sendTestToAll = async (onProgress) => {
  return await sendToAllTelegram(null, onProgress);
};

// ============================================================
// 📌 EXPORT: NOTE TEMPLATES DATABASE API
// ============================================================

const getBackendBaseUrl = () => {
  const host = window.location.hostname || 'localhost';
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:8000/api';
  }
  return 'https://gis-kpi-backend.onrender.com/api';
};

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
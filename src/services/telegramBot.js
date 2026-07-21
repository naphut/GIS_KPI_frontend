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

// Group IDs for each province (NEW)
// Group IDs for each province
// Group IDs for each province (NEW)
const GROUP_IDS = {
  'BAN': '-5586791976',
  'BAT': '-1004433153728',
  'CHA': '-5420693532',
  'CHH': '-5387431077',
  'KAM': '-5482545376',
  'KAN': '-5236231454',
  'KANZ1': '-5274252058',
  'KOH': '-5145897116',
  'KRA': '-5593536064',
  'MON': '-5319493942',
  'ODD': '-4995836337',
  'PNP': '-5359041682',
  'PNPZ1': '-5588093737',
  'PNPZ2': '-1004382725579',
  'PRE': '-5428590077',
  'PRH': '-5250837883',
  'PUR': '-5562024723',
  'ROT': '-5358830807',
  'SIE': '-5558011159',
  'SIH': '-5074490053',
  'SPE': '-5460603162',
  'STU': '-5339037019',
  'SVA': '-1004477126515',
  'TAK': '-5519166799',
  'THO': '-5163441169',
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

export const cleanWarehouseName = (name) => {
  if (!name || name === '-') return '-';
  if (typeof name !== 'string') name = String(name);
  
  let trimmed = name.trim().toUpperCase();
  
  // Normalize typos
  trimmed = trimmed
    .replace(/PNPZI/g, 'PNPZ1')
    .replace(/PNP_ZI/g, 'PNPZ1')
    .replace(/PNP-ZI/g, 'PNPZ1')
    .replace(/KANZ1/g, 'KANZ1')
    .replace(/TEAMD(\d+)/gi, 'TEAM0$1')
    .replace(/FB_TEAMC/g, 'FBC')
    .replace(/FB_TEAM/g, 'FBC');
  
  // 1. Determine Province/Unit code
  let province = 'UNK';
  const gisMatch = trimmed.match(/^GIS_([A-Z0-9]+)/i);
  if (gisMatch) {
    province = gisMatch[1];
  } else {
    const directMatch = trimmed.match(/^([A-Z0-9]+)_/i);
    if (directMatch) {
      province = directMatch[1];
    }
  }

  // 2. Planning Department check
  if (trimmed.includes('PLANNING') || trimmed.includes('_PLA')) {
    return `${province}_PLA_PLANNING DEPT`;
  }

  // Check if this province uses the _TEAM format
  // PNP, PNPZ1, PNPZ2, KAN, KANZ1 all start with PNP or KAN
  const isPnpOrKan = province.startsWith('PNP') || province.startsWith('KAN');

  // 3. FBC Team check: Find "FBC" followed by optional non-digits, then digits
  const fbcMatch = trimmed.match(/FBC[^\d]*(\d+)/i);
  if (fbcMatch) {
    const num = String(parseInt(fbcMatch[1])).padStart(2, '0');
    if (isPnpOrKan) {
      return `GIS_${province}_FBC_TEAM${num}`;
    }
    return `GIS_${province}_FBCTEAM${num}`;
  }

  // 4. SOS Team check: Find "SOS" followed by optional non-digits, then digits
  const sosMatch = trimmed.match(/SOS[^\d]*(\d+)/i);
  if (sosMatch) {
    const num = String(parseInt(sosMatch[1])).padStart(2, '0');
    if (isPnpOrKan) {
      return `GIS_${province}_SOS_TEAM${num}`;
    }
    return `GIS_${province}_SOSTEAM${num}`;
  }

  return trimmed;
};

// ============================================================
// 📌 TEAM → UNIT EXPLICIT LOOKUP TABLE
// PNP zone: SOS/PLA/TEC → PNP, FBC01/03/05/06/07/10/11/13/14 → PNPZ1, FBC02/04/08/09/12 → PNPZ2
// KAN zone: SOS/PLA/TEC → KAN, FBC → KANZ1
// ============================================================

export const getUnitFromTeam = (teamName) => {
  if (!teamName || teamName === '-') return null;
  const upper = teamName.toUpperCase().trim();

  // Priority Check: Match PNPZ1, PNPZ2, KANZ1 BEFORE generic PNP or KAN!
  if (upper.includes('PNPZ1') || upper.includes('PNP_Z1') || upper.includes('PNP-Z1') || upper.includes('PNP Z1')) return 'PNPZ1';
  if (upper.includes('PNPZ2') || upper.includes('PNP_Z2') || upper.includes('PNP-Z2') || upper.includes('PNP Z2')) return 'PNPZ2';
  if (upper.includes('KANZ1') || upper.includes('KAN_Z1') || upper.includes('KAN-Z1') || upper.includes('KAN Z1')) return 'KANZ1';

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

export const getTeamFromRecipient = (recipient) => {
  if (!recipient || recipient === '-') return '-';
  
  let upper = recipient.toUpperCase().trim();
  upper = upper.replace(/FB_TEAMC/g, 'FBC')
               .replace(/FB_TEAM/g, 'FBC')
               .replace(/FBCO/g, 'FBC')
               .replace(/FBC012/g, 'FBC12')
               .replace(/FB012/g, 'FBC12')
               .replace(/FB(\d+)/g, 'FBC$1');
  
  // Find FBC or SOS team number
  let teamNum = '';
  let teamType = '';
  
  const fbcMatch = upper.match(/FBC[^\d]*(\d+)/);
  if (fbcMatch) {
    teamType = 'FBC';
    teamNum = String(parseInt(fbcMatch[1])).padStart(2, '0');
  } else {
    const sosMatch = upper.match(/SOS[^\d]*(\d+)/);
    if (sosMatch) {
      teamType = 'SOS';
      teamNum = String(parseInt(sosMatch[1])).padStart(2, '0');
    }
  }
  
  if (teamType && teamNum) {
    // Detect province abbreviation from the raw name (always GIS_PNP_... or GIS_KAN_...)
    let province = '';
    const gisProvince = upper.match(/GIS_([A-Z]+)_/);
    if (gisProvince) {
      province = gisProvince[1]; // e.g. "PNP" or "KAN"
    } else {
      const units = [
        'BAN','BAT','CHA','CHH','KAM','KOH','KRA','MON','ODD',
        'PNP','PRE','PRH','PUR','ROT','SIE','SIH','SPE','STU',
        'SVA','TAK','THO','KAN'
      ].sort((a, b) => b.length - a.length);
      for (const u of units) {
        if (new RegExp(`(^|_)${u}($|_)`).test(upper)) { province = u; break; }
      }
    }
    if (province) {
      return `GIS_${province}_${teamType}${teamNum}`;
    }
  }
  
  upper = upper.replace(/_TEAM(\d+)/i, '$1');
  upper = upper.replace(/TEAM(\d+)/i, '$1');
  return upper;
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

    // ─── DYNAMIC ITEM UNIT RESOLVER ───
    const getItemUnit1 = (item) => {
      const rawTeam = (item.team && item.team !== '-') ? item.team : (item.groupReceiver && item.groupReceiver !== '-' ? item.groupReceiver : (item.stockReceiver || '-'));
      const cleanTeam = getTeamFromRecipient(rawTeam);
      const teamUnit = getUnitFromTeam(cleanTeam);
      if (teamUnit) return teamUnit;
      return item.unit || 'OTHER';
    };

    const getItemUnit2 = (item) => {
      const rawTeam = (item.team && item.team !== '-') ? item.team : (item.recipient || '-');
      const cleanTeam = getTeamFromRecipient(rawTeam);
      const teamUnit = getUnitFromTeam(cleanTeam);
      if (teamUnit) return teamUnit;
      return item.unit || 'OTHER';
    };

    const getItemUnit3 = (item) => {
      const rawTeam = (item.team && item.team !== '-') ? item.team : (item.unitConfirm || '-');
      const cleanTeam = getTeamFromRecipient(rawTeam);
      const teamUnit = getUnitFromTeam(cleanTeam);
      if (teamUnit) return teamUnit;
      return item.unit || 'OTHER';
    };

    // ─── FILTER BY UNIT ───
    const unitStockout = stockoutData.filter(item => getItemUnit1(item) === unit);
    const unitNocreate = nocreateData.filter(item => getItemUnit2(item) === unit);
    const unitNotconfirmed = notconfirmedData.filter(item => getItemUnit3(item) === unit);

    const isMorning = new Date().getHours() < 12;

    // ─── CALCULATE MODULE 1: STOCKOUT YET CONFIRM ───
    const m1MorningConfig = stockoutTargets[unit]?.morning || 0;
    const m1EveningConfig = stockoutTargets[unit]?.evening || 0;
    const m1Morning = m1MorningConfig > 0 ? m1MorningConfig : unitStockout.length;
    const m1Evening = m1EveningConfig > 0 ? m1EveningConfig : (m1Morning * 2);
    const m1Target = isMorning ? m1Morning : (m1Evening > 0 ? m1Evening : m1Morning);
    const m1Total = unitStockout.length;
    const m1Completed = stockoutHistory.filter(c => c.unit === unit || (c.team && getUnitFromTeam(c.team) === unit)).length;
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
        creator: item.creator || '-',
        team: item.team || '-'
      }));

    // ─── CALCULATE MODULE 2: NO CREATE HAND OVER ───
    const m2MorningConfig = nocreateTargets[unit]?.morning || 0;
    const m2EveningConfig = nocreateTargets[unit]?.evening || 0;
    const m2Morning = m2MorningConfig > 0 ? m2MorningConfig : unitNocreate.length;
    const m2Evening = m2EveningConfig > 0 ? m2EveningConfig : (m2Morning * 2);
    const m2Target = isMorning ? m2Morning : (m2Evening > 0 ? m2Evening : m2Morning);
    const m2Total = unitNocreate.length;
    let m2Completed = nocreateHistory.filter(c => c.unit === unit || (c.team && getUnitFromTeam(c.team) === unit)).length;
    Object.entries(nocreateConfirmed).forEach(([code, confirmed]) => {
      if (confirmed) {
        const item = nocreateData.find(d => d.code === code);
        if (item && getItemUnit2(item) === unit) m2Completed++;
      }
    });
    const m2Remain = m2Target > 0 ? Math.max(0, m2Target - m2Completed) : m2Total;
    const m2Ratio = m2Target > 0 ? parseFloat(((m2Completed / m2Target) * 100).toFixed(2)) : (m2Remain === 0 && m2Completed === 0 ? 100 : 0);

    const m2RemainingItems = unitNocreate
      .filter(item => !nocreateHistory.some(c => c.code === item.code) && !nocreateConfirmed[item.code])
      .map(item => ({
        code: item.code || '-',
        warehouse: item.warehouse || '-',
        recipient: item.recipient || '-',
        creator: item.creator || '-',
        date: item.date || '-',
        status: item.status || 'Pending',
        daysDiff: item.daysDiff || calculateDaysDiff(item.date),
        team: item.team || getTeamFromRecipient(item.recipient || item.warehouse || '-'),
        unit: item.unit || unit
      }));

    // ─── CALCULATE MODULE 3: STOCK OUT NOTE - NOT CONFIRMED ───
    const m3MorningConfig = notconfirmedTargets[unit]?.morning || 0;
    const m3EveningConfig = notconfirmedTargets[unit]?.evening || 0;
    const m3Morning = m3MorningConfig > 0 ? m3MorningConfig : unitNotconfirmed.length;
    const m3Evening = m3EveningConfig > 0 ? m3EveningConfig : (m3Morning * 2);
    const m3Target = isMorning ? m3Morning : (m3Evening > 0 ? m3Evening : m3Morning);
    const m3Total = unitNotconfirmed.length;
    let m3Completed = notconfirmedHistory.filter(c => c.unit === unit || (c.team && getUnitFromTeam(c.team) === unit)).length;
    Object.entries(notconfirmedConfirmed).forEach(([code, confirmed]) => {
      if (confirmed) {
        const item = notconfirmedData.find(d => d.code === code);
        if (item && getItemUnit3(item) === unit) m3Completed++;
      }
    });
    const m3Remain = m3Target > 0 ? Math.max(0, m3Target - m3Completed) : m3Total;
    const m3Ratio = m3Target > 0 ? parseFloat(((m3Completed / m3Target) * 100).toFixed(2)) : (m3Remain === 0 && m3Completed === 0 ? 100 : 0);

    const m3RemainingItems = unitNotconfirmed
      .filter(item => !notconfirmedHistory.some(c => c.code === item.code) && !notconfirmedConfirmed[item.code])
      .map(item => ({
        code: item.code || '-',
        type: item.type || '-',
        handoverUnit: item.handoverUnit || '-',
        unitConfirm: item.unitConfirm || '-',
        date: item.date || '-',
        status: item.status || 'Pending',
        daysDiff: item.daysDiff || calculateDaysDiff(item.date),
        warehouse: item.handoverUnit || item.unitConfirm || '-',
        creator: item.creator || '-',
        team: item.team || getTeamFromRecipient(item.unitConfirm || item.handoverUnit || '-'),
        unit: item.unit || unit
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
  // Get data from parameter or from database
  let unitData = data;
  if (data && data.units && data.units[unit]) {
    unitData = data.units[unit];
  } else if (!data || data.totalTarget === undefined) {
    return `⚠️ No data available for ${unit}. Please sync data first.`;
  }

  const m1Items = unitData.m1Items || [];
  const m2Items = unitData.m2Items || [];
  const m3Items = unitData.m3Items || [];

  const totalPending = m1Items.length + m2Items.length + m3Items.length;

  if (totalPending === 0) {
    return `✅ <b>No pending items for all teams!</b>`;
  }

  // Helper to group items by team for a given module
  const groupByTeam = (items, getTeamFn) => {
    const map = {};
    items.forEach(item => {
      const rawTeam = getTeamFn(item);
      const team = getTeamFromRecipient(rawTeam);
      if (!map[team]) map[team] = [];
      map[team].push(item);
    });
    return map;
  };

  const parts = [];

  // STEP 1 Section (Stockout Yet Confirm)
  if (m1Items.length > 0) {
    const m1Groups = groupByTeam(m1Items, item => item.team && item.team !== '-' ? item.team : (item.groupReceiver || item.warehouse || '-'));
    const m1Teams = Object.keys(m1Groups).sort((a, b) => a.localeCompare(b));
    let stepMsg = `🔹 <b>STEP 1</b>\n`;
    m1Teams.forEach(team => {
      stepMsg += `👥 <b>TEAM:</b> <code>${escapeHtml(team)}</code>\n`;
      m1Groups[team].forEach(item => {
        const days = parseInt(item.daysDiff) || 0;
        stepMsg += ` • <code>${escapeHtml(item.exportNo)}(${days}d)</code>\n`;
      });
    });
    parts.push(stepMsg);
  }

  // STEP 2 Section (No Create Handover)
  if (m2Items.length > 0) {
    const m2Groups = groupByTeam(m2Items, item => item.team || item.recipient);
    const m2Teams = Object.keys(m2Groups).sort((a, b) => a.localeCompare(b));
    let stepMsg = `🔸 <b>STEP 2</b>\n`;
    m2Teams.forEach(team => {
      stepMsg += `👥 <b>TEAM:</b> <code>${escapeHtml(team)}</code>\n`;
      m2Groups[team].forEach(item => {
        const days = parseInt(item.daysDiff) || 0;
        stepMsg += ` • <code>${escapeHtml(item.code)}(${days}d)</code>\n`;
      });
    });
    parts.push(stepMsg);
  }

  // STEP 3 Section (Handover Not Confirmed)
  if (m3Items.length > 0) {
    const m3Groups = groupByTeam(m3Items, item => item.team || item.unitConfirm);
    const m3Teams = Object.keys(m3Groups).sort((a, b) => a.localeCompare(b));
    let stepMsg = `🔺 <b>STEP 3</b>\n`;
    m3Teams.forEach(team => {
      stepMsg += `👥 <b>TEAM:</b> <code>${escapeHtml(team)}</code>\n`;
      m3Groups[team].forEach(item => {
        const days = parseInt(item.daysDiff) || 0;
        stepMsg += ` • <code>${escapeHtml(item.code)}(${days}d)</code>\n`;
      });
    });
    parts.push(stepMsg);
  }

  let message = parts.join('[SPLIT]\n');
  message += `\n📊 <b>ចំនួនសរុប៖</b> ${totalPending} Items\n`;

  if (customNote && customNote.trim()) {
    message += `━━━━━━━━━━━━━━━━━━━━━━━\n📝 <b>NOTE:</b>\n${escapeHtml(customNote.trim())}\n`;
  }

  return message.trim();
};

// ============================================================
// 📌 FORMAT RESTOCK MESSAGE (Restock In + Restock Out)
// ============================================================

const formatRestockMessage = (unit, data, customNote = '') => {
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
  message += `📍 <b>BRANCH : ${unit}</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;

  message += `📈 <b>KPI SUMMARY (RESTOCK)</b>\n`;
  message += `<code>`;
  message += `│ 🌅 Target ព្រឹក   : ${targetMorning}\n`;
  message += `│ 🌙 Target ល្ងាច  : ${targetEvening}\n`;
  message += `│ 📋 Remain        : ${remain}\n`;
  message += `│ ✅ Result        : ${result}\n`;
  message += `│ 📊 Ratio         : ${typeof ratio === 'number' ? ratio.toFixed(1) : ratio}%\n`;
  message += `│ 📦 In System     : ${inSystem}`;
  message += `</code>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;

  // Restock Out (EXPORT CA)
  message += `📤 <b>RESTOCK OUT</b> ✅\n`;
  if (unsignedOutItems.length > 0) {
    const outGroups = {};
    unsignedOutItems.forEach(item => {
      const g = cleanWarehouseName(item.groupRequest || '-');
      if (!outGroups[g]) {
        outGroups[g] = [];
      }
      outGroups[g].push(item);
    });

    Object.entries(outGroups).forEach(([groupRequest, items]) => {
      message += `[SPLIT]🔸 <b>Group Request: ${escapeHtml(groupRequest)}</b>\n`;
      items.forEach((item, index) => {
        message += `│ ${index + 1}. <code>${escapeHtml(item.code || '-')}</code> (${item.daysDiff || 0}d) ⚠️\n`;
      });
      message += `\n`;
    });
  }

  // Restock In (IMPORT CA)
  message += `📥 <b>RESTOCK IN</b> ✅\n`;
  if (unsignedInItems.length > 0) {
    const inGroups = {};
    unsignedInItems.forEach(item => {
      const u = cleanWarehouseName(item.unitRequests || '-');
      if (!inGroups[u]) {
        inGroups[u] = [];
      }
      inGroups[u].push(item);
    });

    Object.entries(inGroups).forEach(([unitRequests, items]) => {
      message += `[SPLIT]🔸 <b>Unit: ${escapeHtml(unitRequests)}</b>\n`;
      items.forEach((item, index) => {
        message += `│ ${index + 1}. <code>${escapeHtml(item.code || '-')}</code> (${item.daysDiff || 0}d) ⚠️\n`;
      });
      message += `\n`;
    });
  }

  message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (customNote && customNote.trim()) {
    message += `📝 <b>NOTE:</b>\n${escapeHtml(customNote.trim())}\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }
  message += `📊 <i>Report generated from Dashboard RESTOCK</i>`;

  return message;
};

export const getTeamFromWarehouse = (warehouse) => {
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
    return `GIS_${province}_SOS_TEAM${num}`;
  }

  const clean = upper.replace(/_TEAM(\d+)/i, '$1').replace(/TEAM(\d+)/i, '$1');
  return clean;
};

// ============================================================
// 📌 FORMAT CA MESSAGE (Export CA + Import CA)
// ============================================================

const formatCAMessage = (unit, data, customNote = '') => {
  let unitData = data;
  if (data && data.units && data.units[unit]) {
    unitData = data.units[unit];
  } else if (!data || data.totalTarget === undefined) {
    return `⚠️ No CA data available for ${unit}. Please sync data first.`;
  }

  const unsignedOutItems = unitData.unsignedOutItems || [];
  const unsignedInItems = unitData.unsignedInItems || [];
  const totalItems = unsignedOutItems.length + unsignedInItems.length;

  if (totalItems === 0) {
    return `✅ <b>No unsigned CA items for all teams!</b>`;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  let parts = [];
  let header = `📊 <b>SIGNED CA REPORT DETAILS</b>\n`;
  header += `📍 <b>BRANCH : ${unit}</b>\n`;
  header += `🕒 ${timeStr} | 📅 ${dateStr}\n`;
  header += `📋 <b>Total Pending:</b> ${totalItems} Items\n`;
  header += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
  parts.push(header);

  // 1. EXPORT CA Section
  if (unsignedOutItems.length > 0) {
    const outGroups = {};
    unsignedOutItems.forEach(item => {
      const rawTeam = item.team || getTeamFromWarehouse(item.unitEntering || item.exportWarehouse || '-');
      const team = getTeamFromRecipient(rawTeam);
      if (!outGroups[team]) outGroups[team] = [];
      outGroups[team].push(item);
    });

    const outTeams = Object.keys(outGroups).sort((a, b) => a.localeCompare(b));
    let exportMsg = `📤 <b>EXPORT CA (${unsignedOutItems.length} Items)</b>\n`;
    outTeams.forEach(team => {
      exportMsg += `[SPLIT]👥 <b>TEAM: ${escapeHtml(team)}</b>\n`;
      outGroups[team].forEach((item, idx) => {
        const days = parseInt(item.daysDiff) || 0;
        const code = item.exportNoteCode || item.code || item.noteCode || '-';
        const cmdCode = item.exportCommandCode || item.commandCode || '-';
        const requester = item.requester || item.creator || '-';
        const dateCreate = item.dateCreate || item.date || '-';
        const expWh = cleanWarehouseName(item.exportWarehouse || item.warehouse || '-');
        const unitEnt = cleanWarehouseName(item.unitEntering || item.enteringUnit || '-');
        const whEnt = cleanWarehouseName(item.warehouseEntering || item.enteringWarehouse || '-');
        const statusCA = item.statusCA || 'Unsigned';

        exportMsg += ` ${idx + 1}. <code>${escapeHtml(code)}</code> (<b>${days}d</b>)\n`;
        if (cmdCode && cmdCode !== '-') exportMsg += `    • Cmd Code: <code>${escapeHtml(cmdCode)}</code>\n`;
        if (requester && requester !== '-') exportMsg += `    • Requester: ${escapeHtml(requester)}\n`;
        if (dateCreate && dateCreate !== '-') exportMsg += `    • Date: ${escapeHtml(dateCreate)}\n`;
        if (expWh && expWh !== '-') exportMsg += `    • Exp WH: ${escapeHtml(expWh)}\n`;
        if (whEnt && whEnt !== '-') exportMsg += `    • WH Entering: ${escapeHtml(whEnt)}\n`;
        if (unitEnt && unitEnt !== '-') exportMsg += `    • Unit Entering: ${escapeHtml(unitEnt)}\n`;
        exportMsg += `    • Status CA: <b>${escapeHtml(statusCA)}</b>\n`;
        if (item.reason && item.reason !== '-') exportMsg += `    • Reason: ${escapeHtml(item.reason)}\n`;
        if (item.description && item.description !== '-') exportMsg += `    • Note: ${escapeHtml(item.description)}\n`;
        exportMsg += `\n`;
      });
    });
    parts.push(exportMsg);
  }

  // 2. IMPORT CA Section
  if (unsignedInItems.length > 0) {
    const inGroups = {};
    unsignedInItems.forEach(item => {
      const rawTeam = item.team || getTeamFromWarehouse(item.warehouse || '-');
      const team = getTeamFromRecipient(rawTeam);
      if (!inGroups[team]) inGroups[team] = [];
      inGroups[team].push(item);
    });

    const inTeams = Object.keys(inGroups).sort((a, b) => a.localeCompare(b));
    let importMsg = `📥 <b>IMPORT CA (${unsignedInItems.length} Items)</b>\n`;
    inTeams.forEach(team => {
      importMsg += `[SPLIT]👥 <b>TEAM: ${escapeHtml(team)}</b>\n`;
      inGroups[team].forEach((item, idx) => {
        const days = parseInt(item.daysDiff) || 0;
        const receiptCode = item.receiptCode || item.code || item.importCode || '-';
        const cmdCode = item.commandCode || item.importCommandCode || '-';
        const creator = item.creator || item.requester || '-';
        const dateStr = item.date || item.dateCreate || '-';
        const wh = cleanWarehouseName(item.warehouse || item.importWarehouse || '-');
        const statusCA = item.statusCA || 'Unsigned';

        importMsg += ` ${idx + 1}. <code>${escapeHtml(receiptCode)}</code> (<b>${days}d</b>)\n`;
        if (cmdCode && cmdCode !== '-') importMsg += `    • Cmd Code: <code>${escapeHtml(cmdCode)}</code>\n`;
        if (creator && creator !== '-') importMsg += `    • Creator: ${escapeHtml(creator)}\n`;
        if (dateStr && dateStr !== '-') importMsg += `    • Date: ${escapeHtml(dateStr)}\n`;
        if (wh && wh !== '-') importMsg += `    • Warehouse: ${escapeHtml(wh)}\n`;
        importMsg += `    • Status CA: <b>${escapeHtml(statusCA)}</b>\n`;
        importMsg += `\n`;
      });
    });
    parts.push(importMsg);
  }

  let message = parts.join('\n');
  if (customNote && customNote.trim()) {
    message += `\n━━━━━━━━━━━━━━━━━━━━━━━\n📝 <b>NOTE:</b>\n${escapeHtml(customNote.trim())}\n`;
  }

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
  // Clean up delimiter if message doesn't need splitting
  if (message.length <= 3900) {
    const cleanMessage = message.replaceAll('[SPLIT]', '');
    return await sendSingleMessageToTelegram(unit, cleanMessage, signal);
  }

  console.log(`✂️ Message is too long (${message.length} chars). Splitting into parts...`);
  
  // Split by the internal custom delimiter
  const separator = '[SPLIT]';
  const parts = message.split(separator);
  const messagesToSend = [];
  
  // parts[0] contains the header/summary info
  let currentMessage = parts[0];

  for (let i = 1; i < parts.length; i++) {
    const itemCard = parts[i]; // Do not add back the [SPLIT] delimiter
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
  let unitData = data;
  if (data && data.units && data.units[unit]) {
    unitData = data.units[unit];
  }
  const m1Items = unitData?.m1Items || [];
  const m2Items = unitData?.m2Items || [];
  const m3Items = unitData?.m3Items || [];
  const totalPending = m1Items.length + m2Items.length + m3Items.length;

  if (totalPending === 0) {
    return {
      success: true,
      skipped: true,
      error: `No pending items for ${unit}`
    };
  }

  const message = formatStockoutMessage(unit, data, customNote);
  const result = await sendMessageToTelegram(unit, message, signal);

  // 📌 Automatically attach 3-sheet Excel file (.xlsx) containing all columns & details
  try {
    const excelBlob = generateStockoutExcelBlob(m1Items, m2Items, m3Items, unit);
    const filename = `STOCKOUT_${unit}_${new Date().toISOString().slice(0, 10)}.xls`;
    await sendDocumentToTelegram(unit, excelBlob, filename, '', signal);
  } catch (excelErr) {
    console.error('Error attaching Stockout Excel document to Telegram:', excelErr);
  }

  return result;
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

      if (result.skipped) {
        if (onProgress) {
          onProgress({
            current: completedCount,
            total: units.length,
            unit: unit,
            status: 'skipped',
            message: `Skipped ${unit} (No data)`
          });
        }
      } else if (result.success) {
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
      details: results.map(r => `${r.unit}: ${r.skipped ? '⏭️ Skipped (0 items)' : (r.success ? '✅' : '❌')} ${r.error || ''}`)
    }
  };
};

// ============================================================
// ============================================================
// 📌 EXPORT: RESTOCK FUNCTIONS - SEQUENTIAL
// ============================================================

export const sendRestockToTelegram = async (unit, data, customNote = '', signal = null) => {
  let unitData = data;
  if (data && data.units && data.units[unit]) {
    unitData = data.units[unit];
  }
  const unsignedInItems = unitData?.unsignedInItems || [];
  const unsignedOutItems = unitData?.unsignedOutItems || [];
  const totalItems = unsignedInItems.length + unsignedOutItems.length;

  if (totalItems === 0) {
    return {
      success: true,
      skipped: true,
      error: `No pending items for ${unit}`
    };
  }

  const message = formatRestockMessage(unit, data, customNote);
  const result = await sendMessageToTelegram(unit, message, signal);

  // 📌 Automatically attach 2-sheet Excel file (.xlsx) containing all columns & details
  try {
    const excelBlob = generateSignedCAExcelBlob(unsignedOutItems, unsignedInItems, unit);
    const filename = `RESTOCK_CA_${unit}_${new Date().toISOString().slice(0, 10)}.xls`;
    await sendDocumentToTelegram(unit, excelBlob, filename, '', signal);
  } catch (excelErr) {
    console.error('Error attaching Restock Excel document to Telegram:', excelErr);
  }

  return result;
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

      if (result.skipped) {
        if (onProgress) {
          onProgress({
            current: completedCount,
            total: units.length,
            unit: unit,
            status: 'skipped',
            message: `Skipped ${unit} (No data)`
          });
        }
      } else if (result.success) {
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
      details: results.map(r => `${r.unit}: ${r.skipped ? '⏭️ Skipped (0 items)' : (r.success ? '✅' : '❌')} ${r.error || ''}`)
    }
  };
};

// ============================================================
// 📌 EXPORT: CA FUNCTIONS - SEQUENTIAL
// ============================================================

export const sendCAToTelegram = async (unit, data, customNote = '', signal = null) => {
  let unitData = data;
  if (data && data.units && data.units[unit]) {
    unitData = data.units[unit];
  }
  const unsignedOutItems = unitData?.unsignedOutItems || [];
  const unsignedInItems = unitData?.unsignedInItems || [];
  const totalItems = unsignedOutItems.length + unsignedInItems.length;

  if (totalItems === 0) {
    return {
      success: true,
      skipped: true,
      error: `No pending items for ${unit}`
    };
  }

  const message = formatCAMessage(unit, data, customNote);
  const result = await sendMessageToTelegram(unit, message, signal);

  // 📌 Automatically attach 2-sheet Excel file (.xlsx) containing all columns & details
  try {
    const excelBlob = generateSignedCAExcelBlob(unsignedOutItems, unsignedInItems, unit);
    const filename = `SIGNED_CA_${unit}_${new Date().toISOString().slice(0, 10)}.xls`;
    await sendDocumentToTelegram(unit, excelBlob, filename, '', signal);
  } catch (excelErr) {
    console.error('Error attaching Signed CA Excel document to Telegram:', excelErr);
  }

  return result;
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

      if (result.skipped) {
        if (onProgress) {
          onProgress({
            current: completedCount,
            total: units.length,
            unit: unit,
            status: 'skipped',
            message: `Skipped ${unit} (No data)`
          });
        }
      } else if (result.success) {
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
      details: results.map(r => `${r.unit}: ${r.skipped ? '⏭️ Skipped (0 items)' : (r.success ? '✅' : '❌')} ${r.error || ''}`)
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

// ============================================================
// 📌 SEND PHOTO TO TELEGRAM - FOR SCREENSHOTS
// ============================================================

export const sendPhotoToTelegram = async (unit, photoBlob, caption = '', signal = null) => {
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
    const directUrl = `https://api.telegram.org/bot${token}/sendPhoto`;
    
    const formData = new FormData();
    formData.append('chat_id', groupId);
    formData.append('photo', photoBlob, 'screenshot.png');
    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout for upload

    const directResponse = await fetch(directUrl, {
      method: 'POST',
      body: formData,
      signal: signal || controller.signal
    });

    const directResult = await directResponse.json();
    const duration = Date.now() - startTime;
    clearTimeout(timeoutId);

    if (directResult.ok) {
      console.log(`✅ Sent photo directly to ${unit} (${duration}ms)`);
      return { success: true, result: directResult, duration };
    } else {
      console.warn(`⚠️ sendPhoto failed (${directResult.description}). Trying sendDocument fallback for ${unit}...`);

      // 📌 Fallback: Send as Document file (bypasses Telegram photo dimension & aspect ratio limits)
      const docUrl = `https://api.telegram.org/bot${token}/sendDocument`;
      const docFormData = new FormData();
      docFormData.append('chat_id', groupId);
      docFormData.append('document', photoBlob, `${unit}_screenshot_report.png`);
      if (caption) {
        docFormData.append('caption', caption);
        docFormData.append('parse_mode', 'HTML');
      }

      const docResponse = await fetch(docUrl, {
        method: 'POST',
        body: docFormData,
        signal: signal || controller.signal
      });

      const docResult = await docResponse.json();
      const totalDuration = Date.now() - startTime;
      clearTimeout(timeoutId);

      if (docResult.ok) {
        console.log(`✅ Sent screenshot document fallback to ${unit} (${totalDuration}ms)`);
        return { success: true, result: docResult, duration: totalDuration };
      }

      console.error(`❌ Failed to send photo and document fallback to ${unit}: ${directResult.description}`);
      return { success: false, error: directResult.description, duration: totalDuration };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    if (error.name === 'AbortError') {
      return { success: false, error: 'Timeout (25s)', aborted: true, duration };
    }
    console.error(`❌ Error sending photo to ${unit}:`, error);
    return { success: false, error: error.message, duration };
  }
};

// ============================================================
// 📌 SEND DOCUMENT (EXCEL FILE) TO TELEGRAM
// ============================================================

export const sendDocumentToTelegram = async (unit, documentBlob, filename = 'report.xlsx', caption = '', signal = null) => {
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
    const directUrl = `https://api.telegram.org/bot${token}/sendDocument`;
    
    const formData = new FormData();
    formData.append('chat_id', groupId);
    formData.append('document', documentBlob, filename);
    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const directResponse = await fetch(directUrl, {
      method: 'POST',
      body: formData,
      signal: signal || controller.signal
    });

    const directResult = await directResponse.json();
    const duration = Date.now() - startTime;
    clearTimeout(timeoutId);

    if (directResult.ok) {
      console.log(`✅ Sent document directly to ${unit} (${duration}ms)`);
      return { success: true, result: directResult, duration };
    } else {
      console.error(`❌ Failed to send document to ${unit}: ${directResult.description}`);
      return { success: false, error: directResult.description, duration };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Error sending document to ${unit}:`, error);
    return { success: false, error: error.message, duration };
  }
};



  // ============================================================
// 📌 EXCEL XML SPREADSHEET GENERATOR WITH STYLES (HEADER & CONDITIONAL COLORS)
// ============================================================

const escapeXml = (str) => {
  if (str === null || str === undefined) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const createExcelXmlBlob = (sheets) => {
  let xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10" ss:Color="#0F172A"/></Style><Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/></Borders><Font ss:FontName="Arial" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/><Interior ss:Color="#1E293B" ss:Pattern="Solid"/></Style><Style ss:ID="CellLeft"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders><Font ss:FontName="Arial" ss:Size="10" ss:Color="#0F172A"/></Style><Style ss:ID="CellLeftBold"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders><Font ss:FontName="Arial" ss:Size="10" ss:Color="#0F172A" ss:Bold="1"/></Style><Style ss:ID="CellCenter"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders><Font ss:FontName="Arial" ss:Size="10" ss:Color="#0F172A"/></Style><Style ss:ID="DaysRed"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/></Borders><Font ss:FontName="Arial" ss:Size="10" ss:Color="#991B1B" ss:Bold="1"/><Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/></Style><Style ss:ID="DaysYellow"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/></Borders><Font ss:FontName="Arial" ss:Size="10" ss:Color="#92400E" ss:Bold="1"/><Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/></Style><Style ss:ID="DaysSlate"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders><Font ss:FontName="Arial" ss:Size="10" ss:Color="#475569" ss:Bold="1"/><Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/></Style><Style ss:ID="StatusYellow"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/></Borders><Font ss:FontName="Arial" ss:Size="10" ss:Color="#B45309" ss:Bold="1"/><Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/></Style><Style ss:ID="StatusRed"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FCA5A5"/></Borders><Font ss:FontName="Arial" ss:Size="10" ss:Color="#B91C1C" ss:Bold="1"/><Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/></Style></Styles>`;

  sheets.forEach(sheet => {
    xml += `<Worksheet ss:Name="${escapeXml(sheet.name)}"><Table>`;
    
    if (sheet.rows && sheet.rows.length > 0 && sheet.headers) {
      sheet.headers.forEach(h => {
        let maxLen = h.length;
        sheet.rows.forEach(r => {
          const val = r[h];
          if (val !== null && val !== undefined) maxLen = Math.max(maxLen, val.toString().length);
        });
        const colWidth = Math.min(Math.max(maxLen * 8, 75), 320);
        xml += `<Column ss:Width="${colWidth}"/>`;
      });
    }

    // Header Row
    xml += `<Row ss:Height="24">`;
    sheet.headers.forEach(h => {
      xml += `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`;
    });
    xml += `</Row>`;

    // Data Rows
    sheet.rows.forEach(r => {
      xml += `<Row ss:Height="20">`;
      sheet.headers.forEach(h => {
        const val = r[h] !== undefined && r[h] !== null ? r[h] : '-';
        let styleId = 'CellLeft';
        if (h === '#' || h === 'Nº' || h === 'Year' || h === 'Unit' || h === 'UNIT') {
          styleId = 'CellCenter';
        } else if (h === 'Export Note Code' || h === 'Receipt Code' || h === 'Export No' || h === 'Code of stock-out note' || h === 'Import Request code') {
          styleId = 'CellLeftBold';
        } else if (h === 'Days' || h === "Q'ty of day") {
          const daysNum = parseInt(val.toString().replace(/[^0-9]/g, '')) || 0;
          if (daysNum >= 5) styleId = 'DaysRed';
          else if (daysNum >= 3) styleId = 'DaysYellow';
          else styleId = 'DaysSlate';
        } else if (h === 'Status CA' || h === 'Status') {
          const valStr = val.toString();
          if (valStr.includes('Is signing')) styleId = 'StatusYellow';
          else if (valStr.includes('Unsigned') || valStr.includes('Pending')) styleId = 'StatusRed';
          else styleId = 'CellCenter';
        }

        const isNum = typeof val === 'number';
        const typeStr = isNum ? 'Number' : 'String';
        xml += `<Cell ss:StyleID="${styleId}"><Data ss:Type="${typeStr}">${escapeXml(val)}</Data></Cell>`;
      });
      xml += `</Row>`;
    });

    xml += `</Table></Worksheet>`;
  });

  xml += `</Workbook>`;
  return new Blob([xml], { type: 'application/vnd.ms-excel' });
};

// ============================================================
// 📌 GENERATE RESTOCK EXCEL BLOB
// ============================================================

export const generateRestockExcelBlob = (unsignedOutItems = [], unsignedInItems = [], unit = 'ALL') => {
  const outRows = unsignedOutItems.map((item, idx) => ({
    "Nº": idx + 1,
    "Request export code": item.code || item.requestExportCode || '-',
    "Command Export Code": item.commandExportCode || item.commandCode || '-',
    "Date Create": item.dateCreate || item.createdDate || item.date || '-',
    "Warehouse Export": cleanWarehouseName(item.warehouseExport || item.warehouse || '-'),
    "Contract": item.contract || '-',
    "Requester": item.requester || '-',
    "Unit Request": cleanWarehouseName(item.unitRequest || item.requestingUnit || '-'),
    "Unit Entering": cleanWarehouseName(item.unitEntering || item.enteringUnit || '-'),
    "Date Export": item.dateExport || item.exportDate || '-',
    "Status CA": item.statusCA || 'Unsigned',
    "Unit": item.unit || unit || '-',
    "Q'ty of day": item.daysDiff !== undefined ? `${item.daysDiff}d` : '-',
    "Year": item.year || (item.createDate ? item.createDate.split('/')[2] : '-')
  }));

  const inRows = unsignedInItems.map((item, idx) => ({
    "Nº": idx + 1,
    "Import Request code": item.code || item.importRequestCode || '-',
    "Import Command code": item.importCommandCode || item.commandCode || '-',
    "Date Create": item.dateCreate || item.createdDate || item.date || '-',
    "Import warehouse": cleanWarehouseName(item.importWarehouse || item.warehouse || '-'),
    "Contract": item.contract || '-',
    "Creator": item.creator || '-',
    "Unit Requests": cleanWarehouseName(item.unitRequests || '-'),
    "Unit Receive": cleanWarehouseName(item.unitReceive || item.receivingUnit || '-'),
    "Date Delivery": item.dateDelivery || item.deliveryDate || '-',
    "Status CA": item.statusCA || 'Unsigned',
    "Unit": item.unit || unit || '-',
    "Q'ty of day": item.daysDiff !== undefined ? `${item.daysDiff}d` : '-',
    "Year": item.year || (item.createDate ? item.createDate.split('/')[2] : '-')
  }));

  const sheets = [
    {
      name: "RESTOCK OUT (EXPORT REQUEST)",
      headers: ["Nº", "Request export code", "Command Export Code", "Date Create", "Warehouse Export", "Contract", "Requester", "Unit Request", "Unit Entering", "Date Export", "Status CA", "Unit", "Q'ty of day", "Year"],
      rows: outRows.length > 0 ? outRows : [{ "Nº": "-", "Request export code": "No pending items" }]
    },
    {
      name: "RESTOCK IN (IMPORT REQUEST)",
      headers: ["Nº", "Import Request code", "Import Command code", "Date Create", "Import warehouse", "Contract", "Creator", "Unit Requests", "Unit Receive", "Date Delivery", "Status CA", "Unit", "Q'ty of day", "Year"],
      rows: inRows.length > 0 ? inRows : [{ "Nº": "-", "Import Request code": "No pending items" }]
    }
  ];

  return createExcelXmlBlob(sheets);
};

// ============================================================
// 📌 GENERATE STOCKOUT EXCEL BLOB
// ============================================================

export const generateStockoutExcelBlob = (m1Items = [], m2Items = [], m3Items = [], unit = 'ALL') => {
  const sheet1Rows = m1Items.map((item, idx) => ({
    "#": idx + 1,
    "Warehouse Stock out": cleanWarehouseName(item.warehouse || item.stockOut || '-'),
    "Export No": item.exportNo || item.code || item.exportCode || '-',
    "Date": item.realExport || item.date || item.dateCreate || item.createdDate || '-',
    "Stock Receiver": cleanWarehouseName(item.stockReceiver || item.receivingUnit || '-'),
    "Group Receiver": cleanWarehouseName(item.groupReceiver || item.groupRequest || '-'),
    "Construction": item.constructionReceiver || item.construction || '-',
    "Unit": item.unit || unit || '-',
    "Days": item.daysDiff !== undefined ? `${item.daysDiff}d` : (item.days ? `${item.days}d` : '-'),
    "TEAM": cleanWarehouseName(item.team || item.groupReceiver || item.stockReceiver || '-')
  }));

  const sheet2Rows = m2Items.map((item, idx) => ({
    "#": idx + 1,
    "Code of stock-out note": item.code || item.noteCode || '-',
    "Warehouse": cleanWarehouseName(item.warehouse || item.stockOut || '-'),
    "Recipient": cleanWarehouseName(item.recipient || item.receivingUnit || '-'),
    "Creator": item.creator || '-',
    "Creating date": item.date || item.createDate || item.dateCreate || '-',
    "TEAM": cleanWarehouseName(item.team || item.recipient || item.warehouse || '-'),
    "Unit": item.unit || unit || '-',
    "Days": item.daysDiff !== undefined ? `${item.daysDiff}d` : (item.days ? `${item.days}d` : '-'),
    "Status": item.status || 'Pending'
  }));

  const sheet3Rows = m3Items.map((item, idx) => ({
    "#": idx + 1,
    "Code of handover minutes": item.code || item.handoverCode || '-',
    "Type of handover": item.type || item.handoverType || '-',
    "Handover unit": cleanWarehouseName(item.handoverUnit || item.warehouse || '-'),
    "Unit confirm handover": cleanWarehouseName(item.confirmUnit || item.receivingUnit || '-'),
    "Handover date": item.date || item.handoverDate || '-',
    "Status": item.status || 'Pending',
    "TEAM": cleanWarehouseName(item.team || item.confirmUnit || item.handoverUnit || '-'),
    "Days": item.daysDiff !== undefined ? `${item.daysDiff}d` : (item.days ? `${item.days}d` : '-'),
    "UNIT": item.unit || unit || '-'
  }));

  const sheets = [
    {
      name: "STOCKOUT YET",
      headers: ["#", "Warehouse Stock out", "Export No", "Date", "Stock Receiver", "Group Receiver", "Construction", "Unit", "Days", "TEAM"],
      rows: sheet1Rows.length > 0 ? sheet1Rows : [{ "#": "-", "Export No": "No pending items" }]
    },
    {
      name: "STOCKOUT NOTE CONFIRMED",
      headers: ["#", "Code of stock-out note", "Warehouse", "Recipient", "Creator", "Creating date", "TEAM", "Unit", "Days", "Status"],
      rows: sheet2Rows.length > 0 ? sheet2Rows : [{ "#": "-", "Code of stock-out note": "No pending items" }]
    },
    {
      name: "NO CREATE HAND OVER",
      headers: ["#", "Code of handover minutes", "Type of handover", "Handover unit", "Unit confirm handover", "Handover date", "Status", "TEAM", "Days", "UNIT"],
      rows: sheet3Rows.length > 0 ? sheet3Rows : [{ "#": "-", "Code of handover minutes": "No pending items" }]
    }
  ];

  return createExcelXmlBlob(sheets);
};

// ============================================================
// 📌 GENERATE SIGNED CA EXCEL BLOB
// ============================================================

export const generateSignedCAExcelBlob = (exportItems = [], importItems = [], unit = 'ALL') => {
  const exportRows = exportItems.map((item, idx) => ({
    "#": idx + 1,
    "Export Note Code": item.exportNoteCode || item.code || item.noteCode || '-',
    "Export Command Code": item.exportCommandCode || item.commandCode || '-',
    "Export Request": item.exportRequest || item.requestCode || '-',
    "Requester": item.requester || item.creator || '-',
    "Date Create": item.dateCreate || item.createdDate || item.date || '-',
    "Date Export": item.dateExport || item.exportDate || '-',
    "Export Warehouse": cleanWarehouseName(item.exportWarehouse || item.warehouse || '-'),
    "Reason": item.reason || '-',
    "Warehouse Entering": cleanWarehouseName(item.warehouseEntering || item.enteringWarehouse || '-'),
    "Unit Entering": cleanWarehouseName(item.unitEntering || item.enteringUnit || '-'),
    "Construction Code": item.constructionCode || item.construction || '-',
    "Status": item.status || '-',
    "Disapprove": item.disapprove || item.disapproveReason || '-',
    "Status CA": item.statusCA || item.caStatus || 'Unsigned',
    "Description": item.description || item.note || '-',
    "Unit": item.unit || unit || '-',
    "Days": item.daysDiff !== undefined ? `${item.daysDiff}d` : (item.days ? `${item.days}d` : '-'),
    "TEAM": cleanWarehouseName(item.team || item.requester || item.exportWarehouse || '-'),
    "Year": item.year || (item.dateCreate ? item.dateCreate.split('/')[2] : (item.date ? item.date.split('/')[2] : '-'))
  }));

  const importRows = importItems.map((item, idx) => ({
    "#": idx + 1,
    "Receipt Code": item.receiptCode || item.code || item.importCode || '-',
    "Command Code": item.commandCode || item.importCommandCode || '-',
    "Date": item.date || item.dateCreate || item.createdDate || '-',
    "Warehouse": cleanWarehouseName(item.warehouse || item.importWarehouse || '-'),
    "Creator": item.creator || item.requester || '-',
    "Status": item.status || '-',
    "Status CA": item.statusCA || item.caStatus || 'Unsigned',
    "Unit": item.unit || unit || '-',
    "Days": item.daysDiff !== undefined ? `${item.daysDiff}d` : (item.days ? `${item.days}d` : '-'),
    "TEAM": cleanWarehouseName(item.team || item.creator || item.warehouse || '-'),
    "Year": item.year || (item.date ? item.date.split('/')[2] : '-')
  }));

  const sheets = [
    {
      name: "SIGNED CA EXPORT",
      headers: ["#", "Export Note Code", "Export Command Code", "Export Request", "Requester", "Date Create", "Date Export", "Export Warehouse", "Reason", "Warehouse Entering", "Unit Entering", "Construction Code", "Status", "Disapprove", "Status CA", "Description", "Unit", "Days", "TEAM", "Year"],
      rows: exportRows.length > 0 ? exportRows : [{ "#": "-", "Export Note Code": "No pending items" }]
    },
    {
      name: "SIGNED CA IMPORT",
      headers: ["#", "Receipt Code", "Command Code", "Date", "Warehouse", "Creator", "Status", "Status CA", "Unit", "Days", "TEAM", "Year"],
      rows: importRows.length > 0 ? importRows : [{ "#": "-", "Receipt Code": "No pending items" }]
    }
  ];

  return createExcelXmlBlob(sheets);
};
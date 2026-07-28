import React, { useState } from 'react';
import { 
  generateAllModulesExcelBlob,
  getConfiguredUnits 
} from '../../services/telegramBot';

const unitOptions = [
  { code: 'BAN', name: 'BAN (បន្ទាយមានជ័យ)' },
  { code: 'BAT', name: 'BAT (បាត់ដំបង)' },
  { code: 'CHA', name: 'CHA (កំពង់ចាម)' },
  { code: 'CHH', name: 'CHH (កំពង់ឆ្នាំង)' },
  { code: 'KAM', name: 'KAM (កំពត)' },
  { code: 'KAN', name: 'KAN (កណ្តាល)' },
  { code: 'KANZ1', name: 'KANZ1 (កណ្តាល ហ្សូន ១)' },
  { code: 'KOH', name: 'KOH (កោះកុង)' },
  { code: 'KRA', name: 'KRA (ក្រចេះ)' },
  { code: 'MON', name: 'MON (មណ្ឌលគិរី)' },
  { code: 'ODD', name: 'ODD (ឧត្តរមានជ័យ)' },
  { code: 'PNP', name: 'PNP (ភ្នំពេញ)' },
  { code: 'PNPZ1', name: 'PNPZ1 (ភ្នំពេញ ហ្សូន ១)' },
  { code: 'PNPZ2', name: 'PNPZ2 (ភ្នំពេញ ហ្សូន ២)' },
  { code: 'PRE', name: 'PRE (ព្រៃវែង)' },
  { code: 'PRH', name: 'PRH (ព្រះវិហារ)' },
  { code: 'PUR', name: 'PUR (ពោធិ៍សាត់)' },
  { code: 'ROT', name: 'ROT (រតនគិរី)' },
  { code: 'SIE', name: 'SIE (សៀមរាប)' },
  { code: 'SIH', name: 'SIH (ព្រះសីហនុ)' },
  { code: 'SPE', name: 'SPE (កំពង់ស្ពឺ)' },
  { code: 'STU', name: 'STU (ស្ទឹងត្រែង)' },
  { code: 'SVA', name: 'SVA (ស្វាយរៀង)' },
  { code: 'TAK', name: 'TAK (តាកែវ)' },
  { code: 'THO', name: 'THO (កំពង់ធំ)' }
];

const Sidebar = ({ onSelect, selected, onSendTelegram }) => {
  const [isStockoutOpen, setIsStockoutOpen] = useState(false);
  const [isSignedCAOpen, setIsSignedCAOpen] = useState(false);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [isSendAllOpen, setIsSendAllOpen] = useState(false);
  const [isSendSingleOpen, setIsSendSingleOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState('BAT');
  const [isSending, setIsSending] = useState(false);

  React.useEffect(() => {
    if (['STOCKOUT_YET_CONFIRM', 'NO_CREATE_HAND_OVER', 'STOCK_OUT_NOTE_CONFIRMED', 'stockout_group'].includes(selected)) {
      setIsStockoutOpen(true);
      setIsSignedCAOpen(false);
      setIsRestockOpen(false);
    } else if (['STOCK_OUT_IS_SIGNING', 'STOCK_IN_IS_SIGNING', 'signed_ca_group'].includes(selected)) {
      setIsSignedCAOpen(true);
      setIsStockoutOpen(false);
      setIsRestockOpen(false);
    } else if (['RESTOCK_IN', 'RESTOCK_OUT', 'restock_group'].includes(selected)) {
      setIsRestockOpen(true);
      setIsStockoutOpen(false);
      setIsSignedCAOpen(false);
    }
  }, [selected]);

  const menuItems = [
    { 
      id: 'dashboard', 
      label: 'MAIN DASHBOARD', 
      icon: '🏠',
      number: '00'
    },
    { 
      id: 'stockout_group', 
      label: 'CONFIRMED HAND OVER', 
      icon: '📋',
      number: '01',
      isGroup: true,
      children: [
        { 
          id: 'STOCKOUT_YET_CONFIRM', 
          label: 'STOCKOUT YET CONFIRM', 
          icon: '📦',
          number: '01',
          desc: 'Pending confirmations'
        },
        { 
          id: 'NO_CREATE_HAND_OVER', 
          label: 'NOT CREATE HAND OVER', 
          icon: '📝',
          number: '02',
          desc: 'Not yet created'
        },
        { 
          id: 'STOCK_OUT_NOTE_CONFIRMED', 
          label: 'HAND OVER YET CONFIRM', 
          icon: '⚠️',
          number: '03',
          desc: 'Awaiting confirmation'
        },
      ]
    },
    { 
      id: 'signed_ca_group', 
      label: 'SIGNED "CA" SYSTEM', 
      icon: '✅',
      number: '02',
      isGroup: true,
      children: [
        { 
          id: 'STOCK_OUT_IS_SIGNING', 
          label: 'STOCK OUT IS SIGNING', 
          icon: '📤',
          number: '01',
          desc: 'Export signing'
        },
        { 
          id: 'STOCK_IN_IS_SIGNING', 
          label: 'STOCK IN IS SIGNING', 
          icon: '📥',
          number: '02',
          desc: 'Import signing'
        },
      ]
    },
    { 
      id: 'restock_group', 
      label: 'RESTOCK IN / OUT', 
      icon: '🔄',
      number: '03',
      isGroup: true,
      children: [
        { 
          id: 'RESTOCK_IN', 
          label: 'RESTOCK IN', 
          icon: '📥',
          number: '01',
          desc: 'Incoming restock'
        },
        { 
          id: 'RESTOCK_OUT', 
          label: 'RESTOCK OUT', 
          icon: '📤',
          number: '02',
          desc: 'Outgoing restock'
        },
      ]
    },
  ];

  const isGroupActive = (groupItem) => {
    if (groupItem.isGroup) {
      return groupItem.children.some(child => selected === child.id);
    }
    return false;
  };

  const toggleStockout = () => {
    setIsStockoutOpen(!isStockoutOpen);
    setIsSignedCAOpen(false);
    setIsRestockOpen(false);
  };

  const toggleSignedCA = () => {
    setIsSignedCAOpen(!isSignedCAOpen);
    setIsStockoutOpen(false);
    setIsRestockOpen(false);
  };

  const toggleRestock = () => {
    setIsRestockOpen(!isRestockOpen);
    setIsStockoutOpen(false);
    setIsSignedCAOpen(false);
  };

  const getToggleFunction = (itemId) => {
    if (itemId === 'stockout_group') return toggleStockout;
    if (itemId === 'signed_ca_group') return toggleSignedCA;
    if (itemId === 'restock_group') return toggleRestock;
    return () => {};
  };

  const isGroupOpen = (itemId) => {
    if (itemId === 'stockout_group') return isStockoutOpen;
    if (itemId === 'signed_ca_group') return isSignedCAOpen;
    if (itemId === 'restock_group') return isRestockOpen;
    return false;
  };

  const handleExportAll = async () => {
    try {
      const unit = 'ALL';
      const blob = generateAllModulesExcelBlob(unit);
      
      // Download file locally
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = `GIS_DASHBOARD_${unit}_${new Date().toISOString().split('T')[0]}.xls`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export dashboard data:', error);
    }
  };

  const handleSendByProvince = async () => {
    if (isSending) return;
    try {
      const confirmSend = window.confirm("តើអ្នកពិតជាចង់ផ្ញើរបាយការណ៍បំបែកតាមខេត្តនីមួយៗ (UNIT) ទៅកាន់ Telegram មែនទេ?");
      if (!confirmSend) return;

      const units = getConfiguredUnits();
      if (units.length === 0) {
        alert('⚠️ គ្មានក្រុម Telegram ណាត្រូវបានកំណត់នៅក្នុង config ទេ!');
        return;
      }
      
      setIsSending(true);
      for (const u of units) {
        if (onSendTelegram) {
          await onSendTelegram(u);
        }
      }
      alert('✅ ផ្ញើទិន្នន័យតាម UNIT នីមួយៗបានជោគជ័យ!');
    } catch (error) {
      console.error('Failed to send data by province:', error);
      alert('❌ ផ្ញើទិន្នន័យតាម UNIT នីមួយៗបរាជ័យ!');
    } finally {
      setIsSending(false);
    }
  };


  const handleSendSingle = async () => {
    if (isSending) return;
    try {
      const confirmSend = window.confirm(`តើអ្នកពិតជាចង់ផ្ញើរបាយការណ៍របស់ UNIT ${selectedUnit} ទៅកាន់ Telegram មែនទេ?`);
      if (!confirmSend) return;

      setIsSending(true);
      if (onSendTelegram) {
        await onSendTelegram(selectedUnit);
      }
      alert(`✅ ផ្ញើទិន្នន័យរបស់ UNIT ${selectedUnit} បានជោគជ័យ!`);
    } catch (error) {
      console.error(`Failed to send data for unit ${selectedUnit}:`, error);
      alert(`❌ ផ្ញើទិន្នន័យរបស់ UNIT ${selectedUnit} បរាជ័យ!`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="w-64 h-full bg-white shadow-xl flex flex-col border-r border-gray-100 animate-fadeIn">
      {/* ─── LOGO ─── */}
      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-blue-200/50">
            <img src="/gis_asset_logo.png" alt="GIS Logo" className="w-full h-full object-cover" style={{ transform: 'scale(1.3) translateY(-1px)' }} />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-800 leading-none">
              GI<span className="text-blue-600">S</span>
            </div>
            <div className="text-[10px] text-gray-500 font-medium tracking-wider mt-0.5">
              ASSET MANAGEMENT
            </div>
          </div>
        </div>
      </div>
      
      {/* ─── NAVIGATION ─── */}
      <nav className="flex-1 p-4 overflow-y-auto scrollbar-thin">
        <div className="space-y-2">
          {menuItems.map((item) => (
            <div key={item.id}>
              {item.isGroup ? (
                <div>
                  {/* Group Header */}
                  <button
                    onClick={() => {
                      const toggleFn = getToggleFunction(item.id);
                      toggleFn();
                      onSelect(item.id);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-3 rounded-2xl transition-all duration-300 group ${
                      isGroupActive(item) || selected === item.id || isGroupOpen(item.id)
                        ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-md shadow-blue-500/25'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:shadow-xs'
                    }`}
                  >
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md transition-colors flex-shrink-0 ${
                      isGroupActive(item) || selected === item.id || isGroupOpen(item.id)
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'
                    }`}>
                      {item.number}
                    </span>
                    <span className="text-lg flex-shrink-0">{item.icon}</span>
                    <span className="text-xs font-extrabold flex-1 text-left truncate tracking-tight uppercase">
                      {item.label}
                    </span>
                    <span className={`transition-transform duration-300 text-[10px] flex-shrink-0 ${isGroupOpen(item.id) ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                    {(isGroupActive(item) || selected === item.id || isGroupOpen(item.id)) && (
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0"></span>
                    )}
                  </button>
                  
                  {/* Group Children */}
                  <div className={`ml-4 pl-2 border-l-2 border-slate-100 space-y-1.5 overflow-hidden transition-all duration-300 ${
                    isGroupOpen(item.id) ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'
                  }`}>
                    {item.children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => {
                          onSelect(child.id);
                          if (item.id === 'stockout_group') {
                            setIsStockoutOpen(true);
                          } else if (item.id === 'signed_ca_group') {
                            setIsSignedCAOpen(true);
                          } else if (item.id === 'restock_group') {
                            setIsRestockOpen(true);
                          }
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 group ${
                          selected === child.id
                            ? 'bg-indigo-50/90 text-indigo-700 font-extrabold border-l-4 border-indigo-600 shadow-xs'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <span className={`text-[9.5px] font-mono font-bold transition-colors flex-shrink-0 ${
                          selected === child.id ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                        }`}>
                          {child.number}
                        </span>
                        <span className="text-base flex-shrink-0">{child.icon}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold truncate block">
                            {child.label}
                          </span>
                          {child.desc && (
                            <span className="text-[9px] text-slate-400 truncate block font-medium">
                              {child.desc}
                            </span>
                          )}
                        </div>
                        {selected === child.id && (
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 flex-shrink-0"></span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Main Menu Item */
                <button
                  onClick={() => onSelect(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-3 rounded-2xl transition-all duration-300 group ${
                    selected === item.id
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-md shadow-blue-500/25'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:shadow-xs'
                  }`}
                >
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md transition-colors flex-shrink-0 ${
                    selected === item.id
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'
                  }`}>
                    {item.number}
                  </span>
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  <span className="text-xs font-extrabold flex-1 text-left truncate tracking-tight uppercase">
                    {item.label}
                  </span>
                  {selected === item.id && (
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0"></span>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      </nav>

      {/* ─── EXPORT & TELEGRAM ACTIONS PANEL ─── */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
        <div className="flex items-center gap-2 px-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            របាយការណ៍ & ផ្ញើ TELEGRAM
          </span>
        </div>

        {/* 1. Download Local Excel */}
        <button
          onClick={handleExportAll}
          className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-600 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-black tracking-wide uppercase shadow-md shadow-emerald-500/10 hover:shadow-lg active:scale-[0.98] transition-all duration-200 cursor-pointer"
        >
          <span className="text-sm">📊</span>
          <span>ទាញទិន្នន័យទាំងអស់ (Excel)</span>
        </button>

        {/* Accordion 1: Send All (25) */}
        <div className="border border-slate-100/80 bg-white rounded-2xl overflow-hidden shadow-xs transition-all duration-300">
          <button
            onClick={() => setIsSendAllOpen(!isSendAllOpen)}
            className={`w-full flex items-center justify-between px-3.5 py-3 transition-colors duration-200 cursor-pointer ${
              isSendAllOpen ? 'bg-slate-100/70 text-slate-900 font-black' : 'bg-slate-50/60 hover:bg-slate-100/50 text-slate-700 font-extrabold'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">🚀</span>
              <span className="text-xs uppercase tracking-tight">Send All (25)</span>
            </div>
            <span className={`transition-transform duration-300 text-[8px] text-slate-400 font-bold ${isSendAllOpen ? 'rotate-180 text-slate-700' : ''}`}>▼</span>
          </button>
          
          {isSendAllOpen && (
            <div className="p-3 space-y-2.5 border-t border-slate-100 bg-white/50">
              <button
                onClick={handleSendByProvince}
                disabled={isSending}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-xs active:scale-[0.98] transition-all duration-200 ${isSending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className="text-sm">📤</span>
                <span>{isSending ? 'កំពុងផ្ញើ...' : 'ផ្ញើតាមខេត្តនីមួយៗ (Excel)'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Accordion 2: Send Single Branch (1) */}
        <div className="border border-slate-100/80 bg-white rounded-2xl overflow-hidden shadow-xs transition-all duration-300">
          <button
            onClick={() => setIsSendSingleOpen(!isSendSingleOpen)}
            disabled={isSending}
            className={`w-full flex items-center justify-between px-3.5 py-3 transition-colors duration-200 ${isSending ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer'} ${
              isSendSingleOpen ? 'bg-slate-100/70 text-slate-900 font-black' : 'bg-slate-50/60 hover:bg-slate-100/50 text-slate-700 font-extrabold'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">🎯</span>
              <span className="text-xs uppercase tracking-tight">Send Single Branch (1)</span>
            </div>
            <span className={`transition-transform duration-300 text-[8px] text-slate-400 font-bold ${isSendSingleOpen ? 'rotate-180 text-slate-700' : ''}`}>▼</span>
          </button>
          
          {isSendSingleOpen && (
            <div className="p-3 space-y-2.5 border-t border-slate-100 bg-white/50">
              <div className="relative">
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  disabled={isSending}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/40 text-slate-700 text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundImage: 'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\' fill=\'none\'%3E%3Cpath d=\'M7 9l3 3 3-3\' stroke=\'%2364748B\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")', backgroundPosition: 'right 10px center', backgroundSize: '16px', backgroundRepeat: 'no-repeat' }}
                >
                  {unitOptions.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <button
                onClick={handleSendSingle}
                disabled={isSending}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white text-xs font-bold shadow-xs active:scale-[0.98] transition-all duration-200 ${isSending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className="text-sm">📤</span>
                <span>{isSending ? 'កំពុងផ្ញើ...' : 'ផ្ញើទិន្នន័យ UNIT នេះ'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── FOOTER ─── */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
            </div>
            <span className="text-[10px] font-bold text-slate-700">System Online KPI</span>
          </div>
          <span className="text-[9px] text-slate-400 font-bold bg-white px-2 py-0.5 rounded-full border border-slate-200">v1.0.0</span>
        </div>
        <div className="mt-1.5 text-[8px] text-slate-400 font-medium">
          © 2026 KPI  Management asset
        </div>
      </div>

      <style>{`
        .scrollbar-thin::-webkit-scrollbar {
          width: 3px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
        .border-l-3 {
          border-left-width: 3px;
        }
      `}</style>
    </div>
  );
};

export default Sidebar;
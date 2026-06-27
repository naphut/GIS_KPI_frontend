import React, { useState } from 'react';

const Sidebar = ({ onSelect, selected }) => {
  const [isStockoutOpen, setIsStockoutOpen] = useState(false);
  const [isSignedCAOpen, setIsSignedCAOpen] = useState(false);
  const [isRestockOpen, setIsRestockOpen] = useState(false);

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

  return (
    <div className="w-64 h-full bg-white shadow-xl flex flex-col border-r border-gray-100">
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
        <div className="space-y-1.5">
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
                    className={`w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl transition-all duration-200 group ${
                      isGroupActive(item) || selected === item.id || isGroupOpen(item.id)
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-200'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 hover:shadow-sm'
                    }`}
                  >
                    <span className="text-[10px] font-bold text-gray-400 group-hover:text-gray-500 transition-colors flex-shrink-0 w-5 text-right">
                      {item.number}
                    </span>
                    <span className="text-lg flex-shrink-0">{item.icon}</span>
                    <span className="text-xs font-semibold flex-1 text-left truncate">
                      {item.label}
                    </span>
                    <span className={`transition-transform duration-300 text-xs flex-shrink-0 ${isGroupOpen(item.id) ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                    {(isGroupActive(item) || selected === item.id || isGroupOpen(item.id)) && (
                      <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse flex-shrink-0"></span>
                    )}
                  </button>
                  
                  {/* Group Children */}
                  <div className={`ml-6 space-y-1 overflow-hidden transition-all duration-300 ${
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
                        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg transition-all duration-200 group ${
                          selected === child.id
                            ? 'bg-blue-50 text-blue-700 font-medium border-l-3 border-blue-500 shadow-sm'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                        }`}
                      >
                        <span className="text-[10px] font-bold text-gray-400 group-hover:text-gray-500 transition-colors flex-shrink-0 w-5 text-right">
                          {child.number}
                        </span>
                        <span className="text-base flex-shrink-0">{child.icon}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium truncate block">
                            {child.label}
                          </span>
                          {child.desc && (
                            <span className="text-[9px] text-gray-400 truncate block">
                              {child.desc}
                            </span>
                          )}
                        </div>
                        {selected === child.id && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0"></span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Main Menu Item */
                <button
                  onClick={() => onSelect(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl transition-all duration-200 group ${
                    selected === item.id
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-200'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800 hover:shadow-sm'
                  }`}
                >
                  <span className="text-[10px] font-bold text-gray-400 group-hover:text-gray-500 transition-colors flex-shrink-0 w-5 text-right">
                    {item.number}
                  </span>
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  <span className="text-xs font-semibold flex-1 text-left truncate">
                    {item.label}
                  </span>
                  {selected === item.id && (
                    <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse flex-shrink-0"></span>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* ─── BOTTOM SECTION ─── */}
        <div className="mt-6 pt-5 border-t border-gray-100">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Active Modules</div>
                <div className="text-2xl font-bold text-gray-800 mt-0.5">3</div>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-lg shadow-md">
                📊
              </div>
            </div>
            <div className="mt-2 flex gap-1">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-medium rounded-full">📋</span>
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[9px] font-medium rounded-full">✅</span>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[9px] font-medium rounded-full">🔄</span>
            </div>
          </div>
        </div>

        {/* ─── SETTINGS & HELP ─── */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex gap-1">
          <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-gray-500 hover:bg-gray-50 rounded-xl transition-colors group">
            <span className="text-lg">⚙️</span>
            <span className="text-[10px] font-medium group-hover:text-gray-700">Settings</span>
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-gray-500 hover:bg-gray-50 rounded-xl transition-colors group">
            <span className="text-lg">❓</span>
            <span className="text-[10px] font-medium group-hover:text-gray-700">Help</span>
          </button>
        </div>
      </nav>

      {/* ─── FOOTER ─── */}
      <div className="p-4 border-t border-gray-100 bg-gray-50/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
            </div>
            <span className="text-[10px] font-medium text-gray-600">System Online</span>
          </div>
          <span className="text-[9px] text-gray-400 font-medium">v3.0.1</span>
        </div>
        <div className="mt-1.5 text-[8px] text-gray-400">
          © 2026 KPI Pro Management
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
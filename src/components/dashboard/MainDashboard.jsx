import React, { useMemo, useState, useEffect } from 'react';

// Storage helper
const getStorageData = (key) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
};

const MainDashboard = ({ onNavigate }) => {
  const [isDarkMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Load data for Module 1: Confirmed Hand Over
  const confirmedStats = useMemo(() => {
    const stockout = getStorageData('kpi_stockout_data') || [];
    const nocreate = getStorageData('kpi_nocreate_data') || [];
    const notconfirmed = getStorageData('kpi_notconfirmed_data') || [];

    const stockoutHistory = getStorageData('kpi_stockout_completionHistory') || [];
    const nocreateHistory = getStorageData('kpi_nocreate_completionHistory') || [];
    const notconfirmedHistory = getStorageData('kpi_notconfirmed_completionHistory') || [];

    const total = stockout.length + nocreate.length + notconfirmed.length;
    const completed = stockoutHistory.length + nocreateHistory.length + notconfirmedHistory.length;
    const pending = Math.max(0, total - completed);
    const rate = total > 0 ? (completed / total) * 100 : 0;

    return { total, completed, pending, rate };
  }, []);

  // Load data for Module 2: Import CA & Export CA (Signed CA)
  const caStats = useMemo(() => {
    const exportData = getStorageData('export_ca_data') || [];
    const importData = getStorageData('import_ca_data') || [];

    const outSigning = exportData.filter(item => item.statusCA === 'Is signing' || item.statusCA === 'Signing');
    const outUnsigned = exportData.filter(item => item.statusCA === 'Unsigned' || !item.statusCA);
    const inSigning = importData.filter(item => item.statusCA === 'Is signing' || item.statusCA === 'Signing');
    const inUnsigned = importData.filter(item => item.statusCA === 'Unsigned' || !item.statusCA);

    const signing = outSigning.length + inSigning.length;
    const unsigned = outUnsigned.length + inUnsigned.length;
    const total = signing + unsigned;
    const rate = total > 0 ? (signing / total) * 100 : 0;

    return { total, signing, unsigned, rate };
  }, []);

  // Load data for Module 3: Restock Requests
  const restockStats = useMemo(() => {
    const restockIn = getStorageData('restock_in_data') || [];
    const restockOut = getStorageData('restock_out_data') || [];
    const restockInHistory = getStorageData('restock_in_completionHistory') || [];
    const restockOutHistory = getStorageData('restock_out_completionHistory') || [];
    
    const total = restockIn.length + restockOut.length;
    const completed = restockInHistory.length + restockOutHistory.length;
    const pending = Math.max(0, total - completed);
    const rate = total > 0 ? (completed / total) * 100 : 0;

    return { total, completed, pending, rate };
  }, []);

  // Get recent activities
  const recentActivities = useMemo(() => {
    const activities = [];
    
    // Get last 5 completions from stockout
    const stockoutHistory = getStorageData('kpi_stockout_completionHistory') || [];
    stockoutHistory.slice(0, 3).forEach(item => {
      if (item.code) {
        activities.push({
          id: `stockout-${item.code}`,
          type: '✅ Completed',
          description: `Stockout: ${item.code}`,
          time: item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Just now',
          unit: item.unit || 'N/A'
        });
      }
    });

    // Get last 5 completions from nocreate
    const nocreateHistory = getStorageData('kpi_nocreate_completionHistory') || [];
    nocreateHistory.slice(0, 3).forEach(item => {
      if (item.code) {
        activities.push({
          id: `nocreate-${item.code}`,
          type: '✅ Completed',
          description: `Hand Over: ${item.code}`,
          time: item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Just now',
          unit: item.unit || 'N/A'
        });
      }
    });

    // Sort by time (most recent first)
    activities.sort((a, b) => {
      if (a.time === 'Just now') return -1;
      if (b.time === 'Just now') return 1;
      return new Date(b.time) - new Date(a.time);
    });

    return activities.slice(0, 5);
  }, []);

  const modules = [
    {
      id: 'stockout_group',
      title: '📋 CONFIRMED HAND OVER',
      subtitle: 'CONFIRMED HAND OVER ON SYSTEM',
      description: '',
      icon: '📋',
      color: 'from-slate-800 to-slate-900',
      shadow: 'hover:shadow-slate-500/10',
      borderColor: 'border-slate-200 dark:border-slate-800',
      bgColor: 'bg-slate-50 dark:bg-slate-900/10',
      stats: [
        { label: 'Total Tasks', value: confirmedStats.total, color: 'text-slate-900 dark:text-white' },
        { label: 'Completed', value: confirmedStats.completed, color: 'text-slate-600 dark:text-slate-400 font-semibold' },
        { label: 'Pending', value: confirmedStats.pending, color: 'text-slate-600 dark:text-slate-400 font-semibold' },
        { label: 'Success Rate', value: `${confirmedStats.rate.toFixed(1)}%`, color: 'text-indigo-600 dark:text-indigo-400 font-extrabold' },
      ],
      subtasks: [
        { id: 'STOCKOUT_YET_CONFIRM', label: 'STOCKOUT YET CONFIRM', icon: '📦', desc: 'Pending stockout confirmations' },
        { id: 'NO_CREATE_HAND_OVER', label: 'NOT CREATE HAND OVER', icon: '📝', desc: 'Handover not yet created' },
        { id: 'STOCK_OUT_NOTE_CONFIRMED', label: 'HAND OVER YET CONFIRM', icon: '⚠️', desc: 'Handover awaiting confirmation' }
      ]
    },
    {
      id: 'signed_ca_group',
      title: '✅ IMPORT CA & EXPORT CA',
      subtitle: 'SIGNED "CA" ON THE SYSTEM YET',
      description: '',
      icon: '✅',
      color: 'from-slate-800 to-slate-900',
      shadow: 'hover:shadow-slate-500/10',
      borderColor: 'border-slate-200 dark:border-slate-800',
      bgColor: 'bg-slate-50 dark:bg-slate-900/10',
      stats: [
        { label: 'Total Records', value: caStats.total, color: 'text-slate-900 dark:text-white' },
        { label: 'Is Signing', value: caStats.signing, color: 'text-slate-600 dark:text-slate-400 font-semibold' },
        { label: 'Unsigned', value: caStats.unsigned, color: 'text-slate-600 dark:text-slate-400 font-semibold' },
        { label: 'Signed Rate', value: `${caStats.rate.toFixed(1)}%`, color: 'text-indigo-600 dark:text-indigo-400 font-extrabold' },
      ],
      subtasks: [
        { id: 'STOCK_OUT_IS_SIGNING', label: 'STOCK OUT IS SIGNING', icon: '📤', desc: 'Export documents signing' },
        { id: 'STOCK_IN_IS_SIGNING', label: 'STOCK IN IS SIGNING', icon: '📥', desc: 'Import documents signing' }
      ]
    },
    {
      id: 'restock_group',
      title: '🔄 RESTOCK IN & RESTOCK OUT',
      subtitle: 'RESTOCK IN CA / RESTOCK OUT',
      description: '',
      icon: '🔄',
      color: 'from-slate-800 to-slate-900',
      shadow: 'hover:shadow-slate-500/10',
      borderColor: 'border-slate-200 dark:border-slate-800',
      bgColor: 'bg-slate-50 dark:bg-slate-900/10',
      stats: [
        { label: 'Total Requests', value: restockStats.total, color: 'text-slate-900 dark:text-white' },
        { label: 'Completed', value: restockStats.completed, color: 'text-slate-600 dark:text-slate-400 font-semibold' },
        { label: 'Pending', value: restockStats.pending, color: 'text-slate-600 dark:text-slate-400 font-semibold' },
        { label: 'Restock Rate', value: `${restockStats.rate.toFixed(1)}%`, color: 'text-indigo-600 dark:text-indigo-400 font-extrabold' },
      ],
      subtasks: [
        { id: 'RESTOCK_IN', label: 'RESTOCK IN', icon: '📥', desc: 'Incoming restock requests' },
        { id: 'RESTOCK_OUT', label: 'RESTOCK OUT', icon: '📤', desc: 'Outgoing restock requests' }
      ]
    }
  ];

  // Calculate overall stats
  const totalPending = confirmedStats.pending + caStats.unsigned + restockStats.pending;
  const avgCompletion = ((confirmedStats.rate + caStats.rate + restockStats.rate) / 3);
  const totalRecords = confirmedStats.total + caStats.total + restockStats.total;
  const totalCompleted = confirmedStats.completed + caStats.signing + restockStats.completed;

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <div className="w-full px-4 sm:px-6 py-6 sm:py-8 bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        
        {/* ─── HEADER BANNER ─── */}
        <div className="relative overflow-hidden bg-slate-900 rounded-2xl shadow-md p-6 sm:p-8 mb-6 sm:mb-8 text-white border border-slate-800">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="bg-slate-800 text-slate-300 text-[10px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 rounded-full border border-slate-700">
                  v1.0.0
                </span>
                <span className="bg-slate-800 text-slate-300 text-[10px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 rounded-full uppercase tracking-wider border border-slate-700">
                  🏢 Enterprise Portal
                </span>
                <span className="bg-emerald-950/30 text-emerald-400 text-[10px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 rounded-full border border-emerald-900/50">
                  🟢 Live
                </span>
                <span className="bg-slate-800 text-slate-300 text-[10px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 rounded-full border border-slate-700">
                  {currentTime.toLocaleTimeString()}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight mt-2 sm:mt-3 text-white flex items-center gap-2 flex-wrap">
                📊 GIS Asset Management Portal
              </h1>
            </div>
            
            <div className="flex gap-3 sm:gap-4 bg-slate-800/80 p-3 sm:p-4 rounded-xl border border-slate-700/80 shrink-0">
              <div className="text-center px-2 sm:px-4 border-r border-slate-700/80">
                <span className="block text-xl sm:text-2xl font-bold text-indigo-400">
                  {totalPending}
                </span>
                <span className="text-[8px] sm:text-[10px] text-slate-400 uppercase font-medium">Pending</span>
              </div>
              <div className="text-center px-2 sm:px-4 border-r border-slate-700/80">
                <span className="block text-xl sm:text-2xl font-bold text-emerald-400">
                  {totalCompleted}
                </span>
                <span className="text-[8px] sm:text-[10px] text-slate-400 uppercase font-medium">Completed</span>
              </div>
              <div className="text-center px-2 sm:px-4">
                <span className="block text-xl sm:text-2xl font-bold text-amber-400">
                  {avgCompletion.toFixed(1)}%
                </span>
                <span className="text-[8px] sm:text-[10px] text-slate-400 uppercase font-medium">Avg Rate</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── STATS ROW ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Total Records</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalRecords}</div>
              </div>
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-xl">📊</div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Completed</div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{totalCompleted}</div>
              </div>
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-xl">✅</div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Pending</div>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{totalPending}</div>
              </div>
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-xl">⏳</div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Avg Completion</div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{avgCompletion.toFixed(1)}%</div>
              </div>
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-xl">📈</div>
            </div>
          </div>
        </div>

        {/* ─── MAIN GRID ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {modules.map((mod) => (
            <div 
              key={mod.id} 
              className={`group bg-white dark:bg-gray-800 rounded-2xl border ${mod.borderColor} shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl ${mod.shadow} flex flex-col overflow-hidden`}
            >
              {/* Gradient Card Header */}
              <div className={`p-5 sm:p-6 bg-gradient-to-br ${mod.color} text-white relative`}>
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-xl -mr-6 -mt-6"></div>
                <div className="flex justify-between items-start mb-3 sm:mb-4">
                  <span className="text-3xl sm:text-4xl bg-white/20 p-2 sm:p-2.5 rounded-xl backdrop-blur-sm shadow-inner leading-none">
                    {mod.icon}
                  </span>
                  <button
                    onClick={() => onNavigate(mod.id)}
                    className="bg-white/20 hover:bg-white/30 text-white rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold backdrop-blur-sm transition-colors flex items-center gap-1.5"
                  >
                    <span className="hidden sm:inline">Dashboard</span> ➔
                  </button>
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">{mod.title}</h2>
                <p className="text-white/70 text-[8px] sm:text-[10px] uppercase font-bold tracking-wider mt-0.5 sm:mt-1">{mod.subtitle}</p>
              </div>

              {/* Card Body */}
              <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between">
                <div>
                  {mod.description && (
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4 sm:mb-6">
                      {mod.description}
                    </p>
                  )}

                  {/* Quick Stats Grid */}
                  <div className={`grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6 ${mod.bgColor} p-3 sm:p-3.5 rounded-xl border ${mod.borderColor}`}>
                    {mod.stats.map((s, idx) => (
                      <div key={idx} className="flex flex-col">
                        <span className="text-[8px] sm:text-[10px] text-gray-400 dark:text-gray-500 uppercase font-medium tracking-wider">{s.label}</span>
                        <span className={`text-sm sm:text-base font-bold ${s.color}`}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sub-Components Link Section */}
                <div>
                  <h4 className="text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2 sm:mb-2.5 flex items-center gap-1.5">
                    <span>📂</span> Sub Modules
                  </h4>
                  <div className="space-y-1.5 sm:space-y-2">
                    {mod.subtasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => onNavigate(task.id)}
                        className="w-full flex items-center justify-between p-2 sm:p-2.5 rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all text-left text-[10px] sm:text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white group/btn"
                      >
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="text-sm sm:text-base bg-gray-100 dark:bg-gray-700 group-hover/btn:bg-white dark:group-hover/btn:bg-gray-600 p-1 rounded transition-colors shrink-0">{task.icon}</span>
                          <span className="truncate">{task.label}</span>
                        </div>
                        <span className="text-gray-400 dark:text-gray-500 group-hover/btn:translate-x-0.5 transition-transform text-[8px] sm:text-[10px] shrink-0">
                          ➔
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ─── RECENT ACTIVITIES ─── */}
        {recentActivities.length > 0 && (
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 sm:p-6">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <span>🔄</span> Recent Activities
            </h3>
            <div className="space-y-2">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm">{activity.type}</span>
                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{activity.description}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{activity.unit}</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{activity.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── FOOTER ─── */}
        <div className="mt-8 sm:mt-12 text-center text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 border-t pt-4 sm:pt-6 border-gray-200 dark:border-gray-700">
          <span>© 2026 GIS Asset Management System</span>
          <span className="mx-2 sm:mx-3">•</span>
          <span>Version 3.0.1</span>
          <span className="mx-2 sm:mx-3">•</span>
          <span>🟢 All systems operational</span>
        </div>

        

        {/* ─── STYLES ─── */}
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .bg-white, .relative, .grid > div {
            animation: fadeIn 0.5s ease-out forwards;
          }
          .grid > div:nth-child(2) { animation-delay: 0.1s; }
          .grid > div:nth-child(3) { animation-delay: 0.2s; }
          
          /* Scrollbar styling */
          ::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background: #d1d5db;
            border-radius: 2px;
          }
          .dark ::-webkit-scrollbar-thumb {
            background: #4b5563;
          }
        `}</style>
      </div>
    </div>
  );
};

export default MainDashboard;
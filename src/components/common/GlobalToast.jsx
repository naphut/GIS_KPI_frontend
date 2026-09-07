import React, { useState, useEffect } from 'react';

const GlobalToast = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToastEvent = (e) => {
      const { type = 'success', message, key, version } = e.detail || {};
      const id = `${Date.now()}-${Math.random()}`;

      const newToast = {
        id,
        type,
        message: message || 'Successfully saved to API Store!',
        key: key || '',
        version: version || 1,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };

      setToasts((prev) => [newToast, ...prev.slice(0, 3)]);

      // Auto remove after 3.5s
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    };

    window.addEventListener('api-store-toast', handleToastEvent);
    return () => window.removeEventListener('api-store-toast', handleToastEvent);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[9999999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto transform transition-all duration-300 ease-out translate-y-0 opacity-100 flex items-start gap-3 p-3.5 rounded-2xl shadow-2xl backdrop-blur-xl border ${
              isSuccess
                ? 'bg-slate-900/95 border-emerald-500/60 text-white shadow-emerald-500/20'
                : 'bg-slate-900/95 border-rose-500/60 text-white shadow-rose-500/20'
            }`}
          >
            {/* Status Icon */}
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm shadow-md ${
                isSuccess
                  ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-emerald-500/30 animate-pulse'
                  : 'bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-rose-500/30'
              }`}
            >
              {isSuccess ? '✓' : '✕'}
            </div>

            {/* Message Details */}
            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-xs font-black uppercase tracking-wider ${
                    isSuccess ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isSuccess ? 'API Store: Successfully' : 'API Store: Failed'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{toast.time}</span>
              </div>
              <p className="text-xs font-bold text-slate-100 mt-0.5 truncate">
                {toast.message}
              </p>
              {toast.key && (
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-300">
                  <span className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-mono text-[10px] text-emerald-300 truncate max-w-[190px]">
                    {toast.key}
                  </span>
                  {toast.version && (
                    <span className="text-[10px] text-slate-400">
                      v{toast.version}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-slate-400 hover:text-white p-1 transition-colors text-xs"
              title="Close"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default GlobalToast;

import React, { useState } from 'react';
import html2canvas from 'html2canvas';
import Sidebar from '../common/Sidebar';
import MainDashboard from '../dashboard/MainDashboard';
import DashboardCA from '../dashboard/Signed_CA_Dashbaord/Dashboard_CA';
import DashboardRequest from '../dashboard/Request_i_E_dashboard/Dashboard_Reuest';
import DashboardStockout from '../dashboard/Stockout_yet_Dashboard/Dashboad_Stockout';
import ImportCA from '../../Page/Signed_CA/Import_CA';
import ExportCA from '../../Page/Signed_CA/Export_CA';
import STOCKOUT_YET_CONFIRM from '../../Page/Stockout_yet/STOCKOUT_YET_CONFIRM';
import NO_CREATE_HAND_OVER from '../../Page/Stockout_yet/NO_CREATE_HAND_OVER';
import STOCK_OUT_NOTE_CONFIRMED from '../../Page/Stockout_yet/stock_out_note_confirmed';
import { Restock_in as RestockIn } from '../../Page/Request_IN_E/Restock_in';
import { Restock_out as RestockOut } from '../../Page/Request_IN_E/Restock_out';
import { 
  sendPhotoToTelegram, 
  sendDocumentToTelegram, 
  generateAllModulesExcelBlob 
} from '../../services/telegramBot';

const DashboardLayout = () => {
  const [selectedMenuItem, setSelectedMenuItem] = useState('dashboard');
  const [screenshotState, setScreenshotState] = useState(null);

  const handleSendTelegram = async (unit) => {
    try {
      // 1. Capture and send Stockout Summary
      setScreenshotState({ component: 'stockout', unit });
      await new Promise(resolve => setTimeout(resolve, 800));
      let reportEl = document.getElementById('telegram-summary-report');
      if (reportEl) {
        const canvas = await html2canvas(reportEl, { 
          scale: 3.5, 
          useCORS: true, 
          logging: false,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => {
            const el = clonedDoc.getElementById('telegram-summary-report');
            if (el) {
              el.style.position = 'static';
              el.style.zIndex = '999999';
              el.style.opacity = '1';
              el.style.visibility = 'visible';
              el.style.display = 'block';
              el.style.background = '#ffffff';
              
              const style = clonedDoc.createElement('style');
              style.innerHTML = `
                #telegram-summary-report * {
                  -webkit-font-smoothing: antialiased !important;
                  -moz-osx-font-smoothing: grayscale !important;
                  text-rendering: optimizeLegibility !important;
                  opacity: 1 !important;
                }
              `;
              clonedDoc.head.appendChild(style);
            }
          }
        });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          await sendPhotoToTelegram(unit, blob, `📊 របាយការណ៍ KPI Hand Over (${unit})`);
        }
      }

      // 2. Capture and send CA Signing Summary
      setScreenshotState({ component: 'ca', unit });
      await new Promise(resolve => setTimeout(resolve, 800));
      reportEl = document.getElementById('telegram-summary-report');
      if (reportEl) {
        const canvas = await html2canvas(reportEl, { 
          scale: 3.5, 
          useCORS: true, 
          logging: false,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => {
            const el = clonedDoc.getElementById('telegram-summary-report');
            if (el) {
              el.style.position = 'static';
              el.style.zIndex = '999999';
              el.style.opacity = '1';
              el.style.visibility = 'visible';
              el.style.display = 'block';
              el.style.background = '#ffffff';
              
              const style = clonedDoc.createElement('style');
              style.innerHTML = `
                #telegram-summary-report * {
                  -webkit-font-smoothing: antialiased !important;
                  -moz-osx-font-smoothing: grayscale !important;
                  text-rendering: optimizeLegibility !important;
                  opacity: 1 !important;
                }
              `;
              clonedDoc.head.appendChild(style);
            }
          }
        });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          await sendPhotoToTelegram(unit, blob, `📊 របាយការណ៍ KPI CA Signing (${unit})`);
        }
      }

      // 3. Capture and send Restock Summary
      setScreenshotState({ component: 'request', unit });
      await new Promise(resolve => setTimeout(resolve, 800));
      reportEl = document.getElementById('telegram-summary-report');
      if (reportEl) {
        const canvas = await html2canvas(reportEl, { 
          scale: 3.5, 
          useCORS: true, 
          logging: false,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => {
            const el = clonedDoc.getElementById('telegram-summary-report');
            if (el) {
              el.style.position = 'static';
              el.style.zIndex = '999999';
              el.style.opacity = '1';
              el.style.visibility = 'visible';
              el.style.display = 'block';
              el.style.background = '#ffffff';
              
              const style = clonedDoc.createElement('style');
              style.innerHTML = `
                #telegram-summary-report * {
                  -webkit-font-smoothing: antialiased !important;
                  -moz-osx-font-smoothing: grayscale !important;
                  text-rendering: optimizeLegibility !important;
                  opacity: 1 !important;
                }
              `;
              clonedDoc.head.appendChild(style);
            }
          }
        });
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          await sendPhotoToTelegram(unit, blob, `📊 របាយការណ៍ KPI Restock (${unit})`);
        }
      }

      // 4. Send the Excel Document
      const excelBlob = generateAllModulesExcelBlob(unit);
      const filename = `GIS_DASHBOARD_${unit}_${new Date().toISOString().split('T')[0]}.xls`;
      await sendDocumentToTelegram(unit, excelBlob, filename, `📊 របាយការណ៍ KPI ប្រចាំថ្ងៃ Stock Stock out (${unit})`);
    } catch (err) {
      console.error('Error generating or sending screenshots:', err);
      throw err;
    } finally {
      setScreenshotState(null);
    }
  };

  // Render content based on selected menu item
  const renderContent = () => {
    switch (selectedMenuItem) {
      case 'dashboard':
        return <MainDashboard onNavigate={setSelectedMenuItem} />;
      
      // Dashboard group overview pages
      case 'stockout_group':
        return <DashboardStockout isEmbedded={true} onNavigate={setSelectedMenuItem} />;
      
      case 'signed_ca_group':
        return <DashboardCA />;
      
      case 'restock_group':
        return <DashboardRequest />;

      // CONFIRMED HAND OVER ON SYSTEM Group
      case 'STOCKOUT_YET_CONFIRM':
        return <STOCKOUT_YET_CONFIRM />;
      
      case 'NO_CREATE_HAND_OVER':
        return <NO_CREATE_HAND_OVER />;
      
      case 'STOCK_OUT_NOTE_CONFIRMED':
        return <STOCK_OUT_NOTE_CONFIRMED />;
      
      // SIGNED "CA" ON THE SYSTEM YET Group
      case 'STOCK_OUT_IS_SIGNING':
        return <ExportCA />;
      
      case 'STOCK_IN_IS_SIGNING':
        return <ImportCA />;
      
      // RESTOCK GROUP
      case 'RESTOCK_IN':
        return <RestockIn />;
      
      case 'RESTOCK_OUT':
        return <RestockOut />;
      
      default:
        return <MainDashboard onNavigate={setSelectedMenuItem} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="flex-shrink-0">
        <Sidebar 
          onSelect={setSelectedMenuItem} 
          selected={selectedMenuItem} 
          onSendTelegram={handleSendTelegram}
        />
      </div>

      {/* Main Content */}
      <div key={selectedMenuItem} className="flex-1 overflow-y-auto animate-fadeIn">
        {renderContent()}
      </div>

      {/* Hidden Screenshot Renderer */}
      {screenshotState && (
        <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1200px', pointerEvents: 'none', zIndex: -1000 }}>
          {screenshotState.component === 'stockout' && (
            <DashboardStockout isEmbedded={true} screenshotUnit={screenshotState.unit} summaryImageMode={true} />
          )}
          {screenshotState.component === 'ca' && (
            <DashboardCA screenshotUnit={screenshotState.unit} summaryImageMode={true} />
          )}
          {screenshotState.component === 'request' && (
            <DashboardRequest screenshotUnit={screenshotState.unit} summaryImageMode={true} />
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardLayout;
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DashboardLayout from './components/layouts/DashboardLayout';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/*" element={<DashboardLayout />} />
      </Routes>
    </Router>
  );
}

export default App;

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import DoctorSetup from './pages/DoctorSetup';
import Dashboard from './pages/Dashboard';
import PatientList from './pages/PatientList';
import RecordVisit from './pages/RecordVisit';
import NotFound from './pages/NotFound';
import './index.css';

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Router>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
          },
          error: {
            duration: 5000,
          },
        }}
      />
      
      <Routes>
        {/* Public Routes */}
        <Route 
          path="/setup" 
          element={!isAuthenticated ? <DoctorSetup /> : <Navigate to="/dashboard" />} 
        />

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={isAuthenticated ? <Dashboard /> : <Navigate to="/setup" />}
        />
        <Route
          path="/patients"
          element={isAuthenticated ? <PatientList /> : <Navigate to="/setup" />}
        />
        <Route
          path="/record"
          element={isAuthenticated ? <RecordVisit /> : <Navigate to="/setup" />}
        />

        {/* Default Route */}
        <Route 
          path="/" 
          element={<Navigate to={isAuthenticated ? "/dashboard" : "/setup"} />} 
        />
        
        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
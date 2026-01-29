import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usePatientStore } from '../store/patientStore';
import { api } from '../services/api';
import { FileText, Users, Mic, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const navigate = useNavigate();
  const { doctor, logout } = useAuthStore();
  const { patients, setPatients } = usePatientStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (doctor) {
      loadPatients();
    }
  }, [doctor]);

  const loadPatients = async () => {
    try {
      const data = await api.listPatients(doctor!.id);
      setPatients(data);
    } catch (error) {
      console.error('Error loading patients:', error);
      toast.error('Failed to load patients');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/setup');
  };

  if (!doctor) {
    navigate('/setup');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Medical Scribe AI
            </h1>
            <p className="text-sm text-gray-600">Welcome, Dr. {doctor.name}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <button
            onClick={() => navigate('/record')}
            className="card hover:shadow-md transition-shadow cursor-pointer text-left"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <Mic className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-gray-900">Record Visit</h3>
                <p className="text-sm text-gray-600">Start a new recording</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => navigate('/patients')}
            className="card hover:shadow-md transition-shadow cursor-pointer text-left"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 rounded-lg">
                <Users className="w-8 h-8 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-gray-900">Patients</h3>
                <p className="text-sm text-gray-600">Manage patient records</p>
              </div>
            </div>
          </button>

          <div className="card">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <FileText className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-gray-900">
                  {patients.length}
                </h3>
                <p className="text-sm text-gray-600">Total Patients</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Patients */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Recent Patients
          </h2>
          
          {loading ? (
            <p className="text-gray-600">Loading patients...</p>
          ) : patients.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 mb-4">No patients yet</p>
              <button
                onClick={() => navigate('/patients')}
                className="btn-primary"
              >
                Add Your First Patient
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {patients.slice(0, 5).map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <h3 className="font-medium text-gray-900">{patient.name}</h3>
                    <p className="text-sm text-gray-600">ID: {patient.id}</p>
                  </div>
                  <button
                    onClick={() => navigate('/patients')}
                    className="btn-secondary text-sm"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
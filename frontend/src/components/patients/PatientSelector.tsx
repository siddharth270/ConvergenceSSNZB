import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { usePatientStore } from '../../store/patientStore';
import { api } from '../../services/api';
import { User, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PatientSelector() {
  const { doctor } = useAuthStore();
  const { patients, selectedPatient, setPatients, selectPatient, addPatient } = usePatientStore();
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPatient, setNewPatient] = useState({
    name: '',
    date_of_birth: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    if (!doctor) return;
    
    try {
      const data = await api.listPatients(doctor.id);
      setPatients(data);
    } catch (error) {
      console.error('Error loading patients:', error);
      toast.error('Failed to load patients');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPatient.name || !doctor) {
      toast.error('Patient name is required');
      return;
    }

    try {
      const patient = await api.createPatient(
        { ...newPatient, doctor_id: doctor.id },
        doctor.id
      );
      addPatient(patient);
      selectPatient(patient);
      setShowAddForm(false);
      setNewPatient({ name: '', date_of_birth: '', phone: '', email: '' });
      toast.success('Patient added successfully!');
    } catch (error: any) {
      console.error('Error creating patient:', error);
      toast.error(error.response?.data?.detail || 'Failed to create patient');
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading patients...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Patient Dropdown */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Patient *
        </label>
        <select
          value={selectedPatient?.id || ''}
          onChange={(e) => {
            const patient = patients.find(p => p.id === e.target.value);
            selectPatient(patient || null);
          }}
          className="input-field"
        >
          <option value="">-- Select a patient --</option>
          {patients.map(patient => (
            <option key={patient.id} value={patient.id}>
              {patient.name} (ID: {patient.id})
            </option>
          ))}
        </select>
      </div>

      {/* Add New Patient Button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-primary-600 hover:text-primary-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Patient</span>
        </button>
      )}

      {/* Add Patient Form */}
      {showAddForm && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <h3 className="font-semibold text-gray-900 mb-3">Add New Patient</h3>
          <form onSubmit={handleAddPatient} className="space-y-3">
            <input
              type="text"
              placeholder="Patient Name *"
              required
              value={newPatient.name}
              onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
              className="input-field"
            />
            <input
              type="date"
              placeholder="Date of Birth"
              value={newPatient.date_of_birth}
              onChange={(e) => setNewPatient({ ...newPatient, date_of_birth: e.target.value })}
              className="input-field"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={newPatient.phone}
              onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
              className="input-field"
            />
            <input
              type="email"
              placeholder="Email"
              value={newPatient.email}
              onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
              className="input-field"
            />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1">
                Add Patient
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Selected Patient Info */}
      {selectedPatient && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <User className="w-8 h-8 text-primary-600" />
            <div>
              <h3 className="font-semibold text-gray-900">{selectedPatient.name}</h3>
              <p className="text-sm text-gray-600">ID: {selectedPatient.id}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
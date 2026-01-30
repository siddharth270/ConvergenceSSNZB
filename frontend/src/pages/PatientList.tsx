import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usePatientStore } from '../store/patientStore';
import { api } from '../services/api';
import { ArrowLeft, Plus, Search, User, Calendar, Phone, Mail, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { Patient } from '../types';

export default function PatientList() {
  const navigate = useNavigate();
  const { doctor } = useAuthStore();
  const { patients, setPatients, addPatient } = usePatientStore();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [viewingNote, setViewingNote] = useState<any>(null);
  const [newPatient, setNewPatient] = useState({
    name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    medical_history: '',
    allergies: '',
    current_medications: '',
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
      setShowAddForm(false);
      setNewPatient({
        name: '',
        date_of_birth: '',
        gender: '',
        phone: '',
        email: '',
        address: '',
        medical_history: '',
        allergies: '',
        current_medications: '',
      });
      toast.success('Patient added successfully!');
    } catch (error: any) {
      console.error('Error creating patient:', error);
      toast.error(error.response?.data?.detail || 'Failed to create patient');
    }
  };

  const handleViewPatient = async (patientId: string) => {
    try {
      const patient = await api.getPatient(patientId);
      setSelectedPatient(patient);
    } catch (error) {
      console.error('Error fetching patient:', error);
      toast.error('Failed to load patient details');
    }
  };

  const filteredPatients = patients.filter(patient =>
    patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    patient.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!doctor) {
    navigate('/setup');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </button>
            
            <h1 className="text-2xl font-bold text-gray-900">Patient Management</h1>
            
            <button
              onClick={() => setShowAddForm(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span>Add Patient</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Patient List */}
          <div className="lg:col-span-2">
            <div className="card">
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search patients by name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-field pl-10"
                  />
                </div>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
                  <p className="text-gray-600 mt-2">Loading patients...</p>
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="text-center py-8">
                  <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">
                    {searchQuery ? 'No patients found' : 'No patients yet'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPatients.map((patient) => (
                    <div
                      key={patient.id}
                      onClick={() => handleViewPatient(patient.id)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedPatient?.id === patient.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                            <User className="w-6 h-6 text-primary-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{patient.name}</h3>
                            <p className="text-sm text-gray-600">ID: {patient.id}</p>
                          </div>
                        </div>
                        <button className="btn-secondary text-sm">
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Patient Details / Add Form */}
          <div className="lg:col-span-1">
            {showAddForm ? (
              <div className="card">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Add New Patient</h2>
                <form onSubmit={handleAddPatient} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newPatient.name}
                      onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                      className="input-field"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={newPatient.date_of_birth}
                      onChange={(e) => setNewPatient({ ...newPatient, date_of_birth: e.target.value })}
                      className="input-field"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Gender
                    </label>
                    <select
                      value={newPatient.gender}
                      onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
                      className="input-field"
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={newPatient.phone}
                      onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                      className="input-field"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={newPatient.email}
                      onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                      className="input-field"
                      placeholder="patient@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address
                    </label>
                    <textarea
                      value={newPatient.address}
                      onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
                      className="input-field"
                      rows={2}
                      placeholder="Street address"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Medical History
                    </label>
                    <textarea
                      value={newPatient.medical_history}
                      onChange={(e) => setNewPatient({ ...newPatient, medical_history: e.target.value })}
                      className="input-field"
                      rows={3}
                      placeholder="Previous conditions, surgeries, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Allergies
                    </label>
                    <textarea
                      value={newPatient.allergies}
                      onChange={(e) => setNewPatient({ ...newPatient, allergies: e.target.value })}
                      className="input-field"
                      rows={2}
                      placeholder="Known allergies"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Current Medications
                    </label>
                    <textarea
                      value={newPatient.current_medications}
                      onChange={(e) => setNewPatient({ ...newPatient, current_medications: e.target.value })}
                      className="input-field"
                      rows={2}
                      placeholder="Current medications"
                    />
                  </div>

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
            ) : selectedPatient ? (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">Patient Details</h2>
                  <button
                    onClick={() => setSelectedPatient(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-4 border-b">
                    <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
                      <User className="w-8 h-8 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{selectedPatient.name}</h3>
                      <p className="text-sm text-gray-600">ID: {selectedPatient.id}</p>
                    </div>
                  </div>

                  {selectedPatient.date_of_birth && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">DOB:</span>
                      <span className="font-medium">{selectedPatient.date_of_birth}</span>
                    </div>
                  )}

                  {selectedPatient.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">Phone:</span>
                      <span className="font-medium">{selectedPatient.phone}</span>
                    </div>
                  )}

                  {selectedPatient.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">Email:</span>
                      <span className="font-medium">{selectedPatient.email}</span>
                    </div>
                  )}

                  {selectedPatient.allergies && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-1">⚠️ Allergies</h4>
                      <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                        {selectedPatient.allergies}
                      </p>
                    </div>
                  )}

                  {selectedPatient.medical_history && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-1">Medical History</h4>
                      <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                        {selectedPatient.medical_history}
                      </p>
                    </div>
                  )}

                  {selectedPatient.current_medications && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-1">Current Medications</h4>
                      <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                        {selectedPatient.current_medications}
                      </p>
                    </div>
                  )}

                  <div className="pt-4 border-t">
  <h4 className="text-sm font-semibold text-gray-700 mb-3">📋 Recent Notes</h4>
  {selectedPatient.recent_soap_notes && selectedPatient.recent_soap_notes.length > 0 ? (
    <div className="space-y-3">
      {selectedPatient.recent_soap_notes.slice(0, 5).map((note) => (
        <div 
          key={note.id} 
          className="bg-white border border-gray-200 rounded-lg p-3 hover:border-primary-300 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded text-xs font-semibold">
                {note.visit_type?.toUpperCase()}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(note.created_at!).toLocaleDateString()}
              </span>
            </div>
            <button
              onClick={() => setViewingNote(note)}
              className="text-primary-600 hover:text-primary-700 p-1"
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-1">
            {note.conversation_summary && (
              <p className="text-xs text-gray-600 line-clamp-1">
                <span className="font-semibold">Summary:</span> {note.conversation_summary}
              </p>
            )}
            <p className="text-sm text-gray-700 line-clamp-2">
              <span className="font-semibold">Assessment:</span> {note.assessment || 'N/A'}
            </p>
            <p className="text-xs text-gray-600 line-clamp-1">
              <span className="font-semibold">Plan:</span> {note.plan || 'N/A'}
            </p>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
      <p className="text-sm text-gray-500">No notes yet</p>
    </div>
  )}
</div>
                </div>
              </div>
            ) : (
              <div className="card text-center py-8">
                <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">Select a patient to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* SOAP Note Modal */}
      {viewingNote && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingNote(null)}
        >
          <div 
            className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 pb-4 border-b">
              <h2 className="text-xl font-bold text-gray-900">SOAP Note Details</h2>
              <button
                onClick={() => setViewingNote(null)}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {viewingNote.conversation_summary && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">📋 Summary</h3>
                  <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded border border-blue-200">
                    {viewingNote.conversation_summary}
                  </p>
                </div>
              )}
              
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold mr-2">S</span>
                  Subjective
                </h3>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded border-l-4 border-green-500">
                  {viewingNote.subjective || 'N/A'}
                </p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold mr-2">O</span>
                  Objective
                </h3>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded border-l-4 border-blue-500">
                  {viewingNote.objective || 'N/A'}
                </p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-bold mr-2">A</span>
                  Assessment
                </h3>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded border-l-4 border-amber-500">
                  {viewingNote.assessment || 'N/A'}
                </p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-bold mr-2">P</span>
                  Plan
                </h3>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded border-l-4 border-purple-500">
                  {viewingNote.plan || 'N/A'}
                </p>
              </div>
              
              {viewingNote.key_insights && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">💡 Key Insights</h3>
                  <p className="text-sm text-gray-600 bg-yellow-50 p-3 rounded border border-yellow-200">
                    {viewingNote.key_insights}
                  </p>
                </div>
              )}
              
              {(() => {
                try {
                  const tasks = typeof viewingNote.admin_tasks === 'string' 
                    ? JSON.parse(viewingNote.admin_tasks) 
                    : viewingNote.admin_tasks;
                  if (tasks && Array.isArray(tasks) && tasks.length > 0) {
                    return (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">✅ Admin Tasks</h3>
                        <ul className="text-sm text-gray-600 bg-gray-50 p-3 rounded space-y-2">
                          {tasks.map((task: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-primary-500 font-bold">•</span>
                              <span>{task}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  }
                } catch (e) {
                  console.error('Error parsing admin_tasks:', e);
                }
                return null;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
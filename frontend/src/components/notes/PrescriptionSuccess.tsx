import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2, Home, MapPin, Phone, Clock, X } from 'lucide-react';
import { Prescription } from '../../types';
import toast from 'react-hot-toast';

interface PrescriptionSuccessProps {
  prescription: Prescription;
  patientName: string;
  doctorName: string;
}

// Mock pharmacy data
const NEARBY_PHARMACIES = [
  {
    id: '1',
    name: 'CVS Pharmacy',
    address: '123 Main Street, Burlington, MA',
    phone: '(781) 555-0101',
    distance: '0.5 miles',
    hours: 'Open until 9:00 PM'
  },
  {
    id: '2',
    name: 'Walgreens',
    address: '456 Lexington Ave, Burlington, MA',
    phone: '(781) 555-0202',
    distance: '0.8 miles',
    hours: 'Open 24 hours'
  },
  {
    id: '3',
    name: 'Rite Aid',
    address: '789 Cambridge St, Burlington, MA',
    phone: '(781) 555-0303',
    distance: '1.2 miles',
    hours: 'Open until 10:00 PM'
  },
  {
    id: '4',
    name: 'Stop & Shop Pharmacy',
    address: '321 Mall Road, Burlington, MA',
    phone: '(781) 555-0404',
    distance: '1.5 miles',
    hours: 'Open until 8:00 PM'
  },
  {
    id: '5',
    name: 'Target Pharmacy',
    address: '654 Middlesex Turnpike, Burlington, MA',
    phone: '(781) 555-0505',
    distance: '2.0 miles',
    hours: 'Open until 9:00 PM'
  }
];
// Helper component for vital signs
function VitalSignCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-white p-4 rounded-lg border-2 border-green-300 hover:border-green-400 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs text-gray-600 font-bold uppercase">{label}</span>
      </div>
      <p className="text-base font-bold text-gray-900">{value}</p>
    </div>
  );
}
export default function PrescriptionSuccess({ 
  prescription, 
  patientName, 
  doctorName 
}: PrescriptionSuccessProps) {
  const navigate = useNavigate();
  const [showPharmacyModal, setShowPharmacyModal] = useState(false);
  const [selectedPharmacy, setSelectedPharmacy] = useState<string>('');

  const handleSharePrescription = () => {
    if (!selectedPharmacy) {
      toast.error('Please select a pharmacy');
      return;
    }

    const pharmacy = NEARBY_PHARMACIES.find(p => p.id === selectedPharmacy);
    
    // Simulate sending prescription
    toast.loading('Sending prescription to pharmacy...', { duration: 2000 });
    
    setTimeout(() => {
      toast.success(`Prescription sent to ${pharmacy?.name}!`);
      setShowPharmacyModal(false);
      
      // Show confirmation message
      setTimeout(() => {
        toast.success(`Patient will receive SMS when ready for pickup`, {
          duration: 4000,
          icon: '📱'
        });
      }, 500);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Success Banner */}
      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
            <span className="text-2xl">✓</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-green-900">
              Prescription Generated Successfully
            </h2>
            <p className="text-sm text-green-700">
              Saved to database and ready to share
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
          <div>
            <span className="text-green-700 font-medium">Patient:</span>
            <p className="text-green-900 font-semibold">{patientName}</p>
          </div>
          <div>
            <span className="text-green-700 font-medium">Doctor:</span>
            <p className="text-green-900 font-semibold">{doctorName}</p>
          </div>
          <div>
            <span className="text-green-700 font-medium">Date:</span>
            <p className="text-green-900 font-semibold">
              {new Date().toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>
        </div>
      </div>

     {/* Chief Complaint & Diagnosis */}
      {(prescription.chief_complaint || prescription.diagnosis) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prescription.chief_complaint && (
            <div className="card bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-2xl">🚨</span>
                Chief Complaint
              </h3>
              <p className="text-gray-700 font-medium">{prescription.chief_complaint}</p>
            </div>
          )}
          
          {prescription.diagnosis && (
            <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-2xl">🩺</span>
                Diagnosis
              </h3>
              <p className="text-gray-700 font-semibold text-lg">{prescription.diagnosis}</p>
            </div>
          )}
        </div>
      )}

      {/* Presenting Symptoms */}
      {prescription.symptoms && prescription.symptoms.length > 0 && (
        <div className="card bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-2xl">📋</span>
            Presenting Symptoms
          </h3>
          <div className="flex flex-wrap gap-2">
            {prescription.symptoms.map((symptom, idx) => (
              <span 
                key={idx} 
                className="bg-yellow-200 text-yellow-900 px-4 py-2 rounded-full text-sm font-semibold border border-yellow-300 hover:bg-yellow-300 transition-colors"
              >
                {symptom}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Vital Signs */}
      {prescription.vital_signs && Object.values(prescription.vital_signs).some(v => v) && (
        <div className="card bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-2xl">❤️</span>
            Vital Signs
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {prescription.vital_signs.blood_pressure && (
              <VitalSignCard icon="🩸" label="Blood Pressure" value={prescription.vital_signs.blood_pressure} />
            )}
            {prescription.vital_signs.heart_rate && (
              <VitalSignCard icon="💓" label="Heart Rate" value={prescription.vital_signs.heart_rate} />
            )}
            {prescription.vital_signs.temperature && (
              <VitalSignCard icon="🌡️" label="Temperature" value={prescription.vital_signs.temperature} />
            )}
            {prescription.vital_signs.respiratory_rate && (
              <VitalSignCard icon="🫁" label="Respiratory Rate" value={prescription.vital_signs.respiratory_rate} />
            )}
            {prescription.vital_signs.oxygen_saturation && (
              <VitalSignCard icon="💨" label="O₂ Saturation" value={prescription.vital_signs.oxygen_saturation} />
            )}
            {prescription.vital_signs.weight && (
              <VitalSignCard icon="⚖️" label="Weight" value={prescription.vital_signs.weight} />
            )}
          </div>
        </div>
      )}
      {/* Medications Inventory */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">💊</span>
            Prescribed Medications
          </h3>
          <span className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-semibold">
            {prescription.medications.length} {prescription.medications.length === 1 ? 'Medicine' : 'Medicines'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prescription.medications.map((med, idx) => (
            <div 
              key={idx} 
              className="border-2 border-indigo-200 rounded-xl p-5 hover:border-indigo-400 hover:shadow-lg transition-all bg-gradient-to-br from-white via-indigo-50 to-purple-50"
            >
              {/* Medicine Name */}
              <div className="flex items-start justify-between mb-3">
                <h4 className="font-bold text-lg text-gray-900 leading-tight">
                  {med.name}
                </h4>
                <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-semibold">
                  #{idx + 1}
                </span>
              </div>

              {/* Medication Details */}
              <div className="space-y-2.5 mb-4">
                <div className="flex items-start gap-3 p-2 bg-white rounded-lg border border-indigo-100">
                  <span className="text-2xl">💊</span>
                  <div className="flex-1">
                    <span className="text-xs text-gray-500 uppercase font-semibold block mb-1">Dosage</span>
                    <span className="font-bold text-gray-900 text-base">{med.dose}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2 bg-white rounded-lg border border-indigo-100">
                  <span className="text-2xl">📅</span>
                  <div className="flex-1">
                    <span className="text-xs text-gray-500 uppercase font-semibold block mb-1">Frequency</span>
                    <span className="font-bold text-gray-900">{med.frequency}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2 bg-white rounded-lg border border-indigo-100">
                  <span className="text-2xl">⏱️</span>
                  <div className="flex-1">
                    <span className="text-xs text-gray-500 uppercase font-semibold block mb-1">Duration</span>
                    <span className="font-bold text-gray-900">{med.duration}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2 bg-white rounded-lg border border-indigo-100">
                  <span className="text-2xl">🔄</span>
                  <div className="flex-1">
                    <span className="text-xs text-gray-500 uppercase font-semibold block mb-1">Route</span>
                    <span className="font-bold text-gray-900">{med.route}</span>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              {med.instructions && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-blue-900 flex items-start gap-2">
                    <span className="text-lg">📝</span>
                    <span className="flex-1">{med.instructions}</span>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Additional Information */}
      {(prescription.instructions || prescription.warnings?.length > 0) && (
        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-xl">📋</span>
            Additional Instructions
          </h3>

          {prescription.instructions && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-700">{prescription.instructions}</p>
            </div>
          )}

          {prescription.warnings && prescription.warnings.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                <span>⚠️</span> Important Warnings
              </h4>
              <ul className="space-y-1">
                {prescription.warnings.map((warning, idx) => (
                  <li key={idx} className="text-sm text-red-700 flex items-start gap-2">
                    <span>•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {prescription.follow_up && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
              <h4 className="font-semibold text-amber-900 mb-1 flex items-center gap-2">
                <span>📅</span> Follow-up
              </h4>
              <p className="text-sm text-amber-700">{prescription.follow_up}</p>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button
          onClick={() => setShowPharmacyModal(true)}
          className="btn-primary flex-1 flex items-center justify-center gap-2 py-4 text-lg"
        >
          <Share2 className="w-5 h-5" />
          Share Prescription with Pharmacy
        </button>

        <button
          onClick={() => navigate('/dashboard')}
          className="btn-secondary flex items-center gap-2 px-6"
        >
          <Home className="w-5 h-5" />
          Dashboard
        </button>
      </div>

      {/* Pharmacy Selection Modal */}
      {showPharmacyModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPharmacyModal(false)}
        >
          <div 
            className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Select Nearby Pharmacy
              </h2>
              <button
                onClick={() => setShowPharmacyModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              Choose a pharmacy to send the prescription electronically. Patient will receive SMS notification when ready for pickup.
            </p>

            <div className="space-y-3">
              {NEARBY_PHARMACIES.map((pharmacy) => (
                <div
                  key={pharmacy.id}
                  onClick={() => setSelectedPharmacy(pharmacy.id)}
                  className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                    selectedPharmacy === pharmacy.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 mb-1">
                        {pharmacy.name}
                      </h3>
                      
                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span>{pharmacy.address}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          <span>{pharmacy.phone}</span>
                        </div>
                        
                        <div className="flex items-center gap-4 mt-2">
                          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-semibold">
                            📍 {pharmacy.distance}
                          </span>
                          <span className="flex items-center gap-1 text-green-700">
                            <Clock className="w-3 h-3" />
                            {pharmacy.hours}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      selectedPharmacy === pharmacy.id
                        ? 'border-primary-500 bg-primary-500'
                        : 'border-gray-300'
                    }`}>
                      {selectedPharmacy === pharmacy.id && (
                        <span className="text-white text-sm">✓</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowPharmacyModal(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSharePrescription}
                disabled={!selectedPharmacy}
                className="btn-primary flex-1"
              >
                Send Prescription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
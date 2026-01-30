import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Pill } from 'lucide-react';
import toast from 'react-hot-toast';
import AudioRecorder from '../components/audio/AudioRecorder';
import PatientSelector from '../components/patients/PatientSelector';
import { useAuthStore } from '../store/authStore';
import { usePatientStore } from '../store/patientStore';
import { api } from '../services/api';
import { NoteType, VisitType, SOAPNote, Prescription } from '../types';
import PrescriptionSuccess from '../components/notes/PrescriptionSuccess';

type WorkflowStep = 'select-patient' | 'recording' | 'transcription' | 'processing' | 'note-success';

export default function RecordVisit() {
  const navigate = useNavigate();
  const { doctor } = useAuthStore();
  const { selectedPatient } = usePatientStore();
  
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('select-patient');
  const [noteType, setNoteType] = useState<NoteType>('soap');
  const [visitType, setVisitType] = useState<VisitType>('followup');
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedNote, setGeneratedNote] = useState<SOAPNote | Prescription | null>(null);

  const handleRecordingComplete = async (blob: Blob) => {
    if (!selectedPatient || !doctor) {
      toast.error('Please select a patient first');
      return;
    }

    setCurrentStep('processing');
    setIsProcessing(true);
    const loadingToast = toast.loading('Transcribing audio...');

    try {
      const result = await api.transcribeAudio(blob, selectedPatient.id, doctor.id);
      setTranscript(result.transcript);
      setCurrentStep('transcription');
      toast.success('Transcription complete!', { id: loadingToast });
    } catch (error: any) {
      console.error('Transcription error:', error);
      toast.error(error.response?.data?.detail || 'Failed to transcribe audio', { 
        id: loadingToast 
      });
      setCurrentStep('recording');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateNote = async () => {
    if (!selectedPatient || !doctor || !transcript) {
      toast.error('Missing required information');
      return;
    }

    setIsProcessing(true);
    const loadingToast = toast.loading('Generating clinical note...');

    try {
      const result = await api.generateNote({
        transcript,
        note_type: noteType,
        visit_type: visitType,
        patient_name: selectedPatient.name,
        patient_id: selectedPatient.id,
        doctor_id: doctor.id,
      });

      toast.success(`${noteType.toUpperCase()} note generated!`, { id: loadingToast });
      setGeneratedNote(result);
      setCurrentStep('note-success');
    } catch (error: any) {
      console.error('Note generation error:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate note', { 
        id: loadingToast 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </button>
            
            <h1 className="text-2xl font-bold text-gray-900">Record Visit</h1>
            
            <div className="w-32" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Step 1: Patient Selection */}
        {currentStep === 'select-patient' && (
          <div className="card space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Select Patient</h2>
            
            <PatientSelector />
            
            {selectedPatient && (
              <>
                <div className="border-t pt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Note Type
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setNoteType('soap')}
                        className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-colors ${
                          noteType === 'soap'
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <FileText className="w-5 h-5" />
                        <span className="font-medium">SOAP Note</span>
                      </button>
                      
                      <button
                        onClick={() => setNoteType('prescription')}
                        className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-colors ${
                          noteType === 'prescription'
                            ? 'border-medical-green bg-green-50 text-green-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Pill className="w-5 h-5" />
                        <span className="font-medium">Prescription</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Visit Type
                    </label>
                    <select
                      value={visitType}
                      onChange={(e) => setVisitType(e.target.value as VisitType)}
                      className="input-field"
                    >
                      <option value="new">New Patient</option>
                      <option value="followup">Follow-up</option>
                      <option value="repeat">Repeat Visit</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => setCurrentStep('recording')}
                  className="btn-primary w-full py-3"
                >
                  Continue to Recording
                </button>
              </>
            )}
          </div>
        )}

        {/* Step 2: Recording */}
        {currentStep === 'recording' && selectedPatient && (
          <div className="card space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Recording Visit for {selectedPatient.name}
              </h2>
              <p className="text-gray-600">
                {noteType === 'soap' ? 'SOAP Note' : 'Prescription'} • {visitType}
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">
                <strong>📋 Recording Tips:</strong> Speak clearly and include all relevant clinical information. 
                The recording will be automatically transcribed and structured into a clinical note.
              </p>
            </div>

            <AudioRecorder onRecordingComplete={handleRecordingComplete} />

            <button
              onClick={() => setCurrentStep('select-patient')}
              className="btn-secondary w-full"
            >
              Back
            </button>
          </div>
        )}

        {/* Step 3: Processing */}
        {currentStep === 'processing' && (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Processing Audio...
            </h2>
            <p className="text-gray-600">This may take a moment</p>
          </div>
        )}

        {/* Step 4: Transcription Review */}
        {currentStep === 'transcription' && (
          <div className="card space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Review Transcription</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transcript (editable)
              </label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={12}
                className="input-field font-mono text-sm"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setCurrentStep('select-patient');
                  setTranscript('');
                }}
                className="btn-secondary"
              >
                Start Over
              </button>
              
              <button
                onClick={handleGenerateNote}
                disabled={isProcessing || !transcript.trim()}
                className="btn-primary flex-1"
              >
                {isProcessing ? 'Generating...' : `Generate ${noteType.toUpperCase()} Note`}
              </button>
            </div>
          </div>
        )}

                {/* Step 5: Success with Prescription Inventory */}
        {currentStep === 'note-success' && generatedNote && (
          <div className="space-y-6">
            {noteType === 'prescription' ? (
              <PrescriptionSuccess
                prescription={generatedNote as Prescription}
                patientName={selectedPatient!.name}
                doctorName={doctor!.name}
              />
            ) : (
              <div className="card text-center py-12">
                <div className="text-6xl mb-4">✅</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  SOAP Note Saved Successfully!
                </h2>
                <p className="text-gray-600 mb-6">
                  Your clinical documentation has been saved to the database.
                </p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="btn-primary"
                >
                  Back to Dashboard
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
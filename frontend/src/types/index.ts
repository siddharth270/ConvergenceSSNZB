export interface Doctor {
  id: string;
  name: string;
  email: string;
  specialty?: string;
  license_number?: string;
  phone?: string;
  created_at: string;
}

export interface Patient {
  id: string;
  name: string;
  date_of_birth?: string;
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  medical_history?: string;
  allergies?: string;
  current_medications?: string;
  doctor_id: string;
  created_at: string;
  recent_soap_notes?: SOAPNote[];
  recent_prescriptions?: Prescription[];
}

export interface Medication {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface SOAPNote {
  id?: string;
  patient_id: string;
  doctor_id: string;
  conversation_id?: string;
  visit_type: 'new' | 'followup' | 'repeat';
  conversation_summary: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  key_insights: string;
  admin_tasks: string[];
  created_at?: string;
}

export interface Prescription {
  id?: string;
  patient_id: string;
  doctor_id: string;
  conversation_id?: string;
  patient_name: string;
  chief_complaint: string;
  symptoms: string[];
  diagnosis: string;
  vital_signs: {
    blood_pressure?: string;
    heart_rate?: string;
    temperature?: string;
    respiratory_rate?: string;
    oxygen_saturation?: string;
    weight?: string;
  };
  medications: Medication[];
  instructions: string;
  warnings: string[];
  follow_up: string;
  created_at?: string;
}

export interface TranscribeResponse {
  transcript: string;
  status: string;
  audio_duration: string;
  conversation_id?: string;
}

export interface SummarizeRequest {
  transcript: string;
  note_type: 'soap' | 'prescription';
  visit_type: 'new' | 'followup' | 'repeat';
  patient_name: string;
  patient_id: string;
  doctor_id: string;
  conversation_id?: string;
  soap_context?: Partial<SOAPNote>;
}

export type NoteType = 'soap' | 'prescription';
export type VisitType = 'new' | 'followup' | 'repeat';
export type RecordingState = 'idle' | 'recording' | 'paused' | 'processing';
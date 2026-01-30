import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  Doctor, 
  Patient, 
  SOAPNote, 
  Prescription, 
  TranscribeResponse, 
  SummarizeRequest 
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error('API Error:', error.response?.data || error.message);
        throw error;
      }
    );
  }

  async healthCheck() {
    const response = await this.client.get('/health');
    return response.data;
  }

  // Doctor Management
  async createDoctor(data: Omit<Doctor, 'id' | 'created_at'>) {
    const response = await this.client.post<Doctor>('/api/doctors', data);
    return response.data;
  }

  async getDoctor(doctorId: string) {
    const response = await this.client.get<Doctor>(`/api/doctors/${doctorId}`);
    return response.data;
  }

  async listDoctors() {
    const response = await this.client.get<Doctor[]>('/api/doctors');
    return response.data;
  }

  // Patient Management
  async createPatient(data: Omit<Patient, 'id' | 'created_at'>, doctorId: string) {
    const response = await this.client.post<Patient>('/api/patients', data, {
      params: { doctor_id: doctorId }
    });
    return response.data;
  }

  async getPatient(patientId: string) {
    const response = await this.client.get<Patient>(`/api/patients/${patientId}`);
    return response.data;
  }

  async listPatients(doctorId: string) {
    const response = await this.client.get<Patient[]>('/api/patients', {
      params: { doctor_id: doctorId }
    });
    return response.data;
  }

  // Audio Transcription
  async transcribeAudio(audioBlob: Blob, patientId: string, doctorId: string) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('patient_id', patientId);
    formData.append('doctor_id', doctorId);

    const response = await this.client.post<TranscribeResponse>(
      '/api/transcribe',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      }
    );
    return response.data;
  }

  // Note Generation
  async generateNote(data: SummarizeRequest) {
    const response = await this.client.post<SOAPNote | Prescription>(
      '/api/summarize',
      data
    );
    return response.data;
  }

  // SOAP Notes
  async getSOAPNote(noteId: string) {
    const response = await this.client.get<SOAPNote>(`/api/soap-notes/${noteId}`);
    return response.data;
  }

  async listSOAPNotes(patientId?: string, doctorId?: string, limit = 20) {
    const response = await this.client.get<SOAPNote[]>('/api/soap-notes', {
      params: { patient_id: patientId, doctor_id: doctorId, limit }
    });
    return response.data;
  }

  // Prescriptions
  async getPrescription(prescriptionId: string) {
    const response = await this.client.get<Prescription>(`/api/prescriptions/${prescriptionId}`);
    return response.data;
  }

  async listPrescriptions(patientId?: string, doctorId?: string, limit = 20) {
    const response = await this.client.get<Prescription[]>('/api/prescriptions', {
      params: { patient_id: patientId, doctor_id: doctorId, limit }
    });
    return response.data;
  }
}

export const api = new ApiService();
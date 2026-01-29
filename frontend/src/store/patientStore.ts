import { create } from 'zustand';
import { Patient } from '../types';

interface PatientState {
  patients: Patient[];
  selectedPatient: Patient | null;
  setPatients: (patients: Patient[]) => void;
  addPatient: (patient: Patient) => void;
  selectPatient: (patient: Patient | null) => void;
}

export const usePatientStore = create<PatientState>((set) => ({
  patients: [],
  selectedPatient: null,
  setPatients: (patients) => set({ patients }),
  addPatient: (patient) => set((state) => ({ 
    patients: [patient, ...state.patients] 
  })),
  selectPatient: (patient) => set({ selectedPatient: patient }),
}));
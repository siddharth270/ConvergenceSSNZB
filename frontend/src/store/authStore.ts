import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Doctor } from '../types';

interface AuthState {
  doctor: Doctor | null;
  isAuthenticated: boolean;
  setDoctor: (doctor: Doctor) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      doctor: null,
      isAuthenticated: false,
      setDoctor: (doctor) => set({ doctor, isAuthenticated: true }),
      logout: () => set({ doctor: null, isAuthenticated: false }),
    }),
    {
      name: 'doctor-auth',
    }
  )
);
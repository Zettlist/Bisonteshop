import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            _hydrated: false,

            setUser: (userData) => set({
                user: userData,
                isAuthenticated: !!userData
            }),

            updateUser: (partialData) => set((state) => ({
                user: { ...state.user, ...partialData }
            })),

            clearUser: () => set({
                user: null,
                isAuthenticated: false
            }),

            _setHydrated: () => set({ _hydrated: true }),
        }),
        {
            name: 'bisonte-auth',
            partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
            onRehydrateStorage: () => (state) => {
                if (state) state._setHydrated();
            },
        }
    )
);

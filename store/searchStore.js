import { create } from 'zustand';

// Termino de busqueda compartido. Vive fuera de las paginas porque el buscador
// esta en la barra de navegacion (global) y quien filtra son los catalogos
// (/mangas, /figuras, /adultos). Sin persist: una busqueda es de la sesion de
// navegacion, no algo que convenga recordar entre visitas.
export const useSearchStore = create((set) => ({
    term: '',
    setTerm: (term) => set({ term }),
    clearTerm: () => set({ term: '' }),
}));

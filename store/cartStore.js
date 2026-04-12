import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      shippingCost: 0,
      appliedCredit: 0,
      appliedDiscount: { code: null, amount: 0 },
      isSyncing: false,
      isCartOpen: false,
      isLoginOpen: false,

      setIsCartOpen: (isOpen) => set({ isCartOpen: isOpen }),
      setIsLoginOpen: (isOpen) => set({ isLoginOpen: isOpen }),

      // Sync local cart to db (optional / called manually or via effect plugin if needed)
      syncToBackend: async (userId) => {
        try {
          set({ isSyncing: true });
          const items = get().items;
          const res = await fetch('/api/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, items })
          });
          if (!res.ok) throw new Error('Failed to sync cart');
        } catch (error) {
          console.error("Cart sync error:", error);
        } finally {
          set({ isSyncing: false });
        }
      },

      loadFromBackend: async (userId) => {
        try {
          const res = await fetch(`/api/cart?userId=${userId}`);
          if (res.ok) {
            const data = await res.json();
            set({ items: data.items || [] });
          }
        } catch (error) {
          console.error("Cart load error:", error);
        }
      },

      addItem: (product, quantity = 1, type = 'stock', anticipo_percent = 0) => set((state) => {
        const existing = state.items.find((i) => i.id === product.id && i.type === type);
        let newItems;
        if (existing) {
          newItems = state.items.map((i) => 
            (i.id === product.id && i.type === type) 
              ? { ...i, quantity: i.quantity + quantity } 
              : i
          );
        } else {
          newItems = [...state.items, { 
            ...product, 
            quantity, 
            type, 
            anticipo_percent 
          }];
        }
        return { items: newItems };
      }),

      removeItem: (productId, type) => set((state) => ({
        items: state.items.filter((i) => !(i.id === productId && i.type === type))
      })),

      updateQuantity: (productId, type, quantity) => set((state) => ({
        items: quantity <= 0 
          ? state.items.filter((i) => !(i.id === productId && i.type === type))
          : state.items.map((i) => 
              (i.id === productId && i.type === type) ? { ...i, quantity } : i
            )
      })),

      clearCart: () => set({ items: [], shippingCost: 0, appliedCredit: 0 }),
      
      setShippingCost: (cost) => set({ shippingCost: cost }),
      
      applyCredit: (amount) => set({ appliedCredit: amount }),
      
      removeCredit: () => set({ appliedCredit: 0 }),

      setDiscount: (code, amount) => set({ appliedDiscount: { code, amount } }),
      
      removeDiscount: () => set({ appliedDiscount: { code: null, amount: 0 } }),

      // Derived totals
      getTotals: () => {
        const { items, shippingCost, appliedCredit, appliedDiscount } = get();
        
        let subtotalStock = 0;
        let subtotalAnticipos = 0;
        let totalLater = 0;

        items.forEach((item) => {
          const itemTotal = Number(item.price) * item.quantity;
          if (item.type === 'stock') {
            subtotalStock += itemTotal;
          } else if (item.type === 'preventa') {
            const anticipoAmount = itemTotal * (item.anticipo_percent / 100);
            subtotalAnticipos += anticipoAmount;
            totalLater += (itemTotal - anticipoAmount);
          }
        });

        // Cobro inmediato: Stock + Anticipos + Envio
        let totalToPayNow = subtotalStock + subtotalAnticipos + Number(shippingCost);
        
        // Aplicar codigo de descuento al total a pagar
        const promoDiscount = Math.min(appliedDiscount.amount, totalToPayNow);
        totalToPayNow -= promoDiscount;

        // Aplicar credito despues de descuento
        const creditDiscount = Math.min(appliedCredit, totalToPayNow);
        totalToPayNow -= creditDiscount;

        return {
          subtotalStock,
          subtotalAnticipos,
          shippingCost: Number(shippingCost),
          totalLater,
          creditDiscount,
          promoDiscount,
          totalToPayNow
        };
      }
    }),
    {
      name: 'bisonte-cart-storage',
      // We only persist items and credit optionally. 
      // But we probably don't want to persist shipping cost between big sessions.
      partialize: (state) => ({ items: state.items, appliedCredit: state.appliedCredit, appliedDiscount: state.appliedDiscount }),
    }
  )
);

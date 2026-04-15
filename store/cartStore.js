import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      shippingCost: 0,
      appliedCredit: 0,
      appliedCoupons: [],          // array de { code, amount }
      appliedDiscount: { code: null, amount: 0 }, // compat legacy
      isSyncing: false,
      isCartOpen: false,
      isLoginOpen: false,

      setIsCartOpen: (isOpen) => set({ isCartOpen: isOpen }),
      setIsLoginOpen: (isOpen) => set({ isLoginOpen: isOpen }),

      syncToBackend: async (userId) => {
        try {
          set({ isSyncing: true });
          const items = get().items;
          await fetch('/api/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, items })
          });
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
          newItems = [...state.items, { ...product, quantity, type, anticipo_percent }];
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

      clearCart: () => set({ items: [], shippingCost: 0, appliedCredit: 0, appliedCoupons: [] }),

      setShippingCost: (cost) => set({ shippingCost: cost }),

      applyCredit: (amount) => set({ appliedCredit: amount }),
      removeCredit: () => set({ appliedCredit: 0 }),

      // ── Cupones múltiples ──────────────────────────────
      addCoupon: (code, amount) => set((state) => {
        const already = state.appliedCoupons.find(c => c.code === code);
        if (already) return {};
        return { appliedCoupons: [...state.appliedCoupons, { code, amount }] };
      }),

      removeCoupon: (code) => set((state) => ({
        appliedCoupons: state.appliedCoupons.filter(c => c.code !== code)
      })),

      // compat (setDiscount / removeDiscount siguen funcionando)
      setDiscount: (code, amount) => set((state) => {
        const already = state.appliedCoupons.find(c => c.code === code);
        if (already) return {};
        return { appliedCoupons: [...state.appliedCoupons, { code, amount }] };
      }),
      removeDiscount: () => set({ appliedCoupons: [] }),

      // ── Totales ────────────────────────────────────────
      getTotals: () => {
        const { items, shippingCost, appliedCredit, appliedCoupons } = get();

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

        let totalToPayNow = subtotalStock + subtotalAnticipos + Number(shippingCost);

        // Sumar todos los cupones
        const totalCouponDiscount = (appliedCoupons || []).reduce((sum, c) => sum + c.amount, 0);
        const promoDiscount = Math.min(totalCouponDiscount, totalToPayNow);
        totalToPayNow -= promoDiscount;

        // Crédito de tienda
        const creditDiscount = Math.min(appliedCredit, totalToPayNow);
        totalToPayNow -= creditDiscount;

        return {
          subtotalStock,
          subtotalAnticipos,
          shippingCost: Number(shippingCost),
          totalLater,
          creditDiscount,
          promoDiscount,
          totalToPayNow,
          appliedCoupons: appliedCoupons || [],
        };
      }
    }),
    {
      name: 'bisonte-cart-storage',
      partialize: (state) => ({
        items: state.items,
        appliedCredit: state.appliedCredit,
        appliedCoupons: state.appliedCoupons,
      }),
    }
  )
);

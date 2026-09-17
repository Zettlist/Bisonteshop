'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';

/**
 * El saldo de tienda del cliente, para pintarlo donde haga falta.
 *
 * Se pide una vez por montaje y no en cada navegacion: el saldo cambia poco —
 * lo mueve una compra o una recarga en el mostrador— y una consulta por pagina
 * seria mucho ruido para un dato que casi siempre es el mismo. La pantalla de
 * /perfil/credito pide el suyo aparte y ahi sale siempre fresco, que es donde
 * de verdad importa el detalle.
 *
 * `null` mientras no se sabe. Quien pinte esto tiene que distinguir «todavia no
 * lo se» de «es cero»: enseñar $0.00 durante la carga a alguien que tiene saldo
 * es peor que no enseñar nada.
 */
export function useCredito() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const [balance, setBalance] = useState(null);

    useEffect(() => {
        if (!isAuthenticated) {
            setBalance(null);
            return;
        }
        let vivo = true;
        fetch('/api/credit')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (vivo && d) setBalance(Number(d.balance) || 0); })
            .catch(() => { /* sin saldo a la vista, que no es lo mismo que cero */ });
        return () => { vivo = false; };
    }, [isAuthenticated]);

    return balance;
}

/** El saldo en pesos, como se escribe en la tienda. */
export const formatearCredito = (n) => `$${Number(n || 0).toFixed(2)}`;

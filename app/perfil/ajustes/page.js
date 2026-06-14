'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import {
    User, Package, CreditCard, Bell, Settings,
    ChevronDown, Lock, Check, Loader2
} from 'lucide-react';
import commonStyles from '../CommonProfile.module.css';
import styles from './Ajustes.module.css';

// ── Avatar categories ──────────────────────────────────
const AVATAR_CATEGORIES = [
    {
        id: 'mechas',
        label: '🤖 Mechas',
        seeds: ['Gundam', 'Evangelion', 'SuperRobot', 'AeroMecha', 'TinBot', 'R2D2', 'MilMech', 'Samurai', 'MechaHead'],
    },
    {
        id: 'pixel',
        label: '🎮 Pixel',
        seeds: ['GatoPixel', 'Slime', 'Mushroom', 'Invader', 'Ghost', 'PixelHero', 'Dragon', 'Heart', 'Sword'],
    },
    {
        id: 'heroes',
        label: '⚔️ Héroes',
        seeds: ['Wizard', 'Ninja', 'Samurai', 'Swordsman', 'Archer', 'Monk', 'Warlock', 'Paladin', 'Druid'],
    },
    {
        id: 'yokai',
        label: '👹 Yōkai',
        seeds: ['Oni', 'Kitsune', 'Daruma', 'Maneki', 'Tengu', 'Tanuki', 'Kappa', 'Shisa', 'Yurei'],
    },
    {
        id: 'kawaii',
        label: '🐾 Kawaii',
        seeds: ['Shiba', 'BlackCat', 'Panda', 'Axolotl', 'Capybara', 'RedPanda', 'Bunny', 'Frog', 'Corgi'],
    },
];

const ESTADOS_MX = [
    'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
    'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco',
    'México', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro',
    'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala',
    'Veracruz', 'Yucatán', 'Zacatecas',
];

// ── Accordion section ──────────────────────────────────
function Section({ icon: Icon, title, defaultOpen = false, children }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={styles.section}>
            <button className={styles.sectionHeader} onClick={() => setOpen(v => !v)}>
                <span className={styles.sectionLeft}>
                    <span className={styles.sectionIcon}><Icon size={16} /></span>
                    <span className={styles.sectionTitle}>{title}</span>
                </span>
                <ChevronDown
                    size={18}
                    className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
                />
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className={styles.sectionBody}>{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Save button with animation ─────────────────────────
function SaveButton({ label = 'Guardar Cambios', onSave, onError }) {
    const [status, setStatus] = useState('idle'); // idle | loading | success

    const handleClick = async () => {
        if (status !== 'idle') return;
        setStatus('loading');
        try {
            if (onSave) await onSave();
            setStatus('success');
            setTimeout(() => setStatus('idle'), 2500);
        } catch (e) {
            console.error('Save error:', e);
            if (onError) onError(e);
            setStatus('idle');
        }
    };

    return (
        <motion.button
            className={`${styles.btnPrimary} ${status === 'success' ? styles.btnSuccess : ''}`}
            onClick={handleClick}
            disabled={status !== 'idle'}
            whileTap={{ scale: 0.97 }}
            animate={status === 'success' ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 0.3 }}
        >
            <AnimatePresence mode="wait" initial={false}>
                {status === 'idle' && (
                    <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                        {label}
                    </motion.span>
                )}
                {status === 'loading' && (
                    <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className={styles.btnInner}>
                        <Loader2 size={15} className={styles.spinner} /> Guardando...
                    </motion.span>
                )}
                {status === 'success' && (
                    <motion.span key="success" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className={styles.btnInner}>
                        <Check size={15} /> ¡Guardado!
                    </motion.span>
                )}
            </AnimatePresence>
        </motion.button>
    );
}

// ── Custom Select ──────────────────────────────────────
function SelectField({ options, value, onChange, placeholder }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selected = options.find(o => o.value === value);

    return (
        <div className={styles.customSelect} ref={ref}>
            <button
                type="button"
                className={styles.customSelectTrigger}
                onClick={() => setOpen(v => !v)}
            >
                <span className={selected ? styles.customSelectValue : styles.customSelectPlaceholder}>
                    {selected ? selected.label : (placeholder || 'Seleccionar...')}
                </span>
                <ChevronDown size={14} className={`${styles.customSelectChevron} ${open ? styles.customSelectChevronOpen : ''}`} />
            </button>
            {open && (
                <div className={styles.customSelectDropdown}>
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            className={`${styles.customSelectOption} ${opt.value === value ? styles.customSelectOptionActive : ''}`}
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                        >
                            {opt.value === value && <Check size={12} style={{ flexShrink: 0 }} />}
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Toggle switch ──────────────────────────────────────
function Toggle({ value, onChange }) {
    return (
        <button
            className={`${styles.toggle} ${value ? styles.toggleOn : ''}`}
            onClick={() => onChange(!value)}
            type="button"
        >
            <span className={styles.toggleThumb} />
        </button>
    );
}

// ── Main component ─────────────────────────────────────
export default function AjustesPage() {
    const { user, updateUser } = useAuthStore();

    const [avatarTab, setAvatarTab] = useState('mechas');

    // ── Payment methods ──
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [pmLoading, setPmLoading] = useState(true);

    useEffect(() => {
        fetch('/api/payment-methods')
            .then(r => r.json())
            .then(d => { setPaymentMethods(d.paymentMethods || []); setPmLoading(false); })
            .catch(() => setPmLoading(false));
    }, []);

    const handleDeleteCard = async (pmId) => {
        await fetch('/api/payment-methods', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentMethodId: pmId }),
        });
        setPaymentMethods(prev => prev.filter(pm => pm.id !== pmId));
    };

    // ── Addresses ──
    const [addresses, setAddresses] = useState([]);
    const [showAddressForm, setShowAddressForm] = useState(false);
    const [addrNombre, setAddrNombre] = useState('');
    const [addrCalle, setAddrCalle] = useState('');
    const [addrNumExt, setAddrNumExt] = useState('');
    const [addrNumInt, setAddrNumInt] = useState('');
    const [addrColonia, setAddrColonia] = useState('');
    const [addrCP, setAddrCP] = useState('');
    const [addrMunicipio, setAddrMunicipio] = useState('');
    const [addrEstado, setAddrEstado] = useState('');
    const [addrRefs, setAddrRefs] = useState('');

    useEffect(() => {
        fetch('/api/addresses')
            .then(r => r.json())
            .then(d => setAddresses(d.addresses || []));
    }, []);

    const resetAddressForm = () => {
        setAddrNombre(''); setAddrCalle(''); setAddrNumExt(''); setAddrNumInt('');
        setAddrColonia(''); setAddrCP(''); setAddrMunicipio(''); setAddrEstado(''); setAddrRefs('');
        setShowAddressForm(false);
    };

    const handleSaveAddress = async () => {
        const res = await fetch('/api/addresses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre_recibe: addrNombre,
                calle: addrCalle,
                numero_ext: addrNumExt,
                numero_int: addrNumInt,
                colonia: addrColonia,
                cp: addrCP,
                municipio: addrMunicipio,
                estado: addrEstado,
                referencias: addrRefs,
            }),
        });
        const data = await res.json();
        if (data.success) {
            setAddresses(prev => {
                // If this is first address, mark as default in local state
                const updated = [...prev, { ...data.address, is_default: prev.length === 0 ? 1 : 0 }];
                return updated;
            });
            resetAddressForm();
        } else {
            throw new Error(data.error || 'Error al guardar dirección');
        }
    };

    const handleSetDefault = async (id) => {
        await fetch('/api/addresses', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        setAddresses(prev => prev.map(a => ({ ...a, is_default: a.id === id ? 1 : 0 })));
    };

    const handleDeleteAddress = async (id) => {
        await fetch('/api/addresses', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        setAddresses(prev => {
            const remaining = prev.filter(a => a.id !== id);
            const wasDefault = prev.find(a => a.id === id)?.is_default;
            if (wasDefault && remaining.length > 0) remaining[0].is_default = 1;
            return remaining;
        });
    };
    // Información personal
    const [nombre, setNombre] = useState('');
    const [telefono, setTelefono] = useState('');
    const [fechaNac, setFechaNac] = useState('');
    const [contactoPreferido, setContactoPreferido] = useState('email');
    const [estado, setEstado] = useState('');
    const formInit = useRef(false);
    useEffect(() => {
        if (user && !formInit.current) {
            setNombre(user.nombre || '');
            setTelefono(user.telefono || '');
            // fecha_nac may come as "YYYY-MM-DD" string or Date — normalize to YYYY-MM-DD
            const fn = user.fecha_nac;
            setFechaNac(fn ? String(fn).slice(0, 10) : '');
            setContactoPreferido(user.contacto_preferido || 'email');
            formInit.current = true;
        }
    }, [user]);
    // ── Notificaciones (persist in localStorage) ──
    const [notifPedidos, setNotifPedidos] = useState(() => {
        if (typeof window === 'undefined') return true;
        const v = localStorage.getItem('notif_pedidos');
        return v === null ? true : v === '1';
    });
    const [notifPreventas, setNotifPreventas] = useState(() => {
        if (typeof window === 'undefined') return true;
        const v = localStorage.getItem('notif_preventas');
        return v === null ? true : v === '1';
    });
    const [notifPromos, setNotifPromos] = useState(() => {
        if (typeof window === 'undefined') return false;
        const v = localStorage.getItem('notif_promos');
        return v === null ? false : v === '1';
    });

    const setNotif = (key, setter) => (val) => {
        setter(val);
        localStorage.setItem(key, val ? '1' : '0');
    };

    // ── Seguridad ──
    const [currentPwd, setCurrentPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [pwdError, setPwdError] = useState('');

    const activeCategory = AVATAR_CATEGORIES.find(c => c.id === avatarTab);

    return (
        <div className={commonStyles.container}>
            <div className={commonStyles.header}>
                <h1 className={commonStyles.title}>Ajustes</h1>
                <p className={commonStyles.subtitle}>Personaliza tu perfil y preferencias.</p>
            </div>

            <div className={styles.sections}>

                {/* ── Avatar ── */}
                <Section icon={User} title="Avatar de Perfil" defaultOpen={true}>
                    <p className={styles.hint}>
                        Elige tu personaje. Sin fotos de perfil — aquí todos somos anónimos y épicos.
                    </p>
                    <div className={styles.categoryTabs}>
                        {AVATAR_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                className={`${styles.categoryTab} ${avatarTab === cat.id ? styles.categoryTabActive : ''}`}
                                onClick={() => setAvatarTab(cat.id)}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                    <div className={styles.avatarGrid}>
                        {activeCategory.seeds.map(seed => {
                            const url = `/avatars/${activeCategory.id}/${seed}.png`;
                            const displayUrl = `${url}?v=2`;
                            const isSelected = user?.avatar === url;
                            return (
                                <button
                                    key={seed}
                                    className={`${styles.avatarBtn} ${isSelected ? styles.avatarBtnSelected : ''}`}
                                    onClick={async () => {
                                        updateUser({ avatar: url });
                                        try {
                                            const res = await fetch('/api/me', {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ avatar: url }),
                                            });
                                            if (!res.ok) console.error('Avatar save failed');
                                        } catch (e) {
                                            console.error('Avatar save error:', e);
                                        }
                                    }}
                                    title={seed}
                                >
                                    <img src={displayUrl} alt={seed} className={styles.avatarImg} />
                                    <span className={styles.avatarLabel}>{seed}</span>
                                </button>
                            );
                        })}
                    </div>
                </Section>

                {/* ── Información Personal ── */}
                <Section icon={User} title="Información Personal" defaultOpen={true}>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Nombre visible</label>
                            <input type="text" className={styles.input} value={nombre} onChange={e => setNombre(e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Correo vinculado</label>
                            <input type="email" className={styles.input} value={user?.email || ''} disabled />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Teléfono / WhatsApp</label>
                            <input type="tel" className={styles.input} placeholder="+52 55 1234 5678" value={telefono} onChange={e => setTelefono(e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Fecha de Nacimiento</label>
                            <input type="date" className={styles.input} value={fechaNac} onChange={e => setFechaNac(e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Contacto preferido</label>
                            <SelectField
                                value={contactoPreferido}
                                onChange={setContactoPreferido}
                                options={[
                                    { value: 'email', label: 'Correo Electrónico' },
                                    { value: 'whatsapp', label: 'WhatsApp' },
                                ]}
                            />
                        </div>
                    </div>
                    <SaveButton onSave={async () => {
                        const res = await fetch('/api/me', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                nombre,
                                apellido: user?.apellido,
                                telefono,
                                fecha_nac: fechaNac || null,
                                contacto_preferido: contactoPreferido,
                            }),
                        });
                        const data = await res.json();
                        if (data.success && data.user) updateUser(data.user);
                    }} />
                </Section>

                {/* ── Dirección de Envío ── */}
                <Section icon={Package} title="Dirección de Envío">
                    {/* Saved address cards */}
                    {addresses.length > 0 && (
                        <div className={styles.addressList}>
                            {addresses.map(addr => (
                                <div
                                    key={addr.id}
                                    className={`${styles.addressCard} ${addr.is_default ? styles.addressCardDefault : ''}`}
                                >
                                    <div className={styles.addressCardBody}>
                                        {addr.is_default === 1 && (
                                            <span className={styles.addressCardBadge}>⭐ Principal</span>
                                        )}
                                        <p className={styles.addressCardLine}>
                                            {addr.calle}{addr.numero_ext ? ` #${addr.numero_ext}` : ''}{addr.numero_int ? ` Int. ${addr.numero_int}` : ''}
                                        </p>
                                        <p className={styles.addressCardSub}>
                                            {[addr.colonia, addr.municipio, addr.estado, addr.cp].filter(Boolean).join(', ')}
                                        </p>
                                        {addr.referencias && (
                                            <p className={styles.addressCardSub}>{addr.referencias}</p>
                                        )}
                                    </div>
                                    <div className={styles.addressCardActions}>
                                        {addr.is_default !== 1 && (
                                            <button
                                                className={styles.addressActionBtn}
                                                onClick={() => handleSetDefault(addr.id)}
                                            >
                                                Establecer principal
                                            </button>
                                        )}
                                        <button
                                            className={`${styles.addressActionBtn} ${styles.addressActionBtnDanger}`}
                                            onClick={() => handleDeleteAddress(addr.id)}
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add new address button */}
                    {!showAddressForm && (
                        <button className={styles.addAddressBtn} onClick={() => setShowAddressForm(true)}>
                            + Agregar nueva dirección
                        </button>
                    )}

                    {/* New address form */}
                    {showAddressForm && (
                        <>
                            <p className={styles.addressFormTitle}>Nueva dirección</p>
                            <div className={styles.formGrid}>
                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                    <label className={styles.label}>Nombre quien recibe</label>
                                    <input type="text" className={styles.input} placeholder="Ej. Ricardo Torres" value={addrNombre} onChange={e => setAddrNombre(e.target.value)} />
                                </div>
                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                    <label className={styles.label}>Calle</label>
                                    <input type="text" className={styles.input} placeholder="Ej. Av. Insurgentes Sur" value={addrCalle} onChange={e => setAddrCalle(e.target.value)} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Número Exterior</label>
                                    <input type="text" className={styles.input} placeholder="123" value={addrNumExt} onChange={e => setAddrNumExt(e.target.value)} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Número Interior</label>
                                    <input type="text" className={styles.input} placeholder="Depto 4B (opcional)" value={addrNumInt} onChange={e => setAddrNumInt(e.target.value)} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Colonia</label>
                                    <input type="text" className={styles.input} placeholder="Ej. Del Valle" value={addrColonia} onChange={e => setAddrColonia(e.target.value)} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Código Postal</label>
                                    <input type="text" className={styles.input} placeholder="03100" maxLength={5} value={addrCP} onChange={e => setAddrCP(e.target.value)} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Municipio / Alcaldía</label>
                                    <input type="text" className={styles.input} placeholder="Ej. Benito Juárez" value={addrMunicipio} onChange={e => setAddrMunicipio(e.target.value)} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Estado</label>
                                    <SelectField
                                        value={addrEstado}
                                        onChange={setAddrEstado}
                                        placeholder="Selecciona un estado"
                                        options={ESTADOS_MX.map(e => ({ value: e, label: e }))}
                                    />
                                </div>
                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                    <label className={styles.label}>Referencias adicionales</label>
                                    <input type="text" className={styles.input} placeholder="Ej. Portón azul, casa esquina" value={addrRefs} onChange={e => setAddrRefs(e.target.value)} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <SaveButton label="Guardar Dirección" onSave={handleSaveAddress} />
                                <button
                                    className={styles.addressActionBtn}
                                    onClick={resetAddressForm}
                                    style={{ padding: '0.7rem 1.2rem' }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </>
                    )}
                </Section>

                {/* ── Métodos de Pago ── */}
                <Section icon={CreditCard} title="Métodos de Pago">
                    {pmLoading ? (
                        <div className={styles.emptyPayment}>
                            <Loader2 size={28} strokeWidth={1.5} className={styles.spinner} />
                        </div>
                    ) : paymentMethods.length > 0 ? (
                        <div className={styles.cardList}>
                            {paymentMethods.map(pm => {
                                const brand = pm.brand?.toLowerCase();
                                const brandClass = brand === 'visa' ? styles.cardBrandVisa
                                    : brand === 'mastercard' ? styles.cardBrandMaster
                                    : brand === 'amex' ? styles.cardBrandAmex
                                    : '';
                                return (
                                    <div key={pm.id} className={styles.cardItem}>
                                        <div className={styles.cardLeft}>
                                            <span className={`${styles.cardBrand} ${brandClass}`}>
                                                {pm.brand === 'mastercard' ? 'MC' : pm.brand?.toUpperCase() || '?'}
                                            </span>
                                            <div className={styles.cardInfo}>
                                                <span className={styles.cardNumber}>•••• •••• •••• {pm.last4}</span>
                                                <span className={styles.cardExpiry}>Vence {String(pm.exp_month).padStart(2,'0')}/{pm.exp_year}</span>
                                            </div>
                                        </div>
                                        <button
                                            className={`${styles.addressActionBtn} ${styles.addressActionBtnDanger}`}
                                            onClick={() => handleDeleteCard(pm.id)}
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                );
                            })}
                            <p className={styles.hint} style={{ marginBottom: 0, marginTop: '0.5rem' }}>
                                Las tarjetas se guardan de forma segura a través de Stripe. Bisonte Manga nunca almacena tus datos bancarios.
                            </p>
                        </div>
                    ) : (
                        <div className={styles.emptyPayment}>
                            <CreditCard size={36} strokeWidth={1.2} />
                            <p>No tienes tarjetas guardadas</p>
                            <span>Al finalizar una compra marca "guardar tarjeta" para que aparezca aquí. Tus datos viajan directo a Stripe — nunca los vemos.</span>
                        </div>
                    )}
                </Section>

                {/* ── Notificaciones ── */}
                <Section icon={Bell} title="Notificaciones y Preferencias">
                    <div className={styles.toggleList}>
                        <div className={styles.toggleRow}>
                            <div>
                                <p className={styles.toggleLabel}>Pedidos y envíos</p>
                                <p className={styles.toggleDesc}>Aviso cuando tu pedido salga o llegue</p>
                            </div>
                            <Toggle value={notifPedidos} onChange={setNotif('notif_pedidos', setNotifPedidos)} />
                        </div>
                        <div className={styles.toggleRow}>
                            <div>
                                <p className={styles.toggleLabel}>Preventas y lanzamientos</p>
                                <p className={styles.toggleDesc}>Apertura de nuevas preventas de tus series</p>
                            </div>
                            <Toggle value={notifPreventas} onChange={setNotif('notif_preventas', setNotifPreventas)} />
                        </div>
                        <div className={styles.toggleRow}>
                            <div>
                                <p className={styles.toggleLabel}>Promociones y ofertas</p>
                                <p className={styles.toggleDesc}>Cupones exclusivos y descuentos especiales</p>
                            </div>
                            <Toggle value={notifPromos} onChange={setNotif('notif_promos', setNotifPromos)} />
                        </div>
                    </div>
                </Section>

                {/* ── Seguridad ── */}
                <Section icon={Lock} title="Seguridad">
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Contraseña actual</label>
                            <input type="password" className={styles.input} placeholder="••••••••" value={currentPwd} onChange={e => { setCurrentPwd(e.target.value); setPwdError(''); }} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Nueva contraseña</label>
                            <input type="password" className={styles.input} placeholder="Mínimo 8 caracteres" value={newPwd} onChange={e => { setNewPwd(e.target.value); setPwdError(''); }} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Confirmar contraseña</label>
                            <input type="password" className={styles.input} placeholder="••••••••" value={confirmPwd} onChange={e => { setConfirmPwd(e.target.value); setPwdError(''); }} />
                        </div>
                    </div>
                    {pwdError && (
                        <p style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: '1rem', fontWeight: 600 }}>{pwdError}</p>
                    )}
                    <SaveButton label="Cambiar Contraseña" onSave={async () => {
                        setPwdError('');
                        if (!currentPwd || !newPwd || !confirmPwd) throw Object.assign(new Error('Completa todos los campos'), { _ui: true });
                        if (newPwd !== confirmPwd) throw Object.assign(new Error('Las contraseñas no coinciden'), { _ui: true });
                        if (newPwd.length < 8) throw Object.assign(new Error('Mínimo 8 caracteres'), { _ui: true });
                        const res = await fetch('/api/change-password', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
                        });
                        const data = await res.json();
                        if (!data.success) throw Object.assign(new Error(data.error || 'Error al cambiar contraseña'), { _ui: true });
                        setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
                    }} onError={(e) => { if (e._ui) setPwdError(e.message); }} />
                </Section>

            </div>
        </div>
    );
}

'use client';

import { useState } from 'react';
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
        id: 'robots',
        label: '🤖 Robots',
        seeds: ['Voltron', 'Mecha', 'Cyborg', 'Gundam', 'R2D2', 'Wall-E', 'Bender', 'Optimus', 'Megatron', 'Gipsy', 'Jaegers', 'Terminator'],
        style: 'bottts',
    },
    {
        id: 'pixel',
        label: '🎮 Pixel',
        seeds: ['Mario', 'Link', 'Samus', 'Kirby', 'Pikachu', 'Goku', 'Naruto', 'Luffy', 'Ichigo', 'Vegeta', 'Tanjiro', 'Itachi'],
        style: 'pixel-art',
    },
    {
        id: 'aventureros',
        label: '🧙 Aventureros',
        seeds: ['Wizard', 'Knight', 'Rogue', 'Paladin', 'Ranger', 'Bard', 'Druid', 'Warlock', 'Monk', 'Cleric', 'Shaman', 'Necro'],
        style: 'adventurer',
    },
    {
        id: 'emojis',
        label: '😜 Emojis',
        seeds: ['Loco', 'Friki', 'Otaku', 'Nerd', 'Gamer', 'Weeabo', 'Sensei', 'Shogun', 'Daimyo', 'Ronin', 'Oni', 'Kitsune'],
        style: 'fun-emoji',
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
function SaveButton({ label = 'Guardar Cambios', onSave }) {
    const [status, setStatus] = useState('idle'); // idle | loading | success

    const handleClick = async () => {
        if (status !== 'idle') return;
        setStatus('loading');
        await new Promise(r => setTimeout(r, 900));
        if (onSave) await onSave();
        setStatus('success');
        setTimeout(() => setStatus('idle'), 2500);
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

    const [avatarTab, setAvatarTab] = useState('robots');
    const [notifPedidos, setNotifPedidos] = useState(true);
    const [notifPreventas, setNotifPreventas] = useState(true);
    const [notifPromos, setNotifPromos] = useState(false);

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
                            const url = `https://api.dicebear.com/7.x/${activeCategory.style}/svg?seed=${seed}`;
                            const isSelected = user?.avatar === url;
                            return (
                                <button
                                    key={seed}
                                    className={`${styles.avatarBtn} ${isSelected ? styles.avatarBtnSelected : ''}`}
                                    onClick={() => updateUser({ avatar: url })}
                                    title={seed}
                                >
                                    <img src={url} alt={seed} className={styles.avatarImg} />
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
                            <input type="text" className={styles.input} defaultValue={user?.nombre} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Correo vinculado</label>
                            <input type="email" className={styles.input} value={user?.email || ''} disabled />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Teléfono / WhatsApp</label>
                            <input type="tel" className={styles.input} placeholder="+52 55 1234 5678" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Fecha de Nacimiento</label>
                            <input type="date" className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Contacto preferido</label>
                            <select className={styles.input}>
                                <option value="email">Correo Electrónico</option>
                                <option value="whatsapp">WhatsApp</option>
                            </select>
                        </div>
                    </div>
                    <SaveButton />
                </Section>

                {/* ── Dirección de Envío ── */}
                <Section icon={Package} title="Dirección de Envío">
                    <p className={styles.hint}>Tu dirección predeterminada para envíos dentro de México.</p>
                    <div className={styles.formGrid}>
                        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                            <label className={styles.label}>Calle</label>
                            <input type="text" className={styles.input} placeholder="Ej. Av. Insurgentes Sur" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Número Exterior</label>
                            <input type="text" className={styles.input} placeholder="123" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Número Interior</label>
                            <input type="text" className={styles.input} placeholder="Depto 4B (opcional)" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Colonia</label>
                            <input type="text" className={styles.input} placeholder="Ej. Del Valle" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Código Postal</label>
                            <input type="text" className={styles.input} placeholder="03100" maxLength={5} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Municipio / Alcaldía</label>
                            <input type="text" className={styles.input} placeholder="Ej. Benito Juárez" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Estado</label>
                            <select className={styles.input}>
                                <option value="">Selecciona un estado</option>
                                {ESTADOS_MX.map(e => <option key={e} value={e}>{e}</option>)}
                            </select>
                        </div>
                        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                            <label className={styles.label}>Referencias adicionales</label>
                            <input type="text" className={styles.input} placeholder="Ej. Portón azul, casa esquina" />
                        </div>
                    </div>
                    <SaveButton label="Guardar Dirección" />
                </Section>

                {/* ── Métodos de Pago ── */}
                <Section icon={CreditCard} title="Métodos de Pago">
                    <div className={styles.emptyPayment}>
                        <CreditCard size={36} strokeWidth={1.2} />
                        <p>No tienes tarjetas guardadas</p>
                        <span>Al finalizar una compra puedes elegir guardar tu tarjeta de forma segura a través de Stripe.</span>
                    </div>
                </Section>

                {/* ── Notificaciones ── */}
                <Section icon={Bell} title="Notificaciones y Preferencias">
                    <div className={styles.toggleList}>
                        <div className={styles.toggleRow}>
                            <div>
                                <p className={styles.toggleLabel}>Pedidos y envíos</p>
                                <p className={styles.toggleDesc}>Aviso cuando tu pedido salga o llegue</p>
                            </div>
                            <Toggle value={notifPedidos} onChange={setNotifPedidos} />
                        </div>
                        <div className={styles.toggleRow}>
                            <div>
                                <p className={styles.toggleLabel}>Preventas y lanzamientos</p>
                                <p className={styles.toggleDesc}>Apertura de nuevas preventas de tus series</p>
                            </div>
                            <Toggle value={notifPreventas} onChange={setNotifPreventas} />
                        </div>
                        <div className={styles.toggleRow}>
                            <div>
                                <p className={styles.toggleLabel}>Promociones y ofertas</p>
                                <p className={styles.toggleDesc}>Cupones exclusivos y descuentos especiales</p>
                            </div>
                            <Toggle value={notifPromos} onChange={setNotifPromos} />
                        </div>
                    </div>
                </Section>

                {/* ── Seguridad ── */}
                <Section icon={Lock} title="Seguridad">
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Contraseña actual</label>
                            <input type="password" className={styles.input} placeholder="••••••••" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Nueva contraseña</label>
                            <input type="password" className={styles.input} placeholder="••••••••" />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Confirmar contraseña</label>
                            <input type="password" className={styles.input} placeholder="••••••••" />
                        </div>
                    </div>
                    <SaveButton label="Cambiar Contraseña" />
                </Section>

            </div>
        </div>
    );
}

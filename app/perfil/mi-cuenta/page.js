"use client";

import { useState } from 'react';
import { FiCopy, FiCheck, FiX, FiUser } from 'react-icons/fi';
import styles from './MiCuenta.module.css';
import Image from 'next/image';

const AVATAR_OPTIONS = [
    { src: '/avatar_onepiece.png', label: 'One Piece' },
    { src: '/avatar_dragonball.png', label: 'Dragon Ball' },
    { src: '/avatar_naruto.png', label: 'Naruto' },
    { src: '/avatar_aot.png', label: 'Attack on Titan' },
    { src: '/avatar_demonslayer.png', label: 'Demon Slayer' },
    { src: '/avatar_mha.png', label: 'My Hero Academia' },
    { src: '/avatar_loid.png', label: 'Spy x Family' },
    { src: '/avatar_sailormoon.png', label: 'Sailor Moon' },
    { src: '/avatar_anya.png', label: 'Anya' },
];

export default function MiCuenta() {
    const [copied, setCopied] = useState(false);
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

    // In a real app, these would come from the user's context/session
    const [user] = useState({
        name: 'Laura Developer',
        avatar: '/avatar_onepiece.png',
        clientNumber: 'BS-8492',
        clientCode: 'CUS-99120-X'
    });

    const [selectedAvatar, setSelectedAvatar] = useState(user.avatar);

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSaveAvatar = (avatar) => {
        setSelectedAvatar(avatar);
        setIsAvatarModalOpen(false);
        // Here you would also call an API to save the new avatar
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Mi Cuenta</h1>
                <p className={styles.subtitle}>Gestiona tu identidad y datos básicos en la plataforma.</p>
            </div>

            <div className={styles.card}>
                <h2 className={styles.sectionTitle}>Perfil de Coleccionista</h2>

                <div className={styles.profileInfo}>
                    <div className={styles.avatarSection}>
                        <div className={styles.avatar}>
                            {selectedAvatar ? (
                                <Image src={selectedAvatar} alt="Avatar" width={120} height={120} />
                            ) : (
                                <FiUser />
                            )}
                        </div>
                        <button
                            className={styles.editAvatarBtn}
                            onClick={() => setIsAvatarModalOpen(true)}
                        >
                            Cambiar Ícono
                        </button>
                    </div>

                    <div className={styles.detailsSection}>
                        <div className={styles.detailGroup}>
                            <span className={styles.label}>Nombre visible</span>
                            <span className={styles.value}>{user.name}</span>
                        </div>

                        <div className={styles.detailGroup}>
                            <span className={styles.label}>Número de Cliente</span>
                            <span className={styles.value}>
                                {user.clientNumber}
                                <button
                                    className={styles.copyBtn}
                                    onClick={() => handleCopy(user.clientNumber)}
                                    title="Copiar número"
                                >
                                    {copied ? <FiCheck color="var(--primary)" /> : <FiCopy />}
                                </button>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal for Avatar Selection */}
            {isAvatarModalOpen && (
                <div className={styles.modalOverlay} onClick={() => setIsAvatarModalOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <button
                            className={styles.closeModalBtn}
                            onClick={() => setIsAvatarModalOpen(false)}
                        >
                            <FiX />
                        </button>
                        <h2 className={styles.sectionTitle}>Selecciona tu Ícono</h2>
                        <p className={styles.subtitle}>Elige uno de los diseños predeterminados para tu perfil.</p>

                        <div className={styles.avatarGrid}>
                            {AVATAR_OPTIONS.map((avatar) => (
                                <button
                                    key={avatar.src}
                                    className={`${styles.avatarOption} ${selectedAvatar === avatar.src ? styles.selected : ''}`}
                                    onClick={() => handleSaveAvatar(avatar.src)}
                                    title={avatar.label}
                                >
                                    <Image src={avatar.src} alt={avatar.label} width={100} height={100} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

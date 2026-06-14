'use client';

import { motion } from 'framer-motion';

// Solo opacidad: transform/filter en este wrapper rompen position:fixed
// de los hijos (fondo del landing) y causan glitch de zoom al cargar.
const pageVariants = {
    hidden: {
        opacity: 0,
    },
    visible: {
        opacity: 1,
        transition: {
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
        },
    },
    exit: {
        opacity: 0,
        transition: {
            duration: 0.2,
            ease: 'easeIn',
        },
    },
};

export default function Template({ children }) {
    return (
        <motion.div
            variants={pageVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
        >
            {children}
        </motion.div>
    );
}

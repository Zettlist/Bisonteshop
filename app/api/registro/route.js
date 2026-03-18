import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

const EMPRESA_ID = process.env.EMPRESA_ID || 122;

// Generates a unique short client code like BS-4921
async function generateClientCode() {
    let code;
    let exists = true;
    while (exists) {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        code = `BS-${randomNum}`;
        const [rows] = await pool.query(
            'SELECT id FROM clientes WHERE client_code = ?', [code]
        );
        exists = rows.length > 0;
    }
    return code;
}

export async function POST(req) {
    try {
        const { nombre, apellido, fechaNacimiento, email, password } = await req.json();

        // Basic server-side validation
        if (!nombre || !apellido || !fechaNacimiento || !email || !password) {
            return NextResponse.json(
                { success: false, error: 'Todos los campos son requeridos.' },
                { status: 400 }
            );
        }

        // Validate age (must be 18+)
        const hoy = new Date();
        const nacimiento = new Date(fechaNacimiento);
        const edad = hoy.getFullYear() - nacimiento.getFullYear()
            - (hoy < new Date(hoy.getFullYear(), nacimiento.getMonth(), nacimiento.getDate()) ? 1 : 0);
        if (edad < 18) {
            return NextResponse.json(
                { success: false, error: 'Debes ser mayor de 18 años para registrarte.' },
                { status: 400 }
            );
        }

        // Check if email already registered
        const [existing] = await pool.query(
            'SELECT id FROM clientes WHERE email = ?', [email]
        );
        if (existing.length > 0) {
            return NextResponse.json(
                { success: false, error: 'Este correo electrónico ya está registrado.' },
                { status: 409 }
            );
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Generate unique client code
        const clientCode = await generateClientCode();

        // Insert new user
        await pool.query(
            `INSERT INTO clientes (nombre, apellido, fecha_nac, email, password, client_code, empresa_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nombre, apellido, fechaNacimiento, email.toLowerCase(), hashedPassword, clientCode, EMPRESA_ID]
        );

        return NextResponse.json({
            success: true,
            message: '¡Cuenta creada exitosamente!',
            clientNumber: clientCode,
        });

    } catch (error) {
        console.error('Error en registro:', error);
        return NextResponse.json(
            { success: false, error: 'Error del servidor. Intenta de nuevo más tarde.' },
            { status: 500 }
        );
    }
}

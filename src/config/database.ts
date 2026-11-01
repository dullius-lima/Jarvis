// src/config/database.ts
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let cachedPgVectorStatus: boolean | null = null;

export async function isPgVectorAvailable(): Promise<boolean> {
  if (cachedPgVectorStatus !== null) return cachedPgVectorStatus;
  try {
    const res = await pool.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'vector';"
    );
    cachedPgVectorStatus = res.rows.length > 0;
  } catch {
    cachedPgVectorStatus = false;
  }
  return cachedPgVectorStatus;
}

export async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('📦 Conexão com o PostgreSQL ativa:', result.rows[0].now);
    client.release();
  } catch (error: any) {
    console.error('❌ Erro ao conectar ao PostgreSQL:', error.message);
  }
}
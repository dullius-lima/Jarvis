
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Força o carregamento do .env a partir da raiz da aplicação
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbPassword = String(
  process.env.DB_PASSWORD || process.env.PGPASSWORD || '123456'
);

// Fallback robusto caso DATABASE_URL não venha preenchida
const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://postgres:${dbPassword}@127.0.0.1:5432/postgres`;

export const pool = new Pool({
  connectionString,
  password: dbPassword,
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_DATABASE || 'postgres',
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

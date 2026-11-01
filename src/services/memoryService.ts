// src/services/memoryService.ts
import { pool } from '../config/database.js';

/**
 * Retorna o histórico recente de conversas do JARVIS para uma sessão específica
 */
export async function getJarvisSessionHistory(sessionId: string, limit = 10) {
  try {
    const res = await pool.query(
      `SELECT id, role, content, created_at 
       FROM jarvis_chat_memory 
       WHERE session_id = $1 
       ORDER BY id DESC LIMIT $2;`,
      [sessionId, limit]
    );
    return res.rows.reverse(); // Retorna em ordem cronológica
  } catch (error) {
    console.warn('⚠️ [Memory Service] Tabela jarvis_chat_memory não encontrada ou vazia.');
    return [];
  }
}

/**
 * Adiciona uma nova mensagem ao histórico conversacional do JARVIS
 */
export async function appendJarvisMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string) {
  try {
    await pool.query(
      `INSERT INTO jarvis_chat_memory (session_id, role, content) 
       VALUES ($1, $2, $3);`,
      [sessionId, role, content]
    );
  } catch (error: any) {
    console.error('❌ [Memory Service] Erro ao gravar mensagem do Jarvis:', error.message);
  }
}

/**
 * Recupera o contexto técnico recente acumulado por um Especialista Subordinado na sessão
 */
export async function getSpecialistContext(sessionId: string, specialistSlug: string, limit = 5) {
  try {
    const res = await pool.query(
      `SELECT id, context_data, created_at 
       FROM specialist_context_memory 
       WHERE session_id = $1 AND specialist_slug = $2 
       ORDER BY id DESC LIMIT $3;`,
      [sessionId, specialistSlug, limit]
    );
    return res.rows.reverse();
  } catch {
    return [];
  }
}

/**
 * Grava o contexto técnico de curto prazo gerado por um Especialista Subordinado
 */
export async function appendSpecialistContext(sessionId: string, specialistSlug: string, contextData: any) {
  try {
    await pool.query(
      `INSERT INTO specialist_context_memory (session_id, specialist_slug, context_data) 
       VALUES ($1, $2, $3);`,
      [sessionId, specialistSlug, JSON.stringify(contextData)]
    );
  } catch (error: any) {
    console.error('❌ [Memory Service] Erro ao gravar contexto do especialista:', error.message);
  }
}

// src/controllers/memoryController.ts
import { Request, Response } from 'express';
import { pool } from '../config/database.js';

export async function listMemorySessions(_req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT 
        session_id, 
        COUNT(*) AS total_messages, 
        COUNT(*) AS message_count,
        MAX(created_at) AS last_interaction,
        MAX(created_at) AS last_activity
      FROM jarvis_chat_memory
      GROUP BY session_id
      ORDER BY last_interaction DESC;
    `);
    return res.status(200).json({ success: true, data: result.rows });
  } catch {
    return res.status(200).json({ success: true, data: [] });
  }
}

export async function getSessionDetails(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    const [chatRes, ctxRes] = await Promise.all([
      pool
        .query('SELECT * FROM jarvis_chat_memory WHERE session_id = $1 ORDER BY id ASC;', [sessionId])
        .catch(() => ({ rows: [] })),
      pool
        .query('SELECT * FROM specialist_context_memory WHERE session_id = $1 ORDER BY id DESC LIMIT 30;', [sessionId])
        .catch(() => ({ rows: [] }))
    ]);

    return res.status(200).json({
      success: true,
      data: chatRes.rows,
      chatHistory: chatRes.rows,
      specialistContext: ctxRes.rows
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateMemoryMessage(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { content } = req.body || {};
    await pool.query('UPDATE jarvis_chat_memory SET content = $1 WHERE id = $2;', [
      content || '',
      id
    ]);
    return res.status(200).json({ success: true, message: 'Mensagem atualizada com sucesso.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteMemoryMessage(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM jarvis_chat_memory WHERE id = $1;', [id]);
    return res.status(200).json({ success: true, message: 'Mensagem eliminada com sucesso.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function clearSessionMemory(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    await Promise.all([
      pool.query('DELETE FROM jarvis_chat_memory WHERE session_id = $1;', [sessionId]).catch(() => {}),
      pool.query('DELETE FROM specialist_context_memory WHERE session_id = $1;', [sessionId]).catch(() => {})
    ]);
    return res.status(200).json({ success: true, message: 'Sessão limpa com sucesso.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export default {
  listMemorySessions,
  getSessionDetails,
  updateMemoryMessage,
  deleteMemoryMessage,
  clearSessionMemory
};
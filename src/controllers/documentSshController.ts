// src/controllers/documentSshController.ts
import { Request, Response } from 'express';
import {
  processAndIngestDocument,
  listIngestedDocuments,
  deleteIngestedDocument
} from '../services/documentLoaderService.js';
import {
  executeSshCommand,
  readRemoteFileViaSshToRag
} from '../services/sshService.js';

/**
 * POST /api/v1/docs-ssh/rag/upload
 * Faz upload e chunking de PDF, CSV, TXT, MD ou JSON para o RAG
 */
export async function handleDocumentUploadToRag(req: Request, res: Response) {
  try {
    const {
      fileName,
      fileType,
      contentBase64,
      rawText,
      category,
      chunkSize,
      chunkOverlap
    } = req.body || {};

    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: 'O campo "fileName" é obrigatório.'
      });
    }

    const result = await processAndIngestDocument({
      fileName,
      fileType,
      contentBase64,
      rawText,
      category,
      chunkSize: chunkSize ? Number(chunkSize) : 1000,
      chunkOverlap: chunkOverlap ? Number(chunkOverlap) : 150
    });

    return res.status(201).json({
      success: true,
      message: `Arquivo "${fileName}" processado e dividido em ${result.totalChunks} chunk(s) na memória RAG!`,
      data: result
    });
  } catch (error: any) {
    console.error('❌ [Document Loader] Erro ao processar arquivo:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao processar documento para o RAG.'
    });
  }
}

/**
 * GET /api/v1/docs-ssh/rag/documents
 * Lista os documentos/chunks salvos na tabela vector_documents
 */
export async function handleListRagDocuments(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit) || 50;
    const docs = await listIngestedDocuments(limit);
    return res.status(200).json({
      success: true,
      data: docs
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * DELETE /api/v1/docs-ssh/rag/documents/:id
 * Remove um documento/chunk do RAG
 */
export async function handleDeleteRagDocument(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID inválido.' });
    }
    const result = await deleteIngestedDocument(id);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /api/v1/docs-ssh/ssh/execute
 * Executa um comando remoto no servidor via Nó SSH
 */
export async function handleSshExecute(req: Request, res: Response) {
  try {
    const { host, port, username, password, privateKey, command, timeoutMs } = req.body || {};

    const result = await (executeSshCommand as any)({
      host,
      port: port ? Number(port) : 22,
      username,
      password,
      privateKey,
      command,
      timeoutMs: timeoutMs ? Number(timeoutMs) : 20000
    });

    return res.status(200).json({
      success: result.success ?? true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ [Nó SSH] Erro na execução remota:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Falha ao executar comando via SSH.'
    });
  }
}

/**
 * POST /api/v1/docs-ssh/ssh/read-to-rag
 * Lê um arquivo/log de um servidor remoto via SSH e injeta direto no RAG
 */
export async function handleSshReadToRag(req: Request, res: Response) {
  try {
    const {
      host,
      port,
      username,
      password,
      privateKey,
      remoteFilePath,
      category,
      maxLines
    } = req.body || {};

    if (!remoteFilePath) {
      return res.status(400).json({
        success: false,
        error: 'Informe o caminho do arquivo remoto ("remoteFilePath").'
      });
    }

    const payload: any = {
      host,
      port: port ? Number(port) : 22,
      username,
      password,
      privateKey,
      remoteFilePath,
      maxLines: maxLines ? Number(maxLines) : 500
    };

    if (category) {
      payload.category = category;
    }

    const result = await readRemoteFileViaSshToRag(payload);

    return res.status(200).json({
      success: true,
      message: `Arquivo remoto "${remoteFilePath}" lido via SSH e indexado no RAG com sucesso!`,
      data: result
    });
  } catch (error: any) {
    console.error('❌ [SSH -> RAG] Erro:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
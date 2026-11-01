// src/services/documentLoaderService.ts
import { ingestDocument } from './ragService.js';
import { pool } from '../config/database.js';

export interface DocumentUploadPayload {
  fileName: string;
  fileType?: 'pdf' | 'csv' | 'txt' | 'md' | 'json' | string;
  contentBase64?: string;
  rawText?: string;
  category?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Divide um texto longo em blocos menores (chunks) com sobreposição (overlap)
 * para preservar o contexto semântico no banco vetorial.
 */
export function splitTextIntoChunks(
  text: string,
  chunkSize = 1000,
  chunkOverlap = 150
): string[] {
  const cleanText = (text || '').replace(/\r\n/g, '\n').trim();
  if (!cleanText) return [];
  if (cleanText.length <= chunkSize) return [cleanText];

  const chunks: string[] = [];
  let startIndex = 0;
  const safeOverlap = Math.min(chunkOverlap, Math.floor(chunkSize / 2));

  while (startIndex < cleanText.length) {
    let endIndex = startIndex + chunkSize;

    // Tenta quebrar em fim de parágrafo, frase ou espaço para não cortar palavras ao meio
    if (endIndex < cleanText.length) {
      const nextParagraph = cleanText.lastIndexOf('\n\n', endIndex);
      const nextLine = cleanText.lastIndexOf('\n', endIndex);
      const nextPeriod = cleanText.lastIndexOf('. ', endIndex);
      const nextSpace = cleanText.lastIndexOf(' ', endIndex);

      if (nextParagraph > startIndex + chunkSize * 0.5) {
        endIndex = nextParagraph + 2;
      } else if (nextLine > startIndex + chunkSize * 0.5) {
        endIndex = nextLine + 1;
      } else if (nextPeriod > startIndex + chunkSize * 0.5) {
        endIndex = nextPeriod + 2;
      } else if (nextSpace > startIndex + chunkSize * 0.5) {
        endIndex = nextSpace + 1;
      }
    }

    const chunk = cleanText.slice(startIndex, endIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    startIndex = endIndex - safeOverlap;
    if (startIndex >= cleanText.length || endIndex >= cleanText.length) break;
  }

  return chunks;
}

/**
 * Converte um arquivo CSV em blocos semânticos "Coluna: Valor | Coluna2: Valor2"
 * para que a LLM nunca se perca lendo tabelas no RAG.
 */
export function parseCsvToSemanticText(csvContent: string, fileName: string): string {
  const lines = csvContent
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  // Detecta se o separador é ponto-e-vírgula (padrão Excel Brasil) ou vírgula
  const firstLine = lines[0];
  const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

  const headers = firstLine.split(delimiter).map((h) => h.replace(/^["']|["']$/g, '').trim());
  const semanticRows: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map((v) => v.replace(/^["']|["']$/g, '').trim());
    const pairs: string[] = [];

    for (let j = 0; j < headers.length; j++) {
      const colName = headers[j] || `Coluna_${j + 1}`;
      const colVal = values[j] ?? '';
      if (colVal !== '') {
        pairs.push(`${colName}:${colVal}`);
      }
    }

    if (pairs.length > 0) {
      semanticRows.push(`[Planilha ${fileName} - Linha ${i}]${pairs.join(' | ')}`);
    }
  }

  return semanticRows.join('\n');
}

/**
 * Extrai texto de um Buffer PDF usando pdf-parse (se instalado) ou extrator nativo de fallback.
 */
async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  try {
    const pdfParseModule: any = await import('pdf-parse');
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const data = await pdfParse(buffer);
    if (data?.text && data.text.trim().length > 0) {
      return data.text;
    }
  } catch {
    // Fallback nativo caso pdf-parse não esteja instalado no node_modules
  }

  // Extrator nativo de streams de texto PDF
  const rawLatin1 = buffer.toString('latin1');
  const matches = rawLatin1.match(/\(([^()]+)\)/g) || [];
  const extracted = matches
    .map((m) => m.slice(1, -1))
    .filter((str) => /[a-zA-ZÀ-ÿ0-9]{2,}/.test(str))
    .join(' ');

  if (extracted.trim().length > 20) {
    return extracted;
  }

  return buffer.toString('utf8').replace(/[^\x20-\x7EÀ-ÿ\n\r\t]/g, ' ');
}

/**
 * Processa o arquivo (PDF, CSV, TXT, MD, JSON), divide em chunks e salva no RAG (vector_documents)
 */
export async function processAndIngestDocument(payload: DocumentUploadPayload) {
  const {
    fileName,
    fileType,
    contentBase64,
    rawText,
    category = 'geral',
    chunkSize = 1000,
    chunkOverlap = 150
  } = payload;

  const ext = (fileType || fileName.split('.').pop() || 'txt').toLowerCase().replace('.', '');
  let extractedText = '';

  if (rawText && rawText.trim().length > 0) {
    extractedText = ext === 'csv' ? parseCsvToSemanticText(rawText, fileName) : rawText;
  } else if (contentBase64) {
    const cleanBase64 = contentBase64.replace(/^data:.*?;base64,/, '');
    const fileBuffer = Buffer.from(cleanBase64, 'base64');

    if (ext === 'pdf') {
      extractedText = await extractTextFromPdfBuffer(fileBuffer);
    } else if (ext === 'csv') {
      const csvRaw = fileBuffer.toString('utf8');
      extractedText = parseCsvToSemanticText(csvRaw, fileName);
    } else if (ext === 'json') {
      const jsonRaw = fileBuffer.toString('utf8');
      try {
        const parsed = JSON.parse(jsonRaw);
        extractedText = JSON.stringify(parsed, null, 2);
      } catch {
        extractedText = jsonRaw;
      }
    } else {
      extractedText = fileBuffer.toString('utf8');
    }
  } else {
    throw new Error('Nenhum conteúdo (contentBase64 ou rawText) foi enviado para processamento.');
  }

  if (!extractedText || extractedText.trim().length === 0) {
    throw new Error(`Não foi possível extrair texto legível do arquivo "${fileName}".`);
  }

  const chunks = splitTextIntoChunks(extractedText, chunkSize, chunkOverlap);
  const ingestedIds: number[] = [];
  let storageMode = 'pgvector';

  for (let i = 0; i < chunks.length; i++) {
    const chunkContent = `[Documento: ${fileName} \vert{} Parte${i + 1}/${chunks.length}]\n${chunks[i]}`;
    const result = await ingestDocument({
      content: chunkContent,
      metadata: {
        source: 'document_loader',
        fileName,
        fileType: ext,
        category,
        chunkIndex: i + 1,
        totalChunks: chunks.length,
        uploadedAt: new Date().toISOString()
      }
    });

    if (result.documentId) {
      ingestedIds.push(result.documentId);
    }
    if ((result as any).mode) {
      storageMode = (result as any).mode;
    }
  }

  return {
    success: true,
    fileName,
    fileType: ext,
    category,
    totalCharacters: extractedText.length,
    totalChunks: chunks.length,
    ingestedDocumentIds: ingestedIds,
    storageMode
  };
}

/**
 * Lista os documentos indexados na tabela vector_documents
 */
export async function listIngestedDocuments(limit = 50) {
  const result = await pool.query(
    `SELECT id, LEFT(content, 220) AS preview, metadata, created_at
     FROM vector_documents
     ORDER BY id DESC
     LIMIT $1;`,
    [limit]
  );
  return result.rows;
}

/**
 * Remove um documento/chunk específico da memória RAG
 */
export async function deleteIngestedDocument(id: number) {
  await pool.query('DELETE FROM vector_documents WHERE id = $1;', [id]);
  return { success: true, deletedId: id };
}
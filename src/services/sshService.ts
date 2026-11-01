// src/services/sshService.ts
import { processAndIngestDocument } from './documentLoaderService.js';

export interface SshConnectionConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  timeoutMs?: number;
}

export interface SshExecutionPayload extends SshConnectionConfig {
  command: string;
  workingDirectory?: string;
}

export interface SshReadToRagPayload extends SshConnectionConfig {
  remoteFilePath: string;
  category?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  maxLines?: number;
  metadata?: Record<string, any>;
}

export interface SshCommandResult {
  success: boolean;
  host: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
}

/**
 * Executa comandos em servidores remotos via protocolo SSH.
 * Aceita tanto uma string simples de comando quanto um objeto de configuração completo.
 */
export async function executeSshCommand(
  payloadOrCommand: string | SshExecutionPayload
): Promise<SshCommandResult> {
  const startTime = Date.now();

  const payload: SshExecutionPayload =
    typeof payloadOrCommand === 'string'
      ? {
          command: payloadOrCommand,
          host: process.env.SSH_DEFAULT_HOST || '127.0.0.1',
          port: Number(process.env.SSH_DEFAULT_PORT) || 22,
          username: process.env.SSH_DEFAULT_USER || 'ubuntu',
          password: process.env.SSH_DEFAULT_PASSWORD || undefined,
          privateKey: process.env.SSH_DEFAULT_KEY || undefined
        }
      : payloadOrCommand;

  const host = (payload.host || '127.0.0.1').trim();
  const port = Number(payload.port) || 22;
  const username = (payload.username || 'ubuntu').trim();

  if (!payload.command?.trim()) {
    throw new Error('O comando SSH a ser executado não pode estar vazio.');
  }

  const finalCommand = payload.workingDirectory
    ? `cd ${payload.workingDirectory} && ${payload.command}`
    : payload.command;

  // Carrega dinamicamente o módulo ssh2
  let Client: any;
  try {
    const ssh2Module: any = await import('ssh2');
    Client = ssh2Module.Client || ssh2Module.default?.Client || ssh2Module.default;
  } catch {
    throw new Error(
      'Biblioteca "ssh2" não encontrada. Execute no terminal: npm install ssh2 && npm install -D @types/ssh2'
    );
  }

  return new Promise<SshCommandResult>((resolve, reject) => {
    const conn = new Client();
    let stdoutData = '';
    let stderrData = '';
    let isSettled = false;

    const timeout = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        conn.end();
        reject(
          new Error(
            `Timeout na conexão SSH com ${host}:${port} após ${payload.timeoutMs || 20000}ms.`
          )
        );
      }
    }, payload.timeoutMs || 20000);

    conn
      .on('ready', () => {
        conn.exec(finalCommand, (err: Error | undefined, stream: any) => {
          if (err) {
            clearTimeout(timeout);
            isSettled = true;
            conn.end();
            return reject(err);
          }

          stream
            .on('close', (code: number) => {
              clearTimeout(timeout);
              if (isSettled) return;
              isSettled = true;
              conn.end();

              resolve({
                success: code === 0,
                host,
                command: finalCommand,
                exitCode: code ?? 0,
                stdout: stdoutData.trim(),
                stderr: stderrData.trim(),
                executionTimeMs: Date.now() - startTime
              });
            })
            .on('data', (data: Buffer) => {
              stdoutData += data.toString('utf8');
            })
            .stderr.on('data', (data: Buffer) => {
              stderrData += data.toString('utf8');
            });
        });
      })
      .on('error', (err: Error) => {
        clearTimeout(timeout);
        if (!isSettled) {
          isSettled = true;
          reject(new Error(`Falha de conexão SSH (${host}:${port}): ${err.message}`));
        }
      })
      .connect({
        host,
        port,
        username,
        password: payload.password || undefined,
        privateKey: payload.privateKey ? payload.privateKey.replace(/\\n/g, '\n') : undefined,
        passphrase: payload.passphrase || undefined,
        readyTimeout: payload.timeoutMs || 15000
      });
  });
}

/**
 * Alias exportado para retrocompatibilidade com documentSshController.ts
 */
export const executeRemoteSshCommand = executeSshCommand;

/**
 * Testa a conectividade SSH e retorna diagnósticos do host remoto (Uptime, OS e Disco)
 */
export async function testSshServerConnection(config: SshConnectionConfig) {
  const diagnosticCommand = 'uname -a && uptime && df -h / | tail -n 1';
  const result = await executeSshCommand({
    ...config,
    command: diagnosticCommand
  });

  return {
    success: result.success,
    host: config.host || '127.0.0.1',
    port: config.port || 22,
    username: config.username || 'ubuntu',
    serverInfo: result.stdout || result.stderr,
    executionTimeMs: result.executionTimeMs
  };
}

/**
 * Lê um ficheiro ou log de um servidor remoto via SSH e injeta direto no RAG (PostgreSQL)
 */
export async function readRemoteFileViaSshToRag(
  payloadOrPath: string | SshReadToRagPayload
) {
  const payload: SshReadToRagPayload =
    typeof payloadOrPath === 'string'
      ? {
          remoteFilePath: payloadOrPath,
          host: process.env.SSH_DEFAULT_HOST || '127.0.0.1',
          port: Number(process.env.SSH_DEFAULT_PORT) || 22,
          username: process.env.SSH_DEFAULT_USER || 'ubuntu',
          password: process.env.SSH_DEFAULT_PASSWORD || undefined,
          privateKey: process.env.SSH_DEFAULT_KEY || undefined,
          category: 'ssh_logs'
        }
      : payloadOrPath;

  if (!payload.remoteFilePath?.trim()) {
    throw new Error('Informe o caminho do ficheiro remoto (remoteFilePath).');
  }

  const safePath = payload.remoteFilePath.trim();
  const isPdf = safePath.toLowerCase().endsWith('.pdf');

  // Caso seja PDF remoto, faz encode em base64; caso seja texto/log, usa tail/cat
  const maxLines = payload.maxLines || 500;
  const readCmd = isPdf
    ? `base64 -w 0 "${safePath}"`
    : `tail -n ${maxLines} "${safePath}" 2>/dev/null || cat "${safePath}"`;

  const sshResult = await executeSshCommand({
    ...payload,
    command: readCmd
  });

  if (!sshResult.success && !sshResult.stdout) {
    throw new Error(
      `Falha ao ler o ficheiro remoto "${safePath}": ${sshResult.stderr || 'Ficheiro não encontrado ou inacessível.'}`
    );
  }

  const fileName = safePath.split('/').pop() || 'remote_document.txt';

  const ragResult = await (processAndIngestDocument as any)({
    fileName: `${payload.host || 'remote'}_${fileName}`,
    fileType: fileName.split('.').pop()?.toLowerCase() || 'txt',
    contentBase64: isPdf ? sshResult.stdout : undefined,
    rawText: isPdf ? undefined : sshResult.stdout,
    category: payload.category || 'ssh_remote_server',
    chunkSize: payload.chunkSize || 1000,
    chunkOverlap: payload.chunkOverlap || 200,
    metadata: {
      ...(payload.metadata || {}),
      source: 'ssh_remote_server',
      sshHost: payload.host,
      remoteFilePath: safePath
    }
  });

  return {
    success: true,
    host: payload.host,
    remoteFilePath: safePath,
    ragIngestion: ragResult
  };
}
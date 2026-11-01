import crypto from 'crypto';
import https from 'https';
import tls from 'tls';

export type SupportedAuthType = 'none' | 'oauth2' | 'api_key' | 'basic' | 'jwt' | 'ssl_tls';

export interface AuthCredentialsConfig {
  authType?: SupportedAuthType;
  // API Key
  apiKey?: string;
  apiKeyHeaderName?: string; // Ex: 'X-API-Key' ou 'Authorization'
  apiKeyLocation?: 'header' | 'query';
  apiKeyQueryParam?: string;
  // Basic Auth
  username?: string;
  password?: string;
  // OAuth2
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  scope?: string;
  // JWT
  jwtToken?: string;
  jwtSecretOrPrivateKey?: string;
  jwtAlgorithm?: 'HS256' | 'RS256';
  jwtPayload?: Record<string, any>;
  jwtExpiresInSeconds?: number;
  // Certificados SSL/TLS Personalizados (mTLS)
  sslCaCert?: string;
  sslClientCert?: string;
  sslClientKey?: string;
  sslPassphrase?: string;
  rejectUnauthorized?: boolean;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Gera um token JWT assinado dinamicamente (HS256 ou RS256)
 */
export function generateDynamicJwt(config: AuthCredentialsConfig): string {
  if (config.jwtToken) return config.jwtToken;

  const alg = config.jwtAlgorithm || 'HS256';
  const secret = config.jwtSecretOrPrivateKey || process.env.JWT_SECRET || 'jarvis-default-secret';
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (config.jwtExpiresInSeconds || 3600);

  const header = { alg, typ: 'JWT' };
  const payload = {
    iat: now,
    exp,
    iss: 'jarvis-n8n-core',
    ...(config.jwtPayload || {})
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;

  let signature = '';
  if (alg === 'RS256') {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    signature = base64UrlEncode(signer.sign(secret));
  } else {
    signature = base64UrlEncode(crypto.createHmac('sha256', secret).update(signingInput).digest());
  }

  return `${signingInput}.${signature}`;
}

/**
 * Renova automaticamente o Access Token OAuth2 caso possua refresh_token + token_url
 */
export async function resolveOAuth2AccessToken(config: AuthCredentialsConfig): Promise<string> {
  if (config.refreshToken && config.clientId && config.clientSecret && config.tokenUrl) {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret
      });
      if (config.scope) params.append('scope', config.scope);

      const resp = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: AbortSignal.timeout(10000)
      });

      if (resp.ok) {
        const data: any = await resp.json();
        if (data.access_token) {
          return data.access_token;
        }
      }
    } catch (err: any) {
      console.warn('⚠️ [OAuth2 Refresh] Falha ao renovar token, usando accessToken em cache:', err.message);
    }
  }
  return config.accessToken || '';
}

/**
 * Constrói opções TLS e https.Agent para Certificados SSL/TLS Personalizados (mTLS)
 */
export function buildCustomTlsOptions(config?: AuthCredentialsConfig): tls.ConnectionOptions | undefined {
  if (!config) return undefined;
  if (!config.sslCaCert && !config.sslClientCert && !config.sslClientKey && config.rejectUnauthorized === undefined) {
    return undefined;
  }

  return {
    ca: config.sslCaCert || undefined,
    cert: config.sslClientCert || undefined,
    key: config.sslClientKey || undefined,
    passphrase: config.sslPassphrase || undefined,
    rejectUnauthorized: config.rejectUnauthorized ?? true
  };
}

export function buildCustomHttpsAgent(config?: AuthCredentialsConfig): https.Agent | undefined {
  const tlsOpts = buildCustomTlsOptions(config);
  if (!tlsOpts) return undefined;
  return new https.Agent(tlsOpts);
}

/**
 * Resolve cabeçalhos HTTP, Query Params e Agente SSL/TLS para qualquer protocolo
 */
export async function buildAuthenticatedRequestContext(
  rawUrl: string,
  config: AuthCredentialsConfig = {},
  extraHeaders: Record<string, string> = {}
): Promise<{
  finalUrl: string;
  headers: Record<string, string>;
  httpsAgent?: https.Agent;
  tlsOptions?: tls.ConnectionOptions;
}> {
  const headers: Record<string, string> = { ...extraHeaders };
  let finalUrl = rawUrl;
  const authType = config.authType || 'api_key';

  switch (authType) {
    case 'oauth2': {
      const token = await resolveOAuth2AccessToken(config);
      if (token) headers['Authorization'] = `Bearer ${token}`;
      break;
    }

    case 'api_key': {
      const key = config.apiKey || '';
      if (key) {
        if (config.apiKeyLocation === 'query') {
          const paramName = config.apiKeyQueryParam || 'api_key';
          const separator = finalUrl.includes('?') ? '&' : '?';
          finalUrl = `${finalUrl}${separator}${encodeURIComponent(paramName)}=${encodeURIComponent(key)}`;
        } else {
          const headerName = config.apiKeyHeaderName || 'Authorization';
          headers[headerName] =
            headerName.toLowerCase() === 'authorization' && !key.toLowerCase().startsWith('bearer ')
              ? `Bearer ${key}`
              : key;
        }
      }
      break;
    }

    case 'basic': {
      const user = config.username || '';
      const pass = config.password || '';
      const encoded = Buffer.from(`${user}:${pass}`, 'utf-8').toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
      break;
    }

    case 'jwt': {
      const jwt = generateDynamicJwt(config);
      headers['Authorization'] = `Bearer ${jwt}`;
      break;
    }

    case 'ssl_tls': {
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }
      break;
    }

    default:
      break;
  }

  return {
    finalUrl,
    headers,
    httpsAgent: buildCustomHttpsAgent(config),
    tlsOptions: buildCustomTlsOptions(config)
  };
}


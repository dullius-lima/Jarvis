import { pool } from '../config/database.js';

export function normalizeEntityKey(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 150);
}

export interface UpsertTripletInput {
  oldSource?: string;
  oldTarget?: string;
  source: string;
  sourceType?: string;
  sourceProps?: Record<string, any>;
  relation: string;
  target: string;
  targetType?: string;
  targetProps?: Record<string, any>;
  metadata?: Record<string, any>;
}

export async function upsertKnowledgeTriplet(input: UpsertTripletInput) {
  const sourceKey = normalizeEntityKey(input.source);
  const targetKey = normalizeEntityKey(input.target);
  const relationKey = normalizeEntityKey(input.relation || 'relacionado_a');

  if (!sourceKey || !targetKey || !relationKey) {
    return { success: false, message: 'Entidade origem, relação e destino são obrigatórios.' };
  }

  if (input.oldSource) {
    const oldSKey = normalizeEntityKey(input.oldSource);
    if (oldSKey && oldSKey !== sourceKey) {
      await pool.query(`DELETE FROM knowledge_nodes WHERE entity_key = $1;`, [oldSKey]).catch(() => {});
    }
  }
  if (input.oldTarget) {
    const oldTKey = normalizeEntityKey(input.oldTarget);
    if (oldTKey && oldTKey !== targetKey) {
      await pool.query(`DELETE FROM knowledge_nodes WHERE entity_key = $1;`, [oldTKey]).catch(() => {});
    }
  }
  const existingNodes = await pool.query(
    `SELECT entity_key FROM knowledge_nodes WHERE entity_key = ANY($1);`,
    [[sourceKey, targetKey]]
  );
  const existingSet = new Set(existingNodes.rows.map((r: any) => r.entity_key));

  await pool.query(
    `INSERT INTO knowledge_nodes (entity_key, label, entity_type, properties, mention_count, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, 1, NOW())
     ON CONFLICT (entity_key) DO UPDATE SET
       label = COALESCE(NULLIF(EXCLUDED.label, ''), knowledge_nodes.label),
       entity_type = CASE WHEN EXCLUDED.entity_type <> 'geral' THEN EXCLUDED.entity_type ELSE knowledge_nodes.entity_type END,
       properties = knowledge_nodes.properties || EXCLUDED.properties,
       mention_count = knowledge_nodes.mention_count + 1,
       updated_at = NOW();`,
    [sourceKey, input.source.trim(), normalizeEntityKey(input.sourceType || 'geral') || 'geral', JSON.stringify(input.sourceProps || {})]
  );

  await pool.query(
    `INSERT INTO knowledge_nodes (entity_key, label, entity_type, properties, mention_count, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, 1, NOW())
     ON CONFLICT (entity_key) DO UPDATE SET
       label = COALESCE(NULLIF(EXCLUDED.label, ''), knowledge_nodes.label),
       entity_type = CASE WHEN EXCLUDED.entity_type <> 'geral' THEN EXCLUDED.entity_type ELSE knowledge_nodes.entity_type END,
       properties = knowledge_nodes.properties || EXCLUDED.properties,
       mention_count = knowledge_nodes.mention_count + 1,
       updated_at = NOW();`,
    [targetKey, input.target.trim(), normalizeEntityKey(input.targetType || 'geral') || 'geral', JSON.stringify(input.targetProps || {})]
  );

  await pool.query(
    `INSERT INTO knowledge_edges (source_key, relation, target_key, weight, metadata, updated_at)
     VALUES ($1, $2, $3, 1.00, $4::jsonb, NOW())
     ON CONFLICT (source_key, relation, target_key) DO UPDATE SET
       weight = LEAST(5.00, knowledge_edges.weight + 0.15),
       metadata = knowledge_edges.metadata || EXCLUDED.metadata,
       updated_at = NOW();`,
    [sourceKey, relationKey, targetKey, JSON.stringify(input.metadata || {})]
  );

  return {
    success: true,
    sourceAction: existingSet.has(sourceKey) ? 'UPDATED' : 'CREATED',
    targetAction: existingSet.has(targetKey) ? 'UPDATED' : 'CREATED',
    triplet: `${input.source.trim()} --[${relationKey}]--> ${input.target.trim()}`
  };
}

export async function queryRelevantSubgraph(userPrompt: string, limit = 15): Promise<string> {
  const tokens = Array.from(
    new Set(
      normalizeEntityKey(userPrompt)
        .split('_')
        .filter((t) => t.length >= 3)
    )
  ).slice(0, 12);

  if (tokens.length === 0) return '';

  const patterns = tokens.map((t) => `%${t}%`);
  const edgesRes = await pool
    .query(
      `SELECT e.relation, s.label AS source_label, s.entity_type AS source_type, s.properties AS source_props,
              t.label AS target_label, t.entity_type AS target_type, t.properties AS target_props
       FROM knowledge_edges e
       JOIN knowledge_nodes s ON s.entity_key = e.source_key
       JOIN knowledge_nodes t ON t.entity_key = e.target_key
       WHERE e.source_key ILIKE ANY($1) OR e.target_key ILIKE ANY($1)
          OR s.label ILIKE ANY($1) OR t.label ILIKE ANY($1)
       ORDER BY e.weight DESC, e.updated_at DESC
       LIMIT $2;`,
      [patterns, limit]
    )
    .catch(() => ({ rows: [] as any[] }));

  if (edgesRes.rows.length === 0) return '';

  return edgesRes.rows
    .map((r: any) => {
      const sExtra = r.source_props && Object.keys(r.source_props).length ? ` ${JSON.stringify(r.source_props)}` : '';
      const tExtra = r.target_props && Object.keys(r.target_props).length ? ` ${JSON.stringify(r.target_props)}` : '';
      return `- (${r.source_type}) ${r.source_label}${sExtra} --[${r.relation}]--> (${r.target_type}) ${r.target_label}${tExtra}`;
    })
    .join('\n');
}

import { Router, Request, Response } from 'express';
import { pool } from '../config/database.js';
import { upsertKnowledgeTriplet } from '../services/knowledgeGraphService.js';
import { invalidateSemanticRouteCache } from '../services/semanticRouteCacheService.js';

const router = Router();

router.get('/knowledge-graph', async (_req: Request, res: Response) => {
  try {
    const [nodesRes, edgesRes] = await Promise.all([
      pool.query(
        `SELECT id, entity_key, label, entity_type, properties, mention_count, updated_at
         FROM knowledge_nodes
         ORDER BY mention_count DESC, updated_at DESC
         LIMIT 200;`
      ),
      pool.query(
        `SELECT e.id, e.source_key, s.label AS source_label, s.entity_type AS source_type,
                e.relation, e.target_key, t.label AS target_label, t.entity_type AS target_type,
                e.weight, e.metadata, e.updated_at
         FROM knowledge_edges e
         JOIN knowledge_nodes s ON s.entity_key = e.source_key
         JOIN knowledge_nodes t ON t.entity_key = e.target_key
         ORDER BY e.weight DESC, e.updated_at DESC
         LIMIT 300;`
      )
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalNodes: nodesRes.rows.length,
        totalEdges: edgesRes.rows.length
      },
      nodes: nodesRes.rows,
      edges: edgesRes.rows
    });
  } catch (error: any) {
    return res.status(200).json({ success: false, error: error.message, nodes: [], edges: [] });
  }
});

router.post('/knowledge-graph', async (req: Request, res: Response) => {
  try {
    const result = await upsertKnowledgeTriplet(req.body || {});
    if (result.success) {
      await invalidateSemanticRouteCache().catch(() => {});
    }
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(200).json({ success: false, error: error.message });
  }
});

router.delete('/knowledge-graph/nodes/:entityKey', async (req: Request, res: Response) => {
  try {
    const { entityKey } = req.params;
    const del = await pool.query(
      `DELETE FROM knowledge_nodes WHERE entity_key = $1 RETURNING entity_key, label;`,
      [entityKey]
    );
    await invalidateSemanticRouteCache().catch(() => {});
    return res.status(200).json({
      success: true,
      deleted: del.rows[0] || null
    });
  } catch (error: any) {
    return res.status(200).json({ success: false, error: error.message });
  }
});

router.get('/route-cache', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, prompt_sample, agent_slug, agent_name, tool_name, hit_count, updated_at
       FROM semantic_route_cache
       ORDER BY hit_count DESC, updated_at DESC
       LIMIT 200;`
    );
    const totalHits = result.rows.reduce((acc: number, r: any) => acc + Number(r.hit_count || 0), 0);
    return res.status(200).json({
      success: true,
      stats: {
        totalRoutes: result.rows.length,
        totalHits
      },
      routes: result.rows
    });
  } catch (error: any) {
    return res.status(200).json({ success: false, error: error.message, routes: [] });
  }
});

router.delete('/route-cache', async (req: Request, res: Response) => {
  try {
    const agentSlug = typeof req.query.agentSlug === 'string' ? req.query.agentSlug.trim() : undefined;
    await invalidateSemanticRouteCache(agentSlug);
    return res.status(200).json({
      success: true,
      message: agentSlug ? `Cache limpo para o especialista ${agentSlug}.` : 'Cache Semântico de Rotas limpo com sucesso.'
    });
  } catch (error: any) {
    return res.status(200).json({ success: false, error: error.message });
  }
});

router.delete('/route-cache/:id', async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM semantic_route_cache WHERE id = $1;`, [Number(req.params.id)]);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(200).json({ success: false, error: error.message });
  }
});

export default router;

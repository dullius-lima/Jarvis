// src/routes/agentRoutes.ts
import { Router } from 'express';
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  sandboxAgent,
  getWaitStatesQueue,
  resolveWaitStateDecision
} from '../controllers/agentController.js';

const router = Router();

// CRUD de Agentes Especialistas e Playground Sandbox
router.get('/', listAgents);
router.post('/', createAgent);
router.post('/sandbox', sandboxAgent);
router.put('/:id', updateAgent);
router.delete('/:id', deleteAgent);

// Rotas do Estado Wait (Aprovação Humana / Human-in-the-Loop)
router.get('/wait/list', getWaitStatesQueue);
router.post('/wait/:identifier/decision', resolveWaitStateDecision);
router.get('/wait/:identifier/decision', resolveWaitStateDecision);

export const agentRoutes = router;
export default router;
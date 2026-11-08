// src/routes/agentRoutes.ts
import { Router } from 'express';
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  deleteAllAgents,
  listAvailableCredentials,
  runHackerAuditController,
  testAgentSandbox
} from '../controllers/agentController.js';

const router = Router();

// 1. Rotas estáticas prioritárias (devem anteceder /:id)
router.get('/credentials', listAvailableCredentials);
router.post('/hacker/audit', runHackerAuditController);
router.post('/sandbox', testAgentSandbox);
router.delete('/all/clear', deleteAllAgents);

// 2. Rotas CRUD
router.get('/', listAgents);
router.post('/', createAgent);
router.put('/:id', updateAgent);
router.delete('/:id', deleteAgent);

export const agentRoutes = router;
export default router;

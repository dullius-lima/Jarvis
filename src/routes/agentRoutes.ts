// src/routes/agentRoutes.ts
import { Router } from 'express';
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  listAvailableCredentials
} from '../controllers/agentController.js';

// Adicione junto das suas outras rotas de agentes:
import { runHackerAuditController } from '../controllers/agentController.js';
router.post('/hacker/audit', runHackerAuditController);

const router = Router();

// 1. Rota de metadados de credenciais seguras (DEVE vir antes de /:id)
router.get('/credentials', listAvailableCredentials);

// 2. Rotas CRUD dos Agentes
router.get('/', listAgents);
router.post('/', createAgent);
router.put('/:id', updateAgent);
router.delete('/:id', deleteAgent);

// Exportação dupla: compatível com qualquer formato de import no server.ts
export const agentRoutes = router;
export default router;

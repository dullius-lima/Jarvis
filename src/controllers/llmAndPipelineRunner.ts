// Motor OpenAI/Groq/Gemini/Ollama e Pipeline de Especialistas (Fachada Unificada)
// src/services/orchestrator/llmAndPipelineRunner.ts

import {
  chamarLLMCompativelOpenAI,
  callOpenAICompatibleLLM,
  normalizarTexto,
  limparMascaraChave,
  obterChaveContingenciaEnv
} from './motorInferencaLLM.js';

import {
  executarConectorApiUniversal,
  executeUniversalApiConnector
} from './executorConectorApi.js';

import {
  executarFerramentaVinculada,
  executeBoundTool
} from './executorFerramentasFixas.js';

import {
  executarEsteiraEspecialistas,
  executeSpecialistPipeline,
  executeSpecialistNode,
  executeAgentChain
} from './esteiraEspecialistas.js';

export {
  // Funções em Português
  chamarLLMCompativelOpenAI,
  executarConectorApiUniversal,
  executarFerramentaVinculada,
  executarEsteiraEspecialistas,
  normalizarTexto,
  limparMascaraChave,
  obterChaveContingenciaEnv,
  // Aliases de Compatibilidade Original
  callOpenAICompatibleLLM,
  executeUniversalApiConnector,
  executeBoundTool,
  executeSpecialistPipeline,
  executeSpecialistNode,
  executeAgentChain
};

export default {
  callOpenAICompatibleLLM,
  executeUniversalApiConnector,
  executeBoundTool,
  executeSpecialistPipeline,
  executeSpecialistNode,
  executeAgentChain
};
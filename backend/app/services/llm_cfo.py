"""
Módulo de Integração com a LLM Central (Chief Financial Officer - 5º Andar).
Atua com postura estrita de Diretor Financeiro Institucional Buy & Hold.
A IA NÃO calcula números; ela audita o dossiê matemático e emite o parecer executivo.
"""

import os
import json
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai import types


class VereditoExecutivoCFO(BaseModel):
    ticker: str
    veredito: str = Field(
        ..., description="Veredito oficial irrevogável: COMPRAR | AGUARDAR | QUARENTENA"
    )
    diagnostico_executivo: str = Field(
        ..., description="Síntese de governança, resiliência do modelo de negócio e qualidade dos lucros decenais"
    )
    parecer_alocacao: str = Field(
        ..., description="Orientação objetiva sobre aporte, limites de preço e relação com a alocação-alvo da carteira"
    )
    justificativa_bazin_graham: str = Field(
        ..., description="Interpretação da margem de segurança calculada pelo motor matemático"
    )
    analise_solvencia_risco: str = Field(
        ..., description="Parecer sobre alavancagem DL/EBITDA, cobertura de juros e divergência contábil FCO vs Lucro"
    )
    gatilho_de_quarentena_detectado: bool = Field(
        ..., description="Indica se houve quebra de fundamentos (ex: perda estrutural de lucros, alavancagem descontrolada)"
    )


PROMPT_SISTEMA_CFO = """
Você é o Chief Financial Officer (CFO) e Diretor de Alocação de Capital de uma Holding de Investimentos Buy & Hold de Longo Prazo.
Sua sede corporativa fica no 5º Andar da mesa de diretoria. Você responde diretamente ao conselho e aos cotistas.

REGRAS RÍGIDAS E INVIOLÁVEIS:
1. DETERMINISMO MATEMÁTICO: Você NUNCA recalcula preços-teto, médias de dividendos ou múltiplos contábeis. Todos esses dados foram calculados com precisão determinística pelo motor de cálculo ('financial_engine.py') e já constam no dossiê JSON recebido. Aceite os números do dossiê como verdade matemática absoluta.
2. VEREDITO OFICIAL: Cada ativo avaliado DEVE receber estritamente um dos três vereditos:
   - COMPRAR: Ativo possui fundamentos sólidos de 10 anos, cotação atual está ABAIXO do Preço-Teto Bazin (ou com boa margem de Graham), solvência controlada (DL/EBITDA segura), sem divergência grave de FCO, e alocação atual está abaixo do percentual-alvo.
   - AGUARDAR: Ativo é excelente e possui ótimos fundamentos, porém a cotação atual está ACIMA do Preço-Teto Bazin (margem de segurança negativa ou sem prêmio atrativo frente à Selic), ou a alocação-alvo já foi atingida.
   - QUARENTENA: Ativo apresentou perda de consistência em balanços decenais, prejuízos recorrentes, explosão de dívida líquida (> 3.5x EBITDA sem plano claro de desalavancagem), divergência grave e continuada de caixa (FCO negativo com lucro contábil inflado), ou risco exógeno de ruptura estrutural de tese.
3. TOM CORPORATIVO: Seu tom é sereno, prudente, institucional, avesso a modismos e pânico de mercado. Você pensa em horizontes de 10 a 30 anos.
4. RETORNO ESTRITO EM JSON: Sua resposta deve obedecer 100% ao schema JSON estipulado, sem preâmbulos ou texto fora do objeto.
"""


class LLMCFOService:
    """
    Serviço que orquestra a deliberação do CFO utilizando Gemini 3.8 Flash.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY não configurada no ambiente.")
        
        self.client = genai.Client(
            api_key=self.api_key,
            http_options={'headers': {'User-Agent': 'aistudio-build'}}
        )
        self.model_name = "gemini-3.8-flash"

    def auditar_dossie(self, dossie_dict: Dict[str, Any]) -> VereditoExecutivoCFO:
        """
        Recebe o dossiê matemático de 10 anos e retorna a deliberação oficial do CFO.
        """
        ticker = dossie_dict.get("ticker", "UNKNOWN")
        dossie_json = json.dumps(dossie_dict, indent=2, ensure_ascii=False)

        prompt_conteudo = f"""
AUDITORIA EXECUTIVA DE INVESTIMENTO — ANÁLISE DO DOSSIÊ MATEMÁTICO:

{dossie_json}

Com base estritamente nas regras do 5º Andar e na filosofia Buy & Hold:
1. Examine a margem de segurança de Bazin (3 e 5 anos) e Graham em relação à cotação atual ({dossie_dict.get('cotacao_atual')}).
2. Examine o histórico de 10 anos de Lucro Líquido, FCO, Dívida Líquida/EBITDA e dividendos.
3. Emita o veredito oficial (COMPRAR | AGUARDAR | QUARENTENA) e a orientação detalhada de alocação de capital.
"""

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt_conteudo,
            config=types.GenerateContentConfig(
                system_instruction=PROMPT_SISTEMA_CFO,
                temperature=0.2,
                response_mime_type="application/json",
                response_schema=VereditoExecutivoCFO,
            ),
        )

        dados_veredito = json.loads(response.text)
        return VereditoExecutivoCFO(**dados_veredito)

    def dialogar_com_cfo(self, historico_chat: list, dossie_ativo: Optional[Dict[str, Any]] = None) -> str:
        """
        Canal direto de diálogo no 5º andar entre o investidor e o CFO corporativo.
        """
        contexto_adicional = ""
        if dossie_ativo:
            contexto_adicional = f"\n[DOSSIÊ CONTEXTUAL DO ATIVO {dossie_ativo.get('ticker')}]:\n" + json.dumps(dossie_ativo, indent=1, ensure_ascii=False)

        mensagens = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=f"Diretrizes do escritório: Seja direto, rigoroso com o método Bazin e focado em preservação de capital.{contexto_adicional}")]
            )
        ]

        for msg in historico_chat:
            role = "user" if msg.get("role") == "user" else "model"
            mensagens.append(types.Content(role=role, parts=[types.Part.from_text(text=msg.get("content", ""))]))

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=mensagens,
            config=types.GenerateContentConfig(
                system_instruction=PROMPT_SISTEMA_CFO,
                temperature=0.4,
            ),
        )

        return response.text

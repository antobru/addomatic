import type { LLMProvider, PipelineContext, StageConfig } from '@addomatic/core';

export function riskAssessmentStage(provider: LLMProvider): StageConfig {
  return {
    type: 'agent',
    name: 'risk-assessment',
    task: (ctx: PipelineContext): string => {
      const estimate = ctx.stages['estimate']?.output ?? '';
      const scope    = ctx.stages['scope-analysis']?.output ?? '';
      return (
        'Analizza i rischi che potrebbero impattare la stima del progetto.\n\n' +
        'Per ogni rischio usa il formato:\n' +
        'RISCHIO-N: <nome>\n' +
        '  Probabilità: Alta | Media | Bassa\n' +
        '  Impatto: Alto | Medio | Basso\n' +
        '  Effetto sulla stima: +X–Y giorni / blocco / nessuno\n' +
        '  Mitigazione: <azione concreta>\n\n' +
        'Considera: requisiti ambigui, dipendenze esterne, tecnologie nuove, ' +
        'team size, integrazioni complesse, vincoli di sicurezza/compliance.\n\n' +
        `SCOPE:\n${scope}\n\n` +
        `STIMA:\n${estimate}`
      );
    },
    agentConfig: {
      provider,
      model: 'gpt-5.4',
      temperature: 0.2,
      maxTokens: 1500,
      systemPrompt:
        'Sei un risk manager specializzato in progetti software. ' +
        'Identifica rischi concreti e misurabili, non generici. ' +
        'Ogni rischio deve avere una mitigazione pratica e attuabile.',
    },
  };
}

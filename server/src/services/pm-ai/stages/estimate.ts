import type { LLMProvider, PipelineContext, StageConfig } from '@addomatic/core';

export function estimateStage(provider: LLMProvider): StageConfig {
  return {
    type: 'agent',
    name: 'estimate',
    task: (ctx: PipelineContext): string => {
      const tasks = ctx.previous!.output;
      const scope = ctx.stages['scope-analysis']?.output ?? '';
      return (
        'Per ogni task della WBS fornisci una stima dettagliata nel seguente formato:\n\n' +
        'TASK-N: <nome>\n' +
        '  Giorni ideali: <min>–<max> gg\n' +
        '  Figura richiesta: <Junior Dev | Mid Dev | Senior Dev | Tech Lead | Designer | DevOps | QA | PM>\n' +
        '  N. persone: <numero>\n' +
        '  Note: <assunzioni, rischi, dipendenze critiche>\n\n' +
        'Dopo la lista task, aggiungi:\n\n' +
        '## Riepilogo Risorse\n' +
        'Tabella: | Figura | Giorni totali | FTE equivalente |\n\n' +
        '## Totale Stimato\n' +
        '- Durata progetto (parallelo): X–Y settimane\n' +
        '- Effort totale: X–Y giorni/persona\n' +
        '- Team minimo consigliato: <composizione>\n\n' +
        `ANALISI SCOPE:\n${scope}\n\n` +
        `WBS:\n${tasks}`
      );
    },
    agentConfig: {
      provider,
      model: 'gpt-5.4',
      temperature: 0.1,
      maxTokens: 3000,
      systemPrompt:
        'Sei un tech lead con esperienza in stima progetti Agile e a corpo fisso. ' +
        'Le stime sono in giorni ideali (giornata da 6h produttive). ' +
        "Usa sempre range min–max per comunicare l'incertezza. " +
        'Sii realistico: includi overhead di comunicazione, code review, bug fixing (20-30% buffer). ' +
        'Specifica sempre le assunzioni sottostanti.',
    },
  };
}

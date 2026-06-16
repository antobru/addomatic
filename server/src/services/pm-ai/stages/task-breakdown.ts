import type { LLMProvider, PipelineContext, StageConfig } from '@addomatic/core';

export function taskBreakdownStage(provider: LLMProvider): StageConfig {
  return {
    type: 'agent',
    name: 'task-breakdown',
    task: (ctx: PipelineContext): string => {
      const scope   = ctx.stages['scope-analysis']?.output ?? '';
      const docText = ctx.stages['extract-pdf']?.output ?? '';
      return (
        "Basandoti sull'analisi dello scope e sul documento originale, " +
        'crea una Work Breakdown Structure (WBS) completa del progetto.\n\n' +
        'Per ogni task elenca ESATTAMENTE in questo formato:\n' +
        'TASK-N: <nome conciso>\n' +
        '  Descrizione: <cosa va fatto esattamente>\n' +
        '  Dipendenze: <TASK-X, TASK-Y o "nessuna">\n' +
        '  Categoria: <Frontend | Backend | Database | DevOps | Testing | Design | PM | Altro>\n' +
        '  Priorità: <Alta | Media | Bassa>\n\n' +
        'Includi TUTTI i task necessari: setup, sviluppo feature, test, deploy, documentazione.\n\n' +
        `ANALISI SCOPE:\n${scope}\n\n` +
        `DOCUMENTO ORIGINALE (riferimento):\n${docText.slice(0, 3000)}…`
      );
    },
    agentConfig: {
      provider,
      model: 'gpt-5.4',
      temperature: 0.3,
      maxTokens: 3000,
      systemPrompt:
        'Sei un project manager tecnico esperto in decomposizione di progetti software complessi. ' +
        'Produci WBS complete e granulari: ogni task deve essere atomico e stimabile. ' +
        'Non omettere task "scomodi" come onboarding, code review, bug fixing, deploy. ' +
        'Usa il formato TASK-N richiesto senza deviazioni.',
    },
  };
}

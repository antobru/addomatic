import type { LLMProvider, PipelineContext, StageConfig } from '@addomatic/core';

export function scopeAnalysisStage(provider: LLMProvider): StageConfig {
  return {
    type: 'agent',
    name: 'scope-analysis',
    task: (ctx: PipelineContext): string =>
      "Leggi i seguenti documenti e produci un'analisi dello scope del progetto.\n\n" +
      'Inizia SEMPRE con questa riga (senza markdown aggiuntivo attorno al nome):\n' +
      '**Nome Progetto:** <nome breve e chiaro, max 40 caratteri, solo lettere/cifre/spazi/trattini>\n\n' +
      'Poi identifica e descrivi:\n' +
      '1. **Obiettivo principale** del progetto\n' +
      '2. **Funzionalità richieste** (lista numerata, una per riga)\n' +
      '3. **Stack tecnologico** menzionato o inferibile\n' +
      '4. **Vincoli** noti (scadenze, budget, normative, integrazioni)\n' +
      '5. **Ambiguità o informazioni mancanti** che impattano la stima\n\n' +
      `DOCUMENTI:\n\n${ctx.previous!.output}`,
    agentConfig: {
      provider,
      model: 'gpt-5.4',
      temperature: 0.2,
      maxTokens: 2048,
      systemPrompt:
        'Sei un senior solution architect con 15 anni di esperienza nella stima di progetti software. ' +
        'Analisi precisa, senza aggiungere assunzioni non supportate dal testo. ' +
        'Se qualcosa non è chiaro, segnalalo esplicitamente.',
    },
  };
}

/**
 * tools.ts
 * --------
 * Strumenti di esempio per la demo. Un tool e' semplicemente: un nome, una
 * descrizione (che il modello legge per decidere se usarlo), uno schema degli
 * argomenti e una funzione `execute`.
 */
import type { AgentTool } from '../types.js';

/**
 * Calcolatrice aritmetica. Dare uno strumento di calcolo deterministico a un
 * LLM riduce gli errori di aritmetica "a mente" durante i ragionamenti.
 *
 * SICUREZZA: si valuta una stringa, quindi prima si filtra con una whitelist
 * di caratteri (cifre e operatori). In produzione preferire un vero parser di
 * espressioni (es. la libreria `mathjs`) invece del costruttore Function.
 */
export const calculatorTool: AgentTool = {
  name: 'calculator',
  description:
    "Valuta un'espressione aritmetica e ne restituisce il risultato numerico. " +
    'Usalo per qualunque calcolo invece di calcolare a mente.',
  input_schema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Espressione aritmetica, ad esempio "(12 * 7) + 3".',
      },
    },
    required: ['expression'],
  },
  execute: (input) => {
    const expression = String(input.expression ?? '');
    if (!/^[\d\s+\-*/().%]+$/.test(expression)) {
      return "Errore: l'espressione contiene caratteri non consentiti.";
    }
    try {
      // Function isolata: nessun accesso allo scope esterno. Vedi nota sopra.
      const result = Function(`"use strict"; return (${expression});`)() as unknown;
      return String(result);
    } catch {
      return 'Errore: espressione non valida.';
    }
  },
};

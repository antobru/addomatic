import Showdown from 'showdown';

const converter = new Showdown.Converter({ tables: true, strikethrough: true, tasklists: true });

export function markdownToHtml(md: string): string {
  return converter.makeHtml(md);
}

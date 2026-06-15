import * as showdown from 'showdown'


export function isHtml(text: string | undefined): boolean {
    if (!text) return false;
    return /<[a-z][\s\S]*>/i.test(text);
}

function toHtml(text: string | undefined): string {
    const converter = new showdown.Converter();
    return converter.makeHtml(text || '');
}

export const Markdown = {
    isHtml,
    toHtml,
}
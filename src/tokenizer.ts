import type { Token } from './types.js';

const XML_ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
};

export function unescapeXml(s: string): string {
    return s
        .replace(/&([a-zA-Z]+);/g, (_, name) => XML_ENTITIES[name] ?? `&${name};`)
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}


export function preprocess(src: string): string {
    return src.replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}


function parseAttrs(attrStr: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const re = /([^\s=>"'/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
    
    let m: RegExpExecArray | null;

    while ((m = re.exec(attrStr)) !== null) {
        const key = m[1]!.toLowerCase();
        const val = m[2] ?? m[3] ?? 'true';
        attrs[key] = unescapeXml(val);
    }
    return attrs;
}


export function tokenize(src: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    let line = 1;

    const countLines = (s: string): void => {
        for (const ch of s) if (ch === '\n') line++;
    };

    while (i < src.length) {
        const curLine = line;

        if (src[i] !== '<') {
            const end = src.indexOf('<', i);
            const text = end === -1 ? src.slice(i) : src.slice(i, end);
            if (text) {
                tokens.push({ kind: 'text', value: unescapeXml(text), line: curLine });
                countLines(text);
            }
            if (end === -1) break;
            i = end;
            continue;
        }

        if (src.startsWith('<!--', i)) {
            const end = src.indexOf('-->', i + 4);
            const raw = end === -1 ? src.slice(i) : src.slice(i, end + 3);
            countLines(raw);
            tokens.push({ kind: 'comment', value: raw, line: curLine });
            i = end === -1 ? src.length : end + 3;
            continue;
        }

        if (src.startsWith('<![CDATA[', i)) {
            const end = src.indexOf(']]>', i + 9);
            const content = src.slice(i + 9, end === -1 ? src.length : end);
            countLines(content);
            tokens.push({ kind: 'cdata', value: content, raw: true, line: curLine });
            i = end === -1 ? src.length : end + 3;
            continue;
        }

        if (src.startsWith('<!', i)) {
            const end = src.indexOf('>', i);
            i = end === -1 ? src.length : end + 1;
            continue;
        }

        if (src.startsWith('<?', i)) {
            const end = src.indexOf('?>', i);
            i = end === -1 ? src.length : end + 2;
            continue;
        }

        if (src[i + 1] === '/') {
            const end = src.indexOf('>', i);
            if (end === -1) { i = src.length; break; }
            const tag = src.slice(i + 2, end).trim().toLowerCase();
            tokens.push({ kind: 'close', tag, line: curLine });
            i = end + 1;
            continue;
        }

        const end = src.indexOf('>', i);
        if (end === -1) { i = src.length; break; }

        let inner = src.slice(i + 1, end);
        const selfClose = inner.trimEnd().endsWith('/');
        if (selfClose) inner = inner.slice(0, inner.lastIndexOf('/')).trimEnd();

        const tagMatch = inner.match(/^\s*([a-zA-Z][a-zA-Z0-9_:*-]*)/);
        if (!tagMatch) { i = end + 1; continue; }

        const tagName = tagMatch[1]!.toLowerCase();
        const attrStr = inner.slice(tagMatch[0].length);
        const attrs = parseAttrs(attrStr);

        countLines(src.slice(i, end + 1));
        tokens.push({ kind: selfClose ? 'selfclose' : 'open', tag: tagName, attrs, line: curLine });
        i = end + 1;
    }

    return tokens;
}

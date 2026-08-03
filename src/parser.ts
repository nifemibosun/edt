import type { Token, ElementNode, TextNode, ParseResult, ParseError } from './types.js';

function makeRoot(): ElementNode {
    return { kind: 'element', tag: 'root', attrs: {}, children: [] };
}

function makeElement(tag: string, attrs: Record<string, string>, line?: number): ElementNode {
    return { kind: 'element', tag, attrs, children: [], line };
}

function makeText(value: string, raw: boolean): TextNode {
    return { kind: 'text', value, raw };
}

const VERBATIM_TAGS = new Set(['raw', 'tex', 'verbatim', 'lstlisting', 'minted', 'cdata']);

export function parse(tokens: Token[]): ParseResult {
    const errors: ParseError[] = [];
    const root = makeRoot();
    const stack: ElementNode[] = [root];

    const top = () => stack[stack.length - 1];

    for (const tok of tokens) {
        switch (tok.kind) {
            case 'comment':
                break;

            case 'cdata':
            case 'text': {
                const value = tok.value ?? '';

                if (!value) break;
                if (stack.length === 1 && value.trim() === '') break;

                top()!.children.push(makeText(value, tok.raw ?? false));
                break;
            }

            case 'open': {
                const el = makeElement(tok.tag!, tok.attrs ?? {}, tok.line);
                top()!.children.push(el);
                if (!VERBATIM_TAGS.has(tok.tag!)) {
                    stack.push(el);
                } else {
                    stack.push(el);
                }
                break;
            }

            case 'selfclose': {
                const el = makeElement(tok.tag!, tok.attrs ?? {}, tok.line);
                top()!.children.push(el);
                break;
            }

            case 'close': {
                let found = -1;
                for (let i = stack.length - 1; i >= 1; i--) {
                    if (stack[i]!.tag === tok.tag) { found = i; break; }
                }
                if (found >= 1) {
                    if (found < stack.length - 1) {
                        errors.push({
                            message: `Implicitly closed <${stack[stack.length - 1]!.tag}> by </${tok.tag}>`,
                            line: tok.line,
                        });
                    }
                    stack.splice(found);
                } else {
                    errors.push({ message: `Unmatched closing tag </${tok.tag}>`, line: tok.line });
                }
                break;
            }
        }
    }

    // Auto-close any still-open tags
    if (stack.length > 1) {
        errors.push({
            message: `Unclosed tags at end of document: ${stack.slice(1).map(e => `<${e.tag}>`).join(', ')}`,
        });
    }

    return { root, errors };
}

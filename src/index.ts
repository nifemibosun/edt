export { preprocess, tokenize, unescapeXml } from './tokenizer.js';
export { parse } from './parser.js';
export { emit } from './emitter.js';
export type { AstNode, ElementNode, TextNode, ParseResult, ParseError, Token } from './types.js';

import { preprocess, tokenize } from './tokenizer.js';
import { parse } from './parser.js';
import { emit } from './emitter.js';
import type { ParseError } from './types.js';

export interface CompileResult {
    latex: string;
    errors: ParseError[];
}

/**
 * Compile an edt source string to LaTeX.
 * Errors are non-fatal parse warnings (unclosed tags, etc.); LaTeX is always
 * returned. Throw only on truly catastrophic internal errors (shouldn't happen).
 */
export function compile(source: string): CompileResult {
    const processed = preprocess(source);
    const tokens = tokenize(processed);
    const { root, errors } = parse(tokens);
    const latex = emit(root);
    return { latex, errors };
}

/**
 * Compile and return just the LaTeX string, throwing on any parse error.
 * Convenient for programmatic use where you want a simple function.
 */
export function compileStrict(source: string): string {
    const { latex, errors } = compile(source);
    if (errors.length > 0) {
        throw new Error(errors.map(e => e.message).join('\n'));
    }
    return latex;
}

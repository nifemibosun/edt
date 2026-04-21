export { preprocess, tokenize, unescapeXml } from './tokenizer';
export { parse }                              from './parser';
export { emit }                               from './emitter';
export type { AstNode, ElementNode, TextNode, ParseResult, ParseError, Token } from './types';

import { preprocess, tokenize } from './tokenizer';
import { parse }                from './parser';
import { emit }                 from './emitter';
import type { ParseError }      from './types';

export interface CompileResult {
  latex:  string;
  errors: ParseError[];
}

/**
 * Compile an edt source string to LaTeX.
 * Errors are non-fatal parse warnings (unclosed tags, etc.); LaTeX is always
 * returned. Throw only on truly catastrophic internal errors (shouldn't happen).
 */
export function compile(source: string): CompileResult {
  const processed = preprocess(source);
  const tokens    = tokenize(processed);
  const { root, errors } = parse(tokens);
  const latex     = emit(root);
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

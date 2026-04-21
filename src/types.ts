export interface TextNode {
  kind: 'text';
  value: string;
  /** When true the value was inside CDATA and must not be XML-unescaped */
  raw: boolean;
}

export interface ElementNode {
  kind: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: AstNode[];
  /** Source line number (1-based) */
  line?: number;
}

export type AstNode = TextNode | ElementNode;

export interface ParseResult {
  root: ElementNode;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line?: number;
}


export type TokenKind =
  | 'text'
  | 'open'
  | 'close'
  | 'selfclose'
  | 'comment'
  | 'cdata'
  | 'doctype';

export interface Token {
  kind: TokenKind;
  tag?: string;
  attrs?: Record<string, string>;
  value?: string;
  raw?: boolean;
  line: number;
}

import type { AstNode, ElementNode } from './types.js';


function children(node: ElementNode, ctx: EmitContext): string {
    return node.children.map(n => emit(n, ctx)).join('');
}

function attr(node: ElementNode, key: string, fallback = ''): string {
    return node.attrs[key] ?? fallback;
}

function env(name: string, body: string, options = ''): string {
    return `\\begin{${name}}${options}\n${body}\\end{${name}}\n\n`;
}

function cmd(name: string, body: string, options = ''): string {
    return options ? `\\${name}[${options}]{${body}}` : `\\${name}{${body}}`;
}

interface EmitContext {
    inMath: boolean;
    inVerbatim: boolean;
}

const DEFAULT_CTX: EmitContext = { inMath: false, inVerbatim: false };

function normalizeText(value: string, ctx: EmitContext): string {
    if (ctx.inVerbatim) return value;
    if (value === '') return value;

    if (/^\s*$/.test(value)) {
        return value.includes('\n') ? '' : ' ';
    }

    const leading = /^\s/.test(value) ? ' ' : '';
    const trailing = /\s$/.test(value) ? ' ' : '';
    const core = value.trim().replace(/\s+/g, ' ');
    return leading + core + trailing;
}

function postProcess(latex: string): string {
    return latex
        .split('\n')
        .map(line => line.replace(/[ \t]+$/, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n');
}

export function emitDocument(ast: AstNode): string {
    return postProcess(emit(ast));
}


function thmEnv(node: ElementNode, envName: string, ctx: EmitContext): string {
    const title = attr(node, 'name') || attr(node, 'title');
    const id = attr(node, 'id') || attr(node, 'label');
    const star = attr(node, 'star') === 'true' ? '*' : '';
    const opts = title ? `[${title}]` : '';
    return (
        `\\begin{${envName}${star}}${opts}\n` +
        (id ? `\\label{${id}}\n` : '') +
        children(node, { ...ctx, inMath: false }) +
        `\\end{${envName}${star}}\n\n`
    );
}


function mathChildren(node: ElementNode, ctx: EmitContext): string {
    return children(node, { ...ctx, inMath: true });
}

function verbatimChildren(node: ElementNode, ctx: EmitContext): string {
    return children(node, { ...ctx, inVerbatim: true });
}


function sectionCmd(level: string, node: ElementNode, ctx: EmitContext): string {
    const name = attr(node, 'name') || attr(node, 'title');
    const star = attr(node, 'star') === 'true' ? '*' : '';
    const short = attr(node, 'short');
    const id = attr(node, 'id') || attr(node, 'label');
    const opts = short ? `[${short}]` : '';
    return (
        `\n\\${level}${star}${opts}{${name}}\n` +
        (id ? `\\label{${id}}\n` : '') +
        children(node, ctx)
    );
}


function colorCmd(node: ElementNode, ctx: EmitContext): string {
    const name = attr(node, 'name') || attr(node, 'color', 'black');
    const model = attr(node, 'model');
    return model
        ? `\\textcolor[${model}]{${name}}{${children(node, ctx)}}`
        : `\\textcolor{${name}}{${children(node, ctx)}}`;
}


function tableRow(node: ElementNode, ctx: EmitContext): string {
    const cells = node.children
        .filter((c): c is ElementNode => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th'))
        .map(cell => {
            const mc = attr(cell, 'colspan');
            const mr = attr(cell, 'rowspan');
            const al = attr(cell, 'align', 'l');
            let content = children(cell, ctx).trim();
            if (cell.tag === 'th') content = `\\textbf{${content}}`;
            if (mc) content = `\\multicolumn{${mc}}{${al}}{${content}}`;
            if (mr) content = `\\multirow{${mr}}{*}{${content}}`;
            return content;
        })
        .join(' & ');
    const hline = attr(node, 'hline') === 'false' ? '' : ' \\\\\n    \\hline';
    return `    ${cells}${hline}\n`;
}


function listItem(node: ElementNode, ctx: EmitContext): string {
    const label = attr(node, 'label');
    const id = attr(node, 'id');
    const mark = label ? `[${label}]` : '';
    const lbl = id ? ` \\label{${id}}` : '';
    return `  \\item${mark}${lbl} ${children(node, ctx).trim()}\n`;
}


export function emit(node: AstNode, ctx: EmitContext = DEFAULT_CTX): string {
    if (node.kind === 'text') return normalizeText(node.value, ctx);
    const n = node;
    const ch = () => children(n, ctx);
    const a = (k: string, d = '') => attr(n, k, d);

    switch (n.tag) {
        case 'root': return ch();
        case 'document':
        case 'doc': {
            const cls = a('class', 'article');
            const opts = a('options');
            return opts
                ? `\\documentclass[${opts}]{${cls}}\n${ch()}`
                : `\\documentclass{${cls}}\n${ch()}`;
        }

        case 'usepackage':
        case 'pkg': {
            const opts = a('options') || a('opts');
            return opts
                ? `\\usepackage[${opts}]{${a('name')}}\n`
                : `\\usepackage{${a('name')}}\n`;
        }

        case 'preamble': return ch();

        case 'newcommand': {
            const c2 = a('cmd') || a('name');
            const args = a('args') || a('argc');
            const def = a('default');
            if (args && def) return `\\newcommand{${c2}}[${args}][${def}]{${ch()}}\n`;
            if (args) return `\\newcommand{${c2}}[${args}]{${ch()}}\n`;
            return `\\newcommand{${c2}}{${ch()}}\n`;
        }

        case 'renewcommand': {
            const c2 = a('cmd') || a('name');
            const args = a('args');
            return args
                ? `\\renewcommand{${c2}}[${args}]{${ch()}}\n`
                : `\\renewcommand{${c2}}{${ch()}}\n`;
        }

        case 'newenvironment': {
            const name = a('name');
            const args = a('args', '0');
            const before = a('before');
            const after = a('after');
            return `\\newenvironment{${name}}[${args}]{${before}}{${after}}\n`;
        }

        case 'declareoperator':
            return `\\DeclareMathOperator{${a('cmd')}}{${a('name') || ch()}}\n`;

        case 'declaremathoperator':
            return `\\DeclareMathOperator{${a('cmd')}}{${ch()}}\n`;

        case 'setlength':
            return `\\setlength{${a('cmd')}}{${a('value') || ch()}}\n`;

        case 'addtolength':
            return `\\addtolength{${a('cmd')}}{${a('value') || ch()}}\n`;

        case 'setcounter':
            return `\\setcounter{${a('name')}}{${a('value') || ch()}}\n`;

        case 'body': return `\n\\begin{document}\n${ch()}\\end{document}\n`;
        case 'title': return `\\title{${ch()}}\n`;
        case 'subtitle': return `\\subtitle{${ch()}}\n`;
        case 'author': return `\\author{${ch()}}\n`;
        case 'date': return `\\date{${ch()}}\n`;
        case 'maketitle': return `\\maketitle\n\n`;
        case 'makeatletter': return `\\makeatletter\n${ch()}\\makeatother\n`;
        case 'abstract': return env('abstract', ch());
        case 'tableofcontents': return `\\tableofcontents\n\n`;
        case 'listoffigures': return `\\listoffigures\n\n`;
        case 'listoftables': return `\\listoftables\n\n`;
        case 'appendix': return `\\appendix\n${ch()}`;

        case 'part': return sectionCmd('part', n, ctx);
        case 'chapter': return sectionCmd('chapter', n, ctx);
        case 'section': return sectionCmd('section', n, ctx);
        case 'subsection': return sectionCmd('subsection', n, ctx);
        case 'subsubsection': return sectionCmd('subsubsection', n, ctx);
        case 'paragraph': return sectionCmd('paragraph', n, ctx);
        case 'subparagraph': return sectionCmd('subparagraph', n, ctx);

        case 'part*': return sectionCmd('part*', n, ctx);
        case 'chapter*': return sectionCmd('chapter*', n, ctx);
        case 'section*': return sectionCmd('section*', n, ctx);
        case 'subsection*': return sectionCmd('subsection*', n, ctx);
        case 'subsubsection*': return sectionCmd('subsubsection*', n, ctx);
        case 'paragraph*': return sectionCmd('paragraph*', n, ctx);

        case 'p': return `${ch()}\n\n`;
        case 'par': return `\n\n${ch()}`;

        // Font shape
        case 'b': case 'bold': case 'textbf': return `\\textbf{${ch()}}`;
        case 'i': case 'em': case 'textit': return `\\textit{${ch()}}`;
        case 'emph': return `\\emph{${ch()}}`;
        case 'u': case 'underline': return `\\underline{${ch()}}`;
        case 'tt': case 'code': case 'texttt': return `\\texttt{${ch()}}`;
        case 'sc': case 'textsc': return `\\textsc{${ch()}}`;
        case 'sl': case 'textsl': return `\\textsl{${ch()}}`;
        case 'rm': case 'textrm': return `\\textrm{${ch()}}`;
        case 'sf': case 'textsf': return `\\textsf{${ch()}}`;
        case 'up': case 'textup': return `\\textup{${ch()}}`;
        case 'md': case 'textmd': return `\\textmd{${ch()}}`;
        case 'it': case 'itshape': return `{\\itshape ${ch()}}`;
        case 'bf': case 'bfseries': return `{\\bfseries ${ch()}}`;

        // Underlines (ulem package)
        case 'uline': return `\\uline{${ch()}}`;
        case 'uuline': return `\\uuline{${ch()}}`;
        case 'uwave': return `\\uwave{${ch()}}`;
        case 'sout': case 'strike': return `\\sout{${ch()}}`;
        case 'xout': return `\\xout{${ch()}}`;
        case 'dashuline': return `\\dashuline{${ch()}}`;
        case 'dotuline': return `\\dotuline{${ch()}}`;

        // Font size
        case 'tiny': return `{\\tiny ${ch()}}`;
        case 'scriptsize': return `{\\scriptsize ${ch()}}`;
        case 'footnotesize': return `{\\footnotesize ${ch()}}`;
        case 'small': return `{\\small ${ch()}}`;
        case 'normalsize': return `{\\normalsize ${ch()}}`;
        case 'large': return `{\\large ${ch()}}`;
        case 'Large': return `{\\Large ${ch()}}`;
        case 'LARGE': return `{\\LARGE ${ch()}}`;
        case 'huge': return `{\\huge ${ch()}}`;
        case 'Huge': return `{\\Huge ${ch()}}`;
        case 'fontsize': {
            const size = a('size', '12pt');
            const skip = a('skip', '14pt');
            return `{\\fontsize{${size}}{${skip}}\\selectfont ${ch()}}`;
        }

        case 'color':
        case 'textcolor': return colorCmd(n, ctx);
        case 'colorbox': {
            const col = a('name') || a('color', 'yellow');
            return `\\colorbox{${col}}{${ch()}}`;
        }
        case 'fcolorbox': {
            const frame = a('frame', 'black');
            const bg = a('bg', 'white');
            return `\\fcolorbox{${frame}}{${bg}}{${ch()}}`;
        }
        case 'definecolor': {
            const model = a('model', 'rgb');
            const spec = a('value') || a('spec');
            return `\\definecolor{${a('name')}}{${model}}{${spec}}\n`;
        }

        // Boxes
        case 'mbox': return `\\mbox{${ch()}}`;
        case 'fbox': return `\\fbox{${ch()}}`;
        case 'framebox': {
            const w = a('width');
            const pos = a('pos', 'c');
            return w ? `\\framebox[${w}][${pos}]{${ch()}}` : `\\framebox{${ch()}}`;
        }
        case 'makebox': {
            const w = a('width');
            const pos = a('pos', 'c');
            return w ? `\\makebox[${w}][${pos}]{${ch()}}` : `\\makebox{${ch()}}`;
        }
        case 'parbox': {
            const pos = a('pos', 'c');
            const w = a('width', '0.45\\textwidth');
            return `\\parbox[${pos}]{${w}}{${ch()}}`;
        }
        case 'raisebox': {
            const lift = a('lift', '0pt');
            const height = a('height');
            const depth = a('depth');
            const dims = [height && `[${height}]`, depth && `[${depth}]`].filter(Boolean).join('');
            return `\\raisebox{${lift}}${dims}{${ch()}}`;
        }
        case 'rotatebox': return `\\rotatebox{${a('angle', '0')}}{${ch()}}`;
        case 'scalebox': return `\\scalebox{${a('scale', '1')}}{${ch()}}`;
        case 'resizebox': return `\\resizebox{${a('width', '\\textwidth')}}{${a('height', '!')}}{${ch()}}`;

        // Misc text
        case 'footnote': return `\\footnote{${ch()}}`;
        case 'footnotemark': return `\\footnotemark`;
        case 'footnotetext': return `\\footnotetext{${ch()}}`;
        case 'marginpar': return `\\marginpar{${ch()}}`;
        case 'endnote': return `\\endnote{${ch()}}`;
        case 'noindent': return `\\noindent `;
        case 'indent': return `\\indent `;
        case 'linebreak': return `\\linebreak\n`;
        case 'pagebreak': return `\\pagebreak\n`;
        case 'nolinebreak': return `\\nolinebreak `;
        case 'nopagebreak': return `\\nopagebreak `;
        case 'allowbreak': return `\\allowbreak `;
        case 'hfill': return `\\hfill `;
        case 'vfill': return `\\vfill\n`;
        case 'dotfill': return `\\dotfill `;
        case 'hrulefill': return `\\hrulefill `;

        // Superscript / subscript
        case 'sup': return `$^{${ch()}}$`;
        case 'sub': return `$_{${ch()}}$`;
        case 'textsuperscript': return `\\textsuperscript{${ch()}}`;
        case 'textsubscript': return `\\textsubscript{${ch()}}`;

        // Dashes & special chars
        case 'ndash': return '--';
        case 'mdash': return '---';
        case 'ldots': return '\\ldots{}';
        case 'ellipsis': return '\\ldots{}';
        case 'nbsp': return '~';
        case 'thinspace': return '\\,';
        case 'enspace': return '\\enspace{}';
        case 'quad': return '\\quad{}';
        case 'qquad': return '\\qquad{}';

        // Hyphenation & spacing
        case 'hyphenation': return `\\hyphenation{${ch()}}\n`;
        case 'mbox-': return `\\mbox{${ch()}}`;

        case 'm': case 'math': case 'im':
            return `$${mathChildren(n, ctx)}$`;

        case 'dm': case 'dmath': case 'displaymath':
            return `\\[\n${mathChildren(n, ctx).trim()}\n\\]\n`;

        case 'eq':
        case 'equation':
            return env('equation', mathChildren(n, ctx).trim() + '\n');

        case 'eq*':
        case 'equation*':
            return env('equation*', mathChildren(n, ctx).trim() + '\n');

        case 'align': return env('align', mathChildren(n, ctx).trim() + '\n');
        case 'align*': return env('align*', mathChildren(n, ctx).trim() + '\n');
        case 'alignat': return env('alignat', mathChildren(n, ctx).trim() + '\n', `{${a('cols', '2')}}`);
        case 'alignat*': return env('alignat*', mathChildren(n, ctx).trim() + '\n', `{${a('cols', '2')}}`);
        case 'flalign': return env('flalign', mathChildren(n, ctx).trim() + '\n');
        case 'flalign*': return env('flalign*', mathChildren(n, ctx).trim() + '\n');
        case 'gather': return env('gather', mathChildren(n, ctx).trim() + '\n');
        case 'gather*': return env('gather*', mathChildren(n, ctx).trim() + '\n');
        case 'multline': return env('multline', mathChildren(n, ctx).trim() + '\n');
        case 'multline*': return env('multline*', mathChildren(n, ctx).trim() + '\n');
        case 'split': return env('split', mathChildren(n, ctx).trim() + '\n');
        case 'subequations': return env('subequations', ch());

        // Inline math structures
        case 'cases': return `\\begin{cases}\n${mathChildren(n, ctx).trim()}\n\\end{cases}`;
        case 'dcases': return `\\begin{dcases}\n${mathChildren(n, ctx).trim()}\n\\end{dcases}`;
        case 'rcases': return `\\begin{rcases}\n${mathChildren(n, ctx).trim()}\n\\end{rcases}`;
        case 'matrix': return `\\begin{matrix}\n${mathChildren(n, ctx).trim()}\n\\end{matrix}`;
        case 'pmatrix': return `\\begin{pmatrix}\n${mathChildren(n, ctx).trim()}\n\\end{pmatrix}`;
        case 'bmatrix': return `\\begin{bmatrix}\n${mathChildren(n, ctx).trim()}\n\\end{bmatrix}`;
        case 'Bmatrix': return `\\begin{Bmatrix}\n${mathChildren(n, ctx).trim()}\n\\end{Bmatrix}`;
        case 'vmatrix': return `\\begin{vmatrix}\n${mathChildren(n, ctx).trim()}\n\\end{vmatrix}`;
        case 'Vmatrix': return `\\begin{Vmatrix}\n${mathChildren(n, ctx).trim()}\n\\end{Vmatrix}`;
        case 'smallmatrix': return `\\begin{smallmatrix}\n${mathChildren(n, ctx).trim()}\n\\end{smallmatrix}`;
        case 'array': {
            const cols = a('cols', 'cc');
            return `\\begin{array}{${cols}}\n${mathChildren(n, ctx).trim()}\n\\end{array}`;
        }

        // Math font commands
        case 'mathbb': return `\\mathbb{${ch()}}`;
        case 'mathcal': return `\\mathcal{${ch()}}`;
        case 'mathfrak': return `\\mathfrak{${ch()}}`;
        case 'mathbf': return `\\mathbf{${ch()}}`;
        case 'mathrm': return `\\mathrm{${ch()}}`;
        case 'mathit': return `\\mathit{${ch()}}`;
        case 'mathsf': return `\\mathsf{${ch()}}`;
        case 'mathtt': return `\\mathtt{${ch()}}`;
        case 'mathscr': return `\\mathscr{${ch()}}`;
        case 'boldsymbol': return `\\boldsymbol{${ch()}}`;
        case 'pmb': return `\\pmb{${ch()}}`;

        // Math spacing
        case 'text': return `\\text{${ch()}}`;
        case 'intertext': return `\\intertext{${ch()}}`;
        case 'shortintertext': return `\\shortintertext{${ch()}}`;

        // Math operators
        case 'operatorname': return `\\operatorname{${ch()}}`;
        case 'operatorname*': return `\\operatorname*{${ch()}}`;

        // Math accents
        case 'hat': return `\\hat{${ch()}}`;
        case 'bar': return `\\bar{${ch()}}`;
        case 'tilde': return `\\tilde{${ch()}}`;
        case 'vec': return `\\vec{${ch()}}`;
        case 'dot': return `\\dot{${ch()}}`;
        case 'ddot': return `\\ddot{${ch()}}`;
        case 'dddot': return `\\dddot{${ch()}}`;
        case 'ddddot': return `\\ddddot{${ch()}}`;
        case 'breve': return `\\breve{${ch()}}`;
        case 'check': return `\\check{${ch()}}`;
        case 'acute': return `\\acute{${ch()}}`;
        case 'grave': return `\\grave{${ch()}}`;
        case 'widehat': return `\\widehat{${ch()}}`;
        case 'widetilde': return `\\widetilde{${ch()}}`;
        case 'overline': return `\\overline{${ch()}}`;
        case 'underline2': return `\\underline{${ch()}}`;
        case 'overbrace': return `\\overbrace{${ch()}}`;
        case 'underbrace': return `\\underbrace{${ch()}}`;
        case 'overleftarrow': return `\\overleftarrow{${ch()}}`;
        case 'overrightarrow': return `\\overrightarrow{${ch()}}`;
        case 'overset': return `\\overset{${a('over')}}{${ch()}}`;
        case 'underset': return `\\underset{${a('under')}}{${ch()}}`;
        case 'xrightarrow': return `\\xrightarrow[${a('below', '')}]{${ch()}}`;
        case 'xleftarrow': return `\\xleftarrow[${a('below', '')}]{${ch()}}`;
        case 'xleftrightarrow': return `\\xleftrightarrow[${a('below', '')}]{${ch()}}`;

        // Fractions, roots, etc
        case 'frac': return `\\frac{${a('num')}}{${a('den')}}`;
        case 'dfrac': return `\\dfrac{${a('num')}}{${a('den')}}`;
        case 'tfrac': return `\\tfrac{${a('num')}}{${a('den')}}`;
        case 'cfrac': return `\\cfrac{${a('num')}}{${a('den')}}`;
        case 'binom': return `\\binom{${a('n')}}{${a('k')}}`;
        case 'dbinom': return `\\dbinom{${a('n')}}{${a('k')}}`;
        case 'tbinom': return `\\tbinom{${a('n')}}{${a('k')}}`;
        case 'sqrt': return a('n') ? `\\sqrt[${a('n')}]{${ch()}}` : `\\sqrt{${ch()}}`;

        // Delimiters
        case 'left': return `\\left${a('delim', '(')}\n${ch()}\n\\right${a('rdelim', ')')}`;
        case 'abs': return `\\left|${ch()}\\right|`;
        case 'norm': return `\\left\\|${ch()}\\right\\|`;
        case 'floor': return `\\left\\lfloor ${ch()} \\right\\rfloor`;
        case 'ceil': return `\\left\\lceil ${ch()} \\right\\rceil`;
        case 'inner': return `\\left\\langle ${ch()} \\right\\rangle`;
        case 'set': return `\\left\\{${ch()}\\right\\}`;

        // Limits / sums / integrals as convenience wrappers
        case 'sum': return `\\sum_{${a('from')}}^{${a('to')}}`;
        case 'prod': return `\\prod_{${a('from')}}^{${a('to')}}`;
        case 'int': return `\\int_{${a('from')}}^{${a('to')}}`;
        case 'oint': return `\\oint_{${a('from')}}^{${a('to')}}`;
        case 'iint': return `\\iint`;
        case 'iiint': return `\\iiint`;
        case 'lim': return `\\lim_{${ch()}}`;
        case 'limsup': return `\\limsup_{${ch()}}`;
        case 'liminf': return `\\liminf_{${ch()}}`;
        case 'sup2': return `\\sup`;
        case 'inf2': return `\\inf`;
        case 'max': return `\\max_{${ch()}}`;
        case 'min': return `\\min_{${ch()}}`;

        // Equation numbering
        case 'tag': return `\\tag{${ch()}}`;
        case 'tag*': return `\\tag*{${ch()}}`;
        case 'notag': return `\\notag`;
        case 'nonumber': return `\\nonumber`;
        case 'label2': return `\\label{${a('id')}}`;

        case 'theorem': return thmEnv(n, 'theorem', ctx);
        case 'theorem*': return thmEnv(n, 'theorem*', ctx);
        case 'lemma': return thmEnv(n, 'lemma', ctx);
        case 'lemma*': return thmEnv(n, 'lemma*', ctx);
        case 'corollary': return thmEnv(n, 'corollary', ctx);
        case 'corollary*': return thmEnv(n, 'corollary*', ctx);
        case 'proposition': return thmEnv(n, 'proposition', ctx);
        case 'proposition*': return thmEnv(n, 'proposition*', ctx);
        case 'definition': return thmEnv(n, 'definition', ctx);
        case 'definition*': return thmEnv(n, 'definition*', ctx);
        case 'example': return thmEnv(n, 'example', ctx);
        case 'example*': return thmEnv(n, 'example*', ctx);
        case 'remark': return thmEnv(n, 'remark', ctx);
        case 'remark*': return thmEnv(n, 'remark*', ctx);
        case 'note': return thmEnv(n, 'note', ctx);
        case 'conjecture': return thmEnv(n, 'conjecture', ctx);
        case 'claim': return thmEnv(n, 'claim', ctx);
        case 'observation': return thmEnv(n, 'observation', ctx);
        case 'notation': return thmEnv(n, 'notation', ctx);
        case 'assumption': return thmEnv(n, 'assumption', ctx);
        case 'axiom': return thmEnv(n, 'axiom', ctx);
        case 'criterion': return thmEnv(n, 'criterion', ctx);
        case 'algorithm2': return thmEnv(n, 'algorithm', ctx);
        case 'exercise': return thmEnv(n, 'exercise', ctx);
        case 'problem': return thmEnv(n, 'problem', ctx);
        case 'solution': return thmEnv(n, 'solution', ctx);
        case 'question': return thmEnv(n, 'question', ctx);
        case 'answer': return thmEnv(n, 'answer', ctx);

        // Proof (has optional QED label and optional title)
        case 'proof': {
            const title = a('name') || a('title') || a('of');
            const opts = title ? `[${title}]` : '';
            return env('proof', ch(), opts);
        }

        // amsthm: newtheorem shortcut
        case 'newtheorem': {
            const name = a('name');
            const title = a('title') || ch();
            const counter = a('counter');
            const shared = a('shared');
            if (counter) return `\\newtheorem{${name}}[${counter}]{${title}}\n`;
            if (shared) return `\\newtheorem{${name}}{${title}}[${shared}]\n`;
            return `\\newtheorem{${name}}{${title}}\n`;
        }
        case 'newtheorem*': {
            return `\\newtheorem*{${a('name')}}{${a('title') || ch()}}\n`;
        }
        case 'theoremstyle':
            return `\\theoremstyle{${a('style') || ch()}}\n`;

        case 'ul':
        case 'itemize': {
            const opts = a('options') || a('label');
            return opts ? env('itemize', ch(), `[${opts}]`) : env('itemize', ch());
        }
        case 'ol':
        case 'enumerate': {
            const opts = a('options') || a('label');
            return opts ? env('enumerate', ch(), `[${opts}]`) : env('enumerate', ch());
        }
        case 'dl':
        case 'description': return env('description', ch());
        case 'li': return listItem(n, ctx);
        case 'dt': return `  \\item[${ch().trim()}] `;
        case 'dd': return `${ch().trim()}\n`;
        case 'compactitem': return env('compactitem', ch());
        case 'compactenum': return env('compactenum', ch());

        case 'figure': {
            const pos = a('pos', 'htbp');
            return `\\begin{figure}[${pos}]\n  \\centering\n${ch()}\\end{figure}\n\n`;
        }
        case 'figure*': {
            const pos = a('pos', 'htbp');
            return `\\begin{figure*}[${pos}]\n  \\centering\n${ch()}\\end{figure*}\n\n`;
        }
        case 'wrapfigure': {
            const pos = a('pos', 'r');
            const width = a('width', '0.45\\textwidth');
            return `\\begin{wrapfigure}{${pos}}{${width}}\n  \\centering\n${ch()}\\end{wrapfigure}\n\n`;
        }
        case 'subfigure': {
            const width = a('width', '0.45\\textwidth');
            return `  \\begin{subfigure}[b]{${width}}\n    \\centering\n${ch()}  \\end{subfigure}\n`;
        }
        case 'includegraphics': {
            const opts = a('options') || a('opts');
            const src = a('src') || a('file');
            return opts
                ? `  \\includegraphics[${opts}]{${src}}\n`
                : `  \\includegraphics{${src}}\n`;
        }
        case 'caption': {
            const short = a('short');
            return short
                ? `  \\caption[${short}]{${ch()}}\n`
                : `  \\caption{${ch()}}\n`;
        }
        case 'subcaption': return `    \\caption{${ch()}}\n`;

        case 'table': {
            const pos = a('pos', 'htbp');
            return `\\begin{table}[${pos}]\n  \\centering\n${ch()}\\end{table}\n\n`;
        }
        case 'table*': {
            const pos = a('pos', 'htbp');
            return `\\begin{table*}[${pos}]\n  \\centering\n${ch()}\\end{table*}\n\n`;
        }
        case 'tabular': {
            const cols = a('cols', 'l l');
            const opts = a('options');
            const spec = opts ? `[${opts}]{${cols}}` : `{${cols}}`;
            return `  \\begin{tabular}${spec}\n    \\hline\n${ch()}  \\end{tabular}\n`;
        }
        case 'tabular*': {
            const width = a('width', '\\textwidth');
            const cols = a('cols', '@{\\extracolsep{\\fill}} l l');
            return `  \\begin{tabular*}{${width}}{${cols}}\n    \\hline\n${ch()}  \\end{tabular*}\n`;
        }
        case 'tabularx': {
            const width = a('width', '\\textwidth');
            const cols = a('cols', 'l X');
            return `  \\begin{tabularx}{${width}}{${cols}}\n${ch()}  \\end{tabularx}\n`;
        }
        case 'longtable': {
            const cols = a('cols', 'l l');
            return env('longtable', ch(), `{${cols}}`);
        }
        case 'tr': return tableRow(n, ctx);
        case 'th': return `\\textbf{${ch()}} & `;
        case 'td': return `${ch()} & `;

        // booktabs rules
        case 'toprule': return `    \\toprule\n`;
        case 'midrule': return `    \\midrule\n`;
        case 'bottomrule': return `    \\bottomrule\n`;
        case 'cmidrule': {
            const cols = a('cols', '1-2');
            return `    \\cmidrule{${cols}}\n`;
        }
        case 'hline': return `    \\hline\n`;
        case 'multicolumn': {
            const n2 = a('n', '1');
            const al = a('align', 'c');
            return `\\multicolumn{${n2}}{${al}}{${ch()}}`;
        }
        case 'multirow': {
            const n2 = a('n', '1');
            const width = a('width', '*');
            return `\\multirow{${n2}}{${width}}{${ch()}}`;
        }

        case 'label': return `\\label{${a('id') || ch()}}`;
        case 'ref': return `\\ref{${a('id')}}`;
        case 'eqref': return `\\eqref{${a('id')}}`;
        case 'pageref': return `\\pageref{${a('id')}}`;
        case 'autoref': return `\\autoref{${a('id')}}`;
        case 'cref': return `\\cref{${a('id')}}`;
        case 'Cref': return `\\Cref{${a('id')}}`;
        case 'nameref': return `\\nameref{${a('id')}}`;
        case 'vref': return `\\vref{${a('id')}}`;

        // Citations (biblatex / natbib / bibtex)
        case 'cite': return `\\cite{${a('id')}}`;
        case 'citep': return `\\citep${a('pre') ? `[${a('pre')}]` : ''}${a('post') ? `[${a('post')}]` : ''}{${a('id')}}`;
        case 'citet': return `\\citet{${a('id')}}`;
        case 'citealt': return `\\citealt{${a('id')}}`;
        case 'citealp': return `\\citealp{${a('id')}}`;
        case 'citeauthor': return `\\citeauthor{${a('id')}}`;
        case 'citeyear': return `\\citeyear{${a('id')}}`;
        case 'citenum': return `\\citenum{${a('id')}}`;
        case 'parencite': return `\\parencite{${a('id')}}`;
        case 'textcite': return `\\textcite{${a('id')}}`;
        case 'fullcite': return `\\fullcite{${a('id')}}`;
        case 'nocite': return `\\nocite{${a('id') || '*'}}\n`;

        // URLs
        case 'url': return `\\url{${ch()}}`;
        case 'href': return `\\href{${a('url')}}{${ch()}}`;
        case 'nolinkurl': return `\\nolinkurl{${ch()}}`;

        case 'center': return env('center', ch());
        case 'flushright': return env('flushright', ch());
        case 'flushleft': return env('flushleft', ch());
        case 'quote': return env('quote', ch());
        case 'quotation': return env('quotation', ch());
        case 'verse': return env('verse', ch());

        case 'minipage': {
            const pos = a('pos', 'b');
            const width = a('width', '0.45\\textwidth');
            return env('minipage', ch(), `[${pos}]{${width}}`);
        }

        case 'columns': return env('columns', ch());  // beamer
        case 'column': {
            const width = a('width', '0.5\\textwidth');
            return `\\begin{column}{${width}}\n${ch()}\\end{column}\n`;
        }

        case 'multicols': {
            const n2 = a('n', '2');
            return env('multicols', ch(), `{${n2}}`);
        }

        case 'newpage': return `\\newpage\n`;
        case 'clearpage': return `\\clearpage\n`;
        case 'cleardoublepage': return `\\cleardoublepage\n`;

        case 'vspace': {
            const star = a('star') === 'true' ? '*' : '';
            return `\\vspace${star}{${a('size', '1em')}}\n`;
        }
        case 'vspace*': return `\\vspace*{${a('size', '1em')}}\n`;
        case 'hspace': return `\\hspace{${a('size', '1em')}}`;
        case 'hspace*': return `\\hspace*{${a('size', '1em')}}`;

        case 'hr': return `\n\\hrule\n\n`;
        case 'br': return `\\\\\n`;
        case 'br/': return `\\\\\n`;

        case 'verbatim': return env('verbatim', verbatimChildren(n, ctx), '');
        case 'verbatim*': return env('verbatim*', verbatimChildren(n, ctx), '');
        case 'verb': {
            const del = a('delim', '|');
            return `\\verb${del}${verbatimChildren(n, ctx)}${del}`;
        }

        case 'lstlisting': {
            const lang = a('lang') || a('language');
            const caption = a('caption') || a('cap');
            const label = a('id') || a('label');
            const parts: string[] = [];
            if (lang) parts.push(`language=${lang}`);
            if (caption) parts.push(`caption={${caption}}`);
            if (label) parts.push(`label={${label}}`);
            const opts = parts.length ? `[${parts.join(', ')}]` : '';
            return `\\begin{lstlisting}${opts}\n${verbatimChildren(n, ctx)}\\end{lstlisting}\n\n`;
        }

        case 'minted': {
            const lang = a('lang') || a('language', 'text');
            const opts = a('options');
            const label = a('id') || a('label');
            const cap = a('caption');
            const envOpts = opts ? `[${opts}]` : '';
            let out = `\\begin{minted}${envOpts}{${lang}}\n${verbatimChildren(n, ctx)}\\end{minted}\n\n`;
            if (cap || label) {
                out += `% caption: ${cap} label: ${label}\n`;
            }
            return out;
        }

        case 'lstinline': {
            const lang = a('lang');
            const opts = lang ? `[language=${lang}]` : '';
            return `\\lstinline${opts}|${verbatimChildren(n, ctx)}|`;
        }

        //  BIBLIOGRAPHY
        case 'bibliography':
            return `\\bibliography{${a('src', 'refs')}}\n`;

        case 'bibliographystyle':
            return `\\bibliographystyle{${a('style', 'plain')}}\n`;

        // biblatex
        case 'printbibliography': {
            const title = a('title');
            return title
                ? `\\printbibliography[title={${title}}]\n`
                : `\\printbibliography\n`;
        }
        case 'addbibresource':
            return `\\addbibresource{${a('src') || ch()}}\n`;

        // BibTeX entry (for embedding inline)
        case 'bibitem': {
            const key = a('key') || a('id');
            const label = a('label');
            return label
                ? `\\bibitem[${label}]{${key}} ${ch().trim()}\n\n`
                : `\\bibitem{${key}} ${ch().trim()}\n\n`;
        }
        case 'thebibliography':
            return env('thebibliography', ch(), `{${a('widest', '99')}}`);

        case 'frame': {
            const title = a('title') || a('name');
            const opts = a('options') || a('opts');
            const fragile = a('fragile') === 'true' ? '[fragile]' : (opts ? `[${opts}]` : '');
            return (
                `\\begin{frame}${fragile}\n` +
                (title ? `  \\frametitle{${title}}\n` : '') +
                ch() +
                `\\end{frame}\n\n`
            );
        }
        case 'frametitle': return `  \\frametitle{${ch()}}\n`;
        case 'framesubtitle': return `  \\framesubtitle{${ch()}}\n`;

        case 'block': {
            const title = a('title') || a('name', '');
            return env('block', ch(), `{${title}}`);
        }
        case 'alertblock': {
            const title = a('title') || a('name', '');
            return env('alertblock', ch(), `{${title}}`);
        }
        case 'exampleblock': {
            const title = a('title') || a('name', '');
            return env('exampleblock', ch(), `{${title}}`);
        }
        case 'pause': return `\\pause\n`;
        case 'only': return `\\only<${a('slide')}>{${ch()}}`;
        case 'uncover': return `\\uncover<${a('slide')}>{${ch()}}`;
        case 'alert': return `\\alert{${ch()}}`;
        case 'visible': return `\\visible<${a('slide')}>{${ch()}}`;
        case 'invisible': return `\\invisible<${a('slide')}>{${ch()}}`;
        case 'usetheme': return `\\usetheme{${a('name') || ch()}}\n`;
        case 'usecolortheme': return `\\usecolortheme{${a('name') || ch()}}\n`;
        case 'usefonttheme': return `\\usefonttheme{${a('name') || ch()}}\n`;


        case 'algorithm': {
            const pos = a('pos', 'H');
            return `\\begin{algorithm}[${pos}]\n${ch()}\\end{algorithm}\n\n`;
        }
        case 'algorithmic':
            return env('algorithmic', ch(), a('noend') === 'true' ? '[1]' : '');
        case 'algocf':
            return env('algorithm2e', ch());

        case 'alginput': return `  \\Input{${ch()}}\n`;
        case 'algoutput': return `  \\Output{${ch()}}\n`;
        case 'algstate': return `  \\State ${ch().trim()}\n`;
        case 'algreturn': return `  \\Return ${ch().trim()}\n`;
        case 'algif': {
            const cond = a('cond');
            return `  \\If{${cond}}\n${ch()}  \\EndIf\n`;
        }
        case 'algfor': {
            const cond = a('cond');
            return `  \\For{${cond}}\n${ch()}  \\EndFor\n`;
        }
        case 'algwhile': {
            const cond = a('cond');
            return `  \\While{${cond}}\n${ch()}  \\EndWhile\n`;
        }
        case 'algproc': {
            const name = a('name');
            const args = a('args', '');
            return `  \\Procedure{${name}}{${args}}\n${ch()}  \\EndProcedure\n`;
        }
        case 'algfunc': {
            const name = a('name');
            const args = a('args', '');
            return `  \\Function{${name}}{${args}}\n${ch()}  \\EndFunction\n`;
        }
        case 'algcomment': return `  \\Comment{${ch()}}\n`;
        case 'algensure': return `  \\Ensure ${ch().trim()}\n`;
        case 'algrequire': return `  \\Require ${ch().trim()}\n`;

        case 'tikzpicture': {
            const opts = a('options') || a('opts');
            return env('tikzpicture', ch(), opts ? `[${opts}]` : '');
        }
        case 'tikzcd': {
            const opts = a('options') || a('opts');
            return env('tikzcd', ch(), opts ? `[${opts}]` : '');
        }
        case 'pgfplot':
        case 'pgfplots':
        case 'axis': {
            const opts = a('options');
            return env('axis', ch(), opts ? `[\n${opts}\n]` : '');
        }
        case 'addplot': return `  \\addplot${a('options') ? `[${a('options')}]` : ''} {${ch()}};\n`;
        case 'addplot3': return `  \\addplot3${a('options') ? `[${a('options')}]` : ''} {${ch()}};\n`;

        case 'pagestyle': return `\\pagestyle{${a('style') || ch()}}\n`;
        case 'thispagestyle': return `\\thispagestyle{${a('style') || ch()}}\n`;
        case 'lhead': return `\\lhead{${ch()}}\n`;
        case 'chead': return `\\chead{${ch()}}\n`;
        case 'rhead': return `\\rhead{${ch()}}\n`;
        case 'lfoot': return `\\lfoot{${ch()}}\n`;
        case 'cfoot': return `\\cfoot{${ch()}}\n`;
        case 'rfoot': return `\\rfoot{${ch()}}\n`;
        case 'fancyhf': return `\\fancyhf{}\n${ch()}`;

        case 'makeindex': return `\\makeindex\n`;
        case 'printindex': return `\\printindex\n`;
        case 'index': return `\\index{${a('key') || ch()}}`;
        case 'glossary': return `\\glossary{${a('key') || ch()}}`;
        case 'makeglossaries': return `\\makeglossaries\n`;
        case 'printglossaries': return `\\printglossaries\n`;
        case 'gls': return `\\gls{${a('key') || ch()}}`;
        case 'Gls': return `\\Gls{${a('key') || ch()}}`;
        case 'glspl': return `\\glspl{${a('key') || ch()}}`;

        case 'geometry': {
            const opts = a('options') || a('opts') || ch().trim();
            return `\\geometry{${opts}}\n`;
        }
        case 'linespread': return `\\linespread{${a('factor') || ch()}}\n`;
        case 'baselineskip': return `\\setlength{\\baselineskip}{${a('value') || ch()}}\n`;
        case 'parskip': return `\\setlength{\\parskip}{${a('value') || ch()}}\n`;
        case 'parindent': return `\\setlength{\\parindent}{${a('value') || ch()}}\n`;
        case 'columnsep': return `\\setlength{\\columnsep}{${a('value') || ch()}}\n`;
        case 'textwidth': return `\\setlength{\\textwidth}{${a('value') || ch()}}\n`;
        case 'textheight': return `\\setlength{\\textheight}{${a('value') || ch()}}\n`;
        case 'onecolumn': return `\\onecolumn\n`;
        case 'twocolumn': return `\\twocolumn\n`;

        //  GENERIC ESCAPE HATCHES
        case 'env': {
            const name = a('name');
            const opts = a('options') || a('opts');
            const star = a('star') === 'true' ? '*' : '';
            const body = ch();
            return opts
                ? env(name + star, body, `[${opts}]`)
                : env(name + star, body);
        }

        // <cmd name="X" options="...">...</cmd>  →  \X[options]{...}
        case 'cmd': {
            const name = a('name');
            const opts = a('options') || a('opts');
            const star = a('star') === 'true' ? '*' : '';
            return cmd(name + star, ch(), opts);
        }

        // <cmd0 name="X"/>  →  \X
        case 'cmd0': {
            const name = a('name');
            const space = a('space') === 'false' ? '' : ' ';
            return `\\${name}${space}`;
        }

        // <cmdopt name="X" opt="Y">Z</cmdopt>  →  \X[Y]{Z}
        case 'cmdopt': {
            const name = a('name');
            const opt = a('opt') || a('options');
            return opt ? `\\${name}[${opt}]{${ch()}}` : `\\${name}{${ch()}}`;
        }

        // <group>...</group>  →  {…}  (anonymous group)
        case 'group': return `{${ch()}}`;

        // <raw> / <tex>  →  verbatim passthrough
        case 'raw':
        case 'tex':
            return verbatimChildren(n, ctx);

        //  UNKNOWN TAGS: transparent passthrough of children
        default:
            return ch();
    }
}
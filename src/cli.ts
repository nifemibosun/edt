#!/usr/bin/env node
import * as fs   from 'fs';
import * as path from 'path';
import { compile } from './index';

const VERSION = '0.2.0';

const HELP = `
  edt v${VERSION} — HTML-like markup that compiles to LaTeX

  Usage:
    edt compile <file.edt>                 Compile → <file.tex> (same dir)
    edt compile <file.edt> -o <out.tex>    Compile → specific output path
    edt compile <file.edt> --stdout        Print LaTeX to stdout
    edt watch   <file.edt> [-o <out.tex>]  Watch and recompile on save
    edt check   <file.edt>                 Validate syntax, no output written
    edt --version                          Print version
    edt --help                             Print this help
`;


const c = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const log   = (msg: string) => process.stderr.write(msg + '\n');
const ok    = (msg: string) => log(`${c.green('✓')} ${msg}`);
const fail  = (msg: string) => log(`${c.red('✗')} ${msg}`);
const warn  = (msg: string) => log(`${c.yellow('⚠')} ${msg}`);
const info  = (msg: string) => log(`${c.cyan('›')} ${msg}`);
const stamp = () => c.dim(new Date().toLocaleTimeString());


interface Opts {
  output?: string;
  stdout:  boolean;
  strict:  boolean;
}

function resolveInput(file: string): string {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) {
    fail(`File not found: ${c.bold(file)}`);
    process.exit(1);
  }
  return p;
}

function resolveOutput(inputPath: string, outputOpt?: string): string {
  if (outputOpt) return path.resolve(outputOpt);
  const { dir, name } = path.parse(inputPath);
  return path.join(dir, `${name}.tex`);
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}


function runCompile(file: string, opts: Opts): boolean {
  const inputPath = resolveInput(file);
  let src: string;
  try {
    src = fs.readFileSync(inputPath, 'utf8');
  } catch (e: any) {
    fail(`Cannot read ${c.bold(file)}: ${e.message}`);
    return false;
  }

  let latex: string;
  let errors: { message: string; line?: number }[];
  try {
    ({ latex, errors } = compile(src));
  } catch (e: any) {
    fail(`Internal compiler error: ${e.message}`);
    return false;
  }

  if (errors.length > 0) {
    for (const err of errors) {
      const loc = err.line ? ` (line ${err.line})` : '';
      warn(`${err.message}${loc}`);
    }
    if (opts.strict) {
      fail('Strict mode: aborting due to warnings.');
      return false;
    }
  }

  if (opts.stdout) {
    process.stdout.write(latex);
    return true;
  }

  const outPath = resolveOutput(inputPath, opts.output);
  ensureDir(outPath);
  fs.writeFileSync(outPath, latex, 'utf8');

  const relOut = path.relative(process.cwd(), outPath);
  const lines  = latex.split('\n').length;
  const warns  = errors.length > 0 ? c.yellow(` (${errors.length} warning${errors.length > 1 ? 's' : ''})`) : '';
  ok(`${c.bold(path.relative(process.cwd(), inputPath))} → ${c.cyan(relOut)} ${c.dim(`(${lines} lines)`)}`+ warns);
  return true;
}

function runCheck(file: string): boolean {
  const inputPath = resolveInput(file);
  const src = fs.readFileSync(inputPath, 'utf8');
  try {
    const { errors } = compile(src);
    if (errors.length === 0) {
      ok(`${c.bold(file)} — no issues`);
    } else {
      for (const err of errors) {
        const loc = err.line ? ` (line ${err.line})` : '';
        warn(`${err.message}${loc}`);
      }
      log(`${c.yellow(String(errors.length))} warning${errors.length > 1 ? 's' : ''} in ${c.bold(file)}`);
    }
    return true;
  } catch (e: any) {
    fail(`${c.bold(file)} — ${e.message}`);
    return false;
  }
}

function runWatch(file: string, opts: Opts): void {
  resolveInput(file); // validate exists
  info(`Watching ${c.bold(file)} — ${c.dim('Ctrl+C')} to stop\n`);
  runCompile(file, opts);

  let debounce: ReturnType<typeof setTimeout>;
  fs.watch(path.resolve(file), (event) => {
    if (event !== 'change') return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      process.stderr.write(`\n${stamp()} `);
      runCompile(file, opts);
    }, 80);
  });
}


const args = process.argv.slice(2);

if (!args.length || args.includes('--help') || args.includes('-h')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(VERSION);
  process.exit(0);
}

const [cmd, file, ...rest] = args;

if (!file) {
  fail(`Missing file argument for '${cmd}'`);
  log(`Run ${c.cyan('edt --help')} for usage.`);
  process.exit(1);
}

const opts: Opts = { stdout: false, strict: false };
for (let i = 0; i < rest.length; i++) {
  if ((rest[i] === '-o' || rest[i] === '--output') && rest[i + 1]) {
    opts.output = rest[++i];
  } else if (rest[i] === '--stdout') {
    opts.stdout = true;
  } else if (rest[i] === '--strict') {
    opts.strict = true;
  }
}

switch (cmd) {
  case 'compile': {
    const success = runCompile(file, opts);
    process.exit(success ? 0 : 1);
    break;
  }
  case 'watch': {
    runWatch(file, opts);
    break;
  }
  case 'check': {
    const success = runCheck(file);
    process.exit(success ? 0 : 1);
    break;
  }
  default: {
    fail(`Unknown command: ${c.bold(cmd)}`);
    log(`Run ${c.cyan('edt --help')} for usage.`);
    process.exit(1);
  }
}

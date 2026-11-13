// Used by .github/workflows/check-links.yml: exit 0 and print "changed" when data/documents.json
// differs from the committed version in anything other than `last_checked`; otherwise print "unchanged".
// (last_checked moves on every successful check and must not cause a commit and redeploy by itself.)

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { DATA_DIR, ROOT, readJson } from './lib/io.ts';

type Rec = Record<string, unknown>;
const strip = (docs: Rec[]) => JSON.stringify(docs.map(({ last_checked: _ignored, ...rest }) => rest));

const rel = 'data/documents.json';
const committed = JSON.parse(execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })) as Rec[];
const working = readJson<Rec[]>(join(DATA_DIR, 'documents.json'));
console.log(strip(committed) === strip(working) ? 'unchanged' : 'changed');

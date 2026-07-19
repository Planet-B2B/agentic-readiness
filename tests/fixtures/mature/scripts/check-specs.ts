import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const specification = readFileSync(new URL('../specs/example.md', import.meta.url), 'utf8');
const workItem = /^Work item:\s*(\S+)/m.exec(specification)?.[1];
const implementationPath = /^Implementation:\s*(\S+)/m.exec(specification)?.[1];
const verificationPath = /^Verification:\s*(\S+)/m.exec(specification)?.[1];
if (!workItem || !implementationPath || !verificationPath) {
  throw new Error('The specification is missing traceability metadata');
}
const implementation = readFileSync(resolve(import.meta.dirname, '..', implementationPath), 'utf8');
const verification = readFileSync(resolve(import.meta.dirname, '..', verificationPath), 'utf8');
if (!implementation.includes(workItem) || !verification.includes(workItem)) {
  throw new Error('Implementation and verification must reference the approved work item');
}

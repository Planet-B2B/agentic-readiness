import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const root = realpathSync(resolve(import.meta.dirname, '..'));
const specificationPath = realpathSync(resolve(root, 'specs/example.md'));
const specification = readFileSync(realpathSync(resolve(root, 'specs/example.md')), 'utf8');
const workItem = /^Work item:\s*(\S+)/m.exec(specification)?.[1];
const implementationPath = /^Implementation:\s*(\S+)/m.exec(specification)?.[1];
const verificationPath = /^Verification:\s*(\S+)/m.exec(specification)?.[1];
if (!workItem || !implementationPath || !verificationPath) {
  throw new Error('The specification is missing traceability metadata');
}

function artifactPath(path: string): string {
  const candidate = realpathSync(resolve(root, path));
  const local = relative(root, candidate);
  if (local === '' || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error('Traceability artifacts must stay inside the repository');
  }
  return candidate;
}

const implementationArtifact = artifactPath(implementationPath);
const verificationArtifact = artifactPath(verificationPath);
if (
  implementationArtifact === specificationPath ||
  verificationArtifact === specificationPath ||
  implementationArtifact === verificationArtifact
) {
  throw new Error('Implementation, verification, and specification artifacts must be distinct');
}
const implementation = readFileSync(implementationArtifact, 'utf8');
const verification = readFileSync(verificationArtifact, 'utf8');
if (!implementation.includes(workItem) || !verification.includes(workItem)) {
  throw new Error('Implementation and verification must reference the approved work item');
}

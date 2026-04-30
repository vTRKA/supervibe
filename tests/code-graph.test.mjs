import { test } from 'node:test';
import assert from 'node:assert';
import { extractGraph, detectGrammar } from '../scripts/lib/code-graph.mjs';

test('detectGrammar: maps extensions correctly', () => {
  assert.strictEqual(detectGrammar('foo.ts'), 'typescript');
  assert.strictEqual(detectGrammar('foo.tsx'), 'tsx');
  assert.strictEqual(detectGrammar('foo.js'), 'javascript');
  assert.strictEqual(detectGrammar('foo.jsx'), 'javascript');
  assert.strictEqual(detectGrammar('foo.py'), 'python');
  assert.strictEqual(detectGrammar('foo.go'), 'go');
  assert.strictEqual(detectGrammar('foo.rs'), 'rust');
  assert.strictEqual(detectGrammar('foo.java'), 'java');
  assert.strictEqual(detectGrammar('foo.php'), 'php');
  assert.strictEqual(detectGrammar('foo.rb'), 'ruby');
  assert.strictEqual(detectGrammar('foo.txt'), null);
});

test('TypeScript: extracts function + call + import', async () => {
  const code = `
import { hash } from 'crypto';

export function login(email: string) {
  validate(email);
  return hash(email);
}

function validate(s: string) {
  return s.length > 0;
}
`;
  const { symbols, edges } = await extractGraph(code, 'src/auth.ts');

  const fnNames = symbols.filter(s => s.kind === 'function').map(s => s.name);
  assert.ok(fnNames.includes('login'), `login should be a symbol; got: ${fnNames.join(',')}`);
  assert.ok(fnNames.includes('validate'), `validate should be a symbol; got: ${fnNames.join(',')}`);

  const calls = edges.filter(e => e.kind === 'calls').map(e => e.toName);
  assert.ok(calls.includes('validate'), `expected validate in calls; got: ${calls.join(',')}`);
  assert.ok(calls.includes('hash'), `expected hash in calls; got: ${calls.join(',')}`);

  const imports = edges.filter(e => e.kind === 'imports').map(e => e.toName);
  assert.ok(imports.some(i => i.includes('crypto')), `expected crypto in imports; got: ${imports.join(',')}`);
});

test('TypeScript: extracts arrow-const hooks and attributes calls to them', async () => {
  const code = `
export const useUserVPNConfigQuery = (userId: string) => {
  return fetchConfig(userId);
};

function fetchConfig(userId: string) {
  return userId;
}
`;
  const { symbols, edges } = await extractGraph(code, 'src/hooks/useUserVPNConfigQuery.ts');

  const hook = symbols.find(s => s.kind === 'function' && s.name === 'useUserVPNConfigQuery');
  assert.ok(hook, `expected hook symbol; got: ${symbols.map(s => `${s.kind}:${s.name}`).join(',')}`);

  const fetchEdge = edges.find(e => e.kind === 'calls' && e.toName === 'fetchConfig');
  assert.ok(fetchEdge, `expected fetchConfig call; got: ${edges.map(e => `${e.kind}:${e.toName}`).join(',')}`);
  assert.strictEqual(fetchEdge.fromId, hook.id);
});

test('TSX: extracts typed React arrow components and JSX references', async () => {
  const code = `
import type { FC } from 'react';

const OrgControls = () => {
  return null;
};

export const IdeasPage: FC = () => {
  useUserVPNConfigQuery();
  return <OrgControls />;
};
`;
  const { symbols, edges } = await extractGraph(code, 'src/pages/IdeasPage.tsx');

  const names = symbols.filter(s => s.kind === 'function').map(s => s.name);
  assert.ok(names.includes('IdeasPage'), `IdeasPage should be a symbol; got: ${names.join(',')}`);
  assert.ok(names.includes('OrgControls'), `OrgControls should be a symbol; got: ${names.join(',')}`);

  const ideasPage = symbols.find(s => s.name === 'IdeasPage');
  assert.ok(edges.some(e => e.kind === 'calls' && e.toName === 'useUserVPNConfigQuery' && e.fromId === ideasPage.id),
    `expected hook call from IdeasPage; got: ${edges.map(e => `${e.kind}:${e.toName}:${e.fromId}`).join(',')}`);
  assert.ok(edges.some(e => e.kind === 'references' && e.toName === 'OrgControls' && e.fromId === ideasPage.id),
    `expected JSX reference from IdeasPage to OrgControls; got: ${edges.map(e => `${e.kind}:${e.toName}:${e.fromId}`).join(',')}`);
});

test('JSX: extracts arrow components and JSX references', async () => {
  const code = `
const Button = () => <button />;
const Card = () => <Button />;
`;
  const { symbols, edges } = await extractGraph(code, 'src/Card.jsx');

  const names = symbols.filter(s => s.kind === 'function').map(s => s.name);
  assert.ok(names.includes('Button'), `Button should be a symbol; got: ${names.join(',')}`);
  assert.ok(names.includes('Card'), `Card should be a symbol; got: ${names.join(',')}`);
  const card = symbols.find(s => s.name === 'Card');
  assert.ok(edges.some(e => e.kind === 'references' && e.toName === 'Button' && e.fromId === card.id),
    `expected JSX reference from Card to Button; got: ${edges.map(e => `${e.kind}:${e.toName}:${e.fromId}`).join(',')}`);
  assert.ok(!edges.some(e => e.kind === 'references' && e.toName === 'button'),
    `lowercase JSX intrinsic tags should not pollute references; got: ${edges.map(e => `${e.kind}:${e.toName}`).join(',')}`);
});

test('Python: extracts class + method + inheritance', async () => {
  const code = `
class Animal:
    def speak(self):
        pass

class Dog(Animal):
    def speak(self):
        return 'woof'
`;
  const { symbols, edges } = await extractGraph(code, 'animals.py');

  const classNames = symbols.filter(s => s.kind === 'class').map(s => s.name);
  assert.ok(classNames.includes('Animal'));
  assert.ok(classNames.includes('Dog'));

  const fnSyms = symbols.filter(s => s.kind === 'function');
  assert.ok(fnSyms.some(s => s.name === 'speak'), 'expected at least one speak function');

  const extendsEdges = edges.filter(e => e.kind === 'extends');
  assert.ok(extendsEdges.some(e => e.toName === 'Animal'),
    `expected Animal in extends; got: ${extendsEdges.map(e => e.toName).join(',')}`);
});

test('Go: extracts func + struct + call', async () => {
  const code = `package main
import "fmt"

type User struct {
  Name string
}

func (u *User) Greet() string {
  return fmt.Sprintf("hi %s", u.Name)
}
`;
  const { symbols, edges } = await extractGraph(code, 'main.go');
  const userSym = symbols.find(s => s.kind === 'class' && s.name === 'User');
  assert.ok(userSym, `expected User struct; got symbols: ${symbols.map(s=>s.kind+':'+s.name).join(',')}`);
  assert.ok(symbols.some(s => s.kind === 'method' && s.name === 'Greet'));
  assert.ok(edges.some(e => e.kind === 'calls' && e.toName === 'Sprintf'),
    `expected Sprintf call; got calls: ${edges.filter(e=>e.kind==='calls').map(e=>e.toName).join(',')}`);
});

test('extractGraph returns empty for unknown language', async () => {
  const result = await extractGraph('some text', 'foo.unknown');
  assert.deepStrictEqual(result, { symbols: [], edges: [] });
});

test('Symbol IDs are stable across re-extraction', async () => {
  const code = 'function alpha() { beta(); } function beta() {}';
  const r1 = await extractGraph(code, 'x.js');
  const r2 = await extractGraph(code, 'x.js');
  assert.deepStrictEqual(r1.symbols.map(s => s.id), r2.symbols.map(s => s.id));
});

test('extractGraph: graceful when grammar unusable (unknown ext)', async () => {
  const result = await extractGraph('function foo() {}', 'foo.unknownlang');
  assert.deepStrictEqual(result, { symbols: [], edges: [] });
});

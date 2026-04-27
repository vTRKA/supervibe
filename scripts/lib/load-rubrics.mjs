import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * @param {string} rubricsDirPath - absolute filesystem path to confidence-rubrics/
 * @param {(absPath: string) => string} toRelativeFn - converts absolute path to repo-relative
 */
export async function loadRubrics(rubricsDirPath, toRelativeFn = (p) => p) {
  const entries = await readdir(rubricsDirPath);
  const rubrics = {};
  for (const entry of entries) {
    if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;
    if (entry.startsWith('_')) continue;
    const filePath = join(rubricsDirPath, entry);
    const content = await readFile(filePath, 'utf8');
    const data = parseYaml(content);
    const name = entry.replace(/\.(yaml|yml)$/, '');
    rubrics[name] = {
      file: toRelativeFn(filePath),
      artifact: data.artifact,
      'max-score': data['max-score'],
      'block-below': data.gates['block-below'],
      'warn-below': data.gates['warn-below'],
      dimensions: data.dimensions.map(d => ({ id: d.id, weight: d.weight }))
    };
  }
  return rubrics;
}

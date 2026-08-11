import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve('src/main/resources/static/js');

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  }));
  return nested.flat();
}

const files = (await javascriptFiles(root)).sort();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`已通过 ${files.length} 个前端脚本的语法检查。`);

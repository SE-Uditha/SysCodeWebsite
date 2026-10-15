import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Setup-only bridge for the same validation/encryption used by the application.
// No private values or data are copied into this generated code directory.
export async function loadStoreBridge() {
  const root = process.cwd();
  const output = path.resolve('.next/mysql-cli-code');
  async function compile(sourceFile) {
    const destination = path.join(output, path.relative(path.join(root, 'src'), sourceFile).replace(/\.(ts|mjs)$/, '.cjs'));
    let result = ts.transpileModule(await fs.readFile(sourceFile, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      fileName: sourceFile.replace(/\.mjs$/, '.ts'),
    }).outputText.replace(/require\(["']server-only["']\);?/g, 'undefined;');
    result = result.replace(/require\(["'](@\/[^"']+|\.[^"']+)["']\)/g, (match, specifier) => {
      const resolved = specifier.startsWith('@/') ? path.join(output, specifier.slice(2)) : path.resolve(path.dirname(destination), specifier);
      return `require(${JSON.stringify(/\.(mjs|ts)$/.test(resolved) ? resolved.replace(/\.(mjs|ts)$/, '.cjs') : `${resolved}.cjs`)})`;
    });
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, result);
  }
  for (const folder of ['src/lib/admin', 'src/data']) {
    for (const name of await fs.readdir(folder)) if (/\.(ts|mjs)$/.test(name) && !name.endsWith('.d.ts')) await compile(path.resolve(folder, name));
  }
  for (const name of ['validations', 'project-media']) await compile(path.resolve(`src/lib/${name}.ts`));
  const require = createRequire(import.meta.url);
  return {
    schemas: require(path.join(output, 'lib/admin/schemas.cjs')),
    legacy: require(path.join(output, 'lib/admin/json-storage.cjs')),
    crypto: require(path.join(output, 'lib/admin/private-crypto.cjs')),
  };
}

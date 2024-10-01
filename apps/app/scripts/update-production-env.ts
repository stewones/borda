import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const devEnv = readFileSync('apps/app/src/environment/index.ts', 'utf8');
const prodEnv = readFileSync('apps/app/src/environment/production.ts', 'utf8');

const devUrl = devEnv.match(/serverURL:\s*['"](.+?)['"]/)?.[1];
const prodUrl = prodEnv.match(/serverURL:\s*['"](.+?)['"]/)?.[1];

if (devUrl && prodUrl) {
  const files = readdirSync('dist/apps/app').filter((f: string) =>
    f.endsWith('.js')
  );
  files.forEach((file: string) => {
    const filePath = `dist/apps/app/${file}`;
    const content = readFileSync(filePath, 'utf8');
    const updatedContent = content.replace(new RegExp(devUrl, 'g'), prodUrl);
    writeFileSync(filePath, updatedContent);
  });
  console.log('Environment URLs updated successfully.');
} else {
  console.error('Could not find serverURL in environment files.');
  process.exit(1);
}

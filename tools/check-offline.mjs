import { readFileSync } from 'node:fs';
const file = process.argv[2] ?? 'ИГРАТЬ.html';
const text = readFileSync(file, 'utf8');
if (text.includes('/pulse/script.js')) throw new Error('offline bundle contains pulse script');
if (text.includes('href="/"')) throw new Error('offline bundle contains local root link');
if (!text.includes('href="https://aka-gst.ru/"')) throw new Error('offline bundle missing site home link');
for (const match of text.matchAll(/fetch\(([^)]+)\)/g)) {
  if (!match[1].includes('__PERELOM_SFX') && !match[1].includes('url') && !match[1].includes('data:') && !match[1].includes('blob:')) {
    throw new Error(`non-embedded fetch target: ${match[1]}`);
  }
}
console.log(`offline structural check: ${file} PASS`);

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const orchPath = 'src/services/orchestratorService.ts';
let orchCode = fs.readFileSync(orchPath, 'utf8');

// 1. Restaura a declaração original "let rotaCompletaTexto =" no início da função
orchCode = orchCode.replace(
  /let\s*\/\/\s*__DEDUP_TRACE_PREFIX__[\s\S]*?rotaCompletaTexto\s*=/,
  'let rotaCompletaTexto ='
);

// 2. Insere a deduplicação apenas antes da atribuição final da rota
const dedupLogic = `// __DEDUP_TRACE_PREFIX__
    {
      const semConsecutivos: any[] = [];
      for (const it of passosRotaFinal) {
        const prev = semConsecutivos[semConsecutivos.length - 1];
        if (prev && prev.kind === it.kind && prev.slug === it.slug) continue;
        semConsecutivos.push(it);
      }
      const trilhaLimpa: any[] = [];
      const agentesVistos = new Set<string>();
      let ignorarToolsRepetidas = false;
      for (const it of semConsecutivos) {
        if (it.kind === 'agent') {
          if (agentesVistos.has(it.slug)) {
            ignorarToolsRepetidas = true;
            continue;
          }
          agentesVistos.add(it.slug);
          ignorarToolsRepetidas = false;
          trilhaLimpa.push(it);
        } else {
          if (ignorarToolsRepetidas) continue;
          trilhaLimpa.push(it);
        }
      }
      passosRotaFinal = trilhaLimpa.map((it, idx) => ({ ...it, step: idx + 1 }));
    }
    `;

if (!orchCode.includes('__DEDUP_TRACE_PREFIX__')) {
  orchCode = orchCode.replace(
    /(rotaCompletaTexto\s*=\s*\[)/,
    `${dedupLogic}$1`
  );
  if (!orchCode.includes('__DEDUP_TRACE_PREFIX__')) {
    orchCode = orchCode.replace(
      /(const\s+itensRota\s*=\s*\['🧠 JARVIS')/,
      `${dedupLogic}$1`
    );
  }
}

fs.writeFileSync(orchPath, orchCode, 'utf8');
console.log('✅ Sintaxe de orchestratorService.ts corrigida!');

console.log('🔨 A compilar backend...');
execSync('npm run build', { stdio: 'inherit' });

console.log('🎨 A compilar frontend...');
execSync('npm run build:frontend', { stdio: 'inherit' });

const distAssets = fs.readdirSync('dist/assets').filter((f) => f.startsWith('main-') && f.endsWith('.js'));
const bundleOk = distAssets.some((f) => fs.readFileSync(path.join('dist/assets', f), 'utf8').includes('__DIRECTIONAL_TRACE_3D_V2__'));
if (!bundleOk) {
  throw new Error('O bundle compilado em dist/assets não contém __DIRECTIONAL_TRACE_3D_V2__');
}
console.log(`✅ Bundle de produção validado: ${distAssets.join(', ')}`);

console.log('🚀 A reiniciar PM2...');
execSync('pm2 restart all --update-env', { stdio: 'inherit' });

// pnpm (au moins en store content-addressable) n'a pas toujours préservé le bit exécutable du
// binaire `spawn-helper` de node-pty en l'extrayant du tarball npm, ce qui fait échouer tout
// spawn de pty avec "posix_spawnp failed" — reproductible aussi bien en dev qu'après un
// déploiement sur skbox-mini. On force la permission après chaque install plutôt que de
// compter sur l'extraction du package pour la préserver.
const fs = require('fs');
const path = require('path');

try {
  const nodePtyDir = path.dirname(require.resolve('node-pty/package.json'));
  const prebuildsDir = path.join(nodePtyDir, 'prebuilds');
  if (!fs.existsSync(prebuildsDir)) process.exit(0);

  for (const platformDir of fs.readdirSync(prebuildsDir)) {
    const helper = path.join(prebuildsDir, platformDir, 'spawn-helper');
    if (fs.existsSync(helper)) {
      fs.chmodSync(helper, 0o755);
      console.log(`[fix-node-pty-permissions] chmod +x ${helper}`);
    }
  }
} catch (err) {
  console.warn(`[fix-node-pty-permissions] node-pty introuvable, ignoré (${err.message})`);
}

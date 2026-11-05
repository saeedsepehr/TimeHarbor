const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const bin = process.argv[2] || process.env.ECC_CODEX_BIN || 'codex';
const root = path.resolve(__dirname, '..');
const child = spawn(bin, ['app-server', '--stdio', '--strict-config'], {
  cwd: root, env: process.env, stdio: ['pipe', 'pipe', 'pipe'],
});
let buffer = '', nextId = 0;
const pending = new Map();
child.stdout.on('data', chunk => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
    try {
      const message = JSON.parse(line);
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    } catch { /* Ignore non-protocol output. */ }
  }
});
child.stderr.on('data', () => {});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 55000);
    pending.set(id, message => { clearTimeout(timer); message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result); });
    child.stdin.write(JSON.stringify({jsonrpc:'2.0', id, method, params}) + '\n');
  });
}
(async () => {
  const results = {};
  try {
    await request('initialize', {clientInfo:{name:'ecc-verification',version:'1.0.0'},capabilities:{experimentalApi:true}});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'initialized'}) + '\n');
    const skills = await request('skills/list', {cwds:[root],forceReload:true});
    const listing = skills.data.find(d => path.resolve(d.cwd).toLowerCase() === root.toLowerCase());
    if (!listing || listing.errors.length) throw Error('Skill loading errors');
    const ecc = listing.skills.filter(s => s.name.startsWith('ecc:'));
    const expected = ['coding-standards','typescript-patterns','frontend-a11y','security-review','tdd-workflow','verification-loop'].map(n=>'ecc:'+n).sort();
    const active = ecc.filter(s=>s.enabled).map(s=>s.name).sort();
    if (JSON.stringify(active) !== JSON.stringify(expected)) throw Error('Unexpected active ECC skills: '+JSON.stringify(active));
    results.skills = {status:'PASS', active, disabled:ecc.filter(s=>!s.enabled).length, errors:listing.errors};
    console.log(JSON.stringify(results.skills));
    const hooks = await request('hooks/list',{cwds:[root]});
    const eccHooks = hooks.data.flatMap(d=>d.hooks).filter(h=>h.pluginId==='ecc@ecc');
    if (hooks.data.some(d=>d.errors.length)) throw Error('Hook loading errors');
    if (!eccHooks.length || eccHooks.some(h=>h.enabled)) throw Error('ECC hook policy was not enforced');
    results.hooks = {status:'PASS',entries:eccHooks.map(h=>({key:h.key,enabled:h.enabled,trustStatus:h.trustStatus}))};
    console.log(JSON.stringify(results.hooks));
    fs.writeFileSync(path.join(root,'work/ecc-runtime-verification.json'),JSON.stringify(results,null,2));
    console.log('Runtime evidence saved to work/ecc-runtime-verification.json');
  } catch (error) { console.error(error.message); process.exitCode=1; }
  finally { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.kill(); }
})();

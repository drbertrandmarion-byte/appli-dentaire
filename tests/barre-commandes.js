// Barre de commandes : les trois boutons fixes (retour, compte, son) ne doivent jamais se
// chevaucher, ni déborder de l'écran, quelle que soit la largeur — c'est sur mobile qu'ils se
// superposaient. Le test mesure les rectangles réels plutôt que d'inspecter le CSS.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const LARGEURS = [320, 375, 414, 600, 768, 1024, 1440];
const PRENOMS  = ['Marion', 'Jean-Baptiste-Alexandre'];

function chevauche(a, b){
  return !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 ||
           a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5);
}

(async () => {
  const browser = await chromium.launch();
  const erreurs = [];

  for (const prenom of PRENOMS) {
    for (const largeur of LARGEURS) {
      const page = await browser.newPage({ viewport:{ width:largeur, height:760 } });
      await page.route('**://*.supabase.co/**', r => r.abort());
      await page.addInitScript(([p]) => {
        localStorage.setItem('endodiag-session', JSON.stringify({
          access_token:'t', refresh_token:'t', expires_at:Date.now()+36e5,
          user_id:'u', email:'e@e.fr' }));
        localStorage.setItem('endodiag-profile', JSON.stringify({
          id:'u', email:'e@e.fr', prenom:p, nom:'Bertrand', annee:'TCEO1',
          faculte:'UFR Odontologie Dijon', approved:true }));
      }, [prenom]);

      await page.goto('http://localhost:9300/index.html');
      await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
      await page.waitForSelector('#auth-gate.hidden', { state:'attached', timeout:15000 });

      // Entrer dans un mode pour faire apparaître le bouton retour : c'est le seul moment où
      // les trois boutons coexistent, et c'est précisément là que le chevauchement se produisait.
      await page.click('#hub-diagnostic-btn');
      await page.click('#start-single-btn');
      await page.waitForTimeout(120);

      const m = await page.evaluate(() => {
        const pris = {};
        [['retour','#back-nav-btn'], ['compte','#account-btn'], ['son','#sound-toggle-btn']]
          .forEach(function(pair){
            const el = document.querySelector(pair[1]);
            if (!el || !el.offsetParent && getComputedStyle(el).display === 'none') return;
            const r = el.getBoundingClientRect();
            if (r.width === 0) return;
            pris[pair[0]] = { left:r.left, right:r.right, top:r.top, bottom:r.bottom };
          });
        return { pris, largeur:document.documentElement.clientWidth,
                 debordeH: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });

      const noms = Object.keys(m.pris);
      const cas = `${prenom} @ ${largeur}px`;

      if (noms.length !== 3) erreurs.push(`${cas} : ${noms.length} bouton(s) visible(s) au lieu de 3 (${noms})`);

      for (let i = 0; i < noms.length; i++){
        for (let j = i + 1; j < noms.length; j++){
          if (chevauche(m.pris[noms[i]], m.pris[noms[j]])){
            erreurs.push(`${cas} : « ${noms[i]} » et « ${noms[j]} » se chevauchent`);
          }
        }
      }
      noms.forEach(n => {
        const r = m.pris[n];
        if (r.left < -0.5)            erreurs.push(`${cas} : « ${n} » déborde à gauche (${Math.round(r.left)})`);
        if (r.right > m.largeur + 0.5) erreurs.push(`${cas} : « ${n} » déborde à droite (${Math.round(r.right)} > ${m.largeur})`);
      });
      if (m.debordeH) erreurs.push(`${cas} : la page défile horizontalement`);

      console.log(`${cas.padEnd(34)} ` + noms.map(n =>
        `${n}[${Math.round(m.pris[n].left)}-${Math.round(m.pris[n].right)}]`).join(' '));

      if (largeur === 375 && prenom === 'Marion') await page.screenshot({ path:'/tmp/barre.png', clip:{x:0,y:0,width:375,height:150} });
      await page.close();
    }
  }

  // La barre ne doit pas intercepter les clics là où elle ne contient aucun bouton.
  const page = await browser.newPage({ viewport:{ width:1024, height:760 } });
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.addInitScript(() => {
    localStorage.setItem('endodiag-session', JSON.stringify({
      access_token:'t', refresh_token:'t', expires_at:Date.now()+36e5, user_id:'u', email:'e@e.fr' }));
    localStorage.setItem('endodiag-profile', JSON.stringify({
      id:'u', email:'e@e.fr', prenom:'Marion', nom:'B', annee:'TCEO1',
      faculte:'UFR Odontologie Dijon', approved:true }));
  });
  await page.goto('http://localhost:9300/index.html');
  await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
  await page.waitForSelector('#auth-gate.hidden', { state:'attached', timeout:15000 });
  const auMilieu = await page.evaluate(() => {
    const bar = document.querySelector('.top-bar').getBoundingClientRect();
    const el = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2);
    return el ? (el.id || el.className || el.tagName) : null;
  });
  const transparente = String(auMilieu).indexOf('top-bar') === -1;
  console.log(`\nau centre de la barre, l'element cliquable est : ${auMilieu}`);
  if (!transparente) erreurs.push('la barre intercepte les clics dans sa zone vide');
  await page.close();

  console.log(`\nErreurs : ${erreurs.length}`);
  erreurs.forEach(e => console.log('  ! ' + e));
  await browser.close();
  if (erreurs.length) process.exitCode = 1;
})();

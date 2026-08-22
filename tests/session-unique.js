// Une seule session active par compte, et repli hors ligne borné à 24 h.
//
// L'accès à l'application est une récompense pour les étudiants qui viennent en cours : un compte
// ouvert simultanément sur cinq appareils lui ôterait sa valeur. Ce test rejoue le partage — deux
// navigateurs, un seul compte — sur une base **simulée** partagée entre les deux, et vérifie que le
// premier se referme dès que le second prend la main.
//
// Il vérifie aussi les deux façons dont ce garde-fou pourrait se retourner contre un étudiant
// honnête : une connexion capricieuse ne doit jamais le déconnecter, et le repli hors ligne doit
// continuer de le laisser réviser — mais pas au-delà de 24 h, sans quoi il suffirait de couper le
// réseau pour échapper au contrôle.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const URL = 'http://localhost:9300/index.html';
const UID = 'u1';

// La « base » : une seule ligne de profil, partagée par tous les navigateurs du test — c'est
// exactement ce que voit le serveur quand deux appareils ouvrent le même compte.
function nouvelleBase(){
  return {
    profil: {
      id: UID, email:'e@x.fr', prenom:'Test', nom:'Étudiant', annee:'TCEO1',
      faculte:'UFR Odontologie Dijon', approved:true,
      created_at:'2026-01-10T09:00:00Z', last_seen_at:null,
      active_session:null, active_session_at:null
    },
    patches: 0
  };
}

// Branche un navigateur sur la base simulée. `panne` coupe le réseau à la demande.
async function brancher(browser, base, etat){
  const page = await browser.newPage({ viewport:{ width:900, height:900 } });
  await page.route('**://*.supabase.co/**', route => {
    if (etat.panne) return route.abort('failed');
    const req = route.request();
    const u = req.url();
    const json = b => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(b) });

    if (u.includes('/auth/v1/token')){
      return json({ access_token:'at', refresh_token:'rt', expires_in:3600,
                    user:{ id:UID, email:base.profil.email } });
    }
    if (u.includes('/rest/v1/admins')) return json([]);
    if (u.includes('/rest/v1/profiles')){
      if (req.method() === 'PATCH'){
        base.patches++;
        Object.assign(base.profil, JSON.parse(req.postData() || '{}'));
        return route.fulfill({ status:204, body:'' });
      }
      return json([base.profil]);
    }
    return json([]);
  });
  return page;
}

// Ouvre l'application en se connectant réellement par le formulaire : c'est la connexion qui
// revendique la session, et c'est donc elle qu'il faut jouer.
async function seConnecter(page){
  await page.goto(URL);
  await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
  await page.waitForSelector('#auth-view-login:not(.hidden)', { timeout:15000 });
  await page.fill('#login-email', 'e@x.fr');
  await page.fill('#login-password', 'motdepasse');
  await page.click('#login-btn');
  // On n'EXIGE pas d'entrer dans l'application : plusieurs scénarios vérifient précisément qu'on y
  // entre ou non. Attendre ici que la porte se lève ferait échouer le test par un plantage muet au
  // lieu du message qui nomme le problème. On attend donc l'un ou l'autre dénouement, et c'est
  // l'appelant qui juge.
  await page.waitForFunction(() => {
    const g = document.getElementById('auth-gate');
    return g.classList.contains('hidden') || !!document.querySelector('#login-msg .auth-msg');
  }, null, { timeout:15000 }).catch(function(){});
  await page.waitForTimeout(300);
}

// Vrai si l'application est ouverte (la porte de connexion est levée).
const DANS_L_APP = () => document.getElementById('auth-gate').classList.contains('hidden');
const MESSAGE    = () => {
  const el = document.querySelector('#login-msg .auth-msg');
  return el ? el.textContent.trim() : null;
};

// Provoque une vérification comme le ferait un retour sur l'onglet.
async function revenirSurLOnglet(page){
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const erreurs = [];
  const exiger = (c, m) => { if (!c) erreurs.push(m); };

  // ===== 1. Deux appareils, un seul compte =====
  const base = nouvelleBase();
  const etat = { panne:false };
  const telephone = await brancher(browser, base, etat);
  const portable  = await brancher(browser, base, etat);

  await seConnecter(telephone);
  const claimA = base.profil.active_session;
  exiger(!!claimA, 'la connexion ne revendique aucune session');
  exiger(await telephone.evaluate(DANS_L_APP), 'le premier appareil n’entre pas dans l’application');
  console.log(`1. téléphone connecté — session revendiquée : ${String(claimA).slice(0, 8)}…`);

  await seConnecter(portable);
  const claimB = base.profil.active_session;
  exiger(!!claimB && claimB !== claimA, 'la seconde connexion ne reprend pas la session');
  exiger(await portable.evaluate(DANS_L_APP), 'le second appareil n’entre pas dans l’application');
  console.log(`2. portable connecté  — session revendiquée : ${String(claimB).slice(0, 8)}…`);

  await revenirSurLOnglet(telephone);
  const dedans = await telephone.evaluate(DANS_L_APP);
  const texte  = await telephone.evaluate(MESSAGE);
  exiger(!dedans, 'le premier appareil reste dans l’application alors que le compte a été repris');
  exiger(texte && /autre appareil/i.test(texte),
    `message d’éviction absent ou muet sur la cause : ${JSON.stringify(texte)}`);
  console.log(`3. téléphone : ${dedans ? 'TOUJOURS DEDANS' : 'refermé'} — « ${(texte || '').slice(0, 70)}… »`);

  exiger(await portable.evaluate(DANS_L_APP), 'le second appareil a été évincé alors qu’il détient la session');
  console.log('4. portable  : toujours dans l’application');

  // La session ne doit pas repartir toute seule : une éviction laisse le compte au portable.
  exiger(base.profil.active_session === claimB,
    'l’appareil évincé a repris la session sans nouvelle connexion');

  await telephone.close(); await portable.close();

  // ===== 2. Se reconnecter après avoir été remplacé =====
  // Un étudiant qui se déconnecte proprement garde son identifiant local. Si un autre appareil prend
  // la main entre-temps, sa reconnexion doit lui rendre la session — et non le rejeter à l'instant
  // même où il vient de taper son mot de passe. C'est la revendication faite AU MOMENT DE LA
  // CONNEXION qui l'en préserve : sans elle, la vérification qui suit constate un identifiant
  // périmé et referme aussitôt l'application.
  const baseR = nouvelleBase();
  const etatR = { panne:false };
  const premier = await brancher(browser, baseR, etatR);
  const second  = await brancher(browser, baseR, etatR);

  await seConnecter(premier);
  await premier.click('#account-btn');
  await premier.click('#acct-logout-btn');
  await premier.waitForSelector('#auth-view-login:not(.hidden)', { timeout:15000 });

  await seConnecter(second);
  const claimSecond = baseR.profil.active_session;

  await seConnecter(premier);
  await premier.waitForTimeout(400);
  const revenu = await premier.evaluate(DANS_L_APP);
  exiger(revenu, 'après une déconnexion propre, la reconnexion est évincée immédiatement');
  exiger(baseR.profil.active_session !== claimSecond, 'la reconnexion ne reprend pas la session');
  console.log(`5. reconnexion après déconnexion propre : ${revenu ? 'dans l’application' : 'ÉVINCÉ AUSSITÔT'}`);
  await premier.close(); await second.close();

  // ===== 3. Une connexion capricieuse ne doit jamais déconnecter =====
  const base2 = nouvelleBase();
  const etat2 = { panne:false };
  const seul = await brancher(browser, base2, etat2);
  await seConnecter(seul);
  etat2.panne = true;                       // le réseau tombe
  await revenirSurLOnglet(seul);
  const survecu = await seul.evaluate(DANS_L_APP);
  exiger(survecu, 'une simple panne réseau déconnecte l’étudiant — le garde-fou se retourne contre lui');
  console.log(`\n6. réseau coupé pendant la vérification : ${survecu ? 'maintenu dans l’application' : 'ÉVINCÉ'}`);
  await seul.close();

  // ===== 4. Repli hors ligne : autorisé sous 24 h, refusé au-delà =====
  async function replieHorsLigne(ageHeures){
    const page = await browser.newPage({ viewport:{ width:900, height:900 } });
    await page.route('**://*.supabase.co/**', r => r.abort('failed'));
    await page.addInitScript(([age]) => {
      localStorage.setItem('endodiag-session', JSON.stringify({
        access_token:'t', refresh_token:'t', expires_at:Date.now()+36e5, user_id:'u1', email:'e@x.fr' }));
      localStorage.setItem('endodiag-profile', JSON.stringify({
        id:'u1', email:'e@x.fr', prenom:'T', nom:'A', annee:'TCEO1',
        faculte:'UFR Odontologie Dijon', approved:true }));
      localStorage.setItem('endodiag-session-id', JSON.stringify('claim-local'));
      localStorage.setItem('endodiag-last-online', JSON.stringify(Date.now() - age * 3600 * 1000));
    }, [ageHeures]);
    await page.goto(URL);
    await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await page.waitForTimeout(1500);
    const r = { dedans: await page.evaluate(DANS_L_APP), texte: await page.evaluate(MESSAGE) };
    await page.close();
    return r;
  }

  const recent = await replieHorsLigne(2);
  exiger(recent.dedans, 'le repli hors ligne refuse un étudiant connecté il y a 2 h');
  console.log(`\n7. hors ligne, dernière connexion il y a  2 h : ${recent.dedans ? 'révision autorisée' : 'REFUSÉ'}`);

  const limite = await replieHorsLigne(23);
  exiger(limite.dedans, 'le repli hors ligne refuse un étudiant connecté il y a 23 h');
  console.log(`8. hors ligne, dernière connexion il y a 23 h : ${limite.dedans ? 'révision autorisée' : 'REFUSÉ'}`);

  const vieux = await replieHorsLigne(25);
  exiger(!vieux.dedans, 'le repli hors ligne laisse entrer au-delà de 24 h : le contrôle de session est contournable en coupant le réseau');
  exiger(vieux.texte && /24 heures/.test(vieux.texte),
    `au-delà de 24 h, le message n’explique pas ce qu’il faut faire : ${JSON.stringify(vieux.texte)}`);
  console.log(`9. hors ligne, dernière connexion il y a 25 h : ${vieux.dedans ? 'ENTRÉ' : 'refusé'} — « ${(vieux.texte || '').slice(0, 70)}… »`);

  // ===== 5. Un navigateur jamais passé en ligne ne doit pas entrer =====
  const jamais = await (async () => {
    const page = await browser.newPage({ viewport:{ width:900, height:900 } });
    await page.route('**://*.supabase.co/**', r => r.abort('failed'));
    await page.addInitScript(() => {
      localStorage.setItem('endodiag-session', JSON.stringify({
        access_token:'t', refresh_token:'t', expires_at:Date.now()+36e5, user_id:'u1', email:'e@x.fr' }));
      localStorage.setItem('endodiag-profile', JSON.stringify({
        id:'u1', email:'e@x.fr', prenom:'T', nom:'A', annee:'TCEO1',
        faculte:'UFR Odontologie Dijon', approved:true }));
    });
    await page.goto(URL);
    await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await page.waitForTimeout(1500);
    const d = await page.evaluate(DANS_L_APP);
    await page.close();
    return d;
  })();
  exiger(!jamais, 'un profil copié dans un navigateur jamais passé en ligne ouvre l’application');
  console.log(`10. profil copié, jamais passé en ligne        : ${jamais ? 'ENTRÉ' : 'refusé'}`);

  console.log(`\nErreurs : ${erreurs.length}`);
  erreurs.forEach(e => console.log('  ! ' + e));
  await browser.close();
  if (erreurs.length) process.exitCode = 1;
})();

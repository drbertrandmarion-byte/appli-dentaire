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
    if (u.includes('/rest/v1/admins')) return json(etat.admin ? [{ user_id: UID }] : []);
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
  // Le formulaire peut ne JAMAIS apparaitre : si l'application s'ouvre d'elle-meme, c'est deja
  // un resultat — et c'en est un que plusieurs scenarios cherchent justement a prendre en
  // defaut. Attendre le formulaire sans issue de secours ferait planter la suite sur un
  // timeout muet, au lieu de laisser le controle suivant NOMMER le probleme.
  const formulaire = await page.waitForSelector('#auth-view-login:not(.hidden)', { timeout:15000 })
    .then(() => true).catch(() => false);
  if (!formulaire) { await page.waitForTimeout(300); return; }
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

  // ===== 1. C'est le PREMIER connecte qui tient =====
  // La regle a ete inversee a la demande de l'enseignante. Avant, le dernier connecte
  // l'emportait, et deux appareils pouvaient se reprendre la session sans fin. Desormais le
  // detenteur garde la main tant qu'il donne signe de vie, et l'autre reste a la porte.
  const base = nouvelleBase();
  const etat = { panne:false };
  const telephone = await brancher(browser, base, etat);
  const portable  = await brancher(browser, base, etat);

  await seConnecter(telephone);
  const claimA = base.profil.active_session;
  exiger(!!claimA, 'la connexion ne revendique aucune session');
  exiger(await telephone.evaluate(DANS_L_APP), 'le premier appareil n\u2019entre pas dans l\u2019application');
  console.log(`1. t\u00e9l\u00e9phone connect\u00e9 \u2014 session revendiqu\u00e9e : ${String(claimA).slice(0, 8)}\u2026`);

  await seConnecter(portable);
  const entre2 = await portable.evaluate(DANS_L_APP);
  const msg2   = await portable.evaluate(MESSAGE);
  exiger(!entre2, 'le second appareil entre alors que le premier tient la session');
  exiger(msg2 && /autre appareil/i.test(msg2),
    `message de refus absent ou muet sur la cause : ${JSON.stringify(msg2)}`);
  exiger(base.profil.active_session === claimA,
    'le second appareil a vol\u00e9 la session au premier, qui \u00e9tait pourtant vivant');
  console.log(`2. portable refus\u00e9 \u2014 \u00ab ${(msg2 || '').slice(0, 70)}\u2026 \u00bb`);

  await revenirSurLOnglet(telephone);
  exiger(await telephone.evaluate(DANS_L_APP),
    'le premier appareil a \u00e9t\u00e9 \u00e9vinc\u00e9 alors qu\u2019aucun autre n\u2019a pris la session');
  console.log('3. t\u00e9l\u00e9phone : toujours dans l\u2019application');

  // Et il ne revient pas davantage en insistant : tant que l'autre est connecte, c'est non.
  await seConnecter(portable);
  exiger(!await portable.evaluate(DANS_L_APP),
    'le second appareil finit par entrer en insistant : l\u2019\u00e9vinc\u00e9 ne doit pas revenir tant que l\u2019autre est l\u00e0');
  console.log('4. portable : toujours refus\u00e9 \u00e0 la seconde tentative');
  await telephone.close(); await portable.close();

  // ===== 2. Une session abandonnee se libere =====
  // Sans ce relachement, un etudiant qui ferme son navigateur sans se deconnecter se
  // verrouillerait lui-meme dehors jusqu'a la fin des temps.
  const baseV = nouvelleBase();
  const etatV = { panne:false };
  baseV.profil.active_session    = 'claim-fantome';
  baseV.profil.active_session_at = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const tardif = await brancher(browser, baseV, etatV);
  await seConnecter(tardif);
  exiger(await tardif.evaluate(DANS_L_APP),
    'une session abandonn\u00e9e depuis une demi-heure bloque encore : l\u2019\u00e9tudiant est enferm\u00e9 dehors');
  exiger(baseV.profil.active_session !== 'claim-fantome',
    'la session abandonn\u00e9e n\u2019a pas \u00e9t\u00e9 reprise');
  console.log('5. session muette depuis 30 min : reprise par le nouvel appareil');
  await tardif.close();

  // ===== 3. Se deconnecter RENVOIE la session =====
  // Se deconnecter, c'est dire « j'ai fini » : l'autre appareil doit pouvoir entrer aussitot,
  // sans attendre que le silence du premier soit constate.
  const baseR = nouvelleBase();
  const etatR = { panne:false };
  const premier = await brancher(browser, baseR, etatR);
  const second  = await brancher(browser, baseR, etatR);

  await seConnecter(premier);
  await premier.click('#account-btn');
  await premier.click('#acct-logout-btn');
  await premier.waitForSelector('#auth-view-login:not(.hidden)', { timeout:15000 });
  await premier.waitForTimeout(400);
  exiger(!baseR.profil.active_session,
    'la d\u00e9connexion ne rend pas la session : l\u2019\u00e9tudiant reste bloqu\u00e9 sur son autre appareil');

  await seConnecter(second);
  exiger(await second.evaluate(DANS_L_APP),
    'apr\u00e8s une d\u00e9connexion propre, l\u2019autre appareil reste refus\u00e9');
  console.log('6. d\u00e9connexion propre : l\u2019autre appareil entre aussit\u00f4t');
  await premier.close(); await second.close();

  // ===== 3bis. L'eviction a lieu des le cas valide =====
  // C'est le cas qui echappait au controle : en « Session individuelle », on enchaine les cas
  // sans jamais terminer de serie ni quitter l'onglet. Le repreneur n'entre ici que parce que
  // la session a ete laissee muette assez longtemps pour etre liberee.
  const baseI = nouvelleBase();
  const etatI = { panne:false };
  const travaille = await brancher(browser, baseI, etatI);
  const repreneur = await brancher(browser, baseI, etatI);

  await seConnecter(travaille);
  await travaille.click('#hub-diagnostic-btn');
  await travaille.click('#start-single-btn');
  await travaille.waitForTimeout(300);

  // Le detenteur est repute muet : un autre appareil peut alors prendre la main.
  baseI.profil.active_session_at = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await seConnecter(repreneur);
  exiger(await repreneur.evaluate(DANS_L_APP), 'le repreneur n\u2019entre pas alors que la session \u00e9tait libre');

  // Il valide son cas SANS avoir quitte l'onglet : aucun retour d'onglet, aucune fin de serie.
  await travaille.selectOption('#diagnosis-select', 'necrose');
  await travaille.click('#guess-btn');
  await travaille.waitForTimeout(1200);

  const encoreLa = await travaille.evaluate(DANS_L_APP);
  exiger(!encoreLa, 'en session individuelle, le compte repris ailleurs continue de travailler : le cas valid\u00e9 ne d\u00e9clenche aucun contr\u00f4le');
  console.log(`7. session individuelle, cas valid\u00e9 : ${encoreLa ? 'TOUJOURS DEDANS' : 'referm\u00e9'}`);
  await travaille.close(); await repreneur.close();

  // ===== 3ter. L'enseignante, et elle seule, tient plusieurs appareils =====
  // Elle travaille du telephone et de l'ordinateur, souvent en meme temps. Le controle se
  // retournerait contre elle. Les etudiants, eux, restent a un appareil — c'est la section 1.
  const baseE = nouvelleBase();
  const etatE = { panne:false, admin:true };
  const ordi = await brancher(browser, baseE, etatE);
  const tel  = await brancher(browser, baseE, etatE);
  await seConnecter(ordi);
  await seConnecter(tel);
  exiger(await ordi.evaluate(DANS_L_APP) && await tel.evaluate(DANS_L_APP),
    'le compte enseignant est limit\u00e9 \u00e0 un appareil : le contr\u00f4le se retourne contre elle');
  await revenirSurLOnglet(ordi);
  exiger(await ordi.evaluate(DANS_L_APP),
    'le premier appareil de l\u2019enseignante est \u00e9vinc\u00e9 par le second');
  console.log('8. compte enseignant : deux appareils ouverts en m\u00eame temps');
  await ordi.close(); await tel.close();

  // ===== 4. Une connexion capricieuse ne doit jamais déconnecter =====
  const base2 = nouvelleBase();
  const etat2 = { panne:false };
  const seul = await brancher(browser, base2, etat2);
  await seConnecter(seul);
  etat2.panne = true;                       // le réseau tombe
  await revenirSurLOnglet(seul);
  const survecu = await seul.evaluate(DANS_L_APP);
  exiger(survecu, 'une simple panne réseau déconnecte l’étudiant — le garde-fou se retourne contre lui');
  console.log(`9. réseau coupé pendant la vérification : ${survecu ? 'maintenu dans l’application' : 'ÉVINCÉ'}`);
  await seul.close();

  // ===== 5. Repli hors ligne : on entre, mais AUCUN exercice n'est ouvert =====
  // La regle a change a la demande de l'enseignante. Le repli laissait reviser sans reseau ;
  // elle y a renonce pour une raison qui vaut mieux que le confort : sans serveur, le corrige
  // n'est pas charge, la lecture radiographique est corrigee sur des contours de secours que
  // personne n'a valides, et aucun resultat n'est enregistre. L'etudiant travaillait pour rien.
  //
  // On ENTRE toujours — un compte valide n'est pas rejete pour une panne de reseau, et il faut
  // pouvoir lire la raison — mais les trois modes sont fermes et la raison est ecrite.
  let etape = 9;   // les neuf premières étapes sont numérotées à la main plus haut
  async function replieHorsLigne(etiquette, avecIdentifiant){
    const page = await browser.newPage({ viewport:{ width:900, height:900 } });
    await page.route('**://*.supabase.co/**', r => r.abort('failed'));
    await page.addInitScript(([avecId]) => {
      localStorage.setItem('endodiag-session', JSON.stringify({
        access_token:'t', refresh_token:'t', expires_at:Date.now()+36e5, user_id:'u1', email:'e@x.fr' }));
      localStorage.setItem('endodiag-profile', JSON.stringify({
        id:'u1', email:'e@x.fr', prenom:'T', nom:'A', annee:'TCEO1',
        faculte:'UFR Odontologie Dijon', approved:true }));
      if (avecId) localStorage.setItem('endodiag-session-id', JSON.stringify('claim-local'));
    }, [avecIdentifiant]);
    await page.goto(URL);
    await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await page.waitForTimeout(1500);
    const dedans = await page.evaluate(DANS_L_APP);
    const modes = await page.evaluate(() => {
      const vis = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };
      const inv = document.querySelector('#hub-choice .hub-intro');
      return { diag: vis('hub-diagnostic-btn'), tx: vis('hub-tx-btn'), radio: vis('hub-radio-btn'),
               choix: !!inv && !inv.classList.contains('hidden'), mot: vis('hub-offline') };
    });
    await page.close();
    exiger(dedans, `le repli hors ligne rejette un étudiant (${etiquette}) : il ne peut même pas lire la raison`);
    if (modes.diag || modes.tx || modes.radio || modes.choix) {
      erreurs.push(`hors ligne (${etiquette}) : un mode d'entraînement reste ouvert — ` +
        `diagnostic ${modes.diag}, thérapeutique ${modes.tx}, radio ${modes.radio}, invitation ${modes.choix}`);
    }
    exiger(modes.mot, `hors ligne (${etiquette}) : rien n'explique pourquoi les exercices sont fermés`);
    console.log(`${String(++etape).padStart(2)}. hors ligne, ${etiquette.padEnd(30)} : ` +
      `${dedans ? 'entre' : 'REJETE'}, exercices ${modes.diag || modes.tx || modes.radio ? 'OUVERTS' : 'fermes'}, ` +
      `raison ${modes.mot ? 'affichee' : 'ABSENTE'}`);
    return dedans;
  }

  console.log('');
  await replieHorsLigne('session déjà revendiquée', true);
  await replieHorsLigne('aucun identifiant de session', false);

  // Un compte NON validé ne doit pas entrer, même hors ligne : le repli n'ouvre l'application
  // qu'aux comptes que l'enseignante a déjà approuvés.
  const pasValide = await (async () => {
    const page = await browser.newPage({ viewport:{ width:900, height:900 } });
    await page.route('**://*.supabase.co/**', r => r.abort('failed'));
    await page.addInitScript(() => {
      localStorage.setItem('endodiag-session', JSON.stringify({
        access_token:'t', refresh_token:'t', expires_at:Date.now()+36e5, user_id:'u1', email:'e@x.fr' }));
      localStorage.setItem('endodiag-profile', JSON.stringify({
        id:'u1', email:'e@x.fr', prenom:'T', nom:'A', annee:'TCEO1',
        faculte:'UFR Odontologie Dijon', approved:false }));
    });
    await page.goto(URL);
    await page.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
    await page.waitForTimeout(1500);
    const d = await page.evaluate(DANS_L_APP);
    await page.close();
    return d;
  })();
  exiger(!pasValide, 'un compte non validé entre dans l’application par le repli hors ligne');
  console.log(`${String(++etape).padStart(2)}. hors ligne, ${'compte NON validé'.padEnd(30)} : ${pasValide ? 'ENTRÉ' : 'refusé'}`);

  console.log(`\nErreurs : ${erreurs.length}`);
  erreurs.forEach(e => console.log('  ! ' + e));
  await browser.close();
  if (erreurs.length) process.exitCode = 1;
})();

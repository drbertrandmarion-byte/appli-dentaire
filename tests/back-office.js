// Back-office : rendu par promotion + exports CSV, sur une base simulee.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

const PROFILES = [
  { id:'u1', email:'a@x.fr', prenom:'Alice',  nom:'Martin', annee:'3ème année', faculte:'UFR Odontologie Dijon', approved:true,  created_at:'2026-01-10T09:00:00Z', last_seen_at:'2026-08-19T09:00:00Z' },
  { id:'u2', email:'b@x.fr', prenom:'Bruno',  nom:'Dupont', annee:'3ème année', faculte:'UFR Odontologie Dijon', approved:true,  created_at:'2026-01-11T09:00:00Z', last_seen_at:'2026-08-18T09:00:00Z' },
  { id:'u3', email:'c@x.fr', prenom:'Chloé',  nom:'Bernard; "test"', annee:'TCEO1', faculte:'UFR Odontologie Dijon', approved:true, created_at:'2026-02-01T09:00:00Z', last_seen_at:null },
  { id:'u4', email:'d@x.fr', prenom:'David',  nom:'Petit',  annee:'TCEO1',      faculte:'UFR Odontologie Dijon', approved:false, created_at:'2026-08-01T09:00:00Z', last_seen_at:null },
  // --- comptes qui ne sont PAS des etudiants ---
  // Ils ne doivent entrer dans aucun chiffre : ni le bandeau, ni la liste des comptes valides,
  // ni les taux d'erreur par pathologie, ni le classeur. Les trois sont ecartes par des chemins
  // differents, et c'est ce qui rend le controle utile :
  //   t1 est nomme tel quel dans la liste de admin.html ;
  //   t2 l'est aussi, mais saisi dans l'ordre inverse et sans accent — c'est ainsi qu'on eprouve
  //      la comparaison insensible a l'ordre et aux accents ;
  //   a1 n'est nomme nulle part : il n'est ecarte que parce qu'il figure dans la table « admins ».
  { id:'t1', email:'prof@x.fr',  prenom:'Marion',   nom:'Bertrand', annee:'3ème année', faculte:'UFR Odontologie Dijon', approved:true, created_at:'2025-09-01T09:00:00Z', last_seen_at:'2026-08-20T09:00:00Z' },
  { id:'t2', email:'cr@x.fr',    prenom:'ROUGEMON', nom:'Clement',  annee:'TCEO1',      faculte:'UFR Odontologie Dijon', approved:true, created_at:'2025-09-02T09:00:00Z', last_seen_at:'2026-08-20T09:00:00Z' },
  // Sa promotion n'existe que pour lui : elle ne doit pas etre proposee dans le filtre.
  { id:'a1', email:'ad@x.fr',    prenom:'Hélène',   nom:'Durand',   annee:'Enseignants', faculte:'UFR Odontologie Dijon', approved:true, created_at:'2025-09-03T09:00:00Z', last_seen_at:'2026-08-20T09:00:00Z' },
  // t3 porte une adresse nommee dans admin.html sous un nom qui ne l'est pas : seule la
  // correspondance par ADRESSE peut l'ecarter. C'est la plus sure des trois — un nom se saisit
  // avec une faute, une adresse non.
  { id:'t3', email:'drbertrandmarion@gmail.com', prenom:'Compte', nom:'Essai', annee:'TCEO1', faculte:'UFR Odontologie Dijon', approved:true, created_at:'2025-09-04T09:00:00Z', last_seen_at:'2026-08-20T09:00:00Z' },
  // t4 n'est nomme nulle part : il porte la colonne « staff », posee par le bouton du
  // back-office. C'est le seul chemin qui ne depende d'aucune orthographe.
  { id:'t4', email:'t4@x.fr', prenom:'Autre', nom:'Essai', annee:'TCEO1', faculte:'UFR Odontologie Dijon', approved:true, created_at:'2025-09-05T09:00:00Z', last_seen_at:'2026-08-20T09:00:00Z', staff:true }
];
// Les comptes a ecarter, et l'identifiant du compte connecte : le faux serveur declare « a1 »
// administrateur, et c'est aussi lui qui consulte le back-office.
const ENSEIGNANTS = ['t1', 't2', 'a1', 't3', 't4'];
const ADMIN_ID = 'a1';
const estEns = id => ENSEIGNANTS.indexOf(id) !== -1;

const RESULTS = [
  { id:1, user_id:'u1', mode:'diagnostic',    serie:5, score:4, created_at:'2026-08-01T09:00:00Z' },
  { id:2, user_id:'u1', mode:'therapeutique', serie:5, score:3, created_at:'2026-08-02T09:00:00Z' },
  { id:3, user_id:'u2', mode:'diagnostic',    serie:10, score:5, created_at:'2026-08-03T09:00:00Z' },
  // Les series des enseignants : comptees, elles feraient passer la promotion pour plus active
  // qu'elle n'est, et tireraient sa moyenne vers le haut.
  { id:4, user_id:'t1', mode:'diagnostic',    serie:10, score:10, created_at:'2026-08-04T09:00:00Z' },
  { id:5, user_id:'a1', mode:'therapeutique', serie:10, score:10, created_at:'2026-08-05T09:00:00Z' }
];
// 3eme annee rate massivement l'abces chronique ; TCEO1 rate la cellulite diffuse.
const CASES = [];
// Chaque cas porte une date : c'est elle que le back-office affiche pour montrer QUAND un etudiant
// s'est entraine, et sans elle la colonne « Dernier cas » comme la feuille « Cas joues » seraient
// controlees a vide.
let jour = 0;
const quand = () => new Date(Date.UTC(2026, 7, 20 - (jour++ % 20), 14, 30)).toISOString();
for (let i = 0; i < 12; i++) CASES.push({ user_id:'u1', mode:'diagnostic',    diagnosis_id:'abces_chronique',  correct:i < 2, created_at:quand() });
for (let i = 0; i < 12; i++) CASES.push({ user_id:'u2', mode:'therapeutique', diagnosis_id:'abces_chronique',  correct:i < 9, created_at:quand() });
for (let i = 0; i < 11; i++) CASES.push({ user_id:'u3', mode:'diagnostic',    diagnosis_id:'cellulite_diffuse', correct:i < 3, created_at:quand() });
for (let i = 0; i < 4;  i++) CASES.push({ user_id:'u1', mode:'diagnostic',    diagnosis_id:'necrose',           correct:true, created_at:quand() });
// u4 n'est pas valide : ses cas ne doivent pas apparaitre dans le classeur.
CASES.push({ user_id:'u4', mode:'diagnostic', diagnosis_id:'necrose', correct:true, created_at:quand() });
// Lectures radiographiques : un troisieme mode, dont l'objet est un CLICHE et non une
// pathologie. Melangees aux cas de diagnostic, elles feraient apparaitre des noms de
// fichiers dans le tableau des pathologies faibles.
for (let i = 0; i < 8; i++) CASES.push({ user_id:'u1', mode:'radio', diagnosis_id:'retro-alveolaire-03', correct:i < 5, created_at:quand() });
for (let i = 0; i < 2; i++) CASES.push({ user_id:'u3', mode:'radio', diagnosis_id:'retro-alveolaire-07', correct:false, created_at:quand() });
// Le DETAIL d'une lecture, repere par repere : c'est lui qui dit QUOI les etudiants
// confondent, la ou le mode « radio » ne dit que combien de cliches sont rates. Trois
// reperes, trois taux d'erreur nettement differents, pour que le classement soit verifiable.
for (let i = 0; i < 20; i++) CASES.push({ user_id:'u1', mode:'radio_repere', diagnosis_id:'couronne_cm',    correct:i < 4,  created_at:quand() }); // 80 % d'erreur
for (let i = 0; i < 20; i++) CASES.push({ user_id:'u1', mode:'radio_repere', diagnosis_id:'couronne_metal', correct:i < 12, created_at:quand() }); // 40 %
for (let i = 0; i < 6;  i++) CASES.push({ user_id:'u3', mode:'radio_repere', diagnosis_id:'sinus',          correct:true,   created_at:quand() }); // 0 %, et moins de 10 fois
// Ce qu'un enseignant a joue : un cas ouvert pour le montrer en cours, ou le corrige qu'il
// relit. Compte, il doublerait les cas d'abces chronique de la 3eme annee et ferait tomber leur
// taux d'erreur de moitie — on reprendrait en cours autre chose que ce qui est reellement rate.
for (let i = 0; i < 30; i++) CASES.push({ user_id:'t1', mode:'diagnostic',    diagnosis_id:'abces_chronique',  correct:true, created_at:quand() });
for (let i = 0; i < 15; i++) CASES.push({ user_id:'t2', mode:'therapeutique', diagnosis_id:'cellulite_diffuse', correct:true, created_at:quand() });
for (let i = 0; i < 9;  i++) CASES.push({ user_id:'a1', mode:'radio',         diagnosis_id:'retro-alveolaire-03', correct:true, created_at:quand() });
for (let i = 0; i < 25; i++) CASES.push({ user_id:'a1', mode:'radio_repere',  diagnosis_id:'couronne_cm',       correct:true, created_at:quand() });
for (let i = 0; i < 7;  i++) CASES.push({ user_id:'t3', mode:'diagnostic',    diagnosis_id:'necrose',           correct:true, created_at:quand() });
for (let i = 0; i < 7;  i++) CASES.push({ user_id:'t4', mode:'diagnostic',    diagnosis_id:'necrose',           correct:true, created_at:quand() });

// --- les libelles des reperes ne doivent pas diverger entre les deux fichiers ---
// index.html et admin.html sont autonomes et ne partagent rien : la table des libelles est
// donc recopiee. Sans ce controle, un repere renomme d'un cote — « Gutta-percha » devenue
// « Obturation canalaire » — continuerait de s'afficher sous son ancien nom de l'autre, et
// l'enseignante lirait un tableau qui ne parle plus la meme langue que l'application.
function controleLibelles(){
  const pb = [];
  const app   = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  const admin = fs.readFileSync(__dirname + '/../admin.html', 'utf8');
  const cat = app.slice(app.indexOf('var RADIO_REPERES'), app.indexOf('var RADIO_FAMILLES'));
  const vrais = {};
  let m; const re = /\{id:'([a-z0-9_]+)',\s*label:'((?:[^'\\]|\\.)*)'/g;
  while ((m = re.exec(cat))) vrais[m[1]] = m[2].replace(/\\'/g, "'");
  const bloc = admin.slice(admin.indexOf('var RADIO_LABELS'), admin.indexOf('var DIAG_LABELS'));
  const copies = {};
  const re2 = /([a-z0-9_]+):\s*'((?:[^'\\]|\\.)*)'/g;
  while ((m = re2.exec(bloc))) copies[m[1]] = m[2].replace(/\\'/g, "'");
  if (Object.keys(vrais).length < 20) pb.push('libelles : le catalogue de index.html n\'a pas pu etre lu');
  if (Object.keys(copies).length < 20) pb.push('libelles : la table RADIO_LABELS de admin.html n\'a pas pu etre lue');
  Object.keys(vrais).forEach(id => {
    if (!(id in copies)) pb.push('libelles : « ' + vrais[id] + ' » manque dans admin.html');
    else if (copies[id] !== vrais[id]) {
      pb.push('libelles : « ' + id + ' » diverge — application « ' + vrais[id] +
              ' », back-office « ' + copies[id] + ' »');
    }
  });
  Object.keys(copies).forEach(id => {
    if (!(id in vrais)) pb.push('libelles : « ' + id + ' » existe dans admin.html et plus dans l\'application');
  });
  return pb;
}

(async () => {
  const browser = await chromium.launch({ acceptDownloads: true });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport:{width:1100,height:900} });
  const page = await ctx.newPage();

  // Le serveur BORNE le nombre de lignes qu'il renvoie, et annonce le total dans
  // « Content-Range ». Le faux serveur fait pareil, par tranches de TRANCHE_MOCK : sans quoi
  // la pagination du back-office ne serait jamais eprouvee, et la troncature silencieuse —
  // celle qui fait passer un etudiant pour inactif — resterait invisible.
  const TRANCHE_MOCK = 20;
  let tronqueSansLeDire = false;
  await page.route('**://*.supabase.co/**', route => {
    const u = route.request().url();
    const entetes = route.request().headers();
    const json = b => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(b) });
    const page_ = (tout) => {
      const m = (entetes['range'] || '0-').match(/(\d+)-(\d+)?/);
      const debut = m ? +m[1] : 0;
      const lot = tout.slice(debut, debut + TRANCHE_MOCK);
      // Le mode « tronque sans le dire » renvoie une seule tranche en annoncant le vrai total :
      // c'est exactement ce que fait un serveur dont la limite est atteinte.
      const corps = tronqueSansLeDire && debut > 0 ? [] : lot;
      return route.fulfill({
        status: 206, contentType:'application/json',
        headers: {
          'content-range': debut + '-' + (debut + corps.length - 1) + '/' + tout.length,
          // Sans cet en-tete, le navigateur CACHE « Content-Range » a la page : la requete est
          // d'origine differente, et seuls les en-tetes explicitement exposes sont lisibles.
          // Supabase l'envoie ; le faux serveur doit faire pareil, sinon le test ne reproduit
          // pas les conditions reelles.
          'access-control-expose-headers': 'content-range',
          'access-control-allow-origin': '*'
        },
        body: JSON.stringify(corps)
      });
    };
    // Le faux serveur APPLIQUE les ecritures. Sans cela un bouton pourrait « reussir » sans rien
    // changer, et le test ne prouverait que l'envoi de la requete — pas son effet.
    if (route.request().method() === 'PATCH' && u.includes('/rest/v1/profiles')) {
      const m = u.match(/id=eq\.([^&]+)/);
      const cible = PROFILES.filter(p => p.id === (m && m[1]))[0];
      if (!cible) return route.fulfill({ status:404, contentType:'application/json', body:'{}' });
      const corps = JSON.parse(route.request().postData() || '{}');
      Object.keys(corps).forEach(k => { cible[k] = corps[k]; });
      return route.fulfill({ status:204, headers:{ 'access-control-allow-origin':'*' }, body:'' });
    }
    if (u.includes('/rest/v1/admins'))       return json([{ user_id:ADMIN_ID }]);
    if (u.includes('/rest/v1/profiles'))     return page_(PROFILES);
    if (u.includes('/rest/v1/results'))      return page_(RESULTS);
    if (u.includes('/rest/v1/case_results')) return page_(CASES);
    return json([]);
  });
  await page.addInitScript((id) => {
    localStorage.setItem('endodiag-session', JSON.stringify({
      access_token:'t', refresh_token:'t', user_id:id, email:'prof@x.fr' }));
  }, ADMIN_ID);

  await page.goto('http://localhost:9300/admin.html');
  await page.waitForSelector('#admin-view:not(.hidden)', { timeout:15000 });

  const promos = await page.$$eval('#promo-filter option', o => o.map(x => x.textContent));
  console.log('1. promotions proposees :', JSON.stringify(promos));

  const lire = async () => await page.$$eval('#weak-body tr', rs => rs.map(r =>
    [...r.querySelectorAll('td')].map(c => c.textContent.trim()).slice(0, 5).join(' | ')));

  console.log('\n2. TOUTES :');            (await lire()).forEach(l => console.log('   ', l));
  console.log('   note :', await page.textContent('#weak-note'));

  await page.selectOption('#promo-filter', '3ème année');
  console.log('\n3. 3eme annee :');        (await lire()).forEach(l => console.log('   ', l));
  console.log('   note :', await page.textContent('#weak-note'));

  await page.selectOption('#promo-filter', 'TCEO1');
  console.log('\n4. TCEO1 :');             (await lire()).forEach(l => console.log('   ', l));
  console.log('   note :', await page.textContent('#weak-note'));

  // --- les deux modes comptes a part dans la liste des comptes valides ---
  // Un seul nombre melangeait les cas de diagnostic et ceux de choix therapeutique : on ne
  // pouvait pas savoir si un etudiant travaillait l'un, l'autre, ou l'un sans l'autre.
  // Le jeu d'essai le rend verifiable : Alice n'a que du diagnostic (16 cas, 6 reussis),
  // Bruno n'a que du therapeutique (12 cas, 9 reussis).
  const pbJs = [];
  await page.selectOption('#promo-filter', '__toutes__');
  const lignes = await page.$$eval('#approved-body tr', rs => rs.map(r =>
    [...r.querySelectorAll('td')].map(c => c.textContent.replace(/\s+/g, ' ').trim())));
  const ligneDe = nom => lignes.filter(l => l[0] && l[0].indexOf(nom) === 0)[0];
  const alice = ligneDe('Alice'), bruno = ligneDe('Bruno');
  if (!alice || !bruno) {
    pbJs.push('comptes valides : Alice ou Bruno introuvable dans la liste');
  } else {
    const cas = l => l[5] || '';
    if (!/Diagnostic 16 \(38 %\)/.test(cas(alice))) {
      pbJs.push('comptes valides : les 16 cas de diagnostic d\'Alice ne sont pas comptes a part — lu « ' + cas(alice) + ' »');
    }
    if (!/Thérapeutique — aucun/.test(cas(alice))) {
      pbJs.push('comptes valides : Alice n\'a joue aucun cas therapeutique, et rien ne le dit — lu « ' + cas(alice) + ' »');
    }
    if (!/Thérapeutique 12 \(75 %\)/.test(cas(bruno))) {
      pbJs.push('comptes valides : les 12 cas therapeutiques de Bruno ne sont pas comptes a part — lu « ' + cas(bruno) + ' »');
    }
    if (!/Diagnostic — aucun/.test(cas(bruno))) {
      pbJs.push('comptes valides : Bruno n\'a joue aucun cas de diagnostic, et rien ne le dit — lu « ' + cas(bruno) + ' »');
    }
    // La lecture radiographique est un TROISIEME mode : fondue dans l'un des deux autres,
    // elle serait invisible, et ses cliches passeraient pour des pathologies.
    if (!/Lecture radio 8 \(63 %\)/.test(cas(alice))) {
      pbJs.push('comptes valides : les 8 lectures radiographiques d\'Alice ne sont pas comptees a part — lu « ' + cas(alice) + ' »');
    }
    if (!/Lecture radio — aucun/.test(cas(bruno))) {
      pbJs.push('comptes valides : Bruno n\'a fait aucune lecture radiographique, et rien ne le dit — lu « ' + cas(bruno) + ' »');
    }
  }
  // Les cliches ne doivent pas apparaitre dans le tableau des pathologies faibles.
  await page.selectOption('#promo-filter', '__toutes__');
  const patho = (await page.textContent('#weak-body')) || '';
  if (/retro-alveolaire/.test(patho)) {
    pbJs.push('pathologies faibles : un cliche de lecture radiographique y figure comme pathologie');
  }
  // Le detail par repere ne doit pas se meler au reste : ni aux pathologies, ni aux cliches,
  // ni aux compteurs du bandeau. Fondu dedans, il gonflerait les chiffres d'un facteur six.
  if (/couronne_cm|couronne_metal/.test(patho)) {
    pbJs.push('pathologies faibles : un repere radiographique y figure comme pathologie');
  }
  {
    const radio = (await page.textContent('#radio-body')) || '';
    if (!/Couronne céramo-métallique/.test(radio)) {
      pbJs.push('erreurs par repere : le tableau n\'affiche pas le libelle du repere — lu « ' + radio.slice(0, 120) + ' »');
    }
    if (/couronne_cm/.test(radio)) {
      pbJs.push('erreurs par repere : l\'identifiant brut s\'affiche au lieu du libelle');
    }
    if (!/80 %/.test(radio) || !/40 %/.test(radio)) {
      pbJs.push('erreurs par repere : les taux attendus (80 % et 40 %) ne sont pas affiches — lu « ' + radio.replace(/\s+/g,' ').slice(0, 200) + ' »');
    }
    // Le classement doit aller du plus rate au moins rate : c'est tout l'interet du tableau.
    const ordre = ['Couronne céramo-métallique', 'Couronne métallique', 'Sinus maxillaire']
      .map(l => radio.indexOf(l));
    if (ordre.some(i => i < 0) || ordre[0] > ordre[1] || ordre[1] > ordre[2]) {
      pbJs.push('erreurs par repere : le classement ne va pas du plus rate au moins rate — positions ' + ordre.join(', '));
    }
    const note = (await page.textContent('#radio-note')) || '';
    if (!/moins de 10 fois/.test(note)) {
      pbJs.push('erreurs par repere : un repere vu 6 fois seulement, et rien ne rappelle que le taux y est peu significatif — lu « ' + note.trim() + ' »');
    }
  }
  // --- les comptes enseignants ne sont PAS des etudiants ---
  // Ce tableau de bord sert a suivre une promotion. Un enseignant qui ouvre des cas pour les
  // montrer en cours y comptait comme un etudiant qui les travaille : il gonflait le bandeau,
  // s'affichait au milieu des etudiants, et tirait les taux d'erreur par pathologie — on
  // reprenait alors en cours autre chose que ce qui est reellement rate.
  {
    const texteValides = (await page.textContent('#approved-body')) || '';
    ['Bertrand', 'ROUGEMON', 'Durand'].forEach(nom => {
      if (texteValides.indexOf(nom) !== -1) {
        pbJs.push('comptes valides : le compte enseignant « ' + nom + ' » figure dans la liste des étudiants');
      }
    });
    // Ce qui est ecarte doit se VOIR : un chiffre qui baisse sans explication se lit comme une
    // perte de donnees, et un etudiant homonyme d'un enseignant ne se repererait nulle part.
    const note = ((await page.textContent('#staff-note')) || '').replace(/\s+/g, ' ');
    ['Marion Bertrand', 'ROUGEMON Clement', 'Hélène Durand'].forEach(nom => {
      if (note.indexOf(nom) === -1) {
        pbJs.push('comptes écartés : « ' + nom + ' » n\'est pas compté et rien ne le dit — lu « ' + note.trim() + ' »');
      }
    });
    // La promotion qui n'existe que pour un enseignant ne doit pas etre proposee au filtre.
    if (promos.indexOf('Enseignants') !== -1) {
      pbJs.push('filtre : une promotion d\'enseignants est proposée — lu ' + JSON.stringify(promos));
    }
    // Le bandeau, compteur par compteur, confronte a ce que le jeu d'essai contient APRES
    // retrait des enseignants. Un total verifie a la main se perimerait au premier cas ajoute.
    const bandeau = {};
    (await page.$$eval('#stats .stat', els => els.map(e =>
      [e.querySelector('.l').textContent.trim(), e.querySelector('.v').textContent.trim()])))
      .forEach(([l, v]) => { bandeau[l] = v; });
    const casEtudiants = m => String(CASES.filter(c => c.mode === m && !estEns(c.user_id)).length);
    const attendu = {
      'comptes validés':   String(PROFILES.filter(p => p.approved && !estEns(p.id)).length),
      'séries terminées':  String(RESULTS.filter(r => !estEns(r.user_id)).length),
      'cas diagnostic':    casEtudiants('diagnostic'),
      'cas thérapeutique': casEtudiants('therapeutique'),
      'lectures radio':    casEtudiants('radio')
    };
    Object.keys(attendu).forEach(l => {
      if (bandeau[l] !== attendu[l]) {
        pbJs.push('bandeau : « ' + l + ' » affiche ' + (bandeau[l] === undefined ? '(rien)' : bandeau[l]) +
                  ' au lieu de ' + attendu[l] + ' — les comptes enseignants y sont comptés');
      }
    });
    // Et la pathologie que l'enseignant a jouee trente fois : son nombre de cas traites doit
    // rester celui des etudiants seuls.
    const abces = (await page.$$eval('#weak-body tr', rs => rs.map(r =>
      [...r.querySelectorAll('td')].map(c => c.textContent.trim()))))
      .filter(l => l[0] === 'Abcès apical chronique')[0];
    const attenduAbces = String(CASES.filter(c =>
      c.diagnosis_id === 'abces_chronique' && !estEns(c.user_id)).length);
    if (!abces) pbJs.push('pathologies : la ligne de l\'abcès apical chronique est introuvable');
    else if (abces[1] !== attenduAbces) {
      pbJs.push('pathologies : l\'abcès apical chronique compte ' + abces[1] + ' cas traités au lieu de ' +
                attenduAbces + ' — les cas d\'un enseignant y sont comptés');
    }
    console.log('\n4quater. comptes écartés :', note.trim() || '(rien)');

    // La carte des comptes hors statistiques : ils ne doivent pas disparaitre SANS TRACE. Chacun
    // doit y figurer avec la raison de son retrait — seule celle du bouton se defait sur place, et
    // l'annoncer evite de chercher une action qui ne pourrait rien faire.
    const horsStats = await page.$$eval('#hors-stats-body tr', rs => rs.map(r =>
      [...r.querySelectorAll('td')].map(c => c.textContent.replace(/\s+/g, ' ').trim())));
    const ligneHS = nom => horsStats.filter(l => l[0] && l[0].indexOf(nom) !== -1)[0];
    [['Marion Bertrand', 'nommé dans le code du back-office'],
     ['Durand',          'compte administrateur'],
     ['Compte Essai',    'nommé dans le code du back-office'],
     ['Autre Essai',     'retiré depuis cet écran']].forEach(([nom, raison]) => {
      const l = ligneHS(nom);
      if (!l) pbJs.push('hors stats : « ' + nom + ' » n\'est pas écarté, ou n\'apparaît pas dans la carte');
      else if (l[3] !== raison) {
        pbJs.push('hors stats : « ' + nom + ' » est écarté pour « ' + l[3] + ' » au lieu de « ' + raison + ' »');
      }
    });
    console.log('5pre. carte hors stats :');
    horsStats.forEach(l => console.log('    ', l[0].split(' ').slice(0, 2).join(' '), '→', l[3]));
  }

  // --- retirer un compte des statistiques, et le remettre ---
  // C'est le seul chemin qui ne depende d'aucune orthographe, donc le seul utilisable pour un
  // compte dont on ne sait pas exactement sous quel nom il s'est inscrit. Le test l'exerce de
  // bout en bout : le compte quitte les chiffres, et les retrouve INTACTS quand on le remet.
  {
    // Le bandeau somme les TROIS modes qu'il affiche ; le detail repere par repere est compte
    // ailleurs et n'y figure pas. L'attendu doit porter sur les memes trois modes, sans quoi le
    // test reprocherait au back-office un ecart qui vient de son propre calcul.
    const MODES_BANDEAU = ['diagnostic', 'therapeutique', 'radio'];
    const casAlice = CASES.filter(c =>
      c.user_id === 'u1' && MODES_BANDEAU.indexOf(c.mode) !== -1).length;
    const lire = async () => {
      const b = {};
      (await page.$$eval('#stats .stat', els => els.map(e =>
        [e.querySelector('.l').textContent.trim(), +e.querySelector('.v').textContent.trim()])))
        .forEach(([l, v]) => { b[l] = v; });
      b.cas = b['cas diagnostic'] + b['cas thérapeutique'] + b['lectures radio'];
      return b;
    };
    const avant = await lire();

    // Chaque bouton est CHERCHE avant d'etre clique, et son absence est un defaut nomme. Laisser
    // Playwright echouer sur un delai d'attente interromprait la suite sans dire ce qui manque, et
    // emporterait au passage les erreurs deja relevees — c'est le piege que ce projet connait
    // deja ailleurs.
    const bouton = async (ou, qui) => {
      const l = page.locator('#' + ou + ' tr:has-text("' + qui + '") [data-staff]');
      return (await l.count()) ? l.first() : null;
    };

    const sortir = await bouton('approved-body', 'Alice');
    if (!sortir) {
      pbJs.push('hors stats : aucun bouton pour retirer Alice des statistiques dans la liste des étudiants');
      console.log('\n5bis. retrait d\'Alice : bouton absent');
    } else {
      await sortir.click();
      await page.waitForFunction(
        () => !/Alice/.test(document.getElementById('approved-body').textContent),
        null, { timeout:10000 }).catch(() => {});
      const apres = await lire();
      const dansHS = ((await page.textContent('#hors-stats-body')) || '').indexOf('Alice') !== -1;

      if (apres['comptes validés'] !== avant['comptes validés'] - 1) {
        pbJs.push('hors stats : le bouton ne retire pas Alice des comptes validés (' +
                  avant['comptes validés'] + ' → ' + apres['comptes validés'] + ')');
      }
      if (apres.cas !== avant.cas - casAlice) {
        pbJs.push('hors stats : les ' + casAlice + ' cas d\'Alice restent comptés (' +
                  avant.cas + ' → ' + apres.cas + ' au lieu de ' + (avant.cas - casAlice) + ')');
      }
      if (!dansHS) {
        pbJs.push('hors stats : Alice ne compte plus et n\'apparaît pas dans la carte — ' +
                  'elle a disparu sans trace, et rien ne permet de la remettre');
      }

      // Et le retour : rien n'a ete efface, tout son passe doit reapparaitre.
      const remettre = dansHS ? await bouton('hors-stats-body', 'Alice') : null;
      if (!remettre) {
        if (dansHS) pbJs.push('hors stats : Alice est écartée sans aucun bouton pour la remettre dans les statistiques');
        console.log('\n5bis. retrait puis retour d\'Alice :', avant.cas, '→', apres.cas,
                    '→ (retour impossible)');
      } else {
        await remettre.click();
        await page.waitForFunction(
          () => /Alice/.test(document.getElementById('approved-body').textContent),
          null, { timeout:10000 }).catch(() => {});
        const revenu = await lire();
        if (revenu.cas !== avant.cas || revenu['comptes validés'] !== avant['comptes validés']) {
          pbJs.push('hors stats : remise dans les statistiques, Alice ne retrouve pas son passé (' +
                    revenu.cas + ' cas et ' + revenu['comptes validés'] + ' comptes, attendus ' +
                    avant.cas + ' et ' + avant['comptes validés'] + ')');
        }
        console.log('\n5bis. retrait puis retour d\'Alice :', avant.cas, '→', apres.cas, '→',
                    revenu.cas, 'cas comptés');
      }
    }
  }

  controleLibelles().forEach(x => pbJs.push(x));
  const resume = (await page.textContent('#stats')).replace(/\s+/g, ' ');
  if (!/cas diagnostic/.test(resume) || !/cas thérapeutique/.test(resume) || !/lectures radio/.test(resume)) {
    pbJs.push('bandeau : le total des cas ne distingue pas les trois modes — lu « ' + resume.trim() + ' »');
  }
  console.log('\n4bis. comptes valides, cas par mode :');
  console.log('    Alice :', alice ? alice[5] : '—');
  console.log('    Bruno :', bruno ? bruno[5] : '—');
  pbJs.forEach(x => console.log('  ! ' + x));
  if (pbJs.length) process.exitCode = 1;

  // --- la troncature silencieuse, celle qui fait passer un etudiant pour inactif ---
  // Le serveur annonce un total mais n'en livre qu'une partie. Sans avertissement, les
  // chiffres affichés sont sous-estimes et rien ne le laisse voir : on conclut que
  // l'etudiant ne fait rien alors que son travail est simplement au-dela de la coupure.
  tronqueSansLeDire = true;
  await page.reload();
  await page.waitForSelector('#admin-view:not(.hidden)', { timeout:15000 });
  const alerte = ((await page.textContent('#global-msg')) || '').replace(/\s+/g, ' ');
  if (!/Chargement incomplet/.test(alerte)) {
    pbJs.push('troncature : le back-office affiche moins de lignes que le serveur n\'en annonce, '
              + 'et ne le dit pas — lu « ' + alerte.trim() + ' »');
  }
  console.log('\n4ter. troncature annoncee :', alerte.trim() || '(rien)');
  tronqueSansLeDire = false;
  await page.reload();
  await page.waitForSelector('#admin-view:not(.hidden)', { timeout:15000 });
  pbJs.forEach(x => console.log('  ! ' + x));
  if (pbJs.length) process.exitCode = 1;

  // --- export du classeur ---
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout:15000 }),
    page.click('#export-btn')
  ]);
  const chemin = '/tmp/' + dl.suggestedFilename();
  await dl.saveAs(chemin);
  console.log('\n5. classeur exporte ->', dl.suggestedFilename());
  console.log('   message :', (await page.textContent('#global-msg')).trim());

  await page.selectOption('#promo-filter', '__toutes__');
  await page.locator('.card').last().screenshot({ path:'/tmp/admin.png' });
  // La carte des comptes hors statistiques est elle aussi a relire a l'oeil : c'est elle qui dit
  // qui n'est pas compte, et pourquoi.
  if (await page.$('#hors-stats-card:not(.hidden)')) {
    await page.locator('#hors-stats-card').screenshot({ path:'/tmp/admin-hors-stats.png' });
    console.log('   carte hors stats -> /tmp/admin-hors-stats.png');
  }
  await browser.close();

  // --- controle structurel du classeur ---
  // Le .xlsx est ecrit a la main : on verifie ici qu'il constitue bien une archive valide et un
  // classeur conforme. Un compteur de styles faux est la cause classique du message « contenu
  // illisible » d'Excel, et il passerait totalement inapercu a l'oeil nu.
  const { execFileSync } = require('child_process');
  const script = `
import zipfile, re, sys, xml.etree.ElementTree as ET
f = ${JSON.stringify(chemin)}
z = zipfile.ZipFile(f)
pb = []
if z.testzip() is not None: pb.append('CRC errone')
for n in z.namelist():
    try: ET.fromstring(z.read(n))
    except Exception as e: pb.append('XML mal forme : %s (%s)' % (n, e))
s = z.read('xl/styles.xml').decode()
for tag, child in [('numFmts','numFmt'),('fonts','font'),('fills','fill'),('borders','border'),
                   ('cellStyleXfs','xf'),('cellXfs','xf'),('cellStyles','cellStyle')]:
    m = re.search('<%s count="(\\d+)"' % tag, s)
    if not m: continue
    bloc = re.search('<%s [^>]*>(.*?)</%s>' % (tag, tag), s, re.S)
    reel = len(re.findall('<%s[ />]' % child, bloc.group(1)))
    if int(m.group(1)) != reel:
        pb.append('%s : compteur %s mais %d elements' % (tag, m.group(1), reel))
rels = z.read('xl/_rels/workbook.xml.rels').decode()
for i in (1, 2, 3, 4):
    if 'sheet%d.xml' % i not in rels: pb.append('feuille %d non reliee' % i)
    if 'xl/worksheets/sheet%d.xml' % i not in z.namelist(): pb.append('feuille %d absente' % i)
try:
    import openpyxl
    wb = openpyxl.load_workbook(f)
    print('   feuilles lues :', wb.sheetnames)
    et = wb['Etudiants'] if 'Etudiants' in wb.sheetnames else wb[wb.sheetnames[1]]
    print('   entete figee :', et.freeze_panes, '| filtre :', et.auto_filter.ref)
    types = set(type(r[5].value).__name__ for r in et.iter_rows(min_row=2) if r[5].value is not None)
    print('   type des dates :', types or 'aucune ligne')
    moy = set(type(r[8].value).__name__ for r in et.iter_rows(min_row=2) if r[8].value is not None)
    print('   type des moyennes :', moy or 'aucune valeur')
    # La feuille des cas : c'est la seule vue qui dit QUAND un etudiant s'est entraine.
    if 'Cas joues' in wb.sheetnames or 'Cas joués' in wb.sheetnames:
        cj = wb['Cas joués'] if 'Cas joués' in wb.sheetnames else wb['Cas joues']
        lignes = [r for r in cj.iter_rows(min_row=2) if r[0].value is not None]
        print('   feuille « Cas joues » :', len(lignes), 'lignes')
        if not lignes:
            pb.append('feuille des cas vide : le controle ne prouverait rien')
        dts = set(type(r[0].value).__name__ for r in lignes)
        print('   type des dates de cas :', dts)
        if dts != {'datetime'}:
            pb.append('dates de cas non reconnues comme dates : %s' % dts)
        modes = set(r[4].value for r in lignes)
        if 'Lecture radiographique' not in modes:
            pb.append('feuille des cas : les lectures radiographiques n y figurent pas (%s)' % modes)
        objets = [r[5].value for r in lignes if r[4].value == 'Lecture radiographique']
        if not all(str(o).startswith('Cliche') or str(o).startswith('Clich') for o in objets):
            pb.append('feuille des cas : une lecture radiographique n annonce pas son cliche (%s)' % objets[:3])
        noms = set(r[1].value for r in lignes)
        if 'Petit' in noms:
            pb.append('un compte NON valide figure dans la feuille des cas')
        # Le classeur est ce que l'enseignante garde et relit : les comptes qui ne sont pas des
        # etudiants n'y ont pas plus leur place qu'a l'ecran.
        for ens in ('Bertrand', 'Clement', 'Durand'):
            if ens in noms:
                pb.append('un compte enseignant (%s) figure dans la feuille des cas' % ens)
        # L'ordre annonce est du plus recent au plus ancien.
        dates = [r[0].value for r in lignes]
        if dates != sorted(dates, reverse=True):
            pb.append('feuille des cas : ordre non decroissant')
    else:
        pb.append('feuille « Cas joues » absente du classeur')
except ImportError:
    print('   (openpyxl absent : lecture non verifiee)')
except Exception as e:
    pb.append('lecture impossible : %s' % e)
print('\\nProblemes : %d' % len(pb))
for x in pb: print('  ! ' + x)
sys.exit(1 if pb else 0)
`;
  console.log('\n6. controle structurel du classeur :');
  let classeurKo = false;
  try {
    console.log(execFileSync('python3', ['-c', script], { encoding:'utf8' }).trimEnd());
  } catch (e) {
    console.log((e.stdout || '') + (e.stderr || ''));
    classeurKo = true;
    process.exitCode = 1;
  }

  // LA DERNIERE LIGNE DOIT DIRE LA VERITE. Le controle structurel du classeur imprimait
  // « Problemes : 0 » meme quand les controles cote page avaient echoue plus haut : un
  // lecteur pressé — ou un depouillement qui ne lit que la derniere ligne — y aurait vu une
  // suite verte. Le code de sortie, lui, etait juste ; c'est l'affichage qui mentait.
  console.log('\nback-office               Problemes : ' + pbJs.length +
              (classeurKo ? ' cote page, et le controle du classeur a aussi echoue' : ''));
  pbJs.forEach(x => console.log('  ! ' + x));
  if (pbJs.length) process.exitCode = 1;
})();

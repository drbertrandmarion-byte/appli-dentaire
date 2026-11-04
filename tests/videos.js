// Porte d'accueil a deux boutons, et rubrique des videos explicatives.
//
// Ce que la suite verifie :
//   1. Un ETUDIANT ne voit rien de tout cela : ni la porte, ni la rubrique. L'application
//      s'ouvre pour lui sur le choix des trois modes, exactement comme avant.
//   2. Et forcer le bouton ne l'ouvre pas davantage. Un bouton cache n'est pas une porte
//      fermee — defaut deja rencontre quatre fois dans ce projet, et c'est une mutation de
//      cette suite qui l'a trouve ici.
//   3. L'ENSEIGNANTE voit la porte, et les deux chemins menent ou ils disent.
//   4. Le retour ramene a la porte, sans laisser deux ecrans l'un sur l'autre.
//   5. Une rubrique vide le DIT : laissee muette, elle se lirait comme un chargement en echec.
//   6. Un lien de video devient le bon lecteur — et un lien non reconnu reste atteignable
//      plutot que de disparaitre en silence.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const URL = 'http://localhost:9300/index.html';

const problemes = [];
const ko = m => problemes.push(m);

// Les ecrans s'effacent en FONDU : mesurer trop tot montre les deux a la fois. Le premier jet
// de cette suite lisait pendant la transition et rendait des verdicts contradictoires.
const FONDU = 800;

async function ouvre(browser, admin){
  const ctx = await browser.newContext({ viewport:{ width:1100, height:950 } });
  ctx.route('**ujkpnlcbxzhwcftvxgcd.supabase.co**', r => r.abort('failed'));
  await ctx.addInitScript(() => {
    localStorage.setItem('endodiag-session', JSON.stringify({
      access_token:'test', refresh_token:'test', expires_at: Date.now() + 3600000,
      user_id:'test-user', email:'test@example.com' }));
    localStorage.setItem('endodiag-profile', JSON.stringify({
      id:'test-user', email:'test@example.com', prenom:'Test', nom:'Auto',
      annee:'TCEO1', faculte:'UFR Odontologie Dijon', approved:true }));
  });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
  await p.waitForSelector('#auth-gate.hidden', { state:'attached', timeout:15000 });
  // C'est enterApp qui ouvre cette porte selon le compte ; on reproduit son appel.
  await p.evaluate(a => window.EndoAccueilDouble && window.EndoAccueilDouble(a), admin);
  await p.waitForTimeout(FONDU);
  return p;
}

// Les cas 6 et 7 n'eprouvent plus l'AFFICHAGE mais la DECISION : qui obtient la porte selon le
// profil. On laisse donc enterApp decider seul, sans l'appel de rattrapage ci-dessus — sinon la
// suite se contenterait de verifier qu'un booleen qu'elle vient d'ecrire est bien celui qu'elle
// a ecrit, et la liste des comptes nommes pourrait disparaitre sans qu'un test bronche.
async function ouvreProfil(browser, profil){
  const ctx = await browser.newContext({ viewport:{ width:1100, height:950 } });
  ctx.route('**ujkpnlcbxzhwcftvxgcd.supabase.co**', r => r.abort('failed'));
  await ctx.addInitScript(pr => {
    localStorage.setItem('endodiag-session', JSON.stringify({
      access_token:'test', refresh_token:'test', expires_at: Date.now() + 3600000,
      user_id:'test-user', email: pr.email }));
    localStorage.setItem('endodiag-profile', JSON.stringify(Object.assign({
      id:'test-user', annee:'TCEO1', faculte:'UFR Odontologie Dijon', approved:true }, pr)));
  }, profil);
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.evaluate(() => { const s = document.getElementById('splash-screen'); if (s) s.remove(); });
  await p.waitForSelector('#auth-gate.hidden', { state:'attached', timeout:15000 });
  await p.waitForTimeout(FONDU);
  return p;
}

const etat = p => p.evaluate(() => {
  const lis = id => {
    const e = document.getElementById(id);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { vu: !e.classList.contains('hidden'), aire: r.width * r.height };
  };
  return { porte: lis('accueil-choix'), modes: lis('hub-choice'), videos: lis('mode-videos') };
});

(async () => {
  const browser = await chromium.launch();

  // ---- 1. L'etudiant : rien de tout cela n'existe pour lui ----
  {
    const p = await ouvre(browser, false);
    const e = await etat(p);
    if (!e.porte) ko('la porte d\'accueil est introuvable dans la page');
    else if (e.porte.vu || e.porte.aire !== 0) {
      ko('la porte d\'accueil est visible pour un etudiant (aire ' + e.porte.aire + ')');
    }
    if (!e.modes.vu) ko('un etudiant ne voit plus le choix des trois modes : l\'accueil a change pour lui');
    if (e.videos.vu || e.videos.aire !== 0) ko('la rubrique video est visible pour un etudiant');

    // ---- 2. Et la forcer ne l'ouvre pas ----
    const force = await p.evaluate(() => {
      const b = document.getElementById('accueil-videos-btn');
      if (!b) return 'bouton absent';
      b.click();
      return document.getElementById('mode-videos').classList.contains('hidden') ? 'ferme' : 'ouvert';
    });
    if (force !== 'ferme') {
      ko('un etudiant qui force le bouton OUVRE la rubrique video (' + force + ') : '
         + 'un bouton cache n\'est pas une porte fermee');
    }
    console.log('1. etudiant : porte cachee, modes affiches, rubrique ' + force + ' meme en forcant');
    await p.close();
  }

  // ---- 3 a 5. L'enseignante : les deux chemins, et le retour ----
  {
    const p = await ouvre(browser, true);
    let e = await etat(p);
    if (!e.porte.vu) ko('l\'enseignante ne voit pas la porte d\'accueil');
    if (e.porte.aire === 0) ko('la porte d\'accueil n\'occupe aucune place a l\'ecran');
    if (e.modes.vu) ko('le choix des trois modes s\'affiche EN MEME TEMPS que la porte');
    console.log('2. enseignante : porte affichee (' + Math.round(e.porte.aire) + ' px2)');

    await p.click('#accueil-videos-btn');
    await p.waitForTimeout(FONDU);
    e = await etat(p);
    if (!e.videos.vu) ko('le bouton « vidéos » n\'ouvre pas la rubrique');
    if (e.porte.vu) ko('la porte reste affichee sous la rubrique video : deux ecrans l\'un sur l\'autre');
    // La rubrique est jugee sur ce que la page DECLARE, et non sur l'hypothese qu'elle est
    // vide : cette hypothese a cesse d'etre vraie des la premiere video ajoutee, et le test
    // reprochait alors au code d'afficher ce qu'on venait de lui demander d'afficher.
    const texte = ((await p.textContent('#videos-liste')) || '').replace(/\s+/g, ' ').trim();
    const declare = await p.evaluate(() => (window.EndoVideos ? window.EndoVideos() : null));
    if (!texte) ko('la rubrique video est muette : on la lirait comme un chargement en echec');
    if (declare === null) {
      ko('window.EndoVideos est introuvable : impossible de confronter le rendu a la liste declaree');
    } else {
      const items = declare.filter(t => t && t.items && t.items.length);
      const combien = items.reduce((n, t) => n + t.items.length, 0);
      if (!combien) {
        if (!/Aucune vidéo/.test(texte)) {
          ko('aucune video declaree, et la rubrique ne le dit pas — lu « ' + texte.slice(0, 80) + ' »');
        }
        console.log('3. rubrique video : vide, et elle le dit');
      } else {
        // UN SEUL THEME A LA FOIS. Les sous-onglets nomment les themes ; la liste ne montre
        // que celui qui est choisi. Empiler tous les themes obligeait a faire defiler pour
        // atteindre le dernier, et chargeait chaque lecteur en pure perte.
        const onglets = await p.$$eval('#videos-onglets [data-theme]', bs => bs.map(b => ({
          texte: (b.textContent || '').trim(),
          choisi: b.getAttribute('aria-selected') === 'true'
        })));
        if (onglets.length !== items.length) {
          ko(onglets.length + ' sous-onglet(s) pour ' + items.length + ' thème(s) déclaré(s)');
        }
        items.forEach((t, i) => {
          if (onglets[i] && onglets[i].texte.indexOf(t.theme) === -1) {
            ko('le sous-onglet ' + (i + 1) + ' ne porte pas le nom du thème « ' + t.theme + ' »');
          }
        });
        if (onglets.filter(o => o.choisi).length !== 1) {
          ko('il n\'y a pas exactement un sous-onglet choisi : ' +
             onglets.filter(o => o.choisi).length);
        }
        // Le thème choisi, et LUI SEUL, est affiche.
        const premier = items[0];
        premier.items.forEach(v => {
          if (texte.indexOf(v.titre) === -1) {
            ko('la vidéo « ' + v.titre + ' » du thème ouvert n\'apparait pas');
          }
        });
        items.slice(1).forEach(t => t.items.forEach(v => {
          if (texte.indexOf(v.titre) !== -1) {
            ko('la vidéo « ' + v.titre + ' » d\'un autre thème est affichée en même temps');
          }
        }));
        const lecteurs = await p.$$eval('#videos-liste .video-cadre > *', es => es.length);
        if (lecteurs !== premier.items.length) {
          ko(lecteurs + ' lecteur(s) affiché(s) pour les ' + premier.items.length +
             ' vidéo(s) du thème ouvert');
        }
        console.log('3. rubrique video : ' + items.length + ' sous-onglet(s), thème ouvert « ' +
                    premier.theme + ' » avec ' + lecteurs + ' lecteur(s)');

        // ---- Changer d'onglet ----
        // Un second thème est ajoute a la volee : avec un seul, le passage d'un onglet a
        // l'autre ne serait eprouve nulle part, et c'est justement ce que les onglets servent
        // a faire.
        await p.evaluate(() => {
          window.EndoVideos().push({ theme:'Thème d\'essai', items:[
            { titre:'Vidéo d\'essai', url:'https://youtu.be/essai123456' } ] });
        });
        await p.click('#mode-videos [data-back]'); await p.waitForTimeout(FONDU);
        await p.click('#accueil-videos-btn');      await p.waitForTimeout(FONDU);
        const combienOnglets = await p.$$eval('#videos-onglets [data-theme]', b => b.length);
        if (combienOnglets !== items.length + 1) {
          ko('un thème ajouté ne cree pas son sous-onglet (' + combienOnglets + ' au lieu de ' +
             (items.length + 1) + ')');
        } else {
          await p.click('#videos-onglets [data-theme="' + items.length + '"]');
          await p.waitForTimeout(300);
          const apres = ((await p.textContent('#videos-liste')) || '').replace(/\s+/g, ' ');
          if (apres.indexOf('Vidéo d\'essai') === -1) {
            ko('cliquer un sous-onglet n\'affiche pas ses vidéos');
          }
          if (apres.indexOf(premier.items[0].titre) !== -1) {
            ko('les vidéos du thème précédent restent affichées après changement d\'onglet — '
               + 'une vidéo lancée continuerait de jouer derrière');
          }
          console.log('4. changement de sous-onglet : le thème suit');
        }
        // On retire le thème d'essai pour ne rien laisser derriere soi.
        await p.evaluate(() => { window.EndoVideos().pop(); });
      }
    }

    await p.click('#mode-videos [data-back]');
    await p.waitForTimeout(FONDU);
    e = await etat(p);
    if (!e.porte.vu) ko('le retour depuis les videos ne ramene pas a la porte d\'accueil');
    if (e.videos.vu) ko('la rubrique video reste affichee apres le retour');

    await p.click('#accueil-entrainement-btn');
    await p.waitForTimeout(FONDU);
    e = await etat(p);
    if (!e.modes.vu) ko('le bouton « m\'entrainer » n\'ouvre pas le choix des trois modes');
    if (e.porte.vu) ko('la porte reste affichee sous le choix des modes');
    console.log('4. les deux chemins et le retour fonctionnent');
    await p.close();
  }

  // ---- 6. Un lien devient le bon lecteur ----
  // La reconnaissance se fait dans la page : on l'y interroge, plutot que de recopier ici une
  // regle qui pourrait diverger de la sienne sans que rien ne le dise.
  {
    const p = await ouvre(browser, true);
    const formes = await p.evaluate(() => {
      if (!window.EndoVideoLecteur) return null;
      const liens = {
        youtube: 'https://www.youtube.com/watch?v=abc123XYZ',
        youtuBe: 'https://youtu.be/abc123XYZ',
        // Le lien « Partager » de YouTube colle un suffixe de suivi derriere l'identifiant.
        partage: 'https://youtu.be/abc123XYZ?si=Ab12Cd34Ef',
        // Et l'adresse d'un direct ou d'un format court mene a la meme video.
        live:    'https://www.youtube.com/live/abc123XYZ',
        shorts:  'https://www.youtube.com/shorts/abc123XYZ',
        vimeo:   'https://vimeo.com/987654321',
        fichier: 'videos/essai.mp4',
        inconnu: 'https://exemple.fr/une-page'
      };
      const out = {};
      Object.keys(liens).forEach(k => {
        const d = document.createElement('div');
        d.innerHTML = window.EndoVideoLecteur(liens[k]);
        const el = d.firstElementChild;
        out[k] = el ? el.tagName : 'RIEN';
      });
      return out;
    });
    if (formes === null) {
      ko('lecteurs : window.EndoVideoLecteur est introuvable, la reconnaissance des liens '
         + 'n\'est eprouvee nulle part');
    } else {
      // Un lien non reconnu doit rester ATTEIGNABLE — un lien cliquable — plutot que de
      // disparaitre : une video absente sans message se chercherait longtemps.
      const attendu = { youtube:'IFRAME', youtuBe:'IFRAME', partage:'IFRAME', live:'IFRAME',
                        shorts:'IFRAME', vimeo:'IFRAME', fichier:'VIDEO', inconnu:'A' };
      Object.keys(attendu).forEach(k => {
        if (formes[k] !== attendu[k]) {
          ko('lecteur : un lien ' + k + ' donne « ' + formes[k] + ' » au lieu de « ' + attendu[k] + ' »');
        }
      });
      console.log('5. lecteurs reconnus :', JSON.stringify(formes));
    }
    await p.close();
  }

  // ---- 6. Le compte nomme obtient la rubrique, et RIEN DE PLUS ----
  // L'enseignante a demande que la rubrique video s'ouvre a un compte precis, comme elle
  // s'ouvre chez elle. Ce compte n'est pas administrateur : il ne doit donc recevoir que la
  // porte d'accueil — ni le back-office, ni l'atelier de trace, qui modifie le corrige sur
  // lequel les etudiants sont notes.
  {
    const nomme = await ouvreProfil(browser, {
      email:'etudiant.nomme@example.com', prenom:'Madeline', nom:'Sanchez' });
    const e = await etat(nomme);
    const porteVue = !!(e.porte && e.porte.vu);
    if (!porteVue) {
      ko('le compte nomme dans NOMS_VIDEOS ne voit pas la porte d\'accueil : l\'acces demande '
         + 'n\'est pas accorde');
    }
    if (porteVue && e.porte.aire === 0) {
      ko('le compte nomme recoit une porte qui n\'occupe aucune place a l\'ecran');
    }
    // La rubrique doit vraiment s'ouvrir, pas seulement s'annoncer. On ne clique QUE si le
    // bouton est la : sans cette garde, une regression sur l'acces faisait mourir la suite sur
    // un delai d'attente de trente secondes, sans dire un mot de ce qui n'allait pas. Une suite
    // qui tombe en panne n'est pas une suite qui accuse — les deux mutations qui ont eprouve ce
    // cas rendaient toutes deux une trace d'erreur illisible avant cette correction.
    if (porteVue) {
      await nomme.click('#accueil-videos-btn');
      await nomme.waitForTimeout(FONDU);
      const apres = await etat(nomme);
      if (!apres.videos || !apres.videos.vu) {
        ko('le compte nomme voit le bouton mais la rubrique video ne s\'ouvre pas');
      }
    }
    const deTrop = await nomme.evaluate(() => {
      const ouvert = id => {
        const el = document.getElementById(id);
        return !!el && !el.classList.contains('hidden');
      };
      return { backoffice: ouvert('acct-admin-btn'), atelier: ouvert('radio-trace-btn'),
               choixCliche: ouvert('radio-choix-wrap') };
    });
    if (deTrop.backoffice) ko('le compte nomme recoit le bouton du back-office : l\'acces accorde deborde');
    if (deTrop.atelier)    ko('le compte nomme recoit l\'atelier de trace : il pourrait changer le corrige');
    if (deTrop.choixCliche) ko('le compte nomme recoit le choix du cliche, reserve a l\'enseignante');
    console.log('6. le compte nomme a la rubrique, sans le back-office ni l\'atelier');
    await nomme.close();
  }

  // ---- 7. Et un etudiant ordinaire n'a toujours rien ----
  // Le meme chemin, sans l'appel de rattrapage : si la liste se mettait a dire oui a tout le
  // monde, le cas 1 ne le verrait pas, puisqu'il ecrit « faux » lui-meme.
  {
    const quelconque = await ouvreProfil(browser, {
      email:'etudiant.quelconque@example.com', prenom:'Camille', nom:'Durand' });
    const e = await etat(quelconque);
    if (e.porte && e.porte.vu) {
      ko('un etudiant ordinaire voit la porte d\'accueil : la liste des comptes nommes ne '
         + 'filtre plus rien');
    }
    if (!e.modes || !e.modes.vu) {
      ko('un etudiant ordinaire n\'ouvre plus sur le choix des trois modes');
    }
    // Et le nom s'eprouve a l'identique quelle que soit la casse ou l'ordre des mots : la
    // normalisation est annoncee dans la page, on verifie qu'elle existe pour de bon.
    await quelconque.evaluate(() => {
      const pr = JSON.parse(localStorage.getItem('endodiag-profile'));
      pr.prenom = 'SANCHEZ'; pr.nom = 'madeline';
      localStorage.setItem('endodiag-profile', JSON.stringify(pr));
    });
    const inverse = await ouvreProfil(browser, {
      email:'autre@example.com', prenom:'SANCHEZ', nom:'madeline' });
    const ei = await etat(inverse);
    if (!ei.porte || !ei.porte.vu) {
      ko('le nom inverse et en majuscules n\'est pas reconnu : la normalisation annoncee dans '
         + 'la page ne fait pas ce qu\'elle dit');
    }
    console.log('7. un etudiant ordinaire n\'a rien ; le nom est reconnu quel que soit son ordre');
    await quelconque.close();
    await inverse.close();
  }

  await browser.close();
  console.log('\nvideos                   Erreurs : ' + problemes.length);
  problemes.forEach(x => console.log('  - ' + x));
  if (problemes.length) process.exitCode = 1;
})();

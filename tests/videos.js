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
    const texte = ((await p.textContent('#videos-liste')) || '').replace(/\s+/g, ' ').trim();
    if (!texte) ko('la rubrique video est vide ET muette : on la lirait comme un chargement en echec');
    else if (!/Aucune vidéo/.test(texte)) {
      ko('la rubrique video ne dit pas qu\'elle est vide — lu « ' + texte.slice(0, 80) + ' »');
    }
    console.log('3. rubrique video : « ' + texte.slice(0, 60) + '… »');

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

  await browser.close();
  console.log('\nvideos                   Erreurs : ' + problemes.length);
  problemes.forEach(x => console.log('  - ' + x));
  if (problemes.length) process.exitCode = 1;
})();

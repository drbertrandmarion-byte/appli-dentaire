# Tests

Ces tests vérifient le **corrigé clinique** de l'application : ils rejouent chaque
cas nommé et contrôlent que la bonne réponse est bien acceptée.

À lancer après toute modification des cas, des corrigés ou des règles de notation.

## Prérequis

```bash
npm install -g playwright        # ou : npx playwright install chromium
```

## Lancer les tests

Depuis la racine du dépôt, servir l'application puis exécuter les suites :

```bash
python3 -m http.server 9300 &
node tests/cas-choix-therapeutique.js
node tests/analyse-differentielle.js
node tests/economie-diagnostique.js
node tests/barre-commandes.js
node tests/schemas-soins.js
node tests/legendes-schemas.js
python3 tests/coherence-textes.py
node tests/back-office.js
node tests/confettis.js
```

Résultats attendus :

```
Tested 86 / 86 unique named cases
Missing (never rolled): []
Failures: 0
```

```
Diagnostics rencontres : 12 / 12
Erreurs : 0
```

Les autres suites se terminent par `Erreurs : 0` ou `Problèmes : 0`. `back-office.js`
affiche en plus des tableaux à relire à l'œil — voir plus bas.

## Les neuf suites

| Fichier | Ce qu'il vérifie |
|---|---|
| `cas-choix-therapeutique.js` | Le corrigé clinique des 86 cas nommés du mode « Choix thérapeutique » |
| `analyse-differentielle.js` | La correction du mode « Diagnostic » : signes discriminants, signe posé ou non |
| `economie-diagnostique.js` | Le rappel à partir de 7 questions et le calcul du rang décisif |
| `barre-commandes.js` | Que les boutons retour / compte / son ne se chevauchent à aucune largeur d'écran |
| `schemas-soins.js` | Que le schéma dessine bien le soin coronaire décrit par l'énoncé |
| `legendes-schemas.js` | Que chaque entrée de légende corresponde au tracé : rien de superflu, rien de manquant |
| `coherence-textes.py` | Que l'énoncé, la radiographie et le schéma disent la même chose — **tous** les cas, sans tirage |
| `back-office.js` | Le back-office enseignant sur une base **simulée** : ventilation par promotion et export Excel |
| `confettis.js` | Que les confettis tombent sur un sans-faute, et **seulement** sur un sans-faute |

`analyse-differentielle.js` parcourt les douze diagnostics et contrôle des invariants :
un différentiel affiché sur une erreur et jamais sur une bonne réponse, et surtout un
marquage exact des signes — une question posée ne doit jamais apparaître comme « non
posée », ni l'inverse. Il termine par `Erreurs : 0`.

`barre-commandes.js` mesure les rectangles réellement affichés à sept largeurs d'écran, de
320 à 1440 pixels, et avec un prénom court puis très long. Il vérifie qu'aucune paire de
boutons ne se recouvre, qu'aucun ne sort de l'écran, que la page ne défile pas
latéralement, et que la barre — invisible mais large — n'intercepte pas les clics dans sa
zone vide. Mesurer plutôt qu'inspecter le CSS est délibéré : c'est le rendu qui compte.

`schemas-soins.js` tire des cas de « Choix thérapeutique » jusqu'à couvrir les énoncés
radiographiques distincts, et vérifie pour chacun que le dessin correspond au texte : une
dent déjà traitée porte toujours une obturation coronaire infiltrée — une dent dépulpée en
a forcément une, et c'est sa perte d'étanchéité qui explique la réinfection —, la légende
et le tracé s'accordent, et aucun soin n'est dessiné si l'énoncé n'en mentionne pas.
Il termine par `Erreurs : 0`.

`legendes-schemas.js` enchaîne soixante cas **sans recharger la page** — c'est ainsi qu'une
légende oubliée d'un cas au suivant se révèle, alors qu'un rechargement la masquerait. Il
interroge le **rendu réel** (`getComputedStyle`) et jamais la présence de la classe
`hidden` : c'est précisément une classe `hidden` sans effet, neutralisée par une règle plus
spécifique, qu'il doit attraper. Il compare aussi la couleur de chaque pastille à celle du
tracé correspondant. Il termine par `Erreurs : 0` — la version qui précédait sa création en
signalait 156.

`coherence-textes.py` est la seule suite qui n'ouvre **pas de navigateur** : elle lit
`index.html` et parcourt exhaustivement tous les cas des deux modes. C'est délibéré — un
test qui tire des cas au hasard finit toujours par en manquer, et un cas jamais tiré n'est
pas un cas vérifié. Elle croise, pour chacun : image apicale affirmée par la radiographie
contre lésion dessinée, tuméfaction / collection / fistule / signes généraux décrits par
l'énoncé contre schéma, et état coronaire annoncé par la radiographie contre énoncé.
Elle termine par `Anomalies : 0`.

Elle contrôle aussi l'**état périapical** : ligament sain, ligament élargi ou lésion
constituée, tels que le texte les décrit, contre ce que le schéma dessine.

Elle contrôle aussi qu'une **restauration récente — donc étanche** — n'appelle ni curetage (aucune
carie) ni reconstitution provisoire (l'étanchéité est déjà assurée), tant qu'aucun geste pulpaire
n'est réalisé. Les pulpites irréversibles survenues sous une restauration récente ouvrent la dent et
restent volontairement hors de ce contrôle : la limite est écrite dans le fichier plutôt que tue,
car une règle dont on ignore la portée donne une fausse assurance sur les cas qu'elle ne couvre pas.

Et la **restauration coronaire du traitement final**. La règle ne se déduit pas du seul geste final :
une pulpite réversible n'a plus rien à faire sur la dent ce jour-là — le curetage a eu lieu à
l'urgence — et doit pourtant être restaurée définitivement. Ce qui est contrôlé est donc ce qui a été
fait à la dent en tout, urgence comprise : dent extraite ou dent jamais touchée, rien à reconstituer ;
dans tous les autres cas, restauration définitive. La règle est appliquée aux 86 cas et aux 22
lignes de la fiche récapitulative imprimable — c'est elle que l'étudiant relit chez lui, et une
ligne qui contredirait le corrigé y enseignerait durablement l'inverse. Un traitement final qui ne
déclarerait aucune restauration est signalé au même titre qu'une restauration fausse : sans clé
déclarée, la réponse de l'étudiant ne serait jamais corrigée.

Attention à ses détecteurs : ils interprètent du texte libre. Une négation non prévue
(« pas de radioclarté », « aucune douleur ni tuméfaction ») produit un faux positif, et une
formule trop permissive masquerait une vraie contradiction. Deux garde-fous en découlent :

- une formulation apicale **non reconnue est signalée**, jamais ignorée — un classificateur
  muet donne une fausse assurance sur les cas qu'il ne sait pas lire ;
- le texte radiographique par défaut est **reconstitué à l'identique** de l'application pour
  les cas qui n'en déclarent pas ; sans cela ils échappaient à tous les contrôles.

Après toute modification de ces expressions régulières, vérifiez qu'elles se déclenchent
encore, en dégradant volontairement une valeur du fichier (retirer une fistule, une
tuméfaction, une correction apicale) et en contrôlant que l'audit le signale.

`confettis.js` joue de vraies séries jusqu'au bout dans les deux modes : ce qui peut casser n'est
pas le tracé de l'animation, c'est la condition qui la déclenche. Obtenir un sans-faute suppose de
connaître le corrigé de cas tirés au hasard ; plutôt que d'en recopier une table — qui se périmerait
à la première modification de l'application —, le test **remplace `Math.random` par un générateur
déterministe** et joue chaque série deux fois : au premier passage il répond n'importe quoi et lit
les bonnes réponses dans la correction affichée, au second il rejoue la même série — identique,
puisque le tirage l'est — en répondant juste. Un rejeu qui n'atteint pas le sans-faute fait échouer
le test : sans cela, il ne prouverait rien.

Il contrôle ensuite le rendu réel du canvas, pas sa seule présence : les confettis doivent
**descendre** (le centre de gravité des pixels dessinés s'abaisse d'une mesure à l'autre) et la
pluie doit s'étoffer. Il vérifie aussi que la couche ne se met pas en travers — le clic au centre du
bouton « Recommencer une série » doit l'atteindre, lui et non le canvas —, qu'elle disparaît quand on
quitte l'écran de score comme à la fin de l'animation, et que rien ne tombe si le système demande de
réduire les animations. Il termine par `Erreurs : 0`.

Ses six mutations de contrôle : neutraliser le déclencheur de chaque mode, retirer
`pointer-events:none`, ignorer `prefers-reduced-motion`, supprimer l'arrêt au départ de l'écran de
score, et ne jamais retirer le canvas. Les six sont bien signalées.

`back-office.js` n'interroge **jamais la vraie base** : toutes les réponses Supabase sont
interceptées et remplacées par un jeu d'essai. C'est délibéré — un test ne doit pas
dépendre des données réelles des étudiants, ni risquer de les modifier.

Il télécharge ensuite le classeur Excel et le contrôle : archive ZIP intègre, XML bien
formé dans chaque partie, **compteurs de styles cohérents** (`<fonts count="4">` doit
réellement contenir quatre polices — un écart est la cause classique du message « contenu
illisible » d'Excel, et il passe totalement inaperçu à l'œil nu), feuilles reliées, puis
relecture par `openpyxl` pour vérifier que les dates sont de vraies dates et les
pourcentages de vrais nombres. Il termine par `Problèmes : 0`.

Le début de sa sortie — promotions détectées et tableau filtré pour chacune — reste à
relire à l'œil.

`openpyxl` est nécessaire à ce dernier contrôle :

```bash
pip install openpyxl
```

Sans lui, le test signale que la relecture n'a pas eu lieu mais vérifie tout le reste.

**Toute autre sortie signale un problème.** Les deux lignes à surveiller :

- `Missing` non vide → un cas n'a jamais été tiré. Soit il a été supprimé de
  l'application sans l'être du test, soit le tirage aléatoire ne le propose plus.
- `Failures` > 0 → la réponse attendue par le test diffère de celle de
  l'application. Le détail indique la pathologie, ce qui était attendu et ce qui a
  été refusé.

## Fonctionnement

Le test parcourt les modes en tirant des cas au hasard jusqu'à les avoir tous
rencontrés, coche pour chacun les cases correspondant au corrigé attendu, valide,
puis vérifie que l'application déclare la réponse correcte.

Deux détails d'implémentation méritent explication :

- Le test **coupe l'accès à Supabase** et se présente comme un compte déjà validé.
  L'application bascule alors sur son repli hors ligne, ce qui permet de traverser
  l'écran de connexion sans compte réel ni écriture en base.
- Il **retire l'écran d'ouverture** du DOM pour ne pas attendre l'animation. Cela
  provoque des erreurs `Cannot read properties of null` dans la console du
  navigateur : ce sont les animations différées de cet écran qui ne trouvent plus
  leurs éléments. C'est un artefact du test, sans effet en usage réel — un
  utilisateur ne supprime pas l'écran d'ouverture en pleine animation.

## Mettre le test à jour

Le corrigé attendu est déclaré en haut du fichier, par prénom de patient. En
ajoutant ou modifiant un cas dans `index.html`, reportez-y la même modification —
sans quoi le test échouera, ce qui est précisément son rôle.

## Voir aussi

`supabase/test-rls.sql` vérifie, lui, les règles de sécurité de la base : qu'un
étudiant ne peut ni s'auto-valider, ni se déclarer administrateur, ni lire les
données d'un camarade.

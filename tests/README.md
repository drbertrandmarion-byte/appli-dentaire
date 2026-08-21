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
node tests/back-office.js
```

Résultats attendus :

```
Tested 85 / 85 unique named cases
Missing (never rolled): []
Failures: 0
```

```
Diagnostics rencontres : 12 / 12
Erreurs : 0
```

Les autres suites se terminent par `Erreurs : 0` ou `Problèmes : 0`. `back-office.js`
affiche en plus des tableaux à relire à l'œil — voir plus bas.

## Les sept suites

| Fichier | Ce qu'il vérifie |
|---|---|
| `cas-choix-therapeutique.js` | Le corrigé clinique des 85 cas nommés du mode « Choix thérapeutique » |
| `analyse-differentielle.js` | La correction du mode « Diagnostic » : signes discriminants, signe posé ou non |
| `economie-diagnostique.js` | Le rappel à partir de 7 questions et le calcul du rang décisif |
| `barre-commandes.js` | Que les boutons retour / compte / son ne se chevauchent à aucune largeur d'écran |
| `schemas-soins.js` | Que le schéma dessine bien le soin coronaire décrit par l'énoncé |
| `legendes-schemas.js` | Que chaque entrée de légende corresponde au tracé : rien de superflu, rien de manquant |
| `back-office.js` | Le back-office enseignant sur une base **simulée** : ventilation par promotion et export Excel |

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

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

Le troisième affiche des tableaux à relire (filtre par promotion, contenu des CSV) ;
il n'a pas de verdict automatique — voir plus bas.

## Les trois suites

| Fichier | Ce qu'il vérifie |
|---|---|
| `cas-choix-therapeutique.js` | Le corrigé clinique des 85 cas nommés du mode « Choix thérapeutique » |
| `analyse-differentielle.js` | La correction du mode « Diagnostic » : signes discriminants, signe posé ou non |
| `economie-diagnostique.js` | Le rappel à partir de 7 questions et le calcul du rang décisif |
| `back-office.js` | Le back-office enseignant sur une base **simulée** : ventilation par promotion et exports CSV |

`analyse-differentielle.js` parcourt les douze diagnostics et contrôle des invariants :
un différentiel affiché sur une erreur et jamais sur une bonne réponse, et surtout un
marquage exact des signes — une question posée ne doit jamais apparaître comme « non
posée », ni l'inverse. Il termine par `Erreurs : 0`.

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

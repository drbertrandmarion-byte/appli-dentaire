# Tests

Ces tests vérifient le **corrigé clinique** de l'application : ils rejouent chaque
cas nommé et contrôlent que la bonne réponse est bien acceptée.

À lancer après toute modification des cas, des corrigés ou des règles de notation.

## Prérequis

```bash
npm install -g playwright        # ou : npx playwright install chromium
```

## Lancer les tests

Depuis la racine du dépôt, servir l'application puis exécuter la suite :

```bash
python3 -m http.server 9300 &
node tests/cas-choix-therapeutique.js
```

Résultat attendu :

```
Tested 85 / 85 unique named cases
Missing (never rolled): []
Failures: 0
```

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

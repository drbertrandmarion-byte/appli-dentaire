# Vidéos explicatives

Les fichiers vidéo de la rubrique « Vidéos explicatives » se déposent ici, comme
les radiographies dans `radios/`.

## Ce que l'application accepte

`.mp4` de préférence (lu partout), `.webm`, `.ogg` ou `.mov` également.

## Taille : le point à surveiller

L'hébergement impose des limites, et ce sont elles qui décident du nombre de
vidéos possibles :

| Limite | Valeur |
|---|---|
| Taille totale du site publié | **1 Go** |
| Dépôt source (recommandé) | 1 Go |
| Trafic mensuel | 100 Go (limite souple) |
| Durée d'une publication | **10 minutes**, sinon elle échoue |

La dernière est la plus traîtresse : plus le site est lourd, plus sa publication
est longue, et au-delà de dix minutes elle s'interrompt.

**Visez 10 à 20 Mo par vidéo** pour quelques minutes — en 720p, c'est largement
suffisant pour lire le texte d'une diapositive. À ce poids, une cinquantaine de
vidéos tiennent sans difficulté.

Au-delà de 25 Mo, un fichier ne peut plus être déposé depuis le site de GitHub
par glisser-déposer ; au-delà de 100 Mo, il est refusé purement et simplement.

## Ajouter une vidéo

1. Déposer le fichier ici.
2. Ajouter une ligne dans `index.html`, à l'endroit marqué `var VIDEOS` :

```js
{ theme:'Le diagnostic', note:'Les tableaux cliniques, un par un.', items:[
    { titre:'Reconnaître une pulpite irréversible', duree:'4 min',
      url:'videos/pulpite-irreversible.mp4' }
  ] },
```

Rien d'autre n'est à toucher.

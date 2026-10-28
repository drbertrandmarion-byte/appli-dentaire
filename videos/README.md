# Vidéos explicatives

Deux voies possibles : un **lien YouTube ou Vimeo**, ou un **fichier déposé ici**,
comme les radiographies dans `radios/`.

## La voie retenue : YouTube

Plus simple, et sans aucune des limites décrites plus bas. Un seul réglage
compte au moment de la mise en ligne sur YouTube :

- **« Non répertoriée »** — c'est le bon choix. La vidéo n'apparaît pas dans les
  recherches, mais elle s'affiche dans l'application.
- **« Privée »** — à éviter : une vidéo privée REFUSE de s'afficher ailleurs que
  sur YouTube. Le lecteur n'y montrerait qu'un message d'erreur.
- « Publique » fonctionne aussi, mais rend la vidéo trouvable par tout le monde.

Les vidéos sont intégrées via `youtube-nocookie.com` : YouTube ne dépose alors
ses traceurs qu'au moment où l'étudiant lance la lecture.

À savoir : une vidéo non répertoriée reste visible par quiconque obtient le lien.
Un étudiant peut le transmettre. Si cela pose problème, Vimeo permet de
restreindre la lecture à un site donné — mais c'est une offre payante.

## L'autre voie : les fichiers

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

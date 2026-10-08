# 🐍 Snake Néon

Un Snake moderne en JavaScript pur (Canvas 2D), style néon, jouable sur PC et mobile.

▶ **Jouer :** https://gninoue-dev.github.io/gameSnake/

## Fonctionnalités

- **2 modes de jeu**
  - **Classique** : les murs sont mortels et des obstacles apparaissent à partir du niveau 3.
  - **Infini** : le serpent traverse les bords, aucun obstacle.
- **3 types de nourriture**
  - 🔴 Pomme : +10 points, fait grandir le serpent.
  - ⭐ Étoile dorée : +50 points, disparaît au bout de 6 s.
  - 💎 Cristal de glace : ralentit le jeu pendant 5 s.
- **Combos** : enchaîne les bonus en moins de 3,5 s pour multiplier les points (jusqu'à x5).
- **Niveaux** : toutes les 5 pommes, le jeu accélère ; la musique change tous les 2 niveaux.
- **Records sauvegardés** par mode (localStorage), ainsi que la préférence du son.
- Mouvement fluide (interpolation à 60 i/s), particules, textes flottants, tremblement à la mort.
- Pause manuelle et automatique quand l'onglet est masqué, compte à rebours à la reprise.
- Écran de fin avec statistiques : score, niveau, longueur, temps, meilleur combo.

## Contrôles

| Action | Clavier | Mobile |
|---|---|---|
| Bouger | Flèches, ZQSD ou WASD | Glisser sur l'écran ou croix directionnelle |
| Pause | P, Échap ou Espace | Bouton central de la croix |
| Son | M | Bouton 🔊 |

Les virages rapides sont mémorisés (file de 3 directions) : un double virage n'est jamais perdu.

## Lancer en local

Aucune dépendance : ouvre `index.html` dans un navigateur.

## Structure

```
index.html   écrans (menu, pause, fin de partie) et HUD
style.css    thème néon, responsive, croix tactile
snake.js     moteur du jeu, rendu, audio, contrôles
sounds/      musiques et jingles
```

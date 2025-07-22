# Prototype de communication

Ce projet a pour but de définir la communication entre l'arduino et l'application

## treadmill_sensor

Ne sachant pas encore vraiment comment fonctionne le tapis-roulant, j'utilise pour le moment un simple interrupteur pour simuler les impulsions et un ESP32 S2 mini.


<img width="2402" height="1808" alt="image" src="https://github.com/user-attachments/assets/23245d07-ec81-4ead-89a3-c471aa782f19" />


L'arduino récupère les impulsions du tapis roulant et envoie sur le port série des trames de données à un intervalle régulier avec informations suivantes :  
DIST : distance parcourue (en mètres) depuis la dernière trame  
SPEED : vitesse instantanée (en km/h) calculée sur l’intervalle  
TS : timestamp (en millisecondes depuis le démarrage)  
DUR : durée de l’intervalle (en ms)

  

**Format général d’une trame** : DIST:<distance_en_mètres>;SPEED:<vitesse_en_kmh>;TS:<timestamp_ms>;DUR:<durée_intervalle_ms>\n  

Exemple : DIST:0.25;SPEED:1.80;TS:123456;DUR:500\n

DIST:0.25 → 0,25 m parcourus depuis la dernière trame  
SPEED:1.80 → vitesse instantanée de 1,80 km/h  
TS:123456 → timestamp actuel : 123 456 ms depuis le démarrage de l'arduino  
DUR:500 → durée de l'intervalle de mesure : 500 ms  
\n → retour à ligne, fin de la trame  
  

**Commande série spéciale** :  
L'arduino accepte également une commande pour modifier l’intervalle d’envoi des trames :  
SET_INTERVAL:<valeur_en_ms>  
  
Exemple :  SET_INTERVAL:1000  
→  Demande  d’envoyer une trame toutes les 1000 ms (1 seconde).  
Réponse possible :  
ACK_INTERVAL:<valeur_en_ms>  si la modification est acceptée  
ERR_INTERVAL  si la valeur est hors limites (doit être comprise entre 100 et 5000 ms)

## treadmill_app
<img width="912" height="912" alt="app" src="https://github.com/user-attachments/assets/745861fb-8462-4afc-a87c-f947b90de71b" />

Au lancement de l'application il faut selectionner  le port  serie  à utiliser puis cliquer sur Connexion pour voir les trames s'afficher. (Sur mac le port devrait être /dev/tty.usbmodem01)

#include <Arduino.h>

const int sensorPin = 35; // Pin du capteur
const int ledPin = 15;     // LED interne
const float distancePerPulse = 0.186; // Distance en mètres par impulsion
unsigned long frameInterval = 500;   // Intervalle d'envoi en ms (modifiable avec la commande SET_INTERVAL)

volatile unsigned int pulsesSinceLastFrame = 0;

void setup() {
  Serial.begin(115200);
  pinMode(sensorPin, INPUT);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  static unsigned long lastSend = 0;
  static unsigned int pulsesToSend = 0;
  static unsigned long lastPulse = 0;
  static bool previousState = true;

  // --- Gestion de la commande série SET_INTERVAL ---
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.startsWith("SET_INTERVAL:")) {
      unsigned long newInterval = cmd.substring(13).toInt();
      if (newInterval >= 100 && newInterval <= 5000) {
        frameInterval = newInterval;
        Serial.print("ACK_INTERVAL:");
        Serial.println(frameInterval);
      } else {
        Serial.println("ERR_INTERVAL");
      }
    } 
  }

  // --- Détection du pulse avec anti-rebond logiciel ---
  unsigned long now = millis();
  bool currentState = digitalRead(sensorPin);
  if (previousState == true && currentState == false && (now - lastPulse > 10)) {
    pulsesSinceLastFrame++;
    digitalWrite(ledPin, HIGH);
    lastPulse = now;
  }
  if (currentState == true) {
    digitalWrite(ledPin, LOW); // Éteint la LED quand le bouton est relâché
  }
  previousState = currentState;

  if (now - lastSend >= frameInterval) {
    pulsesToSend = pulsesSinceLastFrame;
    pulsesSinceLastFrame = 0;

    // Calcul de la distance et vitesse instantanée
    float distance = pulsesToSend * distancePerPulse;
    float speed = (frameInterval > 0) ? (distance / (frameInterval / 1000.0)) * 3.6 : 0;


    // Exemple de trame : DIST:0.25;SPEED:1.80;TS:123456;DUR:500
    // DIST:0.25 → 0,25 m parcourus depuis la dernière trame
    // SPEED:1.80 → vitesse instantanée de 1,80 km/h
    // TS:123456 → timestamp actuel : 123 456 ms depuis le démarrage de l'arduino
    // DUR:500 → durée de l'intervalle de mesure : 500 ms
    // \n → retour à ligne, fin de la trame

    Serial.print("DIST:");
    Serial.print(distance);
    Serial.print(";SPEED:");
    Serial.print(speed, 2);
    Serial.print(";TS:");
    Serial.print(now);
    Serial.print(";DUR:");
    Serial.println(frameInterval);

    lastSend = now;
  }
}
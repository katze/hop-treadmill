const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Vérifie si le fichier CSV existe et le crée avec l'en-tête si nécessaire
 */
function ensureCsvFileExists() {
  try {
    const csvPath = path.join(app.getPath('documents'), 'RunningSessions.csv');
    if (!fs.existsSync(csvPath)) {
      const header = 'Date;Durée;Distance (m);Vitesse moyenne;Vitesse max\n';
      fs.writeFileSync(csvPath, '\uFEFF' + header, 'utf8');
      console.log('Fichier CSV créé:', csvPath);
    }
  } catch (error) {
    console.error('Erreur lors de la création du fichier CSV:', error);
    throw error;
  }
}

/**
 * Sauvegarde une session dans le fichier CSV
 * @param {Object} sessionData - Données de la session
 * @param {string} sessionData.date - Date de la session
 * @param {string} sessionData.duree - Durée de la session
 * @param {number} sessionData.distance - Distance parcourue
 * @param {number} sessionData.vMoy - Vitesse moyenne
 * @param {number} sessionData.vMax - Vitesse maximale
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function saveSessionRow(sessionData) {
  try {
    // Validation des données
    if (!sessionData || typeof sessionData !== 'object') {
      throw new Error('Données de session invalides: doit être un objet');
    }
    
    const { date, duree, distance, vMoy, vMax } = sessionData;
    
    // Validation des champs requis
    if (!date || !duree || distance === undefined || vMoy === undefined || vMax === undefined) {
      throw new Error('Données de session incomplètes: tous les champs sont requis');
    }
    
    // Formatage de la ligne CSV
    const row = `${date};${duree};${distance.toFixed(1).replace('.', ',')};${vMoy.toFixed(1).replace('.', ',')};${vMax.toFixed(1).replace('.', ',')}`;
    
    const csvPath = path.join(app.getPath('documents'), 'RunningSessions.csv');
    ensureCsvFileExists();
    fs.appendFileSync(csvPath, row + '\n', 'utf8');
    console.log('Session sauvegardée:', row);
    return { success: true };
  } catch (error) {
    console.error('Erreur lors de la sauvegarde CSV:', error);
    return { error: error.message };
  }
}

/**
 * Lit toutes les sessions depuis le fichier CSV
 * @returns {Promise<Array>} Tableau des sessions
 */
async function getCsvData() {
  try {
    const csvPath = path.join(app.getPath('documents'), 'RunningSessions.csv');
    if (!fs.existsSync(csvPath)) return [];
    
    const content = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').trim();
    const lines = content.split(/\r?\n/);
    
    if (lines.length < 2) return [];
    
    return lines.slice(1).map(line => {
      const [date, duree, distance, vMoy, vMax] = line.split(';');
      return {
        date,
        duree,
        distance: parseFloat(distance.replace(',', '.')),
        vMoy: parseFloat(vMoy.replace(',', '.')),
        vMax: parseFloat(vMax.replace(',', '.')),
      };
    });
  } catch (error) {
    console.error('Erreur lors de la lecture CSV:', error);
    return [];
  }
}

module.exports = {
  saveSessionRow,
  getCsvData,
  ensureCsvFileExists
}; 
const fs = require('fs');
const path = require('path');

const configPath = path.resolve('config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function saveConfig(newConfig) {
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
}

module.exports = {
  loadConfig,
  saveConfig
}
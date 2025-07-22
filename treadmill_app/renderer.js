let portList = [];
let isConnected = false;
let totalDistance = 0;
let speedChart;
let speedData = [];

const portSelect = document.getElementById('portSelect');
const refreshBtn = document.getElementById('refreshPorts');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const distanceSpan = document.getElementById('distance');
const speedSpan = document.getElementById('speed');
const intervalInput = document.getElementById('intervalInput');
const setIntervalBtn = document.getElementById('setIntervalBtn');
const intervalAck = document.getElementById('intervalAck');
const serialConsole = document.getElementById('serialConsole');
const intervalValue = document.getElementById('intervalValue');
const lastDistanceSpan = document.getElementById('lastDistance');
const mainContent = document.getElementById('mainContent');

intervalInput.oninput = () => {
  intervalValue.textContent = intervalInput.value;
};

let serialWriter = null;

function updatePortList() {
  window.electronAPI.listSerialPorts().then(ports => {
    portList = ports;
    portSelect.innerHTML = '';
    ports.forEach(port => {
      const opt = document.createElement('option');
      opt.value = port.path;
      opt.textContent = port.path;
      portSelect.appendChild(opt);
    });
  });
}

refreshBtn.onclick = updatePortList;

setIntervalBtn.onclick = () => {
  const val = parseInt(intervalInput.value, 10);
  if (isConnected && serialWriter) {
    const cmd = `SET_INTERVAL:${val}\n`;
    serialWriter(cmd);
    appendSerialConsole('>> ' + cmd.trim()); // Affiche la commande envoyée
    intervalAck.textContent = 'Commande envoyée...';
    setTimeout(() => { intervalAck.textContent = ''; }, 2000);
  }
};

function addSpeedPoint(speed) {
  if (speedData.length > 60) speedData.shift();
  speedData.push(speed);
  speedChart.data.labels = speedData.map((_, i) => i);
  speedChart.data.datasets[0].data = speedData;
  speedChart.update();
}

function appendSerialConsole(line) {
  serialConsole.value += line + '\n';
  serialConsole.scrollTop = serialConsole.scrollHeight;
}

window.electronAPI.onSerialData((data) => {
  appendSerialConsole(data);
  // Gestion de l'ACK ou erreur d'intervalle
  if (data.startsWith('ACK_INTERVAL:')) {
    intervalAck.textContent = `Intervalle défini à ${data.split(':')[1]} ms`;
    setTimeout(() => { intervalAck.textContent = ''; }, 3000);
    return;
  }
  if (data.startsWith('ERR_INTERVAL')) {
    intervalAck.textContent = 'Valeur incorrecte (100-5000 ms)';
    setTimeout(() => { intervalAck.textContent = ''; }, 3000);
    return;
  }
  // Exemple de trame : DIST:0.25;SPEED:2.50;TS:123456;DUR:500
  // DIST : distance en mètres
  // SPEED : vitesse en km/h
  // TS : timestamp en ms
  // DUR : durée de la trame en ms
  const match = data.match(/DIST:([\d.]+);SPEED:([\d.]+);TS:(\d+);DUR:(\d+)/);
  if (match) {
    const dist = parseFloat(match[1]);
    const speed = parseFloat(match[2]);
    const dur = parseInt(match[4], 10);
    totalDistance += dist;
    distanceSpan.textContent = totalDistance.toFixed(2);
    lastDistanceSpan.textContent = dist.toFixed(2);
    speedSpan.textContent = speed.toFixed(2);
    addSpeedPoint(speed);
    // Affichage optionnel de la durée
    const durValue = document.getElementById('durValue');
    if (durValue) durValue.textContent = dur;
  }
});

// Ajout de la fonction d'envoi série via IPC
window.electronAPI.sendSerial = (str) => {
  window.electronAPI.sendSerialData(str);
};

// Lors de la connexion, on prépare l'envoi série
connectBtn.onclick = () => {
  const port = portSelect.value;
  window.electronAPI.openSerialPort(port, 115200);
  serialWriter = (str) => window.electronAPI.sendSerialData(str);
  isConnected = true;
  mainContent.style.display = '';
  connectBtn.disabled = true;
  disconnectBtn.disabled = false;
};
disconnectBtn.onclick = () => {
  window.electronAPI.closeSerialPort();
  serialWriter = null;
  isConnected = false;
  mainContent.style.display = 'none';
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
};

document.addEventListener('DOMContentLoaded', () => {
  updatePortList();
  const ctx = document.getElementById('speedChart').getContext('2d');
  speedChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Vitesse (km/h)',
        data: [],
        borderColor: '#1976d2',
        backgroundColor: 'rgba(25, 118, 210, 0.1)',
        fill: true,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}); 
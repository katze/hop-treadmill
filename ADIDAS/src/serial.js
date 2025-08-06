const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

/**
 * @type {SerialPort|null}
 */
let port = null;
let messageCallback = null;

function isUsbSerialPort(info) {
  // Use pnpId to robustly detect USB serial devices
  return info.pnpId && /USB|VID_|PID_/i.test(info.pnpId);
}

async function setupSerial() {
  // List all available serial ports
  const ports = await SerialPort.list();
  // Only select ports with a USB pnpId
  const usbPorts = ports.filter(isUsbSerialPort);
  if (usbPorts.length === 0) {
    console.error('No USB serial port found. Please connect your device.');
    setTimeout(setupSerial, 1000);
    return;
  }
  const selected = usbPorts[0];
  console.log('Using serial port:', selected.path, selected.pnpId || '', selected.manufacturer || '');
  port = new SerialPort({ path: selected.path, baudRate: 115200 });
  const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

  let pingInterval = void 0;

  parser.on('data', (data) => {
    clearTimeout(pingInterval);
    pingInterval = setTimeout(() => {
      console.log('Ping timeout');
      if (port && !port.closed) {
        port.close();
      }
    }, 1000);
    console.log('[SERIAL RAW]', data); // Log raw data
    data = data.trim();
    // Special responses
    if (data.startsWith('ACK_INTERVAL:')) {
      const value = parseInt(data.split(':')[1], 10);
      if (messageCallback) messageCallback({ type: 'ack', value });
      return;
    }
    if (data.startsWith('ERR_INTERVAL')) {
      if (messageCallback) messageCallback({ type: 'err', message: 'ERR_INTERVAL' });
      return;
    }
    // Data frame
    const match = data.match(/^DIST:([\d.]+);SPEED:([\d.]+);TS:(\d+);DUR:(\d+)$/);
    if (match) {
      const obj = {
        dist: parseFloat(match[1]),
        speed: parseFloat(match[2]),
        ts: parseInt(match[3], 10),
        dur: parseInt(match[4], 10)
      };
      if (messageCallback) messageCallback(obj);
    }
    // Ignore unknown lines
  });

  port.on('open', () => {
    console.log('Serial port opened');
    pingInterval = setTimeout(() => {
      if (port && port.isOpen) {
        port.close();
      }
    }, 1000);
  });
  port.on('error', (err) => {
    console.error('Serial port error:', err);
    port = null;
  });
  port.on('close', () => {
    console.log('Serial port closed');
    port = null;
    setTimeout(setupSerial, 1000);
    clearTimeout(pingInterval);
  });
}

function setSerialInterval(ms) {
  if (port && port.isOpen) {
    port.write(`SET_INTERVAL:${ms}\r\n`);
  }
}

function onSerialMessage(cb) {
  messageCallback = cb;
}

module.exports = {
  setupSerial,
  onSerialMessage,
  setSerialInterval,
}; 
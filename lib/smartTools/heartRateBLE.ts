import type { BleManager, Subscription } from 'react-native-ble-plx';

/** Standard Bluetooth SIG Heart Rate Measurement (service 180D, characteristic 2A37). */
const HR_SERVICE = '180D';
const HR_MEASUREMENT = '2A37';

// RN JS engines do not consistently expose atob. Decode the tiny BLE payload
// without depending on Node Buffer or introducing another native dependency.
export function decodeHeartRateMeasurement(base64: string): number | null {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/=+$/, '').trim();
  if (!clean || /[^A-Za-z0-9+/]/.test(clean)) return null;
  const bytes: number[] = [];
  let bits = 0;
  let accumulated = 0;
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value < 0) return null;
    accumulated = (accumulated << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulated >> bits) & 0xff);
    }
  }
  if (bytes.length < 2) return null;
  const wide = (bytes[0] & 1) === 1;
  if (wide && bytes.length < 3) return null;
  const bpm = wide ? bytes[1] | (bytes[2] << 8) : bytes[1];
  return bpm >= 25 && bpm <= 250 ? bpm : null;
}

export type HRConnection = { disconnect: () => Promise<void> };

/** Connect only after an explicit user tap selecting a discovered device. */
export async function connectHeartRateDevice(
  manager: BleManager,
  deviceId: string,
  onBpm: (bpm: number) => void,
  onLost: (message: string) => void,
): Promise<HRConnection> {
  const device = await manager.connectToDevice(deviceId, {autoConnect: false});
  let measurementSub: Subscription | null = null;
  let disconnectedSub: Subscription | null = null;
  try {
    await device.discoverAllServicesAndCharacteristics();
    const services = await device.services();
    const hasHeartRate = services.some((service) =>
      service.uuid.toLowerCase() === HR_SERVICE.toLowerCase() ||
      service.uuid.toLowerCase().startsWith('0000180d-'));
    if (!hasHeartRate) throw new Error('This device does not advertise standard Bluetooth heart-rate measurements.');
    measurementSub = device.monitorCharacteristicForService(
      HR_SERVICE, HR_MEASUREMENT,
      (error, characteristic) => {
        if (error) {onLost(error.message); return;}
        if (!characteristic?.value) return;
        const bpm = decodeHeartRateMeasurement(characteristic.value);
        if (bpm !== null) onBpm(bpm);
      },
    );
    disconnectedSub = manager.onDeviceDisconnected(device.id, (error) => {
      onLost(error?.message ?? 'Heart-rate monitor disconnected.');
    });
  } catch (error) {
    measurementSub?.remove();
    disconnectedSub?.remove();
    await manager.cancelDeviceConnection(device.id).catch(() => {});
    throw error;
  }
  let closed = false;
  return {
    disconnect: async () => {
      if (closed) return;
      closed = true;
      measurementSub?.remove();
      disconnectedSub?.remove();
      await manager.cancelDeviceConnection(device.id).catch(() => {});
    },
  };
}

import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

import type { ConnectedDevice } from './types';

const bleManager = new BleManager();

async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);

    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function deviceName(device: Device): string {
  return device.name || device.localName || 'Bluetooth device';
}

export async function scanForBluetoothDevices(
  durationMs = 8000
): Promise<ConnectedDevice[]> {
  const allowed = await requestBluetoothPermissions();

  if (!allowed) {
    console.log('BLE: permission denied');
    return [];
  }

  const found = new Map<string, ConnectedDevice>();

  return new Promise((resolve) => {
    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log('BLE SCAN ERROR:', error.message);
        bleManager.stopDeviceScan();
        resolve([]);
        return;
      }

      if (!device) return;

      found.set(device.id, {
        id: device.id,
        name: deviceName(device),
        type: 'other',
        connected: false,
        supportedMetrics: [],
      });
    });

    setTimeout(() => {
      bleManager.stopDeviceScan();

      const devices = Array.from(found.values());

      console.log('BLE DEVICES FOUND:', devices);

      resolve(devices);
    }, durationMs);
  });
}
// Native HealthKit / Health Connect bridge interface.
// The PWA build does not implement this; a future Capacitor wrap will.
// Keep all UI calls going through this interface so swapping is one file.

import type { HealthImportPreview } from './healthImport'

export type SyncRange = {
  since?: Date
  until?: Date
}

export interface HealthBridge {
  // Returns true if a native bridge is wired up.
  isAvailable(): boolean
  // Request platform permission (HealthKit on iOS, Health Connect on Android).
  requestPermission(): Promise<boolean>
  // Pull the same shape we produce from the XML import.
  pullSnapshot(range: SyncRange): Promise<HealthImportPreview>
}

class WebStubBridge implements HealthBridge {
  isAvailable(): boolean {
    return false
  }
  async requestPermission(): Promise<boolean> {
    return false
  }
  async pullSnapshot(): Promise<HealthImportPreview> {
    throw new Error('Native bridge unavailable. Use Apple Health export.xml import.')
  }
}

let bridge: HealthBridge = new WebStubBridge()

// Capacitor wrap calls this on app bootstrap to replace the stub.
export function setHealthBridge(next: HealthBridge): void {
  bridge = next
}

export function getHealthBridge(): HealthBridge {
  return bridge
}

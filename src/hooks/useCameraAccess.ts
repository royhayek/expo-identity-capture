/**
 * Camera access for the embeddable camera views: the permission asked once when it can be, the device once the
 * platform has listed it, and the camera paused while the app isn't in the foreground.
 *
 * @module useCameraAccess
 */

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

import type { AppStateStatus } from 'react-native';

type CameraPosition = Parameters<typeof useCameraDevice>[0];
type DeviceFilter = Parameters<typeof useCameraDevice>[1];

/**
 * How long the device list may stay empty before there is no such camera: Android lists its cameras asynchronously,
 * and some devices take a moment after the permission is granted
 */
const DEVICE_GRACE_MS = 2500;

export type CameraAccessProblem = 'PERMISSION_DENIED' | 'NO_CAMERA';

export interface CameraAccess {
  device: ReturnType<typeof useCameraDevice>;
  hasPermission: boolean;
  /** The view's `isActive`, and the app in the foreground: a backgrounded camera is released (iOS requires it) */
  isActive: boolean;
  /** Set once it is certain: permission refused (or restricted), or no such camera after the list settled */
  problem: CameraAccessProblem | null;
}

/** Whether the app is in the foreground ('inactive' too: a system sheet or the app switcher over it) */
function useAppInForeground(): boolean {
  const [state, setState] = useState<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setState);
    return () => subscription.remove();
  }, []);
  return state === 'active';
}

export function useCameraAccess(position: CameraPosition, isActive: boolean, filter?: DeviceFilter): CameraAccess {
  const { status, hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(position, filter);
  const foreground = useAppInForeground();

  // Not asked yet: ask once, rather than report a refusal the customer never made
  const asked = useRef(false);
  useEffect(() => {
    if (canRequestPermission && !asked.current) {
      asked.current = true;
      void requestPermission();
    }
  }, [canRequestPermission, requestPermission]);

  // No camera only once the list had time to fill in
  const [deviceSettled, setDeviceSettled] = useState(false);
  useEffect(() => {
    if (!hasPermission || device) {
      setDeviceSettled(false);
      return;
    }
    const timeout = setTimeout(() => setDeviceSettled(true), DEVICE_GRACE_MS);
    return () => clearTimeout(timeout);
  }, [device, hasPermission]);

  const refused = status === 'denied' || status === 'restricted';
  return {
    device,
    hasPermission,
    isActive: isActive && foreground,
    problem: refused ? 'PERMISSION_DENIED' : hasPermission && !device && deviceSettled ? 'NO_CAMERA' : null,
  };
}

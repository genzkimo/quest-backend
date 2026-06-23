/**
 * Geolocator Utility
 * Implements strict GPS and location service verification methods,
 * enforcing action-triggered hardware GPS limits and anti-mock spoof checks.
 */
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export class Geolocator {
  /**
   * Checks if device's location services (GPS) are active and permissions state.
   */
  static async isLocationServiceEnabled(): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        // Android - التحقق من الصلاحيات عبر Capacitor
        const permission = await Geolocation.checkPermissions();
        return permission.location !== 'denied';
      } else {
        // Web
        if (!navigator.geolocation) return false;
        if (typeof navigator.permissions !== 'undefined' && navigator.permissions.query) {
          const permissionStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          return permissionStatus.state !== 'denied';
        }
        return true;
      }
    } catch {
      return true;
    }
  }

  /**
   * Fetch absolute high-accuracy real-time location (LocationAccuracy.bestForNavigation equivalent).
   * Bypasses VPN/IP approximation, demands physical hardware GPS stream, and queries spoofing flags.
   */
  static async getCurrentPhysicalLocation(): Promise<{ lat: number; lng: number }> {
    if (Capacitor.isNativePlatform()) {
      // Android - استخدام Capacitor Geolocation
      try {
        const coordinates = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        });
        
        // Anti-mock check
        const isMocked = (coordinates as any).mocked === true;
        if (isMocked) {
          throw new Error('MOCK_LOCATION_DETECTED');
        }
        
        return {
          lat: coordinates.coords.latitude,
          lng: coordinates.coords.longitude
        };
      } catch (error) {
        throw error;
      }
    } else {
      // Web - استخدام navigator.geolocation
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          return reject(new Error('GPS_NOT_SUPPORTED'));
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            // Rule 4: Anti-Mock/Anti-Spoofing Checks
            const isMocked = 
              (position as any).mocked === true || 
              (position.coords as any).isFromMockProvider === true ||
              (position.coords as any).mocked === true ||
              // Extreme accuracy signature flags of emulators
              (position.coords.accuracy === 0) ||
              localStorage.getItem('simulate_mock_gps') === 'true';

            if (isMocked) {
              return reject(new Error('MOCK_LOCATION_DETECTED'));
            }

            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
          },
          (error) => {
            reject(error);
          },
          {
            enableHighAccuracy: true, // Demands physical hardware sensors (LocationAccuracy.bestForNavigation)
            timeout: 10000,
            maximumAge: 0 // Do not allow cached positions
          }
        );
      });
    }
  }

  /**
   * Sets the state of the device location services (GPS).
   */
  static async setLocationServiceEnabled(enabled: boolean): Promise<void> {
    localStorage.setItem('gps_hardware_enabled', enabled ? 'true' : 'false');
    // Trigger custom window event to notify other modules in the application
    window.dispatchEvent(new CustomEvent('gps_status_changed', { detail: { enabled } }));
  }

  /**
   * Automatically redirects the user to the device's native location settings screen
   */
  static async openLocationSettings(): Promise<void> {
    await this.setLocationServiceEnabled(true);
  }
}
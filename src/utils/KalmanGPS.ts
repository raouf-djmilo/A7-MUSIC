/**
 * 🛰️ Athletic Kalman Filter for GPS Telemetry (Strava/Garmin Grade)
 * 
 * Provides 2D Kinematic Kalman filtering for Latitude & Longitude to eliminate
 * raw GPS noise, multipath jitter near buildings/trees, and phantom zig-zags.
 * Includes Blackout & Tunnel Guard and 3-Point Start Consensus.
 */

export interface KalmanProcessResult {
  latitude: number;
  longitude: number;
  isBlackoutRecovery: boolean;
  isWarmingUp?: boolean;
}

export class KalmanGPS {
  private lat: number = 0;
  private lng: number = 0;
  private variance: number = -1; // -1 indicates uninitialized state
  private readonly Q_METERS_PER_SECOND: number = 3.0; // Running process acceleration variance
  private lastTimestampMs: number = 0;
  private warmupFixes: { lat: number; lng: number; accuracy: number }[] = [];
  private readonly WARMUP_THRESHOLD: number = 3;

  constructor(private decayFactor: number = 1.0) {}

  /**
   * Process a new GPS fix and return the filtered, smoothed coordinate.
   * 
   * @param latMeasurement Latitude in decimal degrees
   * @param lngMeasurement Longitude in decimal degrees
   * @param accuracyMeters Horizontal accuracy in meters (radius 68% confidence)
   * @param timestampMs Fix timestamp in epoch milliseconds
   */
  public process(
    latMeasurement: number,
    lngMeasurement: number,
    accuracyMeters: number,
    timestampMs: number = Date.now()
  ): KalmanProcessResult {
    // 0. GPS Warmup Drift Guard (3-Point Consensus at start of session)
    if (this.warmupFixes.length < this.WARMUP_THRESHOLD) {
      this.warmupFixes.push({
        lat: latMeasurement,
        lng: lngMeasurement,
        accuracy: accuracyMeters,
      });

      if (this.warmupFixes.length < this.WARMUP_THRESHOLD) {
        // Still gathering warmup consensus
        this.lat = latMeasurement;
        this.lng = lngMeasurement;
        this.lastTimestampMs = timestampMs;
        return {
          latitude: this.lat,
          longitude: this.lng,
          isBlackoutRecovery: false,
          isWarmingUp: true,
        };
      }

      // Consensus reached: average the 3 points to determine the true starting centroid
      const avgLat = this.warmupFixes.reduce((sum, p) => sum + p.lat, 0) / this.warmupFixes.length;
      const avgLng = this.warmupFixes.reduce((sum, p) => sum + p.lng, 0) / this.warmupFixes.length;
      const avgAcc = this.warmupFixes.reduce((sum, p) => sum + p.accuracy, 0) / this.warmupFixes.length;

      this.lat = avgLat;
      this.lng = avgLng;
      this.variance = Math.max(avgAcc * avgAcc, 1.0);
      this.lastTimestampMs = timestampMs;

      return {
        latitude: this.lat,
        longitude: this.lng,
        isBlackoutRecovery: false,
        isWarmingUp: false,
      };
    }

    // Calculate time elapsed (dt) in seconds
    const dtSeconds = this.lastTimestampMs > 0
      ? (timestampMs - this.lastTimestampMs) / 1000
      : 0;

    // 🚀 Blackout & Tunnel Guard:
    // If dt > 8.0s (e.g. emerging from a tunnel or prolonged GPS blackout),
    // the previous kinematic state is invalid. Reset filter variance and snap directly
    // to the new measurement to prevent drawing a straight chord piercing buildings.
    if (dtSeconds > 8.0) {
      this.lat = latMeasurement;
      this.lng = lngMeasurement;
      this.variance = Math.max(accuracyMeters * accuracyMeters, 1.0);
      this.lastTimestampMs = timestampMs;
      return {
        latitude: this.lat,
        longitude: this.lng,
        isBlackoutRecovery: true,
        isWarmingUp: false,
      };
    }

    const clampedDt = Math.min(Math.max(dtSeconds, 0.1), 5.0);
    this.lastTimestampMs = timestampMs;

    // 1. Measurement variance R (proportional to squared GPS accuracy)
    const R = Math.max(accuracyMeters * accuracyMeters, 1.0);

    // 2. State prediction covariance update based on physical process noise Q
    this.variance += clampedDt * this.Q_METERS_PER_SECOND * this.Q_METERS_PER_SECOND * this.decayFactor;

    // 3. Kalman Gain K
    const K = this.variance / (this.variance + R);

    // 4. Correct coordinates toward measurement with weight K
    this.lat += K * (latMeasurement - this.lat);
    this.lng += K * (lngMeasurement - this.lng);

    // 5. Update error covariance
    this.variance = Math.max((1 - K) * this.variance, 1.0);

    return {
      latitude: this.lat,
      longitude: this.lng,
      isBlackoutRecovery: false,
      isWarmingUp: false,
    };
  }

  /**
   * Reset filter state (e.g. upon starting a new run or after prolonged pause)
   */
  public reset(): void {
    this.variance = -1;
    this.lat = 0;
    this.lng = 0;
    this.lastTimestampMs = 0;
    this.warmupFixes = [];
  }

  /**
   * Returns current filtered position, or null if uninitialized
   */
  public getCurrentPosition(): { latitude: number; longitude: number } | null {
    if (this.variance < 0 && this.warmupFixes.length === 0) return null;
    return { latitude: this.lat, longitude: this.lng };
  }
}

/**
 * High-precision Haversine formula to compute great-circle distance between two GPS coordinates in meters.
 */
export function calculateHaversineDistanceMeters(
  coord1: { latitude: number; longitude: number },
  coord2: { latitude: number; longitude: number }
): number {
  if (
    coord1.latitude === coord2.latitude &&
    coord1.longitude === coord2.longitude
  ) {
    return 0;
  }

  const R = 6371000; // Earth's mean radius in meters
  const radLat1 = (coord1.latitude * Math.PI) / 180;
  const radLat2 = (coord2.latitude * Math.PI) / 180;
  const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const dLng = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return R * c;
}

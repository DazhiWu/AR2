export class SensorManager {
    constructor() {
        this.originGPS = null;
        this.currentGPS = null;
        this.currentOrientation = { alpha: 0, beta: 0, gamma: 0 };
        this.onPositionUpdate = null;
        this.onOrientationUpdate = null;
        this.watchId = null;
    }

    async requestPermissions() {
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                return permission === 'granted';
            } catch (e) {
                console.error('陀螺仪权限请求失败:', e);
                return false;
            }
        }
        return true;
    }

    startGPS() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject('Geolocation不可用');
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.originGPS = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        alt: position.coords.altitude || 0
                    };
                    this.currentGPS = { ...this.originGPS };
                    
                    this.watchId = navigator.geolocation.watchPosition(
                        (pos) => this.handleGPSUpdate(pos),
                        (err) => console.warn('GPS错误:', err),
                        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                    );
                    
                    resolve(this.originGPS);
                },
                (err) => reject(err),
                { enableHighAccuracy: true }
            );
        });
    }

    handleGPSUpdate(position) {
        this.currentGPS = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            alt: position.coords.altitude || 0
        };

        if (this.onPositionUpdate && this.originGPS) {
            const delta = this.gpsToLocal(this.currentGPS);
            this.onPositionUpdate(delta);
        }
    }

    gpsToLocal(gps) {
        const R = 6371000;
        const lat1 = this.originGPS.lat * Math.PI / 180;
        const lat2 = gps.lat * Math.PI / 180;
        const deltaLat = (gps.lat - this.originGPS.lat) * Math.PI / 180;
        const deltaLng = (gps.lng - this.originGPS.lng) * Math.PI / 180;

        const dx = deltaLng * 111320 * Math.cos(lat1);
        const dz = -deltaLat * 111320;
        const dy = gps.alt - this.originGPS.alt;

        return { x: dx, y: dy, z: dz };
    }

    startOrientation() {
        window.addEventListener('deviceorientation', (event) => {
            this.currentOrientation = {
                alpha: event.alpha || 0,
                beta: event.beta || 0,
                gamma: event.gamma || 0
            };

            if (this.onOrientationUpdate) {
                this.onOrientationUpdate(this.currentOrientation);
            }
        });
    }

    stop() {
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
        }
    }
}

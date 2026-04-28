export class SensorManager {
    constructor() {
        this.originGPS = null;
        this.currentGPS = null;
        this.currentOrientation = { alpha: 0, beta: 0, gamma: 0 };
        this.currentAccuracy = null; // GPS精度信息
        this.onPositionUpdate = null;
        this.onOrientationUpdate = null;
        this.onAccuracyUpdate = null; // GPS精度更新回调
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

            // 高精度GPS配置
            const gpsOptions = {
                enableHighAccuracy: true,      // 请求高精度位置
                timeout: 10000,                // 10秒超时
                maximumAge: 0                  // 不使用缓存位置
            };

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
                        gpsOptions
                    );
                    
                    resolve(this.originGPS);
                },
                (err) => reject(err),
                gpsOptions
            );
        });
    }

    handleGPSUpdate(position) {
        this.currentGPS = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            alt: position.coords.altitude || 0
        };
        
        // 获取GPS精度信息
        if (position.coords.accuracy !== undefined) {
            this.currentAccuracy = position.coords.accuracy;
            if (this.onAccuracyUpdate) {
                this.onAccuracyUpdate(this.currentAccuracy);
            }
        }

        if (this.onPositionUpdate && this.originGPS) {
            const delta = this.gpsToLocal(this.currentGPS);
            this.onPositionUpdate(delta);
        }
    }

    gpsToLocal(gps) {
        const lat1 = this.originGPS.lat * Math.PI / 180;
        const deltaLat = (gps.lat - this.originGPS.lat);
        const deltaLng = (gps.lng - this.originGPS.lng);

        // 方向修正：
        // 纬度增加（向北）→ +Z（前方）
        // 经度增加（向东）→ +X（右方）
        const dx = deltaLng * 111320 * Math.cos(lat1);
        const dz = deltaLat * 111320;  // 移除负号，北方映射为+Z
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

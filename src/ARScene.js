import * as THREE from 'three';

export class ARScene {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
        this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, alpha: true, antialias: true });
        this.pipes = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.originPosition = new THREE.Vector3(0, 1.6, 0);
        this.cameraOffset = new THREE.Vector3(0, 0, 0);
        this.positionDelta = new THREE.Vector3(0, 0, 0);
        this.smoothedPosition = new THREE.Vector3(0, 1.6, 0);
        this.camera.position.copy(this.originPosition);
        this.isInitialized = false;
        this.debugMode = true;
        this.maxOffset = 50;
        this.smoothingFactor = 0.15;
        this.userMarker = null;
        
        // 锚点相关
        this.anchorGroup = new THREE.Group();
        this.anchorMarkers = [];
        this.useAnchorSystem = false; // 是否使用锚点坐标系
        
        // 触摸控制相关变量
        this.isDragging = false;
        this.previousTouch = { x: 0, y: 0 };
        this.userRotationY = 0; // 用户手动控制的 Y 轴旋转（水平方向）
        this.userRotationX = 0; // 用户手动控制的 X 轴旋转（垂直方向）
        this.useGyro = true; // 默认启用陀螺仪
        this.gyroQuaternion = null;
        this._screenOrientQuat = new THREE.Quaternion();
        this._worldQuat = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
        this._tempEuler = new THREE.Euler();
        this._tempQuat = new THREE.Quaternion();
        
        // 视角移动灵敏度
        this.rotationSensitivity = 0.005;
        
        this.init();
    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // 添加触摸事件监听
        this._setupTouchControls();
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);
        
        // ===== 调试参考坐标系 =====
        if (this.debugMode) {
            // 添加方向文字标记
            this._addDirectionLabels();
            
            // 添加距离刻度标记（每 10 米一个）
            this._addDistanceMarkers();
        }
        
        // 地面网格 (XZ平面，Y=0)
        const gridHelper = new THREE.GridHelper(100, 100, 0x44ff44, 0x222222);
        gridHelper.position.y = 0;
        this.scene.add(gridHelper);
        
        // 半透明地面平面
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x003300, 
            transparent: true, 
            opacity: 0.1,
            side: THREE.DoubleSide 
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.01;
        this.scene.add(ground);
        
        // 用户位置标记（绿色小球）
        const userMarkerGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const userMarkerMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8
        });
        this.userMarker = new THREE.Mesh(userMarkerGeometry, userMarkerMaterial);
        this.userMarker.position.copy(this.originPosition);
        this.userMarker.position.y = 0.1;
        this.scene.add(this.userMarker);
        
        window.addEventListener('resize', () => this.onResize());
    }

    initializeWorld() {
        const initialPos = new THREE.Vector3(
            this.originPosition.x + this.positionDelta.x + this.cameraOffset.x,
            this.originPosition.y + this.positionDelta.y + this.cameraOffset.y,
            this.originPosition.z + this.positionDelta.z + this.cameraOffset.z
        );
        this.smoothedPosition.copy(initialPos);
        this.camera.position.copy(initialPos);
        this.isInitialized = true;
    }

    updateCameraPosition(delta) {
        this.positionDelta.set(delta.x, delta.y, delta.z);
    }

    _applyCameraPosition() {
        const targetX = this.originPosition.x + this.positionDelta.x + this.cameraOffset.x;
        const targetY = this.originPosition.y + this.positionDelta.y + this.cameraOffset.y;
        const targetZ = this.originPosition.z + this.positionDelta.z + this.cameraOffset.z;
        
        this.smoothedPosition.x += (targetX - this.smoothedPosition.x) * this.smoothingFactor;
        this.smoothedPosition.y += (targetY - this.smoothedPosition.y) * this.smoothingFactor;
        this.smoothedPosition.z += (targetZ - this.smoothedPosition.z) * this.smoothingFactor;
        
        this.camera.position.copy(this.smoothedPosition);
        
        if (this.userMarker) {
            this.userMarker.position.x = this.smoothedPosition.x;
            this.userMarker.position.z = this.smoothedPosition.z;
            this.userMarker.position.y = 0.1;
        }
    }

    setCameraOffset(x, y, z) {
        this.cameraOffset.set(x, y, z);
        this._applyCameraPosition();
    }

    resetCameraOffset() {
        this.cameraOffset.set(0, 0, 0);
        this._applyCameraPosition();
    }

    updateCameraOrientation(orientation) {
        if (!this.useGyro) {
            return;
        }

        const alpha = THREE.MathUtils.degToRad(orientation.alpha);
        const beta = THREE.MathUtils.degToRad(orientation.beta);
        const gamma = THREE.MathUtils.degToRad(orientation.gamma);

        this._tempEuler.set(beta, alpha, -gamma, 'YXZ');
        this._tempQuat.setFromEuler(this._tempEuler);
        this._tempQuat.multiply(this._worldQuat);

        const screenOrient = window.screen.orientation
            ? window.screen.orientation.angle
            : (window.orientation || 0);
        this._screenOrientQuat.setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            -THREE.MathUtils.degToRad(screenOrient)
        );
        this._tempQuat.multiply(this._screenOrientQuat);

        this.gyroQuaternion = this._tempQuat.clone();
        this._updateCameraFromControls();
    }

    createPipe(pipeData) {
        const points = pipeData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
        const curve = new THREE.CatmullRomCurve3(points);
        const geometry = new THREE.TubeGeometry(curve, 64, pipeData.radius, 8, false);
        
        const material = new THREE.MeshPhongMaterial({
            color: pipeData.color,
            transparent: true,
            opacity: 0.8,
            shininess: 100
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { pipeInfo: pipeData.info };
        this.scene.add(mesh);
        this.pipes.push(mesh);
    }

    handleTouch(event, callback) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.pipes);

        if (intersects.length > 0) {
            callback(intersects[0].object.userData.pipeInfo);
        }
    }

    render() {
        if (this.isInitialized) {
            this._applyCameraPosition();
        }
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    _addDistanceMarkers() {
        const distances = [10, 20, 30, 40, 50];
        const colors = [0xffff00, 0xff8800, 0xff0088, 0x8800ff, 0x00ffff];
        
        distances.forEach((dist, i) => {
            this._createDistanceMarker(0, dist, colors[i], `${dist}米北`);
        });
        
        distances.forEach((dist, i) => {
            this._createDistanceMarker(-dist, 0, colors[i], `${dist}米东`);
        });
        
        distances.forEach((dist, i) => {
            this._createDistanceMarker(0, -dist, colors[i], `${dist}米南`);
        });
        
        distances.forEach((dist, i) => {
            this._createDistanceMarker(dist, 0, colors[i], `${dist}米西`);
        });
    }

    _createDistanceMarker(x, z, color, label) {
        const geometry = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16);
        const material = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.7
        });
        const marker = new THREE.Mesh(geometry, material);
        marker.position.set(x, 0.05, z);
        this.scene.add(marker);
    }

    _createTextSprite(text, color = '#ffffff', size = 64) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        
        context.clearRect(0, 0, 256, 256);
        
        context.font = 'bold 100px Arial';
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 128, 128);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(3, 3, 1);
        
        return sprite;
    }

    _addDirectionLabels() {
        const northLabel = this._createTextSprite('N', '#ff0000');
        northLabel.position.set(0, 1.5, 20);
        this.scene.add(northLabel);
        
        const southLabel = this._createTextSprite('S', '#00ff00');
        southLabel.position.set(0, 1.5, -20);
        this.scene.add(southLabel);
        
        const eastLabel = this._createTextSprite('E', '#ff0000');
        eastLabel.position.set(-20, 1.5, 0);
        this.scene.add(eastLabel);
        
        const westLabel = this._createTextSprite('W', '#ff0000');
        westLabel.position.set(20, 1.5, 0);
        this.scene.add(westLabel);
    }

    _setupTouchControls() {
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.isDragging = true;
                this.previousTouch.x = e.touches[0].clientX;
                this.previousTouch.y = e.touches[0].clientY;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (this.isDragging && e.touches.length === 1) {
                const deltaX = e.touches[0].clientX - this.previousTouch.x;
                const deltaY = e.touches[0].clientY - this.previousTouch.y;

                this.userRotationY -= deltaX * this.rotationSensitivity;
                this.userRotationX -= deltaY * this.rotationSensitivity;

                this.userRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.userRotationX));

                this.previousTouch.x = e.touches[0].clientX;
                this.previousTouch.y = e.touches[0].clientY;

                this._updateCameraFromControls();
            }
            e.preventDefault();
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('touchcancel', (e) => {
            this.isDragging = false;
        });
    }

    _updateCameraFromControls() {
        if (this.useGyro && this.gyroQuaternion) {
            const q = this.gyroQuaternion.clone();

            const userEuler = new THREE.Euler(this.userRotationX, this.userRotationY, 0, 'YXZ');
            const userQuat = new THREE.Quaternion().setFromEuler(userEuler);
            q.multiply(userQuat);

            this.camera.quaternion.copy(q);
        } else {
            const euler = new THREE.Euler(this.userRotationX, this.userRotationY, 0, 'YXZ');
            this.camera.setRotationFromEuler(euler);
        }
    }

    setGyroEnabled(enabled) {
        this.useGyro = enabled;
        if (!enabled) {
            this.gyroQuaternion = null;
        }
        this._updateCameraFromControls();
    }

    resetUserRotation() {
        this.userRotationX = 0;
        this.userRotationY = 0;
        this._updateCameraFromControls();
    }

    getCameraRotation() {
        const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        return {
            x: THREE.MathUtils.radToDeg(euler.x),
            y: THREE.MathUtils.radToDeg(euler.y),
            z: THREE.MathUtils.radToDeg(euler.z)
        };
    }

    isGyroEnabled() {
        return this.useGyro;
    }

    // ===== 锚点相关方法 =====
    addAnchorMarker(anchorData) {
        const markerGroup = new THREE.Group();

        const baseGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const baseMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffcc00,
            transparent: true,
            opacity: 0.9
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 0.3;
        markerGroup.add(base);

        const poleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2, 8);
        const poleMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.y = 1.3;
        markerGroup.add(pole);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 256;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 180px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(anchorData.id.toString(), 128, 128);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.y = 2.5;
        sprite.scale.set(1, 1, 1);
        markerGroup.add(sprite);

        markerGroup.position.set(anchorData.localX, 0, anchorData.localZ);
        markerGroup.userData = { anchorId: anchorData.id, anchorData: anchorData };

        this.anchorGroup.add(markerGroup);
        this.anchorMarkers.push(markerGroup);
        this.scene.add(this.anchorGroup);

        console.log('[ARScene] 锚点标记已添加:', anchorData.id);
    }

    clearAnchorMarkers() {
        this.anchorMarkers.forEach(marker => {
            this.anchorGroup.remove(marker);
        });
        this.anchorMarkers = [];
    }

    enableAnchorSystem() {
        this.useAnchorSystem = true;
        console.log('[ARScene] 锚点坐标系已启用');
    }

    disableAnchorSystem() {
        this.useAnchorSystem = false;
        console.log('[ARScene] 锚点坐标系已禁用');
    }

    updatePositionFromAnchorSystem(localX, localY, localZ) {
        this.positionDelta.set(localX, 0, localZ);
    }

    generatePipesFromGeoJSON(geoJSONData, originLng, originLat, anchorManager = null) {
        const colorMap = {
            '供水管道': 0x00aaff,
            '燃气管道': 0xffaa00,
            '污水管道': 0x666666,
            '雨水管道': 0x4488ff,
            '电力管道': 0xff0000,
            '通信管道': 0x00ff00,
            '热力管道': 0xff4444,
            '工业用水': 0x00ffff,
            '综合管廊': 0x888844,
            '其他': 0x888888
        };

        geoJSONData.forEach((feature, index) => {
            const properties = feature.properties;
            const geoJSONGeometry = feature.geometry;

            if (!geoJSONGeometry || geoJSONGeometry.type !== 'LineString' || !geoJSONGeometry.coordinates || geoJSONGeometry.coordinates.length < 2) {
                return;
            }

            let points;
            
            if (anchorManager && anchorManager.isReady()) {
                points = geoJSONGeometry.coordinates.map(([lng, lat]) => {
                    const local = anchorManager.gpsToAnchorSystem(lat, lng, 0);
                    return new THREE.Vector3(local.x, 0.2, local.z);
                });
            } else {
                points = geoJSONGeometry.coordinates.map(([lng, lat]) => {
                    const dLng = -(lng - originLng) * 111320 * Math.cos(originLat * Math.PI / 180);
                    const dLat = (lat - originLat) * 111320;
                    return new THREE.Vector3(dLng, 0.2, dLat);
                });
            }

            const curve = new THREE.CatmullRomCurve3(points);
            
            let radius = 0.1;
            if (properties.gj) {
                const gj = parseFloat(properties.gj);
                if (!isNaN(gj)) {
                    radius = gj / 2000;
                }
            }

            const tubeGeometry = new THREE.TubeGeometry(curve, 64, radius, 8, false);
            let color = colorMap[properties.gdlx] || colorMap['其他'];
            const material = new THREE.MeshPhongMaterial({
                color: color,
                transparent: true,
                opacity: 0.8,
                shininess: 100
            });

            const mesh = new THREE.Mesh(tubeGeometry, material);
            
            const startCoord = geoJSONGeometry.coordinates[0];
            const endCoord = geoJSONGeometry.coordinates[geoJSONGeometry.coordinates.length - 1];
            
            mesh.userData.pipeInfo = {
                gxbh: properties.gxbh || properties.qdbh || `P${index + 1}`,
                gdlx: properties.gdlx || '未知',
                cz: properties.cz || '未知',
                gj: properties.gj ? `${properties.gj}mm` : '未知',
                gxcd: properties.gxcd ? `${properties.gxcd}m` : '未知',
                startLng: startCoord[0],
                startLat: startCoord[1],
                endLng: endCoord[0],
                endLat: endCoord[1]
            };

            this.scene.add(mesh);
            this.pipes.push(mesh);
        });
    }
}

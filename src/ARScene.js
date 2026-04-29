import * as THREE from 'three';

export class ARScene {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.scene = new THREE.Scene();
        // 优化相机FOV（视场角）到60度，提供更自然的距离感知
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
        this.smoothingFactor = 0.15; // 平滑因子（0-1），值越小越平滑
        this.userMarker = null;
        
        // 触摸控制相关变量
        this.isDragging = false;
        this.previousTouch = { x: 0, y: 0 };
        this.userRotationY = 0; // 用户手动控制的Y轴旋转
        this.userRotationX = 0; // 用户手动控制的X轴旋转
        this.useGyro = true; // 是否使用陀螺仪
        this.gyroYaw = 0; // 陀螺仪的Y轴旋转
        this.gyroPitch = 0; // 陀螺仪的X轴旋转
        
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
        ground.rotation.x = -Math.PI / 2; // 旋转到XZ平面
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
        this.userMarker.position.y = 0.1; // 稍微高于地面
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
        // 计算目标位置
        const targetX = this.originPosition.x + this.positionDelta.x + this.cameraOffset.x;
        const targetY = this.originPosition.y + this.positionDelta.y + this.cameraOffset.y;
        const targetZ = this.originPosition.z + this.positionDelta.z + this.cameraOffset.z;
        
        // 平滑移动（线性插值）
        this.smoothedPosition.x += (targetX - this.smoothedPosition.x) * this.smoothingFactor;
        this.smoothedPosition.y += (targetY - this.smoothedPosition.y) * this.smoothingFactor;
        this.smoothedPosition.z += (targetZ - this.smoothedPosition.z) * this.smoothingFactor;
        
        // 应用平滑后的位置到相机
        this.camera.position.copy(this.smoothedPosition);
        
        // 更新用户位置标记
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

        const alpha = orientation.alpha * Math.PI / 180;
        const beta = orientation.beta * Math.PI / 180;

        // 保存陀螺仪数据
        this.gyroYaw = alpha;  // 方位角
        this.gyroPitch = -Math.PI / 2 + beta;  // 从俯视逐渐转到正视

        // 更新相机姿态
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

    generatePipesFromGeoJSON(geoJSONData, originLng, originLat) {
        // 根据管线类型定义颜色
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

            // 转换经纬度坐标到本地坐标系（与 SensorManager 保持一致）
            const points = geoJSONGeometry.coordinates.map(([lng, lat]) => {
                const dLng = (lng - originLng) * 111320 * Math.cos(originLat * Math.PI / 180);
                const dLat = (lat - originLat) * 111320; // 方向修正：移除负号
                return new THREE.Vector3(dLng, 0.2, dLat); // y=0.2 表示埋深
            });

            // 创建曲线
            const curve = new THREE.CatmullRomCurve3(points);
            
            // 计算管径，默认 0.1 米
            let radius = 0.1;
            if (properties.gj) {
                const gj = parseFloat(properties.gj);
                if (!isNaN(gj)) {
                    radius = gj / 2000; // 将 mm 转换为米半径
                }
            }

            // 创建管道几何体
            const tubeGeometry = new THREE.TubeGeometry(curve, 64, radius, 8, false);

            // 获取颜色
            let color = colorMap[properties.gdlx] || colorMap['其他'];

            // 创建材质
            const material = new THREE.MeshPhongMaterial({
                color: color,
                transparent: true,
                opacity: 0.8,
                shininess: 100
            });

            // 创建网格
            const mesh = new THREE.Mesh(tubeGeometry, material);
            
            // 保存原始管点坐标
            const startCoord = geoJSONGeometry.coordinates[0];
            const endCoord = geoJSONGeometry.coordinates[geoJSONGeometry.coordinates.length - 1];
            
            // 保存属性信息
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

            // 添加到场景和管线列表
            this.scene.add(mesh);
            this.pipes.push(mesh);
        });
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
        // 在四个主要方向添加距离刻度标记
        const distances = [10, 20, 30, 40, 50]; // 米
        const colors = [0xffff00, 0xff8800, 0xff0088, 0x8800ff, 0x00ffff];
        
        // 向北方向（+Z）- 黄色到青色渐变
        distances.forEach((dist, i) => {
            this._createDistanceMarker(0, dist, colors[i], `${dist}米北`);
        });
        
        // 向东方向（+X）
        distances.forEach((dist, i) => {
            this._createDistanceMarker(dist, 0, colors[i], `${dist}米东`);
        });
        
        // 向南方向（-Z）
        distances.forEach((dist, i) => {
            this._createDistanceMarker(0, -dist, colors[i], `${dist}米南`);
        });
        
        // 向西方向（-X）
        distances.forEach((dist, i) => {
            this._createDistanceMarker(-dist, 0, colors[i], `${dist}米西`);
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
        // 创建 Canvas 绘制文字
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        
        // 绘制背景（透明）
        context.clearRect(0, 0, 256, 256);
        
        // 绘制文字
        context.font = 'bold 100px Arial';
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 128, 128);
        
        // 创建纹理
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true
        });
        const sprite = new THREE.Sprite(material);
        
        // 设置 Sprite 大小
        sprite.scale.set(3, 3, 1);
        
        return sprite;
    }

    _addDirectionLabels() {
        // 北方 (N) - +Z 方向，红色（与 Z 轴蓝色区分）
        const northLabel = this._createTextSprite('N', '#ff0000');
        northLabel.position.set(0, 1.5, 20);
        this.scene.add(northLabel);
        
        // 南方 (S) - -Z 方向，绿色
        const southLabel = this._createTextSprite('S', '#00ff00');
        southLabel.position.set(0, 1.5, -20);
        this.scene.add(southLabel);
        
        // 东方 (E) - +X 方向，红色（与 X 轴颜色一致）
        const eastLabel = this._createTextSprite('E', '#ff0000');
        eastLabel.position.set(20, 1.5, 0);
        this.scene.add(eastLabel);
        
        // 西方 (W) - -X 方向，红色（与 X 轴颜色一致）
        const westLabel = this._createTextSprite('W', '#ff0000');
        westLabel.position.set(-20, 1.5, 0);
        this.scene.add(westLabel);
    }

    _setupTouchControls() {
        // 触摸开始
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.isDragging = true;
                this.previousTouch.x = e.touches[0].clientX;
                this.previousTouch.y = e.touches[0].clientY;
            }
        }, { passive: false });

        // 触摸移动
        this.canvas.addEventListener('touchmove', (e) => {
            if (this.isDragging && e.touches.length === 1) {
                const deltaX = e.touches[0].clientX - this.previousTouch.x;
                const deltaY = e.touches[0].clientY - this.previousTouch.y;

                // 更新用户旋转角度
                this.userRotationY -= deltaX * 0.01; // Y轴旋转（左右）
                this.userRotationX -= deltaY * 0.01; // X轴旋转（上下）

                // 限制X轴旋转范围
                this.userRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.userRotationX));

                this.previousTouch.x = e.touches[0].clientX;
                this.previousTouch.y = e.touches[0].clientY;

                // 更新相机姿态
                this._updateCameraFromControls();
            }
            e.preventDefault();
        }, { passive: false });

        // 触摸结束
        this.canvas.addEventListener('touchend', (e) => {
            this.isDragging = false;
        });

        // 触摸取消
        this.canvas.addEventListener('touchcancel', (e) => {
            this.isDragging = false;
        });
    }

    _updateCameraFromControls() {
        // 计算最终旋转角度：用户控制 + 陀螺仪数据
        let finalYaw, finalPitch;

        if (this.useGyro) {
            // 使用用户控制覆盖陀螺仪
            finalYaw = this.gyroYaw + this.userRotationY;
            finalPitch = this.gyroPitch + this.userRotationX;
        } else {
            // 仅使用用户控制
            finalYaw = this.userRotationY;
            finalPitch = this.userRotationX;
        }

        // 限制俯仰角范围
        finalPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, finalPitch));

        // 应用旋转
        const euler = new THREE.Euler(finalPitch, finalYaw, 0, 'YXZ');
        this.camera.setRotationFromEuler(euler);
    }

    setGyroEnabled(enabled) {
        this.useGyro = enabled;
        if (!enabled) {
            // 如果禁用陀螺仪，重置陀螺仪数据
            this.gyroYaw = 0;
            this.gyroPitch = 0;
        }
        this._updateCameraFromControls();
    }

    // 获取触摸旋转角度（弧度转度数，不叠加陀螺仪）
    getCameraRotation() {
        return {
            x: this.userRotationX * (180 / Math.PI),
            y: this.userRotationY * (180 / Math.PI),
            z: 0
        };
    }
}

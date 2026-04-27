import * as THREE from 'three';

export class ARScene {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas: canvasElement, alpha: true, antialias: true });
        this.pipes = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.originPosition = new THREE.Vector3(0, 1.6, 0);
        this.cameraOffset = new THREE.Vector3(0, 0, 0);
        this.positionDelta = new THREE.Vector3(0, 0, 0);
        this.camera.position.copy(this.originPosition);
        this.isInitialized = false;
        this.debugMode = true;
        this.maxOffset = 50;
        
        this.init();
    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);
        
        // ===== 调试参考坐标系 =====
        if (this.debugMode) {
            // 坐标轴辅助线 (X:红, Y:绿, Z:蓝)
            const axesHelper = new THREE.AxesHelper(20);
            this.scene.add(axesHelper);
            
            // 红色球体表示北方 (0,0,-20)
            const northMarker = new THREE.Mesh(
                new THREE.SphereGeometry(1),
                new THREE.MeshBasicMaterial({ color: 0xff0000 })
            );
            northMarker.position.set(0, 0, -20);
            this.scene.add(northMarker);
            
            // 蓝色球体表示东方 (20,0,0)
            const eastMarker = new THREE.Mesh(
                new THREE.SphereGeometry(0.8),
                new THREE.MeshBasicMaterial({ color: 0x0000ff })
            );
            eastMarker.position.set(20, 0, 0);
            this.scene.add(eastMarker);
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
        
        window.addEventListener('resize', () => this.onResize());
    }

    initializeWorld() {
        this.camera.position.copy(this.originPosition);
        this.isInitialized = true;
    }

    updateCameraPosition(delta) {
        this.positionDelta.set(delta.x, delta.y, delta.z);
        this._applyCameraPosition();
    }

    _applyCameraPosition() {
        this.camera.position.x = this.originPosition.x + this.positionDelta.x + this.cameraOffset.x;
        this.camera.position.y = this.originPosition.y + this.positionDelta.y + this.cameraOffset.y;
        this.camera.position.z = this.originPosition.z + this.positionDelta.z + this.cameraOffset.z;
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
        const alpha = orientation.alpha * Math.PI / 180;
        const beta = orientation.beta * Math.PI / 180;
        const gamma = orientation.gamma * Math.PI / 180;

        // 直接构造所需的相机姿态
        // 我们想要：
        // 1. 先让相机向下看地面 (pitch = -90°)
        // 2. 然后根据 beta 角度将相机向上抬起 (β 0° -> 俯视, β 90° -> 正视)
        // 3. 然后根据 alpha 角度进行方位旋转
        // 4. 最后处理 gamma 横滚角度
        
        // 首先，设置基础的欧拉角，使用 YXZ 顺序
        const cameraPitch = -Math.PI / 2 + beta;  // 从俯视逐渐转到正视
        const cameraYaw = alpha;  // 方位角就是 alpha
        const cameraRoll = -gamma;  // 横滚角取反
        
        const euler = new THREE.Euler(cameraPitch, cameraYaw, cameraRoll, 'YXZ');
        
        this.camera.setRotationFromEuler(euler);
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

            // 转换经纬度坐标到本地坐标系
            const points = geoJSONGeometry.coordinates.map(([lng, lat]) => {
                const dLng = (lng - originLng) * 111320 * Math.cos(originLat * Math.PI / 180);
                const dLat = -(lat - originLat) * 111320;
                return new THREE.Vector3(dLng, -1.2, dLat); // y=-1.2 表示埋深
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
            
            // 保存属性信息
            mesh.userData.pipeInfo = {
                gxbh: properties.gxbh || properties.qdbh || `P${index + 1}`,
                gdlx: properties.gdlx || '未知',
                cz: properties.cz || '未知',
                gj: properties.gj ? `${properties.gj}mm` : '未知',
                gxcd: properties.gxcd ? `${properties.gxcd}m` : '未知'
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
}

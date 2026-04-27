import { QRScanner } from './src/QRScanner';
import { SensorManager } from './src/SensorManager';
import { ARScene } from './src/ARScene';

let qrScanner = null;
let sensorManager = null;
let arScene = null;
let originGPS = { lat: 39.9042, lng: 116.4074 };
let gyroEnabled = false; // 先禁用陀螺仪测试场景

async function initCamera() {
    const video = document.getElementById('camera-video');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        video.srcObject = stream;
        return new Promise(resolve => {
            video.onloadedmetadata = () => resolve(video);
        });
    } catch (e) {
        console.error('摄像头初始化失败:', e);
        alert('请允许摄像头权限');
        throw e;
    }
}

function initQRScanner(video) {
    const canvas = document.getElementById('qr-canvas');
    qrScanner = new QRScanner(video, canvas);
    
    qrScanner.onQRDetected = (code) => {
        if (code.data === 'INIT_PIPE_AR') {
            console.log('二维码检测成功');
            qrScanner.stopScanning();
            document.getElementById('qr-overlay').classList.add('hidden');
            initializeAR();
        }
    };
    
    qrScanner.startScanning();
}

async function initializeAR() {
    arScene.initializeWorld();
    document.getElementById('sensor-panel').classList.remove('hidden');
    document.getElementById('debug-panel').classList.remove('hidden');
    document.getElementById('offset-panel').classList.remove('hidden');

    try {
        originGPS = await sensorManager.startGPS();
        document.getElementById('gps-status').textContent = '已连接';
    } catch (e) {
        console.warn('使用默认GPS位置');
        document.getElementById('gps-status').textContent = '模拟';
    }

    // 加载并解析 GeoJSONL 数据
    try {
        console.log('正在加载管线数据...');
        const response = await fetch('highway.geojsonl.json');
        const text = await response.text();
        const lines = text.trim().split('\n').filter(line => line.trim());
        const geoJSONData = lines.map(line => JSON.parse(line));
        console.log(`成功加载 ${geoJSONData.length} 条管线数据`);
        
        // 生成管线
        arScene.generatePipesFromGeoJSON(geoJSONData, originGPS.lng, originGPS.lat);
    } catch (e) {
        console.error('加载管线数据失败:', e);
        alert('加载管线数据失败，请检查控制台输出');
    }

    sensorManager.startOrientation();
    document.getElementById('gyro-status').textContent = '已连接';

    setupDebugControls();
    setupOffsetControls();

    animate();
}

function setupDebugControls() {
    // 视角向下看地面
    document.getElementById('debug-down').addEventListener('click', () => {
        arScene.camera.rotation.set(-Math.PI / 2, 0, 0); // 向下看
    });
    
    // 视角向前看
    document.getElementById('debug-forward').addEventListener('click', () => {
        arScene.camera.rotation.set(0, 0, 0); // 向前看
    });
    
    // 切换陀螺仪
    document.getElementById('debug-toggle-gyro').addEventListener('click', () => {
        gyroEnabled = !gyroEnabled;
        document.getElementById('debug-toggle-gyro').textContent = 
            gyroEnabled ? '关闭陀螺仪' : '开启陀螺仪';
    });
}

let currentOffset = { x: 0, y: 0, z: 0 };
let currentPositionDelta = { x: 0, y: 0, z: 0 };
const offsetStep = 1; // 每次点击偏移 1 米

function setupOffsetControls() {
    // 前 (Z轴负方向)
    document.getElementById('offset-forward').addEventListener('click', () => {
        currentOffset.z -= offsetStep;
        updateOffset();
    });
    
    // 后 (Z轴正方向)
    document.getElementById('offset-back').addEventListener('click', () => {
        currentOffset.z += offsetStep;
        updateOffset();
    });
    
    // 左 (X轴负方向)
    document.getElementById('offset-left').addEventListener('click', () => {
        currentOffset.x -= offsetStep;
        updateOffset();
    });
    
    // 右 (X轴正方向)
    document.getElementById('offset-right').addEventListener('click', () => {
        currentOffset.x += offsetStep;
        updateOffset();
    });
    
    // 重置
    document.getElementById('offset-reset').addEventListener('click', () => {
        currentOffset = { x: 0, y: 0, z: 0 };
        arScene.resetCameraOffset();
        updateOffsetDisplay();
    });
}

function updateOffset() {
    arScene.setCameraOffset(currentOffset.x, currentOffset.y, currentOffset.z);
    arScene.updateCameraPosition(currentPositionDelta);
    updateOffsetDisplay();
}

function updateOffsetDisplay() {
    document.getElementById('offset-x').textContent = currentOffset.x.toFixed(1);
    document.getElementById('offset-y').textContent = currentOffset.y.toFixed(1);
    document.getElementById('offset-z').textContent = currentOffset.z.toFixed(1);
}

function animate() {
    requestAnimationFrame(animate);
    arScene.render();
}

function setupUIEvents() {
    document.getElementById('three-canvas').addEventListener('touchstart', (e) => {
        e.preventDefault();
        arScene.handleTouch(e, (pipeInfo) => showPipeInfo(pipeInfo));
    });
    
    document.getElementById('pipe-info-close').addEventListener('click', hidePipeInfo);
}

function showPipeInfo(info) {
    const panel = document.getElementById('pipe-info');
    const content = document.getElementById('pipe-info-content');

    content.innerHTML = `
        <p><strong>管段编号:</strong> ${info.gxbh}</p>
        <p><strong>类型:</strong> ${info.gdlx}</p>
        <p><strong>材质:</strong> ${info.cz}</p>
        <p><strong>口径:</strong> ${info.gj}</p>
        <p><strong>长度:</strong> ${info.gxcd}</p>
    `;

    panel.classList.remove('hidden');
}

function hidePipeInfo() {
    document.getElementById('pipe-info').classList.add('hidden');
}

async function startApp() {
    document.getElementById('start-screen').classList.add('hidden');
    
    const hasPermission = await sensorManager.requestPermissions();
    if (!hasPermission) {
        alert('需要陀螺仪权限');
        return;
    }
    
    const video = await initCamera();
    initQRScanner(video);
}

window.addEventListener('DOMContentLoaded', () => {
    sensorManager = new SensorManager();
    arScene = new ARScene(document.getElementById('three-canvas'));
    setupUIEvents();
    
    sensorManager.onPositionUpdate = (delta) => {
        currentPositionDelta = delta;
        arScene.updateCameraPosition(delta);
        document.getElementById('lat-value').textContent = sensorManager.currentGPS.lat.toFixed(6);
        document.getElementById('lng-value').textContent = sensorManager.currentGPS.lng.toFixed(6);
        document.getElementById('pos-x').textContent = delta.x.toFixed(2);
        document.getElementById('pos-z').textContent = delta.z.toFixed(2);
    };
    
    sensorManager.onOrientationUpdate = (orientation) => {
        // 更新调试显示
        document.getElementById('gyro-data').textContent = 
            `陀螺仪：α=${orientation.alpha.toFixed(1)} β=${orientation.beta.toFixed(1)} γ=${orientation.gamma.toFixed(1)}`;
        
        // 仅在启用时应用
        if (gyroEnabled) {
            arScene.updateCameraOrientation(orientation);
        }
    };
    
    document.getElementById('start-btn').addEventListener('click', startApp);
});

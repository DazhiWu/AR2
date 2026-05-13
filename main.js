import { SensorManager } from './src/SensorManager';
import { ARScene } from './src/ARScene';
import { AnchorManager } from './src/AnchorManager';

let sensorManager = null;
let arScene = null;
let anchorManager = null;
let originGPS = { lat: 39.9042, lng: 116.4074 };
let gyroEnabled = true;
let currentGeoJSONData = null;

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

async function initializeAR() {
    arScene.initializeWorld();

    try {
        originGPS = await sensorManager.startGPS();
        document.getElementById('gps-status').textContent = '已连接';
    } catch (e) {
        console.warn('使用默认 GPS 位置');
        document.getElementById('gps-status').textContent = '模拟';
    }

    try {
        console.log('正在加载管线数据...');
        const response = await fetch('highway.geojsonl.json');
        const text = await response.text();
        const lines = text.trim().split('\n').filter(line => line.trim());
        currentGeoJSONData = lines.map(line => JSON.parse(line));
        console.log(`成功加载 ${currentGeoJSONData.length} 条管线数据`);
        
        arScene.generatePipesFromGeoJSON(currentGeoJSONData, originGPS.lng, originGPS.lat, anchorManager);
    } catch (e) {
        console.error('加载管线数据失败:', e);
        alert('加载管线数据失败，请检查控制台输出');
    }

    sensorManager.startOrientation();
    document.getElementById('gyro-status').textContent = '已连接';

    setupDebugControls();
    setupOffsetControls();
    setupAnchorControls();

    animate();
}

function reinitializePipes() {
    // 清除现有管线
    arScene.pipes.forEach(pipe => {
        arScene.scene.remove(pipe);
    });
    arScene.pipes = [];
    
    // 重新生成管线
    if (currentGeoJSONData && originGPS) {
        console.log('使用锚点坐标系重新生成管线...');
        arScene.generatePipesFromGeoJSON(currentGeoJSONData, originGPS.lng, originGPS.lat, anchorManager);
    }
}

function setupAnchorControls() {
    // 添加锚点按钮
    document.getElementById('btn-add-anchor').addEventListener('click', () => {
        if (sensorManager.currentGPS) {
            const anchor = anchorManager.addAnchor(
                sensorManager.currentGPS.lat,
                sensorManager.currentGPS.lng,
                sensorManager.currentGPS.alt || 0
            );
            updateAnchorUI();
            console.log('锚点已添加:', anchor);
        } else {
            alert('GPS信号未就绪，请稍候...');
        }
    });

    // 移除最后一个锚点
    document.getElementById('btn-remove-anchor').addEventListener('click', () => {
        anchorManager.removeLastAnchor();
        arScene.clearAnchorMarkers();
        anchorManager.getAnchors().forEach(anchor => {
            arScene.addAnchorMarker(anchor);
        });
        updateAnchorUI();
    });

    // 清除所有锚点
    document.getElementById('btn-clear-anchors').addEventListener('click', () => {
        anchorManager.clearAnchors();
        arScene.clearAnchorMarkers();
        arScene.disableAnchorSystem();
        updateAnchorUI();
        // 重新初始化管线（使用原始坐标系）
        reinitializePipes();
    });

    // 标定按钮
    document.getElementById('btn-calibrate').addEventListener('click', () => {
        if (anchorManager.calibrate()) {
            // 启用锚点坐标系
            arScene.enableAnchorSystem();
            
            // 更新锚点标记位置
            arScene.clearAnchorMarkers();
            anchorManager.getAnchors().forEach(anchor => {
                arScene.addAnchorMarker(anchor);
            });
            
            // 重新初始化管线（使用锚点坐标系）
            reinitializePipes();
            
            updateAnchorUI();
            alert('标定成功！已启用锚点坐标系。');
        }
    });
}

function updateAnchorUI() {
    const count = anchorManager.getAnchorCount();
    const anchorCountEl = document.getElementById('anchor-count');
    const anchorStatusEl = document.getElementById('anchor-status');
    const calibrateSection = document.getElementById('calibrate-section');
    const anchorList = document.getElementById('anchor-list');
    
    anchorCountEl.textContent = `(${count}/3)`;
    
    // 更新状态
    if (anchorManager.isReady()) {
        anchorStatusEl.textContent = '已标定，锚点坐标系已启用';
        anchorStatusEl.style.color = '#4CAF50';
    } else if (count >= 3) {
        anchorStatusEl.textContent = '请点击开始标定按钮';
        anchorStatusEl.style.color = '#FF9800';
    } else if (count > 0) {
        anchorStatusEl.textContent = `还需添加 ${3 - count} 个锚点`;
        anchorStatusEl.style.color = '#2196F3';
    } else {
        anchorStatusEl.textContent = '请至少添加3个锚点进行标定';
        anchorStatusEl.style.color = '#666';
    }
    
    // 显示/隐藏标定按钮
    calibrateSection.style.display = (count >= 3 && !anchorManager.isReady()) ? 'block' : 'none';
    
    // 更新锚点列表
    anchorList.innerHTML = '';
    anchorManager.getAnchors().forEach((anchor, index) => {
        const item = document.createElement('div');
        item.className = 'anchor-item';
        item.innerHTML = `
            <div class="anchor-id">锚点 ${anchor.id}</div>
            <div class="anchor-coords">
                ${anchor.gpsLat.toFixed(6)}, ${anchor.gpsLng.toFixed(6)}
            </div>
            <div class="anchor-local" style="font-size: 0.8em; color: #888;">
                本地: (${anchor.localX.toFixed(1)}, ${anchor.localY.toFixed(1)}, ${anchor.localZ.toFixed(1)})
            </div>
        `;
        anchorList.appendChild(item);
    });
}

function setupDebugControls() {
    document.getElementById('debug-reset-rotation').addEventListener('click', () => {
        arScene.resetUserRotation();
    });
    
    document.getElementById('debug-toggle-gyro').addEventListener('click', () => {
        gyroEnabled = !gyroEnabled;
        arScene.setGyroEnabled(gyroEnabled);
        document.getElementById('debug-toggle-gyro').textContent = 
            gyroEnabled ? '关闭陀螺仪' : '开启陀螺仪';
    });
    
    document.getElementById('debug-toggle-anchor-panel').addEventListener('click', () => {
        const anchorPanel = document.getElementById('anchor-panel');
        anchorPanel.classList.toggle('hidden');
        document.getElementById('debug-toggle-anchor-panel').textContent = 
            anchorPanel.classList.contains('hidden') ? '锚点标定' : '隐藏面板';
    });
    
    arScene.setGyroEnabled(true);
}

let currentOffset = { x: 0, y: 0, z: 0 };
const offsetStep = 1;

function setupOffsetControls() {
    document.getElementById('offset-forward').addEventListener('click', () => {
        currentOffset.z += offsetStep;
        updateOffset();
    });
    
    document.getElementById('offset-back').addEventListener('click', () => {
        currentOffset.z -= offsetStep;
        updateOffset();
    });
    
    document.getElementById('offset-left').addEventListener('click', () => {
        currentOffset.x -= offsetStep;
        updateOffset();
    });
    
    document.getElementById('offset-right').addEventListener('click', () => {
        currentOffset.x += offsetStep;
        updateOffset();
    });
    
    document.getElementById('offset-reset').addEventListener('click', () => {
        currentOffset = { x: 0, y: 0, z: 0 };
        arScene.resetCameraOffset();
        updateOffsetDisplay();
    });
}

function updateOffset() {
    arScene.setCameraOffset(currentOffset.x, currentOffset.y, currentOffset.z);
    updateOffsetDisplay();
}

function updateOffsetDisplay() {
    document.getElementById('offset-x').textContent = currentOffset.x.toFixed(1);
    document.getElementById('offset-y').textContent = currentOffset.y.toFixed(1);
    document.getElementById('offset-z').textContent = currentOffset.z.toFixed(1);
}

function animate() {
    requestAnimationFrame(animate);
    
    // 使用锚点坐标系更新位置
    if (anchorManager.isReady() && sensorManager.currentGPS) {
        const localPos = anchorManager.gpsToAnchorSystem(
            sensorManager.currentGPS.lat,
            sensorManager.currentGPS.lng,
            sensorManager.currentGPS.alt || 0
        );
        arScene.updatePositionFromAnchorSystem(localPos.x, localPos.y, localPos.z);
    }
    
    arScene.render();
    
    if (arScene.isInitialized) {
        const rotation = arScene.getCameraRotation();
        document.getElementById('rot-x').textContent = rotation.x.toFixed(2) + '°';
        document.getElementById('rot-y').textContent = rotation.y.toFixed(2) + '°';
        document.getElementById('rot-z').textContent = rotation.z.toFixed(2) + '°';
    }
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
        <hr style="margin: 10px 0; border: 1px solid #ddd;">
        <p><strong>起点经度:</strong> ${info.startLng.toFixed(6)}°</p>
        <p><strong>起点纬度:</strong> ${info.startLat.toFixed(6)}°</p>
        <p><strong>终点经度:</strong> ${info.endLng.toFixed(6)}°</p>
        <p><strong>终点纬度:</strong> ${info.endLat.toFixed(6)}°</p>
    `;

    panel.classList.remove('hidden');
}

function hidePipeInfo() {
    document.getElementById('pipe-info').classList.add('hidden');
}

async function startApp() {
    const hasPermission = await sensorManager.requestPermissions();
    if (!hasPermission) {
        alert('需要陀螺仪权限');
        return;
    }
    
    await initCamera();
    initializeAR();
}

window.addEventListener('DOMContentLoaded', () => {
    sensorManager = new SensorManager();
    arScene = new ARScene(document.getElementById('three-canvas'));
    anchorManager = new AnchorManager();
    setupUIEvents();
    
    sensorManager.onPositionUpdate = (delta) => {
        if (!anchorManager.isReady()) {
            arScene.updateCameraPosition(delta);
        }
        document.getElementById('lat-value').textContent = sensorManager.currentGPS.lat.toFixed(6);
        document.getElementById('lng-value').textContent = sensorManager.currentGPS.lng.toFixed(6);
    };
    
    sensorManager.onAccuracyUpdate = (accuracy) => {
        document.getElementById('gps-accuracy').textContent = accuracy.toFixed(2) + ' 米';
    };
    
    sensorManager.onOrientationUpdate = (orientation) => {
        document.getElementById('gyro-data').textContent = 
            `陀螺仪: α=${orientation.alpha.toFixed(1)} β=${orientation.beta.toFixed(1)} γ=${orientation.gamma.toFixed(1)}`;
        
        if (gyroEnabled) {
            arScene.updateCameraOrientation(orientation);
        }
    };
    
    startApp();
});

let originGPS = { lat: 39.9042, lng: 116.4074 };
let markerDetected = false;
let geoJSONData = [];
let aFrameScene = null;
let markerEl = null;
let fixedPosition = null;
let fixedRotation = null;

async function loadPipeData() {
    try {
        console.log('正在加载管线数据...');
        const response = await fetch('highway.geojsonl.json');
        const text = await response.text();
        const lines = text.trim().split('\n').filter(line => line.trim());
        geoJSONData = lines.map(line => JSON.parse(line));
        console.log(`成功加载 ${geoJSONData.length} 条管线数据`);
        return geoJSONData;
    } catch (e) {
        console.error('加载管线数据失败:', e);
        alert('加载管线数据失败，请检查控制台输出');
        return [];
    }
}

function createFixedARContent() {
    const sceneEl = aFrameScene;
    
    // 创建独立的实体，不依赖于标记
    const fixedEntity = document.createElement('a-entity');
    fixedEntity.setAttribute('id', 'fixed-content');
    
    // 应用固定的位置和旋转
    if (fixedPosition) {
        fixedEntity.setAttribute('position', `${fixedPosition.x} ${fixedPosition.y} ${fixedPosition.z}`);
    }
    if (fixedRotation) {
        fixedEntity.setAttribute('rotation', `${fixedRotation.x} ${fixedRotation.y} ${fixedRotation.z}`);
    }
    
    sceneEl.appendChild(fixedEntity);
    
    // 创建网格面 (100m x 100m)
    const gridEl = document.createElement('a-entity');
    gridEl.setAttribute('geometry', {
        primitive: 'plane',
        width: 100,
        height: 100
    });
    gridEl.setAttribute('material', {
        color: '#003300',
        opacity: 0.1,
        transparent: true,
        side: 'double'
    });
    gridEl.setAttribute('rotation', '-90 0 0');
    gridEl.setAttribute('position', '0 0 0');
    fixedEntity.appendChild(gridEl);
    
    // 创建网格线
    const gridHelperEl = document.createElement('a-entity');
    gridHelperEl.setAttribute('line-grid', {
        size: 100,
        divisions: 100,
        colorCenterLine: '#44ff44',
        colorGrid: '#222222'
    });
    gridHelperEl.setAttribute('position', '0 0 0');
    fixedEntity.appendChild(gridHelperEl);
    
    // 添加距离标记和方向标记
    addDirectionMarkers(fixedEntity);
    addDistanceMarkers(fixedEntity);
    
    // 生成管线
    if (geoJSONData.length > 0) {
        generatePipes(geoJSONData, fixedEntity);
    }
}

function addDirectionMarkers(parent) {
    const directions = [
        { label: 'N', x: 0, z: 20, color: '#ff0000' },
        { label: 'S', x: 0, z: -20, color: '#00ff00' },
        { label: 'E', x: -20, z: 0, color: '#ff0000' },
        { label: 'W', x: 20, z: 0, color: '#ff0000' }
    ];
    
    directions.forEach(dir => {
        const markerEl = document.createElement('a-text');
        markerEl.setAttribute('value', dir.label);
        markerEl.setAttribute('color', dir.color);
        markerEl.setAttribute('position', `${dir.x} 1.5 ${dir.z}`);
        markerEl.setAttribute('scale', '5 5 5');
        markerEl.setAttribute('align', 'center');
        parent.appendChild(markerEl);
    });
}

function addDistanceMarkers(parent) {
    const distances = [10, 20, 30, 40, 50];
    const colors = ['#ffff00', '#ff8800', '#ff0088', '#8800ff', '#00ffff'];
    
    // 四个方向添加标记
    const directions = [
        { x: 0, z: 1 },  // 北
        { x: -1, z: 0 }, // 东
        { x: 0, z: -1 }, // 南
        { x: 1, z: 0 }   // 西
    ];
    
    directions.forEach(dir => {
        distances.forEach((dist, i) => {
            const markerEl = document.createElement('a-cylinder');
            markerEl.setAttribute('radius', '0.3');
            markerEl.setAttribute('height', '0.1');
            markerEl.setAttribute('color', colors[i]);
            markerEl.setAttribute('opacity', '0.7');
            markerEl.setAttribute('position', `${dir.x * dist} 0.05 ${dir.z * dist}`);
            parent.appendChild(markerEl);
        });
    });
}

function generatePipes(data, parent) {
    const colorMap = {
        '供水管道': '#00aaff',
        '燃气管道': '#ffaa00',
        '污水管道': '#666666',
        '雨水管道': '#4488ff',
        '电力管道': '#ff0000',
        '通信管道': '#00ff00',
        '热力管道': '#ff4444',
        '工业用水': '#00ffff',
        '综合管廊': '#888844',
        '其他': '#888888'
    };
    
    data.forEach((feature, index) => {
        const properties = feature.properties;
        const geometry = feature.geometry;
        
        if (!geometry || geometry.type !== 'LineString' || !geometry.coordinates || geometry.coordinates.length < 2) {
            return;
        }
        
        // 转换坐标（以标记为原点）
        const coords = geometry.coordinates.map(([lng, lat]) => {
            const dLng = -(lng - originGPS.lng) * 111320 * Math.cos(originGPS.lat * Math.PI / 180);
            const dLat = (lat - originGPS.lat) * 111320;
            return { x: dLng, y: 0.2, z: dLat };
        });
        
        // 创建管线
        if (coords.length >= 2) {
            let radius = 0.1;
            if (properties.gj) {
                const gj = parseFloat(properties.gj);
                if (!isNaN(gj)) {
                    radius = gj / 2000;
                }
            }
            
            const color = colorMap[properties.gdlx] || colorMap['其他'];
            
            const tubeEl = document.createElement('a-entity');
            tubeEl.setAttribute('id', `pipe-${index}`);
            
            // 使用多个 cylinder 连接起来
            for (let i = 0; i < coords.length - 1; i++) {
                const start = coords[i];
                const end = coords[i + 1];
                
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const dz = end.z - start.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                if (distance > 0) {
                    const segmentEl = document.createElement('a-cylinder');
                    segmentEl.setAttribute('radius', radius);
                    segmentEl.setAttribute('height', distance);
                    segmentEl.setAttribute('color', color);
                    segmentEl.setAttribute('opacity', '0.8');
                    
                    // 计算位置和旋转
                    const midX = (start.x + end.x) / 2;
                    const midY = (start.y + end.y) / 2;
                    const midZ = (start.z + end.z) / 2;
                    
                    segmentEl.setAttribute('position', `${midX} ${midY} ${midZ}`);
                    
                    // 计算旋转
                    const angleY = Math.atan2(dx, dz) * 180 / Math.PI;
                    const angleX = -Math.asin(dy / distance) * 180 / Math.PI;
                    segmentEl.setAttribute('rotation', `${angleX} ${angleY} 0`);
                    
                    tubeEl.appendChild(segmentEl);
                }
            }
            
            tubeEl.userData = {
                pipeInfo: {
                    gxbh: properties.gxbh || properties.qdbh || `P${index + 1}`,
                    gdlx: properties.gdlx || '未知',
                    cz: properties.cz || '未知',
                    gj: properties.gj ? `${properties.gj}mm` : '未知',
                    gxcd: properties.gxcd ? `${properties.gxcd}m` : '未知',
                    startLng: geometry.coordinates[0][0],
                    startLat: geometry.coordinates[0][1],
                    endLng: geometry.coordinates[geometry.coordinates.length - 1][0],
                    endLat: geometry.coordinates[geometry.coordinates.length - 1][1]
                }
            };
            
            parent.appendChild(tubeEl);
        }
    });
}

async function getCurrentGPS() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            console.warn('Geolocation 不支持，使用默认位置');
            resolve(originGPS);
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const gps = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                console.log('获取 GPS 位置成功:', gps);
                document.getElementById('gps-status').textContent = '已连接';
                document.getElementById('lat-value').textContent = gps.lat.toFixed(6);
                document.getElementById('lng-value').textContent = gps.lng.toFixed(6);
                document.getElementById('gps-accuracy').textContent = position.coords.accuracy.toFixed(2) + ' 米';
                resolve(gps);
            },
            (error) => {
                console.warn('获取 GPS 失败，使用默认位置:', error);
                document.getElementById('gps-status').textContent = '模拟';
                resolve(originGPS);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

function setupMarkerEvents() {
    markerEl = document.getElementById('hiro-marker');
    
    if (markerEl) {
        markerEl.addEventListener('markerFound', async () => {
            if (markerDetected) return;
            
            console.log('Hiro 标记识别成功！正在固定位置...');
            
            // 隐藏开始屏幕，显示传感器面板
            document.getElementById('start-screen').classList.add('hidden');
            document.getElementById('sensor-panel').classList.remove('hidden');
            
            // 获取当前 GPS 位置作为原点
            originGPS = await getCurrentGPS();
            
            // 等待几帧确保标记位置稳定
            setTimeout(() => {
                // 获取标记的位置和旋转
                if (markerEl.object3D) {
                    fixedPosition = {
                        x: markerEl.object3D.position.x,
                        y: markerEl.object3D.position.y,
                        z: markerEl.object3D.position.z
                    };
                    
                    const rotation = markerEl.object3D.rotation;
                    fixedRotation = {
                        x: THREE.MathUtils.radToDeg(rotation.x),
                        y: THREE.MathUtils.radToDeg(rotation.y),
                        z: THREE.MathUtils.radToDeg(rotation.z)
                    };
                    
                    console.log('标记位置已保存:', fixedPosition);
                    console.log('标记旋转已保存:', fixedRotation);
                }
                
                // 标记已检测
                markerDetected = true;
                
                // 创建独立的固定内容
                createFixedARContent();
                
                // 完全禁用标记
                markerEl.setAttribute('visible', 'false');
                
                console.log('✅ AR 内容已完全固定！现在可以自由移动设备，内容将保持不变。');
            }, 300);
        });
        
        markerEl.addEventListener('markerLost', () => {
            if (!markerDetected) {
                console.log('标记丢失，继续寻找...');
            } else {
                console.log('标记已丢失，但内容保持固定');
            }
        });
    }
}

async function init() {
    // 先加载管线数据
    await loadPipeData();
    
    aFrameScene = document.getElementById('ar-scene');
    
    // 等待 A-Frame 场景加载完成
    if (aFrameScene.hasLoaded) {
        setupMarkerEvents();
    } else {
        aFrameScene.addEventListener('loaded', setupMarkerEvents);
    }
    
    console.log('等待 Hiro 标记识别...');
}

window.addEventListener('DOMContentLoaded', () => {
    // 隐藏不需要的面板
    document.getElementById('debug-panel').classList.add('hidden');
    document.getElementById('offset-panel').classList.add('hidden');
    
    // 开始初始化
    init();
});

export function generateTestPipes(originLat, originLng) {
    
    function latLngToLocal(lat, lng) {
        const lat1 = originLat * Math.PI / 180;
        const deltaLat = (lat - originLat) * Math.PI / 180;
        const deltaLng = (lng - originLng) * Math.PI / 180;
        
        const x = deltaLng * 111320 * Math.cos(lat1);
        const z = -deltaLat * 111320;
        return { x, z };
    }

    function localToLatLng(x, z) {
        const lat1 = originLat * Math.PI / 180;
        const deltaLat = -z / 111320;
        const deltaLng = x / (111320 * Math.cos(lat1));
        return {
            lat: originLat + deltaLat * 180 / Math.PI,
            lng: originLng + deltaLng * 180 / Math.PI
        };
    }

    const pipes = [
        // ===== 近距离管线 (5-15米) =====
        
        // 前方 - 供水
        {
            info: { id: 'P001', type: '供水', diameter: '300mm', depth: '1.2m', material: 'PE', distance: '前方 10米' },
            color: 0x00aaff,
            radius: 0.15,
            points: [
                { x: -5, y: -1.2, z: -5 },
                { x: 0, y: -1.2, z: -10 },
                { x: 5, y: -1.2, z: -15 }
            ]
        },
        
        // 后方 - 污水
        {
            info: { id: 'P002', type: '污水', diameter: '400mm', depth: '2.0m', material: '混凝土', distance: '后方 8米' },
            color: 0x666666,
            radius: 0.2,
            points: [
                { x: -3, y: -2.0, z: 5 },
                { x: 2, y: -2.0, z: 10 },
                { x: 6, y: -2.0, z: 15 }
            ]
        },
        
        // 左侧 - 燃气
        {
            info: { id: 'P003', type: '燃气', diameter: '200mm', depth: '1.5m', material: '钢管', distance: '左侧 12米' },
            color: 0xffaa00,
            radius: 0.1,
            points: [
                { x: -10, y: -1.5, z: -3 },
                { x: -15, y: -1.5, z: 2 },
                { x: -20, y: -1.5, z: 7 }
            ]
        },
        
        // 右侧 - 供电
        {
            info: { id: 'P004', type: '供电', diameter: '150mm', depth: '0.8m', material: 'PVC', distance: '右侧 10米' },
            color: 0xff0000,
            radius: 0.075,
            points: [
                { x: 10, y: -0.8, z: -4 },
                { x: 15, y: -0.8, z: 1 },
                { x: 20, y: -0.8, z: 6 }
            ]
        },
        
        // 中心交叉 - 通信
        {
            info: { id: 'P005', type: '通信', diameter: '100mm', depth: '0.6m', material: 'PE', distance: '中心区域' },
            color: 0x00ff00,
            radius: 0.05,
            points: [
                { x: -8, y: -0.6, z: -8 },
                { x: 8, y: -0.6, z: 8 }
            ]
        },
        
        // ===== 中距离管线 (15-35米) =====
        
        // 前方偏左 - 热力
        {
            info: { id: 'P006', type: '热力', diameter: '500mm', depth: '1.8m', material: '保温钢管', distance: '前方 30米' },
            color: 0xff4444,
            radius: 0.25,
            points: [
                { x: -15, y: -1.8, z: -20 },
                { x: -10, y: -1.8, z: -30 },
                { x: -5, y: -1.8, z: -40 }
            ]
        },
        
        // 后方偏右 - 雨水
        {
            info: { id: 'P007', type: '雨水', diameter: '600mm', depth: '2.5m', material: '混凝土', distance: '后方 25米' },
            color: 0x4488ff,
            radius: 0.3,
            points: [
                { x: 10, y: -2.5, z: 20 },
                { x: 15, y: -2.5, z: 30 },
                { x: 20, y: -2.5, z: 40 }
            ]
        },
        
        // 左侧更远 - 工业用水
        {
            info: { id: 'P008', type: '工业用水', diameter: '400mm', depth: '2.2m', material: 'PE', distance: '左侧 30米' },
            color: 0x00ffff,
            radius: 0.2,
            points: [
                { x: -25, y: -2.2, z: -10 },
                { x: -30, y: -2.2, z: 0 },
                { x: -35, y: -2.2, z: 10 }
            ]
        },
        
        // 右侧更远 - 有线电视
        {
            info: { id: 'P009', type: '有线电视', diameter: '80mm', depth: '0.7m', material: 'PE', distance: '右侧 28米' },
            color: 0x8800ff,
            radius: 0.04,
            points: [
                { x: 20, y: -0.7, z: -15 },
                { x: 30, y: -0.7, z: -5 },
                { x: 40, y: -0.7, z: 5 }
            ]
        },
        
        // ===== 远距离管线 (35-60米) =====
        
        // 前方直线 - 市政供水主干线
        {
            info: { id: 'P010', type: '市政供水', diameter: '800mm', depth: '3.0m', material: '球墨铸铁', distance: '前方 50米' },
            color: 0x0088aa,
            radius: 0.4,
            points: [
                { x: 0, y: -3.0, z: -30 },
                { x: 0, y: -3.0, z: -50 },
                { x: 0, y: -3.0, z: -70 }
            ]
        },
        
        // 后方环线 - 燃气环网
        {
            info: { id: 'P011', type: '燃气环网', diameter: '300mm', depth: '1.8m', material: '钢管', distance: '后方 45米' },
            color: 0xff6600,
            radius: 0.15,
            points: [
                { x: -20, y: -1.8, z: 30 },
                { x: 0, y: -1.8, z: 50 },
                { x: 20, y: -1.8, z: 30 }
            ]
        },
        
        // 左前方对角 - 电力隧道
        {
            info: { id: 'P012', type: '电力隧道', diameter: '1000mm', depth: '5.0m', material: '钢筋混凝土', distance: '左前方 40米' },
            color: 0x884400,
            radius: 0.5,
            points: [
                { x: -10, y: -5.0, z: -10 },
                { x: -30, y: -5.0, z: -30 },
                { x: -50, y: -5.0, z: -50 }
            ]
        },
        
        // 右后方对角 - 综合管廊
        {
            info: { id: 'P013', type: '综合管廊', diameter: '2000mm', depth: '6.0m', material: '钢筋混凝土', distance: '右后方 50米' },
            color: 0x888844,
            radius: 1.0,
            points: [
                { x: 10, y: -6.0, z: 10 },
                { x: 30, y: -6.0, z: 30 },
                { x: 50, y: -6.0, z: 50 }
            ]
        },
        
        // ===== 额外补充管线 =====
        
        // 中心环形 - 路灯电缆
        {
            info: { id: 'P014', type: '路灯电缆', diameter: '50mm', depth: '0.5m', material: 'PVC', distance: '中心环网' },
            color: 0xffff00,
            radius: 0.025,
            points: [
                { x: -12, y: -0.5, z: 0 },
                { x: 0, y: -0.5, z: -12 },
                { x: 12, y: -0.5, z: 0 },
                { x: 0, y: -0.5, z: 12 },
                { x: -12, y: -0.5, z: 0 }
            ]
        },
        
        // 右前方 - 中水回用
        {
            info: { id: 'P015', type: '中水回用', diameter: '250mm', depth: '1.4m', material: 'PE', distance: '右前方 35米' },
            color: 0x00aa88,
            radius: 0.125,
            points: [
                { x: 15, y: -1.4, z: -20 },
                { x: 25, y: -1.4, z: -30 },
                { x: 35, y: -1.4, z: -40 }
            ]
        }
    ];

    return pipes;
}

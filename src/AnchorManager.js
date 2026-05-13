
export class AnchorManager {
    constructor() {
        this.anchors = []; // 存储所有锚点
        this.isCalibrated = false;
        this.planeNormal = null; // 平面法向量
        this.planeD = 0; // 平面方程 ax + by + cz + d = 0 的d
        this.transformationMatrix = null; // 从GPS坐标到锚点坐标系的变换矩阵
    }

    // 添加锚点
    addAnchor(gpsLat, gpsLng, gpsAlt = 0, label = `锚点${this.anchors.length + 1}`) {
        const anchor = {
            id: this.anchors.length + 1,
            gpsLat: gpsLat,
            gpsLng: gpsLng,
            gpsAlt: gpsAlt,
            localX: 0,
            localY: 0,
            localZ: 0,
            label: label,
            timestamp: Date.now()
        };
        this.anchors.push(anchor);
        console.log(`[AnchorManager] 已添加锚点 ${anchor.id}:`, anchor);
        return anchor;
    }

    // 移除最后一个锚点
    removeLastAnchor() {
        if (this.anchors.length > 0) {
            const removed = this.anchors.pop();
            console.log(`[AnchorManager] 已移除锚点 ${removed.id}`);
            if (this.anchors.length < 3) {
                this.isCalibrated = false;
            }
            return removed;
        }
        return null;
    }

    // 清除所有锚点
    clearAnchors() {
        this.anchors = [];
        this.isCalibrated = false;
        this.planeNormal = null;
        console.log('[AnchorManager] 已清除所有锚点');
    }

    // 计算锚点坐标系并标定平面
    calibrate() {
        if (this.anchors.length < 3) {
            console.warn('[AnchorManager] 至少需要3个锚点才能标定');
            return false;
        }

        console.log('[AnchorManager] 开始标定...');

        // 步骤1: 将所有锚点从GPS转换为临时本地坐标系（以第一个锚点为原点）
        const origin = this.anchors[0];
        const tempLocalPoints = this.anchors.map(anchor => {
            return this._gpsToTempLocal(anchor, origin);
        });

        // 步骤2: 使用前三个锚点计算平面方程
        this._fitPlane(tempLocalPoints);

        // 步骤3: 建立锚点坐标系
        this._buildCoordinateSystem(tempLocalPoints);

        // 步骤4: 为每个锚点分配最终的本地坐标
        this.anchors.forEach((anchor, index) => {
            const finalLocal = this._transformToAnchorSystem(tempLocalPoints[index]);
            anchor.localX = finalLocal.x;
            anchor.localY = finalLocal.y;
            anchor.localZ = finalLocal.z;
        });

        this.isCalibrated = true;
        console.log('[AnchorManager] 标定完成！锚点信息:', this.anchors);
        return true;
    }

    // GPS坐标转换为临时本地坐标（以第一个锚点为原点的东北天坐标系）
    _gpsToTempLocal(anchor, origin) {
        const EARTH_RADIUS = 6371000; // 地球半径，单位米
        const lat1 = origin.gpsLat * Math.PI / 180;
        const lng1 = origin.gpsLng * Math.PI / 180;
        const lat2 = anchor.gpsLat * Math.PI / 180;
        const lng2 = anchor.gpsLng * Math.PI / 180;

        // 纬度差（向北为正）
        const deltaLat = lat2 - lat1;
        // 经度差
        const deltaLng = lng2 - lng1;

        // 计算本地坐标（东北天坐标系）
        const x = deltaLng * EARTH_RADIUS * Math.cos(lat1); // 东方向
        const z = deltaLat * EARTH_RADIUS; // 北方向
        const y = (anchor.gpsAlt || 0) - (origin.gpsAlt || 0); // 高度方向

        return { x, y, z, anchorId: anchor.id };
    }

    // 使用最小二乘法拟合平面
    _fitPlane(points) {
        if (points.length < 3) return;

        // 使用前三个非共线点计算初始平面
        let p1 = points[0];
        let p2 = points[1];
        let p3 = null;

        // 寻找第三个不共线的点
        for (let i = 2; i < points.length; i++) {
            const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
            const v2 = { x: points[i].x - p1.x, y: points[i].y - p1.y, z: points[i].z - p1.z };
            const cross = this._crossProduct(v1, v2);
            if (this._vectorLength(cross) > 0.1) { // 确保不共线
                p3 = points[i];
                break;
            }
        }

        if (!p3) {
            console.warn('[AnchorManager] 所有锚点几乎共线，无法拟合平面');
            p3 = points[2]; // 强制使用第三个点
        }

        // 计算平面法向量
        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
        const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };
        this.planeNormal = this._normalizeVector(this._crossProduct(v1, v2));

        // 确保法向量向上（y轴正方向）
        if (this.planeNormal.y < 0) {
            this.planeNormal.x = -this.planeNormal.x;
            this.planeNormal.y = -this.planeNormal.y;
            this.planeNormal.z = -this.planeNormal.z;
        }

        // 计算平面方程的d
        this.planeD = -(this.planeNormal.x * p1.x + this.planeNormal.y * p1.y + this.planeNormal.z * p1.z);

        console.log('[AnchorManager] 平面拟合完成，法向量:', this.planeNormal, 'd:', this.planeD);
    }

    // 构建锚点坐标系
    _buildCoordinateSystem(tempLocalPoints) {
        const origin = tempLocalPoints[0];
        
        // Z轴：从原点指向第二个锚点在平面上的投影
        let p2 = tempLocalPoints[1];
        let p2Projected = this._projectToPlane(p2);
        let zAxis = {
            x: p2Projected.x - origin.x,
            y: p2Projected.y - origin.y,
            z: p2Projected.z - origin.z
        };
        zAxis = this._normalizeVector(zAxis);

        // X轴：Z轴与平面法向量的叉积
        let xAxis = this._crossProduct(zAxis, this.planeNormal);
        xAxis = this._normalizeVector(xAxis);

        // Y轴：平面法向量（已保证向上）
        let yAxis = this.planeNormal;

        // 构建变换矩阵（从临时坐标到锚点坐标系）
        this.transformationMatrix = [
            [xAxis.x, yAxis.x, zAxis.x],
            [xAxis.y, yAxis.y, zAxis.y],
            [xAxis.z, yAxis.z, zAxis.z]
        ];

        console.log('[AnchorManager] 坐标系构建完成');
        console.log('  X轴:', xAxis);
        console.log('  Y轴:', yAxis);
        console.log('  Z轴:', zAxis);
    }

    // 将点投影到平面上
    _projectToPlane(point) {
        const distance = this.planeNormal.x * point.x + this.planeNormal.y * point.y + this.planeNormal.z * point.z + this.planeD;
        return {
            x: point.x - this.planeNormal.x * distance,
            y: point.y - this.planeNormal.y * distance,
            z: point.z - this.planeNormal.z * distance
        };
    }

    // 将临时本地坐标转换到锚点坐标系
    _transformToAnchorSystem(tempLocalPoint) {
        const origin = this.anchors[0];
        const originTemp = this._gpsToTempLocal(origin, origin); // 其实就是(0,0,0)

        // 相对于原点的向量
        const dx = tempLocalPoint.x - originTemp.x;
        const dy = tempLocalPoint.y - originTemp.y;
        const dz = tempLocalPoint.z - originTemp.z;

        if (!this.transformationMatrix) {
            return { x: dx, y: dy, z: dz };
        }

        // 应用变换矩阵
        const x = this.transformationMatrix[0][0] * dx + this.transformationMatrix[0][1] * dy + this.transformationMatrix[0][2] * dz;
        const y = this.transformationMatrix[1][0] * dx + this.transformationMatrix[1][1] * dy + this.transformationMatrix[1][2] * dz;
        const z = this.transformationMatrix[2][0] * dx + this.transformationMatrix[2][1] * dy + this.transformationMatrix[2][2] * dz;

        // 将点投影到平面上，消除垂直于平面的分量
        const projected = this._projectToPlane({ x, y, z });

        return projected;
    }

    // 将当前GPS坐标转换为锚点坐标系
    gpsToAnchorSystem(gpsLat, gpsLng, gpsAlt = 0) {
        if (!this.isCalibrated || this.anchors.length === 0) {
            console.warn('[AnchorManager] 系统未标定，使用临时坐标系');
            const origin = { gpsLat: gpsLat, gpsLng: gpsLng, gpsAlt: gpsAlt };
            const temp = this._gpsToTempLocal({ gpsLat, gpsLng, gpsAlt }, origin);
            return temp;
        }

        const origin = this.anchors[0];
        const tempLocal = this._gpsToTempLocal({ gpsLat, gpsLng, gpsAlt }, origin);
        return this._transformToAnchorSystem(tempLocal);
    }

    // 计算点到平面的距离
    distanceToPlane(point) {
        if (!this.planeNormal) return 0;
        return this.planeNormal.x * point.x + this.planeNormal.y * point.y + this.planeNormal.z * point.z + this.planeD;
    }

    // 向量叉积
    _crossProduct(v1, v2) {
        return {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };
    }

    // 向量长度
    _vectorLength(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    }

    // 向量归一化
    _normalizeVector(v) {
        const len = this._vectorLength(v);
        if (len < 0.0001) return { x: 0, y: 1, z: 0 };
        return {
            x: v.x / len,
            y: v.y / len,
            z: v.z / len
        };
    }

    // 获取锚点数量
    getAnchorCount() {
        return this.anchors.length;
    }

    // 获取所有锚点
    getAnchors() {
        return [...this.anchors];
    }

    // 检查是否已标定
    isReady() {
        return this.isCalibrated && this.anchors.length >= 3;
    }
}

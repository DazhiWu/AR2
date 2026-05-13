import jsQR from 'jsqr';

export class QRScanner {
    constructor(videoElement, canvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.scanning = false;
        this.onQRDetected = null;
    }

    startScanning() {
        this.scanning = true;
        this.scanLoop();
    }

    stopScanning() {
        this.scanning = false;
    }

    scanLoop() {
        if (!this.scanning) return;

        const { video, canvas, ctx } = this;
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code && this.onQRDetected) {
                this.onQRDetected(code);
            }
        }

        requestAnimationFrame(() => this.scanLoop());
    }
}

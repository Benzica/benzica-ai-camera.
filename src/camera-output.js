// Only the transformed video element is used as the source.
export class CameraOutput {
  constructor(video, api, onError) {
    this.video = video; this.api = api; this.onError = onError;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280; this.canvas.height = 720;
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    this.active = false; this.callback = null; this.last = 0; this.epoch = 0;
    this.chain = Promise.resolve();
  }
  start() {
    // Serialize stop/start so an older stop cannot kill a newer native host.
    const epoch = ++this.epoch;
    this.chain = this.chain.catch(() => {}).then(async () => {
      await this.api.startVirtual();
      if (epoch !== this.epoch) { await this.api.stopVirtual(); return; }
      this.active = true; this.last = 0;
      this.schedule(epoch);
    });
    return this.chain;
  }
  stop() {
    this.active = false; this.epoch++;
    if (this.callback !== null) this.video.cancelVideoFrameCallback(this.callback);
    this.callback = null;
    this.chain = this.chain.catch(() => {}).then(() => this.api.stopVirtual());
    return this.chain;
  }
  schedule(epoch) {
    if (!this.active || epoch !== this.epoch) return;
    this.callback = this.video.requestVideoFrameCallback(async now => {
      this.callback = null;
      if (!this.active || epoch !== this.epoch) return;
      if (now - this.last < 40) { this.schedule(epoch); return; }
      this.last = now;
      try {
        const { videoWidth: w, videoHeight: h } = this.video;
        if (!w || !h) { this.schedule(epoch); return; }
        const c = this.context;
        c.fillStyle = '#000'; c.fillRect(0, 0, 1280, 720);
        const scale = Math.min(1280 / w, 720 / h);
        c.drawImage(this.video, (1280 - w * scale) / 2, (720 - h * scale) / 2, w * scale, h * scale);
        c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(18, 664, 218, 38);
        c.fillStyle = '#fff'; c.font = '19px Segoe UI, sans-serif'; c.fillText('AI-transformed video', 29, 690);
        const pixels = c.getImageData(0, 0, 1280, 720).data;
        for (let i = 0; i < pixels.length; i += 4) {
          const red = pixels[i]; pixels[i] = pixels[i + 2]; pixels[i + 2] = red;
        }
        await this.api.sendFrame(new Uint8Array(pixels.buffer));
      } catch (error) {
        if (epoch === this.epoch) { await this.stop(); this.onError(error); }
        return;
      }
      this.schedule(epoch);
    });
  }
}

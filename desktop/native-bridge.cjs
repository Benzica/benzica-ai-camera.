const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const FRAME_BYTES = 1280 * 720 * 4;
const MAGIC = 0x31435A42;
function packet(bytes) {
  if (!(bytes instanceof Uint8Array) || ![0, FRAME_BYTES].includes(bytes.byteLength)) throw new Error('Invalid camera frame');
  const out = Buffer.allocUnsafe(8 + bytes.byteLength);
  out.writeUInt32LE(MAGIC, 0); out.writeUInt32LE(bytes.byteLength, 4);
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).copy(out, 8);
  return out;
}
function availability() {
  const supported = process.platform === 'win32' && process.arch === 'x64' && Number(os.release().split('.')[2]) >= 22000;
  const executable = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'BenZica AI Camera', 'Native', 'BenZicaCameraHost.exe');
  const present = supported && existsSync(executable);
  return { supported, present, executable, reason: !supported ? 'Requires Windows 11 x64' : !present ? 'Install the Windows camera component first' : 'Native files found; start to check registration' };
}
class NativeBridge {
  constructor({ spawnHost = spawn, status = availability } = {}) {
    this.spawnHost = spawnHost; this.status = status;
    this.child = null; this.ready = false; this.pending = null; this.writing = false;
  }
  start() {
    if (this.ready) return Promise.resolve(true);
    if (this.pending) return this.pending;
    const info = this.status();
    if (!info.present) return Promise.reject(new Error(info.reason));
    this.pending = new Promise((resolve, reject) => {
      const child = this.spawnHost(info.executable, [], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      let output = '', settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) { this.ready = false; child.kill(); reject(error); }
        else { this.ready = true; resolve(true); }
      };
      const timer = setTimeout(() => finish(new Error('Windows camera startup timed out')), 20000);
      child.stdout.on('data', data => {
        output += data.toString('utf8');
        if (output.length > 8192) return finish(new Error('Invalid camera host response'));
        let newline;
        while ((newline = output.indexOf('\n')) !== -1) {
          const line = output.slice(0, newline); output = output.slice(newline + 1);
          try {
            const event = JSON.parse(line);
            if (event.type === 'ready') finish();
            else if (event.type === 'error') finish(new Error(`Windows camera failed (${String(event.stage).slice(0,60)}, ${String(event.hresult).slice(0,16)})`));
          } catch { finish(new Error('Invalid camera host response')); }
        }
      });
      child.stderr.resume();
      child.stdin.on('error', () => { this.ready = false; });
      child.on('error', () => finish(new Error('Could not launch the Windows camera component')));
      child.on('close', () => {
        if (this.child === child) { this.child = null; this.ready = false; }
        finish(new Error('Windows camera component exited'));
      });
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  async write(bytes) {
    const data = packet(bytes);
    if (!this.ready || !this.child) throw new Error('Virtual camera is not running');
    if (this.writing) return false;
    this.writing = true;
    const child = this.child;
    try {
      await new Promise((resolve, reject) => {
        let done = false;
        const finish = error => { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : resolve(); };
        const timer = setTimeout(() => { finish(new Error('Camera frame delivery timed out')); child.kill(); }, 2000);
        child.stdin.write(data, error => finish(error));
      });
      return true;
    } finally { this.writing = false; }
  }
  async stop() {
    this.ready = false;
    const child = this.child;
    if (!child) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill(); resolve(); }, 2500);
      child.once('close', () => { clearTimeout(timer); resolve(); });
      child.stdin.end();
    });
    if (this.child === child) this.child = null;
  }
}
module.exports = { NativeBridge, availability, packet, FRAME_BYTES, MAGIC };

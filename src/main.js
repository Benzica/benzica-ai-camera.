import { createDecartClient, models } from '@decartai/sdk';
import './style.css';
import { CameraOutput } from './camera-output.js';
const $ = id => document.getElementById(id);
let source = null, remote = null, live = null, reference = null, photoUrl = null;
let generation = 0, photoGeneration = 0, started = 0, busy = false, hasKey = false;
let nativeAvailable = false, nativeBusy = false;
const virtual = new CameraOutput($('output'), window.cameraApp, error => { fail(error.message); $('nativeStatus').textContent = 'Camera stopped'; controls(); });
const model = models.realtime('lucy-2.5');
const client = createDecartClient({ apiKeyProvider: async () => (await window.cameraApp.token()).apiKey });
const say = message => { $('status').textContent = message; };
const fail = message => { $('error').textContent = message; };
function controls() {
  $('virtual').disabled = nativeBusy || (!virtual.active && (!nativeAvailable || !live));
  $('virtual').textContent = virtual.active ? 'Disable virtual camera' : 'Enable virtual camera';
  $('start').disabled = busy || !!live;
  $('preview').disabled = busy || !!live;
  $('camera').disabled = busy || !!source;
  $('saveKey').disabled = busy || !!live;
  $('stop').disabled = !busy && !source && !live;
  $('apply').disabled = busy || !live;
}
function stop() {
  generation++;
  virtual.stop().catch(() => {});
  $('nativeStatus').textContent = 'Camera stopped';
  live?.disconnect(); live = null;
  [source, remote].forEach(stream => stream?.getTracks().forEach(track => track.stop()));
  source = remote = null;
  $('input').srcObject = $('output').srcObject = null;
  $('empty').hidden = false;
  started = 0; busy = false; controls(); say('Stopped');
}
async function openCamera(attempt) {
  if (source) return;
  const camera = $('camera').value;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
    width: { ideal: model.width }, height: { ideal: model.height }, frameRate: { ideal: model.fps },
    ...(camera ? { deviceId: { exact: camera } } : {})
  } });
  if (attempt !== generation) { stream.getTracks().forEach(track => track.stop()); return; }
  source = stream;
  $('input').srcObject = stream;
  stream.getVideoTracks()[0].addEventListener('ended', () => { stop(); fail('Camera disconnected. Reconnect it and try again.'); });
  const devices = await navigator.mediaDevices.enumerateDevices();
  if (attempt !== generation) return;
  const active = stream.getVideoTracks()[0].getSettings().deviceId;
  $('camera').replaceChildren(...devices.filter(d => d.kind === 'videoinput').map((d, i) => {
    const option = new Option(d.label || `Camera ${i + 1}`, d.deviceId); option.selected = d.deviceId === active; return option;
  }));
}
$('saveKey').onclick = async () => {
  try { await window.cameraApp.setKey($('key').value); hasKey = true; $('key').value = ''; $('keyStatus').textContent = 'Key loaded for this session.'; fail(''); }
  catch { fail('Enter your Decart API key. It is not stored on disk.'); }
};
$('preview').onclick = async () => {
  const attempt = ++generation; busy = true; controls(); fail('');
  try { await openCamera(attempt); if (attempt === generation) say('Local preview — no video sent to Decart'); }
  catch { if (attempt === generation) { stop(); fail('Could not open camera. Check Windows camera permissions and whether another app is using it.'); } }
  finally { if (attempt === generation) { busy = false; controls(); } }
};
$('photo').onchange = async () => {
  const id = ++photoGeneration;
  reference = null;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null; $('thumb').hidden = true;
  const file = $('photo').files[0];
  $('photoStatus').textContent = 'No reference selected.';
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { fail('Choose a JPEG, PNG or WebP under 10 MB.'); return; }
  try {
    const bitmap = await createImageBitmap(file);
    const suitable = bitmap.width >= 512 && bitmap.height >= 512;
    bitmap.close();
    if (id !== photoGeneration) return;
    if (!suitable) { fail('Use a reference photo at least 512 × 512 pixels.'); return; }
    reference = file; photoUrl = URL.createObjectURL(file);
    $('thumb').src = photoUrl; $('thumb').hidden = false;
    $('photoStatus').textContent = file.name; fail('');
  } catch { if (id === photoGeneration) fail('That image could not be read.'); }
};
const prompts = {
  light: 'Give the person soft, balanced studio lighting and natural skin texture.',
  character: 'Use the reference as the character appearance, following the live person’s expressions and movements.',
  outfit: 'Dress the person in the outfit shown in the reference image while maintaining their live movements.',
  custom: 'Describe your desired face, body appearance, outfit, or background here.'
};
$('mode').onchange = () => { $('prompt').value = prompts[$('mode').value]; };
function state() {
  const text = $('prompt').value.trim();
  if (!text) throw new Error('Describe the appearance you want first.');
  if (['character','outfit'].includes($('mode').value) && !reference) throw new Error('Select a reference photo for this look.');
  return { prompt: text, image: reference, enhance: true };
}
$('start').onclick = async () => {
  if (!hasKey) { fail('Add your Decart API key first.'); return; }
  let edit;
  try { edit = state(); } catch (error) { fail(error.message); return; }
  const attempt = ++generation; busy = true; controls(); fail(''); say('Connecting to Decart…');
  try {
    await openCamera(attempt);
    if (attempt !== generation) return;
    const connected = await client.realtime.connect(source, {
      model, mirror: false,
      initialState: { prompt: { text: edit.prompt, enhance: true }, ...(edit.image ? { image: edit.image } : {}) },
      onRemoteStream: stream => {
        if (attempt !== generation) { stream.getTracks().forEach(track => track.stop()); return; }
        remote = stream; $('output').srcObject = stream; $('empty').hidden = true;
      }
    });
    if (attempt !== generation) { connected.disconnect(); return; }
    live = connected; started = Date.now(); say('AI preview active — Decart usage may be billed');
    live.on('error', () => { if (attempt === generation) { stop(); fail('AI connection interrupted. Check your network and Decart account, then restart.'); } });
    live.on('connectionChange', status => {
      if (attempt === generation && status === 'disconnected') { stop(); fail('AI session disconnected. Restart when ready.'); }
    });
  } catch {
    if (attempt === generation) { stop(); fail('Could not start AI. Check your camera, internet, API key, credits, and Lucy 2.5 access.'); }
  } finally { if (attempt === generation) { busy = false; controls(); } }
};
$('apply').onclick = async () => {
  let edit;
  try { edit = state(); } catch (error) { fail(error.message); return; }
  const attempt = generation; busy = true; controls();
  try { await live.set(edit); if (attempt === generation) { fail(''); say('Appearance updated'); } }
  catch { if (attempt === generation) fail('Could not apply that look. Try again.'); }
  finally { if (attempt === generation) { busy = false; controls(); } }
};
$('stop').onclick = stop;
setInterval(() => {
  const elapsed = started ? Math.floor((Date.now() - started) / 1000) : 0;
  $('timer').textContent = `${String(Math.floor(elapsed / 60)).padStart(2,'0')}:${String(elapsed % 60).padStart(2,'0')}`;
}, 1000);
window.addEventListener('beforeunload', stop);
window.cameraApp.system().then(info => {
  nativeAvailable = info.virtualCameraAvailable;
  $('system').textContent = `${info.platform} ${info.release}`;
  $('nativeStatus').textContent = info.nativeReason; controls();
}).catch(() => fail('Could not read Windows camera status'));
$('virtual').onclick = async () => {
  nativeBusy = true; controls(); fail('');
  try {
    if (virtual.active) { await virtual.stop(); $('nativeStatus').textContent = 'Camera stopped'; }
    else {
      await virtual.start();
      if (!live) { await virtual.stop(); $('nativeStatus').textContent = 'Camera stopped'; }
      else $('nativeStatus').textContent = 'Select BenZica AI Camera in WhatsApp';
    }
  } catch (error) { fail(error.message); $('nativeStatus').textContent = 'Could not start camera'; }
  finally { nativeBusy = false; controls(); }
};
controls();

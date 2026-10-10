# Native implementation, v0.2

## Components

- native/source: Microsoft's synthetic Media Foundation source, adapted to read externally transformed frames. New CLSID: {AF297AF1-8265-4CA2-8A36-E06D117BD152}. Existing Microsoft sample registrations are not overwritten.
- native/host: initializes COM/Media Foundation, creates a protected temporary frame buffer, checks source activation, configures the buffer path through an activation attribute, creates the session virtual camera and consumes BGRA packets from stdin.
- native/common/FrameTransport.h: fixed 64-byte header plus one 1280×720 BGRA frame in a file-backed mapping. Both reader and writer explicitly take a file lock around access. Readers never wait for the writer: contention, malformed data or stale timestamps yield black output. The writer drops a frame on contention.
- desktop/native-bridge.cjs: launches only the installed native host, verifies startup messages, bounds packet sizes and permits one pending frame write. EOF shuts down the native host and its session camera.
- src/camera-output.js: copies newly decoded transformed frames, fits the image without cropping, adds the AI label, converts RGBA to BGRA and limits submission to 25fps. The original webcam is never used as a fallback output.

## Protocol

All integers are little endian. Each stdin packet is uint32 magic 0x31435A42, then uint32 payload length. Length must be 3,686,400 for a 720p BGRA frame or zero for an explicit clear. The host rejects other lengths before reading payload. End of stdin closes the camera. Host stdout is bounded newline-delimited JSON (ready or error). Credentials are never part of this protocol.

## Lifetime and security

One desktop instance per user. Camera lifetime is Session and access is CurrentUser. Source registration is machine-wide because Frame Server must activate the source, but camera creation is per user. Installed native binaries live in Program Files. Temporary frame data is accessible only to its owner and the two Windows service identities; the file is marked delete-on-close. Mapping contents are validated and expire after one second.

## Tradeoffs and unresolved tests

The first bridge performs CPU canvas readback, copies via Electron IPC and converts NV12 on the CPU. This is simple to inspect but may be too costly on low-power laptops; measure frame rate, latency and CPU use before claiming hardware compatibility. A future GPU/shared-texture path could reduce copies. Windows 10 and ARM support are not implemented.

The adapted source supports RGB32 and NV12; negative RGB output strides are handled, and NV12 allocation sizes are validated. Native code has not been compiled here. The Windows workflow supplies compilation and frame-transport tests, but requires a repository and a workflow run. Physical camera/WhatsApp tests remain necessary even after compilation succeeds.

References:
- https://learn.microsoft.com/en-us/windows/win32/api/mfvirtualcamera/nf-mfvirtualcamera-mfcreatevirtualcamera
- https://github.com/microsoft/Windows-Camera/tree/master/Samples/VirtualCamera
- https://api-onboarding.decart.ai/

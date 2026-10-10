# BenZica AI Camera — Windows 11 alpha source (v0.2)

This project now includes the Windows 11 native camera source, desktop frame bridge, and build/install scripts. **It is not a verified Windows executable or a finished installer.** The Windows native code has not been compiled in this Linux environment. WhatsApp compatibility has not been tested. No OBS installation is required by this design.

## What is implemented

- Electron desktop app with webcam preview, reference-photo upload, appearance prompts and a Decart Lucy 2.5 connection.
- Native Media Foundation source adapted from Microsoft's MIT-licensed sample.
- Native host that registers a session camera named BenZica AI Camera for the current user. Windows adds “Windows Virtual Camera” to the device name.
- A 1280×720, 25 fps BGRA bridge; the source advertises NV12 and RGB32 output.
- Fixed-size frame validation, bounded transmission, black output if frames are missing or over one second old, and shutdown handling.
- A visible AI-transformed label in outgoing frames.
- Windows build, registration, removal scripts and an optional GitHub Actions build workflow.

## Development prerequisites

Use Windows 11 x64, Visual Studio 2022 with Desktop development with C++, a recent Windows 11 SDK (10.0.26100.0 or newer recommended), CMake, and Node.js 24 LTS. A Mac, Windows 10 machine, or Windows ARM laptop is not supported by this native implementation.

In 64-bit PowerShell, open this extracted project folder and run:

```powershell
./scripts/build-windows.ps1
```

After the native build and tests succeed, open a separate 64-bit PowerShell **as administrator**, return to the project folder, and run:

```powershell
./scripts/install-native.ps1
```

The installation copies the native DLL/host to Program Files and registers only the project's own COM CLSID under HKLM. This registration needs elevation so Windows Frame Server can activate the source. It does not change security settings or PowerShell execution policy. If your machine's policy blocks the script, have its administrator review the script and apply their approved installation procedure.

Start the app from a normal, non-administrator terminal:

```powershell
npm start
```

1. Open your local webcam.
2. Enter your own Decart API key into the app and choose “Use key for this session.” Do not send the key in chat.
3. Choose a look and an optional authorized reference photo.
4. Start AI preview. This sends live video to Decart and may use paid credits.
5. Click Enable virtual camera.
6. In WhatsApp Desktop, select BenZica AI Camera (Windows Virtual Camera). If it is not listed, restart WhatsApp and inspect the app's error message.
7. Verify the other participant actually receives the transformed video; a local preview alone does not establish compatibility.

## Optional automated compilation

The included .github/workflows/windows-build.yml can be run manually after you put the project in your own GitHub repository. It compiles the DLL and host on a Windows runner, runs transport tests and packages a developer bundle. No repository was created, workflow run, or installer published in this session. A successful CI build still would not replace a physical Windows 11/WhatsApp test.

## Credentials and privacy

The key is entered locally, transferred to the isolated Electron main process, and held in memory. The renderer uses short-lived Decart tokens. No API key is bundled, logged or written to disk by this app. The app does not request microphone access; select your ordinary microphone in WhatsApp.

The native bridge uses a single temporary, file-backed frame buffer with restrictive ACLs for the current user, LocalSystem and LocalService. It is a latest-frame buffer, not a recording; Windows deletes it after the writer and all readers close. Because the mapping is file-backed, it is not a claim that frames never touch disk. Missing or stale frames render black. Use your own likeness or a reference you have permission to use, and let call participants know about the transformation.

## Removal

Close the app and calling applications. Run ./scripts/uninstall-native.ps1 from administrator PowerShell. It removes this source's registration and installed native files. If Windows reports that the DLL is in use, close camera apps or restart, then retry; do not disable security services.

## Verification status

**Passed here:** JavaScript syntax checks, Vite production build, model configuration check, and Node tests for frame validation and native-host lifecycle.

**Not performed:** Windows C++ compilation, native transport tests, COM installation, camera enumeration, live Decart streaming, remote WhatsApp call, performance and long-session testing. These are required before release. No signing certificate or API credentials were supplied.

See WINDOWS-TESTING.md for the concrete Windows checks and NATIVE-CAMERA.md for the implementation details. Native dependency licenses and pinned source commits are preserved in native/THIRD-PARTY.md and the adjacent license files.

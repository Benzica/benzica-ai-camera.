# Windows 11 acceptance checks

Status: not run. Use a Windows 11 x64 laptop.

1. Run scripts/build-windows.ps1. Save the first build failure, if any. Native output must contain both DLL and host EXE. CTest must pass before installing.
2. Run install-native.ps1 as administrator. Verify the registration points to the DLL under Program Files. Run the desktop app as the normal user.
3. Open local preview. Confirm that the camera releases after Stop and app exit. Confirm denied permissions produce an error without opening an AI session.
4. Add a Decart key locally. Start AI with a harmless lighting prompt, then try an authorized reference image. Verify prompt updates and errors.
5. Enable virtual camera. Check Windows camera settings and WhatsApp's camera selector. The source must enumerate and show the transformed image with the AI label.
6. Make a call to a consenting test participant. Have them confirm that they receive video and check for frozen frames. Run for ten minutes; note CPU, frame rate and audio/video delay. Keep WhatsApp's ordinary microphone selected.
7. Interrupt the internet. Output should become black within approximately one second after new transformed frames stop arriving. Restart the AI session and camera if needed. No original webcam fallback should appear.
8. Stop AI or close the app. The native host should exit, the session camera should disappear and the webcam should release. Reopen/restart to check recovery.
9. Test enable followed immediately by Stop to catch startup races. Test repeated start/stop, unplugged webcam, sleep/wake, another camera application, and stale/missing API credentials.
10. Close all camera apps and run uninstall-native.ps1. Verify only the BenZica source registration and its installed files are removed.

Do not mark WhatsApp support as verified based only on successful compilation or the local preview. Record OS build, WhatsApp version, webcam model and the remote participant's result.

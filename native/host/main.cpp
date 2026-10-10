#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfvirtualcamera.h>
#include <wrl/client.h>
#include <cstdio>
#include <vector>
#include "../common/FrameTransport.h"
using Microsoft::WRL::ComPtr;

static bool ReadExact(HANDLE input, void* buffer, DWORD size) {
    auto out = static_cast<BYTE*>(buffer);
    while (size) {
        DWORD received = 0;
        if (!ReadFile(input, out, size, &received, nullptr) || !received) return false;
        out += received; size -= received;
    }
    return true;
}
static int Error(const char* stage, HRESULT hr) {
    std::printf("{\"type\":\"error\",\"stage\":\"%s\",\"hresult\":\"0x%08lX\"}\n", stage, static_cast<unsigned long>(hr));
    std::fflush(stdout); return 1;
}
static int Run() {
    BzFrameWriter writer;
    HRESULT hr = writer.Create();
    if (FAILED(hr)) return Error("frame-buffer", hr);
    // Verify that the registered source can activate before reporting readiness.
    CLSID clsid{};
    CLSIDFromString(BZ_CLSID, &clsid);
    ComPtr<IMFActivate> activate;
    hr = CoCreateInstance(clsid, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&activate));
    if (FAILED(hr)) return Error("source-registration", hr);
    hr = activate->SetString(BZ_FRAME_PATH, writer.Path().c_str());
    if (FAILED(hr)) return Error("source-attributes", hr);
    ComPtr<IMFMediaSource> source;
    hr = activate->ActivateObject(IID_PPV_ARGS(&source));
    if (FAILED(hr)) return Error("source-activation", hr);
    source->Shutdown(); source.Reset(); activate->ShutdownObject(); activate.Reset();

    ComPtr<IMFVirtualCamera> camera;
    hr = MFCreateVirtualCamera(MFVirtualCameraType_SoftwareCameraSource, MFVirtualCameraLifetime_Session,
        MFVirtualCameraAccess_CurrentUser, L"BenZica AI Camera", BZ_CLSID, nullptr, 0, &camera);
    if (FAILED(hr)) return Error("camera-create", hr);
    hr = camera->SetString(BZ_FRAME_PATH, writer.Path().c_str());
    if (SUCCEEDED(hr)) hr = camera->Start(nullptr);
    if (FAILED(hr)) { camera->Shutdown(); return Error("camera-start", hr); }
    std::puts("{\"type\":\"ready\",\"width\":1280,\"height\":720,\"fps\":25}");
    std::fflush(stdout);

    HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
    std::vector<BYTE> frame(BZ_FRAME_BYTES);
    UINT32 packet[2]{};
    bool badPacket = false;
    while (ReadExact(input, packet, sizeof(packet))) {
        if (packet[0] != BZ_MAGIC || (packet[1] != 0 && packet[1] != BZ_FRAME_BYTES)) { badPacket = true; break; }
        if (!packet[1]) { writer.Publish(nullptr); continue; }
        if (!ReadExact(input, frame.data(), BZ_FRAME_BYTES)) break;
        writer.Publish(frame.data());
    }
    writer.Publish(nullptr);
    camera->Stop(); camera->Remove(); camera->Shutdown(); camera.Reset();
    return badPacket ? Error("frame-protocol", E_INVALIDARG) : 0;
}
int wmain() {
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr)) return Error("com", hr);
    hr = MFStartup(MF_VERSION);
    if (FAILED(hr)) { CoUninitialize(); return Error("media-foundation", hr); }
    int code = 1;
    try { code = Run(); } catch (...) { code = Error("unexpected", E_FAIL); }
    MFShutdown(); CoUninitialize(); return code;
}

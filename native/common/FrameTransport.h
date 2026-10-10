#pragma once
#include <windows.h>
#include <objbase.h>
#include <sddl.h>
#include <cstdint>
#include <cstddef>
#include <cstring>
#include <string>
#include <vector>

inline constexpr UINT32 BZ_WIDTH = 1280, BZ_HEIGHT = 720;
inline constexpr DWORD BZ_FRAME_BYTES = BZ_WIDTH * BZ_HEIGHT * 4;
inline constexpr UINT32 BZ_MAGIC = 0x31435A42; // BZC1, little endian
inline constexpr wchar_t BZ_CLSID[] = L"{AF297AF1-8265-4CA2-8A36-E06D117BD152}";
inline constexpr GUID BZ_FRAME_PATH = {0xb31f5714,0x10b4,0x47d5,{0xa3,0x68,0x75,0x76,0x6f,0xc8,0x89,0xf4}};
struct BzFrameHeader {
    UINT32 magic, width, height, bytes;
    UINT64 tick;
    UINT32 sequence;
    BYTE reserved[36];
};
static_assert(sizeof(BzFrameHeader) == 64);
inline constexpr DWORD BZ_MAPPING_BYTES = sizeof(BzFrameHeader) + BZ_FRAME_BYTES;

class BzMapping {
protected:
    HANDLE file = INVALID_HANDLE_VALUE, mapping = nullptr;
    BYTE* view = nullptr;
    bool Lock(bool exclusive) {
        OVERLAPPED o{};
        return LockFileEx(file, LOCKFILE_FAIL_IMMEDIATELY | (exclusive ? LOCKFILE_EXCLUSIVE_LOCK : 0), 0, 1, 0, &o) != FALSE;
    }
    void Unlock() { OVERLAPPED o{}; UnlockFileEx(file, 0, 1, 0, &o); }
public:
    BzMapping() = default;
    BzMapping(const BzMapping&) = delete;
    BzMapping& operator=(const BzMapping&) = delete;
    virtual ~BzMapping() { Close(); }
    void Close() {
        if (view) UnmapViewOfFile(view);
        if (mapping) CloseHandle(mapping);
        if (file != INVALID_HANDLE_VALUE) CloseHandle(file);
        view = nullptr; mapping = nullptr; file = INVALID_HANDLE_VALUE;
    }
};

class BzFrameReader : public BzMapping {
    std::wstring path;
    ULONGLONG lastAttempt = 0;
    bool Open() {
        if (view) return true;
        auto now = GetTickCount64();
        if (path.empty() || (lastAttempt && now - lastAttempt < 1000)) return false;
        lastAttempt = now;
        file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (file == INVALID_HANDLE_VALUE) return false;
        LARGE_INTEGER size{};
        if (!GetFileSizeEx(file, &size) || size.QuadPart != BZ_MAPPING_BYTES) { Close(); return false; }
        mapping = CreateFileMappingW(file, nullptr, PAGE_READONLY, 0, 0, nullptr);
        if (mapping) view = static_cast<BYTE*>(MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, BZ_MAPPING_BYTES));
        if (!view) { Close(); return false; }
        return true;
    }
public:
    void SetPath(const std::wstring& next) {
        if (path != next) { Close(); path = next; lastAttempt = 0; }
    }
    bool CopyTo(BYTE* target, LONG stride) {
        if (!target || (std::int64_t(stride) < 0 ? -std::int64_t(stride) : std::int64_t(stride)) < BZ_WIDTH * 4) return false;
        for (UINT32 row = 0; row < BZ_HEIGHT; ++row) memset(target + std::ptrdiff_t(row) * stride, 0, BZ_WIDTH * 4);
        if (!Open() || !Lock(false)) return false;
        const auto& header = *reinterpret_cast<const BzFrameHeader*>(view);
        const auto now = GetTickCount64();
        bool valid = header.magic == BZ_MAGIC && header.width == BZ_WIDTH && header.height == BZ_HEIGHT &&
            header.bytes == BZ_FRAME_BYTES && header.tick > 0 && header.tick <= now && now - header.tick < 1000;
        if (valid) {
            for (UINT32 row = 0; row < BZ_HEIGHT; ++row)
                memcpy(target + std::ptrdiff_t(row) * stride, view + sizeof(BzFrameHeader) + size_t(row) * BZ_WIDTH * 4, BZ_WIDTH * 4);
        }
        Unlock();
        return valid;
    }
};

class BzFrameWriter : public BzMapping {
    std::wstring path;
public:
    const std::wstring& Path() const { return path; }
    HRESULT Create() {
        HANDLE token = nullptr;
        if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return HRESULT_FROM_WIN32(GetLastError());
        DWORD length = 0;
        GetTokenInformation(token, TokenUser, nullptr, 0, &length);
        std::vector<BYTE> bytes(length);
        if (!GetTokenInformation(token, TokenUser, bytes.data(), length, &length)) {
            auto hr = HRESULT_FROM_WIN32(GetLastError()); CloseHandle(token); return hr;
        }
        CloseHandle(token);
        LPWSTR sid = nullptr;
        if (!ConvertSidToStringSidW(reinterpret_cast<TOKEN_USER*>(bytes.data())->User.Sid, &sid)) return HRESULT_FROM_WIN32(GetLastError());
        // Owner writes; LocalSystem and LocalService (Windows Frame Server) only read.
        std::wstring sddl = L"D:P(A;;FA;;;" + std::wstring(sid) + L")(A;;FR;;;SY)(A;;FR;;;LS)";
        LocalFree(sid);
        PSECURITY_DESCRIPTOR security = nullptr;
        if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(), SDDL_REVISION_1, &security, nullptr)) return HRESULT_FROM_WIN32(GetLastError());
        SECURITY_ATTRIBUTES sa{ sizeof(sa), security, FALSE };
        wchar_t directory[MAX_PATH + 1]{};
        const DWORD n = GetTempPathW(MAX_PATH, directory);
        GUID id{}; wchar_t guid[40]{};
        HRESULT hr = CoCreateGuid(&id);
        if (FAILED(hr) || !n || n >= MAX_PATH) { LocalFree(security); return FAILED(hr) ? hr : E_FAIL; }
        StringFromGUID2(id, guid, 40);
        path = std::wstring(directory) + L"BenZica-" + guid + L".benzica-frame";
        file = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            &sa, CREATE_NEW, FILE_ATTRIBUTE_TEMPORARY | FILE_FLAG_DELETE_ON_CLOSE, nullptr);
        auto error = GetLastError();
        LocalFree(security);
        if (file == INVALID_HANDLE_VALUE) return HRESULT_FROM_WIN32(error);
        LARGE_INTEGER size{}; size.QuadPart = BZ_MAPPING_BYTES;
        if (!SetFilePointerEx(file, size, nullptr, FILE_BEGIN) || !SetEndOfFile(file)) return HRESULT_FROM_WIN32(GetLastError());
        mapping = CreateFileMappingW(file, nullptr, PAGE_READWRITE, 0, BZ_MAPPING_BYTES, nullptr);
        if (mapping) view = static_cast<BYTE*>(MapViewOfFile(mapping, FILE_MAP_WRITE, 0, 0, BZ_MAPPING_BYTES));
        if (!view) return HRESULT_FROM_WIN32(GetLastError());
        memset(view, 0, BZ_MAPPING_BYTES);
        auto& header = *reinterpret_cast<BzFrameHeader*>(view);
        header.magic = BZ_MAGIC; header.width = BZ_WIDTH; header.height = BZ_HEIGHT; header.bytes = BZ_FRAME_BYTES;
        return S_OK;
    }
    bool Publish(const BYTE* bgra) {
        if (!view || !Lock(true)) return false;
        auto& header = *reinterpret_cast<BzFrameHeader*>(view);
        if (bgra) {
            memcpy(view + sizeof(BzFrameHeader), bgra, BZ_FRAME_BYTES);
            header.tick = GetTickCount64();
        } else {
            memset(view + sizeof(BzFrameHeader), 0, BZ_FRAME_BYTES);
            header.tick = 0;
        }
        ++header.sequence;
        Unlock();
        return true;
    }
};

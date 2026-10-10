#include "../common/FrameTransport.h"
#include <cstdio>
static int check(bool condition, const char* message) { if (!condition) std::fprintf(stderr, "%s\n", message); return condition ? 0 : 1; }
int main() {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    int failed = 0;
    {
        BzFrameWriter writer;
        if (FAILED(writer.Create())) return 1;
        BzFrameReader reader;
        reader.SetPath(writer.Path());
        std::vector<BYTE> input(BZ_FRAME_BYTES, 91), output(BZ_FRAME_BYTES, 255);
        failed += check(!reader.CopyTo(output.data(), BZ_WIDTH * 4) && output[0] == 0, "Initial output must be black");
        failed += check(writer.Publish(input.data()), "Publish failed");
        failed += check(reader.CopyTo(output.data(), BZ_WIDTH * 4) && output == input, "Frame copy mismatch");
        Sleep(1100);
        failed += check(!reader.CopyTo(output.data(), BZ_WIDTH * 4) && output[0] == 0, "Stale frame must become black");
        writer.Publish(input.data()); writer.Publish(nullptr);
        failed += check(!reader.CopyTo(output.data(), BZ_WIDTH * 4) && output[0] == 0, "Clear must blank output");
        failed += check(!reader.CopyTo(output.data(), 1), "Invalid stride must be rejected");
    }
    CoUninitialize(); return failed ? 1 : 0;
}

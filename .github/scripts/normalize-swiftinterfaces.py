#!/usr/bin/env python3
"""
Normalizes Expo prebuilt Swift interfaces (.swiftinterface and .tar.gz archives)
to match the active Swift compiler toolchain.

This resolves:
1. Compiler version mismatch errors ("this SDK is not supported by the compiler")
2. Unknown attribute errors ("unknown attribute '_Concurrency.MainActor'")
"""

import os
import sys
import re
import tarfile
import io
import subprocess

def get_swift_version():
    try:
        out = subprocess.check_output(['swift', '--version'], text=True).strip().splitlines()[0]
        # Match e.g. "Apple Swift version 6.1.2 ..."
        m = re.search(r'version\s+([0-9.]+)', out)
        short_ver = m.group(1) if m else '6.1'
        return out, short_ver
    except Exception as e:
        print(f"Warning: failed to query swift version ({e}), using fallback")
        return "Apple Swift version 6.1.2 (swiftlang-6.1.2.1.2 clang-1700.0.13.5)", "6.1.2"

def patch_swiftinterface_content(content: str, full_version_line: str, short_ver: str) -> str:
    # 1. Update compiler version line to match active compiler
    content = re.sub(r'//\s*swift-compiler-version:.*', f'// swift-compiler-version: {full_version_line}', content)
    # 2. Update interface-compiler-version flag
    content = re.sub(r'-interface-compiler-version\s+[0-9.]+', f'-interface-compiler-version {short_ver}', content)
    # 3. Normalize _Concurrency.MainActor to standard @MainActor
    content = content.replace('@_Concurrency.MainActor', '@MainActor')
    content = content.replace('_Concurrency.MainActor', 'MainActor')
    return content

def patch_tar_gz(path: str, full_version_line: str, short_ver: str) -> bool:
    try:
        with tarfile.open(path, 'r:gz') as tar_in:
            members = tar_in.getmembers()
            has_swiftinterface = any(m.name.endswith('.swiftinterface') for m in members)
            if not has_swiftinterface:
                return False

            patched_members = []
            for m in members:
                f = tar_in.extractfile(m)
                if f and m.name.endswith('.swiftinterface'):
                    raw = f.read().decode('utf-8', errors='ignore')
                    patched = patch_swiftinterface_content(raw, full_version_line, short_ver)
                    data = patched.encode('utf-8')
                    info = tarfile.TarInfo(name=m.name)
                    info.size = len(data)
                    info.mode = m.mode
                    info.mtime = m.mtime
                    info.type = m.type
                    patched_members.append((info, io.BytesIO(data)))
                else:
                    data = f.read() if f else None
                    patched_members.append((m, io.BytesIO(data) if data is not None else None))

        tmp_path = path + '.tmp'
        with tarfile.open(tmp_path, 'w:gz') as tar_out:
            for info, data_io in patched_members:
                if data_io is not None:
                    tar_out.addfile(info, data_io)
                else:
                    tar_out.addfile(info)
        os.replace(tmp_path, path)
        print(f"✅ Patched archive: {path}")
        return True
    except Exception as e:
        print(f"⚠️ Error patching {path}: {e}")
        return False

def patch_plain_file(path: str, full_version_line: str, short_ver: str) -> bool:
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        patched = patch_swiftinterface_content(content, full_version_line, short_ver)
        if patched != content:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(patched)
            print(f"✅ Patched file: {path}")
            return True
    except Exception as e:
        print(f"⚠️ Error patching {path}: {e}")
    return False

def main():
    target_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
    full_ver, short_ver = get_swift_version()
    print(f"🔧 Target Swift toolchain: {full_ver} (short: {short_ver})")
    print(f"🔍 Scanning directory: {target_dir}")

    tar_count = 0
    file_count = 0

    for root, dirs, files in os.walk(target_dir):
        for f in files:
            path = os.path.join(root, f)
            if f.endswith('.tar.gz'):
                if patch_tar_gz(path, full_ver, short_ver):
                    tar_count += 1
            elif f.endswith('.swiftinterface'):
                if patch_plain_file(path, full_ver, short_ver):
                    file_count += 1

    print(f"🎉 Done! Patched {tar_count} archives and {file_count} swiftinterface files.")

if __name__ == '__main__':
    main()

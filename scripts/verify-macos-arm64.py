#!/usr/bin/env python3

from pathlib import Path
import argparse
import plistlib
import subprocess
import sys


SYSTEM_PREFIXES = ("/System/Library/", "/usr/lib/")


def macho_dependencies(path):
    result = subprocess.run(
        ["otool", "-L", str(path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    if result.returncode != 0:
        return None
    return [line.strip().split(" (", 1)[0] for line in result.stdout.splitlines()[1:]]


def is_install_id(binary, dependency, index):
    return index == 0 and Path(dependency).name == binary.name


def verify(bundle):
    errors = []
    macho_count = 0

    for path in bundle.rglob("*"):
        if not path.is_file() or path.is_symlink():
            continue
        lipo = subprocess.run(
            ["lipo", "-archs", str(path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        if lipo.returncode != 0:
            continue

        macho_count += 1
        architectures = lipo.stdout.strip().split()
        if architectures != ["arm64"]:
            errors.append(f"{path}: expected only arm64, found {' '.join(architectures)}")

        dependencies = macho_dependencies(path) or []
        for index, dependency in enumerate(dependencies):
            if is_install_id(path, dependency, index):
                continue
            if dependency.startswith("/") and not dependency.startswith(SYSTEM_PREFIXES):
                errors.append(f"{path}: external dependency {dependency}")
            elif dependency.startswith("@loader_path/"):
                target = (path.parent / dependency.removeprefix("@loader_path/")).resolve()
                if not target.is_file() or bundle not in target.parents:
                    errors.append(f"{path}: unresolved bundle dependency {dependency}")
            elif dependency.startswith(("@executable_path/", "@rpath/")):
                errors.append(f"{path}: non-local dependency {dependency}")

    info_path = bundle / "Contents" / "Info.plist"
    with info_path.open("rb") as info_file:
        info = plistlib.load(info_file)
    if info.get("LSMinimumSystemVersion") != "11.0":
        errors.append(f"{info_path}: LSMinimumSystemVersion must be 11.0")

    signature = subprocess.run(
        ["codesign", "--verify", "--deep", "--strict", str(bundle)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if signature.returncode != 0:
        errors.append(f"Invalid code signature: {signature.stdout.strip()}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)

    print(f"Verified {macho_count} Mach-O files: native arm64, self-contained, signed")


def main(argv=tuple(sys.argv[1:])):
    parser = argparse.ArgumentParser(
        description="Verify a self-contained, native Apple Silicon app bundle."
    )
    parser.add_argument("bundle", metavar="BUNDLE", type=Path)
    arguments = parser.parse_args(argv)
    bundle = arguments.bundle.resolve()
    if not bundle.is_dir() or bundle.suffix != ".app":
        parser.error(f"Not an app bundle: {bundle}")
    verify(bundle)


if __name__ == "__main__":
    main()

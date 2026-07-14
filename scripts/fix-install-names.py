#!/usr/bin/env python3

from collections import deque
from pathlib import Path
import argparse
import os
import shutil
import subprocess
import sys


SYSTEM_PREFIXES = ("/System/Library/", "/usr/lib/")
HOMEBREW_LIBRARY_PATH = Path("/opt/homebrew/lib")


def dependencies(binary):
    result = subprocess.run(
        ["otool", "-L", str(binary)],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    if result.returncode != 0:
        return None
    return [line.strip().split(" (", 1)[0] for line in result.stdout.splitlines()[1:]]


def framework_relative_path(dependency):
    parts = Path(dependency).parts
    for index, part in enumerate(parts):
        if part.endswith(".framework"):
            return Path(*parts[index:])
    return None


def loader_path(binary, framework_path, relative_library):
    relative_frameworks = Path(os.path.relpath(framework_path, binary.parent))
    return str(Path("@loader_path") / relative_frameworks / relative_library)


def is_install_id(binary, dependency, index):
    return index == 0 and Path(dependency).name == binary.name


def bundled_reference(dependency, framework_path):
    if dependency.startswith("@executable_path/"):
        marker = "/Frameworks/"
        if marker not in dependency:
            return None
        relative_library = Path(dependency.split(marker, 1)[1])
    elif dependency.startswith("@rpath/"):
        relative_library = Path(dependency.removeprefix("@rpath/"))
    else:
        return None

    bundled_dependency = framework_path / relative_library
    return bundled_dependency, relative_library


def fix_bundle(bundle_path):
    framework_path = bundle_path / "Contents" / "Frameworks"
    if not framework_path.is_dir():
        raise RuntimeError(f"Missing Frameworks directory: {framework_path}")

    queue = deque(path for path in bundle_path.rglob("*") if path.is_file())
    visited = set()

    while queue:
        binary = queue.popleft()
        real_binary = binary.resolve()
        if real_binary in visited:
            continue
        binary = real_binary

        binary_dependencies = dependencies(binary)
        if binary_dependencies is None:
            continue
        visited.add(real_binary)
        binary.chmod(binary.stat().st_mode | 0o200)

        for index, dependency in enumerate(binary_dependencies):
            if is_install_id(binary, dependency, index):
                if dependency.startswith("/") and not dependency.startswith(SYSTEM_PREFIXES):
                    new_id = f"@rpath/{binary.name}"
                    subprocess.run(
                        ["install_name_tool", "-id", new_id, str(binary)], check=True
                    )
                continue

            if dependency.startswith(SYSTEM_PREFIXES):
                continue

            reference = bundled_reference(dependency, framework_path)
            if reference is not None:
                bundled_dependency, relative_library = reference
                if not bundled_dependency.exists():
                    source = HOMEBREW_LIBRARY_PATH / relative_library.name
                    if not source.exists():
                        raise RuntimeError(
                            f"Missing bundled dependency {dependency} required by {binary}"
                        )
                    shutil.copy2(source.resolve(), bundled_dependency)
                    bundled_dependency.chmod(
                        bundled_dependency.stat().st_mode | 0o200
                    )
                    queue.append(bundled_dependency)
                    print(f"Copied {source} to {bundled_dependency}")
            elif dependency.startswith("/"):
                framework_relative = framework_relative_path(dependency)
                if framework_relative is not None:
                    bundled_dependency = framework_path / framework_relative
                    if not bundled_dependency.exists():
                        raise RuntimeError(
                            f"macdeployqt did not bundle {dependency} required by {binary}"
                        )
                    relative_library = framework_relative
                else:
                    source = Path(dependency)
                    if not source.exists():
                        raise RuntimeError(
                            f"Missing dependency {dependency} required by {binary}"
                        )
                    bundled_dependency = framework_path / source.name
                    relative_library = Path(source.name)
                    if not bundled_dependency.exists():
                        shutil.copy2(source.resolve(), bundled_dependency)
                        bundled_dependency.chmod(
                            bundled_dependency.stat().st_mode | 0o200
                        )
                        queue.append(bundled_dependency)
                        print(f"Copied {source} to {bundled_dependency}")
            else:
                continue

            target = loader_path(binary, framework_path, relative_library)
            if dependency == target:
                continue
            print(f"Fixing {dependency} in {binary} -> {target}")
            subprocess.run(
                ["install_name_tool", "-change", dependency, target, str(binary)],
                check=True,
            )


def main(argv=tuple(sys.argv[1:])):
    parser = argparse.ArgumentParser(
        description="Make a macOS app bundle independent of Homebrew and other local paths."
    )
    parser.add_argument("bundle", metavar="BUNDLE", type=Path)
    arguments = parser.parse_args(argv)

    bundle_path = arguments.bundle.resolve()
    if not bundle_path.is_dir() or bundle_path.suffix != ".app":
        parser.error(f"Not an app bundle: {bundle_path}")
    fix_bundle(bundle_path)


if __name__ == "__main__":
    main()

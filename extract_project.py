#!/usr/bin/env python3
"""Extract structured project dumps safely, without overwriting originals."""

import os
import re
from pathlib import Path, PurePosixPath


def _safe_target(output_dir: Path, file_path: str) -> Path:
    if not file_path or "\\" in file_path or ":" in file_path:
        raise ValueError("Invalid extracted path")
    relative = PurePosixPath(file_path)
    if relative.is_absolute() or ".." in relative.parts or ".git" in relative.parts:
        raise ValueError("Path escapes extraction directory")
    target = output_dir.joinpath(*relative.parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.parent.resolve().is_relative_to(output_dir):
        raise ValueError("Extraction directory contains an unsafe symlink")
    return target


def extract_files(input_file, output_dir):
    root = Path(output_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    with open(input_file, "r", encoding="utf-8") as source:
        content = source.read()
    pattern = r"={16,}\nFile: (.+?)\n={16,}\n"
    matches = list(re.finditer(pattern, content))
    created, skipped = [], []
    for index, match in enumerate(matches):
        file_path = match.group(1).strip()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        file_content = content[match.end():end].rstrip("\n")
        if file_content.endswith("=" * 16):
            file_content = file_content[:file_content.rfind("=" * 16)].rstrip("\n")
        try:
            target = _safe_target(root, file_path)
            # Exclusive creation rejects existing targets and final-component
            # symlinks rather than replacing user files during extraction.
            fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as destination:
                destination.write(file_content)
            created.append(file_path)
            print(f"Created: {file_path}")
        except (ValueError, OSError) as error:
            skipped.append((file_path, str(error)))
            print(f"Skipped: {file_path} - {type(error).__name__}")
    return created, skipped


if __name__ == "__main__":
    input_file = "/workspace/user_input_files/pasted-text-2025-12-05T22-49-01.txt"
    output_dir = "/workspace"
    print(f"Extracting files from {input_file}")
    created, skipped = extract_files(input_file, output_dir)
    print(f"Created {len(created)} files; skipped {len(skipped)} files")

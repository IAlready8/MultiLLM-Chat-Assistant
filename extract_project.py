#!/usr/bin/env python3
"""
Extract all files from the Next.js project dump file.
"""

import os
import re
from pathlib import Path

def extract_files(input_file, output_dir):
    """Extract all files from the dump file."""

    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by the file separator pattern
    # Pattern: ================\nFile: path\n================\n
    pattern = r'={16,}\nFile: (.+?)\n={16,}\n'

    # Find all files
    matches = list(re.finditer(pattern, content))

    files = []
    for i, match in enumerate(matches):
        file_path = match.group(1).strip()

        # Get content start position (after the second separator)
        content_start = match.end()

        # Get content end position (before next file marker or end of file)
        if i + 1 < len(matches):
            content_end = matches[i + 1].start()
        else:
            content_end = len(content)

        # Extract content
        file_content = content[content_start:content_end].rstrip('\n')

        # Remove trailing separator if present
        if file_content.endswith('=' * 16):
            file_content = file_content[:file_content.rfind('=' * 16)].rstrip('\n')

        files.append((file_path, file_content))

    # Create all files
    created_files = []
    skipped_files = []

    for file_path, file_content in files:
        # Skip invalid paths
        if not file_path or file_path.startswith('==='):
            continue

        # Create full path
        full_path = os.path.join(output_dir, file_path)

        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        try:
            # Write the file
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(file_content)

            created_files.append(file_path)
            print(f"✓ Created: {file_path}")
        except Exception as e:
            skipped_files.append((file_path, str(e)))
            print(f"✗ Failed: {file_path} - {str(e)}")

    return created_files, skipped_files

if __name__ == '__main__':
    input_file = '/workspace/user_input_files/pasted-text-2025-12-05T22-49-01.txt'
    output_dir = '/workspace'

    print(f"Extracting files from {input_file}...")
    print(f"Output directory: {output_dir}")
    print("=" * 60)

    created, skipped = extract_files(input_file, output_dir)

    print("=" * 60)
    print(f"\n✓ Successfully created {len(created)} files")

    if skipped:
        print(f"✗ Failed to create {len(skipped)} files:")
        for path, error in skipped:
            print(f"  - {path}: {error}")

    print(f"\nTotal files processed: {len(created) + len(skipped)}")

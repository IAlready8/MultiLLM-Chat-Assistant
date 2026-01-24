#!/bin/bash
# RealMultiLLM - macOS Installation Script
# This script ensures a consistent development environment.

set -e # Exit immediately if a command exits with a non-zero status.

echo "🚀 Starting RealMultiLLM Environment Setup..."

# 1. Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "Homebrew not found. Please install it first from https://brew.sh"
    exit 1
fi

# 2. Check for Python 3.10+
if ! command -v python3.10 &> /dev/null; then
    echo "Python 3.10+ not found. Installing via Homebrew..."
    brew install python@3.11
fi

# 3. Create a Virtual Environment
if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment in ./.venv..."
    python3.11 -m venv .venv
fi

# 4. Activate Virtual Environment and Install Dependencies
source .venv/bin/activate
echo "✅ Virtual Environment activated."

echo "Installing project dependencies from pyproject.toml..."
pip install --upgrade pip
pip install "poetry"
poetry install

echo "✅ Dependencies installed."
echo "🎉 Setup complete! To activate the environment, run: source .venv/bin/activate"
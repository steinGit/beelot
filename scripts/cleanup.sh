#!/bin/bash

# Script to remove *~ files and move *.bak* files to /tmp/<YYYYMMDD_HHmmss>

# Get the current timestamp in the required format
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Define the target directory
TARGET_DIR="/tmp/$TIMESTAMP"

# Create the target directory if it doesn't exist
mkdir -p "$TARGET_DIR"

# Find and remove *~ files
find . -type f -name "*~" -exec rm -f {} +

# Find and move *.bak* files to the target directory
find . -type f -name "*.bak*" -exec mv {} "$TARGET_DIR" \;

echo "Operation completed."
echo "Backup files moved to: $TARGET_DIR"


# DSA Tracker

A lightweight personal study tracker for DSA problems and review blocks. It uses a plain HTML/CSS/JavaScript front end and a stdlib-only Python server for local file persistence.

## What it does

- Tracks problem repetition with the spaced-repetition schedule already built into the app.
- Keeps System 1 and System 2 review items in one place.
- Saves progress to `data.json` in the project folder so your data follows you between machines.
- Works without any package manager or build tool.

## Run it

### macOS

- Double-click `start.command`, or
- In Terminal, run:

  ```bash
  python3 server.py
  ```

### Windows

- Double-click `start.bat`, or
- In Command Prompt / PowerShell, run:

  ```powershell
  python server.py
  ```

### Linux

```bash
python3 server.py
```

The server opens the app in your default browser and serves the project from the same folder.

## Data file

The app stores its data in `data.json` alongside the project files. The JSON shape is kept the same as the original project so the tracker continues to work without any migration step.

## Move it between machines

1. Copy the whole project folder.
2. Keep `data.json` with it.
3. Run the same start script or `python server.py` from the copied folder.

This keeps your study history in the same place as the app itself.

## Notes

- The project intentionally stays plain HTML + JavaScript + Python stdlib.
- No external dependencies are required.
- Relative paths are used throughout, so it works the same on Windows, macOS, and Linux.

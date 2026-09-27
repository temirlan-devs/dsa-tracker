# DSA Tracker

A lightweight personal study tracker for DSA problems and review blocks. It uses a plain HTML/CSS/JavaScript front end and a stdlib-only Python server for local file persistence.

## What it does

- Tracks problem repetition with the spaced-repetition schedule already built into the app.
- Keeps System 1 and System 2 review items in one place.
- Saves progress to `data.json` in the project folder so your data follows you between machines.
- Works without any package manager or build tool.

## How the review system works

The tracker uses two layers of spaced repetition. Anything due on a given day shows up under **Due today**.

### System 1 - per problem

Every problem you add is reviewed twice, counted from the day you solved it:

- **+1** - one day later
- **+3** - three days later

For each review you press **Pass** (solved it cleanly) or **Fail** (struggled). A fail simply reschedules that review to the next day; a pass marks it done. A problem is "fully reviewed" once both its +1 and +3 are passed.

### System 2 - per block

A *block* is a topic (e.g. "Arrays & Hashing"). When you finish a block, it gets two whole-block reviews, counted from the finish date:

- **+7** - one week later
- **+30** - one month later

A block review asks you to re-solve every problem in the block and mark each Pass/Fail. The outcome follows an **80% rule**:

- **≥ 80% passed** → the block clears and moves to its next stage (+7 → +30, and passing +30 **locks** the block). Any problems you failed are dropped back into System 1 to re-drill on their own.
- **< 80% passed** → the block didn't stick, so the whole block is rescheduled for another review in 7 days.

Your marks are saved as you go, so a long block review can be paused and finished the next day.

### Take a break

Starting a break pauses all reviews. When you resume, the whole schedule is shifted **forward** so the oldest pending review lands on your return day, keeping the original gaps between reviews - you come back to a normal pace instead of a pile of overdue items. The shift is forward-only: if nothing is overdue, nothing moves.

### Change log (per item)

Each problem and block has a small **log** - a list of auto-dated notes. Use it to record any manual change you make (shifting a date, resolving something early, etc.), so if a date ever looks off later, you can see what you did and why. It's separate from a problem's learning `note`.

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

# Security model

Desktop Steward lets an AI chat app read, search and change files on this computer. This document says what it protects against, how, and what it does not protect against. It is written to be checked, not to reassure.

## What the AI gets

- **Read & search:** only the folders the user listed as readable.
- **Change:** only the folders the user listed as changeable. Everything else is read-only or invisible.
- **Never, regardless of settings:** password stores, keychains, SSH/GPG/cloud keys, browser profiles, mail and messages, shell start-up files, auto-start folders, system folders, the chat app's own data, Desktop Steward's own history and trash, and any file whose name marks it as a secret (`.env`, `*.pem`, `*.key`, `*.kdbx`, `id_rsa`, `wallet`, …).
- **No terminal, no network, no programs** in Simple mode. The AI cannot run commands, download, upload, or create files that run on double-click (`.exe`, `.bat`, `.ps1`, `.sh`, `.command`, `.app`, `.lnk`, `.js`, `.py`, …). Hidden files and folders are not changed.

## Human in the loop

Deleting anything, replacing an existing file, and moving more than a handful of items ask the person first. The question is shown through a channel the model cannot answer on its own: the chat app's confirmation dialog (MCP elicitation) or, when the app has none, a native system dialog on this computer. There is deliberately no "I already asked" argument on any tool.

## Undo

Before a file is replaced or edited, a copy is kept. Moves are recorded. Deleted items go to Desktop Steward's own holding area, not straight to the system trash. Each of these can be reverted for a week with the `undo` tool. Undo refuses to overwrite anything that changed in the meantime and says so. Copies live under `~/.desktop-steward` with permissions for this account only.

## Path handling

Every path is expanded, made absolute and resolved through symlinks before any rule is checked, so `../`, `~`, links and `/var` vs `/private/var` cannot route around a folder rule. Forbidden places are checked before allowed ones. A write target that is a symlink or a hard link to elsewhere is refused. On Windows, alternate data streams, reserved device names, trailing dots/spaces, 8.3 short names and network paths are refused. Names are compared case-insensitively on macOS and Windows and in NFC normalisation.

Limits: 200 items per operation, 20 MB per written file, no replacing files over 200 MB (no copy could be kept), 500 entries per listing, 20 s per search.

## Threats and honest answers

| Threat | Answer |
|---|---|
| A document in Downloads tells the AI to "copy ~/.ssh to a shared folder" (prompt injection) | `.ssh` is unreachable, there is no network tool, and nothing is written outside the changeable folders. The AI could still read and *summarise* any file inside readable folders into the chat; choose readable folders with that in mind. |
| The AI deletes or renames the wrong files | Deletion always asks; moves are undoable; nothing is overwritten by a move; the opened folders themselves cannot be deleted or moved. |
| The AI writes a script and the user double-clicks it later | Executable and script extensions are refused in Simple mode. |
| A chat account is compromised and drives the AI | Same limits as above apply, but a person at the computer still sees and must approve the risky steps. Keep MFA on the chat account. |
| Another local user reads kept copies or the activity log | `~/.desktop-steward` is mode 0700. |
| A race that swaps a file for a symlink between check and use (TOCTOU) | Not fully closed. It requires an attacker already running code as this user, at which point they do not need Desktop Steward. |
| Secrets inside an ordinary document in a readable folder | Not detected. Readable folders are the user's choice; the defaults are Desktop, Documents, Downloads, Pictures. |
| Cloud placeholder files (iCloud, OneDrive) being downloaded when read | Not yet handled; planned. |
| Standard and Expert modes (terminal) | Not shipped. When they ship, commands will run under a per-command approval and, where the OS allows, a sandbox profile. The terminal will be documented as a weaker boundary than the file tools, as every tool of this kind must. |

## Reporting

Send security reports to the address on the website. Reports are acknowledged, fixed and credited.

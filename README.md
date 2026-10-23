# Desktop Steward

Safe hands for Claude on your computer. A free extension for Claude Desktop that lets Claude tidy, find and organize your files with plain folder rules, a confirmation window before anything risky, and undo for every change.

Website and download: https://desktopsteward.com

## What it does

- **Rules in plain words.** You choose which folders Claude may read and which it may change. Everything else is invisible to it.
- **Asks before anything risky.** Deleting, replacing a file, or moving many files opens a confirmation window on your computer. The model cannot answer it.
- **Undo for 7 days.** Old versions are kept before a change; deleted files wait in a holding area; `undo` brings them back.
- **Off limits, always.** Passwords, keys, browser data, mail, system folders, and anything that runs on double-click. No terminal, no network, no telemetry.
- **Ready-made tasks** in the chat's + menu: tidy Downloads, find duplicate photos, free disk space, tidy the Desktop, find documents by topic, rename photos by date.

Read [SECURITY.md](SECURITY.md) for the threat model, including what it does not protect against.

## Install

Download the `.mcpb` for your platform from the website or the Releases page and double-click it. Claude Desktop installs it like a browser extension. Press Save; the defaults are sensible.

## Tools

`list_folder`, `read_file` (text, PDF, DOCX, images), `write_file`, `edit_file`, `create_folder`, `move_files`, `delete_files`, `search_files`, `file_info`, `disk_usage`, `find_duplicates`, `undo`, `history`, `show_rules`.

## Public core and the official bundle

This repository is the core of Desktop Steward: the file tools, the folder rules, the confirmation step and undo. Everything that touches your files is here and can be audited. The official bundle from desktopsteward.com is built from this core plus extras that are not in this repository: a local panel with Undo buttons, images-to-PDF, zip/unzip, opening files, remote access from the phone (Pro). The extras use the same rules, confirmations and undo as the core.

## Build from source

```
npm install
npm test            # builds and runs the test suite
npm run bundle      # builds build/desktop-steward-<version>-<platform>.mcpb for this platform
```

Node.js 22 or newer. The bundle is platform-specific because the bundled search binary (ripgrep) is.

## Configuration

Settings live in the Claude Desktop extension panel, or in `~/.desktop-steward/config.json`:

| Key | Default | Meaning |
|---|---|---|
| `readFolders` | Desktop, Documents, Downloads, Pictures | Folders Claude may read and search |
| `writeFolders` | Documents/AI Workspace, Downloads | Folders Claude may change |
| `askBeforeDelete` | true | Confirmation window before deleting |
| `confirmThreshold` | 10 | Moving more items than this asks first |
| `keepHistoryDays` | 7 | How long undo copies and deleted files are kept |

## License

MIT. Copyright ED&EU LTD. Desktop Steward is not affiliated with Anthropic.

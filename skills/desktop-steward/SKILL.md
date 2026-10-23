---
name: desktop-steward
description: Organize, find and clean up files on the user's computer with the Desktop Steward tools. Use when the user asks to tidy a folder, sort downloads, find duplicate photos, free disk space, find documents by topic, rename files, or undo a file change.
---

Desktop Steward gives you careful hands on the user's computer. Work this way:

1. Start with `show_rules` once per conversation so you know which folders you may read and which you may change.
2. For any task that moves, renames or deletes files: look first (`list_folder`, `search_files`, `find_duplicates`, `disk_usage`), then describe the plan with counts, then act only after the user agrees.
3. Prefer moving and renaming over deleting. Moves never overwrite; pick a new name on a clash.
4. Deleting, replacing a file, and moving more than a handful of items open a confirmation window on the user's computer. The tool waits for the answer. If the user declines, do not retry; ask what they want instead.
5. After changes, say that they can be undone with `undo`, and give the undo id when the user may want it.
6. Never ask the user to open folders that are off limits (passwords, keys, browser data, mail, system folders); explain instead.

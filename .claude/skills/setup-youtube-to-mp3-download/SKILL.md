---
name: setup-youtube-to-mp3-download
description: Walk the user through installing yt-dlp in a-Shell on iPhone, then give copy-paste download commands for each YouTube link they send, one at a time. Use when the user asks how to set up YouTube to mp3 downloads, wants to download YouTube audio to their phone, or invokes /setup-youtube-to-mp3-download.
---

# Setup YouTube to mp3 download (iPhone, a-Shell)

The user is usually on their phone. Cloud sessions run from a data-center IP, so YouTube blocks downloads there ("Sign in to confirm you're not a bot"). Do NOT try to download in the cloud container and do NOT ask for the user's YouTube cookies. The downloads run on the user's own iPhone, in the free **a-Shell** app, on their own connection. Your job is to give exact copy-paste commands.

Keep every command in its own code block so it is easy to copy on a phone.

## Step 1: Give the one-time setup

If the user says they already did the setup, skip to Step 2. Otherwise send these as separate code blocks, in order, and tell them to paste one at a time into a-Shell (App Store, free; use "a-Shell", not "a-Shell mini"):

1. Create the folder:
```
mkdir ~/Documents/bin
cd ~/Documents/bin
```
2. Download yt-dlp:
```
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O
```
3. Add the alias:
```
echo "alias yt-dlp 'python ~/Documents/bin/yt-dlp'" | tee -a ~/Documents/.profile
```
4. Create the config (optional but recommended):
```
echo "--restrict-filenames" | tee -a ~/Documents/bin/yt-dlp.conf
echo "--ignore-errors" | tee -a ~/Documents/bin/yt-dlp.conf
echo "--no-mtime" | tee -a ~/Documents/bin/yt-dlp.conf
echo "-P ~/Documents" | tee -a ~/Documents/bin/yt-dlp.conf
echo "-o '%(uploader)s/%(upload_date)s %(title)s %(id)s.%(ext)s'" | tee -a ~/Documents/bin/yt-dlp.conf
cat ~/Documents/bin/yt-dlp.conf
```
5. Close and reopen a-Shell (or run `source ~/Documents/.profile`) so the alias works.

Notes to mention:
- Downloaded files appear in the Files app under **On My iPhone > a-Shell**, inside a folder named after the uploader.
- On older iOS versions, if ffmpeg errors appear, run:
```
cd ~/Documents/bin
curl -L https://github.com/holzschu/a-Shell-commands/releases/download/0.1/ffmpeg.wasm -O
curl -L https://github.com/holzschu/a-Shell-commands/releases/download/0.1/ffprobe.wasm -O
```

Then ask: "Send me the YouTube link or links you want as mp3."

## Step 2: Give one download command per link

For each link the user sends, reply with a separate labeled code block, one per video:

**Video 1:**
```
yt-dlp -x --audio-format mp3 "<LINK>"
```

- Use the exact link they sent, in double quotes.
- Remind them to wait for each download to finish before pasting the next.
- If a link includes extra parameters like `&list=...`, keep it as-is but add `--no-playlist` to the command unless they want the whole playlist.

## Step 3: Troubleshooting

- **ffmpeg / mp3 conversion error:** use the m4a fallback, which plays natively on iPhone:
```
yt-dlp -f "bestaudio[ext=m4a]" "<LINK>"
```
- **Update yt-dlp if downloads suddenly fail** (YouTube changes often): re-run the `curl -L ... -O` command from setup step 2.
- **"Sign in to confirm you're not a bot" on the phone itself:** try again later or on Wi-Fi vs cellular; do not ask for cookies.
- Ask the user to paste the exact error text if something else fails, and help from there.

## Reminders

- Never run these downloads in the cloud session. They will fail and the files cannot be saved to the user's phone.
- Only help with content the user has the right to download.

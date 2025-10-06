# Migrating from poedb CDN to Official PoE CDN

## What Changed

### Problem
- Bundled images were using poedb CDN URLs (`cdn.poe2db.tw`)
- This caused issues and we should use official PoE CDN instead

### Solution
Updated the image download and resolution system to use official PoE CDN (`web.poecdn.com`)

## Files Modified

1. **scripts/downloadImages.ts**
   - Added `transformToOfficialCdn()` function to convert poedb URLs → official URLs
   - Downloads now use `https://web.poecdn.com/image/...` instead of `https://cdn.poe2db.tw/image/...`
   - Added proper User-Agent header for PoE CDN requests
   - Fixed filename generation to use clean base64 encoding

2. **src/main/services/imageResolver.ts**
   - Added URL transformation during index building
   - Can resolve images using either old poedb URLs or new official URLs (for smooth transition)
   - Indexes both URL formats to handle mixed data

3. **src/main/main.ts**
   - Fixed MaxListenersExceededWarning by adding `setMaxListeners(20)`
   - Added `overflow:hidden` to splash CSS to remove scrollbar

4. **scripts/cleanOldImages.ts** (NEW)
   - Utility to remove old poedb images from bundled-images/

## How to Migrate

### Option 1: Clean Slate (Recommended)
```bash
# 1. Remove old poedb images
cd packages/overlay
npx tsx scripts/cleanOldImages.ts

# 2. Download fresh from official PoE CDN
npx tsx scripts/downloadImages.ts

# 3. Rebuild TypeScript
npm run build

# 4. Test the overlay
npm start
```

### Option 2: Keep Existing (works but not ideal)
The imageResolver now handles both URL formats, so existing images will continue to work. New downloads will use official CDN.

Just rebuild and test:
```bash
cd packages/overlay
npm run build
npm start
```

## What URLs Look Like

### Old (poedb):
```
https://cdn.poe2db.tw/image/Art/2DArt/SkillIcons/passives/MasteryBlank.webp
```

### New (official):
```
https://web.poecdn.com/image/Art/2DArt/SkillIcons/passives/MasteryBlank.webp
```

## Image Filename Format

Images are stored in `bundled-images/` with base64-encoded URLs as filenames:

**Example:**
- URL: `https://web.poecdn.com/image/Art/2DArt/SkillIcons/passives/MasteryBlank.webp`
- Base64: `aHR0cHM6Ly93ZWIucG9lY2RuLmNvbS9pbWFnZS9BcnQvMkRBcnQvU2tpbGxJY29ucy9wYXNzaXZlcy9NYXN0ZXJ5QmxhbmsuZQ==`
- Filename: `aHR0cHM6Ly93ZWIucG9lY2RuLmNvbS9pbWFnZS9BcnQvMkRBcnQvU2tpbGxJY29ucy9wYXNzaXZlcy9NYXN0ZXJ5QmxhbmsuZQ==.webp`

This allows:
- No filename collisions (each unique URL gets unique file)
- Easy debugging (decode base64 to see original URL)
- Works with any CDN structure

## Testing Checklist

After migration, verify:
- [ ] Splash shows immediately on app launch (no 1min wait)
- [ ] No scrollbar on splash screen
- [ ] No MaxListenersExceededWarning in console
- [ ] Omens images load correctly
- [ ] Essences images load correctly
- [ ] Currency images load correctly
- [ ] Gems images load correctly
- [ ] Atlas passive nodes images load correctly
- [ ] "?" placeholder only appears for truly missing images
- [ ] Image cache directory has official CDN URLs

## Troubleshooting

### Images still showing "?"
1. Check bundled-images/ directory exists and has files
2. Decode a few filenames to verify they're official CDN URLs:
   ```bash
   # PowerShell
   $file = "aHR0cHM6Ly93ZWIucG9lY2RuLmNvbS9pbWFnZS9BcnQvMkRBcnQvU2tpbGxJY29ucy9wYXNzaXZlcy9NYXN0ZXJ5QmxhbmsuZQ==.webp"
   $base64 = $file -replace '\.webp$',''
   [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($base64))
   ```
3. Check console for "Failed to build image index" errors
4. Verify your JSON data files point to correct image URLs

### Download script fails
1. Check internet connection
2. Verify User-Agent header is set correctly
3. Try with smaller batch (comment out retry logic temporarily)
4. Check if official PoE CDN is accessible: `curl -v https://web.poecdn.com/`

### Mixed old/new images
This is fine during transition! The imageResolver handles both. But for consistency, run the clean script and re-download.

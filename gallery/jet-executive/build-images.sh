#!/usr/bin/env bash
# Rebuilds the site image set from the originals.
# Renames camera-roll files to semantic names, crops to fixed ratios, emits WebP at 3 widths.
set -u
SRC="orig"
OUT="$1"
mkdir -p "$OUT"

# name | source file | crop ratio (w:h or "-" to keep) | widths
MAP="
hero-aviva|Jet-Executive-Chauffeur-Dublin.webp|3:2|1920 1280 800
hero-portrait|IMG_4240-scale.webp|4:5|1000 700
airport-quays|IMG_4285-scale.webp|4:5|1000 700
corporate-office|IMG_4268-scale.webp|4:5|1000 700
wedding-georgian|IMG_4230-01-scale.webp|3:2|1400 900 600
business-quays|IMG_4314-scale.webp|3:2|1400 900 600
events-glass|IMG_4354-scale.webp|3:2|1400 900 600
fleet-rear|IMG_4347-scale.webp|3:2|1400 900 600
fleet-front|IMG_4295-scale.webp|4:5|1000 700
city-eclass|IMG_4240-1-scale.webp|3:2|1400 900 600
street-eclass|IMG_4195-scale.webp|3:2|1400 900 600
kerbside|IMG_4297-scale.webp|3:2|1400 900 600
"

resolve () { ls "$SRC" | grep -i "^$(echo "$1" | sed 's/-scale\.webp$//')" | head -1; }

echo "$MAP" | while IFS='|' read -r name src ratio widths; do
  [ -z "${name:-}" ] && continue
  f="$SRC/$(resolve "$src")"
  [ -f "$f" ] || { echo "MISSING source for $name ($src)"; continue; }
  if [ "$ratio" = "-" ]; then
    vf_crop=""
  else
    rw=${ratio%:*}; rh=${ratio#*:}
    vf_crop="crop='min(iw,ih*$rw/$rh)':'min(ih,iw*$rh/$rw)',"
  fi
  for w in $widths; do
    ffmpeg -v error -y -i "$f" \
      -vf "${vf_crop}scale=$w:-2:flags=lanczos" \
      -c:v libwebp -quality 78 -compression_level 6 -preset photo \
      "$OUT/$name-${w}.webp" || echo "FAIL $name $w"
  done
  echo "built $name"
done

# logo: keep alpha, two sizes
LOGO=$(ls "$SRC"/../img/*.png 2>/dev/null | head -1)
if [ -n "${LOGO:-}" ]; then
  for w in 480 240; do
    ffmpeg -v error -y -i "$LOGO" -vf "scale=$w:-1:flags=lanczos" "$OUT/logo-${w}.png"
  done
  echo "built logo"
fi

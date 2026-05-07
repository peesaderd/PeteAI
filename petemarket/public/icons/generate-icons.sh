# Generate simple SVG icons
for size in 192 384 512; do
  cat > icon-${size}.svg << EOF
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size/8}" fill="#000000"/>
  <text x="${size}/2" y="${size}*0.65" text-anchor="middle" font-size="${size}*0.5" fill="white" font-family="sans-serif" font-weight="bold">PM</text>
</svg>
EOF
done
echo "SVG icons created"

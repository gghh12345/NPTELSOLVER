import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs('icons', exist_ok=True)

def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Rounded background with smooth gradient effect
    padding = max(1, size // 16)
    radius = max(2, size // 4)
    
    # Gradient colors: Deep indigo #3B82F6 to Emerald #10B981
    # Draw rounded rectangle
    draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=radius,
        fill=(15, 23, 42, 255), # dark slate background
        outline=(59, 130, 246, 255), # blue border
        width=max(1, size // 24)
    )
    
    # Inner accent
    inner_pad = padding + max(1, size // 12)
    inner_rad = max(2, radius - 2)
    # Gradient fill emulation
    for y in range(inner_pad, size - inner_pad):
        ratio = (y - inner_pad) / max(1, (size - 2 * inner_pad))
        r = int(37 + ratio * (16 - 37))
        g = int(99 + ratio * (185 - 99))
        b = int(235 + ratio * (129 - 235))
        draw.line([(inner_pad, y), (size - inner_pad, y)], fill=(r, g, b, 240))
        
    # Draw an 'N' with lightning bolt accent in center
    cx, cy = size // 2, size // 2
    stroke_w = max(1, size // 8)
    h = size // 2
    w = size // 2.4
    
    left = cx - w // 2
    right = cx + w // 2
    top = cy - h // 2
    bottom = cy + h // 2
    
    # Draw the 'N'
    draw.line([(left, top), (left, bottom)], fill=(255, 255, 255, 255), width=int(stroke_w))
    draw.line([(left, top), (right, bottom)], fill=(255, 255, 255, 255), width=int(stroke_w))
    draw.line([(right, top), (right, bottom)], fill=(255, 255, 255, 255), width=int(stroke_w))
    
    # Sparkle / bolt dot in top right
    dot_r = max(1, size // 10)
    dot_x = right + dot_r // 2
    dot_y = top - dot_r // 2
    if size >= 32:
        draw.ellipse([dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r], fill=(250, 204, 21, 255))
        
    img.save(f'icons/icon-{size}.png', 'PNG')
    print(f"Generated icons/icon-{size}.png ({size}x{size})")

for s in [16, 48, 128]:
    create_icon(s)

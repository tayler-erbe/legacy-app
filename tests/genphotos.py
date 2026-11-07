"""Generate test JPEGs with EXIF dates + GPS, mimicking a phone camera roll."""
import os
import sys
import datetime
from fractions import Fraction
from PIL import Image, ImageDraw
from PIL.TiffImagePlugin import IFDRational

out = sys.argv[1]
os.makedirs(out, exist_ok=True)


def dms(value):
    value = abs(value)
    d = int(value)
    m = int((value - d) * 60)
    s = round(((value - d) * 60 - m) * 60, 2)
    return (IFDRational(d, 1), IFDRational(m, 1), IFDRational(Fraction(s).limit_denominator(100)))


def make(name, when, lat=None, lon=None, color=(200, 120, 80)):
    img = Image.new('RGB', (640, 480), color)
    ImageDraw.Draw(img).text((20, 20), name, fill=(255, 255, 255))
    exif = Image.Exif()
    exif[0x0132] = when
    exif.get_ifd(0x8769)[0x9003] = when
    if lat is not None:
        gps = exif.get_ifd(0x8825)
        gps[1] = 'N' if lat >= 0 else 'S'
        gps[2] = dms(lat)
        gps[3] = 'E' if lon >= 0 else 'W'
        gps[4] = dms(lon)
    img.save(os.path.join(out, name), 'JPEG', exif=exif, quality=80)


HOME = (41.8781, -87.6298)    # Chicago
PARIS = (48.8566, 2.3522)

# Home day 1: four photos one morning
for i in range(4):
    make(f'home_mar_{i}.jpg', f'2024:03:10 {10 + i // 2:02d}:{(i * 20) % 60:02d}:00', HOME[0] + i * 0.001, HOME[1], (90, 140, 200))
# Home day 2: three photos
for i in range(3):
    make(f'home_may_{i}.jpg', f'2024:05:01 18:{i * 10:02d}:00', HOME[0], HOME[1] + i * 0.001, (120, 180, 120))
# Trip: Paris over three days
for i, (day, hour) in enumerate([(4, 9), (4, 15), (5, 11), (5, 20), (6, 10)]):
    make(f'paris_{i}.jpg', f'2023:07:{day:02d} {hour:02d}:00:00', PARIS[0] + i * 0.01, PARIS[1], (210, 170, 90))
# On this day, two years ago, at home
today = datetime.date.today()
for i in range(2):
    make(f'otd_{i}.jpg', f'{today.year - 2}:{today.month:02d}:{today.day:02d} 12:{i * 5:02d}:00', HOME[0], HOME[1], (180, 90, 160))
# A screenshot-like PNG with no EXIF
Image.new('RGB', (300, 300), (60, 60, 60)).save(os.path.join(out, 'noexif.png'))
print('ok')

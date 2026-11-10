# 가이드 그림에 「여기를 누르세요」 표시 — 원본(raw)에서 매번 새로 그린다(두 번 돌려도 겹치지 않음)
import sys  # 사용법: python3 scripts/guide-annotate.py docs public/guide  (원본 = docs/guide-raw/*.png)
from PIL import Image, ImageDraw, ImageFont
S, OUT = sys.argv[1], sys.argv[2]
F = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 30)
RED = (255, 59, 48)
MARKS = {
  'signup':        [((50, 952, 730, 1072), '여기를 누르세요', 'bl')],
  'rsvp-card':     [((56, 300, 716, 440), '참 · 불 누르기', 'tr'), ((56, 544, 322, 660), '게스트 부르기', 'bl')],
  'guest-sheet':   [((546, 488, 742, 610), '다시 신청')],
  'wallet':        [((572, 148, 724, 270), '충전'), ((490, 390, 724, 490), '티켓 사기')],
  'wallet-charge': [((486, 532, 730, 626), '계좌번호 복사')],
  'wallet-ticket': [((30, 848, 750, 976), '여기를 누르세요')],
  'me':            [((34, 258, 748, 414), '이용 가이드', 'br'), ((56, 1020, 724, 1158), '내 선수 카드', 'tr')],
  'boxscore':      [((28, 120, 752, 236), '내 기록 한 줄')],
  'leaderboard':   [((50, 1934, 730, 2298), '내 기록은 맨 위에')],
  'highlights':    [((578, 772, 718, 842), '링크 복사')],
}
for name, marks in MARKS.items():
  im = Image.open(f'{S}/guide-raw/{name}.png').convert('RGB')
  # 아래쪽 안내 말이 그림 밖으로 나가면 바탕색으로 여백을 늘린다
  need = max((m[0][3] + 8 + 50 + 12) for m in marks if (len(m) > 2 and m[2][0] == 'b'))  if any(len(m) > 2 and m[2][0] == 'b' for m in marks) else 0
  if need > im.size[1]:
    big = Image.new('RGB', (im.size[0], need), im.getpixel((im.size[0] - 4, im.size[1] - 4))); big.paste(im, (0, 0)); im = big
  d = ImageDraw.Draw(im)
  for mk in marks:
    (x0, y0, x1, y1), label = mk[0], mk[1]
    pos = mk[2] if len(mk) > 2 else 'tl'
    d.rounded_rectangle([x0, y0, x1, y1], radius=28, outline=RED, width=7)
    tw = d.textlength(label, font=F); pw, ph = tw + 36, 50
    lx = x0 if pos[1] == 'l' else x1 - pw
    lx = min(max(lx, 8), im.size[0] - pw - 8)
    ly = (y0 - ph - 8 if y0 - ph - 8 > 0 else y1 + 8) if pos[0] == 't' else y1 + 8
    d.rounded_rectangle([lx, ly, lx + pw, ly + ph], radius=25, fill=RED)
    d.text((lx + 18, ly + 9), label, font=F, fill=(255, 255, 255))
  im.save(f'{OUT}/{name}.png', optimize=True)
  print(name)

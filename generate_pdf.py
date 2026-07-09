from pathlib import Path
import shutil

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PROJECT_ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = PROJECT_ROOT / "output" / "pdf"
OUTPUT_FILE = OUTPUT_DIR / "hangeul_worksheet_1.pdf"
ROOT_COPY = PROJECT_ROOT / "hangeul_worksheet_1.pdf"
FOOTER_WAVE_ASSET = PROJECT_ROOT / "resources" / "worksheet-footer-wave-minimal.png"
LOGO_ASSET = PROJECT_ROOT / "resources" / "haeon-logo-pdf.png"

FONT_DIR = Path("C:/Windows/Fonts")
FONT_FILES = {
    "regular": [
        ("Pretendard-Regular", FONT_DIR / "Pretendard-Regular.ttf"),
        ("NotoSansKR-Regular", FONT_DIR / "NotoSansKR-Regular.ttf"),
        ("MalgunGothic", FONT_DIR / "malgun.ttf"),
    ],
    "medium": [
        ("Pretendard-Medium", FONT_DIR / "Pretendard-Medium.ttf"),
        ("NotoSansKR-Medium", FONT_DIR / "NotoSansKR-Medium.ttf"),
        ("MalgunGothic", FONT_DIR / "malgun.ttf"),
    ],
    "semibold": [
        ("Pretendard-SemiBold", FONT_DIR / "Pretendard-SemiBold.ttf"),
        ("NotoSansKR-Bold", FONT_DIR / "NotoSansKR-Bold.ttf"),
        ("MalgunGothic-Bold", FONT_DIR / "malgunbd.ttf"),
    ],
    "bold": [
        ("Pretendard-Bold", FONT_DIR / "Pretendard-Bold.ttf"),
        ("NotoSansKR-Bold", FONT_DIR / "NotoSansKR-Bold.ttf"),
        ("MalgunGothic-Bold", FONT_DIR / "malgunbd.ttf"),
    ],
}


def hex_color(value: str) -> colors.Color:
    return colors.HexColor(value)


NAVY = hex_color("#08214A")
INK = hex_color("#16325C")
BLUE = hex_color("#4B73E6")
AQUA = hex_color("#70D2D1")
LAVENDER = hex_color("#B79AF2")
PEACH = hex_color("#F0A79E")
WATER = hex_color("#DDF1FA")
LINE = hex_color("#D8E2EE")
PALE_LINE = hex_color("#EDF3F8")
MUTED = hex_color("#6F7F97")
SOFT_BG = hex_color("#F8FBFD")


def register_font(role: str, fallbacks: list[tuple[str, Path]]) -> str:
    for font_name, font_path in fallbacks:
        if font_path.exists():
            pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
            return font_name
    return "Helvetica"


FONTS = {role: register_font(role, paths) for role, paths in FONT_FILES.items()}


def set_stroke_alpha(pdf: canvas.Canvas, alpha: float) -> None:
    if hasattr(pdf, "setStrokeAlpha"):
        pdf.setStrokeAlpha(alpha)


def set_fill_alpha(pdf: canvas.Canvas, alpha: float) -> None:
    if hasattr(pdf, "setFillAlpha"):
        pdf.setFillAlpha(alpha)


def draw_ripple(pdf: canvas.Canvas, x: float, y: float, scale: float = 1.0) -> None:
    pdf.saveState()
    pdf.setStrokeColor(WATER)
    set_stroke_alpha(pdf, 0.8)
    for index in range(5):
        inset = index * 5.5 * scale
        pdf.setLineWidth((1.8 - index * 0.18) * scale)
        pdf.ellipse(
            x - 34 * scale - inset,
            y - 10 * scale - inset * 0.35,
            x + 34 * scale + inset,
            y + 10 * scale + inset * 0.35,
            stroke=1,
            fill=0,
        )
    pdf.restoreState()


def draw_footer_water(pdf: canvas.Canvas, width: float) -> None:
    pdf.saveState()
    if FOOTER_WAVE_ASSET.exists():
        image = ImageReader(str(FOOTER_WAVE_ASSET))
        pdf.drawImage(
            image,
            0,
            -2,
            width=width,
            height=74,
            mask="auto",
            preserveAspectRatio=False,
        )
        pdf.restoreState()
        return

    pdf.setStrokeColor(WATER)
    set_stroke_alpha(pdf, 0.7)
    pdf.setLineWidth(0.9)
    base_y = 38
    for offset in range(0, 150, 18):
        pdf.bezier(
            width - 260 + offset,
            base_y - 18,
            width - 214 + offset,
            base_y + 30,
            width - 154 + offset,
            base_y - 18,
            width - 94 + offset,
            base_y + 20,
        )
    draw_ripple(pdf, width - 94, 42, 0.75)
    pdf.restoreState()


def draw_logo(pdf: canvas.Canvas, x: float, y: float, scale: float = 1.0) -> None:
    pdf.saveState()
    if LOGO_ASSET.exists():
        image = ImageReader(str(LOGO_ASSET))
        logo_w = 98 * scale
        logo_h = logo_w * 633 / 889
        pdf.drawImage(
            image,
            x,
            y - logo_h + 12 * scale,
            width=logo_w,
            height=logo_h,
            mask="auto",
            preserveAspectRatio=True,
            anchor="sw",
        )
        pdf.restoreState()
        return

    pdf.setFillColor(NAVY)
    pdf.setFont(FONTS["bold"], 19 * scale)
    pdf.drawString(x, y, "해온")
    draw_ripple(pdf, x + 42 * scale, y + 4 * scale, 0.33 * scale)
    pdf.setFont(FONTS["medium"], 5.8 * scale)
    pdf.setFillColor(INK)
    pdf.drawString(x + 1 * scale, y - 11 * scale, "H A E O N")
    pdf.restoreState()


def draw_page_number(pdf: canvas.Canvas, page: str, title: str, width: float, height: float) -> None:
    pdf.saveState()
    pdf.setStrokeColor(LINE)
    pdf.setFillColor(colors.white)
    pdf.setLineWidth(1)
    pdf.circle(52, height - 52, 10, stroke=1, fill=1)
    pdf.setFillColor(INK)
    pdf.setFont(FONTS["semibold"], 8)
    pdf.drawCentredString(52, height - 55, page)
    pdf.setFont(FONTS["semibold"], 12)
    pdf.drawString(78, height - 56, title)
    draw_logo(pdf, width - 108, height - 55, 0.58)
    pdf.restoreState()


def draw_tagline(pdf: canvas.Canvas, width: float, y: float) -> None:
    pdf.saveState()
    pdf.setFont(FONTS["semibold"], 8)
    pdf.setFillColor(BLUE)
    pdf.drawCentredString(width / 2, y, "UNDERSTANDING, ON.")
    pdf.setFont(FONTS["regular"], 8.5)
    pdf.setFillColor(MUTED)
    pdf.drawCentredString(width / 2, y - 16, "이해가 켜지는 순간, 세계가 가까워집니다.")
    pdf.restoreState()


def draw_symbol_card(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    symbol: str,
    label_ko: str,
    label_en: str,
    accent: colors.Color,
) -> None:
    pdf.saveState()
    pdf.setStrokeColor(LINE)
    pdf.setFillColor(colors.white)
    pdf.setLineWidth(1)
    pdf.roundRect(x, y, w, h, 7, stroke=1, fill=1)

    pdf.setStrokeColor(accent)
    pdf.setLineWidth(1.4)
    pdf.circle(x + w / 2, y + h - 54, 42, stroke=1, fill=0)
    set_stroke_alpha(pdf, 0.45)
    pdf.circle(x + w / 2, y + h - 54, 50, stroke=1, fill=0)
    set_stroke_alpha(pdf, 1)

    pdf.setFillColor(NAVY)
    if symbol == "ㆍ":
        pdf.setFont(FONTS["bold"], 44)
        pdf.drawCentredString(x + w / 2, y + h - 67, symbol)
    elif symbol == "ㅡ":
        pdf.setLineCap(1)
        pdf.setStrokeColor(NAVY)
        pdf.setLineWidth(9)
        pdf.line(x + w / 2 - 30, y + h - 55, x + w / 2 + 30, y + h - 55)
    else:
        pdf.setLineCap(1)
        pdf.setStrokeColor(NAVY)
        pdf.setLineWidth(9)
        pdf.line(x + w / 2, y + h - 86, x + w / 2, y + h - 24)

    pdf.setFillColor(INK)
    pdf.setFont(FONTS["semibold"], 14)
    pdf.drawCentredString(x + w / 2, y + 42, label_ko)
    pdf.setFont(FONTS["regular"], 9.5)
    pdf.setFillColor(MUTED)
    pdf.drawCentredString(x + w / 2, y + 25, label_en)
    pdf.restoreState()


def draw_combination(pdf: canvas.Canvas, x: float, y: float, text: str, accent: colors.Color) -> None:
    box_w = 98
    pdf.saveState()
    pdf.setFillColor(SOFT_BG)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(x, y, box_w, 36, 6, stroke=1, fill=1)
    pdf.setFillColor(accent)
    pdf.setFont(FONTS["bold"], 13.5)
    pdf.drawCentredString(x + box_w / 2, y + 12, text)
    pdf.restoreState()


def draw_fundamental_page(pdf: canvas.Canvas, width: float, height: float) -> None:
    draw_page_number(pdf, "01", "Fundamental", width, height)
    draw_footer_water(pdf, width)

    pdf.setFillColor(NAVY)
    pdf.setFont(FONTS["bold"], 28)
    pdf.drawString(56, height - 132, "한글 모음의 기본 원리")
    pdf.setFillColor(MUTED)
    pdf.setFont(FONTS["regular"], 11.5)
    pdf.drawString(58, height - 154, "하늘, 땅, 사람에서 시작되는 여섯 개의 기본 모음")

    pdf.setStrokeColor(LINE)
    pdf.setLineWidth(1)
    pdf.line(56, height - 176, width - 56, height - 176)

    intro_x = 58
    intro_y = height - 222
    pdf.setFont(FONTS["semibold"], 15)
    pdf.setFillColor(INK)
    pdf.drawString(intro_x, intro_y, "천지인 원리")
    pdf.setFont(FONTS["regular"], 10.8)
    pdf.setFillColor(MUTED)
    intro_lines = [
        "아래아(ㆍ)는 하늘, ㅡ는 땅, ㅣ는 사람을 나타냅니다.",
        "한글의 기본 모음은 이 세 요소가 만나 만들어지는 모양으로 이해할 수 있습니다.",
    ]
    for i, line in enumerate(intro_lines):
        pdf.drawString(intro_x, intro_y - 24 - i * 18, line)

    card_y = height - 484
    card_w = 148
    card_gap = 18
    card_x = 56
    draw_symbol_card(pdf, card_x, card_y, card_w, 185, "ㆍ", "하늘", "Sky / 아래아", BLUE)
    draw_symbol_card(pdf, card_x + card_w + card_gap, card_y, card_w, 185, "ㅡ", "땅", "Earth", AQUA)
    draw_symbol_card(pdf, card_x + (card_w + card_gap) * 2, card_y, card_w, 185, "ㅣ", "사람", "Human", LAVENDER)

    band_x = 56
    band_y = 174
    band_w = width - 112
    band_h = 132
    pdf.setFillColor(SOFT_BG)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(band_x, band_y, band_w, band_h, 8, stroke=1, fill=1)

    pdf.setFillColor(INK)
    pdf.setFont(FONTS["semibold"], 13)
    pdf.drawString(band_x + 22, band_y + band_h - 34, "모음이 만들어지는 방식")
    pdf.setFillColor(MUTED)
    pdf.setFont(FONTS["regular"], 9.5)
    pdf.drawString(band_x + 22, band_y + band_h - 53, "점과 선의 위치를 보며 오늘 연습할 모음을 연결해 봅니다.")

    combo_y = band_y + 28
    start_x = band_x + 22
    draw_combination(pdf, start_x, combo_y, "ㅣ + ㆍ = ㅏ", BLUE)
    draw_combination(pdf, start_x + 112, combo_y, "ㆍ + ㅣ = ㅓ", LAVENDER)
    draw_combination(pdf, start_x + 224, combo_y, "ㆍ + ㅡ = ㅗ", AQUA)
    draw_combination(pdf, start_x + 336, combo_y, "ㅡ + ㆍ = ㅜ", PEACH)

    draw_tagline(pdf, width, 112)


def draw_qr_placeholder(pdf: canvas.Canvas, x: float, y: float, size: float) -> None:
    pdf.saveState()
    pdf.setStrokeColor(LINE)
    pdf.setFillColor(colors.white)
    pdf.setLineWidth(1)
    pdf.roundRect(x, y, size, size, 5, stroke=1, fill=1)

    pdf.setStrokeColor(PALE_LINE)
    pdf.setLineWidth(0.7)
    step = size / 5
    for i in range(1, 5):
        pdf.line(x + step * i, y + 8, x + step * i, y + size - 8)
        pdf.line(x + 8, y + step * i, x + size - 8, y + step * i)

    pdf.setFillColor(MUTED)
    pdf.setFont(FONTS["semibold"], 13)
    pdf.drawCentredString(x + size / 2, y + size / 2 - 5, "QR")
    pdf.setFont(FONTS["regular"], 7.5)
    pdf.drawCentredString(x + size / 2, y - 13, "발음법 YouTube")
    pdf.restoreState()


def draw_dashed_guides(pdf: canvas.Canvas, x: float, y: float, w: float, h: float) -> None:
    pdf.saveState()
    pdf.setStrokeColor(PALE_LINE)
    pdf.setDash(2, 2)
    pdf.setLineWidth(0.7)
    pdf.line(x + w / 2, y + 7, x + w / 2, y + h - 7)
    pdf.line(x + 7, y + h / 2, x + w - 7, y + h / 2)
    pdf.restoreState()


def draw_practice_cell(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    size: float,
    vowel: str | None = None,
    ghost: bool = False,
) -> None:
    pdf.saveState()
    pdf.setStrokeColor(LINE)
    pdf.setFillColor(colors.white)
    pdf.setLineWidth(0.9)
    pdf.roundRect(x, y, size, size, 4, stroke=1, fill=1)
    draw_dashed_guides(pdf, x, y, size, size)

    if vowel:
        pdf.setFont(FONTS["bold"], 31 if vowel != "ㅡ" else 28)
        pdf.setFillColor(hex_color("#A9B8C9") if ghost else NAVY)
        if ghost:
            set_fill_alpha(pdf, 0.42)
        pdf.drawCentredString(x + size / 2, y + size / 2 - 11, vowel)
    pdf.restoreState()


def draw_practice_row(
    pdf: canvas.Canvas,
    y: float,
    number: int,
    vowel: str,
    sound: str,
    sample: str,
) -> None:
    left_x = 56
    card_size = 58
    cell_size = 54
    gap = 8
    row_top = y + card_size

    pdf.saveState()
    pdf.setFillColor(INK)
    pdf.setFont(FONTS["semibold"], 10)
    pdf.drawString(left_x, row_top + 12, f"{number}. {sample}")
    pdf.setFillColor(MUTED)
    pdf.setFont(FONTS["regular"], 8.5)
    pdf.drawString(left_x + 44, row_top + 12, f"/{sound}/")

    draw_practice_cell(pdf, left_x, y, card_size, vowel, ghost=False)

    pdf.setStrokeColor(LINE)
    pdf.setDash(3, 3)
    pdf.line(left_x + card_size + 10, y + card_size / 2, left_x + card_size + 32, y + card_size / 2)
    pdf.setDash()

    start_x = left_x + card_size + 44
    for i in range(6):
        draw_practice_cell(pdf, start_x + i * (cell_size + gap), y + 2, cell_size, vowel if i < 2 else None, ghost=True)
    pdf.restoreState()


def draw_progress_dots(pdf: canvas.Canvas, x: float, y: float) -> None:
    labels = [("자음", LAVENDER), ("모음", AQUA), ("쓰기", BLUE), ("완료", PEACH)]
    pdf.saveState()
    pdf.setFont(FONTS["regular"], 7.8)
    for i, (label, color) in enumerate(labels):
        cx = x + i * 38
        pdf.setFillColor(color if i == 1 else colors.white)
        pdf.setStrokeColor(color if i == 1 else LINE)
        pdf.circle(cx, y, 8, stroke=1, fill=1)
        if i == 1:
            pdf.setFillColor(colors.white)
            pdf.setFont(FONTS["semibold"], 7.2)
            pdf.drawCentredString(cx, y - 2.5, "2")
            pdf.setFont(FONTS["regular"], 7.8)
        pdf.setFillColor(MUTED)
        pdf.drawCentredString(cx, y - 20, label)
    pdf.restoreState()


def draw_worksheet_page(pdf: canvas.Canvas, width: float, height: float) -> None:
    draw_page_number(pdf, "02", "모음 쓰기 연습", width, height)
    draw_footer_water(pdf, width)

    pdf.setFillColor(NAVY)
    pdf.setFont(FONTS["bold"], 25)
    pdf.drawString(56, height - 124, "기본 모음 쓰기 연습")
    pdf.setFont(FONTS["regular"], 10.5)
    pdf.setFillColor(MUTED)
    pdf.drawString(58, height - 146, "ㅏ, ㅓ, ㅗ, ㅜ, ㅡ, ㅣ를 천천히 따라 쓰고 빈칸에 반복해 봅니다.")

    pdf.setFont(FONTS["regular"], 9)
    pdf.setFillColor(MUTED)
    pdf.drawString(width - 206, height - 118, "날짜:")
    pdf.setStrokeColor(LINE)
    pdf.line(width - 178, height - 120, width - 126, height - 120)
    pdf.drawString(width - 118, height - 118, "/")
    pdf.line(width - 104, height - 120, width - 74, height - 120)
    pdf.drawString(width - 66, height - 118, "/")
    pdf.line(width - 52, height - 120, width - 30, height - 120)

    draw_qr_placeholder(pdf, width - 126, height - 216, 70)
    draw_progress_dots(pdf, width - 258, height - 178)

    pdf.setStrokeColor(LINE)
    pdf.line(56, height - 236, width - 56, height - 236)

    rows = [
        ("ㅏ", "a", "아"),
        ("ㅓ", "eo", "어"),
        ("ㅗ", "o", "오"),
        ("ㅜ", "u", "우"),
        ("ㅡ", "eu", "으"),
        ("ㅣ", "i", "이"),
    ]
    start_y = height - 312
    row_gap = 86
    for index, (vowel, sound, sample) in enumerate(rows, start=1):
        draw_practice_row(pdf, start_y - (index - 1) * row_gap, index, vowel, sound, sample)

    pdf.saveState()
    tip_y = 56
    pdf.setFillColor(SOFT_BG)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(56, tip_y, width - 112, 34, 7, stroke=1, fill=1)
    pdf.setFillColor(BLUE)
    pdf.setFont(FONTS["bold"], 13)
    pdf.drawString(74, tip_y + 11, "쓰기 팁")
    pdf.setFillColor(MUTED)
    pdf.setFont(FONTS["regular"], 9)
    pdf.drawString(128, tip_y + 12, "손목에 힘을 빼고, 선의 방향을 보며 천천히 써 보세요.")
    pdf.restoreState()


def generate_worksheet() -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT_FILE), pagesize=A4, pageCompression=1)
    width, height = A4

    draw_fundamental_page(pdf, width, height)
    pdf.showPage()
    draw_worksheet_page(pdf, width, height)
    pdf.save()

    shutil.copyfile(OUTPUT_FILE, ROOT_COPY)
    return OUTPUT_FILE


if __name__ == "__main__":
    path = generate_worksheet()
    print(f"PDF generated: {path}")

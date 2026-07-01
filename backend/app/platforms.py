"""E-commerce platform presets.

Each platform defines the recommended *set* of listing images (ordered by the
conversion-optimised sequence recommended by top sellers), the export size, the
square aspect ratio to use for the main images, the default on-image text
language, and a text density preference. Selecting a platform in the UI
auto-applies its recommended set, language and density.

textDensity controls how much on-image text the platform wants overall and
modulates each template's own textLevel:
- "clean"    - western marketplaces (Amazon/eBay/Walmart...) that favour clean,
  minimal-text imagery; even info templates stay restrained.
- "balanced" - a moderate amount of text.
- "rich"     - Chinese-style marketplaces (淘宝/天猫/京东/拼多多) that favour
  information-dense, text-heavy 卖点长图.
"""

from typing import Any, Dict, List

PLATFORMS: List[Dict[str, Any]] = [
    {
        "id": "amazon",
        "name": "Amazon",
        "region": "全球",
        "language": "en",
        "size": "2000×2000",
        "aspect": "1024x1024",
        # White background main image, no text; then infographic, lifestyle...
        "textDensity": "clean",
        "templates": [
            "white_background",
            "feature_infographic",
            "lifestyle_scene",
            "dimension_infographic",
            "in_use_scene",
            "comparison",
            "packaging",
        ],
        "note": "主图必须纯白底且无文字，2000px 可缩放；整体偏干净少字。",
    },
    {
        "id": "walmart",
        "name": "Walmart",
        "region": "美国",
        "language": "en",
        "size": "2200×2200",
        "aspect": "1024x1024",
        "textDensity": "clean",
        "templates": [
            "white_background",
            "feature_infographic",
            "lifestyle_scene",
            "dimension_infographic",
            "detail_closeup",
        ],
        "note": "主图纯白底，建议 2200px；整体偏干净少字。",
    },
    {
        "id": "ebay",
        "name": "eBay",
        "region": "全球",
        "language": "en",
        "size": "1600×1600",
        "aspect": "1024x1024",
        "textDensity": "clean",
        "templates": [
            "white_background",
            "multi_angle",
            "detail_closeup",
            "lifestyle_scene",
            "feature_infographic",
        ],
        "note": "首图白底，最长边建议 1600px；整体偏干净少字。",
    },
    {
        "id": "etsy",
        "name": "Etsy",
        "region": "全球",
        "language": "en",
        "size": "2700×2025",
        "aspect": "1024x1024",
        "textDensity": "balanced",
        "templates": [
            "lifestyle_scene",
            "white_background",
            "detail_closeup",
            "size_reference",
            "brand_story",
            "packaging",
        ],
        "note": "首图偏爱生活化场景，横版 4:3，讲究品牌故事。",
    },
    {
        "id": "shopify",
        "name": "Shopify",
        "region": "独立站",
        "language": "en",
        "size": "2048×2048",
        "aspect": "1024x1024",
        "textDensity": "balanced",
        "templates": [
            "transparent_cutout",
            "lifestyle_scene",
            "detail_closeup",
            "feature_infographic",
            "brand_story",
            "packaging",
        ],
        "note": "自有品牌站，风格自由，建议 2048px 方图。",
    },
    {
        "id": "tiktok",
        "name": "TikTok Shop",
        "region": "全球",
        "language": "en",
        "size": "1080×1080 / 9:16",
        "aspect": "1024x1024",
        "textDensity": "balanced",
        "templates": [
            "vertical_lifestyle",
            "white_background",
            "benefit_banner",
            "how_to_use",
            "closeup_model",
        ],
        "note": "鼓励竖版短视频风格与模特实拍。",
    },
    {
        "id": "taobao",
        "name": "淘宝",
        "region": "中国",
        "language": "zh",
        "size": "800 / 1000",
        "aspect": "1024x1024",
        "textDensity": "rich",
        "templates": [
            "benefit_banner",
            "feature_infographic",
            "lifestyle_scene",
            "param_table",
            "guarantee",
            "white_background",
            "detail_closeup",
        ],
        "note": "主图可带文字卖点，第5张需白底无文字，详情页 750 宽；偏富信息长图。",
    },
    {
        "id": "tmall",
        "name": "天猫",
        "region": "中国",
        "language": "zh",
        "size": "800 / 1000",
        "aspect": "1024x1024",
        "textDensity": "rich",
        "templates": [
            "benefit_banner",
            "model_shot",
            "feature_infographic",
            "param_table",
            "certification",
            "lifestyle_scene",
            "white_background",
        ],
        "note": "品牌旗舰，模特图基本必备，第5张白底无文字；偏富信息。",
    },
    {
        "id": "jd",
        "name": "京东",
        "region": "中国",
        "language": "zh",
        "size": "800×800",
        "aspect": "1024x1024",
        "textDensity": "rich",
        "templates": [
            "white_background",
            "benefit_banner",
            "feature_infographic",
            "param_table",
            "guarantee",
            "dimension_infographic",
            "detail_closeup",
        ],
        "note": "主图白底居中，800px 起支持放大镜；偏富信息。",
    },
    {
        "id": "pdd",
        "name": "拼多多",
        "region": "中国",
        "language": "zh",
        "size": "750×750",
        "aspect": "1024x1024",
        "textDensity": "rich",
        "templates": [
            "benefit_banner",
            "white_background",
            "comparison",
            "feature_infographic",
            "guarantee",
            "how_to_use",
        ],
        "note": "主图无白边、卖点大字突出性价比；偏富信息。",
    },
    {
        "id": "shopee",
        "name": "Shopee",
        "region": "东南亚",
        "language": "en",
        "size": "1024×1024",
        "aspect": "1024x1024",
        "textDensity": "balanced",
        "templates": [
            "white_background",
            "benefit_banner",
            "lifestyle_scene",
            "multi_angle",
            "how_to_use",
        ],
        "note": "干净白底主图，卖点图突出促销。",
    },
    {
        "id": "lazada",
        "name": "Lazada",
        "region": "东南亚",
        "language": "en",
        "size": "1000×1000",
        "aspect": "1024x1024",
        "textDensity": "balanced",
        "templates": [
            "white_background",
            "feature_infographic",
            "lifestyle_scene",
            "dimension_infographic",
            "detail_closeup",
        ],
        "note": "主图白底，1:1，建议 1000px 以上。",
    },
    {
        "id": "custom",
        "name": "自定义",
        "region": "通用",
        "language": "zh",
        "size": "自选",
        "aspect": "1024x1024",
        "textDensity": "balanced",
        "templates": [
            "white_background",
            "feature_infographic",
            "lifestyle_scene",
            "detail_closeup",
            "model_shot",
        ],
        "note": "自由选择任意套图类型、语言与信息密度。",
    },
]

PLATFORM_BY_ID: Dict[str, Dict[str, Any]] = {p["id"]: p for p in PLATFORMS}

# Human-readable language names used in the LLM instruction.
LANGUAGE_NAMES: Dict[str, str] = {
    "en": "English",
    "zh": "Simplified Chinese (简体中文)",
    "ja": "Japanese (日本語)",
    "ko": "Korean (한국어)",
    "es": "Spanish (Español)",
    "fr": "French (Français)",
    "de": "German (Deutsch)",
    "pt": "Portuguese (Português)",
    "th": "Thai (ไทย)",
    "id": "Indonesian (Bahasa Indonesia)",
    "vi": "Vietnamese (Tiếng Việt)",
}

# Platform text-density presets: label shown in the UI + instruction fed to the
# LLM describing how much on-image text to render overall.
DENSITY_NAMES: Dict[str, str] = {
    "clean": "简洁少字",
    "balanced": "均衡",
    "rich": "富信息",
}

DENSITY_INSTRUCTIONS: Dict[str, str] = {
    "clean": (
        "Overall text density: CLEAN. Keep on-image text to an absolute minimum "
        "even on info templates - short labels only, lots of whitespace, no "
        "paragraphs."
    ),
    "balanced": (
        "Overall text density: BALANCED. Use a moderate, tasteful amount of "
        "on-image text where the template calls for it."
    ),
    "rich": (
        "Overall text density: RICH. This is a text-heavy marketplace style "
        "(淘宝/天猫/京东/拼多多) - info templates should carry generous, well-organised "
        "on-image copy: multiple selling-point callouts, spec labels and short "
        "descriptive lines, while still looking clean and legible."
    ),
}

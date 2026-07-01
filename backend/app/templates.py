"""E-commerce image set template definitions.

Each template describes one type of product photo that stores commonly need.
The `guidance` is fed to the LLM so it can craft a detailed prompt tailored to
the user's product, and it is also used to build a reasonable fallback prompt
when the LLM is not used.
"""

from typing import Dict, List

TEMPLATES: List[Dict[str, str]] = [
    {
        "id": "white_background",
        "name": "白底主图",
        "en": "White Background Main Image",
        "aspectRatio": "1024x1024",
        "guidance": (
            "Clean pure white (#FFFFFF) seamless background, centered product, "
            "soft even studio lighting, subtle natural shadow, sharp focus, "
            "high resolution e-commerce main listing image, no props, no text."
        ),
    },
    {
        "id": "lifestyle_scene",
        "name": "场景生活图",
        "en": "Lifestyle Scene",
        "aspectRatio": "1024x1024",
        "guidance": (
            "Product placed in a realistic, aspirational lifestyle scene that "
            "matches its use case, natural environment, warm ambient lighting, "
            "shallow depth of field, cozy and premium atmosphere, editorial feel."
        ),
    },
    {
        "id": "model_shot",
        "name": "模特展示图",
        "en": "Model / In-use Shot",
        "aspectRatio": "1024x1536",
        "guidance": (
            "An attractive model naturally using or wearing the product, "
            "professional fashion e-commerce photography, flattering lighting, "
            "clean but stylish background, full or three-quarter body composition."
        ),
    },
    {
        "id": "detail_closeup",
        "name": "细节特写图",
        "en": "Detail Close-up",
        "aspectRatio": "1024x1024",
        "guidance": (
            "Extreme close-up macro shot highlighting the product's material, "
            "texture, stitching or craftsmanship details, dramatic focused "
            "lighting, blurred background, premium quality feel."
        ),
    },
    {
        "id": "feature_infographic",
        "name": "卖点信息图",
        "en": "Feature Infographic",
        "aspectRatio": "1024x1024",
        "guidance": (
            "Product on a clean gradient background with tasteful callout lines "
            "pointing to key selling-point areas, modern minimal infographic "
            "layout, leave space for annotation, marketing style."
        ),
    },
    {
        "id": "promo_poster",
        "name": "促销海报图",
        "en": "Promo Poster",
        "aspectRatio": "1024x1536",
        "guidance": (
            "Eye-catching promotional poster composition featuring the product "
            "as hero, bold vibrant background, dynamic lighting, sale-campaign "
            "energy, leave clear space at top or bottom for promotional copy."
        ),
    },
    {
        "id": "multi_angle",
        "name": "多角度展示图",
        "en": "Multi-angle Display",
        "aspectRatio": "1024x1024",
        "guidance": (
            "Multiple views of the same product (front, side, back / three-quarter) "
            "arranged neatly on a light neutral background, consistent lighting, "
            "product catalog display style."
        ),
    },
    {
        "id": "flat_lay",
        "name": "平铺俯拍图",
        "en": "Flat Lay",
        "aspectRatio": "1024x1024",
        "guidance": (
            "Top-down flat lay of the product with complementary accessories "
            "styled around it, neat symmetrical composition, soft diffused "
            "overhead light, trendy neutral surface, Instagram-worthy."
        ),
    },
]

TEMPLATE_BY_ID: Dict[str, Dict[str, str]] = {t["id"]: t for t in TEMPLATES}

"""E-commerce image set template definitions.

Each template describes one type of product photo that online stores commonly
need. Templates are grouped into categories so the UI can lay them out as a
browsable gallery.

Fields:
- id / name / en: identity.
- category: grouping shown in the UI gallery.
- aspectRatio: default pixel size passed to the image model.
- hasText: whether this image is expected to carry on-image marketing copy /
  callouts (infographics, posters, feature callouts...). White-background /
  main images must stay text-free for platform compliance.
- example: filename of a bundled example thumbnail (served from the frontend
  `public/examples/` directory).
- guidance: fed to the LLM so it can craft a detailed prompt tailored to the
  user's product, and also used to build a reasonable fallback prompt when the
  LLM is not used.
"""

from typing import Any, Dict, List

# Categories in display order.
CATEGORIES: List[Dict[str, str]] = [
    {"id": "main", "name": "基础主图"},
    {"id": "scene", "name": "场景生活"},
    {"id": "model", "name": "模特实拍"},
    {"id": "detail", "name": "细节参数"},
    {"id": "marketing", "name": "营销卖点"},
    {"id": "creative", "name": "创意拓展"},
]


def _t(
    id: str,
    name: str,
    en: str,
    category: str,
    aspect: str,
    has_text: bool,
    guidance: str,
) -> Dict[str, Any]:
    return {
        "id": id,
        "name": name,
        "en": en,
        "category": category,
        "aspectRatio": aspect,
        "hasText": has_text,
        "example": f"examples/{id}.jpg",
        "guidance": guidance,
    }


TEMPLATES: List[Dict[str, Any]] = [
    # ---------------------------- 基础主图 ---------------------------- #
    _t(
        "white_background", "白底主图", "White Background Main", "main",
        "1024x1024", False,
        "Clean pure white (#FFFFFF) seamless background, product perfectly "
        "centered filling ~85% of the frame, soft even studio lighting, subtle "
        "natural contact shadow, razor sharp focus, no props, absolutely no "
        "text, high-resolution e-commerce main listing image.",
    ),
    _t(
        "multi_angle", "多角度展示", "Multi-angle Display", "main",
        "1024x1024", False,
        "Several views of the same product (front, side, back, three-quarter) "
        "arranged neatly on a light neutral background, consistent lighting and "
        "scale, clean product-catalog display style, no text.",
    ),
    _t(
        "floating_hero", "悬浮主图", "Floating Hero", "main",
        "1024x1024", False,
        "Product floating / levitating against a smooth soft-gradient studio "
        "background, dynamic subtle shadow beneath, premium hero product shot, "
        "crisp lighting, no text.",
    ),
    _t(
        "transparent_cutout", "透明去背图", "Transparent Cutout", "main",
        "1024x1024", False,
        "Product cleanly cut out on a plain white background ready for "
        "background removal, sharp clean edges, even lighting, catalog cutout "
        "style, no shadow clutter, no text.",
    ),
    # ---------------------------- 场景生活 ---------------------------- #
    _t(
        "lifestyle_scene", "场景生活图", "Lifestyle Scene", "scene",
        "1024x1024", False,
        "Product placed in a realistic aspirational lifestyle scene matching "
        "its use case, natural environment, warm ambient light, shallow depth "
        "of field, cozy premium editorial atmosphere, no text.",
    ),
    _t(
        "in_use_scene", "使用场景图", "In-use Scene", "scene",
        "1024x1024", False,
        "The product actively being used in its natural context, hands or "
        "environment interacting with it, authentic candid feel, natural "
        "lighting, storytelling composition, no text.",
    ),
    _t(
        "outdoor_scene", "户外场景图", "Outdoor Scene", "scene",
        "1024x1024", False,
        "Product in an appealing outdoor setting relevant to its use, natural "
        "daylight, depth and atmosphere, lifestyle travel mood, no text.",
    ),
    _t(
        "flat_lay", "平铺俯拍图", "Flat Lay", "scene",
        "1024x1024", False,
        "Top-down flat lay of the product with complementary accessories styled "
        "around it, neat symmetrical composition, soft diffused overhead light, "
        "trendy neutral surface, editorial flat-lay style, no text.",
    ),
    # ---------------------------- 模特实拍 ---------------------------- #
    _t(
        "model_shot", "模特展示图", "Model / In-use Shot", "model",
        "1024x1536", False,
        "An attractive model naturally using or wearing the product, "
        "professional fashion e-commerce photography, flattering lighting, "
        "clean stylish background, three-quarter or full body composition, "
        "no text.",
    ),
    _t(
        "closeup_model", "模特特写图", "Model Close-up", "model",
        "1024x1536", False,
        "Close-up of a model showcasing the product on the relevant body area "
        "(wrist, face, hands, ears...), soft beauty lighting, premium skin "
        "detail, aspirational, no text.",
    ),
    _t(
        "vertical_lifestyle", "竖版场景图", "Vertical Lifestyle", "model",
        "1024x1536", False,
        "Vertical 9:16 lifestyle / short-video style shot of the product in an "
        "engaging scene, social-commerce aesthetic (TikTok / Reels), dynamic "
        "framing, vibrant but natural, no text.",
    ),
    # ---------------------------- 细节参数 ---------------------------- #
    _t(
        "detail_closeup", "细节特写图", "Detail Close-up", "detail",
        "1024x1024", False,
        "Extreme macro close-up highlighting material, texture, stitching or "
        "craftsmanship, dramatic focused lighting, blurred background, premium "
        "quality feel, no text.",
    ),
    _t(
        "material_texture", "材质纹理图", "Material Texture", "detail",
        "1024x1024", False,
        "Rich close-up emphasising the surface material and finish of the "
        "product, tactile texture, controlled reflections, premium studio "
        "lighting, no text.",
    ),
    _t(
        "size_reference", "尺寸对比图", "Size Reference", "detail",
        "1024x1024", True,
        "Product shown next to a common reference object or a ruler / dimension "
        "lines to convey real-world scale, clean neutral background, tasteful "
        "on-image dimension labels and measurement callouts.",
    ),
    _t(
        "dimension_infographic", "尺寸参数图", "Dimension Infographic", "detail",
        "1024x1024", True,
        "Technical dimension infographic: product on a clean background with "
        "precise measurement lines, arrows and numeric size labels, modern "
        "minimal spec-sheet layout with clear on-image text.",
    ),
    # ---------------------------- 营销卖点 ---------------------------- #
    _t(
        "feature_infographic", "卖点信息图", "Feature Infographic", "marketing",
        "1024x1024", True,
        "Marketing infographic: product as hero with tasteful callout lines and "
        "icons pointing to key selling points, short punchy benefit headlines "
        "as clear on-image text, modern clean layout, high-converting listing "
        "style.",
    ),
    _t(
        "benefit_banner", "卖点大字图", "Benefit Banner", "marketing",
        "1024x1024", True,
        "Bold benefit banner: product with one strong headline selling point in "
        "large legible on-image typography, vibrant brand-color background, "
        "eye-catching marketing composition.",
    ),
    _t(
        "comparison", "对比图", "Comparison / Before-After", "marketing",
        "1024x1024", True,
        "Split before/after or us-vs-them comparison layout showing the "
        "product's advantage, clear dividing line, labelled sides with concise "
        "on-image text, persuasive marketing style.",
    ),
    _t(
        "how_to_use", "使用步骤图", "How-to-use Steps", "marketing",
        "1024x1024", True,
        "Numbered step-by-step usage guide, 3-4 sequential panels showing how "
        "to use the product, simple icons and short on-image step labels, clean "
        "instructional layout.",
    ),
    _t(
        "promo_poster", "促销海报图", "Promo Poster", "marketing",
        "1024x1536", True,
        "Eye-catching promotional poster with the product as hero, bold vibrant "
        "background, dynamic lighting, sale-campaign energy, prominent on-image "
        "promotional headline and discount copy.",
    ),
    # ---------------------------- 创意拓展 ---------------------------- #
    _t(
        "color_variants", "多色SKU图", "Color Variants", "creative",
        "1024x1024", False,
        "The same product shown in several color variants lined up neatly, "
        "consistent lighting and angle, clean neutral background, SKU showcase "
        "style, no text.",
    ),
    _t(
        "packaging", "包装展示图", "Packaging Shot", "creative",
        "1024x1024", False,
        "Attractive shot of the product together with its retail packaging / "
        "box, premium unboxing feel, clean studio background, soft lighting, "
        "no text.",
    ),
    _t(
        "bundle", "套装组合图", "Bundle / Set", "creative",
        "1024x1024", False,
        "All items of the product set / bundle arranged together in an "
        "organised premium composition, consistent lighting, neutral clean "
        "background, no text.",
    ),
    _t(
        "creative_splash", "创意氛围图", "Creative Splash", "creative",
        "1024x1024", False,
        "Bold creative concept shot: product surrounded by dynamic elements "
        "(splashes, ingredients, light rays, particles) relevant to its "
        "benefit, dramatic artistic lighting, advertising campaign feel, "
        "no text.",
    ),
]

TEMPLATE_BY_ID: Dict[str, Dict[str, Any]] = {t["id"]: t for t in TEMPLATES}

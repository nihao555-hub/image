"""E-commerce image set template definitions.

Each template describes one type of product photo that online stores commonly
need. Templates are grouped into categories so the UI can lay them out as a
browsable gallery.

Fields:
- id / name / en: identity.
- category: grouping shown in the UI gallery.
- aspectRatio: default pixel size passed to the image model.
- textLevel: how much on-image text this image is expected to carry.
    * "none"  - no text at all (main / white-background / lifestyle images that
      must stay clean for platform compliance).
    * "light" - a small amount of text: one short headline or a few concise
      labels, plenty of whitespace.
    * "rich"  - information-dense: multiple callouts, spec labels, comparison
      copy, step captions (infographics, spec tables, comparison charts...).
  The actual amount is further modulated by the selected platform's text
  density (see platforms.py) so the same template reads cleaner on Amazon and
  busier on 淘宝/拼多多.
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
    {"id": "trust", "name": "信任卖点"},
    {"id": "creative", "name": "创意拓展"},
]


def _t(
    id: str,
    name: str,
    en: str,
    category: str,
    aspect: str,
    text_level: str,
    guidance: str,
) -> Dict[str, Any]:
    return {
        "id": id,
        "name": name,
        "en": en,
        "category": category,
        "aspectRatio": aspect,
        "textLevel": text_level,
        # Backwards-compatible flag: any on-image text at all.
        "hasText": text_level != "none",
        "example": f"examples/{id}.jpg",
        "guidance": guidance,
    }


TEMPLATES: List[Dict[str, Any]] = [
    # ---------------------------- 基础主图 ---------------------------- #
    _t(
        "white_background", "白底主图", "White Background Main", "main",
        "1024x1024", "none",
        "Clean pure white (#FFFFFF) seamless background, product perfectly "
        "centered filling ~85% of the frame, soft even studio lighting, subtle "
        "natural contact shadow, razor sharp focus, no props, absolutely no "
        "text, high-resolution e-commerce main listing image.",
    ),
    _t(
        "multi_angle", "多角度展示", "Multi-angle Display", "main",
        "1024x1024", "none",
        "Several views of the same product (front, side, back, three-quarter) "
        "arranged neatly on a light neutral background, consistent lighting and "
        "scale, clean product-catalog display style, no text.",
    ),
    _t(
        "floating_hero", "悬浮主图", "Floating Hero", "main",
        "1024x1024", "none",
        "Product floating / levitating against a smooth soft-gradient studio "
        "background, dynamic subtle shadow beneath, premium hero product shot, "
        "crisp lighting, no text.",
    ),
    _t(
        "transparent_cutout", "透明去背图", "Transparent Cutout", "main",
        "1024x1024", "none",
        "Product cleanly cut out on a plain white background ready for "
        "background removal, sharp clean edges, even lighting, catalog cutout "
        "style, no shadow clutter, no text.",
    ),
    # ---------------------------- 场景生活 ---------------------------- #
    _t(
        "lifestyle_scene", "场景生活图", "Lifestyle Scene", "scene",
        "1024x1024", "none",
        "Product placed in a realistic aspirational lifestyle scene matching "
        "its use case, natural environment, warm ambient light, shallow depth "
        "of field, cozy premium editorial atmosphere, no text.",
    ),
    _t(
        "in_use_scene", "使用场景图", "In-use Scene", "scene",
        "1024x1024", "none",
        "The product actively being used in its natural context, hands or "
        "environment interacting with it, authentic candid feel, natural "
        "lighting, storytelling composition, no text.",
    ),
    _t(
        "outdoor_scene", "户外场景图", "Outdoor Scene", "scene",
        "1024x1024", "none",
        "Product in an appealing outdoor setting relevant to its use, natural "
        "daylight, depth and atmosphere, lifestyle travel mood, no text.",
    ),
    _t(
        "flat_lay", "平铺俯拍图", "Flat Lay", "scene",
        "1024x1024", "none",
        "Top-down flat lay of the product with complementary accessories styled "
        "around it, neat symmetrical composition, soft diffused overhead light, "
        "trendy neutral surface, editorial flat-lay style, no text.",
    ),
    # ---------------------------- 模特实拍 ---------------------------- #
    _t(
        "model_shot", "模特展示图", "Model / In-use Shot", "model",
        "1024x1536", "none",
        "An attractive model naturally using or wearing the product, "
        "professional fashion e-commerce photography, flattering lighting, "
        "clean stylish background, three-quarter or full body composition, "
        "no text.",
    ),
    _t(
        "closeup_model", "模特特写图", "Model Close-up", "model",
        "1024x1536", "none",
        "Close-up of a model showcasing the product on the relevant body area "
        "(wrist, face, hands, ears...), soft beauty lighting, premium skin "
        "detail, aspirational, no text.",
    ),
    _t(
        "vertical_lifestyle", "竖版场景图", "Vertical Lifestyle", "model",
        "1024x1536", "none",
        "Vertical 9:16 lifestyle / short-video style shot of the product in an "
        "engaging scene, social-commerce aesthetic (TikTok / Reels), dynamic "
        "framing, vibrant but natural, no text.",
    ),
    # ---------------------------- 细节参数 ---------------------------- #
    _t(
        "detail_closeup", "细节特写图", "Detail Close-up", "detail",
        "1024x1024", "none",
        "Extreme macro close-up highlighting material, texture, stitching or "
        "craftsmanship, dramatic focused lighting, blurred background, premium "
        "quality feel, no text.",
    ),
    _t(
        "material_texture", "材质纹理图", "Material Texture", "detail",
        "1024x1024", "none",
        "Rich close-up emphasising the surface material and finish of the "
        "product, tactile texture, controlled reflections, premium studio "
        "lighting, no text.",
    ),
    _t(
        "size_reference", "尺寸对比图", "Size Reference", "detail",
        "1024x1024", "light",
        "Product shown next to a common reference object or a ruler / dimension "
        "lines to convey real-world scale, clean neutral background, a few "
        "tasteful on-image dimension labels only.",
    ),
    _t(
        "dimension_infographic", "尺寸参数图", "Dimension Infographic", "detail",
        "1024x1024", "rich",
        "Technical dimension infographic: product on a clean background with "
        "precise measurement lines, arrows and numeric size labels for every "
        "dimension, modern minimal spec-sheet layout with clear on-image text.",
    ),
    _t(
        "param_table", "参数规格表", "Spec Table", "detail",
        "1024x1024", "rich",
        "Product spec sheet: hero product beside a neatly organised table / grid "
        "of key specifications (material, capacity, weight, dimensions, power...) "
        "with row labels and values as legible on-image text, clean modern "
        "data-sheet layout.",
    ),
    _t(
        "exploded_view", "结构分解图", "Exploded View", "detail",
        "1024x1024", "light",
        "Exploded / breakdown view showing the product's separate parts and "
        "structure floating apart in order, thin connector lines, a few short "
        "part labels only, clean technical illustration style.",
    ),
    # ---------------------------- 营销卖点 ---------------------------- #
    _t(
        "feature_infographic", "卖点信息图", "Feature Infographic", "marketing",
        "1024x1024", "rich",
        "Marketing infographic: product as hero with several callout lines and "
        "icons pointing to key selling points, short punchy benefit headlines "
        "as clear on-image text, modern clean layout, high-converting listing "
        "style.",
    ),
    _t(
        "benefit_banner", "卖点大字图", "Benefit Banner", "marketing",
        "1024x1024", "light",
        "Bold benefit banner: product with one strong headline selling point in "
        "large legible on-image typography, vibrant brand-color background, "
        "eye-catching marketing composition.",
    ),
    _t(
        "comparison", "对比图", "Comparison / Before-After", "marketing",
        "1024x1024", "rich",
        "Split before/after or us-vs-them comparison layout showing the "
        "product's advantage, clear dividing line, labelled sides with multiple "
        "concise on-image comparison points, persuasive marketing style.",
    ),
    _t(
        "how_to_use", "使用步骤图", "How-to-use Steps", "marketing",
        "1024x1024", "rich",
        "Numbered step-by-step usage guide, 3-4 sequential panels showing how "
        "to use the product, simple icons and short on-image step captions, "
        "clean instructional layout.",
    ),
    _t(
        "promo_poster", "促销海报图", "Promo Poster", "marketing",
        "1024x1536", "rich",
        "Eye-catching promotional poster with the product as hero, bold vibrant "
        "background, dynamic lighting, sale-campaign energy, prominent on-image "
        "promotional headline, price / discount copy and call-to-action.",
    ),
    _t(
        "scene_selling", "场景卖点图", "Scene + Selling Point", "marketing",
        "1024x1024", "light",
        "Lifestyle scene of the product in use with one short overlaid selling "
        "point headline, aspirational photography with a single tasteful text "
        "caption, editorial ad style.",
    ),
    # ---------------------------- 信任卖点 ---------------------------- #
    _t(
        "certification", "资质认证图", "Certification / Trust Badges", "trust",
        "1024x1024", "rich",
        "Trust-building graphic: product with a row of certification / quality "
        "badges and icons (e.g. quality tested, food-grade, warranty) plus short "
        "on-image labels for each, clean reassuring layout, professional look.",
    ),
    _t(
        "guarantee", "服务保障图", "Service Guarantee", "trust",
        "1024x1024", "rich",
        "After-sales service graphic: product with several icons and short "
        "on-image labels for guarantees (free shipping, easy returns, warranty, "
        "customer support), clean trustworthy layout in the store's accent "
        "color.",
    ),
    _t(
        "brand_story", "品牌故事图", "Brand Story", "trust",
        "1024x1024", "light",
        "Premium brand-story image: product beautifully staged with a short "
        "emotive brand tagline as tasteful on-image text, editorial atmospheric "
        "lighting, aspirational mood.",
    ),
    _t(
        "review_highlight", "好评展示图", "Review Highlight", "trust",
        "1024x1024", "rich",
        "Social-proof graphic: product with star ratings and a couple of short "
        "quoted customer review snippets as on-image text bubbles, friendly "
        "clean layout that builds confidence.",
    ),
    # ---------------------------- 创意拓展 ---------------------------- #
    _t(
        "color_variants", "多色SKU图", "Color Variants", "creative",
        "1024x1024", "none",
        "The same product shown in several color variants lined up neatly, "
        "consistent lighting and angle, clean neutral background, SKU showcase "
        "style, no text.",
    ),
    _t(
        "packaging", "包装展示图", "Packaging Shot", "creative",
        "1024x1024", "none",
        "Attractive shot of the product together with its retail packaging / "
        "box, premium unboxing feel, clean studio background, soft lighting, "
        "no text.",
    ),
    _t(
        "bundle", "套装组合图", "Bundle / Set", "creative",
        "1024x1024", "none",
        "All items of the product set / bundle arranged together in an "
        "organised premium composition, consistent lighting, neutral clean "
        "background, no text.",
    ),
    _t(
        "creative_splash", "创意氛围图", "Creative Splash", "creative",
        "1024x1024", "none",
        "Bold creative concept shot: product surrounded by dynamic elements "
        "(splashes, ingredients, light rays, particles) relevant to its "
        "benefit, dramatic artistic lighting, advertising campaign feel, "
        "no text.",
    ),
]

TEMPLATE_BY_ID: Dict[str, Dict[str, Any]] = {t["id"]: t for t in TEMPLATES}

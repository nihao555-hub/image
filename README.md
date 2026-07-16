# AI 电商套图生成器 (AI E-commerce Image Set Generator)

上传商品图片，选择需要的电商套图类型，填写参数（或让 AI 一键生成完整提示词），即可批量生成整套精美电商图。

- **图片生成模型**：`gpt-image-2`（grsai API）
- **文案 / 提示词模型**：`gemini-3.1-flash-lite`（grsai API）
- **前端**：React + Vite + TypeScript
- **后端**：FastAPI

## 功能

- 上传商品参考图（作为 `gpt-image-2` 的 reference，通过 base64 传入）
- 右侧勾选套图类型：白底主图、场景生活图、模特展示图、细节特写、卖点信息图、促销海报、多角度展示、平铺俯拍
- 左侧填写商品参数（名称/类目/风格/背景/其他要求）
- **AI 生成完整提示词**：调用 LLM 为每种套图类型生成详细英文提示词，可再手动编辑
- **批量生成**：可添加多个商品，每个商品有独立图片、参数与提示词，一次性生成所有 `商品 × 套图类型`
- 结果实时轮询进度，展示并可下载

## 目录结构

```
backend/    FastAPI 服务，封装 grsai 的图像生成与对话接口
frontend/   React 前端
```

## 运行

### 1. 后端

```bash
cd backend
uv venv .venv && source .venv/bin/activate   # 或 python -m venv .venv
uv pip install -e .                            # 或 pip install -e .
export GRSAI_API_KEY=你的key                    # 见 .env.example
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 2. 前端

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (已配置 /api 代理到 :8000)
```

生产构建：`npm run build`，产物在 `frontend/dist`。

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `GRSAI_API_KEY` | grsai API key（必填） | — |
| `GRSAI_BASE_URL` | API Host | `https://grsaiapi.com` |
| `GRSAI_IMAGE_MODEL` | 图像模型 | `gpt-image-2` |
| `GRSAI_LLM_MODEL` | 对话模型 | `gemini-3.1-flash-lite` |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/templates` | 套图类型列表 |
| POST | `/api/generate-prompts` | LLM 为选中套图类型生成提示词 |
| POST | `/api/generate` | 提交生成任务，返回 task id 列表 |
| POST | `/api/result` | 轮询任务结果 |
| POST | `/api/image-sets/generate` | 上传提示词、参考图及选项，一次提交整套图片任务 |
| POST | `/api/image-sets/result` | 轮询整套图片任务结果 |

### 公网套图生成 API

`POST /api/image-sets/generate` 使用 `multipart/form-data`。除健康检查、注册和登录外，API 请求均需使用登录返回的会话令牌或永久 API Key：

```http
Authorization: Bearer sk-tj-...
```

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `prompt` | 是 | — | 商品描述、卖点及整体生成要求 |
| `image` | 否 | — | JPEG、PNG 或 WebP 商品参考图，默认最大 10 MB |
| `template_ids` | 否 | 平台推荐套图 | JSON 字符串数组或逗号分隔的模板 ID |
| `platform` | 否 | `custom` | 平台 ID；可通过 `GET /api/platforms` 查询 |
| `language` | 否 | 平台默认值 | 图片中文字语言 |
| `density` | 否 | 平台默认值 | `clean`、`balanced` 或 `rich` |
| `quality` | 否 | `high` | `auto`、`low`、`medium` 或 `high` |
| `aspect_ratio` | 否 | 平台及模板默认值 | `1024x1024`、`1024x1536` 或 `1536x1024` |
| `auto_prompts` | 否 | `true` | 是否让 LLM 为每种套图扩写独立提示词 |
| `label` | 否 | `API 套图` | 返回任务的商品标签 |

```bash
curl -X POST http://81.69.255.11/ecom-image-api/api/image-sets/generate \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -F 'prompt=一款轻量防水通勤双肩包，突出大容量和电脑保护层' \
  -F 'image=@./product.png' \
  -F 'platform=amazon' \
  -F 'template_ids=["white_background","feature_infographic","lifestyle_scene"]' \
  -F 'language=en' \
  -F 'density=clean' \
  -F 'quality=high'
```

响应会返回每张图的 `task_id`、最终使用的提示词和套图类型。使用任务 ID 轮询：

```bash
curl -X POST http://81.69.255.11/ecom-image-api/api/image-sets/result \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"ids":["task-id-1","task-id-2"]}'
```

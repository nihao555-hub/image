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

## 产品介绍与使用说明

- [图匠 AI 图片工作台：工具案例与使用说明](docs/图匠AI图片工作台-工具案例与使用说明.md)

## 目录结构

```
backend/    FastAPI 服务，封装 grsai 的图像生成与对话接口
frontend/   React 前端
docs/       产品介绍、案例与使用说明
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

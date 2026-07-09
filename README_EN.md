<p align="center">
  <img src="frontend/public/favicon.svg?raw=1" width="80" alt="Decipher" />
</p>
<h1 align="center">Decipher</h1>
<p align="center">
  <strong>AI Video Content Workbench — Analyze Hits · Replicate Structure · Generate at Scale</strong>
</p>
<p align="center">
  <a href="https://github.com/peipeijiang/decipher/releases"><img src="https://img.shields.io/badge/macOS-DMG-blue" alt="macOS"></a>
  <a href="https://github.com/peipeijiang/decipher/releases"><img src="https://img.shields.io/github/v/release/peipeijiang/decipher" alt="release"></a>
  &nbsp;·&nbsp;
  <a href="README.md">🇨🇳 中文</a> · <a href="README_EN.md">🇬🇧 English</a>
</p>

---

## Feature Map

<table>
<tr>
  <td width="25%" align="center"><b>🔍 Viral Replication</b><br><sub>TikTok → Strategy · Shots · Prompt</sub></td>
  <td width="25%" align="center"><b>📦 Product Video</b><br><sub>Product URL → Docs → AIGC Scripts</sub></td>
  <td width="25%" align="center"><b>🧠 Agent Workflow</b><br><sub>Custom Prompt Templates → Pipeline</sub></td>
  <td width="25%" align="center"><b>🎬 Video Generation</b><br><sub>Multi-Model · One-Click Batch</sub></td>
</tr>
</table>

---

### Viral Replication

> Upload a viral TikTok. AI analyzes why it worked — marketing strategy, shot-by-shot breakdown, reverse-engineered prompt. Then auto-generates 10 creative variants you can test with your own product.

| Workbench | Analysis Report |
|:---:|:---:|
| ![Workbench](docs/screenshots/02-workbench.png?raw=1) | ![Analysis](docs/screenshots/03-replica-analysis.png?raw=1) |

| Creative Variants | Storyboard |
|:---:|:---:|
| ![Creative](https://github.com/peipeijiang/decipher/blob/main/docs/screenshots/04b-creative-v2.png?raw=true) | ![Storyboard](https://github.com/peipeijiang/decipher/blob/main/docs/screenshots/04-storyboard-v2.png?raw=true) |

#### Deconstruct → Replicate → Generate

**Step 1 — Deconstruct**: Upload → Whisper transcription → adaptive frame extraction → multi-model analysis → **marketing strategy + shot timeline + reverse prompt**

**Step 2 — Replicate**: AI extracts core formula → generates **10 variants** (title · hook visual · opening line · shot sequence · emotional curve), preserving the viral structure while swapping scene/product/emotion.

**Step 3 — Generate**: Select variants → pick model → one-click batch video generation. Storyboard auto-injects as reference image.

---

### Product Video

> Paste a 1688 / Shopify / any e-commerce URL. AI scrapes product info, builds a structured product document, and generates 10 TikTok video script variants. Hook directly into video generation.

![Product](docs/screenshots/06-product-video-v2.png?raw=1)

1. **Link Scraping** — auto-extract title, price, images, selling points
2. **Product Document** — AI-structured cognition: use cases, target audience, benefit ranking
3. **Script Generation** — 10 variants with hook, shots, copy, BGM
4. **Video Output** — select scripts → choose model → batch generate

---

### Agent Workflow

> Custom prompt templates, composable analysis pipeline. Every node is a configurable agent — swap the model, edit the prompt, define I/O independently.

![Agent Workflow](docs/screenshots/07-agent-workflow-v2.png?raw=1)

#### Built-in Agents

| Agent | Role | Input | Output |
|-------|------|-------|--------|
| Marketing Strategy | Video type · conversion logic · user psychology | Frames + transcript | Strategy report |
| Shot Analysis | Shot type · rhythm · visual elements | Frames + timeline | Shot JSON |
| Reverse Prompt | Reconstruct filming instructions | Strategy + shots | AIGC Prompt |
| Creative Rewrite | Batch variant generation | Core formula + reverse prompt | 10 variants |
| Storyboard | Extract key frames → grid | Video + shot timestamps | Storyboard image |
| Product Doc | 1688 URL → product cognition | Product URL | Structured JSON |
| Video Script | Product doc → shooting scripts | Product JSON + templates | 10 scripts |

Each agent independently configures **vision model** and **text model** (DeepSeek / MiniMax / OpenAI, etc.).

---

### Video Generation

> The final step: turn ideas into actual videos. Accepts output from Viral Replication and Product Video, submits generation tasks to multiple models in parallel, polls for completion, and serves downloadable results.

![Video Gen](docs/screenshots/08-video-gen.png?raw=1)

#### Two Work Modes

**Pipeline Mode** (recommended)

In Viral Replication or Product Video pages: select variants/scripts → pick model / ratio / duration → click generate. Storyboard panels auto-inject as reference images, keeping product appearance faithful.

**Freeform Mode**

In the Video Generation page, type a prompt directly, optionally upload a reference image, and freely configure model and parameters.

#### Built-in Models

| Model | Engine | Capability | Duration | Ref Image | Best For |
|------|------|------|------|------|------|
| **Omni Flash 10s** | Google Gemini | Image+Prompt → video with audio | 10s | ✅ up to 7 | Scene replication |
| **Seedance 2.0** | ByteDance | Image+Prompt → video | 4–15s | ✅ | Product / UGC |
| **Veo 3.1** | Google | Image-to-Video | 5–8s | ✅ | High-quality shots |
| **HappyHorse** | Alibaba Cloud | Text-to-Video | 3–15s | ❌ | Rapid prototyping |
| **Wan 2.6** | Alibaba Cloud | Text-to-Video | 3–15s | ❌ | Creative exploration |

#### Task Management

- **Queue**: batch submissions auto-queued, no overload
- **Live Status**: pending → generating → completed/failed, auto-polling
- **Download**: videos auto-saved locally, retry failed tasks
- **History**: all records traceable, prompts editable for re-submission

---

### Template Configuration

> Centralized prompt template management: video script templates, image layout templates, hook templates — all version-controlled.

![Templates](docs/screenshots/09-template-config-v2.png?raw=1)

---

### Multi-Model Configuration

Supports **DeepSeek / MiniMax / OpenAI / Claude / Doubao / Zhipu**. Vision and text models independently selectable. API Keys managed online.

![Model Config](docs/screenshots/05-config.png?raw=1)

---

### Architecture

```
Frontend:  React 18 + Vite + TypeScript + TailwindCSS
Backend:   FastAPI + SQLAlchemy + SQLite
Video:     FFmpeg + Whisper (local small)
AI:        DeepSeek / MiniMax / OpenAI / Claude / Doubao / Zhipu
Deploy:    macOS .app (http://127.0.0.1:18888)
```

### Quick Start

**Option 1: macOS App**

Download from [Releases](https://github.com/peipeijiang/decipher/releases) → mount → drag to /Applications → double-click. First run installs dependencies.

**Option 2: From Source**

```bash
git clone https://github.com/peipeijiang/decipher.git
cd backend && cp .env.example .env && pip install -r requirements.txt
uvicorn main:app --port 8000

cd frontend && npm install && npm run dev -- --port 18889
```

---

<p align="center">
  <a href="README.md">🇨🇳 中文</a> · <a href="README_EN.md">🇬🇧 English</a>
</p>

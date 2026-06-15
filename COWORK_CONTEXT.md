# ViralLens - Cowork Context Document

**Last Updated:** 2026-05-06  
**Project Status:** Active Development (Phase 3)  
**Current Focus:** Creative Rewrite Feature + Bug Fixes

---

## 1. Project Overview

**Project Name:** ViralLens (TikTok 爆款视频拆解系统)

**Core Mission:** Help content creators analyze viral TikTok videos, reverse-engineer marketing strategies, decompose cinematography, and generate reusable creative prompts for content replication.

**Target Users:** TikTok creators, MCN agencies, cross-border e-commerce operators

**Core Value Proposition:**
- Upload video → AI analysis (marketing strategy, shot breakdown, reverse prompt engineering) → Creative rewrite generation → New prompt for content replication

---

## 2. Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite + TailwindCSS + React Router |
| **Backend** | Python 3.11 + FastAPI + SQLAlchemy + SQLite |
| **Video Processing** | FFmpeg + ffmpeg-python |
| **Speech Recognition** | Whisper (local small model) |
| **AI Analysis** | Multi-model support (OpenAI, Claude, Doubao, MiniMax, Zhipu, DeepSeek, etc.) |
| **Testing** | Playwright |

---

## 3. Project Structure

```
tiktok-analyzer/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── videos.py          # Video upload, status queries
│   │   │   ├── reports.py         # Analysis results, history
│   │   │   ├── segments.py        # Segment management
│   │   │   ├── creative.py        # Creative rewrite API (NEW)
│   │   │   └── products.py        # Product-related endpoints
│   │   ├── models/
│   │   │   ├── video.py           # Video model
│   │   │   ├── report.py          # Report model
│   │   │   ├── segment.py         # Segment model
│   │   │   ├── creative_prompt.py # Creative prompt history (NEW)
│   │   │   ├── config.py          # Model configuration
│   │   │   └── product.py         # Product model
│   │   ├── ai_models/
│   │   │   ├── base.py            # Base AI model class
│   │   │   ├── openai_model.py    # OpenAI implementation
│   │   │   ├── minimax_model.py   # MiniMax implementation (FIXED)
│   │   │   ├── zhipu_model.py     # Zhipu implementation
│   │   │   └── __init__.py        # Model factory
│   │   ├── services/
│   │   │   ├── video_processor.py # FFmpeg processing
│   │   │   ├── ai_analyzer.py     # Multi-model AI analysis
│   │   │   └── whisper.py         # Whisper speech recognition
│   │   ├── tasks/
│   │   │   └── analysis.py        # Async analysis tasks
│   │   ├── config.py              # Configuration
│   │   └── database.py            # Database setup
│   ├── uploads/                   # Video storage
│   ├── processed/                 # Processing results
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts          # API client
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── layout/
│   │   │   └── ...
│   │   ├── hooks/
│   │   ├── pages/
│   │   │   ├── HomePage.tsx
│   │   │   ├── AnalysisPage.tsx   # Main analysis page (MODIFIED)
│   │   │   └── HistoryPage.tsx
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── CLAUDE.md
├── PRD.md
└── COWORK_CONTEXT.md (this file)
```

---

## 4. Recent Work Summary (2026-05-06)

### 4.1 Feature: Creative Rewrite Tab Enhancement

**What Changed:**
- Renamed "创意Prompt" tab to "创意改写" (Creative Rewrite)
- Added collapsible history section at bottom of Creative Rewrite tab
- History displays as gradient-colored cards with:
  - Gradient dot indicator
  - Description preview
  - Angle count badge
  - Timestamp
  - Expand/collapse button

**Files Modified:**
- `frontend/src/pages/AnalysisPage.tsx` (891 lines)

**New Interfaces Added:**
```typescript
interface CreativeHistoryItem {
  id: string
  description: string
  results: CreativeResult[]
  created_at: string
}
```

**New State Variables:**
- `creativeHistory: CreativeHistoryItem[]`
- `expandedHistoryId: string | null`

**UI Components:**
- History cards with gradient backgrounds (5 color schemes)
- Collapsible card list with smooth animations
- Badge showing angle count per history item

---

### 4.2 Bug Fix #1: Foreign Key Error (500 Error)

**Problem:**
- `POST /api/creative/generate` returned HTTP 500 error
- Error: Foreign key constraint violation

**Root Cause:**
- File: `backend/app/models/creative_prompt.py:14`
- Incorrect foreign key reference: `ForeignKey("videos.video_id")`
- Should reference: `ForeignKey("videos.id")`

**Fix Applied:**
```python
# BEFORE (Line 14)
video_id = Column(String, ForeignKey("videos.video_id"), nullable=True, index=True)

# AFTER (Line 14)
video_id = Column(String, ForeignKey("videos.id"), nullable=True, index=True)
```

**Impact:** Creative prompt generation now works without database errors

---

### 4.3 Bug Fix #2: Only First Angle Has Video Prompt

**Problem:**
- Generated 5 creative angles
- Only angle #1 had a video prompt
- Angles #2-5 had empty prompts

**Root Cause:**
- MiniMax API rate limiting (HTTP 529 error)
- Retry wait time too short (5 seconds)
- Subsequent requests failed silently

**Fix Applied:**

**File 1:** `backend/app/ai_models/minimax_model.py:61`
```python
# BEFORE
wait = (2 ** attempt) * (5 if e.code == 529 else 1)

# AFTER
wait = (2 ** attempt) * (30 if e.code == 529 else 1)
```
Changed 529 retry wait from 5s to 30s

**File 2:** `backend/app/api/creative.py:132-133`
```python
# ADDED: 2-second delay between requests
if i < len(angles) - 1:
    time.sleep(2)
```

**File 3:** `backend/app/ai_models/minimax_model.py:62`
```python
# CHANGED: Log level from warning to error for better visibility
logger.error("MiniMax %s error, retry %d/3 in %ds", e.code, attempt + 1, wait)
```

**Impact:** All 5 creative angles now generate prompts successfully

---

## 5. API Endpoints

### Creative Rewrite API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/creative/generate` | Generate creative angles + video prompts |
| GET | `/api/creative/history` | List creative history (with optional video_id filter) |
| DELETE | `/api/creative/history/{item_id}` | Delete history item |

### Request/Response Examples

**POST /api/creative/generate**
```
Content-Type: multipart/form-data

Parameters:
- description (string, required): Product description
- image (file, optional): Product image
- count (int, default: 5): Number of angles to generate (1-10)
- style (string, default: "general"): Style preset (general/ugc/professional/lifestyle)
- video_id (string, optional): Associated video ID

Response:
{
  "id": "uuid-string",
  "results": [
    {
      "angle": {
        "index": 1,
        "title": "Angle title",
        "hook_visual": "Visual hook description",
        "hook_copy": "Copy hook (dialogue)",
        "concept": "Video concept and shooting approach",
        "why": "Why this angle fits the product"
      },
      "prompt": "[Title] ... [Style] ... [Prose] ... [Cinematography] ... [Lighting] ... [Actions] ... [Audio] ..."
    }
  ]
}
```

**GET /api/creative/history?video_id=xxx**
```
Response:
[
  {
    "id": "uuid-string",
    "description": "Product description",
    "results": [...],
    "video_id": "video-uuid or null",
    "created_at": "2026-05-06T10:30:00"
  }
]
```

---

## 6. Data Models

### CreativePrompt Table

| Field | Type | Description |
|-------|------|-------------|
| id | String (PK) | Unique identifier |
| description | Text | Product description |
| image_path | String | Optional uploaded image path |
| results | Text | JSON string of angles + prompts |
| video_id | String (FK) | Associated video ID (nullable) |
| created_at | DateTime | Creation timestamp |

**Foreign Key:** `video_id` → `videos.id`

---

## 7. Frontend Components

### AnalysisPage.tsx Structure

**Key Sections:**
1. **Progress Bar** - 4-step status indicator
2. **Left Panel** - Video player + segment selector + video info
3. **Right Panel** - Analysis tabs (4 tabs)
   - Tab 0: Marketing Strategy
   - Tab 1: Shot Breakdown
   - Tab 2: Reverse Prompt
   - Tab 3: Creative Rewrite (with history)

**Creative Rewrite Tab Features:**
- Product image upload area
- Generate button
- Results display (5 creative angles)
- **NEW:** Collapsible history section at bottom
  - Shows past creative generations
  - Gradient-colored cards
  - Expandable to show full results

**Color Scheme for History Cards:**
```typescript
const CARD_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-700', badge: 'bg-blue-500', tag: 'bg-blue-100 text-blue-700' },
  { bg: 'bg-purple-50', border: 'border-purple-200', title: 'text-purple-700', badge: 'bg-purple-500', tag: 'bg-purple-100 text-purple-700' },
  { bg: 'bg-green-50', border: 'border-green-200', title: 'text-green-700', badge: 'bg-green-500', tag: 'bg-green-100 text-green-700' },
  { bg: 'bg-orange-50', border: 'border-orange-200', title: 'text-orange-700', badge: 'bg-orange-500', tag: 'bg-orange-100 text-orange-700' },
  { bg: 'bg-pink-50', border: 'border-pink-200', title: 'text-pink-700', badge: 'bg-pink-500', tag: 'bg-pink-100 text-pink-700' },
]
```

---

## 8. AI Model Configuration

### Supported Models

**Vision Analysis Models:**
- OpenAI (GPT-4V)
- Claude (Claude 3.5 Sonnet)
- Doubao 2.0
- Zhipu (GLM-4V)
- DeepSeek

**Text Analysis Models:**
- OpenAI (GPT-4)
- Claude (Claude 3.5 Sonnet)
- MiniMax (MiniMax-M2.7)
- Doubao 2.0
- Zhipu (GLM-4)
- DeepSeek

### MiniMax Model Details

**Endpoint:** `https://api.minimaxi.com/anthropic`

**Features:**
- Anthropic API-compatible endpoint
- No vision support (text-only)
- Rate limiting: HTTP 529 errors
- Retry strategy: Exponential backoff with 30s wait for 529 errors

**Key Methods:**
- `chat(system_prompt, user_msg, max_tokens)` - Direct chat
- `analyze_text(text, task)` - Task-based text analysis

---

## 9. Known Issues & Limitations

### Current Issues

1. **MiniMax Rate Limiting**
   - Status: FIXED (2026-05-06)
   - Issue: HTTP 529 errors when generating multiple prompts
   - Solution: Increased retry wait to 30s, added 2s inter-request delay
   - Monitoring: Check logs for "MiniMax 529 error" messages

2. **Foreign Key Constraint**
   - Status: FIXED (2026-05-06)
   - Issue: Creative prompt generation returned 500 error
   - Solution: Corrected foreign key reference from `videos.video_id` to `videos.id`

### Limitations

- MiniMax does not support vision analysis (text-only)
- Whisper small model may have accuracy issues with background noise
- SQLite not suitable for production (use PostgreSQL for scaling)
- Video processing limited to 500MB files

---

## 10. Development Workflow

### Starting the Project

**Backend:**
```bash
cd /Users/shane/projects/tiktok-analyzer/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in API keys
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd /Users/shane/projects/tiktok-analyzer/frontend
npm install
cp .env.example .env
npm run dev -- --port 3000
```

### Testing Creative Rewrite Feature

**Manual Test Flow:**
1. Navigate to Analysis page
2. Upload a video (or use existing)
3. Go to "Creative Rewrite" tab
4. Enter product description
5. (Optional) Upload product image
6. Select style (general/ugc/professional/lifestyle)
7. Click "Generate"
8. Verify all 5 angles have prompts
9. Check history section at bottom

**Expected Behavior:**
- Generation takes 30-60 seconds (due to rate limiting)
- All 5 angles should have non-empty prompts
- History cards appear with gradient colors
- Clicking history card expands to show full results

---

## 11. Code Quality Standards

### Python
- Black formatter
- isort for imports
- Type hints required
- Error handling mandatory

### TypeScript/React
- ESLint + Prettier
- Strict mode enabled
- Component files <800 lines
- Immutable state patterns

### Git Commits
- Format: `feat: description` or `fix: description`
- One feature per commit
- Descriptive messages

---

## 12. How to Continue Development

### Next Steps (Priority Order)

1. **Verify Bug Fixes**
   - Test creative generation with 5+ angles
   - Confirm all prompts are populated
   - Monitor MiniMax API logs for 529 errors

2. **Enhance Creative History**
   - Add filtering by date range
   - Add search by description
   - Add export to CSV/JSON
   - Add duplicate detection

3. **Improve Prompt Quality**
   - Add prompt refinement endpoint
   - Add user feedback mechanism
   - A/B test different prompt templates

4. **Performance Optimization**
   - Cache model responses
   - Implement request batching
   - Add async processing for large batches

5. **Testing**
   - Add Playwright E2E tests for creative flow
   - Add unit tests for prompt parsing
   - Add integration tests for API endpoints

### Common Tasks

**Adding a New AI Model:**
1. Create `backend/app/ai_models/new_model.py`
2. Inherit from `AIModel` base class
3. Implement `analyze_frames()` and `analyze_text()`
4. Register in `backend/app/ai_models/__init__.py`
5. Update `ModelConfig` table

**Debugging API Issues:**
1. Check backend logs: `tail -f backend/logs/app.log`
2. Check frontend network tab in DevTools
3. Verify API key configuration in database
4. Test endpoint with curl:
   ```bash
   curl -X POST http://localhost:8000/api/creative/generate \
     -F "description=My product" \
     -F "count=3"
   ```

**Fixing Frontend Issues:**
1. Check React DevTools for state
2. Verify API response in Network tab
3. Check console for TypeScript errors
4. Run `npm run build` to catch build errors

---

## 13. Important Files Reference

| File | Purpose | Last Modified |
|------|---------|---------------|
| `backend/app/api/creative.py` | Creative rewrite API | 2026-05-06 |
| `backend/app/models/creative_prompt.py` | Creative prompt model | 2026-05-06 |
| `backend/app/ai_models/minimax_model.py` | MiniMax implementation | 2026-05-06 |
| `frontend/src/pages/AnalysisPage.tsx` | Main analysis UI | 2026-05-06 |
| `backend/app/database.py` | Database configuration | 2026-04-30 |
| `backend/app/config.py` | App configuration | 2026-04-29 |
| `PRD.md` | Product requirements | 2026-04-15 |
| `CLAUDE.md` | Project guidelines | 2026-04-20 |

---

## 14. Environment Variables

**Backend (.env):**
```
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
MINIMAX_API_KEY=...
MINIMAX_ENDPOINT=https://api.minimaxi.com/anthropic
ZHIPU_API_KEY=...
DEEPSEEK_API_KEY=...
DATABASE_URL=sqlite:///./app.db
```

**Frontend (.env):**
```
VITE_API_BASE_URL=http://localhost:8000
```

---

## 15. Troubleshooting Guide

### Issue: "MiniMax API error 529"
**Solution:** Already fixed. If still occurring:
1. Check `minimax_model.py` line 61 has `wait = 30`
2. Check `creative.py` line 132-133 has `time.sleep(2)`
3. Verify API key is valid
4. Check rate limit quota in MiniMax dashboard

### Issue: "Foreign key constraint failed"
**Solution:** Already fixed. If still occurring:
1. Verify `creative_prompt.py` line 14 references `videos.id`
2. Run database migration: `alembic upgrade head`
3. Clear database and reinitialize if needed

### Issue: "Only first angle has prompt"
**Solution:** Already fixed. If still occurring:
1. Check logs for HTTP 529 errors
2. Verify 30s retry wait is in place
3. Check 2s inter-request delay is active
4. Monitor MiniMax API quota

### Issue: Frontend not connecting to backend
**Solution:**
1. Verify backend running on port 8000
2. Check CORS configuration in `main.py`
3. Verify `VITE_API_BASE_URL` in frontend `.env`
4. Check browser console for CORS errors

---

## 16. Contact & Support

**Project Lead:** Shane  
**Last Updated:** 2026-05-06  
**Status:** Active Development

For questions about:
- **Architecture:** See `PRD.md` section 3
- **API Design:** See `PRD.md` section 3.5
- **Data Models:** See `PRD.md` section 3.6
- **Development Guidelines:** See `CLAUDE.md`

---

**End of Cowork Context Document**

# Decipher / TikTok Analyzer

Decipher is a short-video analysis and AIGC operations project. It combines a frontend workbench, backend analysis tasks, AI model adapters, product/storyboard data models, and video generation workflows.

## Contents

- `frontend/`: React/Vite frontend for analysis, creative workflow, product pages, and configuration.
- `backend/`: Python backend with API, service, model, task, schema, and AI model modules.
- `docs/`: development notes, design plans, and workflow documentation.
- `.agents/` and `.claude/`: local AI collaboration assets and skills used during development.

## Safety Notes

This repository is prepared as a sanitized upload package. Runtime databases, generated videos, uploaded files, caches, credentials, logs, and environment files are intentionally excluded. Any `sk-...` style keys found in local docs were redacted before packaging.

## Typical Local Development

Install dependencies in `frontend/` and `backend/` according to the project environment, then run the frontend and backend services separately.


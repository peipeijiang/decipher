#!/bin/bash

# TikTok Analyzer - 前端启动脚本

echo "🚀 启动 TikTok Analyzer 前端服务..."

cd "$(dirname "$0")/frontend"

# 检查node_modules
if [ ! -d node_modules ]; then
    echo "📥 安装依赖..."
    npm install
fi

# 启动服务
echo "✨ 启动前端服务 (端口 3000)..."
npm run dev -- --port 3000

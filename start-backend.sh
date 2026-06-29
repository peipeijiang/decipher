#!/bin/bash

# TikTok Analyzer - 后端启动脚本

echo "🚀 启动 TikTok Analyzer 后端服务..."

cd "$(dirname "$0")/backend"

# 检查.env文件
if [ ! -f .env ]; then
    echo "⚠️  .env 文件不存在，从 .env.example 复制..."
    cp .env.example .env
    echo "✅ 已创建 .env 文件，请填入你的 API Keys"
    echo "📝 编辑文件: backend/.env"
    exit 1
fi

# 检查Python依赖
echo "📦 检查依赖..."
pip list | grep fastapi > /dev/null
if [ $? -ne 0 ]; then
    echo "📥 安装依赖..."
    pip install -r requirements.txt
fi

# 启动服务
echo "✨ 启动后端服务 (端口 8000)..."
uvicorn main:app --reload --port 8000

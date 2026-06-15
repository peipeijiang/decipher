#!/bin/bash

# TikTok Analyzer - 一键启动脚本（同时启动前后端）

echo "🚀 TikTok Analyzer - 一键启动"
echo "================================"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 启动后端（后台运行）
echo "📡 启动后端服务..."
osascript -e "tell app \"Terminal\" to do script \"cd '$SCRIPT_DIR' && bash start-backend.sh\""

# 等待2秒
sleep 2

# 启动前端（后台运行）
echo "🎨 启动前端服务..."
osascript -e "tell app \"Terminal\" to do script \"cd '$SCRIPT_DIR' && bash start-frontend.sh\""

echo ""
echo "✅ 启动完成！"
echo "📱 前端: http://localhost:3000"
echo "🔧 后端: http://localhost:8000"
echo "📚 API文档: http://localhost:8000/docs"
echo ""
echo "💡 提示: 两个新终端窗口已打开"

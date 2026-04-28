/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light Clean Theme - 清新浅色主题
        primary: '#FFFFFF',        // 纯白背景
        secondary: '#F8FAFC',      // 浅灰背景
        accent: '#3B82F6',         // 蓝色强调
        surface: '#F1F5F9',        // 表面色
        text: {
          primary: '#0F172A',      // 深色文字
          secondary: '#475569',    // 次要文字
          muted: '#94A3B8',        // 弱化文字
        },
        status: {
          success: '#10B981',      // 成功绿
          warning: '#F59E0B',      // 警告黄
          error: '#EF4444',        // 错误红
          info: '#3B82F6',         // 信息蓝
        },
      },
      fontFamily: {
        heading: ['Poppins', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
}

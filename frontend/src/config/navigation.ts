export interface NavChild {
  path: string
  label: string
  icon: string
}

export interface NavSection {
  id: string
  label: string
  icon: string
  children: NavChild[]
}

export interface NavItem {
  path: string
  label: string
  icon: string
}

export interface NavConfig {
  main: NavSection[]
  secondary: NavItem[]
}

export const NAV_CONFIG: NavConfig = {
  main: [
    {
      id: 'replica',
      label: '爆款复刻',
      icon: 'Sparkles',
      children: [
        { path: '/replica/new', label: '开始分析', icon: 'Upload' },
        { path: '/replica/history', label: '历史记录', icon: 'History' },
      ],
    },
    {
      id: 'creative',
      label: '创意生成',
      icon: 'PenTool',
      children: [
        { path: '/creative/new', label: '新建创意', icon: 'Wand2' },
        { path: '/creative/history', label: '创意历史', icon: 'Clock3' },
      ],
    },
    {
      id: 'product',
      label: '产品视频',
      icon: 'Clapperboard',
      children: [
        { path: '/product/new', label: '新建项目', icon: 'PlusSquare' },
        { path: '/product/history', label: '产品历史', icon: 'FolderOpen' },
      ],
    },
  ],
  secondary: [
    { path: '/workbench', label: '工作台', icon: 'LayoutGrid' },
    { path: '/config', label: '设置', icon: 'Settings' },
  ],
}

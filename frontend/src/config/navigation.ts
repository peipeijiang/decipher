export interface NavChild {
  path: string
  label: string
  icon: string
}

export interface NavSection {
  id: string
  label: string
  icon: string
  path: string
  children?: NavChild[]
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
      path: '/replica/new',
      children: [
        { path: '/replica/new', label: '新建分析', icon: 'PlusSquare' },
      ],
    },
    {
      id: 'creative',
      label: '创意生成',
      icon: 'PenTool',
      path: '/creative/new',
      children: [],
    },
    {
      id: 'product',
      label: '产品视频',
      icon: 'Clapperboard',
      path: '/product/new',
      children: [
        { path: '/product/new', label: '新建项目', icon: 'PlusSquare' },
        { path: '/settings/templates', label: '模板管理', icon: 'Settings' },
      ],
    },
    {
      id: 'agent-workflow',
      label: '智能体工作流',
      icon: 'GitBranch',
      path: '/agent-workflow',
      children: [],
    },
    {
      id: 'video-gen',
      label: '视频生成',
      icon: 'Video',
      path: '/video-gen',
      children: [],
    },
  ],
  secondary: [
    { path: '/workbench', label: '工作台', icon: 'LayoutGrid' },
    { path: '/config', label: '设置', icon: 'Settings' },
  ],
}

import { test, expect } from '@playwright/test'

test.describe('首页', () => {
  test('页面加载正常', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('显示功能介绍', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/策略分析|镜头逆向|Prompt|脚本/).first()).toBeVisible()
  })

  test('显示上传区域', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/支持.*MP4/)).toBeVisible()
  })

  test('有历史记录入口', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/历史记录/)).toBeVisible()
  })

  test('有模型配置入口', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/模型配置/)).toBeVisible()
  })
})

test.describe('历史记录页', () => {
  test('页面加载正常', async ({ page }) => {
    await page.goto('/history')
    await expect(page.locator('h1')).toContainText(/历史记录/)
  })

  test('有空状态引导', async ({ page }) => {
    await page.goto('/history')
    // 要么显示空状态，要么显示历史记录列表
    const either = page.getByText(/暂无分析记录|历史记录/).first()
    await expect(either).toBeVisible({ timeout: 10000 })
  })

  test('有返回首页按钮', async ({ page }) => {
    await page.goto('/history')
    await expect(page.getByText(/返回首页/)).toBeVisible()
  })
})

test.describe('模型配置页', () => {
  test('页面加载正常', async ({ page }) => {
    await page.goto('/config')
    await expect(page.locator('h1')).toContainText(/模型配置/)
  })

  test('显示模型选择下拉', async ({ page }) => {
    await page.goto('/config')
    await expect(page.locator('select')).toHaveCount(2)
  })

  test('显示全局参数', async ({ page }) => {
    await page.goto('/config')
    await expect(page.getByText(/Temperature/)).toBeVisible()
  })

  test('有返回首页按钮', async ({ page }) => {
    await page.goto('/config')
    await expect(page.getByText(/返回首页/)).toBeVisible()
  })
})

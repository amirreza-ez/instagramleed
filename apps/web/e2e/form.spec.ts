import { expect, test } from '@playwright/test';
test.use({ viewport: { width: 390, height: 844 } });
test('public Instagram form submits a lead', async ({ page }) => {
  await page.goto('/f/mobile-eazazi?src=bio');
  await expect(page.getByText('دریافت لیست قیمت و مشاوره')).toBeVisible();
  await page.screenshot({ path: 'test-results/form-mobile.png' });
  await page.getByLabel('نام و نام خانوادگی *').fill('تست فرم بیو');
  await page.getByLabel('شماره موبایل *').fill('۰۹۱۹۸۸۸۷۷۶۶');
  await page.getByLabel('شهر').fill('کرج');
  await page.getByRole('button', { name: 'ثبت درخواست' }).click();
  await expect(page.getByText('درخواست شما ثبت شد')).toBeVisible();
});

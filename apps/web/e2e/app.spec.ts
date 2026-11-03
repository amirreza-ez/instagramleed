// End-to-end UI test against a running stack (pnpm dev). Uses the system Microsoft Edge.
import { expect, test } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? 'admin@eazazi.ir';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Eazazi@12345';
const uniq = Date.now().toString().slice(-6);

test('login, dashboard, create lead, search, import CSV, logout', async ({ page }) => {
  await page.goto('/#/login');
  await expect(page.getByRole('heading', { name: 'ورود به حساب' })).toBeVisible();

  // wrong password shows a Persian error
  await page.getByLabel('ایمیل').fill(EMAIL);
  await page.getByLabel('رمز عبور').fill('wrong-password');
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('اشتباه');

  await page.getByLabel('رمز عبور').fill(PASSWORD);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(page.getByText('کل سرنخ‌ها')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  // create a lead through the form
  await page.getByRole('button', { name: 'سرنخ جدید' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('نام کسب‌وکار').fill(`فروشگاه تست ${uniq}`);
  await dialog.getByLabel('آیدی اینستاگرام').fill(`@e2e_shop_${uniq}`);
  await dialog.getByLabel('شماره تماس').fill(`0935${uniq}0`);
  await page.getByRole('button', { name: 'ثبت سرنخ' }).click();
  await expect(page.getByText('سرنخ جدید ثبت شد')).toBeVisible();

  // search by username and open the profile
  await page.goto(`/#/leads?q=e2e_shop_${uniq}`);
  await page.getByText(`فروشگاه تست ${uniq}`).click();
  await expect(page.getByRole('heading', { name: `فروشگاه تست ${uniq}` })).toBeVisible();
  await page.getByLabel('متن فعالیت').fill('تماس تلفنی تست خودکار');
  await page.getByRole('button', { name: 'ثبت', exact: true }).click();
  await expect(page.getByText('تماس تلفنی تست خودکار')).toBeVisible();

  // import a CSV with Persian headers
  await page.goto('/#/imports');
  const csv = `نام,موبایل,اینستاگرام,شهر\nواردشده ${uniq},0936${uniq}1,imp_${uniq},قم\n`;
  await page.locator('input[type=file]').setInputFiles({ name: 'leads.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await expect(page.getByText('نگاشت ستون‌ها')).toBeVisible();
  await page.getByRole('button', { name: /شروع ورود/ }).click();
  await expect(page.getByText('ورود فایل کامل شد')).toBeVisible({ timeout: 20_000 });

  // logout
  await page.getByRole('button', { name: 'حساب کاربری' }).click();
  await page.getByRole('button', { name: 'خروج', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ورود به حساب' })).toBeVisible();
});

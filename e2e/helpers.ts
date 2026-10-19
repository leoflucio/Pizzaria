import { expect, type Page, type BrowserContext } from "@playwright/test";

export const PASSWORD = process.env.SEED_PASSWORD ?? "dnapoles123";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("button:has-text('Entrar')");
  await expect(page).toHaveURL(/\/painel\//);
}

export async function staffPage(context: BrowserContext, email: string) {
  const page = await context.newPage();
  await login(page, email);
  return page;
}

/** Customer: delivery address -> store chosen automatically. */
export async function startDelivery(page: Page, neighborhood: string) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.fill("#bairro", neighborhood);
  await page.fill("#rua", "Rua de Teste");
  await page.fill("#numero", "100");
  await page.click("button:has-text('Ver cardápio')");
  await expect(page.getByText("Montar minha pizza")).toBeVisible();
}

export async function addHalfHalf(page: Page, size: string, a: string, b: string, crust?: string) {
  await page.click("text=Montar minha pizza");
  const d = page.locator("[role=dialog]");
  await d.locator(`button:has-text("${size}")`).first().click();
  await d.locator(`button:has-text("${a}")`).first().click();
  await d.locator(`button:has-text("${b}")`).first().click();
  await d.locator("button:has-text('Continuar')").click();
  if (crust) await d.locator(`label:has-text("${crust}")`).click();
  await d.locator("button:has-text('Adicionar ao carrinho')").click();
  await expect(d).toHaveCount(0);
}

export async function checkout(page: Page, payment: "PIX" | "Dinheiro" | "Cartão", name = "Cliente E2E") {
  await page.click("text=Ver carrinho");
  await page.fill("#nome", name);
  await page.fill("#fone", "(83) 99876-5432");
  await page.locator("label", { hasText: payment }).first().click();
  await page.click("button:has-text('Fazer pedido')");
  await expect(page).toHaveURL(/\/pedido\//);
  return (await page.locator("text=/Pedido [A-Z]{3}-\\d{4}/").first().textContent())!.match(/[A-Z]{3}-\d{4}/)![0];
}

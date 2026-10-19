import { test, expect } from "@playwright/test";
import { addHalfHalf, checkout, staffPage, startDelivery } from "./helpers";

test("pedido meio a meio com PIX vai para a loja certa e percorre a cozinha até a entrega", async ({ page, browser }) => {
  await startDelivery(page, "Manaíra");
  await expect(page.getByText("D'Napoles Manaíra")).toBeVisible();
  await addHalfHalf(page, "Grande", "Calabresa", "Frango com Catupiry", "Cheddar");
  // Grande tradicional 55,50 + borda 14,00 (seed)
  await expect(page.getByRole("button", { name: /Ver carrinho/ })).toContainText("R$ 69,50");
  const number = await checkout(page, "PIX");
  expect(number).toMatch(/^MAN-/);

  await expect(page.getByText("Pague com PIX")).toBeVisible();
  await page.click("text=Simular pagamento");
  await expect(page.locator("h1")).toHaveText("Recebido");

  // Atendente de Manaíra vê; atendente do Cristo não.
  const staff = await browser.newContext();
  const att = await staffPage(staff, "atendente.manaira@dnapoles.local");
  const card = att.locator("article", { hasText: number });
  await expect(card).toBeVisible();
  await expect(card).toContainText("1/2 Calabresa");
  await expect(card).toContainText("Borda Cheddar");

  const otherCtx = await browser.newContext();
  const other = await staffPage(otherCtx, "atendente.cristo@dnapoles.local");
  await expect(other.getByRole("heading", { name: /Pedidos · Cristo/ })).toBeVisible();
  await expect(other.locator("article", { hasText: number })).toHaveCount(0);
  await otherCtx.close();

  const [comanda] = await Promise.all([att.waitForEvent("popup"), card.getByRole("button", { name: "Confirmar", exact: true }).click()]);
  await expect(comanda.locator("pre")).toContainText(`PEDIDO ${number}`);
  await comanda.close();

  // Cozinha (mesmo login de atendente tem acesso ao KDS da loja).
  const kds = await staff.newPage();
  await kds.goto("/painel/manaira/cozinha");
  const ticket = kds.locator("article", { hasText: "Calabresa" }).filter({ hasText: number.split("-")[1]! });
  await ticket.getByRole("button", { name: "Pôr no forno" }).click();
  await expect(page.locator("h1")).toHaveText("No forno", { timeout: 10_000 });
  await kds.locator("article", { hasText: number.split("-")[1]! }).getByRole("button", { name: "Pronto" }).click();

  await att.reload();
  await att.locator("article", { hasText: number }).getByRole("button", { name: "Saiu para entrega" }).click();
  await expect(page.locator("h1")).toHaveText("Saiu para entrega", { timeout: 10_000 });
  await att.locator("article", { hasText: number }).getByRole("button", { name: "Entregue" }).click();
  await expect(page.locator("h1")).toHaveText("Entregue", { timeout: 10_000 });
});

test("retirada com dinheiro e troco", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.getByRole("tab", { name: "Retirar na loja" }).click();
  await page.locator("button", { hasText: "D'Napoles Cristo" }).click();
  await page.locator("#cat-" + (await page.locator("section[id^=cat-]", { hasText: "Parmegiana" }).getAttribute("id"))!.slice(4)).locator("button", { hasText: "Parmegiana de Carne" }).click();
  await page.locator("[role=dialog] button:has-text('Adicionar')").click();
  await page.click("text=Ver carrinho");
  await page.fill("#nome", "Cliente Retirada");
  await page.fill("#fone", "83998765432");
  await page.locator("label", { hasText: "Dinheiro" }).click();
  await page.fill("#troco", "50");
  await page.click("button:has-text('Fazer pedido')");
  await expect(page.locator("h1")).toHaveText("Recebido");
  await expect(page.getByText("Retirada em")).toBeVisible();
});

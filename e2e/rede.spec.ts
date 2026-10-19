import { test, expect } from "@playwright/test";
import { login, startDelivery } from "./helpers";

test("bairro atendido por duas lojas vai para a mais rápida, e para a outra quando ela pausa", async ({ page, browser }) => {
  await startDelivery(page, "José Américo");
  await expect(page.getByText("D'Napoles Bancários")).toBeVisible();

  const mgr = await (await browser.newContext()).newPage();
  await login(mgr, "gerente.bancarios@dnapoles.local");
  mgr.once("dialog", (d) => d.accept("Forno em manutenção"));
  await mgr.getByRole("button", { name: /Pausar pedidos/ }).click();
  await expect(mgr.getByRole("button", { name: /Retomar pedidos/ })).toBeVisible();

  await startDelivery(page, "José Américo");
  await expect(page.getByText("D'Napoles Cristo")).toBeVisible();

  await mgr.getByRole("button", { name: /Retomar pedidos/ }).click();
  await expect(mgr.getByRole("button", { name: /Pausar pedidos/ })).toBeVisible();
});

test("atendente não acessa pedidos de outra loja", async ({ page }) => {
  await login(page, "atendente.cristo@dnapoles.local");
  const stores = await (await page.request.get("/api/stores")).json();
  const manaira = stores.stores.find((s: { code: string }) => s.code === "MANAIRA");
  expect((await page.request.get(`/api/staff/orders?storeId=${manaira.id}`)).status()).toBe(403);
  await page.goto("/painel/manaira/pedidos");
  await expect(page.getByText("Você não tem acesso")).toBeVisible();
});

test("dono muda o preço de um item só numa loja e o cardápio da loja reflete", async ({ page, browser }) => {
  await login(page, "dono@dnapoles.local");
  const stores = await (await page.request.get("/api/stores")).json();
  const cristo = stores.stores.find((s: { code: string }) => s.code === "CRISTO");
  await page.goto(`/painel/admin/ajustes/${cristo.id}?tab=produtos`);
  const input = page.getByLabel("Preço nesta loja: Água mineral (Bebidas)");
  await input.fill("6,50");
  await page.click("button:has-text('Salvar ajustes')");
  await expect(page.getByText("Ajustes da loja salvos")).toBeVisible();

  const customer = await (await browser.newContext()).newPage();
  await customer.goto("/");
  await customer.evaluate(() => localStorage.clear());
  await customer.goto("/");
  await customer.getByRole("tab", { name: "Retirar na loja" }).click();
  await customer.locator("button", { hasText: "D'Napoles Cristo" }).click();
  await expect(customer.locator("button", { hasText: "Água mineral" })).toContainText("R$ 6,50");

  // volta ao preço da rede
  await page.getByLabel("Preço nesta loja: Água mineral (Bebidas)").fill("");
  await page.click("button:has-text('Salvar ajustes')");
  await expect(page.getByText("Ajustes da loja salvos")).toBeVisible();
});

test("área de entrega editável: criar bairro novo e excluir", async ({ page }) => {
  await login(page, "gerente.manaira@dnapoles.local");
  const stores = await (await page.request.get("/api/stores")).json();
  const manaira = stores.stores.find((s: { code: string }) => s.code === "MANAIRA");
  await page.goto(`/painel/admin/lojas/${manaira.id}/areas`);
  const form = page.locator("form", { has: page.locator("button:has-text('Criar área')") });
  await form.locator("input[name=name]").fill("Cabedelo teste");
  await form.locator("input[name=fee]").fill("12,00");
  await form.locator("textarea[name=neighborhoods]").fill("Intermares");
  await form.locator("button:has-text('Criar área')").click();
  await expect(page.getByText("Área salva")).toBeVisible();
  const r = await (await page.request.post("/api/routing", { data: { neighborhood: "Intermares" } })).json();
  expect(r.ok && r.chosen.feeCents).toBe(1200);

  const item = page.locator("details", { hasText: "Cabedelo teste" });
  await item.locator("summary").click();
  await item.locator("button:has-text('Excluir área')").click();
  await expect(page.getByText("Área removida")).toBeVisible();
});

test("erro de validação volta para a página com a mensagem", async ({ page }) => {
  await login(page, "dono@dnapoles.local");
  const stores = await (await page.request.get("/api/stores")).json();
  await page.goto(`/painel/admin/lojas/${stores.stores[0].id}`);
  const hours = page.locator("form", { has: page.locator("button:has-text('Salvar horários')") });
  await hours.locator("input[name=o_1_0]").fill("25:99");
  await hours.locator("button:has-text('Salvar horários')").click();
  await expect(page.getByText("Use horários no formato 18:00.")).toBeVisible();
});

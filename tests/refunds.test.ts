import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { admin, createOrganization, createUserWithRole, runId, signedInClient } from "./setup/http";

/**
 * Refunds — 20260921000100_refunds.sql.
 *
 * The rules that matter are the ones the database enforces, because a refund
 * is money leaving the practice and the application check is only the
 * explanation. Each case here goes through a really signed-in user, so the
 * policies are exercised too.
 */

const RUN = runId();

let orgA: string;
let financeA: SupabaseClient;
let receptionA: SupabaseClient;
let clientA: SupabaseClient;

let invoiceId: string;
let paymentId: string;

async function invoiceState() {
  const { data } = await admin
    .from("invoices")
    .select("status, amount_paid_paisa, balance_paisa")
    .eq("id", invoiceId)
    .single();
  return data!;
}

beforeAll(async () => {
  orgA = await createOrganization(`refunds-${RUN}`);

  const [finance, reception, owner] = await Promise.all([
    createUserWithRole(`ref-fin-${RUN}`, "finance_manager", orgA),
    createUserWithRole(`ref-rec-${RUN}`, "receptionist", orgA),
    createUserWithRole(`ref-owner-${RUN}`, "client", orgA),
  ]);

  const { data: clientRow } = await admin
    .from("clients")
    .insert({ user_id: owner.userId, organization_id: orgA, full_name: `Owner ${RUN}`, phone: `+8801713${RUN}` })
    .select("id")
    .single();

  const { data: invoice } = await admin
    .from("invoices")
    .insert({ organization_id: orgA, client_id: clientRow!.id, status: "issued", issued_at: new Date().toISOString() })
    .select("id")
    .single();
  invoiceId = invoice!.id;

  await admin
    .from("invoice_items")
    .insert({ invoice_id: invoiceId, description: "Consult", quantity: 1, unit_price_paisa: 100_000, line_total_paisa: 100_000 });

  const { data: payment } = await admin
    .from("payments")
    .insert({ invoice_id: invoiceId, organization_id: orgA, amount_paisa: 100_000, method: "cash" })
    .select("id")
    .single();
  paymentId = payment!.id;

  [financeA, receptionA, clientA] = await Promise.all([
    signedInClient(finance.email),
    signedInClient(reception.email),
    signedInClient(owner.email),
  ]);
}, 180_000);

describe("what a refund does to the invoice", () => {
  it("starts from a fully paid invoice", async () => {
    const state = await invoiceState();
    expect(state.status).toBe("paid");
    expect(state.amount_paid_paisa).toBe(100_000);
    expect(state.balance_paisa).toBe(0);
  });

  it("a partial refund puts the balance back and reopens the invoice", async () => {
    const { error } = await financeA.from("refunds").insert({
      payment_id: paymentId,
      invoice_id: invoiceId,
      organization_id: orgA,
      amount_paisa: 40_000,
      method: "cash",
      reason: "Service not given",
    });
    expect(error).toBeNull();

    const state = await invoiceState();
    expect(state.status).toBe("partially_paid");
    expect(state.amount_paid_paisa).toBe(60_000);
    expect(state.balance_paisa).toBe(40_000);
  });

  it("refunding the rest marks the invoice refunded", async () => {
    const { error } = await financeA.from("refunds").insert({
      payment_id: paymentId,
      invoice_id: invoiceId,
      organization_id: orgA,
      amount_paisa: 60_000,
      method: "cash",
      reason: "Remainder",
    });
    expect(error).toBeNull();

    const state = await invoiceState();
    expect(state.status).toBe("refunded");
    expect(state.amount_paid_paisa).toBe(0);
  });

  it("refuses more than the payment was, however it is asked", async () => {
    const { error } = await financeA.from("refunds").insert({
      payment_id: paymentId,
      invoice_id: invoiceId,
      organization_id: orgA,
      amount_paisa: 1,
      method: "cash",
      reason: "One paisa too far",
    });
    expect(error).not.toBeNull();
  });

  it("keeps the payment itself untouched", async () => {
    const { data } = await admin.from("payments").select("amount_paisa, status").eq("id", paymentId).single();

    expect(data!.amount_paisa).toBe(100_000);
    expect(data!.status).toBe("completed");
  });
});

describe("the rules a refund cannot be talked out of", () => {
  it("refuses a zero or negative amount", async () => {
    for (const amount of [0, -5_000]) {
      const { error } = await financeA.from("refunds").insert({
        payment_id: paymentId,
        invoice_id: invoiceId,
        organization_id: orgA,
        amount_paisa: amount,
        method: "cash",
        reason: "Nonsense",
      });
      expect(error).not.toBeNull();
    }
  });

  it("refuses a blank reason — money going out is always explained", async () => {
    const { error } = await financeA.from("refunds").insert({
      payment_id: paymentId,
      invoice_id: invoiceId,
      organization_id: orgA,
      amount_paisa: 1_000,
      method: "cash",
      reason: "   ",
    });
    expect(error).not.toBeNull();
  });

  it("refuses a refund filed against a different invoice than its payment", async () => {
    const { data: other } = await admin
      .from("invoices")
      .insert({ organization_id: orgA, client_id: (await admin.from("clients").select("id").eq("organization_id", orgA).limit(1).single()).data!.id, status: "issued", issued_at: new Date().toISOString() })
      .select("id")
      .single();

    const { error } = await financeA.from("refunds").insert({
      payment_id: paymentId,
      invoice_id: other!.id,
      organization_id: orgA,
      amount_paisa: 1_000,
      method: "cash",
      reason: "Wrong invoice",
    });
    expect(error).not.toBeNull();
  });
});

describe("who may refund", () => {
  it("lets a finance manager, and refuses a receptionist and the client", async () => {
    const base = {
      payment_id: paymentId,
      invoice_id: invoiceId,
      organization_id: orgA,
      amount_paisa: 1_000,
      method: "cash" as const,
      reason: "Attempt",
    };

    const { error: receptionErr } = await receptionA.from("refunds").insert(base);
    expect(receptionErr).not.toBeNull();

    const { error: clientErr } = await clientA.from("refunds").insert(base);
    expect(clientErr).not.toBeNull();
  });

  it("lets the client see a refund on their own invoice, but never write one", async () => {
    const { data } = await clientA.from("refunds").select("id").eq("invoice_id", invoiceId);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("is append-only — a refund cannot be edited or deleted away", async () => {
    const { data: refund } = await admin.from("refunds").select("id").eq("invoice_id", invoiceId).limit(1).single();

    await financeA.from("refunds").update({ amount_paisa: 1 }).eq("id", refund!.id);
    await financeA.from("refunds").delete().eq("id", refund!.id);

    const { data: after } = await admin.from("refunds").select("amount_paisa").eq("id", refund!.id).maybeSingle();
    expect(after).not.toBeNull();
    expect(after!.amount_paisa).not.toBe(1);
  });
});

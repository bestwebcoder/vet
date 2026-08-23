import { createClient } from "@/lib/supabase/server";
import type { DateRange } from "@/lib/validation/date-range";

/**
 * Report reads. §8.6 — the permission boundary (admin, or a doctor with
 * can_view_reports) is enforced inside each `security definer` SQL
 * function, not here; a permission failure comes back as a plain RPC error
 * and this file turns it into the same `{status: "error"}` shape every
 * other query module in this codebase already uses, so a page can show the
 * usual explanatory empty state without knowing why the call failed.
 */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type RevenuePoint = { periodStart: string; revenuePaisa: number };

export async function getRevenueSeries(
  organizationId: string,
  range: DateRange,
  granularity: "day" | "week" | "month" = "day",
): Promise<Result<RevenuePoint[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("report_revenue_series", {
    p_organization_id: organizationId,
    p_from: range.from,
    p_to: range.to,
    p_granularity: granularity,
  });

  if (error) {
    console.error("[reports] revenue series failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row: { period_start: string; revenue_paisa: number }) => ({
      periodStart: row.period_start,
      revenuePaisa: row.revenue_paisa,
    })),
  };
}

export type RevenueTotals = {
  outstandingPaisa: number;
  outstandingCount: number;
  paidPaisa: number;
  paidCount: number;
};

export async function getRevenueTotals(organizationId: string, range: DateRange): Promise<Result<RevenueTotals>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("report_revenue_totals", { p_organization_id: organizationId, p_from: range.from, p_to: range.to })
    .single();

  if (error) {
    console.error("[reports] revenue totals failed", error);
    return { status: "error" };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any -- rpc() has no generated return type here */
  const row = data as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    status: "ok",
    data: {
      outstandingPaisa: row.outstanding_paisa,
      outstandingCount: row.outstanding_count,
      paidPaisa: row.paid_paisa,
      paidCount: row.paid_count,
    },
  };
}

export type RevenueByService = { serviceName: string; revenuePaisa: number; quantity: number };

export async function getRevenueByService(organizationId: string, range: DateRange): Promise<Result<RevenueByService[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("report_revenue_by_service", {
    p_organization_id: organizationId,
    p_from: range.from,
    p_to: range.to,
  });

  if (error) {
    console.error("[reports] revenue by service failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row: { service_name: string; revenue_paisa: number; quantity: number }) => ({
      serviceName: row.service_name,
      revenuePaisa: row.revenue_paisa,
      quantity: row.quantity,
    })),
  };
}

export type RevenueByDoctor = { doctorName: string; revenuePaisa: number };

export async function getRevenueByDoctor(organizationId: string, range: DateRange): Promise<Result<RevenueByDoctor[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("report_revenue_by_doctor", {
    p_organization_id: organizationId,
    p_from: range.from,
    p_to: range.to,
  });

  if (error) {
    console.error("[reports] revenue by doctor failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row: { doctor_name: string; revenue_paisa: number }) => ({
      doctorName: row.doctor_name,
      revenuePaisa: row.revenue_paisa,
    })),
  };
}

export type ClinicalSummary = {
  consultations: number;
  vaccinations: number;
  dewormings: number;
  followUps: number;
  emergencies: number;
};

export async function getClinicalSummary(organizationId: string, range: DateRange): Promise<Result<ClinicalSummary>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("report_clinical_summary", { p_organization_id: organizationId, p_from: range.from, p_to: range.to })
    .single();

  if (error) {
    console.error("[reports] clinical summary failed", error);
    return { status: "error" };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any -- rpc() has no generated return type here */
  const row = data as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    status: "ok",
    data: {
      consultations: row.consultations,
      vaccinations: row.vaccinations,
      dewormings: row.dewormings,
      followUps: row.follow_ups,
      emergencies: row.emergencies,
    },
  };
}

export type CommonDiagnosis = { description: string; occurrences: number };

export async function getCommonDiagnoses(
  organizationId: string,
  range: DateRange,
  limit = 10,
): Promise<Result<CommonDiagnosis[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("report_common_diagnoses", {
    p_organization_id: organizationId,
    p_from: range.from,
    p_to: range.to,
    p_limit: limit,
  });

  if (error) {
    console.error("[reports] common diagnoses failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row: { description: string; occurrences: number }) => ({
      description: row.description,
      occurrences: row.occurrences,
    })),
  };
}

export type ClientSummary = { newClients: number; returningClients: number; activeClients: number };

export async function getClientSummary(organizationId: string, range: DateRange): Promise<Result<ClientSummary>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("report_client_summary", { p_organization_id: organizationId, p_from: range.from, p_to: range.to })
    .single();

  if (error) {
    console.error("[reports] client summary failed", error);
    return { status: "error" };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any -- rpc() has no generated return type here */
  const row = data as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    status: "ok",
    data: { newClients: row.new_clients, returningClients: row.returning_clients, activeClients: row.active_clients },
  };
}

export type SpeciesBreakdown = { speciesName: string; count: number };

export async function getPatientSpeciesBreakdown(
  organizationId: string,
  range: DateRange,
): Promise<Result<SpeciesBreakdown[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("report_patient_species_breakdown", {
    p_organization_id: organizationId,
    p_from: range.from,
    p_to: range.to,
  });

  if (error) {
    console.error("[reports] species breakdown failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row: { species_name: string; count: number }) => ({
      speciesName: row.species_name,
      count: row.count,
    })),
  };
}

export type FrequentPatient = { petId: string; petName: string; visitCount: number };

export async function getFrequentPatients(
  organizationId: string,
  range: DateRange,
  limit = 10,
): Promise<Result<FrequentPatient[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("report_frequent_patients", {
    p_organization_id: organizationId,
    p_from: range.from,
    p_to: range.to,
    p_limit: limit,
  });

  if (error) {
    console.error("[reports] frequent patients failed", error);
    return { status: "error" };
  }

  return {
    status: "ok",
    data: (data ?? []).map((row: { pet_id: string; pet_name: string; visit_count: number }) => ({
      petId: row.pet_id,
      petName: row.pet_name,
      visitCount: row.visit_count,
    })),
  };
}
